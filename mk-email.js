/* =============================================================================================
 *  Buzzin Marketing · email (Phase 2)
 *
 *  • Brand kits, one per store: logo, colors, fonts with safe fallbacks, buttons, footer, sender.
 *  • Templates built from blocks (heading, text, image, button, columns, products, coupon, countdown,
 *    divider, spacer, social, footer, HTML, saved block), each block optionally shown only to a segment
 *    or profile condition.
 *  • A renderer that turns blocks into email-safe HTML (tables + inline styles, 600px, dark-mode aware).
 *  • Personalization: {{ first_name | default: "there" }}, {{ coupon }}, {{ store_name }}, {{ unsubscribe_url }}…
 *    Klaviyo syntax in imported templates ({{ person.first_name|default:'' }}, {% unsubscribe %}) is translated.
 *  • Klaviyo's templates imported as editable HTML templates.
 *  • Image library, unsubscribe + preferences pages (one-click unsubscribe, RFC 8058).
 *  Sends go through mk-send.js, which holds everything until a sender is connected and turned on.
 * ============================================================================================= */
const crypto = require("crypto");
const express = require("express");
const core = require("./core");
const { db } = core;
const MK = () => require("./mk-core");
const SEND = () => require("./mk-send");

const SECRET = process.env.RETURNS_SECRET || process.env.CONSOLE_KEY || "buzzin-marketing";
const PUBLIC_URL = () => (process.env.PUBLIC_URL || "https://emily-console-production.up.railway.app").replace(/\/$/, "");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => crypto.randomBytes(5).toString("hex");

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS mk_brand (store TEXT PRIMARY KEY, data JSONB NOT NULL, updated_by TEXT, updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE TABLE IF NOT EXISTS mk_templates (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'email',
    subject TEXT, preview TEXT, blocks JSONB NOT NULL DEFAULT '[]', source TEXT, ext_id TEXT, archived BOOLEAN NOT NULL DEFAULT false,
    updated_by TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS mk_templates_ext ON mk_templates (store, source, ext_id) WHERE ext_id IS NOT NULL`);
  await db(`CREATE TABLE IF NOT EXISTS mk_saved_blocks (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, block JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE TABLE IF NOT EXISTS mk_images (id BIGSERIAL PRIMARY KEY, store TEXT, name TEXT, mime TEXT NOT NULL, bytes BYTEA NOT NULL, width INT, height INT, created_by TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
}

/* ---------------- brand kits ---------------- */
const BRAND_DEFAULTS = {
  lb: { name: "Larkspur Baby", logo: "/brand/larkspur-flower.svg", logo_width: 64, colors: { primary: "#242F3F", text: "#2B2A33", muted: "#6E6B76", ground: "#F6F5F2", panel: "#FFFFFF", link: "#242F3F", button_text: "#FFFFFF" },
        fonts: { heading: "Georgia, 'Times New Roman', serif", body: "Helvetica, Arial, sans-serif" }, button: { radius: 999, padding: "14px 28px" },
        sender: { from_name: "Larkspur Baby", from_local: "hello", domain: "mail.larkspurbaby.com", reply_to: "hello@larkspurbaby.com" },
        address: "", social: { instagram: "", facebook: "", tiktok: "", pinterest: "" }, shop_url: "https://larkspurbaby.com" },
  lbo: { name: "Larkspur Baby Outlet", logo: "/brand/larkspur-flower.svg", logo_width: 64, colors: { primary: "#242F3F", text: "#2B2A33", muted: "#6E6B76", ground: "#F6F5F2", panel: "#FFFFFF", link: "#242F3F", button_text: "#FFFFFF" },
        fonts: { heading: "Georgia, 'Times New Roman', serif", body: "Helvetica, Arial, sans-serif" }, button: { radius: 999, padding: "14px 28px" },
        sender: { from_name: "Larkspur Baby Outlet", from_local: "hello", domain: "mail.larkspurbabyoutlet.com", reply_to: "hello@larkspurbabyoutlet.com" },
        address: "", social: { instagram: "", facebook: "", tiktok: "", pinterest: "" }, shop_url: "https://larkspurbabyoutlet.com" },
};
const deepMerge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(a[k] || {}, v) : v; return o; };
async function brand(store) {
  const r = (await db(`SELECT data FROM mk_brand WHERE store=$1`, [store])).rows[0];
  return deepMerge(BRAND_DEFAULTS[store] || BRAND_DEFAULTS.lb, r ? r.data : {});
}
async function saveBrand(store, data, who) {
  const clean = deepMerge(await brand(store), data || {});
  await db(`INSERT INTO mk_brand (store, data, updated_by, updated_at) VALUES ($1,$2,$3,now()) ON CONFLICT (store) DO UPDATE SET data=EXCLUDED.data, updated_by=EXCLUDED.updated_by, updated_at=now()`, [store, JSON.stringify(clean), who || null]);
  return clean;
}

/* ---------------- personalization ---------------- */
const getPath = (obj, p) => String(p).split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
/** {{ a.b | default: "x" }} / {{ a|default:'x' }} / {{ a | upcase }} → value. Unknown → empty (or the default). */
function personalize(str, ctx, { html = true } = {}) {
  return String(str || "").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
    const parts = expr.split("|").map((x) => x.trim());
    let path = parts.shift().replace(/^person\./, "").replace(/^organization\.name$/, "store_name");
    let v = getPath(ctx, path);
    for (const f of parts) {
      const m = f.match(/^(\w+)\s*:?\s*(?:"([^"]*)"|'([^']*)'|(\S+))?/);
      if (!m) continue;
      const arg = m[2] ?? m[3] ?? m[4];
      if (m[1] === "default" && (v == null || v === "")) v = arg ?? "";
      else if (m[1] === "upcase" && v != null) v = String(v).toUpperCase();
      else if (m[1] === "downcase" && v != null) v = String(v).toLowerCase();
      else if (m[1] === "title" && v != null) v = String(v).replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (v == null) return "";
    return html && !/_url$|_html$/.test(path) ? esc(v) : String(v);
  });
}
/** Klaviyo template tags → Buzzin equivalents, done once at import. */
function fromKlaviyo(html) {
  return String(html || "")
    .replace(/\{%\s*unsubscribe(?:\s+['"]([^'"]*)['"])?\s*%\}/g, (_, t) => `<a href="{{ unsubscribe_url }}">${t || "Unsubscribe"}</a>`)
    .replace(/\{%\s*manage_preferences(?:\s+['"]([^'"]*)['"])?\s*%\}/g, (_, t) => `<a href="{{ preferences_url }}">${t || "Manage preferences"}</a>`)
    .replace(/\{%\s*web_view(?:\s+['"]([^'"]*)['"])?\s*%\}/g, (_, t) => `<a href="{{ web_url }}">${t || "View in browser"}</a>`)
    .replace(/\{\{\s*organization\.full_address\s*\}\}/g, "{{ store_address }}")
    .replace(/\{\{\s*organization\.name\s*\}\}/g, "{{ store_name }}")
    .replace(/\{%[\s\S]*?%\}/g, "");   // any other Klaviyo logic tag is dropped (noted on import)
}

/* ---------------- unsubscribe / preferences links ---------------- */
const sign = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("base64url").slice(0, 22);
const tokenFor = (profileId, store) => { const p = `${profileId}.${store}`; return `${Buffer.from(p).toString("base64url")}.${sign(p)}`; };
function readToken(t) { try { const [b, s] = String(t).split("."); const p = Buffer.from(b, "base64url").toString(); if (sign(p) !== s) return null; const [id, store] = p.split("."); return { id: Number(id), store }; } catch (_) { return null; } }

/* ---------------- products for product blocks ---------------- */
async function catalogProducts(store, { ids = [], handles = [], limit = 3, bestsellers = false } = {}) {
  let cat = null; try { cat = await require("./catalog").get(store); } catch (_) {}
  const all = (cat && cat.products) || [];
  let pick = handles.length ? handles.map((h) => all.find((p) => p.handle === h)).filter(Boolean) : all.filter((p) => ids.length && ids.includes(p.id));
  if (!pick.length && bestsellers) pick = all.filter((p) => p.available !== false && p.image).slice(0, limit);
  return pick.slice(0, limit).map((p) => ({ title: p.title, url: p.url || "", image: p.image ? p.image + (p.image.includes("?") ? "&" : "?") + "width=400" : "", price: p.price, compare_at: p.compare_at || null, handle: p.handle }));
}

/* ---------------- renderer ---------------- */
function btn(b, label, href, align) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align || "center"}" style="margin:0 auto"><tr><td style="border-radius:${b.button.radius}px;background:${b.colors.primary}">
    <a href="${esc(href || b.shop_url)}" style="display:inline-block;padding:${b.button.padding};font-family:${b.fonts.body};font-size:15px;font-weight:bold;color:${b.colors.button_text};text-decoration:none;border-radius:${b.button.radius}px">${label}</a></td></tr></table>`;
}
async function renderBlock(blk, b, ctx, store) {
  const p = blk.props || {};
  if (blk.show_if && !(await showIf(blk.show_if, ctx))) return "";
  const pad = (inner, extra = "") => `<tr><td style="padding:${p.padding || "12px 32px"};${extra}">${inner}</td></tr>`;
  const P = (s) => personalize(s, ctx);
  switch (blk.type) {
    case "logo": return pad(`<a href="${esc(b.shop_url)}"><img src="${esc(absUrl(b.logo))}" width="${Number(p.width || b.logo_width)}" alt="${esc(b.name)}" style="display:block;margin:0 auto;border:0;max-width:100%"></a>`, "text-align:center;padding-top:24px");
    case "heading": return pad(`<h${p.level || 1} style="margin:0;font-family:${b.fonts.heading};font-size:${Number(p.size || 28)}px;line-height:1.2;color:${p.color || b.colors.primary};text-align:${p.align || "center"};font-weight:${p.weight || "bold"}">${P(p.text)}</h${p.level || 1}>`);
    case "text": return pad(`<div style="font-family:${b.fonts.body};font-size:${Number(p.size || 16)}px;line-height:1.6;color:${p.color || b.colors.text};text-align:${p.align || "left"}">${personalize(sanitizeRich(p.html || ""), ctx)}</div>`);
    case "image": { const img = `<img src="${esc(absUrl(P(p.src)))}" alt="${esc(P(p.alt || ""))}" width="${Number(p.width || 536)}" style="display:block;width:100%;max-width:${Number(p.width || 536)}px;height:auto;border:0;margin:0 auto;border-radius:${Number(p.radius || 0)}px">`; return pad(p.href ? `<a href="${esc(P(p.href))}">${img}</a>` : img, `text-align:center;${p.full ? "padding:0" : ""}`); }
    case "button": return pad(btn(b, P(p.label || "Shop now"), P(p.href || b.shop_url), p.align), "text-align:center");
    case "divider": return pad(`<div style="border-top:1px solid ${p.color || "#E7E5E0"};font-size:0;line-height:0">&nbsp;</div>`);
    case "spacer": return `<tr><td style="height:${Number(p.height || 24)}px;font-size:0;line-height:0">&nbsp;</td></tr>`;
    case "coupon": return pad(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px dashed ${b.colors.primary};border-radius:12px"><tr><td style="padding:18px;text-align:center;font-family:${b.fonts.body}">
        <div style="font-size:13px;color:${b.colors.muted}">${P(p.label || "Your code")}</div>
        <div style="font-size:24px;font-weight:bold;letter-spacing:2px;color:${b.colors.primary};margin-top:4px">${P(p.code || "{{ coupon }}")}</div>
        ${p.note ? `<div style="font-size:13px;color:${b.colors.muted};margin-top:4px">${P(p.note)}</div>` : ""}</td></tr></table>`);
    case "countdown": { const until = p.until ? new Date(p.until) : null; const days = until ? Math.max(0, Math.ceil((until - Date.now()) / 864e5)) : null;
      return pad(`<div style="text-align:center;font-family:${b.fonts.body};font-size:18px;font-weight:bold;color:${b.colors.primary}">${days == null ? P(p.label || "") : days === 0 ? P(p.last_day || "Last day!") : `${P(p.label || "Ends in")} ${days} day${days === 1 ? "" : "s"}`}</div>`); }
    case "products": case "dynamic_products": {
      let items = [];
      if (blk.type === "dynamic_products") items = (ctx.items && ctx.items.length ? ctx.items : await catalogProducts(store, { bestsellers: true, limit: p.count || 3 })).slice(0, p.count || 3);
      else items = await catalogProducts(store, { ids: p.ids || [], handles: p.handles || [], limit: p.count || 3, bestsellers: !((p.ids || []).length || (p.handles || []).length) });
      if (!items.length) return "";
      const w = Math.floor(100 / Math.min(items.length, Number(p.per_row || 3)));
      const cell = (it) => `<td width="${w}%" valign="top" style="padding:6px;text-align:center;font-family:${b.fonts.body}">
          ${it.image ? `<a href="${esc(it.url)}"><img src="${esc(it.image)}" alt="${esc(it.title)}" width="160" style="display:block;width:100%;height:auto;border:0;border-radius:8px"></a>` : ""}
          <div style="font-size:14px;color:${b.colors.text};margin-top:8px">${esc(it.title)}</div>
          ${p.show_price !== false && it.price != null ? `<div style="font-size:14px;font-weight:bold;color:${b.colors.primary};margin-top:2px">$${Number(it.price).toFixed(2)}${it.compare_at && Number(it.compare_at) > Number(it.price) ? ` <s style="color:${b.colors.muted};font-weight:normal">$${Number(it.compare_at).toFixed(2)}</s>` : ""}</div>` : ""}</td>`;
      const rows = []; const per = Number(p.per_row || 3);
      for (let i = 0; i < items.length; i += per) rows.push(`<tr>${items.slice(i, i + per).map(cell).join("")}</tr>`);
      return pad(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`);
    }
    case "columns": {
      const cols = (p.cols || []).slice(0, 4); if (!cols.length) return "";
      const inner = [];
      for (const c of cols) { const parts = []; for (const cb of c.blocks || []) parts.push(await renderBlock(cb, b, ctx, store)); inner.push(`<td class="col" width="${Math.floor(100 / cols.length)}%" valign="top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${parts.join("")}</table></td>`); }
      return `<tr><td style="padding:0 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${inner.join("")}</tr></table></td></tr>`;
    }
    case "social": { const s = b.social || {}; const links = Object.entries(s).filter(([, v]) => v).map(([k, v]) => `<a href="${esc(v)}" style="color:${b.colors.muted};text-decoration:none;margin:0 8px;font-family:${b.fonts.body};font-size:13px">${k[0].toUpperCase() + k.slice(1)}</a>`).join(""); return links ? pad(`<div style="text-align:center">${links}</div>`) : ""; }
    case "footer": return footer(b, ctx, p);
    case "html": return `<tr><td style="padding:${p.padding || "0"}">${personalize(p.html || "", ctx, { html: false })}</td></tr>`;
    case "saved": { const sb = (await db(`SELECT block FROM mk_saved_blocks WHERE id=$1`, [Number(p.id)])).rows[0]; return sb ? renderBlock(sb.block, b, ctx, store) : ""; }
    default: return "";
  }
}
function footer(b, ctx, p = {}) {
  return `<tr><td style="padding:24px 32px;background:${b.colors.ground};text-align:center;font-family:${b.fonts.body};font-size:12px;line-height:1.6;color:${b.colors.muted}">
    ${p.text ? personalize(p.text, ctx) + "<br>" : ""}${esc(b.name)}${b.address ? " · " + esc(b.address) : " · [store postal address — add it in Brand kit]"}<br>
    <a href="${esc(ctx.unsubscribe_url || "#")}" style="color:${b.colors.muted}">Unsubscribe</a> · <a href="${esc(ctx.preferences_url || "#")}" style="color:${b.colors.muted}">Email preferences</a></td></tr>`;
}
const absUrl = (u) => (u && u.startsWith("/") ? PUBLIC_URL() + u : u || "");
/** Rich text from the editor: keep b/i/u/a/br/p/strong/em/span(style color)/ul/ol/li only. */
function sanitizeRich(h) {
  return String(h).replace(/<(script|style|iframe|object|embed)[\s\S]*?<\/\1>/gi, "").replace(/\son\w+="[^"]*"/gi, "").replace(/\son\w+='[^']*'/gi, "").replace(/javascript:/gi, "");
}
async function showIf(cond, ctx) {
  // { field: "orders_count", op: "gt", value: 0 } or { segment: id }
  try {
    if (cond.segment) { const S = require("./mk-segments"); return ctx.profile_id ? await S.isMember(cond.segment, ctx.profile_id) : true; }
    const v = getPath(ctx, cond.field);
    const x = cond.value;
    switch (cond.op) { case "eq": return String(v) === String(x); case "ne": return String(v) !== String(x); case "gt": return Number(v) > Number(x); case "lt": return Number(v) < Number(x);
      case "set": return v != null && v !== ""; case "unset": return v == null || v === ""; case "contains": return Array.isArray(v) ? v.map(String).includes(String(x)) : String(v || "").includes(String(x)); default: return true; }
  } catch (_) { return true; }
}

/** The context a template is filled with for one person. */
async function contextFor(store, profile, extra = {}) {
  const b = await brand(store);
  const tok = profile && profile.id ? tokenFor(profile.id, store) : "preview";
  return {
    first_name: profile && profile.first_name, last_name: profile && profile.last_name, email: profile && profile.email, phone: profile && profile.phone,
    profile_id: profile && profile.id, props: (profile && profile.props) || {}, orders_count: profile && profile.orders_count, total_spent: profile && profile.total_spent,
    last_sizes: profile && profile.props && profile.props.last_sizes, ...((profile && profile.props) || {}),
    store_name: b.name, store_address: b.address, shop_url: b.shop_url,
    unsubscribe_url: `${PUBLIC_URL()}/mk/u/${tok}`, preferences_url: `${PUBLIC_URL()}/mk/p/${tok}`, web_url: `${PUBLIC_URL()}/mk/u/${tok}`,
    coupon: extra.coupon || (profile && profile.props && profile.props.coupon) || "{{ coupon }}",
    ...extra,
  };
}

/** Blocks → { subject, preview, html, text }. A footer with unsubscribe is always added if the template has none. */
async function render(store, tpl, profile, extra = {}) {
  const b = await brand(store);
  const ctx = await contextFor(store, profile, extra);
  const blocks = Array.isArray(tpl.blocks) ? tpl.blocks : [];
  const parts = [];
  for (const blk of blocks) parts.push(await renderBlock(blk, b, ctx, store));
  const hasUnsub = blocks.some((x) => x.type === "footer" || (x.type === "html" && /unsubscribe_url/.test((x.props && x.props.html) || "")));
  if (!hasUnsub) parts.push(footer(b, ctx));
  const preview = personalize(tpl.preview || "", ctx);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${personalize(tpl.subject || "", ctx)}</title>
<style>body{margin:0;padding:0;background:${b.colors.ground}}img{border:0;outline:none}a{color:${b.colors.link}}
@media (max-width:620px){.wrap{width:100%!important}.col{display:block!important;width:100%!important}}
@media (prefers-color-scheme:dark){.panel{background:#1E1D24!important}.panel h1,.panel h2,.panel div{color:#EDEBF2!important}}</style></head>
<body style="margin:0;padding:0;background:${b.colors.ground}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preview}${"&#847; &zwnj; ".repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${b.colors.ground}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" class="wrap panel" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${b.colors.panel};border-radius:12px;overflow:hidden">
${parts.join("\n")}
</table></td></tr></table></body></html>`;
  const text = html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<br\s*\/?>/g, "\n").replace(/<\/(p|div|h\d|tr)>/g, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;|&#847;|&zwnj;/g, " ").replace(/&amp;/g, "&").replace(/\n\s*\n+/g, "\n\n").trim();
  return { subject: personalize(tpl.subject || "", ctx, { html: false }), preview, html, text };
}

/* ---------------- templates ---------------- */
async function listTemplates(store) {
  return (await db(`SELECT id, store, name, subject, preview, source, updated_at, jsonb_array_length(blocks) blocks FROM mk_templates WHERE NOT archived ${store ? "AND store=$1" : ""} ORDER BY updated_at DESC`, store ? [store] : [])).rows;
}
async function getTemplate(id) { return (await db(`SELECT * FROM mk_templates WHERE id=$1`, [Number(id)])).rows[0] || null; }
function cleanBlocks(blocks, depth = 0) {
  const OK = ["logo", "heading", "text", "image", "button", "divider", "spacer", "coupon", "countdown", "products", "dynamic_products", "columns", "social", "footer", "html", "saved"];
  return (Array.isArray(blocks) ? blocks : []).filter((x) => x && OK.includes(x.type)).slice(0, 80).map((x) => {
    const props = { ...(x.props || {}) };
    if (x.type === "columns" && depth < 1) props.cols = (props.cols || []).slice(0, 4).map((c) => ({ blocks: cleanBlocks(c.blocks, depth + 1) }));
    return { id: x.id || uid(), type: x.type, props, ...(x.show_if ? { show_if: x.show_if } : {}) };
  });
}
async function saveTemplate({ id, store, name, subject, preview, blocks }, who) {
  const b = cleanBlocks(blocks);
  if (id) return (await db(`UPDATE mk_templates SET name=COALESCE($2,name), subject=$3, preview=$4, blocks=$5, updated_by=$6, updated_at=now() WHERE id=$1 RETURNING *`, [Number(id), name || null, subject || "", preview || "", JSON.stringify(b), who || null])).rows[0];
  return (await db(`INSERT INTO mk_templates (store, name, subject, preview, blocks, source, updated_by) VALUES ($1,$2,$3,$4,$5,'buzzin',$6) RETURNING *`, [store, name || "Untitled email", subject || "", preview || "", JSON.stringify(b), who || null])).rows[0];
}
const STARTERS = {
  welcome: { name: "Welcome", subject: "Welcome to the family + 10% off", preview: "Your gift is inside", blocks: [
    { type: "logo" }, { type: "heading", props: { text: "Welcome to the family, {{ first_name | default: \"friend\" }}" } },
    { type: "text", props: { html: "<p>[Welcome message in your voice — Emily can draft it.]</p>", align: "center" } },
    { type: "coupon", props: { label: "Your welcome gift", note: "10% off your first order" } }, { type: "button", props: { label: "Shop now" } },
    { type: "products", props: { count: 3, per_row: 3 } }, { type: "social" }, { type: "footer" }] },
  abandoned_cart: { name: "Abandoned cart", subject: "You left something cozy behind", preview: "Your cart is saved", blocks: [
    { type: "logo" }, { type: "heading", props: { text: "Still thinking it over?" } }, { type: "text", props: { html: "<p>We saved your cart for you.</p>", align: "center" } },
    { type: "dynamic_products", props: { source: "cart", count: 3, per_row: 1 } }, { type: "button", props: { label: "Return to cart", href: "{{ checkout_url | default: shop_url }}" } }, { type: "footer" }] },
  thank_you: { name: "Thank you", subject: "Thank you for your first order", preview: "", blocks: [
    { type: "logo" }, { type: "heading", props: { text: "Thank you, {{ first_name | default: \"friend\" }}" } }, { type: "text", props: { html: "<p>[Thank-you note]</p>", align: "center" } }, { type: "footer" }] },
  size_up: { name: "Size-up reminder", subject: "The next size is ready", preview: "Little ones grow fast", blocks: [
    { type: "logo" }, { type: "heading", props: { text: "Growing so fast!" } }, { type: "text", props: { html: "<p>Last time you picked size {{ last_sizes | default: \"\" }}. Here's what comes next.</p>", align: "center" } },
    { type: "products", props: { count: 3, per_row: 3 } }, { type: "button", props: { label: "Shop the next size" } }, { type: "footer" }] },
  blank: { name: "Blank", subject: "", preview: "", blocks: [{ type: "logo" }, { type: "text", props: { html: "<p></p>" } }, { type: "footer" }] },
};

/** Klaviyo templates → editable HTML templates (once; re-runnable). */
async function importKlaviyoTemplates(store = "lb") {
  const rows = (await db(`SELECT id, name, data FROM hd_klaviyo WHERE kind='template'`).catch(() => ({ rows: [] }))).rows;
  // Subject and preview come from the flow messages that use each template.
  const msgs = {};
  for (const f of (await db(`SELECT data FROM hd_klaviyo WHERE kind='flow'`).catch(() => ({ rows: [] }))).rows) {
    for (const a of ((f.data && f.data.attributes && f.data.attributes.definition && f.data.attributes.definition.actions) || [])) {
      const m = a.data && a.data.message; if (m && m.template_id) msgs[m.template_id] = { subject: m.subject_line, preview: m.preview_text, name: m.name };
    }
  }
  let n = 0;
  for (const t of rows) {
    const html = t.data && t.data.attributes && t.data.attributes.html; if (!html) continue;
    const body = fromKlaviyo(html);
    const m = msgs[t.id] || {};
    await db(`INSERT INTO mk_templates (store, name, subject, preview, blocks, source, ext_id) VALUES ($1,$2,$3,$4,$5,'klaviyo',$6)
              ON CONFLICT (store, source, ext_id) WHERE ext_id IS NOT NULL DO UPDATE SET blocks=EXCLUDED.blocks, subject=EXCLUDED.subject, preview=EXCLUDED.preview`,
      [store, m.name ? `${m.name} (Klaviyo)` : `${t.name} (Klaviyo)`, m.subject || "", m.preview || "", JSON.stringify([{ id: uid(), type: "html", props: { html: body, padding: "0" } }]), t.id]);
    n++;
  }
  return n;
}

/* ---------------- Emily drafts copy ---------------- */
async function aiCopy({ store, kind, brief, current }) {
  const k = require("./emily").claimsKit();
  if (!k.anthropic) throw new Error("The AI isn't configured.");
  const b = await brand(store);
  const ask = {
    subject: "Write 5 email subject lines (under 50 characters each) and a matching preview text for each. Output JSON: {\"options\":[{\"subject\":\"\",\"preview\":\"\"}]}",
    body: "Write the body copy for this email as 2–4 short paragraphs of simple HTML (<p>, <strong>, <em> only). Output JSON: {\"options\":[{\"html\":\"\"}]} with 3 options.",
    sms: "Write 3 marketing text messages under 140 characters each, starting with the brand name and a colon. No emoji unless asked. Output JSON: {\"options\":[{\"body\":\"\"}]}",
    form: "Write 3 sign-up form headline + subline pairs. Output JSON: {\"options\":[{\"headline\":\"\",\"subline\":\"\"}]}",
  }[kind] || "Write 3 options. Output JSON {\"options\":[{\"text\":\"\"}]}";
  const sys = `You write marketing copy for ${b.name}, a baby clothing brand selling soft, premium bamboo pieces to parents (mostly moms). Voice: warm, honest, a little playful, never pushy, never cutesy baby-talk. Use only facts given in the brief; never invent discounts, dates, prices or claims. Return only the JSON asked for.`;
  const resp = await k.anthropic.messages.create({ model: k.model, max_tokens: 1200, system: sys, messages: [{ role: "user", content: `${ask}\n\nBrief: ${String(brief || "").slice(0, 2000)}${current ? `\n\nCurrent version: ${String(current).slice(0, 2000)}` : ""}` }] });
  const txt = (resp.content || []).map((c) => c.text || "").join("");
  const m = txt.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : txt); } catch (_) { return { options: [{ text: txt }] }; }
}

/* ---------------- unsubscribe / preferences pages ---------------- */
function page(title, body, b) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;background:${b.colors.ground};font-family:${b.fonts.body};color:${b.colors.text}}.c{max-width:460px;margin:10vh auto;background:#fff;border-radius:16px;padding:32px;text-align:center}
h1{font-family:${b.fonts.heading};color:${b.colors.primary};font-size:26px;margin:0 0 10px}button,.b{font:inherit;font-size:15px;font-weight:bold;border:0;border-radius:999px;padding:13px 24px;background:${b.colors.primary};color:#fff;cursor:pointer;margin:6px;min-height:44px}
.l{background:transparent;color:${b.colors.primary};border:1px solid ${b.colors.primary}}label{display:flex;gap:10px;align-items:center;text-align:left;margin:10px 0;min-height:32px}</style></head><body><div class="c">
<img src="${esc(absUrl(b.logo))}" alt="${esc(b.name)}" width="56" style="margin-bottom:12px">${body}</div></body></html>`;
}

function routes(app, { guard, admin, actorOf, fail, store }) {
  const raw = express.raw({ type: () => true, limit: "8mb" });
  app.get("/api/mk/brand/:store", async (req, res) => { if (!guard(req, res)) return; try { res.json(await brand(store(req.params.store) || "lb")); } catch (e) { fail(res, e); } });
  app.put("/api/mk/brand/:store", async (req, res) => { if (!admin(req, res)) return; try { const s = store(req.params.store); if (!s) return res.status(400).json({ error: "unknown store" }); res.json(await saveBrand(s, req.body || {}, actorOf(req))); } catch (e) { fail(res, e); } });
  app.get("/api/mk/templates", async (req, res) => { if (!guard(req, res)) return; try { res.json({ templates: await listTemplates(store(req.query.store)), starters: Object.entries(STARTERS).map(([k, v]) => ({ key: k, name: v.name })) }); } catch (e) { fail(res, e); } });
  app.get("/api/mk/templates/:id", async (req, res) => { if (!guard(req, res)) return; try { const t = await getTemplate(req.params.id); if (!t) return res.status(404).json({ error: "not found" }); res.json(t); } catch (e) { fail(res, e); } });
  app.post("/api/mk/templates", async (req, res) => {
    if (!guard(req, res)) return;
    try { const b = req.body || {}; const s = store(b.store); if (!s) return res.status(400).json({ error: "Pick a store first" });
      const st = b.starter && STARTERS[b.starter]; const src = b.copy_of ? await getTemplate(b.copy_of) : null;
      const base = src ? { name: `${src.name} (copy)`, subject: src.subject, preview: src.preview, blocks: src.blocks } : st ? JSON.parse(JSON.stringify(st)) : STARTERS.blank;
      res.json(await saveTemplate({ store: s, name: b.name || base.name, subject: base.subject, preview: base.preview, blocks: base.blocks }, actorOf(req))); } catch (e) { fail(res, e); }
  });
  app.put("/api/mk/templates/:id", async (req, res) => { if (!guard(req, res)) return; try { res.json(await saveTemplate({ ...(req.body || {}), id: req.params.id }, actorOf(req))); } catch (e) { fail(res, e); } });
  app.delete("/api/mk/templates/:id", async (req, res) => { if (!guard(req, res)) return; try { await db(`UPDATE mk_templates SET archived=true, updated_at=now() WHERE id=$1`, [Number(req.params.id)]); res.json({ ok: true }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/templates/render", async (req, res) => {
    if (!guard(req, res)) return;
    try { const b = req.body || {}; const s = store(b.store) || "lb";
      let prof = null; if (b.profile_id) prof = (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [Number(b.profile_id)])).rows[0];
      if (!prof) prof = { id: 0, first_name: "Maria", last_name: "Lopez", email: "maria@example.com", props: { last_sizes: ["3-6M"] }, orders_count: 1 };
      res.json(await render(s, { subject: b.subject, preview: b.preview, blocks: cleanBlocks(b.blocks) }, prof, { coupon: "WELCOME-8K2Q", ...(b.extra || {}) })); } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/templates/:id/test", async (req, res) => {
    if (!guard(req, res)) return;
    try { const t = await getTemplate(req.params.id); if (!t) return res.status(404).json({ error: "not found" });
      const to = String((req.body && req.body.to) || "").trim().toLowerCase(); if (!to) return res.status(400).json({ error: "Enter an address from the internal test list" });
      const r = await render(t.store, t, { id: 0, email: to, first_name: "Test" });
      const row = await SEND().send({ store: t.store, channel: "email", profile: { id: null, email: to, email_consent: "subscribed" }, msg: r, test: true, messageId: `tpl:${t.id}`, idem: `test:${t.id}:${to}:${Date.now()}` });
      res.json({ status: row.status, reason: row.reason }); } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/templates/import-klaviyo", async (req, res) => { if (!admin(req, res)) return; try { res.json({ imported: await importKlaviyoTemplates("lb") }); } catch (e) { fail(res, e); } });
  app.get("/api/mk/saved-blocks", async (req, res) => { if (!guard(req, res)) return; try { res.json({ blocks: (await db(`SELECT * FROM mk_saved_blocks ${store(req.query.store) ? "WHERE store=$1" : ""} ORDER BY name`, store(req.query.store) ? [req.query.store] : [])).rows }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/saved-blocks", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; const blk = cleanBlocks([b.block])[0]; if (!blk || !store(b.store)) return res.status(400).json({ error: "store and block required" }); res.json((await db(`INSERT INTO mk_saved_blocks (store, name, block) VALUES ($1,$2,$3) RETURNING *`, [b.store, String(b.name || "Saved block").slice(0, 80), JSON.stringify(blk)])).rows[0]); } catch (e) { fail(res, e); } });
  app.put("/api/mk/saved-blocks/:id", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; const blk = cleanBlocks([b.block])[0]; res.json((await db(`UPDATE mk_saved_blocks SET name=COALESCE($2,name), block=COALESCE($3,block), updated_at=now() WHERE id=$1 RETURNING *`, [Number(req.params.id), b.name || null, blk ? JSON.stringify(blk) : null])).rows[0]); } catch (e) { fail(res, e); } });
  app.post("/api/mk/ai/copy", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; res.json(await aiCopy({ store: store(b.store) || "lb", kind: b.kind, brief: b.brief, current: b.current })); } catch (e) { fail(res, e); } });

  /* images */
  app.post("/api/mk/images", raw, async (req, res) => {
    if (!guard(req, res)) return;
    try { const mime = String(req.headers["content-type"] || ""); if (!/^image\/(png|jpe?g|gif|webp|svg\+xml)$/.test(mime)) return res.status(400).json({ error: "PNG, JPG, GIF, WebP or SVG only" });
      if (!req.body || !req.body.length) return res.status(400).json({ error: "empty file" });
      const r = (await db(`INSERT INTO mk_images (store, name, mime, bytes, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, mime`, [store(req.query.store), String(req.query.name || "image").slice(0, 120), mime, req.body, actorOf(req)])).rows[0];
      res.json({ ...r, url: `/mk/img/${r.id}` }); } catch (e) { fail(res, e); }
  });
  app.get("/api/mk/images", async (req, res) => { if (!guard(req, res)) return; try { res.json({ images: (await db(`SELECT id, name, mime, created_at FROM mk_images ${store(req.query.store) ? "WHERE store=$1" : ""} ORDER BY id DESC LIMIT 200`, store(req.query.store) ? [req.query.store] : [])).rows.map((i) => ({ ...i, url: `/mk/img/${i.id}` })) }); } catch (e) { fail(res, e); } });
  app.get("/mk/img/:id", async (req, res) => {
    try { const r = (await db(`SELECT mime, bytes FROM mk_images WHERE id=$1`, [Number(String(req.params.id).replace(/\D/g, ""))])).rows[0]; if (!r) return res.status(404).send("Not found");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); if (/svg/.test(r.mime)) res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'"); res.type(r.mime).send(r.bytes); } catch (e) { res.status(500).send("Error"); }
  });

  /* unsubscribe (page + one-click POST per RFC 8058) and preferences */
  const unsub = async (t, channel = "email") => { const tk = readToken(t); if (!tk) return null; const p = (await db(`SELECT * FROM mk_profiles WHERE id=$1 AND store=$2`, [tk.id, tk.store])).rows[0]; if (!p) return null; await MK().setConsent(p, channel, "unsubscribed", { source: "unsubscribe_link" }); return p; };
  app.post("/mk/u/:t", express.urlencoded({ extended: false }), async (req, res) => { try { const p = await unsub(req.params.t); if (!p) return res.status(404).send("Link not valid"); const b = await brand(p.store); res.type("html").send(page("Unsubscribed", `<h1>You're unsubscribed</h1><p>You won't get marketing emails from ${esc(b.name)} anymore. Order and shipping emails still come as usual.</p>`, b)); } catch (e) { res.status(500).send("Error"); } });
  app.get("/mk/u/:t", async (req, res) => {
    try { const tk = readToken(req.params.t); if (!tk) return res.status(404).send("This link isn't valid."); const b = await brand(tk.store);
      res.type("html").send(page("Unsubscribe", `<h1>Unsubscribe?</h1><p>You'll stop getting marketing emails from ${esc(b.name)}.</p><form method="post"><button type="submit">Unsubscribe</button></form><p><a class="b l" href="/mk/p/${esc(req.params.t)}" style="display:inline-block;text-decoration:none">Get fewer emails instead</a></p>`, b)); } catch (e) { res.status(500).send("Error"); }
  });
  app.get("/mk/p/:t", async (req, res) => {
    try { const tk = readToken(req.params.t); if (!tk) return res.status(404).send("This link isn't valid."); const b = await brand(tk.store); const p = (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [tk.id])).rows[0]; if (!p) return res.status(404).send("Not found");
      const freq = (p.props && p.props.email_frequency) || "all";
      res.type("html").send(page("Email preferences", `<h1>Email preferences</h1><form method="post">
        <label><input type="radio" name="f" value="all" ${freq === "all" ? "checked" : ""}> Everything: new arrivals, sales and tips</label>
        <label><input type="radio" name="f" value="weekly" ${freq === "weekly" ? "checked" : ""}> At most one email a week</label>
        <label><input type="radio" name="f" value="sales" ${freq === "sales" ? "checked" : ""}> Only big sales</label>
        <label><input type="radio" name="f" value="none"> No marketing emails</label><button type="submit">Save</button></form>`, b)); } catch (e) { res.status(500).send("Error"); }
  });
  app.post("/mk/p/:t", express.urlencoded({ extended: false }), async (req, res) => {
    try { const tk = readToken(req.params.t); if (!tk) return res.status(404).send("Link not valid"); const b = await brand(tk.store); const f = String((req.body && req.body.f) || "all");
      if (f === "none") { await unsub(req.params.t); return res.type("html").send(page("Saved", `<h1>You're unsubscribed</h1><p>No more marketing emails from ${esc(b.name)}.</p>`, b)); }
      await db(`UPDATE mk_profiles SET props = props || jsonb_build_object('email_frequency', $2::text), updated_at=now() WHERE id=$1`, [tk.id, ["all", "weekly", "sales"].includes(f) ? f : "all"]);
      res.type("html").send(page("Saved", `<h1>Saved</h1><p>Thanks — we'll email you ${f === "weekly" ? "at most once a week" : f === "sales" ? "only for big sales" : "about everything"}.</p>`, b)); } catch (e) { res.status(500).send("Error"); }
  });
}

async function init() {
  await migrate();
  if (!(await core.syncGet("mk_klaviyo_templates_v1").catch(() => null))) {
    setTimeout(async () => { try { const n = await importKlaviyoTemplates("lb"); if (n) { await core.syncSet("mk_klaviyo_templates_v1", new Date().toISOString(), { n }); console.log(`✉️  Marketing: ${n} Klaviyo templates imported as editable HTML`); } } catch (e) { console.error("Klaviyo templates import:", e.message); } }, 60000);
  }
}

module.exports = { init, migrate, routes, brand, saveBrand, render, personalize, fromKlaviyo, getTemplate, saveTemplate, listTemplates, tokenFor, readToken, contextFor, cleanBlocks, STARTERS, importKlaviyoTemplates, aiCopy };
