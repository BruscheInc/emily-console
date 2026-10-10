/* =============================================================================================
 *  Buzzin Marketing · SMS (Phase 6)
 *  Composing texts (personalization, brand name first, opt-out line, segment counting), keywords
 *  (STOP / HELP / JOIN), replies into Buzzin tickets, and the texting-provider connection (none yet).
 *  Every text goes through mk-send.js: held until a texting number is connected and sending is on.
 * ============================================================================================= */
const core = require("./core");
const { db } = core;
const MK = () => require("./mk-core");
const E = () => require("./mk-email");

const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";
/** How many SMS segments a message costs, and its encoding. */
function segments(text) {
  const t = String(text || "");
  const gsm = [...t].every((ch) => GSM.includes(ch) || GSM_EXT.includes(ch));
  if (gsm) { const len = [...t].reduce((a, ch) => a + (GSM_EXT.includes(ch) ? 2 : 1), 0); return { encoding: "GSM-7", chars: len, segments: len <= 160 ? 1 : Math.ceil(len / 153), per: len <= 160 ? 160 : 153 }; }
  const len = [...t].length; return { encoding: "Unicode", chars: len, segments: len <= 70 ? 1 : Math.ceil(len / 67), per: len <= 70 ? 70 : 67 };
}
const OPT_OUT = "Reply STOP to opt out";

async function compose(store, cfg, profile, extra = {}) {
  const ctx = await E().contextFor(store, profile, extra);
  let body = E().personalize(cfg.body || "", ctx, { html: false }).replace(/\s+\n/g, "\n").trim();
  const brand = MK().STORES[store] || "";
  if (cfg.brand_prefix !== false && brand && !body.toLowerCase().startsWith(brand.toLowerCase().split(" ")[0].toLowerCase())) body = `${brand}: ${body}`;
  if (cfg.add_opt_out !== false && !/\bSTOP\b/.test(body)) body = `${body} ${OPT_OUT}`;
  return body;
}

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS mk_sms_inbound (id BIGSERIAL PRIMARY KEY, store TEXT, from_phone TEXT, to_phone TEXT, body TEXT, keyword TEXT, profile_id BIGINT, ticket_id BIGINT, provider_id TEXT, at TIMESTAMPTZ DEFAULT now())`);
}

const KEYWORDS = { stop: ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"], help: ["HELP", "INFO"], join: ["JOIN", "START", "UNSTOP", "YES"] };
/** A text that came in (from the provider's webhook, once connected). Keywords change consent; anything else becomes a ticket. */
async function inbound(store, { from, to, body, providerId }) {
  const phone = MK().normPhone(from); const word = String(body || "").trim().toUpperCase();
  let prof = phone ? await MK().findProfile(store, { phone }) : null;
  if (!prof && phone) prof = await MK().upsertProfile(store, { phone }, "sms");
  let keyword = null, reply = null;
  const brand = MK().STORES[store];
  if (KEYWORDS.stop.includes(word)) { keyword = "stop"; if (prof) await MK().setConsent(prof, "sms", "unsubscribed", { source: "sms_keyword", detail: word }); reply = `${brand}: You're unsubscribed and won't get more texts. Reply START to resubscribe.`; }
  else if (KEYWORDS.help.includes(word)) { keyword = "help"; const b = await E().brand(store); reply = `${brand}: Help at ${b.sender.reply_to}. Msg & data rates may apply. Reply STOP to cancel.`; }
  else if (KEYWORDS.join.includes(word)) { keyword = "join"; if (prof) await MK().setConsent(prof, "sms", "subscribed", { source: "form:sms_keyword", detail: word, wording: `Texted ${word} to subscribe` }); reply = `${brand}: Thanks for joining! Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.`; }
  let ticketId = null;
  if (!keyword && String(body || "").trim()) {
    const def = require("./returns").STORE_DEFS[store];
    ticketId = (await db(`SELECT nextval('hd_local_ticket_seq')::bigint AS id`)).rows[0].id; const at = new Date().toISOString();
    const last = prof ? (await db(`SELECT subject FROM mk_sends WHERE profile_id=$1 AND channel='sms' ORDER BY id DESC LIMIT 1`, [prof.id])).rows[0] : null;
    const subject = `Text reply: ${String(body).replace(/\s+/g, " ").slice(0, 60)}`;
    await db(`INSERT INTO hd_tickets (id,source,subject,brand,mailbox,channel,status,customer_email,customer_name,tags,messages_count,created_at,updated_at,last_message_at,last_inbound_at) VALUES ($1,'sms',$2,$3,$4,'sms','open',$5,$6,$7,1,$8,$8,$8,$8)`,
      [ticketId, subject, core.brandForAddress(def.support) || def.name, def.support, prof && prof.email, prof ? [prof.first_name, prof.last_name].filter(Boolean).join(" ") || phone : phone, ["sms", "marketing-reply"], at]);
    await db(`INSERT INTO hd_messages (ticket_id,source,external_id,from_agent,internal,channel,sender_name,sender_email,to_emails,subject,body_text,at) VALUES ($1,'sms',$2,false,false,'sms',$3,$4,$5,$6,$7,$8)`,
      [ticketId, providerId || `sms:${ticketId}`, phone, prof && prof.email, [def.support], subject, `${body}${last ? `\n\n— Replying to our text —\n${last.subject}` : ""}`, at]);
    core.emitInbound(ticketId);
  }
  await db(`INSERT INTO mk_sms_inbound (store, from_phone, to_phone, body, keyword, profile_id, ticket_id, provider_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [store, phone, to || null, String(body || "").slice(0, 1600), keyword, prof && prof.id, ticketId, providerId || null]);
  return { keyword, reply, ticketId };
}

function routes(app, { guard, admin, actorOf, fail, store }) {
  app.post("/api/mk/sms/preview", async (req, res) => {
    if (!guard(req, res)) return;
    try { const b = req.body || {}; const s = store(b.store) || "lb"; const prof = { id: 0, first_name: "Maria", last_name: "Lopez", phone: "+15555550123", props: { last_sizes: ["3-6M"] } };
      const body = await compose(s, b, prof, { coupon: "WELCOME-8K2Q", checkout_url: "https://lrk.sp/c/x7Qa" }); res.json({ body, ...segments(body) }); } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/sms/test", async (req, res) => {
    if (!guard(req, res)) return;
    try { const b = req.body || {}; const s = store(b.store) || "lb"; const to = MK().normPhone(b.to); if (!to) return res.status(400).json({ error: "Enter a phone number from the internal test list" });
      const body = await compose(s, b, { id: 0, phone: to, first_name: "Test" }, { coupon: "TEST-CODE" });
      const row = await require("./mk-send").send({ store: s, channel: "sms", profile: { id: null, phone: to, sms_consent: "subscribed", timezone: "America/Chicago" }, msg: { body }, test: true, idem: `smstest:${to}:${Date.now()}` });
      res.json({ status: row.status, reason: row.reason }); } catch (e) { fail(res, e); }
  });
  app.get("/api/mk/sms/inbound", async (req, res) => { if (!guard(req, res)) return; try { res.json({ messages: (await db(`SELECT * FROM mk_sms_inbound ORDER BY id DESC LIMIT 100`)).rows }); } catch (e) { fail(res, e); } });
}

async function init() { await migrate(); }
module.exports = { init, migrate, routes, compose, segments, inbound, OPT_OUT, KEYWORDS };
