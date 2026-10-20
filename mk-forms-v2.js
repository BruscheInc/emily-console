/* =============================================================================================
 *  Buzzin Marketing · sign-up form model v2 (mirrors Klaviyo's form builder)
 *
 *  A form is steps → blocks, like Klaviyo:
 *    steps:  [{ id, name, kind: "step"|"success", blocks: [...], image: { src, pos, width }, next, branches, skip_if_sms }]
 *    blocks: text · image · button · email · phone · input · checkboxes · radio · dropdown · date ·
 *            coupon · countdown · spacer · divider · html     (each with st: { pad:[t,r,b,l], bg, align })
 *    style:  { v: 2, type, position, width, …, overlay, close, font, h1, h2, input, button, mobile, anim }
 *    targeting (Behaviors + Targeting): delay_s, scroll_pct, exit_intent, page_views, immediate,
 *            hide_days_after_close, success_close_s, device, visitors, hide_subscribed, hide_sms_subscribed,
 *            only_paths, hide_paths, utm_source
 *    teaser: { enabled, text, when: "after_close"|"before"|"both", position, bg, color, radius }
 *  Email and text consent wording stay on the form (email_consent_text / sms_consent_text) so the exact
 *  wording a person agreed to is what gets recorded. The phone block always shows an UNCHECKED consent box.
 *  toV2() converts old forms (fixed email/phone/question/success steps) on read, so nothing breaks.
 * ============================================================================================= */
const rid = () => "b" + Math.random().toString(36).slice(2, 8);
const BLOCK_TYPES = ["text", "image", "button", "email", "phone", "input", "checkboxes", "radio", "dropdown", "date", "coupon", "countdown", "spacer", "divider", "html", "wheel", "counter", "reviews"];

const STYLE_DEFAULT = () => ({
  v: 2, type: "popup", position: "center", width: 460, min_height: 0,
  bg: "#FFFFFF", bg_image: "", bg_fit: "cover", border_color: "#E5E5E5", border_width: 0, radius: 16, shadow: true,
  pad: [32, 28, 28, 28],
  overlay: { color: "#14141E", opacity: 45, close_on_click: true },
  close: { show: true, style: "circle", color: "#242F3F", bg: "rgba(0,0,0,0.06)", size: 32, outside: false },
  font: { family: "Helvetica, Arial, sans-serif", size: 16, color: "#242F3F" },
  h1: { family: "Georgia, serif", size: 30, color: "#242F3F", weight: 700 },
  h2: { family: "Georgia, serif", size: 22, color: "#242F3F", weight: 700 },
  input: { bg: "#FFFFFF", color: "#111111", border: "rgba(0,0,0,0.2)", radius: 10, height: 46, font_size: 16, label_color: "#242F3F", show_labels: false },
  button: { bg: "#242F3F", color: "#FFFFFF", radius: 999, font_size: 16, weight: 700, height: 48, full: true, border_color: "#242F3F", border_width: 0 },
  mobile: { width_pct: 100, pad: [24, 20, 20, 20], scale: 100, sheet: true },
  anim: "fade",
});
const TARGET_DEFAULT = () => ({ delay_s: 6, scroll_pct: null, exit_intent: true, page_views: null, immediate: false, hide_days_after_close: 14, success_close_s: null,
  device: "all", visitors: "all", hide_subscribed: true, hide_sms_subscribed: true, only_paths: "", hide_paths: "", utm_source: "" });
const TEASER_DEFAULT = () => ({ enabled: true, text: "Get 10% off", when: "after_close", position: "bottom-left", bg: "#242F3F", color: "#FFFFFF", radius: 999 });

const B = {
  text: (html, st) => ({ id: rid(), type: "text", html, st: { pad: [0, 0, 10, 0], ...(st || {}) } }),
  button: (text, action, extra) => ({ id: rid(), type: "button", text, action, ...(extra || {}), st: { pad: [6, 0, 0, 0] } }),
  link: (text, action, extra) => ({ id: rid(), type: "button", text, action, look: "link", ...(extra || {}), st: { pad: [4, 0, 0, 0] } }),
};
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function defaultSteps() {
  return [
    { id: "s1", name: "Sign-up", kind: "step", image: { src: "", pos: "left", width: 42 }, blocks: [
      B.text('<p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.75">Welcome to the family</p>', { pad: [0, 0, 4, 0] }),
      B.text("<h1>Take 10% off your first order</h1>"),
      B.text("<p>Join for early access to new prints and members-only offers.</p>"),
      { id: rid(), type: "email", placeholder: "Email address", label: "Email", required: true, show_consent: true, st: { pad: [4, 0, 4, 0] } },
      B.button("Continue", "submit"),
      B.link("No thanks", "close"),
    ] },
    { id: "s2", name: "SMS", kind: "step", skip_if_sms: true, image: { src: "", pos: "left", width: 42 }, blocks: [
      B.text("<h1>Get texts for early access</h1>"),
      B.text("<p>Be first to know when new prints drop.</p>"),
      { id: rid(), type: "phone", placeholder: "Phone number", label: "Phone", required: true, st: { pad: [4, 0, 4, 0] } },
      B.button("Sign me up", "submit"),
      B.link("No thanks", "next"),
    ] },
    { id: "s3", name: "Success", kind: "success", image: { src: "", pos: "none", width: 42 }, blocks: [
      B.text("<h1>You're in!</h1>"),
      B.text("<p>Here's your 10% off code. It also went to your inbox.</p>"),
      { id: rid(), type: "coupon", st: { pad: [6, 0, 6, 0] } },
      B.button("Start shopping", "url", { url: "/collections/all" }),
    ] },
  ];
}

/** Old form (fixed step kinds) → v2 blocks. Already-v2 forms come back unchanged (with any missing defaults filled in). */
function toV2(f) {
  if (!f) return f;
  const style0 = f.style || {};
  if (style0.v === 2) {
    const d = STYLE_DEFAULT();
    return { ...f, style: { ...d, ...style0, overlay: { ...d.overlay, ...(style0.overlay || {}) }, close: { ...d.close, ...(style0.close || {}) }, font: { ...d.font, ...(style0.font || {}) },
      h1: { ...d.h1, ...(style0.h1 || {}) }, h2: { ...d.h2, ...(style0.h2 || {}) }, input: { ...d.input, ...(style0.input || {}) }, button: { ...d.button, ...(style0.button || {}) }, mobile: { ...d.mobile, ...(style0.mobile || {}) } },
      targeting: { ...TARGET_DEFAULT(), ...(f.targeting || {}) }, teaser: { ...TEASER_DEFAULT(), ...(f.teaser || {}) } };
  }
  const c = style0.colors || {};
  const style = STYLE_DEFAULT();
  style.type = { popup: "popup", flyout: "flyout", full: "full", banner: "banner", embedded: "embedded" }[style0.layout] || "popup";
  style.position = style.type === "flyout" ? (style0.side === "left" ? "bottom-left" : "bottom-right") : style.type === "banner" ? (style0.edge === "bottom" ? "bottom" : "top") : "center";
  if (style0.width) style.width = Number(style0.width);
  if (style0.radius != null) style.radius = Number(style0.radius);
  if (c.bg) style.bg = c.bg;
  if (c.text) { style.font.color = c.text; style.h1.color = c.text; style.h2.color = c.text; style.input.label_color = c.text; style.close.color = c.text; }
  if (c.button) { style.button.bg = c.button; style.button.border_color = c.button; }
  if (c.button_text) style.button.color = c.button_text;
  if (style0.heading_font) { style.h1.family = style0.heading_font; style.h2.family = style0.heading_font; }
  if (style0.font) style.font.family = style0.font;
  if (style0.heading_size) style.h1.size = Number(style0.heading_size);
  const align = style0.align === "left" ? "left" : "center";
  const img = style0.image || "";
  const steps = (f.steps || []).map((s, i) => {
    const blocks = [];
    if (s.eyebrow) blocks.push(B.text(`<p style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.75">${esc(s.eyebrow)}</p>`, { pad: [0, 0, 4, 0] }));
    if (s.title) blocks.push(B.text(`<h1>${esc(s.title)}</h1>`));
    if (s.text) blocks.push(B.text(`<p>${esc(s.text)}</p>`));
    if (s.kind === "email") {
      blocks.push({ id: rid(), type: "email", label: s.label || "Email", placeholder: s.placeholder || "you@example.com", required: true, show_consent: true, st: { pad: [4, 0, 4, 0] } });
      blocks.push(B.button(s.button || "Continue", "submit"));
      if (s.decline !== "") blocks.push(B.link(s.decline || "No thanks", "close"));
    } else if (s.kind === "phone") {
      blocks.push({ id: rid(), type: "phone", label: s.label || "Phone", placeholder: "(555) 555-0123", required: true, st: { pad: [4, 0, 4, 0] } });
      blocks.push(B.button(s.button || "Continue", "submit"));
      blocks.push(B.link(s.skip || "No thanks", "next"));
    } else if (s.kind === "question") {
      for (const q of s.fields || []) {
        if (q.type === "choice") blocks.push({ id: rid(), type: "radio", label: q.label, key: q.key, options: q.options || [], display: "buttons", st: { pad: [4, 0, 4, 0] } });
        else if (q.type === "date") blocks.push({ id: rid(), type: "date", label: q.label, key: q.key, st: { pad: [4, 0, 4, 0] } });
        else blocks.push({ id: rid(), type: "input", label: q.label, key: q.key, placeholder: "", st: { pad: [4, 0, 4, 0] } });
      }
      blocks.push(B.button(s.button || "Continue", "submit"));
      blocks.push(B.link(s.skip || "Skip", "next"));
    } else if (s.kind === "success") {
      blocks.push({ id: rid(), type: "coupon", st: { pad: [6, 0, 6, 0] } });
      if (s.button) blocks.push(B.button(s.button, "url", { url: s.link || "/" }));
    }
    blocks.forEach((b) => { b.st = { align, ...(b.st || {}) }; });
    return { id: s.id || `s${i + 1}`, name: { email: "Sign-up", phone: "SMS", question: "Questions", success: "Success" }[s.kind] || `Step ${i + 1}`,
      kind: s.kind === "success" ? "success" : "step", skip_if_sms: s.kind === "phone", next: s.next, branches: s.branches,
      image: { src: s.kind === "success" ? "" : img, pos: img && s.kind !== "success" ? "left" : "none", width: 42 }, blocks };
  });
  const t0 = f.targeting || {};
  const teaser = { ...TEASER_DEFAULT(), enabled: !!(f.teaser && f.teaser.text), text: (f.teaser && f.teaser.text) || "Get 10% off", position: style0.side === "right" ? "bottom-right" : "bottom-left", bg: style.button.bg, color: style.button.color };
  return { ...f, steps, style, targeting: { ...TARGET_DEFAULT(), ...t0 }, teaser };
}

/** Keep only what the model allows; strip scripts and event handlers from rich text. */
const cleanHtml = (h, allowScript) => {
  let s = String(h || "").slice(0, 20000);
  if (!allowScript) s = s.replace(/<\s*(script|iframe|object|embed|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, "").replace(/<\s*(script|iframe|object|embed)[^>]*>/gi, "");
  return s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/javascript:/gi, "");
};
function cleanSteps(steps) {
  return (Array.isArray(steps) ? steps : []).slice(0, 10).map((s, i) => ({
    id: String(s.id || `s${i + 1}`).slice(0, 20), name: String(s.name || `Step ${i + 1}`).slice(0, 40), kind: s.kind === "success" ? "success" : "step",
    skip_if_sms: !!s.skip_if_sms, next: s.next || undefined, branches: Array.isArray(s.branches) ? s.branches.slice(0, 10) : undefined,
    image: { src: String((s.image && s.image.src) || "").slice(0, 1000), pos: ["left", "right", "top", "none"].includes(s.image && s.image.pos) ? s.image.pos : "none", width: Math.min(70, Math.max(20, Number(s.image && s.image.width) || 50)) },
    blocks: (Array.isArray(s.blocks) ? s.blocks : []).filter((b) => b && BLOCK_TYPES.includes(b.type)).slice(0, 40).map((b) => {
      const o = { ...b, id: String(b.id || rid()).slice(0, 20) };
      if (o.type === "text") o.html = cleanHtml(o.html, false);
      if (o.type === "html") o.html = cleanHtml(o.html, false);
      if (o.key) o.key = String(o.key).replace(/[^a-z0-9_]/gi, "_").toLowerCase().slice(0, 40);
      if (o.options) o.options = (Array.isArray(o.options) ? o.options : []).map(String).filter(Boolean).slice(0, 30);
      if (o.type === "wheel") o.slices = (Array.isArray(o.slices) ? o.slices : []).slice(0, 12).map((x) => ({ label: String((x && x.label) || "").slice(0, 24), percent: Math.max(0, Math.min(90, Number(x && x.percent) || 0)), weight: Math.max(0, Number(x && x.weight) || 0), color: /^#[0-9a-f]{3,8}$/i.test((x && x.color) || "") ? x.color : undefined }));
      if (o.type === "reviews") o.items = (Array.isArray(o.items) ? o.items : []).slice(0, 12).map((x) => ({ text: String((x && x.text) || "").slice(0, 400), name: String((x && x.name) || "").slice(0, 60), stars: Math.max(1, Math.min(5, Number(x && x.stars) || 5)) }));
      if (o.show && !["desktop", "mobile"].includes(o.show)) delete o.show;
      o.beside = !!o.beside || undefined;
      return o;
    }),
  }));
}

module.exports = { toV2, cleanSteps, defaultSteps, STYLE_DEFAULT, TARGET_DEFAULT, TEASER_DEFAULT, BLOCK_TYPES };
