/* Buzzin · Rewards (loyalty) admin. One page per menu item, all for the store picked in the LB / LBO tabs.
   Overview · Members · Activity · Ways to earn · Rewards · VIP tiers · Referrals · Widget & page · Settings */
(function () {
  const $ = (id) => document.getElementById(id);
  const E = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const J = (o) => E(JSON.stringify(o));
  const N = (n) => Number(n || 0).toLocaleString();
  const USD = (n) => "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const day = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—");
  const dt = (d) => (d ? new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
  const call = (u, o = {}) => api(u, { ...o, headers: { "Content-Type": "application/json", ...(o.headers || {}) } }).then((r) => { if (r && r.error) throw new Error(r.error); return r; });
  const post = (u, b, m = "POST") => call(u, { method: m, body: JSON.stringify(b || {}) });
  let LYS = (function () { try { return localStorage.getItem("bz_ly_store") === "lbo" ? "lbo" : "lb"; } catch (e) { return "lb"; } })();
  const SN = { lb: "Larkspur Baby", lbo: "Larkspur Baby Outlet" };
  const W = () => $("stuckwrap");
  const REASON = { order: "Order", review: "Review", join: "Joined", birthday: "Birthday", anniversary: "Anniversary", social: "Social", referral: "Referral", tier_entry: "Tier bonus", adjust: "Added by staff", adjust_back: "Removed by staff", redeem: "Redeemed", refund_back: "Refund", expired: "Expired" };
  let SET = null, RULES = null;

  const css = `<style>
  .lyw{padding:6px 22px 40px}.lyhead{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:14px 22px 6px}.lyhead h2{margin:0;font-size:18px}.lyhead .sp{flex:1}
  .lytbl{width:100%;border-collapse:collapse;font-size:13.5px}.lytbl th{text-align:left;font-size:12px;color:var(--muted);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}.lytbl td{padding:10px;border-bottom:1px solid var(--line);vertical-align:middle}.lytbl tr.click{cursor:pointer}.lytbl tr.click:hover td{background:var(--panel2)}
  .lyrule{display:flex;gap:14px;align-items:center;border:1px solid var(--line);border-radius:12px;padding:14px;background:var(--panel);margin-bottom:10px}.lyrule .ic{width:40px;height:40px;border-radius:50%;background:var(--panel2);display:flex;align-items:center;justify-content:center;font-size:20px;flex:none}.lyrule .t{flex:1;min-width:0}.lyrule .t b{display:block}.lyrule.off{opacity:.55}
  .lysw{position:relative;width:38px;height:22px;flex:none}.lysw input{opacity:0;width:0;height:0}.lysw span{position:absolute;inset:0;background:#D4D4D8;border-radius:22px;cursor:pointer;transition:.15s}.lysw span:before{content:"";position:absolute;width:16px;height:16px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.15s}.lysw input:checked+span{background:#16A34A}.lysw input:checked+span:before{transform:translateX(16px)}
  .lymodal{position:fixed;inset:0;background:rgba(10,12,20,.45);z-index:70;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto}.lymodal>div{background:var(--panel);border-radius:14px;width:100%;max-width:640px;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.25)}.lymodal.wide>div{max-width:980px}
  .lymodal h3{margin:0 0 4px}.lyf{margin-top:12px}.lyf>label{display:block;font-size:12.5px;font-weight:600;margin-bottom:4px}.lyf input[type=text],.lyf input[type=number],.lyf input[type=date],.lyf select,.lyf textarea{width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;font-size:14px;background:var(--panel);color:inherit}
  .lyg{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.lyg3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0 12px}.lyhint{font-size:12px;color:var(--muted);margin-top:4px}.lyfoot{display:flex;gap:8px;justify-content:flex-end;margin-top:18px}
  .lychips{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.lychip{display:inline-flex;gap:4px;align-items:center;background:var(--panel2);border-radius:999px;padding:3px 10px;font-size:12.5px}.lychip button{all:unset;cursor:pointer;opacity:.6}
  .lybar{display:flex;align-items:flex-end;gap:2px;height:120px;margin-top:10px}.lybar div{flex:1;max-width:28px;display:flex;flex-direction:column;justify-content:flex-end;gap:1px;min-width:2px}.lybar i{display:block;border-radius:2px 2px 0 0}
  .lytier{border:1px solid var(--line);border-radius:12px;padding:16px;background:var(--panel)}.lytiers{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
  .lybanner{border-radius:12px;padding:14px 16px;display:flex;gap:12px;align-items:center;margin-bottom:14px}.lybanner.off{background:#FEF3C7;color:#78350F}.lybanner.on{background:#DCFCE7;color:#14532D}
  .lypick{position:relative}.lypick .res{position:absolute;left:0;right:0;top:100%;background:var(--panel);border:1px solid var(--line);border-radius:8px;z-index:5;max-height:220px;overflow:auto;box-shadow:0 8px 20px rgba(0,0,0,.1)}.lypick .res div{padding:8px 10px;cursor:pointer;font-size:13.5px}.lypick .res div:hover{background:var(--panel2)}
  .lydes{display:grid;grid-template-columns:340px 1fr;gap:16px;align-items:start}.lydes .side{position:sticky;top:10px;max-height:calc(100vh - 140px);overflow:auto;border:1px solid var(--line);border-radius:12px;padding:6px 16px 20px;background:var(--panel)}
  .lydes .pv{border:1px solid var(--line);border-radius:12px;background:#E9E9EC;overflow:auto;height:calc(100vh - 150px);display:flex;justify-content:center;padding:18px}.lydes .pv iframe{border:0;background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.12);height:100%}
  .lyc{display:flex;gap:6px}.lyc input[type=color]{width:34px;height:32px;padding:2px;border:1px solid var(--line);border-radius:8px;background:#fff;flex:none}
  .lyseg{display:inline-flex;border:1px solid var(--line);border-radius:9px;overflow:hidden}.lyseg button{all:unset;cursor:pointer;padding:6px 11px;font-size:13px;font-weight:600}.lyseg button.on{background:#EEF2FF;color:#3730A3}
  @media(max-width:1100px){.lydes{grid-template-columns:1fr}.lydes .side{position:static;max-height:none}}
  </style>`;
  const pill = (s) => `<span class="opill ${s === "enrolled" || s === "used" || s === "converted" ? "ok" : s === "blocked" || s === "expired" || s === "reversed" ? "bad" : s === "pending" || s === "issued" || s === "sent" ? "warn" : "mut"}">${E({ enrolled: "Member", pending: "Not joined", blocked: "Blocked", issued: "Ready", used: "Used", expired: "Expired", sent: "Sent", converted: "Ordered" }[s] || s)}</span>`;
  const head = (title, right = "") => `${css}<div class="lyhead"><h2>${E(title)}</h2><span class="opill mut">${SN[LYS]}</span><span class="sp"></span>${right}</div>`;
  const tile = (l, v, sub) => `<div class="rvkpi"><div class="exc">${l}</div><b>${v}</b>${sub ? `<div class="exc">${sub}</div>` : ""}</div>`;
  const loading = () => { if (!W().querySelector(".lyw")) W().innerHTML = '<div class="empty">Loading…</div>'; };
  const fail = (e) => { W().innerHTML = `<div class="empty">Couldn't load: ${E(e.message)}</div>`; };
  const settings = async (force) => { if (!SET || force || SET._s !== LYS) { SET = await call(`/api/loyalty/settings?store=${LYS}`); SET._s = LYS; } return SET; };
  const ruleData = async (force) => { if (!RULES || force || RULES._s !== LYS) { RULES = await call(`/api/loyalty/rules?store=${LYS}`); RULES._s = LYS; } return RULES; };
  const cur = (n) => (SET ? (Math.abs(n) === 1 ? SET.currency : SET.currency_plural) : "points");
  function modal(html, wide) { closeModal(); const m = document.createElement("div"); m.className = "lymodal" + (wide ? " wide" : ""); m.innerHTML = `<div role="dialog" aria-modal="true">${html}</div>`; m.addEventListener("mousedown", (e) => { if (e.target === m) closeModal(); }); document.body.appendChild(m); return m; }
  function closeModal() { document.querySelectorAll(".lymodal").forEach((x) => x.remove()); }
  window.lyClose = closeModal;

  /* ---------- store tabs ---------- */
  function tabs() { document.querySelectorAll(".lytabs [data-ls]").forEach((b) => b.classList.toggle("on", b.dataset.ls === LYS)); }
  window.lySetStore = (s) => { LYS = s; try { localStorage.setItem("bz_ly_store", s); } catch (e) {} SET = null; RULES = null; tabs(); if (/^ly_/.test(VIEW)) lyLoad(); };
  document.addEventListener("DOMContentLoaded", tabs);

  /* ---------- Overview ---------- */
  let OVD = 30;
  async function overview() {
    loading(); let d, st; try { [d, st] = await Promise.all([call(`/api/loyalty/overview?store=${LYS}&days=${OVD}`), settings(true)]); } catch (e) { return fail(e); }
    const k = d.members, p = d.points, r = d.rewards, rev = d.revenue;
    const max = Math.max(1, ...d.daily.map((x) => Math.max(x.earned, x.spent)));
    W().innerHTML = head(st.name, `<label class="rvf"><span>Period</span><select onchange="lyOvDays(this.value)">${[[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "1 year"]].map(([v, l]) => `<option value="${v}" ${OVD === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>`) + `<div class="lyw">
      ${d.live ? `<div class="lybanner on"><i class="ti ti-circle-check" style="font-size:22px"></i><div style="flex:1"><b>The program is live</b><div>Since ${day(d.launched_at)}. Customers earn and spend ${E(st.currency_plural)} on ${SN[LYS]}.</div></div><button class="btn sec xs" onclick="setView('ly_setup')">Settings</button></div>`
        : `<div class="lybanner off"><i class="ti ti-player-pause" style="font-size:22px"></i><div style="flex:1"><b>Not live. Nothing is earned and nothing shows on the site.</b><div>Everything is set up and ready. Preview it on your store, then launch it in Settings when you decide to use it.</div></div><a class="btn sec xs" target="_blank" rel="noopener" href="${E(st.shop)}/?bz_rewards=1">Preview on site</a><button class="btn xs" onclick="setView('ly_setup')">Launch…</button></div>`}
      <div class="rvkpis">${tile("Members", N(k.enrolled), `${N(k.joined)} joined in this period · ${N(k.pending)} not joined yet`)}${tile(`${st.currency_plural[0].toUpperCase() + st.currency_plural.slice(1)} earned`, N(p.issued), `${N(p.redeemed)} spent · ${N(p.expired)} expired`)}
        ${tile("Outstanding", N(p.outstanding), `worth about ${USD(p.outstanding / 100)} if spent at 100 = $1`)}${tile("Rewards redeemed", N(r.issued), `${N(r.used)} used at checkout · ${USD(r.used_value)} off`)}
        ${tile("Sales from members", USD(rev.members), `${rev.total ? Math.round((100 * rev.members) / rev.total) : 0}% of ${USD(rev.total)} · ${N(rev.member_orders)} orders`)}${tile("Referrals", N(d.referrals.sent), `${N(d.referrals.converted)} became orders`)}</div>
      <div style="display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:14px">
        <div class="ocard"><div class="och">${E(st.currency_plural[0].toUpperCase() + st.currency_plural.slice(1))} earned vs spent <span class="exc" style="margin-left:auto;font-weight:400"><i style="display:inline-block;width:10px;height:10px;background:#16A34A;border-radius:2px"></i> earned <i style="display:inline-block;width:10px;height:10px;background:#6366F1;border-radius:2px;margin-left:8px"></i> spent</span></div>
          ${d.daily.length ? `<div class="lybar">${d.daily.map((x) => `<div title="${E(x.d)}: +${x.earned} / −${x.spent}"><i style="height:${Math.round((100 * x.earned) / max)}px;background:#16A34A"></i><i style="height:${Math.round((100 * x.spent) / max)}px;background:#6366F1"></i></div>`).join("")}</div>` : `<div class="exc" style="padding:30px 0;text-align:center">Nothing yet. This fills in once the program is live.</div>`}</div>
        <div class="ocard"><div class="och">Members by tier</div>${d.by_tier.map((t) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 0"><span style="width:12px;height:12px;border-radius:50%;background:${E(t.color)}"></span><span style="flex:1">${E(t.name)}</span><b>${N(t.n)}</b></div>`).join("") || '<div class="exc">No tiers.</div>'}
          <div class="och" style="margin-top:14px">Where ${E(st.currency_plural)} come from</div>${d.by_reason.map((x) => `<div style="display:flex;padding:4px 0"><span style="flex:1">${E(REASON[x.reason] || x.reason)}</span><b>${N(x.n)}</b></div>`).join("") || '<div class="exc">Nothing yet.</div>'}</div></div></div>`;
  }
  window.lyOvDays = (v) => { OVD = Number(v); overview(); };

  /* ---------- Members ---------- */
  const MQ = { q: "", status: "", tier: "", sort: "recent", page: 1 };
  async function members() {
    loading(); let d, R; try { [d, R] = await Promise.all([call(`/api/loyalty/members?store=${LYS}&${new URLSearchParams(MQ)}`), ruleData(), settings()]); } catch (e) { return fail(e); }
    W().innerHTML = head("Members", `<button class="btn xs" onclick="lyAddMember()"><i class="ti ti-user-plus"></i> Add member</button>`) + `<div class="lyw">
      <div class="rvbar" style="padding:0 0 10px"><label class="rvf" style="flex:1;min-width:200px"><span>Search</span><input type="search" class="rvsearch" value="${E(MQ.q)}" placeholder="Name, email or referral code" onkeydown="if(event.key==='Enter'){lyMQ('q',this.value)}"></label>
        <label class="rvf"><span>Status</span><select onchange="lyMQ('status',this.value)">${[["", "All"], ["enrolled", "Members"], ["pending", "Not joined"], ["blocked", "Blocked"]].map(([v, l]) => `<option value="${v}" ${MQ.status === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="rvf"><span>Tier</span><select onchange="lyMQ('tier',this.value)"><option value="">All</option>${R.tiers.map((t) => `<option value="${t.id}" ${String(MQ.tier) === String(t.id) ? "selected" : ""}>${E(t.name)}</option>`).join("")}</select></label>
        <label class="rvf"><span>Sort</span><select onchange="lyMQ('sort',this.value)">${[["recent", "Recent activity"], ["points", "Most points"], ["joined", "Newest members"]].map(([v, l]) => `<option value="${v}" ${MQ.sort === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
      <div class="ocard" style="padding:0;overflow:auto">${d.members.length ? `<table class="lytbl"><thead><tr><th>Customer</th><th>Status</th><th>Tier</th><th style="text-align:right">${E(cur(2))}</th><th style="text-align:right">On the way</th><th>Joined</th><th>Last activity</th></tr></thead><tbody>
        ${d.members.map((m) => `<tr class="click" onclick="lyMember(${m.id})"><td><b>${E([m.first_name, m.last_name].filter(Boolean).join(" ") || "—")}</b><div class="exc">${E(m.email || "")}</div></td><td>${pill(m.status)}</td><td>${m.tier_name ? `<span style="display:inline-flex;align-items:center;gap:6px"><i style="width:10px;height:10px;border-radius:50%;background:${E(m.tier_color)}"></i>${E(m.tier_name)}</span>` : "—"}</td>
          <td style="text-align:right"><b>${N(m.bal)}</b></td><td style="text-align:right" class="exc">${m.pending_pts ? N(m.pending_pts) : ""}</td><td>${day(m.enrolled_at)}</td><td>${dt(m.last_activity_at)}</td></tr>`).join("")}</tbody></table>`
        : `<div class="empty" style="padding:40px">No members yet. Customers show up here when they join, or as "not joined" after they order once the program is live.</div>`}</div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:10px"><span class="exc">${N(d.total)} total</span><span style="flex:1"></span>${d.page > 1 ? `<button class="btn sec xs" onclick="lyMQ('page',${d.page - 1})">Previous</button>` : ""}${d.page * d.per < d.total ? `<button class="btn sec xs" onclick="lyMQ('page',${d.page + 1})">Next</button>` : ""}</div></div>`;
  }
  window.lyMQ = (k, v) => { MQ[k] = v; if (k !== "page") MQ.page = 1; members(); };
  window.lyAddMember = () => {
    modal(`<h3>Add a member</h3><div class="exc">Enrolls the customer with this email (and gives the join ${E(cur(2))}). Use it for someone who asked to join by phone or email.</div><div class="lyf"><label>Email</label><input type="text" id="lyAddEm" placeholder="customer@email.com"></div>
      <div class="lyfoot"><button class="btn sec" onclick="lyClose()">Cancel</button><button class="btn" onclick="lyAddMemberGo(this)">Add</button></div>`);
    setTimeout(() => $("lyAddEm").focus(), 50);
  };
  window.lyAddMemberGo = async (b) => { b.disabled = true; try { const r = await post("/api/loyalty/members-add", { store: LYS, email: $("lyAddEm").value }); closeModal(); toast("Added"); lyMember(r.id); members(); } catch (e) { toast(e.message, true); b.disabled = false; } };
  let MT = "history";
  window.lyMember = async (id) => {
    let d, R; try { [d, R] = await Promise.all([call(`/api/loyalty/members/${id}`), ruleData(), settings()]); } catch (e) { return toast(e.message, true); }
    const m = d.member, v = d.view;
    const body = () => MT === "history" ? `<table class="lytbl"><thead><tr><th>When</th><th>What</th><th style="text-align:right">${E(cur(2))}</th><th>By</th></tr></thead><tbody>${d.ledger.map((l) => `<tr style="${l.voided ? "opacity:.45;text-decoration:line-through" : ""}"><td>${dt(l.at)}${new Date(l.available_at) > new Date() ? `<div class="exc">on the way · ${day(l.available_at)}</div>` : ""}</td><td>${E(REASON[l.reason] || l.reason)}<div class="exc">${E(l.note || l.rule_title || "")}</div></td><td style="text-align:right;font-weight:700;color:${l.delta > 0 ? "#15803D" : "inherit"}">${l.delta > 0 ? "+" : ""}${N(l.delta)}</td><td class="exc">${E(l.by_user || "")}</td></tr>`).join("") || '<tr><td colspan="4" class="exc">Nothing yet.</td></tr>'}</tbody></table>`
      : MT === "rewards" ? `<table class="lytbl"><thead><tr><th>Reward</th><th>Code</th><th>${E(cur(2))}</th><th>Status</th><th>Made</th></tr></thead><tbody>${v.redemptions.map((x) => `<tr><td>${E(x.title)}</td><td><code>${E(x.code)}</code></td><td>${N(x.points)}</td><td>${pill(x.status)}${x.status === "issued" ? `<div class="exc">until ${day(x.expires_at)}</div>` : ""}</td><td>${day(x.created_at)}</td></tr>`).join("") || '<tr><td colspan="5" class="exc">No rewards yet.</td></tr>'}</tbody></table>`
      : `<table class="lytbl"><thead><tr><th>Friend</th><th>Code</th><th>Status</th><th>Order</th><th>When</th></tr></thead><tbody>${d.referrals.map((x) => `<tr><td>${E(x.friend_email)}</td><td><code>${E(x.code || "")}</code></td><td>${pill(x.status)}</td><td>${E(x.order_name || "")}</td><td>${day(x.created_at)}</td></tr>`).join("") || '<tr><td colspan="5" class="exc">No referrals yet.</td></tr>'}</tbody></table>`;
    const draw = () => {
      const el = document.querySelector(".lymodal > div"); if (!el) return;
      el.innerHTML = `<div style="display:flex;gap:12px;align-items:flex-start"><div style="flex:1"><h3>${E([m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Member")} ${pill(m.status)}</h3><div class="exc">${E(m.email || "")}${d.profile ? ` · <a href="/marketing#profiles/${d.profile.id}" target="_blank" rel="noopener">Marketing profile</a>` : ""} · referral code <code>${E(m.ref_code)}</code></div></div><button class="btn sec xs" onclick="lyClose()">Close</button></div>
        <div class="rvkpis" style="margin-top:12px">${tile("Balance", N(v.points), v.pending ? `+${N(v.pending)} on the way` : "")}${tile("Tier", v.tier ? E(v.tier.name) : "—", v.next_tier ? `${USD(v.next_tier.to_go)} to ${E(v.next_tier.name)}` : "top tier")}${tile("VIP spend", USD(d.vip_spend), SET.vip.period === "lifetime" ? "lifetime" : "last 12 months")}${tile("Earned all time", N(v.earned), d.profile ? `${N(d.profile.orders_count)} orders · ${USD(d.profile.total_spent)}` : "")}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 12px">
          <button class="btn xs" onclick="lyAdj(${m.id})"><i class="ti ti-plus-minus"></i> Adjust ${E(cur(2))}</button>
          <button class="btn sec xs" onclick="lyIssue(${m.id})"><i class="ti ti-gift"></i> Give a reward</button>
          <button class="btn sec xs" onclick="lyTierSet(${m.id})"><i class="ti ti-crown"></i> Set tier</button>
          <button class="btn sec xs" onclick="lyBday(${m.id},'${E(m.birthday || "")}')"><i class="ti ti-cake"></i> Birthday${m.birthday ? `: ${E(m.birthday)}` : ""}</button>
          ${m.status === "pending" ? `<button class="btn sec xs" onclick="lyMAct(${m.id},'enroll')">Enroll</button>` : ""}${m.status === "blocked" ? `<button class="btn sec xs" onclick="lyMAct(${m.id},'unblock')">Unblock</button>` : `<button class="btn sec xs" onclick="if(confirm('Block this customer from the program?'))lyMAct(${m.id},'block')">Block</button>`}</div>
        <div class="lyf" style="margin-top:0"><label>Note (staff only)</label><textarea id="lyMNote" rows="2" onchange="lyMAct(${m.id},'note',{note:this.value},true)">${E(m.note || "")}</textarea></div>
        <div class="lyseg" style="margin:14px 0 8px">${[["history", "Points history"], ["rewards", "Rewards"], ["referrals", "Referrals"]].map(([k, l]) => `<button class="${MT === k ? "on" : ""}" onclick="lyMT('${k}')">${l}</button>`).join("")}</div><div style="max-height:360px;overflow:auto">${body()}</div>`;
    };
    window.lyMT = (k) => { MT = k; draw(); };
    window.lyMRefresh = async () => { d = await call(`/api/loyalty/members/${id}`); Object.assign(m, d.member); Object.assign(v, d.view); draw(); };
    if (!document.querySelector(".lymodal")) modal("", true); draw();
  };
  window.lyMAct = async (id, action, body, quiet) => { try { await post(`/api/loyalty/members/${id}/${action}`, body || {}); if (!quiet) toast("Saved"); closeModal(); lyMember(id); if (VIEW === "ly_members") members(); } catch (e) { toast(e.message, true); } };
  window.lyAdj = (id) => {
    const back = document.querySelector(".lymodal > div").innerHTML;
    document.querySelector(".lymodal > div").innerHTML = `<h3>Adjust ${E(cur(2))}</h3><div class="lyg"><div class="lyf"><label>Add or remove</label><select id="lyAdjS"><option value="1">Add</option><option value="-1">Remove</option></select></div><div class="lyf"><label>How many</label><input type="number" id="lyAdjN" min="1" value="100"></div></div>
      <div class="lyf"><label>Reason (they can see this in their history)</label><input type="text" id="lyAdjR" value="Thank you from our team"></div><label class="rvck" style="margin-top:10px"><input type="checkbox" id="lyAdjE"> Count as earned points (can start a "points earned" email or text)</label>
      <div class="lyfoot"><button class="btn sec" onclick="lyMember(${id})">Back</button><button class="btn" onclick="lyMAct(${id},'points',{points:Number($('lyAdjS').value)*Number($('lyAdjN').value),note:$('lyAdjR').value,notify:$('lyAdjE').checked})">Save</button></div>`;
    void back;
  };
  window.lyIssue = async (id) => {
    const R = await ruleData();
    document.querySelector(".lymodal > div").innerHTML = `<h3>Give a reward</h3><div class="exc">Spends the member's ${E(cur(2))} and makes a single-use code, just like they did it themselves. To give one for free, add the ${E(cur(2))} first.</div>
      <div class="lyf"><label>Reward</label><select id="lyIsR">${R.redeem.filter((r) => r.enabled).map((r) => `<option value="${r.id}" data-t="${r.type}">${E(r.title)} · ${r.type === "convert" ? "you choose" : N(r.config.points) + " " + E(cur(2))}</option>`).join("")}</select></div>
      <div class="lyf"><label>${E(cur(2))} to convert (only for “convert” rewards)</label><input type="number" id="lyIsP" value="500"></div>
      <div class="lyfoot"><button class="btn sec" onclick="lyMember(${id})">Back</button><button class="btn" onclick="lyMAct(${id},'redeem',{rule_id:Number($('lyIsR').value),points:Number($('lyIsP').value)})">Make the code</button></div>`;
  };
  window.lyTierSet = async (id) => {
    const R = await ruleData();
    document.querySelector(".lymodal > div").innerHTML = `<h3>Set a tier</h3><div class="exc">Keeps the member at least at this tier until the date below, even if their spend is lower. They still move up if they spend more.</div>
      <div class="lyf"><label>Tier</label><select id="lyTsT"><option value="">Go back to their spend</option>${R.tiers.map((t) => `<option value="${t.id}">${E(t.name)}</option>`).join("")}</select></div>
      <div class="lyf"><label>Until</label><input type="date" id="lyTsU" value="${new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10)}"></div>
      <div class="lyfoot"><button class="btn sec" onclick="lyMember(${id})">Back</button><button class="btn" onclick="lyMAct(${id},'tier',{tier_id:$('lyTsT').value||null,until:$('lyTsU').value})">Save</button></div>`;
  };
  window.lyBday = (id, cur0) => {
    document.querySelector(".lymodal > div").innerHTML = `<h3>Birthday</h3><div class="lyf"><label>Month/day</label><input type="text" id="lyBdV" value="${E(cur0 ? cur0.slice(-5).replace("-", "/") : "")}" placeholder="04/18"></div>
      <div class="lyfoot"><button class="btn sec" onclick="lyMember(${id})">Back</button><button class="btn" onclick="lyMAct(${id},'birthday',{birthday:$('lyBdV').value})">Save</button></div>`;
  };

  /* ---------- Activity ---------- */
  let AV = "points", AR = "";
  async function activity() {
    loading(); let rows; try { await settings(); rows = AV === "points" ? (await call(`/api/loyalty/activity?store=${LYS}&reason=${AR}`)).rows : (await call(`/api/loyalty/redemptions?store=${LYS}`)).rows; } catch (e) { return fail(e); }
    W().innerHTML = head("Activity", `<span class="lyseg"><button class="${AV === "points" ? "on" : ""}" onclick="lyAV('points')">${E(cur(2))}</button><button class="${AV === "rewards" ? "on" : ""}" onclick="lyAV('rewards')">Rewards redeemed</button></span>
      ${AV === "points" ? `<label class="rvf"><span>Type</span><select onchange="lyAR(this.value)"><option value="">All</option>${Object.entries(REASON).map(([k, l]) => `<option value="${k}" ${AR === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}`) +
      `<div class="lyw"><div class="ocard" style="padding:0;overflow:auto">${rows.length ? (AV === "points"
        ? `<table class="lytbl"><thead><tr><th>When</th><th>Customer</th><th>What</th><th style="text-align:right">${E(cur(2))}</th></tr></thead><tbody>${rows.map((l) => `<tr class="click" onclick="lyMember(${l.member_id})"><td>${dt(l.at)}</td><td><b>${E([l.first_name, l.last_name].filter(Boolean).join(" ") || l.email)}</b><div class="exc">${E(l.email || "")}</div></td><td>${E(REASON[l.reason] || l.reason)}<div class="exc">${E(l.note || l.rule_title || "")}</div></td><td style="text-align:right;font-weight:700;color:${l.delta > 0 ? "#15803D" : "inherit"}">${l.delta > 0 ? "+" : ""}${N(l.delta)}</td></tr>`).join("")}</tbody></table>`
        : `<table class="lytbl"><thead><tr><th>When</th><th>Customer</th><th>Reward</th><th>Code</th><th>${E(cur(2))}</th><th>Status</th></tr></thead><tbody>${rows.map((x) => `<tr class="click" onclick="lyMember(${x.member_id})"><td>${dt(x.created_at)}</td><td>${E([x.first_name, x.last_name].filter(Boolean).join(" ") || x.email)}</td><td>${E(x.title)}</td><td><code>${E(x.code || "")}</code></td><td>${N(x.points)}</td><td>${pill(x.status)}${x.used_order ? `<div class="exc">${E(x.used_order)}</div>` : ""}</td></tr>`).join("")}</tbody></table>`)
        : `<div class="empty" style="padding:40px">Nothing yet.</div>`}</div></div>`;
  }
  window.lyAV = (v) => { AV = v; activity(); }; window.lyAR = (v) => { AR = v; activity(); };

  /* ---------- Ways to earn / Rewards ---------- */
  const EMO = { "user-plus": "user-plus", "shopping-bag": "shopping-bag", star: "star", cake: "cake", confetti: "confetti", "brand-instagram": "brand-instagram", "brand-facebook": "brand-facebook", share: "share", "brand-tiktok": "brand-tiktok", "brand-x": "brand-x", "brand-pinterest": "brand-pinterest", sparkles: "sparkles", cash: "cash", discount: "discount", "arrows-exchange": "arrows-exchange", truck: "truck", gift: "gift" };
  function ruleLine(r, kind, T) {
    const c = r.config || {}; const t = T[r.type] || {};
    const what = kind === "earn" ? (r.type === "order" ? `${N(c.per_dollar)} ${cur(2)} per $1${c.delay_days ? ` · after ${c.delay_days} days` : ""}${c.limit_count ? ` · max ${c.limit_count} per ${c.limit_days} days` : ""}`
      : r.type === "review" ? `${N(c.points)} ${cur(2)}${c.photo_points ? ` · +${N(c.photo_points)} with photos` : ""}` : `${N(c.points)} ${cur(2)}${c.period_days ? ` · every ${c.period_days} days` : t.social ? " · once" : ""}${c.url ? ` · ${c.url.replace(/^https?:\/\/(www\.)?/, "")}` : ""}`)
      : (r.type === "convert" ? `$1 per ${N(c.per_dollar)} ${cur(2)} · ${N(c.min_points)}–${N(c.max_points)} at a time` : r.type === "product" ? `${N(c.points)} ${cur(2)} · ${(c.products || []).map((p) => p.title).join(", ") || "pick a product"}` : `${N(c.points)} ${cur(2)}`) +
        `${c.min_purchase ? ` · orders over $${c.min_purchase}` : ""}${(c.collections || []).length ? ` · only ${(c.collections || []).map((x) => x.title).join(", ")}` : ""}${c.expiry_days ? ` · code good ${c.expiry_days} days` : ""}${c.limit_count ? ` · max ${c.limit_count}${c.limit_days ? ` per ${c.limit_days} days` : " ever"}` : ""}`;
    return `<div class="lyrule${r.enabled ? "" : " off"}"><span class="ic"><i class="ti ti-${EMO[t.icon] || "star"}"></i></span><div class="t"><b>${E(r.title)}</b><span class="exc">${E(what)}</span></div>
      <label class="lysw" title="On/off"><input type="checkbox" ${r.enabled ? "checked" : ""} onchange="lyRuleOn(${r.id},this.checked)"><span></span></label><button class="btn sec xs" onclick="lyRuleEdit('${kind}',${r.id})">Edit</button></div>`;
  }
  async function ruleList(kind) {
    loading(); let R; try { R = await ruleData(true); await settings(); } catch (e) { return fail(e); }
    const T = kind === "earn" ? R.EARN_TYPES : R.REDEEM_TYPES, list = R[kind];
    W().innerHTML = head(kind === "earn" ? "Ways to earn" : "Rewards", `<button class="btn xs" onclick="lyRuleNew('${kind}')"><i class="ti ti-plus"></i> Add ${kind === "earn" ? "a way to earn" : "a reward"}</button>`) +
      `<div class="lyw"><div class="exc" style="margin-bottom:12px">${kind === "earn" ? `How members collect ${E(cur(2))}. Turn any of them on or off; VIP tiers can change the amounts (VIP tiers → Edit).` : `What members can spend ${E(cur(2))} on. Each one becomes a single-use Shopify code with the limits you set.`}</div>${list.map((r) => ruleLine(r, kind, T)).join("") || '<div class="empty">None yet.</div>'}</div>`;
  }
  window.lyRuleOn = async (id, on) => { try { await post(`/api/loyalty/rules/${id}`, { enabled: on }, "PUT"); RULES = null; toast(on ? "On" : "Off"); ruleList(VIEW === "ly_earn" ? "earn" : "redeem"); } catch (e) { toast(e.message, true); } };
  window.lyRuleNew = async (kind) => {
    const R = await ruleData(); const T = kind === "earn" ? R.EARN_TYPES : R.REDEEM_TYPES;
    modal(`<h3>${kind === "earn" ? "Add a way to earn" : "Add a reward"}</h3><div class="lytiers" style="margin-top:12px">${Object.entries(T).map(([k, t]) => `<button class="lyrule" style="cursor:pointer;margin:0;text-align:left" onclick="lyRuleEdit('${kind}',null,'${k}')"><span class="ic"><i class="ti ti-${EMO[t.icon] || "star"}"></i></span><div class="t"><b>${E(t.title)}</b></div></button>`).join("")}</div><div class="lyfoot"><button class="btn sec" onclick="lyClose()">Cancel</button></div>`);
  };
  let PICKS = {};
  function picker(kind, list) {
    PICKS[kind] = (list || []).slice();
    return `<div class="lypick"><input type="text" placeholder="Search ${kind}…" oninput="lyPickQ('${kind}',this)"><div class="res" id="lyPR_${kind}" hidden></div></div><div class="lychips" id="lyPC_${kind}">${chips(kind)}</div>`;
  }
  const chips = (kind) => PICKS[kind].map((x, i) => `<span class="lychip">${E(x.title)}<button onclick="lyPickDel('${kind}',${i})" aria-label="Remove">✕</button></span>`).join("");
  let pickT = null;
  window.lyPickQ = (kind, inp) => { clearTimeout(pickT); pickT = setTimeout(async () => { const r = await call(`/api/mk/shopify-items?store=${LYS}&kind=${kind}&q=${encodeURIComponent(inp.value)}`).catch(() => ({ items: [] })); const box = $("lyPR_" + kind); box.hidden = false; box.innerHTML = r.items.map((x) => `<div data-id="${E(x.id)}" data-t="${E(x.title)}">${E(x.title)}</div>`).join("") || '<div class="exc">No matches</div>'; box.onclick = (e) => { const d = e.target.closest("[data-id]"); if (!d) return; if (!PICKS[kind].some((y) => y.id === d.dataset.id)) PICKS[kind].push({ id: d.dataset.id, title: d.dataset.t }); $("lyPC_" + kind).innerHTML = chips(kind); box.hidden = true; inp.value = ""; }; }, 250); };
  window.lyPickDel = (kind, i) => { PICKS[kind].splice(i, 1); $("lyPC_" + kind).innerHTML = chips(kind); };
  window.lyRuleEdit = async (kind, id, newType) => {
    const R = await ruleData(); const T = kind === "earn" ? R.EARN_TYPES : R.REDEEM_TYPES;
    const r = id ? R[kind].find((x) => x.id == id) : { type: newType, title: T[newType].title, enabled: true, config: {} }; const c = r.config || {}; const t = T[r.type] || {};
    const f = (k, l, type = "number", hint = "", ph = "") => `<div class="lyf"><label>${l}</label><input type="${type}" data-k="${k}" value="${E(c[k] == null ? "" : c[k])}" placeholder="${E(ph)}">${hint ? `<div class="lyhint">${hint}</div>` : ""}</div>`;
    let fields = "";
    if (kind === "earn") {
      if (r.type === "order") fields = `<div class="lyg">${f("per_dollar", `${cur(2)} per $1 spent`)}${f("delay_days", "Wait before they can use them (days)", "number", "Gives time for returns. 0 = right away.")}</div><div class="lyg">${f("limit_count", "Most orders that earn", "number", "0 = no limit")}${f("limit_days", "…per this many days")}</div>`;
      else if (r.type === "review") fields = `<div class="lyg">${f("points", `${cur(2)} per review`)}${f("photo_points", `Extra ${cur(2)} with photos`)}</div><div class="lyg"><div class="lyf"><label>Give them once per</label><select data-k="once_per"><option value="review" ${c.once_per !== "order" ? "selected" : ""}>Review</option><option value="order" ${c.once_per === "order" ? "selected" : ""}>Order</option></select></div>${f("max_per_order", `Most ${cur(2)} per order`, "number", "0 = no limit")}</div>`;
      else if (r.type === "birthday") fields = `${f("points", cur(2))}<div class="lyhint">Given the day before their birthday, once a year. Members add their birthday in the rewards panel.</div>`;
      else if (t.social) fields = `${f("points", cur(2))}${f("url", "Link it opens", "text", "", "https://")}${f("period_days", "Can earn again every (days)", "number", "0 = only once ever")}${r.type === "x_post" ? f("text", "Suggested post text", "text") : ""}<div class="lyhint">Social actions can't be checked, so the points are given when they click (every loyalty app works this way).</div>`;
      else fields = f("points", cur(2)) + (r.type === "custom" ? `<div class="lyhint">Custom ways to earn show on the site; give the ${cur(2)} by hand from Members.</div>${f("description", "What to do", "text")}` : "");
    } else {
      if (r.type === "amount") fields = `<div class="lyg">${f("value", "$ off")}${f("points", `${cur(2)} it costs`)}</div>`;
      else if (r.type === "percent") fields = `<div class="lyg">${f("value", "% off")}${f("points", `${cur(2)} it costs`)}</div>`;
      else if (r.type === "convert") fields = `<div class="lyg3">${f("per_dollar", `${cur(2)} per $1`)}${f("min_points", "Least at a time")}${f("max_points", "Most at a time")}</div>`;
      else if (r.type === "shipping") fields = `<div class="lyg">${f("points", `${cur(2)} it costs`)}${f("max_ship", "Covers shipping up to $", "number", "0 = any rate")}</div>`;
      else if (r.type === "product") fields = `${f("points", `${cur(2)} it costs`)}<div class="lyf"><label>Product(s) they can get free</label>${picker("products", c.products)}</div>`;
      fields += `<div class="rvsh" style="margin-top:16px">Limits</div><div class="lyg">${f("expiry_days", "Code expires after (days)", "number", "We recommend 30–90.")}${r.type !== "shipping" ? f("min_purchase", "Minimum order $", "number", "0 = none") : ""}</div>
        <div class="lyg">${f("limit_count", "Most times per member", "number", "0 = no limit")}${f("limit_days", "…per this many days", "number", "0 = ever")}</div>
        ${r.type !== "product" && r.type !== "shipping" ? `<div class="lyf"><label>Only for these collections (optional)</label>${picker("collections", c.collections)}</div>` : ""}`;
    }
    modal(`<h3>${E(t.title)}</h3><div class="lyf"><label>Name customers see</label><input type="text" id="lyRT" value="${E(r.title)}"></div>${fields}
      <label class="rvck" style="margin-top:12px"><input type="checkbox" id="lyRE" ${r.enabled ? "checked" : ""}> On</label>
      <div class="lyfoot">${id ? `<button class="btn sec" style="margin-right:auto;color:#B42318" onclick="if(confirm('Delete this?'))lyRuleDel(${id})">Delete</button>` : ""}<button class="btn sec" onclick="lyClose()">Cancel</button><button class="btn" onclick="lyRuleSave('${kind}',${id || "null"},'${r.type}',this)">Save</button></div>`);
  };
  window.lyRuleSave = async (kind, id, type, b) => {
    const cfg = {}; document.querySelectorAll(".lymodal [data-k]").forEach((x) => { cfg[x.dataset.k] = x.type === "number" ? (x.value === "" ? 0 : Number(x.value)) : x.value; });
    if (PICKS.products && document.getElementById("lyPC_products")) cfg.products = PICKS.products; if (PICKS.collections && document.getElementById("lyPC_collections")) cfg.collections = PICKS.collections;
    b.disabled = true;
    try { const body = { store: LYS, kind, type, title: $("lyRT").value, enabled: $("lyRE").checked, config: cfg }; if (id) await post(`/api/loyalty/rules/${id}`, body, "PUT"); else await post("/api/loyalty/rules", body); RULES = null; closeModal(); PICKS = {}; toast("Saved"); ruleList(kind); }
    catch (e) { toast(e.message, true); b.disabled = false; }
  };
  window.lyRuleDel = async (id) => { try { await call(`/api/loyalty/rules/${id}`, { method: "DELETE" }); RULES = null; closeModal(); ruleList(VIEW === "ly_earn" ? "earn" : "redeem"); } catch (e) { toast(e.message, true); } };

  /* ---------- VIP tiers ---------- */
  async function vip() {
    loading(); let d, R, st; try { [d, R, st] = await Promise.all([call(`/api/loyalty/tiers?store=${LYS}`), ruleData(true), settings()]); } catch (e) { return fail(e); }
    const cnt = Object.fromEntries(d.counts.map((x) => [String(x.tier_id), x.n]));
    W().innerHTML = head("VIP tiers", `<button class="btn xs" onclick="lyTier(null)"><i class="ti ti-plus"></i> Add tier</button>`) + `<div class="lyw">
      ${!st.vip.enabled ? `<div class="lybanner off"><div style="flex:1">VIP tiers are off. Turn them on in Settings.</div></div>` : ""}
      <div class="exc" style="margin-bottom:12px">Members move up by what they spend ${st.vip.period === "lifetime" ? "over their lifetime" : "in the last 12 months"} (change this in Settings). They keep a tier for at least ${st.vip.keep_months || 12} months once they reach it.</div>
      <div class="lytiers">${d.tiers.map((t) => `<div class="lytier"><div style="display:flex;gap:10px;align-items:center"><span style="width:38px;height:38px;border-radius:50%;background:${E(t.color)};color:#fff;display:flex;align-items:center;justify-content:center;font-size:19px"><i class="ti ti-${E(t.icon || "crown")}"></i></span><div style="flex:1"><b style="font-size:16px">${E(t.name)}</b><div class="exc">${t.threshold > 0 ? `Spend ${USD(t.threshold)}` : "Everyone starts here"}</div></div><button class="btn sec xs" onclick="lyTier(${t.id})">Edit</button></div>
        <div style="margin-top:10px;font-size:13.5px">${t.earn_mult !== 1 ? `<div>⚡ ${t.earn_mult}× ${E(cur(2))} on orders</div>` : ""}${t.entry_points ? `<div>🎁 ${N(t.entry_points)} bonus ${E(cur(2))} when reached</div>` : ""}${(t.perks || []).map((p) => `<div>✓ ${E(p)}</div>`).join("")}${Object.keys(t.rule_overrides || {}).length ? `<div class="exc">${Object.keys(t.rule_overrides).length} rule change(s)</div>` : ""}</div>
        <div class="exc" style="margin-top:10px">${N(cnt[String(t.id)] || 0)} members</div></div>`).join("")}</div></div>`;
  }
  window.lyTier = async (id) => {
    const R = await ruleData(); const d = await call(`/api/loyalty/tiers?store=${LYS}`); const t = id ? d.tiers.find((x) => x.id == id) : { name: "", threshold: 0, color: "#242F3F", icon: "crown", earn_mult: 1, entry_points: 0, perks: [], rule_overrides: {} };
    const ov = t.rule_overrides || {};
    const ruleRow = (r) => { const o = ov[r.id] || {}; const isOrder = r.type === "order"; const base = isOrder ? r.config.per_dollar : r.kind === "redeem" ? r.config.points : r.config.points;
      return `<tr><td>${E(r.title)}<div class="exc">${r.kind === "earn" ? "earn" : "reward"} · base ${N(base)}${isOrder ? " per $1" : ""}</div></td><td><label class="rvck"><input type="checkbox" data-ov="${r.id}" data-f="on" ${o.off ? "" : "checked"}> Available</label></td><td><input type="number" data-ov="${r.id}" data-f="points" value="${E(o.points == null ? "" : o.points)}" placeholder="same" style="width:90px;border:1px solid var(--line);border-radius:6px;padding:4px 6px"></td></tr>`; };
    modal(`<h3>${id ? "Edit tier" : "New tier"}</h3><div class="lyg"><div class="lyf"><label>Name</label><input type="text" id="lyTN" value="${E(t.name)}"></div><div class="lyf"><label>Spend to reach ($)</label><input type="number" id="lyTT" value="${E(t.threshold)}"></div></div>
      <div class="lyg3"><div class="lyf"><label>Color</label><div class="lyc"><input type="color" id="lyTC" value="${E(t.color)}"><input type="text" value="${E(t.color)}" oninput="$('lyTC').value=this.value"></div></div><div class="lyf"><label>Icon</label><select id="lyTI">${["plant", "flower", "crown", "star", "diamond", "heart", "trophy", "sparkles", "award"].map((x) => `<option ${t.icon === x ? "selected" : ""}>${x}</option>`).join("")}</select></div><div class="lyf"><label>Points on orders ×</label><input type="number" step="0.05" id="lyTM" value="${E(t.earn_mult)}"></div></div>
      <div class="lyf"><label>Bonus ${E(cur(2))} when they reach it</label><input type="number" id="lyTE" value="${E(t.entry_points)}"></div>
      <div class="lyf"><label>Perks shown to customers (one per line; you handle these yourself)</label><textarea id="lyTP" rows="3">${E((t.perks || []).join("\n"))}</textarea></div>
      <div class="rvsh" style="margin-top:16px">Ways to earn and rewards for this tier</div><div class="lyhint">Turn a rule off for this tier, or set a different amount (${E(cur(2))}, or ${E(cur(2))} per $1 for orders; for rewards, what it costs).</div>
      <div style="max-height:240px;overflow:auto;margin-top:6px"><table class="lytbl"><tbody>${[...R.earn, ...R.redeem].filter((r) => r.type !== "join" && r.type !== "convert").map(ruleRow).join("")}</tbody></table></div>
      <div class="lyfoot">${id ? `<button class="btn sec" style="margin-right:auto;color:#B42318" onclick="if(confirm('Delete this tier? Its members move to their spend tier.'))lyTierDel(${id})">Delete</button>` : ""}<button class="btn sec" onclick="lyClose()">Cancel</button><button class="btn" onclick="lyTierSave(${id || "null"},this)">Save</button></div>`);
  };
  window.lyTierSave = async (id, b) => {
    const ov = {}; document.querySelectorAll(".lymodal [data-ov]").forEach((x) => { const k = x.dataset.ov; ov[k] = ov[k] || {}; if (x.dataset.f === "on") { if (!x.checked) ov[k].off = true; } else if (x.value !== "") ov[k].points = Number(x.value); });
    Object.keys(ov).forEach((k) => { if (!Object.keys(ov[k]).length) delete ov[k]; });
    b.disabled = true;
    try { await post("/api/loyalty/tiers", { store: LYS, id, name: $("lyTN").value, threshold: Number($("lyTT").value), color: $("lyTC").value, icon: $("lyTI").value, earn_mult: Number($("lyTM").value), entry_points: Number($("lyTE").value), perks: $("lyTP").value.split("\n"), rule_overrides: ov }); RULES = null; closeModal(); toast("Saved"); vip(); }
    catch (e) { toast(e.message, true); b.disabled = false; }
  };
  window.lyTierDel = async (id) => { try { await call(`/api/loyalty/tiers/${id}`, { method: "DELETE" }); closeModal(); vip(); } catch (e) { toast(e.message, true); } };

  /* ---------- Referrals ---------- */
  async function referrals() {
    loading(); let st, rows; try { st = await settings(true); rows = (await call(`/api/loyalty/referrals?store=${LYS}`)).rows; } catch (e) { return fail(e); }
    const R = st.referrals, f = R.friend, a = R.advocate;
    const sel = (id, v, opts) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${k}" ${String(v) === String(k) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    W().innerHTML = head("Referrals") + `<div class="lyw"><div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px">
      <div class="ocard"><div class="och">How referrals work</div><label class="rvck"><input type="checkbox" id="lyRfOn" ${R.enabled ? "checked" : ""}> Referrals on</label>
        <div class="rvsh" style="margin-top:12px">The friend gets</div><div class="lyg3"><div class="lyf"><label>Type</label>${sel("lyRfFT", f.type, [["amount", "$ off"], ["percent", "% off"], ["shipping", "Free shipping"]])}</div><div class="lyf"><label>Value</label><input type="number" id="lyRfFV" value="${E(f.value)}"></div><div class="lyf"><label>Min order $</label><input type="number" id="lyRfFM" value="${E(f.min)}"></div></div>
        <div class="lyf"><label>Code good for (days)</label><input type="number" id="lyRfFD" value="${E(f.days)}"></div>
        <div class="rvsh" style="margin-top:12px">The member gets (after the friend's first order)</div><div class="lyg"><div class="lyf"><label>Reward</label>${sel("lyRfAK", a.kind, [["points", cur(2)], ["coupon", "A coupon code"]])}</div><div class="lyf"><label>${E(cur(2))}</label><input type="number" id="lyRfAP" value="${E(a.points)}"></div></div>
        <div class="lyg3"><div class="lyf"><label>…or coupon</label>${sel("lyRfCT", a.coupon.type, [["amount", "$ off"], ["percent", "% off"]])}</div><div class="lyf"><label>Value</label><input type="number" id="lyRfCV" value="${E(a.coupon.value)}"></div><div class="lyf"><label>Min order $</label><input type="number" id="lyRfCM" value="${E(a.coupon.min)}"></div></div>
        <div class="lyf"><label>Most referrals per member per month</label><input type="number" id="lyRfL" value="${E(R.monthly_limit)}"></div>
        <div class="lyhint">Friends only get the gift on a first order, can't use their own link, and the member is rewarded once per friend.</div>
        <div class="lyfoot"><button class="btn" onclick="lyRefSave(this)">Save</button></div></div>
      <div class="ocard"><div class="och">Recent referrals</div>${rows.length ? `<table class="lytbl"><thead><tr><th>Member</th><th>Friend</th><th>Status</th><th>When</th></tr></thead><tbody>${rows.map((x) => `<tr class="click" onclick="lyMember(${x.advocate_id})"><td>${E(x.advocate_name || x.advocate_email)}</td><td>${E(x.friend_email)}</td><td>${pill(x.status)}${x.order_name ? `<div class="exc">${E(x.order_name)}</div>` : ""}</td><td>${day(x.created_at)}</td></tr>`).join("")}</tbody></table>` : '<div class="exc">No referrals yet.</div>'}</div></div></div>`;
  }
  window.lyRefSave = async (b) => {
    b.disabled = true;
    try { await post("/api/loyalty/settings", { store: LYS, referrals: { enabled: $("lyRfOn").checked, friend: { type: $("lyRfFT").value, value: Number($("lyRfFV").value), min: Number($("lyRfFM").value), days: Number($("lyRfFD").value) },
      advocate: { kind: $("lyRfAK").value, points: Number($("lyRfAP").value), coupon: { type: $("lyRfCT").value, value: Number($("lyRfCV").value), min: Number($("lyRfCM").value), days: 60 } }, monthly_limit: Number($("lyRfL").value) } }); SET = null; toast("Saved"); referrals(); }
    catch (e) { toast(e.message, true); b.disabled = false; }
  };

  /* ---------- Widget & page (design) ---------- */
  let DD = null, DEV = "d", DV = "guest", DS = "home", DSAVE = null;
  const DPAN = [["colors", "Colors"], ["launcher", "Launcher"], ["text", "Words"], ["page", "Rewards page"], ["css", "Custom CSS"]];
  let DP = "colors";
  async function design() {
    loading(); let st; try { st = await settings(true); } catch (e) { return fail(e); }
    DD = JSON.parse(JSON.stringify(st.design_draft || st.design || {}));
    const changed = JSON.stringify(st.design_draft || null) !== JSON.stringify(st.design || null);
    W().innerHTML = head("Widget & page", `<span class="exc" id="lyDSv">${changed ? "Unpublished changes" : st.design ? "Published" : "Original look"}</span><a class="btn sec xs" target="_blank" rel="noopener" href="${E(st.shop)}${E(st.page_path || "/")}?bz_rewards=1&bz_rewards_design=draft"><i class="ti ti-external-link"></i> Preview on site</a><button class="btn xs" onclick="lyDPub(this)">Publish</button>`) +
      `<div class="lyw"><div class="lydes"><div class="side"><div class="lyseg" style="margin:12px 0;flex-wrap:wrap">${DPAN.map(([k, l]) => `<button class="${DP === k ? "on" : ""}" onclick="lyDP('${k}')">${l}</button>`).join("")}</div><div id="lyDF"></div></div>
        <div><div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap"><span class="lyseg">${[["d", "Desktop"], ["m", "Mobile"]].map(([k, l]) => `<button class="${DEV === k ? "on" : ""}" onclick="lyDDev('${k}')">${l}</button>`).join("")}</span>
          <span class="lyseg">${[["guest", "Signed out"], ["pending", "Not joined"], ["member", "Member"]].map(([k, l]) => `<button class="${DV === k ? "on" : ""}" onclick="lyDV('${k}')">${l}</button>`).join("")}</span>
          <select onchange="lyDS(this.value)" style="border:1px solid var(--line);border-radius:8px;padding:5px 8px">${[["home", "Panel: home"], ["earn", "Panel: ways to earn"], ["redeem", "Panel: rewards"], ["tiers", "Panel: VIP tiers"], ["refer", "Panel: refer"], ["rewards", "Panel: my rewards"]].map(([k, l]) => `<option value="${k}" ${DS === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="pv"><iframe id="lyDFr" title="Preview" style="width:${DEV === "m" ? 390 : 1200}px"></iframe></div></div></div></div>`;
    fields(); frame();
  }
  const gget = (p) => p.split(".").reduce((o, k) => (o == null ? o : o[k]), DD);
  const gset = (p, v) => { const ks = p.split("."); let o = DD; ks.slice(0, -1).forEach((k) => { if (o[k] == null || typeof o[k] !== "object") o[k] = {}; o = o[k]; }); o[ks[ks.length - 1]] = v; };
  function fields() {
    const DEF = { colors: { primary: "#242F3F", header_bg: "#242F3F", header_bg2: "#46597A", header_text: "#FFFFFF", text: "#242F3F", muted: "#6B7280", bg: "#F6F4F1", card: "#FFFFFF", border: "#ECEAE5", button_bg: "#242F3F", button_text: "#FFFFFF", icon_bg: "#F3E4E8", icon: "#242F3F", accent: "#E3A6B4", success: "#1D7A46" } };
    const col = (p, l) => { const v = gget(p) || p.split(".").reduce((o, k) => (o || {})[k], DEF) || ""; return `<div class="lyf"><label>${l}</label><div class="lyc"><input type="color" data-p="${p}" value="${/^#[0-9a-f]{6}$/i.test(v) ? v : "#ffffff"}"><input type="text" data-p="${p}" value="${E(gget(p) || "")}" placeholder="${E(v)}"></div></div>`; };
    const txt = (p, l, ph) => `<div class="lyf"><label>${l}</label><input type="text" data-p="${p}" value="${E(gget(p) || "")}" placeholder="${E(ph || "")}"></div>`;
    const num = (p, l, ph) => `<div class="lyf"><label>${l}</label><input type="number" data-p="${p}" value="${E(gget(p) == null ? "" : gget(p))}" placeholder="${E(ph || "")}"></div>`;
    const chk = (p, l, def) => `<label class="rvck" style="margin-top:8px"><input type="checkbox" data-p="${p}" data-b="1" ${(gget(p) == null ? def : gget(p)) ? "checked" : ""}> ${l}</label>`;
    const sel = (p, l, opts, def) => `<div class="lyf"><label>${l}</label><select data-p="${p}">${opts.map(([k, x]) => `<option value="${k}" ${String(gget(p) == null ? def : gget(p)) === String(k) ? "selected" : ""}>${x}</option>`).join("")}</select></div>`;
    let h = "";
    if (DP === "colors") h = `<div class="lyg">${col("colors.header_bg", "Header")}${col("colors.header_bg2", "Header (gradient end)")}</div><div class="lyg">${col("colors.header_text", "Header text")}${col("colors.text", "Text")}</div><div class="lyg">${col("colors.muted", "Light text")}${col("colors.bg", "Panel background")}</div>
      <div class="lyg">${col("colors.card", "Cards")}${col("colors.border", "Lines")}</div><div class="lyg">${col("colors.button_bg", "Buttons")}${col("colors.button_text", "Button text")}</div><div class="lyg">${col("colors.icon_bg", "Icon circles")}${col("colors.icon", "Icons")}</div><div class="lyg">${col("colors.accent", "Tier progress bar")}${col("colors.success", "Checkmarks")}</div>
      <div class="lyg">${num("radius", "Panel corners", "16")}${num("button_radius", "Button corners", "10")}</div>${sel("font", "Font", [["inherit", "Same as the store"], ["Helvetica, Arial, sans-serif", "Helvetica"], ["Georgia, serif", "Georgia"]], "inherit")}`;
    if (DP === "launcher") h = `${sel("launcher.position", "Side of the screen", [["left", "Bottom left"], ["right", "Bottom right"]], "left")}<div class="lyhint">Your chat bubble is on the right, so left keeps them apart.</div>${txt("launcher.text", "Label", "Rewards")}${chk("launcher.show_text", "Show the label", true)}${chk("launcher.mobile_text", "Show the label on phones", false)}${chk("launcher.hide_mobile", "Hide the launcher on phones", false)}
      ${sel("launcher.icon", "Icon", [["gift", "Gift"], ["star", "Star"], ["crown", "Crown"], ["heart", "Heart"]], "gift")}<div class="lyg">${col("launcher.bg", "Launcher color")}${col("launcher.color", "Launcher text")}</div><div class="lyg">${num("launcher.offset_x", "Distance from side (px)", "20")}${num("launcher.offset_y", "Distance from bottom (px)", "20")}</div>`;
    if (DP === "text") h = [["welcome", "Small line above the name", "Welcome to"], ["guest_title", "Card title (signed out)", "Become a member"], ["guest_body", "Card text (signed out)", ""], ["join", "Join button", "Join now"], ["signin", "Sign-in link", "Already a member? Sign in"], ["pending", "Not joined yet ({points} {currency})", ""], ["hi", "Member greeting ({name})", "Hi {name}"], ["balance", "Balance label", "Your balance"], ["earn", "Ways to earn", "Ways to earn"], ["redeem", "Ways to redeem", "Ways to redeem"], ["tiers", "VIP tiers", "VIP tiers"], ["refer", "Refer friends", "Refer friends"], ["refer_body", "Referral text ({friend}, {advocate})", ""], ["rewards", "Your rewards", "Your rewards"], ["activity", "History", "Points history"], ["next_tier", "Next tier ({amount}, {tier})", ""], ["top_tier", "Top tier", ""], ["redeem_btn", "Redeem button", "Redeem"], ["apply", "Apply to cart link", "Apply to cart"]].map(([k, l, ph]) => txt("text." + k, l, ph)).join("");
    if (DP === "page") h = `<div class="lyhint">Add a page in Shopify (Online Store → Pages) at <b>${E((SET || {}).page_path || "/pages/rewards")}</b> and put <code>&lt;div data-bz-rewards-page&gt;&lt;/div&gt;</code> in it. Buzzin fills it in.</div>${txt("page.hero_title", "Big title", "Rewards for every little moment")}<div class="lyf"><label>Text under it</label><textarea data-p="page.hero_sub" rows="3" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px">${E(gget("page.hero_sub") || "")}</textarea></div>
      ${txt("page.hero_image", "Background photo URL (optional)", "https://…")}<div class="lyg">${col("page.hero_bg", "Top color")}${col("page.hero_text", "Top text")}</div>
      ${chk("page.show_how", "How it works", true)}${chk("page.show_earn", "Ways to earn", true)}${chk("page.show_redeem", "Rewards", true)}${chk("page.show_tiers", "VIP tier table", true)}${chk("page.show_refer", "Refer a friend", true)}${chk("page.show_faq", "Questions", true)}
      <div class="lyf"><label>Questions (one per line: question | answer)</label><textarea id="lyFaq" rows="6" style="width:100%;border:1px solid var(--line);border-radius:8px;padding:8px;font-size:13px">${E(((gget("page.faq") || [{ q: "How do I join?", a: "Create an account or sign in, then click Join now. It's free." }, { q: "How do I use my points?", a: "Open Rewards, pick a reward and click Redeem. You'll get a code to use at checkout." }, { q: "Do points expire?", a: "Points expire after 12 months without any activity on your account." }]).map((x) => `${x.q} | ${x.a}`).join("\n")))}</textarea></div>`;
    if (DP === "css") h = `<div class="lyf"><label>Custom CSS (panel is .bzl-p, page is .bzlp)</label><textarea data-p="custom_css" rows="14" style="width:100%;font:12px ui-monospace,Menlo,monospace;border:1px solid var(--line);border-radius:8px;padding:8px">${E(gget("custom_css") || "")}</textarea></div>`;
    $("lyDF").innerHTML = h + `<div style="margin-top:16px"><button class="btn sec xs" onclick="if(confirm('Put the original look back? You can still undo by not publishing.')){lyDReset()}">Reset to original</button></div>`;
    $("lyDF").querySelectorAll("[data-p]").forEach((x) => x.addEventListener(x.type === "checkbox" || x.tagName === "SELECT" || x.type === "color" ? "change" : "input", () => {
      let v = x.dataset.b ? x.checked : x.type === "number" ? (x.value === "" ? null : Number(x.value)) : x.value;
      gset(x.dataset.p, v === "" ? null : v);
      if (x.type === "color") { const t = $("lyDF").querySelector(`input[type=text][data-p="${x.dataset.p}"]`); if (t) t.value = v; }
      changed();
    }));
    const fq = $("lyFaq"); if (fq) fq.addEventListener("input", () => { gset("page.faq", fq.value.split("\n").map((l) => l.split("|")).filter((p) => p[0] && p[0].trim()).map((p) => ({ q: p[0].trim(), a: (p.slice(1).join("|") || "").trim() }))); changed(); });
  }
  function changed() { push(); $("lyDSv").textContent = "Saving…"; clearTimeout(DSAVE); DSAVE = setTimeout(async () => { try { await post("/api/loyalty/settings", { store: LYS, design_draft: DD }); $("lyDSv").textContent = "Unpublished changes"; } catch (e) { $("lyDSv").textContent = "Not saved"; toast(e.message, true); } }, 800); }
  async function frame() {
    const st = await settings(); let mem = null; try { mem = (await call(`/api/loyalty/preview-member?store=${LYS}`)).member; } catch (e) {}
    const o = location.origin; const f = $("lyDFr"); if (!f) return;
    f.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:15px -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#242F3F;background:#fff}.nav{height:56px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:center;font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:13px}</style></head>
      <body><div class="nav">${E(SN[LYS])}</div><div data-bz-rewards-page></div>
      <script>window.BZL=${JSON.stringify({ store: LYS, origin: o, live: true, shop: st.shop, studio: 1, open: true, member: mem }).replace(/</g, "\\u003c")};window.BZL.design=${JSON.stringify(DD).replace(/</g, "\\u003c")};<\/script><script src="${o}/bz-loyalty.js?v=${Date.now()}"><\/script></body></html>`;
    f.onload = () => setTimeout(() => { push(); post0({ bzlView: DV, bzlScreen: DS }); }, 400);
  }
  const post0 = (m) => { const f = $("lyDFr"); if (f && f.contentWindow) f.contentWindow.postMessage(m, "*"); };
  let pushT = null; function push() { clearTimeout(pushT); pushT = setTimeout(() => post0({ bzlDesign: JSON.parse(JSON.stringify(DD)) }), 60); }
  window.lyDP = (k) => { DP = k; document.querySelectorAll(".lydes .side .lyseg button").forEach((b, i) => b.classList.toggle("on", DPAN[i][0] === k)); fields(); };
  window.lyDDev = (k) => { DEV = k; design(); };
  window.lyDV = (k) => { DV = k; document.querySelectorAll(".lydes .lyseg")[2] && null; post0({ bzlView: k }); document.querySelectorAll('.lydes [onclick^="lyDV"]').forEach((b) => b.classList.toggle("on", b.getAttribute("onclick").includes(`'${k}'`))); };
  window.lyDS = (k) => { DS = k; post0({ bzlScreen: k }); };
  window.lyDReset = () => { DD = {}; fields(); changed(); };
  window.lyDPub = async (b) => { if (!confirm("Publish this look to the store?")) return; b.disabled = true; try { clearTimeout(DSAVE); await post("/api/loyalty/settings", { store: LYS, design_draft: DD, publish_design: true }); SET = null; $("lyDSv").textContent = "Published"; toast("Published"); } catch (e) { toast(e.message, true); } b.disabled = false; };

  /* ---------- Settings ---------- */
  async function setup() {
    loading(); let st; try { st = await settings(true); } catch (e) { return fail(e); }
    const box = (t, inner) => `<div class="ocard"><div class="och">${t}</div>${inner}</div>`;
    W().innerHTML = head("Settings") + `<div class="lyw" style="max-width:900px">
      ${box(st.live ? "Program is live" : "Launch", st.live ? `<div>Live since ${day(st.launched_at)}. Pausing stops earning and spending and hides the widget; balances stay.</div><div class="lyfoot" style="justify-content:flex-start"><button class="btn sec" onclick="lyLive(false)">Pause program</button></div>`
        : `<div>Before launching:</div><ol style="margin:8px 0 0 18px;line-height:1.7"><li>Add the snippet below to your theme (so the widget knows who's signed in).</li><li>Check the widget on your site with <a target="_blank" rel="noopener" href="${E(st.shop)}/?bz_rewards=1">${E(st.shop.replace(/^https?:\/\//, ""))}/?bz_rewards=1</a>.</li><li>Optional: create the rewards page (see Widget &amp; page → Rewards page).</li><li>Turn off any other loyalty or rewards app so customers don't see two.</li></ol>
          <div class="lyfoot" style="justify-content:flex-start"><button class="btn" onclick="lyLive(true)">Launch program</button></div>`)}
      ${box("Program", `<div class="lyg"><div class="lyf"><label>Program name</label><input type="text" id="lySN" value="${E(st.name)}"></div><div class="lyf"><label>Rewards page path</label><input type="text" id="lySPP" value="${E(st.page_path)}"></div></div>
        <div class="lyg"><div class="lyf"><label>Currency name</label><input type="text" id="lySC" value="${E(st.currency)}"></div><div class="lyf"><label>…plural</label><input type="text" id="lySCP" value="${E(st.currency_plural)}"></div></div>`)}
      ${box("Earning", `<div class="lyg"><div class="lyf"><label>Points are based on</label><select id="lySB"><option value="total" ${st.spend_basis !== "subtotal" ? "selected" : ""}>Order total</option><option value="subtotal" ${st.spend_basis === "subtotal" ? "selected" : ""}>Products only (no tax or shipping)</option></select></div><div class="lyf"><label>Count orders from (optional)</label><input type="date" id="lySPS" value="${E((st.program_start || "").slice(0, 10))}"></div></div>
        <label class="rvck" style="margin-top:8px"><input type="checkbox" id="lySAP" ${st.auto_pending ? "checked" : ""}> Customers who haven't joined still collect points from orders (they claim them when they join)</label>
        <div class="lyg"><div class="lyf"><label>Points expire after no activity for (months)</label><input type="number" id="lySEM" value="${E(st.expiry.months)}"><div class="lyhint">0 = never. Members get a "points expiring" event 30 days before, for an email or text.</div></div><div class="lyf"><label>For customers who haven't joined</label><select id="lySEP"><option value="same" ${st.expiry.pending === "same" ? "selected" : ""}>Same as members</option><option value="never" ${st.expiry.pending === "never" ? "selected" : ""}>Never</option><option value="3" ${String(st.expiry.pending) === "3" ? "selected" : ""}>3 months</option><option value="6" ${String(st.expiry.pending) === "6" ? "selected" : ""}>6 months</option></select></div></div>`)}
      ${box("VIP tiers", `<label class="rvck"><input type="checkbox" id="lySV" ${st.vip.enabled ? "checked" : ""}> VIP tiers on</label><div class="lyg"><div class="lyf"><label>Spend measured over</label><select id="lySVP"><option value="rolling" ${st.vip.period !== "lifetime" ? "selected" : ""}>Last 12 months (members can move down)</option><option value="lifetime" ${st.vip.period === "lifetime" ? "selected" : ""}>Lifetime (members never move down)</option></select></div><div class="lyf"><label>Keep a tier at least (months)</label><input type="number" id="lySVK" value="${E(st.vip.keep_months)}"></div></div>
        <div class="lyf"><label>Count spend from (lifetime only, optional)</label><input type="date" id="lySVS" value="${E((st.vip.start || "").slice(0, 10))}"></div>`)}
      ${box("Reward codes", `<div>Can reward codes be combined with other discounts?</div><label class="rvck"><input type="checkbox" id="lySCO" ${st.combine.order ? "checked" : ""}> Order discounts</label><label class="rvck"><input type="checkbox" id="lySCPd" ${st.combine.product ? "checked" : ""}> Product discounts</label><label class="rvck"><input type="checkbox" id="lySCS" ${st.combine.shipping ? "checked" : ""}> Shipping discounts</label>
        <label class="rvck" style="margin-top:10px"><input type="checkbox" id="lySR" ${st.restrict_to_redeemer ? "checked" : ""}> Only the member who redeemed a code can use it</label>`)}
      ${box("Who can't join", `<div class="lyf"><label>Shopify customer tags (comma-separated)</label><input type="text" id="lySBL" value="${E((st.blocklist_tags || []).join(", "))}"></div>`)}
      <div class="lyfoot" style="justify-content:flex-start;margin-bottom:16px"><button class="btn" onclick="lySave(this)">Save settings</button></div>
      ${box("Theme snippet", `<div>Paste this into your theme's <b>theme.liquid</b>, right before <code>&lt;/body&gt;</code>. It tells the widget who's signed in, signed with a secret so nobody can see or spend another customer's points. The widget itself loads with the Buzzin script that's already on your store.</div>
        <textarea readonly rows="6" style="width:100%;margin-top:10px;font:12px ui-monospace,Menlo,monospace;border:1px solid var(--line);border-radius:8px;padding:8px" onclick="this.select()">${E(st.snippet)}</textarea>
        <div class="lyfoot" style="justify-content:flex-start"><button class="btn sec xs" onclick="navigator.clipboard.writeText(this.closest('.ocard').querySelector('textarea').value);toast('Copied')">Copy</button><button class="btn sec xs" onclick="if(confirm('Make a new secret? The snippet in your theme must be replaced right after.'))lyRotate()">New secret</button></div>`)}
      ${box("Emails & texts", `<div>Rewards sends these to Marketing, so any flow can start from them: <b>Joined rewards</b>, <b>Earned reward points</b>, <b>Redeemed a reward</b>, <b>Changed VIP tier</b>, <b>Reward points expiring soon</b>, <b>Got a referral reward</b>. In emails and texts use <code>{{ loyalty_points }}</code>, <code>{{ loyalty_tier }}</code>, <code>{{ loyalty_next_tier }}</code>, <code>{{ loyalty_spend_to_next_tier }}</code> and <code>{{ loyalty_referral_url }}</code>.</div><div class="lyfoot" style="justify-content:flex-start"><a class="btn sec xs" href="/marketing#flows" target="_blank" rel="noopener">Open Flows</a></div>`)}
    </div>`;
  }
  window.lyLive = async (on) => { if (on && !confirm(`Launch rewards on ${SN[LYS]}? Customers start earning on new orders and the widget shows on every page.`)) return; if (!on && !confirm("Pause the program?")) return; try { await post("/api/loyalty/settings", { store: LYS, live: on }); SET = null; toast(on ? "Launched" : "Paused"); setup(); } catch (e) { toast(e.message, true); } };
  window.lyRotate = async () => { try { await post("/api/loyalty/settings", { store: LYS, rotate_secret: true }); SET = null; setup(); toast("New secret made. Update the theme snippet."); } catch (e) { toast(e.message, true); } };
  window.lySave = async (b) => {
    b.disabled = true;
    try { await post("/api/loyalty/settings", { store: LYS, name: $("lySN").value, page_path: $("lySPP").value, currency: $("lySC").value, currency_plural: $("lySCP").value, spend_basis: $("lySB").value, program_start: $("lySPS").value || null, auto_pending: $("lySAP").checked,
      expiry: { months: Number($("lySEM").value), pending: $("lySEP").value }, vip: { enabled: $("lySV").checked, period: $("lySVP").value, keep_months: Number($("lySVK").value), start: $("lySVS").value || null },
      combine: { order: $("lySCO").checked, product: $("lySCPd").checked, shipping: $("lySCS").checked }, restrict_to_redeemer: $("lySR").checked, blocklist_tags: $("lySBL").value }); SET = null; toast("Saved"); }
    catch (e) { toast(e.message, true); } b.disabled = false;
  };

  /* ---------- router ---------- */
  window.lyLoad = function () {
    tabs(); $("showing").textContent = "";
    ({ ly_home: overview, ly_members: members, ly_activity: activity, ly_earn: () => ruleList("earn"), ly_redeem: () => ruleList("redeem"), ly_vip: vip, ly_referrals: referrals, ly_design: design, ly_setup: setup }[VIEW] || overview)();
  };
})();
