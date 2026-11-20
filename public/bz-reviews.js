/* Buzzin · product reviews on the store.
   Loaded by the Buzzin script already on the theme, only on product pages (or where a [data-bz-reviews] / [data-bz-stars]
   element exists). Until reviews are switched on for a store it only runs in preview: add ?bz_reviews=1 to any product
   URL (remembered for the visit, ?bz_reviews=0 turns it off). ?bz_design=draft shows the unpublished design from Customize.
   Every color, size, word and section comes from the store's design (Buzzin → Reviews → Customize), merged over
   window.BZR_DEFAULT_DESIGN. In the Customize editor (window.BZR.studio) the design is pushed in with postMessage. */
(function () {
  if (window.__bzReviews) return; window.__bzReviews = 1;
  var C = window.BZR || {}; var API = (C.origin || "") + "/rv/" + C.store;
  var studio = !!C.studio;
  try {
    var qp = new URLSearchParams(location.search), q = qp.get("bz_reviews"), qd = qp.get("bz_design");
    if (q === "1") sessionStorage.setItem("bz_reviews", "1"); if (q === "0") { sessionStorage.removeItem("bz_reviews"); sessionStorage.removeItem("bz_design"); }
    if (qd === "draft") sessionStorage.setItem("bz_design", "draft"); if (qd === "live") sessionStorage.removeItem("bz_design");
  } catch (e) {}
  var preview = false, draft = false; try { preview = sessionStorage.getItem("bz_reviews") === "1"; draft = sessionStorage.getItem("bz_design") === "draft"; } catch (e) {}
  var active = studio || !!C.live || preview || draft;
  var forced = document.querySelector("[data-bz-reviews],[data-bz-stars]");
  if (!active && !forced) return;
  if (/\/products\/[^/?#]*(protection|insurance|gift-card)/i.test(location.pathname)) return;   // no reviews on Package Protection (PP) and similar

  /* ---------- design ---------- */
  var DEF = window.BZR_DEFAULT_DESIGN || {};
  function merge(a, b) { var o = {}; for (var k in a) o[k] = a[k]; if (b) for (var j in b) { var v = b[j]; o[j] = v && typeof v === "object" && !Array.isArray(v) && a[j] && typeof a[j] === "object" ? merge(a[j], v) : v; } return o; }
  var D = merge(DEF, C.design || {});
  function T(k, vars) { var s = (D.text && D.text[k] != null ? D.text[k] : (DEF.text || {})[k]) || ""; if (vars) for (var v in vars) s = s.split("{" + v + "}").join(vars[v]); return s; }
  function px(n, d) { n = Number(n); return (isFinite(n) ? n : d) + "px"; }
  function mobile() { try { return window.matchMedia("(max-width:760px)").matches; } catch (e) { return false; } }
  function fam(f) { return f && f !== "inherit" ? f : "inherit"; }

  function buildCss() {
    var c = D.colors, f = D.font, L = D.layout, P = D.photos, M = D.mobile, S = D.show;
    var outline = D.layout.button_style === "outline";
    var btnBg = outline ? "transparent" : c.button_bg, btnTx = outline ? c.button_bg : c.button_text;
    var card = L.row_style === "cards";
    var x = "";
    x += ".bzr{font-family:" + fam(f.family) + ";font-size:" + px(f.size, 14) + ";color:" + c.text + ";line-height:1.5;margin:" + px(L.margin_top, 28) + " auto " + px(L.margin_bottom, 28) + ";" + (Number(L.max_width) > 0 ? "max-width:" + px(L.max_width) + ";" : "") + (c.bg ? "background:" + c.bg + ";padding:20px;" : "") + "}.bzr *{box-sizing:border-box}";
    x += ".bzr-st{display:inline-flex;gap:2px;vertical-align:middle}.bzr-st svg{display:block}";
    x += ".bzr-heading{font-family:" + fam(f.heading_family) + ";font-size:" + px(Number(f.heading_size) + 7, 22) + ";font-weight:700;color:" + c.heading + ";margin:0 0 16px}";
    x += ".bzr-top{display:grid;grid-template-columns:" + (L.top_layout === "stacked" ? "1fr" : "minmax(260px,1fr) minmax(0,1.5fr)") + ";gap:22px 48px;align-items:start;margin-bottom:24px}@media(max-width:760px){.bzr-top{grid-template-columns:1fr}}";
    x += ".bzr-avgline{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px}.bzr-avgline b{font-size:" + px(f.average_size, 18) + ";color:" + c.heading + "}.bzr-avgline span{margin-left:8px}";
    x += ".bzr-hist{display:flex;flex-direction:column;gap:4px}.bzr-hr{display:flex;align-items:center;gap:12px;cursor:pointer;background:none;border:0;padding:0;color:inherit;font:inherit;text-align:left;width:100%}";
    x += ".bzr-hn{width:10px;font-size:13px}.bzr-hs{width:14px;font-size:15px;color:" + c.star + "}.bzr-bar{flex:1;height:4px;background:" + c.bar_bg + ";border-radius:6px;overflow:hidden}.bzr-bar i{display:block;height:100%;background:" + c.bar + "}.bzr-hc{width:40px;font-size:13px}.bzr-hr.on .bzr-hn{font-weight:700}";
    x += ".bzr-rec{margin-bottom:12px}.bzr-rec b{font-size:17px;color:" + c.heading + "}";
    x += ".bzr-strip{display:flex;gap:4px;overflow:hidden}.bzr-strip button{flex:0 0 auto;border:0;padding:0;background:none;cursor:zoom-in}.bzr-strip img{width:" + px(P.strip_size, 100) + ";height:" + px(P.strip_size, 100) + ";object-fit:cover;display:block;border-radius:" + px(P.image_radius, 12) + "}";
    x += ".bzr-ai{margin:6px 0 26px}.bzr-h5{font-family:" + fam(f.heading_family) + ";font-weight:700;font-size:" + px(f.heading_size, 15) + ";color:" + c.heading + ";margin:14px 0 8px}.bzr-ai p{line-height:1.6;margin:0}";
    x += ".bzr-topics,.bzr-chips{display:flex;gap:8px;flex-wrap:wrap}.bzr-chip{border:1px solid " + c.chip_border + ";background:" + c.chip_bg + ";color:" + c.chip_text + ";border-radius:" + px(L.chip_radius, 8) + ";padding:6px 13px;font:inherit;font-size:13.5px;cursor:pointer}.bzr-chip.on{background:" + c.chip_on_bg + ";color:" + c.chip_on_text + ";border-color:" + c.chip_on_bg + "}";
    x += ".bzr-tabs{border-bottom:1px solid " + c.border + ";margin-bottom:16px}.bzr-tabs span{display:inline-block;font-family:" + fam(f.heading_family) + ";font-weight:700;font-size:" + px(f.heading_size, 15) + ";color:" + c.heading + ";padding:0 0 8px;border-bottom:2px solid " + c.heading + ";margin-bottom:-1px}";
    x += ".bzr-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:0 0 14px}";
    x += ".bzr-btn{background:" + btnBg + ";color:" + btnTx + ";border:1px solid " + (outline ? c.button_bg : c.button_border) + ";border-radius:" + px(L.button_radius, 8) + ";padding:10px 18px;font:inherit;font-size:14px;font-weight:600;cursor:pointer}.bzr-btn:hover{opacity:.9}.bzr-btn[disabled]{opacity:.6;cursor:default}";
    x += ".bzr-fpanel{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;background:" + c.filters_bg + ";border-radius:10px;padding:14px 16px;margin-bottom:14px}.bzr-fpanel label{display:block;font-size:12.5px;font-weight:700;margin-bottom:6px}.bzr-fpanel input{width:100%;border:1px solid " + c.border + ";border-radius:8px;padding:8px 10px;font:inherit;color:" + c.text + "}";
    x += ".bzr-meta{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0 12px;border-bottom:" + (card ? "0" : "1px solid " + c.border) + "}.bzr-sort{font-weight:700;display:flex;align-items:center;gap:8px}.bzr-sort select{border:0;font:inherit;font-weight:400;background:transparent;color:" + c.text + ";cursor:pointer}";
    x += ".bzr-clear,.bzr-more{border:0;background:none;color:" + c.link + ";font:inherit;font-size:13px;cursor:pointer;text-decoration:underline;margin-left:6px;padding:0}.bzr-more{margin:4px 0 0}";
    x += ".bzr-list{display:flex;flex-direction:column;gap:" + (card ? "12px" : "0") + "}";
    x += ".bzr-row{display:grid;grid-template-columns:" + (S.avatar || S.name || S.verified || S.reviewing || S.recommend_row || S.attributes ? px(L.aside_width, 262) + " minmax(0,1fr)" : "1fr") + ";gap:22px;padding:" + px(L.row_gap, 20) + " " + (card ? "20px" : "0") + ";" + (card ? "background:" + c.card_bg + ";border:1px solid " + c.card_border + ";border-radius:" + px(L.card_radius, 6) : "border-bottom:1px solid " + c.border) + "}";
    x += ".bzr-who{" + (L.aside_box ? "border:1px solid " + c.border + ";border-radius:4px;padding:14px;" : "") + "font-size:13px;align-self:start}.bzr-id{display:flex;gap:12px;align-items:center}";
    x += ".bzr-av{width:42px;height:42px;border-radius:50%;background:" + c.avatar_bg + ";color:" + c.avatar_text + ";display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex:none}.bzr-id b{font-size:14px}";
    x += ".bzr-ver{font-weight:700;font-size:13px;color:" + c.verified + "}.bzr-ver span{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:" + c.verified_badge + ";color:#fff;font-size:9px;margin-left:3px}";
    x += ".bzr-rv,.bzr-recy{margin-top:12px}.bzr-rvp{display:flex;gap:10px;align-items:center;margin-top:4px}.bzr-rvp img{width:40px;height:40px;object-fit:cover;border-radius:" + px(D.photos.image_radius, 12) + "}.bzr-attr{display:flex;justify-content:space-between;gap:10px;margin-top:8px}.bzr-attr span{text-align:right}";
    x += ".bzr-rh{display:flex;justify-content:space-between;align-items:center;gap:10px}.bzr-date{font-size:13px;color:" + c.muted + "}";
    x += ".bzr-main h4{margin:10px 0 6px;font-family:" + fam(f.heading_family) + ";font-size:" + px(f.title_size, 16) + ";font-weight:" + (f.title_weight || 600) + ";color:" + c.heading + "}.bzr-body{line-height:1.55;white-space:pre-wrap;word-wrap:break-word}";
    if (Number(D.behavior.clip_lines) > 0) x += ".bzr-body.clip{display:-webkit-box;-webkit-line-clamp:" + Number(D.behavior.clip_lines) + ";-webkit-box-orient:vertical;overflow:hidden}";
    x += ".bzr-media{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.bzr-media button{border:0;padding:0;background:none;cursor:zoom-in}.bzr-media img{width:" + px(P.review_size, 64) + ";height:" + px(P.review_size, 64) + ";object-fit:cover;border-radius:" + px(P.image_radius, 12) + ";display:block}";
    x += ".bzr-reply{margin-top:12px;background:" + c.reply_bg + ";border-radius:6px;padding:10px 12px;font-size:13.5px}.bzr-reply b{display:block;font-size:12.5px;margin-bottom:3px}";
    x += ".bzr-help{text-align:right;font-size:13px;margin-top:12px}.bzr-help button{border:0;background:none;font:inherit;font-size:13px;cursor:pointer;margin-left:10px;color:" + c.text + ";display:inline-flex;align-items:center;gap:4px}.bzr-help svg,.bzr-recy svg{vertical-align:-2px}";
    x += ".bzr-loadmore{display:block;margin:16px auto 0}.bzr-empty{padding:20px 0;color:" + c.muted + "}";
    x += ".bzr-sr{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;color:" + c.text + ";background:none;border:0;padding:0;font-family:" + fam(f.family) + "}.bzr-sr u{text-decoration:none}";
    // mobile
    x += "@media(max-width:760px){.bzr{font-size:" + px(M.font_size, 14) + "}.bzr-main h4{font-size:" + px(M.title_size, 15) + "}.bzr-strip{overflow-x:auto}.bzr-strip img{width:" + px(M.strip_size, 84) + ";height:" + px(M.strip_size, 84) + "}.bzr-media img{width:" + px(M.review_photo_size, 64) + ";height:" + px(M.review_photo_size, 64) + "}" +
      ".bzr-row{grid-template-columns:1fr;gap:" + (M.aside === "compact" ? "8px" : "12px") + ";padding:16px " + (card ? "14px" : "0") + "}" +
      (M.aside === "compact" ? ".bzr-who{border:0;padding:0}.bzr-av{width:34px;height:34px;font-size:12px}.bzr-attr{display:inline-flex;gap:4px;margin:6px 12px 0 0;font-size:12px}" : "") +
      (M.aside === "hidden" ? ".bzr-who{display:none}" : "") +
      (M.hide_reviewing ? ".bzr-rv{display:none}" : "") + (M.hide_recommend_row ? ".bzr-recy{display:none}" : "") + (M.photo_strip === false ? ".bzr-strip{display:none}" : "") +
      (M.buttons_full ? ".bzr-tools .bzr-btn{flex:1}" : "") + "}";
    // write-a-review popup + lightbox
    x += ".bzr-ov{position:fixed;inset:0;background:rgba(20,22,30,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px}.bzr-ov *{box-sizing:border-box}";
    x += ".bzr-modal{background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:92vh;overflow:auto;padding:22px 22px 18px;position:relative;color:" + c.text + ";font-family:" + fam(f.family) + "}";
    x += ".bzr-x{position:absolute;right:12px;top:10px;border:0;background:none;font-size:26px;line-height:1;cursor:pointer;color:" + c.muted + "}.bzr-modal h3{margin:0 0 4px;font-size:20px;font-family:" + fam(f.heading_family) + ";color:" + c.heading + "}.bzr-modal label{display:block;font-size:13px;font-weight:600;margin:14px 0 5px}";
    x += ".bzr-modal input[type=text],.bzr-modal input[type=email],.bzr-modal textarea{width:100%;border:1px solid " + c.border + ";border-radius:8px;padding:10px 12px;font:inherit;font-size:14px;color:" + c.text + "}.bzr-modal textarea{min-height:120px;resize:vertical}.bzr-pick{display:flex;gap:6px}.bzr-pick button{border:0;background:none;padding:0;cursor:pointer}";
    x += ".bzr-err{color:#b42318;font-size:13px;margin-top:10px}.bzr-ok{text-align:center;padding:24px 6px}.bzr-thumbs{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.bzr-thumbs img{width:60px;height:60px;object-fit:cover;border-radius:" + px(P.image_radius, 12) + "}";
    x += ".bzr-lb{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2147483001;display:flex;align-items:center;justify-content:center;cursor:zoom-out}.bzr-lb img{max-width:94vw;max-height:90vh;border-radius:" + px(P.image_radius, 12) + "}";
    if (active) x += "[data-oke-widget],[data-oke-star-rating]{display:none!important}";
    return x + "\n" + (D.custom_css || "");
  }
  var styleEl = document.createElement("style"); document.head.appendChild(styleEl);
  function applyCss() { styleEl.textContent = buildCss(); }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  var SHAPES = {
    star: "M12 2.6l2.9 6.2 6.7.7-5 4.6 1.4 6.7L12 17.4l-6 3.4 1.4-6.7-5-4.6 6.7-.7z",
    heart: "M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.6 4.5 7 4.5c2 0 3.5 1.1 5 3 1.5-1.9 3-3 5-3 3.4 0 5.5 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z",
    circle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  };
  function star(fill, size) {   // fill 0..1
    var c = D.colors, id = "g" + Math.random().toString(36).slice(2, 8), s = size || 18;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="' + id + '"><stop offset="' + (fill * 100) + '%" stop-color="' + c.star + '"/><stop offset="' + (fill * 100) + '%" stop-color="' + c.star_empty + '"/></linearGradient></defs><path d="' + (SHAPES[D.stars.shape] || SHAPES.star) + '" fill="url(#' + id + ')"' + (D.stars.outline !== false ? ' stroke="' + c.star_outline + '" stroke-width="1.3"' : "") + ' stroke-linejoin="round"/></svg>';
  }
  function stars(v, size) { var h = '<span class="bzr-st" role="img" aria-label="' + v + ' out of 5 stars">'; for (var i = 1; i <= 5; i++) h += star(Math.max(0, Math.min(1, v - i + 1)), size); return h + "</span>"; }
  function fmtDate(d) {
    try {
      var x = new Date(d), f = D.behavior.date_format;
      if (f === "relative") return ago(d);
      if (f === "long") return x.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
      return (x.getMonth() + 1) + "/" + x.getDate() + "/" + String(x.getFullYear()).slice(2);
    } catch (e) { return ""; }
  }
  function ago(d) {
    var t = (Date.now() - new Date(d)) / 1000; if (!(t >= 0)) return "";
    if (t < 3600) return Math.max(1, Math.round(t / 60)) + " minutes ago"; if (t < 86400) { var h = Math.round(t / 3600); return h + " hour" + (h === 1 ? "" : "s") + " ago"; }
    if (t < 86400 * 30) { var dd = Math.round(t / 86400); return dd + " day" + (dd === 1 ? "" : "s") + " ago"; }
    var x = new Date(d); return (x.getMonth() + 1) + "/" + x.getDate() + "/" + String(x.getFullYear()).slice(2);
  }
  function get(u) { return fetch(API + u).then(function (r) { return r.json(); }); }
  function productIdOf(el) {
    var v = el && (el.getAttribute("data-product-id") || el.getAttribute("data-oke-reviews-product-id"));
    if (!v && window.ShopifyAnalytics && ShopifyAnalytics.meta && ShopifyAnalytics.meta.product) v = ShopifyAnalytics.meta.product.id;
    if (!v && window.meta && window.meta.product) v = window.meta.product.id;
    return v ? String(v).replace(/\D/g, "") : null;
  }
  function productMeta() {
    var t = document.querySelector('meta[property="og:title"]'), im = document.querySelector('meta[property="og:image"]');
    return { title: (t && t.content) || document.title, image: im && im.content, handle: (location.pathname.match(/\/products\/([^/?#]+)/) || [])[1] || "" };
  }
  var REDRAW = [];

  /* ---------- star rating under the product title ---------- */
  // Which reviews to show: the theme block/section can set data-bz-scope, else the Customize setting.
  function scopeOf(el) { var v = el && el.getAttribute && el.getAttribute("data-bz-scope"); return /^(group|product|all)$/.test(v || "") ? v : (D.behavior.scope || "group"); }
  function mountStars(host, pid) {
    var box = document.createElement("div"); box.className = "bzr-stars-host"; host.parentNode.insertBefore(box, host);
    var a = null;
    function draw() {
      if (!a || !a.count || !D.show.title_stars) { box.innerHTML = ""; return; }
      box.innerHTML = '<button type="button" class="bzr-sr">' + stars(a.average, D.stars.size_title) + (D.show.title_count ? " <u>" + esc(T("title_count", { count: a.count.toLocaleString() })) + "</u>" : "") + "</button>";
      box.firstChild.onclick = function () { var w = document.querySelector(".bzr"); if (w) w.scrollIntoView({ behavior: "smooth", block: "start" }); };
    }
    REDRAW.push(draw);
    get("/stars?ids=" + pid + "&scope=" + scopeOf(host)).then(function (j) { a = j[pid]; draw(); }).catch(function () {});
  }

  /* ---------- the review section ---------- */
  function kfmt(n) { return n >= 1000 ? (Math.round(n / 100) / 10) + "k" : String(n); }
  function initials(n) { return String(n || "?").replace(/[^A-Za-z .]/g, "").split(/[\s.]+/).filter(Boolean).slice(0, 2).map(function (x) { return x[0].toUpperCase(); }).join("") || "★"; }
  var THUMB = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3a4 4 0 0 0 4-4V6a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1-2 2h-7a3 3 0 0 1-3-3"/></svg>';
  var THUMBDN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform:scaleY(-1)"><path d="M7 11v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3a4 4 0 0 0 4-4V6a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1-2 2h-7a3 3 0 0 1-3-3"/></svg>';
  function mountWidget(host, pid) {
    var root = document.createElement("div"); root.className = "bzr"; root.id = "bz-reviews"; host.parentNode.insertBefore(root, host);
    var S = { sort: D.behavior.sort || "media", rating: "", media: "", q: "", page: 1, list: [], summary: null, total: 0, more: false, photos: [], ai: null, filters: false, per: 0 };
    // AI summary is turned off on the store: it can repeat complaints. (S.ai stays empty, so nothing is shown.)
    function perPage() { return Math.max(1, Math.min(30, Number(mobile() ? D.mobile.per_page : D.behavior.per_page) || 10)); }
    function load(reset) {
      if (reset) { S.page = 1; S.list = []; }
      S.per = perPage();
      return get("/product/" + pid + "?sort=" + S.sort + "&rating=" + S.rating + "&media=" + S.media + "&q=" + encodeURIComponent(S.q) + "&page=" + S.page + "&per=" + S.per + "&scope=" + scopeOf(host)).then(function (j) {
        S.summary = j.summary; S.total = j.total; S.more = j.more; if (j.photos) S.photos = j.photos; S.list = S.list.concat(j.reviews || []); render();
      }).catch(function () { if (!S.summary) root.innerHTML = ""; });
    }
    function render() {
      var sh = D.show, a = S.summary || { count: 0, average: 0, histogram: {} }, h = "", filtered = S.rating || S.media || S.q;
      if (sh.heading && T("heading")) h += '<h2 class="bzr-heading">' + esc(T("heading")) + "</h2>";
      if (a.count) {
        var left = "", right = "";
        if (sh.average) left += '<div class="bzr-avgline"><b>' + a.average.toFixed(1) + "</b>" + stars(a.average, D.stars.size_summary) + "<span>" + esc(T("based_on", { count: a.count.toLocaleString() })) + "</span></div>";
        if (sh.histogram) {
          left += '<div class="bzr-hist">';
          for (var i = 5; i >= 1; i--) { var n = a.histogram[i] || 0; left += '<button type="button" class="bzr-hr' + (String(S.rating) === String(i) ? " on" : "") + '" data-r="' + i + '" aria-label="Show ' + i + '-star reviews"><span class="bzr-hn">' + i + '</span><span class="bzr-hs">★</span><span class="bzr-bar"><i style="width:' + Math.max(n ? 2 : 0, Math.round((100 * n) / a.count)) + '%"></i></span><span class="bzr-hc">' + kfmt(n) + "</span></button>"; }
          left += "</div>";
        }
        if (sh.recommend && a.recommend_pct != null) right += '<div class="bzr-rec"><b>' + a.recommend_pct + "%</b> " + esc(T("recommend")) + "</div>";
        var ph = (S.photos || []).slice(0, Math.max(0, Number(D.photos.strip_count) || 0));
        if (sh.photo_strip && ph.length) right += '<div class="bzr-strip">' + ph.map(function (p) { return '<button type="button" data-img="' + esc(p.url) + '"><img loading="lazy" src="' + esc(p.thumb) + '" alt="Customer photo"></button>'; }).join("") + "</div>";
        if (left || right) h += '<div class="bzr-top"><div class="bzr-tl">' + left + '</div><div class="bzr-tr">' + right + "</div></div>";
        if (S.ai && (sh.summary || sh.topics)) {
          h += '<div class="bzr-ai">';
          if (sh.summary) h += '<div class="bzr-h5">' + esc(T("summary_title")) + ' <span aria-hidden="true">✧</span></div><p>' + esc(S.ai.summary) + "</p>";
          if (sh.topics && S.ai.topics && S.ai.topics.length) h += '<div class="bzr-h5">' + esc(T("topics_title")) + '</div><div class="bzr-topics">' + S.ai.topics.map(function (t) { return '<button type="button" class="bzr-chip' + (S.q.toLowerCase() === String(t).toLowerCase() ? " on" : "") + '" data-topic="' + esc(t) + '">' + esc(t) + "</button>"; }).join("") + "</div>";
          h += "</div>";
        }
      }
      if (sh.tab) h += '<div class="bzr-tabs"><span>' + esc(T("tab", { count: a.count.toLocaleString() })) + "</span></div>";
      if ((sh.filters && a.count) || sh.write) h += '<div class="bzr-tools">' + (sh.filters && a.count ? '<button type="button" class="bzr-btn" data-filters="1">☰ ' + esc(T("filters")) + (filtered ? " •" : "") + "</button>" : "<span></span>") + (sh.write ? '<button type="button" class="bzr-btn" data-write="1">✎ ' + esc(T("write")) + "</button>" : "") + "</div>";
      if (S.filters) h += '<div class="bzr-fpanel"><div><label>Rating</label><div class="bzr-chips">' + ["", "5", "4", "3", "2", "1"].map(function (r) { return '<button type="button" class="bzr-chip' + (String(S.rating) === r ? " on" : "") + '" data-fr="' + r + '">' + (r ? r + " ★" : "All") + "</button>"; }).join("") + "</div></div>" +
        '<div><label>Show</label><div class="bzr-chips"><button type="button" class="bzr-chip' + (!S.media ? " on" : "") + '" data-fm="">All reviews</button><button type="button" class="bzr-chip' + (S.media ? " on" : "") + '" data-fm="1">With photos</button></div></div>' +
        '<div><label for="bzr-q">Search reviews</label><input id="bzr-q" type="search" placeholder="e.g. soft, zipper, size" value="' + esc(S.q) + '"></div></div>';
      if (sh.count || (sh.sort && a.count)) h += '<div class="bzr-meta"><span>' + (sh.count ? esc(T("count", { count: S.total.toLocaleString() })) : "") + (filtered ? ' <button type="button" class="bzr-clear" data-clear="1">' + esc(T("clear")) + "</button>" : "") + "</span>" +
        (sh.sort && a.count ? '<label class="bzr-sort">' + esc(T("sort")) + ' <select aria-label="Sort reviews">' + [["newest", "sort_newest"], ["media", "sort_media"], ["highest", "sort_highest"], ["lowest", "sort_lowest"]].map(function (o) { return '<option value="' + o[0] + '">' + esc(T(o[1])) + "</option>"; }).join("") + "</select></label>" : "") + "</div>";
      if (S.list.length) { h += '<div class="bzr-list">' + S.list.map(row).join("") + "</div>"; if (S.more) h += '<button type="button" class="bzr-btn bzr-loadmore" data-more="1">' + esc(T("more")) + "</button>"; }
      else h += '<div class="bzr-empty">' + esc(a.count ? T("no_match") : T("empty")) + "</div>";
      root.innerHTML = h;
      var sel = root.querySelector(".bzr-sort select"); if (sel) { sel.value = S.sort; sel.onchange = function () { S.sort = sel.value; load(true); }; }
      var qi = root.querySelector("#bzr-q"); if (qi) qi.onkeydown = function (e) { if (e.key === "Enter") { S.q = qi.value.trim(); load(true); } };
    }
    function row(r) {
      var sh = D.show, lim = Number(D.behavior.read_more_chars) || 0, long = lim > 0 && (r.body || "").length > lim, clip = Number(D.behavior.clip_lines) > 0;
      var body = long && !clip ? String(r.body).slice(0, lim).replace(/\s+\S*$/, "") + "…" : r.body;
      var attrs = []; if (r.variant) attrs.push([T("size_label"), r.variant]);
      if (r.answers) Object.keys(r.answers).slice(0, 3).forEach(function (k) { attrs.push([k, r.answers[k]]); });
      var aside = "";
      if (sh.avatar || sh.name || sh.verified) aside += '<div class="bzr-id">' + (sh.avatar ? '<span class="bzr-av">' + esc(initials(r.name)) + "</span>" : "") + "<div>" + (sh.name ? "<b>" + esc(r.name) + "</b>" : "") + (sh.verified && r.verified ? '<div class="bzr-ver">' + esc(T("verified")) + ' <span aria-hidden="true">✓</span></div>' : "") + "</div></div>";
      if (sh.reviewing && r.product) aside += '<div class="bzr-rv"><b>' + esc(T("reviewing")) + '</b><div class="bzr-rvp">' + (r.product_image ? '<img loading="lazy" src="' + esc(r.product_image) + '" alt="">' : "") + "<span>" + esc(r.product) + "</span></div></div>";
      if (sh.recommend_row && r.recommended) aside += '<div class="bzr-recy">' + THUMB + " " + esc(T("recommend_row")) + "</div>";
      if (sh.attributes) aside += attrs.map(function (x) { return '<div class="bzr-attr"><b>' + esc(x[0]) + ":</b><span>" + esc(x[1]) + "</span></div>"; }).join("");
      return '<div class="bzr-row">' + (aside ? '<aside class="bzr-who">' + aside + "</aside>" : "") +
        '<div class="bzr-main"><div class="bzr-rh">' + stars(r.rating, D.stars.size_review) + (sh.date ? '<span class="bzr-date">' + esc(fmtDate(r.date)) + "</span>" : "") + "</div>" + (sh.review_title && r.title ? "<h4>" + esc(r.title) + "</h4>" : "") +
        '<div class="bzr-body' + (long && clip ? " clip" : "") + '" data-full="' + (long && !clip ? esc(r.body) : "") + '">' + esc(body) + "</div>" + (long ? '<button type="button" class="bzr-more">' + esc(T("read_more")) + "</button>" : "") +
        (sh.review_photos && r.media && r.media.length ? '<div class="bzr-media">' + r.media.filter(function (m) { return m.type !== "video"; }).map(function (m) { return '<button type="button" data-img="' + esc(m.url) + '"><img loading="lazy" src="' + esc(m.thumb) + '" alt="' + esc(m.alt || "Customer photo") + '"></button>'; }).join("") + "</div>" : "") +
        (sh.reply && r.reply ? '<div class="bzr-reply"><b>' + esc(T("reply", { brand: C.brand || "us" })) + "</b>" + esc(r.reply) + "</div>" : "") +
        (sh.helpful ? '<div class="bzr-help">' + esc(T("helpful")) + ' <button type="button" data-help="' + esc(r.id) + '" aria-label="Helpful">' + THUMB + "<span>" + (r.helpful || 0) + '</span></button><button type="button" data-unhelp="' + esc(r.id) + '" aria-label="Not helpful">' + THUMBDN + "<span>" + (r.unhelpful || 0) + "</span></button></div>" : "") +
        "</div></div>";
    }
    var voted = {};
    root.addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) return;
      if (t.dataset.r) { S.rating = String(S.rating) === t.dataset.r ? "" : t.dataset.r; load(true); }
      else if (t.hasAttribute("data-fr")) { S.rating = t.dataset.fr; load(true); }
      else if (t.hasAttribute("data-fm")) { S.media = t.dataset.fm; load(true); }
      else if (t.dataset.topic) { S.q = S.q.toLowerCase() === t.dataset.topic.toLowerCase() ? "" : t.dataset.topic; load(true); }
      else if (t.dataset.clear) { S.rating = ""; S.media = ""; S.q = ""; load(true); }
      else if (t.dataset.filters) { S.filters = !S.filters; render(); }
      else if (t.dataset.more) { t.disabled = true; S.page++; load(false); }
      else if (t.dataset.write) openForm(pid);
      else if (t.dataset.img) lightbox(t.dataset.img);
      else if (t.dataset.help || t.dataset.unhelp) { if (studio) return; var id = t.dataset.help || t.dataset.unhelp; if (voted[id]) return; voted[id] = 1; var sp = t.querySelector("span"); sp.textContent = Number(sp.textContent) + 1; fetch(API + "/helpful/" + id + (t.dataset.unhelp ? "?no=1" : ""), { method: "POST" }).catch(function () {}); }
      else if (t.classList.contains("bzr-more")) { var b = t.previousElementSibling; if (b.dataset.full) b.textContent = b.dataset.full; b.classList.remove("clip"); t.remove(); }
    });
    REDRAW.push(function (reload) { if (reload || S.per !== perPage()) { S.sort = D.behavior.sort || S.sort; load(true); } else render(); });
    load(true);
  }
  function lightbox(src) { var o = document.createElement("div"); o.className = "bzr-lb"; o.innerHTML = '<img src="' + esc(src) + '" alt="">'; o.onclick = function () { o.remove(); }; document.body.appendChild(o); }

  /* ---------- write a review ---------- */
  function openForm(pid) {
    var meta = productMeta(), rating = 0, photos = [];
    var ov = document.createElement("div"); ov.className = "bzr-ov";
    ov.innerHTML = '<div class="bzr-modal" role="dialog" aria-modal="true" aria-label="' + esc(T("form_title")) + '"><button type="button" class="bzr-x" aria-label="Close">×</button>' +
      "<h3>" + esc(T("form_title")) + '</h3><div style="font-size:13px;color:' + D.colors.muted + '">' + esc(meta.title) + "</div>" +
      '<label>Your rating</label><div class="bzr-pick" role="radiogroup">' + [1, 2, 3, 4, 5].map(function (i) { return '<button type="button" data-v="' + i + '" aria-label="' + i + " star" + (i > 1 ? "s" : "") + '">' + star(0, 30) + "</button>"; }).join("") + "</div>" +
      '<label for="bzr-t">Title</label><input type="text" id="bzr-t" maxlength="150" placeholder="Sum it up">' +
      '<label for="bzr-b">Review</label><textarea id="bzr-b" maxlength="5000" placeholder="How was the fit, the fabric, and how did your little one like it?"></textarea>' +
      '<label>Photos <span style="font-weight:400;color:' + D.colors.muted + '">(optional)</span></label><input type="file" id="bzr-f" accept="image/*" multiple><div class="bzr-thumbs"></div>' +
      '<label for="bzr-n">Your name</label><input type="text" id="bzr-n" maxlength="60" placeholder="First name and last initial">' +
      '<label for="bzr-e">Email</label><input type="email" id="bzr-e" maxlength="200" placeholder="Only used to confirm your review. Never shown.">' +
      '<div class="bzr-err" hidden></div><div style="margin-top:16px;display:flex;justify-content:flex-end"><button type="button" class="bzr-btn" data-send="1">' + esc(T("form_submit")) + "</button></div></div>";
    document.body.appendChild(ov);
    var M = ov.querySelector(".bzr-modal"), err = M.querySelector(".bzr-err");
    function paint() { M.querySelectorAll(".bzr-pick button").forEach(function (b) { b.innerHTML = star(Number(b.dataset.v) <= rating ? 1 : 0, 30); }); }
    function close() { ov.remove(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    M.querySelector(".bzr-x").onclick = close;
    M.querySelectorAll(".bzr-pick button").forEach(function (b) { b.onclick = function () { rating = Number(b.dataset.v); paint(); }; });
    M.querySelector("#bzr-f").onchange = function (e) {
      if (studio) return;
      var files = [].slice.call(e.target.files || [], 0, 6 - photos.length);
      files.forEach(function (f) {
        fetch(API + "/upload", { method: "POST", headers: { "Content-Type": f.type || "image/jpeg" }, body: f }).then(function (r) { return r.json(); }).then(function (j) {
          if (j.url) { photos.push({ url: j.url }); M.querySelector(".bzr-thumbs").insertAdjacentHTML("beforeend", '<img src="' + esc(j.url) + '" alt="">'); } else { err.hidden = false; err.textContent = j.error || "Couldn't add that photo."; }
        }).catch(function () { err.hidden = false; err.textContent = "Couldn't add that photo."; });
      });
    };
    M.querySelector("[data-send]").onclick = function () {
      var btn = this; err.hidden = true;
      if (studio) { err.hidden = false; err.textContent = "This is a preview. Reviews can't be sent from here."; return; }
      var body = { product_id: pid, product_title: meta.title, product_image: meta.image, product_handle: meta.handle, rating: rating, title: M.querySelector("#bzr-t").value, body: M.querySelector("#bzr-b").value,
        name: M.querySelector("#bzr-n").value, email: M.querySelector("#bzr-e").value, media: photos };
      if (!rating) { err.hidden = false; err.textContent = "Pick a star rating."; return; }
      btn.disabled = true; btn.textContent = "Sending…";
      fetch(API + "/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) { err.hidden = false; err.textContent = j.error; btn.disabled = false; btn.textContent = T("form_submit"); return; }
        M.innerHTML = '<button type="button" class="bzr-x" aria-label="Close">×</button><div class="bzr-ok"><div style="margin-bottom:8px">' + stars(rating, 26) + "</div><h3>" + esc(T("form_thanks")) + '</h3><p style="color:' + D.colors.muted + ';font-size:14px">' + (j.status === "published" ? "Your review is live." : "Your review will appear after a quick check.") + "</p></div>";
        M.querySelector(".bzr-x").onclick = close;
      }).catch(function () { err.hidden = false; err.textContent = "Something went wrong. Please try again."; btn.disabled = false; btn.textContent = T("form_submit"); });
    };
  }

  /* ---------- find where to show things ---------- */
  function boot() {
    applyCss();
    var done = new WeakSet();
    function scan() {
      var pid0 = productIdOf(null);
      document.querySelectorAll("[data-bz-stars]" + (active ? ",[data-oke-star-rating]" : "")).forEach(function (el) { if (done.has(el)) return; done.add(el); var p = productIdOf(el) || pid0; if (p) mountStars(el, p); });
      document.querySelectorAll("[data-bz-reviews]" + (active ? ",[data-oke-widget]" : "")).forEach(function (el) { if (done.has(el)) return; done.add(el); var p = productIdOf(el) || pid0; if (p && !document.getElementById("bz-reviews")) mountWidget(el, p); });
    }
    // No review block in the theme (the old review app's blocks were removed)? Put the reviews in on their own:
    // the section goes above "You might also like" (or at the end of the page), the stars go under the product title.
    function fallback() {
      if (studio || !active || !/\/products\//.test(location.pathname)) return;
      var pid0 = productIdOf(null); if (!pid0) return;
      if (!document.getElementById("bz-reviews") && !document.querySelector("[data-bz-reviews],[data-oke-widget]")) {
        var main = document.querySelector("main") || document.body, where = D.layout.placement || "before_related";
        var rel = main.querySelector("[id*='related'],[id*='recommend'],.recommended-products,product-recommendations");
        var sec = rel && rel.closest(".shopify-section") || rel;
        var prod = main.querySelector(".shopify-section [id^='ProductInfo'], .product, product-info");
        var prodSec = (prod && prod.closest(".shopify-section")) || main.querySelector(".shopify-section");
        var host = document.createElement("div"); host.className = "page-width bzr-auto"; host.style.cssText = "max-width:1200px;margin:0 auto;padding:0 20px";
        var anchor = document.createElement("div"); host.appendChild(anchor);
        if (where === "after_product" && prodSec) prodSec.insertAdjacentElement("afterend", host);
        else if (where === "end") main.appendChild(host);
        else if (sec && sec.parentNode) sec.parentNode.insertBefore(host, sec); else main.appendChild(host);
        done.add(anchor); mountWidget(anchor, pid0);
      }
      if (!document.querySelector(".bzr-stars-host") && !document.querySelector("[data-bz-stars],[data-oke-star-rating]")) {
        var sp = D.layout.stars_placement || "under_title";
        var t = sp === "off" ? null : sp === "under_price" ? document.querySelector("main .price, main .product__price, main [id^='price-'], main .product-price") : null;
        t = t || (sp === "off" ? null : document.querySelector(".product__title, .product-title, .product__info-container h1, main h1"));
        if (t) { var a2 = document.createElement("div"); (t.closest(".product__title") || t).insertAdjacentElement("afterend", a2); done.add(a2); mountStars(a2, pid0); }
      }
    }
    document.addEventListener("shopify:section:load", function () { setTimeout(scan, 50); });   // theme editor: a section was added or moved
    scan(); if (!studio) { setTimeout(scan, 1500); setTimeout(function () { scan(); fallback(); }, 2500); }
  }
  // Customize editor: the design arrives by message and redraws in place.
  if (studio) window.addEventListener("message", function (e) {
    var d = e.data || {}; if (!d.bzrDesign) return;
    var oldSort = D.behavior.sort; D = merge(DEF, d.bzrDesign); applyCss();
    REDRAW.forEach(function (f) { f(D.behavior.sort !== oldSort); });
  });
  function start() { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot(); }
  if (draft && !studio) get("/design?draft=1").then(function (j) { if (j && j.design) D = merge(DEF, j.design); start(); }).catch(start);
  else start();
  if (studio) try { parent.postMessage({ bzr: 1, t: "ready" }, "*"); } catch (e) {}
})();
