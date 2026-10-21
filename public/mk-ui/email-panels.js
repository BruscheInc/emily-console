/* Buzzin Marketing · the email editor's left panel: Add content, Email styles, and each block's / section's Styles + Display. */
(() => {
const E = () => window.MKE;
const D = window.MKDoc;
const I = (n) => `<i class="ti ti-${n}"></i>`;

/* ---------- a tiny form binder: helpers return HTML and remember what each control edits ---------- */
let B = [];
const FOUR = new WeakMap();   // padding controls switched to four sides
const bind = (o) => { B.push(o); return B.length - 1; };
const isBlank = (v) => v === '' || v == null;
function setVal(obj, key, v) { if (isBlank(v)) delete obj[key]; else obj[key] = v; }
const F = {
  row: (label, ctrl, help) => `<div class="kp-row"><span class="l">${label}${help ? ` <span title="${esc(help)}" style="color:var(--muted);cursor:help">ⓘ</span>` : ''}</span><span class="c">${ctrl}</span></div>`,
  lab: (label, ctrl, hint) => `<label class="kp-lab">${label}</label>${ctrl}${hint ? `<div class="kp-hint">${hint}</div>` : ''}`,
  text: (obj, key, o = {}) => `<input class="kp-in" data-f="${bind({ obj, key, t: 'text', ...o })}" value="${esc(obj[key] == null ? '' : obj[key])}" placeholder="${esc(o.ph || '')}">`,
  area: (obj, key, o = {}) => `<textarea class="kp-in${o.mono ? ' mono' : ''}" rows="${o.rows || 4}" data-f="${bind({ obj, key, t: 'text', ...o })}" placeholder="${esc(o.ph || '')}">${esc(obj[key] == null ? '' : obj[key])}</textarea>`,
  num: (obj, key, o = {}) => `<span class="kp-num" style="${o.w ? `width:${o.w}px` : ''}">${o.pre ? `<span class="pre">${o.pre}</span>` : ''}<input type="number" data-f="${bind({ obj, key, t: 'num', ...o })}" value="${esc(obj[key] == null ? '' : obj[key])}" placeholder="${esc(o.ph == null ? '' : o.ph)}" ${o.min != null ? `min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''} step="${o.step || 1}"${o.disabled ? ' disabled' : ''}>${o.unit === '' ? '' : `<span class="u">${o.unit || 'px'}</span>`}</span>`,
  sel: (obj, key, opts, o = {}) => `<select class="kp-in" style="${o.w ? `width:${o.w}px` : ''}" data-f="${bind({ obj, key, t: o.num ? 'num' : 'text', ...o })}">${o.ph != null ? `<option value="">${esc(o.ph)}</option>` : ''}${opts.map(([v, l]) => `<option value="${esc(v)}"${String(obj[key] == null ? (o.def ?? '') : obj[key]) === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`,
  tog: (obj, key, o = {}) => `<label class="kp-tog"><input type="checkbox" data-f="${bind({ obj, key, t: 'bool', ...o })}"${(o.is ? o.is(obj[key]) : obj[key] == null ? !!o.def : !!obj[key]) ? ' checked' : ''}><span></span></label>`,
  seg: (obj, key, opts, o = {}) => `<div class="kp-seg" data-f="${bind({ obj, key, t: 'seg', ...o })}">${opts.map(([v, l, tip]) => `<button type="button" data-v="${esc(v)}" class="${String(obj[key] == null ? (o.def ?? '') : obj[key]) === String(v) ? 'on' : ''}" title="${esc(tip || v)}">${l}</button>`).join('')}</div>`,
  color: (obj, key, o = {}) => {
    const v = obj[key] || ''; const hex = /^#[0-9a-f]{6}$/i.test(v) ? v : '#ffffff';
    const sw = swatches();
    return `<div class="kp-col" data-f="${bind({ obj, key, t: 'color', ...o })}"><span class="kp-sw"><i style="background:${esc(v || 'transparent')}"></i><input type="color" value="${hex}"></span><input class="kp-in" style="font-family:ui-monospace,Menlo,monospace;font-size:12px" value="${esc(v)}" placeholder="${esc(o.ph || 'Default')}"><button type="button" class="kp-ic" data-clr title="Remove">${I('x')}</button></div>${o.noSw ? '' : `<div class="kp-swatches">${sw.map((c) => `<button type="button" style="background:${c}" data-sw="${c}" data-for="${B.length - 1}" title="${c}"></button>`).join('')}</div>`}`;
  },
  /** Klaviyo-style optional property: a "+" until it's set. */
  opt: (title, has, onAdd, body) => `<div class="kp-sec"><h4>${title}${has ? `<button type="button" class="kp-plus" data-rm="${bind({ t: 'act', fn: onAdd.remove })}" title="Remove">${I('minus')}</button>` : `<button type="button" class="kp-plus" data-add="${bind({ t: 'act', fn: onAdd.add })}" title="Add">${I('plus')}</button>`}</h4>${has ? body() : ''}</div>`,
  /** Padding: vertical / horizontal, or all four sides. */
  pad: (obj, prefix, o = {}) => {
    const k = (s) => `${prefix}_${s}`; const v = (x) => (obj[k(x)] == null ? null : Number(obj[k(x)])); const four = (FOUR.get(obj) || new Set()).has(prefix) || v('top') !== v('bottom') || v('left') !== v('right');
    const ph = o.ph || {};
    if (!four) return `<div class="kp-2"><span class="kp-num" title="Top and bottom"><span class="pre">↕</span><input type="number" min="0" max="200" data-f="${bind({ t: 'padv', obj, prefix })}" value="${esc(obj[k('top')] ?? '')}" placeholder="${esc(ph.t ?? '')}"><span class="u">px</span></span><span class="kp-num" title="Left and right"><span class="pre">↔</span><input type="number" min="0" max="200" data-f="${bind({ t: 'padh', obj, prefix })}" value="${esc(obj[k('left')] ?? '')}" placeholder="${esc(ph.l ?? '')}"><span class="u">px</span></span><button type="button" class="kp-ic" data-f="${bind({ t: 'act', fn: () => { if (!FOUR.has(obj)) FOUR.set(obj, new Set()); FOUR.get(obj).add(prefix); E().drawPanel(); } })}" title="Set each side">${I('border-sides')}</button></div>`;
    return `<div class="kp-4">${['top', 'right', 'bottom', 'left'].map((s) => `<span class="kp-num"><span class="pre">${{ top: 'T', right: 'R', bottom: 'B', left: 'L' }[s]}</span><input type="number" min="0" max="200" data-f="${bind({ t: 'num', obj, key: k(s) })}" value="${esc(obj[k(s)] ?? '')}" placeholder="${esc(ph[s[0]] ?? '')}"><span class="u">px</span></span>`).join('')}</div>`;
  },
  border: (obj, prefix = '', o = {}) => `<div class="kp-4">${F.sel(obj, prefix + 'border_style', [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double'], ['none', 'None']], { def: 'solid' })}${F.num(obj, prefix + 'border_width', { min: 0, max: 20, ph: 1 })}</div><div style="margin-top:8px">${F.color(obj, prefix + 'border_color', { ph: '#DDDDDD', noSw: true })}</div>`,
  font: (obj, key) => `<select class="kp-in" data-f="${bind({ obj, key, t: 'text' })}"><option value="">Default</option>${window.MKE_fontList().map(([l, v]) => `<option value="${esc(v)}"${obj[key] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}${obj[key] && !window.MKE_fontList().some(([, v]) => v === obj[key]) ? `<option value="${esc(obj[key])}" selected>${esc(obj[key])}</option>` : ''}</select>`,
  weight: (obj, key) => F.sel(obj, key, [['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Extra bold'], ['300', 'Light']], { ph: 'Default' }),
  align: (obj, key, def = 'center') => F.seg(obj, key, [['left', I('align-left'), 'Left'], ['center', I('align-center'), 'Center'], ['right', I('align-right'), 'Right']], { def }),
  btn: (label, fn, cls = '') => `<button type="button" class="btn xs ${cls}" data-f="${bind({ t: 'act', fn })}">${label}</button>`,
};
function swatches() { const b = (E().ST || {}).brand || {}; const c = b.colors || {}; return [...new Set([c.primary, c.text, c.muted, c.ground, c.panel, c.link, '#FFFFFF', '#000000', '#F5F5F5'].filter(Boolean))]; }
function wire(root, onChange) {
  root.querySelectorAll('[data-f]').forEach((el) => {
    const o = B[Number(el.dataset.f)]; if (!o) return;
    const done = (redraw) => { onChange(o); if (redraw || o.redraw) E().drawPanel(); };
    if (o.t === 'act') { el.onclick = (e) => { e.preventDefault(); o.fn(); }; return; }
    if (o.t === 'bool') { el.onchange = () => { o.obj[o.key] = el.checked; if (o.onSet) o.onSet(el.checked); done(o.redraw); }; return; }
    if (o.t === 'seg') { el.querySelectorAll('button').forEach((b) => b.onclick = () => { el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); setVal(o.obj, o.key, o.numeric ? Number(b.dataset.v) : b.dataset.v); if (o.onSet) o.onSet(b.dataset.v); done(o.redraw); }); return; }
    if (o.t === 'color') {
      const pick = el.querySelector('input[type=color]'), txt = el.querySelector('input.kp-in'), sw = el.querySelector('.kp-sw i');
      const set = (v) => { setVal(o.obj, o.key, v); sw.style.background = v || 'transparent'; onChange(o, true); };
      pick.oninput = () => { txt.value = pick.value; set(pick.value); };
      txt.oninput = () => { const v = txt.value.trim(); if (!v || /^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\(/i.test(v) || v === 'transparent') { if (/^#[0-9a-f]{6}$/i.test(v)) pick.value = v; set(v); } };
      el.querySelector('[data-clr]').onclick = () => { txt.value = ''; set(''); };
      return;
    }
    if (o.t === 'padv' || o.t === 'padh') { el.oninput = () => { const v = el.value === '' ? null : Number(el.value); const ks = o.t === 'padv' ? ['top', 'bottom'] : ['left', 'right']; ks.forEach((s) => setVal(o.obj, `${o.prefix}_${s}`, v)); onChange(o, true); }; return; }
    const h = () => { let v = el.value; if (o.t === 'num') v = v === '' ? null : Number(v); setVal(o.obj, o.key, v); if (o.onSet) o.onSet(v); onChange(o, el.tagName !== 'SELECT'); if (o.redraw && el.tagName === 'SELECT') E().drawPanel(); };
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', h);
  });
  root.querySelectorAll('[data-add],[data-rm]').forEach((el) => { const o = B[Number(el.dataset.add ?? el.dataset.rm)]; el.onclick = () => { o.fn(); onChange({}); E().drawPanel(); }; });
  root.querySelectorAll('[data-sw]').forEach((el) => el.onclick = () => { const o = B[Number(el.dataset.for)]; setVal(o.obj, o.key, el.dataset.sw); onChange(o); E().drawPanel(); });
}
const onChange = (o, soon) => E().changed({ soon });

/* ---------- panel entry point ---------- */
window.MKE_drawPanel = function drawPanel() {
  const S = E().ST; const P = document.getElementById('kxPanel'); if (!P || !S) return;
  document.getElementById('kxRailAdd').classList.toggle('on', !S.sel && S.panel === 'add');
  document.getElementById('kxRailStyles').classList.toggle('on', !S.sel && S.panel === 'styles');
  B = [];
  const keepScroll = P.scrollTop; let html = ''; let same = P.dataset.for === (S.sel ? S.sel.id + S.tab : S.panel + S.addTab);
  if (S.sel) {
    const info = D.find(S.doc, S.sel.id);
    if (!info) { S.sel = null; return drawPanel(); }
    html = S.sel.kind === 'section' ? sectionPanel(info.node, S) : blockPanel(info.node, S, info);
  } else html = S.panel === 'styles' ? stylesPanel(S) : addPanel(S);
  P.innerHTML = html; P.dataset.for = S.sel ? S.sel.id + S.tab : S.panel + S.addTab;
  if (same) P.scrollTop = keepScroll;
  wire(P, onChange);
  P.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { S.tab = b.dataset.tab; drawPanel(); });
  P.querySelectorAll('[data-atab]').forEach((b) => b.onclick = () => { S.addTab = b.dataset.atab; drawPanel(); });
  const back = P.querySelector('.kp-back'); if (back) back.onclick = () => E().select(null);
  if (P._after) { const f = P._after; P._after = null; f(P); }
};

/* ---------- Add content ---------- */
const TILES = ['text', 'image', 'split', 'button', 'header', 'drop_shadow', 'horizontal_rule', 'social', 'spacer', 'product', 'coupon', 'table', 'review', 'video', 'html', 'countdown'];
function prebuilt(S) {
  const b = S.brand || {}, c = b.colors || {};
  const sec = (blocks, styles) => { const s = D.newSection(1); s.rows[0].columns[0].blocks = blocks; if (styles) s.data.styles = styles; return s; };
  const nb = (t, f) => { const x = D.newBlock(t, b); if (f) f(x); return x; };
  const txt = (html, st) => nb('text', (x) => { x.data.content = html; Object.assign(x.data.styles, st || {}); });
  return [
    ['Announcement bar', 'A thin colored bar with one line', () => [sec([txt('<p style="text-align:center">Free shipping on US orders $75+</p>', { block_padding_top: 10, block_padding_bottom: 10, color: '#FFFFFF', font_size: 14 })], { content_color_type: 'section', content_color: c.primary || '#242F3F' })]],
    ['Header with menu', 'Logo with Shop · New · Sale links', () => [sec([nb('header', (x) => { x.data.styles.desktop_layout = 'stacked'; })])]],
    ['Header, logo left', 'Logo on the left, links on the right', () => [sec([nb('header', (x) => { x.data.styles.desktop_layout = 'inline'; x.data.styles.mobile_layout = 'logo-stacked'; })])]],
    ['Hero', 'Big image, headline, line of text, button', () => [sec([nb('image', (x) => { x.data.styles.fill_column = true; }), txt('<h1 style="text-align:center">Don’t miss out</h1><p style="text-align:center">One line that says why it matters.</p>', { block_padding_top: 24 }), nb('button')])]],
    ['Image + text', 'Picture on one side, words on the other', () => [sec([nb('split')])]],
    ['Two columns', 'Two images with a line and a button each', () => { const s = D.newSection(2); s.rows[0].columns.forEach((col, i) => { col.blocks = [nb('image', (x) => { x.data.styles.fill_column = true; x.data.styles.block_padding_left = 9; x.data.styles.block_padding_right = 9; }), txt(`<h3 style="text-align:center">Pick ${i + 1}</h3>`), nb('button', (x) => { x.data.content = 'Shop'; })]; }); return [s]; }],
    ['Product grid', 'Headline and three products', () => [sec([txt('<h2 style="text-align:center">Shop the collection</h2>'), nb('product', (x) => { x.data.properties.dynamic = true; x.data.properties.feed = 'bestsellers'; })])]],
    ['Discount', 'Headline, code box and button', () => [sec([txt('<h2 style="text-align:center">A little gift for you</h2><p style="text-align:center">15% off your order — this week only.</p>'), nb('coupon'), nb('button', (x) => { x.data.content = 'Use my code'; })])]],
    ['Review', 'One customer quote with stars', () => [sec([nb('review')], { content_color_type: 'section', content_color: c.ground || '#F6F5F2' })]],
    ['Footer', 'Social icons, address and unsubscribe', () => [sec([nb('social'), txt(`<p style="text-align:center;font-size:12px">{{ store_name }} · {{ store_address }}<br><a href="{{ unsubscribe_url }}">Unsubscribe</a> · <a href="{{ preferences_url }}">Email preferences</a></p>`, { color: c.muted || '#777777', font_size: 12 })], { content_color_type: 'section', content_color: c.ground || '#F6F5F2', inner_padding_top: 12, inner_padding_bottom: 12 })]],
  ];
}
function addPanel(S) {
  const tab = S.addTab || 'blocks';
  let body = '';
  if (tab === 'blocks') {
    body = `<div class="kp-sec"><h4>Blocks</h4><div class="kp-grid">${TILES.map((t) => `<div class="kp-tile" draggable="true" data-tile="${t}">${I(D.BLOCK_INFO[t].icon)}<span>${esc(D.BLOCK_INFO[t].name)}</span></div>`).join('')}</div></div>
      <div class="kp-sec"><h4>Layout</h4><div class="kp-grid"><div class="kp-tile" draggable="true" data-lay="2">${I('columns')}<span>Columns</span></div><div class="kp-tile" draggable="true" data-lay="1">${I('square')}<span>Section</span></div></div>
      <div class="kp-hint" style="margin-top:8px">Drag onto the email, or click to add below what's selected.</div></div>`;
  } else if (tab === 'prebuilt') {
    body = `<div class="kp-sec">${prebuilt(S).map(([n, d], i) => `<div class="kp-pb" draggable="true" data-pb="${i}"><b>${esc(n)}</b><span>${esc(d)}</span></div>`).join('')}</div>`;
  } else {
    body = `<div class="kp-sec" id="kpUniv"><div class="empty">Loading…</div></div>`;
    document.getElementById('kxPanel')._after = (P) => loadUniversal(P, S);
  }
  const html = `<div class="kp-hd"><b>Add content</b></div><div class="kp-tabs"><button data-atab="blocks" class="${tab === 'blocks' ? 'on' : ''}">Blocks</button><button data-atab="prebuilt" class="${tab === 'prebuilt' ? 'on' : ''}">Pre-built</button><button data-atab="universal" class="${tab === 'universal' ? 'on' : ''}">Universal</button></div>${body}`;
  const prev = document.getElementById('kxPanel')._after;
  document.getElementById('kxPanel')._after = (P) => {
    if (prev) prev(P);
    const wireTile = (el, kind, make) => {
      el.addEventListener('dragstart', (e) => { E().setDrag({ kind, make }); e.dataTransfer.setData('text/plain', 'bz'); e.dataTransfer.effectAllowed = 'copy'; });
      el.addEventListener('dragend', () => setTimeout(() => E().clearDrag(), 30));
      el.addEventListener('click', () => E().addByClick(make, kind));
    };
    P.querySelectorAll('[data-tile]').forEach((el) => wireTile(el, 'block', () => D.newBlock(el.dataset.tile, S.brand)));
    P.querySelectorAll('[data-lay]').forEach((el) => wireTile(el, 'sections', () => [D.newSection(Number(el.dataset.lay))]));
    const pbs = prebuilt(S); P.querySelectorAll('[data-pb]').forEach((el) => wireTile(el, 'sections', () => pbs[Number(el.dataset.pb)][2]()));
  };
  return html;
}
async function loadUniversal(P, S) {
  const box = P.querySelector('#kpUniv'); if (!box) return;
  try {
    const r = await api('/api/mk/saved-blocks?' + qs({ store: S.t.store }));
    const items = r.blocks.filter((x) => x.block && (x.block.data || x.block.rows));
    if (!items.length) { box.innerHTML = `<div class="kp-hint" style="font-size:13px">Nothing saved yet. Select a block or section on the email and click the ☆ star to save it here. Edits to universal content update every email that uses it.</div>`; return; }
    box.innerHTML = items.map((x) => `<div class="kp-pb" draggable="true" data-u="${x.id}"><div style="display:flex;align-items:center;gap:6px"><b style="flex:1">${esc(x.name)}</b><button class="kp-plus" data-udel="${x.id}" title="Delete">${I('trash')}</button></div><span>${x.block.rows ? 'Section' : esc((D.BLOCK_INFO[x.block.type] || {}).name || x.block.type)}</span></div>`).join('');
    box.querySelectorAll('[data-u]').forEach((el) => {
      const it = items.find((x) => String(x.id) === el.dataset.u);
      const isSec = !!it.block.rows;
      const make = () => { const c = D.reId(it.block); c.universal_id = String(it.id); c.universal_name = it.name; return isSec ? [c] : c; };
      el.addEventListener('dragstart', (e) => { E().setDrag({ kind: isSec ? 'sections' : 'block', make }); e.dataTransfer.setData('text/plain', 'bz'); });
      el.addEventListener('dragend', () => setTimeout(() => E().clearDrag(), 30));
      el.addEventListener('click', (e) => { if (e.target.closest('[data-udel]')) return; E().addByClick(make, isSec ? 'sections' : 'block'); });
    });
    box.querySelectorAll('[data-udel]').forEach((b) => b.onclick = async (e) => { e.stopPropagation(); if (!confirm('Delete this universal content? Emails that use it keep their current copy.')) return; await api('/api/mk/saved-blocks/' + b.dataset.udel, { method: 'DELETE' }); loadUniversal(P, S); });
  } catch (e) { box.innerHTML = `<div class="note">${esc(e.message)}</div>`; }
}

/* ---------- Email styles (template-wide) ---------- */
function stylesPanel(S) {
  const doc = S.doc; const bs = D.brandStyles(S.brand);
  const base = D.ensureStyle(doc, 'base-styles'), body = doc.body.styles = doc.body.styles || {};
  const mob = D.ensureStyle(doc, 'mobile-styles'), link = D.ensureStyle(doc, 'link-styles').styles;
  const st = base.styles; const ph = bs['base-styles'];
  const textBlock = (type, label) => { const t = D.ensureStyle(doc, type).styles; const d = bs[type];
    return `<details class="kp-sec" ${type === 'text-styles' ? 'open' : ''}><summary style="cursor:pointer;font-weight:700;font-size:14px">${label}</summary>
      ${F.lab('Font', F.font(t, 'font_family'))}
      <div class="kp-4" style="margin-top:8px">${F.num(t, 'font_size', { ph: d.font_size, pre: 'Size' })}${F.weight(t, 'font_weight')}</div>
      <div class="kp-4" style="margin-top:8px">${F.num(t, 'line_height', { ph: d.line_height, step: 0.05, unit: '×', pre: 'Line' })}${F.num(t, 'letter_spacing', { ph: 0, step: 0.5, pre: 'Letter' })}</div>
      ${F.lab('Color', F.color(t, 'color', { ph: d.color }))}
      ${F.lab('Alignment', F.align(t, 'text_align', type === 'text-styles' ? 'left' : 'left'))}
      ${type !== 'text-styles' ? F.lab('Space below', F.num(t, 'margin_bottom', { ph: d.margin_bottom })) : ''}
      ${F.row('Italic', F.tog(t, 'font_style', { is: (v) => v === 'italic', onSet: (v) => { t.font_style = v ? 'italic' : 'normal'; } }))}
      <div class="kp-4" style="margin-top:4px">${F.lab('Size on mobile', F.num(t, 'mobile_font_size', { ph: d.mobile_font_size }))}<div>${F.lab('Line on mobile', F.num(t, 'mobile_line_height', { ph: d.mobile_line_height, step: 0.05, unit: '×' }))}</div></div></details>`; };
  return `<div class="kp-hd"><b>Styles</b></div><div class="kp-hint" style="padding:0 16px">These apply to the whole email. A section's or block's own style wins over these.</div>
  <div class="kp-sec"><h4>Email</h4>
    ${F.lab('Template background', F.color(st, 'background_color', { ph: ph.background_color }))}
    ${F.lab('Content background', F.color(st, 'content_background_color', { ph: ph.content_background_color }), 'Behind the email itself (the content width only).')}
    ${F.lab('Background image', `<div class="kp-col">${F.text(st, 'background_url', { ph: 'https://… (optional)' })}<button type="button" class="kp-ic" data-f="${bind({ t: 'act', fn: () => window.MKE_pickImage((u) => { st.background_url = u; onChange({}); E().drawPanel(); }) })}" title="Choose">${I('photo')}</button></div>`)}
    ${st.background_url ? `<div class="kp-4" style="margin-top:8px">${F.sel(st, 'background_format', [['cover', 'Cover'], ['contain', 'Fit'], ['repeat', 'Tile']], { def: 'cover' })}${F.sel(st, 'background_position', [['center-top', 'Top'], ['center-center', 'Center'], ['center-bottom', 'Bottom']], { def: 'center-top' })}</div>` : ''}
    <div class="kp-4" style="margin-top:4px"><div>${F.lab('Width', F.num(body, 'width', { ph: 600, min: 320, max: 900 }))}</div><div>${F.lab('Corner radius', F.num(st, 'border_radius', { ph: 0, min: 0, max: 60 }))}</div></div>
    ${F.lab('Space above and below', F.num(st, 'margin_top', { ph: ph.margin_top, min: 0, max: 120 }))}
    ${F.lab('Padding inside', F.pad(st, 'inner_padding', { ph: { t: 0, l: 0 } }))}
  </div>
  ${F.opt('Email border', bord(st), { add: () => { st.border_style = 'solid'; st.border_width = 1; st.border_color = '#E5E5E5'; }, remove: () => { st.border_width = 0; } }, () => F.border(st))}
  <div class="kp-sec"><h4>Text &amp; headings</h4><div class="kp-hint">Pick these in a text block's style menu: Normal, Heading 1–4.</div></div>
  ${textBlock('text-styles', 'Normal text')}${textBlock('heading-1-styles', 'Heading 1')}${textBlock('heading-2-styles', 'Heading 2')}${textBlock('heading-3-styles', 'Heading 3')}${textBlock('heading-4-styles', 'Heading 4')}
  <div class="kp-sec"><h4>Links</h4>${F.lab('Color', F.color(link, 'color', { ph: bs['link-styles'].color }))}
    ${F.row('Underline', F.tog(link, 'text_decoration', { is: (v) => v !== 'none', onSet: (v) => { link.text_decoration = v ? 'underline' : 'none'; } }))}
    ${F.row('Bold', F.tog(link, 'font_weight', { is: (v) => v === '700' || v === 'bold', onSet: (v) => { link.font_weight = v ? '700' : ''; } }))}
    ${F.row('Italic', F.tog(link, 'font_style', { is: (v) => v === 'italic', onSet: (v) => { link.font_style = v ? 'italic' : 'normal'; } }))}</div>
  <div class="kp-sec"><h4>Mobile</h4>
    ${F.row('Mobile optimization', F.tog(base.properties, 'mobile_optimizations', { def: true }), 'Recommended. Shrinks headings, removes outside margins and stacks columns on phones.')}
    ${F.lab('Outside margin on mobile', F.num(mob.styles, 'mobile_margin', { ph: 0, min: 0, max: 40 }))}
    ${F.lab('Email padding on mobile', F.pad(mob.styles, 'mobile_padding', { ph: { t: 0, l: 0 } }))}
    ${F.row('Override block side padding on mobile', F.tog(mob.properties, 'mobile_padding_override', { redraw: true }))}
    ${mob.properties.mobile_padding_override ? `<div class="kp-4">${F.num(mob.styles, 'mobile_block_padding_left', { ph: 18, pre: 'L' })}${F.num(mob.styles, 'mobile_block_padding_right', { ph: 18, pre: 'R' })}</div>` : ''}
  </div>`;
}
const bord = (s, p = '') => Number(s[p + 'border_width']) > 0 && (s[p + 'border_style'] || 'solid') !== 'none';

/* ---------- Section ---------- */
const LAYOUTS = [['1-column-full-width', [100]], ['2-columns-equal-width', [50, 50]], ['2-columns-33%-67%', [33, 67]], ['2-columns-67%-33%', [67, 33]], ['2-columns-25%-75%', [25, 75]], ['2-columns-75%-25%', [75, 25]], ['3-columns-equal-width', [33, 33, 33]], ['3-columns-25%-50%-25%', [25, 50, 25]], ['3-columns-50%-25%-25%', [50, 25, 25]], ['3-columns-25%-25%-50%', [25, 25, 50]], ['4-columns-equal-width', [25, 25, 25, 25]]];
function setLayout(sec, lay) {
  const row = sec.rows[0] || (sec.rows[0] = { id: D.rid(), data: { styles: {} }, columns: [] });
  row.data = row.data || {}; row.data.styles = row.data.styles || {}; row.data.styles.column_layout = lay;
  const n = D.layoutPcts(lay).length;
  while (row.columns.length < n) row.columns.push({ id: D.rid(), data: {}, blocks: [] });
  if (row.columns.length > n) { const extra = row.columns.splice(n); extra.forEach((c) => row.columns[n - 1].blocks.push(...(c.blocks || []))); }
}
function sectionPanel(sec, S) {
  sec.data = sec.data || {}; const st = sec.data.styles = sec.data.styles || {}; const dop = sec.data.display_options = sec.data.display_options || {};
  const lay = ((sec.rows[0] || {}).data || {}).styles ? sec.rows[0].data.styles.column_layout : '1-column-full-width';
  const hd = `<div class="kp-hd"><button class="kp-back" title="Back">${I('chevron-left')}</button><b>Section</b></div>${sec.universal_id ? univBanner(sec) : ''}<div class="kp-tabs"><button data-tab="styles" class="${S.tab !== 'display' ? 'on' : ''}">Styles</button><button data-tab="display" class="${S.tab === 'display' ? 'on' : ''}">Display</button></div>`;
  if (S.tab === 'display') return hd + displayTab(dop, 'section');
  const ct = st.content_color_type || 'template';
  return hd + `<div class="kp-sec"><h4>Columns</h4><div class="kp-lay">${LAYOUTS.map(([k, ws]) => `<button type="button" class="${k === (lay || '1-column-full-width') ? 'on' : ''}" data-f="${bind({ t: 'act', fn: () => { setLayout(sec, k); onChange({}); E().drawPanel(); } })}" title="${k}">${ws.map((w) => `<span style="flex:${w}"></span>`).join('')}</button>`).join('')}</div>
      ${(sec.rows[0] || { columns: [] }).columns.length > 1 ? `${F.row('Stack columns on mobile', F.tog(st, 'stack_on_mobile', { def: true, redraw: true }))}
      ${st.stack_on_mobile !== false ? F.lab('Stacking order on mobile', F.sel(st, 'column_direction', [['ltr', 'Left column first'], ['rtl', 'Right column first']], { def: 'ltr' })) : ''}
      ${F.lab('Align column content', F.seg(st, 'column_align', [['top', I('layout-align-top'), 'Top'], ['middle', I('layout-align-middle'), 'Middle'], ['bottom', I('layout-align-bottom'), 'Bottom']], { def: 'top' }))}
      ${(sec.rows[0].columns).map((c, i) => { c.data = c.data || {}; c.data.styles = c.data.styles || {}; return F.lab(`Column ${i + 1} background`, F.color(c.data.styles, 'background_color', { ph: 'None', noSw: true })); }).join('')}` : ''}</div>
    <div class="kp-sec"><h4>Background</h4>
      ${F.lab('Content color', F.seg(st, 'content_color_type', [['template', 'Email', 'Use the email content background'], ['section', 'Custom', 'Pick a color for this section'], ['none', 'None', 'See-through to the template background']], { def: 'template', redraw: true }))}
      ${ct === 'section' ? `<div style="margin-top:8px">${F.color(st, 'content_color', { ph: '#FFFFFF' })}</div>` : ''}
      ${F.lab('Background image', `<div class="kp-col">${F.text(st, 'background_url', { ph: 'https://… (optional)' })}<button type="button" class="kp-ic" data-f="${bind({ t: 'act', fn: () => window.MKE_pickImage((u) => { st.background_url = u; onChange({}); E().drawPanel(); }) })}" title="Choose">${I('photo')}</button></div>`, 'Blocks sit on top of it. Outlook on Windows shows the color instead.')}
      ${st.background_url ? `<div class="kp-4" style="margin-top:8px">${F.sel(st, 'background_format', [['cover', 'Cover'], ['contain', 'Fit'], ['repeat', 'Tile'], ['auto', 'Original size']], { def: 'cover' })}${F.sel(st, 'background_position', [['center-top', 'Top'], ['center-center', 'Center'], ['center-bottom', 'Bottom'], ['left-top', 'Top left'], ['right-top', 'Top right']], { def: 'center-center' })}</div>` : ''}
    </div>
    <div class="kp-sec"><h4>Padding</h4>${F.pad(st, 'inner_padding', { ph: { t: 0, l: 0 } })}</div>
    ${F.opt('Border', bord(st), { add: () => { st.border_style = 'solid'; st.border_width = 1; st.border_color = '#DDDDDD'; }, remove: () => { st.border_width = 0; } }, () => F.border(st))}`;
}

/* ---------- Display tab (blocks and sections) ---------- */
function displayTab(dop, what) {
  const on = dop.show_on || 'all';
  const vis = dop.visibility || null; const rep = dop.content_repeat || null;
  let defn = null; try { defn = vis && vis.definition ? (typeof vis.definition === 'string' ? JSON.parse(vis.definition) : vis.definition) : null; } catch (_) {}
  const rules = defn ? (Array.isArray(defn) ? { match: 'all', action: 'show', rules: defn } : defn) : null;
  const radio = (v, ic, l) => `<label class="${on === v ? 'on' : ''}"><input type="radio" name="kpvis" value="${v}" data-f="${bind({ t: 'act', fn: () => { dop.show_on = v; onChange({}); E().drawPanel(); } })}"${on === v ? ' checked' : ''}> ${I(ic)} ${l}</label>`;
  const FIELDS = [['first_name', 'First name'], ['email', 'Email'], ['orders_count', 'Number of orders'], ['total_spent', 'Total spent'], ['last_sizes', 'Sizes last bought'], ['accepts_marketing', 'Accepts marketing'], ['tags', 'Tags'], ['city', 'City'], ['state', 'State'], ['country', 'Country']];
  const OPS = [['eq', 'is'], ['ne', 'is not'], ['contains', 'contains'], ['not_contains', "doesn't contain"], ['gt', 'more than'], ['lt', 'less than'], ['set', 'is set'], ['unset', 'is not set']];
  let logic;
  if (!vis) logic = `<div class="kp-hint" style="font-size:13px;margin-bottom:10px">Show or hide this ${what} based on what you know about each person.</div><div style="display:flex;gap:8px">${F.btn('Use logic builder', () => { dop.visibility = { definition: JSON.stringify({ match: 'all', action: 'show', rules: [{ field: 'orders_count', op: 'gt', value: '0' }] }), check: '', is_code_only: false }; onChange({}); E().drawPanel(); })}${F.btn('Use code', () => { dop.visibility = { check: '', definition: '', is_code_only: true }; E().drawPanel(); })}</div>`;
  else if (vis.is_code_only || (vis.check && !rules)) logic = `${F.lab('Show when', F.area(vis, 'check', { rows: 3, mono: true, ph: "person|lookup:'Accepts Marketing' == True" }), 'Klaviyo-style code: <code>person.first_name</code>, <code>person|lookup:\'Prop\'</code>, <code>event.X</code>, with <code>== != &gt; &lt; in not and or</code>.')}<div style="margin-top:8px">${F.btn('Remove logic', () => { delete dop.visibility; onChange({}); E().drawPanel(); }, 'danger')}</div>`;
  else {
    const r = rules || { match: 'all', action: 'show', rules: [] };
    const save = () => { vis.definition = JSON.stringify(r); vis.check = ''; onChange({}); };
    logic = `<div class="kp-4"><select class="kp-in" data-f="${bind({ obj: r, key: 'action', t: 'text', onSet: save })}"><option value="show"${r.action !== 'hide' ? ' selected' : ''}>Show if</option><option value="hide"${r.action === 'hide' ? ' selected' : ''}>Hide if</option></select><select class="kp-in" data-f="${bind({ obj: r, key: 'match', t: 'text', onSet: save })}"><option value="all"${r.match !== 'any' ? ' selected' : ''}>all are true</option><option value="any"${r.match === 'any' ? ' selected' : ''}>any is true</option></select></div>
      ${r.rules.map((x, i) => `<div style="border:1px solid #E1E3E8;border-radius:9px;padding:8px;margin-top:8px"><div class="kp-4"><select class="kp-in" data-f="${bind({ obj: x, key: 'field', t: 'text', onSet: save })}">${FIELDS.map(([v, l]) => `<option value="${v}"${x.field === v ? ' selected' : ''}>${l}</option>`).join('')}${FIELDS.some(([v]) => v === x.field) ? '' : `<option value="${esc(x.field)}" selected>${esc(x.field)}</option>`}</select><select class="kp-in" data-f="${bind({ obj: x, key: 'op', t: 'text', onSet: save, redraw: true })}">${OPS.map(([v, l]) => `<option value="${v}"${x.op === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
        ${['set', 'unset'].includes(x.op) ? '' : `<div style="margin-top:6px">${F.text(x, 'value', { ph: 'Value', onSet: save })}</div>`}<div style="text-align:right;margin-top:4px">${F.btn('Remove', () => { r.rules.splice(i, 1); save(); E().drawPanel(); })}</div></div>`).join('')}
      <div style="display:flex;gap:8px;margin-top:8px">${F.btn('+ Add condition', () => { r.rules.push({ field: 'orders_count', op: 'gt', value: '0' }); save(); E().drawPanel(); })}${F.btn('Remove logic', () => { delete dop.visibility; onChange({}); E().drawPanel(); }, 'danger')}</div>`;
  }
  return `<div class="kp-sec"><h4>Visibility</h4><div class="kp-radio">${radio('all', 'devices', 'All devices')}${radio('desktop', 'device-desktop', 'Desktop only')}${radio('mobile', 'device-mobile', 'Mobile only')}</div></div>
    <div class="kp-sec"><h4>Show/hide logic</h4>${logic}</div>
    <div class="kp-sec"><h4>Content repeat</h4>${rep ? `${F.lab('Repeat for', F.text(rep, 'repeat_for', { ph: 'event.extra.line_items' }), 'A list in the person or event data. One copy is made per item.')}${F.lab('Item name', F.text(rep, 'item_alias', { ph: 'item' }), 'Use it inside: <code>{{ item.title }}</code>')}<div style="margin-top:8px">${F.btn('Remove repeat', () => { delete dop.content_repeat; onChange({}); E().drawPanel(); }, 'danger')}</div>`
      : `<div class="kp-hint" style="font-size:13px;margin-bottom:10px">To repeat this content, give a list to "loop over" and a name to use for each item.</div>${F.btn('Add content repeat', () => { dop.content_repeat = { repeat_for: 'event.extra.line_items', item_alias: 'item' }; onChange({}); E().drawPanel(); })}`}</div>`;
}
function univBanner(n) { return `<div class="kp-banner">${I('star')} <b>Universal content${n.universal_name ? ': ' + esc(n.universal_name) : ''}</b><br>Changes here update every email that uses it when you save. ${F.btn('Unlink', () => { delete n.universal_id; delete n.universal_name; onChange({}); E().drawPanel(); })}</div>`; }

/* ---------- Block ---------- */
function blockPanel(blk, S, info) {
  blk.data = blk.data || {}; const st = blk.data.styles = blk.data.styles || {}; const dop = blk.data.display_options = blk.data.display_options || {};
  const name = (D.BLOCK_INFO[blk.type] || {}).name || blk.type;
  const hd = `<div class="kp-hd"><button class="kp-back" title="Back">${I('chevron-left')}</button><b>${esc(name)}</b>
    <button class="kp-plus" title="Duplicate" data-f="${bind({ t: 'act', fn: () => E().toolAction('dup', S.sel) })}">${I('copy')}</button>
    <button class="kp-plus" title="Save as universal" data-f="${bind({ t: 'act', fn: () => E().toolAction('save', S.sel) })}">${I('star')}</button>
    <button class="kp-plus" title="Delete" data-f="${bind({ t: 'act', fn: () => E().removeNode(S.sel) })}">${I('trash')}</button></div>
    ${info.section ? `<div style="padding:0 16px 6px"><button type="button" class="btn xs" data-f="${bind({ t: 'act', fn: () => E().select({ kind: 'section', id: info.section.id }) })}">${I('arrow-up')} Select its section</button></div>` : ''}
    ${blk.universal_id ? univBanner(blk) : info.section && info.section.universal_id ? univBanner(info.section) : ''}
    <div class="kp-tabs"><button data-tab="styles" class="${S.tab !== 'display' ? 'on' : ''}">Styles</button><button data-tab="display" class="${S.tab === 'display' ? 'on' : ''}">Display</button></div>`;
  if (S.tab === 'display') return hd + displayTab(dop, 'block');
  const def = D.blockDefaults(blk.type, S.brand);
  const fn = PANELS[blk.type] || (() => '');
  return hd + fn(blk, st, def, S, info) + blockCommon(blk, st, def);
}
/** Block background + block padding, at the bottom of every block's Styles (like Klaviyo). */
function blockCommon(blk, st, def) {
  if (blk.type === 'spacer') return '';
  return `${F.opt('Block background color', !!st.block_background_color, { add: () => { st.block_background_color = '#FFFFFF'; }, remove: () => { delete st.block_background_color; } }, () => F.color(st, 'block_background_color'))}
  <div class="kp-sec"><h4>Block padding</h4>${F.pad(st, 'block_padding', { ph: { t: def.block_padding_top, b: def.block_padding_bottom, l: def.block_padding_left, r: def.block_padding_right } })}
  ${['image', 'video'].includes(blk.type) ? F.row('Full width on mobile', F.tog(st, 'full_width_mobile'), 'On phones, the image goes edge to edge (no block padding).') : ''}</div>`;
}
const textStyleSection = (st, def, title = 'Text') => `<div class="kp-sec"><h4>${title}</h4>${F.lab('Font', F.font(st, 'font_family'))}
  <div class="kp-4" style="margin-top:8px">${F.num(st, 'font_size', { ph: def.font_size || '', pre: 'Size' })}${F.weight(st, 'font_weight')}</div>
  ${F.lab('Color', F.color(st, 'color', { ph: def.color || 'Default' }))}
  <div class="kp-4" style="margin-top:8px">${F.num(st, 'letter_spacing', { ph: def.letter_spacing || 0, step: 0.5, pre: 'Letter' })}${F.sel(st, 'font_style', [['normal', 'Upright'], ['italic', 'Italic']], { ph: 'Style' })}</div></div>`;

const PANELS = {
  text(blk, st, def) {
    return `<div class="kp-sec"><div class="kp-hint" style="font-size:13px">${I('pencil')} Click the text on the email to type. A formatting bar appears above it (text style, font, size, bold, color, links, personalization).</div>
      <div style="margin-top:10px;display:flex;gap:8px">${F.btn(`${I('sparkles')} Ask Emily`, () => E().toolAction('ai', E().ST.sel))}${F.btn('Edit HTML', () => htmlModal(blk.data.content || '', (h) => { blk.data.content = h; onChange({}); }))}</div></div>
      <div class="kp-sec"><h4>Defaults for this block</h4>${F.lab('Font', F.font(st, 'font_family'))}<div class="kp-4" style="margin-top:8px">${F.num(st, 'font_size', { ph: 'Style', pre: 'Size' })}${F.num(st, 'line_height', { ph: 'Style', step: 0.05, unit: '×', pre: 'Line' })}</div>
      ${F.lab('Text color', F.color(st, 'color', { ph: 'From styles' }))}${F.lab('Alignment', F.align(st, 'text_align', ''))}</div>
      ${F.opt('Text area background color', !!st.background_color, { add: () => { st.background_color = '#F6F5F2'; }, remove: () => { delete st.background_color; } }, () => F.color(st, 'background_color'))}
      <div class="kp-sec"><h4>Text area padding</h4>${F.pad(st, 'inner_padding', { ph: { t: 0, l: 0 } })}</div>
      ${F.opt('Block border', bord(st, 'block_'), { add: () => { st.block_border_style = 'solid'; st.block_border_width = 1; st.block_border_color = '#DDDDDD'; }, remove: () => { st.block_border_width = 0; } }, () => F.border(st, 'block_'))}`;
  },
  image(blk, st, def, S, info) {
    const p = blk.data.properties = blk.data.properties || {};
    const colW = colWidth(info);
    const nw = Number(p.natural_w) || 0, nh = Number(p.natural_h) || 0;
    if (!nw && p.src && !p._probing) { p._probing = true; const im = new Image(); im.onload = () => { p.natural_w = im.naturalWidth; p.natural_h = im.naturalHeight; delete p._probing; E().drawPanel(); }; im.onerror = () => { delete p._probing; }; im.src = p.src; }
    const w = st.fill_column ? colW : Number(st.width) || Math.min(nw || colW, colW);
    const hCalc = nw ? Math.round(w * nh / nw) : '';
    return `<div class="kp-sec"><h4>Image</h4>${imgCard(p.src, `${p.natural_w ? `${p.natural_w} × ${p.natural_h}` : ''}`, {
        replace: () => window.MKE_pickImage((u) => window.MKE_setImage(blk, u)), crop: p.src ? () => cropModal(p.src, (u) => window.MKE_setImage(blk, u, true)) : null, remove: p.src ? () => { p.src = ''; onChange({}); E().drawPanel(); } : null })}
      ${F.lab('Alt text', F.text(p, 'alt_text', { ph: 'Brief description of your image' }), 'Read aloud by screen readers and shown if images are blocked.')}
      ${F.lab('Link address', F.text(p, 'href', { ph: 'https://…' }))}</div>
    <div class="kp-sec"><h4>Image layout</h4>
      <div class="kp-2"><span class="kp-num"><span class="pre">W</span><input type="number" min="20" max="${colW}" data-f="${bind({ t: 'num', obj: st, key: 'width', onSet: () => { st.fill_column = false; } })}" value="${esc(w)}"${st.fill_column ? ' disabled' : ''}><span class="u">px</span></span>
        <span class="kp-num"><span class="pre">H</span><input type="number" min="20" data-f="${bind({ t: 'num', obj: st, key: 'height' })}" value="${esc(st.lock_ratio === false ? (st.height || hCalc) : hCalc)}"${st.lock_ratio === false ? '' : ' disabled'}><span class="u">px</span></span>
        <button type="button" class="kp-ic ${st.lock_ratio === false ? '' : 'on'}" title="${st.lock_ratio === false ? 'Keep proportions' : 'Unlock height'}" data-f="${bind({ t: 'act', fn: () => { if (st.lock_ratio === false) { delete st.lock_ratio; delete st.height; } else { st.lock_ratio = false; st.height = hCalc || 200; } onChange({}); E().drawPanel(); } })}">${I(st.lock_ratio === false ? 'lock-open' : 'lock')}</button></div>
      <div style="margin-top:10px">${F.align(st, 'align', 'center')}</div>
      ${F.row('Fill column', F.tog(st, 'fill_column', { redraw: true }), 'Stretch the image to the full width of its column.')}
      ${F.row('Fill column on mobile', F.tog(st, 'mobile_stretch_content'), 'On phones, stretch to the column width.')}</div>
    <div class="kp-sec"><h4>Image area padding</h4>${F.pad(st, 'inner_padding', { ph: { t: 0, l: 0 } })}</div>
    ${F.opt('Image area background color', !!st.background_color, { add: () => { st.background_color = '#FFFFFF'; }, remove: () => { delete st.background_color; } }, () => F.color(st, 'background_color'))}
    ${F.opt('Image area border', bord(st, 'block_'), { add: () => { st.block_border_style = 'solid'; st.block_border_width = 1; st.block_border_color = '#DDDDDD'; }, remove: () => { st.block_border_width = 0; } }, () => F.border(st, 'block_'))}
    ${F.opt('Image corner radius', Number(st.border_radius) > 0, { add: () => { st.border_radius = 8; }, remove: () => { st.border_radius = 0; } }, () => F.num(st, 'border_radius', { min: 0, max: 300 }))}`;
  },
  video(blk, st, def, S, info) {
    const p = blk.data.properties = blk.data.properties || {};
    return `<div class="kp-sec"><h4>Video</h4>${F.lab('Video link', F.text(p, 'href', { ph: 'https://youtube.com/watch?v=…', onSet: () => scheduleThumb(blk) }), 'YouTube, Vimeo, TikTok or any link. Email can’t play video, so this shows a picture that opens it in a new tab.')}
      ${F.lab('Thumbnail', imgCard(p.src || D.youtubeThumb(p.href), '', { replace: () => window.MKE_pickImage((u) => { p.raw_src = u; makeThumb(blk); }), crop: null, remove: p.raw_src ? () => { p.raw_src = ''; makeThumb(blk); } : null }), 'YouTube thumbnails fill in by themselves. Upload one for other sites.')}
      ${F.row('Play button', F.tog(p, 'overlay_toggle', { def: true, onSet: () => makeThumb(blk) }))}
      ${F.lab('Alt text', F.text(p, 'alt_text', { ph: 'Play video' }))}</div>
      <div class="kp-sec"><h4>Layout</h4>${F.align(st, 'align', 'center')}${F.row('Fill column', F.tog(st, 'fill_column', { def: false }))}${F.lab('Width', F.num(st, 'width', { ph: colWidth(info), min: 60, max: colWidth(info) }))}</div>
      ${F.opt('Corner radius', Number(st.border_radius) > 0, { add: () => { st.border_radius = 8; }, remove: () => { st.border_radius = 0; } }, () => F.num(st, 'border_radius', { min: 0, max: 60 }))}
      ${F.opt('Border', bord(st), { add: () => { st.border_style = 'solid'; st.border_width = 1; st.border_color = '#DDDDDD'; }, remove: () => { st.border_width = 0; } }, () => F.border(st))}`;
  },
  button(blk, st, def) {
    const p = blk.data.properties = blk.data.properties || {};
    const lbl = { v: String(blk.data.content || '').replace(/<[^>]+>/g, '') };
    return `<div class="kp-sec"><h4>Button</h4>${F.lab('Text', `<div class="kp-col"><input class="kp-in" data-f="${bind({ t: 'text', obj: lbl, key: 'v', onSet: (v) => { blk.data.content = esc(v || ''); } })}" value="${esc(lbl.v)}"><button type="button" class="kp-ic" title="Ask Emily" data-f="${bind({ t: 'act', fn: () => E().toolAction('ai', E().ST.sel) })}">${I('sparkles')}</button></div>`)}
      ${F.lab('Link address', F.text(p, 'href', { ph: 'https://…' }), 'Empty goes to your store’s home page.')}</div>
    <div class="kp-sec"><h4>Button style</h4>${F.lab('Button color', F.color(st, 'background_color', { ph: def.background_color }))}${F.lab('Text color', F.color(st, 'color', { ph: def.color }))}
      ${F.lab('Font', F.font(st, 'font_family'))}<div class="kp-4" style="margin-top:8px">${F.num(st, 'font_size', { ph: def.font_size, pre: 'Size' })}${F.weight(st, 'font_weight')}</div>
      <div class="kp-4" style="margin-top:8px">${F.num(st, 'letter_spacing', { ph: 0, step: 0.5, pre: 'Letter' })}${F.sel(st, 'font_style', [['normal', 'Upright'], ['italic', 'Italic']], { ph: 'Style' })}</div>
      ${F.lab('Corner radius', F.num(st, 'border_radius', { ph: def.border_radius, min: 0, max: 100 }))}
      ${F.lab('Padding inside the button', F.pad(st, 'inner_padding', { ph: { t: def.inner_padding_top, l: def.inner_padding_left } }))}
      ${F.lab('Alignment', F.align(st, 'text_align', 'center'))}
      ${F.row('Full width', F.tog(st, 'stretch'))}${F.row('Full width on mobile', F.tog(st, 'mobile_stretch_content'))}</div>
    ${F.opt('Button border', bord(st), { add: () => { st.border_style = 'solid'; st.border_width = 2; st.border_color = def.background_color; }, remove: () => { st.border_width = 0; st.border_style = 'none'; } }, () => F.border(st))}
    ${F.opt('Drop shadow', !!st.drop_shadow_color, { add: () => { st.drop_shadow_color = '#00000033'; }, remove: () => { delete st.drop_shadow_color; } }, () => F.color(st, 'drop_shadow_color'))}`;
  },
  header(blk, st, def, S) {
    const subs = blk.subblocks = blk.subblocks || [];
    let logo = subs.find((x) => x.type === 'header_link_bar_logo');
    const links = subs.filter((x) => x.type !== 'header_link_bar_logo');
    const move = (x, d) => { const i = subs.indexOf(x), j = i + d; if (j < 0 || j >= subs.length || subs[j].type === 'header_link_bar_logo') return; [subs[i], subs[j]] = [subs[j], subs[i]]; onChange({}); E().drawPanel(); };
    return `<div class="kp-sec"><h4>Logo${logo ? F.btn('Remove', () => { subs.splice(subs.indexOf(logo), 1); onChange({}); E().drawPanel(); }) : F.btn('+ Add logo', () => { subs.unshift({ id: D.rid(), type: 'header_link_bar_logo', src: S.brand.logo_abs || '', width: 120, href: S.brand.shop_url || '', show_on: 'all' }); onChange({}); E().drawPanel(); })}</h4>
      ${logo ? `${imgCard(logo.src, '', { replace: () => window.MKE_pickImage((u) => { logo.src = u; onChange({}); E().drawPanel(); }), crop: null, remove: null })}
        <div class="kp-4" style="margin-top:8px">${F.num(logo, 'width', { ph: 120, pre: 'W', min: 20, max: 600 })}${F.sel(logo, 'show_on', [['all', 'All devices'], ['desktop', 'Desktop only'], ['mobile', 'Mobile only']], { def: 'all' })}</div>
        ${F.lab('Logo link', F.text(logo, 'href', { ph: 'https://…' }))}${F.lab('Alt text', F.text(logo, 'alt_text', { ph: S.brand.name || '' }))}` : ''}</div>
    <div class="kp-sec"><h4>Links ${F.btn('+ Add link', () => { subs.push({ id: D.rid(), type: 'header_link_bar_button', content: 'Link', href: S.brand.shop_url || '', show_on: 'all' }); onChange({}); E().drawPanel(); })}</h4>
      ${links.map((x) => `<div style="border:1px solid #E1E3E8;border-radius:9px;padding:8px;margin-bottom:8px"><div class="kp-4">${F.text(x, 'content', { ph: 'Text' })}${F.text(x, 'href', { ph: 'https://…' })}</div>
        <div style="display:flex;gap:6px;margin-top:6px;align-items:center">${F.sel(x, 'show_on', [['all', 'All devices'], ['desktop', 'Desktop only'], ['mobile', 'Mobile only']], { def: 'all' })}<button type="button" class="kp-ic" data-f="${bind({ t: 'act', fn: () => move(x, -1) })}" title="Move up">${I('arrow-up')}</button><button type="button" class="kp-ic" data-f="${bind({ t: 'act', fn: () => move(x, 1) })}" title="Move down">${I('arrow-down')}</button><button type="button" class="kp-ic" data-f="${bind({ t: 'act', fn: () => { subs.splice(subs.indexOf(x), 1); onChange({}); E().drawPanel(); } })}" title="Remove">${I('trash')}</button></div></div>`).join('') || '<div class="kp-hint">No links.</div>'}</div>
    <div class="kp-sec"><h4>Layout</h4>${F.lab('Desktop layout', F.sel(st, 'desktop_layout', [['stacked', 'Logo above links'], ['inline', 'Logo left, links right'], ['centered', 'Logo in the middle of the links'], ['links', 'Links only']], { def: def.desktop_layout }))}
      ${F.lab('Mobile layout', F.sel(st, 'mobile_layout', [['logo-stacked', 'Logo above links'], ['stacked', 'Stack all'], ['inline', 'Same as desktop'], ['links-stacked', 'Links only, stacked'], ['links', 'Links only, in a row']], { def: def.mobile_layout }))}
      ${F.lab('Logo alignment', F.align(st, 'logo_align', def.logo_align))}${F.lab('Link alignment', F.align(st, 'item_align', def.item_align))}
      <div class="kp-4" style="margin-top:8px">${F.num(st, 'item_spacing', { ph: def.item_spacing, pre: 'Between links' })}${F.num(st, 'logo_link_spacing', { ph: def.logo_link_spacing, pre: 'Logo gap' })}</div></div>
    ${textStyleSection(st, def, 'Link text')}
    <div class="kp-sec"><h4>Link padding</h4>${F.pad(st, 'inner_padding', { ph: { t: 0, l: 0 } })}${F.row('Underline links', F.tog(st, 'text_decoration', { is: (v) => v === 'underline', onSet: (v) => { st.text_decoration = v ? 'underline' : 'none'; } }))}</div>
    ${F.opt('Border', bord(st), { add: () => { st.border_style = 'solid'; st.border_width = 1; st.border_color = '#DDDDDD'; }, remove: () => { st.border_width = 0; } }, () => F.border(st))}`;
  },
  drop_shadow(blk, st, def) { return `<div class="kp-sec"><h4>Shadow</h4>${F.seg(st, 'shadow_color', [['light', 'Light'], ['medium', 'Dark'], ['dark', 'Darker']], { def: def.shadow_color })}<div class="kp-hint" style="margin-top:8px">A soft shadow line — put it right under a section to lift it off the page.</div></div>`; },
  horizontal_rule(blk, st, def) { return `<div class="kp-sec"><h4>Divider</h4>${F.lab('Line', F.seg(st, 'border_style', [['solid', '———', 'Solid'], ['dashed', '- - -', 'Dashed'], ['dotted', '· · ·', 'Dotted']], { def: def.border_style }))}${F.lab('Color', F.color(st, 'border_color', { ph: def.border_color }))}${F.lab('Thickness', F.num(st, 'border_width', { ph: def.border_width, min: 1, max: 20 }))}</div>`; },
  spacer(blk, st, def) { return `<div class="kp-sec"><h4>Spacer</h4>${F.lab('Height', F.num(st, 'height', { ph: def.height, min: 1, max: 400 }))}${F.lab('Background color', F.color(st, 'background_color', { ph: 'None' }))}</div>`; },
  social(blk, st, def) {
    const p = blk.data.properties = blk.data.properties || {}; const subs = blk.subblocks = blk.subblocks || [];
    const NET = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['pinterest', 'Pinterest'], ['youtube', 'YouTube'], ['x-twitter', 'X (Twitter)'], ['threads', 'Threads'], ['linkedin', 'LinkedIn'], ['snapchat', 'Snapchat'], ['whatsapp', 'WhatsApp'], ['discord', 'Discord'], ['twitch', 'Twitch'], ['yelp', 'Yelp'], ['email', 'Email'], ['website', 'Website'], ['rss', 'RSS'], ['apple', 'Apple'], ['android', 'Android'], ['custom', 'Custom icon']];
    const move = (x, d) => { const i = subs.indexOf(x), j = i + d; if (j < 0 || j >= subs.length) return; [subs[i], subs[j]] = [subs[j], subs[i]]; onChange({}); E().drawPanel(); };
    return `<div class="kp-sec"><h4>Links <span style="display:flex;gap:4px">${F.btn('+ Icon', () => { subs.push({ id: D.rid(), type: 'social_link_icon', link_type: 'instagram', link_url: '', label: 'Instagram' }); onChange({}); E().drawPanel(); })}${F.btn('+ Spacer', () => { subs.push({ id: D.rid(), type: 'social_link_spacer', width: 20 }); onChange({}); E().drawPanel(); })}</span></h4>
      ${subs.map((x) => `<div style="border:1px solid #E1E3E8;border-radius:9px;padding:8px;margin-bottom:8px">${x.type === 'social_link_spacer' ? `<div class="kp-row"><span class="l">Spacer</span><span class="c">${F.num(x, 'width', { ph: 20, w: 100 })}</span></div>` : `<div class="kp-4">${F.sel(x, 'link_type', NET, { redraw: true, onSet: (v) => { const n = NET.find((z) => z[0] === v); if (n && (!x.label || NET.some((z) => z[1] === x.label))) x.label = n[1]; } })}${F.text(x, 'label', { ph: 'Label' })}</div><div style="margin-top:6px">${F.text(x, 'link_url', { ph: x.link_type === 'email' ? 'mailto:hello@…' : 'https://…' })}</div>${(() => { const bi = ((E().ST.brand || {}).social_icons || {})[x.link_type], cur = x.custom_src || bi || '';
        return `<div class="kp-own"><span class="kp-own-i">${cur ? `<img src="${esc(cur)}" alt="">` : `<img src="/social/${esc(x.link_type || 'website')}-${esc(st.icon_color || 'default')}.png" alt="">`}</span>
          <span class="kp-own-t">${x.custom_src ? 'Your icon' : bi ? 'Brand kit icon' : 'Buzzin icon'}</span>
          <button type="button" class="btn xs" data-f="${bind({ t: 'act', fn: () => window.MKE_pickImage((u) => { x.custom_src = u; onChange({}); E().drawPanel(); }) })}">${I('upload')} ${x.custom_src ? 'Change' : 'Use my own'}</button>
          ${x.custom_src ? `<button type="button" class="kp-ic" title="Use the default icon" data-f="${bind({ t: 'act', fn: () => { delete x.custom_src; onChange({}); E().drawPanel(); } })}">${I('x')}</button>` : ''}</div><div class="kp-own-sz"><span>Icon size</span>${F.num(x, 'custom_size', { ph: String(Number(st.icon_px) >= 12 ? Number(st.icon_px) : ({ small: 24, medium: 32, large: 48 })[st.icon_size || def.icon_size] || 32), min: 12, max: 160, w: 96 })}</div>`; })()}`}
        <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px"><button type="button" class="kp-ic" data-f="${bind({ t: 'act', fn: () => move(x, -1) })}" title="Move up">${I('arrow-up')}</button><button type="button" class="kp-ic" data-f="${bind({ t: 'act', fn: () => move(x, 1) })}" title="Move down">${I('arrow-down')}</button><button type="button" class="kp-ic" data-f="${bind({ t: 'act', fn: () => { subs.splice(subs.indexOf(x), 1); onChange({}); E().drawPanel(); } })}" title="Remove">${I('trash')}</button></div></div>`).join('')}</div>
    ${subs.some((x) => x.custom_src) ? `<div class="kp-sec"><h4>Your icons</h4><div class="kp-hint" style="margin:0 0 8px">Save the icons you picked to your brand kit, so every email's social links use them automatically.</div>${F.btn(`${I('device-floppy')} Save to brand kit`, async () => {
      const S = E().ST, b = S.brand || {}, icons = { ...(b.social_icons || {}) }; subs.forEach((x) => { if (x.custom_src && x.link_type && x.link_type !== 'custom') icons[x.link_type] = x.custom_src; });
      try { const r = await api('/api/mk/brand/' + S.t.store, { method: 'PUT', body: JSON.stringify({ social_icons: icons }) }); S.brand = r; toast('Saved to the brand kit — new emails use these icons'); E().drawPanel(); } catch (e) { toast(e.message, 1); } })}</div>` : ''}
    <div class="kp-sec"><h4>Icons</h4><div class="kp-hint" style="margin:0 0 6px">For your own icons, use square PNGs (at least 96×96) with a transparent background.</div>${F.lab('Icon style', F.seg(st, 'icon_color', [['default', 'Color'], ['black', 'Black'], ['grey', 'Grey'], ['white', 'White']], { def: def.icon_color }))}
      ${(() => { const cur = Number(st.icon_px) >= 12 ? Number(st.icon_px) : ({ small: 24, medium: 32, large: 48 })[st.icon_size || def.icon_size] || 32;
        return F.lab(`Icon size: ${cur}px`, `<div style="display:flex;gap:8px;align-items:center"><input type="range" min="16" max="96" step="2" value="${cur}" style="flex:1" aria-label="Icon size" data-f="${bind({ t: 'num', obj: st, key: 'icon_px', redraw: true })}">${F.num(st, 'icon_px', { ph: String(cur), min: 12, max: 120, w: 84 })}</div>`, 'Every icon in this block. A link can also have its own size below its icon.'); })()}${F.lab('Alignment', F.align(st, 'icon_align', def.icon_align))}
      ${F.lab('Space between', F.num(st, 'icon_spacing', { ph: def.icon_spacing, min: 0, max: 60 }))}${F.row('Show labels', F.tog(p, 'show_labels', { redraw: true }))}${F.row('Stack on mobile', F.tog(st, 'stack_on_mobile'))}</div>
    ${p.show_labels ? `<div class="kp-sec"><h4>Labels</h4>${F.lab('Font', F.font(st, 'label_font_family'))}<div class="kp-4" style="margin-top:8px">${F.num(st, 'label_font_size', { ph: def.label_font_size, pre: 'Size' })}${F.weight(st, 'label_font_weight')}</div>${F.lab('Color', F.color(st, 'label_color', { ph: def.label_color }))}</div>` : ''}`;
  },
  product(blk, st, def, S) {
    const p = blk.data.properties = blk.data.properties || {};
    const items = p.items = p.items || [];
    const list = items.map((it, i) => { const c = it.handle ? S.pcache[it.handle] : it; return `<div class="kp-li">${c && c.image ? `<img src="${esc(c.image)}" alt="">` : '<img alt="">'}<span class="t">${esc((c && c.title) || it.handle || 'Product')}</span><button type="button" class="kp-ic" data-f="${bind({ t: 'act', fn: () => { if (i > 0) { [items[i - 1], items[i]] = [items[i], items[i - 1]]; onChange({}); E().drawPanel(); } } })}" title="Move up">${I('arrow-up')}</button><button type="button" class="kp-ic" data-f="${bind({ t: 'act', fn: () => { items.splice(i, 1); onChange({}); E().drawPanel(); } })}" title="Remove">${I('x')}</button></div>`; }).join('');
    document.getElementById('kxPanel')._after = (P) => wireProductSearch(P, blk, S);
    const fontBlock = (k, label) => `<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:600;font-size:13px">${label}</summary>${F.lab('Font', F.font(st, k + 'font_family'))}<div class="kp-4" style="margin-top:8px">${F.num(st, k + 'font_size', { ph: def[k + 'font_size'] || '', pre: 'Size' })}${F.weight(st, k + 'font_weight')}</div>${F.lab('Color', F.color(st, k + 'font_color', { ph: def[k + 'font_color'] || 'Default', noSw: true }))}</details>`;
    return `<div class="kp-sec"><h4>Products</h4>${F.seg(p, 'dynamic', [['false', 'Pick products'], ['true', 'Automatic']], { def: 'false', redraw: true, onSet: (v) => { p.dynamic = v === 'true'; } })}
      ${p.dynamic ? F.lab('Show', F.sel(p, 'feed', [['bestsellers', 'Best sellers (in stock)'], ['cart', 'What they left in their cart'], ['viewed', 'What they viewed'], ['bought', 'What they bought'], ['recommended', 'Recommended for them']], { def: 'bestsellers' }), 'Cart / viewed / bought come from the flow that sends the email; otherwise best sellers show.')
        : `<input class="kp-in" id="kpPS" placeholder="Search your products…" style="margin-top:10px"><div id="kpPR" style="margin-top:6px"></div><div class="kp-list" style="margin-top:8px">${list || '<div class="kp-li"><span class="t" style="color:var(--muted)">No products picked yet.</span></div>'}</div>`}</div>
    <div class="kp-sec"><h4>Layout</h4>${F.lab('Layout', F.sel(st, 'layout', [['horizontal', 'Grid'], ['vertical-left-image', 'List, image left'], ['vertical-right-image', 'List, image right']], { def: 'horizontal', redraw: true }))}
      <div class="kp-4" style="margin-top:8px">${(st.layout || 'horizontal') === 'horizontal' ? F.sel(st, 'num_columns', [[1, '1 per row'], [2, '2 per row'], [3, '3 per row'], [4, '4 per row']], { def: def.num_columns, num: true }) : ''}${F.sel(st, 'num_rows', [1, 2, 3, 4, 5, 6].map((n) => [n, `${n} row${n > 1 ? 's' : ''}`]), { def: def.num_rows, num: true })}</div>
      ${F.lab('Text alignment', F.align(st, 'item_text_alignment', def.item_text_alignment))}${F.row('Stack on mobile', F.tog(st, 'stack_on_mobile', { def: true }))}</div>
    <div class="kp-sec"><h4>Show</h4>${F.row('Product name', F.tog(p, 'show_title', { def: true }))}${F.row('Name links to product', F.tog(p, 'show_title_links', { def: true }))}${F.row('Price', F.tog(p, 'show_price', { def: true }))}${F.row('Original price (when on sale)', F.tog(p, 'show_original_price', { def: true }))}${F.row('Description', F.tog(p, 'show_description'))}${F.row('Button', F.tog(p, 'show_button', { def: false, redraw: true }))}
      ${p.show_button ? F.lab('Button text', F.text(p, 'button_text', { ph: 'Shop now' })) : ''}</div>
    <div class="kp-sec"><h4>Text styles</h4>${fontBlock('title_', 'Product name')}${fontBlock('price_', 'Price')}${fontBlock('original_price_', 'Original price')}${fontBlock('description_', 'Description')}</div>
    ${p.show_button ? `<div class="kp-sec"><h4>Button style</h4>${F.lab('Button color', F.color(st, 'button_background_color', { ph: def.button_background_color }))}${F.lab('Text color', F.color(st, 'button_font_color', { ph: def.button_font_color }))}<div class="kp-4" style="margin-top:8px">${F.num(st, 'button_font_size', { ph: def.button_font_size, pre: 'Size' })}${F.num(st, 'button_border_radius', { ph: def.button_border_radius, pre: 'Radius' })}</div>${F.lab('Alignment', F.align(st, 'button_alignment', 'center'))}</div>` : ''}
    <div class="kp-sec"><h4>Each product</h4>${F.lab('Padding', F.pad(st, 'item_padding', { ph: { t: 6, l: 6 } }))}${F.lab('Image max height', F.num(st, 'item_max_height', { ph: 'None', min: 40, max: 600 }))}</div>
    ${F.opt('Product border', bord(st, 'item_'), { add: () => { st.item_border_style = 'solid'; st.item_border_width = 1; st.item_border_color = '#E5E5E5'; }, remove: () => { st.item_border_width = 0; } }, () => F.border(st, 'item_'))}`;
  },
  coupon(blk, st, def) {
    const p = blk.data.properties = blk.data.properties || {};
    const o = p.offer = p.offer || { mode: /\{\{\s*coupon/.test(blk.data.content || '{{ coupon }}') ? 'unique' : 'shared', type: 'order', value_type: 'percent', value: 10, days: 7, prefix: 'WELCOME', min: 'none' };
    if (o.mode === 'unique') blk.data.content = '{{ coupon }}';
    document.getElementById('kxPanel')._after = (P) => wireOfferPickers(P, o);
    return `<div class="kp-sec"><h4>Discount</h4>${F.seg(o, 'mode', [['unique', 'Unique code per person'], ['shared', 'Same code for everyone']], { def: 'unique', redraw: true, onSet: (v) => { if (v === 'unique') blk.data.content = '{{ coupon }}'; else if (/\{\{/.test(blk.data.content || '')) blk.data.content = ''; } })}
      ${o.mode === 'shared' ? F.lab('Code', F.text(blk.data, 'content', { ph: 'WELCOME10' }), 'Type a code that already exists in Shopify.') : offerFields(o)}</div>
    <div class="kp-sec"><h4>Coupon</h4>
      ${F.row('Header text', F.tog(p, 'header_enabled', { redraw: true }))}${p.header_enabled ? F.text(p, 'header', { ph: 'Use code' }) : ''}
      ${F.lab('Link (optional)', F.text(p, 'href', { ph: 'https://larkspurbaby.com/discount/{{ coupon }}' }), 'A /discount/{{ coupon }} link puts the code in their cart automatically.')}${p.href ? '' : F.btn('Use the auto-apply link', () => { p.href = ((E().ST.brand || {}).shop_url || 'https://larkspurbaby.com').replace(/\/$/, '') + '/discount/{{ coupon }}'; E().changed({}); E().drawPanel(); })}</div>
    ${textStyleSection(st, def, 'Code text')}
    <div class="kp-sec"><h4>Box</h4>${F.lab('Background', F.color(st, 'background_color', { ph: 'None' }))}${F.lab('Corner radius', F.num(st, 'border_radius', { ph: def.border_radius, min: 0, max: 60 }))}${F.lab('Padding inside', F.pad(st, 'inner_padding', { ph: { t: def.inner_padding_top, l: def.inner_padding_left } }))}${F.lab('Alignment', F.align(st, 'text_align', 'center'))}${F.row('Full width', F.tog(st, 'stretch'))}</div>
    ${F.opt('Border', bord(st), { add: () => { st.border_style = 'dashed'; st.border_width = 2; st.border_color = def.border_color; }, remove: () => { st.border_width = 0; } }, () => F.border(st))}
    ${p.header_enabled ? `<div class="kp-sec"><h4>Header text</h4>${F.lab('Font', F.font(st, 'header_font_family'))}${F.lab('Size', F.num(st, 'header_font_size', { ph: def.header_font_size }))}${F.lab('Space below', F.num(st, 'header_padding_bottom', { ph: def.header_padding_bottom }))}</div>` : ''}`;
  },
  table(blk, st, def) {
    const p = blk.data.properties = blk.data.properties || {}; const nc = Math.max(1, Number(p.num_columns) || 2);
    const cells = blk.subblocks = (blk.subblocks || []).filter((x) => !/fallback/.test(x.type || ''));
    const rows = Math.ceil(cells.length / nc);
    const plain = (h) => String(h || '').replace(/<br\s*\/?>/g, '\n').replace(/<\/p>\s*<p[^>]*>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const grid = Array.from({ length: rows }, (_, r) => `<tr>${Array.from({ length: nc }, (_, c) => { const x = cells[r * nc + c] || (cells[r * nc + c] = { id: D.rid(), type: r === 0 && p.show_headers !== false ? 'table_header' : 'table_text', content: '' }); const o = { v: plain(x.content) };
      return `<td style="padding:2px">${x.type === 'table_image' ? `<button type="button" class="kp-ic" style="width:100%" data-f="${bind({ t: 'act', fn: () => window.MKE_pickImage((u) => { x.src = u; onChange({}); E().drawPanel(); }) })}">${I('photo')}</button>` : `<input class="kp-in" style="padding:5px 6px;font-size:12px${x.type === 'table_header' ? ';font-weight:700' : ''}" data-f="${bind({ t: 'text', obj: o, key: 'v', onSet: (v) => { x.content = x.type === 'table_header' ? esc(v || '') : `<p>${esc(v || '').replace(/\n/g, '<br>')}</p>`; } })}" value="${esc(o.v)}">`}</td>`; }).join('')}</tr>`).join('');
    const addRow = () => { for (let c = 0; c < nc; c++) cells.push({ id: D.rid(), type: 'table_text', content: '' }); onChange({}); E().drawPanel(); };
    const delRow = () => { if (rows > 1) { cells.splice((rows - 1) * nc, nc); onChange({}); E().drawPanel(); } };
    const setCols = (n) => { const old = cells.map((x) => x); const out = []; for (let r = 0; r < rows; r++) for (let c = 0; c < n; c++) out.push(c < nc ? old[r * nc + c] : { id: D.rid(), type: r === 0 && p.show_headers !== false ? 'table_header' : 'table_text', content: '' }); blk.subblocks = out; p.num_columns = n; onChange({}); E().drawPanel(); };
    return `<div class="kp-sec"><h4>Table</h4><div class="kp-hint">Type in the boxes, or click a cell on the email to type there.</div><table style="width:100%;border-collapse:collapse;margin-top:8px">${grid}</table>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${F.btn('+ Row', addRow)}${F.btn('− Row', delRow)}${F.btn('+ Column', () => setCols(Math.min(8, nc + 1)))}${F.btn('− Column', () => setCols(Math.max(1, nc - 1)))}</div>
      ${F.row('First row is a header', F.tog(p, 'show_headers', { def: true, onSet: (v) => { cells.slice(0, nc).forEach((x) => { if (x.type !== 'table_image') x.type = v ? 'table_header' : 'table_text'; }); }, redraw: true }))}</div>
    <div class="kp-sec"><h4>Table text</h4>${F.lab('Font', F.font(st, 'table_font_family'))}<div class="kp-4" style="margin-top:8px">${F.num(st, 'table_font_size', { ph: def.table_font_size, pre: 'Size' })}${F.sel(st, 'table_text_align', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], { def: 'left' })}</div>${F.lab('Text color', F.color(st, 'table_font_color', { ph: 'Default', noSw: true }))}${F.lab('Background', F.color(st, 'table_background_color', { ph: 'None', noSw: true }))}${F.lab('Cell padding', F.pad(st, 'cell_padding', { ph: { t: 8, l: 10 } }))}${F.lab('Vertical alignment', F.sel(st, 'cell_vertical_align', [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], { def: 'middle' }))}</div>
    <div class="kp-sec"><h4>Header row</h4>${F.lab('Background', F.color(st, 'header_background_color', { ph: def.header_background_color, noSw: true }))}${F.lab('Text color', F.color(st, 'header_font_color', { ph: 'Default', noSw: true }))}<div class="kp-4" style="margin-top:8px">${F.num(st, 'header_font_size', { ph: def.table_font_size, pre: 'Size' })}${F.weight(st, 'header_font_weight')}</div></div>
    <div class="kp-sec"><h4>Lines</h4>${F.lab('Between rows', F.border(st, 'cell_horizontal_'))}${F.lab('Between columns', F.border(st, 'cell_vertical_'))}</div>
    ${F.opt('Table border', bord(st, 'block_'), { add: () => { st.block_border_style = 'solid'; st.block_border_width = 1; st.block_border_color = '#E5E5E5'; }, remove: () => { st.block_border_width = 0; } }, () => F.border(st, 'block_'))}`;
  },
  review(blk, st, def) {
    const p = blk.data.properties = blk.data.properties || {};
    const LAY = [['centered-review-first', 'Centered, review first'], ['centered-rating-first', 'Centered, stars first'], ['left-aligned', 'Left aligned'], ['clean', 'Clean'], ['big-quotes', 'Big quote marks'], ['right-aligned-with-quotation-icon', 'Right aligned, quote mark'], ['stacked-card', 'Card'], ['subtle-background', 'Soft background'], ['message-bubble', 'Message bubble'], ['centered-in-quote-bubble', 'Quote bubble'], ['square', 'Square card'], ['rating-highlight', 'Stars highlighted']];
    return `<div class="kp-sec"><h4>Review</h4>${F.lab('Quote', F.area(p, 'quote', { rows: 3 }))}<div class="kp-4" style="margin-top:8px">${F.text(p, 'author', { ph: 'Name' })}${F.sel(p, 'stars', [[5, '★★★★★'], [4, '★★★★☆'], [3, '★★★☆☆']], { def: 5, num: true })}</div>
      ${F.lab('Product (optional)', F.text(p, 'product_name', { ph: 'Bamboo zip sleeper' }))}
      ${F.row('Show stars', F.tog(p, 'show_rating', { def: true }))}${F.row('Show name', F.tog(p, 'show_reviewer_name', { def: true }))}${F.row('Show product', F.tog(p, 'show_product_name'))}${F.row('Show “Verified buyer”', F.tog(p, 'show_verified_badge', { def: true }))}</div>
    <div class="kp-sec"><h4>Layout</h4>${F.sel(st, 'layout', LAY, { def: def.layout })}
      ${F.lab('Stars', `<div class="kp-4">${F.sel(st, 'star_rating_shape', [['star', '★ Stars'], ['heart', '♥ Hearts'], ['circle', '● Dots']], { def: 'star' })}${F.sel(st, 'star_size', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], { def: 'medium' })}</div>`)}
      ${F.lab('Star color', F.color(st, 'star_color', { ph: def.star_color, noSw: true }))}${F.lab('Empty star color', F.color(st, 'empty_star_color', { ph: def.empty_star_color, noSw: true }))}
      ${F.lab('Card background', F.color(st, 'text_area_bg_color', { ph: def.text_area_bg_color }))}${F.lab('Badge', F.sel(st, 'verified_badge_style', [['badge-and-text', '✓ Verified buyer'], ['text-only', 'Verified buyer'], ['badge-only', '✓']], { def: 'badge-and-text' }))}</div>
    <div class="kp-sec"><h4>Quote text</h4>${F.lab('Font', F.font(st, 'quote_font_family'))}<div class="kp-4" style="margin-top:8px">${F.num(st, 'quote_font_size', { ph: def.quote_font_size, pre: 'Size' })}${F.sel(st, 'quote_font_style', [['italic', 'Italic'], ['normal', 'Upright']], { def: 'italic' })}</div>${F.lab('Color', F.color(st, 'quote_color', { ph: 'Default', noSw: true }))}</div>
    <div class="kp-sec"><h4>Name text</h4><div class="kp-4">${F.num(st, 'author_font_size', { ph: def.author_font_size, pre: 'Size' })}${F.weight(st, 'author_font_weight')}</div>${F.lab('Color', F.color(st, 'author_color', { ph: 'Default', noSw: true }))}</div>`;
  },
  split(blk, st, def) {
    const subs = blk.subblocks = blk.subblocks || []; while (subs.length < 2) subs.push({ id: D.rid(), type: 'table_text', content: '' });
    const ws = String(st.column_widths || '50,50').match(/\d+/g) || ['50', '50']; const w = { v: Number(ws[0]) || 50 };
    const side = (x, i) => `<div style="border:1px solid #E1E3E8;border-radius:9px;padding:8px;margin-bottom:8px"><div class="kp-row" style="margin:0"><span class="l"><b>${i ? 'Right' : 'Left'}</b></span><span class="c">${F.seg(x, 'type', [['table_image', I('photo'), 'Image'], ['table_text', I('align-left'), 'Text']], { def: 'table_text', redraw: true })}</span></div>
      ${x.type === 'table_image' ? `${imgCard(x.src, '', { replace: () => window.MKE_pickImage((u) => { x.src = u; onChange({}); E().drawPanel(); }), crop: x.src ? () => cropModal(x.src, (u) => { x.src = u; onChange({}); E().drawPanel(); }) : null, remove: null })}${F.lab('Alt text', F.text(x, 'alt_text'))}${F.lab('Link', F.text(x, 'href', { ph: 'https://…' }))}${F.lab('Corner radius', F.num(x, 'border_radius', { ph: 0 }))}`
        : `<div class="kp-hint" style="margin-top:6px">Click the text on the email to type.</div>${F.lab('Alignment', F.align(x, 'cell_text_align', 'left'))}<div class="kp-4" style="margin-top:8px">${F.num(x, 'font_size', { ph: 'Style', pre: 'Size' })}<span></span></div>${F.lab('Color', F.color(x, 'color', { ph: 'Default', noSw: true }))}`}</div>`;
    return `<div class="kp-sec"><h4>Content ${F.btn(`${I('arrows-exchange')} Swap`, () => { subs.reverse(); onChange({}); E().drawPanel(); })}</h4>${side(subs[0], 0)}${side(subs[1], 1)}</div>
    <div class="kp-sec"><h4>Split settings</h4>${F.lab(`Left column width: ${w.v}%`, `<input type="range" min="20" max="80" step="5" value="${w.v}" style="width:100%" data-f="${bind({ t: 'num', obj: w, key: 'v', onSet: (v) => { st.column_widths = `${v},${100 - v}`; } })}">`)}
      ${F.lab('Space between', F.num(st, 'padding_in_between', { ph: def.padding_in_between, min: 0, max: 80 }))}
      ${F.lab('On mobile', F.sel(st, 'mobile_stack_order', [['ltr', 'Stack, left on top'], ['rtl', 'Stack, right on top'], ['no-stack', 'Keep side by side']], { def: 'ltr' }))}
      ${F.lab('Vertical alignment', F.sel(st, 'vertical_align', [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], { def: 'middle' }))}</div>`;
  },
  html(blk) {
    return `<div class="kp-sec"><h4>HTML</h4><div class="kp-banner" style="margin:0 0 10px">Emails imported from Klaviyo as plain HTML come in as one of these. <b>Rebuild with blocks</b> turns it into normal blocks you can click and edit.</div>
      ${F.btn(`${I('sparkles')} Rebuild with blocks`, () => rebuildHtml(blk), 'pri')}
      ${F.lab('Code', F.area(blk.data, 'content', { rows: 16, mono: true }), '<code>{{ first_name }}</code>, <code>{{ unsubscribe_url }}</code> and other tags still work.')}
      <div style="margin-top:8px">${F.btn('Open big editor', () => htmlModal(blk.data.content || '', (h) => { blk.data.content = h; onChange({}); E().drawPanel(); }))}</div></div>`;
  },
  countdown(blk, st, def) {
    const p = blk.data.properties = blk.data.properties || {};
    return `<div class="kp-sec"><h4>Countdown</h4>${F.lab('Ends', `<input type="datetime-local" class="kp-in" data-f="${bind({ t: 'text', obj: p, key: 'until' })}" value="${esc(p.until || '')}">`)}${F.lab('Text before the days', F.text(p, 'label', { ph: 'Ends in' }))}${F.lab('On the last day', F.text(p, 'last_day', { ph: 'Last day!' }))}${F.lab('After it ends', F.text(p, 'ended', { ph: '(hide)' }), 'Shows the days left at the moment the email is sent.')}</div>${textStyleSection(st, def)}<div class="kp-sec">${F.lab('Alignment', F.align(st, 'text_align', 'center'))}</div>`;
  },
};

/* ---------- panel helpers ---------- */
function colWidth(info) {
  const S = E().ST; const W = Number((S.doc.body.styles || {}).width) || 600;
  const sec = info && info.section; if (!sec) return W;
  const sst = (sec.data && sec.data.styles) || {}; const row = info.row; const cols = row.columns; const pcts = D.layoutPcts(row.data && row.data.styles && row.data.styles.column_layout, cols.length);
  const pct = pcts[cols.indexOf(info.column)] || 100;
  const st = Object.assign({}, D.blockDefaults(info.node.type, S.brand), info.node.data.styles || {});
  const inner = W - (Number(sst.inner_padding_left) || 0) - (Number(sst.inner_padding_right) || 0);
  return Math.max(20, Math.floor(inner * pct / 100) - (Number(st.block_padding_left) || 0) - (Number(st.block_padding_right) || 0) - (Number(st.inner_padding_left) || 0) - (Number(st.inner_padding_right) || 0));
}
function imgCard(src, meta, acts) {
  return `<div class="kp-imgcard"><div class="pv">${src ? `<img src="${esc(src)}" alt="">` : `<span style="color:var(--muted);font-size:13px">No image yet</span>`}</div>${meta ? `<div class="meta">${esc(meta)}</div>` : ''}
    <div class="acts" style="margin-top:8px">${acts.crop ? F.btn('Crop', acts.crop) : ''}${F.btn(src ? 'Replace' : 'Choose image', acts.replace, src ? '' : 'pri')}${acts.remove ? `<button type="button" class="kp-ic" title="Remove" data-f="${bind({ t: 'act', fn: acts.remove })}">${I('trash')}</button>` : ''}</div></div>`;
}

/* Coupon block: what the code does, like Shopify's "Create discount" (4 types). Buzzin creates each person's code in Shopify. */
function offerFields(o) {
  const T = o.type || 'order';
  const items = (key, appliesKey, label) => `${F.lab(label, F.sel(o, appliesKey, [['collections', 'Specific collections'], ['products', 'Specific products']], { def: 'collections', redraw: true }))}
    <div class="kp-chips">${(o[key] || []).map((x, i) => `<span class="kp-chip">${esc(x.title)}<button type="button" data-oxrm="${key}:${i}" aria-label="Remove">×</button></span>`).join('')}</div>
    <input class="kp-in" data-ops="${key}" data-kind="${o[appliesKey] === 'products' ? 'products' : 'collections'}" placeholder="Search ${o[appliesKey] === 'products' ? 'products' : 'collections'}…" style="margin-top:6px"><div data-opr="${key}"></div>`;
  const val = () => `<div class="kp-2">${F.sel(o, 'value_type', [['percent', 'Percentage'], ['amount', 'Fixed amount']], { def: 'percent', redraw: true })}${F.num(o, 'value', { ph: '10', pre: o.value_type === 'amount' ? '$' : '%', min: 0 })}</div>`;
  const minimum = () => `${F.lab('Minimum purchase', F.sel(o, 'min', [['none', 'No minimum'], ['amount', 'Minimum purchase amount ($)'], ['qty', 'Minimum quantity of items']], { def: 'none', redraw: true }))}${o.min && o.min !== 'none' ? F.num(o, 'min_value', { pre: o.min === 'amount' ? '$' : 'Items', min: 0 }) : ''}`;
  let body = '';
  if (T === 'order') body = F.lab('Discount value', val()) + minimum();
  if (T === 'products') body = F.lab('Discount value', val()) + items('items', 'applies', 'Applies to') + minimum();
  if (T === 'bxgy') body = `<label class="kp-lab">Customer buys</label>${F.seg(o, 'buy_mode', [['qty', 'Minimum quantity'], ['amount', 'Minimum amount']], { def: 'qty', redraw: true })}
      <div style="margin-top:6px">${o.buy_mode === 'amount' ? F.num(o, 'buy_amount', { pre: '$', min: 0 }) : F.num(o, 'buy_qty', { pre: 'Quantity', min: 1 })}</div>${items('buy_items', 'buy_applies', 'Any items from')}
    <label class="kp-lab" style="margin-top:12px">Customer gets</label>${F.num(o, 'get_qty', { pre: 'Quantity', min: 1 })}${items('get_items', 'get_applies', 'Any items from')}
    ${F.lab('At a discounted value', F.seg(o, 'get_effect', [['percent', 'Percentage'], ['amount', 'Amount off each'], ['free', 'Free']], { def: 'free', redraw: true }))}${o.get_effect === 'percent' ? F.num(o, 'get_percent', { pre: '%', min: 1 }) : o.get_effect === 'amount' ? F.num(o, 'get_amount', { pre: '$', min: 0 }) : ''}
    ${F.lab('Maximum uses per order', F.num(o, 'max_per_order', { ph: 'No limit', min: 0 }))}`;
  if (T === 'shipping') body = `${F.lab('Countries', F.seg(o, 'ship_where', [['all', 'All countries'], ['some', 'Selected countries']], { def: 'all', redraw: true, onSet: (v) => { if (v === 'all') o.countries = []; else if (!(o.countries || []).length) o.countries = ['US']; } }))}
      ${o.ship_where === 'some' ? F.lab('Country codes', `<input class="kp-in" data-occ value="${esc((o.countries || []).join(', '))}" placeholder="US, CA">`) : ''}
      ${F.lab('Exclude shipping rates over', F.num(o, 'max_ship', { pre: '$', ph: 'No limit', min: 0 }))}${minimum()}`;
  return `${F.lab('Type', F.sel(o, 'type', [['order', 'Amount off order'], ['products', 'Amount off products'], ['bxgy', 'Buy X get Y'], ['shipping', 'Free shipping']], { def: 'order', redraw: true }))}${body}
    <label class="kp-lab">Combinations</label>${F.row('Product discounts', F.tog(o, 'combine_product'))}${F.row('Order discounts', F.tog(o, 'combine_order'))}${F.row('Shipping discounts', F.tog(o, 'combine_shipping'))}
    <div class="kp-2" style="margin-top:8px">${F.num(o, 'days', { pre: 'Valid', min: 1, max: 365, ph: '7' })}${F.text(o, 'prefix', { ph: 'WELCOME' })}</div>
    <div class="kp-hint">Each person gets their own single-use code (one use, one per customer), ready the moment it's sent. Valid days · code prefix.</div>`;
}
function wireOfferPickers(P, o) {
  P.querySelectorAll('[data-oxrm]').forEach((b) => b.onclick = () => { const [k, i] = b.dataset.oxrm.split(':'); o[k].splice(Number(i), 1); E().changed({}); E().drawPanel(); });
  const cc = P.querySelector('[data-occ]'); if (cc) cc.onchange = () => { o.countries = cc.value.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)); E().changed({}); };
  P.querySelectorAll('[data-ops]').forEach((inp) => { const key = inp.dataset.ops, out = P.querySelector(`[data-opr="${key}"]`); let t;
    inp.oninput = () => { clearTimeout(t); const q = inp.value.trim(); t = setTimeout(async () => {
      const r = await api('/api/mk/shopify-items?' + qs({ store: E().ST.t.store, kind: inp.dataset.kind, q })).catch((e) => ({ items: [], error: e.message }));
      out.innerHTML = r.error ? `<div class="kp-hint">${esc(r.error)}</div>` : `<div class="kp-list">${r.items.slice(0, 8).map((x) => `<div class="kp-li" style="cursor:pointer" data-oid="${esc(x.id)}"><span class="t">${esc(x.title)}</span>${I('plus')}</div>`).join('') || '<div class="kp-hint">Nothing found.</div>'}</div>`;
      out.querySelectorAll('[data-oid]').forEach((el) => el.onclick = () => { const x = r.items.find((y) => y.id === el.dataset.oid); o[key] = o[key] || []; if (!o[key].some((y) => y.id === x.id)) o[key].push(x); E().changed({}); E().drawPanel(); });
    }, 250); };
    inp.onfocus = () => { if (!inp.value) inp.oninput(); }; });
}
function wireProductSearch(P, blk, S) {
  const inp = P.querySelector('#kpPS'), out = P.querySelector('#kpPR'); if (!inp) return;
  let t; inp.oninput = () => { clearTimeout(t); const q = inp.value.trim(); if (!q) { out.innerHTML = ''; return; } t = setTimeout(async () => {
    const r = await api('/api/mk/products?' + qs({ store: S.t.store, q })).catch(() => ({ products: [] }));
    if (r.loaded === false) { out.innerHTML = '<div class="kp-hint">The product list hasn’t loaded yet.</div>'; return; }
    out.innerHTML = `<div class="kp-list">${r.products.slice(0, 8).map((p) => `<div class="kp-li" style="cursor:pointer" data-h="${esc(p.handle)}">${p.image ? `<img src="${esc(p.image)}" alt="">` : '<img alt="">'}<span class="t">${esc(p.title)}${p.available ? '' : ' · sold out'}</span>${I('plus')}</div>`).join('') || '<div class="kp-li"><span class="t">No matches</span></div>'}</div>`;
    out.querySelectorAll('[data-h]').forEach((el) => el.onclick = () => { const p = r.products.find((x) => x.handle === el.dataset.h); S.pcache[p.handle] = p; const items = blk.data.properties.items = blk.data.properties.items || []; if (!items.some((x) => x.handle === p.handle)) items.push({ handle: p.handle }); const st = blk.data.styles; const per = Number(st.num_columns) || 3; if (items.length > per * (Number(st.num_rows) || 1)) st.num_rows = Math.ceil(items.length / per); onChange({}); E().drawPanel(); });
  }, 250); };
}
async function rebuildHtml(blk) {
  const S = E().ST; toast('Emily is rebuilding it as blocks… (up to a minute)');
  try {
    const r = await api('/api/mk/templates/convert-html', { method: 'POST', body: JSON.stringify({ store: S.t.store, html: blk.data.content || '' }) });
    const doc = D.fromBlocks(r.blocks || [], S.brand); const info = D.find(S.doc, blk.id); if (!info) return;
    const secs = S.doc.body.sections; const at = secs.indexOf(info.section);
    if (info.section.rows.length === 1 && info.section.rows[0].columns.length === 1 && info.section.rows[0].columns[0].blocks.length === 1) secs.splice(at, 1, ...doc.body.sections);
    else { info.list.splice(info.index, 1); secs.splice(at + 1, 0, ...doc.body.sections); }
    S.sel = null; S.panel = 'add'; onChange({}); E().drawPanel(); toast(`Rebuilt as ${doc.body.sections.length} sections — check it over, then Save. Undo brings the HTML back.`);
  } catch (e) { toast(e.message, 1); }
}

/* ---------- images: pick, set, crop, video thumbnails ---------- */
function modal(title, inner, wide) {
  const m = document.createElement('div'); m.className = 'kx-modal'; m.innerHTML = `<div class="kx-mbox" style="${wide ? '' : 'width:min(760px,94vw)'}"><div class="kx-mhd"><b>${esc(title)}</b><button class="btn xs" data-x>${I('x')}</button></div><div class="kx-mbd">${inner}</div></div>`;
  document.body.appendChild(m); const close = () => m.remove(); m.querySelector('[data-x]').onclick = close; m.addEventListener('mousedown', (e) => { if (e.target === m) close(); });
  return { m, close };
}
window.MKE_pickImage = function pickImage(cb) {
  const S = E().ST;
  const { m, close } = modal('Choose an image', `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px"><label class="btn pri">${I('upload')} Upload<input type="file" accept="image/*" hidden id="kmUp"></label>
    <span style="color:var(--muted)">or</span><input class="kp-in" id="kmUrl" placeholder="Paste an image address (https://…)" style="flex:1;min-width:220px"><button class="btn" id="kmUse">Use address</button></div>
    <div class="kp-hint" style="margin-bottom:10px">JPG, PNG or GIF. Wider than 1200px is plenty — big files load slowly in email.</div><b style="font-size:13px">Image library</b><div class="kx-libgrid" id="kmLib" style="margin-top:8px"><div class="empty">Loading…</div></div>`);
  const pick = (u) => { close(); cb(u); };
  m.querySelector('#kmUp').onchange = async (e) => { const file = e.target.files[0]; if (!file) return; try { toast('Uploading…'); pick(await uploadImage(file, file.name)); } catch (err) { toast(err.message, 1); } };
  m.querySelector('#kmUse').onclick = () => { const u = m.querySelector('#kmUrl').value.trim(); if (/^https?:\/\//.test(u)) pick(u); else toast('That doesn’t look like an image address', 1); };
  api('/api/mk/images?' + qs({ store: S.t.store })).then(({ images }) => { const g = m.querySelector('#kmLib'); g.innerHTML = images.map((i) => `<button data-u="${esc(i.url)}" title="${esc(i.name || '')}"><img src="${esc(i.url)}" alt=""></button>`).join('') || '<span style="color:var(--muted)">No images yet — upload one.</span>'; g.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => pick(location.origin + b.dataset.u.replace(location.origin, ''))); }).catch(() => {});
};
async function uploadImage(blob, name) {
  const S = E().ST;
  const r = await fetch(`/api/mk/images?store=${S.t.store || ''}&name=${encodeURIComponent(name || 'image.png')}`, { method: 'POST', headers: { 'Content-Type': blob.type || 'image/png', Authorization: 'Bearer ' + KEY }, body: blob });
  const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Upload failed');
  return j.url.startsWith('/') ? location.origin + j.url : j.url;
}
window.MKE_setImage = function setImage(blk, url, keepSize) {
  const p = blk.data.properties = blk.data.properties || {}; p.src = url;
  const im = new Image(); im.onload = () => { p.natural_w = im.naturalWidth; p.natural_h = im.naturalHeight; if (!keepSize && !blk.data.styles.width && !blk.data.styles.fill_column) { const info = D.find(E().ST.doc, blk.id); const cw = colWidth(info); if (im.naturalWidth >= cw) blk.data.styles.fill_column = true; else blk.data.styles.width = im.naturalWidth; } onChange({}); E().drawPanel(); };
  im.onerror = () => { onChange({}); E().drawPanel(); }; im.src = url;
  onChange({}); E().drawPanel();
};
async function loadForCanvas(src) {
  const r = await fetch('/api/mk/img-proxy?u=' + encodeURIComponent(src), { headers: { Authorization: 'Bearer ' + KEY } });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || 'Could not load that image'); }
  const url = URL.createObjectURL(await r.blob()); const im = new Image(); await new Promise((ok, bad) => { im.onload = ok; im.onerror = () => bad(new Error('Could not read that image')); im.src = url; }); return im;
}
function cropModal(src, cb) {
  const { m, close } = modal('Crop image', `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px" id="kcAsp">${[['free', 'Free'], ['1', '1:1'], ['1.3333', '4:3'], ['1.7778', '16:9'], ['0.75', '3:4'], ['0.8', '4:5'], ['2', '2:1']].map(([v, l]) => `<button class="btn xs${v === 'free' ? ' pri' : ''}" data-a="${v}">${l}</button>`).join('')}</div>
    <div style="text-align:center"><div class="kx-crop" id="kcWrap"><div class="empty">Loading…</div></div></div><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn" data-x2>Cancel</button><button class="btn pri" id="kcGo">Apply crop</button></div>`, true);
  m.querySelector('[data-x2]').onclick = close;
  let img, box = { x: 0.05, y: 0.05, w: 0.9, h: 0.9 }, asp = null;
  loadForCanvas(src).then((im) => {
    img = im; const wrap = m.querySelector('#kcWrap'); wrap.innerHTML = ''; const show = document.createElement('img'); show.src = im.src; wrap.appendChild(show);
    const b = document.createElement('div'); b.className = 'box'; b.innerHTML = '<div class="h"></div>'; wrap.appendChild(b);
    const draw = () => Object.assign(b.style, { left: box.x * 100 + '%', top: box.y * 100 + '%', width: box.w * 100 + '%', height: box.h * 100 + '%' });
    const fit = () => { if (!asp) return; const W = show.clientWidth, H = show.clientHeight; let w = box.w * W, h = w / asp; if (h > H * (1 - box.y)) { h = H * (1 - box.y); w = h * asp; } box.w = w / W; box.h = h / H; if (box.x + box.w > 1) box.x = 1 - box.w; };
    draw();
    const drag = (e, mode) => { e.preventDefault(); e.stopPropagation(); const W = show.clientWidth, H = show.clientHeight, x0 = e.clientX, y0 = e.clientY, b0 = { ...box };
      const mv = (ev) => { const dx = (ev.clientX - x0) / W, dy = (ev.clientY - y0) / H;
        if (mode === 'move') { box.x = Math.min(1 - box.w, Math.max(0, b0.x + dx)); box.y = Math.min(1 - box.h, Math.max(0, b0.y + dy)); }
        else { box.w = Math.min(1 - box.x, Math.max(0.05, b0.w + dx)); box.h = asp ? (box.w * W / asp) / H : Math.min(1 - box.y, Math.max(0.05, b0.h + dy)); if (box.y + box.h > 1) { box.h = 1 - box.y; if (asp) box.w = (box.h * H * asp) / W; } }
        draw(); };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); };
    b.addEventListener('pointerdown', (e) => drag(e, 'move')); b.querySelector('.h').addEventListener('pointerdown', (e) => drag(e, 'size'));
    m.querySelectorAll('#kcAsp [data-a]').forEach((x) => x.onclick = () => { m.querySelectorAll('#kcAsp [data-a]').forEach((y) => y.classList.toggle('pri', y === x)); asp = x.dataset.a === 'free' ? null : Number(x.dataset.a); fit(); draw(); });
  }).catch((e) => { m.querySelector('#kcWrap').innerHTML = `<div class="note">${esc(e.message)}</div>`; });
  m.querySelector('#kcGo').onclick = async () => {
    if (!img) return; const c = document.createElement('canvas'); const sx = box.x * img.naturalWidth, sy = box.y * img.naturalHeight, sw = box.w * img.naturalWidth, sh = box.h * img.naturalHeight;
    const scale = Math.min(1, 1600 / sw); c.width = Math.round(sw * scale); c.height = Math.round(sh * scale); c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    const type = /\.png(\?|$)/i.test(src) ? 'image/png' : 'image/jpeg';
    c.toBlob(async (blob) => { try { toast('Saving crop…'); const u = await uploadImage(blob, 'cropped.' + (type === 'image/png' ? 'png' : 'jpg')); close(); cb(u); } catch (e) { toast(e.message, 1); } }, type, 0.9);
  };
}
let thumbT = null;
function scheduleThumb(blk) { clearTimeout(thumbT); thumbT = setTimeout(() => makeThumb(blk), 900); }
/** Video blocks show a still with a play button baked in (email can't overlay one reliably), like Klaviyo. */
async function makeThumb(blk) {
  const p = blk.data.properties; const raw = p.raw_src || D.youtubeThumb(p.href);
  if (!raw) { p.src = ''; onChange({}); E().drawPanel(); return; }
  if (p.overlay_toggle === false) { p.src = raw; onChange({}); E().drawPanel(); return; }
  try {
    const im = await loadForCanvas(raw); const c = document.createElement('canvas'); const w = Math.min(1200, im.naturalWidth), h = Math.round(w * im.naturalHeight / im.naturalWidth); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0, w, h); const r = Math.max(28, Math.round(w * 0.08)); g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(w / 2, h / 2, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(w / 2 - r * 0.32, h / 2 - r * 0.45); g.lineTo(w / 2 - r * 0.32, h / 2 + r * 0.45); g.lineTo(w / 2 + r * 0.5, h / 2); g.closePath(); g.fill();
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.88)); p.src = await uploadImage(blob, 'video-thumb.jpg'); onChange({}); E().drawPanel();
  } catch (e) { p.src = raw; onChange({}); E().drawPanel(); toast('Play button not added: ' + e.message, 1); }
}

/* ---------- HTML editor + preview ---------- */
function htmlModal(html, cb) {
  const { m, close } = modal('Edit HTML', `<textarea class="kp-in mono" id="khT" rows="24" style="width:100%">${esc(html)}</textarea><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" data-x2>Cancel</button><button class="btn pri" id="khGo">Apply</button></div>`, true);
  m.querySelector('[data-x2]').onclick = close; m.querySelector('#khGo').onclick = () => { cb(m.querySelector('#khT').value); close(); };
}
window.MKE_preview = async function preview() {
  const S = E().ST; E().stopEdit();
  const { m } = modal('Preview', `<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><div class="seg" id="kpvD"><button class="on" data-d="desk">${I('device-desktop')} Desktop</button><button data-d="mob">${I('device-mobile')} Mobile</button></div><span class="sp"></span><span style="color:var(--muted);font-size:12px">Filled in for a sample person (Maria). Subject: <b id="kpvS"></b></span></div><div style="display:flex;justify-content:center;background:#ECEAE5;border-radius:10px;padding:14px"><iframe id="kpvF" title="Preview" style="border:0;background:#fff;width:680px;max-width:100%;height:68vh;border-radius:8px"></iframe></div>`, true);
  try { const r = await api('/api/mk/templates/render', { method: 'POST', body: JSON.stringify({ store: S.t.store, subject: document.getElementById('kxSubj').value, preview: document.getElementById('kxPre').value, doc: S.doc }) });
    m.querySelector('#kpvF').srcdoc = r.html; m.querySelector('#kpvS').textContent = r.subject || '(no subject)';
    m.querySelectorAll('#kpvD button').forEach((b) => b.onclick = () => { m.querySelectorAll('#kpvD button').forEach((x) => x.classList.toggle('on', x === b)); m.querySelector('#kpvF').style.width = b.dataset.d === 'mob' ? '390px' : '680px'; });
  } catch (e) { toast(e.message, 1); }
};
})();
