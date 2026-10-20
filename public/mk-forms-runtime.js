/* Buzzin sign-up forms + store activity — runs on the store. BZF_ORIGIN, BZF_STORE and BZF_LIVE are set by the server above this file.
 * Forms are steps of blocks, like Klaviyo (see mk-forms-v2.js). In Form Studio the same code draws the canvas:
 * BuzzinFormsShow(form, { edit: { step, sel } }) draws one step with selectable, draggable blocks. */
(function () {
  if (window.__buzzinForms) return; window.__buzzinForms = 1;
  var ORIGIN = window.BZF_ORIGIN, STORE = window.BZF_STORE, STUDIO = !!window.BZF_STUDIO;
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var ss = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }, del: function (k) { try { sessionStorage.removeItem(k); } catch (e) {} } };
  var q = location.search, preview = false;
  var pm = q.match(/[?&]bzf_id=(\d+)/); if (pm) ss.set('bzf_pid', pm[1]);
  if (/[?&]buzzin_form=off/.test(q)) ss.del('bzf_pid');
  var PID = ss.get('bzf_pid') || '';
  if (/[?&]buzzin_form=preview/.test(q)) { ss.set('bzf_preview', '1'); preview = true; } else if (/[?&]buzzin_form=off/.test(q)) ss.del('bzf_preview'); else preview = ss.get('bzf_preview') === '1';
  if (!STUDIO && !preview && !window.BZF_LIVE) return;           // nothing live and not previewing: do nothing at all
  var vid = ls.get('bz_vid'); if (!vid) { vid = 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); ls.set('bz_vid', vid); }
  var returning = !!ls.get('bz_seen'); ls.set('bz_seen', '1');
  var views = Number(ss.get('bz_pv') || 0) + 1; ss.set('bz_pv', String(views));
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

  /* ---------- fonts: Google fonts are loaded into the page (fonts don't load from inside a shadow root) ---------- */
  var GFONTS = ['Playfair Display', 'Lora', 'Cormorant Garamond', 'Libre Baskerville', 'DM Serif Display', 'Montserrat', 'Poppins', 'DM Sans', 'Inter', 'Nunito', 'Josefin Sans', 'Quicksand', 'Raleway', 'Lato', 'Open Sans'];
  function loadFonts(st) {
    [st.font, st.h1, st.h2, st.button].forEach(function (x) {
      var fam = String((x && x.family) || '').split(',')[0].replace(/['"]/g, '').trim();
      if (GFONTS.indexOf(fam) < 0 || document.querySelector('link[data-bzf-font="' + fam + '"]')) return;
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.setAttribute('data-bzf-font', fam);
      l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(fam).replace(/%20/g, '+') + ':wght@400;600;700&display=swap'; document.head.appendChild(l);
    });
  }
  var fam = function (x) { var f = String(x || ''); return f === 'inherit' ? (window.getComputedStyle(document.body).fontFamily || 'Helvetica,Arial,sans-serif') : f; };

  /* ---------- forms ---------- */
  var path = location.pathname;
  var listOf = function (s) { return String(s || '').split(/[\n,]+/).map(function (x) { return x.trim(); }).filter(Boolean); };
  var pmatch = function (p) { return p.slice(-1) === '*' ? path.indexOf(p.slice(0, -1)) === 0 : path === p; };
  var CFG = {};
  function eligible(f) {
    var t = f.targeting || {};
    if (STUDIO) return true;
    if (PID && preview && String(f.id) === PID) return true;   // "Preview on website": always show the form being previewed
    if (t.device === 'mobile' && !mobile()) return false; if (t.device === 'desktop' && mobile()) return false;
    if (t.visitors === 'new' && returning) return false; if (t.visitors === 'returning' && !returning) return false;
    var only = listOf(t.only_paths), hide = listOf(t.hide_paths);
    if (hide.some(pmatch)) return false; if (only.length && !only.some(pmatch)) return false;
    if (/^\/(cart|checkout)/.test(path) && !only.length) return false;
    if (t.hide_subscribed !== false && ls.get('bz_sub_' + STORE)) return false;
    var gk = f.gid || f.id, closed = Number(ls.get('bzf_closed_' + gk) || 0), done = Number(ls.get('bzf_done_' + gk) || 0);
    if (done && !preview) return false;
    if (closed && !preview && Date.now() - closed < (Number(t.hide_days_after_close == null ? 14 : t.hide_days_after_close) * 864e5)) return 'teaser';
    if (t.utm_source && !(new RegExp('[?&]utm_source=' + t.utm_source.replace(/[^\w-]/g, '') + '\\b').test(q))) return false;
    var cc = (CFG.country || '').toUpperCase(), cl = (t.countries || []).map(function (x) { return String(x).toUpperCase(); });
    if (cl.length && cc) { var inL = cl.indexOf(cc) >= 0; if ((t.countries_mode || 'include') === 'include' ? !inL : inL) return false; }
    if (CFG.aud && CFG.aud[f.id] === false) return false;
    if (t.custom_js) { try { if (!(new Function(String(t.custom_js)))()) return false; } catch (e) { return false; } }
    return true;
  }
  var px = function (a) { a = a || [0, 0, 0, 0]; return (a[0] || 0) + 'px ' + (a[1] || 0) + 'px ' + (a[2] || 0) + 'px ' + (a[3] || 0) + 'px'; };
  function hexA(c, pct) { var m = /^#?([0-9a-f]{6})$/i.exec(String(c || '')); if (!m) return c || 'rgba(20,20,30,.45)'; var n = parseInt(m[1], 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + (Number(pct == null ? 45 : pct) / 100) + ')'; }
  function css(f, edit) {
    var s = f.style || {}, fo = s.font || {}, h1 = s.h1 || {}, h2 = s.h2 || {}, ip = s.input || {}, bt = s.button || {}, cl = s.close || {}, ov = s.overlay || {}, mo = s.mobile || {};
    var w = s.width || 460, r = s.radius == null ? 16 : s.radius, scale = (mo.scale || 100) / 100;
    var pos = s.position || 'center';
    var corner = function () { return (pos.indexOf('top') === 0 ? 'top:16px;' : 'bottom:16px;') + (pos.indexOf('left') > 0 ? 'left:16px;' : 'right:16px;'); };
    return ':host{all:initial}*{box-sizing:border-box}' +
      '.ov{position:fixed;inset:0;background:' + hexA(ov.color, ov.opacity) + ';z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:16px}' +
      '.anim-fade .card{animation:bzf .25s ease-out}.anim-slide .card{animation:bzs .3s ease-out}@keyframes bzf{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}@keyframes bzs{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.card{animation:none!important}}' +
      '.card{position:relative;background:' + (s.bg || '#fff') + (s.bg_image ? ' url(' + esc(s.bg_image) + ') center/' + (s.bg_fit || 'cover') + ' no-repeat' : '') + ';color:' + (fo.color || '#242F3F') + ';border-radius:' + r + 'px;width:' + w + 'px;max-width:100%;' + (s.min_height ? 'min-height:' + s.min_height + 'px;' : '') + 'max-height:92vh;overflow:auto;' +
        'font:' + (fo.size || 16) + 'px/1.45 ' + fam(fo.family || 'Helvetica,Arial,sans-serif') + ';' + (s.shadow !== false ? 'box-shadow:0 18px 50px rgba(0,0,0,.25);' : '') + (s.border_width ? 'border:' + s.border_width + 'px solid ' + (s.border_color || '#ddd') + ';' : '') + 'display:flex}' +
      '.media{position:relative}.media .mtag{position:absolute;left:0;top:0;background:#2563EB;color:#fff;font:600 12px/1 Helvetica,Arial,sans-serif;padding:5px 7px;border-radius:0 0 4px 0;display:none}.media.msel .mtag{display:block}.media.msel{outline:3px solid #2563EB!important;outline-offset:-3px}.media .mchg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(17,17,17,.75);color:#fff;font:600 13px/1 Helvetica,Arial,sans-serif;padding:9px 12px;border-radius:8px;opacity:0;transition:opacity .15s;pointer-events:none;white-space:nowrap}.media[data-media]{cursor:pointer}.media[data-media]:hover{outline:2px dashed #7C5CFF;outline-offset:-2px}.media[data-media]:hover .mchg,.media.msel .mchg{opacity:1}.media.msel{outline:2px solid #7C5CFF;outline-offset:-2px}.media.ph{background:repeating-linear-gradient(45deg,#F4F4F5,#F4F4F5 10px,#ECECEE 10px,#ECECEE 20px);display:flex;align-items:center;justify-content:center;text-align:center;color:#71717A;font:600 13px/1.5 Helvetica,Arial,sans-serif;cursor:pointer}.card.img-top{flex-direction:column}.card.img-right{flex-direction:row-reverse}.media{flex:none;min-height:140px}.card.img-top .media{height:200px;width:100%!important}' +
      '.in{flex:1;min-width:0;padding:' + px(s.pad || [32, 28, 28, 28]) + '}' +
      '.fly{position:fixed;' + corner() + 'z-index:2147483600;width:' + Math.min(w, 420) + 'px;max-width:calc(100vw - 32px)}' +
      '.full .ov{padding:0}.full .card{width:100%;height:100%;max-height:none;border-radius:0;align-items:center;justify-content:center}.full .in{max-width:560px;margin:0 auto}' +
      '.banner{position:fixed;left:0;right:0;' + (pos === 'bottom' ? 'bottom:0' : 'top:0') + ';z-index:2147483600}.banner .card{width:100%;border-radius:0;max-height:none}.banner .in{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center;justify-content:center;padding:10px 48px 10px 16px}.banner .blk{padding:0!important}.banner .btn{width:auto!important}' +
      '.emb .card{box-shadow:none;width:100%;margin:0 auto}' +
      'h1{margin:0;font:' + (h1.weight || 700) + ' ' + (h1.size || 30) + 'px/1.15 ' + fam(h1.family || 'Georgia,serif') + ';color:' + (h1.color || fo.color || '#242F3F') + '}' +
      'h2{margin:0;font:' + (h2.weight || 700) + ' ' + (h2.size || 22) + 'px/1.2 ' + fam(h2.family || 'Georgia,serif') + ';color:' + (h2.color || fo.color || '#242F3F') + '}' +
      'p{margin:0}a{color:inherit}.blk img{max-width:100%;display:inline-block}' +
      'label.lb{display:block;font-size:13px;margin:0 0 4px;color:' + (ip.label_color || fo.color || '#242F3F') + ';text-align:left}' +
      'input[type=email],input[type=tel],input[type=text],input[type=date],select{width:100%;font:inherit;font-size:' + (ip.font_size || 16) + 'px;padding:0 12px;border:1px solid ' + (ip.border || 'rgba(0,0,0,.2)') + ';border-radius:' + (ip.radius == null ? 10 : ip.radius) + 'px;background:' + (ip.bg || '#fff') + ';color:' + (ip.color || '#111') + ';height:' + (ip.height || 46) + 'px}' +
      '.ph{display:flex;gap:0}.ph .cc{width:auto;flex:none;padding:0 6px;border-right:0;border-top-right-radius:0;border-bottom-right-radius:0;font-size:14px}.ph input{border-top-left-radius:0;border-bottom-left-radius:0}' +
      '.opts{display:flex;flex-direction:column;gap:6px;text-align:left}.opts label{display:flex;gap:8px;align-items:center;font-size:14px;cursor:pointer}.opts input{width:16px;height:16px;margin:0}' +
      '.chips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.chips button{flex:1 1 40%;background:transparent;color:inherit;border:1px solid currentColor;border-radius:' + (bt.radius == null ? 999 : bt.radius) + 'px;padding:10px 12px;font:inherit;font-weight:600;cursor:pointer}.chips button.on{background:' + (bt.bg || '#242F3F') + ';color:' + (bt.color || '#fff') + ';border-color:' + (bt.bg || '#242F3F') + '}' +
      '.btn{display:inline-flex;align-items:center;justify-content:center;font:' + (bt.weight || 700) + ' ' + (bt.font_size || 16) + 'px ' + fam(bt.family || fo.family || 'Helvetica,Arial,sans-serif') + ';cursor:pointer;min-height:' + (bt.height || 48) + 'px;padding:0 20px;border-radius:' + (bt.radius == null ? 999 : bt.radius) + 'px;background:' + (bt.bg || '#242F3F') + ';color:' + (bt.color || '#fff') + ';border:' + (bt.border_width || 0) + 'px solid ' + (bt.border_color || bt.bg || '#242F3F') + ';text-decoration:none;' + (bt.full !== false ? 'width:100%;' : '') + '}' +
      '.btn.link{background:transparent;border:0;min-height:0;padding:6px;font-weight:400;font-size:14px;text-decoration:underline;opacity:.75;width:auto;color:' + (fo.color || '#242F3F') + '}.btn:disabled{opacity:.6}' +
      '.x{position:absolute;top:' + (cl.outside ? '-' + ((cl.size || 32) + 8) : 10) + 'px;right:' + (cl.outside ? 0 : 10) + 'px;width:' + (cl.size || 32) + 'px;height:' + (cl.size || 32) + 'px;border:0;padding:0;cursor:pointer;z-index:2;border-radius:50%;font:400 ' + Math.round((cl.size || 32) * 0.62) + 'px/1 Helvetica,Arial,sans-serif;color:' + (cl.color || '#242F3F') + ';background:' + (cl.style === 'plain' ? 'transparent' : (cl.bg || 'rgba(0,0,0,.06)')) + '}.card.has-out{overflow:visible}' +
      '.legal{font-size:11px;line-height:1.4;opacity:.8;margin-top:8px;text-align:left}.smsok{display:flex;gap:8px;align-items:flex-start;font-size:11px;line-height:1.4;text-align:left;margin:10px 0 2px;cursor:pointer}.smsok input{margin:2px 0 0;width:16px;height:16px;flex:none}.smsok span{opacity:.85}' +
      '.err{color:#b42318;font-size:13px;margin-top:6px;min-height:0}.err:empty{display:none}' +
      '.code{display:flex;gap:8px;align-items:stretch}.code b{flex:1;font:700 22px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;border:2px dashed currentColor;border-radius:12px;padding:14px;display:flex;align-items:center;justify-content:center}.code .btn{width:auto}' +
      '.cd{display:flex;gap:8px;justify-content:center}.cd div{min-width:58px;padding:8px 6px;border-radius:10px;background:rgba(0,0,0,.06);text-align:center}.cd b{display:block;font-size:24px;line-height:1.1}.cd span{font-size:10px;text-transform:uppercase;letter-spacing:.08em;opacity:.7}' +
      'hr{border:0;margin:0}' +
      '.rw{display:flex;gap:10px;align-items:flex-start}.rw>.blk{min-width:0}' +
      '.ctr{font-size:14px}.ctr b{font-size:1.15em}' +
      '.rv{position:relative}.rvi{display:none}.rvi.on{display:block}.stars{font-size:18px;letter-spacing:2px}.rq{font-style:italic;margin:6px 0}.rn{font-size:13px;opacity:.75}.rdots{display:flex;gap:6px;justify-content:center;margin-top:8px}.rdots i{width:7px;height:7px;border-radius:50%;background:currentColor;opacity:.25}.rdots i.on{opacity:.8}' +
      '.wh{position:relative;display:inline-block;margin:4px auto}.whs{display:block;max-width:100%;height:auto}.whr{transform-origin:100px 100px;transition:transform 4.2s cubic-bezier(.17,.67,.12,.99)}.whp{position:absolute;left:50%;top:-6px;transform:translateX(-50%);width:0;height:0;border-left:11px solid transparent;border-right:11px solid transparent;border-top:20px solid #B42318;z-index:2;filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}' +
      '.hd{display:none}' +
      '.teaser{position:fixed;' + ((f.teaser || {}).position === 'bottom-right' ? 'right:16px;bottom:16px' : (f.teaser || {}).position === 'left-middle' ? 'left:0;top:50%;transform:rotate(-90deg) translateX(-50%);transform-origin:left top' : 'left:16px;bottom:16px') + ';z-index:2147483599;background:' + ((f.teaser || {}).bg || '#242F3F') + ';color:' + ((f.teaser || {}).color || '#fff') + ';border:0;border-radius:' + ((f.teaser || {}).radius == null ? 999 : (f.teaser || {}).radius) + 'px;padding:12px 18px;font:700 14px ' + fam(fo.family || 'Helvetica,Arial,sans-serif') + ';box-shadow:0 8px 24px rgba(0,0,0,.2);cursor:pointer}' +
      (edit ? '.hd{display:block;opacity:.35}.hd::after{content:"Mobile only";position:absolute;right:4px;top:2px;font:600 10px Helvetica,Arial,sans-serif;background:#7C5CFF;color:#fff;padding:2px 5px;border-radius:4px}@media (max-width:640px){.hm{display:block!important;opacity:.35}.hm::after{content:"Hidden on mobile";position:absolute;right:4px;top:2px;font:600 10px Helvetica,Arial,sans-serif;background:#7C5CFF;color:#fff;padding:2px 5px;border-radius:4px}.hd{opacity:1}.hd::after{display:none}}' +
        '.blk.editing,.blk.editing *{pointer-events:auto!important;cursor:text}.blk.editing{outline:2px solid #7C5CFF!important}.tx[contenteditable],.bl[contenteditable]{outline:none;min-height:1em}.tools .sep2{width:1px;background:rgba(255,255,255,.35);margin:3px 2px}' +
        '.dropv{position:absolute;top:0;bottom:0;width:3px;background:#7C5CFF;border-radius:2px;z-index:6}' +
        '.cv{display:flex;justify-content:center;padding:36px 16px 24px}.cv .card{max-height:none}.cvb{padding:36px 0 24px}.cvb .card{width:100%;border-radius:0}.blk{position:relative;cursor:pointer}.blk:hover{outline:1px dashed #7C5CFF;outline-offset:2px}.blk.sel{outline:2px solid #7C5CFF;outline-offset:2px}.blk *{pointer-events:none}.blk.drop-before{box-shadow:0 -3px 0 #7C5CFF}.blk.drop-after{box-shadow:0 3px 0 #7C5CFF}.empty{border:2px dashed rgba(0,0,0,.2);border-radius:10px;padding:26px;text-align:center;opacity:.6;font-size:14px}.card.form-sel{outline:2px solid #7C5CFF;outline-offset:3px}.tools{position:absolute;top:-30px;right:0;display:flex;gap:2px;background:#7C5CFF;border-radius:6px;padding:2px;z-index:5;pointer-events:auto!important}.tools *{pointer-events:auto!important}.tools button{all:unset;cursor:pointer;color:#fff;font:600 12px/1 Helvetica,Arial,sans-serif;padding:5px 7px;border-radius:4px}.tools button:hover{background:rgba(255,255,255,.2)}.tag{position:absolute;top:-22px;left:0;background:#7C5CFF;color:#fff;font:600 11px/1 Helvetica,Arial,sans-serif;padding:4px 6px;border-radius:4px 4px 0 0;pointer-events:none}.dropline{height:3px;background:#7C5CFF;border-radius:2px;margin:2px 0}' : '') +
      '@media (max-width:640px){.hm{display:none}.hd{display:block}.rw.stk{flex-direction:column}.rw.stk>.blk{flex:1 1 auto!important;width:100%}.card{font-size:' + Math.round((fo.size || 16) * scale) + 'px}.in{padding:' + px(mo.pad || [24, 20, 20, 20]) + '}h1{font-size:' + Math.round((h1.size || 30) * scale) + 'px}h2{font-size:' + Math.round((h2.size || 22) * scale) + 'px}.card:not(.img-top) .media{display:none}.card.img-top .media{height:150px}' +
        (mo.sheet !== false ? '.ov{padding:0;align-items:flex-end}.ov .card{border-radius:' + r + 'px ' + r + 'px 0 0;width:100%}.full .ov .card{border-radius:0}' : '.ov .card{width:' + (mo.width_pct || 100) + '%}') + '}';
  }

  /* one block → html. ctx: { code, edit, i } */
  function blockHtml(b, f, ctx) {
    var st = b.st || {}, show = b.show || 'all';
    var wrap = function (inner) { return '<div class="blk' + (show === 'desktop' ? ' hm' : show === 'mobile' ? ' hd' : '') + '" data-i="' + ctx.i + '" data-type="' + esc(b.type) + '" data-bid="' + esc(b.id || '') + '"' + (ctx.edit ? ' draggable="true"' : '') +
      ' style="padding:' + px(st.pad || [0, 0, 10, 0]) + ';text-align:' + (st.align || 'center') + ';' + (st.bg ? 'background:' + esc(st.bg) + ';' : '') + (ctx.inRow ? 'flex:' + (st.w ? '0 0 ' + Number(st.w) + '%' : '1 1 0') + ';min-width:0;' : '') + '">' + inner + '</div>'; };
    var ip = (f.style || {}).input || {}, showLabel = function () { return (b.show_label != null ? b.show_label : ip.show_labels) && b.label ? '<label class="lb" for="f_' + b.id + '">' + esc(b.label) + (b.required ? ' *' : '') + '</label>' : ''; };
    var shop = (f.shop_url || '').replace(/\/$/, '');
    switch (b.type) {
      case 'text': return wrap('<div class="tx">' + (b.html || '') + '</div>');
      case 'html': return wrap(b.html || '');
      case 'image': { var im = '<img src="' + esc(b.src || '') + '" alt="' + esc(b.alt || '') + '" style="width:' + (b.width || 100) + '%;border-radius:' + (b.radius || 0) + 'px">'; return wrap(b.src ? (b.link ? '<a href="' + esc(b.link) + '">' + im + '</a>' : im) : (ctx.edit ? '<div class="empty">Image — add one in the panel</div>' : '')); }
      case 'spacer': return wrap('<div style="height:' + (b.height || 16) + 'px"></div>');
      case 'divider': return wrap('<hr style="border-top:' + (b.thickness || 1) + 'px solid ' + esc(b.color || 'rgba(0,0,0,.15)') + ';width:' + (b.width || 100) + '%;display:inline-block">');
      case 'email': return wrap(showLabel() + '<input id="f_' + b.id + '" data-f="email" type="email" autocomplete="email" placeholder="' + esc(b.placeholder || 'Email address') + '" aria-label="' + esc(b.label || 'Email') + '">' + (b.show_consent !== false && f.email_consent_text ? '<div class="legal">' + esc(f.email_consent_text) + '</div>' : ''));
      case 'phone': return wrap(showLabel() + '<div class="ph"><select class="cc" aria-label="Country"><option value="US">&#127482;&#127480; +1</option><option value="CA">&#127464;&#127462; +1</option></select><input id="f_' + b.id + '" data-f="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="' + esc(b.placeholder || 'Phone number') + '" aria-label="' + esc(b.label || 'Phone') + '"></div>' +
        '<label class="smsok"><input type="checkbox" data-smsok="1"> <span>' + esc(f.sms_consent_text || '') + (shop ? ' <a href="' + esc(shop) + '/policies/terms-of-service" target="_blank" rel="noopener">Terms</a> &amp; <a href="' + esc(shop) + '/policies/privacy-policy" target="_blank" rel="noopener">Privacy</a>' : '') + '</span></label>');
      case 'input': return wrap(showLabel() + '<input id="f_' + b.id + '" data-f="' + esc(b.key || 'answer') + '" type="text" placeholder="' + esc(b.placeholder || b.label || '') + '" aria-label="' + esc(b.label || '') + '">');
      case 'date': return wrap(showLabel() + '<input id="f_' + b.id + '" data-f="' + esc(b.key || 'date') + '" type="date" aria-label="' + esc(b.label || 'Date') + '">');
      case 'dropdown': return wrap(showLabel() + '<select id="f_' + b.id + '" data-f="' + esc(b.key || 'choice') + '" aria-label="' + esc(b.label || '') + '"><option value="">' + esc(b.placeholder || 'Choose…') + '</option>' + (b.options || []).map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select>');
      case 'radio':
        if (b.display === 'list') return wrap((b.label ? '<label class="lb">' + esc(b.label) + '</label>' : '') + '<div class="opts" role="radiogroup">' + (b.options || []).map(function (o) { return '<label><input type="radio" name="r_' + b.id + '" data-f="' + esc(b.key || 'choice') + '" value="' + esc(o) + '"> ' + esc(o) + '</label>'; }).join('') + '</div>');
        return wrap((b.label ? '<label class="lb" style="text-align:inherit">' + esc(b.label) + '</label>' : '') + '<div class="chips" role="group" aria-label="' + esc(b.label || '') + '">' + (b.options || []).map(function (o) { return '<button type="button" data-chip="' + esc(b.key || 'choice') + '" data-v="' + esc(o) + '">' + esc(o) + '</button>'; }).join('') + '</div>');
      case 'checkboxes': return wrap((b.label ? '<label class="lb">' + esc(b.label) + '</label>' : '') + '<div class="opts">' + (b.options || []).map(function (o) { return '<label><input type="checkbox" data-multi="' + esc(b.key || 'choices') + '" value="' + esc(o) + '"> ' + esc(o) + '</label>'; }).join('') + '</div>');
      case 'coupon': if (ctx.prize && !ctx.code && !ctx.edit) return wrap('<p>' + esc(ctx.prize.label || '') + '</p>');
        return wrap(ctx.code || ctx.edit ? '<div class="code"><b aria-label="Your code">' + esc(ctx.code || 'WELCOME-8K2Q') + '</b>' + (b.copy !== false ? '<button type="button" class="btn" data-copy="1">' + esc(b.copy_text || 'Copy') + '</button>' : '') + '</div>' : '');
      case 'countdown': {
        var ms0 = b.mode === 'date' ? Math.max(0, new Date(b.date || 0).getTime() - Date.now()) : Number(b.minutes || 15) * 60000;
        var parts = [Math.floor(ms0 / 864e5), Math.floor(ms0 / 36e5) % 24, Math.floor(ms0 / 6e4) % 60, Math.floor(ms0 / 1000) % 60];
        return wrap('<div class="cd" data-cd="' + esc(b.mode === 'date' ? 'd:' + (b.date || '') : 'm:' + (b.minutes || 15)) + '" data-exp="' + esc(b.expired_text || 'Offer ended') + '">' + ['days', 'hrs', 'min', 'sec'].map(function (u, i) { var v = isNaN(parts[i]) ? 0 : parts[i]; return '<div><b>' + (v < 10 ? '0' : '') + v + '</b><span>' + u + '</span></div>'; }).join('') + '</div>');
      }
      case 'counter': {
        var n = Number(b.start || 0) + Number(ctx.edit ? (f.signups || 1284) : (f.signups || 0));
        return wrap('<div class="ctr">' + esc(b.text || '{{count}} people have already joined').replace(/\{\{\s*count\s*\}\}/g, '<b>' + n.toLocaleString('en-US') + '</b>') + '</div>');
      }
      case 'reviews': {
        var items = (b.items || []).filter(function (x) { return x && x.text; }); if (!items.length) return wrap(ctx.edit ? '<div class="empty">Add reviews in the panel</div>' : '');
        var star = function (n) { var o = ''; for (var k = 0; k < 5; k++) o += '<span style="color:' + (k < (n || 5) ? esc(b.star_color || '#F5B301') : '#D4D4D8') + '">&#9733;</span>'; return o; };
        return wrap('<div class="rv" data-rv="' + items.length + '">' + items.map(function (x, k) { return '<div class="rvi' + (k ? '' : ' on') + '"><div class="stars">' + star(x.stars) + '</div><p class="rq">&ldquo;' + esc(x.text) + '&rdquo;</p>' + (x.name ? '<div class="rn">' + esc(x.name) + '</div>' : '') + '</div>'; }).join('') +
          (items.length > 1 ? '<div class="rdots">' + items.map(function (x, k) { return '<i' + (k ? '' : ' class="on"') + '></i>'; }).join('') + '</div>' : '') + '</div>');
      }
      case 'wheel': {
        var sl = (b.slices || []).filter(Boolean); if (sl.length < 2) return wrap(ctx.edit ? '<div class="empty">Add at least 2 wheel slices in the panel</div>' : '');
        var R = 100, a = 360 / sl.length, paths = '', labels = '';
        var pt = function (deg, r) { var t = (deg - 90) * Math.PI / 180; return (R + r * Math.cos(t)).toFixed(2) + ',' + (R + r * Math.sin(t)).toFixed(2); };
        sl.forEach(function (x, k) {
          var c = x.color || ['#242F3F', '#F4C9C3', '#B7C9B5', '#F3E3C3', '#9FB4C7', '#E8B4A0'][k % 6];
          paths += '<path d="M' + R + ',' + R + ' L' + pt(k * a, R) + ' A' + R + ',' + R + ' 0 ' + (a > 180 ? 1 : 0) + ' 1 ' + pt((k + 1) * a, R) + ' Z" fill="' + esc(c) + '" stroke="#fff" stroke-width="1.5"/>';
          var mid = k * a + a / 2, tc = /^#(2|3|1|0|4)/.test(c) ? '#fff' : '#242F3F';
          var flip = mid > 90 && mid < 270;   // bottom half: turn the label over so it reads upright
          labels += '<text x="' + R + '" y="' + (flip ? R + R * 0.62 : R - R * 0.62) + '" transform="rotate(' + (flip ? mid - 180 : mid) + ' ' + R + ' ' + R + ')" text-anchor="middle" dominant-baseline="middle" font-size="' + (sl.length > 8 ? 9 : 11) + '" font-weight="700" fill="' + tc + '">' + esc(x.label || '') + '</text>';
        });
        return wrap('<div class="wh"><div class="whp" aria-hidden="true"></div><svg class="whs" viewBox="0 0 200 200" width="' + Number(b.size || 240) + '" height="' + Number(b.size || 240) + '" role="img" aria-label="Prize wheel"><g class="whr">' + paths + labels + '</g><circle cx="100" cy="100" r="14" fill="#fff" stroke="#E4E4E7"/></svg></div>');
      }
      case 'button': {
        var bst = (b.bg ? 'background:' + esc(b.bg) + ';border-color:' + esc(b.bg) + ';' : '') + (b.color ? 'color:' + esc(b.color) + ';' : '') + (b.radius != null && b.radius !== '' ? 'border-radius:' + b.radius + 'px;' : '') + (b.full === false ? 'width:auto;' : b.full === true ? 'width:100%;' : '');
        return wrap('<button type="button" class="btn' + (b.look === 'link' ? ' link' : '') + '" data-act="' + esc(b.action || 'submit') + '" data-i="' + ctx.i + '" style="' + bst + '"><span class="bl">' + esc(b.text || 'Continue') + '</span></button>');
      }
    }
    return '';
  }

  function mount(f, opts, container) {
    opts = opts || {};
    var edit = opts.edit || null;
    loadFonts(f.style || {});
    var host = document.createElement('buzzin-form'); host.setAttribute('style', 'display:block !important'); host.setAttribute('data-form', f.id);
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    (container || document.body).appendChild(host);
    var stEl = document.createElement('style'); stEl.textContent = css(f, !!edit); root.appendChild(stEl);
    var wrap = document.createElement('div'); root.appendChild(wrap);
    var steps = f.steps || [], idx = edit ? Math.max(0, Math.min(steps.length - 1, edit.step || 0)) : 0, values = {}, sub = {}, timers = [];
    var type = container ? 'embedded' : (f.style && f.style.type) || 'popup';
    function close(reason) {
      if (container || edit) return;
      host.remove(); timers.forEach(clearInterval);
      ls.set('bzf_closed_' + (f.gid || f.id), String(Date.now()));
      post('/api/mkf/' + STORE + '/event', { form_id: f.id, type: 'closed', vid: vid, preview: preview });
      var tz = f.teaser || {}, finished = reason === 'done' || ls.get('bzf_done_' + (f.gid || f.id)); if (!finished && tz.enabled && tz.text && tz.when !== 'before') teaser(f);
    }
    function skippable(s) { return !!(s && s.skip_if_sms && !edit && ls.get('bz_sms_' + STORE)); }   // Klaviyo: skip the SMS step for people who already get texts
    function go(i) { while (steps[i] && skippable(steps[i])) i++; idx = i; if (!steps[idx]) { ls.set('bzf_done_' + (f.gid || f.id), String(Date.now())); return close('done'); } if (steps[idx].kind === 'success') ls.set('bzf_done_' + (f.gid || f.id), String(Date.now())); draw(); }
    function nextIdx(s, vals) {
      var br = (s.branches || []).filter(function (b) { return b.field && String(vals[b.field] || '') === String(b.equals || ''); })[0];
      var target = br ? br.go : s.next;
      if (target) { for (var i = 0; i < steps.length; i++) if (steps[i].id === target) return i; }
      return idx + 1;
    }
    function draw() {
      timers.forEach(clearInterval); timers = [];
      var s = steps[idx]; if (!s) return close('done');
      var im = s.image || {}, split = im.pos && im.pos !== 'none' && type !== 'banner', showImg = split && (im.src || edit);
      var clsImg = showImg ? ' img-' + im.pos : '';
      var cl = (f.style || {}).close || {};
      var bl0 = s.blocks || [], blocks = '', mcss = '';
      for (var bi = 0; bi < bl0.length; bi++) {
        var ctxb = { i: bi, edit: !!edit, code: sub.code || (edit || STUDIO ? 'WELCOME-8K2Q' : ''), prize: sub.prize };
        if (bl0[bi + 1] && bl0[bi + 1].beside) {   // a row: this block and every following "beside" block, side by side
          var rowHtml = '', stack = true, j = bi;
          do { ctxb = { i: j, edit: !!edit, code: ctxb.code, prize: sub.prize, inRow: true }; rowHtml += blockHtml(bl0[j], f, ctxb); if (bl0[j].keep_row_mobile) stack = false; j++; } while (bl0[j] && bl0[j].beside);
          blocks += '<div class="rw' + (stack ? ' stk' : '') + '">' + rowHtml + '</div>'; bi = j - 1;
        } else blocks += blockHtml(bl0[bi], f, ctxb);
      }
      bl0.forEach(function (b) { var m = b.mst; if (!m || !b.id) return; var sel = '[data-bid="' + String(b.id).replace(/[^\w-]/g, '') + '"]';
        mcss += sel + '{' + (m.pad ? 'padding:' + px(m.pad) + '!important;' : '') + (m.align ? 'text-align:' + m.align + '!important;' : '') + '}' + (m.scale && Number(m.scale) !== 100 ? sel + ' .tx,' + sel + ' .btn{zoom:' + (Number(m.scale) / 100) + '}' : ''); });
      if (mcss) mcss = '<style>@media (max-width:640px){' + mcss + '}</style>';
      if (edit && !(s.blocks || []).length) blocks = '<div class="empty">Add blocks from the left panel</div>';
      var inner = '<div class="card' + clsImg + (cl.outside ? ' has-out' : '') + (edit && edit.sel === -1 ? ' form-sel' : '') + '" role="dialog" aria-modal="' + (container ? 'false' : 'true') + '" aria-label="' + esc(s.name || 'Sign up') + '">' +
        (showImg ? (im.src ? '<div class="media"' + (edit ? ' data-media="1" title="Edit side image"' : '') + (im.alt ? ' role="img" aria-label="' + esc(im.alt) + '"' : '') + ' style="background-image:url(' + esc(im.src) + ');background-size:' + (im.fit === 'contain' ? 'contain' : 'cover') + ';background-position:' + esc(im.focus || 'center center') + ';background-repeat:no-repeat;' + (im.bg ? 'background-color:' + esc(im.bg) + ';' : '') + 'width:' + (im.width || 42) + '%">' + (edit ? '<span class="mtag">Side Image</span><span class="mchg">&#128247; Change image</span>' : '') + '</div>'
          : '<div class="media ph" data-media="1" style="width:' + (im.width || 42) + '%"><span>&#128247;<br>Add side image</span></div>') : '') +
        '<form class="in" novalidate>' + (container || cl.show === false ? '' : '<button type="button" class="x" aria-label="Close">&times;</button>') + blocks + '<div class="err" role="alert"></div></form></div>';
      var anim = edit ? '' : ' anim-' + ((f.style || {}).anim || 'fade');
      wrap.className = anim;
      if (edit) wrap.innerHTML = mcss + '<div class="cv' + (type === 'banner' ? ' cvb' : '') + '">' + inner + '</div>';   // Form Studio: the form alone on a clean canvas, like Klaviyo
      else wrap.innerHTML = mcss + (type === 'popup' ? '<div class="ov">' + inner + '</div>' : type === 'full' ? '<div class="full"><div class="ov">' + inner + '</div></div>' : type === 'flyout' ? '<div class="fly">' + inner + '</div>' : type === 'banner' ? '<div class="banner">' + inner + '</div>' : '<div class="emb">' + inner + '</div>');
      if (edit && edit.media) { var md = wrap.querySelector('[data-media]'); if (md) md.classList.add('msel'); }
      if (edit && edit.sel != null && edit.sel >= 0) { var se = wrap.querySelector('.blk[data-i="' + edit.sel + '"]'); if (se) { se.classList.add('sel'); var bn = ((s.blocks || [])[edit.sel] || {}).type || '';
        se.insertAdjacentHTML('beforeend', '<div class="tag">' + esc((edit.names || {})[bn] || bn) + '</div><div class="tools">' + (bn === 'text' ? '<button type="button" data-fmt="bold" title="Bold"><b>B</b></button><button type="button" data-fmt="italic" title="Italic"><i>I</i></button><button type="button" data-fmt="underline" title="Underline"><u>U</u></button><button type="button" data-fmt="link" title="Link">&#128279;</button><span class="sep2"></span>' : '') + '<button type="button" data-tool="up" title="Move up">&#8593;</button><button type="button" data-tool="down" title="Move down">&#8595;</button><button type="button" data-tool="dup" title="Duplicate">&#10697;</button><button type="button" data-tool="copy" title="Copy (paste on any step)">&#128203;</button><button type="button" data-tool="del" title="Delete">&#128465;</button></div>'); } }
      if (edit) { wireEdit(); setTimeout(function () { try { window.parent.postMessage({ bzf: 1, t: 'h', frame: window.BZF_FRAME || '', h: Math.ceil(wrap.getBoundingClientRect().height) }, '*'); } catch (e) {} }, 30); return; }
      var form = wrap.querySelector('form'), err = wrap.querySelector('.err');
      var x = wrap.querySelector('.x'); if (x) x.onclick = function () { close(); };
      var ov = wrap.querySelector('.ov'); if (ov && ((f.style || {}).overlay || {}).close_on_click !== false) ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
      wrap.querySelectorAll('[data-chip]').forEach(function (b) { b.onclick = function () { values[b.dataset.chip] = b.dataset.v; wrap.querySelectorAll('[data-chip="' + b.dataset.chip + '"]').forEach(function (z) { z.classList.toggle('on', z === b); }); }; });
      wrap.querySelectorAll('[data-copy]').forEach(function (b) { b.onclick = function () { try { navigator.clipboard.writeText(sub.code || ''); b.textContent = 'Copied'; } catch (e) {} }; });
      wrap.querySelectorAll('[data-cd]').forEach(function (el) {
        var spec = el.dataset.cd, end;
        if (spec.indexOf('d:') === 0) end = new Date(spec.slice(2)).getTime();
        else { var k = 'bzf_cd_' + f.id, st0 = Number(ls.get(k) || 0); if (!st0) { st0 = Date.now(); ls.set(k, String(st0)); } end = st0 + Number(spec.slice(2) || 15) * 60000; }
        var tick = function () { var ms = Math.max(0, end - Date.now()), d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, sec = Math.floor(ms / 1000) % 60;
          if (!ms || isNaN(ms)) { el.innerHTML = '<p>' + esc(el.dataset.exp) + '</p>'; return; }
          var bs = el.querySelectorAll('b'); [d, h, m, sec].forEach(function (v, i) { if (bs[i]) bs[i].textContent = (v < 10 ? '0' : '') + v; }); };
        tick(); timers.push(setInterval(tick, 1000));
      });
      wrap.querySelectorAll('[data-rv]').forEach(function (rv) { var n = Number(rv.dataset.rv) || 1, k = 0; if (n < 2) return; timers.push(setInterval(function () { k = (k + 1) % n; rv.querySelectorAll('.rvi').forEach(function (x, i) { x.classList.toggle('on', i === k); }); rv.querySelectorAll('.rdots i').forEach(function (x, i) { x.classList.toggle('on', i === k); }); }, 5000)); });
      var wheelB = (s.blocks || []).filter(function (b) { return b.type === 'wheel'; })[0];
      var spinTo = function (k, done) { var sl = (wheelB.slices || []).filter(Boolean), a = 360 / sl.length, g = wrap.querySelector('.whr'); if (!g) return done();
        var target = 360 * 6 - (k * a + a / 2) + (Math.random() - 0.5) * a * 0.5; g.style.transform = 'rotate(' + target + 'deg)'; setTimeout(done, 4400); };
      var first = wrap.querySelector('input,select'); if (first && !container) setTimeout(function () { try { first.focus(); } catch (e) {} }, 60);
      if (s.kind === 'success' && (f.targeting || {}).success_close_s) setTimeout(function () { close('done'); }, Number(f.targeting.success_close_s) * 1000);
      var submitStep = function (btn) {
        err.textContent = '';
        var vals = {}, bad = null;
        (s.blocks || []).forEach(function (b) {
          if (bad) return;
          var el = wrap.querySelector('#f_' + b.id);
          if (b.type === 'email') { var em = (el && el.value || '').trim(); if (!em && !b.required) return; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { bad = 'Please enter a valid email.'; return; } vals.email = em; }
          else if (b.type === 'phone') { var ph = (el && el.value || '').replace(/\D/g, ''); if (!ph && !b.required) return; if (ph.length < 10) { bad = 'Please enter a 10-digit phone number.'; return; }
            var ok = el && el.closest('.blk') && el.closest('.blk').querySelector('[data-smsok]'); if (!ok || !ok.checked) { bad = 'Check the box to agree to texts.'; return; } vals.phone = ph; vals.sms_consent_checked = true; }
          else if (b.type === 'input' || b.type === 'date' || b.type === 'dropdown') { var v = (el && el.value || '').trim(); if (!v && b.required) { bad = 'Please fill in ' + (b.label || 'this field') + '.'; return; } if (v) vals[b.key || 'answer'] = v; }
          else if (b.type === 'radio') { var k = b.key || 'choice', rv = values[k] || (wrap.querySelector('input[name="r_' + b.id + '"]:checked') || {}).value; if (!rv && b.required) { bad = 'Please choose ' + (b.label || 'an option') + '.'; return; } if (rv) vals[k] = rv; }
          else if (b.type === 'checkboxes') { var mk = b.key || 'choices', on = [].slice.call(wrap.querySelectorAll('[data-multi="' + mk + '"]:checked')).map(function (c) { return c.value; }); if (!on.length && b.required) { bad = 'Please choose at least one.'; return; } if (on.length) vals[mk] = on.join(', '); }
        });
        if (bad) { err.textContent = bad; return; }
        for (var k2 in vals) values[k2] = vals[k2];
        if (!Object.keys(vals).length) return go(nextIdx(s, values));
        if (btn) btn.disabled = true;
        if (STUDIO) {
          if (vals.email || vals.phone) sub.code = sub.code || 'WELCOME-8K2Q'; if (vals.phone) ls.set('bz_sms_' + STORE, '1');
          if (wheelB) { var sl = (wheelB.slices || []).filter(Boolean), tot = sl.reduce(function (t, x) { return t + (Number(x.weight) || 1); }, 0), r0 = Math.random() * tot, k = 0; for (; k < sl.length - 1; k++) { r0 -= Number(sl[k].weight) || 1; if (r0 < 0) break; } sub.prize = sl[k]; return spinTo(k, function () { go(nextIdx(s, values)); }); }
          return go(nextIdx(s, values));
        }
        post('/api/mkf/' + STORE + '/submit', { form_id: f.id, step_id: s.id, kind: 'step', values: vals, all: values, vid: vid, page: location.pathname, preview: preview, preview_id: preview ? PID : '' }).then(function (r) {
          if (btn) btn.disabled = false;
          if (r && r.error) { err.textContent = r.error; return; }
          if (r && r.code) sub.code = r.code;
          if (vals.email) ls.set('bz_sub_' + STORE, '1');
          if (vals.phone) ls.set('bz_sms_' + STORE, '1');
          if (wheelB && r && r.slice != null) { sub.prize = (wheelB.slices || [])[r.slice]; if (btn) btn.disabled = true; return spinTo(Number(r.slice), function () { go(nextIdx(s, values)); }); }
          go(nextIdx(s, values));
        });
      };
      form.onsubmit = function (e) { e.preventDefault(); submitStep(form.querySelector('[data-act="submit"]')); };
      wrap.querySelectorAll('[data-act]').forEach(function (btn) {
        var b = (s.blocks || [])[Number(btn.dataset.i)] || {};
        btn.onclick = function () {
          var a = b.action || 'submit';
          if (a === 'submit') return submitStep(btn);
          if (a === 'next') return go(idx + 1);
          if (a === 'step') { for (var i = 0; i < steps.length; i++) if (steps[i].id === b.step) return go(i); return go(idx + 1); }
          if (a === 'close') return close();
          if (a === 'copy') { try { navigator.clipboard.writeText(sub.code || ''); btn.textContent = 'Copied'; } catch (e) {} return; }
          if (a === 'url') { var u = b.url || '/'; if (b.new_tab) window.open(u, '_blank', 'noopener'); else location.href = u; }
        };
      });
    }
    /* Form Studio canvas: select and drag blocks; the editor listens for these messages */
    function wireEdit() {
      var say = function (m) { try { window.parent.postMessage(Object.assign({ bzf: 1, frame: window.BZF_FRAME || '' }, m), '*'); } catch (e) {} };
      var card = wrap.querySelector('.card'), editing = null;
      var stopEditing = function () { if (!editing) return; var el = editing; editing = null; el.blk.classList.remove('editing'); el.box.removeAttribute('contenteditable'); say({ t: 'textdone' }); };
      var startEditing = function (blk, e) {
        var type = blk.dataset.type, box = type === 'text' ? blk.querySelector('.tx') : type === 'button' ? blk.querySelector('.bl') : null; if (!box) return false;
        if (editing && editing.box === box) return true; stopEditing();
        editing = { blk: blk, box: box, i: Number(blk.dataset.i), type: type };
        say({ t: 'editstart', i: editing.i });
        blk.classList.add('editing'); box.setAttribute('contenteditable', type === 'button' ? 'plaintext-only' : 'true'); box.focus();
        try { var sel = (wrap.getRootNode().getSelection ? wrap.getRootNode() : window).getSelection(); var r = null;
          if (e && document.caretRangeFromPoint) { r = document.caretRangeFromPoint(e.clientX, e.clientY); if (r && !box.contains(r.startContainer)) r = null; }
          if (!r) { r = document.createRange(); r.selectNodeContents(box); r.collapse(false); } sel.removeAllRanges(); sel.addRange(r); } catch (x) {}
        box.addEventListener('input', function () { if (!editing || editing.box !== box) return; say(type === 'button' ? { t: 'btntext', i: editing.i, text: box.textContent } : { t: 'text', i: editing.i, html: box.innerHTML }); });
        box.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' || (type === 'button' && ev.key === 'Enter')) { ev.preventDefault(); stopEditing(); } });
        return true;
      };
      card.addEventListener('mousedown', function (e) {
        var fmt = e.target.closest ? e.target.closest('[data-fmt]') : null;
        if (fmt) { e.preventDefault(); e.stopPropagation(); if (!editing) { var sb = wrap.querySelector('.blk.sel'); if (sb) startEditing(sb); }
          if (fmt.dataset.fmt === 'link') { var u = prompt('Link address'); if (u) document.execCommand('createLink', false, u); } else document.execCommand(fmt.dataset.fmt, false, null);
          if (editing) say({ t: 'text', i: editing.i, html: editing.box.innerHTML }); }
      }, true);
      card.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-fmt]')) return;
        var tool = e.target.closest ? e.target.closest('[data-tool]') : null;
        if (tool) { e.preventDefault(); e.stopPropagation(); stopEditing(); return say({ t: 'tool', act: tool.dataset.tool, i: edit.sel }); }
        if (e.target.closest && e.target.closest('[data-media]')) { e.preventDefault(); stopEditing(); return say({ t: 'media' }); }
        var b = e.target.closest ? e.target.closest('.blk') : null; e.preventDefault();
        if (editing && b && b === editing.blk) return;                       // clicking inside the text being typed
        if (b && b.classList.contains('sel') && (b.dataset.type === 'text' || b.dataset.type === 'button')) { startEditing(b, e); return; }   // second click: type
        stopEditing(); say({ t: 'sel', i: b ? Number(b.dataset.i) : -1 });
      });
      card.addEventListener('dblclick', function (e) { var b = e.target.closest ? e.target.closest('.blk') : null; if (b && (b.dataset.type === 'text' || b.dataset.type === 'button')) { b.classList.add('sel'); startEditing(b, e); } });
      document.addEventListener('mousedown', function (e) { if (editing && !card.contains(e.target) && !(e.composedPath && e.composedPath().indexOf(card) >= 0)) stopEditing(); });
      var from = null, line = null;
      var clearLine = function () { if (line && line.parentNode) line.parentNode.removeChild(line); line = null; };
      var spot = function (e) {   // where a drop lands: between blocks, or beside a block (left/right quarter)
        var bl = [].slice.call(wrap.querySelectorAll('.blk'));
        for (var j = 0; j < bl.length; j++) { var rr = bl[j].getBoundingClientRect();
          if (e.clientY >= rr.top && e.clientY <= rr.bottom && rr.width > 120) { if (e.clientX < rr.left + rr.width * 0.22) return { side: 'l', ref: bl[j], at: Number(bl[j].dataset.i) }; if (e.clientX > rr.right - rr.width * 0.22) return { side: 'r', ref: bl[j], at: Number(bl[j].dataset.i) }; } }
        var at = bl.length, ref = null;
        for (var i = 0; i < bl.length; i++) { var r = bl[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { at = Number(bl[i].dataset.i); ref = bl[i]; break; } }
        if (ref && ref.parentNode.classList.contains('rw')) ref = ref.parentNode;
        return { at: at, ref: ref };
      };
      var form = wrap.querySelector('form');
      wrap.querySelectorAll('.blk').forEach(function (el) { el.addEventListener('dragstart', function (e) { if (editing) { e.preventDefault(); return; } from = Number(el.dataset.i); try { e.dataTransfer.setData('text/plain', 'bzf-move:' + from); e.dataTransfer.effectAllowed = 'move'; } catch (x) {} }); });
      card.addEventListener('dragover', function (e) {
        e.preventDefault(); var sp = spot(e); clearLine(); line = document.createElement('div');
        if (sp.side) { line.className = 'dropv'; line.style[sp.side === 'l' ? 'left' : 'right'] = '-6px'; sp.ref.appendChild(line); }
        else { line.className = 'dropline'; if (sp.ref) sp.ref.parentNode.insertBefore(line, sp.ref); else { var er = form.querySelector('.err'); form.insertBefore(line, er); } }
      });
      card.addEventListener('dragleave', function (e) { if (!card.contains(e.relatedTarget)) clearLine(); });
      card.addEventListener('drop', function (e) {
        e.preventDefault(); var sp = spot(e); clearLine(); var data = ''; try { data = e.dataTransfer.getData('text/plain') || ''; } catch (x) {}
        if (data.indexOf('bzf-add:') === 0) return say({ t: 'add', type: data.slice(8), at: sp.at, side: sp.side || null });
        if (data.indexOf('bzf-move:') === 0 || from != null) { var f0 = from != null ? from : Number(data.slice(9)); from = null; if (sp.side) { if (sp.at !== f0) say({ t: 'move', from: f0, to: sp.at, side: sp.side }); return; } var to = sp.at > f0 ? sp.at - 1 : sp.at; if (to !== f0) say({ t: 'move', from: f0, to: to }); }
      });
    }
    draw();
    if (!edit) post('/api/mkf/' + STORE + '/event', { form_id: f.id, type: 'viewed', vid: vid, preview: preview || STUDIO });
    return host;
  }
  function teaser(f, edit) {
    if (document.querySelector('buzzin-form[data-teaser="' + f.id + '"]')) return;
    var host = document.createElement('buzzin-form'); host.setAttribute('style', 'display:block !important'); host.setAttribute('data-teaser', f.id);
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host; document.body.appendChild(host);
    root.innerHTML = '<style>' + css(f) + '</style><button type="button" class="teaser">' + esc((f.teaser || {}).text || 'Sign up') + '</button>';
    if (!edit) root.querySelector('button').onclick = function () { host.remove(); mount(f); };
  }
  function arm(f) {
    var t = f.targeting || {}, shown = false;
    var show = function () { if (shown) return; shown = true; document.querySelectorAll('buzzin-form[data-teaser="' + f.id + '"]').forEach(function (h) { h.remove(); }); if (document.querySelector('buzzin-form[data-form]:not([data-emb])')) return; mount(f); };
    if (STUDIO || (PID && preview && String(f.id) === PID)) return show();
    var tz = f.teaser || {}; if (tz.enabled && tz.text && (tz.when === 'before' || tz.when === 'both')) teaser(f);
    if (t.page_views && views < Number(t.page_views)) return;
    if (t.immediate) return show();
    if (t.delay_s != null && t.delay_s !== '') setTimeout(show, Math.max(0, Number(t.delay_s)) * 1000);
    if (t.scroll_pct) window.addEventListener('scroll', function () { var h = document.documentElement; if ((h.scrollTop + innerHeight) / h.scrollHeight * 100 >= Number(t.scroll_pct)) show(); }, { passive: true });
    if (t.exit_intent && !mobile()) document.addEventListener('mouseout', function (e) { if (!e.relatedTarget && e.clientY <= 0) show(); });
    if ((t.delay_s == null || t.delay_s === '') && !t.scroll_pct && !t.exit_intent) setTimeout(show, 5000);
  }
  function pickVariant(f) {   // A/B test: each visitor keeps the same variant
    if (!f.variants || !f.variants.length) return f;
    var k = 'bzf_ab_' + f.id, r = Number(ls.get(k)); if (!(r >= 0 && r < 1)) { r = Math.random(); ls.set(k, String(r)); }
    var a = (f.split == null ? 50 : Number(f.split)) / 100; if (r < a) return Object.assign({}, f, { gid: f.id });
    var n = f.variants.length, i = Math.min(n - 1, Math.floor((r - a) / ((1 - a) / n)));
    return Object.assign({}, f.variants[i], { gid: f.id, priority: f.priority });
  }
  function run(cfg) {
    CFG = cfg || {};
    if (cfg.tracking && !STUDIO) startTracking();
    var forms = (cfg.forms || []).map(pickVariant).filter(function (f) { return !(PID && preview) || String(f.id) === PID || String(f.gid) === PID; }).slice().sort(function (a, b) { return (b.priority || 0) - (a.priority || 0); });
    var isEmb = function (f) { return ((f.style || {}).type || (f.style || {}).layout) === 'embedded'; };
    forms.filter(isEmb).forEach(function (f) { if (eligible(f) !== true) return; document.querySelectorAll('[data-buzzin-form="' + f.id + '"]').forEach(function (el) { mount(f, null, el).setAttribute('data-emb', '1'); }); });
    var pick = null; forms.filter(function (f) { return !isEmb(f); }).some(function (f) { var e = eligible(f); if (e === true) { pick = f; return true; } if (e === 'teaser' && f.teaser && f.teaser.enabled !== false && f.teaser.text) { teaser(f); return true; } return false; });
    if (pick) arm(pick);
  }
  window.BuzzinFormsShow = function (f, opts) {
    document.querySelectorAll('buzzin-form').forEach(function (h) { h.remove(); });
    opts = opts || {};
    if (opts.teaser) return teaser(f, true);
    if ((f.style || {}).type === 'embedded') { var d = document.getElementById('bzf-embed'); if (d) return mount(f, opts, d); }
    mount(f, opts);
  };
  if (STUDIO) return;
  fetch(ORIGIN + '/api/mkf/' + STORE + '/config?preview=' + (preview ? 1 : 0) + '&vid=' + encodeURIComponent(vid) + (preview && PID ? '&form=' + PID : '')).then(function (r) { return r.json(); }).then(run).catch(function () {});
})();
