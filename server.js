/**
 * Buzzin — the app.  HTTP API + inbox UI.  Everything shared lives in core.js; the agent is emily.js.
 * Start here: `node server.js` boots the database, the web app, the Gmail poller, and Emily.
 */
const express = require("express");
const path = require("path");
const fs = require("fs");
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
const VERSION = require("./package.json").version;
// index.html is served with the running version stamped in, and never cached, so a new deploy is picked up on the next load.
const INDEX_HTML = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8").replace(/__VERSION__/g, VERSION);
// Branded portal domains (returns.larkspurbaby.com, returns.larkspurbabyoutlet.com) show only that store's portal —
// never Buzzin. "/" is the portal; anything outside the portal's own paths goes back to "/".
// Short-link domains (go.larkspurbaby.com): go.larkspurbaby.com/AbC123 opens the link; nothing else of Buzzin is served there.
app.use((req, res, next) => {
  const h = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().split(":")[0].toLowerCase();
  if (!h || !require("./mk-analytics").linkHosts().includes(h)) return next();
  const p = req.path;
  if (/^\/[A-Za-z0-9_-]{4,20}$/.test(p)) { req.url = "/l" + req.url; return next(); }
  if (p.startsWith("/l/") || p.startsWith("/mk/")) return next();
  const store = h.replace(/^go\./, "");
  return res.redirect(302, `https://${store}/`);
});
app.use((req, res, next) => {
  const d = R.storeForHost(String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().split(":")[0]);
  if (!d) return next();
  const p = req.path;
  if (p === "/" || p === "/index.html") { req.url = `/returns/${d.key}` + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""); return next(); }
  if (p === `/returns/${d.key}` && !req.query.preview) return res.redirect(301, "/");
  if (p === "/robots.txt") return res.type("text").send("User-agent: *\nAllow: /\n");
  if (p.startsWith(`/chat/${d.key}/`) || p.startsWith(`/api/chat/${d.key}/`) || p.startsWith("/brand/")) return next();   // website chat widget
  if (p.startsWith(`/mkf/${d.key}/`) || p.startsWith(`/api/mkf/${d.key}/`) || p.startsWith("/mk/u/") || p.startsWith("/mk/p/") || p.startsWith("/mk/img/") || p.startsWith("/mk/o/") || p.startsWith("/mk/l/") || p.startsWith("/l/") || p.startsWith("/mk/ses/") || p.startsWith("/mk/sms/aws/")) return next();   // sign-up forms, unsubscribe pages, email images
  if (p.startsWith("/returns/label/") || p.startsWith("/returns/print/") || p.startsWith("/returns/asset/") || p.startsWith("/api/returns/public/") || p === `/returns/${d.key}`) return next();
  return res.redirect(302, "/");
});
app.get(["/", "/index.html"], (_q, r) => { r.setHeader("Cache-Control", "no-store"); r.type("html").send(INDEX_HTML); });
app.use(express.static(path.join(__dirname, "public"), { index: false, setHeaders: (res, p) => { if (p.endsWith("sw.js")) res.setHeader("Cache-Control", "no-store"); } }));
app.get("/health", (_q, r) => r.json({ ok: true, version: VERSION }));
// Claude connector: lets Claude read tickets, Emily's drafts/actions and policies, and add internal notes. Off unless BUZZIN_MCP_TOKEN is set.
require("./mcp")(app, { core });
// Emily's replies page: website chat transcripts + emails she sent / tickets she closed on her own.
require("./replies").mount(app, { guard });
app.get("/api/version", (_q, r) => r.json({ version: VERSION, major: "v" + VERSION.split(".")[0] }));
app.get("/api/role", (req, res) => { const s = core.sessionOf(keyFrom(req)); res.json({ ok: !!s, user: s ? s.name : null, role: s ? s.role : null, email: s ? s.email : null }); });
const isAdmin = (req) => { const s = core.sessionOf(keyFrom(req)); return !!(s && s.role === "admin"); };
/* ---- accounts ---- */
app.post("/api/login", async (req, res) => {
  try { const { email, password } = req.body || {}; res.json(await core.login({ email, password, ip: req.ip })); }
  catch (e) { res.status(401).json({ error: e.message }); }
});
app.post("/api/logout", async (req, res) => { await core.logout(keyFrom(req)); res.json({ ok: true }); });
app.get("/api/users", async (req, res) => {
  if (!guard(req, res)) return; if (!isAdmin(req)) return res.status(403).json({ error: "admins only" });
  try { res.json({ users: await core.listUsers() }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/users", async (req, res) => {
  if (!guard(req, res)) return; if (!isAdmin(req)) return res.status(403).json({ error: "admins only" });
  try { const { name, email, password, role } = req.body || {}; res.json({ user: await core.createUser({ name, email, password, role, by: actorOf(req) }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/users/:id", async (req, res) => {
  if (!guard(req, res)) return; if (!isAdmin(req)) return res.status(403).json({ error: "admins only" });
  try { const { name, role, active, password } = req.body || {}; res.json({ user: await core.updateUser(Number(req.params.id), { name, role, active, password, by: actorOf(req) }) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/me/password", async (req, res) => {          // anyone can change their own password
  if (!guard(req, res)) return;
  try { const s = core.sessionOf(keyFrom(req)); if (!s || !s.user_id) return res.status(400).json({ error: "Env-key users don't have a password here." });
    const { current, password } = req.body || {}; const u = (await db(`SELECT * FROM hd_users WHERE id=$1`, [s.user_id])).rows[0];
    if (!core.checkPassword(current, u.pass_salt, u.pass_hash)) return res.status(400).json({ error: "Current password is wrong." });
    await core.updateUser(s.user_id, { password, by: s.name }); res.json({ ok: true, relogin: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// Pending = the customer is waiting on us. Sent = we answered last. Closed = done.
const CATEGORY_SQL = `CASE WHEN status='closed' THEN 'closed'
  WHEN reopened_at IS NOT NULL AND (last_outbound_at IS NULL OR reopened_at > last_outbound_at) THEN 'pending'
  WHEN last_outbound_at IS NOT NULL AND (last_inbound_at IS NULL OR last_outbound_at >= last_inbound_at) THEN 'sent'
  ELSE 'pending' END`;

/* Views — the left-hand choice of WHAT you are looking at.
 *   lb / lbo          every email for that brand, nothing filtered out
 *   lb_tickets / lbo_tickets   only real customer service: the junk a shop inbox collects
 *                     (newsletters, order notifications, agency pitches, review digests, anything
 *                     Emily marked non-CS) is held back, so the list is things that need a person
 *   oos               every out-of-stock case, both brands
 * "Junk" is tag-driven plus a no-reply sender check, so it improves as Emily tags more.  */
const JUNK_TAGS = core.JUNK_TAG_SET;
const NOREPLY_RE = "(^|[._-])(no-?reply|donotreply|mailer-daemon|postmaster|notifications?|bounces?)@";
const NEEDS_ATTENTION = `NOT spam AND ('human' = ANY(tags) OR (NOT (tags && $JUNK$) AND (customer_email IS NULL OR customer_email !~* '${NOREPLY_RE}')))`;
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
  try { const r = await require("./emily").customerProfile(String(req.query.email || ""), String(req.query.order || "")); if (r.error) return res.status(400).json(r); res.json(r); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/order/action", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { kind, order, ticketId, input } = req.body || {};
    if (!kind || !order) return res.status(400).json({ error: "kind and order are required" });
    const r = await require("./emily").applyOrderAction({ kind, order, input: input || {}, who: actorOf(req), ticketId: ticketId ? String(ticketId) : null });
    await core.audit({ ticketId: ticketId || null, kind: `order-${kind}`, detail: r.note || r.title || "", who: actorOf(req), target: order });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

/* ---- activity log: everything anyone (or Emily) did, newest first ---- */
app.get("/api/activity", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500), offset = Math.max(Number(req.query.offset) || 0, 0);
    const args = [], where = [];
    if (req.query.who) { args.push(`%${req.query.who}%`); where.push(`user_name ILIKE $${args.length}`); }
    if (req.query.kind) { args.push(`${req.query.kind}%`); where.push(`kind ILIKE $${args.length}`); }
    if (req.query.q) { args.push(`%${req.query.q}%`); where.push(`(detail ILIKE $${args.length} OR target ILIKE $${args.length} OR ticket_id::text ILIKE $${args.length})`); }
    if (req.query.since) { args.push(req.query.since); where.push(`ts >= $${args.length}`); }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = (await db(`SELECT count(*)::int AS n FROM hd_events ${w}`, args)).rows[0].n;
    args.push(limit, offset);
    const r = await db(`SELECT e.id, e.ts, e.user_name AS who, e.kind, e.detail, e.target, e.ticket_id, t.subject, t.customer_email
                          FROM hd_events e LEFT JOIN hd_tickets t ON t.id = e.ticket_id ${w} ORDER BY e.ts DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args);
    const whos = (await db(`SELECT user_name, count(*)::int AS n FROM hd_events WHERE ts > now() - interval '30 days' GROUP BY user_name ORDER BY n DESC LIMIT 20`)).rows;
    res.json({ items: r.rows, total, limit, offset, whos });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---- stuck packages (Shopify "Tracking added" for 4+ days) ---- */
app.get("/api/stuck", async (req, res) => {
  if (!guard(req, res)) return;
  try { const r = await require("./emily").listStuck(String(req.query.state || ""), String(req.query.kind || "")); r.items = r.items.map((x) => ({ ...x, email_template: require("./emily").stuckEmailTemplate(x) })); res.json(r); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/stuck/refresh", async (req, res) => {
  if (!guard(req, res)) return;
  try { const r = await require("./emily").scanStuck(); await core.audit({ kind: "shipment-scan", detail: `${r.scanned} orders · ${r.never_scanned} never scanned · ${r.undelivered} not delivered`, who: actorOf(req) }); res.json(r); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/stuck/state", async (req, res) => {
  if (!guard(req, res)) return;
  try { const { id, state, note, kind } = req.body || {}; const r = await require("./emily").setStuckState(String(id), String(state), actorOf(req), note, kind); await core.audit({ kind: `shipment-${state}`, detail: `${kind || "never_scanned"}${note ? ` — ${note}` : ""}`, who: actorOf(req), target: id }); res.json(r); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.get("/api/stuck/options", async (req, res) => {
  if (!guard(req, res)) return;
  try { res.json(await require("./emily").stuckOptions(String(req.query.id || ""), String(req.query.kind || ""))); } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/stuck/offer", async (req, res) => {
  if (!guard(req, res)) return;
  try { const { id, kind, type, text, issue_now } = req.body || {}; if (!text || !String(text).trim()) return res.status(400).json({ error: "text required" });
    const r = await require("./emily").stuckOffer(String(id), String(kind || ""), { type, text: String(text), issue_now: !!issue_now, who: actorOf(req) }); await core.audit({ ticketId: r.ticket_id, kind: `offer-${type}`, detail: r.note || "", who: actorOf(req), target: id }); res.json(r); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/stuck/email", async (req, res) => {
  if (!guard(req, res)) return;
  try { const { id, text, kind } = req.body || {}; if (!text || !String(text).trim()) return res.status(400).json({ error: "text required" }); const r = await require("./emily").emailStuckCustomer(String(id), actorOf(req), String(text), kind); await core.audit({ ticketId: r.ticket_id, kind: "shipment-email", detail: `emailed customer about ${kind || "never_scanned"} package`, who: actorOf(req), target: id }); res.json(r); }
  catch (e) { res.status(400).json({ error: e.message }); }
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
      args.push(q.replace(/^#/, "").trim());
      const j = args.length;
      where.push(`(id::text = $${j} OR subject ILIKE $${i} OR customer_email ILIKE $${i} OR customer_name ILIKE $${i} OR order_number ILIKE $${i}
                   OR EXISTS (SELECT 1 FROM hd_messages m WHERE m.ticket_id=hd_tickets.id AND m.body_text ILIKE $${i}))`);
    }
    const total = (await db(`SELECT count(*)::int AS n FROM hd_tickets WHERE ${where.join(" AND ")}`, args)).rows[0].n;
    args.push(limit, offset);
    const r = await db(
      `SELECT id, subject, brand, status, customer_email, customer_name, assignee, tags, messages_count, order_number,
              (SELECT row_to_json(oc) FROM hd_order_cache oc WHERE oc.order_name = hd_tickets.order_number) AS order_info,
              last_message_at, last_inbound_at, ${CATEGORY_SQL} AS category,
              (SELECT left(m.body_text, 220) FROM hd_messages m WHERE m.ticket_id=hd_tickets.id AND NOT m.internal ORDER BY m.at DESC LIMIT 1) AS excerpt
              ${view === "oos" ? `, (SELECT row_to_json(x) FROM (SELECT c.status AS case_status, c.order_number, c.order_status, c.resolution, c.sent_at, c.followup_sent_at, c.item_name, c.items FROM oos_cases c WHERE c.ticket_id = hd_tickets.id::text ORDER BY c.created_at DESC LIMIT 1) x) AS oos` : ""}
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

/* ---- New ticket (outbound first): pick the store, Emily can draft from notes, send → ticket is created ---- */
app.post("/api/emily/compose", async (req, res) => {
  if (!guard(req, res)) return;
  const { mailbox, to, name, order, subject, notes } = req.body || {};
  if (!mailbox || !core.ACTIVE_MAILBOXES.includes(String(mailbox).toLowerCase())) return res.status(400).json({ error: "Pick a store first." });
  if (!String(notes || "").trim()) return res.status(400).json({ error: "Tell Emily what the email should say." });
  try {
    const emily = require("./emily");
    const j = await emily.composeEmail({ brand: core.brandForAddress(mailbox), mailbox: String(mailbox).toLowerCase(), to: String(to || "").trim(), name, order: String(order || "").trim(), subject, notes: String(notes).trim(), who: actorOf(req) });
    res.json({ ok: true, ...j });
  } catch (e) { res.status(500).json({ error: /credit balance/i.test(e.message) ? "Emily's AI account is out of credits — top up at console.anthropic.com." : e.message }); }
});
app.post("/api/ticket/new", async (req, res) => {
  if (!guard(req, res)) return;
  const { mailbox, to, name, order, subject, text } = req.body || {};
  const box = String(mailbox || "").toLowerCase();
  if (!core.ACTIVE_MAILBOXES.includes(box)) return res.status(400).json({ error: "Pick a store first." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to || "").trim())) return res.status(400).json({ error: "Enter a valid customer email." });
  if (!String(subject || "").trim() || !String(text || "").trim()) return res.status(400).json({ error: "Subject and message are both needed." });
  const who = actorOf(req);
  try {
    const r = await core.sendNewEmail({ mailbox: box, to: String(to).trim(), subject: String(subject).trim(), text: String(text), who, tags: ["agent-started"], name: String(name || "").trim() || undefined });
    const id = r.ticket_id;
    if (order) await core.setTicketOrder(id, `#${String(order).trim()}`).catch(() => {});
    await core.audit({ ticketId: id, kind: "ticket-created", detail: `New conversation started with ${String(to).trim()} from ${core.brandForAddress(box)}${order ? ` about ${String(order).trim()}` : ""}`, who, target: String(to).trim() });
    res.json({ ok: true, id });
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
    let stuck = { never_scanned: 0, undelivered: 0 }; try { stuck = await require("./emily").stuckCounts(); } catch (_) {}
    let returns = null; try { const rc = await require("./returns").counts(); returns = { open: rc.open, attention: rc.attention, loop: rc.loop || null, unchecked: rc.unchecked || 0 }; } catch (_) {}
    let claims = null; try { claims = (await require("./claims").counts()).open || 0; } catch (_) {}
    let faq = null; try { faq = (await require("./faqs").status()).pending || 0; } catch (_) {}
    let pickup = null; try { pickup = await require("./pickup").count(); } catch (_) {}
    res.json({ ...c, collabs: co.rows[0].n, all: all.rows[0].n, views, stuck, returns, claims, faq, pickup });
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
      attachments: (x.attachments || []).map((a, i) => ({ name: a.name, content_type: a.content_type, size: a.size, url: a.file_id ? core.fileUrl("", a.file_id) : attachmentUrl("", x.id, i) })),
      emily_draft: x.internal && /emily'?s suggested reply|review\s*&?(?:amp;)?\s*send/i.test(x.body_text || ""),
    }));
    const scan = [t.subject || ""].concat(messages.map((x) => x.text)).join("  ");
    const orders = [...new Set((scan.match(/#?\b((?:LBO|LB|BB)\s?\d{3,6})\b/gi) || []).map((s) => s.replace(/[#\s]/g, "").toUpperCase()))].slice(0, 8);
    const events = (await db(`SELECT kind, detail, user_name, target, ts FROM hd_events WHERE ticket_id=$1 ORDER BY ts DESC LIMIT 100`, [id])).rows;
    res.json({
      id: t.id, subject: t.subject, status: t.status, brand: t.brand, brand_address: t.mailbox, channel: t.channel, order_number: t.order_number || null,
      created: t.created_at, updated: t.updated_at, messages_count: messages.length, assignee: t.assignee,
      customer: { name: t.customer_name || t.customer_email || "Customer", email: t.customer_email },
      tags: t.tags || [], category: t.category, source: t.source, orders, events, messages,
      emily: (t.tags || []).includes("emily-sent") ? "sent" : (t.tags || []).includes("emily-drafted") ? "drafted" : null,
      emily_draft: (await db(`SELECT id, draft, intent, sentiment, escalate, escalate_reason, outcome, todo, created_at FROM emily_drafts WHERE ticket_id=$1 ORDER BY id DESC LIMIT 1`, [String(id)])).rows[0] || null,
      pending_files: await require("./emily").pendingFiles(id).catch(() => []),
      emily_actions: await require("./emily").listActions(id).catch(() => []),
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
    let body = String(text);
    try { const f = await require("./emily").fillPlaceholders(id, body); if (f.pending) return res.status(400).json({ error: "Your reply still has a {{DISCOUNT_CODE}} placeholder — apply the discount on Emily's card first, or replace it." }); body = f.text; } catch (e) {}
    let files = [];
    try { files = (await require("./emily").pendingFiles(id)).map((f) => f.file_id); } catch (e) {}
    const r = await sendReply({ ticketId: id, text: body, who, via: "buzzin", files });
    if (files.length && r.via !== "gorgias") { try { await require("./emily").markFilesSent(id); } catch (e) {} }
    // If Emily had a draft waiting on this ticket, a human reply settles it.
    try { const emily = require("./emily"); await emily.onHumanReply(id, String(text), who); } catch (e) {}
    slackPost(`✉️ *Reply sent* → ${r.to} · ${r.mailbox} · ticket ${id} · by ${who}\n>>> ${String(text).slice(0, 500)}`);
    res.json({ ok: true, via: r.via, attached: r.attached || 0, warning: files.length && r.via === "gorgias" ? "Sent through Gorgias, which can't carry attachments — they're still waiting for the next reply." : null });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Attach a file to the next reply on a ticket (image, label PDF, …). It goes out with the next reply — typed or Emily's approved draft.
const ATTACH_MAX = 15 * 1024 * 1024;
app.post("/api/ticket/:id/attach", express.raw({ type: () => true, limit: "16mb" }), async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const id = String(req.params.id), buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!buf.length) return res.status(400).json({ error: "That file is empty." });
    if (buf.length > ATTACH_MAX) return res.status(400).json({ error: "Files can be up to 15 MB." });
    const t = (await db(`SELECT id FROM hd_tickets WHERE id=$1`, [id])).rows[0]; if (!t) return res.status(404).json({ error: "ticket not found" });
    const name = String(decodeURIComponent(req.get("x-file-name") || "attachment")).replace(/[\\/\r\n"]/g, "_").slice(0, 120) || "attachment";
    const type = String(req.get("x-file-type") || "application/octet-stream").split(";")[0].slice(0, 100);   // body is always sent as octet-stream
    const staged = (await db(`SELECT COALESCE(sum(length(data)),0)::bigint n FROM hd_files WHERE ticket_id=$1 AND staged AND sent_at IS NULL`, [id])).rows[0];
    if (Number(staged.n) + buf.length > 20 * 1024 * 1024) return res.status(400).json({ error: "Attachments on one reply can add up to 20 MB." });
    const f = await core.saveFile({ ticketId: id, name, contentType: type, buffer: buf, by: actorOf(req) });
    await db(`UPDATE hd_files SET staged=true WHERE id=$1`, [f.file_id]);
    res.json({ ok: true, file: { ...f, staged: true } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/ticket/:id/attach/:fid/remove", async (req, res) => {
  if (!guard(req, res)) return;
  try { await db(`DELETE FROM hd_files WHERE id=$1 AND ticket_id=$2 AND staged AND sent_at IS NULL`, [req.params.fid, String(req.params.id)]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
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
    await db(`UPDATE hd_tickets SET status=$2, updated_at=now(), reopened_at=CASE WHEN $2='open' THEN now() ELSE NULL END WHERE id=$1`, [id, status]);
    await db(`INSERT INTO hd_events (ticket_id,kind,detail,user_name) VALUES ($1,'status',$2,$3)`, [id, status === "open" ? "reopened — back to Pending" : status, who]);
    slackPost(`${status === "closed" ? "✅ Closed" : "↩️ Reopened"} ticket ${id} · by ${who}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Close or reopen many tickets at once (ticket list checkboxes).
app.post("/api/status/bulk", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { ids, status } = req.body || {};
    const list = [...new Set((Array.isArray(ids) ? ids : []).map((x) => String(x)).filter((x) => /^\d+$/.test(x)))].slice(0, 500);
    if (!list.length || !["open", "closed"].includes(status)) return res.status(400).json({ error: "ids and status open|closed required" });
    const who = actorOf(req);
    const r = await db(`UPDATE hd_tickets SET status=$2, updated_at=now(), reopened_at=CASE WHEN $2='open' THEN now() ELSE NULL END WHERE id = ANY($1::bigint[]) AND status IS DISTINCT FROM $2 RETURNING id`, [list, status]);
    for (const x of r.rows) await db(`INSERT INTO hd_events (ticket_id,kind,detail,user_name) VALUES ($1,'status',$2,$3)`, [x.id, status === "open" ? "reopened — back to Pending (bulk)" : "closed (bulk)", who]);
    if (r.rows.length) slackPost(`${status === "closed" ? "✅ Closed" : "↩️ Reopened"} ${r.rows.length} ticket${r.rows.length === 1 ? "" : "s"} at once · by ${who}`);
    res.json({ ok: true, changed: r.rows.length });
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
    await core.audit({ kind: "policy-edit", detail: `${req.params.key}${note ? ` — ${String(note).slice(0, 200)}` : ""}`, who: actorOf(req), target: req.params.key });
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
    if (!o.portal_auto) o.portal_auto = { value: { enabled: true } };
    res.json(o);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put("/api/emily/settings/:key", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    if (!["auto_send", "portal_auto"].includes(req.params.key)) return res.status(400).json({ error: "unknown setting" });
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
app.get("/file/:id/:tok", async (req, res) => {
  try {
    const { id, tok } = req.params;
    if (core.fileToken(id) !== tok) return res.status(403).send("bad link");
    const f = await core.getFile(id);
    if (!f) return res.status(404).send("not found");
    res.setHeader("Content-Type", f.content_type || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${String(f.name || "file").replace(/"/g, "")}"`);
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(f.buffer);
  } catch (e) { res.status(500).send(e.message); }
});
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
    const { id, action, text, applyActions, overrides } = req.body || {};
    if (!id || !["approve", "edit", "skip", "redraft"].includes(action)) return res.status(400).json({ error: "id and action approve|edit|skip|redraft required" });
    const emily = require("./emily");
    const r = await emily.decide({ ticketId: String(id), action, text, who: actorOf(req), applyActions: Array.isArray(applyActions) ? applyActions : [], overrides: overrides && typeof overrides === "object" ? overrides : {} });
    await core.audit({ ticketId: id, kind: `emily-${action}`, detail: r.ok ? (action === "approve" || action === "edit" ? `draft ${action === "edit" ? "edited and " : ""}sent to ${r.to || "customer"}${r.applied && r.applied.length ? ` · applied: ${r.applied.join(" | ")}` : ""}` : action === "skip" ? "draft skipped" : `redraft requested${text ? ` — ${String(text).slice(0, 200)}` : ""}`) : `failed: ${r.error}`, who: actorOf(req) });
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
      return res.status(400).send(`<body style="font-family:system-ui;padding:40px;max-width:640px"><h2>Google said: ${String(req.query.error)}</h2><p>${hints[String(req.query.error)] || String(req.query.error_description || "")}</p><p><a href="/">Back to Buzzin</a></p></body>`);
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
app.post("/api/emily/action", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { id, do: what } = req.body || {};
    const emily = require("./emily");
    if (what === "apply") { const r = await emily.applyAction(String(id), actorOf(req), req.body.overrides && typeof req.body.overrides === "object" ? req.body.overrides : null); await core.audit({ kind: "action-apply", detail: r.note || id, who: actorOf(req), target: id }); return res.json(r); }
    if (what === "dismiss") { const r = await emily.dismissAction(String(id), actorOf(req)); await core.audit({ kind: "action-dismiss", detail: id, who: actorOf(req), target: id }); return res.json(r); }
    res.status(400).json({ error: "do must be apply or dismiss" });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/emily/todo", async (req, res) => {
  if (!guard(req, res)) return;
  try { const { draft_id, index, state } = req.body || {}; if (!["done", "wont"].includes(state)) return res.status(400).json({ error: "state must be done or wont" });
    const todo = await require("./emily").setTodo(Number(draft_id), Number(index), state, actorOf(req)); await core.audit({ kind: "todo", detail: `${state === "done" ? "done" : "won't do"}: ${(todo[Number(index)] || {}).what || ""}`, who: actorOf(req), target: `draft ${draft_id}` }); res.json({ ok: true, todo }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/ticket/:id/human", async (req, res) => {          // "this IS a person — show it in Tickets"
  if (!guard(req, res)) return;
  try { await core.removeTags(req.params.id, JUNK_TAGS); await core.addTags(req.params.id, ["human"]); await db(`UPDATE hd_tickets SET spam=false WHERE id=$1`, [req.params.id]); await core.audit({ ticketId: req.params.id, kind: "classify", detail: "marked as a customer (shown in Tickets)", who: actorOf(req) }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/ticket/:id/junk", async (req, res) => {           // "this is machinery — hide it"
  if (!guard(req, res)) return;
  try { await core.removeTags(req.params.id, ["human"]); await core.addTags(req.params.id, ["automated"]); await core.audit({ ticketId: req.params.id, kind: "classify", detail: "marked not a customer (hidden from Tickets)", who: actorOf(req) }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/admin/classify", async (req, res) => {
  if (!guard(req, res)) return;
  try { const r = await core.classifyBacklog(); await core.audit({ kind: "admin-classify", detail: `${r.checked} checked · ${r.junk} hidden`, who: actorOf(req) }); res.json(r); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/admin/dedupe", async (req, res) => {
  if (!guard(req, res)) return;
  try { const n = await core.dedupeTickets(); await core.audit({ kind: "admin-dedupe", detail: `${n} merged`, who: actorOf(req) }); res.json({ ok: true, merged: n }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.post("/api/mailbox/poll", async (req, res) => {
  if (!guard(req, res)) return;
  try { res.json(await pollMailbox(String((req.body && req.body.address) || ""))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- Returns (replaces Loop) — see returns.js ---------------- */
const R = require("./returns");
const RETURNS_HTML = fs.readFileSync(path.join(__dirname, "public", "returns-portal.html"), "utf8");
const escH = (x) => String(x == null ? "" : x).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const retErr = (res, e) => res.status(e.status || 500).json({ error: e.status ? e.message : (e.message || "Something went wrong") });
// Customer-facing: never show Shopify/internal error text; log it and say something a shopper can act on.
const PORTAL_SORRY = "We can't look up orders right now. Please try again in a little while, or email us and we'll start your return for you.";
const portalErr = (res, e) => { if (e.status) return res.status(e.status).json({ error: e.message }); console.error("portal:", e.message); res.status(503).json({ error: PORTAL_SORRY }); };
const lookupHits = new Map();   // ip -> timestamps (portal lookups: 10 per 10 minutes)
function tooMany(ip) { const now = Date.now(); const l = (lookupHits.get(ip) || []).filter((t) => now - t < 600e3); l.push(now); lookupHits.set(ip, l); return l.length > 10; }
// Public: customer portal
app.get("/returns", (_q, r) => r.type("html").send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Returns</title><body style="font:16px system-ui;background:#faf7f2;display:grid;place-items:center;min-height:90vh;margin:0"><div style="text-align:center"><h2 style="font-weight:500">Start a return</h2>${Object.values(R.STORE_DEFS).map((d) => `<p><a style="color:#4b6b5a" href="/returns/${d.key}">${escH(d.name)}</a></p>`).join("")}</div>`));
const PT = require("./returns-theme");
const STUDIO_HTML = fs.readFileSync(path.join(__dirname, "public", "returns-studio.html"), "utf8");
const jsonForScript = (o) => JSON.stringify(o).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
async function portalCtx(key) {
  const d = R.STORE_DEFS[key], s = await R.settings();
  return { name: d.name, support: d.support, prefix: d.prefix, shop_url: d.shopUrl, faq_url: d.faqUrl, days: s.window_days[key], fee: Number(s.label_fee), fee_mode: s.label_fee_mode === "flat" ? "flat" : "weight", bonus: Number(s.store_credit_bonus_pct), credit_enabled: !!s.store_credit_enabled, fee_on_credit: !!s.fee_on_store_credit };
}
app.get("/returns/:store", async (req, res, next) => {
  const d = R.STORE_DEFS[req.params.store]; if (!d) return next();
  try {
    const preview = !!req.query.preview && PT.checkPreview(d.key, req.query.preview);
    const theme = preview ? await PT.draft(d.key) : await PT.published(d.key);
    const ctx = await portalCtx(d.key);
    const tk = (x) => String(x || "").replace(/\{(\w+)\}/g, (m, k) => ({ store: ctx.name, support: ctx.support, days: ctx.days }[k] ?? m));
    res.setHeader("Cache-Control", "no-store");
    // Inside the website chat (?embed=1) the portal is framed by the chat on the store's own site.
    if (req.query.embed === "1") res.setHeader("Content-Security-Policy", `frame-ancestors 'self' ${Object.values(R.STORE_DEFS).map((x) => { const h = new URL(x.shopUrl).host; return `https://${h} https://www.${h.replace(/^www\./, "")}`; }).join(" ")} https://*.myshopify.com ${process.env.EXTRA_FRAME_ANCESTORS || ""}`.trim());
    else res.setHeader("X-Frame-Options", "SAMEORIGIN");
    // One pass with a function: "$'" or "__BOOT_JSON__" inside the copy can't corrupt the page.
    const vals = {
      TITLE: escH(tk(theme.meta.title)), DESCRIPTION: escH(tk(theme.meta.description)),
      ROBOTS: theme.meta.noindex || preview ? '<meta name="robots" content="noindex">' : "",
      FAVICON: escH(theme.meta.favicon || "data:,"),
      BOOT_JSON: jsonForScript({ store: d.key, ctx, theme, preview, fonts: PT.FONT_WEIGHTS }),
    };
    res.type("html").send(RETURNS_HTML.replace(/__(TITLE|DESCRIPTION|ROBOTS|FAVICON|BOOT_JSON)__/g, (m, k) => vals[k]));
  } catch (e) { console.error("portal render:", e.message); res.status(500).send("The returns page is unavailable right now. Please try again shortly."); }
});
app.get("/returns/asset/:id/:name?", async (req, res) => {
  try {
    const a = await PT.getAsset(req.params.id); if (!a) return res.status(404).send("Not found");
    res.setHeader("Content-Type", a.content_type); res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    if (a.content_type === "image/svg+xml") res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(a.data);
  } catch (e) { res.status(500).send("error"); }
});
/* ---- Portal Studio (customize the look of each portal) ---- */
app.get("/returns-studio", (_q, r) => { r.setHeader("Cache-Control", "no-store"); r.type("html").send(STUDIO_HTML.replace(/__VERSION__/g, VERSION)); });
const studioStore = (req, res) => { const k = req.params.store; if (!R.STORE_DEFS[k]) { res.status(404).json({ error: "unknown store" }); return null; } return k; };
const studioGuard = (req, res) => { if (!guard(req, res)) return false; if (!isAdmin(req)) { res.status(403).json({ error: "Only admins can make this change." }); return false; } return true; };
app.get("/api/portal/meta", async (req, res) => {
  if (!guard(req, res)) return;
  try { const stores = {}; for (const k of Object.keys(R.STORE_DEFS)) stores[k] = { ...R.STORE_DEFS[k], ctx: await portalCtx(k) };
    res.json({ stores, fonts: PT.FONTS, font_weights: PT.FONT_WEIGHTS, enums: PT.ENUMS, ranges: PT.RANGES, admin: isAdmin(req), user: actorOf(req) }); }
  catch (e) { retErr(res, e); }
});
app.get("/api/portal/:store/theme", async (req, res) => {
  if (!guard(req, res)) return; const k = studioStore(req, res); if (!k) return;
  try { res.json({ ...(await PT.state(k)), preview_token: PT.previewToken(k), ctx: await portalCtx(k) }); } catch (e) { retErr(res, e); }
});
app.get("/api/portal/:store/version/:id", async (req, res) => {
  if (!guard(req, res)) return; const k = studioStore(req, res); if (!k) return;
  try { const t = await PT.versionTheme(k, Number(req.params.id)); if (!t) return res.status(404).json({ error: "not found" }); res.json({ theme: t }); } catch (e) { retErr(res, e); }
});
// Email Studio (/email-studio): every customer email, who sends it (Buzzin or Shopify), wording per store, live preview, test send.
const EM = require("./emails");
const EMAIL_STUDIO_HTML = fs.readFileSync(path.join(__dirname, "public", "email-studio.html"), "utf8");
app.get("/email-studio", (_q, r) => { r.setHeader("Cache-Control", "no-store"); r.type("html").send(EMAIL_STUDIO_HTML.replace(/__VERSION__/g, VERSION)); });
async function emailBuild(k, kind, over) {
  const s = await R.settings(), def = R.STORE_DEFS[k];
  const theme = await PT.published(k);
  const base = R.portalUrl(k, s).replace(/\/returns\/\w+$/, "");
  return { def, m: await EM.build(k, kind, { def, s, theme, base, over }) };
}
app.get("/api/emails/:store", async (req, res) => {
  if (!guard(req, res)) return; const k = studioStore(req, res); if (!k) return;
  try { res.json({ emails: await EM.listFor(k, await R.settings()), stores: Object.fromEntries(Object.entries(R.STORE_DEFS).map(([x, d]) => [x, { name: d.name, support: d.support }])), admin: isAdmin(req) }); } catch (e) { retErr(res, e); }
});
app.post("/api/emails/:store/preview", async (req, res) => {
  if (!guard(req, res)) return; const k = studioStore(req, res); if (!k) return;
  try { const { m } = await emailBuild(k, String(req.body.kind || ""), req.body.copy); res.json({ subject: m.subject, html: m.html }); } catch (e) { retErr(res, e); }
});
app.post("/api/emails/:store/test", async (req, res) => {
  if (!studioGuard(req, res)) return; const k = studioStore(req, res); if (!k) return;
  try {
    const to = String(req.body.to || "").trim(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return res.status(400).json({ error: "Enter an email address." });
    const { def, m } = await emailBuild(k, String(req.body.kind || ""), req.body.copy);
    await core.gmailSend({ mailbox: def.support, to, subject: "[TEST] " + m.subject, text: m.text, html: m.html, fromName: def.name, reply: false });
    res.json({ ok: true });
  } catch (e) { retErr(res, e); }
});
app.put("/api/emails/:store/:kind", async (req, res) => {
  if (!studioGuard(req, res)) return; const k = studioStore(req, res); if (!k) return;
  try { res.json({ ok: true, ...(await EM.save(k, req.params.kind, (req.body || {}).copy || {}, actorOf(req))) }); } catch (e) { retErr(res, e); }
});
app.put("/api/portal/:store/draft", async (req, res) => {
  if (!studioGuard(req, res)) return; const k = studioStore(req, res); if (!k) return;
  try { const t = await PT.saveDraft(k, (req.body || {}).theme, actorOf(req)); res.json({ ok: true, theme: t, saved_at: new Date().toISOString() }); } catch (e) { retErr(res, e); }
});
app.post("/api/portal/:store/publish", async (req, res) => {
  if (!studioGuard(req, res)) return; const k = studioStore(req, res); if (!k) return;
  try { if ((req.body || {}).theme) await PT.saveDraft(k, req.body.theme, actorOf(req)); await PT.publish(k, (req.body || {}).note, actorOf(req)); res.json({ ok: true, ...(await PT.state(k)) }); } catch (e) { retErr(res, e); }
});
app.post("/api/portal/:store/discard", async (req, res) => {
  if (!studioGuard(req, res)) return; const k = studioStore(req, res); if (!k) return;
  try { await PT.discard(k); res.json({ ok: true, ...(await PT.state(k)) }); } catch (e) { retErr(res, e); }
});
app.post("/api/portal/:store/restore/:id", async (req, res) => {
  if (!studioGuard(req, res)) return; const k = studioStore(req, res); if (!k) return;
  try { await PT.restore(k, Number(req.params.id), actorOf(req)); res.json({ ok: true, ...(await PT.state(k)) }); } catch (e) { retErr(res, e); }
});
app.post("/api/portal/:store/import-loop", async (req, res) => {
  if (!studioGuard(req, res)) return; const k = studioStore(req, res); if (!k) return;
  try { res.json({ ok: true, patch: await PT.importFromLoop(k) }); } catch (e) { res.status(502).json({ error: e.message }); }
});
app.get("/api/portal/assets", async (req, res) => { if (!guard(req, res)) return; try { res.json({ assets: await PT.listAssets() }); } catch (e) { retErr(res, e); } });
app.post("/api/portal/assets", express.raw({ type: () => true, limit: "11mb" }), async (req, res) => {
  if (!studioGuard(req, res)) return;
  try { res.json(await PT.saveAsset({ store: String(req.query.store || ""), name: String(req.query.name || ""), type: req.headers["content-type"], buffer: req.body, who: actorOf(req) })); }
  catch (e) { retErr(res, e); }
});
app.delete("/api/portal/assets/:id", async (req, res) => { if (!studioGuard(req, res)) return; try { await PT.deleteAsset(req.params.id); res.json({ ok: true }); } catch (e) { retErr(res, e); } });
app.get("/returns/label/:id/:tok", async (req, res) => {
  try {
    if (req.params.tok !== R.labelToken(req.params.id)) return res.status(404).send("Not found");
    const rec = await R.getRec(req.params.id);
    if (rec && rec.test_label && !rec.label_src) return res.type("html").send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Test label ${escH(rec.rma)}</title><body style="font:16px system-ui;display:grid;place-items:center;min-height:90vh;margin:0;background:#f6f5f2"><div style="border:3px dashed #b42318;padding:28px;max-width:420px;background:#fff;text-align:center"><h2 style="color:#b42318;margin:0 0 8px">TEST — NOT A REAL LABEL</h2><p>Return ${escH(rec.rma)} · ${escH(rec.order_name)}<br>From ${escH(rec.customer_name)} to Returns Dept</p><p>${rec.label_cost != null ? `This label would cost about <b>$${Number(rec.label_cost).toFixed(2)}</b>.` : "No price quote available."}</p><p style="color:#666;font-size:13px">Test mode is on in Buzzin → Returns → Settings. Nothing was bought or charged.</p></div>`);
    if (!rec || rec.status === "cancelled" || !rec.label_src) return res.status(404).send("This label is no longer available.");
    const r = await fetch(rec.label_src, { headers: { "API-Key": process.env.SHIPSTATION_V2_KEY || "" } });
    if (!r.ok) return res.redirect(rec.label_src);
    res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `inline; filename="Return label ${rec.rma}.pdf"`);
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(500).send("Couldn't load the label."); }
});
app.get("/returns/print/:id/:tok", async (req, res) => {
  try { const r = await R.printPdf(req.params.id, req.params.tok); res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `inline; filename="${r.name}"`); res.send(r.pdf); }
  catch (e) { console.error("print label:", e.message); res.status(e.status || 500).type("text").send(e.status ? e.message : "Couldn't load the label. Please try again."); }
});
app.post("/api/returns/public/view", async (req, res) => { try { const b = req.body || {}; res.json(await R.viewReturn(String(b.id || ""), String(b.tok || ""))); } catch (e) { portalErr(res, e); } });
app.post("/api/returns/public/return-cancel", async (req, res) => { try { const b = req.body || {}; res.json(await R.customerCancel(String(b.id || ""), String(b.tok || ""))); } catch (e) { portalErr(res, e); } });
app.post("/api/returns/public/feedback", async (req, res) => { try { const b = req.body || {}; res.json(await R.saveFeedback(String(b.id || ""), String(b.tok || ""), b)); } catch (e) { portalErr(res, e); } });
app.post("/api/returns/public/:store/lookup", async (req, res) => {
  if (tooMany(req.ip)) return res.status(429).json({ error: "Too many tries. Please wait a few minutes and try again." });
  try { const b = req.body || {}; res.json(await R.lookup(req.params.store, String(b.order_number || ""), String(b.email || ""))); } catch (e) { portalErr(res, e); }
});
// Live, weight-based label price for the portal's summary (signed so submit never charges more than shown).
const quoteHits = new Map();
app.post("/api/returns/public/quote", async (req, res) => {
  const now = Date.now(), h = (quoteHits.get(req.ip) || []).filter((t) => now - t < 10 * 60e3); h.push(now); quoteHits.set(req.ip, h);
  if (h.length > 60) return res.status(429).json({ error: "Too many tries. Please wait a few minutes and try again." });
  try { res.json(await R.quotePortal(req.body || {})); } catch (e) { portalErr(res, e); }
});
app.post("/api/returns/public/submit", async (req, res) => { try { res.json(await R.submitPortal(req.body || {})); } catch (e) { portalErr(res, e); } });
// Portal options beyond returns: edit order, defective, Package Protection, not delivered (claims.js)
const CL = require("./claims");
const pub = (fn) => async (req, res) => { try { res.json(await fn(req.body || {}, req)); } catch (e) { portalErr(res, e); } };
app.post("/api/returns/public/edit/options", pub((b) => CL.editOptions(b.token)));
app.post("/api/returns/public/edit/search", pub((b) => CL.editSearch(b.token, b.q)));
app.post("/api/returns/public/edit/submit", pub((b) => CL.editSubmit(b.token, b)));
app.post("/api/returns/public/edit/cancel", pub((b) => CL.editCancel(b.token, b)));
app.post("/api/returns/public/claim/start", pub((b) => CL.claimStart(b.token, String(b.type || ""))));
app.post("/api/returns/public/claim/photo", pub((b) => CL.savePhoto(b.token, b)));
app.post("/api/returns/public/claim/po", pub((b) => CL.poAnswer(b.token, b)));
app.post("/api/returns/public/claim/submit", pub((b) => CL.claimSubmit(b.token, b)));
// Staff: claims queue
app.get("/api/claims", async (req, res) => {
  if (!guard(req, res)) return;
  try { res.json({ claims: await CL.list({ status: req.query.status == null ? "open" : String(req.query.status), q: String(req.query.q || "") }), counts: await CL.counts(), admin: isAdmin(req), since: (await R.settings()).claims_since }); } catch (e) { retErr(res, e); }
});
// Admin: hide every claim made so far (e.g. after testing). Nothing is deleted.
app.post("/api/claims/reset", async (req, res) => {
  if (!studioGuard(req, res)) return;
  try { const s = await R.saveSettings({ claims_since: new Date().toISOString() }, actorOf(req)); await core.audit({ kind: "claims-reset", detail: "Claims screen cleared (older claims hidden)", who: actorOf(req) }).catch(() => {}); res.json({ ok: true, since: s.claims_since }); } catch (e) { retErr(res, e); }
});
app.get("/api/claims/photo/:id", async (req, res) => {
  if (!guard(req, res)) return;
  try { const p = await CL.getPhoto(req.params.id); if (!p) return res.status(404).send("Not found"); res.setHeader("Content-Type", p.content_type); res.setHeader("Cache-Control", "private, max-age=86400"); res.setHeader("X-Content-Type-Options", "nosniff"); res.send(p.data); }
  catch (e) { res.status(500).send("error"); }
});
app.post("/api/claims/:id/:act", async (req, res) => {
  if (!guard(req, res)) return;
  const who = actorOf(req), b = req.body || {};
  try {
    const act = req.params.act, id = req.params.id;
    const out = act === "approve" ? await CL.approve(id, b, who) : act === "deny" ? await CL.deny(id, b, who) : act === "info" ? await CL.askInfo(id, b, who)
      : act === "rerun" ? await CL.rerun(id) : act === "close" ? await CL.close(id, who) : null;
    if (!out) return res.status(404).json({ error: "unknown action" });
    res.json({ ok: true, claim: out });
  } catch (e) { retErr(res, e); }
});
// Website chat widget (chat.js): public loader / panel / AI, and the admin studio.
const CHAT = require("./chat");
/* Buzzin Marketing (contacts, email, forms, flows, campaigns, SMS, analytics) — nothing sends until a sender is connected and turned on. */
require("./mk-routes")(app, { guard, isAdmin, actorOf, VERSION });
const CHAT_FRAME = fs.readFileSync(path.join(__dirname, "public", "chat-frame.html"), "utf8");
const CHAT_STUDIO = fs.readFileSync(path.join(__dirname, "public", "chat-studio.html"), "utf8");
const chatStore = (req, res) => { const k = req.params.store; if (!R.STORE_DEFS[k]) { res.status(404).json({ error: "unknown store" }); return null; } return k; };
const cors = (res) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); };
app.get("/chat/:store/widget.js", async (req, res) => { const k = chatStore(req, res); if (!k) return;
  try { res.setHeader("Cache-Control", "public, max-age=60"); res.type("application/javascript").send(await CHAT.widgetJs(k)); } catch (e) { res.status(500).type("application/javascript").send("/* chat unavailable */"); } });
app.get("/chat/:store/frame", (req, res) => { const k = chatStore(req, res); if (!k) return; res.setHeader("Cache-Control", "no-store"); res.type("html").send(CHAT_FRAME.replace(/__STORE__/g, k)); });
app.get("/chat/loader.js", (_q, res) => { res.setHeader("Cache-Control", "no-store"); res.type("application/javascript").send(CHAT.LOADER); });
app.options("/api/chat/:store/:what", (req, res) => { cors(res); res.sendStatus(204); });
app.get("/api/chat/:store/config", async (req, res) => { cors(res); const k = chatStore(req, res); if (!k) return; try { res.setHeader("Cache-Control", "public, max-age=60"); res.json(await CHAT.publicConfig(k)); } catch (e) { retErr(res, e); } });
app.post("/api/chat/:store/message", async (req, res) => { const k = chatStore(req, res); if (!k) return; try { res.json(await CHAT.message(k, req.body || {}, req.ip)); } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : "Sorry, something went wrong. Please try again." }); } });
app.post("/api/chat/:store/verify", async (req, res) => { const k = chatStore(req, res); if (!k) return; try { res.json(await CHAT.verifyOrder(k, req.body || {}, req.ip)); } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : "Sorry, we couldn't look that up. Please try again." }); } });
app.post("/api/chat/:store/handoff", async (req, res) => { const k = chatStore(req, res); if (!k) return; try { res.json(await CHAT.handoff(k, req.body || {}, req.ip)); } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : "Sorry, we couldn't send that. Please try again." }); } });
app.get("/chat-studio", (_q, r) => { r.setHeader("Cache-Control", "no-store"); r.type("html").send(CHAT_STUDIO.replace(/__VERSION__/g, VERSION)); });
app.get("/api/chat-admin/:store", async (req, res) => { if (!guard(req, res)) return; const k = chatStore(req, res); if (!k) return;
  try { const [settings, defaults, install, stats, catalog] = await Promise.all([CHAT.settings(k), CHAT.defaultsFor(k), CHAT.installState(k), CHAT.stats(k), require("./catalog").status(k)]);
    res.json({ settings, defaults, install, stats, catalog, public: await CHAT.publicConfig(k), icons: CHAT.ICONS, fonts: PT.FONTS, origin: R.linkBase(k, await R.settings()), admin: isAdmin(req) }); } catch (e) { retErr(res, e); } });
app.put("/api/chat-admin/:store", async (req, res) => { if (!studioGuard(req, res)) return; const k = chatStore(req, res); if (!k) return; try { res.json({ settings: await CHAT.save(k, req.body || {}, actorOf(req)) }); } catch (e) { retErr(res, e); } });
app.post("/api/chat-admin/:store/reset", async (req, res) => { if (!studioGuard(req, res)) return; const k = chatStore(req, res); if (!k) return; try { res.json({ settings: await CHAT.reset(k, actorOf(req)) }); } catch (e) { retErr(res, e); } });
app.get("/api/chat-admin/:store/chats", async (req, res) => { if (!guard(req, res)) return; const k = chatStore(req, res); if (!k) return; try { res.json({ chats: await CHAT.sessions(k) }); } catch (e) { retErr(res, e); } });
app.post("/api/chat-admin/:store/catalog", async (req, res) => { if (!studioGuard(req, res)) return; const k = chatStore(req, res); if (!k) return; try { res.json(await require("./catalog").refresh(k)); } catch (e) { retErr(res, e); } });
app.post("/api/chat-admin/:store/install", async (req, res) => { if (!studioGuard(req, res)) return; const k = chatStore(req, res); if (!k) return; try { res.json(await CHAT.install(k, actorOf(req), !!(req.body && req.body.remove))); } catch (e) { retErr(res, e); } });

// Admin: website FAQ page — read, Emily's suggestions, publish, undo (faqs.js)
const FAQ = require("./faqs");
app.get("/api/faqs/:store", async (req, res) => { if (!guard(req, res)) return; const k = studioStore(req, res); if (!k) return; try { res.json(await FAQ.view(k)); } catch (e) { retErr(res, e); } });
app.post("/api/faqs/:store/suggest", async (req, res) => { if (!studioGuard(req, res)) return; const k = studioStore(req, res); if (!k) return; try { res.json(await FAQ.suggest(k)); } catch (e) { retErr(res, e); } });
app.post("/api/faqs/:store/publish", async (req, res) => { if (!studioGuard(req, res)) return; const k = studioStore(req, res); if (!k) return; try { res.json({ ok: true, ...(await FAQ.publish(k, req.body || {}, actorOf(req))) }); } catch (e) { retErr(res, e); } });
app.post("/api/faqs/:store/check", async (req, res) => { if (!studioGuard(req, res)) return; const k = studioStore(req, res); if (!k) return; try { res.json(await FAQ.autoRun(k, "run by " + actorOf(req), { force: true })); } catch (e) { retErr(res, e); } });
app.post("/api/faqs/:store/undo", async (req, res) => { if (!studioGuard(req, res)) return; const k = studioStore(req, res); if (!k) return; try { res.json({ ok: true, ...(await FAQ.undo(k, actorOf(req))) }); } catch (e) { retErr(res, e); } });
// One-time: return labels made from Slack-approved actions were never queued for the reply (the Slack path dropped them).
// Queue each one that never went out, so it's attached to the next reply on its ticket.
async function labelBackfill() {
  if (await syncGet("slack_label_backfill_v1")) return;
  const r = await db(`UPDATE hd_files f SET staged = true FROM emily_actions a
    WHERE a.kind='return_propose' AND a.status='applied' AND a.files IS NULL AND a.result LIKE '%label PDF attached%'
      AND a.decided_at > now() - interval '30 days' AND f.ticket_id::text = a.ticket_id::text AND f.sent_at IS NULL AND NOT coalesce(f.staged,false)
      AND f.name = 'Return label ' || substring(a.result from 'Return ([A-Z0-9-]+) created') || '.pdf'
    RETURNING f.ticket_id, f.name`);
  await core.syncSet("slack_label_backfill_v1", String(r.rowCount || 0), { at: new Date().toISOString(), files: r.rows });
  console.log(`🏷️  return labels queued for the next reply: ${r.rowCount || 0}${r.rows.length ? " — " + r.rows.map((x) => `${x.ticket_id}: ${x.name}`).join(", ") : ""}`);
}
// One-time: re-queue any return label from an approved Emily return that never reached the customer (no unsent copy
// staged and none sent) — re-downloads the PDF from ShipStation. Also retires still-staged return proposals for orders
// that already have a return, so nobody approves a duplicate.
async function labelRestage() {
  if (await syncGet("return_label_restage_v1")) return;
  const acts = (await db(`SELECT id, ticket_id, result FROM emily_actions WHERE kind='return_propose' AND status='applied'
    AND result LIKE 'Return % created%' AND decided_at > now() - interval '30 days'`)).rows;
  const done = [];
  for (const a of acts) {
    const rma = (String(a.result).match(/Return ([A-Z0-9-]+) created/) || [])[1]; if (!rma) continue;
    const name = `Return label ${rma}.pdf`;
    const have = (await db(`SELECT staged, sent_at FROM hd_files WHERE ticket_id=$1 AND name=$2`, [String(a.ticket_id), name])).rows;
    if (have.some((f) => f.sent_at || f.staged)) continue;
    const rec = (await db(`SELECT data, status FROM hd_returns WHERE rma=$1 ORDER BY created_at DESC LIMIT 1`, [rma])).rows[0];
    const src = rec && rec.status !== "cancelled" && rec.data && rec.data.label_src; if (!src) continue;
    try {
      const r = await fetch(src, { headers: { "API-Key": process.env.SHIPSTATION_V2_KEY || "" } });
      if (!r.ok) { console.error(`label restage ${rma}: HTTP ${r.status}`); continue; }
      const f = await core.saveFile({ ticketId: String(a.ticket_id), name, contentType: "application/pdf", buffer: Buffer.from(await r.arrayBuffer()), by: "Buzzin" });
      await db(`UPDATE hd_files SET staged=true WHERE id=$1`, [f.file_id]);
      done.push(`${a.ticket_id}: ${name}`);
    } catch (e) { console.error(`label restage ${rma}:`, e.message); }
  }
  const stale = (await db(`UPDATE emily_actions s SET status='dismissed', decided_by='Buzzin', decided_at=now(),
      result='Not needed — this order already has a return and label'
    WHERE s.kind='return_propose' AND s.status='staged' AND EXISTS (SELECT 1 FROM hd_returns r WHERE ltrim(r.order_name,'#') = ltrim(s.input->>'order','#')
      AND r.status <> 'cancelled' AND r.ticket_id::text = s.ticket_id::text) RETURNING s.ticket_id, s.title`)).rows;
  const q666 = (await db(`SELECT name, staged, sent_at FROM hd_files WHERE ticket_id=9000000666 ORDER BY created_at`)).rows;
  await core.syncSet("return_label_restage_v1", String(done.length), { at: new Date().toISOString(), done, stale });
  console.log(`🏷️  return labels re-queued: ${done.length}${done.length ? " — " + done.join(", ") : ""} · stale return proposals retired: ${stale.length}${stale.length ? " — " + stale.map((x) => `${x.ticket_id}: ${x.title}`).join(", ") : ""} · 9000000666 files: ${q666.map((f) => `${f.name} [${f.sent_at ? "sent" : f.staged ? "queued" : "not queued"}]`).join(", ") || "none"}`);
}
// One-time look at recent sign-ups (where they land, whether the welcome email/text went out) — logs only.
async function signupDiag() {
  if (await syncGet("signup_diag_v3")) return;
  const q = async (sql, a = []) => (await db(sql, a).catch((e) => ({ rows: [{ error: e.message }] }))).rows;
  const subs = await q(`SELECT e.at, f.name form, f.store fstore, e.type, e.preview, p.id pid, p.email, p.phone IS NOT NULL has_phone, p.created_at, p.email_consent, p.sms_consent, p.sources,
      (SELECT string_agg(l.name, ', ') FROM mk_list_members m JOIN mk_lists l ON l.id=m.list_id WHERE m.profile_id=p.id) lists,
      (SELECT string_agg(s.channel || ':' || s.status || coalesce('(' || s.reason || ')','') || ':' || coalesce(s.subject,''), ' | ' ORDER BY s.id DESC) FROM (SELECT * FROM mk_sends WHERE profile_id=p.id ORDER BY id DESC LIMIT 4) s) sends,
      (SELECT string_agg(r.flow_id || ':' || r.status || coalesce('(' || r.end_reason || ')',''), ', ') FROM mk_flow_runs r WHERE r.profile_id=p.id AND NOT r.test) runs
    FROM mk_form_events e JOIN mk_forms f ON f.id=e.form_id LEFT JOIN mk_profiles p ON p.id=e.profile_id
    WHERE e.type LIKE 'submitted_%' ORDER BY e.id DESC LIMIT 25`);
  const ken = await q(`SELECT id, email, phone, created_at, email_consent, sms_consent, sources, stores FROM mk_profiles WHERE email ILIKE '%kenzierose%' OR email ILIKE '%kenzie%rose%'`);
  const kenSends = ken.length && ken[0].id ? await q(`SELECT channel, status, reason, subject, to_addr, created_at FROM mk_sends WHERE profile_id = ANY($1) ORDER BY id DESC LIMIT 10`, [ken.map((k) => k.id)]) : [];
  const week = await q(`SELECT count(*) FILTER (WHERE e.type='submitted_email' AND NOT e.preview) emails, count(*) FILTER (WHERE e.type='submitted_phone' AND NOT e.preview) phones,
      count(DISTINCT e.profile_id) FILTER (WHERE NOT e.preview AND p.created_at < e.at - interval '1 hour') already_existed
    FROM mk_form_events e LEFT JOIN mk_profiles p ON p.id=e.profile_id WHERE e.at > now() - interval '7 days'`);
  const forms = await q(`SELECT id, store, name, status, list_id, coupon FROM mk_forms WHERE ab_of IS NULL ORDER BY id`);
  const lists = await q(`SELECT l.id, l.store, l.name, l.archived, l.deleted_by, (SELECT count(*) FROM mk_list_members m WHERE m.list_id=l.id)::int members,
      (SELECT count(*) FROM mk_list_members m WHERE m.list_id=l.id AND m.added_at > now() - interval '7 days')::int added_7d FROM mk_lists l ORDER BY l.id`);
  const flows = await q(`SELECT id, name, status, trigger FROM mk_flows WHERE NOT archived AND deleted_at IS NULL AND status <> 'draft' ORDER BY id`);
  console.log("🔎 SIGNUP-DIAG lists: " + JSON.stringify(lists));
  console.log("🔎 SIGNUP-DIAG flows: " + JSON.stringify(flows));
  await core.syncSet("signup_diag_v3", "1", { at: new Date().toISOString() });
  console.log("🔎 SIGNUP-DIAG forms: " + JSON.stringify(forms));
  console.log("🔎 SIGNUP-DIAG week: " + JSON.stringify(week));
  console.log("🔎 SIGNUP-DIAG kenzie: " + JSON.stringify(ken) + " sends: " + JSON.stringify(kenSends));
  for (const r of subs) console.log("🔎 SIGNUP-DIAG sub: " + JSON.stringify(r));
}
// One-time: sign-ups were going into "Merged Shopify Newsletter", a list that was deleted (hidden) — so new sign-ups were
// invisible. Give them their own visible list, "Website Sign-ups": everyone who ever submitted a form goes in (dated by their
// sign-up), and the forms and the Welcome Series point to it. Adding people here doesn't start any flow.
async function signupList() {
  if (await syncGet("mk_signup_list_v1")) return;
  const OLD = 5;
  const old = (await db(`SELECT id, name, archived FROM mk_lists WHERE id=$1`, [OLD])).rows[0];
  if (!old || !old.archived) { await core.syncSet("mk_signup_list_v1", "skipped", { why: old ? "old list is visible" : "no list 5" }); console.log("📋 sign-up list: skipped"); return; }
  let L = (await db(`SELECT id FROM mk_lists WHERE store='lb' AND name='Website Sign-ups' AND NOT archived`)).rows[0];
  if (!L) L = (await db(`INSERT INTO mk_lists (store, name, description, source) VALUES ('lb','Website Sign-ups','Everyone who signs up through a website sign-up form (email and/or text).','buzzin') RETURNING id`)).rows[0];
  const id = Number(L.id);
  const added = (await db(`INSERT INTO mk_list_members (list_id, profile_id, added_at, source)
      SELECT $1, e.profile_id, min(e.at), 'form' FROM mk_form_events e WHERE e.type IN ('submitted_email','submitted_phone') AND NOT e.preview AND e.profile_id IS NOT NULL
      GROUP BY e.profile_id ON CONFLICT DO NOTHING`, [id])).rowCount;
  const swap = (o) => { let n = 0; const walk = (x) => { if (!x || typeof x !== "object") return; for (const [k, v] of Object.entries(x)) {
      if (/^list_?id$/i.test(k) && Number(v) === OLD) { x[k] = typeof v === "string" ? String(id) : id; n++; } else walk(v); } }; walk(o); return n; };
  let forms = 0, flows = 0;
  for (const f of (await db(`SELECT id, list_id, steps FROM mk_forms`)).rows) {
    const steps = f.steps || []; const n = swap(steps);
    if (n || Number(f.list_id) === OLD) { await db(`UPDATE mk_forms SET list_id=CASE WHEN list_id=$2 THEN $3 ELSE list_id END, steps=$4 WHERE id=$1`, [f.id, OLD, id, JSON.stringify(steps)]); forms++; }
  }
  for (const f of (await db(`SELECT id, trigger, graph, entry_filter, exit_filter FROM mk_flows WHERE deleted_at IS NULL`)).rows) {
    const t = f.trigger || {}, g = f.graph || {}, en = f.entry_filter, ex = f.exit_filter;
    const n = swap(t) + swap(g) + swap(en) + swap(ex);
    if (n) { await db(`UPDATE mk_flows SET trigger=$2, graph=$3, entry_filter=$4, exit_filter=$5, updated_at=now() WHERE id=$1`, [f.id, JSON.stringify(t), JSON.stringify(g), en ? JSON.stringify(en) : null, ex ? JSON.stringify(ex) : null]); flows++; }
  }
  try { require("./mk-forms").clearCache && require("./mk-forms").clearCache(); } catch (_) {}
  await core.syncSet("mk_signup_list_v1", String(id), { at: new Date().toISOString(), added, forms, flows });
  console.log(`📋 sign-up list: "Website Sign-ups" (#${id}) — ${added} people added from past form sign-ups · ${forms} form(s) and ${flows} flow(s) now use it instead of the deleted "${old.name}"`);
}
// One-time: flow steps kept the email name they were built with; show each email's current name instead.
async function flowEmailNames() {
  if (await syncGet("flow_email_names_v1")) return;
  const E = require("./mk-email"); let n = 0;
  for (const t of (await db(`SELECT id, name FROM mk_templates WHERE NOT archived`)).rows) n += await E.syncFlowNames(t.id, t.name);
  await core.syncSet("flow_email_names_v1", String(n), {});
  console.log(`✉️  flow email names synced: ${n} flow update(s)`);
}
// One-time look at the Welcome Series + 10% flow (#12) and everything that states a sign-up percent — logs only.
// One-time: leftover "15%" wording in the 10% welcome series (a text step's name and the "ends soon" email's preview).
async function thankYouCheck() {
  if (await syncGet("thank_you_check_v1")) return;
  const CP = require("./mk-coupons");
  for (const t of (await db(`SELECT id, name, subject, blocks, doc, updated_at, updated_by FROM mk_templates WHERE id=20`)).rows) {
    let raw = JSON.stringify([t.blocks, t.doc]).replace(/\\n/g, " ").replace(/\\"/g, '"').replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
    const hits = [...new Set((raw.match(/[^."{}]{0,70}(\d{1,2}\s?%|\$\s?\d+|code|coupon|expire|valid)[^."{}]{0,70}/gi) || []).map((x) => x.trim()))].filter((x) => !/width|height|px|important/i.test(x)).slice(0, 25);
    console.log(`🔎 THANKYOU ${t.id} ${t.name} · updated ${t.updated_at && t.updated_at.toISOString()} by ${t.updated_by}: uses_coupon=${CP.usesCoupon(t)} offers=${JSON.stringify(CP.offersIn(t))} text=${JSON.stringify(hits)}`);
  }
  await core.syncSet("thank_you_check_v1", "1", {});
}
async function welcome10Fix() {
  if (await syncGet("welcome_10_fix_v1")) return;
  const f = (await db(`SELECT id, graph FROM mk_flows WHERE id=12`)).rows[0]; let n = 0;
  if (f) { const g = f.graph || {}; for (const node of Object.values(g.nodes || {})) if (node && node.config && typeof node.config.name === "string" && /15%/.test(node.config.name) && node.type === "send_sms") { node.config.name = node.config.name.replace(/15%/g, "10%"); n++; }
    if (n) await db(`UPDATE mk_flows SET graph=$2 WHERE id=$1`, [f.id, JSON.stringify(g)]); }
  const t = (await db(`UPDATE mk_templates SET preview=replace(preview,'15%','10%'), updated_at=now() WHERE id=53 AND preview LIKE '%15\\%%' RETURNING id`)).rowCount;
  await core.syncSet("welcome_10_fix_v1", "1", { steps: n, templates: t });
  console.log(`✉️  welcome series 10% fix: ${n} step name(s), ${t} email preview(s)`);
}
async function welcomeText() {
  if (await syncGet("welcome_text_v1")) return;
  for (const t of (await db(`SELECT id, name, blocks, doc FROM mk_templates WHERE id IN (3,20,53)`)).rows) {
    let raw = JSON.stringify([t.blocks, t.doc]).replace(/\\n/g, " ").replace(/\\"/g, '"');
    raw = raw.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
    const hits = [...new Set((raw.match(/[^."{}]{0,70}(\d{1,2}\s?%|\$\s?\d+|code|coupon|expire)[^."{}]{0,70}/gi) || []).map((x) => x.trim()))].filter((x) => !/width|height|px|important/i.test(x)).slice(0, 25);
    console.log(`🔎 WELCOME-TEXT ${t.id} ${t.name}: ${JSON.stringify(hits)}`);
  }
  await core.syncSet("welcome_text_v1", "1", {});
}
async function welcomeDiag() {
  if (await syncGet("welcome_diag_v1")) return;
  const CP = require("./mk-coupons"), out = (m) => console.log("🔎 WELCOME-DIAG " + m);
  const pct = (x) => [...new Set((JSON.stringify(x || "").match(/[^"]{0,40}\d{1,2}\s?%[^"]{0,30}/g) || []).map((t) => t.replace(/\\n/g, " ")))].slice(0, 12);
  const f = (await db(`SELECT * FROM mk_flows WHERE id=12`)).rows[0];
  if (!f) out("flow 12 not found"); else {
    out(`flow: ${JSON.stringify({ name: f.name, status: f.status, store: f.store, trigger: f.trigger, entry: f.entry_filter, exit: f.exit_filter, reentry: f.reentry, start: f.graph && f.graph.start })}`);
    for (const [id, n] of Object.entries((f.graph && f.graph.nodes) || {})) out(`node ${id}: ${JSON.stringify({ type: n.type, next: n.next, yes: n.yes, no: n.no, branches: n.branches, config: n.config }).slice(0, 900)}`);
    const tids = [...new Set(Object.values(f.graph.nodes || {}).filter((n) => n.type === "send_email" && n.config && n.config.template_id).map((n) => Number(n.config.template_id)))];
    for (const t of (await db(`SELECT id, name, subject, preview, blocks, doc FROM mk_templates WHERE id = ANY($1)`, [tids])).rows)
      out(`template ${t.id}: ${JSON.stringify({ name: t.name, subject: t.subject, preview: t.preview, offers: CP.offersIn(t), uses_coupon: CP.usesCoupon(t), percents: pct([t.blocks, t.doc]) }).slice(0, 1500)}`);
    const runs = (await db(`SELECT status, count(*)::int n FROM mk_flow_runs WHERE flow_id=12 GROUP BY 1`)).rows; out(`runs: ${JSON.stringify(runs)}`);
  }
  for (const fm of (await db(`SELECT id, name, status, list_id, coupon FROM mk_forms WHERE ab_of IS NULL`)).rows) out(`form ${fm.id}: ${JSON.stringify({ name: fm.name, status: fm.status, list_id: fm.list_id, coupon: fm.coupon })}`);
  const forms = (await db(`SELECT id, steps FROM mk_forms WHERE status='live'`)).rows; for (const fm of forms) out(`form ${fm.id} text: ${JSON.stringify(pct(fm.steps))}`);
  out(`coupon defaults: ${JSON.stringify(await CP.defaults())}`);
  const live = (await db(`SELECT id, name, status, trigger FROM mk_flows WHERE status='live' AND NOT archived`)).rows; out(`live flows: ${JSON.stringify(live)}`);
  await core.syncSet("welcome_diag_v1", "1", {});
}
// One-time performance read of the 10% sign-up form + Welcome Series + 10% (vs the 15% versions before) — logs only.
async function signupPerf() {
  if (await syncGet("signup_perf_v1")) return;
  const out = (m) => console.log("📈 SIGNUP-PERF " + m);
  const q = async (sql, a = []) => (await db(sql, a).catch((e) => ({ rows: [{ error: e.message }] }))).rows;
  out("forms by day: " + JSON.stringify(await q(`SELECT f.id, f.name, to_char(date_trunc('day', e.at AT TIME ZONE 'America/Chicago'),'MM-DD') d,
      count(*) FILTER (WHERE e.type='viewed')::int views, count(DISTINCT e.vid) FILTER (WHERE e.type='viewed')::int viewers,
      count(*) FILTER (WHERE e.type='submitted_email')::int emails, count(*) FILTER (WHERE e.type='submitted_phone')::int phones, count(*) FILTER (WHERE e.type='closed')::int closed
    FROM mk_form_events e JOIN mk_forms f ON f.id=e.form_id WHERE NOT e.preview AND e.at > now() - interval '10 days' GROUP BY 1,2,3 ORDER BY 3,1`)));
  for (const fid of [12, 11]) {
    const fl = (await q(`SELECT id, name, status, updated_at FROM mk_flows WHERE id=$1`, [fid]))[0] || {};
    out(`flow ${fid} ${fl.name} (${fl.status}) runs: ` + JSON.stringify(await q(`SELECT status, node_id, count(*)::int n, min(entered_at) first, max(entered_at) last FROM mk_flow_runs WHERE flow_id=$1 AND NOT test GROUP BY 1,2 ORDER BY 3 DESC`, [fid])));
    out(`flow ${fid} sends: ` + JSON.stringify(await q(`SELECT s.flow_step, s.channel, s.status, count(*)::int n, count(DISTINCT s.id) FILTER (WHERE e.type='opened')::int opened, count(DISTINCT s.id) FILTER (WHERE e.type='clicked')::int clicked,
        count(DISTINCT s.id) FILTER (WHERE e.type='bounced')::int bounced, count(DISTINCT s.id) FILTER (WHERE e.type='unsubscribed')::int unsub, min(s.created_at) first, max(s.created_at) last
      FROM mk_sends s LEFT JOIN mk_send_events e ON e.send_id=s.id AND NOT e.machine WHERE s.flow_id=$1 AND NOT COALESCE((s.meta->>'test')::boolean,false) GROUP BY 1,2,3 ORDER BY 1`, [fid])));
    try { out(`flow ${fid} credited: ` + JSON.stringify(await require("./mk-analytics").flowSteps(fid, 30))); } catch (e) { out("credit err " + e.message); }
    out(`flow ${fid} people who entered → ordered after entering: ` + JSON.stringify(await q(`SELECT count(DISTINCT r.profile_id)::int entered,
        count(DISTINCT o.profile_id)::int ordered, COALESCE(sum(o.value),0)::float revenue, count(o.id)::int orders
      FROM mk_flow_runs r LEFT JOIN mk_events o ON o.profile_id=r.profile_id AND o.type='placed_order' AND o.at > r.entered_at AND NOT COALESCE((o.props->>'cancelled')::boolean,false)
      WHERE r.flow_id=$1 AND NOT r.test`, [fid])));
  }
  out("welcome codes: " + JSON.stringify(await q(`SELECT COALESCE(percent::text, amount::text) off, count(*)::int issued, count(*) FILTER (WHERE redeemed_at IS NOT NULL)::int used, min(created_at) first, max(created_at) last
    FROM mk_coupons WHERE real AND created_at > now() - interval '10 days' GROUP BY 1`)));
  out("orders using a WELCOME code (10 days): " + JSON.stringify(await q(`SELECT to_char(date_trunc('day', e.at AT TIME ZONE 'America/Chicago'),'MM-DD') d, count(DISTINCT e.id)::int n, sum(e.value)::float revenue,
      string_agg(DISTINCT c, ',') codes FROM mk_events e, LATERAL jsonb_array_elements_text(COALESCE(e.props->'discount_codes','[]'::jsonb)) c
    WHERE e.type='placed_order' AND e.at > now() - interval '10 days' AND upper(c) LIKE 'WELCOME%' GROUP BY 1 ORDER BY 1`)));
  out("store orders by day (10 days): " + JSON.stringify(await q(`SELECT store, to_char(date_trunc('day', at AT TIME ZONE 'America/Chicago'),'MM-DD') d, count(*)::int n, sum(value)::float revenue FROM mk_events WHERE type='placed_order' AND at > now() - interval '10 days' AND NOT COALESCE((props->>'cancelled')::boolean,false) GROUP BY 1,2 ORDER BY 1,2`)));
  await core.syncSet("signup_perf_v1", "1", {});
}
// One-time deep look at the abandoned cart / checkout flows (#9, #10) — logs only.
async function cartDiag() {
  if (await syncGet("cart_diag_v1")) return;
  const out = (m) => console.log("🛒 CART-DIAG " + m);
  const q = async (sql, a = []) => (await db(sql, a).catch((e) => ({ rows: [{ error: e.message }] }))).rows;
  for (const fid of [9, 10]) {
    const f = (await q(`SELECT * FROM mk_flows WHERE id=$1`, [fid]))[0]; if (!f || f.error) { out(`flow ${fid} missing`); continue; }
    out(`flow ${fid} ${f.name}: ${JSON.stringify({ status: f.status, store: f.store, trigger: f.trigger, entry: f.entry_filter, exit: f.exit_filter, reentry: f.reentry, start: f.graph && f.graph.start, updated: f.updated_at })}`);
    for (const [id, n] of Object.entries((f.graph && f.graph.nodes) || {})) { const c = n.config || {}; out(`flow ${fid} node ${id}: ${JSON.stringify({ type: n.type, next: n.next, yes: n.yes, no: n.no, status: c.status, tpl: c.template_id, subject: c.subject, name: c.name, amount: c.amount, unit: c.unit, until: c.until_time, body: c.body && String(c.body).slice(0, 140), cond: c.condition, smart: c.smart_sending, filter: c.filter && (c.filter.conditions || []).length ? c.filter : undefined })}`); }
    out(`flow ${fid} runs: ` + JSON.stringify(await q(`SELECT status, node_id, end_reason, count(*)::int n, min(entered_at) first, max(entered_at) last FROM mk_flow_runs WHERE flow_id=$1 AND NOT test GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 30`, [fid])));
    out(`flow ${fid} log actions (7d): ` + JSON.stringify(await q(`SELECT node_id, action, left(COALESCE(detail,''),90) detail, count(*)::int n FROM mk_flow_log WHERE flow_id=$1 AND at > now() - interval '7 days' GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 40`, [fid])));
    out(`flow ${fid} sends: ` + JSON.stringify(await q(`SELECT s.flow_step, s.channel, s.status, left(COALESCE(s.reason,''),80) reason, count(DISTINCT s.id)::int n, count(DISTINCT s.id) FILTER (WHERE e.type='opened')::int opened, count(DISTINCT s.id) FILTER (WHERE e.type='clicked')::int clicked FROM mk_sends s LEFT JOIN mk_send_events e ON e.send_id=s.id AND NOT e.machine WHERE s.flow_id=$1 AND NOT COALESCE((s.meta->>'test')::boolean,false) GROUP BY 1,2,3,4 ORDER BY 1`, [fid])));
    out(`flow ${fid} entered→ordered: ` + JSON.stringify(await q(`SELECT count(DISTINCT r.profile_id)::int entered, count(DISTINCT o.profile_id)::int ordered_after, COALESCE(sum(o.value),0)::float revenue,
        count(DISTINCT o.profile_id) FILTER (WHERE o.at < r.entered_at + interval '1 hour')::int ordered_within_1h FROM mk_flow_runs r LEFT JOIN mk_events o ON o.profile_id=r.profile_id AND o.type='placed_order' AND o.at > r.entered_at AND o.at < r.entered_at + interval '7 days' WHERE r.flow_id=$1 AND NOT r.test`, [fid])));
    out(`flow ${fid} recent log: ` + JSON.stringify(await q(`SELECT to_char(at AT TIME ZONE 'America/Chicago','MM-DD HH24:MI') t, run_id, node_id, action, left(COALESCE(detail,''),120) d FROM mk_flow_log WHERE flow_id=$1 ORDER BY id DESC LIMIT 25`, [fid])));
  }
  out("events 7d: " + JSON.stringify(await q(`SELECT type, source, count(*)::int n, count(*) FILTER (WHERE profile_id IS NOT NULL)::int with_profile, count(DISTINCT profile_id)::int people,
      count(*) FILTER (WHERE jsonb_array_length(COALESCE(props->'items','[]'::jsonb))>0)::int with_items FROM mk_events WHERE type IN ('added_to_cart','started_checkout','viewed_product','active_on_site') AND at > now() - interval '7 days' GROUP BY 1,2 ORDER BY 1`)));
  out("checkout people 7d vs enrolled: " + JSON.stringify(await q(`SELECT count(DISTINCT e.profile_id)::int people, count(DISTINCT e.profile_id) FILTER (WHERE EXISTS (SELECT 1 FROM mk_flow_runs r WHERE r.flow_id=9 AND r.profile_id=e.profile_id))::int in_flow9,
      count(DISTINCT e.profile_id) FILTER (WHERE EXISTS (SELECT 1 FROM mk_events o WHERE o.profile_id=e.profile_id AND o.type='placed_order' AND o.at > e.at AND o.at < e.at + interval '7 days'))::int ordered_anyway,
      count(DISTINCT e.profile_id) FILTER (WHERE p.email_consent='subscribed')::int emailable FROM mk_events e JOIN mk_profiles p ON p.id=e.profile_id WHERE e.type='started_checkout' AND e.at > now() - interval '7 days'`)));
  out("cart people 7d vs enrolled: " + JSON.stringify(await q(`SELECT count(DISTINCT e.profile_id)::int people, count(DISTINCT e.profile_id) FILTER (WHERE EXISTS (SELECT 1 FROM mk_flow_runs r WHERE r.flow_id=10 AND r.profile_id=e.profile_id))::int in_flow10,
      count(DISTINCT e.profile_id) FILTER (WHERE p.email_consent='subscribed')::int emailable FROM mk_events e JOIN mk_profiles p ON p.id=e.profile_id WHERE e.type='added_to_cart' AND e.at > now() - interval '7 days'`)));
  out("checkout sync: " + JSON.stringify([await core.syncGet("mk_checkouts_lb").catch(() => null), await core.syncGet("mk_checkouts_lbo").catch(() => null)]));
  out("settings sending: " + JSON.stringify(((await require("./mk-core").settings()) || {}).sending));
  await core.syncSet("cart_diag_v1", "1", {});
}
// One-time: "Record store activity" was off for Larkspur Baby, so no add-to-cart/product-view events were recorded and the
// Abandoned Cart flow could never start. Turn it on for Larkspur Baby (Outlet stays as it is).
async function trackingOn() {
  if (await syncGet("tracking_on_lb_v1")) return;
  const MK = require("./mk-core"); const cur = await MK.settings(); const t = { ...(cur.tracking || {}) };
  const was = !!t.lb; t.lb = true; await MK.saveSettings({ tracking: t }, "Buzzin");
  try { require("./mk-forms").clearCache(); } catch (_) {}
  await core.syncSet("tracking_on_lb_v1", "1", { was });
  console.log(`🛒 store activity tracking for Larkspur Baby: ${was ? "already on" : "turned on"}`);
}
// One-time deep look at the 10% sign-up form (#6) and Welcome Series + 10% (#12) — logs only.
/** Shopify lists Buzzin keeps in step every day (Shopify's own browsing data). */
// Shopify's segment API speaks the segment query language (storefront_event.…), not the newer ShopifyQL shown in the admin; the first form it accepts is used.
// "No order in 180 days" is checked on Buzzin's side (it has every order), so the list is just the viewers.
const SHOPIFY_LISTS = [];   // Shopify's API doesn't offer product views ("MATCHES is unexpected"); viewers come from an uploaded export instead.
const SHOPIFY_LISTS_OFF = [{ store: "lb", name: "Shopify: viewed a product in 180 days", query: "storefront_event.product_viewed MATCHES (date >= -180d)",
  alts: ["storefront.product_viewed MATCHES (date >= -180d)", "storefront_event.product_viewed MATCHES (date > -180d)"] }];
async function syncShopifyLists() {
  for (const l of SHOPIFY_LISTS) { try { const r = await require("./mk-core").syncShopifyQueryList(l.store, l.query, l.name, l.alts); console.log(`🛒 Shopify list "${l.name}": ${r.shopify} in Shopify · ${r.matched} matched to profiles`); } catch (e) { console.error(`Shopify list "${l.name}":`, e.message); } }
}
/** "Ready to convert": said yes to texts, engaged in the last 180 days (viewed products on Shopify, clicked, carted, opened or visited) and no order in 180 days.
 *  The 5,000 most recently engaged. Replaces the first version of this segment. */
async function convertSms5k() {
  if (await syncGet("convert_sms_5k_v3")) return;
  await syncShopifyLists();
  const SEG = require("./mk-segments");
  const list = (await db(`SELECT id FROM mk_lists WHERE store='lb' AND source='shopify_query' AND ext_id=$1`, [SHOPIFY_LISTS[0].query.slice(0, 300)])).rows[0];
  const d180 = { kind: "last_days", days: 180 };
  const engaged = [
    { type: "field", field: "last_engaged_at", op: "within_days", value: 180 },
    { type: "event", event: "clicked_email", op: "at_least", value: 1, window: d180 },
    { type: "event", event: "clicked_sms", op: "at_least", value: 1, window: d180 },
    { type: "event", event: "viewed_product", op: "at_least", value: 1, window: d180 },
    { type: "event", event: "added_to_cart", op: "at_least", value: 1, window: d180 },
    { type: "event", event: "started_checkout", op: "at_least", value: 1, window: d180 },
    { type: "event", event: "active_on_site", op: "at_least", value: 1, window: d180 }];
  if (list) engaged.unshift({ type: "list", list_id: list.id, in: true });
  const definition = { match: "all", limit: 5000, conditions: [
    { type: "consent", channel: "sms", state: "subscribed" },
    { type: "event", event: "placed_order", op: "zero", window: d180 },
    { group: { match: "any", conditions: engaged } }] };
  const all = await SEG.count({ ...definition, limit: null }, "lb");
  const old = (await db(`SELECT id FROM mk_segments WHERE store='lb' AND name IN ('Engaged 180 days + SMS (top 5,000)','Ready to convert: engaged 180 days, no order (SMS, top 5,000)') AND NOT archived ORDER BY id DESC LIMIT 1`)).rows[0];
  const s = await SEG.save({ id: old ? old.id : null, store: "lb", name: "Ready to convert: engaged 180 days, no order (SMS, top 5,000)",
    description: "Said yes to texts, engaged in the last 180 days (viewed products on Shopify, clicked, added to cart, started checkout, opened or visited) and no order in 180 days. Most recently engaged 5,000.", definition }, "Claude");
  const r = await SEG.refresh(s.id);
  console.log(`🎯 segment ${s.id} "Ready to convert": ${r.n} people (of ${all.n} who match)`);
  await core.syncSet("convert_sms_5k_v3", String(s.id), { all: all.n, kept: r.n });
}
/** One-time: from the uploaded Shopify product-viewer list, the people who can get texts and haven't ordered in 180 days. Logs the counts. */
async function viewerSegment() {
  if (await syncGet("viewer_seg_v1")) return;
  const list = (await db(`SELECT id, name FROM mk_lists WHERE NOT archived AND description LIKE 'Uploaded from a file%' ORDER BY id DESC LIMIT 1`)).rows[0];
  if (!list) { console.log("👀 viewer segment: no uploaded list yet"); return; }
  const SEG = require("./mk-segments");
  const definition = { match: "all", conditions: [{ type: "list", list_id: list.id, in: true }, { type: "consent", channel: "sms", state: "subscribed" },
    { type: "event", event: "placed_order", op: "zero", window: { kind: "last_days", days: 180 } }] };
  const s = await SEG.save({ store: "lb", name: `${list.name}: can text, no order in 180 days`, description: `From the uploaded list "${list.name}". Said yes to texts and no order in the last 180 days.`, definition }, "Claude");
  const r = await SEG.refresh(s.id);
  const L = (await db(`SELECT count(*)::int n, count(*) FILTER (WHERE p.sms_consent='subscribed')::int sms, count(*) FILTER (WHERE p.email_consent='subscribed')::int email,
      count(*) FILTER (WHERE p.sms_consent='subscribed' AND p.last_order_at > now() - interval '180 days')::int sms_ordered FROM mk_list_members m JOIN mk_profiles p ON p.id=m.profile_id WHERE m.list_id=$1`, [list.id])).rows[0];
  console.log(`👀 viewer list ${list.id} "${list.name}": ${L.n} people · ${L.email} can get email · ${L.sms} can get texts (${L.sms_ordered} of them ordered in 180 days) → segment ${s.id}: ${r.n} people`);
  await core.syncSet("viewer_seg_v1", String(s.id), { list: list.id, ...L, seg: r.n });
}
async function welcomeDeep() {
  if (await syncGet("welcome_deep_v1")) return;
  const out = (m) => console.log("🌱 WELCOME-DEEP " + m);
  const q = async (sql, a = []) => (await db(sql, a).catch((e) => ({ rows: [{ error: e.message }] }))).rows;
  const f = (await q(`SELECT * FROM mk_forms WHERE id=6`))[0] || {};
  out("form: " + JSON.stringify({ name: f.name, status: f.status, type: f.type, list_id: f.list_id, targeting: f.targeting, coupon: f.coupon, style: f.style && { width: f.style.width, position: f.style.position } }).slice(0, 1800));
  for (const st of f.steps || []) out(`form step ${st.id}: ` + JSON.stringify((st.blocks || []).map((b) => ({ type: b.type, text: (b.text || b.label || b.html || b.placeholder || "").toString().replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 90), req: b.required, field: b.field || b.name, list: b.list_id, go: b.next_step || b.action }))).slice(0, 1800));
  out("form events by type (all time): " + JSON.stringify(await q(`SELECT type, count(*)::int n, count(DISTINCT vid)::int vids FROM mk_form_events WHERE form_id=6 AND NOT preview GROUP BY 1 ORDER BY 2 DESC`)));
  out("form by hour-of-day viewed/submitted: " + JSON.stringify(await q(`SELECT count(*) FILTER (WHERE type='viewed')::int views, count(*) FILTER (WHERE type='submitted_email')::int emails, count(*) FILTER (WHERE type='closed')::int closed,
      count(DISTINCT vid) FILTER (WHERE type='closed' AND vid IN (SELECT vid FROM mk_form_events WHERE form_id=6 AND type='submitted_email'))::int closed_after_email FROM mk_form_events WHERE form_id=6 AND NOT preview`)));
  out("signups → profiles: " + JSON.stringify(await q(`SELECT p.id, left(p.email,3) || '…' em, p.email_consent, p.sms_consent, p.orders_count, to_char(e.at AT TIME ZONE 'America/Chicago','MM-DD HH24:MI') at,
      (SELECT string_agg(r.node_id || ':' || r.status || COALESCE('(' || r.end_reason || ')',''), ',') FROM mk_flow_runs r WHERE r.profile_id=p.id AND r.flow_id=12) run
    FROM mk_form_events e JOIN mk_profiles p ON p.id=e.profile_id WHERE e.form_id=6 AND e.type='submitted_email' AND NOT e.preview ORDER BY e.at`)));
  out("flow 12 log actions: " + JSON.stringify(await q(`SELECT node_id, action, left(COALESCE(detail,''),100) d, count(*)::int n FROM mk_flow_log WHERE flow_id=12 GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 40`)));
  out("flow 12 sends: " + JSON.stringify(await q(`SELECT s.flow_step, s.channel, s.status, left(COALESCE(s.reason,''),80) reason, count(DISTINCT s.id)::int n,
      count(DISTINCT s.id) FILTER (WHERE e.type='opened' AND NOT e.machine)::int opened, count(DISTINCT s.id) FILTER (WHERE e.type='opened' AND e.machine)::int machine_opened,
      count(DISTINCT s.id) FILTER (WHERE e.type='clicked' AND NOT e.machine)::int clicked, count(DISTINCT s.id) FILTER (WHERE e.type IN ('delivered','delivery'))::int delivered_evt, count(DISTINCT s.id) FILTER (WHERE e.type='bounced')::int bounced
    FROM mk_sends s LEFT JOIN mk_send_events e ON e.send_id=s.id WHERE s.flow_id=12 GROUP BY 1,2,3,4 ORDER BY 1`)));
  out("send event types (all marketing, 7d): " + JSON.stringify(await q(`SELECT s.channel, e.type, e.machine, count(*)::int n FROM mk_send_events e JOIN mk_sends s ON s.id=e.send_id WHERE e.at > now() - interval '7 days' GROUP BY 1,2,3 ORDER BY 1,2`)));
  out("welcome codes for flow 12 people: " + JSON.stringify(await q(`SELECT c.code, c.percent, c.redeemed_at IS NOT NULL used, c.expires_at FROM mk_coupons c WHERE c.profile_id IN (SELECT profile_id FROM mk_flow_runs WHERE flow_id=12) AND c.real ORDER BY c.id DESC LIMIT 20`)));
  out("orders by flow 12 people after joining: " + JSON.stringify(await q(`SELECT p.id, to_char(o.at AT TIME ZONE 'America/Chicago','MM-DD HH24:MI') at, o.value, o.props->'discount_codes' codes,
      round(extract(epoch from (o.at - r.entered_at))/3600.0,1) hours_after FROM mk_flow_runs r JOIN mk_profiles p ON p.id=r.profile_id JOIN mk_events o ON o.profile_id=r.profile_id AND o.type='placed_order' AND o.at > r.entered_at - interval '1 hour' WHERE r.flow_id=12 ORDER BY o.at`)));
  await core.syncSet("welcome_deep_v1", "1", {});
}
// Staff: local pickup orders waiting to be collected, with ready / reminder emails (pickup.js)
require("./pickup").routes(app, { guard, actorOf });
// Staff: goodwill exceptions — waive specific return / claim policies for one order (exceptions.js)
const EXC = require("./exceptions");
app.get("/api/returns/exceptions", async (req, res) => {
  if (!guard(req, res)) return;
  try { res.json({ exceptions: await EXC.list({ all: req.query.all === "1", q: String(req.query.q || "") }), rules: EXC.RULES }); } catch (e) { retErr(res, e); }
});
app.post("/api/returns/exceptions", async (req, res) => {
  if (!guard(req, res)) return;
  try { res.json({ ok: true, exception: await EXC.add(req.body || {}, actorOf(req)) }); } catch (e) { retErr(res, e); }
});
app.post("/api/returns/exceptions/:id/remove", async (req, res) => {
  if (!guard(req, res)) return;
  try { res.json({ ok: true, exception: await EXC.remove(req.params.id, actorOf(req)) }); } catch (e) { retErr(res, e); }
});
// Staff
app.get("/api/returns", async (req, res) => {
  if (!guard(req, res)) return;
  try { const s = await R.settings(); res.json({ returns: await R.list({ status: req.query.status || "", store: req.query.store || "", q: req.query.q || "", source: req.query.source || "" }), counts: await R.counts(), settings: s, problems: R.setupProblems(s), stores: R.STORE_DEFS, portal_links: Object.fromEntries(Object.keys(R.STORE_DEFS).map((k) => [k, R.portalUrl(k, s)])), branded_hosts: Object.fromEntries(Object.values(R.STORE_DEFS).map((d) => [d.key, d.host])), admin: isAdmin(req) }); }
  catch (e) { retErr(res, e); }
});
app.get("/api/returns/analytics", async (req, res) => {
  if (!guard(req, res)) return;
  try { res.json(await R.analytics({ from: req.query.from, to: req.query.to, store: req.query.store })); } catch (e) { retErr(res, e); }
});
app.post("/api/returns/reset-stats", async (req, res) => {
  if (!guard(req, res)) return; if (!isAdmin(req)) return res.status(403).json({ error: "Only admins can reset return stats." });
  try { res.json({ ok: true, since: await R.resetStats(actorOf(req)) }); } catch (e) { retErr(res, e); }
});
app.get("/api/returns.csv", async (req, res) => {
  if (!guard(req, res)) return;
  try { res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", 'attachment; filename="returns.csv"'); res.send(R.csv(await R.list({ limit: 1000, source: "all" }))); } catch (e) { retErr(res, e); }
});
app.get("/api/returns/order/:name", async (req, res) => { if (!guard(req, res)) return; try { res.json(await R.staffLookup(req.params.name)); } catch (e) { retErr(res, e); } });
app.post("/api/returns/create", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const b = req.body || {}, who = actorOf(req), ticketId = b.ticket_id ? Number(b.ticket_id) : null;
    const { rec, file } = await R.createForTicket({ orderName: b.order, lines: b.lines || [], refundMethod: b.refund_method, ticketId, who, staffOverride: !!b.override });
    if (ticketId && file) {   // ride along on the next reply, same as an applied Emily action
      await db(`INSERT INTO emily_actions (id,kind,title,summary,ticket_id,input,status,result,decided_by,decided_at,files) VALUES ($1,'return_manual',$2,$3,$4,$5,'applied',$6,$7,now(),$8)`,
        ["act_" + crypto.randomUUID(), `Return + label — ${rec.order_name}`, `Return ${rec.rma}`, String(ticketId), JSON.stringify(b), `Return ${rec.rma} · label ${rec.tracking_number}`, who, JSON.stringify([{ ...file, sent: false }])]);
      await addNote({ ticketId, text: `↩️ Return ${rec.rma} created by ${who} — ${rec.items.map((i) => `${i.quantity}× ${i.title}`).join(", ")} · label ${rec.tracking_number}${rec.test_label ? " (TEST label)" : ""}. The label PDF is attached to your next reply.`, who });
    }
    res.json({ ok: true, record: rec, attached: !!file });
  } catch (e) { retErr(res, e); }
});
/* ---- Klaviyo import (read-only): flows, templates, lists, segments, forms ---- */
const KL = require("./klaviyo");
app.get("/api/klaviyo/status", async (req, res) => { if (!guard(req, res)) return; try { res.json(await KL.status()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post("/api/klaviyo/import", async (req, res) => {
  if (!guard(req, res)) return; if (!isAdmin(req)) return res.status(403).json({ error: "admins only" });
  KL.importAll(actorOf(req)).catch(() => {}); res.json({ ok: true, started: true });
});
app.get("/api/klaviyo/:kind", async (req, res) => {
  if (!guard(req, res)) return; if (!["flow", "template", "list", "segment", "form", "metric"].includes(req.params.kind)) return res.status(404).json({ error: "unknown kind" });
  try { const rows = await KL.list(req.params.kind); res.json({ items: rows.map((r) => ({ id: r.id, name: r.name, fetched_at: r.fetched_at, ...(req.query.full ? { data: r.data } : {}) })) }); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get("/api/klaviyo/:kind/:id", async (req, res) => { if (!guard(req, res)) return; try { const r = await KL.get(req.params.kind, req.params.id); if (!r) return res.status(404).json({ error: "not found" }); res.json(r); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post("/api/returns/poll", async (req, res) => { if (!guard(req, res)) return; try { await R.poll(); res.json({ ok: true }); } catch (e) { retErr(res, e); } });
app.get("/api/returns/ss-stores", async (req, res) => { if (!guard(req, res)) return; try { res.json({ stores: await R.ssStores() }); } catch (e) { retErr(res, e); } });
app.get("/api/returns/carriers", async (req, res) => { if (!guard(req, res)) return; try { res.json({ carriers: await R.carriers() }); } catch (e) { retErr(res, e); } });
app.put("/api/returns/settings", async (req, res) => {
  if (!guard(req, res)) return; if (!isAdmin(req)) return res.status(403).json({ error: "admins only" });
  try { const saved = await R.saveSettings(req.body || {}, actorOf(req)); res.json({ settings: saved });
    setTimeout(() => require("./faqs").autoRunAll("Returns settings changed").catch(() => {}), 5000); } catch (e) { retErr(res, e); }
});
// Import the returns still open in Loop (Loop ASN report .xlsx files). ?apply=1 imports; without it, a preview.
app.post("/api/returns/loop-import", express.json({ type: "application/x-loop-import", limit: "25mb" }), async (req, res) => {
  if (!guard(req, res)) return; if (!isAdmin(req)) return res.status(403).json({ error: "Only admins can import from Loop." });
  try {
    const files = ((req.body && req.body.files) || []).map((f) => ({ name: String(f.name || ""), buffer: Buffer.from(String(f.data || ""), "base64") })).filter((f) => f.buffer.length);
    if (!files.length) return res.status(400).json({ error: "Pick the Loop report file(s) first." });
    res.json(await require("./loop-import").run(files, { apply: req.query.apply === "1", who: actorOf(req) }));
  } catch (e) { retErr(res, e); }
});
// Returned-items log (what's coming back, what arrived, what the warehouse accepted). Also readable by Stockroom with the same key.
app.get("/api/returns/items", async (req, res) => {
  if (!guard(req, res)) return;
  try { res.json(await R.itemsLog({ state: String(req.query.state || "all"), store: String(req.query.store || ""), q: String(req.query.q || ""), from: String(req.query.from || ""), to: String(req.query.to || "") })); }
  catch (e) { retErr(res, e); }
});
app.get("/api/returns/items.csv", async (req, res) => {
  if (!guard(req, res)) return;
  try { const d = await R.itemsLog({ state: String(req.query.state || "all"), store: String(req.query.store || ""), q: String(req.query.q || ""), from: String(req.query.from || ""), to: String(req.query.to || "") });
    res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", 'attachment; filename="returned-items.csv"'); res.send(R.itemsCsv(d.rows)); }
  catch (e) { retErr(res, e); }
});
app.post("/api/returns/:id/:act", async (req, res) => {
  if (!guard(req, res)) return;
  const who = actorOf(req), act = req.params.act;
  try {
    const rec = await R.getRec(req.params.id); if (!rec) return res.status(404).json({ error: "not found" });
    if (act === "refund") await R.refund(rec, { force: true, who });
    else if (act === "accept") await R.acceptAtWarehouse(rec, { who, items: (req.body || {}).items, note: (req.body || {}).note, all: !!(req.body || {}).all });
    else if (act === "track") await R.checkOne(rec);
    else if (act === "cancel") await R.cancel(rec, `Cancelled by ${who}`, who);
    else return res.status(400).json({ error: "unknown action" });
    res.json({ ok: true, record: await R.getRec(rec.id) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

const PORT = process.env.PORT || 8080;
(async () => {
  if (pool) { try { await migrate(); try { await require("./pickup").migrate(); } catch (e) { console.error("pickup migrate:", e.message); } try { await labelBackfill(); } catch (e) { console.error("label backfill:", e.message); } try { await labelRestage(); } catch (e) { console.error("label restage:", e.message); } setTimeout(() => signupDiag().catch((e) => console.error("signup diag:", e.message)), 5000); try { await signupList(); } catch (e) { console.error("sign-up list:", e.message); } setTimeout(() => flowEmailNames().catch((e) => console.error("flow email names:", e.message)), 15000); setTimeout(() => welcomeDiag().catch((e) => console.error("welcome diag:", e.message)), 20000); setTimeout(() => welcomeText().catch((e) => console.error("welcome text:", e.message)), 25000); setTimeout(() => welcome10Fix().catch((e) => console.error("welcome 10 fix:", e.message)), 30000); setTimeout(() => thankYouCheck().catch((e) => console.error("thank you check:", e.message)), 32000); setTimeout(() => signupPerf().catch((e) => console.error("signup perf:", e.message)), 40000); setTimeout(() => cartDiag().catch((e) => console.error("cart diag:", e.message)), 45000); setTimeout(() => trackingOn().catch((e) => console.error("tracking on:", e.message)), 47000); setTimeout(() => welcomeDeep().catch((e) => console.error("welcome deep:", e.message)), 50000); setTimeout(() => convertSms5k().catch((e) => console.error("convert sms 5k:", e.message)), 53000); setTimeout(() => viewerSegment().catch((e) => console.error("viewer segment:", e.message)), 30000); setInterval(() => syncShopifyLists().catch(() => {}), 24 * 3600e3); console.log("🗄️  Buzzin schema ready"); await core.loadSessions(); await core.renameStoredText(); } catch (e) { console.error("migrate failed:", e.message); } }
  if (pool) { try { if (!(await syncGet("classify_v3_9"))) { const r = await core.classifyBacklog(); await core.syncSet("classify_v3_9", String(r.junk), { at: new Date().toISOString(), ...r }); } } catch (e) { console.error("classify:", e.message); } }
  if (pool) { try { if (!(await syncGet("order_link_v4_12"))) { const n = await core.backfillTicketOrders(); await core.syncSet("order_link_v4_12", String(n), { at: new Date().toISOString() }); } } catch (e) { console.error("order link:", e.message); } }
  // One-time after v3.1: fold together tickets that arrived twice (Gorgias import + Gmail) before the two paths were linked.
  if (pool) { try { if (!(await syncGet("dedupe_v3_1"))) { const n = await core.dedupeTickets(); await core.syncSet("dedupe_v3_1", String(n), { at: new Date().toISOString() }); console.log(`🧹 duplicate sweep done — ${n} merged`); } } catch (e) { console.error("dedupe:", e.message); } }
  app.listen(PORT, () => {
    console.log(`📨 Buzzin v${VERSION} on :${PORT}`);
    console.log(`🔎 boot → users:${USERS.map((u) => u.name).join("/") || "(none)"}${KEY ? "+admin-key" : ""} · db:${pool ? "set" : "MISSING"} · gorgias-import:${core.G_DOMAIN || "off"} · gmail-oauth:${gmailConfigured() ? `${core.OAUTH_CLIENTS.length} client${core.OAUTH_CLIENTS.length === 1 ? "" : "s"}` : "not configured"} · slack:${process.env.SLACK_BOT_TOKEN || process.env.EMILY_SLACK_BOT_TOKEN ? "set" : "off"}`);
  });
  if (pool && gmailConfigured()) {
    const every = Number(process.env.GMAIL_POLL_SEC || 45) * 1000;
    setTimeout(pollAll, 8000); setInterval(pollAll, every);
    console.log(`📬 Gmail polling every ${every / 1000}s`);
  }
  try { await R.init(); } catch (e) { console.error("Returns failed to start:", e.message); }
  try { await PT.init(); } catch (e) { console.error("Portal theme failed to start:", e.message); }
  try { await CL.init(); } catch (e) { console.error("Claims failed to start:", e.message); }
  try { await EXC.init(); } catch (e) { console.error("Exceptions failed to start:", e.message); }
  try { await EM.init(); } catch (e) { console.error("Email templates failed to start:", e.message); }
  try { await FAQ.init(); } catch (e) { console.error("FAQs failed to start:", e.message); }
  try { await require("./mk-core").init(); await require("./mk-send").migrate(); for (const m of ["./mk-email", "./mk-forms", "./mk-segments", "./mk-flows", "./mk-campaigns", "./mk-sms", "./mk-analytics", "./mk-ses", "./mk-sms-aws", "./mk-forms-klaviyo"]) { try { const x = require(m); if (x.init) await x.init(); } catch (e) { if (e.code !== "MODULE_NOT_FOUND") console.error(`marketing ${m}:`, e.message); } } } catch (e) { console.error("Marketing failed to start:", e.message); }
  try { await CHAT.init(); } catch (e) { console.error("Chat widget failed to start:", e.message); }
  try { await KL.init(); } catch (e) { console.error("Klaviyo import failed to start:", e.message); }
  try { await require("./catalog").init(); } catch (e) { console.error("Catalog failed to start:", e.message); }
  // Emily — the agent. Runs inside this process; drafts on every inbound message; talks in Slack.
  try { await require("./emily").start(); } catch (e) { console.error("Emily failed to start:", e.message); }
})();
