/* Buzzin · product reviews on the store (replaces Okendo's widget).
   Loaded by the Buzzin script already on the theme, only on product pages (or where a [data-bz-reviews] / [data-bz-stars]
   element exists). Until reviews are switched on for a store it only runs in preview: add ?bz_reviews=1 to any product
   URL (remembered for the visit, ?bz_reviews=0 turns it off). When it runs, it takes the place of Okendo's stars and
   review section, so the theme needs no change to try it. */
(function () {
  if (window.__bzReviews) return; window.__bzReviews = 1;
  var C = window.BZR || {}; var API = (C.origin || "") + "/rv/" + C.store;
  try { var q = new URLSearchParams(location.search).get("bz_reviews"); if (q === "1") sessionStorage.setItem("bz_reviews", "1"); if (q === "0") sessionStorage.removeItem("bz_reviews"); } catch (e) {}
  var preview = false; try { preview = sessionStorage.getItem("bz_reviews") === "1"; } catch (e) {}
  var active = !!C.live || preview;
  var forced = document.querySelector("[data-bz-reviews],[data-bz-stars]");
  if (!active && !forced) return;

  var NAVY = "#242F3F";
  var css = "\
.bzr{font:inherit;color:#2C3E50;margin:28px 0;line-height:1.5}.bzr *{box-sizing:border-box}\
.bzr-st{display:inline-flex;gap:3px;vertical-align:middle}.bzr-st svg{display:block}\
.bzr-sum{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px 40px;align-items:start;padding-bottom:22px;border-bottom:1px solid #E5E5EB}\
@media(max-width:700px){.bzr-sum{grid-template-columns:1fr}}\
.bzr-avg{font-size:22px;font-weight:600;color:#2C3E50;margin:0 0 4px}.bzr-based{font-size:13px;color:#676986;margin-left:10px}\
.bzr-hist{margin-top:14px;display:flex;flex-direction:column;gap:7px;max-width:340px}.bzr-hr{display:flex;align-items:center;gap:10px;font-size:13px;cursor:pointer;background:none;border:0;padding:0;color:inherit;font:inherit;text-align:left}\
.bzr-hr span:first-child{width:52px;text-decoration:underline;white-space:nowrap}.bzr-bar{flex:1;height:6px;background:#EDEEF2;border-radius:6px;overflow:hidden}.bzr-bar i{display:block;height:100%;background:" + NAVY + "}.bzr-hr span:last-child{width:46px;color:#676986}\
.bzr-hr.on span:first-child{font-weight:700}\
.bzr-rec{font-size:14px;color:#676986}.bzr-rec b{font-size:20px;color:#2C3E50;margin-right:6px}\
.bzr-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:18px 0 12px}\
.bzr-pill{border:1px solid #DBDDE4;background:#fff;color:#0B0B0B;border-radius:100px;padding:7px 15px;font:inherit;font-size:13px;cursor:pointer}.bzr-pill.on{background:#878787;border-color:#878787;color:#fff}\
.bzr-btn{background:" + NAVY + ";color:#fff;border:0;border-radius:20px;padding:9px 18px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}.bzr-btn:hover{background:#212121}.bzr-btn[disabled]{opacity:.6;cursor:default}\
.bzr-sel{border:1px solid #DBDDE4;border-radius:100px;padding:7px 12px;font:inherit;font-size:13px;background:#fff;color:#0B0B0B}\
.bzr-count{font-size:13px;color:#676986}\
.bzr-list{display:flex;flex-direction:column;gap:12px}\
.bzr-card{border:1px solid #B6B6B6;border-radius:6px;padding:18px 20px;background:#fff}\
.bzr-card h4{margin:8px 0 6px;font-size:17px;font-weight:600;color:#2C3E50}.bzr-body{font-size:14px;white-space:pre-wrap;word-wrap:break-word}\
.bzr-body.clip{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}.bzr-more{background:none;border:0;padding:0;color:#0E7A82;font:inherit;font-size:13px;cursor:pointer;margin-top:4px}\
.bzr-media{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}.bzr-media button{border:0;padding:0;background:none;cursor:zoom-in}.bzr-media img{width:80px;height:80px;object-fit:cover;border-radius:4px;display:block}\
.bzr-prod{display:flex;gap:10px;align-items:center;margin-top:14px;font-size:12.5px;color:#676986}.bzr-prod img{width:44px;height:44px;object-fit:cover;border-radius:4px}.bzr-prod b{display:block;color:#2C3E50;font-weight:600}\
.bzr-foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;font-size:13px}.bzr-ver{color:#0E7A82;font-weight:600;margin-left:6px}.bzr-date{color:#676986;font-size:12px}\
.bzr-reply{margin-top:12px;background:#F7F7F8;border-radius:6px;padding:10px 12px;font-size:13.5px}.bzr-reply b{display:block;font-size:12.5px;margin-bottom:3px}\
.bzr-loadmore{display:block;margin:16px auto 0}\
.bzr-empty{padding:20px 0;color:#676986;font-size:14px}\
.bzr-sr{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;color:#2C3E50;background:none;border:0;padding:0;font-family:inherit}.bzr-sr u{text-decoration:none}\
.bzr-ov{position:fixed;inset:0;background:rgba(20,22,30,.55);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px}\
.bzr-modal *,.bzr-ov *{box-sizing:border-box}.bzr-modal{background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:92vh;overflow:auto;padding:22px 22px 18px;position:relative;color:#2C3E50}\
.bzr-x{position:absolute;right:12px;top:10px;border:0;background:none;font-size:26px;line-height:1;cursor:pointer;color:#676986}\
.bzr-modal h3{margin:0 0 4px;font-size:20px}.bzr-modal label{display:block;font-size:13px;font-weight:600;margin:14px 0 5px}\
.bzr-modal input[type=text],.bzr-modal input[type=email],.bzr-modal textarea{width:100%;border:1px solid #DBDDE4;border-radius:8px;padding:10px 12px;font:inherit;font-size:14px;color:#2C3E50}\
.bzr-modal textarea{min-height:120px;resize:vertical}.bzr-pick{display:flex;gap:6px}.bzr-pick button{border:0;background:none;padding:0;cursor:pointer}\
.bzr-err{color:#b42318;font-size:13px;margin-top:10px}.bzr-ok{text-align:center;padding:24px 6px}.bzr-thumbs{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.bzr-thumbs img{width:60px;height:60px;object-fit:cover;border-radius:6px}\
.bzr-lb{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2147483001;display:flex;align-items:center;justify-content:center;cursor:zoom-out}.bzr-lb img{max-width:94vw;max-height:90vh;border-radius:6px}\
.bzr-hide{display:none!important}.bzr{color:#2C3E50}.bzr-top{display:grid;grid-template-columns:minmax(260px,1fr) minmax(0,1.5fr);gap:22px 48px;align-items:start;margin-bottom:24px}@media(max-width:760px){.bzr-top{grid-template-columns:1fr}}.bzr-avgline{display:flex;align-items:center;gap:8px;font-size:14px;margin-bottom:12px}.bzr-avgline b{font-size:18px}.bzr-avgline span{margin-left:8px}.bzr .bzr-hist{max-width:none;gap:4px;margin:0}.bzr .bzr-hr{gap:12px}.bzr-hn{width:10px;font-size:13px;text-decoration:none!important}.bzr-hs{width:14px;font-size:15px;color:#242F3F;text-decoration:none!important}.bzr .bzr-bar{height:4px}.bzr-hc{width:40px;font-size:13px;color:#2C3E50!important}.bzr-tr .bzr-rec{font-size:14px;color:#2C3E50;margin-bottom:12px}.bzr-tr .bzr-rec b{font-size:17px;margin:0}.bzr-strip{display:flex;gap:4px;overflow:hidden}.bzr-strip button{flex:0 0 auto;border:0;padding:0;background:none;cursor:zoom-in}.bzr-strip img{width:100px;height:100px;object-fit:cover;display:block}@media(max-width:760px){.bzr-strip{overflow-x:auto}.bzr-strip img{width:84px;height:84px}}.bzr-ai{margin:6px 0 26px}.bzr-h5{font-weight:700;font-size:15px;margin:14px 0 8px}.bzr-ai p{font-size:14.5px;line-height:1.6;margin:0}.bzr-topics,.bzr-chips{display:flex;gap:8px;flex-wrap:wrap}.bzr-chip{border:1px solid #2C3E50;background:#fff;color:#2C3E50;border-radius:8px;padding:6px 13px;font:inherit;font-size:13.5px;cursor:pointer}.bzr-chip.on{background:#242F3F;color:#fff;border-color:#242F3F}.bzr-tabs{border-bottom:1px solid #E5E5EB;margin-bottom:16px}.bzr-tabs span{display:inline-block;font-weight:700;font-size:15px;padding:0 0 8px;border-bottom:2px solid #2C3E50;margin-bottom:-1px}.bzr .bzr-tools{margin:0 0 14px}.bzr .bzr-btn{border-radius:8px;padding:10px 18px;font-size:14px}.bzr-fpanel{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;background:#F7F7F8;border-radius:10px;padding:14px 16px;margin-bottom:14px}.bzr-fpanel label{display:block;font-size:12.5px;font-weight:700;margin-bottom:6px}.bzr-fpanel input{width:100%;border:1px solid #DBDDE4;border-radius:8px;padding:8px 10px;font:inherit;font-size:14px}.bzr-meta{display:flex;justify-content:space-between;align-items:center;font-size:14px;padding:8px 0 12px;border-bottom:1px solid #E5E5EB}.bzr-sort{font-weight:700;display:flex;align-items:center;gap:8px}.bzr-sort select{border:0;font:inherit;font-weight:400;background:transparent;color:#2C3E50;cursor:pointer}.bzr-clear{border:0;background:none;color:#0E7A82;font:inherit;font-size:13px;cursor:pointer;text-decoration:underline;margin-left:6px}.bzr .bzr-list{gap:0}.bzr-row{display:grid;grid-template-columns:262px minmax(0,1fr);gap:22px;padding:20px 0;border-bottom:1px solid #E5E5EB}@media(max-width:760px){.bzr-row{grid-template-columns:1fr;gap:12px}}.bzr-who{border:1px solid #E5E5EB;border-radius:4px;padding:14px;font-size:13px;align-self:start}.bzr-id{display:flex;gap:12px;align-items:center}.bzr-av{width:42px;height:42px;border-radius:50%;background:#242F3F;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex:none}.bzr-id b{font-size:14px}.bzr-ver{font-weight:700;font-size:13px}.bzr-ver span{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:50%;background:#242F3F;color:#fff;font-size:9px;margin-left:3px}.bzr-rv{margin-top:12px}.bzr-rvp{display:flex;gap:10px;align-items:center;margin-top:4px}.bzr-rvp img{width:40px;height:40px;object-fit:cover}.bzr-recy{margin-top:12px}.bzr-attr{display:flex;justify-content:space-between;gap:10px;margin-top:8px}.bzr-attr span{text-align:right}.bzr-rh{display:flex;justify-content:space-between;align-items:center}.bzr .bzr-date{font-size:13px;color:#2C3E50}.bzr-main h4{margin:10px 0 6px;font-size:16px;font-weight:600}.bzr-main .bzr-body{font-size:14px;line-height:1.55}.bzr .bzr-media img{width:64px;height:64px}.bzr-help{text-align:right;font-size:13px;margin-top:12px}.bzr-help button{border:0;background:none;font:inherit;font-size:13px;cursor:pointer;margin-left:10px;color:#2C3E50;display:inline-flex;align-items:center;gap:4px}.bzr-help svg,.bzr-recy svg{vertical-align:-2px}.bzr .bzr-ver{color:#2C3E50}@media(max-width:760px){.bzr-who{border:0;padding:0}.bzr-av{width:34px;height:34px;font-size:12px}.bzr-rv,.bzr-recy{display:none}.bzr-attr{display:inline-flex;gap:4px;margin:6px 12px 0 0;font-size:12px}.bzr-row{gap:8px;padding:16px 0}}";
  var st = document.createElement("style"); st.textContent = css + (active ? "[data-oke-widget],[data-oke-star-rating]{display:none!important}" : ""); document.head.appendChild(st);

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function star(fill, size) {   // fill 0..1
    var id = "g" + Math.random().toString(36).slice(2, 8), s = size || 18;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="' + id + '"><stop offset="' + (fill * 100) + '%" stop-color="' + NAVY + '"/><stop offset="' + (fill * 100) + '%" stop-color="#FFFFFF"/></linearGradient></defs><path d="M12 2.6l2.9 6.2 6.7.7-5 4.6 1.4 6.7L12 17.4l-6 3.4 1.4-6.7-5-4.6 6.7-.7z" fill="url(#' + id + ')" stroke="#2C3E50" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  }
  function stars(v, size) { var h = '<span class="bzr-st" role="img" aria-label="' + v + ' out of 5 stars">'; for (var i = 1; i <= 5; i++) h += star(Math.max(0, Math.min(1, v - i + 1)), size); return h + "</span>"; }
  function fmtDate(d) { try { var x = new Date(d); return (x.getMonth() + 1) + "/" + x.getDate() + "/" + String(x.getFullYear()).slice(2); } catch (e) { return ""; } }
  function get(u) { return fetch(API + u).then(function (r) { return r.json(); }); }
  function productIdOf(el) {
    var v = el && (el.getAttribute("data-product-id") || el.getAttribute("data-oke-reviews-product-id"));
    if (!v && window.ShopifyAnalytics && ShopifyAnalytics.meta && ShopifyAnalytics.meta.product) v = ShopifyAnalytics.meta.product.id;
    if (!v && window.meta && window.meta.product) v = window.meta.product.id;
    return v ? String(v).replace(/\D/g, "") : null;
  }
  function productMeta() {
    var m = (window.ShopifyAnalytics && ShopifyAnalytics.meta && ShopifyAnalytics.meta.product) || {};
    var t = document.querySelector('meta[property="og:title"]'), im = document.querySelector('meta[property="og:image"]');
    return { title: (t && t.content) || document.title, image: im && im.content, handle: (location.pathname.match(/\/products\/([^/?#]+)/) || [])[1] || "" , variants: m.variants || [] };
  }

  /* ---------- star rating under the product title ---------- */
  function mountStars(host, pid) {
    var box = document.createElement("div"); box.className = "bzr-stars-host"; host.parentNode.insertBefore(box, host);
    get("/stars?ids=" + pid).then(function (j) {
      var a = j[pid]; if (!a || !a.count) return;
      box.innerHTML = '<button type="button" class="bzr-sr">' + stars(a.average, 17) + ' <u>' + a.count + ' Review' + (a.count === 1 ? "" : "s") + "</u></button>";
      box.firstChild.onclick = function () { var w = document.querySelector(".bzr"); if (w) w.scrollIntoView({ behavior: "smooth", block: "start" }); };
    }).catch(function () {});
  }

  /* ---------- the review section (review first, photos small) ---------- */
  function ago(d) {
    var t = (Date.now() - new Date(d)) / 1000; if (!(t >= 0)) return fmtDate(d);
    if (t < 3600) return Math.max(1, Math.round(t / 60)) + " minutes ago"; if (t < 86400) { var h = Math.round(t / 3600); return h + " hour" + (h === 1 ? "" : "s") + " ago"; }
    if (t < 86400 * 30) { var dd = Math.round(t / 86400); return dd + " day" + (dd === 1 ? "" : "s") + " ago"; } return fmtDate(d);
  }
  function kfmt(n) { return n >= 1000 ? (Math.round(n / 100) / 10) + "k" : String(n); }
  function initials(n) { return String(n || "?").replace(/[^A-Za-z .]/g, "").split(/[\s.]+/).filter(Boolean).slice(0, 2).map(function (x) { return x[0].toUpperCase(); }).join("") || "★"; }
  function mountWidget(host, pid) {
    var root = document.createElement("div"); root.className = "bzr"; root.id = "bz-reviews"; host.parentNode.insertBefore(root, host);
    var S = { sort: "media", rating: "", media: "", q: "", page: 1, list: [], summary: null, total: 0, more: false, photos: [], ai: null, filters: false };
    get("/summary/" + pid).then(function (j) { if (j && j.summary) { S.ai = j; render(); } }).catch(function () {});
    function load(reset) {
      if (reset) { S.page = 1; S.list = []; }
      return get("/product/" + pid + "?sort=" + S.sort + "&rating=" + S.rating + "&media=" + S.media + "&q=" + encodeURIComponent(S.q) + "&page=" + S.page).then(function (j) {
        S.summary = j.summary; S.total = j.total; S.more = j.more; if (j.photos) S.photos = j.photos; S.list = S.list.concat(j.reviews || []); render();
      }).catch(function () { if (!S.summary) root.innerHTML = ""; });
    }
    function render() {
      var a = S.summary || { count: 0, average: 0, histogram: {} }, h = "";
      if (a.count) {
        h += '<div class="bzr-top"><div class="bzr-tl"><div class="bzr-avgline"><b>' + a.average.toFixed(1) + "</b>" + stars(a.average, 15) + "<span>Based on " + a.count.toLocaleString() + " review" + (a.count === 1 ? "" : "s") + '</span></div><div class="bzr-hist">';
        for (var i = 5; i >= 1; i--) { var n = a.histogram[i] || 0; h += '<button type="button" class="bzr-hr' + (String(S.rating) === String(i) ? " on" : "") + '" data-r="' + i + '" aria-label="Show ' + i + '-star reviews"><span class="bzr-hn">' + i + '</span><span class="bzr-hs">★</span><span class="bzr-bar"><i style="width:' + Math.max(n ? 2 : 0, Math.round((100 * n) / a.count)) + '%"></i></span><span class="bzr-hc">' + kfmt(n) + "</span></button>"; }
        h += '</div></div><div class="bzr-tr">' + (a.recommend_pct != null ? '<div class="bzr-rec"><b>' + a.recommend_pct + "%</b> would recommend this product</div>" : "") +
          (S.photos && S.photos.length ? '<div class="bzr-strip">' + S.photos.map(function (p) { return '<button type="button" data-img="' + esc(p.url) + '"><img loading="lazy" src="' + esc(p.thumb) + '" alt="Customer photo"></button>'; }).join("") + "</div>" : "") + "</div></div>";
        if (S.ai) h += '<div class="bzr-ai"><div class="bzr-h5">Reviews Summary <span aria-hidden="true">✧</span></div><p>' + esc(S.ai.summary) + "</p>" +
          (S.ai.topics && S.ai.topics.length ? '<div class="bzr-h5">Customers Talked About</div><div class="bzr-topics">' + S.ai.topics.map(function (t) { return '<button type="button" class="bzr-chip' + (S.q.toLowerCase() === String(t).toLowerCase() ? " on" : "") + '" data-topic="' + esc(t) + '">' + esc(t) + "</button>"; }).join("") + "</div>" : "") + "</div>";
      }
      h += '<div class="bzr-tabs"><span class="on">Reviews (' + a.count.toLocaleString() + ")</span></div>";
      h += '<div class="bzr-tools"><button type="button" class="bzr-btn" data-filters="1">☰ Filters' + ((S.rating || S.media || S.q) ? " •" : "") + '</button><button type="button" class="bzr-btn" data-write="1">✎ Write a Review</button></div>';
      if (S.filters) h += '<div class="bzr-fpanel"><div><label>Rating</label><div class="bzr-chips">' + ["", "5", "4", "3", "2", "1"].map(function (r) { return '<button type="button" class="bzr-chip' + (String(S.rating) === r ? " on" : "") + '" data-fr="' + r + '">' + (r ? r + " ★" : "All") + "</button>"; }).join("") + "</div></div>" +
        '<div><label>Show</label><div class="bzr-chips"><button type="button" class="bzr-chip' + (!S.media ? " on" : "") + '" data-fm="">All reviews</button><button type="button" class="bzr-chip' + (S.media ? " on" : "") + '" data-fm="1">With photos</button></div></div>' +
        '<div><label for="bzr-q">Search reviews</label><input id="bzr-q" type="search" placeholder="e.g. soft, zipper, size" value="' + esc(S.q) + '"></div></div>';
      h += '<div class="bzr-meta"><span>' + S.total.toLocaleString() + " review" + (S.total === 1 ? "" : "s") + ((S.rating || S.media || S.q) ? ' <button type="button" class="bzr-clear" data-clear="1">Clear filters</button>' : "") + '</span>' +
        (a.count ? '<label class="bzr-sort">Sort <select aria-label="Sort reviews"><option value="newest">Most Recent</option><option value="media">Most Helpful</option><option value="highest">Highest Rating</option><option value="lowest">Lowest Rating</option></select></label>' : "") + "</div>";
      if (S.list.length) { h += '<div class="bzr-list">' + S.list.map(row).join("") + "</div>"; if (S.more) h += '<button type="button" class="bzr-btn bzr-loadmore" data-more="1">Show more reviews</button>'; }
      else h += '<div class="bzr-empty">' + (a.count ? "No reviews match." : "Be the first to review this product.") + "</div>";
      root.innerHTML = h;
      var sel = root.querySelector(".bzr-sort select"); if (sel) { sel.value = S.sort; sel.onchange = function () { S.sort = sel.value; load(true); }; }
      var qi = root.querySelector("#bzr-q"); if (qi) qi.onkeydown = function (e) { if (e.key === "Enter") { S.q = qi.value.trim(); load(true); } };
    }
    function row(r) {
      var long = (r.body || "").length > 600;
      var attrs = []; if (r.variant) attrs.push(["Size Purchased", r.variant]);
      if (r.answers) Object.keys(r.answers).slice(0, 3).forEach(function (k) { attrs.push([k, r.answers[k]]); });
      return '<div class="bzr-row"><aside class="bzr-who"><div class="bzr-id"><span class="bzr-av">' + esc(initials(r.name)) + "</span><div><b>" + esc(r.name) + "</b>" + (r.verified ? '<div class="bzr-ver">Verified Buyer <span aria-hidden="true">✓</span></div>' : "") + "</div></div>" +
        (r.product ? '<div class="bzr-rv"><b>Reviewing</b><div class="bzr-rvp">' + (r.product_image ? '<img loading="lazy" src="' + esc(r.product_image) + '" alt="">' : "") + "<span>" + esc(r.product) + "</span></div></div>" : "") +
        (r.recommended ? '<div class="bzr-recy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3a4 4 0 0 0 4-4V6a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1-2 2h-7a3 3 0 0 1-3-3"/></svg> I recommend this product</div>' : "") +
        attrs.map(function (x) { return '<div class="bzr-attr"><b>' + esc(x[0]) + ":</b><span>" + esc(x[1]) + "</span></div>"; }).join("") + "</aside>" +
        '<div class="bzr-main"><div class="bzr-rh">' + stars(r.rating, 13) + '<span class="bzr-date">' + ago(r.date) + "</span></div>" + (r.title ? "<h4>" + esc(r.title) + "</h4>" : "") +
        '<div class="bzr-body' + (long ? " clip" : "") + '">' + esc(r.body) + "</div>" + (long ? '<button type="button" class="bzr-more">Read more</button>' : "") +
        (r.media && r.media.length ? '<div class="bzr-media">' + r.media.filter(function (m) { return m.type !== "video"; }).map(function (m) { return '<button type="button" data-img="' + esc(m.url) + '"><img loading="lazy" src="' + esc(m.thumb) + '" alt="' + esc(m.alt || "Customer photo") + '"></button>'; }).join("") + "</div>" : "") +
        (r.reply ? '<div class="bzr-reply"><b>Response from ' + esc(C.brand || "us") + "</b>" + esc(r.reply) + "</div>" : "") +
        '<div class="bzr-help">Was this helpful? <button type="button" data-help="' + esc(r.id) + '" aria-label="Helpful"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3a4 4 0 0 0 4-4V6a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1-2 2h-7a3 3 0 0 1-3-3"/></svg><span>' + (r.helpful || 0) + '</span></button><button type="button" data-unhelp="' + esc(r.id) + '" aria-label="Not helpful"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transform:rotate(180deg)"><path d="M7 11v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3a4 4 0 0 0 4-4V6a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1-2 2h-7a3 3 0 0 1-3-3"/></svg><span>' + (r.unhelpful || 0) + "</span></button></div></div></div>";
    }
    var voted = {};
    root.addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) return;
      if (t.dataset.r) { S.rating = String(S.rating) === t.dataset.r ? "" : t.dataset.r; load(true); }
      else if (t.dataset.fr != null && t.hasAttribute("data-fr")) { S.rating = t.dataset.fr; load(true); }
      else if (t.hasAttribute("data-fm")) { S.media = t.dataset.fm; load(true); }
      else if (t.dataset.topic) { S.q = S.q.toLowerCase() === t.dataset.topic.toLowerCase() ? "" : t.dataset.topic; load(true); }
      else if (t.dataset.clear) { S.rating = ""; S.media = ""; S.q = ""; load(true); }
      else if (t.dataset.filters) { S.filters = !S.filters; render(); }
      else if (t.dataset.more) { t.disabled = true; S.page++; load(false); }
      else if (t.dataset.write) openForm(pid);
      else if (t.dataset.img) lightbox(t.dataset.img);
      else if (t.dataset.help || t.dataset.unhelp) { var id = t.dataset.help || t.dataset.unhelp; if (voted[id]) return; voted[id] = 1; var sp = t.querySelector("span"); sp.textContent = Number(sp.textContent) + 1; fetch(API + "/helpful/" + id + (t.dataset.unhelp ? "?no=1" : ""), { method: "POST" }).catch(function () {}); }
      else if (t.classList.contains("bzr-more")) { var b = t.previousElementSibling; b.classList.remove("clip"); t.remove(); }
    });
    load(true);
  }
  function lightbox(src) { var o = document.createElement("div"); o.className = "bzr-lb"; o.innerHTML = '<img src="' + esc(src) + '" alt="">'; o.onclick = function () { o.remove(); }; document.body.appendChild(o); }

  /* ---------- write a review ---------- */
  function openForm(pid) {
    var meta = productMeta(), rating = 0, photos = [];
    var ov = document.createElement("div"); ov.className = "bzr-ov";
    ov.innerHTML = '<div class="bzr-modal" role="dialog" aria-modal="true" aria-label="Write a review"><button type="button" class="bzr-x" aria-label="Close">×</button>' +
      "<h3>Write a review</h3><div style=\"font-size:13px;color:#676986\">" + esc(meta.title) + "</div>" +
      '<label>Your rating</label><div class="bzr-pick" role="radiogroup">' + [1, 2, 3, 4, 5].map(function (i) { return '<button type="button" data-v="' + i + '" aria-label="' + i + ' star' + (i > 1 ? "s" : "") + '">' + star(0, 30) + "</button>"; }).join("") + "</div>" +
      '<label for="bzr-t">Title</label><input type="text" id="bzr-t" maxlength="150" placeholder="Sum it up">' +
      '<label for="bzr-b">Review</label><textarea id="bzr-b" maxlength="5000" placeholder="How was the fit, the fabric, and how did your little one like it?"></textarea>' +
      '<label>Photos <span style="font-weight:400;color:#676986">(optional)</span></label><input type="file" id="bzr-f" accept="image/*" multiple><div class="bzr-thumbs"></div>' +
      '<label for="bzr-n">Your name</label><input type="text" id="bzr-n" maxlength="60" placeholder="First name and last initial">' +
      '<label for="bzr-e">Email</label><input type="email" id="bzr-e" maxlength="200" placeholder="Only used to confirm your review. Never shown.">' +
      '<div class="bzr-err" hidden></div><div style="margin-top:16px;display:flex;justify-content:flex-end"><button type="button" class="bzr-btn" data-send="1">Submit review</button></div></div>';
    document.body.appendChild(ov);
    var M = ov.querySelector(".bzr-modal"), err = M.querySelector(".bzr-err");
    function paint() { M.querySelectorAll(".bzr-pick button").forEach(function (b) { b.innerHTML = star(Number(b.dataset.v) <= rating ? 1 : 0, 30); }); }
    function close() { ov.remove(); }
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    M.querySelector(".bzr-x").onclick = close;
    M.querySelectorAll(".bzr-pick button").forEach(function (b) { b.onclick = function () { rating = Number(b.dataset.v); paint(); }; });
    M.querySelector("#bzr-f").onchange = function (e) {
      var files = [].slice.call(e.target.files || [], 0, 6 - photos.length);
      files.forEach(function (f) {
        fetch(API + "/upload", { method: "POST", headers: { "Content-Type": f.type || "image/jpeg" }, body: f }).then(function (r) { return r.json(); }).then(function (j) {
          if (j.url) { photos.push({ url: j.url }); M.querySelector(".bzr-thumbs").insertAdjacentHTML("beforeend", '<img src="' + esc(j.url) + '" alt="">'); } else { err.hidden = false; err.textContent = j.error || "Couldn't add that photo."; }
        }).catch(function () { err.hidden = false; err.textContent = "Couldn't add that photo."; });
      });
    };
    M.querySelector("[data-send]").onclick = function () {
      var btn = this; err.hidden = true;
      var body = { product_id: pid, product_title: meta.title, product_image: meta.image, product_handle: meta.handle, rating: rating, title: M.querySelector("#bzr-t").value, body: M.querySelector("#bzr-b").value,
        name: M.querySelector("#bzr-n").value, email: M.querySelector("#bzr-e").value, media: photos };
      if (!rating) { err.hidden = false; err.textContent = "Pick a star rating."; return; }
      btn.disabled = true; btn.textContent = "Sending…";
      fetch(API + "/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) { err.hidden = false; err.textContent = j.error; btn.disabled = false; btn.textContent = "Submit review"; return; }
        M.innerHTML = '<button type="button" class="bzr-x" aria-label="Close">×</button><div class="bzr-ok"><div style="margin-bottom:8px">' + stars(rating, 26) + "</div><h3>Thank you!</h3><p style=\"color:#676986;font-size:14px\">" + (j.status === "published" ? "Your review is live." : "Your review will appear after a quick check.") + "</p></div>";
        M.querySelector(".bzr-x").onclick = close;
      }).catch(function () { err.hidden = false; err.textContent = "Something went wrong. Please try again."; btn.disabled = false; btn.textContent = "Submit review"; });
    };
  }

  /* ---------- find where to show things ---------- */
  function boot() {
    var done = new WeakSet();
    function scan() {
      var pid0 = productIdOf(null);
      document.querySelectorAll("[data-bz-stars]" + (active ? ",[data-oke-star-rating]" : "")).forEach(function (el) { if (done.has(el)) return; done.add(el); var p = productIdOf(el) || pid0; if (p) mountStars(el, p); });
      document.querySelectorAll("[data-bz-reviews]" + (active ? ",[data-oke-widget]" : "")).forEach(function (el) { if (done.has(el)) return; done.add(el); var p = productIdOf(el) || pid0; if (p && !document.getElementById("bz-reviews")) mountWidget(el, p); });
    }
    scan(); setTimeout(scan, 1500); setTimeout(scan, 4000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
