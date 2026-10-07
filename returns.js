/**
 * Returns — Helpdesk's own returns system (replaces Loop).
 *
 *  Customer portal  /returns/lb  and  /returns/lbo   (public, no login)
 *  Helpdesk         "Returns" view + "Start return" on an order  (staff)
 *  Emily            return_propose tool → staged for approval → label attached to the reply
 *
 * Flow: find order → pick items + reason → refund method (original payment, or store credit + bonus)
 *       → Shopify return created → ShipStation return label bought → label emailed by Shopify
 *       → tracking checked hourly → delivered to us → refund issued automatically (label fee deducted).
 *
 * Uses Emily's existing keys: SHOPIFY_STORES (both stores' apps) and SHIPSTATION_V2_KEY.
 * Settings (window, fee, bonus, return address, carrier…) live in Helpdesk → Returns → Settings.
 */
const crypto = require("crypto");
const core = require("./core");
const { db, pool } = core;

const SHOP_VER = process.env.RETURNS_SHOPIFY_VERSION || "2026-07";
const SS_KEY = process.env.SHIPSTATION_V2_KEY || "";
const SS_BASE = "https://api.shipstation.com";
const SECRET = process.env.RETURNS_SECRET || process.env.CONSOLE_KEY || process.env.ATTACHMENT_SECRET || crypto.randomBytes(32).toString("hex");
const PUBLIC_URL = () => (process.env.PUBLIC_URL || "https://emily-console-production.up.railway.app").replace(/\/$/, "");

const emily = () => require("./emily");   // lazy: emily.js also requires this file
const round2 = (n) => Math.round(Number(n) * 100) / 100;
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

/* ---------------- stores ---------------- */
const STORE_DEFS = {
  lb: { key: "lb", prefix: "LB", name: "Larkspur Baby", support: core.BRAND_MAILBOX.larkspur, shopUrl: "https://larkspurbaby.com" },
  lbo: { key: "lbo", prefix: "LBO", name: "Larkspur Baby Outlet", support: core.BRAND_MAILBOX.outlet, shopUrl: "https://larkspurbabyoutlet.com" },
};
function shopFor(key) {
  const def = STORE_DEFS[key];
  if (!def) throw httpError(404, "Unknown store");
  const st = emily().storeForPrefix(def.prefix);
  if (!st) throw httpError(500, `${def.name} isn't set up in SHOPIFY_STORES`);
  return st;
}
function keyForOrderName(name) {
  const p = String(name || "").replace(/^#/, "").toUpperCase();
  if (p.startsWith("LBO")) return "lbo";
  if (p.startsWith("LB")) return "lb";
  return null;
}

/* ---------------- settings (editable in Helpdesk → Returns → Settings) ---------------- */
const DEFAULTS = {
  portal_live: false,              // when on, Emily sends customers to this portal instead of Loop
  window_days: { lb: 7, lbo: 7 },
  label_fee: 7.95,
  store_credit_enabled: true,
  store_credit_bonus_pct: 15,
  fee_on_store_credit: true,
  auto_refund: true,
  final_sale_tags: "final-sale, final sale, no-returns",
  carrier_id: "",
  service_code: "usps_ground_advantage",
  default_item_oz: 8,
  packaging_oz: 4,
  void_unused_after_days: 28,
  test_labels: true,
  return_address: {
    name: "Returns Dept", company_name: "Larkspur Baby", phone: "",
    address_line1: "701 E Plano Pkwy", address_line2: "Suite 103", city_locality: "Plano", state_province: "TX", postal_code: "75074", country_code: "US",
  },
};
async function settings() {
  const s = (await core.setting("returns", null)) || {};
  return { ...DEFAULTS, ...s, window_days: { ...DEFAULTS.window_days, ...(s.window_days || {}) }, return_address: { ...DEFAULTS.return_address, ...(s.return_address || {}) } };
}
async function saveSettings(patch, who) {
  const cur = await settings();
  const next = { ...cur, ...patch, window_days: { ...cur.window_days, ...(patch.window_days || {}) }, return_address: { ...cur.return_address, ...(patch.return_address || {}) } };
  for (const k of ["label_fee", "store_credit_bonus_pct", "default_item_oz", "packaging_oz", "void_unused_after_days"]) next[k] = Number(next[k]) || 0;
  for (const k of Object.keys(next.window_days)) next.window_days[k] = Number(next.window_days[k]) || 0;
  await db(`INSERT INTO emily_settings (key, value, updated_by, updated_at) VALUES ('returns', $1, $2, now())
            ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=now()`, [JSON.stringify(next), who || null]);
  await core.audit({ kind: "returns-settings", detail: "Returns settings changed", who: who || "system" });
  return next;
}
function setupProblems(s) {
  const p = [];
  if (!SS_KEY) p.push("SHIPSTATION_V2_KEY is not set on the emily-console service");
  if (!s.return_address.phone) p.push("Return address needs a phone number (Returns → Settings)");
  if (!s.carrier_id) p.push("Pick a ShipStation carrier (Returns → Settings)");
  for (const k of Object.keys(STORE_DEFS)) { try { shopFor(k); } catch (e) { p.push(e.message); } }
  return p;
}

/* ---------------- Shopify (uses Emily's store apps/tokens) ---------------- */
async function gql(st, query, variables = {}) {
  const token = await emily().storeToken(st);
  const res = await fetch(`https://${st.domain}/admin/api/${SHOP_VER}/graphql.json`, {
    method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }),
  });
  const j = await res.json();
  if (j.errors) {
    const errs = Array.isArray(j.errors) ? j.errors : [{ message: String(j.errors) }];
    console.error(`returns Shopify error (${st.brand}):`, JSON.stringify(errs).slice(0, 500));
    const denied = errs.some((e) => /access denied|access scope/i.test(e.message || "") || (e.extensions && e.extensions.code === "ACCESS_DENIED"));
    // Staff see the plain cause; the customer portal turns any of these into a friendly message (see `staff` below).
    const err = new Error(denied
      ? `${st.brand}: the Emily Shopify app is missing permissions returns need. Add these Admin API scopes to the app: ${RETURN_SCOPES.join(", ")} — then restart Helpdesk.`
      : `${st.brand}: Shopify error — ${errs.map((e) => e.message).join("; ").slice(0, 200)}`);
    err.staff = true;
    throw err;
  }
  return j.data;
}
// Every Admin API scope the returns system uses (read + write).
const RETURN_SCOPES = ["read_orders", "read_customers", "read_products", "read_inventory", "read_returns", "write_returns",
  "read_merchant_managed_fulfillment_orders", "read_assigned_fulfillment_orders", "read_third_party_fulfillment_orders",
  "read_store_credit_account_transactions", "write_store_credit_account_transactions"];
// The label comes from where the order was shipped. Local-pickup orders have no shipping address,
// so fall back to the billing address, then the customer's saved address.
const hasStreet = (x) => x && x.address1 && x.zip;
function labelAddress(o) {
  const c = o.customer && o.customer.defaultAddress;
  const a = [o.shippingAddress, o.billingAddress, c].find(hasStreet) || null;
  if (a && !a.phone) a.phone = [o.shippingAddress, o.billingAddress, c].map((x) => x && x.phone).find(Boolean) || "";
  return a;
}
function userErrors(payload, label) { const e = (payload && payload.userErrors) || []; if (e.length) throw new Error(`${label}: ${e.map((x) => x.message).join("; ")}`); }

const ORDER_LOOKUP = `query OrderLookup($q: String!) { orders(first: 5, query: $q) { nodes {
  id name email createdAt cancelledAt currencyCode
  customer { id firstName lastName defaultEmailAddress { emailAddress } defaultAddress { name company address1 address2 city provinceCode zip countryCodeV2 phone } }
  shippingAddress { name company address1 address2 city provinceCode zip countryCodeV2 phone } billingAddress { name company address1 address2 city provinceCode zip countryCodeV2 phone } } } }`;
const RETURNABLE = `query Returnable($orderId: ID!) { returnableFulfillments(orderId: $orderId, first: 20) { nodes {
  id fulfillment { id createdAt deliveredAt }
  returnableFulfillmentLineItems(first: 100) { nodes { quantity fulfillmentLineItem { id lineItem {
    id title variantTitle sku quantity image { url(transform: { maxWidth: 200 }) } product { tags }
    variant { inventoryItem { measurement { weight { value unit } } } }
    discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount currencyCode } } } } } } } } }`;
const REASONS = `query Reasons { returnReasonDefinitions(first: 100) { nodes { id handle name deleted } } }`;
const RETURN_CREATE = `mutation ReturnCreate($input: ReturnInput!) { returnCreate(returnInput: $input) { return { id name status } userErrors { field message } } }`;
const RETURN_DETAIL = `query R($id: ID!) { return(id: $id) { id status order { id customer { id } }
  returnLineItems(first: 100) { nodes { id quantity ... on ReturnLineItem { fulfillmentLineItem { id lineItem { id } } } } }
  reverseFulfillmentOrders(first: 5) { nodes { id lineItems(first: 100) { nodes { id totalQuantity fulfillmentLineItem { id } } } } } } }`;
const REVERSE_DELIVERY = `mutation RD($rfo: ID!, $url: URL!, $num: String!, $turl: URL) {
  reverseDeliveryCreateWithShipping(reverseFulfillmentOrderId: $rfo, reverseDeliveryLineItems: [], notifyCustomer: true,
    labelInput: { fileUrl: $url }, trackingInput: { number: $num, url: $turl }) { reverseDelivery { id } userErrors { field message } } }`;
const SUGGEST = `query S($id: ID!, $items: [SuggestedOutcomeReturnLineItemInput!]!) { return(id: $id) {
  suggestedFinancialOutcome(returnLineItems: $items, exchangeLineItems: [], refundMethodAllocation: ORIGINAL_PAYMENT_METHODS) {
    discountedSubtotal { shopMoney { amount currencyCode } }
    financialTransfer { ... on RefundReturnOutcome { amount { shopMoney { amount currencyCode } }
      suggestedTransactions { gateway parentTransaction { id } amountSet { shopMoney { amount currencyCode } } maximumRefundableSet { shopMoney { amount } } } } } } } }`;
const PROCESS = `mutation P($input: ReturnProcessInput!, $key: String!) { returnProcess(input: $input) @idempotent(key: $key) { return { id status } userErrors { field message code } } }`;
const CREDIT = `mutation C($id: ID!, $input: StoreCreditAccountCreditInput!, $key: String!) { storeCreditAccountCredit(id: $id, creditInput: $input) @idempotent(key: $key) {
  storeCreditAccountTransaction { amount { amount } } userErrors { field message } } }`;
const CANCEL = `mutation Cancel($id: ID!) { returnCancel(id: $id) { return { id status } userErrors { field message } } }`;

const toOz = (v, u) => ({ OUNCES: v, POUNDS: v * 16, GRAMS: v / 28.3495, KILOGRAMS: (v * 1000) / 28.3495 }[String(u).toUpperCase()] ?? v);

async function findOrder(st, def, orderNumber, email) {
  const raw = String(orderNumber || "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (!raw) return null;
  const name = /^\d+$/.test(raw) ? def.prefix + raw : raw;
  const d = await gql(st, ORDER_LOOKUP, { q: `name:${name}` });
  const want = String(email || "").trim().toLowerCase();
  return d.orders.nodes.find((o) => {
    if (o.name.replace(/^#/, "").toUpperCase() !== name) return false;
    if (email === null) return true;   // staff lookup — no email check
    const emails = [o.email, o.customer && o.customer.defaultEmailAddress && o.customer.defaultEmailAddress.emailAddress].filter(Boolean).map((e) => e.toLowerCase());
    return emails.includes(want);
  }) || null;
}
async function returnableItems(st, orderId) {
  const d = await gql(st, RETURNABLE, { orderId });
  const out = [];
  for (const rf of d.returnableFulfillments.nodes) for (const n of rf.returnableFulfillmentLineItems.nodes) {
    const li = n.fulfillmentLineItem.lineItem, w = li.variant && li.variant.inventoryItem && li.variant.inventoryItem.measurement && li.variant.inventoryItem.measurement.weight;
    out.push({
      fulfillmentLineItemId: n.fulfillmentLineItem.id, lineItemId: li.id, title: li.title, variantTitle: li.variantTitle, sku: li.sku,
      image: (li.image && li.image.url) || null, returnableQty: n.quantity,
      unitPrice: Number(li.discountedUnitPriceAfterAllDiscountsSet.shopMoney.amount), currency: li.discountedUnitPriceAfterAllDiscountsSet.shopMoney.currencyCode,
      tags: ((li.product && li.product.tags) || []).map((t) => t.toLowerCase()), weightOz: w ? toOz(w.value, w.unit) : null,
      deliveredAt: rf.fulfillment.deliveredAt || null, fulfilledAt: rf.fulfillment.createdAt,
    });
  }
  return out;
}
const reasonCache = new Map();
async function reasons(st) {
  const c = reasonCache.get(st.domain);
  if (c && c.at > Date.now() - 6 * 3600e3) return c.list;
  const d = await gql(st, REASONS);
  const list = d.returnReasonDefinitions.nodes.filter((r) => !r.deleted).map((r) => ({ id: r.id, name: r.name }));
  reasonCache.set(st.domain, { at: Date.now(), list });
  return list;
}
function eligibility(item, s, key) {
  const finalTags = String(s.final_sale_tags || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (item.tags.some((t) => finalTags.includes(t))) return { ok: false, why: "Final sale" };
  const days = s.window_days[key] || 7;
  const deadline = new Date(new Date(item.deliveredAt || item.fulfilledAt).getTime() + days * 86400e3);
  if (Date.now() > deadline.getTime()) return { ok: false, why: `Return window closed ${deadline.toLocaleDateString("en-US", { month: "short", day: "numeric" })}` };
  return { ok: true, deadline: deadline.toISOString() };
}

/* ---------------- ShipStation v2 ---------------- */
async function ss(method, p, body) {
  if (!SS_KEY) throw new Error("SHIPSTATION_V2_KEY not set");
  const r = await fetch(SS_BASE + p, { method, headers: { "API-Key": SS_KEY, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = {}; try { j = t ? JSON.parse(t) : {}; } catch { j = { raw: t }; }
  if (!r.ok) throw new Error(`ShipStation ${r.status}: ${(j.errors && j.errors.map((e) => e.message).join("; ")) || t.slice(0, 300)}`);
  return j;
}
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));
async function buyLabel(s, from, weightOz, rma) {
  const shipment = { service_code: s.service_code, ship_from: clean(from), ship_to: clean({ ...s.return_address, address_residential_indicator: "no" }), packages: [{ weight: { value: Math.max(1, Math.round(weightOz)), unit: "ounce" } }] };
  if (s.carrier_id) shipment.carrier_id = s.carrier_id;
  const l = await ss("POST", "/v2/labels", { is_return_label: true, rma_number: rma, charge_event: "carrier_default", label_format: "pdf", label_layout: "4x6", label_download_type: "url", shipment });
  return { labelId: l.label_id, trackingNumber: l.tracking_number, labelUrl: (l.label_download && (l.label_download.pdf || l.label_download.href)) || null, cost: l.shipment_cost ? l.shipment_cost.amount : null, carrier: l.carrier_code };
}
async function track(labelId) { const t = await ss("GET", `/v2/labels/${encodeURIComponent(labelId)}/track`); return { code: t.status_code || "UN", text: t.status_description || "" }; }
async function voidLabel(labelId) { const r = await ss("PUT", `/v2/labels/${encodeURIComponent(labelId)}/void`); return r.approved !== false; }
async function carriers() {
  const j = await ss("GET", "/v2/carriers");
  return (j.carriers || []).map((c) => ({ id: c.carrier_id, name: c.friendly_name || c.carrier_code, services: (c.services || []).filter((x) => x.domestic !== false).map((x) => ({ code: x.service_code, name: x.name })) }));
}
function trackingUrl(carrier, num) {
  const c = String(carrier || "").toLowerCase();
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${num}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${num}`;
  return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${num}`;
}

/* ---------------- storage ---------------- */
async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS hd_returns (id TEXT PRIMARY KEY, store TEXT, rma TEXT, status TEXT, order_name TEXT, email TEXT, ticket_id BIGINT,
            data JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE SEQUENCE IF NOT EXISTS hd_return_seq START 1001`);
  await db(`CREATE INDEX IF NOT EXISTS hd_returns_order ON hd_returns (order_name)`);
}
const rowToRec = (r) => ({ ...r.data, id: r.id, status: r.status, ticket_id: r.ticket_id, created_at: r.created_at, updated_at: r.updated_at });
async function getRec(id) { const r = (await db(`SELECT * FROM hd_returns WHERE id=$1`, [id])).rows[0]; return r ? rowToRec(r) : null; }
async function putRec(rec, event) {
  if (event) rec.events = [...(rec.events || []), { at: new Date().toISOString(), text: event }];
  await db(`INSERT INTO hd_returns (id, store, rma, status, order_name, email, ticket_id, data) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, ticket_id=EXCLUDED.ticket_id, data=EXCLUDED.data, updated_at=now()`,
    [rec.id, rec.store, rec.rma, rec.status, rec.order_name, rec.email, rec.ticket_id || null, JSON.stringify(rec)]);
  return rec;
}
async function update(id, patch, event) { const rec = await getRec(id); if (!rec) return null; Object.assign(rec, patch); return putRec(rec, event); }
async function list({ status, store, q, limit = 300 } = {}) {
  const where = [], args = [];
  if (status === "open") where.push(`status IN ('label_created','in_transit','delivered')`);
  else if (status) { args.push(status); where.push(`status=$${args.length}`); }
  if (store) { args.push(store); where.push(`store=$${args.length}`); }
  if (q) { args.push(`%${q.toLowerCase()}%`); where.push(`(lower(rma) LIKE $${args.length} OR lower(order_name) LIKE $${args.length} OR lower(email) LIKE $${args.length} OR lower(data->>'customer_name') LIKE $${args.length})`); }
  args.push(Math.min(Number(limit) || 300, 1000));
  const r = await db(`SELECT * FROM hd_returns ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY created_at DESC LIMIT $${args.length}`, args);
  return r.rows.map(rowToRec);
}
async function counts() {
  const r = await db(`SELECT status, count(*)::int n, COALESCE(sum((data->>'refunded_amount')::numeric),0) refunded, COALESCE(sum((data->>'label_cost')::numeric),0) labels, COALESCE(sum((data->>'fee_charged')::numeric),0) fees FROM hd_returns GROUP BY status`);
  const out = { by: {}, refunded: 0, labels: 0, fees: 0 };
  for (const x of r.rows) { out.by[x.status] = x.n; out.refunded += Number(x.refunded); out.labels += Number(x.labels); out.fees += Number(x.fees); }
  out.open = (out.by.label_created || 0) + (out.by.in_transit || 0) + (out.by.delivered || 0);
  out.attention = out.by.needs_attention || 0;
  return out;
}
const publicRec = (r) => ({ rma: r.rma, status: r.status, label_url: r.status === "cancelled" ? null : `${PUBLIC_URL()}/returns/label/${r.id}/${labelToken(r.id)}`, tracking_number: r.tracking_number, tracking_url: r.tracking_url, refund_method: r.refund_method, items: r.items.map((i) => ({ title: i.title, variant: i.variant, quantity: i.quantity })) });
function labelToken(id) { return crypto.createHmac("sha256", SECRET).update(`label:${id}`).digest("hex").slice(0, 24); }

/* ---------------- customer session token ---------------- */
function sign(p) { const b = Buffer.from(JSON.stringify(p)).toString("base64url"); return b + "." + crypto.createHmac("sha256", SECRET).update(b).digest("base64url"); }
function verify(t) {
  const [b, sig] = String(t || "").split(".");
  const exp = b ? crypto.createHmac("sha256", SECRET).update(b).digest("base64url") : "";
  if (!b || !sig || sig.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) throw httpError(401, "Your session expired. Please look up your order again.");
  const p = JSON.parse(Buffer.from(b, "base64url").toString());
  if (p.exp < Date.now()) throw httpError(401, "Your session expired. Please look up your order again.");
  return p;
}

/* ---------------- 1. look up an order ---------------- */
async function prepare(key, order, s) {
  const st = shopFor(key);
  const [items, rs] = await Promise.all([returnableItems(st, order.id), reasons(st)]);
  const existing = (await db(`SELECT * FROM hd_returns WHERE order_name=$1 ORDER BY created_at DESC`, [order.name])).rows.map(rowToRec);
  const a = labelAddress(order);
  if (!a) console.warn(`returns: ${order.name} has no shipping, billing or customer address (or the app can't read addresses)`);
  return {
    order: { name: order.name, created_at: order.createdAt, currency: order.currencyCode, email: order.email, customer_name: (a && a.name) || "" },
    address: a ? { name: a.name, address1: a.address1, address2: a.address2, city: a.city, state: a.provinceCode, zip: a.zip, country: a.countryCodeV2, phone: a.phone || "" } : null,
    international: !!(a && a.countryCodeV2 && a.countryCodeV2 !== "US"),
    items: items.map((i) => { const e = eligibility(i, s, key); return { fulfillmentLineItemId: i.fulfillmentLineItemId, title: i.title, variant: i.variantTitle, sku: i.sku, image: i.image, unit_price: i.unitPrice, returnable_qty: i.returnableQty, eligible: e.ok && i.returnableQty > 0, why: e.ok ? null : e.why }; }),
    reasons: rs,
    existing: existing.map(publicRec),
    options: { label_fee: s.label_fee, store_credit_enabled: s.store_credit_enabled, store_credit_bonus_pct: s.store_credit_bonus_pct, fee_on_store_credit: s.fee_on_store_credit, window_days: s.window_days[key] },
  };
}
async function lookup(key, orderNumber, email) {
  const def = STORE_DEFS[key]; if (!def) throw httpError(404, "Unknown store");
  if (!orderNumber || !email) throw httpError(400, "Enter your order number and email.");
  const s = await settings(), st = shopFor(key);
  const order = await findOrder(st, def, orderNumber, email);
  if (!order) throw httpError(404, "We couldn't find that order. Check the order number and the email you used at checkout.");
  if (order.cancelledAt) throw httpError(400, "This order was cancelled, so there's nothing to return.");
  return { token: sign({ k: key, o: order.id, exp: Date.now() + 2 * 3600e3 }), ...(await prepare(key, order, s)) };
}
// Staff: look up any order by name (no email needed).
async function staffLookup(orderName) {
  const key = keyForOrderName(orderName); if (!key) throw httpError(400, "Order number must start with LB or LBO.");
  const s = await settings(), st = shopFor(key);
  const order = await findOrder(st, STORE_DEFS[key], orderName, null);
  if (!order) throw httpError(404, `Order ${orderName} not found in ${STORE_DEFS[key].name}.`);
  return { store: key, ...(await prepare(key, order, s)) };
}

/* ---------------- 2. create the return + label ---------------- */
async function create({ key, orderId, lines, refundMethod, address, source, ticketId, who, staffOverride }) {
  const s = await settings(), st = shopFor(key);
  if (!Array.isArray(lines) || !lines.length) throw httpError(400, "Pick at least one item to return.");
  if (refundMethod !== "original" && !(refundMethod === "store_credit" && s.store_credit_enabled)) throw httpError(400, "Pick how you'd like your refund.");
  const order = (await gql(st, `query O($id: ID!) { order(id: $id) { id name email cancelledAt currencyCode customer { id defaultAddress { name company address1 address2 city provinceCode zip countryCodeV2 phone } }
      shippingAddress { name company address1 address2 city provinceCode zip countryCodeV2 phone } billingAddress { name company address1 address2 city provinceCode zip countryCodeV2 phone } } }`, { id: orderId })).order;
  if (!order) throw httpError(404, "Order not found");
  const items = await returnableItems(st, order.id), rs = await reasons(st);
  const chosen = [];
  for (const l of lines) {
    const it = items.find((i) => i.fulfillmentLineItemId === l.fulfillmentLineItemId), qty = Math.floor(Number(l.quantity));
    if (!it || !(qty >= 1)) continue;
    if (qty > it.returnableQty) throw httpError(400, `Only ${it.returnableQty} of ${it.title} can be returned.`);
    const e = eligibility(it, s, key);
    if (!e.ok && !staffOverride) throw httpError(400, `${it.title}: ${e.why}`);
    const reason = rs.find((r) => r.id === l.reasonId);
    if (!reason) throw httpError(400, `Pick a reason for ${it.title}.`);
    chosen.push({ ...it, quantity: qty, reasonId: reason.id, reasonName: reason.name, note: String(l.note || "").slice(0, 255) });
  }
  if (!chosen.length) throw httpError(400, "Pick at least one item to return.");

  const a = labelAddress(order) || {}, ad = address || {};
  const country = ad.country || a.countryCodeV2 || "US";
  if (country !== "US") throw httpError(400, "Prepaid labels are only available for US addresses. Please email us and we'll help with your return.");
  const from = {
    name: String(ad.name || a.name || "Customer").slice(0, 60), phone: String(ad.phone || a.phone || s.return_address.phone || "").slice(0, 20), company_name: a.company,
    address_line1: ad.address1 || a.address1, address_line2: (address ? ad.address2 : a.address2) || undefined, city_locality: ad.city || a.city,
    state_province: ad.state || a.provinceCode, postal_code: ad.zip || a.zip, country_code: "US", address_residential_indicator: "yes",
  };
  if (!from.address_line1 || !from.postal_code) throw httpError(400, "We need your address for the label.");

  // a) Shopify return
  const cr = await gql(st, RETURN_CREATE, { input: { orderId: order.id, returnLineItems: chosen.map((c) => ({ fulfillmentLineItemId: c.fulfillmentLineItemId, quantity: c.quantity, returnReasonDefinitionId: c.reasonId, returnReasonNote: c.note })) } });
  userErrors(cr.returnCreate, "Shopify couldn't create the return");
  const sret = cr.returnCreate.return;
  const seq = (await db(`SELECT nextval('hd_return_seq') n`)).rows[0].n;
  const rma = `${STORE_DEFS[key].prefix}-R${seq}`;

  // b) ShipStation label
  const weight = Number(s.packaging_oz) + chosen.reduce((w, c) => w + (c.weightOz || Number(s.default_item_oz)) * c.quantity, 0);
  let label;
  try { label = await buyLabel(s, from, weight, rma); }
  catch (err) {
    await gql(st, CANCEL, { id: sret.id }).catch(() => {});
    console.error("return label failed:", err.message);
    // Leave a trace staff can see (Activity log + Slack) — the customer only gets a friendly message.
    await core.audit({ kind: "return-label-failed", detail: `${order.name}: ${err.message}`, who: who || "customer (portal)" }).catch(() => {});
    core.slackPost(`⚠️ Return label failed for ${order.name} (${STORE_DEFS[key].name}): ${err.message}`).catch(() => {});
    throw httpError(502, source === "portal" ? "We couldn't create your shipping label. Please check your address, or email us and we'll help." : `Label failed: ${err.message}`);
  }
  const turl = trackingUrl(label.carrier, label.trackingNumber);
  // ShipStation has no test return labels, so test mode buys a real one and voids it straight away (no charge).
  // The PDF still opens, so the whole flow can be checked end to end.
  let testVoided = null;
  if (s.test_labels) { try { testVoided = await voidLabel(label.labelId); } catch (e) { testVoided = false; console.error("test label void:", e.message); } }
  const rec = await putRec({
    id: crypto.randomUUID(), store: key, rma, status: "label_created", source, created_by: who || null, ticket_id: ticketId || null,
    order_id: order.id, order_name: order.name, customer_id: order.customer ? order.customer.id : null, email: order.email, customer_name: from.name,
    currency: order.currencyCode, refund_method: refundMethod, shopify_return_id: sret.id, shopify_return_name: sret.name,
    label_id: label.labelId, label_src: label.labelUrl, label_cost: label.cost, tracking_number: label.trackingNumber, tracking_url: turl, tracking_code: "NY",
    est_subtotal: round2(chosen.reduce((t, c) => t + c.unitPrice * c.quantity, 0)), test_label: !!s.test_labels,
    items: chosen.map((c) => ({ fli: c.fulfillmentLineItemId, line_item_id: c.lineItemId, title: c.title, variant: c.variantTitle, sku: c.sku, quantity: c.quantity, unit_price: c.unitPrice, reason: c.reasonName, note: c.note })),
  }, `Return ${sret.name} created (${source}${who ? " · " + who : ""}); ${label.carrier || ""} label ${label.trackingNumber}${label.cost != null ? ` ($${label.cost})` : ""}${s.test_labels ? (testVoided ? " — TEST MODE: label voided right away, no charge" : " — TEST MODE: label could NOT be voided — void it in ShipStation") : ""}`);

  // c) Hand the label to Shopify → Shopify emails it to the customer.
  try {
    const det = await gql(st, RETURN_DETAIL, { id: sret.id });
    const rfo = det.return.reverseFulfillmentOrders.nodes[0];
    if (rfo) {
      const rd = await gql(st, REVERSE_DELIVERY, { rfo: rfo.id, url: label.labelUrl, num: label.trackingNumber, turl });
      userErrors(rd.reverseDeliveryCreateWithShipping, "attach label");
      await update(rec.id, { label_emailed: true }, "Label emailed to the customer by Shopify");
    }
  } catch (e) { await update(rec.id, { label_emailed: false }, "Shopify didn't email the label: " + e.message); }

  await core.audit({ ticketId: ticketId || null, kind: "return-created", detail: `${rma} · ${order.name} · ${chosen.map((c) => `${c.quantity}× ${c.title}`).join(", ")} · ${refundMethod === "store_credit" ? "store credit" : "refund"}`, who: who || "customer (portal)", target: rec.id });
  core.slackPost(`↩️ Return ${rma} started for ${order.name} (${STORE_DEFS[key].name}) — ${chosen.map((c) => `${c.quantity}× ${c.title} (${c.reasonName})`).join(", ")} · ${refundMethod === "store_credit" ? "store credit" : "refund to card"}${source === "portal" ? " · via portal" : who ? ` · by ${who}` : ""}`).catch(() => {});
  return getRec(rec.id);
}
async function submitPortal(body) {
  const p = verify(body.token);
  const rec = await create({ key: p.k, orderId: p.o, lines: body.lines, refundMethod: body.refund_method, address: body.address, source: "portal" });
  return publicRec(rec);
}
// From a Helpdesk ticket (staff, or Emily's approved action). Saves the label PDF so it rides along on the next reply.
async function createForTicket({ orderName, lines, refundMethod, ticketId, who, staffOverride }) {
  const key = keyForOrderName(orderName); if (!key) throw httpError(400, "Order number must start with LB or LBO.");
  const st = shopFor(key);
  const order = await findOrder(st, STORE_DEFS[key], orderName, null);
  if (!order) throw httpError(404, `Order ${orderName} not found.`);
  // Lines may name items by title/sku (from Emily) — map to fulfillment line items.
  const items = await returnableItems(st, order.id), rs = await reasons(st);
  const pickReason = (txt) => rs.find((r) => r.id === txt) || rs.find((r) => r.name.toLowerCase() === String(txt || "").toLowerCase()) || rs.find((r) => /other/i.test(r.name)) || rs[0];
  const mapped = lines.map((l) => {
    const it = l.fulfillmentLineItemId ? items.find((i) => i.fulfillmentLineItemId === l.fulfillmentLineItemId)
      : items.find((i) => (l.sku && i.sku === l.sku) || (l.title && i.title.toLowerCase().includes(String(l.title).toLowerCase())));
    if (!it) throw httpError(400, `"${l.title || l.sku}" isn't returnable on ${order.name}.`);
    return { fulfillmentLineItemId: it.fulfillmentLineItemId, quantity: l.quantity || 1, reasonId: pickReason(l.reasonId || l.reason).id, note: l.note };
  });
  const rec = await create({ key, orderId: order.id, lines: mapped, refundMethod: refundMethod || "original", source: "helpdesk", ticketId, who, staffOverride });
  let file = null;
  if (ticketId && rec.label_src) {
    try {
      const r = await fetch(rec.label_src, { headers: { "API-Key": SS_KEY } });
      if (r.ok) file = await core.saveFile({ ticketId, name: `Return label ${rec.rma}.pdf`, contentType: "application/pdf", buffer: Buffer.from(await r.arrayBuffer()), by: who });
    } catch (e) { console.error("label download:", e.message); }
  }
  return { rec, file };
}

/* ---------------- 3. refund once it's back ---------------- */
async function refund(rec, { force = false, who = "auto" } = {}) {
  if (["refunded", "cancelled"].includes(rec.status)) return rec;
  if (!force && rec.status !== "delivered") throw new Error("Package isn't delivered yet");
  const s = await settings(), st = shopFor(rec.store);
  const det = (await gql(st, RETURN_DETAIL, { id: rec.shopify_return_id })).return;
  if (!det) throw new Error("Shopify return not found");
  if (det.status === "CLOSED" || det.status === "CANCELED") return update(rec.id, { status: "needs_attention" }, `Shopify return is ${det.status} — nothing refunded automatically`);
  const rli = det.returnLineItems.nodes.map((n) => ({ id: n.id, quantity: n.quantity }));
  const out = (await gql(st, SUGGEST, { id: rec.shopify_return_id, items: rli })).return.suggestedFinancialOutcome;
  const ft = out.financialTransfer || {};
  const total = Number((ft.amount && ft.amount.shopMoney.amount) || out.discountedSubtotal.shopMoney.amount);
  const currency = (ft.amount && ft.amount.shopMoney.currencyCode) || out.discountedSubtotal.shopMoney.currencyCode;
  const credit = rec.refund_method === "store_credit";
  const fee = !credit || s.fee_on_store_credit ? Number(s.label_fee) : 0;
  const net = Math.max(0, round2(total - fee));
  const input = { returnId: rec.shopify_return_id, returnLineItems: rli, notifyCustomer: true };
  let bonus = 0;
  if (net > 0) {
    if (credit) {
      if (!rec.customer_id) throw new Error("Order has no customer account — can't issue store credit");
      input.financialTransfer = { issueRefund: { refundMethods: [{ storeCreditRefund: { amount: { amount: net.toFixed(2), currencyCode: currency } } }] } };
      bonus = round2((net * Number(s.store_credit_bonus_pct)) / 100);
    } else {
      let left = net; const txs = [];
      for (const t of ft.suggestedTransactions || []) {
        if (left <= 0 || !t.parentTransaction) break;
        const amt = round2(Math.min(left, Number(t.amountSet.shopMoney.amount)));
        if (amt > 0) txs.push({ parentId: t.parentTransaction.id, transactionAmount: { amount: amt.toFixed(2), currencyCode: currency } });
        left = round2(left - amt);
      }
      if (left > 0.009) throw new Error(`Couldn't place $${left} on the original payment`);
      input.financialTransfer = { issueRefund: { orderTransactions: txs } };
    }
  }
  const key = (k) => crypto.createHash("sha256").update(`${k}|${rec.id}`).digest("hex").slice(0, 40);
  const pr = await gql(st, PROCESS, { input, key: key("process") });
  userErrors(pr.returnProcess, "Shopify refund failed");
  if (bonus > 0) {
    const c = await gql(st, CREDIT, { id: rec.customer_id, key: key("bonus"), input: { creditAmount: { amount: bonus.toFixed(2), currencyCode: currency }, notify: true } });
    userErrors(c.storeCreditAccountCredit, "Bonus store credit failed");
  }
  const paid = round2(net + bonus);
  const how = credit ? `store credit ($${net.toFixed(2)} + $${bonus.toFixed(2)} bonus)` : "original payment";
  await core.audit({ ticketId: rec.ticket_id || null, kind: "return-refunded", detail: `${rec.rma} · $${paid.toFixed(2)} to ${how}`, who, target: rec.id });
  core.slackPost(`💸 Return ${rec.rma} (${rec.order_name}) refunded $${paid.toFixed(2)} to ${how}${who === "auto" ? " — package delivered back to us" : ` by ${who}`}`).catch(() => {});
  return update(rec.id, { status: "refunded", refunded_amount: paid, refunded_at: new Date().toISOString(), fee_charged: fee, order_value: total },
    `Refunded $${paid.toFixed(2)} to ${how} — return value $${total.toFixed(2)} less $${fee.toFixed(2)} label fee${who !== "auto" ? ` (by ${who})` : ""}`);
}

/* ---------------- 4. cancel ---------------- */
async function cancel(rec, why, who) {
  if (rec.status === "refunded") throw new Error("Already refunded");
  let voided = false;
  try { voided = await voidLabel(rec.label_id); } catch (e) { await update(rec.id, {}, "Label void failed: " + e.message); }
  try { await gql(shopFor(rec.store), CANCEL, { id: rec.shopify_return_id }); } catch (e) { await update(rec.id, {}, "Shopify cancel failed: " + e.message); }
  await core.audit({ ticketId: rec.ticket_id || null, kind: "return-cancelled", detail: `${rec.rma} · ${why}`, who: who || "system", target: rec.id });
  return update(rec.id, { status: "cancelled" }, `${why}. Label ${voided ? "voided" : "NOT voided"}.`);
}

/* ---------------- 5. tracking poller ---------------- */
async function checkOne(rec) {
  const s = await settings();
  const t = await track(rec.label_id);
  if (t.code !== rec.tracking_code) rec = await update(rec.id, { tracking_code: t.code, tracking_text: t.text }, `Tracking: ${t.code} ${t.text}`.trim());
  if (t.code === "DE" || t.code === "SP") {
    rec = await update(rec.id, { status: "delivered", delivered_at: new Date().toISOString() }, "Delivered back to us");
    if (s.auto_refund) { try { await refund(rec); } catch (e) { await update(rec.id, { status: "needs_attention" }, "Auto refund failed: " + e.message); } }
    return;
  }
  if (["AC", "IT", "AT", "EX"].includes(t.code) && rec.status === "label_created") return update(rec.id, { status: "in_transit" }, "On its way back");
  const age = (Date.now() - new Date(rec.created_at).getTime()) / 86400e3;
  if (rec.status === "label_created" && s.void_unused_after_days > 0 && age > s.void_unused_after_days && ["NY", "UN"].includes(t.code))
    await cancel(rec, `Label never used in ${s.void_unused_after_days} days`, "system");
}
let polling = false;
async function poll() {
  if (polling || !SS_KEY) return; polling = true;
  try { for (const rec of await list({ status: "open" })) { if (rec.status === "delivered" || rec.test_label) continue; try { await checkOne(rec); } catch (e) { console.error(`return ${rec.rma}:`, e.message); } } }
  finally { polling = false; }
}

function csv(rows) {
  const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const head = ["RMA", "Store", "Order", "Customer", "Email", "Status", "Method", "Items", "Reasons", "Item value", "Refunded", "Fee", "Label cost", "Tracking", "Source", "Created", "Refunded at"];
  return [head.map(q).join(","), ...rows.map((r) => [r.rma, r.store, r.order_name, r.customer_name, r.email, r.status, r.refund_method, r.items.map((i) => `${i.quantity}x ${i.title}${i.variant ? " (" + i.variant + ")" : ""}`).join("; "), r.items.map((i) => i.reason).join("; "), r.est_subtotal, r.refunded_amount, r.fee_charged, r.label_cost, r.tracking_number, r.source, r.created_at && new Date(r.created_at).toISOString(), r.refunded_at].map(q).join(","))].join("\n");
}

/* ---------------- what Emily tells customers ---------------- */
async function portalRule() {
  const s = await settings();
  if (!s.portal_live) return "";
  return `\n\nRETURNS PORTAL (this overrides any Loop links anywhere above — Loop is retired): send customers to our own returns portal, picked by order prefix (LBO before LB): ` +
    `LBO = Larkspur Baby Outlet → ${PUBLIC_URL()}/returns/lbo ; LB = Larkspur Baby → ${PUBLIC_URL()}/returns/lb . ` +
    `In the portal they enter the order number + email, pick items, and get a prepaid label instantly. Return window ${s.window_days.lb} days (LB) / ${s.window_days.lbo} days (LBO) from delivery. ` +
    `A $${Number(s.label_fee).toFixed(2)} return-label fee is deducted from the refund${s.fee_on_store_credit ? "" : " (waived if they choose store credit)"}. ` +
    (s.store_credit_enabled ? `They can choose a refund to the original payment, or store credit with a ${s.store_credit_bonus_pct}% bonus. ` : "") +
    `The refund is issued automatically as soon as the package is delivered back to us. ` +
    `If a customer can't use the portal (no email access, wants us to do it), call return_propose to stage the return + label for approval; the label PDF is attached to your reply automatically. Never promise a refund amount — the portal shows it.`;
}

async function init() {
  if (!pool) return;
  try { await migrate(); } catch (e) { console.error("returns migrate:", e.message); return; }
  const mins = Number(process.env.RETURNS_POLL_MIN || 60);
  setTimeout(() => poll().catch(() => {}), 30e3); setInterval(() => poll().catch(() => {}), mins * 60e3);
  const s = await settings();
  const p = setupProblems(s);
  console.log(`↩️  Returns: portal ${s.portal_live ? "LIVE" : "set up, not live yet"} · tracking every ${mins} min · ${s.test_labels ? "TEST mode (labels voided right away)" : "real labels"}${p.length ? `\n   ⚠️  ${p.join("; ")}` : ""}`);
}

module.exports = { init, settings, saveSettings, setupProblems, STORE_DEFS, lookup, staffLookup, submitPortal, createForTicket, refund, cancel, checkOne, poll, list, counts, getRec, csv, carriers, labelToken, portalRule, httpError, keyForOrderName };
