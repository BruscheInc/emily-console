/* =============================================================================================
 *  Buzzin Marketing · contacts, consent and events  (Phase 1)
 *
 *  One profile per person per store. Built from:
 *    • the Klaviyo copy (hd_klaviyo_profiles)  — consent, properties, last activity, lists
 *    • Shopify customers (bulk export)          — consent, orders count, spend, address
 *    • Shopify orders (bulk export)             — "placed order" events with items and sizes
 *  Consent: the most recent change wins, except a bounce or spam complaint, which always stops email.
 *  Klaviyo's "manually suppressed" (used to save on billing) is NOT an unsubscribe: those people keep
 *  their consent and start in the "lapsed" tier.
 *
 *  Nothing here sends anything.
 * ============================================================================================= */
const readline = require("readline");
const { Readable } = require("stream");
const core = require("./core");
const { db } = core;
const R = () => require("./returns");

const STORES = { lb: "Larkspur Baby", lbo: "Larkspur Baby Outlet" };
const CONSENT_RANK = { stopped: 4, unsubscribed: 3, subscribed: 2, never: 1 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const normEmail = (e) => { const s = String(e || "").trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null; };
const normPhone = (p) => { const d = String(p || "").replace(/[^\d+]/g, ""); if (!d) return null; if (d.startsWith("+")) return d; if (d.length === 10) return "+1" + d; if (d.length === 11 && d.startsWith("1")) return "+" + d; return d.length >= 8 ? "+" + d : null; };

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS mk_profiles (
    id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, email TEXT, phone TEXT, first_name TEXT, last_name TEXT,
    shopify_id TEXT, klaviyo_id TEXT, city TEXT, region TEXT, country TEXT, zip TEXT, timezone TEXT,
    props JSONB NOT NULL DEFAULT '{}', email_consent TEXT NOT NULL DEFAULT 'never', email_consent_at TIMESTAMPTZ,
    sms_consent TEXT NOT NULL DEFAULT 'never', sms_consent_at TIMESTAMPTZ,
    orders_count INT NOT NULL DEFAULT 0, total_spent NUMERIC(12,2) NOT NULL DEFAULT 0, first_order_at TIMESTAMPTZ, last_order_at TIMESTAMPTZ,
    last_engaged_at TIMESTAMPTZ, tier TEXT NOT NULL DEFAULT 'new', sources TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS mk_profiles_store_email ON mk_profiles (store, email) WHERE email IS NOT NULL`);
  await db(`CREATE INDEX IF NOT EXISTS mk_profiles_store_phone ON mk_profiles (store, phone)`);
  await db(`CREATE INDEX IF NOT EXISTS mk_profiles_shopify ON mk_profiles (shopify_id)`);
  await db(`CREATE TABLE IF NOT EXISTS mk_consent_log (id BIGSERIAL PRIMARY KEY, profile_id BIGINT NOT NULL, channel TEXT NOT NULL, state TEXT NOT NULL,
    previous TEXT, source TEXT, detail TEXT, wording TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now(), logged_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE INDEX IF NOT EXISTS mk_consent_profile ON mk_consent_log (profile_id, at DESC)`);
  await db(`CREATE TABLE IF NOT EXISTS mk_events (id BIGSERIAL PRIMARY KEY, profile_id BIGINT, store TEXT NOT NULL, type TEXT NOT NULL,
    at TIMESTAMPTZ NOT NULL, value NUMERIC(12,2), props JSONB NOT NULL DEFAULT '{}', source TEXT, ext_id TEXT)`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS mk_events_ext ON mk_events (store, type, ext_id) WHERE ext_id IS NOT NULL`);
  await db(`CREATE INDEX IF NOT EXISTS mk_events_profile ON mk_events (profile_id, at DESC)`);
  await db(`CREATE INDEX IF NOT EXISTS mk_events_type_at ON mk_events (store, type, at DESC)`);
  await db(`CREATE TABLE IF NOT EXISTS mk_lists (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, description TEXT, source TEXT, ext_id TEXT,
    double_opt_in BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS mk_lists_ext ON mk_lists (store, source, ext_id) WHERE ext_id IS NOT NULL`);
  await db(`CREATE TABLE IF NOT EXISTS mk_list_members (list_id BIGINT NOT NULL, profile_id BIGINT NOT NULL, added_at TIMESTAMPTZ DEFAULT now(), source TEXT, PRIMARY KEY (list_id, profile_id))`);
  await db(`CREATE INDEX IF NOT EXISTS mk_list_members_profile ON mk_list_members (profile_id)`);
}

/* ---------------- settings: sending is OFF until turned on per store and channel ---------------- */
const DEFAULT_SETTINGS = {
  sending: { lb: { email: false, sms: false }, lbo: { email: false, sms: false } },
  test_list: [],                 // internal addresses / phones that may receive tests while sending is off
  quiet_hours: { start: "21:00", end: "08:00" },
  smart_sending_hours: { email: 16, sms: 24 },
  attribution: { email_click_days: 5, sms_click_days: 1 },
  caps: { per_hour: 20000, per_day: 120000 },
};
async function settings() {
  const v = await core.setting("mk_settings", null);
  return { ...DEFAULT_SETTINGS, ...(v || {}), sending: { ...DEFAULT_SETTINGS.sending, ...((v && v.sending) || {}) } };
}
async function saveSettings(patch, who) {
  const cur = await settings();
  const next = { ...cur, ...patch };
  if (patch.test_list) next.test_list = [...new Set(patch.test_list.map((x) => String(x).trim()).filter(Boolean))].slice(0, 50);
  await db(`INSERT INTO emily_settings (key, value, updated_by, updated_at) VALUES ('mk_settings',$1,$2,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [JSON.stringify(next), who || null]);
  return next;
}

/* ---------------- profiles ---------------- */
async function findProfile(store, { email, phone, shopifyId, klaviyoId }) {
  if (email) { const r = (await db(`SELECT * FROM mk_profiles WHERE store=$1 AND email=$2`, [store, email])).rows[0]; if (r) return r; }
  if (shopifyId) { const r = (await db(`SELECT * FROM mk_profiles WHERE store=$1 AND shopify_id=$2 LIMIT 1`, [store, shopifyId])).rows[0]; if (r) return r; }
  if (klaviyoId) { const r = (await db(`SELECT * FROM mk_profiles WHERE store=$1 AND klaviyo_id=$2 LIMIT 1`, [store, klaviyoId])).rows[0]; if (r) return r; }
  if (phone) { const r = (await db(`SELECT * FROM mk_profiles WHERE store=$1 AND phone=$2 ORDER BY (email IS NULL) DESC LIMIT 1`, [store, phone])).rows[0]; if (r) return r; }
  return null;
}

/** Create or fill in a profile. Existing values are kept unless the new value is filled and the old one isn't. */
async function upsertProfile(store, p, source) {
  const email = normEmail(p.email), phone = normPhone(p.phone);
  if (!email && !phone) return null;
  const cur = await findProfile(store, { email, phone, shopifyId: p.shopify_id, klaviyoId: p.klaviyo_id });
  if (!cur) {
    const r = await db(`INSERT INTO mk_profiles (store, email, phone, first_name, last_name, shopify_id, klaviyo_id, city, region, country, zip, timezone, props, sources, last_engaged_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,COALESCE($16, now())) ON CONFLICT DO NOTHING RETURNING *`,
      [store, email, phone, p.first_name || null, p.last_name || null, p.shopify_id || null, p.klaviyo_id || null, p.city || null, p.region || null, p.country || null, p.zip || null, p.timezone || null,
       JSON.stringify(p.props || {}), [source], p.last_engaged_at || null, p.created_at || null]);
    return r.rows[0] || (await findProfile(store, { email, phone }));
  }
  const r = await db(`UPDATE mk_profiles SET
      email=COALESCE(email,$2), phone=COALESCE(phone,$3), first_name=COALESCE(NULLIF(first_name,''),$4), last_name=COALESCE(NULLIF(last_name,''),$5),
      shopify_id=COALESCE(shopify_id,$6), klaviyo_id=COALESCE(klaviyo_id,$7), city=COALESCE(city,$8), region=COALESCE(region,$9), country=COALESCE(country,$10), zip=COALESCE(zip,$11),
      timezone=COALESCE(timezone,$12), props=props || $13::jsonb, sources=(SELECT ARRAY(SELECT DISTINCT unnest(sources || $14::text[]))),
      last_engaged_at=GREATEST(last_engaged_at,$15), created_at=LEAST(created_at, COALESCE($16, created_at)), updated_at=now()
    WHERE id=$1 RETURNING *`,
    [cur.id, email, phone, p.first_name || null, p.last_name || null, p.shopify_id || null, p.klaviyo_id || null, p.city || null, p.region || null, p.country || null, p.zip || null, p.timezone || null,
     JSON.stringify(p.props || {}), [source], p.last_engaged_at || null, p.created_at || null]);
  return r.rows[0];
}

/**
 * Record a consent state from a source. The newest change wins; a bounce or complaint ("stopped") can only be
 * cleared by a newer, explicit re-subscribe through a Buzzin form.
 */
async function setConsent(profile, channel, state, { source, detail, wording, at } = {}) {
  if (!profile || !CONSENT_RANK[state]) return false;
  const col = channel === "sms" ? "sms_consent" : "email_consent";
  const atCol = channel === "sms" ? "sms_consent_at" : "email_consent_at";
  const when = at ? new Date(at) : new Date();
  const curState = profile[col] || "never", curAt = profile[atCol] ? new Date(profile[atCol]) : null;
  if (curState === state) return false;
  if (curState === "stopped" && !(state === "subscribed" && /^form/.test(source || ""))) return false;
  if (state !== "stopped" && curAt && curAt > when && curState !== "never") return false;   // an older record never overrides a newer one
  await db(`UPDATE mk_profiles SET ${col}=$2, ${atCol}=$3, updated_at=now() WHERE id=$1`, [profile.id, state, when]);
  await db(`INSERT INTO mk_consent_log (profile_id, channel, state, previous, source, detail, wording, at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [profile.id, channel, state, curState, source || null, detail || null, wording || null, when]);
  profile[col] = state; profile[atCol] = when;
  return true;
}

/* ---------------- lists ---------------- */
async function ensureList(store, name, { source = "buzzin", ext_id = null, description = null } = {}) {
  if (ext_id) {
    const r = (await db(`SELECT * FROM mk_lists WHERE store=$1 AND source=$2 AND ext_id=$3`, [store, source, ext_id])).rows[0];
    if (r) { if (r.name !== name) await db(`UPDATE mk_lists SET name=$2 WHERE id=$1`, [r.id, name]); return r; }
  }
  return (await db(`INSERT INTO mk_lists (store, name, description, source, ext_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [store, name, description, source, ext_id])).rows[0];
}
async function addToList(listId, profileId, source) {
  await db(`INSERT INTO mk_list_members (list_id, profile_id, source) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [listId, profileId, source || null]);
}

/* ---------------- tiers: how engaged someone is, used to pace email ---------------- */
async function recomputeTiers(store) {
  const args = store ? [store] : [];
  const w = store ? "WHERE store=$1" : "";
  await db(`UPDATE mk_profiles SET tier = CASE
      WHEN email_consent='stopped' THEN 'stopped'
      WHEN orders_count >= 3 OR total_spent >= 300 THEN CASE WHEN GREATEST(last_engaged_at,last_order_at) > now() - interval '180 days' THEN 'vip' ELSE 'lapsed' END
      WHEN GREATEST(last_engaged_at,last_order_at) > now() - interval '90 days' THEN 'engaged'
      WHEN (props->>'klaviyo_suppressed')::boolean IS TRUE THEN 'lapsed'
      WHEN GREATEST(last_engaged_at,last_order_at) > now() - interval '365 days' THEN 'cooling'
      WHEN GREATEST(last_engaged_at,last_order_at) IS NULL AND created_at > now() - interval '30 days' THEN 'new'
      ELSE 'lapsed' END ${w}`, args);
}

/* ---------------- Klaviyo copy → profiles ---------------- */
function klaviyoEmailConsent(sub) {
  const m = sub && sub.email && sub.email.marketing;
  if (!m) return null;
  const sup = (m.suppression || []).map((s) => String(s.reason || "").toUpperCase());
  if (sup.some((r) => /BOUNCE|INVALID/.test(r))) return { state: "stopped", detail: "bounced (Klaviyo)", at: m.last_updated };
  if (sup.some((r) => /SPAM/.test(r))) return { state: "stopped", detail: "marked spam (Klaviyo)", at: m.last_updated };
  const c = String(m.consent || "").toUpperCase();
  const state = c === "SUBSCRIBED" ? "subscribed" : c === "UNSUBSCRIBED" ? "unsubscribed" : "never";
  return { state, detail: [m.method, m.method_detail].filter(Boolean).join(" · ") || null, at: m.consent_timestamp || m.last_updated, userSuppressed: sup.some((r) => /USER|MANUAL/.test(r)) };
}
function klaviyoSmsConsent(sub) {
  const m = sub && sub.sms && sub.sms.marketing;
  if (!m) return null;
  const c = String(m.consent || "").toUpperCase();
  return { state: c === "SUBSCRIBED" ? "subscribed" : c === "UNSUBSCRIBED" ? "unsubscribed" : "never", detail: [m.method, m.method_detail].filter(Boolean).join(" · ") || null, at: m.consent_timestamp || m.last_updated };
}

async function syncFromKlaviyo(store = "lb") {
  let lastId = "", n = 0;
  for (;;) {
    const rows = (await db(`SELECT id, data FROM hd_klaviyo_profiles WHERE id > $1 ORDER BY id LIMIT 500`, [lastId])).rows;
    if (!rows.length) break;
    for (const r of rows) {
      lastId = r.id;
      const a = r.data || {};
      const loc = a.location || {};
      const ec = klaviyoEmailConsent(a.subscriptions), sc = klaviyoSmsConsent(a.subscriptions);
      const props = { ...(a.properties || {}) };
      if (ec && ec.userSuppressed) props.klaviyo_suppressed = true;
      const prof = await upsertProfile(store, {
        email: a.email, phone: a.phone_number, first_name: a.first_name, last_name: a.last_name, klaviyo_id: r.id,
        city: loc.city, region: loc.region, country: loc.country, zip: loc.zip, timezone: loc.timezone,
        props, last_engaged_at: a.last_event_date || null, created_at: a.created || null,
      }, "klaviyo");
      if (!prof) continue;
      if (ec) await setConsent(prof, "email", ec.state, { source: "klaviyo", detail: ec.detail, at: ec.at });
      if (sc) await setConsent(prof, "sms", sc.state, { source: "klaviyo", detail: sc.detail, at: sc.at });
      n++;
    }
  }
  // Lists and segment snapshots from Klaviyo become Buzzin lists (segments are rebuilt as live segments in phase 5).
  const groups = (await db(`SELECT kind, id, name FROM hd_klaviyo WHERE kind IN ('list','segment')`)).rows;
  for (const g of groups) {
    const list = await ensureList(store, g.kind === "segment" ? `${g.name} (Klaviyo segment snapshot)` : g.name, { source: "klaviyo", ext_id: `${g.kind}:${g.id}` });
    await db(`INSERT INTO mk_list_members (list_id, profile_id, source)
              SELECT $1, p.id, 'klaviyo' FROM hd_klaviyo_members m JOIN mk_profiles p ON p.store=$2 AND p.klaviyo_id=m.profile_id
              WHERE m.kind=$3 AND m.group_id=$4 ON CONFLICT DO NOTHING`, [list.id, store, g.kind, g.id]);
  }
  return n;
}

/* ---------------- Shopify bulk exports ---------------- */
const CUSTOMERS_BULK = `{ customers { edges { node { id email phone firstName lastName createdAt numberOfOrders amountSpent { amount } tags locale
  defaultAddress { city provinceCode countryCodeV2 zip }
  emailMarketingConsent { marketingState consentUpdatedAt } smsMarketingConsent { marketingState consentUpdatedAt consentCollectedFrom } } } } }`;
const ORDERS_BULK = (since) => `{ orders(query: "created_at:>=${since}") { edges { node { id name createdAt cancelledAt email customer { id }
  totalPriceSet { shopMoney { amount } } discountCodes sourceName
  lineItems { edges { node { title variantTitle sku quantity product { id } originalUnitPriceSet { shopMoney { amount } } } } } } } } }`;

async function runBulk(st, query, label) {
  const start = await R().gql(st, `mutation R($q: String!) { bulkOperationRunQuery(query: $q) { bulkOperation { id status } userErrors { field message } } }`, { q: query });
  const res = start.bulkOperationRunQuery || (start.data && start.data.bulkOperationRunQuery);
  if (!res || (res.userErrors && res.userErrors.length)) throw new Error(`${label}: ${JSON.stringify(res && res.userErrors)}`);
  const id = res.bulkOperation.id;
  for (let i = 0; i < 720; i++) {
    await sleep(i < 6 ? 5000 : 15000);
    const s = await R().gql(st, `query S($id: ID!) { node(id: $id) { ... on BulkOperation { id status errorCode objectCount url partialDataUrl } } }`, { id });
    const op = s.node || (s.data && s.data.node);
    if (!op) continue;
    if (op.status === "COMPLETED") return op;
    if (["FAILED", "CANCELED", "EXPIRED"].includes(op.status)) throw new Error(`${label}: bulk export ${op.status} ${op.errorCode || ""}`);
  }
  throw new Error(`${label}: bulk export timed out`);
}

async function* jsonl(url) {
  if (!url) return;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${r.status}`);
  const rl = readline.createInterface({ input: Readable.fromWeb(r.body), crlfDelay: Infinity });
  for await (const line of rl) { if (line.trim()) yield JSON.parse(line); }
}

function shopifyConsent(c) {
  if (!c) return null;
  const s = String(c.marketingState || "").toUpperCase();
  const state = s === "SUBSCRIBED" ? "subscribed" : s === "UNSUBSCRIBED" ? "unsubscribed" : s === "INVALID" ? "stopped" : s === "REDACTED" ? null : "never";
  return state ? { state, at: c.consentUpdatedAt || null, detail: c.consentCollectedFrom || null } : null;
}

async function syncShopifyCustomers(store) {
  const st = R().shopFor(store);
  const op = await runBulk(st, CUSTOMERS_BULK, `${store} customers`);
  let n = 0;
  for await (const c of jsonl(op.url)) {
    const a = c.defaultAddress || {};
    const prof = await upsertProfile(store, {
      email: c.email, phone: c.phone, first_name: c.firstName, last_name: c.lastName, shopify_id: c.id,
      city: a.city, region: a.provinceCode, country: a.countryCodeV2, zip: a.zip, created_at: c.createdAt,
      props: { shopify_tags: c.tags || [], locale: c.locale || null },
    }, "shopify");
    if (!prof) continue;
    await db(`UPDATE mk_profiles SET orders_count=GREATEST(orders_count,$2), total_spent=GREATEST(total_spent,$3) WHERE id=$1`, [prof.id, Number(c.numberOfOrders || 0), Number((c.amountSpent && c.amountSpent.amount) || 0)]);
    const ec = shopifyConsent(c.emailMarketingConsent), sc = shopifyConsent(c.smsMarketingConsent);
    if (ec) await setConsent(prof, "email", ec.state, { source: "shopify", detail: ec.detail, at: ec.at });
    if (sc) await setConsent(prof, "sms", sc.state, { source: "shopify", detail: sc.detail, at: sc.at });
    n++;
  }
  return n;
}

/** Sizes like "3-6M", "0-3 Months", "12-18M", "2T" pulled from a variant title, for size-up flows and segments. */
function sizeOf(variantTitle) {
  const t = String(variantTitle || "");
  const m = t.match(/\b(preemie|newborn|nb|\d{1,2}\s*-\s*\d{1,2}\s*(?:m|mo|months?)|\d{1,2}t|\d{1,2}\s*(?:y|yrs?|years?))\b/i);
  return m ? m[1].replace(/\s+/g, "").toUpperCase().replace(/MONTHS?|MO$/, "M") : null;
}

async function syncShopifyOrders(store, since) {
  const st = R().shopFor(store);
  const op = await runBulk(st, ORDERS_BULK(since), `${store} orders`);
  let n = 0, order = null;
  const flush = async () => {
    if (!order) return;
    const o = order; order = null;
    const email = normEmail(o.email);
    let prof = email ? await findProfile(store, { email }) : null;
    if (!prof && o.customer && o.customer.id) prof = await findProfile(store, { shopifyId: o.customer.id });
    if (!prof && email) prof = await upsertProfile(store, { email, shopify_id: o.customer && o.customer.id }, "shopify");
    const items = o.items.map((li) => ({ title: li.title, variant: li.variantTitle || null, size: sizeOf(li.variantTitle), sku: li.sku || null, qty: li.quantity, price: Number((li.originalUnitPriceSet && li.originalUnitPriceSet.shopMoney.amount) || 0), product_id: li.product ? li.product.id : null }));
    await db(`INSERT INTO mk_events (profile_id, store, type, at, value, props, source, ext_id) VALUES ($1,$2,'placed_order',$3,$4,$5,'shopify',$6)
              ON CONFLICT (store, type, ext_id) WHERE ext_id IS NOT NULL DO UPDATE SET profile_id=EXCLUDED.profile_id, value=EXCLUDED.value, props=EXCLUDED.props`,
      [prof ? prof.id : null, store, o.createdAt, Number((o.totalPriceSet && o.totalPriceSet.shopMoney.amount) || 0),
       JSON.stringify({ name: o.name, cancelled: !!o.cancelledAt, discount_codes: o.discountCodes || [], source: o.sourceName || null, items }), o.id]);
    n++;
  };
  for await (const row of jsonl(op.url)) {
    if (row.__parentId) { if (order && row.__parentId === order.id) order.items.push(row); continue; }
    await flush();
    order = { ...row, items: [] };
  }
  await flush();
  // Roll the orders up onto each profile (cancelled orders don't count).
  await db(`UPDATE mk_profiles p SET orders_count=GREATEST(p.orders_count, x.n), total_spent=GREATEST(p.total_spent, x.spent), first_order_at=x.first, last_order_at=x.last,
              props = p.props || jsonb_build_object('last_sizes', x.sizes), updated_at=now()
            FROM (SELECT e.profile_id, count(*)::int n, sum(e.value) spent, min(e.at) first, max(e.at) last,
                    (SELECT to_jsonb(array_agg(DISTINCT s)) FROM (SELECT jsonb_array_elements(e2.props->'items')->>'size' s FROM mk_events e2
                       WHERE e2.profile_id=e.profile_id AND e2.type='placed_order' AND e2.at = max(e.at)) z WHERE s IS NOT NULL) sizes
                  FROM mk_events e WHERE e.store=$1 AND e.type='placed_order' AND e.profile_id IS NOT NULL AND NOT COALESCE((e.props->>'cancelled')::boolean,false)
                  GROUP BY e.profile_id) x
            WHERE p.id = x.profile_id`, [store]);
  return n;
}

/* ---------------- the whole Phase-1 sync, resumable step by step ---------------- */
let syncing = null;
const syncLog = [];
const note = (m) => { const line = `${new Date().toISOString().slice(11, 19)} ${m}`; syncLog.push(line); if (syncLog.length > 60) syncLog.shift(); console.log(`👥 ${m}`); };

async function syncAll({ force = false, who = "system" } = {}) {
  if (syncing) return syncing;
  syncing = (async () => {
    const steps = [
      ["klaviyo", async () => { const ks = await core.syncGet("klaviyo_profiles_v1").catch(() => null); if (!ks || !ks.state || !ks.state.done) return "waiting for the Klaviyo copy"; return `${await syncFromKlaviyo("lb")} Klaviyo profiles merged`; }],
      ["shopify_customers_lb", async () => `${await syncShopifyCustomers("lb")} Larkspur Baby customers`],
      ["shopify_customers_lbo", async () => `${await syncShopifyCustomers("lbo")} Outlet customers`],
      ["shopify_orders_lb", async () => `${await syncShopifyOrders("lb", "2023-01-01")} Larkspur Baby orders`],
      ["shopify_orders_lbo", async () => `${await syncShopifyOrders("lbo", "2023-01-01")} Outlet orders`],
      ["tiers", async () => { await recomputeTiers(); return "engagement tiers set"; }],
    ];
    for (const [key, fn] of steps) {
      const done = await core.syncGet(`mk_sync_${key}`).catch(() => null);
      if (done && done.cursor && !force) continue;
      try {
        note(`${key}: starting`);
        const out = await fn();
        note(`${key}: ${out}`);
        if (!/^waiting/.test(out)) await core.syncSet(`mk_sync_${key}`, new Date().toISOString(), { out, by: who });
      } catch (e) { note(`${key}: failed — ${e.message}`); }
    }
    return { ok: true };
  })().finally(() => { syncing = null; });
  return syncing;
}

/* ---------------- reads for the Profiles screen ---------------- */
async function overview(store) {
  const w = store ? "WHERE store=$1" : "", a = store ? [store] : [];
  const r = (await db(`SELECT count(*)::int total,
      count(*) FILTER (WHERE email_consent='subscribed')::int email_ok, count(*) FILTER (WHERE sms_consent='subscribed')::int sms_ok,
      count(*) FILTER (WHERE email_consent='unsubscribed')::int email_unsub, count(*) FILTER (WHERE email_consent='stopped')::int email_stopped,
      count(*) FILTER (WHERE orders_count>0)::int buyers,
      count(*) FILTER (WHERE (props->>'klaviyo_suppressed')::boolean)::int klaviyo_suppressed
      FROM mk_profiles ${w}`, a)).rows[0];
  const tiers = (await db(`SELECT tier, count(*)::int n FROM mk_profiles ${w} GROUP BY tier ORDER BY n DESC`, a)).rows;
  const sync = {};
  for (const k of ["klaviyo", "shopify_customers_lb", "shopify_customers_lbo", "shopify_orders_lb", "shopify_orders_lbo", "tiers"]) { const s = await core.syncGet(`mk_sync_${k}`).catch(() => null); sync[k] = s ? { at: s.cursor, ...(s.state || {}) } : null; }
  const ks = await core.syncGet("klaviyo_profiles_v1").catch(() => null);
  return { ...r, tiers, sync, klaviyo_copy: ks ? ks.state : null, syncing: !!syncing, log: syncLog.slice(-20) };
}

async function search({ store, q, consent, tier, list, limit = 50, offset = 0 }) {
  const args = [], where = [];
  if (store) { args.push(store); where.push(`p.store=$${args.length}`); }
  if (q) { args.push(`%${String(q).toLowerCase()}%`); where.push(`(p.email LIKE $${args.length} OR lower(coalesce(p.first_name,'')||' '||coalesce(p.last_name,'')) LIKE $${args.length} OR p.phone LIKE $${args.length})`); }
  if (consent === "email") where.push(`p.email_consent='subscribed'`);
  if (consent === "sms") where.push(`p.sms_consent='subscribed'`);
  if (consent === "none") where.push(`p.email_consent<>'subscribed' AND p.sms_consent<>'subscribed'`);
  if (tier) { args.push(tier); where.push(`p.tier=$${args.length}`); }
  if (list) { args.push(Number(list)); where.push(`EXISTS (SELECT 1 FROM mk_list_members m WHERE m.profile_id=p.id AND m.list_id=$${args.length})`); }
  const W = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = (await db(`SELECT count(*)::int n FROM mk_profiles p ${W}`, args)).rows[0].n;
  args.push(Math.min(Number(limit) || 50, 200), Math.max(Number(offset) || 0, 0));
  const rows = (await db(`SELECT p.id, p.store, p.email, p.phone, p.first_name, p.last_name, p.email_consent, p.sms_consent, p.tier, p.orders_count, p.total_spent, p.last_order_at, p.last_engaged_at
                          FROM mk_profiles p ${W} ORDER BY p.last_order_at DESC NULLS LAST, p.id DESC LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
  return { total, rows };
}

async function profile(id) {
  const p = (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [Number(id)])).rows[0];
  if (!p) return null;
  const consent = (await db(`SELECT channel, state, previous, source, detail, at FROM mk_consent_log WHERE profile_id=$1 ORDER BY at DESC LIMIT 40`, [p.id])).rows;
  const events = (await db(`SELECT type, at, value, props, source FROM mk_events WHERE profile_id=$1 ORDER BY at DESC LIMIT 60`, [p.id])).rows;
  const lists = (await db(`SELECT l.id, l.name, m.added_at FROM mk_list_members m JOIN mk_lists l ON l.id=m.list_id WHERE m.profile_id=$1 ORDER BY l.name`, [p.id])).rows;
  const tickets = p.email ? (await db(`SELECT id, subject, status, last_message_at FROM hd_tickets WHERE lower(customer_email)=$1 ORDER BY last_message_at DESC NULLS LAST LIMIT 10`, [p.email]).catch(() => ({ rows: [] }))).rows : [];
  return { ...p, consent, events, lists, tickets };
}

async function lists(store) {
  const a = store ? [store] : [];
  return (await db(`SELECT l.*, (SELECT count(*)::int FROM mk_list_members m WHERE m.list_id=l.id) members,
      (SELECT count(*)::int FROM mk_list_members m JOIN mk_profiles p ON p.id=m.profile_id WHERE m.list_id=l.id AND p.email_consent='subscribed') email_ok
    FROM mk_lists l ${store ? "WHERE l.store=$1" : ""} ORDER BY l.name`, a)).rows;
}

/** Record something a person did (from the store script, forms, Buzzin). Used by flows and segments. */
async function track(store, type, { profileId, email, phone, at, value, props, source, extId } = {}) {
  let pid = profileId || null;
  if (!pid && (email || phone)) { const p = await findProfile(store, { email: normEmail(email), phone: normPhone(phone) }); pid = p ? p.id : null; }
  const r = await db(`INSERT INTO mk_events (profile_id, store, type, at, value, props, source, ext_id) VALUES ($1,$2,$3,COALESCE($4, now()),$5,$6,$7,$8)
                      ON CONFLICT (store, type, ext_id) WHERE ext_id IS NOT NULL DO NOTHING RETURNING id`,
    [pid, store, type, at || null, value == null ? null : Number(value), JSON.stringify(props || {}), source || null, extId || null]);
  if (pid && /^(opened|clicked|active_on_site|viewed_product|added_to_cart|submitted_form)/.test(type)) await db(`UPDATE mk_profiles SET last_engaged_at=GREATEST(last_engaged_at, COALESCE($2, now())) WHERE id=$1`, [pid, at || null]);
  try { require("./mk-flows").onEvent && require("./mk-flows").onEvent(store, type, pid, props || {}); } catch (_) {}
  return r.rows[0] ? r.rows[0].id : null;
}

async function init() {
  await migrate();
  // Start the first sync shortly after boot; each step runs once and is remembered.
  setTimeout(() => syncAll({ who: "boot" }).catch(() => {}), 90 * 1000);
  // While the Klaviyo copy is still in progress, check again every 10 minutes so the merge runs when it finishes.
  setInterval(async () => { const s = await core.syncGet("mk_sync_klaviyo").catch(() => null); if (!s || !s.cursor) syncAll({ who: "retry" }).catch(() => {}); }, 10 * 60 * 1000);
  setInterval(() => recomputeTiers().catch(() => {}), 6 * 3600 * 1000);
}

module.exports = { STORES, init, migrate, settings, saveSettings, normEmail, normPhone, findProfile, upsertProfile, setConsent, ensureList, addToList, track,
  recomputeTiers, syncAll, syncFromKlaviyo, syncShopifyCustomers, syncShopifyOrders, overview, search, profile, lists, sizeOf };
