/* Buzzin · Rewards on the store: the floating launcher + panel, and the full rewards page ([data-bz-rewards-page]).
   Loaded by the Buzzin store script on every page once the program is live, or in preview (?bz_rewards=1).
   Who's logged in comes from window.BZL_CUSTOMER, printed by the theme snippet and signed with the store's secret.
   Every color, word and section comes from the design saved in Buzzin → Rewards → Widget & page. */
(function () {
  if (window.__bzLoyalty) return; window.__bzLoyalty = 1;
  var C = window.BZL || {}; var API = (C.origin || "") + "/ly/" + C.store; var studio = !!C.studio;
  var CUST = window.BZL_CUSTOMER || null;
  var DEF = {
    colors: { primary: "#242F3F", header_bg: "#242F3F", header_bg2: "#46597A", header_text: "#FFFFFF", text: "#242F3F", muted: "#6B7280", bg: "#F6F4F1", card: "#FFFFFF", border: "#ECEAE5",
      button_bg: "#242F3F", button_text: "#FFFFFF", icon_bg: "#F3E4E8", icon: "#242F3F", accent: "#E3A6B4", success: "#1D7A46" },
    font: "inherit", radius: 16, button_radius: 10,
    launcher: { position: "left", text: "Rewards", icon: "gift", show_text: true, bg: "", color: "", offset_x: 20, offset_y: 20, mobile_text: false, hide_mobile: false, pages: "all" },
    text: { welcome: "Welcome to", guest_title: "Become a member", guest_body: "Join to earn points every time you shop and turn them into rewards.", join: "Join now", signin: "Already a member? Sign in",
      pending: "You have {points} {currency} waiting for you. Join to claim them.", hi: "Hi {name}", balance: "Your balance", earn: "Ways to earn", redeem: "Ways to redeem", tiers: "VIP tiers", refer: "Refer friends",
      rewards: "Your rewards", activity: "Points history", next_tier: "Spend {amount} more to reach {tier}", top_tier: "You've reached our top tier", refer_body: "Give your friends {friend} their first order, and get {advocate} when they buy.",
      copy: "Copy link", copied: "Copied!", redeem_btn: "Redeem", need_more: "Need {n} more", done: "Done", go: "Go", birthday: "Add your birthday", apply: "Apply to cart", empty_rewards: "Rewards you redeem show up here." },
    page: { hero_title: "Rewards for every little moment", hero_sub: "Earn points on every order, review and birthday. Spend them on savings for your next favorite pajamas.", hero_image: "", hero_bg: "", hero_text: "",
      show_how: true, show_earn: true, show_redeem: true, show_tiers: true, show_refer: true, show_faq: true,
      faq: [{ q: "How do I join?", a: "Create an account or sign in, then click Join now. It's free." }, { q: "How do I use my points?", a: "Open Rewards, pick a reward and click Redeem. You'll get a code to use at checkout." }, { q: "Do points expire?", a: "Points expire after 12 months without any activity on your account." }] },
    custom_css: "",
  };
  function merge(a, b) { var o = {}; for (var k in a) o[k] = a[k]; if (b) for (var j in b) { var v = b[j]; o[j] = v && typeof v === "object" && !Array.isArray(v) && a[j] && typeof a[j] === "object" ? merge(a[j], v) : v; } return o; }
  var D = merge(DEF, null), PROG = null, ME = null, VIEW = "home", PAGE_EL = null, OPEN = false, BUSY = false, MSG = null, LAST_CODE = null;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function T(k, v) { var s = (D.text[k] != null ? D.text[k] : DEF.text[k]) || ""; if (v) for (var x in v) s = s.split("{" + x + "}").join(v[x]); return s; }
  function cur(n) { return PROG ? (Math.abs(n) === 1 ? PROG.currency : PROG.currency_plural) : "points"; }
  function fmt(n) { return Number(n || 0).toLocaleString(); }
  function usd(n) { n = Number(n || 0); return "$" + (n % 1 ? n.toFixed(2) : n); }
  var ICONS = {
    gift: '<path d="M3 8h18v4H3zM12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    star: '<path d="M12 17.75l-6.17 3.24 1.18-6.87-5-4.86 6.9-1L12 2l3.09 6.26 6.9 1-5 4.86 1.18 6.87z"/>', crown: '<path d="M12 6l4 6 5-4-2 10H5L3 8l5 4z"/>',
    "shopping-bag": '<path d="M6.33 8h11.34a2 2 0 0 1 2 1.8l.8 8a2 2 0 0 1-2 2.2H5.53a2 2 0 0 1-2-2.2l.8-8a2 2 0 0 1 2-1.8zM9 11V6a3 3 0 0 1 6 0v5"/>',
    "user-plus": '<path d="M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M16 19h6M19 16v6M6 21v-2a4 4 0 0 1 4-4h4"/>', cake: '<path d="M3 20h18v-8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3zM3 14.8c1 .7 2.6.7 3.6 0s2.6-.7 3.6 0 2.6.7 3.6 0 2.6-.7 3.6 0 2.6.7 3.6 0M12 4l1.5 2a1.6 1.6 0 1 1-3 0z"/>',
    confetti: '<path d="M4 5h2M5 4v2M11.5 4L11 6M18 5h2M19 4v2M15 9l-1 1M18 13l2-.5M18 19h2M19 18v2M14 16.5l-6.5-6.5L3 21z"/>',
    "brand-instagram": '<path d="M4 8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0M16.5 7.5v.01"/>',
    "brand-facebook": '<path d="M7 10v4h3v7h4v-7h3l1-4h-4V8a1 1 0 0 1 1-1h3V3h-3a5 5 0 0 0-5 5v2H7"/>', "brand-tiktok": '<path d="M21 7.9v4a9.9 9.9 0 0 1-5-1.4V16a6 6 0 1 1-6-6v4a2 2 0 1 0 2 2V3h4a5 5 0 0 0 5 4.9"/>',
    "brand-x": '<path d="M4 4l11.7 16H20L8.3 4zM4 20l6.8-6.8M13.2 10.8L20 4"/>', "brand-pinterest": '<path d="M8 20l4-9M10.7 14c.4 1.3 1.5 2 2.8 2 3 0 5-3 5-6a6 6 0 1 0-11.5 2.4"/>',
    share: '<path d="M3 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0M15 6a3 3 0 1 0 6 0 3 3 0 1 0-6 0M15 18a3 3 0 1 0 6 0 3 3 0 1 0-6 0M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4"/>',
    sparkles: '<path d="M16 18a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2zm0-12a2 2 0 0 1 2 2 2 2 0 0 1 2-2 2 2 0 0 1-2-2 2 2 0 0 1-2 2zM9 18a6 6 0 0 1 6-6 6 6 0 0 1-6-6 6 6 0 0 1-6 6 6 6 0 0 1 6 6z"/>',
    cash: '<path d="M7 9h14v10H7zM14 14a2 2 0 1 0 0 .01M17 9V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>', discount: '<path d="M9 15l6-6M9.5 9.5v.01M14.5 14.5v.01M5 7.2A2.2 2.2 0 0 1 7.2 5h1a2.2 2.2 0 0 0 1.55-.64l.7-.7a2.2 2.2 0 0 1 3.12 0l.7.7c.42.41.98.64 1.55.64h1A2.2 2.2 0 0 1 19 7.2v1c0 .58.23 1.14.64 1.55l.7.7a2.2 2.2 0 0 1 0 3.12l-.7.7a2.2 2.2 0 0 0-.64 1.55v1a2.2 2.2 0 0 1-2.2 2.2h-1a2.2 2.2 0 0 0-1.55.64l-.7.7a2.2 2.2 0 0 1-3.12 0l-.7-.7a2.2 2.2 0 0 0-1.55-.64h-1A2.2 2.2 0 0 1 5 16.8v-1a2.2 2.2 0 0 0-.64-1.55l-.7-.7a2.2 2.2 0 0 1 0-3.12l.7-.7A2.2 2.2 0 0 0 5 8.2z"/>',
    "arrows-exchange": '<path d="M7 10h14l-4-4M17 14H3l4 4"/>', truck: '<path d="M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M15 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0M5 17H3V6a1 1 0 0 1 1-1h9v12m-4 0h6m4 0h2v-6h-8m0-5h5l3 5"/>',
    plant: '<path d="M7 15h10v4a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2zM12 9a6 6 0 0 0-6-6H3v2a6 6 0 0 0 6 6h3M12 11a6 6 0 0 1 6-6h3v1a6 6 0 0 1-6 6h-3M12 15V9"/>',
    flower: '<path d="M12 2a3 3 0 0 1 3 3c0 .562-.259 1.442-.776 2.64l-.724 1.36 1.76-1.893c.499-.6 1.157-.896 1.74-.896a3 3 0 0 1 0 6c-.37 0-1.07-.15-2-.5l-1.6-.6 1.43 1.06c1.04.95 1.17 1.94 1.17 2.44a3 3 0 0 1-6 0c0-.5.13-1.49 1.17-2.44L12.6 11l-1.6.6c-.93.35-1.63.5-2 .5a3 3 0 0 1 0-6c.58 0 1.24.3 1.74.9L12.5 9l-.72-1.36C11.26 6.44 11 5.56 11 5a3 3 0 0 1 1-3zM12 13v9"/>',
    check: '<path d="M5 12l5 5L20 7"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>', back: '<path d="M15 6l-6 6 6 6"/>', chev: '<path d="M9 6l6 6-6 6"/>', copy: '<path d="M8 8h12v12H8zM16 8V4H4v12h4"/>', clock: '<path d="M12 7v5l3 3M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/>', heart: '<path d="M19.5 12.572L12 20l-7.5-7.428A5 5 0 1 1 12 6.006a5 5 0 1 1 7.5 6.572"/>',
  };
  function ic(n, s) { return '<svg width="' + (s || 20) + '" height="' + (s || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[n] || ICONS.star) + "</svg>"; }

  function css() {
    var c = D.colors, L = D.launcher, side = L.position === "right" ? "right" : "left", f = D.font && D.font !== "inherit" ? D.font : "inherit";
    var lb = L.bg || c.primary, lc = L.color || c.button_text;
    return ".bzl,.bzl *{box-sizing:border-box}.bzl{font-family:" + f + ";color:" + c.text + ";line-height:1.4;-webkit-font-smoothing:antialiased}" +
      ".bzl-l{position:fixed;" + side + ":" + (Number(L.offset_x) || 20) + "px;bottom:" + (Number(L.offset_y) || 20) + "px;z-index:2147482990;display:flex;align-items:center;gap:8px;background:" + lb + ";color:" + lc + ";border:0;border-radius:999px;padding:" + (L.show_text ? "12px 18px 12px 14px" : "14px") + ";font:inherit;font-weight:700;font-size:15px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.18)}.bzl-l:hover{transform:translateY(-1px)}" +
      ".bzl-p{position:fixed;" + side + ":" + (Number(L.offset_x) || 20) + "px;bottom:" + ((Number(L.offset_y) || 20) + 64) + "px;z-index:2147482991;width:380px;max-width:calc(100vw - 24px);height:640px;max-height:calc(100vh - 110px);background:" + c.bg + ";border-radius:" + D.radius + "px;box-shadow:0 18px 50px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden;animation:bzlIn .18s ease-out}" +
      "@keyframes bzlIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}" +
      ".bzl-h{background:linear-gradient(135deg," + c.header_bg + "," + (c.header_bg2 || c.header_bg) + ");color:" + c.header_text + ";padding:22px 22px 54px;position:relative;flex:none}.bzl-h.sm{padding:16px 18px;display:flex;align-items:center;gap:10px}.bzl-h small{opacity:.85;font-size:13px}.bzl-h h2{margin:2px 0 0;font-size:24px;line-height:1.2;color:inherit}" +
      ".bzl-x{position:absolute;right:12px;top:12px;width:32px;height:32px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:inherit;display:flex;align-items:center;justify-content:center;cursor:pointer}.bzl-bk{width:32px;height:32px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:inherit;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none}.bzl-h.sm b{font-size:17px;flex:1}" +
      ".bzl-sc{flex:1;overflow-y:auto;overscroll-behavior:contain}.bzl-b{padding:0 16px 18px}.bzl-h.sm{position:sticky;top:0;z-index:2}.bzl-h+.bzl-b>.bzl-card:first-child{margin-top:-38px;position:relative}.bzl-h.sm+.bzl-b{padding-top:14px}" +
      ".bzl-card{background:" + c.card + ";border-radius:12px;padding:18px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}.bzl-card h3{margin:0 0 6px;font-size:17px;color:" + c.text + "}.bzl-card p{margin:0 0 14px;color:" + c.muted + ";font-size:14px}" +
      ".bzl-btn{display:block;width:100%;text-align:center;background:" + c.button_bg + ";color:" + c.button_text + ";border:0;border-radius:" + D.button_radius + "px;padding:12px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;text-decoration:none}.bzl-btn[disabled]{opacity:.45;cursor:default}.bzl-btn.sm{display:inline-block;width:auto;padding:7px 14px;font-size:13px}" +
      ".bzl-lnk{display:block;text-align:center;margin-top:10px;color:" + c.text + ";font-size:14px;text-decoration:underline;background:none;border:0;width:100%;cursor:pointer;font:inherit}" +
      ".bzl-pts{display:flex;align-items:baseline;gap:6px}.bzl-pts b{font-size:30px}.bzl-tier{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;color:#fff;margin-top:6px}" +
      ".bzl-bar{height:6px;border-radius:6px;background:" + c.border + ";overflow:hidden;margin:10px 0 6px}.bzl-bar i{display:block;height:100%;background:" + c.accent + "}.bzl-sm{font-size:12.5px;color:" + c.muted + "}" +
      ".bzl-list{background:" + c.card + ";border-radius:12px;overflow:hidden;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}.bzl-row{display:flex;align-items:center;gap:12px;padding:14px 16px;border-top:1px solid " + c.border + ";width:100%;background:none;border-left:0;border-right:0;border-bottom:0;font:inherit;color:inherit;text-align:left;cursor:pointer}.bzl-row:first-child{border-top:0}button.bzl-row:hover{background:" + c.bg + "}" +
      ".bzl-ic{width:38px;height:38px;border-radius:50%;background:" + c.icon_bg + ";color:" + c.icon + ";display:flex;align-items:center;justify-content:center;flex:none}.bzl-row .t{flex:1;min-width:0}.bzl-row .t b{display:block;font-size:14.5px}.bzl-row .t span{font-size:13px;color:" + c.muted + "}.bzl-row>svg{color:" + c.muted + ";flex:none}" +
      ".bzl-ok{color:" + c.success + ";display:flex;align-items:center;gap:4px;font-size:13px;font-weight:700}.bzl-sec{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:" + c.muted + ";margin:16px 4px 8px}" +
      ".bzl-code{display:flex;gap:8px;align-items:center;background:" + c.bg + ";border:1px dashed " + c.border + ";border-radius:10px;padding:10px 12px;margin-top:10px}.bzl-code b{flex:1;font:700 15px ui-monospace,Menlo,monospace;letter-spacing:.04em}.bzl-code button{border:0;background:none;cursor:pointer;color:" + c.text + "}" +
      ".bzl-msg{border-radius:10px;padding:10px 12px;font-size:13.5px;margin-bottom:12px}.bzl-msg.err{background:#FDECEA;color:#9F2A1B}.bzl-msg.ok{background:#E8F5EC;color:#1D5E36}" +
      ".bzl-in{width:100%;border:1px solid " + c.border + ";border-radius:10px;padding:10px 12px;font:inherit;font-size:14px;margin:8px 0;color:" + c.text + ";background:#fff}.bzl-rng{width:100%}" +
      ".bzl-perk{display:flex;gap:6px;font-size:13px;margin-top:4px}.bzl-perk svg{color:" + c.success + ";flex:none}" +
      "@media(max-width:600px){.bzl-p{left:8px!important;right:8px!important;width:auto;bottom:" + ((Number(L.offset_y) || 20) + 60) + "px;height:calc(100vh - 100px)}" + (L.mobile_text ? "" : ".bzl-l span{display:none}.bzl-l{padding:14px}") + (L.hide_mobile ? ".bzl-l{display:none}" : "") + "}" +
      // rewards page
      ".bzlp{max-width:1100px;margin:0 auto;padding:0 16px 50px}.bzlp-hero{border-radius:" + D.radius + "px;padding:56px 32px;text-align:center;background:" + (D.page.hero_image ? "linear-gradient(rgba(0,0,0,.25),rgba(0,0,0,.25)),url(" + JSON.stringify(D.page.hero_image) + ") center/cover" : "linear-gradient(135deg," + (D.page.hero_bg || c.header_bg) + "," + (c.header_bg2 || c.header_bg) + ")") + ";color:" + (D.page.hero_text || c.header_text) + ";margin:20px 0 34px}" +
      ".bzlp-hero h1{font-size:clamp(28px,4vw,44px);margin:0 0 12px;color:inherit;line-height:1.15}.bzlp-hero p{max-width:620px;margin:0 auto 22px;font-size:17px;opacity:.92}.bzlp-hero .bzl-btn{display:inline-block;width:auto;padding:13px 28px;background:#fff;color:" + c.text + "}.bzlp-hero .bzl-lnk{color:inherit}" +
      ".bzlp h2{text-align:center;font-size:clamp(22px,3vw,30px);margin:42px 0 20px;color:" + c.text + "}.bzlp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px}.bzlp-c{background:" + c.card + ";border:1px solid " + c.border + ";border-radius:14px;padding:22px 18px;text-align:center}.bzlp-c .bzl-ic{margin:0 auto 12px;width:48px;height:48px}.bzlp-c b{display:block;font-size:16px;margin-bottom:4px}.bzlp-c span{color:" + c.muted + ";font-size:14px}" +
      ".bzlp-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}@media(max-width:700px){.bzlp-steps{grid-template-columns:1fr}}.bzlp-n{width:34px;height:34px;border-radius:50%;background:" + c.primary + ";color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;margin-bottom:8px}" +
      ".bzlp-tbl{width:100%;border-collapse:collapse;background:" + c.card + ";border-radius:14px;overflow:hidden;border:1px solid " + c.border + "}.bzlp-tbl th,.bzlp-tbl td{padding:14px;border-bottom:1px solid " + c.border + ";text-align:center;font-size:14px}.bzlp-tbl th:first-child,.bzlp-tbl td:first-child{text-align:left;color:" + c.muted + "}.bzlp-wrap{overflow-x:auto}" +
      ".bzlp-faq details{background:" + c.card + ";border:1px solid " + c.border + ";border-radius:12px;padding:14px 18px;margin-bottom:8px}.bzlp-faq summary{font-weight:700;cursor:pointer}.bzlp-faq p{color:" + c.muted + ";margin:10px 0 0}" +
      "\n" + (D.custom_css || "");
  }
  var styleEl = document.createElement("style"); document.head.appendChild(styleEl);

  /* ---------- data ---------- */
  function post(u, b) { return fetch(API + u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ customer: CUST }, b || {})) }).then(function (r) { return r.json(); }); }
  function loadMe() {
    if (studio) return Promise.resolve();
    if (!CUST) { ME = null; return Promise.resolve(); }
    return post("/me").then(function (j) { ME = j.member || null; if (!ME && j.first_name) CUST.first_name = CUST.first_name || j.first_name; }).catch(function () {});
  }
  function act(u, b, then) {
    if (studio) { MSG = { ok: 1, t: "Preview only. Nothing is saved." }; draw(); return; }
    if (BUSY) return; BUSY = true; MSG = null; draw();
    post(u, b).then(function (j) { BUSY = false; if (j.error) { MSG = { t: j.error }; } else { if (j.member) ME = j.member; if (then) then(j); } draw(); }).catch(function () { BUSY = false; MSG = { t: "Something went wrong. Please try again." }; draw(); });
  }
  var loginUrl = function () { return (PROG && PROG.shop ? "" : "") + "/account/login?return_url=" + encodeURIComponent(location.pathname + location.search); };
  var registerUrl = function () { return "/account/register?return_url=" + encodeURIComponent(location.pathname + location.search); };

  /* ---------- pieces ---------- */
  function earnSub(r) {
    var c = r.config || {};
    if (r.type === "order") return fmt(c.per_dollar) + " " + cur(c.per_dollar) + " for every $1 spent";
    if (r.type === "review") return fmt(c.points) + " " + cur(c.points) + (c.photo_points ? " · +" + fmt(c.photo_points) + " with a photo" : "");
    return fmt(c.points) + " " + cur(c.points);
  }
  function redeemSub(r) {
    var c = r.config || {};
    if (r.type === "convert") return fmt(c.min_points) + "+ " + cur(2) + " · " + usd(1) + " off per " + fmt(c.per_dollar || 100) + " " + cur(2);
    return fmt(c.points) + " " + cur(c.points) + (c.min_purchase ? " · orders over " + usd(c.min_purchase) : "");
  }
  function tierOf(id) { return (PROG.tiers || []).filter(function (t) { return String(t.id) === String(id); })[0]; }
  function giftText(g) { return !g ? "" : g.type === "percent" ? g.value + "% off" : g.type === "shipping" ? "free shipping" : usd(g.value) + " off"; }
  function advText() { var a = PROG.referrals.advocate; return a.kind === "coupon" ? giftText(a.coupon) : fmt(a.points) + " " + cur(a.points); }

  function home() {
    var h = "", m = ME;
    if (!m || m.status !== "enrolled") {
      h += '<div class="bzl-h"><button class="bzl-x" data-close aria-label="Close">' + ic("x", 18) + "</button><small>" + esc(T("welcome")) + "</small><h2>" + esc(PROG.name) + "</h2></div><div class=\"bzl-b\">";
      h += '<div class="bzl-card"><h3>' + esc(T("guest_title")) + "</h3><p>" + esc(m && m.pending + m.points > 0 ? T("pending", { points: fmt(m.points + m.pending), currency: cur(2) }) : T("guest_body")) + "</p>";
      if (CUST || studio) h += '<button class="bzl-btn" data-join' + (BUSY ? " disabled" : "") + ">" + esc(T("join")) + "</button>";
      else h += '<a class="bzl-btn" href="' + esc(registerUrl()) + '">' + esc(T("join")) + '</a><a class="bzl-lnk" href="' + esc(loginUrl()) + '">' + esc(T("signin")) + "</a>";
      h += "</div>";
    } else {
      var t = m.tier && tierOf(m.tier.id), nx = m.next_tier;
      h += '<div class="bzl-h"><button class="bzl-x" data-close aria-label="Close">' + ic("x", 18) + "</button><small>" + esc(PROG.name) + "</small><h2>" + esc(T("hi", { name: m.first_name || (CUST && CUST.first_name) || "there" })) + "</h2></div><div class=\"bzl-b\">";
      h += '<div class="bzl-card"><div class="bzl-sm">' + esc(T("balance")) + '</div><div class="bzl-pts"><b>' + fmt(m.points) + "</b><span>" + esc(cur(m.points)) + "</span></div>";
      if (m.pending > 0) h += '<div class="bzl-sm">+' + fmt(m.pending) + " " + esc(cur(m.pending)) + " on the way</div>";
      if (t) h += '<span class="bzl-tier" style="background:' + esc(t.color || D.colors.primary) + '">' + ic(t.icon || "crown", 13) + " " + esc(t.name) + "</span>";
      if (PROG.tiers.length) {
        if (nx) { var pct = nx.threshold ? Math.min(100, Math.round(100 * (m.spend || 0) / nx.threshold)) : 0; h += '<div class="bzl-bar"><i style="width:' + pct + '%"></i></div><div class="bzl-sm">' + esc(T("next_tier", { amount: usd(nx.to_go), tier: nx.name })) + "</div>"; }
        else h += '<div class="bzl-sm" style="margin-top:8px">' + esc(T("top_tier")) + "</div>";
      }
      h += "</div>";
    }
    if (MSG) h += '<div class="bzl-msg ' + (MSG.ok ? "ok" : "err") + '">' + esc(MSG.t) + "</div>";
    h += '<div class="bzl-list">' + row("earn", "star", T("earn"), (PROG.earn || []).length + " ways") + row("redeem", "gift", T("redeem"), (PROG.redeem || []).length + " rewards") +
      (PROG.tiers.length ? row("tiers", "crown", T("tiers"), PROG.tiers.length + " tiers") : "") + (PROG.referrals ? row("refer", "heart", T("refer"), "Give " + giftText(PROG.referrals.friend) + ", get " + advText()) : "") + "</div>";
    if (m && m.status === "enrolled") h += '<div class="bzl-list">' + row("rewards", "discount", T("rewards"), (m.redemptions || []).filter(function (x) { return x.status === "issued"; }).length + " ready to use") + row("activity", "clock", T("activity"), "") + "</div>";
    return h + "</div>";
  }
  function row(v, icon, title, sub) { return '<button class="bzl-row" data-go="' + v + '"><span class="bzl-ic">' + ic(icon) + '</span><span class="t"><b>' + esc(title) + "</b>" + (sub ? "<span>" + esc(sub) + "</span>" : "") + "</span>" + ic("chev", 18) + "</button>"; }
  function sub(title, body) { return '<div class="bzl-h sm"><button class="bzl-bk" data-go="home" aria-label="Back">' + ic("back", 18) + "</button><b>" + esc(title) + '</b><button class="bzl-bk" data-close aria-label="Close">' + ic("x", 16) + "</button></div><div class=\"bzl-b\">" + (MSG ? '<div class="bzl-msg ' + (MSG.ok ? "ok" : "err") + '">' + esc(MSG.t) + "</div>" : "") + body + "</div>"; }
  var member = function () { return ME && ME.status === "enrolled"; };
  function earnView() {
    var h = '<div class="bzl-list">';
    (PROG.earn || []).forEach(function (r) {
      var done = member() && ME.done && ME.done[r.id] && (r.type === "join" || (r.social && !(r.config && r.config.period_days)));
      var right = done ? '<span class="bzl-ok">' + ic("check", 16) + esc(T("done")) + "</span>" : member() && r.social ? '<button class="bzl-btn sm" data-social="' + r.id + '">' + esc(T("go")) + "</button>" :
        member() && r.type === "birthday" && !ME.birthday ? '<button class="bzl-btn sm" data-go="birthday">Add</button>' : "";
      h += '<div class="bzl-row" style="cursor:default"><span class="bzl-ic">' + ic(r.icon) + '</span><span class="t"><b>' + esc(r.title) + "</b><span>" + esc(earnSub(r)) + "</span></span>" + right + "</div>";
    });
    h += "</div>";
    if (!member()) h += joinCta();
    return sub(T("earn"), h);
  }
  function joinCta() { return CUST || studio ? '<button class="bzl-btn" data-join>' + esc(T("join")) + "</button>" : '<a class="bzl-btn" href="' + esc(registerUrl()) + '">' + esc(T("join")) + '</a><a class="bzl-lnk" href="' + esc(loginUrl()) + '">' + esc(T("signin")) + "</a>"; }
  function redeemView() {
    var h = "";
    if (LAST_CODE) h += '<div class="bzl-card"><h3>' + esc(LAST_CODE.title) + "</h3><p>Use this code at checkout.</p>" + codeBox(LAST_CODE.code) + "</div>";
    h += '<div class="bzl-list">';
    (PROG.redeem || []).forEach(function (r) {
      var c = r.config || {}, cost = r.type === "convert" ? Number(c.min_points || 0) : Number(c.points || 0), right = "";
      if (member()) { var need = cost - (ME.points || 0); right = need > 0 ? '<span class="bzl-sm">' + esc(T("need_more", { n: fmt(need) })) + "</span>" : r.type === "convert" ? '<button class="bzl-btn sm" data-go="convert:' + r.id + '">' + esc(T("redeem_btn")) + "</button>" : '<button class="bzl-btn sm" data-redeem="' + r.id + '"' + (BUSY ? " disabled" : "") + ">" + esc(T("redeem_btn")) + "</button>"; }
      h += '<div class="bzl-row" style="cursor:default"><span class="bzl-ic">' + ic(r.icon) + '</span><span class="t"><b>' + esc(r.title) + "</b><span>" + esc(redeemSub(r)) + "</span></span>" + right + "</div>";
    });
    h += "</div>"; if (!member()) h += joinCta();
    return sub(T("redeem"), h);
  }
  function convertView(id) {
    var r = (PROG.redeem || []).filter(function (x) { return String(x.id) === String(id); })[0]; if (!r) return redeemView();
    var c = r.config, per = Number(c.per_dollar || 100), max = Math.min(Number(c.max_points || 1e9), ME ? ME.points - (ME.points % per) : 0), min = Number(c.min_points || per);
    var h = '<div class="bzl-card"><h3>' + esc(r.title) + "</h3><p>" + usd(1) + " off for every " + fmt(per) + " " + esc(cur(per)) + ".</p>";
    if (max < min) h += '<p class="bzl-sm">You need at least ' + fmt(min) + " " + esc(cur(min)) + ".</p>";
    else h += '<input class="bzl-rng" type="range" min="' + min + '" max="' + max + '" step="' + per + '" value="' + min + '" id="bzl-cv"><div class="bzl-pts" style="margin:8px 0 12px"><b id="bzl-cvv">' + usd(min / per) + '</b><span id="bzl-cvp">for ' + fmt(min) + " " + esc(cur(min)) + '</span></div><button class="bzl-btn" data-convert="' + r.id + '">' + esc(T("redeem_btn")) + "</button>";
    return sub(r.title, h + "</div>");
  }
  function codeBox(code) { return '<div class="bzl-code"><b>' + esc(code) + '</b><button data-copy="' + esc(code) + '" aria-label="Copy code">' + ic("copy", 18) + '</button></div><a class="bzl-lnk" href="/discount/' + encodeURIComponent(code) + '?redirect=/cart">' + esc(T("apply")) + "</a>"; }
  function tiersView() {
    var h = ""; (PROG.tiers || []).forEach(function (t) {
      var mine = member() && ME.tier && String(ME.tier.id) === String(t.id);
      h += '<div class="bzl-card" style="' + (mine ? "box-shadow:0 0 0 2px " + esc(t.color || D.colors.primary) : "") + '"><div style="display:flex;gap:12px;align-items:center"><span class="bzl-ic" style="background:' + esc(t.color || D.colors.primary) + ';color:#fff">' + ic(t.icon || "crown") + '</span><div style="flex:1"><b style="font-size:16px">' + esc(t.name) + '</b><div class="bzl-sm">' + (t.threshold > 0 ? "Spend " + usd(t.threshold) + (PROG.vip_period === "lifetime" ? "" : " in a year") : "Where everyone starts") + "</div></div>" + (mine ? '<span class="bzl-ok">' + ic("check", 16) + "You</span>" : "") + "</div>";
      var perks = (t.perks || []).slice(); if (t.earn_mult && t.earn_mult !== 1) perks.unshift(t.earn_mult + "× points on orders"); if (t.entry_points) perks.push(fmt(t.entry_points) + " bonus " + cur(t.entry_points) + " when you reach it");
      perks.forEach(function (p) { h += '<div class="bzl-perk">' + ic("check", 15) + "<span>" + esc(p) + "</span></div>"; });
      h += "</div>";
    });
    return sub(T("tiers"), h);
  }
  function referView() {
    var R = PROG.referrals, h = '<div class="bzl-card"><h3>' + esc(T("refer")) + "</h3><p>" + esc(T("refer_body", { friend: giftText(R.friend), advocate: advText() })) + "</p>";
    if (member()) h += '<div class="bzl-code"><b style="font-size:12.5px;letter-spacing:0;font-family:inherit;font-weight:600;word-break:break-all">' + esc(ME.referral_url) + '</b><button data-copy="' + esc(ME.referral_url) + '" aria-label="Copy link">' + ic("copy", 18) + "</button></div>";
    else h += joinCta();
    return sub(T("refer"), h + "</div>");
  }
  function rewardsView() {
    var list = (ME && ME.redemptions) || [], h = "";
    if (!list.length) h = '<div class="bzl-card"><p style="margin:0">' + esc(T("empty_rewards")) + "</p></div>";
    list.forEach(function (x) { h += '<div class="bzl-card"><b>' + esc(x.title) + '</b><div class="bzl-sm">' + (x.status === "issued" ? "Expires " + new Date(x.expires_at).toLocaleDateString() : x.status === "used" ? "Used" : "Expired") + "</div>" + (x.status === "issued" ? codeBox(x.code) : "") + "</div>"; });
    return sub(T("rewards"), h);
  }
  function activityView() {
    var h = '<div class="bzl-list">' + ((ME && ME.history) || []).map(function (x) { return '<div class="bzl-row" style="cursor:default"><span class="t"><b>' + esc(x.note || x.reason) + "</b><span>" + new Date(x.at).toLocaleDateString() + (new Date(x.available_at) > new Date() ? " · on the way" : "") + '</span></span><b style="color:' + (x.delta > 0 ? D.colors.success : D.colors.text) + '">' + (x.delta > 0 ? "+" : "") + fmt(x.delta) + "</b></div>"; }).join("") + "</div>";
    return sub(T("activity"), h);
  }
  function birthdayView() { return sub(T("birthday"), '<div class="bzl-card"><p>We\'ll add your birthday ' + esc(cur(2)) + ' the day before.</p><input class="bzl-in" id="bzl-bd" placeholder="MM/DD" inputmode="numeric" maxlength="5"><button class="bzl-btn" data-bday>Save</button></div>'); }

  /* ---------- launcher + panel ---------- */
  var root, panel, launcher;
  function draw() {
    styleEl.textContent = css();
    if (!PROG) return;
    if (PAGE_EL) drawPage();
    if (!launcher) {
      root = document.createElement("div"); root.className = "bzl"; document.body.appendChild(root);
      launcher = document.createElement("button"); launcher.className = "bzl-l"; launcher.type = "button"; launcher.setAttribute("aria-expanded", "false"); root.appendChild(launcher);
      launcher.onclick = function () { OPEN = !OPEN; VIEW = "home"; MSG = null; draw(); };
      panel = document.createElement("div"); panel.className = "bzl-p"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", PROG.name); root.appendChild(panel);
      panel.addEventListener("click", onClick); panel.addEventListener("input", onInput);
    }
    launcher.innerHTML = ic(D.launcher.icon || "gift", 22) + (D.launcher.show_text ? "<span>" + esc(D.launcher.text) + "</span>" : "");
    launcher.setAttribute("aria-expanded", OPEN ? "true" : "false");
    panel.style.display = OPEN ? "" : "none";
    if (!OPEN) return;
    var v = VIEW;
    panel.innerHTML = '<div class="bzl-sc">' + (v === "earn" ? earnView() : v === "redeem" ? redeemView() : v.indexOf("convert:") === 0 ? convertView(v.slice(8)) : v === "tiers" ? tiersView() : v === "refer" ? referView() : v === "rewards" ? rewardsView() : v === "activity" ? activityView() : v === "birthday" ? birthdayView() : home()) + "</div>";
  }
  function onInput(e) { if (e.target.id === "bzl-cv") { var r = (PROG.redeem || []).filter(function (x) { return x.type === "convert"; })[0], per = Number((r && r.config.per_dollar) || 100), v = Number(e.target.value); document.getElementById("bzl-cvv").textContent = usd(v / per); document.getElementById("bzl-cvp").textContent = "for " + fmt(v) + " " + cur(v); } }
  function onClick(e) {
    var t = e.target.closest("button,a"); if (!t) return;
    if (t.hasAttribute("data-close")) { OPEN = false; draw(); return; }
    if (t.dataset.go) { VIEW = t.dataset.go; MSG = null; if (VIEW !== "redeem") LAST_CODE = null; draw(); var b = panel.querySelector(".bzl-sc"); if (b) b.scrollTop = 0; return; }
    if (t.hasAttribute("data-join")) { act("/join", {}, function () { MSG = { ok: 1, t: "Welcome! You're in." }; }); return; }
    if (t.dataset.redeem) { act("/redeem", { rule_id: t.dataset.redeem }, function (j) { LAST_CODE = j.redemption; MSG = { ok: 1, t: "Done! Your code is ready." }; }); return; }
    if (t.dataset.convert) { var v = Number((document.getElementById("bzl-cv") || {}).value || 0); act("/redeem", { rule_id: t.dataset.convert, points: v }, function (j) { LAST_CODE = j.redemption; VIEW = "redeem"; MSG = { ok: 1, t: "Done! Your code is ready." }; }); return; }
    if (t.dataset.social) { var r = (PROG.earn || []).filter(function (x) { return String(x.id) === t.dataset.social; })[0]; if (r && r.config.url && !studio) window.open(r.config.url, "_blank", "noopener"); act("/action", { rule_id: t.dataset.social }, function (j) { MSG = { ok: 1, t: j.already ? "Thanks! You already got points for this." : "+" + fmt(j.points) + " " + cur(j.points) + " added." }; }); return; }
    if (t.hasAttribute("data-bday")) { act("/birthday", { birthday: (document.getElementById("bzl-bd") || {}).value }, function () { VIEW = "earn"; MSG = { ok: 1, t: "Birthday saved." }; }); return; }
    if (t.dataset.copy) { try { navigator.clipboard.writeText(t.dataset.copy); t.innerHTML = ic("check", 18); } catch (_) {} return; }
  }

  /* ---------- the rewards page ---------- */
  function drawPage() {
    var P = D.page, m = ME, h = '<div class="bzlp"><section class="bzlp-hero"><h1>' + esc(P.hero_title) + "</h1><p>" + esc(P.hero_sub) + "</p>";
    if (member()) h += '<p style="font-size:20px;margin-bottom:8px"><b>' + fmt(m.points) + "</b> " + esc(cur(m.points)) + (m.tier ? " · " + esc(m.tier.name) : "") + '</p><button class="bzl-btn" data-open>Open my rewards</button>';
    else if (CUST || studio) h += '<button class="bzl-btn" data-join>' + esc(T("join")) + "</button>";
    else h += '<a class="bzl-btn" href="' + esc(registerUrl()) + '">' + esc(T("join")) + '</a><a class="bzl-lnk" href="' + esc(loginUrl()) + '">' + esc(T("signin")) + "</a>";
    h += "</section>";
    if (P.show_how) h += '<h2>How it works</h2><div class="bzlp-steps">' + [["1", "Join", "Create a free account and join " + PROG.name + "."], ["2", "Earn", "Get " + cur(2) + " for orders, reviews, your birthday and more."], ["3", "Redeem", "Turn " + cur(2) + " into savings on your next order."]].map(function (s) { return '<div class="bzlp-c"><span class="bzlp-n">' + s[0] + "</span><b>" + esc(s[1]) + "</b><span>" + esc(s[2]) + "</span></div>"; }).join("") + "</div>";
    if (P.show_earn) h += "<h2>" + esc(T("earn")) + '</h2><div class="bzlp-grid">' + (PROG.earn || []).map(function (r) { return '<div class="bzlp-c"><span class="bzl-ic">' + ic(r.icon, 24) + "</span><b>" + esc(r.title) + "</b><span>" + esc(earnSub(r)) + "</span></div>"; }).join("") + "</div>";
    if (P.show_redeem) h += "<h2>" + esc(T("redeem")) + '</h2><div class="bzlp-grid">' + (PROG.redeem || []).map(function (r) { return '<div class="bzlp-c"><span class="bzl-ic">' + ic(r.icon, 24) + "</span><b>" + esc(r.title) + "</b><span>" + esc(redeemSub(r)) + "</span></div>"; }).join("") + "</div>";
    if (P.show_tiers && PROG.tiers.length) {
      var T2 = PROG.tiers, perks = []; T2.forEach(function (t) { (t.perks || []).forEach(function (p) { if (perks.indexOf(p) < 0) perks.push(p); }); });
      h += "<h2>" + esc(T("tiers")) + '</h2><div class="bzlp-wrap"><table class="bzlp-tbl"><thead><tr><th></th>' + T2.map(function (t) { return '<th><span class="bzl-ic" style="margin:0 auto 6px;background:' + esc(t.color) + ';color:#fff">' + ic(t.icon || "crown") + "</span>" + esc(t.name) + "</th>"; }).join("") + "</tr></thead><tbody>" +
        "<tr><td>To reach</td>" + T2.map(function (t) { return "<td>" + (t.threshold > 0 ? "Spend " + usd(t.threshold) + (PROG.vip_period === "lifetime" ? "" : "/year") : "Join") + "</td>"; }).join("") + "</tr>" +
        "<tr><td>Points on orders</td>" + T2.map(function (t) { return "<td>" + (t.earn_mult || 1) + "×</td>"; }).join("") + "</tr>" +
        "<tr><td>Bonus when you reach it</td>" + T2.map(function (t) { return "<td>" + (t.entry_points ? fmt(t.entry_points) + " " + esc(cur(t.entry_points)) : "—") + "</td>"; }).join("") + "</tr>" +
        perks.map(function (p) { return "<tr><td>" + esc(p) + "</td>" + T2.map(function (t) { return "<td>" + ((t.perks || []).indexOf(p) >= 0 ? '<span style="color:' + D.colors.success + '">' + ic("check", 18) + "</span>" : "—") + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
    }
    if (P.show_refer && PROG.referrals) h += "<h2>" + esc(T("refer")) + '</h2><div class="bzlp-c" style="max-width:560px;margin:0 auto"><span class="bzl-ic">' + ic("heart", 24) + "</span><span>" + esc(T("refer_body", { friend: giftText(PROG.referrals.friend), advocate: advText() })) + "</span>" + (member() ? '<div class="bzl-code" style="text-align:left"><b style="font-size:13px;font-family:inherit;letter-spacing:0;word-break:break-all">' + esc(ME.referral_url) + '</b><button data-copy="' + esc(ME.referral_url) + '">' + ic("copy", 18) + "</button></div>" : "") + "</div>";
    if (P.show_faq && (P.faq || []).length) h += '<h2>Questions</h2><div class="bzlp-faq" style="max-width:760px;margin:0 auto">' + P.faq.map(function (f) { return "<details><summary>" + esc(f.q) + "</summary><p>" + esc(f.a) + "</p></details>"; }).join("") + "</div>";
    PAGE_EL.innerHTML = h + "</div>";
  }

  /* ---------- start ---------- */
  function start() {
    PAGE_EL = document.querySelector("[data-bz-rewards-page]"); if (PAGE_EL) { PAGE_EL.classList.add("bzl"); PAGE_EL.addEventListener("click", function (e) { var t = e.target.closest("button"); if (!t) return; if (t.hasAttribute("data-open")) { OPEN = true; VIEW = "home"; draw(); } else onClick(e); }); }
    var draft = studio; try { var q = new URLSearchParams(location.search); if (q.get("bz_rewards_design") === "draft") sessionStorage.setItem("bz_rewards_design", "draft"); draft = draft || sessionStorage.getItem("bz_rewards_design") === "draft"; } catch (_) {}
    fetch(API + "/program" + (draft ? "?draft=1" : "")).then(function (r) { return r.json(); }).then(function (p) {
      PROG = p; D = merge(DEF, studio && C.design ? C.design : p.design || null);
      return loadMe();
    }).then(function () { if (studio && C.member) ME = C.member; if (studio && C.open) OPEN = true; draw(); }).catch(function () {});
  }
  if (studio) window.addEventListener("message", function (e) {
    var d = e.data || {}; if (d.bzlDesign) { D = merge(DEF, d.bzlDesign); }
    if (d.bzlView) { ME = d.bzlView === "member" ? C.member : d.bzlView === "pending" ? { status: "pending", points: 340, pending: 0 } : null; VIEW = "home"; }
    if (d.bzlScreen) { VIEW = d.bzlScreen; OPEN = true; }
    if (d.bzlDesign || d.bzlView || d.bzlScreen) draw();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
