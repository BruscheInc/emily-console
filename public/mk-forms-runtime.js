/* Buzzin sign-up forms + store activity — runs on the store. BZF_ORIGIN, BZF_STORE and BZF_LIVE are set by the server above this file. */
(function () {
  if (window.__buzzinForms) return; window.__buzzinForms = 1;
  var ORIGIN = window.BZF_ORIGIN, STORE = window.BZF_STORE, STUDIO = !!window.BZF_STUDIO;
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var ss = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }, del: function (k) { try { sessionStorage.removeItem(k); } catch (e) {} } };
  var q = location.search, preview = false;
  if (/[?&]buzzin_form=preview/.test(q)) { ss.set('bzf_preview', '1'); preview = true; } else if (/[?&]buzzin_form=off/.test(q)) ss.del('bzf_preview'); else preview = ss.get('bzf_preview') === '1';
  if (!STUDIO && !preview && !window.BZF_LIVE) return;           // nothing live and not previewing: do nothing at all
  var vid = ls.get('bz_vid'); if (!vid) { vid = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); ls.set('bz_vid', vid); }
  var returning = !!ls.get('bz_seen'); ls.set('bz_seen', '1');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var post = function (path, body) { return fetch(ORIGIN + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).then(function (r) { return r.json(); }).catch(function () { return {}; }); };
  var mobile = function () { return window.matchMedia('(max-width: 640px)').matches; };

  /* ---------- store activity (only when tracking is on) ---------- */
  function track(type, props) { post('/api/mkf/' + STORE + '/track', { vid: vid, type: type, props: props || {}, page: location.pathname, preview: preview }); }
  function startTracking() {
    try {
      var meta = window.ShopifyAnalytics && window.ShopifyAnalytics.meta;
      if (meta && meta.product) track('viewed_product', { product_id: String(meta.product.id), title: meta.product.title || document.title, handle: location.pathname.split('/products/')[1] || '', price: meta.product.variants && meta.product.variants[0] ? meta.product.variants[0].price / 100 : null, url: location.href.split('?')[0] });
      else track('active_on_site', {});
      var of = window.fetch; window.fetch = function (u, o) { var p = of.apply(this, arguments); try { if (String(u).indexOf('/cart/add') >= 0) p.then(function () { track('added_to_cart', { url: location.href.split('?')[0] }); }); } catch (e) {} return p; };
      document.addEventListener('submit', function (e) { try { if (e.target && /\/cart\/add/.test(e.target.action || '')) track('added_to_cart', { url: location.href.split('?')[0] }); } catch (x) {} }, true);
    } catch (e) {}
  }

  /* ---------- forms ---------- */
  var path = location.pathname;
  var listOf = function (s) { return String(s || '').split(/[\n,]+/).map(function (x) { return x.trim(); }).filter(Boolean); };
  var pmatch = function (p) { return p.slice(-1) === '*' ? path.indexOf(p.slice(0, -1)) === 0 : path === p; };
  function eligible(f) {
    var t = f.targeting || {};
    if (STUDIO) return true;
    if (t.device === 'mobile' && !mobile()) return false; if (t.device === 'desktop' && mobile()) return false;
    if (t.visitors === 'new' && returning) return false; if (t.visitors === 'returning' && !returning) return false;
    var only = listOf(t.only_paths), hide = listOf(t.hide_paths);
    if (hide.some(pmatch)) return false; if (only.length && !only.some(pmatch)) return false;
    if (/^\/(cart|checkout)/.test(path) && !only.length) return false;
    if (t.hide_subscribed !== false && ls.get('bz_sub_' + STORE)) return false;
    var closed = Number(ls.get('bzf_closed_' + f.id) || 0), done = Number(ls.get('bzf_done_' + f.id) || 0);
    if (done && !preview) return false;
    if (closed && !preview && Date.now() - closed < (Number(t.hide_days_after_close == null ? 14 : t.hide_days_after_close) * 864e5)) return 'teaser';
    if (t.utm_source && !(new RegExp('[?&]utm_source=' + t.utm_source.replace(/[^\w-]/g, '') + '\\b').test(q))) return false;
    return true;
  }
  function css(f) {
    var s = f.style || {}, c = s.colors || {}, bg = c.bg || '#FFFFFF', tx = c.text || '#242F3F', bt = c.button || '#242F3F', btx = c.button_text || '#FFFFFF', r = s.radius == null ? 16 : s.radius, w = s.width || 420;
    return ':host{all:initial}*{box-sizing:border-box}.ov{position:fixed;inset:0;background:rgba(20,20,30,.45);z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:16px;animation:f .2s}' +
      '@keyframes f{from{opacity:0}to{opacity:1}}@media (prefers-reduced-motion:reduce){.ov,.card{animation:none!important}}' +
      '.card{position:relative;background:' + bg + ';color:' + tx + ';border-radius:' + r + 'px;width:' + w + 'px;max-width:100%;max-height:92vh;overflow:auto;font:16px/1.45 ' + (s.font || 'Helvetica,Arial,sans-serif') + ';box-shadow:0 18px 50px rgba(0,0,0,.25);display:flex}' +
      '.card .img{flex:0 0 42%;background:center/cover no-repeat}.card .in{flex:1;padding:30px 26px 22px;text-align:' + (s.align || 'center') + '}' +
      '.fly{position:fixed;bottom:16px;' + (s.side === 'left' ? 'left' : 'right') + ':16px;z-index:2147483600;width:' + Math.min(w, 360) + 'px;max-width:calc(100vw - 32px)}' +
      '.full .card{width:100%;height:100%;max-height:none;border-radius:0}.banner{position:fixed;left:0;right:0;' + (s.edge === 'bottom' ? 'bottom:0' : 'top:0') + ';z-index:2147483600}.banner .card{width:100%;border-radius:0;max-height:none}.banner .in{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:center;padding:12px 44px 12px 16px}.banner h2{font-size:17px;margin:0}.banner p{margin:0}' +
      '.emb .card{box-shadow:none;width:100%;margin:0 auto}' +
      'h2{margin:0 0 6px;font:700 ' + (s.heading_size || 28) + 'px/1.15 ' + (s.heading_font || 'Georgia,serif') + ';color:' + tx + '}.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.75;margin-bottom:6px}p{margin:0 0 14px}' +
      'label{display:block;font-size:13px;text-align:left;margin:10px 0 4px}input,select{width:100%;font:inherit;font-size:16px;padding:12px;border:1px solid rgba(0,0,0,.2);border-radius:10px;background:#fff;color:#111;min-height:46px}' +
      '.ch{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:8px 0}.ch button{flex:1 1 40%;background:transparent;color:' + tx + ';border:1px solid currentColor}.ch button.on{background:' + bt + ';color:' + btx + ';border-color:' + bt + '}' +
      'button{font:inherit;font-weight:700;cursor:pointer;border:0;border-radius:999px;padding:13px 18px;min-height:46px}.go{width:100%;margin-top:12px;background:' + bt + ';color:' + btx + '}' +
      '.no{background:transparent;color:' + tx + ';opacity:.7;font-weight:400;text-decoration:underline;margin-top:6px;padding:8px}.x{position:absolute;top:8px;right:8px;width:36px;height:36px;min-height:0;padding:0;border-radius:50%;background:rgba(0,0,0,.06);color:' + tx + ';font-size:20px;line-height:36px}' +
      '.legal{font-size:10.5px;opacity:.75;margin-top:10px;text-align:left}.err{color:#b42318;font-size:13px;margin-top:6px;min-height:1em}.code{font:700 24px/1 monospace;letter-spacing:.12em;border:2px dashed currentColor;border-radius:12px;padding:14px;margin:12px 0}' +
      '.teaser{position:fixed;bottom:16px;' + (s.side === 'right' ? 'right' : 'left') + ':16px;z-index:2147483599;background:' + bt + ';color:' + btx + ';border-radius:999px;padding:12px 18px;font:700 14px Helvetica,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2)}' +
      '@media (max-width:640px){.card .img{display:none}.ov{padding:0;align-items:flex-end}.ov .card{border-radius:' + r + 'px ' + r + 'px 0 0;width:100%}.full .ov .card{border-radius:0}}';
  }
  function mount(f, mode, container) {
    var host = document.createElement('buzzin-form'); host.setAttribute('style', 'display:block !important'); host.setAttribute('data-form', f.id);
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    (container || document.body).appendChild(host);
    var st = document.createElement('style'); st.textContent = css(f); root.appendChild(st);
    var wrap = document.createElement('div'); root.appendChild(wrap);
    var steps = f.steps || [], idx = 0, values = {}, sub = {};
    var layout = container ? 'emb' : (f.style && f.style.layout) || 'popup'; if (layout === 'full' && !mobile()) layout = 'popup';
    function close(reason) { if (!container) { host.remove(); ls.set('bzf_closed_' + f.id, String(Date.now())); post('/api/mkf/' + STORE + '/event', { form_id: f.id, type: 'closed', vid: vid, preview: preview }); if (reason !== 'done' && f.teaser && f.teaser.text) teaser(f); } }
    function draw() {
      var s = steps[idx]; if (!s) return close('done');
      var img = f.style && f.style.image && layout !== 'banner' && s.kind !== 'success' ? '<div class="img" style="background-image:url(' + esc(f.style.image) + ')"></div>' : '';
      var fields = '';
      if (s.kind === 'email') fields = '<label for="e">' + esc(s.label || 'Email') + '</label><input id="e" type="email" autocomplete="email" required placeholder="' + esc(s.placeholder || 'you@example.com') + '">';
      if (s.kind === 'phone') fields = '<label for="p">' + esc(s.label || 'Phone') + '</label><input id="p" type="tel" autocomplete="tel" inputmode="tel" placeholder="(555) 555-0123">';
      if (s.kind === 'question') fields = (s.fields || []).map(function (q2, i) {
        if (q2.type === 'choice') return '<label>' + esc(q2.label) + '</label><div class="ch" role="group" aria-label="' + esc(q2.label) + '">' + (q2.options || []).map(function (o) { return '<button type="button" data-k="' + esc(q2.key) + '" data-v="' + esc(o) + '">' + esc(o) + '</button>'; }).join('') + '</div>';
        return '<label for="q' + i + '">' + esc(q2.label) + '</label><input id="q' + i + '" data-k="' + esc(q2.key) + '" type="' + (q2.type === 'date' ? 'date' : 'text') + '">';
      }).join('');
      var code = s.kind === 'success' && sub.code ? '<div class="code" aria-label="Your code">' + esc(sub.code) + '</div><button type="button" class="go" id="cp">Copy code</button>' : '';
      var legal = s.kind === 'phone' && f.sms_consent_text ? '<div class="legal">' + esc(f.sms_consent_text) + '</div>' : (s.kind === 'email' && f.email_consent_text ? '<div class="legal">' + esc(f.email_consent_text) + '</div>' : '');
      var btn = s.kind === 'success' ? (s.button ? '<a href="' + esc(s.link || '/') + '" style="text-decoration:none"><button type="button" class="go">' + esc(s.button) + '</button></a>' : '') : '<button type="submit" class="go">' + esc(s.button || 'Continue') + '</button>';
      var skip = s.kind === 'phone' || s.kind === 'question' ? '<button type="button" class="no" id="sk">' + esc(s.skip || 'No thanks') + '</button>' : (s.kind === 'email' && !container ? '<button type="button" class="no" id="nt">' + esc(s.decline || 'No thanks') + '</button>' : '');
      var inner = '<div class="card" role="dialog" aria-modal="' + (container ? 'false' : 'true') + '" aria-label="' + esc(s.title || 'Sign up') + '">' + img + '<form class="in" novalidate>' + (container ? '' : '<button type="button" class="x" aria-label="Close">×</button>') +
        (s.eyebrow ? '<div class="eyebrow">' + esc(s.eyebrow) + '</div>' : '') + '<h2>' + esc(s.title || '') + '</h2>' + (s.text ? '<p>' + esc(s.text) + '</p>' : '') + fields + code + btn + skip + legal + '<div class="err" role="alert"></div></form></div>';
      wrap.innerHTML = layout === 'popup' ? '<div class="ov">' + inner + '</div>' : layout === 'full' ? '<div class="full"><div class="ov">' + inner + '</div></div>' : layout === 'flyout' ? '<div class="fly">' + inner + '</div>' : layout === 'banner' ? '<div class="banner">' + inner + '</div>' : '<div class="emb">' + inner + '</div>';
      var form = wrap.querySelector('form'), err = wrap.querySelector('.err');
      var x = wrap.querySelector('.x'); if (x) x.onclick = function () { close(); };
      var nt = wrap.querySelector('#nt'); if (nt) nt.onclick = function () { close(); };
      var sk = wrap.querySelector('#sk'); if (sk) sk.onclick = function () { idx = nextIdx(s, {}); draw(); };
      var ov = wrap.querySelector('.ov'); if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
      wrap.querySelectorAll('.ch button').forEach(function (b) { b.onclick = function () { values[b.dataset.k] = b.dataset.v; wrap.querySelectorAll('.ch button[data-k="' + b.dataset.k + '"]').forEach(function (z) { z.classList.toggle('on', z === b); }); }; });
      var cp = wrap.querySelector('#cp'); if (cp) cp.onclick = function () { try { navigator.clipboard.writeText(sub.code); cp.textContent = 'Copied'; } catch (e) {} };
      var first = wrap.querySelector('input,button.go'); if (first && !container) setTimeout(function () { try { first.focus(); } catch (e) {} }, 50);
      form.onsubmit = function (e) {
        e.preventDefault(); err.textContent = '';
        var vals = {};
        if (s.kind === 'email') { var em = wrap.querySelector('#e').value.trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { err.textContent = 'Please enter a valid email.'; return; } vals.email = em; }
        if (s.kind === 'phone') { var ph = wrap.querySelector('#p').value.replace(/\D/g, ''); if (ph.length < 10) { err.textContent = 'Please enter a 10-digit phone number.'; return; } vals.phone = ph; }
        if (s.kind === 'question') { wrap.querySelectorAll('input[data-k]').forEach(function (i) { if (i.value) vals[i.dataset.k] = i.value; }); (s.fields || []).forEach(function (q2) { if (values[q2.key]) vals[q2.key] = values[q2.key]; }); }
        for (var k in vals) values[k] = vals[k];
        var bt = form.querySelector('.go'); if (bt) bt.disabled = true;
        if (STUDIO) { if (s.kind === 'email' || s.kind === 'phone') sub.code = sub.code || 'WELCOME-8K2Q'; idx = nextIdx(s, values); return draw(); }
        post('/api/mkf/' + STORE + '/submit', { form_id: f.id, step_id: s.id, kind: s.kind, values: vals, all: values, vid: vid, page: location.pathname, preview: preview }).then(function (r) {
          if (bt) bt.disabled = false;
          if (r && r.error) { err.textContent = r.error; return; }
          if (r && r.code) sub.code = r.code;
          if (s.kind === 'email') { ls.set('bz_sub_' + STORE, '1'); }
          idx = nextIdx(s, values); if (!steps[idx] || steps[idx].kind === 'success') ls.set('bzf_done_' + f.id, String(Date.now())); draw();
        });
      };
    }
    function nextIdx(s, vals) {
      var br = (s.branches || []).filter(function (b) { return b.field && String(vals[b.field] || '') === String(b.equals || ''); })[0];
      var target = br ? br.go : s.next;
      if (target) { for (var i = 0; i < steps.length; i++) if (steps[i].id === target) return i; }
      return idx + 1;
    }
    draw();
    post('/api/mkf/' + STORE + '/event', { form_id: f.id, type: 'viewed', vid: vid, preview: preview || STUDIO });
    return host;
  }
  function teaser(f) {
    if (document.querySelector('buzzin-form[data-teaser="' + f.id + '"]')) return;
    var host = document.createElement('buzzin-form'); host.setAttribute('style', 'display:block !important'); host.setAttribute('data-teaser', f.id);
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host; document.body.appendChild(host);
    root.innerHTML = '<style>' + css(f) + '</style><button type="button" class="teaser">' + esc(f.teaser.text) + '</button>';
    root.querySelector('button').onclick = function () { host.remove(); mount(f); };
  }
  function arm(f) {
    var t = f.targeting || {}, shown = false;
    var show = function () { if (shown) return; shown = true; if (document.querySelector('buzzin-form[data-form]:not([data-emb])')) return; mount(f); };
    if (STUDIO) return show();
    if (t.delay_s != null && t.delay_s !== '') setTimeout(show, Math.max(0, Number(t.delay_s)) * 1000);
    if (t.scroll_pct) window.addEventListener('scroll', function () { var h = document.documentElement; if ((h.scrollTop + innerHeight) / h.scrollHeight * 100 >= Number(t.scroll_pct)) show(); }, { passive: true });
    if (t.exit_intent && !mobile()) document.addEventListener('mouseout', function (e) { if (!e.relatedTarget && e.clientY <= 0) show(); });
    if (t.delay_s == null && !t.scroll_pct && !t.exit_intent) setTimeout(show, 5000);
  }
  function run(cfg) {
    if (cfg.tracking && !STUDIO) startTracking();
    var forms = (cfg.forms || []).slice().sort(function (a, b) { return (b.priority || 0) - (a.priority || 0); });
    forms.filter(function (f) { return (f.style || {}).layout === 'embedded'; }).forEach(function (f) { if (!eligible(f) && !STUDIO) return; document.querySelectorAll('[data-buzzin-form="' + f.id + '"]').forEach(function (el) { mount(f, 'emb', el).setAttribute('data-emb', '1'); }); });
    var pick = null; forms.filter(function (f) { return (f.style || {}).layout !== 'embedded'; }).some(function (f) { var e = eligible(f); if (e === true) { pick = f; return true; } if (e === 'teaser' && f.teaser && f.teaser.text) { teaser(f); return true; } return false; });
    if (pick) arm(pick);
  }
  window.BuzzinFormsShow = function (f) { document.querySelectorAll('buzzin-form').forEach(function (h) { h.remove(); }); if ((f.style || {}).layout === 'embedded') { var d = document.getElementById('bzf-embed'); if (d) mount(f, 'emb', d); } else mount(f); };
  if (STUDIO) return;
  fetch(ORIGIN + '/api/mkf/' + STORE + '/config?preview=' + (preview ? 1 : 0)).then(function (r) { return r.json(); }).then(run).catch(function () {});
})();
