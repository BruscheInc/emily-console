/* Buzzin Marketing · Form Studio (loaded by /marketing) — laid out like Klaviyo's form builder:
 * step tabs over a live canvas; left panel with Content (blocks + block settings), Styles, Behaviors, Targeting, Offer.
 * Click a block on the canvas to edit it, drag blocks to reorder. The canvas is the real store script (mk-forms-runtime.js). */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const at = S.findIndex((x) => x.id === 'templates');
  S.splice(at, 0, { id: 'forms', icon: 'forms', label: 'Sign-up forms', render: renderForms });
});
const STATUS = { draft: ['off', 'Draft'], preview: ['hon', 'Preview only'], live: ['ok', 'Live'] };
const SHOP = { lb: 'https://larkspurbaby.com', lbo: 'https://larkspurbabyoutlet.com' };
const TYPE_NAME = { popup: 'Popup', flyout: 'Flyout', full: 'Full page', embedded: 'Embed', banner: 'Banner' };
const BLOCKS = [
  ['text', 'Text', 'typography'], ['image', 'Image', 'photo'], ['button', 'Button', 'click'], ['email', 'Email', 'mail'], ['phone', 'Phone number', 'phone'],
  ['input', 'Text input', 'forms'], ['checkboxes', 'Checkboxes', 'checkbox'], ['radio', 'Radio buttons', 'circle-dot'], ['dropdown', 'Dropdown', 'selector'], ['date', 'Date', 'calendar'],
  ['coupon', 'Coupon', 'ticket'], ['countdown', 'Countdown timer', 'clock'], ['spacer', 'Spacer', 'arrows-vertical'], ['divider', 'Divider', 'minus'], ['html', 'HTML', 'code'],
];
const BNAME = Object.fromEntries(BLOCKS.map(([k, l]) => [k, l]));
const FONTS = [['inherit', 'Store font'], ['Helvetica, Arial, sans-serif', 'Helvetica'], ['Georgia, serif', 'Georgia'], ["'Playfair Display', Georgia, serif", 'Playfair Display'], ["'Lora', Georgia, serif", 'Lora'],
  ["'Cormorant Garamond', Georgia, serif", 'Cormorant Garamond'], ["'Libre Baskerville', Georgia, serif", 'Libre Baskerville'], ["'DM Serif Display', Georgia, serif", 'DM Serif Display'],
  ["'Montserrat', Helvetica, sans-serif", 'Montserrat'], ["'Poppins', Helvetica, sans-serif", 'Poppins'], ["'DM Sans', Helvetica, sans-serif", 'DM Sans'], ["'Inter', Helvetica, sans-serif", 'Inter'],
  ["'Nunito', Helvetica, sans-serif", 'Nunito'], ["'Josefin Sans', Helvetica, sans-serif", 'Josefin Sans'], ["'Quicksand', Helvetica, sans-serif", 'Quicksand'], ["'Raleway', Helvetica, sans-serif", 'Raleway'], ["'Lato', Helvetica, sans-serif", 'Lato']];
const rid = () => 'b' + Math.random().toString(36).slice(2, 8);
const clone = (o) => JSON.parse(JSON.stringify(o));

const LCSS = `<style>
.kl{background:#fff;border:1px solid var(--line);border-radius:14px;min-height:calc(100vh - 120px)}
.kl-h{display:flex;align-items:center;gap:10px;padding:16px 24px;border-bottom:1px solid var(--line)}.kl-h h1{margin:0;font-size:19px;flex:1}
.kl-b{padding:20px 24px}
.kl-f{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}.kl-f input{min-width:230px}
.kl-f select{border:1.5px dashed #A1A1AA;border-radius:8px;background:#fff;padding:0 30px 0 12px;height:38px;appearance:auto}
.kl table{width:100%;border-collapse:collapse}.kl th{font-weight:500;text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);color:#3F3F46}
.kl td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:middle}.kl tr.row:hover td{background:#FAFAFA}.kl .n{text-align:right}
.kl a.nm{color:#2563EB;text-decoration:none;font-weight:500;font-size:15px}.kl a.nm:hover{text-decoration:underline}.kl .sub2{color:#52525B;font-size:13px;margin-top:2px}
.kl .st{display:inline-block;background:#F4F4F5;border-radius:8px;padding:4px 10px;font-weight:500}.kl .st.live{background:#DCFCE7;color:#166534}.kl .st.preview{background:#FEF3C7;color:#92400E}
.kl .rt{display:inline-flex;align-items:center;gap:6px;justify-content:flex-end}.kl .rt i{font-size:17px}.kl .rt.bad i{color:#DC2626}.kl .rt.meh i{color:#D97706}.kl .rt.ok i{color:#16A34A}
.kl .link{color:#2563EB;cursor:pointer}.kl .dots{all:unset;cursor:pointer;width:32px;height:32px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;font-size:18px}.kl .dots:hover{background:#F4F4F5}
.kl-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px}.kl-kpi{border:1px solid var(--line);border-radius:12px;padding:14px 16px}.kl-kpi .l{color:#52525B;font-size:13px}.kl-kpi .v{font-size:24px;font-weight:700;margin-top:4px}.kl-kpi .s{color:var(--muted);font-size:12px;margin-top:2px}
.kl-chart{border:1px solid var(--line);border-radius:12px;padding:14px 16px}.kl-legend{display:flex;gap:16px;font-size:13px;margin-bottom:6px}.kl-legend span{display:inline-flex;align-items:center;gap:6px}.kl-legend i{width:10px;height:10px;border-radius:3px;display:inline-block}
</style>`;
const rateCls = (r, v) => (!v ? '' : r < 0.5 ? 'bad' : r < 2 ? 'meh' : 'ok');
const rateIcon = (c) => (c === 'bad' ? 'alert-circle' : c === 'meh' ? 'alert-triangle' : c === 'ok' ? 'circle-check' : '');
async function renderForms(el, id) {
  if (id && String(id).indexOf('a-') === 0) return formAnalytics(el, String(id).slice(2));
  if (id) return editForm(el, id);
  document.querySelectorAll('.ke').forEach((x) => x.remove());
  const r = await api('/api/mk/forms?' + qs({ store: STORE }));
  let imp = null; try { imp = await api('/api/mk/forms/import-klaviyo'); } catch (e) { imp = null; }
  el.innerHTML = LCSS + `<div class="kl"><div class="kl-h"><h1>Sign-up forms</h1>
      ${imp ? `<button class="btn" id="fki"${imp.running ? ' disabled' : ''} title="${esc((imp.last && imp.last.out) || 'Copies Klaviyo forms in as drafts')}"><i class="ti ti-download"></i> ${imp.running ? 'Copying from Klaviyo…' : 'Copy forms from Klaviyo'}</button>` : ''}
      <button class="btn pri" id="fn"${STORE ? '' : ' disabled title="Pick the store the form goes on (top)"'}>Create form</button></div>
    <div class="kl-b"><div class="kl-f"><input type="search" id="fq" placeholder="Search forms"><select id="fsf"><option value="">Status</option><option value="draft">Draft</option><option value="preview">Preview only</option><option value="live">Live</option></select>
      <select id="ftf"><option value="">Form type</option>${Object.entries(TYPE_NAME).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
    <table><thead><tr><th>Name</th><th>Type</th><th>Status</th><th class="n">Submitted</th><th class="n">Submit rate</th><th class="n">Total revenue</th><th style="width:44px"></th></tr></thead><tbody id="ftb"></tbody></table>
    <div id="fcount" style="padding:14px 0;color:#3F3F46"></div></div></div>`;
  const typeOf = (f) => (f.style || {}).type || (f.style || {}).layout || 'popup';
  const TYPE_ICON = { popup: 'app-window', flyout: 'layout-bottombar', full: 'maximize', embedded: 'layout-list', banner: 'layout-navbar' };
  const SN = { draft: 'Draft', preview: 'Preview only', live: 'Live' };
  const drawRows = () => {
    const q = ($('fq').value || '').toLowerCase(), sf = $('fsf').value, tf = $('ftf').value;
    const rows = r.forms.filter((f) => (!q || f.name.toLowerCase().includes(q)) && (!sf || f.status === sf) && (!tf || typeOf(f) === tf));
    $('ftb').innerHTML = rows.map((f) => { const rate = f.views ? (f.submitted || 0) / f.views * 100 : 0, rc = rateCls(rate, f.views);
      return `<tr class="row" data-id="${f.id}"><td><a class="nm" href="#forms/${f.id}">${esc(f.name)}</a><div class="sub2">${esc(f.list_name || '')}</div></td>
      <td title="${esc(TYPE_NAME[typeOf(f)] || 'Popup')}"><i class="ti ti-${TYPE_ICON[typeOf(f)] || 'app-window'}" style="font-size:20px"></i></td><td><span class="st ${f.status}">${SN[f.status] || f.status}</span></td>
      <td class="n"><span class="link" data-an="${f.id}">${fmtN(f.submitted || 0)}</span></td><td class="n"><span class="rt ${rc}">${rc ? `<i class="ti ti-${rateIcon(rc)}"></i>` : ''}${f.views ? rate.toFixed(1) + '%' : '—'}</span></td><td class="n">${fmt$(f.revenue || 0)}</td>
      <td><button class="dots" data-fm="${f.id}" aria-label="Form options"><i class="ti ti-dots-vertical"></i></button></td></tr>`; }).join('') || '<tr><td colspan="7" class="empty">No forms match.</td></tr>';
    $('fcount').textContent = rows.length ? `1 - ${rows.length} of ${rows.length}` : '';
    $('ftb').querySelectorAll('[data-an]').forEach((x) => x.onclick = (e) => { e.stopPropagation(); location.hash = '#forms/a-' + x.dataset.an; });
    $('ftb').querySelectorAll('[data-fm]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); formMenu(r.forms.find((f) => String(f.id) === b.dataset.fm), b); });
  };
  $('fq').oninput = drawRows; $('fsf').onchange = drawRows; $('ftf').onchange = drawRows; drawRows();
  $('fn').onclick = async () => { try { const f = await api('/api/mk/forms', { method: 'POST', body: JSON.stringify({ store: STORE, name: 'Welcome popup' }) }); location.hash = '#forms/' + f.id; } catch (e) { toast(e.message, 1); } };
  const ki = $('fki'); if (ki) ki.onclick = async () => { try { await api('/api/mk/forms/import-klaviyo', { method: 'POST', body: JSON.stringify({}) }); toast('Copying your Klaviyo forms'); setTimeout(go, 1500); } catch (e) { toast(e.message, 1); } };
  if (imp && imp.running) setTimeout(() => { if ((location.hash || '') === '#forms') go(); }, 6000);
}

/* Form analytics (⋮ → Analytics, or click the Submitted number) */
async function formAnalytics(el, id, days = 30) {
  const [f, a] = await Promise.all([api('/api/mk/forms/' + id), api(`/api/mk/forms/${id}/analytics?days=${days}`)]);
  const rc = rateCls(a.rate, a.viewed);
  const k = (l, v, s) => `<div class="kl-kpi"><div class="l">${esc(l)}</div><div class="v">${v}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
  el.innerHTML = LCSS + `<div class="kl"><div class="kl-h"><a href="#forms" class="dots" aria-label="Back"><i class="ti ti-arrow-left"></i></a><h1>${esc(f.name)} <span style="font-weight:400;color:var(--muted);font-size:15px">· Analytics</span></h1>
      <select id="anr" aria-label="Date range" style="height:38px;border-radius:8px">${[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days'], [365, 'Last 365 days'], [3650, 'All time']].map(([d, l]) => `<option value="${d}"${d === days ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <a class="btn" href="#forms/${f.id}"><i class="ti ti-pencil"></i> Edit form</a></div>
    <div class="kl-b"><div class="kl-kpis">
      ${k('Submit rate', `<span class="rt ${rc}" style="justify-content:flex-start">${rc ? `<i class="ti ti-${rateIcon(rc)}"></i>` : ''}${a.rate.toFixed(1)}%</span>`, 'submitted ÷ viewed')}
      ${k('Submitted', fmtN(a.submitted), `${fmtN(a.emails)} emails · ${fmtN(a.phones)} phones`)}${k('Viewed', fmtN(a.viewed), `${fmtN(a.closed)} closed it`)}
      ${k('Total revenue', fmt$(a.revenue), `${fmtN(a.orders)} orders after signing up`)}${k('Revenue per view', '$' + Number(a.rpv || 0).toFixed(2))}
      ${k('Text sign-up rate', a.emails ? Math.round(a.phones / a.emails * 100) + '%' : '—', 'of email sign-ups also gave a phone')}</div>
      <div class="kl-chart"><div class="kl-legend"><span><i style="background:#93C5FD"></i>Viewed</span><span><i style="background:#2563EB"></i>Submitted</span></div><div id="anc"></div></div>
      <p style="color:var(--muted);font-size:12px;margin-top:10px">Counts live traffic only (previews aren't counted). Revenue is orders placed after someone signed up through this form.</p></div></div>`;
  $('anr').onchange = (e) => formAnalytics(el, id, Number(e.target.value));
  const d = a.daily || [], W = 900, Hh = 220, pad = 28, mx = Math.max(1, ...d.map((x) => x.viewed), ...d.map((x) => x.submitted));
  const X = (i) => pad + (d.length < 2 ? 0 : i * (W - pad * 2) / (d.length - 1)), Y = (v) => Hh - pad - v / mx * (Hh - pad * 2);
  const line = (key) => d.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x[key]).toFixed(1)}`).join(' ');
  const ticks = d.length ? [0, Math.floor((d.length - 1) / 2), d.length - 1] : [];
  $('anc').innerHTML = d.length ? `<svg viewBox="0 0 ${W} ${Hh}" width="100%" role="img" aria-label="Views and submissions per day">
    ${[0, 0.5, 1].map((t) => `<line x1="${pad}" x2="${W - pad}" y1="${Y(mx * t)}" y2="${Y(mx * t)}" stroke="#E4E4E7"/><text x="${pad - 6}" y="${Y(mx * t) + 4}" text-anchor="end" font-size="11" fill="#71717A">${Math.round(mx * t)}</text>`).join('')}
    <path d="${line('viewed')}" fill="none" stroke="#93C5FD" stroke-width="2"/><path d="${line('submitted')}" fill="none" stroke="#2563EB" stroke-width="2.5"/>
    ${ticks.map((i) => `<text x="${X(i)}" y="${Hh - 8}" text-anchor="middle" font-size="11" fill="#71717A">${d[i].day.slice(5)}</text>`).join('')}</svg>` : '<div class="empty">No data yet.</div>';
}

function formMenu(f, anchor) {
  menu(anchor, [
    ['Edit', 'pencil', () => { location.hash = '#forms/' + f.id; }],
    ['Analytics', 'chart-line', () => { location.hash = '#forms/a-' + f.id; }],
    ['Rename', 'forms', async () => { const n = prompt('Form name', f.name); if (!n || n === f.name) return; try { await api('/api/mk/forms/' + f.id, { method: 'PUT', body: JSON.stringify({ name: n.slice(0, 120) }) }); toast('Renamed'); go(); } catch (e) { toast(e.message, 1); } }],
    ['Clone', 'copy', async () => { try { const c = await api('/api/mk/forms/' + f.id + '/clone', { method: 'POST', body: JSON.stringify({}) }); toast('Cloned as a draft'); location.hash = '#forms/' + c.id; } catch (e) { toast(e.message, 1); } }],
    [f.status === 'live' ? 'Unpublish (back to draft)' : 'Publish', f.status === 'live' ? 'player-pause' : 'player-play', async () => { if (f.status !== 'live' && !confirm(`Make "${f.name}" live on the store?`)) return; try { await api('/api/mk/forms/' + f.id, { method: 'PUT', body: JSON.stringify({ status: f.status === 'live' ? 'draft' : 'live' }) }); toast(f.status === 'live' ? 'Back to draft' : 'Live'); go(); } catch (e) { toast(e.message, 1); } }],
    ['Delete', 'trash', async () => { if (!confirm(`Delete "${f.name}"? This can't be undone.`)) return; try { await api('/api/mk/forms/' + f.id, { method: 'DELETE' }); toast('Deleted'); go(); } catch (e) { toast(e.message, 1); } }, { danger: true }],
  ]);
}
window.addEventListener('hashchange', () => { if (!/^#forms\/\d+$/.test(location.hash || '')) document.querySelectorAll('.ke').forEach((x) => x.remove()); });

/* ---------------- editor state ---------------- */
let F = null, RAIL = 'add', SI = 0, SEL = null, STEPSET = false, VIEW = 'both', ZOOM = 'fit', MODE = 'edit', ADDTAB = 'basic', fdirty = false, saving = false, UNIV = [];
const ready = { d: false, m: false };
const step = () => F.steps[SI] || F.steps[0];
const sel = () => (SI >= 0 && SEL != null && SEL >= 0 ? (step().blocks || [])[SEL] : null);
const HIST = { past: [], future: [], last: '' };
const CSS = `<style>
.ke{position:fixed;inset:0;z-index:60;background:#F4F4F5;display:flex;flex-direction:column;font:14px/1.4 inherit}
.ke-top{height:60px;flex:none;display:flex;align-items:center;gap:10px;padding:0 16px;background:#fff;border-bottom:1px solid var(--line)}
.ke-top .nm{font-weight:700;font-size:17px;border:1px solid transparent;border-radius:8px;padding:6px 8px;min-width:120px;max-width:420px;background:transparent}
.ke-top .nm:hover,.ke-top .nm:focus{border-color:var(--line);background:#fff}
.ke-st{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:10px;padding:0 6px 0 10px;height:36px}.ke-st select{border:0;background:transparent;font-weight:600;padding:0 4px;height:34px}
.ke-dot{width:8px;height:8px;border-radius:50%;background:#71717A}.ke-dot.live{background:#16A34A}.ke-dot.preview{background:#D97706}
.ke-save{color:var(--muted);display:inline-flex;align-items:center;gap:4px;font-size:12.5px}
.ke-body{flex:1;display:flex;min-height:0}
.ke-rail{width:56px;flex:none;background:#fff;border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:12px}
.ke-rail button{all:unset;cursor:pointer;width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#3F3F46;font-size:20px}
.ke-rail button:hover{background:#F4F4F5}.ke-rail button.on{background:#EEF2FF;color:#3730A3;box-shadow:inset 0 0 0 1.5px #6366F1}
.ke-side{width:370px;flex:none;background:#fff;border-right:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.ke-side.closed{display:none}
.ke-sh{display:flex;align-items:center;gap:8px;padding:16px 18px 6px}.ke-sh b{font-size:17px;flex:1}
.ke-tabs{display:flex;gap:18px;padding:0 18px;border-bottom:1px solid var(--line)}.ke-tabs button{all:unset;cursor:pointer;padding:10px 2px;color:var(--muted);font-weight:500}.ke-tabs button.on{color:#18181B;font-weight:700;box-shadow:inset 0 -2px 0 #18181B}
.ke-pane{flex:1;overflow-y:auto;padding:4px 18px 40px}
.ke-sec{font-weight:700;font-size:15px;margin:20px 0 10px}
.ke-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.ke-tile{border:1px solid var(--line);border-radius:12px;background:#fff;padding:8px 6px 12px;text-align:center;cursor:grab;user-select:none;display:flex;flex-direction:column;align-items:center;gap:6px;min-height:96px;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.ke-tile:hover{border-color:#A1A1AA;box-shadow:0 2px 8px rgba(0,0,0,.08)}.ke-tile .g{color:#A1A1AA;font-size:12px;letter-spacing:2px;line-height:1}.ke-tile i{font-size:24px;color:#27272A}.ke-tile span{font-size:13.5px}
.ke-tile.off{opacity:.45;cursor:not-allowed}
.ke-canvas{flex:1;min-width:0;display:flex;flex-direction:column;position:relative}
.ke-bar{position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:3;display:flex;align-items:center;gap:6px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:6px;box-shadow:0 4px 14px rgba(0,0,0,.08);max-width:calc(100% - 24px);overflow-x:auto}
.ke-bar .sep{width:1px;height:26px;background:var(--line);margin:0 2px;flex:none}
.ke-ib{all:unset;cursor:pointer;width:34px;height:34px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;color:#3F3F46;font-size:18px;flex:none}.ke-ib:hover{background:#F4F4F5}.ke-ib:disabled,.ke-ib[disabled]{opacity:.35;cursor:default}.ke-ib.on{background:#F4F4F5;box-shadow:inset 0 0 0 1px var(--line)}
.ke-pill{display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:9px;height:36px;flex:none;background:#fff}
.ke-pill.on{border-color:#6366F1;background:#EEF2FF}.ke-pill .lb{all:unset;cursor:pointer;padding:0 12px;font-weight:600;white-space:nowrap;height:34px;display:flex;align-items:center;gap:6px}
.ke-pill .gr{color:#A1A1AA;cursor:grab;padding-left:8px}.ke-pill .mn{all:unset;cursor:pointer;border-left:1px solid var(--line);height:34px;width:30px;display:flex;align-items:center;justify-content:center}
.ke-arrow{color:#A1A1AA;flex:none}
.ke-menu{position:fixed;z-index:80;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.15);padding:6px;min-width:190px}
.ke-menu button{all:unset;display:flex;gap:8px;align-items:center;width:calc(100% - 20px);padding:8px 10px;border-radius:6px;cursor:pointer}.ke-menu button:hover{background:#F4F4F5}.ke-menu button.danger{color:#B42318}.ke-menu button:disabled{opacity:.4;cursor:default}
.ke-stage{flex:1;overflow:auto;padding:84px 24px 24px}
.ke-zoomwrap{transform-origin:top left;display:flex;gap:48px;align-items:flex-start;width:max-content;margin:0 auto}
.ke-dev{display:flex;flex-direction:column;gap:10px}.ke-dev .cap{display:flex;align-items:center;gap:6px;font-weight:600}
.ke-dev iframe{border:0;background:transparent;border-radius:6px}.ke-dev iframe.play{background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.ke-zoom{position:absolute;right:18px;bottom:18px;z-index:3;display:flex;flex-direction:column;align-items:center;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.08)}
.ke-zoom span{font:600 12px ui-monospace,Menlo,monospace;padding:4px 0}
.ke-back{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;color:var(--muted);font-weight:600;margin:14px 0 4px}
.ke-note{background:#EFF6FF;border:1px solid #BFDBFE;color:#1E3A8A;border-radius:10px;padding:10px 12px;margin-top:12px;font-size:13px}
</style>`;
const ICON = (n) => `<i class="ti ti-${n}"></i>`;
const DEV_W = { d: 1100, m: 390 }, DEV_H = 760; const FH = { d: 600, m: 600 };
const devW = () => (MODE === 'play' ? 1100 : Math.max(720, Math.min(1100, Number((F && F.style && F.style.width) || 600) + 160)));

async function editForm(el, id) {
  F = await api('/api/mk/forms/' + id); fdirty = false; SI = 0; SEL = null; STEPSET = false; RAIL = 'add'; MODE = 'edit'; ready.d = ready.m = false;
  HIST.past = []; HIST.future = []; HIST.last = JSON.stringify(snap());
  try { UNIV = (await api('/api/mk/forms-universal')).items || []; } catch (e) { UNIV = []; }
  document.querySelectorAll('.ke').forEach((x) => x.remove());
  const k = document.createElement('div'); k.className = 'ke'; document.body.appendChild(k);
  k.innerHTML = CSS + `
  <div class="ke-top"><button class="ke-ib" id="kx" aria-label="Exit" title="Back to forms">${ICON('arrow-bar-left')}</button>
    <input class="nm" id="knm" value="${esc(F.name)}" aria-label="Form name"><span class="ke-save" id="ksv" title="All changes saved">${ICON('circle-check')}</span>
    <span class="ke-st"><span class="ke-dot" id="kdot"></span><select id="kst" aria-label="Status"><option value="draft">Draft</option><option value="preview">Preview only</option><option value="live">Live</option></select></span>
    <span class="pill off">${esc(STORE_NAME[F.store] || '')}</span>
    <span class="sp" style="flex:1"></span><span id="kstat" style="color:var(--muted);font-size:12px"></span>
    <a class="btn" target="_blank" rel="noopener" href="${SHOP[F.store]}/?buzzin_form=preview">${ICON('device-desktop')} Preview on website</a>
    <button class="btn pri" id="kpub">${F.status === 'live' ? 'Update live form' : 'Publish'}</button></div>
  <div class="ke-body">
    <div class="ke-rail"><button data-r="add" title="Add blocks" aria-label="Add blocks">${ICON('circle-plus')}</button><button data-r="styles" title="Styles" aria-label="Styles">${ICON('palette')}</button><button data-r="targeting" title="Targeting & behaviors" aria-label="Targeting and behaviors">${ICON('target-arrow')}</button></div>
    <div class="ke-side" id="kside"><div id="fpanel" style="display:flex;flex-direction:column;min-height:0;height:100%"></div></div>
    <div class="ke-canvas"><div class="ke-bar" id="kbar"></div>
      <div class="ke-stage" id="kstage"><div class="ke-zoomwrap" id="kzw">
        <div class="ke-dev" id="kdd"><div class="cap">${ICON('device-desktop')} Desktop</div><iframe id="fpd" title="Desktop canvas" style="width:${DEV_W.d}px;height:${DEV_H}px"></iframe></div>
        <div class="ke-dev" id="kdm"><div class="cap">${ICON('device-mobile')} Mobile</div><iframe id="fpm" title="Mobile canvas" style="width:${DEV_W.m}px;height:${DEV_H}px"></iframe></div>
      </div></div>
      <div class="ke-zoom"><button class="ke-ib" id="kzi" aria-label="Zoom in">${ICON('plus')}</button><span id="kzv">100%</span><button class="ke-ib" id="kzo" aria-label="Zoom out">${ICON('minus')}</button><button class="ke-ib" id="kzf" aria-label="Fit to screen">${ICON('maximize')}</button></div>
    </div></div>`;
  el.innerHTML = '<div class="empty">Editing in full screen…</div>';
  $('kst').value = F.status; dot();
  const st = F.stats && F.stats.live; $('kstat').textContent = st && st.viewed ? `${fmtN(st.viewed)} views · ${fmtN(st.emails)} emails · ${fmtN(st.phones)} phones · ${st.rate}%` : '';
  $('kx').onclick = async () => { if (fdirty) await save(true); k.remove(); window.onbeforeunload = null; location.hash = '#forms'; };
  $('knm').oninput = () => { F.name = $('knm').value; mark(false); };
  $('kst').onchange = () => { F.status = $('kst').value; dot(); mark(false); };
  $('kpub').onclick = async () => { const b = $('kpub'); if (F.status !== 'live' && b.dataset.c !== '1') { b.dataset.c = '1'; b.textContent = 'Click again to go live'; return; } F.status = 'live'; $('kst').value = 'live'; dot(); await save(); b.dataset.c = ''; b.textContent = 'Update live form'; };
  k.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => { if (RAIL === b.dataset.r && !SEL && !STEPSET && SI >= 0) { $('kside').classList.toggle('closed'); } else { $('kside').classList.remove('closed'); RAIL = b.dataset.r; SEL = null; STEPSET = false; if (SI < 0) SI = 0; } rail(); bar(); panel(); draw(); });
  $('kzi').onclick = () => setZoom(cz() + 0.1); $('kzo').onclick = () => setZoom(cz() - 0.1); $('kzf').onclick = () => { ZOOM = 'fit'; layout(); };
  window.onbeforeunload = () => fdirty ? 'Unsaved changes' : undefined;
  window.removeEventListener('message', onFrame); window.addEventListener('message', onFrame);
  window.removeEventListener('resize', layout); window.addEventListener('resize', layout);
  document.removeEventListener('keydown', onKey); document.addEventListener('keydown', onKey);
  loadFrame('d'); loadFrame('m'); rail(); bar(); panel(); layout();
}
function onKey(e) {
  if (!document.querySelector('.ke')) return;
  const inField = /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || '') || (e.target && e.target.isContentEditable);
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !inField) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && !inField && sel()) { e.preventDefault(); step().blocks.splice(SEL, 1); SEL = null; panel(); mark(); }
  else if (e.key === 'Escape' && !inField && (SEL != null || STEPSET)) { SEL = null; STEPSET = false; panel(); draw(); }
}
const dot = () => { const d = $('kdot'); if (d) d.className = 'ke-dot ' + F.status; };
function rail() { document.querySelectorAll('.ke-rail [data-r]').forEach((b) => b.classList.toggle('on', b.dataset.r === RAIL && !$('kside').classList.contains('closed'))); }

/* ---------------- saving (autosave like Klaviyo), undo/redo ---------------- */
const snap = () => ({ name: F.name, steps: F.steps, style: F.style, targeting: F.targeting, teaser: F.teaser, coupon: F.coupon, list_id: F.list_id, priority: F.priority, sms_consent_text: F.sms_consent_text, email_consent_text: F.email_consent_text });
let saveT = null;
async function save(quiet) {
  clearTimeout(saveT); if (saving) { saveT = setTimeout(() => save(quiet), 400); return; }
  saving = true; const sv = $('ksv'); if (sv) { sv.innerHTML = ICON('loader-2') + ' Saving'; }
  try { const out = await api('/api/mk/forms/' + F.id, { method: 'PUT', body: JSON.stringify(F) }); F.status = out.status; F.updated_at = out.updated_at; fdirty = false; if (sv) { sv.innerHTML = ICON('circle-check'); sv.title = 'All changes saved'; } if ($('kst')) { $('kst').value = F.status; dot(); } if (!quiet) toast('Saved'); }
  catch (e) { if (sv) sv.innerHTML = '<span style="color:#B42318">Not saved</span>'; toast(e.message, 1); }
  finally { saving = false; }
}
let histT = null;
function mark(redraw = true) {
  fdirty = true; const sv = $('ksv'); if (sv) { sv.innerHTML = ICON('circle-dot') + ' Unsaved'; }
  clearTimeout(histT); histT = setTimeout(() => { const cur = JSON.stringify(snap()); if (cur !== HIST.last) { HIST.past.push(HIST.last); if (HIST.past.length > 60) HIST.past.shift(); HIST.future = []; HIST.last = cur; bar(); } }, 350);
  clearTimeout(saveT); saveT = setTimeout(() => save(true), 1500);
  if (redraw) draw();
}
function restore(json) { const o = JSON.parse(json); Object.assign(F, o); HIST.last = json; SEL = null; STEPSET = false; if (SI >= F.steps.length) SI = F.steps.length - 1; $('knm').value = F.name; panel(); bar(); fdirty = true; clearTimeout(saveT); saveT = setTimeout(() => save(true), 800); draw(); }
function undo() { if (!HIST.past.length) return; HIST.future.push(JSON.stringify(snap())); restore(HIST.past.pop()); }
function redo() { if (!HIST.future.length) return; HIST.past.push(JSON.stringify(snap())); restore(HIST.future.pop()); }

/* ---------------- canvas: desktop + mobile side by side, zoom ---------------- */
function loadFrame(w) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:15px Helvetica,Arial,sans-serif;background:#fff;min-height:100vh}.nav{height:56px;border-bottom:1px solid #eee;display:flex;align-items:center;padding:0 20px;font-weight:700;letter-spacing:.04em}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;padding:20px}.g div{aspect-ratio:3/4;background:#EEF1F5;border-radius:8px}</style></head>
  <body><div class="nav">${esc(STORE_NAME[F.store] || '')}</div><div id="bzf-embed" style="max-width:640px;margin:20px auto"></div><div class="g"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>
  <script>window.BZF_STUDIO=1;window.BZF_FRAME=${JSON.stringify(w)};window.BZF_ORIGIN=${JSON.stringify(location.origin)};window.BZF_STORE=${JSON.stringify(F.store)};<\/script><script src="${location.origin}/mk-forms-runtime.js?v=${Date.now()}"><\/script>
  <style>html:has(body.edit),body.edit{background:transparent}body.edit .nav,body.edit .g,body.edit #bzf-embed{display:none}</style><script>window.addEventListener('message',function(e){var d=e.data||{};if(!d.bzfRender)return;document.body.classList.toggle('edit',!!(d.opts&&(d.opts.edit||d.opts.teaser)));try{BuzzinFormsShow(d.form,d.opts)}catch(x){document.body.insertAdjacentHTML('beforeend','<pre>'+x.message+'</pre>')}});parent.postMessage({bzf:1,t:'ready',frame:${JSON.stringify(w)}},'*');<\/script></body></html>`;
  $(w === 'd' ? 'fpd' : 'fpm').srcdoc = html;
}
const cz = () => { const z = $('kzw') && Number(($('kzw').dataset.z) || 1); return z || 1; };
function setZoom(z) { ZOOM = Math.max(0.3, Math.min(1.5, Math.round(z * 10) / 10)); layout(); }
function layout() {
  const st = $('kstage'), zw = $('kzw'); if (!st || !zw) return;
  $('kdd').style.display = VIEW === 'mob' ? 'none' : ''; $('kdm').style.display = VIEW === 'desk' ? 'none' : '';
  const dw = devW(), play = MODE === 'play';
  const fd = $('fpd'), fm = $('fpm');
  fd.style.width = dw + 'px'; fm.style.width = DEV_W.m + 'px';
  fd.style.height = (play ? DEV_H : Math.max(320, FH.d)) + 'px'; fm.style.height = (play ? DEV_H : Math.max(320, FH.m)) + 'px';
  fd.classList.toggle('play', play); fm.classList.toggle('play', play);
  const natural = (VIEW !== 'mob' ? dw : 0) + (VIEW !== 'desk' ? DEV_W.m : 0) + (VIEW === 'both' ? 48 : 0);
  const z = ZOOM === 'fit' ? Math.max(0.3, Math.min(1, (st.clientWidth - 48) / natural)) : ZOOM;
  zw.dataset.z = z; zw.style.transform = `scale(${z})`; zw.style.marginLeft = Math.max(0, (st.clientWidth - 48 - natural * z) / 2) + 'px'; zw.style.marginRight = '0';
  const h = Math.max(VIEW !== 'mob' ? parseFloat(fd.style.height) : 0, VIEW !== 'desk' ? parseFloat(fm.style.height) : 0);
  zw.style.height = (h + 36) * z + 'px'; $('kzv').textContent = Math.round(z * 100) + '%';
}
let drawT = null;
function draw() {
  clearTimeout(drawT);
  drawT = setTimeout(() => {
    const pub = clone({ id: F.id, shop_url: SHOP[F.store], steps: F.steps, style: F.style, targeting: F.targeting, teaser: F.teaser, sms_consent_text: F.sms_consent_text, email_consent_text: F.email_consent_text });
    const opts = SI === -1 ? { teaser: true } : MODE === 'edit' ? { edit: { step: SI, sel: STEPSET ? null : SEL, names: BNAME } } : {};
    for (const w of ['d', 'm']) { const fr = $(w === 'd' ? 'fpd' : 'fpm'); if (fr && fr.contentWindow && ready[w]) fr.contentWindow.postMessage({ bzfRender: 1, form: pub, opts }, '*'); }
  }, 50);
}
function onFrame(e) {
  const d = e.data || {}; if (!d.bzf) return;
  const src = [$('fpd'), $('fpm')].find((f) => f && e.source === f.contentWindow); if (!src) return;
  if (d.t === 'ready') { ready[d.frame] = true; draw(); return; }
  if (d.t === 'h') { const h = Math.min(1600, Math.max(200, Number(d.h) || 0) + 8); if (Math.abs((FH[d.frame] || 0) - h) > 2) { FH[d.frame] = h; layout(); } return; }
  if (MODE !== 'edit' || SI < 0) return;
  const bl = step().blocks;
  if (d.t === 'sel') { SEL = d.i >= 0 ? d.i : null; STEPSET = false; if (d.i < 0) { RAIL = 'styles'; $('kside').classList.remove('closed'); rail(); } panel(); draw(); return; }
  if (d.t === 'media') { SEL = null; STEPSET = true; $('kside').classList.remove('closed'); bar(); panel(); draw(); return; }
  if (d.t === 'move') { const [m] = bl.splice(d.from, 1); bl.splice(d.to, 0, m); SEL = d.to; panel(); mark(); return; }
  if (d.t === 'add') { addBlock(d.type, d.at); return; }
  if (d.t === 'tool' && SEL != null) {
    if (d.act === 'up' && SEL > 0) { [bl[SEL - 1], bl[SEL]] = [bl[SEL], bl[SEL - 1]]; SEL--; }
    else if (d.act === 'down' && SEL < bl.length - 1) { [bl[SEL + 1], bl[SEL]] = [bl[SEL], bl[SEL + 1]]; SEL++; }
    else if (d.act === 'dup') { const c = clone(bl[SEL]); c.id = rid(); bl.splice(SEL + 1, 0, c); SEL++; }
    else if (d.act === 'del') { bl.splice(SEL, 1); SEL = null; }
    panel(); mark();
  }
}

/* ---------------- floating step bar: undo/redo · Teaser · steps › Success · views ---------------- */
function bar() {
  const B = $('kbar'); if (!B) return;
  const pills = F.steps.map((s, i) => `${i ? `<i class="ti ti-chevron-right ke-arrow"></i>` : ''}<span class="ke-pill${SI === i ? ' on' : ''}" draggable="true" data-sp="${i}"><span class="gr" aria-hidden="true">⋮⋮</span><button class="lb" data-st="${i}">${s.kind === 'success' ? '' : ''}${esc(s.name || 'Step ' + (i + 1))}</button><button class="mn" data-sm="${i}" aria-label="Step options">${ICON('dots-vertical')}</button></span>`);
  const succ = F.steps.findIndex((s) => s.kind === 'success');
  const addAt = succ >= 0 ? succ : F.steps.length;
  pills.splice(addAt, 0, `${addAt ? '<i class="ti ti-chevron-right ke-arrow"></i>' : ''}<button class="btn xs" id="kadd" style="height:36px;border-radius:9px">${ICON('circle-plus')} Step</button>`);
  if (succ < 0) pills.push('<i class="ti ti-chevron-right ke-arrow"></i><button class="btn xs" id="kaddsucc" style="height:36px;border-radius:9px">Success</button>');
  B.innerHTML = `<button class="ke-ib" id="kun" aria-label="Undo" title="Undo"${HIST.past.length ? '' : ' disabled'}>${ICON('arrow-back-up')}</button><button class="ke-ib" id="kre" aria-label="Redo" title="Redo"${HIST.future.length ? '' : ' disabled'}>${ICON('arrow-forward-up')}</button><span class="sep"></span>
    <span class="ke-pill${SI === -1 ? ' on' : ''}"><button class="lb" data-st="-1">Teaser</button><button class="mn" id="ktm" aria-label="Teaser options">${ICON('dots-vertical')}</button></span><span class="sep"></span>
    ${pills.join('')}<span class="sep"></span>
    <button class="ke-ib${VIEW === 'both' ? ' on' : ''}" data-v="both" aria-label="Desktop and mobile" title="Desktop and mobile">${ICON('devices')}</button><button class="ke-ib${VIEW === 'desk' ? ' on' : ''}" data-v="desk" aria-label="Desktop" title="Desktop">${ICON('device-desktop')}</button><button class="ke-ib${VIEW === 'mob' ? ' on' : ''}" data-v="mob" aria-label="Mobile" title="Mobile">${ICON('device-mobile')}</button>
    <span class="sep"></span><button class="ke-ib${MODE === 'play' ? ' on' : ''}" id="kplay" aria-label="Try it" title="${MODE === 'play' ? 'Back to editing' : 'Try the form'}">${ICON(MODE === 'play' ? 'pencil' : 'player-play')}</button>`;
  $('kun').onclick = undo; $('kre').onclick = redo;
  B.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { SI = Number(b.dataset.st); SEL = null; STEPSET = false; bar(); panel(); draw(); });
  B.querySelectorAll('[data-sm]').forEach((b) => b.onclick = (e) => stepMenu(Number(b.dataset.sm), b));
  $('ktm').onclick = (e) => menu($('ktm'), [['Teaser settings', 'settings', () => { SI = -1; SEL = null; STEPSET = false; bar(); panel(); draw(); }], [F.teaser && F.teaser.enabled !== false ? 'Turn teaser off' : 'Turn teaser on', 'toggle-left', () => { F.teaser = F.teaser || {}; F.teaser.enabled = !(F.teaser.enabled !== false); bar(); panel(); mark(); }]]);
  B.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => { VIEW = b.dataset.v; bar(); layout(); });
  $('kplay').onclick = () => { MODE = MODE === 'play' ? 'edit' : 'play'; if (SI < 0) SI = 0; SEL = null; bar(); layout(); draw(); };
  const ka = $('kadd'); if (ka) ka.onclick = () => {
    F.steps.splice(addAt, 0, { id: 's' + Math.random().toString(36).slice(2, 7), name: 'Step ' + (addAt + 1), kind: 'step', image: { src: '', pos: 'none', width: 42 },
      blocks: [{ id: rid(), type: 'text', html: '<h1>New step</h1>', st: { pad: [0, 0, 10, 0], align: 'center' } }, { id: rid(), type: 'button', text: 'Continue', action: 'submit', st: { pad: [6, 0, 0, 0], align: 'center' } }] });
    SI = addAt; SEL = null; STEPSET = false; bar(); panel(); mark();
  };
  const ks = $('kaddsucc'); if (ks) ks.onclick = () => { F.steps.push({ id: 's' + Math.random().toString(36).slice(2, 7), name: 'Success', kind: 'success', image: { src: '', pos: 'none', width: 42 }, blocks: [{ id: rid(), type: 'text', html: "<h1>You're in!</h1>", st: { pad: [0, 0, 10, 0], align: 'center' } }, { id: rid(), type: 'coupon', st: { pad: [6, 0, 6, 0], align: 'center' } }] }); SI = F.steps.length - 1; bar(); panel(); mark(); };
  // drag step pills to reorder
  let dragFrom = null;
  B.querySelectorAll('[data-sp]').forEach((p) => {
    p.addEventListener('dragstart', (e) => { dragFrom = Number(p.dataset.sp); e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', 'bzf-step'); } catch (x) {} });
    p.addEventListener('dragover', (e) => { if (dragFrom != null) e.preventDefault(); });
    p.addEventListener('drop', (e) => { e.preventDefault(); const to = Number(p.dataset.sp); if (dragFrom == null || to === dragFrom) return; const cur = F.steps[SI]; const [m] = F.steps.splice(dragFrom, 1); F.steps.splice(to, 0, m); SI = F.steps.indexOf(cur); dragFrom = null; bar(); mark(); });
  });
}
function menu(anchor, items) {
  document.querySelectorAll('.ke-menu').forEach((m) => m.remove());
  const r = anchor.getBoundingClientRect(), m = document.createElement('div'); m.className = 'ke-menu';
  m.innerHTML = items.map(([l, ic, , opt], i) => `<button data-mi="${i}"${opt && opt.disabled ? ' disabled' : ''} class="${opt && opt.danger ? 'danger' : ''}">${ICON(ic)} ${esc(l)}</button>`).join('');
  m.style.left = Math.min(window.innerWidth - 210, r.left) + 'px'; m.style.top = r.bottom + 6 + 'px';
  document.body.appendChild(m);
  m.querySelectorAll('[data-mi]').forEach((b) => b.onclick = () => { m.remove(); items[Number(b.dataset.mi)][2](); });
  setTimeout(() => document.addEventListener('click', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('click', off); } }), 0);
}
function stepMenu(i, anchor) {
  const s = F.steps[i];
  menu(anchor, [
    ['Step settings', 'settings', () => { SI = i; SEL = null; STEPSET = true; $('kside').classList.remove('closed'); bar(); panel(); draw(); }],
    ['Rename', 'pencil', () => { const n = prompt('Step name', s.name); if (n) { s.name = n.slice(0, 40); bar(); mark(false); } }],
    ['Duplicate', 'copy', () => { const c = clone(s); c.id = 's' + Math.random().toString(36).slice(2, 7); c.name = s.name + ' copy'; (c.blocks || []).forEach((b) => b.id = rid()); F.steps.splice(i + 1, 0, c); SI = i + 1; bar(); panel(); mark(); }],
    ['Move left', 'arrow-left', () => { [F.steps[i - 1], F.steps[i]] = [F.steps[i], F.steps[i - 1]]; SI = i - 1; bar(); mark(); }, { disabled: i === 0 }],
    ['Move right', 'arrow-right', () => { [F.steps[i + 1], F.steps[i]] = [F.steps[i], F.steps[i + 1]]; SI = i + 1; bar(); mark(); }, { disabled: i >= F.steps.length - 1 }],
    [s.kind === 'success' ? 'Make it a form step' : 'Make it the success step', 'circle-check', () => { s.kind = s.kind === 'success' ? 'step' : 'success'; bar(); panel(); mark(); }],
    ['Delete', 'trash', () => { if (!confirm(`Delete the step "${s.name}"?`)) return; F.steps.splice(i, 1); SI = Math.max(0, Math.min(SI, F.steps.length - 1)); SEL = null; STEPSET = false; bar(); panel(); mark(); }, { disabled: F.steps.length < 2, danger: true }],
  ]);
}

const fl = (label, inner, hint) => `<label class="lab">${esc(label)}</label>${inner}${hint ? `<div style="font-size:11.5px;color:var(--muted);margin-top:3px">${esc(hint)}</div>` : ''}`;
const H = (t) => `<div style="font-weight:700;margin:18px 0 2px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)">${esc(t)}</div>`;
const num = (path, v, o = {}) => `<input type="number" data-p="${path}" value="${v == null ? '' : esc(v)}"${o.min != null ? ` min="${o.min}"` : ''}${o.max != null ? ` max="${o.max}"` : ''} placeholder="${esc(o.ph || '')}" style="width:100%">`;
const txt = (path, v, ph) => `<input type="text" data-p="${path}" value="${esc(v || '')}" placeholder="${esc(ph || '')}" style="width:100%">`;
const area = (path, v, rows = 3) => `<textarea data-p="${path}" rows="${rows}" style="width:100%">${esc(v || '')}</textarea>`;
const chk = (path, v, l) => `<label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" data-p="${path}" data-k="bool"${v ? ' checked' : ''}> ${esc(l)}</label>`;
const selp = (path, v, opts) => `<select data-p="${path}" style="width:100%">${opts.map(([a, l]) => `<option value="${esc(a)}"${String(v) === String(a) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const color = (path, v) => `<div style="display:flex;gap:6px;min-width:0"><input type="color" data-p="${path}" data-k="color" value="${/^#[0-9a-f]{6}$/i.test(v || '') ? v : '#ffffff'}" style="width:34px;height:34px;flex:none;border:1px solid var(--line);border-radius:8px;padding:2px"><input type="text" data-p="${path}" value="${esc(v || '')}" style="flex:1;min-width:0;width:100%;font-family:ui-monospace,Menlo,monospace;font-size:12px"></div>`;
const grid = (...cells) => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">${cells.map((c) => `<div style="min-width:0">${c}</div>`).join('')}</div>`;
const pad4 = (path, a) => `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px">${['Top', 'Right', 'Bottom', 'Left'].map((l, i) => `<div><input type="number" data-p="${path}.${i}" value="${(a || [])[i] == null ? 0 : a[i]}" min="0" max="120" aria-label="${l}" title="${l}" style="width:100%"><div style="font-size:10px;color:var(--muted);text-align:center">${l}</div></div>`).join('')}</div>`;
const getP = (root, p) => p.split('.').reduce((o, k) => (o == null ? o : o[k]), root);
function setP(root, p, v) { const ks = p.split('.'); let o = root; ks.slice(0, -1).forEach((k, i) => { if (o[k] == null) o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k]; }); o[ks[ks.length - 1]] = v; }
/** Wire every [data-p] input in the panel to a path on `root` (F, the step, or the block). */
function bind(P, root, after) {
  P.querySelectorAll('[data-p]').forEach((x) => {
    const ev = x.tagName === 'SELECT' || x.type === 'checkbox' || x.type === 'color' ? 'change' : 'input';
    x.addEventListener(ev, () => {
      let v = x.dataset.k === 'bool' ? x.checked : x.type === 'number' ? (x.value === '' ? null : Number(x.value)) : x.value;
      if (x.dataset.k === 'lines') v = x.value.split('\n').map((y) => y.trim()).filter(Boolean);
      if (x.dataset.k === 'key') v = x.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      setP(root, x.dataset.p, v);
      if (x.dataset.k === 'color') { const t = P.querySelector(`input[type=text][data-p="${x.dataset.p}"]`); if (t) t.value = x.value; }
      if (after) after(x); mark();
    });
  });
}

/* ---------------- left panel ---------------- */
function shell(title, opts = {}) {
  const W = $('fpanel');
  W.innerHTML = `${opts.back ? `<div style="padding:0 18px"><button class="ke-back" id="kbk">${ICON('arrow-left')} ${esc(opts.back)}</button></div>` : ''}<div class="ke-sh"><b>${esc(title)}</b>${opts.right || ''}<button class="ke-ib" id="kcol" aria-label="Collapse panel" title="Collapse">${ICON('layout-sidebar-left-collapse')}</button></div>${opts.tabs || ''}<div class="ke-pane" id="kpane"></div>`;
  $('kcol').onclick = () => { $('kside').classList.add('closed'); rail(); };
  if (opts.back) $('kbk').onclick = () => { if (opts.back === 'Add blocks') RAIL = 'add'; SEL = null; STEPSET = false; if (SI < 0) SI = 0; rail(); bar(); panel(); draw(); };
  return $('kpane');
}
function panel() {
  if (!$('fpanel')) return;
  if (SI === -1) return teaserPanel(shell('Teaser', { back: 'Back' }));
  if (STEPSET) return stepPanel(shell('Step settings', { back: 'Back' }));
  const b = sel();
  if (b) return blockPanel(shell(BNAME[b.type] || b.type, { back: 'Add blocks' }));
  if (RAIL === 'styles') return stylesPanel(shell('Styles'));
  if (RAIL === 'targeting') return targetingPanel(shell('Targeting & behaviors'));
  return addPanel(shell('Add blocks', { tabs: `<div class="ke-tabs"><button data-at="basic" class="${ADDTAB === 'basic' ? 'on' : ''}">Basic</button><button data-at="universal" class="${ADDTAB === 'universal' ? 'on' : ''}">Universal</button></div>` }));
}

/* Add blocks: drag a tile onto the canvas, or click it to add after the selected block */
const SECTIONS = [
  ['Integrations', [['coupon', 'Coupon', 'ticket']]],
  ['Elements', [['text', 'Text', 'typography'], ['button', 'Button', 'click'], ['image', 'Image', 'photo'], ['countdown', 'Countdown timer', 'clock'], ['spacer', 'Spacer', 'arrows-vertical'], ['divider', 'Divider', 'separator-horizontal'], ['html', 'HTML', 'code']]],
  ['Input fields', [['email', 'Email input', 'mail'], ['phone', 'Phone number', 'phone'], ['input', 'Text input', 'forms'], ['radio', 'Radio button', 'circle-dot'], ['checkboxes', 'Checkboxes', 'checkbox'], ['dropdown', 'Dropdown', 'selector'], ['date', 'Date', 'calendar']]],
];
function addPanel(P) {
  document.querySelectorAll('[data-at]').forEach((b) => b.onclick = () => { ADDTAB = b.dataset.at; panel(); });
  const has = (t) => (step().blocks || []).some((x) => x.type === t);
  const tile = (k, l, ic, off, data) => `<div class="ke-tile${off ? ' off' : ''}" ${off ? '' : `draggable="true" data-drag="${esc(data || k)}"`} data-add="${esc(data || k)}" title="${off ? esc(l) + ' is already on this step' : 'Drag onto the form, or click to add'}"><span class="g">⋮⋮⋮</span>${ICON(ic)}<span>${esc(l)}</span></div>`;
  if (ADDTAB === 'universal') {
    P.innerHTML = `<div class="ke-note" style="margin-top:14px">Universal blocks are blocks you saved to reuse in any form. Select a block and choose "Save as universal block".</div>
      <div class="ke-tiles" style="margin-top:14px">${UNIV.map((u) => tile(u.block.type, u.name, (SECTIONS.flatMap((x) => x[1]).find((x) => x[0] === u.block.type) || [, , 'box'])[2], false, 'u:' + u.id)).join('') || '<div style="grid-column:1/-1;color:var(--muted)">None saved yet.</div>'}</div>`;
  } else {
    P.innerHTML = SECTIONS.map(([h, items]) => `<div class="ke-sec">${esc(h)}</div><div class="ke-tiles">${items.map(([k, l, ic]) => tile(k, l, ic, SI >= 0 && (k === 'email' || k === 'phone' || k === 'coupon') && has(k))).join('')}</div>`).join('') +
      `<div style="font-size:12px;color:var(--muted);margin-top:14px">Drag a block onto the form, or click it to add it after the selected block. Click any block on the form to edit it.</div>`;
  }
  P.querySelectorAll('[data-drag]').forEach((t) => t.addEventListener('dragstart', (e) => { e.dataTransfer.effectAllowed = 'copy'; e.dataTransfer.setData('text/plain', 'bzf-add:' + t.dataset.drag); }));
  P.querySelectorAll('.ke-tile:not(.off)').forEach((t) => t.onclick = () => addBlock(t.dataset.add));
}
function addBlock(type, at) {
  if (SI < 0) SI = 0;
  const s = step(); s.blocks = s.blocks || [];
  let nb;
  if (String(type).indexOf('u:') === 0) { const u = UNIV.find((x) => x.id === type.slice(2)); if (!u) return; nb = clone(u.block); nb.id = rid(); }
  else {
    const d = { text: { html: '<p>Your text here</p>' }, image: { src: '', alt: '', width: 100 }, button: { text: 'Continue', action: 'submit' }, email: { placeholder: 'Email', label: 'Email', required: true, show_consent: true },
      phone: { placeholder: 'Phone Number', label: 'Phone', required: false }, input: { label: 'First name', placeholder: 'First name', key: 'first_name' }, checkboxes: { label: 'Interested in', key: 'interests', options: ['Newborn', 'Toddler', 'Matching family'] },
      radio: { label: 'Are you…', key: 'baby_stage', options: ['Expecting', 'Parent of a little one', 'Shopping for a gift'], display: 'buttons' }, dropdown: { label: 'Size', key: 'child_size', options: ['NB', '0-3M', '3-6M', '6-12M', '12-18M', '18-24M', '2T', '3T', '4T', '5T'], placeholder: 'Choose a size' },
      date: { label: "Baby's due date or birthday", key: 'baby_date' }, coupon: { copy: true, copy_text: 'Copy' }, countdown: { mode: 'minutes', minutes: 15, expired_text: 'Offer ended' }, spacer: { height: 16 }, divider: { thickness: 1, color: '#E5E5E5', width: 100 }, html: { html: '' } }[type];
    if (!d) return;
    nb = { id: rid(), type, ...d, st: { pad: [4, 0, type === 'text' ? 10 : 4, 0], align: 'center' } };
  }
  const pos = at != null ? Math.max(0, Math.min(at, s.blocks.length)) : SEL != null && SEL >= 0 ? SEL + 1 : s.blocks.length;
  s.blocks.splice(pos, 0, nb);
  if (nb.type === 'coupon' && F.coupon && !F.coupon.enabled) F.coupon.enabled = true;
  SEL = pos; STEPSET = false; panel(); mark();
}

/* Step settings (from a step's ⋮ menu) */
function stepPanel(P) {
  const s = step();
  P.innerHTML = `${grid(fl('Step name', txt('name', s.name)), fl('Step type', selp('kind', s.kind || 'step', [['step', 'Form step'], ['success', 'Success (end)']])))}
    ${H('Side image')}${fl('Image', `<div id="simg"></div>${txt('image.src', (s.image || {}).src, 'Image address')}`)}
    ${grid(fl('Position', selp('image.pos', (s.image || {}).pos || 'none', [['none', 'No image'], ['left', 'Left'], ['right', 'Right'], ['top', 'Top']])), fl('Width (%)', num('image.width', (s.image || {}).width || 42, { min: 20, max: 60 })))}
    <div style="font-size:11.5px;color:var(--muted);margin-top:3px">Side images are hidden on phones unless placed on top.</div>
    ${s.kind !== 'success' ? `${H('After this step')}${chk('skip_if_sms', s.skip_if_sms, 'Skip this step for people who already get texts')}
    ${fl('Go to', `<select id="snext" style="width:100%"><option value="">The next step</option>${F.steps.filter((x) => x.id !== s.id).map((x) => `<option value="${x.id}"${s.next === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`)}
    <div style="margin-top:12px;font-weight:600">Go to a different step based on an answer</div>${(s.branches || []).map((b, i) => `<div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:4px;margin-top:4px"><input type="text" data-br="${i}" data-bk="field" value="${esc(b.field || '')}" placeholder="saved as"><input type="text" data-br="${i}" data-bk="equals" value="${esc(b.equals || '')}" placeholder="answer"><select data-br="${i}" data-bk="go">${F.steps.map((x) => `<option value="${x.id}"${b.go === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button class="btn xs" data-brm="${i}" aria-label="Remove rule">×</button></div>`).join('')}<button class="btn xs" id="badd" style="margin-top:6px">${ICON('plus')} Add rule</button>` : ''}`;
  bind(P, s, (x) => { if (x.dataset.p === 'name' || x.dataset.p === 'kind') bar(); if (x.dataset.p === 'kind') panel(); });
  if (window.MK_imagePicker) window.MK_imagePicker($('simg'), (url) => { s.image = s.image || {}; s.image.src = location.origin + url; if (!s.image.pos || s.image.pos === 'none') s.image.pos = 'right'; panel(); mark(); });
  const sn = $('snext'); if (sn) sn.onchange = () => { s.next = sn.value || undefined; mark(); };
  P.querySelectorAll('[data-br]').forEach((x) => x.addEventListener(x.tagName === 'SELECT' ? 'change' : 'input', () => { s.branches[Number(x.dataset.br)][x.dataset.bk] = x.value; mark(); }));
  P.querySelectorAll('[data-brm]').forEach((x) => x.onclick = () => { s.branches.splice(Number(x.dataset.brm), 1); panel(); mark(); });
  const ba = $('badd'); if (ba) ba.onclick = () => { s.branches = s.branches || []; const k = (s.blocks || []).find((b) => b.key); s.branches.push({ field: k ? k.key : '', equals: '', go: (F.steps[SI + 1] || F.steps[0]).id }); panel(); mark(); };
}

/* Targeting & behaviors (Klaviyo keeps these together) */
function targetingPanel(P) {
  const t = F.targeting;
  P.innerHTML = `${H('Display timing')}<div style="font-size:12px;color:var(--muted)">Shows at the first of these that happens.</div>
    ${chk('immediate', t.immediate, 'Show immediately on page load')}
    ${fl('After a delay (seconds)', num('delay_s', t.delay_s, { min: 0, max: 300, ph: 'off' }))}
    ${fl('After scrolling (% of page)', num('scroll_pct', t.scroll_pct, { min: 0, max: 100, ph: 'off' }))}
    ${chk('exit_intent', t.exit_intent, 'On exit intent (desktop)')}
    ${fl('After this many pages viewed', num('page_views', t.page_views, { min: 1, max: 20, ph: 'off' }))}
    ${H('Frequency')}${fl('If closed, show again after (days)', num('hide_days_after_close', t.hide_days_after_close == null ? 14 : t.hide_days_after_close, { min: 0, max: 365 }))}
    <div style="font-size:11.5px;color:var(--muted);margin-top:3px">Once someone submits, they don't see it again.</div>
    ${H('Visitors')}${chk('hide_subscribed', t.hide_subscribed !== false, "Don't show to existing subscribers")}
    ${fl('Device', selp('device', t.device || 'all', [['all', 'Desktop and mobile'], ['desktop', 'Desktop only'], ['mobile', 'Mobile only']]))}
    ${fl('Show to', selp('visitors', t.visitors || 'all', [['all', 'All visitors'], ['new', 'New visitors only'], ['returning', 'Returning visitors only']]))}
    ${fl('Only when the link has utm_source', txt('utm_source', t.utm_source, 'e.g. facebook'), 'For a form just for ad traffic, like your Meta URL-based forms.')}
    ${H('Pages')}${fl('Only on these pages', area('only_paths', t.only_paths, 2), 'One per line, like /collections/*. Empty = every page except cart and checkout.')}${fl('Never on these pages', area('hide_paths', t.hide_paths, 2))}
    ${H('Submissions')}${fl('Add people who sign up to this list', `<select id="ol" style="width:100%">${(F.lists || []).map((l) => `<option value="${l.id}"${Number(F.list_id) === Number(l.id) ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`, 'Joining the list starts any flow triggered by it, like the welcome series.')}
    ${fl('Close the success step after (seconds)', num('success_close_s', t.success_close_s, { min: 1, max: 120, ph: 'stay open' }))}
    ${H('Priority')}${fl('Priority', `<input type="number" id="tpr" value="${F.priority || 0}" style="width:100%">`, 'When two forms could show, the higher number wins. Only one popup shows at a time.')}
    ${F.import_notes && F.import_notes.length ? `${H('Copied from Klaviyo')}<div class="ke-note">${F.import_notes.map((n) => '• ' + esc(n)).join('<br>')}</div>` : ''}`;
  bind(P, t);
  $('ol').onchange = (e) => { F.list_id = Number(e.target.value); mark(false); };
  $('tpr').oninput = (e) => { F.priority = Number(e.target.value) || 0; mark(false); };
}

/* Content: a selected block */
function blockPanel(P) {
  const s = step(), b = sel();
  const actions = [['submit', 'Submit form'], ['next', 'Go to next step'], ['step', 'Go to step…'], ['close', 'Close form'], ['url', 'Go to URL'], ['copy', 'Copy coupon code']];
  let body = '';
  switch (b.type) {
    case 'text': body = `<div class="bar" style="flex-wrap:wrap;gap:4px;margin-top:10px">
        <select id="rtf" aria-label="Text style" style="width:auto"><option value="">Style</option><option value="p">Paragraph</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option></select>
        <button class="btn xs" data-cmd="bold" aria-label="Bold"><b>B</b></button><button class="btn xs" data-cmd="italic" aria-label="Italic"><i>I</i></button><button class="btn xs" data-cmd="underline" aria-label="Underline"><u>U</u></button>
        <button class="btn xs" data-cmd="insertUnorderedList" aria-label="List"><i class="ti ti-list"></i></button><button class="btn xs" id="rtl" aria-label="Link"><i class="ti ti-link"></i></button>
        <input type="color" id="rtc" aria-label="Text color" style="width:34px;height:28px;border:1px solid var(--line);border-radius:6px;padding:1px"><button class="btn xs" data-cmd="removeFormat" aria-label="Clear formatting"><i class="ti ti-clear-formatting"></i></button></div>
      <div id="rte" contenteditable="true" style="min-height:110px;border:1px solid var(--line);border-radius:10px;padding:10px;margin-top:6px;background:#fff">${b.html || ''}</div>
      <button class="btn xs" id="raiw" style="margin-top:6px"><i class="ti ti-sparkles"></i> Ask Emily for wording</button>
      ${fl('Personalize', '<div style="font-size:12px;color:var(--muted)">Coupon shows in the Coupon block. Text is the same for everyone.</div>')}`; break;
    case 'image': body = `${fl('Image', `<div id="bimg"></div>${txt('src', b.src, 'Image address')}`)}${fl('Alt text', txt('alt', b.alt, 'Describe the image'))}${fl('Link (optional)', txt('link', b.link, 'https://'))}${grid(fl('Width (%)', num('width', b.width || 100, { min: 10, max: 100 })), fl('Corner radius', num('radius', b.radius || 0, { min: 0, max: 60 })))}`; break;
    case 'button': body = `${fl('Button text', txt('text', b.text))}${fl('When clicked', selp('action', b.action || 'submit', actions))}
      ${b.action === 'url' ? fl('URL', txt('url', b.url, '/collections/all')) + chk('new_tab', b.new_tab, 'Open in a new tab') : ''}
      ${b.action === 'step' ? fl('Step', selp('step', b.step || '', F.steps.map((x) => [x.id, x.name]))) : ''}
      ${fl('Look', selp('look', b.look || 'button', [['button', 'Button'], ['link', 'Text link']]))}
      ${b.look !== 'link' ? grid(fl('Background', color('bg', b.bg || '')), fl('Text color', color('color', b.color || ''))) + grid(fl('Corner radius', num('radius', b.radius, { min: 0, max: 999, ph: 'form default' })), fl('Width', `<select data-p="full" data-k="full" style="width:100%"><option value=""${b.full == null ? ' selected' : ''}>Form default</option><option value="1"${b.full === true ? ' selected' : ''}>Full width</option><option value="0"${b.full === false ? ' selected' : ''}>Fit text</option></select>`)) : ''}
      <div style="font-size:11.5px;color:var(--muted);margin-top:6px">Leave colors empty to use the form's button style (Styles tab).</div>`; break;
    case 'email': body = `${fl('Placeholder', txt('placeholder', b.placeholder))}${fl('Label', txt('label', b.label))}${chk('show_label', b.show_label, 'Show the label above the field')}${chk('required', b.required !== false, 'Required')}
      ${chk('show_consent', b.show_consent !== false, 'Show the email consent line under the field')}${fl('Email consent line', `<textarea id="emc" rows="3" style="width:100%">${esc(F.email_consent_text || '')}</textarea>`, 'Saved with each sign-up as the wording they agreed to.')}`; break;
    case 'phone': body = `${fl('Placeholder', txt('placeholder', b.placeholder))}${fl('Label', txt('label', b.label))}${chk('show_label', b.show_label, 'Show the label above the field')}${chk('required', b.required !== false, 'Required (if off, people can leave it empty)')}
      ${fl('Text consent wording (required)', `<textarea id="smsc" rows="6" style="width:100%">${esc(F.sms_consent_text || '')}</textarea>`, 'Always shown next to an unchecked box under the phone field. Carriers and the TCPA require this; texts are only allowed when the box is checked.')}`; break;
    case 'input': case 'date': body = `${fl('Label', txt('label', b.label))}${b.type === 'input' ? fl('Placeholder', txt('placeholder', b.placeholder)) : ''}${fl('Saved on the profile as', `<input type="text" data-p="key" data-k="key" value="${esc(b.key || '')}" style="width:100%">`, 'Use this name in segments and personalization.')}${chk('show_label', b.show_label, 'Show the label above the field')}${chk('required', b.required, 'Required')}`; break;
    case 'checkboxes': case 'radio': case 'dropdown': body = `${fl('Label', txt('label', b.label))}${fl('Options (one per line)', `<textarea data-p="options" data-k="lines" rows="5" style="width:100%">${esc((b.options || []).join('\n'))}</textarea>`)}${fl('Saved on the profile as', `<input type="text" data-p="key" data-k="key" value="${esc(b.key || '')}" style="width:100%">`)}
      ${b.type === 'radio' ? fl('Show as', selp('display', b.display || 'buttons', [['buttons', 'Buttons'], ['list', 'Radio list']])) : ''}${b.type === 'dropdown' ? fl('Placeholder', txt('placeholder', b.placeholder)) + chk('show_label', b.show_label, 'Show the label above the field') : ''}${chk('required', b.required, 'Required')}`; break;
    case 'coupon': { const c = F.coupon || (F.coupon = {}); body = `<div class="ke-note">Each person gets their own single-use code after they sign up. Real codes are made in Shopify only when the form is Live.</div>
      <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="cpon"${c.enabled ? ' checked' : ''}> Give a code</label>
      ${grid(fl('Percent off', `<input type="number" id="cpp" min="1" max="90" value="${c.percent || 10}" style="width:100%">`), fl('Expires after (days)', `<input type="number" id="cpe" min="1" max="365" value="${c.expires_days || 14}" style="width:100%">`))}
      ${fl('Code starts with', `<input type="text" id="cpx" value="${esc(c.prefix || 'WELCOME')}" style="width:100%">`)}${chk('copy', b.copy !== false, 'Show a copy button')}${fl('Copy button text', txt('copy_text', b.copy_text || 'Copy'))}`; break; }
    case 'countdown': body = `${fl('Count down', selp('mode', b.mode || 'minutes', [['minutes', 'Minutes after they first see the form'], ['date', 'To a date and time']]))}${b.mode === 'date' ? fl('Ends', `<input type="datetime-local" data-p="date" value="${esc(b.date || '')}" style="width:100%">`) : fl('Minutes', num('minutes', b.minutes || 15, { min: 1, max: 10080 }))}${fl('When it ends, show', txt('expired_text', b.expired_text || 'Offer ended'))}`; break;
    case 'spacer': body = fl('Height (px)', num('height', b.height || 16, { min: 0, max: 200 })); break;
    case 'divider': body = `${grid(fl('Thickness', num('thickness', b.thickness || 1, { min: 1, max: 10 })), fl('Width (%)', num('width', b.width || 100, { min: 10, max: 100 })))}${fl('Color', color('color', b.color || '#E5E5E5'))}`; break;
    case 'html': body = `${fl('HTML', area('html', b.html, 10), 'Scripts are removed. For layout and styling only.')}`; break;
  }
  P.innerHTML = `<div style="display:flex;align-items:center;gap:6px;margin:8px 0 2px"><span style="flex:1;color:var(--muted);font-size:12px">On step "${esc(s.name)}"</span>
      <button class="btn xs" id="bup" aria-label="Move up"${SEL > 0 ? '' : ' disabled'}>${ICON('arrow-up')}</button><button class="btn xs" id="bdn" aria-label="Move down"${SEL < s.blocks.length - 1 ? '' : ' disabled'}>${ICON('arrow-down')}</button>
      <button class="btn xs" id="bdup" aria-label="Duplicate">${ICON('copy')}</button><button class="btn xs danger" id="bdel" aria-label="Delete">${ICON('trash')}</button></div>
    ${body}
    ${H('Block style')}${fl('Padding (px)', pad4('st.pad', (b.st || {}).pad))}${grid(fl('Alignment', selp('st.align', (b.st || {}).align || 'center', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']])), fl('Background', color('st.bg', (b.st || {}).bg || '')))}
    <button class="btn xs" id="buni" style="margin-top:16px">${ICON('star')} Save as universal block</button>`;
  bind(P, b, (x) => { if (['action', 'look', 'mode', 'display'].includes(x.dataset.p)) panel(); });
  const fullSel = P.querySelector('[data-k="full"]'); if (fullSel) fullSel.onchange = () => { b.full = fullSel.value === '' ? undefined : fullSel.value === '1'; mark(); };
  $('bup').onclick = () => { [s.blocks[SEL - 1], s.blocks[SEL]] = [s.blocks[SEL], s.blocks[SEL - 1]]; SEL--; panel(); mark(); };
  $('bdn').onclick = () => { [s.blocks[SEL + 1], s.blocks[SEL]] = [s.blocks[SEL], s.blocks[SEL + 1]]; SEL++; panel(); mark(); };
  $('bdup').onclick = () => { const c = clone(b); c.id = rid(); s.blocks.splice(SEL + 1, 0, c); SEL++; panel(); mark(); };
  $('bdel').onclick = () => { s.blocks.splice(SEL, 1); SEL = null; panel(); mark(); };
  $('buni').onclick = async () => { const n = prompt('Name for this universal block', BNAME[b.type] || b.type); if (!n) return; const item = { id: Math.random().toString(36).slice(2, 9), name: n.slice(0, 40), block: clone(b) };
    try { UNIV = (await api('/api/mk/forms-universal', { method: 'PUT', body: JSON.stringify({ items: [...UNIV, item] }) })).items || UNIV; toast('Saved to Universal'); } catch (e) { toast(e.message, 1); } };
  const emc = $('emc'); if (emc) emc.oninput = () => { F.email_consent_text = emc.value; mark(); };
  if (b.type === 'coupon') { const c = F.coupon; $('cpon').onchange = (e) => { c.enabled = e.target.checked; mark(false); }; $('cpp').oninput = (e) => { c.percent = Number(e.target.value); mark(false); }; $('cpe').oninput = (e) => { c.expires_days = Number(e.target.value); mark(false); }; $('cpx').oninput = (e) => { c.prefix = e.target.value; mark(false); }; }
  const smsc = $('smsc'); if (smsc) smsc.oninput = () => { F.sms_consent_text = smsc.value; mark(); };
  if (b.type === 'image' && window.MK_imagePicker) window.MK_imagePicker($('bimg'), (url) => { b.src = location.origin + url; panel(); mark(); });
  if (b.type === 'text') {
    const ed = $('rte'), sync = () => { b.html = ed.innerHTML; mark(); };
    ed.oninput = sync;
    P.querySelectorAll('[data-cmd]').forEach((x) => x.onmousedown = (e) => { e.preventDefault(); document.execCommand(x.dataset.cmd, false, null); sync(); });
    $('rtf').onchange = (e) => { ed.focus(); document.execCommand('formatBlock', false, e.target.value); e.target.value = ''; sync(); };
    $('rtc').oninput = (e) => { ed.focus(); document.execCommand('foreColor', false, e.target.value); sync(); };
    $('rtl').onmousedown = (e) => { e.preventDefault(); const u = prompt('Link address'); if (u) { document.execCommand('createLink', false, u); sync(); } };
    $('raiw').onclick = () => window.MK_aiPick && window.MK_aiPick('form', `Sign-up form for ${STORE_NAME[F.store]}, step "${s.name}". Offer: ${F.coupon && F.coupon.enabled ? F.coupon.percent + '% off the first order' : 'none'}.`, (o) => { b.html = (o.headline ? `<h1>${esc(o.headline)}</h1>` : '') + (o.subline ? `<p>${esc(o.subline)}</p>` : ''); panel(); mark(); });
  }
}

/* Teaser tab (selected from the step tabs) */
function teaserPanel(P) {
  const t = F.teaser || (F.teaser = {});
  P.innerHTML = `${H('Teaser')}<div style="font-size:12px;color:var(--muted)">The small tab that reopens the form.</div>${chk('enabled', t.enabled !== false, 'Show a teaser')}
    ${fl('Text', txt('text', t.text, 'Get 10% off'))}${fl('Show it', selp('when', t.when || 'after_close', [['after_close', 'After they close the form'], ['before', 'Before the form opens'], ['both', 'Before and after']]))}
    ${fl('Position', selp('position', t.position || 'bottom-left', [['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right'], ['left-middle', 'Left side, middle']]))}
    ${grid(fl('Background', color('bg', t.bg || '#242F3F')), fl('Text color', color('color', t.color || '#FFFFFF')))}${fl('Corner radius', num('radius', t.radius == null ? 999 : t.radius, { min: 0, max: 999 }))}`;
  bind(P, t);
}

/* Styles: the whole form */
function stylesPanel(P) {
  const y = F.style, type = y.type || 'popup';
  const positions = type === 'flyout' ? [['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left'], ['top-right', 'Top right'], ['top-left', 'Top left']] : type === 'banner' ? [['top', 'Top'], ['bottom', 'Bottom']] : [['center', 'Center']];
  const fontSel = (path, v) => `<select data-p="${path}" style="width:100%">${FONTS.map(([a, l]) => `<option value="${esc(a)}"${v === a ? ' selected' : ''}>${esc(l)}</option>`).join('')}${FONTS.some(([a]) => a === v) ? '' : `<option value="${esc(v || '')}" selected>${esc(v || '')}</option>`}</select>`;
  P.innerHTML = `${H('Form')}${grid(fl('Form type', selp('type', type, [['popup', 'Popup'], ['flyout', 'Flyout'], ['full', 'Full page'], ['embedded', 'Embed'], ['banner', 'Banner']])), fl('Position', selp('position', y.position || positions[0][0], positions)))}
    ${type === 'embedded' ? `<div class="note" style="margin-top:8px">Add <code>&lt;div data-buzzin-form="${F.id}"&gt;&lt;/div&gt;</code> in the theme where the form should appear.</div>` : ''}
    ${grid(fl('Width (px)', num('width', y.width, { min: 260, max: 1000 })), fl('Min height (px)', num('min_height', y.min_height || '', { min: 0, max: 900, ph: 'auto' })))}
    ${fl('Animation', selp('anim', y.anim || 'fade', [['fade', 'Fade in'], ['slide', 'Slide up'], ['none', 'None']]))}
    ${H('Background')}${fl('Color', color('bg', y.bg))}${fl('Image', `<div id="sbg"></div>${txt('bg_image', y.bg_image, 'Image address (optional)')}`)}${fl('Image fit', selp('bg_fit', y.bg_fit || 'cover', [['cover', 'Fill'], ['contain', 'Fit']]))}
    ${H('Border & shadow')}${grid(fl('Border width', num('border_width', y.border_width || 0, { min: 0, max: 20 })), fl('Corner radius', num('radius', y.radius, { min: 0, max: 60 })))}${fl('Border color', color('border_color', y.border_color))}${chk('shadow', y.shadow !== false, 'Drop shadow')}
    ${H('Padding (px)')}${pad4('pad', y.pad)}
    ${type === 'popup' || type === 'full' ? `${H('Overlay')}${grid(fl('Color', color('overlay.color', y.overlay.color)), fl('Opacity (%)', num('overlay.opacity', y.overlay.opacity, { min: 0, max: 100 })))}${chk('overlay.close_on_click', y.overlay.close_on_click !== false, 'Close when the overlay is clicked')}` : ''}
    ${H('Close button')}${chk('close.show', y.close.show !== false, 'Show close button')}${grid(fl('Style', selp('close.style', y.close.style || 'circle', [['circle', 'Circle'], ['plain', 'Plain ×']])), fl('Size', num('close.size', y.close.size, { min: 20, max: 56 })))}${grid(fl('Color', color('close.color', y.close.color)), fl('Circle color', color('close.bg', y.close.bg)))}${chk('close.outside', y.close.outside, 'Place outside the form')}
    ${H('Text')}${fl('Font', fontSel('font.family', y.font.family))}${grid(fl('Size', num('font.size', y.font.size, { min: 10, max: 28 })), fl('Color', color('font.color', y.font.color)))}
    ${['h1', 'h2'].map((h) => `${H(h === 'h1' ? 'Heading 1' : 'Heading 2')}${fl('Font', fontSel(h + '.family', y[h].family))}${grid(fl('Size', num(h + '.size', y[h].size, { min: 12, max: 72 })), fl('Weight', selp(h + '.weight', y[h].weight || 700, [[400, 'Regular'], [600, 'Semibold'], [700, 'Bold']])))}${fl('Color', color(h + '.color', y[h].color))}`).join('')}
    ${H('Input fields')}${grid(fl('Background', color('input.bg', y.input.bg)), fl('Text', color('input.color', y.input.color)))}${grid(fl('Border', color('input.border', y.input.border)), fl('Label color', color('input.label_color', y.input.label_color)))}
      ${grid(fl('Corner radius', num('input.radius', y.input.radius, { min: 0, max: 40 })), fl('Height', num('input.height', y.input.height, { min: 32, max: 72 })))}${fl('Text size', num('input.font_size', y.input.font_size, { min: 12, max: 24 }))}${chk('input.show_labels', y.input.show_labels, 'Show labels above fields')}
    ${H('Buttons')}${grid(fl('Background', color('button.bg', y.button.bg)), fl('Text', color('button.color', y.button.color)))}${fl('Font', fontSel('button.family', y.button.family || y.font.family))}
      ${grid(fl('Text size', num('button.font_size', y.button.font_size, { min: 11, max: 28 })), fl('Weight', selp('button.weight', y.button.weight || 700, [[400, 'Regular'], [600, 'Semibold'], [700, 'Bold']])))}
      ${grid(fl('Corner radius', num('button.radius', y.button.radius, { min: 0, max: 999 })), fl('Height', num('button.height', y.button.height, { min: 32, max: 80 })))}${grid(fl('Border width', num('button.border_width', y.button.border_width || 0, { min: 0, max: 8 })), fl('Border color', color('button.border_color', y.button.border_color)))}${chk('button.full', y.button.full !== false, 'Full width')}
    ${H('Mobile')}${chk('mobile.sheet', y.mobile.sheet !== false, 'Slide up from the bottom on phones')}${grid(fl('Width (%)', num('mobile.width_pct', y.mobile.width_pct, { min: 50, max: 100 })), fl('Text scale (%)', num('mobile.scale', y.mobile.scale, { min: 70, max: 130 })))}${fl('Padding (px)', pad4('mobile.pad', y.mobile.pad))}
    <div style="font-size:11.5px;color:var(--muted);margin-top:6px">Side images are hidden on phones unless placed on top.</div>`;
  bind(P, y, (x) => { if (x.dataset.p === 'width') layout(); if (x.dataset.p === 'type') { const p = { flyout: 'bottom-right', banner: 'top' }[y.type] || 'center'; y.position = p; panel(); } });
  if (window.MK_imagePicker) window.MK_imagePicker($('sbg'), (url) => { y.bg_image = location.origin + url; panel(); mark(); });
}

})();
