/* Buzzin Marketing · HTTP routes. Staff routes need a Buzzin login; changes to settings need an admin. */
const path = require("path");
const fs = require("fs");

module.exports = function mount(app, { guard, isAdmin, actorOf, VERSION }) {
  const MK = require("./mk-core");
  const PAGE = () => fs.readFileSync(path.join(__dirname, "public", "marketing.html"), "utf8").replace(/__VERSION__/g, VERSION);
  let page = null;
  app.get("/marketing", (_q, r) => { r.setHeader("Cache-Control", "no-store"); page = page || PAGE(); r.type("html").send(page); });

  const fail = (res, e) => res.status(e.status || 400).json({ error: e.message });
  const admin = (req, res) => { if (!guard(req, res)) return false; if (!isAdmin(req)) { res.status(403).json({ error: "Only admins can change marketing settings." }); return false; } return true; };
  const store = (q) => (q && ["lb", "lbo"].includes(q) ? q : null);

  /* contacts */
  app.get("/api/mk/overview", async (req, res) => { if (!guard(req, res)) return; try { res.json(await MK.overview(store(req.query.store))); } catch (e) { fail(res, e); } });
  app.get("/api/mk/profiles", async (req, res) => { if (!guard(req, res)) return; try { res.json(await MK.search({ ...req.query, store: store(req.query.store) })); } catch (e) { fail(res, e); } });
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
  app.post("/api/mk/sync", async (req, res) => { if (!admin(req, res)) return; MK.syncAll({ force: !!(req.body && req.body.force), who: actorOf(req) }).catch(() => {}); res.json({ ok: true, started: true }); });

  /* settings */
  app.get("/api/mk/settings", async (req, res) => { if (!guard(req, res)) return; try { res.json(await MK.settings()); } catch (e) { fail(res, e); } });
  app.put("/api/mk/settings", async (req, res) => {
    if (!admin(req, res)) return;
    try {
      const b = req.body || {};
      const patch = {};
      if (Array.isArray(b.test_list)) patch.test_list = b.test_list;
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
  for (const m of ["./mk-email", "./mk-forms", "./mk-segments", "./mk-flows", "./mk-campaigns", "./mk-sms", "./mk-analytics"]) {
    try { const mod = require(m); if (mod.routes) mod.routes(app, { guard, admin, isAdmin, actorOf, fail, store }); } catch (e) { if (e.code !== "MODULE_NOT_FOUND" || !String(e.message).includes(m.slice(2))) console.error(`marketing ${m}:`, e.message); }
  }
};
