/* =============================================================================================
 *  Buzzin Marketing · campaigns (one-time email or text blasts)
 *
 *  A campaign = audience (lists and segments to include, others to exclude, consent required)
 *             + content (an email template with an optional subject, or a text)
 *             + timing (now, a set time, or a time in each person's own time zone)
 *             + optional A/B test (a share of the audience gets each version, the winner goes to the rest)
 *             + optional resend to people who didn't open.
 *
 *  Status: draft → pending (waiting for an admin to approve) → scheduled → sending → sent
 *          (or cancelled). Admins can schedule directly.
 *  The audience is fixed when sending starts. Every message still goes through mk-send, which checks
 *  consent again and holds everything while no sender is connected.
 *  If sending is off for the store when a campaign's time comes, it waits up to 6 hours, then goes
 *  back to Draft with a note — so a campaign never fires days late.
 * ============================================================================================= */
const core = require("./core");
const { db } = core;
const MK = () => require("./mk-core");
const SEG = () => require("./mk-segments");
const E = () => require("./mk-email");
const SEND = () => require("./mk-send");

const DEFAULT_TZ = "America/Chicago";
const TEST_METRICS = { open: "opened", click: "clicked" };

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS mk_campaigns (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'email',
    status TEXT NOT NULL DEFAULT 'draft', audience JSONB NOT NULL DEFAULT '{}', content JSONB NOT NULL DEFAULT '{}', ab JSONB NOT NULL DEFAULT '{}',
    schedule JSONB NOT NULL DEFAULT '{}', smart_sending BOOLEAN NOT NULL DEFAULT true, resend JSONB NOT NULL DEFAULT '{}', start_at TIMESTAMPTZ,
    approval JSONB NOT NULL DEFAULT '{}', note TEXT, recipients INT, created_by TEXT, updated_by TEXT, created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(), started_at TIMESTAMPTZ, sent_at TIMESTAMPTZ, archived BOOLEAN NOT NULL DEFAULT false)`);
  await db(`CREATE TABLE IF NOT EXISTS mk_campaign_recipients (campaign_id BIGINT NOT NULL, profile_id BIGINT NOT NULL, round TEXT NOT NULL DEFAULT 'main',
    variant TEXT, due_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'queued', send_id BIGINT, note TEXT, PRIMARY KEY (campaign_id, profile_id, round))`);
  await db(`CREATE INDEX IF NOT EXISTS mk_campaign_recipients_due ON mk_campaign_recipients (due_at) WHERE status='queued'`);
}

/* ---------------- audience ---------------- */
const A = (args, v) => { args.push(v); return `$${args.length}`; };
function idsOf(arr, kind) { return (arr || []).filter((x) => x.kind === kind).map((x) => Number(x.id)).filter(Boolean); }
/** SQL "FROM … WHERE …" for a campaign's audience. Profiles alias p. */
function audienceWhere(c, args, { consent = true } = {}) {
  const a = c.audience || {};
  const w = [`p.store=${A(args, c.store)}`];
  const inc = [];
  const segs = idsOf(a.include, "segment"), lists = idsOf(a.include, "list");
  if (segs.length) inc.push(`EXISTS (SELECT 1 FROM mk_segment_members m WHERE m.profile_id=p.id AND m.segment_id = ANY(${A(args, segs)}::bigint[]))`);
  if (lists.length) inc.push(`EXISTS (SELECT 1 FROM mk_list_members m WHERE m.profile_id=p.id AND m.list_id = ANY(${A(args, lists)}::bigint[]))`);
  w.push(inc.length ? `(${inc.join(" OR ")})` : "false");
  const xs = idsOf(a.exclude, "segment"), xl = idsOf(a.exclude, "list");
  if (xs.length) w.push(`NOT EXISTS (SELECT 1 FROM mk_segment_members m WHERE m.profile_id=p.id AND m.segment_id = ANY(${A(args, xs)}::bigint[]))`);
  if (xl.length) w.push(`NOT EXISTS (SELECT 1 FROM mk_list_members m WHERE m.profile_id=p.id AND m.list_id = ANY(${A(args, xl)}::bigint[]))`);
  if (a.skip_open_problems !== false) w.push(`NOT (${SEG().compile(SEG().STARTERS.open_problem.definition, args, {})})`);
  if (consent) w.push(c.channel === "sms" ? `p.sms_consent='subscribed' AND p.phone IS NOT NULL` : `p.email_consent='subscribed' AND p.email IS NOT NULL`);
  return w.join(" AND ");
}
async function refreshSegmentsOf(c) {
  const a = c.audience || {};
  for (const id of [...idsOf(a.include, "segment"), ...idsOf(a.exclude, "segment")]) { try { await SEG().refresh(id); } catch (e) { console.error(`campaign ${c.id} segment ${id}:`, e.message); } }
}
async function estimate(c, { fresh = false } = {}) {
  if (fresh) await refreshSegmentsOf(c);
  const args = []; const where = audienceWhere(c, args);
  const r = (await db(`SELECT count(*)::int n FROM mk_profiles p WHERE ${where}`, args)).rows[0];
  // the same audience without the consent rule, to show how many are left out for consent
  const a2 = []; const all = audienceWhere(c, a2, { consent: false });
  const r2 = (await db(`SELECT count(*)::int n FROM mk_profiles p WHERE ${all}`, a2)).rows[0];
  const smart = c.smart_sending && c.channel === "email" ? await smartCount(c) : 0;
  return { recipients: r.n, without_consent: Math.max(0, r2.n - r.n), smart_skipped_now: smart };
}
async function smartCount(c) {
  const S = await MK().settings(); const h = S.smart_sending_hours[c.channel] || 0; if (!h) return 0;
  const args = []; const where = audienceWhere(c, args);
  args.push(c.channel); args.push(h);
  return (await db(`SELECT count(*)::int n FROM mk_profiles p WHERE ${where} AND EXISTS (SELECT 1 FROM mk_sends s WHERE s.profile_id=p.id AND s.channel=$${args.length - 1} AND s.status='sent' AND s.created_at > now() - ($${args.length} || ' hours')::interval)`, args)).rows[0].n;
}

/* ---------------- CRUD ---------------- */
async function list(store) {
  return (await db(`SELECT c.id, c.store, c.name, c.channel, c.status, c.start_at, c.sent_at, c.recipients, c.note, c.schedule, c.ab, c.updated_at, c.created_by, c.content->>'subject' subject,
      (SELECT count(*)::int FROM mk_sends s WHERE s.campaign_id=c.id) sends,
      (SELECT count(*)::int FROM mk_sends s WHERE s.campaign_id=c.id AND s.status='sent') delivered,
      (SELECT count(DISTINCT s.profile_id)::int FROM mk_sends s JOIN mk_send_events e ON e.send_id=s.id AND e.type='opened' AND NOT e.machine WHERE s.campaign_id=c.id) opened,
      (SELECT count(DISTINCT s.profile_id)::int FROM mk_sends s JOIN mk_send_events e ON e.send_id=s.id AND e.type='clicked' WHERE s.campaign_id=c.id) clicked
    FROM mk_campaigns c WHERE NOT c.archived ${store ? "AND c.store=$1" : ""} ORDER BY COALESCE(c.start_at, c.updated_at) DESC LIMIT 500`, store ? [store] : [])).rows;
}
async function get(id) { return (await db(`SELECT * FROM mk_campaigns WHERE id=$1 AND NOT archived`, [Number(id)])).rows[0] || null; }
async function create(store, { name, channel, copy_of } = {}, who) {
  const src = copy_of ? await get(copy_of) : null;
  const base = src ? { name: `${src.name} (copy)`, channel: src.channel, audience: src.audience, content: src.content, ab: { ...src.ab, winner: null, decided_at: null }, schedule: { mode: "now" }, smart_sending: src.smart_sending, resend: { ...src.resend, done: false } }
    : { name: name || (channel === "sms" ? "New text campaign" : "New email campaign"), channel: channel === "sms" ? "sms" : "email", audience: { include: [], exclude: [], skip_open_problems: true },
        content: channel === "sms" ? { body: "", add_opt_out: true } : { template_id: null, subject: "", preview: "" }, ab: { enabled: false, variants: [], test_pct: 20, wait_hours: 4, metric: "open" },
        schedule: { mode: "now" }, smart_sending: true, resend: { enabled: false, after_hours: 48, subject: "" } };
  return (await db(`INSERT INTO mk_campaigns (store, name, channel, audience, content, ab, schedule, smart_sending, resend, created_by, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING *`,
    [src ? src.store : store, base.name, base.channel, JSON.stringify(base.audience), JSON.stringify(base.content), JSON.stringify(base.ab), JSON.stringify(base.schedule), base.smart_sending, JSON.stringify(base.resend), who || null])).rows[0];
}
async function update(id, b, who) {
  const c = await get(id); if (!c) throw Object.assign(new Error("not found"), { status: 404 });
  if (!["draft"].includes(c.status)) throw new Error("Unschedule the campaign before editing it.");
  const pick = (k) => (b[k] === undefined ? c[k] : b[k]);
  return (await db(`UPDATE mk_campaigns SET name=$2, audience=$3, content=$4, ab=$5, schedule=$6, smart_sending=$7, resend=$8, note=NULL, updated_by=$9, updated_at=now() WHERE id=$1 RETURNING *`,
    [c.id, String(pick("name") || "Campaign").slice(0, 160), JSON.stringify(pick("audience")), JSON.stringify(pick("content")), JSON.stringify(pick("ab")), JSON.stringify(pick("schedule")), !!pick("smart_sending"), JSON.stringify(pick("resend")), who || null])).rows[0];
}

/* ---------------- checks before scheduling ---------------- */
async function problems(c) {
  const p = [];
  const a = c.audience || {};
  if (!(a.include || []).length) p.push("Choose who gets it (at least one list or segment).");
  if (c.channel === "email") {
    const variants = c.ab && c.ab.enabled ? c.ab.variants || [] : [];
    if (!c.content.template_id && !(variants.length && variants.every((v) => v.template_id))) p.push("Choose an email.");
    if (c.content.template_id && !(await E().getTemplate(c.content.template_id))) p.push("The chosen email no longer exists.");
    if (!c.content.subject && !variants.length) { const t = c.content.template_id && await E().getTemplate(c.content.template_id); if (!t || !t.subject) p.push("Add a subject line."); }
  } else if (!String(c.content.body || "").trim()) p.push("Write the text.");
  if (c.ab && c.ab.enabled) {
    if ((c.ab.variants || []).length < 2) p.push("An A/B test needs at least two versions.");
    if (c.schedule.mode === "local") p.push("An A/B test can't be combined with sending in each person's time zone.");
    if (!(Number(c.ab.test_pct) >= 5 && Number(c.ab.test_pct) <= 50)) p.push("The test group should be between 5% and 50%.");
  }
  const s = c.schedule || {};
  if (s.mode === "at" && !(s.at && new Date(s.at) > new Date(Date.now() - 60e3))) p.push("Pick a send time in the future.");
  if (s.mode === "local" && !(s.date && /^\d{2}:\d{2}$/.test(s.time || ""))) p.push("Pick a date and a time for the time-zone send.");
  if (s.mode === "local" && s.date && startFor(c) < new Date()) p.push("That date is too soon for every time zone to get it at that hour. Pick a later date.");
  return p;
}
function startFor(c) {
  const s = c.schedule || {};
  if (s.mode === "at") return new Date(s.at);
  if (s.mode === "local") { const [h, m] = String(s.time || "10:00").split(":").map(Number); const [Y, M, D] = String(s.date).split("-").map(Number); return new Date(Date.UTC(Y, M - 1, D, h, m) - 14 * 3600e3); } // the earliest time zone (UTC+14)
  return new Date();
}

async function schedule(id, who, isAdmin) {
  const c = await get(id); if (!c) throw Object.assign(new Error("not found"), { status: 404 });
  if (c.status !== "draft" && !(c.status === "pending" && isAdmin)) throw new Error("Only a draft can be scheduled.");
  const p = await problems(c); if (p.length) throw new Error(p.join(" "));
  const est = await estimate(c);
  if (!isAdmin) {
    await db(`UPDATE mk_campaigns SET status='pending', approval=$2, start_at=$3, updated_at=now() WHERE id=$1`, [c.id, JSON.stringify({ requested_by: who, requested_at: new Date().toISOString() }), startFor(c)]);
    core.slackPost(`📣 Campaign waiting for approval: *${c.name}* (${c.channel === "sms" ? "text" : "email"}, about ${est.recipients.toLocaleString()} people) — requested by ${who}. Approve it in Buzzin → Marketing → Campaigns.`).catch(() => {});
    return { ...(await get(c.id)), estimate: est };
  }
  await db(`UPDATE mk_campaigns SET status='scheduled', approval=$2, start_at=$3, note=NULL, updated_at=now() WHERE id=$1`, [c.id, JSON.stringify({ ...(c.approval || {}), approved_by: who, approved_at: new Date().toISOString() }), startFor(c)]);
  return { ...(await get(c.id)), estimate: est };
}
async function unschedule(id, who) {
  const c = await get(id); if (!c) throw Object.assign(new Error("not found"), { status: 404 });
  if (!["pending", "scheduled"].includes(c.status)) throw new Error("Only a scheduled or pending campaign can go back to draft.");
  await db(`UPDATE mk_campaigns SET status='draft', start_at=NULL, approval='{}', note=$2, updated_at=now() WHERE id=$1`, [c.id, `Unscheduled by ${who}`]);
  return get(c.id);
}
async function cancel(id, who) {
  const c = await get(id); if (!c) throw Object.assign(new Error("not found"), { status: 404 });
  if (c.status !== "sending") return unschedule(id, who);
  await db(`UPDATE mk_campaign_recipients SET status='cancelled' WHERE campaign_id=$1 AND status='queued'`, [c.id]);
  await db(`UPDATE mk_campaigns SET status='cancelled', note=$2, updated_at=now() WHERE id=$1`, [c.id, `Stopped by ${who}`]);
  return get(c.id);
}

/* ---------------- sending ---------------- */
async function sendingAllowed(c) {
  const S = await MK().settings();
  return !!(S.sending[c.store] && S.sending[c.store][c.channel]) && (await SEND().ready(c.store, c.channel));
}
/** Fix the audience: one row per person with when they get it and which version. */
async function snapshot(c) {
  await refreshSegmentsOf(c);
  const args = [c.id]; const where = audienceWhere(c, args);
  const s = c.schedule || {};
  let due = "now()";
  if (s.mode === "local") {
    const local = `${s.date} ${s.time}:00`;
    due = `(${A(args, local)}::timestamp AT TIME ZONE COALESCE(tz.name, ${A(args, DEFAULT_TZ)}))`;
  }
  const ab = c.ab || {};
  if (ab.enabled && (ab.variants || []).length >= 2) {
    const n = ab.variants.length, pct = Number(ab.test_pct) || 20;
    args.push(n, pct / 100, Number(ab.wait_hours) || 4);
    const [an, ap, aw] = [args.length - 2, args.length - 1, args.length];
    await db(`INSERT INTO mk_campaign_recipients (campaign_id, profile_id, variant, due_at)
      SELECT $1, x.id, CASE WHEN x.r < $${ap}::float8 THEN chr((65 + (x.k % $${an}::int))::int) ELSE 'win' END,
             CASE WHEN x.r < $${ap}::float8 THEN now() ELSE now() + ($${aw} || ' hours')::interval END
      FROM (SELECT p.id, random() r, row_number() OVER (ORDER BY random()) k FROM mk_profiles p WHERE ${where}) x ON CONFLICT DO NOTHING`, args);
  } else {
    await db(`INSERT INTO mk_campaign_recipients (campaign_id, profile_id, variant, due_at)
      SELECT $1, p.id, NULL, ${due} FROM mk_profiles p LEFT JOIN pg_timezone_names tz ON tz.name = p.timezone WHERE ${where} ON CONFLICT DO NOTHING`, args);
  }
  const n = (await db(`SELECT count(*)::int n FROM mk_campaign_recipients WHERE campaign_id=$1 AND round='main'`, [c.id])).rows[0].n;
  await db(`UPDATE mk_campaigns SET status='sending', recipients=$2, started_at=now(), note=NULL WHERE id=$1`, [c.id, n]);
}
async function pickWinner(c) {
  const ab = c.ab || {}; if (ab.winner) return ab.winner;
  const ev = TEST_METRICS[ab.metric] || "opened";
  const rows = (await db(`SELECT r.variant, count(DISTINCT s.id)::int sent, count(DISTINCT e.send_id)::int hit FROM mk_campaign_recipients r JOIN mk_sends s ON s.id=r.send_id AND s.status='sent'
    LEFT JOIN mk_send_events e ON e.send_id=s.id AND e.type=$2 AND NOT e.machine WHERE r.campaign_id=$1 AND r.round='main' AND r.variant <> 'win' GROUP BY r.variant`, [c.id, ev])).rows;
  let best = "A", rate = -1;
  for (const r of rows.sort((a, b) => a.variant.localeCompare(b.variant))) { const x = r.sent ? r.hit / r.sent : 0; if (x > rate) { rate = x; best = r.variant; } }
  const nab = { ...ab, winner: best, decided_at: new Date().toISOString(), results: rows };
  await db(`UPDATE mk_campaigns SET ab=$2 WHERE id=$1`, [c.id, JSON.stringify(nab)]);
  c.ab = nab; return best;
}
function versionOf(c, variant) {
  if (!variant || !(c.ab && c.ab.enabled)) return c.content;
  const v = (c.ab.variants || [])[variant.charCodeAt(0) - 65] || {};
  return { ...c.content, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "" && x != null)) };
}
async function deliver(c, r, S) {
  const p = (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [r.profile_id])).rows[0];
  if (!p) return { status: "skipped", note: "profile gone" };
  let variant = r.variant;
  if (variant === "win") variant = await pickWinner(c);
  const v = versionOf(c, variant);
  const idem = `camp:${c.id}:${r.round}:${p.id}`;
  if (c.smart_sending && r.round === "main") {
    const h = S.smart_sending_hours[c.channel] || 0;
    if (h && (await db(`SELECT 1 FROM mk_sends WHERE profile_id=$1 AND channel=$2 AND status='sent' AND created_at > now() - ($3 || ' hours')::interval LIMIT 1`, [p.id, c.channel, h])).rows[0]) return { status: "skipped", note: "smart sending" };
  }
  if (c.channel === "email") {
    const tpl = await E().getTemplate(v.template_id); if (!tpl) return { status: "skipped", note: "email missing" };
    const subject = r.round === "resend" && c.resend.subject ? c.resend.subject : v.subject || tpl.subject;
    const msg = await E().render(c.store, { ...tpl, subject, preview: v.preview || tpl.preview }, p, { campaign: c.name });
    const row = await SEND().send({ store: c.store, channel: "email", profile: p, msg, idem, campaignId: c.id, messageId: `camp:${c.id}:${variant || "main"}` });
    return { status: row.status, send_id: row.id, note: row.reason };
  }
  const SMS = require("./mk-sms");
  const body = await SMS.compose(c.store, { body: v.body, add_opt_out: v.add_opt_out !== false }, p, {});
  const row = await SEND().send({ store: c.store, channel: "sms", profile: p, msg: { body, media: v.media || null }, idem, campaignId: c.id, messageId: `camp:${c.id}:${variant || "main"}` });
  if (row.status === "deferred") return { status: "queued", later: true, note: "quiet hours" };
  return { status: row.status, send_id: row.id, note: row.reason };
}

let ticking = false;
async function tick() {
  if (ticking) return; ticking = true;
  try {
    const S = await MK().settings();
    // 1. scheduled campaigns whose time has come
    for (const c of (await db(`SELECT * FROM mk_campaigns WHERE status='scheduled' AND start_at <= now() AND NOT archived`)).rows) {
      if (!(await sendingAllowed(c))) {
        if (Date.now() - new Date(c.start_at).getTime() > 6 * 3600e3) await db(`UPDATE mk_campaigns SET status='draft', start_at=NULL, note=$2 WHERE id=$1`, [c.id, `Missed its time (${new Date(c.start_at).toISOString().slice(0, 16).replace("T", " ")} UTC): ${c.channel} sending is off for this store. Nothing was sent.`]);
        else await db(`UPDATE mk_campaigns SET note=$2 WHERE id=$1`, [c.id, `Waiting: ${c.channel} sending is off for this store. If it isn't turned on within 6 hours of the send time, this goes back to Draft.`]);
        continue;
      }
      await snapshot(c);
    }
    // 2. resend to people who didn't open
    for (const c of (await db(`SELECT * FROM mk_campaigns WHERE status='sent' AND channel='email' AND (resend->>'enabled')::boolean AND NOT COALESCE((resend->>'done')::boolean,false)
        AND sent_at + ((COALESCE(resend->>'after_hours','48'))::int || ' hours')::interval <= now()`)).rows) {
      const n = (await db(`INSERT INTO mk_campaign_recipients (campaign_id, profile_id, round, variant, due_at)
        SELECT r.campaign_id, r.profile_id, 'resend', CASE WHEN r.variant='win' THEN $2 ELSE r.variant END, now() FROM mk_campaign_recipients r JOIN mk_sends s ON s.id=r.send_id AND s.status='sent'
        JOIN mk_profiles p ON p.id=r.profile_id AND p.email_consent='subscribed'
        WHERE r.campaign_id=$1 AND r.round='main' AND NOT EXISTS (SELECT 1 FROM mk_send_events e WHERE e.send_id=s.id AND e.type IN ('opened','clicked') AND NOT e.machine) ON CONFLICT DO NOTHING RETURNING 1`, [c.id, (c.ab && c.ab.winner) || "A"])).rowCount;
      await db(`UPDATE mk_campaigns SET resend = resend || '{"done":true}'::jsonb, status=$2 WHERE id=$1`, [c.id, n ? "sending" : "sent"]);
    }
    // 3. deliver due messages, a batch at a time
    const due = (await db(`SELECT r.* FROM mk_campaign_recipients r JOIN mk_campaigns c ON c.id=r.campaign_id AND c.status='sending' WHERE r.status='queued' AND r.due_at <= now() ORDER BY r.due_at LIMIT 400`)).rows;
    const camps = {};
    for (const r of due) {
      const c = camps[r.campaign_id] || (camps[r.campaign_id] = await get(r.campaign_id));
      if (!c || c.status !== "sending") continue;
      try {
        const out = await deliver(c, r, S);
        if (out.later) await db(`UPDATE mk_campaign_recipients SET due_at=now() + interval '30 minutes', note=$4 WHERE campaign_id=$1 AND profile_id=$2 AND round=$3`, [r.campaign_id, r.profile_id, r.round, out.note]);
        else await db(`UPDATE mk_campaign_recipients SET status=$4, send_id=$5, note=$6 WHERE campaign_id=$1 AND profile_id=$2 AND round=$3`, [r.campaign_id, r.profile_id, r.round, out.status, out.send_id || null, out.note || null]);
      } catch (e) { console.error(`campaign ${r.campaign_id} → ${r.profile_id}:`, e.message); await db(`UPDATE mk_campaign_recipients SET status='error', note=$4 WHERE campaign_id=$1 AND profile_id=$2 AND round=$3`, [r.campaign_id, r.profile_id, r.round, e.message.slice(0, 200)]); }
    }
    // 4. finished?
    await db(`UPDATE mk_campaigns c SET status='sent', sent_at=COALESCE(c.sent_at, now()) WHERE c.status='sending' AND NOT EXISTS (SELECT 1 FROM mk_campaign_recipients r WHERE r.campaign_id=c.id AND r.status='queued')`);
  } finally { ticking = false; }
}

/* ---------------- test send / preview / report ---------------- */
async function testSend(id, to) {
  const c = await get(id); if (!c) throw Object.assign(new Error("not found"), { status: 404 });
  to = String(to || "").trim().toLowerCase(); if (!to) throw new Error("Enter an address or number from the internal test list.");
  const out = [];
  const versions = c.ab && c.ab.enabled && (c.ab.variants || []).length ? c.ab.variants.map((_, i) => String.fromCharCode(65 + i)) : [null];
  for (const v of versions) {
    const x = versionOf(c, v);
    if (c.channel === "email") {
      const tpl = await E().getTemplate(x.template_id); if (!tpl) throw new Error("Choose an email first.");
      const msg = await E().render(c.store, { ...tpl, subject: `${v ? `[${v}] ` : ""}${x.subject || tpl.subject}`, preview: x.preview || tpl.preview }, { id: 0, email: to, first_name: "Test" });
      const row = await SEND().send({ store: c.store, channel: "email", profile: { id: null, email: to, email_consent: "subscribed" }, msg, test: true, campaignId: null, messageId: `camp:${c.id}:${v || "main"}`, idem: `ctest:${c.id}:${v}:${to}:${Date.now()}` });
      out.push({ version: v, status: row.status, reason: row.reason });
    } else {
      const body = await require("./mk-sms").compose(c.store, { body: x.body, add_opt_out: x.add_opt_out !== false }, { id: 0, phone: to, first_name: "Test" }, {});
      const row = await SEND().send({ store: c.store, channel: "sms", profile: { id: null, phone: MK().normPhone(to) || to, sms_consent: "subscribed" }, msg: { body }, test: true, messageId: `camp:${c.id}:${v || "main"}`, idem: `ctest:${c.id}:${v}:${to}:${Date.now()}` });
      out.push({ version: v, status: row.status, reason: row.reason });
    }
  }
  return out;
}
async function report(id) {
  const c = await get(id); if (!c) return null;
  const by = (await db(`SELECT COALESCE(r.round,'main') round, COALESCE(r.variant,'') variant, r.status, count(*)::int n FROM mk_campaign_recipients r WHERE r.campaign_id=$1 GROUP BY 1,2,3`, [c.id])).rows;
  const ev = (await db(`SELECT e.type, count(DISTINCT s.profile_id)::int n FROM mk_sends s JOIN mk_send_events e ON e.send_id=s.id AND NOT e.machine WHERE s.campaign_id=$1 GROUP BY 1`, [c.id])).rows;
  const reasons = (await db(`SELECT COALESCE(reason, status) reason, count(*)::int n FROM mk_sends WHERE campaign_id=$1 AND status <> 'sent' GROUP BY 1 ORDER BY 2 DESC LIMIT 8`, [c.id])).rows;
  return { recipients: by, events: Object.fromEntries(ev.map((x) => [x.type, x.n])), not_sent: reasons };
}

/* ---------------- routes ---------------- */
function routes(app, { guard, admin, isAdmin, actorOf, fail, store }) {
  app.get("/api/mk/campaigns", async (req, res) => { if (!guard(req, res)) return; try { const st = store(req.query.store); res.json({ campaigns: await list(st) }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/campaigns", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; if (!b.copy_of && !store(b.store)) return res.status(400).json({ error: "Pick a store first" }); res.json(await create(store(b.store), b, actorOf(req))); } catch (e) { fail(res, e); } });
  app.get("/api/mk/campaigns/:id", async (req, res) => {
    if (!guard(req, res)) return;
    try { const c = await get(req.params.id); if (!c) return res.status(404).json({ error: "not found" });
      res.json({ ...c, problems: await problems(c), templates: await E().listTemplates(c.store), lists: await MK().lists(c.store), segments: await SEG().list(c.store), report: await report(c.id), sending_on: await sendingAllowed(c) }); } catch (e) { fail(res, e); }
  });
  app.put("/api/mk/campaigns/:id", async (req, res) => { if (!guard(req, res)) return; try { const c = await update(req.params.id, req.body || {}, actorOf(req)); res.json({ ...c, problems: await problems(c) }); } catch (e) { fail(res, e); } });
  app.delete("/api/mk/campaigns/:id", async (req, res) => { if (!guard(req, res)) return; try { const c = await get(req.params.id); if (c && ["sending"].includes(c.status)) return res.status(400).json({ error: "Stop it first." }); await db(`UPDATE mk_campaigns SET archived=true WHERE id=$1`, [Number(req.params.id)]); res.json({ ok: true }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/campaigns/estimate", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; if (!store(b.store)) return res.status(400).json({ error: "store required" }); res.json(await estimate({ store: b.store, channel: b.channel === "sms" ? "sms" : "email", audience: b.audience || {}, smart_sending: !!b.smart_sending }, { fresh: !!b.fresh })); } catch (e) { fail(res, e); } });
  app.post("/api/mk/campaigns/:id/schedule", async (req, res) => { if (!guard(req, res)) return; try { res.json(await schedule(req.params.id, actorOf(req), !!(isAdmin && isAdmin(req)))); } catch (e) { fail(res, e); } });
  app.post("/api/mk/campaigns/:id/approve", async (req, res) => { if (!admin(req, res)) return; try { res.json(await schedule(req.params.id, actorOf(req), true)); } catch (e) { fail(res, e); } });
  app.post("/api/mk/campaigns/:id/unschedule", async (req, res) => { if (!guard(req, res)) return; try { res.json(await unschedule(req.params.id, actorOf(req))); } catch (e) { fail(res, e); } });
  app.post("/api/mk/campaigns/:id/cancel", async (req, res) => { if (!guard(req, res)) return; try { res.json(await cancel(req.params.id, actorOf(req))); } catch (e) { fail(res, e); } });
  app.post("/api/mk/campaigns/:id/test", async (req, res) => { if (!guard(req, res)) return; try { res.json({ results: await testSend(req.params.id, (req.body || {}).to) }); } catch (e) { fail(res, e); } });
}

async function init() {
  await migrate();
  setInterval(() => tick().catch((e) => console.error("campaigns:", e.message)), 60 * 1000);
}

module.exports = { init, migrate, routes, list, get, create, update, estimate, problems, schedule, unschedule, cancel, tick, testSend, report, audienceWhere, startFor };
