/* Buzzin Marketing · Lists & segments page actions, like Klaviyo's ⋮ menu: rename, clone, star, delete (one or many).
   Deleting hides the list or segment (archived) instead of erasing it, so nothing is lost by mistake.
   The all-contacts list ("Shopify Merged Newsletter") can't be deleted; Buzzin keeps it filled. */
const { db } = require("./core");

async function migrate() {
  await db(`ALTER TABLE mk_lists ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false`);
  await db(`ALTER TABLE mk_lists ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT false`);
  await db(`ALTER TABLE mk_lists ADD COLUMN IF NOT EXISTS deleted_by TEXT`);
  await db(`ALTER TABLE mk_segments ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT false`).catch(() => {});
}

/** Everything in one table: lists and segments, newest first (starred on top). */
async function all() {
  const lists = (await db(`SELECT l.id, l.store, l.name, l.source, l.ext_id, l.starred, l.created_at,
      (SELECT count(*)::int FROM mk_list_members m WHERE m.list_id=l.id) members
    FROM mk_lists l WHERE NOT l.archived`)).rows.map((l) => ({ ...l, kind: "list", fixed: l.ext_id === "all_contacts" }));
  const segs = (await db(`SELECT id, store, name, source, starter, starred, created_at, member_count members, refreshed_at FROM mk_segments WHERE NOT archived`).catch(() => ({ rows: [] }))).rows.map((s) => ({ ...s, kind: "segment" }));
  return [...lists, ...segs].sort((a, b) => (b.starred - a.starred) || (new Date(b.created_at || 0) - new Date(a.created_at || 0)));
}

/** Where a list or segment is still used (forms, flows, campaigns, segments), so the delete prompt can say so. */
async function usage(kind, id, { liveOnly = false } = {}) {
  id = Number(id); const out = [];
  const hit = (o, k0) => { let f = false; const walk = (x, key) => { if (f || x == null) return; if (Array.isArray(x)) return x.forEach((y) => walk(y, key));
      if (typeof x === "object") return Object.entries(x).forEach(([k, v]) => walk(v, k));
      if (key && new RegExp(kind === "list" ? "list" : "segment", "i").test(key) && Number(x) === id) f = true; };
    walk(o, k0); return f; };
  const forms = (await db(`SELECT id, name, list_id, steps, targeting FROM mk_forms WHERE ab_of IS NULL ${liveOnly ? "AND status='live'" : ""}`).catch(() => ({ rows: [] }))).rows;
  for (const f of forms) if ((kind === "list" && Number(f.list_id) === id) || hit(f.steps) || hit(f.targeting)) out.push(`Sign-up form "${f.name}"`);
  const flows = (await db(`SELECT id, name, trigger, graph, entry_filter, exit_filter FROM mk_flows WHERE NOT archived ${liveOnly ? "AND status='live'" : ""}`).catch(() => ({ rows: [] }))).rows;
  for (const f of flows) if (hit(f.trigger) || hit(f.graph) || hit(f.entry_filter) || hit(f.exit_filter)) out.push(`Flow "${f.name}"`);
  const camps = (await db(`SELECT id, name, audience FROM mk_campaigns WHERE status NOT IN ('sent','cancelled')`).catch(() => ({ rows: [] }))).rows;
  for (const c of camps) if (hit(c.audience, kind === "list" ? "lists" : "segments")) out.push(`Campaign "${c.name}"`);
  const segs = (await db(`SELECT id, name, definition FROM mk_segments WHERE NOT archived`).catch(() => ({ rows: [] }))).rows;
  for (const s of segs) if (!(kind === "segment" && Number(s.id) === id) && hit(s.definition)) out.push(`Segment "${s.name}"`);
  return out;
}

async function remove(kind, id, who) {
  if (kind === "list") {
    const l = (await db(`SELECT ext_id, name FROM mk_lists WHERE id=$1`, [Number(id)])).rows[0];
    if (!l) return;
    if (l.ext_id === "all_contacts") throw Object.assign(new Error(`"${l.name}" holds every contact and can't be deleted.`), { status: 400 });
    // A list a live sign-up form adds people to, or a live flow starts from, can't disappear — new sign-ups would land in a list nobody can see.
    const live = (await usage("list", id, { liveOnly: true })).filter((x) => /^(Sign-up form|Flow) /.test(x));
    if (live.length) throw Object.assign(new Error(`"${l.name}" is in use by ${live.join(", ")} — change those first, then delete it.`), { status: 400 });
    await db(`UPDATE mk_lists SET archived=true, deleted_by=$2 WHERE id=$1`, [Number(id), who || null]);
  } else await db(`UPDATE mk_segments SET archived=true, updated_by=$2, updated_at=now() WHERE id=$1`, [Number(id), who || null]);
}

function routes(app, { guard, admin, actorOf, fail }) {
  const K = (k) => (k === "segment" ? "segment" : k === "list" ? "list" : null);
  app.get("/api/mk/groups", async (req, res) => { if (!guard(req, res)) return; try { res.json({ items: await all() }); } catch (e) { fail(res, e); } });
  // Members of a list or segment, newest first (Klaviyo's Members tab).
  app.get("/api/mk/groups/:kind/:id/members", async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const kind = K(req.params.kind), id = Number(req.params.id); if (!kind) return res.status(400).json({ error: "kind" });
      const T = kind === "list" ? { g: "mk_lists", m: "mk_list_members", k: "list_id" } : { g: "mk_segments", m: "mk_segment_members", k: "segment_id" };
      const g = (await db(`SELECT * FROM ${T.g} WHERE id=$1`, [id])).rows[0]; if (!g) return res.status(404).json({ error: "not found" });
      const lim = Math.min(100, Math.max(1, Number(req.query.limit) || 50)), off = Math.max(0, Number(req.query.offset) || 0), q = String(req.query.q || "").trim().toLowerCase();
      const args = [id]; let where = `m.${T.k}=$1`;
      if (q) { args.push(`%${q.replace(/[\\%_]/g, (c) => "\\" + c)}%`); where += ` AND (p.email ILIKE $2 OR p.phone ILIKE $2 OR (COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) ILIKE $2)`; }
      const total = (await db(`SELECT count(*)::int n FROM ${T.m} m JOIN mk_profiles p ON p.id=m.profile_id WHERE ${where}`, args)).rows[0].n;
      const rows = (await db(`SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.city, p.region, p.country, p.email_consent, p.sms_consent, m.added_at
        FROM ${T.m} m JOIN mk_profiles p ON p.id=m.profile_id WHERE ${where} ORDER BY m.added_at DESC, p.id DESC LIMIT ${lim} OFFSET ${off}`, args)).rows;
      res.json({ kind, id, name: g.name, description: g.description || null, total, rows, offset: off, limit: lim });
    } catch (e) { fail(res, e); }
  });
  app.get("/api/mk/groups/:kind/:id/usage", async (req, res) => { if (!guard(req, res)) return; try { res.json({ used_by: await usage(K(req.params.kind), req.params.id) }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/groups/delete", async (req, res) => {   // body: { items: [{kind, id}] }
    if (!admin(req, res)) return;
    try { const items = ((req.body || {}).items || []).slice(0, 200); const errs = [];
      for (const it of items) { const k = K(it.kind); if (!k) continue; try { await remove(k, it.id, actorOf(req)); } catch (e) { errs.push(e.message); } }
      res.json({ ok: true, deleted: items.length - errs.length, errors: errs });
    } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/groups/:kind/:id/star", async (req, res) => {
    if (!guard(req, res)) return;
    try { const t = K(req.params.kind) === "list" ? "mk_lists" : "mk_segments"; await db(`UPDATE ${t} SET starred=NOT starred WHERE id=$1`, [Number(req.params.id)]); res.json({ ok: true }); } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/groups/:kind/:id/rename", async (req, res) => {
    if (!admin(req, res)) return;
    try { const name = String((req.body || {}).name || "").trim().slice(0, 120); if (!name) throw new Error("Give it a name");
      const t = K(req.params.kind) === "list" ? "mk_lists" : "mk_segments"; await db(`UPDATE ${t} SET name=$2 WHERE id=$1`, [Number(req.params.id), name]); res.json({ ok: true }); } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/groups/:kind/:id/clone", async (req, res) => {
    if (!admin(req, res)) return;
    try { const id = Number(req.params.id);
      if (K(req.params.kind) === "list") {
        const l = (await db(`SELECT * FROM mk_lists WHERE id=$1`, [id])).rows[0]; if (!l) throw new Error("not found");
        const n = (await db(`INSERT INTO mk_lists (store, name, description, source) VALUES ($1,$2,$3,'buzzin') RETURNING id`, [l.store, `${l.name} (copy)`.slice(0, 120), l.description])).rows[0];
        await db(`INSERT INTO mk_list_members (list_id, profile_id, source) SELECT $1, profile_id, 'copy' FROM mk_list_members WHERE list_id=$2 ON CONFLICT DO NOTHING`, [n.id, id]);
        return res.json({ kind: "list", id: n.id });
      }
      const s = (await db(`SELECT * FROM mk_segments WHERE id=$1`, [id])).rows[0]; if (!s) throw new Error("not found");
      const n = (await db(`INSERT INTO mk_segments (store, name, description, definition, source, updated_by) VALUES ($1,$2,$3,$4,'buzzin',$5) RETURNING id`, [s.store, `${s.name} (copy)`.slice(0, 120), s.description, JSON.stringify(s.definition), actorOf(req)])).rows[0];
      try { require("./mk-segments").refresh(n.id).catch(() => {}); } catch (e) {}
      res.json({ kind: "segment", id: n.id });
    } catch (e) { fail(res, e); }
  });
}

module.exports = { migrate, all, usage, remove, routes };
