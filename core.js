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
function userFromKey(k) {
  const v = String(k || "").trim();
  if (!v) return null;
  const u = USERS.find((x) => x.key.toLowerCase() === v.toLowerCase());
  if (u) return u.name;
  if (KEY && v === KEY) return "admin";
  return null;
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
  const tags = (t.tags || []).map((x) => x.name);
  const isCollab = !t.spam && COLLAB_RE.test(`${t.subject || ""} ${t.excerpt || ""}`);
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
     (t.customer && t.customer.email) || null, (t.customer && (t.customer.name || t.customer.email)) || null,
     (t.assignee_user && t.assignee_user.name) || null, tags.concat(isCollab ? ["collab"] : []),
     rows.length, t.created_datetime || null, t.updated_datetime || null,
     rows.length ? rows[rows.length - 1].at : null,
     inbound.length ? inbound[inbound.length - 1].at : null,
     outbound.length ? outbound[outbound.length - 1].at : null]
  );
  for (const r of rows) {
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
  const customer = fromAgent ? (to[0] || null) : from.email;
  if (!customer) return null;

  let t = (await db(`SELECT id FROM hd_tickets WHERE gmail_thread_id=$1`, [m.threadId])).rows[0];
  if (!t) {
    const id = (await db(`SELECT nextval('hd_local_ticket_seq')::bigint AS id`)).rows[0].id;
    await db(
      `INSERT INTO hd_tickets (id,source,gmail_thread_id,subject,brand,mailbox,channel,status,spam,customer_email,customer_name,created_at,updated_at)
       VALUES ($1,'gmail',$2,$3,$4,$5,'email','open',$6,$7,$8,$9,$9)`,
      [id, m.threadId, subject, brandForAddress(address), address, labels.includes("SPAM"), customer, fromAgent ? null : from.name, at]);
    t = { id };
  }
  const ins = await db(
    `INSERT INTO hd_messages (ticket_id,source,external_id,rfc_message_id,gmail_id,from_agent,internal,channel,sender_name,sender_email,
                              to_emails,subject,body_text,body_html,attachments,at)
     VALUES ($1,'gmail',$2,$3,$4,$5,false,'email',$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (external_id) DO NOTHING RETURNING id`,
    [t.id, `gmail:${m.id}`, rfcId, m.id, fromAgent, from.name || (fromAgent ? "Agent" : customer), from.email, to, subject,
     body, parts.html || null, JSON.stringify(parts.attachments), at]);
  if (!ins.rows.length) return null;                        // already had it
  if (!fromAgent) setImmediate(() => emitInbound(t.id, ins.rows[0].id));
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
async function pollMailbox(address) {
  const box = (await db(`SELECT * FROM hd_mailboxes WHERE lower(address)=lower($1)`, [address])).rows[0];
  if (!box || !box.refresh_token) return { skipped: true };
  let added = 0, ids = [];
  try {
    if (!box.history_id) {                                   // first run: take the recent window, then go incremental
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
    for (const id of [...new Set(ids)]) {
      const full = await gapi(address, `/messages/${id}?format=full`);
      const r = await storeGmailMessage(address, full);
      if (r) added++;
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
    await db(`UPDATE hd_mailboxes SET last_poll_at=now(), last_error=$2 WHERE lower(address)=lower($1)`, [address, e.message.slice(0, 300)]);
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
async function gmailSend({ mailbox, to, subject, text, threadId, inReplyTo, references, fromName }) {
  const boundaryText = String(text || "");
  const html = boundaryText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  const headers = [
    `From: ${fromName ? `"${fromName.replace(/"/g, "")}" ` : ""}<${mailbox}>`,
    `To: ${to}`,
    `Subject: ${/^re:/i.test(subject || "") ? subject : `Re: ${subject || ""}`}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : null,
    references ? `References: ${references}` : null,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ].filter(Boolean).join("\r\n");
  const raw = b64urlEncode(`${headers}\r\n\r\n${html}`);
  return gapi(mailbox, `/messages/send`, { method: "POST", body: threadId ? { raw, threadId } : { raw } });
}


/* ---------------- inbound hook (Emily listens here) ---------------- */
const inboundListeners = [];
function onInbound(fn) { inboundListeners.push(fn); }
function emitInbound(ticketId, messageId) { for (const fn of inboundListeners) { try { Promise.resolve(fn(ticketId, messageId)).catch((e) => console.error("inbound listener:", e.message)); } catch (e) { console.error("inbound listener:", e.message); } } }

/* ---------------- sending ----------------
 * One path for every outbound email, whoever triggers it: a person in the UI, Emily after approval,
 * or an out-of-stock notice from the warehouse. Gmail when the mailbox is connected; Gorgias as the
 * fallback while history is still being migrated. */
async function sendReply({ ticketId, text, who, via }) {
  const t = (await db(`SELECT * FROM hd_tickets WHERE id=$1`, [ticketId])).rows[0];
  if (!t) throw new Error("ticket not found");
  if (!t.customer_email) throw new Error("no customer email on this ticket");
  const mailbox = t.mailbox || mailboxForName(t.brand) || process.env.GORGIAS_FROM_ADDRESS;
  if (!mailbox) throw new Error(`couldn't work out which mailbox to send from on ticket ${ticketId}`);
  const last = (await db(`SELECT rfc_message_id FROM hd_messages WHERE ticket_id=$1 AND rfc_message_id IS NOT NULL ORDER BY at DESC LIMIT 1`, [ticketId])).rows[0];
  const connected = (await db(`SELECT 1 FROM hd_mailboxes WHERE lower(address)=lower($1) AND refresh_token IS NOT NULL`, [mailbox])).rows.length > 0;
  let sentVia = "gmail", externalId = null;
  if (connected && gmailConfigured()) {
    const r = await gmailSend({ mailbox, to: t.customer_email, subject: t.subject, text, threadId: t.gmail_thread_id,
      inReplyTo: last && last.rfc_message_id, references: last && last.rfc_message_id, fromName: t.brand });
    externalId = `gmail:${r.id}`;
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
  const at = new Date().toISOString();
  await db(
    `INSERT INTO hd_messages (ticket_id,source,external_id,from_agent,internal,channel,sender_name,sender_email,to_emails,subject,body_text,sent_by,at)
     VALUES ($1,$2,$3,true,false,'email',$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (external_id) DO NOTHING`,
    [ticketId, sentVia, externalId || `local:${crypto.randomUUID()}`, t.brand || "Agent", mailbox, [t.customer_email], t.subject, String(text), who, at]);
  await db(`UPDATE hd_tickets SET last_message_at=$2, last_outbound_at=$2, updated_at=$2, status='open',
                   messages_count=(SELECT count(*) FROM hd_messages WHERE ticket_id=$1) WHERE id=$1`, [ticketId, at]);
  await db(`INSERT INTO hd_events (ticket_id,kind,detail,user_name) VALUES ($1,'reply',$2,$3)`, [ticketId, `sent via ${sentVia} from ${mailbox}${via ? ` (${via})` : ""}`, who]);
  return { ok: true, via: sentVia, mailbox, to: t.customer_email };
}
const htmlify = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
// A brand-new outbound conversation (the warehouse's out-of-stock notice). Creates the ticket here first
// so the customer's reply threads straight back onto it.
async function sendNewEmail({ mailbox, to, subject, text, who, tags }) {
  const brand = brandForAddress(mailbox);
  const connected = (await db(`SELECT 1 FROM hd_mailboxes WHERE lower(address)=lower($1) AND refresh_token IS NOT NULL`, [mailbox])).rows.length > 0;
  const id = (await db(`SELECT nextval('hd_local_ticket_seq')::bigint AS id`)).rows[0].id;
  const at = new Date().toISOString();
  let threadId = null, externalId = null, via = "gmail";
  if (connected && gmailConfigured()) {
    const r = await gmailSend({ mailbox, to, subject, text, fromName: brand });
    threadId = r.threadId || null; externalId = `gmail:${r.id}`;
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
  await db(`INSERT INTO hd_messages (ticket_id,source,external_id,from_agent,internal,channel,sender_name,sender_email,to_emails,subject,body_text,sent_by,at)
            VALUES ($1,$2,$3,true,false,'email',$4,$5,$6,$7,$8,$9,$10)`, [id, via, externalId, brand || "Agent", mailbox, [to], subject, String(text), who, at]);
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

module.exports = {
  policyText, seedPolicy, setting, policyCache,
  db, pool, migrate, syncGet, syncSet,
  USERS, userFromKey,
  httpJson, gorgias, slack, slackPost, G_DOMAIN,
  BRAND_MAILBOX, ACTIVE_MAILBOXES, brandForAddress, mailboxForName, resolveMailbox, addressFromMessages, mailboxFromIntegrations,
  runImport, importState: () => importRun, saveTicket, stripHtml,
  gmailConfigured, OAUTH_CLIENTS, clientForAddress, clientById, exchangeCode, accessTokenFor, gapi, gmailSend, pollMailbox, pollAll, storeGmailMessage, b64urlEncode, b64urlDecode, formEncode, GMAIL_SCOPES, OAUTH_REDIRECT,
  onInbound, emitInbound,
  sendReply, sendNewEmail, addNote, addTags, htmlify,
  attachmentToken, attachmentUrl, fetchAttachment,
};
