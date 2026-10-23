/* Buzzin Marketing · campaign report, laid out like Klaviyo's: Overview · Recipient activity · Link activity ·
   Conversions · Deliverability · Watch live. Opened from the campaigns list once a campaign is sending or sent. */
(() => {
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = (n) => Number(n || 0).toLocaleString('en-US');
const pc = (x) => `${Number(x || 0).toFixed(2)}%`;
const money = (x) => '$' + Number(x || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (t) => t ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const COL = { delivered: '#3E63DD', opened: '#5BB59A', clicked: '#F2C14E', orders: '#E8964A', bounced: '#5BB59A' };
const TABS = [['overview', 'Overview'], ['recipients', 'Recipient activity'], ['links', 'Link activity'], ['conversions', 'Conversions'], ['deliverability', 'Deliverability'], ['live', 'Watch live']];
const CSS = `<style id="kr-css">
.kr{max-width:1320px;margin:0 auto;padding:4px 4px 60px;color:#18181B}
.kr-h{display:flex;align-items:flex-start;gap:12px;padding:6px 0 0}.kr-h .bc{font-size:19px;font-weight:600}.kr-h .bc a{color:#52525B;text-decoration:none;font-weight:500}.kr-h .bc a:hover{color:#18181B}.kr-h .bc span{color:#A1A1AA;margin:0 8px}.kr-h .ch{color:#52525B;font-size:15px;margin-top:4px}
.kr-tabs{display:flex;gap:6px;border-bottom:1px solid #E5E7EB;margin:16px 0 22px;overflow-x:auto}.kr-tabs button{all:unset;cursor:pointer;padding:10px 12px;font-size:15px;color:#3F3F46;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}.kr-tabs button:hover{color:#18181B}.kr-tabs button.on{color:#18181B;font-weight:600;border-bottom-color:#18181B}
.kr-w{max-width:1190px;margin:0 auto}
.kr-card{background:#fff;border:1px solid #E4E4E7;border-radius:16px;padding:26px 28px;margin-bottom:24px}.kr-card h2{margin:0;font-size:22px;font-weight:600;letter-spacing:-.01em}.kr-card .sub{color:#52525B;font-size:15.5px;line-height:1.55;margin:6px 0 0}
.kr-ch{display:flex;align-items:flex-start;gap:12px}.kr-ch>div{flex:1}
.kr-g2{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-bottom:24px}
.kr-big{border:1px solid #E4E4E7;border-radius:16px;padding:22px 20px;background:#fff}.kr-big .v{font-size:42px;font-weight:500;letter-spacing:-.02em;line-height:1.1}.kr-big .l{font-size:17px;font-weight:600;margin-top:4px}.kr-big .s{font-size:16px;color:#3F3F46;margin-top:6px;line-height:1.5}
.kr a.lk,.kr button.lk{all:unset;cursor:pointer;color:#2F5BD3}.kr a.lk:hover,.kr button.lk:hover{text-decoration:underline}
.kr-sel{display:flex;flex-direction:column;gap:6px;margin-bottom:24px;max-width:300px}.kr-sel label{font-weight:600;font-size:15.5px}
.kr-leg{display:flex;gap:22px;flex-wrap:wrap;margin:22px 0 10px 24px}.kr-leg label{display:flex;gap:8px;align-items:center;font-size:16px;cursor:pointer}.kr-leg input{width:18px;height:18px;margin:0}
.kr-chart{width:100%;height:340px}.kr-chart text{font-size:13px;fill:#3F3F46}
.kr-t{width:100%;border-collapse:collapse}.kr-t th{text-align:right;font-weight:500;color:#3F3F46;font-size:15px;padding:12px 14px;border-bottom:1px solid #E4E4E7}.kr-t th:first-child,.kr-t td:first-child{text-align:left}.kr-t td{text-align:right;padding:14px;font-size:15.5px;border-bottom:1px solid #F1F1F2;vertical-align:top}.kr-t td small{display:block;font-size:13.5px}
.kr-cont{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:36px;margin-top:20px}.kr-prev{background:#F4F4F5;border-radius:6px;padding:28px 0;display:flex;justify-content:center;max-height:760px;overflow:hidden}.kr-prev iframe{width:600px;height:1400px;border:0;transform:scale(.75);transform-origin:top center;margin-bottom:-350px;background:#fff;pointer-events:none}
.kr-kv b{display:block;font-size:17px;font-weight:600;margin-top:18px}.kr-kv b:first-child{margin-top:0}.kr-kv div{font-size:16px;color:#3F3F46;line-height:1.55;margin-top:4px}
.kr-fun{margin-top:10px}.kr-fun .r{display:flex;gap:12px;align-items:flex-start;position:relative;padding-bottom:22px}.kr-fun .r:not(:last-child):before{content:"";position:absolute;left:11px;top:26px;bottom:2px;width:1px;background:#D4D4D8}.kr-fun i{font-size:22px;color:#3F3F46;width:24px;flex:none}.kr-fun .x b{font-size:17px;font-weight:600}.kr-fun .x div{font-size:15px;color:#3F3F46}
.kr-btn{all:unset;cursor:pointer;border:1px solid #D4D4D8;border-radius:10px;padding:9px 18px;font-size:15.5px;font-weight:500;background:#fff;white-space:nowrap}.kr-btn:hover{background:#FAFAFA}.kr-btn.dk{background:#18181B;color:#fff;border-color:#18181B}.kr-btn.dk:hover{background:#27272A}
.kr-stats{display:grid;grid-template-columns:1.25fr repeat(5,1fr);gap:16px;margin-bottom:28px}.kr-st{border:1px solid #E4E4E7;border-radius:14px;padding:16px 18px;background:#fff}.kr-st .h{font-size:17px;font-weight:600}.kr-st .v{font-size:28px;font-weight:500;margin-top:8px}.kr-st .p{font-size:15.5px;color:#3F3F46;margin-top:8px}
.kr-st table{width:100%;font-size:16px;border-collapse:collapse}.kr-st td{padding:6px 0}.kr-st td+td{text-align:right;font-weight:500}
.kr-ra{display:grid;grid-template-columns:260px minmax(0,1fr);gap:28px}.kr-fl{display:flex;flex-direction:column;gap:2px}.kr-fl button{all:unset;cursor:pointer;padding:11px 14px;border-radius:10px;font-size:15.5px;color:#3F3F46}.kr-fl button:hover{background:#F4F4F5}.kr-fl button.on{background:#F1F1F2;color:#18181B;font-weight:600}
.kr-tb{display:flex;gap:12px;align-items:center;margin-bottom:14px;flex-wrap:wrap}.kr-tb input{flex:1;min-width:200px}
.kr-lt{width:100%;border-collapse:collapse}.kr-lt th{text-align:left;font-weight:500;color:#3F3F46;padding:12px 14px;border-bottom:1px solid #E4E4E7;font-size:15px}.kr-lt td{padding:14px;border-bottom:1px solid #F1F1F2;font-size:15px;word-break:break-word}.kr-lt td.n{white-space:nowrap}
.kr-empty{color:#71717A;text-align:center;padding:60px 10px;font-size:15px}
.kr-ls{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:22px;margin-bottom:28px}.kr-sum{border:1px solid #E4E4E7;border-radius:16px;padding:22px;display:grid;grid-template-columns:1fr 1fr;gap:26px}.kr-sum .it{display:flex;gap:14px}.kr-sum .k{background:#F4F4F5;border-radius:8px;padding:6px 10px;font-size:22px;font-weight:500;height:fit-content}.kr-sum .t b{font-size:20px;font-weight:600}.kr-sum .t div{color:#3F3F46;font-size:15px;margin-top:4px;line-height:1.5}
.kr-utm{background:#F4F4F5;border-radius:6px;padding:22px 20px}.kr-utm h3{margin:0 0 14px;font-size:21px;font-weight:600}.kr-utm b{display:block;font-size:17px;margin-top:14px}.kr-utm div{color:#3F3F46;font-size:15.5px;margin-top:2px}
.kr-hl{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-top:20px}.kr-hc{border:1px solid #E4E4E7;border-radius:10px;padding:20px 18px}.kr-hc .v{font-size:38px;font-weight:500}.kr-hc .l{font-size:17px;font-weight:600;margin-top:4px}
.kr-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 10px;font-size:14.5px;margin-top:12px}.kr-badge.ok{background:#E7F6EC;color:#166534}.kr-badge.mid{background:#FEF6D8;color:#7A5B00}.kr-badge.bad{background:#FDECEC;color:#B42318}
.kr-sub{display:flex;gap:26px;border-bottom:1px solid #E4E4E7;margin:18px 0 10px}.kr-sub button{all:unset;cursor:pointer;padding:10px 2px;font-size:15.5px;color:#52525B;border-bottom:2px solid transparent;margin-bottom:-1px}.kr-sub button.on{color:#18181B;font-weight:600;border-bottom-color:#18181B}
.kr-hb{display:grid;grid-template-columns:200px minmax(0,1fr) 120px;gap:12px;align-items:center;margin:10px 0}.kr-hb .nm{text-align:right;color:#3F3F46;font-size:15.5px}.kr-hb .kr-bar{display:flex;flex-wrap:nowrap;height:34px;min-width:0}.kr-hb .kr-bar span{display:block;height:100%;flex:none}.kr-hb .ct{font-size:13.5px;color:#52525B}
.kr-live{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px}.kr-feed div{display:flex;gap:12px;padding:10px 4px;border-bottom:1px solid #F1F1F2;font-size:15px}.kr-feed i{width:20px}.kr-feed .t{margin-left:auto;color:#71717A;white-space:nowrap}
.kr-prog{height:10px;background:#F1F1F2;border-radius:99px;overflow:hidden;margin-top:12px}.kr-prog div{height:100%;background:#3E63DD}
.kr-pg{display:flex;gap:10px;align-items:center;margin-top:14px;color:#3F3F46}
@media (max-width:900px){.kr-g2,.kr-cont,.kr-ls,.kr-ra{grid-template-columns:1fr}.kr-stats{grid-template-columns:1fr 1fr}.kr-hl{grid-template-columns:1fr 1fr}.kr-hb{grid-template-columns:110px 1fr 70px}}
</style>`;

let ST = { tab: 'overview', filter: 'delivered', q: '', offset: 0, dtab: 'providers', legend: { delivered: true, opened: true, clicked: true, orders: true }, dleg: { delivered: true, bounced: true } };
let liveT = null;

window.MK_campaignReport = async function (el, camp, onEdit) {
  if (!document.getElementById('kr-css')) document.head.insertAdjacentHTML('beforeend', CSS);
  clearInterval(liveT);
  const id = camp.id;
  el.innerHTML = `<div class="kr"><div class="kr-h"><div style="flex:1"><div class="bc"><a href="#campaigns">Campaigns</a><span>/</span>${esc(camp.name)}</div><div class="ch">${camp.channel === 'sms' ? 'Text message' : 'Email'}${camp.status === 'sending' ? ' · <b style="color:#2F5BD3">Sending now</b>' : ''}</div></div>
    <button class="kr-btn" id="krEdit">View campaign</button></div>
    <div class="kr-tabs" role="tablist">${TABS.map(([k, l]) => `<button role="tab" data-t="${k}" class="${ST.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div id="krBody"><div class="bz-loading">Loading report…</div></div></div>`;
  el.querySelector('#krEdit').onclick = onEdit;
  el.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { ST.tab = b.dataset.t; el.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
  const body = () => el.querySelector('#krBody');
  let R = null;
  const draw = async () => {
    clearInterval(liveT);
    const b = body(); if (!b) return;
    try {
      if (!R || ST.tab === 'overview') R = await api(`/api/mk/campaigns/${id}/report`);
      if (ST.tab === 'overview') overview(b, R, id);
      else if (ST.tab === 'recipients') recipientsTab(b, R, id);
      else if (ST.tab === 'links') await linksTab(b, R, id);
      else if (ST.tab === 'conversions') await convTab(b, R, id);
      else if (ST.tab === 'deliverability') await delivTab(b, R, id);
      else if (ST.tab === 'live') await liveTab(b, R, id);
    } catch (e) { b.innerHTML = `<div class="bz-err">${esc(e.message)}</div>`; }
  };
  window._krGo = (tab, filter) => { ST.tab = tab; if (filter) { ST.filter = filter; ST.offset = 0; } el.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x.dataset.t === tab)); draw(); };
  draw();
};

/* ---------------- Overview ---------------- */
function overview(b, R, id) {
  const e = R.engagement, r = R.recipients, t = R.rates, isE = R.campaign.channel !== 'sms';
  const go = (f) => `<button class="lk" onclick="_krGo('recipients','${f}')">`;
  b.innerHTML = `<div class="kr-w">
    <div class="kr-sel"><label for="krMet">Conversion metric</label><select id="krMet"><option>Placed Order</option></select></div>
    <div class="kr-g2">
      ${isE ? `<div class="kr-big"><div class="v">${pc(t.open)}</div><div class="l">Open rate</div><div class="s">${go('opened')}${n0(e.opened)} recipients</button><br>${n0(e.opens_total)} total opens</div></div>` : ''}
      <div class="kr-big"><div class="v">${pc(t.click)}</div><div class="l">Click rate</div><div class="s">${go('clicked')}${n0(e.clicked)} recipients</button></div></div>
      <div class="kr-big"><div class="v">${pc(t.order)}</div><div class="l">Placed order rate</div><div class="s">${go('converted')}${n0(e.converted)} recipients</button></div></div>
      <div class="kr-big"><div class="v">${money(e.revenue)}</div><div class="l">Revenue</div><div class="s">${go('converted')}${n0(e.converted)} recipients</button><br>${money(t.aov)} AOV<br>${money(t.per_recipient)} per recipient</div></div>
    </div>
    <div class="kr-card"><h2>Engagement over time</h2>
      <div class="kr-leg">${[['delivered', 'Delivered'], ...(isE ? [['opened', 'Opened']] : []), ['clicked', 'Clicked'], ['orders', 'Placed Order']].map(([k, l]) => `<label><input type="checkbox" data-lg="${k}"${ST.legend[k] ? ' checked' : ''} style="accent-color:${COL[k]}"> ${l}</label>`).join('')}</div>
      <div id="krChart"></div></div>
    <div class="kr-card"><div class="kr-ch"><div><h2>Deliverability</h2><p class="sub">Deliverability is whether your messages reach people's inboxes. Bounces, spam complaints and unsubscribes all affect it.</p></div><button class="kr-btn" onclick="_krGo('deliverability')">View more</button></div>
      <table class="kr-t" style="margin-top:26px"><thead><tr><th>Channel</th><th>Sent</th><th>Delivery rate</th><th>Bounce rate</th><th>Spam complaint rate</th><th>Unsubscribe rate</th></tr></thead>
      <tbody><tr><td>${isE ? 'Email' : 'Text'}</td><td>${n0(r.sent)}</td><td>${pc(t.delivery).replace('.00', '.0')}<small>${go('delivered')}${n0(r.delivered)} recipients</button></small></td><td>${pc(t.bounce)}<small>${go('bounced')}${n0(r.bounced)} recipients</button></small></td><td>${pc(t.spam)}<small>${go('spam')}${n0(e.spam)} recipients</button></small></td><td>${pc(t.unsub)}<small>${go('unsubscribed')}${n0(e.unsubscribed)} recipients</button></small></td></tr></tbody></table></div>
    <div class="kr-card"><div class="kr-ch"><div><h2>Content</h2><div class="sub" style="margin-top:2px">${isE ? 'Email' : 'Text message'}</div></div>${R.content.template_id ? `<a class="kr-btn" href="#templates/${R.content.template_id}">View</a>` : ''}</div>
      <div class="kr-cont"><div class="kr-prev" id="krPrev">${isE ? '<div class="bz-loading" style="padding:40px">Loading…</div>' : `<div style="max-width:320px;background:#E9E9EB;border-radius:18px;padding:12px 16px;white-space:pre-wrap;font-size:15px;align-self:flex-start;margin:0 20px">${esc(R.content.body)}</div>`}</div>
        <div class="kr-kv">${isE ? `<b>Subject</b><div>${esc(R.content.subject)}</div><b>Preview text</b><div>${esc(R.content.preview || '—')}</div><b>From/reply-to</b><div>${esc(R.content.from)}</div>` : ''}
          <b>Included lists and segments</b><div>${R.content.included.map(esc).join('<br>') || '—'}</div>
          <b>Excluded lists and segments</b><div style="color:#71717A">${R.content.excluded.map(esc).join('<br>') || 'No excluded lists and segments'}</div>
          <b>Recipients</b><div class="kr-fun">
            <div class="r"><i class="ti ti-clock"></i><div class="x"><b>${n0(r.attempted)} attempted</b>${r.queued ? `<div>${n0(r.queued)} still sending</div>` : ''}</div></div>
            <div class="r"><i class="ti ti-ban"></i><div class="x"><b>${n0(r.skipped)} skipped</b><div>${pc(r.attempted ? r.skipped / r.attempted * 100 : 0)} of attempted</div></div></div>
            <div class="r"><i class="ti ti-send"></i><div class="x"><b>${n0(r.sent)} sent</b><div>${pc(r.attempted ? r.sent / r.attempted * 100 : 0)} of attempted</div></div></div>
            <div class="r"><i class="ti ti-arrow-back-up"></i><div class="x"><b>${n0(r.bounced)} bounced</b><div>${pc(t.bounce)} of sent</div></div></div>
            <div class="r"><i class="ti ti-inbox"></i><div class="x"><b>${n0(r.delivered)} delivered</b><div>${pc(t.delivery)} of sent</div></div></div></div></div></div></div>
  </div>`;
  b.querySelectorAll('[data-lg]').forEach((c) => c.onchange = () => { ST.legend[c.dataset.lg] = c.checked; chart(b.querySelector('#krChart'), R.timeline); });
  chart(b.querySelector('#krChart'), R.timeline);
  if (isE && R.content.template_id) api(`/api/mk/templates/${R.content.template_id}/thumb`).then((x) => { const p = b.querySelector('#krPrev'); if (!p) return; p.innerHTML = '<iframe title="Email preview" sandbox="allow-same-origin" scrolling="no"></iframe>'; p.querySelector('iframe').srcdoc = x.html; }).catch(() => { const p = b.querySelector('#krPrev'); if (p) p.innerHTML = '<div class="kr-empty">No preview</div>'; });
}

/* grouped bars, right-hand axis, like Klaviyo's engagement chart */
function chart(host, T) {
  if (!host) return;
  const B = (T && T.buckets) || []; if (!B.length) { host.innerHTML = '<div class="kr-empty">Nothing to show yet.</div>'; return; }
  const keys = ['delivered', 'opened', 'clicked', 'orders'].filter((k) => ST.legend[k]);
  const W = 1000, H = 340, L = 20, R = 70, TOP = 14, BOT = 40, pw = W - L - R, ph = H - TOP - BOT;
  const max = Math.max(1, ...B.flatMap((b) => keys.map((k) => b[k])));
  const raw = Math.max(1, max * 1.05 / 6), p10 = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((x) => x * p10).find((x) => x >= raw) || p10 * 10), top = step * 6;
  const y = (v) => TOP + ph - (v / top) * ph;
  const bw = pw / B.length, gw = Math.max(1, Math.min(8, (bw * 0.7) / Math.max(1, keys.length)));
  let svg = `<svg class="kr-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Engagement over time">`;
  for (let i = 0; i <= 6; i++) { const v = step * i; svg += `<text x="${W - R + 12}" y="${y(v) + 4}">${v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'K' : v}</text>`; }
  svg += `<text x="${W - 14}" y="${TOP + ph / 2}" transform="rotate(90 ${W - 14} ${TOP + ph / 2})" text-anchor="middle">Recipients</text>`;
  B.forEach((b, i) => { keys.forEach((k, j) => { const v = b[k]; if (!v) return; const x = L + i * bw + (bw - gw * keys.length) / 2 + j * gw; svg += `<rect x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${Math.max(1, gw - 0.5).toFixed(1)}" height="${(TOP + ph - y(v)).toFixed(1)}" fill="${COL[k]}"><title>${new Date(b.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })} · ${k === 'orders' ? 'Placed Order' : k[0].toUpperCase() + k.slice(1)}: ${n0(v)}</title></rect>`; }); });
  for (let i = 0; i < B.length; i++) if (i % Math.max(1, Math.round(B.length / 10)) === 0) svg += `<text x="${L + i * bw}" y="${H - 12}">${new Date(B[i].at).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit' })}</text>`;
  for (let i = 0; i < B.length; i++) svg += `<circle cx="${L + i * bw + bw / 2}" cy="${TOP + ph}" r="1.6" fill="#D4D4D8"/>`;
  host.innerHTML = svg + '</svg>';
}

/* ---------------- Recipient activity ---------------- */
const FL = [['delivered', 'Delivered'], ['opened', 'Opened'], ['clicked', 'Clicked'], ['converted', 'Converted'], ['bounced', 'Bounced'], ['unsubscribed', 'Unsubscribed'], ['spam', 'Marked as Spam'], ['skipped', 'Skipped']];
function recipientsTab(b, R, id) {
  const e = R.engagement, r = R.recipients, t = R.rates, isE = R.campaign.channel !== 'sms';
  const cnt = { delivered: r.delivered, opened: e.opened, clicked: e.clicked, converted: e.converted, bounced: r.bounced, unsubscribed: e.unsubscribed, spam: e.spam, skipped: r.skipped };
  const fl = FL.filter(([k]) => isE || k !== 'opened');
  b.innerHTML = `<div class="kr-stats">
      <div class="kr-st"><table><tr><td><b>Total</b></td><td>${n0(r.attempted)}</td></tr><tr><td>Delivered</td><td>${n0(r.delivered)}</td></tr><tr><td>Bounced</td><td>${n0(r.bounced)}</td></tr><tr><td>Skipped</td><td>${n0(r.skipped)}</td></tr></table></div>
      ${[...(isE ? [['Opened', e.opened, t.open]] : []), ['Clicked', e.clicked, t.click], ['Converted', e.converted, t.order], ['Unsubscribed', e.unsubscribed, t.unsub], ['Marked as spam', e.spam, t.spam]].map(([l, v, p]) => `<div class="kr-st"><div class="h">${l}</div><div class="v">${n0(v)}</div><div class="p">${Number(p || 0).toFixed(1)}%</div></div>`).join('')}</div>
    <div class="kr-ra"><div class="kr-fl">${fl.map(([k, l]) => `<button data-f="${k}" class="${ST.filter === k ? 'on' : ''}">${l} (${n0(cnt[k])})</button>`).join('')}</div>
      <div><div class="kr-tb"><div class="kr-sel" style="margin:0"><label for="krMet2">Conversion metric</label><select id="krMet2"><option>Placed Order</option></select></div><span style="flex:1"></span><a class="kr-btn" id="krCsv">Export CSV</a></div>
        <div class="kr-card" style="padding:22px 24px"><h2>Recipients</h2><div class="kr-tb" style="margin-top:14px"><input type="search" id="krQ" placeholder="Search by email or name" value="${esc(ST.q)}" aria-label="Search recipients"></div><div id="krRows"><div class="bz-loading">Loading…</div></div></div></div></div>`;
  const load = async () => {
    const box = b.querySelector('#krRows'); if (!box) return;
    const d = await api(`/api/mk/campaigns/${id}/report/recipients?` + new URLSearchParams({ filter: ST.filter, q: ST.q, offset: ST.offset }));
    b.querySelector('#krCsv').href = `/api/mk/campaigns/${id}/report/recipients?` + new URLSearchParams({ filter: ST.filter, q: ST.q, csv: 1, key: (window.KEY || (() => { try { return localStorage.getItem('ec_key'); } catch (e) { return ''; } })()) || '' });
    box.innerHTML = d.rows.length ? `<table class="kr-lt"><thead><tr><th>Email</th><th>Name</th><th>When</th><th>Detail</th></tr></thead><tbody>${d.rows.map((x) => `<tr><td>${x.profile_id ? `<a class="lk" href="#profiles/${x.profile_id}">${esc(x.email || '—')}</a>` : esc(x.email || '—')}</td><td>${esc(x.name || '')}</td><td class="n">${when(x.at)}</td><td>${esc(x.extra || '')}</td></tr>`).join('')}</tbody></table>
      <div class="kr-pg"><span>${n0(ST.offset + 1)} – ${n0(ST.offset + d.rows.length)} of ${n0(d.total)}</span><span style="flex:1"></span><button class="kr-btn" id="krPrev2"${ST.offset ? '' : ' disabled style="opacity:.4"'}>Previous</button><button class="kr-btn" id="krNext"${ST.offset + d.rows.length < d.total ? '' : ' disabled style="opacity:.4"'}>Next</button></div>` : '<div class="kr-empty">No data available</div>';
    const pv = box.querySelector('#krPrev2'), nx = box.querySelector('#krNext');
    if (pv) pv.onclick = () => { if (!ST.offset) return; ST.offset = Math.max(0, ST.offset - 50); load(); };
    if (nx) nx.onclick = () => { if (ST.offset + d.rows.length >= d.total) return; ST.offset += 50; load(); };
  };
  b.querySelectorAll('[data-f]').forEach((x) => x.onclick = () => { ST.filter = x.dataset.f; ST.offset = 0; b.querySelectorAll('[data-f]').forEach((y) => y.classList.toggle('on', y === x)); load(); });
  let qt = null; b.querySelector('#krQ').oninput = (ev) => { clearTimeout(qt); qt = setTimeout(() => { ST.q = ev.target.value.trim(); ST.offset = 0; load(); }, 300); };
  load().catch((e2) => { b.querySelector('#krRows').innerHTML = `<div class="bz-err">${esc(e2.message)}</div>`; });
}

/* ---------------- Link activity ---------------- */
async function linksTab(b, R, id) {
  const d = await api(`/api/mk/campaigns/${id}/report/links`);
  const didnt = Math.max(0, R.recipients.delivered - d.people);
  const csv = 'data:text/csv;charset=utf-8,' + encodeURIComponent(['URL,Unique clicks,Total clicks', ...d.links.map((l) => `"${l.url.replace(/"/g, '""')}",${l.unique},${l.total}`)].join('\n'));
  b.innerHTML = `<div class="kr-tb"><span style="flex:1"></span><a class="kr-btn" href="${csv}" download="campaign-${id}-links.csv">Export CSV</a></div>
    <div class="kr-ls"><div class="kr-sum">
      <div class="it"><div class="k">${n0(d.people)}</div><div class="t"><b>people clicked</b><div>That's a ${pc(R.rates.click).replace(/0%$/, '%')} click rate.</div></div></div>
      <div class="it"><div class="k">${n0(d.total)}</div><div class="t"><b>total clicks</b><div>Made by ${n0(d.people)} people</div></div></div>
      <div class="it"><div class="k">${d.people ? (d.total / d.people).toFixed(1) : '0'}</div><div class="t"><b>clicks per person</b><div>The average among people who clicked.</div></div></div>
      <div class="it"><div class="k">${n0(didnt)}</div><div class="t"><b>didn't click</b><div>That's <b>${pc(R.recipients.delivered ? didnt / R.recipients.delivered * 100 : 0)}</b> of people who received this message.</div></div></div></div>
      <div class="kr-utm"><h3>UTM PARAMETERS</h3><b>Source</b><div>${esc(d.utm.source)}</div><b>Medium</b><div>${esc(d.utm.medium)}</div><b>Campaign</b><div>${esc(d.utm.campaign)}</div></div></div>
    ${d.links.length ? `<table class="kr-lt"><thead><tr><th>URL</th><th style="width:200px">Unique Clicks</th><th style="width:200px">Total Clicks</th></tr></thead><tbody>${d.links.map((l) => `<tr><td><a class="lk" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a></td><td>${n0(l.unique)}</td><td>${n0(l.total)}</td></tr>`).join('')}</tbody></table>` : '<div class="kr-empty">No clicks yet.</div>'}`;
}

/* ---------------- Conversions ---------------- */
async function convTab(b, R, id) {
  const d = await api(`/api/mk/campaigns/${id}/report/orders`);
  b.innerHTML = `<div class="kr-g2">
      <div class="kr-big"><div class="v">${money(d.revenue)}</div><div class="l">Revenue</div><div class="s">${n0(d.total)} orders · ${money(d.total ? d.revenue / d.total : 0)} AOV</div></div>
      <div class="kr-big"><div class="v">${pc(R.rates.order)}</div><div class="l">Placed order rate</div><div class="s">${n0(R.engagement.converted)} recipients · ${money(R.rates.per_recipient)} per recipient</div></div></div>
    <p class="sub" style="color:#52525B;margin:0 0 14px">An order counts for this ${R.campaign.channel === 'sms' ? 'text' : 'email'} when it's placed within ${R.attribution_days} days of clicking it.</p>
    ${d.orders.length ? `<table class="kr-lt"><thead><tr><th>Order</th><th>Customer</th><th>When</th><th>Value</th></tr></thead><tbody>${d.orders.map((o) => `<tr><td>${esc(o.order_name || '—')}</td><td>${o.profile_id ? `<a class="lk" href="#profiles/${o.profile_id}">${esc(o.email || '')}</a>` : esc(o.email || '')}</td><td class="n">${when(o.at)}</td><td class="n">${money(o.value)}</td></tr>`).join('')}</tbody></table>` : '<div class="kr-empty">No orders credited yet.</div>'}`;
}

/* ---------------- Deliverability ---------------- */
const HEALTH = { open: (v) => v >= 20 ? 'ok' : v >= 10 ? 'mid' : 'bad', click: (v) => v >= 1.2 ? 'ok' : v >= 0.6 ? 'mid' : 'bad', bounce: (v) => v < 1 ? 'ok' : v < 2 ? 'mid' : 'bad', unsub: (v) => v < 0.3 ? 'ok' : v < 1.5 ? 'mid' : 'bad', spam: (v) => v < 0.01 ? 'ok' : v < 0.08 ? 'mid' : 'bad' };
const BADGE = { ok: ['ok', 'Healthy', 'circle-check'], mid: ['mid', 'Room for improvement', 'alert-triangle'], bad: ['bad', 'Needs attention', 'alert-circle'] };
async function delivTab(b, R, id) {
  const d = await api(`/api/mk/campaigns/${id}/report/deliverability`);
  const t = R.rates, isE = R.campaign.channel !== 'sms';
  const cards = [...(isE ? [['open', t.open, 'Open rate']] : []), ['click', t.click, 'Click rate'], ['bounce', t.bounce, 'Bounce rate'], ['unsub', t.unsub, 'Unsubscribe rate'], ['spam', t.spam, 'Spam complaint rate']];
  b.innerHTML = `<div class="kr-card"><h2 style="font-size:19px">Key deliverability metrics health</h2><div class="sub" style="font-size:15px;margin-top:4px">Whether your engagement is helping you keep a healthy sender reputation.</div>
      <div class="kr-hl" style="grid-template-columns:repeat(${cards.length},1fr)">${cards.map(([k, v, l]) => { const [c, txt, ic] = BADGE[HEALTH[k](v)]; return `<div class="kr-hc"><div class="v">${pc(v)}</div><div class="l">${l}</div><span class="kr-badge ${c}"><i class="ti ti-${ic}"></i> ${txt}</span></div>`; }).join('')}</div></div>
    <div class="kr-card"><h2>${isE ? 'Email' : 'Text'} send volume breakdown</h2><div class="sub" style="font-size:15.5px">Where most of your messages went</div>
      <div class="kr-sub">${[['providers', 'Inbox provider'], ['domains', isE ? 'Email domain' : 'Carrier'], ['countries', 'Country']].map(([k, l]) => `<button data-dt="${k}" class="${ST.dtab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="kr-leg" style="margin-left:0">${[['delivered', 'Delivered'], ['bounced', 'Bounced']].map(([k, l]) => `<label><input type="checkbox" data-dl="${k}"${ST.dleg[k] ? ' checked' : ''} style="accent-color:${COL[k]}"> ${l}</label>`).join('')}</div><div id="krBars"></div>
      ${d.bounce_kinds.length ? `<div class="sub" style="margin-top:18px;font-size:14.5px">Bounces: ${d.bounce_kinds.map((k) => `${esc(k.kind)} ${n0(k.n)}`).join(' · ')} (Permanent bounces are never emailed again.)</div>` : ''}</div>`;
  const bars = () => {
    const rows = d[ST.dtab] || []; const max = Math.max(1, ...rows.map((r) => (ST.dleg.delivered ? r.delivered : 0) + (ST.dleg.bounced ? r.bounced : 0)));
    b.querySelector('#krBars').innerHTML = rows.length ? rows.map((r) => { const dv = ST.dleg.delivered ? r.delivered : 0, bv = ST.dleg.bounced ? r.bounced : 0;
      return `<div class="kr-hb"><div class="nm">${esc(r.name)}</div><div class="kr-bar"><span style="width:${dv / max * 100}%;background:${COL.delivered}" title="Delivered ${n0(r.delivered)}"></span><span style="width:${Math.max(bv ? 0.4 : 0, bv / max * 100)}%;background:${COL.bounced}" title="Bounced ${n0(r.bounced)}"></span></div><div class="ct">${n0(r.delivered)}${r.bounced ? ` · ${n0(r.bounced)} bounced` : ''}</div></div>`; }).join('') : '<div class="kr-empty">Nothing yet.</div>';
  };
  b.querySelectorAll('[data-dt]').forEach((x) => x.onclick = () => { ST.dtab = x.dataset.dt; b.querySelectorAll('[data-dt]').forEach((y) => y.classList.toggle('on', y === x)); bars(); });
  b.querySelectorAll('[data-dl]').forEach((x) => x.onchange = () => { ST.dleg[x.dataset.dl] = x.checked; bars(); });
  bars();
}

/* ---------------- Watch live ---------------- */
async function liveTab(b, R, id) {
  const ICO = { opened: ['mail-opened', 'opened'], clicked: ['click', 'clicked'], bounced: ['arrow-back-up', 'bounced'], complained: ['alert-octagon', 'marked it as spam'] };
  const render = async () => {
    if (!b.isConnected) return clearInterval(liveT);
    const d = await api(`/api/mk/campaigns/${id}/report/live`);
    const done = d.total - d.queued;
    b.innerHTML = `<div class="kr-live">
        <div class="kr-big"><div class="v">${n0(done)}</div><div class="l">of ${n0(d.total)} processed</div><div class="kr-prog"><div style="width:${d.total ? done / d.total * 100 : 0}%"></div></div></div>
        <div class="kr-big"><div class="v">${n0(d.per_minute)}</div><div class="l">sent in the last minute</div><div class="s">${d.queued ? `${n0(d.queued)} still to go` : 'Finished sending'}</div></div>
        <div class="kr-big"><div class="v">${n0(R.engagement.opened)}</div><div class="l">people opened so far</div><div class="s">${n0(R.engagement.clicked)} clicked · ${money(R.engagement.revenue)} revenue</div></div></div>
      <div class="kr-card"><h2>Live activity</h2><div class="sub">Updates every 5 seconds.</div><div class="kr-feed" style="margin-top:14px">${d.events.length ? d.events.map((e) => { const [ic, v] = ICO[e.type] || ['point', e.type]; return `<div><i class="ti ti-${ic}" style="color:${e.type === 'bounced' || e.type === 'complained' ? '#B42318' : '#3F3F46'}"></i><span>${esc(e.to_addr || 'Someone')} ${v}${e.type === 'clicked' && e.url ? ` <span style="color:#71717A">${esc(String(e.url).replace(/^https?:\/\//, '').slice(0, 60))}</span>` : ''}</span><span class="t">${when(e.at)}</span></div>`; }).join('') : '<div class="kr-empty">No activity yet.</div>'}</div></div>`;
  };
  await render(); liveT = setInterval(() => { if (ST.tab !== 'live') return clearInterval(liveT); render().catch(() => {}); }, 5000);
}
})();
