/* Buzzin Marketing · campaign report (the Klaviyo-style board shown once a campaign has gone out).
   Overview (rates, revenue, engagement over time, deliverability, content), Recipient activity (who did what, CSV),
   Link activity, Conversions, Deliverability (health + inbox providers / domains / countries) and Watch live.
   Opens and clicks count real people only (machine opens and link scanners are left out).
   Revenue uses Buzzin's attribution rule: an order counts for the email if it comes within N days of a click on it. */
const core = require("./core");
const { db } = core;
const MK = () => require("./mk-core");
const E = () => require("./mk-email");

const NOT_TEST = `NOT COALESCE((s.meta->>'test')::boolean,false)`;
const UNSUB_DAYS = 5;

/** Orders credited to this campaign (click within the attribution window). */
async function orders(cid) {
  const S = await MK().settings();
  return (await db(`WITH k AS (SELECT DISTINCT s.profile_id FROM mk_sends s WHERE s.campaign_id=$1 AND s.profile_id IS NOT NULL AND ${NOT_TEST}),
      o AS (SELECT e.id, e.profile_id, e.at, COALESCE(e.value,0)::float value, e.props FROM mk_events e JOIN k ON k.profile_id=e.profile_id
            WHERE e.type='placed_order' AND NOT COALESCE((e.props->>'cancelled')::boolean,false)),
      cr AS (SELECT o.*, c.kp FROM o JOIN LATERAL (SELECT x.props kp FROM mk_events x WHERE x.profile_id=o.profile_id AND x.type IN ('clicked_email','clicked_sms') AND x.at <= o.at
             AND x.at > o.at - ((CASE WHEN x.type='clicked_email' THEN $2::int ELSE $3::int END) || ' days')::interval ORDER BY x.at DESC LIMIT 1) c ON true)
    SELECT cr.id, cr.profile_id, cr.at, cr.value, cr.props->>'name' order_name, p.email, p.first_name, p.last_name FROM cr LEFT JOIN mk_profiles p ON p.id=cr.profile_id
    WHERE cr.kp->>'campaign_id' = $4 ORDER BY cr.at DESC`, [cid, S.attribution.email_click_days, S.attribution.sms_click_days, String(cid)])).rows;
}

const PROVIDERS = [
  ["Gmail", /^(gmail|googlemail)\.com$/], ["Verizon Media Group", /^(yahoo|ymail|rocketmail|aol|aim|verizon|att|sbcglobal|bellsouth)\.(com|net)$|^yahoo\./],
  ["Hotmail / Outlook", /^(hotmail|outlook|live|msn|passport)\.|^windowslive\.com$/], ["Apple", /^(icloud|me|mac)\.com$/],
  ["Comcast", /^comcast\.net$/], ["Charter / Spectrum", /^(charter|spectrum|roadrunner|rr)\.(com|net)$/], ["Cox", /^cox\.net$/], ["Proton", /^proton(mail)?\.(com|me)$/],
];
const providerOf = (domain) => (PROVIDERS.find(([, re]) => re.test(domain)) || ["Other"])[0];

async function overview(cid) {
  const c = (await db(`SELECT * FROM mk_campaigns WHERE id=$1`, [cid])).rows[0]; if (!c) return null;
  const rcp = (await db(`SELECT count(*)::int attempted, count(*) FILTER (WHERE status IN ('skipped','held','error'))::int skipped, count(*) FILTER (WHERE status='queued')::int queued FROM mk_campaign_recipients WHERE campaign_id=$1`, [cid])).rows[0];
  const s = (await db(`SELECT count(*) FILTER (WHERE s.status='sent')::int sent, count(*) FILTER (WHERE s.status IN ('failed','rejected'))::int failed,
      min(s.sent_at) first_at, max(s.sent_at) last_at FROM mk_sends s WHERE s.campaign_id=$1 AND ${NOT_TEST}`, [cid])).rows[0];
  const ev = (await db(`SELECT e.type, count(DISTINCT s.id)::int uniq, count(*)::int total FROM mk_sends s JOIN mk_send_events e ON e.send_id=s.id AND NOT e.machine
      WHERE s.campaign_id=$1 AND ${NOT_TEST} GROUP BY 1`, [cid])).rows;
  const E2 = Object.fromEntries(ev.map((x) => [x.type, x]));
  const g = (t, k = "uniq") => (E2[t] ? E2[t][k] : 0);
  const unsub = (await db(`SELECT count(DISTINCT l.profile_id)::int n FROM mk_consent_log l JOIN mk_sends s ON s.profile_id=l.profile_id AND s.campaign_id=$1 AND s.status='sent'
      WHERE l.channel=$2 AND l.state IN ('unsubscribed','stopped') AND l.at > s.sent_at AND l.at < s.sent_at + ($3 || ' days')::interval`, [cid, c.channel === "sms" ? "sms" : "email", UNSUB_DAYS])).rows[0].n;
  const bounced = g("bounced");
  const sentAll = s.sent;
  const delivered = Math.max(0, sentAll - bounced);
  const ord = await orders(cid);
  const revenue = ord.reduce((a, o) => a + Number(o.value || 0), 0);
  const buyers = new Set(ord.map((o) => o.profile_id)).size;
  const t = await timeline(cid, s.first_at);
  const content = await contentOf(c);
  return {
    campaign: { id: c.id, name: c.name, channel: c.channel, store: c.store, status: c.status, started_at: c.started_at || s.first_at, sent_at: c.sent_at },
    recipients: { attempted: rcp.attempted, skipped: rcp.skipped, queued: rcp.queued, sent: sentAll, failed: s.failed, delivered, bounced },
    engagement: { opened: g("opened"), opens_total: g("opened", "total"), clicked: g("clicked"), clicks_total: g("clicked", "total"), unsubscribed: unsub, spam: g("complained"), converted: buyers, orders: ord.length, revenue: Math.round(revenue * 100) / 100 },
    rates: { open: pct(g("opened"), delivered), click: pct(g("clicked"), delivered), order: pct(buyers, delivered), bounce: pct(bounced, sentAll), unsub: pct(unsub, delivered), spam: pct(g("complained"), delivered), delivery: pct(delivered, sentAll),
      aov: ord.length ? Math.round(revenue / ord.length * 100) / 100 : 0, per_recipient: delivered ? Math.round(revenue / delivered * 100) / 100 : 0 },
    timeline: t, content, attribution_days: (await MK().settings()).attribution.email_click_days,
  };
}
const pct = (a, b) => (b ? Math.round((a / b) * 10000) / 100 : 0);

/** Engagement over time: hourly for the first 3 days, then every 6 hours (up to 30 days). */
async function timeline(cid, firstAt) {
  if (!firstAt) return { step_hours: 1, buckets: [] };
  const start = new Date(firstAt); start.setMinutes(0, 0, 0);
  const span = (Date.now() - start.getTime()) / 3600e3;
  const step = span > 72 ? 6 : 1;
  const rows = (await db(`WITH s AS (SELECT id, sent_at FROM mk_sends s WHERE s.campaign_id=$1 AND s.status='sent' AND ${NOT_TEST}),
      d AS (SELECT sent_at at FROM s),
      op AS (SELECT min(e.at) at FROM mk_send_events e JOIN s ON s.id=e.send_id WHERE e.type='opened' AND NOT e.machine GROUP BY e.send_id),
      cl AS (SELECT min(e.at) at FROM mk_send_events e JOIN s ON s.id=e.send_id WHERE e.type='clicked' AND NOT e.machine GROUP BY e.send_id)
    SELECT 'delivered' k, floor(extract(epoch FROM (at - $2::timestamptz)) / ($3 * 3600))::int b, count(*)::int n FROM d WHERE at IS NOT NULL GROUP BY 1,2
    UNION ALL SELECT 'opened', floor(extract(epoch FROM (at - $2::timestamptz)) / ($3 * 3600))::int, count(*)::int FROM op GROUP BY 1,2
    UNION ALL SELECT 'clicked', floor(extract(epoch FROM (at - $2::timestamptz)) / ($3 * 3600))::int, count(*)::int FROM cl GROUP BY 1,2`, [cid, start.toISOString(), step])).rows;
  const ord = await orders(cid);
  const n = Math.min(Math.max(24, Math.ceil(span / step) + 1), step === 1 ? 72 : 120);
  const buckets = Array.from({ length: n }, (_, i) => ({ at: new Date(start.getTime() + i * step * 3600e3).toISOString(), delivered: 0, opened: 0, clicked: 0, orders: 0 }));
  for (const r of rows) if (r.b >= 0 && r.b < n) buckets[r.b][r.k] += r.n;
  for (const o of ord) { const b = Math.floor((new Date(o.at) - start) / (step * 3600e3)); if (b >= 0 && b < n) buckets[b].orders++; }
  return { step_hours: step, buckets };
}

async function contentOf(c) {
  const ct = c.content || {}; const tid = ct.template_id || (((c.ab || {}).variants || [])[0] || {}).template_id;
  let subject = ct.subject || "", preview = ct.preview || "", from = "";
  if (c.channel === "email" && tid) { const t = await E().getTemplate(tid); if (t) { subject = subject || t.subject || ""; preview = preview || t.preview || ""; } }
  try { const b = await E().brand(c.store); if (b && b.sender) from = `${b.sender.from_name} ${b.sender.reply_to || `${b.sender.from_local}@${b.sender.domain}`}`; } catch (e) {}
  const a = c.audience || {}; const names = async (kind, ids) => {
    if (!ids || !ids.length) return [];
    const t = kind === "list" ? "mk_lists" : "mk_segments";
    const rows = (await db(`SELECT id, name, ${kind === "list" ? "(SELECT count(*)::int FROM mk_list_members m WHERE m.list_id=x.id)" : "member_count"} n FROM ${t} x WHERE id = ANY($1)`, [ids.map(Number)]).catch(() => ({ rows: [] }))).rows;
    return rows.map((r) => `${r.name}${r.n != null ? ` (${Number(r.n).toLocaleString("en-US")})` : ""}`);
  };
  const ids = (arr, kind) => (arr || []).filter((x) => x.kind === kind).map((x) => Number(x.id)).filter(Boolean);
  return { template_id: tid || null, subject, preview, body: ct.body || "", from, included: [...(await names("list", ids(a.include, "list"))), ...(await names("segment", ids(a.include, "segment")))], excluded: [...(await names("list", ids(a.exclude, "list"))), ...(await names("segment", ids(a.exclude, "segment")))] };
}

async function links(cid) {
  const rows = (await db(`SELECT e.url, s.profile_id FROM mk_send_events e JOIN mk_sends s ON s.id=e.send_id WHERE s.campaign_id=$1 AND e.type='clicked' AND NOT e.machine AND ${NOT_TEST}`, [cid])).rows;
  const by = new Map();
  for (const r of rows) {
    let u = String(r.url || ""); try { const x = new URL(u); [...x.searchParams.keys()].filter((k) => /^utm_|^_kx$|^bz_?/.test(k)).forEach((k) => x.searchParams.delete(k)); u = x.toString().replace(/\?$/, ""); } catch (e) {}
    const g = by.get(u) || { url: u, people: new Set(), total: 0 }; g.people.add(r.profile_id); g.total++; by.set(u, g);
  }
  const list = [...by.values()].map((g) => ({ url: g.url, unique: g.people.size, total: g.total })).sort((a, b) => b.unique - a.unique || b.total - a.total);
  const people = new Set(rows.map((r) => r.profile_id)).size;
  const S = await MK().settings(); const c = (await db(`SELECT name, channel FROM mk_campaigns WHERE id=$1`, [cid])).rows[0] || {};
  return { people, total: rows.length, links: list, utm: { source: "buzzin", medium: c.channel === "sms" ? "sms" : "email", campaign: c.name || "" } };
}

async function deliverability(cid) {
  const rows = (await db(`SELECT lower(split_part(s.to_addr,'@',2)) domain, COALESCE(p.country,'') country, count(*)::int sent,
      count(*) FILTER (WHERE EXISTS (SELECT 1 FROM mk_send_events e WHERE e.send_id=s.id AND e.type='bounced'))::int bounced
    FROM mk_sends s LEFT JOIN mk_profiles p ON p.id=s.profile_id WHERE s.campaign_id=$1 AND s.status='sent' AND ${NOT_TEST} GROUP BY 1,2`, [cid])).rows;
  const agg = (keyFn) => { const m = new Map(); for (const r of rows) { const k = keyFn(r) || "Unknown"; const g = m.get(k) || { name: k, delivered: 0, bounced: 0 }; g.delivered += r.sent - r.bounced; g.bounced += r.bounced; m.set(k, g); } return [...m.values()].sort((a, b) => (b.delivered + b.bounced) - (a.delivered + a.bounced)).slice(0, 12); };
  const kinds = (await db(`SELECT COALESCE(e.meta->>'kind','Unknown') kind, count(DISTINCT s.id)::int n FROM mk_send_events e JOIN mk_sends s ON s.id=e.send_id WHERE s.campaign_id=$1 AND e.type='bounced' GROUP BY 1 ORDER BY 2 DESC`, [cid])).rows;
  return { providers: agg((r) => providerOf(r.domain)), domains: agg((r) => r.domain), countries: agg((r) => r.country || "Unknown"), bounce_kinds: kinds };
}

/* who did what — one filter at a time, newest first */
const FILTERS = {
  delivered: `SELECT s.profile_id, s.to_addr, s.sent_at at, NULL::text extra FROM mk_sends s WHERE s.campaign_id=$1 AND s.status='sent' AND ${NOT_TEST} AND NOT EXISTS (SELECT 1 FROM mk_send_events e WHERE e.send_id=s.id AND e.type='bounced')`,
  opened: `SELECT s.profile_id, s.to_addr, min(e.at) at, count(*)::text || ' opens' extra FROM mk_sends s JOIN mk_send_events e ON e.send_id=s.id AND e.type='opened' AND NOT e.machine WHERE s.campaign_id=$1 AND ${NOT_TEST} GROUP BY 1,2`,
  clicked: `SELECT s.profile_id, s.to_addr, min(e.at) at, count(*)::text || ' clicks' extra FROM mk_sends s JOIN mk_send_events e ON e.send_id=s.id AND e.type='clicked' AND NOT e.machine WHERE s.campaign_id=$1 AND ${NOT_TEST} GROUP BY 1,2`,
  bounced: `SELECT s.profile_id, s.to_addr, min(e.at) at, max(COALESCE(e.meta->>'kind','') || CASE WHEN e.meta->>'sub' IS NOT NULL THEN ' · ' || (e.meta->>'sub') ELSE '' END) extra FROM mk_sends s JOIN mk_send_events e ON e.send_id=s.id AND e.type='bounced' WHERE s.campaign_id=$1 AND ${NOT_TEST} GROUP BY 1,2`,
  spam: `SELECT s.profile_id, s.to_addr, min(e.at) at, 'marked as spam' extra FROM mk_sends s JOIN mk_send_events e ON e.send_id=s.id AND e.type='complained' WHERE s.campaign_id=$1 AND ${NOT_TEST} GROUP BY 1,2`,
  unsubscribed: `SELECT DISTINCT ON (s.profile_id) s.profile_id, s.to_addr, l.at, COALESCE(l.source,'') extra FROM mk_consent_log l JOIN mk_sends s ON s.profile_id=l.profile_id AND s.campaign_id=$1 AND s.status='sent'
      WHERE l.channel IN ('email','sms') AND l.state IN ('unsubscribed','stopped') AND l.at > s.sent_at AND l.at < s.sent_at + interval '${UNSUB_DAYS} days' ORDER BY s.profile_id, l.at`,
  skipped: `SELECT r.profile_id, COALESCE(p.email, p.phone) to_addr, NULL::timestamptz at, COALESCE(r.note, r.status) extra FROM mk_campaign_recipients r LEFT JOIN mk_profiles p ON p.id=r.profile_id WHERE r.campaign_id=$1 AND r.status IN ('skipped','held','error')`,
};
async function recipients(cid, { filter = "delivered", q = "", offset = 0, limit = 50 } = {}) {
  if (filter === "converted") {
    let o = await orders(cid); if (q) o = o.filter((x) => `${x.email} ${x.first_name} ${x.last_name}`.toLowerCase().includes(q.toLowerCase()));
    return { total: o.length, rows: o.slice(offset, offset + limit).map((x) => ({ profile_id: x.profile_id, email: x.email, name: [x.first_name, x.last_name].filter(Boolean).join(" "), at: x.at, extra: `${x.order_name || "Order"} · $${Number(x.value).toFixed(2)}` })) };
  }
  const base = FILTERS[filter] || FILTERS.delivered;
  const args = [cid]; let w = "";
  if (q) { args.push(`%${q.toLowerCase()}%`); w = `WHERE lower(COALESCE(x.to_addr,'') || ' ' || COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) LIKE $2`; }
  const total = (await db(`SELECT count(*)::int n FROM (${base}) x LEFT JOIN mk_profiles p ON p.id=x.profile_id ${w}`, args)).rows[0].n;
  args.push(Math.min(Number(limit) || 50, 100000), Math.max(0, Number(offset) || 0));
  const rows = (await db(`SELECT x.*, p.first_name, p.last_name FROM (${base}) x LEFT JOIN mk_profiles p ON p.id=x.profile_id ${w} ORDER BY x.at DESC NULLS LAST LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
  return { total, rows: rows.map((r) => ({ profile_id: r.profile_id, email: r.to_addr, name: [r.first_name, r.last_name].filter(Boolean).join(" "), at: r.at, extra: r.extra })) };
}

/** Watch live: the newest activity and how much is still queued. */
async function live(cid) {
  const ev = (await db(`SELECT e.type, e.at, e.url, s.to_addr FROM mk_send_events e JOIN mk_sends s ON s.id=e.send_id WHERE s.campaign_id=$1 AND NOT e.machine AND e.type IN ('opened','clicked','bounced','complained') AND ${NOT_TEST}
      ORDER BY e.id DESC LIMIT 60`, [cid])).rows;
  const q = (await db(`SELECT count(*) FILTER (WHERE status='queued')::int queued, count(*)::int total FROM mk_campaign_recipients WHERE campaign_id=$1`, [cid])).rows[0];
  const last = (await db(`SELECT count(*) FILTER (WHERE sent_at > now() - interval '1 minute')::int per_min FROM mk_sends WHERE campaign_id=$1`, [cid])).rows[0];
  return { events: ev, queued: q.queued, total: q.total, per_minute: last.per_min };
}

const csvCell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function routes(app, { guard, fail }) {
  const id = (req) => Number(req.params.id);
  app.get("/api/mk/campaigns/:id/report", async (req, res) => { if (!guard(req, res)) return; try { const r = await overview(id(req)); if (!r) return res.status(404).json({ error: "not found" }); res.json(r); } catch (e) { fail(res, e); } });
  app.get("/api/mk/campaigns/:id/report/links", async (req, res) => { if (!guard(req, res)) return; try { res.json(await links(id(req))); } catch (e) { fail(res, e); } });
  app.get("/api/mk/campaigns/:id/report/deliverability", async (req, res) => { if (!guard(req, res)) return; try { res.json(await deliverability(id(req))); } catch (e) { fail(res, e); } });
  app.get("/api/mk/campaigns/:id/report/live", async (req, res) => { if (!guard(req, res)) return; try { res.json(await live(id(req))); } catch (e) { fail(res, e); } });
  app.get("/api/mk/campaigns/:id/report/orders", async (req, res) => { if (!guard(req, res)) return; try { const o = await orders(id(req)); res.json({ orders: o.slice(0, 500), total: o.length, revenue: o.reduce((a, x) => a + Number(x.value || 0), 0) }); } catch (e) { fail(res, e); } });
  app.get("/api/mk/campaigns/:id/report/recipients", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const f = String(req.query.filter || "delivered"), q = String(req.query.q || "").trim().slice(0, 80);
      if (req.query.csv === "1") {
        const r = await recipients(id(req), { filter: f, q, offset: 0, limit: 100000 });
        res.setHeader("Content-Type", "text/csv"); res.setHeader("Content-Disposition", `attachment; filename="campaign-${id(req)}-${f}.csv"`);
        return res.send(["Email,Name,When,Detail", ...r.rows.map((x) => [x.email, x.name, x.at ? new Date(x.at).toISOString() : "", x.extra].map(csvCell).join(","))].join("\n"));
      }
      res.json(await recipients(id(req), { filter: f, q, offset: Number(req.query.offset) || 0 }));
    } catch (e) { fail(res, e); }
  });
}

module.exports = { routes, overview, links, deliverability, recipients, live, orders, providerOf };
