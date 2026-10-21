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
  split: ['Conditional split', 'arrows-split', 'var(--ink)'], ab: ['A/B split', 'flask', 'var(--ink)'], update_profile: ['Update profile', 'user-edit', 'var(--honey-ink)'], list: ['List', 'list-details', 'var(--honey-ink)'],
  coupon: ['Create coupon', 'discount', 'var(--honey-ink)'], alert: ['Alert the team', 'bell', 'var(--muted)'], ticket: ['Create ticket', 'ticket', 'var(--muted)'], webhook: ['Webhook', 'webhook', 'var(--muted)'], end: ['End', 'player-stop', 'var(--muted)'] };
const ADDABLE = ['send_email', 'send_sms', 'delay', 'wait_for', 'split', 'ab', 'update_profile', 'list', 'coupon', 'alert', 'ticket', 'webhook'];
const nid = () => 'n' + Math.random().toString(16).slice(2, 10);
const C = () => window.MK_conditions;

let FQ = '', FSF = '', FDAYS = 7, FARCH = false, FCHK = new Set();
async function renderFlows(el, id) {
  if (id) return editFlow(el, id);
  const KL = window.MK_KL || {}, I = (n) => `<i class="ti ti-${n}"></i>`;
  const load = () => api('/api/mk/flows?' + qs({ store: STORE, days: FDAYS, archived: FARCH ? '1' : '' }));
  let r = await load();
  el.innerHTML = (KL.LCSS || '') + `<style>.kl .cb{width:18px;height:18px;accent-color:#18181B}.kl .bulk{display:flex;align-items:center;gap:10px;background:#F4F4F5;border-radius:10px;padding:8px 12px;margin-bottom:12px}
    .kl .st.paused{background:#FEE2E2;color:#991B1B}.kl .st.test{background:#DBEAFE;color:#1E40AF}.kl .tico{font-size:20px;display:inline-flex;gap:6px}.kl .flab{display:block;font-size:12.5px;color:#52525B;margin-bottom:4px}</style>
    <div class="kl"><div class="kl-h"><h1>${FARCH ? 'Archived flows' : 'Flows'}</h1>${FARCH ? `<button class="btn" id="fback">${I('arrow-left')} Back to flows</button>` : ''}<button class="btn" id="fopt">Options ${I('chevron-down')}</button><button class="btn pri" id="fcr">Create flow</button></div>
    <div class="kl-b"><div class="kl-f" style="align-items:flex-end"><input type="search" id="fq" placeholder="Search flows" value="${esc(FQ)}" aria-label="Search flows">
      <select id="fsf" aria-label="Status"><option value="">Status</option>${Object.entries(FSTATUS).map(([k, [, l]]) => `<option value="${k}"${FSF === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <div><span class="flab">Metric period</span><select id="fdays" aria-label="Metric period" style="border-style:solid">${[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last 365 days']].map(([v, l]) => `<option value="${v}"${FDAYS === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <div id="fbulk"></div><div id="fbody"></div></div></div>`;
  const reload = async () => { r = await load(); draw(); };
  const st = () => STORE || 'lb';
  const make = async (starter) => { try { const f = await api('/api/mk/flows', { method: 'POST', body: JSON.stringify({ store: st(), starter: starter || null }) }); location.hash = '#flows/' + f.id; } catch (e) { toast(e.message, 1); } };
  $('fcr').onclick = () => KL.menu($('fcr'), [['Blank flow', 'file', () => make(null)], ...Object.entries(r.starters).map(([k, n]) => [`Start from: ${n}`, 'template', () => make(k)])], { alignRight: true });
  $('fopt').onclick = () => KL.menu($('fopt'), [[FARCH ? 'Show active flows' : 'Show archived flows', 'archive', () => { FARCH = !FARCH; FCHK.clear(); renderFlows(el); }],
    ['Re-import from Klaviyo', 'download', async () => { try { const x = await api('/api/mk/flows/import-klaviyo', { method: 'POST', body: '{}' }); toast(`${x.flows.length} flows imported as drafts`); reload(); } catch (e) { toast(e.message, 1); } }]], { alignRight: true });
  if ($('fback')) $('fback').onclick = () => { FARCH = false; FCHK.clear(); renderFlows(el); };
  $('fq').oninput = () => { FQ = $('fq').value; draw(); }; $('fsf').onchange = () => { FSF = $('fsf').value; draw(); };
  $('fdays').onchange = async () => { FDAYS = Number($('fdays').value); await reload(); };
  const archive = async (list, on) => { for (const f of list) { try { await api(`/api/mk/flows/${f.id}/archive`, { method: 'POST', body: JSON.stringify({ archived: on }) }); FCHK.delete(String(f.id)); } catch (e) { toast(e.message, 1); return; } } toast(on ? `Archived ${list.length}` : `Restored ${list.length}`); reload(); };
  const del = async (list) => { if (!confirm(list.length === 1 ? `Delete the flow "${list[0].name}"? Anyone in it leaves the flow. This can't be undone.` : `Delete ${list.length} flows? Anyone in them leaves. This can't be undone.`)) return;
    for (const f of list) { try { await api('/api/mk/flows/' + f.id, { method: 'DELETE' }); FCHK.delete(String(f.id)); } catch (e) { toast(e.message, 1); return; } } toast(`Deleted ${list.length}`); reload(); };
  const rowMenu = (f, anchor) => KL.menu(anchor, [
    ['Edit details', 'pencil', async () => { const n = prompt('Flow name', f.name); if (!n || n === f.name) return; try { await api(`/api/mk/flows/${f.id}/details`, { method: 'POST', body: JSON.stringify({ name: n }) }); toast('Saved'); reload(); } catch (e) { toast(e.message, 1); } }],
    ['Clone', 'copy', async () => { try { const c = await api(`/api/mk/flows/${f.id}/clone`, { method: 'POST', body: '{}' }); toast('Copied as a draft'); location.hash = '#flows/' + c.id; } catch (e) { toast(e.message, 1); } }],
    ['Copy ID', 'hash', () => { try { navigator.clipboard.writeText(String(f.id)); toast('Copied ID ' + f.id); } catch (e) { toast(String(f.id)); } }],
    FARCH ? ['Restore', 'arrow-back-up', () => archive([f], false)] : ['Archive', 'archive', () => archive([f], true)],
    ['Delete', 'trash', () => del([f]), { danger: true }],
  ], { alignRight: true });
  const money = (v) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const draw = () => {
    const rows = r.flows.filter((f) => (!FQ || f.name.toLowerCase().includes(FQ.toLowerCase())) && (!FSF || f.status === FSF)).sort((a, b) => a.name.localeCompare(b.name));
    $('fbody').innerHTML = `<table><thead><tr><th style="width:34px"><input type="checkbox" class="cb" id="fall" aria-label="Select all"></th><th>Flow ↑</th><th>Type</th><th>Status</th><th>Last updated</th><th class="n">Revenue</th><th class="n">Revenue per recipient</th><th style="width:44px"></th></tr></thead><tbody>
      ${rows.map((f) => `<tr class="row"><td><input type="checkbox" class="cb" data-ck="${f.id}"${FCHK.has(String(f.id)) ? ' checked' : ''} aria-label="Select ${esc(f.name)}"></td>
        <td><a class="nm" href="#flows/${f.id}">${esc(f.name)}</a><div class="sub2">${esc(trigText(f.trigger, r))}</div></td>
        <td><span class="tico">${(f.channels || []).includes('send_email') ? `<i class="ti ti-mail" title="Email"></i>` : ''}${(f.channels || []).includes('send_sms') ? `<i class="ti ti-message" title="Text"></i>` : ''}${(f.channels || []).length ? '' : '—'}</span></td>
        <td><span class="st ${f.status === 'live' ? 'live' : f.status}">${esc((FSTATUS[f.status] || [, f.status])[1])}</span></td>
        <td>${fmtDT(f.updated_at)}</td><td class="n">${money(f.revenue)}</td><td class="n">${money(f.rpr)}</td>
        <td><button class="dots" data-fm="${f.id}" aria-label="Options for ${esc(f.name)}">${I('dots-vertical')}</button></td></tr>`).join('') || `<tr><td colspan="8" class="empty">${FARCH ? 'No archived flows.' : 'No flows match.'}</td></tr>`}</tbody></table>
      <div style="padding:14px 0;color:#3F3F46">${rows.length ? `1 - ${rows.length} of ${rows.length}` : ''}</div>`;
    const find = (id) => r.flows.find((f) => String(f.id) === String(id));
    $('fbody').querySelectorAll('[data-fm]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); rowMenu(find(b.dataset.fm), b); });
    $('fbody').querySelectorAll('[data-ck]').forEach((x) => x.onchange = () => { if (x.checked) FCHK.add(x.dataset.ck); else FCHK.delete(x.dataset.ck); bulk(); });
    $('fall').checked = rows.length > 0 && rows.every((f) => FCHK.has(String(f.id)));
    $('fall').onchange = () => { rows.forEach((f) => ($('fall').checked ? FCHK.add(String(f.id)) : FCHK.delete(String(f.id)))); draw(); };
    bulk();
  };
  const bulk = () => { const picked = r.flows.filter((f) => FCHK.has(String(f.id)));
    $('fbulk').innerHTML = picked.length ? `<div class="bulk"><b>${picked.length} selected</b><span style="flex:1"></span><button class="btn xs" id="fclr">Clear</button><button class="btn xs" id="farc">${I(FARCH ? 'arrow-back-up' : 'archive')} ${FARCH ? 'Restore' : 'Archive'}</button><button class="btn xs danger" id="fdel">${I('trash')} Delete</button></div>` : '';
    if (picked.length) { $('fclr').onclick = () => { FCHK.clear(); draw(); }; $('farc').onclick = () => archive(picked, !FARCH); $('fdel').onclick = () => del(picked); } };
  draw();
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
  FL.perfDays = 30; try { FL.perf = (await api(`/api/mk/flows/${id}/performance?days=30`)).steps; } catch (e) { FL.perf = {}; }
  el.style.padding = '0';
  el.innerHTML = `<style>
    .fx-top{display:flex;align-items:center;gap:10px;padding:10px 16px;background:#fff;border-bottom:1px solid var(--line)}.fx-crumb{display:flex;align-items:center;gap:6px;font-size:17px;min-width:0}.fx-crumb a{color:#52525B;text-decoration:none}.fx-crumb a:hover{text-decoration:underline}
    .fx-name{all:unset;cursor:pointer;font-weight:700;display:inline-flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px}.fx-name:hover{color:#2563EB}
    .fx-pill{display:inline-block;background:#F4F4F5;border-radius:8px;padding:4px 10px;font-weight:500;font-size:13px}.fx-pill.live{background:#DCFCE7;color:#166534}.fx-pill.paused{background:#FEE2E2;color:#991B1B}.fx-pill.test{background:#DBEAFE;color:#1E40AF}
    .fx-ib{all:unset;cursor:pointer;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;font-size:19px;color:#3F3F46}.fx-ib:hover,.fx-ib.on{background:#F4F4F5}.fx-ib.on{color:#2563EB}
    .fx-panel{position:absolute;left:14px;top:14px;bottom:14px;width:440px;max-width:calc(100% - 28px);background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.10);z-index:3;display:flex;flex-direction:column;overflow:hidden}
    .fx-panel .fx-ph{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid var(--line)}.fx-panel .fx-ph .ic{width:36px;height:36px;border-radius:10px;background:#EEF2FF;display:inline-flex;align-items:center;justify-content:center;font-size:19px}
    .fx-panel .fx-pb{flex:1;overflow-y:auto;padding:14px 18px}.fx-panel .fx-pf{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--line)}
  </style><div style="display:flex;flex-direction:column;height:100%">
  <div class="fx-top"><div class="fx-crumb"><a href="#flows">Flows</a><span style="color:#A1A1AA">/</span><button class="fx-name" id="flnmb" title="Rename">${esc(FL.name)} <i class="ti ti-chevron-down" style="font-size:14px"></i></button></div>
    <span class="fx-pill ${FL.status}" id="flstp">${esc((FSTATUS[FL.status] || [, FL.status])[1])}</span><button class="fx-ib" id="flmore" aria-label="More">${'<i class="ti ti-dots-vertical"></i>'}</button>
    <span class="sp"></span><span class="pill hon hidden" id="fldirty">Unsaved</span>
    <button class="fx-ib${FL.showStats === false ? '' : ' on'}" id="flan" aria-label="Show analytics on steps" title="Show analytics on steps"><i class="ti ti-chart-bar"></i></button>
    <button class="fx-ib" id="flruns" aria-label="People in this flow" title="People in this flow"><i class="ti ti-users"></i></button>
    <button class="btn" id="flsim"><i class="ti ti-eye"></i> Preview</button><button class="btn" id="flsave">Save</button><button class="btn pri" id="flgo"></button></div>
  <div id="flprob"></div>
  <div style="flex:1;display:flex;min-height:0;position:relative">
    <div style="flex:1;min-width:0;overflow:hidden;position:relative;background:#F6F5F2;background-image:radial-gradient(#DCD9D2 1px,transparent 1px);background-size:18px 18px;cursor:grab;touch-action:none" id="flcanvas"></div>
    <div class="fx-panel hidden" id="flpanel"><div class="fx-ph"><span class="ic" id="flpic"><i class="ti ti-player-play"></i></span><b style="font-size:18px;flex:1" id="flpt">Trigger</b><button class="fx-ib" id="flpx" aria-label="Close panel"><i class="ti ti-x"></i></button></div>
      <div class="fx-pb"><div id="flleft"></div><div id="flright"></div></div><div class="fx-pf"><button class="btn" id="flpdone">Done</button></div></div></div></div>
  <select id="flst" class="hidden" aria-hidden="true"><option value="draft">Draft</option><option value="test">Test</option><option value="live">Live</option><option value="paused">Paused</option></select>`;
  $('flst').value = FL.status;
  const mark = () => { fldirty = true; $('fldirty').classList.remove('hidden'); };
  window.__flMark = () => { mark(); drawCanvas(); };
  const goBtn = () => { $('flgo').textContent = FL.status === 'live' ? 'Turn off' : 'Review and turn on'; const p = $('flstp'); p.className = 'fx-pill ' + FL.status; p.textContent = (FSTATUS[FL.status] || [, FL.status])[1]; };
  window.__flStatus = goBtn; goBtn();
  $('flnmb').onclick = () => { const n = prompt('Flow name', FL.name); if (!n || n === FL.name) return; FL.name = n.slice(0, 150); $('flnmb').innerHTML = `${esc(FL.name)} <i class="ti ti-chevron-down" style="font-size:14px"></i>`; mark(); };
  $('flsave').onclick = saveFlow;
  $('flgo').onclick = async () => {
    if (FL.status === 'live') { FL.status = 'paused'; await saveFlow(); goBtn(); return; }
    const probs = FL.problems || []; const msg = `Turn on "${FL.name}"?\n\nIt starts for everyone who ${trigText(FL.trigger, ctx()).replace(/^Joins/, 'joins').toLowerCase()} from now on. Messages still marked Draft are skipped; Test messages go only to the internal test list.${probs.length ? `\n\nFix first:\n• ${probs.join('\n• ')}` : ''}`;
    if (!confirm(msg)) return; const was = FL.status; FL.status = 'live'; await saveFlow(); if (FL.status !== 'live') FL.status = was; goBtn(); };
  $('flan').onclick = () => { FL.showStats = FL.showStats === false; $('flan').classList.toggle('on', FL.showStats !== false); drawCanvas(); };
  $('flpx').onclick = $('flpdone').onclick = () => { SEL = null; PANEL = null; drawCanvas(); showPanel(); };
  $('flmore').onclick = () => (window.MK_KL || {}).menu($('flmore'), [
    ['Edit details', 'pencil', () => $('flnmb').click()],
    ['Status: Draft', 'circle', () => { FL.status = 'draft'; mark(); goBtn(); }], ['Status: Test (internal list only)', 'flask', () => { FL.status = 'test'; mark(); goBtn(); }], ['Status: Paused', 'player-pause', () => { FL.status = 'paused'; mark(); goBtn(); }],
    ['Trigger settings', 'player-play', () => { SEL = null; PANEL = 'trigger'; drawCanvas(); showPanel(); }],
    ['Clone', 'copy', async () => { try { const c = await api(`/api/mk/flows/${FL.id}/clone`, { method: 'POST', body: '{}' }); toast('Copied as a draft'); location.hash = '#flows/' + c.id; } catch (e) { toast(e.message, 1); } }],
    ['Copy ID', 'hash', () => { try { navigator.clipboard.writeText(String(FL.id)); toast('Copied ID ' + FL.id); } catch (e) {} }],
    ['Archive', 'archive', async () => { try { await api(`/api/mk/flows/${FL.id}/archive`, { method: 'POST', body: JSON.stringify({ archived: true }) }); fldirty = false; toast('Archived'); location.hash = '#flows'; } catch (e) { toast(e.message, 1); } }],
    ['Delete', 'trash', async () => { if (!confirm(`Delete the flow "${FL.name}"? Anyone in it leaves the flow. This can't be undone.`)) return; try { await api('/api/mk/flows/' + FL.id, { method: 'DELETE' }); fldirty = false; location.hash = '#flows'; } catch (e) { toast(e.message, 1); } }, { danger: true }],
  ], { alignRight: false });
  $('flsim').onclick = simulateUI;
  $('flruns').onclick = runsUI;
  window.onbeforeunload = () => fldirty ? 'Unsaved changes' : undefined;
  PANEL = null; drawProblems(); drawLeft(); drawCanvas(); drawRight();
}
let PANEL = null;
/** One floating panel on the left, like Klaviyo: the trigger's settings, or the clicked step's details. */
function showPanel() {
  const P = $('flpanel'); if (!P) return;
  const open = !!(SEL && FL.graph.nodes[SEL]) || PANEL === 'trigger';
  P.classList.toggle('hidden', !open); $('flleft').classList.toggle('hidden', !!SEL); $('flright').classList.toggle('hidden', !SEL);
  if (SEL && FL.graph.nodes[SEL]) { const [l, ic, col] = STEP[FL.graph.nodes[SEL].type] || ['Step', 'circle', '']; $('flpt').textContent = `${l} details`; $('flpic').innerHTML = `<i class="ti ti-${ic}" style="color:${col}"></i>`; }
  else { $('flpt').textContent = 'Trigger'; $('flpic').innerHTML = '<i class="ti ti-player-play"></i>'; }
}
async function saveFlow() {
  try { const r = await api('/api/mk/flows/' + FL.id, { method: 'PUT', body: JSON.stringify({ name: FL.name, status: FL.status, trigger: FL.trigger, entry_filter: FL.entry_filter, exit_filter: FL.exit_filter, reentry: FL.reentry, graph: FL.graph }) });
    FL = { ...FL, ...r }; fldirty = false; $('fldirty').classList.add('hidden'); drawProblems(); if (window.__flStatus) window.__flStatus(); toast('Saved'); } catch (e) { toast(e.message, 1); }
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
const I2 = (n) => `<i class="ti ti-${n}"></i>`;
function drawCanvas() {
  const g = FL.graph; const seen = new Set();
  const card = (id) => {
    const n = g.nodes[id]; const [label, icon, color] = STEP[n.type] || [n.type, 'circle', 'var(--muted)'];
    const st = statFor(id); const ms = n.config && n.config.status;
    return `<div class="fnode" data-id="${id}" style="width:280px;background:#fff;border:${SEL === id ? '2px solid #2563EB' : '1px solid var(--line2)'};border-radius:12px;padding:10px 12px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.04)${n.type === 'split' || n.type === 'ab' || n.type === 'wait_for' ? ';border-radius:22px' : ''}">
      <div style="display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:${color}"><i class="ti ti-${icon}"></i>${esc(label.toUpperCase())}${ms ? `<span class="sp"></span>${pill(MSTATUS, ms)}` : ''}</div>
      <div style="font-weight:600;margin-top:2px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(title(n))}</div>
      ${FL.showStats !== false && (n.type === 'send_email' || n.type === 'send_sms') && ((FL.perf || {})[id] || {}).delivered ? (() => { const p = FL.perf[id]; return `<div style="display:flex;gap:10px;font-size:11.5px;margin-top:6px;padding-top:6px;border-top:1px solid var(--line)">${n.type === 'send_email' ? `<span title="Open rate">${I2('mail-opened')} ${pct(p.opened, p.delivered)}</span>` : ''}<span title="Click rate">${I2('click')} ${pct(p.clicked, p.delivered)}</span><span title="Placed order (revenue)">${I2('shopping-bag')} ${usd(p.revenue)}</span></div>`; })() : ''}
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
  const start = `<div style="display:flex;flex-direction:column;align-items:center"><button data-trig style="all:unset;cursor:pointer;width:280px;box-sizing:border-box;background:#fff;border:${PANEL === 'trigger' ? '2px solid #2563EB' : '1px solid var(--line2)'};border-radius:12px;padding:10px 12px;box-shadow:0 1px 2px rgba(0,0,0,.04)"><div style="display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:#18181B"><i class="ti ti-player-play"></i>TRIGGER</div><div style="font-weight:600;margin-top:2px">${esc(trigText(FL.trigger, ctx()))}</div></button>${vline(10)}${plus('__start', 'start')}${vline(10)}${walk(g.start)}</div>`;
  const C = $('flcanvas');
  C.innerHTML = `<div id="flstage" style="position:absolute;left:0;top:0;transform-origin:0 0;padding:28px;display:inline-flex;justify-content:center">${start}</div>
    <div class="flzoom" style="position:absolute;right:14px;bottom:14px;display:flex;flex-direction:column;align-items:center;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.06);z-index:2">
      <button class="btn xs" data-z="in" aria-label="Zoom in" style="border:0"><i class="ti ti-plus"></i></button><span id="flzp" style="font-size:12px;padding:2px 0;min-width:44px;text-align:center"></span><button class="btn xs" data-z="out" aria-label="Zoom out" style="border:0"><i class="ti ti-minus"></i></button><button class="btn xs" data-z="fit" aria-label="Fit to screen" title="Fit to screen" style="border:0;border-top:1px solid var(--line);border-radius:0 0 10px 10px"><i class="ti ti-maximize"></i></button></div>`;
  wireCanvas(C);
  $('flcanvas').querySelectorAll('.fnode').forEach((d) => d.onclick = () => { SEL = d.dataset.id; PANEL = null; drawCanvas(); drawRight(); });
  const tg = $('flcanvas').querySelector('[data-trig]'); if (tg) tg.onclick = () => { SEL = null; PANEL = 'trigger'; drawCanvas(); showPanel(); };
  $('flcanvas').querySelectorAll('[data-jump]').forEach((b) => b.onclick = () => { SEL = b.dataset.jump; drawCanvas(); drawRight(); centerOn(SEL); });
  $('flcanvas').querySelectorAll('[data-plus]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); addMenu(b, b.dataset.plus, b.dataset.edge); });
}
/* Canvas: drag the background to move around, scroll to pan, pinch or ⌘/Ctrl + scroll to zoom, like Klaviyo. */
let VIEW = null;
function applyView() { const st = $('flstage'); if (!st || !VIEW) return; st.style.transform = `translate(${VIEW.x}px,${VIEW.y}px) scale(${VIEW.z})`; const zp = $('flzp'); if (zp) zp.textContent = Math.round(VIEW.z * 100) + '%'; }
function zoomAt(z, cx, cy) { z = Math.max(0.2, Math.min(2, z)); VIEW.x = cx - (cx - VIEW.x) * (z / VIEW.z); VIEW.y = cy - (cy - VIEW.y) * (z / VIEW.z); VIEW.z = z; applyView(); }
function fitView() { const C = $('flcanvas'), st = $('flstage'); if (!C || !st) return; const w = st.offsetWidth, h = st.offsetHeight, cw = C.clientWidth, ch = C.clientHeight;
  const z = Math.max(0.2, Math.min(1, Math.min(cw / w, ch / h) * 0.95)); VIEW = { z, x: (cw - w * z) / 2, y: Math.max(10, (ch - h * z) / 2) }; applyView(); }
function centerOn(id) { const C = $('flcanvas'), t = C && C.querySelector(`.fnode[data-id="${id}"]`); if (!t || !VIEW) return; const cr = C.getBoundingClientRect(), r = t.getBoundingClientRect();
  VIEW.x += cr.left + cr.width / 2 - (r.left + r.width / 2); VIEW.y += cr.top + cr.height / 2 - (r.top + r.height / 2); applyView(); }
function wireCanvas(C) {
  if (!VIEW || VIEW.flow !== FL.id) { const st = $('flstage'); VIEW = { flow: FL.id, z: 1, x: Math.max(0, (C.clientWidth - st.offsetWidth) / 2), y: 0 }; }
  applyView();
  C.querySelectorAll('[data-z]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); const r = C.getBoundingClientRect(); if (b.dataset.z === 'fit') return fitView(); zoomAt(VIEW.z * (b.dataset.z === 'in' ? 1.2 : 1 / 1.2), r.width / 2, r.height / 2); });
  if (C.__wired) return; C.__wired = true;   // the listeners below survive redraws
  C.addEventListener('wheel', (e) => { e.preventDefault(); const r = C.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(VIEW.z * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else { VIEW.x -= e.deltaX; VIEW.y -= e.deltaY; applyView(); } }, { passive: false });
  let drag = null;
  C.addEventListener('pointerdown', (e) => { if (e.button !== 0 || e.target.closest('.fnode,button,a,input,select,.flzoom')) return; drag = { x: e.clientX, y: e.clientY, vx: VIEW.x, vy: VIEW.y }; C.setPointerCapture(e.pointerId); C.style.cursor = 'grabbing'; });
  C.addEventListener('pointermove', (e) => { if (!drag) return; VIEW.x = drag.vx + e.clientX - drag.x; VIEW.y = drag.vy + e.clientY - drag.y; applyView(); });
  const end = () => { drag = null; C.style.cursor = 'grab'; }; C.addEventListener('pointerup', end); C.addEventListener('pointercancel', end);
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
/* Step performance, like Klaviyo's "Performance · Based on the last 30 days". */
const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)}%` : '—');
const usd = (v) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function perfSection(id, type) {
  const p = (FL.perf || {})[id] || {}, d = p.delivered || 0;
  const row = (l, v, sub) => `<div style="display:flex;align-items:baseline;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--line)"><span>${l}</span><span style="text-align:right"><b>${v}</b>${sub ? `<div style="font-size:11.5px;color:var(--muted)">${sub}</div>` : ''}</span></div>`;
  return `<div style="margin:12px 0 16px;padding:12px 14px;border:1px solid var(--line);border-radius:12px">
    <div style="display:flex;align-items:center;gap:8px"><b style="flex:1">Performance</b><select id="flpd" aria-label="Period" style="height:30px;font-size:12.5px">${[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last 365 days']].map(([v, l]) => `<option value="${v}"${FL.perfDays === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    ${row('Recipients', fmtN(p.recipients || 0))}${type === 'send_email' ? row('Open rate', pct(p.opened || 0, d), d ? `${fmtN(p.opened || 0)} opened` : '') : ''}${row('Click rate', pct(p.clicked || 0, d), d ? `${fmtN(p.clicked || 0)} clicked` : '')}
    ${row('Placed order', p.orders ? usd(p.revenue) : '—', p.orders ? `${fmtN(p.orders)} order${p.orders > 1 ? 's' : ''} · ${pct(p.orders, p.recipients || 0)} of recipients` : '')}${row('Unsubscribe rate', pct(p.unsubscribed || 0, d))}${type === 'send_email' ? row('Bounce rate', pct(p.bounced || 0, d)) : ''}
    <div style="font-size:11.5px;color:var(--muted);margin-top:6px">Orders count when they come within the click window in Settings → Revenue credit. Test sends aren't counted.</div></div>`;
}
function drawRight() {
  const R = $('flright');
  if (!SEL || !FL.graph.nodes[SEL]) { R.innerHTML = ''; showPanel(); return; }
  const n = FL.graph.nodes[SEL], c = n.config || (n.config = {});
  const mark = () => { fldirty = true; $('fldirty').classList.remove('hidden'); drawCanvas(); };
  let body = '';
  const perfHtml = (n.type === 'send_email' || n.type === 'send_sms') ? perfSection(SEL, n.type) : '';
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
  R.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><span class="sp"></span><button class="btn xs danger" id="ndel"><i class="ti ti-trash"></i> Remove step</button></div>${perfHtml}${body}${linear ? fl2('Then goes to', nextSelect('next', n.next, SEL), 'Pick an existing step to join that path.') : ''}`;
  showPanel();
  const pd = R.querySelector('#flpd'); if (pd) pd.onchange = async () => { FL.perfDays = Number(pd.value); try { FL.perf = (await api(`/api/mk/flows/${FL.id}/performance?days=${FL.perfDays}`)).steps; } catch (e) {} drawRight(); drawCanvas(); };
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
