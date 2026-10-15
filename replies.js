/**
 * Emily's replies — one place to see what Buzzin said without a person in the loop:
 *   • website chat conversations (both stores), stored in hd_chats and kept indefinitely
 *   • emails Emily sent automatically (emily_drafts.outcome = 'auto_sent')
 *   • tickets Emily closed on her own (hd_events status 'closed — …' by Emily)
 * Used by the "Emily's replies" page in the app and by the Claude connector.
 */
const core = require("./core");
const db = (q, p) => core.db(q, p);
const STORE_NAMES = { lb: "Larkspur Baby", lbo: "Larkspur Baby Outlet" };

const clampLimit = (n, dflt = 50) => Math.min(Math.max(Number(n) || dflt, 1), 200);

/* ---------------- website chat ---------------- */
async function listChats({ store = "", q = "", handoff = false, offset = 0, limit = 50 } = {}) {
  const where = ["NOT coalesce(preview, false)", "jsonb_array_length(messages) > 0"], p = [];
  if (store && STORE_NAMES[store]) { p.push(store); where.push(`store = $${p.length}`); }
  if (handoff) where.push("ticket_id IS NOT NULL");
  if (q) { p.push(`%${q}%`); where.push(`(messages::text ILIKE $${p.length} OR coalesce(handoff_email,'') ILIKE $${p.length} OR coalesce(verified->>'name','') ILIKE $${p.length})`); }
  const W = where.join(" AND ");
  const total = (await db(`SELECT count(*)::int n FROM hd_chats WHERE ${W}`, p)).rows[0].n;
  const lim = clampLimit(limit), off = Math.max(Number(offset) || 0, 0);
  const rows = (await db(`SELECT id, store, created_at, updated_at, page, ticket_id, handoff_email, verified, messages
                          FROM hd_chats WHERE ${W} ORDER BY updated_at DESC LIMIT ${lim} OFFSET ${off}`, p)).rows;
  const items = rows.map((c) => {
    const msgs = Array.isArray(c.messages) ? c.messages : [];
    const firstUser = msgs.find((m) => m.role === "user");
    const lastBot = [...msgs].reverse().find((m) => m.role === "bot");
    return {
      id: c.id, store: c.store, store_name: STORE_NAMES[c.store] || c.store, started: c.created_at, last: c.updated_at, page: c.page,
      messages: msgs.length, customer_messages: msgs.filter((m) => m.role === "user").length,
      first_question: firstUser ? String(firstUser.text || "").slice(0, 240) : "",
      last_reply: lastBot ? String(lastBot.text || "").slice(0, 240) : "",
      order: c.verified && c.verified.name ? c.verified.name : null,
      handed_off: !!c.ticket_id, ticket_id: c.ticket_id || null, email: c.handoff_email || null,
    };
  });
  return { total, offset: off, items };
}

async function getChat(id) {
  const c = (await db(`SELECT id, store, created_at, updated_at, page, ticket_id, handoff_email, verified, messages FROM hd_chats WHERE id=$1`, [String(id)])).rows[0];
  if (!c) throw new Error("That chat no longer exists.");
  return {
    id: c.id, store: c.store, store_name: STORE_NAMES[c.store] || c.store, started: c.created_at, last: c.updated_at, page: c.page,
    order: c.verified && c.verified.name ? c.verified.name : null, ticket_id: c.ticket_id || null, email: c.handoff_email || null,
    messages: (Array.isArray(c.messages) ? c.messages : []).map((m) => ({
      who: m.role === "user" ? "customer" : "Emily", at: m.at || null, text: m.text || "",
      ...(m.order ? { order: m.order.order || m.order.name || true } : {}),
      ...(m.handoff ? { handoff: true } : {}),
      ...(m.products && m.products.length ? { products: m.products.map((x) => x.title || x.handle || x).slice(0, 8) } : {}),
      ...(m.buttons && m.buttons.length ? { buttons: m.buttons.map((b) => b.label || b.text || b).slice(0, 8) } : {}),
    })),
  };
}

/* ---------------- auto-sent emails and auto-closed tickets ---------------- */
async function listAuto({ kind = "", store = "", q = "", offset = 0, limit = 50 } = {}) {
  const p = [], where = [];
  if (store === "lb") where.push(`t.brand ILIKE 'Larkspur Baby' AND t.brand NOT ILIKE '%outlet%'`);
  if (store === "lbo") where.push(`t.brand ILIKE '%outlet%'`);
  if (kind === "sent") where.push("d.id IS NOT NULL");
  if (kind === "closed") where.push("c.ts IS NOT NULL");
  if (q) { p.push(`%${q}%`); const i = p.length; p.push(String(q).replace(/^#/, "").trim()); const j = p.length;
    where.push(`(t.id::text = $${j} OR t.subject ILIKE $${i} OR t.customer_email ILIKE $${i} OR coalesce(t.customer_name,'') ILIKE $${i} OR coalesce(t.order_number,'') ILIKE $${i} OR coalesce(d.final_text, d.draft, '') ILIKE $${i})`); }
  const base = `FROM hd_tickets t
    LEFT JOIN LATERAL (SELECT id, intent, sentiment, draft, final_text, decided_at FROM emily_drafts WHERE ticket_id = t.id::text AND outcome = 'auto_sent' ORDER BY id DESC LIMIT 1) d ON true
    LEFT JOIN LATERAL (SELECT detail, ts FROM hd_events WHERE ticket_id = t.id AND kind = 'status' AND user_name = 'Emily' AND detail ILIKE 'closed%' ORDER BY ts DESC LIMIT 1) c ON true
    WHERE t.id IN (SELECT ticket_id::bigint FROM emily_drafts WHERE outcome = 'auto_sent' AND ticket_id ~ '^[0-9]+$'
                   UNION SELECT ticket_id FROM hd_events WHERE kind = 'status' AND user_name = 'Emily' AND detail ILIKE 'closed%' AND ticket_id IS NOT NULL)
      ${where.length ? "AND " + where.join(" AND ") : ""}`;
  const total = (await db(`SELECT count(*)::int n ${base}`, p)).rows[0].n;
  const lim = clampLimit(limit), off = Math.max(Number(offset) || 0, 0);
  const rows = (await db(`SELECT t.id, t.subject, t.brand, t.customer_email, t.customer_name, t.status, t.order_number,
      d.id AS draft_id, d.intent, d.sentiment, coalesce(d.final_text, d.draft) AS sent_text, d.decided_at AS sent_at,
      c.detail AS close_detail, c.ts AS closed_at, greatest(d.decided_at, c.ts) AS at,
      (SELECT left(m.body_text, 1500) FROM hd_messages m WHERE m.ticket_id = t.id AND NOT m.internal AND NOT m.from_agent
         AND m.at <= coalesce(d.decided_at, c.ts, now()) ORDER BY m.at DESC LIMIT 1) AS customer_text,
      (SELECT count(*)::int FROM hd_messages m WHERE m.ticket_id = t.id AND NOT m.internal AND NOT m.from_agent AND m.at > coalesce(d.decided_at, c.ts, now())) AS replies_after
    ${base} ORDER BY greatest(d.decided_at, c.ts) DESC NULLS LAST LIMIT ${lim} OFFSET ${off}`, p)).rows;
  const strip = (s) => (core.stripQuoted ? core.stripQuoted(s || "").text : s || "");
  return {
    total, offset: off,
    items: rows.map((r) => ({
      ticket_id: r.id, subject: r.subject, brand: r.brand, customer: r.customer_name || r.customer_email, email: r.customer_email,
      order: r.order_number, status: r.status, at: r.at,
      sent: !!r.draft_id, sent_at: r.sent_at, intent: r.intent, sentiment: r.sentiment, sent_text: r.sent_text || null,
      closed: !!r.closed_at, closed_at: r.closed_at, close_reason: r.close_detail ? String(r.close_detail).replace(/^closed\s*[—-]\s*/i, "") : null,
      customer_text: strip(r.customer_text), customer_replied_after: r.replies_after || 0,
    })),
  };
}

async function stats() {
  const one = async (q) => { try { return (await db(q)).rows[0] || {}; } catch (_) { return {}; } };
  const ch = await one(`SELECT count(*)::int chats, count(ticket_id)::int handoffs FROM hd_chats WHERE NOT coalesce(preview,false) AND jsonb_array_length(messages) > 0 AND created_at > now() - interval '30 days'`);
  const se = await one(`SELECT count(*)::int n FROM emily_drafts WHERE outcome='auto_sent' AND decided_at > now() - interval '30 days'`);
  const cl = await one(`SELECT count(DISTINCT ticket_id)::int n FROM hd_events WHERE kind='status' AND user_name='Emily' AND detail ILIKE 'closed%' AND ts > now() - interval '30 days'`);
  return { chats_30d: ch.chats || 0, handoffs_30d: ch.handoffs || 0, auto_sent_30d: se.n || 0, auto_closed_30d: cl.n || 0 };
}

/* ---------------- routes ---------------- */
function mount(app, { guard }) {
  const wrap = (fn) => async (req, res) => { if (!guard(req, res)) return; try { res.json(await fn(req)); } catch (e) { res.status(400).json({ error: e.message }); } };
  app.get("/api/emily-replies/stats", wrap(() => stats()));
  app.get("/api/emily-replies/chats", wrap((req) => listChats({ store: String(req.query.store || ""), q: String(req.query.q || "").trim(), handoff: req.query.handoff === "1", offset: req.query.offset, limit: req.query.limit })));
  app.get("/api/emily-replies/chats/:id", wrap((req) => getChat(req.params.id)));
  app.get("/api/emily-replies/auto", wrap((req) => listAuto({ kind: String(req.query.kind || ""), store: String(req.query.store || ""), q: String(req.query.q || "").trim(), offset: req.query.offset, limit: req.query.limit })));
}

module.exports = { mount, listChats, getChat, listAuto, stats };
