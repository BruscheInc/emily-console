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
async function ready(store, channel) {
  const cfg = (await core.setting("mk_senders", null)) || {};
  const c = cfg[store] && cfg[store][channel];
  if (channel === "email") return !!(c && c.verified && process.env.AWS_SES_ACCESS_KEY_ID && process.env.AWS_SES_SECRET_ACCESS_KEY);
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

async function capsOk(store, channel, caps) {
  const r = (await db(`SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int h, count(*)::int d FROM mk_sends
                       WHERE store=$1 AND channel=$2 AND status='sent' AND created_at > now() - interval '1 day'`, [store, channel])).rows[0];
  return r.h < caps.per_hour && r.d < caps.per_day;
}

/**
 * Send (or hold) one message. `msg` = { subject, html, text } for email, { body, media } for SMS.
 * Returns the mk_sends row. Never throws for policy reasons — it records why it didn't send.
 */
async function send({ store, channel, profile, msg, idem, flowId, flowStep, campaignId, messageId, test = false, transactional = false }) {
  const s = await MK().settings();
  const key = idem || crypto.randomUUID();
  const dup = (await db(`SELECT * FROM mk_sends WHERE idem=$1`, [key])).rows[0];
  if (dup) return dup;
  const to = channel === "email" ? profile.email : profile.phone;
  let status = "sent", reason = null;
  const onTestList = (s.test_list || []).map((x) => String(x).toLowerCase()).includes(String(to || "").toLowerCase());
  if (!to) { status = "skipped"; reason = channel === "email" ? "no email address" : "no phone number"; }
  else if (!transactional && channel === "email" && profile.email_consent !== "subscribed" && !test) { status = "skipped"; reason = `email consent: ${profile.email_consent}`; }
  else if (!transactional && channel === "sms" && profile.sms_consent !== "subscribed" && !test) { status = "skipped"; reason = `text consent: ${profile.sms_consent}`; }
  else if (channel === "sms" && !transactional && inQuietHours(profile.timezone, s.quiet_hours)) { status = "deferred"; reason = "quiet hours"; }
  else if (!(s.sending[store] && s.sending[store][channel]) && !(test && onTestList)) { status = "held"; reason = test ? "not on the internal test list" : "sending is off"; }
  else if (!(await ready(store, channel))) { status = "held"; reason = `no ${channel === "email" ? "email sender" : "texting number"} connected yet`; }
  else if (!(await capsOk(store, channel, s.caps))) { status = "held"; reason = "hourly or daily cap reached"; }
  const row = (await db(`INSERT INTO mk_sends (store, channel, profile_id, to_addr, message_id, flow_id, flow_step, campaign_id, idem, subject, status, reason, meta)
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (idem) DO NOTHING RETURNING *`,
    [store, channel, profile.id || null, to || null, messageId || null, flowId || null, flowStep || null, campaignId || null, key,
     channel === "email" ? (msg.subject || null) : String(msg.body || "").slice(0, 160), status === "sent" ? "sending" : status, reason, JSON.stringify({ test: !!test })])).rows[0];
  if (!row || status !== "sent") return row || dup;
  // Tracked links and the open pixel are added only to messages that really go out.
  const T = require("./mk-analytics");
  if (channel === "email" && msg.html) msg = { ...msg, html: await T.instrumentEmail(msg.html, row, msg.campaign_name || null) };
  if (channel === "sms" && msg.body) msg = { ...msg, body: await T.instrumentSms(msg.body, row, msg.campaign_name || null) };
  // A connected sender would deliver here. None exists yet, so this branch is unreachable today (ready() is false).
  await db(`UPDATE mk_sends SET status='held', reason='sender not implemented' WHERE id=$1`, [row.id]);
  return { ...row, status: "held", reason: "sender not implemented" };
}

async function recent({ store, channel, limit = 100 }) {
  const a = [], w = [];
  if (store) { a.push(store); w.push(`store=$${a.length}`); }
  if (channel) { a.push(channel); w.push(`channel=$${a.length}`); }
  a.push(Math.min(Number(limit) || 100, 500));
  return (await db(`SELECT * FROM mk_sends ${w.length ? "WHERE " + w.join(" AND ") : ""} ORDER BY id DESC LIMIT $${a.length}`, a)).rows;
}

module.exports = { migrate, ready, senders, send, recent, inQuietHours };
