/**
 * Buzzin · Rewards (loyalty). Points, rewards, VIP tiers and referrals for each store, run entirely by Buzzin.
 * It's built ready to use but stays OFF until "Launch program" is clicked in Buzzin → Rewards → Settings.
 * While off, nothing is earned, nothing shows on the site (except in preview with ?bz_rewards=1) and no codes are made.
 *
 *  Members      ly_members — one per marketing profile per store. "pending" = bought but hasn't joined (points wait for them),
 *               "enrolled" = joined, "blocked" = left out (blocklist tag or by hand).
 *  Points       ly_ledger — every change, + or −. Balance = what's available now; points from orders can wait N days first.
 *  Earn rules   join, order ($ spent), review (+ photo), birthday, anniversary, social follows/likes/shares, referral, custom.
 *  Rewards      $ off, % off, convert points to $ (member picks), free shipping, free product. Each redemption is a single-use
 *               Shopify code with the reward's restrictions (min spend, collections, expiry, combining).
 *  VIP tiers    by spend over a rolling year or lifetime; tiers multiply points and can hide/unlock rules; perks are text.
 *  Referrals    each member has a link; the friend gets a code, the member gets points or a code when the friend orders.
 *  Identity     the store's theme prints the logged-in customer's id + email, signed with the store's secret (Liquid
 *               hmac_sha256), so the widget can't be used to read or spend someone else's points.
 *  Events       loyalty_joined / _points_earned / _reward_redeemed / _tier_changed / _points_expiring / _referral_reward go to
 *               marketing, so flows can email or text on them; balances are copied to the profile ({{ loyalty_points }} …).
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const core = require("./core");
const { db } = core;

const STORES = {
  lb: { name: "Larkspur Baby", shop: "https://larkspurbaby.com" },
  lbo: { name: "Larkspur Baby Outlet", shop: "https://larkspurbabyoutlet.com" },
};
const PUBLIC_URL = () => (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const storeOk = (s) => (STORES[String(s || "").toLowerCase()] ? String(s).toLowerCase() : null);
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const clean = (s, n = 300) => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n);

/* ---------------- settings ---------------- */
const DEFAULT_SETTINGS = (s) => ({
  live: false, launched_at: null,
  name: s === "lbo" ? "Larkspur Outlet Rewards" : "Larkspur Rewards",
  currency: "point", currency_plural: "points",
  page_path: "/pages/rewards",
  expiry: { months: 12, pending: "same" },          // months of no activity before points expire (0 = never); pending: same | never | <months>
  spend_basis: "total",                              // total | subtotal (what an order's points and VIP spend are based on)
  program_start: null,                               // orders on/after this count; null = from launch
  vip: { enabled: true, period: "rolling", start: null, keep_months: 12 },
  combine: { order: false, product: false, shipping: true },
  restrict_to_redeemer: false,
  blocklist_tags: ["wholesale", "staff"],
  auto_pending: true,                                // buyers who haven't joined still collect points, waiting for them
  referrals: { enabled: true, friend: { type: "amount", value: 10, min: 50, days: 30 }, advocate: { kind: "points", points: 500, coupon: { type: "amount", value: 10, min: 50, days: 60 } }, monthly_limit: 10 },
  design: null,
});
async function allSettings() { return (await core.setting("loyalty_settings", null)) || {}; }
async function settings(store) {
  const all = await allSettings(); const d = DEFAULT_SETTINGS(store); const cur = all[store] || {};
  const out = { ...d, ...cur, expiry: { ...d.expiry, ...(cur.expiry || {}) }, vip: { ...d.vip, ...(cur.vip || {}) }, combine: { ...d.combine, ...(cur.combine || {}) },
    referrals: { ...d.referrals, ...(cur.referrals || {}), friend: { ...d.referrals.friend, ...((cur.referrals || {}).friend || {}) }, advocate: { ...d.referrals.advocate, ...((cur.referrals || {}).advocate || {}), coupon: { ...d.referrals.advocate.coupon, ...(((cur.referrals || {}).advocate || {}).coupon || {}) } } } };
  if (!out.secret) { out.secret = crypto.randomBytes(24).toString("hex"); await saveSettings(store, { secret: out.secret }); }
  return out;
}
async function saveSettings(store, patch) {
  const all = await allSettings(); all[store] = { ...(all[store] || {}), ...patch, updated_at: new Date().toISOString() };
  await db(`INSERT INTO emily_settings (key, value) VALUES ('loyalty_settings', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [JSON.stringify(all)]);
  return all[store];
}
const P = (st, n) => (Math.abs(n) === 1 ? st.currency : st.currency_plural);

/* ---------------- tables ---------------- */
async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS ly_rules (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, kind TEXT NOT NULL, type TEXT NOT NULL, title TEXT, enabled BOOLEAN NOT NULL DEFAULT true,
    config JSONB NOT NULL DEFAULT '{}', sort INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE TABLE IF NOT EXISTS ly_tiers (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, threshold NUMERIC NOT NULL DEFAULT 0, color TEXT, icon TEXT,
    earn_mult NUMERIC NOT NULL DEFAULT 1, entry_points INT NOT NULL DEFAULT 0, perks JSONB NOT NULL DEFAULT '[]', rule_overrides JSONB NOT NULL DEFAULT '{}', sort INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE TABLE IF NOT EXISTS ly_members (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, profile_id BIGINT, email TEXT, shopify_customer_id TEXT, first_name TEXT, last_name TEXT,
    status TEXT NOT NULL DEFAULT 'pending', tier_id BIGINT, tier_since TIMESTAMPTZ, tier_floor_id BIGINT, tier_floor_until TIMESTAMPTZ, birthday TEXT, ref_code TEXT UNIQUE, referred_by BIGINT,
    enrolled_at TIMESTAMPTZ, last_activity_at TIMESTAMPTZ DEFAULT now(), expiry_warned_at TIMESTAMPTZ, note TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS ly_members_profile ON ly_members (store, profile_id) WHERE profile_id IS NOT NULL`);
  await db(`CREATE INDEX IF NOT EXISTS ly_members_email ON ly_members (store, lower(email))`);
  await db(`CREATE TABLE IF NOT EXISTS ly_ledger (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, member_id BIGINT NOT NULL, delta INT NOT NULL, reason TEXT NOT NULL, rule_id BIGINT, ref TEXT,
    note TEXT, available_at TIMESTAMPTZ DEFAULT now(), voided BOOLEAN NOT NULL DEFAULT false, by_user TEXT, at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE INDEX IF NOT EXISTS ly_ledger_member ON ly_ledger (member_id, at DESC)`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS ly_ledger_once ON ly_ledger (store, member_id, reason, ref) WHERE ref IS NOT NULL AND reason IN ('order','review','join','birthday','anniversary','social','referral','tier_entry')`);
  await db(`CREATE TABLE IF NOT EXISTS ly_redemptions (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, member_id BIGINT NOT NULL, rule_id BIGINT, title TEXT, points INT NOT NULL, value NUMERIC,
    code TEXT, discount_id TEXT, status TEXT NOT NULL DEFAULT 'issued', expires_at TIMESTAMPTZ, used_at TIMESTAMPTZ, used_order TEXT, by_user TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE INDEX IF NOT EXISTS ly_redemptions_code ON ly_redemptions (store, upper(code))`);
  await db(`CREATE TABLE IF NOT EXISTS ly_referrals (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, advocate_id BIGINT NOT NULL, friend_email TEXT, code TEXT, discount_id TEXT, status TEXT NOT NULL DEFAULT 'sent',
    order_name TEXT, order_value NUMERIC, rewarded_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS ly_referrals_friend ON ly_referrals (store, advocate_id, lower(friend_email))`);
  for (const s of Object.keys(STORES)) await seed(s);
}

/* ---------------- default program (only written once per store, then fully editable) ---------------- */
const EARN_TYPES = {
  join: { title: "Join the program", icon: "user-plus", once: true },
  order: { title: "Place an order", icon: "shopping-bag" },
  review: { title: "Write a review", icon: "star" },
  birthday: { title: "Celebrate your birthday", icon: "cake" },
  anniversary: { title: "Program anniversary", icon: "confetti" },
  instagram_follow: { title: "Follow us on Instagram", icon: "brand-instagram", social: true },
  facebook_like: { title: "Like us on Facebook", icon: "brand-facebook", social: true },
  facebook_share: { title: "Share on Facebook", icon: "share", social: true },
  tiktok_follow: { title: "Follow us on TikTok", icon: "brand-tiktok", social: true },
  x_follow: { title: "Follow us on X", icon: "brand-x", social: true },
  x_post: { title: "Post about us on X", icon: "brand-x", social: true },
  pinterest_follow: { title: "Follow us on Pinterest", icon: "brand-pinterest", social: true },
  custom: { title: "Custom", icon: "sparkles" },
};
const REDEEM_TYPES = {
  amount: { title: "$ off coupon", icon: "cash" },
  percent: { title: "% off coupon", icon: "discount" },
  convert: { title: "Convert points to $ off", icon: "arrows-exchange" },
  shipping: { title: "Free shipping", icon: "truck" },
  product: { title: "Free product", icon: "gift" },
};
async function seed(store) {
  const have = (await db(`SELECT count(*)::int n FROM ly_rules WHERE store=$1`, [store])).rows[0].n;
  if (!have) {
    const E = [
      ["join", { points: 200 }], ["order", { per_dollar: 5, delay_days: 0, limit_count: 0, limit_days: 0 }], ["review", { points: 100, photo_points: 100, once_per: "review", max_per_order: 0 }],
      ["birthday", { points: 250, capture_year: false }], ["anniversary", { points: 100 }, false],
      ["instagram_follow", { points: 50, url: "https://www.instagram.com/larkspurbaby/", period_days: 0 }], ["facebook_like", { points: 50, url: "https://www.facebook.com/larkspurbaby", period_days: 0 }],
      ["tiktok_follow", { points: 50, url: "https://www.tiktok.com/@larkspurbaby", period_days: 0 }], ["facebook_share", { points: 25, url: "", period_days: 30 }, false],
    ];
    let i = 0; for (const [t, c, on] of E) await db(`INSERT INTO ly_rules (store, kind, type, title, enabled, config, sort) VALUES ($1,'earn',$2,$3,$4,$5,$6)`, [store, t, EARN_TYPES[t].title, on !== false, JSON.stringify(c), i++]);
    const R = [
      ["amount", "$5 off", { points: 500, value: 5, expiry_days: 90, min_purchase: 0 }], ["amount", "$10 off", { points: 1000, value: 10, expiry_days: 90, min_purchase: 0 }],
      ["shipping", "Free shipping", { points: 750, max_ship: 15, expiry_days: 90 }], ["percent", "15% off", { points: 1500, value: 15, expiry_days: 90, min_purchase: 50 }],
      ["convert", "Turn points into $ off", { per_dollar: 100, min_points: 500, max_points: 5000, expiry_days: 90 }, false],
    ];
    i = 0; for (const [t, title, c, on] of R) await db(`INSERT INTO ly_rules (store, kind, type, title, enabled, config, sort) VALUES ($1,'redeem',$2,$3,$4,$5,$6)`, [store, t, title, on !== false, JSON.stringify(c), i++]);
  }
  const tiers = (await db(`SELECT count(*)::int n FROM ly_tiers WHERE store=$1`, [store])).rows[0].n;
  if (!tiers) {
    const T = [["Sprout", 0, "#8FB59A", "plant", 1, 0, ["Earn 5 points per $1", "Birthday points"]], ["Bloom", 250, "#E3A6B4", "flower", 1.25, 100, ["1.25× points on orders", "Early access to new prints"]], ["Blossom", 600, "#242F3F", "crown", 1.5, 250, ["1.5× points on orders", "Free shipping on every order", "First look at restocks"]]];
    let i = 0; for (const [n, th, col, ic, m, ep, perks] of T) await db(`INSERT INTO ly_tiers (store, name, threshold, color, icon, earn_mult, entry_points, perks, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [store, n, th, col, ic, m, ep, JSON.stringify(perks), i++]);
  }
}

/* ---------------- reading the program ---------------- */
async function rules(store, kind) { return (await db(`SELECT * FROM ly_rules WHERE store=$1 ${kind ? "AND kind=$2" : ""} ORDER BY kind, sort, id`, kind ? [store, kind] : [store])).rows; }
async function tiers(store) { return (await db(`SELECT * FROM ly_tiers WHERE store=$1 ORDER BY threshold, sort, id`, [store])).rows.map((t) => ({ ...t, threshold: Number(t.threshold), earn_mult: Number(t.earn_mult) })); }
function ruleFor(rule, tier) {   // the rule as this member's tier sees it: hidden for the tier, or points/value changed
  const o = (tier && tier.rule_overrides && tier.rule_overrides[rule.id]) || null;
  if (o && o.off) return null;
  const c = { ...rule.config };
  if (o && o.points != null && o.points !== "") { if (rule.type === "order") c.per_dollar = Number(o.points); else c.points = Number(o.points); }
  if (o && o.value != null && o.value !== "") c.value = Number(o.value);
  return { ...rule, config: c };
}

/* ---------------- members ---------------- */
const refCode = () => crypto.randomBytes(5).toString("base64").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 7) || "R" + Date.now().toString(36).toUpperCase();
async function balance(memberId) {
  const r = (await db(`SELECT COALESCE(sum(delta) FILTER (WHERE NOT voided AND available_at <= now()),0)::int bal, COALESCE(sum(delta) FILTER (WHERE NOT voided AND available_at > now()),0)::int pending,
    COALESCE(sum(delta) FILTER (WHERE NOT voided AND delta > 0 AND reason NOT IN ('adjust_back','refund_back')),0)::int earned, COALESCE(-sum(delta) FILTER (WHERE NOT voided AND reason='redeem'),0)::int spent
    FROM ly_ledger WHERE member_id=$1`, [memberId])).rows[0];
  return r;
}
async function memberById(id) { return (await db(`SELECT * FROM ly_members WHERE id=$1`, [id])).rows[0] || null; }
/** The member for a marketing profile, made (pending) if needed. */
async function memberFor(store, profile, { create = true } = {}) {
  if (!profile || !profile.id) return null;
  let m = (await db(`SELECT * FROM ly_members WHERE store=$1 AND profile_id=$2`, [store, profile.id])).rows[0];
  if (!m && profile.email) m = (await db(`SELECT * FROM ly_members WHERE store=$1 AND lower(email)=lower($2) ORDER BY id LIMIT 1`, [store, profile.email])).rows[0];
  if (m || !create) return m || null;
  const st = await settings(store);
  const tags = String((profile.props && profile.props.tags) || "").toLowerCase();
  const blocked = (st.blocklist_tags || []).some((t) => t && tags.split(/\s*,\s*/).includes(String(t).toLowerCase()));
  for (let i = 0; i < 5; i++) {
    const r = await db(`INSERT INTO ly_members (store, profile_id, email, shopify_customer_id, first_name, last_name, status, ref_code) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING *`,
      [store, profile.id, profile.email || null, profile.shopify_id ? String(profile.shopify_id).replace(/\D/g, "") : null, profile.first_name || null, profile.last_name || null, blocked ? "blocked" : "pending", refCode()]).catch(() => ({ rows: [] }));
    if (r.rows[0]) return r.rows[0];
    const again = (await db(`SELECT * FROM ly_members WHERE store=$1 AND profile_id=$2`, [store, profile.id])).rows[0]; if (again) return again;
  }
  return null;
}
async function profileById(id) { return (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [id])).rows[0] || null; }
async function profileByCustomer(store, cust) {
  const MK = require("./mk-core");
  let p = null;
  if (cust.id) p = (await db(`SELECT * FROM mk_profiles WHERE store=$1 AND regexp_replace(COALESCE(shopify_id::text,''),'\\D','','g')=$2 LIMIT 1`, [store, String(cust.id).replace(/\D/g, "")]).catch(() => ({ rows: [] }))).rows[0];
  if (!p && cust.email) p = (await db(`SELECT * FROM mk_profiles WHERE store=$1 AND lower(email)=lower($2) LIMIT 1`, [store, cust.email])).rows[0];
  if (!p && cust.email) p = await MK.upsertProfile(store, { email: cust.email, first_name: cust.first_name || null, shopify_id: cust.id ? `gid://shopify/Customer/${String(cust.id).replace(/\D/g, "")}` : null }, "rewards");
  return p;
}

/** Add or take away points. Always through here so the profile copy, tier and marketing events stay right. */
async function addPoints(m, delta, reason, { rule = null, ref = null, note = null, by = null, delayDays = 0, quiet = false } = {}) {
  delta = int(delta); if (!delta || !m) return null;
  const avail = delayDays > 0 ? new Date(Date.now() + delayDays * 864e5) : new Date();
  const r = await db(`INSERT INTO ly_ledger (store, member_id, delta, reason, rule_id, ref, note, available_at, by_user) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING RETURNING *`,
    [m.store, m.id, delta, reason, rule ? rule.id : null, ref == null ? null : String(ref).slice(0, 160), note ? clean(note, 300) : null, avail, by]);
  if (!r.rows[0]) return null;   // already given for this (order, review, birthday…)
  await db(`UPDATE ly_members SET last_activity_at=now(), expiry_warned_at=NULL WHERE id=$1`, [m.id]);
  await sync(m.id);
  if (!quiet && delta > 0 && m.status === "enrolled") await emit(m, "loyalty_points_earned", { points: delta, reason, note: note || null, balance: (await balance(m.id)).bal });
  return r.rows[0];
}
/** Copy the member's numbers onto their marketing profile, so emails/segments can use {{ loyalty_points }} etc. */
async function sync(memberId) {
  const m = await memberById(memberId); if (!m || !m.profile_id) return;
  const b = await balance(m.id); const T = await tiers(m.store); const t = T.find((x) => String(x.id) === String(m.tier_id)) || null;
  const nx = t ? T.find((x) => x.threshold > t.threshold) : T[0];
  const spend = await vipSpend(m);
  const props = { loyalty_status: m.status, loyalty_points: b.bal, loyalty_points_pending: b.pending, loyalty_tier: t ? t.name : null, loyalty_next_tier: nx ? nx.name : null,
    loyalty_spend_to_next_tier: nx ? Math.max(0, money(nx.threshold - spend)) : 0, loyalty_referral_url: `${PUBLIC_URL()}/ly/${m.store}/r/${m.ref_code}` };
  await db(`UPDATE mk_profiles SET props = COALESCE(props,'{}'::jsonb) || $2::jsonb WHERE id=$1`, [m.profile_id, JSON.stringify(props)]).catch(() => {});
}
async function emit(m, type, props) {
  if (!m.profile_id) return;
  try { await require("./mk-core").track(m.store, type, { profileId: m.profile_id, props: { ...props, program: (await settings(m.store)).name }, source: "rewards" }); } catch (_) {}
}

/* ---------------- VIP ---------------- */
async function vipSpend(m) {
  if (!m.profile_id) return 0;
  const st = await settings(m.store);
  const from = st.vip.period === "lifetime" ? (st.vip.start || st.program_start || "1970-01-01") : new Date(Date.now() - 365 * 864e5).toISOString();
  const r = (await db(`SELECT COALESCE(sum(value) FILTER (WHERE type='placed_order' AND NOT COALESCE((props->>'cancelled')::boolean,false)),0)::float spent,
      COALESCE(sum(value) FILTER (WHERE type='refunded_order'),0)::float refunded FROM mk_events WHERE store=$1 AND profile_id=$2 AND type IN ('placed_order','refunded_order') AND at >= $3`, [m.store, m.profile_id, from])).rows[0];
  return Math.max(0, money(r.spent - r.refunded));
}
async function updateTier(m, { demote = false } = {}) {
  const st = await settings(m.store); if (!st.vip.enabled) return m;
  const T = await tiers(m.store); if (!T.length) return m;
  const spend = await vipSpend(m);
  let want = [...T].reverse().find((t) => spend >= t.threshold) || T[0];
  const cur = T.find((t) => String(t.id) === String(m.tier_id));
  if (m.tier_floor_id && m.tier_floor_until && new Date(m.tier_floor_until) > new Date()) { const floor = T.find((t) => String(t.id) === String(m.tier_floor_id)); if (floor && floor.threshold > want.threshold) want = floor; }
  if (cur && want.threshold < cur.threshold) {
    const keepUntil = m.tier_since ? new Date(new Date(m.tier_since).getTime() + (st.vip.keep_months || 12) * 30.4 * 864e5) : new Date(0);
    if (!demote || st.vip.period === "lifetime" || keepUntil > new Date()) return m;
  }
  if (cur && String(cur.id) === String(want.id)) return m;
  await db(`UPDATE ly_members SET tier_id=$2, tier_since=now() WHERE id=$1`, [m.id, want.id]);
  const up = !cur || want.threshold > cur.threshold;
  if (up && want.entry_points > 0 && m.status === "enrolled") await addPoints({ ...m, tier_id: want.id }, want.entry_points, "tier_entry", { ref: `tier:${want.id}`, note: `Reached ${want.name}` });
  if (cur || want.threshold > 0) await emit(m, "loyalty_tier_changed", { tier: want.name, previous: cur ? cur.name : null, direction: up ? "up" : "down" });
  await sync(m.id);
  return { ...m, tier_id: want.id };
}

/* ---------------- earning from what happens (orders, refunds, reviews) ---------------- */
async function onEvent(store, type, profileId, props = {}, value = null, extId = null) {
  if (!STORES[store] || !profileId) return;
  if (!["placed_order", "refunded_order", "cancelled_order", "left_review"].includes(type)) return;
  const st = await settings(store); if (!st.live) return;
  const prof = await profileById(profileId); if (!prof) return;
  let m = await memberFor(store, prof, { create: type === "placed_order" && st.auto_pending });
  if (!m || m.status === "blocked") return;
  if (type === "placed_order") {
    if (props.cancelled) return;
    if (st.program_start && new Date() < new Date(st.program_start)) return;
    m = await updateTier(m);
    const T = await tiers(store); const tier = T.find((t) => String(t.id) === String(m.tier_id));
    const rule0 = (await rules(store, "earn")).find((r) => r.type === "order" && r.enabled); const rule = rule0 && ruleFor(rule0, tier);
    if (rule) {
      const c = rule.config;
      let spend = Number(value || 0);
      if (st.spend_basis === "subtotal" && Array.isArray(props.items)) spend = props.items.reduce((a, it) => a + Number(it.price || 0) * Number(it.qty || 1), 0);
      let pts = Math.floor(spend * Number(c.per_dollar || 0) * (tier ? tier.earn_mult : 1));
      if (c.limit_count > 0 && c.limit_days > 0) { const n = (await db(`SELECT count(*)::int n FROM ly_ledger WHERE member_id=$1 AND reason='order' AND at > now() - ($2 || ' days')::interval`, [m.id, String(c.limit_days)])).rows[0].n; if (n >= c.limit_count) pts = 0; }
      if (pts > 0) await addPoints(m, pts, "order", { rule, ref: props.name || extId, note: `Order ${props.name || ""}`.trim(), delayDays: int(c.delay_days) });
    }
    await referralOrder(store, m, prof, props, value);
    await markRedemptionUsed(store, props);
  } else if (type === "refunded_order" || type === "cancelled_order") {
    const name = props.name; if (!name) return;
    const earned = (await db(`SELECT id, delta FROM ly_ledger WHERE member_id=$1 AND reason='order' AND ref=$2 AND NOT voided`, [m.id, name])).rows[0]; if (!earned) return;
    const back = (await db(`SELECT COALESCE(-sum(delta),0)::int n FROM ly_ledger WHERE member_id=$1 AND reason='refund_back' AND note LIKE $2`, [m.id, `%${name}%`])).rows[0].n;
    const order = (await db(`SELECT value FROM mk_events WHERE store=$1 AND profile_id=$2 AND type='placed_order' AND props->>'name'=$3 LIMIT 1`, [store, m.profile_id, name])).rows[0];
    let take = type === "cancelled_order" ? earned.delta - back : Math.floor(earned.delta * Math.min(1, Number(value || 0) / Math.max(0.01, Number((order && order.value) || value || 1))));
    take = Math.max(0, Math.min(earned.delta - back, take));
    if (take) await addPoints(m, -take, "refund_back", { note: `${type === "cancelled_order" ? "Cancelled" : "Refund on"} ${name}`, quiet: true });
    await updateTier(m, { demote: true });
  } else if (type === "left_review") {
    if (m.status !== "enrolled") return;
    const T = await tiers(store); const tier = T.find((t) => String(t.id) === String(m.tier_id));
    const rule0 = (await rules(store, "earn")).find((r) => r.type === "review" && r.enabled); const rule = rule0 && ruleFor(rule0, tier); if (!rule) return;
    const c = rule.config; const pts = int(c.points) + (props.media ? int(c.photo_points) : 0);
    const ref = c.once_per === "order" && props.order ? `order:${props.order}` : `review:${props.review_id || props.product_id || Date.now()}`;
    if (c.max_per_order > 0 && props.order) { const n = (await db(`SELECT COALESCE(sum(delta),0)::int n FROM ly_ledger WHERE member_id=$1 AND reason='review' AND note LIKE $2`, [m.id, `%${props.order}%`])).rows[0].n; if (n >= c.max_per_order) return; }
    if (pts > 0) await addPoints(m, pts, "review", { rule, ref, note: `Review${props.product ? ` of ${props.product}` : ""}${props.order ? ` (${props.order})` : ""}${props.media ? " with photos" : ""}` });
  }
}

/* ---------------- joining ---------------- */
async function join(store, prof, { birthday = null, by = null } = {}) {
  const st = await settings(store);
  let m = await memberFor(store, prof); if (!m) throw new Error("Couldn't find that customer.");
  if (m.status === "blocked") throw new Error("This account can't join the program.");
  if (m.status !== "enrolled") {
    await db(`UPDATE ly_members SET status='enrolled', enrolled_at=now(), last_activity_at=now() WHERE id=$1`, [m.id]); m = await memberById(m.id);
    const r = (await rules(store, "earn")).find((x) => x.type === "join" && x.enabled);
    if (r && int(r.config.points) > 0) await addPoints(m, int(r.config.points), "join", { rule: r, ref: "join", note: "Joined the program", by, quiet: true });
    await emit(m, "loyalty_joined", { points: (await balance(m.id)).bal });
  }
  if (birthday) await setBirthday(m, birthday);
  m = await updateTier(await memberById(m.id));
  await sync(m.id);
  return memberById(m.id);
}
function cleanBirthday(b) {
  const s = String(b || "").trim(); let mm, dd, yy = null, x;
  if ((x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { yy = x[1]; mm = x[2]; dd = x[3]; } else if ((x = s.match(/^(\d{1,2})[-/](\d{1,2})(?:[-/](\d{4}))?$/))) { mm = x[1]; dd = x[2]; yy = x[3] || null; } else return null;
  mm = int(mm); dd = int(dd); if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${yy ? yy + "-" : ""}${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}
async function setBirthday(m, b) {
  const v = cleanBirthday(b); if (!v) throw new Error("Use month/day, like 04/18.");
  if (m.birthday && m.birthday !== v) { const last = (await db(`SELECT 1 FROM ly_ledger WHERE member_id=$1 AND reason='birthday' AND at > now() - interval '330 days'`, [m.id])).rows[0]; if (last) throw new Error("Your birthday was already set this year."); }
  await db(`UPDATE ly_members SET birthday=$2 WHERE id=$1`, [m.id, v]);
  if (m.profile_id) await db(`UPDATE mk_profiles SET props = COALESCE(props,'{}'::jsonb) || jsonb_build_object('birthday', $2::text) WHERE id=$1 AND COALESCE(props->>'birthday','')=''`, [m.profile_id, v.length === 5 ? `2000-${v}` : v]).catch(() => {});
}

/* ---------------- spending points ---------------- */
async function makeCode(store, m, rule, value, title) {
  const st = await settings(store); const C = require("./mk-coupons"); const R = require("./returns");
  const c = rule.config || {};
  const off = C.cleanOffer({
    type: rule.type === "shipping" ? "shipping" : rule.type === "product" ? "products" : "order",
    value_type: rule.type === "percent" ? "percent" : "amount", value: rule.type === "product" ? 100 : value,
    applies: rule.type === "product" ? "products" : "collections", items: rule.type === "product" ? (c.products || []) : (c.collections || []),
    min: Number(c.min_purchase) > 0 ? "amount" : "none", min_value: Number(c.min_purchase) || 0, max_ship: Number(c.max_ship) || 0,
    combine_order: !!st.combine.order, combine_product: !!st.combine.product, combine_shipping: !!st.combine.shipping, days: int(c.expiry_days, 90) || 365, prefix: "RWD",
  }, await C.defaults());
  if (rule.type === "product") off.value_type = "percent";
  if (rule.type !== "product" && (c.collections || []).length) off.type = "products";
  const code = `RWD-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
  const expires = new Date(Date.now() + off.days * 864e5);
  const di = C.discountInput(off, code, `${st.name} · ${title} · ${m.email || m.id}`, expires);
  if (rule.type === "product") { di.input.customerGets.value = { percentage: 1 }; }
  if (st.restrict_to_redeemer && m.shopify_customer_id) di.input.customerSelection = { customers: { add: [`gid://shopify/Customer/${m.shopify_customer_id}`] } };
  const r = await R.gql(R.shopFor(store), `mutation($b:${di.type}!){${di.m}(${di.arg}:$b){codeDiscountNode{id} userErrors{field message}}}`, { b: di.input });
  const out = r[di.m]; if (out.userErrors && out.userErrors.length) throw new Error(out.userErrors.map((e) => e.message).join("; "));
  return { code, expires, discount_id: out.codeDiscountNode.id };
}
async function redeem(store, m, ruleId, { points = null, by = null } = {}) {
  const st = await settings(store); if (!st.live && !by) throw new Error("The rewards program isn't on yet.");
  if (!m || m.status !== "enrolled") throw new Error("Join the program to use your points.");
  const T = await tiers(store); const tier = T.find((t) => String(t.id) === String(m.tier_id));
  const r0 = (await db(`SELECT * FROM ly_rules WHERE id=$1 AND store=$2 AND kind='redeem' AND enabled`, [ruleId, store])).rows[0]; if (!r0) throw new Error("That reward isn't available.");
  const rule = ruleFor(r0, tier); if (!rule) throw new Error("That reward isn't available for your tier.");
  const c = rule.config; const b = await balance(m.id);
  let cost = int(c.points), value = Number(c.value || 0), title = rule.title || REDEEM_TYPES[rule.type].title;
  if (rule.type === "convert") {
    cost = int(points); const per = Math.max(1, int(c.per_dollar, 100));
    if (cost < int(c.min_points, per)) throw new Error(`Use at least ${int(c.min_points, per)} ${st.currency_plural}.`);
    if (c.max_points > 0 && cost > int(c.max_points)) throw new Error(`Use at most ${int(c.max_points)} ${st.currency_plural} at a time.`);
    cost = cost - (cost % per); value = cost / per; title = `$${value} off`;
  }
  if (cost <= 0) throw new Error("That reward has no cost set.");
  if (b.bal < cost) throw new Error(`You need ${cost - b.bal} more ${P(st, cost - b.bal)} for this.`);
  if (c.limit_count > 0) {
    const days = c.limit_days > 0 ? int(c.limit_days) : 36500;
    const n = (await db(`SELECT count(*)::int n FROM ly_redemptions WHERE member_id=$1 AND rule_id=$2 AND created_at > now() - ($3 || ' days')::interval AND status<>'reversed'`, [m.id, rule.id, String(days)])).rows[0].n;
    if (n >= c.limit_count) throw new Error("You've already used this reward the most times allowed.");
  }
  // Hold the points first so two clicks can't spend them twice; give them back if Shopify fails.
  const hold = await db(`INSERT INTO ly_ledger (store, member_id, delta, reason, rule_id, note, by_user) SELECT $1,$2,$3,'redeem',$4,$5,$6
      WHERE (SELECT COALESCE(sum(delta),0) FROM ly_ledger WHERE member_id=$2 AND NOT voided AND available_at <= now()) >= $7 RETURNING id`, [store, m.id, -cost, rule.id, `Redeemed: ${title}`, by, cost]);
  if (!hold.rows[0]) throw new Error("Not enough points.");
  try {
    const k = await makeCode(store, m, rule, value, title);
    const red = (await db(`INSERT INTO ly_redemptions (store, member_id, rule_id, title, points, value, code, discount_id, expires_at, by_user) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [store, m.id, rule.id, title, cost, rule.type === "shipping" || rule.type === "product" ? null : value, k.code, k.discount_id, k.expires, by])).rows[0];
    await db(`UPDATE ly_ledger SET ref=$2 WHERE id=$1`, [hold.rows[0].id, `redeem:${red.id}`]);
    await db(`UPDATE ly_members SET last_activity_at=now() WHERE id=$1`, [m.id]); await sync(m.id);
    await emit(m, "loyalty_reward_redeemed", { reward: title, code: k.code, points: cost, expires: k.expires.toISOString(), balance: (await balance(m.id)).bal });
    return red;
  } catch (e) { await db(`UPDATE ly_ledger SET voided=true, note=note || ' (failed: ' || $2 || ')' WHERE id=$1`, [hold.rows[0].id, clean(e.message, 120)]); throw new Error(`Couldn't make the code: ${e.message}`); }
}
async function markRedemptionUsed(store, props) {
  for (const code of props.discount_codes || []) await db(`UPDATE ly_redemptions SET status='used', used_at=now(), used_order=$3 WHERE store=$1 AND upper(code)=upper($2) AND status='issued'`, [store, code, props.name || null]).catch(() => {});
}

/* ---------------- social actions (honor system, like every loyalty app: we can't see who followed) ---------------- */
async function socialAction(store, m, ruleId) {
  if (!m || m.status !== "enrolled") throw new Error("Join the program first.");
  const r = (await db(`SELECT * FROM ly_rules WHERE id=$1 AND store=$2 AND kind='earn' AND enabled`, [ruleId, store])).rows[0];
  if (!r || !(EARN_TYPES[r.type] || {}).social) throw new Error("That isn't available.");
  const T = await tiers(store); const rule = ruleFor(r, T.find((t) => String(t.id) === String(m.tier_id))); if (!rule) throw new Error("That isn't available for your tier.");
  const days = int(rule.config.period_days); const ref = days > 0 ? `${rule.id}:${Math.floor(Date.now() / (days * 864e5))}` : `${rule.id}`;
  const got = await addPoints(m, int(rule.config.points), "social", { rule, ref, note: rule.title });
  return { url: rule.config.url || null, points: got ? got.delta : 0, already: !got };
}

/* ---------------- referrals ---------------- */
async function referralFriend(store, code, email) {
  const st = await settings(store); if (!st.live || !st.referrals.enabled) throw new Error("Referrals aren't on right now.");
  const a = (await db(`SELECT * FROM ly_members WHERE store=$1 AND upper(ref_code)=upper($2) AND status='enrolled'`, [store, String(code || "")])).rows[0]; if (!a) throw new Error("That link isn't valid.");
  const em = String(email || "").trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw new Error("Enter your email.");
  if (a.email && a.email.toLowerCase() === em) throw new Error("This is your own link. Share it with a friend!");
  const prior = (await db(`SELECT 1 FROM mk_profiles p JOIN mk_events e ON e.profile_id=p.id AND e.type='placed_order' WHERE p.store=$1 AND lower(p.email)=$2 LIMIT 1`, [store, em])).rows[0];
  if (prior) throw new Error("Referral offers are for first orders, and it looks like you've ordered before.");
  const old = (await db(`SELECT * FROM ly_referrals WHERE store=$1 AND advocate_id=$2 AND lower(friend_email)=$3`, [store, a.id, em])).rows[0];
  if (old && old.code) return { code: old.code, advocate: a.first_name || "Your friend" };
  const month = (await db(`SELECT count(*)::int n FROM ly_referrals WHERE advocate_id=$1 AND created_at > now() - interval '30 days'`, [a.id])).rows[0].n;
  if (st.referrals.monthly_limit > 0 && month >= st.referrals.monthly_limit) throw new Error("This link has been used a lot this month. Try again later.");
  const f = st.referrals.friend;
  const rule = { id: null, type: f.type === "percent" ? "percent" : f.type === "shipping" ? "shipping" : "amount", config: { value: f.value, min_purchase: f.min, expiry_days: f.days } };
  const k = await makeCode(store, { ...a, shopify_customer_id: null }, rule, Number(f.value), "Referral gift");
  await db(`INSERT INTO ly_referrals (store, advocate_id, friend_email, code, discount_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (store, advocate_id, lower(friend_email)) DO UPDATE SET code=EXCLUDED.code, discount_id=EXCLUDED.discount_id`, [store, a.id, em, k.code, k.discount_id]);
  try { await require("./mk-core").upsertProfile(store, { email: em }, "referral"); } catch (_) {}
  return { code: k.code, advocate: a.first_name || "Your friend" };
}
async function referralOrder(store, m, prof, props) {
  const codes = (props.discount_codes || []).map((c) => String(c).toUpperCase()); if (!codes.length) return;
  const ref = (await db(`SELECT * FROM ly_referrals WHERE store=$1 AND upper(code) = ANY($2) AND status='sent'`, [store, codes])).rows[0]; if (!ref) return;
  const a = await memberById(ref.advocate_id); if (!a || (a.email && prof.email && a.email.toLowerCase() === prof.email.toLowerCase())) return;
  await db(`UPDATE ly_referrals SET status='converted', order_name=$2, rewarded_at=now() WHERE id=$1`, [ref.id, props.name || null]);
  await db(`UPDATE ly_members SET referred_by=$2 WHERE id=$1 AND referred_by IS NULL`, [m.id, a.id]);
  const st = await settings(store); const adv = st.referrals.advocate;
  if (adv.kind === "coupon") {
    try { const rule = { id: null, type: adv.coupon.type === "percent" ? "percent" : "amount", config: { value: adv.coupon.value, min_purchase: adv.coupon.min, expiry_days: adv.coupon.days } };
      const k = await makeCode(store, a, rule, Number(adv.coupon.value), "Referral reward");
      await db(`INSERT INTO ly_redemptions (store, member_id, title, points, value, code, discount_id, expires_at, by_user) VALUES ($1,$2,'Referral reward',0,$3,$4,$5,$6,'referral')`, [store, a.id, adv.coupon.value, k.code, k.discount_id, k.expires]);
      await emit(a, "loyalty_referral_reward", { code: k.code, friend_order: props.name || null });
    } catch (e) { console.error("referral reward:", e.message); }
  } else await addPoints(a, int(adv.points), "referral", { ref: `ref:${ref.id}`, note: `Friend's first order ${props.name || ""}`.trim() });
}

/* ---------------- daily: birthdays, anniversaries, delayed points, tiers, expiry ---------------- */
async function daily() {
  for (const store of Object.keys(STORES)) {
    const st = await settings(store); if (!st.live) continue;
    const E = await rules(store, "earn");
    const bd = E.find((r) => r.type === "birthday" && r.enabled);
    if (bd) {
      const tomorrow = new Date(Date.now() + 864e5); const md = bzDay(tomorrow).slice(5);
      for (const m of (await db(`SELECT * FROM ly_members WHERE store=$1 AND status='enrolled' AND right(birthday,5)=$2`, [store, md])).rows)
        await addPoints(m, int(bd.config.points), "birthday", { rule: bd, ref: `bday:${bzDay(tomorrow).slice(0, 4)}`, note: "Happy birthday!" });
    }
    const an = E.find((r) => r.type === "anniversary" && r.enabled);
    if (an) for (const m of (await db(`SELECT * FROM ly_members WHERE store=$1 AND status='enrolled' AND enrolled_at < now() - interval '360 days' AND to_char(enrolled_at,'MM-DD')=to_char(now() + interval '1 day','MM-DD')`, [store])).rows)
      await addPoints(m, int(an.config.points), "anniversary", { rule: an, ref: `anniv:${bzDay().slice(0, 4)}`, note: "Program anniversary" });
    // tiers (rolling-year demotions)
    if (st.vip.enabled) for (const m of (await db(`SELECT * FROM ly_members WHERE store=$1 AND status<>'blocked'`, [store])).rows) await updateTier(m, { demote: true }).catch(() => {});
    // expiry: warn 30 days ahead, then expire
    const months = (status) => (status === "pending" && st.expiry.pending !== "same" ? (st.expiry.pending === "never" ? 0 : int(st.expiry.pending)) : int(st.expiry.months));
    for (const m of (await db(`SELECT * FROM ly_members WHERE store=$1 AND status IN ('enrolled','pending')`, [store])).rows) {
      const mo = months(m.status); if (!mo) continue;
      const due = new Date(new Date(m.last_activity_at).getTime() + mo * 30.4 * 864e5); const b = await balance(m.id); if (b.bal <= 0) continue;
      if (due < new Date()) await addPoints(m, -b.bal, "expired", { note: `Expired after ${mo} months without activity`, quiet: true });
      else if (due - Date.now() < 30 * 864e5 && !m.expiry_warned_at && m.status === "enrolled") { await db(`UPDATE ly_members SET expiry_warned_at=now() WHERE id=$1`, [m.id]); await emit(m, "loyalty_points_expiring", { points: b.bal, expires_on: bzDay(due) }); }
    }
    await db(`UPDATE ly_redemptions SET status='expired' WHERE store=$1 AND status='issued' AND expires_at < now()`, [store]);
  }
}

/* ---------------- what the site shows ---------------- */
async function program(store) {
  const st = await settings(store); const T = await tiers(store);
  const pub = (r) => ({ id: r.id, type: r.type, title: r.title || (EARN_TYPES[r.type] || REDEEM_TYPES[r.type] || {}).title, icon: (EARN_TYPES[r.type] || REDEEM_TYPES[r.type] || {}).icon || "star",
    social: !!(EARN_TYPES[r.type] || {}).social, config: { points: r.config.points, per_dollar: r.config.per_dollar, photo_points: r.config.photo_points, value: r.config.value, min_points: r.config.min_points, max_points: r.config.max_points, min_purchase: r.config.min_purchase, max_ship: r.config.max_ship, products: (r.config.products || []).map((p) => ({ title: p.title })), url: r.config.url || null, text: r.config.text || null } });
  return {
    store, live: !!st.live, name: st.name, currency: st.currency, currency_plural: st.currency_plural, page_path: st.page_path, shop: STORES[store].shop,
    referrals: st.referrals.enabled ? { friend: st.referrals.friend, advocate: { kind: st.referrals.advocate.kind, points: st.referrals.advocate.points, coupon: st.referrals.advocate.coupon } } : null,
    earn: (await rules(store, "earn")).filter((r) => r.enabled).map(pub), redeem: (await rules(store, "redeem")).filter((r) => r.enabled).map(pub),
    tiers: st.vip.enabled ? T.map((t) => ({ id: t.id, name: t.name, threshold: t.threshold, color: t.color, icon: t.icon, earn_mult: t.earn_mult, perks: t.perks, entry_points: t.entry_points })) : [],
    vip_period: st.vip.period, design: st.design || null,
  };
}
async function memberView(store, m) {
  const st = await settings(store); const b = await balance(m.id); const T = await tiers(store);
  const t = T.find((x) => String(x.id) === String(m.tier_id)) || null; const nx = t ? T.find((x) => x.threshold > t.threshold) : T[0] || null; const spend = await vipSpend(m);
  const reds = (await db(`SELECT id, title, code, points, value, status, expires_at, created_at FROM ly_redemptions WHERE member_id=$1 ORDER BY created_at DESC LIMIT 20`, [m.id])).rows;
  const hist = (await db(`SELECT delta, reason, note, available_at, at FROM ly_ledger WHERE member_id=$1 AND NOT voided ORDER BY at DESC LIMIT 30`, [m.id])).rows;
  const done = (await db(`SELECT rule_id, max(at) at FROM ly_ledger WHERE member_id=$1 AND reason IN ('social','join','review') GROUP BY rule_id`, [m.id])).rows;
  return { id: m.id, status: m.status, first_name: m.first_name, points: b.bal, pending: b.pending, earned: b.earned, tier: t && { id: t.id, name: t.name, color: t.color, icon: t.icon },
    next_tier: nx && { name: nx.name, threshold: nx.threshold, to_go: Math.max(0, money(nx.threshold - spend)) }, spend, birthday: m.birthday,
    referral_url: `${PUBLIC_URL()}/ly/${store}/r/${m.ref_code}`, redemptions: reds, history: hist, done: Object.fromEntries(done.map((d) => [d.rule_id, d.at])), currency_plural: st.currency_plural };
}
function verify(st, cust) {
  if (!cust || !cust.id || !cust.email || !cust.sig) return false;
  const want = crypto.createHmac("sha256", st.secret).update(`${String(cust.id).replace(/\D/g, "")}:${String(cust.email).toLowerCase()}`).digest("hex");
  const got = String(cust.sig).toLowerCase(); return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
/** The theme snippet that tells the widget who's logged in (signed so it can't be faked). */
function themeSnippet(st) {
  return `{%- if customer -%}\n<script>window.BZL_CUSTOMER={id:"{{ customer.id }}",email:{{ customer.email | downcase | json }},first_name:{{ customer.first_name | json }},sig:"{{ customer.id | append: ':' | append: customer.email | downcase | hmac_sha256: '${st.secret}' }}"};</script>\n{%- endif -%}`;
}

/* ---------------- admin ---------------- */
async function overview(store, days = 30) {
  const d = Math.max(7, Math.min(365, int(days, 30))); const a = [store, String(d)];
  const k = (await db(`SELECT count(*) FILTER (WHERE status='enrolled')::int enrolled, count(*) FILTER (WHERE status='pending')::int pending, count(*) FILTER (WHERE status='blocked')::int blocked,
      count(*) FILTER (WHERE status='enrolled' AND enrolled_at > now() - ($2 || ' days')::interval)::int joined FROM ly_members WHERE store=$1`, a)).rows[0];
  const p = (await db(`SELECT COALESCE(sum(delta) FILTER (WHERE delta>0 AND reason NOT IN ('refund_back')),0)::int issued, COALESCE(-sum(delta) FILTER (WHERE reason='redeem'),0)::int redeemed,
      COALESCE(-sum(delta) FILTER (WHERE reason='expired'),0)::int expired FROM ly_ledger WHERE store=$1 AND NOT voided AND at > now() - ($2 || ' days')::interval`, a)).rows[0];
  const out = (await db(`SELECT COALESCE(sum(delta),0)::int n FROM ly_ledger WHERE store=$1 AND NOT voided`, [store])).rows[0].n;
  const r = (await db(`SELECT count(*)::int issued, count(*) FILTER (WHERE status='used')::int used, COALESCE(sum(value) FILTER (WHERE status='used'),0)::float used_value FROM ly_redemptions WHERE store=$1 AND created_at > now() - ($2 || ' days')::interval`, a)).rows[0];
  const rev = (await db(`SELECT COALESCE(sum(e.value) FILTER (WHERE m.status='enrolled'),0)::float members, COALESCE(sum(e.value),0)::float total, count(*) FILTER (WHERE m.status='enrolled')::int member_orders, count(*)::int orders
      FROM mk_events e LEFT JOIN ly_members m ON m.store=e.store AND m.profile_id=e.profile_id WHERE e.store=$1 AND e.type='placed_order' AND e.at > now() - ($2 || ' days')::interval`, a)).rows[0];
  const ref = (await db(`SELECT count(*)::int sent, count(*) FILTER (WHERE status='converted')::int converted FROM ly_referrals WHERE store=$1 AND created_at > now() - ($2 || ' days')::interval`, a)).rows[0];
  const byTier = (await db(`SELECT t.id, t.name, t.color, count(m.id)::int n FROM ly_tiers t LEFT JOIN ly_members m ON m.tier_id=t.id AND m.status='enrolled' WHERE t.store=$1 GROUP BY t.id ORDER BY t.threshold`, [store])).rows;
  const daily = (await db(`SELECT to_char(date_trunc('day', at),'YYYY-MM-DD') d, COALESCE(sum(delta) FILTER (WHERE delta>0),0)::int earned, COALESCE(-sum(delta) FILTER (WHERE reason='redeem'),0)::int spent FROM ly_ledger WHERE store=$1 AND NOT voided AND at > now() - ($2 || ' days')::interval GROUP BY 1 ORDER BY 1`, a)).rows;
  const byReason = (await db(`SELECT reason, COALESCE(sum(delta),0)::int n FROM ly_ledger WHERE store=$1 AND NOT voided AND delta>0 AND at > now() - ($2 || ' days')::interval GROUP BY reason ORDER BY 2 DESC`, a)).rows;
  const st = await settings(store);
  return { days: d, live: !!st.live, launched_at: st.launched_at, name: st.name, members: k, points: { ...p, outstanding: out }, rewards: r, revenue: rev, referrals: ref, by_tier: byTier, daily, by_reason: byReason };
}
async function memberList(q) {
  const store = storeOk(q.store); const where = ["m.store=$1"]; const a = [store];
  if (q.status) { a.push(q.status); where.push(`m.status=$${a.length}`); }
  if (q.tier) { a.push(q.tier); where.push(`m.tier_id=$${a.length}`); }
  if (q.q) { a.push(`%${String(q.q).toLowerCase()}%`); a.push(String(q.q).trim().toUpperCase()); where.push(`(lower(m.email) LIKE $${a.length - 1} OR lower(COALESCE(m.first_name,'') || ' ' || COALESCE(m.last_name,'')) LIKE $${a.length - 1} OR upper(m.ref_code)=$${a.length})`); }
  const per = Math.min(200, int(q.per, 50)); const page = Math.max(1, int(q.page, 1));
  const sort = { points: "bal DESC", recent: "m.last_activity_at DESC", joined: "m.enrolled_at DESC NULLS LAST", spend: "m.id DESC" }[q.sort] || "m.last_activity_at DESC";
  const rows = (await db(`SELECT m.*, t.name tier_name, t.color tier_color, COALESCE((SELECT sum(delta) FROM ly_ledger l WHERE l.member_id=m.id AND NOT l.voided AND l.available_at<=now()),0)::int bal,
      COALESCE((SELECT sum(delta) FROM ly_ledger l WHERE l.member_id=m.id AND NOT l.voided AND l.available_at>now()),0)::int pending_pts, count(*) OVER()::int total
    FROM ly_members m LEFT JOIN ly_tiers t ON t.id=m.tier_id WHERE ${where.join(" AND ")} ORDER BY ${sort} LIMIT ${per} OFFSET ${(page - 1) * per}`, a)).rows;
  return { members: rows, total: rows[0] ? rows[0].total : 0, page, per };
}
async function memberDetail(id) {
  const m = await memberById(id); if (!m) return null;
  const v = await memberView(m.store, m);
  const ledger = (await db(`SELECT l.*, r.title rule_title FROM ly_ledger l LEFT JOIN ly_rules r ON r.id=l.rule_id WHERE l.member_id=$1 ORDER BY l.at DESC LIMIT 200`, [id])).rows;
  const refs = (await db(`SELECT * FROM ly_referrals WHERE advocate_id=$1 ORDER BY created_at DESC LIMIT 50`, [id])).rows;
  const prof = m.profile_id ? await profileById(m.profile_id) : null;
  return { member: m, view: v, ledger, referrals: refs, profile: prof && { id: prof.id, email: prof.email, orders_count: prof.orders_count, total_spent: prof.total_spent }, vip_spend: await vipSpend(m) };
}
async function activity(q) {
  const store = storeOk(q.store); const a = [store]; let w = "";
  if (q.reason) { a.push(q.reason); w = ` AND l.reason=$2`; }
  return (await db(`SELECT l.*, m.email, m.first_name, m.last_name, r.title rule_title FROM ly_ledger l JOIN ly_members m ON m.id=l.member_id LEFT JOIN ly_rules r ON r.id=l.rule_id WHERE l.store=$1${w} ORDER BY l.at DESC LIMIT 300`, a)).rows;
}
const RULE_FIELDS = ["points", "per_dollar", "delay_days", "limit_count", "limit_days", "photo_points", "once_per", "max_per_order", "capture_year", "url", "period_days", "text", "value", "expiry_days",
  "min_purchase", "max_ship", "min_points", "max_points", "collections", "products", "description"];
function cleanRule(b) {
  const c = {}; const src = b.config || {};
  for (const k of RULE_FIELDS) if (src[k] !== undefined) {
    if (["collections", "products"].includes(k)) c[k] = (Array.isArray(src[k]) ? src[k] : []).filter((x) => x && x.id).map((x) => ({ id: String(x.id), title: clean(x.title, 200) })).slice(0, 50);
    else if (["once_per", "url", "text", "description"].includes(k)) c[k] = clean(src[k], k === "url" ? 500 : 300);
    else if (k === "capture_year") c[k] = !!src[k];
    else c[k] = Math.max(0, Number(src[k]) || 0);
  }
  return c;
}

/* ---------------- routes ---------------- */
function cors(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); }
function routes(app, { guard, actorOf, express }) {
  const json = express.json({ limit: "64kb" });
  app.options(/^\/ly\/.*/, (req, res) => { cors(res); res.sendStatus(204); });
  // public: the site widget and its data
  app.get("/ly/:store/widget.js", async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).send("");
    const st = await settings(s); res.setHeader("Cache-Control", "public, max-age=300");
    res.type("application/javascript").send(`window.BZL=${JSON.stringify({ store: s, origin: PUBLIC_URL(), live: !!st.live, shop: STORES[s].shop })};\n` + fs.readFileSync(path.join(__dirname, "public", "bz-loyalty.js"), "utf8"));
  });
  app.get("/ly/:store/program", async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({});
    try { const p = await program(s); if (req.query.draft === "1") { const st = await settings(s); p.design = st.design_draft || st.design || null; } res.setHeader("Cache-Control", req.query.draft === "1" ? "no-store" : "public, max-age=60"); res.json(p); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  const who = async (req, s) => { const st = await settings(s); const c = (req.body || {}).customer; if (!verify(st, c)) return null; const prof = await profileByCustomer(s, c); return prof ? { prof, st } : null; };
  app.post("/ly/:store/me", json, async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({});
    try { const w = await who(req, s); if (!w) return res.json({ member: null });
      const m = await memberFor(s, w.prof, { create: false }); res.json({ member: m ? await memberView(s, m) : null, first_name: w.prof.first_name || null }); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post("/ly/:store/join", json, async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({});
    try { const w = await who(req, s); if (!w) return res.status(401).json({ error: "Please sign in to your account first." }); if (!w.st.live) return res.status(400).json({ error: "The rewards program isn't open yet." });
      const m = await join(s, w.prof, { birthday: (req.body || {}).birthday || null }); res.json({ member: await memberView(s, m) }); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post("/ly/:store/redeem", json, async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({});
    try { const w = await who(req, s); if (!w) return res.status(401).json({ error: "Please sign in first." });
      const m = await memberFor(s, w.prof, { create: false }); const r = await redeem(s, m, int((req.body || {}).rule_id), { points: (req.body || {}).points });
      res.json({ redemption: r, member: await memberView(s, await memberById(m.id)) }); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post("/ly/:store/action", json, async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({});
    try { const w = await who(req, s); if (!w) return res.status(401).json({ error: "Please sign in first." }); if (!w.st.live) return res.status(400).json({ error: "Not open yet." });
      const m = await memberFor(s, w.prof, { create: false }); const r = await socialAction(s, m, int((req.body || {}).rule_id)); res.json({ ...r, member: await memberView(s, await memberById(m.id)) }); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  app.post("/ly/:store/birthday", json, async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({});
    try { const w = await who(req, s); if (!w) return res.status(401).json({ error: "Please sign in first." }); const m = await memberFor(s, w.prof, { create: false }); if (!m) throw new Error("Join first.");
      await setBirthday(m, (req.body || {}).birthday); res.json({ member: await memberView(s, await memberById(m.id)) }); } catch (e) { res.status(400).json({ error: e.message }); }
  });
  // referral landing page (the link members share)
  app.get("/ly/:store/r/:code", async (req, res) => {
    const s = storeOk(req.params.store); if (!s) return res.status(404).send("Not found");
    const st = await settings(s); const a = (await db(`SELECT first_name FROM ly_members WHERE store=$1 AND upper(ref_code)=upper($2) AND status='enrolled'`, [s, req.params.code])).rows[0];
    const f = st.referrals.friend; const gift = f.type === "percent" ? `${f.value}% off` : f.type === "shipping" ? "free shipping" : `$${f.value} off`;
    const ok = st.live && st.referrals.enabled && a; const esc = (x) => String(x == null ? "" : x).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(STORES[s].name)}</title>
<style>body{margin:0;font:16px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#F6F4F1;color:#242F3F;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px;box-sizing:border-box}
.c{background:#fff;border-radius:18px;max-width:420px;width:100%;padding:30px 26px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.08)}h1{font-size:24px;margin:8px 0}p{color:#5b6475;line-height:1.5}input{width:100%;box-sizing:border-box;border:1px solid #d9dce3;border-radius:10px;padding:13px;font:inherit;margin:14px 0 10px}
button,a.b{display:block;width:100%;box-sizing:border-box;background:#242F3F;color:#fff;border:0;border-radius:10px;padding:14px;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}.code{font:700 22px ui-monospace,Menlo,monospace;letter-spacing:.06em;background:#F6F4F1;border-radius:10px;padding:14px;margin:14px 0}.e{color:#b42318;font-size:14px;min-height:18px}.g{font-size:42px}</style></head>
<body><div class="c">${ok ? `<div class="g">🎁</div><h1>${esc(a.first_name || "A friend")} sent you ${esc(gift)}</h1><p>Get ${esc(gift)} your first order at ${esc(STORES[s].name)}${Number(f.min) > 0 ? ` of $${esc(f.min)} or more` : ""}.</p>
<div id="f"><input id="em" type="email" placeholder="Your email" autocomplete="email"><div class="e" id="er"></div><button id="go">Get my gift</button></div>
<script>document.getElementById("go").onclick=async function(){var b=this;b.disabled=true;b.textContent="One moment…";try{var r=await fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:document.getElementById("em").value})});var j=await r.json();if(j.error)throw new Error(j.error);
document.getElementById("f").innerHTML='<p>Your code:</p><div class="code">'+j.code+'</div><a class="b" href="${esc(STORES[s].shop)}/discount/'+encodeURIComponent(j.code)+'">Shop now. It\\'s applied for you</a>';}catch(e){document.getElementById("er").textContent=e.message;b.disabled=false;b.textContent="Get my gift";}};</script>`
      : `<h1>${esc(STORES[s].name)}</h1><p>This offer isn't available right now.</p><a class="b" href="${esc(STORES[s].shop)}">Visit the shop</a>`}</div></body></html>`);
  });
  app.post("/ly/:store/r/:code", json, async (req, res) => {
    const s = storeOk(req.params.store); if (!s) return res.status(404).json({});
    try { res.json(await referralFriend(s, req.params.code, (req.body || {}).email)); } catch (e) { res.status(400).json({ error: e.message }); }
  });

  // staff
  const S = (req, res) => { const s = storeOk(req.query.store || (req.body || {}).store); if (!s) { res.status(400).json({ error: "store?" }); return null; } return s; };
  const wrap = (fn) => async (req, res) => { if (!guard(req, res)) return; try { await fn(req, res); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } };
  app.get("/api/loyalty/overview", wrap(async (req, res) => { const s = S(req, res); if (s) res.json(await overview(s, req.query.days)); }));
  app.get("/api/loyalty/members", wrap(async (req, res) => { const s = S(req, res); if (s) res.json(await memberList(req.query)); }));
  app.get("/api/loyalty/members/:id", wrap(async (req, res) => { const d = await memberDetail(req.params.id); if (!d) return res.status(404).json({ error: "not found" }); res.json(d); }));
  app.post("/api/loyalty/members/:id/:action", wrap(async (req, res) => {
    const m = await memberById(req.params.id); if (!m) return res.status(404).json({ error: "not found" }); const b = req.body || {}; const by = actorOf(req);
    if (req.params.action === "points") { const n = int(b.points); if (!n) throw new Error("How many points?"); await addPoints(m, n, n > 0 ? "adjust" : "adjust_back", { note: clean(b.note || "Adjusted by staff", 200), by, quiet: !b.notify }); }
    else if (req.params.action === "enroll") await join(m.store, await profileById(m.profile_id), { by });
    else if (req.params.action === "block") await db(`UPDATE ly_members SET status='blocked' WHERE id=$1`, [m.id]);
    else if (req.params.action === "unblock") await db(`UPDATE ly_members SET status=CASE WHEN enrolled_at IS NULL THEN 'pending' ELSE 'enrolled' END WHERE id=$1`, [m.id]);
    else if (req.params.action === "tier") { const until = b.until || new Date(Date.now() + 365 * 864e5).toISOString(); await db(`UPDATE ly_members SET tier_floor_id=$2, tier_floor_until=$3 WHERE id=$1`, [m.id, b.tier_id || null, b.tier_id ? until : null]); await updateTier(await memberById(m.id), { demote: true }); }
    else if (req.params.action === "birthday") await setBirthday(m, b.birthday);
    else if (req.params.action === "redeem") await redeem(m.store, m, int(b.rule_id), { points: b.points, by });
    else if (req.params.action === "note") await db(`UPDATE ly_members SET note=$2 WHERE id=$1`, [m.id, clean(b.note, 1000)]);
    else return res.status(400).json({ error: "unknown action" });
    await sync(m.id); res.json(await memberDetail(m.id));
  }));
  app.post("/api/loyalty/members-add", wrap(async (req, res) => {
    const s = S(req, res); if (!s) return; const em = String((req.body || {}).email || "").trim().toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) throw new Error("Enter an email.");
    const prof = await profileByCustomer(s, { email: em }); const m = await join(s, prof, { by: actorOf(req) }); res.json({ id: m.id });
  }));
  app.get("/api/loyalty/activity", wrap(async (req, res) => { const s = S(req, res); if (s) res.json({ rows: await activity(req.query) }); }));
  app.get("/api/loyalty/rules", wrap(async (req, res) => { const s = S(req, res); if (s) res.json({ earn: await rules(s, "earn"), redeem: await rules(s, "redeem"), EARN_TYPES, REDEEM_TYPES, tiers: await tiers(s) }); }));
  app.post("/api/loyalty/rules", wrap(async (req, res) => {
    const s = S(req, res); if (!s) return; const b = req.body || {}; const kind = b.kind === "redeem" ? "redeem" : "earn"; const T = kind === "redeem" ? REDEEM_TYPES : EARN_TYPES; if (!T[b.type]) throw new Error("Unknown type.");
    const r = (await db(`INSERT INTO ly_rules (store, kind, type, title, enabled, config, sort) VALUES ($1,$2,$3,$4,$5,$6,(SELECT COALESCE(max(sort),0)+1 FROM ly_rules WHERE store=$1 AND kind=$2)) RETURNING *`,
      [s, kind, b.type, clean(b.title || T[b.type].title, 120), b.enabled !== false, JSON.stringify(cleanRule(b))])).rows[0]; res.json(r);
  }));
  app.put("/api/loyalty/rules/:id", wrap(async (req, res) => {
    const b = req.body || {}; const cur = (await db(`SELECT * FROM ly_rules WHERE id=$1`, [req.params.id])).rows[0]; if (!cur) return res.status(404).json({ error: "not found" });
    const r = (await db(`UPDATE ly_rules SET title=$2, enabled=$3, config=$4, sort=$5, updated_at=now() WHERE id=$1 RETURNING *`, [cur.id, clean(b.title != null ? b.title : cur.title, 120), b.enabled != null ? !!b.enabled : cur.enabled, JSON.stringify(b.config ? cleanRule(b) : cur.config), b.sort != null ? int(b.sort) : cur.sort])).rows[0]; res.json(r);
  }));
  app.delete("/api/loyalty/rules/:id", wrap(async (req, res) => { await db(`DELETE FROM ly_rules WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }));
  app.get("/api/loyalty/tiers", wrap(async (req, res) => { const s = S(req, res); if (s) res.json({ tiers: await tiers(s), counts: (await db(`SELECT tier_id, count(*)::int n FROM ly_members WHERE store=$1 AND status='enrolled' GROUP BY tier_id`, [s])).rows }); }));
  app.post("/api/loyalty/tiers", wrap(async (req, res) => {
    const s = S(req, res); if (!s) return; const b = req.body || {};
    const vals = [clean(b.name || "New tier", 60), Math.max(0, Number(b.threshold) || 0), clean(b.color || "#242F3F", 20), clean(b.icon || "star", 40), Math.max(0, Number(b.earn_mult) || 1), Math.max(0, int(b.entry_points)), JSON.stringify((b.perks || []).map((x) => clean(x, 160)).filter(Boolean).slice(0, 12)), JSON.stringify(b.rule_overrides || {})];
    if (b.id) res.json((await db(`UPDATE ly_tiers SET name=$2, threshold=$3, color=$4, icon=$5, earn_mult=$6, entry_points=$7, perks=$8, rule_overrides=$9 WHERE id=$1 AND store=$10 RETURNING *`, [b.id, ...vals, s])).rows[0]);
    else res.json((await db(`INSERT INTO ly_tiers (store, name, threshold, color, icon, earn_mult, entry_points, perks, rule_overrides) VALUES ($9,$1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [...vals, s])).rows[0]);
  }));
  app.delete("/api/loyalty/tiers/:id", wrap(async (req, res) => { await db(`UPDATE ly_members SET tier_id=NULL WHERE tier_id=$1`, [req.params.id]); await db(`DELETE FROM ly_tiers WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }));
  app.get("/api/loyalty/settings", wrap(async (req, res) => { const s = S(req, res); if (!s) return; const st = await settings(s); res.json({ ...st, snippet: themeSnippet(st), widget_url: `${PUBLIC_URL()}/ly/${s}/widget.js`, shop: STORES[s].shop }); }));
  app.post("/api/loyalty/settings", wrap(async (req, res) => {
    const s = S(req, res); if (!s) return; const b = req.body || {}; const p = {};
    for (const k of ["name", "currency", "currency_plural", "page_path", "spend_basis", "program_start"]) if (b[k] !== undefined) p[k] = b[k] === null ? null : clean(b[k], 120);
    for (const k of ["expiry", "vip", "combine", "referrals"]) if (b[k] && typeof b[k] === "object") p[k] = b[k];
    if (b.blocklist_tags !== undefined) p.blocklist_tags = (Array.isArray(b.blocklist_tags) ? b.blocklist_tags : String(b.blocklist_tags).split(",")).map((x) => clean(x, 60)).filter(Boolean).slice(0, 30);
    for (const k of ["restrict_to_redeemer", "auto_pending"]) if (b[k] !== undefined) p[k] = !!b[k];
    if (b.design_draft !== undefined) p.design_draft = b.design_draft;
    if (b.publish_design) { const st = await settings(s); p.design = b.design_draft || st.design_draft || null; p.design_published_at = new Date().toISOString(); }
    if (b.live !== undefined) { p.live = !!b.live; if (p.live) p.launched_at = (await settings(s)).launched_at || new Date().toISOString(); await core.audit({ kind: "rewards", detail: `${p.live ? "Launched" : "Paused"} rewards for ${STORES[s].name}`, who: actorOf(req) }).catch(() => {}); }
    if (b.rotate_secret) p.secret = crypto.randomBytes(24).toString("hex");
    await saveSettings(s, p); const st = await settings(s); res.json({ ...st, snippet: themeSnippet(st) });
  }));
  app.get("/api/loyalty/referrals", wrap(async (req, res) => { const s = S(req, res); if (s) res.json({ rows: (await db(`SELECT r.*, m.email advocate_email, m.first_name advocate_name FROM ly_referrals r JOIN ly_members m ON m.id=r.advocate_id WHERE r.store=$1 ORDER BY r.created_at DESC LIMIT 300`, [s])).rows }); }));
  app.get("/api/loyalty/redemptions", wrap(async (req, res) => { const s = S(req, res); if (s) res.json({ rows: (await db(`SELECT d.*, m.email, m.first_name, m.last_name FROM ly_redemptions d JOIN ly_members m ON m.id=d.member_id WHERE d.store=$1 ORDER BY d.created_at DESC LIMIT 300`, [s])).rows }); }));
  // preview: a staff member sees the widget as a sample member (no real points or codes)
  app.get("/api/loyalty/preview-member", wrap(async (req, res) => {
    const s = S(req, res); if (!s) return; const T = await tiers(s); const st = await settings(s);
    res.json({ member: { id: 0, status: "enrolled", first_name: "Maria", points: 1340, pending: 120, earned: 2210, tier: T[1] ? { id: T[1].id, name: T[1].name, color: T[1].color, icon: T[1].icon } : null, next_tier: T[2] ? { name: T[2].name, threshold: T[2].threshold, to_go: 135 } : null,
      spend: Math.max(0, (T[2] ? T[2].threshold : 600) - 135), birthday: null, referral_url: `${PUBLIC_URL()}/ly/${s}/r/SAMPLE`, redemptions: [{ id: 1, title: "$5 off", code: "RWD-1A2B3C", points: 500, status: "issued", expires_at: new Date(Date.now() + 60 * 864e5) }],
      history: [{ delta: 120, reason: "order", note: "Order #LB1234", available_at: new Date(), at: new Date(Date.now() - 2 * 864e5) }, { delta: 200, reason: "join", note: "Joined the program", at: new Date(Date.now() - 40 * 864e5) }], done: {}, currency_plural: st.currency_plural } });
  }));
}

async function startJobs(syncGet, syncSet) {
  const run = async () => { try { const k = bzDay(); if ((await syncGet("loyalty_daily")) === k) return; await daily(); await syncSet("loyalty_daily", k); } catch (e) { console.error("rewards daily:", e.message); } };
  setTimeout(run, 90e3); setInterval(run, 3600e3);
}

module.exports = { migrate, routes, startJobs, onEvent, settings, program, join, redeem, addPoints, memberFor, STORES, EARN_TYPES, REDEEM_TYPES };
