/* Buzzin · Local pickup orders.
   Lists every open Shopify order whose delivery method is local pickup and that hasn't been picked up (fulfilled) yet,
   with how long it has waited, and lets staff email the customer that it's ready — or a reminder when they're slow to
   come by. Each email opens a ticket in the brand's mailbox so the reply lands in the inbox.
   Shopify is the source of truth for what's waiting; Buzzin only keeps what it did (emails sent, notes, hidden). */
const core = require("./core");
const { db } = core;
const R = () => require("./returns");

const STORES = ["lb", "lbo"];
let CACHE = { at: 0, items: [], errors: [] };

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS hd_pickup (
    order_id TEXT PRIMARY KEY, store TEXT, order_name TEXT,
    emails INT NOT NULL DEFAULT 0, last_emailed_at TIMESTAMPTZ, last_emailed_by TEXT, last_kind TEXT, ticket_id BIGINT,
    hidden BOOLEAN NOT NULL DEFAULT false, note TEXT, updated_by TEXT, updated_at TIMESTAMPTZ DEFAULT now())`);
}

const Q = `query Pickups($q: String!, $after: String) { orders(first: 100, after: $after, query: $q, sortKey: CREATED_AT) {
  pageInfo { hasNextPage endCursor }
  nodes { id legacyResourceId name createdAt cancelledAt email phone displayFulfillmentStatus displayFinancialStatus
    totalPriceSet { shopMoney { amount currencyCode } }
    customer { firstName lastName displayName phone defaultEmailAddress { emailAddress } }
    shippingLine { title }
    lineItems(first: 30) { nodes { name quantity } }
    fulfillmentOrders(first: 10) { nodes { status deliveryMethod { methodType } assignedLocation { name address1 address2 city province zip } } } } } }`;

function shape(store, o) {
  const fos = ((o.fulfillmentOrders || {}).nodes || []).filter((f) => f.deliveryMethod && f.deliveryMethod.methodType === "PICK_UP");
  const waiting = fos.filter((f) => !["CLOSED", "CANCELLED"].includes(f.status));
  const loc = (waiting[0] || fos[0] || {}).assignedLocation || null;
  const c = o.customer || {};
  return {
    id: o.id, legacy_id: o.legacyResourceId, store, store_name: R().STORE_DEFS[store].name, order_name: o.name, created_at: o.createdAt,
    days: Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 86400000),
    first_name: c.firstName || "", customer_name: c.displayName || [c.firstName, c.lastName].filter(Boolean).join(" "),
    email: o.email || (c.defaultEmailAddress && c.defaultEmailAddress.emailAddress) || "", phone: o.phone || c.phone || "",
    status: o.displayFulfillmentStatus, paid: o.displayFinancialStatus,
    total: o.totalPriceSet ? `${Number(o.totalPriceSet.shopMoney.amount).toFixed(2)} ${o.totalPriceSet.shopMoney.currencyCode}` : "",
    items: ((o.lineItems || {}).nodes || []).map((l) => ({ name: l.name, qty: l.quantity })),
    pickup_title: (o.shippingLine && o.shippingLine.title) || "",
    location: loc ? { name: loc.name, address: [loc.address1, loc.address2, [loc.city, [loc.province, loc.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")].filter(Boolean).join(", ") } : null,
    waiting: !o.cancelledAt && (fos.length ? waiting.length > 0 : !/^(FULFILLED|RESTOCKED)$/.test(o.displayFulfillmentStatus || "")),
    admin_url: `https://admin.shopify.com/store/${R().shopFor(store).domain.replace(/\.myshopify\.com$/, "")}/orders/${o.legacyResourceId}`,
  };
}

/** Pull open pickup orders from both stores (cached 3 minutes; force to refresh). */
async function fetchAll(force) {
  if (!force && Date.now() - CACHE.at < 3 * 60 * 1000) return CACHE;
  const items = [], errors = [];
  const since = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  for (const s of STORES) {
    let st; try { st = R().shopFor(s); } catch (e) { continue; }   // store not set up
    try {
      let after = null;
      for (let page = 0; page < 5; page++) {
        const d = await R().gql(st, Q, { q: `delivery_method:pick-up status:open created_at:>=${since}`, after });
        for (const o of d.orders.nodes) { const x = shape(s, o); if (x.waiting) items.push(x); }
        if (!d.orders.pageInfo.hasNextPage) break; after = d.orders.pageInfo.endCursor;
      }
    } catch (e) { errors.push(e.message); }
  }
  CACHE = { at: Date.now(), items, errors };
  return CACHE;
}

async function list({ force, show } = {}) {
  const c = await fetchAll(force);
  const ids = c.items.map((x) => x.id);
  const local = ids.length ? (await db(`SELECT * FROM hd_pickup WHERE order_id = ANY($1)`, [ids])).rows : [];
  const by = Object.fromEntries(local.map((r) => [r.order_id, r]));
  let items = c.items.map((x) => { const l = by[x.id] || {}; return { ...x, emails: l.emails || 0, last_emailed_at: l.last_emailed_at || null, last_emailed_by: l.last_emailed_by || null, last_kind: l.last_kind || null, ticket_id: l.ticket_id || null, hidden: !!l.hidden, note: l.note || "" }; });
  const counts = { waiting: items.filter((x) => !x.hidden).length, not_emailed: items.filter((x) => !x.hidden && !x.emails).length, overdue: items.filter((x) => !x.hidden && x.days >= 7).length, hidden: items.filter((x) => x.hidden).length };
  if (show === "hidden") items = items.filter((x) => x.hidden); else if (show !== "all") items = items.filter((x) => !x.hidden);
  if (show === "not_emailed") items = items.filter((x) => !x.emails);
  if (show === "overdue") items = items.filter((x) => x.days >= 7);
  items.sort((a, b) => b.days - a.days);
  return { items, counts, checked_at: new Date(c.at).toISOString(), errors: c.errors, templates: await templates() };
}
/** Badge count for the side menu — from the last check only (never makes the counts call wait on Shopify). */
async function count() {
  if (!CACHE.at || Date.now() - CACHE.at > 15 * 60 * 1000) fetchAll(true).catch(() => {});
  if (!CACHE.at) return null;
  const ids = CACHE.items.map((x) => x.id); if (!ids.length) return 0;
  const hid = (await db(`SELECT count(*)::int n FROM hd_pickup WHERE hidden AND order_id = ANY($1)`, [ids])).rows[0].n;
  return ids.length - hid;
}

/* ---- email wording (editable; saved for everyone) ---- */
const DEFAULT_T = {
  ready: {
    subject: "Your {{store}} order {{order}} is ready for pickup",
    body: `Hi {{first_name}},

Good news — your order {{order}} is ready for pickup!

Pickup location:
{{location}}

What's waiting for you:
{{items}}

Just give us your name or order number when you arrive.

Warmly,
The {{store}} Team`,
  },
  reminder: {
    subject: "Reminder: your {{store}} order {{order}} is waiting for you",
    body: `Hi {{first_name}},

Just a friendly reminder that your order {{order}} has been ready for pickup since {{order_date}}, and we're holding it for you.

Pickup location:
{{location}}

What's waiting for you:
{{items}}

If it's hard to make it in, just reply to this email and we can figure out another option together.

Warmly,
The {{store}} Team`,
  },
};
async function templates() {
  const s = await core.syncGet("pickup_templates").catch(() => null);
  const t = (s && s.state) || {};
  return { ready: { ...DEFAULT_T.ready, ...(t.ready || {}) }, reminder: { ...DEFAULT_T.reminder, ...(t.reminder || {}) } };
}
async function saveTemplate(kind, { subject, body }, who) {
  if (!DEFAULT_T[kind]) throw new Error("unknown email type");
  const t = await templates(); t[kind] = { subject: String(subject || DEFAULT_T[kind].subject).slice(0, 200), body: String(body || DEFAULT_T[kind].body).slice(0, 6000) };
  await core.syncSet("pickup_templates", who || "", t); return t;
}

/** Send the email from the brand's mailbox; opens a ticket so the customer's reply comes back to Buzzin. */
async function email({ id, kind, subject, body, saveDefault }, who) {
  const c = await fetchAll(false); let x = c.items.find((i) => i.id === id);
  if (!x) { const f = await fetchAll(true); x = f.items.find((i) => i.id === id); }
  if (!x) throw new Error("That order isn't waiting for pickup anymore.");
  if (!x.email) throw new Error("This order has no email address.");
  kind = kind === "reminder" ? "reminder" : "ready";
  if (!String(body || "").trim()) throw new Error("Write the email first.");
  if (saveDefault) await saveTemplate(kind, { subject: generic(subject, x), body: generic(body, x) }, who);
  const mailbox = core.mailboxForName(x.store_name) || process.env.GORGIAS_FROM_ADDRESS;
  if (!mailbox) throw new Error(`No mailbox is set up for ${x.store_name}.`);
  const r = await core.sendNewEmail({ mailbox, to: x.email, subject: String(subject || "").trim() || fill(DEFAULT_T[kind].subject, x), text: String(body).trim(), who, tags: ["local-pickup"], name: x.customer_name });
  await db(`INSERT INTO hd_pickup (order_id, store, order_name, emails, last_emailed_at, last_emailed_by, last_kind, ticket_id, updated_by, updated_at)
    VALUES ($1,$2,$3,1,now(),$4,$5,$6,$4,now())
    ON CONFLICT (order_id) DO UPDATE SET emails=hd_pickup.emails+1, last_emailed_at=now(), last_emailed_by=$4, last_kind=$5, ticket_id=$6, updated_by=$4, updated_at=now()`,
    [x.id, x.store, x.order_name, who, kind, r.ticket_id]);
  return { ok: true, ticket_id: r.ticket_id };
}
async function setHidden(id, hidden, note, who) {
  const c = await fetchAll(false); const x = c.items.find((i) => i.id === id) || {};
  await db(`INSERT INTO hd_pickup (order_id, store, order_name, hidden, note, updated_by, updated_at) VALUES ($1,$2,$3,$4,$5,$6,now())
    ON CONFLICT (order_id) DO UPDATE SET hidden=$4, note=COALESCE($5, hd_pickup.note), updated_by=$6, updated_at=now()`, [id, x.store || null, x.order_name || null, !!hidden, note == null ? null : String(note).slice(0, 500), who]);
  return { ok: true };
}

/* fill {{tags}} for one order — and the reverse, so a saved default stays generic */
function vars(x) {
  return { store: x.store_name, order: x.order_name, first_name: x.first_name || "there", order_date: new Date(x.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Chicago" }),
    location: x.location ? `${x.location.name}\n${x.location.address}` : (x.pickup_title || "Our pickup location"), items: x.items.map((i) => `• ${i.name}${i.qty > 1 ? ` × ${i.qty}` : ""}`).join("\n"), days: String(x.days) };
}
const fill = (t, x) => { const v = vars(x); return String(t || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in v ? v[k] : m)); };
function generic(text, x) { let s = String(text || ""); const v = vars(x); for (const k of ["items", "location", "order", "store", "order_date"]) if (v[k] && v[k].length > 2) s = s.split(v[k]).join(`{{${k}}}`); if (x.first_name) s = s.replace(new RegExp(`\\b${x.first_name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`), "{{first_name}}"); return s; }

function routes(app, { guard, actorOf }) {
  const bad = (res, e) => res.status(400).json({ error: e.message });
  app.get("/api/pickup", async (req, res) => { if (!guard(req, res)) return; try { res.json(await list({ force: req.query.refresh === "1", show: String(req.query.show || "") })); } catch (e) { bad(res, e); } });
  app.post("/api/pickup/draft", async (req, res) => {   // the filled-in email for one order (ready or reminder), for the editor
    if (!guard(req, res)) return;
    try { const { id, kind } = req.body || {}; const c = await fetchAll(false); const x = c.items.find((i) => i.id === id); if (!x) throw new Error("That order isn't waiting for pickup anymore.");
      const t = (await templates())[kind === "reminder" ? "reminder" : "ready"]; res.json({ to: x.email, subject: fill(t.subject, x), body: fill(t.body, x) }); } catch (e) { bad(res, e); }
  });
  app.post("/api/pickup/email", async (req, res) => {
    if (!guard(req, res)) return;
    try { const r = await email(req.body || {}, actorOf(req)); await core.audit({ ticketId: r.ticket_id, kind: "pickup-email", detail: `emailed customer that their pickup order is ${(req.body || {}).kind === "reminder" ? "still waiting" : "ready"}`, who: actorOf(req), target: (req.body || {}).id }).catch(() => {}); CACHE.at = CACHE.at || Date.now(); res.json(r); } catch (e) { bad(res, e); }
  });
  app.post("/api/pickup/hide", async (req, res) => { if (!guard(req, res)) return; try { const b = req.body || {}; res.json(await setHidden(String(b.id), b.hidden !== false, b.note, actorOf(req))); } catch (e) { bad(res, e); } });
}

module.exports = { migrate, list, count, routes, templates, __test: { shape, fill, generic, vars } };
