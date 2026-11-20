/* Buzzin · the store-wide reviews page (larkspurbaby.com/pages/reviews).
   Served inside /rv/<store>/widget.js, after the product widget. It runs on /pages/reviews (or anywhere a
   [data-bz-reviews-page] element is placed) and builds the whole page itself, right under the theme's page title,
   so no theme change is needed. Shows when reviews are live for the store, or with ?bz_reviews=1 for a preview. */
(function () {
  if (window.__bzReviewsPage) return;
  var C = window.BZR || {}; if (!C.store) return;
  var host0 = document.querySelector("[data-bz-reviews-page]");
  if (!host0 && !/^\/pages\/reviews\/?$/.test(location.pathname)) return;
  var preview = false; try { preview = sessionStorage.getItem("bz_reviews") === "1" || /bz_reviews=1/.test(location.search); } catch (e) {}
  var WQ = new URLSearchParams(location.search), WRITE = WQ.get("bz_write");   // came from a review request email
  if (!C.live && !preview && !C.studio && !WRITE) return;
  window.__bzReviewsPage = 1;
  var API = (C.origin || "") + "/rv/" + C.store;
  function get(p) { return fetch(API + p, { credentials: "omit" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function n(x) { return Number(x || 0).toLocaleString("en-US"); }
  function fmtDate(d) { try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch (e) { return ""; } }
  function initials(s) { return String(s || "?").replace(/[^A-Za-z .]/g, "").split(/[\s.]+/).filter(Boolean).slice(0, 2).map(function (x) { return x[0].toUpperCase(); }).join("") || "♥"; }
  var STAR = "M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z";
  function star(fill, size, color) {
    var id = "bzp" + Math.random().toString(36).slice(2, 8), c = color || "var(--bzp-star)";
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="' + id + '"><stop offset="' + (fill * 100) + '%" stop-color="' + c + '"/><stop offset="' + (fill * 100) + '%" stop-color="var(--bzp-star-off)"/></linearGradient></defs><path d="' + STAR + '" fill="url(#' + id + ')"/></svg>';
  }
  function stars(v, size, color) { var h = ""; for (var i = 1; i <= 5; i++) h += star(Math.max(0, Math.min(1, v - (i - 1))), size, color); return '<span class="bzp-st" role="img" aria-label="' + v + ' out of 5 stars">' + h + "</span>"; }
  var PASTEL = ["#F6D6D3", "#D9ECF7", "#F9E3C7", "#E3EBD8", "#E8DDF2", "#F5F2E6"];
  function pastel(s) { var h = 0; s = String(s || ""); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return PASTEL[h % PASTEL.length]; }
  var ICON = {
    heart: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 20.3l-1.2-1.1C6 14.9 3 12.2 3 8.8 3 6.1 5.1 4 7.8 4c1.5 0 3 .7 4.2 1.9C13.2 4.7 14.7 4 16.2 4 18.9 4 21 6.1 21 8.8c0 3.4-3 6.1-7.8 10.4L12 20.3z"/></svg>',
    camera: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M9 4l-1.6 2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-2.4L15 4H9zm3 4.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zm0 2a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="' + STAR + '"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M9.5 16.2L5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7z"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M10 3a7 7 0 015.6 11.2l4.6 4.6-1.4 1.4-4.6-4.6A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z"/></svg>'
  };

  var CSS = [
    ".bzp{--bzp-ink:#242f3f;--bzp-mute:#6b7280;--bzp-cream:#f5f2e6;--bzp-peach:#f7a152;--bzp-blue:#afdaf2;--bzp-blush:#f6d6d3;--bzp-star:#242f3f;--bzp-star-off:#dcd8cb;--bzp-line:#ece8dc;color:var(--bzp-ink);font-family:inherit;line-height:1.5;max-width:1200px;margin:0 auto 64px;padding:0 20px;box-sizing:border-box}",
    ".bzp *{box-sizing:border-box}.bzp button{font-family:inherit;cursor:pointer}",
    /* hero */
    ".bzp-hero{position:relative;overflow:hidden;background:var(--bzp-cream);border-radius:32px;padding:56px 28px 70px;text-align:center;margin:8px 0 34px}",
    ".bzp-hero:after{content:'';position:absolute;left:-5%;right:-5%;bottom:-1px;height:46px;background:#fff;border-radius:50% 50% 0 0/100% 100% 0 0}",
    ".bzp-hero h1{font-size:clamp(30px,4.6vw,48px);line-height:1.08;margin:0 0 10px;font-weight:700;color:var(--bzp-ink);letter-spacing:-.01em}",
    ".bzp-hero h1 em{font-style:normal;color:var(--bzp-peach)}",
    ".bzp-hero p.bzp-sub{font-size:17px;color:#4b5563;margin:0 auto 26px;max-width:560px}",
    ".bzp-badge{display:inline-flex;align-items:center;gap:14px;background:#fff;border-radius:999px;padding:12px 24px 12px 14px;box-shadow:0 10px 30px rgba(36,47,63,.08)}",
    ".bzp-badge b{display:grid;place-items:center;width:58px;height:58px;border-radius:50%;background:var(--bzp-ink);color:#fff;font-size:22px;font-weight:700}",
    ".bzp-badge div{text-align:left}.bzp-badge small{display:block;font-size:14px;color:var(--bzp-mute);margin-top:2px}",
    ".bzp-stats{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;margin-top:22px;position:relative;z-index:1}",
    ".bzp-stat{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.75);border-radius:18px;padding:10px 16px;font-size:14.5px;text-align:left}",
    ".bzp-stat i{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;flex:none}",
    ".bzp-stat b{display:block;font-size:17px;line-height:1.1}",
    ".bzp-deco{position:absolute;opacity:.9;pointer-events:none}.bzp-deco svg{display:block;width:100%;height:100%}",
    "@keyframes bzpFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}",
    ".bzp-deco{animation:bzpFloat 5s ease-in-out infinite}",
    /* section titles */
    ".bzp-h2{font-size:clamp(22px,2.6vw,28px);font-weight:700;margin:0 0 4px;display:flex;align-items:center;gap:10px}",
    ".bzp-h2 span{font-size:22px}.bzp-lead{color:var(--bzp-mute);margin:0 0 18px;font-size:15px}",
    /* photo wall */
    ".bzp-snaps{margin:0 0 44px}",
    ".bzp-snaprow{display:flex;gap:18px;overflow-x:auto;padding:10px 6px 22px;scroll-snap-type:x mandatory;scrollbar-width:thin}",
    ".bzp-snap{flex:none;scroll-snap-align:start;width:180px;background:#fff;border:0;padding:9px 9px 12px;border-radius:14px;box-shadow:0 8px 22px rgba(36,47,63,.12);transition:transform .2s;text-align:left}",
    ".bzp-snap:nth-child(3n+1){transform:rotate(-2deg)}.bzp-snap:nth-child(3n+2){transform:rotate(1.5deg)}.bzp-snap:nth-child(3n){transform:rotate(-.5deg)}",
    ".bzp-snap:hover{transform:rotate(0) translateY(-4px)}",
    ".bzp-snap img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px;background:var(--bzp-cream)}",
    ".bzp-snap span{display:block;font-size:12.5px;margin-top:8px;color:var(--bzp-mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".bzp-snap span b{color:var(--bzp-ink)}",
    /* what parents say */
    ".bzp-say{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:22px;margin:0 0 44px;align-items:stretch}",
    ".bzp-bubble{position:relative;background:#eef7fc;border-radius:26px;padding:24px 26px}",
    ".bzp-bubble:after{content:'';position:absolute;left:38px;bottom:-14px;border:14px solid transparent;border-top-color:#eef7fc;border-bottom:0}",
    ".bzp-bubble p{margin:6px 0 0;font-size:16px}",
    ".bzp-bubble .bzp-ai{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4a7c99}",
    ".bzp-hist{background:#fff;border:1.5px solid var(--bzp-line);border-radius:26px;padding:20px 24px}",
    ".bzp-hr{display:flex;align-items:center;gap:10px;width:100%;background:none;border:0;padding:5px 0;color:inherit;font-size:14px}",
    ".bzp-hr .bar{flex:1;height:10px;border-radius:99px;background:#f0ede4;overflow:hidden}.bzp-hr .bar i{display:block;height:100%;border-radius:99px;background:var(--bzp-ink)}",
    ".bzp-hr .num{min-width:46px;text-align:right;color:var(--bzp-mute);font-size:13px}",
    ".bzp-hr.on .bar i{background:var(--bzp-peach)}.bzp-hr:hover .bar i{background:var(--bzp-peach)}",
    ".bzp-topics{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}",
    /* filters */
    ".bzp-bar{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.96);backdrop-filter:blur(6px);padding:12px 0 14px;margin:0 0 18px;border-bottom:1.5px solid var(--bzp-line)}",
    ".bzp-chips{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:none}.bzp-chips::-webkit-scrollbar{display:none}",
    ".bzp-chip{flex:none;border:1.5px solid var(--bzp-line);background:#fff;color:var(--bzp-ink);border-radius:999px;padding:8px 15px;font-size:14px;font-weight:600;white-space:nowrap;transition:all .15s}",
    ".bzp-chip small{font-weight:500;color:var(--bzp-mute);margin-left:4px}",
    ".bzp-chip:hover{border-color:var(--bzp-ink)}.bzp-chip.on{background:var(--bzp-ink);border-color:var(--bzp-ink);color:#fff}.bzp-chip.on small{color:#cfd5dd}",
    ".bzp-tools{display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap}",
    ".bzp-search{flex:1;min-width:200px;display:flex;align-items:center;gap:8px;border:1.5px solid var(--bzp-line);border-radius:999px;padding:0 14px;background:#fff;color:var(--bzp-mute)}",
    ".bzp-search input{border:0;outline:0;flex:1;min-width:0;padding:10px 0;font:inherit;font-size:15px;color:var(--bzp-ink);background:none}",
    ".bzp-sel{border:1.5px solid var(--bzp-line);border-radius:999px;padding:9px 34px 9px 14px;font:inherit;font-size:14px;color:var(--bzp-ink);background:#fff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%23242f3f' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E\") no-repeat right 12px center;-webkit-appearance:none;appearance:none}",
    ".bzp-count{font-size:14px;color:var(--bzp-mute);margin:0 0 14px}.bzp-count button{background:none;border:0;color:var(--bzp-ink);text-decoration:underline;font-size:14px;padding:0 0 0 6px}",
    /* review cards */
    ".bzp-grid{display:flex;gap:18px;align-items:flex-start}.bzp-col{flex:1;min-width:0}",
    ".bzp-card{display:block;width:100%;background:#fff;border:1.5px solid var(--bzp-line);border-radius:24px;padding:20px 20px 16px;margin:0 0 18px;transition:box-shadow .2s,transform .2s}",
    ".bzp-card:hover{box-shadow:0 12px 30px rgba(36,47,63,.08);transform:translateY(-2px)}",
    ".bzp-card .top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px}",
    ".bzp-card .date{font-size:12.5px;color:var(--bzp-mute)}",
    ".bzp-card h3{font-size:17px;margin:0 0 6px;line-height:1.3;font-weight:700}",
    ".bzp-card .body{font-size:15px;color:#374151;white-space:pre-line;overflow-wrap:anywhere}",
    ".bzp-card .body.clip{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}",
    ".bzp-more{background:none;border:0;padding:4px 0 0;color:var(--bzp-ink);font-weight:700;font-size:14px;text-decoration:underline}",
    ".bzp-media{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.bzp-media button{border:0;padding:0;background:none}",
    ".bzp-media img{width:84px;height:84px;object-fit:cover;border-radius:14px;display:block}",
    ".bzp-who{display:flex;align-items:center;gap:10px;margin-top:14px;padding-top:14px;border-top:1.5px dashed var(--bzp-line)}",
    ".bzp-av{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;font-weight:700;font-size:14px;flex:none}",
    ".bzp-who b{display:block;font-size:14.5px;line-height:1.2}",
    ".bzp-ver{display:inline-flex;align-items:center;gap:3px;font-size:12px;color:#1d7a46;font-weight:600}",
    ".bzp-prod{display:flex;align-items:center;gap:10px;margin-top:12px;padding:8px 10px;background:var(--bzp-cream);border-radius:14px;text-decoration:none!important;color:var(--bzp-ink)!important;font-size:13px;font-weight:600;line-height:1.3}",
    ".bzp-prod img{width:40px;height:40px;border-radius:10px;object-fit:cover;flex:none;background:#fff}",
    ".bzp-prod:hover{background:#efe9d6}",
    ".bzp-reply{margin-top:12px;background:#fdf3e8;border-radius:14px;padding:10px 12px;font-size:14px}.bzp-reply b{display:block;font-size:12.5px;margin-bottom:2px}",
    ".bzp-loadwrap{text-align:center;margin-top:10px}",
    ".bzp-load{border:0;background:var(--bzp-ink);color:#fff;border-radius:999px;padding:14px 34px;font-size:15px;font-weight:700;transition:transform .15s}.bzp-load:hover{transform:translateY(-2px)}.bzp-load[disabled]{opacity:.6}",
    ".bzp-empty{text-align:center;padding:50px 20px;color:var(--bzp-mute)}",
    ".bzp-skel{height:180px;border-radius:24px;background:linear-gradient(90deg,#f4f1e8 0,#faf8f2 50%,#f4f1e8 100%);background-size:200% 100%;animation:bzpSk 1.2s infinite;margin-bottom:18px}@keyframes bzpSk{to{background-position:-200% 0}}",
    /* photo view */
    ".bzp-lb{position:fixed;inset:0;z-index:2147483000;background:rgba(24,28,36,.82);display:flex;align-items:center;justify-content:center;padding:20px}",
    ".bzp-lbx{background:#fff;border-radius:24px;max-width:min(92vw,560px);width:100%;overflow:hidden;position:relative}",
    ".bzp-lbx img{display:block;width:100%;max-height:70vh;object-fit:contain;background:var(--bzp-cream)}",
    ".bzp-lbx .cap{padding:12px 16px 16px;font-size:14px}.bzp-lbx .cap a{color:var(--bzp-ink);font-weight:700}",
    ".bzp-lbx .x{position:absolute;top:10px;right:10px;width:38px;height:38px;border-radius:50%;border:0;background:#fff;font-size:22px;line-height:1;box-shadow:0 2px 10px rgba(0,0,0,.15)}",
    ".bzp-write{background:#fff;border:2px solid var(--bzp-ink);border-radius:28px;padding:18px 18px 6px;margin:10px 0 30px;box-shadow:0 12px 30px rgba(36,47,63,.08);scroll-margin-top:90px}",
    ".bzp-wh{font-weight:700;font-size:15px;color:var(--bzp-ink);margin:0 0 4px 4px}",
    /* phones */
    "@media(max-width:760px){.bzp{padding:0 14px}.bzp-hero{border-radius:24px;padding:40px 18px 60px;margin-top:4px}.bzp-badge{padding:10px 18px 10px 10px}.bzp-badge b{width:50px;height:50px;font-size:19px}",
    ".bzp-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.bzp-stat{flex-direction:column;text-align:center;gap:6px;padding:12px 6px;font-size:12px;line-height:1.3}.bzp-stat i{width:34px;height:34px}.bzp-stat b{font-size:17px;margin-bottom:2px}",
    ".bzp-search{flex-basis:100%}.bzp-hero p.bzp-sub{font-size:15.5px}",
    ".bzp-say{grid-template-columns:1fr}.bzp-snap{width:150px}.bzp-card{border-radius:20px}.bzp-deco{display:none}.bzp-sel{flex:1}}"
  ].join("");

  var S = { kind: "", rating: "", media: "", q: "", sort: "newest", page: 1, list: [], total: 0, more: false, loading: false };
  var META = null, AI = null, root;

  function hero(m) {
    var a = m.summary || {}, h = a.histogram || {};
    var deco = '<div class="bzp-deco" style="left:6%;top:28px;width:34px;height:34px;color:#f7a152">' + ICON.moon + '</div>' +
      '<div class="bzp-deco" style="right:8%;top:40px;width:22px;height:22px;color:#afdaf2;animation-delay:1s"><svg viewBox="0 0 24 24"><path fill="currentColor" d="' + STAR + '"/></svg></div>' +
      '<div class="bzp-deco" style="left:14%;bottom:70px;width:16px;height:16px;color:#f6c7c1;animation-delay:2s"><svg viewBox="0 0 24 24"><path fill="currentColor" d="' + STAR + '"/></svg></div>' +
      '<div class="bzp-deco" style="right:15%;bottom:80px;width:26px;height:26px;color:#f6d6d3;animation-delay:.5s">' + ICON.heart.replace('width="22" height="22"', 'width="26" height="26"') + "</div>";
    var stats = "";
    if (a.recommend_pct != null) stats += '<div class="bzp-stat"><i style="background:#f6d6d3;color:#c2554a">' + ICON.heart + "</i><div><b>" + a.recommend_pct + "%</b>would recommend us</div></div>";
    stats += '<div class="bzp-stat"><i style="background:#fbe3c9;color:#d9822b">' + ICON.star + "</i><div><b>" + n(h[5]) + "</b>five-star reviews</div></div>";
    if (a.with_media) stats += '<div class="bzp-stat"><i style="background:#d9ecf7;color:#3f7fa6">' + ICON.camera + "</i><div><b>" + n(a.with_media) + "</b>photos from families</div></div>";
    return '<section class="bzp-hero">' + deco +
      "<h1>Loved by little ones <em>&amp;</em> their grown-ups</h1>" +
      '<p class="bzp-sub">Real words from real families, from midnight zipper changes to cozy morning snuggles.</p>' +
      '<div class="bzp-badge"><b>' + (a.average || 0).toFixed(1) + "</b><div>" + stars(a.average || 0, 22) + "<small>from " + n(a.count) + " reviews</small></div></div>" +
      '<div class="bzp-stats">' + stats + "</div></section>";
  }
  function snaps(m) {
    if (!m.photos || !m.photos.length) return "";
    return '<section class="bzp-snaps"><h2 class="bzp-h2">Snuggle snapshots <span aria-hidden="true">📸</span></h2><p class="bzp-lead">Shared by the families who wear Larkspur every day.</p><div class="bzp-snaprow">' +
      m.photos.map(function (p, i) { return '<button type="button" class="bzp-snap" data-snap="' + i + '"><img loading="lazy" src="' + esc(p.thumb) + '" alt="Photo from ' + esc(p.name) + '"><span><b>' + esc(p.name) + "</b>" + (p.product ? " · " + esc(p.product) : "") + "</span></button>"; }).join("") + "</div></section>";
  }
  function say(m) {
    var a = m.summary || {}, h = a.histogram || {}, max = Math.max(1, h[5] || 0, h[4] || 0, h[3] || 0, h[2] || 0, h[1] || 0), rows = "";
    for (var i = 5; i >= 1; i--) rows += '<button type="button" class="bzp-hr' + (S.rating === String(i) ? " on" : "") + '" data-r="' + i + '" aria-label="Show ' + i + '-star reviews">' + stars(i, 13) + '<span class="bar"><i style="width:' + Math.max(1.5, ((h[i] || 0) / max) * 100) + '%"></i></span><span class="num">' + n(h[i]) + "</span></button>";
    // Fixed, friendly words here (not the AI summary): this page is for shoppers, and the AI summary also lists complaints.
    AI = { summary: "Parents keep coming back for how buttery soft our bamboo feels, prints they can’t resist, and zippers that make 3 AM changes a breeze. Tap a topic to see what families say about it.", topics: ["Soft", "Zipper", "Fit", "Print", "Wash", "Sleep"] };
    var bubble = AI && AI.summary ? '<div class="bzp-bubble"><div class="bzp-ai">✧ What parents are saying</div><p>' + esc(AI.summary) + "</p>" +
      (AI.topics && AI.topics.length ? '<div class="bzp-topics">' + AI.topics.slice(0, 8).map(function (t) { return '<button type="button" class="bzp-chip' + (S.q.toLowerCase() === String(t).toLowerCase() ? " on" : "") + '" data-topic="' + esc(t) + '">' + esc(t) + "</button>"; }).join("") + "</div>" : "") + "</div>"
      : '<div class="bzp-bubble"><div class="bzp-ai">✧ What parents are saying</div><p>Soft, cozy and made to last wash after wash. Read what families love most below.</p></div>';
    return '<section class="bzp-say">' + bubble + '<div class="bzp-hist"><div style="font-weight:700;margin-bottom:6px">Ratings</div>' + rows + "</div></section>";
  }
  function bar(m) {
    var kinds = (m.kinds || []);
    return '<div class="bzp-bar"><div class="bzp-chips" role="group" aria-label="Filter by item"><button type="button" class="bzp-chip' + (!S.kind ? " on" : "") + '" data-kind="">All reviews<small>' + n((m.summary || {}).count) + "</small></button>" +
      kinds.map(function (k) { return '<button type="button" class="bzp-chip' + (S.kind === k.name ? " on" : "") + '" data-kind="' + esc(k.name) + '">' + esc(k.name) + "<small>" + n(k.count) + "</small></button>"; }).join("") + "</div>" +
      '<div class="bzp-tools"><label class="bzp-search">' + ICON.search + '<input type="search" id="bzp-q" placeholder="Search reviews: soft, zipper, size…" value="' + esc(S.q) + '" aria-label="Search reviews"></label>' +
      '<select class="bzp-sel" id="bzp-r" aria-label="Rating"><option value="">All ratings</option>' + [5, 4, 3, 2, 1].map(function (r) { return '<option value="' + r + '"' + (S.rating === String(r) ? " selected" : "") + ">" + r + " stars</option>"; }).join("") + "</select>" +
      '<select class="bzp-sel" id="bzp-m" aria-label="Photos"><option value="">With or without photos</option><option value="1"' + (S.media ? " selected" : "") + ">With photos</option></select>" +
      '<select class="bzp-sel" id="bzp-s" aria-label="Sort"><option value="newest">Newest</option><option value="media">Photos first</option><option value="highest">Highest rated</option><option value="lowest">Lowest rated</option></select></div></div>';
  }
  function card(r) {
    var long = (r.body || "").length > 420;
    var media = (r.media || []).filter(function (x) { return x.type !== "video"; });
    var prod = r.product ? '<a class="bzp-prod" href="' + (r.product_handle ? "/products/" + esc(r.product_handle) : "#") + '">' + (r.product_image ? '<img loading="lazy" src="' + esc(r.product_image) + '" alt="">' : "") + "<span>" + esc(r.product) + "</span></a>" : "";
    return '<article class="bzp-card"><div class="top">' + stars(r.rating, 16) + '<span class="date">' + esc(fmtDate(r.date)) + "</span></div>" +
      (r.title ? "<h3>" + esc(r.title) + "</h3>" : "") + '<div class="body' + (long ? " clip" : "") + '">' + esc(r.body) + "</div>" + (long ? '<button type="button" class="bzp-more">Read more</button>' : "") +
      (media.length ? '<div class="bzp-media">' + media.slice(0, 4).map(function (x) { return '<button type="button" data-img="' + esc(x.url) + '" data-cap="' + esc(r.name) + '"><img loading="lazy" src="' + esc(x.thumb) + '" alt="Photo from ' + esc(r.name) + '"></button>'; }).join("") + "</div>" : "") +
      (r.reply ? '<div class="bzp-reply"><b>Reply from ' + esc(C.brand || "us") + "</b>" + esc(r.reply) + "</div>" : "") +
      prod +
      '<div class="bzp-who"><span class="bzp-av" style="background:' + pastel(r.name) + '">' + esc(initials(r.name)) + "</span><div><b>" + esc(r.name) + "</b>" + (r.verified ? '<span class="bzp-ver">' + ICON.check + " Verified buyer</span>" : "") + "</div></div></article>";
  }
  function listHtml() {
    var filtered = S.kind || S.rating || S.media || S.q;
    var h = '<p class="bzp-count">' + n(S.total) + " review" + (S.total === 1 ? "" : "s") + (filtered ? ' <button type="button" data-clear="1">Clear filters</button>' : "") + "</p>";
    if (!S.list.length) return h + '<div class="bzp-empty">No reviews match that yet. Try another filter.</div>';
    // Cards go left to right across the columns, so "newest" reads in order and "show more" never reshuffles.
    var cols = cols_(), buckets = []; for (var c = 0; c < cols; c++) buckets.push("");
    S.list.forEach(function (r, i) { buckets[i % cols] += card(r); });
    h += '<div class="bzp-grid">' + buckets.map(function (b) { return '<div class="bzp-col">' + b + "</div>"; }).join("") + "</div>";
    if (S.more) h += '<div class="bzp-loadwrap"><button type="button" class="bzp-load" data-more="1">Show more reviews</button></div>';
    return h;
  }
  function cols_() { var w = (root && root.clientWidth) || window.innerWidth; return w < 640 ? 1 : w < 960 ? 2 : 3; }
  var lastCols = 0; window.addEventListener("resize", function () { var c = cols_(); if (c !== lastCols && S.list.length) { lastCols = c; paintList(); } });
  function paintList() { lastCols = cols_(); var el = root.querySelector(".bzp-list"); if (el) el.innerHTML = listHtml(); }
  function paintAll() {
    var m = META || { summary: {} };
    root.innerHTML = hero(m) + snaps(m) + say(m) + '<section id="bzp-reviews"><h2 class="bzp-h2">Every review <span aria-hidden="true">💛</span></h2><p class="bzp-lead">Filter by the piece you’re eyeing, or search for what matters to you.</p>' + bar(m) + '<div class="bzp-list">' + listHtml() + "</div></section>";
    var s = root.querySelector("#bzp-s"); if (s) s.value = S.sort;
  }
  function load(reset) {
    if (reset) { S.page = 1; S.list = []; }
    S.loading = true;
    return get("/product/0?scope=all&sort=" + S.sort + "&rating=" + S.rating + "&media=" + S.media + "&q=" + encodeURIComponent(S.q) + "&kind=" + encodeURIComponent(S.kind) + "&page=" + S.page + "&per=18").then(function (j) {
      S.loading = false; S.total = j.total; S.more = j.more; S.list = S.list.concat(j.reviews || []); paintList();
    }).catch(function () { S.loading = false; });
  }
  function refilter() { paintAll(); var el = root.querySelector(".bzp-list"); if (el) el.innerHTML = '<div class="bzp-grid">' + '<div class="bzp-skel"></div><div class="bzp-skel"></div><div class="bzp-skel"></div>' + "</div>"; load(true).then(function () { var b = root.querySelector(".bzp-bar"); if (b && b.getBoundingClientRect().top < 0) root.querySelector("#bzp-reviews").scrollIntoView({ behavior: "smooth" }); }); }
  function lightbox(src, cap, href) {
    var o = document.createElement("div"); o.className = "bzp-lb";
    o.innerHTML = '<div class="bzp-lbx" role="dialog" aria-modal="true"><button type="button" class="x" aria-label="Close">×</button><img src="' + esc(src) + '" alt="">' + (cap ? '<div class="cap">' + cap + "</div>" : "") + "</div>";
    o.onclick = function (e) { if (e.target === o || e.target.classList.contains("x")) o.remove(); };
    document.addEventListener("keydown", function k(e) { if (e.key === "Escape") { o.remove(); document.removeEventListener("keydown", k); } });
    document.body.appendChild(o);
  }
  function wire() {
    root.addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t || !root.contains(t)) return;
      if (t.hasAttribute("data-kind")) { S.kind = t.dataset.kind; refilter(); }
      else if (t.dataset.r) { S.rating = S.rating === t.dataset.r ? "" : t.dataset.r; refilter(); }
      else if (t.dataset.topic) { S.q = S.q.toLowerCase() === t.dataset.topic.toLowerCase() ? "" : t.dataset.topic; refilter(); }
      else if (t.dataset.clear) { S.kind = ""; S.rating = ""; S.media = ""; S.q = ""; refilter(); }
      else if (t.dataset.more) { t.disabled = true; t.textContent = "Loading…"; S.page++; load(false); }
      else if (t.dataset.snap != null) { var p = META.photos[Number(t.dataset.snap)]; lightbox(p.url, "<b>" + esc(p.name) + "</b>" + (p.product ? ' · <a href="' + (p.handle ? "/products/" + esc(p.handle) : "#") + '">' + esc(p.product) + "</a>" : "")); }
      else if (t.dataset.img) lightbox(t.dataset.img, t.dataset.cap ? "Photo from <b>" + esc(t.dataset.cap) + "</b>" : "");
      else if (t.classList.contains("bzp-more")) { var b = t.previousElementSibling; b.classList.remove("clip"); t.remove(); }
    });
    root.addEventListener("change", function (e) {
      var id = e.target.id;
      if (id === "bzp-r") { S.rating = e.target.value; refilter(); } else if (id === "bzp-m") { S.media = e.target.value; refilter(); } else if (id === "bzp-s") { S.sort = e.target.value; refilter(); }
    });
    root.addEventListener("keydown", function (e) { if (e.target.id === "bzp-q" && e.key === "Enter") { e.preventDefault(); S.q = e.target.value.trim(); refilter(); } });
    root.addEventListener("search", function (e) { if (e.target.id === "bzp-q" && !e.target.value && S.q) { S.q = ""; refilter(); } }, true);
  }
  // The review form from the email, right here on the store's own site (Buzzin's form in a frame that grows to fit).
  var WB = null;
  function writeBox() {
    if (!WRITE) return;
    if (!WB) {
      WB = document.createElement("section"); WB.className = "bzp-write"; WB.id = "bzp-write";
      var src = (C.origin || "") + "/rv/" + C.store + "/write?embed=1&t=" + encodeURIComponent(WRITE) + (WQ.get("p") ? "&p=" + encodeURIComponent(WQ.get("p")) : "") + (WQ.get("r") ? "&r=" + encodeURIComponent(WQ.get("r")) : "");
      WB.innerHTML = '<div class="bzp-wh"><span aria-hidden="true">💛</span> Thanks for taking a minute!</div><iframe title="Write your review" src="' + esc(src) + '" style="width:100%;border:0;height:620px;display:block;background:transparent" loading="eager"></iframe>';
      var fr = WB.querySelector("iframe");
      window.addEventListener("message", function (e) { var d = e.data || {}; if (d && d.bzWriteH && e.source === fr.contentWindow) fr.style.height = Math.max(300, Number(d.bzWriteH) + 8) + "px"; });
      setTimeout(function () { try { WB.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} }, 300);
    }
    // A wrapper with the page's width, placed just above the reviews (outside them, so redraws never reload the form).
    if (!WB.parentNode) { var wrap = document.createElement("div"); wrap.className = "bzp"; wrap.style.marginBottom = "0"; wrap.appendChild(WB); root.parentNode.insertBefore(wrap, root); }
  }
  function mount() {
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement("div"); root.className = "bzp"; root.id = "bz-reviews-page";
    if (host0) host0.appendChild(root);
    else {
      // Under the theme's page title: hide that plain title (the page has its own heading) and the old review app's area.
      var main = document.querySelector("main") || document.body;
      var title = main.querySelector(".page-title-description") || main.querySelector(".shopify-section");
      if (title && /reviews/i.test(title.textContent || "")) { title.style.display = "none"; }
      var sec = title && title.closest(".shopify-section") || title;
      if (sec && sec.parentNode) sec.parentNode.insertBefore(root, sec.nextSibling); else main.insertBefore(root, main.firstChild);
    }
    paintAll(); writeBox(); root.querySelector(".bzp-list").innerHTML = '<div class="bzp-grid"><div class="bzp-skel"></div><div class="bzp-skel"></div><div class="bzp-skel"></div></div>';
    wire();
    get("/page").then(function (m) { META = m; var keep = S.list.length; paintAll(); if (keep) paintList(); }).catch(function () {});
    load(true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
