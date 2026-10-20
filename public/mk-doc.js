/* Buzzin email documents — the same structure Klaviyo's drag-and-drop editor uses.
 *
 * doc = { styles: [ {style_type:'base-styles'|'text-styles'|'heading-1-styles'…'heading-4-styles'|'link-styles'|'mobile-styles', properties, styles} ],
 *         body: { styles: { width, background_color }, sections: [ section ] } }
 * section = { id, type:'section', data:{ styles, display_options }, rows:[ { id, data:{ styles:{ column_layout } }, columns:[ { id, data:{ styles }, blocks:[ block ] } ] } ] }
 * block   = { id, type, data:{ content?, properties?, styles, display_options }, subblocks? }
 *
 * Field names match Klaviyo's published template definition (developers.klaviyo.com, revision 2026-04-15), so Klaviyo
 * templates import 1:1. Shared by the server (sending) and the editor (live canvas): one renderer, same output.
 */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.MKDoc = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const q = (s) => String(s == null ? '' : s).replace(/"/g, "'");           // safe inside style="…"
  const num = (v, d) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v));
  const col = (v) => (/^#[0-9a-f]{3,8}$/i.test(String(v || '').trim()) || /^rgba?\([\d\s.,%]+\)$/i.test(String(v || '').trim()) || /^transparent$/i.test(String(v || '')) ? String(v).trim() : '');
  const rid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
  const cls = (id) => 'k' + String(id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'];

  /* ---------- template-wide styles ---------- */
  const STYLE_TYPES = ['base-styles', 'text-styles', 'heading-1-styles', 'heading-2-styles', 'heading-3-styles', 'heading-4-styles', 'link-styles', 'mobile-styles'];
  function getStyle(doc, type) { const s = ((doc && doc.styles) || []).find((x) => x && x.style_type === type); return s || { style_type: type, properties: {}, styles: {} }; }
  function ensureStyle(doc, type) { doc.styles = doc.styles || []; let s = doc.styles.find((x) => x && x.style_type === type); if (!s) { s = { id: rid(), style_type: type, properties: {}, styles: {} }; doc.styles.push(s); } s.styles = s.styles || {}; s.properties = s.properties || {}; return s; }
  function brandStyles(b) {
    b = b || {}; const c = b.colors || {}, f = b.fonts || {};
    return {
      'base-styles': { background_color: c.ground || '#F7F7F7', content_background_color: c.panel || '#FFFFFF', border_radius: 0, inner_padding_top: 0, inner_padding_bottom: 0, inner_padding_left: 0, inner_padding_right: 0, margin_top: 24, border_width: 0, border_style: 'solid', border_color: '#E5E5E5' },
      'text-styles': { font_family: f.body || 'Helvetica, Arial, sans-serif', font_size: 16, color: c.text || '#222222', line_height: 1.5, letter_spacing: 0, font_weight: '400', text_align: 'left', mobile_font_size: 16, mobile_line_height: 1.5 },
      'heading-1-styles': { font_family: f.heading || 'Georgia, serif', font_size: 32, color: c.text || '#222222', line_height: 1.2, font_weight: '700', margin_bottom: 12, mobile_font_size: 28, mobile_line_height: 1.2 },
      'heading-2-styles': { font_family: f.heading || 'Georgia, serif', font_size: 24, color: c.text || '#222222', line_height: 1.25, font_weight: '700', margin_bottom: 10, mobile_font_size: 22, mobile_line_height: 1.25 },
      'heading-3-styles': { font_family: f.heading || 'Georgia, serif', font_size: 20, color: c.text || '#222222', line_height: 1.3, font_weight: '700', margin_bottom: 8, mobile_font_size: 18, mobile_line_height: 1.3 },
      'heading-4-styles': { font_family: f.body || 'Helvetica, Arial, sans-serif', font_size: 16, color: c.text || '#222222', line_height: 1.4, font_weight: '700', margin_bottom: 6, mobile_font_size: 16, mobile_line_height: 1.4 },
      'link-styles': { color: c.link || c.primary || '#242F3F', text_decoration: 'underline', font_weight: '', font_style: 'normal' },
      'mobile-styles': { mobile_margin: 0, mobile_padding_top: 0, mobile_padding_bottom: 0, mobile_padding_left: 0, mobile_padding_right: 0, mobile_block_padding_left: 18, mobile_block_padding_right: 18 },
    };
  }
  /** The template style merged over the brand defaults. */
  function tstyle(R, type) { return Object.assign({}, R.bs[type] || {}, getStyle(R.doc, type).styles || {}); }

  /* ---------- block defaults (what an empty style field means) ---------- */
  function blockDefaults(type, b) {
    b = b || {}; const c = b.colors || {}, f = b.fonts || {};
    const P = (t, r, bo, l) => ({ block_padding_top: t, block_padding_right: r, block_padding_bottom: bo, block_padding_left: l });
    switch (type) {
      case 'text': return Object.assign(P(9, 18, 9, 18), { inner_padding_top: 0, inner_padding_right: 0, inner_padding_bottom: 0, inner_padding_left: 0 });
      case 'image': return Object.assign(P(0, 0, 0, 0), { align: 'center', inner_padding_top: 0, inner_padding_right: 0, inner_padding_bottom: 0, inner_padding_left: 0, border_radius: 0 });
      case 'video': return Object.assign(P(9, 18, 9, 18), { align: 'center', inner_padding_top: 0, inner_padding_right: 0, inner_padding_bottom: 0, inner_padding_left: 0 });
      case 'button': return Object.assign(P(9, 18, 9, 18), { background_color: c.primary || '#242F3F', color: c.button_text || '#FFFFFF', font_family: f.body || 'Helvetica, Arial, sans-serif', font_size: 16, font_weight: '700', border_radius: num((b.button || {}).radius, 6), inner_padding_top: 14, inner_padding_bottom: 14, inner_padding_left: 28, inner_padding_right: 28, text_align: 'center', border_style: 'none', border_width: 0 });
      case 'header': return Object.assign(P(12, 18, 12, 18), { desktop_layout: 'stacked', mobile_layout: 'logo-stacked', logo_align: 'center', item_align: 'center', item_spacing: 24, item_spacing_type: 'manual', logo_link_spacing: 12, font_family: f.body || 'Helvetica, Arial, sans-serif', font_size: 14, font_weight: '700', color: c.text || '#222222', vertical_align: 'middle', inner_padding_top: 0, inner_padding_bottom: 0, inner_padding_left: 0, inner_padding_right: 0, text_decoration: 'none' });
      case 'drop_shadow': return Object.assign(P(0, 0, 0, 0), { shadow_color: 'medium' });
      case 'horizontal_rule': return Object.assign(P(9, 18, 9, 18), { border_color: '#DDDDDD', border_style: 'solid', border_width: 1 });
      case 'social': return Object.assign(P(9, 18, 9, 18), { icon_align: 'center', icon_color: 'default', icon_size: 'medium', icon_spacing: 10, label_color: c.text || '#222222', label_font_family: f.body || 'Helvetica, Arial, sans-serif', label_font_size: 13, stack_on_mobile: false });
      case 'spacer': return { height: 30, background_color: '' };
      case 'product': return Object.assign(P(9, 18, 9, 18), { layout: 'horizontal', num_columns: 3, num_rows: 1, item_padding_top: 6, item_padding_bottom: 6, item_padding_left: 6, item_padding_right: 6, item_text_alignment: 'center', item_border_style: 'none', item_border_width: 0, item_border_color: '#E5E5E5', title_font_family: f.body || 'Helvetica, Arial, sans-serif', title_font_size: 14, title_font_weight: '700', title_font_color: c.text || '#222222', title_padding_top: 8, title_padding_bottom: 2, price_font_family: f.body || 'Helvetica, Arial, sans-serif', price_font_size: 14, price_font_color: c.muted || '#555555', price_padding_top: 2, price_padding_bottom: 6, original_price_font_size: 13, original_price_font_color: '#999999', description_font_size: 13, description_font_color: c.muted || '#555555', button_background_color: c.primary || '#242F3F', button_font_color: c.button_text || '#FFFFFF', button_font_size: 13, button_font_weight: '700', button_border_radius: num((b.button || {}).radius, 6), button_padding_top: 10, button_padding_bottom: 10, button_padding_left: 18, button_padding_right: 18, button_alignment: 'center', stack_on_mobile: true });
      case 'coupon': return Object.assign(P(9, 18, 9, 18), { background_color: '', border_color: c.primary || '#242F3F', border_style: 'dashed', border_width: 2, border_radius: 6, color: c.primary || '#242F3F', font_family: f.body || 'Helvetica, Arial, sans-serif', font_size: 24, font_weight: '700', letter_spacing: 2, text_align: 'center', inner_padding_top: 14, inner_padding_bottom: 14, inner_padding_left: 24, inner_padding_right: 24, header_font_size: 14, header_padding_bottom: 8 });
      case 'table': return Object.assign(P(9, 18, 9, 18), { cell_padding_top: 8, cell_padding_bottom: 8, cell_padding_left: 10, cell_padding_right: 10, cell_horizontal_border_color: '#E5E5E5', cell_horizontal_border_style: 'solid', cell_horizontal_border_width: 1, cell_vertical_border_style: 'none', cell_vertical_border_width: 0, cell_vertical_border_color: '#E5E5E5', cell_vertical_align: 'middle', header_background_color: '#F5F5F5', header_font_weight: '700', table_font_size: 14, table_text_align: 'left', block_border_style: 'none', block_border_width: 0 });
      case 'review': return Object.assign(P(18, 18, 18, 18), { layout: 'centered-review-first', star_color: '#F5B400', empty_star_color: '#DDDDDD', star_size: 'medium', star_rating_shape: 'star', quote_font_size: 18, quote_font_style: 'italic', quote_line_height: 1.5, author_font_size: 14, author_font_weight: '700', verified_badge_style: 'badge-and-text', verified_font_size: 12, verified_color: '#2E7D32', text_area_bg_color: '#F6F5F2' });
      case 'split': return Object.assign(P(9, 18, 9, 18), { column_widths: '50,50', padding_in_between: 18, mobile_stack_order: 'ltr' });
      case 'html': return P(0, 0, 0, 0);
      case 'countdown': return Object.assign(P(9, 18, 9, 18), { color: c.text || '#222222', font_size: 22, font_weight: '700', text_align: 'center' });
      default: return P(9, 18, 9, 18);
    }
  }
  const SECTION_DEFAULTS = { inner_padding_top: 0, inner_padding_bottom: 0, inner_padding_left: 0, inner_padding_right: 0, content_color_type: 'template', column_align: 'top', column_direction: 'ltr', stack_on_mobile: true, border_style: 'none', border_width: 0, background_format: 'cover', background_position: 'center-center', background_repeat: false };

  /* ---------- small CSS builders ---------- */
  const pad = (s, p, d = 0) => `${num(s[p + '_top'], d)}px ${num(s[p + '_right'], d)}px ${num(s[p + '_bottom'], d)}px ${num(s[p + '_left'], d)}px`;
  const bord = (s, p = '') => { const w = num(s[p + 'border_width'], 0), st = s[p + 'border_style'] || 'solid'; return w > 0 && st !== 'none' && BORDER_STYLES.includes(st) ? `${w}px ${st} ${col(s[p + 'border_color']) || '#DDDDDD'}` : ''; };
  function fontCss(s, p = '', colorKey) {
    const o = [];
    const ff = s[p + 'font_family']; if (ff) o.push(`font-family:${q(ff)}`);
    const fs = num(s[p + 'font_size'], null); if (fs) o.push(`font-size:${fs}px`);
    const fw = s[p + 'font_weight']; if (fw) o.push(`font-weight:${q(fw)}`);
    const fst = s[p + 'font_style']; if (fst) o.push(`font-style:${q(fst)}`);
    const c = col(s[colorKey || (p ? p + 'font_color' : 'color')] || s[p + 'color']); if (c) o.push(`color:${c}`);
    const ls = num(s[p + 'letter_spacing'], null); if (ls != null && s[p + 'letter_spacing'] !== '') o.push(`letter-spacing:${ls}px`);
    const lh = num(s[p + 'line_height'], null); if (lh) o.push(`line-height:${lh > 4 ? lh + 'px' : lh}`);
    const td = s[p + 'text_decoration']; if (td) o.push(`text-decoration:${q(td)}`);
    return o.join(';');
  }
  const T = (attrs = '') => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${attrs}>`;

  /* ---------- rich text: apply the template's Normal / Heading / Link styles inline ---------- */
  function textStyles(R) {
    if (R._ts) return R._ts;
    const t = tstyle(R, 'text-styles'), l = tstyle(R, 'link-styles');
    const H = [1, 2, 3, 4].map((i) => tstyle(R, `heading-${i}-styles`));
    R._ts = {
      p: `margin:0;${fontCss(t)}`,
      li: fontCss(t),
      h: H.map((h) => `margin:0 0 ${num(h.margin_bottom, 0)}px 0;${fontCss(h)}${h.text_align ? `;text-align:${h.text_align}` : ''}`),
      a: [col(l.color) ? `color:${col(l.color)}` : '', l.text_decoration ? `text-decoration:${q(l.text_decoration)}` : '', l.font_weight ? `font-weight:${q(l.font_weight)}` : '', l.font_style ? `font-style:${q(l.font_style)}` : ''].filter(Boolean).join(';'),
      base: t, H,
    };
    return R._ts;
  }
  function styleText(html, R) {
    if (R.ed) return String(html || '');   // the editor keeps text as typed; template styles come from the <style> block
    const S = textStyles(R);
    return String(html || '').replace(/<(p|h[1-4]|a|li)\b([^>]*)>/gi, (m, tag, attrs) => {
      const t = tag.toLowerCase(); const add = t === 'p' ? S.p : t === 'li' ? S.li : t === 'a' ? S.a : S.h[Number(t[1]) - 1];
      if (!add) return m;
      if (/\sstyle\s*=\s*"/i.test(attrs)) return `<${tag}${attrs.replace(/\sstyle\s*=\s*"([^"]*)"/i, (_, s) => ` style="${add};${s}"`)}>`;
      if (/\sstyle\s*=\s*'/i.test(attrs)) return `<${tag}${attrs.replace(/\sstyle\s*=\s*'([^']*)'/i, (_, s) => ` style="${add};${s.replace(/"/g, "'")}"`)}>`;
      return `<${tag}${attrs} style="${add}">`;
    });
  }

  /* ---------- display options: device, show/hide, repeat ---------- */
  function device(html, d, R, inline) {
    const on = (d && d.show_on) || 'all';
    if (on === 'desktop') return inline ? `<span class="bz-hide-m">${html}</span>` : `<div class="bz-hide-m">${html}</div>`;
    if (on === 'mobile') {
      if (R.ed) return inline ? `<span class="bz-show-m-ed">${html}</span>` : `<div class="bz-show-m-ed">${html}</div>`;
      return inline ? `<!--[if !mso]><!--><span class="bz-show-mi" style="display:none;max-height:0;overflow:hidden;mso-hide:all">${html}</span><!--<![endif]-->`
        : `<!--[if !mso]><!--><div class="bz-show-m" style="display:none;max-height:0;overflow:hidden;mso-hide:all">${html}</div><!--<![endif]-->`;
    }
    return html;
  }
  function eachScope(d, scope, R, fn) {
    if (!R.ed && R.env.visible && d && d.visibility && (d.visibility.check || d.visibility.definition) && !R.env.visible(d.visibility, scope)) return '';
    const rep = d && d.content_repeat;
    if (!R.ed && rep && rep.repeat_for && R.env.repeat) {
      const items = R.env.repeat(rep.repeat_for, scope) || [];
      const alias = (rep.item_alias || 'item').replace(/[^\w]/g, '') || 'item';
      return items.slice(0, 100).map((it, i) => fn(Object.assign({}, scope, { [alias]: it, forloop: { counter: i + 1, index: i, first: i === 0, last: i === items.length - 1 } }))).join('');
    }
    return fn(scope);
  }
  const txt = (R, s, scope) => (R.env.text ? R.env.text(String(s == null ? '' : s), scope) : String(s == null ? '' : s));
  const href = (R, s, scope) => { const u = txt(R, s, scope).trim(); return u ? esc(u).replace(/&amp;/g, '&amp;') : ''; };
  const link = (R, u, inner, style = '') => (u ? `<a href="${u}" target="_blank" style="text-decoration:none;${style}">${inner}</a>` : inner);

  /* ---------- the email ---------- */
  function render(doc, env) {
    env = env || {};
    doc = doc || newDoc(env.brand);
    const R = { doc, env, b: env.brand || {}, bs: brandStyles(env.brand), ed: !!env.editor, css: [], mcss: [] };
    const base = tstyle(R, 'base-styles'), bodyS = (doc.body && doc.body.styles) || {}, mob = tstyle(R, 'mobile-styles');
    const mobProps = getStyle(doc, 'mobile-styles').properties || {}, baseProps = getStyle(doc, 'base-styles').properties || {};
    const W = Math.max(320, Math.min(900, num(bodyS.width, 600)));
    const bg = col(bodyS.background_color) || col(base.background_color) || '#F7F7F7';
    R.contentBg = col(base.content_background_color) || '#FFFFFF';
    const ip = { t: num(base.inner_padding_top, 0), r: num(base.inner_padding_right, 0), b: num(base.inner_padding_bottom, 0), l: num(base.inner_padding_left, 0) };
    R.w = W - ip.l - ip.r - 2 * num(base.border_width, 0);
    const sections = ((doc.body && doc.body.sections) || []).map((s) => section(s, R, {})).join('\n');
    const empty = R.ed && !((doc.body && doc.body.sections) || []).length ? `<div class="bz-emptydoc" data-drop="doc">Drag content here from the left</div>` : '';
    const foot = env.footer ? env.footer({ width: R.w, hasUnsubscribe: hasUnsubscribe(doc) }) || '' : '';
    // mobile + helpers
    const S = textStyles(R);
    const mo = baseProps.mobile_optimizations !== false;
    const mcss = [];
    mcss.push('.bz-wrap{width:100%!important;max-width:100%!important}', '.bz-hide-m{display:none!important;max-height:0!important;overflow:hidden!important}', '.bz-show-m{display:block!important;max-height:none!important;overflow:visible!important}', '.bz-show-mi{display:inline!important;max-height:none!important;overflow:visible!important}',
      '.bz-stack>tbody>tr>.bz-col,.bz-stack>tr>.bz-col{display:block!important;width:100%!important;max-width:100%!important}', '.bz-img-fluid{max-width:100%!important;height:auto!important}');
    if (mo) {
      mcss.push(`.bz-outer{padding:${num(mob.mobile_margin, 0)}px!important}`, `.bz-inner{padding:${num(mob.mobile_padding_top, ip.t)}px ${num(mob.mobile_padding_right, ip.r)}px ${num(mob.mobile_padding_bottom, ip.b)}px ${num(mob.mobile_padding_left, ip.l)}px!important}`);
      [1, 2, 3, 4].forEach((i) => { const h = S.H[i - 1]; if (num(h.mobile_font_size, 0)) mcss.push(`.bz-text h${i}:not([style*="font-size"]){font-size:${num(h.mobile_font_size)}px!important;line-height:${num(h.mobile_line_height, h.line_height || 1.2)}!important}`); });
      if (num(S.base.mobile_font_size, 0)) mcss.push(`.bz-text p:not([style*="font-size"]),.bz-text li:not([style*="font-size"]){font-size:${num(S.base.mobile_font_size)}px!important;line-height:${num(S.base.mobile_line_height, S.base.line_height || 1.5)}!important}`);
      if (mobProps.mobile_padding_override) mcss.push(`.bz-bp{padding-left:${num(mob.mobile_block_padding_left, 18)}px!important;padding-right:${num(mob.mobile_block_padding_right, 18)}px!important}`);
    }
    const allM = mcss.concat(R.mcss).join('\n');
    const head = `body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;display:block}
.bz-text p{${S.p}}.bz-text a{${S.a}}.bz-text h1{${S.h[0]}}.bz-text h2{${S.h[1]}}.bz-text h3{${S.h[2]}}.bz-text h4{${S.h[3]}}.bz-text ul,.bz-text ol{margin:0;padding-left:24px}
${R.css.join('\n')}
@media only screen and (max-width:${W + 20}px){.bz-wrap{width:100%!important}}
@media only screen and (max-width:480px){
${allM}
}${R.ed ? '\n' + EDITOR_CSS : ''}`;
    const bgImg = base.background_url ? `background-image:url('${q(base.background_url)}');background-repeat:${base.background_repeat ? 'repeat' : 'no-repeat'};background-position:${(base.background_position || 'center-top').replace('-', ' ')};background-size:${base.background_format === 'contain' ? 'contain' : base.background_format === 'repeat' ? 'auto' : 'cover'};` : '';
    const radius = num(base.border_radius, 0), bw = bord(base);
    const body = `${T(`width="100%" class="bz-bg" style="background:${bg};${bgImg}"`)}<tr><td align="center" class="bz-outer" style="padding:${num(base.margin_top, 24)}px 0 ${num(base.margin_top, 24)}px 0">
<!--[if mso]><table role="presentation" width="${W}" align="center" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
${T(`width="${W}" class="bz-wrap" align="center" style="width:${W}px;max-width:${W}px;${radius ? `border-radius:${radius}px;overflow:hidden;` : ''}${bw ? `border:${bw};` : ''}"`)}<tr><td class="bz-inner" style="padding:${ip.t}px ${ip.r}px ${ip.b}px ${ip.l}px">
${sections}${empty}
</td></tr>${foot}</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>`;
    return { body, head, width: W, background: bg };
  }

  function section(s, R, scope) {
    const d = (s.data && s.data.display_options) || {};
    const st = Object.assign({}, SECTION_DEFAULTS, (s.data && s.data.styles) || {});
    return device(eachScope(d, scope, R, (sc) => {
      const ct = st.content_color_type || 'template';
      const bgc = ct === 'section' ? col(st.content_color) : ct === 'none' ? (col(st.background_color) || 'transparent') : (col(st.background_color) || R.contentBg);
      const bgImg = st.background_url ? `background-image:url('${q(st.background_url)}');background-repeat:${st.background_repeat || st.background_format === 'repeat' ? 'repeat' : 'no-repeat'};background-position:${String(st.background_position || 'center-center').replace('-', ' ')};background-size:${st.background_format === 'contain' ? 'contain' : st.background_format === 'repeat' || st.background_format === 'initial' || st.background_format === 'auto' ? 'auto' : 'cover'};` : '';
      const bw = bord(st);
      const pl = num(st.inner_padding_left, 0), pr = num(st.inner_padding_right, 0);
      const inner = { w: R.w - pl - pr - (bw ? 2 * num(st.border_width, 0) : 0) };
      const rows = (s.rows || []).map((r) => row(r, st, R, sc, inner.w)).join('');
      const ed = R.ed ? ` data-sid="${esc(s.id)}"` : '';
      return `${T(`width="100%" class="bz-sec ${cls(s.id)}"${ed} style="${bgc ? `background-color:${bgc};` : ''}${bgImg}${bw ? `border:${bw};` : ''}"`)}${st.background_url ? `` : ''}<tr><td style="padding:${pad(st, 'inner_padding')}">${rows}</td></tr></table>`;
    }), d, R);
  }
  function layoutPcts(layout, n) {
    const m = String(layout || '').match(/(\d+)%-(\d+)%(?:-(\d+)%)?/);
    if (m) return [m[1], m[2], m[3]].filter(Boolean).map(Number);
    const k = String(layout || '').match(/^(\d)-column/); const c = k ? Number(k[1]) : n || 1;
    return Array.from({ length: c }, () => 100 / c);
  }
  function row(r, sst, R, scope, w) {
    const cols = r.columns || [];
    const pcts = layoutPcts(r.data && r.data.styles && r.data.styles.column_layout, cols.length);
    const dir = sst.column_direction || 'ltr', stack = sst.stack_on_mobile !== false && dir !== 'no-stack' && cols.length > 1;
    const va = { baseline: 'top', top: 'top', middle: 'middle', bottom: 'bottom' }[sst.column_align] || 'top';
    let cells = cols.map((c, i) => {
      const pct = pcts[i] || 100 / cols.length, cw = Math.floor(w * pct / 100);
      const cst = (c.data && c.data.styles) || {};
      const sub = Object.assign({}, R, { w: cw });
      const blocks = (c.blocks || []).map((b) => block(b, sub, scope)).join('');
      const emptyCol = R.ed && !(c.blocks || []).length ? `<div class="bz-emptycol" data-drop="${esc(c.id)}">Drag content here</div>` : '';
      return `<td class="bz-col" width="${pct.toFixed(2).replace(/\.00$/, '')}%"${dir === 'rtl' ? ' dir="ltr"' : ''} valign="${va}" style="width:${pct}%;vertical-align:${va};${col(cst.background_color) ? `background-color:${col(cst.background_color)};` : ''}"${R.ed ? ` data-cid="${esc(c.id)}"` : ''}>${blocks}${emptyCol}</td>`;
    });
    if (dir === 'rtl') cells = cells.reverse();
    return `${T(`width="100%" class="bz-row${stack ? ' bz-stack' : ''}"${dir === 'rtl' ? ' dir="rtl"' : ''}`)}<tr>${cells.join('')}</tr></table>`;
  }

  /* ---------- blocks ---------- */
  function block(blk, R, scope) {
    if (!blk || !blk.type) return '';
    const data = blk.data || {}, d = data.display_options || {};
    const st = Object.assign({}, blockDefaults(blk.type, R.b), data.styles || {});
    const k = cls(blk.id);
    return device(eachScope(d, scope, R, (sc) => {
      const bp = { t: num(st.block_padding_top, 0), r: num(st.block_padding_right, 0), b: num(st.block_padding_bottom, 0), l: num(st.block_padding_left, 0) };
      const w = Math.max(40, R.w - bp.l - bp.r);
      let inner = '';
      try { inner = (RENDER[blk.type] || RENDER._unknown)(blk, st, Object.assign({}, R, { w, k }), sc); } catch (e) { inner = R.ed ? `<div style="color:#B00020;font:12px sans-serif">Couldn't show this block: ${esc(e.message)}</div>` : ''; }
      if (R.ed && (!inner || !String(inner).trim())) inner = placeholder(blk);
      if (!inner) return '';
      const bb = blk.type === 'image' || blk.type === 'table' || blk.type === 'text' ? '' : '';
      const bbw = blk.type === 'text' ? bord(st, 'block_') : '';
      const bgc = col(st.block_background_color) || (blk.type === 'spacer' ? col(st.background_color) : '');
      const padC = blk.type === 'spacer' ? '0' : `${bp.t}px ${bp.r}px ${bp.b}px ${bp.l}px`;
      return `${T(`width="100%" class="bz-blk"${R.ed ? ` data-bid="${esc(blk.id)}" data-type="${esc(blk.type)}"` : ''}`)}<tr><td class="bz-bp ${k}" style="padding:${padC};${bgc ? `background-color:${bgc};` : ''}${bbw ? `border:${bbw};` : ''}${bb}">${inner}</td></tr></table>`;
    }), d, R);
  }
  function placeholder(blk) {
    const name = (BLOCK_INFO[blk.type] || {}).name || blk.type;
    const why = blk.type === 'product' ? 'No products to show yet — pick some in the panel' : blk.type === 'social' ? 'Add social links in the panel' : blk.type === 'image' ? 'Drop an image or pick one in the panel' : blk.type === 'video' ? 'Add a video link in the panel' : blk.type === 'header' ? 'Add a logo or links' : `Empty ${name}`;
    return `<div class="bz-ph">${esc(why)}</div>`;
  }

  function imgTag(R, src, alt, w, st, extraCls) {
    const fill = !!st.fill_column, h = num(st.height, 0), fixed = st.lock_ratio === false && h > 0;
    const width = fill ? R.wImg : Math.min(num(st.width, R.wImg) || R.wImg, R.wImg);
    const r = num(st.border_radius, 0);
    return `<img src="${esc(src)}" alt="${esc(alt || '')}" width="${Math.round(width)}"${fixed ? ` height="${h}"` : ''} class="bz-img-fluid ${extraCls || ''}" style="display:block;width:${fill ? '100%' : Math.round(width) + 'px'};max-width:100%;height:${fixed ? h + 'px' : 'auto'};${fixed ? 'object-fit:cover;' : ''}border:0;outline:none;${r ? `border-radius:${r}px;` : ''}">`;
  }
  function imageLike(blk, st, R, sc, src, alt, u) {
    const ip = { t: num(st.inner_padding_top, 0), r: num(st.inner_padding_right, 0), b: num(st.inner_padding_bottom, 0), l: num(st.inner_padding_left, 0) };
    const bw = bord(st, 'block_') || bord(st);
    R.wImg = Math.max(20, R.w - ip.l - ip.r - (bw ? 2 * num(st.block_border_width || st.border_width, 0) : 0));
    const align = st.align || 'center';
    const img = link(R, u, imgTag(R, src, alt, R.wImg, st));
    const k = R.k;
    if (st.full_width_mobile) R.mcss.push(`.${k}{padding-left:0!important;padding-right:0!important}.${k} .bz-imgt{width:100%!important}.${k} img{width:100%!important;max-width:100%!important;height:auto!important}`);
    else if (st.mobile_stretch_content) R.mcss.push(`.${k} .bz-imgt{width:100%!important}.${k} img{width:100%!important;max-width:100%!important;height:auto!important}`);
    const bgc = col(st.background_color);
    return `${T(`align="${align}" class="bz-imgt"${st.fill_column ? ' width="100%"' : ''} style="${align === 'center' ? 'margin:0 auto;' : ''}"`)}<tr><td align="${align}" style="padding:${ip.t}px ${ip.r}px ${ip.b}px ${ip.l}px;${bgc ? `background-color:${bgc};` : ''}${bw ? `border:${bw};` : ''}${num(st.border_radius, 0) && bw ? `border-radius:${num(st.border_radius, 0)}px;` : ''}">${img}</td></tr></table>`;
  }
  function youtubeThumb(u) { const m = String(u || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : ''; }
  function btnHtml(R, label, u, s, p = '') {
    const g = (k) => s[p + k];
    const bg = col(g('background_color')) || '#242F3F', r = num(g('border_radius'), 0);
    const bw = (() => { const w = num(g('border_width'), 0), stl = g('border_style') || 'solid'; return w > 0 && stl !== 'none' ? `${w}px ${stl} ${col(g('border_color')) || bg}` : ''; })();
    const padS = `${num(g('padding_top') ?? g('inner_padding_top'), 12)}px ${num(g('padding_right') ?? g('inner_padding_right'), 24)}px ${num(g('padding_bottom') ?? g('inner_padding_bottom'), 12)}px ${num(g('padding_left') ?? g('inner_padding_left'), 24)}px`;
    const f = p ? fontCss(s, p, p + 'font_color') : fontCss(s);
    const shadow = col(g('drop_shadow_color'));
    const a = `<a href="${u || '#'}" target="_blank" style="display:${g('stretch') ? 'block' : 'inline-block'};${f};text-decoration:${q(g('text_decoration') || 'none')};padding:${padS};background-color:${bg};border-radius:${r}px;${bw ? `border:${bw};` : ''}${shadow ? `box-shadow:0 3px 0 ${shadow};` : ''}text-align:center;mso-padding-alt:0">${label}</a>`;
    return `<td align="center" bgcolor="${bg}" style="border-radius:${r}px;background-color:${bg}">${a}</td>`;
  }

  const ICON_PX = { small: 24, medium: 32, large: 48 };
  const RENDER = {
    _unknown: () => '',
    text(blk, st, R, sc) {
      const html = styleText(txt(R, (blk.data || {}).content || '', sc), R);
      const f = [st.font_family ? `font-family:${q(st.font_family)}` : '', num(st.font_size, 0) ? `font-size:${num(st.font_size)}px` : '', col(st.color) ? `color:${col(st.color)}` : '', st.font_weight ? `font-weight:${q(st.font_weight)}` : '', st.font_style ? `font-style:${q(st.font_style)}` : '', num(st.line_height, 0) ? `line-height:${num(st.line_height)}` : '', st.letter_spacing != null && st.letter_spacing !== '' ? `letter-spacing:${num(st.letter_spacing, 0)}px` : '', st.text_align ? `text-align:${st.text_align}` : '', st.text_decoration ? `text-decoration:${q(st.text_decoration)}` : ''].filter(Boolean).join(';');
      if (num(st.font_size, 0) || col(st.color) || st.font_family) R.css.push(`.${R.k} .bz-text p,.${R.k} .bz-text li{${[num(st.font_size, 0) ? `font-size:${num(st.font_size)}px` : '', col(st.color) ? `color:${col(st.color)}` : '', st.font_family ? `font-family:${q(st.font_family)}` : ''].filter(Boolean).join(';')}}`);
      const bgc = col(st.background_color);
      const base = textStyles(R).base;
      return `<div class="bz-text" style="${fontCss(base)};${f};padding:${pad(st, 'inner_padding')};${bgc ? `background-color:${bgc};` : ''}">${html}</div>`;
    },
    image(blk, st, R, sc) {
      const p = (blk.data || {}).properties || {};
      if (!p.src) return '';
      return imageLike(blk, st, R, sc, txt(R, p.src, sc), p.alt_text, href(R, p.href, sc));
    },
    video(blk, st, R, sc) {
      const p = (blk.data || {}).properties || {};
      const src = p.src || youtubeThumb(p.href);
      if (!src) return '';
      return imageLike(blk, st, R, sc, src, p.alt_text || 'Play video', href(R, p.href, sc));
    },
    button(blk, st, R, sc) {
      const data = blk.data || {}, p = data.properties || {};
      const label = txt(R, data.content || 'Button', sc);
      const u = href(R, p.href || (R.b && R.b.shop_url) || '', sc);
      if (st.mobile_stretch_content) R.mcss.push(`.${R.k} .bz-btn{width:100%!important}.${R.k} .bz-btn a{display:block!important}`);
      return `${T(`align="${st.text_align || 'center'}" class="bz-btn"${st.stretch ? ' width="100%"' : ''} style="${(st.text_align || 'center') === 'center' ? 'margin:0 auto;' : ''}"`)}<tr>${btnHtml(R, label, u, st)}</tr></table>`;
    },
    header(blk, st, R, sc) {
      const subs = blk.subblocks || [];
      const logo = subs.find((x) => x.type === 'header_link_bar_logo');
      const items = subs.filter((x) => x.type !== 'header_link_bar_logo');
      const lay = st.desktop_layout || 'stacked', ml = st.mobile_layout || 'logo-stacked';
      const gap = num(st.item_spacing, 24);
      const linkCss = `${fontCss(st)};text-decoration:${q(st.text_decoration || 'none')};padding:${pad(st, 'inner_padding')};display:inline-block`;
      const it = items.map((x, i) => {
        let h;
        if (x.type === 'header_link_bar_image') h = link(R, href(R, x.href, sc), `<img src="${esc(x.src || '')}" alt="${esc(x.alt_text || '')}" width="${num(x.width, 24)}" style="display:inline-block;width:${num(x.width, 24)}px;height:auto;border:0">`);
        else h = x.href ? `<a href="${href(R, x.href, sc)}" target="_blank" style="${linkCss};${col(x.background_color) ? `background-color:${col(x.background_color)};` : ''}">${txt(R, x.content || '', sc)}</a>` : `<span style="${linkCss}">${txt(R, x.content || '', sc)}</span>`;
        return device(`<span class="bz-hl" style="display:inline-block;${i ? `margin-left:${gap}px;` : ''}">${h}</span>`, { show_on: x.show_on }, R, true);
      }).join('');
      const logoH = logo && (logo.src || R.ed) ? device(link(R, href(R, logo.href || (R.b && R.b.shop_url), sc), logo.src ? `<img src="${esc(logo.src)}" alt="${esc(logo.alt_text || (R.b && R.b.name) || '')}" width="${Math.min(num(logo.width, 140), R.w)}" style="display:inline-block;width:${Math.min(num(logo.width, 140), R.w)}px;max-width:100%;height:auto;border:0">` : '<span class="bz-ph" style="display:inline-block;padding:10px 18px">Logo</span>'), { show_on: logo.show_on }, R) : '';
      const va = st.vertical_align || 'middle', la = st.logo_align || 'center', ia = st.item_align || 'center';
      let html;
      if (lay === 'links' || !logoH) html = `${T('width="100%"')}<tr><td class="bz-hc bz-hlinks" align="${ia}" style="text-align:${ia}">${it}</td></tr></table>`;
      else if (lay === 'inline') html = `${T('width="100%"')}<tr><td class="bz-hc bz-hlogo" align="${la === 'center' ? 'left' : la}" valign="${va}" style="vertical-align:${va}">${logoH}</td><td class="bz-hc bz-hlinks" align="${ia === 'center' ? 'right' : ia}" valign="${va}" style="vertical-align:${va};text-align:${ia === 'center' ? 'right' : ia}">${it}</td></tr></table>`;
      else if (lay === 'centered') {
        const half = Math.ceil(items.length / 2);
        const L = items.slice(0, half).map((x) => x), Rr = items.slice(half);
        const mk = (arr) => arr.map((x) => (x.type === 'header_link_bar_image' ? '' : `<a href="${href(R, x.href, sc)}" target="_blank" style="${linkCss}">${txt(R, x.content || '', sc)}</a>`)).join(`<span style="display:inline-block;width:${gap}px"></span>`);
        html = `${T('width="100%"')}<tr><td class="bz-hc bz-hlinks" align="right" valign="${va}" style="vertical-align:${va};text-align:right;width:35%">${mk(L)}</td><td class="bz-hc bz-hlogo" align="center" valign="${va}" style="vertical-align:${va};padding:0 ${gap}px">${logoH}</td><td class="bz-hc bz-hlinks" align="left" valign="${va}" style="vertical-align:${va};text-align:left;width:35%">${mk(Rr)}</td></tr></table>`;
      } else html = `${T('width="100%"')}<tr><td class="bz-hc bz-hlogo" align="${la}" style="text-align:${la}">${logoH}</td></tr>${items.length ? `<tr><td class="bz-hc bz-hlinks" align="${ia}" style="text-align:${ia};padding-top:${num(st.logo_link_spacing, 12)}px">${it}</td></tr>` : ''}</table>`;
      const k = R.k;
      if (ml === 'logo-stacked' || ml === 'stacked') R.mcss.push(`.${k} .bz-hc{display:block!important;width:100%!important;text-align:center!important;padding:4px 0!important}`);
      if (ml === 'stacked' || ml === 'links-stacked') R.mcss.push(`.${k} .bz-hl{display:block!important;margin:6px 0 0 0!important;text-align:center!important}`);
      if (ml === 'links' || ml === 'links-stacked') R.mcss.push(`.${k} .bz-hlogo{display:none!important}.${k} .bz-hc{display:block!important;width:100%!important;text-align:center!important}`);
      if (st.mobile_wrap === false) R.mcss.push(`.${k} .bz-hlinks{white-space:nowrap!important}`);
      const bw = bord(st);
      return bw ? `<div style="border:${bw};border-radius:${num(st.border_radius, 0)}px">${html}</div>` : html;
    },
    drop_shadow(blk, st) {
      const a = { light: 0.06, medium: 0.12, dark: 0.22 }[st.shadow_color] || 0.12;
      return `<div style="height:16px;line-height:16px;font-size:1px;background:radial-gradient(ellipse at top, rgba(0,0,0,${a}) 0%, rgba(0,0,0,0) 70%)">&nbsp;</div>`;
    },
    horizontal_rule(blk, st) {
      const w = Math.max(1, num(st.border_width, 1)), s = BORDER_STYLES.includes(st.border_style) ? st.border_style : 'solid';
      return `${T('width="100%"')}<tr><td style="border-top:${w}px ${s} ${col(st.border_color) || '#DDDDDD'};font-size:1px;line-height:1px;height:1px">&nbsp;</td></tr></table>`;
    },
    spacer(blk, st) { const h = Math.max(1, Math.min(400, num(st.height, 30))); return `<div style="height:${h}px;line-height:${h}px;font-size:1px">&nbsp;</div>`; },
    social(blk, st, R, sc) {
      const subs = blk.subblocks || []; if (!subs.length) return '';
      const p = (blk.data || {}).properties || {};
      const size = ICON_PX[st.icon_size] || 32, color = ['default', 'black', 'grey', 'white'].includes(st.icon_color) ? st.icon_color : 'default';
      const gap = num(st.icon_spacing, 10), base = (R.env.assetBase || '');
      const cells = subs.map((x, i) => {
        if (x.type === 'social_link_spacer') return `<td class="bz-sc" style="width:${num(x.width, 10)}px;font-size:1px">&nbsp;</td>`;
        const src = x.link_type === 'custom' ? x.custom_src : `${base}/social/${x.link_type || 'website'}-${color}.png`;
        const sz = x.link_type === 'custom' ? num(x.custom_size, size) : size;
        const lbl = p.show_labels && x.label ? `<span style="${fontCss(st, 'label_', 'label_color')};display:inline-block;vertical-align:middle;padding-left:6px">${esc(x.label)}</span>` : '';
        return `<td class="bz-sc" valign="middle" style="padding:0 ${i < subs.length - 1 ? gap : 0}px 0 0">${link(R, href(R, x.link_url, sc), `<img src="${esc(src || '')}" alt="${esc(x.label || x.link_type || '')}" width="${sz}" height="${sz}" style="display:inline-block;vertical-align:middle;width:${sz}px;height:${sz}px;border:0">${lbl}`)}</td>`;
      }).join('');
      if (st.stack_on_mobile) R.mcss.push(`.${R.k} .bz-sc{display:block!important;padding:4px 0!important;text-align:center!important}`);
      const al = st.icon_align || 'center';
      return `${T(`align="${al}" style="${al === 'center' ? 'margin:0 auto;' : ''}"`)}<tr>${cells}</tr></table>`;
    },
    product(blk, st, R, sc) {
      const p = (blk.data || {}).properties || {};
      const list = (R.env.products ? R.env.products(blk, sc) : []) || [];
      const nc = Math.max(1, Math.min(4, num(st.num_columns, 3))), nr = Math.max(1, Math.min(6, num(st.num_rows, 1)));
      const items = list.slice(0, st.layout === 'horizontal' || !st.layout ? nc * nr : nr);
      if (!items.length) return '';
      const show = (k, d = true) => (p[k] == null ? d : !!p[k]);
      const ta = st.item_text_alignment || 'center';
      const ib = (() => { const w = num(st.item_border_width, 0), s = st.item_border_style || 'none'; return w > 0 && s !== 'none' ? `${w}px ${s} ${col(st.item_border_color) || '#E5E5E5'}` : ''; })();
      const one = (it, imgW) => {
        const u = esc(it.url || '');
        const img = it.image ? link(R, u, `<img src="${esc(it.image)}" alt="${esc(it.title || '')}" width="${Math.round(imgW)}" style="display:block;width:100%;max-width:${Math.round(imgW)}px;height:auto;border:0;${num(st.item_max_height, 0) ? `max-height:${num(st.item_max_height)}px;object-fit:cover;` : ''}${ta === 'center' ? 'margin:0 auto;' : ''}">`) : '';
        const title = show('show_title') ? `<div style="${fontCss(st, 'title_', 'title_font_color')};padding:${num(st.title_padding_top, 8)}px 0 ${num(st.title_padding_bottom, 2)}px 0">${show('show_title_links', true) ? link(R, u, esc(it.title || ''), `color:inherit`) : esc(it.title || '')}</div>` : '';
        const desc = p.show_description && it.description ? `<div style="${fontCss(st, 'description_', 'description_font_color')};padding:${num(st.description_padding_top, 2)}px 0 ${num(st.description_padding_bottom, 2)}px 0">${esc(String(it.description).slice(0, 160))}</div>` : '';
        const orig = show('show_original_price', true) && it.compare_at && it.compare_at !== it.price ? ` <span style="${fontCss(st, 'original_price_', 'original_price_font_color')};text-decoration:line-through">${esc(it.compare_at)}</span>` : '';
        const price = show('show_price') && it.price ? `<div style="${fontCss(st, 'price_', 'price_font_color')};padding:${num(st.price_padding_top, 2)}px 0 ${num(st.price_padding_bottom, 6)}px 0">${esc(it.price)}${orig}</div>` : '';
        const btn = show('show_button', false) ? `${T(`align="${st.button_alignment || ta}" style="${(st.button_alignment || ta) === 'center' ? 'margin:0 auto;' : ''}"`)}<tr>${btnHtml(R, esc(it.button_text || p.button_text || 'Shop now'), u, st, 'button_')}</tr></table>` : '';
        return { img, text: title + desc + price + btn };
      };
      const ipad = pad(st, 'item_padding', 6);
      if (st.layout && st.layout !== 'horizontal') {
        const rightImg = st.layout === 'vertical-right-image';
        const iw = Math.floor(R.w * 0.4);
        const rows = items.map((it) => { const o = one(it, iw); const a = `<td class="bz-col" width="40%" valign="middle" style="width:40%;padding:${ipad}">${o.img}</td>`, b = `<td class="bz-col" width="60%" valign="middle" style="width:60%;padding:${ipad};text-align:${ta}">${o.text}</td>`;
          return `${T(`width="100%" class="bz-row${st.stack_on_mobile !== false ? ' bz-stack' : ''}" style="${ib ? `border:${ib};` : ''}margin-bottom:8px"`)}<tr>${rightImg ? b + a : a + b}</tr></table>`; }).join('');
        return rows;
      }
      const cw = Math.floor(R.w / nc);
      let html = '';
      for (let r = 0; r < Math.ceil(items.length / nc); r++) {
        const cells = items.slice(r * nc, r * nc + nc).map((it) => { const o = one(it, cw - 12); return `<td class="bz-col" width="${(100 / nc).toFixed(2)}%" valign="top" style="width:${100 / nc}%;padding:${ipad};text-align:${ta};vertical-align:top;${ib ? `border:${ib};` : ''}">${o.img}${o.text}</td>`; });
        while (cells.length < nc) cells.push(`<td class="bz-col" width="${(100 / nc).toFixed(2)}%" style="width:${100 / nc}%"></td>`);
        html += `${T(`width="100%" class="bz-row${st.stack_on_mobile !== false ? ' bz-stack' : ''}"`)}<tr>${cells.join('')}</tr></table>`;
      }
      return html;
    },
    coupon(blk, st, R, sc) {
      const data = blk.data || {}, p = data.properties || {};
      const code = txt(R, data.content || '{{ coupon }}', sc);
      const head = p.header_enabled && p.header ? `<div style="${fontCss(Object.assign({}, st, { font_size: num(st.header_font_size, 14), font_family: st.header_font_family || st.font_family, font_weight: '400', letter_spacing: 0 }))};padding:${num(st.header_padding_top, 0)}px ${num(st.header_padding_right, 0)}px ${num(st.header_padding_bottom, 8)}px ${num(st.header_padding_left, 0)}px;text-align:${st.text_align || 'center'}">${txt(R, p.header, sc)}</div>` : '';
      const bw = bord(st), bgc = col(st.background_color), al = st.text_align || 'center';
      if (st.mobile_stretch_content) R.mcss.push(`.${R.k} .bz-cpn{width:100%!important}`);
      const box = `${T(`align="${al}" class="bz-cpn"${st.stretch ? ' width="100%"' : ''} style="${al === 'center' ? 'margin:0 auto;' : ''}"`)}<tr><td align="center" style="${fontCss(st)};padding:${pad(st, 'inner_padding')};${bw ? `border:${bw};` : ''}${bgc ? `background-color:${bgc};` : ''}border-radius:${num(st.border_radius, 0)}px;text-align:center">${code}</td></tr></table>`;
      return head + link(R, href(R, p.href, sc), box);
    },
    table(blk, st, R, sc) {
      const p = (blk.data || {}).properties || {};
      const nc = Math.max(1, Math.min(8, num(p.num_columns, 2)));
      const cells = (blk.subblocks || []).filter((x) => !/fallback/.test(x.type || ''));
      if (!cells.length) return '';
      const hb = (() => { const w = num(st.cell_horizontal_border_width, 1), s = st.cell_horizontal_border_style || 'solid'; return w > 0 && s !== 'none' ? `${w}px ${s} ${col(st.cell_horizontal_border_color) || '#E5E5E5'}` : ''; })();
      const vb = (() => { const w = num(st.cell_vertical_border_width, 0), s = st.cell_vertical_border_style || 'none'; return w > 0 && s !== 'none' ? `${w}px ${s} ${col(st.cell_vertical_border_color) || '#E5E5E5'}` : ''; })();
      const va = st.cell_vertical_align || 'middle';
      const widths = cells.slice(0, nc).map((c) => c.table_column_width || '');
      let html = '';
      for (let r = 0; r < Math.ceil(cells.length / nc); r++) {
        const isHead = p.show_headers !== false && r === 0 && cells[0].type === 'table_header';
        html += '<tr>' + cells.slice(r * nc, r * nc + nc).map((c, i) => {
          const cellCss = [isHead ? `${fontCss(st, 'header_', 'header_font_color')};${col(st.header_background_color) ? `background-color:${col(st.header_background_color)};` : ''}padding:${pad(st, 'header_padding', null) .includes('null') ? pad(st, 'cell_padding', 8) : pad(st, 'header_padding', 8)}` : `${fontCss(st, 'table_', 'table_font_color')};padding:${pad(st, 'cell_padding', 8)};${col(st.table_background_color) ? `background-color:${col(st.table_background_color)};` : ''}`,
            hb ? `border-bottom:${hb}` : '', vb && i < nc - 1 ? `border-right:${vb}` : '', `text-align:${c.cell_text_align || st.table_text_align || 'left'}`, `vertical-align:${va}`,
            [c.font_family ? `font-family:${q(c.font_family)}` : '', num(c.font_size, 0) ? `font-size:${num(c.font_size)}px` : '', col(c.color) ? `color:${col(c.color)}` : '', c.font_weight ? `font-weight:${q(c.font_weight)}` : '', c.font_style ? `font-style:${q(c.font_style)}` : ''].filter(Boolean).join(';')].filter(Boolean).join(';');
          let inner = '';
          if (c.type === 'table_image') inner = c.src ? link(R, href(R, c.href, sc), `<img src="${esc(c.src)}" alt="${esc(c.alt_text || '')}" width="${num(c.image_width || c.width, 80)}" style="display:${c.image_align === 'center' ? 'block;margin:0 auto' : 'inline-block'};width:${num(c.image_width || c.width, 80)}px;max-width:100%;height:auto;border:0">`) : '';
          else inner = c.type === 'table_html' ? txt(R, c.content || '', sc) : styleText(txt(R, c.content || '', sc), R);
          return `<${isHead ? 'th' : 'td'} ${widths[i] ? `width="${esc(widths[i])}" ` : ''}style="${cellCss}">${inner}</${isHead ? 'th' : 'td'}>`;
        }).join('') + '</tr>';
      }
      const bw = bord(st, 'block_');
      return `${T(`width="100%" style="${bw ? `border:${bw};` : ''}border-collapse:collapse"`)}${html}</table>`;
    },
    review(blk, st, R, sc) {
      const p = (blk.data || {}).properties || {};
      const quote = txt(R, p.quote || '', sc); if (!quote && !R.ed) return '';
      const lay = st.layout || 'centered-review-first';
      const al = /left-aligned|clean|square/.test(lay) ? 'left' : /right-aligned/.test(lay) ? 'right' : 'center';
      const ratingFirst = /rating-first|rating-highlight/.test(lay);
      const card = /stacked-card|subtle-background|square|message-bubble|quote-bubble/.test(lay);
      const bigQ = /big-quotes|quotation-icon/.test(lay);
      const sz = { small: 14, medium: 18, large: 24 }[st.star_size] || 18;
      const ch = { star: '★', heart: '♥', circle: '●' }[st.star_rating_shape] || '★';
      const n = Math.max(0, Math.min(5, Math.round(num(p.stars, 5))));
      const stars = p.show_rating === false ? '' : `<div style="font-size:${sz}px;line-height:1;letter-spacing:${num(st.star_icon_spacing, 2)}px;color:${col(st.star_color) || '#F5B400'};text-align:${st.star_alignment || al};padding:4px 0">${ch.repeat(n)}<span style="color:${col(st.empty_star_color) || '#DDDDDD'}">${ch.repeat(5 - n)}</span></div>`;
      const qs = `${fontCss(st, 'quote_', 'quote_color')};text-align:${st.quote_align || al};padding:6px 0`;
      const qh = `<div style="${qs}">${bigQ ? `<span style="font-size:48px;line-height:0.6;display:block;color:${col(st.star_color) || '#999'};font-style:normal">“</span>` : ''}${R.ed && !quote ? '<span style="color:#999">Write the review quote in the panel</span>' : quote}</div>`;
      const author = p.show_reviewer_name === false || !p.author ? '' : `<div style="${fontCss(st, 'author_', 'author_color')};text-align:${st.author_align || al};padding-top:4px">${esc(p.author)}</div>`;
      const prod = p.show_product_name && p.product_name ? `<div style="${fontCss(st, 'product_name_', 'product_name_color')};text-align:${st.product_name_align || al}">${esc(p.product_name)}${p.show_variant_name && p.product_variant_name ? ' · ' + esc(p.product_variant_name) : ''}</div>` : '';
      const vstyle = st.verified_badge_style || 'badge-and-text';
      const ver = p.show_verified_badge === false || p.verified === false ? '' : `<div style="${fontCss(st, 'verified_', 'verified_color')};text-align:${al};padding-top:2px">${vstyle !== 'text-only' ? '✓ ' : ''}${vstyle !== 'badge-only' ? 'Verified buyer' : ''}</div>`;
      const inner = ratingFirst ? stars + qh + author + prod + ver : qh + stars + author + prod + ver;
      if (!card) return inner;
      const radius = /square/.test(lay) ? 0 : /bubble/.test(lay) ? 18 : num(st.border_radius, 10);
      const bw = (() => { const w = num(st.border_width, 0), s = st.border_style || 'none'; return w > 0 && s !== 'none' ? `${w}px ${s} ${col(st.text_area_border_color) || '#E5E5E5'}` : ''; })();
      return `<div style="background-color:${col(st.text_area_bg_color) || '#F6F5F2'};border-radius:${radius}px;padding:18px 20px;${bw ? `border:${bw};` : ''}${col(st.shadow_color) ? `box-shadow:0 2px 8px ${col(st.shadow_color)};` : ''}">${inner}</div>`;
    },
    split(blk, st, R, sc) {
      const subs = (blk.subblocks || []).slice(0, 2); while (subs.length < 2) subs.push({ type: 'table_text', content: '' });
      const ws = String(st.column_widths || '50,50').match(/\d+(\.\d+)?/g) || ['50', '50']; const a = Number(ws[0]) || 50, b = Number(ws[1]) || 100 - a;
      const gap = num(st.padding_in_between, 18), order = st.mobile_stack_order || 'ltr';
      const side = (x, pct, isLeft) => {
        const w = Math.floor((R.w - gap) * pct / 100);
        let inner = '';
        if (x.type === 'table_image') inner = x.src ? link(R, href(R, x.href, sc), `<img src="${esc(x.src)}" alt="${esc(x.alt_text || '')}" width="${w}" class="bz-img-fluid" style="display:block;width:100%;max-width:${w}px;height:auto;border:0;${num(x.border_radius, 0) ? `border-radius:${num(x.border_radius)}px;` : ''}">`) : (R.ed ? '<div class="bz-ph">Image</div>' : '');
        else if (x.type === 'table_html') inner = txt(R, x.content || '', sc);
        else inner = `<div class="bz-text" style="${fontCss(textStyles(R).base)};${x.font_family ? `font-family:${q(x.font_family)};` : ''}${num(x.font_size, 0) ? `font-size:${num(x.font_size)}px;` : ''}${col(x.color) ? `color:${col(x.color)};` : ''}text-align:${x.cell_text_align || 'left'}">${styleText(txt(R, x.content || '', sc), R) || (R.ed ? '<p style="color:#999">Text</p>' : '')}</div>`;
        return `<td class="bz-col" width="${pct}%" valign="${st.vertical_align || 'middle'}" style="width:${pct}%;vertical-align:${st.vertical_align || 'middle'};${isLeft ? `padding-right:${Math.floor(gap / 2)}px` : `padding-left:${Math.ceil(gap / 2)}px`}">${inner}</td>`;
      };
      let cells = [side(subs[0], a, true), side(subs[1], b, false)];
      const rtl = order === 'rtl'; if (rtl) cells = cells.reverse();
      if (order !== 'no-stack') R.mcss.push(`.${R.k} .bz-split>tbody>tr>.bz-col,.${R.k} .bz-split>tr>.bz-col{padding:0 0 12px 0!important}`);
      return `${T(`width="100%" class="bz-split${order !== 'no-stack' ? ' bz-stack' : ''}"${rtl ? ' dir="rtl"' : ''}`)}<tr>${rtl ? cells.map((c) => c.replace('<td ', '<td dir="ltr" ')).join('') : cells.join('')}</tr></table>`;
    },
    html(blk, st, R, sc) { return txt(R, (blk.data || {}).content || '', sc); },
    countdown(blk, st, R, sc) {
      const p = (blk.data || {}).properties || {};
      const until = p.until ? new Date(p.until) : null;
      if (!until || isNaN(until)) return R.ed ? '<div class="bz-ph">Set the end date in the panel</div>' : '';
      const ms = until - (R.env.now ? R.env.now() : Date.now()), days = Math.ceil(ms / 86400000);
      const t = ms <= 0 ? (p.ended || '') : days <= 1 ? (p.last_day || 'Last day!') : `${esc(p.label || 'Ends in')} ${days} days`;
      return t ? `<div style="${fontCss(st)};text-align:${st.text_align || 'center'}">${t}</div>` : '';
    },
  };

  const EDITOR_CSS = `a{pointer-events:none}
.bz-ph{border:1px dashed #C9C5BC;background:#FAF9F7;color:#8A8794;font:13px/1.4 Helvetica,Arial,sans-serif;text-align:center;padding:22px 12px;border-radius:4px}
.bz-emptycol,.bz-emptydoc{border:1px dashed #9DB7EA;background:rgba(47,111,235,.04);color:#5B7FC7;font:13px/1.4 Helvetica,Arial,sans-serif;text-align:center;padding:26px 10px;margin:6px}
.bz-emptydoc{margin:20px;padding:60px 20px}
.bz-show-m-ed{outline:1px dashed #E0A800;outline-offset:-1px}
[data-bid]{position:relative}`;

  /* ---------- helpers for the editor + server ---------- */
  function walk(doc, fn) {
    ((doc && doc.body && doc.body.sections) || []).forEach((s, si) => { fn(s, 'section', null, si); (s.rows || []).forEach((r) => (r.columns || []).forEach((c) => { fn(c, 'column', s); (c.blocks || []).forEach((b, bi) => fn(b, 'block', c, bi)); })); });
  }
  function find(doc, id) {
    let out = null;
    ((doc && doc.body && doc.body.sections) || []).forEach((s, si, arr) => {
      if (s.id === id) out = { kind: 'section', node: s, list: arr, index: si };
      (s.rows || []).forEach((r) => (r.columns || []).forEach((c) => { if (c.id === id) out = { kind: 'column', node: c, section: s, row: r }; (c.blocks || []).forEach((b, bi, list) => { if (b.id === id) out = { kind: 'block', node: b, list, index: bi, column: c, section: s, row: r }; }); }));
    });
    return out;
  }
  function hasUnsubscribe(doc) { return /unsubscribe_url|\{%\s*unsubscribe/.test(JSON.stringify((doc && doc.body) || {})); }
  function reId(x) { const c = clone(x); const go = (n) => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(go); if (n.id && (n.type || n.columns || n.blocks || n.rows || n.data)) n.id = rid(); Object.values(n).forEach(go); }; go(c); return c; }

  const BLOCK_INFO = {
    text: { name: 'Text', icon: 'align-left' }, image: { name: 'Image', icon: 'photo' }, split: { name: 'Split', icon: 'layout-columns' }, button: { name: 'Button', icon: 'click' },
    header: { name: 'Header/link bar', icon: 'layout-navbar' }, drop_shadow: { name: 'Drop shadow', icon: 'shadow' }, horizontal_rule: { name: 'Divider', icon: 'separator-horizontal' },
    social: { name: 'Social links', icon: 'share' }, spacer: { name: 'Spacer', icon: 'spacing-vertical' }, product: { name: 'Product', icon: 'shopping-bag' }, coupon: { name: 'Coupon', icon: 'discount' },
    table: { name: 'Table', icon: 'table' }, review: { name: 'Review quote', icon: 'star' }, video: { name: 'Video', icon: 'player-play' }, html: { name: 'HTML', icon: 'code' }, countdown: { name: 'Countdown', icon: 'clock' },
  };
  function newBlock(type, b) {
    b = b || {}; const id = rid(), D = { show_on: 'all' };
    const blk = { id, type, data: { styles: {}, display_options: D } };
    switch (type) {
      case 'text': blk.data.content = '<p>This is a text block. Click here to change the words.</p>'; break;
      case 'image': blk.data.properties = { src: '', alt_text: '', href: '', dynamic: false }; break;
      case 'video': blk.data.properties = { href: '', src: '', raw_src: '', alt_text: 'Play video', overlay_toggle: true }; break;
      case 'button': blk.data.content = 'Shop now'; blk.data.properties = { href: b.shop_url || '' }; break;
      case 'header': blk.subblocks = [{ id: rid(), type: 'header_link_bar_logo', src: b.logo_abs || '', width: num(b.logo_width, 120), href: b.shop_url || '', alt_text: b.name || '', show_on: 'all' }, { id: rid(), type: 'header_link_bar_button', content: 'Shop', href: (b.shop_url || '') + '/collections/all', show_on: 'all' }, { id: rid(), type: 'header_link_bar_button', content: 'New', href: (b.shop_url || '') + '/collections/new-arrivals', show_on: 'all' }, { id: rid(), type: 'header_link_bar_button', content: 'Sale', href: (b.shop_url || '') + '/collections/sale', show_on: 'all' }]; break;
      case 'social': blk.data.properties = { show_labels: false }; blk.subblocks = Object.entries((b && b.social) || {}).filter(([, u]) => u).map(([k, u]) => ({ id: rid(), type: 'social_link_icon', link_type: k, link_url: u, label: k[0].toUpperCase() + k.slice(1) })); if (!blk.subblocks.length) blk.subblocks = ['instagram', 'facebook', 'tiktok', 'pinterest'].map((k) => ({ id: rid(), type: 'social_link_icon', link_type: k, link_url: '', label: k[0].toUpperCase() + k.slice(1) })); break;
      case 'product': blk.data.properties = { dynamic: false, items: [], feed: 'bestsellers', show_title: true, show_price: true, show_original_price: true, show_button: true, button_text: 'Shop now', show_title_links: true }; break;
      case 'coupon': blk.data.content = '{{ coupon }}'; blk.data.properties = { header_enabled: true, header: 'Use code', href: '' }; break;
      case 'table': blk.data.properties = { dynamic: false, num_columns: 2, show_headers: true }; blk.subblocks = [['table_header', 'Size'], ['table_header', 'Fits'], ['table_text', '<p>0–3M</p>'], ['table_text', '<p>6–12 lb</p>'], ['table_text', '<p>3–6M</p>'], ['table_text', '<p>12–17 lb</p>']].map(([t, c]) => ({ id: rid(), type: t, content: c, show_on: 'all' })); break;
      case 'review': blk.data.properties = { quote: 'So soft — my baby sleeps better in these.', author: 'Jessica R.', stars: 5, verified: true, show_rating: true, show_reviewer_name: true, show_verified_badge: true, show_product_name: false, product_name: '' }; break;
      case 'split': blk.subblocks = [{ id: rid(), type: 'table_image', src: '', alt_text: '', href: '', show_on: 'all' }, { id: rid(), type: 'table_text', content: '<h2>A heading</h2><p>A few words about it.</p>', show_on: 'all' }]; break;
      case 'html': blk.data.content = '<p style="margin:0;font-family:Helvetica,Arial,sans-serif">Custom HTML</p>'; break;
      case 'spacer': case 'drop_shadow': case 'horizontal_rule': break;
      case 'countdown': blk.data.properties = { until: '', label: 'Ends in', last_day: 'Last day!', ended: '' }; break;
    }
    return blk;
  }
  function newSection(columns = 1, layout) {
    const lay = layout || (columns === 1 ? '1-column-full-width' : `${columns}-columns-equal-width`);
    const n = layoutPcts(lay, columns).length;
    return { id: rid(), type: 'section', content_type: 'section', data: { styles: {}, display_options: { show_on: 'all' } }, rows: [{ id: rid(), data: { styles: { column_layout: lay } }, columns: Array.from({ length: n }, () => ({ id: rid(), data: {}, blocks: [] })) }] };
  }
  function newDoc(b) { const doc = { styles: [], body: { styles: { width: 600 }, sections: [] } }; const bs = brandStyles(b); STYLE_TYPES.forEach((t) => { const s = ensureStyle(doc, t); Object.assign(s.styles, bs[t]); if (t === 'base-styles') s.properties.mobile_optimizations = true; }); return doc; }

  /** Older Buzzin flat block lists → document (one section per block; columns → a multi-column section). */
  function fromBlocks(blocks, b) {
    b = b || {}; const doc = newDoc(b);
    const add = (blk) => { const s = newSection(1); s.rows[0].columns[0].blocks.push(blk); doc.body.sections.push(s); return s; };
    const textBlk = (html, st) => { const x = newBlock('text', b); x.data.content = html; Object.assign(x.data.styles, st || {}); return x; };
    for (const o of blocks || []) {
      const p = o.props || {}; const disp = {};
      const pd = (x) => { ['pt', 'pb', 'px'].forEach(() => {}); if (p.pt != null) x.data.styles.block_padding_top = Number(p.pt); if (p.pb != null) x.data.styles.block_padding_bottom = Number(p.pb); if (p.px != null) { x.data.styles.block_padding_left = Number(p.px); x.data.styles.block_padding_right = Number(p.px); } if (p.bg) x.data.styles.block_background_color = p.bg; return x; };
      let x = null;
      switch (o.type) {
        case 'heading': { const lv = Math.min(4, Math.max(1, Number(p.level) || 1)); x = textBlk(`<h${lv} style="text-align:${p.align || 'center'}${p.color ? `;color:${p.color}` : ''}${p.size ? `;font-size:${p.size}px` : ''}">${esc(p.text || '')}</h${lv}>`); break; }
        case 'text': x = textBlk(p.html || '', { text_align: p.align || 'left', ...(p.color ? { color: p.color } : {}), ...(p.size ? { font_size: Number(p.size) } : {}) }); break;
        case 'header_bar': x = textBlk(`<p style="text-align:center;color:${p.color || '#FFFFFF'};font-size:${p.size || 14}px">${p.href ? `<a href="${esc(p.href)}" style="color:inherit;text-decoration:none">${esc(p.text || '')}</a>` : esc(p.text || '')}</p>`, { block_background_color: p.bg || (b.colors || {}).primary || '#242F3F', block_padding_top: 10, block_padding_bottom: 10 }); break;
        case 'image': x = newBlock('image', b); Object.assign(x.data.properties, { src: p.src || '', alt_text: p.alt || '', href: p.href || '' }); Object.assign(x.data.styles, { fill_column: !!p.full || !p.width || Number(p.width) >= 536, width: p.width ? Number(p.width) : undefined, border_radius: p.radius ? Number(p.radius) : 0, align: p.align || 'center' }); if (!p.full && p.width && Number(p.width) < 536) Object.assign(x.data.styles, { block_padding_left: 18, block_padding_right: 18, block_padding_top: 9, block_padding_bottom: 9 }); break;
        case 'button': x = newBlock('button', b); x.data.content = esc(p.label || 'Shop now'); x.data.properties.href = p.href || b.shop_url || ''; Object.assign(x.data.styles, { text_align: p.align || 'center', ...(p.btn_bg ? { background_color: p.btn_bg } : {}), ...(p.btn_color ? { color: p.btn_color } : {}), ...(p.btn_radius != null && p.btn_radius !== '' ? { border_radius: Number(p.btn_radius) } : {}), ...(p.btn_size ? { font_size: Number(p.btn_size) } : {}), ...(p.btn_full ? { stretch: true } : {}) }); break;
        case 'logo': x = newBlock('header', b); x.subblocks = [x.subblocks[0]]; if (p.src) x.subblocks[0].src = p.src; if (p.width) x.subblocks[0].width = Number(p.width); String(p.links || '').split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((a) => a[0]).forEach(([t, u]) => x.subblocks.push({ id: rid(), type: 'header_link_bar_button', content: esc(t), href: u || '', show_on: 'all' })); break;
        case 'split': x = newBlock('split', b); x.subblocks[0] = { id: rid(), type: 'table_image', src: p.src || '', alt_text: p.alt || '', href: p.href || '', border_radius: p.radius || 0 }; x.subblocks[1] = { id: rid(), type: 'table_text', content: `${p.heading ? `<h2>${esc(p.heading)}</h2>` : ''}${p.html || ''}${p.button_label ? `<p><a href="${esc(p.button_href || b.shop_url || '')}"><strong>${esc(p.button_label)} →</strong></a></p>` : ''}` }; if (p.side === 'right') x.subblocks.reverse(); break;
        case 'products': x = newBlock('product', b); x.data.properties.items = (p.handles || []).map((h) => ({ handle: h })); x.data.properties.dynamic = !(p.handles || []).length; x.data.properties.feed = 'bestsellers'; x.data.properties.show_button = !!p.show_button; if (p.button_label) x.data.properties.button_text = p.button_label; Object.assign(x.data.styles, { num_columns: Number(p.per_row) || 3, num_rows: Math.max(1, Math.ceil((Number(p.count) || 3) / (Number(p.per_row) || 3))) }); if (p.show_price === false) x.data.properties.show_price = false; break;
        case 'dynamic_products': x = newBlock('product', b); x.data.properties.dynamic = true; x.data.properties.feed = p.source || 'cart'; Object.assign(x.data.styles, { num_columns: Number(p.per_row) || 1, num_rows: Math.max(1, Math.ceil((Number(p.count) || 3) / (Number(p.per_row) || 1))), layout: (Number(p.per_row) || 1) === 1 ? 'vertical-left-image' : 'horizontal' }); break;
        case 'coupon': x = newBlock('coupon', b); x.data.content = p.code || '{{ coupon }}'; x.data.properties.header = p.label || ''; x.data.properties.header_enabled = !!p.label; if (p.border) x.data.styles.border_color = p.border; if (p.box_bg) x.data.styles.background_color = p.box_bg; break;
        case 'countdown': x = newBlock('countdown', b); Object.assign(x.data.properties, { until: p.until || '', label: p.label || 'Ends in', last_day: p.last_day || 'Last day!' }); break;
        case 'divider': x = newBlock('horizontal_rule', b); if (p.color) x.data.styles.border_color = p.color; if (p.thick) x.data.styles.border_width = Number(p.thick); if (p.style) x.data.styles.border_style = p.style; break;
        case 'spacer': x = newBlock('spacer', b); x.data.styles.height = Number(p.height) || 24; break;
        case 'social': x = newBlock('social', b); break;
        case 'footer': x = textBlk(`<p style="text-align:center;font-size:12px;color:${(b.colors || {}).muted || '#777'}">${p.text ? esc(p.text) + '<br>' : ''}{{ store_name }} · {{ store_address }}<br><a href="{{ unsubscribe_url }}">Unsubscribe</a> · <a href="{{ preferences_url }}">Email preferences</a></p>`, { block_background_color: (b.colors || {}).ground || '' }); break;
        case 'html': x = newBlock('html', b); x.data.content = p.html || ''; break;
        case 'video': x = newBlock('video', b); Object.assign(x.data.properties, { href: p.url || '', src: p.src || '', alt_text: p.label || 'Play video' }); break;
        case 'table': x = newBlock('table', b); { const rows = String(p.rows || '').split('\n').filter((l) => l.trim()).map((l) => l.split('|').map((s) => s.trim())); const nc = Math.max(1, ...rows.map((r) => r.length)); x.data.properties.num_columns = nc; x.data.properties.show_headers = p.header !== false; x.subblocks = []; rows.forEach((r, ri) => { for (let i = 0; i < nc; i++) x.subblocks.push({ id: rid(), type: ri === 0 && p.header !== false ? 'table_header' : 'table_text', content: ri === 0 && p.header !== false ? esc(r[i] || '') : `<p>${esc(r[i] || '')}</p>` }); }); } break;
        case 'review': x = newBlock('review', b); Object.assign(x.data.properties, { quote: p.quote || '', author: p.name || '', stars: Number(p.stars) || 5, show_verified_badge: p.verified !== false }); break;
        case 'columns': { const cols = (p.cols || []).slice(0, 4); const s = newSection(Math.max(1, cols.length)); cols.forEach((c, i) => { s.rows[0].columns[i].blocks = fromBlocks((c && c.blocks) || [], b).body.sections.flatMap((ss) => ss.rows[0].columns[0].blocks); }); doc.body.sections.push(s); continue; }
        default: continue;
      }
      if (x) { pd(x); if (o.show_if && o.show_if.field) x.data.display_options.visibility = { definition: JSON.stringify([o.show_if]), check: '', is_code_only: false }; if (o.id) x.id = String(o.id); add(x); }
    }
    return doc;
  }

  /** A Klaviyo template definition (GET /api/templates/{id}?additional-fields[template]=definition) → our document. */
  function fromKlaviyo(def, fixText) {
    const f = typeof fixText === 'function' ? fixText : (s) => s;
    const doc = { styles: clone((def && def.styles) || []), body: clone((def && def.body) || { styles: { width: 600 }, sections: [] }) };
    doc.styles.forEach((s) => { s.styles = s.styles || {}; s.properties = s.properties || {}; });
    doc.body.styles = doc.body.styles || { width: 600 };
    doc.body.sections = doc.body.sections || [];
    walk(doc, (n, kind) => {
      if (kind === 'section') { n.data = n.data || {}; n.data.styles = n.data.styles || {}; n.data.display_options = n.data.display_options || {}; n.rows = n.rows || []; if (!n.id) n.id = rid(); }
      if (kind === 'column') { n.blocks = n.blocks || []; if (!n.id) n.id = rid(); }
      if (kind !== 'block') return;
      if (!n.id) n.id = rid();
      n.data = n.data || {}; n.data.styles = n.data.styles || {}; n.data.display_options = n.data.display_options || {};
      if (typeof n.data.content === 'string') n.data.content = n.type === 'coupon' ? n.data.content.replace(/\{%\s*coupon_code[^%]*%\}/g, '{{ coupon }}') : f(n.data.content);
      (n.subblocks || []).forEach((sb) => { if (typeof sb.content === 'string') sb.content = f(sb.content); if (!sb.id) sb.id = rid(); });
      const dop = n.data.display_options;
      if (dop.visibility && dop.visibility.check) dop.visibility.check = String(dop.visibility.check);
      if (n.type === 'image' && n.data.properties) { const st = n.data.styles; if (st.width == null && st.max_width) st.width = st.max_width; }
      if (n.type === 'product') { const p = n.data.properties = n.data.properties || {}; if (!p.dynamic) p.items = (n.subblocks || []).filter((x) => x.type === 'product').map((x) => ({ title: x.title || x.name || '', image: x.image_url || '', price: x.price || '', compare_at: x.original_price || '', url: x.url || x.link || '', button_text: x.button_text || '', description: x.description || '' })); else p.feed = p.feed || 'bestsellers'; }
      if (n.type === 'review' && n.data.properties) { const p = n.data.properties; if (p.dynamic && !p.quote) p.quote = p.quote_placeholder || ''; if (!p.author && p.author_placeholder) p.author = p.author_placeholder; }
    });
    STYLE_TYPES.forEach((t) => ensureStyle(doc, t));
    return doc;
  }

  return { render, newDoc, newBlock, newSection, fromBlocks, fromKlaviyo, walk, find, reId, rid, clone, getStyle, ensureStyle, brandStyles, blockDefaults, SECTION_DEFAULTS, BLOCK_INFO, STYLE_TYPES, layoutPcts, hasUnsubscribe, youtubeThumb, esc };
});
