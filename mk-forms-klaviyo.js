/* =============================================================================================
 *  Buzzin Marketing · copy Klaviyo sign-up forms into Buzzin (read-only on Klaviyo)
 *
 *  For every Klaviyo form: GET /api/forms/{id} (full definition), and GET /api/images/{id} for its images.
 *  Each version (A/B variant) becomes a Buzzin form in Draft, with its steps, blocks, styles, teaser and
 *  display rules converted (see mk-forms-v2.js for the Buzzin model). Nothing in Klaviyo is changed.
 *  Klaviyo's SMS disclosure block is replaced by Buzzin's phone consent (unchecked box + Brusche wording).
 *  Everything that couldn't be carried over is listed in the form's import notes and in the log.
 * ============================================================================================= */
const core = require("./core");
const { db } = core;
const V2 = require("./mk-forms-v2");
const MK = () => require("./mk-core");

const BASE = "https://a.klaviyo.com/api";
const REVISION = process.env.KLAVIYO_FORMS_REVISION || "2026-10-15";
const KEY = () => process.env.KLAVIYO_API_KEY || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function kget(path, tries = 0) {
  const r = await fetch(path.startsWith("http") ? path : BASE + path, { headers: { Authorization: `Klaviyo-API-Key ${KEY()}`, revision: REVISION, accept: "application/vnd.api+json" }, signal: AbortSignal.timeout(30000) });
  if (r.status === 429 && tries < 6) { await sleep((Number(r.headers.get("retry-after")) || 2 ** tries) * 1000); return kget(path, tries + 1); }
  if (!r.ok) { const t = await r.text().catch(() => ""); throw Object.assign(new Error(`Klaviyo ${r.status} on ${path}: ${t.slice(0, 240)}`), { status: r.status }); }
  return r.json();
}
async function kall(path) { const out = []; let next = path; while (next && out.length < 500) { const j = await kget(next); out.push(...(j.data || [])); next = j.links && j.links.next; await sleep(350); } return out; }

const rid = () => "b" + Math.random().toString(36).slice(2, 8);
const pad = (p, d = [0, 0, 0, 0]) => p ? [Number(p.top) || 0, Number(p.right) || 0, Number(p.bottom) || 0, Number(p.left) || 0] : d;
/** "rgba(20,20,20,0.6)" → { hex, pct } */
function rgba(c) {
  const s = String(c || "").trim(); if (!s) return null;
  if (/^#[0-9a-f]{3,8}$/i.test(s)) return { hex: s.length === 4 ? "#" + s.slice(1).split("").map((x) => x + x).join("") : s.slice(0, 7), pct: 100, raw: s };
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/i); if (!m) return { hex: s, pct: 100, raw: s };
  const h = "#" + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("").toUpperCase();
  return { hex: h, pct: m[4] == null ? 100 : Math.round(Number(m[4]) * 100), raw: s };
}
const col = (c, dflt) => { const r = rgba(c); if (!r) return dflt; return r.pct < 100 ? r.raw : r.hex; };
const font = (f) => (f ? (/,/.test(f) ? f : `'${String(f).replace(/['"]/g, "")}', Helvetica, Arial, sans-serif`) : null);
const WIDTHS = { small: 400, medium: 600, large: 800, full: 1000 };

const imgCache = new Map(); let imgErr = false, onsite = undefined;
const IMG_RE = /^https?:\/\/[^\s"']+\.(png|jpe?g|gif|webp|avif)(\?[^\s"']*)?$/i;
function urlsIn(o, out = []) { if (o == null) return out; if (typeof o === "string") { if (IMG_RE.test(o.trim()) || /klaviyo.*\/images?\//i.test(o) && /^https?:/.test(o)) out.push(o.trim()); return out; }
  if (Array.isArray(o)) o.forEach((x) => urlsIn(x, out)); else if (typeof o === "object") Object.values(o).forEach((x) => urlsIn(x, out)); return out; }
/** Klaviyo's own storefront script loads each form with its image addresses; read that once (public, no key). */
async function onsiteForms() {
  if (onsite !== undefined) return onsite;
  onsite = null;
  try {
    const acc = await kget("/accounts/"); const pk = acc.data && acc.data[0] && acc.data[0].attributes && acc.data[0].attributes.public_api_key;
    if (!pk) { note("onsite: no public key on the account"); return null; }
    for (const u of [`https://fast.a.klaviyo.com/forms/api/v7/${pk}/full-forms`, `https://fast.a.klaviyo.com/forms/api/v6/${pk}/full-forms`, `https://fast.a.klaviyo.com/forms/api/v4/${pk}/full-forms`, `https://fast.a.klaviyo.com/forms/api/v7/${pk}/forms`]) {
      try { const r = await fetch(u, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20000) }); const t = await r.text();
        note(`onsite ${u.replace(pk, "<site>")}: ${r.status} · ${t.length} bytes · ${urlsIn((() => { try { return JSON.parse(t); } catch (e) { return null; } })()).length} image links`);
        if (r.ok && t.length > 50) { try { onsite = JSON.parse(t); break; } catch (e) {} } } catch (e) { note(`onsite ${u.replace(pk, "<site>")}: ${e.message}`); }
    }
  } catch (e) { note(`onsite: ${e.message.slice(0, 160)}`); }
  return onsite;
}
/** Find the address of image <id>: an object that names the id and carries an image link. */
function findById(o, id) {
  let hit = ""; const want = String(id);
  const walk = (x) => { if (hit || x == null || typeof x !== "object") return; if (Array.isArray(x)) return x.forEach(walk);
    const vals = Object.entries(x);
    if (vals.some(([k, v]) => /^(id|image_id|imageId|asset_id)$/.test(k) && String(v) === want)) { const u = urlsIn(x)[0]; if (u) { hit = u; return; } }
    vals.forEach(([, v]) => walk(v)); };
  walk(o); return hit;
}
async function imageUrl(id, raw) {
  const inline = urlsIn(raw)[0]; if (inline) return inline;
  if (!id) return "";
  if (imgCache.has(id)) return imgCache.get(id);
  let url = "";
  try { const j = await kget(`/images/${id}/`); const at = (j.data && j.data.attributes) || {}; url = at.image_url || at.url || at.src || ""; }
  catch (e) { if (!imgErr) { imgErr = true; note(`image ${id}: Images API ${e.status || ""} (form images aren't in the image library); trying the storefront copy`); } }
  if (!url) { const os = await onsiteForms(); if (os) { url = findById(os, id); note(`image ${id}: ${url ? "found on the storefront copy" : "not found on the storefront copy"}`); } }
  imgCache.set(id, url); await sleep(300); return url;
}

/** One Klaviyo block → Buzzin block (or null), with notes for anything dropped. */
async function block(b, notes, ctx) {
  const p = b.properties || {}, s = b.styles || {};
  const st = { pad: pad(s.padding, [0, 0, 10, 0]), align: s.horizontal_alignment || (s.text_styles && s.text_styles.alignment) || "center", ...(s.background_color && rgba(s.background_color) && rgba(s.background_color).pct > 0 ? { bg: col(s.background_color) } : {}) };
  const t = String(b.type || "").toLowerCase();
  const key = (n, d) => String((n || d || "answer")).replace(/^\$/, "").replace(/[^a-z0-9_]/gi, "_").toLowerCase().slice(0, 40);
  const options = (o) => (Array.isArray(o) ? o : []).map((x) => (typeof x === "string" ? x : x && (x.label || x.value))).filter(Boolean);
  switch (t) {
    case "html_text": case "text": case "rich_text": return { id: rid(), type: "text", html: String(p.content || p.html || ""), st };
    case "email": return { id: rid(), type: "email", label: p.label || "Email", show_label: !!p.show_label, placeholder: p.placeholder || "Email", required: p.required !== false, show_consent: false, st };
    case "phone_number": return { id: rid(), type: "phone", label: p.label || "Phone", show_label: !!p.show_label, placeholder: p.placeholder || "Phone number", required: !!p.required, st };
    case "sms_disclosure": ctx.hadDisclosure = true; return null;   // Buzzin's phone block carries the consent wording + unchecked box
    case "image": { const src = await imageUrl(p.image && p.image.id, b); if (!src) notes.push("an image block's picture couldn't be copied: re-add it with Upload"); return { id: rid(), type: "image", src, alt: (p.image && p.image.alt_text) || "", width: s.width && Number(s.width) ? Math.min(100, Math.round(Number(s.width) / (ctx.width || 600) * 100)) : 100, st }; }
    case "button": {
      const a = b.action || {}, at = String(a.type || "").toLowerCase(), ap = a.properties || {};
      if (ap.list_id) ctx.listIds.add(String(ap.list_id));
      let action = "submit", extra = {};
      if (at === "close") action = "close";
      else if (at === "next_step") action = a.submit === false ? "next" : "submit";
      else if (/url|redirect|link/.test(at)) { action = "url"; extra = { url: ap.url || ap.redirect_url || "/", new_tab: !!ap.new_tab }; }
      else if (at === "go_to_inbox") { action = "close"; notes.push('a "Go to inbox" button now closes the form'); }
      else if (/coupon|copy/.test(at)) action = "copy";
      else if (at === "submit") action = "submit";
      else if (at) notes.push(`button action "${at}" became Submit`);
      const ts = s.text_styles || {}, bs = s.border_styles || {};
      const btn = { id: rid(), type: "button", text: p.label || "Submit", action, ...extra, st };
      const bg = rgba(s.color || s.background_color);
      if (bg && bg.pct === 0) btn.look = "link";
      else if (s.color || s.background_color) btn.bg = col(s.color || s.background_color);
      if (ts.text_color) btn.color = col(ts.text_color);
      if (bs.radius != null) btn.radius = Number(bs.radius);
      if (s.width === "fit") btn.full = false; else if (s.width === "full" || s.width === "full_width") btn.full = true;
      if (!ctx.buttonStyle && btn.look !== "link") ctx.buttonStyle = { ts, bs, height: s.height, bg: s.color || s.background_color };
      return btn;
    }
    case "coupon": case "coupon_code": ctx.coupon = true; return { id: rid(), type: "coupon", copy: true, copy_text: "Copy", st };
    case "countdown_timer": case "countdown": return { id: rid(), type: "countdown", mode: p.end_date || p.date ? "date" : "minutes", date: p.end_date || p.date || "", minutes: Number(p.minutes || p.duration_minutes) || 15, expired_text: p.expired_text || "Offer ended", st };
    case "spacer": return { id: rid(), type: "spacer", height: Number(s.height || p.height) || 16, st };
    case "horizontal_rule": case "divider": case "line": return { id: rid(), type: "divider", thickness: Number((s.border_styles || {}).thickness || s.thickness) || 1, color: col((s.border_styles || {}).color || s.color, "#E5E5E5"), width: 100, st };
    case "html": return { id: rid(), type: "html", html: String(p.content || p.html || ""), st };
    case "text_input": case "input": case "text_field": return { id: rid(), type: "input", label: p.label || "", show_label: !!p.show_label, placeholder: p.placeholder || "", key: key(p.property_name, p.label), required: !!p.required, st };
    case "date": case "date_picker": return { id: rid(), type: "date", label: p.label || "Date", show_label: true, key: key(p.property_name, p.label), required: !!p.required, st };
    case "dropdown": case "select": return { id: rid(), type: "dropdown", label: p.label || "", show_label: !!p.show_label, placeholder: p.placeholder || "Choose…", key: key(p.property_name, p.label), options: options(p.options || p.choices), required: !!p.required, st };
    case "radio_buttons": case "radio": case "radio_button": return { id: rid(), type: "radio", label: p.label || "", key: key(p.property_name, p.label), options: options(p.options || p.choices), display: "buttons", required: !!p.required, st };
    case "checkboxes": case "checkbox": return { id: rid(), type: "checkboxes", label: p.label || "", key: key(p.property_name, p.label), options: options(p.options || p.choices), required: !!p.required, st };
    default: notes.push(`"${t}" block isn't in Buzzin yet (left out)`); ctx.unknown.add(t); return null;
  }
}

async function convertVersion(form, v) {
  const notes = [], ctx = { listIds: new Set(), unknown: new Set(), width: 600 };
  const s = v.styles || {}, P = v.properties || {};
  const style = V2.STYLE_DEFAULT();
  style.type = { popup: "popup", flyout: "flyout", banner: "banner", "full-page": "full", full_page: "full", fullpage: "full", embed: "embedded", embedded: "embedded" }[String(v.type || "popup").toLowerCase()] || "popup";
  const loc = String(v.location || "").toLowerCase().replace(/_/g, "-");
  if (style.type === "flyout") style.position = /top/.test(loc) ? (/left/.test(loc) ? "top-left" : "top-right") : /left/.test(loc) ? "bottom-left" : "bottom-right";
  if (style.type === "banner") style.position = /bottom/.test(loc) ? "bottom" : "top";
  style.width = s.width === "custom" ? Number(s.custom_width) || 600 : WIDTHS[s.width] || 600; ctx.width = style.width;
  if (s.minimum_height) style.min_height = Number(s.minimum_height);
  if (s.background_color) style.bg = col(s.background_color, "#FFFFFF");
  if (s.background_image && s.background_image.properties) style.bg_image = await imageUrl(s.background_image.properties.id, s.background_image);
  const bs = s.border_styles || {}; if (bs.radius != null) style.radius = Number(bs.radius); if (bs.thickness) { style.border_width = Number(bs.thickness); style.border_color = col(bs.color, style.border_color); }
  if (s.padding) style.pad = pad(s.padding, style.pad);
  if (s.drop_shadow) style.shadow = s.drop_shadow.enabled !== false;
  const ov = rgba(s.overlay_color); if (ov) { style.overlay.color = ov.hex; style.overlay.opacity = ov.pct; }
  if (P.click_outside_to_close != null) style.overlay.close_on_click = !!P.click_outside_to_close;
  const cb = s.close_button || {}; if (cb.color) style.close.color = col(cb.color); if (cb.background_color) style.close.bg = col(cb.background_color); if (cb.size) style.close.size = Math.max(20, Math.min(56, Number(cb.size) * (Number(cb.size) < 10 ? 4 : 1)));
  if (P.show_close_button === false) style.close.show = false;
  const rt = s.rich_text_styles || {};
  const tx = (o, into) => { if (!o) return; if (o.font_family) into.family = font(o.font_family); if (o.font_size) into.size = Number(o.font_size); if (o.text_color) into.color = col(o.text_color); if (o.font_weight) into.weight = Number(o.font_weight) || into.weight; };
  tx(rt.body, style.font); tx(rt.h1, style.h1); tx(rt.h2, style.h2);
  const is = s.input_styles || {}; const its = is.text_styles || {};
  if (is.background_color) style.input.bg = col(is.background_color); if (is.text_color || its.text_color) style.input.color = col(is.text_color || its.text_color);
  if (is.border_color) style.input.border = col(is.border_color); if (is.label_color) style.input.label_color = col(is.label_color);
  if (is.corner_radius != null) style.input.radius = Number(is.corner_radius); if (is.field_height) style.input.height = Number(is.field_height); if (its.font_size) style.input.font_size = Number(its.font_size);
  if (s.mobile_overlay) style.mobile.sheet = !s.mobile_overlay.enabled ? style.mobile.sheet : true;
  const side = P.side_image_settings || {};
  const sideW = { small: 33, medium: 42, large: 50 }[side.size] || 42;

  const steps = [];
  const vsteps = v.steps || [];
  for (let i = 0; i < vsteps.length; i++) {
    const k = vsteps[i], cols = k.columns || [];
    const out = { id: `s${i + 1}`, name: k.name || `Step ${i + 1}`, kind: "step", image: { src: "", pos: "none", width: sideW }, blocks: [] };
    note(`step "${k.name}" layout: ${JSON.stringify(cols.map((c) => ({ keys: Object.keys(c).filter((x) => x !== "rows"), styles: c.styles, rows: (c.rows || []).map((r) => (r.blocks || []).map((b) => b.type === "image" ? { image: b.properties, styles: b.styles } : b.type)) }))).slice(0, 1500)}`);
    const isImgOnly = (c) => { const bl = (c.rows || []).flatMap((r) => r.blocks || []); return bl.length >= 1 && bl.every((b) => String(b.type).toLowerCase() === "image") && bl.length <= 1; };
    const colImg = (c) => (c.image || (c.properties && c.properties.image) || (c.styles && c.styles.background_image) || null);
    for (let ci = 0; ci < cols.length; ci++) {
      const c = cols[ci], rows = c.rows || [], bl = rows.flatMap((r) => r.blocks || []);
      // Klaviyo's side image: a second column holding only an image (or a column whose own image/background is the picture)
      const ci0 = colImg(c);
      if (cols.length > 1 && (isImgOnly(c) || (ci0 && !bl.length))) {
        const img = ci0 ? (ci0.properties || ci0) : (bl[0].properties && bl[0].properties.image) || {};
        const pos = side.alignment ? (side.alignment === "left" ? "left" : "right") : ci === 0 ? "left" : "right";
        out.image = { src: await imageUrl(img.id, ci0 || bl[0]), pos, width: sideW };
        if (!out.image.src) notes.push(`step "${k.name || i + 1}": side photo couldn't be copied; the split is kept, add the photo in Step ⋮ → Step settings → Side image`);
        continue;
      }
      for (const r of rows) for (const b0 of r.blocks || []) { const nb = await block(b0, notes, ctx); if (nb) out.blocks.push(nb); }
    }
    // Klaviyo can also keep the side image only in the version settings
    if (out.image.pos === "none" && side && side.alignment && (P.side_image || P.side_image_settings && P.side_image_settings.image)) {
      const si = P.side_image || P.side_image_settings.image; out.image = { src: await imageUrl(si.id || (si.image && si.image.id), si), pos: side.alignment === "left" ? "left" : "right", width: sideW };
      if (!out.image.src) notes.push(`step "${k.name || i + 1}": side photo couldn't be copied; add it in Step settings`);
    }
    if (out.blocks.some((b) => b.type === "phone")) out.skip_if_sms = true;
    steps.push(out);
  }
  // The last step that has no inputs and no submit button is the success step (Klaviyo's "Success").
  const last = steps[steps.length - 1];
  if (last && /success|thank/i.test(last.name || "") || (last && !last.blocks.some((b) => ["email", "phone", "input", "radio", "checkboxes", "dropdown", "date"].includes(b.type)) && steps.length > 1)) last.kind = "success";
  if (ctx.buttonStyle) {
    const { ts, bs, height, bg } = ctx.buttonStyle;
    if (bg) style.button.bg = col(bg, style.button.bg); if (ts.text_color) style.button.color = col(ts.text_color); if (ts.font_family) style.button.family = font(ts.font_family);
    if (ts.font_size) style.button.font_size = Number(ts.font_size); if (ts.font_weight) style.button.weight = Number(ts.font_weight) || 700;
    if (bs.radius != null) style.button.radius = Number(bs.radius); if (bs.thickness) { style.button.border_width = Number(bs.thickness); style.button.border_color = col(bs.color, style.button.border_color); }
    if (height) style.button.height = Number(height);
  }
  if (ctx.hadDisclosure) notes.push("Klaviyo's SMS disclosure text was replaced by Buzzin's text consent (Brusche Inc. wording with an unchecked box)");

  const targeting = V2.TARGET_DEFAULT(); targeting.delay_s = null; targeting.exit_intent = false;
  let timing = false;
  for (const tr of v.triggers || []) {
    const t = String(tr.type || "").toLowerCase(), tp = tr.properties || {};
    if (t === "delay") { targeting.delay_s = Number(tp.seconds) || 0; timing = true; }
    else if (t === "scroll_percentage") { targeting.scroll_pct = Number(tp.percentage) || 30; timing = true; }
    else if (t === "exit_intent") { targeting.exit_intent = true; timing = true; }
    else if (t === "after_close_or_submit_timeout") targeting.hide_days_after_close = Number(tp.timeout_days) || 0;
    else if (t === "previously_submitted" || t === "unidentified_profiles") targeting.hide_subscribed = true;
    else if (t === "page_visits" || t === "page_views") targeting.page_views = Number(tp.count || tp.page_visits || tp.pages) || null;
    else if (/device/.test(t)) targeting.device = /mobile/i.test(JSON.stringify(tp)) && !/desktop/i.test(JSON.stringify(tp)) ? "mobile" : /desktop/i.test(JSON.stringify(tp)) && !/mobile/i.test(JSON.stringify(tp)) ? "desktop" : "all";
    else if (/url|page/.test(t)) {
      const inc = [], exc = [];
      const walk = (o, bad) => { if (o == null) return; if (typeof o === "string") { const v = o.trim(); if (/^(https?:\/\/|\/|\*)/.test(v) || /\.(com|net|org)/.test(v) || /utm_|[?&=]/.test(v)) (bad ? exc : inc).push(v); return; }
        if (Array.isArray(o)) return o.forEach((x) => walk(x, bad)); if (typeof o === "object") for (const [k2, v2] of Object.entries(o)) walk(v2, bad || /exclude|deny|block|not_/i.test(k2) || (o.match_type && /not|exclude/i.test(String(o.match_type)))); };
      walk(tp, /exclude|not/.test(t) || !!tp.exclude);
      const toPath = (u) => { const m = String(u).match(/[?&]utm_source=([^&#]+)/i); if (m) { targeting.utm_source = decodeURIComponent(m[1]); return null; } try { const x = new URL(u, "https://x"); return x.pathname === "/" && /^https?:/.test(u) ? null : x.pathname + (/\*$/.test(u) ? "" : ""); } catch (e) { return u; } };
      const all = (x) => x === "*" || x === "/*" || x === "/";   // "*" = every page, which is Buzzin's default
      const ip = inc.filter((x) => !all(x)).map(toPath).filter(Boolean), ep = exc.filter((x) => !all(x)).map(toPath).filter(Boolean);
      if (ip.length) targeting.only_paths = [...new Set(ip)].join("\n"); if (ep.length) targeting.hide_paths = [...new Set(ep)].join("\n");
      note(`rule "${t}" on "${form.attributes ? form.attributes.name : form.id}": ${JSON.stringify(tp).slice(0, 500)}`);
      const hasAny = inc.length || exc.length || JSON.stringify(tp).replace(/null|\[\]|\{\}|"[a-z_]+":|[,\s]/g, "").length;
      if (!ip.length && !ep.length && !targeting.utm_source && hasAny && !inc.every(all)) notes.push(`page rule "${t}" needs to be set again`);
    }
    else if (/utm/.test(t)) targeting.utm_source = String(tp.utm_source || tp.value || "");
    else { notes.push(t === "custom_javascript" ? "Klaviyo's custom JavaScript display rule isn't in Buzzin; check Targeting (utm_source / pages) does what it did" : t === "location" ? "Klaviyo's visitor-location rule isn't in Buzzin yet (shows everywhere)" : `display rule "${t}" isn't in Buzzin yet`); note(`rule "${t}": ${JSON.stringify(tp).slice(0, 500)}`); }
  }
  if (!timing) targeting.immediate = true;

  const tz = v.teaser;
  const teaser = V2.TEASER_DEFAULT();
  if (tz) {
    teaser.enabled = true; teaser.text = String(tz.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Sign up";
    teaser.when = { after: "after_close", before: "before", before_and_after: "both", both: "both" }[String(tz.display_order || "after").toLowerCase()] || "after_close";
    const l = String(tz.location || "").toLowerCase(); teaser.position = /right/.test(l) ? "bottom-right" : /center_left|middle_left|left_center/.test(l) ? "left-middle" : "bottom-left";
    const ts = tz.styles || {}; if (ts.background_color) teaser.bg = col(ts.background_color, teaser.bg); if (ts.corner_radius != null) teaser.radius = Number(ts.corner_radius);
  } else teaser.enabled = false;

  return { steps: V2.cleanSteps(steps), style, targeting, teaser, notes: [...new Set(notes)], listIds: [...ctx.listIds], coupon: !!ctx.coupon, unknown: [...ctx.unknown] };
}

let running = null;
const log = [];
const note = (m) => { log.push(`${new Date().toISOString().slice(11, 19)} ${m}`); if (log.length > 60) log.shift(); console.log(`📝 Klaviyo forms: ${m}`); };

async function importAll(who, { refresh = false } = {}) {
  if (running) return running;
  running = (async () => {
    if (!KEY()) throw new Error("KLAVIYO_API_KEY isn't set in Railway.");
    await db(`CREATE TABLE IF NOT EXISTS mk_form_imports (ext_id TEXT PRIMARY KEY, form_id BIGINT, raw JSONB, notes JSONB, at TIMESTAMPTZ DEFAULT now())`);
    const list = await kall("/forms/");
    note(`${list.length} forms in Klaviyo`);
    const F = require("./mk-forms");
    const brand = MK().STORES.lb;
    let made = 0, skipped = 0, failed = 0;
    for (const f0 of list) {
      try {
        const j = await kget(`/forms/${f0.id}/`); await sleep(400);
        const a = (j.data && j.data.attributes) || {};
        const def = a.definition || {};
        const versions = def.versions || [];
        if (!versions.length) { note(`"${a.name}": no definition returned (revision ${REVISION})`); failed++; continue; }
        for (const v of versions) {
          const ext = `${f0.id}:${v.id || v.name || 0}`;
          const prior = (await db(`SELECT form_id FROM mk_form_imports WHERE ext_id=$1`, [ext])).rows[0];
          if (prior && prior.form_id && !refresh) { const still = (await db(`SELECT 1 FROM mk_forms WHERE id=$1`, [prior.form_id])).rows.length; if (still) { skipped++; continue; } }
          const c = await convertVersion(f0, v);
          let listId = null;
          for (const kid of c.listIds) { const r = (await db(`SELECT id FROM mk_lists WHERE source='klaviyo' AND ext_id=$1`, [`list:${kid}`])).rows[0]; if (r) { listId = r.id; break; } }
          if (!listId) listId = (await MK().ensureList("lb", "Sign-up form", { source: "buzzin", ext_id: "signup-form", description: "Everyone who signs up through a Buzzin form" })).id;
          const name = `${a.name || "Klaviyo form"}${versions.length > 1 ? ` · ${v.name || "variant"}` : ""}`.slice(0, 120);
          const coupon = { enabled: c.coupon, percent: 10, prefix: "WELCOME", expires_days: 14 };
          if (c.coupon) c.notes.push("check the coupon % on the Coupon block (Klaviyo's coupon settings don't come through the API)");
          let id;
          const untouched = prior && prior.form_id ? (await db(`SELECT updated_by IN ('boot','klaviyo import') OR updated_by IS NULL AS ok FROM mk_forms WHERE id=$1`, [prior.form_id])).rows[0] : null;
          if (prior && prior.form_id && refresh && untouched && !untouched.ok) { skipped++; note(`"${a.name}": Buzzin copy was edited, left as is`); continue; }
          if (prior && prior.form_id && refresh && untouched) {
            id = prior.form_id;
            await db(`UPDATE mk_forms SET name=$2, steps=$3, style=$4, targeting=$5, teaser=$6, coupon=$7, list_id=$8, updated_by=$9, updated_at=now() WHERE id=$1`,
              [id, name, JSON.stringify(c.steps), JSON.stringify(c.style), JSON.stringify(c.targeting), JSON.stringify(c.teaser), JSON.stringify(coupon), listId, "klaviyo import"]);
          } else {
            id = (await db(`INSERT INTO mk_forms (store, name, status, steps, style, targeting, teaser, coupon, list_id, sms_consent_text, email_consent_text, source, ext_id, updated_by)
                VALUES ('lb',$1,'draft',$2,$3,$4,$5,$6,$7,$8,$9,'klaviyo',$10,$11) RETURNING id`,
              [name, JSON.stringify(c.steps), JSON.stringify(c.style), JSON.stringify(c.targeting), JSON.stringify(c.teaser), JSON.stringify(coupon), listId, F.SMS_CONSENT(brand), F.EMAIL_CONSENT(brand), ext, who || "klaviyo import"])).rows[0].id;
            made++;
          }
          await db(`INSERT INTO mk_form_imports (ext_id, form_id, raw, notes) VALUES ($1,$2,$3,$4) ON CONFLICT (ext_id) DO UPDATE SET form_id=EXCLUDED.form_id, raw=EXCLUDED.raw, notes=EXCLUDED.notes, at=now()`,
            [ext, id, JSON.stringify({ form: { id: f0.id, name: a.name, status: a.status }, version: v }), JSON.stringify(c.notes)]);
          const types = {}; for (const st of v.steps || []) for (const cl of st.columns || []) for (const r of cl.rows || []) for (const b of r.blocks || []) types[b.type] = (types[b.type] || 0) + 1;
          note(`"${name}" → Buzzin form ${id} · ${String(v.type)} · ${c.steps.length} steps · blocks ${JSON.stringify(types)} · triggers ${(v.triggers || []).map((t) => t.type).join(",") || "none"}${c.notes.length ? " · notes: " + c.notes.join("; ") : ""}`);
        }
      } catch (e) { failed++; note(`"${(f0.attributes && f0.attributes.name) || f0.id}" failed: ${e.message}`); }
    }
    const out = `${made} copied as drafts, ${skipped} already in Buzzin, ${failed} failed`;
    note(out);
    await core.syncSet("mk_forms_klaviyo_v1", new Date().toISOString(), { out, by: who || "system" }).catch(() => {});
    await core.audit({ kind: "mk-forms-import", detail: `Klaviyo forms: ${out}`, who: who || "system" }).catch(() => {});
    require("./mk-forms").clearCache && require("./mk-forms").clearCache();
    return out;
  })().finally(() => { running = null; });
  return running;
}

async function notesFor(formId) { try { const r = (await db(`SELECT notes FROM mk_form_imports WHERE form_id=$1 ORDER BY at DESC LIMIT 1`, [Number(formId)])).rows[0]; return r ? r.notes : null; } catch (e) { return null; } }

function routes(app, { admin, actorOf, fail }) {
  app.post("/api/mk/forms/import-klaviyo", async (req, res) => { if (!admin(req, res)) return; const who = actorOf(req); importAll(who, { refresh: !!(req.body && req.body.refresh) }).catch((e) => note(`failed: ${e.message}`)); res.json({ started: true }); });
  app.get("/api/mk/forms/import-klaviyo", async (req, res) => { if (!admin(req, res)) return; try { const s = await core.syncGet("mk_forms_klaviyo_v1").catch(() => null); res.json({ running: !!running, last: s ? { at: s.cursor, ...(s.state || {}) } : null, log: log.slice(-30) }); } catch (e) { fail(res, e); } });
}

async function init() {
  // Copy the Klaviyo forms once, shortly after boot (later copies run from the Sign-up forms page).
  setTimeout(async () => { try { const done = await core.syncGet("mk_forms_klaviyo_v4").catch(() => null); if (!done && KEY()) { await importAll("boot", { refresh: true }); await core.syncSet("mk_forms_klaviyo_v4", new Date().toISOString(), {}).catch(() => {}); } } catch (e) { note(`failed: ${e.message}`); } }, 75 * 1000);
}

module.exports = { init, routes, importAll, convertVersion, notesFor };
