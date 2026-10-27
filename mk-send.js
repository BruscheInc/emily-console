/* =============================================================================================
 *  Buzzin Marketing · the one door every marketing email and text goes through.
 *
 *  Rules enforced here, for every flow, campaign and test:
 *    1. Sending is OFF per store and channel until an admin turns it on, and it can't be turned on
 *       until a sender is connected (Amazon SES for email, a texting provider for SMS).
 *    2. While off, only addresses/numbers on the internal test list can receive anything — and even
 *       those only once a sender is connected. Everything else is recorded as "held".
 *    3. Consent is checked at the moment of sending.
 *    4. Each message to each person has a unique key, so a retry never sends twice.
 *    5. Hourly and daily caps; quiet hours for texts in the person's time zone.
 *  No sender is connected yet, so today nothing leaves Buzzin: every send is recorded, none delivered.
 * ============================================================================================= */
const crypto = require("crypto");
const core = require("./core");
const { db } = core;
const MK = () => require("./mk-core");

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS mk_sends (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, channel TEXT NOT NULL, profile_id BIGINT, to_addr TEXT,
    message_id TEXT, flow_id BIGINT, flow_step TEXT, campaign_id BIGINT, idem TEXT UNIQUE, subject TEXT, status TEXT NOT NULL, reason TEXT,
    provider_id TEXT, created_at TIMESTAMPTZ DEFAULT now(), sent_at TIMESTAMPTZ, meta JSONB NOT NULL DEFAULT '{}')`);
  await db(`CREATE INDEX IF NOT EXISTS mk_sends_profile ON mk_sends (profile_id, created_at DESC)`);
  await db(`CREATE INDEX IF NOT EXISTS mk_sends_created ON mk_sends (store, channel, created_at DESC)`);
  await db(`CREATE INDEX IF NOT EXISTS mk_sends_flow ON mk_sends (flow_id, flow_step)`);
  await db(`CREATE INDEX IF NOT EXISTS mk_sends_campaign ON mk_sends (campaign_id)`);
  await db(`CREATE TABLE IF NOT EXISTS mk_send_events (id BIGSERIAL PRIMARY KEY, send_id BIGINT, type TEXT NOT NULL, at TIMESTAMPTZ DEFAULT now(), url TEXT, meta JSONB NOT NULL DEFAULT '{}', machine BOOLEAN NOT NULL DEFAULT false)`);
  await db(`CREATE INDEX IF NOT EXISTS mk_send_events_send ON mk_send_events (send_id)`);
}

/** Is a real sender connected for this store and channel? (Nothing is, until the accounts are approved.) */
async function ready(store, channel, { test = false } = {}) {
  const cfg = (await core.setting("mk_senders", null)) || {};
  const c = cfg[store] && cfg[store][channel];
  // test sends (internal test list) only need a verified domain; real sends also need SES production access
  if (channel === "email") return !!(c && (test ? c.test_ok || c.verified : c.verified) && process.env.AWS_SES_ACCESS_KEY_ID && process.env.AWS_SES_SECRET_ACCESS_KEY);
  if (c && c.provider === "aws") return !!((test ? c.test_ok || c.verified : c.verified) && require("./mk-sms-aws").configured());
  return !!(c && c.verified && c.provider && process.env[`SMS_${String(c.provider).toUpperCase()}_KEY`]);
}
async function senders() { return (await core.setting("mk_senders", null)) || {}; }

function inQuietHours(tz, quiet) {
  try {
    const hm = new Intl.DateTimeFormat("en-US", { timeZone: tz || "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    const cur = hm.replace(/^24/, "00"), s = quiet.start, e = quiet.end;
    return s > e ? (cur >= s || cur < e) : (cur >= s && cur < e);
  } catch (_) { return false; }
}

/* Hourly / daily limits. For email they follow Amazon SES: as fast as SES allows (its per-second rate) up to its daily
   quota — Buzzin's own caps only apply when they're higher, or SES can't be reached. Counts are cached a few seconds. */
const CAPC = new Map();
async function capsOk(store, channel, caps) {
  let perHour = caps.per_hour, perDay = caps.per_day;
  if (channel === "email") { const L = await require("./mk-ses").limits().catch(() => null);
    if (L && L.per_second) perHour = Math.max(perHour, Math.floor(L.per_second * 3600));
    if (L && L.per_day) perDay = L.per_day; }
  const k = store + ":" + channel; let c = CAPC.get(k);
  if (!c || Date.now() - c.at > 5000) {
    const r = (await db(`SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int h, count(*)::int d FROM mk_sends
                         WHERE channel=$1 AND status IN ('sent','sending') AND created_at > now() - interval '1 day'`, [channel])).rows[0];
    c = { at: Date.now(), h: r.h, d: r.d }; CAPC.set(k, c);
  }
  if (c.h >= perHour || c.d >= perDay) return false;
  c.h++; c.d++; return true;
}

/**
 * Send (or hold) one message. `msg` = { subject, html, text } for email, { body, media } for SMS.
 * Returns the mk_sends row. Never throws for policy reasons — it records why it didn't send.
 */
async function send({ store, channel, profile, msg, idem, flowId, flowStep, campaignId, messageId, test = false, transactional = false }) {
  const s = await MK().settings();
  const key = idem || crypto.randomUUID();
  const dup = (await db(`SELECT * FROM mk_sends WHERE idem=$1`, [key])).rows[0];
  if (dup && dup.status !== "deferred") return dup;
  if (dup) await db(`DELETE FROM mk_sends WHERE id=$1`, [dup.id]);   // an older "wait and retry" row — try again now
  const to = channel === "email" ? profile.email : profile.phone;
  let status = "sent", reason = null;
  const onTestList = (s.test_list || []).map((x) => String(x).toLowerCase()).includes(String(to || "").toLowerCase());
  if (!to) { status = "skipped"; reason = channel === "email" ? "no email address" : "no phone number"; }
  else if (!transactional && channel === "email" && profile.email_consent !== "subscribed" && !test) { status = "skipped"; reason = `email consent: ${profile.email_consent}`; }
  else if (!transactional && channel === "sms" && profile.sms_consent !== "subscribed" && !test) { status = "skipped"; reason = `text consent: ${profile.sms_consent}`; }
  else if (channel === "sms" && !transactional && inQuietHours(profile.timezone, s.quiet_hours)) { status = "deferred"; reason = "quiet hours"; }
  else if (!(s.sending[store] && s.sending[store][channel]) && !(test && onTestList)) { status = "held"; reason = test ? "not on the internal test list" : "sending is off"; }
  else if (!(await ready(store, channel, { test: test && onTestList && !(s.sending[store] && s.sending[store][channel]) }))) { status = "held"; reason = `no ${channel === "email" ? "approved email sender" : "texting number"} connected yet`; }
  else if (!(await capsOk(store, channel, s.caps))) { status = "deferred"; reason = "sending limit reached for now — tries again shortly"; }
  // waiting (quiet hours, sending limit): nothing is recorded, so the same message can go out later
  if (status === "deferred") return { id: null, status, reason };
  const row = (await db(`INSERT INTO mk_sends (store, channel, profile_id, to_addr, message_id, flow_id, flow_step, campaign_id, idem, subject, status, reason, meta)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (idem) DO NOTHING RETURNING *`,
    [store, channel, profile.id || null, to || null, messageId || null, flowId || null, flowStep || null, campaignId || null, key,
     channel === "email" ? (msg.subject || null) : String(msg.body || "").slice(0, 160), status === "sent" ? "sending" : status, reason, JSON.stringify({ test: !!test })])).rows[0];
  // another worker inserted the same message a moment ago (e.g. two copies of Buzzin overlap during a deploy): report that one
  if (!row) return (await db(`SELECT * FROM mk_sends WHERE idem=$1`, [key])).rows[0] || { id: null, status: "skipped", reason: "already being sent" };
  if (status !== "sent") return row;
  // Tracked links and the open pixel are added only to messages that really go out.
  const T = require("./mk-analytics");
  if (channel === "email" && msg.html) msg = { ...msg, html: await T.instrumentEmail(msg.html, row, msg.campaign_name || null, { utm: msg.utm }) };
  if (channel === "sms" && msg.body) msg = { ...msg, body: await T.instrumentSms(msg.body, row, msg.campaign_name || null, { utm: msg.utm }) };
  try {
    if (channel === "email") {
      const providerId = await require("./mk-ses").sendEmail({ store, to, msg, sendId: row.id });
      const r2 = (await db(`UPDATE mk_sends SET status='sent', provider_id=$2, sent_at=now() WHERE id=$1 RETURNING *`, [row.id, providerId])).rows[0];
      if (profile.id) await MK().track(store, "received_email", { profileId: profile.id, props: { send_id: String(row.id), campaign_id: campaignId ? String(campaignId) : null, flow_id: flowId ? String(flowId) : null }, source: "buzzin", extId: `recv:${row.id}` }).catch(() => {});
      return r2;
    }
    const providerId = await require("./mk-sms-aws").send({ store, to, body: msg.body, sendId: row.id });
    const segs = require("./mk-sms").segments(msg.body).segments;
    const r3 = (await db(`UPDATE mk_sends SET status='sent', provider_id=$2, sent_at=now(), meta = meta || jsonb_build_object('segments', $3::int) WHERE id=$1 RETURNING *`, [row.id, providerId, segs])).rows[0];
    if (profile.id) await MK().track(store, "received_sms", { profileId: profile.id, props: { send_id: String(row.id), campaign_id: campaignId ? String(campaignId) : null, flow_id: flowId ? String(flowId) : null }, source: "buzzin", extId: `recv:${row.id}` }).catch(() => {});
    return r3;
  } catch (e) {
    // Amazon asked us to slow down: not a failure — drop the row so the message is retried
    if (/throttl|rate exceeded|too ?many ?requests|maximum sending rate/i.test(`${e.name} ${e.message}`)) { await db(`DELETE FROM mk_sends WHERE id=$1`, [row.id]); return { id: null, status: "deferred", reason: "sending too fast — tries again shortly" }; }
    await db(`UPDATE mk_sends SET status='failed', reason=$2 WHERE id=$1`, [row.id, String(e.message).slice(0, 300)]);
    return { ...row, status: "failed", reason: e.message };
  }
}

async function recent({ store, channel, limit = 100 }) {
  const a = [], w = [];
  if (store) { a.push(store); w.push(`store=$${a.length}`); }
  if (channel) { a.push(channel); w.push(`channel=$${a.length}`); }
  a.push(Math.min(Number(limit) || 100, 500));
  return (await db(`SELECT * FROM mk_sends ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY id DESC LIMIT $${a.length}`, a)).rows;
}

module.exports = { migrate, ready, senders, send, recent, inQuietHours };
