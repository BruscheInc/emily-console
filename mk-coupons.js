/* Buzzin Marketing · unique coupon codes for emails and texts.
   When a message uses {{ coupon }} and the person has no usable code, Buzzin makes one just for them:
   a single-use Shopify discount (once per customer, usage limit 1) using Settings → "Coupon codes in emails & texts".
   A code is reused while it's still valid and unused; a new one is made after it expires or is used. */
const crypto = require("crypto");
const { db } = require("./core");
const MK = () => require("./mk-core");

const DEFAULTS = { percent: 10, days: 7, prefix: "WELCOME" };
async function defaults() { const s = await MK().settings(); return { ...DEFAULTS, ...((s && s.coupons) || {}) }; }
const makeCode = (prefix) => `${String(prefix || "WELCOME").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "WELCOME"}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
const usesCoupon = (tpl) => { try { return /\{\{\s*coupon\b|"type"\s*:\s*"coupon"|coupon_code/.test(JSON.stringify([tpl.blocks, tpl.doc, tpl.body, tpl.subject])); } catch (e) { return false; } };

/* An offer = what the code does, set on a coupon block (like Shopify's "Create discount"):
   type order | products | bxgy | shipping, value % or $, what it applies to, minimum, combinations, days valid, prefix. */
const ids = (a) => (Array.isArray(a) ? a : []).filter((x) => x && /^gid:\/\/shopify\/(Collection|Product)\/\d+$/.test(x.id)).slice(0, 50).map((x) => ({ id: x.id, title: String(x.title || "").slice(0, 120) }));
function cleanOffer(o, d = DEFAULTS) {
  if (!o || o.mode === "shared") return null;
  const t = ["order", "products", "bxgy", "shipping"].includes(o.type) ? o.type : "order";
  return { type: t, value_type: o.value_type === "amount" ? "amount" : "percent", value: Math.max(0, Math.min(o.value_type === "amount" ? 10000 : 100, Number(o.value == null ? d.percent : o.value) || 0)),
    applies: o.applies === "products" ? "products" : "collections", items: ids(o.items),
    buy_qty: Math.max(1, Math.min(100, Number(o.buy_qty) || 1)), buy_applies: o.buy_applies === "products" ? "products" : "collections", buy_items: ids(o.buy_items),
    get_qty: Math.max(1, Math.min(100, Number(o.get_qty) || 1)), get_applies: o.get_applies === "products" ? "products" : "collections", get_items: ids(o.get_items), get_effect: ["percent", "amount"].includes(o.get_effect) ? o.get_effect : "free", get_percent: Math.max(1, Math.min(100, Number(o.get_percent) || 50)), get_amount: Math.max(0, Number(o.get_amount) || 0),
    buy_mode: o.buy_mode === "amount" ? "amount" : "qty", buy_amount: Math.max(0, Number(o.buy_amount) || 0), max_per_order: Math.max(0, Math.min(100, Number(o.max_per_order) || 0)),
    min: ["amount", "qty"].includes(o.min) ? o.min : "none", min_value: Math.max(0, Number(o.min_value) || 0),
    countries: Array.isArray(o.countries) ? o.countries.map((x) => String(x).toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)).slice(0, 50) : [], max_ship: Math.max(0, Number(o.max_ship) || 0),
    combine_order: !!o.combine_order, combine_product: !!o.combine_product, combine_shipping: !!o.combine_shipping,
    days: Math.max(1, Math.min(365, Number(o.days == null ? d.days : o.days) || 7)), prefix: String(o.prefix || d.prefix || "WELCOME").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "WELCOME" };
}
const offerKey = (o) => (o ? crypto.createHash("sha1").update(JSON.stringify({ ...o, items: o.items.map((x) => x.id), buy_items: o.buy_items.map((x) => x.id), get_items: o.get_items.map((x) => x.id) })).digest("hex").slice(0, 16) : null);
const itemsInput = (applies, list) => (!list.length ? { all: true } : applies === "products" ? { products: { productsToAdd: list.map((x) => x.id) } } : { collections: { add: list.map((x) => x.id) } });
/** The Shopify mutation and input for one code. */
function discountInput(o, code, title, expires) {
  const base = { title, code, startsAt: new Date().toISOString(), endsAt: expires.toISOString(), customerSelection: { all: true }, appliesOncePerCustomer: true, usageLimit: 1,
    combinesWith: { orderDiscounts: o.combine_order, productDiscounts: o.combine_product, shippingDiscounts: o.combine_shipping } };
  const minReq = o.min === "amount" && o.min_value ? { subtotal: { greaterThanOrEqualToSubtotal: String(o.min_value) } } : o.min === "qty" && o.min_value ? { quantity: { greaterThanOrEqualToQuantity: String(Math.round(o.min_value)) } } : null;
  if (o.type === "shipping") return { m: "discountCodeFreeShippingCreate", arg: "freeShippingCodeDiscount", type: "DiscountCodeFreeShippingInput",
    input: { ...base, destination: o.countries.length ? { countries: { add: o.countries } } : { all: true }, ...(o.max_ship ? { maximumShippingPrice: String(o.max_ship) } : {}), ...(minReq ? { minimumRequirement: minReq } : {}) } };
  if (o.type === "bxgy") {
    if (!o.buy_items.length || !o.get_items.length) throw new Error("Buy X get Y needs the products or collections they buy and the ones they get.");
    return { m: "discountCodeBxgyCreate", arg: "bxgyCodeDiscount", type: "DiscountCodeBxgyInput",
    input: { ...base, ...(o.max_per_order ? { usesPerOrderLimit: o.max_per_order } : {}),
      customerBuys: { value: o.buy_mode === "amount" ? { amount: String(o.buy_amount || 1) } : { quantity: String(o.buy_qty) }, items: itemsInput(o.buy_applies, o.buy_items) },
      customerGets: { value: { discountOnQuantity: { quantity: String(o.get_qty), effect: o.get_effect === "amount" ? { amount: String(o.get_amount || 1) } : { percentage: o.get_effect === "free" ? 1 : o.get_percent / 100 } } }, items: itemsInput(o.get_applies, o.get_items) } } }; }
  const value = o.value_type === "amount" ? { discountAmount: { amount: String(o.value), appliesOnEachItem: false } } : { percentage: o.value / 100 };
  return { m: "discountCodeBasicCreate", arg: "basicCodeDiscount", type: "DiscountCodeBasicInput",
    input: { ...base, customerGets: { value, items: o.type === "products" ? itemsInput(o.applies, o.items) : { all: true } }, ...(minReq ? { minimumRequirement: minReq } : {}) } };
}
/** In words, for the editor: "10% off entire order · min $50 · 7 days". */
function describe(o) {
  if (!o) return "";
  const v = o.value_type === "amount" ? `$${o.value} off` : `${o.value}% off`, names = (l) => (l.length ? l.map((x) => x.title).slice(0, 3).join(", ") + (l.length > 3 ? "…" : "") : "anything");
  const what = o.type === "shipping" ? `Free shipping${o.countries.length ? ` to ${o.countries.join(", ")}` : ""}` : o.type === "bxgy" ? `Buy ${o.buy_mode === "amount" ? `$${o.buy_amount}` : o.buy_qty} of ${names(o.buy_items)}, get ${o.get_qty} of ${names(o.get_items)} ${o.get_effect === "free" ? "free" : o.get_effect === "amount" ? `$${o.get_amount} off each` : `${o.get_percent}% off`}` : o.type === "products" ? `${v} ${names(o.items)}` : `${v} entire order`;
  return [what, o.min === "amount" && o.min_value ? `min $${o.min_value}` : o.min === "qty" && o.min_value ? `min ${o.min_value} items` : "", `valid ${o.days} days`].filter(Boolean).join(" · ");
}

/** A code a test or preview can show: looks real, isn't created in Shopify. */
function sample(prefix) { return makeCode(prefix || DEFAULTS.prefix); }

/** The person's usable code, or a new single-use Shopify code made for them. `real` = create it in Shopify (only when actually sending). */
async function forProfile(store, profile, { real = true, source = "message", offer = null } = {}) {
  const d0 = await defaults(); const o = offer ? cleanOffer(offer, d0) : null, key = offerKey(o);
  if (!profile || !profile.id) return sample((o || d0).prefix);
  const cur = (await db(`SELECT code FROM mk_coupons c WHERE c.profile_id=$1 AND c.real AND c.offer_key IS NOT DISTINCT FROM $2 AND (c.expires_at IS NULL OR c.expires_at > now() + interval '1 day')
      AND NOT EXISTS (SELECT 1 FROM mk_events e WHERE e.profile_id=c.profile_id AND e.type='placed_order' AND e.at > now() - interval '120 days' AND upper(e.props::text) LIKE '%' || upper(c.code) || '%')
      ORDER BY c.id DESC LIMIT 1`, [profile.id, key]).catch(() => ({ rows: [] }))).rows[0];
  if (cur) return cur.code;
  const off = o || cleanOffer({ type: "order", value_type: "percent", value: d0.percent, days: d0.days, prefix: d0.prefix }, d0);
  if (!real) return sample(off.prefix);
  const { code, expires, discount_id, redeem_id } = await claim(store, off, source);
  await db(`INSERT INTO mk_coupons (store, code, profile_id, percent, amount, expires_at, real, offer_key, discount_id, redeem_id) VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9)`,
    [store, code, profile.id, off.type !== "shipping" && off.value_type === "percent" ? off.value : null, off.value_type === "amount" ? off.value : null, expires, key, discount_id || null, redeem_id || null]);
  if (key) return code;   // a block's own offer doesn't replace the person's main code
  await db(`UPDATE mk_profiles SET props = props || jsonb_build_object('coupon', $2::text, 'coupon_expires', $3::text) WHERE id=$1`, [profile.id, code, expires.toISOString()]);
  if (profile.props) { profile.props.coupon = code; profile.props.coupon_expires = expires.toISOString(); }
  return code;
}

/* ---- Ready-made codes, so a person never waits on Shopify ----
   For every offer in use Buzzin keeps a small pool of single-use codes already created in Shopify.
   Sending (or a form's success step) takes one instantly; a background job tops the pool back up. */
const POOL = 25;
let migrated = false;
async function migrate() {
  if (migrated) return; migrated = true;
  await db(`CREATE TABLE IF NOT EXISTS mk_coupon_pool (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, offer_key TEXT NOT NULL, code TEXT NOT NULL, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`);
  await db(`ALTER TABLE mk_coupon_pool ADD COLUMN IF NOT EXISTS redeem_id TEXT`);
  await db(`ALTER TABLE mk_coupon_pool ADD COLUMN IF NOT EXISTS discount_id TEXT`);
  await db(`ALTER TABLE mk_coupon_pool ALTER COLUMN expires_at DROP NOT NULL`).catch(() => {});
  await db(`CREATE INDEX IF NOT EXISTS mk_coupon_pool_k ON mk_coupon_pool (store, offer_key, created_at)`);
  await db(`CREATE TABLE IF NOT EXISTS mk_coupon_offers (store TEXT NOT NULL, offer_key TEXT NOT NULL, offer JSONB NOT NULL, last_used TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (store, offer_key))`);
  await db(`ALTER TABLE mk_coupon_offers ADD COLUMN IF NOT EXISTS discount_id TEXT`);
  await db(`ALTER TABLE mk_coupons ADD COLUMN IF NOT EXISTS discount_id TEXT`).catch(() => {});
  await db(`ALTER TABLE mk_coupons ADD COLUMN IF NOT EXISTS redeem_id TEXT`).catch(() => {});
  await db(`ALTER TABLE mk_coupons ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ`).catch(() => {});
}
/* One Shopify discount per offer, holding all of its codes (Shopify's limits — one use, one per customer — apply to each code).
   Shopify's Discounts page shows one line per offer, not one per person. A code's days are enforced by Buzzin removing it from the discount when they're up. */
const R = () => require("./returns");
const gerr = (x) => { const ue = x && x.userErrors; if (ue && ue.length) throw new Error(ue.map((e) => e.message).join("; ")); };
const making = new Map();
function discountFor(store, key, off) {   // one at a time per offer, so two senders never make two discounts
  const k = store + ":" + key; if (!making.has(k)) making.set(k, discountFor0(store, key, off).finally(() => making.delete(k)));
  return making.get(k);
}
async function discountFor0(store, key, off) {
  const row = (await db(`SELECT discount_id FROM mk_coupon_offers WHERE store=$1 AND offer_key=$2`, [store, key])).rows[0];
  if (row && row.discount_id) return row.discount_id;
  const seed = `${off.prefix}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;   // Shopify needs one code to make the discount; this one is never sent
  const di = discountInput(off, seed, `Buzzin · ${describe(off)} · ${key.slice(0, 6)}`, new Date());
  delete di.input.endsAt;   // no end date on the discount itself; each code is removed when its days are up
  const r = await R().gql(R().shopFor(store), `mutation($b:${di.type}!){${di.m}(${di.arg}:$b){codeDiscountNode{id} userErrors{field message}}}`, { b: di.input });
  gerr(r[di.m]); const id = r[di.m].codeDiscountNode.id;
  await db(`INSERT INTO mk_coupon_offers (store, offer_key, offer, discount_id) VALUES ($1,$2,$3,$4) ON CONFLICT (store, offer_key) DO UPDATE SET discount_id=EXCLUDED.discount_id`, [store, key, JSON.stringify(off), id]);
  return id;
}
/** Add n new codes to the offer's discount and put them in the ready pool. */
async function addCodes(store, key, off, n) {
  const did = await discountFor(store, key, off), st = R().shopFor(store);
  const codes = Array.from({ length: n }, () => makeCode(off.prefix));
  const r = await R().gql(st, `mutation($id:ID!,$c:[DiscountRedeemCodeInput!]!){discountRedeemCodeBulkAdd(discountId:$id, codes:$c){bulkCreation{id} userErrors{field message}}}`, { id: did, c: codes.map((code) => ({ code })) });
  gerr(r.discountRedeemCodeBulkAdd); const bid = r.discountRedeemCodeBulkAdd.bulkCreation.id;
  let got = null;
  for (let i = 0; i < 20; i++) {   // Shopify adds them in a few hundred milliseconds
    const q = await R().gql(st, `query($id:ID!){ node(id:$id) { ... on DiscountRedeemCodeBulkCreation { done codes(first: 250) { nodes { code errors { message } discountRedeemCode { id } } } } } }`, { id: bid });
    if (q.node && q.node.done) { got = q.node.codes.nodes; break; }
    await new Promise((res) => setTimeout(res, 300));
  }
  const ok = (got || []).filter((x) => x.discountRedeemCode && !(x.errors || []).length);
  for (const x of ok) await db(`INSERT INTO mk_coupon_pool (store, offer_key, code, redeem_id, discount_id) VALUES ($1,$2,$3,$4,$5)`, [store, key, x.code, x.discountRedeemCode.id, did]);
  return ok.length;
}
/** A code for this offer: from the ready pool (instant), else added now (about a second). */
async function claim(store, off, source) {
  await migrate(); const key = offerKey(off) || "default";
  await db(`INSERT INTO mk_coupon_offers (store, offer_key, offer, last_used) VALUES ($1,$2,$3,now()) ON CONFLICT (store, offer_key) DO UPDATE SET last_used=now(), offer=EXCLUDED.offer`, [store, key, JSON.stringify(off)]).catch(() => {});
  const take = async () => (await db(`DELETE FROM mk_coupon_pool WHERE id = (SELECT id FROM mk_coupon_pool WHERE store=$1 AND offer_key=$2 ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING code, redeem_id, discount_id`, [store, key]).catch(() => ({ rows: [] }))).rows[0];
  let got = await take();
  if (!got) { await addCodes(store, key, off, 5); got = await take(); }
  setImmediate(() => refill(store, key).catch((e) => console.log(`🎟️  coupon pool: ${e.message}`)));
  if (!got) throw new Error("Shopify didn't make the code");
  return { code: got.code, expires: new Date(Date.now() + off.days * 864e5), discount_id: got.discount_id, redeem_id: got.redeem_id };
}
const filling = new Set();
async function refill(store, key) {
  const id = store + ":" + key; if (filling.has(id)) return; filling.add(id);
  try {
    await migrate();
    const o = (await db(`SELECT offer FROM mk_coupon_offers WHERE store=$1 AND offer_key=$2`, [store, key])).rows[0]; if (!o) return;
    const have = (await db(`SELECT count(*)::int n FROM mk_coupon_pool WHERE store=$1 AND offer_key=$2`, [store, key])).rows[0].n;
    if (have < POOL) await addCodes(store, key, o.offer, POOL - have);
  } finally { filling.delete(id); }
}
/** Remove codes whose days are up (used or not) so they stop working at checkout. */
async function expireCodes() {
  await migrate();
  const rows = (await db(`SELECT id, store, discount_id, redeem_id FROM mk_coupons WHERE real AND redeem_id IS NOT NULL AND removed_at IS NULL AND expires_at < now() ORDER BY id LIMIT 1000`)).rows;
  const groups = {}; for (const r of rows) (groups[r.store + "|" + r.discount_id] = groups[r.store + "|" + r.discount_id] || []).push(r);
  for (const [k, list] of Object.entries(groups)) {
    const [store, did] = k.split("|");
    for (let i = 0; i < list.length; i += 250) {
      const part = list.slice(i, i + 250);
      try { const r = await R().gql(R().shopFor(store), `mutation($id:ID!,$ids:[ID!]){discountCodeRedeemCodeBulkDelete(discountId:$id, ids:$ids){job{id} userErrors{field message}}}`, { id: did, ids: part.map((x) => x.redeem_id) });
        gerr(r.discountCodeRedeemCodeBulkDelete); await db(`UPDATE mk_coupons SET removed_at=now() WHERE id = ANY($1)`, [part.map((x) => x.id)]);
      } catch (e) { console.log(`🎟️  expiring codes: ${e.message}`); }
    }
  }
  if (rows.length) console.log(`🎟️  ${rows.length} coupon codes past their days removed from Shopify`);
}
/** Keep pools full for offers used in the last 30 days. */
async function refillAll() {
  await migrate();
  for (const r of (await db(`SELECT store, offer_key FROM mk_coupon_offers WHERE last_used > now() - interval '30 days'`)).rows) await refill(r.store, r.offer_key).catch((e) => console.log(`🎟️  coupon pool ${r.offer_key}: ${e.message}`));
}
/** Get pools ready before the first send: called when an email is saved or a form goes live. */
async function prepare(store, offers) {
  await migrate(); const d0 = await defaults();
  for (const raw of offers) { const off = raw === "default" ? cleanOffer({ type: "order", value: d0.percent, days: d0.days, prefix: d0.prefix }, d0) : cleanOffer(raw, d0); if (!off) continue;
    const key = offerKey(off) || "default";
    await db(`INSERT INTO mk_coupon_offers (store, offer_key, offer, last_used) VALUES ($1,$2,$3,now()) ON CONFLICT (store, offer_key) DO UPDATE SET last_used=now(), offer=EXCLUDED.offer`, [store, key, JSON.stringify(off)]);
    setImmediate(() => refill(store, key).catch((e) => console.log(`🎟️  coupon pool: ${e.message}`))); }
}
/** One-time: ready codes made before v4.92 were one Shopify discount each; delete the unused ones. */
async function cleanupOld() {
  await migrate();
  const old = (await db(`SELECT id, store, code FROM mk_coupon_pool WHERE redeem_id IS NULL LIMIT 500`)).rows; let n = 0;
  for (const r of old) {
    try { const st = R().shopFor(r.store); const q = await R().gql(st, `query($c:String!){ codeDiscountNodeByCode(code:$c){ id } }`, { c: r.code });
      if (q.codeDiscountNodeByCode) { const d = await R().gql(st, `mutation($id:ID!){ discountCodeDelete(id:$id){ deletedCodeDiscountId userErrors{field message} } }`, { id: q.codeDiscountNodeByCode.id }); gerr(d.discountCodeDelete); n++; }
      await db(`DELETE FROM mk_coupon_pool WHERE id=$1`, [r.id]);
    } catch (e) { console.log(`🎟️  old ready code ${r.code}: ${e.message}`); }
  }
  if (old.length) console.log(`🎟️  removed ${n} single-code discounts left from the old ready pool`);
}
function start() { setTimeout(() => { cleanupOld().catch((e) => console.log(`🎟️  cleanup: ${e.message}`)); }, 30 * 1000);
  setTimeout(() => { refillAll().catch(() => {}); expireCodes().catch(() => {}); setInterval(() => refillAll().catch(() => {}), 3 * 60 * 1000); setInterval(() => expireCodes().catch((e) => console.log(`🎟️  expiring codes: ${e.message}`)), 30 * 60 * 1000); }, 60 * 1000); }

/** Every coupon block's offer in a template (unique-code blocks only). */
function offersIn(tpl) {
  const out = []; const walk = (x) => { if (!x || typeof x !== "object") return; if (Array.isArray(x)) return x.forEach(walk);
    if (x.type === "coupon" && x.data && x.data.properties && x.data.properties.offer && x.data.properties.offer.mode !== "shared") out.push(x.data.properties.offer);
    Object.values(x).forEach(walk); };
  try { walk(typeof tpl.doc === "string" ? JSON.parse(tpl.doc) : tpl.doc); } catch (e) {}
  return out;
}
/** Codes for one person and one message: { coupon (for plain {{ coupon }}), coupons: { offerKey: code } }. */
async function codesFor(store, profile, tpl, opts = {}) {
  if (!usesCoupon(tpl)) return {};
  const d0 = await defaults(), coupons = {};
  for (const o of offersIn(tpl)) { const k = offerKey(cleanOffer(o, d0)); if (!coupons[k]) coupons[k] = await forProfile(store, profile, { ...opts, offer: o }); }
  const first = Object.values(coupons)[0];
  const coupon = first || await forProfile(store, profile, opts);   // a link like /discount/{{ coupon }} uses the block's code
  return { coupon, coupons };
}

/** Tests feel like the live message: the real profile behind a test-list address (first name, links, its own real code).
    Codes are only made for addresses on the internal test list. */
async function forTest(store, to, channel, msg) {
  const s = await MK().settings(), tl = (s.test_list || []).map((x) => String(x).trim().toLowerCase());
  const email = channel === "email" ? MK().normEmail(to) : null, phone = channel === "sms" ? MK().normPhone(to) : null;
  const onList = tl.includes(String(to || "").trim().toLowerCase()) || (phone && tl.some((x) => MK().normPhone(x) === phone));
  let prof = (email || phone) ? await MK().findProfile(null, { email, phone }).catch(() => null) : null;
  if (!prof && onList) prof = await MK().upsertProfile("lb", { email, phone }, "test list").catch(() => null);
  const view = prof ? { ...prof } : { id: 0, email, phone, first_name: "Test" };
  let codes = {};
  if (msg && usesCoupon(msg)) codes = await codesFor(store, view, msg, { real: !!(prof && onList), source: "test" });
  return { profile: view, coupon: codes.coupon || null, coupons: codes.coupons || {} };
}

module.exports = { start, prepare, claim, refillAll, expireCodes, addCodes, migrate, codesFor, offersIn, cleanOffer, offerKey, describe, discountInput, forTest, DEFAULTS, defaults, forProfile, sample, usesCoupon, makeCode };
