/* =============================================================================================
 *  Buzzin Marketing · conditions and segments
 *
 *  One condition language, used everywhere: segments, flow splits, flow entry/exit rules,
 *  "show this block only to…". It compiles to SQL against mk_profiles (alias p).
 *
 *  A definition:  { match: "all" | "any", conditions: [ condition | { group: definition } ] }
 *  Conditions:
 *    { type:"event",   event:"placed_order", op:"at_least"|"zero"|"at_most"|"exactly", value:1,
 *                      window:{ kind:"ever"|"last_days"|"since_start"|"between", days, from, to }, where:[{ prop, op, value }] }
 *    { type:"field",   field:"orders_count"|"total_spent"|"tier"|"city"|"region"|"country"|"props.X"|…, op, value }
 *    { type:"consent", channel:"email"|"sms", state:"subscribed"|"not_subscribed" }
 *    { type:"list",    list_id, in:true }
 *    { type:"segment", segment_id, in:true }
 *    { type:"size",    op:"any_of"|"none_of", values:["0-3M","3-6M"] }
 *    { type:"buzzin",  what:"open_ticket"|"recent_return"|"open_claim", in:true, days:30 }
 * ============================================================================================= */
const core = require("./core");
const { db } = core;
const MK = () => require("./mk-core");

const FIELDS = { orders_count: "p.orders_count", total_spent: "p.total_spent", tier: "p.tier", city: "p.city", region: "p.region", country: "p.country", zip: "p.zip",
  email: "p.email", phone: "p.phone", first_name: "p.first_name", email_consent: "p.email_consent", sms_consent: "p.sms_consent",
  first_order_at: "p.first_order_at", last_order_at: "p.last_order_at", created_at: "p.created_at", last_engaged_at: "p.last_engaged_at" };
const DATE_FIELDS = new Set(["first_order_at", "last_order_at", "created_at", "last_engaged_at"]);
const NUM_FIELDS = new Set(["orders_count", "total_spent"]);
const EVENTS = { placed_order: "Placed order", started_checkout: "Started checkout", added_to_cart: "Added to cart", viewed_product: "Viewed product", active_on_site: "Active on site",
  submitted_form: "Signed up through a form", joined_list: "Joined a list", entered_segment: "Entered a segment", received_email: "Got an email", opened_email: "Opened an email",
  clicked_email: "Clicked an email", received_sms: "Got a text", clicked_sms: "Clicked a text", unsubscribed: "Unsubscribed", fulfilled_order: "Order shipped", delivered_order: "Order delivered",
  return_refunded: "Return refunded", claim_approved: "Claim approved", ticket_closed: "Ticket closed", price_drop: "Price dropped on something they viewed", back_in_stock: "Back in stock" };

/** Compile a definition to a SQL boolean expression. `args` collects bind values; ctx.since is the flow-start time. */
function compile(def, args, ctx = {}, depth = 0) {
  if (!def || !Array.isArray(def.conditions) || !def.conditions.length || depth > 3) return "TRUE";
  const parts = def.conditions.map((c) => c.group ? `(${compile(c.group, args, ctx, depth + 1)})` : one(c, args, ctx)).filter(Boolean);
  if (!parts.length) return "TRUE";
  return parts.join(def.match === "any" ? " OR " : " AND ");
}
const A = (args, v) => { args.push(v); return `$${args.length}`; };
function windowSql(w, args, ctx, col = "e.at") {
  if (!w || w.kind === "ever") return "";
  if (w.kind === "last_days") return ` AND ${col} > now() - (${A(args, Number(w.days) || 30)} || ' days')::interval`;
  if (w.kind === "since_start") return ctx.since ? ` AND ${col} >= ${A(args, new Date(ctx.since))}` : "";
  if (w.kind === "between") return `${w.from ? ` AND ${col} >= ${A(args, new Date(w.from))}` : ""}${w.to ? ` AND ${col} < ${A(args, new Date(w.to))}` : ""}`;
  return "";
}
function propFilter(f, args) {
  const key = String(f.prop || "").replace(/[^a-z0-9_]/gi, "");
  if (!key) return "";
  if (key === "value") { const op = { gt: ">", lt: "<", eq: "=", gte: ">=", lte: "<=" }[f.op] || ">"; return ` AND e.value ${op} ${A(args, Number(f.value) || 0)}`; }
  if (key === "size") return ` AND EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(e.props->'items','[]'::jsonb)) it WHERE it->>'size' = ${A(args, String(f.value))})`;
  if (key === "title") return ` AND (e.props->>'title' ILIKE ${A(args, `%${f.value}%`)} OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(e.props->'items','[]'::jsonb)) it WHERE it->>'title' ILIKE $${args.length}))`;
  if (f.op === "contains") return ` AND e.props->>'${key}' ILIKE ${A(args, `%${f.value}%`)}`;
  if (f.op === "ne") return ` AND COALESCE(e.props->>'${key}','') <> ${A(args, String(f.value))}`;
  return ` AND e.props->>'${key}' = ${A(args, String(f.value))}`;
}
function one(c, args, ctx) {
  switch (c.type) {
    case "event": {
      const ev = String(c.event || "").replace(/[^a-z0-9_]/g, "");
      if (!ev) return "TRUE";
      const cancelled = ev === "placed_order" ? " AND NOT COALESCE((e.props->>'cancelled')::boolean,false)" : "";
      const preview = " AND NOT COALESCE((e.props->>'preview')::boolean,false)";
      const where = (c.where || []).map((f) => propFilter(f, args)).join("");
      const cnt = `(SELECT count(*) FROM mk_events e WHERE e.profile_id=p.id AND e.type=${A(args, ev)}${cancelled}${preview}${windowSql(c.window, args, ctx)}${where})`;
      const n = Number(c.value == null ? 1 : c.value);
      if (c.op === "zero") return `${cnt} = 0`;
      if (c.op === "at_most") return `${cnt} <= ${A(args, n)}`;
      if (c.op === "exactly") return `${cnt} = ${A(args, n)}`;
      return `${cnt} >= ${A(args, Math.max(1, n))}`;
    }
    case "field": {
      const fld = String(c.field || "");
      let col = FIELDS[fld];
      if (!col && fld.startsWith("props.")) col = `(p.props->>'${fld.slice(6).replace(/[^a-z0-9_]/gi, "")}')`;
      if (!col) return "TRUE";
      const v = c.value;
      if (DATE_FIELDS.has(fld) || /date|_at$/.test(fld)) {
        const dc = col.startsWith("(p.props") ? `NULLIF(${col},'')::timestamptz` : col;
        if (c.op === "older_than_days") return `${dc} < now() - (${A(args, Number(v) || 0)} || ' days')::interval`;
        if (c.op === "within_days") return `${dc} > now() - (${A(args, Number(v) || 0)} || ' days')::interval`;
        if (c.op === "in_days") return `${dc}::date = (now() + (${A(args, Number(v) || 0)} || ' days')::interval)::date`;
        if (c.op === "set") return `${col} IS NOT NULL`; if (c.op === "unset") return `${col} IS NULL`;
      }
      const num = NUM_FIELDS.has(fld) || ["gt", "lt", "gte", "lte"].includes(c.op);
      const L = num && col.startsWith("(p.props") ? `NULLIF(${col},'')::numeric` : col;
      switch (c.op) {
        case "set": return `${col} IS NOT NULL AND ${col}::text <> ''`;
        case "unset": return `(${col} IS NULL OR ${col}::text = '')`;
        case "gt": return `${L} > ${A(args, Number(v) || 0)}`; case "lt": return `${L} < ${A(args, Number(v) || 0)}`;
        case "gte": return `${L} >= ${A(args, Number(v) || 0)}`; case "lte": return `${L} <= ${A(args, Number(v) || 0)}`;
        case "contains": return `${col}::text ILIKE ${A(args, `%${v}%`)}`;
        case "in": return `${col}::text = ANY(${A(args, (Array.isArray(v) ? v : String(v).split(",")).map((x) => String(x).trim()))})`;
        case "ne": return `COALESCE(${col}::text,'') <> ${A(args, String(v))}`;
        default: return `${col}::text = ${A(args, String(v))}`;
      }
    }
    case "consent": { const col = c.channel === "sms" ? "p.sms_consent" : "p.email_consent"; return c.state === "not_subscribed" ? `${col} <> 'subscribed'` : `${col} = 'subscribed'`; }
    case "list": return `${c.in === false ? "NOT " : ""}EXISTS (SELECT 1 FROM mk_list_members m WHERE m.profile_id=p.id AND m.list_id=${A(args, Number(c.list_id) || 0)})`;
    case "segment": return `${c.in === false ? "NOT " : ""}EXISTS (SELECT 1 FROM mk_segment_members m WHERE m.profile_id=p.id AND m.segment_id=${A(args, Number(c.segment_id) || 0)})`;
    case "size": { const vals = (c.values || []).map(String); const x = `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(p.props->'last_sizes','[]'::jsonb)) s WHERE s = ANY(${A(args, vals)}))`; return c.op === "none_of" ? `NOT ${x}` : x; }
    case "buzzin": {
      const neg = c.in === false ? "NOT " : "";
      if (c.what === "open_ticket") return `${neg}EXISTS (SELECT 1 FROM hd_tickets t WHERE lower(t.customer_email)=p.email AND t.status <> 'closed' AND NOT t.spam)`;
      if (c.what === "recent_return") return `${neg}EXISTS (SELECT 1 FROM hd_returns r WHERE lower(r.email)=p.email AND r.created_at > now() - (${A(args, Number(c.days) || 30)} || ' days')::interval)`;
      if (c.what === "open_claim") return `${neg}EXISTS (SELECT 1 FROM hd_claims cl WHERE lower(cl.email)=p.email AND cl.status NOT IN ('closed','denied','resolved','completed','approved'))`;
      return "TRUE";
    }
    default: return "TRUE";
  }
}

/** Does this one profile match? */
async function matches(def, profileId, ctx = {}) {
  const args = [Number(profileId)];
  const where = compile(def, args, ctx);
  try { const r = await db(`SELECT (${where}) AS ok FROM mk_profiles p WHERE p.id=$1`, args); return !!(r.rows[0] && r.rows[0].ok); }
  catch (e) { console.error("condition check:", e.message); return false; }
}
async function count(def, store) {
  const args = []; const where = compile(def, args, {});
  const s = store ? ` AND p.store=${A(args, store)}` : "";
  const r = await db(`SELECT count(*)::int n, count(*) FILTER (WHERE p.email_consent='subscribed')::int email_ok, count(*) FILTER (WHERE p.sms_consent='subscribed')::int sms_ok FROM mk_profiles p WHERE (${where})${s}`, args);
  return r.rows[0];
}
async function sample(def, store, limit = 25) {
  const args = []; const where = compile(def, args, {});
  const s = store ? ` AND p.store=${A(args, store)}` : "";
  args.push(limit);
  return (await db(`SELECT p.id, p.email, p.phone, p.first_name, p.last_name, p.tier, p.orders_count, p.email_consent, p.sms_consent FROM mk_profiles p WHERE (${where})${s} ORDER BY p.last_engaged_at DESC NULLS LAST LIMIT $${args.length}`, args)).rows;
}

/* ---------------- segments ---------------- */
async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS mk_segments (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, description TEXT, definition JSONB NOT NULL,
    member_count INT, email_ok INT, sms_ok INT, refreshed_at TIMESTAMPTZ, source TEXT, ext_id TEXT, starter TEXT, archived BOOLEAN NOT NULL DEFAULT false,
    updated_by TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS mk_segments_starter ON mk_segments (store, starter) WHERE starter IS NOT NULL`);
  await db(`CREATE TABLE IF NOT EXISTS mk_segment_members (segment_id BIGINT NOT NULL, profile_id BIGINT NOT NULL, added_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (segment_id, profile_id))`);
  await db(`CREATE INDEX IF NOT EXISTS mk_segment_members_profile ON mk_segment_members (profile_id)`);
}
const STARTERS = {
  engaged_30: { name: "Engaged in the last 30 days", definition: { match: "any", conditions: [{ type: "event", event: "clicked_email", window: { kind: "last_days", days: 30 } }, { type: "event", event: "placed_order", window: { kind: "last_days", days: 30 } }, { type: "event", event: "active_on_site", window: { kind: "last_days", days: 30 } }, { type: "field", field: "last_engaged_at", op: "within_days", value: 30 }] } },
  engaged_90: { name: "Engaged in the last 90 days", definition: { match: "any", conditions: [{ type: "field", field: "last_engaged_at", op: "within_days", value: 90 }, { type: "event", event: "placed_order", window: { kind: "last_days", days: 90 } }] } },
  vip: { name: "VIP", definition: { match: "any", conditions: [{ type: "field", field: "orders_count", op: "gte", value: 3 }, { type: "field", field: "total_spent", op: "gte", value: 300 }] } },
  first_time: { name: "First-time buyers", definition: { match: "all", conditions: [{ type: "field", field: "orders_count", op: "eq", value: 1 }] } },
  never_bought: { name: "Signed up, never bought", definition: { match: "all", conditions: [{ type: "field", field: "orders_count", op: "eq", value: 0 }, { type: "consent", channel: "email", state: "subscribed" }] } },
  lapsed: { name: "Lapsed (no order in 180 days)", definition: { match: "all", conditions: [{ type: "field", field: "orders_count", op: "gte", value: 1 }, { type: "field", field: "last_order_at", op: "older_than_days", value: 180 }] } },
  size_up: { name: "Size-up due", definition: { match: "all", conditions: [{ type: "size", op: "any_of", values: ["NEWBORN", "0-3M", "3-6M", "6-9M", "6-12M"] }, { type: "field", field: "last_order_at", op: "older_than_days", value: 60 }, { type: "field", field: "last_order_at", op: "within_days", value: 120 }] } },
  open_problem: { name: "Has an open problem (hold from promos)", definition: { match: "any", conditions: [{ type: "buzzin", what: "open_ticket", in: true }, { type: "buzzin", what: "open_claim", in: true }, { type: "buzzin", what: "recent_return", in: true, days: 14 }] } },
};
async function ensureStarters(store) {
  for (const [k, s] of Object.entries(STARTERS)) await db(`INSERT INTO mk_segments (store, name, definition, starter, source) VALUES ($1,$2,$3,$4,'buzzin') ON CONFLICT (store, starter) WHERE starter IS NOT NULL DO NOTHING`, [store, s.name, JSON.stringify(s.definition), k]);
}
async function list(store) { return (await db(`SELECT id, store, name, description, definition, member_count, email_ok, sms_ok, refreshed_at, source, starter FROM mk_segments WHERE NOT archived ${store ? "AND store=$1" : ""} ORDER BY starter IS NULL, name`, store ? [store] : [])).rows; }
async function get(id) { return (await db(`SELECT * FROM mk_segments WHERE id=$1`, [Number(id)])).rows[0] || null; }
async function save({ id, store, name, description, definition }, who) {
  if (id) return (await db(`UPDATE mk_segments SET name=COALESCE($2,name), description=$3, definition=COALESCE($4,definition), updated_by=$5, updated_at=now() WHERE id=$1 RETURNING *`, [Number(id), name || null, description || null, definition ? JSON.stringify(definition) : null, who || null])).rows[0];
  return (await db(`INSERT INTO mk_segments (store, name, description, definition, source, updated_by) VALUES ($1,$2,$3,$4,'buzzin',$5) RETURNING *`, [store, name || "New segment", description || null, JSON.stringify(definition || { match: "all", conditions: [] }), who || null])).rows[0];
}

/** Recompute who's in a segment; people who newly enter get an "entered_segment" event (which can start flows). */
async function refresh(id) {
  const s = await get(id); if (!s) return null;
  const args = [s.id, s.store]; const where = compile(s.definition, args, {});
  const added = (await db(`INSERT INTO mk_segment_members (segment_id, profile_id) SELECT $1, p.id FROM mk_profiles p WHERE p.store=$2 AND (${where}) ON CONFLICT DO NOTHING RETURNING profile_id`, args)).rows;
  const args2 = [s.id, s.store]; const where2 = compile(s.definition, args2, {});
  await db(`DELETE FROM mk_segment_members m WHERE m.segment_id=$1 AND NOT EXISTS (SELECT 1 FROM mk_profiles p WHERE p.id=m.profile_id AND p.store=$2 AND (${where2}))`, args2);
  const c = (await db(`SELECT count(*)::int n, count(*) FILTER (WHERE p.email_consent='subscribed')::int e, count(*) FILTER (WHERE p.sms_consent='subscribed')::int s FROM mk_segment_members m JOIN mk_profiles p ON p.id=m.profile_id WHERE m.segment_id=$1`, [s.id])).rows[0];
  await db(`UPDATE mk_segments SET member_count=$2, email_ok=$3, sms_ok=$4, refreshed_at=now() WHERE id=$1`, [s.id, c.n, c.e, c.s]);
  // Only announce entries after the first fill, so creating a segment doesn't flood flows.
  if (s.refreshed_at && added.length && added.length < 5000) for (const r of added) await MK().track(s.store, "entered_segment", { profileId: r.profile_id, props: { segment_id: String(s.id), segment: s.name }, source: "segment" });
  return { ...c, added: added.length };
}
async function isMember(segmentId, profileId) { return !!(await db(`SELECT 1 FROM mk_segment_members WHERE segment_id=$1 AND profile_id=$2`, [Number(segmentId), Number(profileId)])).rows[0]; }
let refreshing = false;
async function refreshAll() {
  if (refreshing) return; refreshing = true;
  try { for (const s of (await db(`SELECT id FROM mk_segments WHERE NOT archived ORDER BY refreshed_at NULLS FIRST`)).rows) { try { await refresh(s.id); } catch (e) { console.error(`segment ${s.id}:`, e.message); } } }
  finally { refreshing = false; }
}

/* ---------------- Klaviyo segment snapshots → definitions are rebuilt by hand; snapshots stay as lists ---------------- */

function routes(app, { guard, admin, actorOf, fail, store }) {
  app.get("/api/mk/segments", async (req, res) => { if (!guard(req, res)) return; try { res.json({ segments: await list(store(req.query.store)), events: EVENTS }); } catch (e) { fail(res, e); } });
  app.get("/api/mk/segments/:id", async (req, res) => { if (!guard(req, res)) return; try { const s = await get(req.params.id); if (!s) return res.status(404).json({ error: "not found" }); res.json({ ...s, sample: (await db(`SELECT p.id, p.email, p.first_name, p.last_name, p.tier, p.orders_count, p.email_consent, p.sms_consent FROM mk_segment_members m JOIN mk_profiles p ON p.id=m.profile_id WHERE m.segment_id=$1 ORDER BY m.added_at DESC LIMIT 25`, [s.id])).rows }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/segments", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; if (!store(b.store)) return res.status(400).json({ error: "Pick a store first" }); const s = await save({ ...b, store: b.store }, actorOf(req)); refresh(s.id).catch(() => {}); res.json(s); } catch (e) { fail(res, e); } });
  app.put("/api/mk/segments/:id", async (req, res) => { if (!guard(req, res)) return; try { const s = await save({ ...(req.body || {}), id: req.params.id }, actorOf(req)); res.json({ ...s, ...(await refresh(s.id)) }); } catch (e) { fail(res, e); } });
  app.delete("/api/mk/segments/:id", async (req, res) => { if (!guard(req, res)) return; try { await db(`UPDATE mk_segments SET archived=true WHERE id=$1`, [Number(req.params.id)]); res.json({ ok: true }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/segments/preview", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; res.json({ ...(await count(b.definition, store(b.store))), sample: await sample(b.definition, store(b.store), 12) }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/segments/from-words", async (req, res) => {
    if (!guard(req, res)) return;
    try { const b = req.body || {}; const k = require("./emily").claimsKit(); if (!k.anthropic) return res.status(400).json({ error: "The AI isn't configured." });
      const lists = await MK().lists(store(b.store));
      const sys = `Turn a plain-English audience description into a JSON segment definition for a baby-clothing store's marketing tool. Use ONLY this schema:
{ "match": "all"|"any", "conditions": [ ...conditions or { "group": definition } ] }
Conditions:
 { "type":"event", "event": one of ${Object.keys(EVENTS).join("|")}, "op":"at_least"|"zero"|"at_most"|"exactly", "value":N, "window":{ "kind":"ever"|"last_days", "days":N }, "where":[{ "prop":"value"|"size"|"title", "op":"gt"|"lt"|"eq"|"contains", "value":X }] }
 { "type":"field", "field": "orders_count"|"total_spent"|"tier"(vip|engaged|cooling|lapsed|new)|"city"|"region"|"country"|"first_order_at"|"last_order_at"|"last_engaged_at"|"props.baby_stage"|"props.baby_date", "op":"eq"|"ne"|"gt"|"lt"|"gte"|"lte"|"contains"|"older_than_days"|"within_days"|"set"|"unset", "value": X }
 { "type":"consent", "channel":"email"|"sms", "state":"subscribed"|"not_subscribed" }
 { "type":"list", "list_id": N, "in": true|false }  — lists: ${JSON.stringify(lists.map((l) => ({ id: l.id, name: l.name })))}
 { "type":"size", "op":"any_of"|"none_of", "values":["NEWBORN","0-3M","3-6M","6-9M","6-12M","9-12M","12-18M","18-24M","2T","3T","4T","5T"] }
 { "type":"buzzin", "what":"open_ticket"|"recent_return"|"open_claim", "in": true|false, "days": N }
Output only JSON: { "name": "...", "definition": {...}, "explanation": "one plain sentence" }`;
      const r = await k.anthropic.messages.create({ model: k.model, max_tokens: 900, system: sys, messages: [{ role: "user", content: String(b.words || "").slice(0, 600) }] });
      const t = (r.content || []).map((c) => c.text || "").join(""); const m = t.match(/\{[\s\S]*\}/); const out = JSON.parse(m ? m[0] : t);
      res.json({ ...out, ...(await count(out.definition, store(b.store))) }); } catch (e) { fail(res, e); }
  });
}

async function init() {
  await migrate();
  for (const s of ["lb", "lbo"]) await ensureStarters(s);
  setTimeout(() => refreshAll().catch(() => {}), 5 * 60 * 1000);
  setInterval(() => refreshAll().catch(() => {}), 20 * 60 * 1000);
}

module.exports = { init, migrate, routes, compile, matches, count, sample, list, get, save, refresh, refreshAll, isMember, EVENTS, STARTERS };
