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

/* Per-store texting settings: the name texts start with, the opt-out line, keyword replies, the number (once approved). */
const DEFAULT_SMS = (store) => {
  const brand = MK().STORES[store] || "Larkspur Baby";
  return { brand_name: store === "lbo" ? "Larkspur Outlet" : brand, opt_out: OPT_OUT,
    replies: { stop: "{{ brand }}: You're unsubscribed and won't get more texts. Reply START to resubscribe.",
               help: "{{ brand }}: Help at {{ reply_to }}. Msg & data rates may apply. Reply STOP to cancel.",
               join: "{{ brand }}: Thanks for joining! Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel." },
    number: { provider: null, phone: null, type: "toll_free", status: "not_started" }, cost_per_segment: null };
};
async function smsSettings(store) {
  const all = (await core.setting("mk_sms", null)) || {};
  const d = DEFAULT_SMS(store), v = all[store] || {};
  return { ...d, ...v, replies: { ...d.replies, ...(v.replies || {}) }, number: { ...d.number, ...(v.number || {}) } };
}
/** What a segment really costs, from AWS's delivery reports over the last 90 days (price + carrier fee ÷ segments). Null until reports come in. */
async function actualRate(store) {
  const r = (await db(`SELECT count(*)::int n, sum((meta->>'price')::float + COALESCE((meta->>'carrier_fee')::float,0))::float cost, sum(COALESCE((meta->>'parts')::int,1))::int parts
    FROM mk_sends WHERE store=$1 AND channel='sms' AND meta ? 'price' AND created_at > now() - interval '90 days'`, [store])).rows[0];
  return r && r.n && r.parts ? { per_segment: Math.round((r.cost / r.parts) * 1e5) / 1e5, texts: r.n, spent: Math.round(r.cost * 100) / 100 } : null;
}
/** The price used for estimates: AWS's real one when there are reports, otherwise the one typed in Texting. */
async function rateFor(store) { const a = await actualRate(store); if (a) return { per_segment: a.per_segment, source: "aws", texts: a.texts }; const s = await smsSettings(store); return s.cost_per_segment == null ? { per_segment: DEFAULT_RATE, source: "default" } : { per_segment: Number(s.cost_per_segment), source: "manual" }; }
/** AWS US toll-free list price per segment (about $0.0065 base + carrier fee up to $0.003), rounded up so estimates don't come in low. Used only until AWS reports real prices. */
const DEFAULT_RATE = 0.0095;
/** Texting spend so far this calendar month (UTC, the way AWS counts its limit), both stores: AWS's real price where it has reported, otherwise segments × price. */
async function monthSpend() {
  const rate = (await rateFor("lb")).per_segment;
  const r = (await db(`SELECT count(*)::int n, COALESCE(sum(CASE WHEN meta ? 'price' THEN (meta->>'price')::float + COALESCE((meta->>'carrier_fee')::float,0)
      ELSE COALESCE((meta->>'segments')::int,1) * $1::float END),0)::float cost FROM mk_sends WHERE channel='sms' AND status IN ('sent','sending') AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, [rate])).rows[0];
  return { texts: r.n, spent: Math.round(r.cost * 100) / 100 };
}
let LIMIT_CACHE = { at: 0, v: null };
/** AWS's monthly texting limit (the $50 cap until AWS raises it). Null when AWS can't be reached. */
async function monthlyLimit() {
  if (Date.now() - LIMIT_CACHE.at < 10 * 60e3) return LIMIT_CACHE.v;
  let v = null; try { const A = require("./mk-sms-aws"); if (A.configured()) v = (await A.status()).monthly_limit; } catch (_) {}
  LIMIT_CACHE = { at: Date.now(), v: v == null ? null : Number(v) }; return LIMIT_CACHE.v;
}
/** Does a send of this cost fit under the AWS limit? When it doesn't, about how many texts would go out before AWS stops. */
async function budget(total, perText, startAt) {
  const limit = await monthlyLimit(); if (limit == null) return null;
  const now = new Date(), start = startAt ? new Date(startAt) : now;
  const sameMonth = start.getUTCFullYear() === now.getUTCFullYear() && start.getUTCMonth() === now.getUTCMonth();
  const m = sameMonth ? await monthSpend() : { spent: 0, texts: 0 };
  const left = Math.max(0, Math.round((limit - m.spent) * 100) / 100);
  const over = total != null && total > left;
  return { limit, spent: m.spent, left, next_month: !sameMonth, over, over_by: over ? Math.round((total - left) * 100) / 100 : 0, fits_texts: over && perText ? Math.floor(left / perText) : null };
}
async function saveSmsSettings(store, patch, who) {
  const all = (await core.setting("mk_sms", null)) || {};
  const cur = await smsSettings(store);
  const next = { ...cur, brand_name: String(patch.brand_name || cur.brand_name).slice(0, 30), opt_out: String(patch.opt_out || cur.opt_out).slice(0, 60),
    replies: { ...cur.replies, ...Object.fromEntries(Object.entries(patch.replies || {}).filter(([k]) => ["stop", "help", "join"].includes(k)).map(([k, v]) => [k, String(v).slice(0, 320)])) },
    cost_per_segment: patch.cost_per_segment === "" || patch.cost_per_segment == null ? cur.cost_per_segment : Math.max(0, Number(patch.cost_per_segment) || 0),
    number: cur.number }; // the number is set when a provider is connected, not by hand
  if (!/stop/i.test(next.opt_out)) throw new Error("The opt-out line has to tell people they can reply STOP.");
  all[store] = next;
  await db(`INSERT INTO emily_settings (key, value, updated_by, updated_at) VALUES ('mk_sms',$1,$2,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [JSON.stringify(all), who || null]);
  return next;
}

async function compose(store, cfg, profile, extra = {}) {
  const st = await smsSettings(store);
  const ctx = await E().contextFor(store, profile, extra);
  let body = E().personalize(cfg.body || "", ctx, { html: false }).replace(/\s+\n/g, "\n").trim();
  const brand = st.brand_name || MK().STORES[store] || "";
  if (cfg.brand_prefix !== false && brand && !body.toLowerCase().startsWith(brand.toLowerCase().split(" ")[0].toLowerCase())) body = `${brand}: ${body}`;
  if (cfg.add_opt_out !== false && !/\bSTOP\b/.test(body)) body = `${body} ${st.opt_out || OPT_OUT}`;
  return plainPunct(body);
}
/** Curly quotes, long dashes and "…" make a text Unicode (70-character segments, so it costs about double). Plain versions look the same on a phone. */
const plainPunct = (t) => String(t).replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"').replace(/[–—―]/g, "-").replace(/…/g, "...").replace(/[\u00a0\u2009\u200a\u202f]/g, " ").replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "");

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
  const st = await smsSettings(store); const b = await E().brand(store);
  const fill = (t) => String(t).replace(/\{\{\s*brand\s*\}\}/g, st.brand_name).replace(/\{\{\s*reply_to\s*\}\}/g, (b.sender && b.sender.reply_to) || "");
  if (KEYWORDS.stop.includes(word)) { keyword = "stop"; if (prof) await MK().setConsent(prof, "sms", "unsubscribed", { source: "sms_keyword", detail: word }); reply = fill(st.replies.stop); }
  else if (KEYWORDS.help.includes(word)) { keyword = "help"; reply = fill(st.replies.help); }
  else if (KEYWORDS.join.includes(word)) { keyword = "join"; if (prof) await MK().setConsent(prof, "sms", "subscribed", { source: "form:sms_keyword", detail: word, wording: `Texted ${word} to subscribe` }); reply = fill(st.replies.join); }
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
    try { const b = req.body || {}; const s = store(b.store) || "lb"; let prof = null; if (b.profile_id) prof = (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [Number(b.profile_id)])).rows[0];
      if (!prof) prof = { id: 0, first_name: "Maria", last_name: "Lopez", phone: "+15555550123", props: { last_sizes: ["3-6M"] } };
      // Cart texts show a real recent checkout link, so the link in the preview opens.
      const cart = /checkout_url|CheckoutURL|line_items|event\./.test(String(b.body || "")) ? await E().sampleCart(s, prof.id ? prof : null) : {};
      if (cart.items && !cart.checkout_url) cart.checkout_url = `${String((await E().brand(s)).shop_url || "").replace(/\/$/, "")}/cart`;
      let body = await compose(s, b, prof, { coupon: "WELCOME-8K2Q", ...cart });
      // Sent texts carry a short link in place of the long one; the preview shows (and opens) the same kind of link.
      const A = require("./mk-analytics"); const urls = [...new Set(body.match(/https?:\/\/[^\s]+/g) || [])];
      for (const u of urls) body = body.split(u).join(await A.previewLink(s, u, !!b.flow));
      res.json({ body, ...segments(body) }); } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/sms/test", async (req, res) => {
    if (!guard(req, res)) return;
    try { const b = req.body || {}; const s = store(b.store) || "lb"; const to = MK().normPhone(b.to); if (!to) return res.status(400).json({ error: "Enter a phone number from the internal test list" });
      const tp = await require("./mk-coupons").forTest(s, b.to, "sms", { body: b.body });   // the real profile and a working code, like the live text
      // A cart text needs a cart: tests use the person's own recent checkout (or the newest one in the store), like the live text would.
      const cart = /checkout_url|CheckoutURL|line_items|event\./.test(String(b.body || "")) ? await E().sampleCart(s, tp.profile) : {};
      if (cart.items && !cart.checkout_url) cart.checkout_url = `${String((await E().brand(s)).shop_url || "").replace(/\/$/, "")}/cart`;
      const body = await compose(s, b, tp.profile, { ...cart, ...(tp.coupon ? { coupon: tp.coupon } : {}) });
      const row = await require("./mk-send").send({ store: s, channel: "sms", profile: { id: null, phone: to, sms_consent: "subscribed", timezone: "America/Chicago" }, msg: { body }, test: true, idem: `smstest:${to}:${Date.now()}` });
      res.json({ status: row.status, reason: row.reason }); } catch (e) { fail(res, e); }
  });
  app.get("/api/mk/sms/inbound", async (req, res) => { if (!guard(req, res)) return; try { const s = store(req.query.store); res.json({ messages: (await db(`SELECT i.*, p.first_name, p.last_name, p.email FROM mk_sms_inbound i LEFT JOIN mk_profiles p ON p.id=i.profile_id ${s ? "WHERE i.store=$1" : ""} ORDER BY i.id DESC LIMIT 100`, s ? [s] : [])).rows }); } catch (e) { fail(res, e); } });
  app.get("/api/mk/sms/settings/:store", async (req, res) => {
    if (!guard(req, res)) return;
    try { const s = store(req.params.store); if (!s) return res.status(400).json({ error: "unknown store" });
      const P = require("./mk-sms-providers");
      res.json({ ...(await smsSettings(s)), actual_rate: await actualRate(s), month: { ...(await monthSpend()), limit: await monthlyLimit() }, providers: P.list(), connected: await require("./mk-send").ready(s, "sms"), keywords: KEYWORDS,
        sent_30d: (await db(`SELECT status, count(*)::int n FROM mk_sends WHERE store=$1 AND channel='sms' AND created_at > now() - interval '30 days' GROUP BY 1`, [s])).rows }); } catch (e) { fail(res, e); }
  });
  app.put("/api/mk/sms/settings/:store", async (req, res) => { if (!admin(req, res)) return; try { const s = store(req.params.store); if (!s) return res.status(400).json({ error: "unknown store" }); const saved = await saveSmsSettings(s, req.body || {}, actorOf(req)); try { const A = require("./mk-sms-aws"); if (A.configured()) A.syncKeywords().catch((e) => console.error("keyword sync:", e.message)); } catch (_) {} res.json(saved); } catch (e) { fail(res, e); } });
  /* Try an incoming text without a provider: only for numbers on the internal test list, since keywords change real consent. */
  app.post("/api/mk/sms/simulate-inbound", async (req, res) => {
    if (!admin(req, res)) return;
    try { const b = req.body || {}; const s = store(b.store); if (!s) return res.status(400).json({ error: "Pick a store first" });
      const phone = MK().normPhone(b.from); const S = await MK().settings();
      if (!phone || !(S.test_list || []).map((x) => MK().normPhone(x) || String(x)).includes(phone)) return res.status(400).json({ error: "Use a phone number that's on the internal test list (Settings)." });
      res.json(await inbound(s, { from: phone, to: "simulated", body: String(b.body || ""), providerId: `sim:${Date.now()}` })); } catch (e) { fail(res, e); }
  });
  /* Provider webhook. Refuses everything until a provider is connected and its signature checks out. */
  app.post("/api/mk/sms/hook/:provider/:store", require("express").urlencoded({ extended: false }), async (req, res) => {
    try {
      const s = store(req.params.store); const P = require("./mk-sms-providers"); const pv = P.get(req.params.provider);
      if (!s || !pv) return res.status(404).end();
      const cfg = (await smsSettings(s)).number;
      if (cfg.provider !== req.params.provider || !pv.configured()) return res.status(404).end();
      if (!pv.verify(req)) return res.status(403).end();
      const ev = pv.parse(req);
      if (ev.kind === "inbound") { const r = await inbound(s, ev); return pv.reply(res, r.reply); }
      if (ev.kind === "status" && ev.providerId) await db(`UPDATE mk_sends SET status=CASE WHEN $2 IN ('delivered','sent') THEN 'sent' WHEN $2 IN ('failed','undelivered') THEN 'failed' ELSE status END, meta = meta || jsonb_build_object('delivery', $2::text) WHERE provider_id=$1 AND channel='sms'`, [ev.providerId, ev.status]);
      res.status(200).end();
    } catch (e) { console.error("sms hook:", e.message); res.status(200).end(); }
  });
}

async function init() { await migrate(); }
module.exports = { monthSpend, monthlyLimit, budget, actualRate, rateFor, init, migrate, routes, compose, segments, inbound, smsSettings, saveSmsSettings, OPT_OUT, KEYWORDS };
