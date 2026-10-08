/* =============================================================================================
 *  Portal options beyond a normal return — all reached from the same returns portal after the
 *  customer looks up their order:
 *
 *    • Edit order        address / name / size / add or remove items, within N minutes of purchase
 *                        and before it ships. Runs immediately (Shopify order edit). Extra cost →
 *                        Shopify emails a pay link; lower total → difference refunded.
 *    • Defective product photos + description → AI review (photos, history, timing) → staff approve
 *                        in Helpdesk → replacement, store credit, or refund (refund only without PP).
 *                        The customer keeps the item.
 *    • Package Protection claim   order must have PP. Live tracking decides when a claim can open
 *                        (stalled N days, or delivered 24h+ ago and not found). AI review → staff
 *                        approve → replacement or store credit (never a refund on PP).
 *    • Package not delivered   with PP → the PP claim; without PP → carrier claim guidance, no credit.
 *
 *  Nothing that moves money happens without a person clicking Approve in Helpdesk → Claims.
 * ============================================================================================= */
const crypto = require("crypto");
const core = require("./core");
const { db } = core;
const R = () => require("./returns");
const K = () => require("./emily").claimsKit();

const round2 = (n) => Math.round(Number(n) * 100) / 100;
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });
const fmtWhen = (d) => new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const usd = (n) => "$" + Number(n || 0).toFixed(2);

const TYPE_LABEL = { defective: "defective item claim", pp: "Package Protection claim", not_delivered: "not-delivered report", edit: "order edit" };
const SUBTYPE_LABEL = { not_arrived: "Package hasn't arrived", delivered_missing: "Marked delivered, but not received", damaged: "Package arrived damaged", missing_items: "Items missing from the package" };
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
    variant{ id availableForSale product{ id title variants(first:60){ nodes{ id title sku price availableForSale } } } } } }
  fulfillments(first:10){ createdAt deliveredAt displayStatus status events(first:3, sortKey: HAPPENED_AT, reverse:true){ nodes{ status happenedAt message city province } } trackingInfo{ number url company } fulfillmentLineItems(first:50){ nodes{ quantity lineItem{ id } } } } } }`;

async function loadOrder(key, orderId) {
  const st = R().shopFor(key), s = await R().settings();
  const o = (await R().gql(st, ORDER_Q, { id: orderId })).order;
  if (!o) throw httpError(404, "We couldn't find that order.");
  const all = o.lineItems.nodes.map((n) => ({
    id: n.id, title: n.title, variant: n.variantTitle, sku: n.sku, quantity: n.quantity, current: n.currentQuantity, unfulfilled: n.unfulfilledQuantity,
    fulfilled: Math.max(0, n.currentQuantity - n.unfulfilledQuantity), image: (n.image && n.image.url) || null,
    unit_price: Number(n.discountedUnitPriceAfterAllDiscountsSet.shopMoney.amount), full_price: Number(((n.originalUnitPriceSet || {}).shopMoney || {}).amount || n.discountedUnitPriceAfterAllDiscountsSet.shopMoney.amount), variant_id: n.variant && n.variant.id, in_stock: !!(n.variant && n.variant.availableForSale),
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
  return { st, s, key, o, lines, ppLines, has_pp: ppLines.length > 0, fulfillments, shipped_at: shippedAt,
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
function menuFor(c) {
  const s = c.s, fs = String(c.o.displayFulfillmentStatus || "").toUpperCase();
  const shipped = c.fulfillments.length > 0 || ["FULFILLED", "PARTIALLY_FULFILLED", "IN_PROGRESS"].includes(fs);
  const cancelled = !!c.o.cancelledAt;
  const editUntil = new Date(new Date(c.o.createdAt).getTime() + s.edit_window_minutes * 60000);
  const claimUntil = c.shipped_at ? new Date(new Date(c.shipped_at).getTime() + s.claim_window_days * 86400e3) : null;
  const closed = claimUntil && Date.now() > claimUntil.getTime();
  const notShipped = { ok: false, why: "Available once your order ships" };
  return {
    shipped, has_pp: c.has_pp,
    edit: cancelled ? { ok: false, why: "This order was cancelled" } : shipped ? { ok: false, why: "Your order has already shipped" }
      : Date.now() > editUntil.getTime() ? { ok: false, why: `Orders can be changed for ${s.edit_window_minutes} minutes after purchase` }
      : { ok: true, until: editUntil.toISOString() },
    defective: !shipped ? notShipped : closed ? { ok: false, why: `Claims are open for ${s.claim_window_days} days after shipping` } : { ok: true },
    pp: !c.has_pp ? { ok: false, why: "Your order doesn't include Package Protection" } : !shipped ? notShipped
      : closed ? { ok: false, why: `Claims are open for ${s.claim_window_days} days after shipping` } : { ok: true },
    not_delivered: !shipped ? { ok: false, why: "Your order hasn't shipped yet" } : { ok: true, has_pp: c.has_pp },
  };
}
async function menu(key, order) { return menuFor(await loadOrder(key, order.id)); }
function session(token) { const p = R().verify(token); return p; }

/* =============================================================================================
 *  EDIT ORDER
 * ============================================================================================= */
async function editable(token) {
  const p = session(token), c = await loadOrder(p.k, p.o), m = menuFor(c);
  if (!m.edit.ok) throw httpError(400, `${m.edit.why}, so it can't be changed here. Please email ${c.def.support} and we'll help.`);
  return { p, c, m };
}
async function editOptions(token) {
  const { c, m } = await editable(token);
  const a = c.o.shippingAddress || {};
  return {
    until: m.edit.until, currency: c.currency,
    address: { first_name: a.firstName || "", last_name: a.lastName || "", address1: a.address1 || "", address2: a.address2 || "", city: a.city || "", state: a.provinceCode || "", zip: a.zip || "", phone: a.phone || "" },
    lines: c.lines.filter((l) => l.unfulfilled > 0).map((l) => ({
      id: l.id, title: l.title, variant: l.variant, quantity: l.unfulfilled, unit_price: l.unit_price, image: l.image, variant_id: l.variant_id,
      sizes: l.product ? l.product.variants.map((v) => ({ id: v.id, title: v.title, price: Number(v.price), available: v.availableForSale })) : [],
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
  const p = session(token), c = await loadOrder(p.k, p.o), m = menuFor(c);
  // a few minutes' grace so someone who opened the editor in time isn't cut off mid-edit
  const grace = (c.s.edit_window_minutes + 5) * 60000;
  if (!m.edit.ok && !(m.edit.why && /minutes/.test(m.edit.why) && Date.now() - new Date(c.o.createdAt).getTime() < grace)) throw httpError(400, `${m.edit.why}. Please email ${c.def.support} and we'll help.`);
  const changes = [], adds = [], done = [], seen = new Set();
  for (const x of Array.isArray(body.lines) ? body.lines : []) {
    if (!x || seen.has(x.id)) continue; seen.add(x.id);
    const l = c.lines.find((y) => y.id === x.id); if (!l || l.unfulfilled < 1) continue;
    const qty = Math.max(0, Math.min(20, Math.floor(Number(x.quantity))));
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
    // Customer owes more → Shopify emails an invoice with a pay link. Customer owed money → refund it.
    const delta = round2(outstanding - startOutstanding);
    const notify = delta > 0.009;
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
  const known = delivered || !!ev || /IN_TRANSIT|OUT_FOR_DELIVERY|ATTEMPTED|READY_FOR_PICKUP|FAILURE|PICKED_UP/i.test(f.status || "");
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
      sources.shipstation = { ok: !l.not_in_system, delivered: !!l.delivered, delivered_at: l.delivered_at || null, last_at: l.last_event ? l.last_event.at : null, desc: l.description || "", where: l.last_event ? l.last_event.where : "", why: l.not_in_system ? "carrier has no scans yet" : null }; }
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
    const carrierDelivered = answered.some(([k, v]) => k !== "shopify" && v.delivered);
    const ts = (k) => answered.map(([, v]) => v[k]).filter(Boolean).map((x) => Date.parse(x)).filter((x) => !isNaN(x));
    const lastMs = Math.max(new Date(f.at).getTime(), ...ts("last_at"), ...ts("delivered_at"));
    const dMs = ts("delivered_at");
    const best = (sources.usps && sources.usps.ok && sources.usps) || (sources.shipstation.ok && sources.shipstation) || sources.shopify;
    out.push({ fi, number: t.number, url: t.url, carrier, shipped_at: f.at, delivered, carrier_delivered: carrierDelivered,
      delivered_at: dMs.length ? new Date(Math.max(...dMs)).toISOString() : null, status: delivered ? "Delivered" : best.desc || "In transit",
      last_event: { at: new Date(lastMs).toISOString(), desc: best.desc, where: best.where }, last_update_at: new Date(lastMs).toISOString(),
      verified, required: req, sources, agree: answered.every(([, v]) => v.delivered === delivered) });
  }
  return out;
}
const UNVERIFIED = "We couldn't confirm your tracking with every carrier source right now, so we can't open this claim yet. Please try again in a few hours, or email us and we'll check it by hand.";
function gates(c, ship) {
  const s = c.s, now = Date.now();
  const tracked = ship.filter((x) => x.number);
  const g = { damaged: { ok: true }, missing_items: { ok: true } };
  if (!ship.length) { g.not_arrived = g.delivered_missing = { ok: false, why: "Your order hasn't shipped yet." }; return g; }
  if (!tracked.length) { g.not_arrived = g.delivered_missing = { ok: false, why: "This order shipped without a tracking number, so we have to check it by hand. Please email us and we'll look into it right away." }; return g; }
  // "Hasn't arrived": no source anywhere may say delivered, every required source must answer, and nothing may have moved for N days.
  if (tracked.some((x) => x.delivered)) {
    const d = tracked.find((x) => x.delivered);
    g.not_arrived = { ok: false, why: `Tracking shows your package was delivered${d.delivered_at ? ` on ${fmtDate(d.delivered_at)}` : ""}. If you can't find it, choose "Marked delivered, but I didn't get it".` };
  } else if (tracked.some((x) => !x.verified)) g.not_arrived = { ok: false, why: UNVERIFIED };
  else {
    const newest = Math.max(...tracked.map((x) => new Date(x.last_update_at).getTime()));
    const days = (now - newest) / 86400e3;
    if (days < s.pp_stall_days) {
      const opens = new Date(newest + s.pp_stall_days * 86400e3), x = tracked[0];
      g.not_arrived = { ok: false, why: `Your package is still moving. Last update ${fmtWhen(newest)}${x.last_event && x.last_event.desc ? `: ${x.last_event.desc}` : ""}. If tracking doesn't change by ${fmtDate(opens)}, come back and file your claim here.`, opens: opens.toISOString() };
    } else g.not_arrived = { ok: true, rule: true, note: `Verified with ${srcList(tracked[0].required)}: no movement in ${Math.floor(days)} days.` };
  }
  // "Marked delivered": a CARRIER source (ShipStation or USPS) must confirm delivery, all required sources answered, and the wait has passed.
  const dl = tracked.filter((x) => x.delivered);
  if (!dl.length) g.delivered_missing = { ok: false, why: `Tracking doesn't show your package as delivered yet. Choose "My package hasn't arrived" instead.` };
  else if (dl.some((x) => !x.verified) || !dl.some((x) => x.carrier_delivered)) g.delivered_missing = { ok: false, why: UNVERIFIED };
  else {
    const at = Math.max(...dl.map((x) => new Date(x.delivered_at || x.last_update_at).getTime()));
    if (now - at < s.delivered_wait_hours * 3600e3) {
      const open = new Date(at + s.delivered_wait_hours * 3600e3);
      g.delivered_missing = { ok: false, why: `Carriers sometimes mark a package delivered a little early. Please give it until ${fmtWhen(open)} and check your mailbox, around your home, and with neighbors. If it still hasn't turned up, come back and file your claim.`, opens: open.toISOString() };
    } else g.delivered_missing = { ok: true, rule: true, note: `Delivery confirmed by ${srcList(dl[0].required)} on ${fmtWhen(at)}.` };
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
function resolutionsFor(type, c) { return type === "defective" ? ["replacement", "store_credit", ...(c.has_pp ? [] : ["refund"])] : ["replacement", "store_credit"]; }

async function claimStart(token, type) {
  const p = session(token), c = await loadOrder(p.k, p.o), m = menuFor(c);
  if (!["defective", "pp", "not_delivered"].includes(type)) throw httpError(400, "Pick an option.");
  if (type === "not_delivered" && !m.not_delivered.ok) throw httpError(400, m.not_delivered.why);
  const open = (await db(`SELECT number, type FROM hd_claims WHERE order_name=$1 AND status IN ('pending','info_requested') AND type=$2 ORDER BY created_at DESC LIMIT 1`, [c.o.name, type === "defective" ? "defective" : "pp"])).rows[0];
  if (type === "defective") {
    if (!m.defective.ok) throw httpError(400, m.defective.why);
    return { type, has_pp: c.has_pp, items: claimItems(c, type, await usedQty(c)), resolutions: resolutionsFor(type, c), open_claim: open ? open.number : null, currency: c.currency };
  }
  const ship = await trackingFor(c);
  if (type === "not_delivered" && !c.has_pp) {
    const carrier = (ship[0] && ship[0].carrier) || "USPS";
    const seenRecently = (await db(`SELECT 1 FROM hd_claims WHERE order_name=$1 AND type='not_delivered' AND created_at > now() - interval '1 day'`, [c.o.name])).rows.length;
    if (!seenRecently) await putClaim({ id: crypto.randomUUID(), number: `${c.o.name.replace(/^#/, "")}-N${Date.now().toString(36).slice(-4).toUpperCase()}`, store: p.k, type: "not_delivered", status: "info",
      order_name: c.o.name, email: c.o.email || p.e, ticket_id: null, has_pp: false, tracking: ship, source: "portal" }, "Not-delivered report without Package Protection — shown carrier claim steps").catch(() => {});
    return { type, has_pp: false, shipments: ship, carrier_links: CARRIER_CLAIMS[carrier] || CARRIER_CLAIMS.USPS, carrier, support: c.def.support };
  }
  if (!m.pp.ok) throw httpError(400, m.pp.why);
  const avail = claimItems(c, "pp", await claimedQty(c.o.name));
  return { type: "pp", has_pp: true, shipments: ship, gates: gates(c, ship), items: avail, shipment_items: { not_arrived: shipmentItems(c, ship, "not_arrived", avail).map((i) => ({ id: i.id, quantity: i.quantity })), delivered_missing: shipmentItems(c, ship, "delivered_missing", avail).map((i) => ({ id: i.id, quantity: i.quantity })) }, resolutions: resolutionsFor("pp", c), open_claim: open ? open.number : null, currency: c.currency, stall_days: c.s.pp_stall_days };
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
  const p = session(token), c = await loadOrder(p.k, p.o), m = menuFor(c);
  const type = body.type === "defective" ? "defective" : "pp";
  if (type === "defective" ? !m.defective.ok : !m.pp.ok) throw httpError(400, (type === "defective" ? m.defective : m.pp).why);
  const open = (await db(`SELECT number FROM hd_claims WHERE order_name=$1 AND status IN ('pending','info_requested') AND type=$2`, [c.o.name, type])).rows[0];
  if (open) throw httpError(400, `You already have a claim open for this order (${open.number}). We'll email you as soon as it's reviewed.`);
  const resolution = String(body.resolution || "");
  if (resolution === "refund" && c.has_pp) throw httpError(400, "Orders with Package Protection can choose a replacement or store credit.");
  if (!resolutionsFor(type, c).includes(resolution)) throw httpError(400, "Pick how you'd like us to make it right.");
  const description = String(body.description || "").trim().slice(0, 2000);
  let subtype = null, gate = null, ship = null;
  if (type === "pp") {
    subtype = String(body.subtype || "");
    if (!SUBTYPE_LABEL[subtype]) throw httpError(400, "Tell us what happened to the package.");
    ship = await trackingFor(c); gate = gates(c, ship)[subtype];
    if (!gate.ok) throw httpError(400, gate.why);
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
  if (resolution === "replacement" && items.some((i) => !i.in_stock)) throw httpError(400, `${items.find((i) => !i.in_stock).title} is out of stock right now, so we can't send a replacement. Please choose ${type === "defective" && !c.has_pp ? "store credit or a refund" : "store credit"}.`);
  const value = round2(items.reduce((t, i) => t + i.unit_price * i.quantity, 0));
  const n = (await db(`SELECT count(*)::int n FROM hd_claims WHERE order_name=$1 AND type IN ('defective','pp')`, [c.o.name])).rows[0].n;
  const a = c.o.shippingAddress || {};
  let claim; try { claim = await putClaim({
    id: crypto.randomUUID(), number: `${c.o.name.replace(/^#/, "")}-C${n + 1}`, store: p.k, type, status: "pending", order_name: c.o.name, email: c.o.email || p.e, ticket_id: null,
    order_id: c.o.id, customer_id: c.o.customer ? c.o.customer.id : null, customer_name: [a.firstName, a.lastName].filter(Boolean).join(" ") || a.name || "", currency: c.currency,
    has_pp: c.has_pp, subtype, items: items.map(({ max, image, ...i }) => ({ ...i, image })), description, photos, resolution, value, amount: value,
    gate: gate ? { rule: !!gate.rule, note: gate.note || "" } : null, tracking: ship, order_created_at: c.o.createdAt, shipped_at: c.shipped_at, source: "portal",
  }, `Claim submitted by the customer: ${type === "pp" ? SUBTYPE_LABEL[subtype] : "defective item"} · wants ${RES_LABEL[resolution]} · ${usd(value)}`); }
  catch (e) { if (e.code === "23505") throw httpError(400, "You already have a claim open for this order. We'll email you as soon as it's reviewed."); throw e; }
  if (photos.length) await db(`UPDATE hd_claim_photos SET claim_id=$1 WHERE id = ANY($2)`, [claim.id, photos]);
  // Background: confirmation email (opens a Helpdesk ticket), AI review, Slack.
  setImmediate(() => afterSubmit(claim.id).catch((e) => console.error("claim after-submit:", e.message)));
  return { number: claim.number, type, resolution, value, email: claim.email };
}

function firstName(c) { return String(c.customer_name || "").split(" ")[0] || "there"; }
function itemsText(c) { return c.items.map((i) => `• ${i.quantity}× ${i.title}${i.variant ? ` (${i.variant})` : ""}`).join("\n"); }
async function afterSubmit(id) {
  let c = await getClaim(id); if (!c) return;
  const def = R().STORE_DEFS[c.store];
  try {
    const what = c.type === "pp" ? `Package Protection claim (${SUBTYPE_LABEL[c.subtype].toLowerCase()})` : "defective item claim";
    const text = `Hi ${firstName(c)},\n\nWe received your ${what} for order ${c.order_name}. Your claim number is ${c.number}.\n\nItems:\n${itemsText(c)}\n\nYou asked for: ${RES_LABEL[c.resolution]}.\n\nOur team reviews claims within 1 business day and will email you here with the result. If you have more photos or details, just reply to this email.\n\n— The ${def.name} Team`;
    const r = await core.sendNewEmail({ mailbox: def.support, to: c.email, subject: `Your claim ${c.number} for order ${c.order_name}`, text, who: "Returns portal", tags: ["claim", `claim-${c.type}`], name: c.customer_name });
    c = await patchClaim(id, { ticket_id: r.ticket_id }, "Confirmation emailed to the customer");
  } catch (e) { c = await patchClaim(id, {}, "Confirmation email failed: " + e.message); }
  try { c = await review(c); } catch (e) { c = await patchClaim(id, { ai: { verdict: "needs_review", summary: "AI review failed: " + e.message, reasons: [], flags: [] } }, "AI review failed: " + e.message); }
  if (c.ticket_id) core.addNote({ ticketId: String(c.ticket_id), text: `🧾 Claim ${c.number} — ${TYPE_LABEL[c.type]}${c.subtype ? ` (${SUBTYPE_LABEL[c.subtype]})` : ""}\nWants: ${RES_LABEL[c.resolution]} · ${usd(c.value)}\nAI: ${c.ai ? `${c.ai.verdict} (${Math.round((c.ai.confidence || 0) * 100)}%) — ${c.ai.summary}` : "—"}\nApprove or deny in Helpdesk → Claims.`, who: "Returns portal" }).catch(() => {});
  core.slackPost(`🧾 New ${TYPE_LABEL[c.type]} ${c.number} — ${c.order_name} (${def.name}) · wants ${RES_LABEL[c.resolution]} ${usd(c.value)} · AI: ${c.ai ? `*${c.ai.verdict}* — ${c.ai.summary}` : "—"} · approve in Helpdesk → Claims`).catch(() => {});
}

/* ---------------- AI review ---------------- */
async function historyFor(c) {
  const email = String(c.email || "").toLowerCase();
  const claims = (await db(`SELECT number, type, status, created_at, data->>'value' AS value FROM hd_claims WHERE lower(email)=$1 AND id<>$2 AND type IN ('defective','pp') ORDER BY created_at DESC LIMIT 20`, [email, c.id])).rows;
  const returns = (await db(`SELECT count(*)::int n FROM hd_returns WHERE lower(email)=$1 AND status<>'cancelled'`, [email]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
  let hist = null; try { hist = await K().customerHistory(email); } catch (_) {}
  const reused = c.photos && c.photos.length ? (await db(`SELECT DISTINCT p2.claim_id FROM hd_claim_photos p1 JOIN hd_claim_photos p2 ON p1.sha=p2.sha AND p2.claim_id IS NOT NULL AND p2.claim_id<>p1.claim_id WHERE p1.claim_id=$1`, [c.id])).rows.map((r) => r.claim_id) : [];
  return {
    previous_claims: claims.map((x) => ({ number: x.number, type: x.type, status: x.status, when: x.created_at, value: Number(x.value) || 0 })),
    previous_returns: returns, photos_reused_from_other_claims: reused.length,
    tickets: hist && hist.tickets ? hist.tickets.length : null, store_credits_given: hist ? hist.goodwill_credits_given : null, replacements_given: hist ? hist.replacements_given : null,
    lifetime_orders: hist && hist.shopify ? hist.shopify.lifetime_orders : null, lifetime_spent: hist && hist.shopify ? hist.shopify.lifetime_spent : null,
  };
}
const REVIEW_SYS = `You review customer claims for a baby clothing store (Larkspur Baby). Staff will make the final decision; your job is a careful first read.
Claim types:
- defective: the customer says an item is defective (holes, broken snaps/zippers, seams coming apart, stains from the factory, misprints). They keep the item. Approve when the photos clearly show a manufacturing defect on the claimed item that matches the description. Be suspicious of: photos that don't show the item or the defect, stock/catalog/screenshot images, wear and tear or damage from use/washing long after delivery, a defect inconsistent with the description, photos reused from another claim, and customers with many previous claims or returns relative to their orders.
- pp (Package Protection): lost, stalled, marked delivered but not received, damaged in transit, or items missing. Check the tracking facts. A package whose tracking hasn't moved for the stall threshold, or that was marked delivered over 24h ago and the customer can't find it, normally qualifies — unless the customer's history suggests a pattern. Damaged claims need photos showing transit damage. Missing items: consider whether the claim is plausible.
Reply with ONLY a JSON object, no prose: {"verdict":"approve"|"deny"|"needs_info","confidence":0.0-1.0,"summary":"one sentence for staff","reasons":["..."],"flags":["risk signals, empty if none"],"photo_findings":"what the photos show, or empty","ask_customer":"if needs_info, the question to ask the customer, else empty"}`;
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
    policy_check: c.gate ? c.gate.note : null, stall_threshold_days: (await R().settings()).pp_stall_days, customer_history: hist,
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
async function emailCustomer(c, subject, text, who) {
  const def = R().STORE_DEFS[c.store];
  if (c.ticket_id) { try { await core.sendReply({ ticketId: String(c.ticket_id), text, who }); return; } catch (e) { console.error("claim reply:", e.message); } }
  const r = await core.sendNewEmail({ mailbox: def.support, to: c.email, subject, text, who, tags: ["claim"], name: c.customer_name });
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
  let result, custText;
  try {
  if (res === "replacement") {
    const prep = await K().prepareReplacement({ order: c.order_name, items: c.items.map((i) => ({ sku: i.sku, title: i.title, quantity: i.quantity })), reason: `Claim ${c.number}${note ? ` — ${note}` : ""}` });
    if (prep.error || prep.note) throw httpError(400, prep.error || prep.note);
    const r = await K().createReplacementOrder(prep.st, { email: prep.email, shippingAddress: prep.shippingAddress, lineItems: prep.lineItems, origOrder: prep.node.name, reason: `Claim ${c.number}`,
      label: c.type === "pp" ? "Package Protection replacement" : "Defective item replacement", tag: c.type === "pp" ? "PP-replacement" : "defect-replacement" });
    result = { replacement_order: r.order_name, note: r.note };
    custText = `Good news — your claim ${c.number} was approved.\n\nWe've created a replacement order${r.order_name ? ` (${r.order_name})` : ""} at no charge:\n${itemsText(c)}\n\nIt ships to ${prep.shipTo}. You'll get a shipping confirmation with tracking as soon as it's on its way.`;
  } else if (res === "store_credit") {
    if (!(amt > 0)) throw httpError(400, "Enter the credit amount.");
    let cid = c.customer_id; if (!cid) { const cu = await K().findCustomer(st, c.email); if (!cu) throw httpError(400, `No Shopify customer account for ${c.email}.`); cid = cu.id; }
    const r = await K().issueStoreCredit(st, cid, amt.toFixed(2), c.currency || "USD");
    result = { credit: amt, note: r.note };
    custText = `Good news — your claim ${c.number} was approved.\n\nWe've added ${usd(amt)} in store credit to your ${def.name} account (${c.email}). It applies automatically at checkout when you're signed in with this email.`;
  } else {
    if (!(amt > 0)) throw httpError(400, "Enter the refund amount.");
    // Full value → refund the claimed line items (marks them refunded, so they can't also be returned); a custom amount → that amount.
    const full = Math.abs(amt - round2(c.value)) < 0.01;
    const r = await K().refundOrder({ store: st.brand, id: c.order_id, name: c.order_name }, full
      ? { mode: "items", items: c.items.map((i) => ({ line_item_id: i.id, quantity: i.quantity })), restock: false, note: `Claim ${c.number}`, notify: false }
      : { mode: "amount", amount: amt, note: `Claim ${c.number}`, notify: false });
    result = { refund: r.amount, note: r.note };
    custText = `Good news — your claim ${c.number} was approved.\n\nWe've refunded ${usd(r.amount)} to your original payment method. Depending on your bank it can take 5–10 business days to show up.`;
  }
  } catch (e) { await db(`UPDATE hd_claims SET status=$2 WHERE id=$1 AND status='processing'`, [id, c.status]); throw e; }
  const text = `Hi ${firstName(c)},\n\n${custText}${c.type === "defective" ? "\n\nThere's no need to send the item back." : ""}\n\nThank you for your patience, and sorry for the trouble.\n\n— The ${def.name} Team`;
  let mailNote = "Customer emailed";
  try { await emailCustomer(c, `Your claim ${c.number} was approved`, text, who); } catch (e) { mailNote = "Email to customer FAILED: " + e.message; }
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
  try { await emailCustomer(c, `About your claim ${c.number}`, `Hi ${firstName(c)},\n\nThank you for your patience while we reviewed claim ${c.number} for order ${c.order_name}.\n\n${msg}\n\n— The ${def.name} Team`, who); }
  catch (e) { await db(`UPDATE hd_claims SET status=$2 WHERE id=$1 AND status='processing'`, [id, c.status]); throw e; }
  await core.audit({ ticketId: c.ticket_id || null, kind: "claim-denied", detail: `${c.number} · ${msg.slice(0, 200)}`, who, target: id }).catch(() => {});
  return patchClaim(id, { status: "denied", deny_message: msg, decided_by: who, decided_at: new Date().toISOString() }, `Denied by ${who}. Customer emailed.`);
}
async function askInfo(id, { message } = {}, who) {
  const c = await getClaim(id); if (!c) throw httpError(404, "Claim not found");
  if (!["pending", "info_requested"].includes(c.status)) throw httpError(400, `This claim is already ${c.status}.`);
  const def = R().STORE_DEFS[c.store];
  const msg = String(message || "").trim(); if (msg.length < 5) throw httpError(400, "Write the question for the customer.");
  await emailCustomer(c, `A quick question about claim ${c.number}`, `Hi ${firstName(c)},\n\nWe're reviewing claim ${c.number} for order ${c.order_name}. ${msg}\n\nJust reply to this email (photos are welcome).\n\n— The ${def.name} Team`, who);
  return patchClaim(id, { status: "info_requested" }, `${who} asked the customer: ${msg}`);
}
async function rerun(id) { const c = await getClaim(id); if (!c) throw httpError(404, "Claim not found"); return review(c); }
async function close(id, who) { const c = await getClaim(id); if (!c) throw httpError(404, "Claim not found"); if (!["pending", "info_requested"].includes(c.status)) throw httpError(400, `This claim is already ${c.status}.`); return patchClaim(id, { status: "closed", decided_by: who }, `Closed by ${who} (no action)`); }

async function init() { try { await migrate(); } catch (e) { console.error("claims migrate:", e.message); } }

module.exports = { claimedQty, init, menu, editOptions, editSearch, editSubmit, claimStart, savePhoto, getPhoto, claimSubmit, list, counts, getClaim, approve, deny, askInfo, rerun, close, review,
  _t: { gates, menuFor, loadOrder, TYPE_LABEL, SUBTYPE_LABEL, RES_LABEL } };
