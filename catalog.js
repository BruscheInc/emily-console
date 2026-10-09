/* =============================================================================================
 *  Store knowledge for the chat's shopping assistant
 *
 *  Everything a shopper might ask about, pulled from Shopify and kept fresh:
 *    • every active product on the online store — description, fabric / features, price (and sale
 *      price), sizes and which are in stock, rating, and its size chart
 *    • size charts: the chart images (product metafield custom.sizing_chart) are read once by the AI
 *      and turned into text, so it can answer "what size for a 25 lb 18-month-old?"
 *    • the store's published pages (fabric story, shipping policy, …)
 *  Refreshed shortly after start and every 6 hours (or from Chat Studio). Searched per question so
 *  the chat only sends the AI the products and pages that matter.
 * ============================================================================================= */
const core = require("./core");
const { db } = core;
const R = () => require("./returns");
const K = () => require("./emily").claimsKit();

const PRODUCTS_Q = `query P($c: String) { products(first: 50, after: $c, query: "status:active") { pageInfo { hasNextPage endCursor } nodes {
  id title handle productType tags description onlineStoreUrl featuredMedia { preview { image { url } } }
  priceRangeV2 { minVariantPrice { amount } maxVariantPrice { amount } } compareAtPriceRange { maxVariantCompareAtPrice { amount } }
  options { name values } variants(first: 60) { nodes { title availableForSale price compareAtPrice selectedOptions { name value } } }
  chart: metafield(namespace: "custom", key: "sizing_chart") { reference { ... on MediaImage { image { url } } } }
  rating: metafield(namespace: "okendo", key: "summaryData") { value } } } }`;
const PAGES_Q = `query G($c: String) { pages(first: 50, after: $c) { pageInfo { hasNextPage endCursor } nodes { title handle body isPublished } } }`;
const SKIP_TYPES = /insurance|protection|gift ?wrap|shipping/i;
const INTERNAL_TAG = /^(LB|LBO|BB)\d*$|^SV\d+$|^PP$|^non returnable$|^protection /i;
const strip = (h) => String(h || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS hd_catalog (store TEXT PRIMARY KEY, data JSONB NOT NULL, refreshed_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE TABLE IF NOT EXISTS hd_size_charts (url TEXT PRIMARY KEY, text TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
}
const MEM = new Map();
async function get(store) {
  if (MEM.has(store)) return MEM.get(store);
  try { const r = (await db(`SELECT data, refreshed_at FROM hd_catalog WHERE store=$1`, [store])).rows[0]; if (r) { const v = { ...r.data, refreshed_at: r.refreshed_at }; index(v); MEM.set(store, v); return v; } } catch (_) {}
  return null;
}

async function gqlRetry(st, q, vars) {
  for (let i = 0; i < 5; i++) {
    try { return await R().gql(st, q, vars); }
    catch (e) { if (!/throttl/i.test(e.message) || i === 4) throw e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
}
// The size chart image → text, once per image (the AI reads the picture).
async function chartText(url) {
  if (!url) return null;
  const hit = (await db(`SELECT text FROM hd_size_charts WHERE url=$1`, [url])).rows[0];
  if (hit) return hit.text;
  const k = K(); if (!k.anthropic) return null;
  try {
    const res = await fetch(url); if (!res.ok) throw new Error("image " + res.status);
    const type = (res.headers.get("content-type") || "image/png").split(";")[0];
    if (!/^image\/(png|jpeg|gif|webp)$/.test(type)) throw new Error("not an image: " + type);
    const data = Buffer.from(await res.arrayBuffer()).toString("base64");
    const r = await k.anthropic.messages.create({ model: k.model, max_tokens: 1500, messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: type, data } },
      { type: "text", text: "This is a baby/kids clothing size chart. Transcribe it as compact plain text: one line per size with every measurement (height, weight, age, chest, etc. with units) exactly as shown, plus any notes. No commentary." }] }] });
    const text = (r.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim().slice(0, 3000);
    await db(`INSERT INTO hd_size_charts (url, text) VALUES ($1,$2) ON CONFLICT (url) DO UPDATE SET text=EXCLUDED.text`, [url, text]);
    return text;
  } catch (e) { console.error("size chart read:", e.message); return null; }
}

const running = new Set();
async function refresh(store) {
  if (running.has(store)) return { busy: true };
  running.add(store);
  try {
    const st = R().shopFor(store), def = R().STORE_DEFS[store];
    const products = []; let c = null;
    do {
      const d = await gqlRetry(st, PRODUCTS_Q, { c });
      for (const n of d.products.nodes) {
        if (!n.onlineStoreUrl || SKIP_TYPES.test(n.productType || "")) continue;
        const sizeOpt = (n.options || []).find((o) => /size/i.test(o.name)) || (n.options || [])[0];
        const vs = n.variants.nodes;
        const val = (v) => { const so = (v.selectedOptions || []).find((x) => sizeOpt && x.name === sizeOpt.name); return so ? so.value : v.title; };
        const inStock = [...new Set(vs.filter((v) => v.availableForSale).map(val))], out = [...new Set(vs.filter((v) => !v.availableForSale).map(val))].filter((x) => !inStock.includes(x));
        let rating = null; try { const j = JSON.parse((n.rating && n.rating.value) || "null"); if (j && j.reviewCount) rating = { avg: Number(j.reviewAverageValue), count: j.reviewCount }; } catch (_) {}
        const price = Number(n.priceRangeV2.minVariantPrice.amount), maxPrice = Number(n.priceRangeV2.maxVariantPrice.amount);
        const cmp = Number((n.compareAtPriceRange && n.compareAtPriceRange.maxVariantCompareAtPrice && n.compareAtPriceRange.maxVariantCompareAtPrice.amount) || 0);
        products.push({
          handle: n.handle, title: n.title, type: n.productType || "", tags: (n.tags || []).filter((t) => !INTERNAL_TAG.test(t)).slice(0, 15),
          url: `${def.shopUrl}/products/${n.handle}`, image: (n.featuredMedia && n.featuredMedia.preview && n.featuredMedia.preview.image && n.featuredMedia.preview.image.url) || null,
          price, max_price: maxPrice, compare_at: cmp > price ? cmp : null, on_sale: cmp > price,
          option: sizeOpt ? sizeOpt.name : null, sizes: sizeOpt ? sizeOpt.values : [], in_stock: inStock, sold_out: out, available: inStock.length > 0,
          rating, description: String(n.description || "").replace(/\s+/g, " ").slice(0, 1400),
          chart: (n.chart && n.chart.reference && n.chart.reference.image && n.chart.reference.image.url) || null,
        });
      }
      c = d.products.pageInfo.hasNextPage ? d.products.pageInfo.endCursor : null;
    } while (c);
    const pages = []; c = null;
    try {
      do {
        const d = await gqlRetry(st, PAGES_Q, { c });
        for (const p of d.pages.nodes) if (p.isPublished) { const text = strip(p.body); if (text.length > 40) pages.push({ title: p.title, handle: p.handle, url: `${def.shopUrl}/pages/${p.handle}`, text: text.slice(0, 6000) }); }
        c = d.pages.pageInfo.hasNextPage ? d.pages.pageInfo.endCursor : null;
      } while (c);
    } catch (e) { console.error(`catalog pages (${store}):`, e.message); }
    // Size charts: one read per distinct chart image.
    const charts = {};
    for (const url of [...new Set(products.map((p) => p.chart).filter(Boolean))].slice(0, 40)) { const t = await chartText(url); if (t) charts[url] = t; }
    const data = { products, pages, charts, counts: { products: products.length, pages: pages.length, charts: Object.keys(charts).length } };
    await db(`INSERT INTO hd_catalog (store, data, refreshed_at) VALUES ($1,$2,now()) ON CONFLICT (store) DO UPDATE SET data=EXCLUDED.data, refreshed_at=now()`, [store, JSON.stringify(data)]);
    const v = { ...data, refreshed_at: new Date().toISOString() }; index(v); MEM.set(store, v);
    console.log(`🛍️  Catalog ${store.toUpperCase()}: ${products.length} products · ${pages.length} pages · ${Object.keys(charts).length} size charts`);
    return { ok: true, ...data.counts };
  } catch (e) { console.error(`catalog refresh (${store}):`, e.message); return { error: e.message }; }
  finally { running.delete(store); }
}
async function refreshAll() { for (const k of Object.keys(R().STORE_DEFS)) await refresh(k); }
let timer = null;
async function init() {
  try { await migrate(); } catch (e) { console.error("catalog migrate:", e.message); }
  if (timer) return;
  setTimeout(() => refreshAll().catch(() => {}), 2 * 60e3);
  timer = setInterval(() => refreshAll().catch(() => {}), 6 * 3600e3);
}
async function status(store) { const v = await get(store); return v ? { ...v.counts, refreshed_at: v.refreshed_at, running: running.has(store) } : { products: 0, pages: 0, charts: 0, refreshed_at: null, running: running.has(store) }; }

/* ---------------- search ---------------- */
const STOP = new Set("a an the and or for to of in on at is are do does i my me we you your our with have has it this that what which how can any some there be by from as if about need want looking look get".split(" "));
const SYN = { pj: "pajama", pjs: "pajama", jammies: "pajama", pyjama: "pajama", sleeper: "zipper", onesie: "romper", bodysuit: "romper", swaddle: "swaddle", blanket: "blanket", sack: "sleep", bag: "sleep", hat: "beanie", bow: "bow", girl: "girl", boy: "boy", christmas: "holiday", xmas: "holiday", halloween: "halloween", newborn: "nb", preemie: "nb" };
const words = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((w) => w && !STOP.has(w)).map((w) => SYN[w] || (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));
function index(v) {
  for (const p of v.products || []) {
    p._t = new Set(words(p.title)); p._k = new Set(words(`${p.type} ${p.tags.join(" ")} ${p.sizes.join(" ")}`)); p._d = new Set(words(p.description));
  }
  for (const p of v.pages || []) { p._t = new Set(words(p.title)); p._d = new Set(words(p.text)); }
}
const SIZE_Q = /\b(size|sizing|fit|fits|big|small|tall|weigh|weight|lbs?|pounds|months?|mos?|years?|yrs?|inch|inches|cm|length|grow|tog)\b/i;
// Products and pages relevant to this question (plus the product the shopper is looking at).
async function search(store, text, { path = "", history = "" } = {}) {
  const v = await get(store); if (!v) return null;
  const q = words(`${text} ${history}`), qs = new Set(q);
  const score = (p) => { let s = 0; for (const w of qs) { if (p._t.has(w)) s += 5; if (p._k.has(w)) s += 3; if (p._d.has(w)) s += 1; } if (s && p.available) s += 1; return s; };
  const ranked = v.products.map((p) => [score(p), p]).filter(([s]) => s > 2).sort((a, b) => b[0] - a[0]);
  const m = String(path || "").match(/\/products\/([^/?#]+)/);
  const viewing = m ? v.products.find((p) => p.handle === decodeURIComponent(m[1])) : null;
  let picks = [...(viewing ? [viewing] : []), ...ranked.map(([, p]) => p).filter((p) => p !== viewing)].slice(0, 10);
  // Nothing specific (e.g. "help me find a gift"): offer the best-loved items that are in stock.
  const popular = !ranked.length;
  if (popular) picks = [...picks, ...v.products.filter((p) => p.available && p !== viewing).sort((a, b) => ((b.rating && b.rating.count) || 0) - ((a.rating && a.rating.count) || 0)).slice(0, 8)];
  const pages = v.pages.map((p) => { let s = 0; for (const w of qs) { if (p._t.has(w)) s += 4; if (p._d.has(w)) s += 1; } return [s, p]; }).filter(([s]) => s >= 2).sort((a, b) => b[0] - a[0]).slice(0, 2).map(([, p]) => p);
  const sizing = SIZE_Q.test(text) || !!viewing;
  const chartUrls = [...new Set(picks.map((p) => p.chart).filter(Boolean))].slice(0, sizing ? 3 : 0);
  const compact = (p, full) => ({ handle: p.handle, title: p.title, type: p.type, url: p.url, price: p.price, ...(p.max_price > p.price ? { max_price: p.max_price } : {}), ...(p.compare_at ? { was: p.compare_at } : {}),
    sizes_in_stock: p.in_stock, sold_out_sizes: p.sold_out, ...(p.rating ? { rating: `${p.rating.avg}/5 (${p.rating.count} reviews)` } : {}), tags: p.tags.slice(0, 8),
    description: full ? p.description : p.description.slice(0, 500), ...(p.chart && v.charts[p.chart] ? { size_chart: chartUrls.indexOf(p.chart) + 1 || undefined } : {}) });
  return {
    viewing: viewing ? viewing.handle : null, ...(popular ? { note: "No direct match — these are popular in-stock items; ask what they're looking for (age, size, occasion) if it helps." } : {}),
    products: picks.map((p, i) => compact(p, i < 3)),
    charts: chartUrls.map((u, i) => ({ id: i + 1, text: v.charts[u] })).filter((c) => c.text),
    pages: pages.map((p) => ({ title: p.title, url: p.url, text: p.text.slice(0, 1800) })),
    catalog: { products: v.products.length, types: [...new Set(v.products.map((p) => p.type).filter(Boolean))].slice(0, 40) },
  };
}
// Cards for the products the AI recommends (only ones it was shown).
async function cards(store, handles, allowed) {
  const v = await get(store); if (!v) return [];
  return (handles || []).filter((h) => allowed.has(h)).slice(0, 4).map((h) => v.products.find((p) => p.handle === h)).filter(Boolean)
    .map((p) => ({ handle: p.handle, title: p.title, url: p.url, image: p.image ? p.image + (p.image.includes("?") ? "&" : "?") + "width=300" : null, price: p.price, was: p.compare_at, in_stock: p.in_stock.slice(0, 8), available: p.available }));
}

module.exports = { init, refresh, refreshAll, status, search, cards, get };
