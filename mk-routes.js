/* Buzzin Marketing · HTTP routes. Staff routes need a Buzzin login; changes to settings need an admin. */
const path = require("path");
const fs = require("fs");

module.exports = function mount(app, { guard, isAdmin, actorOf, VERSION }) {
  const MK = require("./mk-core"); const { db } = require("./core");
  const PAGE = () => fs.readFileSync(path.join(__dirname, "public", "marketing.html"), "utf8").replace(/__VERSION__/g, VERSION);
  let page = null;
  app.get("/marketing", (_q, r) => { r.setHeader("Cache-Control", "no-store"); page = page || PAGE(); r.type("html").send(page); });

  const fail = (res, e) => res.status(e.status || 400).json({ error: e.message });
  const admin = (req, res) => { if (!guard(req, res)) return false; if (!isAdmin(req)) { res.status(403).json({ error: "Only admins can change marketing settings." }); return false; } return true; };
  const store = (q) => (q && ["lb", "lbo"].includes(q) ? q : null);
  const G = require("./mk-groups"); setTimeout(() => G.migrate().catch((e) => console.log("lists & segments migrate:", e.message)), 20000); G.routes(app, { guard, admin, actorOf, fail });

  /* contacts */
  app.get("/api/mk/overview", async (req, res) => { if (!guard(req, res)) return; try { res.json(await MK.overview(store(req.query.store))); } catch (e) { fail(res, e); } });
  app.get("/api/mk/profiles", async (req, res) => { if (!guard(req, res)) return; try { res.json(await MK.search({ ...req.query, store: store(req.query.store) })); } catch (e) { fail(res, e); } });
  app.get("/api/mk/profiles-stats", async (req, res) => { if (!guard(req, res)) return; try { res.json(await MK.profileStats()); } catch (e) { fail(res, e); } });
  // Edit a profile (name, email, phone) — an email typo at sign-up, say. Email/phone must not belong to another profile.
  app.put("/api/mk/profiles/:id", async (req, res) => {
    if (!admin(req, res)) return;
    try {
      const id = Number(req.params.id), b = req.body || {}, p = await MK.profile(id); if (!p) return res.status(404).json({ error: "not found" });
      const set = {}, who = actorOf(req);
      if (b.first_name !== undefined) set.first_name = String(b.first_name || "").trim().slice(0, 80) || null;
      if (b.last_name !== undefined) set.last_name = String(b.last_name || "").trim().slice(0, 80) || null;
      if (b.email !== undefined) {
        const e = b.email ? MK.normEmail(b.email) : null; if (b.email && !e) return res.status(400).json({ error: "That email doesn't look right." });
        if (e && e !== p.email) { const o = (await db(`SELECT id FROM mk_profiles WHERE lower(email)=$1 AND id<>$2`, [e, id])).rows[0]; if (o) return res.status(400).json({ error: `${e} already belongs to another profile (#${o.id}).` }); }
        set.email = e;
      }
      if (b.phone !== undefined) {
        const ph = b.phone ? MK.normPhone(b.phone) : null; if (b.phone && !ph) return res.status(400).json({ error: "That phone number doesn't look right." });
        if (ph && ph !== p.phone) { const o = (await db(`SELECT id FROM mk_profiles WHERE phone=$1 AND id<>$2`, [ph, id])).rows[0]; if (o) return res.status(400).json({ error: `${ph} already belongs to another profile (#${o.id}).` }); }
        set.phone = ph;
      }
      const keys = Object.keys(set); if (!keys.length) return res.json(p);
      await db(`UPDATE mk_profiles SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(", ")}, updated_at=now() WHERE id=$1`, [id, ...keys.map((k) => set[k])]);
      if (set.email !== undefined && set.email !== p.email) await db(`INSERT INTO mk_consent_log (profile_id, channel, state, previous, source, detail) VALUES ($1,'email',$2,$2,'staff',$3)`, [id, p.email_consent, `Email changed from ${p.email || "none"} to ${set.email || "none"} by ${who}`]).catch(() => {});
      res.json(await MK.profile(id));
    } catch (e) { fail(res, e); }
  });
  // Custom properties
  app.post("/api/mk/profiles/:id/props", async (req, res) => {
    if (!admin(req, res)) return;
    try { const b = req.body || {}, k = String(b.key || "").trim().slice(0, 60); if (!k) return res.status(400).json({ error: "Give the property a name" });
      if (b.remove) await db(`UPDATE mk_profiles SET props = props - $2, updated_at=now() WHERE id=$1`, [Number(req.params.id), k]);
      else await db(`UPDATE mk_profiles SET props = props || jsonb_build_object($2::text, $3::text), updated_at=now() WHERE id=$1`, [Number(req.params.id), k, String(b.value == null ? "" : b.value).slice(0, 500)]);
      res.json(await MK.profile(req.params.id)); } catch (e) { fail(res, e); }
  });
  // Add to / remove from a list (no flow is started by adding someone by hand)
  app.post("/api/mk/profiles/:id/lists", async (req, res) => {
    if (!admin(req, res)) return;
    try { const b = req.body || {}, lid = Number(b.list_id); if (!lid) return res.status(400).json({ error: "Pick a list" });
      if (b.remove) await db(`DELETE FROM mk_list_members WHERE list_id=$1 AND profile_id=$2`, [lid, Number(req.params.id)]);
      else await MK.addToList(lid, Number(req.params.id), `staff:${actorOf(req)}`);
      res.json(await MK.profile(req.params.id)); } catch (e) { fail(res, e); }
  });
  app.get("/api/mk/profiles/:id", async (req, res) => { if (!guard(req, res)) return; try { const p = await MK.profile(req.params.id); if (!p) return res.status(404).json({ error: "not found" }); res.json(p); } catch (e) { fail(res, e); } });
  app.post("/api/mk/profiles/:id/consent", async (req, res) => {
    if (!admin(req, res)) return;
    try {
      const p = await MK.profile(req.params.id); if (!p) return res.status(404).json({ error: "not found" });
      const { channel, state } = req.body || {};
      if (!["email", "sms"].includes(channel) || !["subscribed", "unsubscribed"].includes(state)) return res.status(400).json({ error: "channel email|sms, state subscribed|unsubscribed" });
      if (state === "subscribed") return res.status(400).json({ error: "Staff can unsubscribe someone, but only the customer can subscribe (through a form, checkout or a text)." });
      await MK.setConsent(p, channel, state, { source: "staff", detail: actorOf(req) });
      res.json(await MK.profile(req.params.id));
    } catch (e) { fail(res, e); }
  });
  app.get("/api/mk/lists", async (req, res) => { if (!guard(req, res)) return; try { res.json({ lists: await MK.lists(store(req.query.store)) }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/lists", async (req, res) => {
    if (!admin(req, res)) return;
    try { const b = req.body || {}; if (!store(b.store) || !String(b.name || "").trim()) return res.status(400).json({ error: "store and name are required" }); res.json({ list: await MK.ensureList(b.store, String(b.name).trim().slice(0, 120), { description: b.description || null }) }); } catch (e) { fail(res, e); }
  });
  /* A list from a CSV (e.g. a Shopify customer export): each row is matched to a profile by Shopify id, email or phone, or a new
     profile is made. Consent is never taken from the file: people keep whatever email/text consent is on file (new people have none). */
  app.post("/api/mk/lists/upload", require("express").text({ type: () => true, limit: "60mb" }), async (req, res) => {
    if (!admin(req, res)) return;
    try {
      const st = store(req.query.store), name = String(req.query.name || "").trim().slice(0, 120);
      if (!st || !name) return res.status(400).json({ error: "store and name are required" });
      console.log(`📋 list upload "${name}" started: ${String(req.body || "").length} bytes, ${typeof req.body}`);
      const rows = require("./mk-merge").parseCsv(String(req.body || "").replace(/^\uFEFF/, ""));
      const head = (rows.shift() || []).map((h) => h.trim().toLowerCase());
      const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
      const cId = col("customer id", "id"), cEm = col("email", "email address"), cPh = col("phone", "phone number", "sms phone"), cPh2 = col("default address phone"),
        cFn = col("first name", "first_name"), cLn = col("last name", "last_name");
      if (cEm < 0 && cPh < 0) return res.status(400).json({ error: "The file needs an Email or Phone column." });
      const v = (r, i) => (i >= 0 ? String(r[i] || "").trim().replace(/^'/, "") : "");
      // Uploading again under the same name adds to that list (e.g. after an upload that didn't finish).
      const list = (await db(`SELECT * FROM mk_lists WHERE store=$1 AND lower(name)=lower($2) AND NOT archived ORDER BY id DESC LIMIT 1`, [st, name])).rows[0]
        || await MK.ensureList(st, name, { description: `Uploaded from a file by ${actorOf(req)}` });
      let matched = 0, created = 0, skipped = 0; const ids = new Set();
      const ents = [];
      for (const r of rows) {
        if (!r.length || (r.length === 1 && !r[0])) continue;
        const email = (v(r, cEm) || "").toLowerCase() || null, phone = MK.normPhone(v(r, cPh) || v(r, cPh2)), sid = v(r, cId);
        if (!email && !phone) { skipped++; continue; }
        ents.push({ email, phone, gid: /^\d+$/.test(sid) ? `gid://shopify/Customer/${sid}` : null, first_name: v(r, cFn) || null, last_name: v(r, cLn) || null });
      }
      // Match everyone in one pass (Shopify id, then email, then phone) instead of one lookup per row.
      const bySid = new Map(), byEm = new Map(), byPh = new Map();
      for (let i = 0; i < ents.length; i += 5000) {
        const part = ents.slice(i, i + 5000);
        const found = (await db(`SELECT id, shopify_id, email, phone FROM mk_profiles WHERE shopify_id = ANY($1::text[]) OR email = ANY($2::text[]) OR phone = ANY($3::text[])`,
          [part.map((e) => e.gid).filter(Boolean), part.map((e) => e.email).filter(Boolean), part.map((e) => e.phone).filter(Boolean)])).rows;
        for (const p of found) { if (p.shopify_id) bySid.set(p.shopify_id, p.id); if (p.email && !byEm.has(p.email)) byEm.set(p.email, p.id); if (p.phone && !byPh.has(p.phone)) byPh.set(p.phone, p.id); }
      }
      for (const e of ents) {
        let id = (e.gid && bySid.get(e.gid)) || (e.email && byEm.get(e.email)) || (!e.email && e.phone && byPh.get(e.phone)) || null;
        if (id) { matched++; ids.add(Number(id)); continue; }
        const p = await MK.upsertProfile(st, { email: e.email, phone: e.phone, first_name: e.first_name, last_name: e.last_name, shopify_id: e.gid }, "csv");
        if (!p) { skipped++; continue; }
        created++; ids.add(Number(p.id)); if (e.email) byEm.set(e.email, p.id);
      }
      const arr = [...ids];
      await db(`INSERT INTO mk_list_members (list_id, profile_id, source) SELECT $1, x, 'upload' FROM unnest($2::bigint[]) x ON CONFLICT DO NOTHING`, [list.id, arr]);
      const c = (await db(`SELECT count(*)::int n, count(*) FILTER (WHERE p.email_consent='subscribed')::int email_ok, count(*) FILTER (WHERE p.sms_consent='subscribed')::int sms_ok FROM mk_list_members m JOIN mk_profiles p ON p.id=m.profile_id WHERE m.list_id=$1`, [list.id])).rows[0];
      if (MK.clearMemo) MK.clearMemo();
      console.log(`📋 list upload "${list.name}" (${list.id}): ${rows.length} rows · ${matched} matched · ${created} new · ${skipped} skipped → ${c.n} members · ${c.sms_ok} textable`);
      res.json({ list_id: list.id, name: list.name, rows: rows.length, matched, created, skipped, ...c });
    } catch (e) { console.error("list upload:", e.message); fail(res, e); }
  });
  app.post("/api/mk/sync", async (req, res) => { if (!admin(req, res)) return; MK.syncAll({ force: !!(req.body && req.body.force), who: actorOf(req) }).catch(() => {}); res.json({ ok: true, started: true }); });

  /* settings */
  app.get("/api/mk/settings", async (req, res) => { if (!guard(req, res)) return; try { res.json(await MK.settings()); } catch (e) { fail(res, e); } });
  app.put("/api/mk/settings", async (req, res) => {
    if (!admin(req, res)) return;
    try {
      const b = req.body || {};
      const patch = {};
      if (Array.isArray(b.test_list)) patch.test_list = b.test_list;
      if (Array.isArray(b.hidden_products)) patch.hidden_products = [...new Set(b.hidden_products.map((x) => String(x || "").trim().slice(0, 80)).filter(Boolean))].slice(0, 100);
      if (b.email_cost_per_1000 != null && b.email_cost_per_1000 !== "") patch.email_cost_per_1000 = Math.max(0, Math.min(10, Number(b.email_cost_per_1000) || 0));
      if (b.coupons) patch.coupons = { percent: Math.min(90, Math.max(1, Number(b.coupons.percent) || 10)), days: Math.min(365, Math.max(1, Number(b.coupons.days) || 7)), prefix: String(b.coupons.prefix || "WELCOME").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "WELCOME" };
      if (b.quiet_hours) patch.quiet_hours = { start: String(b.quiet_hours.start || "21:00"), end: String(b.quiet_hours.end || "08:00") };
      if (b.smart_sending_hours) patch.smart_sending_hours = { email: Math.max(0, Number(b.smart_sending_hours.email) || 0), sms: Math.max(0, Number(b.smart_sending_hours.sms) || 0) };
      if (b.attribution) patch.attribution = { email_click_days: Math.min(30, Math.max(1, Number(b.attribution.email_click_days) || 5)), sms_click_days: Math.min(30, Math.max(1, Number(b.attribution.sms_click_days) || 1)) };
      // Sending switches stay off until a sender is connected and approved; the server refuses to turn them on without one.
      if (b.sending) {
        const S = require("./mk-send");
        for (const k of ["lb", "lbo"]) for (const ch of ["email", "sms"]) {
          const want = !!(b.sending[k] && b.sending[k][ch]);
          if (want && !(await S.ready(k, ch))) return res.status(400).json({ error: `${k.toUpperCase()} ${ch} can't be turned on yet: no approved ${ch === "email" ? "email sender (Amazon SES)" : "texting number"} is connected.` });
        }
        patch.sending = b.sending;
      }
      res.json(await MK.saveSettings(patch, actorOf(req)));
    } catch (e) { fail(res, e); }
  });

  /* the other marketing modules mount their own routes */
  for (const m of ["./mk-email", "./mk-forms", "./mk-segments", "./mk-flows", "./mk-campaigns", "./mk-report", "./mk-sms", "./mk-analytics", "./mk-dns", "./mk-ses", "./mk-sms-aws", "./mk-merge", "./mk-forms-klaviyo"]) {
    try { const mod = require(m); if (mod.routes) mod.routes(app, { guard, admin, isAdmin, actorOf, fail, store }); } catch (e) { if (e.code !== "MODULE_NOT_FOUND" || !String(e.message).includes(m.slice(2))) console.error(`marketing ${m}:`, e.message); }
  }
};
