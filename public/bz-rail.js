/* Buzzin · the dark app rail on the far left of every Buzzin page.
   One icon per part of Buzzin (Tickets, Shipments, Returns, Marketing…). On the help desk page the rail switches
   the panel next to it; on other pages it links back to the help desk with ?mod=… so the right part opens. */
(function () {
  if (window.bzRail) return;
  const MODS = [
    { m: "home", i: "home", l: "Home" },
    { m: "tickets", i: "inbox", l: "Tickets" },
    { m: "orders", i: "shopping-bag", l: "Orders" },
    { m: "reviews", i: "star", l: "Reviews" },
    { m: "rewards", i: "gift", l: "Rewards" },
    { m: "ship", i: "truck-delivery", l: "Shipping" },
    { m: "returns", i: "arrow-back-up", l: "Returns" },
    { m: "marketing", i: "speakerphone", l: "Marketing", href: "/marketing" },
    { m: "content", i: "layout-board", l: "Content" },
    { m: "analytics", i: "chart-pie", l: "Reports" },
  ];
  const onDesk = location.pathname === "/" || location.pathname === "/index.html";
  const here = onDesk ? null : location.pathname.startsWith("/marketing") ? "marketing" : /studio/.test(location.pathname) ? "content" : null;
  if (!document.querySelector('link[href*="tabler-icons"]')) { const t = document.createElement("link"); t.rel = "stylesheet"; t.href = "/tabler-icons.css"; document.head.appendChild(t); }
  if (!document.querySelector('link[href^="/bz-rail.css"]')) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/bz-rail.css?" + (((document.currentScript || {}).src || "").split("?")[1] || "v=1"); document.head.appendChild(l); }
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const hrefFor = (x) => (onDesk ? "#" : x.href && x.m === here ? x.href : x.href || "/?mod=" + x.m);
  const item = (x) => `<a class="ri${x.m === here ? " on" : ""}" data-m="${x.m}" href="${hrefFor(x)}" title="${esc(x.l)}" aria-label="${esc(x.l)}"><i class="ti ti-${x.i}"></i><span>${esc(x.l)}</span><b class="rb" hidden></b></a>`;
  const nav = document.createElement("nav");
  nav.className = "bz-rail"; nav.setAttribute("aria-label", "Buzzin");
  nav.innerHTML = `<a class="rlogo" href="/" title="Buzzin"><img src="/logo.svg?v=bee2" alt="Buzzin" width="34" height="34"><small class="rver" id="bzRailVer"></small></a>
    <div class="rmods">${MODS.map(item).join("")}<button class="ri rmore-b" type="button" aria-label="More"><i class="ti ti-dots"></i><span>More</span><b class="rb" hidden></b></button></div>
    <div class="rsheet" hidden><div class="rsheet-bg"></div><div class="rsheet-p" role="dialog" aria-label="All of Buzzin">
      <div class="rsheet-h"><b>Buzzin</b><small id="bzRailVer2"></small><button type="button" class="rsheet-x" aria-label="Close"><i class="ti ti-x"></i></button></div>
      <div class="rsheet-g">${MODS.map((x) => `<a class="rs" data-m="${x.m}" href="${hrefFor(x)}"><i class="ti ti-${x.i}"></i><span>${esc(x.l)}</span><b class="rb" hidden></b></a>`).join("")}
        <a class="rs" data-m="settings" href="${onDesk ? "#" : "/?mod=settings"}"><i class="ti ti-settings"></i><span>Settings</span></a></div>
      <div class="rsheet-f"><span id="bzRailWho2"></span><a href="#" data-act="signout"><i class="ti ti-logout"></i> Sign out</a></div></div></div>
    <div class="rfoot">
      <a class="ri" data-m="settings" href="${onDesk ? "#" : "/?mod=settings"}" title="Settings" aria-label="Settings"><i class="ti ti-settings"></i><span>Settings</span></a>
      <button class="rav" type="button" title="Account" aria-label="Account"><span id="bzRailAv">·</span></button>
      <div class="rmenu" hidden><div class="rme" id="bzRailWho"></div><a href="${onDesk ? "#" : "/?mod=settings"}" data-act="account"><i class="ti ti-user-cog"></i>Account &amp; password</a><a href="#" data-act="signout"><i class="ti ti-logout"></i>Sign out</a></div>
    </div>`;
  const mount = () => { document.body.prepend(nav); document.body.classList.add("has-rail"); };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);

  const sheet = nav.querySelector(".rsheet");
  const openSheet = (on) => { sheet.hidden = !on; document.documentElement.classList.toggle("bz-sheet-open", on); };
  nav.addEventListener("click", (e) => {
    if (e.target.closest(".rmore-b")) { openSheet(sheet.hidden); return; }
    if (e.target.closest(".rsheet-x") || e.target.classList.contains("rsheet-bg")) { openSheet(false); return; }
    const rs = e.target.closest("a.rs");
    if (rs) { openSheet(false); if (onDesk) { e.preventDefault(); if (rs.dataset.m === "settings") { if (window.openSettings) window.openSettings(); return; } const x = MODS.find((y) => y.m === rs.dataset.m); if (x && x.href && !window.goMod) { location.href = x.href; return; } if (x && x.href && x.m === "marketing") { location.href = x.href; return; } if (window.goMod) window.goMod(rs.dataset.m); } return; }
    const a = e.target.closest("a.ri");
    if (a && onDesk) {
      e.preventDefault();
      if (a.dataset.m === "settings") { if (window.openSettings) window.openSettings(); return; }
      const x = MODS.find((y) => y.m === a.dataset.m);
      if (x && x.href && !window.goMod) { location.href = x.href; return; }
      if (window.goMod) window.goMod(a.dataset.m);
      return;
    }
    if (e.target.closest(".rav")) { const m = nav.querySelector(".rmenu"); m.hidden = !m.hidden; return; }
    const act = e.target.closest("[data-act]");
    if (act) {
      if (act.dataset.act === "signout") { e.preventDefault(); if (window.signOut) window.signOut(); else { try { localStorage.removeItem("ec_key"); } catch (_) {} location.href = "/"; } }
      if (act.dataset.act === "account" && onDesk) { e.preventDefault(); nav.querySelector(".rmenu").hidden = true; if (window.openSettings) window.openSettings(); }
    }
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".bz-rail .rfoot")) { const m = nav.querySelector(".rmenu"); if (m) m.hidden = true; } });

  window.bzRail = {
    set(m) { nav.querySelectorAll("a.ri[data-m],a.rs[data-m]").forEach((a) => a.classList.toggle("on", a.dataset.m === m)); const mb = nav.querySelector(".rmore-b"); if (mb) mb.classList.toggle("on", !["home", "tickets", "orders", "reviews"].includes(m) && !!m); },
    badge(m, n) { n = Number(n) || 0; nav.querySelectorAll(`a.ri[data-m="${m}"] .rb, a.rs[data-m="${m}"] .rb`).forEach((b) => { b.hidden = !n; b.textContent = n > 99 ? "99+" : String(n); }); },
    user(name) { if (!name) return; const ini = String(name).trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(); const av = nav.querySelector("#bzRailAv"); if (av) av.textContent = ini; const w = nav.querySelector("#bzRailWho"); if (w) w.textContent = name; const w2 = nav.querySelector("#bzRailWho2"); if (w2) w2.textContent = name; try { localStorage.setItem("bz_user", name); } catch (_) {} },
  };
  try { const u = localStorage.getItem("bz_user"); if (u) window.bzRail.user(u); } catch (_) {}
  // version under the logo (the number in package.json; it changes with every update)
  fetch("/api/version").then((r) => r.json()).then((v) => { const el = nav.querySelector("#bzRailVer"); if (el && v && v.version) { el.textContent = "v" + v.version; el.title = "Buzzin " + v.version; } const e2 = nav.querySelector("#bzRailVer2"); if (e2 && v && v.version) e2.textContent = "v" + v.version; }).catch(() => {});
})();
