/* =============================================================================================
 *  Buzzin Marketing · sign-up forms and store activity (Phase 3)
 *
 *  Forms are delivered by the script already on the store theme (the chat's widget.js loads
 *  /mkf/<store>/forms.js). A form is Draft, Preview or Live:
 *    • Draft   — only in Form Studio.
 *    • Preview — on the store only when the URL carries ?buzzin_form=preview (remembered for the visit).
 *    • Live    — on the store for everyone. Admin only. Real single-use Shopify codes are created only for live forms.
 *  Store activity (product views, add to cart) is recorded only when "Record store activity" is on.
 * ============================================================================================= */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const core = require("./core");
const { db } = core;
const MK = () => require("./mk-core");
const V2 = require("./mk-forms-v2");
/** What the store page sends with an event, trimmed to sane sizes. */
function cleanSiteProps(p) {
  const out = {}; if (!p || typeof p !== "object") return out;
  const str = (v, n = 300) => (v == null ? "" : String(v).slice(0, n));
  for (const k of ["product_id", "title", "handle", "url", "checkout_url"]) if (p[k] != null) out[k] = str(p[k], k.endsWith("url") ? 1200 : 300);
  for (const k of ["price", "value", "item_count"]) if (p[k] != null && isFinite(Number(p[k]))) out[k] = Number(p[k]);
  if (Array.isArray(p.items)) out.items = p.items.slice(0, 20).map((i) => ({ title: str(i && i.title), variant: str(i && i.variant, 120), qty: Number(i && i.qty) || 1, price: isFinite(Number(i && i.price)) ? Number(i.price) : null, image: str(i && i.image, 600), url: str(i && i.url, 600), handle: str(i && i.handle, 200), sku: str(i && i.sku, 80), variant_id: str(i && i.variant_id, 40), product_id: str(i && i.product_id, 40) }));
  return out;
}

const RUNTIME = () => fs.readFileSync(path.join(__dirname, "public", "mk-forms-runtime.js"), "utf8");
const PUBLIC_URL = () => (process.env.PUBLIC_URL || "https://emily-console-production.up.railway.app").replace(/\/$/, "");
// Consent is to Brusche Inc. as the company (Larkspur Baby is a Brusche brand), so it covers every Brusche brand.
const SENDER = "Brusche Inc. and its brands, including Larkspur Baby";
const SMS_CONSENT_V1 = (brand) => `By signing up for texts, you agree to receive recurring automated marketing text messages (e.g. new arrivals, offers, cart reminders) from ${brand} at the number provided. Consent is not a condition of purchase. Msg & data rates may apply. Msg frequency varies. Reply STOP to cancel, HELP for help. See our Terms and Privacy Policy.`;
const SMS_CONSENT_V2 = (brand) => `By checking this box, you agree to receive recurring automated marketing text messages (e.g. new arrivals, offers, cart reminders) from ${brand} at the number provided. Consent is not a condition of purchase. Msg & data rates may apply. Msg frequency varies. Reply STOP to cancel, HELP for help.`;
const EMAIL_CONSENT_V1 = (brand) => `By signing up you agree to receive marketing emails from ${brand}. Unsubscribe anytime.`;
// Shown next to an UNCHECKED checkbox on the phone step (carriers require a separate, unchecked box).
const SMS_CONSENT = () => SMS_CONSENT_V2(SENDER + ",");
const SHOP_URL = { lb: "https://larkspurbaby.com", lbo: "https://larkspurbabyoutlet.com" };
const EMAIL_CONSENT = () => EMAIL_CONSENT_V1(SENDER);

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS mk_forms (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
    priority INT NOT NULL DEFAULT 0, steps JSONB NOT NULL DEFAULT '[]', style JSONB NOT NULL DEFAULT '{}', targeting JSONB NOT NULL DEFAULT '{}', teaser JSONB NOT NULL DEFAULT '{}',
    coupon JSONB NOT NULL DEFAULT '{}', list_id BIGINT, sms_consent_text TEXT, email_consent_text TEXT, ab_of BIGINT, ab_split INT NOT NULL DEFAULT 50,
    source TEXT, ext_id TEXT, updated_by TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE INDEX IF NOT EXISTS mk_events_anon_vid ON mk_events ((props->>'vid')) WHERE profile_id IS NULL`).catch(() => {});
  await db(`CREATE TABLE IF NOT EXISTS mk_form_events (id BIGSERIAL PRIMARY KEY, form_id BIGINT NOT NULL, type TEXT NOT NULL, vid TEXT, profile_id BIGINT, preview BOOLEAN NOT NULL DEFAULT false, at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE INDEX IF NOT EXISTS mk_form_events_form ON mk_form_events (form_id, type, at)`);
  await db(`CREATE TABLE IF NOT EXISTS mk_visitors (vid TEXT PRIMARY KEY, store TEXT, profile_id BIGINT, first_seen TIMESTAMPTZ DEFAULT now(), last_seen TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE TABLE IF NOT EXISTS mk_coupons (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, code TEXT NOT NULL, profile_id BIGINT, form_id BIGINT, flow_id BIGINT, percent NUMERIC, amount NUMERIC,
    expires_at TIMESTAMPTZ, real BOOLEAN NOT NULL DEFAULT false, redeemed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS mk_coupons_code ON mk_coupons (store, code)`);
  await db(`ALTER TABLE mk_forms ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ`);
  await db(`ALTER TABLE mk_forms ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ`);
  await db(`ALTER TABLE mk_coupons ADD COLUMN IF NOT EXISTS prize INT`);
  await db(`ALTER TABLE mk_coupons ADD COLUMN IF NOT EXISTS offer_key TEXT`);
  await db(`ALTER TABLE mk_coupons ADD COLUMN IF NOT EXISTS discount_id TEXT`); await db(`ALTER TABLE mk_coupons ADD COLUMN IF NOT EXISTS redeem_id TEXT`); await db(`ALTER TABLE mk_coupons ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ`);   // which coupon-block offer made it (null = the default code)
  await db(`CREATE TABLE IF NOT EXISTS mk_form_comments (id BIGSERIAL PRIMARY KEY, form_id BIGINT NOT NULL, who TEXT, body TEXT NOT NULL, step_id TEXT, resolved BOOLEAN NOT NULL DEFAULT false, at TIMESTAMPTZ DEFAULT now())`);
}

const DEFAULT_FORM = (brand) => ({
  steps: V2.defaultSteps(), style: V2.STYLE_DEFAULT(), targeting: V2.TARGET_DEFAULT(), teaser: V2.TEASER_DEFAULT(),
  coupon: { enabled: true, percent: 10, prefix: "WELCOME", expires_days: 14 },
  sms_consent_text: SMS_CONSENT(brand), email_consent_text: EMAIL_CONSENT(brand),
});

async function list(store) {
  const rows = (await db(`SELECT f.*, (SELECT l.name FROM mk_lists l WHERE l.id=f.list_id) list_name, (SELECT count(*)::int FROM mk_forms v WHERE v.ab_of=f.id) variants
    FROM mk_forms f WHERE f.ab_of IS NULL ${store ? "AND f.store=$1" : ""} ORDER BY f.updated_at DESC`, store ? [store] : [])).rows;
  // views, sign-ups and revenue for every form in one pass (cached a minute)
  const st = await MK().memo("form_stats", 60e3, async () => {
    const out = {};
    for (const r of (await db(`SELECT form_id, count(*) FILTER (WHERE type='viewed')::int views, count(*) FILTER (WHERE type='submitted_email')::int emails,
        count(*) FILTER (WHERE type='submitted_phone')::int phones, count(DISTINCT profile_id) FILTER (WHERE type LIKE 'submitted_%')::int submitted
        FROM mk_form_events WHERE NOT preview GROUP BY form_id`)).rows) out[r.form_id] = { ...r, revenue: 0 };
    for (const r of (await db(`WITH s AS (SELECT form_id, profile_id, min(at) at FROM mk_form_events WHERE type='submitted_email' AND NOT preview AND profile_id IS NOT NULL GROUP BY 1,2)
        SELECT s.form_id, COALESCE(sum(o.value),0)::float revenue FROM s JOIN mk_events o ON o.profile_id=s.profile_id AND o.type='placed_order' AND o.at > s.at GROUP BY s.form_id`)).rows) out[r.form_id] = { ...(out[r.form_id] || {}), revenue: r.revenue };
    return out;
  });
  return rows.map((f) => { const x = st[f.id] || st[String(f.id)] || {}; return { ...f, views: x.views || 0, emails: x.emails || 0, phones: x.phones || 0, submitted: x.submitted || 0, revenue: x.revenue || 0 }; });
}
async function get(id) { return V2.toV2((await db(`SELECT * FROM mk_forms WHERE id=$1`, [Number(id)])).rows[0] || null); }
async function create(store, name, who) {
  const brand = MK().STORES[store] || store;
  const d = DEFAULT_FORM(brand);
  const list = await MK().ensureList(store, "Sign-up form", { source: "buzzin", ext_id: "signup-form", description: "Everyone who signs up through a Buzzin form" });
  return (await db(`INSERT INTO mk_forms (store, name, steps, style, targeting, teaser, coupon, list_id, sms_consent_text, email_consent_text, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [store, name || "Welcome popup", JSON.stringify(d.steps), JSON.stringify(d.style), JSON.stringify(d.targeting), JSON.stringify(d.teaser), JSON.stringify(d.coupon), list.id, d.sms_consent_text, d.email_consent_text, who || null])).rows[0];
}
async function save(id, b, who, isAdmin) {
  const cur = await get(id); if (!cur) throw Object.assign(new Error("not found"), { status: 404 });
  let status = b.status || cur.status;
  if (!["draft", "preview", "live"].includes(status)) status = cur.status;
  if (status === "live" && cur.status !== "live" && !isAdmin) throw Object.assign(new Error("Only an admin can make a form live."), { status: 403 });
  const steps = V2.cleanSteps(Array.isArray(b.steps) ? b.steps : cur.steps);
  if (!steps.length) throw Object.assign(new Error("A form needs at least one step."), { status: 400 });
  const style = { ...(b.style || cur.style), v: 2 };
  const tg = b.targeting || cur.targeting || {};
  if (String(tg.custom_js || "") !== String((cur.targeting || {}).custom_js || "") && !isAdmin) throw Object.assign(new Error("Only an admin can change the custom JavaScript rule."), { status: 403 });
  if (tg.custom_js) tg.custom_js = String(tg.custom_js).slice(0, 4000);
  if (Array.isArray(tg.countries)) tg.countries = tg.countries.map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)).slice(0, 60);
  if (Array.isArray(tg.hide_countries)) tg.hide_countries = tg.hide_countries.map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)).slice(0, 60);
  if (Array.isArray(tg.utm_rules)) tg.utm_rules = tg.utm_rules.slice(0, 10).map((r) => ({ param: ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].includes(r && r.param) ? r.param : "utm_source", op: ["equals", "contains", "not"].includes(r && r.op) ? r.op : "equals", value: String((r && r.value) || "").slice(0, 100) }));
  b.targeting = tg;
  const dt = (v, d) => (v === undefined ? d : v ? new Date(v) : null);
  const startAt = dt(b.start_at, cur.start_at), endAt = dt(b.end_at, cur.end_at);
  if (startAt && endAt && endAt <= startAt) throw Object.assign(new Error("The end date has to be after the start date."), { status: 400 });
  if (b.ab_split != null) await db(`UPDATE mk_forms SET ab_split=$2 WHERE id=$1`, [cur.id, Math.max(5, Math.min(95, Number(b.ab_split) || 50))]);
  if (cur.ab_of) status = (await db(`SELECT status FROM mk_forms WHERE id=$1`, [cur.ab_of])).rows[0]?.status || "draft";
  else if (status !== cur.status) await db(`UPDATE mk_forms SET status=$2 WHERE ab_of=$1`, [cur.id, status]);
  await db(`UPDATE mk_forms SET start_at=$2, end_at=$3 WHERE id=$1 OR ab_of=$1`, [cur.id, startAt, endAt]);
  const saved = (await db(`UPDATE mk_forms SET name=$2, status=$3, priority=$4, steps=$5, style=$6, targeting=$7, teaser=$8, coupon=$9, list_id=$10, sms_consent_text=$11, email_consent_text=$12, updated_by=$13, updated_at=now() WHERE id=$1 RETURNING *`,
    [cur.id, b.name || cur.name, status, Number(b.priority != null ? b.priority : cur.priority) || 0, JSON.stringify(steps), JSON.stringify(style), JSON.stringify(b.targeting || cur.targeting),
     JSON.stringify(b.teaser || cur.teaser), JSON.stringify(b.coupon || cur.coupon), b.list_id != null ? Number(b.list_id) : cur.list_id, b.sms_consent_text != null ? b.sms_consent_text : cur.sms_consent_text,
     b.email_consent_text != null ? b.email_consent_text : cur.email_consent_text, who || null])).rows[0];
  try { const c = saved.coupon || {}; if (saved.status === "live" && c.enabled && Number(c.percent) > 0) {   // codes ready before the first sign-up
    const CP = require("./mk-coupons"); CP.prepare(saved.store, [{ type: "order", value_type: "percent", value: Number(c.percent) || 10, days: Number(c.expires_days) || 14, prefix: c.prefix || "WELCOME" }]).catch(() => {}); } } catch (e) {}
  return saved;
}
const publicForm = (f0, extra) => { const f = V2.toV2(f0); return { ...(extra || {}), id: f.id, shop_url: SHOP_URL[f.store] || "", priority: f.priority, steps: f.steps, style: f.style, targeting: f.targeting, teaser: f.teaser, sms_consent_text: f.sms_consent_text, email_consent_text: f.email_consent_text, coupon_on: !!(f.coupon && f.coupon.enabled) }; };

/* ---------------- coupons ---------------- */
async function issueCoupon(store, form, profile, over = {}) {
  const c = { ...(form.coupon || {}), ...(over.percent != null ? { enabled: true, percent: over.percent } : {}) };
  if (!c.enabled || !(Number(c.percent) > 0)) return null;
  const prior = (await db(`SELECT code FROM mk_coupons WHERE store=$1 AND form_id=$2 AND profile_id=$3 ORDER BY id DESC LIMIT 1`, [store, form.id, profile.id])).rows[0];
  if (prior) return prior.code;
  let code = `${String(c.prefix || "WELCOME").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  let expires = new Date(Date.now() + (Number(c.expires_days) || 14) * 864e5);
  let real = false, ids = {};
  if ((over.status || form.status) === "live") {
    // Real single-use code in Shopify, only for live forms. Taken from the ready pool so the success step shows it instantly.
    const CP = require("./mk-coupons");
    const off = CP.cleanOffer({ type: "order", value_type: "percent", value: Number(c.percent) || 10, days: Number(c.expires_days) || 14, prefix: c.prefix || "WELCOME" });
    const got = await CP.claim(store, off, form.name); code = got.code; expires = got.expires; ids = got;
    real = true;
  }
  await db(`INSERT INTO mk_coupons (store, code, profile_id, form_id, percent, expires_at, real, prize, discount_id, redeem_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [store, code, profile.id, form.id, Number(c.percent) || 10, expires, real, over.prize == null ? null : over.prize, ids.discount_id || null, ids.redeem_id || null]);
  await db(`UPDATE mk_profiles SET props = props || jsonb_build_object('coupon', $2::text, 'coupon_expires', $3::text) WHERE id=$1`, [profile.id, code, expires.toISOString()]);
  return code;
}

/* ---------------- a submission from the store ---------------- */
// Obvious misspellings of the big email domains (they don't exist, so the welcome email and code would never arrive).
const DOMAIN_TYPOS = {
  "yhaoo.com": "yahoo.com", "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.co": "yahoo.com", "yahoo.con": "yahoo.com", "yahoo.cm": "yahoo.com", "yaoo.com": "yahoo.com", "tahoo.com": "yahoo.com", "uahoo.com": "yahoo.com", "yahho.com": "yahoo.com", "yahoo.om": "yahoo.com",
  "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com", "gmaill.com": "gmail.com", "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gmail.om": "gmail.com", "gmaik.com": "gmail.com", "gmsil.com": "gmail.com", "gmail.comm": "gmail.com", "fmail.com": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmail.co": "hotmail.com", "hotmail.con": "hotmail.com", "hormail.com": "hotmail.com",
  "outlok.com": "outlook.com", "outllok.com": "outlook.com", "outlook.co": "outlook.com", "outlook.con": "outlook.com",
  "iclod.com": "icloud.com", "icoud.com": "icloud.com", "icloud.co": "icloud.com", "icloud.con": "icloud.com", "iclould.com": "icloud.com",
  "aol.co": "aol.com", "aol.con": "aol.com",
};
function fixEmailTypo(e) {
  const s = String(e || "").trim(), at = s.lastIndexOf("@"); if (at < 1) return s;
  const dom = s.slice(at + 1).toLowerCase(); return DOMAIN_TYPOS[dom] ? s.slice(0, at + 1) + DOMAIN_TYPOS[dom] : s;
}
async function submit(store, b, ip) {
  const form = await get(b.form_id);
  if (!form || form.store !== store) return { error: "This form isn't available." };
  const parent = form.ab_of ? await get(form.ab_of) : null;
  const status = parent ? parent.status : form.status;   // an A/B variant follows its test
  const previewing = !!b.preview && String(b.preview_id || "") === String(form.ab_of || form.id);
  if (status === "draft" && !previewing) return { error: "This form isn't available." };
  const isPreview = status !== "live" || previewing;
  const vals = b.values || {};
  if (vals.email) vals.email = fixEmailTypo(vals.email);
  // Old store scripts send kind email/phone/question; the v2 script sends kind "step" with every field on the step.
  const hasEmail = !!vals.email, hasPhone = !!vals.phone;
  if (hasPhone && vals.sms_consent_checked !== true) return { error: "Please check the box to agree to texts." };
  const prof = await findOrCreateFromVisitor(store, b.vid, vals);
  if (!prof) return { error: hasPhone && !hasEmail ? "Please enter your email first." : "Please enter a valid email." };
  const brand = MK().STORES[store];
  const src = `form:${form.id}${isPreview ? ":preview" : ""}`;
  if (hasEmail) await MK().setConsent(prof, "email", "subscribed", { source: src, detail: form.name, wording: form.email_consent_text || EMAIL_CONSENT(brand) });
  if (hasPhone) {
    const phone = MK().normPhone(vals.phone);
    await db(`UPDATE mk_profiles SET phone=COALESCE(phone,$2), updated_at=now() WHERE id=$1`, [prof.id, phone]); prof.phone = prof.phone || phone;
    await MK().setConsent(prof, "sms", "subscribed", { source: src, detail: `${form.name} · checkbox ticked`, wording: form.sms_consent_text || SMS_CONSENT(brand) });
  }
  const stp0 = (form.steps || []).find((x) => x.id === b.step_id) || {};
  const btn = (stp0.blocks || []).find((x) => x.type === "button" && x.id && x.id === b.button_id) || null;   // the submit button that was clicked
  const props = {};
  for (const h of (btn && btn.hidden) || []) { const k = String(h.key || "").trim().replace(/\s+/g, "_").toLowerCase().replace(/[^a-z0-9_]/g, ""); if (k && !["email", "phone"].includes(k)) props[k] = String(h.value || "").slice(0, 200); }
  if ((form.targeting || {}).store_utm && b.utm && typeof b.utm === "object") for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) if (b.utm[k]) props[k] = String(b.utm[k]).slice(0, 100);
  for (const [k, v] of Object.entries(vals)) if (!["email", "phone", "sms_consent_checked"].includes(k) && /^[a-z0-9_]{1,40}$/i.test(k) && String(v).length < 200) props[k] = String(v);
  if (Object.keys(props).length) await db(`UPDATE mk_profiles SET props = props || $2::jsonb, updated_at=now() WHERE id=$1`, [prof.id, JSON.stringify(props)]);
  const kinds = [hasEmail && "email", hasPhone && "phone", Object.keys(props).length && "question"].filter(Boolean);
  for (const k of kinds.length ? kinds : ["question"]) await db(`INSERT INTO mk_form_events (form_id, type, vid, profile_id, preview) VALUES ($1,$2,$3,$4,$5)`, [form.id, `submitted_${k}`, b.vid || null, prof.id, isPreview || !!b.preview]);
  let code = null;
  if (hasEmail) {
    const listId = (btn && btn.list_id) || form.list_id;
    if (listId) { await MK().addToList(listId, prof.id, src); await MK().track(store, "joined_list", { profileId: prof.id, props: { list_id: listId, form_id: form.id, preview: isPreview }, source: "form" }); }
    await MK().track(store, "submitted_form", { profileId: prof.id, props: { form_id: form.id, form: form.name, preview: isPreview }, source: "form" });
    // Spin-to-win on this step: the prize is picked here, never in the browser
    const stp = (form.steps || []).find((x) => x.id === b.step_id) || {};
    const wheel = (stp.blocks || []).find((x) => x.type === "wheel");
    if (wheel && (wheel.slices || []).length >= 2) {
      const prior = (await db(`SELECT code, prize FROM mk_coupons WHERE store=$1 AND form_id=$2 AND profile_id=$3 AND prize IS NOT NULL ORDER BY id DESC LIMIT 1`, [store, form.id, prof.id])).rows[0];
      let k;
      if (prior) { k = Number(prior.prize); code = prior.code; }
      else {
        const sl = wheel.slices, tot = sl.reduce((t, x) => t + (Number(x.weight) || 0), 0) || sl.length; let r = crypto.randomInt(0, 1e9) / 1e9 * tot; k = sl.length - 1;
        for (let i = 0; i < sl.length; i++) { r -= (Number(sl[i].weight) || (tot === sl.length ? 1 : 0)); if (r < 0) { k = i; break; } }
        const pct = Number(sl[k].percent) || 0;
        if (pct > 0) { try { code = await issueCoupon(store, form, prof, { percent: pct, prize: k, status: isPreview ? "preview" : status }); } catch (e) { console.error("wheel coupon:", e.message); } }
        await db(`UPDATE mk_profiles SET props = props || jsonb_build_object('wheel_prize', $2::text) WHERE id=$1`, [prof.id, String(sl[k].label || "")]);
      }
      return { ok: true, code, slice: k };
    }
    try { code = await issueCoupon(store, form, prof, { status: isPreview ? "preview" : status }); } catch (e) { console.error("form coupon:", e.message); }
  }
  return { ok: true, code };
}
// Who a visitor is: a signed Buzzin link token (_bz on links in our emails/texts) or their Shopify customer id when logged in.
async function identify(b) {
  try {
    if (b.ident) { const t = require("./mk-email").readToken(String(b.ident).slice(0, 200)); if (t && t.id) { const p = (await db(`SELECT id FROM mk_profiles WHERE id=$1`, [t.id])).rows[0]; if (p) return Number(p.id); } }
    const cid = String(b.cid || "").replace(/\D/g, "");
    if (cid) { const p = (await db(`SELECT id FROM mk_profiles WHERE shopify_id IN ($1, $2) LIMIT 1`, [cid, `gid://shopify/Customer/${cid}`])).rows[0]; if (p) return Number(p.id); }
  } catch (_) {}
  return null;
}
// Tie a visitor to a profile and move everything they did before we knew them (viewed products, carts…) onto it — like Klaviyo.
async function linkVisitor(store, vid, pid) {
  if (!vid || !pid) return;
  await db(`INSERT INTO mk_visitors (vid, store, profile_id) VALUES ($1,$2,$3) ON CONFLICT (vid) DO UPDATE SET profile_id=EXCLUDED.profile_id, last_seen=now()`, [vid, store, pid]);
  await db(`UPDATE mk_events SET profile_id=$1 WHERE profile_id IS NULL AND props->>'vid'=$2`, [pid, vid]).catch((e) => console.error("visitor backfill:", e.message));
}
async function findOrCreateFromVisitor(store, vid, vals) {
  let prof = null;
  if (vals.email) prof = await MK().upsertProfile(store, { email: vals.email }, "form");
  if (!prof && vid) { const v = (await db(`SELECT profile_id FROM mk_visitors WHERE vid=$1`, [vid])).rows[0]; if (v && v.profile_id) prof = (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [v.profile_id])).rows[0]; }
  if (!prof && vals.phone) prof = await MK().upsertProfile(store, { phone: vals.phone }, "form");
  if (prof && vid) await linkVisitor(store, String(vid).slice(0, 40), prof.id);
  return prof;
}

/* ---------------- config for the store script (cached a minute) ---------------- */
const CACHE = new Map();
async function config(store, preview) {
  const k = `${store}:${preview ? 1 : 0}`; const hit = CACHE.get(k); if (hit && hit.t > Date.now() - 60000) return hit.v;
  const st = await MK().settings();
  // Live forms inside their schedule (previews ignore the schedule). A/B variants ride along with their test.
  const rows = (await db(`SELECT * FROM mk_forms WHERE store=$1 AND ab_of IS NULL AND (${preview ? "status IN ('live','preview')" : "status='live' AND (start_at IS NULL OR start_at <= now()) AND (end_at IS NULL OR end_at > now())"}) ORDER BY priority DESC`, [store])).rows;
  const ids = rows.map((r) => r.id);
  const vars = ids.length ? (await db(`SELECT * FROM mk_forms WHERE ab_of = ANY($1) ORDER BY id`, [ids])).rows : [];
  const counts = {}; if (ids.length) for (const r of (await db(`SELECT COALESCE(f.ab_of, f.id) gid, count(DISTINCT e.profile_id)::int n FROM mk_form_events e JOIN mk_forms f ON f.id=e.form_id WHERE (f.id = ANY($1) OR f.ab_of = ANY($1)) AND e.type LIKE 'submitted_%' AND NOT e.preview GROUP BY 1`, [ids])).rows) counts[r.gid] = r.n;
  const v = { forms: rows.map((r) => { const vs = vars.filter((x) => Number(x.ab_of) === Number(r.id)); return publicForm(r, { signups: counts[r.id] || 0, ...(vs.length ? { variants: vs.map((x) => publicForm(x, { signups: counts[r.id] || 0 })), split: r.ab_split } : {}) }); }),
    tracking: !!(st.tracking && st.tracking[store]), audience: rows.some((r) => { const a = (r.targeting || {}).audience || {}; if (["not_profiles", "profiles_only", "not_subscribed"].includes((r.targeting || {}).aud_mode)) return true; return ["show_lists", "show_segments", "hide_lists", "hide_segments"].some((x) => (a[x] || []).length); }) };
  CACHE.set(k, { t: Date.now(), v }); return v;
}
/** Per-visitor parts of the config: country (from the visitor's IP) and list/segment rules. */
let geo = null; try { geo = require("geoip-lite"); } catch (e) { geo = null; }
async function visitorConfig(store, preview, vid, ip, formId) {
  const base = await config(store, preview);
  const out = { ...base, country: null, aud: null };
  // "Preview on website" for one form: show it whatever its status (drafts too), like Klaviyo's preview
  if (preview && formId && !base.forms.some((f) => String(f.id) === String(formId))) {
    const f = (await db(`SELECT * FROM mk_forms WHERE id=$1 AND store=$2`, [Number(formId), store])).rows[0];
    if (f) { const vs = (await db(`SELECT * FROM mk_forms WHERE ab_of=$1 ORDER BY id`, [f.id])).rows; out.forms = [publicForm(f, { signups: 0, ...(vs.length ? { variants: vs.map((x) => publicForm(x)), split: f.ab_split } : {}) }), ...base.forms]; }
  }
  try { const g = geo && ip ? geo.lookup(String(ip).replace(/^::ffff:/, "")) : null; out.country = g ? g.country : null; } catch (e) {}
  if (base.audience) {
    const prof = vid ? (await db(`SELECT profile_id FROM mk_visitors WHERE vid=$1`, [String(vid).slice(0, 40)])).rows[0] : null; const pid = prof && prof.profile_id;
    const lists = pid ? (await db(`SELECT list_id FROM mk_list_members WHERE profile_id=$1`, [pid])).rows.map((r) => Number(r.list_id)) : [];
    const segs = pid ? (await db(`SELECT segment_id FROM mk_segment_members WHERE profile_id=$1`, [pid]).catch(() => ({ rows: [] }))).rows.map((r) => Number(r.segment_id)) : [];
    out.aud = {};
    const subd = pid && base.forms.some((f) => (f.targeting || {}).aud_mode === "not_subscribed") ? !!(await db(`SELECT 1 FROM mk_profiles WHERE id=$1 AND email_consent='subscribed'`, [pid]).catch(() => ({ rows: [] }))).rows[0] : false;
    const check = (f) => { const tg = f.targeting || {}, a = tg.audience || {}; const has = (arr, set) => (arr || []).some((x) => set.includes(Number(x)));
      if (tg.aud_mode === "not_profiles") return !pid;
      if (tg.aud_mode === "profiles_only") return !!pid;
      if (tg.aud_mode === "not_subscribed") return !subd;
      if (tg.aud_mode && tg.aud_mode !== "lists") return true;
      if (has(a.hide_lists, lists) || has(a.hide_segments, segs)) return false;
      if ((a.show_lists || []).length || (a.show_segments || []).length) return has(a.show_lists, lists) || has(a.show_segments, segs);
      return true; };
    for (const f of base.forms) { out.aud[f.id] = check(f); for (const v of f.variants || []) out.aud[v.id] = check(v); }
  }
  delete out.audience; return out;
}
async function anyLive(store) { const st = await MK().settings(); const n = (await db(`SELECT count(*)::int n FROM mk_forms WHERE store=$1 AND status='live'`, [store])).rows[0].n; return n > 0 || !!(st.tracking && st.tracking[store]); }

async function stats(id) {
  const r = (await db(`SELECT type, preview, count(*)::int n FROM mk_form_events WHERE form_id=$1 GROUP BY type, preview`, [Number(id)])).rows;
  const g = (t, p) => (r.find((x) => x.type === t && x.preview === p) || { n: 0 }).n;
  const out = {}; for (const p of [false, true]) { const key = p ? "preview" : "live"; out[key] = { viewed: g("viewed", p), closed: g("closed", p), emails: g("submitted_email", p), phones: g("submitted_phone", p), answers: g("submitted_question", p) }; out[key].rate = out[key].viewed ? Math.round(out[key].emails / out[key].viewed * 1000) / 10 : 0; }
  const rev = (await db(`SELECT count(*)::int orders, COALESCE(sum(e.value),0) revenue FROM mk_events e JOIN mk_form_events fe ON fe.profile_id=e.profile_id AND fe.form_id=$1 AND fe.type='submitted_email' AND NOT fe.preview
                         WHERE e.type='placed_order' AND e.at > fe.at`, [Number(id)])).rows[0];
  return { ...out, orders: rev.orders, revenue: Number(rev.revenue) };
}

function cors(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); }
const hits = new Map();
function limited(ip) { const now = Date.now(), k = String(ip || "?"); const a = (hits.get(k) || []).filter((t) => t > now - 3600e3); a.push(now); hits.set(k, a); return a.length > 30; }

function routes(app, { guard, admin, actorOf, fail, store }) {
  const isAdmin = (req) => { const s = core.sessionOf((req.headers.authorization || "").replace(/^Bearer /i, "") || req.query.key || ""); return !!(s && s.role === "admin"); };
  /* public: the store script */
  app.get("/mkf/:store/forms.js", async (req, res) => {
    const s = store(req.params.store); if (!s) return res.status(404).send("");
    try { const live = await anyLive(s); res.setHeader("Cache-Control", "public, max-age=60"); res.type("application/javascript").send(`window.BZF_ORIGIN=${JSON.stringify(PUBLIC_URL())};window.BZF_STORE=${JSON.stringify(s)};window.BZF_LIVE=${live ? "true" : "false"};\n${RUNTIME()}`); }
    catch (e) { res.type("application/javascript").send("/* forms unavailable */"); }
  });
  app.options("/api/mkf/:store/:what", (req, res) => { cors(res); res.status(204).end(); });
  app.get("/api/mkf/:store/config", async (req, res) => { cors(res); const s = store(req.params.store); if (!s) return res.status(404).json({ forms: [] }); try { res.setHeader("Cache-Control", "no-store"); res.json(await visitorConfig(s, req.query.preview === "1", req.query.vid, req.ip, req.query.form)); } catch (e) { res.json({ forms: [] }); } });
  app.post("/api/mkf/:store/submit", async (req, res) => {
    cors(res); const s = store(req.params.store); if (!s) return res.status(404).json({ error: "unknown store" });
    if (limited(req.ip)) return res.status(429).json({ error: "Too many tries. Please try again later." });
    try { res.json(await submit(s, req.body || {}, req.ip)); } catch (e) { console.error("form submit:", e.message); res.status(500).json({ error: "Something went wrong. Please try again." }); }
  });
  app.post("/api/mkf/:store/event", async (req, res) => {
    cors(res); const s = store(req.params.store); const b = req.body || {}; if (!s || !b.form_id || !["viewed", "closed"].includes(b.type)) return res.json({ ok: false });
    try { const f = await get(b.form_id); if (f && f.store === s) await db(`INSERT INTO mk_form_events (form_id, type, vid, preview) VALUES ($1,$2,$3,$4)`, [f.id, b.type, String(b.vid || "").slice(0, 40) || null, f.status !== "live" || !!b.preview]); res.json({ ok: true }); } catch (e) { res.json({ ok: false }); }
  });
  app.post("/api/mkf/:store/track", async (req, res) => {
    cors(res); const s = store(req.params.store); const b = req.body || {};
    if (!s || !["viewed_product", "viewed_collection", "added_to_cart", "active_on_site"].includes(b.type)) return res.json({ ok: false });
    try { const cfg = await config(s, false); if (!cfg.tracking && !b.preview) return res.json({ ok: false });
      const v = b.vid ? (await db(`INSERT INTO mk_visitors (vid, store) VALUES ($1,$2) ON CONFLICT (vid) DO UPDATE SET last_seen=now() RETURNING profile_id`, [String(b.vid).slice(0, 40), s])).rows[0] : null;
      if (v && !v.profile_id && b.vid) { const pid = await identify(b); if (pid) { await linkVisitor(s, String(b.vid).slice(0, 40), pid); v.profile_id = pid; } }
      if (b.type !== "active_on_site" || (v && v.profile_id)) { const props = cleanSiteProps(b.props); await MK().track(s, b.type, { profileId: v && v.profile_id, value: b.type === "added_to_cart" && Number(props.value) > 0 ? Number(props.value) : undefined, props: { ...props, page: String(b.page || "").slice(0, 200), vid: b.vid }, source: "site" }); }
      res.json({ ok: true }); } catch (e) { res.json({ ok: false }); }
  });

  /* staff: A/B tests — variant B is its own form row (ab_of = the test), shown to a share of visitors */
  app.post("/api/mk/forms/:id/ab", async (req, res) => {
    if (!guard(req, res)) return;
    try { const f = await get(req.params.id); if (!f) return res.status(404).json({ error: "not found" }); if (f.ab_of) return res.status(400).json({ error: "This is already a variant." });
      const n = (await db(`SELECT count(*)::int n FROM mk_forms WHERE ab_of=$1`, [f.id])).rows[0].n; if (n >= 3) return res.status(400).json({ error: "A test can have up to 4 variants." });
      const letter = "BCD"[n];
      const r = (await db(`INSERT INTO mk_forms (store, name, status, priority, steps, style, targeting, teaser, coupon, list_id, sms_consent_text, email_consent_text, source, updated_by, ab_of, start_at, end_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'buzzin',$13,$14,$15,$16) RETURNING id`, [f.store, `${f.name} · ${letter}`.slice(0, 120), f.status, f.priority || 0, JSON.stringify(f.steps), JSON.stringify(f.style), JSON.stringify(f.targeting), JSON.stringify(f.teaser), JSON.stringify(f.coupon), f.list_id, f.sms_consent_text, f.email_consent_text, actorOf(req), f.id, f.start_at, f.end_at])).rows[0];
      if (!n) await db(`UPDATE mk_forms SET ab_split=50 WHERE id=$1`, [f.id]);
      CACHE.clear(); res.json({ id: r.id, letter }); } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/forms/:id/ab/end", async (req, res) => {
    if (!guard(req, res)) return;
    try { const f = await get(req.params.id); if (!f) return res.status(404).json({ error: "not found" }); const fid = Number(f.id), keep = Number((req.body || {}).keep) || fid;
      if (keep !== fid) { const w = await get(keep); if (!w || Number(w.ab_of) !== fid) return res.status(400).json({ error: "That variant isn't part of this test." });
        await db(`UPDATE mk_forms SET steps=$2, style=$3, targeting=$4, teaser=$5, coupon=$6, list_id=$7, sms_consent_text=$8, email_consent_text=$9, updated_by=$10, updated_at=now() WHERE id=$1`,
          [f.id, JSON.stringify(w.steps), JSON.stringify(w.style), JSON.stringify(w.targeting), JSON.stringify(w.teaser), JSON.stringify(w.coupon), w.list_id, w.sms_consent_text, w.email_consent_text, actorOf(req)]); }
      await db(`DELETE FROM mk_forms WHERE ab_of=$1`, [f.id]); CACHE.clear(); res.json({ ok: true }); } catch (e) { fail(res, e); }
  });
  /* staff: comments on a form */
  app.get("/api/mk/forms/:id/comments", async (req, res) => { if (!guard(req, res)) return; try { res.json({ comments: (await db(`SELECT * FROM mk_form_comments WHERE form_id=$1 ORDER BY resolved, at DESC LIMIT 200`, [Number(req.params.id)])).rows }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/forms/:id/comments", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; const t = String(b.body || "").trim().slice(0, 2000); if (!t) return res.status(400).json({ error: "Write a comment first." });
    res.json((await db(`INSERT INTO mk_form_comments (form_id, who, body, step_id) VALUES ($1,$2,$3,$4) RETURNING *`, [Number(req.params.id), actorOf(req), t, b.step_id ? String(b.step_id).slice(0, 20) : null])).rows[0]); } catch (e) { fail(res, e); } });
  app.post("/api/mk/forms/comments/:cid/resolve", async (req, res) => { if (!guard(req, res)) return; try { await db(`UPDATE mk_form_comments SET resolved = NOT resolved WHERE id=$1`, [Number(req.params.cid)]); res.json({ ok: true }); } catch (e) { fail(res, e); } });
  /* staff: Ask Emily to change the step being edited */
  app.post("/api/mk/forms/:id/ai", async (req, res) => {
    if (!guard(req, res)) return;
    try { const b = req.body || {}; const k = require("./emily").claimsKit(); if (!k.anthropic) return res.status(400).json({ error: "The AI isn't configured." });
      const step = (V2.cleanSteps([b.step || {}])[0]) || { blocks: [] };
      const sys = `You edit one step of a website sign-up popup for ${MK().STORES.lb || "Larkspur Baby"}, a baby clothing brand (Brusche Inc.). Return ONLY JSON: {"blocks":[...], "note":"one short sentence about what you changed"}.
Blocks keep this shape: {"id","type","st":{"pad":[top,right,bottom,left],"align","bg"}, ...type fields}. Types: text {html using <h1>,<h2>,<p>,<b>,<a>}, image {src,alt,width}, button {text,action:"submit"|"next"|"close"|"url",url}, email {placeholder,label,required}, phone {placeholder,label,required}, input {label,key,placeholder}, radio/checkboxes/dropdown {label,key,options[]}, date {label,key}, coupon {}, countdown {mode:"minutes",minutes}, counter {text with {{count}}}, reviews {items:[{text,name,stars}]}, wheel {slices:[{label,percent,weight}]}, spacer {height}, divider {}.
Keep every existing block id you keep. Keep the email/phone fields unless asked to remove them. Never invent discounts larger than the form already offers unless asked. Keep the brand voice warm, simple and mom-friendly. Optional "beside":true puts a block next to the one before it.`;
      const r = await k.anthropic.messages.create({ model: k.model, max_tokens: 4000, system: sys, messages: [{ role: "user", content: `Current step JSON:\n${JSON.stringify({ name: step.name, blocks: step.blocks }).slice(0, 12000)}\n\nChange requested: ${String(b.ask || "").slice(0, 800)}` }] });
      const txt = (r.content || []).map((c) => c.text || "").join(""); const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error("Emily didn't return a form step.");
      const j = JSON.parse(m[0]); const out = V2.cleanSteps([{ ...step, blocks: j.blocks || [] }])[0];
      if (!out.blocks.length) throw new Error("Emily's version had no blocks; nothing changed.");
      res.json({ blocks: out.blocks, note: String(j.note || "").slice(0, 300) }); } catch (e) { fail(res, e); }
  });
  /* staff: universal blocks (saved blocks reused in any form) */
  app.get("/api/mk/forms-universal", async (req, res) => { if (!guard(req, res)) return; try { res.json({ items: (await core.setting("mk_form_universal", null)) || [] }); } catch (e) { fail(res, e); } });
  app.put("/api/mk/forms-universal", async (req, res) => {
    if (!guard(req, res)) return;
    try { const items = (Array.isArray((req.body || {}).items) ? req.body.items : []).slice(0, 100).map((x) => ({ id: String(x.id || "").slice(0, 20), name: String(x.name || "Block").slice(0, 40), block: (V2.cleanSteps([{ blocks: [x.block] }])[0].blocks[0]) || null })).filter((x) => x.id && x.block);
      await db(`INSERT INTO emily_settings (key, value, updated_by, updated_at) VALUES ('mk_form_universal',$1,$2,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [JSON.stringify(items), actorOf(req)]);
      res.json({ items }); } catch (e) { fail(res, e); }
  });
  /* staff: Form Studio */
  app.get("/api/mk/forms", async (req, res) => { if (!guard(req, res)) return; try { res.json({ forms: await list(store(req.query.store)), klaviyo: (await db(`SELECT id, name, data FROM hd_klaviyo WHERE kind='form'`).catch(() => ({ rows: [] }))).rows.map((r) => ({ id: r.id, name: r.name, status: r.data && r.data.attributes && r.data.attributes.status })) }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/forms", async (req, res) => { if (!guard(req, res)) return; try { const s = store((req.body || {}).store); if (!s) return res.status(400).json({ error: "Pick a store first" }); res.json(await create(s, (req.body || {}).name, actorOf(req))); } catch (e) { fail(res, e); } });
  app.get("/api/mk/forms/:id", async (req, res) => { if (!guard(req, res)) return; try { const f = await get(req.params.id); if (!f) return res.status(404).json({ error: "not found" }); const variants = (await db(`SELECT id, name FROM mk_forms WHERE ab_of=$1 ORDER BY id`, [f.ab_of || f.id])).rows; const parent = f.ab_of ? (await db(`SELECT id, name, status, ab_split FROM mk_forms WHERE id=$1`, [f.ab_of])).rows[0] : null;
      const cc = (await db(`SELECT count(*)::int n FROM mk_form_comments WHERE form_id=$1 AND NOT resolved`, [f.id])).rows[0].n;
      const su = (await db(`SELECT count(DISTINCT profile_id)::int n FROM mk_form_events WHERE form_id=$1 AND type LIKE 'submitted_%' AND NOT preview`, [f.id])).rows[0].n;
      res.json({ ...f, variants, parent, comment_count: cc, signups: su, stats: await stats(f.id), lists: await MK().lists(f.store), import_notes: await require("./mk-forms-klaviyo").notesFor(f.id) }); } catch (e) { fail(res, e); } });
  app.put("/api/mk/forms/:id", async (req, res) => { if (!guard(req, res)) return; try { const f = await save(req.params.id, req.body || {}, actorOf(req), isAdmin(req)); CACHE.clear(); res.json(f); } catch (e) { fail(res, e); } });
  app.get("/api/mk/forms/:id/analytics", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const id = Number(req.params.id), days = Math.min(3650, Math.max(1, Number(req.query.days) || 30));
      const W = `form_id=$1 AND NOT preview AND at > now() - ($2 || ' days')::interval`;
      const t = (await db(`SELECT count(*) FILTER (WHERE type='viewed')::int viewed, count(*) FILTER (WHERE type='closed')::int closed,
          count(DISTINCT profile_id) FILTER (WHERE type LIKE 'submitted_%')::int submitted, count(*) FILTER (WHERE type='submitted_email')::int emails,
          count(*) FILTER (WHERE type='submitted_phone')::int phones, count(*) FILTER (WHERE type='submitted_question')::int answers FROM mk_form_events WHERE ${W}`, [id, days])).rows[0];
      const rev = (await db(`SELECT count(*)::int orders, COALESCE(sum(o.value),0) revenue FROM mk_events o
          JOIN (SELECT profile_id, min(at) at FROM mk_form_events WHERE ${W} AND type='submitted_email' GROUP BY profile_id) s ON s.profile_id=o.profile_id
          WHERE o.type='placed_order' AND o.at > s.at AND NOT COALESCE((o.props->>'cancelled')::boolean,false)`, [id, days])).rows[0];
      const daily = (await db(`SELECT to_char(d,'YYYY-MM-DD') day, COALESCE(v,0)::int viewed, COALESCE(sb,0)::int submitted FROM generate_series((now() - ($2 || ' days')::interval)::date, now()::date, '1 day') d
          LEFT JOIN (SELECT at::date dd, count(*) FILTER (WHERE type='viewed') v, count(DISTINCT profile_id) FILTER (WHERE type LIKE 'submitted_%') sb FROM mk_form_events WHERE ${W} GROUP BY 1) x ON x.dd=d::date ORDER BY d`, [id, Math.min(days, 365)])).rows;
      res.json({ days, ...t, rate: t.viewed ? Math.round(t.submitted / t.viewed * 1000) / 10 : 0, orders: rev.orders, revenue: Number(rev.revenue), rpv: t.viewed ? Number(rev.revenue) / t.viewed : 0, daily });
    } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/forms/:id/clone", async (req, res) => {
    if (!guard(req, res)) return;
    try { const f = await get(req.params.id); if (!f) return res.status(404).json({ error: "not found" });
      const to = store((req.body || {}).store) || f.store, other = to !== f.store;
      const r = (await db(`INSERT INTO mk_forms (store, name, status, priority, steps, style, targeting, teaser, coupon, list_id, sms_consent_text, email_consent_text, source, updated_by)
        VALUES ($1,$2,'draft',$3,$4,$5,$6,$7,$8,$9,$10,$11,'buzzin',$12) RETURNING id`, [to, (other ? f.name : `${f.name} (copy)`).slice(0, 120), f.priority || 0, JSON.stringify(f.steps), JSON.stringify(f.style), JSON.stringify(f.targeting), JSON.stringify(f.teaser), JSON.stringify(f.coupon), f.list_id, f.sms_consent_text, f.email_consent_text, actorOf(req)])).rows[0];
      res.json({ id: r.id }); } catch (e) { fail(res, e); }
  });
  app.delete("/api/mk/forms/:id", async (req, res) => { if (!admin(req, res)) return; try { await db(`DELETE FROM mk_forms WHERE id=$1`, [Number(req.params.id)]); await db(`DELETE FROM mk_form_imports WHERE form_id=$1`, [Number(req.params.id)]).catch(() => {}); CACHE.clear(); res.json({ ok: true }); } catch (e) { fail(res, e); } });
  app.put("/api/mk/tracking", async (req, res) => { if (!admin(req, res)) return; try { const b = req.body || {}; const cur = await MK().settings(); const t = { ...(cur.tracking || {}) }; for (const k of ["lb", "lbo"]) if (b[k] != null) t[k] = !!b[k]; const out = await MK().saveSettings({ tracking: t }, actorOf(req)); CACHE.clear(); res.json(out); } catch (e) { fail(res, e); } });
}

async function init() {
  await migrate();
  // Forms still using the old "by signing up for texts" wording get the checkbox wording.
  // Forms still using a store-name default wording move to the Brusche Inc. wording. Custom wording is left alone.
  try {
    for (const brand of [...Object.values(MK().STORES), "Larkspur Outlet"]) {
      for (const old of [SMS_CONSENT_V1(brand), SMS_CONSENT_V2(brand)]) await db(`UPDATE mk_forms SET sms_consent_text=$2 WHERE sms_consent_text=$1`, [old, SMS_CONSENT()]);
      await db(`UPDATE mk_forms SET email_consent_text=$2 WHERE email_consent_text=$1`, [EMAIL_CONSENT_V1(brand), EMAIL_CONSENT()]);
    }
  } catch (e) { console.error("form consent wording:", e.message); }
}
module.exports = { clearCache: () => CACHE.clear(), visitorConfig, init, migrate, routes, list, get, create, save, submit, config, issueCoupon, SMS_CONSENT, EMAIL_CONSENT };
