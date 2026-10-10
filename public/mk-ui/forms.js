/* Buzzin Marketing · Form Studio (loaded by /marketing) */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const at = S.findIndex((x) => x.id === 'templates');
  S.splice(at, 0, { id: 'forms', icon: 'forms', label: 'Sign-up forms', render: renderForms });
});
const STATUS = { draft: ['off', 'Draft'], preview: ['hon', 'Preview only'], live: ['ok', 'Live'] };
const SHOP = { lb: 'https://larkspurbaby.com', lbo: 'https://larkspurbabyoutlet.com' };

async function renderForms(el, id) {
  if (id) return editForm(el, id);
  const r = await api('/api/mk/forms?' + qs({ store: STORE }));
  el.innerHTML = `<h1>Sign-up forms</h1><p class="sub">Popups, flyouts, banners and embedded forms for the store. A form only appears on the store when it's Live, or when you open the store with the preview link.</p>
  <div class="bar"><button class="btn pri" id="fn"${STORE ? '' : ' disabled title="Pick a store first"'}><i class="ti ti-plus"></i> New form</button>${STORE ? '' : '<span style="color:var(--muted)">Pick a store at the top to create one.</span>'}</div>
  <div class="card" style="padding:6px"><div class="tw"><table><thead><tr><th>Form</th><th>Store</th><th>Status</th><th>Type</th><th class="n">Views</th><th class="n">Emails</th><th class="n">Phones</th><th class="n">Sign-up rate</th></tr></thead><tbody>
  ${r.forms.map((f) => `<tr class="click" data-id="${f.id}"><td><b>${esc(f.name)}</b></td><td>${f.store === 'lbo' ? 'Outlet' : 'LB'}</td><td>${pill(STATUS, f.status)}</td><td>${esc((f.style || {}).layout || 'popup')}</td><td class="n">${fmtN(f.views)}</td><td class="n">${fmtN(f.emails)}</td><td class="n">${fmtN(f.phones)}</td><td class="n">${f.views ? (Math.round(f.emails / f.views * 1000) / 10) + '%' : '—'}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">No forms yet.</td></tr>'}
  </tbody></table></div></div>
  ${r.klaviyo.length ? `<div class="card" style="margin-top:12px"><b>Your Klaviyo forms</b><p class="sub" style="margin:4px 0 8px">For reference while rebuilding them here.</p>${r.klaviyo.map((k) => `<span class="pill off" style="margin-right:6px">${esc(k.name)} · ${esc(k.status || '')}</span>`).join('')}</div>` : ''}`;
  el.querySelectorAll('tr.click').forEach((tr) => tr.onclick = () => { location.hash = '#forms/' + tr.dataset.id; });
  $('fn').onclick = async () => { try { const f = await api('/api/mk/forms', { method: 'POST', body: JSON.stringify({ store: STORE, name: 'Welcome popup' }) }); location.hash = '#forms/' + f.id; } catch (e) { toast(e.message, 1); } };
}

let F = null, TAB = 'steps', SI = 0, FDEV = 'desk', fdirty = false;
async function editForm(el, id) {
  F = await api('/api/mk/forms/' + id); fdirty = false; SI = 0;
  el.style.padding = '0';
  el.innerHTML = `<div style="display:flex;flex-direction:column;height:100%">
  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 16px;background:#fff;border-bottom:1px solid var(--line)">
    <a href="#forms" class="btn xs" aria-label="Back"><i class="ti ti-arrow-left"></i></a><input id="fnm" type="text" value="${esc(F.name)}" aria-label="Form name" style="font-weight:700;min-width:200px">
    <select id="fst" aria-label="Status"><option value="draft">Draft</option><option value="preview">Preview only</option><option value="live">Live</option></select>
    <span class="sp"></span><span class="pill hon hidden" id="fdirty">Unsaved</span>
    <a class="btn" id="fopen" target="_blank" rel="noopener" href="${SHOP[F.store]}/?buzzin_form=preview"><i class="ti ti-external-link"></i> Open on the store (preview)</a>
    <button class="btn danger" id="fdel"><i class="ti ti-trash"></i></button><button class="btn pri" id="fsave">Save</button></div>
  <div style="flex:1;display:flex;min-height:0">
    <div style="width:380px;flex:none;border-right:1px solid var(--line);background:#fff;overflow-y:auto">
      <div class="seg" id="ftabs" style="margin:12px"><button data-t="steps">Steps</button><button data-t="design">Design</button><button data-t="who">When &amp; who</button><button data-t="offer">Offer &amp; list</button></div>
      <div id="fpanel" style="padding:0 14px 40px"></div></div>
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;background:#ECEAE5">
      <div style="display:flex;gap:8px;align-items:center;padding:10px 14px"><div class="seg" id="fdev"><button data-d="desk" class="on"><i class="ti ti-device-desktop"></i> Desktop</button><button data-d="mob"><i class="ti ti-device-mobile"></i> Phone</button></div>
        <button class="btn xs" id="freplay"><i class="ti ti-refresh"></i> Replay</button><span class="sp"></span><span id="fstat" style="color:var(--muted);font-size:12px"></span></div>
      <div style="flex:1;overflow:auto;display:flex;justify-content:center;padding:0 14px 14px"><iframe id="fpv" title="Form preview" style="border:0;background:#fff;border-radius:12px;width:1000px;max-width:100%;height:100%;min-height:620px"></iframe></div></div></div></div>`;
  $('fst').value = F.status;
  const st = F.stats && F.stats.live; $('fstat').textContent = st ? `Live: ${fmtN(st.viewed)} views · ${fmtN(st.emails)} emails · ${fmtN(st.phones)} phones · ${st.rate}% sign-up rate · ${fmtN(F.stats.orders)} orders, ${fmt$(F.stats.revenue)}` : '';
  const mark = () => { fdirty = true; $('fdirty').classList.remove('hidden'); fpreview(); };
  window.__fMark = mark;
  $('fnm').oninput = () => { F.name = $('fnm').value; mark(); };
  $('fst').onchange = () => { F.status = $('fst').value; mark(); };
  $('ftabs').querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.t === TAB); b.onclick = () => { TAB = b.dataset.t; $('ftabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); panel(); }; });
  $('fdev').querySelectorAll('button').forEach((b) => b.onclick = () => { FDEV = b.dataset.d; $('fdev').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); $('fpv').style.width = FDEV === 'mob' ? '390px' : '1000px'; fpreview(); });
  $('freplay').onclick = fpreview;
  $('fsave').onclick = async () => { try { F = { ...F, ...(await api('/api/mk/forms/' + F.id, { method: 'PUT', body: JSON.stringify(F) })) }; fdirty = false; $('fdirty').classList.add('hidden'); $('fst').value = F.status; toast('Saved'); } catch (e) { toast(e.message, 1); } };
  $('fdel').onclick = async () => { if ($('fdel').dataset.c !== '1') { $('fdel').dataset.c = '1'; $('fdel').textContent = 'Click again to delete'; return; } try { await api('/api/mk/forms/' + F.id, { method: 'DELETE' }); location.hash = '#forms'; } catch (e) { toast(e.message, 1); } };
  window.onbeforeunload = () => fdirty ? 'Unsaved changes' : undefined;
  panel(); fpreview();
}
function fpreview() {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;font:15px Helvetica,Arial,sans-serif;background:#fff}.nav{height:56px;border-bottom:1px solid #eee;display:flex;align-items:center;padding:0 20px;font-weight:700;letter-spacing:.04em}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px;padding:20px}.g div{aspect-ratio:3/4;background:#EEF1F5;border-radius:8px}</style></head>
  <body><div class="nav">${esc(STORE_NAME[F.store] || '')}</div><div id="bzf-embed" style="max-width:640px;margin:20px auto"></div><div class="g"><div></div><div></div><div></div><div></div><div></div><div></div></div>
  <script>window.BZF_STUDIO=1;window.BZF_ORIGIN=${JSON.stringify(location.origin)};window.BZF_STORE=${JSON.stringify(F.store)};<\/script><script src="${location.origin}/mk-forms-runtime.js"><\/script>
  <script>try{BuzzinFormsShow(${JSON.stringify({ id: F.id, steps: F.steps, style: F.style, targeting: F.targeting, teaser: F.teaser, sms_consent_text: F.sms_consent_text, email_consent_text: F.email_consent_text }).replace(/</g, '\\u003c')});}catch(e){document.body.insertAdjacentHTML('beforeend','<pre>'+e.message+'</pre>')}<\/script></body></html>`;
  $('fpv').srcdoc = html;
}
const fl = (label, inner, hint) => `<label class="lab">${esc(label)}</label>${inner}${hint ? `<div style="font-size:11.5px;color:var(--muted);margin-top:3px">${esc(hint)}</div>` : ''}`;
function panel() {
  const P = $('fpanel'), mark = window.__fMark;
  if (TAB === 'steps') {
    const s = F.steps[SI] || F.steps[0];
    P.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">${F.steps.map((x, i) => `<div style="display:flex;gap:6px;align-items:center"><button class="btn xs" data-si="${i}" style="flex:1;justify-content:flex-start;${i === SI ? 'border-color:var(--ink);box-shadow:0 0 0 1px var(--ink) inset' : ''}"><b>${i + 1}</b> · ${esc({ email: 'Email', phone: 'Phone', question: 'Questions', success: 'Success' }[x.kind])} — ${esc((x.title || '').slice(0, 26))}</button><button class="btn xs" data-up="${i}" aria-label="Move up"${i ? '' : ' disabled'}>↑</button><button class="btn xs danger" data-rm="${i}" aria-label="Remove"${F.steps.length > 1 ? '' : ' disabled'}>×</button></div>`).join('')}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">${['email', 'phone', 'question', 'success'].map((k) => `<button class="btn xs" data-add="${k}"><i class="ti ti-plus"></i> ${k === 'question' ? 'Questions' : k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
      ${s ? `${fl('Small line above the title', `<input type="text" data-s="eyebrow" value="${esc(s.eyebrow || '')}" style="width:100%">`)}${fl('Title', `<input type="text" data-s="title" value="${esc(s.title || '')}" style="width:100%">`)}
        ${fl('Text', `<textarea data-s="text" rows="3" style="width:100%">${esc(s.text || '')}</textarea>`)}<button class="btn xs" id="faiw" style="margin-top:6px"><i class="ti ti-sparkles"></i> Ask Emily for wording</button>
        ${fl('Button', `<input type="text" data-s="button" value="${esc(s.button || '')}" style="width:100%">`)}
        ${s.kind === 'email' ? fl('"No thanks" text', `<input type="text" data-s="decline" value="${esc(s.decline || '')}" style="width:100%">`) : ''}
        ${s.kind === 'phone' || s.kind === 'question' ? fl('Skip text', `<input type="text" data-s="skip" value="${esc(s.skip || '')}" style="width:100%">`) : ''}
        ${s.kind === 'success' ? fl('Button link', `<input type="text" data-s="link" value="${esc(s.link || '/')}" style="width:100%">`, 'The coupon code shows automatically on this step.') : ''}
        ${s.kind === 'question' ? `<div style="margin-top:10px;font-weight:700">Questions</div>${(s.fields || []).map((q, i) => `<div class="card" style="padding:10px;margin-top:6px">${fl('Question', `<input type="text" data-q="${i}" data-qk="label" value="${esc(q.label)}" style="width:100%">`)}<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">${fl('Saved as', `<input type="text" data-q="${i}" data-qk="key" value="${esc(q.key)}" style="width:100%">`)}${fl('Type', `<select data-q="${i}" data-qk="type" style="width:100%"><option value="choice"${q.type === 'choice' ? ' selected' : ''}>Choices</option><option value="date"${q.type === 'date' ? ' selected' : ''}>Date</option><option value="text"${q.type === 'text' ? ' selected' : ''}>Text</option></select>`)}</div>${q.type === 'choice' ? fl('Choices (one per line)', `<textarea data-q="${i}" data-qk="options" rows="3" style="width:100%">${esc((q.options || []).join('\n'))}</textarea>`) : ''}<button class="btn xs danger" data-qrm="${i}" style="margin-top:6px">Remove question</button></div>`).join('')}<button class="btn xs" id="qadd" style="margin-top:6px"><i class="ti ti-plus"></i> Add question</button>
          <div style="margin-top:12px;font-weight:700">Go to a different step based on an answer</div>${(s.branches || []).map((b, i) => `<div style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:4px;margin-top:4px"><input type="text" data-b="${i}" data-bk="field" value="${esc(b.field || '')}" placeholder="saved as"><input type="text" data-b="${i}" data-bk="equals" value="${esc(b.equals || '')}" placeholder="answer"><select data-b="${i}" data-bk="go">${F.steps.map((x) => `<option value="${x.id}"${b.go === x.id ? ' selected' : ''}>Step ${F.steps.indexOf(x) + 1}</option>`).join('')}</select><button class="btn xs" data-brm="${i}">×</button></div>`).join('')}<button class="btn xs" id="badd" style="margin-top:6px"><i class="ti ti-plus"></i> Add rule</button>` : ''}
        ${s.kind === 'phone' ? fl('Text consent wording (required)', `<textarea id="smsc" rows="5" style="width:100%">${esc(F.sms_consent_text || '')}</textarea>`, 'Shown under the phone field. Carriers and the TCPA require this disclosure.') : ''}
        ${s.kind === 'email' ? fl('Email consent line', `<textarea id="emc" rows="2" style="width:100%">${esc(F.email_consent_text || '')}</textarea>`) : ''}` : ''}`;
    P.querySelectorAll('[data-si]').forEach((b) => b.onclick = () => { SI = Number(b.dataset.si); panel(); });
    P.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => { const i = Number(b.dataset.up); [F.steps[i - 1], F.steps[i]] = [F.steps[i], F.steps[i - 1]]; SI = i - 1; panel(); mark(); });
    P.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { F.steps.splice(Number(b.dataset.rm), 1); SI = 0; panel(); mark(); });
    P.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => { const k = b.dataset.add; const nid = 's' + Math.random().toString(36).slice(2, 7); F.steps.push({ id: nid, kind: k, title: { email: 'Join us', phone: 'Get texts', question: 'Tell us more', success: "You're in!" }[k], button: k === 'success' ? 'Start shopping' : 'Continue', fields: k === 'question' ? [{ key: 'baby_date', label: "Baby's due date or birthday", type: 'date' }] : undefined }); SI = F.steps.length - 1; panel(); mark(); });
    P.querySelectorAll('[data-s]').forEach((x) => x.oninput = () => { s[x.dataset.s] = x.value; mark(); });
    P.querySelectorAll('[data-q]').forEach((x) => x.oninput = () => { const q = s.fields[Number(x.dataset.q)]; q[x.dataset.qk] = x.dataset.qk === 'options' ? x.value.split('\n').map((y) => y.trim()).filter(Boolean) : x.dataset.qk === 'key' ? x.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() : x.value; if (x.dataset.qk === 'type') panel(); mark(); });
    P.querySelectorAll('[data-qrm]').forEach((x) => x.onclick = () => { s.fields.splice(Number(x.dataset.qrm), 1); panel(); mark(); });
    const qa = $('qadd'); if (qa) qa.onclick = () => { s.fields = s.fields || []; s.fields.push({ key: 'answer_' + (s.fields.length + 1), label: 'New question', type: 'choice', options: ['Yes', 'No'] }); panel(); mark(); };
    P.querySelectorAll('[data-b]').forEach((x) => x.oninput = () => { s.branches[Number(x.dataset.b)][x.dataset.bk] = x.value; mark(); });
    P.querySelectorAll('[data-brm]').forEach((x) => x.onclick = () => { s.branches.splice(Number(x.dataset.brm), 1); panel(); mark(); });
    const ba = $('badd'); if (ba) ba.onclick = () => { s.branches = s.branches || []; s.branches.push({ field: (s.fields[0] || {}).key || '', equals: '', go: (F.steps[SI + 1] || F.steps[0]).id }); panel(); mark(); };
    const sc = $('smsc'); if (sc) sc.oninput = () => { F.sms_consent_text = sc.value; mark(); };
    const ec = $('emc'); if (ec) ec.oninput = () => { F.email_consent_text = ec.value; mark(); };
    const aw = $('faiw'); if (aw) aw.onclick = () => window.MK_aiPick('form', `Sign-up form step "${s.kind}" for ${STORE_NAME[F.store]}. Offer: ${F.coupon && F.coupon.enabled ? F.coupon.percent + '% off the first order' : 'none'}.`, (o) => { s.title = o.headline || s.title; s.text = o.subline || s.text; panel(); mark(); });
  }
  if (TAB === 'design') {
    const y = F.style, c = y.colors || (y.colors = {});
    const col = (k, l) => `<div>${fl(l, `<div style="display:flex;gap:6px"><input type="color" data-c="${k}" value="${esc(c[k] || '#ffffff')}" style="width:40px;height:34px;border:1px solid var(--line);border-radius:8px;padding:2px"><input type="text" data-ct="${k}" value="${esc(c[k] || '')}" style="width:100px;font-family:ui-monospace,Menlo,monospace;font-size:12px"></div>`)}</div>`;
    P.innerHTML = `${fl('Type', `<select id="dl" style="width:100%">${[['popup', 'Popup'], ['flyout', 'Flyout (corner)'], ['full', 'Full screen on phones'], ['banner', 'Banner'], ['embedded', 'Embedded in a page']].map(([a, l]) => `<option value="${a}"${y.layout === a ? ' selected' : ''}>${l}</option>`).join('')}</select>`, y.layout === 'embedded' ? `Add <div data-buzzin-form="${F.id}"></div> where it should appear in the theme.` : '')}
      ${fl('Side image', `<div id="dimg"></div><input type="text" id="di" value="${esc(y.image || '')}" placeholder="Image address" style="width:100%;margin-top:6px">`, 'Hidden on phones.')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">${fl('Width (px)', `<input type="number" id="dw" min="280" max="760" value="${y.width || 460}" style="width:100%">`)}${fl('Corner radius', `<input type="number" id="dr" min="0" max="40" value="${y.radius == null ? 16 : y.radius}" style="width:100%">`)}
      ${fl('Text align', `<select id="da" style="width:100%"><option value="center"${y.align !== 'left' ? ' selected' : ''}>Center</option><option value="left"${y.align === 'left' ? ' selected' : ''}>Left</option></select>`)}${fl('Flyout side', `<select id="ds" style="width:100%"><option value="right"${y.side !== 'left' ? ' selected' : ''}>Right</option><option value="left"${y.side === 'left' ? ' selected' : ''}>Left</option></select>`)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">${col('bg', 'Background')}${col('text', 'Text')}${col('button', 'Button')}${col('button_text', 'Button text')}</div>
      ${fl('Heading font', `<select id="dhf" style="width:100%">${['Georgia, serif', "'Playfair Display', Georgia, serif", 'Helvetica, Arial, sans-serif'].map((v) => `<option${y.heading_font === v ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`)}
      ${fl('Teaser after closing', `<input type="text" id="dt" value="${esc((F.teaser || {}).text || '')}" placeholder="Leave empty for none" style="width:100%">`)}`;
    const set = (k, v) => { y[k] = v; mark(); };
    $('dl').onchange = (e) => { set('layout', e.target.value); panel(); }; $('di').oninput = (e) => set('image', e.target.value);
    $('dw').oninput = (e) => set('width', Number(e.target.value)); $('dr').oninput = (e) => set('radius', Number(e.target.value)); $('da').onchange = (e) => set('align', e.target.value); $('ds').onchange = (e) => set('side', e.target.value); $('dhf').onchange = (e) => set('heading_font', e.target.value);
    $('dt').oninput = (e) => { F.teaser = { ...(F.teaser || {}), text: e.target.value }; mark(); };
    P.querySelectorAll('[data-c]').forEach((x) => x.oninput = () => { c[x.dataset.c] = x.value; P.querySelector(`[data-ct="${x.dataset.c}"]`).value = x.value; mark(); });
    P.querySelectorAll('[data-ct]').forEach((x) => x.oninput = () => { c[x.dataset.ct] = x.value; mark(); });
    if (window.MK_imagePicker) window.MK_imagePicker($('dimg'), (url) => { y.image = location.origin + url; $('di').value = y.image; mark(); });
  }
  if (TAB === 'who') {
    const t = F.targeting;
    P.innerHTML = `<div style="font-weight:700;margin-top:8px">Show it</div>
      ${fl('After this many seconds', `<input type="number" id="td" min="0" max="120" value="${t.delay_s == null ? '' : t.delay_s}" placeholder="off" style="width:120px">`)}
      ${fl('After scrolling this far (%)', `<input type="number" id="tsc" min="0" max="100" value="${t.scroll_pct == null ? '' : t.scroll_pct}" placeholder="off" style="width:120px">`)}
      <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="tex"${t.exit_intent ? ' checked' : ''}> When they move to leave (desktop)</label>
      <div style="font-weight:700;margin-top:16px">To whom</div>
      ${fl('Device', `<select id="tdev" style="width:100%"><option value="all">Phones and computers</option><option value="mobile">Phones only</option><option value="desktop">Computers only</option></select>`)}
      ${fl('Visitors', `<select id="tvis" style="width:100%"><option value="all">Everyone</option><option value="new">First visit only</option><option value="returning">Returning visitors only</option></select>`)}
      <label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="ths"${t.hide_subscribed !== false ? ' checked' : ''}> Never show to people who already signed up</label>
      ${fl('After someone closes it, wait this many days', `<input type="number" id="thd" min="0" max="365" value="${t.hide_days_after_close == null ? 14 : t.hide_days_after_close}" style="width:120px">`)}
      ${fl('Only when the link has utm_source', `<input type="text" id="tutm" value="${esc(t.utm_source || '')}" placeholder="e.g. facebook" style="width:100%">`, 'For a form just for ad traffic, like your Meta new-users list.')}
      <div style="font-weight:700;margin-top:16px">Where</div>
      ${fl('Only on these pages', `<textarea id="top" rows="2" style="width:100%" placeholder="/collections/*&#10;/products/*">${esc(t.only_paths || '')}</textarea>`, 'One per line. * matches anything after. Empty = every page except cart and checkout.')}
      ${fl('Never on these pages', `<textarea id="thp" rows="2" style="width:100%">${esc(t.hide_paths || '')}</textarea>`)}
      ${fl('Priority', `<input type="number" id="tpr" value="${F.priority || 0}" style="width:120px">`, 'When two forms could show, the higher number wins. Only one popup shows at a time.')}`;
    $('tdev').value = t.device || 'all'; $('tvis').value = t.visitors || 'all';
    const num = (v) => v === '' ? null : Number(v);
    $('td').oninput = (e) => { t.delay_s = num(e.target.value); mark(); }; $('tsc').oninput = (e) => { t.scroll_pct = num(e.target.value); mark(); };
    $('tex').onchange = (e) => { t.exit_intent = e.target.checked; mark(); }; $('tdev').onchange = (e) => { t.device = e.target.value; mark(); }; $('tvis').onchange = (e) => { t.visitors = e.target.value; mark(); };
    $('ths').onchange = (e) => { t.hide_subscribed = e.target.checked; mark(); }; $('thd').oninput = (e) => { t.hide_days_after_close = Number(e.target.value); mark(); };
    $('tutm').oninput = (e) => { t.utm_source = e.target.value.trim(); mark(); }; $('top').oninput = (e) => { t.only_paths = e.target.value; mark(); }; $('thp').oninput = (e) => { t.hide_paths = e.target.value; mark(); };
    $('tpr').oninput = (e) => { F.priority = Number(e.target.value) || 0; mark(); };
  }
  if (TAB === 'offer') {
    const c = F.coupon || (F.coupon = {});
    P.innerHTML = `<label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="oc"${c.enabled ? ' checked' : ''}> Give each person their own single-use code</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 10px">${fl('Percent off', `<input type="number" id="op" min="1" max="90" value="${c.percent || 10}" style="width:100%">`)}${fl('Expires after (days)', `<input type="number" id="oe" min="1" max="365" value="${c.expires_days || 14}" style="width:100%">`)}</div>
      ${fl('Code starts with', `<input type="text" id="opx" value="${esc(c.prefix || 'WELCOME')}" style="width:100%">`)}
      <div class="note" style="margin-top:10px">Real codes are created in Shopify only when this form is Live. In preview, people see a sample code and nothing is created.</div>
      ${fl('Add sign-ups to this list', `<select id="ol" style="width:100%">${(F.lists || []).map((l) => `<option value="${l.id}"${Number(F.list_id) === Number(l.id) ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`, 'Joining the list starts any flow triggered by it, like New-Customer-SignUp.')}`;
    $('oc').onchange = (e) => { c.enabled = e.target.checked; mark(); }; $('op').oninput = (e) => { c.percent = Number(e.target.value); mark(); }; $('oe').oninput = (e) => { c.expires_days = Number(e.target.value); mark(); };
    $('opx').oninput = (e) => { c.prefix = e.target.value; mark(); }; $('ol').onchange = (e) => { F.list_id = Number(e.target.value); mark(); };
  }
}
})();
