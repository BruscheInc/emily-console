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

const RUNTIME = () => fs.readFileSync(path.join(__dirname, "public", "mk-forms-runtime.js"), "utf8");
const PUBLIC_URL = () => (process.env.PUBLIC_URL || "https://emily-console-production.up.railway.app").replace(/\/$/, "");
const SMS_CONSENT_V1 = (brand) => `By signing up for texts, you agree to receive recurring automated marketing text messages (e.g. new arrivals, offers, cart reminders) from ${brand} at the number provided. Consent is not a condition of purchase. Msg & data rates may apply. Msg frequency varies. Reply STOP to cancel, HELP for help. See our Terms and Privacy Policy.`;
// Shown next to an UNCHECKED checkbox on the phone step (carriers require a separate, unchecked box).
const SMS_CONSENT = (brand) => `By checking this box, you agree to receive recurring automated marketing text messages (e.g. new arrivals, offers, cart reminders) from ${brand} at the number provided. Consent is not a condition of purchase. Msg & data rates may apply. Msg frequency varies. Reply STOP to cancel, HELP for help.`;
const SHOP_URL = { lb: "https://larkspurbaby.com", lbo: "https://larkspurbabyoutlet.com" };
const EMAIL_CONSENT = (brand) => `By signing up you agree to receive marketing emails from ${brand}. Unsubscribe anytime.`;

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS mk_forms (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
    priority INT NOT NULL DEFAULT 0, steps JSONB NOT NULL DEFAULT '[]', style JSONB NOT NULL DEFAULT '{}', targeting JSONB NOT NULL DEFAULT '{}', teaser JSONB NOT NULL DEFAULT '{}',
    coupon JSONB NOT NULL DEFAULT '{}', list_id BIGINT, sms_consent_text TEXT, email_consent_text TEXT, ab_of BIGINT, ab_split INT NOT NULL DEFAULT 50,
    source TEXT, ext_id TEXT, updated_by TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE TABLE IF NOT EXISTS mk_form_events (id BIGSERIAL PRIMARY KEY, form_id BIGINT NOT NULL, type TEXT NOT NULL, vid TEXT, profile_id BIGINT, preview BOOLEAN NOT NULL DEFAULT false, at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE INDEX IF NOT EXISTS mk_form_events_form ON mk_form_events (form_id, type, at)`);
  await db(`CREATE TABLE IF NOT EXISTS mk_visitors (vid TEXT PRIMARY KEY, store TEXT, profile_id BIGINT, first_seen TIMESTAMPTZ DEFAULT now(), last_seen TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE TABLE IF NOT EXISTS mk_coupons (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, code TEXT NOT NULL, profile_id BIGINT, form_id BIGINT, flow_id BIGINT, percent NUMERIC, amount NUMERIC,
    expires_at TIMESTAMPTZ, real BOOLEAN NOT NULL DEFAULT false, redeemed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS mk_coupons_code ON mk_coupons (store, code)`);
}

const DEFAULT_FORM = (brand) => ({
  steps: [
    { id: "s1", kind: "email", eyebrow: "Welcome to the family", title: "Take 10% off your first order", text: "Join for early access to new prints and members-only offers.", button: "Continue", decline: "No thanks" },
    { id: "s2", kind: "phone", title: "Get texts for early access", text: "Be first to know when new prints drop.", button: "Sign me up", skip: "No thanks" },
    { id: "s3", kind: "question", title: "One last thing", text: "So we can send the right sizes.", button: "Finish", skip: "Skip", fields: [{ key: "baby_stage", label: "Are you…", type: "choice", options: ["Expecting", "Parent of a little one", "Shopping for a gift"] }, { key: "baby_date", label: "Baby's due date or birthday", type: "date" }] },
    { id: "s4", kind: "success", title: "You're in!", text: "Here's your 10% off code. It also went to your inbox.", button: "Start shopping", link: "/collections/all" },
  ],
  style: { layout: "popup", width: 460, radius: 16, align: "center", colors: { bg: "#FFFFFF", text: "#242F3F", button: "#242F3F", button_text: "#FFFFFF" }, heading_font: "Georgia, serif", font: "Helvetica, Arial, sans-serif", image: "" },
  targeting: { delay_s: 6, scroll_pct: null, exit_intent: true, device: "all", visitors: "all", hide_subscribed: true, hide_days_after_close: 14, only_paths: "", hide_paths: "" },
  teaser: { text: "Get 10% off" },
  coupon: { enabled: true, percent: 10, prefix: "WELCOME", expires_days: 14 },
  sms_consent_text: SMS_CONSENT(brand), email_consent_text: EMAIL_CONSENT(brand),
});

async function list(store) {
  const rows = (await db(`SELECT f.*, (SELECT count(*)::int FROM mk_form_events e WHERE e.form_id=f.id AND e.type='viewed' AND NOT e.preview) views,
      (SELECT count(*)::int FROM mk_form_events e WHERE e.form_id=f.id AND e.type='submitted_email' AND NOT e.preview) emails,
      (SELECT count(*)::int FROM mk_form_events e WHERE e.form_id=f.id AND e.type='submitted_phone' AND NOT e.preview) phones
    FROM mk_forms f ${store ? "WHERE f.store=$1" : ""} ORDER BY f.priority DESC, f.updated_at DESC`, store ? [store] : [])).rows;
  return rows;
}
async function get(id) { return (await db(`SELECT * FROM mk_forms WHERE id=$1`, [Number(id)])).rows[0] || null; }
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
  const steps = (Array.isArray(b.steps) ? b.steps : cur.steps).slice(0, 8).map((s, i) => ({ ...s, id: s.id || `s${i + 1}`, kind: ["email", "phone", "question", "success"].includes(s.kind) ? s.kind : "email" }));
  return (await db(`UPDATE mk_forms SET name=$2, status=$3, priority=$4, steps=$5, style=$6, targeting=$7, teaser=$8, coupon=$9, list_id=$10, sms_consent_text=$11, email_consent_text=$12, updated_by=$13, updated_at=now() WHERE id=$1 RETURNING *`,
    [cur.id, b.name || cur.name, status, Number(b.priority != null ? b.priority : cur.priority) || 0, JSON.stringify(steps), JSON.stringify(b.style || cur.style), JSON.stringify(b.targeting || cur.targeting),
     JSON.stringify(b.teaser || cur.teaser), JSON.stringify(b.coupon || cur.coupon), b.list_id != null ? Number(b.list_id) : cur.list_id, b.sms_consent_text != null ? b.sms_consent_text : cur.sms_consent_text,
     b.email_consent_text != null ? b.email_consent_text : cur.email_consent_text, who || null])).rows[0];
}
const publicForm = (f) => ({ id: f.id, shop_url: SHOP_URL[f.store] || "", priority: f.priority, steps: f.steps, style: f.style, targeting: f.targeting, teaser: f.teaser, sms_consent_text: f.sms_consent_text, email_consent_text: f.email_consent_text });

/* ---------------- coupons ---------------- */
async function issueCoupon(store, form, profile) {
  const c = form.coupon || {};
  if (!c.enabled) return null;
  const prior = (await db(`SELECT code FROM mk_coupons WHERE store=$1 AND form_id=$2 AND profile_id=$3 ORDER BY id DESC LIMIT 1`, [store, form.id, profile.id])).rows[0];
  if (prior) return prior.code;
  const code = `${String(c.prefix || "WELCOME").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12)}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const expires = new Date(Date.now() + (Number(c.expires_days) || 14) * 864e5);
  let real = false;
  if (form.status === "live") {
    // Real single-use code in Shopify, only for live forms.
    const st = require("./returns").shopFor(store);
    const basic = { title: `${form.name} · ${code}`, code, startsAt: new Date().toISOString(), endsAt: expires.toISOString(), customerSelection: { all: true },
      customerGets: { value: { percentage: (Number(c.percent) || 10) / 100 }, items: { all: true } }, appliesOncePerCustomer: true, usageLimit: 1 };
    const r = await require("./returns").gql(st, `mutation($b:DiscountCodeBasicInput!){discountCodeBasicCreate(basicCodeDiscount:$b){codeDiscountNode{id} userErrors{field message}}}`, { b: basic });
    const ue = r.discountCodeBasicCreate.userErrors; if (ue && ue.length) throw new Error(ue.map((x) => x.message).join("; "));
    real = true;
  }
  await db(`INSERT INTO mk_coupons (store, code, profile_id, form_id, percent, expires_at, real) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [store, code, profile.id, form.id, Number(c.percent) || 10, expires, real]);
  await db(`UPDATE mk_profiles SET props = props || jsonb_build_object('coupon', $2::text, 'coupon_expires', $3::text) WHERE id=$1`, [profile.id, code, expires.toISOString()]);
  return code;
}

/* ---------------- a submission from the store ---------------- */
async function submit(store, b, ip) {
  const form = await get(b.form_id);
  if (!form || form.store !== store) return { error: "This form isn't available." };
  if (form.status === "draft") return { error: "This form isn't available." };
  const isPreview = form.status !== "live";
  const vals = b.values || {};
  const prof = await findOrCreateFromVisitor(store, b.vid, vals);
  if (!prof) return { error: b.kind === "email" ? "Please enter a valid email." : "Please enter your email first." };
  const brand = MK().STORES[store];
  const src = `form:${form.id}${isPreview ? ":preview" : ""}`;
  if (b.kind === "email" && vals.email) { await MK().setConsent(prof, "email", "subscribed", { source: src, detail: form.name, wording: form.email_consent_text || EMAIL_CONSENT(brand) }); }
  if (b.kind === "phone" && vals.phone && vals.sms_consent_checked !== true) return { error: "Please check the box to agree to texts." };
  if (b.kind === "phone" && vals.phone) {
    const phone = MK().normPhone(vals.phone);
    await db(`UPDATE mk_profiles SET phone=COALESCE(phone,$2), updated_at=now() WHERE id=$1`, [prof.id, phone]); prof.phone = prof.phone || phone;
    await MK().setConsent(prof, "sms", "subscribed", { source: src, detail: `${form.name} · checkbox ticked`, wording: form.sms_consent_text || SMS_CONSENT(brand) });
  }
  if (b.kind === "question") {
    const props = {}; for (const [k, v] of Object.entries(vals)) if (/^[a-z0-9_]{1,40}$/i.test(k) && String(v).length < 200) props[k] = String(v);
    if (Object.keys(props).length) await db(`UPDATE mk_profiles SET props = props || $2::jsonb, updated_at=now() WHERE id=$1`, [prof.id, JSON.stringify(props)]);
  }
  await db(`INSERT INTO mk_form_events (form_id, type, vid, profile_id, preview) VALUES ($1,$2,$3,$4,$5)`, [form.id, `submitted_${b.kind}`, b.vid || null, prof.id, isPreview || !!b.preview]);
  let code = null;
  if (b.kind === "email") {
    if (form.list_id) { await MK().addToList(form.list_id, prof.id, src); await MK().track(store, "joined_list", { profileId: prof.id, props: { list_id: form.list_id, form_id: form.id, preview: isPreview }, source: "form" }); }
    await MK().track(store, "submitted_form", { profileId: prof.id, props: { form_id: form.id, form: form.name, preview: isPreview }, source: "form" });
    try { code = await issueCoupon(store, form, prof); } catch (e) { console.error("form coupon:", e.message); }
  }
  return { ok: true, code };
}
async function findOrCreateFromVisitor(store, vid, vals) {
  let prof = null;
  if (vals.email) prof = await MK().upsertProfile(store, { email: vals.email }, "form");
  if (!prof && vid) { const v = (await db(`SELECT profile_id FROM mk_visitors WHERE vid=$1`, [vid])).rows[0]; if (v && v.profile_id) prof = (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [v.profile_id])).rows[0]; }
  if (!prof && vals.phone) prof = await MK().upsertProfile(store, { phone: vals.phone }, "form");
  if (prof && vid) await db(`INSERT INTO mk_visitors (vid, store, profile_id) VALUES ($1,$2,$3) ON CONFLICT (vid) DO UPDATE SET profile_id=EXCLUDED.profile_id, last_seen=now()`, [String(vid).slice(0, 40), store, prof.id]);
  return prof;
}

/* ---------------- config for the store script (cached a minute) ---------------- */
const CACHE = new Map();
async function config(store, preview) {
  const k = `${store}:${preview ? 1 : 0}`; const hit = CACHE.get(k); if (hit && hit.t > Date.now() - 60000) return hit.v;
  const st = await MK().settings();
  const rows = (await db(`SELECT * FROM mk_forms WHERE store=$1 AND (status='live' ${preview ? "OR status='preview'" : ""}) ORDER BY priority DESC`, [store])).rows;
  const v = { forms: rows.map(publicForm), tracking: !!(st.tracking && st.tracking[store]) };
  CACHE.set(k, { t: Date.now(), v }); return v;
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
  app.get("/api/mkf/:store/config", async (req, res) => { cors(res); const s = store(req.params.store); if (!s) return res.status(404).json({ forms: [] }); try { res.json(await config(s, req.query.preview === "1")); } catch (e) { res.json({ forms: [] }); } });
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
    if (!s || !["viewed_product", "added_to_cart", "active_on_site"].includes(b.type)) return res.json({ ok: false });
    try { const cfg = await config(s, false); if (!cfg.tracking && !b.preview) return res.json({ ok: false });
      const v = b.vid ? (await db(`INSERT INTO mk_visitors (vid, store) VALUES ($1,$2) ON CONFLICT (vid) DO UPDATE SET last_seen=now() RETURNING profile_id`, [String(b.vid).slice(0, 40), s])).rows[0] : null;
      if (b.type !== "active_on_site" || (v && v.profile_id)) await MK().track(s, b.type, { profileId: v && v.profile_id, props: { ...(b.props || {}), page: String(b.page || "").slice(0, 200), vid: b.vid }, source: "site" });
      res.json({ ok: true }); } catch (e) { res.json({ ok: false }); }
  });

  /* staff: Form Studio */
  app.get("/api/mk/forms", async (req, res) => { if (!guard(req, res)) return; try { res.json({ forms: await list(store(req.query.store)), klaviyo: (await db(`SELECT id, name, data FROM hd_klaviyo WHERE kind='form'`).catch(() => ({ rows: [] }))).rows.map((r) => ({ id: r.id, name: r.name, status: r.data && r.data.attributes && r.data.attributes.status })) }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/forms", async (req, res) => { if (!guard(req, res)) return; try { const s = store((req.body || {}).store); if (!s) return res.status(400).json({ error: "Pick a store first" }); res.json(await create(s, (req.body || {}).name, actorOf(req))); } catch (e) { fail(res, e); } });
  app.get("/api/mk/forms/:id", async (req, res) => { if (!guard(req, res)) return; try { const f = await get(req.params.id); if (!f) return res.status(404).json({ error: "not found" }); res.json({ ...f, stats: await stats(f.id), lists: await MK().lists(f.store) }); } catch (e) { fail(res, e); } });
  app.put("/api/mk/forms/:id", async (req, res) => { if (!guard(req, res)) return; try { const f = await save(req.params.id, req.body || {}, actorOf(req), isAdmin(req)); CACHE.clear(); res.json(f); } catch (e) { fail(res, e); } });
  app.delete("/api/mk/forms/:id", async (req, res) => { if (!admin(req, res)) return; try { await db(`DELETE FROM mk_forms WHERE id=$1`, [Number(req.params.id)]); CACHE.clear(); res.json({ ok: true }); } catch (e) { fail(res, e); } });
  app.put("/api/mk/tracking", async (req, res) => { if (!admin(req, res)) return; try { const b = req.body || {}; const cur = await MK().settings(); const t = { ...(cur.tracking || {}) }; for (const k of ["lb", "lbo"]) if (b[k] != null) t[k] = !!b[k]; const out = await MK().saveSettings({ tracking: t }, actorOf(req)); CACHE.clear(); res.json(out); } catch (e) { fail(res, e); } });
}

async function init() {
  await migrate();
  // Forms still using the old "by signing up for texts" wording get the checkbox wording.
  try { for (const [st, brand] of Object.entries(MK().STORES)) await db(`UPDATE mk_forms SET sms_consent_text=$3 WHERE store=$1 AND sms_consent_text=$2`, [st, SMS_CONSENT_V1(brand), SMS_CONSENT(brand)]); } catch (e) { console.error("form consent wording:", e.message); }
}
module.exports = { init, migrate, routes, list, get, create, save, submit, config, issueCoupon, SMS_CONSENT, EMAIL_CONSENT };
