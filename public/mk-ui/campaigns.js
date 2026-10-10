/* Buzzin Marketing · campaigns and calendar (loaded by /marketing) */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const at = S.findIndex((x) => x.id === 'flows');
  S.splice(at, 0, { id: 'campaigns', icon: 'speakerphone', label: 'Campaigns', render: renderCampaigns });
});
const CSTATUS = { draft: ['off', 'Draft'], pending: ['hon', 'Waiting for approval'], scheduled: ['blue', 'Scheduled'], sending: ['blue', 'Sending'], sent: ['ok', 'Sent'], cancelled: ['bad', 'Stopped'] };
let VIEW = (() => { try { return localStorage.getItem('mk_camp_view') || 'list'; } catch (e) { return 'list'; } })();
let MONTH = null;

async function renderCampaigns(el, id) {
  if (id) return editCampaign(el, id);
  const r = await api('/api/mk/campaigns?' + qs({ store: STORE }));
  el.innerHTML = `<h1>Campaigns</h1><p class="sub">One-time emails and texts to a list or segment. People with an open ticket, claim or recent return are left out by default. Nothing sends until a sender is connected and sending is turned on.</p>
  <div class="bar"><button class="btn pri" id="cne"${STORE ? '' : ' disabled'}><i class="ti ti-mail"></i> New email campaign</button><button class="btn" id="cns"${STORE ? '' : ' disabled'}><i class="ti ti-message"></i> New text campaign</button>${STORE ? '' : '<span style="color:var(--muted)">Pick a store at the top to create one.</span>'}<span class="sp"></span>
    <div class="seg" role="tablist"><button data-v="list" class="${VIEW === 'list' ? 'on' : ''}"><i class="ti ti-list"></i> List</button><button data-v="cal" class="${VIEW === 'cal' ? 'on' : ''}"><i class="ti ti-calendar"></i> Calendar</button></div></div>
  <div id="cbody"></div>`;
  const make = (channel) => api('/api/mk/campaigns', { method: 'POST', body: JSON.stringify({ store: STORE, channel }) }).then((c) => { location.hash = '#campaigns/' + c.id; }).catch((e) => toast(e.message, 1));
  $('cne').onclick = () => make('email'); $('cns').onclick = () => make('sms');
  el.querySelectorAll('.seg button').forEach((b) => b.onclick = () => { VIEW = b.dataset.v; try { localStorage.setItem('mk_camp_view', VIEW); } catch (e) {} el.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  const draw = () => (VIEW === 'cal' ? calendar($('cbody'), r.campaigns) : table($('cbody'), r.campaigns));
  draw();
}
const when = (c) => c.sent_at ? fmtDT(c.sent_at) : c.start_at ? fmtDT(c.start_at) : (c.schedule && c.schedule.mode === 'local' && c.schedule.date ? `${fmtD(c.schedule.date + 'T12:00:00')} ${c.schedule.time} local` : '—');
function table(host, list) {
  host.innerHTML = `<div class="card" style="padding:6px"><div class="tw"><table><thead><tr><th>Campaign</th><th>Store</th><th>Type</th><th>Status</th><th>When</th><th class="n">People</th><th class="n">Opened</th><th class="n">Clicked</th></tr></thead><tbody>
  ${list.map((c) => `<tr class="click" data-id="${c.id}"><td><b>${esc(c.name)}</b>${c.subject ? `<div style="font-size:12px;color:var(--muted)">${esc(c.subject)}</div>` : ''}${c.note ? `<div style="font-size:12px;color:var(--honey-ink)">${esc(c.note)}</div>` : ''}</td><td>${c.store === 'lbo' ? 'Outlet' : 'LB'}</td><td>${c.channel === 'sms' ? '<i class="ti ti-message"></i> Text' : '<i class="ti ti-mail"></i> Email'}${c.ab && c.ab.enabled ? ' <span class="pill blue">A/B</span>' : ''}</td><td>${pill(CSTATUS, c.status)}</td><td>${when(c)}</td>
    <td class="n">${c.recipients == null ? '' : fmtN(c.recipients)}</td><td class="n">${c.delivered ? `${Math.round(100 * c.opened / c.delivered)}%` : ''}</td><td class="n">${c.delivered ? `${Math.round(100 * c.clicked / c.delivered)}%` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No campaigns yet.</td></tr>'}
  </tbody></table></div></div>`;
  host.querySelectorAll('tr.click').forEach((tr) => tr.onclick = () => { location.hash = '#campaigns/' + tr.dataset.id; });
}
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
async function editCampaign(el, id) {
  CP = await api('/api/mk/campaigns/' + id); cdirty = false;
  const ro = CP.status !== 'draft';
  const isE = CP.channel === 'email';
  el.innerHTML = `<div class="bar" style="align-items:center;flex-wrap:wrap"><a href="#campaigns" class="btn xs" aria-label="Back"><i class="ti ti-arrow-left"></i></a><input id="cn" type="text" value="${esc(CP.name)}" style="font-weight:700;min-width:260px" aria-label="Campaign name"${ro ? ' disabled' : ''}>${pill(CSTATUS, CP.status)}<span class="pill off">${CP.store === 'lbo' ? 'Outlet' : 'Larkspur Baby'} · ${isE ? 'Email' : 'Text'}</span>
    <span class="sp"></span><span class="pill hon hidden" id="cd">Unsaved</span>
    <button class="btn" id="ccopy"><i class="ti ti-copy"></i> Copy</button>${ro ? '' : '<button class="btn danger" id="cdel"><i class="ti ti-trash"></i></button>'}<button class="btn" id="ctest"><i class="ti ti-send"></i> Send a test</button>
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
  $('ctest').onclick = testUI;
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
let estT = null;
function estimate() {
  clearTimeout(estT); estT = setTimeout(async () => {
    const box = $('cest'); if (!box) return;
    if (['sending', 'sent', 'cancelled'].includes(CP.status)) { box.innerHTML = `<div style="color:var(--muted);font-size:12.5px;font-weight:700">AUDIENCE WHEN IT STARTED</div><div style="font-size:30px;font-weight:800">${fmtN(CP.recipients)}</div><div style="color:var(--muted)">people${CP.started_at ? ` · started ${fmtDT(CP.started_at)}` : ''}${CP.sent_at ? ` · finished ${fmtDT(CP.sent_at)}` : ''}</div>`; return; }
    try { const r = await api('/api/mk/campaigns/estimate', { method: 'POST', body: JSON.stringify({ store: CP.store, channel: CP.channel, audience: CP.audience, smart_sending: CP.smart_sending }) });
      box.innerHTML = `<div style="color:var(--muted);font-size:12.5px;font-weight:700">ABOUT</div><div style="font-size:30px;font-weight:800">${fmtN(r.recipients)}</div><div style="color:var(--muted)">people would get it right now${r.without_consent ? ` · ${fmtN(r.without_consent)} more in these groups haven't said yes to ${CP.channel === 'sms' ? 'texts' : 'email'}` : ''}${r.smart_skipped_now ? ` · ${fmtN(r.smart_skipped_now)} would be skipped by smart sending` : ''}</div>`;
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
    $('ctpl').onchange = (e) => { c.template_id = e.target.value ? Number(e.target.value) : null; mark(); drawContent(ro, mark); previewMsg(); };
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
    $('cbody').oninput = (e) => { c.body = e.target.value; mark(); clearTimeout(t); t = setTimeout(previewMsg, 300); };
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
    const r = await api('/api/mk/templates/render', { method: 'POST', body: JSON.stringify({ store: CP.store, subject: c.subject || t.subject, preview: c.preview || t.preview, blocks: t.blocks }) });
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
function testUI() {
  document.querySelectorAll('.drawer').forEach((d) => d.remove());
  const d = document.createElement('aside'); d.className = 'drawer';
  d.innerHTML = `<div class="hd"><b>Send a test</b><span class="sp"></span><button class="btn xs" data-x aria-label="Close"><i class="ti ti-x"></i></button></div><div class="bd"><p class="sub">Only goes to addresses or numbers on the internal test list (Settings), and only once a sender is connected. Until then it's recorded as held.</p><label class="lab" for="ctto">${CP.channel === 'sms' ? 'Phone number' : 'Email address'}</label><input id="ctto" type="text" style="width:100%"><button class="btn pri" id="ctgo" style="margin-top:8px">Send test</button><div id="ctout" style="margin-top:12px"></div></div>`;
  document.body.appendChild(d); d.querySelector('[data-x]').onclick = () => d.remove();
  d.querySelector('#ctgo').onclick = async () => { try { if (cdirty) await save(); const r = await api(`/api/mk/campaigns/${CP.id}/test`, { method: 'POST', body: JSON.stringify({ to: d.querySelector('#ctto').value }) }); d.querySelector('#ctout').innerHTML = r.results.map((x) => `<div class="card" style="margin-top:6px">${x.version ? `<b>Version ${esc(x.version)}</b> · ` : ''}${esc(x.status)}${x.reason ? ` — ${esc(x.reason)}` : ''}</div>`).join(''); } catch (e) { d.querySelector('#ctout').innerHTML = `<div class="note">${esc(e.message)}</div>`; } };
}
})();
