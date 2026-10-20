/* Buzzin Marketing · email templates, editor and brand kits (loaded by /marketing) */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const at = S.findIndex((x) => x.id === 'settings');
  S.splice(at, 0, { id: 'templates', icon: 'template', label: 'Email templates', render: renderTemplates }, { id: 'brand', icon: 'brush', label: 'Brand kits', render: renderBrand });
});

let TQ = '', TSRC = '', TSORT = 'edited', TVIEW = (() => { try { return localStorage.getItem('mk_tpl_view') || 'grid'; } catch (e) { return 'grid'; } })();
async function renderTemplates(el, id) {
  if (id) return window.MK_editTemplate(el, id);
  const KL = window.MK_KL || {}, I = (n) => `<i class="ti ti-${n}"></i>`;
  let r = await api('/api/mk/templates?' + qs({ store: STORE }));
  el.innerHTML = (KL.LCSS || '') + `<style>
    .tg{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px}
    .tc{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff;display:flex;flex-direction:column;cursor:pointer;transition:box-shadow .15s}.tc:hover{box-shadow:0 4px 16px rgba(0,0,0,.08)}
    .tc .th{height:300px;background:#EDEDED;position:relative;overflow:hidden;display:flex;justify-content:center}
    .tc .th iframe{width:640px;height:1000px;border:0;transform:scale(.3);transform-origin:top center;pointer-events:none;position:absolute;top:12px;left:50%;margin-left:-320px;background:#fff}
    .tc .th .ld{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#A1A1AA;font-size:13px}
    .tc .ft{display:flex;align-items:center;gap:8px;padding:12px 14px;border-top:1px solid var(--line)}.tc .ft .nm{flex:1;min-width:0}.tc .ft b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:15px}.tc .ft span{color:#52525B;font-size:13px}
    .tc .tag{position:absolute;top:8px;left:8px;z-index:1}.seg2{display:inline-flex;border:1px solid var(--line);border-radius:10px;overflow:hidden}.seg2 button{all:unset;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:40px;height:38px;color:#52525B}.seg2 button.on{background:#F4F4F5;color:#18181B}.seg2 button+button{border-left:1px solid var(--line)}
    .tpv{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:300;display:flex;align-items:center;justify-content:center}.tpv .bx{background:#fff;border-radius:14px;width:min(720px,94vw);height:90vh;display:flex;flex-direction:column;overflow:hidden}.tpv .hd{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)}.tpv iframe{flex:1;border:0;width:100%}
  </style><div class="kl"><div class="kl-h"><h1>Email templates</h1><button class="btn" id="ti">${I('download')} Re-import from Klaviyo</button><button class="btn pri" id="tcr">Create ${I('chevron-down')}</button></div>
    <div class="kl-b"><div class="kl-f" style="align-items:center"><input type="search" id="tq" placeholder="Search" value="${esc(TQ)}" aria-label="Search templates">
      <select id="tsrc" aria-label="Type"><option value="">Type</option><option value="klaviyo"${TSRC === 'klaviyo' ? ' selected' : ''}>From Klaviyo</option><option value="buzzin"${TSRC === 'buzzin' ? ' selected' : ''}>Made in Buzzin</option></select>
      <span style="flex:1"></span><select id="tsort" aria-label="Sort" style="border-style:solid"><option value="edited"${TSORT === 'edited' ? ' selected' : ''}>Edited most recently</option><option value="name"${TSORT === 'name' ? ' selected' : ''}>Name A–Z</option></select>
      <div class="seg2"><button data-tv="grid" class="${TVIEW === 'grid' ? 'on' : ''}" aria-label="Grid">${I('layout-grid')}</button><button data-tv="list" class="${TVIEW === 'list' ? 'on' : ''}" aria-label="List">${I('list')}</button></div></div>
      <div id="tbody"></div></div></div>`;
  const reload = async () => { r = await api('/api/mk/templates?' + qs({ store: STORE })); draw(); };
  const open = (t) => { location.hash = '#templates/' + t.id; };
  const thumb = async (t) => (await api(`/api/mk/templates/${t.id}/thumb`)).html;
  const preview = async (t) => {
    const d = document.createElement('div'); d.className = 'tpv'; d.innerHTML = `<div class="bx" role="dialog" aria-label="Preview"><div class="hd"><b style="flex:1">${esc(t.name)}</b><button class="btn xs" id="tpe">${I('pencil')} Edit</button><button class="btn xs" id="tpx" aria-label="Close">${I('x')}</button></div><iframe title="Email preview"></iframe></div>`;
    document.body.appendChild(d); const close = () => d.remove(); d.onclick = (e) => { if (e.target === d) close(); }; d.querySelector('#tpx').onclick = close; d.querySelector('#tpe').onclick = () => { close(); open(t); };
    try { d.querySelector('iframe').srcdoc = await thumb(t); } catch (e) { toast(e.message, 1); } };
  const menu = (t, anchor) => KL.menu(anchor, [
    ['Edit', 'pencil', () => open(t)],
    ['Rename', 'pencil', async () => { const n = prompt('Template name', t.name); if (!n || n === t.name) return; try { await api('/api/mk/templates/' + t.id + '/rename', { method: 'POST', body: JSON.stringify({ name: n }) }); toast('Renamed'); reload(); } catch (e) { toast(e.message, 1); } }],
    ['Clone', 'copy', async () => { try { const c = await api('/api/mk/templates', { method: 'POST', body: JSON.stringify({ store: t.store, copy_of: t.id }) }); toast('Copied'); open(c); } catch (e) { toast(e.message, 1); } }],
    ['Preview', 'eye', () => preview(t)],
    ['Delete', 'trash', async () => { if (!confirm(`Delete the template "${t.name}"?`)) return; try { await api('/api/mk/templates/' + t.id, { method: 'DELETE' }); toast('Deleted'); reload(); } catch (e) { toast(e.message, 1); } }, { danger: true }],
  ], { alignRight: true });
  let io = null;
  const draw = () => {
    const rows = r.templates.filter((t) => (!TQ || (t.name + ' ' + (t.subject || '')).toLowerCase().includes(TQ.toLowerCase())) && (!TSRC || (TSRC === 'klaviyo' ? t.source === 'klaviyo' : t.source !== 'klaviyo')))
      .sort((a, b) => (TSORT === 'name' ? a.name.localeCompare(b.name) : new Date(b.updated_at) - new Date(a.updated_at)));
    const B = $('tbody'); if (io) io.disconnect();
    if (TVIEW === 'list') {
      B.innerHTML = `<table><thead><tr><th>Name</th><th>Subject</th><th>Type</th><th>Edited</th><th style="width:44px"></th></tr></thead><tbody>${rows.map((t) => `<tr class="row"><td><a class="nm" href="#templates/${t.id}">${esc(t.name)}</a></td><td>${esc(t.subject || '—')}</td><td>${t.source === 'klaviyo' ? 'From Klaviyo' : 'Buzzin'}</td><td>${fmtD(t.updated_at)}</td><td><button class="dots" data-tm="${t.id}" aria-label="Options for ${esc(t.name)}">${I('dots-vertical')}</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">No templates match.</td></tr>'}</tbody></table>`;
    } else {
      B.innerHTML = `<div class="tg">${rows.map((t) => `<div class="tc" data-tid="${t.id}"><div class="th">${t.source === 'klaviyo' && !t.all_blocks ? '<span class="pill hon tag" title="Still one HTML block">HTML</span>' : ''}<div class="ld">Loading preview…</div></div>
        <div class="ft"><div class="nm"><b title="${esc(t.name)}">${esc(t.name)}</b><span>${fmtD(t.updated_at)}</span></div><button class="dots" data-tm="${t.id}" aria-label="Options for ${esc(t.name)}">${I('dots-vertical')}</button></div></div>`).join('') || '<div class="empty">No templates match.</div>'}</div>`;
      io = new IntersectionObserver((ents) => ents.forEach(async (en) => { if (!en.isIntersecting) return; io.unobserve(en.target); const t = rows.find((x) => String(x.id) === en.target.dataset.tid);
        try { const html = await thumb(t); const th = en.target.querySelector('.th'); const f = document.createElement('iframe'); f.setAttribute('title', t.name); f.setAttribute('tabindex', '-1'); f.setAttribute('sandbox', ''); f.srcdoc = html; th.querySelector('.ld').remove(); th.appendChild(f); } catch (e) { const ld = en.target.querySelector('.ld'); if (ld) ld.textContent = 'No preview'; } }), { rootMargin: '300px' });
      B.querySelectorAll('.tc').forEach((c) => { io.observe(c); c.onclick = () => open(rows.find((x) => String(x.id) === c.dataset.tid)); });
    }
    B.querySelectorAll('[data-tm]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); menu(r.templates.find((x) => String(x.id) === b.dataset.tm), b); });
  };
  $('tq').oninput = () => { TQ = $('tq').value; draw(); }; $('tsrc').onchange = () => { TSRC = $('tsrc').value; draw(); }; $('tsort').onchange = () => { TSORT = $('tsort').value; draw(); };
  el.querySelectorAll('[data-tv]').forEach((b) => b.onclick = () => { TVIEW = b.dataset.tv; try { localStorage.setItem('mk_tpl_view', TVIEW); } catch (e) {} el.querySelectorAll('[data-tv]').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  const st = () => STORE || 'lb';
  $('tcr').onclick = () => KL.menu($('tcr'), r.starters.map((x) => [x.key === 'blank' ? 'Blank email' : `Start from: ${x.name}`, x.key === 'blank' ? 'file' : 'template', async () => { try { const t = await api('/api/mk/templates', { method: 'POST', body: JSON.stringify({ store: st(), starter: x.key }) }); open(t); } catch (e) { toast(e.message, 1); } }]), { alignRight: true });
  $('ti').onclick = async () => { const b = $('ti'); b.disabled = true; b.innerHTML = `${I('download')} Importing… (about a minute)`; try { const x = await api('/api/mk/templates/import-klaviyo', { method: 'POST', body: '{}' }); toast(`${x.imported} templates imported`); reload(); } catch (e) { toast(e.message, 1); } b.disabled = false; b.innerHTML = `${I('download')} Re-import from Klaviyo`; };
  draw();
}


async function imagePicker(host, onPick) {
  host.innerHTML = `<label class="btn xs" style="margin-top:4px"><i class="ti ti-upload"></i> Upload<input type="file" accept="image/*" hidden id="imgUp"></label> <button class="btn xs" id="imgLib"><i class="ti ti-photo"></i> Library</button><div id="imgGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px"></div>`;
  $('imgUp').onchange = async (e) => { const file = e.target.files[0]; if (!file) return; try { const r = await fetch(`/api/mk/images?store=${STORE || ''}&name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type, Authorization: 'Bearer ' + KEY }, body: file }); const j = await r.json(); if (!r.ok) throw new Error(j.error); onPick(j.url, { name: j.name || file.name }); } catch (err) { toast(err.message, 1); } };
  $('imgLib').onclick = async () => { const { images } = await api('/api/mk/images?' + qs({ store: STORE })); $('imgGrid').innerHTML = images.map((i) => `<button class="btn xs" data-u="${esc(i.url)}" data-n="${esc(i.name || '')}" style="padding:2px;height:56px"><img src="${esc(i.url)}" alt="${esc(i.name)}" style="max-width:100%;max-height:50px"></button>`).join('') || '<span style="color:var(--muted)">No images yet</span>'; $('imgGrid').querySelectorAll('[data-u]').forEach((b) => b.onclick = () => onPick(b.dataset.u, { name: b.dataset.n || '' })); };
}
async function aiPick(kind, brief, use, current) {
  const box = document.createElement('div'); box.className = 'drawer'; box.innerHTML = `<div class="hd"><b>Emily's options</b><span class="sp"></span><button class="btn xs" id="aix" aria-label="Close"><i class="ti ti-x"></i></button></div><div class="bd"><label class="lab" for="aib">What should it say?</label><textarea id="aib" rows="4" style="width:100%">${esc(brief)}</textarea><button class="btn pri" id="aig" style="margin-top:8px"><i class="ti ti-sparkles"></i> Write options</button><div id="aio" style="margin-top:14px"></div></div>`;
  document.body.appendChild(box); $('aix').onclick = () => box.remove();
  $('aig').onclick = async () => { $('aio').innerHTML = '<div class="empty">Writing…</div>'; try { const r = await api('/api/mk/ai/copy', { method: 'POST', body: JSON.stringify({ store: (window.MKE && window.MKE.ST && window.MKE.ST.t.store) || STORE || 'lb', kind, brief: $('aib').value, current }) });
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
