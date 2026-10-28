/* Buzzin Marketing · shared "who matches" editor (segments, flow splits, entry/exit rules). */
(() => {
const FIELD_OPTS = [['orders_count', 'Number of orders'], ['total_spent', 'Total spent ($)'], ['tier', 'Engagement tier'], ['last_order_at', 'Last order date'], ['first_order_at', 'First order date'], ['last_engaged_at', 'Last activity'], ['created_at', 'Profile created'], ['city', 'City'], ['region', 'State'], ['country', 'Country'], ['props.baby_stage', 'Baby stage (form answer)'], ['props.baby_date', "Baby's date (form answer)"], ['props.SignUp', 'SignUp (Earned / Lost)'], ['props.email_frequency', 'Email frequency choice']];
const DATE_F = new Set(['last_order_at', 'first_order_at', 'last_engaged_at', 'created_at', 'props.baby_date']);
const SIZES = ['NEWBORN', '0-3M', '3-6M', '6-9M', '6-12M', '9-12M', '12-18M', '18-24M', '2T', '3T', '4T', '5T'];
const o = (pairs, v) => pairs.map(([a, l]) => `<option value="${esc(a)}"${String(v) === String(a) ? ' selected' : ''}>${esc(l)}</option>`).join('');

function summarize(def, ctx = {}) {
  if (def && def.limit) return `${summarize({ ...def, limit: null }, ctx)} · top ${Number(def.limit).toLocaleString('en-US')} most recently engaged`;
  if (!def || !(def.conditions || []).length) return 'Everyone';
  const one = (c) => {
    if (c.group) return '(' + summarize(c.group, ctx) + ')';
    const ev = (ctx.events || {})[c.event] || c.event;
    if (c.type === 'event') { const w = c.window || {}; const when = w.kind === 'since_start' ? ' since entering' : w.kind === 'last_days' ? ` in the last ${w.days} days` : ''; return c.op === 'zero' ? `${ev}: never${when}` : `${ev}${c.value > 1 ? ` ${c.op === 'at_most' ? 'at most' : 'at least'} ${c.value}×` : ''}${when}`; }
    if (c.type === 'field') { const f = (FIELD_OPTS.find((x) => x[0] === c.field) || [c.field, c.field])[1];
      if (c.op === 'within_days') return `${f} within the last ${c.value} days`; if (c.op === 'older_than_days') return `${f} more than ${c.value} days ago`; if (c.op === 'in_days') return `${f} is ${c.value} days from today`;
      return `${f} ${({ eq: 'is', ne: 'is not', gt: '>', lt: '<', gte: '≥', lte: '≤', contains: 'contains', set: 'is set', unset: 'is empty', older_than_days: 'more than', within_days: 'within' })[c.op] || c.op}${['set', 'unset'].includes(c.op) ? '' : ' ' + c.value}${/days/.test(c.op) ? ' days ago' : ''}`; }
    if (c.type === 'consent') return `${c.state === 'subscribed' ? 'Can' : "Can't"} get ${c.channel === 'sms' ? 'texts' : 'email'}`;
    if (c.type === 'list') return `${c.in === false ? 'Not in' : 'In'} list ${((ctx.lists || []).find((l) => String(l.id) === String(c.list_id)) || {}).name || c.list_id}`;
    if (c.type === 'segment') return `${c.in === false ? 'Not in' : 'In'} segment ${((ctx.segments || []).find((l) => String(l.id) === String(c.segment_id)) || {}).name || c.segment_id}`;
    if (c.type === 'size') return `Last sizes ${c.op === 'none_of' ? 'not' : ''} ${(c.values || []).join(', ')}`;
    if (c.type === 'buzzin') return `${c.in === false ? 'No' : 'Has'} ${({ open_ticket: 'open ticket', recent_return: `return in ${c.days || 30} days`, open_claim: 'open claim' })[c.what]}`;
    return c.type;
  };
  return def.conditions.map(one).join(def.match === 'any' ? ' OR ' : ' AND ');
}

/** Draw an editable condition set into `host`, laid out like Klaviyo's condition builder:
    condition cards joined by AND; inside a card, OR alternatives. ctx = { events, lists, segments, since: true when "since starting this flow" makes sense }. */
const DIMS = [['event', 'What someone has done (or not done)'], ['field', 'Properties about someone'], ['geo', 'If someone is or is not within a location'], ['list', 'If someone is or is not in a list'], ['segment', 'If someone is or is not in a segment'], ['consent', 'If someone can or cannot receive marketing'], ['size', 'Sizes someone has bought'], ['buzzin', 'Customer service (tickets, returns, claims)']];
const GEO = new Set(['city', 'region', 'country', 'zip']);
const PROP_OPTS = () => FIELD_OPTS.filter(([k]) => !GEO.has(k));
function blank(type, ctx) {
  return ({ event: { type: 'event', event: 'placed_order', op: 'at_least', value: 1, window: { kind: ctx.since ? 'since_start' : 'ever' } }, field: { type: 'field', field: 'orders_count', op: 'gte', value: 1 },
    geo: { type: 'field', field: 'country', op: 'eq', value: 'US' }, consent: { type: 'consent', channel: 'email', state: 'subscribed' }, list: { type: 'list', list_id: ((ctx.lists || [])[0] || {}).id, in: true },
    segment: { type: 'segment', segment_id: ((ctx.segments || [])[0] || {}).id, in: true }, size: { type: 'size', op: 'any_of', values: ['0-3M'] }, buzzin: { type: 'buzzin', what: 'open_ticket', in: true } })[type];
}
const dimOf = (c) => (c.type === 'field' && GEO.has(c.field) ? 'geo' : c.type);
function editor(host, def, ctx, onChange) {
  def = def || { match: 'all', conditions: [] };
  def.conditions = def.conditions || [];
  const fire = () => { onChange(def); };
  const ev = Object.entries(ctx.events || {});
  const fields = (c) => {
    const d = dimOf(c);
    if (d === 'event') { const w = c.window || (c.window = { kind: 'ever' });
      return `<div class="kc-l">Person has</div><select data-k="event" aria-label="What they did">${o(ev, c.event)}</select>
        <div class="kc-row"><select data-k="op" aria-label="How many times">${o([['at_least', 'at least once'], ['zero', 'zero times'], ['at_least_n', 'at least'], ['at_most', 'at most'], ['exactly', 'equals']], c.op === 'at_least' && (c.value || 1) > 1 ? 'at_least_n' : c.op || 'at_least')}</select>
        ${c.op === 'zero' || (c.op === 'at_least' && (c.value || 1) <= 1) ? '' : `<input data-k="value" type="number" min="0" value="${c.value == null ? 1 : c.value}" aria-label="Times" style="width:70px"><span>times</span>`}</div>
        <div class="kc-row"><select data-k="window" aria-label="When">${o([['ever', 'over all time'], ['last_days', 'in the last'], ...(ctx.since ? [['since_start', 'since starting this flow']] : [])], w.kind)}</select>${w.kind === 'last_days' ? `<input data-k="days" type="number" min="1" value="${w.days || 30}" aria-label="Days" style="width:70px"><span>days</span>` : ''}</div>`; }
    if (d === 'field' || d === 'geo') {
      const isDate = DATE_F.has(c.field);
      const ops = isDate ? [['older_than_days', 'is more than … days ago'], ['within_days', 'is in the last … days'], ['in_days', 'is … days from today'], ['set', 'is set'], ['unset', 'is not set']]
        : d === 'geo' ? [['eq', 'is'], ['ne', 'is not'], ['contains', 'contains']] : [['eq', 'equals'], ['ne', "doesn't equal"], ['gt', 'is greater than'], ['lt', 'is less than'], ['gte', 'is at least'], ['lte', 'is at most'], ['contains', 'contains'], ['set', 'is set'], ['unset', 'is not set']];
      const opts = d === 'geo' ? [['country', 'Country'], ['region', 'State / region'], ['city', 'City'], ['zip', 'ZIP code']] : PROP_OPTS();
      return `<div class="kc-l">${d === 'geo' ? 'Person’s location' : 'Property'}</div><select data-k="field" aria-label="Property">${o(opts, c.field)}</select>
        <div class="kc-row"><select data-k="op" aria-label="Rule">${o(ops, c.op || ops[0][0])}</select>${['set', 'unset'].includes(c.op) ? '' : c.field === 'tier' ? `<select data-k="value" aria-label="Value">${o([['vip', 'VIP'], ['engaged', 'Engaged'], ['cooling', 'Cooling'], ['lapsed', 'Lapsed'], ['new', 'New'], ['stopped', 'Stopped']], c.value)}</select>` : `<input data-k="value" type="${isDate || ['gt', 'lt', 'gte', 'lte'].includes(c.op) ? 'number' : 'text'}" value="${esc(c.value == null ? '' : c.value)}" aria-label="Value" style="flex:1;min-width:80px">${/days/.test(c.op || '') ? '<span>days</span>' : ''}`}</div>`; }
    if (d === 'consent') return `<div class="kc-l">Person</div><div class="kc-row"><select data-k="state" aria-label="Can or cannot">${o([['subscribed', 'can receive'], ['not_subscribed', 'cannot receive']], c.state)}</select><select data-k="channel" aria-label="Channel">${o([['email', 'email marketing'], ['sms', 'text marketing']], c.channel)}</select></div>`;
    if (d === 'list') return `<div class="kc-l">Person</div><div class="kc-row"><select data-k="in" aria-label="Is or is not">${o([['true', 'is in'], ['false', 'is not in']], String(c.in !== false))}</select></div><select data-k="list_id" aria-label="List">${o((ctx.lists || []).map((l) => [l.id, l.name]), c.list_id)}</select>`;
    if (d === 'segment') return `<div class="kc-l">Person</div><div class="kc-row"><select data-k="in" aria-label="Is or is not">${o([['true', 'is in'], ['false', 'is not in']], String(c.in !== false))}</select></div><select data-k="segment_id" aria-label="Segment">${o((ctx.segments || []).map((l) => [l.id, l.name]), c.segment_id)}</select>`;
    if (d === 'size') return `<div class="kc-l">Sizes bought</div><select data-k="op" aria-label="Rule">${o([['any_of', 'include any of'], ['none_of', "don't include"]], c.op)}</select><div class="kc-sz">${SIZES.map((sz) => `<label><input type="checkbox" data-size="${sz}"${(c.values || []).includes(sz) ? ' checked' : ''}> ${sz}</label>`).join('')}</div>`;
    if (d === 'buzzin') return `<div class="kc-l">Person</div><div class="kc-row"><select data-k="in" aria-label="Has or has not">${o([['true', 'has'], ['false', 'has no']], String(c.in !== false))}</select><select data-k="what" aria-label="What">${o([['open_ticket', 'open customer-service ticket'], ['recent_return', 'return in the last…'], ['open_claim', 'open claim']], c.what)}</select>${c.what === 'recent_return' ? `<input data-k="days" type="number" min="1" value="${c.days || 30}" style="width:70px" aria-label="Days"><span>days</span>` : ''}</div>`;
    return '';
  };
  const alt = (c, path) => `<div class="kc-alt" data-path="${path}"><div class="kc-top"><select data-k="dim" aria-label="Dimension" style="flex:1">${o(DIMS, dimOf(c))}</select><button type="button" class="kc-x" data-rm="${path}" aria-label="Remove condition" title="Remove"><i class="ti ti-trash"></i></button></div>${fields(c)}</div>`;
  const draw = () => {
    const cards = def.conditions.map((c, i) => {
      const alts = c.group && c.group.match === 'any' ? c.group.conditions : c.group ? null : [c];
      if (!alts) return `<div class="kc-card"><div class="kc-h">Condition ${i + 1} · group</div><div data-group="${i}"></div><button type="button" class="kc-x" data-rmcard="${i}" aria-label="Remove group"><i class="ti ti-trash"></i></button></div>`;
      return `<div class="kc-card"><div class="kc-h">Condition ${i + 1}</div>${alts.map((a, j) => (j ? '<div class="kc-or">OR</div>' : '') + alt(a, `${i}.${j}`)).join('')}<button type="button" class="btn xs kc-orb" data-or="${i}"><i class="ti ti-plus"></i> OR</button></div>`;
    });
    host.innerHTML = `${def.match === 'any' && def.conditions.length > 1 ? `<div class="kc-match">Match <select data-match>${o([['all', 'all conditions (AND)'], ['any', 'any condition (OR)']], def.match)}</select></div>` : ''}
      ${def.conditions.length ? cards.join(`<div class="kc-and">${def.match === 'any' ? 'OR' : 'AND'}</div>`) : '<div class="kc-empty">No conditions yet — everyone matches.</div>'}
      <button type="button" class="btn xs" data-and style="margin-top:10px"><i class="ti ti-plus"></i> ${def.conditions.length ? 'AND' : 'Add condition'}</button>`;
    const m = host.querySelector('[data-match]'); if (m) m.onchange = (e) => { def.match = e.target.value; draw(); fire(); };
    host.querySelector('[data-and]').onclick = () => { def.conditions.push(blank('event', ctx)); draw(); fire(); };
    host.querySelectorAll('[data-or]').forEach((b) => b.onclick = () => { const i = Number(b.dataset.or), c = def.conditions[i];
      if (c.group) c.group.conditions.push(blank('event', ctx)); else def.conditions[i] = { group: { match: 'any', conditions: [c, blank('event', ctx)] } }; draw(); fire(); });
    host.querySelectorAll('[data-rmcard]').forEach((b) => b.onclick = () => { def.conditions.splice(Number(b.dataset.rmcard), 1); draw(); fire(); });
    host.querySelectorAll('[data-group]').forEach((g) => { const i = Number(g.dataset.group); editor(g, def.conditions[i].group, ctx, () => fire()); });
    const get = (path) => { const [i, j] = path.split('.').map(Number), c = def.conditions[i]; return c.group ? { list: c.group.conditions, j, i } : { list: null, j: 0, i }; };
    const getC = (path) => { const r = get(path); return r.list ? r.list[r.j] : def.conditions[r.i]; };
    const setC = (path, v) => { const r = get(path); if (r.list) r.list[r.j] = v; else def.conditions[r.i] = v; };
    host.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { const r = get(b.dataset.rm);
      if (r.list) { r.list.splice(r.j, 1); if (r.list.length === 1) def.conditions[r.i] = r.list[0]; else if (!r.list.length) def.conditions.splice(r.i, 1); } else def.conditions.splice(r.i, 1); draw(); fire(); });
    host.querySelectorAll('.kc-alt').forEach((el) => {
      const path = el.dataset.path;
      el.querySelectorAll('[data-k]').forEach((x) => x.onchange = x.oninput = () => {
        const c = getC(path), k = x.dataset.k; let v = x.value;
        if (k === 'dim') { setC(path, blank(v, ctx)); draw(); fire(); return; }
        if (k === 'window') { c.window = { kind: v, days: (c.window || {}).days || 30 }; draw(); fire(); return; }
        if (k === 'days') { if (c.type === 'event') c.window.days = Number(v); else c.days = Number(v); fire(); return; }
        if (k === 'op' && c.type === 'event') { if (v === 'at_least_n') { c.op = 'at_least'; c.value = Math.max(2, Number(c.value) || 2); } else { c.op = v; if (v === 'at_least') c.value = 1; } draw(); fire(); return; }
        if (k === 'in') v = v === 'true';
        if (k === 'value' && x.type === 'number') v = Number(v);
        c[k] = v; if (['op', 'field', 'what'].includes(k) && x.tagName === 'SELECT') draw(); fire();
      });
      el.querySelectorAll('[data-size]').forEach((x) => x.onchange = () => { getC(path).values = [...el.querySelectorAll('[data-size]:checked')].map((y) => y.dataset.size); fire(); });
    });
  };
  draw();
  return def;
}
if (!document.getElementById('mkcond-css')) { const st = document.createElement('style'); st.id = 'mkcond-css'; st.textContent = '.cond select,.cond input{max-width:100%;min-width:0}'
  + '.kc-card{position:relative;border:1px solid var(--line);border-radius:12px;background:#fff;padding:12px;margin-top:4px}.kc-h{font-weight:700;font-size:13px;margin-bottom:8px}'
  + '.kc-alt{display:flex;flex-direction:column;gap:6px}.kc-alt select,.kc-alt input{width:100%;max-width:100%;min-width:0;box-sizing:border-box}.kc-row{display:flex;gap:6px;align-items:center}.kc-row select{flex:1}.kc-row input{flex:none}.kc-row span{color:var(--muted);font-size:13px}'
  + '.kc-top{display:flex;gap:6px;align-items:center}.kc-x{all:unset;cursor:pointer;color:#71717A;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;flex:none}.kc-x:hover{background:#F4F4F5;color:#B42318}'
  + '.kc-card>.kc-x{position:absolute;top:8px;right:8px}.kc-l{font-size:12px;color:#52525B;margin-top:2px}.kc-or{text-align:center;font-size:11.5px;font-weight:700;color:#7C3AED;margin:8px 0;letter-spacing:.06em}'
  + '.kc-and{display:flex;align-items:center;gap:8px;margin:8px 0;font-size:11.5px;font-weight:700;color:#2563EB;letter-spacing:.06em}.kc-and::before,.kc-and::after{content:"";flex:1;height:1px;background:var(--line)}'
  + '.kc-orb{margin-top:10px}.kc-sz{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:13px}.kc-empty{color:var(--muted);font-size:13px;padding:6px 0}.kc-match{display:flex;gap:6px;align-items:center;margin-bottom:6px}'; document.head.appendChild(st); }
window.MK_conditions = { editor, summarize };
})();
