/* Buzzin · the dark app rail on the far left of every Buzzin page.
   One icon per part of Buzzin (Tickets, Shipments, Returns, Marketing…). On the help desk page the rail switches
   the panel next to it; on other pages it links back to the help desk with ?mod=… so the right part opens. */
(function () {
  if (window.bzRail) return;
  const MODS = [
    { m: "home", i: "home", l: "Home" },
    { m: "tickets", i: "inbox", l: "Tickets" },
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
  nav.innerHTML = `<a class="rlogo" href="/" title="Buzzin"><img src="/logo.svg?v=bee2" alt="Buzzin" width="34" height="34"></a>
    <div class="rmods">${MODS.map(item).join("")}</div>
    <div class="rfoot">
      <a class="ri" data-m="settings" href="${onDesk ? "#" : "/?mod=settings"}" title="Settings" aria-label="Settings"><i class="ti ti-settings"></i><span>Settings</span></a>
      <button class="rav" type="button" title="Account" aria-label="Account"><span id="bzRailAv">·</span></button>
      <div class="rmenu" hidden><div class="rme" id="bzRailWho"></div><a href="${onDesk ? "#" : "/?mod=settings"}" data-act="account"><i class="ti ti-user-cog"></i>Account &amp; password</a><a href="#" data-act="signout"><i class="ti ti-logout"></i>Sign out</a></div>
    </div>`;
  const mount = () => { document.body.prepend(nav); document.body.classList.add("has-rail"); };
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);

  nav.addEventListener("click", (e) => {
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
    set(m) { nav.querySelectorAll("a.ri[data-m]").forEach((a) => a.classList.toggle("on", a.dataset.m === m)); },
    badge(m, n) { const b = nav.querySelector(`a.ri[data-m="${m}"] .rb`); if (!b) return; n = Number(n) || 0; b.hidden = !n; b.textContent = n > 99 ? "99+" : String(n); },
    user(name) { if (!name) return; const ini = String(name).trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(); const av = nav.querySelector("#bzRailAv"); if (av) av.textContent = ini; const w = nav.querySelector("#bzRailWho"); if (w) w.textContent = name; try { localStorage.setItem("bz_user", name); } catch (_) {} },
  };
  try { const u = localStorage.getItem("bz_user"); if (u) window.bzRail.user(u); } catch (_) {}
})();
