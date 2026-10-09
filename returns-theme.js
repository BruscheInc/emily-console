/**
 * Returns portal — look & feel ("Portal Studio" back end).
 *
 * Every visual and text choice on /returns/lb and /returns/lbo lives in one theme object per store:
 * brand, background, layout, colors, typography, buttons, inputs, header, announcement bar, footer,
 * item display, every line of copy, browser tab / SEO, and custom CSS. Sizes have desktop + mobile values.
 *
 * Each store has a DRAFT (what the studio edits, autosaved) and a PUBLISHED theme (what customers see).
 * Every publish is kept, so any earlier version can be restored. Images are uploaded into Postgres and
 * served from /returns/asset/<id>.
 *
 * The starting look for each store is the one Loop was showing (pulled from Loop's public portal config
 * on Oct 7, 2026): same logo, favicon, background, fonts, colors and lookup-page text.
 */
const crypto = require("crypto");
const core = require("./core");
const { db, pool } = core;

// Signs draft-preview links. Never a guessable constant: without a configured secret, a random one per process.
const SECRET = process.env.RETURNS_SECRET || process.env.CONSOLE_KEY || crypto.randomBytes(32).toString("hex");
const LOOP_SUBDOMAIN = { lb: "larkspurbaby", lbo: "larkspurbabyoutlet" };

/* ------------------------------------------------------------------ fonts ------------------------------------------------------------------ */
// Google Fonts the studio offers (family name → weights loaded). "System" uses the device font, no download.
const FONTS = [
  "System", "Roboto", "Inter", "Open Sans", "Lato", "Montserrat", "Poppins", "Nunito", "Nunito Sans", "Raleway", "Work Sans",
  "DM Sans", "Manrope", "Plus Jakarta Sans", "Outfit", "Figtree", "Karla", "Mulish", "Quicksand", "Rubik", "Source Sans 3",
  "Playfair Display", "Lora", "Merriweather", "Cormorant Garamond", "Libre Baskerville", "EB Garamond", "Fraunces", "DM Serif Display",
  "Crimson Pro", "Josefin Sans", "Josefin Slab", "Comfortaa", "Baloo 2", "Fredoka", "Amatic SC", "Caveat", "Dancing Script", "Pacifico", "Abril Fatface",
];

// Weights each family actually has on Google Fonts (asking for one it lacks makes Google reject the request).
const W6 = "300;400;500;600;700;800", W5 = "300;400;500;600;700";
const FONT_WEIGHTS = {
  Roboto: "300;400;500;700", Inter: W6, "Open Sans": W6, Lato: "300;400;700", Montserrat: W6, Poppins: W6, Nunito: W6, "Nunito Sans": W6, Raleway: W6,
  "Work Sans": W6, "DM Sans": W6, Manrope: W6, "Plus Jakarta Sans": W6, Outfit: W6, Figtree: W6, Karla: W6, Mulish: W6, Quicksand: W5, Rubik: W6,
  "Source Sans 3": W6, "Playfair Display": "400;500;600;700;800", Lora: "400;500;600;700", Merriweather: "300;400;700", "Cormorant Garamond": W5,
  "Libre Baskerville": "400;700", "EB Garamond": "400;500;600;700;800", Fraunces: W6, "DM Serif Display": "400", "Crimson Pro": W6, "Josefin Sans": W5,
  "Josefin Slab": W5, Comfortaa: W5, "Baloo 2": "400;500;600;700;800", Fredoka: W5, "Amatic SC": "400;700", Caveat: "400;500;600;700",
  "Dancing Script": "400;500;600;700", Pacifico: "400", "Abril Fatface": "400",
};

/* ------------------------------------------------------------------ defaults ------------------------------------------------------------------ */
// The full schema. Anything not listed here is dropped on save, so this object IS the contract.
const BASE = {
  meta: { title: "Returns · {store}", description: "Start a return for your {store} order.", favicon: "", noindex: true },
  brand: { logo: "", logo_alt: "{store}", logo_link: "", logo_h_d: 64, logo_h_m: 48, logo_place: "card", logo_align: "center", show_name: false, logo_action: "start" },
  background: {
    mode: "color", color: "#FFFEFA", grad_from: "#FFFEFA", grad_to: "#EEF1F6", grad_angle: 160,
    image_d: "", image_m: "", focal_x: 50, focal_y: 50, fit: "cover", attach: "scroll",
    overlay: "#000000", overlay_opacity: 0, blur: 0,
  },
  layout: {
    style: "center", valign: "center", card_w_d: 560, card_pad_d: 40, card_pad_m: 22, page_pad_d: 48, page_pad_m: 14,
    radius: 16, shadow: "soft", border_w: 1, card_opacity: 100, glass_blur: 0, card_full_m: false, steps: true, split_w: 50, split_side: "left",
  },
  colors: {
    primary: "#242F3F", on_primary: "#FFFFFF", heading: "#242F3F", text: "#242F3F", muted: "#6B7280", link: "#242F3F",
    card: "#FFFFFF", border: "#E6E3DC", soft: "#F4F2EE", input_bg: "#FFFFFF", input_text: "#242F3F", input_border: "#D9D5CC",
    focus: "#242F3F", error: "#B42318", error_bg: "#FEF3F2", success: "#027A48", badge_bg: "#242F3F", badge_text: "#FFFFFF",
    page_text: "#242F3F",
  },
  type: {
    heading_font: "Roboto", body_font: "Roboto", heading_weight: 600, body_weight: 400,
    h1_d: 32, h1_m: 26, h2_d: 13, h2_m: 12, body_d: 16, body_m: 15, small_d: 14, small_m: 13,
    line_height: 1.5, heading_tracking: 0, heading_case: "none", label_case: "uppercase",
  },
  buttons: { style: "filled", radius: 12, height_d: 52, height_m: 50, font_size: 16, weight: 600, case: "none", tracking: 0, full_width: true, shadow: false },
  inputs: { style: "outlined", radius: 10, height: 48, border_w: 1 },
  items: { show_images: true, image_size: 64, image_radius: 10, show_price: true, show_variant: true },
  header: { show: false, bg: "#FFFFFF", text: "#242F3F", show_link: true, link_label: "Back to shop", border: true, sticky: false },
  announce: { on: false, text: "", link: "", bg: "#242F3F", color: "#FFFFFF" },
  footer: { text: "Questions? Email {support}", links: [], show: true, show_shop_link: true },
  copy: {
    step1: "Find order", step2: "Choose items", step3: "Refund", step4: "Label",
    lookup_title: "Start a return",
    lookup_sub: "Enter your order number and the email you used at checkout.",
    order_label: "Order number", order_placeholder: "e.g. {prefix}12345", order_help: "It's in your order confirmation email.",
    email_label: "Email", email_placeholder: "you@example.com", lookup_button: "Find my order",
    policy: "Items must be unworn, unwashed, and returned with tags and original packaging within {days} days of delivery. Sale items are final. Original shipping is not refunded.",
    items_title: "Order {order}", items_sub: "Select the items you'd like to return.", not_your_order: "Not your order?",
    return_this: "Return this item", qty_label: "Quantity", reason_placeholder: "Select a reason", note_placeholder: "Anything we should know? (optional)",
    continue: "Continue", existing_title: "Returns already started", none_returnable: "There are no items on this order that can be returned.",
    refund_title: "How would you like your refund?", refund_sub: "Your refund is issued as soon as your package is delivered back to us.", back: "Back",
    nav_start_over: "Start over", another_return: "Start another return", nav_shop: "Back to {store}",
    credit_title: "Store credit", credit_badge: "+{bonus}% bonus", credit_desc: "Added to your {store} account to use on your next order.",
    original_title: "Refund to original payment", original_desc: "Back to the card you paid with. Banks usually take 5–10 business days.",
    address_title: "Return label is from", edit_address: "Edit address", summary_title: "Summary",
    fee_line: "Return shipping label", fee_free: "Free", bonus_line: "{bonus}% store credit bonus",
    total_credit: "Estimated store credit", total_refund: "Estimated refund", submit: "Get my return label",
    estimate_note: "Final refund includes tax and may vary slightly from this estimate.",
    done_title: "Your return has been submitted", done_sub: "Return {rma} for order {order}", download: "Download return label", tracking: "Tracking",
    done_steps: "Print the label and tape it to your package. Cover or remove any old labels.\nPack the items in their original packaging if you can.\nDrop it off at the post office within 28 days. We also emailed you the label.",
    done_credit_note: "Your store credit is added as soon as the package is delivered to us.",
    done_refund_note: "Your refund is issued as soon as the package is delivered to us.",
    intl: "Prepaid return labels are only available for US addresses. Please email {support} and we'll help with your return.",
    not_found: "We couldn't find that order. Check the order number and the email you used at checkout.",
    menu_title: "How can we help?", menu_sub: "Order {order}. Pick what you need.",
    opt_edit_title: "Edit or cancel my order", opt_edit_sub: "Change a size or the address, or cancel",
    opt_return_title: "Start a return", opt_return_sub: "Send items back for a refund or store credit",
    opt_defect_title: "Defective item", opt_defect_sub: "Something arrived broken, torn or faulty",
    opt_pp_title: "Package Protection claim", opt_pp_sub: "Lost, stolen or damaged in shipping",
    opt_nd_title: "Other", opt_nd_sub: "Package hasn't arrived, delivery problem, or something else",
    nopp_text: "Your order didn't include Package Protection, so we aren't able to replace or refund a package that the carrier marked delivered. Please file a claim with the carrier. Your tracking number is your proof of shipment.",
    done_label_title: "Your label is ready to print", done_label_sub: "Use the button below to print your label and packing slip. Put the packing slip inside the package, attach the label to the top of the package, then drop it off at any USPS location by **{deadline}**.",
    done_print: "Print label and packing slip", done_track: "Track your return", done_ship_title: "How to ship your item(s)",
    done_ship_steps: "Securely pack your items. If you have it, use the original packaging.\nPut the packing slip inside and attach your return label to the outside of the package.\nDrop off the package within {dropoff} days at your nearest USPS location.\nWe'll issue your {refund} as soon as the package is delivered back to us.",
    done_pack_title: "Pack these items. Use the original packaging if possible.", done_edit_title: "Edit your return", done_cancel: "Cancel return", done_info_title: "Customer information",
    done_summary_title: "Return summary", done_q1: "How was your returns experience?", done_q2: "How likely are you to buy from {store} again?",
    claim_done_title: "Claim submitted", claim_done_sub: "Claim {number}. We'll email {email} with the result, usually within minutes.",
  },
  advanced: { css: "" },
};

// What Loop showed for each store (Loop public portal config, Oct 7, 2026).
const LOOP_LOGO = "https://cdn.shopify.com/s/files/1/0533/3080/4887/files/RR_Logo.png?v=1724430815";
const LOOP_FAVICON = "https://cdn.shopify.com/s/files/1/0533/3080/4887/files/favicon.png?v=1723193503";
const SEEDS = {
  lb: {
    meta: { favicon: LOOP_FAVICON },
    brand: { logo: LOOP_LOGO, logo_link: "https://larkspurbaby.com" },
    background: { mode: "image", image_d: "https://cdn.shopify.com/s/files/1/0533/3080/4887/files/larkspur-story-scene-6-full.png?v=1726168169", color: "#FFFEFA" },
    copy: { lookup_sub: "For detailed information on our return process please visit our **[Returns](https://larkspurbaby.com/pages/returns)** Page." },
  },
  lbo: {
    meta: { favicon: LOOP_FAVICON },
    brand: { logo: LOOP_LOGO, logo_link: "https://larkspurbabyoutlet.com" },
    background: { mode: "color", color: "#FFFEFA" },
    copy: { lookup_sub: "For detailed information on our return process please visit our **[Returns](https://larkspurbabyoutlet.com/pages/returns)** Page." },
  },
};

/* ------------------------------------------------------------------ helpers ------------------------------------------------------------------ */
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
function merge(base, over) {
  if (!isObj(over)) return JSON.parse(JSON.stringify(base));
  const out = {};
  for (const k of Object.keys(base)) out[k] = isObj(base[k]) ? merge(base[k], over[k]) : over[k] !== undefined ? over[k] : JSON.parse(JSON.stringify(base[k]));
  return out;
}
const defaultsFor = (store) => merge(BASE, SEEDS[store] || {});

// Allowed values for every enum field.
const ENUMS = {
  "brand.logo_place": ["card", "page", "header"], "brand.logo_action": ["start", "shop", "none"], "brand.logo_align": ["center", "left"],
  "background.mode": ["color", "gradient", "image"], "background.fit": ["cover", "contain", "repeat"], "background.attach": ["scroll", "fixed"],
  "layout.style": ["center", "left", "right", "split"], "layout.split_side": ["left", "right"], "layout.valign": ["center", "top"], "layout.shadow": ["none", "soft", "medium", "strong"],
  "type.heading_case": ["none", "uppercase", "capitalize"], "type.label_case": ["none", "uppercase"],
  "buttons.style": ["filled", "outline", "soft"], "buttons.case": ["none", "uppercase"], "inputs.style": ["outlined", "filled", "underline"],
};
// Numeric limits [min, max].
const RANGES = {
  "brand.logo_h_d": [16, 240], "brand.logo_h_m": [16, 200],
  "background.grad_angle": [0, 360], "background.focal_x": [0, 100], "background.focal_y": [0, 100], "background.overlay_opacity": [0, 95], "background.blur": [0, 30],
  "layout.card_w_d": [360, 1100], "layout.card_pad_d": [8, 96], "layout.card_pad_m": [8, 64], "layout.page_pad_d": [0, 160], "layout.page_pad_m": [0, 48],
  "layout.radius": [0, 40], "layout.border_w": [0, 6], "layout.card_opacity": [0, 100], "layout.glass_blur": [0, 40], "layout.split_w": [30, 70],
  "type.heading_weight": [300, 900], "type.body_weight": [300, 700], "type.h1_d": [16, 80], "type.h1_m": [14, 56], "type.h2_d": [10, 32], "type.h2_m": [10, 28],
  "type.body_d": [12, 24], "type.body_m": [12, 22], "type.small_d": [10, 20], "type.small_m": [10, 18], "type.line_height": [1, 2.2], "type.heading_tracking": [-3, 10],
  "buttons.radius": [0, 999], "buttons.height_d": [32, 80], "buttons.height_m": [32, 80], "buttons.font_size": [11, 26], "buttons.weight": [300, 900], "buttons.tracking": [-2, 10],
  "inputs.radius": [0, 40], "inputs.height": [32, 72], "inputs.border_w": [0, 4],
  "items.image_size": [32, 160], "items.image_radius": [0, 80],
};
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
function cleanUrl(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/^\/returns\/asset\/[a-z0-9]+(?:\/[\w.\-]*)?$/i.test(s)) return s;
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:" ? u.href : ""; } catch { return ""; }
}
const COLOR_FIELDS = new Set(["background.color", "background.grad_from", "background.grad_to", "background.overlay", "header.bg", "header.text", "announce.bg", "announce.color"]);
const URL_FIELDS = new Set(["meta.favicon", "brand.logo", "brand.logo_link", "background.image_d", "background.image_m", "announce.link"]);

// Coerce an incoming theme to the schema: unknown keys dropped, types fixed, ranges clamped.
function sanitize(input, store) {
  const def = defaultsFor(store);
  const walk = (d, v, pathPrefix) => {
    const out = {};
    for (const k of Object.keys(d)) {
      const p = pathPrefix ? `${pathPrefix}.${k}` : k, dv = d[k], iv = isObj(v) ? v[k] : undefined;
      if (isObj(dv)) { out[k] = walk(dv, iv, p); continue; }
      if (p === "footer.links") {
        out[k] = (Array.isArray(iv) ? iv : []).slice(0, 8).map((l) => ({ label: String((l && l.label) || "").slice(0, 60), url: cleanUrl(l && l.url) })).filter((l) => l.label && l.url);
        continue;
      }
      if (iv === undefined || iv === null) { out[k] = dv; continue; }
      if (typeof dv === "boolean") out[k] = iv === true || iv === "true" || iv === 1;
      else if (typeof dv === "number") {
        let n = Number(iv); if (!Number.isFinite(n)) n = dv;
        const r = RANGES[p]; if (r) n = Math.min(r[1], Math.max(r[0], n));
        out[k] = Math.round(n * 100) / 100;
      } else if (ENUMS[p]) out[k] = ENUMS[p].includes(iv) ? iv : dv;
      else if (p.startsWith("colors.") || COLOR_FIELDS.has(p)) out[k] = COLOR_RE.test(String(iv).trim()) ? String(iv).trim() : dv;
      else if (URL_FIELDS.has(p)) out[k] = cleanUrl(iv);
      else if (p.endsWith("_font")) out[k] = FONTS.includes(iv) ? iv : dv;
      else if (p === "advanced.css") out[k] = String(iv).replace(/<\/?\s*(style|script)/gi, "").slice(0, 30000);
      else out[k] = String(iv).slice(0, p.startsWith("copy.") ? 2000 : 400);
    }
    return out;
  };
  return walk(def, input, "");
}

/* ------------------------------------------------------------------ storage ------------------------------------------------------------------ */
async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS hd_portal_themes (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, kind TEXT NOT NULL, theme JSONB NOT NULL, note TEXT, created_by TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE INDEX IF NOT EXISTS hd_portal_themes_k ON hd_portal_themes (store, kind, id DESC)`);
  await db(`CREATE TABLE IF NOT EXISTS hd_portal_assets (id TEXT PRIMARY KEY, store TEXT, name TEXT, content_type TEXT, bytes INT, width INT, height INT, data BYTEA, created_by TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
}
const pubCache = new Map();   // store -> { t, at } published theme (customers hit this on every page view)
const PUB_TTL = 30e3;         // short, so a publish shows everywhere within 30s even with several instances
async function latest(store, kind) {
  const r = (await db(`SELECT id, theme, note, created_by, created_at FROM hd_portal_themes WHERE store=$1 AND kind=$2 ORDER BY id DESC LIMIT 1`, [store, kind])).rows[0];
  return r || null;
}
async function published(store) {
  const c = pubCache.get(store);
  if (c && Date.now() - c.at < PUB_TTL) return c.t;
  try {
    const r = await latest(store, "published");
    const t = r ? merge(defaultsFor(store), r.theme) : defaultsFor(store);
    pubCache.set(store, { t, at: Date.now() });
    return t;
  } catch (e) {
    console.error("portal theme read:", e.message);
    return c ? c.t : defaultsFor(store);   // serve the last good look; don't cache the fallback
  }
}
async function draft(store) {
  const r = await latest(store, "draft");
  return r ? merge(defaultsFor(store), r.theme) : await published(store);
}
async function state(store) {
  const [d, p] = await Promise.all([latest(store, "draft"), latest(store, "published")]);
  const pub = p ? merge(defaultsFor(store), p.theme) : defaultsFor(store);
  const dr = d ? merge(defaultsFor(store), d.theme) : pub;
  const hist = (await db(`SELECT id, note, created_by, created_at FROM hd_portal_themes WHERE store=$1 AND kind='published' ORDER BY id DESC LIMIT 30`, [store])).rows;
  return {
    draft: dr, published: pub, dirty: JSON.stringify(dr) !== JSON.stringify(pub),
    draft_saved_at: d ? d.created_at : null, draft_saved_by: d ? d.created_by : null,
    published_at: p ? p.created_at : null, published_by: p ? p.created_by : null,
    history: hist, defaults: defaultsFor(store),
  };
}
async function saveDraft(store, theme, who) {
  const clean = sanitize(theme, store);
  // Keep one draft row per store (the history of drafts isn't useful; publishes are versioned).
  await db(`DELETE FROM hd_portal_themes WHERE store=$1 AND kind='draft'`, [store]);
  await db(`INSERT INTO hd_portal_themes (store, kind, theme, created_by) VALUES ($1,'draft',$2,$3)`, [store, JSON.stringify(clean), who || null]);
  return clean;
}
async function publish(store, note, who) {
  const t = await draft(store);
  await db(`INSERT INTO hd_portal_themes (store, kind, theme, note, created_by) VALUES ($1,'published',$2,$3,$4)`, [store, JSON.stringify(t), String(note || "").slice(0, 200) || null, who || null]);
  pubCache.delete(store);
  await core.audit({ kind: "portal-published", detail: `${store.toUpperCase()} returns portal look published${note ? ` — ${note}` : ""}`, who: who || "system" });
  return t;
}
async function discard(store) { await db(`DELETE FROM hd_portal_themes WHERE store=$1 AND kind='draft'`, [store]); }
async function restore(store, id, who) {
  const r = (await db(`SELECT theme FROM hd_portal_themes WHERE id=$1 AND store=$2 AND kind='published'`, [id, store])).rows[0];
  if (!r) throw Object.assign(new Error("That version doesn't exist"), { status: 404 });
  return saveDraft(store, merge(defaultsFor(store), r.theme), who);
}
async function versionTheme(store, id) {
  const r = (await db(`SELECT theme FROM hd_portal_themes WHERE id=$1 AND store=$2`, [id, store])).rows[0];
  return r ? merge(defaultsFor(store), r.theme) : null;
}

/* ------------------------------------------------------------------ images ------------------------------------------------------------------ */
const IMG_TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico", "image/avif": "avif" };
function imageSize(buf, type) {
  try {
    if (type === "image/png" && buf.length > 24) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (type === "image/gif" && buf.length > 10) return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
    if (type === "image/jpeg") {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
        i += 2 + len;
      }
    }
    if (type === "image/webp" && buf.toString("ascii", 12, 16) === "VP8X") return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  } catch (_) {}
  return { w: null, h: null };
}
async function saveAsset({ store, name, type, buffer, who }) {
  type = String(type || "").toLowerCase().split(";")[0].trim();
  if (!IMG_TYPES[type]) throw Object.assign(new Error("Upload a PNG, JPG, WebP, GIF, SVG, AVIF or ICO image."), { status: 400 });
  if (!buffer || !buffer.length) throw Object.assign(new Error("The file is empty."), { status: 400 });
  if (buffer.length > 10 * 1024 * 1024) throw Object.assign(new Error("Images must be under 10 MB."), { status: 400 });
  if (type === "image/svg+xml") {
    const s = buffer.toString("utf8");
    if (/<script|on\w+\s*=|javascript:|<foreignObject/i.test(s)) throw Object.assign(new Error("That SVG contains scripts, which aren't allowed."), { status: 400 });
  }
  const id = crypto.randomBytes(12).toString("hex");
  const { w, h } = imageSize(buffer, type);
  const safe = String(name || `image.${IMG_TYPES[type]}`).replace(/[^\w.\-]+/g, "-").slice(0, 80);
  await db(`INSERT INTO hd_portal_assets (id, store, name, content_type, bytes, width, height, data, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [id, store || null, safe, type, buffer.length, w, h, buffer, who || null]);
  return { id, url: `/returns/asset/${id}/${safe}`, name: safe, content_type: type, bytes: buffer.length, width: w, height: h };
}
async function listAssets() {
  const r = await db(`SELECT id, store, name, content_type, bytes, width, height, created_by, created_at FROM hd_portal_assets ORDER BY created_at DESC LIMIT 200`);
  return r.rows.map((a) => ({ ...a, url: `/returns/asset/${a.id}/${a.name}` }));
}
async function getAsset(id) { return (await db(`SELECT content_type, data FROM hd_portal_assets WHERE id=$1`, [id])).rows[0] || null; }
async function deleteAsset(id) { await db(`DELETE FROM hd_portal_assets WHERE id=$1`, [id]); }

/* ------------------------------------------------------------------ Loop import ------------------------------------------------------------------ */
// Loop's lookup subheading is a ProseMirror doc; turn it into our mini-markdown (**bold**, [text](url)).
function proseToText(doc) {
  if (!doc || !Array.isArray(doc.content)) return "";
  const inline = (n) => {
    let t = String(n.text || "");
    for (const m of n.marks || []) {
      if (m.type === "bold") t = `**${t}**`;
      if (m.type === "italic") t = `*${t}*`;
      if (m.type === "link" && m.attrs && m.attrs.href) t = `[${t}](${m.attrs.href})`;
    }
    return t;
  };
  return doc.content.map((p) => (p.content || []).map((n) => (n.type === "text" ? inline(n) : n.type === "hardBreak" ? "\n" : "")).join("")).join("\n\n").trim();
}
async function importFromLoop(store) {
  const sub = LOOP_SUBDOMAIN[store]; if (!sub) throw new Error("Unknown store");
  const r = await fetch("https://api.loopreturns.com/api/v1/init", { headers: { Origin: `https://${sub}.loopreturns.com`, Referer: `https://${sub}.loopreturns.com/`, "X-Loop-Client": "PortalV1" } });
  if (!r.ok) throw new Error(`Loop didn't answer (${r.status}). If Loop is cancelled, its settings are gone — the original look is still available under Reset.`);
  const j = await r.json();
  const s = (j.customizations && j.customizations.style) || {}, c = (j.customizations && j.customizations.content && j.customizations.content.en) || {};
  const b = s.branding || {}, bg = s.background || {}, h = s.heading || {}, body = s.body || {}, btn = s.button || {};
  const out = { meta: {}, brand: {}, background: {}, colors: {}, type: {}, buttons: {}, inputs: {}, layout: {}, copy: {} };
  if (b.logo) out.brand.logo = b.logo;
  if (b.favicon) out.meta.favicon = b.favicon;
  if (b.primaryColor) { out.colors.primary = b.primaryColor; out.colors.focus = b.primaryColor; out.colors.link = b.primaryColor; out.colors.badge_bg = b.primaryColor; }
  if (bg.image) { out.background.mode = "image"; out.background.image_d = bg.image; }
  else if (bg.color1) { out.background.mode = "color"; out.background.color = bg.color1; }
  if (h.font && FONTS.includes(h.font)) out.type.heading_font = h.font;
  if (h.color) out.colors.heading = h.color;
  if (body.font && FONTS.includes(body.font)) out.type.body_font = body.font;
  if (body.color) { out.colors.text = body.color; out.colors.input_text = body.color; out.colors.page_text = body.color; }
  if (btn.background) out.colors.primary = btn.background;
  if (btn.color) out.colors.on_primary = btn.color;
  const sharp = s.globals && s.globals.sharpness === "sharp";
  out.buttons.radius = sharp ? 0 : 12; out.inputs.radius = sharp ? 0 : 10; out.layout.radius = sharp ? 0 : 16;
  const look = c.moduleOrderLookup || {};
  if (look.subheading) { const t = proseToText(look.subheading); if (t) out.copy.lookup_sub = t; }
  if (look.heading) { const t = typeof look.heading === "string" ? look.heading : proseToText(look.heading); if (t) out.copy.lookup_title = t; }
  if (j.shopContents && j.shopContents.shop_domain) out.brand.logo_link = `https://${j.shopContents.shop_domain}`;
  return out;
}

/* ------------------------------------------------------------------ preview tokens ------------------------------------------------------------------ */
// Short-lived link that shows the DRAFT look on the real portal (for the studio and "open preview in a new tab").
function previewToken(store, hours = 12) {
  const exp = Date.now() + hours * 3600e3;
  const sig = crypto.createHmac("sha256", SECRET).update(`preview:${store}:${exp}`).digest("hex").slice(0, 32);
  return `${exp}.${sig}`;
}
function checkPreview(store, tok) {
  const [exp, sig] = String(tok || "").split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = crypto.createHmac("sha256", SECRET).update(`preview:${store}:${exp}`).digest("hex").slice(0, 32);
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}

async function init() { if (pool) { try { await migrate(); } catch (e) { console.error("portal theme migrate:", e.message); } } }

module.exports = {
  FONTS, FONT_WEIGHTS, BASE, ENUMS, RANGES, defaultsFor, sanitize, merge, init, state, draft, published, saveDraft, publish, discard, restore, versionTheme,
  saveAsset, listAssets, getAsset, deleteAsset, importFromLoop, previewToken, checkPreview,
};
