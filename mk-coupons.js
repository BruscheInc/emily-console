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
const usesCoupon = (tpl) => { try { return /\{\{\s*coupon\b|"type"\s*:\s*"coupon"/.test(JSON.stringify([tpl.blocks, tpl.doc, tpl.body, tpl.subject])); } catch (e) { return false; } };

/** A code a test or preview can show: looks real, isn't created in Shopify. */
function sample(prefix) { return makeCode(prefix || DEFAULTS.prefix); }

/** The person's usable code, or a new single-use Shopify code made for them. `real` = create it in Shopify (only when actually sending). */
async function forProfile(store, profile, { real = true, source = "message" } = {}) {
  if (!profile || !profile.id) return sample();
  const cur = (await db(`SELECT code FROM mk_coupons c WHERE c.profile_id=$1 AND c.real AND (c.expires_at IS NULL OR c.expires_at > now() + interval '1 day')
      AND NOT EXISTS (SELECT 1 FROM mk_events e WHERE e.profile_id=c.profile_id AND e.type='placed_order' AND e.at > now() - interval '120 days' AND upper(e.props::text) LIKE '%' || upper(c.code) || '%')
      ORDER BY c.id DESC LIMIT 1`, [profile.id]).catch(() => ({ rows: [] }))).rows[0];
  if (cur) return cur.code;
  const d = await defaults();
  if (!real) return sample(d.prefix);
  const code = makeCode(d.prefix), expires = new Date(Date.now() + (Number(d.days) || 7) * 864e5), pct = Math.min(90, Math.max(1, Number(d.percent) || 10));
  const R = require("./returns"), st = R.shopFor(store);
  const r = await R.gql(st, `mutation($b:DiscountCodeBasicInput!){discountCodeBasicCreate(basicCodeDiscount:$b){codeDiscountNode{id} userErrors{field message}}}`,
    { b: { title: `Buzzin ${source} · ${code}`, code, startsAt: new Date().toISOString(), endsAt: expires.toISOString(), customerSelection: { all: true },
      customerGets: { value: { percentage: pct / 100 }, items: { all: true } }, appliesOncePerCustomer: true, usageLimit: 1 } });
  const ue = r.discountCodeBasicCreate.userErrors; if (ue && ue.length) throw new Error(ue.map((x) => x.message).join("; "));
  await db(`INSERT INTO mk_coupons (store, code, profile_id, percent, expires_at, real) VALUES ($1,$2,$3,$4,$5,true)`, [store, code, profile.id, pct, expires]);
  await db(`UPDATE mk_profiles SET props = props || jsonb_build_object('coupon', $2::text, 'coupon_expires', $3::text) WHERE id=$1`, [profile.id, code, expires.toISOString()]);
  if (profile.props) { profile.props.coupon = code; profile.props.coupon_expires = expires.toISOString(); }
  return code;
}

module.exports = { DEFAULTS, defaults, forProfile, sample, usesCoupon, makeCode };
