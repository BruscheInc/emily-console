/**
 * Helpdesk — core.  Shared by the web app (server.js) and the agent (emily.js).
 *
 *  Helpdesk  = the app: your own ticket store, Gmail transport, the inbox UI, the API.
 *  Emily     = the agent inside it: triages, drafts, stages money moves, talks in Slack.
 *
 * This file owns everything both of them need: the database and schema, mailbox and brand
 * resolution, the Gmail transport, the Gorgias history import, sending (reply + new email),
 * attachments, Emily's policy/settings store, and the "new inbound message" hook Emily listens on.
 */
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const { Pool } = require("pg");

const KEY = process.env.CONSOLE_KEY || "";
const G_DOMAIN = process.env.GORGIAS_DOMAIN || "";
const G_AUTH = "Basic " + Buffer.from(`${process.env.GORGIAS_EMAIL}:${process.env.GORGIAS_API_KEY}`).toString("base64");
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const CS_CHANNEL = process.env.CS_CHANNEL || "";
const EMILY_ID = process.env.EMILY_SLACK_ID || "";

/* ---------------- users ---------------- */
function loadUsers() {
  const out = [];
  for (const e of String(process.env.CONSOLE_USERS || "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [name, k] = e.split(":").map((x) => (x || "").trim());
    if (name) out.push({ name, key: k || name });
  }
  return out;
}
const USERS = loadUsers();
/* Accounts live in hd_users (email + password, role admin|agent). A login creates a session token that the app
 * sends as its key; sessions are kept in hd_sessions and mirrored in memory so every request stays synchronous.
 * The old CONSOLE_USERS / CONSOLE_KEY env keys still work and count as admins, so nobody gets locked out. */
const SESSIONS = new Map();     // token -> { name, email, role, user_id, exp }
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
function sessionOf(k) {
  const v = String(k || "").trim();
  if (!v) return null;
  const u = USERS.find((x) => x.key.toLowerCase() === v.toLowerCase());
  if (u) return { name: u.name, email: null, role: "admin", user_id: null };
  if (KEY && v === KEY) return { name: "admin", email: null, role: "admin", user_id: null };
  const s = SESSIONS.get(v);
  if (s && s.exp > Date.now()) return s;
  if (s) SESSIONS.delete(v);
  return null;
}
function userFromKey(k) { const s = sessionOf(k); return s ? s.name : null; }
function hashPassword(pw, salt) { salt = salt || crypto.randomBytes(16).toString("hex"); return { salt, hash: crypto.scryptSync(String(pw), salt, 64).toString("hex") }; }
function checkPassword(pw, salt, hash) { try { const h = crypto.scryptSync(String(pw), salt, 64); const b = Buffer.from(hash, "hex"); return h.length === b.length && crypto.timingSafeEqual(h, b); } catch { return false; } }
const loginFails = new Map();   // email|ip -> { n, until }
async function loadSessions() {
  try { const r = await db(`SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role FROM hd_sessions s JOIN hd_users u ON u.id = s.user_id WHERE s.expires_at > now() AND u.active`);
    for (const x of r.rows) SESSIONS.set(x.token, { name: x.name, email: x.email, role: x.role, user_id: x.id, exp: new Date(x.expires_at).getTime() });
    await db(`DELETE FROM hd_sessions WHERE expires_at < now()`);
  } catch (e) { console.error("sessions:", e.message); }
}
async function login({ email, password, ip }) {
  const e = String(email || "").trim().toLowerCase(); const lockKey = `${e}|${ip || ""}`;
  const f = loginFails.get(lockKey);
  if (f && f.until > Date.now()) throw new Error("Too many attempts — try again in 15 minutes.");
  const u = (await db(`SELECT * FROM hd_users WHERE lower(email)=$1 AND active`, [e])).rows[0];
  if (!u || !checkPassword(password, u.pass_salt, u.pass_hash)) {
    const n = (f && f.last > Date.now() - 3600e3 ? f.n : 0) + 1; loginFails.set(lockKey, { n, last: Date.now(), until: n >= 5 ? Date.now() + 15 * 60e3 : 0 });
    throw new Error("Wrong email or password.");
  }
  loginFails.delete(lockKey);
  const token = crypto.randomBytes(32).toString("hex"); const exp = Date.now() + SESSION_DAYS * 864e5;
  await db(`INSERT INTO hd_sessions (token, user_id, expires_at) VALUES ($1,$2,$3)`, [token, u.id, new Date(exp)]);
  await db(`UPDATE hd_users SET last_login=now() WHERE id=$1`, [u.id]);
  SESSIONS.set(token, { name: u.name, email: u.email, role: u.role, user_id: u.id, exp });
  return { token, user: { name: u.name, email: u.email, role: u.role } };
}
async function logout(token) { SESSIONS.delete(String(token || "")); try { await db(`DELETE FROM hd_sessions WHERE token=$1`, [String(token || "")]); } catch (_) {} }
async function listUsers() { return (await db(`SELECT id, name, email, role, active, created_at, last_login FROM hd_users ORDER BY active DESC, name`)).rows; }
async function createUser({ name, email, password, role, by }) {
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("Enter a valid email address.");
  if (!String(name || "").trim()) throw new Error("Enter a name.");
  if (String(password || "").length < 8) throw new Error("Password must be at least 8 characters.");
  const { salt, hash } = hashPassword(password);
  try { const r = await db(`INSERT INTO hd_users (name, email, pass_salt, pass_hash, role, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, name, email, role, active, created_at`, [String(name).trim(), e, salt, hash, role === "admin" ? "admin" : "agent", by || null]); return r.rows[0]; }
  catch (err) { if (/unique/i.test(err.message)) throw new Error("There is already a user with that email."); throw err; }
}
async function updateUser(id, { name, role, active, password }) {
  const u = (await db(`SELECT * FROM hd_users WHERE id=$1`, [id])).rows[0]; if (!u) throw new Error("user not found");
  if (password != null) { if (String(password).length < 8) throw new Error("Password must be at least 8 characters."); const { salt, hash } = hashPassword(password); await db(`UPDATE hd_users SET pass_salt=$2, pass_hash=$3 WHERE id=$1`, [id, salt, hash]); await db(`DELETE FROM hd_sessions WHERE user_id=$1`, [id]); for (const [t, s] of SESSIONS) if (s.user_id === Number(id)) SESSIONS.delete(t); }
  if (name != null) await db(`UPDATE hd_users SET name=$2 WHERE id=$1`, [id, String(name).trim()]);
  if (role != null) await db(`UPDATE hd_users SET role=$2 WHERE id=$1`, [id, role === "admin" ? "admin" : "agent"]);
  if (active != null) { await db(`UPDATE hd_users SET active=$2 WHERE id=$1`, [id, !!active]); if (!active) { await db(`DELETE FROM hd_sessions WHERE user_id=$1`, [id]); for (const [t, s] of SESSIONS) if (s.user_id === Number(id)) SESSIONS.delete(t); } }
  for (const [, s] of SESSIONS) if (s.user_id === Number(id)) { if (name != null) s.name = String(name).trim(); if (role != null) s.role = role === "admin" ? "admin" : "agent"; }
  return (await db(`SELECT id, name, email, role, active FROM hd_users WHERE id=$1`, [id])).rows[0];
}

/* ---------------- Postgres ---------------- */
const DB_URL = process.env.DATABASE_URL || "";
const DB_SSL = (/sslmode=require/i.test(DB_URL) || /rlwy\.net|amazonaws/i.test(DB_URL)) && !/\.railway\.internal/i.test(DB_URL);
const pool = DB_URL ? new Pool({ connectionString: DB_URL, ssl: DB_SSL ? { rejectUnauthorized: false } : false }) : null;
async function db(q, params) {
  if (!pool) throw new Error("DATABASE_URL not set");
  const c = await pool.connect();
  try { return await c.query(q, params); } finally { c.release(); }
}
async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS hd_tickets (
    id BIGINT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'gorgias',
    gorgias_id BIGINT,
    gmail_thread_id TEXT,
    subject TEXT,
    brand TEXT,
    mailbox TEXT,
    channel TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    spam BOOLEAN DEFAULT false,
    customer_email TEXT,
    customer_name TEXT,
    assignee TEXT,
    tags TEXT[] DEFAULT '{}',
    messages_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_message_at TIMESTAMPTZ,
    last_inbound_at TIMESTAMPTZ,
    last_outbound_at TIMESTAMPTZ,
    imported_at TIMESTAMPTZ DEFAULT now()
  )`);
  await db(`CREATE INDEX IF NOT EXISTS idx_hdt_updated ON hd_tickets(updated_at DESC)`);
  await db(`CREATE INDEX IF NOT EXISTS idx_hdt_status ON hd_tickets(status, last_message_at DESC)`);
  await db(`CREATE INDEX IF NOT EXISTS idx_hdt_cust ON hd_tickets(lower(customer_email))`);
  await db(`CREATE INDEX IF NOT EXISTS idx_hdt_gmail ON hd_tickets(gmail_thread_id)`);
  await db(`CREATE TABLE IF NOT EXISTS hd_messages (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL,
    source TEXT NOT NULL DEFAULT 'gorgias',
    external_id TEXT UNIQUE,
    rfc_message_id TEXT,
    gmail_id TEXT,
    from_agent BOOLEAN DEFAULT false,
    internal BOOLEAN DEFAULT false,
    channel TEXT,
    sender_name TEXT,
    sender_email TEXT,
    to_emails TEXT[] DEFAULT '{}',
    subject TEXT,
    body_text TEXT,
    body_html TEXT,
    attachments JSONB DEFAULT '[]'::jsonb,
    sent_by TEXT,
    at TIMESTAMPTZ
  )`);
  await db(`CREATE INDEX IF NOT EXISTS idx_hdm_ticket ON hd_messages(ticket_id, at)`);
  await db(`CREATE INDEX IF NOT EXISTS idx_hdm_rfc ON hd_messages(rfc_message_id)`);
  await db(`CREATE TABLE IF NOT EXISTS hd_events (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT,
    kind TEXT,
    detail TEXT,
    user_name TEXT,
    ts TIMESTAMPTZ DEFAULT now()
  )`);
  await db(`CREATE INDEX IF NOT EXISTS idx_hde_ticket ON hd_events(ticket_id, ts DESC)`);
  await db(`CREATE TABLE IF NOT EXISTS hd_sync (
    key TEXT PRIMARY KEY,
    cursor TEXT,
    state JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await db(`CREATE TABLE IF NOT EXISTS hd_mailboxes (
    address TEXT PRIMARY KEY,
    brand TEXT,
    refresh_token TEXT,
    history_id TEXT,
    connected_by TEXT,
    connected_at TIMESTAMPTZ,
    last_poll_at TIMESTAMPTZ,
    last_error TEXT
  )`);
  await db(`ALTER TABLE hd_mailboxes ADD COLUMN IF NOT EXISTS client_id TEXT`);
  await db(`CREATE SEQUENCE IF NOT EXISTS hd_local_ticket_seq START 9000000000`);
  // Emily's tables (also created by Emily herself — whichever boots first wins, both are idempotent).
  await db(`CREATE TABLE IF NOT EXISTS emily_policies (id BIGSERIAL PRIMARY KEY, key TEXT NOT NULL, body TEXT NOT NULL, note TEXT, updated_by TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE INDEX IF NOT EXISTS idx_emily_policies_key ON emily_policies(key, id DESC)`);
  await db(`CREATE TABLE IF NOT EXISTS emily_settings (key TEXT PRIMARY KEY, value JSONB, updated_by TEXT, updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE TABLE IF NOT EXISTS hd_users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, pass_salt TEXT NOT NULL, pass_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'agent', active BOOLEAN NOT NULL DEFAULT true, created_by TEXT, created_at TIMESTAMPTZ DEFAULT now(), last_login TIMESTAMPTZ)`);
  await db(`CREATE TABLE IF NOT EXISTS hd_sessions (token TEXT PRIMARY KEY, user_id INT NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL)`);
  await db(`CREATE TABLE IF NOT EXISTS hd_stuck (
    id TEXT PRIMARY KEY,                       -- fulfillment gid
    store TEXT, order_name TEXT, order_id TEXT, customer_name TEXT, customer_email TEXT, city TEXT,
    tracking TEXT, tracking_url TEXT, carrier TEXT, display_status TEXT,
    tracking_added_at TIMESTAMPTZ, order_created_at TIMESTAMPTZ,
    state TEXT NOT NULL DEFAULT 'open',        -- open | contacted | resolved | ignored
    note TEXT, ticket_id BIGINT, state_by TEXT, state_at TIMESTAMPTZ,
    first_seen TIMESTAMPTZ DEFAULT now(), last_seen TIMESTAMPTZ DEFAULT now(), moved_at TIMESTAMPTZ)`);
  // v4.1: one row per (fulfillment, kind) — kind = never_scanned | undelivered
  await db(`ALTER TABLE hd_stuck ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'never_scanned'`);
  await db(`ALTER TABLE hd_stuck ADD COLUMN IF NOT EXISTS in_transit_at TIMESTAMPTZ`);
  await db(`ALTER TABLE hd_stuck ADD COLUMN IF NOT EXISTS estimated_delivery_at TIMESTAMPTZ`);
  await db(`ALTER TABLE hd_stuck ADD COLUMN IF NOT EXISTS last_update_at TIMESTAMPTZ`);
  await db(`ALTER TABLE hd_stuck ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ`);
  await db(`ALTER TABLE hd_stuck ADD COLUMN IF NOT EXISTS carrier_status TEXT`);          // what the carrier itself says (ShipStation tracking)
  await db(`ALTER TABLE hd_stuck ADD COLUMN IF NOT EXISTS carrier_status_at TIMESTAMPTZ`);
  await db(`ALTER TABLE hd_stuck ADD COLUMN IF NOT EXISTS carrier_checked_at TIMESTAMPTZ`);
  await db(`ALTER TABLE hd_stuck ADD COLUMN IF NOT EXISTS carrier_note TEXT`);
  await db(`ALTER TABLE hd_stuck ADD COLUMN IF NOT EXISTS shopify_trackable BOOLEAN`);
  await db(`ALTER TABLE hd_stuck ADD COLUMN IF NOT EXISTS tracking_fixed_at TIMESTAMPTZ`);
  try { const pk = (await db(`SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey) WHERE i.indrelid='hd_stuck'::regclass AND i.indisprimary`)).rows.map((r) => r.attname);
        if (!pk.includes("kind")) { await db(`ALTER TABLE hd_stuck DROP CONSTRAINT IF EXISTS hd_stuck_pkey`); await db(`ALTER TABLE hd_stuck ADD PRIMARY KEY (id, kind)`); } } catch (e) { console.error("hd_stuck pk:", e.message); }
  await db(`CREATE TABLE IF NOT EXISTS hd_files (id TEXT PRIMARY KEY, ticket_id BIGINT, name TEXT, content_type TEXT, data BYTEA, created_by TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
  await db(`ALTER TABLE emily_drafts ADD COLUMN IF NOT EXISTS todo JSONB`);
  try { await db(`ALTER TABLE oos_cases ADD COLUMN IF NOT EXISTS items JSONB`); await db(`ALTER TABLE oos_cases ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`); await db(`ALTER TABLE oos_cases ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ`); } catch (_) {}
  await db(`ALTER TABLE emily_actions ADD COLUMN IF NOT EXISTS files JSONB`);
  await db(`CREATE TABLE IF NOT EXISTS emily_actions (id TEXT PRIMARY KEY, kind TEXT, title TEXT, summary TEXT, ticket_id TEXT, input JSONB, status TEXT DEFAULT 'staged', result TEXT, decided_by TEXT, created_at TIMESTAMPTZ DEFAULT now(), decided_at TIMESTAMPTZ)`);
  await db(`CREATE TABLE IF NOT EXISTS emily_drafts (id BIGSERIAL PRIMARY KEY, ticket_id TEXT, brand TEXT, customer_email TEXT, category TEXT, intent TEXT, sentiment TEXT, escalate BOOLEAN, escalate_reason TEXT, draft TEXT, final_text TEXT, outcome TEXT, decided_by TEXT, created_at TIMESTAMPTZ DEFAULT now(), decided_at TIMESTAMPTZ)`);
  try { await db(`CREATE EXTENSION IF NOT EXISTS pg_trgm`); } catch (e) { console.warn("pg_trgm unavailable — search falls back to plain ILIKE:", e.message); }
  try { await db(`CREATE INDEX IF NOT EXISTS idx_hdt_subject_trgm ON hd_tickets USING gin (subject gin_trgm_ops)`); } catch (e) {}
  try { await db(`CREATE INDEX IF NOT EXISTS idx_hdm_body_trgm ON hd_messages USING gin (body_text gin_trgm_ops)`); } catch (e) {}
}
const syncGet = async (k) => (await db(`SELECT cursor, state FROM hd_sync WHERE key=$1`, [k])).rows[0] || null;
const syncSet = (k, cursor, state) => db(
  `INSERT INTO hd_sync (key,cursor,state,updated_at) VALUES ($1,$2,$3,now())
   ON CONFLICT (key) DO UPDATE SET cursor=EXCLUDED.cursor, state=EXCLUDED.state, updated_at=now()`,
  [k, cursor || null, state || {}]);

/* ---------------- HTTP helpers ---------------- */
function httpJson(url, { method = "GET", headers = {}, body } = {}) {
  const data = body == null ? null : (typeof body === "string" ? body : JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers: { Accept: "application/json", ...headers, ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) } }, (res) => {
      let b = ""; res.on("data", (c) => (b += c));
      res.on("end", () => {
        let j = null; try { j = b ? JSON.parse(b) : {}; } catch (e) { return reject(new Error(`non-JSON ${res.statusCode} from ${url}: ${b.slice(0, 160)}`)); }
        if (res.statusCode >= 400) return reject(Object.assign(new Error(`${res.statusCode}: ${(j.error && (j.error.msg || j.error.message || JSON.stringify(j.error))) || b.slice(0, 200)}`), { status: res.statusCode, body: j }));
        resolve(j);
      });
    });
    req.on("error", reject); if (data) req.write(data); req.end();
  });
}
const gorgias = (method, pathname, body) =>
  httpJson(`https://${G_DOMAIN}/api${pathname}`, { method, headers: { Authorization: G_AUTH, "Content-Type": "application/json" }, body });
function slack(method, payload) {
  if (!SLACK_TOKEN) return Promise.resolve({ ok: false });
  return httpJson(`https://slack.com/api/${method}`, { method: "POST", headers: { Authorization: `Bearer ${SLACK_TOKEN}`, "Content-Type": "application/json; charset=utf-8" }, body: payload }).catch(() => ({ ok: false }));
}
const slackPost = (text) => (SLACK_TOKEN && CS_CHANNEL ? slack("chat.postMessage", { channel: CS_CHANNEL, text }) : Promise.resolve());

/* ---------------- brand / mailbox ---------------- */
const BRAND_MAILBOX = {
  outlet: process.env.MAILBOX_OUTLET || "hello@larkspurbabyoutlet.com",
  bumbunny: process.env.MAILBOX_BUMBUNNY || "hello@bumbunnybaby.com",
  larkspur: process.env.MAILBOX_LARKSPUR || "hello@larkspurbaby.com",
};
// The mailboxes we actually run. BumBunny is retired, so it is no longer offered for connection —
// its old tickets still read fine, they just have no live mailbox behind them. Override with MAILBOXES.
const ACTIVE_MAILBOXES = String(process.env.MAILBOXES || `${BRAND_MAILBOX.larkspur},${BRAND_MAILBOX.outlet}`)
  .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
function brandForAddress(a) {
  const d = String(a || "").toLowerCase();
  if (/outlet/.test(d)) return "Larkspur Baby Outlet";
  if (/bumbunny/.test(d)) return "BumBunny Baby";
  if (/larkspur/.test(d)) return "Larkspur Baby";
  return null;
}
function mailboxForName(name) {
  const n = String(name || "").toLowerCase();
  if (/outlet/.test(n)) return BRAND_MAILBOX.outlet;
  if (/bumbunny|bum bunny/.test(n)) return BRAND_MAILBOX.bumbunny;
  if (/larkspur/.test(n)) return BRAND_MAILBOX.larkspur;
  return null;
}
// Gorgias' single-ticket endpoint omits `integrations` entirely, so the mailbox has to come from the
// thread: what the customer wrote TO, else the from-address of a reply we already sent.
function addressFromMessages(msgs) {
  const arr = Array.isArray(msgs) ? msgs : [];
  for (const m of arr) {
    if (!m.from_agent && m.channel === "email" && m.source && Array.isArray(m.source.to) && m.source.to[0] && m.source.to[0].address) return m.source.to[0].address;
  }
  for (const m of arr) {
    if (m.from_agent && m.channel === "email" && m.source && m.source.from && m.source.from.address) return m.source.from.address;
  }
  return null;
}
function mailboxFromIntegrations(integrations) {
  const arr = Array.isArray(integrations) ? integrations : [];
  const emailInt = arr.find((i) => i && i.address && /@/.test(i.address) && /gmail|email|imap|smtp|outlook|microsoft/i.test(i.type || ""))
    || arr.find((i) => i && i.address && /@/.test(i.address));
  if (emailInt) return emailInt.address;
  return mailboxForName(arr.map((i) => (i && i.name) || "").join(" "));
}
function resolveMailbox(t, msgs) {
  return addressFromMessages(msgs) || mailboxFromIntegrations(t && t.integrations) || process.env.GORGIAS_FROM_ADDRESS || null;
}

/* ---------------- Gorgias import (history only) ----------------
 * Walks /tickets newest-first with the cursor, pulling each ticket's messages. Resumable: the cursor and
 * the ids already stored are both persisted, so a restart continues instead of starting over, and a
 * re-run is harmless. Existing rows are updated, never duplicated. */
const stripHtml = (h) => String(h || "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\n{3,}/g, "\n\n").trim();
const COLLAB_RE = /\b(collab|collaborat|partnership|partner with|brand ambassador|ambassador|influencer|ugc|content creator|creator program|sponsor|affiliate|gifting|brand deal|pr package|work with your brand)\b/i;

function msgRow(ticketId, x) {
  const src = x.source || {};
  const internal = x.channel === "internal-note" || x.public === false;
  // Gorgias' body_text is derived from the HTML with tags removed and no newline for <br>, so a long
  // reply arrives as one run-on paragraph. Re-derive from the HTML whenever that has happened.
  const flat = String(x.body_text || x.stripped_text || "").trim();
  const fromHtml = stripHtml(x.body_html || x.stripped_html || "");
  const text = (!flat || (!/\n/.test(flat) && fromHtml.includes("\n"))) ? fromHtml : flat;
  return {
    ticket_id: ticketId,
    external_id: `gorgias:${x.id}`,
    rfc_message_id: x.message_id || null,
    from_agent: !!x.from_agent,
    internal,
    channel: x.channel || "email",
    sender_name: (x.sender && (x.sender.name || x.sender.email)) || (x.from_agent ? "Agent" : "Customer"),
    sender_email: (x.sender && x.sender.email) || (src.from && src.from.address) || null,
    to_emails: (Array.isArray(src.to) ? src.to.map((a) => a && a.address).filter(Boolean) : []),
    subject: x.subject || null,
    body_text: text,
    body_html: x.body_html || null,
    attachments: (x.attachments || []).map((a) => ({ name: a.name, url: a.url, size: a.size, content_type: a.content_type })),
    at: x.sent_datetime || x.created_datetime || null,
  };
}
async function saveTicket(t, msgs) {
  const mailbox = resolveMailbox(t, msgs);
  const rows = (msgs || []).map((x) => msgRow(t.id, x)).sort((a, b) => new Date(a.at) - new Date(b.at));
  const inbound = rows.filter((r) => !r.from_agent && !r.internal);
  const outbound = rows.filter((r) => r.from_agent && !r.internal);
  let tags = (t.tags || []).map((x) => x.name);
  const isCollab = !t.spam && COLLAB_RE.test(`${t.subject || ""} ${t.excerpt || ""}`);
  const first = inbound[0];
  const cls = classifyInbound({ from: { email: (first && first.sender_email) || (t.customer && t.customer.email) }, subject: t.subject, body: first && first.body_text });
  if (cls.tags && cls.tags.length) tags = tags.concat(cls.tags);
  let custEmail = (t.customer && t.customer.email) || null, custName = (t.customer && (t.customer.name || t.customer.email)) || null;
  if (cls.form) { const f = parseShopifyForm(first && first.body_text); if (f && f.email) { custEmail = f.email; custName = f.name || custName; } }
  await db(
    `INSERT INTO hd_tickets (id,source,gorgias_id,subject,brand,mailbox,channel,status,spam,customer_email,customer_name,
                             assignee,tags,messages_count,created_at,updated_at,last_message_at,last_inbound_at,last_outbound_at)
     VALUES ($1,'gorgias',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (id) DO UPDATE SET subject=EXCLUDED.subject, brand=EXCLUDED.brand, mailbox=EXCLUDED.mailbox,
       channel=EXCLUDED.channel, status=EXCLUDED.status, spam=EXCLUDED.spam, customer_email=EXCLUDED.customer_email,
       customer_name=EXCLUDED.customer_name, tags=EXCLUDED.tags, messages_count=EXCLUDED.messages_count,
       updated_at=EXCLUDED.updated_at, last_message_at=EXCLUDED.last_message_at, last_inbound_at=EXCLUDED.last_inbound_at,
       last_outbound_at=EXCLUDED.last_outbound_at,
       assignee=COALESCE(hd_tickets.assignee, EXCLUDED.assignee)`,
    [t.id, t.subject || "(no subject)", brandForAddress(mailbox) || (t.integrations || [])[0]?.name || null, mailbox,
     t.channel || "email", t.status === "closed" ? "closed" : "open", !!t.spam,
     custEmail, custName,
     (t.assignee_user && t.assignee_user.name) || null, tags.concat(isCollab ? ["collab"] : []),
     rows.length, t.created_datetime || null, t.updated_datetime || null,
     rows.length ? rows[rows.length - 1].at : null,
     inbound.length ? inbound[inbound.length - 1].at : null,
     outbound.length ? outbound[outbound.length - 1].at : null]
  );
  for (const r of rows) {
    if (r.rfc_message_id) {   // already stored through Gmail (on this ticket or its twin, merged below)? skip the copy
      const have = await db(`SELECT 1 FROM hd_messages WHERE rfc_message_id=$1 AND external_id <> $2 LIMIT 1`, [r.rfc_message_id, r.external_id]);
      if (have.rows.length) continue;
    }
    await db(
      `INSERT INTO hd_messages (ticket_id,source,external_id,rfc_message_id,from_agent,internal,channel,sender_name,sender_email,
                                to_emails,subject,body_text,body_html,attachments,at)
       VALUES ($1,'gorgias',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (external_id) DO UPDATE SET body_text=EXCLUDED.body_text, body_html=EXCLUDED.body_html,
         attachments=EXCLUDED.attachments, at=EXCLUDED.at`,
      [r.ticket_id, r.external_id, r.rfc_message_id, r.from_agent, r.internal, r.channel, r.sender_name, r.sender_email,
       r.to_emails, r.subject, r.body_text, r.body_html, JSON.stringify(r.attachments), r.at]
    );
  }
  // Did the Gmail connection already open a ticket for this same conversation? Fold this one into it (older wins).
  try {
    const first = inbound[0] || rows[0];
    if (first) {
      const other = await findTicketForEmail({ rfcId: first.rfc_message_id, customer: first.sender_email, subject: first.subject, at: first.at, exceptId: t.id });
      if (other) {
        const both = (await db(`SELECT id, created_at FROM hd_tickets WHERE id = ANY($1::bigint[])`, [[String(t.id), String(other)]])).rows
          .sort((x, y) => new Date(x.created_at || 0) - new Date(y.created_at || 0) || Number(x.id) - Number(y.id));
        if (both.length === 2) await mergeTickets(both[0].id, both[1].id);
      }
    }
  } catch (e) { console.error(`dedupe after Gorgias save ${t.id}:`, e.message); }
  return rows.length;
}
let importRun = null;   // { running, page, tickets, messages, done, error, started }
async function runImport({ resume = true } = {}) {
  if (importRun && importRun.running) return importRun;
  if (!G_DOMAIN) throw new Error("GORGIAS_DOMAIN not set — nothing to import from");
  const saved = resume ? await syncGet("gorgias_import") : null;
  importRun = { running: true, page: (saved && saved.state && saved.state.page) || 0, tickets: (saved && saved.state && saved.state.tickets) || 0,
                messages: (saved && saved.state && saved.state.messages) || 0, done: false, error: null, started: new Date().toISOString() };
  let cursor = resume && saved ? saved.cursor : null;
  (async () => {
    try {
      for (;;) {
        const qs = `?order_by=updated_datetime:desc&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
        const j = await gorgias("GET", `/tickets${qs}`);
        const data = j.data || [];
        if (!data.length) break;
        for (const t of data) {
          let msgs = [];
          try { msgs = (await gorgias("GET", `/tickets/${t.id}/messages?limit=100`)).data || []; }
          catch (e) { msgs = Array.isArray(t.messages) ? t.messages : []; }
          importRun.messages += await saveTicket(t, msgs);
          importRun.tickets++;
          await new Promise((r) => setTimeout(r, 120));      // stay under Gorgias' rate limit
        }
        importRun.page++;
        cursor = j.meta && j.meta.next_cursor;
        await syncSet("gorgias_import", cursor, { page: importRun.page, tickets: importRun.tickets, messages: importRun.messages });
        if (!cursor) break;
      }
      importRun.done = true;
      await syncSet("gorgias_import_done", null, { at: new Date().toISOString(), tickets: importRun.tickets, messages: importRun.messages });
      slackPost(`📥 Gorgias import finished — ${importRun.tickets} tickets, ${importRun.messages} messages now stored in the console.`);
    } catch (e) {
      importRun.error = e.message;
      console.error("import failed:", e.message);
    } finally { importRun.running = false; }
  })();
  return importRun;
}

/* ---------------- Gmail transport ----------------
 * One OAuth grant per mailbox (hello@larkspurbaby.com, …). We store only the refresh token; access
 * tokens are fetched on demand and kept in memory. Reading is incremental via Gmail's history feed, so
 * each poll costs one call when nothing has arrived. Sending goes out through Google exactly as if it
 * were sent from the mailbox itself — same SPF/DKIM, same deliverability, no new DNS. */
const OAUTH_REDIRECT = process.env.OAUTH_REDIRECT || "";
const GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.send", "https://www.googleapis.com/auth/userinfo.email"];
// One OAuth client covers every mailbox inside a single Google Workspace organisation. Brands on
// SEPARATE Workspace accounts each need their own client, because an "Internal" app can only be
// authorised by users of the organisation that owns it. GOOGLE_OAUTH_CLIENTS holds those extras:
//   [{"client_id":"…","client_secret":"…","domains":["larkspurbabyoutlet.com"]}, …]
// The single GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET pair stays the default for anything unmatched.
function loadOauthClients() {
  const out = [];
  try {
    const raw = JSON.parse(process.env.GOOGLE_OAUTH_CLIENTS || "[]");
    for (const c of Array.isArray(raw) ? raw : []) {
      if (c && c.client_id && c.client_secret) {
        out.push({ client_id: c.client_id, client_secret: c.client_secret, domains: (c.domains || []).map((d) => String(d).toLowerCase()) });
      }
    }
  } catch (e) { console.error("GOOGLE_OAUTH_CLIENTS is not valid JSON — ignoring it:", e.message); }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    out.push({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, domains: [] });
  }
  return out;
}
const OAUTH_CLIENTS = loadOauthClients();
const domainOf = (a) => String(a || "").toLowerCase().split("@").pop();
function clientForAddress(address) {
  const d = domainOf(address);
  return OAUTH_CLIENTS.find((c) => c.domains.includes(d)) || OAUTH_CLIENTS.find((c) => !c.domains.length) || OAUTH_CLIENTS[0] || null;
}
const clientById = (id) => OAUTH_CLIENTS.find((c) => c.client_id === id) || null;
const gmailConfigured = () => !!(OAUTH_CLIENTS.length && OAUTH_REDIRECT);
const accessTokens = new Map();   // address -> { token, exp }

function formEncode(o) { return Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&"); }
async function exchangeCode(code, client) {
  const c = client || OAUTH_CLIENTS[0];
  if (!c) throw new Error("no Google OAuth client configured");
  return httpJson("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formEncode({ code, client_id: c.client_id, client_secret: c.client_secret, redirect_uri: OAUTH_REDIRECT, grant_type: "authorization_code" }),
  });
}
async function accessTokenFor(address) {
  const hit = accessTokens.get(address);
  if (hit && hit.exp > Date.now() + 60000) return hit.token;
  const r = (await db(`SELECT refresh_token, client_id FROM hd_mailboxes WHERE lower(address)=lower($1)`, [address])).rows[0];
  if (!r || !r.refresh_token) throw new Error(`${address} is not connected to Gmail yet`);
  // Refresh with the SAME client that issued the token — a token from one client is meaningless to another.
  const c = clientById(r.client_id) || clientForAddress(address);
  if (!c) throw new Error(`no Google OAuth client configured for ${address}`);
  const j = await httpJson("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formEncode({ refresh_token: r.refresh_token, client_id: c.client_id, client_secret: c.client_secret, grant_type: "refresh_token" }),
  });
  accessTokens.set(address, { token: j.access_token, exp: Date.now() + (Number(j.expires_in || 3600) * 1000) });
  return j.access_token;
}
const gapi = async (address, pathname, opts = {}) => {
  const token = await accessTokenFor(address);
  return httpJson(`https://gmail.googleapis.com/gmail/v1/users/me${pathname}`, {
    ...opts, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
};
const b64urlDecode = (s) => Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
const b64urlEncode = (s) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function headerOf(payload, name) {
  const h = ((payload && payload.headers) || []).find((x) => String(x.name).toLowerCase() === name.toLowerCase());
  return h ? h.value : null;
}
function walkParts(payload, out = { text: "", html: "", attachments: [] }) {
  if (!payload) return out;
  const mime = payload.mimeType || "";
  if (payload.filename && payload.body && payload.body.attachmentId) {
    out.attachments.push({ name: payload.filename, size: payload.body.size, content_type: mime, gmail_attachment_id: payload.body.attachmentId });
  } else if (mime === "text/plain" && payload.body && payload.body.data) {
    out.text += (out.text ? "\n" : "") + b64urlDecode(payload.body.data);
  } else if (mime === "text/html" && payload.body && payload.body.data) {
    out.html += b64urlDecode(payload.body.data);
  }
  for (const p of payload.parts || []) walkParts(p, out);
  return out;
}
const parseAddr = (v) => {
  const s = String(v || "");
  const m = s.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || null, email: m[2].trim().toLowerCase() } : { name: null, email: s.trim().toLowerCase() || null };
};
const parseAddrList = (v) => String(v || "").split(",").map((x) => parseAddr(x).email).filter(Boolean);
// Strip the quoted history Gmail keeps on replies, so the thread reads like a conversation.
function trimQuoted(text) {
  const t = String(text || "");
  const cut = t.search(/\n\s*On .{0,120}wrote:\s*\n|\n\s*-{2,}\s*Original Message\s*-{2,}|\n\s*>{1,}\s/);
  return (cut > 40 ? t.slice(0, cut) : t).trim();
}
/* ---- Duplicate tickets: the same email can reach us twice — once through the Gorgias import (or Gorgias
 * webhook) and once through the Gmail connection. Both paths now look for an existing ticket before creating
 * one, and mergeTickets folds a duplicate into the original (messages, notes, events, drafts, actions, tags). */
const normSubject = (s) => String(s || "").replace(/^\s*((re|fw|fwd|aw|tr)\s*:\s*)+/i, "").replace(/\s+/g, " ").trim().toLowerCase();
async function findTicketForEmail({ rfcId, refs = [], customer, subject, at, exceptId = null }) {
  const not = exceptId ? ` AND m.ticket_id <> ${Number(exceptId)}` : "";
  const ids = [rfcId, ...refs].filter(Boolean);
  if (ids.length) {
    const r = await db(`SELECT m.ticket_id FROM hd_messages m WHERE m.rfc_message_id = ANY($1)${not} ORDER BY m.at ASC LIMIT 1`, [ids]);
    if (r.rows.length) return r.rows[0].ticket_id;
  }
  // Same sender, same subject, same minute — the same email seen through the other door.
  if (customer && subject && at) {
    const r = await db(`SELECT m.ticket_id FROM hd_messages m JOIN hd_tickets t ON t.id = m.ticket_id
                         WHERE lower(t.customer_email) = lower($1) AND NOT m.internal AND lower(coalesce(m.subject,'')) <> ''
                           AND regexp_replace(lower(m.subject), '^\\s*((re|fw|fwd|aw|tr)\\s*:\\s*)+', '') = $2
                           AND m.at BETWEEN $3::timestamptz - interval '3 minutes' AND $3::timestamptz + interval '3 minutes'${not}
                         ORDER BY m.at ASC LIMIT 1`, [customer, normSubject(subject), at]);
    if (r.rows.length) return r.rows[0].ticket_id;
  }
  return null;
}
async function mergeTickets(keepId, dropId) {
  keepId = String(keepId); dropId = String(dropId);
  if (keepId === dropId) return false;
  const keep = (await db(`SELECT * FROM hd_tickets WHERE id=$1`, [keepId])).rows[0];
  const drop = (await db(`SELECT * FROM hd_tickets WHERE id=$1`, [dropId])).rows[0];
  if (!keep || !drop) return false;
  // Messages: move across; a message the keeper already has (same Message-ID) is dropped rather than doubled.
  await db(`DELETE FROM hd_messages d WHERE d.ticket_id=$2 AND d.rfc_message_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM hd_messages k WHERE k.ticket_id=$1 AND k.rfc_message_id = d.rfc_message_id)`, [keepId, dropId]);
  await db(`DELETE FROM hd_messages d WHERE d.ticket_id=$2 AND d.rfc_message_id IS NULL AND NOT d.internal
              AND EXISTS (SELECT 1 FROM hd_messages k WHERE k.ticket_id=$1 AND NOT k.internal AND k.from_agent = d.from_agent
                          AND k.at BETWEEN d.at - interval '3 minutes' AND d.at + interval '3 minutes'
                          AND left(regexp_replace(k.body_text,'\\s+',' ','g'),120) = left(regexp_replace(d.body_text,'\\s+',' ','g'),120))`, [keepId, dropId]);
  await db(`UPDATE hd_messages SET ticket_id=$1 WHERE ticket_id=$2`, [keepId, dropId]);
  await db(`UPDATE hd_events SET ticket_id=$1 WHERE ticket_id=$2`, [keepId, dropId]).catch(() => {});
  await db(`UPDATE emily_drafts SET ticket_id=$1 WHERE ticket_id=$2`, [keepId, dropId]).catch(() => {});
  await db(`UPDATE emily_actions SET ticket_id=$1 WHERE ticket_id=$2`, [keepId, dropId]).catch(() => {});
  await db(`UPDATE oos_cases SET ticket_id=$1 WHERE ticket_id=$2`, [keepId, dropId]).catch(() => {});
  await db(`UPDATE hd_tickets SET
              gmail_thread_id = COALESCE(gmail_thread_id, $3), gorgias_id = COALESCE(gorgias_id, $4),
              mailbox = COALESCE(mailbox, $5), brand = COALESCE(brand, $6), customer_name = COALESCE(customer_name, $7),
              tags = (SELECT array_agg(DISTINCT x) FROM unnest(coalesce(tags,'{}'::text[]) || $8::text[]) AS x),
              status = CASE WHEN status='closed' AND $9='closed' THEN 'closed' ELSE 'open' END,
              spam = spam AND $10,
              created_at = LEAST(created_at, $11::timestamptz),
              messages_count = (SELECT count(*) FROM hd_messages WHERE ticket_id=$1),
              last_message_at = (SELECT max(at) FROM hd_messages WHERE ticket_id=$1),
              last_inbound_at = (SELECT max(at) FROM hd_messages WHERE ticket_id=$1 AND NOT from_agent AND NOT internal),
              last_outbound_at = (SELECT max(at) FROM hd_messages WHERE ticket_id=$1 AND from_agent AND NOT internal),
              updated_at = now()
            WHERE id=$2`,
    [keepId, keepId, drop.gmail_thread_id, drop.gorgias_id, drop.mailbox, drop.brand, drop.customer_name, drop.tags || [], drop.status, !!drop.spam, drop.created_at || keep.created_at]);
  await db(`DELETE FROM hd_tickets WHERE id=$1`, [dropId]);
  await db(`INSERT INTO hd_events (ticket_id, kind, detail, user_name) VALUES ($1,'merge',$2,'system')`, [keepId, `merged duplicate ticket ${dropId} (${drop.source}) into this one`]).catch(() => {});
  return true;
}
// Sweep the whole table for duplicates (used once after upgrade, and from Settings).
async function dedupeTickets() {
  let merged = 0;
  const seen = new Set();
  // 1) two tickets sharing an email Message-ID
  const a = await db(`SELECT m1.ticket_id AS a, m2.ticket_id AS b FROM hd_messages m1 JOIN hd_messages m2
                        ON m1.rfc_message_id = m2.rfc_message_id AND m1.ticket_id < m2.ticket_id
                       WHERE m1.rfc_message_id IS NOT NULL GROUP BY 1,2`);
  // 2) same customer, same subject, first inbound message within 3 minutes of each other, one from each source
  const b = await db(`SELECT t1.id AS a, t2.id AS b FROM hd_tickets t1 JOIN hd_tickets t2
                        ON t1.id < t2.id AND t1.source <> t2.source AND lower(t1.customer_email) = lower(t2.customer_email)
                       AND regexp_replace(lower(coalesce(t1.subject,'')), '^\\s*((re|fw|fwd|aw|tr)\\s*:\\s*)+', '') = regexp_replace(lower(coalesce(t2.subject,'')), '^\\s*((re|fw|fwd|aw|tr)\\s*:\\s*)+', '')
                       AND coalesce(t1.subject,'') <> ''
                       AND EXISTS (SELECT 1 FROM hd_messages x JOIN hd_messages y ON y.ticket_id = t2.id AND NOT y.internal AND NOT y.from_agent
                                    WHERE x.ticket_id = t1.id AND NOT x.internal AND NOT x.from_agent
                                      AND y.at BETWEEN x.at - interval '3 minutes' AND x.at + interval '3 minutes')`);
  for (const r of [...a.rows, ...b.rows]) {
    const pair = [String(r.a), String(r.b)];
    if (seen.has(pair[1])) continue;
    const rows = (await db(`SELECT id, created_at, source FROM hd_tickets WHERE id = ANY($1::bigint[])`, [pair])).rows;
    if (rows.length < 2) continue;
    // keep the older ticket (Gorgias history usually), fold the newer one in
    rows.sort((x, y) => new Date(x.created_at || 0) - new Date(y.created_at || 0) || Number(x.id) - Number(y.id));
    if (await mergeTickets(rows[0].id, rows[1].id)) { merged++; seen.add(String(rows[1].id)); }
  }
  if (merged) console.log(`🧹 merged ${merged} duplicate ticket(s)`);
  return merged;
}

/* ---- Inbound classification: is this a person who needs an answer, or machinery / marketing / a platform notice?
 * Runs on every email as it arrives (with headers) and once over the backlog (sender + subject + body only).
 * A reply from a personal mailbox is never junked, whatever its subject says. ---- */
const JUNK_TAG_SET = ["automated", "newsletter", "social", "vendor", "automated-notification", "solicitation", "press-pitch", "tiktok-notification", "okendo", "spam", "not-cs", "emily-skip", "emily-skip-manual"];
const PERSONAL_DOMAIN_RE = /(^|\.)(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|mac|aol|comcast|att|verizon|sbcglobal|cox|charter|spectrum|earthlink|protonmail|proton|pm|zoho|gmx|mail|fastmail|hey)\.(com|net|me|ch|de|co\.uk|ca)$/i;
const ROLE_LOCAL_RE = /^(no-?reply|donotreply|do-not-reply|noreply[-.]|notifications?|notify|newsletters?|news|marketing|alerts?|updates?|digest|mailer|bounces?|postmaster|mailer-daemon|receipts?|billing|invoices?|promo(tions)?|offers?|deals|service|customerservice|community|feedback|surveys?|reviews?|friendsuggestions?|friend-?updates?|notification)(\+.*)?$/i;
const SOCIAL_DOMAIN_RE = /(facebook|facebookmail|instagram|tiktok|linkedin|pinterest|twitter|x|youtube|snapchat|threads|reddit|nextdoor)\.(com|net)$/i;
const VENDOR_DOMAIN_RE = /(paypal|stripe|apple|itunes|google|googleapis|microsoft|zoom|slack|notion|dropbox|canva|adobe|intuit|quickbooks|godaddy|squarespace|wix|klaviyo|mailchimp|okendo|yotpo|judge\.me|loopreturns|shipstation|shippo|easypost|usps|ups|fedex|dhl|amazon|ebay|etsy|faire|meta|business\.fb|fb|instagram|shop|shopify|shopifyemail|myshopify|gorgias|zendesk|hubspot|calendly|docusign|adsgpt|openai)\.(com|net|io)$/i;
const JUNK_SUBJECT_RE = /(suggested for you|sent you a message|more updates?|new message from .* and other updates|invited you to|billing agreement|your receipt|receipt for|invoice #?\d|payment (received|failed)|payout|webinar|unsubscribe|\b\d{1,2}% off\b|sale ends|flash sale|last chance|new (sign-?in|login)|security alert|verify your (email|account)|reset your password|weekly (digest|report|summary)|monthly (digest|report|statement)|your statement|order confirmation|has been (shipped|delivered)|is out for delivery|shipping confirmation|\[larkspur baby( outlet)?\] order|new order #|payout sent|low stock|abandoned checkout|domain (renewal|expir)|trial (ends|expir)|subscription renew|action required: (update|verify)|your (weekly|monthly) (ad|campaign)|ad (account|campaign)|advertisers? page|built for search|product update|what'?s new in|release notes)/i;
const SHOPIFY_FORM_RE = /^(re:\s*)?new customer message on /i;
function classifyInbound({ from = {}, subject = "", body = "", headers = {} }) {
  const email = String(from.email || "").toLowerCase();
  const local = email.split("@")[0] || "", domain = email.split("@")[1] || "";
  const subj = String(subject || "");
  const isReply = /^\s*(re|fwd?|aw|tr)\s*:/i.test(subj);
  const personal = PERSONAL_DOMAIN_RE.test(domain);
  // Shopify's contact-form forward is a real customer inquiry wearing a robot's address.
  if (SHOPIFY_FORM_RE.test(subj)) return { junk: false, tags: ["contact-form"], form: true };
  // A bounce: the email we sent didn't get through. Machinery, but it must stop follow-ups and raise a flag.
  if (/^(mailer-daemon|postmaster|microsoftexchange[0-9a-f]*)@/i.test(email) || (!personal && !isReply && /^(delivery (has )?failed|undeliver|delivery status notification|mail delivery (failed|subsystem)|returned mail|failure notice|message not delivered)/i.test(subj)))
    return { junk: true, tags: ["bounce", "automated"], bounce: true, reason: bounceReason(body) };
  if (personal && isReply) return { junk: false, tags: [] };
  const h = (n) => String(headers[n] || headers[n.toLowerCase()] || "");
  const bulk = /list-unsubscribe/i.test(Object.keys(headers).join(",")) || /bulk|list|junk/i.test(h("Precedence")) || /auto-(generated|replied)/i.test(h("Auto-Submitted")) || !!h("X-Campaign") || !!h("X-Mailchimp-Campaign") || /klaviyo|mailchimp|sendgrid|braze|iterable|hubspot|constantcontact|marketo/i.test(h("X-Mailer") + h("X-Sender") + h("Sender"));
  if (!personal && bulk) return { junk: true, tags: ["newsletter"] };
  if (SOCIAL_DOMAIN_RE.test(domain)) return { junk: true, tags: ["social"] };
  if (ROLE_LOCAL_RE.test(local)) return { junk: true, tags: ["automated"] };
  if (VENDOR_DOMAIN_RE.test(domain)) return { junk: true, tags: ["vendor"] };
  if (!personal && JUNK_SUBJECT_RE.test(subj)) return { junk: true, tags: ["automated"] };
  if (!personal && /unsubscribe|manage (your )?preferences|view (this email )?in (your )?browser/i.test(String(body || "").slice(0, 6000))) return { junk: true, tags: ["newsletter"] };
  return { junk: false, tags: [] };
}
// Shopify contact-form forwards: "You received a new message from your online store's contact form. … 'Email': x@y …"
function bounceReason(body) {
  const t = String(body || "");
  if (/mailbox (is )?full|quota ?exceeded|over quota|storage.*(full|exceeded)/i.test(t)) return "mailbox full";
  if (/(address|user|recipient|mailbox) (not found|does ?n.t exist|unknown|rejected)|no such (user|address)|550 5\.1\.1/i.test(t)) return "address doesn't exist";
  if (/blocked|spam|policy|reputation|5\.7\.1/i.test(t)) return "blocked as spam / policy";
  if (/could not be delivered|delayed|temporar/i.test(t)) return "temporary failure";
  return "delivery failed";
}
function parseShopifyForm(body) {
  const t = String(body || "");
  const em = t.match(/['"]?E-?mail['"]?\s*[:=]\s*['"]?\s*([^\s'"<>,]+@[^\s'"<>,]+)/i);
  const fn = t.match(/['"]?First\s*-?name['"]?\s*[:=]\s*['"]?\s*([^'"\n]+?)\s*['"]?\s*(?=['"]?Last|$)/i);
  const ln = t.match(/['"]?Last\s*-?name['"]?\s*[:=]\s*['"]?\s*([^'"\n]+?)\s*['"]?\s*(?=['"]?(E-?mail|Phone|Body|Message)|$)/i);
  const name = [fn && fn[1], ln && ln[1]].filter(Boolean).map((x) => x.trim()).join(" ").trim() || null;
  return em ? { email: em[1].toLowerCase(), name } : null;
}
async function removeTags(ticketId, tags) {
  if (!tags || !tags.length) return;
  await db(`UPDATE hd_tickets SET tags = (SELECT coalesce(array_agg(x), '{}') FROM unnest(tags) x WHERE NOT (x = ANY($2::text[]))), updated_at=now() WHERE id=$1`, [ticketId, tags]);
}
// One pass over everything stored: tag what's machinery so the Tickets views only show people. Safe to re-run.
async function classifyBacklog() {
  const rows = (await db(`SELECT t.id, t.subject, t.tags, t.customer_email, t.customer_name,
                                 (SELECT body_text FROM hd_messages m WHERE m.ticket_id=t.id AND NOT m.internal ORDER BY m.at ASC LIMIT 1) AS body,
                                 (SELECT sender_email FROM hd_messages m WHERE m.ticket_id=t.id AND NOT m.internal AND NOT m.from_agent ORDER BY m.at ASC LIMIT 1) AS sender
                            FROM hd_tickets t WHERE NOT (t.tags && $1::text[]) AND NOT ('human' = ANY(t.tags))`, [JUNK_TAG_SET])).rows;
  let junk = 0, forms = 0;
  for (const t of rows) {
    const c = classifyInbound({ from: { email: t.sender || t.customer_email }, subject: t.subject, body: t.body });
    if (c.junk) { await addTags(t.id, c.tags); junk++; continue; }
    if (c.form) {
      const f = parseShopifyForm(t.body);
      if (f && f.email && f.email !== String(t.customer_email || "").toLowerCase()) { await db(`UPDATE hd_tickets SET customer_email=$2, customer_name=COALESCE($3, customer_name) WHERE id=$1`, [t.id, f.email, f.name]); forms++; }
      if (!(t.tags || []).includes("contact-form")) await addTags(t.id, ["contact-form"]);
    }
  }
  console.log(`🧽 classified backlog: ${rows.length} checked · ${junk} tagged as machinery/marketing · ${forms} contact-form tickets re-pointed at the customer`);
  return { checked: rows.length, junk, forms };
}

async function storeGmailMessage(address, m) {
  const labels = m.labelIds || [];
  if (labels.includes("DRAFT")) return null;
  const p = m.payload || {};
  const from = parseAddr(headerOf(p, "From"));
  const to = parseAddrList(headerOf(p, "To")).concat(parseAddrList(headerOf(p, "Cc")));
  const subject = headerOf(p, "Subject") || "(no subject)";
  const rfcId = headerOf(p, "Message-ID") || headerOf(p, "Message-Id") || null;
  const parts = walkParts(p);
  const body = trimQuoted(parts.text || stripHtml(parts.html));
  const fromAgent = from.email === String(address).toLowerCase();
  const at = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString();
  let customer = fromAgent ? (to[0] || null) : from.email;
  if (!customer) return null;
  const hdrs = {}; for (const h of (p.headers || [])) hdrs[h.name] = h.value;
  const cls = fromAgent ? { junk: false, tags: [] } : classifyInbound({ from, subject, body, headers: hdrs });
  let formCustomer = null;
  if (cls.form) { formCustomer = parseShopifyForm(body); if (formCustomer && formCustomer.email) customer = formCustomer.email; }

  let t = (await db(`SELECT id FROM hd_tickets WHERE gmail_thread_id=$1`, [m.threadId])).rows[0];
  if (!t) {
    // Same email already here through Gorgias (or a reply to one that is)? Attach to that ticket instead of opening a twin.
    const refs = `${headerOf(p, "In-Reply-To") || ""} ${headerOf(p, "References") || ""}`.match(/<[^>]+>/g) || [];
    const existing = await findTicketForEmail({ rfcId, refs, customer, subject, at });
    if (existing) {
      await db(`UPDATE hd_tickets SET gmail_thread_id = COALESCE(gmail_thread_id, $2), mailbox = COALESCE(mailbox, $3) WHERE id=$1`, [existing, m.threadId, address]);
      t = { id: existing };
    }
  }
  if (!t) {
    const id = (await db(`SELECT nextval('hd_local_ticket_seq')::bigint AS id`)).rows[0].id;
    await db(
      `INSERT INTO hd_tickets (id,source,gmail_thread_id,subject,brand,mailbox,channel,status,spam,customer_email,customer_name,tags,created_at,updated_at)
       VALUES ($1,'gmail',$2,$3,$4,$5,'email','open',$6,$7,$8,$9,$10,$10)`,
      [id, m.threadId, subject, brandForAddress(address), address, labels.includes("SPAM"), customer, formCustomer ? formCustomer.name : (fromAgent ? null : from.name), cls.tags || [], at]);
    t = { id };
  } else if (cls.tags && cls.tags.length) { await addTags(t.id, cls.tags); }
  if (formCustomer && formCustomer.email) await db(`UPDATE hd_tickets SET customer_email=$2, customer_name=COALESCE($3, customer_name) WHERE id=$1 AND (customer_email IS NULL OR customer_email ~* 'shopify|noreply|no-reply')`, [t.id, formCustomer.email, formCustomer.name]);
  // The same email already on this ticket via Gorgias? Just remember its Gmail id (for attachments) — don't store it twice.
  if (rfcId) {
    const dup = await db(`UPDATE hd_messages SET gmail_id = COALESCE(gmail_id, $3) WHERE ticket_id=$1 AND rfc_message_id=$2 AND external_id <> $4 RETURNING id`, [t.id, rfcId, m.id, `gmail:${m.id}`]);
    if (dup.rows.length) return null;
  }
  const ins = await db(
    `INSERT INTO hd_messages (ticket_id,source,external_id,rfc_message_id,gmail_id,from_agent,internal,channel,sender_name,sender_email,
                              to_emails,subject,body_text,body_html,attachments,at)
     VALUES ($1,'gmail',$2,$3,$4,$5,false,'email',$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (external_id) DO NOTHING RETURNING id`,
    [t.id, `gmail:${m.id}`, rfcId, m.id, fromAgent, from.name || (fromAgent ? "Agent" : customer), from.email, to, subject,
     body, parts.html || null, JSON.stringify(parts.attachments), at]);
  if (!ins.rows.length) return null;                        // already had it
  if (!fromAgent && !cls.junk) setImmediate(() => emitInbound(t.id, ins.rows[0].id));
  if (cls.bounce) {
    try {
      const tk = (await db(`SELECT customer_email, subject, customer_name FROM hd_tickets WHERE id=$1`, [t.id])).rows[0] || {};
      await addTags(t.id, ["bounced"]);
      await db(`INSERT INTO hd_messages (ticket_id,source,external_id,from_agent,internal,channel,sender_name,body_text,sent_by,at) VALUES ($1,'system',$2,true,true,'note','Helpdesk',$3,'Helpdesk',now())`,
        [t.id, `local:${crypto.randomUUID()}`, `⚠️ Our email to ${tk.customer_email || "the customer"} bounced — ${cls.reason}. Nothing we send to this address will arrive until that changes; reach them another way (phone on the order) or wait and resend.`]);
      const oos = await db(`UPDATE oos_cases SET status='bounced', updated_at=now() WHERE ticket_id=$1 AND status IN ('offered','staged') RETURNING order_number`, [String(t.id)]).catch(() => ({ rows: [] }));
      slackPost(`📭 *Email bounced* — ${tk.customer_email || "?"} · ${cls.reason}${oos.rows.length ? ` · out-of-stock email for order ${oos.rows[0].order_number} did NOT reach the customer (follow-up cancelled)` : ""} · ticket ${t.id}`).catch(() => {});
    } catch (e) { console.error("bounce handling:", e.message); }
  }
  await db(
    `UPDATE hd_tickets SET messages_count=(SELECT count(*) FROM hd_messages WHERE ticket_id=$1),
            last_message_at=$2, updated_at=$2,
            last_inbound_at=CASE WHEN $3 THEN last_inbound_at ELSE $2 END,
            last_outbound_at=CASE WHEN $3 THEN $2 ELSE last_outbound_at END,
            status=CASE WHEN $3 THEN status ELSE 'open' END,
            customer_name=COALESCE(customer_name,$4)
      WHERE id=$1`, [t.id, at, fromAgent, fromAgent ? null : from.name]);
  return { ticket_id: t.id, from_agent: fromAgent, subject };
}
// Gmail allows ~15,000 quota units per user per minute (a message fetch costs 5). A first sync or a re-scan
// used to fetch every message in one burst and trip that limit, then start the same burst over on the next
// poll. Now: messages already stored are never re-fetched, at most GMAIL_FETCH_PER_POLL new messages are
// pulled per poll (the rest come on the next polls), and a quota error pauses that mailbox for two minutes.
const FETCH_PER_POLL = Number(process.env.GMAIL_FETCH_PER_POLL) || 120;
const pollPause = new Map();   // address -> timestamp until which we leave it alone
async function pollMailbox(address) {
  const box = (await db(`SELECT * FROM hd_mailboxes WHERE lower(address)=lower($1)`, [address])).rows[0];
  if (!box || !box.refresh_token) return { skipped: true };
  if ((pollPause.get(address.toLowerCase()) || 0) > Date.now()) return { skipped: "paused" };
  let added = 0, ids = [], partial = false;
  try {
    if (!box.history_id) {                                   // first run (or expired history): take the recent window, then go incremental
      const days = Number(process.env.GMAIL_FIRST_SYNC_DAYS || 30);
      let pageToken = null;
      do {
        const j = await gapi(address, `/messages?maxResults=100&q=${encodeURIComponent(`newer_than:${days}d -in:chats`)}${pageToken ? `&pageToken=${pageToken}` : ""}`);
        for (const r of j.messages || []) ids.push(r.id);
        pageToken = j.nextPageToken;
      } while (pageToken && ids.length < 2000);
    } else {
      let pageToken = null;
      do {
        const j = await gapi(address, `/history?startHistoryId=${box.history_id}&historyTypes=messageAdded${pageToken ? `&pageToken=${pageToken}` : ""}`);
        for (const h of j.history || []) for (const x of h.messagesAdded || []) if (x.message) ids.push(x.message.id);
        pageToken = j.nextPageToken;
      } while (pageToken);
    }
    ids = [...new Set(ids)];
    // Drop everything we already have — costs one DB query instead of 5 Gmail units per message.
    if (ids.length) {
      const have = new Set((await db(`SELECT external_id FROM hd_messages WHERE external_id = ANY($1)`, [ids.map((id) => `gmail:${id}`)])).rows.map((r) => r.external_id));
      ids = ids.filter((id) => !have.has(`gmail:${id}`));
    }
    const todo = ids.slice(0, FETCH_PER_POLL); partial = ids.length > todo.length;
    for (const id of todo) {
      const full = await gapi(address, `/messages/${id}?format=full`);
      const r = await storeGmailMessage(address, full);
      if (r) added++;
    }
    if (partial) {
      // More to fetch — keep the current cursor so the next poll continues where this one stopped.
      await db(`UPDATE hd_mailboxes SET last_poll_at=now(), last_error=$2 WHERE lower(address)=lower($1)`, [address, `catching up — ${ids.length - todo.length} more messages to pull`]);
      console.log(`gmail poll ${address}: stored ${added}, ${ids.length - todo.length} left for the next poll`);
      return { address, added, remaining: ids.length - todo.length };
    }
    const prof = await gapi(address, `/profile`);
    await db(`UPDATE hd_mailboxes SET history_id=$2, last_poll_at=now(), last_error=NULL WHERE lower(address)=lower($1)`, [address, String(prof.historyId)]);
    return { address, added };
  } catch (e) {
    // A historyId older than Gmail keeps (about a week) can't be resumed — fall back to a window re-scan.
    if (e.status === 404 && box.history_id) {
      await db(`UPDATE hd_mailboxes SET history_id=NULL, last_error=$2 WHERE lower(address)=lower($1)`, [address, "history expired — re-scanning"]);
      return { address, added, requeued: true };
    }
    const quota = e.status === 403 && /quota|rate/i.test(e.message || "");
    if (quota) pollPause.set(address.toLowerCase(), Date.now() + 120000);
    await db(`UPDATE hd_mailboxes SET last_poll_at=now(), last_error=$2 WHERE lower(address)=lower($1)`, [address, (quota ? "Gmail rate limit hit — pausing two minutes, then continuing. " : "") + e.message.slice(0, 240)]);
    console.error(`gmail poll ${address}:`, e.message);
    return { address, error: e.message };
  }
}
let pollBusy = false;
async function pollAll() {
  if (pollBusy || !pool || !gmailConfigured()) return;
  pollBusy = true;
  try {
    const boxes = (await db(`SELECT address FROM hd_mailboxes WHERE refresh_token IS NOT NULL`)).rows;
    for (const b of boxes) await pollMailbox(b.address);
  } catch (e) { console.error("poll loop:", e.message); }
  finally { pollBusy = false; }
}
// Send a reply through Gmail, threaded onto the existing conversation.
async function gmailSend({ mailbox, to, subject, text, threadId, inReplyTo, references, fromName, attachments = [], reply = true }) {
  const boundaryText = String(text || "");
  const html = boundaryText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  // Our own Message-ID so later replies/follow-ups can reference it and thread properly in the customer's mail client.
  const messageId = `<hd-${crypto.randomUUID()}@${String(mailbox).split("@")[1] || "helpdesk"}>`;
  const top = [
    `From: ${fromName ? `"${fromName.replace(/"/g, "")}" ` : ""}<${mailbox}>`,
    `To: ${to}`,
    `Subject: ${!reply || /^re:/i.test(subject || "") ? (subject || "") : `Re: ${subject || ""}`}`,
    `Message-ID: ${messageId}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}` : null,
    "MIME-Version: 1.0",
  ].filter(Boolean);
  let raw;
  if (!attachments.length) {
    raw = `${top.concat(['Content-Type: text/html; charset="UTF-8"', "Content-Transfer-Encoding: 8bit"]).join("\r\n")}\r\n\r\n${html}`;
  } else {
    const b = "hd_" + crypto.randomBytes(8).toString("hex");
    const parts = [`--${b}\r\nContent-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${html}\r\n`];
    for (const a of attachments) {
      const name = String(a.name || "attachment").replace(/["\r\n]/g, "");
      parts.push(`--${b}\r\nContent-Type: ${a.content_type || "application/octet-stream"}; name="${name}"\r\nContent-Disposition: attachment; filename="${name}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(a.buffer).toString("base64").replace(/(.{76})/g, "$1\r\n")}\r\n`);
    }
    raw = `${top.concat([`Content-Type: multipart/mixed; boundary="${b}"`]).join("\r\n")}\r\n\r\n${parts.join("")}--${b}--`;
  }
  const r = await gapi(mailbox, `/messages/send`, { method: "POST", body: threadId ? { raw: b64urlEncode(raw), threadId } : { raw: b64urlEncode(raw) } });
  return { ...r, messageId };
}

/* ---------------- inbound hook (Emily listens here) ---------------- */
const inboundListeners = [];
function onInbound(fn) { inboundListeners.push(fn); }
function emitInbound(ticketId, messageId) { for (const fn of inboundListeners) { try { Promise.resolve(fn(ticketId, messageId)).catch((e) => console.error("inbound listener:", e.message)); } catch (e) { console.error("inbound listener:", e.message); } } }

/* ---------------- sending ----------------
 * One path for every outbound email, whoever triggers it: a person in the UI, Emily after approval,
 * or an out-of-stock notice from the warehouse. Gmail when the mailbox is connected; Gorgias as the
 * fallback while history is still being migrated. */
async function sendReply({ ticketId, text, who, via, files = [] }) {
  const t = (await db(`SELECT * FROM hd_tickets WHERE id=$1`, [ticketId])).rows[0];
  if (!t) throw new Error("ticket not found");
  if (!t.customer_email) throw new Error("no customer email on this ticket");
  const mailbox = t.mailbox || mailboxForName(t.brand) || process.env.GORGIAS_FROM_ADDRESS;
  if (!mailbox) throw new Error(`couldn't work out which mailbox to send from on ticket ${ticketId}`);
  const last = (await db(`SELECT rfc_message_id FROM hd_messages WHERE ticket_id=$1 AND rfc_message_id IS NOT NULL ORDER BY at DESC LIMIT 1`, [ticketId])).rows[0];
  const chain = (await db(`SELECT rfc_message_id FROM hd_messages WHERE ticket_id=$1 AND rfc_message_id IS NOT NULL ORDER BY at ASC LIMIT 20`, [ticketId])).rows.map((x) => x.rfc_message_id).join(" ");
  let ourId = null;
  const connected = (await db(`SELECT 1 FROM hd_mailboxes WHERE lower(address)=lower($1) AND refresh_token IS NOT NULL`, [mailbox])).rows.length > 0;
  let sentVia = "gmail", externalId = null;
  const attachments = [];
  for (const fid of files) { const f = await getFile(String(fid)); if (f) attachments.push({ file_id: String(fid), name: f.name, content_type: f.content_type, buffer: f.buffer, size: f.buffer.length }); }
  if (connected && gmailConfigured()) {
    const r = await gmailSend({ mailbox, to: t.customer_email, subject: t.subject, text, threadId: t.gmail_thread_id,
      inReplyTo: last && last.rfc_message_id, references: chain || (last && last.rfc_message_id), fromName: t.brand, attachments });
    externalId = `gmail:${r.id}`; ourId = r.messageId || null;
    if (!t.gmail_thread_id && r.threadId) await db(`UPDATE hd_tickets SET gmail_thread_id=$2 WHERE id=$1`, [ticketId, r.threadId]);
  } else if (G_DOMAIN && t.gorgias_id) {
    sentVia = "gorgias";
    const html = htmlify(text);
    const rr = await gorgias("POST", `/tickets/${t.gorgias_id}/messages`, {
      channel: "email", via: "api", from_agent: true,
      subject: /^re:/i.test(t.subject || "") ? t.subject : `Re: ${t.subject || ""}`,
      sender: { email: process.env.GORGIAS_EMAIL }, receiver: { email: t.customer_email },
      source: { type: "email", to: [{ address: t.customer_email }], from: { address: mailbox } },
      body_html: html, body_text: String(text),
    });
    if (rr && (rr.failed_datetime || (rr.last_sending_error && rr.last_sending_error.error))) throw new Error(`Gorgias did not deliver: ${(rr.last_sending_error && rr.last_sending_error.error) || "delivery failed"}`);
    externalId = `gorgias:${rr.id}`;
  } else {
    throw new Error(`${mailbox} isn't connected to Gmail yet — connect it in Settings, then send.`);
  }
  if (sentVia === "gorgias" && attachments.length) console.error(`sendReply ${ticketId}: ${attachments.length} attachment(s) not sent — Gorgias fallback is text-only`);
  const at = new Date().toISOString();
  await db(
    `INSERT INTO hd_messages (ticket_id,source,external_id,rfc_message_id,from_agent,internal,channel,sender_name,sender_email,to_emails,subject,body_text,attachments,sent_by,at)
     VALUES ($1,$2,$3,$4,true,false,'email',$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (external_id) DO NOTHING`,
    [ticketId, sentVia, externalId || `local:${crypto.randomUUID()}`, ourId, t.brand || "Agent", mailbox, [t.customer_email], t.subject, String(text),
     JSON.stringify(attachments.map((a) => ({ name: a.name, content_type: a.content_type, size: a.size, file_id: a.file_id }))), who, at]);
  await db(`UPDATE hd_tickets SET last_message_at=$2, last_outbound_at=$2, updated_at=$2, status='open',
                   messages_count=(SELECT count(*) FROM hd_messages WHERE ticket_id=$1) WHERE id=$1`, [ticketId, at]);
  await db(`INSERT INTO hd_events (ticket_id,kind,detail,user_name) VALUES ($1,'reply',$2,$3)`, [ticketId, `sent via ${sentVia} from ${mailbox}${via ? ` (${via})` : ""}`, who]);
  return { ok: true, via: sentVia, mailbox, to: t.customer_email, attached: attachments.length };
}
const htmlify = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
// A brand-new outbound conversation (the warehouse's out-of-stock notice). Creates the ticket here first
// so the customer's reply threads straight back onto it.
async function sendNewEmail({ mailbox, to, subject, text, who, tags, name }) {
  const brand = brandForAddress(mailbox);
  const connected = (await db(`SELECT 1 FROM hd_mailboxes WHERE lower(address)=lower($1) AND refresh_token IS NOT NULL`, [mailbox])).rows.length > 0;
  const id = (await db(`SELECT nextval('hd_local_ticket_seq')::bigint AS id`)).rows[0].id;
  const at = new Date().toISOString();
  let threadId = null, externalId = null, via = "gmail", ourId = null;
  if (connected && gmailConfigured()) {
    const r = await gmailSend({ mailbox, to, subject, text, fromName: brand, reply: false });
    threadId = r.threadId || null; externalId = `gmail:${r.id}`; ourId = r.messageId || null;
  } else if (G_DOMAIN) {
    via = "gorgias";
    const html = htmlify(text);
    const rr = await gorgias("POST", "/tickets", {
      subject, channel: "email", via: "api", customer: { email: to },
      messages: [{ channel: "email", via: "api", from_agent: true, sender: { email: process.env.GORGIAS_AGENT_EMAIL || process.env.GORGIAS_EMAIL }, receiver: { email: to },
                   source: { type: "email", from: { address: mailbox }, to: [{ address: to }] }, body_html: html, body_text: String(text) }],
    });
    externalId = `gorgias-ticket:${rr.id}`;
    await db(`UPDATE hd_tickets SET gorgias_id=$2 WHERE id=$1`, [id, rr.id]).catch(() => {});
  } else {
    throw new Error(`${mailbox} isn't connected to Gmail yet`);
  }
  await db(`INSERT INTO hd_tickets (id,source,gmail_thread_id,subject,brand,mailbox,channel,status,customer_email,tags,messages_count,created_at,updated_at,last_message_at,last_outbound_at)
            VALUES ($1,$2,$3,$4,$5,$6,'email','open',$7,$8,1,$9,$9,$9,$9)`, [id, via, threadId, subject, brand, mailbox, to, tags || [], at]);
  if (name) await db(`UPDATE hd_tickets SET customer_name=$2 WHERE id=$1`, [id, String(name).trim()]).catch(() => {});
  await db(`INSERT INTO hd_messages (ticket_id,source,external_id,rfc_message_id,from_agent,internal,channel,sender_name,sender_email,to_emails,subject,body_text,sent_by,at)
            VALUES ($1,$2,$3,$4,true,false,'email',$5,$6,$7,$8,$9,$10,$11)`, [id, via, externalId, ourId, brand || "Agent", mailbox, [to], subject, String(text), who, at]);
  return { ok: true, ticket_id: id, via };
}
async function addNote({ ticketId, text, who }) {
  await db(`INSERT INTO hd_messages (ticket_id,source,external_id,from_agent,internal,channel,sender_name,body_text,sent_by,at)
            VALUES ($1,'local',$2,true,true,'internal-note',$3,$4,$3,now())`, [ticketId, `local:${crypto.randomUUID()}`, who, String(text)]);
}
async function addTags(ticketId, tags) {
  if (!tags || !tags.length) return;
  await db(`UPDATE hd_tickets SET tags = (SELECT array_agg(DISTINCT x) FROM unnest(array_cat(tags, $2::text[])) x), updated_at=now() WHERE id=$1`, [ticketId, tags]);
}

/* ---------------- attachments ----------------
 * Gmail keeps the bytes; we keep a reference and fetch on demand. Links are signed so the console
 * and Slack can show a photo without the access key leaking into a URL. */
const ATT_SECRET = process.env.ATTACHMENT_SECRET || process.env.CONSOLE_KEY || "helpdesk";

/* ---- files we generate ourselves (return labels etc.) — stored in Postgres, served by signed link ---- */
async function saveFile({ ticketId, name, contentType, buffer, by }) {
  const id = crypto.randomUUID().replace(/-/g, "");
  await db(`INSERT INTO hd_files (id, ticket_id, name, content_type, data, created_by) VALUES ($1,$2,$3,$4,$5,$6)`, [id, ticketId || null, name, contentType, buffer, by || null]);
  return { file_id: id, name, content_type: contentType, size: buffer.length };
}
async function getFile(id) { const r = (await db(`SELECT id, name, content_type, data FROM hd_files WHERE id=$1`, [id])).rows[0]; return r ? { name: r.name, content_type: r.content_type, buffer: r.data } : null; }
function fileToken(id) { return crypto.createHmac("sha256", ATT_SECRET).update(`file:${id}`).digest("hex").slice(0, 32); }
function fileUrl(base, id) { return `${base}/file/${id}/${fileToken(id)}`; }
function attachmentToken(messageId, idx) { return crypto.createHmac("sha256", ATT_SECRET).update(`${messageId}:${idx}`).digest("hex").slice(0, 32); }
function attachmentUrl(base, messageId, idx) { return `${base}/att/${messageId}/${idx}/${attachmentToken(messageId, idx)}`; }
async function fetchAttachment(messageId, idx) {
  const m = (await db(`SELECT gmail_id, attachments, ticket_id, source, external_id FROM hd_messages WHERE id=$1`, [messageId])).rows[0];
  if (!m) throw new Error("message not found");
  const a = (m.attachments || [])[idx];
  if (!a) throw new Error("attachment not found");
  if (a.gmail_attachment_id && m.gmail_id) {
    const t = (await db(`SELECT mailbox FROM hd_tickets WHERE id=$1`, [m.ticket_id])).rows[0];
    const j = await gapi(t.mailbox, `/messages/${m.gmail_id}/attachments/${a.gmail_attachment_id}`);
    return { name: a.name, content_type: a.content_type || "application/octet-stream", buffer: Buffer.from(String(j.data || "").replace(/-/g, "+").replace(/_/g, "/"), "base64") };
  }
  if (a.url) {                                             // imported from Gorgias — their CDN link
    const buf = await new Promise((resolve, reject) => {
      https.get(a.url, (res) => { const c = []; res.on("data", (d) => c.push(d)); res.on("end", () => resolve(Buffer.concat(c))); }).on("error", reject);
    });
    return { name: a.name, content_type: a.content_type || "application/octet-stream", buffer: buf };
  }
  throw new Error("attachment has no source");
}

/* ---------------- Emily's policy + settings store ----------------
 * The playbook and rules are rows here, edited from Settings in the app. Newest version wins.
 * Cached for a minute so a busy draft loop doesn't re-read them per ticket. */
const policyCache = new Map();
async function policyText(key, fallback) {
  const hit = policyCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.body;
  let body = fallback;
  try { const r = await db(`SELECT body FROM emily_policies WHERE key=$1 ORDER BY id DESC LIMIT 1`, [key]); if (r.rows[0]) body = r.rows[0].body; } catch (e) {}
  policyCache.set(key, { body, exp: Date.now() + 60000 });
  return body;
}
async function seedPolicy(key, body) {
  try {
    const r = await db(`SELECT 1 FROM emily_policies WHERE key=$1 LIMIT 1`, [key]);
    if (!r.rows.length) await db(`INSERT INTO emily_policies (key,body,note,updated_by) VALUES ($1,$2,'seeded from code','system')`, [key, body]);
  } catch (e) { console.error("seedPolicy:", e.message); }
}
async function setting(key, dflt) {
  try { const r = await db(`SELECT value FROM emily_settings WHERE key=$1`, [key]); return r.rows[0] ? r.rows[0].value : dflt; } catch (e) { return dflt; }
}

/* ---- quoted-reply trimming ----
 * Every mail client appends the earlier conversation under "On <date> <who> wrote:", "-----Original Message-----",
 * an Outlook "From:/Sent:" header block, or ">"-prefixed lines. The thread already shows those earlier messages
 * as their own bubbles, so we cut the quoted tail off for display and for Emily's context. The full text stays in
 * hd_messages untouched; the app offers "Show quoted text" per message.                                        */
const QUOTE_MARKERS = [
  /^\s*On\s(?:(?!\n\s*\n)[\s\S]){5,240}?wrote:\s*$/m,                       // Gmail / Apple Mail (may wrap to a 2nd line)
  /^\s*Le\s(?:(?!\n\s*\n)[\s\S]){5,240}?a écrit\s*:\s*$/m,                  // French clients
  /^\s*-{2,}\s*(?:Original|Forwarded) Message\s*-{2,}\s*$/mi,
  /^\s*_{6,}\s*$/m,                                                            // Outlook rule line
  /^\s*From:\s.+\n(?:\s*.+\n){0,3}?\s*(?:Sent|Date):\s.+$/m,                    // Outlook header block
  /^\s*(?:Sent from my (?:iPhone|iPad|Galaxy|Samsung|Android)|Get Outlook for (?:iOS|Android))\s*\.?\s*$/mi,
  /^\s*>/m,                                                                    // first ">"-quoted line
];
function stripQuoted(text) {
  let t = String(text || "").replace(/\r\n?/g, "\n");
  t = t.replace(/\s*\(mailto:[^)]*\)/g, "");                                     // html→text leftovers like "(mailto:x@y.com)"
  t = t.replace(/<\s*wrote:\s*([^>\s]+@[^>\s]+)\s*>/g, "<$1> wrote:");            // Apple Mail's scrambled "< wrote: a@b >"
  let cut = t.length;
  for (const re of QUOTE_MARKERS) { const m = re.exec(t); if (m && m.index < cut) cut = m.index; }
  const head = t.slice(0, cut).replace(/\n{3,}/g, "\n\n").trim();
  if (!head) return { text: t.trim(), quoted: "" };                             // never blank a message that is all quote
  return { text: head, quoted: t.slice(cut).trim() };
}

module.exports = {
  policyText, seedPolicy, setting, policyCache,
  db, pool, migrate, syncGet, syncSet,
  USERS, userFromKey, sessionOf, loadSessions, login, logout, listUsers, createUser, updateUser, checkPassword,
  httpJson, gorgias, slack, slackPost, G_DOMAIN,
  BRAND_MAILBOX, ACTIVE_MAILBOXES, brandForAddress, mailboxForName, resolveMailbox, addressFromMessages, mailboxFromIntegrations,
  runImport, importState: () => importRun, saveTicket, stripHtml, mergeTickets, dedupeTickets, findTicketForEmail, classifyInbound, classifyBacklog, parseShopifyForm, removeTags, bounceReason, JUNK_TAG_SET,
  gmailConfigured, OAUTH_CLIENTS, clientForAddress, clientById, exchangeCode, accessTokenFor, gapi, gmailSend, pollMailbox, pollAll, storeGmailMessage, b64urlEncode, b64urlDecode, formEncode, GMAIL_SCOPES, OAUTH_REDIRECT,
  onInbound, emitInbound,
  sendReply, sendNewEmail, addNote, addTags, htmlify, stripQuoted,
  attachmentToken, attachmentUrl, fetchAttachment, saveFile, getFile, fileToken, fileUrl,
};
