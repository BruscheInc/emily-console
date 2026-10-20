/* Buzzin Marketing · email templates, editor and brand kits (loaded by /marketing) */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const at = S.findIndex((x) => x.id === 'settings');
  S.splice(at, 0, { id: 'templates', icon: 'template', label: 'Email templates', render: renderTemplates }, { id: 'brand', icon: 'brush', label: 'Brand kits', render: renderBrand });
});

async function renderTemplates(el, id) {
  if (id) return window.MK_editTemplate(el, id);
  const r = await api('/api/mk/templates?' + qs({ store: STORE }));
  el.innerHTML = `<h1>Email templates</h1><p class="sub">Every email flows and campaigns send is built here from blocks. Click any block in an email to edit it. Klaviyo emails import with their real blocks; any still marked HTML can be opened and rebuilt with blocks.</p>
  <div class="bar"><select id="ts"${STORE ? '' : ' disabled'}><option value="">Start from…</option>${r.starters.map((s) => `<option value="${s.key}">${esc(s.name)}</option>`).join('')}</select>
    <button class="btn pri" id="tn"${STORE ? '' : ' disabled title="Pick a store first"'}><i class="ti ti-plus"></i> New email</button>
    <button class="btn" id="ti"><i class="ti ti-download"></i> Re-import from Klaviyo</button>${STORE ? '' : '<span style="color:var(--muted)">Pick a store at the top to create one.</span>'}</div>
  <div class="card" style="padding:6px"><div class="tw"><table><thead><tr><th>Name</th><th>Subject</th><th>Store</th><th>From</th><th>Updated</th></tr></thead><tbody>
  ${r.templates.map((t) => `<tr class="click" data-id="${t.id}"><td><b>${esc(t.name)}</b></td><td>${esc(t.subject || '—')}</td><td>${t.store === 'lbo' ? 'Outlet' : 'LB'}</td><td>${t.source === 'klaviyo' ? '<span class="pill blue">Klaviyo</span>' : '<span class="pill off">Buzzin</span>'}${t.source === 'klaviyo' && !t.all_blocks ? ' <span class="pill hon" title="Still one HTML block. Open it and click Rebuild with blocks, or re-import from Klaviyo.">HTML</span>' : ''}</td><td>${fmtD(t.updated_at)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No templates yet.</td></tr>'}
  </tbody></table></div></div>`;
  el.querySelectorAll('tr.click').forEach((tr) => tr.onclick = () => { location.hash = '#templates/' + tr.dataset.id; });
  $('tn').onclick = async () => { try { const t = await api('/api/mk/templates', { method: 'POST', body: JSON.stringify({ store: STORE, starter: $('ts').value || 'blank' }) }); location.hash = '#templates/' + t.id; } catch (e) { toast(e.message, 1); } };
  $('ti').onclick = async () => { const b = $('ti'); b.disabled = true; b.innerHTML = '<i class="ti ti-download"></i> Importing… (about a minute)'; try { const x = await api('/api/mk/templates/import-klaviyo', { method: 'POST', body: '{}' }); toast(`${x.imported} templates imported · ${x.with_layout || 0} with Klaviyo's block layout${x.fetched && x.fetched.error ? ' · ' + x.fetched.error : ''}`, x.fetched && x.fetched.error); go(); } catch (e) { toast(e.message, 1); b.disabled = false; } };
}


async function imagePicker(host, onPick) {
  host.innerHTML = `<label class="btn xs" style="margin-top:4px"><i class="ti ti-upload"></i> Upload<input type="file" accept="image/*" hidden id="imgUp"></label> <button class="btn xs" id="imgLib"><i class="ti ti-photo"></i> Library</button><div id="imgGrid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px"></div>`;
  $('imgUp').onchange = async (e) => { const file = e.target.files[0]; if (!file) return; try { const r = await fetch(`/api/mk/images?store=${STORE || ''}&name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': file.type, Authorization: 'Bearer ' + KEY }, body: file }); const j = await r.json(); if (!r.ok) throw new Error(j.error); onPick(j.url); } catch (err) { toast(err.message, 1); } };
  $('imgLib').onclick = async () => { const { images } = await api('/api/mk/images?' + qs({ store: STORE })); $('imgGrid').innerHTML = images.map((i) => `<button class="btn xs" data-u="${esc(i.url)}" style="padding:2px;height:56px"><img src="${esc(i.url)}" alt="${esc(i.name)}" style="max-width:100%;max-height:50px"></button>`).join('') || '<span style="color:var(--muted)">No images yet</span>'; $('imgGrid').querySelectorAll('[data-u]').forEach((b) => b.onclick = () => onPick(b.dataset.u)); };
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
