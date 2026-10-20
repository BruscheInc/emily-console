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

async function renderForms(el, id) {
  if (id) return editForm(el, id);
  const r = await api('/api/mk/forms?' + qs({ store: STORE }));
  el.innerHTML = `<h1>Sign-up forms</h1><p class="sub">Popups, flyouts, full-page, banners and embedded forms for the store. A form only appears on the store when it's Live, or when you open the store with the preview link.</p>
  <div class="bar"><button class="btn pri" id="fn"${STORE ? '' : ' disabled title="Pick a store first"'}><i class="ti ti-plus"></i> Create form</button>${STORE ? '' : '<span style="color:var(--muted)">Pick the store the form goes on (top) to create one.</span>'}</div>
  <div class="card" style="padding:6px"><div class="tw"><table><thead><tr><th>Form</th><th>Status</th><th>Type</th><th class="n">Views</th><th class="n">Emails</th><th class="n">Phones</th><th class="n">Sign-up rate</th></tr></thead><tbody>
  ${r.forms.map((f) => `<tr class="click" data-id="${f.id}"><td><b>${esc(f.name)}</b></td><td>${pill(STATUS, f.status)}</td><td>${esc(TYPE_NAME[(f.style || {}).type || (f.style || {}).layout] || 'Popup')}</td><td class="n">${fmtN(f.views)}</td><td class="n">${fmtN(f.emails)}</td><td class="n">${fmtN(f.phones)}</td><td class="n">${f.views ? (Math.round(f.emails / f.views * 1000) / 10) + '%' : '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">No forms yet.</td></tr>'}
  </tbody></table></div></div>
  ${r.klaviyo.length ? `<div class="card" style="margin-top:12px"><b>Your Klaviyo forms</b><p class="sub" style="margin:4px 0 8px">For reference while rebuilding them here.</p>${r.klaviyo.map((k) => `<span class="pill off" style="margin-right:6px">${esc(k.name)} · ${esc(k.status || '')}</span>`).join('')}</div>` : ''}`;
  el.querySelectorAll('tr.click').forEach((tr) => tr.onclick = () => { location.hash = '#forms/' + tr.dataset.id; });
  $('fn').onclick = async () => { try { const f = await api('/api/mk/forms', { method: 'POST', body: JSON.stringify({ store: STORE, name: 'Welcome popup' }) }); location.hash = '#forms/' + f.id; } catch (e) { toast(e.message, 1); } };
}

/* ---------------- editor state ---------------- */
let F = null, TAB = 'content', SI = 0, SEL = null, DEV = 'desk', MODE = 'edit', fdirty = false, frameReady = false;
const step = () => F.steps[SI] || F.steps[0];
const sel = () => (SEL != null && SEL >= 0 ? (step().blocks || [])[SEL] : null);

async function editForm(el, id) {
  F = await api('/api/mk/forms/' + id); fdirty = false; SI = 0; SEL = null; TAB = 'content'; MODE = 'edit'; frameReady = false;
  el.style.padding = '0';
  el.innerHTML = `<div style="display:flex;flex-direction:column;height:100%">
  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 16px;background:#fff;border-bottom:1px solid var(--line)">
    <a href="#forms" class="btn xs" aria-label="Back"><i class="ti ti-arrow-left"></i></a><input id="fnm" type="text" value="${esc(F.name)}" aria-label="Form name" style="font-weight:700;min-width:220px">
    <span class="pill off">${esc(STORE_NAME[F.store] || '')}</span>
    <select id="fst" aria-label="Status"><option value="draft">Draft</option><option value="preview">Preview only</option><option value="live">Live</option></select>
    <span class="sp"></span><span class="pill hon hidden" id="fdirty">Unsaved</span><span id="fstat" style="color:var(--muted);font-size:12px"></span>
    <a class="btn" id="fopen" target="_blank" rel="noopener" href="${SHOP[F.store]}/?buzzin_form=preview"><i class="ti ti-external-link"></i> Preview on store</a>
    <button class="btn danger" id="fdel" aria-label="Delete form"><i class="ti ti-trash"></i></button><button class="btn pri" id="fsave">Save</button></div>
  <div style="flex:1;display:flex;min-height:0">
    <div style="width:360px;flex:none;border-right:1px solid var(--line);background:#fff;display:flex;flex-direction:column;min-height:0">
      <style>#ftabs{display:flex;margin:10px 12px}#ftabs button{flex:1;padding:6px 4px;font-size:12px;min-width:0}</style><div class="seg" id="ftabs"><button data-t="content">Content</button><button data-t="styles">Styles</button><button data-t="behaviors">Behaviors</button><button data-t="targeting">Targeting</button><button data-t="offer">Offer</button></div>
      <div id="fpanel" style="padding:0 14px 40px;overflow-y:auto;flex:1"></div></div>
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:#ECEAE5">
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:10px 14px">
        <div id="fsteps" style="display:flex;gap:4px;flex-wrap:wrap"></div><span class="sp"></span>
        <div class="seg" id="fmode"><button data-m="edit" class="on"><i class="ti ti-pencil"></i> Edit</button><button data-m="play"><i class="ti ti-player-play"></i> Try it</button></div>
        <div class="seg" id="fdev"><button data-d="desk" class="on" aria-label="Desktop"><i class="ti ti-device-desktop"></i></button><button data-d="mob" aria-label="Mobile"><i class="ti ti-device-mobile"></i></button></div></div>
      <div style="flex:1;overflow:auto;display:flex;justify-content:center;padding:0 14px 14px"><iframe id="fpv" title="Form canvas" style="border:0;background:#fff;border-radius:12px;width:1000px;max-width:100%;height:100%;min-height:640px"></iframe></div></div></div></div>`;
  $('fst').value = F.status;
  const st = F.stats && F.stats.live; $('fstat').textContent = st ? `${fmtN(st.viewed)} views · ${fmtN(st.emails)} emails · ${fmtN(st.phones)} phones · ${st.rate}% · ${fmt$(F.stats.revenue)}` : '';
  $('fnm').oninput = () => { F.name = $('fnm').value; mark(false); };
  $('fst').onchange = () => { F.status = $('fst').value; mark(false); };
  $('ftabs').querySelectorAll('button').forEach((b) => b.onclick = () => { TAB = b.dataset.t; panel(); });
  $('fdev').querySelectorAll('button').forEach((b) => b.onclick = () => { DEV = b.dataset.d; $('fdev').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); $('fpv').style.width = DEV === 'mob' ? '390px' : '1000px'; draw(); });
  $('fmode').querySelectorAll('button').forEach((b) => b.onclick = () => { MODE = b.dataset.m; $('fmode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  $('fsave').onclick = save;
  $('fdel').onclick = async () => { if ($('fdel').dataset.c !== '1') { $('fdel').dataset.c = '1'; $('fdel').textContent = 'Click again to delete'; return; } try { await api('/api/mk/forms/' + F.id, { method: 'DELETE' }); location.hash = '#forms'; } catch (e) { toast(e.message, 1); } };
  window.onbeforeunload = () => fdirty ? 'Unsaved changes' : undefined;
  window.removeEventListener('message', onFrame); window.addEventListener('message', onFrame);
  loadFrame(); stepTabs(); panel();
}
async function save() {
  try { const out = await api('/api/mk/forms/' + F.id, { method: 'PUT', body: JSON.stringify(F) }); F = { ...F, ...out }; fdirty = false; $('fdirty').classList.add('hidden'); $('fst').value = F.status; toast('Saved'); draw(); }
  catch (e) { toast(e.message, 1); }
}
function mark(redraw = true) { fdirty = true; $('fdirty').classList.remove('hidden'); if (redraw) draw(); }

/* ---------------- canvas ---------------- */
function loadFrame() {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:15px Helvetica,Arial,sans-serif;background:#fff}.nav{height:56px;border-bottom:1px solid #eee;display:flex;align-items:center;padding:0 20px;font-weight:700;letter-spacing:.04em}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;padding:20px}.g div{aspect-ratio:3/4;background:#EEF1F5;border-radius:8px}</style></head>
  <body><div class="nav">${esc(STORE_NAME[F.store] || '')}</div><div id="bzf-embed" style="max-width:640px;margin:20px auto"></div><div class="g"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>
  <script>window.BZF_STUDIO=1;window.BZF_ORIGIN=${JSON.stringify(location.origin)};window.BZF_STORE=${JSON.stringify(F.store)};<\/script><script src="${location.origin}/mk-forms-runtime.js?v=${Date.now()}"><\/script>
  <script>window.addEventListener('message',function(e){var d=e.data||{};if(!d.bzfRender)return;try{BuzzinFormsShow(d.form,d.opts)}catch(x){document.body.insertAdjacentHTML('beforeend','<pre>'+x.message+'</pre>')}});parent.postMessage({bzf:1,t:'ready'},'*');<\/script></body></html>`;
  $('fpv').srcdoc = html;
}
let drawT = null;
function draw() {
  clearTimeout(drawT);
  drawT = setTimeout(() => {
    const w = $('fpv') && $('fpv').contentWindow; if (!w || !frameReady) return;
    const pub = { id: F.id, shop_url: SHOP[F.store], steps: F.steps, style: F.style, targeting: F.targeting, teaser: F.teaser, sms_consent_text: F.sms_consent_text, email_consent_text: F.email_consent_text };
    const opts = SI === -1 ? { teaser: true } : MODE === 'edit' ? { edit: { step: SI, sel: SEL } } : {};
    w.postMessage({ bzfRender: 1, form: clone(pub), opts }, '*');
  }, 60);
}
function onFrame(e) {
  const d = e.data || {}; if (!d.bzf || e.source !== ($('fpv') && $('fpv').contentWindow)) return;
  if (d.t === 'ready') { frameReady = true; draw(); return; }
  if (d.t === 'sel') { SEL = d.i; TAB = 'content'; panel(); draw(); return; }
  if (d.t === 'move') { const bl = step().blocks; const [m] = bl.splice(d.from, 1); bl.splice(d.to, 0, m); SEL = d.to; panel(); mark(); }
}

/* ---------------- step tabs (Teaser · steps · Success) ---------------- */
function stepTabs() {
  const T = $('fsteps');
  T.innerHTML = `<button class="btn xs${SI === -1 ? ' pri' : ''}" data-st="-1"><i class="ti ti-tag"></i> Teaser</button>` +
    F.steps.map((s, i) => `<button class="btn xs${SI === i ? ' pri' : ''}" data-st="${i}">${s.kind === 'success' ? '<i class="ti ti-circle-check"></i> ' : ''}${esc(s.name || 'Step ' + (i + 1))}</button>`).join('') +
    `<button class="btn xs" id="fadd" aria-label="Add step"><i class="ti ti-plus"></i> Step</button>`;
  T.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => { SI = Number(b.dataset.st); SEL = null; stepTabs(); panel(); draw(); });
  $('fadd').onclick = () => {
    const succ = F.steps.findIndex((s) => s.kind === 'success'); const at = succ >= 0 ? succ : F.steps.length;
    F.steps.splice(at, 0, { id: 's' + Math.random().toString(36).slice(2, 7), name: 'Step ' + (at + 1), kind: 'step', image: { src: '', pos: 'none', width: 42 },
      blocks: [{ id: rid(), type: 'text', html: '<h1>New step</h1>', st: { pad: [0, 0, 10, 0], align: 'center' } }, { id: rid(), type: 'button', text: 'Continue', action: 'submit', st: { pad: [6, 0, 0, 0], align: 'center' } }] });
    SI = at; SEL = null; stepTabs(); panel(); mark();
  };
}

/* ---------------- left panel ---------------- */
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

function panel() {
  $('ftabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.t === TAB));
  const P = $('fpanel');
  if (TAB === 'content') return SI === -1 ? teaserPanel(P) : sel() ? blockPanel(P) : contentPanel(P);
  if (TAB === 'styles') return stylesPanel(P);
  if (TAB === 'behaviors') return behaviorsPanel(P);
  if (TAB === 'targeting') return targetingPanel(P);
  if (TAB === 'offer') return offerPanel(P);
}

/* Content: add blocks + step settings */
function contentPanel(P) {
  const s = step();
  P.innerHTML = `${H('Add blocks')}<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px">${BLOCKS.map(([k, l, ic]) => `<button class="btn xs" data-add="${k}" style="flex-direction:column;height:62px;gap:4px;font-size:11.5px"><i class="ti ti-${ic}" style="font-size:18px"></i>${esc(l)}</button>`).join('')}</div>
    <div style="font-size:11.5px;color:var(--muted);margin-top:6px">Click to add to this step. Click a block on the canvas to edit it; drag blocks on the canvas to reorder.</div>
    ${H('This step')}${grid(fl('Step name', txt('name', s.name)), fl('Step type', selp('kind', s.kind || 'step', [['step', 'Form step'], ['success', 'Success (end)']])))}
    ${fl('Image', `<div id="simg"></div>${txt('image.src', (s.image || {}).src, 'Image address')}`)}
    ${grid(fl('Image position', selp('image.pos', (s.image || {}).pos || 'none', [['none', 'No image'], ['left', 'Left'], ['right', 'Right'], ['top', 'Top']])), fl('Image width (%)', num('image.width', (s.image || {}).width || 42, { min: 20, max: 60 })))}
    ${s.kind !== 'success' ? chk('skip_if_sms', s.skip_if_sms, 'Skip this step for people who already get texts') : ''}
    ${s.kind !== 'success' ? fl('After this step, go to', `<select id="snext" style="width:100%"><option value="">The next step</option>${F.steps.filter((x) => x.id !== s.id).map((x) => `<option value="${x.id}"${s.next === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`) : ''}
    ${s.kind !== 'success' ? `<div style="margin-top:10px;font-weight:600">Go to a different step based on an answer</div>${(s.branches || []).map((b, i) => `<div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:4px;margin-top:4px"><input type="text" data-br="${i}" data-bk="field" value="${esc(b.field || '')}" placeholder="saved as"><input type="text" data-br="${i}" data-bk="equals" value="${esc(b.equals || '')}" placeholder="answer"><select data-br="${i}" data-bk="go">${F.steps.map((x) => `<option value="${x.id}"${b.go === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button class="btn xs" data-brm="${i}" aria-label="Remove rule">×</button></div>`).join('')}<button class="btn xs" id="badd" style="margin-top:6px"><i class="ti ti-plus"></i> Add rule</button>` : ''}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:16px"><button class="btn xs" id="sl"${SI > 0 ? '' : ' disabled'}><i class="ti ti-arrow-left"></i> Move</button><button class="btn xs" id="sr"${SI < F.steps.length - 1 ? '' : ' disabled'}>Move <i class="ti ti-arrow-right"></i></button><button class="btn xs" id="sdup"><i class="ti ti-copy"></i> Duplicate step</button><button class="btn xs danger" id="sdel"${F.steps.length > 1 ? '' : ' disabled'}><i class="ti ti-trash"></i> Delete step</button></div>
`;
  P.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => addBlock(b.dataset.add));
  bind(P, s, (x) => { if (x.dataset.p === 'name' || x.dataset.p === 'kind') stepTabs(); if (x.dataset.p === 'kind') panel(); });
  if (window.MK_imagePicker) window.MK_imagePicker($('simg'), (url) => { s.image = s.image || {}; s.image.src = location.origin + url; if (!s.image.pos || s.image.pos === 'none') s.image.pos = 'left'; panel(); mark(); });
  const sn = $('snext'); if (sn) sn.onchange = () => { s.next = sn.value || undefined; mark(); };
  P.querySelectorAll('[data-br]').forEach((x) => x.addEventListener(x.tagName === 'SELECT' ? 'change' : 'input', () => { s.branches[Number(x.dataset.br)][x.dataset.bk] = x.value; mark(); }));
  P.querySelectorAll('[data-brm]').forEach((x) => x.onclick = () => { s.branches.splice(Number(x.dataset.brm), 1); panel(); mark(); });
  const ba = $('badd'); if (ba) ba.onclick = () => { s.branches = s.branches || []; const k = (s.blocks || []).find((b) => b.key); s.branches.push({ field: k ? k.key : '', equals: '', go: (F.steps[SI + 1] || F.steps[0]).id }); panel(); mark(); };
  $('sl').onclick = () => { [F.steps[SI - 1], F.steps[SI]] = [F.steps[SI], F.steps[SI - 1]]; SI--; stepTabs(); panel(); mark(); };
  $('sr').onclick = () => { [F.steps[SI + 1], F.steps[SI]] = [F.steps[SI], F.steps[SI + 1]]; SI++; stepTabs(); panel(); mark(); };
  $('sdup').onclick = () => { const c = clone(s); c.id = 's' + Math.random().toString(36).slice(2, 7); c.name = s.name + ' copy'; c.blocks.forEach((b) => b.id = rid()); F.steps.splice(SI + 1, 0, c); SI++; stepTabs(); panel(); mark(); };
  $('sdel').onclick = () => { if ($('sdel').dataset.c !== '1') { $('sdel').dataset.c = '1'; $('sdel').textContent = 'Click again'; return; } F.steps.splice(SI, 1); SI = Math.max(0, SI - 1); SEL = null; stepTabs(); panel(); mark(); };
}
function addBlock(type) {
  const s = step(); s.blocks = s.blocks || [];
  const d = { text: { html: '<p>Your text here</p>' }, image: { src: '', alt: '', width: 100 }, button: { text: 'Continue', action: 'submit' }, email: { placeholder: 'Email address', label: 'Email', required: true, show_consent: true },
    phone: { placeholder: 'Phone number', label: 'Phone', required: true }, input: { label: 'First name', placeholder: 'First name', key: 'first_name' }, checkboxes: { label: 'Interested in', key: 'interests', options: ['Newborn', 'Toddler', 'Matching family'] },
    radio: { label: 'Are you…', key: 'baby_stage', options: ['Expecting', 'Parent of a little one', 'Shopping for a gift'], display: 'buttons' }, dropdown: { label: 'Size', key: 'child_size', options: ['NB', '0-3M', '3-6M', '6-12M', '12-18M', '18-24M', '2T', '3T', '4T', '5T'], placeholder: 'Choose a size' },
    date: { label: "Baby's due date or birthday", key: 'baby_date' }, coupon: { copy: true, copy_text: 'Copy' }, countdown: { mode: 'minutes', minutes: 15, expired_text: 'Offer ended' }, spacer: { height: 16 }, divider: { thickness: 1, color: '#E5E5E5', width: 100 }, html: { html: '' } }[type] || {};
  const at = SEL != null && SEL >= 0 ? SEL + 1 : s.blocks.length;
  s.blocks.splice(at, 0, { id: rid(), type, ...d, st: { pad: [4, 0, type === 'text' ? 10 : 4, 0], align: 'center' } });
  SEL = at; panel(); mark();
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
    case 'coupon': body = `<div class="note" style="margin-top:10px">Shows each person's own single-use code after they sign up. Set the discount on the Offer tab.</div>${chk('copy', b.copy !== false, 'Show a copy button')}${fl('Copy button text', txt('copy_text', b.copy_text || 'Copy'))}`; break;
    case 'countdown': body = `${fl('Count down', selp('mode', b.mode || 'minutes', [['minutes', 'Minutes after they first see the form'], ['date', 'To a date and time']]))}${b.mode === 'date' ? fl('Ends', `<input type="datetime-local" data-p="date" value="${esc(b.date || '')}" style="width:100%">`) : fl('Minutes', num('minutes', b.minutes || 15, { min: 1, max: 10080 }))}${fl('When it ends, show', txt('expired_text', b.expired_text || 'Offer ended'))}`; break;
    case 'spacer': body = fl('Height (px)', num('height', b.height || 16, { min: 0, max: 200 })); break;
    case 'divider': body = `${grid(fl('Thickness', num('thickness', b.thickness || 1, { min: 1, max: 10 })), fl('Width (%)', num('width', b.width || 100, { min: 10, max: 100 })))}${fl('Color', color('color', b.color || '#E5E5E5'))}`; break;
    case 'html': body = `${fl('HTML', area('html', b.html, 10), 'Scripts are removed. For layout and styling only.')}`; break;
  }
  P.innerHTML = `<div style="display:flex;align-items:center;gap:6px;margin:6px 0 2px"><button class="btn xs" id="bback"><i class="ti ti-arrow-left"></i> Blocks</button><b style="flex:1">${esc(BNAME[b.type] || b.type)}</b>
      <button class="btn xs" id="bup" aria-label="Move up"${SEL > 0 ? '' : ' disabled'}><i class="ti ti-arrow-up"></i></button><button class="btn xs" id="bdn" aria-label="Move down"${SEL < s.blocks.length - 1 ? '' : ' disabled'}><i class="ti ti-arrow-down"></i></button>
      <button class="btn xs" id="bdup" aria-label="Duplicate"><i class="ti ti-copy"></i></button><button class="btn xs danger" id="bdel" aria-label="Delete"><i class="ti ti-trash"></i></button></div>
    ${body}
    ${H('Block style')}${fl('Padding (px)', pad4('st.pad', (b.st || {}).pad))}${grid(fl('Alignment', selp('st.align', (b.st || {}).align || 'center', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']])), fl('Background', color('st.bg', (b.st || {}).bg || '')))}`;
  bind(P, b, (x) => { if (['action', 'look', 'mode', 'display'].includes(x.dataset.p)) panel(); });
  const fullSel = P.querySelector('[data-k="full"]'); if (fullSel) fullSel.onchange = () => { b.full = fullSel.value === '' ? undefined : fullSel.value === '1'; mark(); };
  $('bback').onclick = () => { SEL = null; panel(); draw(); };
  $('bup').onclick = () => { [s.blocks[SEL - 1], s.blocks[SEL]] = [s.blocks[SEL], s.blocks[SEL - 1]]; SEL--; panel(); mark(); };
  $('bdn').onclick = () => { [s.blocks[SEL + 1], s.blocks[SEL]] = [s.blocks[SEL], s.blocks[SEL + 1]]; SEL++; panel(); mark(); };
  $('bdup').onclick = () => { const c = clone(b); c.id = rid(); s.blocks.splice(SEL + 1, 0, c); SEL++; panel(); mark(); };
  $('bdel').onclick = () => { s.blocks.splice(SEL, 1); SEL = null; panel(); mark(); };
  const emc = $('emc'); if (emc) emc.oninput = () => { F.email_consent_text = emc.value; mark(); };
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
  bind(P, y, (x) => { if (x.dataset.p === 'type') { const p = { flyout: 'bottom-right', banner: 'top' }[y.type] || 'center'; y.position = p; panel(); } });
  if (window.MK_imagePicker) window.MK_imagePicker($('sbg'), (url) => { y.bg_image = location.origin + url; panel(); mark(); });
}

/* Behaviors: when it shows */
function behaviorsPanel(P) {
  const t = F.targeting;
  P.innerHTML = `${H('Display timing')}<div style="font-size:12px;color:var(--muted)">Shows at the first of these that happens.</div>
    ${chk('immediate', t.immediate, 'Show right away on page load')}
    ${fl('After this many seconds', num('delay_s', t.delay_s, { min: 0, max: 300, ph: 'off' }))}
    ${fl('After scrolling this far down the page (%)', num('scroll_pct', t.scroll_pct, { min: 0, max: 100, ph: 'off' }))}
    ${chk('exit_intent', t.exit_intent, 'When they move to leave the page (desktop)')}
    ${fl('Only after they have seen this many pages', num('page_views', t.page_views, { min: 1, max: 20, ph: 'off' }))}
    ${H('Frequency')}${fl('After someone closes it, show again after (days)', num('hide_days_after_close', t.hide_days_after_close == null ? 14 : t.hide_days_after_close, { min: 0, max: 365 }))}
    <div style="font-size:11.5px;color:var(--muted);margin-top:3px">After someone finishes the form, it never shows to them again.</div>
    ${H('Success step')}${fl('Close the success step automatically after (seconds)', num('success_close_s', t.success_close_s, { min: 1, max: 120, ph: 'stay open' }))}
    ${H('Teaser')}<button class="btn xs" id="gote" style="margin-top:6px"><i class="ti ti-tag"></i> Edit the teaser</button>`;
  bind(P, t);
  $('gote').onclick = () => { SI = -1; TAB = 'content'; stepTabs(); panel(); draw(); };
}

/* Targeting: who and where */
function targetingPanel(P) {
  const t = F.targeting;
  P.innerHTML = `${H('Visitors')}${fl('Device', selp('device', t.device || 'all', [['all', 'Desktop and mobile'], ['desktop', 'Desktop only'], ['mobile', 'Mobile only']]))}
    ${fl('Show to', selp('visitors', t.visitors || 'all', [['all', 'All visitors'], ['new', 'New visitors only'], ['returning', 'Returning visitors only']]))}
    ${chk('hide_subscribed', t.hide_subscribed !== false, "Don't show to people who already signed up")}
    ${fl('Only when the link has utm_source', txt('utm_source', t.utm_source, 'e.g. facebook'), 'For a form just for ad traffic.')}
    ${H('Pages')}${fl('Only on these pages', area('only_paths', t.only_paths, 2), 'One per line, like /collections/*. Empty = every page except cart and checkout.')}${fl('Never on these pages', area('hide_paths', t.hide_paths, 2))}
    ${H('Priority')}${fl('Priority', `<input type="number" id="tpr" value="${F.priority || 0}" style="width:100%">`, 'When two forms could show, the higher number wins. Only one popup shows at a time.')}`;
  bind(P, t);
  $('tpr').oninput = (e) => { F.priority = Number(e.target.value) || 0; mark(false); };
}

/* Offer: coupon + list */
function offerPanel(P) {
  const c = F.coupon || (F.coupon = {});
  P.innerHTML = `${H('Coupon')}${chk('enabled', c.enabled, 'Give each person their own single-use code')}
    ${grid(fl('Percent off', num('percent', c.percent || 10, { min: 1, max: 90 })), fl('Expires after (days)', num('expires_days', c.expires_days || 14, { min: 1, max: 365 })))}
    ${fl('Code starts with', txt('prefix', c.prefix || 'WELCOME'))}
    <div class="note" style="margin-top:10px">Real codes are created in Shopify only when this form is Live. In preview, people see a sample code and nothing is created. Show the code with a Coupon block on the success step.</div>
    ${H('List')}${fl('Add sign-ups to this list', `<select id="ol" style="width:100%">${(F.lists || []).map((l) => `<option value="${l.id}"${Number(F.list_id) === Number(l.id) ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`, 'Joining the list starts any flow triggered by it, like the welcome series.')}`;
  bind(P, c);
  $('ol').onchange = (e) => { F.list_id = Number(e.target.value); mark(false); };
}
})();
