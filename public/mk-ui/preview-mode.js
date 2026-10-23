/* Buzzin Marketing · Preview mode, laid out like Klaviyo's: the email (or text) on the left with Desktop / Mobile,
   and on the right: who it's filled in for, every link in it, its size (Gmail clips past ~102 KB), and Send a test.
   Test recipients are prefilled with the last ones used (or the first on the internal test list).

   BZ_preview({
     kind: 'email' | 'sms', title,
     render: async ({ profile_id }) => email: { html, subject, preview }  ·  sms: { body, chars, segments, encoding },
     send:   async (to) => { status, reason } | { results: [{ status, reason, version }] },
     beforeSend: async () => {},   // e.g. save unsaved changes
     focusSend: true,              // open with the cursor in the Send box
   }) */
(() => {
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const I = (n) => `<i class="ti ti-${n}"></i>`;
const KEY = { email: 'bz_test_to_email', sms: 'bz_test_to_sms' };
const LS = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const CSS = `<style id="bzpv-css">
.bzpv{position:fixed;inset:0;z-index:900;background:#fff;display:flex;flex-direction:column;font-family:var(--bz-font,inherit);color:var(--bz-ink,#18181B)}
.bzpv-h{display:flex;align-items:center;gap:12px;padding:16px 28px;border-bottom:1px solid var(--bz-line,#E5E7EB)}
.bzpv-h h2{margin:0;font-size:20px;font-weight:650;letter-spacing:-.01em;flex:1}.bzpv-h .t{color:var(--bz-muted,#71717A);font-size:13.5px;font-weight:500;margin-left:10px}
.bzpv-b{flex:1;display:grid;grid-template-columns:minmax(0,1fr) 420px;min-height:0}
.bzpv-l{display:flex;flex-direction:column;min-height:0;background:#E5E7EB}
.bzpv-bar{display:flex;justify-content:center;padding:12px;background:#fff;border-bottom:1px solid var(--bz-line,#E5E7EB)}
.bzpv-seg{display:inline-flex;background:#F3F4F6;border-radius:9px;padding:3px}.bzpv-seg button{all:unset;cursor:pointer;padding:6px 14px;border-radius:7px;font-size:13.5px;color:#52525B;display:inline-flex;gap:6px;align-items:center}.bzpv-seg button.on{background:#fff;color:#18181B;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.bzpv-cv{flex:1;overflow:auto;padding:28px 20px 60px;display:flex;flex-direction:column;align-items:center}
.bzpv-inbox{width:680px;max-width:100%;background:#fff;border-radius:10px 10px 0 0;padding:14px 18px;border-bottom:1px solid #EEE;box-sizing:border-box;transition:width .2s}
.bzpv-inbox b{display:block;font-size:15px}.bzpv-inbox span{display:block;color:#71717A;font-size:13px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bzpv-fr{width:680px;max-width:100%;border:0;background:#fff;display:block;border-radius:0 0 10px 10px;min-height:400px;transition:width .2s;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.bzpv.mob .bzpv-inbox,.bzpv.mob .bzpv-fr{width:390px}
.bzpv-phone{width:340px;background:#fff;border-radius:34px;border:10px solid #18181B;min-height:560px;padding:18px 14px;box-sizing:border-box;display:flex;flex-direction:column}
.bzpv-phone .who{text-align:center;font-size:12px;color:#71717A;margin-bottom:14px}.bzpv-bub{align-self:flex-start;max-width:85%;background:#E9E9EB;border-radius:18px;padding:10px 14px;white-space:pre-wrap;font-size:14.5px;line-height:1.4;word-break:break-word}
.bzpv-bub a{color:#0B63E5}
.bzpv-r{border-left:1px solid var(--bz-line,#E5E7EB);overflow:auto;background:#fff}
.bzpv-s{padding:22px 26px;border-bottom:1px solid var(--bz-line,#E5E7EB)}.bzpv-s h3{margin:0 0 6px;font-size:15.5px;font-weight:650}.bzpv-s .sub{color:var(--bz-muted,#71717A);font-size:13.5px;line-height:1.45;margin:0 0 12px}
.bzpv-s details summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;font-size:15.5px;font-weight:650}.bzpv-s details summary::-webkit-details-marker{display:none}.bzpv-s details summary i{transition:transform .15s;color:#71717A}.bzpv-s details[open] summary i{transform:rotate(90deg)}
.bzpv-s details summary .n{margin-left:auto;font-size:12px;font-weight:600;color:#71717A;background:#F3F4F6;border-radius:999px;padding:1px 8px}
.bzpv-lk{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-bottom:1px solid #F3F4F6;font-size:13px}.bzpv-lk:last-child{border-bottom:0}
.bzpv-lk .x{flex:1;min-width:0}.bzpv-lk .x b{display:block;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bzpv-lk .x span{display:block;color:#71717A;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bzpv-lk a{color:#52525B;flex:none;padding:2px}.bzpv-lk .warn{color:#B45309;font-size:12px;font-weight:600}
.bzpv-meter{height:8px;border-radius:99px;background:#F3F4F6;overflow:hidden;margin:4px 0 10px}.bzpv-meter div{height:100%;background:#2F9E6A;border-radius:99px}.bzpv-meter.bad div{background:#D97706}.bzpv-meter.over div{background:#DC2626}
.bzpv-row{display:flex;justify-content:space-between;font-size:13.5px}
.bzpv-who{position:relative}.bzpv-who input{width:100%}.bzpv-res{position:absolute;left:0;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid var(--bz-line,#E5E7EB);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);z-index:2;max-height:260px;overflow:auto}
.bzpv-res button{all:unset;box-sizing:border-box;display:block;width:100%;padding:9px 12px;cursor:pointer;font-size:13.5px}.bzpv-res button:hover{background:#FFFFFF}.bzpv-res button span{color:#71717A;font-size:12.5px;margin-left:6px}
.bzpv-chip{display:inline-flex;align-items:center;gap:6px;margin-top:8px;background:#F3F4F6;border-radius:8px;padding:4px 6px 4px 10px;font-size:13px}.bzpv-chip button{all:unset;cursor:pointer;color:#71717A;display:inline-flex}
.bzpv-ck{display:flex;gap:8px;align-items:center;margin:12px 0 14px;font-size:13.5px}.bzpv-ck input{width:16px;height:16px;accent-color:#18181B}
.bzpv-out{margin-top:12px;display:flex;flex-direction:column;gap:6px}.bzpv-out div{font-size:13px;border-radius:8px;padding:8px 10px;background:#FFFFFF}.bzpv-out .ok{background:#ECFDF3;color:#166534}.bzpv-out .no{background:#FEF3F2;color:#B42318}
@media (max-width:900px){.bzpv-b{grid-template-columns:1fr;overflow:auto}.bzpv-l{min-height:70vh}.bzpv-r{border-left:0;border-top:1px solid var(--bz-line,#E5E7EB)}.bzpv-h{padding:12px 16px}}
</style>`;

async function defaultTo(kind) {
  const saved = LS.get(KEY[kind]); if (saved) return saved;
  try { const s = await api('/api/mk/settings'); const list = (s.test_list || []).map(String);
    const hit = list.find((x) => (kind === 'email' ? x.includes('@') : !x.includes('@') && /\d{7,}/.test(x.replace(/\D/g, ''))));
    return hit || ''; } catch (e) { return ''; }
}
function linksOf(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html'); const seen = new Set(), out = [];
  doc.querySelectorAll('a').forEach((a) => {
    const href = (a.getAttribute('href') || '').trim(); const img = a.querySelector('img');
    const text = (a.textContent || '').replace(/\s+/g, ' ').trim() || (img && (img.getAttribute('alt') || 'Image')) || '(no text)';
    const k = href + '|' + text; if (seen.has(k)) return; seen.add(k);
    let warn = ''; if (!href || href === '#' || /^https?:\/\/?$/i.test(href)) warn = 'No link set'; else if (/\{\{|\{%/.test(href)) warn = 'Not filled in';
    out.push({ href, text: img && !a.textContent.trim() ? `Image: ${text}` : text, warn });
  });
  return out;
}
const smsLinks = (body) => [...new Set(String(body || '').match(/https?:\/\/[^\s]+/g) || [])].map((h) => ({ href: h, text: h, warn: '' }));

window.BZ_preview = async function (o) {
  if (!document.getElementById('bzpv-css')) document.head.insertAdjacentHTML('beforeend', CSS);
  document.querySelectorAll('.bzpv').forEach((x) => x.remove());
  const kind = o.kind === 'sms' ? 'sms' : 'email';
  const el = document.createElement('div'); el.className = 'bzpv'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Preview mode');
  let profile = null, last = null;
  el.innerHTML = `<div class="bzpv-h"><h2>Preview mode${o.title ? `<span class="t">${esc(o.title)}</span>` : ''}</h2><button class="btn pri" data-done>Done</button></div>
  <div class="bzpv-b"><div class="bzpv-l">${kind === 'email' ? `<div class="bzpv-bar"><div class="bzpv-seg"><button class="on" data-dv="d">${I('device-desktop')} Desktop</button><button data-dv="m">${I('device-mobile')} Mobile</button></div></div>` : ''}<div class="bzpv-cv" id="bzpvCv"><div class="bz-loading">Loading preview…</div></div></div>
    <div class="bzpv-r">
      <div class="bzpv-s"><h3>Preview as</h3><p class="sub">Fill in names, codes and products for a real person on your list.</p>
        <div class="bzpv-who"><input type="search" id="bzpvQ" placeholder="Search by name, email or phone" aria-label="Search profiles"><div class="bzpv-res" id="bzpvRes" hidden></div></div><div id="bzpvWho"></div></div>
      <div class="bzpv-s"><details open id="bzpvLinks"><summary>${I('chevron-right')} Links <span class="n" id="bzpvLn">…</span></summary><div id="bzpvLl" style="margin-top:10px"></div></details></div>
      <div class="bzpv-s" id="bzpvSize"></div>
      <div class="bzpv-s"><h3>Send a test</h3><p class="sub">${kind === 'sms' ? 'Sends this text to your phone, with a real code and real links. Separate several numbers with commas.' : 'Sends this email to your inbox, with a real code and real links. Separate several addresses with commas.'} Only ${kind === 'sms' ? 'numbers' : 'addresses'} on the internal test list (Settings) get it.</p>
        <input type="text" id="bzpvTo" ${kind === 'sms' ? 'inputmode="tel" placeholder="Phone number"' : 'inputmode="email" placeholder="Email address"'} style="width:100%" aria-label="Send the test to">
        <label class="bzpv-ck"><input type="checkbox" id="bzpvSave" checked> Save as my default test ${kind === 'sms' ? 'number' : 'address'}</label>
        <button class="btn pri" id="bzpvGo">${I('send')} Send test</button><div class="bzpv-out" id="bzpvOut"></div></div>
    </div></div>`;
  document.body.appendChild(el); document.body.style.overflow = 'hidden';
  const $ = (id) => el.querySelector('#' + id);
  const close = () => { el.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && !e.target.closest('input,textarea')) close(); };
  document.addEventListener('keydown', onKey); el.querySelector('[data-done]').onclick = close;
  el.querySelectorAll('[data-dv]').forEach((b) => b.onclick = () => { el.querySelectorAll('[data-dv]').forEach((x) => x.classList.toggle('on', x === b)); el.classList.toggle('mob', b.dataset.dv === 'm'); setTimeout(fit, 260); });

  let frame = null;
  const fit = () => { try { if (frame && frame.contentDocument && frame.contentDocument.body) frame.style.height = Math.max(400, frame.contentDocument.documentElement.scrollHeight) + 'px'; } catch (e) {} };
  const draw = async () => {
    const cv = $('bzpvCv'); cv.innerHTML = '<div class="bz-loading">Loading preview…</div>';
    try { last = await o.render({ profile_id: profile ? profile.id : null }); } catch (e) { cv.innerHTML = `<div class="bz-err">${esc(e.message)}</div>`; return; }
    if (kind === 'email') {
      cv.innerHTML = `<div class="bzpv-inbox"><b>${esc(last.subject || '(no subject)')}</b><span>${esc(last.preview || '')}</span></div><iframe class="bzpv-fr" title="Email preview"></iframe>`;
      frame = cv.querySelector('iframe'); frame.onload = () => { fit(); try { frame.contentDocument.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; }); frame.contentDocument.querySelectorAll('img').forEach((im) => im.addEventListener('load', fit)); } catch (e) {} };
      frame.srcdoc = last.html || '';
      const kb = new Blob([last.html || '']).size / 1024, pct = Math.min(100, kb / 102 * 100);
      $('bzpvSize').innerHTML = `<h3>Total size</h3><div class="bzpv-row"><span></span><span>About ${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB</span></div><div class="bzpv-meter${kb > 102 ? ' over' : kb > 85 ? ' bad' : ''}"><div style="width:${pct}%"></div></div><p class="sub" style="margin:0">${kb > 102 ? 'Gmail will clip this email and hide the bottom (including the unsubscribe link). Remove some blocks or images.' : kb > 85 ? 'Close to the size where Gmail clips emails (about 102 KB).' : 'Not at risk of being clipped in Gmail.'}</p>`;
    } else {
      cv.innerHTML = `<div class="bzpv-phone"><div class="who">Text message · ${esc(profile ? (profile.first_name || profile.phone || 'Profile') : 'Sample person')}</div><div class="bzpv-bub">${esc(last.body || '').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')}</div></div>`;
      $('bzpvSize').innerHTML = `<h3>Length</h3><div class="bzpv-row"><span>${last.chars || 0} characters</span><span>${last.segments || 0} segment${last.segments === 1 ? '' : 's'}${last.encoding ? ` · ${esc(last.encoding)}` : ''}</span></div><p class="sub" style="margin:8px 0 0">Each segment is billed. Emoji and some symbols switch the text to a shorter segment size.</p>`;
    }
    const L = kind === 'email' ? linksOf(last.html) : smsLinks(last.body);
    $('bzpvLn').textContent = L.length;
    $('bzpvLl').innerHTML = L.length ? L.map((l) => `<div class="bzpv-lk"><div class="x"><b>${esc(l.text)}</b><span>${esc(l.href || '—')}</span>${l.warn ? `<span class="warn">${esc(l.warn)}</span>` : ''}</div>${l.href && !l.warn ? `<a href="${esc(l.href)}" target="_blank" rel="noopener" aria-label="Open link">${I('external-link')}</a>` : ''}</div>`).join('') : '<p class="sub" style="margin:0">No links.</p>';
  };
  const who = () => { $('bzpvWho').innerHTML = profile ? `<span class="bzpv-chip">${esc([profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email || profile.phone)}${profile.email ? ` · ${esc(profile.email)}` : ''}<button aria-label="Use the sample person" data-clr>${I('x')}</button></span>` : `<span class="bzpv-chip" style="padding-right:10px">Sample person (Maria)</span>`;
    const c = $('bzpvWho').querySelector('[data-clr]'); if (c) c.onclick = () => { profile = null; who(); draw(); }; };
  let qt = null;
  $('bzpvQ').oninput = () => { clearTimeout(qt); const q = $('bzpvQ').value.trim(); const res = $('bzpvRes'); if (q.length < 2) { res.hidden = true; return; }
    qt = setTimeout(async () => { try { const r = await api('/api/mk/profiles?' + new URLSearchParams({ q, limit: 8 }));
      res.innerHTML = (r.rows || []).map((p, i) => `<button data-i="${i}">${esc([p.first_name, p.last_name].filter(Boolean).join(' ') || '(no name)')}<span>${esc(p.email || p.phone || '')}</span></button>`).join('') || '<div style="padding:10px 12px;color:#71717A;font-size:13px">Nobody found</div>';
      res.hidden = false; res.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => { profile = r.rows[Number(b.dataset.i)]; res.hidden = true; $('bzpvQ').value = ''; who(); draw(); }); } catch (e) {} }, 220); };
  el.addEventListener('click', (e) => { if (!e.target.closest('.bzpv-who')) $('bzpvRes').hidden = true; });

  $('bzpvTo').value = await defaultTo(kind);
  $('bzpvGo').onclick = async () => {
    const list = $('bzpvTo').value.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean); const out = $('bzpvOut');
    if (!list.length) { $('bzpvTo').focus(); return; }
    if ($('bzpvSave').checked) LS.set(KEY[kind], list.join(', '));
    const go = $('bzpvGo'); go.disabled = true; go.innerHTML = `${I('loader-2')} Sending…`; out.innerHTML = '';
    try { if (o.beforeSend) await o.beforeSend();
      for (const to of list) {
        try { const r = await o.send(to); const rows = r.results || [r];
          rows.forEach((x) => { const ok = x.status === 'sent'; out.insertAdjacentHTML('beforeend', `<div class="${ok ? 'ok' : 'no'}">${esc(to)}${x.version ? ` · version ${esc(x.version)}` : ''} — ${ok ? 'sent' : esc(x.reason || x.status || 'not sent')}</div>`); });
        } catch (e) { out.insertAdjacentHTML('beforeend', `<div class="no">${esc(to)} — ${esc(e.message)}</div>`); }
      }
    } catch (e) { out.innerHTML = `<div class="no">${esc(e.message)}</div>`; }
    go.disabled = false; go.innerHTML = `${I('send')} Send test`;
  };
  who(); draw();
  if (o.focusSend) setTimeout(() => $('bzpvTo').focus(), 50);
};
})();
