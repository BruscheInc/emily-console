/* =============================================================================================
 *  Buzzin Marketing · flows (Phase 4)
 *
 *  A flow is a map of steps each person walks through on their own schedule. Unlike Klaviyo, any
 *  step can point into an existing path, so shared emails are written once.
 *
 *  graph = { start: "n1", nodes: { n1: { type, config, next }, n2: { type:"split", config, yes, no }, n3: { type:"ab", config:{ variants:[{ weight, next }] } } } }
 *  Step types: send_email · send_sms · delay · wait_for · split · ab · update_profile · list · coupon · alert · ticket · webhook · end
 *  Triggers:   list · event · segment · date · manual
 *  Status:     draft (never runs) · test (only people on the internal test list) · live
 *  Each message also has its own status: draft (skipped) · test · live.
 *  Every send goes through mk-send.js, which holds everything until a sender is connected and turned on.
 * ============================================================================================= */
const crypto = require("crypto");
const core = require("./core");
const { db } = core;
const MK = () => require("./mk-core");
const SEG = () => require("./mk-segments");
const E = () => require("./mk-email");
const SEND = () => require("./mk-send");

const TYPES = ["send_email", "send_sms", "delay", "wait_for", "split", "ab", "update_profile", "list", "coupon", "alert", "ticket", "webhook", "end"];
const nid = () => "n" + crypto.randomBytes(4).toString("hex");

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS mk_flows (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
    trigger JSONB NOT NULL DEFAULT '{}', entry_filter JSONB, exit_filter JSONB, reentry JSONB NOT NULL DEFAULT '{"mode":"once"}', graph JSONB NOT NULL DEFAULT '{"start":null,"nodes":{}}',
    version INT NOT NULL DEFAULT 1, source TEXT, ext_id TEXT, notes TEXT, archived BOOLEAN NOT NULL DEFAULT false, updated_by TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS mk_flows_ext ON mk_flows (store, source, ext_id) WHERE ext_id IS NOT NULL`);
  await db(`CREATE TABLE IF NOT EXISTS mk_flow_versions (flow_id BIGINT NOT NULL, version INT NOT NULL, graph JSONB NOT NULL, by_user TEXT, created_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (flow_id, version))`);
  await db(`CREATE TABLE IF NOT EXISTS mk_flow_runs (id BIGSERIAL PRIMARY KEY, flow_id BIGINT NOT NULL, version INT NOT NULL, store TEXT NOT NULL, profile_id BIGINT NOT NULL, node_id TEXT,
    status TEXT NOT NULL DEFAULT 'active', due_at TIMESTAMPTZ NOT NULL DEFAULT now(), ctx JSONB NOT NULL DEFAULT '{}', test BOOLEAN NOT NULL DEFAULT false,
    entered_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now(), ended_at TIMESTAMPTZ, end_reason TEXT)`);
  await db(`CREATE INDEX IF NOT EXISTS mk_flow_runs_due ON mk_flow_runs (status, due_at)`);
  await db(`CREATE INDEX IF NOT EXISTS mk_flow_runs_flow ON mk_flow_runs (flow_id, profile_id, entered_at DESC)`);
  await db(`CREATE TABLE IF NOT EXISTS mk_flow_log (id BIGSERIAL PRIMARY KEY, run_id BIGINT, flow_id BIGINT, profile_id BIGINT, node_id TEXT, action TEXT, detail TEXT, at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE INDEX IF NOT EXISTS mk_flow_log_flow ON mk_flow_log (flow_id, node_id, action)`);
  await db(`CREATE INDEX IF NOT EXISTS mk_flow_log_run ON mk_flow_log (run_id)`);
  await db(`UPDATE mk_flow_runs SET status='active' WHERE status='working' AND updated_at < now() - interval '10 minutes'`);
}

/* ---------------- graph helpers ---------------- */
function edges(n) {
  if (!n) return [];
  if (n.type === "split" || n.type === "wait_for") return [n.yes, n.no];
  if (n.type === "ab") return ((n.config && n.config.variants) || []).map((v) => v.next);
  return [n.next];
}
/** Problems with a graph, in plain words. A flow with problems can't go live. */
function validate(graph) {
  const errs = [];
  const nodes = (graph && graph.nodes) || {};
  if (!graph || !graph.start || !nodes[graph.start]) { errs.push("The flow has no first step."); return errs; }
  for (const [id, n] of Object.entries(nodes)) {
    if (!TYPES.includes(n.type)) errs.push(`Step ${id} has an unknown type.`);
    for (const t of edges(n)) if (t && !nodes[t]) errs.push(`A step points to a missing step (${t}).`);
    if (n.type === "send_email" && !(n.config && n.config.template_id)) errs.push(`An email step has no email chosen.`);
    if (n.type === "send_sms" && !(n.config && String(n.config.body || "").trim())) errs.push(`A text step has no message.`);
    if (n.type === "split" && !(n.config && n.config.condition && (n.config.condition.conditions || []).length)) errs.push(`A yes/no split has no condition.`);
    if (n.type === "ab" && ((n.config && n.config.variants) || []).length < 2) errs.push(`An A/B split needs two paths.`);
  }
  // No loops: every path must end.
  const state = {};
  const visit = (id, depth) => { if (!id || depth > 500) return; if (state[id] === 1) { errs.push("The flow loops back on itself; paths must always move forward."); return; } if (state[id] === 2) return; state[id] = 1; for (const t of edges(nodes[id])) visit(t, depth + 1); state[id] = 2; };
  visit(graph.start, 0);
  return [...new Set(errs)];
}
const reachable = (graph) => { const seen = new Set(); const go = (id) => { if (!id || seen.has(id) || !graph.nodes[id]) return; seen.add(id); edges(graph.nodes[id]).forEach(go); }; go(graph.start); return seen; };

/* ---------------- flows ---------------- */
async function list(store) {
  return (await db(`SELECT f.id, f.store, f.name, f.status, f.trigger, f.source, f.updated_at, f.version,
      (SELECT count(*)::int FROM mk_flow_runs r WHERE r.flow_id=f.id AND r.status IN ('active','working','paused')) in_flow,
      (SELECT count(*)::int FROM mk_flow_runs r WHERE r.flow_id=f.id AND r.entered_at > now() - interval '30 days') entered_30d,
      (SELECT count(*)::int FROM mk_sends s WHERE s.flow_id=f.id AND s.created_at > now() - interval '30 days') sends_30d,
      (SELECT count(*)::int FROM jsonb_object_keys(COALESCE(f.graph->'nodes','{}'::jsonb))) steps
    FROM mk_flows f WHERE NOT f.archived ${store ? "AND f.store=$1" : ""} ORDER BY f.status='live' DESC, f.updated_at DESC`, store ? [store] : [])).rows;
}
async function get(id) { return (await db(`SELECT * FROM mk_flows WHERE id=$1`, [Number(id)])).rows[0] || null; }
async function create(store, name, who, starter) {
  const g = starter && STARTERS[starter] ? STARTERS[starter](store) : { trigger: { type: "list" }, graph: { start: "n1", nodes: { n1: { type: "end", config: {} } } } };
  const f = (await db(`INSERT INTO mk_flows (store, name, trigger, graph, source, updated_by, entry_filter, exit_filter, reentry) VALUES ($1,$2,$3,$4,'buzzin',$5,$6,$7,$8) RETURNING *`,
    [store, name || (starter && STARTER_NAMES[starter]) || "New flow", JSON.stringify(g.trigger), JSON.stringify(g.graph), who || null, g.entry_filter ? JSON.stringify(g.entry_filter) : null, g.exit_filter ? JSON.stringify(g.exit_filter) : null, JSON.stringify(g.reentry || { mode: "once" })])).rows[0];
  await db(`INSERT INTO mk_flow_versions (flow_id, version, graph, by_user) VALUES ($1,1,$2,$3)`, [f.id, JSON.stringify(f.graph), who || null]);
  return f;
}
async function save(id, b, who, isAdmin) {
  const cur = await get(id); if (!cur) throw Object.assign(new Error("not found"), { status: 404 });
  const graph = b.graph || cur.graph;
  let status = b.status || cur.status; if (!["draft", "test", "live", "paused"].includes(status)) status = cur.status;
  if (status === "live" && cur.status !== "live") {
    if (!isAdmin) throw Object.assign(new Error("Only an admin can make a flow live."), { status: 403 });
    const errs = validate(graph); if (errs.length) throw Object.assign(new Error(`Fix these first: ${errs.join(" ")}`), { status: 400 });
  }
  const changed = JSON.stringify(graph) !== JSON.stringify(cur.graph);
  const version = changed ? cur.version + 1 : cur.version;
  const f = (await db(`UPDATE mk_flows SET name=$2, status=$3, trigger=$4, entry_filter=$5, exit_filter=$6, reentry=$7, graph=$8, version=$9, notes=$10, updated_by=$11, updated_at=now() WHERE id=$1 RETURNING *`,
    [cur.id, b.name || cur.name, status, JSON.stringify(b.trigger || cur.trigger), b.entry_filter !== undefined ? (b.entry_filter ? JSON.stringify(b.entry_filter) : null) : cur.entry_filter ? JSON.stringify(cur.entry_filter) : null,
     b.exit_filter !== undefined ? (b.exit_filter ? JSON.stringify(b.exit_filter) : null) : cur.exit_filter ? JSON.stringify(cur.exit_filter) : null, JSON.stringify(b.reentry || cur.reentry), JSON.stringify(graph), version, b.notes != null ? b.notes : cur.notes, who || null])).rows[0];
  if (changed) await db(`INSERT INTO mk_flow_versions (flow_id, version, graph, by_user) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [f.id, version, JSON.stringify(graph), who || null]);
  FLOW_CACHE.t = 0;
  return f;
}
const GRAPHS = new Map();
async function graphFor(flowId, version) {
  const k = `${flowId}:${version}`; if (GRAPHS.has(k)) return GRAPHS.get(k);
  const r = (await db(`SELECT graph FROM mk_flow_versions WHERE flow_id=$1 AND version=$2`, [flowId, version])).rows[0];
  const g = r ? r.graph : (await get(flowId) || {}).graph; GRAPHS.set(k, g); return g;
}

/* ---------------- enrolling ---------------- */
async function onTestList(profile) {
  const s = await MK().settings(); const tl = (s.test_list || []).map((x) => String(x).toLowerCase());
  return (profile.email && tl.includes(profile.email.toLowerCase())) || (profile.phone && tl.includes(String(profile.phone).toLowerCase()));
}
async function enroll(flow, profileId, ctx = {}) {
  if (!["live", "test"].includes(flow.status)) return null;
  const p = (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [profileId])).rows[0]; if (!p || p.store !== flow.store) return null;
  const test = flow.status === "test" || !!ctx.preview;
  if (test && !(await onTestList(p))) return null;
  if ((await db(`SELECT 1 FROM mk_flow_runs WHERE flow_id=$1 AND profile_id=$2 AND status IN ('active','working','paused')`, [flow.id, p.id])).rows[0]) return null;
  const re = flow.reentry || { mode: "once" };
  if (re.mode === "once" && (await db(`SELECT 1 FROM mk_flow_runs WHERE flow_id=$1 AND profile_id=$2 AND NOT test`, [flow.id, p.id])).rows[0] && !test) return null;
  if (re.mode === "days" && (await db(`SELECT 1 FROM mk_flow_runs WHERE flow_id=$1 AND profile_id=$2 AND entered_at > now() - ($3 || ' days')::interval`, [flow.id, p.id, Number(re.days) || 30])).rows[0]) return null;
  const now = new Date();
  if (flow.entry_filter && !(await SEG().matches(flow.entry_filter, p.id, { since: now }))) return null;
  const run = (await db(`INSERT INTO mk_flow_runs (flow_id, version, store, profile_id, node_id, due_at, ctx, test) VALUES ($1,$2,$3,$4,$5,now(),$6,$7) RETURNING *`,
    [flow.id, flow.version, flow.store, p.id, flow.graph.start, JSON.stringify({ ...ctx, since: now.toISOString() }), test])).rows[0];
  await log(run, flow.graph.start, "entered", ctx.reason || null);
  return run;
}
const FLOW_CACHE = { t: 0, rows: [] };
async function activeFlows() { if (Date.now() - FLOW_CACHE.t < 30000) return FLOW_CACHE.rows; FLOW_CACHE.rows = (await db(`SELECT * FROM mk_flows WHERE status IN ('live','test') AND NOT archived`)).rows; FLOW_CACHE.t = Date.now(); return FLOW_CACHE.rows; }

function eventMatches(trigger, type, props) {
  if (!trigger) return false;
  if (trigger.type === "list") return type === "joined_list" && String(props.list_id) === String(trigger.list_id);
  if (trigger.type === "segment") return type === "entered_segment" && String(props.segment_id) === String(trigger.segment_id);
  if (trigger.type !== "event" || trigger.event !== type) return false;
  for (const f of trigger.where || []) {
    const v = f.prop === "value" ? props.value : props[f.prop];
    if (f.op === "gt" && !(Number(v) > Number(f.value))) return false;
    if (f.op === "lt" && !(Number(v) < Number(f.value))) return false;
    if (f.op === "eq" && String(v) !== String(f.value)) return false;
    if (f.op === "contains" && !String(v || "").toLowerCase().includes(String(f.value).toLowerCase())) return false;
  }
  return true;
}
/** Called for every recorded event: start matching flows, and wake anyone waiting for it. */
function onEvent(store, type, profileId, props = {}) {
  if (!profileId) return;
  setImmediate(async () => {
    try {
      for (const f of await activeFlows()) {
        if (f.store !== store) continue;
        if (eventMatches(f.trigger, type, { ...props })) await enroll(f, profileId, { trigger: type, trigger_props: props, preview: !!props.preview, reason: `trigger: ${type}` });
      }
      await db(`UPDATE mk_flow_runs SET due_at=now() WHERE profile_id=$1 AND status='active' AND ctx->'waiting'->>'event'=$2`, [profileId, type]);
    } catch (e) { console.error("flow trigger:", e.message); }
  });
}

/* ---------------- running steps ---------------- */
async function log(run, node, action, detail) { await db(`INSERT INTO mk_flow_log (run_id, flow_id, profile_id, node_id, action, detail) VALUES ($1,$2,$3,$4,$5,$6)`, [run.id, run.flow_id, run.profile_id, node, action, detail ? String(detail).slice(0, 500) : null]); }

function tzParts(tz, d = new Date()) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(d);
  const o = Object.fromEntries(f.map((x) => [x.type, x.value])); return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, min: +o.minute, wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday) };
}
/** The moment `base + amount`, then moved to the next allowed time of day / weekday in the person's time zone. */
function delayUntil(cfg, tz, base = new Date()) {
  const unit = { minutes: 60e3, hours: 3600e3, days: 864e5, weeks: 7 * 864e5 }[cfg.unit] || 864e5;
  let t = new Date(base.getTime() + (Number(cfg.amount) || 0) * unit);
  const zone = tz || "America/Chicago";
  if (cfg.until_time) {
    const [hh, mm] = String(cfg.until_time).split(":").map(Number);
    for (let i = 0; i < 9; i++) {
      const p = tzParts(zone, t);
      const delta = ((hh - p.h) * 60 + (mm - p.min)) * 60e3;
      // "1 day, until 10 AM" = 10 AM on the next calendar day (like Klaviyo), never earlier than now.
      const floor = (cfg.unit === "days" || cfg.unit === "weeks" || !cfg.unit) && i === 0 ? base : t;
      let cand = new Date(t.getTime() + delta); cand.setSeconds(0, 0);
      if (cand < floor) cand = new Date(cand.getTime() + 864e5);
      const wd = tzParts(zone, cand).wd;
      if (!cfg.weekdays || !cfg.weekdays.length || cfg.weekdays.includes(wd)) { t = cand; break; }
      t = new Date(cand.getTime() + 60e3);
    }
  } else if (cfg.weekdays && cfg.weekdays.length) {
    for (let i = 0; i < 8 && !cfg.weekdays.includes(tzParts(zone, t).wd); i++) t = new Date(t.getTime() + 864e5);
  }
  return t;
}

async function smartSkip(profileId, channel, hours) {
  if (!hours) return false;
  return !!(await db(`SELECT 1 FROM mk_sends WHERE profile_id=$1 AND channel=$2 AND status='sent' AND created_at > now() - ($3 || ' hours')::interval LIMIT 1`, [profileId, channel, Number(hours)])).rows[0];
}

async function execNode(run, flow, node, p) {
  const c = node.config || {};
  const ctx = run.ctx || {};
  const S = await MK().settings();
  const msgAllowed = async (st) => st === "live" || (st === "test" && (run.test || (await onTestList(p))));
  switch (node.type) {
    case "end": return { next: null, note: "end" };
    case "delay": { const until = delayUntil(c, p.timezone); return { next: node.next, wait: until, note: `wait until ${until.toISOString()}` }; }
    case "wait_for": {
      const w = ctx.waiting && ctx.waiting.node === run.node_id ? ctx.waiting : null;
      if (!w) { const until = delayUntil({ amount: c.within_amount || 1, unit: c.within_unit || "days" }, p.timezone); return { stay: true, wait: until, ctx: { waiting: { node: run.node_id, event: c.event, since: new Date().toISOString(), until: until.toISOString() } }, note: `waiting for ${c.event}` }; }
      const happened = await SEG().matches({ match: "all", conditions: [{ type: "event", event: c.event, op: "at_least", value: 1, window: { kind: "since_start" }, where: c.where || [] }] }, p.id, { since: w.since });
      if (!happened && new Date(w.until) > new Date()) return { stay: true, wait: new Date(w.until), note: "still waiting" };
      return { next: happened ? node.yes : node.no, ctx: { waiting: null }, note: happened ? "it happened" : "timed out" };
    }
    case "split": { const ok = await SEG().matches(c.condition, p.id, { since: ctx.since }); return { next: ok ? node.yes : node.no, note: ok ? "yes" : "no" }; }
    case "ab": { const vs = c.variants || []; const tot = vs.reduce((a, v) => a + (Number(v.weight) || 0), 0) || 1; let r = Math.random() * tot, i = 0; for (; i < vs.length - 1; i++) { r -= Number(vs[i].weight) || 0; if (r < 0) break; } return { next: vs[i] && vs[i].next, note: `path ${String.fromCharCode(65 + i)}` }; }
    case "update_profile": {
      const ops = (c.ops || []).filter((o) => /^[a-z0-9_]{1,40}$/i.test(o.key || ""));
      if (ops.length && !run.test) await db(`UPDATE mk_profiles SET props = props || $2::jsonb, updated_at=now() WHERE id=$1`, [p.id, JSON.stringify(Object.fromEntries(ops.map((o) => [o.key, o.value])))]);
      return { next: node.next, note: ops.map((o) => `${o.key} = ${o.value}`).join(", ") };
    }
    case "list": { if (!run.test && c.list_id) { if (c.action === "remove") await db(`DELETE FROM mk_list_members WHERE list_id=$1 AND profile_id=$2`, [Number(c.list_id), p.id]); else { await MK().addToList(Number(c.list_id), p.id, `flow:${flow.id}`); await MK().track(flow.store, "joined_list", { profileId: p.id, props: { list_id: String(c.list_id), flow_id: flow.id } }); } } return { next: node.next, note: `${c.action || "add"} list ${c.list_id}` }; }
    case "coupon": {
      const sendingOn = !!(S.sending[flow.store] && (S.sending[flow.store].email || S.sending[flow.store].sms));
      const code = `${String(c.prefix || "THANKS").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const exp = new Date(Date.now() + (Number(c.expires_days) || 14) * 864e5);
      let real = false;
      if (flow.status === "live" && sendingOn && !run.test) {
        const st = require("./returns").shopFor(flow.store);
        const cg = c.kind === "amount" ? { value: { discountAmount: { amount: String(Number(c.amount) || 10), appliesOnEachItem: false } }, items: { all: true } } : { value: { percentage: (Number(c.percent) || 10) / 100 }, items: { all: true } };
        const r = await require("./returns").gql(st, `mutation($b:DiscountCodeBasicInput!){discountCodeBasicCreate(basicCodeDiscount:$b){codeDiscountNode{id} userErrors{field message}}}`, { b: { title: `${flow.name} · ${code}`, code, startsAt: new Date().toISOString(), endsAt: exp.toISOString(), customerSelection: { all: true }, customerGets: cg, appliesOncePerCustomer: true, usageLimit: 1 } });
        const ue = r.discountCodeBasicCreate.userErrors; if (ue && ue.length) throw new Error(ue.map((x) => x.message).join("; "));
        real = true;
      }
      await db(`INSERT INTO mk_coupons (store, code, profile_id, flow_id, percent, amount, expires_at, real) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [flow.store, code, p.id, flow.id, c.kind === "amount" ? null : Number(c.percent) || 10, c.kind === "amount" ? Number(c.amount) || 10 : null, exp, real]);
      return { next: node.next, ctx: { coupon: code }, note: `${real ? "created" : "sample (not live)"} code ${code}` };
    }
    case "send_email": {
      if (!(await msgAllowed(c.status || "draft"))) return { next: node.next, note: `skipped: message is ${c.status || "draft"}` };
      if (c.smart_sending !== false && await smartSkip(p.id, "email", S.smart_sending_hours.email)) return { next: node.next, note: "skipped: smart sending" };
      const tpl = await E().getTemplate(c.template_id); if (!tpl) return { next: node.next, note: "skipped: email template missing" };
      const r = await E().render(flow.store, { ...tpl, subject: c.subject || tpl.subject, preview: c.preview || tpl.preview }, p, { coupon: ctx.coupon || (p.props || {}).coupon, items: (ctx.trigger_props && ctx.trigger_props.items) || [], checkout_url: ctx.trigger_props && ctx.trigger_props.checkout_url });
      const row = await SEND().send({ store: flow.store, channel: "email", profile: p, msg: r, idem: `flow:${flow.id}:${run.id}:${run.node_id}`, flowId: flow.id, flowStep: run.node_id, messageId: `tpl:${tpl.id}`, test: run.test });
      return { next: node.next, note: `email ${row.status}${row.reason ? ": " + row.reason : ""}` };
    }
    case "send_sms": {
      if (!(await msgAllowed(c.status || "draft"))) return { next: node.next, note: `skipped: message is ${c.status || "draft"}` };
      if (c.smart_sending && await smartSkip(p.id, "sms", S.smart_sending_hours.sms)) return { next: node.next, note: "skipped: smart sending" };
      const SMS = require("./mk-sms");
      const body = await SMS.compose(flow.store, c, p, { coupon: ctx.coupon || (p.props || {}).coupon, checkout_url: ctx.trigger_props && ctx.trigger_props.checkout_url });
      const row = await SEND().send({ store: flow.store, channel: "sms", profile: p, msg: { body, media: c.media || null }, idem: `flow:${flow.id}:${run.id}:${run.node_id}`, flowId: flow.id, flowStep: run.node_id, messageId: `sms:${flow.id}:${run.node_id}`, test: run.test });
      if (row.status === "deferred") return { stay: true, wait: new Date(Date.now() + 30 * 60e3), note: "quiet hours — trying again in 30 minutes" };
      return { next: node.next, note: `text ${row.status}${row.reason ? ": " + row.reason : ""}` };
    }
    case "alert": { const text = E().personalize(c.text || `${flow.name}: ${p.email || p.phone}`, { ...p, ...(p.props || {}) }, { html: false }); if (!run.test) await core.slackPost(`🐝 ${text}`).catch(() => {}); return { next: node.next, note: `alert: ${text.slice(0, 120)}` }; }
    case "ticket": {
      if (run.test || !p.email) return { next: node.next, note: run.test ? "test: no ticket" : "no email for a ticket" };
      const def = require("./returns").STORE_DEFS[flow.store];
      const id = (await db(`SELECT nextval('hd_local_ticket_seq')::bigint AS id`)).rows[0].id, at = new Date().toISOString();
      const subject = E().personalize(c.subject || `Follow up: ${flow.name}`, { ...p, ...(p.props || {}) }, { html: false });
      await db(`INSERT INTO hd_tickets (id,source,subject,brand,mailbox,channel,status,customer_email,customer_name,tags,messages_count,created_at,updated_at,last_message_at,last_inbound_at) VALUES ($1,'marketing',$2,$3,$4,'email','open',$5,$6,$7,1,$8,$8,$8,$8)`,
        [id, subject, core.brandForAddress(def.support) || def.name, def.support, p.email, [p.first_name, p.last_name].filter(Boolean).join(" ") || null, ["marketing", "flow"], at]);
      await db(`INSERT INTO hd_messages (ticket_id,source,external_id,from_agent,internal,channel,sender_name,sender_email,to_emails,subject,body_text,at) VALUES ($1,'marketing',$2,true,true,'note','Buzzin flow',$3,$4,$5,$6,$7)`,
        [id, `flow:${run.id}:${run.node_id}`, def.support, [def.support], subject, E().personalize(c.note || `Created by the "${flow.name}" flow.`, { ...p, ...(p.props || {}) }, { html: false }), at]);
      return { next: node.next, note: `ticket ${id}` };
    }
    case "webhook": {
      if (run.test) return { next: node.next, note: "test: webhook not called" };
      if (!/^https:\/\//.test(c.url || "")) return { next: node.next, note: "webhook skipped: needs an https address" };
      try { await fetch(c.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ flow: flow.name, flow_id: flow.id, store: flow.store, profile: { id: p.id, email: p.email, phone: p.phone, first_name: p.first_name, last_name: p.last_name, props: p.props } }), signal: AbortSignal.timeout(10000) }); return { next: node.next, note: "webhook called" }; }
      catch (e) { return { next: node.next, note: `webhook failed: ${e.message}` }; }
    }
    default: return { next: node.next, note: "unknown step skipped" };
  }
}

async function step(run) {
  const flow = await get(run.flow_id);
  if (!flow || flow.archived) { await finish(run, "flow deleted"); return; }
  if (flow.status === "paused" || flow.status === "draft") { await db(`UPDATE mk_flow_runs SET status='paused', updated_at=now() WHERE id=$1`, [run.id]); return; }
  const graph = await graphFor(flow.id, run.version);
  const p = (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [run.profile_id])).rows[0];
  if (!p) { await finish(run, "profile gone"); return; }
  for (let hops = 0; hops < 25; hops++) {
    const node = graph.nodes[run.node_id];
    if (!node) { await finish(run, "path ended"); return; }
    if (flow.exit_filter && (flow.exit_filter.conditions || []).length && await SEG().matches(flow.exit_filter, p.id, { since: run.ctx.since })) { await log(run, run.node_id, "exited", "met the exit rule"); await finish(run, "exit rule"); return; }
    let out;
    try { out = await execNode(run, flow, node, p); }
    catch (e) { await log(run, run.node_id, "error", e.message); out = { next: node.next || node.no || null, note: `error: ${e.message}` }; }
    if (out.ctx) run.ctx = { ...run.ctx, ...out.ctx };
    if (out.stay) { await log(run, run.node_id, "waiting", out.note); await db(`UPDATE mk_flow_runs SET status='active', due_at=$2, ctx=$3, updated_at=now() WHERE id=$1`, [run.id, out.wait, JSON.stringify(run.ctx)]); return; }
    await log(run, run.node_id, node.type === "delay" ? "waiting" : "done", out.note);
    if (!out.next) { await finish(run, out.note === "end" ? "finished" : "path ended"); return; }
    run.node_id = out.next;
    if (out.wait && out.wait > new Date()) { await db(`UPDATE mk_flow_runs SET status='active', node_id=$2, due_at=$3, ctx=$4, updated_at=now() WHERE id=$1`, [run.id, run.node_id, out.wait, JSON.stringify(run.ctx)]); return; }
  }
  await db(`UPDATE mk_flow_runs SET status='active', node_id=$2, due_at=now(), ctx=$3, updated_at=now() WHERE id=$1`, [run.id, run.node_id, JSON.stringify(run.ctx)]);
}
async function finish(run, reason) { await db(`UPDATE mk_flow_runs SET status='done', ended_at=now(), end_reason=$2, updated_at=now() WHERE id=$1`, [run.id, reason]); }

let ticking = false;
async function tick() {
  if (ticking) return; ticking = true;
  try {
    for (let round = 0; round < 10; round++) {
      const runs = (await db(`UPDATE mk_flow_runs SET status='working', updated_at=now() WHERE id IN (SELECT id FROM mk_flow_runs WHERE status='active' AND due_at <= now() ORDER BY due_at LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING *`)).rows;
      if (!runs.length) break;
      for (const r of runs) { try { await step(r); } catch (e) { console.error(`flow run ${r.id}:`, e.message); await db(`UPDATE mk_flow_runs SET status='active', due_at=now() + interval '10 minutes' WHERE id=$1`, [r.id]); } }
    }
    // Resume paused runs whose flow is running again.
    await db(`UPDATE mk_flow_runs r SET status='active', due_at=GREATEST(r.due_at, now()) FROM mk_flows f WHERE r.flow_id=f.id AND r.status='paused' AND f.status IN ('live','test')`);
  } finally { ticking = false; }
}

/* ---------------- date triggers (birthdays, baby's age) — once a day ---------------- */
async function dateTriggers() {
  for (const f of await activeFlows()) {
    const t = f.trigger || {}; if (t.type !== "date" || !t.field) continue;
    const key = String(t.field).replace(/^props\./, "").replace(/[^a-z0-9_]/gi, "");
    const col = ["created_at", "first_order_at", "last_order_at"].includes(key) ? `p.${key}` : `NULLIF(p.props->>'${key}','')::date`;
    const yearly = t.yearly ? `to_char((${col})::date + ($2 || ' days')::interval, 'MM-DD') = to_char(now() AT TIME ZONE 'America/Chicago', 'MM-DD')` : `((${col})::date + ($2 || ' days')::interval)::date = (now() AT TIME ZONE 'America/Chicago')::date`;
    let rows = [];
    try { rows = (await db(`SELECT p.id FROM mk_profiles p WHERE p.store=$1 AND ${yearly} LIMIT 20000`, [f.store, Number(t.offset_days) || 0])).rows; } catch (e) { console.error(`date trigger ${f.id}:`, e.message); continue; }
    for (const r of rows) await enroll(f, r.id, { trigger: "date", reason: `date: ${t.field}${t.offset_days ? ` + ${t.offset_days} days` : ""}` });
  }
}

/* ---------------- abandoned checkouts from Shopify (every 15 minutes) ---------------- */
const ABANDONED_Q = `query A($q: String) { abandonedCheckouts(first: 50, query: $q, sortKey: CREATED_AT, reverse: true) { nodes { id createdAt updatedAt completedAt abandonedCheckoutUrl customer { id email } totalPriceSet { shopMoney { amount } } lineItems(first: 20) { nodes { title variantTitle quantity sku product { handle } image { url } originalUnitPriceSet { shopMoney { amount } } } } } } }`;
async function pollCheckouts() {
  for (const store of ["lb", "lbo"]) {
    let st; try { st = require("./returns").shopFor(store); } catch (_) { continue; }
    const since = (await core.syncGet(`mk_checkouts_${store}`).catch(() => null));
    const from = since && since.cursor ? since.cursor : new Date(Date.now() - 3600e3).toISOString();
    try {
      const d = await require("./returns").gql(st, ABANDONED_Q, { q: `updated_at:>'${from}'` });
      let newest = from;
      for (const c of (d.abandonedCheckouts && d.abandonedCheckouts.nodes) || []) {
        if (c.updatedAt > newest) newest = c.updatedAt;
        if (c.completedAt || !c.customer || !c.customer.email) continue;
        const prof = await MK().upsertProfile(store, { email: c.customer.email, shopify_id: c.customer.id }, "shopify");
        if (!prof) continue;
        const items = ((c.lineItems && c.lineItems.nodes) || []).map((li) => ({ title: li.title, variant: li.variantTitle, size: MK().sizeOf(li.variantTitle), qty: li.quantity, image: li.image && li.image.url, price: Number(li.originalUnitPriceSet && li.originalUnitPriceSet.shopMoney.amount) || null, handle: li.product && li.product.handle, url: li.product ? `${require("./returns").STORE_DEFS[store].shopUrl}/products/${li.product.handle}` : null }));
        await MK().track(store, "started_checkout", { profileId: prof.id, at: c.createdAt, value: Number(c.totalPriceSet && c.totalPriceSet.shopMoney.amount) || 0, props: { checkout_url: c.abandonedCheckoutUrl, items }, source: "shopify", extId: c.id });
      }
      await core.syncSet(`mk_checkouts_${store}`, newest, {});
    } catch (e) { if (!/access|scope/i.test(e.message)) console.error(`abandoned checkouts (${store}):`, e.message); }
  }
}

/* ---------------- Klaviyo flows → Buzzin flows, merging repeated paths ---------------- */
const METRIC_EVENT = { "Placed Order": "placed_order", "Clicked Email": "clicked_email", "Opened Email": "opened_email", "Received Email": "received_email", "Checkout Started": "started_checkout", "Started Checkout": "started_checkout",
  "Added to Cart": "added_to_cart", "Viewed Product": "viewed_product", "Active on Site": "active_on_site", "Clicked Text Message": "clicked_sms", "Clicked SMS": "clicked_sms", "Received Text Message": "received_sms",
  "Fulfilled Order": "fulfilled_order", "Delivered Shipment": "delivered_order", "Ordered Product": "placed_order", "Subscribed to List": "joined_list", "Form submitted by profile": "submitted_form", "Submitted Form": "submitted_form" };
async function metricNames() { const r = (await db(`SELECT id, name FROM hd_klaviyo WHERE kind='metric'`).catch(() => ({ rows: [] }))).rows; return Object.fromEntries(r.map((x) => [x.id, x.name])); }
function convertFilter(pf, metrics, lists) {
  if (!pf || !pf.condition_groups) return null;
  const groups = pf.condition_groups.map((g) => ({ match: "any", conditions: (g.conditions || []).map((c) => {
    if (c.type === "profile-metric") {
      const ev = METRIC_EVENT[metrics[c.metric_id]] || null; if (!ev) return null;
      const mf = c.measurement_filter || {}; const n = Number(mf.value || 0);
      const op = mf.operator === "greater-than" ? (n === 0 ? "at_least" : "at_least") : mf.operator === "equals" ? (n === 0 ? "zero" : "exactly") : mf.operator === "less-than" ? "at_most" : "at_least";
      const tf = c.timeframe_filter || {};
      const window = tf.operator === "flow-start" ? { kind: "since_start" } : tf.operator === "in-the-last" ? { kind: "last_days", days: tf.quantity || 30 } : { kind: "ever" };
      return { type: "event", event: ev, op, value: mf.operator === "greater-than" ? n + 1 : mf.operator === "less-than" ? Math.max(0, n - 1) : n, window };
    }
    if (c.type === "profile-marketing-consent") return { type: "consent", channel: (c.consent && c.consent.channel) === "sms" ? "sms" : "email", state: (c.consent && c.consent.consent_status && c.consent.consent_status.subscription) === "subscribed" ? "subscribed" : "not_subscribed" };
    if (c.type === "profile-property") { const key = String(c.property || "").replace(/^properties\['?|'?\]$/g, ""); const f = c.filter || {}; return { type: "field", field: `props.${key}`, op: f.operator === "equals" ? "eq" : f.operator === "not-equals" ? "ne" : f.operator === "contains" ? "contains" : f.operator === "is-set" ? "set" : "eq", value: f.value }; }
    if (c.type === "profile-group-membership" || c.type === "profile-list-membership") { const lid = lists[`list:${c.group_ids ? c.group_ids[0] : c.list_id}`]; return lid ? { type: "list", list_id: lid, in: !c.is_not_member } : null; }
    return null;
  }).filter(Boolean) })).filter((g) => g.conditions.length);
  if (!groups.length) return null;
  return groups.length === 1 ? groups[0] : { match: "all", conditions: groups.map((g) => ({ group: g })) };
}
async function importKlaviyoFlows(store = "lb", who = "import") {
  const metrics = await metricNames();
  const lists = Object.fromEntries((await db(`SELECT id, ext_id FROM mk_lists WHERE store=$1 AND source='klaviyo'`, [store])).rows.map((l) => [l.ext_id, l.id]));
  const tpls = Object.fromEntries((await db(`SELECT id, ext_id, blocks, subject FROM mk_templates WHERE store=$1 AND source='klaviyo'`, [store])).rows.map((t) => [t.ext_id, t]));
  const rows = (await db(`SELECT id, name, data FROM hd_klaviyo WHERE kind='flow'`).catch(() => ({ rows: [] }))).rows;
  const out = [];
  for (const r of rows) {
    const a = (r.data && r.data.attributes) || {}; const def = a.definition; if (!def || !def.actions) continue;
    const nodes = {};
    for (const act of def.actions) {
      const d = act.data || {}, L = act.links || {}, id = "k" + act.id;
      const nx = (x) => (x ? "k" + x : null);
      const st = d.status === "live" ? "live" : d.status === "manual" ? "test" : "draft";
      if (act.type === "send-email") { const m = d.message || {}; const t = tpls[m.template_id]; nodes[id] = { type: "send_email", config: { template_id: t ? t.id : null, subject: m.subject_line || "", preview: m.preview_text || "", name: m.name || "", status: st, smart_sending: !!m.smart_sending_enabled }, next: nx(L.next) }; }
      else if (act.type === "send-sms") { const m = d.message || {}; nodes[id] = { type: "send_sms", config: { body: m.body || "", name: m.name || "", status: st, add_opt_out: !!m.add_opt_out_language, smart_sending: !!m.smart_sending_enabled, quiet_hours: true }, next: nx(L.next) }; }
      else if (act.type === "time-delay") nodes[id] = { type: "delay", config: { amount: d.value || 0, unit: d.unit || "days", until_time: d.delay_until_time ? String(d.delay_until_time).slice(0, 5) : null, weekdays: d.delay_until_weekdays ? d.delay_until_weekdays.map((w) => ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(String(w).toLowerCase())).filter((x) => x >= 0) : null }, next: nx(L.next) };
      else if (act.type === "conditional-split" || act.type === "trigger-split") nodes[id] = { type: "split", config: { condition: convertFilter(d.profile_filter || d.trigger_filter, metrics, lists) || { match: "all", conditions: [] } }, yes: nx(L.next_if_true), no: nx(L.next_if_false) };
      else if (act.type === "update-profile") nodes[id] = { type: "update_profile", config: { ops: (d.profile_operations || []).map((o) => ({ key: String(o.property_key || "").replace(/^properties\['?|'?\]$/g, ""), value: o.property_value })) }, next: nx(L.next) };
      else if (act.type === "ab-test") nodes[id] = { type: "ab", config: { variants: ((d.variants || [])).map((v) => ({ weight: v.allocation || 50, next: nx(v.next || L.next) })) }, next: null };
      else if (act.type === "internal-alert") nodes[id] = { type: "alert", config: { text: (d.message && d.message.body) || "Klaviyo alert" }, next: nx(L.next) };
      else if (act.type === "webhook") nodes[id] = { type: "webhook", config: { url: d.url || "" }, next: nx(L.next) };
      else if (act.type === "list-update") nodes[id] = { type: "list", config: { action: d.list_action === "remove" ? "remove" : "add", list_id: lists[`list:${d.list_id}`] || null }, next: nx(L.next) };
      else nodes[id] = { type: "end", config: { note: `Klaviyo step "${act.type}" isn't supported` }, next: null };
    }
    const graph = mergeDuplicates({ start: "k" + def.entry_action_id, nodes }, tpls);
    const trig = (def.triggers || [])[0] || {};
    const trigger = trig.type === "list" ? { type: "list", list_id: lists[`list:${trig.id}`] || null } : trig.type === "segment" ? { type: "segment", ext: trig.id } : trig.type === "metric" ? { type: "event", event: METRIC_EVENT[metrics[trig.id]] || "placed_order" } : { type: "manual" };
    const ex = (await db(`SELECT id FROM mk_flows WHERE store=$1 AND source='klaviyo' AND ext_id=$2`, [store, r.id])).rows[0];
    if (ex) { await db(`UPDATE mk_flows SET graph=$2, trigger=$3, name=$4, updated_at=now() WHERE id=$1 AND status='draft'`, [ex.id, JSON.stringify(graph), JSON.stringify(trigger), r.name]); out.push({ id: ex.id, name: r.name, steps: Object.keys(graph.nodes).length, klaviyo_steps: def.actions.length }); continue; }
    const f = (await db(`INSERT INTO mk_flows (store, name, status, trigger, entry_filter, graph, source, ext_id, notes, updated_by) VALUES ($1,$2,'draft',$3,$4,$5,'klaviyo',$6,$7,$8) RETURNING id`,
      [store, r.name, JSON.stringify(trigger), def.profile_filter ? JSON.stringify(convertFilter(def.profile_filter, metrics, lists)) : null, JSON.stringify(graph), r.id, `Imported from Klaviyo (${a.status}). ${def.actions.length} Klaviyo steps → ${Object.keys(graph.nodes).length} here.`, who])).rows[0];
    await db(`INSERT INTO mk_flow_versions (flow_id, version, graph, by_user) VALUES ($1,1,$2,$3) ON CONFLICT DO NOTHING`, [f.id, JSON.stringify(graph), who]);
    out.push({ id: f.id, name: r.name, steps: Object.keys(graph.nodes).length, klaviyo_steps: def.actions.length });
  }
  FLOW_CACHE.t = 0;
  return out;
}
/** Paths that do exactly the same thing collapse into one (emails compare by subject and HTML, not Klaviyo's copy ids). */
function mergeDuplicates(graph, tpls) {
  const byId = {}; for (const t of Object.values(tpls || {})) byId[t.id] = t;
  const htmlHash = (tid) => { const t = byId[tid]; return t ? crypto.createHash("sha1").update(JSON.stringify((t.blocks || []).map((b) => [b.type, b.props]))).digest("hex").slice(0, 12) : String(tid); };
  const memo = {};
  const sig = (id, depth = 0) => {
    if (!id || !graph.nodes[id] || depth > 400) return "∅";
    if (memo[id]) return memo[id];
    const n = graph.nodes[id]; const c = { ...(n.config || {}) };
    if (n.type === "send_email") { c.template_id = htmlHash(c.template_id); delete c.name; }
    if (n.type === "send_sms") delete c.name;
    const kids = edges(n).map((e) => sig(e, depth + 1));
    return (memo[id] = crypto.createHash("sha1").update(JSON.stringify([n.type, c, kids])).digest("hex"));
  };
  const keep = {}; const alias = {};
  for (const id of Object.keys(graph.nodes)) { const s = sig(id); if (keep[s]) alias[id] = keep[s]; else keep[s] = id; }
  const map = (x) => (x && alias[x]) || x;
  const nodes = {};
  for (const [id, n] of Object.entries(graph.nodes)) {
    if (alias[id]) continue;
    const m = { ...n };
    if ("next" in m) m.next = map(m.next); if ("yes" in m) m.yes = map(m.yes); if ("no" in m) m.no = map(m.no);
    if (m.type === "ab") m.config = { ...m.config, variants: (m.config.variants || []).map((v) => ({ ...v, next: map(v.next) })) };
    nodes[id] = m;
  }
  const g = { start: map(graph.start), nodes };
  const live = reachable(g); for (const id of Object.keys(g.nodes)) if (!live.has(id)) delete g.nodes[id];
  return g;
}

/* ---------------- starters ---------------- */
const STARTER_NAMES = { welcome: "Welcome series", abandoned_checkout: "Abandoned checkout", browse: "Browse abandonment", post_purchase: "Post-purchase thank you", size_up: "Size-up reminder", winback: "Win-back" };
const STARTERS = {
  welcome: (store) => ({ trigger: { type: "list" }, graph: { start: "a", nodes: {
    a: { type: "send_email", config: { template_id: null, status: "draft", smart_sending: false }, next: "b" }, b: { type: "delay", config: { amount: 1, unit: "days", until_time: "10:00" }, next: "c" },
    c: { type: "split", config: { condition: { match: "all", conditions: [{ type: "event", event: "placed_order", op: "at_least", value: 1, window: { kind: "since_start" } }] } }, yes: "t", no: "d" },
    d: { type: "send_email", config: { template_id: null, status: "draft" }, next: "e" }, e: { type: "delay", config: { amount: 2, unit: "days", until_time: "10:00" }, next: "f" },
    f: { type: "split", config: { condition: { match: "all", conditions: [{ type: "event", event: "placed_order", op: "at_least", value: 1, window: { kind: "since_start" } }] } }, yes: "t", no: "g" },
    g: { type: "send_email", config: { template_id: null, status: "draft" }, next: null },
    t: { type: "update_profile", config: { ops: [{ key: "SignUp", value: "Earned" }] }, next: null } } } }),
  abandoned_checkout: () => ({ trigger: { type: "event", event: "started_checkout" }, exit_filter: { match: "all", conditions: [{ type: "event", event: "placed_order", op: "at_least", value: 1, window: { kind: "since_start" } }] }, reentry: { mode: "days", days: 7 },
    graph: { start: "a", nodes: { a: { type: "delay", config: { amount: 2, unit: "hours" }, next: "b" }, b: { type: "send_email", config: { template_id: null, status: "draft" }, next: "c" },
      c: { type: "delay", config: { amount: 1, unit: "days" }, next: "d" }, d: { type: "send_sms", config: { body: "{{ store_name }}: you left something cozy in your cart. Finish here: {{ checkout_url }}", status: "draft", add_opt_out: true }, next: "e" },
      e: { type: "delay", config: { amount: 2, unit: "days", until_time: "10:00" }, next: "f" }, f: { type: "send_email", config: { template_id: null, status: "draft" }, next: null } } } }),
  browse: () => ({ trigger: { type: "event", event: "viewed_product" }, reentry: { mode: "days", days: 14 }, exit_filter: { match: "any", conditions: [{ type: "event", event: "added_to_cart", op: "at_least", value: 1, window: { kind: "since_start" } }, { type: "event", event: "placed_order", op: "at_least", value: 1, window: { kind: "since_start" } }] },
    graph: { start: "a", nodes: { a: { type: "delay", config: { amount: 4, unit: "hours" }, next: "b" }, b: { type: "send_email", config: { template_id: null, status: "draft" }, next: null } } } }),
  post_purchase: () => ({ trigger: { type: "event", event: "placed_order" }, reentry: { mode: "always" },
    graph: { start: "a", nodes: { a: { type: "split", config: { condition: { match: "all", conditions: [{ type: "field", field: "orders_count", op: "lte", value: 1 }] } }, yes: "b", no: "c" },
      b: { type: "delay", config: { amount: 1, unit: "days", until_time: "10:00" }, next: "d" }, c: { type: "delay", config: { amount: 3, unit: "days", until_time: "10:00" }, next: "e" },
      d: { type: "send_email", config: { template_id: null, status: "draft" }, next: "f" }, e: { type: "send_email", config: { template_id: null, status: "draft" }, next: "f" },
      f: { type: "delay", config: { amount: 14, unit: "days", until_time: "10:00" }, next: "g" }, g: { type: "send_email", config: { template_id: null, status: "draft" }, next: null } } } }),
  size_up: () => ({ trigger: { type: "segment" }, reentry: { mode: "days", days: 60 },
    graph: { start: "a", nodes: { a: { type: "delay", config: { amount: 0, unit: "days", until_time: "10:00" }, next: "b" }, b: { type: "send_email", config: { template_id: null, status: "draft" }, next: null } } } }),
  winback: () => ({ trigger: { type: "date", field: "last_order_at", offset_days: 60 }, reentry: { mode: "days", days: 90 }, exit_filter: { match: "all", conditions: [{ type: "event", event: "placed_order", op: "at_least", value: 1, window: { kind: "since_start" } }] },
    graph: { start: "a", nodes: { a: { type: "send_email", config: { template_id: null, status: "draft" }, next: "b" }, b: { type: "delay", config: { amount: 7, unit: "days", until_time: "10:00" }, next: "c" },
      c: { type: "coupon", config: { percent: 15, expires_days: 10, prefix: "COMEBACK" }, next: "d" }, d: { type: "send_email", config: { template_id: null, status: "draft" }, next: null } } } }),
};

/* ---------------- simulate: which path one person would take, without doing anything ---------------- */
async function simulate(flowId, profileId) {
  const f = await get(flowId); const p = (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [Number(profileId)])).rows[0];
  if (!f || !p) return { error: "not found" };
  const out = []; const since = new Date(); let id = f.graph.start, t = new Date();
  if (f.entry_filter && !(await SEG().matches(f.entry_filter, p.id, { since }))) return { path: [], note: "This person wouldn't enter: they don't meet the entry rule." };
  for (let i = 0; i < 60 && id; i++) {
    const n = f.graph.nodes[id]; if (!n) break;
    const c = n.config || {};
    let note = "", next = n.next;
    if (n.type === "delay") { t = delayUntil(c, p.timezone, t); note = `waits until ${t.toLocaleString("en-US", { timeZone: p.timezone || "America/Chicago" })}`; }
    else if (n.type === "split") { const ok = await SEG().matches(c.condition, p.id, { since }); next = ok ? n.yes : n.no; note = ok ? "yes (as of today)" : "no (as of today)"; }
    else if (n.type === "wait_for") { next = n.no; note = "assumes it doesn't happen"; }
    else if (n.type === "ab") { next = (c.variants || [])[0] && c.variants[0].next; note = "path A shown"; }
    else if (n.type === "send_email") { const tpl = c.template_id ? await E().getTemplate(c.template_id) : null; note = `${tpl ? `"${c.subject || tpl.subject}"` : "no email chosen"} · message ${c.status || "draft"}${p.email_consent !== "subscribed" ? ` · would be skipped (email ${p.email_consent})` : ""}`; }
    else if (n.type === "send_sms") note = `${p.sms_consent !== "subscribed" ? `would be skipped (texts ${p.sms_consent})` : "text"} · message ${c.status || "draft"}`;
    else if (n.type === "end") next = null;
    out.push({ node: id, type: n.type, note, at: t.toISOString() });
    id = next;
  }
  return { path: out };
}

async function stats(flowId) {
  const steps = (await db(`SELECT node_id, action, count(*)::int n FROM mk_flow_log WHERE flow_id=$1 GROUP BY node_id, action`, [Number(flowId)])).rows;
  const sends = (await db(`SELECT flow_step, status, count(*)::int n FROM mk_sends WHERE flow_id=$1 GROUP BY flow_step, status`, [Number(flowId)])).rows;
  const runs = (await db(`SELECT status, count(*)::int n FROM mk_flow_runs WHERE flow_id=$1 GROUP BY status`, [Number(flowId)])).rows;
  const here = (await db(`SELECT node_id, count(*)::int n FROM mk_flow_runs WHERE flow_id=$1 AND status IN ('active','working','paused') GROUP BY node_id`, [Number(flowId)])).rows;
  return { steps, sends, runs, here };
}

function routes(app, { guard, admin, actorOf, fail, store }) {
  const isAdmin = (req) => { const s = core.sessionOf((req.headers.authorization || "").replace(/^Bearer /i, "") || req.query.key || ""); return !!(s && s.role === "admin"); };
  app.get("/api/mk/flows", async (req, res) => { if (!guard(req, res)) return; try { const st = store(req.query.store); res.json({ flows: await list(st), starters: STARTER_NAMES, events: SEG().EVENTS, lists: await MK().lists(st), segments: await SEG().list(st) }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/flows", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; if (!store(b.store)) return res.status(400).json({ error: "Pick a store first" }); res.json(await create(b.store, b.name, actorOf(req), b.starter)); } catch (e) { fail(res, e); } });
  app.get("/api/mk/flows/:id", async (req, res) => {
    if (!guard(req, res)) return;
    try { const f = await get(req.params.id); if (!f) return res.status(404).json({ error: "not found" });
      res.json({ ...f, problems: validate(f.graph), stats: await stats(f.id), templates: await E().listTemplates(f.store), lists: await MK().lists(f.store), segments: await SEG().list(f.store), events: SEG().EVENTS,
        versions: (await db(`SELECT version, by_user, created_at FROM mk_flow_versions WHERE flow_id=$1 ORDER BY version DESC LIMIT 20`, [f.id])).rows }); } catch (e) { fail(res, e); }
  });
  app.put("/api/mk/flows/:id", async (req, res) => { if (!guard(req, res)) return; try { const f = await save(req.params.id, req.body || {}, actorOf(req), isAdmin(req)); res.json({ ...f, problems: validate(f.graph) }); } catch (e) { fail(res, e); } });
  app.delete("/api/mk/flows/:id", async (req, res) => { if (!admin(req, res)) return; try { await db(`UPDATE mk_flows SET archived=true, status='draft' WHERE id=$1`, [Number(req.params.id)]); FLOW_CACHE.t = 0; res.json({ ok: true }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/flows/:id/simulate", async (req, res) => { if (!guard(req, res)) return; try { let pid = (req.body || {}).profile_id; if (!pid && (req.body || {}).email) { const f = await get(req.params.id); const p = await MK().findProfile(f.store, { email: MK().normEmail(req.body.email) }); pid = p && p.id; } if (!pid) return res.status(404).json({ error: "No profile with that email in this store." }); res.json(await simulate(req.params.id, pid)); } catch (e) { fail(res, e); } });
  app.get("/api/mk/flows/:id/runs", async (req, res) => { if (!guard(req, res)) return; try { res.json({ runs: (await db(`SELECT r.id, r.status, r.node_id, r.due_at, r.entered_at, r.end_reason, r.test, p.email, p.first_name FROM mk_flow_runs r JOIN mk_profiles p ON p.id=r.profile_id WHERE r.flow_id=$1 ORDER BY r.id DESC LIMIT 100`, [Number(req.params.id)])).rows }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/flows/:id/enroll", async (req, res) => { if (!guard(req, res)) return; try { const f = await get(req.params.id); const p = await MK().findProfile(f.store, { email: MK().normEmail((req.body || {}).email) }); if (!p) return res.status(404).json({ error: "No profile with that email in this store." }); const r = await enroll(f, p.id, { trigger: "manual", reason: `added by ${actorOf(req)}` }); res.json(r ? { ok: true, run: r.id } : { ok: false, error: f.status === "draft" ? "The flow is a draft. Set it to Test (only the internal test list) or Live first." : "They weren't added: already in the flow, not on the test list, or don't meet the entry rule." }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/flows/import-klaviyo", async (req, res) => { if (!admin(req, res)) return; try { res.json({ flows: await importKlaviyoFlows("lb", actorOf(req)) }); } catch (e) { fail(res, e); } });
}

async function init() {
  await migrate();
  setInterval(() => tick().catch((e) => console.error("flows:", e.message)), 30 * 1000);
  setInterval(() => pollCheckouts().catch(() => {}), 15 * 60 * 1000);
  const daily = async () => { const today = new Date().toISOString().slice(0, 10); const s = await core.syncGet("mk_date_triggers").catch(() => null); if (s && s.cursor === today) return; await dateTriggers(); await core.syncSet("mk_date_triggers", today, {}); };
  setInterval(() => { const h = new Date().getUTCHours(); if (h >= 14) daily().catch((e) => console.error("date triggers:", e.message)); }, 30 * 60 * 1000);
  if (!(await core.syncGet("mk_klaviyo_flows_v1").catch(() => null))) {
    setTimeout(async () => { try { const t = await core.syncGet("mk_klaviyo_templates_v1").catch(() => null); if (!t) return; const r = await importKlaviyoFlows("lb", "import"); if (r.length) { await core.syncSet("mk_klaviyo_flows_v1", new Date().toISOString(), { n: r.length }); console.log(`🔀 Marketing: ${r.length} Klaviyo flows imported as drafts · ${r.map((x) => `${x.name} ${x.klaviyo_steps}→${x.steps}`).join(" · ")}`); } } catch (e) { console.error("Klaviyo flows import:", e.message); } }, 120 * 1000);
  }
}

module.exports = { init, migrate, routes, onEvent, enroll, tick, validate, delayUntil, simulate, importKlaviyoFlows, mergeDuplicates, get, list, save, create, TYPES, STARTER_NAMES };
