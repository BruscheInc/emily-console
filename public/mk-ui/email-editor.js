/* Buzzin Marketing · email editor, laid out like Klaviyo's: Add content / Styles on the left, the email in the middle,
 * click a block to edit it (Styles + Display tabs), drag blocks and sections around, type straight onto the email. */
(() => {
const D = window.MKDoc;
const ICON = (n) => `<i class="ti ti-${n}"></i>`;
let ST = null;           // the open email
let DRAG = null;         // what's being dragged
let KEYH = null;

/* ---------- open ---------- */
async function editTemplate(el, id) {
  const [t, brand] = await Promise.all([api('/api/mk/templates/' + id), null]);
  const b = await api('/api/mk/brand/' + (t.store || 'lb')).catch(() => ({}));
  b.logo_abs = b.logo && b.logo.startsWith('/') ? location.origin + b.logo : b.logo || '';
  let doc = t.doc && typeof t.doc === 'object' && t.doc.body ? t.doc : D.fromBlocks(t.blocks || [], b);
  D.STYLE_TYPES.forEach((x) => D.ensureStyle(doc, x));
  ST = { t, doc, brand: b, sel: null, panel: 'add', addTab: 'blocks', tab: 'styles', dev: 'desk', dirty: !t.doc, hist: [JSON.stringify(doc)], hi: 0, editing: null, pcache: {}, feed: null, univ: new Set(), collapsed: false, frameReady: false };
  el.style.padding = '0';
  el.innerHTML = `<style>${EDITOR_CSS}</style>
  <div class="kx">
    <div class="kx-top">
      <a href="#templates" class="kx-ib" title="Back to templates">${ICON('arrow-left')}</a>
      <input id="kxName" class="kx-name" value="${esc(t.name || '')}" aria-label="Email name">
      <span class="pill off">${t.store === 'lbo' ? 'Outlet' : 'Larkspur Baby'}</span>
      <span class="sp"></span>
      <span class="pill hon ${ST.dirty ? '' : 'hidden'}" id="kxDirty">Unsaved</span>
      <button class="btn" id="kxPrev">${ICON('eye')} Preview</button>
      <button class="btn" id="kxTest">${ICON('send')} Send test</button>
      <button class="btn" id="kxCopy">${ICON('copy')} Duplicate</button>
      <button class="btn pri" id="kxSave">Save</button>
    </div>
    <div class="kx-sub">
      <label for="kxSubj">Subject</label><input id="kxSubj" value="${esc(t.subject || '')}" placeholder="What shows in the inbox">
      <button class="btn xs" id="kxAiSub">${ICON('sparkles')} Ask Emily</button>
      <label for="kxPre">Preview text</label><input id="kxPre" value="${esc(t.preview || '')}" placeholder="The grey line after the subject">
    </div>
    <div class="kx-body">
      <div class="kx-rail">
        <button id="kxRailAdd" class="on" title="Add content">${ICON('circle-plus')}</button>
        <button id="kxRailStyles" title="Email styles">${ICON('palette')}</button>
      </div>
      <div class="kx-panel" id="kxPanel"></div>
      <div class="kx-canvas">
        <div class="kx-ctool">
          <button id="kxUndo" title="Undo (Cmd+Z)">${ICON('arrow-back-up')}</button><button id="kxRedo" title="Redo (Shift+Cmd+Z)">${ICON('arrow-forward-up')}</button>
          <span class="kx-sep"></span>
          <button id="kxDesk" class="on" title="Desktop">${ICON('device-desktop')}</button><button id="kxMob" title="Mobile">${ICON('device-mobile')}</button>
        </div>
        <div class="kx-stage" id="kxStage"><iframe id="kxF" title="Email" class="kx-frame"></iframe></div>
      </div>
    </div>
  </div>`;
  $('kxName').oninput = () => markDirty(); $('kxSubj').oninput = () => markDirty(); $('kxPre').oninput = () => markDirty();
  $('kxSave').onclick = save; $('kxUndo').onclick = () => undo(-1); $('kxRedo').onclick = () => undo(1);
  $('kxDesk').onclick = () => setDev('desk'); $('kxMob').onclick = () => setDev('mob');
  $('kxRailAdd').onclick = () => { stopEdit(); ST.sel = null; ST.panel = 'add'; drawPanel(); decorate(); };
  $('kxRailStyles').onclick = () => { stopEdit(); ST.sel = null; ST.panel = 'styles'; drawPanel(); decorate(); };
  $('kxPrev').onclick = () => previewModal();
  $('kxTest').onclick = sendTest;
  $('kxCopy').onclick = async () => { try { if (ST.dirty) await save(); const n = await api('/api/mk/templates', { method: 'POST', body: JSON.stringify({ store: ST.t.store, copy_of: ST.t.id }) }); location.hash = '#templates/' + n.id; } catch (e) { toast(e.message, 1); } };
  $('kxAiSub').onclick = () => window.MK_aiPick('subject', `Email: ${$('kxName').value}. Current subject: ${$('kxSubj').value}`, (o) => { $('kxSubj').value = o.subject || ''; if (o.preview) $('kxPre').value = o.preview; markDirty(); });
  if (KEYH) document.removeEventListener('keydown', KEYH);
  KEYH = (e) => keys(e, document); document.addEventListener('keydown', KEYH);
  window.onbeforeunload = () => (ST && ST.dirty ? 'You have unsaved changes' : undefined);
  setupFrame(); drawPanel(); drawUndo();
  loadProducts();
}
window.MK_editTemplate = editTemplate;

/* ---------- the email canvas ---------- */
function frameDoc() { const f = $('kxF'); return f && f.contentDocument; }
function setupFrame() {
  const d = frameDoc(); if (!d) return;
  d.open(); d.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style id="bzh"></style><style>${FRAME_CSS}</style></head><body><div id="bzr"></div><div id="bzo"></div></body></html>`); d.close();
  ST.frameReady = true;
  d.addEventListener('click', onFrameClick, true);
  d.addEventListener('dblclick', onFrameDbl, true);
  d.addEventListener('dragover', onDragOver); d.addEventListener('drop', onDrop); d.addEventListener('dragleave', (e) => { if (!e.relatedTarget) hideDrop(); });
  d.addEventListener('keydown', (e) => keys(e, d));
  d.addEventListener('scroll', () => decorate(true));
  d.defaultView.addEventListener('resize', () => { decorate(true); positionFormatBar(); });
  d.addEventListener('input', onFrameInput);
  d.addEventListener('paste', onPaste);
  draw();
}
function env() {
  return {
    brand: ST.brand, editor: true, assetBase: location.origin,
    products: (blk) => { const p = (blk.data && blk.data.properties) || {}; const st = (blk.data && blk.data.styles) || {}; const want = Math.max(1, (Number(st.num_columns) || 3) * (Number(st.num_rows) || 1));
      if (!p.dynamic) return (p.items || []).map((it) => (it.handle ? ST.pcache[it.handle] && { ...ST.pcache[it.handle], button_text: it.button_text } : it)).filter(Boolean);
      return (ST.feed || []).slice(0, want); },
  };
}
let drawT = null;
function draw(soon) {
  if (soon) { clearTimeout(drawT); drawT = setTimeout(() => draw(), 60); return; }
  const d = frameDoc(); if (!d || !d.getElementById('bzr')) return;
  if (ST.editing) return;                    // don't re-render under the cursor while typing
  let out; try { out = D.render(ST.doc, env()); } catch (e) { console.error(e); toast('Could not draw the email: ' + e.message, 1); return; }
  d.getElementById('bzh').textContent = out.head;
  d.body.style.background = out.background;
  d.body.classList.toggle('bz-dev-mob', ST.dev === 'mob'); d.body.classList.toggle('bz-dev-desk', ST.dev !== 'mob');
  d.getElementById('bzr').innerHTML = out.body;
  d.querySelectorAll('img').forEach((im) => { if (!im.complete) im.addEventListener('load', () => decorate(true), { once: true }); });
  decorate();
}
function setDev(dv) {
  ST.dev = dv; $('kxDesk').classList.toggle('on', dv === 'desk'); $('kxMob').classList.toggle('on', dv === 'mob');
  $('kxF').classList.toggle('mob', dv === 'mob');
  const fd = frameDoc(); if (fd && fd.body) { fd.body.classList.toggle('bz-dev-mob', dv === 'mob'); fd.body.classList.toggle('bz-dev-desk', dv !== 'mob'); }
  setTimeout(() => decorate(), 50);
}

/* selection outline, name tag, side toolbar, image resize handles */
function decorate(quick) {
  const d = frameDoc(); if (!d) return; const o = d.getElementById('bzo'); if (!o) return;
  o.innerHTML = '';
  d.querySelectorAll('.bz-sel').forEach((x) => x.classList.remove('bz-sel'));
  if (!ST.sel) return;
  const sel = ST.sel;
  const el = sel.kind === 'block' ? d.querySelector(`[data-bid="${CSS.escape(sel.id)}"]`) : sel.kind === 'section' ? d.querySelector(`[data-sid="${CSS.escape(sel.id)}"]`) : null;
  if (!el) return;
  el.classList.add('bz-sel');
  const sx = d.scrollingElement.scrollLeft, sy = d.scrollingElement.scrollTop;
  const r = el.getBoundingClientRect(); const top = r.top + sy, left = r.left + sx;
  const box = d.createElement('div'); box.className = 'bzo-box' + (sel.kind === 'section' ? ' sec' : ''); Object.assign(box.style, { left: left + 'px', top: top + 'px', width: r.width + 'px', height: r.height + 'px' }); o.appendChild(box);
  const info = sel.kind === 'block' ? D.find(ST.doc, sel.id) : D.find(ST.doc, sel.id);
  if (!info) return;
  const name = sel.kind === 'section' ? 'Section' : (D.BLOCK_INFO[info.node.type] || {}).name || info.node.type;
  const tag = d.createElement('div'); tag.className = 'bzo-tag' + (sel.kind === 'section' ? ' sec' : ''); tag.textContent = name + (info.node.universal_id ? ' · Universal' : ''); Object.assign(tag.style, { left: left + 'px', top: (top - 20) + 'px' }); o.appendChild(tag);
  const tb = d.createElement('div'); tb.className = 'bzo-tools';
  const canAI = sel.kind === 'block' && ['text', 'button', 'image'].includes(info.node.type);
  tb.innerHTML = `<button data-a="move" draggable="true" title="Drag to move">${SVG.move}</button>${sel.kind === 'section' ? `<button data-a="up" title="Move up">${SVG.up}</button><button data-a="down" title="Move down">${SVG.down}</button>` : ''}<button data-a="dup" title="Duplicate">${SVG.copy}</button><button data-a="save" title="Save as universal content">${SVG.star}</button>${canAI ? `<button data-a="ai" title="Ask Emily">${SVG.spark}</button>` : ''}<button data-a="note" title="Comment">${SVG.note}</button><button data-a="del" title="Delete">${SVG.trash}</button>`;
  o.appendChild(tb);
  const tbx = left - tb.offsetWidth - 8 >= 0 ? left - tb.offsetWidth - 8 : left + r.width - tb.offsetWidth - 6;
  Object.assign(tb.style, { left: tbx + 'px', top: top + 'px' });
  tb.addEventListener('mousedown', (e) => e.preventDefault());
  tb.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; e.preventDefault(); e.stopPropagation(); toolAction(b.dataset.a, sel); });
  const mv = tb.querySelector('[data-a="move"]');
  mv.addEventListener('dragstart', (e) => { DRAG = { kind: sel.kind === 'section' ? 'move-section' : 'move', id: sel.id }; e.dataTransfer.setData('text/plain', 'bz'); e.dataTransfer.effectAllowed = 'move'; });
  mv.addEventListener('dragend', () => { DRAG = null; hideDrop(); });
  if (info.node.note) { const n = d.createElement('div'); n.className = 'bzo-note'; n.textContent = '💬 ' + info.node.note; Object.assign(n.style, { left: (left + r.width + 8) + 'px', top: top + 'px' }); o.appendChild(n); }
  // image / video: drag the side handles to resize
  if (sel.kind === 'block' && ['image', 'video'].includes(info.node.type)) {
    const img = el.querySelector('img');
    if (img) { const ir = img.getBoundingClientRect();
      ['l', 'r'].forEach((side) => { const h = d.createElement('div'); h.className = 'bzo-handle'; Object.assign(h.style, { left: (side === 'l' ? ir.left : ir.right) + sx - 5 + 'px', top: ir.top + sy + ir.height / 2 - 12 + 'px' }); h.title = 'Drag to resize'; o.appendChild(h);
        h.addEventListener('pointerdown', (e) => startResize(e, info.node, img, side)); }); }
  }
  if (!quick) { const vh = d.defaultView.innerHeight; if (r.top < 0 || r.top > vh - 40) d.scrollingElement.scrollTo({ top: Math.max(0, top - 80), behavior: 'smooth' }); }
}
function startResize(e, blk, img, side) {
  e.preventDefault(); const d = frameDoc(); const x0 = e.clientX, w0 = img.getBoundingClientRect().width; const st = blk.data.styles;
  const col = img.closest('.bz-col') || img.closest('.bz-sec'); const maxW = col ? col.getBoundingClientRect().width : 600;
  const move = (ev) => { const dx = (ev.clientX - x0) * (side === 'l' ? -1 : 1) * ((st.align || 'center') === 'center' ? 2 : 1); const w = Math.round(Math.max(30, Math.min(maxW, w0 + dx))); st.width = w; st.fill_column = false; img.style.width = w + 'px'; img.setAttribute('width', w); };
  const up = () => { d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', up); changed(); drawPanel(); };
  d.addEventListener('pointermove', move); d.addEventListener('pointerup', up);
}
function toolAction(a, sel) {
  const info = D.find(ST.doc, sel.id); if (!info) return;
  if (a === 'del') return removeNode(sel);
  if (a === 'dup') { const c = D.reId(info.node); delete c.universal_id; if (info.node.universal_id) c.universal_id = info.node.universal_id; info.list.splice(info.index + 1, 0, c); ST.sel = { kind: sel.kind, id: c.id }; changed(); drawPanel(); return; }
  if (a === 'up' || a === 'down') { const j = info.index + (a === 'up' ? -1 : 1); if (j < 0 || j >= info.list.length) return; const [x] = info.list.splice(info.index, 1); info.list.splice(j, 0, x); changed(); return; }
  if (a === 'save') return saveUniversal(info.node, sel.kind);
  if (a === 'note') { const n = prompt('Comment on this ' + (sel.kind === 'section' ? 'section' : 'block') + ' (only your team sees it):', info.node.note || ''); if (n == null) return; if (n.trim()) info.node.note = n.trim(); else delete info.node.note; changed(); return; }
  if (a === 'ai') return askEmily(info.node);
}
function removeNode(sel) {
  const info = D.find(ST.doc, sel.id); if (!info || !info.list) return;
  info.list.splice(info.index, 1); ST.sel = null; ST.panel = 'add'; stopEdit(true); changed(); drawPanel();
}

/* ---------- clicking and typing on the email ---------- */
function onFrameClick(e) {
  const d = frameDoc();
  if (e.target.closest('#bzo')) return;
  const a = e.target.closest('a'); if (a) e.preventDefault();
  if (ST.editing) { const ed = d.querySelector('[contenteditable="true"]'); if (ed && ed.contains(e.target)) return; if (e.target.closest('.bzo-fmt')) return; stopEdit(); }
  const b = e.target.closest('[data-bid]'), s = e.target.closest('[data-sid]');
  if (b) { const id = b.dataset.bid; const was = ST.sel && ST.sel.kind === 'block' && ST.sel.id === id; select({ kind: 'block', id }); if (was && ['text', 'split', 'table'].includes(b.dataset.type)) startEdit(id, e); return; }
  if (s) { select({ kind: 'section', id: s.dataset.sid }); return; }
  select(null);
}
function onFrameDbl(e) { const b = e.target.closest('[data-bid]'); if (b && ['text', 'split', 'table'].includes(b.dataset.type)) { select({ kind: 'block', id: b.dataset.bid }); startEdit(b.dataset.bid, e); } }
function select(sel) {
  if (ST.editing && (!sel || sel.id !== ST.editing.id)) stopEdit();
  ST.sel = sel; if (sel) ST.tab = 'styles'; else if (ST.panel !== 'styles') ST.panel = 'add';
  drawPanel(); decorate();
}
/** Text blocks are typed straight onto the email. */
function startEdit(id, ev) {
  const d = frameDoc(); const el = d.querySelector(`[data-bid="${CSS.escape(id)}"]`); if (!el) return;
  const info = D.find(ST.doc, id); if (!info) return;
  let target = null, apply = null;
  if (info.node.type === 'text') { target = el.querySelector('.bz-text'); apply = (h) => { info.node.data.content = h; }; }
  else if (info.node.type === 'split') { const cells = [...el.querySelectorAll('.bz-split > tbody > tr > .bz-col, .bz-split > tr > .bz-col')]; const hit = cells.find((c) => c.contains(ev && ev.target)) || cells.find((c) => c.querySelector('.bz-text'));
    const tx = hit && hit.querySelector('.bz-text'); if (!tx) return; const dir = hit.parentNode.parentNode.parentNode.getAttribute('dir') === 'rtl'; let i = cells.indexOf(hit); if (dir) i = 1 - i; const sb = info.node.subblocks[i]; if (!sb || sb.type !== 'table_text') return; target = tx; apply = (h) => { sb.content = h; }; }
  else if (info.node.type === 'table') { const cell = ev && ev.target.closest('td,th'); if (!cell) return; const row = cell.parentNode; const tbl = row.closest('table'); const rows = [...tbl.querySelectorAll(':scope > tbody > tr, :scope > tr')]; const nc = Number((info.node.data.properties || {}).num_columns) || 2; const cellsAll = info.node.subblocks.filter((x) => !/fallback/.test(x.type || ''));
    const i = rows.indexOf(row) * nc + [...row.children].indexOf(cell); const sb = cellsAll[i]; if (!sb || sb.type === 'table_image') return; target = cell; apply = (h) => { sb.content = h; }; }
  if (!target) return;
  ST.editing = { id, apply, el: target };
  target.contentEditable = 'true'; target.classList.add('bz-editing'); target.focus();
  if (ev && d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(ev.clientX, ev.clientY); if (r) { const s = d.getSelection(); s.removeAllRanges(); s.addRange(r); } }
  showFormatBar(target);
}
function onFrameInput(e) { if (!ST.editing) return; ST.editing.apply(ST.editing.el.innerHTML); markDirty(); snapSoon(); positionFormatBar(); }
function onPaste(e) {
  if (!ST.editing) return;
  const html = e.clipboardData.getData('text/html'), text = e.clipboardData.getData('text/plain');
  e.preventDefault();
  const d = frameDoc();
  if (html && !e.shiftKey) { const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|meta|link|title|head)[\s\S]*?(<\/\1>|>)/gi, '').replace(/\s(class|id|data-[\w-]+|lang|dir)="[^"]*"/gi, '').replace(/<\/?(html|body|span|font|div)[^>]*>/gi, (m) => (/^<div/i.test(m) ? '<p>' : /^<\/div/i.test(m) ? '</p>' : '')).replace(/\sstyle="[^"]*"/gi, '');
    d.execCommand('insertHTML', false, clean); }
  else d.execCommand('insertText', false, text);
}
function stopEdit(silent) {
  if (!ST.editing) return; const { el, apply } = ST.editing;
  try { apply(el.innerHTML); el.contentEditable = 'false'; el.classList.remove('bz-editing'); } catch (_) {}
  ST.editing = null; hideFormatBar(); if (!silent) { snap(); draw(); }
}

/* the formatting bar shown while typing in a text block */
function showFormatBar(target) {
  const d = frameDoc(); hideFormatBar();
  const bar = d.createElement('div'); bar.className = 'bzo-fmt'; bar.contentEditable = 'false';
  const fonts = fontList();
  bar.innerHTML = `<select data-c="block" title="Text style"><option value="p">Normal</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="h4">Heading 4</option></select>
    <select data-c="font" title="Font"><option value="">Font</option>${fonts.map((f) => `<option value="${esc(f[1])}">${esc(f[0])}</option>`).join('')}</select>
    <input data-c="size" type="number" min="1" max="200" step="1" list="kxSizes" placeholder="Size" title="Text size (px) — pick one or type any size" style="width:70px"><datalist id="kxSizes">${[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 56, 64, 72, 96].map((n) => `<option value="${n}"></option>`).join('')}</datalist>
    <span class="bzo-sep"></span>
    <button data-c="bold" title="Bold"><b>B</b></button><button data-c="italic" title="Italic"><i>I</i></button><button data-c="underline" title="Underline"><u>U</u></button><button data-c="strikeThrough" title="Strikethrough"><s>S</s></button>
    <label class="bzo-col" title="Text color"><span>A</span><input type="color" data-c="color"></label><label class="bzo-col hl" title="Highlight"><span>▇</span><input type="color" data-c="hilite" value="#FFF3B0"></label>
    <span class="bzo-sep"></span>
    <button data-c="justifyLeft" title="Align left">${SVG.al}</button><button data-c="justifyCenter" title="Center">${SVG.ac}</button><button data-c="justifyRight" title="Align right">${SVG.ar}</button>
    <button data-c="insertUnorderedList" title="Bullets">•≡</button><button data-c="insertOrderedList" title="Numbers">1≡</button>
    <button data-c="link" title="Link">${SVG.link}</button><button data-c="unlink" title="Remove link">${SVG.unlink}</button>
    <select data-c="tag" title="Insert personalization"><option value="">{ } Personalize</option>${PERSONALIZE.map(([l, v]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
    <button data-c="removeFormat" title="Clear formatting">${SVG.clear}</button>`;
  d.getElementById('bzo').appendChild(bar);
  let saved = null; const keep = () => { const s = d.getSelection(); if (s.rangeCount && !bar.contains(s.getRangeAt(0).commonAncestorContainer) && d.activeElement && !bar.contains(d.activeElement)) saved = s.getRangeAt(0).cloneRange(); };
  const restore = () => { if (saved) { const s = d.getSelection(); s.removeAllRanges(); s.addRange(saved); } };
  d.addEventListener('selectionchange', keep);
  bar._off = () => d.removeEventListener('selectionchange', keep);
  bar.addEventListener('mousedown', (e) => { if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'INPUT') e.preventDefault(); });
  const run = (cmd, val) => { restore(); d.execCommand('styleWithCSS', false, true); d.execCommand(cmd, false, val); onFrameInput(); };
  const wrapStyle = (prop, val) => { restore(); d.execCommand('styleWithCSS', false, false); d.execCommand('fontSize', false, '7'); d.querySelectorAll('font[size="7"]').forEach((f) => { const s = d.createElement('span'); s.style[prop] = val; s.innerHTML = f.innerHTML; f.replaceWith(s); }); onFrameInput(); };
  bar.querySelectorAll('button').forEach((b) => b.onclick = () => {
    const c = b.dataset.c;
    if (c === 'link') { restore(); const cur = (() => { const s = d.getSelection(); const n = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode); const a = n && n.closest && n.closest('a'); return a ? a.getAttribute('href') : ''; })(); const u = prompt('Link address (https://… or {{ shop_url }}/…)', cur || 'https://'); if (u) run('createLink', u); return; }
    run(c);
  });
  bar.querySelector('[data-c="block"]').onchange = (e) => { run('formatBlock', '<' + e.target.value + '>'); };
  bar.querySelector('[data-c="font"]').onchange = (e) => { if (e.target.value) wrapStyle('fontFamily', e.target.value); e.target.value = ''; };
  { const sz = bar.querySelector('[data-c="size"]'); const go = () => { const v = Number(sz.value); if (v > 0) wrapStyle('fontSize', Math.min(200, v) + 'px'); };
    sz.onchange = go; sz.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }; }
  bar.querySelector('[data-c="color"]').oninput = (e) => run('foreColor', e.target.value);
  bar.querySelector('[data-c="hilite"]').oninput = (e) => run('hiliteColor', e.target.value);
  bar.querySelector('[data-c="tag"]').onchange = (e) => { if (e.target.value) { restore(); d.execCommand('insertText', false, e.target.value); onFrameInput(); } e.target.value = ''; };
  positionFormatBar();
}
function positionFormatBar() {
  const d = frameDoc(); const bar = d && d.querySelector('.bzo-fmt'); if (!bar || !ST.editing) return;
  const r = ST.editing.el.getBoundingClientRect(), sy = d.scrollingElement.scrollTop;
  const w = bar.offsetWidth, vw = d.documentElement.clientWidth;
  Object.assign(bar.style, { top: Math.max(sy + 2, r.top + sy - bar.offsetHeight - 26) + 'px', left: Math.max(4, Math.min(vw - w - 4, r.left + r.width / 2 - w / 2)) + 'px' });
}
function hideFormatBar() { const d = frameDoc(); const bar = d && d.querySelector('.bzo-fmt'); if (bar) { if (bar._off) bar._off(); bar.remove(); } }

/* ---------- drag and drop ---------- */
function dropTarget(e) {
  const d = frameDoc(); const sy = d.scrollingElement.scrollTop;
  const secs = [...d.querySelectorAll('#bzr [data-sid]')].filter((x) => !x.parentNode.closest('[data-sid]'));
  const wrap = d.querySelector('.bz-wrap'); const wr = wrap ? wrap.getBoundingClientRect() : { left: 0, width: 600 };
  const sectionSpot = () => { if (!secs.length) return { where: 'doc', index: 0, line: { x: wr.left, y: (d.querySelector('.bz-emptydoc') || wrap || d.body).getBoundingClientRect().top + sy + 20, w: wr.width } };
    let i = secs.length, y = secs[secs.length - 1].getBoundingClientRect().bottom;
    for (let k = 0; k < secs.length; k++) { const r = secs[k].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { i = k; y = r.top; break; } }
    return { where: 'doc', index: i, line: { x: wr.left, y: y + sy, w: wr.width } }; };
  if (!DRAG) return null;
  if (DRAG.kind === 'sections' || DRAG.kind === 'move-section') return sectionSpot();
  const el = d.elementFromPoint(e.clientX, e.clientY);
  if (!el) return sectionSpot();
  const empty = el.closest('[data-drop]');
  if (empty) { if (empty.dataset.drop === 'doc') return sectionSpot(); const r = empty.getBoundingClientRect(); return { where: 'col', col: empty.dataset.drop, index: 0, line: { x: r.left, y: r.top + sy + r.height / 2, w: r.width } }; }
  const blk = el.closest('[data-bid]');
  if (blk) { const info = D.find(ST.doc, blk.dataset.bid); const r = blk.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2;
    // near the very top/bottom of a section's outer edge → new section instead
    return { where: 'col', col: info.column.id, index: info.index + (after ? 1 : 0), line: { x: r.left, y: (after ? r.bottom : r.top) + sy, w: r.width } }; }
  const colEl = el.closest('[data-cid]');
  if (colEl) { const info = D.find(ST.doc, colEl.dataset.cid); const r = colEl.getBoundingClientRect(); return { where: 'col', col: colEl.dataset.cid, index: (info.node.blocks || []).length, line: { x: r.left, y: r.bottom + sy - 2, w: r.width } }; }
  return sectionSpot();
}
function onDragOver(e) {
  if (!DRAG) return; e.preventDefault(); const t = dropTarget(e); if (!t) return hideDrop();
  const d = frameDoc(); let line = d.getElementById('bzo-drop'); if (!line) { line = d.createElement('div'); line.id = 'bzo-drop'; d.getElementById('bzo').appendChild(line); }
  Object.assign(line.style, { display: 'block', left: t.line.x + 'px', top: (t.line.y - 2) + 'px', width: t.line.w + 'px' });
}
function hideDrop() { const d = frameDoc(); const l = d && d.getElementById('bzo-drop'); if (l) l.style.display = 'none'; }
function onDrop(e) {
  if (!DRAG) return; e.preventDefault(); hideDrop(); const t = dropTarget(e); const g = DRAG; DRAG = null; if (!t) return;
  const secs = ST.doc.body.sections;
  if (g.kind === 'move-section') { const info = D.find(ST.doc, g.id); if (!info) return; const [s] = secs.splice(info.index, 1); secs.splice(t.index > info.index ? t.index - 1 : t.index, 0, s); ST.sel = { kind: 'section', id: s.id }; changed(); return; }
  if (g.kind === 'sections') { const list = g.make(); secs.splice(t.index, 0, ...list); ST.sel = { kind: 'section', id: list[0].id }; ST.tab = 'styles'; changed(); drawPanel(); return; }
  let blk;
  if (g.kind === 'move') { const info = D.find(ST.doc, g.id); if (!info) return; [blk] = info.list.splice(info.index, 1);
    if (t.where === 'col' && t.col === info.column.id && t.index > info.index) t.index--; }
  else blk = g.make();
  if (t.where === 'doc') { const s = D.newSection(1); s.rows[0].columns[0].blocks.push(blk); secs.splice(t.index, 0, s); }
  else { const c = D.find(ST.doc, t.col); if (!c) return; c.node.blocks.splice(t.index, 0, blk); }
  ST.sel = { kind: 'block', id: blk.id }; ST.tab = 'styles'; changed(); drawPanel();
  if (g.kind !== 'move' && blk.type === 'image' && !blk.data.properties.src) setTimeout(() => pickImage((u) => setImage(blk, u)), 50);
}
/** Click a tile instead of dragging: add below the selection (or at the end). */
function addByClick(make, kind) {
  const secs = ST.doc.body.sections;
  if (kind === 'sections') { const list = make(); let at = secs.length; if (ST.sel) { const inf = D.find(ST.doc, ST.sel.id); if (inf) at = (inf.kind === 'section' ? inf.index : secs.indexOf(inf.section)) + 1; } secs.splice(at, 0, ...list); ST.sel = { kind: 'section', id: list[0].id }; changed(); drawPanel(); return; }
  const blk = make();
  const inf = ST.sel && D.find(ST.doc, ST.sel.id);
  if (inf && inf.kind === 'block') inf.list.splice(inf.index + 1, 0, blk);
  else { const s = D.newSection(1); s.rows[0].columns[0].blocks.push(blk); const at = inf && inf.kind === 'section' ? inf.index + 1 : secs.length; secs.splice(at, 0, s); }
  ST.sel = { kind: 'block', id: blk.id }; ST.tab = 'styles'; changed(); drawPanel();
  if (blk.type === 'image') setTimeout(() => pickImage((u) => setImage(blk, u)), 50);
}

/* ---------- history, keys, save ---------- */
function markDirty() { ST.dirty = true; const x = $('kxDirty'); if (x) x.classList.remove('hidden'); }
let snapT = null;
function snapSoon() { clearTimeout(snapT); snapT = setTimeout(snap, 600); }
function snap() { const s = JSON.stringify(ST.doc); if (s === ST.hist[ST.hi]) return; ST.hist = ST.hist.slice(0, ST.hi + 1); ST.hist.push(s); if (ST.hist.length > 100) ST.hist.shift(); ST.hi = ST.hist.length - 1; drawUndo(); }
function changed(opts = {}) { markDirty(); trackUniversal(); if (opts.soon) { snapSoon(); draw(true); } else { snap(); draw(); } }
function drawUndo() { if (!$('kxUndo')) return; $('kxUndo').disabled = ST.hi <= 0; $('kxRedo').disabled = ST.hi >= ST.hist.length - 1; }
function undo(dir) { stopEdit(true); clearTimeout(snapT); snap(); const j = ST.hi + dir; if (j < 0 || j >= ST.hist.length) return; ST.hi = j; ST.doc = JSON.parse(ST.hist[j]); if (ST.sel && !D.find(ST.doc, ST.sel.id)) { ST.sel = null; ST.panel = 'add'; } markDirty(); drawPanel(); draw(); drawUndo(); }
function keys(e, where) {
  if (!$('kxF')) { document.removeEventListener('keydown', KEYH); return; }
  const mod = e.metaKey || e.ctrlKey; const k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); save(); return; }
  const ae = (where.activeElement || {}); const typing = /INPUT|TEXTAREA|SELECT/.test(ae.tagName || '') || ae.isContentEditable || ST.editing;
  if (e.key === 'Escape') { if (ST.editing) { stopEdit(); return; } if (ST.sel) { select(null); } return; }
  if (typing) return;
  if (mod && k === 'z') { e.preventDefault(); undo(e.shiftKey ? 1 : -1); return; }
  if (mod && k === 'y') { e.preventDefault(); undo(1); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && ST.sel) { e.preventDefault(); removeNode(ST.sel); return; }
  if (mod && k === 'd' && ST.sel) { e.preventDefault(); toolAction('dup', ST.sel); }
}
async function save() {
  stopEdit(true); snap();
  try {
    const r = await api('/api/mk/templates/' + ST.t.id, { method: 'PUT', body: JSON.stringify({ name: $('kxName').value, subject: $('kxSubj').value, preview: $('kxPre').value, doc: ST.doc }) });
    for (const uid of ST.univ) { const n = findUniversal(uid); if (n) await api('/api/mk/saved-blocks/' + uid, { method: 'PUT', body: JSON.stringify({ block: stripForSave(n) }) }).catch(() => {}); }
    ST.univ.clear();
    ST.t = { ...ST.t, ...r }; ST.dirty = false; $('kxDirty').classList.add('hidden'); toast('Saved');
  } catch (e) { toast(e.message, 1); }
}
function sendTest() { return window.MKE_preview({ send: true }); }

/* ---------- universal content (saved blocks and sections) ---------- */
const stripForSave = (n) => { const c = D.clone(n); delete c.universal_id; delete c.note; return c; };
async function saveUniversal(node, kind) {
  const name = prompt(`Name this ${kind === 'section' ? 'section' : 'block'} so you can reuse it in any email. Edits to it later update every email that uses it.`, node.universal_name || ''); if (!name) return;
  try { const r = await api('/api/mk/saved-blocks', { method: 'POST', body: JSON.stringify({ store: ST.t.store, name, block: stripForSave(node) }) });
    node.universal_id = String(r.id); node.universal_name = name; changed(); drawPanel(); toast('Saved — find it under Add content → Universal'); } catch (e) { toast(e.message, 1); }
}
function findUniversal(uid) { let out = null; D.walk(ST.doc, (n) => { if (!out && n && String(n.universal_id) === String(uid)) out = n; }); return out; }
function trackUniversal() { if (!ST.sel) return; const inf = D.find(ST.doc, ST.sel.id); let n = inf && inf.node; if (inf && inf.kind === 'block' && !n.universal_id && inf.section && inf.section.universal_id) n = inf.section; if (n && n.universal_id) ST.univ.add(String(n.universal_id)); }

/* ---------- products for the canvas ---------- */
async function loadProducts() {
  const hs = new Set(); D.walk(ST.doc, (n, k) => { if (k === 'block' && n.type === 'product') ((n.data.properties || {}).items || []).forEach((it) => it.handle && hs.add(it.handle)); });
  try {
    const [a, f] = await Promise.all([hs.size ? api('/api/mk/products?' + qs({ store: ST.t.store, handles: [...hs].join(',') })) : { products: [] }, api('/api/mk/products?' + qs({ store: ST.t.store, feed: 1 }))]);
    a.products.forEach((p) => { ST.pcache[p.handle] = p; }); ST.feed = f.products; draw();
  } catch (_) {}
}

/* ---------- Emily on a block ---------- */
function askEmily(node) {
  const brief = `Email "${$('kxName').value}", subject "${$('kxSubj').value}".`;
  if (node.type === 'text') return window.MK_aiPick('body', brief + ' Write this section.', (o) => { node.data.content = o.html || `<p>${esc(o.text || '')}</p>`; changed(); }, (node.data.content || '').replace(/<[^>]+>/g, ' '));
  if (node.type === 'button') return window.MK_aiPick('button', brief + ' Button label.', (o) => { node.data.content = esc(o.text || o.body || ''); changed(); drawPanel(); }, node.data.content);
  if (node.type === 'image') return window.MK_aiPick('alt', brief + ' Describe this image for alt text: ' + ((node.data.properties || {}).src || ''), (o) => { node.data.properties.alt_text = o.text || ''; changed(); drawPanel(); }, (node.data.properties || {}).alt_text);
}

/* expose for the panel code */
window.MKE = { get ST() { return ST; }, D, draw, decorate, changed, markDirty, select, drawPanel: () => drawPanel(), addByClick, removeNode, toolAction, setDrag: (g) => { DRAG = g; }, clearDrag: () => { DRAG = null; hideDrop(); }, stopEdit, saveUniversal, save: () => save() };
function drawPanel() { if (window.MKE_drawPanel) window.MKE_drawPanel(); }
function pickImage(cb) { return window.MKE_pickImage(cb); }
function setImage(blk, u) { return window.MKE_setImage(blk, u); }
function previewModal() { return window.MKE_preview(); }

/* ---------- constants ---------- */
const SVG = {
  move: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
  up: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M6 13l6 6 6-6"/></svg>',
  copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17.75l-6.17 3.24 1.18-6.87-5-4.86 6.9-1 3.09-6.26 3.09 6.26 6.9 1-5 4.86 1.18 6.87z"/></svg>',
  spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
  note: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v11H8l-4 4z"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>',
  al: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h10M4 18h14"/></svg>',
  ac: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M7 12h10M5 18h14"/></svg>',
  ar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M10 12h10M6 18h14"/></svg>',
  link: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 15l6-6M11 6l.5-.5a4 4 0 0 1 5.7 5.7l-.5.5M13 18l-.5.5a4 4 0 0 1-5.7-5.7l.5-.5"/></svg>',
  unlink: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 6l.5-.5a4 4 0 0 1 5.7 5.7l-.5.5M13 18l-.5.5a4 4 0 0 1-5.7-5.7l.5-.5M4 4l16 16"/></svg>',
  clear: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 5h12M12 5l-3 14M4 20l16-16"/></svg>',
};
const PERSONALIZE = [['First name', '{{ first_name|default:"friend" }}'], ['Last name', '{{ last_name }}'], ['Email', '{{ email }}'], ['Coupon code', '{{ coupon }}'], ['Store name', '{{ store_name }}'], ['Shop link', '{{ shop_url }}'], ['Sizes they bought', '{{ last_sizes }}'], ['Unsubscribe link', '{{ unsubscribe_url }}'], ['Preferences link', '{{ preferences_url }}']];
function fontList() {
  const b = ST.brand || {}; const f = b.fonts || {};
  const L = [['Brand heading', f.heading || 'Georgia, serif'], ['Brand body', f.body || 'Helvetica, Arial, sans-serif'], ['Arial', 'Arial, Helvetica, sans-serif'], ['Helvetica', "Helvetica, Arial, sans-serif"], ['Georgia', 'Georgia, serif'], ['Times New Roman', "'Times New Roman', Times, serif"], ['Verdana', 'Verdana, Geneva, sans-serif'], ['Tahoma', 'Tahoma, Geneva, sans-serif'], ['Trebuchet MS', "'Trebuchet MS', Helvetica, sans-serif"], ['Courier New', "'Courier New', Courier, monospace"], ['Lucida Sans', "'Lucida Sans Unicode', 'Lucida Grande', sans-serif"], ['Palatino', "'Palatino Linotype', Palatino, serif"], ['Garamond', 'Garamond, serif'], ['Figtree (web)', "Figtree, Helvetica, Arial, sans-serif"], ['Lato (web)', "Lato, Helvetica, Arial, sans-serif"], ['Montserrat (web)', "Montserrat, Helvetica, Arial, sans-serif"], ['Playfair Display (web)', "'Playfair Display', Georgia, serif"]];
  return L;
}
window.MKE_fontList = fontList; window.MKE_PERSONALIZE = PERSONALIZE;

const FRAME_CSS = `html,body{margin:0;min-height:100%}body{position:relative}
#bzr [data-bid]:hover>tbody>tr>td,#bzr [data-bid]:hover>tr>td{box-shadow:inset 0 0 0 1px #8FB4F0}
#bzr [data-sid]:hover{outline:1px dashed #9DB7EA;outline-offset:-1px}
#bzr [data-bid]{cursor:pointer}
.bz-editing{outline:none!important;cursor:text!important}
.bz-editing:empty:before{content:'Type here…';color:#AAA}
#bzo{position:absolute;left:0;top:0;width:0;height:0;z-index:50}
.bzo-box{position:absolute;border:2px solid #2F6FEB;pointer-events:none;box-sizing:border-box}
.bzo-box.sec{border:2px dashed #2F6FEB}
.bzo-tag{position:absolute;background:#2F6FEB;color:#fff;font:600 11.5px/18px Helvetica,Arial,sans-serif;padding:1px 8px;border-radius:5px 5px 0 0;pointer-events:none;white-space:nowrap}
.bzo-tools{position:absolute;display:flex;flex-direction:column;gap:2px;background:#fff;border:1px solid #D9DCE3;border-radius:10px;padding:4px;box-shadow:0 4px 14px rgba(20,30,60,.14)}
.bzo-tools button{width:30px;height:30px;border:0;background:transparent;border-radius:7px;color:#2B2F38;cursor:pointer;display:flex;align-items:center;justify-content:center}
.bzo-tools button:hover{background:#EEF2FA}.bzo-tools button[data-a="del"]:hover{background:#FDECEC;color:#C62828}.bzo-tools button[data-a="move"]{cursor:grab}
.bzo-handle{position:absolute;width:10px;height:24px;background:#fff;border:2px solid #2F6FEB;border-radius:5px;cursor:ew-resize;box-sizing:border-box}
.bzo-note{position:absolute;max-width:200px;background:#FFF8D6;border:1px solid #F0D98C;color:#5A4A12;font:12px/1.35 Helvetica,Arial,sans-serif;padding:6px 8px;border-radius:8px}
#bzo-drop{position:absolute;height:4px;background:#2F6FEB;border-radius:2px;pointer-events:none;box-shadow:0 0 0 2px rgba(47,111,235,.2)}
.bzo-fmt{position:absolute;z-index:60;display:flex;align-items:center;gap:2px;flex-wrap:nowrap;background:#fff;border:1px solid #D9DCE3;border-radius:10px;padding:4px 6px;box-shadow:0 6px 18px rgba(20,30,60,.16);font:12.5px Helvetica,Arial,sans-serif;white-space:nowrap}
.bzo-fmt button{min-width:26px;height:26px;border:0;background:transparent;border-radius:6px;cursor:pointer;color:#22252C;font:13px Helvetica,Arial,sans-serif;display:inline-flex;align-items:center;justify-content:center;padding:0 4px}
.bzo-fmt button:hover{background:#EEF2FA}.bzo-fmt input[type=number]{height:26px;border:1px solid #E1E3E8;border-radius:6px;font:12px Helvetica,Arial,sans-serif;padding:0 6px;box-sizing:border-box;background:#fff}.bzo-fmt select{height:26px;border:1px solid #E1E3E8;border-radius:6px;font:12px Helvetica,Arial,sans-serif;max-width:110px;background:#fff}
.bzo-sep{width:1px;height:18px;background:#E1E3E8;margin:0 3px}
.bzo-col{position:relative;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:6px;cursor:pointer;font-weight:700}.bzo-col:hover{background:#EEF2FA}.bzo-col.hl span{color:#E6C200}
.bzo-col input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}`;

const EDITOR_CSS = `.kx{display:flex;flex-direction:column;height:100%;background:#F4F4F2}
.kx-top{display:flex;align-items:center;gap:8px;padding:8px 14px;background:#fff;border-bottom:1px solid var(--line)}
.kx-ib{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:9px;color:var(--ink);text-decoration:none;font-size:18px}.kx-ib:hover{background:var(--panel2)}
.kx-name{font-weight:800;font-size:15px;border:1px solid transparent;border-radius:8px;padding:6px 8px;min-width:260px;background:transparent}.kx-name:hover,.kx-name:focus{border-color:var(--line)}
.kx-sub{display:flex;align-items:center;gap:8px;padding:7px 14px;background:#fff;border-bottom:1px solid var(--line)}
.kx-sub label{font-weight:700;color:var(--muted);font-size:12px}.kx-sub input{flex:1;min-width:160px;border:1px solid var(--line);border-radius:8px;padding:6px 9px}
.kx-body{flex:1;display:flex;min-height:0}
.kx-rail{width:52px;flex:none;background:#fff;border-right:1px solid var(--line);display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:10px}
.kx-rail button{width:38px;height:38px;border:0;border-radius:10px;background:transparent;font-size:20px;color:#3A3D46;cursor:pointer;display:flex;align-items:center;justify-content:center}
.kx-rail button:hover{background:#F0F2F7}.kx-rail button.on{background:#E8EEFB;color:#2F6FEB}
.kx-panel{width:372px;flex:none;background:#fff;border-right:1px solid var(--line);overflow-y:auto;overflow-x:hidden}
.kx-panel.collapsed{width:0;border:0}
.kx-canvas{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;position:relative}
.kx-ctool{display:flex;gap:2px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:10px;padding:3px;margin:10px 0;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.kx-ctool button{width:34px;height:30px;border:0;border-radius:7px;background:transparent;font-size:17px;color:#3A3D46;cursor:pointer;display:flex;align-items:center;justify-content:center}
.kx-ctool button:hover{background:#F0F2F7}.kx-ctool button.on{background:#E8EEFB;color:#2F6FEB}.kx-ctool button:disabled{opacity:.35;cursor:default}
.kx-sep{width:1px;height:20px;background:var(--line);margin:0 4px}
.kx-stage{flex:1;width:100%;min-height:0;display:flex;justify-content:center;padding:0 16px 16px;box-sizing:border-box}
.kx-frame{width:100%;height:100%;border:0;background:#fff;border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,.06);transition:width .2s}
.kx-frame.mob{width:400px;border-radius:24px;border:10px solid #1D1E22;box-sizing:content-box;height:calc(100% - 20px)}
/* panel */
.kp-hd{display:flex;align-items:center;gap:6px;padding:14px 16px 6px}.kp-hd b{font-size:16px;flex:1}
.kp-back{border:0;background:transparent;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center}.kp-back:hover{background:var(--panel2)}
.kp-tabs{display:flex;gap:4px;padding:6px 16px 0;border-bottom:1px solid var(--line)}
.kp-tabs button{border:0;background:transparent;padding:9px 10px;font-weight:600;color:var(--muted);cursor:pointer;border-radius:8px 8px 0 0;position:relative}
.kp-tabs button.on{color:var(--ink)}.kp-tabs button.on:after{content:'';position:absolute;left:8px;right:8px;bottom:-1px;height:2px;background:var(--ink);border-radius:2px}
.kp-sec{padding:14px 16px;border-bottom:1px solid var(--line)}.kp-sec:last-child{border-bottom:0}
.kp-sec>h4{margin:0 0 10px;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:space-between}
.kp-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0;min-height:30px}
.kp-row>.l{font-size:13px;color:#2B2E36;flex:1}.kp-row>.c{display:flex;align-items:center;gap:6px}
.kp-lab{display:block;font-size:12.5px;font-weight:600;color:#2B2E36;margin:10px 0 4px}.kp-hint{font-size:11.5px;color:var(--muted);margin-top:3px}
.kp-in{width:100%;box-sizing:border-box;border:1px solid #DADDE3;border-radius:8px;padding:7px 9px;font:inherit;background:#fff}.kp-in:focus{outline:2px solid #BFD3FA;border-color:#8FB0EE}
textarea.kp-in{resize:vertical}.kp-in.mono{font-family:ui-monospace,Menlo,monospace;font-size:12px}
.kp-num{display:flex;align-items:center;border:1px solid #DADDE3;border-radius:8px;background:#fff;height:32px;padding:0 8px;gap:6px;min-width:0}
.kp-num input{border:0!important;outline:0;width:100%;min-width:24px;height:auto!important;min-height:0!important;padding:0!important;box-shadow:none!important;font:inherit;background:transparent!important;color:var(--ink,#18181B);-moz-appearance:textfield;appearance:textfield}.kp-num input::-webkit-outer-spin-button,.kp-num input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.kp-num input::placeholder{color:#3F3F46;opacity:1}.kp-num .u,.kp-num .pre{flex:none;white-space:nowrap}.kp-own-sz{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:6px;padding:0 8px;font-size:12.5px;color:#52525B}.kp-own-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.kp-num .u{color:var(--muted);font-size:12px}.kp-num .pre{color:var(--muted);font-size:12px;font-weight:600}
.kp-num:focus-within{outline:2px solid #BFD3FA;border-color:#8FB0EE}
.kp-2{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:center}.kp-4{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.kp-ic{width:32px;height:32px;border:1px solid #DADDE3;border-radius:8px;background:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-size:15px}.kp-ic:hover{background:#F2F4F8}.kp-ic.on{background:#E8EEFB;border-color:#9DB7EA;color:#2F6FEB}
.kp-seg{display:flex;border:1px solid #DADDE3;border-radius:9px;overflow:hidden;background:#F4F5F7}
.kp-seg button{flex:1;border:0;background:transparent;padding:6px 8px;cursor:pointer;font-size:14px;color:#6A6E78}.kp-seg button.on{background:#fff;box-shadow:0 0 0 1px #9DB7EA;color:#2F6FEB;font-weight:700;border-radius:8px}
.kp-tog{position:relative;width:38px;height:22px;flex:none}.kp-tog input{opacity:0;width:0;height:0}.kp-tog span{position:absolute;inset:0;border-radius:22px;background:#C9CDD5;transition:.15s;cursor:pointer}
.kp-tog span:before{content:'';position:absolute;width:16px;height:16px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.15s}.kp-tog input:checked+span{background:#2F6FEB}.kp-tog input:checked+span:before{transform:translateX(16px)}
.kp-plus{width:28px;height:28px;border:0;border-radius:8px;background:transparent;cursor:pointer;font-size:18px;color:#3A3D46}.kp-plus:hover{background:#F0F2F7}
.kp-col{display:flex;gap:6px;align-items:center}.kp-sw{position:relative;width:32px;height:32px;border-radius:8px;border:1px solid #DADDE3;flex:none;overflow:hidden;background-image:linear-gradient(45deg,#ddd 25%,transparent 25%),linear-gradient(-45deg,#ddd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd 75%),linear-gradient(-45deg,transparent 75%,#ddd 75%);background-size:8px 8px}
.kp-sw i{position:absolute;inset:0}.kp-sw input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.kp-swatches{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}.kp-swatches button{width:18px;height:18px;border-radius:5px;border:1px solid rgba(0,0,0,.15);cursor:pointer;padding:0}
.kp-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.kp-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;height:76px;border:1px solid #E1E3E8;border-radius:10px;background:#fff;cursor:grab;font-weight:600;font-size:12.5px;color:#2B2E36;user-select:none;text-align:center;padding:4px}
.kp-tile:hover{border-color:#9DB7EA;box-shadow:0 2px 8px rgba(47,111,235,.12)}.kp-tile i{font-size:22px;color:#3A3D46}
.kp-pb{border:1px solid #E1E3E8;border-radius:10px;padding:10px;margin-bottom:8px;cursor:grab;background:#fff}.kp-pb:hover{border-color:#9DB7EA}
.kp-pb b{display:block;font-size:13px}.kp-pb span{font-size:12px;color:var(--muted)}
.kp-own{display:flex;align-items:center;gap:8px;margin-top:8px;padding:6px 8px;background:#FAFAF9;border:1px solid #ECEBE8;border-radius:8px}.kp-own-i{width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;flex:none}.kp-own-i img{max-width:30px;max-height:30px;border-radius:6px}.kp-own-t{flex:1;font-size:12.5px;color:#52525B}.kp-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.kp-chip{display:inline-flex;align-items:center;gap:4px;background:#F4F4F5;border-radius:6px;padding:3px 4px 3px 8px;font-size:12.5px}.kp-chip button{all:unset;cursor:pointer;padding:0 4px;color:#71717A}.kp-list{border:1px solid #E1E3E8;border-radius:10px;overflow:hidden}.kp-li{display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid #EEF0F3;background:#fff}.kp-li:last-child{border-bottom:0}
.kp-li img{width:38px;height:38px;object-fit:cover;border-radius:6px;flex:none;background:#F2F2F2}.kp-li .t{flex:1;min-width:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis}
.kp-imgcard{border:1px solid #E1E3E8;border-radius:12px;overflow:hidden}.kp-imgcard .pv{height:150px;display:flex;align-items:center;justify-content:center;background-color:#fff;background-image:linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%);background-size:14px 14px}
.kp-imgcard .pv img{max-width:100%;max-height:150px;display:block}.kp-imgcard .meta{padding:8px 10px;font-size:12px;color:var(--muted);word-break:break-all}.kp-imgcard .acts{display:flex;gap:6px;padding:0 10px 10px}
.kp-radio{border:1px solid #DADDE3;border-radius:10px;overflow:hidden}.kp-radio label{display:flex;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid #EEF0F3;cursor:pointer}.kp-radio label:last-child{border-bottom:0}.kp-radio label.on{box-shadow:inset 0 0 0 2px #2F6FEB;border-radius:10px}
.kp-banner{margin:10px 16px 0;padding:9px 11px;border-radius:9px;background:#FFF8D6;border:1px solid #F0D98C;font-size:12.5px;color:#5A4A12}
.kp-lay{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.kp-lay button{height:34px;border:1px solid #DADDE3;border-radius:7px;background:#fff;cursor:pointer;display:flex;gap:2px;padding:5px}.kp-lay button span{background:#C9D3E6;border-radius:2px;height:100%}.kp-lay button.on{border-color:#2F6FEB;box-shadow:0 0 0 1px #2F6FEB}.kp-lay button.on span{background:#2F6FEB}
.kx-modal{position:fixed;inset:0;background:rgba(15,18,25,.45);z-index:200;display:flex;align-items:center;justify-content:center}
.kx-mbox{background:#fff;border-radius:14px;width:min(920px,94vw);max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25)}
.kx-mhd{display:flex;align-items:center;gap:8px;padding:14px 16px;border-bottom:1px solid var(--line)}.kx-mhd b{flex:1;font-size:15px}.kx-mbd{padding:16px;overflow:auto;flex:1}
.kx-libgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:10px}.kx-libgrid button{border:1px solid #E1E3E8;border-radius:10px;background:#fff;padding:4px;cursor:pointer;height:110px;display:flex;align-items:center;justify-content:center}.kx-libgrid button:hover{border-color:#2F6FEB}.kx-libgrid img{max-width:100%;max-height:100px}
.kx-crop{position:relative;display:inline-block;user-select:none;max-width:100%}.kx-crop img{display:block;max-width:100%;max-height:60vh}
.kx-crop .box{position:absolute;border:2px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.5);cursor:move}.kx-crop .h{position:absolute;width:12px;height:12px;background:#fff;border:2px solid #2F6FEB;border-radius:3px;right:-7px;bottom:-7px;cursor:nwse-resize}`;
})();
