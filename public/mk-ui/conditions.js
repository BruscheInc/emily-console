/* Buzzin Marketing · shared "who matches" editor (segments, flow splits, entry/exit rules). */
(() => {
const FIELD_OPTS = [['orders_count', 'Number of orders'], ['total_spent', 'Total spent ($)'], ['tier', 'Engagement tier'], ['last_order_at', 'Last order date'], ['first_order_at', 'First order date'], ['last_engaged_at', 'Last activity'], ['created_at', 'Profile created'], ['city', 'City'], ['region', 'State'], ['country', 'Country'], ['props.baby_stage', 'Baby stage (form answer)'], ['props.baby_date', "Baby's date (form answer)"], ['props.SignUp', 'SignUp (Earned / Lost)'], ['props.email_frequency', 'Email frequency choice']];
const DATE_F = new Set(['last_order_at', 'first_order_at', 'last_engaged_at', 'created_at', 'props.baby_date']);
const SIZES = ['NEWBORN', '0-3M', '3-6M', '6-9M', '6-12M', '9-12M', '12-18M', '18-24M', '2T', '3T', '4T', '5T'];
const o = (pairs, v) => pairs.map(([a, l]) => `<option value="${esc(a)}"${String(v) === String(a) ? ' selected' : ''}>${esc(l)}</option>`).join('');

function summarize(def, ctx = {}) {
  if (!def || !(def.conditions || []).length) return 'Everyone';
  const one = (c) => {
    if (c.group) return '(' + summarize(c.group, ctx) + ')';
    const ev = (ctx.events || {})[c.event] || c.event;
    if (c.type === 'event') { const w = c.window || {}; const when = w.kind === 'since_start' ? ' since entering' : w.kind === 'last_days' ? ` in the last ${w.days} days` : ''; return c.op === 'zero' ? `${ev}: never${when}` : `${ev}${c.value > 1 ? ` ${c.op === 'at_most' ? 'at most' : 'at least'} ${c.value}×` : ''}${when}`; }
    if (c.type === 'field') { const f = (FIELD_OPTS.find((x) => x[0] === c.field) || [c.field, c.field])[1]; return `${f} ${({ eq: 'is', ne: 'is not', gt: '>', lt: '<', gte: '≥', lte: '≤', contains: 'contains', set: 'is set', unset: 'is empty', older_than_days: 'more than', within_days: 'within' })[c.op] || c.op}${['set', 'unset'].includes(c.op) ? '' : ' ' + c.value}${/days/.test(c.op) ? ' days ago' : ''}`; }
    if (c.type === 'consent') return `${c.state === 'subscribed' ? 'Can' : "Can't"} get ${c.channel === 'sms' ? 'texts' : 'email'}`;
    if (c.type === 'list') return `${c.in === false ? 'Not in' : 'In'} list ${((ctx.lists || []).find((l) => String(l.id) === String(c.list_id)) || {}).name || c.list_id}`;
    if (c.type === 'segment') return `${c.in === false ? 'Not in' : 'In'} segment ${((ctx.segments || []).find((l) => String(l.id) === String(c.segment_id)) || {}).name || c.segment_id}`;
    if (c.type === 'size') return `Last sizes ${c.op === 'none_of' ? 'not' : ''} ${(c.values || []).join(', ')}`;
    if (c.type === 'buzzin') return `${c.in === false ? 'No' : 'Has'} ${({ open_ticket: 'open ticket', recent_return: `return in ${c.days || 30} days`, open_claim: 'open claim' })[c.what]}`;
    return c.type;
  };
  return def.conditions.map(one).join(def.match === 'any' ? ' OR ' : ' AND ');
}

/** Draw an editable condition set into `host`. ctx = { events, lists, segments, since: true when "since entering" makes sense }. */
function editor(host, def, ctx, onChange) {
  def = def || { match: 'all', conditions: [] };
  def.conditions = def.conditions || [];
  const fire = () => { onChange(def); };
  const row = (c, i, arr, depth) => {
    const ev = Object.entries(ctx.events || {});
    let body = '';
    if (c.type === 'event') {
      const w = c.window || (c.window = { kind: 'ever' });
      body = `<select data-k="event">${o(ev, c.event)}</select><select data-k="op">${o([['at_least', 'at least'], ['zero', 'zero times'], ['at_most', 'at most'], ['exactly', 'exactly']], c.op || 'at_least')}</select>
        ${c.op === 'zero' ? '' : `<input data-k="value" type="number" min="0" value="${c.value == null ? 1 : c.value}" style="width:64px">`}
        <select data-k="window">${o([['ever', 'ever'], ['last_days', 'in the last…'], ...(ctx.since ? [['since_start', 'since entering the flow']] : [])], w.kind)}</select>${w.kind === 'last_days' ? `<input data-k="days" type="number" min="1" value="${w.days || 30}" style="width:64px"> days` : ''}`;
    } else if (c.type === 'field') {
      const isDate = DATE_F.has(c.field);
      const ops = isDate ? [['older_than_days', 'more than … days ago'], ['within_days', 'within the last … days'], ['in_days', 'is … days from today'], ['set', 'is set'], ['unset', 'is empty']] : [['eq', 'is'], ['ne', 'is not'], ['gt', 'more than'], ['lt', 'less than'], ['gte', 'at least'], ['lte', 'at most'], ['contains', 'contains'], ['set', 'is set'], ['unset', 'is empty']];
      body = `<select data-k="field">${o(FIELD_OPTS, c.field)}</select><select data-k="op">${o(ops, c.op || ops[0][0])}</select>${['set', 'unset'].includes(c.op) ? '' : c.field === 'tier' ? `<select data-k="value">${o([['vip', 'VIP'], ['engaged', 'Engaged'], ['cooling', 'Cooling'], ['lapsed', 'Lapsed'], ['new', 'New'], ['stopped', 'Stopped']], c.value)}</select>` : `<input data-k="value" type="${isDate || ['gt', 'lt', 'gte', 'lte'].includes(c.op) ? 'number' : 'text'}" value="${esc(c.value == null ? '' : c.value)}" style="width:110px">`}`;
    } else if (c.type === 'consent') body = `<select data-k="state">${o([['subscribed', 'Can get'], ['not_subscribed', "Can't get"]], c.state)}</select><select data-k="channel">${o([['email', 'email'], ['sms', 'texts']], c.channel)}</select>`;
    else if (c.type === 'list') body = `<select data-k="in">${o([['true', 'Is in'], ['false', 'Is not in']], String(c.in !== false))}</select><select data-k="list_id">${o((ctx.lists || []).map((l) => [l.id, l.name]), c.list_id)}</select>`;
    else if (c.type === 'segment') body = `<select data-k="in">${o([['true', 'Is in'], ['false', 'Is not in']], String(c.in !== false))}</select><select data-k="segment_id">${o((ctx.segments || []).map((l) => [l.id, l.name]), c.segment_id)}</select>`;
    else if (c.type === 'size') body = `<select data-k="op">${o([['any_of', 'Last sizes include'], ['none_of', "Last sizes don't include"]], c.op)}</select><span>${SIZES.map((sz) => `<label style="display:inline-flex;gap:3px;margin-right:6px"><input type="checkbox" data-size="${sz}"${(c.values || []).includes(sz) ? ' checked' : ''}>${sz}</label>`).join('')}</span>`;
    else if (c.type === 'buzzin') body = `<select data-k="in">${o([['true', 'Has'], ['false', 'Has no']], String(c.in !== false))}</select><select data-k="what">${o([['open_ticket', 'open customer-service ticket'], ['recent_return', 'return in the last…'], ['open_claim', 'open claim']], c.what)}</select>${c.what === 'recent_return' ? `<input data-k="days" type="number" min="1" value="${c.days || 30}" style="width:64px"> days` : ''}`;
    return `<div class="cond" data-i="${i}" style="max-width:100%;box-sizing:border-box;display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px;border:1px solid var(--line);border-radius:10px;background:#fff;margin-top:6px">
      <select data-k="type">${o([['event', 'Did something'], ['field', 'Profile detail'], ['consent', 'Consent'], ['list', 'List'], ['segment', 'Segment'], ['size', 'Sizes bought'], ['buzzin', 'Customer service']], c.type)}</select>${body}<span class="sp"></span><button type="button" class="btn xs" data-del aria-label="Remove">×</button></div>`;
  };
  const draw = () => {
    host.innerHTML = `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span style="font-weight:700">People who match</span><select data-match>${o([['all', 'all'], ['any', 'any']], def.match)}</select><span>of these</span></div>
      <div data-list>${def.conditions.map((c, i) => c.group ? `<div class="cond" data-i="${i}" style="border:1px dashed var(--line2);border-radius:10px;padding:8px;margin-top:6px"><div style="display:flex;align-items:center;gap:6px"><b>Group</b><span class="sp"></span><button type="button" class="btn xs" data-del>×</button></div><div data-group="${i}"></div></div>` : row(c, i)).join('')}</div>
      <div style="display:flex;gap:6px;margin-top:8px"><button type="button" class="btn xs" data-add><i class="ti ti-plus"></i> Condition</button><button type="button" class="btn xs" data-addg><i class="ti ti-plus"></i> Group (either/or)</button></div>`;
    host.querySelector('[data-match]').onchange = (e) => { def.match = e.target.value; fire(); };
    host.querySelector('[data-add]').onclick = () => { def.conditions.push({ type: 'event', event: 'placed_order', op: 'at_least', value: 1, window: { kind: ctx.since ? 'since_start' : 'ever' } }); draw(); fire(); };
    host.querySelector('[data-addg]').onclick = () => { def.conditions.push({ group: { match: 'any', conditions: [{ type: 'event', event: 'clicked_email', op: 'at_least', value: 1, window: { kind: 'last_days', days: 30 } }] } }); draw(); fire(); };
    host.querySelectorAll('[data-list] > .cond').forEach((el) => {
      const i = Number(el.dataset.i), c = def.conditions[i];
      el.querySelector('[data-del]').onclick = () => { def.conditions.splice(i, 1); draw(); fire(); };
      if (c.group) { editor(el.querySelector('[data-group]'), c.group, ctx, () => fire()); return; }
      el.querySelectorAll('[data-k]').forEach((x) => x.onchange = x.oninput = () => {
        const k = x.dataset.k; let v = x.value;
        if (k === 'type') { const d = { event: { type: 'event', event: 'placed_order', op: 'at_least', value: 1, window: { kind: 'ever' } }, field: { type: 'field', field: 'orders_count', op: 'gte', value: 1 }, consent: { type: 'consent', channel: 'email', state: 'subscribed' }, list: { type: 'list', list_id: ((ctx.lists || [])[0] || {}).id, in: true }, segment: { type: 'segment', segment_id: ((ctx.segments || [])[0] || {}).id, in: true }, size: { type: 'size', op: 'any_of', values: ['0-3M', '3-6M'] }, buzzin: { type: 'buzzin', what: 'open_ticket', in: true } }[v]; def.conditions[i] = d; draw(); fire(); return; }
        if (k === 'window') { c.window = { kind: v, days: (c.window || {}).days || 30 }; draw(); fire(); return; }
        if (k === 'days') { if (c.type === 'event') c.window.days = Number(v); else c.days = Number(v); fire(); return; }
        if (k === 'in') v = v === 'true';
        if (k === 'value' && x.type === 'number') v = Number(v);
        c[k] = v; if (['op', 'field', 'what'].includes(k)) draw(); fire();
      });
      el.querySelectorAll('[data-size]').forEach((x) => x.onchange = () => { c.values = [...el.querySelectorAll('[data-size]:checked')].map((y) => y.dataset.size); fire(); });
    });
  };
  draw();
  return def;
}
if (!document.getElementById('mkcond-css')) { const st = document.createElement('style'); st.id = 'mkcond-css'; st.textContent = '.cond select,.cond input{max-width:100%;min-width:0}'; document.head.appendChild(st); }
window.MK_conditions = { editor, summarize };
})();
