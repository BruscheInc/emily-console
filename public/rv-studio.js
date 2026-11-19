/* Buzzin · Reviews → Customize. A full-screen editor for how reviews look on the store, like the sign-up form editor:
   settings on the left, the real review section (real reviews) on desktop and mobile side by side, autosave, undo/redo,
   preview on the live site, then Publish. Click any part of the preview to jump to its settings. */
(function () {
  const $ = (id) => document.getElementById(id);
  const E = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const I = (n) => `<i class="ti ti-${n}"></i>`;
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const merge = (a, b) => { const o = Array.isArray(a) ? a.slice() : { ...a }; if (b) for (const k in b) { const v = b[k]; o[k] = v && typeof v === "object" && !Array.isArray(v) && a && a[k] && typeof a[k] === "object" ? merge(a[k], v) : v; } return o; };
  const call = (u, o = {}) => api(u, { ...o, headers: { "Content-Type": "application/json", ...(o.headers || {}) } });
  const toastIt = (m, bad) => (typeof toast === "function" ? toast(m, bad) : alert(m));

  let DEF = null, D = null, META = null, STORE = "lb", PANEL = "colors", DEV = "both", ZOOM = "fit", dirty = false, saving = false, saveT = null;
  const HIST = { past: [], future: [], last: "" };
  const ready = { d: false, m: false };

  const PANELS = [
    ["colors", "Colors", "palette"], ["fonts", "Fonts & text", "typography"], ["layout", "Layout", "layout-columns"], ["buttons", "Buttons & chips", "click"],
    ["stars", "Stars", "star"], ["photos", "Photos", "photo"], ["sections", "Show / hide", "eye"], ["words", "Words", "forms"],
    ["list", "Review list", "list-details"], ["mobile", "Mobile", "device-mobile"], ["css", "Custom CSS", "code"],
  ];
  const PICK = { buttons: "buttons", chips: "buttons", photos: "photos", histogram: "colors", stars: "stars", summary: "words", reviewer: "sections", review: "fonts", titlestars: "stars", tabs: "words", meta: "list" };
  const FONTS = [["inherit", "Same as the store"], ["-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", "System sans"], ["Helvetica, Arial, sans-serif", "Helvetica"], ["Georgia, serif", "Georgia"], ["'Times New Roman', serif", "Times"], ["'Trebuchet MS', sans-serif", "Trebuchet"], ["Verdana, sans-serif", "Verdana"], ["ui-monospace, Menlo, monospace", "Monospace"]];

  const CSS = `<style>
  .rve{position:fixed;inset:0;z-index:80;background:#F4F4F5;display:flex;flex-direction:column;font:14px/1.4 inherit;color:var(--ink,#17161F)}
  .rve-top{height:60px;flex:none;display:flex;align-items:center;gap:10px;padding:0 16px;background:#fff;border-bottom:1px solid var(--line,#E4E4E7)}
  .rve-top b{font-size:16px}.rve-top select{height:36px;border:1px solid var(--line,#E4E4E7);border-radius:9px;padding:0 10px;font-weight:600;background:#fff}
  .rve-ib{all:unset;cursor:pointer;width:34px;height:34px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;color:#3F3F46;font-size:18px;flex:none}.rve-ib:hover{background:#F4F4F5}.rve-ib[disabled]{opacity:.35;cursor:default}
  .rve-seg{display:inline-flex;border:1px solid var(--line,#E4E4E7);border-radius:9px;overflow:hidden}.rve-seg button{all:unset;cursor:pointer;padding:0 12px;height:34px;display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:13px}.rve-seg button.on{background:#EEF2FF;color:#3730A3}
  .rve-sv{color:var(--muted,#71717A);font-size:12.5px;display:inline-flex;align-items:center;gap:4px}
  .rve-st{font-size:12px;border-radius:999px;padding:3px 9px;font-weight:600}.rve-st.live{background:#DCFCE7;color:#166534}.rve-st.chg{background:#FEF3C7;color:#92400E}.rve-st.none{background:#F4F4F5;color:#52525B}
  .rve-body{flex:1;display:flex;min-height:0}
  .rve-rail{width:64px;flex:none;background:#fff;border-right:1px solid var(--line,#E4E4E7);display:flex;flex-direction:column;align-items:center;gap:4px;padding-top:10px;overflow-y:auto}
  .rve-rail button{all:unset;cursor:pointer;width:52px;padding:6px 0;border-radius:10px;display:flex;flex-direction:column;align-items:center;gap:2px;color:#3F3F46;font-size:19px}.rve-rail button span{font-size:9.5px;font-weight:600;text-align:center;line-height:1.1}
  .rve-rail button:hover{background:#F4F4F5}.rve-rail button.on{background:#EEF2FF;color:#3730A3;box-shadow:inset 0 0 0 1.5px #6366F1}
  .rve-side{width:350px;flex:none;background:#fff;border-right:1px solid var(--line,#E4E4E7);display:flex;flex-direction:column;min-height:0}
  .rve-sh{padding:16px 18px 4px;font-weight:700;font-size:17px}.rve-pane{flex:1;overflow-y:auto;padding:2px 18px 40px}
  .rve-h{font-weight:700;margin:18px 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted,#71717A)}
  .rve-f{margin-top:10px}.rve-f>label{display:block;font-size:12.5px;font-weight:600;margin-bottom:4px}.rve-f input[type=text],.rve-f input[type=number],.rve-f select,.rve-f textarea{width:100%;border:1px solid var(--line,#E4E4E7);border-radius:8px;padding:7px 9px;font:inherit;font-size:13px;background:#fff}
  .rve-g{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}.rve-g>div{min-width:0}
  .rve-c{display:flex;gap:6px}.rve-c input[type=color]{width:34px;height:32px;flex:none;border:1px solid var(--line,#E4E4E7);border-radius:8px;padding:2px;background:#fff}.rve-c input[type=text]{font-family:ui-monospace,Menlo,monospace;font-size:12px}
  .rve-ck{display:flex;gap:8px;align-items:center;margin-top:9px;font-size:13.5px;cursor:pointer}
  .rve-hint{font-size:11.5px;color:var(--muted,#71717A);margin-top:5px}
  .rve-canvas{flex:1;min-width:0;position:relative;overflow:auto}
  .rve-zw{transform-origin:top left;display:flex;gap:48px;align-items:flex-start;width:max-content;padding:24px}
  .rve-dev{display:flex;flex-direction:column;gap:8px}.rve-dev .cap{display:flex;align-items:center;gap:6px;font-weight:600}
  .rve-dev iframe{border:0;background:#fff;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1)}
  .rve-zoom{position:absolute;right:18px;bottom:18px;display:flex;flex-direction:column;align-items:center;background:#fff;border:1px solid var(--line,#E4E4E7);border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.08)}.rve-zoom span{font:600 12px ui-monospace,Menlo,monospace;padding:4px 0}
  .rve-note{background:#EFF6FF;border:1px solid #BFDBFE;color:#1E3A8A;border-radius:10px;padding:10px 12px;margin-top:12px;font-size:12.5px}
  .rve-pub{background:#17161F;color:#fff;border:0;border-radius:9px;height:36px;padding:0 14px;font-weight:700;cursor:pointer}.rve-pub[disabled]{opacity:.5;cursor:default}
  .rve-btn{background:#fff;border:1px solid var(--line,#E4E4E7);border-radius:9px;height:36px;padding:0 12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;color:inherit;text-decoration:none;font-size:13px}
  </style>`;

  /* ---------- field builders (data-p = path in the design) ---------- */
  const get = (p) => p.split(".").reduce((o, k) => (o == null ? o : o[k]), D);
  const set = (p, v) => { const ks = p.split("."); let o = D; ks.slice(0, -1).forEach((k) => { if (o[k] == null) o[k] = {}; o = o[k]; }); o[ks[ks.length - 1]] = v; };
  const H = (t) => `<div class="rve-h">${E(t)}</div>`;
  const F = (l, inner, hint) => `<div class="rve-f"><label>${E(l)}</label>${inner}${hint ? `<div class="rve-hint">${E(hint)}</div>` : ""}</div>`;
  const G = (...c) => `<div class="rve-g">${c.map((x) => `<div>${x}</div>`).join("")}</div>`;
  const col = (p, l) => { const v = get(p) || ""; return F(l, `<div class="rve-c"><input type="color" data-p="${p}" data-k="color" value="${/^#[0-9a-f]{6}$/i.test(v) ? v : "#ffffff"}"><input type="text" data-p="${p}" value="${E(v)}" placeholder="none"></div>`); };
  const num = (p, l, min, max, hint) => F(l, `<input type="number" data-p="${p}" value="${get(p) == null ? "" : E(get(p))}" min="${min}" max="${max}">`, hint);
  const txt = (p, l, hint) => F(l, `<input type="text" data-p="${p}" value="${E(get(p))}">`, hint);
  const sel = (p, l, opts, hint) => F(l, `<select data-p="${p}">${opts.map(([a, b]) => `<option value="${E(a)}"${String(get(p)) === String(a) ? " selected" : ""}>${E(b)}</option>`).join("")}</select>`, hint);
  const chk = (p, l) => `<label class="rve-ck"><input type="checkbox" data-p="${p}" data-k="bool"${get(p) ? " checked" : ""}> ${E(l)}</label>`;
  const font = (p, l) => { const v = get(p) || "inherit"; const known = FONTS.some(([a]) => a === v); return F(l, `<select data-p="${p}">${FONTS.map(([a, b]) => `<option value="${E(a)}"${v === a ? " selected" : ""}>${E(b)}</option>`).join("")}${known ? "" : `<option value="${E(v)}" selected>${E(v)}</option>`}<option value="__custom">Other font…</option></select>`); };

  function panelHtml() {
    switch (PANEL) {
      case "colors": return `${H("Text")}${G(col("colors.text", "Body text"), col("colors.heading", "Headings & names"))}${G(col("colors.muted", "Light text (dates)"), col("colors.link", "Links"))}
        ${H("Section")}${G(col("colors.bg", "Background"), col("colors.border", "Lines & borders"))}<div class="rve-hint">Leave background empty to blend into the page.</div>
        ${H("Rating bars")}${G(col("colors.bar", "Bar"), col("colors.bar_bg", "Bar track"))}
        ${H("Reviewer")}${G(col("colors.avatar_bg", "Initials circle"), col("colors.avatar_text", "Initials"))}${G(col("colors.verified", "Verified text"), col("colors.verified_badge", "Verified check"))}
        ${H("Boxes")}${G(col("colors.card_bg", "Review card"), col("colors.card_border", "Card border"))}${G(col("colors.reply_bg", "Store reply box"), col("colors.filters_bg", "Filters panel"))}`;
      case "fonts": return `${H("Fonts")}${font("font.family", "Body font")}${font("font.heading_family", "Heading font")}<div class="rve-hint">"Same as the store" uses your theme's font. Other fonts only show if your theme loads them.</div>
        ${H("Sizes (px)")}${G(num("font.size", "Body text", 10, 22), num("font.title_size", "Review title", 11, 30))}${G(num("font.heading_size", "Section headings", 11, 30), num("font.average_size", "Average rating", 12, 48))}
        ${sel("font.title_weight", "Review title weight", [[400, "Regular"], [500, "Medium"], [600, "Semibold"], [700, "Bold"]])}`;
      case "layout": return `${H("Where it shows")}${sel("layout.placement", "Review section on product pages", [["before_related", "Above “You might also like”"], ["after_product", "Right under the product details"], ["end", "At the bottom of the page"]], "To put it anywhere else: in Shopify's theme editor add a Custom Liquid block with <div data-bz-reviews></div> where you want it. That spot wins.")}
        ${sel("layout.stars_placement", "Stars on product pages", [["under_title", "Under the product name"], ["under_price", "Under the price"], ["off", "Don't show"]], "Or add <div data-bz-stars></div> in a Custom Liquid block.")}
        ${H("Size & spacing")}${num("layout.max_width", "Max width (px)", 0, 2000, "0 = as wide as the theme gives it")}${G(num("layout.margin_top", "Space above", 0, 120), num("layout.margin_bottom", "Space below", 0, 120))}
        ${H("Top area")}${sel("layout.top_layout", "Rating summary layout", [["split", "Side by side (ratings left, photos right)"], ["stacked", "Stacked"]])}
        ${H("Reviews")}${sel("layout.row_style", "Review style", [["lines", "Rows with lines between"], ["cards", "Separate cards"]])}${G(num("layout.card_radius", "Card corners", 0, 30), num("layout.row_gap", "Row padding", 6, 50))}
        ${num("layout.aside_width", "Reviewer column width (desktop)", 160, 400)}${chk("layout.aside_box", "Box around the reviewer column")}`;
      case "buttons": return `${H("Buttons")}${sel("layout.button_style", "Style", [["filled", "Filled"], ["outline", "Outline"]])}${G(col("colors.button_bg", "Button color"), col("colors.button_text", "Button text"))}${G(col("colors.button_border", "Border"), num("layout.button_radius", "Corners", 0, 40))}
        ${H("Chips (topics & filters)")}${G(col("colors.chip_bg", "Background"), col("colors.chip_text", "Text"))}${G(col("colors.chip_border", "Border"), num("layout.chip_radius", "Corners", 0, 40))}${G(col("colors.chip_on_bg", "Selected background"), col("colors.chip_on_text", "Selected text"))}`;
      case "stars": return `${H("Look")}${sel("stars.shape", "Shape", [["star", "Star"], ["heart", "Heart"], ["circle", "Circle"]])}${G(col("colors.star", "Filled"), col("colors.star_empty", "Empty"))}${col("colors.star_outline", "Outline")}${chk("stars.outline", "Show outline")}
        ${H("Sizes (px)")}${G(num("stars.size_title", "Under product title", 10, 40), num("stars.size_summary", "Rating summary", 10, 40))}${num("stars.size_review", "On each review", 8, 30)}
        ${H("Under the product title")}${chk("show.title_stars", "Show stars under the product title")}${chk("show.title_count", "Show review count next to them")}${txt("text.title_count", "Count wording", "{count} is replaced with the number")}`;
      case "photos": return `${H("Photo strip (top)")}${chk("show.photo_strip", "Show the customer photo strip")}${G(num("photos.strip_count", "How many", 0, 20), num("photos.strip_size", "Size (px)", 40, 200))}
        ${H("Photos on each review")}${chk("show.review_photos", "Show photos on reviews")}${num("photos.review_size", "Size (px)", 32, 200)}${H("All photos")}${num("photos.image_radius", "Photo corners (px)", 0, 40)}`;
      case "sections": return `${H("Top")}${chk("show.heading", "Section heading")}${chk("show.average", "Average rating line")}${chk("show.histogram", "Star breakdown bars")}${chk("show.recommend", "\u201cWould recommend\u201d percent")}${chk("show.photo_strip", "Customer photo strip")}
        ${H("AI summary")}${chk("show.summary", "Reviews summary paragraph")}${chk("show.topics", "\u201cCustomers talked about\u201d topics")}
        ${H("Toolbar")}${chk("show.tab", "Reviews tab label")}${chk("show.filters", "Filters button")}${chk("show.write", "Write a review button")}${chk("show.count", "Review count")}${chk("show.sort", "Sort menu")}
        ${H("Reviewer column")}${chk("show.avatar", "Initials circle")}${chk("show.name", "Name")}${chk("show.verified", "Verified buyer")}${chk("show.reviewing", "Product they reviewed")}${chk("show.recommend_row", "\u201cI recommend this product\u201d")}${chk("show.attributes", "Size purchased & answers")}
        ${H("Each review")}${chk("show.date", "Date")}${chk("show.review_title", "Title")}${chk("show.review_photos", "Photos")}${chk("show.reply", "Your store's reply")}${chk("show.helpful", "\u201cWas this helpful?\u201d")}`;
      case "words": return `<div class="rve-note">{count} and {brand} are filled in for you.</div>
        ${H("Top")}${txt("text.heading", "Section heading")}${txt("text.based_on", "Based on…")}${txt("text.recommend", "After the % recommend")}${txt("text.summary_title", "Summary title")}${txt("text.topics_title", "Topics title")}
        ${H("Toolbar")}${txt("text.tab", "Tab")}${G(txt("text.filters", "Filters button"), txt("text.write", "Write button"))}${G(txt("text.count", "Count"), txt("text.clear", "Clear filters"))}${txt("text.sort", "Sort label")}
        ${G(txt("text.sort_media", "Sort: helpful"), txt("text.sort_newest", "Sort: recent"))}${G(txt("text.sort_highest", "Sort: highest"), txt("text.sort_lowest", "Sort: lowest"))}
        ${H("Reviews")}${G(txt("text.verified", "Verified"), txt("text.reviewing", "Reviewing"))}${txt("text.recommend_row", "Recommend line")}${G(txt("text.size_label", "Size label"), txt("text.helpful", "Helpful question"))}${G(txt("text.read_more", "Read more"), txt("text.more", "Load more button"))}${txt("text.reply", "Reply label")}
        ${H("Empty")}${txt("text.empty", "No reviews yet")}${txt("text.no_match", "No matches for filters")}
        ${H("Write a review popup")}${txt("text.form_title", "Title")}${G(txt("text.form_submit", "Submit button"), txt("text.form_thanks", "Thank-you title"))}`;
      case "list": return `${H("Which reviews")}${sel("behavior.scope", "Reviews shown on each product", [["group", "This style in every color (e.g. all Zip Rompers)"], ["product", "Only this exact product"], ["all", "Every review in the store"]], "The star rating under the product name follows this too. A Buzzin reviews section or star block in the theme can override it.")}
        ${H("Order")}${sel("behavior.sort", "Sort reviews by default", [["media", "Most helpful (photos & detail first)"], ["newest", "Most recent"], ["highest", "Highest rating"], ["lowest", "Lowest rating"]])}
        ${H("Paging")}${num("behavior.per_page", "Reviews per page (desktop)", 1, 30)}${num("mobile.per_page", "Reviews per page (mobile)", 1, 30)}
        ${H("Long reviews")}${num("behavior.read_more_chars", "Cut after this many letters", 0, 3000, "0 = always show the whole review")}${num("behavior.clip_lines", "…or cut after this many lines", 0, 20, "0 = use the letter count above")}
        ${H("Dates")}${sel("behavior.date_format", "Date style", [["short", "2/24/26"], ["long", "February 24, 2026"], ["relative", "3 days ago"]])}`;
      case "mobile": return `<div class="rve-note">These only apply on phones (screens under 760px). Everything else follows the desktop settings.</div>
        ${H("Text")}${G(num("mobile.font_size", "Body text", 10, 22), num("mobile.title_size", "Review title", 11, 30))}
        ${H("Reviewer column")}${sel("mobile.aside", "Reviewer info", [["compact", "Compact (name and size on one line)"], ["stacked", "Full, above the review"], ["hidden", "Hidden"]])}${chk("mobile.hide_reviewing", "Hide \u201cReviewing\u201d product")}${chk("mobile.hide_recommend_row", "Hide \u201cI recommend\u201d line")}
        ${H("Photos")}${chk("mobile.photo_strip", "Show the photo strip")}${G(num("mobile.strip_size", "Strip photo size", 40, 160), num("mobile.review_photo_size", "Review photo size", 32, 160))}
        ${H("Buttons")}${chk("mobile.buttons_full", "Stretch Filters / Write buttons to full width")}${num("mobile.per_page", "Reviews per page", 1, 30)}`;
      case "css": return `<div class="rve-note">For anything not covered by the other settings. Everything is inside <code>.bzr</code>.</div>${F("CSS", `<textarea data-p="custom_css" rows="18" spellcheck="false" style="font-family:ui-monospace,Menlo,monospace;font-size:12px">${E(D.custom_css || "")}</textarea>`)}`;
    }
    return "";
  }
  function panel() {
    const p = PANELS.find((x) => x[0] === PANEL);
    $("rvesh").textContent = p ? p[1] : "";
    const P = $("rvepane"); P.innerHTML = panelHtml(); P.scrollTop = 0;
    document.querySelectorAll(".rve-rail [data-pn]").forEach((b) => b.classList.toggle("on", b.dataset.pn === PANEL));
    P.querySelectorAll("[data-p]").forEach((x) => {
      const ev = x.tagName === "SELECT" || x.type === "checkbox" || x.type === "color" ? "change" : "input";
      x.addEventListener(ev, () => {
        let v = x.dataset.k === "bool" ? x.checked : x.type === "number" ? (x.value === "" ? null : Number(x.value)) : x.value;
        if (v === "__custom") { v = prompt("Font name, as your theme loads it (for example: Jost, sans-serif)") || get(x.dataset.p); panel(); }
        if (x.dataset.k === "color") { const t = P.querySelector(`input[type=text][data-p="${x.dataset.p}"]`); if (t) t.value = v; }
        set(x.dataset.p, v);
        if (x.type === "checkbox") P.querySelectorAll(`input[type=checkbox][data-p="${x.dataset.p}"]`).forEach((y) => { y.checked = x.checked; });
        mark();
      });
    });
  }

  /* ---------- save / history ---------- */
  function status() {
    const s = $("rvestat"); if (!s) return;
    const changed = META.live && META.draft_at && (!META.published_at || META.draft_at > META.published_at);
    s.className = "rve-st " + (!META.live ? "none" : changed || dirty ? "chg" : "live");
    s.textContent = !META.live ? "Not published yet" : changed || dirty ? "Unpublished changes" : "Live on site";
    $("rveundo").disabled = !HIST.past.length; $("rveredo").disabled = !HIST.future.length;
  }
  let histT = null;
  function mark() {
    dirty = true; $("rvesv").innerHTML = I("circle-dot") + " Unsaved";
    clearTimeout(histT); histT = setTimeout(() => { const cur = JSON.stringify(D); if (cur !== HIST.last) { HIST.past.push(HIST.last); if (HIST.past.length > 80) HIST.past.shift(); HIST.future = []; HIST.last = cur; } status(); }, 300);
    clearTimeout(saveT); saveT = setTimeout(() => save(), 1200);
    push(); status();
  }
  async function save() {
    clearTimeout(saveT); if (saving) { saveT = setTimeout(save, 400); return; }
    saving = true; $("rvesv").innerHTML = I("loader-2") + " Saving";
    try { const r = await call("/api/reviews-design", { method: "PUT", body: JSON.stringify({ store: STORE, design: D }) }); if (r.error) throw new Error(r.error); META.draft_at = r.draft_at; dirty = false; $("rvesv").innerHTML = I("circle-check") + " Saved"; }
    catch (e) { $("rvesv").innerHTML = '<span style="color:#B42318">Not saved</span>'; toastIt(e.message || "Couldn't save", true); }
    finally { saving = false; status(); }
  }
  function restore(json) { D = JSON.parse(json); HIST.last = json; panel(); push(); dirty = true; clearTimeout(saveT); saveT = setTimeout(save, 600); status(); }
  function undo() { if (!HIST.past.length) return; HIST.future.push(JSON.stringify(D)); restore(HIST.past.pop()); }
  function redo() { if (!HIST.future.length) return; HIST.past.push(JSON.stringify(D)); restore(HIST.future.pop()); }

  /* ---------- previews ---------- */
  function frameHtml(w) {
    const s = META.sample || {}, o = META.origin || location.origin, pid = E(s.id || "");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
      body{margin:0;font:15px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#2C3E50;background:#fff}
      .nav{height:56px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:center;font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:13px}
      .wrap{max-width:1200px;margin:0 auto;padding:0 ${w === "m" ? 16 : 40}px 40px}.pp{display:grid;grid-template-columns:${w === "m" ? "1fr" : "1.1fr 1fr"};gap:${w === "m" ? 16 : 40}px;padding:${w === "m" ? 16 : 32}px 0}
      .im{aspect-ratio:1/1;background:#EEF1F5;border-radius:6px}.pp h1{font-size:${w === "m" ? 20 : 26}px;margin:0 0 8px;font-weight:600}.pr{margin:12px 0;font-size:17px}.atc{height:46px;border-radius:6px;background:#E5E7EB;display:flex;align-items:center;justify-content:center;font-weight:600;color:#6B7280}
      body.bzr-studio .bzr-btn:hover,body.bzr-studio .bzr-chip:hover,body.bzr-studio .bzr-strip:hover,body.bzr-studio .bzr-hist:hover,body.bzr-studio .bzr-avgline:hover,body.bzr-studio .bzr-ai:hover,body.bzr-studio .bzr-who:hover,body.bzr-studio .bzr-main:hover,body.bzr-studio .bzr-sr:hover,body.bzr-studio .bzr-tabs:hover,body.bzr-studio .bzr-meta:hover{outline:2px dashed #6366F1;outline-offset:3px;cursor:pointer}
    </style></head><body class="bzr-studio"><div class="nav">${E(META.brand || "")}</div><div class="wrap">
      <div class="pp"><div class="im"></div><div><h1>${E(s.title || "Product name")}</h1><div data-bz-stars data-product-id="${pid}"></div><div class="pr">$34.00</div><div class="atc">Add to cart</div></div></div>
      <div data-bz-reviews data-product-id="${pid}"></div></div>
      <script>window.BZR=${JSON.stringify({ store: STORE, origin: o, live: true, brand: META.brand, studio: 1 }).replace(/</g, "\\u003c")};window.BZR.design=${JSON.stringify(D).replace(/</g, "\\u003c")};<\/script>
      <script src="${o}/bz-reviews-design.js?v=${Date.now()}"><\/script><script src="${o}/bz-reviews.js?v=${Date.now()}"><\/script>
      <script>var MAP=[[".bzr-btn","buttons"],[".bzr-chip","chips"],[".bzr-strip","photos"],[".bzr-hist","histogram"],[".bzr-avgline","stars"],[".bzr-sr","titlestars"],[".bzr-ai","summary"],[".bzr-tabs","tabs"],[".bzr-meta","meta"],[".bzr-who","reviewer"],[".bzr-main","review"]];
      document.addEventListener("click",function(e){for(var i=0;i<MAP.length;i++){if(e.target.closest(MAP[i][0])){parent.postMessage({bzr:1,t:"pick",part:MAP[i][1]},"*");break;}}},true);<\/script></body></html>`;
  }
  function loadFrames() { ready.d = ready.m = false; $("rvefd").srcdoc = frameHtml("d"); $("rvefm").srcdoc = frameHtml("m"); }
  let pushT = null;
  function push() { clearTimeout(pushT); pushT = setTimeout(() => { for (const id of ["rvefd", "rvefm"]) { const f = $(id); if (f && f.contentWindow) f.contentWindow.postMessage({ bzrDesign: clone(D) }, "*"); } }, 60); }
  function onMsg(e) {
    const d = e.data || {}; if (!d.bzr) return;
    if (d.t === "pick" && PICK[d.part]) { PANEL = PICK[d.part]; panel(); }
  }
  function layout() {
    const c = $("rvecv"), zw = $("rvezw"); if (!c || !zw) return;
    $("rvedd").style.display = DEV === "m" ? "none" : ""; $("rvedm").style.display = DEV === "d" ? "none" : "";
    const natural = (DEV !== "m" ? 1200 : 0) + (DEV !== "d" ? 390 : 0) + (DEV === "both" ? 48 : 0) + 48;
    const z = ZOOM === "fit" ? Math.max(0.3, Math.min(1, (c.clientWidth - 8) / natural)) : ZOOM;
    zw.style.transform = `scale(${z})`; zw.dataset.z = z; $("rvezv").textContent = Math.round(z * 100) + "%";
    const h = Math.max(500, Math.round((c.clientHeight - 80) / z));
    $("rvefd").style.height = h + "px"; $("rvefm").style.height = Math.min(h, 844) + "px";
    document.querySelectorAll(".rve-seg [data-dev]").forEach((b) => b.classList.toggle("on", b.dataset.dev === DEV));
  }

  /* ---------- open / close ---------- */
  async function open(store) {
    STORE = store || STORE;
    if (!window.BZR_DEFAULT_DESIGN) await new Promise((r) => { const s = document.createElement("script"); s.src = "/bz-reviews-design.js?v=" + Date.now(); s.onload = r; s.onerror = r; document.head.appendChild(s); });
    DEF = window.BZR_DEFAULT_DESIGN || {};
    META = await call("/api/reviews-design?store=" + STORE); if (META.error) { toastIt(META.error, true); return; }
    D = merge(DEF, META.draft || {}); HIST.past = []; HIST.future = []; HIST.last = JSON.stringify(D); dirty = false;
    document.querySelectorAll(".rve").forEach((x) => x.remove());
    const k = document.createElement("div"); k.className = "rve"; document.body.appendChild(k);
    k.innerHTML = CSS + `<div class="rve-top">
      <button class="rve-ib" id="rvex" title="Back to Reviews" aria-label="Close">${I("arrow-bar-left")}</button><b>Customize reviews</b>
      <select id="rvestore" aria-label="Store"><option value="lb">Larkspur Baby</option><option value="lbo">Larkspur Baby Outlet</option></select>
      <span class="rve-st" id="rvestat"></span><span class="rve-sv" id="rvesv">${I("circle-check")} Saved</span><span style="flex:1"></span>
      <button class="rve-ib" id="rveundo" title="Undo (⌘Z)" aria-label="Undo">${I("arrow-back-up")}</button><button class="rve-ib" id="rveredo" title="Redo (⌘⇧Z)" aria-label="Redo">${I("arrow-forward-up")}</button>
      <span class="rve-seg"><button data-dev="d">${I("device-desktop")} Desktop</button><button data-dev="m">${I("device-mobile")} Mobile</button><button data-dev="both">Both</button></span>
      <button class="rve-btn" id="rvereset" title="Put every setting back to the original look">${I("refresh")} Reset</button>
      <a class="rve-btn" id="rveprev" target="_blank" rel="noopener">${I("external-link")} Preview on website</a>
      <button class="rve-pub" id="rvepub">Publish</button></div>
    <div class="rve-body"><div class="rve-rail">${PANELS.map(([k2, l, ic]) => `<button data-pn="${k2}" title="${E(l)}">${I(ic)}<span>${E(l)}</span></button>`).join("")}</div>
      <div class="rve-side"><div class="rve-sh" id="rvesh"></div><div class="rve-pane" id="rvepane"></div></div>
      <div class="rve-canvas" id="rvecv"><div class="rve-zw" id="rvezw">
        <div class="rve-dev" id="rvedd"><div class="cap">${I("device-desktop")} Desktop</div><iframe id="rvefd" title="Desktop preview" style="width:1200px"></iframe></div>
        <div class="rve-dev" id="rvedm"><div class="cap">${I("device-mobile")} Mobile</div><iframe id="rvefm" title="Mobile preview" style="width:390px"></iframe></div></div>
        <div class="rve-zoom"><button class="rve-ib" id="rvezi" aria-label="Zoom in">${I("plus")}</button><span id="rvezv">100%</span><button class="rve-ib" id="rvezo" aria-label="Zoom out">${I("minus")}</button><button class="rve-ib" id="rvezf" aria-label="Fit">${I("maximize")}</button></div>
      </div></div>`;
    $("rvestore").value = STORE;
    $("rvestore").onchange = async () => { if (dirty) await save(); open($("rvestore").value); };
    $("rvex").onclick = close;
    $("rveundo").onclick = undo; $("rveredo").onclick = redo;
    document.querySelectorAll(".rve-seg [data-dev]").forEach((b) => b.onclick = () => { DEV = b.dataset.dev; layout(); });
    document.querySelectorAll(".rve-rail [data-pn]").forEach((b) => b.onclick = () => { PANEL = b.dataset.pn; panel(); });
    $("rvereset").onclick = () => { if (!confirm("Put every setting back to the original look? You can undo this.")) return; D = clone(DEF); panel(); mark(); };
    const s = META.sample; $("rveprev").href = `${META.shop}/products/${s && s.handle ? s.handle : ""}?bz_reviews=1&bz_design=draft`;
    $("rveprev").onclick = async () => { if (dirty) await save(); };
    $("rvepub").onclick = publish;
    const zs = (z) => { ZOOM = Math.max(0.3, Math.min(1.5, Math.round(z * 10) / 10)); layout(); };
    const cz = () => Number($("rvezw").dataset.z || 1);
    $("rvezi").onclick = () => zs(cz() + 0.1); $("rvezo").onclick = () => zs(cz() - 0.1); $("rvezf").onclick = () => { ZOOM = "fit"; layout(); };
    window.removeEventListener("message", onMsg); window.addEventListener("message", onMsg);
    window.removeEventListener("resize", layout); window.addEventListener("resize", layout);
    document.removeEventListener("keydown", onKey); document.addEventListener("keydown", onKey);
    window.onbeforeunload = () => (dirty ? "Unsaved changes" : undefined);
    panel(); status(); loadFrames(); layout();
  }
  async function publish() {
    if (!confirm(`Publish this look to ${META.brand}? Shoppers will see it within a few minutes.`)) return;
    const b = $("rvepub"); b.disabled = true; b.textContent = "Publishing…";
    try { const r = await call("/api/reviews-design/publish", { method: "POST", body: JSON.stringify({ store: STORE, design: D }) }); if (r.error) throw new Error(r.error); META.live = clone(D); META.published_at = r.published_at; META.draft_at = r.published_at; dirty = false; clearTimeout(saveT); $("rvesv").innerHTML = I("circle-check") + " Saved"; toastIt("Published ✓"); }
    catch (e) { toastIt(e.message || "Couldn't publish", true); }
    finally { b.disabled = false; b.textContent = "Publish"; status(); }
  }
  function onKey(e) {
    if (!document.querySelector(".rve")) return;
    const inField = /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "");
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !inField) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (e.key === "Escape" && !inField) close();
  }
  async function close() {
    if (dirty) await save();
    document.querySelectorAll(".rve").forEach((x) => x.remove());
    window.onbeforeunload = null; window.removeEventListener("message", onMsg); window.removeEventListener("resize", layout); document.removeEventListener("keydown", onKey);
    try { if (typeof loadReviews === "function" && /^rv_/.test(VIEW)) loadReviews(); } catch (_) {}
  }
  window.rvStudio = { open };
})();
