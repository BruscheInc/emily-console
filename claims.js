/* =============================================================================================
 *  Portal options beyond a normal return — all reached from the same returns portal after the
 *  customer looks up their order:
 *
 *    • Edit order        address / name / size / add or remove items, within N minutes of purchase
 *                        and before it ships. Runs immediately (Shopify order edit). Extra cost →
 *                        Shopify emails a pay link; lower total → difference refunded.
 *    • Defective product photos + description → AI review (photos, history, timing) → staff approve
 *                        in Buzzin → replacement, store credit, or refund (refund only without PP).
 *                        The customer keeps the item.
 *    • Package Protection claim   order must have PP. Live tracking decides when a claim can open
 *                        (stalled N days, or delivered 24h+ ago and not found). AI review → staff
 *                        approve → replacement or store credit (never a refund on PP).
 *    • Package not delivered   with PP → the PP claim; without PP → carrier claim guidance, no credit.
 *
 *  Nothing that moves money happens without a person clicking Approve in Buzzin → Claims.
 * ============================================================================================= */
const crypto = require("crypto");
const core = require("./core");
const { db } = core;
const R = () => require("./returns");
const K = () => require("./emily").claimsKit();
const EX = () => require("./exceptions");

const round2 = (n) => Math.round(Number(n) * 100) / 100;
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
const fmtWhen = (d) => new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const usd = (n) => "$" + Number(n || 0).toFixed(2);

const TYPE_LABEL = { defective: "defective item claim", pp: "shipping claim", other: "message", not_delivered: "not-delivered report", edit: "order edit", cancel: "order cancellation" };
const SUBTYPE_LABEL = { not_arrived: "My package hasn't arrived", delivered_missing: "My package was marked delivered, but I didn't get it", damaged: "My package arrived damaged", something_else: "Something else" };
const RES_LABEL = { replacement: "Replacement (no charge)", store_credit: "Store credit", refund: "Refund to original payment" };
const CARRIER_CLAIMS = {
  USPS: [{ label: "Search for missing mail", url: "https://www.usps.com/help/missing-mail.htm" }, { label: "File a USPS claim", url: "https://www.usps.com/help/claims.htm" }],
  UPS: [{ label: "File a UPS claim", url: "https://www.ups.com/us/en/support/file-a-claim.page" }],
  FedEx: [{ label: "File a FedEx claim", url: "https://www.fedex.com/en-us/customer-support/claims.html" }],
};

/* ---------------- storage ---------------- */
async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS hd_claims (id TEXT PRIMARY KEY, number TEXT, store TEXT, type TEXT, status TEXT, order_name TEXT, email TEXT, ticket_id BIGINT,
            data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE INDEX IF NOT EXISTS hd_claims_status ON hd_claims (status, created_at DESC)`);
  await db(`CREATE INDEX IF NOT EXISTS hd_claims_order ON hd_claims (order_name)`);
  await db(`CREATE INDEX IF NOT EXISTS hd_claims_email ON hd_claims (lower(email))`);
  // one open claim per order and type, and claim numbers never repeat (guards double taps / double clicks)
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS hd_claims_one_open ON hd_claims (order_name, type) WHERE status IN ('pending','info_requested','processing') AND type IN ('defective','pp')`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS hd_claims_number ON hd_claims (number)`);
  await db(`CREATE TABLE IF NOT EXISTS hd_claim_photos (id TEXT PRIMARY KEY, order_id TEXT, claim_id TEXT, content_type TEXT, bytes INT, sha TEXT, data BYTEA, created_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE INDEX IF NOT EXISTS hd_claim_photos_claim ON hd_claim_photos (claim_id)`);
  await db(`CREATE INDEX IF NOT EXISTS hd_claim_photos_sha ON hd_claim_photos (sha)`);
}
const rowToClaim = (r) => ({ ...r.data, id: r.id, number: r.number, store: r.store, type: r.type, status: r.status, order_name: r.order_name, email: r.email, ticket_id: r.ticket_id, created_at: r.created_at, updated_at: r.updated_at });
async function getClaim(id) { const r = (await db(`SELECT * FROM hd_claims WHERE id=$1`, [id])).rows[0]; return r ? rowToClaim(r) : null; }
async function putClaim(c, event) {
  if (event) c.events = [...(c.events || []), { at: new Date().toISOString(), text: event }];
  const { id, number, store, type, status, order_name, email, ticket_id, created_at, updated_at, ...data } = c;
  await db(`INSERT INTO hd_claims (id, number, store, type, status, order_name, email, ticket_id, data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, ticket_id=EXCLUDED.ticket_id, data=EXCLUDED.data, updated_at=now()`,
    [id, number, store, type, status, order_name, email, ticket_id || null, JSON.stringify(data)]);
  return getClaim(id);
}
async function patchClaim(id, patch, event) { const c = await getClaim(id); if (!c) return null; Object.assign(c, patch); return putClaim(c, event); }

/* ---------------- the order, as the portal needs it ---------------- */
const ORDER_Q = `query($id:ID!){ order(id:$id){ id name createdAt cancelledAt displayFulfillmentStatus currencyCode email customer { id }
  shippingAddress{ firstName lastName name address1 address2 city provinceCode zip countryCodeV2 phone }
  lineItems(first:50){ nodes{ id title variantTitle sku quantity currentQuantity unfulfilledQuantity image{ url(transform:{maxWidth:200}) }
    discountedUnitPriceAfterAllDiscountsSet{ shopMoney{ amount } } originalUnitPriceSet{ shopMoney{ amount } }
    variant{ id availableForSale inventoryQuantity inventoryItem{ tracked } product{ id title variants(first:60){ nodes{ id title sku price availableForSale } } } } } }
  fulfillmentOrders(first:10){ nodes{ status deliveryMethod{ methodType } } }
  fulfillments(first:10){ createdAt deliveredAt displayStatus status events(first:3, sortKey: HAPPENED_AT, reverse:true){ nodes{ status happenedAt message city province } } trackingInfo{ number url company } fulfillmentLineItems(first:50){ nodes{ quantity lineItem{ id } } } } } }`;

async function loadOrder(key, orderId) {
  const st = R().shopFor(key), s = await R().settings();
  const o = (await R().gql(st, ORDER_Q, { id: orderId })).order;
  if (!o) throw httpError(404, "We couldn't find that order.");
  const all = o.lineItems.nodes.map((n) => ({
    id: n.id, title: n.title, variant: n.variantTitle, sku: n.sku, quantity: n.quantity, current: n.currentQuantity, unfulfilled: n.unfulfilledQuantity,
    fulfilled: Math.max(0, n.currentQuantity - n.unfulfilledQuantity), image: (n.image && n.image.url) || null,
    unit_price: Number(n.discountedUnitPriceAfterAllDiscountsSet.shopMoney.amount), stock: n.variant ? (n.variant.inventoryItem && n.variant.inventoryItem.tracked === false ? null : Number(n.variant.inventoryQuantity) || 0) : 0, full_price: Number(((n.originalUnitPriceSet || {}).shopMoney || {}).amount || n.discountedUnitPriceAfterAllDiscountsSet.shopMoney.amount), variant_id: n.variant && n.variant.id,
    // replacements need MORE than replacement_min_stock on hand (untracked inventory counts as in stock)
    in_stock: !!(n.variant && n.variant.availableForSale && (n.variant.inventoryItem && n.variant.inventoryItem.tracked === false || Number(n.variant.inventoryQuantity) > Number(s.replacement_min_stock))),
    product: n.variant && n.variant.product ? { id: n.variant.product.id, title: n.variant.product.title, variants: n.variant.product.variants.nodes } : null,
  }));
  const ppLines = all.filter((l) => R().isPP(l, s) && l.current > 0);
  const lines = all.filter((l) => !R().isPP(l, s) && l.current > 0);
  // Real shipments only: skip cancelled fulfillments and ones that only "fulfil" the Package Protection fee line
  // (PP apps mark that line fulfilled with no tracking — it isn't a package).
  const ppIds = new Set(ppLines.map((l) => l.id));
  const fulfillments = (o.fulfillments || []).filter((f) => !/CANCEL|FAIL|ERROR/i.test(String(f.status || ""))).filter((f) => {
    const ls = ((f.fulfillmentLineItems && f.fulfillmentLineItems.nodes) || []).filter((x) => x.lineItem);
    return !(ls.length && ls.every((x) => ppIds.has(x.lineItem.id)));
  }).map((f) => ({ at: f.createdAt, delivered_at: f.deliveredAt, status: f.displayStatus, events: ((f.events && f.events.nodes) || []),
    tracking: (f.trackingInfo || []).filter((t) => t.number).map((t) => ({ number: t.number, url: t.url, company: t.company })),
    lines: ((f.fulfillmentLineItems && f.fulfillmentLineItems.nodes) || []).filter((x) => x.lineItem).map((x) => ({ id: x.lineItem.id, quantity: x.quantity })) }));
  const shippedAt = fulfillments.map((f) => f.at).sort()[0] || null;
  // Local pickup: no carrier, no tracking. The fulfillment is created when staff hand it over, so that moment is "delivered".
  const pickup = ((o.fulfillmentOrders && o.fulfillmentOrders.nodes) || []).some((x) => x.deliveryMethod && x.deliveryMethod.methodType === "PICK_UP");
  // Goodwill exception (Buzzin → Returns → Exceptions): staff can waive specific rules for this order.
  const ex = await EX().forOrder(o.name);
  const ppGoodwill = !ppLines.length && ex.has("pp_required");
  return { st, s, key, o, pickup, lines, ppLines, has_pp: ppLines.length > 0 || ppGoodwill, pp_goodwill: ppGoodwill, ex, fulfillments, shipped_at: shippedAt,
    minutes: (Date.now() - new Date(o.createdAt).getTime()) / 60000, currency: o.currencyCode, def: R().STORE_DEFS[key] };
}

// Units already claimed (open or approved claims) per line item — they can't be claimed or returned again.
async function claimedQty(orderName) {
  const rows = (await db(`SELECT data->'items' AS items FROM hd_claims WHERE order_name=$1 AND type IN ('defective','pp') AND status IN ('pending','info_requested','processing','approved')`, [orderName])).rows;
  const m = {}; for (const r of rows) for (const i of r.items || []) m[i.id] = (m[i.id] || 0) + (Number(i.quantity) || 0);
  return m;
}
async function returnedQty(orderName) {
  const rows = (await db(`SELECT data->'items' AS items FROM hd_returns WHERE order_name=$1 AND status<>'cancelled'`, [orderName]).catch(() => ({ rows: [] }))).rows;
  const m = {}; for (const r of rows) for (const i of r.items || []) if (i.line_item_id) m[i.line_item_id] = (m[i.line_item_id] || 0) + (Number(i.quantity) || 0);
  return m;
}

/* ---------------- what the customer can do with this order ---------------- */
// unshipped → in_transit → delivered (any shipment delivered counts), from verified tracking.
async function orderState(c) {
  if (c._state) return c._state;
  const fs = String(c.o.displayFulfillmentStatus || "").toUpperCase();
  let st;
  if (c.o.cancelledAt) st = { state: "cancelled", ship: [] };
  else if (c.pickup) {
    const at = c.fulfillments.map((f) => f.at).filter(Boolean).sort()[0] || null;
    st = at ? { state: "delivered", ship: [], delivered_at: at, pickup: true } : { state: "unshipped", ship: [], pickup: true };
  }
  else if (!c.fulfillments.length && !["FULFILLED", "PARTIALLY_FULFILLED"].includes(fs)) st = { state: "unshipped", ship: [] };
  else {
    const ship = await trackingFor(c);
    const delivered = ship.some((x) => x.delivered) || c.fulfillments.some((f) => f.delivered_at);
    const dts = [...ship.filter((x) => x.delivered).map((x) => x.delivered_at || x.last_update_at), ...c.fulfillments.map((f) => f.delivered_at)].filter(Boolean).map((x) => Date.parse(x)).filter((x) => !isNaN(x));
    st = { state: delivered ? "delivered" : "in_transit", ship, delivered_at: dts.length ? new Date(Math.min(...dts)).toISOString() : null };
  }
  c._state = st; return st;
}
function menuFor(c, st) {
  const s = c.s, state = st.state, now = Date.now();
  const editUntil = new Date(new Date(c.o.createdAt).getTime() + s.edit_window_minutes * 60000);
  // windows run from the DELIVERY date
  const dAt = st.delivered_at ? new Date(st.delivered_at).getTime() : null;
  const past = (days) => dAt && now > dAt + days * 86400e3;
  const ex = c.ex || { has: () => false };
  const closed = past(s.claim_window_days) && !ex.has("defect_window") ? { show: true, ok: false, why: `Defect claims are open for ${s.claim_window_days} days after delivery` } : null;
  const notYet = { show: true, ok: false, why: "Available once your order is delivered" };
  const hidden = { show: false, ok: false };
  const m = { state, has_pp: c.has_pp, shipped: state === "in_transit" || state === "delivered" };
  m.edit = state === "cancelled" ? { show: true, ok: false, why: "This order was cancelled" }
    : state !== "unshipped" ? { show: true, ok: false, why: "Your order has already shipped" }
    : { show: true, ok: true, cancel_ok: true, changes_ok: now < editUntil.getTime() || ex.has("edit_window"), until: ex.has("edit_window") ? null : editUntil.toISOString() };
  m.return = state === "unshipped" || state === "cancelled" ? hidden : state === "in_transit" && !ex.has("return_window") ? notYet : { show: true, ok: true };
  m.defective = state === "unshipped" || state === "cancelled" ? hidden : state === "in_transit" ? notYet : closed || { show: true, ok: true };
  m.pp = state === "unshipped" || state === "cancelled" ? hidden : !c.has_pp ? { show: true, ok: false, why: "Your order doesn't include Package Protection" } : { show: true, ok: true };
  m.other = { show: true, ok: true };
  const shippedNo = { ok: false, why: "Your order hasn't shipped yet" };
  m.subs = {
    not_arrived: state === "in_transit" ? { ok: true } : state === "delivered" ? { ok: false, why: "Tracking shows your package was delivered" } : shippedNo,
    delivered_missing: state === "delivered" ? { ok: true } : state === "in_transit" ? { ok: false, why: "Your package hasn't been delivered yet" } : shippedNo,
    damaged: state === "delivered" ? { ok: true } : state === "in_transit" ? { ok: false, why: "Your package hasn't been delivered yet" } : shippedNo,
    something_else: { ok: true },
  };
  const win = c.has_pp ? s.pp_claim_window_days : s.nopp_claim_window_days;   // PP 7 days, no PP 5 days (from delivery)
  if (state === "delivered" && past(win) && !ex.has("claim_window")) {
    m.subs.delivered_missing = { ok: false, why: `This has to be reported within ${win} days of delivery` };
    m.subs.damaged = { ok: false, why: `Damage has to be reported within ${win} days of delivery` };
  }
  if (state === "cancelled") for (const k of ["not_arrived", "delivered_missing", "damaged"]) m.subs[k] = { ok: false, why: "This order was cancelled" };
  if (c.pickup) {
    m.pickup = true;
    for (const k of ["not_arrived", "delivered_missing", "damaged"]) m.subs[k] = { ok: false, why: "This was a local pickup order, so there was no shipment. Choose \"Something else\" and tell us what happened." };
    m.pp = state === "unshipped" || state === "cancelled" ? hidden : { show: true, ok: false, why: "Local pickup orders aren't shipped, so there's no shipping claim" };
    if (state === "unshipped") m.return = m.defective = hidden;
    if (state === "delivered" && m.edit.show) m.edit = { show: true, ok: false, why: "Your order was already picked up" };
  }
  return m;
}
async function deliveredAt(key, orderId) { const c = await loadOrder(key, orderId); return (await orderState(c)).delivered_at; }
async function menu(key, order) { const c = await loadOrder(key, order.id); return menuFor(c, await orderState(c)); }
function session(token) { const p = R().verify(token); return p; }

/* =============================================================================================
 *  EDIT ORDER
 * ============================================================================================= */
async function editable(token) {
  const p = session(token), c = await loadOrder(p.k, p.o), m = menuFor(c, await orderState(c));
  if (!m.edit.ok) throw httpError(400, `${m.edit.why}, so it can't be changed here. Please email ${c.def.support} and we'll help.`);
  return { p, c, m };
}
async function editOptions(token) {
  const { c, m } = await editable(token);
  const a = c.o.shippingAddress || {};
  return {
    until: m.edit.until, changes_ok: m.edit.changes_ok, cancel_ok: m.edit.cancel_ok, currency: c.currency,
    address: { first_name: a.firstName || "", last_name: a.lastName || "", address1: a.address1 || "", address2: a.address2 || "", city: a.city || "", state: a.provinceCode || "", zip: a.zip || "", phone: a.phone || "" },
    lines: c.lines.filter((l) => l.unfulfilled > 0).map((l) => ({
      id: l.id, title: l.title, variant: l.variant, quantity: l.unfulfilled, unit_price: l.unit_price, image: l.image, variant_id: l.variant_id,
      sizes: l.product ? l.product.variants.map((v) => ({ id: v.id, title: v.title, price: Number(v.price), available: v.availableForSale })) : [], is_pp: R().isPP(l, c.s),
    })),
  };
}
const SEARCH_Q = `query($q:String!){ products(first:8, query:$q){ nodes{ id title featuredImage{ url(transform:{maxWidth:200}) } variants(first:40){ nodes{ id title sku price availableForSale } } } } }`;
async function editSearch(token, q) {
  const { c } = await editable(token);
  const term = String(q || "").replace(/[^\p{L}\p{N}\s'-]/gu, " ").trim().slice(0, 40);
  if (term.length < 2) return { products: [] };
  const words = term.split(/\s+/).filter(Boolean).map((w) => `title:*${w}*`).join(" AND ");
  const d = await R().gql(c.st, SEARCH_Q, { q: `status:active AND ${words}` });
  return { products: d.products.nodes.filter((p) => !R().isPP({ title: p.title }, c.s)).map((p) => ({
    id: p.id, title: p.title, image: p.featuredImage ? p.featuredImage.url : null,
    variants: p.variants.nodes.filter((v) => v.availableForSale).map((v) => ({ id: v.id, title: v.title, price: Number(v.price) })),
  })).filter((p) => p.variants.length) };
}
const VARIANTS_Q = `query($ids:[ID!]!){ nodes(ids:$ids){ ... on ProductVariant { id title price availableForSale product { title status } } } }`;
const EDIT_BEGIN = `mutation($id:ID!){ orderEditBegin(id:$id){ calculatedOrder{ id totalOutstandingSet{ shopMoney{ amount } } lineItems(first:50){ nodes{ id quantity editableQuantity variant{ id } } } } userErrors{ field message } } }`;
const EDIT_QTY = `mutation($id:ID!,$li:ID!,$q:Int!){ orderEditSetQuantity(id:$id, lineItemId:$li, quantity:$q, restock:true){ calculatedOrder{ id totalOutstandingSet{ shopMoney{ amount } } } userErrors{ field message } } }`;
const EDIT_ADD = `mutation($id:ID!,$v:ID!,$q:Int!){ orderEditAddVariant(id:$id, variantId:$v, quantity:$q, allowDuplicates:true){ calculatedLineItem{ id } calculatedOrder{ id totalOutstandingSet{ shopMoney{ amount } } } userErrors{ field message } } }`;
const EDIT_DISC = `mutation($id:ID!,$li:ID!,$disc:OrderEditAppliedDiscountInput!){ orderEditAddLineItemDiscount(id:$id, lineItemId:$li, discount:$disc){ calculatedOrder{ id totalOutstandingSet{ shopMoney{ amount } } } userErrors{ field message } } }`;
const TAGS_ADD = `mutation($id:ID!,$tags:[String!]!){ tagsAdd(id:$id, tags:$tags){ userErrors{ field message } } }`;
const EDIT_COMMIT = `mutation($id:ID!,$notify:Boolean,$note:String){ orderEditCommit(id:$id, notifyCustomer:$notify, staffNote:$note){ order{ id totalOutstandingSet{ shopMoney{ amount } } } userErrors{ field message } } }`;
const numId = (gid) => String(gid || "").split("/").pop();
const uerr = (x, what) => { const e = (x && x.userErrors) || []; if (e.length) throw httpError(400, `${what}: ${e.map((y) => y.message).join("; ")}`); };

async function editSubmit(token, body) {
  const p = session(token), c = await loadOrder(p.k, p.o), m = menuFor(c, await orderState(c));
  if (!m.edit.ok) throw httpError(400, `${m.edit.why}. Please email ${c.def.support} and we'll help.`);
  // a few minutes' grace so someone who opened the editor in time isn't cut off mid-edit
  const grace = (c.s.edit_window_minutes + 5) * 60000;
  if (!m.edit.changes_ok && Date.now() - new Date(c.o.createdAt).getTime() > grace) throw httpError(400, `Orders can be changed for ${c.s.edit_window_minutes} minutes after purchase. You can still cancel it while it hasn't shipped.`);
  body.adds = [];   // size changes only — adding items isn't offered
  const changes = [], adds = [], done = [], seen = new Set();
  for (const x of Array.isArray(body.lines) ? body.lines : []) {
    if (!x || seen.has(x.id)) continue; seen.add(x.id);
    const l = c.lines.find((y) => y.id === x.id); if (!l || l.unfulfilled < 1) continue;
    const qty = l.unfulfilled;   // size changes only: quantity stays the same
    const vid = qty > 0 && x.variant_id && x.variant_id !== l.variant_id ? x.variant_id : null;
    if (vid) { const v = l.product && l.product.variants.find((y) => y.id === vid); if (!v || !v.availableForSale) throw httpError(400, `That size of ${l.title} is sold out. Pick another size.`); }
    if (qty !== l.unfulfilled || vid) changes.push({ l, qty, vid, vtitle: vid ? l.product.variants.find((y) => y.id === vid).title : null });
  }
  const addIn = (Array.isArray(body.adds) ? body.adds : []).slice(0, 10).filter((a) => a && a.variant_id && Number(a.quantity) > 0);
  if (addIn.length) {
    const vs = (await R().gql(c.st, VARIANTS_Q, { ids: addIn.map((a) => a.variant_id) })).nodes;
    for (const a of addIn) {
      const v = vs.find((y) => y && y.id === a.variant_id);
      if (!v || !v.availableForSale || String(v.product.status || "").toUpperCase() !== "ACTIVE") throw httpError(400, "One of the items you added isn't available any more. Please remove it and try again.");
      if (R().isPP({ title: v.product.title }, c.s)) continue;
      adds.push({ vid: v.id, qty: Math.min(10, Math.floor(Number(a.quantity))), title: `${v.product.title}${v.title && v.title !== "Default Title" ? ` (${v.title})` : ""}`, price: Number(v.price) });
    }
  }
  const a = body.address;
  const cur = c.o.shippingAddress || {};
  let addrChanged = false;
  if (a) {
    const req = ["first_name", "last_name", "address1", "city", "state", "zip"];
    if (req.some((k) => !String(a[k] || "").trim())) throw httpError(400, "Please fill in the name and full address.");
    addrChanged = ["first_name:firstName", "last_name:lastName", "address1:address1", "address2:address2", "city:city", "state:provinceCode", "zip:zip", "phone:phone"]
      .some((pair) => { const [k, sk] = pair.split(":"); return String(a[k] || "").trim() !== String(cur[sk] || "").trim(); });
  }
  if (!changes.length && !adds.length && !addrChanged) throw httpError(400, "Nothing changed yet.");
  const keeps = c.lines.reduce((t, l) => { const ch = changes.find((x) => x.l === l); return t + (ch ? ch.qty + l.fulfilled : l.current); }, 0) + adds.reduce((t, a) => t + a.qty, 0);
  if (keeps <= 0) throw httpError(400, `To cancel the whole order, please email ${c.def.support}.`);

  // 1) items (one Shopify order edit) — first, so an item error leaves the address untouched
  let owed = 0, refunded = 0, addrNote = null, addrFailed = false;
  if (changes.length || adds.length) {
    const b = (await R().gql(c.st, EDIT_BEGIN, { id: c.o.id })).orderEditBegin; uerr(b, "Couldn't start the edit");
    const cid = b.calculatedOrder.id, clines = b.calculatedOrder.lineItems.nodes;
    // Only THIS edit's change counts — any balance the order already had is left alone.
    const startOutstanding = Number(b.calculatedOrder.totalOutstandingSet.shopMoney.amount);
    let outstanding = startOutstanding;
    const step = (r, what) => { uerr(r, what); if (r.calculatedOrder) outstanding = Number(r.calculatedOrder.totalOutstandingSet.shopMoney.amount); };
    for (const x of changes) {
      const cl = clines.find((y) => numId(y.id) === numId(x.l.id));
      if (!cl) throw httpError(400, `${x.l.title} can't be changed any more.`);
      const keepFulfilled = cl.quantity - cl.editableQuantity;
      if (x.vid) {
        step((await R().gql(c.st, EDIT_QTY, { id: cid, li: cl.id, q: keepFulfilled })).orderEditSetQuantity, `Couldn't change ${x.l.title}`);
        if (x.qty > 0) {
          const ad = (await R().gql(c.st, EDIT_ADD, { id: cid, v: x.vid, q: x.qty })).orderEditAddVariant; step(ad, `Couldn't add the new size of ${x.l.title}`);
          // keep the discount the customer got on the original line (a size swap shouldn't cost more because a code was used)
          const perUnit = round2(x.l.full_price - x.l.unit_price), newPrice = Number((x.l.product.variants.find((y) => y.id === x.vid) || {}).price || 0);
          const off = round2(Math.min(perUnit, newPrice) * x.qty);
          if (off > 0.009 && ad.calculatedLineItem) step((await R().gql(c.st, EDIT_DISC, { id: cid, li: ad.calculatedLineItem.id, disc: { fixedValue: { amount: off.toFixed(2), currencyCode: c.currency }, description: "Original order discount (size swap)" } })).orderEditAddLineItemDiscount, "Couldn't keep your discount");
        }
        done.push(x.qty > 0 ? `${x.l.title}: size ${x.l.variant || "—"} → ${x.vtitle}${x.qty !== x.l.unfulfilled ? `, qty ${x.qty}` : ""}` : `Removed ${x.l.title}`);
      } else {
        step((await R().gql(c.st, EDIT_QTY, { id: cid, li: cl.id, q: keepFulfilled + x.qty })).orderEditSetQuantity, `Couldn't change ${x.l.title}`);
        done.push(x.qty === 0 ? `Removed ${x.l.title}${x.l.variant ? ` (${x.l.variant})` : ""}` : `${x.l.title}: quantity ${x.l.unfulfilled} → ${x.qty}`);
      }
    }
    for (const x of adds) { step((await R().gql(c.st, EDIT_ADD, { id: cid, v: x.vid, q: x.qty })).orderEditAddVariant, `Couldn't add ${x.title}`); done.push(`Added ${x.qty}× ${x.title}`); }
    // Shopify's own "Order edited" email always goes to the customer (it includes the pay link when they owe more).
    // Customer owed money → refund it below.
    const delta = round2(outstanding - startOutstanding);
    const notify = true;
    const cm = (await R().gql(c.st, EDIT_COMMIT, { id: cid, notify, note: `Edited by the customer in the returns portal: ${done.join("; ")}`.slice(0, 1000) })).orderEditCommit;
    uerr(cm, "Couldn't save the changes");
    owed = notify ? delta : 0;
    if (owed) { try { await R().gql(c.st, TAGS_ADD, { id: c.o.id, tags: ["portal-edit-unpaid"] }); } catch (e) { console.error("portal edit tag:", e.message); } }
    if (delta < -0.009) {
      try { const r = await K().refundOrder({ store: c.st.brand, id: c.o.id, name: c.o.name }, { mode: "amount", amount: round2(-delta), note: "Order edited by customer — difference refunded", notify: true }); refunded = r.amount; }
      catch (e) { console.error("portal edit refund:", e.message); core.slackPost(`⚠️ ${c.o.name} was edited in the portal and is owed ${usd(-delta)}, but the refund failed: ${e.message}. Refund it from the order page.`).catch(() => {}); refunded = -1; }
    }
  }
  // 2) address (Shopify + ShipStation if it has already synced)
  if (addrChanged) {
    const addr = { name: `${String(a.first_name).trim()} ${String(a.last_name).trim()}`, street1: String(a.address1).trim(), street2: String(a.address2 || "").trim(), city: String(a.city).trim(), state: String(a.state).trim().toUpperCase().slice(0, 2), postal_code: String(a.zip).trim(), country: cur.countryCodeV2 || "US", phone: String(a.phone || "").trim() };
    try { const r = await K().applyAddressChange({ order: c.o.name }, addr, { st: c.st, gid: c.o.id, name: c.o.name }); done.push(`Shipping address updated`); addrNote = r.note; }
    catch (e) {
      console.error("portal edit address:", e.message); addrFailed = true;
      core.slackPost(`⚠️ ${c.o.name}: the customer changed the shipping address in the portal but it could NOT be saved (${e.message}). New address: ${addr.name}, ${addr.street1} ${addr.street2}, ${addr.city} ${addr.state} ${addr.postal_code}. Fix it before it ships.`).catch(() => {});
      if (!done.length) throw httpError(502, `We couldn't update the address. Please email ${c.def.support} right away so we can fix it before it ships.`);
    }
  }

  const rec = await putClaim({ id: crypto.randomUUID(), number: `${c.o.name.replace(/^#/, "")}-E${Date.now().toString(36).slice(-4).toUpperCase()}`, store: p.k, type: "edit", status: "done",
    order_name: c.o.name, email: c.o.email || p.e, ticket_id: null, changes: done, owed, refunded, address_note: addrChanged ? addrNote : null, source: "portal" }, `Customer edited the order: ${done.join("; ")}`);
  await core.audit({ kind: "portal-order-edit", detail: `${c.o.name} · ${done.join("; ")}${owed ? ` · pay link for ${usd(owed)}` : ""}${refunded > 0 ? ` · refunded ${usd(refunded)}` : ""}`, who: "customer (portal)", target: rec.id }).catch(() => {});
  core.slackPost(`✏️ ${c.o.name} (${c.def.name}) edited by the customer in the portal — ${done.join("; ")}${owed ? ` · Shopify emailed a pay link for ${usd(owed)}` : ""}${refunded > 0 ? ` · ${usd(refunded)} refunded` : ""}`).catch(() => {});
  return { changes: done, owed, refunded: refunded > 0 ? refunded : 0, refund_failed: refunded === -1, address_failed: addrFailed, support: c.def.support };
}

async function editCancel(token, body) {
  const { p, c, m } = await editable(token);
  if (!m.edit.cancel_ok) throw httpError(400, `This order can't be cancelled here. Please email ${c.def.support}.`);
  const o = await K().orderDetail(c.o.name);
  if (o.error || o.note) throw httpError(400, `We couldn't load the order. Please email ${c.def.support}.`);
  if (!o.can_cancel) throw httpError(400, `Your order is already being packed or has shipped, so it can't be cancelled here. Please email ${c.def.support} and we'll help.`);
  const why = String(body.reason || "").trim().slice(0, 300);
  let r;
  try { r = await K().cancelOrder(o, { reason: "CUSTOMER", refund: true, restock: true, notify: true, note: `Cancelled by the customer in the returns portal${why ? `: ${why}` : ""}` }); }
  catch (e) { console.error("portal cancel:", e.message); core.slackPost(`⚠️ ${c.o.name}: the customer tried to cancel in the portal and it failed (${e.message}). Please handle it.`).catch(() => {}); throw httpError(502, `We couldn't cancel it automatically. Please email ${c.def.support} right away and we'll take care of it.`); }
  await putClaim({ id: crypto.randomUUID(), number: `${c.o.name.replace(/^#/, "")}-X${Date.now().toString(36).slice(-4).toUpperCase()}`, store: p.k, type: "cancel", status: "done", order_name: c.o.name, email: c.o.email || p.e, ticket_id: null, changes: [r.note], reason: why, source: "portal" }, `Customer cancelled the order${why ? `: ${why}` : ""}. ${r.note}`);
  await core.audit({ kind: "portal-order-cancel", detail: `${c.o.name} · ${r.note}${why ? ` · ${why}` : ""}`, who: "customer (portal)" }).catch(() => {});
  core.slackPost(`🛑 ${c.o.name} (${c.def.name}) cancelled by the customer in the portal — ${r.note}${why ? ` · reason: ${why}` : ""}`).catch(() => {});
  return { cancelled: true, note: "Your order is cancelled and refunded in full. Shopify will email you a confirmation. Refunds take 5–10 business days to show." };
}

/* =============================================================================================
 *  CLAIMS — defective / Package Protection / not delivered
 * ============================================================================================= */
/* ---- Tracking, verified. Every package is checked with up to three independent sources — Shopify's fulfillment
 * status, ShipStation's carrier tracking, and USPS directly (USPS packages, when USPS_CLIENT_ID/SECRET are set).
 * A lost / not-delivered claim only opens when every required source answered and they agree. ---- */
const DELIVERED_RE = /\bdelivered\b/i, NOT_DELIVERED_RE = /out for delivery|attempt|not delivered|undeliver|delivery exception|return(ed)? to sender/i;
const SRC_NAME = { shopify: "Shopify", shipstation: "ShipStation", usps: "USPS" };
const srcList = (ks) => ks.map((k) => SRC_NAME[k] || k).join(" + ");
const isDeliveredText = (t) => DELIVERED_RE.test(t || "") && !NOT_DELIVERED_RE.test(t || "");
let uspsTok = { token: null, exp: 0 };
const uspsConfigured = () => !!(process.env.USPS_CLIENT_ID && process.env.USPS_CLIENT_SECRET);
async function uspsToken() {
  if (uspsTok.token && Date.now() < uspsTok.exp) return uspsTok.token;
  const r = await fetch("https://apis.usps.com/oauth2/v3/token", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: process.env.USPS_CLIENT_ID, client_secret: process.env.USPS_CLIENT_SECRET }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error(`USPS sign-in failed (${r.status})`);
  uspsTok = { token: j.access_token, exp: Date.now() + ((Number(j.expires_in) || 3600) - 300) * 1000 };
  return uspsTok.token;
}
function parseUsps(j) {
  // v3 JSON: statusCategory / status / trackingEvents[{eventType, eventTimestamp, eventCity, eventState}]; older shape: TrackSummary / TrackDetail
  const evs = (j.trackingEvents || j.TrackDetail || []).map((e) => ({ desc: e.eventType || e.Event || e.event, at: e.eventTimestamp || e.GMTTimestamp || (e.EventDate ? `${e.EventDate} ${e.EventTime || ""}` : null), where: [e.eventCity || e.EventCity, e.eventState || e.EventState].filter(Boolean).join(", ") }));
  const sum = j.TrackSummary ? { desc: j.TrackSummary.Event, at: `${j.TrackSummary.EventDate} ${j.TrackSummary.EventTime || ""}`, where: [j.TrackSummary.EventCity, j.TrackSummary.EventState].filter(Boolean).join(", ") } : null;
  const all = (sum ? [sum, ...evs] : evs).filter((e) => e.desc).map((e) => ({ ...e, ms: e.at ? Date.parse(e.at) : NaN }));
  all.sort((a, b) => (b.ms || 0) - (a.ms || 0));
  const last = all[0] || null;
  const statusText = j.statusCategory || j.status || (last && last.desc) || "";
  const delivered = /^delivered$/i.test(String(j.statusCategory || "")) || isDeliveredText(statusText) || (last ? isDeliveredText(last.desc) : false);
  const dEv = all.find((e) => isDeliveredText(e.desc));
  return { ok: true, delivered, delivered_at: delivered && dEv && !isNaN(dEv.ms) ? new Date(dEv.ms).toISOString() : null, last_at: last && !isNaN(last.ms) ? new Date(last.ms).toISOString() : null, desc: statusText || (last && last.desc) || "", where: last ? last.where : "" };
}
async function uspsTrack(number) {
  const tok = await uspsToken();
  const r = await fetch(`https://apis.usps.com/tracking/v3/tracking/${encodeURIComponent(number)}?expand=DETAIL`, { headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" } });
  if (r.status === 401) uspsTok = { token: null, exp: 0 };
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`USPS ${r.status}: ${(j.error && (j.error.message || j.error)) || "tracking unavailable"}`.slice(0, 160));
  return parseUsps(j);
}
function fromShopify(f) {
  const ev = f.events[0] || null;
  const delivered = !!f.delivered_at || /^DELIVERED$/i.test(f.status || "") || (ev && /^DELIVERED$/i.test(ev.status));
  const known = delivered || !!ev || !!f.status;
  return { ok: known, delivered, delivered_at: f.delivered_at || (delivered && ev ? ev.happenedAt : null), last_at: ev ? ev.happenedAt : null,
    desc: ev ? String(ev.status).replace(/_/g, " ").toLowerCase() : String(f.status || "").replace(/_/g, " ").toLowerCase(), where: ev ? [ev.city, ev.province].filter(Boolean).join(", ") : "",
    why: known ? null : "Shopify isn't following this tracking number" };
}
async function trackingFor(c) {
  const out = [];
  const anyTracked = c.fulfillments.some((f) => f.tracking.length);
  for (const [fi, f] of c.fulfillments.entries()) for (const t of (f.tracking.length ? f.tracking : anyTracked ? [] : [{ number: null }])) {
    if (!t.number) { out.push({ fi, number: null, url: null, carrier: "the carrier", shipped_at: f.at, delivered: false, delivered_at: null, status: "Shipped without a tracking number", last_event: null, last_update_at: f.at, no_tracking: true, verified: false, sources: {} }); continue; }
    const guess = K().carrierFromNumber(t.number);
    const carrier = (guess && guess.name) || t.company || "the carrier", isUsps = /usps/i.test(carrier);
    const sources = { shopify: fromShopify(f) };
    try { const l = guess ? await K().ssV2Track(guess.v2, t.number) : null; if (!l) throw new Error("carrier not recognized");
      const ssDelivered = !!l.delivered || String(l.code || "").toUpperCase() === "SP" || isDeliveredText(l.description);   // SP = delivered to a collection point (locker / post office)
      sources.shipstation = { ok: String(l.code || "").toUpperCase() !== "UN", code: l.code, accepted_only: !!l.accepted_only, not_scanned: !!l.not_in_system, delivered: ssDelivered, delivered_at: l.delivered_at || (ssDelivered && l.last_event ? l.last_event.at : null), last_at: l.last_event ? l.last_event.at : null, desc: l.description || "", where: l.last_event ? l.last_event.where : "", why: String(l.code || "").toUpperCase() === "UN" ? "ShipStation has no status for this label (unknown)" : null }; }
    catch (e) { sources.shipstation = { ok: false, why: e.message }; console.error(`claims ShipStation tracking ${t.number}:`, e.message); }
    if (isUsps) {
      if (uspsConfigured()) { try { sources.usps = await uspsTrack(t.number); } catch (e) { sources.usps = { ok: false, why: e.message }; console.error(`claims USPS tracking ${t.number}:`, e.message); } }
      else sources.usps = { ok: false, skipped: true, why: "USPS direct check not set up (USPS_CLIENT_ID / USPS_CLIENT_SECRET)" };
    }
    // Required: ShipStation, plus USPS for USPS packages (when set up), plus Shopify when Shopify is following the
    // tracking. At least two independent sources must answer — one source alone is never enough.
    const req = ["shipstation", ...(isUsps && uspsConfigured() ? ["usps"] : []), ...(sources.shopify.ok ? ["shopify"] : [])];
    const answered = Object.entries(sources).filter(([, v]) => v.ok);
    const verified = req.every((k) => sources[k] && sources[k].ok) && answered.length >= 2;
    const delivered = answered.some(([, v]) => v.delivered);
    const carrierAnswered = answered.some(([k]) => k !== "shopify");
    const txt = answered.map(([, v]) => `${v.desc || ""} ${v.code || ""}`).join(" | ");
    const returned = /return(ed)? to sender|returning to sender|\bRTS\b/i.test(txt);
    const attempted = !returned && (/attempt|notice left|no access to delivery|receptacle full|business closed/i.test(txt) || answered.some(([, v]) => v.code === "AT"));
    const carrierSaysDelivered = answered.some(([k, v]) => k !== "shopify" && v.delivered);
    // Shopify's "Delivered" (deliveredAt / DELIVERED event) comes from the carrier's own scans.
    const shopifyScan = sources.shopify.ok && sources.shopify.delivered && (!!f.delivered_at || (f.events[0] && /^DELIVERED$/i.test(f.events[0].status)));
    const dScan = Math.max(0, ...answered.filter(([, v]) => v.delivered).map(([, v]) => Date.parse(v.delivered_at || v.last_at) || 0));
    const contradicted = answered.some(([k, v]) => k !== "shopify" && !v.delivered && !v.not_scanned && (!dScan || (Date.parse(v.last_at) || 0) > dScan));   // a carrier source with a NEWER non-delivered scan
    const carrierDelivered = !contradicted && (carrierSaysDelivered || shopifyScan);
    const ts = (k) => answered.map(([, v]) => v[k]).filter(Boolean).map((x) => Date.parse(x)).filter((x) => !isNaN(x));
    const lastMs = Math.max(new Date(f.at).getTime(), ...ts("last_at"), ...ts("delivered_at"));
    const dMs = ts("delivered_at");
    const best = (sources.usps && sources.usps.ok && sources.usps) || (sources.shipstation.ok && sources.shipstation) || sources.shopify;
    out.push({ fi, number: t.number, url: t.url, carrier, shipped_at: f.at, delivered, carrier_delivered: carrierDelivered,
      delivered_at: dMs.length ? new Date(Math.max(...dMs)).toISOString() : null, status: delivered ? "Delivered" : best.desc || "In transit",
      last_event: { at: new Date(lastMs).toISOString(), desc: best.desc, where: best.where }, last_update_at: new Date(lastMs).toISOString(),
      verified, carrier_answered: carrierAnswered, contradicted, attempted, returned, required: req, sources, agree: answered.every(([, v]) => v.delivered === delivered) });
  }
  return out;
}
const UNVERIFIED = "We couldn't confirm your tracking with every carrier source right now, so we can't open this claim yet. Please try again in a few hours, or email us and we'll check it by hand.";
function gates(c, ship) {
  const s = c.s, now = Date.now(), ex = c.ex || { has: () => false };
  const exNote = (k) => (ex.has(k) ? ` ${EX().describe(ex, [k])}.` : "");
  const tracked = ship.filter((x) => x.number);
  const g = { damaged: { ok: true }, something_else: { ok: true } };
  if (!ship.length) { g.not_arrived = g.delivered_missing = { ok: false, why: "Your order hasn't shipped yet." }; return g; }
  if (!tracked.length) { g.not_arrived = g.delivered_missing = { ok: false, why: "This order shipped without a tracking number, so we have to check it by hand. Choose \"Something else\" and tell us what's going on." }; return g; }
  // "Hasn't arrived": decided by DAYS since shipping (tracking can keep updating forever). No source may say delivered,
  // and the tracking must be verified by every required source.
  if (tracked.some((x) => x.delivered)) {
    const d = tracked.find((x) => x.delivered);
    g.not_arrived = { ok: false, why: `Tracking shows your package was delivered${d.delivered_at ? ` on ${fmtDate(d.delivered_at)}` : ""}. If you can't find it, choose "My package was marked delivered, but I didn't get it".` };
  } else if (tracked.some((x) => !x.carrier_answered)) g.not_arrived = { ok: false, why: UNVERIFIED };
  else if (tracked.some((x) => x.returned)) g.not_arrived = { ok: false, why: "Tracking shows your package is being returned to us by the carrier. We'll email you as soon as it arrives back. If you have questions, choose \"Something else\"." };
  else if (tracked.some((x) => x.attempted) && ex.has("po_check")) {
    const x = tracked.find((y) => y.attempted);
    g.not_arrived = { ok: true, rule: false, attempted: true, note: `Delivery attempted ${fmtWhen(x.last_update_at)}; post-office check waived.${exNote("po_check")} Needs review.` };
  } else if (tracked.some((x) => x.attempted)) {
    // Attempted delivery (not returned to sender): the post office is usually holding it.
    // Ask "did you contact the post office?" — yes → file (staff review); no → contact them, locked for 30 minutes.
    const x = tracked.find((y) => y.attempted), at = new Date(x.last_update_at).getTime();
    g.not_arrived = { ok: true, rule: false, attempted: true, ask_po: true, attempted_at: new Date(at).toISOString(),
      note: `Delivery attempted ${fmtWhen(at)}; customer confirmed they contacted the post office. Needs review.` };
  } else {
    // Days since shipping decide it — "Accepted" or no new scans still counts as not delivered.
    const shipped = Math.min(...tracked.map((x) => new Date(x.shipped_at).getTime()));
    const days = (now - shipped) / 86400e3, opens = new Date(shipped + s.transit_claim_days * 86400e3), x = tracked[0];
    const answered = Object.entries(x.sources || {}).filter(([, v]) => v.ok).map(([k]) => k);
    const maxD = Number(s.transit_claim_max_days) || 0;
    g.not_arrived = ex.has("transit_wait")
      ? { ok: true, rule: true, note: `Shipped ${Math.floor(days)} days ago and not delivered (checked with ${srcList(answered)}); ${s.transit_claim_days}-day wait waived.${exNote("transit_wait")}` }
      : maxD > 0 && days > maxD
      ? { ok: false, why: `Missing-package claims have to be filed within ${maxD} days of shipping. Please choose "Something else" and tell us what happened.` }
      : days < s.transit_claim_days
      ? { ok: true, wait: true, why: `Your package is on its way${x.last_event && x.last_event.desc ? ` (latest status: ${x.last_event.desc}, ${fmtWhen(x.last_update_at)})` : ""}. If it still hasn't arrived by ${fmtDate(opens)}, come back here and file your claim.`, opens: opens.toISOString() }
      : { ok: true, rule: true, note: `Shipped ${Math.floor(days)} days ago and not delivered (checked with ${srcList(answered)}).` };
  }
  // "Marked delivered": a CARRIER source (ShipStation or USPS) must confirm delivery, all required sources answered, and the wait has passed.
  const dl = tracked.filter((x) => x.delivered);
  if (!dl.length) g.delivered_missing = { ok: false, why: `Tracking doesn't show your package as delivered yet. Choose "My package hasn't arrived" instead.` };
  else if (!dl.some((x) => x.carrier_delivered)) {
    g.delivered_missing = { ok: false, why: UNVERIFIED };
    for (const x of dl) console.log(`claims: delivery not confirmed for ${x.number} — ${JSON.stringify(x.sources)} contradicted=${x.contradicted}`);
  }
  else {
    const at = Math.max(...dl.map((x) => new Date(x.delivered_at || x.last_update_at).getTime()));
    if (now - at < s.delivered_wait_hours * 3600e3 && !ex.has("delivered_wait")) {
      const open = new Date(at + s.delivered_wait_hours * 3600e3);
      g.delivered_missing = { ok: false, why: `Carriers sometimes mark a package delivered a little early. Please give it until ${fmtWhen(open)} and check your mailbox, around your home, and with neighbors. If it still hasn't turned up, come back and file your claim.`, opens: open.toISOString() };
    } else { const by = Object.entries(dl[0].sources || {}).filter(([, v]) => v.ok && v.delivered).map(([k]) => k);
      g.delivered_missing = { ok: true, rule: true, note: `Delivery confirmed by ${srcList(by)} on ${fmtWhen(at)}.${exNote("delivered_wait")}` }; }
  }
  return g;
}
function claimItems(c, type, used = {}) {
  return c.lines.map((l) => ({ id: l.id, title: l.title, variant: l.variant, sku: l.sku, image: l.image, unit_price: l.unit_price, max: Math.max(0, l.fulfilled - (used[l.id] || 0)), in_stock: l.in_stock })).filter((x) => x.max > 0);
}
async function usedQty(c) { const a = await claimedQty(c.o.name), b = await returnedQty(c.o.name); const m = { ...a }; for (const k of Object.keys(b)) m[k] = (m[k] || 0) + b[k]; return m; }
// Lost / marked-delivered claims cover only what was in the affected shipment(s).
function shipmentItems(c, ship, sub, avail) {
  const bad = new Set(ship.filter((x) => (sub === "not_arrived" ? !x.delivered : x.delivered)).map((x) => x.fi));
  const q = {}; let mapped = false;
  for (const [fi, f] of c.fulfillments.entries()) { if (!bad.has(fi)) continue; for (const l of f.lines) { mapped = true; q[l.id] = (q[l.id] || 0) + l.quantity; } }
  if (!mapped) return avail.map((i) => ({ ...i, quantity: i.max }));
  return avail.filter((i) => q[i.id]).map((i) => ({ ...i, quantity: Math.min(i.max, q[i.id]) }));
}
// Package Protection granted by a goodwill exception only covers shipping claims — defects keep the no-PP refund option.
const realPP = (c) => c.has_pp && !c.pp_goodwill;
function resolutionsFor(type, c) { return type === "defective" ? ["replacement", "store_credit", ...(realPP(c) ? [] : ["refund"])] : type === "other" ? [] : ["replacement", "store_credit"]; }
// What each "what happened" option looks like for this order: order state + tracking rules + Package Protection.
function subOptions(c, m, g, tab) {
  const out = {};
  for (const k of ["not_arrived", "delivered_missing", "damaged", "something_else"]) {
    const st = m.subs[k];
    out[k] = !st.ok ? st : g && g[k] && !g[k].ok ? g[k] : { ok: true, wait: !!(g && g[k] && g[k].wait), why: g && g[k] && g[k].wait ? g[k].why : undefined, rule: !!(g && g[k] && g[k].rule), note: (g && g[k] && g[k].note) || "",
      ask_po: !!(g && g[k] && g[k].ask_po), attempted_at: g && g[k] && g[k].attempted_at };
  }
  if (tab === "other" && c.has_pp)
    for (const k of ["not_arrived", "delivered_missing", "damaged"]) out[k] = { ok: false, why: "Your order has Package Protection — please use the Package Protection claim tab" };
  if (!c.has_pp && out.delivered_missing.ok) out.delivered_missing = { ok: true, carrier_only: true };   // no PP → carrier claim, shown as guidance
  return out;
}

// "Did you contact the post office?" → "No" locks the attempted-delivery claim for 30 minutes (per order).
const poLockMin = async () => Math.max(1, Number((await R().settings()).po_lock_minutes) || 30);
async function poLockedUntil(orderId) { const r = await core.syncGet(`po_lock:${orderId}`); const t = r && r.cursor ? Date.parse(r.cursor) : 0; return t > Date.now() ? new Date(t).toISOString() : null; }
async function poAnswer(token, body) {
  const p = session(token);
  if (body.answer === "no") { const until = new Date(Date.now() + (await poLockMin()) * 60000).toISOString(); await core.syncSet(`po_lock:${p.o}`, until, {}); return { locked_until: until }; }
  return { locked_until: await poLockedUntil(p.o) };
}
async function claimStart(token, type) {
  const p = session(token), c = await loadOrder(p.k, p.o), st = await orderState(c), m = menuFor(c, st);
  if (type === "not_delivered") type = "other";
  if (!["defective", "pp", "other"].includes(type)) throw httpError(400, "Pick an option.");
  const tab = m[type === "other" ? "other" : type];
  if (!tab.ok) throw httpError(400, tab.why || "That option isn't available for this order.");
  const open = (await db(`SELECT number, type FROM hd_claims WHERE order_name=$1 AND status IN ('pending','info_requested','processing') AND type=$2 ORDER BY created_at DESC LIMIT 1`, [c.o.name, type === "defective" ? "defective" : "pp"])).rows[0];
  if (type === "defective") return { type, state: st.state, has_pp: c.has_pp, items: claimItems(c, type, await usedQty(c)), resolutions: resolutionsFor(type, c), open_claim: open ? open.number : null, currency: c.currency };
  const ship = st.ship, g = st.state === "unshipped" ? null : gates(c, ship);
  const poLock = await poLockedUntil(c.o.id);
  const avail = claimItems(c, "pp", await claimedQty(c.o.name));
  const carrier = (ship.find((x) => x.number) || {}).carrier || "USPS";
  return { type, state: st.state, has_pp: c.has_pp, shipments: ship, subs: subOptions(c, m, g, type), items: avail,
    subs_tab: type, shipment_items: g ? { not_arrived: shipmentItems(c, ship, "not_arrived", avail).map((i) => ({ id: i.id, quantity: i.quantity })), delivered_missing: shipmentItems(c, ship, "delivered_missing", avail).map((i) => ({ id: i.id, quantity: i.quantity })) } : {},
    resolutions: resolutionsFor("pp", c), open_claim: open ? open.number : null, currency: c.currency, po_locked_until: poLock,
    carrier_links: CARRIER_CLAIMS[/ups/i.test(carrier) ? "UPS" : /fedex/i.test(carrier) ? "FedEx" : "USPS"], carrier, support: c.def.support };
}

/* ---- photos (resized in the browser to ≤ 1600px JPEG before upload) ---- */
const PHOTO_TYPES = { "image/jpeg": 1, "image/png": 1, "image/webp": 1 };
async function savePhoto(token, body) {
  const p = session(token);
  const m = String(body.data || "").match(/^data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!m || !PHOTO_TYPES[m[1]]) throw httpError(400, "Please upload a JPG or PNG photo.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 4 * 1024 * 1024) throw httpError(400, "That photo is too large. Please try a smaller one.");
  const jpg = buf[0] === 0xff && buf[1] === 0xd8, png = buf.slice(0, 4).toString("hex") === "89504e47", webp = buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP";
  if (!(jpg || png || webp)) throw httpError(400, "Please upload a JPG or PNG photo.");
  const n = (await db(`SELECT count(*)::int n FROM hd_claim_photos WHERE order_id=$1 AND created_at > now() - interval '1 day'`, [p.o])).rows[0].n;
  if (n >= 24) throw httpError(429, "That's a lot of photos for one order. Please submit your claim with the ones you've added.");
  const id = crypto.randomUUID(), sha = crypto.createHash("sha256").update(buf).digest("hex");
  await db(`INSERT INTO hd_claim_photos (id, order_id, content_type, bytes, sha, data) VALUES ($1,$2,$3,$4,$5,$6)`, [id, p.o, m[1], buf.length, sha, buf]);
  return { id };
}
async function getPhoto(id) { const r = (await db(`SELECT content_type, data FROM hd_claim_photos WHERE id=$1`, [id])).rows[0]; return r || null; }

async function claimSubmit(token, body) {
  const p = session(token), c = await loadOrder(p.k, p.o), st = await orderState(c), m = menuFor(c, st);
  let type = body.type === "defective" ? "defective" : body.type === "other" && body.subtype === "something_else" ? "other" : "pp";
  const description = String(body.description || "").trim().slice(0, 2000);
  if (type === "other") return submitOther(p, c, st, body, description);
  if (type === "defective" && !m.defective.ok) throw httpError(400, m.defective.why);
  if (type === "pp" && body.type === "pp" && !m.pp.ok) throw httpError(400, m.pp.why);
  const open = (await db(`SELECT number FROM hd_claims WHERE order_name=$1 AND status IN ('pending','info_requested','processing') AND type=$2`, [c.o.name, type])).rows[0];
  if (open) throw httpError(400, `You already have a claim open for this order (${open.number}). We'll email you as soon as it's reviewed.`);
  const resolution = String(body.resolution || "");
  if (resolution === "refund" && (type === "defective" ? realPP(c) : c.has_pp)) throw httpError(400, "Orders with Package Protection can choose a replacement or store credit.");
  if (!resolutionsFor(type, c).includes(resolution)) throw httpError(400, "Pick how you'd like us to make it right.");
  let subtype = null, gate = null, ship = null;
  if (type === "pp") {
    subtype = String(body.subtype || "");
    if (!["not_arrived", "delivered_missing", "damaged"].includes(subtype)) throw httpError(400, "Tell us what happened to the package.");
    ship = st.ship; const opt = subOptions(c, m, gates(c, ship), body.type === "other" ? "other" : "pp")[subtype];
    if (!opt.ok || opt.wait) throw httpError(400, opt.why);
    if (opt.ask_po) {
      const lock = await poLockedUntil(c.o.id);
      if (lock) throw httpError(400, `Please contact your local post office first. You can file this claim after ${fmtWhen(lock)}.`);
      if (body.po_contacted !== true) throw httpError(400, "Please confirm you've contacted your local post office.");
    }
    if (opt.carrier_only) throw httpError(400, "Your order didn't include Package Protection, so please file a claim with the carrier for a package marked delivered.");
    gate = opt;
  }
  const avail = claimItems(c, type, type === "defective" ? await usedQty(c) : await claimedQty(c.o.name));
  let items;
  if (type === "pp" && (subtype === "not_arrived" || subtype === "delivered_missing")) { items = shipmentItems(c, ship, subtype, avail); if (!items.length) throw httpError(400, "Everything in that shipment has already been claimed."); }
  else {
    items = (Array.isArray(body.lines) ? body.lines : []).map((l) => { const i = avail.find((x) => x.id === l.id); const q = Math.floor(Number(l.quantity)); return i && q >= 1 ? { ...i, quantity: Math.min(q, i.max) } : null; }).filter(Boolean);
    if (!items.length) throw httpError(400, "Pick the item(s) this is about.");
  }
  const photoIds = (Array.isArray(body.photo_ids) ? body.photo_ids : []).slice(0, 8).map(String);
  const photos = photoIds.length ? (await db(`SELECT id FROM hd_claim_photos WHERE id = ANY($1) AND order_id=$2 AND claim_id IS NULL`, [photoIds, p.o])).rows.map((r) => r.id) : [];
  const needPhotos = type === "defective" || subtype === "damaged";
  if (needPhotos && !photos.length) throw httpError(400, "Please add at least one photo so we can see the problem.");
  if (type === "defective" && description.length < 10) throw httpError(400, "Please tell us a little about what's wrong with the item.");
  if (resolution === "replacement" && items.some((i) => !i.in_stock)) throw httpError(400, `${items.find((i) => !i.in_stock).title} is out of stock right now, so we can't send a replacement. Please choose ${type === "defective" && !realPP(c) ? "store credit or a refund" : "store credit"}.`);
  const value = round2(items.reduce((t, i) => t + i.unit_price * i.quantity, 0));
  const n = (await db(`SELECT count(*)::int n FROM hd_claims WHERE order_name=$1 AND type IN ('defective','pp')`, [c.o.name])).rows[0].n;
  const a = c.o.shippingAddress || {};
  let claim; try { claim = await putClaim({
    id: crypto.randomUUID(), number: `${c.o.name.replace(/^#/, "")}-C${n + 1}`, store: p.k, type, status: "pending", order_name: c.o.name, email: c.o.email || p.e, ticket_id: null,
    order_id: c.o.id, customer_id: c.o.customer ? c.o.customer.id : null, customer_name: [a.firstName, a.lastName].filter(Boolean).join(" ") || a.name || "", currency: c.currency,
    has_pp: type === "defective" ? realPP(c) : c.has_pp, subtype, items: items.map(({ max, image, ...i }) => ({ ...i, image })), description, photos, resolution, value, amount: value,
    gate: gate ? { rule: !!gate.rule, note: gate.note || "" } : null, tracking: ship, order_created_at: c.o.createdAt, shipped_at: c.shipped_at, source: "portal",
    pp_goodwill: !!c.pp_goodwill, exception: EX().describe(c.ex) || null,
  }, `Claim submitted by the customer: ${type === "pp" ? SUBTYPE_LABEL[subtype] + (c.has_pp ? (c.pp_goodwill ? " (Package Protection by goodwill exception)" : "") : " (no Package Protection)") : "defective item"} · wants ${RES_LABEL[resolution]} · ${usd(value)}${EX().describe(c.ex) ? ` · ${EX().describe(c.ex)}` : ""}`); }
  catch (e) { if (e.code === "23505") throw httpError(400, "You already have a claim open for this order. We'll email you as soon as it's reviewed."); throw e; }
  if (photos.length) await db(`UPDATE hd_claim_photos SET claim_id=$1 WHERE id = ANY($2)`, [claim.id, photos]);
  // Background: confirmation email (opens a Buzzin ticket), AI review, Slack.
  setImmediate(() => afterSubmit(claim.id).catch((e) => console.error("claim after-submit:", e.message)));
  return { number: claim.number, type, resolution, value, email: claim.email };
}

async function submitOther(p, c, st, body, description) {
  if (description.length < 10) throw httpError(400, "Please tell us a little more so we can help.");
  const photoIds = (Array.isArray(body.photo_ids) ? body.photo_ids : []).slice(0, 8).map(String);
  const photos = photoIds.length ? (await db(`SELECT id FROM hd_claim_photos WHERE id = ANY($1) AND order_id=$2 AND claim_id IS NULL`, [photoIds, p.o])).rows.map((r) => r.id) : [];
  const recent = (await db(`SELECT number FROM hd_claims WHERE order_name=$1 AND type='other' AND created_at > now() - interval '10 minutes'`, [c.o.name])).rows[0];
  if (recent) throw httpError(400, `We just got your message (${recent.number}). We'll reply by email soon.`);
  const n = (await db(`SELECT count(*)::int n FROM hd_claims WHERE order_name=$1 AND type='other'`, [c.o.name])).rows[0].n;
  const a = c.o.shippingAddress || {};
  const claim = await putClaim({ id: crypto.randomUUID(), number: `${c.o.name.replace(/^#/, "")}-M${n + 1}`, store: p.k, type: "other", status: "pending", order_name: c.o.name, email: c.o.email || p.e, ticket_id: null,
    order_id: c.o.id, customer_name: [a.firstName, a.lastName].filter(Boolean).join(" ") || a.name || "", has_pp: c.has_pp, subtype: "something_else", items: [], description, photos, value: 0, order_state: st.state, source: "portal" },
    "Message from the customer (Something else)");
  if (photos.length) await db(`UPDATE hd_claim_photos SET claim_id=$1 WHERE id = ANY($2)`, [claim.id, photos]);
  setImmediate(() => afterSubmit(claim.id).catch((e) => console.error("claim after-submit:", e.message)));
  return { number: claim.number, type: "other", email: claim.email };
}
async function afterSubmit(id) {
  let c = await getClaim(id); if (!c) return;
  const def = R().STORE_DEFS[c.store];
  try {
    const m = await claimMail(c.type === "other" ? "message_received" : "claim_received", c);
    const r = await core.sendNewEmail({ mailbox: def.support, to: c.email, subject: m.subject, text: m.text, html: m.html, who: "Returns portal", tags: ["claim", `claim-${c.type}`], name: c.customer_name });
    c = await patchClaim(id, { ticket_id: r.ticket_id }, "Confirmation emailed to the customer");
  } catch (e) { c = await patchClaim(id, {}, "Confirmation email failed: " + e.message); }
  if (c.type === "other") {
    core.slackPost(`✉️ ${c.order_name} (${def.name}) — customer message from the portal (${c.number}): "${String(c.description).slice(0, 200)}"${(c.photos || []).length ? ` · ${c.photos.length} photo(s)` : ""} · reply from the ticket in Buzzin`).catch(() => {});
    return;
  }
  try { c = await review(c); } catch (e) { c = await patchClaim(id, { ai: { verdict: "needs_review", summary: "AI review failed: " + e.message, reasons: [], flags: [] } }, "AI review failed: " + e.message); }
  if (c.ticket_id) core.addNote({ ticketId: String(c.ticket_id), text: `🧾 Claim ${c.number} — ${TYPE_LABEL[c.type]}${c.subtype ? ` (${SUBTYPE_LABEL[c.subtype]})` : ""}\nWants: ${RES_LABEL[c.resolution]} · ${usd(c.value)}\nAI: ${c.ai ? `${c.ai.verdict} (${Math.round((c.ai.confidence || 0) * 100)}%) — ${c.ai.summary}` : "—"}\nApprove or deny in Buzzin → Claims.`, who: "Returns portal" }).catch(() => {});
  try { const d = await autoDecide(c); if (d.approve) { await approve(c.id, { resolution: c.resolution }, "Auto-approved"); return; } await patchClaim(c.id, { auto: d }, `Not auto-approved: ${d.why}`); c.auto = d; }
  catch (e) { await patchClaim(c.id, {}, "Auto-approval failed, left for staff: " + e.message); }
  core.slackPost(`🧾 New ${TYPE_LABEL[c.type]} ${c.number} — ${c.order_name} (${def.name}) · wants ${RES_LABEL[c.resolution]} ${usd(c.value)} · AI: ${c.ai ? `*${c.ai.verdict}* — ${c.ai.summary}` : "—"} · approve in Buzzin → Claims`).catch(() => {});
}

/* ---------------- automatic approval (every check must pass, otherwise staff decide) ---------------- */
async function autoDecide(c) {
  const s = await R().settings();
  const no = (why) => ({ approve: false, why });
  if (!s.auto_approve) return no("auto-approval is off");
  if (Number(c.value) > Number(s.auto_approve_max)) return no(`value ${usd(c.value)} is over the ${usd(s.auto_approve_max)} limit`);
  const prior = (await db(`SELECT count(*)::int n FROM hd_claims WHERE lower(email)=lower($1) AND id<>$2 AND status='approved' AND type IN ('defective','pp') AND created_at > now() - interval '365 days'`, [c.email, c.id])).rows[0].n;
  if (!R().isTestEmail(c.email, s) && prior > Number(s.auto_approve_max_prior)) return no(`${prior} approved claims in the last 12 months`);
  const ai = c.ai || {};
  if ((ai.flags || []).some((f) => /photo was used|reused|stock|screenshot/i.test(f))) return no("photo looks reused or not original");
  if (c.resolution === "replacement" && (c.items || []).some((i) => !i.in_stock)) return no("replacement item out of stock");
  const sure = ai.verdict === "approve" && Number(ai.confidence) >= Number(s.auto_approve_confidence);
  if (c.type === "pp" && c.subtype === "not_arrived") {
    if (c.gate && /attempted/i.test(c.gate.note || "")) return no("attempted delivery — customer says they contacted the post office; please review");
    if (!(c.gate && c.gate.rule)) return no("tracking rule not met");
    if (ai.verdict === "deny" && Number(ai.confidence) >= 0.7) return no("AI flagged it: " + (ai.summary || ""));
    return { approve: true, why: "not delivered after the transit window, verified tracking" };
  }
  if (c.type === "pp" && c.subtype === "delivered_missing") return sure ? { approve: true, why: "AI approved after reviewing history" } : no(`AI ${ai.verdict || "unsure"} (${Math.round((ai.confidence || 0) * 100)}%)`);
  if (c.type === "pp" && c.subtype === "damaged" || c.type === "defective") {
    if (!(c.photos || []).length) return no("no photos");
    if ((ai.flags || []).length) return no("AI raised: " + ai.flags.join("; "));
    return sure ? { approve: true, why: "AI confirmed the photos" } : no(`AI ${ai.verdict || "unsure"} (${Math.round((ai.confidence || 0) * 100)}%)`);
  }
  return no("needs a person");
}

/* ---------------- AI review ---------------- */
// What the AI reviewer sees about this customer. Test customers get a blank history so past test claims never sway the result.
const BLANK_HISTORY = { previous_claims: [], previous_returns: 0, photos_reused_from_other_claims: 0, past_returns: [], past_claims_detail: [], tickets: null, store_credits_given: null, replacements_given: null, lifetime_orders: null, lifetime_spent: null };
async function historyFor(c) {
  if (R().isTestEmail(c.email, await R().settings())) return { ...BLANK_HISTORY };
  const email = String(c.email || "").toLowerCase();
  const claims = (await db(`SELECT number, type, status, created_at, data->>'value' AS value FROM hd_claims WHERE lower(email)=$1 AND id<>$2 AND type IN ('defective','pp') ORDER BY created_at DESC LIMIT 20`, [email, c.id])).rows;
  const retRows = (await db(`SELECT rma, order_name, status, created_at, data->'items' AS items FROM hd_returns WHERE lower(email)=$1 AND status<>'cancelled' ORDER BY created_at DESC LIMIT 20`, [email]).catch(() => ({ rows: [] }))).rows;
  const returns = retRows.length;
  const claimDetail = (await db(`SELECT number, type, status, created_at, data->>'subtype' AS subtype, data->>'description' AS description, data->'items' AS items, data->'ai'->>'verdict' AS ai FROM hd_claims WHERE lower(email)=$1 AND id<>$2 AND type IN ('defective','pp') ORDER BY created_at DESC LIMIT 10`, [email, c.id])).rows;
  let hist = null; try { hist = await K().customerHistory(email); } catch (_) {}
  const reused = c.photos && c.photos.length ? (await db(`SELECT DISTINCT p2.claim_id FROM hd_claim_photos p1 JOIN hd_claim_photos p2 ON p1.sha=p2.sha AND p2.claim_id IS NOT NULL AND p2.claim_id<>p1.claim_id WHERE p1.claim_id=$1`, [c.id])).rows.map((r) => r.claim_id) : [];
  return {
    previous_claims: claims.map((x) => ({ number: x.number, type: x.type, status: x.status, when: x.created_at, value: Number(x.value) || 0 })),
    previous_returns: returns, photos_reused_from_other_claims: reused.length,
    past_returns: retRows.map((r) => ({ rma: r.rma, order: r.order_name, status: r.status, when: r.created_at, items: (r.items || []).map((i) => `${i.quantity}× ${i.title}${i.variant ? ` (${i.variant})` : ""} — reason: ${i.reason || "?"}${i.note ? ` — "${String(i.note).slice(0, 120)}"` : ""}`) })),
    past_claims_detail: claimDetail.map((x) => ({ number: x.number, type: x.type, what: x.subtype || "defective", status: x.status, when: x.created_at, ai: x.ai, said: String(x.description || "").slice(0, 200), items: (x.items || []).map((i) => `${i.quantity}× ${i.title}${i.variant ? ` (${i.variant})` : ""}`) })),
    tickets: hist && hist.tickets ? hist.tickets.length : null, store_credits_given: hist ? hist.goodwill_credits_given : null, replacements_given: hist ? hist.replacements_given : null,
    lifetime_orders: hist && hist.shopify ? hist.shopify.lifetime_orders : null, lifetime_spent: hist && hist.shopify ? hist.shopify.lifetime_spent : null,
  };
}
const REVIEW_SYS = `You review customer claims for a baby clothing store (Larkspur Baby). Your verdict can approve a claim automatically, so be careful and honest; when unsure say needs_info.
Claim types:
- defective: the customer says an item has a manufacturing defect (holes, broken snaps/zippers, seams coming apart, misprints, stains from the factory). They keep the item. First decide whether the photos are GENUINE: real photos taken by the customer of the item they ordered (matching product, color/print), not stock or catalog images, not screenshots, not edited, not obviously from a different product. Then decide whether they show a real defect matching the description, rather than normal wear, washing damage, or misuse long after delivery. Approve only when both are clearly true AND the customer's history is consistent: look at past_returns (how often they return, and with what reasons) and past_claims_detail (earlier defect/damage claims — same item or same story again is a red flag). A first or rare claim from a normal customer whose photos match the reason they gave should be approved.
- pp / damaged ("My package arrived damaged"): photos must show transit damage to the package and/or the items, and must match what the customer says was damaged. Same genuineness check. Same history check (past_returns, past_claims_detail): approve when the photos match the reason and the history is normal.
- pp / delivered_missing ("marked delivered but not received"): there is no photo proof, so decide from the facts: tracking (delivered scan, time since), the customer's history (earlier claims and how they ended, returns, store credits and replacements already given, number of orders and amount spent, how long they've been a customer), the claim value, and the customer's own words. A first claim from a customer with a normal order history is usually fine to approve. Repeat claims, many claims relative to orders, or vague/contradictory statements → needs_info or deny.
- pp / not_arrived: tracking shows no delivery long after shipping. Approve unless the history shows a pattern of claims.
"has_package_protection" tells you whether the order had Package Protection; it does not change how you judge truthfulness.
"goodwill_exception", when present, means staff deliberately waived the listed policies (a time window, a wait, Package Protection) for this order. Do not count those waived rules against the customer; still judge photos, facts and history as usual.
Reply with ONLY a JSON object, no prose: {"verdict":"approve"|"deny"|"needs_info","confidence":0.0-1.0,"summary":"one sentence for staff","reasons":["..."],"flags":["risk signals (e.g. 'photo looks like a stock image'), empty if none"],"photo_findings":"what the photos show and whether they look genuine, or empty","ask_customer":"if needs_info, the question to ask the customer, else empty"}`;
async function review(c) {
  const k = K();
  if (!k.anthropic) return patchClaim(c.id, { ai: { verdict: "needs_review", confidence: 0, summary: "AI review is off (no ANTHROPIC_API_KEY).", reasons: [], flags: [] } }, "AI review skipped");
  const hist = await historyFor(c);
  const content = [];
  for (const id of (c.photos || []).slice(0, 5)) {
    const ph = await getPhoto(id); if (!ph) continue;
    const mt = ph.content_type === "image/jpg" ? "image/jpeg" : ph.content_type;
    content.push({ type: "image", source: { type: "base64", media_type: mt, data: Buffer.from(ph.data).toString("base64") } });
  }
  const facts = {
    claim_type: c.type, what_happened: c.subtype ? SUBTYPE_LABEL[c.subtype] : null, description: c.description || "(none)", photos_attached: content.length,
    items: c.items.map((i) => ({ title: i.title, variant: i.variant, quantity: i.quantity, price: i.unit_price })), value: c.value, wants: RES_LABEL[c.resolution],
    order_placed: c.order_created_at, shipped: c.shipped_at, claim_filed: c.created_at, has_package_protection: c.has_pp,
    tracking: (c.tracking || []).map((t) => ({ carrier: t.carrier, status: t.status, delivered: t.delivered, delivered_at: t.delivered_at, last_update: t.last_update_at, last_event: t.last_event })),
    policy_check: c.gate ? c.gate.note : null, goodwill_exception: c.exception || null, transit_claim_days: (await R().settings()).transit_claim_days, customer_history: hist,
  };
  content.push({ type: "text", text: `Review this claim.\n${JSON.stringify(facts, null, 2)}` });
  const resp = await k.anthropic.messages.create({ model: k.model, max_tokens: 900, system: REVIEW_SYS, messages: [{ role: "user", content }] });
  const txt = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let ai; try { ai = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)); } catch (_) { ai = { verdict: "needs_review", confidence: 0, summary: txt.slice(0, 300), reasons: [], flags: [] }; }
  ai.verdict = ["approve", "deny", "needs_info"].includes(ai.verdict) ? ai.verdict : "needs_review";
  ai.confidence = Math.max(0, Math.min(1, Number(ai.confidence) || 0));
  ai.reasons = Array.isArray(ai.reasons) ? ai.reasons.slice(0, 6).map(String) : [];
  ai.flags = Array.isArray(ai.flags) ? ai.flags.slice(0, 6).map(String) : [];
  if (hist.photos_reused_from_other_claims) ai.flags.unshift(`Same photo was used on ${hist.photos_reused_from_other_claims} other claim(s)`);
  ai.history = hist; ai.at = new Date().toISOString();
  return patchClaim(c.id, { ai }, `AI review: ${ai.verdict} (${Math.round(ai.confidence * 100)}%) — ${ai.summary || ""}`);
}

/* ---------------- staff: list / approve / deny ---------------- */
async function list({ status = "pending", q = "", limit = 200 } = {}) {
  const where = [`type<>'edit'`], args = [];
  if (status === "open") where.push(`status IN ('pending','info_requested')`);
  else if (status === "edits") { where.length = 0; where.push(`type='edit'`); }
  else if (status) { args.push(status); where.push(`status=$${args.length}`); }
  if (q) { args.push(`%${String(q).toLowerCase()}%`); where.push(`(lower(number) LIKE $${args.length} OR lower(order_name) LIKE $${args.length} OR lower(email) LIKE $${args.length})`); }
  args.push(Math.min(Number(limit) || 200, 500));
  return (await db(`SELECT * FROM hd_claims WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT $${args.length}`, args)).rows.map(rowToClaim);
}
async function counts() {
  const r = (await db(`SELECT CASE WHEN type='edit' THEN 'edits' ELSE status END k, count(*)::int n FROM hd_claims GROUP BY 1`)).rows;
  const o = {}; for (const x of r) o[x.k] = x.n; o.open = (o.pending || 0) + (o.info_requested || 0); return o;
}
// Branded claim emails — wording from Email Studio (emails.js), look from the store's portal theme.
async function claimMail(kind, c, extra = {}) {
  const EM = require("./emails"), def = R().STORE_DEFS[c.store], s = await R().settings();
  const theme = await require("./returns-theme").published(c.store);
  return EM.render(kind, { copy: await EM.copyFor(c.store, kind), theme, def, base: R().portalUrl(c.store, s).replace(/\/returns\/\w+$/, ""), claim: c, extra });
}
async function emailCustomer(c, kind, extra, who) {
  const def = R().STORE_DEFS[c.store], m = await claimMail(kind, c, extra);
  if (c.ticket_id) { try { await core.sendReply({ ticketId: String(c.ticket_id), text: m.text, html: m.html, who }); return; } catch (e) { console.error("claim reply:", e.message); } }
  const r = await core.sendNewEmail({ mailbox: def.support, to: c.email, subject: m.subject, text: m.text, html: m.html, who, tags: ["claim"], name: c.customer_name });
  await patchClaim(c.id, { ticket_id: r.ticket_id });
}
async function approve(id, { resolution, amount, note } = {}, who) {
  const c = await getClaim(id); if (!c) throw httpError(404, "Claim not found");
  if (!["pending", "info_requested"].includes(c.status)) throw httpError(400, `This claim is already ${c.status}.`);
  const res = resolution || c.resolution;
  if (!RES_LABEL[res]) throw httpError(400, "Pick a resolution.");
  if (res === "refund" && (c.type === "pp" || c.has_pp)) throw httpError(400, "Orders with Package Protection get a replacement or store credit, not a refund.");
  const st = R().shopFor(c.store), def = R().STORE_DEFS[c.store];
  const amt = round2(amount != null && amount !== "" ? Number(amount) : c.value);
  if (res !== "replacement" && amt > round2(c.value) + 0.009) throw httpError(400, `The most this claim can pay is ${usd(c.value)} (the value of the claimed items).`);
  // Lock the claim so a double click or two people can't pay it twice.
  const locked = (await db(`UPDATE hd_claims SET status='processing', updated_at=now() WHERE id=$1 AND status IN ('pending','info_requested') RETURNING id`, [id])).rows[0];
  if (!locked) throw httpError(409, "Someone else is already deciding this claim. Refresh to see it.");
  let result, mail;
  try {
  if (res === "replacement") {
    const fresh = await loadOrder(c.store, c.order_id).catch(() => null);
    const low = fresh ? c.items.find((i) => { const l = fresh.lines.find((y) => y.id === i.id); return !l || !l.in_stock; }) : null;
    if (low) { await db(`UPDATE hd_claims SET status=$2 WHERE id=$1 AND status='processing'`, [id, c.status]); throw httpError(400, `${low.title} doesn't have enough stock for a replacement (needs more than ${(await R().settings()).replacement_min_stock}). Approve it as store credit instead.`); }
    const prep = await K().prepareReplacement({ order: c.order_name, items: c.items.map((i) => ({ sku: i.sku, title: i.title, quantity: i.quantity })), reason: `Claim ${c.number}${note ? ` — ${note}` : ""}` });
    if (prep.error || prep.note) throw httpError(400, prep.error || prep.note);
    const r = await K().createReplacementOrder(prep.st, { email: prep.email, shippingAddress: prep.shippingAddress, lineItems: prep.lineItems, origOrder: prep.node.name, reason: `Claim ${c.number}`,
      label: c.type === "pp" ? "Package Protection replacement" : "Defective item replacement", tag: c.type === "pp" ? "PP-replacement" : "defect-replacement" });
    result = { replacement_order: r.order_name, note: r.note };
    mail = { kind: "claim_approved_replacement", extra: { replacement_order: r.order_name, ship_to: prep.shipTo } };
  } else if (res === "store_credit") {
    if (!(amt > 0)) throw httpError(400, "Enter the credit amount.");
    let cid = c.customer_id; if (!cid) { const cu = await K().findCustomer(st, c.email); if (!cu) throw httpError(400, `No Shopify customer account for ${c.email}.`); cid = cu.id; }
    const r = await K().issueStoreCredit(st, cid, amt.toFixed(2), c.currency || "USD");
    result = { credit: amt, note: r.note };
    mail = { kind: "claim_approved_credit", extra: { amount: amt } };
  } else {
    if (!(amt > 0)) throw httpError(400, "Enter the refund amount.");
    // Full value → refund the claimed line items (marks them refunded, so they can't also be returned); a custom amount → that amount.
    const full = Math.abs(amt - round2(c.value)) < 0.01;
    const r = await K().refundOrder({ store: st.brand, id: c.order_id, name: c.order_name }, full
      ? { mode: "items", items: c.items.map((i) => ({ line_item_id: i.id, quantity: i.quantity })), restock: false, note: `Claim ${c.number}`, notify: false }
      : { mode: "amount", amount: amt, note: `Claim ${c.number}`, notify: false });
    result = { refund: r.amount, note: r.note };
    mail = { kind: "claim_approved_refund", extra: { amount: r.amount } };
  }
  } catch (e) { await db(`UPDATE hd_claims SET status=$2 WHERE id=$1 AND status='processing'`, [id, c.status]); throw e; }
  let mailNote = "Customer emailed";
  try { await emailCustomer(c, mail.kind, mail.extra, who); } catch (e) { mailNote = "Email to customer FAILED: " + e.message; }
  const out = await patchClaim(id, { status: "approved", resolved_with: res, resolved_amount: res === "replacement" ? c.value : (result.credit || result.refund), result, decided_by: who, decided_at: new Date().toISOString() },
    `Approved by ${who}: ${RES_LABEL[res]}${res !== "replacement" ? ` ${usd(result.credit || result.refund)}` : ""} — ${result.note}. ${mailNote}`);
  await core.audit({ ticketId: c.ticket_id || null, kind: "claim-approved", detail: `${c.number} · ${RES_LABEL[res]} · ${result.note}`, who, target: id }).catch(() => {});
  core.slackPost(`✅ Claim ${c.number} (${c.order_name}) approved by ${who} — ${RES_LABEL[res]}${res !== "replacement" ? ` ${usd(result.credit || result.refund)}` : ` → ${result.replacement_order || "new order"}`}`).catch(() => {});
  return out;
}
async function deny(id, { message } = {}, who) {
  const c = await getClaim(id); if (!c) throw httpError(404, "Claim not found");
  if (!["pending", "info_requested"].includes(c.status)) throw httpError(400, `This claim is already ${c.status}.`);
  const def = R().STORE_DEFS[c.store];
  const msg = String(message || "").trim();
  if (msg.length < 10) throw httpError(400, "Write a short note to the customer explaining why.");
  const locked = (await db(`UPDATE hd_claims SET status='processing', updated_at=now() WHERE id=$1 AND status IN ('pending','info_requested') RETURNING id`, [id])).rows[0];
  if (!locked) throw httpError(409, "Someone else is already deciding this claim. Refresh to see it.");
  try { await emailCustomer(c, "claim_denied", { message: msg }, who); }
  catch (e) { await db(`UPDATE hd_claims SET status=$2 WHERE id=$1 AND status='processing'`, [id, c.status]); throw e; }
  await core.audit({ ticketId: c.ticket_id || null, kind: "claim-denied", detail: `${c.number} · ${msg.slice(0, 200)}`, who, target: id }).catch(() => {});
  return patchClaim(id, { status: "denied", deny_message: msg, decided_by: who, decided_at: new Date().toISOString() }, `Denied by ${who}. Customer emailed.`);
}
async function askInfo(id, { message } = {}, who) {
  const c = await getClaim(id); if (!c) throw httpError(404, "Claim not found");
  if (!["pending", "info_requested"].includes(c.status)) throw httpError(400, `This claim is already ${c.status}.`);
  const def = R().STORE_DEFS[c.store];
  const msg = String(message || "").trim(); if (msg.length < 5) throw httpError(400, "Write the question for the customer.");
  await emailCustomer(c, "claim_question", { message: msg }, who);
  return patchClaim(id, { status: "info_requested" }, `${who} asked the customer: ${msg}`);
}
async function rerun(id) { const c = await getClaim(id); if (!c) throw httpError(404, "Claim not found"); return review(c); }
async function close(id, who) { const c = await getClaim(id); if (!c) throw httpError(404, "Claim not found"); if (!["pending", "info_requested"].includes(c.status)) throw httpError(400, `This claim is already ${c.status}.`); return patchClaim(id, { status: "closed", decided_by: who }, `Closed by ${who} (no action)`); }

async function init() { try { await migrate(); } catch (e) { console.error("claims migrate:", e.message); } }

module.exports = { poAnswer, deliveredAt, claimedQty, init, menu, editOptions, editSearch, editSubmit, editCancel, claimStart, savePhoto, getPhoto, claimSubmit, list, counts, getClaim, approve, deny, askInfo, rerun, close, review,
  _t: { gates, menuFor, loadOrder, TYPE_LABEL, SUBTYPE_LABEL, RES_LABEL } };
