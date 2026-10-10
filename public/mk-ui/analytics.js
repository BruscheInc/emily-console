/* Buzzin Marketing · analytics (loaded by /marketing) */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const at = S.findIndex((x) => x.id === 'settings');
  S.splice(at, 0, { h: 'Results' }, { id: 'analytics', icon: 'chart-bar', label: 'Analytics', render: renderAnalytics });
});
let DAYS = (() => { try { return Number(localStorage.getItem('mk_an_days')) || 30; } catch (e) { return 30; } })();
const pct = (x, d = 1) => (x == null ? '—' : (100 * x).toFixed(d) + '%');
const HEALTH = { good: ['ok', 'Healthy'], watch: ['hon', 'Watch'], bad: ['bad', 'Act now'], none: ['off', 'Nothing sent yet'] };

function bars(series, { key, key2, label, money, height = 160 }) {
  if (!series.length) return '<div class="empty">No data in this period.</div>';
  const max = Math.max(1, ...series.map((x) => x[key]));
  const w = 100 / series.length;
  const fmt = (v) => (money ? fmt$(v) : fmtN(v));
  return `<svg viewBox="0 0 100 ${height}" preserveAspectRatio="none" style="width:100%;height:${height}px;display:block" role="img" aria-label="${esc(label)}">
    ${series.map((x, i) => { const h = (x[key] / max) * (height - 4), h2 = key2 ? (x[key2] / max) * (height - 4) : 0; return `<g><title>${esc(x.d)}: ${fmt(x[key])}${key2 ? ` (${fmt(x[key2])} from marketing)` : ''}</title><rect x="${i * w + w * 0.12}" y="${height - h}" width="${w * 0.76}" height="${h}" fill="#D9DEE6"/>${key2 ? `<rect x="${i * w + w * 0.12}" y="${height - h2}" width="${w * 0.76}" height="${h2}" fill="#E8A33D"/>` : ''}</g>`; }).join('')}
  </svg><div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-top:4px"><span>${esc(series[0].d)}</span><span>${esc(series[series.length - 1].d)}</span></div>`;
}
function fillDays(rows, days, keys) {
  const map = Object.fromEntries(rows.map((r) => [r.d, r])); const out = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); out.push({ d, ...Object.fromEntries(keys.map((k) => [k, (map[d] && map[d][k]) || 0])) }); }
  return out;
}

async function renderAnalytics(el) {
  el.innerHTML = `<h1>Analytics</h1><p class="sub">${esc(STORE_NAME[STORE])} · store revenue and the part marketing earned, list growth, forms, deliverability and repeat buying.</p>
    <div class="bar"><div class="seg">${[7, 30, 90, 365].map((d) => `<button data-d="${d}" class="${DAYS === d ? 'on' : ''}">${d === 365 ? '12 months' : d + ' days'}</button>`).join('')}</div></div><div id="anb"><div class="empty">Loading…</div></div>`;
  el.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { DAYS = Number(b.dataset.d); try { localStorage.setItem('mk_an_days', DAYS); } catch (e) {} renderAnalytics(el); });
  const [r, co] = await Promise.all([api('/api/mk/analytics?' + qs({ store: STORE, days: DAYS })), api('/api/mk/analytics/cohorts?' + qs({ store: STORE }))]);
  const sent = (ch) => r.sends.filter((x) => x.channel === ch && x.status === 'sent').reduce((a, x) => a + x.n, 0);
  const held = r.sends.filter((x) => x.status === 'held').reduce((a, x) => a + x.n, 0);
  const h = r.health; const rev = r.revenue;
  const days = fillDays(r.daily, Math.min(DAYS, 120), ['total', 'marketing', 'orders']);
  const gEmail = fillDays(r.growth.filter((x) => x.channel === 'email'), Math.min(DAYS, 120), ['gained', 'lost']);
  const gSms = fillDays(r.growth.filter((x) => x.channel === 'sms'), Math.min(DAYS, 120), ['gained', 'lost']);
  const sum = (arr, k) => arr.reduce((a, x) => a + x[k], 0);
  const kpi = (label, val, sub) => `<div class="card" style="padding:14px"><div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${label}</div><div style="font-size:26px;font-weight:800;margin-top:2px">${val}</div><div style="font-size:12.5px;color:var(--muted)">${sub || '&nbsp;'}</div></div>`;
  $('anb').innerHTML = `
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px">
    ${kpi('Store revenue', fmt$(rev.total), `${fmtN(rev.orders)} orders`)}
    ${kpi('From marketing', fmt$(rev.marketing), rev.total ? `${pct(rev.marketing / rev.total)} of revenue · ${fmtN(rev.m_orders)} orders` : '')}
    ${kpi('Emails delivered', fmtN(sent('email')), h.open != null ? `${pct(h.open)} opened · ${pct(h.click)} clicked` : held ? `${fmtN(held)} held (no sender yet)` : '')}
    ${kpi('Texts delivered', fmtN(sent('sms')), '')}
    ${kpi('Can email', fmtN(r.list_totals.email), `+${fmtN(sum(gEmail, 'gained'))} / −${fmtN(sum(gEmail, 'lost'))} in period`)}
    ${kpi('Can text', fmtN(r.list_totals.sms), `+${fmtN(sum(gSms, 'gained'))} / −${fmtN(sum(gSms, 'lost'))} in period`)}
  </div>
  <div class="card" style="margin-top:14px"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><b style="font-size:15px">Revenue by day</b><span style="font-size:12px;color:var(--muted)"><span style="display:inline-block;width:10px;height:10px;background:#D9DEE6;border-radius:2px"></span> all orders <span style="display:inline-block;width:10px;height:10px;background:#E8A33D;border-radius:2px;margin-left:8px"></span> credited to an email or text click</span><span class="sp"></span><span style="font-size:12px;color:var(--muted)">Credit: email click within ${r.attribution.email_click_days} days, text click within ${r.attribution.sms_click_days} day${r.attribution.sms_click_days === 1 ? '' : 's'} (Settings)</span></div>
    <div style="margin-top:10px">${bars(days, { key: 'total', key2: 'marketing', label: 'Revenue by day', money: true })}</div>
    <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;font-size:13px"><span>Flows <b>${fmt$(rev.flows)}</b></span><span>Campaigns <b>${fmt$(rev.campaigns)}</b></span><span>Email <b>${fmt$(rev.email)}</b></span><span>Texts <b>${fmt$(rev.sms)}</b></span></div></div>
  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;margin-top:14px;align-items:start">
    <div class="card"><b style="font-size:15px">Top earners</b><table style="margin-top:8px"><thead><tr><th>Campaign or flow</th><th class="n">Orders</th><th class="n">Revenue</th></tr></thead><tbody>${r.top.map((t) => `<tr class="click" data-go="#${t.kind === 'campaign' ? 'campaigns' : 'flows'}/${t.id}"><td>${esc(t.name)} <span class="pill off">${t.kind}</span></td><td class="n">${fmtN(t.orders)}</td><td class="n">${fmt$(t.revenue)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Nothing yet — revenue shows here once emails and texts go out and get clicked.</td></tr>'}</tbody></table></div>
    <div class="card"><div style="display:flex;align-items:center"><b style="font-size:15px">Email health</b><span class="sp"></span>${pill(HEALTH, h.status)}</div>
      <table style="margin-top:8px"><tbody>
        <tr><td>Bounce rate</td><td class="n">${pct(h.bounce, 2)}</td><td style="color:var(--muted);font-size:12px">keep under 2%</td></tr>
        <tr><td>Spam complaints</td><td class="n">${pct(h.complaint, 3)}</td><td style="color:var(--muted);font-size:12px">Gmail/Yahoo limit 0.3%, aim under 0.1%</td></tr>
        <tr><td>Unsubscribes</td><td class="n">${pct(h.unsubscribe, 2)}</td><td style="color:var(--muted);font-size:12px">under 0.5% per send</td></tr>
        <tr><td>Opens (people, not Apple's auto-opens)</td><td class="n">${pct(h.open)}</td><td></td></tr>
        <tr><td>Clicks</td><td class="n">${pct(h.click)}</td><td></td></tr></tbody></table></div>
  </div>
  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;margin-top:14px;align-items:start">
    <div class="card"><b style="font-size:15px">New email subscribers by day</b><div style="margin-top:10px">${bars(gEmail, { key: 'gained', label: 'Email subscribers gained' })}</div></div>
    <div class="card"><b style="font-size:15px">Sign-up forms</b><table style="margin-top:8px"><thead><tr><th>Form</th><th class="n">Seen</th><th class="n">Emails</th><th class="n">Phones</th><th class="n">Rate</th></tr></thead><tbody>${r.forms.map((f) => `<tr class="click" data-go="#forms/${f.id}"><td>${esc(f.name)} <span class="pill off">${esc(f.status)}</span></td><td class="n">${fmtN(f.shown)}</td><td class="n">${fmtN(f.emails)}</td><td class="n">${fmtN(f.phones)}</td><td class="n">${f.shown ? pct(f.emails / f.shown) : '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">No forms yet.</td></tr>'}</tbody></table><div style="font-size:12px;color:var(--muted);margin-top:6px">Preview visits aren't counted.</div></div>
  </div>
  <div class="card" style="margin-top:14px"><b style="font-size:15px">Do first-time buyers come back?</b><div style="font-size:12.5px;color:var(--muted);margin-top:2px">Customers grouped by the month of their first order: the share who placed a second order within 30, 60, 90, 180 and 365 days. Grey means not enough time has passed yet.</div>
    <div class="tw" style="margin-top:8px"><table><thead><tr><th>First order</th><th class="n">Customers</th>${[30, 60, 90, 180, 365].map((d) => `<th class="n">${d} days</th>`).join('')}<th class="n">Avg orders</th><th class="n">Avg spent</th></tr></thead><tbody>
    ${co.cohorts.map((c) => `<tr><td>${new Date(c.m + '-15').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td><td class="n">${fmtN(c.customers)}</td>${[30, 60, 90, 180, 365].map((d) => { const v = c.customers ? c['r' + d] / c.customers : 0; const ok = c.age_days >= d; return `<td class="n" style="background:${ok ? `rgba(232,163,61,${Math.min(0.85, v * 2.2).toFixed(2)})` : 'var(--panel2)'};color:${ok ? 'var(--ink)' : 'var(--muted)'}">${ok ? pct(v, 0) : '…'}</td>`; }).join('')}<td class="n">${Number(c.orders).toFixed(2)}</td><td class="n">${fmt$(c.ltv)}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">No orders synced yet.</td></tr>'}
    </tbody></table></div></div>`;
  $('anb').querySelectorAll('[data-go]').forEach((tr) => tr.onclick = () => { location.hash = tr.dataset.go; });
}
})();
