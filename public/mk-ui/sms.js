/* Buzzin Marketing · texting (loaded by /marketing) */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const at = S.findIndex((x) => x.id === 'brand');
  S.splice(at + 1, 0, { id: 'texting', icon: 'message', label: 'Texting', render: renderTexting });
});
const NUM = { not_started: ['off', 'Not applied for'], pending: ['hon', 'Waiting on approval'], approved: ['ok', 'Approved'], rejected: ['bad', 'Rejected'] };
const KW = { stop: ['bad', 'STOP'], help: ['blue', 'HELP'], join: ['ok', 'JOIN'] };

async function renderTexting(el) {
  const st = STORE || 'lb';
  const [s, inbox] = await Promise.all([api('/api/mk/sms/settings/' + st), api('/api/mk/sms/inbound?' + qs({ store: st }))]);
  el.innerHTML = `<h1>Texting</h1><p class="sub">${esc(STORE_NAME[st])}${STORE ? '' : ' (pick a store at the top to switch)'} · how texts read, what people get back when they reply STOP, HELP or JOIN, and every reply. Other replies become Buzzin tickets.</p>
  <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start">
  <div>
    <div class="card"><div style="display:flex;align-items:center;gap:8px"><b style="font-size:15px"><i class="ti ti-device-mobile"></i> Texting number</b><span class="sp"></span>${pill(NUM, s.number.status)}</div>
      ${s.number.phone ? `<div style="font-size:20px;font-weight:800;margin-top:6px">${esc(s.number.phone)}</div>` : '<p style="margin:6px 0 0">No number yet, so nothing can be texted. Texts from flows and campaigns are recorded as held.</p>'}
      <div id="awsbox" style="margin-top:10px"><div class="empty" style="padding:8px">Checking Amazon…</div></div></div>

    <div class="card" style="margin-top:14px"><b style="font-size:15px"><i class="ti ti-adjustments"></i> How texts read</b>
      <label class="lab" for="smb">Every text starts with</label><input id="smb" type="text" value="${esc(s.brand_name)}" style="width:100%"><div style="font-size:12px;color:var(--muted);margin-top:3px">Carriers expect the business name at the start of each marketing text.</div>
      <label class="lab" for="smo">Opt-out line (added to the end)</label><input id="smo" type="text" value="${esc(s.opt_out)}" style="width:100%">
      <label class="lab" for="smc">Cost per segment (optional, for estimates)</label><input id="smc" type="number" step="0.0001" min="0" value="${s.cost_per_segment == null ? '' : s.cost_per_segment}" placeholder="e.g. 0.0083" style="width:140px">
      <div style="font-weight:700;margin-top:14px">Keyword replies</div>
      ${['stop', 'help', 'join'].map((k) => `<div style="margin-top:8px">${pill(KW, k)} <span style="font-size:12px;color:var(--muted)">${esc(s.keywords[k].join(', '))}</span><textarea data-r="${k}" rows="2" style="width:100%;margin-top:4px">${esc(s.replies[k])}</textarea></div>`).join('')}
      <div style="font-size:12px;color:var(--muted);margin-top:4px">Use {{ brand }} and {{ reply_to }}. STOP always unsubscribes, whatever the reply says.</div>
      <button class="btn pri" id="smsave" style="margin-top:10px">Save</button></div>
  </div>
  <div>
    <div class="card"><b style="font-size:15px"><i class="ti ti-pencil"></i> Try a text</b>
      <textarea id="smt" rows="4" style="width:100%;margin-top:8px" placeholder="Hi {{ first_name | default: &quot;there&quot; }}, the fall drop is here: {{ shop_url }}">Hi {{ first_name | default: "there" }}, our softest pajamas are back in 3-6M. Shop: https://larkspurbaby.com</textarea>
      <div id="smp" style="margin-top:10px"></div>
      <div style="display:flex;gap:6px;margin-top:10px"><input id="smto" type="text" inputmode="tel" placeholder="Test number (internal test list)" style="flex:1"><button class="btn" id="smsend"><i class="ti ti-send"></i> Send test</button></div></div>

    <div class="card" style="margin-top:14px"><b style="font-size:15px"><i class="ti ti-message-reply"></i> Try a reply</b><div style="font-size:12.5px;color:var(--muted);margin-top:2px">Pretend a number on the internal test list texted in. Keywords change that test profile's consent; anything else opens a ticket.</div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><input id="sif" type="text" inputmode="tel" placeholder="From (test number)" style="width:170px"><input id="sib" type="text" placeholder="STOP, HELP, or a question" style="flex:1;min-width:160px"><button class="btn" id="sigo">Run</button></div><div id="sio" style="margin-top:8px"></div></div>

    <div class="card" style="margin-top:14px;padding:6px"><div style="padding:8px 10px"><b style="font-size:15px">Replies</b></div><div class="tw"><table><thead><tr><th>When</th><th>From</th><th>Text</th><th>Result</th></tr></thead><tbody>
      ${inbox.messages.map((m) => `<tr><td>${fmtDT(m.at)}</td><td>${esc([m.first_name, m.last_name].filter(Boolean).join(' ') || m.from_phone || '')}${m.email ? `<div style="font-size:12px;color:var(--muted)">${esc(m.email)}</div>` : ''}</td><td>${esc(m.body)}</td><td>${m.keyword ? pill(KW, m.keyword) : m.ticket_id ? `<a href="/?ticket=${m.ticket_id}" target="_blank">Ticket ${m.ticket_id}</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No replies yet.</td></tr>'}</tbody></table></div></div>
  </div></div>`;
  awsBox();
  let t = null;
  const prev = async () => { try { const r = await api('/api/mk/sms/preview', { method: 'POST', body: JSON.stringify({ store: st, body: $('smt').value }) }); const cost = s.cost_per_segment ? ` · about $${(r.segments * s.cost_per_segment * 1000).toFixed(2)} per 1,000 people` : '';
    $('smp').innerHTML = `<div style="max-width:320px;background:#E9E9EB;border-radius:18px;padding:10px 14px;white-space:pre-wrap;font-size:14px">${esc(r.body)}</div><div style="font-size:12px;color:${r.segments > 1 ? 'var(--honey-ink)' : 'var(--muted)'};margin-top:6px">${r.chars} characters · ${r.segments} segment${r.segments === 1 ? '' : 's'} (${esc(r.encoding)})${r.encoding === 'Unicode' ? ' — an emoji or special character makes every segment shorter' : ''}${cost}</div>`; } catch (e) { $('smp').innerHTML = `<div class="note">${esc(e.message)}</div>`; } };
  $('smt').oninput = () => { clearTimeout(t); t = setTimeout(prev, 300); }; prev();
  $('smsend').onclick = async () => { try { const r = await api('/api/mk/sms/test', { method: 'POST', body: JSON.stringify({ store: st, to: $('smto').value, body: $('smt').value }) }); toast(`${r.status}${r.reason ? ': ' + r.reason : ''}`); } catch (e) { toast(e.message, 1); } };
  $('smsave').onclick = async () => { try { const replies = {}; el.querySelectorAll('[data-r]').forEach((x) => { replies[x.dataset.r] = x.value; }); await api('/api/mk/sms/settings/' + st, { method: 'PUT', body: JSON.stringify({ brand_name: $('smb').value, opt_out: $('smo').value, cost_per_segment: $('smc').value, replies }) }); toast('Saved'); go(); } catch (e) { toast(e.message, 1); } };
  $('sigo').onclick = async () => { try { const r = await api('/api/mk/sms/simulate-inbound', { method: 'POST', body: JSON.stringify({ store: st, from: $('sif').value, body: $('sib').value }) });
    $('sio').innerHTML = `<div class="card" style="background:var(--panel2)">${r.keyword ? `Keyword ${pill(KW, r.keyword)}` : r.ticketId ? `Opened <a href="/?ticket=${r.ticketId}" target="_blank">ticket ${r.ticketId}</a>` : 'Nothing to do'}${r.reply ? `<div style="margin-top:6px;max-width:320px;background:#E9E9EB;border-radius:18px;padding:8px 12px;font-size:13.5px">${esc(r.reply)}</div>` : ''}</div>`; } catch (e) { $('sio').innerHTML = `<div class="note">${esc(e.message)}</div>`; } };
}
async function awsBox() {
  const box = $('awsbox'); if (!box) return;
  try {
    const r = await api('/api/mk/sms/aws/status');
    const pol = `<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:600;font-size:12.5px">Permissions Buzzin's Amazon login needs for texting</summary><pre style="white-space:pre-wrap;font-size:11px;background:var(--panel2);padding:10px;border-radius:8px;margin-top:6px">${esc(JSON.stringify(r.policy, null, 2))}</pre></details>`;
    if (!r.connected) { box.innerHTML = `<div class="note">Amazon isn't connected. Add the AWS keys in Railway (same ones as email).</div>${pol}`; return; }
    if (r.error) { box.innerHTML = `<div class="note"><b>Amazon said:</b> ${esc(r.error)}<br>Usually this means Buzzin's Amazon login is missing the texting permissions below. After adding them, wait a minute and check again.</div><button class="btn xs" id="awsre" style="margin-top:8px"><i class="ti ti-refresh"></i> Check again</button>${pol}`; $('awsre').onclick = awsBox; return; }
    const REG = { COMPLETE: ['ok', 'Approved'], APPROVED: ['ok', 'Approved'], SUBMITTED: ['hon', 'Submitted'], REVIEWING: ['hon', 'In review'], AWS_REVIEWING: ['hon', 'In review'], REQUIRES_UPDATES: ['bad', 'Needs changes'], DENIED: ['bad', 'Denied'], CREATED: ['off', 'Draft'], PROVISIONING: ['hon', 'Setting up'] };
    box.innerHTML = `<table><tbody>
      <tr><td>Account</td><td>${r.production ? '<span class="pill ok">Production</span>' : '<span class="pill hon">Sandbox</span>'}</td><td style="color:var(--muted);font-size:12.5px">${r.production ? '' : 'Only verified test numbers until Amazon lifts the sandbox.'}${r.monthly_limit != null ? ` Monthly limit $${fmtN(r.monthly_limit)}.` : ''}</td></tr>
      ${r.numbers.map((n) => `<tr><td><b>${esc(n.phone)}</b> <span style="color:var(--muted);font-size:12px">${esc(String(n.type || '').replace('_', '-').toLowerCase())}</span></td><td>${pill(REG, n.registration || 'CREATED')}</td><td style="color:var(--muted);font-size:12.5px">Number ${esc(String(n.status).toLowerCase())} · replies to Buzzin ${n.two_way_buzzin ? 'on' : 'off'} · ${n.store === 'lbo' ? 'Outlet' : 'Larkspur Baby'}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">No number yet.</td></tr>'}
      <tr><td>Replies &amp; delivery reports</td><td>${r.reports.confirmed ? '<span class="pill ok">Connected</span>' : r.reports.set_up ? '<span class="pill hon">Waiting</span>' : '<span class="pill off">Not set up</span>'}</td><td></td></tr>
    </tbody></table>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap"><button class="btn xs pri" id="awssetup"><i class="ti ti-plug"></i> ${r.reports.set_up ? 'Re-run setup' : 'Connect replies, reports &amp; keyword replies'}</button><button class="btn xs" id="awskw">Copy STOP/HELP/JOIN wording to Amazon</button><button class="btn xs" id="awsre"><i class="ti ti-refresh"></i> Check again</button></div>${pol}`;
    $('awsre').onclick = awsBox;
    $('awssetup').onclick = async () => { try { await api('/api/mk/sms/aws/setup', { method: 'POST', body: '{}' }); toast('Done — Amazon confirms the connection in a minute'); setTimeout(awsBox, 8000); } catch (e) { toast(e.message, 1); } };
    $('awskw').onclick = async () => { try { const x = await api('/api/mk/sms/aws/keywords', { method: 'POST', body: '{}' }); toast(x.synced.length ? 'Keyword replies copied to ' + x.synced.join(', ') : 'No active number yet'); } catch (e) { toast(e.message, 1); } };
  } catch (e) { box.innerHTML = `<div class="note">${esc(e.message)}</div>`; }
}
})();
