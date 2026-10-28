/* Buzzin Marketing · Lists & segments in one table, laid out like Klaviyo: search, type filter, star, ⋮ menu per row,
   tick boxes for deleting several at once, and Create (list, segment, or a segment Emily builds from a description). */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const li = S.find((x) => x.id === 'lists'); if (li) { li.label = 'Lists & segments'; li.render = renderGroups; }
  const sg = S.find((x) => x.id === 'segments');
  if (sg) { const edit = sg.render; sg.hidden = true; sg.render = (el, id) => (id ? edit(el, id) : (location.hash = '#lists', null)); }
});

const ICON = (n) => `<i class="ti ti-${n}"></i>`;
let TYPE = '', Q = '', CHECKED = new Set();
const key = (x) => x.kind + ':' + x.id;

async function renderGroups(el) {
  const KL = window.MK_KL || {};
  let items = (await api('/api/mk/groups')).items;
  el.innerHTML = (KL.LCSS || '') + `<style>
    .kl .star{all:unset;cursor:pointer;color:#D4D4D8;font-size:18px;display:inline-flex}.kl .star.on{color:#F59E0B}.kl .star:hover{color:#A1A1AA}.kl .star.on:hover{color:#D97706}
    .kl .cb{width:18px;height:18px;accent-color:#18181B}.kl td.nm2{display:flex;align-items:center;gap:12px}.kl .bulk{display:flex;align-items:center;gap:10px;background:#F4F4F5;border-radius:10px;padding:8px 12px;margin-bottom:12px}
    .kl th.sort{cursor:pointer}.kl .fx{color:var(--muted);font-size:12px;margin-left:6px}
  </style><div class="kl"><div class="kl-h"><h1>Lists &amp; segments</h1><button class="btn pri" id="gcr">Create ${ICON('chevron-down')}</button></div>
    <div class="kl-b"><div id="gai"></div><div class="kl-f"><input type="search" id="gq" placeholder="Search lists" value="${esc(Q)}" aria-label="Search lists and segments">
      <select id="gt" aria-label="Type"><option value="">All types</option><option value="list"${TYPE === 'list' ? ' selected' : ''}>Lists</option><option value="segment"${TYPE === 'segment' ? ' selected' : ''}>Segments</option></select></div>
      <div id="gbulk"></div>
      <table><thead><tr><th style="width:34px"><input type="checkbox" class="cb" id="gall" aria-label="Select all"></th><th>Name</th><th>Type</th><th class="n">Members</th><th>Created ↓</th><th style="width:44px"></th></tr></thead><tbody id="gtb"></tbody></table>
      <div id="gcount" style="padding:14px 0;color:#3F3F46"></div></div></div>`;
  const reload = async () => { items = (await api('/api/mk/groups')).items; draw(); };
  const open = (x) => { if (x.kind === 'segment') location.hash = '#segments/' + x.id; else { window.PQ = { q: '', consent: '', tier: '', list: String(x.id), offset: 0 }; try { PQ = window.PQ; } catch (e) {} location.hash = '#profiles'; } };
  const visible = () => items.filter((x) => (!TYPE || x.kind === TYPE) && (!Q || x.name.toLowerCase().includes(Q.toLowerCase())));
  const del = async (list) => {
    list = list.filter((x) => !x.fixed); if (!list.length) return toast('That list holds every contact and can\'t be deleted.', 1);
    let used = [];
    if (list.length === 1) { try { used = (await api(`/api/mk/groups/${list[0].kind}/${list[0].id}/usage`)).used_by; } catch (e) {} }
    const what = list.length === 1 ? `the ${list[0].kind} "${list[0].name}"` : `${list.length} lists and segments`;
    if (!confirm(`Delete ${what}?${used.length ? `\n\nStill used by:\n• ${used.slice(0, 8).join('\n• ')}${used.length > 8 ? `\n…and ${used.length - 8} more` : ''}\n\nThose will no longer find anyone in it.` : ''}`)) return;
    try { const r = await api('/api/mk/groups/delete', { method: 'POST', body: JSON.stringify({ items: list.map((x) => ({ kind: x.kind, id: x.id })) }) });
      toast(r.errors && r.errors.length ? r.errors[0] : `Deleted ${r.deleted}`, r.errors && r.errors.length ? 1 : 0); list.forEach((x) => CHECKED.delete(key(x))); reload(); } catch (e) { toast(e.message, 1); }
  };
  const rowMenu = (x, anchor) => KL.menu(anchor, [
    ...(x.kind === 'segment' ? [['Update definition', 'filter', () => open(x)]] : [['View members', 'users', () => open(x)]]),
    [`Edit ${x.kind === 'segment' ? 'segment' : 'list'} name`, 'pencil', async () => { const n = prompt('Name', x.name); if (!n || n === x.name) return; try { await api(`/api/mk/groups/${x.kind}/${x.id}/rename`, { method: 'POST', body: JSON.stringify({ name: n }) }); toast('Renamed'); reload(); } catch (e) { toast(e.message, 1); } }],
    ['Clone', 'copy', async () => { try { const c = await api(`/api/mk/groups/${x.kind}/${x.id}/clone`, { method: 'POST', body: '{}' }); toast('Copied'); if (c.kind === 'segment') location.hash = '#segments/' + c.id; else reload(); } catch (e) { toast(e.message, 1); } }],
    [x.starred ? 'Remove star' : 'Star', 'star', async () => { await api(`/api/mk/groups/${x.kind}/${x.id}/star`, { method: 'POST', body: '{}' }).catch(() => {}); reload(); }],
    [`Delete ${x.kind === 'segment' ? 'segment' : 'list'}`, 'trash', () => del([x]), { danger: true, disabled: !!x.fixed }],
  ], { alignRight: true });
  const draw = () => {
    const rows = visible();
    $('gtb').innerHTML = rows.map((x) => `<tr class="row"><td><input type="checkbox" class="cb" data-ck="${key(x)}"${CHECKED.has(key(x)) ? ' checked' : ''}${x.fixed ? ' disabled title="Holds every contact"' : ''} aria-label="Select ${esc(x.name)}"></td>
      <td><div class="nm2" style="display:flex;align-items:center;gap:12px"><button class="star${x.starred ? ' on' : ''}" data-st="${key(x)}" aria-label="${x.starred ? 'Remove star' : 'Star'}">${ICON(x.starred ? 'star-filled' : 'star')}</button><a class="nm" href="javascript:void 0" data-op="${key(x)}">${esc(x.name)}</a>${x.fixed ? '<span class="fx">every contact</span>' : ''}${x.starter ? '<span class="fx">built in</span>' : ''}${x.store === 'lbo' ? '<span class="fx">Outlet</span>' : ''}</div></td>
      <td>${x.kind === 'segment' ? 'Segment' : 'List'}</td><td class="n">${x.members == null ? '…' : fmtN(x.members)}</td><td>${x.created_at ? fmtDT(x.created_at) : '—'}</td>
      <td><button class="dots" data-gm="${key(x)}" aria-label="Options for ${esc(x.name)}">${ICON('dots-vertical')}</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nothing matches.</td></tr>';
    $('gcount').textContent = rows.length ? `1 - ${rows.length} of ${rows.length}` : '';
    const find = (k) => items.find((x) => key(x) === k);
    $('gtb').querySelectorAll('[data-op]').forEach((a) => a.onclick = (e) => { e.preventDefault(); open(find(a.dataset.op)); });
    $('gtb').querySelectorAll('[data-gm]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); rowMenu(find(b.dataset.gm), b); });
    $('gtb').querySelectorAll('[data-st]').forEach((b) => b.onclick = async () => { const x = find(b.dataset.st); await api(`/api/mk/groups/${x.kind}/${x.id}/star`, { method: 'POST', body: '{}' }).catch(() => {}); reload(); });
    $('gtb').querySelectorAll('[data-ck]').forEach((c) => c.onchange = () => { if (c.checked) CHECKED.add(c.dataset.ck); else CHECKED.delete(c.dataset.ck); bulk(); });
    const sel = rows.filter((x) => !x.fixed); $('gall').checked = sel.length > 0 && sel.every((x) => CHECKED.has(key(x)));
    bulk();
  };
  const bulk = () => {
    const picked = items.filter((x) => CHECKED.has(key(x)));
    $('gbulk').innerHTML = picked.length ? `<div class="bulk"><b>${picked.length} selected</b><span style="flex:1"></span><button class="btn xs" id="gclr">Clear</button><button class="btn xs danger" id="gdel">${ICON('trash')} Delete</button></div>` : '';
    if (picked.length) { $('gclr').onclick = () => { CHECKED.clear(); draw(); }; $('gdel').onclick = () => del(picked); }
  };
  $('gall').onchange = () => { visible().filter((x) => !x.fixed).forEach((x) => ($('gall').checked ? CHECKED.add(key(x)) : CHECKED.delete(key(x)))); draw(); };
  $('gq').oninput = () => { Q = $('gq').value; draw(); };
  $('gt').onchange = () => { TYPE = $('gt').value; draw(); };
  const st = () => STORE || 'lb';
  $('gcr').onclick = () => KL.menu($('gcr'), [
    ['List from a CSV file', 'upload', () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv';
      inp.onchange = async () => { const f = inp.files[0]; if (!f) return; const name = prompt('Name for the new list', f.name.replace(/\.csv$/i, '')); if (!name) return;
        toast('Uploading ' + f.name + '… this can take a minute');
        try { const r = await fetch('/api/mk/lists/upload?' + qs({ store: st(), name }), { method: 'POST', headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'text/csv' }, body: f });
          const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || 'Upload failed');
          alert(`"${j.name}" is ready: ${fmtN(j.n)} people.\n\n${fmtN(j.matched)} matched existing profiles · ${fmtN(j.created)} new · ${fmtN(j.skipped)} rows had no email or phone.\n\nCan get email: ${fmtN(j.email_ok)} · Can get texts: ${fmtN(j.sms_ok)}\n(Consent is what's on file; the file's columns aren't used for it.)`);
          reload(); } catch (e) { toast(e.message, 1); } };
      inp.click(); }],
    ['List', 'list-details', async () => { const name = prompt('List name'); if (!name) return; try { await api('/api/mk/lists', { method: 'POST', body: JSON.stringify({ store: st(), name }) }); toast('List added'); reload(); } catch (e) { toast(e.message, 1); } }],
    ['Segment', 'filter', async () => { try { const s = await api('/api/mk/segments', { method: 'POST', body: JSON.stringify({ store: st(), name: 'New segment' }) }); location.hash = '#segments/' + s.id; } catch (e) { toast(e.message, 1); } }],
    ['Segment from a description', 'sparkles', () => aiBox()],
  ], { alignRight: true });
  const aiBox = () => {
    $('gai').innerHTML = `<div class="card" style="margin-bottom:16px"><b>Describe who you want</b><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><input id="sgw" type="text" placeholder="e.g. moms who bought newborn sizes in the last 4 months and haven't ordered since" style="flex:1;min-width:280px"><button class="btn pri" id="sgai">${ICON('sparkles')} Build it</button><button class="btn" id="sgx">Cancel</button></div><div id="sgaio"></div></div>`;
    $('sgw').focus(); $('sgx').onclick = () => { $('gai').innerHTML = ''; };
    $('sgai').onclick = async () => {
      const words = $('sgw').value.trim(); if (!words) return; $('sgaio').innerHTML = '<div class="empty">Emily is building it…</div>';
      try { const x = await api('/api/mk/segments/from-words', { method: 'POST', body: JSON.stringify({ store: st(), words }) });
        $('sgaio').innerHTML = `<div style="margin-top:10px"><b>${esc(x.name)}</b><div style="color:var(--muted);margin-top:2px">${esc(x.explanation || '')}</div><div style="margin-top:6px"><b>${fmtN(x.n)}</b> people · ${fmtN(x.email_ok)} can get email · ${fmtN(x.sms_ok)} can get texts</div><button class="btn pri xs" id="sgok" style="margin-top:8px">Create this segment</button></div>`;
        $('sgok').onclick = async () => { try { const s = await api('/api/mk/segments', { method: 'POST', body: JSON.stringify({ store: st(), name: x.name, description: x.explanation, definition: x.definition }) }); location.hash = '#segments/' + s.id; } catch (e) { toast(e.message, 1); } };
      } catch (e) { $('sgaio').innerHTML = `<div class="note" style="margin-top:10px">${esc(e.message)}</div>`; }
    };
  };
  draw();
}
})();
