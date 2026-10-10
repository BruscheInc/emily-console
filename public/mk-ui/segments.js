/* Buzzin Marketing · segments (loaded by /marketing) */
(() => {
(window.MK_EXTRA = window.MK_EXTRA || []).push((S) => {
  const at = S.findIndex((x) => x.id === 'lists');
  S.splice(at + 1, 0, { id: 'segments', icon: 'filter', label: 'Segments', render: renderSegments });
});

async function renderSegments(el, id) {
  if (id) return editSegment(el, id);
  const r = await api('/api/mk/segments?' + qs({ store: STORE }));
  el.innerHTML = `<h1>Segments</h1><p class="sub">Groups of people that update themselves — "bought twice but nothing in 90 days", "bought 3-6M two months ago". Use them for campaigns, flow rules and flow starts. Recounted every 20 minutes.</p>
  <div class="card"><b>Describe who you want</b><div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"><input id="sgw" type="text" placeholder="e.g. moms who bought newborn sizes in the last 4 months and haven't ordered since" style="flex:1;min-width:280px"${STORE ? '' : ' disabled'}><button class="btn" id="sgai"${STORE ? '' : ' disabled'}><i class="ti ti-sparkles"></i> Build it</button><button class="btn pri" id="sgnew"${STORE ? '' : ' disabled'}><i class="ti ti-plus"></i> Blank segment</button></div>${STORE ? '' : '<div style="color:var(--muted);margin-top:6px">Pick a store at the top to create one.</div>'}<div id="sgaio"></div></div>
  <div class="card" style="padding:6px;margin-top:14px"><div class="tw"><table><thead><tr><th>Segment</th><th>Store</th><th class="n">People</th><th class="n">Can email</th><th class="n">Can text</th><th>Counted</th></tr></thead><tbody>
  ${r.segments.map((s) => `<tr class="click" data-id="${s.id}"><td><b>${esc(s.name)}</b>${s.starter ? ' <span class="pill off">built in</span>' : ''}</td><td>${s.store === 'lbo' ? 'Outlet' : 'LB'}</td><td class="n">${s.member_count == null ? '…' : fmtN(s.member_count)}</td><td class="n">${s.email_ok == null ? '' : fmtN(s.email_ok)}</td><td class="n">${s.sms_ok == null ? '' : fmtN(s.sms_ok)}</td><td>${s.refreshed_at ? fmtDT(s.refreshed_at) : 'Not yet'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No segments yet.</td></tr>'}
  </tbody></table></div></div>`;
  el.querySelectorAll('tr.click').forEach((tr) => tr.onclick = () => { location.hash = '#segments/' + tr.dataset.id; });
  const make = async (body) => { const s = await api('/api/mk/segments', { method: 'POST', body: JSON.stringify({ store: STORE, ...body }) }); location.hash = '#segments/' + s.id; };
  $('sgnew').onclick = () => make({ name: 'New segment' }).catch((e) => toast(e.message, 1));
  $('sgai').onclick = async () => {
    const words = $('sgw').value.trim(); if (!words) return;
    $('sgaio').innerHTML = '<div class="empty">Emily is building it…</div>';
    try { const x = await api('/api/mk/segments/from-words', { method: 'POST', body: JSON.stringify({ store: STORE, words }) });
      $('sgaio').innerHTML = `<div class="card" style="margin-top:10px;background:var(--panel2)"><b>${esc(x.name)}</b><div style="color:var(--muted);margin-top:2px">${esc(x.explanation || '')}</div><div style="margin-top:6px">${esc(MK_conditions.summarize(x.definition, { events: r.events }))}</div><div style="margin-top:6px"><b>${fmtN(x.n)}</b> people · ${fmtN(x.email_ok)} can get email · ${fmtN(x.sms_ok)} can get texts</div><button class="btn pri xs" id="sgok" style="margin-top:8px">Create this segment</button></div>`;
      $('sgok').onclick = () => make({ name: x.name, description: x.explanation, definition: x.definition }).catch((e) => toast(e.message, 1));
    } catch (e) { $('sgaio').innerHTML = `<div class="note" style="margin-top:10px">${esc(e.message)}</div>`; }
  };
}

async function editSegment(el, id) {
  const [s, meta] = await Promise.all([api('/api/mk/segments/' + id), api('/api/mk/segments?' + qs({ store: '' })).catch(() => ({ events: {} }))]);
  const lists = (await api('/api/mk/lists?' + qs({ store: s.store }))).lists;
  const segs = (await api('/api/mk/segments?' + qs({ store: s.store }))).segments.filter((x) => String(x.id) !== String(s.id));
  const ctx = { events: meta.events, lists, segments: segs, since: false };
  let dirty = false, timer = null;
  el.innerHTML = `<div class="bar" style="align-items:center"><a href="#segments" class="btn xs" aria-label="Back"><i class="ti ti-arrow-left"></i></a><input id="sgn" type="text" value="${esc(s.name)}" style="font-weight:700;min-width:260px" aria-label="Segment name"><span class="pill off">${s.store === 'lbo' ? 'Outlet' : 'Larkspur Baby'}</span><span class="sp"></span><span class="pill hon hidden" id="sgd">Unsaved</span><button class="btn danger" id="sgdel"><i class="ti ti-trash"></i></button><button class="btn pri" id="sgsave">Save</button></div>
  <div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:14px;align-items:start">
    <div class="card"><label class="lab" for="sgdesc">Description (optional)</label><input id="sgdesc" type="text" value="${esc(s.description || '')}" style="width:100%"><div id="sgc" style="margin-top:12px"></div></div>
    <div class="card"><div id="sgcount"><div class="empty">Counting…</div></div></div></div>`;
  const mark = () => { dirty = true; $('sgd').classList.remove('hidden'); clearTimeout(timer); timer = setTimeout(preview, 500); };
  window.onbeforeunload = () => dirty ? 'Unsaved changes' : undefined;
  $('sgn').oninput = mark; $('sgdesc').oninput = () => { dirty = true; $('sgd').classList.remove('hidden'); };
  MK_conditions.editor($('sgc'), s.definition, ctx, mark);
  async function preview() {
    try { const r = await api('/api/mk/segments/preview', { method: 'POST', body: JSON.stringify({ store: s.store, definition: s.definition }) });
      $('sgcount').innerHTML = `<div style="font-size:30px;font-weight:800">${fmtN(r.n)}</div><div style="color:var(--muted)">people right now · ${fmtN(r.email_ok)} can get email · ${fmtN(r.sms_ok)} can get texts</div>
        <div style="margin-top:6px;font-size:13px">${esc(MK_conditions.summarize(s.definition, ctx))}</div>
        <table style="margin-top:12px"><thead><tr><th>Person</th><th>Tier</th><th class="n">Orders</th></tr></thead><tbody>${r.sample.map((p) => `<tr class="click" data-p="${p.id}"><td>${esc([p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || p.phone)}<div style="font-size:12px;color:var(--muted)">${esc(p.email || '')}</div></td><td>${pill(TIER, p.tier)}</td><td class="n">${fmtN(p.orders_count)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">Nobody matches.</td></tr>'}</tbody></table>`;
      $('sgcount').querySelectorAll('[data-p]').forEach((tr) => tr.onclick = () => { location.hash = '#profiles/' + tr.dataset.p; });
    } catch (e) { $('sgcount').innerHTML = `<div class="note">${esc(e.message)}</div>`; }
  }
  preview();
  $('sgsave').onclick = async () => { try { const r = await api('/api/mk/segments/' + s.id, { method: 'PUT', body: JSON.stringify({ name: $('sgn').value, description: $('sgdesc').value, definition: s.definition }) }); dirty = false; $('sgd').classList.add('hidden'); toast(`Saved · ${fmtN(r.n)} people`); } catch (e) { toast(e.message, 1); } };
  $('sgdel').onclick = async () => { if ($('sgdel').dataset.c !== '1') { $('sgdel').dataset.c = '1'; $('sgdel').textContent = 'Click again to delete'; return; } try { await api('/api/mk/segments/' + s.id, { method: 'DELETE' }); dirty = false; location.hash = '#segments'; } catch (e) { toast(e.message, 1); } };
}
})();
