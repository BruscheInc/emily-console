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
const DEFAULTS = { auto_publish_min: 4, live: { lb: false, lbo: false }, requests: { lb: false, lbo: false }, wait_days: 14, reminder_days: 7, reminders: 2 };

async function settings() { const s = await core.setting("reviews_settings", null); return { ...DEFAULTS, ...(s || {}), live: { ...DEFAULTS.live, ...((s && s.live) || {}) }, requests: { ...DEFAULTS.requests, ...((s && s.requests) || {}) } }; }
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
async function scopeFor(store, productId) {
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
function pubReview(r) {
  return { id: r.id, rating: r.rating, title: r.title, body: r.body, name: r.reviewer_name || "Customer", verified: !!r.verified, recommended: r.recommended,
    date: r.created_at, product: r.product_title, product_handle: r.product_handle, product_image: r.product_image, variant: r.variant_title,
    media: (r.media || []).map((m) => ({ type: m.type, url: m.large || m.url, thumb: m.thumb || m.url, alt: m.alt || null })),
    reply: r.reply || null, reply_at: r.reply_at || null, helpful: r.helpful || 0, unhelpful: r.unhelpful || 0, answers: r.answers || null };
}
async function aggregate(store, ids) {
  const key = `${store}:${ids.slice().sort().join(",")}`;
  const c = AGG_CACHE.get(key); if (c && Date.now() - c.at < 5 * 60e3) return c.v;
  const a = (await db(`SELECT count(*)::int n, COALESCE(avg(rating),0)::float avg, count(*) FILTER (WHERE recommended)::int rec, count(*) FILTER (WHERE recommended IS NOT NULL)::int recn,
      count(*) FILTER (WHERE jsonb_array_length(media)>0)::int media,
      count(*) FILTER (WHERE rating=5)::int s5, count(*) FILTER (WHERE rating=4)::int s4, count(*) FILTER (WHERE rating=3)::int s3, count(*) FILTER (WHERE rating=2)::int s2, count(*) FILTER (WHERE rating=1)::int s1
    FROM rv_reviews WHERE store=$1 AND status='published' AND product_id = ANY($2)`, [store, ids])).rows[0];
  const v = { count: a.n, average: Math.round(a.avg * 10) / 10, recommend_pct: a.recn ? Math.round((100 * a.rec) / a.recn) : null, with_media: a.media, histogram: { 5: a.s5, 4: a.s4, 3: a.s3, 2: a.s2, 1: a.s1 } };
  AGG_CACHE.set(key, { at: Date.now(), v });
  return v;
}
async function productReviews(store, productId, { sort = "media", rating, media, q, page = 1, per = 10 } = {}) {
  const ids = await scopeFor(store, productId);
  const args = [store, ids]; const where = [`store=$1`, `status='published'`, `product_id = ANY($2)`];
  if (rating && Number(rating) >= 1 && Number(rating) <= 5) { args.push(Number(rating)); where.push(`rating=$${args.length}`); }
  if (media === "1" || media === true) where.push(`jsonb_array_length(media) > 0`);
  if (q && String(q).trim()) { args.push(`%${String(q).trim().slice(0, 80)}%`); where.push(`(title ILIKE $${args.length} OR body ILIKE $${args.length})`); }
  const order = { newest: "created_at DESC", oldest: "created_at ASC", highest: "rating DESC, created_at DESC", lowest: "rating ASC, created_at DESC", helpful: "helpful DESC, created_at DESC", media: "(jsonb_array_length(media) > 0) DESC, rating DESC, created_at DESC" }[sort] || "(jsonb_array_length(media) > 0) DESC, rating DESC, created_at DESC";
  per = Math.max(1, Math.min(30, Number(per) || 10)); page = Math.max(1, Number(page) || 1);
  const rows = (await db(`SELECT * FROM rv_reviews WHERE ${where.join(" AND ")} ORDER BY ${order} LIMIT ${per + 1} OFFSET ${(page - 1) * per}`, args)).rows;
  const filtered = (await db(`SELECT count(*)::int n FROM rv_reviews WHERE ${where.join(" AND ")}`, args)).rows[0].n;
  let photos;
  if (page === 1) photos = (await db(`SELECT id, media FROM rv_reviews WHERE store=$1 AND status='published' AND product_id = ANY($2) AND jsonb_array_length(media) > 0 ORDER BY created_at DESC LIMIT 14`, [store, ids])).rows
    .map((r) => { const m = (r.media || []).find((x) => x.type !== "video"); return m ? { review: r.id, thumb: m.thumb || m.url, url: m.large || m.url } : null; }).filter(Boolean).slice(0, 12);
  return { summary: await aggregate(store, ids), total: filtered, reviews: rows.slice(0, per).map(pubReview), more: rows.length > per, page, photos };
}
async function starsFor(store, productIds) {
  const out = {};
  for (const id of productIds.slice(0, 80)) { const a = await aggregate(store, await scopeFor(store, id)); out[id] = { average: a.average, count: a.count }; }
  return out;
}

/* ---------------- "Reviews summary" + "Customers talked about" (written by Claude from the reviews) ----------------
   One summary per review group / product, refreshed when the review count grows 10% or after 30 days. */
const SUMMARY_BUSY = new Set();
async function summaryFor(store, productId) {
  const ids = (await scopeFor(store, productId)).sort();
  const scope = `${store}:` + crypto.createHash("md5").update(ids.join(",")).digest("hex");
  const row = (await db(`SELECT * FROM rv_summaries WHERE scope=$1`, [scope])).rows[0];
  const n = (await aggregate(store, ids)).count;
  const stale = !row || (n >= 5 && (n > row.count * 1.1 || Date.now() - new Date(row.updated_at) > 30 * 864e5));
  if (stale && n >= 5 && !SUMMARY_BUSY.has(scope) && SUMMARY_BUSY.size < 3) { SUMMARY_BUSY.add(scope); makeSummary(store, ids, scope, n).catch((e) => console.error("review summary:", e.message)).finally(() => SUMMARY_BUSY.delete(scope)); }
  return row && row.summary ? { summary: row.summary, topics: row.topics || [] } : null;
}
async function makeSummary(store, ids, scope, n) {
  const kit = require("./emily").claimsKit(); if (!kit || !kit.anthropic) return;
  const rows = (await db(`(SELECT rating, title, body FROM rv_reviews WHERE store=$1 AND status='published' AND product_id = ANY($2) ORDER BY created_at DESC LIMIT 140)
    UNION ALL (SELECT rating, title, body FROM rv_reviews WHERE store=$1 AND status='published' AND product_id = ANY($2) AND rating <= 3 ORDER BY created_at DESC LIMIT 30)`, [store, ids])).rows;
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
  if (reqRow) await db(`UPDATE rv_requests SET used_at=COALESCE(used_at, now()) WHERE token=$1`, [reqRow.token]);
  if (status === "published") { AGG_CACHE.clear(); queueMetafield(store, b.product_id); }
  if (email) { try { await require("./mk-core").track(store, "left_review", { email, props: { rating, product_id: String(b.product_id || ""), product: clean(b.product_title, 200) }, source: "reviews" }); } catch (_) {} }
  if (rating <= 2) core.slackPost && core.slackPost(`⭐ ${rating}-star review on ${STORES[store].name}: ${clean(b.product_title, 120)} — “${title || body.slice(0, 120)}” (${name}). Open Buzzin → Reviews.`).catch(() => {});
  return { ok: true, id, status };
}

/* ---------------- review request emails (Okendo's "Review Request With Two Reminders") ----------------
   14 days after an order ships, email "How did your little one like it?" with each item and a row of stars. Tapping a
   star opens the review page with that rating picked. Reminders 7 and 14 days later if nothing was reviewed.
   Goes to every buyer except people who unsubscribed or bounced. Off per store until Okendo's sequence is paused. */
const STAR_PATH = "M12 2.6l2.9 6.2 6.7.7-5 4.6 1.4 6.7L12 17.4l-6 3.4 1.4-6.7-5-4.6 6.7-.7z";
const writeBase = (store) => { try { const d = require("./returns").STORE_DEFS[store]; if (d && d.host) return `https://${d.host}`; } catch (_) {} return PUBLIC_URL(); };
const SKIP_ITEM = /package protection|shipping protection|gift card|route|insurance/i;
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
      for (const li of o.lineItems.nodes) { if (!li.product || SKIP_ITEM.test(li.title) || seen.has(li.product.legacyResourceId)) continue; seen.add(li.product.legacyResourceId);
        items.push({ product_id: String(li.product.legacyResourceId), handle: li.product.handle, title: li.title, variant: li.variantTitle, image: li.product.featuredMedia && li.product.featuredMedia.preview && li.product.featuredMedia.preview.image ? li.product.featuredMedia.preview.image.url : null }); }
      if (!items.length) continue;
      const name = [o.customer && o.customer.firstName || (o.shippingAddress && o.shippingAddress.firstName), (o.customer && o.customer.lastName || (o.shippingAddress && o.shippingAddress.lastName) || "").slice(0, 1)].filter(Boolean).join(" ") + ((o.customer && o.customer.lastName) ? "." : "");
      const r = await db(`INSERT INTO rv_requests (token, store, order_id, order_name, email, name, items, fulfilled_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING token`,
        [crypto.randomBytes(12).toString("hex"), store, String(o.legacyResourceId), o.name, String(o.email).toLowerCase(), name, JSON.stringify(items.slice(0, 8)), shipped]);
      if (r.rowCount) made++;
    }
    // 2) send what's due: first email, then reminders every reminder_days while nothing was reviewed
    const due = (await db(`SELECT * FROM rv_requests WHERE store=$1 AND NOT test AND used_at IS NULL AND sent <= $2
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
  const o = orders.reverse().find((x) => x.email && !x.cancelledAt && x.lineItems.nodes.some((li) => li.product && !SKIP_ITEM.test(li.title)));
  if (!o) throw new Error("no recent shipped order found to use as the example");
  const items = []; const seen = new Set();
  for (const li of o.lineItems.nodes) { if (!li.product || SKIP_ITEM.test(li.title) || seen.has(li.product.legacyResourceId)) continue; seen.add(li.product.legacyResourceId); items.push({ product_id: String(li.product.legacyResourceId), handle: li.product.handle, title: li.title, variant: li.variantTitle, image: li.product.featuredMedia && li.product.featuredMedia.preview && li.product.featuredMedia.preview.image ? li.product.featuredMedia.preview.image.url : null }); }
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
function listWhere({ store, status, rating, q, source, sentiment, product, days, media }) {
  const args = [], where = [];
  if (store) { args.push(store); where.push(`store=$${args.length}`); }
  if (status && status !== "all") { args.push(status); where.push(`status=$${args.length}`); }
  if (rating) { const rs = String(rating).split(",").map(Number).filter((x) => x >= 1 && x <= 5); if (rs.length) { args.push(rs); where.push(`rating = ANY($${args.length})`); } }
  if (sentiment === "positive") where.push(`rating >= 4`); else if (sentiment === "neutral") where.push(`rating = 3`); else if (sentiment === "negative") where.push(`rating <= 2`);
  if (source) { args.push(source === "imported" ? "okendo" : source); where.push(`source=$${args.length}`); }
  if (product) { args.push(String(product)); where.push(`product_id=$${args.length}`); }
  if (days && Number(days) > 0) { args.push(String(Number(days))); where.push(`created_at > now() - ($${args.length} || ' days')::interval`); }
  if (media === "1") where.push(`jsonb_array_length(media) > 0`); else if (media === "0") where.push(`jsonb_array_length(media) = 0`);
  if (q) { args.push(`%${String(q).slice(0, 80)}%`); where.push(`(title ILIKE $${args.length} OR body ILIKE $${args.length} OR reviewer_name ILIKE $${args.length} OR email ILIKE $${args.length} OR product_title ILIKE $${args.length} OR order_name ILIKE $${args.length})`); }
  return { args, w: where.length ? `WHERE ${where.join(" AND ")}` : "" };
}
async function list(f) {
  const { args, w } = listWhere(f);
  const per = Math.min(100, Number(f.per) || 25), page = Math.max(1, Number(f.page) || 1);
  const order = { oldest: "created_at ASC", highest: "rating DESC, created_at DESC", lowest: "rating ASC, created_at DESC", helpful: "helpful DESC, created_at DESC" }[f.sort] || "created_at DESC";
  const rows = (await db(`SELECT id, store, source, product_id, product_handle, product_title, product_image, variant_title, rating, title, body, reviewer_name, verified, recommended, email, order_name, media, answers, status, reply, reply_by, reply_at, helpful, unhelpful, created_at, published_at, decided_by FROM rv_reviews ${w} ORDER BY ${order} LIMIT ${per + 1} OFFSET ${(page - 1) * per}`, args)).rows;
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
    res.type("application/javascript").send(`window.BZR=${JSON.stringify({ store: s, origin: PUBLIC_URL(), live: !!set.live[s], brand: STORES[s].name })};\n` + fs.readFileSync(path.join(__dirname, "public", "bz-reviews.js"), "utf8"));
  });
  app.get("/rv/:store/product/:pid", async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({ error: "unknown store" });
    try { res.setHeader("Cache-Control", "public, max-age=60"); res.json(await productReviews(s, String(req.params.pid).replace(/\D/g, ""), req.query)); } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get("/rv/:store/stars", async (req, res) => {
    cors(res); const s = storeOk(req.params.store); if (!s) return res.status(404).json({});
    try { res.setHeader("Cache-Control", "public, max-age=120"); res.json(await starsFor(s, String(req.query.ids || "").split(",").map((x) => x.replace(/\D/g, "")).filter(Boolean))); } catch (e) { res.status(500).json({ error: e.message }); }
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
    try { const j = await summaryFor(s, String(req.params.pid).replace(/\D/g, "")); res.setHeader("Cache-Control", j && j.summary ? "public, max-age=600" : "no-store"); res.json(j || {}); } catch (e) { res.setHeader("Cache-Control", "no-store"); res.json({}); }
  });

  // staff
  app.get("/api/reviews", async (req, res) => { if (!guard(req, res)) return; try { res.json(await list(req.query)); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.post("/api/reviews/:id/:action", async (req, res) => { if (!guard(req, res)) return; try { res.json(await decide(req.params.id, req.params.action, actorOf(req), (req.body || {}).text)); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } });
  app.post("/api/reviews-bulk", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; if (!["publish", "reject"].includes(b.action)) return res.status(400).json({ error: "publish or reject" }); res.json(await bulk(b.ids, b.action, actorOf(req))); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get("/api/reviews-products", async (req, res) => { if (!guard(req, res)) return; try { res.json(await products(req.query)); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get("/api/reviews-insights", async (req, res) => { if (!guard(req, res)) return; try { res.json(await insights(req.query)); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get("/api/reviews-groups", async (req, res) => { if (!guard(req, res)) return; try { res.json({ groups: await groups(req.query.store || null) }); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.post("/api/reviews-groups/sync", async (req, res) => { if (!guard(req, res)) return; try { const out = {}; for (const k of Object.keys(STORES)) out[k] = await syncGroups(k); AGG_CACHE.clear(); res.json({ ok: true, out }); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get("/api/reviews-settings", async (req, res) => { if (!guard(req, res)) return; res.json(await settings()); });
  app.post("/api/reviews-settings", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; const patch = {}; if (b.auto_publish_min) patch.auto_publish_min = Math.max(1, Math.min(5, Number(b.auto_publish_min))); if (b.live) patch.live = { lb: !!b.live.lb, lbo: !!b.live.lbo }; if (b.requests) patch.requests = { lb: !!b.requests.lb, lbo: !!b.requests.lbo }; res.json(await saveSettings(patch)); } catch (e) { res.status(500).json({ error: e.message }); } });
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
async function startJobs(syncGet, syncSet) {
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

module.exports = { runRequests, testRequest, writePage, migrate, routes, startJobs, importOkendo, syncGroups, productReviews, starsFor, submit, list, decide, settings, saveSettings, STORES };
