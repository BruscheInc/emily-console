/* Buzzin Marketing · email templates, editor and brand kits (loaded by /marketing) */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const at = S.findIndex((x) => x.id === 'settings');
  S.splice(at, 0, { id: 'templates', icon: 'template', label: 'Email templates', render: renderTemplates }, { id: 'brand', icon: 'brush', label: 'Brand kits', render: renderBrand });
});

const BLOCKS = [
  ['logo', 'Logo', 'photo'], ['heading', 'Heading', 'typography'], ['text', 'Text', 'align-left'], ['image', 'Image', 'photo'], ['button', 'Button', 'click'],
  ['products', 'Products', 'shopping-bag'], ['dynamic_products', 'Their items', 'shopping-cart'], ['coupon', 'Coupon', 'discount'], ['countdown', 'Countdown', 'clock'],
  ['columns', 'Columns', 'columns'], ['divider', 'Divider', 'separator-horizontal'], ['spacer', 'Spacer', 'spacing-vertical'], ['social', 'Social', 'share'], ['footer', 'Footer', 'mail'], ['html', 'HTML', 'code'],
];
const BLOCK_NAME = Object.fromEntries(BLOCKS.map(([k, n]) => [k, n]));
const DEFAULT_PROPS = { heading: { text: 'Your heading', size: 28, align: 'center' }, text: { html: '<p>Your text</p>', align: 'left' }, image: { src: '', alt: '', width: 536 }, button: { label: 'Shop now', href: '', align: 'center' },
  products: { handles: [], count: 3, per_row: 3 }, dynamic_products: { source: 'cart', count: 3, per_row: 1 }, coupon: { label: 'Your code', note: '' }, countdown: { label: 'Ends in', until: '' },
  columns: { cols: [{ blocks: [{ type: 'text', props: { html: '<p>Left</p>' } }] }, { blocks: [{ type: 'text', props: { html: '<p>Right</p>' } }] }] }, divider: {}, spacer: { height: 24 }, html: { html: '<p>Custom HTML</p>' } };
const rid = () => Math.random().toString(16).slice(2, 12);

async function renderTemplates(el, id) {
  if (id) return editTemplate(el, id);
  const r = await api('/api/mk/templates?' + qs({ store: STORE }));
  el.innerHTML = `<h1>Email templates</h1><p class="sub">Every email flows and campaigns send is built here from blocks. Your Klaviyo templates came over as editable HTML.</p>
  <div class="bar"><select id="ts"${STORE ? '' : ' disabled'}><option value="">Start from…</option>${r.starters.map((s) => `<option value="${s.key}">${esc(s.name)}</option>`).join('')}</select>
    <button class="btn pri" id="tn"${STORE ? '' : ' disabled title="Pick a store first"'}><i class="ti ti-plus"></i> New email</button>
    <button class="btn" id="ti"><i class="ti ti-download"></i> Re-import from Klaviyo</button>${STORE ? '' : '<span style="color:var(--muted)">Pick a store at the top to create one.</span>'}</div>
  <div class="card" style="padding:6px"><div class="tw"><table><thead><tr><th>Name</th><th>Subject</th><th>Store</th><th>From</th><th>Updated</th></tr></thead><tbody>
  ${r.templates.map((t) => `<tr class="click" data-id="${t.id}"><td><b>${esc(t.name)}</b></td><td>${esc(t.subject || '—')}</td><td>${t.store === 'lbo' ? 'Outlet' : 'LB'}</td><td>${t.source === 'klaviyo' ? '<span class="pill blue">Klaviyo</span>' : '<span class="pill off">Buzzin</span>'}</td><td>${fmtD(t.updated_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No templates yet.</td></tr>'}
  </tbody></table></div></div>`;
  el.querySelectorAll('tr.click').forEach((tr) => tr.onclick = () => { location.hash = '#templates/' + tr.dataset.id; });
  $('tn').onclick = async () => { try { const t = await api('/api/mk/templates', { method: 'POST', body: JSON.stringify({ store: STORE, starter: $('ts').value || 'blank' }) }); location.hash = '#templates/' + t.id; } catch (e) { toast(e.message, 1); } };
  $('ti').onclick = async () => { try { const x = await api('/api/mk/templates/import-klaviyo', { method: 'POST', body: '{}' }); toast(`${x.imported} templates imported`); go(); } catch (e) { toast(e.message, 1); } };
}

let T = null, SEL = null, DEV = 'desk', DARK = false, dirty = false, prevTimer = null;
async function editTemplate(el, id) {
  T = await api('/api/mk/templates/' + id); SEL = null; dirty = false;
  T.blocks = (T.blocks || []).map((b) => ({ id: b.id || rid(), ...b, props: b.props || {} }));
  el.style.padding = '0';
  el.innerHTML = `<div style="display:flex;flex-direction:column;height:100%">
  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;background:#fff;border-bottom:1px solid var(--line)">
    <a href="#templates" class="btn xs"><i class="ti ti-arrow-left"></i></a>
    <input id="tname" type="text" value="${esc(T.name)}" aria-label="Template name" style="font-weight:700;min-width:200px">
    <span class="pill off">${T.store === 'lbo' ? 'Outlet' : 'Larkspur Baby'}</span><span class="sp"></span>
    <span class="pill hon hidden" id="dirty">Unsaved</span>
    <button class="btn" id="ttest"><i class="ti ti-send"></i> Send test</button><button class="btn" id="tcopy"><i class="ti ti-copy"></i> Duplicate</button><button class="btn pri" id="tsave">Save</button></div>
  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 16px;background:#fff;border-bottom:1px solid var(--line)">
    <label for="tsub" style="font-weight:700;color:var(--muted);font-size:12px">Subject</label><input id="tsub" type="text" value="${esc(T.subject || '')}" style="flex:2;min-width:220px">
    <button class="btn xs" id="aiSub"><i class="ti ti-sparkles"></i> Ask Emily</button>
    <label for="tpre" style="font-weight:700;color:var(--muted);font-size:12px">Preview text</label><input id="tpre" type="text" value="${esc(T.preview || '')}" style="flex:2;min-width:220px"></div>
  <div style="flex:1;display:flex;min-height:0">
    <div style="width:300px;flex:none;border-right:1px solid var(--line);background:#fff;overflow-y:auto;padding:14px" id="left"></div>
    <div style="width:290px;flex:none;border-right:1px solid var(--line);background:#FBFAF8;overflow-y:auto;padding:14px" id="outline"></div>
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:#ECEAE5">
      <div style="display:flex;gap:8px;align-items:center;padding:10px 14px"><div class="seg" id="dev"><button data-d="desk" class="on"><i class="ti ti-device-desktop"></i> Desktop</button><button data-d="mob"><i class="ti ti-device-mobile"></i> Phone</button></div>
        <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="dark"> Dark mode</label><span class="sp"></span><span style="color:var(--muted);font-size:12px" id="psub"></span></div>
      <div style="flex:1;overflow:auto;display:flex;justify-content:center;padding:0 14px 14px"><iframe id="pv" title="Email preview" style="border:0;background:#fff;border-radius:10px;width:680px;max-width:100%;height:100%;min-height:600px"></iframe></div>
    </div></div></div>`;
  const mark = () => { dirty = true; $('dirty').classList.remove('hidden'); schedulePreview(); };
  $('tname').oninput = mark; $('tsub').oninput = mark; $('tpre').oninput = mark;
  $('dev').querySelectorAll('button').forEach((b) => b.onclick = () => { DEV = b.dataset.d; $('dev').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); $('pv').style.width = DEV === 'mob' ? '390px' : '680px'; });
  $('dark').onchange = (e) => { DARK = e.target.checked; schedulePreview(); };
  $('tsave').onclick = saveT;
  $('tcopy').onclick = async () => { try { if (dirty) await saveT(); const n = await api('/api/mk/templates', { method: 'POST', body: JSON.stringify({ store: T.store, copy_of: T.id }) }); location.hash = '#templates/' + n.id; } catch (e) { toast(e.message, 1); } };
  $('ttest').onclick = async () => { const to = prompt('Send a test to (must be on the internal test list in Settings):'); if (!to) return; try { if (dirty) await saveT(); const r = await api(`/api/mk/templates/${T.id}/test`, { method: 'POST', body: JSON.stringify({ to }) }); toast(r.status === 'sent' ? 'Test sent' : `Not sent: ${r.reason}`, r.status !== 'sent'); } catch (e) { toast(e.message, 1); } };
  $('aiSub').onclick = () => aiPick('subject', `Email: ${T.name}. Current subject: ${$('tsub').value}`, (o) => { $('tsub').value = o.subject || ''; if (o.preview) $('tpre').value = o.preview; mark(); });
  window.__mkMark = mark;
  drawLeft(); drawOutline(); schedulePreview(0);
  window.onbeforeunload = () => dirty ? 'You have unsaved changes' : undefined;
}
async function saveT() {
  try { T = { ...T, ...(await api('/api/mk/templates/' + T.id, { method: 'PUT', body: JSON.stringify({ name: $('tname').value, subject: $('tsub').value, preview: $('tpre').value, blocks: T.blocks }) })) }; dirty = false; $('dirty').classList.add('hidden'); toast('Saved'); }
  catch (e) { toast(e.message, 1); }
}
function schedulePreview(ms = 400) { clearTimeout(prevTimer); prevTimer = setTimeout(preview, ms); }
async function preview() {
  try { const r = await api('/api/mk/templates/render', { method: 'POST', body: JSON.stringify({ store: T.store, subject: $('tsub').value, preview: $('tpre').value, blocks: T.blocks }) });
    let html = r.html; if (DARK) html = html.replace('</head>', '<style>:root{color-scheme:dark}body,table{background:#121116!important}.panel{background:#1E1D24!important}.panel *{color:#EDEBF2!important}</style></head>');
    $('pv').srcdoc = html; $('psub').textContent = r.subject ? 'Subject: ' + r.subject : ''; } catch (e) { $('psub').textContent = e.message; }
}
function drawOutline() {
  $('outline').innerHTML = `<div style="font-weight:800;margin-bottom:8px">Layout</div>` + T.blocks.map((b, i) => `<div class="blk" data-i="${i}" style="display:flex;align-items:center;gap:6px;padding:8px 10px;margin-bottom:6px;border-radius:9px;border:1px solid ${SEL === i ? 'var(--ink)' : 'var(--line)'};background:#fff;cursor:pointer">
    <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>${esc(BLOCK_NAME[b.type] || b.type)}</b> <span style="color:var(--muted)">${esc(summary(b))}</span>${b.show_if ? ' <span class="pill blue">conditional</span>' : ''}</span>
    <button class="btn xs" data-up="${i}" aria-label="Move up"${i ? '' : ' disabled'}>↑</button><button class="btn xs" data-dn="${i}" aria-label="Move down"${i < T.blocks.length - 1 ? '' : ' disabled'}>↓</button></div>`).join('') + (T.blocks.length ? '' : '<div class="empty">Add blocks from the left.</div>');
  $('outline').querySelectorAll('.blk').forEach((d) => d.onclick = (e) => { if (e.target.closest('button')) return; SEL = Number(d.dataset.i); drawOutline(); drawLeft(); });
  $('outline').querySelectorAll('[data-up]').forEach((b) => b.onclick = () => move(Number(b.dataset.up), -1));
  $('outline').querySelectorAll('[data-dn]').forEach((b) => b.onclick = () => move(Number(b.dataset.dn), 1));
}
function summary(b) { const p = b.props || {}; return (p.text || (p.html || '').replace(/<[^>]+>/g, ' ') || p.label || p.src || (p.handles || []).join(', ') || '').trim().slice(0, 40); }
function move(i, d) { const j = i + d; if (j < 0 || j >= T.blocks.length) return; [T.blocks[i], T.blocks[j]] = [T.blocks[j], T.blocks[i]]; SEL = j; drawOutline(); drawLeft(); window.__mkMark(); }
function drawLeft() {
  const b = SEL != null ? T.blocks[SEL] : null;
  const palette = `<div style="font-weight:800;margin-bottom:8px">Add a block</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${BLOCKS.map(([k, n, ic]) => `<button class="btn xs" data-add="${k}" style="justify-content:flex-start"><i class="ti ti-${ic}"></i> ${esc(n)}</button>`).join('')}</div>
    <div style="font-size:12px;color:var(--muted);margin-top:8px">Adds below the selected block.</div>`;
  $('left').innerHTML = (b ? blockEditor(b) + '<hr style="border:0;border-top:1px solid var(--line);margin:16px 0">' : '') + palette;
  $('left').querySelectorAll('[data-add]').forEach((x) => x.onclick = () => { const nb = { id: rid(), type: x.dataset.add, props: JSON.parse(JSON.stringify(DEFAULT_PROPS[x.dataset.add] || {})) }; const at = SEL == null ? T.blocks.length : SEL + 1; T.blocks.splice(at, 0, nb); SEL = at; drawOutline(); drawLeft(); window.__mkMark(); });
  if (b) wireEditor(b);
}
const f = (label, inner, hint) => `<label class="lab">${esc(label)}</label>${inner}${hint ? `<div style="font-size:11.5px;color:var(--muted);margin-top:3px">${esc(hint)}</div>` : ''}`;
const inp = (k, v, type = 'text', extra = '') => `<input type="${type}" data-p="${k}" value="${esc(v == null ? '' : v)}" style="width:100%" ${extra}>`;
const sel = (k, v, opts) => `<select data-p="${k}" style="width:100%">${opts.map(([a, l]) => `<option value="${a}"${String(v) === String(a) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
function blockEditor(b) {
  const p = b.props || {};
  let body = '';
  switch (b.type) {
    case 'heading': body = f('Text', inp('text', p.text), 'Use {{ first_name | default: "friend" }} for their name.') + `<div class="g2" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${f('Size', inp('size', p.size || 28, 'number', 'min="14" max="56"'))}${f('Align', sel('align', p.align || 'center', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']]))}</div>`; break;
    case 'text': body = f('Text') + `<div style="display:flex;gap:4px;margin-bottom:4px"><button class="btn xs" data-cmd="bold"><i class="ti ti-bold"></i></button><button class="btn xs" data-cmd="italic"><i class="ti ti-italic"></i></button><button class="btn xs" data-cmd="link"><i class="ti ti-link"></i></button><button class="btn xs" data-ins="{{ first_name | default: &quot;friend&quot; }}">First name</button></div>
      <div id="rich" contenteditable="true" style="min-height:140px;border:1px solid var(--line);border-radius:9px;padding:10px;background:#fff">${p.html || ''}</div>` + f('Align', sel('align', p.align || 'left', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']])) + `<button class="btn xs" id="aiBody" style="margin-top:10px"><i class="ti ti-sparkles"></i> Ask Emily to write this</button>`; break;
    case 'image': body = `<div id="imgpick"></div>` + f('Image address', inp('src', p.src)) + f('Description (alt text)', inp('alt', p.alt), 'Read aloud by screen readers and shown if images are blocked.') + f('Link', inp('href', p.href)) + f('Width (px)', inp('width', p.width || 536, 'number', 'min="60" max="600"')); break;
    case 'button': body = f('Label', inp('label', p.label)) + f('Link', inp('href', p.href), 'Leave empty for the store home page.') + f('Align', sel('align', p.align || 'center', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']])); break;
    case 'products': body = f('Products (handles, comma-separated)', inp('handles', (p.handles || []).join(', ')), 'Leave empty to show in-stock best sellers.') + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${f('How many', inp('count', p.count || 3, 'number', 'min="1" max="9"'))}${f('Per row', sel('per_row', p.per_row || 3, [[1, '1'], [2, '2'], [3, '3']]))}</div>`; break;
    case 'dynamic_products': body = f('Show', sel('source', p.source || 'cart', [['cart', 'What they left in the cart'], ['viewed', 'What they viewed'], ['bought', 'What they bought'], ['recommended', 'Recommendations']])) + `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${f('How many', inp('count', p.count || 3, 'number', 'min="1" max="9"'))}${f('Per row', sel('per_row', p.per_row || 1, [[1, '1'], [2, '2'], [3, '3']]))}</div>`; break;
    case 'coupon': body = f('Label', inp('label', p.label)) + f('Code', inp('code', p.code || '{{ coupon }}'), '{{ coupon }} is their personal code from the form or flow.') + f('Note', inp('note', p.note)); break;
    case 'countdown': body = f('Ends', inp('until', p.until, 'datetime-local')) + f('Text before the days', inp('label', p.label || 'Ends in')) + f('On the last day', inp('last_day', p.last_day || 'Last day!')); break;
    case 'spacer': body = f('Height (px)', inp('height', p.height || 24, 'number', 'min="4" max="120"')); break;
    case 'divider': body = f('Color', inp('color', p.color || '#E7E5E0', 'color')); break;
    case 'columns': body = (p.cols || []).map((c, i) => f(`Column ${i + 1}`, `<textarea data-col="${i}" rows="4" style="width:100%">${esc(((c.blocks || [])[0] || { props: {} }).props.html || '')}</textarea>`)).join('') + `<div style="display:flex;gap:6px;margin-top:6px"><button class="btn xs" id="colAdd"${(p.cols || []).length >= 3 ? ' disabled' : ''}>Add column</button><button class="btn xs" id="colDel"${(p.cols || []).length <= 2 ? ' disabled' : ''}>Remove column</button></div>`; break;
    case 'html': body = f('HTML', `<textarea data-p="html" rows="14" style="width:100%;font-family:ui-monospace,Menlo,monospace;font-size:11.5px">${esc(p.html || '')}</textarea>`, 'Imported from Klaviyo. {{ unsubscribe_url }} and {{ first_name }} still work.'); break;
    case 'logo': body = f('Width (px)', inp('width', p.width || '', 'number', 'min="24" max="300" placeholder="Brand kit default"')) + '<div class="note" style="margin-top:8px">The logo comes from the brand kit.</div>'; break;
    case 'social': case 'footer': body = '<div class="note">This block uses the brand kit (links, address, unsubscribe). Edit it in Brand kits.</div>'; break;
  }
  const si = b.show_if || null;
  const cond = `<details style="margin-top:12px"${si ? ' open' : ''}><summary style="cursor:pointer;font-weight:700">Show only to…</summary>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:6px">
      <select id="ciF"><option value="">Everyone</option><option value="orders_count"${si && si.field === 'orders_count' ? ' selected' : ''}>Orders count</option><option value="total_spent"${si && si.field === 'total_spent' ? ' selected' : ''}>Total spent</option><option value="last_sizes"${si && si.field === 'last_sizes' ? ' selected' : ''}>Sizes last bought</option><option value="SignUp"${si && si.field === 'SignUp' ? ' selected' : ''}>SignUp</option></select>
      <select id="ciO">${[['gt', 'more than'], ['lt', 'less than'], ['eq', 'is'], ['ne', 'is not'], ['contains', 'includes'], ['set', 'is set']].map(([a, l]) => `<option value="${a}"${si && si.op === a ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <input id="ciV" type="text" value="${esc(si ? si.value : '')}"></div></details>`;
  return `<div style="display:flex;align-items:center;gap:8px"><b style="font-size:15px">${esc(BLOCK_NAME[b.type] || b.type)}</b><span class="sp"></span><button class="btn xs" id="bDup" title="Duplicate"><i class="ti ti-copy"></i></button><button class="btn xs" id="bSave" title="Save as reusable block"><i class="ti ti-box-multiple"></i></button><button class="btn xs danger" id="bDel" title="Delete"><i class="ti ti-trash"></i></button></div>${body}${cond}`;
}
function wireEditor(b) {
  const L = $('left'), mark = window.__mkMark;
  L.querySelectorAll('[data-p]').forEach((x) => x.oninput = () => { let v = x.value; if (x.type === 'number') v = Number(v); if (x.dataset.p === 'handles') v = v.split(',').map((s) => s.trim()).filter(Boolean); b.props[x.dataset.p] = v; drawOutlineLite(); mark(); });
  const rich = $('rich'); if (rich) { rich.oninput = () => { b.props.html = rich.innerHTML; mark(); };
    L.querySelectorAll('[data-cmd]').forEach((x) => x.onclick = () => { rich.focus(); if (x.dataset.cmd === 'link') { const u = prompt('Link address'); if (u) document.execCommand('createLink', false, u); } else document.execCommand(x.dataset.cmd); b.props.html = rich.innerHTML; mark(); });
    L.querySelectorAll('[data-ins]').forEach((x) => x.onclick = () => { rich.focus(); document.execCommand('insertText', false, x.dataset.ins); b.props.html = rich.innerHTML; mark(); });
    const ai = $('aiBody'); if (ai) ai.onclick = () => aiPick('body', `Email "${$('tname').value}", subject "${$('tsub').value}". Write this section.`, (o) => { rich.innerHTML = o.html || ''; b.props.html = rich.innerHTML; mark(); }, rich.innerText); }
  L.querySelectorAll('[data-col]').forEach((x) => x.oninput = () => { b.props.cols[Number(x.dataset.col)] = { blocks: [{ type: 'text', props: { html: x.value } }] }; mark(); });
  const ca = $('colAdd'); if (ca) ca.onclick = () => { b.props.cols.push({ blocks: [{ type: 'text', props: { html: '<p>New column</p>' } }] }); drawLeft(); mark(); };
  const cd = $('colDel'); if (cd) cd.onclick = () => { b.props.cols.pop(); drawLeft(); mark(); };
  const ip = $('imgpick'); if (ip) imagePicker(ip, (url) => { b.props.src = url; drawLeft(); mark(); });
  const cond = () => { const fld = $('ciF').value; if (!fld) delete b.show_if; else b.show_if = { field: fld, op: $('ciO').value, value: $('ciV').value }; drawOutlineLite(); mark(); };
  ['ciF', 'ciO', 'ciV'].forEach((k) => { const x = $(k); if (x) x.oninput = cond; });
  $('bDel').onclick = () => { T.blocks.splice(SEL, 1); SEL = null; drawOutline(); drawLeft(); mark(); };
  $('bDup').onclick = () => { const c = JSON.parse(JSON.stringify(b)); c.id = rid(); T.blocks.splice(SEL + 1, 0, c); SEL++; drawOutline(); drawLeft(); mark(); };
  $('bSave').onclick = async () => { const name = prompt('Name this reusable block'); if (!name) return; try { await api('/api/mk/saved-blocks', { method: 'POST', body: JSON.stringify({ store: T.store, name, block: b }) }); toast('Saved as a reusable block'); } catch (e) { toast(e.message, 1); } };
}
function drawOutlineLite() { const d = $('outline').querySelector(`.blk[data-i="${SEL}"] span`); if (d && T.blocks[SEL]) { const b = T.blocks[SEL]; d.innerHTML = `<b>${esc(BLOCK_NAME[b.type] || b.type)}</b> <span style="color:var(--muted)">${esc(summary(b))}</span>${b.show_if ? ' <span class="pill blue">conditional</span>' : ''}`; } }
async function imagePicker(host, onPick) {
  host.innerHTML = `<label class="btn xs" style="margin-top:4px"><i class="ti ti-upload"></i> Upload<input type="file" accept="image/*" hidden id="imgUp"></label> <button class="btn xs" id="imgLib"><i class="ti ti-photo"></i> Library</button><div id="imgGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px"></div>`;
  $('imgUp').onchange = async (e) => { const file = e.target.files[0]; if (!file) return; try { const r = await fetch(`/api/mk/images?store=${STORE || ''}&name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type, Authorization: 'Bearer ' + KEY }, body: file }); const j = await r.json(); if (!r.ok) throw new Error(j.error); onPick(j.url); } catch (err) { toast(err.message, 1); } };
  $('imgLib').onclick = async () => { const { images } = await api('/api/mk/images?' + qs({ store: STORE })); $('imgGrid').innerHTML = images.map((i) => `<button class="btn xs" data-u="${esc(i.url)}" style="padding:2px;height:56px"><img src="${esc(i.url)}" alt="${esc(i.name)}" style="max-width:100%;max-height:50px"></button>`).join('') || '<span style="color:var(--muted)">No images yet</span>'; $('imgGrid').querySelectorAll('[data-u]').forEach((b) => b.onclick = () => onPick(b.dataset.u)); };
}
async function aiPick(kind, brief, use, current) {
  const box = document.createElement('div'); box.className = 'drawer'; box.innerHTML = `<div class="hd"><b>Emily's options</b><span class="sp"></span><button class="btn xs" id="aix" aria-label="Close"><i class="ti ti-x"></i></button></div><div class="bd"><label class="lab" for="aib">What should it say?</label><textarea id="aib" rows="4" style="width:100%">${esc(brief)}</textarea><button class="btn pri" id="aig" style="margin-top:8px"><i class="ti ti-sparkles"></i> Write options</button><div id="aio" style="margin-top:14px"></div></div>`;
  document.body.appendChild(box); $('aix').onclick = () => box.remove();
  $('aig').onclick = async () => { $('aio').innerHTML = '<div class="empty">Writing…</div>'; try { const r = await api('/api/mk/ai/copy', { method: 'POST', body: JSON.stringify({ store: (T && T.store) || STORE || 'lb', kind, brief: $('aib').value, current }) });
    $('aio').innerHTML = (r.options || []).map((o, i) => `<div class="card" style="margin-bottom:8px">${o.subject ? `<b>${esc(o.subject)}</b><div style="color:var(--muted)">${esc(o.preview || '')}</div>` : o.html ? o.html : esc(o.body || o.headline || o.text || '')}<div style="margin-top:8px"><button class="btn xs" data-use="${i}">Use this</button></div></div>`).join('');
    $('aio').querySelectorAll('[data-use]').forEach((b) => b.onclick = () => { use(r.options[Number(b.dataset.use)]); box.remove(); }); } catch (e) { $('aio').innerHTML = `<div class="note">${esc(e.message)}</div>`; } };
}

/* ---------- Brand kits ---------- */
async function renderBrand(el) {
  const st = STORE || 'lb';
  const b = await api('/api/mk/brand/' + st);
  const col = (k, l) => `<div><label class="lab">${l}</label><div style="display:flex;gap:6px;align-items:center"><input type="color" data-c="${k}" value="${esc(b.colors[k])}" style="width:42px;height:34px;border:1px solid var(--line);border-radius:8px;padding:2px"><input type="text" data-ct="${k}" value="${esc(b.colors[k])}" style="width:100px;font-family:ui-monospace,Menlo,monospace;font-size:12px"></div></div>`;
  const FONTS = [["Georgia, 'Times New Roman', serif", 'Georgia (serif)'], ["'Playfair Display', Georgia, serif", 'Playfair Display → Georgia'], ['Helvetica, Arial, sans-serif', 'Helvetica (sans)'], ["'Figtree', Helvetica, Arial, sans-serif", 'Figtree → Helvetica'], ["'Montserrat', Helvetica, Arial, sans-serif", 'Montserrat → Helvetica'], ["Verdana, Geneva, sans-serif", 'Verdana']];
  el.innerHTML = `<h1>Brand kit · ${esc(STORE_NAME[st])}</h1><p class="sub">${STORE ? '' : 'Showing Larkspur Baby — pick a store at the top to switch. '}Every template on this store uses these. Fonts always have a safe fallback, since many inboxes can't load custom fonts.</p>
  <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">
  <div class="card" style="flex:1 1 420px;min-width:0">
    <b>Identity</b>
    <label class="lab">Brand name</label><input type="text" id="bn" value="${esc(b.name)}" style="width:100%">
    <label class="lab">Logo</label><div style="display:flex;gap:10px;align-items:center"><img id="bl" src="${esc(b.logo)}" alt="" style="height:48px;max-width:160px;object-fit:contain;border:1px solid var(--line);border-radius:8px;padding:4px;background:#fff"><div id="blp"></div></div>
    <label class="lab">Logo width in emails (px)</label><input type="number" id="blw" value="${b.logo_width}" min="24" max="300" style="width:120px">
    <label class="lab">Store address (required by law in marketing email)</label><input type="text" id="ba" value="${esc(b.address)}" placeholder="Street, city, state ZIP" style="width:100%">
    <label class="lab">Store link</label><input type="text" id="bs" value="${esc(b.shop_url)}" style="width:100%">
    <b style="display:block;margin-top:18px">Colors</b><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px 12px">${col('primary', 'Main')}${col('text', 'Text')}${col('muted', 'Quiet text')}${col('link', 'Links')}${col('ground', 'Background')}${col('panel', 'Email body')}${col('button_text', 'Button text')}</div>
    <b style="display:block;margin-top:18px">Fonts and buttons</b>
    <label class="lab">Headings</label><select id="fh" style="width:100%">${FONTS.map(([v, l]) => `<option value="${esc(v)}"${b.fonts.heading === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <label class="lab">Body</label><select id="fb" style="width:100%">${FONTS.map(([v, l]) => `<option value="${esc(v)}"${b.fonts.body === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <label class="lab">Button shape</label><select id="br" style="width:100%"><option value="999"${b.button.radius >= 99 ? ' selected' : ''}>Pill</option><option value="8"${b.button.radius > 0 && b.button.radius < 99 ? ' selected' : ''}>Rounded</option><option value="0"${b.button.radius === 0 ? ' selected' : ''}>Square</option></select>
    <b style="display:block;margin-top:18px">Sender</b>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px"><div><label class="lab">From name</label><input type="text" id="sn" value="${esc(b.sender.from_name)}" style="width:100%"></div><div><label class="lab">Reply-to (goes to the Buzzin inbox)</label><input type="email" id="sr" value="${esc(b.sender.reply_to)}" style="width:100%"></div>
    <div><label class="lab">From address</label><div style="display:flex;align-items:center;gap:4px"><input type="text" id="sl" value="${esc(b.sender.from_local)}" style="width:110px">@<input type="text" id="sd" value="${esc(b.sender.domain)}" style="flex:1;min-width:0"></div></div></div>
    <div class="note" style="margin-top:8px">The sending domain (${esc(b.sender.domain)}) is set up when the email sender is approved. Using a subdomain keeps customer-service mail safe if a campaign gets complaints.</div>
    <b style="display:block;margin-top:18px">Social links</b><div style="display:grid;grid-template-columns:1fr 1fr;gap:0 12px">${['instagram', 'facebook', 'tiktok', 'pinterest'].map((k) => `<div><label class="lab">${k[0].toUpperCase() + k.slice(1)}</label><input type="text" data-s="${k}" value="${esc(b.social[k] || '')}" style="width:100%"></div>`).join('')}</div>
    <div style="margin-top:16px"><button class="btn pri" id="bsave">Save brand kit</button></div>
  </div>
  <div class="card" style="flex:1 1 380px;min-width:0;padding:0;overflow:hidden"><div style="padding:10px 14px;font-weight:700">Preview</div><iframe id="bpv" title="Brand preview" style="border:0;width:100%;height:760px;background:#fff"></iframe></div></div>`;
  const read = () => ({ name: $('bn').value, logo: $('bl').getAttribute('src'), logo_width: Number($('blw').value) || 64, address: $('ba').value, shop_url: $('bs').value,
    colors: Object.fromEntries([...el.querySelectorAll('[data-ct]')].map((x) => [x.dataset.ct, x.value])), fonts: { heading: $('fh').value, body: $('fb').value }, button: { radius: Number($('br').value), padding: '14px 28px' },
    sender: { from_name: $('sn').value, reply_to: $('sr').value, from_local: $('sl').value, domain: $('sd').value }, social: Object.fromEntries([...el.querySelectorAll('[data-s]')].map((x) => [x.dataset.s, x.value])) });
  let pt; const pv = () => { clearTimeout(pt); pt = setTimeout(async () => { try { const k = read(); const r = await api('/api/mk/templates/render', { method: 'POST', body: JSON.stringify({ store: st, subject: 'Preview', blocks: [{ type: 'logo' }, { type: 'heading', props: { text: 'Welcome to the family, {{ first_name }}' } }, { type: 'text', props: { html: '<p>This is how your emails look. <a href="#">Links</a> use your link color.</p>', align: 'center' } }, { type: 'coupon', props: { label: 'Your welcome gift', code: 'WELCOME10', note: '10% off your first order' } }, { type: 'button', props: { label: 'Shop now' } }, { type: 'social' }, { type: 'footer' }] }) });
      // Preview uses the saved kit on the server; overlay unsaved colors/fonts so changes show immediately.
      let h = r.html; const s = await api('/api/mk/brand/' + st); for (const [kk, vv] of Object.entries(s.colors)) if (k.colors[kk] && k.colors[kk] !== vv) h = h.split(vv).join(k.colors[kk]); if (k.fonts.heading !== s.fonts.heading) h = h.split(s.fonts.heading).join(k.fonts.heading); if (k.fonts.body !== s.fonts.body) h = h.split(s.fonts.body).join(k.fonts.body);
      $('bpv').srcdoc = h; } catch (e) {} }, 300); };
  el.querySelectorAll('[data-c]').forEach((x) => x.oninput = () => { el.querySelector(`[data-ct="${x.dataset.c}"]`).value = x.value; pv(); });
  el.querySelectorAll('[data-ct]').forEach((x) => x.oninput = () => { if (/^#[0-9a-f]{6}$/i.test(x.value)) el.querySelector(`[data-c="${x.dataset.ct}"]`).value = x.value; pv(); });
  ['fh', 'fb', 'br', 'bn', 'ba'].forEach((k) => $(k).oninput = pv);
  imagePicker($('blp'), (url) => { $('bl').setAttribute('src', url); });
  $('bsave').onclick = async () => { try { await api('/api/mk/brand/' + st, { method: 'PUT', body: JSON.stringify(read()) }); toast('Brand kit saved'); pv(); } catch (e) { toast(e.message, 1); } };
  pv();
}
window.MK_imagePicker = imagePicker; window.MK_aiPick = aiPick;
})();
