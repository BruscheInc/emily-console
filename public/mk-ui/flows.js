/* Buzzin Marketing · flow builder (loaded by /marketing) */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const at = S.findIndex((x) => x.id === 'forms');
  S.splice(at, 0, { id: 'flows', icon: 'git-branch', label: 'Flows', render: renderFlows });
});
const FSTATUS = { draft: ['off', 'Draft'], test: ['blue', 'Test'], live: ['ok', 'Live'], paused: ['hon', 'Paused'] };
const MSTATUS = { draft: ['off', 'Draft'], test: ['blue', 'Test'], live: ['ok', 'Live'] };
const STEP = {
  send_email: ['Email', 'mail', 'var(--blue)'], send_sms: ['Text', 'message', 'var(--clay)'], delay: ['Wait', 'clock', 'var(--muted)'], wait_for: ['Wait for something', 'hourglass', 'var(--muted)'],
  split: ['Yes/no split', 'arrows-split', 'var(--ink)'], ab: ['A/B split', 'flask', 'var(--ink)'], update_profile: ['Update profile', 'user-edit', 'var(--honey-ink)'], list: ['List', 'list-details', 'var(--honey-ink)'],
  coupon: ['Create coupon', 'discount', 'var(--honey-ink)'], alert: ['Alert the team', 'bell', 'var(--muted)'], ticket: ['Create ticket', 'ticket', 'var(--muted)'], webhook: ['Webhook', 'webhook', 'var(--muted)'], end: ['End', 'player-stop', 'var(--muted)'] };
const ADDABLE = ['send_email', 'send_sms', 'delay', 'wait_for', 'split', 'ab', 'update_profile', 'list', 'coupon', 'alert', 'ticket', 'webhook'];
const nid = () => 'n' + Math.random().toString(16).slice(2, 10);
const C = () => window.MK_conditions;

async function renderFlows(el, id) {
  if (id) return editFlow(el, id);
  const r = await api('/api/mk/flows?' + qs({ store: STORE }));
  el.innerHTML = `<h1>Flows</h1><p class="sub">Automatic series that run for each person on their own schedule. Any step can join an existing path, so a shared email is written once. Nothing sends until a sender is connected.</p>
  <div class="bar"><select id="fs"${STORE ? '' : ' disabled'}><option value="">Blank flow</option>${Object.entries(r.starters).map(([k, n]) => `<option value="${k}">${esc(n)}</option>`).join('')}</select>
    <button class="btn pri" id="fnew"${STORE ? '' : ' disabled title="Pick a store first"'}><i class="ti ti-plus"></i> New flow</button><button class="btn" id="fimp"><i class="ti ti-download"></i> Re-import from Klaviyo</button>${STORE ? '' : '<span style="color:var(--muted)">Pick a store at the top to create one.</span>'}</div>
  <div class="card" style="padding:6px"><div class="tw"><table><thead><tr><th>Flow</th><th>Store</th><th>Status</th><th>Starts when</th><th class="n">Steps</th><th class="n">In it now</th><th class="n">Entered (30 days)</th><th>From</th></tr></thead><tbody>
  ${r.flows.map((f) => `<tr class="click" data-id="${f.id}"><td><b>${esc(f.name)}</b></td><td>${f.store === 'lbo' ? 'Outlet' : 'LB'}</td><td>${pill(FSTATUS, f.status)}</td><td>${esc(trigText(f.trigger, r))}</td><td class="n">${fmtN(f.steps)}</td><td class="n">${fmtN(f.in_flow)}</td><td class="n">${fmtN(f.entered_30d)}</td><td>${f.source === 'klaviyo' ? '<span class="pill blue">Klaviyo</span>' : '<span class="pill off">Buzzin</span>'}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No flows yet.</td></tr>'}
  </tbody></table></div></div>`;
  el.querySelectorAll('tr.click').forEach((tr) => tr.onclick = () => { location.hash = '#flows/' + tr.dataset.id; });
  $('fnew').onclick = async () => { try { const f = await api('/api/mk/flows', { method: 'POST', body: JSON.stringify({ store: STORE, starter: $('fs').value || null }) }); location.hash = '#flows/' + f.id; } catch (e) { toast(e.message, 1); } };
  $('fimp').onclick = async () => { try { const x = await api('/api/mk/flows/import-klaviyo', { method: 'POST', body: '{}' }); toast(`${x.flows.length} flows imported as drafts`); go(); } catch (e) { toast(e.message, 1); } };
}
function trigText(t, ctx = {}) {
  t = t || {};
  if (t.type === 'list') return 'Joins list ' + (((ctx.lists || []).find((l) => String(l.id) === String(t.list_id)) || {}).name || (t.list_id ? '#' + t.list_id : '(choose)'));
  if (t.type === 'segment') return 'Enters segment ' + (((ctx.segments || []).find((l) => String(l.id) === String(t.segment_id)) || {}).name || '(choose)');
  if (t.type === 'event') return ((ctx.events || {})[t.event] || t.event || '(choose)');
  if (t.type === 'date') return `Date: ${t.field || '(choose)'}${t.offset_days ? ` + ${t.offset_days} days` : ''}${t.yearly ? ' (every year)' : ''}`;
  return 'Added by hand';
}

let FL = null, SEL = null, fldirty = false;
async function editFlow(el, id) {
  FL = await api('/api/mk/flows/' + id); SEL = null; fldirty = false;
  el.style.padding = '0';
  el.innerHTML = `<div style="display:flex;flex-direction:column;height:100%">
  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;background:#fff;border-bottom:1px solid var(--line)">
    <a href="#flows" class="btn xs" aria-label="Back"><i class="ti ti-arrow-left"></i></a><input id="flnm" type="text" value="${esc(FL.name)}" aria-label="Flow name" style="font-weight:700;min-width:220px">
    <select id="flst" aria-label="Status"><option value="draft">Draft</option><option value="test">Test (internal list only)</option><option value="live">Live</option><option value="paused">Paused</option></select>
    <span class="pill off">${FL.store === 'lbo' ? 'Outlet' : 'Larkspur Baby'}</span><span class="sp"></span><span class="pill hon hidden" id="fldirty">Unsaved</span>
    <button class="btn" id="flsim"><i class="ti ti-player-play"></i> Simulate</button><button class="btn" id="flruns"><i class="ti ti-users"></i> People</button><button class="btn danger" id="fldel"><i class="ti ti-trash"></i></button><button class="btn pri" id="flsave">Save</button></div>
  <div id="flprob"></div>
  <div style="flex:1;display:flex;min-height:0">
    <div style="width:330px;flex:none;border-right:1px solid var(--line);background:#fff;overflow-y:auto;padding:14px" id="flleft"></div>
    <div style="flex:1;min-width:0;overflow:auto;background:#F6F5F2;background-image:radial-gradient(#DCD9D2 1px,transparent 1px);background-size:18px 18px" id="flcanvas"></div>
    <div style="width:360px;flex:none;border-left:1px solid var(--line);background:#fff;overflow-y:auto;padding:14px" id="flright"></div></div></div>`;
  $('flst').value = FL.status;
  const mark = () => { fldirty = true; $('fldirty').classList.remove('hidden'); };
  window.__flMark = () => { mark(); drawCanvas(); };
  $('flnm').oninput = () => { FL.name = $('flnm').value; mark(); };
  $('flst').onchange = () => { FL.status = $('flst').value; mark(); };
  $('flsave').onclick = saveFlow;
  $('fldel').onclick = async () => { if ($('fldel').dataset.c !== '1') { $('fldel').dataset.c = '1'; $('fldel').textContent = 'Click again to delete'; return; } try { await api('/api/mk/flows/' + FL.id, { method: 'DELETE' }); location.hash = '#flows'; } catch (e) { toast(e.message, 1); } };
  $('flsim').onclick = simulateUI;
  $('flruns').onclick = runsUI;
  window.onbeforeunload = () => fldirty ? 'Unsaved changes' : undefined;
  drawProblems(); drawLeft(); drawCanvas(); drawRight();
}
async function saveFlow() {
  try { const r = await api('/api/mk/flows/' + FL.id, { method: 'PUT', body: JSON.stringify({ name: FL.name, status: FL.status, trigger: FL.trigger, entry_filter: FL.entry_filter, exit_filter: FL.exit_filter, reentry: FL.reentry, graph: FL.graph }) });
    FL = { ...FL, ...r }; fldirty = false; $('fldirty').classList.add('hidden'); $('flst').value = FL.status; drawProblems(); toast('Saved'); } catch (e) { toast(e.message, 1); $('flst').value = FL.status; }
}
function drawProblems() { $('flprob').innerHTML = (FL.problems || []).length ? `<div class="note" style="border-radius:0">${FL.problems.map(esc).join(' ')}</div>` : (FL.notes ? `<div class="note" style="border-radius:0;background:var(--panel2);color:var(--muted)">${esc(FL.notes)}</div>` : ''); }
const ctx = () => ({ events: FL.events, lists: FL.lists, segments: FL.segments, since: true });

function drawLeft() {
  const t = FL.trigger || (FL.trigger = { type: 'list' });
  const re = FL.reentry || (FL.reentry = { mode: 'once' });
  const L = $('flleft');
  L.innerHTML = `<div style="font-weight:800;font-size:15px">Starts when</div>
    <select id="tt" style="width:100%;margin-top:6px">${[['list', 'Someone joins a list'], ['event', 'Someone does something'], ['segment', 'Someone enters a segment'], ['date', 'A date on their profile'], ['manual', 'Added by hand only']].map(([a, l]) => `<option value="${a}"${t.type === a ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <div id="tcfg" style="margin-top:6px"></div>
    <div style="font-weight:800;font-size:15px;margin-top:18px">Who may enter</div><div style="font-size:12px;color:var(--muted)">Checked once, when they'd enter.</div><div id="entry" style="margin-top:4px"></div>
    <div style="font-weight:800;font-size:15px;margin-top:18px">Leave the flow when</div><div style="font-size:12px;color:var(--muted)">Checked before every step. For example: they place an order.</div><div id="exit" style="margin-top:4px"></div>
    <div style="font-weight:800;font-size:15px;margin-top:18px">Can someone go through it again?</div>
    <select id="rem" style="width:100%;margin-top:6px"><option value="once">Only once, ever</option><option value="days">Once every … days</option><option value="always">Every time it starts</option></select>${re.mode === 'days' ? `<input id="red" type="number" min="1" value="${re.days || 30}" style="width:90px;margin-top:6px"> days` : ''}
    ${FL.versions && FL.versions.length ? `<div style="font-weight:800;font-size:15px;margin-top:18px">Versions</div><div style="font-size:12px;color:var(--muted)">People already inside keep the version they started on.</div>${FL.versions.slice(0, 6).map((v) => `<div style="font-size:12.5px;margin-top:4px">v${v.version} · ${fmtDT(v.created_at)}${v.by_user ? ' · ' + esc(v.by_user) : ''}</div>`).join('')}` : ''}`;
  const tc = $('tcfg');
  const ev = Object.entries(FL.events || {});
  if (t.type === 'list') tc.innerHTML = `<select id="tl" style="width:100%"><option value="">Choose a list…</option>${(FL.lists || []).map((l) => `<option value="${l.id}"${String(t.list_id) === String(l.id) ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`;
  if (t.type === 'segment') tc.innerHTML = `<select id="tsg" style="width:100%"><option value="">Choose a segment…</option>${(FL.segments || []).map((l) => `<option value="${l.id}"${String(t.segment_id) === String(l.id) ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`;
  if (t.type === 'event') tc.innerHTML = `<select id="tev" style="width:100%">${ev.map(([k, l]) => `<option value="${k}"${t.event === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select><label class="lab">Only when the amount is over ($)</label><input id="tval" type="number" min="0" value="${esc(((t.where || []).find((w) => w.prop === 'value') || {}).value || '')}" style="width:120px">`;
  if (t.type === 'date') tc.innerHTML = `<select id="tdf" style="width:100%">${[['props.baby_date', "Baby's due date or birthday (form)"], ['props.birthday', 'Birthday'], ['last_order_at', 'Last order'], ['first_order_at', 'First order'], ['created_at', 'Signed up']].map(([a, l]) => `<option value="${a}"${t.field === a ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <div style="display:flex;gap:6px;align-items:center;margin-top:6px">plus <input id="tdo" type="number" value="${t.offset_days || 0}" style="width:80px"> days <label style="display:flex;gap:4px;align-items:center;margin-left:8px"><input type="checkbox" id="tdy"${t.yearly ? ' checked' : ''}> every year</label></div><div style="font-size:12px;color:var(--muted);margin-top:4px">Checked every morning. Example: baby's date + 90 days for a size-up email.</div>`;
  const mark = () => { fldirty = true; $('fldirty').classList.remove('hidden'); drawCanvas(); };
  $('tt').onchange = (e) => { FL.trigger = { type: e.target.value }; mark(); drawLeft(); };
  const b = (id, fn) => { const x = $(id); if (x) x.oninput = x.onchange = fn; };
  b('tl', (e) => { t.list_id = e.target.value; mark(); }); b('tsg', (e) => { t.segment_id = e.target.value; mark(); }); b('tev', (e) => { t.event = e.target.value; mark(); });
  b('tval', (e) => { t.where = e.target.value ? [{ prop: 'value', op: 'gt', value: Number(e.target.value) }] : []; mark(); });
  b('tdf', (e) => { t.field = e.target.value; mark(); }); b('tdo', (e) => { t.offset_days = Number(e.target.value) || 0; mark(); }); b('tdy', (e) => { t.yearly = e.target.checked; mark(); });
  $('rem').value = re.mode; $('rem').onchange = (e) => { FL.reentry = { mode: e.target.value, days: re.days || 30 }; mark(); drawLeft(); }; b('red', (e) => { FL.reentry.days = Number(e.target.value); mark(); });
  C().editor($('entry'), FL.entry_filter || (FL.entry_filter = { match: 'all', conditions: [] }), ctx(), () => mark());
  C().editor($('exit'), FL.exit_filter || (FL.exit_filter = { match: 'all', conditions: [] }), ctx(), () => mark());
}

/* ---------- canvas ---------- */
function title(n) {
  const c = n.config || {};
  switch (n.type) {
    case 'send_email': { const t = (FL.templates || []).find((x) => String(x.id) === String(c.template_id)); return c.subject || (t && (t.subject || t.name)) || 'Choose an email'; }
    case 'send_sms': return (c.body || 'Write the text').slice(0, 60);
    case 'delay': return `${c.amount || 0} ${(c.amount == 1 ? (c.unit || 'days').replace(/s$/, '') : (c.unit || 'days'))}${c.until_time ? `, until ${c.until_time}` : ''}${c.weekdays && c.weekdays.length ? ' on ' + c.weekdays.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join('/') : ''}`;
    case 'wait_for': return `${(FL.events || {})[c.event] || c.event || 'something'} within ${c.within_amount || 1} ${c.within_unit || 'days'}`;
    case 'split': return C().summarize(c.condition, ctx());
    case 'ab': return (c.variants || []).map((v, i) => `${String.fromCharCode(65 + i)} ${v.weight}%`).join(' · ');
    case 'update_profile': return (c.ops || []).map((o) => `${o.key} = ${o.value}`).join(', ') || 'Set a value';
    case 'list': return `${c.action === 'remove' ? 'Remove from' : 'Add to'} ${((FL.lists || []).find((l) => String(l.id) === String(c.list_id)) || {}).name || 'a list'}`;
    case 'coupon': return c.kind === 'amount' ? `$${c.amount || 10} off code` : `${c.percent || 10}% off code, ${c.expires_days || 14} days`;
    case 'alert': return c.text || 'Message to the team';
    case 'ticket': return c.subject || 'Ticket for a person';
    case 'webhook': return c.url || 'Address';
    default: return '';
  }
}
function statFor(id) {
  const s = (FL.stats && FL.stats.steps) || [], here = (FL.stats && FL.stats.here) || [], sends = (FL.stats && FL.stats.sends) || [];
  const done = s.filter((x) => x.node_id === id && x.action === 'done').reduce((a, x) => a + x.n, 0);
  const waiting = (here.find((x) => x.node_id === id) || {}).n || 0;
  const sent = sends.filter((x) => x.flow_step === id).reduce((a, x) => ({ ...a, [x.status]: (a[x.status] || 0) + x.n }), {});
  return { done, waiting, sent };
}
function drawCanvas() {
  const g = FL.graph; const seen = new Set();
  const card = (id) => {
    const n = g.nodes[id]; const [label, icon, color] = STEP[n.type] || [n.type, 'circle', 'var(--muted)'];
    const st = statFor(id); const ms = n.config && n.config.status;
    return `<div class="fnode" data-id="${id}" style="width:280px;background:#fff;border:${SEL === id ? '2px solid var(--ink)' : '1px solid var(--line2)'};border-radius:12px;padding:10px 12px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.04)${n.type === 'split' || n.type === 'ab' || n.type === 'wait_for' ? ';border-radius:22px' : ''}">
      <div style="display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:${color}"><i class="ti ti-${icon}"></i>${esc(label.toUpperCase())}${ms ? `<span class="sp"></span>${pill(MSTATUS, ms)}` : ''}</div>
      <div style="font-weight:600;margin-top:2px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(title(n))}</div>
      ${st.done || st.waiting || Object.keys(st.sent).length ? `<div style="font-size:11.5px;color:var(--muted);margin-top:4px">${st.done ? fmtN(st.done) + ' passed' : ''}${st.waiting ? ` · ${fmtN(st.waiting)} here now` : ''}${Object.entries(st.sent).map(([k, v]) => ` · ${fmtN(v)} ${k}`).join('')}</div>` : ''}</div>`;
  };
  const vline = (h = 18) => `<div aria-hidden="true" style="width:2px;height:${h}px;background:var(--line2)"></div>`;
  const plus = (from, edge) => `<button class="btn xs" data-plus="${from}" data-edge="${edge}" aria-label="Add a step here" style="border-radius:50%;width:26px;height:26px;padding:0;justify-content:center"><i class="ti ti-plus"></i></button>`;
  const branch = (from, edge, to, label) => `<div style="display:flex;flex-direction:column;align-items:center">${label ? `<div style="font-size:11.5px;font-weight:700;color:var(--muted);padding:2px 8px;border-radius:999px;background:#fff;border:1px solid var(--line)">${label}</div>` : ''}${vline(10)}${plus(from, edge)}${vline(10)}${walk(to)}</div>`;
  const walk = (id) => {
    if (!id) return `<div style="font-size:12px;color:var(--muted);padding:4px 10px;border:1px dashed var(--line2);border-radius:999px;background:#fff">End</div>`;
    if (!g.nodes[id]) return `<div class="pill bad">Missing step</div>`;
    if (seen.has(id)) return `<button class="btn xs" data-jump="${id}" style="border-style:dashed"><i class="ti ti-arrow-right"></i> Joins: ${esc((STEP[g.nodes[id].type] || [''])[0])} · ${esc(title(g.nodes[id]).slice(0, 34))}</button>`;
    seen.add(id);
    const n = g.nodes[id];
    if (n.type === 'split' || n.type === 'wait_for') return `<div style="display:flex;flex-direction:column;align-items:center">${card(id)}${vline(12)}<div style="display:flex;gap:28px;align-items:flex-start">${branch(id, 'yes', n.yes, n.type === 'wait_for' ? 'It happened' : 'Yes')}${branch(id, 'no', n.no, n.type === 'wait_for' ? 'Timed out' : 'No')}</div></div>`;
    if (n.type === 'ab') return `<div style="display:flex;flex-direction:column;align-items:center">${card(id)}${vline(12)}<div style="display:flex;gap:28px;align-items:flex-start">${((n.config || {}).variants || []).map((v, i) => branch(id, 'v' + i, v.next, `Path ${String.fromCharCode(65 + i)} · ${v.weight}%`)).join('')}</div></div>`;
    if (n.type === 'end') return card(id);
    return `<div style="display:flex;flex-direction:column;align-items:center">${card(id)}${vline(10)}${plus(id, 'next')}${vline(10)}${walk(n.next)}</div>`;
  };
  const start = `<div style="display:flex;flex-direction:column;align-items:center"><div style="padding:8px 14px;border-radius:999px;background:var(--ink);color:#fff;font-weight:700;font-size:12.5px"><i class="ti ti-player-play"></i> ${esc(trigText(FL.trigger, ctx()))}</div>${vline(10)}${plus('__start', 'start')}${vline(10)}${walk(g.start)}</div>`;
  $('flcanvas').innerHTML = `<div style="padding:28px;display:inline-flex;min-width:100%;justify-content:center">${start}</div>`;
  $('flcanvas').querySelectorAll('.fnode').forEach((d) => d.onclick = () => { SEL = d.dataset.id; drawCanvas(); drawRight(); });
  $('flcanvas').querySelectorAll('[data-jump]').forEach((b) => b.onclick = () => { SEL = b.dataset.jump; drawCanvas(); drawRight(); const t = $('flcanvas').querySelector(`.fnode[data-id="${SEL}"]`); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  $('flcanvas').querySelectorAll('[data-plus]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); addMenu(b, b.dataset.plus, b.dataset.edge); });
}
function addMenu(btn, from, edge) {
  document.querySelectorAll('.addmenu').forEach((m) => m.remove());
  const m = document.createElement('div'); m.className = 'addmenu card'; m.style.cssText = 'position:fixed;z-index:60;padding:8px;display:grid;grid-template-columns:1fr 1fr;gap:4px;width:320px;box-shadow:0 10px 30px rgba(0,0,0,.15)';
  const r = btn.getBoundingClientRect(); m.style.left = Math.min(r.left, innerWidth - 340) + 'px'; m.style.top = Math.min(r.bottom + 6, innerHeight - 260) + 'px';
  m.innerHTML = ADDABLE.map((t) => `<button class="btn xs" data-t="${t}" style="justify-content:flex-start"><i class="ti ti-${STEP[t][1]}"></i> ${esc(STEP[t][0])}</button>`).join('');
  document.body.appendChild(m);
  const close = (e) => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', close); } }; setTimeout(() => document.addEventListener('mousedown', close), 0);
  m.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { insert(from, edge, b.dataset.t); m.remove(); });
}
const DEFAULTS = { send_email: { template_id: null, status: 'draft', smart_sending: true }, send_sms: { body: '', status: 'draft', add_opt_out: true }, delay: { amount: 1, unit: 'days', until_time: '10:00' },
  wait_for: { event: 'placed_order', within_amount: 3, within_unit: 'days' }, split: { condition: { match: 'all', conditions: [{ type: 'event', event: 'placed_order', op: 'at_least', value: 1, window: { kind: 'since_start' } }] } },
  ab: { variants: [{ weight: 50, next: null }, { weight: 50, next: null }] }, update_profile: { ops: [{ key: 'SignUp', value: 'Earned' }] }, list: { action: 'add', list_id: null }, coupon: { percent: 10, expires_days: 14, prefix: 'THANKS' },
  alert: { text: '' }, ticket: { subject: '', note: '' }, webhook: { url: '' } };
function insert(from, edge, type) {
  const g = FL.graph, id = nid();
  const n = { type, config: JSON.parse(JSON.stringify(DEFAULTS[type] || {})) };
  let after;
  if (from === '__start') { after = g.start; g.start = id; }
  else { const f = g.nodes[from]; if (edge === 'next') { after = f.next; f.next = id; } else if (edge === 'yes' || edge === 'no') { after = f[edge]; f[edge] = id; } else if (edge.startsWith('v')) { const v = f.config.variants[Number(edge.slice(1))]; after = v.next; v.next = id; } }
  if (type === 'split' || type === 'wait_for') { n.yes = after || null; n.no = after || null; }
  else if (type === 'ab') n.config.variants.forEach((v) => { v.next = after || null; });
  else n.next = after || null;
  g.nodes[id] = n; SEL = id; window.__flMark(); drawRight();
}
function removeNode(id) {
  const g = FL.graph, n = g.nodes[id]; if (!n) return;
  const cont = n.next || n.no || n.yes || ((n.config && n.config.variants) || []).map((v) => v.next).find(Boolean) || null;
  const swap = (x) => (x === id ? cont : x);
  g.start = swap(g.start);
  for (const m of Object.values(g.nodes)) { if ('next' in m) m.next = swap(m.next); if ('yes' in m) m.yes = swap(m.yes); if ('no' in m) m.no = swap(m.no); if (m.type === 'ab') m.config.variants.forEach((v) => { v.next = swap(v.next); }); }
  delete g.nodes[id];
  // drop anything no longer reachable
  const seen = new Set(); const go = (x) => { if (!x || seen.has(x) || !g.nodes[x]) return; seen.add(x); const k = g.nodes[x]; [k.next, k.yes, k.no, ...(((k.config || {}).variants) || []).map((v) => v.next)].forEach(go); }; go(g.start);
  for (const k of Object.keys(g.nodes)) if (!seen.has(k)) delete g.nodes[k];
  SEL = null; window.__flMark(); drawRight();
}

/* ---------- inspector ---------- */
const fl2 = (label, inner, hint) => `<label class="lab">${esc(label)}</label>${inner}${hint ? `<div style="font-size:11.5px;color:var(--muted);margin-top:3px">${esc(hint)}</div>` : ''}`;
function nextSelect(key, cur, self) {
  const opts = Object.entries(FL.graph.nodes).filter(([k]) => k !== self).map(([k, n]) => [k, `${STEP[n.type][0]}: ${title(n).slice(0, 40)}`]);
  return `<select data-next="${key}" style="width:100%"><option value="">End here</option>${opts.map(([k, l]) => `<option value="${k}"${cur === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}
function drawRight() {
  const R = $('flright');
  if (!SEL || !FL.graph.nodes[SEL]) { R.innerHTML = `<div class="empty" style="text-align:left"><b>Click a step to edit it.</b><p>Use + between steps to add one. Any step's "goes to" can point at a step that already exists — that's how paths join.</p></div>`; return; }
  const n = FL.graph.nodes[SEL], c = n.config || (n.config = {});
  const mark = () => { fldirty = true; $('fldirty').classList.remove('hidden'); drawCanvas(); };
  let body = '';
  const ms = `${fl2('Message status', `<select data-c="status" style="width:100%"><option value="draft">Draft — skipped</option><option value="test">Test — only the internal test list</option><option value="live">Live</option></select>`)}`;
  switch (n.type) {
    case 'send_email': body = fl2('Email', `<select data-c="template_id" style="width:100%"><option value="">Choose…</option>${(FL.templates || []).map((t) => `<option value="${t.id}"${String(c.template_id) === String(t.id) ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`, 'Edit emails in Email templates.') + (c.template_id ? `<a class="btn xs" style="margin-top:6px" href="#templates/${c.template_id}"><i class="ti ti-pencil"></i> Open this email</a>` : '') +
      fl2('Subject (optional override)', `<input data-c="subject" type="text" value="${esc(c.subject || '')}" style="width:100%">`) + fl2('Preview text', `<input data-c="preview" type="text" value="${esc(c.preview || '')}" style="width:100%">`) + ms +
      `<label style="display:flex;gap:6px;align-items:center;margin-top:10px"><input type="checkbox" data-cb="smart_sending"${c.smart_sending !== false ? ' checked' : ''}> Smart sending (skip if emailed recently)</label>`; break;
    case 'send_sms': body = fl2('Text', `<textarea data-c="body" rows="5" style="width:100%">${esc(c.body || '')}</textarea>`, 'Starts with the store name and ends with "Reply STOP to opt out" automatically.') + `<div id="smsc" style="font-size:12px;color:var(--muted);margin-top:4px"></div>` + ms +
      `<label style="display:flex;gap:6px;align-items:center;margin-top:10px"><input type="checkbox" data-cb="add_opt_out"${c.add_opt_out !== false ? ' checked' : ''}> Add the opt-out line</label>`; break;
    case 'delay': body = `<div style="display:flex;gap:6px;align-items:end">${fl2('Wait', `<input data-c="amount" type="number" min="0" value="${c.amount || 0}" style="width:80px">`)}${fl2('', `<select data-c="unit"><option value="minutes">minutes</option><option value="hours">hours</option><option value="days">days</option><option value="weeks">weeks</option></select>`)}</div>` +
      fl2('Then until this time (their time zone)', `<input data-c="until_time" type="time" value="${esc(c.until_time || '')}">`, 'Leave empty to continue right after the wait.') +
      fl2('Only on these days', `<div>${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => `<label style="display:inline-flex;gap:3px;margin-right:6px"><input type="checkbox" data-wd="${i}"${(c.weekdays || []).includes(i) ? ' checked' : ''}>${d}</label>`).join('')}</div>`, 'None checked = any day.'); break;
    case 'wait_for': body = fl2('Wait until they', `<select data-c="event" style="width:100%">${Object.entries(FL.events || {}).map(([k, l]) => `<option value="${k}"${c.event === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`) + `<div style="display:flex;gap:6px;align-items:end">${fl2('For up to', `<input data-c="within_amount" type="number" min="1" value="${c.within_amount || 1}" style="width:80px">`)}${fl2('', `<select data-c="within_unit"><option value="hours">hours</option><option value="days">days</option></select>`)}</div>` +
      fl2('If it happens, go to', nextSelect('yes', n.yes, SEL)) + fl2('If time runs out, go to', nextSelect('no', n.no, SEL)); break;
    case 'split': body = `<div id="splitc" style="margin-top:8px"></div>` + fl2('Yes goes to', nextSelect('yes', n.yes, SEL)) + fl2('No goes to', nextSelect('no', n.no, SEL)); break;
    case 'ab': body = (c.variants || []).map((v, i) => `<div class="card" style="padding:8px;margin-top:6px"><b>Path ${String.fromCharCode(65 + i)}</b>${fl2('Share (%)', `<input data-vw="${i}" type="number" min="0" max="100" value="${v.weight}" style="width:90px">`)}${fl2('Goes to', nextSelect('v' + i, v.next, SEL))}</div>`).join('') + `<button class="btn xs" id="abadd" style="margin-top:6px"${(c.variants || []).length >= 4 ? ' disabled' : ''}><i class="ti ti-plus"></i> Add path</button>`; break;
    case 'update_profile': body = (c.ops || []).map((o, i) => `<div style="display:flex;gap:6px;margin-top:6px"><input data-ok="${i}" type="text" value="${esc(o.key)}" placeholder="field" style="width:45%"><input data-ov="${i}" type="text" value="${esc(o.value)}" placeholder="value" style="flex:1"><button class="btn xs" data-orm="${i}">×</button></div>`).join('') + `<button class="btn xs" id="opadd" style="margin-top:6px"><i class="ti ti-plus"></i> Add field</button>`; break;
    case 'list': body = fl2('Action', `<select data-c="action" style="width:100%"><option value="add">Add to list</option><option value="remove">Remove from list</option></select>`) + fl2('List', `<select data-c="list_id" style="width:100%"><option value="">Choose…</option>${(FL.lists || []).map((l) => `<option value="${l.id}"${String(c.list_id) === String(l.id) ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`); break;
    case 'coupon': body = fl2('Kind', `<select data-c="kind" style="width:100%"><option value="percent">Percent off</option><option value="amount">Dollars off</option></select>`) + (c.kind === 'amount' ? fl2('Dollars off', `<input data-c="amount" type="number" min="1" value="${c.amount || 15}" style="width:100px">`) : fl2('Percent off', `<input data-c="percent" type="number" min="1" max="90" value="${c.percent || 10}" style="width:100px">`)) + fl2('Expires after (days)', `<input data-c="expires_days" type="number" min="1" value="${c.expires_days || 14}" style="width:100px">`) + fl2('Code starts with', `<input data-c="prefix" type="text" value="${esc(c.prefix || '')}" style="width:100%">`, 'Use {{ coupon }} in the next email or text. Real Shopify codes are only created when the flow is live and sending is on.'); break;
    case 'alert': body = fl2('Message to the team (Slack)', `<textarea data-c="text" rows="3" style="width:100%">${esc(c.text || '')}</textarea>`, 'You can use {{ first_name }} and {{ email }}.'); break;
    case 'ticket': body = fl2('Ticket subject', `<input data-c="subject" type="text" value="${esc(c.subject || '')}" style="width:100%">`) + fl2('Note for the team', `<textarea data-c="note" rows="3" style="width:100%">${esc(c.note || '')}</textarea>`); break;
    case 'webhook': body = fl2('Address (https)', `<input data-c="url" type="text" value="${esc(c.url || '')}" style="width:100%">`, 'Gets a POST with the flow name and the person.'); break;
  }
  const linear = !['split', 'wait_for', 'ab', 'end'].includes(n.type);
  R.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><i class="ti ti-${STEP[n.type][1]}" style="color:${STEP[n.type][2]}"></i><b style="font-size:15px">${esc(STEP[n.type][0])}</b><span class="sp"></span><button class="btn xs danger" id="ndel"><i class="ti ti-trash"></i> Remove</button></div>${body}${linear ? fl2('Then goes to', nextSelect('next', n.next, SEL), 'Pick an existing step to join that path.') : ''}`;
  R.querySelectorAll('[data-c]').forEach((x) => { if (x.tagName === 'SELECT') x.value = c[x.dataset.c] == null ? '' : String(c[x.dataset.c]); x.oninput = x.onchange = () => { let v = x.value; if (x.type === 'number') v = Number(v); if (x.dataset.c === 'until_time' && !v) v = null; c[x.dataset.c] = v; mark(); if (x.dataset.c === 'body') smsCount(); if (['kind'].includes(x.dataset.c)) drawRight(); }; });
  R.querySelectorAll('[data-cb]').forEach((x) => x.onchange = () => { c[x.dataset.cb] = x.checked; mark(); });
  R.querySelectorAll('[data-wd]').forEach((x) => x.onchange = () => { c.weekdays = [...R.querySelectorAll('[data-wd]:checked')].map((y) => Number(y.dataset.wd)); mark(); });
  R.querySelectorAll('[data-next]').forEach((x) => x.onchange = () => { const k = x.dataset.next, v = x.value || null; if (k.startsWith('v')) c.variants[Number(k.slice(1))].next = v; else n[k] = v; window.__flMark(); });
  R.querySelectorAll('[data-vw]').forEach((x) => x.oninput = () => { c.variants[Number(x.dataset.vw)].weight = Number(x.value); mark(); });
  const aa = $('abadd'); if (aa) aa.onclick = () => { c.variants.push({ weight: 0, next: null }); window.__flMark(); drawRight(); };
  R.querySelectorAll('[data-ok]').forEach((x) => x.oninput = () => { c.ops[Number(x.dataset.ok)].key = x.value.replace(/[^a-z0-9_]/gi, '_'); mark(); });
  R.querySelectorAll('[data-ov]').forEach((x) => x.oninput = () => { c.ops[Number(x.dataset.ov)].value = x.value; mark(); });
  R.querySelectorAll('[data-orm]').forEach((x) => x.onclick = () => { c.ops.splice(Number(x.dataset.orm), 1); window.__flMark(); drawRight(); });
  const oa = $('opadd'); if (oa) oa.onclick = () => { c.ops = c.ops || []; c.ops.push({ key: '', value: '' }); drawRight(); };
  if (n.type === 'split') C().editor($('splitc'), c.condition || (c.condition = { match: 'all', conditions: [] }), ctx(), () => mark());
  $('ndel').onclick = () => removeNode(SEL);
  if (n.type === 'send_sms') smsCount();
  function smsCount() { const el = $('smsc'); if (!el) return; api('/api/mk/sms/preview', { method: 'POST', body: JSON.stringify({ store: FL.store, body: c.body, add_opt_out: c.add_opt_out }) }).then((r) => { el.innerHTML = `<div style="background:var(--panel2);border-radius:10px;padding:8px;color:var(--ink);white-space:pre-wrap">${esc(r.body)}</div>${r.chars} characters · ${r.segments} segment${r.segments === 1 ? '' : 's'} (${r.encoding})`; }).catch(() => {}); }
}

/* ---------- simulate / people ---------- */
function drawerUI(titleText, inner) { document.querySelectorAll('.drawer').forEach((d) => d.remove()); const d = document.createElement('aside'); d.className = 'drawer'; d.innerHTML = `<div class="hd"><b>${esc(titleText)}</b><span class="sp"></span><button class="btn xs" data-x aria-label="Close"><i class="ti ti-x"></i></button></div><div class="bd">${inner}</div>`; document.body.appendChild(d); d.querySelector('[data-x]').onclick = () => d.remove(); return d; }
function simulateUI() {
  const d = drawerUI('Simulate a customer', `<p class="sub">See exactly which path a real customer would take and what they'd get today. Nothing is sent or saved.</p><label class="lab" for="sime">Their email</label><input id="sime" type="email" style="width:100%"><button class="btn pri" id="simgo" style="margin-top:8px">Simulate</button><div id="simout" style="margin-top:14px"></div>`);
  d.querySelector('#simgo').onclick = async () => { try { if (fldirty) await saveFlow(); const r = await api(`/api/mk/flows/${FL.id}/simulate`, { method: 'POST', body: JSON.stringify({ email: d.querySelector('#sime').value }) });
    d.querySelector('#simout').innerHTML = r.note ? `<div class="note">${esc(r.note)}</div>` : `<div class="tl">${r.path.map((x) => `<div class="e"><div class="t">${esc(STEP[x.type][0])}: ${esc(title(FL.graph.nodes[x.node]))}</div><div class="m">${esc(x.note)} · ${fmtDT(x.at)}</div></div>`).join('')}</div>`; } catch (e) { d.querySelector('#simout').innerHTML = `<div class="note">${esc(e.message)}</div>`; } };
}
async function runsUI() {
  const r = await api(`/api/mk/flows/${FL.id}/runs`);
  const d = drawerUI('People in this flow', `<div style="display:flex;gap:6px"><input id="enre" type="email" placeholder="Add someone by email" style="flex:1"><button class="btn" id="enrg">Add</button></div><div style="font-size:12px;color:var(--muted);margin-top:4px">In Test status, only people on the internal test list can be added.</div>
    <table style="margin-top:12px"><thead><tr><th>Person</th><th>Status</th><th>Step</th><th>Next</th></tr></thead><tbody>${r.runs.map((x) => `<tr><td>${esc(x.first_name || '')} ${esc(x.email || '')}${x.test ? ' <span class="pill blue">test</span>' : ''}</td><td>${esc(x.status)}${x.end_reason ? ' · ' + esc(x.end_reason) : ''}</td><td>${FL.graph.nodes[x.node_id] ? esc(STEP[FL.graph.nodes[x.node_id].type][0]) : '—'}</td><td>${x.status === 'active' ? fmtDT(x.due_at) : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nobody yet.</td></tr>'}</tbody></table>`);
  d.querySelector('#enrg').onclick = async () => { try { const x = await api(`/api/mk/flows/${FL.id}/enroll`, { method: 'POST', body: JSON.stringify({ email: d.querySelector('#enre').value }) }); if (x.ok) { toast('Added'); runsUI(); } else toast(x.error, 1); } catch (e) { toast(e.message, 1); } };
}
})();
