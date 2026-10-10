/* Buzzin Marketing · domain DNS (GoDaddy) — view records, add approved ones. Never edits or deletes. */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const at = S.findIndex((x) => x.id === 'settings');
  S.splice(at, 0, { id: 'dns', icon: 'world', label: 'Domain & DNS', render: renderDns });
});
const ST = { add: ['blue', 'Will add'], exists: ['ok', 'Already there'], blocked: ['bad', 'Blocked'] };
let PLAN = null;

async function renderDns(el) {
  const meta = await api('/api/mk/dns');
  const st = STORE || 'lb', domain = meta.domains[st];
  el.innerHTML = `<h1>Domain &amp; DNS</h1><p class="sub">${esc(domain)}${STORE ? '' : ' (pick a store at the top to switch)'} · your GoDaddy records and what each one is for. Buzzin can add records you approve; it never edits or deletes one. Admins only.</p>
  ${meta.connected ? '' : `<div class="note"><b>GoDaddy isn't connected.</b> On developer.godaddy.com, click the key icon (top right) and create a <b>Personal Access Token</b> with DNS read and update access. Add it in Railway → emily-console → Variables as <b>GODADDY_PAT</b>, then deploy.</div>`}
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(560px,1fr));gap:14px;align-items:start;margin-top:12px">
    <div class="card" style="padding:6px"><div style="padding:8px 10px;display:flex;align-items:center"><b style="font-size:15px">Current records</b><span class="sp"></span><button class="btn xs" id="dnsr"${meta.connected ? '' : ' disabled'}><i class="ti ti-refresh"></i> Reload</button></div><div id="dnslist" class="tw"><div class="empty">${meta.connected ? 'Loading…' : 'Connect GoDaddy to see records.'}</div></div></div>
    <div><div class="card"><b style="font-size:15px">Add records</b>
      <div style="font-size:12.5px;color:var(--muted);margin-top:4px">Paste rows from Amazon (or upload its "Download .csv record set" file), or tick a ready-made set. You'll see exactly what changes before anything happens.</div>
      <label style="display:flex;gap:6px;align-items:center;margin-top:10px"><input type="checkbox" id="pmf"> Amazon SES bounce address (MX + TXT on <b>send</b>)</label>
      <label style="display:flex;gap:6px;align-items:center;margin-top:6px"><input type="checkbox" id="pspf"> Google email SPF on the main domain</label>
      <label class="lab" for="dnst">Records from Amazon</label><textarea id="dnst" rows="6" style="width:100%;font-family:ui-monospace,Menlo,monospace;font-size:12px" placeholder="CNAME  abcd1234._domainkey.${esc(domain)}  abcd1234.dkim.amazonses.com"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px;align-items:center"><label class="btn xs" style="cursor:pointer"><i class="ti ti-upload"></i> Upload .csv<input type="file" id="dnsf" accept=".csv,text/csv,text/plain" style="display:none"></label><span class="sp"></span><button class="btn pri" id="dnsp"${meta.connected ? '' : ' disabled'}>Preview changes</button></div>
      <div id="dnsplan" style="margin-top:12px"></div></div>
    <div class="card" style="margin-top:14px"><b style="font-size:15px">Is it live?</b><div style="font-size:12.5px;color:var(--muted);margin-top:4px">Checks the public internet (what Gmail sees) for the records above. New records usually show within minutes, sometimes up to an hour.</div><button class="btn" id="dnsl" style="margin-top:8px" disabled>Check the previewed records</button><div id="dnslive" style="margin-top:8px"></div></div></div></div>`;
  const load = async () => {
    if (!meta.connected) return;
    $('dnslist').innerHTML = '<div class="empty">Loading…</div>';
    try { const r = await api('/api/mk/dns/' + domain);
      $('dnslist').innerHTML = `<table><thead><tr><th>Type</th><th>Name</th><th>Value</th><th>For</th></tr></thead><tbody>${r.records.map((x) => `<tr><td>${esc(x.type)}</td><td style="font-family:ui-monospace,Menlo,monospace;font-size:12px">${esc(x.name)}</td><td style="font-family:ui-monospace,Menlo,monospace;font-size:12px;word-break:break-all;min-width:220px">${x.priority != null && x.type === 'MX' ? esc(x.priority) + ' ' : ''}${esc(String(x.data).length > 90 ? String(x.data).slice(0, 90) + '…' : x.data)}</td><td>${x.purpose === 'Unknown' ? '<span class="pill hon">Unknown</span>' : esc(x.purpose)}</td></tr>`).join('')}</tbody></table>`;
    } catch (e) { $('dnslist').innerHTML = `<div class="note" style="margin:8px">${esc(e.message)}</div>`; }
  };
  load(); $('dnsr').onclick = load;
  $('dnsf').onchange = async (e) => { const f = e.target.files[0]; if (f) { $('dnst').value = await f.text(); toast('File loaded — click Preview changes'); } };
  $('dnsp').onclick = async () => {
    const presets = [...($('pmf').checked ? ['ses_mail_from'] : []), ...($('pspf').checked ? ['google_spf'] : [])];
    try { const r = await api(`/api/mk/dns/${domain}/plan`, { method: 'POST', body: JSON.stringify({ text: $('dnst').value, presets }) });
      PLAN = r.plan; const n = PLAN.filter((x) => x.status === 'add').length;
      $('dnsplan').innerHTML = `${r.errors.length ? `<div class="note">${r.errors.map(esc).join('<br>')}</div>` : ''}
        <table style="margin-top:6px"><thead><tr><th></th><th>Type</th><th>Name</th><th>Value</th></tr></thead><tbody>${PLAN.map((x) => `<tr><td>${pill(ST, x.status)}</td><td>${esc(x.type)}</td><td style="font-family:ui-monospace,Menlo,monospace;font-size:12px">${esc(x.name)}</td><td style="font-family:ui-monospace,Menlo,monospace;font-size:12px;word-break:break-all">${x.priority != null ? esc(x.priority) + ' ' : ''}${esc(x.data)}${x.why ? `<div style="font-family:inherit;color:var(--muted);font-size:11.5px">${esc(x.why)}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Nothing to add.</td></tr>'}</tbody></table>
        ${n ? `<button class="btn pri" id="dnsa" style="margin-top:10px"><i class="ti ti-check"></i> Approve and add ${n} record${n === 1 ? '' : 's'}</button>` : ''}`;
      $('dnsl').disabled = !PLAN.length;
      const a = $('dnsa'); if (a) a.onclick = async () => {
        if (a.dataset.c !== '1') { a.dataset.c = '1'; a.innerHTML = `Click again to add ${n} record${n === 1 ? '' : 's'} to ${esc(domain)}`; return; }
        try { const x = await api(`/api/mk/dns/${domain}/apply`, { method: 'POST', body: JSON.stringify({ records: PLAN }) }); toast(`Added ${x.added.length} record${x.added.length === 1 ? '' : 's'}`); a.remove(); load(); } catch (e) { toast(e.message, 1); }
      };
    } catch (e) { $('dnsplan').innerHTML = `<div class="note">${esc(e.message)}</div>`; }
  };
  $('dnsl').onclick = async () => {
    try { const r = await api(`/api/mk/dns/${domain}/live`, { method: 'POST', body: JSON.stringify({ records: (PLAN || []).filter((x) => x.status !== 'blocked') }) });
      $('dnslive').innerHTML = r.results.map((x) => `<div style="display:flex;gap:8px;align-items:center;margin-top:6px">${x.live ? '<span class="pill ok">Live</span>' : '<span class="pill hon">Not yet</span>'}<span style="font-family:ui-monospace,Menlo,monospace;font-size:12px">${esc(x.type)} ${esc(x.fq)}</span></div>`).join('') || '<div class="empty">Preview some records first.</div>';
    } catch (e) { $('dnslive').innerHTML = `<div class="note">${esc(e.message)}</div>`; }
  };
}
})();
