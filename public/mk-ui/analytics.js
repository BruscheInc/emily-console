/* Buzzin Marketing · analytics (loaded by /marketing) */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const at = S.findIndex((x) => x.id === 'settings');
  S.splice(at, 0, { h: 'Results' }, { id: 'analytics', icon: 'chart-bar', label: 'Analytics', render: renderAnalytics });
});
// Period: {days: 7|30|90|365|'today'} or {from:'YYYY-MM-DD', to:'YYYY-MM-DD'} (Central time)
let PER = (() => { try { const v = JSON.parse(localStorage.getItem('mk_an_period') || 'null'); if (v) return v; const d = Number(localStorage.getItem('mk_an_days')); return { days: d || 30 }; } catch (e) { return { days: 30 }; } })();
const ctYmd = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
const shortD = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
// first and last day (YYYY-MM-DD) the period covers
const perRange = (p) => p.from ? [p.from, p.to] : p.days === 'today' ? [ctYmd(Date.now()), ctYmd(Date.now())] : [ctYmd(Date.now() - (Number(p.days) - 1) * 864e5), ctYmd(Date.now())];
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
// one bar per day across the period (the last 120 days of it when it's longer)
function fillDays(rows, p, keys) {
  const map = Object.fromEntries(rows.map((r) => [r.d, r])); const out = [];
  const [a, b] = perRange(p); let t = Date.parse(b + 'T12:00:00Z'); const start = Math.max(Date.parse(a + 'T12:00:00Z'), t - 119 * 864e5);
  for (; t >= start; t -= 864e5) { const d = new Date(t).toISOString().slice(0, 10); out.unshift({ d, ...Object.fromEntries(keys.map((k) => [k, (map[d] && map[d][k]) || 0])) }); }
  return out;
}

async function renderAnalytics(el) {
  el.innerHTML = `<h1>Analytics</h1><p class="sub">${esc(STORE_NAME[STORE])} · store revenue and the part marketing earned, list growth, forms, deliverability and repeat buying.</p>
    <div class="bar"><div class="seg">${[['today', 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days'], [365, '12 months']].map(([d, l]) => `<button data-d="${d}" class="${!PER.from && String(PER.days) === String(d) ? 'on' : ''}">${l}</button>`).join('')}<button id="ancus" class="${PER.from ? 'on' : ''}"><i class="ti ti-calendar"></i> ${PER.from ? esc(PER.from === PER.to ? shortD(PER.from) : shortD(PER.from) + ' – ' + shortD(PER.to)) : 'Custom'}</button></div></div><div id="anb"><div class="empty">Loading…</div></div>`;
  const setPer = (p) => { PER = p; try { localStorage.setItem('mk_an_period', JSON.stringify(PER)); } catch (e) {} renderAnalytics(el); };
  el.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => setPer({ days: b.dataset.d === 'today' ? 'today' : Number(b.dataset.d) }));
  $('ancus').onclick = () => {
    document.querySelectorAll('.an-per').forEach((m) => m.remove());
    const r0 = $('ancus').getBoundingClientRect(), m = document.createElement('div'); m.className = 'an-per'; const today = ctYmd(Date.now()), [a0, b0] = perRange(PER);
    m.style.cssText = `position:fixed;z-index:90;left:${Math.max(8, Math.min(window.innerWidth - 300, r0.left))}px;top:${r0.bottom + 6}px;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.12);padding:14px;width:280px`;
    m.innerHTML = `<div style="font-weight:600;margin-bottom:10px">Custom dates</div><label style="display:block;font-size:12.5px;color:var(--muted)">Start<input type="date" data-f value="${a0}" max="${today}" style="width:100%;margin-top:4px"></label>
      <label style="display:block;font-size:12.5px;color:var(--muted);margin-top:8px">End<input type="date" data-t value="${b0}" max="${today}" style="width:100%;margin-top:4px"></label>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="btn xs" data-x>Cancel</button><button class="btn xs pri" data-ok>Apply</button></div>`;
    document.body.appendChild(m);
    m.querySelector('[data-x]').onclick = () => m.remove();
    m.querySelector('[data-ok]').onclick = () => { let f = m.querySelector('[data-f]').value, t = m.querySelector('[data-t]').value; if (!f || !t) return toast('Pick both dates', 1); if (f > t) [f, t] = [t, f]; m.remove(); setPer({ from: f, to: t }); };
  };
  const [r, co] = await Promise.all([api('/api/mk/analytics?' + qs({ store: STORE, ...(PER.from ? { from: PER.from, to: PER.to } : { days: PER.days }) })), api('/api/mk/analytics/cohorts?' + qs({ store: STORE }))]);
  const sent = (ch) => r.sends.filter((x) => x.channel === ch && x.status === 'sent').reduce((a, x) => a + x.n, 0);
  const held = r.sends.filter((x) => x.status === 'held').reduce((a, x) => a + x.n, 0);
  const h = r.health; const rev = r.revenue;
  const days = fillDays(r.daily, PER, ['total', 'marketing', 'orders']);
  const gEmail = fillDays(r.growth.filter((x) => x.channel === 'email'), PER, ['gained', 'lost']);
  const gSms = fillDays(r.growth.filter((x) => x.channel === 'sms'), PER, ['gained', 'lost']);
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
