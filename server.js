/**
 * Helpdesk — the app.  HTTP API + inbox UI.  Everything shared lives in core.js; the agent is emily.js.
 * Start here: `node server.js` boots the database, the web app, the Gmail poller, and Emily.
 */
const express = require("express");
const path = require("path");
const core = require("./core");
const {
  db, pool, migrate, syncGet, userFromKey, USERS,
  BRAND_MAILBOX, ACTIVE_MAILBOXES, brandForAddress, mailboxForName,
  runImport, importState, gmailConfigured, clientForAddress, clientById, exchangeCode, httpJson, gapi, pollMailbox, pollAll,
  b64urlEncode, b64urlDecode, formEncode, GMAIL_SCOPES, OAUTH_REDIRECT,
  sendReply, addNote, slackPost, attachmentToken, attachmentUrl, fetchAttachment, policyText,
} = core;
const crypto = require("crypto");
const EMILY_ID = process.env.EMILY_SLACK_ID || "";
const KEY = process.env.CONSOLE_KEY || "";

/* ---------------- app ---------------- */
const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "2mb" }));
const keyFrom = (req) => (req.query.key || (req.body && req.body.key) || (req.headers.authorization || "").replace(/^Bearer /i, "") || "").toString();
const actorOf = (req) => userFromKey(keyFrom(req)) || "unknown";
function guard(req, res) { if (!userFromKey(keyFrom(req))) { res.status(401).json({ error: "unauthorized" }); return false; } return true; }
app.use(express.static(path.join(__dirname, "public"), { setHeaders: (res, p) => { if (p.endsWith("index.html")) res.setHeader("Cache-Control", "no-cache"); } }));
const VERSION = require("./package.json").version;
app.get("/health", (_q, r) => r.json({ ok: true, version: VERSION }));
app.get("/api/version", (_q, r) => r.json({ version: VERSION, major: "v" + VERSION.split(".")[0] }));
app.get("/api/role", (req, res) => res.json({ ok: !!userFromKey(keyFrom(req)), user: userFromKey(keyFrom(req)) }));

// Pending = the customer is waiting on us. Sent = we answered last. Closed = done.
const CATEGORY_SQL = `CASE WHEN status='closed' THEN 'closed'
  WHEN last_outbound_at IS NOT NULL AND (last_inbound_at IS NULL OR last_outbound_at >= last_inbound_at) THEN 'sent'
  ELSE 'pending' END`;

/* Views — the left-hand choice of WHAT you are looking at.
 *   lb / lbo          every email for that brand, nothing filtered out
 *   lb_tickets / lbo_tickets   only real customer service: the junk a shop inbox collects
 *                     (newsletters, order notifications, agency pitches, review digests, anything
 *                     Emily marked non-CS) is held back, so the list is things that need a person
 *   oos               every out-of-stock case, both brands
 * "Junk" is tag-driven plus a no-reply sender check, so it improves as Emily tags more.  */
const JUNK_TAGS = ["emily-skip", "not-cs", "automated", "automated-notification", "solicitation", "press-pitch", "tiktok-notification", "okendo", "spam"];
const NOREPLY_RE = "(^|[._-])(no-?reply|donotreply|mailer-daemon|postmaster|notifications?|bounces?)@";
const NEEDS_ATTENTION = `NOT spam AND NOT (tags && $JUNK$) AND (customer_email IS NULL OR customer_email !~* '${NOREPLY_RE}')`;
const OOS_MATCH = `(tags && ARRAY['oos-offer','oos','out-of-stock'])`;
function viewClause(view, args) {
  const mb = (a) => { args.push(a); return `lower(mailbox) = lower($${args.length})`; };
  const junk = () => { args.push(JUNK_TAGS); return NEEDS_ATTENTION.replace("$JUNK$", `$${args.length}`); };
  switch (String(view || "")) {
    case "lb": return mb(BRAND_MAILBOX.larkspur);
    case "lbo": return mb(BRAND_MAILBOX.outlet);
    case "lb_tickets": return `${mb(BRAND_MAILBOX.larkspur)} AND ${junk()}`;
    case "lbo_tickets": return `${mb(BRAND_MAILBOX.outlet)} AND ${junk()}`;
    case "oos": return OOS_MATCH;
    case "attention": return junk();
    default: return "TRUE";
  }
}


/* ---- orders: look up and act on a Shopify order from a ticket (address / cancel / refund / replacement) ---- */
app.get("/api/order/:name", async (req, res) => {
  if (!guard(req, res)) return;
  try { const o = await require("./emily").orderDetail(req.params.name); if (o.error) return res.status(400).json(o); if (o.note) return res.status(404).json(o); res.json(o); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/customer", async (req, res) => {
  if (!guard(req, res)) return;
  try { const r = await require("./emily").customerProfile(String(req.query.email || "")); if (r.error) return res.status(400).json(r); res.json(r); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/order/action", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { kind, order, ticketId, input } = req.body || {};
    if (!kind || !order) return res.status(400).json({ error: "kind and order are required" });
    const r = await require("./emily").applyOrderAction({ kind, order, input: input || {}, who: actorOf(req), ticketId: ticketId ? String(ticketId) : null });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ---- queue ---- */
app.get("/api/tickets", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const tab = String(req.query.tab || "pending");
    const view = String(req.query.view || "all");
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const args = [];
    const where = [viewClause(view, args)];
    if (tab === "collabs") where.push(`'collab' = ANY(tags)`);
    else if (["pending", "sent", "closed"].includes(tab)) { args.push(tab); where.push(`${CATEGORY_SQL} = $${args.length}`); }
    if (q) {
      args.push(`%${q}%`);
      const i = args.length;
      where.push(`(subject ILIKE $${i} OR customer_email ILIKE $${i} OR customer_name ILIKE $${i}
                   OR EXISTS (SELECT 1 FROM hd_messages m WHERE m.ticket_id=hd_tickets.id AND m.body_text ILIKE $${i}))`);
    }
    const total = (await db(`SELECT count(*)::int AS n FROM hd_tickets WHERE ${where.join(" AND ")}`, args)).rows[0].n;
    args.push(limit, offset);
    const r = await db(
      `SELECT id, subject, brand, status, customer_email, customer_name, assignee, tags, messages_count,
              last_message_at, last_inbound_at, ${CATEGORY_SQL} AS category,
              (SELECT left(m.body_text, 220) FROM hd_messages m WHERE m.ticket_id=hd_tickets.id AND NOT m.internal ORDER BY m.at DESC LIMIT 1) AS excerpt
         FROM hd_tickets WHERE ${where.join(" AND ")}
        ORDER BY last_message_at DESC NULLS LAST, id DESC
        LIMIT $${args.length - 1} OFFSET $${args.length}`, args);
    const emilyOf = (tags) => (tags || []).includes("emily-sent") ? "sent" : (tags || []).includes("emily-drafted") ? "drafted" : null;
    res.json({
      tickets: r.rows.map((t) => ({
        ...t,
        customer: { name: t.customer_name || t.customer_email, email: t.customer_email },
        last: t.last_message_at,
        unread: t.category === "pending",
        emily: emilyOf(t.tags),
      })),
      count: r.rows.length, total, offset, limit,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/counts", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const view = String(req.query.view || "all");
    const args = [];
    const w = viewClause(view, args);
    const r = await db(`SELECT ${CATEGORY_SQL} AS cat, count(*)::int AS n FROM hd_tickets WHERE ${w} GROUP BY 1`, args);
    const c = { pending: 0, sent: 0, closed: 0 };
    for (const x of r.rows) c[x.cat] = x.n;
    const co = await db(`SELECT count(*)::int AS n FROM hd_tickets WHERE ${w} AND 'collab' = ANY(tags)`, args);
    const all = await db(`SELECT count(*)::int AS n FROM hd_tickets WHERE ${w}`, args);
    // Every view's own badge, so the switcher shows where the work is without clicking through.
    const views = {};
    for (const v of ["lb", "lbo", "lb_tickets", "lbo_tickets", "oos", "all"]) {
      const a2 = []; const w2 = viewClause(v, a2);
      a2.push("pending");
      const n = await db(`SELECT count(*)::int AS n FROM hd_tickets WHERE ${w2} AND ${CATEGORY_SQL} = $${a2.length}`, a2);
      views[v] = n.rows[0].n;
    }
    res.json({ ...c, collabs: co.rows[0].n, all: all.rows[0].n, views });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
/* ---- one conversation ---- */
app.get("/api/ticket/:id", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const id = req.params.id;
    const t = (await db(`SELECT *, ${CATEGORY_SQL} AS category FROM hd_tickets WHERE id=$1`, [id])).rows[0];
    if (!t) return res.status(404).json({ error: "ticket not found" });
    const m = await db(`SELECT id, from_agent, internal, channel, sender_name, sender_email, body_text, body_html, attachments, sent_by, at
                          FROM hd_messages WHERE ticket_id=$1 ORDER BY at ASC, id ASC`, [id]);
    const messages = m.rows.map((x) => ({
      id: x.id, from_agent: x.from_agent, internal: x.internal, channel: x.channel,
      sender: x.sender_name || (x.from_agent ? "Agent" : "Customer"), sender_email: x.sender_email,
      ...(() => { const q = core.stripQuoted(x.body_text); return { text: q.text, quoted: q.quoted }; })(), at: x.at,
      attachments: (x.attachments || []).map((a, i) => ({ name: a.name, content_type: a.content_type, size: a.size, url: attachmentUrl("", x.id, i) })),
      emily_draft: x.internal && /emily'?s suggested reply|review\s*&?(?:amp;)?\s*send/i.test(x.body_text || ""),
    }));
    const scan = [t.subject || ""].concat(messages.map((x) => x.text)).join("  ");
    const orders = [...new Set((scan.match(/#?\b((?:LBO|LB|BB)\s?\d{3,6})\b/gi) || []).map((s) => s.replace(/[#\s]/g, "").toUpperCase()))].slice(0, 8);
    const events = (await db(`SELECT kind, detail, user_name, ts FROM hd_events WHERE ticket_id=$1 ORDER BY ts DESC LIMIT 20`, [id])).rows;
    res.json({
      id: t.id, subject: t.subject, status: t.status, brand: t.brand, brand_address: t.mailbox, channel: t.channel,
      created: t.created_at, updated: t.updated_at, messages_count: messages.length, assignee: t.assignee,
      customer: { name: t.customer_name || t.customer_email || "Customer", email: t.customer_email },
      tags: t.tags || [], category: t.category, source: t.source, orders, events, messages,
      emily: (t.tags || []).includes("emily-sent") ? "sent" : (t.tags || []).includes("emily-drafted") ? "drafted" : null,
      emily_draft: (await db(`SELECT id, draft, intent, sentiment, escalate, escalate_reason, outcome, created_at FROM emily_drafts WHERE ticket_id=$1 ORDER BY id DESC LIMIT 1`, [String(id)])).rows[0] || null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
/* ---- reply ---- */
app.post("/api/reply", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { id, text } = req.body || {};
    if (!id || !text || !String(text).trim()) return res.status(400).json({ error: "id and text required" });
    const who = actorOf(req);
    const r = await sendReply({ ticketId: id, text: String(text), who, via: "helpdesk" });
    // If Emily had a draft waiting on this ticket, a human reply settles it.
    try { const emily = require("./emily"); await emily.onHumanReply(id, String(text), who); } catch (e) {}
    slackPost(`✉️ *Reply sent* → ${r.to} · ${r.mailbox} · ticket ${id} · by ${who}\n>>> ${String(text).slice(0, 500)}`);
    res.json({ ok: true, via: r.via });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/note", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { id, text } = req.body || {};
    if (!id || !text) return res.status(400).json({ error: "id and text required" });
    const who = actorOf(req);
    await addNote({ ticketId: id, text, who });
    await db(`INSERT INTO hd_events (ticket_id,kind,detail,user_name) VALUES ($1,'note','',$2)`, [id, who]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/status", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { id, status } = req.body || {};
    if (!id || !["open", "closed"].includes(status)) return res.status(400).json({ error: "id and status open|closed required" });
    const who = actorOf(req);
    await db(`UPDATE hd_tickets SET status=$2, updated_at=now() WHERE id=$1`, [id, status]);
    await db(`INSERT INTO hd_events (ticket_id,kind,detail,user_name) VALUES ($1,'status',$2,$3)`, [id, status, who]);
    slackPost(`${status === "closed" ? "✅ Closed" : "↩️ Reopened"} ticket ${id} · by ${who}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/assign", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { id, assignee } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    const who = actorOf(req);
    const to = assignee === null || assignee === "" ? null : String(assignee);
    await db(`UPDATE hd_tickets SET assignee=$2, updated_at=now() WHERE id=$1`, [id, to]);
    await db(`INSERT INTO hd_events (ticket_id,kind,detail,user_name) VALUES ($1,'assign',$2,$3)`, [id, to || "unassigned", who]);
    res.json({ ok: true, assignee: to });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/spam", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { id, spam } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    await db(`UPDATE hd_tickets SET spam=$2, updated_at=now() WHERE id=$1`, [id, spam !== false]);
    await db(`INSERT INTO hd_events (ticket_id,kind,detail,user_name) VALUES ($1,'spam',$2,$3)`, [id, String(spam !== false), actorOf(req)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/ask-emily", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    if (!EMILY_ID) return res.status(503).json({ error: "Emily Slack id not configured" });
    const r = await slackPost(`<@${EMILY_ID}> please draft ticket ${id}`);
    res.json({ ok: true, posted: !!(r && r.ok !== false) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* ---- Emily: policies, settings, activity ---- */
const POLICY_KEYS = ["playbook", "rules"];
app.get("/api/emily/policies", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const out = {};
    for (const k of POLICY_KEYS) {
      const r = await db(`SELECT id, body, note, updated_by, created_at, (SELECT count(*)::int FROM emily_policies p2 WHERE p2.key=$1) AS versions
                            FROM emily_policies WHERE key=$1 ORDER BY id DESC LIMIT 1`, [k]);
      out[k] = r.rows[0] || null;
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/emily/policies/:key/history", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    if (!POLICY_KEYS.includes(req.params.key)) return res.status(400).json({ error: "unknown policy" });
    const r = await db(`SELECT id, note, updated_by, created_at, length(body) AS chars FROM emily_policies WHERE key=$1 ORDER BY id DESC LIMIT 30`, [req.params.key]);
    res.json({ history: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/emily/policies/:key/version/:id", async (req, res) => {
  if (!guard(req, res)) return;
  try { const r = await db(`SELECT id, body, note, updated_by, created_at FROM emily_policies WHERE key=$1 AND id=$2`, [req.params.key, req.params.id]); res.json(r.rows[0] || {}); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
// Saving never overwrites: it adds a version. Emily reads the newest within a minute.
app.put("/api/emily/policies/:key", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const key = req.params.key;
    if (!POLICY_KEYS.includes(key)) return res.status(400).json({ error: "unknown policy" });
    const body = String((req.body && req.body.body) || "");
    if (body.trim().length < 50) return res.status(400).json({ error: "that's too short to be a policy — nothing saved" });
    const r = await db(`INSERT INTO emily_policies (key, body, note, updated_by) VALUES ($1,$2,$3,$4) RETURNING id, created_at`,
      [key, body, String((req.body && req.body.note) || "").slice(0, 200) || null, actorOf(req)]);
    res.json({ ok: true, id: r.rows[0].id, at: r.rows[0].created_at });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/emily/settings", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const r = await db(`SELECT key, value, updated_by, updated_at FROM emily_settings`);
    const o = {}; for (const x of r.rows) o[x.key] = { value: x.value, updated_by: x.updated_by, updated_at: x.updated_at };
    if (!o.auto_send) o.auto_send = { value: { enabled: false, intents: ["tracking", "subscription", "sizing_care", "returns_info", "policy_info"] } };
    res.json(o);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/emily/settings/:key", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    if (!["auto_send"].includes(req.params.key)) return res.status(400).json({ error: "unknown setting" });
    const v = (req.body && req.body.value) || {};
    await db(`INSERT INTO emily_settings (key, value, updated_by, updated_at) VALUES ($1,$2,$3,now())
              ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [req.params.key, JSON.stringify(v), actorOf(req)]);
    try { await db(`INSERT INTO hd_events (ticket_id,kind,detail,user_name) VALUES (NULL,'emily-setting',$1,$2)`, [`${req.params.key}=${JSON.stringify(v)}`.slice(0, 500), actorOf(req)]); } catch (e) {}
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// What Emily did lately: drafts by outcome, plus the last few actions she staged.
app.get("/api/emily/activity", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const o = await db(`SELECT COALESCE(outcome,'waiting') AS outcome, count(*)::int AS n FROM emily_drafts WHERE created_at > now() - ($1||' days')::interval GROUP BY 1`, [days]);
    const i = await db(`SELECT COALESCE(intent,'?') AS intent, count(*)::int AS n FROM emily_drafts WHERE created_at > now() - ($1||' days')::interval GROUP BY 1 ORDER BY 2 DESC LIMIT 12`, [days]);
    const a = await db(`SELECT kind, title, status, decided_by, created_at, decided_at FROM emily_actions ORDER BY created_at DESC LIMIT 25`);
    const e = await db(`SELECT ticket_id, intent, escalate_reason, draft, final_text, decided_by, decided_at FROM emily_drafts WHERE outcome='edited' ORDER BY decided_at DESC LIMIT 15`);
    res.json({ days, outcomes: o.rows, intents: i.rows, actions: a.rows, edits: e.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* ---- attachments (signed links; no access key in the URL) ---- */
app.get("/att/:mid/:idx/:tok", async (req, res) => {
  try {
    const { mid, idx, tok } = req.params;
    if (attachmentToken(mid, idx) !== tok) return res.status(403).send("bad link");
    const a = await fetchAttachment(mid, Number(idx));
    res.setHeader("Content-Type", a.content_type);
    res.setHeader("Content-Disposition", `inline; filename="${String(a.name || "file").replace(/"/g, "")}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(a.buffer);
  } catch (e) { res.status(404).send(e.message); }
});
/* ---- Emily's draft on a ticket: approve / edit-and-send / skip, from the app instead of Slack ---- */
app.post("/api/emily/decide", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { id, action, text } = req.body || {};
    if (!id || !["approve", "edit", "skip", "redraft"].includes(action)) return res.status(400).json({ error: "id and action approve|edit|skip|redraft required" });
    const emily = require("./emily");
    const r = await emily.decide({ ticketId: String(id), action, text, who: actorOf(req) });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---- admin: import + mailbox connection ---- */
app.post("/api/import/start", async (req, res) => {
  if (!guard(req, res)) return;
  try { res.json(await runImport({ resume: req.body && req.body.restart ? false : true })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/import/status", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const saved = await syncGet("gorgias_import");
    const done = await syncGet("gorgias_import_done");
    const counts = await db(`SELECT (SELECT count(*)::int FROM hd_tickets) AS tickets, (SELECT count(*)::int FROM hd_messages) AS messages`);
    res.json({ run: importState(), saved: saved && saved.state, finished: done && done.state, stored: counts.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/mailboxes", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const r = await db(`SELECT address, brand, (refresh_token IS NOT NULL) AS connected, connected_by, connected_at, last_poll_at, last_error FROM hd_mailboxes ORDER BY address`);
    const have = new Set(r.rows.map((x) => x.address.toLowerCase()));
    const missing = ACTIVE_MAILBOXES.filter((a) => !have.has(a)).map((a) => ({ address: a, brand: brandForAddress(a), connected: false }));
    // Anything connected that is no longer an active mailbox is shown as retired, not offered again.
    const rows = r.rows.map((x) => ({ ...x, retired: !ACTIVE_MAILBOXES.includes(x.address.toLowerCase()) }));
    res.json({ mailboxes: [...rows, ...missing], oauth_ready: gmailConfigured() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/oauth/gmail/start", (req, res) => {
  if (!guard(req, res)) return;
  if (!gmailConfigured()) return res.status(503).send("Google OAuth isn't configured yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / OAUTH_REDIRECT).");
  const address = String(req.query.address || "");
  const client = clientForAddress(address);
  if (!client) return res.status(503).send("No Google OAuth client is configured for that mailbox.");
  const state = b64urlEncode(JSON.stringify({ k: keyFrom(req), c: client.client_id, n: crypto.randomBytes(6).toString("hex") }));
  const url = "https://accounts.google.com/o/oauth2/v2/auth?" + formEncode({
    client_id: client.client_id, redirect_uri: OAUTH_REDIRECT, response_type: "code", access_type: "offline",
    prompt: "consent", include_granted_scopes: "true", scope: GMAIL_SCOPES.join(" "), state,
    login_hint: String(req.query.address || ""),
  });
  res.redirect(url);
});
app.get("/oauth/gmail/callback", async (req, res) => {
  try {
    if (req.query.error) {
      const hints = {
        org_internal: "This Google project only allows accounts from its own Google Workspace. The mailbox you signed in with belongs to a different Workspace — it needs its own OAuth client (set in GOOGLE_OAUTH_CLIENTS), or the project's OAuth consent screen must be set to External.",
        access_denied: "Google refused the sign-in. Either you clicked Cancel, or the project's consent screen is in Testing mode and this mailbox isn't listed as a test user (Google Cloud → APIs & Services → OAuth consent screen → Test users).",
        redirect_uri_mismatch: `The OAuth client doesn't list ${OAUTH_REDIRECT} as an authorized redirect URI.`,
        admin_policy_enforced: "Your Google Workspace admin has blocked third-party apps for this account. In admin.google.com → Security → API controls, allow this app.",
      };
      return res.status(400).send(`<body style="font-family:system-ui;padding:40px;max-width:640px"><h2>Google said: ${String(req.query.error)}</h2><p>${hints[String(req.query.error)] || String(req.query.error_description || "")}</p><p><a href="/">Back to Helpdesk</a></p></body>`);
    }
    let who = "unknown", usedClient = null;
    try {
      const st = JSON.parse(b64urlDecode(String(req.query.state || "")));
      who = userFromKey(st.k) || "unknown";
      usedClient = clientById(st.c);
    } catch (e) {}
    if (who === "unknown") return res.status(401).send("That link didn't carry a valid access key — start again from Settings.");
    const tok = await exchangeCode(String(req.query.code || ""), usedClient);
    if (!tok.refresh_token) return res.status(400).send("Google didn't return a refresh token. Remove this app at myaccount.google.com/permissions and connect again.");
    const prof = await httpJson("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: `Bearer ${tok.access_token}` } });
    const address = String(prof.emailAddress || "").toLowerCase();
    await db(
      `INSERT INTO hd_mailboxes (address,brand,refresh_token,client_id,connected_by,connected_at) VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (address) DO UPDATE SET refresh_token=EXCLUDED.refresh_token, brand=EXCLUDED.brand,
         client_id=EXCLUDED.client_id, connected_by=EXCLUDED.connected_by, connected_at=now(), last_error=NULL`,
      [address, brandForAddress(address), tok.refresh_token, (usedClient || clientForAddress(address) || {}).client_id || null, who]);
    slackPost(`📬 ${address} connected to the console by ${who} — mail now flows in directly.`);
    setTimeout(() => pollMailbox(address).catch(() => {}), 1000);
    res.send(`<body style="font-family:system-ui;background:#0b1220;color:#e6edf6;padding:40px"><h2>✅ ${address} connected</h2><p>Mail for this mailbox now lands in the console. You can close this tab.</p></body>`);
  } catch (e) { res.status(500).send(`Connection failed: ${e.message}`); }
});
app.post("/api/admin/dedupe", async (req, res) => {
  if (!guard(req, res)) return;
  try { const n = await core.dedupeTickets(); res.json({ ok: true, merged: n }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/mailbox/poll", async (req, res) => {
  if (!guard(req, res)) return;
  try { res.json(await pollMailbox(String((req.body && req.body.address) || ""))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 8080;
(async () => {
  if (pool) { try { await migrate(); console.log("🗄️  Helpdesk schema ready"); } catch (e) { console.error("migrate failed:", e.message); } }
  // One-time after v3.1: fold together tickets that arrived twice (Gorgias import + Gmail) before the two paths were linked.
  if (pool) { try { if (!(await syncGet("dedupe_v3_1"))) { const n = await core.dedupeTickets(); await core.syncSet("dedupe_v3_1", String(n), { at: new Date().toISOString() }); console.log(`🧹 duplicate sweep done — ${n} merged`); } } catch (e) { console.error("dedupe:", e.message); } }
  app.listen(PORT, () => {
    console.log(`📨 Helpdesk v${VERSION} on :${PORT}`);
    console.log(`🔎 boot → users:${USERS.map((u) => u.name).join("/") || "(none)"}${KEY ? "+admin-key" : ""} · db:${pool ? "set" : "MISSING"} · gorgias-import:${core.G_DOMAIN || "off"} · gmail-oauth:${gmailConfigured() ? `${core.OAUTH_CLIENTS.length} client${core.OAUTH_CLIENTS.length === 1 ? "" : "s"}` : "not configured"} · slack:${process.env.SLACK_BOT_TOKEN || process.env.EMILY_SLACK_BOT_TOKEN ? "set" : "off"}`);
  });
  if (pool && gmailConfigured()) {
    const every = Number(process.env.GMAIL_POLL_SEC || 45) * 1000;
    setTimeout(pollAll, 8000); setInterval(pollAll, every);
    console.log(`📬 Gmail polling every ${every / 1000}s`);
  }
  // Emily — the agent. Runs inside this process; drafts on every inbound message; talks in Slack.
  try { await require("./emily").start(); } catch (e) { console.error("Emily failed to start:", e.message); }
})();
