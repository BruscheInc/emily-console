/* =============================================================================================
 *  Buzzin Marketing · texting through Amazon (AWS End User Messaging SMS)
 *
 *  Uses the same Amazon login as email (AWS_SES_ACCESS_KEY_ID / AWS_SES_SECRET_ACCESS_KEY, region
 *  AWS_SES_REGION). That login needs the extra permissions in SMS_POLICY.
 *  - status(): the toll-free number, its registration, sandbox or production, and the monthly limit.
 *    Records what mk-send needs in emily_settings "mk_senders" (texts only go out once the number is
 *    active, the registration is approved and the account is out of the sandbox).
 *  - setup(): one click: SNS topic "buzzin-sms-events" → Buzzin; turns on two-way texting for the
 *    number (replies come back), delivery reports, and copies Buzzin's STOP / HELP / JOIN replies
 *    onto the number so Amazon answers keywords with our wording.
 *  - Replies: STOP/HELP/JOIN change consent; anything else becomes a Buzzin ticket (mk-sms.inbound).
 * ============================================================================================= */
const core = require("./core");
const { db } = core;
const MK = () => require("./mk-core");

const REGION = () => process.env.AWS_SES_REGION || process.env.AWS_REGION || "us-east-2";
const KEY = () => process.env.AWS_SES_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
const SECRET = () => process.env.AWS_SES_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
const configured = () => !!(KEY() && SECRET());
const TOPIC = "buzzin-sms-events";
const CONFIG_SET = "buzzin-sms";
const PUBLIC_URL = () => (process.env.PUBLIC_URL || "https://emily-console-production.up.railway.app").replace(/\/$/, "");
let _c = null, _n = null;
const sms = () => { const M = require("@aws-sdk/client-pinpoint-sms-voice-v2"); _c = _c || new M.PinpointSMSVoiceV2Client({ region: REGION(), credentials: { accessKeyId: KEY(), secretAccessKey: SECRET() } }); return { c: _c, M }; };
const sns = () => { const N = require("@aws-sdk/client-sns"); _n = _n || new N.SNSClient({ region: REGION(), credentials: { accessKeyId: KEY(), secretAccessKey: SECRET() } }); return { c: _n, N }; };
const need = () => { if (!configured()) throw Object.assign(new Error("Amazon isn't connected: the AWS keys aren't set in Railway."), { status: 400 }); };

const SMS_POLICY = {
  Version: "2012-10-17",
  Statement: [
    { Effect: "Allow", Action: ["sms-voice:SendTextMessage", "sms-voice:DescribePhoneNumbers", "sms-voice:DescribeRegistrations", "sms-voice:DescribeSpendLimits",
      "sms-voice:DescribeAccountAttributes", "sms-voice:UpdatePhoneNumber", "sms-voice:PutKeyword", "sms-voice:DescribeKeywords",
      "sms-voice:CreateConfigurationSet", "sms-voice:DescribeConfigurationSets", "sms-voice:CreateEventDestination"], Resource: "*" },
    { Effect: "Allow", Action: ["sns:CreateTopic", "sns:GetTopicAttributes", "sns:SetTopicAttributes", "sns:Subscribe", "sns:ListSubscriptionsByTopic"], Resource: "arn:aws:sns:*:*:buzzin-sms-events" },
  ],
};

async function setting(key) { return (await core.setting(key, null)) || {}; }
async function saveSetting(key, value) { await db(`INSERT INTO emily_settings (key, value, updated_by, updated_at) VALUES ($1,$2,'sms aws',now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [key, JSON.stringify(value)]); }

/* ---------------- status ---------------- */
async function numbers() {
  const { c, M } = sms(); const out = []; let NextToken;
  do { const r = await c.send(new M.DescribePhoneNumbersCommand({ NextToken })); out.push(...(r.PhoneNumbers || [])); NextToken = r.NextToken; } while (NextToken);
  return out.filter((n) => n.IsoCountryCode === "US" && (n.NumberCapabilities || []).includes("SMS"));
}
async function status() {
  need();
  const { c, M } = sms();
  const attrs = (await c.send(new M.DescribeAccountAttributesCommand({}))).AccountAttributes || [];
  const tier = (attrs.find((a) => a.Name === "ACCOUNT_TIER") || {}).Value || "UNKNOWN";
  const limits = (await c.send(new M.DescribeSpendLimitsCommand({}))).SpendLimits || [];
  const text = limits.find((l) => l.Name === "TEXT_MESSAGE_MONTHLY_SPEND_LIMIT") || {};
  const nums = await numbers();
  const regIds = [...new Set(nums.map((n) => n.RegistrationId).filter(Boolean))];
  let regs = [];
  if (regIds.length) regs = (await c.send(new M.DescribeRegistrationsCommand({ RegistrationIds: regIds }))).Registrations || [];
  const cfg = await setting("mk_sms_aws");
  const list = nums.map((n) => { const r = regs.find((x) => x.RegistrationId === n.RegistrationId); return { id: n.PhoneNumberId, arn: n.PhoneNumberArn, phone: n.PhoneNumber, type: n.NumberType, status: n.Status, two_way: !!n.TwoWayEnabled, two_way_buzzin: !!(cfg.topic && n.TwoWayChannelArn === cfg.topic), registration: r ? r.RegistrationStatus : (n.RegistrationId ? "UNKNOWN" : null), store: (cfg.stores || {})[n.PhoneNumberId] || null }; });
  // A single number belongs to Larkspur Baby until someone says otherwise.
  if (list.length && !list.some((x) => x.store)) list[0].store = "lb";
  const production = tier === "PRODUCTION";
  const senders = await setting("mk_senders");
  for (const st of ["lb", "lbo"]) {
    const n = list.find((x) => x.store === st);
    senders[st] = senders[st] || {};
    senders[st].sms = n ? { provider: "aws", phone: n.phone, phone_id: n.id, test_ok: n.status === "ACTIVE", verified: n.status === "ACTIVE" && ["COMPLETE", "APPROVED"].includes(n.registration) && production, checked_at: new Date().toISOString() } : { ...(senders[st].sms || {}), provider: "aws", verified: false, test_ok: false };
  }
  await saveSetting("mk_senders", senders);
  // keep the Texting page's number card in step
  const smsCfg = await setting("mk_sms");
  for (const st of ["lb", "lbo"]) { const n = list.find((x) => x.store === st); if (!n) continue; smsCfg[st] = smsCfg[st] || {}; smsCfg[st].number = { provider: "aws", phone: n.phone, type: "toll_free", status: ["COMPLETE", "APPROVED"].includes(n.registration) ? "approved" : n.registration === "DENIED" || n.registration === "REQUIRES_UPDATES" ? "rejected" : "pending" }; }
  await saveSetting("mk_sms", smsCfg);
  return { connected: true, region: REGION(), tier, production, monthly_limit: text.EnforcedLimit != null ? text.EnforcedLimit : null, numbers: list, reports: { set_up: !!cfg.topic, confirmed: !!cfg.confirmed_at } };
}

/* ---------------- one-click setup: replies + delivery reports + keyword wording ---------------- */
async function setup(who) {
  need();
  const { c, M } = sms(); const { c: n, N } = sns();
  const topic = (await n.send(new N.CreateTopicCommand({ Name: TOPIC }))).TopicArn;
  const account = topic.split(":")[4];
  await n.send(new N.SetTopicAttributesCommand({ TopicArn: topic, AttributeName: "Policy", AttributeValue: JSON.stringify({ Version: "2012-10-17", Statement: [{ Sid: "sms-voice-publish", Effect: "Allow", Principal: { Service: "sms-voice.amazonaws.com" }, Action: "SNS:Publish", Resource: topic, Condition: { StringEquals: { "aws:SourceAccount": account } } }] }) }));
  const endpoint = `${PUBLIC_URL()}/mk/sms/aws/events`;
  const subs = await n.send(new N.ListSubscriptionsByTopicCommand({ TopicArn: topic }));
  if (!(subs.Subscriptions || []).some((x) => x.Endpoint === endpoint)) await n.send(new N.SubscribeCommand({ TopicArn: topic, Protocol: "https", Endpoint: endpoint }));
  try { await c.send(new M.CreateConfigurationSetCommand({ ConfigurationSetName: CONFIG_SET })); } catch (e) { if (!/Conflict|AlreadyExists/i.test(e.name || e.message)) throw e; }
  try { await c.send(new M.CreateEventDestinationCommand({ ConfigurationSetName: CONFIG_SET, EventDestinationName: "buzzin-sns", MatchingEventTypes: ["TEXT_ALL"], SnsDestination: { TopicArn: topic } })); } catch (e) { if (!/Conflict|AlreadyExists/i.test(e.name || e.message)) throw e; }
  const cfg = await setting("mk_sms_aws");
  await saveSetting("mk_sms_aws", { ...cfg, topic, endpoint, set_up_by: who, set_up_at: new Date().toISOString() });
  const done = [];
  for (const num of await numbers()) {
    if (num.Status !== "ACTIVE") continue;
    await c.send(new M.UpdatePhoneNumberCommand({ PhoneNumberId: num.PhoneNumberId, TwoWayEnabled: true, TwoWayChannelArn: topic }));
    done.push(num.PhoneNumber);
  }
  await syncKeywords();
  await core.audit({ kind: "sms-setup", detail: `Amazon texting: replies + delivery reports → ${endpoint}${done.length ? ` · two-way on ${done.join(", ")}` : " · no active number yet"}`, who: who || "staff" }).catch(() => {});
  return { topic, two_way: done, ...(await status()) };
}
/** Put Buzzin's STOP / HELP / JOIN wording on each active number, so Amazon's automatic keyword replies match. */
async function syncKeywords() {
  const { c, M } = sms(); const SMS = require("./mk-sms"); const E = require("./mk-email");
  const cfg = await setting("mk_sms_aws"); const synced = [];
  for (const num of await numbers()) {
    if (num.Status !== "ACTIVE") continue;
    const st = (cfg.stores || {})[num.PhoneNumberId] || "lb";
    const s = await SMS.smsSettings(st); const b = await E.brand(st);
    const fill = (t) => String(t).replace(/\{\{\s*brand\s*\}\}/g, s.brand_name).replace(/\{\{\s*reply_to\s*\}\}/g, (b.sender && b.sender.reply_to) || "");
    for (const [kw, action, text] of [["STOP", "OPT_OUT", s.replies.stop], ["HELP", "AUTOMATIC_RESPONSE", s.replies.help], ["JOIN", "OPT_IN", s.replies.join], ["START", "OPT_IN", s.replies.join]]) {
      await c.send(new M.PutKeywordCommand({ OriginationIdentity: num.PhoneNumberId, Keyword: kw, KeywordMessage: fill(text).slice(0, 1600), KeywordAction: action }));
    }
    synced.push(num.PhoneNumber);
  }
  return synced;
}

/* ---------------- sending ---------------- */
async function send({ store, to, body, sendId }) {
  need();
  const senders = await setting("mk_senders");
  const s = senders[store] && senders[store].sms;
  if (!s || !s.phone_id) throw new Error("No Amazon texting number for this store.");
  const { c, M } = sms();
  const r = await c.send(new M.SendTextMessageCommand({ DestinationPhoneNumber: to, OriginationIdentity: s.phone_id, MessageBody: body, MessageType: "PROMOTIONAL", ConfigurationSetName: CONFIG_SET, Context: { store, send_id: String(sendId || 0) } }));
  return r.MessageId;
}

/* ---------------- replies and delivery reports (SNS → Buzzin) ---------------- */
async function storeForNumber(dest) {
  const senders = await setting("mk_senders");
  for (const st of ["lb", "lbo"]) if (senders[st] && senders[st].sms && senders[st].sms.phone === dest) return st;
  return "lb";
}
async function onMessage(m) {
  if (m.originationNumber && m.messageBody != null) {   // a text someone sent us
    const store = await storeForNumber(m.destinationNumber);
    return require("./mk-sms").inbound(store, { from: m.originationNumber, to: m.destinationNumber, body: m.messageBody, providerId: m.inboundMessageId });
  }
  const type = String(m.eventType || "").toUpperCase(), mid = m.messageId;
  if (!mid || !type.startsWith("TEXT_")) return;
  const send = (await db(`SELECT * FROM mk_sends WHERE provider_id=$1 AND channel='sms'`, [mid])).rows[0];
  if (!send) return;
  const t = ["TEXT_DELIVERED", "TEXT_SUCCESSFUL"].includes(type) ? "delivered" : ["TEXT_QUEUED", "TEXT_PENDING", "TEXT_SENT"].includes(type) ? null : "failed";
  if (!t) return;
  await db(`INSERT INTO mk_send_events (send_id, type, meta) VALUES ($1,$2,$3)`, [send.id, t, JSON.stringify({ status: type, reason: m.messageStatusDescription || null })]);
  if (t === "delivered") await db(`UPDATE mk_sends SET status='sent', meta = meta || '{"delivered":true}'::jsonb WHERE id=$1`, [send.id]);
  else await db(`UPDATE mk_sends SET status='failed', reason=$2 WHERE id=$1`, [send.id, type.toLowerCase()]);
}

function routes(app, { admin, actorOf, fail }) {
  const express = require("express");
  app.get("/api/mk/sms/aws/status", async (req, res) => { if (!admin(req, res)) return; try { res.json(configured() ? { policy: SMS_POLICY, ...(await status()) } : { connected: false, policy: SMS_POLICY }); } catch (e) { res.json({ connected: true, error: e.message, policy: SMS_POLICY }); } });
  app.post("/api/mk/sms/aws/setup", async (req, res) => { if (!admin(req, res)) return; try { res.json(await setup(actorOf(req))); } catch (e) { fail(res, e); } });
  app.post("/api/mk/sms/aws/keywords", async (req, res) => { if (!admin(req, res)) return; try { res.json({ synced: await syncKeywords() }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/sms/aws/assign", async (req, res) => {
    if (!admin(req, res)) return;
    try { const b = req.body || {}; if (!["lb", "lbo"].includes(b.store)) return res.status(400).json({ error: "store lb|lbo" });
      const cfg = await setting("mk_sms_aws"); cfg.stores = { ...(cfg.stores || {}), [b.phone_id]: b.store }; await saveSetting("mk_sms_aws", cfg); res.json(await status()); } catch (e) { fail(res, e); }
  });
  app.post("/mk/sms/aws/events", express.text({ type: () => true, limit: "1mb" }), async (req, res) => {
    res.status(200).end();
    try {
      const m = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (!String(m.TopicArn || "").endsWith(":" + TOPIC)) return;
      if (!(await require("./mk-ses").verifySns(m))) { console.error("SMS events: bad signature, ignored"); return; }
      if (m.Type === "SubscriptionConfirmation") {
        if (!/^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//i.test(m.SubscribeURL || "")) return;
        const r = await fetch(m.SubscribeURL);
        if (r.ok) { const cfg = await setting("mk_sms_aws"); await saveSetting("mk_sms_aws", { ...cfg, confirmed_at: new Date().toISOString() }); console.log("📱 Amazon texting: replies and delivery reports connected"); }
        return;
      }
      if (m.Type === "Notification") await onMessage(JSON.parse(m.Message || "{}"));
    } catch (e) { console.error("SMS events:", e.message); }
  });
}

async function init() {
  if (!configured()) return;
  try { const s = await status(); console.log(`📱 Amazon texting: ${s.tier.toLowerCase()} · ${s.numbers.length ? s.numbers.map((n) => `${n.phone} ${n.status.toLowerCase()} (registration ${String(n.registration || "none").toLowerCase()})`).join(" · ") : "no number yet"} · limit $${s.monthly_limit}/mo`); }
  catch (e) { console.log(`📱 Amazon texting: not ready (${e.name || "error"}: ${String(e.message).slice(0, 120)})`); }
  setInterval(() => status().catch(() => {}), 3 * 3600e3);
}

module.exports = { init, routes, status, setup, syncKeywords, send, onMessage, configured, SMS_POLICY };
