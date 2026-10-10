/* =============================================================================================
 *  Buzzin Marketing · Amazon SES (email sending + bounce/complaint reports)
 *
 *  Railway variables: AWS_SES_ACCESS_KEY_ID, AWS_SES_SECRET_ACCESS_KEY, AWS_SES_REGION (default us-east-2).
 *  The IAM user only needs the permissions listed in SES_POLICY below.
 *
 *  - status(): asks Amazon whether each store domain is verified and whether the account is out of the
 *    sandbox, and records it in emily_settings "mk_senders" (that's what mk-send.ready() reads).
 *  - setupEvents(): one click: configuration set "buzzin" → SNS topic "buzzin-ses-events" → Buzzin's
 *    /mk/ses/events address. Bounces, complaints, deliveries and rejects come back to Buzzin.
 *  - Permanent bounces and spam complaints mark the person "stopped" for email (never emailed again
 *    unless they sign up again through a form). Open/click tracking stays with Buzzin, not SES.
 * ============================================================================================= */
const crypto = require("crypto");
const core = require("./core");
const { db } = core;
const MK = () => require("./mk-core");
const E = () => require("./mk-email");

const REGION = () => process.env.AWS_SES_REGION || "us-east-2";
const CONFIG_SET = "buzzin";
const TOPIC = "buzzin-ses-events";
const PUBLIC_URL = () => (process.env.PUBLIC_URL || "https://emily-console-production.up.railway.app").replace(/\/$/, "");
const configured = () => !!(process.env.AWS_SES_ACCESS_KEY_ID && process.env.AWS_SES_SECRET_ACCESS_KEY);
const creds = () => ({ region: REGION(), credentials: { accessKeyId: process.env.AWS_SES_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SES_SECRET_ACCESS_KEY } });
let _ses = null, _sns = null;
const ses = () => { const S = require("@aws-sdk/client-sesv2"); _ses = _ses || new S.SESv2Client(creds()); return { c: _ses, S }; };
const sns = () => { const N = require("@aws-sdk/client-sns"); _sns = _sns || new N.SNSClient(creds()); return { c: _sns, N }; };
const need = () => { if (!configured()) throw Object.assign(new Error("Amazon SES isn't connected: add AWS_SES_ACCESS_KEY_ID and AWS_SES_SECRET_ACCESS_KEY in Railway."), { status: 400 }); };

const SES_POLICY = {
  Version: "2012-10-17",
  Statement: [
    { Effect: "Allow", Action: ["ses:SendEmail", "ses:SendRawEmail", "ses:GetAccount", "ses:GetEmailIdentity", "ses:ListEmailIdentities",
      "ses:CreateConfigurationSet", "ses:GetConfigurationSet", "ses:CreateConfigurationSetEventDestination", "ses:GetConfigurationSetEventDestinations"], Resource: "*" },
    { Effect: "Allow", Action: ["sns:CreateTopic", "sns:GetTopicAttributes", "sns:SetTopicAttributes", "sns:Subscribe", "sns:ListSubscriptionsByTopic"], Resource: "arn:aws:sns:*:*:buzzin-ses-events" },
  ],
};

/* ---------------- status ---------------- */
async function status() {
  need();
  const { c, S } = ses();
  const acct = await c.send(new S.GetAccountCommand({}));
  const brands = { lb: await E().brand("lb"), lbo: await E().brand("lbo") };
  const out = { region: REGION(), production: !!acct.ProductionAccessEnabled, sending_enabled: acct.SendingEnabled !== false,
    quota: acct.SendQuota ? { per_day: acct.SendQuota.Max24HourSend, per_second: acct.SendQuota.MaxSendRate, sent_24h: acct.SendQuota.SentLast24Hours } : null,
    review: acct.Details && acct.Details.ReviewDetails ? acct.Details.ReviewDetails.Status : null, stores: {} };
  for (const st of ["lb", "lbo"]) {
    const domain = brands[st].sender.domain;
    let id = null;
    try { id = await c.send(new S.GetEmailIdentityCommand({ EmailIdentity: domain })); } catch (e) { if (!/NotFound/i.test(e.name || e.message)) throw e; }
    out.stores[st] = { domain, from: `${brands[st].sender.from_name} <${brands[st].sender.from_local}@${domain}>`, exists: !!id,
      verified: !!(id && id.VerifiedForSendingStatus), dkim: id && id.DkimAttributes ? id.DkimAttributes.Status : null,
      mail_from: id && id.MailFromAttributes ? id.MailFromAttributes.MailFromDomainStatus : null };
  }
  // what mk-send reads: test sends need a verified domain; real sends also need production access
  const cur = (await core.setting("mk_senders", null)) || {};
  for (const st of ["lb", "lbo"]) { cur[st] = cur[st] || {}; cur[st].email = { ...(cur[st].email || {}), provider: "ses", test_ok: out.stores[st].verified, verified: out.stores[st].verified && out.production && out.sending_enabled, checked_at: new Date().toISOString() }; }
  await db(`INSERT INTO emily_settings (key, value, updated_by, updated_at) VALUES ('mk_senders',$1,'ses status',now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify(cur)]);
  out.events = await eventsState().catch((e) => ({ error: e.message }));
  return out;
}

/* ---------------- bounce / complaint reports ---------------- */
async function eventsState() {
  const { c, S } = ses();
  let set = null; try { set = await c.send(new S.GetConfigurationSetCommand({ ConfigurationSetName: CONFIG_SET })); } catch (_) {}
  if (!set) return { config_set: false };
  const d = await c.send(new S.GetConfigurationSetEventDestinationsCommand({ ConfigurationSetName: CONFIG_SET }));
  const dest = (d.EventDestinations || []).find((x) => x.SnsDestination);
  const st = (await core.setting("mk_ses_events", null)) || {};
  return { config_set: true, destination: !!dest, topic: dest ? dest.SnsDestination.TopicArn : null, subscribed: !!st.confirmed_at, confirmed_at: st.confirmed_at || null };
}
async function setupEvents(who) {
  need();
  const { c, S } = ses(); const { c: n, N } = sns();
  try { await c.send(new S.CreateConfigurationSetCommand({ ConfigurationSetName: CONFIG_SET, SendingOptions: { SendingEnabled: true }, ReputationOptions: { ReputationMetricsEnabled: true } })); }
  catch (e) { if (!/AlreadyExists/i.test(e.name || e.message)) throw e; }
  const topic = await n.send(new N.CreateTopicCommand({ Name: TOPIC }));
  const arn = topic.TopicArn, account = arn.split(":")[4];
  await n.send(new N.SetTopicAttributesCommand({ TopicArn: arn, AttributeName: "Policy", AttributeValue: JSON.stringify({ Version: "2012-10-17", Statement: [{ Sid: "ses-publish", Effect: "Allow", Principal: { Service: "ses.amazonaws.com" }, Action: "SNS:Publish", Resource: arn, Condition: { StringEquals: { "AWS:SourceAccount": account } } }] }) }));
  const endpoint = `${PUBLIC_URL()}/mk/ses/events`;
  const subs = await n.send(new N.ListSubscriptionsByTopicCommand({ TopicArn: arn }));
  if (!(subs.Subscriptions || []).some((x) => x.Endpoint === endpoint)) await n.send(new N.SubscribeCommand({ TopicArn: arn, Protocol: "https", Endpoint: endpoint }));
  try { await c.send(new S.CreateConfigurationSetEventDestinationCommand({ ConfigurationSetName: CONFIG_SET, EventDestinationName: "buzzin-sns",
    EventDestination: { Enabled: true, MatchingEventTypes: ["BOUNCE", "COMPLAINT", "DELIVERY", "REJECT", "RENDERING_FAILURE", "DELIVERY_DELAY"], SnsDestination: { TopicArn: arn } } })); }
  catch (e) { if (!/AlreadyExists/i.test(e.name || e.message)) throw e; }
  await saveEvents({ topic: arn, endpoint, set_up_by: who, set_up_at: new Date().toISOString() });
  await core.audit({ kind: "ses-events", detail: `SES reports → ${endpoint}`, who: who || "staff" }).catch(() => {});
  return eventsState();
}
async function saveEvents(patch) {
  const cur = (await core.setting("mk_ses_events", null)) || {};
  await db(`INSERT INTO emily_settings (key, value, updated_by, updated_at) VALUES ('mk_ses_events',$1,'ses',now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify({ ...cur, ...patch })]);
}

/* SNS messages are signed by Amazon; anything that fails the check is ignored. */
const certCache = new Map();
async function verifySns(m) {
  const url = String(m.SigningCertURL || m.SigningCertUrl || "");
  if (!/^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\/[^?#]+\.pem$/i.test(url)) return false;
  let pem = certCache.get(url);
  if (!pem) { const r = await fetch(url); if (!r.ok) return false; pem = await r.text(); certCache.set(url, pem); }
  const keys = m.Type === "Notification" ? ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"] : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  const str = keys.filter((k) => m[k] !== undefined && m[k] !== null).map((k) => `${k}\n${m[k]}\n`).join("");
  try { return crypto.verify(m.SignatureVersion === "2" ? "sha256" : "sha1", Buffer.from(str, "utf8"), pem, Buffer.from(m.Signature, "base64")); } catch (_) { return false; }
}
async function onEvent(ev) {
  const type = String(ev.eventType || ev.notificationType || "").toLowerCase();
  const mid = ev.mail && ev.mail.messageId; if (!mid) return;
  const send = (await db(`SELECT * FROM mk_sends WHERE provider_id=$1 AND channel='email'`, [mid])).rows[0];
  if (!send) return;
  const map = { bounce: "bounced", complaint: "complained", delivery: "delivered", reject: "rejected", "rendering failure": "failed", renderingfailure: "failed", deliverydelay: "delayed", "delivery delay": "delayed" };
  const t = map[type] || type;
  const meta = t === "bounced" ? { kind: ev.bounce && ev.bounce.bounceType, sub: ev.bounce && ev.bounce.bounceSubType } : t === "complained" ? { kind: ev.complaint && ev.complaint.complaintFeedbackType } : {};
  await db(`INSERT INTO mk_send_events (send_id, type, meta) VALUES ($1,$2,$3)`, [send.id, t, JSON.stringify(meta)]);
  if (t === "delivered") await db(`UPDATE mk_sends SET status='sent', meta = meta || '{"delivered":true}'::jsonb WHERE id=$1`, [send.id]);
  if (t === "rejected" || t === "failed") await db(`UPDATE mk_sends SET status='failed', reason=$2 WHERE id=$1`, [send.id, t]);
  // permanent bounce or spam complaint → never email again (unless they sign up again through a form)
  if ((t === "bounced" && meta.kind === "Permanent") || t === "complained") {
    const p = send.profile_id ? (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [send.profile_id])).rows[0] : null;
    if (p) await MK().setConsent(p, "email", "stopped", { source: t === "complained" ? "complaint" : "bounce", detail: `${meta.kind || ""} ${meta.sub || ""}`.trim() || t });
    if (t === "complained" && p) await MK().track(send.store, "unsubscribed", { profileId: p.id, props: { reason: "spam complaint", send_id: String(send.id) }, source: "ses", extId: `complaint:${send.id}` });
  }
}

/* ---------------- sending ---------------- */
async function sendEmail({ store, to, msg, sendId }) {
  need();
  const b = await E().brand(store);
  const { c, S } = ses();
  const headers = [];
  if (msg.unsubscribe_url) { headers.push({ Name: "List-Unsubscribe", Value: `<${msg.unsubscribe_url}>` }); headers.push({ Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" }); }
  const r = await c.send(new S.SendEmailCommand({
    FromEmailAddress: `"${String(b.sender.from_name).replace(/"/g, "")}" <${b.sender.from_local}@${b.sender.domain}>`,
    ReplyToAddresses: b.sender.reply_to ? [b.sender.reply_to] : undefined,
    Destination: { ToAddresses: [to] },
    ConfigurationSetName: CONFIG_SET,
    EmailTags: [{ Name: "store", Value: store }, { Name: "send_id", Value: String(sendId || 0) }],
    Content: { Simple: { Subject: { Data: msg.subject || "", Charset: "UTF-8" }, Body: { Html: { Data: msg.html || "", Charset: "UTF-8" }, Text: { Data: msg.text || "", Charset: "UTF-8" } }, Headers: headers.length ? headers : undefined } },
  }));
  return r.MessageId;
}

/* ---------------- routes ---------------- */
function routes(app, { guard, admin, actorOf, fail }) {
  const express = require("express");
  app.get("/api/mk/ses/status", async (req, res) => { if (!admin(req, res)) return; try { res.json({ connected: configured(), policy: SES_POLICY, ...(configured() ? await status() : {}) }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/ses/setup-events", async (req, res) => { if (!admin(req, res)) return; try { res.json(await setupEvents(actorOf(req))); } catch (e) { fail(res, e); } });
  // Amazon SNS → Buzzin. Public, but only signed Amazon messages for our own topic are acted on.
  app.post("/mk/ses/events", express.text({ type: () => true, limit: "1mb" }), async (req, res) => {
    res.status(200).end();
    try {
      const m = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (!String(m.TopicArn || "").endsWith(":" + TOPIC)) return;
      if (!(await verifySns(m))) { console.error("SES events: bad signature, ignored"); return; }
      if (m.Type === "SubscriptionConfirmation") {
        if (!/^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//i.test(m.SubscribeURL || "")) return;
        const r = await fetch(m.SubscribeURL); if (r.ok) { await saveEvents({ confirmed_at: new Date().toISOString(), topic: m.TopicArn }); console.log("📬 SES reports connected (bounces, complaints, deliveries)"); }
        return;
      }
      if (m.Type === "Notification") await onEvent(JSON.parse(m.Message || "{}"));
    } catch (e) { console.error("SES events:", e.message); }
  });
}

async function init() {
  if (!configured()) return;
  try { const s = await status(); console.log(`📧 Amazon SES: ${s.production ? "production" : "sandbox (200/day, verified recipients only)"} · ${Object.entries(s.stores).map(([k, v]) => `${k.toUpperCase()} ${v.domain} ${v.verified ? "verified" : v.exists ? "not verified yet" : "not added"}`).join(" · ")} · reports ${s.events && s.events.subscribed ? "on" : "not set up"}`); }
  catch (e) { console.error("Amazon SES check:", e.message); }
  setInterval(() => status().catch(() => {}), 6 * 3600e3);
}

module.exports = { init, routes, status, setupEvents, sendEmail, onEvent, verifySns, configured, SES_POLICY };
