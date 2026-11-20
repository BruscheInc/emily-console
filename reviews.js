/* =============================================================================================
 *  Buzzin · Product reviews (replaces Okendo)
 *
 *  • Every published Okendo review is copied in (Okendo's public review API — no export file needed), and kept in
 *    step every few hours until Okendo is turned off. Okendo review groups ("Okendo Bodysuits"… Shopify collections)
 *    are copied too, so a product page shows the reviews of every product in its group, like today.
 *  • New reviews come in through the review page (from the review-request emails, or "Write a review" on the site).
 *    4–5 stars publish right away; lower ratings wait for a person, and publish on their own after 14 days unless
 *    someone rejects them (the FTC rule against hiding bad reviews — same as Okendo).
 *  • The store shows them with /rv/<store>/widget.js (loaded by the Buzzin script already on the theme).
 *  • Staff: Reviews section in Buzzin (moderate, reply, re-sync).
 * ============================================================================================= */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const core = require("./core");
const { db } = core;

const STORES = { lb: { name: "Larkspur Baby", okendo: "ac2ed04b-f605-4570-9c56-94cbc802048e", shop: "https://larkspurbaby.com" },
                 lbo: { name: "Larkspur Baby Outlet", okendo: "b6b28336-b4e9-4c3e-9fc6-c70ab41914ee", shop: "https://larkspurbabyoutlet.com" } };
const PUBLIC_URL = () => (process.env.PUBLIC_URL || "https://emily-console-production.up.railway.app").replace(/\/$/, "");
const HOLD_DAYS = 14;
const DEFAULTS = { auto_publish_min: 4, photo_filter: true, live: { lb: false, lbo: false }, requests: { lb: false, lbo: false }, wait_days: 14, reminder_days: 7, reminders: 2 };

async function settings() { const s = await core.setting("reviews_settings", null); return { ...DEFAULTS, ...(s || {}), live: { ...DEFAULTS.live, ...((s && s.live) || {}) }, requests: { ...DEFAULTS.requests, ...((s && s.requests) || {}) } }; }
/* ---- design (Customize): per store, a draft the editor autosaves and the live copy the store shows ---- */
async function designs() { return (await core.setting("reviews_design", null)) || {}; }
async function saveDesign(store, patch) {
  const all = await designs(); const cur = all[store] || {};
  all[store] = { ...cur, ...patch, updated_at: new Date().toISOString() };
  await db(`INSERT INTO emily_settings (key, value) VALUES ('reviews_design', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [JSON.stringify(all)]);
  return all[store];
}
function cleanDesign(d) { const j = JSON.stringify(d || {}); if (j.length > 60000) throw Object.assign(new Error("Design is too large."), { status: 400 }); return JSON.parse(j); }
async function sampleProduct(store) {
  return (await db(`SELECT product_id id, max(product_title) title, max(product_handle) handle, count(*)::int n FROM rv_reviews WHERE store=$1 AND status='published' AND product_id IS NOT NULL
    GROUP BY product_id ORDER BY count(*) FILTER (WHERE jsonb_array_length(media)>0) DESC, count(*) DESC LIMIT 1`, [store])).rows[0] || null;
}

async function saveSettings(patch) {
  const cur = await settings(); const next = { ...cur, ...patch, live: { ...cur.live, ...((patch && patch.live) || {}) }, requests: { ...cur.requests, ...((patch && patch.requests) || {}) } };
  await db(`INSERT INTO emily_settings (key, value) VALUES ('reviews_settings', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [JSON.stringify(next)]);
  return next;
}

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS rv_reviews (
    id TEXT PRIMARY KEY, store TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'buzzin', ext_id TEXT UNIQUE,
    product_id TEXT, product_handle TEXT, product_title TEXT, product_image TEXT, variant_id TEXT, variant_title TEXT,
    rating INT NOT NULL, title TEXT, body TEXT, reviewer_name TEXT, verified BOOLEAN DEFAULT false, recommended BOOLEAN,
    email TEXT, order_name TEXT, media JSONB NOT NULL DEFAULT '[]', answers JSONB,
    status TEXT NOT NULL DEFAULT 'pending', reply TEXT, reply_by TEXT, reply_at TIMESTAMPTZ,
    helpful INT NOT NULL DEFAULT 0, unhelpful INT NOT NULL DEFAULT 0, incentivized BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), published_at TIMESTAMPTZ, decided_by TEXT, updated_at TIMESTAMPTZ DEFAULT now(), raw JSONB)`);
  await db(`CREATE INDEX IF NOT EXISTS rv_reviews_prod ON rv_reviews (store, product_id, status)`);
  await db(`CREATE INDEX IF NOT EXISTS rv_reviews_list ON rv_reviews (store, status, created_at DESC)`);
  await db(`CREATE TABLE IF NOT EXISTS rv_summaries (scope TEXT PRIMARY KEY, store TEXT, summary TEXT, topics JSONB, count INT, updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE TABLE IF NOT EXISTS rv_groups (id TEXT PRIMARY KEY, store TEXT NOT NULL, name TEXT, collection_id TEXT, product_ids TEXT[] NOT NULL DEFAULT '{}', synced_at TIMESTAMPTZ)`);
  await db(`CREATE TABLE IF NOT EXISTS rv_requests (token TEXT PRIMARY KEY, store TEXT, order_name TEXT, email TEXT, name TEXT, items JSONB, created_at TIMESTAMPTZ DEFAULT now(), used_at TIMESTAMPTZ)`);
  await db(`ALTER TABLE rv_requests ADD COLUMN IF NOT EXISTS order_id TEXT, ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS sent INT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS test BOOLEAN DEFAULT false`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS rv_requests_order ON rv_requests (store, order_id) WHERE NOT test`);
  await db(`ALTER TABLE rv_requests ADD COLUMN IF NOT EXISTS via_flow BOOLEAN NOT NULL DEFAULT false`);
  // Photo check: per photo (by position) "ok" | "hidden" (no person) | "unsure" (needs a look) | "pending" (not checked yet, new upload)
  // | "shown" / "hidden_manual" (your decision) | "err1".."err2" (check failed, retried). media_ok = photos customers can see.
  await db(`ALTER TABLE rv_reviews ADD COLUMN IF NOT EXISTS media_check JSONB NOT NULL DEFAULT '{}', ADD COLUMN IF NOT EXISTS media_why JSONB NOT NULL DEFAULT '{}'`);
  await db(`ALTER TABLE rv_reviews ADD COLUMN IF NOT EXISTS media_ok INT GENERATED ALWAYS AS (jsonb_array_length(media) - jsonb_array_length(jsonb_path_query_array(media_check, '$.* ? (@ == "hidden" || @ == "unsure" || @ == "pending" || @ == "hidden_manual")'))) STORED`);
}

/* ---------------- Okendo copy ---------------- */
const pid = (okendoProductId) => String(okendoProductId || "").replace(/^shopify-/, "") || null;
async function okFetch(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (r.ok) return r.json();
    if (r.status === 429 || r.status >= 500) { await new Promise((res) => setTimeout(res, 1500 * (i + 1))); continue; }
    throw new Error(`Okendo ${r.status} on ${url.split("?")[0]}`);
  }
  throw new Error("Okendo kept failing");
}
/** Copy every published Okendo review for a store. full=false stops at the first page that has nothing new. */
async function importOkendo(store, { full = true } = {}) {
  const S = STORES[store]; if (!S || !S.okendo) return { store, added: 0 };
  let url = `https://api.okendo.io/v1/stores/${S.okendo}/reviews?limit=100&orderBy=date%20desc`;
  let seen = 0, added = 0, updated = 0, pages = 0;
  while (url && pages < 500) {
    const j = await okFetch(url); pages++;
    let newOnPage = 0;
    for (const r of j.reviews || []) {
      seen++;
      const media = (r.media || []).map((m) => ({ type: m.type || "image", url: m.fullSizeUrl || m.largeUrl, large: m.largeUrl || m.fullSizeUrl, thumb: m.thumbnailUrl || m.largeUrl, alt: m.alt || null, stream: m.streamId || null }));
      const q = await db(`INSERT INTO rv_reviews (id, store, source, ext_id, product_id, product_handle, product_title, product_image, variant_id, variant_title, rating, title, body,
          reviewer_name, verified, recommended, media, status, helpful, unhelpful, incentivized, created_at, published_at, raw)
        VALUES ($1,$2,'okendo',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'published',$17,$18,$19,$20,$20,$21)
        ON CONFLICT (ext_id) DO UPDATE SET helpful=EXCLUDED.helpful, unhelpful=EXCLUDED.unhelpful, media=EXCLUDED.media, product_handle=COALESCE(EXCLUDED.product_handle, rv_reviews.product_handle), raw=EXCLUDED.raw, updated_at=now()
        RETURNING (xmax = 0) AS inserted`,
        [`ok_${r.reviewId}`, store, `okendo:${r.reviewId}`, pid(r.productId), r.productHandle || null, r.productName || null, r.productImageUrl || null, r.variantId ? String(r.variantId) : null, r.productVariantName || null,
          Math.max(1, Math.min(5, Number(r.rating) || 5)), r.title || null, r.body || null, (r.reviewer && r.reviewer.displayName) || null, !!(r.reviewer && r.reviewer.isVerified), r.isRecommended == null ? null : !!r.isRecommended,
          JSON.stringify(media), Number(r.helpfulCount) || 0, Number(r.unhelpfulCount) || 0, !!r.isIncentivized, r.dateCreated || new Date().toISOString(), JSON.stringify(r)]);
      if (q.rows[0] && q.rows[0].inserted) { added++; newOnPage++; } else updated++;
    }
    if (!full && !newOnPage) break;
    url = j.nextUrl ? (/^https?:/.test(j.nextUrl) ? j.nextUrl : `https://api.okendo.io/v1${j.nextUrl}`) : null;
    await new Promise((res) => setTimeout(res, 250));
  }
  return { store, seen, added, updated, pages };
}

/* ---------------- review groups (Okendo used Shopify collections named "Okendo …") ---------------- */
async function syncGroups(store) {
  const em = require("./emily"); const st = em.storeForPrefix(store === "lbo" ? "LBO" : "LB"); if (!st) return 0;
  const cols = await require("./returns").gql(st, `query { a: collections(first: 100, query: "title:Okendo*") { nodes { id title } } b: collections(first: 20, query: "title:'Sleep Bag Walkers'") { nodes { id title } } }`, {});
  const list = [...((cols.a || {}).nodes || []), ...((cols.b || {}).nodes || []).filter((c) => c.title === "Sleep Bag Walkers")];
  let n = 0;
  for (const c of list) {
    const ids = []; let after = null;
    for (let i = 0; i < 20; i++) {
      const d = await require("./returns").gql(st, `query($id: ID!, $after: String) { collection(id: $id) { products(first: 250, after: $after) { pageInfo { hasNextPage endCursor } nodes { legacyResourceId } } } }`, { id: c.id, after });
      const p = d.collection && d.collection.products; if (!p) break;
      for (const x of p.nodes) ids.push(String(x.legacyResourceId));
      if (!p.pageInfo.hasNextPage) break; after = p.pageInfo.endCursor;
    }
    await db(`INSERT INTO rv_groups (id, store, name, collection_id, product_ids, synced_at) VALUES ($1,$2,$3,$4,$5,now())
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, product_ids=EXCLUDED.product_ids, synced_at=now()`, [`${store}:${c.id}`, store, c.title.replace(/^Okendo\s+/i, ""), c.id, ids]);
    n++;
  }
  GROUP_CACHE.delete(store);
  return n;
}
const GROUP_CACHE = new Map();
/** Product ids whose reviews show on this product's page: itself plus everything in its review group(s). */
/** Which reviews a product page shows. mode: "group" = this style in every color (default), "product" = only this product,
 *  "all" = every review in the store (returns null, meaning "no product filter"). */
const SCOPES = ["group", "product", "all"];
async function scopeFor(store, productId, mode = "group") {
  if (mode === "all") return null;
  if (mode === "product") return [String(productId)];
  let g = GROUP_CACHE.get(store);
  if (!g || Date.now() - g.at > 10 * 60e3) { g = { at: Date.now(), rows: (await db(`SELECT product_ids FROM rv_groups WHERE store=$1`, [store])).rows.map((r) => r.product_ids) }; GROUP_CACHE.set(store, g); }
  const out = new Set([String(productId)]);
  for (const ids of g.rows) if (ids.includes(String(productId))) ids.forEach((x) => out.add(x));
  return [...out];
}

/* ---------------- publishing ---------------- */
/** Held reviews publish on their own after 14 days unless someone rejected them. */
async function publishHeld() {
  const r = await db(`UPDATE rv_reviews SET status='published', published_at=now(), decided_by='auto (14 days)', updated_at=now()
    WHERE status='pending' AND created_at < now() - interval '${HOLD_DAYS} days' RETURNING store, product_id`);
  if (r.rowCount) { AGG_CACHE.clear(); for (const x of r.rows) queueMetafield(x.store, x.product_id); }
  return r.rowCount;
}

/* ---------------- public data for the store ---------------- */
const AGG_CACHE = new Map();
/* ---------------- photo check: hide review photos with no baby, kid or adult in them ---------------- */
const HIDE_STATES = new Set(["hidden", "unsure", "pending", "hidden_manual"]);
let PHOTO_FILTER = true; // refreshed from settings by the photo-check loop and when settings are saved
const MEDIA_N = () => (PHOTO_FILTER ? "media_ok" : "jsonb_array_length(media)");
const photoVisible = (r, i) => !PHOTO_FILTER || !HIDE_STATES.has(((r && r.media_check) || {})[String(i)]);
function pubReview(r) {
  return { id: r.id, rating: r.rating, title: r.title, body: r.body, name: r.reviewer_name || "Customer", verified: !!r.verified, recommended: r.recommended,
    date: r.created_at, product: r.product_title, product_handle: r.product_handle, product_image: r.product_image, variant: r.variant_title,
    media: (r.media || []).map((m, i) => (photoVisible(r, i) ? { type: m.type, url: m.large || m.url, thumb: m.thumb || m.url, alt: m.alt || null } : null)).filter(Boolean),
    reply: r.reply || null, reply_at: r.reply_at || null, helpful: r.helpful || 0, unhelpful: r.unhelpful || 0, answers: r.answers || null };
}
async function aggregate(store, ids) {
  const key = ids ? `${store}:${ids.slice().sort().join(",")}` : `${store}:ALL`;
  const c = AGG_CACHE.get(key); if (c && Date.now() - c.at < 5 * 60e3) return c.v;
  const a = (await db(`SELECT count(*)::int n, COALESCE(avg(rating),0)::float avg, count(*) FILTER (WHERE recommended)::int rec, count(*) FILTER (WHERE recommended IS NOT NULL)::int recn,
      count(*) FILTER (WHERE ${MEDIA_N()}>0)::int media,
      count(*) FILTER (WHERE rating=5)::int s5, count(*) FILTER (WHERE rating=4)::int s4, count(*) FILTER (WHERE rating=3)::int s3, count(*) FILTER (WHERE rating=2)::int s2, count(*) FILTER (WHERE rating=1)::int s1
    FROM rv_reviews WHERE store=$1 AND status='published' AND ($2::text[] IS NULL OR product_id = ANY($2))`, [store, ids])).rows[0];
  const v = { count: a.n, average: Math.round(a.avg * 10) / 10, recommend_pct: a.recn ? Math.round((100 * a.rec) / a.recn) : null, with_media: a.media, histogram: { 5: a.s5, 4: a.s4, 3: a.s3, 2: a.s2, 1: a.s1 } };
  AGG_CACHE.set(key, { at: Date.now(), v });
  return v;
}
async function productReviews(store, productId, { sort = "media", rating, media, q, kind, page = 1, per = 10, scope } = {}) {
  const ids = await scopeFor(store, productId, SCOPES.includes(scope) ? scope : "group");
  const args = [store, ids]; const where = [`store=$1`, `status='published'`, `($2::text[] IS NULL OR product_id = ANY($2))`];
  if (rating && Number(rating) >= 1 && Number(rating) <= 5) { args.push(Number(rating)); where.push(`rating=$${args.length}`); }
  if (media === "1" || media === true) where.push(`${MEDIA_N()} > 0`);
  if (q && String(q).trim()) { args.push(`%${String(q).trim().slice(0, 80)}%`); where.push(`(title ILIKE $${args.length} OR body ILIKE $${args.length})`); }
  if (kind && String(kind).trim()) { args.push(String(kind).trim().slice(0, 80)); where.push(`${KIND_SQL} = $${args.length}`); }
  const order = { newest: "created_at DESC", oldest: "created_at ASC", highest: "rating DESC, created_at DESC", lowest: "rating ASC, created_at DESC", helpful: "helpful DESC, created_at DESC", media: `(${MEDIA_N()} > 0) DESC, rating DESC, created_at DESC` }[sort] || `(${MEDIA_N()} > 0) DESC, rating DESC, created_at DESC`;
  per = Math.max(1, Math.min(30, Number(per) || 10)); page = Math.max(1, Number(page) || 1);
  const rows = (await db(`SELECT * FROM rv_reviews WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${per + 1} OFFSET ${(page - 1) * per}`, args)).rows;
  const filtered = (await db(`SELECT count(*)::int n FROM rv_reviews WHERE ${where.join(" AND ")}`, args)).rows[0].n;
  let photos;
  if (page === 1) photos = (await db(`SELECT id, media, media_check FROM rv_reviews WHERE store=$1 AND status='published' AND ($2::text[] IS NULL OR product_id = ANY($2)) AND ${MEDIA_N()} > 0 ORDER BY created_at DESC LIMIT 14`, [store, ids])).rows
    .map((r) => { const m = (r.media || []).find((x, i) => x.type !== "video" && photoVisible(r, i)); return m ? { review: r.id, thumb: m.thumb || m.url, url: m.large || m.url } : null; }).filter(Boolean).slice(0, 12);
  return { summary: await aggregate(store, ids), total: filtered, reviews: rows.slice(0, per).map(pubReview), more: rows.length > per, page, photos };
}
/* ---------------- the store-wide reviews page (/pages/reviews) ---------------- */
// "Zipper Romper in Where Hedgehogs Wander" → "Zipper Romper": the kind of item, so shoppers can filter by it.
const KIND_SQL = `trim(split_part(regexp_replace(COALESCE(product_title,''), '\\s+-\\s+.*$', ''), ' in ', 1))`;
const PAGE_CACHE = new Map();
async function pageMeta(store) {
  const c = PAGE_CACHE.get(store); if (c && Date.now() - c.at < 10 * 60e3) return c.v;
  const summary = await aggregate(store, null);
  const kinds = (await db(`SELECT ${KIND_SQL} k, count(*)::int n, round(avg(rating)::numeric, 1)::float a FROM rv_reviews WHERE store=$1 AND status='published' AND product_title IS NOT NULL
      AND product_title !~* '(package|shipping|order) protection|gift card' GROUP BY 1 HAVING count(*) >= 15 ORDER BY 2 DESC LIMIT 10`, [store])).rows.filter((r) => r.k).map((r) => ({ name: r.k, count: r.n, average: r.a }));
  const rows = (await db(`SELECT id, rating, reviewer_name, product_title, product_handle, media, media_check FROM rv_reviews WHERE store=$1 AND status='published' AND ${MEDIA_N()} > 0 AND rating >= 4
      ORDER BY created_at DESC LIMIT 60`, [store])).rows;
  const photos = rows.map((r) => { const m = (r.media || []).find((x, i) => x.type !== "video" && photoVisible(r, i)); return m ? { review: r.id, thumb: m.thumb || m.url, url: m.large || m.url, name: r.reviewer_name || "Customer", product: r.product_title, handle: r.product_handle } : null; }).filter(Boolean).slice(0, 24);
  const families = (await db(`SELECT count(DISTINCT lower(COALESCE(email, reviewer_name)))::int n FROM rv_reviews WHERE store=$1 AND status='published'`, [store])).rows[0].n;
  const v = { summary, kinds, photos, families, brand: STORES[store].name };
  PAGE_CACHE.set(store, { at: Date.now(), v }); return v;
}
async function starsFor(store, productIds, mode) {
  const out = {}; mode = SCOPES.includes(mode) ? mode : "group";
  for (const id of productIds.slice(0, 80)) { const a = await aggregate(store, await scopeFor(store, id, mode)); out[id] = { average: a.average, count: a.count }; }
  return out;
}

/* ---------------- "Reviews summary" + "Customers talked about" (written by Claude from the reviews) ----------------
   One summary per review group / product, refreshed when the review count grows 10% or after 30 days. */
const SUMMARY_BUSY = new Set();
async function summaryFor(store, productId, mode) {
  const ids0 = await scopeFor(store, productId, SCOPES.includes(mode) ? mode : "group"); const ids = ids0 ? ids0.sort() : null;
  const scope = ids ? `${store}:` + crypto.createHash("md5").update(ids.join(",")).digest("hex") : `${store}:all`;
  const row = (await db(`SELECT * FROM rv_summaries WHERE scope=$1`, [scope])).rows[0];
  const n = (await aggregate(store, ids)).count;
  const stale = !row || (n >= 5 && (n > row.count * 1.1 || Date.now() - new Date(row.updated_at) > 30 * 864e5));
  if (stale && n >= 5 && !SUMMARY_BUSY.has(scope) && SUMMARY_BUSY.size < 3) { SUMMARY_BUSY.add(scope); makeSummary(store, ids, scope, n).catch((e) => console.error("review summary:", e.message)).finally(() => SUMMARY_BUSY.delete(scope)); }
  return row && row.summary ? { summary: row.summary, topics: row.topics || [] } : null;
}
async function makeSummary(store, ids, scope, n) {
  const kit = require("./emily").claimsKit(); if (!kit || !kit.anthropic) return;
  const rows = (await db(`(SELECT rating, title, body FROM rv_reviews WHERE store=$1 AND status='published' AND ($2::text[] IS NULL OR product_id = ANY($2)) ORDER BY created_at DESC LIMIT 140)
    UNION ALL (SELECT rating, title, body FROM rv_reviews WHERE store=$1 AND status='published' AND ($2::text[] IS NULL OR product_id = ANY($2)) AND rating <= 3 ORDER BY created_at DESC LIMIT 30)`, [store, ids])).rows;
  const text = rows.map((r) => `${r.rating}★ ${r.title || ""}: ${String(r.body || "").slice(0, 400)}`).join("\n");
  const resp = await kit.anthropic.messages.create({ model: kit.model, max_tokens: 500, messages: [{ role: "user", content:
    `These are customer reviews of a baby/kids clothing product line. Write a short, honest summary for shoppers (2-3 sentences, plain words, starts with "Customers say"), including the most common complaint if there is a real one. Then list 3 to 6 topics customers talk about most, each 1-2 words (e.g. Softness, Fit, Print, Quality, Zipper, Sizing).\nAnswer ONLY as JSON: {"summary": "...", "topics": ["..."]}\n\nReviews:\n${text}` }] });
  const out = (resp.content || []).map((c) => c.text || "").join("");
  const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
  if (!j.summary) return;
  await db(`INSERT INTO rv_summaries (scope, store, summary, topics, count, updated_at) VALUES ($1,$2,$3,$4,$5,now()) ON CONFLICT (scope) DO UPDATE SET summary=EXCLUDED.summary, topics=EXCLUDED.topics, count=EXCLUDED.count, updated_at=now()`,
    [scope, store, String(j.summary).slice(0, 900), JSON.stringify((j.topics || []).slice(0, 6).map((t) => String(t).slice(0, 24))), n]);
}

/* ---------------- Shopify product metafields (reviews.rating / reviews.rating_count) ----------------
   Themes and Google read these. Okendo keeps them filled today; once Buzzin is live it takes over. */
const MF_QUEUE = new Set();
function queueMetafield(store, productId) { if (productId) MF_QUEUE.add(`${store}:${productId}`); }
async function flushMetafields() {
  const s = await settings();
  const items = [...MF_QUEUE]; MF_QUEUE.clear();
  const em = require("./emily");
  for (const it of items) {
    const [store, id] = it.split(":"); if (!s.live[store]) continue;
    try {
      const st = em.storeForPrefix(store === "lbo" ? "LBO" : "LB"); if (!st) continue;
      const a = await aggregate(store, await scopeFor(store, id)); if (!a.count) continue;
      await require("./returns").gql(st, `mutation($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { message } } }`, { m: [
        { ownerId: `gid://shopify/Product/${id}`, namespace: "reviews", key: "rating", type: "rating", value: JSON.stringify({ value: String(a.average), scale_min: "1.0", scale_max: "5.0" }) },
        { ownerId: `gid://shopify/Product/${id}`, namespace: "reviews", key: "rating_count", type: "number_integer", value: String(a.count) }] });
    } catch (e) { console.error("review metafield:", e.message); }
  }
}

/* ---------------- new reviews ---------------- */
const escH = (x) => String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (s, n) => String(s == null ? "" : s).replace(/\s+\n/g, "\n").trim().slice(0, n);
async function submit(store, b, { via = "site" } = {}) {
  if (!STORES[store]) throw Object.assign(new Error("unknown store"), { status: 404 });
  const rating = Math.round(Number(b.rating)); if (!(rating >= 1 && rating <= 5)) throw Object.assign(new Error("Pick a star rating."), { status: 400 });
  const body = clean(b.body, 5000), title = clean(b.title, 150), name = clean(b.name, 60);
  if (body.length < 3) throw Object.assign(new Error("Tell us a little about it."), { status: 400 });
  if (!name) throw Object.assign(new Error("Add your name."), { status: 400 });
  const email = clean(b.email, 200).toLowerCase();
  if (via === "site" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw Object.assign(new Error("Add your email."), { status: 400 });
  let reqRow = null, verified = false, orderName = null;
  if (b.token) {
    reqRow = (await db(`SELECT * FROM rv_requests WHERE token=$1`, [String(b.token)])).rows[0];
    if (reqRow) { verified = (reqRow.items || []).some((i) => String(i.product_id) === String(b.product_id)); orderName = reqRow.order_name; }
  }
  if (!verified && email) {   // bought it? (any order in Buzzin's synced order events for that email + product)
    try { const v = (await db(`SELECT 1 FROM mk_events e JOIN mk_profiles p ON p.id=e.profile_id WHERE lower(p.email)=$1 AND e.type='placed_order' AND e.props::text LIKE $2 LIMIT 1`, [email, `%${String(b.product_id)}%`])).rows[0]; verified = !!v; } catch (_) {}
  }
  const media = (Array.isArray(b.media) ? b.media : []).slice(0, 6).filter((m) => m && /^https:\/\//.test(m.url || "")).map((m) => ({ type: "image", url: m.url, large: m.url, thumb: m.url }));
  const s = await settings();
  const status = rating >= s.auto_publish_min ? "published" : "pending";
  const id = "rv_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const answers = b.answers && typeof b.answers === "object" ? Object.fromEntries(Object.entries(b.answers).slice(0, 10).map(([k, v]) => [clean(k, 80), clean(v, 80)])) : null;
  await db(`INSERT INTO rv_reviews (id, store, source, product_id, product_handle, product_title, product_image, variant_title, rating, title, body, reviewer_name, verified, recommended, email, order_name, media, answers, status, published_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [id, store, via === "email" ? "request" : "site", String(b.product_id || "") || null, clean(b.product_handle, 200) || null, clean(b.product_title, 200) || null, clean(b.product_image, 600) || null, clean(b.variant, 120) || null,
      rating, title || null, body, name, verified, b.recommended == null ? (rating >= 4) : !!b.recommended, email || null, orderName, JSON.stringify(media), answers ? JSON.stringify(answers) : null, status, status === "published" ? new Date() : null]);
  if (media.length && s.photo_filter !== false) await db(`UPDATE rv_reviews SET media_check=$2 WHERE id=$1`, [id, JSON.stringify(Object.fromEntries(media.map((_, i) => [String(i), "pending"])))]);
  if (reqRow) await db(`UPDATE rv_requests SET used_at=COALESCE(used_at, now()) WHERE token=$1`, [reqRow.token]);
  if (status === "published") { AGG_CACHE.clear(); queueMetafield(store, b.product_id); }
  if (email) { try { await require("./mk-core").upsertProfile(store, { email, first_name: String(name || "").split(" ")[0] || null }, "reviews"); } catch (_) {} }
  if (email) { try { await require("./mk-core").track(store, "left_review", { email, props: { rating, product_id: String(b.product_id || ""), product: clean(b.product_title, 200), review_id: id, media: media.length, order: orderName || null }, source: "reviews" }); } catch (_) {} }
  if (rating <= 2) core.slackPost && core.slackPost(`⭐ ${rating}-star review on ${STORES[store].name}: ${clean(b.product_title, 120)} — “${title || body.slice(0, 120)}” (${name}). Open Buzzin → Reviews.`).catch(() => {});
  return { ok: true, id, status };
}

/* ---------------- review request emails (Okendo's "Review Request With Two Reminders") ----------------
   14 days after an order ships, email "How did your little one like it?" with each item and a row of stars. Tapping a
   star opens the review page with that rating picked. Reminders 7 and 14 days later if nothing was reviewed.
   Goes to every buyer except people who unsubscribed or bounced. Off per store until Okendo's sequence is paused. */
const STAR_PATH = "M12 2.6l2.9 6.2 6.7.7-5 4.6 1.4 6.7L12 17.4l-6 3.4 1.4-6.7-5-4.6 6.7-.7z";
const writeBase = (store) => { try { const d = require("./returns").STORE_DEFS[store]; if (d && d.host) return `https://${d.host}`; } catch (_) {} return PUBLIC_URL(); };
// Never asked for reviews: Package Protection (PP) and other non-products. Matched on the name and on the product's handle.
const SKIP_ITEM = /package protection|shipping protection|order protection|\bPP\b|gift card|route|insurance/i;
const SKIP_HANDLE = /protection|insurance|gift-card|^route/i;
const skipItem = (it) => !!it && (SKIP_ITEM.test(it.title || it.product_title || "") || SKIP_HANDLE.test(it.handle || ""));

/* ---- review links for marketing emails and texts (the Review request block, {{ review_url }}) ---- */
function reviewItems(items) {
  const seen = new Set(), out = [];
  for (const it of items || []) {
    const pid = String((it && (it.product_id || (it.product && it.product.id))) || "").replace(/\D/g, "");
    if (!pid || seen.has(pid) || skipItem(it)) continue; seen.add(pid);
    out.push({ product_id: pid, title: it.title || it.product_title || "", variant: it.variant || it.variant_title || null, image: it.image || it.image_url || null, handle: it.handle || null });
  }
  return out.slice(0, 8);
}
/** One review page per order: reuse its token, or make one. `test` rows never count as real requests. */
async function tokenForOrder(store, { order_id, order_name, email, name, items, test }) {
  const key = String(order_id || order_name || "").slice(0, 80); if (!key || !email) return null;
  const its = reviewItems(items); if (!its.length) return null;
  const em = String(email).toLowerCase();
  const old = (await db(`SELECT token FROM rv_requests WHERE store=$1 AND (order_id=$2 OR order_name=$3) AND test=$4 AND lower(email)=$5 ORDER BY created_at LIMIT 1`, [store, key, order_name || key, !!test, em])).rows[0];
  if (old) return old.token;
  const token = crypto.randomBytes(12).toString("hex");
  await db(`INSERT INTO rv_requests (token, store, order_id, order_name, email, name, items, fulfilled_at, test, sent, last_sent_at, via_flow) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),$8,1,now(),true) ON CONFLICT DO NOTHING`,
    [token, store, test ? `test-${key}-${Date.now()}` : key, order_name || null, em, name || null, JSON.stringify(its), !!test]);
  return (await db(`SELECT token FROM rv_requests WHERE token=$1`, [token])).rows[0] ? token : null;
}
/** What an email or text needs to ask for reviews: review_url (the order's review page) and review_items (each product with 5 star links).
 *  `order` comes from the flow's trigger (an order or shipment). Previews and tests use the person's (or the store's) latest order. */
async function reviewContext(store, profile, order, { test = false, preview = false } = {}) {
  if (!STORES[store]) return {};
  let o = order && Array.isArray(order.items) && order.items.length ? order : null;
  if (!o) {
    const q = `SELECT props FROM mk_events WHERE store=$1 AND type IN ('fulfilled_order','placed_order') AND jsonb_array_length(COALESCE(props->'items','[]'::jsonb)) > 0`;
    let r = profile && profile.id ? (await db(`${q} AND profile_id=$2 ORDER BY at DESC LIMIT 1`, [store, profile.id]).catch(() => ({ rows: [] }))).rows[0] : null;
    if (r) { o = { ...(r.props || {}) }; }   // their own latest order: a real request
    else r = (await db(`${q} ORDER BY at DESC LIMIT 1`, [store]).catch(() => ({ rows: [] }))).rows[0];
    if (!r) { const x = (await db(`SELECT product_id, max(product_title) title, max(product_image) image, max(product_handle) handle FROM rv_reviews WHERE store=$1 AND status='published' GROUP BY product_id ORDER BY count(*) DESC LIMIT 6`, [store])).rows.filter((y) => !skipItem(y)).slice(0, 2); r = { props: { name: "#1001", items: x.map((y) => ({ product_id: y.product_id, title: y.title, image: y.image })) } }; }
    if (!o) { o = { ...(r.props || {}), sample: true }; test = true; }
  }
  const items = reviewItems(o.items); if (!items.length) return { review_items: [], review_url: STORES[store].shop };
  let token = null;
  if (!preview && profile && profile.email) token = await tokenForOrder(store, { order_id: o.order_id, order_name: o.name, email: profile.email, name: [profile.first_name, profile.last_name].filter(Boolean).join(" "), items: o.items, test }).catch(() => null);
  const base = `${writeBase(store)}/rv/${store}/write?t=${token || "preview"}`;
  return {
    review_url: base,
    review_items: items.map((it) => {
      const u = `${base}&p=${it.product_id}`;
      return { ...it, url: u, review_url: u, product_url: it.handle ? `${STORES[store].shop}/products/${it.handle}` : STORES[store].shop, star_urls: [1, 2, 3, 4, 5].map((n) => `${u}&r=${n}`), rate_1: `${u}&r=1`, rate_2: `${u}&r=2`, rate_3: `${u}&r=3`, rate_4: `${u}&r=4`, rate_5: `${u}&r=5` };
    }),
    review_first_product: items[0].title,
  };
}
async function collectOrders(store, s) {
  const em = require("./emily"); const st = em.storeForPrefix(store === "lbo" ? "LBO" : "LB"); if (!st) return [];
  const from = new Date(Date.now() - (s.wait_days + 25) * 864e5).toISOString().slice(0, 10), to = new Date(Date.now() - (s.wait_days - 1) * 864e5).toISOString().slice(0, 10);
  const out = []; let after = null;
  for (let i = 0; i < 40; i++) {
    const d = await require("./returns").gql(st, `query($q: String!, $after: String) { orders(first: 100, after: $after, query: $q, sortKey: CREATED_AT) { pageInfo { hasNextPage endCursor }
      nodes { id legacyResourceId name email cancelledAt displayFinancialStatus customer { firstName lastName } shippingAddress { firstName lastName }
        fulfillments(first: 5) { createdAt deliveredAt status }
        lineItems(first: 30) { nodes { title variantTitle quantity product { legacyResourceId handle featuredMedia { preview { image { url(transform: { maxWidth: 240 }) } } } } } } } } }`,
      { q: `fulfillment_status:shipped created_at:>=${from} created_at:<=${to}`, after });
    for (const o of d.orders.nodes) out.push(o);
    if (!d.orders.pageInfo.hasNextPage) break; after = d.orders.pageInfo.endCursor;
  }
  return out;
}
function requestEmail(store, b, req, round, unsub, prefs) {
  const S = STORES[store]; const base = writeBase(store);
  const first = String(req.name || "").split(" ")[0] || "there";
  const starRow = (it) => [1, 2, 3, 4, 5].map((n) => `<a href="${base}/rv/${store}/write?t=${req.token}&amp;p=${it.product_id}&amp;r=${n}" style="text-decoration:none;display:inline-block;padding:0 3px"><img src="${PUBLIC_URL()}/rv-star.png" width="30" height="30" alt="${n} star${n > 1 ? "s" : ""}" style="display:block;border:0"></a>`).join("");
  const items = req.items.map((it) => `<tr><td style="padding:18px 0;border-top:1px solid #ECEAE5"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td width="96" valign="top">${it.image ? `<img src="${it.image}" width="84" height="84" alt="" style="display:block;border-radius:8px;object-fit:cover">` : ""}</td>
      <td valign="top" style="font-family:${b.fonts.body};color:${b.colors.text}"><div style="font-size:16px;font-weight:bold;line-height:1.3">${escH(it.title)}</div>${it.variant ? `<div style="font-size:13px;color:${b.colors.muted}">${escH(it.variant)}</div>` : ""}
        <div style="font-size:13px;color:${b.colors.muted};margin:10px 0 6px">How many stars?</div><div>${starRow(it)}</div></td></tr></table></td></tr>`).join("");
  const lead = round === 1 ? "We wanted to check in and see how you're enjoying your latest purchase." : "Just a quick reminder: we'd love to hear what you think of your order.";
  const html = `<!doctype html><html><body style="margin:0;background:${b.colors.ground}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${b.colors.ground}"><tr><td align="center" style="padding:28px 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px">
    <tr><td align="center" style="padding:28px 32px 6px"><img src="${b.logo && b.logo.startsWith("/") ? PUBLIC_URL() + b.logo : b.logo}" width="${b.logo_width || 64}" alt="${escH(S.name)}" style="display:block"></td></tr>
    <tr><td style="padding:10px 32px 4px;font-family:${b.fonts.heading};font-size:24px;color:${b.colors.text}">Hi ${escH(first)}!</td></tr>
    <tr><td style="padding:6px 32px 0;font-family:${b.fonts.body};font-size:15px;line-height:1.55;color:${b.colors.text}">${lead} If you have a moment, it would be great if you could share your thoughts with us and fellow parents.<br><br><b>Get started below by giving your products a star rating.</b></td></tr>
    <tr><td style="padding:14px 32px 26px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table></td></tr></table>
    <table role="presentation" width="100%" style="max-width:560px"><tr><td style="padding:18px 12px;text-align:center;font-family:${b.fonts.body};font-size:12px;line-height:1.6;color:${b.colors.muted}">${escH(b.name)}${b.address ? " · " + escH(b.address) : ""}<br>
    <a href="${unsub}" style="color:${b.colors.muted}">Unsubscribe</a> · <a href="${prefs}" style="color:${b.colors.muted}">Email preferences</a></td></tr></table></td></tr></table></body></html>`;
  const text = `Hi ${first}!\n\n${lead}\n\n` + req.items.map((it) => `${it.title}${it.variant ? ` (${it.variant})` : ""}: ${base}/rv/${store}/write?t=${req.token}&p=${it.product_id}`).join("\n") + `\n\nUnsubscribe: ${unsub}`;
  return { subject: round === 1 ? "How did your little one like it?" : "Quick favor: how's your order?", html, text };
}
async function sendRequest(store, req, round, { test = false, to } = {}) {
  const MK = require("./mk-core"), E = require("./mk-email");
  const profile = await MK.upsertProfile(store, { email: to || req.email, first_name: String(req.name || "").split(" ")[0] || null }, "reviews");
  if (!profile) return { status: "skipped", reason: "no email" };
  if (!test && ["unsubscribed", "stopped"].includes(profile.email_consent)) return { status: "skipped", reason: `email ${profile.email_consent}` };
  const b = await E.brand(store); const tok = E.tokenFor(profile.id, store); const base = writeBase(store);
  const msg = requestEmail(store, b, req, round, `${base}/mk/u/${tok}`, `${base}/mk/p/${tok}`);
  msg.unsubscribe_url = `${base}/mk/u/${tok}`; msg.campaign_name = "Review request";
  return require("./mk-send").send({ store, channel: "email", profile, msg, idem: `rvreq:${req.token}:${round}${test ? ":" + Date.now() : ""}`, messageId: "review_request", test, transactional: true });
}
async function runRequests() {
  const s = await settings(); const out = {};
  for (const store of Object.keys(STORES)) {
    if (!s.requests[store]) continue;
    let made = 0, sent = 0, reminded = 0;
    // 1) new orders that shipped wait_days ago
    for (const o of await collectOrders(store, s)) {
      if (o.cancelledAt || !o.email || /REFUNDED|VOIDED/.test(o.displayFinancialStatus || "")) continue;
      const shipped = (o.fulfillments || []).map((f) => f.createdAt).filter(Boolean).sort()[0]; if (!shipped) continue;
      if (Date.now() - new Date(shipped) < s.wait_days * 864e5) continue;
      const seen = new Set(); const items = [];
      for (const li of o.lineItems.nodes) { if (!li.product || skipItem({ title: li.title, handle: li.product.handle }) || seen.has(li.product.legacyResourceId)) continue; seen.add(li.product.legacyResourceId);
        items.push({ product_id: String(li.product.legacyResourceId), handle: li.product.handle, title: li.title, variant: li.variantTitle, image: li.product.featuredMedia && li.product.featuredMedia.preview && li.product.featuredMedia.preview.image ? li.product.featuredMedia.preview.image.url : null }); }
      if (!items.length) continue;
      const name = [o.customer && o.customer.firstName || (o.shippingAddress && o.shippingAddress.firstName), (o.customer && o.customer.lastName || (o.shippingAddress && o.shippingAddress.lastName) || "").slice(0, 1)].filter(Boolean).join(" ") + ((o.customer && o.customer.lastName) ? "." : "");
      if ((await db(`SELECT 1 FROM rv_requests WHERE store=$1 AND order_name=$2 AND NOT test LIMIT 1`, [store, o.name])).rows[0]) continue;   // a marketing flow already asked
      const r = await db(`INSERT INTO rv_requests (token, store, order_id, order_name, email, name, items, fulfilled_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING token`,
        [crypto.randomBytes(12).toString("hex"), store, String(o.legacyResourceId), o.name, String(o.email).toLowerCase(), name, JSON.stringify(items.slice(0, 8)), shipped]);
      if (r.rowCount) made++;
    }
    // 2) send what's due: first email, then reminders every reminder_days while nothing was reviewed
    const due = (await db(`SELECT * FROM rv_requests WHERE store=$1 AND NOT test AND NOT via_flow AND used_at IS NULL AND sent <= $2
        AND (last_sent_at IS NULL OR last_sent_at < now() - ($3 || ' days')::interval) AND created_at > now() - interval '60 days' ORDER BY created_at LIMIT 400`, [store, s.reminders, String(s.reminder_days)])).rows;
    for (const q of due) {
      const reviewed = (await db(`SELECT 1 FROM rv_reviews WHERE lower(email)=$1 AND product_id = ANY($2) AND created_at > $3 LIMIT 1`, [q.email, q.items.map((i) => i.product_id), q.created_at])).rows[0];
      if (reviewed) { await db(`UPDATE rv_requests SET used_at=now() WHERE token=$1`, [q.token]); continue; }
      const r = await sendRequest(store, q, q.sent + 1);
      if (r && r.status === "deferred") break;   // sending limit: try the rest next run
      await db(`UPDATE rv_requests SET sent=sent+1, last_sent_at=now() WHERE token=$1`, [q.token]);
      if (r && r.status === "sent") { if (q.sent === 0) sent++; else reminded++; }
    }
    out[store] = { new_orders: made, first_emails: sent, reminders: reminded };
  }
  if (Object.keys(out).length) console.log(`⭐ REVIEW REQUESTS ${JSON.stringify(out)}`);
  return out;
}
/** Staff test: a real request for the newest shipped order, sent to the person clicking. */
async function testRequest(store, to) {
  const s = await settings(); const orders = await collectOrders(store, { ...s, wait_days: 1 });
  const o = orders.reverse().find((x) => x.email && !x.cancelledAt && x.lineItems.nodes.some((li) => li.product && !skipItem({ title: li.title, handle: li.product.handle })));
  if (!o) throw new Error("no recent shipped order found to use as the example");
  const items = []; const seen = new Set();
  for (const li of o.lineItems.nodes) { if (!li.product || skipItem({ title: li.title, handle: li.product.handle }) || seen.has(li.product.legacyResourceId)) continue; seen.add(li.product.legacyResourceId); items.push({ product_id: String(li.product.legacyResourceId), handle: li.product.handle, title: li.title, variant: li.variantTitle, image: li.product.featuredMedia && li.product.featuredMedia.preview && li.product.featuredMedia.preview.image ? li.product.featuredMedia.preview.image.url : null }); }
  const token = crypto.randomBytes(12).toString("hex");
  await db(`INSERT INTO rv_requests (token, store, order_id, order_name, email, name, items, test) VALUES ($1,$2,$3,$4,$5,$6,$7,true)`, [token, store, `test-${Date.now()}`, o.name, to, "Test", JSON.stringify(items.slice(0, 8))]);
  const r = await sendRequest(store, { token, items: items.slice(0, 8), name: "Test", email: to }, 1, { test: true, to });
  return { ok: r && r.status === "sent", status: r && r.status, reason: r && r.reason, order: o.name };
}
/** The review page a request email opens (on the store's own domain). */
async function writePage(store, token, focus, rating) {
  const q = (await db(`SELECT * FROM rv_requests WHERE token=$1 AND store=$2`, [token, store])).rows[0];
  if (!q) return null;
  const b = await require("./mk-email").brand(store);
  const done = (await db(`SELECT product_id FROM rv_reviews WHERE lower(email)=$1 AND product_id = ANY($2)`, [q.email, q.items.map((i) => i.product_id)])).rows.map((r) => r.product_id);
  const cfg = { store, token, origin: PUBLIC_URL(), name: q.name || "", email: q.email, focus: String(focus || ""), rating: Number(rating) || 0, done, items: q.items, brand: STORES[store].name, shop: STORES[store].shop };
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Review your order · ${escH(STORES[store].name)}</title>
<style>body{margin:0;background:${b.colors.ground};font-family:${b.fonts.body};color:#2C3E50}main{max-width:620px;margin:0 auto;padding:24px 16px 60px}h1{font-family:${b.fonts.heading};font-weight:normal;font-size:26px;margin:14px 0 4px}
.it{background:#fff;border-radius:12px;padding:18px;margin-top:16px;box-shadow:0 1px 2px rgba(0,0,0,.05)}.hd{display:flex;gap:14px;align-items:center}.hd img{width:72px;height:72px;object-fit:cover;border-radius:8px}.hd b{font-size:16px;display:block}
.pick{display:flex;gap:6px;margin:14px 0 4px}.pick button{border:0;background:none;padding:0;cursor:pointer}label{display:block;font-size:13px;font-weight:600;margin:12px 0 5px}
input[type=text],textarea{width:100%;box-sizing:border-box;border:1px solid #DBDDE4;border-radius:8px;padding:10px 12px;font:inherit;font-size:15px}textarea{min-height:110px}
.btn{background:#242F3F;color:#fff;border:0;border-radius:22px;padding:11px 22px;font:inherit;font-weight:600;cursor:pointer;margin-top:14px}.btn[disabled]{opacity:.6}.err{color:#b42318;font-size:13px;margin-top:8px}.ok{color:#1d7a46;font-weight:600;margin-top:10px}
.thumbs{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.thumbs img{width:56px;height:56px;object-fit:cover;border-radius:6px}.form{display:none}.it.open .form{display:block}.yn{display:flex;gap:8px}.yn button{border:1px solid #DBDDE4;background:#fff;border-radius:18px;padding:6px 14px;font:inherit;cursor:pointer}.yn button.on{background:#242F3F;color:#fff;border-color:#242F3F}</style></head>
<body><main><img src="${b.logo && b.logo.startsWith("/") ? PUBLIC_URL() + b.logo : b.logo}" width="${b.logo_width || 56}" alt="${escH(STORES[store].name)}"><h1>How did your little one like it?</h1><div style="color:#676986">Order ${escH(q.order_name || "")}. Tap the stars for each item.</div><div id="items"></div></main>
<script>window.RVW=${JSON.stringify(cfg).replace(/</g, "\\u003c")};</script><script src="${PUBLIC_URL()}/rv-write.js"></script></body></html>`;
}

/* ---------------- staff ---------------- */
function listWhere({ store, status, rating, q, source, sentiment, product, days, media, replied }) {
  const args = [], where = [];
  if (store) { args.push(store); where.push(`store=$${args.length}`); }
  if (status && status !== "all") { args.push(status); where.push(`status=$${args.length}`); }
  if (rating) { const rs = String(rating).split(",").map(Number).filter((x) => x >= 1 && x <= 5); if (rs.length) { args.push(rs); where.push(`rating = ANY($${args.length})`); } }
  if (sentiment === "positive") where.push(`rating >= 4`); else if (sentiment === "neutral") where.push(`rating = 3`); else if (sentiment === "negative") where.push(`rating <= 2`);
  if (source) { args.push(source === "imported" ? "okendo" : source); where.push(`source=$${args.length}`); }
  if (product) { args.push(String(product)); where.push(`product_id=$${args.length}`); }
  if (days && Number(days) > 0) { args.push(String(Number(days))); where.push(`created_at > now() - ($${args.length} || ' days')::interval`); }
  if (replied === "no") where.push(`reply IS NULL`); else if (replied === "yes") where.push(`reply IS NOT NULL`);
  if (media === "1") where.push(`jsonb_array_length(media) > 0`); else if (media === "0") where.push(`jsonb_array_length(media) = 0`);
  else if (media === "check") where.push(`jsonb_path_exists(media_check, '$.* ? (@ == "unsure")')`);
  else if (media === "hidden") where.push(`jsonb_path_exists(media_check, '$.* ? (@ == "hidden" || @ == "hidden_manual")')`);
  if (q) { args.push(`%${String(q).slice(0, 80)}%`); where.push(`(title ILIKE $${args.length} OR body ILIKE $${args.length} OR reviewer_name ILIKE $${args.length} OR email ILIKE $${args.length} OR product_title ILIKE $${args.length} OR order_name ILIKE $${args.length})`); }
  return { args, w: where.length ? `WHERE ${where.join(" AND ")}` : "" };
}
async function list(f) {
  const { args, w } = listWhere(f);
  const per = Math.min(100, Number(f.per) || 25), page = Math.max(1, Number(f.page) || 1);
  const order = { oldest: "created_at ASC", highest: "rating DESC, created_at DESC", lowest: "rating ASC, created_at DESC", helpful: "helpful DESC, created_at DESC" }[f.sort] || "created_at DESC";
  const rows = (await db(`SELECT id, store, source, product_id, product_handle, product_title, product_image, variant_title, rating, title, body, reviewer_name, verified, recommended, email, order_name, media, media_check, media_why, answers, status, reply, reply_by, reply_at, helpful, unhelpful, created_at, published_at, decided_by , (SELECT p.id FROM mk_profiles p WHERE p.store=rv_reviews.store AND lower(p.email)=lower(rv_reviews.email) LIMIT 1) profile_id FROM rv_reviews ${w} ORDER BY ${order} LIMIT ${per + 1} OFFSET ${(page - 1) * per}`, args)).rows;
  const total = (await db(`SELECT count(*)::int n FROM rv_reviews ${w}`, args)).rows[0].n;
  const counts = (await db(`SELECT store, status, count(*)::int n, avg(rating)::float avg FROM rv_reviews GROUP BY store, status`)).rows;
  return { reviews: rows.slice(0, per), more: rows.length > per, page, total, counts };
}
async function bulk(ids, action, who) {
  let n = 0; for (const id of (ids || []).slice(0, 500)) { try { await decide(String(id), action, who); n++; } catch (_) {} } return { ok: true, done: n };
}
async function products({ store, q, sort, page = 1 }) {
  const args = [], where = [`status='published'`];
  if (store) { args.push(store); where.push(`store=$${args.length}`); }
  if (q) { args.push(`%${String(q).slice(0, 80)}%`); where.push(`product_title ILIKE $${args.length}`); }
  const order = { count: "n DESC", rating: "avg DESC, n DESC", lowest: "avg ASC, n DESC", recent: "last DESC" }[sort] || "n DESC";
  const per = 50; page = Math.max(1, Number(page) || 1);
  const rows = (await db(`SELECT store, product_id, max(product_title) title, max(product_image) image, max(product_handle) handle, count(*)::int n, round(avg(rating)::numeric, 2)::float avg,
      count(*) FILTER (WHERE jsonb_array_length(media)>0)::int media, count(*) FILTER (WHERE rating<=2)::int low, max(created_at) last
    FROM rv_reviews WHERE ${where.join(" AND ")} AND product_id IS NOT NULL GROUP BY store, product_id ORDER BY ${order} LIMIT ${per + 1} OFFSET ${(page - 1) * per}`, args)).rows;
  const pend = (await db(`SELECT store, product_id, count(*)::int n FROM rv_reviews WHERE status='pending' GROUP BY store, product_id`)).rows;
  const pm = new Map(pend.map((r) => [`${r.store}:${r.product_id}`, r.n]));
  return { products: rows.slice(0, per).map((r) => ({ ...r, pending: pm.get(`${r.store}:${r.product_id}`) || 0 })), more: rows.length > per, page };
}
async function insights({ store, days = 90 }) {
  const a = [store || null]; const sw = `($1::text IS NULL OR store=$1)`;
  const d = Math.max(7, Math.min(730, Number(days) || 90));
  const k = (await db(`SELECT count(*) FILTER (WHERE status='published')::int published, round(avg(rating) FILTER (WHERE status='published')::numeric, 2)::float avg,
      count(*) FILTER (WHERE status='pending')::int pending, count(*) FILTER (WHERE status='rejected')::int rejected,
      count(*) FILTER (WHERE created_at > now() - interval '${d} days')::int recent, round(avg(rating) FILTER (WHERE created_at > now() - interval '${d} days')::numeric, 2)::float recent_avg,
      count(*) FILTER (WHERE created_at > now() - interval '${2 * d} days' AND created_at <= now() - interval '${d} days')::int prev,
      count(*) FILTER (WHERE status='published' AND jsonb_array_length(media)>0)::int media, count(*) FILTER (WHERE status='published' AND verified)::int verified,
      count(*) FILTER (WHERE reply IS NOT NULL)::int replied, count(*) FILTER (WHERE recommended)::int rec, count(*) FILTER (WHERE recommended IS NOT NULL)::int recn
    FROM rv_reviews WHERE ${sw}`, a)).rows[0];
  const months = (await db(`SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') m, count(*)::int n, round(avg(rating)::numeric, 2)::float avg FROM rv_reviews WHERE ${sw} AND created_at > now() - interval '12 months' GROUP BY 1 ORDER BY 1`, a)).rows;
  const dist = (await db(`SELECT rating, count(*)::int n FROM rv_reviews WHERE ${sw} AND status='published' GROUP BY rating`, a)).rows;
  const sources = (await db(`SELECT source, count(*)::int n FROM rv_reviews WHERE ${sw} AND created_at > now() - interval '${d} days' GROUP BY source`, a)).rows;
  const top = (await db(`SELECT store, product_id, max(product_title) title, max(product_image) image, count(*)::int n, round(avg(rating)::numeric,2)::float avg FROM rv_reviews WHERE ${sw} AND status='published' AND created_at > now() - interval '${d} days' AND product_id IS NOT NULL GROUP BY store, product_id HAVING count(*) >= 2 ORDER BY count(*) DESC LIMIT 8`, a)).rows;
  const low = (await db(`SELECT store, product_id, max(product_title) title, max(product_image) image, count(*)::int n, round(avg(rating)::numeric,2)::float avg, count(*) FILTER (WHERE rating<=2)::int lown FROM rv_reviews WHERE ${sw} AND status IN ('published','pending') AND product_id IS NOT NULL GROUP BY store, product_id HAVING count(*) FILTER (WHERE rating<=2) > 0 ORDER BY count(*) FILTER (WHERE rating<=2) DESC, avg ASC LIMIT 8`, a)).rows;
  const req = (await db(`SELECT count(*)::int orders, count(*) FILTER (WHERE sent>0)::int emailed, count(*) FILTER (WHERE used_at IS NOT NULL)::int reviewed, COALESCE(sum(sent),0)::int emails FROM rv_requests WHERE NOT test AND ($1::text IS NULL OR store=$1) AND created_at > now() - interval '${d} days'`, a)).rows[0];
  return { days: d, kpis: { ...k, recommend_pct: k.recn ? Math.round((100 * k.rec) / k.recn) : null }, months, distribution: dist, sources, top, low, requests: req };
}
/** The Reviews landing page: what needs doing, what just came in, and the headline numbers. */
async function overview({ store }) {
  const a = [store || null]; const sw = `($1::text IS NULL OR store=$1)`;
  const set = await settings();
  const k = (await db(`SELECT count(*) FILTER (WHERE status='published')::int published, round(avg(rating) FILTER (WHERE status='published')::numeric, 2)::float avg,
      count(*) FILTER (WHERE status='pending')::int pending,
      count(*) FILTER (WHERE status='pending' AND created_at < now() - interval '${HOLD_DAYS - 3} days')::int pending_soon,
      count(*) FILTER (WHERE created_at > now() - interval '7 days')::int week, count(*) FILTER (WHERE created_at > now() - interval '14 days' AND created_at <= now() - interval '7 days')::int prev_week,
      round(avg(rating) FILTER (WHERE created_at > now() - interval '30 days')::numeric, 2)::float avg30, count(*) FILTER (WHERE created_at > now() - interval '30 days')::int n30,
      count(*) FILTER (WHERE rating<=2 AND status<>'rejected' AND reply IS NULL AND created_at > now() - interval '60 days')::int low_unreplied,
      count(*) FILTER (WHERE rating=3 AND status<>'rejected' AND reply IS NULL AND created_at > now() - interval '30 days')::int mid_unreplied,
      count(*) FILTER (WHERE status='published' AND jsonb_array_length(media)>0 AND created_at > now() - interval '7 days')::int photos_week
    FROM rv_reviews WHERE ${sw}`, a)).rows[0];
  const recent = (await db(`SELECT id, store, source, product_id, product_title, product_image, rating, title, body, reviewer_name, verified, status, reply, media, created_at FROM rv_reviews
    WHERE ${sw} AND source <> 'okendo' ORDER BY created_at DESC LIMIT 12`, a)).rows;
  const recentAll = recent.length >= 4 ? recent : (await db(`SELECT id, store, source, product_id, product_title, product_image, rating, title, body, reviewer_name, verified, status, reply, media, created_at FROM rv_reviews
    WHERE ${sw} ORDER BY created_at DESC LIMIT 12`, a)).rows;
  const dropping = (await db(`SELECT store, product_id, max(product_title) title, max(product_image) image, count(*)::int n, round(avg(rating)::numeric,2)::float avg FROM rv_reviews
    WHERE ${sw} AND status IN ('published','pending') AND created_at > now() - interval '60 days' AND product_id IS NOT NULL GROUP BY store, product_id HAVING count(*) >= 3 AND avg(rating) < 4 ORDER BY avg(rating) LIMIT 5`, a)).rows;
  const req = (await db(`SELECT count(*) FILTER (WHERE sent>0 AND last_sent_at > now() - interval '7 days')::int sent_week, count(*) FILTER (WHERE used_at > now() - interval '7 days')::int used_week FROM rv_requests WHERE NOT test AND ${sw}`, a).catch(() => ({ rows: [{}] }))).rows[0];
  const g = (await db(`SELECT max(synced_at) last FROM rv_groups WHERE ${sw}`, a)).rows[0];
  const d = await designs(); const flows = await reviewFlows(store);
  const stores = store ? [store] : Object.keys(STORES);
  const todo = [];
  if (k.pending) todo.push({ key: "pending", level: k.pending_soon ? "high" : "mid", n: k.pending, title: `Approve or reject ${k.pending} waiting review${k.pending === 1 ? "" : "s"}`, detail: k.pending_soon ? `${k.pending_soon} will publish on ${k.pending_soon === 1 ? "its" : "their"} own in the next 3 days if you do nothing.` : `Reviews under ${set.auto_publish_min}★ wait here. They publish on their own after ${HOLD_DAYS} days.`, go: { view: "rv_mod", f: { status: "pending" } } });
  const pc = await photoCheckStatus(store).catch(() => null);
  if (pc && pc.unsure) todo.push({ key: "photos", level: "mid", n: pc.unsure, title: `Look at ${pc.unsure} review photo${pc.unsure === 1 ? "" : "s"}`, detail: "Buzzin couldn't tell if a baby, kid or adult is in these. They stay hidden until you show or hide them.", go: { view: "rv_mod", f: { status: "all", media: "check" } } });
  if (k.low_unreplied) todo.push({ key: "low", level: "high", n: k.low_unreplied, title: `Reply to ${k.low_unreplied} low rating${k.low_unreplied === 1 ? "" : "s"}`, detail: "1–2★ reviews from the last 60 days with no reply yet. A public reply shows other shoppers you care.", go: { view: "rv_mod", f: { status: "all", rating: "1,2", replied: "no", days: "60" } } });
  if (k.mid_unreplied) todo.push({ key: "mid", level: "low", n: k.mid_unreplied, title: `Look at ${k.mid_unreplied} 3★ review${k.mid_unreplied === 1 ? "" : "s"}`, detail: "Middle ratings from the last 30 days often point at a fixable problem (sizing, fabric, shipping).", go: { view: "rv_mod", f: { status: "all", rating: "3", replied: "no", days: "30" } } });
  for (const p of dropping) todo.push({ key: "drop:" + p.product_id, level: "mid", title: `${p.title || "A product"} is averaging ${p.avg}★`, detail: `${p.n} reviews in the last 60 days. Read them to see what customers are unhappy about.`, image: p.image, go: { view: "rv_mod", f: { status: "all", product: p.product_id, product_title: p.title || "", store: p.store, sort: "lowest" } } });
  for (const s of stores) {
    if (!set.live[s]) todo.push({ key: "live:" + s, level: "setup", title: `Turn on reviews for ${STORES[s].name}`, detail: "Preview it on your site, then click Go live. The old review app stays until you do.", go: { view: "rv_setup" } });
    const fl = flows.filter((f) => f.store === s);
    if (!fl.some((f) => f.status === "live") && !set.requests[s]) todo.push({ key: "req:" + s, level: "setup", title: fl.length ? `Turn on the review request flow for ${STORES[s].name}` : `Set up review request emails and texts for ${STORES[s].name}`, detail: fl.length ? "It's built but not on yet. Turn it on in Reviews → Flows." : "A ready-made flow: email 14 days after shipping, a text, then a reminder. Fully editable.", go: { view: "rv_requests" } });
    const ds = d[s] || {};
    if (!ds.live) todo.push({ key: "design:" + s, level: "setup", title: `Customize how reviews look on ${STORES[s].name}`, detail: "Colors, fonts, words and which parts show, for desktop and mobile.", go: { customize: s } });
    else if (ds.draft && ds.draft_at && (!ds.published_at || ds.draft_at > ds.published_at)) todo.push({ key: "designpub:" + s, level: "mid", title: `Publish your design changes for ${STORES[s].name}`, detail: "You have saved changes that aren't on the website yet.", go: { customize: s } });
  }
  if (!g.last || Date.now() - new Date(g.last).getTime() > 3 * 864e5) todo.push({ key: "groups", level: "low", title: "Product groups haven't synced in a while", detail: "Groups share reviews between colors of the same product.", go: { view: "rv_groups" } });
  return { kpis: k, recent: recentAll, todo, requests: req, live: set.live, request_on: set.requests, flows };
}
/** Marketing flows that ask for reviews (made from the "Review request" starter, or anything named like it). */
async function reviewFlows(store) {
  return (await db(`SELECT id, store, name, status FROM mk_flows WHERE deleted_at IS NULL AND NOT COALESCE(archived,false) AND ($1::text IS NULL OR store=$1)
    AND (name ILIKE '%review%' OR graph::text LIKE '%review_url%') ORDER BY (status='live') DESC, id DESC`, [store || null]).catch(() => ({ rows: [] }))).rows;
}
/** Everything about asking for reviews in one store: its review flows step by step (emails, texts, waits) with results, and what they brought in. */
async function requestsView({ store, days = 30 }) {
  const d = Math.max(7, Math.min(365, Number(days) || 30));
  const out = [];
  for (const f0 of await reviewFlows(store)) {
    const f = (await db(`SELECT * FROM mk_flows WHERE id=$1`, [f0.id])).rows[0]; if (!f) continue;
    const nodes = (f.graph && f.graph.nodes) || {}; const seen = new Set(); const order = [];
    const walk = (id) => { while (id && nodes[id] && !seen.has(id)) { seen.add(id); order.push(id); const n = nodes[id]; if (n.yes || n.no) { walk(n.no); id = n.yes; } else id = n.next; } };
    walk(f.graph && f.graph.start); Object.keys(nodes).forEach((k) => { if (!seen.has(k)) order.push(k); });
    const st = (await db(`SELECT s.flow_step, count(DISTINCT s.id) FILTER (WHERE s.sent_at IS NOT NULL)::int sent, count(DISTINCT s.id) FILTER (WHERE s.status='skipped')::int skipped,
        count(DISTINCT s.id) FILTER (WHERE e.type='opened')::int opened, count(DISTINCT s.id) FILTER (WHERE e.type='clicked')::int clicked
      FROM mk_sends s LEFT JOIN mk_send_events e ON e.send_id=s.id AND NOT e.machine WHERE s.flow_id=$1 AND s.created_at > now() - ($2 || ' days')::interval AND NOT COALESCE((s.meta->>'test')::boolean,false) GROUP BY s.flow_step`, [f.id, String(d)]).catch(() => ({ rows: [] }))).rows;
    const by = Object.fromEntries(st.map((x) => [x.flow_step, x]));
    const tids = order.map((k) => nodes[k]).filter((n) => n.type === "send_email" && n.config && n.config.template_id).map((n) => Number(n.config.template_id));
    const tpls = tids.length ? Object.fromEntries((await db(`SELECT id, name, subject, preview, updated_at FROM mk_templates WHERE id = ANY($1)`, [tids])).rows.map((t) => [String(t.id), t])) : {};
    const runs = (await db(`SELECT count(*) FILTER (WHERE status IN ('active','working','paused'))::int active, count(*) FILTER (WHERE entered_at > now() - ($2 || ' days')::interval AND NOT test)::int entered FROM mk_flow_runs WHERE flow_id=$1`, [f.id, String(d)]).catch(() => ({ rows: [{}] }))).rows[0];
    out.push({ id: f.id, name: f.name, status: f.status, trigger: f.trigger, runs, steps: order.map((k) => {
      const n = nodes[k], c = n.config || {}, t = tpls[String(c.template_id)] || null, x = by[k] || {};
      return { id: k, type: n.type, name: c.name || (t && t.name) || null, status: c.status || null, amount: c.amount, unit: c.unit, until_time: c.until_time, template_id: c.template_id || null, subject: c.subject || (t && t.subject) || null, preview: c.preview || (t && t.preview) || null, body: c.body || null, sent: x.sent || 0, skipped: x.skipped || 0, opened: x.opened || 0, clicked: x.clicked || 0 };
    }) });
  }
  const a = [store, String(d)];
  const asked = (await db(`SELECT count(*)::int asked, count(*) FILTER (WHERE used_at IS NOT NULL)::int reviewed FROM rv_requests WHERE store=$1 AND NOT test AND sent > 0 AND created_at > now() - ($2 || ' days')::interval`, a)).rows[0];
  const rv = (await db(`SELECT count(*)::int n, round(avg(rating)::numeric,2)::float avg, count(*) FILTER (WHERE jsonb_array_length(media)>0)::int photos FROM rv_reviews WHERE store=$1 AND source='request' AND created_at > now() - ($2 || ' days')::interval`, a)).rows[0];
  const site = (await db(`SELECT count(*)::int n FROM rv_reviews WHERE store=$1 AND source='site' AND created_at > now() - ($2 || ' days')::interval`, a)).rows[0];
  return { days: d, flows: out, totals: { asked: asked.asked, reviewed: asked.reviewed, rate: asked.asked ? Math.round((1000 * asked.reviewed) / asked.asked) / 10 : null, reviews: rv.n, avg: rv.avg, photos: rv.photos, site: site.n } };
}
async function groups(store) {
  return (await db(`SELECT g.id, g.store, g.name, cardinality(g.product_ids) products, g.synced_at,
      (SELECT count(*)::int FROM rv_reviews r WHERE r.store=g.store AND r.status='published' AND r.product_id = ANY(g.product_ids)) reviews,
      (SELECT round(avg(rating)::numeric,2)::float FROM rv_reviews r WHERE r.store=g.store AND r.status='published' AND r.product_id = ANY(g.product_ids)) avg
    FROM rv_groups g WHERE ($1::text IS NULL OR g.store=$1) ORDER BY reviews DESC`, [store || null])).rows;
}
async function decide(id, action, who, text) {
  const r = (await db(`SELECT * FROM rv_reviews WHERE id=$1`, [id])).rows[0]; if (!r) throw Object.assign(new Error("review not found"), { status: 404 });
  if (action === "publish") await db(`UPDATE rv_reviews SET status='published', published_at=COALESCE(published_at, now()), decided_by=$2, updated_at=now() WHERE id=$1`, [id, who]);
  else if (action === "reject") await db(`UPDATE rv_reviews SET status='rejected', decided_by=$2, updated_at=now() WHERE id=$1`, [id, who]);
  else if (action === "reply") await db(`UPDATE rv_reviews SET reply=$2, reply_by=$3, reply_at=CASE WHEN $2::text IS NULL THEN NULL ELSE now() END, updated_at=now() WHERE id=$1`, [id, clean(text, 3000) || null, who]);
  else throw Object.assign(new Error("unknown action"), { status: 400 });
  AGG_CACHE.clear(); queueMetafield(r.store, r.product_id);
  await core.audit({ kind: `review-${action}`, detail: `${r.rating}★ ${r.product_title || ""} — ${r.reviewer_name || ""}`, who, target: id }).catch(() => {});
  return { ok: true };
}

/* ---------------- routes ---------------- */
function cors(res) { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "Content-Type"); res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); }
function routes(app, { guard, actorOf, express }) {
  const storeOk = (s) => (STORES[s] ? s : null);
  app.options("/rv/:store/*", (req, res) => { cors(res); res.status(204).end(); });
  app.get("/rv/:store/widget.js", async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).end();
    const set = await settings();
    res.setHeader("Cache-Control", "public, max-age=300");
    const ds = (await designs())[s] || {};
    res.type("application/javascript").send(fs.readFileSync(path.join(__dirname, "public", "bz-reviews-design.js"), "utf8") + `\nwindow.BZR=${JSON.stringify({ store: s, origin: PUBLIC_URL(), live: !!set.live[s], brand: STORES[s].name, design: ds.live || null })};\n` + fs.readFileSync(path.join(__dirname, "public", "bz-reviews.js"), "utf8") + "\n" + fs.readFileSync(path.join(__dirname, "public", "bz-reviews-page.js"), "utf8"));
  });
  app.get("/rv/:store/design", async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({});
    const ds = (await designs())[s] || {}; res.setHeader("Cache-Control", "no-store"); res.json({ design: (req.query.draft === "1" ? ds.draft || ds.live : ds.live) || null });
  });
  app.get("/rv/:store/product/:pid", async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({ error: "unknown store" });
    try { res.setHeader("Cache-Control", "public, max-age=60"); res.json(await productReviews(s, String(req.params.pid).replace(/\D/g, ""), req.query)); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/rv/:store/page", async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({});
    try { res.setHeader("Cache-Control", "public, max-age=300"); res.json(await pageMeta(s)); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/rv/:store/stars", async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({});
    try { res.setHeader("Cache-Control", "public, max-age=120"); res.json(await starsFor(s, String(req.query.ids || "").split(",").map((x) => x.replace(/\D/g, "")).filter(Boolean), req.query.scope)); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post("/rv/:store/submit", express.json({ limit: "200kb" }), async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({ error: "unknown store" });
    try { res.json(await submit(s, req.body || {}, { via: req.body && req.body.token ? "email" : "site" })); } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  app.post("/rv/:store/upload", express.raw({ type: ["image/*"], limit: "12mb" }), async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({ error: "unknown store" });
    try {
      const ct = String(req.headers["content-type"] || ""); if (!/^image\/(jpeg|png|webp|heic|heif|gif)/.test(ct) || !req.body || !req.body.length) return res.status(400).json({ error: "Add a photo (JPG or PNG)." });
      const f = await core.saveFile({ name: `review-${Date.now()}`, contentType: ct, buffer: req.body, by: "review" });
      res.json({ url: core.fileUrl(PUBLIC_URL(), f.file_id) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/rv/:store/write", async (req, res) => {
    const s = storeOk(req.params.store); if (!s) return res.status(404).send("Not found");
    try { const h = await writePage(s, String(req.query.t || ""), req.query.p, req.query.r); if (!h) return res.redirect(302, STORES[s].shop); res.setHeader("Cache-Control", "no-store"); res.type("html").send(h); } catch (e) { res.status(500).send("Something went wrong."); }
  });
  app.post("/rv/:store/helpful/:id", async (req, res) => { cors(res); try { const col = req.query.no ? "unhelpful" : "helpful"; await db(`UPDATE rv_reviews SET ${col}=${col}+1 WHERE id=$1 AND status='published'`, [req.params.id]); res.json({ ok: true }); } catch (_) { res.json({ ok: false }); } });
  app.get("/rv/:store/summary/:pid", async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({});
    res.setHeader("Cache-Control", "no-store"); return res.json({});   // AI summary is off for shoppers: it can repeat complaints
    try { const j = await summaryFor(s, String(req.params.pid).replace(/\D/g, ""), req.query.scope); res.setHeader("Cache-Control", j && j.summary ? "public, max-age=600" : "no-store"); res.json(j || {}); } catch (e) { res.setHeader("Cache-Control", "no-store"); res.json({}); }
  });

  // staff
  app.get("/api/reviews", async (req, res) => { if (!guard(req, res)) return; try { res.json(await list(req.query)); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.post("/api/reviews/:id/photo", async (req, res) => { if (!guard(req, res)) return; try { res.json(await photoDecide(req.params.id, (req.body || {}).i, (req.body || {}).action)); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } });
  app.get("/api/reviews-photo-check", async (req, res) => { if (!guard(req, res)) return; try { res.json(await photoCheckStatus()); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.post("/api/reviews/:id/:action", async (req, res) => { if (!guard(req, res)) return; try { res.json(await decide(req.params.id, req.params.action, actorOf(req), (req.body || {}).text)); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } });
  app.post("/api/reviews-bulk", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; if (!["publish", "reject"].includes(b.action)) return res.status(400).json({ error: "publish or reject" }); res.json(await bulk(b.ids, b.action, actorOf(req))); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get("/api/reviews-products", async (req, res) => { if (!guard(req, res)) return; try { res.json(await products(req.query)); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get("/api/reviews-insights", async (req, res) => { if (!guard(req, res)) return; try { res.json(await insights(req.query)); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get("/api/reviews-groups", async (req, res) => { if (!guard(req, res)) return; try { res.json({ groups: await groups(req.query.store || null) }); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.post("/api/reviews-groups/sync", async (req, res) => { if (!guard(req, res)) return; try { const out = {}; for (const k of Object.keys(STORES)) out[k] = await syncGroups(k); AGG_CACHE.clear(); res.json({ ok: true, out }); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get("/api/reviews-requests", async (req, res) => { if (!guard(req, res)) return; const s = storeOk(req.query.store); if (!s) return res.status(400).json({ error: "store?" }); try { res.json(await requestsView({ store: s, days: req.query.days })); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get("/api/reviews-flows", async (req, res) => { if (!guard(req, res)) return; res.json({ flows: await reviewFlows(req.query.store || null) }); });
  app.post("/api/reviews-flows", async (req, res) => {
    if (!guard(req, res)) return; const s = storeOk((req.body || {}).store); if (!s) return res.status(400).json({ error: "store?" });
    try { const f = await require("./mk-flows").create(s, `Review request · ${STORES[s].name}`, actorOf(req), "review_request"); res.json({ id: f.id }); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/api/reviews-backup", async (req, res) => {
    if (!guard(req, res)) return; const s = req.query.store ? storeOk(req.query.store) : null; const fmt = String(req.query.format || "csv");
    const stamp = bzDay(); const base = `buzzin-reviews-${s || "all"}-${stamp}`;
    try {
      if (fmt === "status") return res.json({ ...(await mediaStatus(s)), snapshots: (await db(`SELECT id, name, created_at, length(data)::int size FROM hd_files WHERE created_by='review-backup' AND name LIKE 'reviews-backup-%.json' ORDER BY created_at DESC LIMIT 14`)).rows.map((x) => ({ ...x, url: core.fileUrl(PUBLIC_URL(), x.id) })) });
      if (fmt === "photos") {
        const rows = await backupRows(s); const files = [];
        for (const r of rows) (r.media || []).forEach((m, i) => { if (m.type === "video") return; const u = m.large || m.url; const ext = (/\.(png|webp|gif|jpe?g)(\?|$)/i.exec(m.orig_url || u) || [, "jpg"])[1].toLowerCase(); files.push({ name: `${r.store}/${(r.product_handle || r.product_id || "product").replace(/[^a-z0-9-]/gi, "-").slice(0, 60)}/${r.id}-${i + 1}.${ext}`, get: () => fetchBytes(u).catch(() => (m.orig_url ? fetchBytes(m.orig_url) : null)) }); });
        res.setHeader("Content-Type", "application/zip"); res.setHeader("Content-Disposition", `attachment; filename="${base}-photos.zip"`);
        return streamZip(res, files);
      }
      const rows = await backupRows(s);
      if (fmt === "json") { res.setHeader("Content-Disposition", `attachment; filename="${base}.json"`); return res.json({ exported_at: new Date().toISOString(), store: s || "all", count: rows.length, reviews: rows.map(({ raw, ...r }) => r) }); }
      const lines = [CSV_COLS.join(",")];
      for (const r of rows) lines.push(CSV_COLS.map((k) => csvCell(k === "photos" ? (r.media || []).map((m) => m.large || m.url).join(" ") : k === "original_photo_links" ? (r.media || []).map((m) => m.orig_url || m.url).join(" ") : r[k])).join(","));
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${base}.csv"`); res.send("\ufeff" + lines.join("\r\n"));
    } catch (e) { if (!res.headersSent) res.status(500).json({ error: e.message }); else res.end(); }
  });
  app.post("/api/reviews-backup/keep-photos", async (req, res) => { if (!guard(req, res)) return; try { res.json({ ...(await keepMedia({ batch: 40 })), status: await mediaStatus() }); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get("/api/reviews-overview", async (req, res) => { if (!guard(req, res)) return; try { res.json(await overview(req.query)); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get("/api/reviews-design", async (req, res) => {
    if (!guard(req, res)) return; const s = storeOk(req.query.store); if (!s) return res.status(400).json({ error: "store?" });
    try { const ds = (await designs())[s] || {}; res.json({ store: s, brand: STORES[s].name, shop: STORES[s].shop, draft: ds.draft || ds.live || null, live: ds.live || null, published_at: ds.published_at || null, draft_at: ds.draft_at || null, sample: await sampleProduct(s), origin: PUBLIC_URL() }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.put("/api/reviews-design", async (req, res) => {
    if (!guard(req, res)) return; const b = req.body || {}; const s = storeOk(b.store); if (!s) return res.status(400).json({ error: "store?" });
    try { const r = await saveDesign(s, { draft: cleanDesign(b.design), draft_at: new Date().toISOString() }); res.json({ ok: true, draft_at: r.draft_at }); } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  app.post("/api/reviews-design/publish", async (req, res) => {
    if (!guard(req, res)) return; const b = req.body || {}; const s = storeOk(b.store); if (!s) return res.status(400).json({ error: "store?" });
    try {
      const design = cleanDesign(b.design || ((await designs())[s] || {}).draft || {});
      const now = new Date().toISOString(); const r = await saveDesign(s, { draft: design, live: design, published_at: now, draft_at: now });
      await core.audit({ kind: "reviews-design", detail: `Published review design for ${STORES[s].name}`, who: actorOf(req), target: s }).catch(() => {});
      res.json({ ok: true, published_at: r.published_at });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  app.get("/api/reviews-settings", async (req, res) => { if (!guard(req, res)) return; res.json(await settings()); });
  app.post("/api/reviews-settings", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; const patch = {}; if (b.auto_publish_min) patch.auto_publish_min = Math.max(1, Math.min(5, Number(b.auto_publish_min))); if (b.photo_filter != null) { patch.photo_filter = !!b.photo_filter; PHOTO_FILTER = patch.photo_filter; AGG_CACHE.clear(); } if (b.live) patch.live = { lb: !!b.live.lb, lbo: !!b.live.lbo }; if (b.requests) patch.requests = { lb: !!b.requests.lb, lbo: !!b.requests.lbo }; res.json(await saveSettings(patch)); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.post("/api/reviews-test-request", async (req, res) => {
    if (!guard(req, res)) return;
    try { const to = String((req.body || {}).to || "").trim(); if (!/@/.test(to)) return res.status(400).json({ error: "Which email should the test go to?" }); res.json(await testRequest(storeOk((req.body || {}).store) || "lb", to)); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post("/api/reviews-sync", async (req, res) => {
    if (!guard(req, res)) return;
    try { const out = []; for (const s of Object.keys(STORES)) { out.push(await importOkendo(s, { full: false })); } AGG_CACHE.clear(); res.json({ ok: true, out }); } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

/* ---------------- background ---------------- */
/* ---------------- backup: review photos kept for good, and downloadable copies ----------------
 * Imported reviews pointed at the old review app's servers for their photos. Each photo is copied into the store's
 * Shopify Files (Shopify's image servers, resizable), or into Buzzin's own storage if Shopify won't take it.
 * The original link is kept on the review too (orig_url). */
const isKept = (m) => !!(m && m.kept);
function thumbOf(u, w) { return /cdn\.shopify\.com/.test(u) ? u + (u.includes("?") ? "&" : "?") + "width=" + w : u; }
async function toShopifyFiles(store, srcs) {
  const R = require("./returns"); const st = R.shopFor(store);
  const r = await R.gql(st, `mutation($f:[FileCreateInput!]!){ fileCreate(files:$f){ files{ id fileStatus } userErrors{ field message } } }`, { f: srcs.map((u) => ({ originalSource: u, contentType: "IMAGE", alt: "Customer review photo" })) });
  const out = r.fileCreate; if (out.userErrors && out.userErrors.length) throw new Error(out.userErrors.map((e) => e.message).join("; "));
  const ids = out.files.map((f) => f.id); const urls = new Array(ids.length).fill(null);
  for (let i = 0; i < 30 && urls.some((u, k) => !u && ids[k]); i++) {
    await new Promise((res) => setTimeout(res, 1500));
    const q = await R.gql(st, `query($ids:[ID!]!){ nodes(ids:$ids){ ... on MediaImage { id fileStatus image { url } } } }`, { ids });
    (q.nodes || []).forEach((n, k) => { if (n && n.fileStatus === "READY" && n.image) urls[k] = n.image.url; if (n && n.fileStatus === "FAILED") ids[k] = null; });
  }
  return urls;
}
async function toBuzzinFile(u) {
  const r = await fetch(u); if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = String(r.headers.get("content-type") || "image/jpeg").split(";")[0]; if (!/^image\//.test(ct)) throw new Error("not an image");
  const buf = Buffer.from(await r.arrayBuffer()); const f = await core.saveFile({ name: `review-photo-${Date.now()}`, contentType: ct, buffer: buf, by: "review-backup" });
  return core.fileUrl(PUBLIC_URL(), f.file_id);
}
let MEDIA_BUSY = false;
async function photoDecide(id, i, action) {
  i = Number(i); if (!Number.isInteger(i) || i < 0) throw Object.assign(new Error("Pick a photo."), { status: 400 });
  const v = action === "show" ? "shown" : action === "hide" ? "hidden_manual" : null; if (!v) throw Object.assign(new Error("Unknown action."), { status: 400 });
  const r = (await db(`UPDATE rv_reviews SET media_check = jsonb_set(media_check, ARRAY[$2::text], to_jsonb($3::text), true) WHERE id=$1 AND jsonb_array_length(media) > $4 RETURNING product_id, store, media_check`, [String(id), String(i), v, i])).rows[0];
  if (!r) throw Object.assign(new Error("Review not found."), { status: 404 });
  AGG_CACHE.clear(); return { ok: true, media_check: r.media_check };
}
async function photoCheckStatus(store) {
  return (await db(`SELECT count(*) FILTER (WHERE v IN ('ok','shown'))::int ok, count(*) FILTER (WHERE v IN ('hidden','hidden_manual'))::int hidden, count(*) FILTER (WHERE v='unsure')::int unsure,
      count(*) FILTER (WHERE v IS NULL OR v IN ('pending','err1','err2'))::int waiting, count(*)::int total
    FROM (SELECT r.media_check->>(i - 1)::text v FROM rv_reviews r, jsonb_array_elements(r.media) WITH ORDINALITY e(m, i) WHERE COALESCE(e.m->>'type','image') <> 'video' AND ($1::text IS NULL OR r.store=$1)) x`, [store || null])).rows[0];
}
const PHOTO_PROMPT = `This photo was uploaded with a customer review of baby and kids clothing. Is a real person (a baby, a child, or an adult) visible in it?
Answer "yes" if a real person is clearly in the photo, even partly (for example a baby wearing the clothes, a face, a body in the outfit).
Answer "no" if there is no person: only the clothing or fabric laid out, packaging, a box, a label, a pet, a room, a screenshot or text.
Answer "unsure" if you can't tell: very dark or blurry, only a hand or fingertips holding the item, a doll, a drawing, or a person on a screen.
Reply with JSON only: {"person":"yes"|"no"|"unsure","why":"a few words"}`;
let PHOTO_BUSY = false;
async function checkPhotos({ batch = 6 } = {}) {
  if (PHOTO_BUSY) return { busy: true }; PHOTO_BUSY = true;
  let done = 0;
  try {
    PHOTO_FILTER = (await settings()).photo_filter !== false;
    if (!PHOTO_FILTER) return { off: true, rows: 0 };
    const kit = require("./emily").claimsKit(); if (!kit || !kit.anthropic) return { rows: 0, nokey: true };
    const rows = (await db(`SELECT r.id, r.media, r.media_check FROM rv_reviews r WHERE jsonb_array_length(r.media) > 0 AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.media) WITH ORDINALITY e(m, i)
        WHERE COALESCE(e.m->>'type','image') <> 'video' AND COALESCE(r.media_check->>(i - 1)::text, 'new') IN ('new','pending','err1','err2'))
      ORDER BY (r.media_check::text LIKE '%pending%') DESC, r.created_at DESC LIMIT $1`, [batch])).rows;
    await Promise.all(rows.map(async (row) => {
      for (let i = 0; i < row.media.length; i++) {
        const m = row.media[i]; const cur = (row.media_check || {})[String(i)];
        if (m.type === "video" || (cur && !["pending", "err1", "err2"].includes(cur))) continue;
        let v, why = null;
        try {
          const resp = await kit.anthropic.messages.create({ model: kit.model, max_tokens: 80, messages: [{ role: "user", content: [
            { type: "image", source: { type: "url", url: m.thumb || m.large || m.url } }, { type: "text", text: PHOTO_PROMPT }] }] });
          const out = (resp.content || []).map((c) => c.text || "").join("");
          const j = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
          v = j.person === "yes" ? "ok" : j.person === "no" ? "hidden" : "unsure"; why = String(j.why || "").slice(0, 80) || null;
        } catch (e) { v = cur === "err2" ? "unsure" : cur === "err1" ? "err2" : "err1"; why = "Couldn't check: " + String(e.message).slice(0, 60); }
        await db(`UPDATE rv_reviews SET media_check = jsonb_set(media_check, ARRAY[$2::text], to_jsonb($3::text), true), media_why = jsonb_set(media_why, ARRAY[$2::text], to_jsonb($4::text), true)
          WHERE id=$1 AND COALESCE(media_check->>$2, 'new') NOT IN ('shown','hidden_manual')`, [row.id, String(i), v, why || ""]);
        done++;
      }
    }));
    if (done) AGG_CACHE.clear();
    return { done, rows: rows.length };
  } finally { PHOTO_BUSY = false; }
}
async function keepMedia({ batch = 25 } = {}) {
  if (MEDIA_BUSY) return { busy: true }; MEDIA_BUSY = true;
  let done = 0, failed = 0;
  try {
    const rows = (await db(`SELECT id, store, media FROM rv_reviews WHERE jsonb_array_length(media) > 0 AND EXISTS (SELECT 1 FROM jsonb_array_elements(media) m WHERE NOT COALESCE((m->>'kept')::boolean,false) AND COALESCE((m->>'tries')::int,0) < 3) ORDER BY created_at DESC LIMIT $1`, [batch])).rows;
    for (const row of rows) {
      const media = row.media.map((m) => ({ ...m }));
      const todo = media.map((m, i) => ({ m, i })).filter(({ m }) => !isKept(m) && (m.tries || 0) < 3 && m.type !== "video");
      for (const m of media) if (m.type === "video" && !m.kept) { m.kept = true; m.note = "video left on the original link"; }
      let urls = [];
      try { urls = await toShopifyFiles(row.store, todo.map(({ m }) => m.large || m.url)); } catch (e) { urls = todo.map(() => null); if (!keepMedia.warned) { keepMedia.warned = 1; console.log(`⭐ review photos: Shopify Files not available (${e.message}); keeping them in Buzzin instead`); } }
      for (let k = 0; k < todo.length; k++) {
        const m = todo[k].m; const src = m.large || m.url;
        let u = urls[k];
        if (!u) { try { u = await toBuzzinFile(src); } catch (e) { m.tries = (m.tries || 0) + 1; m.last_error = String(e.message).slice(0, 120); failed++; continue; } }
        Object.assign(m, { orig_url: m.orig_url || m.url, orig_large: m.orig_large || m.large || null, orig_thumb: m.orig_thumb || m.thumb || null, url: u, large: u, thumb: thumbOf(u, 400), kept: true, kept_at: new Date().toISOString() });
        done++;
      }
      await db(`UPDATE rv_reviews SET media=$2 WHERE id=$1`, [row.id, JSON.stringify(media)]);
    }
    if (done || failed) { AGG_CACHE.clear(); }
    return { done, failed, rows: rows.length };
  } finally { MEDIA_BUSY = false; }
}
async function mediaStatus(store) {
  const r = (await db(`SELECT count(*) FILTER (WHERE COALESCE((m->>'kept')::boolean,false))::int kept, count(*)::int total,
      count(*) FILTER (WHERE NOT COALESCE((m->>'kept')::boolean,false) AND COALESCE((m->>'tries')::int,0) >= 3)::int failed
    FROM rv_reviews r, jsonb_array_elements(r.media) m WHERE ($1::text IS NULL OR r.store=$1)`, [store || null])).rows[0];
  return r;
}
const CSV_COLS = ["id", "store", "source", "status", "rating", "title", "body", "reviewer_name", "email", "verified", "recommended", "product_id", "product_handle", "product_title", "variant_title", "order_name", "created_at", "published_at", "reply", "reply_at", "helpful", "unhelpful", "photos", "original_photo_links", "answers", "ext_id"];
function csvCell(v) { if (v == null) return ""; if (v instanceof Date) v = v.toISOString(); const s = typeof v === "object" ? JSON.stringify(v) : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
async function backupRows(store) {
  return (await db(`SELECT * FROM rv_reviews WHERE ($1::text IS NULL OR store=$1) ORDER BY store, created_at`, [store || null])).rows;
}
// A plain ZIP (stored, no compression: photos are already compressed), streamed so it never sits in memory.
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function streamZip(res, files) {   // files: [{ name, get: async () => Buffer }]
  const central = []; let off = 0;
  const w = (b) => new Promise((ok) => (res.write(b) ? ok() : res.once("drain", ok)));
  for (const f of files) {
    let data; try { data = await f.get(); } catch (e) { continue; } if (!data) continue;
    const name = Buffer.from(f.name, "utf8"); const crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt32LE(0, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
    await w(h); await w(name); await w(data);
    central.push({ name, crc, size: data.length, off }); off += 30 + name.length + data.length;
  }
  let cd = 0;
  for (const c of central) { const h = Buffer.alloc(46); h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0x0800, 8); h.writeUInt16LE(0, 10); h.writeUInt32LE(0, 12); h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.size, 20); h.writeUInt32LE(c.size, 24); h.writeUInt16LE(c.name.length, 28); h.writeUInt32LE(0, 30); h.writeUInt32LE(0, 34); h.writeUInt32LE(0, 38); h.writeUInt32LE(c.off, 42); await w(h); await w(c.name); cd += 46 + c.name.length; }
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(central.length, 8); e.writeUInt16LE(central.length, 10); e.writeUInt32LE(cd, 12); e.writeUInt32LE(off, 16); await w(e);
  res.end();
}
async function fetchBytes(u) {
  const m = String(u).match(/\/file\/([a-f0-9]{32})\//); if (m) { const f = await core.getFile(m[1]); return f && f.buffer; }
  const r = await fetch(u); if (!r.ok) throw new Error(`HTTP ${r.status}`); return Buffer.from(await r.arrayBuffer());
}

async function startJobs(syncGet, syncSet) {
  // Keep every review photo for good (copied off the old app's servers), a batch at a time until all are done.
  const photoLoop = async () => { try { const r = await checkPhotos({ batch: 6 }); if (r.rows) { if (!photoLoop.n || ++photoLoop.n % 20 === 0) { photoLoop.n = photoLoop.n || 1; const st = await photoCheckStatus(); console.log(`⭐ photo check: ${st.ok} ok · ${st.hidden} hidden · ${st.unsure} to look at · ${st.waiting} left`); } setTimeout(photoLoop, 1500); } else setTimeout(photoLoop, 60e3); } catch (e) { console.error("photo check:", e.message); setTimeout(photoLoop, 300e3); } };
  setTimeout(photoLoop, 20e3);
  const mediaLoop = async () => { try { const r = await keepMedia({ batch: 25 }); if (r.rows) { const st = await mediaStatus(); console.log(`⭐ review photos kept: +${r.done}${r.failed ? `, ${r.failed} failed` : ""} · ${st.kept}/${st.total} done`); setTimeout(mediaLoop, 5000); } else setTimeout(mediaLoop, 6 * 3600e3); } catch (e) { console.error("review photos:", e.message); setTimeout(mediaLoop, 600e3); } };
  setTimeout(mediaLoop, 60e3);
  // A full copy of every review, saved in Buzzin once a day (the last 14 are kept).
  const snap = async () => { try { const k = "reviews_snapshot_" + bzDay(); if (await syncGet(k)) return; const rows = (await backupRows(null)).map(({ raw, ...r }) => r);
      const f = await core.saveFile({ name: `reviews-backup-${bzDay()}.json`, contentType: "application/json", buffer: Buffer.from(JSON.stringify({ exported_at: new Date().toISOString(), count: rows.length, reviews: rows })), by: "review-backup" });
      await db(`DELETE FROM hd_files WHERE created_by='review-backup' AND name LIKE 'reviews-backup-%.json' AND id NOT IN (SELECT id FROM hd_files WHERE created_by='review-backup' AND name LIKE 'reviews-backup-%.json' ORDER BY created_at DESC LIMIT 14)`).catch(() => {});
      await syncSet(k, f.file_id); console.log(`⭐ reviews backup saved: ${rows.length} reviews`); } catch (e) { console.error("reviews backup:", e.message); } };
  setTimeout(snap, 120e3); setInterval(snap, 6 * 3600e3);
  // Build the review request flow (emails after 14 days + text + reminder) for each store, as a draft. Nothing sends until it's turned on.
  if (!(await syncGet("reviews_flows_v1"))) {
    for (const s of Object.keys(STORES)) {
      try {
        const have = await reviewFlows(s);
        if (have.length) { console.log(`⭐ REVIEW FLOW ${s}: already there (#${have[0].id})`); continue; }
        const f = await require("./mk-flows").create(s, `Review request · ${STORES[s].name}`, "buzzin", "review_request");
        const n = Object.values(f.graph.nodes || {}).filter((x) => x.type === "send_email" && x.config && x.config.template_id).length;
        console.log(`⭐ REVIEW FLOW ${s}: built #${f.id} (draft) with ${n} emails`);
      } catch (e) { console.error(`⭐ review flow ${s}:`, e.message); }
    }
    await syncSet("reviews_flows_v1", new Date().toISOString());
  }
  // First full copy of Okendo (both stores) + review groups, once.
  if (!(await syncGet("reviews_okendo_v1"))) {
    for (const s of Object.keys(STORES)) {
      try { const r = await importOkendo(s, { full: true }); console.log(`⭐ REVIEWS copied from Okendo ${s}: ${r.added} new, ${r.updated} already here (${r.seen} seen, ${r.pages} pages)`); } catch (e) { console.error(`⭐ reviews import ${s}:`, e.message); }
      try { const g = await syncGroups(s); console.log(`⭐ REVIEWS ${s}: ${g} review groups copied from the "Okendo …" collections`); } catch (e) { console.error(`⭐ review groups ${s}:`, e.message); }
    }
    const c = (await db(`SELECT store, count(*)::int n, round(avg(rating)::numeric, 2) avg, count(*) FILTER (WHERE jsonb_array_length(media)>0)::int media FROM rv_reviews GROUP BY store`)).rows;
    console.log(`⭐ REVIEWS in Buzzin: ${c.map((x) => `${x.store} ${x.n} (avg ${x.avg}, ${x.media} with media)`).join(" · ")}`);
    await syncSet("reviews_okendo_v1", "1", {});
  }
  if (!(await syncGet("reviews_groups_v2"))) {
    for (const s of Object.keys(STORES)) { try { const g = await syncGroups(s); console.log(`⭐ REVIEWS ${s}: ${g} review groups copied from the "Okendo …" collections`); } catch (e) { console.error(`⭐ review groups ${s}:`, e.message); } }
    await syncSet("reviews_groups_v2", "1", {});
  }
  // Until Okendo is off: pick up its new reviews every 3 hours. Groups daily. Held reviews and metafields every 15 min.
  setInterval(async () => { const s = await settings(); for (const k of Object.keys(STORES)) if (!s.live[k]) await importOkendo(k, { full: false }).catch(() => {}); AGG_CACHE.clear(); }, 3 * 3600e3);
  setInterval(() => { for (const k of Object.keys(STORES)) syncGroups(k).catch(() => {}); }, 24 * 3600e3);
  setInterval(() => { publishHeld().catch(() => {}); flushMetafields().catch(() => {}); }, 15 * 60e3);
  setInterval(() => runRequests().catch((e) => console.error("review requests:", e.message)), 6 * 3600e3); setTimeout(() => runRequests().catch((e) => console.error("review requests:", e.message)), 5 * 60e3);
}

module.exports = { reviewItems, skipItem, reviewContext, tokenForOrder, runRequests, testRequest, writePage, migrate, routes, startJobs, importOkendo, syncGroups, productReviews, starsFor, submit, list, decide, settings, saveSettings, STORES };
