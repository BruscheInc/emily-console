/* Buzzin Marketing · campaigns and calendar (loaded by /marketing) */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const at = S.findIndex((x) => x.id === 'flows');
  S.splice(at, 0, { id: 'campaigns', icon: 'speakerphone', label: 'Campaigns', render: renderCampaigns });
});
const CSTATUS = { draft: ['off', 'Draft'], pending: ['hon', 'Waiting for approval'], scheduled: ['blue', 'Scheduled'], sending: ['blue', 'Sending'], sent: ['ok', 'Sent'], cancelled: ['bad', 'Stopped'] };
let VIEW = (() => { try { return localStorage.getItem('mk_camp_view') || 'list'; } catch (e) { return 'list'; } })();
let MONTH = null;

let CQ = '', CSF = '', CCH = '', CCHK = new Set();
async function renderCampaigns(el, id) {
  if (id) return editCampaign(el, id);
  const KL = window.MK_KL || {};
  let r = await api('/api/mk/campaigns?' + qs({ store: STORE }));
  let names = {}; try { for (const g of (await api('/api/mk/groups')).items) names[g.kind + ':' + g.id] = g.name; } catch (e) {}
  el.innerHTML = (KL.LCSS || '') + `<style>.kl .cb{width:18px;height:18px;accent-color:#18181B}.kl .bulk{display:flex;align-items:center;gap:10px;background:#F4F4F5;border-radius:10px;padding:8px 12px;margin-bottom:12px}
    .kl .tico{font-size:21px}.kl .seg2{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden}.kl .seg2 button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:0 14px;height:38px;color:#52525B}.kl .seg2 button.on{background:#F4F4F5;color:#18181B;font-weight:600}.kl .seg2 button+button{border-left:1px solid var(--line)}</style>
    <div class="kl"><div class="kl-h"><h1>Campaigns</h1><button class="dots" id="cmore" aria-label="More">${ICON('dots-vertical')}</button>
      <div class="seg2" role="tablist"><button data-v="list" class="${VIEW === 'list' ? 'on' : ''}">${ICON('list')} List</button><button data-v="cal" class="${VIEW === 'cal' ? 'on' : ''}">${ICON('calendar')} Calendar</button></div>
      <button class="btn pri" id="ccr">Create campaign</button></div>
    <div class="kl-b"><div class="kl-f"><input type="search" id="cq" placeholder="Search campaigns" value="${esc(CQ)}" aria-label="Search campaigns">
      <select id="csf" aria-label="Status"><option value="">Status</option>${Object.entries(CSTATUS).map(([k, [, l]]) => `<option value="${k}"${CSF === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select id="cch" aria-label="Channels"><option value="">Channels</option><option value="email"${CCH === 'email' ? ' selected' : ''}>Email</option><option value="sms"${CCH === 'sms' ? ' selected' : ''}>Text</option></select></div>
      <div id="cbulk"></div><div id="cbody"></div></div></div>`;
  const reload = async () => { r = await api('/api/mk/campaigns?' + qs({ store: STORE })); draw(); };
  const st = () => STORE || 'lb';
  const make = (channel, store) => api('/api/mk/campaigns', { method: 'POST', body: JSON.stringify({ store: store || st(), channel }) }).then((c) => { location.hash = '#campaigns/' + c.id; }).catch((e) => toast(e.message, 1));
  $('ccr').onclick = () => KL.menu($('ccr'), STORE ? [['Email', 'mail', () => make('email')], ['Text message', 'message', () => make('sms')]]
    : [['Email · Larkspur Baby', 'mail', () => make('email', 'lb')], ['Text · Larkspur Baby', 'message', () => make('sms', 'lb')], ['Email · Outlet', 'mail', () => make('email', 'lbo')], ['Text · Outlet', 'message', () => make('sms', 'lbo')]], { alignRight: true });
  $('cmore').onclick = () => KL.menu($('cmore'), [['Select all drafts', 'checkbox', () => { r.campaigns.filter((c) => c.status === 'draft').forEach((c) => CCHK.add(String(c.id))); draw(); }]], { alignRight: true });
  el.querySelectorAll('.seg2 button').forEach((b) => b.onclick = () => { VIEW = b.dataset.v; try { localStorage.setItem('mk_camp_view', VIEW); } catch (e) {} el.querySelectorAll('.seg2 button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  $('cq').oninput = () => { CQ = $('cq').value; draw(); }; $('csf').onchange = () => { CSF = $('csf').value; draw(); }; $('cch').onchange = () => { CCH = $('cch').value; draw(); };
  const del = async (list) => {
    list = list.filter((c) => c.status !== 'sending'); if (!list.length) return toast('Stop a sending campaign before deleting it.', 1);
    if (!confirm(list.length === 1 ? `Delete the campaign "${list[0].name}"?` : `Delete ${list.length} campaigns?`)) return;
    let n = 0; for (const c of list) { try { await api('/api/mk/campaigns/' + c.id, { method: 'DELETE' }); n++; CCHK.delete(String(c.id)); } catch (e) { toast(e.message, 1); } }
    toast(`Deleted ${n}`); reload();
  };
  const rowMenu = (c, anchor) => KL.menu(anchor, [
    [c.status === 'sent' || c.status === 'sending' ? 'View report' : 'Edit', c.status === 'sent' ? 'chart-bar' : 'pencil', () => { location.hash = '#campaigns/' + c.id; }],
    ['Rename', 'pencil', async () => { const n = prompt('Campaign name', c.name); if (!n || n === c.name) return; try { await api('/api/mk/campaigns/' + c.id, { method: 'PUT', body: JSON.stringify({ name: n.slice(0, 150) }) }); toast('Renamed'); reload(); } catch (e) { toast(e.message, 1); } }],
    ['Clone', 'copy', async () => { try { const x = await api('/api/mk/campaigns', { method: 'POST', body: JSON.stringify({ copy_of: c.id }) }); location.hash = '#campaigns/' + x.id; } catch (e) { toast(e.message, 1); } }],
    ['Delete', 'trash', () => del([c]), { danger: true, disabled: c.status === 'sending' }],
  ], { alignRight: true });
  const aud = (c) => ((c.audience || {}).include || []).map((x) => names[x.kind + ':' + x.id] || (x.kind === 'segment' ? 'Segment' : 'List')).join(', ');
  const pct = (a, b) => (b ? `${(100 * a / b).toFixed(2)}%` : '—');
  const draw = () => {
    const rows = r.campaigns.filter((c) => (!CQ || (c.name + ' ' + (c.subject || '')).toLowerCase().includes(CQ.toLowerCase())) && (!CSF || c.status === CSF) && (!CCH || c.channel === CCH));
    if (VIEW === 'cal') { $('cbulk').innerHTML = ''; return calendar($('cbody'), rows); }
    $('cbody').innerHTML = `<table><thead><tr><th style="width:34px"><input type="checkbox" class="cb" id="call" aria-label="Select all"></th><th>Campaign</th><th>Type</th><th>Status</th><th>Send date</th><th class="n">Open rate</th><th class="n">Click rate</th><th style="width:44px"></th></tr></thead><tbody>
      ${rows.map((c) => { const d = c.sent_at || c.start_at; return `<tr class="row"><td><input type="checkbox" class="cb" data-ck="${c.id}"${CCHK.has(String(c.id)) ? ' checked' : ''} aria-label="Select ${esc(c.name)}"></td>
        <td><a class="nm" href="#campaigns/${c.id}">${esc(c.name)}</a><div class="sub2">${esc(aud(c) || 'No audience yet')}${STORE ? '' : ` · ${c.store === 'lbo' ? 'Outlet' : 'Larkspur Baby'}`}</div>${c.note ? `<div class="sub2" style="color:var(--honey-ink)">${esc(c.note)}</div>` : ''}</td>
        <td title="${c.channel === 'sms' ? 'Text' : 'Email'}" style="font-size:21px">${ICON(c.channel === 'sms' ? 'message' : 'mail')}${c.ab && c.ab.enabled ? ' <span class="st">A/B</span>' : ''}</td>
        <td><span class="st${c.status === 'sent' ? ' live' : c.status === 'scheduled' || c.status === 'pending' ? ' preview' : ''}">${esc((CSTATUS[c.status] || [, c.status])[1])}</span></td>
        <td>${d ? `${fmtD(d)}<div class="sub2">${new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>` : esc(when(c))}</td>
        <td class="n">${c.channel === 'sms' ? '—' : pct(c.opened, c.delivered)}</td><td class="n">${pct(c.clicked, c.delivered)}${c.recipients != null ? `<div class="sub2">${fmtN(c.recipients)} recipients</div>` : ''}</td>
        <td><button class="dots" data-cm="${c.id}" aria-label="Options for ${esc(c.name)}">${ICON('dots-vertical')}</button></td></tr>`; }).join('') || '<tr><td colspan="8" class="empty">No campaigns match.</td></tr>'}</tbody></table>
      <div style="padding:14px 0;color:#3F3F46">${rows.length ? `1 - ${rows.length} of ${rows.length}` : ''}</div>`;
    const find = (id) => r.campaigns.find((c) => String(c.id) === String(id));
    $('cbody').querySelectorAll('[data-cm]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); rowMenu(find(b.dataset.cm), b); });
    $('cbody').querySelectorAll('[data-ck]').forEach((x) => x.onchange = () => { if (x.checked) CCHK.add(x.dataset.ck); else CCHK.delete(x.dataset.ck); bulk(); });
    $('call').checked = rows.length > 0 && rows.every((c) => CCHK.has(String(c.id)));
    $('call').onchange = () => { rows.forEach((c) => ($('call').checked ? CCHK.add(String(c.id)) : CCHK.delete(String(c.id)))); draw(); };
    bulk();
  };
  const bulk = () => { const picked = r.campaigns.filter((c) => CCHK.has(String(c.id)));
    $('cbulk').innerHTML = picked.length ? `<div class="bulk"><b>${picked.length} selected</b><span style="flex:1"></span><button class="btn xs" id="cclr">Clear</button><button class="btn xs danger" id="cdel">${ICON('trash')} Delete</button></div>` : '';
    if (picked.length) { $('cclr').onclick = () => { CCHK.clear(); draw(); }; $('cdel').onclick = () => del(picked); } };
  draw();
}
const ICON = (n) => `<i class="ti ti-${n}"></i>`;
const when = (c) => c.sent_at ? fmtDT(c.sent_at) : c.start_at ? fmtDT(c.start_at) : (c.schedule && c.schedule.mode === 'local' && c.schedule.date ? `${fmtD(c.schedule.date + 'T12:00:00')} ${c.schedule.time} local` : '—');
function calendar(host, list) {
  const now = new Date(); MONTH = MONTH || new Date(now.getFullYear(), now.getMonth(), 1);
  const y = MONTH.getFullYear(), m = MONTH.getMonth();
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), lead = first.getDay();
  const byDay = {};
  for (const c of list) {
    let d = c.sent_at || c.start_at; if (!d && c.schedule && c.schedule.mode === 'local' && c.schedule.date) d = c.schedule.date + 'T12:00:00';
    if (!d) continue; const x = new Date(d); if (x.getFullYear() !== y || x.getMonth() !== m) continue;
    (byDay[x.getDate()] = byDay[x.getDate()] || []).push(c);
  }
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="cal-c off"></div>');
  for (let d = 1; d <= days; d++) {
    const today = now.getFullYear() === y && now.getMonth() === m && now.getDate() === d;
    cells.push(`<div class="cal-c${today ? ' today' : ''}"><div class="cal-d">${d}</div>${(byDay[d] || []).map((c) => `<a href="#campaigns/${c.id}" class="cal-e ${c.status}"><i class="ti ti-${c.channel === 'sms' ? 'message' : 'mail'}"></i> ${esc(c.name)}</a>`).join('')}</div>`);
  }
  const undated = list.filter((c) => c.status === 'draft' && !c.start_at && !(c.schedule && c.schedule.mode === 'local' && c.schedule.date));
  host.innerHTML = `<style>.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}.cal-h{background:var(--panel2);padding:6px 8px;font-size:12px;font-weight:700;color:var(--muted)}.cal-c{background:#fff;min-height:96px;padding:6px}.cal-c.off{background:var(--panel2)}.cal-c.today .cal-d{background:var(--ink);color:#fff;border-radius:999px;display:inline-block;padding:0 7px}.cal-d{font-size:12px;font-weight:700;margin-bottom:4px}.cal-e{display:block;font-size:12px;padding:3px 6px;border-radius:6px;margin-top:3px;background:var(--panel2);color:var(--ink);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.cal-e.scheduled,.cal-e.sending{background:#E6EEFB}.cal-e.sent{background:#E5F3EA}.cal-e.pending{background:#FFF3D6}</style>
  <div class="bar" style="align-items:center"><button class="btn xs" id="cprev" aria-label="Previous month"><i class="ti ti-chevron-left"></i></button><b style="font-size:16px;min-width:150px;text-align:center">${first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</b><button class="btn xs" id="cnext" aria-label="Next month"><i class="ti ti-chevron-right"></i></button><button class="btn xs" id="ctoday">Today</button></div>
  <div class="cal">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<div class="cal-h">${d}</div>`).join('')}${cells.join('')}</div>
  ${undated.length ? `<div class="card" style="margin-top:14px"><b>Drafts without a date</b>${undated.map((c) => `<div style="margin-top:6px"><a href="#campaigns/${c.id}">${esc(c.name)}</a></div>`).join('')}</div>` : ''}`;
  $('cprev').onclick = () => { MONTH = new Date(y, m - 1, 1); calendar(host, list); };
  $('cnext').onclick = () => { MONTH = new Date(y, m + 1, 1); calendar(host, list); };
  $('ctoday').onclick = () => { MONTH = null; calendar(host, list); };
}

/* ---------- editor ---------- */
let CP = null, cdirty = false;
const SHOW_EDIT = new Set();   // campaigns opened with "View campaign" from their report
async function editCampaign(el, id) {
  CP = await api('/api/mk/campaigns/' + id); cdirty = false;
  if (['sending', 'sent'].includes(CP.status) && !SHOW_EDIT.has(String(id)) && window.MK_campaignReport) return window.MK_campaignReport(el, CP, () => { SHOW_EDIT.add(String(id)); editCampaign(el, id); });
  SHOW_EDIT.delete(String(id));
  const ro = CP.status !== 'draft';
  const isE = CP.channel === 'email';
  el.innerHTML = `<div class="bar" style="align-items:center;flex-wrap:wrap"><a href="#campaigns" class="bz-crumb">Campaigns</a><span style="color:var(--bz-faint)">/</span><input id="cn" type="text" value="${esc(CP.name)}" class="bz-title-in" aria-label="Campaign name"${ro ? ' disabled' : ''}>${pill(CSTATUS, CP.status)}<span class="pill off">${CP.store === 'lbo' ? 'Outlet' : 'Larkspur Baby'} · ${isE ? 'Email' : 'Text'}</span>
    <span class="sp"></span><span class="pill hon hidden" id="cd">Unsaved</span>
    ${['sending', 'sent'].includes(CP.status) ? '<button class="btn" id="crpt"><i class="ti ti-chart-bar"></i> View report</button>' : ''}<button class="btn" id="ccopy"><i class="ti ti-copy"></i> Copy</button>${ro ? '' : '<button class="btn danger" id="cdel"><i class="ti ti-trash"></i></button>'}<button class="btn" id="cpv"><i class="ti ti-eye"></i> Preview</button><button class="btn" id="ctest"><i class="ti ti-send"></i> Send a test</button>
    ${CP.status === 'draft' ? '<button class="btn" id="csave">Save</button><button class="btn pri" id="csched"><i class="ti ti-calendar-check"></i> Schedule</button>' : ''}
    ${CP.status === 'pending' ? '<button class="btn" id="cunsched">Back to draft</button><button class="btn pri" id="capprove"><i class="ti ti-check"></i> Approve</button>' : ''}
    ${CP.status === 'scheduled' ? '<button class="btn" id="cunsched">Unschedule</button>' : ''}${CP.status === 'sending' ? '<button class="btn danger" id="cstop">Stop sending</button>' : ''}</div>
  ${CP.note ? `<div class="note">${esc(CP.note)}</div>` : ''}${!CP.sending_on && ['draft', 'pending', 'scheduled'].includes(CP.status) ? `<div class="note" style="background:var(--panel2);color:var(--muted)">${isE ? 'Email' : 'Text'} sending is off for this store, so a scheduled campaign won't go out. It waits up to 6 hours past its time, then returns to Draft. Tests are held too until a sender is connected.</div>` : ''}
  <div id="cprob"></div>
  <div style="display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:14px;align-items:start">
    <div><div class="card" id="caud"></div><div class="card" id="ccontent" style="margin-top:14px"></div><div class="card" id="cab" style="margin-top:14px"></div><div class="card" id="ctime" style="margin-top:14px"></div>${isE ? '<div class="card" id="cresend" style="margin-top:14px"></div>' : ''}</div>
    <div style="position:sticky;top:12px"><div class="card" id="cest"></div><div class="card" id="cprev" style="margin-top:14px;padding:0;overflow:hidden"></div>${CP.report && CP.status !== 'draft' ? '<div class="card" id="crep" style="margin-top:14px"></div>' : ''}</div></div>`;
  const mark = () => { cdirty = true; $('cd').classList.remove('hidden'); };
  window.onbeforeunload = () => cdirty ? 'Unsaved changes' : undefined;
  if (!ro) $('cn').oninput = () => { CP.name = $('cn').value; mark(); };
  drawProblems(); drawAudience(ro, mark); drawContent(ro, mark); drawAB(ro, mark); drawTiming(ro, mark); if (isE) drawResend(ro, mark); estimate(); previewMsg(); if ($('crep')) drawReport();
  const act = (btn, path, msg) => { const b = $(btn); if (b) b.onclick = async () => { try { if (cdirty) await save(); await api(`/api/mk/campaigns/${CP.id}/${path}`, { method: 'POST', body: '{}' }); toast(msg); cdirty = false; go(); } catch (e) { toast(e.message, 1); } }; };
  act('csched', 'schedule', 'Scheduled (or sent for approval)'); act('capprove', 'approve', 'Approved and scheduled'); act('cunsched', 'unschedule', 'Back to draft'); act('cstop', 'cancel', 'Stopped');
  if ($('csave')) $('csave').onclick = () => save().then(() => toast('Saved')).catch((e) => toast(e.message, 1));
  $('ccopy').onclick = async () => { try { const c = await api('/api/mk/campaigns', { method: 'POST', body: JSON.stringify({ copy_of: CP.id }) }); cdirty = false; location.hash = '#campaigns/' + c.id; } catch (e) { toast(e.message, 1); } };
  if ($('cdel')) $('cdel').onclick = async () => { if ($('cdel').dataset.c !== '1') { $('cdel').dataset.c = '1'; $('cdel').textContent = 'Click again to delete'; return; } try { await api('/api/mk/campaigns/' + CP.id, { method: 'DELETE' }); cdirty = false; location.hash = '#campaigns'; } catch (e) { toast(e.message, 1); } };
  if ($('crpt')) $('crpt').onclick = () => editCampaign(el, id);
  $('ctest').onclick = () => testUI(true); $('cpv').onclick = () => testUI(false);
}
async function save() {
  const r = await api('/api/mk/campaigns/' + CP.id, { method: 'PUT', body: JSON.stringify({ name: CP.name, audience: CP.audience, content: CP.content, ab: CP.ab, schedule: CP.schedule, smart_sending: CP.smart_sending, resend: CP.resend }) });
  CP.problems = r.problems; cdirty = false; $('cd').classList.add('hidden'); drawProblems();
}
function drawProblems() { $('cprob').innerHTML = CP.status === 'draft' && (CP.problems || []).length ? `<div class="note">Before scheduling: ${CP.problems.map(esc).join(' ')}</div>` : ''; }
const dis = (ro) => (ro ? ' disabled' : '');

function drawAudience(ro, mark) {
  const a = CP.audience || (CP.audience = {}); a.include = a.include || []; a.exclude = a.exclude || [];
  const name = (x) => x.kind === 'segment' ? ((CP.segments.find((s) => String(s.id) === String(x.id)) || {}).name || 'Segment #' + x.id) : ((CP.lists.find((s) => String(s.id) === String(x.id)) || {}).name || 'List #' + x.id);
  const size = (x) => { const o = x.kind === 'segment' ? CP.segments.find((s) => String(s.id) === String(x.id)) : CP.lists.find((s) => String(s.id) === String(x.id)); const n = o ? (x.kind === 'segment' ? o.member_count : (o.members != null ? o.members : o.size)) : null; return n == null ? '' : ` · ${fmtN(n)}`; };
  const chips = (arr, key) => arr.map((x, i) => `<span class="pill ${key === 'include' ? 'blue' : 'off'}" style="display:inline-flex;gap:4px;align-items:center;margin:3px 4px 0 0"><i class="ti ti-${x.kind === 'segment' ? 'filter' : 'list-details'}"></i>${esc(name(x))}${size(x)}${ro ? '' : `<button class="btn xs" data-rm="${key}:${i}" style="padding:0 4px;min-height:0;border:0;background:none" aria-label="Remove">×</button>`}</span>`).join('') || `<span style="color:var(--muted)">${key === 'include' ? 'Nobody yet' : 'Nobody'}</span>`;
  const picker = (key) => ro ? '' : `<select data-add="${key}" style="margin-top:6px;max-width:100%"><option value="">+ Add a list or segment…</option><optgroup label="Segments">${CP.segments.map((s) => `<option value="segment:${s.id}">${esc(s.name)}${s.member_count != null ? ` (${fmtN(s.member_count)})` : ''}</option>`).join('')}</optgroup><optgroup label="Lists">${CP.lists.map((s) => `<option value="list:${s.id}">${esc(s.name)}</option>`).join('')}</optgroup></select>`;
  $('caud').innerHTML = `<div style="font-weight:800;font-size:15px"><i class="ti ti-users"></i> Who gets it</div>
    <label class="lab">Send to anyone in</label><div>${chips(a.include, 'include')}</div>${picker('include')}
    <label class="lab" style="margin-top:12px">Except anyone in</label><div>${chips(a.exclude, 'exclude')}</div>${picker('exclude')}
    <label style="display:flex;gap:6px;align-items:center;margin-top:12px"><input type="checkbox" id="cskip"${a.skip_open_problems !== false ? ' checked' : ''}${dis(ro)}> Leave out people with an open ticket, an open claim or a return in the last 14 days</label>
    <div style="font-size:12px;color:var(--muted);margin-top:6px">Only people who said yes to ${CP.channel === 'sms' ? 'texts' : 'email'} are included. The list is fixed when sending starts.</div>`;
  if (ro) return;
  $('caud').querySelectorAll('[data-add]').forEach((s) => s.onchange = () => { if (!s.value) return; const [kind, id] = s.value.split(':'); const arr = a[s.dataset.add]; if (!arr.some((x) => x.kind === kind && String(x.id) === id)) arr.push({ kind, id: Number(id) }); mark(); drawAudience(ro, mark); estimate(); });
  $('caud').querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { const [k, i] = b.dataset.rm.split(':'); a[k].splice(Number(i), 1); mark(); drawAudience(ro, mark); estimate(); });
  $('cskip').onchange = (e) => { a.skip_open_problems = e.target.checked; mark(); estimate(); };
}
const money = (x) => '$' + Number(x || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Estimated cost box under the audience count (email: SES send + data fee and daily-limit check; text: segments × price). */
function costHtml(c) {
  if (!c) return '';
  if (c.error) return `<div class="note" style="margin-top:10px">Cost estimate unavailable: ${esc(c.error)}</div>`;
  const row = (l, v) => `<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:4px"><span style="color:var(--muted)">${l}</span><span>${v}</span></div>`;
  let h = `<div style="border-top:1px solid var(--line);margin-top:12px;padding-top:12px"><div style="color:var(--muted);font-size:12.5px;font-weight:700">ESTIMATED COST</div>`;
  if (c.channel === 'sms') {
    if (c.total == null) return h + `<div style="font-size:13px;margin-top:6px">${fmtN(c.sends)} texts × ${c.segments} segment${c.segments === 1 ? '' : 's'} each. The price fills in on its own once AWS reports back on the next texts sent (or set one in <a href="#texting">Texting</a>).</div></div>`;
    return h + `<div style="font-size:26px;font-weight:800">${money(c.total)}</div>${row('Texts', fmtN(c.sends))}${row('Segments each', `${c.segments}${c.encoding ? ` (${esc(c.encoding)})` : ''}`)}${row('Price per segment', '$' + c.per_segment)}<div style="font-size:11.5px;color:var(--muted);margin-top:6px">${c.rate_source === 'aws' ? `Price is AWS's real charge (incl. carrier fees) from your last ${fmtN(c.rate_texts)} delivered texts.` : c.rate_source === 'default' ? "Price is AWS's US toll-free list price incl. carrier fees. It switches to your real price once AWS reports on delivered texts." : 'Price is the one set in Texting.'}</div></div>`;
  }
  h += `<div style="font-size:26px;font-weight:800">${money(c.total)}</div>${row('Emails', fmtN(c.sends))}${row(`Sending ($${Number(c.per_1000).toFixed(2)} per 1,000) <a href="javascript:void 0" data-rate style="font-size:12px">change</a>`, money(c.send_fee))}${row(`Data (${c.email_kb} KB each, $0.12/GB)`, money(c.data_fee))}`;
  const s = c.ses, warn = [];
  if (s) {
    if (!s.production) warn.push('Amazon SES is still in sandbox mode, so it only sends to verified addresses. Request production access in AWS before a big send.');
    else if (s.left_today != null && c.sends > s.left_today) warn.push(`Amazon SES lets you send ${fmtN(s.per_day)} emails a day and has ${fmtN(s.left_today)} left today, so ${fmtN(c.sends - s.left_today)} would wait until the limit resets. Ask AWS to raise it, or send over more than one day.`);
    if (s.sending_enabled === false) warn.push('Sending is paused on the Amazon SES account.');
    if (s.per_second) { const r = Math.max(1, Math.floor(s.per_second * 0.9)); h += row('Speed', `${fmtN(r)} emails a second · about ${Math.max(1, Math.ceil(c.sends / r / 60))} min`); }
    if (s.per_day) h += row('Daily limit', `${fmtN(s.per_day)}${s.left_today != null ? ` (${fmtN(s.left_today)} left)` : ''}`);
  }
  return h + warn.map((w) => `<div class="note" style="margin-top:8px">${esc(w)}</div>`).join('') + `<div style="font-size:11.5px;color:var(--muted);margin-top:6px">Estimate only — your AWS bill is the final number.</div></div>`;
}
let estT = null;
function estimate() {
  clearTimeout(estT); estT = setTimeout(async () => {
    const box = $('cest'); if (!box) return;
    if (['sending', 'sent', 'cancelled'].includes(CP.status)) { box.innerHTML = `<div style="color:var(--muted);font-size:12.5px;font-weight:700">AUDIENCE WHEN IT STARTED</div><div style="font-size:30px;font-weight:800">${fmtN(CP.recipients)}</div><div style="color:var(--muted)">people${CP.started_at ? ` · started ${fmtDT(CP.started_at)}` : ''}${CP.sent_at ? ` · finished ${fmtDT(CP.sent_at)}` : ''}</div>`; return; }
    try { const r = await api('/api/mk/campaigns/estimate', { method: 'POST', body: JSON.stringify({ store: CP.store, channel: CP.channel, audience: CP.audience, smart_sending: CP.smart_sending, content: CP.content, ab: CP.ab }) });
      box.innerHTML = `<div style="color:var(--muted);font-size:12.5px;font-weight:700">ABOUT</div><div style="font-size:30px;font-weight:800">${fmtN(r.recipients)}</div><div style="color:var(--muted)">people would get it right now${r.without_consent ? ` · ${fmtN(r.without_consent)} more in these groups haven't said yes to ${CP.channel === 'sms' ? 'texts' : 'email'}` : ''}${r.smart_skipped_now ? ` · ${fmtN(r.smart_skipped_now)} would be skipped by smart sending` : ''}</div>${costHtml(r.cost)}`;
      const ch = box.querySelector('[data-rate]'); if (ch) ch.onclick = async () => {
        const v = prompt('Amazon SES price per 1,000 emails (USD). Pay-as-you-go is 0.10; the Essentials plan is 0.16.', String(r.cost.per_1000)); if (v == null || v === '') return;
        try { await api('/api/mk/settings', { method: 'PUT', body: JSON.stringify({ email_cost_per_1000: Number(v) }) }); estimate(); } catch (e) { toast(e.message, 1); } };
    } catch (e) { box.innerHTML = `<div class="note">${esc(e.message)}</div>`; }
  }, 300);
}

function drawContent(ro, mark) {
  const c = CP.content || (CP.content = {});
  if (CP.channel === 'email') {
    $('ccontent').innerHTML = `<div style="font-weight:800;font-size:15px"><i class="ti ti-mail"></i> The email</div>
      <label class="lab" for="ctpl">Email</label><div style="display:flex;gap:6px"><select id="ctpl" style="flex:1"${dis(ro)}><option value="">Choose…</option>${CP.templates.map((t) => `<option value="${t.id}"${String(c.template_id) === String(t.id) ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>${c.template_id ? `<a class="btn" href="#templates/${c.template_id}"><i class="ti ti-pencil"></i> Edit</a>` : ''}${ro ? '' : '<button class="btn" id="cnewtpl"><i class="ti ti-plus"></i> New</button>'}</div>
      <label class="lab" for="csub">Subject line</label><div style="display:flex;gap:6px"><input id="csub" type="text" value="${esc(c.subject || '')}" placeholder="Leave empty to use the email's own subject" style="flex:1"${dis(ro)}>${ro ? '' : '<button class="btn" id="cai"><i class="ti ti-sparkles"></i> Ideas</button>'}</div>
      <label class="lab" for="cpre">Preview text</label><input id="cpre" type="text" value="${esc(c.preview || '')}" style="width:100%"${dis(ro)}>
      <label style="display:flex;gap:6px;align-items:center;margin-top:12px"><input type="checkbox" id="csmart"${CP.smart_sending ? ' checked' : ''}${dis(ro)}> Smart sending: skip anyone emailed in the last few hours (set in Settings)</label>`;
    if (ro) return;
    $('ctpl').onchange = (e) => { c.template_id = e.target.value ? Number(e.target.value) : null; mark(); drawContent(ro, mark); previewMsg(); estimate(); };
    $('csub').oninput = (e) => { c.subject = e.target.value; mark(); };
    $('cpre').oninput = (e) => { c.preview = e.target.value; mark(); };
    $('csmart').onchange = (e) => { CP.smart_sending = e.target.checked; mark(); estimate(); };
    $('cai').onclick = () => window.MK_aiPick ? MK_aiPick('subject', `Campaign: ${CP.name}`, (o) => { c.subject = o.subject; c.preview = o.preview || c.preview; mark(); drawContent(ro, mark); }, c.subject) : toast('Open Email templates once to load Emily', 1);
    $('cnewtpl').onclick = async () => { try { const t = await api('/api/mk/templates', { method: 'POST', body: JSON.stringify({ store: CP.store, name: CP.name }) }); c.template_id = t.id; await save(); location.hash = '#templates/' + t.id; } catch (e) { toast(e.message, 1); } };
  } else {
    $('ccontent').innerHTML = `<div style="font-weight:800;font-size:15px"><i class="ti ti-message"></i> The text</div>
      <label class="lab" for="cbody">Message</label><textarea id="cbody" rows="5" style="width:100%"${dis(ro)}>${esc(c.body || '')}</textarea>
      <div style="display:flex;gap:6px;margin-top:6px">${ro ? '' : '<button class="btn xs" id="cai"><i class="ti ti-sparkles"></i> Ideas</button>'}<span class="sp"></span><span style="font-size:12px;color:var(--muted)">Use {{ first_name | default: "there" }} to personalize.</span></div>
      <label style="display:flex;gap:6px;align-items:center;margin-top:10px"><input type="checkbox" id="copt"${c.add_opt_out !== false ? ' checked' : ''}${dis(ro)}> Add "Reply STOP to opt out"</label>
      <label style="display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" id="csmart"${CP.smart_sending ? ' checked' : ''}${dis(ro)}> Smart sending: skip anyone texted in the last day</label>
      <div style="font-size:12px;color:var(--muted);margin-top:6px">Texts are never sent during quiet hours in the person's time zone; they wait until morning.</div>`;
    if (ro) return;
    let t = null;
    $('cbody').oninput = (e) => { c.body = e.target.value; mark(); clearTimeout(t); t = setTimeout(() => { previewMsg(); estimate(); }, 300); };
    $('copt').onchange = (e) => { c.add_opt_out = e.target.checked; mark(); previewMsg(); };
    $('csmart').onchange = (e) => { CP.smart_sending = e.target.checked; mark(); estimate(); };
    $('cai').onclick = () => window.MK_aiPick ? MK_aiPick('sms', `Campaign: ${CP.name}`, (o) => { c.body = o.body || o.text || c.body; mark(); drawContent(ro, mark); previewMsg(); }, c.body) : toast('Emily is not loaded', 1);
  }
}
async function previewMsg() {
  const box = $('cprev'); if (!box) return;
  const c = CP.content || {};
  try {
    if (CP.channel === 'sms') {
      const r = await api('/api/mk/sms/preview', { method: 'POST', body: JSON.stringify({ store: CP.store, body: c.body || '', add_opt_out: c.add_opt_out !== false }) });
      box.innerHTML = `<div style="padding:14px"><div style="font-weight:700;margin-bottom:8px">Preview</div><div style="max-width:300px;background:#E9E9EB;border-radius:18px;padding:10px 14px;white-space:pre-wrap;font-size:14px">${esc(r.body)}</div><div style="font-size:12px;color:var(--muted);margin-top:8px">${r.chars} characters · ${r.segments} segment${r.segments === 1 ? '' : 's'} (${esc(r.encoding)}) · each segment is billed</div></div>`;
      return;
    }
    if (!c.template_id) { box.innerHTML = '<div class="empty">Choose an email to see it here.</div>'; return; }
    const t = await api('/api/mk/templates/' + c.template_id);
    const r = await api('/api/mk/templates/render', { method: 'POST', body: JSON.stringify({ store: CP.store, subject: c.subject || t.subject, preview: c.preview || t.preview, blocks: t.blocks, doc: t.doc || null }) });
    box.innerHTML = `<div style="padding:10px 14px;border-bottom:1px solid var(--line)"><div style="font-weight:700">${esc(r.subject || '')}</div><div style="font-size:12.5px;color:var(--muted)">${esc(c.preview || t.preview || '')}</div></div><iframe title="Email preview" style="width:100%;height:560px;border:0;display:block" sandbox=""></iframe>`;
    box.querySelector('iframe').srcdoc = r.html;
  } catch (e) { box.innerHTML = `<div class="note">${esc(e.message)}</div>`; }
}

function drawAB(ro, mark) {
  const ab = CP.ab || (CP.ab = { enabled: false, variants: [], test_pct: 20, wait_hours: 4, metric: 'open' });
  const isE = CP.channel === 'email';
  const vEd = (v, i) => `<div class="card" style="padding:10px;margin-top:8px;background:var(--panel2)"><div style="display:flex;align-items:center"><b>Version ${String.fromCharCode(65 + i)}</b><span class="sp"></span>${ro || ab.variants.length <= 2 ? '' : `<button class="btn xs" data-vrm="${i}">Remove</button>`}</div>
    ${isE ? `<label class="lab">Subject</label><input data-v="${i}" data-f="subject" type="text" value="${esc(v.subject || '')}" style="width:100%"${dis(ro)}><label class="lab">Email (optional — leave empty to test only the subject)</label><select data-v="${i}" data-f="template_id" style="width:100%"${dis(ro)}><option value="">Same email</option>${CP.templates.map((t) => `<option value="${t.id}"${String(v.template_id) === String(t.id) ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select>`
      : `<label class="lab">Text</label><textarea data-v="${i}" data-f="body" rows="3" style="width:100%"${dis(ro)}>${esc(v.body || '')}</textarea>`}</div>`;
  $('cab').innerHTML = `<label style="display:flex;gap:8px;align-items:center;font-weight:800;font-size:15px"><input type="checkbox" id="caben"${ab.enabled ? ' checked' : ''}${dis(ro)}><i class="ti ti-flask"></i> A/B test</label>
    ${ab.enabled ? `<div style="font-size:12.5px;color:var(--muted);margin-top:4px">A test group gets the versions evenly. After the wait, everyone else gets the version with the best ${ab.metric === 'click' ? 'click' : 'open'} rate.</div>
      ${(ab.variants || []).map(vEd).join('')}${ro || ab.variants.length >= 4 ? '' : '<button class="btn xs" id="cvadd" style="margin-top:8px"><i class="ti ti-plus"></i> Add version</button>'}
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:10px;align-items:end"><div><label class="lab">Test group</label><input id="cabp" type="number" min="5" max="50" value="${ab.test_pct}" style="width:80px"${dis(ro)}> %</div><div><label class="lab">Then wait</label><input id="cabw" type="number" min="1" max="72" value="${ab.wait_hours}" style="width:80px"${dis(ro)}> hours</div>
      ${isE ? `<div><label class="lab">Winner by</label><select id="cabm"${dis(ro)}><option value="open"${ab.metric === 'open' ? ' selected' : ''}>Open rate</option><option value="click"${ab.metric === 'click' ? ' selected' : ''}>Click rate</option></select></div>` : ''}</div>
      ${ab.winner ? `<div class="note" style="margin-top:10px;background:#E5F3EA;color:var(--ink)">Winner: version ${esc(ab.winner)}</div>` : ''}` : '<div style="font-size:12.5px;color:var(--muted);margin-top:4px">Try two to four subject lines (or emails) on part of the audience first.</div>'}`;
  if (ro) return;
  $('caben').onchange = (e) => { ab.enabled = e.target.checked; if (ab.enabled && (ab.variants || []).length < 2) ab.variants = isE ? [{ subject: (CP.content || {}).subject || '' }, { subject: '' }] : [{ body: (CP.content || {}).body || '' }, { body: '' }]; mark(); drawAB(ro, mark); };
  $('cab').querySelectorAll('[data-v]').forEach((x) => x.oninput = x.onchange = () => { const v = ab.variants[Number(x.dataset.v)]; v[x.dataset.f] = x.dataset.f === 'template_id' ? (x.value ? Number(x.value) : null) : x.value; mark(); });
  $('cab').querySelectorAll('[data-vrm]').forEach((b) => b.onclick = () => { ab.variants.splice(Number(b.dataset.vrm), 1); mark(); drawAB(ro, mark); });
  const add = $('cvadd'); if (add) add.onclick = () => { ab.variants.push(isE ? { subject: '' } : { body: '' }); mark(); drawAB(ro, mark); };
  const b = (id, k) => { const x = $(id); if (x) x.oninput = x.onchange = () => { ab[k] = x.type === 'number' ? Number(x.value) : x.value; mark(); }; };
  b('cabp', 'test_pct'); b('cabw', 'wait_hours'); b('cabm', 'metric');
}

function drawTiming(ro, mark) {
  const s = CP.schedule || (CP.schedule = { mode: 'now' });
  const local = (d) => { if (!d) return ''; const x = new Date(d); const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`; };
  $('ctime').innerHTML = `<div style="font-weight:800;font-size:15px"><i class="ti ti-clock"></i> When</div>
    ${[['now', 'As soon as it\'s scheduled'], ['at', 'At a set time'], ['local', 'At a set hour in each person\'s time zone']].map(([k, l]) => `<label style="display:flex;gap:6px;align-items:center;margin-top:8px"><input type="radio" name="cmode" value="${k}"${s.mode === k ? ' checked' : ''}${dis(ro)}> ${l}</label>`).join('')}
    ${s.mode === 'at' ? `<input id="cat" type="datetime-local" value="${local(s.at)}" style="margin-top:8px"${dis(ro)}><div style="font-size:12px;color:var(--muted);margin-top:4px">Your computer's time.</div>` : ''}
    ${s.mode === 'local' ? `<div style="display:flex;gap:8px;margin-top:8px"><input id="cld" type="date" value="${esc(s.date || '')}"${dis(ro)}><input id="clt" type="time" value="${esc(s.time || '10:00')}"${dis(ro)}></div><div style="font-size:12px;color:var(--muted);margin-top:4px">Each person gets it at this hour where they live (Central time if unknown). Schedule it at least a day ahead so every time zone can make it.</div>` : ''}
    ${CP.start_at ? `<div style="margin-top:10px"><b>Starts:</b> ${fmtDT(CP.start_at)}</div>` : ''}${CP.approval && CP.approval.requested_by ? `<div style="font-size:12.5px;color:var(--muted);margin-top:4px">Requested by ${esc(CP.approval.requested_by)}${CP.approval.approved_by ? ` · approved by ${esc(CP.approval.approved_by)}` : ''}</div>` : ''}`;
  if (ro) return;
  $('ctime').querySelectorAll('[name=cmode]').forEach((r) => r.onchange = () => { s.mode = r.value; if (s.mode === 'local' && !s.time) s.time = '10:00'; mark(); drawTiming(ro, mark); });
  const at = $('cat'); if (at) at.onchange = () => { s.at = at.value ? new Date(at.value).toISOString() : null; mark(); };
  const ld = $('cld'); if (ld) ld.onchange = () => { s.date = ld.value; mark(); };
  const lt = $('clt'); if (lt) lt.onchange = () => { s.time = lt.value; mark(); };
}
function drawResend(ro, mark) {
  const r = CP.resend || (CP.resend = { enabled: false, after_hours: 48, subject: '' });
  $('cresend').innerHTML = `<label style="display:flex;gap:8px;align-items:center;font-weight:800;font-size:15px"><input type="checkbox" id="cren"${r.enabled ? ' checked' : ''}${dis(ro)}><i class="ti ti-repeat"></i> Resend to people who didn't open</label>
    ${r.enabled ? `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;align-items:end"><div><label class="lab">After</label><input id="crh" type="number" min="12" max="168" value="${r.after_hours}" style="width:80px"${dis(ro)}> hours</div><div style="flex:1;min-width:220px"><label class="lab">New subject line</label><input id="crs" type="text" value="${esc(r.subject || '')}" placeholder="Leave empty to keep the same one" style="width:100%"${dis(ro)}></div></div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">Apple Mail "opens" are ignored, so people whose phone opened it automatically still count as not opened.${r.done ? ' Resend already went out.' : ''}</div>` : ''}`;
  if (ro) return;
  $('cren').onchange = (e) => { r.enabled = e.target.checked; mark(); drawResend(ro, mark); };
  const h = $('crh'); if (h) h.oninput = () => { r.after_hours = Number(h.value); mark(); };
  const s = $('crs'); if (s) s.oninput = () => { r.subject = s.value; mark(); };
}
function drawReport() {
  const r = CP.report; const tot = (k) => r.recipients.filter((x) => x.status === k).reduce((a, x) => a + x.n, 0);
  const all = r.recipients.reduce((a, x) => a + x.n, 0);
  $('crep').innerHTML = `<div style="font-weight:800;font-size:15px">How it went</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px">${[['People', all], ['Delivered', tot('sent')], ['Waiting', tot('queued')], ['Held', tot('held')], ['Skipped', tot('skipped')], ['Opened', r.events.opened || 0], ['Clicked', r.events.clicked || 0], ['Unsubscribed', r.events.unsubscribed || 0], ['Bounced', r.events.bounced || 0]].map(([l, n]) => `<div style="background:var(--panel2);border-radius:10px;padding:8px"><div style="font-size:12px;color:var(--muted)">${l}</div><div style="font-weight:800;font-size:18px">${fmtN(n)}</div></div>`).join('')}</div>
    ${r.not_sent.length ? `<div style="margin-top:10px;font-size:12.5px"><b>Why some didn't go:</b>${r.not_sent.map((x) => `<div>${esc(x.reason)} · ${fmtN(x.n)}</div>`).join('')}</div>` : ''}`;
}
function testUI(focusSend) {
  const c = CP.content || {}; let tpl = null;
  window.BZ_preview({ kind: CP.channel === 'sms' ? 'sms' : 'email', title: CP.name || '', focusSend,
    render: async ({ profile_id }) => {
      if (CP.channel === 'sms') return api('/api/mk/sms/preview', { method: 'POST', body: JSON.stringify({ store: CP.store, body: c.body || '', add_opt_out: c.add_opt_out !== false, profile_id }) });
      if (!c.template_id) throw new Error('Choose an email first.');
      tpl = tpl || await api('/api/mk/templates/' + c.template_id);
      return api('/api/mk/templates/render', { method: 'POST', body: JSON.stringify({ store: CP.store, subject: c.subject || tpl.subject, preview: c.preview || tpl.preview, blocks: tpl.blocks, doc: tpl.doc || null, profile_id }) });
    },
    beforeSend: async () => { if (cdirty) await save(); },
    send: (to) => api(`/api/mk/campaigns/${CP.id}/test`, { method: 'POST', body: JSON.stringify({ to }) }) });
}
})();
