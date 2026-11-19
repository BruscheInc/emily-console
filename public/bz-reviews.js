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
.bzr-hide{display:none!important}";
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

  /* ---------- the review section ---------- */
  function mountWidget(host, pid) {
    var root = document.createElement("div"); root.className = "bzr"; root.id = "bz-reviews"; host.parentNode.insertBefore(root, host);
    var S = { sort: "media", rating: "", media: "", page: 1, list: [], summary: null, total: 0, more: false };
    function load(reset) {
      if (reset) { S.page = 1; S.list = []; }
      return get("/product/" + pid + "?sort=" + S.sort + "&rating=" + S.rating + "&media=" + S.media + "&page=" + S.page).then(function (j) {
        S.summary = j.summary; S.total = j.total; S.more = j.more; S.list = S.list.concat(j.reviews || []); render();
      }).catch(function () { if (!S.summary) root.innerHTML = ""; });
    }
    function render() {
      var a = S.summary || { count: 0, average: 0, histogram: {} };
      var h = "";
      if (a.count) {
        h += '<div class="bzr-sum"><div><div class="bzr-avg">' + a.average.toFixed(1) + ' out of 5.0</div><div>' + stars(a.average, 20) + '<span class="bzr-based">(Based on ' + a.count + " review" + (a.count === 1 ? "" : "s") + ")</span></div><div class=\"bzr-hist\">";
        for (var i = 5; i >= 1; i--) { var n = a.histogram[i] || 0; h += '<button type="button" class="bzr-hr' + (String(S.rating) === String(i) ? " on" : "") + '" data-r="' + i + '"><span>' + i + " Star" + (i === 1 ? "" : "s") + '</span><span class="bzr-bar"><i style="width:' + (a.count ? Math.round((100 * n) / a.count) : 0) + '%"></i></span><span>(' + n + ")</span></button>"; }
        h += "</div></div><div>" + (a.recommend_pct != null ? '<div class="bzr-rec"><b>' + a.recommend_pct + "%</b>would recommend this product</div>" : "") + "</div></div>";
      }
      h += '<div class="bzr-tools"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="bzr-count">' + (a.count ? S.total + " review" + (S.total === 1 ? "" : "s") + (S.rating ? " with " + S.rating + " star" + (S.rating === "1" ? "" : "s") : "") : "No reviews yet") + "</span>" +
        (a.with_media ? '<button type="button" class="bzr-pill' + (S.media ? " on" : "") + '" data-m="1">Photos &amp; Videos</button>' : "") + (S.rating ? '<button type="button" class="bzr-pill on" data-clear="1">' + S.rating + " stars ✕</button>" : "") + "</div>" +
        '<div style="display:flex;gap:8px;align-items:center">' + (a.count ? '<select class="bzr-sel" aria-label="Sort reviews"><option value="media">Most helpful</option><option value="newest">Newest</option><option value="highest">Highest rating</option><option value="lowest">Lowest rating</option></select>' : "") +
        '<button type="button" class="bzr-btn" data-write="1">✎ Write a Review</button></div></div>';
      if (S.list.length) {
        h += '<div class="bzr-list">' + S.list.map(card).join("") + "</div>";
        if (S.more) h += '<button type="button" class="bzr-btn bzr-loadmore" data-more="1">Load more</button>';
      } else if (a.count) h += '<div class="bzr-empty">No reviews match.</div>';
      else h += '<div class="bzr-empty">Be the first to review this product.</div>';
      root.innerHTML = h;
      var sel = root.querySelector(".bzr-sel"); if (sel) { sel.value = S.sort; sel.onchange = function () { S.sort = sel.value; load(true); }; }
    }
    function card(r, i) {
      var long = (r.body || "").length > 420;
      return '<div class="bzr-card">' + stars(r.rating, 17) + (r.title ? "<h4>" + esc(r.title) + "</h4>" : '<div style="height:8px"></div>') +
        '<div class="bzr-body' + (long ? " clip" : "") + '">' + esc(r.body) + "</div>" + (long ? '<button type="button" class="bzr-more">Read more</button>' : "") +
        (r.media && r.media.length ? '<div class="bzr-media">' + r.media.filter(function (m) { return m.type !== "video"; }).map(function (m) { return '<button type="button" data-img="' + esc(m.url) + '"><img loading="lazy" src="' + esc(m.thumb) + '" alt="' + esc(m.alt || "Customer photo") + '"></button>'; }).join("") + "</div>" : "") +
        (r.product ? '<div class="bzr-prod">' + (r.product_image ? '<img loading="lazy" src="' + esc(r.product_image) + '" alt="">' : "") + "<div>Reviewing<b>" + esc(r.product) + "</b>" + (r.variant ? esc(r.variant) : "") + "</div></div>" : "") +
        (r.reply ? '<div class="bzr-reply"><b>Reply from ' + esc(C.brand || "us") + "</b>" + esc(r.reply) + "</div>" : "") +
        '<div class="bzr-foot"><div><b>' + esc(r.name) + "</b>" + (r.verified ? '<span class="bzr-ver">Verified Buyer</span>' : "") + '</div><span class="bzr-date">' + fmtDate(r.date) + "</span></div></div>";
    }
    root.addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) return;
      if (t.dataset.r) { S.rating = String(S.rating) === t.dataset.r ? "" : t.dataset.r; load(true); }
      else if (t.dataset.clear) { S.rating = ""; load(true); }
      else if (t.dataset.m) { S.media = S.media ? "" : "1"; load(true); }
      else if (t.dataset.more) { t.disabled = true; S.page++; load(false); }
      else if (t.dataset.write) openForm(pid);
      else if (t.dataset.img) lightbox(t.dataset.img);
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
