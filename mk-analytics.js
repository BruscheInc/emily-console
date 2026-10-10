/* =============================================================================================
 *  Buzzin Marketing · tracking and analytics
 *
 *  Tracking (used once a sender is connected):
 *    - every link in an email or text is swapped for a short Buzzin link (/mk/l/<code>) that records
 *      the click and forwards to the real page, with utm tags added for Shopify reports;
 *    - emails get a 1×1 open pixel (/mk/o/<send>.<sig>.gif).
 *    Apple Mail Privacy Protection and link scanners open/click on their own; those are kept but marked
 *    "machine" and left out of open rates, resend-to-non-openers and A/B winners.
 *  Revenue credit: an order counts for the last email clicked within N days (default 5) or text clicked
 *  within N days (default 1) before it — set in Marketing → Settings.
 *  Reports: overview, campaigns and flows by revenue, list growth, forms, deliverability, repeat-purchase cohorts.
 * ============================================================================================= */
const crypto = require("crypto");
const core = require("./core");
const { db } = core;
const MK = () => require("./mk-core");

// Links and the open pixel use the store's own domain (returns.larkspurbaby.com), never the Railway address:
// carriers and mailbox providers distrust links on a domain that isn't the sender's.
const brandBase = (store) => { try { const d = require("./returns").STORE_DEFS[store]; if (d && d.host) return `https://${d.host}`; } catch (_) {} return PUBLIC_URL(); };
const PUBLIC_URL = () => (process.env.PUBLIC_URL || "https://emily-console-production.up.railway.app").replace(/\/$/, "");
const SECRET = () => process.env.RETURNS_SECRET || process.env.CONSOLE_KEY || "buzzin";
const sig = (s) => crypto.createHmac("sha256", SECRET()).update(String(s)).digest("base64url").slice(0, 12);
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const BOT_UA = /(bot|crawl|spider|scanner|barracuda|proofpoint|mimecast|symantec|messagelabs|trendmicro|forcepoint|safelinks|urldefense|curl|wget|python|go-http)/i;

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS mk_links (code TEXT PRIMARY KEY, send_id BIGINT, url TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE INDEX IF NOT EXISTS mk_links_send ON mk_links (send_id)`);
  await db(`CREATE INDEX IF NOT EXISTS mk_send_events_type ON mk_send_events (type, at)`);
}

/* ---------------- instrumenting messages ---------------- */
const code = () => crypto.randomBytes(6).toString("base64url");
function withUtm(url, { channel, name }) {
  try {
    const u = new URL(url);
    if (!/larkspurbaby\.com$|myshopify\.com$/i.test(u.hostname)) return url;   // only tag our own store links
    if (!u.searchParams.has("utm_source")) { u.searchParams.set("utm_source", "buzzin"); u.searchParams.set("utm_medium", channel); if (name) u.searchParams.set("utm_campaign", String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)); }
    return u.toString();
  } catch (_) { return url; }
}
async function link(send, url) { const c = code(); await db(`INSERT INTO mk_links (code, send_id, url) VALUES ($1,$2,$3)`, [c, send.id, url]); return `${brandBase(send.store)}/l/${c}`; }
/** Email: wrap links (not unsubscribe/preferences/mailto) and add the open pixel. */
async function instrumentEmail(html, send, name) {
  const seen = new Map();
  const out = [];
  let last = 0;
  const re = /href="(https?:\/\/[^"]+)"/gi; let m;
  while ((m = re.exec(html))) {
    const url = m[1].replace(/&amp;/g, "&");
    if (/\/mk\/(u|p)\//.test(url)) continue;
    if (!seen.has(url)) seen.set(url, await link(send, withUtm(url, { channel: "email", name })));
    out.push(html.slice(last, m.index), `href="${seen.get(url)}"`); last = m.index + m[0].length;
  }
  out.push(html.slice(last));
  const px = `<img src="${brandBase(send.store)}/mk/o/${send.id}.${sig("o" + send.id)}.gif" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`;
  const body = out.join("");
  return /<\/body>/i.test(body) ? body.replace(/<\/body>/i, `${px}</body>`) : body + px;
}
/** Text: swap each link for a short tracked one. */
async function instrumentSms(text, send, name) {
  const urls = [...new Set(String(text).match(/https?:\/\/[^\s]+/g) || [])];
  let t = String(text);
  for (const u of urls) t = t.split(u).join(await link(send, withUtm(u, { channel: "sms", name })));
  return t;
}

/* ---------------- recording opens and clicks ---------------- */
async function sendRow(id) { return (await db(`SELECT * FROM mk_sends WHERE id=$1`, [Number(id)])).rows[0] || null; }
function isMachine(send, req, kind) {
  const ua = String(req.headers["user-agent"] || "");
  const age = send.sent_at ? Date.now() - new Date(send.sent_at).getTime() : Infinity;
  if (BOT_UA.test(ua)) return true;
  if (kind === "opened" && (ua.trim() === "Mozilla/5.0" || age < 3000)) return true;   // Apple Mail Privacy Protection fetches as plain "Mozilla/5.0"
  if (kind === "clicked" && age < 5000) return true;                                     // link scanners click within seconds
  return false;
}
async function record(send, type, req, url) {
  const machine = isMachine(send, req, type);
  const first = !(await db(`SELECT 1 FROM mk_send_events WHERE send_id=$1 AND type=$2 AND NOT machine LIMIT 1`, [send.id, type])).rows[0];
  await db(`INSERT INTO mk_send_events (send_id, type, url, meta, machine) VALUES ($1,$2,$3,$4,$5)`, [send.id, type, url || null, JSON.stringify({ ua: String(req.headers["user-agent"] || "").slice(0, 200) }), machine]);
  if (machine || !first || !send.profile_id) return;
  const ev = `${type}_${send.channel === "sms" ? "sms" : "email"}`;
  await MK().track(send.store, ev, { profileId: send.profile_id, props: { send_id: String(send.id), campaign_id: send.campaign_id ? String(send.campaign_id) : null, flow_id: send.flow_id ? String(send.flow_id) : null, flow_step: send.flow_step, url: url || null }, source: "buzzin", extId: `${type}:${send.id}` });
}

/* ---------------- reports ---------------- */
async function overview({ store, days = 30 }) {
  days = Math.min(730, Math.max(1, Number(days) || 30));
  const S = await MK().settings();
  const ed = S.attribution.email_click_days, sd = S.attribution.sms_click_days;
  const a = [days]; const sw = (al) => (store ? ` AND ${al}.store=$${a.push(store) && a.length}` : "");
  const sends = (await db(`SELECT s.channel, s.status, count(*)::int n FROM mk_sends s WHERE s.created_at > now() - ($1 || ' days')::interval AND NOT COALESCE((s.meta->>'test')::boolean,false)${sw("s")} GROUP BY 1,2`, a)).rows;
  const b = [days]; const sw2 = (al) => (store ? ` AND ${al}.store=$${b.push(store) && b.length}` : "");
  const ev = (await db(`SELECT s.channel, e.type, count(DISTINCT s.id)::int n FROM mk_send_events e JOIN mk_sends s ON s.id=e.send_id WHERE NOT e.machine AND e.at > now() - ($1 || ' days')::interval${sw2("s")} GROUP BY 1,2`, b)).rows;

  // revenue: all store orders, and the part credited to a click
  const c = [days, ed, sd]; const sw3 = (al) => (store ? ` AND ${al}.store=$${c.push(store) && c.length}` : "");
  const credited = `WITH o AS (SELECT e.id, e.profile_id, e.store, e.at, COALESCE(e.value,0) value FROM mk_events e WHERE e.type='placed_order' AND e.at > now() - ($1 || ' days')::interval AND NOT COALESCE((e.props->>'cancelled')::boolean,false)${sw3("e")}),
    cr AS (SELECT o.*, k.type ktype, k.props kp FROM o LEFT JOIN LATERAL (SELECT k.type, k.props FROM mk_events k WHERE k.profile_id=o.profile_id AND k.type IN ('clicked_email','clicked_sms') AND k.at <= o.at
           AND k.at > o.at - ((CASE WHEN k.type='clicked_email' THEN $2::int ELSE $3::int END) || ' days')::interval ORDER BY k.at DESC LIMIT 1) k ON o.profile_id IS NOT NULL)`;
  const rev = (await db(`${credited} SELECT count(*)::int orders, COALESCE(sum(value),0)::float total, count(*) FILTER (WHERE ktype IS NOT NULL)::int m_orders, COALESCE(sum(value) FILTER (WHERE ktype IS NOT NULL),0)::float marketing,
      COALESCE(sum(value) FILTER (WHERE ktype='clicked_email'),0)::float email, COALESCE(sum(value) FILTER (WHERE ktype='clicked_sms'),0)::float sms,
      COALESCE(sum(value) FILTER (WHERE kp->>'flow_id' IS NOT NULL),0)::float flows, COALESCE(sum(value) FILTER (WHERE kp->>'campaign_id' IS NOT NULL),0)::float campaigns FROM cr`, c)).rows[0];
  const daily = (await db(`${credited} SELECT to_char(date_trunc('day', at AT TIME ZONE 'America/Chicago'),'YYYY-MM-DD') d, COALESCE(sum(value),0)::float total, COALESCE(sum(value) FILTER (WHERE ktype IS NOT NULL),0)::float marketing, count(*)::int orders FROM cr GROUP BY 1 ORDER BY 1`, c)).rows;
  const top = (await db(`${credited} SELECT CASE WHEN kp->>'campaign_id' IS NOT NULL THEN 'campaign' ELSE 'flow' END kind, COALESCE(kp->>'campaign_id', kp->>'flow_id') id, count(*)::int orders, sum(value)::float revenue FROM cr WHERE ktype IS NOT NULL AND (kp->>'campaign_id' IS NOT NULL OR kp->>'flow_id' IS NOT NULL) GROUP BY 1,2 ORDER BY revenue DESC LIMIT 15`, c)).rows;
  for (const t of top) t.name = (await db(t.kind === "campaign" ? `SELECT name FROM mk_campaigns WHERE id=$1` : `SELECT name FROM mk_flows WHERE id=$1`, [Number(t.id)])).rows.map((x) => x.name)[0] || `#${t.id}`;

  // list growth (consent changes per day)
  const d = [days]; const sw4 = store ? ` AND p.store=$${d.push(store) && d.length}` : "";
  const growth = (await db(`SELECT to_char(date_trunc('day', l.at AT TIME ZONE 'America/Chicago'),'YYYY-MM-DD') d, l.channel,
      count(*) FILTER (WHERE l.state='subscribed' AND COALESCE(l.previous,'') <> 'subscribed')::int gained, count(*) FILTER (WHERE l.state IN ('unsubscribed','stopped') AND l.previous='subscribed')::int lost
    FROM mk_consent_log l JOIN mk_profiles p ON p.id=l.profile_id WHERE l.at > now() - ($1 || ' days')::interval${sw4} GROUP BY 1,2 ORDER BY 1`, d)).rows;
  const totals = (await db(`SELECT count(*) FILTER (WHERE email_consent='subscribed')::int email, count(*) FILTER (WHERE sms_consent='subscribed')::int sms FROM mk_profiles p WHERE true${store ? " AND p.store=$1" : ""}`, store ? [store] : [])).rows[0];

  // forms
  const f = [days]; const sw5 = store ? ` AND f.store=$${f.push(store) && f.length}` : "";
  const forms = (await db(`SELECT f.id, f.name, f.status, count(*) FILTER (WHERE e.type='viewed')::int shown, count(*) FILTER (WHERE e.type='submitted_email')::int emails, count(*) FILTER (WHERE e.type='submitted_phone')::int phones
    FROM mk_forms f LEFT JOIN mk_form_events e ON e.form_id=f.id AND NOT e.preview AND e.at > now() - ($1 || ' days')::interval WHERE true${sw5} GROUP BY f.id ORDER BY emails DESC, f.id DESC LIMIT 20`, f).catch(() => ({ rows: [] }))).rows;

  return { days, attribution: S.attribution, sends, events: ev, revenue: rev, daily, top, growth, list_totals: totals, forms, health: health(sends, ev) };
}
function health(sends, ev) {
  const sent = (ch) => sends.filter((x) => x.channel === ch && x.status === "sent").reduce((a, x) => a + x.n, 0);
  const n = (ch, t) => ev.filter((x) => x.channel === ch && x.type === t).reduce((a, x) => a + x.n, 0);
  const es = sent("email");
  const rate = (x) => (es ? x / es : null);
  const r = { email_sent: es, bounce: rate(n("email", "bounced")), complaint: rate(n("email", "complained")), unsubscribe: rate(n("email", "unsubscribed")), open: rate(n("email", "opened")), click: rate(n("email", "clicked")) };
  // Gmail/Yahoo bulk-sender rules: spam complaints must stay under 0.3% (aim for under 0.1%); bounces under 2% is healthy.
  r.status = !es ? "none" : (r.complaint >= 0.003 || r.bounce >= 0.05) ? "bad" : (r.complaint >= 0.001 || r.bounce >= 0.02 || r.unsubscribe >= 0.005) ? "watch" : "good";
  return r;
}
async function cohorts(store) {
  const a = []; const sw = store ? ` AND store=$${a.push(store) && a.length}` : "";
  const rows = (await db(`WITH o AS (SELECT profile_id, at, COALESCE(value,0) value FROM mk_events WHERE type='placed_order' AND profile_id IS NOT NULL AND NOT COALESCE((props->>'cancelled')::boolean,false)${sw}),
      x AS (SELECT profile_id, min(at) first_at, (array_agg(at ORDER BY at))[2] second_at, sum(value) ltv, count(*) n FROM o GROUP BY profile_id)
    SELECT to_char(date_trunc('month', first_at),'YYYY-MM') m, count(*)::int customers,
      count(*) FILTER (WHERE second_at <= first_at + interval '30 days')::int r30, count(*) FILTER (WHERE second_at <= first_at + interval '60 days')::int r60,
      count(*) FILTER (WHERE second_at <= first_at + interval '90 days')::int r90, count(*) FILTER (WHERE second_at <= first_at + interval '180 days')::int r180,
      count(*) FILTER (WHERE second_at <= first_at + interval '365 days')::int r365, avg(ltv)::float ltv, avg(n)::float orders,
      extract(day from now() - min(date_trunc('month', first_at)))::int age_days
    FROM x WHERE first_at > date_trunc('month', now()) - interval '18 months' GROUP BY 1 ORDER BY 1 DESC`, a)).rows;
  return rows;
}
async function sendsReport({ store, kind }) {
  // per campaign or per flow: sent, opened, clicked, unsubscribed (human only)
  const col = kind === "flow" ? "flow_id" : "campaign_id";
  const a = []; const sw = store ? ` AND s.store=$${a.push(store) && a.length}` : "";
  return (await db(`SELECT s.${col} id, count(*) FILTER (WHERE s.status='sent')::int sent, count(*)::int total,
      count(DISTINCT s.id) FILTER (WHERE e.type='opened')::int opened, count(DISTINCT s.id) FILTER (WHERE e.type='clicked')::int clicked, count(DISTINCT s.id) FILTER (WHERE e.type='unsubscribed')::int unsubscribed
    FROM mk_sends s LEFT JOIN mk_send_events e ON e.send_id=s.id AND NOT e.machine WHERE s.${col} IS NOT NULL AND NOT COALESCE((s.meta->>'test')::boolean,false)${sw} GROUP BY 1`, a)).rows;
}

/* ---------------- routes ---------------- */
function routes(app, { guard, fail, store }) {
  app.get("/mk/o/:t", async (req, res) => {
    res.set({ "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" }).send(PIXEL);
    try { const [id, s] = String(req.params.t).replace(/\.gif$/, "").split("."); if (sig("o" + id) !== s) return; const send = await sendRow(id); if (send) await record(send, "opened", req); } catch (e) { console.error("open pixel:", e.message); }
  });
  app.get(["/mk/l/:code", "/l/:code"], async (req, res) => {
    try {
      const l = (await db(`SELECT * FROM mk_links WHERE code=$1`, [String(req.params.code).slice(0, 20)])).rows[0];
      if (!l) return res.status(404).type("text").send("This link has expired.");
      res.redirect(302, l.url);
      if (l.send_id) { const send = await sendRow(l.send_id); if (send) await record(send, "clicked", req, l.url); }
    } catch (e) { console.error("link:", e.message); if (!res.headersSent) res.status(500).end(); }
  });
  app.get("/api/mk/analytics", async (req, res) => { if (!guard(req, res)) return; try { res.json(await overview({ store: store(req.query.store), days: req.query.days })); } catch (e) { fail(res, e); } });
  app.get("/api/mk/analytics/cohorts", async (req, res) => { if (!guard(req, res)) return; try { res.json({ cohorts: await cohorts(store(req.query.store)) }); } catch (e) { fail(res, e); } });
  app.get("/api/mk/analytics/sends", async (req, res) => { if (!guard(req, res)) return; try { res.json({ rows: await sendsReport({ store: store(req.query.store), kind: req.query.kind }) }); } catch (e) { fail(res, e); } });
}

async function init() { await migrate(); }
module.exports = { init, migrate, routes, instrumentEmail, instrumentSms, overview, cohorts, sendsReport, withUtm };
