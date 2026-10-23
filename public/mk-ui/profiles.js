/* Buzzin Marketing · Profiles, laid out like Klaviyo.
   List: totals (all / active / suppressed), one search box, a plain table (profile, email, phone, created, updated, location).
   Profile page: breadcrumb + Profile actions, tabs (Details · Metrics and insights · Lists and segments · Tickets · Messages)
   on the left, the activity timeline (event filter + dates, expandable rows) on the right. */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const pr = S.find((x) => x.id === 'profiles'); if (pr) pr.render = (el, id) => (id ? renderProfile(el, id) : renderList(el));
});

const I = (n) => `<i class="ti ti-${n}"></i>`;
const CSS = `<style>
.kp{background:#fff;border:1px solid var(--line);border-radius:14px;min-height:calc(100vh - 120px)}
.kp-h{display:flex;align-items:center;gap:10px;padding:16px 24px;border-bottom:1px solid var(--line)}.kp-h h1{margin:0;font-size:19px;font-weight:700;flex:1}
.kp-b{padding:22px 24px}
.kp .btn{border-radius:8px;font-weight:500;padding:8px 14px}.kp .btn.pri{background:#18181B;border-color:#18181B}
.kp-stats{display:flex;gap:56px;align-items:stretch;margin:4px 0 30px;flex-wrap:wrap}
.kp-stat .l{font-weight:600;font-size:15px;margin-bottom:10px}.kp-stat .row{display:flex;gap:56px}
.kp-stat .v{font-size:28px;font-weight:500;font-variant-numeric:tabular-nums;line-height:1.1}
.kp-stat a{display:inline-block;margin-top:6px;color:#18181B;text-decoration:none;border-bottom:1.5px dotted #18181B;cursor:pointer;font-size:15px}
.kp-stat a.on{font-weight:700;border-bottom-style:solid}
.kp-div{width:1px;background:var(--line)}
.kp-lab{font-size:14px;margin:0 0 8px;color:#3F3F46}
.kp-search{position:relative;max-width:460px;margin-bottom:22px}.kp-search i{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#71717A;font-size:16px}
.kp-search input{width:100%;padding:10px 12px 10px 36px;border-radius:8px;font-size:14px}
.kp table{width:100%;border-collapse:collapse}.kp th{font-weight:500;text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);color:#3F3F46;font-size:14px;white-space:nowrap}
.kp td{padding:16px 14px;border-bottom:1px solid var(--line);vertical-align:middle;font-size:14px}.kp tr.row{cursor:pointer}.kp tr.row:hover td{background:#FAFAFA}
.kp a.nm{color:#2563EB;text-decoration:none;font-weight:500}.kp a.nm:hover{text-decoration:underline}
.kp .chip{display:inline-flex;align-items:center;gap:6px;background:#F4F4F5;border-radius:999px;padding:5px 8px 5px 12px;font-size:13px;margin:0 0 16px}.kp .chip button{all:unset;cursor:pointer;display:inline-flex;color:#52525B}
.kp .pager{display:flex;align-items:center;gap:8px;justify-content:flex-end;padding:14px 0 0;color:#52525B}
/* profile page */
.kq{background:#fff;border:1px solid var(--line);border-radius:14px;min-height:calc(100vh - 120px)}
.kq-top{padding:18px 24px 0;display:flex;gap:12px;align-items:flex-start}
.kq-crumb{font-size:19px;font-weight:600;margin:0}.kq-crumb a{color:#3F3F46;text-decoration:none;font-weight:500}.kq-crumb a:hover{text-decoration:underline}.kq-crumb .sl{color:#71717A;margin:0 8px;font-weight:400}
.kq-meta{color:#3F3F46;font-size:14.5px;margin-top:6px}
.kq-tabs{display:flex;gap:6px;padding:0 24px;border-bottom:1px solid var(--line);margin-top:12px;overflow-x:auto}
.kq-tabs button{all:unset;cursor:pointer;padding:12px 10px 11px;font-size:15px;color:#3F3F46;border-bottom:2.5px solid transparent;white-space:nowrap}
.kq-tabs button.on{color:#18181B;font-weight:600;border-bottom-color:#18181B}
.kq-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;padding:28px 24px}
@media (max-width:1100px){.kq-cols{grid-template-columns:1fr;gap:28px}}
.kq-card{border:1px solid var(--line);border-radius:16px;padding:26px 28px;margin-bottom:28px}
.kq-card h2{font-size:21px;font-weight:600;margin:0}.kq-card .ch{display:flex;align-items:center;gap:12px;margin-bottom:22px}.kq-card .ch .s2{color:#52525B;font-size:15px;margin-top:4px}
.kq-cs{border-bottom:1px solid var(--line)}.kq-cs:last-child{border-bottom:0}
.kq-cs .r{display:flex;align-items:center;gap:12px;padding:20px 0;cursor:pointer}.kq-cs .r .lb{font-size:16px}
.kq-cs .r>i{color:#18181B;font-size:16px;transition:transform .15s}.kq-cs.open .r>i{transform:rotate(180deg)}
.kq-cs .hist{display:none;padding:0 0 18px 28px}.kq-cs.open .hist{display:block}
.kq-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 12px 4px 8px;font-size:14.5px}
.kq-pill i{font-size:16px}.kq-pill.ok{background:#E8F5EC;color:#15803D}.kq-pill.ok span{color:#14532D}.kq-pill.bad{background:#FDECEC;color:#B91C1C}.kq-pill.off{background:#F4F4F5;color:#52525B}
.kq .dots{all:unset;cursor:pointer;width:34px;height:34px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:19px;margin-left:auto}.kq .dots:hover{background:#F4F4F5}
.kq table{width:100%;border-collapse:collapse}.kq th{font-weight:500;text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);color:#3F3F46;font-size:14.5px}
.kq td{padding:16px 14px;border-bottom:1px solid var(--line);font-size:14.5px;vertical-align:middle}.kq tr:last-child td{border-bottom:0}
.kq a.lk{color:#2563EB;text-decoration:none;cursor:pointer}.kq a.lk:hover{text-decoration:underline}
.kq .used{display:inline-block;background:#F4F4F5;border-radius:999px;padding:3px 12px}
.kq .fl{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;align-items:flex-end}.kq .fl label{display:flex;flex-direction:column;gap:6px;font-size:14px;color:#3F3F46}
.kq .fl input,.kq .fl select{height:40px;border-radius:8px;font-size:14px;min-width:150px}
.kq .clr{color:#2563EB;cursor:pointer;align-self:center;font-size:15px}
.kq-seg{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-left:auto}.kq-seg button{all:unset;cursor:pointer;padding:9px 20px;font-size:15px}.kq-seg button.on{background:#F4F4F5}
.kq-hl{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:6px 0 30px}.kq-hl div{border:1px solid var(--line2);border-radius:14px;padding:20px}
.kq-hl b{display:block;font-size:34px;font-weight:500;line-height:1.1}.kq-hl span{display:block;font-size:17px;color:#3F3F46;margin-top:8px}
.kq-src{display:inline-flex;align-items:center;gap:5px;background:#F4F4F5;border-radius:999px;padding:3px 10px;font-size:13px;margin-top:10px}
/* timeline */
.kq-tf{display:flex;flex-direction:column;gap:14px;margin-bottom:26px}.kq-tf select{height:46px;border-radius:8px;font-size:16px;width:100%}
.kq-tf .dt{display:flex;gap:10px}.kq-tf .dt input{height:38px;border-radius:8px;width:230px;max-width:48%}
.kq-ev{display:grid;grid-template-columns:28px 34px 1fr 40px;gap:0 8px;align-items:start;position:relative;padding-bottom:22px}
.kq-ev:before{content:"";position:absolute;left:13px;top:30px;bottom:2px;border-left:1.5px solid #D4D4D8}.kq-ev:last-child:before{display:none}
.kq-ev .tg{all:unset;cursor:pointer;display:flex;align-items:center;justify-content:center;height:28px;font-size:17px;color:#3F3F46}.kq-ev.open .tg i{transform:rotate(180deg)}
.kq-ev .ic{height:28px;display:flex;align-items:center;font-size:20px}.kq-ev .ic .shop{color:#5E8E3E}
.kq-ev .tt{font-size:17px;font-weight:600;line-height:28px}.kq-ev .tm{color:#3F3F46;font-size:15px;margin-top:6px}
.kq-ev .pp{display:none;grid-column:3/5;margin-top:10px;background:#FAFAFA;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13px}.kq-ev.open .pp{display:block}
.kq-ev .pp div{display:grid;grid-template-columns:140px 1fr;gap:10px;padding:3px 0}.kq-ev .pp div span:first-child{color:#71717A}
.kq-empty{text-align:center;color:#52525B;padding:50px 20px}.kq-empty b{display:block;color:#18181B;font-size:20px;margin-bottom:6px}
.kq-modal{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:80;display:flex;align-items:center;justify-content:center;padding:16px}
.kq-modal .bx{background:#fff;border-radius:14px;width:min(460px,100%);padding:22px 24px}.kq-modal h3{margin:0 0 14px;font-size:18px}
.kq-modal label{display:block;font-size:13px;color:#3F3F46;margin:12px 0 6px}.kq-modal input,.kq-modal select{width:100%;height:40px;border-radius:8px}
.kq-modal .ft{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
</style>`;

/* ---------- formatting ---------- */
const fullDT = (d) => { if (!d) return '—'; const x = new Date(d); return `${x.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} at ${x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`; };
const shortDT = (d) => { if (!d) return '—'; const x = new Date(d); return `${x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`; };
const shortD = (d) => { if (!d) return '—'; const x = new Date(d); return `${x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`; };
const phoneF = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length === 11 && d[0] === '1' ? `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}` : (p || ''); };
const loc = (p, zip) => [p.city, p.region, [p.country, zip ? p.zip : ''].filter(Boolean).join(' ')].filter(Boolean).join(', ');
const nameOf = (p) => [p.first_name, p.last_name].filter(Boolean).join(' ');
const money = (v) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/* ---------- list ---------- */
async function renderList(el) {
  if (typeof PQ === 'undefined' || !PQ) window.PQ = { q: '', consent: '', list: '', offset: 0 };
  const st = await api('/api/mk/profiles-stats').catch(() => ({}));
  const lists = PQ.list ? (await api('/api/mk/lists').catch(() => ({ lists: [] }))).lists : [];
  const listName = PQ.list ? ((await api('/api/mk/groups').catch(() => ({ items: [] }))).items.find((x) => x.kind === 'list' && String(x.id) === String(PQ.list)) || lists.find((l) => String(l.id) === String(PQ.list)) || {}).name || `List #${PQ.list}` : '';
  const on = (c) => (PQ.consent || '') === c ? ' on' : '';
  el.innerHTML = CSS + `<div class="kp"><div class="kp-h"><h1>Profiles</h1>
      <a class="btn" href="#overview">View subscriber growth</a><button class="btn pri" id="ksup">View suppressed profiles</button></div>
    <div class="kp-b">
      <div class="kp-stats">
        <div class="kp-stat"><div class="l">Total profiles</div><div class="v">${fmtN(st.total)}</div><a class="${on('').trim()}" data-c="">All profiles</a></div>
        <div class="kp-div"></div>
        <div class="kp-stat"><div class="l">Email profile counts</div><div class="row">
          <div><div class="v">${fmtN(st.active)}</div><a class="${on('email').trim()}" data-c="email">Active</a></div>
          <div><div class="v">${fmtN(st.suppressed)}</div><a class="${on('suppressed').trim()}" data-c="suppressed">Suppressed</a></div></div></div>
        <div class="kp-stat"><div class="l">Text profile counts</div><div class="v">${fmtN(st.sms)}</div><a class="${on('sms').trim()}" data-c="sms">Subscribed to texts</a></div>
      </div>
      ${PQ.list ? `<div class="chip">${I('list')} In list: <b>${esc(listName)}</b><button id="klx" aria-label="Show everyone">${I('x')}</button></div>` : ''}
      <p class="kp-lab">Search</p>
      <div class="kp-search">${I('search')}<input type="search" id="kq" placeholder="By name, email, or exact phone number" value="${esc(PQ.q || '')}" aria-label="Search profiles"></div>
      <div class="tw"><table><thead><tr><th>Profile</th><th>Email</th><th>Phone</th><th>${PQ.list ? 'Added to list' : 'Profile created'}</th><th>Profile updated</th><th>Location</th></tr></thead><tbody id="ktb"><tr><td colspan="6" style="color:#71717A">Loading…</td></tr></tbody></table></div>
      <div class="pager"><span id="kpn"></span><button class="btn xs" id="kpp">Previous</button><button class="btn xs" id="kpx">Next</button></div>
    </div></div>`;
  const load = async () => {
    const r = await api('/api/mk/profiles?' + qs({ q: PQ.q || '', consent: PQ.consent || '', list: PQ.list || '', sort: 'newest', offset: PQ.offset || 0, limit: 50 }));
    $('ktb').innerHTML = r.rows.map((p) => `<tr class="row" data-id="${p.id}"><td><a class="nm" href="#profiles/${p.id}">${esc(nameOf(p) || p.email || phoneF(p.phone) || 'Profile ' + p.id)}</a></td>
      <td>${esc(p.email || '')}</td><td style="white-space:nowrap">${esc(phoneF(p.phone))}</td><td style="white-space:nowrap">${fullDT(PQ.list ? p.added_at : p.created_at)}</td><td style="white-space:nowrap">${fullDT(p.updated_at)}</td><td>${esc(loc(p, true))}</td></tr>`).join('')
      || '<tr><td colspan="6" style="color:#71717A;padding:30px 14px">No profiles match.</td></tr>';
    $('kpn').textContent = r.total ? `${fmtN((PQ.offset || 0) + 1)}–${fmtN(Math.min((PQ.offset || 0) + 50, r.total))} of ${fmtN(r.total)}` : '';
    $('kpp').disabled = (PQ.offset || 0) <= 0; $('kpx').disabled = (PQ.offset || 0) + 50 >= r.total;
    el.querySelectorAll('tr.row').forEach((tr) => tr.onclick = (e) => { if (e.target.closest('a')) return; location.hash = '#profiles/' + tr.dataset.id; });
  };
  let t; $('kq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { PQ.q = e.target.value.trim(); PQ.offset = 0; load(); }, 300); };
  el.querySelectorAll('[data-c]').forEach((a) => a.onclick = () => { PQ.consent = a.dataset.c; PQ.offset = 0; renderList(el); });
  $('ksup').onclick = () => { PQ.consent = PQ.consent === 'suppressed' ? '' : 'suppressed'; PQ.offset = 0; renderList(el); };
  if ($('klx')) $('klx').onclick = () => { PQ.list = ''; PQ.offset = 0; renderList(el); };
  $('kpp').onclick = () => { PQ.offset = Math.max(0, (PQ.offset || 0) - 50); load(); };
  $('kpx').onclick = () => { PQ.offset = (PQ.offset || 0) + 50; load(); };
  await load();
}

/* ---------- profile page ---------- */
let TAB = 'details';
const EV = {
  placed_order: (e) => `Placed order for "${money(e.value)}"`, fulfilled_order: () => 'Fulfilled order', delivered_order: () => 'Delivered shipment', refunded_order: () => 'Refunded order', cancelled_order: () => 'Cancelled order',
  viewed_product: (e) => `Viewed product${e.props && (e.props.name || e.props.title) ? ` "${e.props.name || e.props.title}"` : ''}`, viewed_collection: () => 'Viewed collection', viewed_page: () => 'Active on site',
  added_to_cart: (e) => `Added to cart${e.props && (e.props.name || e.props.title) ? ` "${e.props.name || e.props.title}"` : ''}`, started_checkout: () => 'Checkout started',
  submitted_form: (e) => `Submitted form${e.props && e.props.form ? ` "${e.props.form}"` : ''}`, joined_list: () => 'Subscribed to list', coupon_used: () => 'Coupon used',
  received_email: (e) => `Received email${e.props && e.props.subject ? ` "${e.props.subject}"` : ''}`, opened_email: (e) => `Opened email${e.props && e.props.subject ? ` "${e.props.subject}"` : ''}`, clicked_email: (e) => `Clicked email${e.props && e.props.subject ? ` "${e.props.subject}"` : ''}`,
  bounced_email: () => 'Bounced email', marked_spam: () => 'Marked email as spam', unsubscribed: () => 'Unsubscribed',
  received_sms: () => 'Received text', clicked_sms: () => 'Clicked text', sent_sms: () => 'Sent text', replied_sms: () => 'Replied to text',
};
const evLabel = (e) => (EV[e.type] ? EV[e.type](e) : e.type.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()));
const evIcon = (e) => /order|checkout|cart|viewed|collection|coupon/.test(e.type) || /shopify/i.test(e.source || '') ? `<i class="ti ti-shopping-bag shop"></i>`
  : /sms/.test(e.type) ? I('message') : /email|spam|unsub/.test(e.type) ? I('mail') : /form|list/.test(e.type) ? I('forms') : I('point');
// a placed order also shows one "Ordered <item>" row per item, like Klaviyo
function timeline(events) {
  const out = [];
  for (const e of events) {
    const items = e.type === 'placed_order' && e.props && Array.isArray(e.props.items) ? e.props.items : [];
    for (const it of items) out.push({ ...e, _t: `Ordered "${it.title || it.name || 'item'}"`, _props: { Quantity: it.qty || it.quantity || 1, Variant: it.variant || '', Price: it.price != null ? money(it.price) : '' }, _k: e.type === 'placed_order' ? 'ordered_product' : e.type });
    out.push(e);
  }
  return out;
}

async function renderProfile(el, id) {
  let p;
  try { p = await api('/api/mk/profiles/' + id); } catch (e) { el.innerHTML = CSS + `<div class="kq"><div class="kq-b" style="padding:24px"><a class="lk" href="#profiles">All profiles</a><p>That profile wasn't found.</p></div></div>`; return; }
  const nm = nameOf(p) || p.email || phoneF(p.phone) || 'Profile ' + p.id;
  const meta = [p.email, phoneF(p.phone), loc(p)].filter(Boolean).map(esc).join(' • ');
  el.innerHTML = CSS + `<div class="kq"><div class="kq-top"><div style="flex:1;min-width:0"><h1 class="kq-crumb"><a href="#profiles">All profiles</a><span class="sl">/</span>${esc(nm)}</h1><div class="kq-meta">${meta || '&nbsp;'}</div></div>
      <button class="btn" id="qact">Profile actions ${I('chevron-down')}</button></div>
    <div class="kq-tabs" role="tablist">${[['details', 'Details'], ['metrics', 'Metrics and insights'], ['lists', 'Lists and segments'], ['tickets', 'Tickets'], ['messages', 'Messages']].map(([k, l]) => `<button role="tab" data-t="${k}" class="${TAB === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="kq-cols"><div id="qleft"></div><div id="qright"></div></div></div>`;
  const reload = async () => { p = await api('/api/mk/profiles/' + id); renderProfile(el, id); };
  el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { TAB = b.dataset.t; renderProfile(el, id); });
  $('qact').onclick = (e) => actionsMenu(e.currentTarget, p, reload);
  const L = $('qleft');
  if (TAB === 'details') details(L, p, reload);
  else if (TAB === 'metrics') metrics(L, p);
  else if (TAB === 'lists') listsTab(L, p, reload);
  else if (TAB === 'tickets') ticketsTab(L, p);
  else messagesTab(L, p);
  rightTimeline($('qright'), p);
}

function actionsMenu(anchor, p, reload) {
  const KL = window.MK_KL || {};
  const items = [
    ['Edit profile', 'pencil', () => editModal(p, reload)],
    ['Add to list', 'list-check', () => addListModal(p, reload)],
    ...(p.tickets && p.tickets.length ? [['Open latest ticket', 'lifebuoy', () => window.open('/#t/' + p.tickets[0].id, '_blank')]] : []),
    ...(p.email_consent === 'subscribed' ? [['Unsubscribe from email', 'mail-off', () => unsub(p, 'email', reload), { danger: true }]] : []),
    ...(p.sms_consent === 'subscribed' ? [['Unsubscribe from texts', 'message-off', () => unsub(p, 'sms', reload), { danger: true }]] : []),
  ];
  if (KL.menu) KL.menu(anchor, items, { alignRight: true });
}
async function unsub(p, ch, reload) {
  if (!confirm(`Unsubscribe ${p.email || p.phone} from ${ch === 'sms' ? 'texts' : 'email'}? Only the customer can subscribe again.`)) return;
  try { await api(`/api/mk/profiles/${p.id}/consent`, { method: 'POST', body: JSON.stringify({ channel: ch, state: 'unsubscribed' }) }); toast('Unsubscribed'); reload(); } catch (e) { toast(e.message, 1); }
}
function modal(title, body, onSave, saveLabel = 'Save') {
  const m = document.createElement('div'); m.className = 'kq-modal';
  m.innerHTML = `<div class="bx" role="dialog" aria-label="${esc(title)}"><h3>${esc(title)}</h3>${body}<div class="ft"><button class="btn" data-x>Cancel</button><button class="btn pri" data-s>${esc(saveLabel)}</button></div></div>`;
  document.body.appendChild(m);
  m.querySelector('[data-x]').onclick = () => m.remove(); m.onclick = (e) => { if (e.target === m) m.remove(); };
  m.querySelector('[data-s]').onclick = async () => { try { await onSave(m); m.remove(); } catch (e) { toast(e.message, 1); } };
  const f = m.querySelector('input,select'); if (f) f.focus();
  return m;
}
function editModal(p, reload) {
  modal('Edit profile', `<label>First name</label><input type="text" id="ef" value="${esc(p.first_name || '')}"><label>Last name</label><input type="text" id="el" value="${esc(p.last_name || '')}">
    <label>Email</label><input type="email" id="ee" value="${esc(p.email || '')}"><label>Phone</label><input type="text" id="ep" value="${esc(p.phone || '')}">
    <p style="color:#71717A;font-size:12.5px;margin:10px 0 0">Changing the email keeps their consent. It's logged in the consent history.</p>`, async (m) => {
    await api('/api/mk/profiles/' + p.id, { method: 'PUT', body: JSON.stringify({ first_name: m.querySelector('#ef').value, last_name: m.querySelector('#el').value, email: m.querySelector('#ee').value, phone: m.querySelector('#ep').value }) });
    toast('Saved'); reload();
  });
}
async function addListModal(p, reload) {
  const lists = (await api('/api/mk/lists')).lists.filter((l) => !p.lists.some((x) => String(x.id) === String(l.id)));
  if (!lists.length) return toast('They are already on every list');
  modal('Add to list', `<label>List</label><select id="al">${lists.map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select>
    <p style="color:#71717A;font-size:12.5px;margin:10px 0 0">Adding someone by hand doesn't start a flow.</p>`, async (m) => {
    await api(`/api/mk/profiles/${p.id}/lists`, { method: 'POST', body: JSON.stringify({ list_id: m.querySelector('#al').value }) }); toast('Added'); reload();
  }, 'Add');
}

/* Details tab */
function consentPill(state) {
  if (state === 'subscribed') return `<span class="kq-pill ok"><i class="ti ti-circle-check-filled"></i><span>Subscribed</span></span>`;
  if (state === 'unsubscribed' || state === 'stopped') return `<span class="kq-pill bad"><i class="ti ti-circle-minus"></i>${state === 'stopped' ? 'Stopped' : 'Unsubscribed'}</span>`;
  return `<span class="kq-pill bad"><i class="ti ti-alert-circle-filled"></i>Never subscribed</span>`;
}
function details(L, p, reload) {
  const hist = (ch) => (p.consent || []).filter((c) => c.channel === ch);
  const histHtml = (ch) => { const h = hist(ch); return h.length ? h.map((c) => `<div style="padding:6px 0;font-size:14px"><b>${esc(c.state === 'subscribed' ? 'Subscribed' : c.state === 'never' ? 'Never subscribed' : c.state.replace(/^./, (x) => x.toUpperCase()))}</b> · ${shortD(c.at)}<div style="color:#71717A;font-size:13px">${esc([c.source && 'From ' + c.source, c.detail].filter(Boolean).join(' · '))}</div></div>`).join('') : '<div style="color:#71717A;font-size:14px">No changes recorded.</div>'; };
  const now = Date.now(), d90 = now - 90 * 864e5;
  const cps = (p.coupons || []).filter((c) => new Date(c.created_at).getTime() > d90);
  const cpStatus = (c) => c.redeemed_at ? 'Used' : c.removed_at ? 'Removed' : c.expires_at && new Date(c.expires_at) < new Date() ? 'Expired' : 'Unused';
  const props = Object.entries(p.props || {}).filter(([, v]) => v == null || typeof v !== 'object');
  L.innerHTML = `<div class="kq-card"><div class="ch"><h2>Channel consent</h2></div>
      ${[['email', 'Email', p.email_consent], ['sms', 'Text messaging marketing', p.sms_consent]].map(([ch, lb, st]) => `<div class="kq-cs" data-ch="${ch}"><div class="r"><i class="ti ti-chevron-down"></i><span class="lb">${lb}</span>${consentPill(st)}${st === 'subscribed' ? `<button class="dots" data-dot="${ch}" aria-label="${lb} options">${I('dots-vertical')}</button>` : ''}</div><div class="hist">${histHtml(ch)}</div></div>`).join('')}
    </div>
    <div class="kq-card"><div class="ch"><div style="flex:1"><h2>Coupons</h2><div class="s2">Last 90 days</div></div></div>
      ${cps.length ? `<table><thead><tr><th>Title</th><th>Code received</th><th>Status</th><th>Expiration date</th></tr></thead><tbody>${cps.map((c) => `<tr><td><span class="lk" style="color:#2563EB">${esc(c.form || c.flow || (c.percent ? Number(c.percent) + '% off' : c.amount ? '$' + Number(c.amount) + ' off' : 'Coupon'))}</span></td><td style="font-family:ui-monospace,monospace">${esc(c.code)}</td><td><span class="used">${cpStatus(c)}</span></td><td>${c.expires_at ? shortD(c.expires_at) : '—'}</td></tr>`).join('')}</tbody></table>` : '<div style="color:#71717A">No coupons in the last 90 days.</div>'}
    </div>
    <div class="kq-card"><div class="ch"><h2 style="flex:1">Custom properties</h2><button class="btn" id="qpadd">Add custom property</button></div>
      <div class="fl"><input type="search" id="qps" placeholder="Search..." aria-label="Search properties" style="min-width:240px"><span class="clr" id="qpc">Clear</span></div>
      <table><thead><tr><th>Property</th><th>Value</th><th style="width:44px"></th></tr></thead><tbody id="qpt"></tbody></table>
    </div>
    <div class="kq-card"><div class="ch"><h2>Profile</h2></div><table><tbody>
      ${[['First name', p.first_name], ['Last name', p.last_name], ['Email', p.email], ['Phone', phoneF(p.phone)], ['Location', loc(p, true)], ['Engagement', (TIER[p.tier] || [, p.tier])[1]], ['Orders', `${fmtN(p.orders_count)} · ${money(p.total_spent)} spent`], ['First order', p.first_order_at ? shortD(p.first_order_at) : '—'], ['Last order', p.last_order_at ? shortD(p.last_order_at) : '—'], ['Came from', (p.sources || []).join(', ')], ['Profile created', fullDT(p.created_at)], ['Profile updated', fullDT(p.updated_at)]].map(([k, v]) => `<tr><td style="color:#52525B;width:170px">${k}</td><td>${esc(v || '—')}</td></tr>`).join('')}
    </tbody></table></div>`;
  L.querySelectorAll('.kq-cs .r').forEach((r) => r.onclick = (e) => { if (e.target.closest('.dots')) return; r.parentElement.classList.toggle('open'); });
  L.querySelectorAll('[data-dot]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); const ch = b.dataset.dot; (window.MK_KL || {}).menu(b, [[`Unsubscribe from ${ch === 'sms' ? 'texts' : 'email'}`, 'circle-minus', () => unsub(p, ch, reload), { danger: true }]], { alignRight: true }); });
  const drawProps = () => { const q = ($('qps').value || '').toLowerCase(); const rows = props.filter(([k, v]) => !q || k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q));
    $('qpt').innerHTML = rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="word-break:break-word">${esc(v == null ? '' : String(v))}</td><td><button class="dots" data-pk="${esc(k)}" aria-label="Property options">${I('dots-vertical')}</button></td></tr>`).join('') || `<tr><td colspan="3" style="color:#71717A">${q ? 'No properties match.' : 'No custom properties.'}</td></tr>`;
    $('qpt').querySelectorAll('[data-pk]').forEach((b) => b.onclick = () => { const k = b.dataset.pk; (window.MK_KL || {}).menu(b, [
      ['Edit', 'pencil', () => propModal(p, reload, k, (p.props || {})[k])],
      ['Delete', 'trash', async () => { try { await api(`/api/mk/profiles/${p.id}/props`, { method: 'POST', body: JSON.stringify({ key: k, remove: true }) }); toast('Deleted'); reload(); } catch (e) { toast(e.message, 1); } }, { danger: true }]], { alignRight: true }); }); };
  $('qps').oninput = drawProps; $('qpc').onclick = () => { $('qps').value = ''; drawProps(); }; drawProps();
  $('qpadd').onclick = () => propModal(p, reload);
}
function propModal(p, reload, key = '', val = '') {
  modal(key ? 'Edit property' : 'Add custom property', `<label>Property</label><input type="text" id="pk" value="${esc(key)}"${key ? ' readonly' : ''} placeholder="e.g. Baby due date"><label>Value</label><input type="text" id="pv" value="${esc(val == null ? '' : String(val))}">`, async (m) => {
    await api(`/api/mk/profiles/${p.id}/props`, { method: 'POST', body: JSON.stringify({ key: m.querySelector('#pk').value, value: m.querySelector('#pv').value }) }); toast('Saved'); reload();
  });
}

/* Metrics tab */
let MWIN = '30';
function metrics(L, p) {
  const m = Object.fromEntries((p.metrics || []).map((x) => [x.type, x]));
  const n = (t) => { const x = m[t]; return x ? (MWIN === '30' ? x.n30 : x.all_n) : 0; };
  const v = (t) => { const x = m[t]; return x ? (MWIN === '30' ? x.v30 : x.all_v) : 0; };
  const others = (p.metrics || []).map((x) => x.type).filter((t) => !['placed_order', 'fulfilled_order'].includes(t)).sort();
  const shop = `<span class="kq-src"><i class="ti ti-shopping-bag" style="color:#5E8E3E"></i>Shopify</span>`;
  L.innerHTML = `<div class="kq-card"><div class="ch"><h2>Metrics</h2><div class="kq-seg" role="tablist"><button data-w="30" class="${MWIN === '30' ? 'on' : ''}">30 days</button><button data-w="all" class="${MWIN === 'all' ? 'on' : ''}">All-time</button></div></div>
      <h3 style="font-size:17px;margin:0 0 6px;font-weight:600">Highlighted metrics</h3><p style="margin:0 0 16px;color:#3F3F46">Orders and revenue for this profile.</p>
      <div class="kq-hl"><div><b>${fmtN(n('placed_order'))}</b><span>Placed Order</span>${shop}</div><div><b>${money(v('placed_order'))}</b><span>Revenue</span>${shop}</div><div><b>${fmtN(n('fulfilled_order'))}</b><span>Fulfilled Order</span>${shop}</div></div>
      <h3 style="font-size:17px;margin:0 0 10px;font-weight:600">Selected metrics</h3>
      <table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${others.map((t) => `<tr><td>${esc(evLabel({ type: t, props: {} }).replace(/ ".*"$/, ''))}</td><td>${fmtN(n(t))}</td></tr>`).join('') || '<tr><td colspan="2" style="color:#71717A">No other activity.</td></tr>'}</tbody></table>
    </div>
    <div class="kq-card"><div class="ch"><h2>Lifetime</h2></div><div class="kq-hl"><div><b>${fmtN(p.orders_count)}</b><span>Orders</span></div><div><b>${money(p.total_spent)}</b><span>Total spent</span></div><div><b>${p.orders_count ? money(Number(p.total_spent) / p.orders_count) : '$0'}</b><span>Average order</span></div></div></div>`;
  L.querySelectorAll('[data-w]').forEach((b) => b.onclick = () => { MWIN = b.dataset.w; metrics(L, p); });
}

/* Lists and segments tab */
function listsTab(L, p, reload) {
  const rows = [...(p.lists || []).map((l) => ({ kind: 'list', ...l })), ...(p.segments || []).map((s) => ({ kind: 'segment', ...s }))];
  L.innerHTML = `<div class="kq-card"><div class="ch"><h2 style="flex:1">Lists &amp; segments</h2><button class="btn" id="qladd">Add to list</button></div>
    <div class="fl"><input type="search" id="qls" placeholder="Search" aria-label="Search lists" style="min-width:200px"><select id="qlk" aria-label="Type"><option value="">All lists and segments</option><option value="list">Lists</option><option value="segment">Segments</option></select><span class="clr" id="qlc">Clear</span></div>
    <table><thead><tr><th>Name ↑</th><th>Date added</th><th style="width:44px"></th></tr></thead><tbody id="qlt"></tbody></table></div>`;
  const draw = () => { const q = ($('qls').value || '').toLowerCase(), k = $('qlk').value;
    const r = rows.filter((x) => (!k || x.kind === k) && (!q || x.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
    $('qlt').innerHTML = r.map((x) => `<tr><td><span style="display:inline-flex;align-items:center;gap:10px">${x.kind === 'list' ? I('list') : I('bolt')}<a class="lk" data-open="${x.kind}:${x.id}">${esc(x.name)}</a>${x.archived ? ' <span style="color:#A1A1AA;font-size:12.5px">(deleted)</span>' : ''}</span></td><td>${shortD(x.added_at)}</td><td>${x.kind === 'list' ? `<button class="dots" data-rm="${x.id}" aria-label="List options">${I('dots-vertical')}</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="3" style="color:#71717A">Not in any list or segment.</td></tr>';
    $('qlt').querySelectorAll('[data-open]').forEach((a) => a.onclick = () => { const [kind, id] = a.dataset.open.split(':'); if (kind === 'segment') location.hash = '#segments/' + id; else { PQ.list = id; PQ.q = ''; PQ.consent = ''; PQ.offset = 0; location.hash = '#profiles'; } });
    $('qlt').querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => (window.MK_KL || {}).menu(b, [['Remove from list', 'trash', async () => { try { await api(`/api/mk/profiles/${p.id}/lists`, { method: 'POST', body: JSON.stringify({ list_id: b.dataset.rm, remove: true }) }); toast('Removed'); reload(); } catch (e) { toast(e.message, 1); } }, { danger: true }]], { alignRight: true })); };
  $('qls').oninput = draw; $('qlk').onchange = draw; $('qlc').onclick = () => { $('qls').value = ''; $('qlk').value = ''; draw(); };
  $('qladd').onclick = () => addListModal(p, reload);
  draw();
}

/* Tickets tab (Buzzin's customer-service history, where Klaviyo has Objects) */
function ticketsTab(L, p) {
  L.innerHTML = `<div class="kq-card"><div class="ch"><h2>Customer service</h2></div>${(p.tickets || []).length
    ? `<table><thead><tr><th>Ticket</th><th>Status</th><th>Last message</th></tr></thead><tbody>${p.tickets.map((t) => `<tr><td><a class="lk" href="/#t/${t.id}" target="_blank" rel="noopener">${esc(t.subject || 'Ticket ' + t.id)}</a></td><td><span class="used">${esc(t.status)}</span></td><td>${shortD(t.last_message_at)}</td></tr>`).join('')}</tbody></table>`
    : `<div class="kq-empty"><b>No tickets</b>${p.email ? 'Nothing from ' + esc(p.email) + ' in the help desk.' : 'This profile has no email.'}</div>`}</div>`;
}

/* Messages tab */
let MF = { q: '', range: '30', act: '', type: '' };
function messagesTab(L, p) {
  L.innerHTML = `<div class="kq-card"><div class="ch"><h2>Messages</h2></div>
    <div class="fl"><label><span>&nbsp;</span><input type="search" id="mq" placeholder="Find a message" value="${esc(MF.q)}" style="min-width:200px"></label>
      <label>Date range<select id="mr"><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option><option value="">All time</option></select></label>
      <label>Activity<select id="ma"><option value="">All</option><option value="delivered">Delivered</option><option value="opened">Opened</option><option value="clicked">Clicked</option><option value="failed">Bounced or failed</option></select></label>
      <label>Type<select id="mt"><option value="">All</option><option value="campaign">Campaigns</option><option value="flow">Flows</option></select></label></div>
    <div class="tw"><table><thead><tr><th>Message</th><th>Channel</th><th>From</th><th>Sent</th><th>Activity</th></tr></thead><tbody id="mtb"></tbody></table></div></div>`;
  $('mr').value = MF.range; $('ma').value = MF.act; $('mt').value = MF.type;
  const ev = (s) => s.events || [];
  const draw = () => {
    const since = MF.range ? Date.now() - Number(MF.range) * 864e5 : 0, q = MF.q.toLowerCase();
    const r = (p.sends || []).filter((s) => (!since || new Date(s.at).getTime() >= since) && (!q || String(s.subject || '').toLowerCase().includes(q) || String(s.flow || s.campaign || '').toLowerCase().includes(q))
      && (!MF.type || (MF.type === 'flow' ? s.flow_id : s.campaign_id))
      && (!MF.act || (MF.act === 'delivered' ? s.status === 'sent' : MF.act === 'failed' ? (s.status !== 'sent' || ev(s).some((x) => /bounce|fail|complain/.test(x))) : ev(s).some((x) => x.includes(MF.act === 'opened' ? 'open' : 'click')))));
    $('mtb').innerHTML = r.map((s) => { const e = ev(s); const act = s.status !== 'sent' ? `<span class="kq-pill bad">${esc(s.status)}${s.reason ? ' · ' + esc(s.reason).slice(0, 40) : ''}</span>` : e.some((x) => /bounce/.test(x)) ? '<span class="kq-pill bad">Bounced</span>' : e.some((x) => /click/.test(x)) ? '<span class="kq-pill ok"><span>Clicked</span></span>' : e.some((x) => /open/.test(x)) ? '<span class="kq-pill ok"><span>Opened</span></span>' : '<span class="kq-pill off">Delivered</span>';
      return `<tr><td style="max-width:260px">${esc((s.subject || '(no subject)').slice(0, 120))}</td><td>${s.channel === 'sms' ? I('message') + ' Text' : I('mail') + ' Email'}</td><td>${esc(s.flow ? 'Flow · ' + s.flow : s.campaign ? 'Campaign · ' + s.campaign : '—')}</td><td style="white-space:nowrap">${shortD(s.at)}</td><td>${act}</td></tr>`; }).join('')
      || '<tr><td colspan="5"><div class="kq-empty"><b>No messages</b>Nothing matches these filters.</div></td></tr>';
  };
  $('mq').oninput = (e) => { MF.q = e.target.value; draw(); };
  $('mr').onchange = (e) => { MF.range = e.target.value; draw(); }; $('ma').onchange = (e) => { MF.act = e.target.value; draw(); }; $('mt').onchange = (e) => { MF.type = e.target.value; draw(); };
  draw();
}

/* Right column: activity timeline */
function rightTimeline(R, p) {
  const all = timeline(p.events || []);
  const types = [...new Set(all.map((e) => e._k || e.type))];
  const typeLabel = (t) => t === 'ordered_product' ? 'Ordered product' : evLabel({ type: t, props: {}, value: 0 }).replace(/ ".*"$/, '').replace(/ for$/, '');
  R.innerHTML = `<div class="kq-tf"><select id="tev" aria-label="Event type"><option value="">All events</option>${types.map((t) => `<option value="${t}">${esc(typeLabel(t))}</option>`).join('')}</select>
    <div class="dt"><input type="date" id="tds" aria-label="Start date"><input type="date" id="tde" aria-label="End date"></div></div><div id="tl"></div>`;
  const draw = () => {
    const t = $('tev').value, s = $('tds').value ? new Date($('tds').value + 'T00:00:00').getTime() : 0, e2 = $('tde').value ? new Date($('tde').value + 'T23:59:59').getTime() : Infinity;
    const r = all.filter((e) => (!t || (e._k || e.type) === t) && new Date(e.at).getTime() >= s && new Date(e.at).getTime() <= e2).slice(0, 200);
    $('tl').innerHTML = r.map((e, i) => { const pr = e._props || Object.fromEntries(Object.entries(e.props || {}).filter(([k, v]) => v != null && v !== '' && k !== 'items').map(([k, v]) => [k.replace(/_/g, ' '), typeof v === 'object' ? JSON.stringify(v) : v]));
      const rows = Object.entries(pr).filter(([, v]) => v !== '' && v != null);
      return `<div class="kq-ev" data-i="${i}"><button class="tg" aria-label="Show details">${I('chevron-down')}</button><div class="ic">${e._t ? `<i class="ti ti-shopping-bag shop"></i>` : evIcon(e)}</div>
        <div><div class="tt">${esc(e._t || evLabel(e))}</div><div class="tm">${shortDT(e.at)}</div></div><span></span>
        <div class="pp">${rows.length ? rows.map(([k, v]) => `<div><span>${esc(k)}</span><span>${esc(String(v)).slice(0, 300)}</span></div>`).join('') : '<div><span>Source</span><span>' + esc(e.source || 'Buzzin') + '</span></div>'}</div></div>`; }).join('')
      || '<div class="kq-empty"><b>No activity</b>Nothing in this range.</div>';
    $('tl').querySelectorAll('.kq-ev .tg').forEach((b) => b.onclick = () => b.parentElement.classList.toggle('open'));
  };
  $('tev').onchange = draw; $('tds').onchange = draw; $('tde').onchange = draw;
  draw();
}
})();
