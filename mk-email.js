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
const MKDoc = require("./public/mk-doc");

const SECRET = process.env.RETURNS_SECRET || process.env.CONSOLE_KEY || "buzzin-marketing";
const PUBLIC_URL = () => (process.env.PUBLIC_URL || "https://emily-console-production.up.railway.app").replace(/\/$/, "");
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => crypto.randomBytes(5).toString("hex");

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS mk_brand (store TEXT PRIMARY KEY, data JSONB NOT NULL, updated_by TEXT, updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE TABLE IF NOT EXISTS mk_templates (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'email',
    subject TEXT, preview TEXT, blocks JSONB NOT NULL DEFAULT '[]', source TEXT, ext_id TEXT, archived BOOLEAN NOT NULL DEFAULT false,
    updated_by TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`ALTER TABLE mk_templates ADD COLUMN IF NOT EXISTS doc JSONB`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS mk_templates_ext ON mk_templates (store, source, ext_id) WHERE ext_id IS NOT NULL`);
  await db(`CREATE TABLE IF NOT EXISTS mk_saved_blocks (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, name TEXT NOT NULL, block JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE TABLE IF NOT EXISTS mk_images (id BIGSERIAL PRIMARY KEY, store TEXT, name TEXT, mime TEXT NOT NULL, bytes BYTEA NOT NULL, width INT, height INT, created_by TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
}

/* ---------------- brand kits ---------------- */
const BRAND_DEFAULTS = {
  lb: { name: "Larkspur Baby", logo: "/brand/larkspur-flower.svg", logo_width: 64, colors: { primary: "#242F3F", text: "#2B2A33", muted: "#6E6B76", ground: "#F6F5F2", panel: "#FFFFFF", link: "#242F3F", button_text: "#FFFFFF" },
        fonts: { heading: "Georgia, 'Times New Roman', serif", body: "Helvetica, Arial, sans-serif" }, button: { radius: 999, padding: "14px 28px" },
        sender: { from_name: "Larkspur Baby", from_local: "hello", domain: "larkspurbaby.com", reply_to: "hello@larkspurbaby.com" },
        address: "", social: { instagram: "", facebook: "", tiktok: "", pinterest: "" }, shop_url: "https://larkspurbaby.com" },
  lbo: { name: "Larkspur Baby Outlet", logo: "/brand/larkspur-flower.svg", logo_width: 64, colors: { primary: "#242F3F", text: "#2B2A33", muted: "#6E6B76", ground: "#F6F5F2", panel: "#FFFFFF", link: "#242F3F", button_text: "#FFFFFF" },
        fonts: { heading: "Georgia, 'Times New Roman', serif", body: "Helvetica, Arial, sans-serif" }, button: { radius: 999, padding: "14px 28px" },
        sender: { from_name: "Larkspur Baby Outlet", from_local: "hello", domain: "larkspurbabyoutlet.com", reply_to: "hello@larkspurbabyoutlet.com" },
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
  return String(str || "").replace(/\{%\s*coupon_code[^%]*%\}/g, "{{ coupon }}").replace(/%7B%25\s*coupon_code.*?%25%7D/gi, "{{ coupon }}").replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expr) => {
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
    .replace(/\{%\s*coupon_code[^%]*%\}/g, "{{ coupon }}")   // Klaviyo's unique coupon tag → the person's own Buzzin code
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
const num = (v, d) => (v === "" || v == null || isNaN(Number(v)) ? d : Number(v));
const color = (v, d) => (/^#[0-9a-f]{3,8}$/i.test(String(v || "")) || /^rgba?\(/.test(String(v || "")) ? v : d);
const fontOf = (b, which) => (which === "heading" ? b.fonts.heading : which === "body" ? b.fonts.body : null);
function btn(b, label, href, align, p = {}) {
  const bg = color(p.btn_bg, b.colors.primary), fg = color(p.btn_color, b.colors.button_text), radius = num(p.btn_radius, b.button.radius), size = num(p.btn_size, 15);
  const full = !!p.btn_full;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align || "center"}" ${full ? 'width="100%"' : ""} style="margin:${align === "left" ? "0" : align === "right" ? "0 0 0 auto" : "0 auto"}"><tr><td align="center" style="border-radius:${radius}px;background:${bg}">
    <a href="${esc(href || b.shop_url)}" style="display:${full ? "block" : "inline-block"};padding:${b.button.padding};font-family:${b.fonts.body};font-size:${size}px;font-weight:bold;color:${fg};text-decoration:none;border-radius:${radius}px">${label}</a></td></tr></table>`;
}
const stars = (n, c) => `<span style="color:${c};font-size:18px;letter-spacing:2px">${"★".repeat(Math.max(0, Math.min(5, Math.round(n))))}${"☆".repeat(5 - Math.max(0, Math.min(5, Math.round(n))))}</span>`;
function youtubeThumb(u) { const m = String(u || "").match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : ""; }
async function renderBlock(blk, b, ctx, store) {
  const p = blk.props || {};
  if (blk.show_if && !(await showIf(blk.show_if, ctx))) return "";
  // Every block: background color and padding (top / sides / bottom) from the Style tab.
  const padStr = (dt = 12, dx = 32, db = 12) => p.padding && p.pt == null && p.pb == null && p.px == null ? p.padding : `${num(p.pt, dt)}px ${num(p.px, dx)}px ${num(p.pb, db)}px`;
  const bgCss = p.bg ? `background:${color(p.bg, "transparent")};` : "";
  const pad = (inner, extra = "", d = []) => `<tr><td style="padding:${padStr(...d)};${bgCss}${extra}">${inner}</td></tr>`;
  const P = (s) => personalize(s, ctx);
  const txtColor = color(p.color, b.colors.text);
  switch (blk.type) {
    case "logo": {
      const links = String(p.links || "").split("\n").map((l) => l.split("|").map((x) => x.trim())).filter((l) => l[0]);
      const nav = links.length ? `<div style="margin-top:12px;font-family:${b.fonts.body};font-size:13px">${links.map(([t, u]) => `<a href="${esc(P(u || b.shop_url))}" style="color:${color(p.color, b.colors.primary)};text-decoration:none;margin:0 10px">${esc(t)}</a>`).join("")}</div>` : "";
      return pad(`<a href="${esc(b.shop_url)}"><img src="${esc(absUrl(p.src || b.logo))}" width="${num(p.width, b.logo_width)}" alt="${esc(b.name)}" style="display:block;margin:0 auto;border:0;max-width:100%"></a>${nav}`, "text-align:center;", [24, 32, 12]);
    }
    case "header_bar": return `<tr><td style="padding:${num(p.pt, 10)}px ${num(p.px, 16)}px ${num(p.pb, 10)}px;background:${color(p.bg, b.colors.primary)};text-align:center;font-family:${b.fonts.body};font-size:${num(p.size, 14)}px;color:${color(p.color, "#FFFFFF")}">${p.href ? `<a href="${esc(P(p.href))}" style="color:${color(p.color, "#FFFFFF")};text-decoration:none">${P(p.text || "")}</a>` : P(p.text || "")}</td></tr>`;
    case "heading": { const lvl = Math.min(3, Math.max(1, num(p.level, 1))); return pad(`<h${lvl} style="margin:0;font-family:${fontOf(b, p.font) || b.fonts.heading};font-size:${num(p.size, 28)}px;line-height:${num(p.line, 1.2)};color:${color(p.color, b.colors.primary)};text-align:${p.align || "center"};font-weight:${p.weight || "bold"}">${P(p.text)}</h${lvl}>`); }
    case "text": return pad(`<div style="font-family:${fontOf(b, p.font) || b.fonts.body};font-size:${num(p.size, 16)}px;line-height:${num(p.line, 1.6)};color:${txtColor};text-align:${p.align || "left"}">${personalize(sanitizeRich(p.html || ""), ctx)}</div>`);
    case "image": { const w = num(p.width, 536); const full = !!p.full;
      const img = `<img src="${esc(absUrl(P(p.src)))}" alt="${esc(P(p.alt || ""))}" width="${full ? 600 : w}" style="display:block;width:100%;max-width:${full ? 600 : w}px;height:auto;border:0;margin:0 auto;border-radius:${num(p.radius, 0)}px">`;
      if (!p.src) return pad(`<div style="padding:40px 0;text-align:center;background:#F1EFEA;border-radius:8px;font-family:${b.fonts.body};font-size:13px;color:#8A8794">Image — pick one in the panel</div>`);
      return full ? `<tr><td style="padding:${num(p.pt, 0)}px 0 ${num(p.pb, 0)}px;${bgCss}text-align:center">${p.href ? `<a href="${esc(P(p.href))}">${img}</a>` : img}</td></tr>` : pad(p.href ? `<a href="${esc(P(p.href))}">${img}</a>` : img, "text-align:center;"); }
    case "button": return pad(btn(b, P(p.label || "Shop now"), P(p.href || b.shop_url), p.align, p), `text-align:${p.align || "center"};`);
    case "divider": return pad(`<table role="presentation" width="${num(p.width, 100)}%" align="center" cellpadding="0" cellspacing="0"><tr><td style="border-top:${num(p.thick, 1)}px ${p.style || "solid"} ${color(p.color, "#E7E5E0")};font-size:0;line-height:0">&nbsp;</td></tr></table>`);
    case "spacer": return `<tr><td style="height:${num(p.height, 24)}px;font-size:0;line-height:0;${bgCss}">&nbsp;</td></tr>`;
    case "coupon": return pad(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px dashed ${color(p.border, b.colors.primary)};border-radius:12px;background:${color(p.box_bg, "transparent")}"><tr><td style="padding:18px;text-align:center;font-family:${b.fonts.body}">
        <div style="font-size:13px;color:${b.colors.muted}">${P(p.label || "Your code")}</div>
        <div style="font-size:${num(p.size, 24)}px;font-weight:bold;letter-spacing:2px;color:${color(p.color, b.colors.primary)};margin-top:4px">${P(p.code || "{{ coupon }}")}</div>
        ${p.note ? `<div style="font-size:13px;color:${b.colors.muted};margin-top:4px">${P(p.note)}</div>` : ""}</td></tr></table>`);
    case "countdown": { const until = p.until ? new Date(p.until) : null; const days = until ? Math.max(0, Math.ceil((until - Date.now()) / 864e5)) : null;
      return pad(`<div style="text-align:center;font-family:${b.fonts.body};font-size:${num(p.size, 18)}px;font-weight:bold;color:${color(p.color, b.colors.primary)}">${days == null ? P(p.label || "") : days === 0 ? P(p.last_day || "Last day!") : `${P(p.label || "Ends in")} ${days} day${days === 1 ? "" : "s"}`}</div>`); }
    case "products": case "dynamic_products": {
      let items = [];
      if (blk.type === "dynamic_products") items = (ctx.items && ctx.items.length ? ctx.items : await catalogProducts(store, { bestsellers: true, limit: p.count || 3 })).slice(0, p.count || 3);
      else items = await catalogProducts(store, { ids: p.ids || [], handles: p.handles || [], limit: p.count || 3, bestsellers: !((p.ids || []).length || (p.handles || []).length) });
      if (!items.length) return "";
      const w = Math.floor(100 / Math.min(items.length, Number(p.per_row || 3)));
      const cell = (it) => `<td width="${w}%" valign="top" style="padding:6px;text-align:center;font-family:${b.fonts.body}">
          ${it.image ? `<a href="${esc(it.url)}"><img src="${esc(it.image)}" alt="${esc(it.title)}" width="160" style="display:block;width:100%;height:auto;border:0;border-radius:${num(p.radius, 8)}px"></a>` : ""}
          <div style="font-size:14px;color:${txtColor};margin-top:8px">${esc(it.title)}</div>
          ${p.show_price !== false && it.price != null ? `<div style="font-size:14px;font-weight:bold;color:${b.colors.primary};margin-top:2px">$${Number(it.price).toFixed(2)}${it.compare_at && Number(it.compare_at) > Number(it.price) ? ` <s style="color:${b.colors.muted};font-weight:normal">$${Number(it.compare_at).toFixed(2)}</s>` : ""}</div>` : ""}
          ${p.show_button ? `<div style="margin-top:8px">${btn(b, esc(p.button_label || "Shop"), it.url, "center", { ...p, btn_size: 13 })}</div>` : ""}</td>`;
      const rows = []; const per = Number(p.per_row || 3);
      for (let i = 0; i < items.length; i += per) rows.push(`<tr>${items.slice(i, i + per).map(cell).join("")}</tr>`);
      return pad(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`);
    }
    case "split": {
      // Image on one side, heading + text + button on the other. Stacks on phones.
      const right = p.side === "right";
      const img = p.src ? `<img src="${esc(absUrl(P(p.src)))}" alt="${esc(P(p.alt || ""))}" width="268" style="display:block;width:100%;max-width:268px;height:auto;border:0;border-radius:${num(p.radius, 0)}px">` : `<div style="padding:60px 0;text-align:center;background:#F1EFEA;border-radius:8px;font-family:${b.fonts.body};font-size:13px;color:#8A8794">Image</div>`;
      const imgCell = `<td class="col" width="50%" valign="middle" style="padding:8px">${p.href ? `<a href="${esc(P(p.href))}">${img}</a>` : img}</td>`;
      const txt = `<td class="col" width="50%" valign="middle" style="padding:8px 8px 8px ${right ? 8 : 16}px;font-family:${b.fonts.body};text-align:${p.align || "left"}">
        ${p.heading ? `<div style="font-family:${b.fonts.heading};font-size:${num(p.heading_size, 22)}px;font-weight:bold;line-height:1.25;color:${color(p.heading_color, b.colors.primary)};margin-bottom:8px">${P(p.heading)}</div>` : ""}
        ${p.html ? `<div style="font-size:${num(p.size, 15)}px;line-height:1.6;color:${txtColor}">${personalize(sanitizeRich(p.html), ctx)}</div>` : ""}
        ${p.button_label ? `<div style="margin-top:14px">${btn(b, P(p.button_label), P(p.button_href || b.shop_url), p.align === "center" ? "center" : "left", p)}</div>` : ""}</td>`;
      return pad(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${right ? txt + imgCell : imgCell + txt}</tr></table>`, "", [12, 24, 12]);
    }
    case "video": {
      const thumb = p.src || youtubeThumb(p.url);
      const inner = thumb ? `<a href="${esc(P(p.url || b.shop_url))}" style="display:block;position:relative;text-decoration:none"><img src="${esc(absUrl(thumb))}" alt="${esc(p.alt || "Play video")}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;margin:0 auto;border-radius:${num(p.radius, 8)}px"></a>
        <div style="margin-top:8px;text-align:center"><a href="${esc(P(p.url || b.shop_url))}" style="font-family:${b.fonts.body};font-size:14px;font-weight:bold;color:${b.colors.primary};text-decoration:none">▶ ${esc(p.label || "Watch the video")}</a></div>`
        : `<div style="padding:50px 0;text-align:center;background:#1E1D24;border-radius:8px;font-family:${b.fonts.body};font-size:13px;color:#fff">▶ Video — paste a YouTube or Vimeo link</div>`;
      return pad(inner, "text-align:center;");
    }
    case "table": {
      const rows = String(p.rows || "").split("\n").filter((l) => l.trim()).map((l) => l.split("|").map((c) => c.trim()));
      if (!rows.length) return pad(`<div style="padding:20px;text-align:center;color:#8A8794;font:13px ${b.fonts.body}">Table — add rows in the panel</div>`);
      const head = p.header !== false;
      const trs = rows.map((r, i) => `<tr>${r.map((c) => `<td style="padding:8px 10px;border-bottom:1px solid ${color(p.line, "#E7E5E0")};font-family:${b.fonts.body};font-size:${num(p.size, 14)}px;color:${txtColor};${head && i === 0 ? `font-weight:bold;background:${color(p.head_bg, "#F6F5F2")};` : ""}">${P(c)}</td>`).join("")}</tr>`).join("");
      return pad(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${trs}</table>`);
    }
    case "review": return pad(`<div style="text-align:${p.align || "center"};font-family:${b.fonts.body}">${stars(num(p.stars, 5), color(p.star_color, "#E8B931"))}
        <div style="font-family:${b.fonts.heading};font-size:${num(p.size, 18)}px;line-height:1.5;color:${txtColor};margin-top:8px;font-style:italic">“${P(p.quote || "")}”</div>
        ${p.name ? `<div style="font-size:13px;color:${b.colors.muted};margin-top:8px">— ${P(p.name)}${p.verified !== false ? " · Verified buyer" : ""}</div>` : ""}</div>`);
    case "columns": {
      const cols = (p.cols || []).slice(0, 4); if (!cols.length) return "";
      const inner = [];
      for (const c of cols) { const parts = []; for (const cb of c.blocks || []) parts.push(await renderBlock(cb, b, ctx, store)); inner.push(`<td class="col" width="${Math.floor(100 / cols.length)}%" valign="top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${parts.join("")}</table></td>`); }
      return `<tr><td style="padding:${num(p.pt, 0)}px 16px ${num(p.pb, 0)}px;${bgCss}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${inner.join("")}</tr></table></td></tr>`;
    }
    case "social": { const s = b.social || {}; const links = Object.entries(s).filter(([, v]) => v).map(([k, v]) => `<a href="${esc(v)}" style="color:${color(p.color, b.colors.muted)};text-decoration:none;margin:0 8px;font-family:${b.fonts.body};font-size:13px">${k[0].toUpperCase() + k.slice(1)}</a>`).join(""); return links ? pad(`<div style="text-align:center">${links}</div>`) : ""; }
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
const BASE = (store) => { try { const d = require("./returns").STORE_DEFS[store]; if (d && d.host) return `https://${d.host}`; } catch (_) {} return PUBLIC_URL(); };   // the store's own domain
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
    unsubscribe_url: `${BASE(store)}/mk/u/${tok}`, preferences_url: `${BASE(store)}/mk/p/${tok}`, web_url: `${BASE(store)}/mk/u/${tok}`,
    coupon: extra.coupon || (profile && profile.props && profile.props.coupon) || require("./mk-coupons").sample(),   // previews and tests show a sample code
    ...extra,
  };
}

/* ---------------- Klaviyo-format documents (sections → rows → columns → blocks) ---------------- */
/** Show/hide logic. Klaviyo-style code ("person|lookup:'X' == 'y' and not event.extra.y") or our builder JSON. Unknown → shown. */
function evalCheck(expr, scope) {
  const src = String(expr || "").trim(); if (!src) return true;
  const toks = []; const re = /\s*(?:(\d+(?:\.\d+)?)|'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|(==|!=|>=|<=|>|<|\(|\)|\|)|([A-Za-z_][\w.]*)|(:))/y;
  let m; re.lastIndex = 0;
  while (re.lastIndex < src.length) { const at = re.lastIndex; m = re.exec(src); if (!m || re.lastIndex === at) throw new Error("bad expression"); if (m[1]) toks.push({ t: "v", v: Number(m[1]) }); else if (m[2] != null || m[3] != null) toks.push({ t: "v", v: (m[2] ?? m[3]).replace(/\\(.)/g, "$1") }); else if (m[4]) toks.push({ t: "op", v: m[4] }); else if (m[5]) toks.push({ t: "id", v: m[5] }); else if (m[6]) toks.push({ t: "op", v: ":" }); if (/^\s*$/.test(src.slice(re.lastIndex))) break; }
  let i = 0; const peek = () => toks[i], next = () => toks[i++];
  const lookup = (path) => { if (path === "True" || path === "true") return true; if (path === "False" || path === "false") return false; if (path === "None" || path === "null") return null;
    const parts = path.split("."); let o = scope; for (const k of parts) { if (o == null) return undefined; o = o[k]; } return o; };
  const primary = () => {
    const t = next(); if (!t) throw new Error("end");
    let v;
    if (t.t === "op" && t.v === "(") { v = or(); next(); }
    else if (t.t === "v") v = t.v; else if (t.t === "id") v = lookup(t.v); else throw new Error("unexpected " + t.v);
    while (peek() && peek().t === "op" && peek().v === "|") { next(); const f = next(); let arg; if (peek() && peek().v === ":") { next(); const a = next(); arg = a.t === "v" ? a.v : lookup(a.v); }
      const fn = f && f.v; if (fn === "lookup") v = v == null ? undefined : (v[arg] ?? (v.props || {})[arg]); else if (fn === "default") v = v == null || v === "" ? arg : v; else if (fn === "length") v = v == null ? 0 : v.length; else if (fn === "lower") v = String(v ?? "").toLowerCase(); else if (fn === "upper") v = String(v ?? "").toUpperCase(); }
    return v;
  };
  const cmp = () => { let a = primary(); const t = peek();
    if (t && t.t === "op" && ["==", "!=", ">", "<", ">=", "<="].includes(t.v)) { next(); const b = primary();
      switch (t.v) { case "==": return a == b || String(a ?? "") === String(b ?? ""); case "!=": return !(a == b || String(a ?? "") === String(b ?? "")); case ">": return Number(a) > Number(b); case "<": return Number(a) < Number(b); case ">=": return Number(a) >= Number(b); default: return Number(a) <= Number(b); } }
    if (t && t.t === "id" && (t.v === "in" || (t.v === "not" && toks[i + 1] && toks[i + 1].v === "in"))) { const neg = t.v === "not"; next(); if (neg) next(); const b = primary(); const has = Array.isArray(b) ? b.map(String).includes(String(a)) : String(b ?? "").includes(String(a ?? "")); return neg ? !has : has; }
    return a; };
  const not = () => { const t = peek(); if (t && t.t === "id" && t.v === "not") { next(); return !not(); } return cmp(); };
  const and = () => { let v = not(); while (peek() && peek().t === "id" && peek().v === "and") { next(); const b = not(); v = !!v && !!b; } return v; };
  const or = () => { let v = and(); while (peek() && peek().t === "id" && peek().v === "or") { next(); const b = and(); v = !!v || !!b; } return v; };
  return !!or();
}
function ruleOk(r, scope) {
  const path = String(r.field || "").replace(/^person\./, "");
  const v = getPath(scope.person || {}, path) ?? getPath(scope, path); const x = r.value;
  switch (r.op) { case "eq": return String(v ?? "") === String(x ?? ""); case "ne": return String(v ?? "") !== String(x ?? ""); case "gt": return Number(v) > Number(x); case "lt": return Number(v) < Number(x);
    case "set": return v != null && v !== ""; case "unset": return v == null || v === ""; case "contains": return Array.isArray(v) ? v.map(String).includes(String(x)) : String(v ?? "").toLowerCase().includes(String(x ?? "").toLowerCase());
    case "not_contains": return !(Array.isArray(v) ? v.map(String).includes(String(x)) : String(v ?? "").toLowerCase().includes(String(x ?? "").toLowerCase())); default: return true; }
}
function visibleFor(vis, scope) {
  try {
    if (vis.check && String(vis.check).trim()) return evalCheck(vis.check, scope);
    if (vis.definition) { const d = typeof vis.definition === "string" ? JSON.parse(vis.definition) : vis.definition; const rules = Array.isArray(d) ? d : d.rules || []; if (!rules.length) return true; const show = (Array.isArray(d) || d.match !== "any") ? rules.every((r) => ruleOk(r, scope)) : rules.some((r) => ruleOk(r, scope)); return d.action === "hide" ? !show : show; }
  } catch (_) { return true; }
  return true;
}
/** Products for every product block, looked up before the (synchronous) render. */
async function productsForDoc(store, doc, ctx) {
  const out = {}; let cat = null; try { cat = await require("./catalog").get(store); } catch (_) {}
  const all = (cat && cat.products) || [];
  const shape = (p) => ({ title: p.title, url: p.url || "", image: p.image ? p.image + (p.image.includes("?") ? "&" : "?") + "width=600" : "", price: p.price, compare_at: p.compare_at || null, handle: p.handle, description: p.description || "" });
  const blocks = []; MKDoc.walk(doc, (n, kind) => { if (kind === "block" && n.type === "product") blocks.push(n); });
  for (const blk of blocks) {
    const p = (blk.data && blk.data.properties) || {}; const st = (blk.data && blk.data.styles) || {};
    const want = Math.max(1, Math.min(24, (Number(st.num_columns) || 3) * (Number(st.num_rows) || 1)));
    let items = [];
    if (!p.dynamic) items = (p.items || []).map((it) => { if (it.handle) { const c = all.find((x) => x.handle === it.handle); return c ? { ...shape(c), button_text: it.button_text } : null; } return it.title || it.image ? it : null; }).filter(Boolean);
    else {
      const src = p.feed || "bestsellers";
      if (["cart", "viewed", "bought", "recommended"].includes(src) && ctx.items && ctx.items.length) items = ctx.items.map((x) => ({ title: x.title || x.product_title || x.name, url: x.url || x.product_url || "", image: x.image || x.image_url || "", price: x.price != null ? String(x.price) : "" }));
      if (!items.length) items = all.filter((x) => x.available !== false && x.image).slice(0, want).map(shape);
    }
    out[blk.id] = items.slice(0, want);
  }
  return out;
}
/** Universal content: blocks/sections saved for reuse show their latest saved version everywhere they're used. */
async function withUniversal(doc) {
  const ids = new Set(); MKDoc.walk(doc, (n) => { if (n && n.universal_id && /^\d+$/.test(String(n.universal_id))) ids.add(Number(n.universal_id)); });
  if (!ids.size) return doc;
  const rows = (await db(`SELECT id, block FROM mk_saved_blocks WHERE id = ANY($1::bigint[])`, [[...ids]])).rows;
  const by = Object.fromEntries(rows.map((r) => [String(r.id), r.block]));
  const d = MKDoc.clone(doc);
  MKDoc.walk(d, (n) => { const u = n && n.universal_id && by[String(n.universal_id)]; if (!u || !u.data) return; n.data = MKDoc.clone(u.data); if (u.subblocks) n.subblocks = MKDoc.clone(u.subblocks); if (u.rows) n.rows = MKDoc.clone(u.rows); });
  return d;
}
async function renderDocument(store, tpl, profile, extra = {}, opts = {}) {
  const b = await brand(store);
  const ctx = await contextFor(store, profile, extra);
  const doc = await withUniversal(typeof tpl.doc === "string" ? JSON.parse(tpl.doc) : tpl.doc);
  const prods = await productsForDoc(store, doc, ctx);
  const person = { ...((profile && profile.props) || {}), first_name: ctx.first_name, last_name: ctx.last_name, email: ctx.email, phone_number: ctx.phone, orders_count: ctx.orders_count, total_spent: ctx.total_spent, last_sizes: ctx.last_sizes, props: (profile && profile.props) || {} };
  const base = { ...ctx, person, event: extra.event || { extra: { line_items: ctx.items || [] }, items: ctx.items || [] } };
  const brandAbs = { ...b, logo_abs: absUrl(b.logo) };
  const out = MKDoc.render(doc, {
    brand: brandAbs, editor: !!opts.editor, assetBase: PUBLIC_URL(),
    text: (s, scope) => personalize(s, scope && Object.keys(scope).length ? { ...ctx, ...scope } : ctx),
    visible: (vis, scope) => visibleFor(vis, { ...base, ...(scope || {}) }),
    repeat: (path, scope) => { const v = getPath({ ...base, ...(scope || {}) }, String(path).replace(/^person\./, "person.")); return Array.isArray(v) ? v : []; },
    products: (blk) => prods[blk.id] || [],
    footer: ({ hasUnsubscribe }) => (hasUnsubscribe ? "" : footer(b, ctx)),
  });
  const preview = personalize(tpl.preview || "", ctx);
  const html = `<!doctype html><html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="x-apple-disable-message-reformatting"><meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<title>${personalize(tpl.subject || "", ctx)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>${out.head}</style></head>
<body style="margin:0;padding:0;background:${out.background}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${preview}${"&#847; &zwnj; ".repeat(30)}</div>
${out.body}
</body></html>`;
  const text = html.replace(/<head[\s\S]*?<\/head>/, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<br\s*\/?>/g, "\n").replace(/<\/(p|div|h\d|tr|li)>/g, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;|&#847;|&zwnj;/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  return { subject: personalize(tpl.subject || "", ctx, { html: false }), preview, html, text, unsubscribe_url: profile && profile.id ? ctx.unsubscribe_url : null };
}

/** Blocks → { subject, preview, html, text }. A footer with unsubscribe is always added if the template has none. */
async function render(store, tpl, profile, extra = {}, opts = {}) {
  if (tpl && tpl.doc) return renderDocument(store, tpl, profile, extra, opts);
  const b = await brand(store);
  const ctx = await contextFor(store, profile, extra);
  const blocks = Array.isArray(tpl.blocks) ? tpl.blocks : [];
  const parts = [];
  for (const blk of blocks) {
    let h = await renderBlock(blk, b, ctx, store);
    // Editor preview: every block gets a marker so it can be clicked, dragged and dropped around; empty ones get a placeholder.
    if (opts.editor) {
      if (!h.trim()) h = `<tr><td style="padding:14px 32px;text-align:center;font:13px Helvetica,Arial,sans-serif;color:#8A8794;border:1px dashed #D9D6CF">${esc(blk.type === "products" || blk.type === "dynamic_products" ? "Products — none to show in the preview" : blk.show_if ? "Hidden for the preview person (Show only to…)" : blk.type === "social" ? "Social links — add them in Brand kit" : blk.type)}</td></tr>`;
      h = h.replace(/^\s*<tr/, `<tr data-bid="${esc(blk.id || "")}"`);
    }
    parts.push(h);
  }
  const hasUnsub = blocks.some((x) => x.type === "footer" || (x.type === "html" && /unsubscribe_url/.test((x.props && x.props.html) || "")));
  if (!hasUnsub) parts.push(footer(b, ctx).replace(/^\s*<tr/, opts.editor ? '<tr data-auto="footer"' : "<tr"));
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
  return { subject: personalize(tpl.subject || "", ctx, { html: false }), preview, html, text, unsubscribe_url: profile && profile.id ? ctx.unsubscribe_url : null };
}

/* ---------------- templates ---------------- */
async function listTemplates(store) {
  return (await db(`SELECT id, store, name, subject, preview, source, updated_at, jsonb_array_length(blocks) blocks, (doc IS NOT NULL) has_doc, (doc IS NOT NULL AND doc::text NOT LIKE '%"type": "html"%' AND doc::text NOT LIKE '%"type":"html"%') all_blocks FROM mk_templates WHERE NOT archived ${store ? "AND store=$1" : ""} ORDER BY updated_at DESC`, store ? [store] : [])).rows;
}
async function getTemplate(id) { return (await db(`SELECT * FROM mk_templates WHERE id=$1`, [Number(id)])).rows[0] || null; }
function cleanBlocks(blocks, depth = 0) {
  const OK = ["logo", "header_bar", "heading", "text", "image", "button", "divider", "spacer", "coupon", "countdown", "products", "dynamic_products", "split", "video", "table", "review", "columns", "social", "footer", "html", "saved"];
  return (Array.isArray(blocks) ? blocks : []).filter((x) => x && OK.includes(x.type)).slice(0, 80).map((x) => {
    const props = { ...(x.props || {}) };
    if (x.type === "columns" && depth < 1) props.cols = (props.cols || []).slice(0, 4).map((c) => ({ blocks: cleanBlocks(c.blocks, depth + 1) }));
    return { id: x.id || uid(), type: x.type, props, ...(x.show_if ? { show_if: x.show_if } : {}) };
  });
}
/** Strip scripts and inline event handlers from every string in a document. */
function cleanStrings(x) {
  const clean = (v) => (typeof v === "string" ? v.replace(/<(script|iframe|object|embed)[\s\S]*?<\/\1>/gi, "").replace(/<(script|iframe|object|embed)\b[^>]*>/gi, "").replace(/\son\w+\s*=\s*"[^"]*"/gi, "").replace(/\son\w+\s*=\s*'[^']*'/gi, "").replace(/javascript:/gi, "") : Array.isArray(v) ? v.map(clean) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v);
  return clean(x);
}
function cleanDoc(doc) {
  if (!doc || typeof doc !== "object" || !doc.body) return null;
  const out = cleanStrings(doc);
  if (JSON.stringify(out).length > 2_000_000) throw new Error("This email is too big to save (over 2 MB).");
  return out;
}
async function saveTemplate({ id, store, name, subject, preview, blocks, doc }, who) {
  const b = cleanBlocks(blocks || []);
  const d = doc ? cleanDoc(doc) : null;
  if (id) return (await db(`UPDATE mk_templates SET name=COALESCE($2,name), subject=$3, preview=$4, blocks=CASE WHEN $7::boolean THEN blocks ELSE $5 END, doc=COALESCE($8::jsonb, doc), updated_by=$6, updated_at=now() WHERE id=$1 RETURNING *`, [Number(id), name || null, subject || "", preview || "", JSON.stringify(b), who || null, !!d && !(blocks || []).length, d ? JSON.stringify(d) : null])).rows[0];
  return (await db(`INSERT INTO mk_templates (store, name, subject, preview, blocks, doc, source, updated_by) VALUES ($1,$2,$3,$4,$5,$6,'buzzin',$7) RETURNING *`, [store, name || "Untitled email", subject || "", preview || "", JSON.stringify(b), d ? JSON.stringify(d) : null, who || null])).rows[0];
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
async function importKlaviyoTemplates(store = "lb", opts = {}) {
  const rows = (await db(`SELECT id, name, data FROM hd_klaviyo WHERE kind='template'`).catch(() => ({ rows: [] }))).rows;
  // Subject and preview come from the flow messages that use each template.
  const msgs = {};
  for (const f of (await db(`SELECT data FROM hd_klaviyo WHERE kind='flow'`).catch(() => ({ rows: [] }))).rows) {
    for (const a of ((f.data && f.data.attributes && f.data.attributes.definition && f.data.attributes.definition.actions) || [])) {
      const m = a.data && a.data.message; if (m && m.template_id) msgs[m.template_id] = { subject: m.subject_line, preview: m.preview_text, name: m.name };
    }
  }
  let n = 0, layouts = 0;
  const br = await brand(store);
  for (const t of rows) {
    if (opts.only && !opts.only.includes(t.id)) continue;
    const a = (t.data && t.data.attributes) || {};
    const html = a.html; const def = a.definition;
    if (!html && !def) continue;
    let doc = null;
    if (def && def.body) { try { doc = MKDoc.fromKlaviyo(def, fromKlaviyo); layouts++; } catch (e) { console.error(`Klaviyo template ${t.id} layout:`, e.message); } }
    if (!doc) doc = MKDoc.fromBlocks([{ type: "html", props: { html: fromKlaviyo(html) } }], { ...br, logo_abs: absUrl(br.logo) });
    const m = msgs[t.id] || {};
    await db(`INSERT INTO mk_templates (store, name, subject, preview, blocks, doc, source, ext_id) VALUES ($1,$2,$3,$4,$5,$6,'klaviyo',$7)
              ON CONFLICT (store, source, ext_id) WHERE ext_id IS NOT NULL DO UPDATE SET subject=EXCLUDED.subject, preview=EXCLUDED.preview,
                doc=CASE WHEN mk_templates.doc IS NULL OR $8::boolean THEN EXCLUDED.doc ELSE mk_templates.doc END, updated_at=now()`,
      [store, m.name ? `${m.name} (Klaviyo)` : `${t.name} (Klaviyo)`, m.subject || "", m.preview || "", JSON.stringify(html ? [{ id: uid(), type: "html", props: { html: fromKlaviyo(html), padding: "0" } }] : []), JSON.stringify(doc), t.id, !!(opts && opts.overwrite)]);
    n++;
  }
  return opts && opts.detail ? { imported: n, with_layout: layouts } : n;
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
    button: "Write 5 button labels, 2–4 words each, clear about what happens on click. Output JSON: {\"options\":[{\"text\":\"\"}]}",
    heading: "Write 5 short email headlines (under 8 words each). Output JSON: {\"options\":[{\"text\":\"\"}]}",
    alt: "Write 3 short image descriptions (alt text, under 15 words) for the image described. Output JSON: {\"options\":[{\"text\":\"\"}]}",
    form: "Write 3 sign-up form headline + subline pairs. Output JSON: {\"options\":[{\"headline\":\"\",\"subline\":\"\"}]}",
  }[kind] || "Write 3 options. Output JSON {\"options\":[{\"text\":\"\"}]}";
  const sys = `You write marketing copy for ${b.name}, a baby clothing brand selling soft, premium bamboo pieces to parents (mostly moms). Voice: warm, honest, a little playful, never pushy, never cutesy baby-talk. Use only facts given in the brief; never invent discounts, dates, prices or claims. Return only the JSON asked for.`;
  const resp = await k.anthropic.messages.create({ model: k.model, max_tokens: 1200, system: sys, messages: [{ role: "user", content: `${ask}\n\nBrief: ${String(brief || "").slice(0, 2000)}${current ? `\n\nCurrent version: ${String(current).slice(0, 2000)}` : ""}` }] });
  const txt = (resp.content || []).map((c) => c.text || "").join("");
  const m = txt.match(/\{[\s\S]*\}/);
  try { return JSON.parse(m ? m[0] : txt); } catch (_) { return { options: [{ text: txt }] }; }
}

/* ---------------- Emily rebuilds an imported HTML email as editable blocks ---------------- */
const BLOCK_SCHEMA = `Blocks (JSON objects {"type": "...", "props": {...}}), top to bottom:
- header_bar {text, href, bg, color}  — thin announcement strip ("Free shipping on orders $75+")
- logo {links: "Shop|https://…\\nNew|https://…" (optional nav links)}
- heading {text, size (px), align, color}
- text {html (only <p>, <strong>, <em>, <a href>, <br>, <ul>, <li>), align, size, color}
- image {src (absolute URL), alt, href, width (px, max 600), full (true = edge to edge)}
- button {label, href, align}
- split {src, alt, href, side ("left"|"right" = image side), heading, html, button_label, button_href}
- products {handles: [], count, per_row}   (use only when the email clearly shows a product grid; handles from /products/<handle> links)
- coupon {label, code, note}
- divider {color}
- spacer {height}
- video {url, src (thumbnail), label}
- table {rows: "a | b\\nc | d"}
- review {quote, name, stars}
- social {}  — row of social links (the brand kit has the URLs)
- footer {}  — address + unsubscribe (always last)
Style props allowed on any block: bg (hex background), pt / pb (padding top/bottom px), px (side padding px).`;
function compactHtml(h) {
  return String(h || "").replace(/<!--[\s\S]*?-->/g, "").replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/\s(class|id|role|cellpadding|cellspacing|border|valign|data-[\w-]+|aria-[\w-]+)="[^"]*"/gi, "")
    .replace(/\sstyle="([^"]*)"/gi, (m, st) => { const keep = st.split(";").filter((d) => /^(\s*)(background(-color)?|color|font-size|text-align|font-weight)\s*:/i.test(d)).join(";"); return keep ? ` style="${keep}"` : ""; })
    .replace(/\s+/g, " ").replace(/> </g, "><").trim().slice(0, 60000);
}
async function htmlToBlocks({ store, html }) {
  const k = require("./emily").claimsKit();
  if (!k.anthropic) throw new Error("The AI isn't configured.");
  const b = await brand(store);
  const sys = `You convert a marketing email's HTML into ${b.name}'s email-builder blocks so it can be edited visually. Keep every piece of copy word for word, every image URL and every link exactly as given, in the same order. Skip the email's own unsubscribe/footer/legal lines and replace them with one {"type":"footer"} at the end. Skip tracking pixels and spacer images. Return only JSON: {"blocks":[...]}.\n\n${BLOCK_SCHEMA}`;
  const resp = await k.anthropic.messages.create({ model: k.model, max_tokens: 8000, system: sys, messages: [{ role: "user", content: `HTML:\n${compactHtml(html)}` }] });
  const txt = (resp.content || []).map((c) => c.text || "").join("");
  const m = txt.match(/\{[\s\S]*\}/);
  let out; try { out = JSON.parse(m ? m[0] : txt); } catch (_) { throw new Error("Emily couldn't rebuild this email — try again"); }
  const blocks = cleanBlocks(out.blocks || []);
  if (!blocks.length) throw new Error("Emily couldn't find anything to rebuild");
  return blocks;
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
      const base = src ? { name: `${src.name} (copy)`, subject: src.subject, preview: src.preview, blocks: src.blocks, doc: src.doc } : st ? JSON.parse(JSON.stringify(st)) : STARTERS.blank;
      const br = await brand(s);
      const doc = base.doc ? MKDoc.reId(base.doc) : MKDoc.fromBlocks(base.blocks || [], { ...br, logo_abs: absUrl(br.logo) });
      res.json(await saveTemplate({ store: s, name: b.name || base.name, subject: base.subject, preview: base.preview, blocks: base.blocks, doc }, actorOf(req))); } catch (e) { fail(res, e); }
  });
  app.put("/api/mk/templates/:id", async (req, res) => { if (!guard(req, res)) return; try { res.json(await saveTemplate({ ...(req.body || {}), id: req.params.id }, actorOf(req))); } catch (e) { fail(res, e); } });
  app.delete("/api/mk/templates/:id", async (req, res) => { if (!guard(req, res)) return; try { await db(`UPDATE mk_templates SET archived=true, updated_at=now() WHERE id=$1`, [Number(req.params.id)]); res.json({ ok: true }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/templates/render", async (req, res) => {
    if (!guard(req, res)) return;
    try { const b = req.body || {}; const s = store(b.store) || "lb";
      let prof = null; if (b.profile_id) prof = (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [Number(b.profile_id)])).rows[0];
      if (!prof) prof = { id: 0, first_name: "Maria", last_name: "Lopez", email: "maria@example.com", props: { last_sizes: ["3-6M"] }, orders_count: 1 };
      res.json(await render(s, { subject: b.subject, preview: b.preview, blocks: cleanBlocks(b.blocks || []), doc: b.doc ? cleanDoc(b.doc) : null }, prof, { coupon: "WELCOME-8K2Q", ...(b.extra || {}) }, { editor: !!b.editor })); } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/templates/:id/test", async (req, res) => {
    if (!guard(req, res)) return;
    try { const t = await getTemplate(req.params.id); if (!t) return res.status(404).json({ error: "not found" });
      const to = String((req.body && req.body.to) || "").trim().toLowerCase(); if (!to) return res.status(400).json({ error: "Enter an address from the internal test list" });
      const tp = await require("./mk-coupons").forTest(t.store, to, "email", t);   // the real profile and a working code, like the live email
      const r = await render(t.store, t, tp.profile, tp.coupon ? { coupon: tp.coupon } : {});
      const row = await SEND().send({ store: t.store, channel: "email", profile: { id: null, email: to, email_consent: "subscribed" }, msg: r, test: true, messageId: `tpl:${t.id}`, idem: `test:${t.id}:${to}:${Date.now()}` });
      res.json({ status: row.status, reason: row.reason }); } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/templates/import-klaviyo", async (req, res) => { if (!admin(req, res)) return;
    try { let fetched = null; try { fetched = await require("./klaviyo").refreshTemplateDefinitions(); } catch (e) { fetched = { error: e.message }; }
      const r = await importKlaviyoTemplates("lb", { detail: true, overwrite: !!(req.body && req.body.overwrite) }); res.json({ ...r, fetched }); } catch (e) { fail(res, e); } });
  app.get("/api/mk/saved-blocks", async (req, res) => { if (!guard(req, res)) return; try { res.json({ blocks: (await db(`SELECT * FROM mk_saved_blocks ${store(req.query.store) ? "WHERE store=$1" : ""} ORDER BY name`, store(req.query.store) ? [req.query.store] : [])).rows }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/saved-blocks", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; const blk = b.block && (b.block.data || b.block.rows) ? cleanStrings(b.block) : cleanBlocks([b.block])[0]; if (!blk || !store(b.store)) return res.status(400).json({ error: "store and block required" }); res.json((await db(`INSERT INTO mk_saved_blocks (store, name, block) VALUES ($1,$2,$3) RETURNING *`, [b.store, String(b.name || "Saved block").slice(0, 80), JSON.stringify(blk)])).rows[0]); } catch (e) { fail(res, e); } });
  app.delete("/api/mk/saved-blocks/:id", async (req, res) => { if (!guard(req, res)) return; try { await db(`DELETE FROM mk_saved_blocks WHERE id=$1`, [Number(req.params.id)]); res.json({ ok: true }); } catch (e) { fail(res, e); } });
  app.put("/api/mk/saved-blocks/:id", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; const blk = b.block ? (b.block.data || b.block.rows ? cleanStrings(b.block) : cleanBlocks([b.block])[0]) : null; res.json((await db(`UPDATE mk_saved_blocks SET name=COALESCE($2,name), block=COALESCE($3,block), updated_at=now() WHERE id=$1 RETURNING *`, [Number(req.params.id), b.name || null, blk ? JSON.stringify(blk) : null])).rows[0]); } catch (e) { fail(res, e); } });
  app.post("/api/mk/templates/convert-html", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; res.json({ blocks: await htmlToBlocks({ store: store(b.store) || "lb", html: String(b.html || "") }) }); } catch (e) { fail(res, e); } });
  // Product picker for product blocks: search the store's catalog by name.
  app.get("/api/mk/products", async (req, res) => {
    if (!guard(req, res)) return;
    try { let cat = null; try { cat = await require("./catalog").get(store(req.query.store) || "lb"); } catch (_) {}
      const q = String(req.query.q || "").trim().toLowerCase(), want = String(req.query.handles || "").split(",").filter(Boolean);
      const all = (cat && cat.products) || [];
      const list = want.length ? want.map((h) => all.find((p) => p.handle === h)).filter(Boolean) : req.query.feed ? all.filter((p) => p.available !== false && p.image) : all.filter((p) => !q || String(p.title || "").toLowerCase().includes(q) || String(p.handle || "").includes(q));
      res.json({ products: list.slice(0, 30).map((p) => ({ handle: p.handle, title: p.title, url: p.url || "", image: p.image ? p.image + (p.image.includes("?") ? "&" : "?") + "width=600" : "", price: p.price, compare_at: p.compare_at || null, available: p.available !== false })), loaded: !!cat }); } catch (e) { fail(res, e); }
  });
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
  app.get("/api/mk/img-proxy", async (req, res) => {
    if (!guard(req, res)) return;
    try { const u = String(req.query.u || ""); if (!/^https?:\/\//i.test(u)) return res.status(400).json({ error: "bad url" });
      const r = await fetch(u, { signal: AbortSignal.timeout(20000), redirect: "follow" }); const ct = r.headers.get("content-type") || "";
      if (!r.ok || !/^image\//.test(ct)) return res.status(400).json({ error: `That address didn't return an image (${r.status}).` });
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 15 * 1024 * 1024) return res.status(400).json({ error: "Image is over 15 MB." });
      res.set("Content-Type", ct).set("Cache-Control", "private, max-age=600").send(buf); } catch (e) { fail(res, e); }
  });
  app.get("/mk/img/:id", async (req, res) => {
    try { const r = (await db(`SELECT mime, bytes FROM mk_images WHERE id=$1`, [Number(String(req.params.id).replace(/\D/g, ""))])).rows[0]; if (!r) return res.status(404).send("Not found");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); if (/svg/.test(r.mime)) res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'"); res.type(r.mime).send(r.bytes); } catch (e) { res.status(500).send("Error"); }
  });

  /* unsubscribe (page + one-click POST per RFC 8058) and preferences */
  // Old links keep working after profiles merge: a merged-away id resolves to the profile it lives in now.
  const unsub = async (t, channel = "email") => { const tk = readToken(t); if (!tk) return null; const p = (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [await require("./mk-merge").resolveId(tk.id)])).rows[0]; if (!p) return null; await MK().setConsent(p, channel, "unsubscribed", { source: "unsubscribe_link" }); return p; };
  app.post("/mk/u/:t", express.urlencoded({ extended: false }), async (req, res) => { try { const p = await unsub(req.params.t); if (!p) return res.status(404).send("Link not valid"); const b = await brand(p.store); res.type("html").send(page("Unsubscribed", `<h1>You're unsubscribed</h1><p>You won't get marketing emails from ${esc(b.name)} or any other Brusche Inc. brand anymore. Order and shipping emails still come as usual.</p>`, b)); } catch (e) { res.status(500).send("Error"); } });
  app.get("/mk/u/:t", async (req, res) => {
    try { const tk = readToken(req.params.t); if (!tk) return res.status(404).send("This link isn't valid."); const b = await brand(tk.store);
      res.type("html").send(page("Unsubscribe", `<h1>Unsubscribe?</h1><p>You'll stop getting marketing emails from ${esc(b.name)} and the other Brusche Inc. brands.</p><form method="post"><button type="submit">Unsubscribe</button></form><p><a class="b l" href="/mk/p/${esc(req.params.t)}" style="display:inline-block;text-decoration:none">Get fewer emails instead</a></p>`, b)); } catch (e) { res.status(500).send("Error"); }
  });
  app.get("/mk/p/:t", async (req, res) => {
    try { const tk = readToken(req.params.t); if (!tk) return res.status(404).send("This link isn't valid."); const b = await brand(tk.store); const p = (await db(`SELECT * FROM mk_profiles WHERE id=$1`, [await require("./mk-merge").resolveId(tk.id)])).rows[0]; if (!p) return res.status(404).send("Not found");
      const freq = (p.props && p.props.email_frequency) || "all";
      res.type("html").send(page("Email preferences", `<h1>Email preferences</h1><form method="post">
        <label><input type="radio" name="f" value="all" ${freq === "all" ? "checked" : ""}> Everything: new arrivals, sales and tips</label>
        <label><input type="radio" name="f" value="weekly" ${freq === "weekly" ? "checked" : ""}> At most one email a week</label>
        <label><input type="radio" name="f" value="sales" ${freq === "sales" ? "checked" : ""}> Only big sales</label>
        <label><input type="radio" name="f" value="none"> No marketing emails</label><button type="submit">Save</button></form>`, b)); } catch (e) { res.status(500).send("Error"); }
  });
  app.post("/mk/p/:t", express.urlencoded({ extended: false }), async (req, res) => {
    try { const tk = readToken(req.params.t); if (!tk) return res.status(404).send("Link not valid"); const b = await brand(tk.store); const f = String((req.body && req.body.f) || "all");
      if (f === "none") { await unsub(req.params.t); return res.type("html").send(page("Saved", `<h1>You're unsubscribed</h1><p>No more marketing emails from ${esc(b.name)} or any other Brusche Inc. brand.</p>`, b)); }
      await db(`UPDATE mk_profiles SET props = props || jsonb_build_object('email_frequency', $2::text), updated_at=now() WHERE id=$1`, [await require("./mk-merge").resolveId(tk.id), ["all", "weekly", "sales"].includes(f) ? f : "all"]);
      res.type("html").send(page("Saved", `<h1>Saved</h1><p>Thanks — we'll email you ${f === "weekly" ? "at most once a week" : f === "sales" ? "only for big sales" : "about everything"}.</p>`, b)); } catch (e) { res.status(500).send("Error"); }
  });
}

async function init() {
  await migrate();
  // One-time: send as hello@larkspurbaby.com (the address customers know), not hello@mail.… — a saved brand kit that still has the old default is updated.
  try { if (!(await core.syncGet("mk_sender_root_domain_v1").catch(() => null))) {
    for (const st of Object.keys(BRAND_DEFAULTS)) { const r = (await db(`SELECT data FROM mk_brand WHERE store=$1`, [st])).rows[0];
      if (r && r.data && r.data.sender && /^mail\./.test(r.data.sender.domain || "")) { r.data.sender.domain = r.data.sender.domain.replace(/^mail\./, ""); await db(`UPDATE mk_brand SET data=$2, updated_at=now() WHERE store=$1`, [st, JSON.stringify(r.data)]); } }
    await core.syncSet("mk_sender_root_domain_v1", "done", {}); } } catch (e) { console.error("sender domain update:", e.message); }
  if (!(await core.syncGet("mk_klaviyo_templates_v1").catch(() => null))) {
    setTimeout(async () => { try { const n = await importKlaviyoTemplates("lb"); if (n) { await core.syncSet("mk_klaviyo_templates_v1", new Date().toISOString(), { n }); console.log(`✉️  Marketing: ${n} Klaviyo templates imported as editable HTML`); } } catch (e) { console.error("Klaviyo templates import:", e.message); } }, 60000);
  }
  // One-time: Klaviyo templates used {% coupon_code %}, which the first copy dropped. Re-copy the ones nobody has edited so they show each person's own code.
  if (!(await core.syncGet("mk_klaviyo_coupons_v1").catch(() => null))) {
    setTimeout(async () => { try {
      const ids = (await db(`SELECT id FROM hd_klaviyo WHERE kind='template' AND data::text LIKE '%coupon_code%'`).catch(() => ({ rows: [] }))).rows.map((r) => r.id);
      const st = ids.length ? (await db(`SELECT ext_id, name, updated_by FROM mk_templates WHERE source='klaviyo' AND ext_id = ANY($1)`, [ids])).rows : [];
      const fresh = st.filter((r) => !r.updated_by).map((r) => r.ext_id), edited = st.filter((r) => r.updated_by).map((r) => r.name);
      const n = fresh.length ? await importKlaviyoTemplates("lb", { overwrite: true, only: fresh }) : 0;
      await core.syncSet("mk_klaviyo_coupons_v1", new Date().toISOString(), { n, edited });
      console.log(`🎟️  Marketing: coupon codes restored in ${n} Klaviyo emails${edited.length ? ` · edited in Buzzin, left as is: ${edited.join(", ")}` : ""}`);
    } catch (e) { console.error("Klaviyo coupon re-copy:", e.message); } }, 100000);
  }
  // One-time: Klaviyo emails edited in Buzzin keep their edits; only the blocks that held Klaviyo's coupon tag get the code back.
  if (!(await core.syncGet("mk_klaviyo_coupons_edited_v1").catch(() => null))) {
    setTimeout(async () => { try {
      const raws = (await db(`SELECT id, data FROM hd_klaviyo WHERE kind='template' AND data::text LIKE '%coupon_code%'`).catch(() => ({ rows: [] }))).rows;
      const fixed = [];
      for (const raw of raws) {
        const t = (await db(`SELECT id, name, doc FROM mk_templates WHERE source='klaviyo' AND ext_id=$1 AND updated_by IS NOT NULL`, [raw.id])).rows[0];
        const def = raw.data && raw.data.attributes && raw.data.attributes.definition;
        if (!t || !t.doc || !def || !def.body) continue;
        const fresh = MKDoc.fromKlaviyo(def, fromKlaviyo), want = {};
        const strip = (x) => String(x || "").replace(/\{\{\s*coupon\s*\}\}/g, "");
        const byText = {};   // the first copy dropped the tag, so the old text = the new text without {{ coupon }}
        const collect = (o) => { if (!o || typeof o !== "object") return; if (Array.isArray(o)) return o.forEach(collect); if (o.id && o.data && /\{\{\s*coupon/.test(JSON.stringify(o.data))) { want[o.id] = o.data; if (typeof o.data.content === "string") byText[strip(o.data.content)] = o.data; } Object.values(o).forEach(collect); };
        collect(fresh);
        const doc = typeof t.doc === "string" ? JSON.parse(t.doc) : t.doc; let n = 0;
        const put = (o) => { if (!o || typeof o !== "object") return; if (Array.isArray(o)) return o.forEach(put);
          const w = o.id && o.data && !/\{\{\s*coupon/.test(JSON.stringify(o.data)) ? (want[o.id] || (typeof o.data.content === "string" ? byText[o.data.content] : null)) : null;
          if (w) {
            if (typeof w.content === "string") o.data.content = w.content;
            if (w.properties) { o.data.properties = o.data.properties || {}; for (const [k, v] of Object.entries(w.properties)) if (typeof v === "string" && /\{\{\s*coupon/.test(v)) o.data.properties[k] = v; }
            n++; }
          Object.values(o).forEach(put); };
        put(doc);
        if (n) { await db(`UPDATE mk_templates SET doc=$2, updated_at=now() WHERE id=$1`, [t.id, JSON.stringify(doc)]); fixed.push(`${t.name} (${n} block${n > 1 ? "s" : ""})`); }
      }
      await core.syncSet("mk_klaviyo_coupons_edited_v1", new Date().toISOString(), { fixed });
      console.log(`🎟️  Marketing: coupon code put back in edited Klaviyo emails: ${fixed.join(", ") || "none needed"}`);
    } catch (e) { console.error("Klaviyo coupon fix (edited):", e.message); } }, 110000);
  }
  // One-time: re-read Klaviyo templates with their drag-and-drop layout so they open as real blocks.
  if (!(await core.syncGet("mk_klaviyo_layouts_v1").catch(() => null)) && process.env.KLAVIYO_API_KEY) {
    setTimeout(async () => { try { const f = await require("./klaviyo").refreshTemplateDefinitions(); const r = await importKlaviyoTemplates("lb", { detail: true });
      await core.syncSet("mk_klaviyo_layouts_v1", new Date().toISOString(), { ...f, ...r }); console.log(`✉️  Marketing: Klaviyo layouts · ${JSON.stringify({ ...f, ...r })}`); } catch (e) { console.error("Klaviyo layouts import:", e.message); } }, 90000);
  }
}

module.exports = { renderDocument, evalCheck, visibleFor, cleanDoc, htmlToBlocks, init, migrate, routes, brand, saveBrand, render, personalize, fromKlaviyo, getTemplate, saveTemplate, listTemplates, tokenFor, readToken, contextFor, cleanBlocks, STARTERS, importKlaviyoTemplates, aiCopy };
