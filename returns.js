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
  lb: { key: "lb", prefix: "LB", name: "Larkspur Baby", support: core.BRAND_MAILBOX.larkspur, shopUrl: "https://larkspurbaby.com", faqUrl: "https://larkspurbaby.com/pages/faqs", host: process.env.RETURNS_HOST_LB || "returns.larkspurbaby.com" },
  lbo: { key: "lbo", prefix: "LBO", name: "Larkspur Baby Outlet", support: core.BRAND_MAILBOX.outlet, shopUrl: "https://larkspurbabyoutlet.com", faqUrl: "https://larkspurbabyoutlet.com/pages/faqs", host: process.env.RETURNS_HOST_LBO || "returns.larkspurbabyoutlet.com" },
};
// Customer-facing portal address: the branded domain once "branded_links" is on (after DNS is live), otherwise the Railway path.
const portalUrl = (key, s) => (s && s.branded_links && STORE_DEFS[key].host) ? `https://${STORE_DEFS[key].host}` : `${PUBLIC_URL()}/returns/${key}`;
const storeForHost = (h) => Object.values(STORE_DEFS).find((d) => d.host && d.host === String(h || "").toLowerCase()) || null;
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
  branded_links: false,
  stats_since: "2026-10-07T23:10:00Z", // returns before this (testing) are left out of spend/analytics; "Reset stats" moves it            // when on, links use returns.larkspurbaby.com / returns.larkspurbabyoutlet.com (turn on once DNS is live)
  window_days: { lb: 7, lbo: 7 },
  label_fee: 7.95,
  store_credit_enabled: true,
  store_credit_bonus_pct: 15,
  fee_on_store_credit: true,
  auto_refund: true,
  final_sale_tags: "final-sale, final sale, no-returns",
  carrier_id: "",
  ss_store: { lb: "", lbo: "" },
  // The reasons customers pick from (Returns → Settings). Each is matched to Shopify's closest standard reason.
  reasons: ["Too small", "Too large", "Didn't like the fit", "Color or print wasn't as expected", "Fabric or material wasn't as expected", "Item arrived damaged or defective", "Received the wrong item", "Changed my mind", "Arrived too late", "Other"],   // ShipStation store each brand's returns are filed under (empty = match by name)
  service_code: "usps_ground_advantage",
  default_item_oz: 8,
  packaging_oz: 4,
  void_unused_after_days: 28,      // customers have this many days to drop off; the label is voided and the return closed the day after
  dropoff_reminder_days: 21,       // reminder email if the package hasn't been dropped off by this day
  test_labels: true,
  own_return_email: true,          // send our own branded return email (Portal Studio → Emails) instead of Shopify's label email
  // Portal options beyond returns (edit order, defective, Package Protection, not delivered)
  edit_window_minutes: 15,         // customers can edit an unshipped order for this long after placing it
  claim_window_days: 30,           // defective and arrived-damaged claims: this many days after delivery
  marked_delivered_window_days: 5, // (older single window — replaced by the two below)
  pp_claim_window_days: 7,         // WITH Package Protection: "marked delivered" and "arrived damaged" claims, days after delivery
  nopp_claim_window_days: 5,       // WITHOUT Package Protection: same two claims, days after delivery
  attempted_wait_hours: 24,        // (older rule, replaced by the post office question)
  po_lock_minutes: 30,             // attempted delivery: answering "No, I haven't contacted the post office" locks the claim this long
  transit_claim_max_days: 0,       // "hasn't arrived": last day to file, days after shipping (0 = no limit)
  replacement_min_stock: 3,        // a replacement is only offered when the variant has MORE than this many in stock
  pp_stall_days: 5,                // (older rule, no longer used for opening claims)
  transit_claim_days: 14,          // "hasn't arrived" claims open this many days after shipping if tracking still isn't delivered
  auto_approve: true,              // approve claims automatically when every safety check passes
  auto_approve_max: 150,           // ...only up to this claim value ($)
  auto_approve_confidence: 0.8,    // ...and only when the AI is at least this sure (photo / delivered-not-received claims)
  auto_approve_max_prior: 1,       // ...and the customer has had at most this many approved claims in the last 12 months
  delivered_wait_hours: 24,        // "marked delivered but not received" claims open this long after the delivery scan
  pp_match: "package protection, shipping protection",   // line items whose title/SKU contains one of these are Package Protection
  return_address: {
    name: "Returns Dept", company_name: "Larkspur Baby", phone: "",
    address_line1: "701 E Plano Pkwy", address_line2: "Suite 103", city_locality: "Plano", state_province: "TX", postal_code: "75074", country_code: "US",
  },
};
const OLD_REASONS = ["I received the wrong item", "Item was damaged", "I didn't have a good experience", "Item didn't fit", "I found something else I like more", "I didn't like the item"];
async function settings() {
  const s = (await core.setting("returns", null)) || {};
  if (JSON.stringify(s.reasons) === JSON.stringify(OLD_REASONS)) delete s.reasons;   // the 6-reason list was the old default → use the new one
  return { ...DEFAULTS, ...s, window_days: { ...DEFAULTS.window_days, ...(s.window_days || {}) }, ss_store: { ...DEFAULTS.ss_store, ...(s.ss_store || {}) }, return_address: { ...DEFAULTS.return_address, ...(s.return_address || {}) } };
}
async function saveSettings(patch, who) {
  const cur = await settings();
  const next = { ...cur, ...patch, window_days: { ...cur.window_days, ...(patch.window_days || {}) }, ss_store: { ...cur.ss_store, ...(patch.ss_store || {}) }, return_address: { ...cur.return_address, ...(patch.return_address || {}) } };
  for (const k of ["label_fee", "store_credit_bonus_pct", "default_item_oz", "packaging_oz", "void_unused_after_days", "edit_window_minutes", "claim_window_days", "pp_stall_days", "delivered_wait_hours", "transit_claim_days", "marked_delivered_window_days", "pp_claim_window_days", "nopp_claim_window_days", "attempted_wait_hours", "replacement_min_stock", "dropoff_reminder_days", "po_lock_minutes", "transit_claim_max_days", "auto_approve_max", "auto_approve_confidence", "auto_approve_max_prior"]) next[k] = Number(next[k]) || 0;
  for (const k of Object.keys(next.window_days)) next.window_days[k] = Number(next.window_days[k]) || 0;
  if (patch.reasons !== undefined) { next.reasons = (Array.isArray(patch.reasons) ? patch.reasons : String(patch.reasons).split("\n")).map((x) => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 20); if (!next.reasons.length) next.reasons = DEFAULTS.reasons; }
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
const REVERSE_DELIVERY = `mutation RD($rfo: ID!, $url: URL!, $num: String!, $turl: URL, $notify: Boolean) {
  reverseDeliveryCreateWithShipping(reverseFulfillmentOrderId: $rfo, reverseDeliveryLineItems: [], notifyCustomer: $notify,
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
  if (c && c.at > Date.now() - 6 * 3600e3) return portalReasons(c.list, await settings());   // cache holds Shopify's library; customers only ever see our list
  const d = await gql(st, REASONS);
  const lib = d.returnReasonDefinitions.nodes.filter((r) => !r.deleted).map((r) => ({ sid: r.id, name: r.name, handle: r.handle || "" }));
  reasonCache.set(st.domain, { at: Date.now(), list: lib });
  return portalReasons(lib, await settings());
}
// Our short list → Shopify's closest standard reason (Shopify requires one). The exact wording the customer
// picked is also saved as the return's reason note, so nothing is lost in the mapping.
const REASON_RULES = [
  [/too small/i, /too.?small|small/i, /fit|size/i],
  [/too large|too big/i, /too.?big|large|big/i, /fit|size/i],
  [/color|colour|print/i, /color|colour/i, /style/i, /not.?as/i],
  [/fabric|material/i, /material|quality/i, /not.?as/i],
  [/too late/i, /late/i, /\bother\b/i],
  [/^other$/i, /\bother\b/i],
  [/wrong|incorrect|different item/i, /wrong|incorrect/i],
  [/damag|defect|broken|torn|stain/i, /damag/i, /defect/i],
  [/fit|size|small|big|large|tight|loose/i, /fit|size/i, /too.?small/i, /too.?big/i],
  [/found something|something else|better|cheaper|changed.*mind/i, /changed.?mind/i, /unwanted|no.?longer/i],
  [/didn.?t like|don.?t like|style|look|color|colour|quality/i, /style/i, /unwanted/i, /not.?as/i],
  [/experience|service|late|slow|arriv/i, /\bother\b/i, /experience|service/i],
];
function mapReason(label, lib) {
  const name = (r) => `${r.handle} ${r.name}`;
  for (const [mine, ...prefs] of REASON_RULES) if (mine.test(label)) for (const t of prefs) { const hit = lib.find((r) => t.test(name(r))); if (hit) return hit; }
  return lib.find((r) => /other/i.test(name(r))) || lib.find((r) => /unwanted/i.test(name(r))) || lib[0];
}
function portalReasons(lib, s) {
  const labels = (Array.isArray(s.reasons) && s.reasons.length ? s.reasons : DEFAULTS.reasons).map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
  return labels.map((label, i) => { const m = mapReason(label, lib) || {}; return { id: `r${i}`, name: label, sid: m.sid, shopify_name: m.name }; });
}
// Package Protection is a fee line, not a product — it can never be returned.
function isPP(item, s) {
  const words = String((s && s.pp_match) || DEFAULTS.pp_match).split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const hay = `${item.title || ""} ${item.sku || ""}`.toLowerCase();
  return words.some((w) => hay.includes(w));
}
function eligibility(item, s, key, deliveredAt) {
  const finalTags = String(s.final_sale_tags || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (item.tags.some((t) => finalTags.includes(t))) return { ok: false, why: "Final sale" };
  const days = s.window_days[key] || 7;
  const from = item.deliveredAt || deliveredAt;   // the window runs from DELIVERY, never from shipping
  if (!from) return { ok: false, why: "Available once your order is delivered" };
  const deadline = new Date(new Date(from).getTime() + days * 86400e3);
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
// ShipStation stores (v1 API — the only one that lists them). Used to file each return under its brand (LB / LBO).
const SS1_AUTH = process.env.SHIPSTATION_API_KEY && process.env.SHIPSTATION_API_SECRET ? "Basic " + Buffer.from(`${process.env.SHIPSTATION_API_KEY}:${process.env.SHIPSTATION_API_SECRET}`).toString("base64") : null;
let ssStoresCache = null;
async function ssStores() {
  if (ssStoresCache && ssStoresCache.at > Date.now() - 3600e3) return ssStoresCache.list;
  if (!SS1_AUTH) return [];
  const r = await fetch("https://ssapi.shipstation.com/stores?showInactive=false", { headers: { Authorization: SS1_AUTH } });
  if (!r.ok) throw new Error(`ShipStation stores ${r.status}`);
  const list = (await r.json()).map((x) => ({ id: String(x.storeId), name: x.storeName, marketplace: x.marketplaceName }));
  ssStoresCache = { at: Date.now(), list };
  return list;
}
async function storeIdFor(s, key) {
  if (s.ss_store && s.ss_store[key]) return s.ss_store[key];
  try {
    const want = STORE_DEFS[key].prefix.toLowerCase(), name = STORE_DEFS[key].name.toLowerCase();
    const st = (await ssStores()).find((x) => [want, name].includes(String(x.name || "").trim().toLowerCase()));
    return st ? st.id : null;
  } catch (e) { console.error("ShipStation stores:", e.message); return null; }
}
// The original (outbound) ShipStation label + shipment for an order, found by the tracking numbers on its Shopify fulfillments.
async function findOutbound(numbers, notes = []) {
  const list = numbers.filter(Boolean).slice(0, 5);
  if (!list.length) { notes.push("the Shopify order has no tracking number to match"); console.log("↩️  outbound for return: no tracking numbers on the order"); return null; }
  for (const n of list) {
    try {
      const j = await ss("GET", `/v2/labels?tracking_number=${encodeURIComponent(n)}&page_size=5`);
      const labs = j.labels || [];
      const lab = labs.find((l) => String(l.tracking_number) === String(n) && !l.is_return_label && l.status !== "voided");
      console.log(`↩️  outbound lookup ${n}: ${labs.length} label(s) ${JSON.stringify(labs.map((l) => ({ id: l.label_id, status: l.status, ret: l.is_return_label, shipment: l.shipment_id })))}`);
      if (!lab) { notes.push(`no ShipStation label for tracking ${n}`); continue; }
      let sh = {};
      try { sh = await ss("GET", `/v2/shipments/${encodeURIComponent(lab.shipment_id)}`); } catch (e) { console.error("outbound shipment:", e.message); }
      const info = { label_id: lab.label_id, shipment_id: lab.shipment_id, store_id: sh.store_id || null, shipment_number: sh.shipment_number || null, external_order_id: sh.external_order_id || null };
      console.log(`↩️  outbound for return: tracking ${n} → ${JSON.stringify(info)} · shipment fields: ${Object.keys(sh).join(",")}`);
      notes.push(`linked to ShipStation shipment ${lab.shipment_id}${info.shipment_number ? " (order " + info.shipment_number + ")" : ""}${info.store_id ? ", store " + info.store_id : ""}`);
      return info;
    } catch (e) { console.error(`outbound lookup ${n}:`, e.message); notes.push(`lookup for ${n} failed: ${e.message}`); }
  }
  return null;
}
// meta: { key, orderName, email, items:[{title,variant,sku,quantity,unitPrice,weightOz}], reasons }
async function buyLabel(s, from, weightOz, rma, meta = {}) {
  const orderNo = String(meta.orderName || "").replace(/^#/, "");
  const shipment = {
    service_code: s.service_code,
    ship_from: clean({ ...from, email: meta.email }),
    ship_to: clean({ ...s.return_address, address_residential_indicator: "no" }),
    packages: [{ weight: { value: Math.max(1, Math.round(weightOz)), unit: "ounce" } }],
    // So the label is easy to find in ShipStation → Returns: order number, brand store, customer email, items, tag.
    shipment_number: orderNo || rma,
    external_shipment_id: rma,
    external_order_id: orderNo || undefined,
    order_source_code: "shopify",
    tags: [{ name: "Return" }],
    internal_notes: `Return ${rma} for ${meta.orderName || ""}${meta.reasons ? " — " + meta.reasons : ""}`.slice(0, 500),
    items: (meta.items || []).map((i) => clean({ name: [i.title, i.variant].filter(Boolean).join(" — ").slice(0, 200), quantity: i.quantity, sku: i.sku || undefined, external_order_id: orderNo || undefined, order_source_code: "shopify", unit_price: i.unitPrice != null ? Number(i.unitPrice) : undefined, weight: { value: Math.max(1, Math.round(i.weightOz || Number(s.default_item_oz) || 8)), unit: "ounce" } })),
  };
  if (s.carrier_id) shipment.carrier_id = s.carrier_id;
  // TEST MODE: buy nothing. ShipStation has no test return labels and some carriers won't void right away,
  // so we only get the price and hand back a sample label.
  if (meta.test) return { labelId: null, trackingNumber: `TEST-${rma}`, labelUrl: null, cost: await quoteLabel(s, shipment), carrier: "", test: true };
  // Tie the return to the ShipStation order it came from: find the original shipping label by its tracking
  // number, then copy that shipment's store and order number and link the two labels (outbound_label_id).
  // This is what makes the return show under the order in ShipStation instead of "store not active".
  const out = await findOutbound(meta.tracking || [], meta.notes || []);
  if (out && out.store_id) shipment.store_id = out.store_id;
  else { const storeId = meta.key ? await storeIdFor(s, meta.key) : null; if (storeId) shipment.store_id = storeId; }
  if (out && out.shipment_number) shipment.shipment_number = out.shipment_number;
  if (out && out.external_order_id) shipment.external_order_id = out.external_order_id;
  const body = { is_return_label: true, rma_number: rma, charge_event: "carrier_default", label_format: "pdf", label_layout: "4x6", label_download_type: "url", shipment };
  if (out && out.label_id) body.outbound_label_id = out.label_id;
  let l;
  try { l = await ss("POST", "/v2/labels", body); }
  catch (e) {
    // Never lose a return over the filing details: retry with only the essentials.
    if (!/^ShipStation 4\d\d/.test(e.message)) throw e;
    // First drop only the item list (the most detailed part); keep the store, order number and tag so it stays filed.
    console.error("label with filing details failed, retrying without items:", e.message);
    delete shipment.items;
    try { l = await ss("POST", "/v2/labels", body); }
    catch (e2) {
      if (!/^ShipStation 4\d\d/.test(e2.message)) throw e2;
      console.error("label retry failed, retrying plain:", e2.message);
      for (const k of ["store_id", "tags", "order_source_code", "external_order_id", "internal_notes"]) delete shipment[k];
      delete body.outbound_label_id;
      l = await ss("POST", "/v2/labels", body);
    }
  }
  return { labelId: l.label_id, trackingNumber: l.tracking_number, labelUrl: (l.label_download && (l.label_download.pdf || l.label_download.href)) || null, cost: l.shipment_cost ? l.shipment_cost.amount : null, carrier: l.carrier_code };
}
async function track(labelId) { const t = await ss("GET", `/v2/labels/${encodeURIComponent(labelId)}/track`); return { code: t.status_code || "UN", text: t.status_description || "" }; }
// Returns { ok, message } — ShipStation answers 200 with approved:false and a reason when it refuses a void.
async function voidLabel(labelId) {
  const r = await ss("PUT", `/v2/labels/${encodeURIComponent(labelId)}/void`);
  const ok = r.approved !== false;
  if (!ok) console.error(`void refused for ${labelId}:`, r.message || JSON.stringify(r).slice(0, 200));
  return { ok, message: r.message || "" };
}
// Price of a label without buying it (used by test mode).
async function quoteLabel(s, shipment) {
  if (!s.carrier_id) return null;
  try {
    const r = await ss("POST", "/v2/rates", { rate_options: { carrier_ids: [s.carrier_id], service_codes: [s.service_code] }, shipment: { ...shipment, carrier_id: undefined, service_code: undefined } });
    const rate = ((r.rate_response && r.rate_response.rates) || []).find((x) => x.service_code === s.service_code) || ((r.rate_response && r.rate_response.rates) || [])[0];
    if (!rate) return null;
    const amt = (k) => Number((rate[k] && rate[k].amount) || 0);
    return Math.round((amt("shipping_amount") + amt("other_amount") + amt("confirmation_amount") + amt("insurance_amount")) * 100) / 100;
  } catch (e) { console.error("rate quote:", e.message); return null; }
}
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
// Money totals only count real returns since the last stats reset; voided (cancelled) labels cost nothing.
const STATS_WHERE = `created_at >= $1 AND COALESCE((data->>'test_label')::boolean, false) = false`;
async function counts() {
  const s = await settings();
  const by = await db(`SELECT status, count(*)::int n FROM hd_returns GROUP BY status`);
  const m = await db(`SELECT COALESCE(sum((data->>'refunded_amount')::numeric),0) refunded,
      COALESCE(sum(CASE WHEN status<>'cancelled' THEN (data->>'label_cost')::numeric END),0) labels, COALESCE(sum((data->>'fee_charged')::numeric),0) fees
    FROM hd_returns WHERE ${STATS_WHERE}`, [s.stats_since]);
  const out = { by: {}, refunded: Number(m.rows[0].refunded), labels: Number(m.rows[0].labels), fees: Number(m.rows[0].fees), since: s.stats_since };
  for (const x of by.rows) out.by[x.status] = x.n;
  out.open = (out.by.label_created || 0) + (out.by.in_transit || 0) + (out.by.delivered || 0);
  out.attention = out.by.needs_attention || 0;
  return out;
}
const publicRec = (r) => ({ rma: r.rma, status: r.status, label_url: r.status === "cancelled" ? null : `${PUBLIC_URL()}/returns/label/${r.id}/${labelToken(r.id)}`, tracking_number: r.tracking_number, tracking_url: r.tracking_url, refund_method: r.refund_method, items: r.items.map((i) => ({ title: i.title, variant: i.variant, quantity: i.quantity })) });
// Everything the confirmation page shows (also reachable later from the link in our emails).
async function publicView(r) {
  const s = await settings();
  const tok = labelToken(r.id), credit = r.refund_method === "store_credit";
  const sub = Number(r.est_subtotal) || 0, tax = Number(r.est_tax) || 0;
  const fee = r.fee_charged != null ? Number(r.fee_charged) : (!credit || s.fee_on_store_credit ? Number(s.label_fee) : 0);
  const net = Math.max(0, round2(sub + tax - fee)), bonus = credit ? round2((net * Number(s.store_credit_bonus_pct)) / 100) : 0;
  const others = (await db(`SELECT * FROM hd_returns WHERE order_name=$1 AND id<>$2 ORDER BY created_at DESC`, [r.order_name, r.id])).rows.map(rowToRec).filter((x) => x.status !== "cancelled");
  return {
    id: r.id, token: tok, view_url: `${portalUrl(r.store, s)}?r=${r.id}.${tok}`, store: r.store,
    rma: r.rma, status: r.status, order_name: r.order_name, created_at: r.created_at, email: r.email, phone: r.phone || "", address: r.address || null, customer_name: r.customer_name,
    dropoff_days: s.void_unused_after_days, dropoff_by: new Date(new Date(r.created_at).getTime() + s.void_unused_after_days * 86400e3).toISOString(),
    label_url: r.status === "cancelled" ? null : `${PUBLIC_URL()}/returns/label/${r.id}/${tok}`, print_url: r.status === "cancelled" ? null : `${PUBLIC_URL()}/returns/print/${r.id}/${tok}`,
    tracking_number: r.tracking_number, tracking_url: r.tracking_url, label_emailed: r.label_emailed !== false && !r.test_label, test_label: !!r.test_label,
    refund_method: r.refund_method, items: r.items.map((i) => ({ title: i.title, variant: i.variant, quantity: i.quantity, unit_price: i.unit_price, image: i.image || null, reason: i.reason })),
    summary: { subtotal: round2(sub), tax: round2(tax), fee: round2(fee), bonus, bonus_pct: Number(s.store_credit_bonus_pct), total: r.status === "refunded" && r.refunded_amount != null ? Number(r.refunded_amount) : round2(net + bonus), final: r.status === "refunded" },
    can_cancel: r.status === "label_created" && ["NY", "UN", undefined, null, ""].includes(r.tracking_code),
    feedback: r.feedback ? { ease: r.feedback.ease, again: r.feedback.again } : null,
    others: others.map((x) => ({ rma: x.rma, status: x.status, created_at: x.created_at, items: x.items.map((i) => `${i.quantity}× ${i.title}`), view_url: `${portalUrl(x.store, s)}?r=${x.id}.${labelToken(x.id)}` })),
  };
}
function viewAuth(id, tok) { if (!id || String(tok) !== labelToken(id)) throw httpError(404, "We couldn't find that return."); }
async function viewReturn(id, tok) { viewAuth(id, tok); const r = await getRec(id); if (!r) throw httpError(404, "We couldn't find that return."); return publicView(r); }
async function customerCancel(id, tok) {
  viewAuth(id, tok); const r = await getRec(id); if (!r) throw httpError(404, "We couldn't find that return.");
  const v = await publicView(r);
  if (!v.can_cancel) throw httpError(400, r.status === "cancelled" ? "This return is already cancelled." : "This return is already on its way to us, so it can't be cancelled. Please email us if you need help.");
  await cancel(r, "Cancelled by the customer in the portal", "customer (portal)");
  core.slackPost(`↩️❌ Return ${r.rma} (${r.order_name}) cancelled by the customer in the portal`).catch(() => {});
  return publicView(await getRec(id));
}
async function saveFeedback(id, tok, body) {
  viewAuth(id, tok); const r = await getRec(id); if (!r) throw httpError(404, "We couldn't find that return.");
  const n = (x) => { const v = Math.round(Number(x)); return v >= 1 && v <= 5 ? v : null; };
  const fb = { ease: n(body.ease), again: n(body.again), note: String(body.note || "").trim().slice(0, 1000), at: new Date().toISOString() };
  if (!fb.ease && !fb.again && !fb.note) throw httpError(400, "Pick a rating first.");
  await update(id, { feedback: fb }, `Customer feedback: experience ${fb.ease || "—"}/5 · would buy again ${fb.again || "—"}/5${fb.note ? ` · "${fb.note}"` : ""}`);
  return { ok: true };
}
// One PDF: the shipping label, then a packing slip to put inside the box.
async function printPdf(id, tok) {
  viewAuth(id, tok); const r = await getRec(id);
  if (!r || r.status === "cancelled") throw httpError(404, "This label is no longer available.");
  const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
  const doc = await PDFDocument.create();
  const W = 288, H = 432;   // 4 x 6 in
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  if (r.label_src) {
    const lr = await fetch(r.label_src, { headers: { "API-Key": SS_KEY } });
    if (!lr.ok) throw httpError(502, "Couldn't load the label. Please try again.");
    const label = await PDFDocument.load(Buffer.from(await lr.arrayBuffer()));
    for (const pg of await doc.copyPages(label, label.getPageIndices())) doc.addPage(pg);
  } else {
    const pg = doc.addPage([W, H]);
    pg.drawRectangle({ x: 12, y: 12, width: W - 24, height: H - 24, borderColor: rgb(0.7, 0.14, 0.1), borderWidth: 2 });
    pg.drawText("TEST - NOT A REAL LABEL", { x: 30, y: H / 2, size: 16, font: bold, color: rgb(0.7, 0.14, 0.1) });
  }
  const def = STORE_DEFS[r.store];
  const pg = doc.addPage([W, H]);
  const clean = (t) => String(t == null ? "" : t).replace(/[^\x20-\x7E]/g, (c) => ({ "\u2019": "'", "\u2018": "'", "\u201c": '"', "\u201d": '"', "\u2013": "-", "\u2014": "-", "\u00d7": "x" })[c] || "");
  const wrap = (t, f, size, max) => { const words = clean(t).split(" "); const out = []; let line = ""; for (const w of words) { const tryL = line ? line + " " + w : w; if (f.widthOfTextAtSize(tryL, size) > max && line) { out.push(line); line = w; } else line = tryL; } if (line) out.push(line); return out; };
  let y = H - 18; const L = 20, max = W - 40;
  const text = (t, size, f = font, gap = 4) => { for (const ln of wrap(t, f, size, max)) { y -= size; pg.drawText(ln, { x: L, y, size, font: f, color: rgb(0.1, 0.12, 0.16) }); y -= gap; } };
  text(def.name, 11, bold); text("RETURN PACKING SLIP", 9, font, 8);
  pg.drawLine({ start: { x: L, y }, end: { x: W - L, y }, thickness: 0.8, color: rgb(0.75, 0.75, 0.75) }); y -= 10;
  text("Return", 8); text(r.rma, 20, bold, 8);
  text(`Order ${r.order_name}`, 10, bold); text(`${r.customer_name || ""}`, 9); text(`Started ${new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago" })}`, 9, font, 12);
  text("Items in this package", 9, bold, 6);
  for (const i of r.items) { text(`${i.quantity} x ${i.title}${i.variant ? ` (${i.variant})` : ""}`, 9, font, 2); text(`Reason: ${i.reason || "-"}`, 8, font, 7); if (y < 70) break; }
  y = Math.min(y, 44);
  pg.drawLine({ start: { x: L, y: y - 2 }, end: { x: W - L, y: y - 2 }, thickness: 0.8, color: rgb(0.75, 0.75, 0.75) }); y -= 6;
  text("Place this slip inside the package. Attach the label to the outside.", 8);
  return { pdf: Buffer.from(await doc.save()), name: `Return ${r.rma}.pdf` };
}
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
  const [items, rs, claimed, deliveredAt] = await Promise.all([returnableItems(st, order.id), reasons(st), require("./claims").claimedQty(order.name).catch(() => ({})), require("./claims").deliveredAt(key, order.id).catch(() => null)]);
  for (const i of items) if (claimed[i.lineItemId]) i.returnableQty = Math.max(0, i.returnableQty - claimed[i.lineItemId]);
  const existing = (await db(`SELECT * FROM hd_returns WHERE order_name=$1 ORDER BY created_at DESC`, [order.name])).rows.map(rowToRec);
  const a = labelAddress(order);
  if (!a) console.warn(`returns: ${order.name} has no shipping, billing or customer address (or the app can't read addresses)`);
  return {
    order: { name: order.name, created_at: order.createdAt, currency: order.currencyCode, email: order.email, customer_name: (a && a.name) || "" },
    address: a ? { name: a.name, address1: a.address1, address2: a.address2, city: a.city, state: a.provinceCode, zip: a.zip, country: a.countryCodeV2, phone: a.phone || "" } : null,
    international: !!(a && a.countryCodeV2 && a.countryCodeV2 !== "US"),
    items: items.map((i) => { const pp = isPP(i, s); const e = pp ? { ok: false, why: "Package Protection isn't returnable" } : eligibility(i, s, key, deliveredAt); return { fulfillmentLineItemId: i.fulfillmentLineItemId, title: i.title, variant: i.variantTitle, sku: i.sku, image: i.image, unit_price: i.unitPrice, returnable_qty: i.returnableQty, eligible: e.ok && i.returnableQty > 0, why: e.ok ? null : e.why }; }),
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
  const [prep, menu] = await Promise.all([prepare(key, order, s), require("./claims").menu(key, order, s).catch((e) => { console.error("portal menu:", e.message); return null; })]);
  return { token: sign({ k: key, o: order.id, n: order.name, e: String(email).trim().toLowerCase(), exp: Date.now() + 2 * 3600e3 }), ...prep, menu };
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
  const order = (await gql(st, `query O($id: ID!) { order(id: $id) { id name email cancelledAt currencyCode fulfillments(first: 10) { trackingInfo { number company } } customer { id defaultAddress { name company address1 address2 city provinceCode zip countryCodeV2 phone } }
      shippingAddress { name company address1 address2 city provinceCode zip countryCodeV2 phone } billingAddress { name company address1 address2 city provinceCode zip countryCodeV2 phone } } }`, { id: orderId })).order;
  if (!order) throw httpError(404, "Order not found");
  const items = await returnableItems(st, order.id), rs = await reasons(st);
  const claimed = await require("./claims").claimedQty(order.name).catch(() => ({}));
  for (const i of items) if (claimed[i.lineItemId]) i.returnableQty = Math.max(0, i.returnableQty - claimed[i.lineItemId]);
  const deliveredAt = await require("./claims").deliveredAt(key, order.id).catch(() => null);
  const chosen = [];
  for (const l of lines) {
    const it = items.find((i) => i.fulfillmentLineItemId === l.fulfillmentLineItemId), qty = Math.floor(Number(l.quantity));
    if (!it || !(qty >= 1)) continue;
    if (isPP(it, s)) throw httpError(400, "Package Protection isn't returnable.");
    if (qty > it.returnableQty) throw httpError(400, `Only ${it.returnableQty} of ${it.title} can be returned.`);
    const e = eligibility(it, s, key, deliveredAt);
    if (!e.ok && !staffOverride) throw httpError(400, `${it.title}: ${e.why}`);
    const reason = rs.find((r) => r.id === l.reasonId);
    if (!reason) throw httpError(400, `Pick a reason for ${it.title}.`);
    if (!reason.sid) throw httpError(500, "Return reasons aren't set up in Shopify.");
    if (/^other\b/i.test(reason.name) && String(l.note || "").trim().length < 3) throw httpError(400, `Tell us a little about why you're returning ${it.title}.`);
    chosen.push({ ...it, quantity: qty, reasonId: reason.id, reasonSid: reason.sid, reasonName: reason.name, note: String(l.note || "").slice(0, 255) });
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
  const cr = await gql(st, RETURN_CREATE, { input: { orderId: order.id, returnLineItems: chosen.map((c) => ({ fulfillmentLineItemId: c.fulfillmentLineItemId, quantity: c.quantity, returnReasonDefinitionId: c.reasonSid, returnReasonNote: (c.reasonName + (c.note ? " — " + c.note : "")).slice(0, 255) })) } });
  userErrors(cr.returnCreate, "Shopify couldn't create the return");
  const sret = cr.returnCreate.return;
  // Return number = original order number + which return this is for that order: LB191494-R1, LB191494-R2, …
  const base = String(order.name || "").replace(/^#/, "").trim() || `${STORE_DEFS[key].prefix}${(await db(`SELECT nextval('hd_return_seq') n`)).rows[0].n}`;
  const taken = new Set((await db(`SELECT rma FROM hd_returns WHERE upper(rma) LIKE upper($1)`, [`${base}-R%`])).rows.map((x) => String(x.rma).toUpperCase()));
  let n = 1; while (taken.has(`${base}-R${n}`.toUpperCase())) n++;
  const rma = `${base}-R${n}`;

  // b) ShipStation label
  const weight = Number(s.packaging_oz) + chosen.reduce((w, c) => w + (c.weightOz || Number(s.default_item_oz)) * c.quantity, 0);
  let label; const linkNotes = [];
  try { label = await buyLabel(s, from, weight, rma, { test: !!s.test_labels, key, notes: linkNotes, tracking: (order.fulfillments || []).flatMap((f) => (f.trackingInfo || []).map((t) => t.number)), orderName: order.name, email: order.email, items: chosen.map((c) => ({ title: c.title, variant: c.variantTitle, sku: c.sku, quantity: c.quantity, unitPrice: c.unitPrice, weightOz: c.weightOz })), reasons: chosen.map((c) => c.reasonName).join(", ") }); }
  catch (err) {
    await gql(st, CANCEL, { id: sret.id }).catch(() => {});
    console.error("return label failed:", err.message);
    // Leave a trace staff can see (Activity log + Slack) — the customer only gets a friendly message.
    await core.audit({ kind: "return-label-failed", detail: `${order.name}: ${err.message}`, who: who || "customer (portal)" }).catch(() => {});
    core.slackPost(`⚠️ Return label failed for ${order.name} (${STORE_DEFS[key].name}): ${err.message}`).catch(() => {});
    throw httpError(502, source === "portal" ? "We couldn't create your shipping label. Please check your address, or email us and we'll help." : `Label failed: ${err.message}`);
  }
  const turl = label.test ? "#" : trackingUrl(label.carrier, label.trackingNumber);
  // Estimate the tax that comes back with the items (Shopify's own refund suggestion), for the summary the customer sees.
  let estTax = 0;
  try {
    const det0 = (await gql(st, RETURN_DETAIL, { id: sret.id })).return;
    const out0 = (await gql(st, SUGGEST, { id: sret.id, items: det0.returnLineItems.nodes.map((n) => ({ id: n.id, quantity: n.quantity })) })).return.suggestedFinancialOutcome;
    const ft0 = out0.financialTransfer || {};
    if (ft0.amount) estTax = Math.max(0, round2(Number(ft0.amount.shopMoney.amount) - Number(out0.discountedSubtotal.shopMoney.amount)));
  } catch (e) { console.error("return tax estimate:", e.message); }
  const rec = await putRec({
    id: crypto.randomUUID(), store: key, rma, status: "label_created", source, created_by: who || null, ticket_id: ticketId || null,
    order_id: order.id, order_name: order.name, customer_id: order.customer ? order.customer.id : null, email: order.email, customer_name: from.name,
    currency: order.currencyCode, refund_method: refundMethod, shopify_return_id: sret.id, shopify_return_name: sret.name,
    label_id: label.labelId, label_src: label.labelUrl, label_cost: label.cost, tracking_number: label.trackingNumber, tracking_url: turl, tracking_code: "NY",
    est_subtotal: round2(chosen.reduce((t, c) => t + c.unitPrice * c.quantity, 0)), est_tax: estTax, test_label: !!s.test_labels,
    phone: String(ad.phone || a.phone || ""), address: { name: from.name, address1: from.address_line1, address2: from.address_line2 || "", city: from.city_locality, state: from.state_province, zip: from.postal_code },
    items: chosen.map((c) => ({ fli: c.fulfillmentLineItemId, line_item_id: c.lineItemId, title: c.title, variant: c.variantTitle, sku: c.sku, quantity: c.quantity, unit_price: c.unitPrice, reason: c.reasonName, note: c.note, image: c.image || null })),
  }, `Return ${sret.name} created (${source}${who ? " · " + who : ""}); ${label.carrier || ""} label ${label.trackingNumber}${label.cost != null ? ` ($${label.cost}${label.test ? " quote" : ""})` : ""}${label.test ? " — TEST MODE: no label bought, nothing charged, customer not emailed" : ""}`);

  if (!label.test && linkNotes.length) await update(rec.id, {}, "ShipStation: " + linkNotes.join("; "));
  // Our branded confirmation email (portal returns). If it can't be sent, Shopify's own label email goes out instead.
  let ownSent = false;
  if (!label.test && source === "portal" && s.own_return_email !== false) {
    try { const r = await sendBranded("return_created", await getRec(rec.id)); ownSent = true; await update(rec.id, { ticket_id: r.ticket_id || null, own_email: true }, "Return email sent to the customer"); }
    catch (e) { console.error("return email:", e.message); await update(rec.id, {}, "Our return email failed (" + e.message + ") — Shopify's label email sent instead"); }
  }
  // c) Hand the label to Shopify → Shopify emails it to the customer. (Not in test mode — no real label exists.)
  if (!label.test) try {
    const det = await gql(st, RETURN_DETAIL, { id: sret.id });
    const rfo = det.return.reverseFulfillmentOrders.nodes[0];
    if (rfo) {
      const rd = await gql(st, REVERSE_DELIVERY, { rfo: rfo.id, url: label.labelUrl, num: label.trackingNumber, turl, notify: !ownSent });
      userErrors(rd.reverseDeliveryCreateWithShipping, "attach label");
      await update(rec.id, { label_emailed: true }, ownSent ? "Label attached to the Shopify return" : "Label emailed to the customer by Shopify");
    }
  } catch (e) { await update(rec.id, { label_emailed: false }, "Shopify didn't email the label: " + e.message); }

  await core.audit({ ticketId: ticketId || null, kind: "return-created", detail: `${rma} · ${order.name} · ${chosen.map((c) => `${c.quantity}× ${c.title}`).join(", ")} · ${refundMethod === "store_credit" ? "store credit" : "refund"}`, who: who || "customer (portal)", target: rec.id });
  core.slackPost(`↩️ Return ${rma} started for ${order.name} (${STORE_DEFS[key].name}) — ${chosen.map((c) => `${c.quantity}× ${c.title} (${c.reasonName})`).join(", ")} · ${refundMethod === "store_credit" ? "store credit" : "refund to card"}${source === "portal" ? " · via portal" : who ? ` · by ${who}` : ""}`).catch(() => {});
  return getRec(rec.id);
}
async function submitPortal(body) {
  const p = verify(body.token);
  const rec = await create({ key: p.k, orderId: p.o, lines: body.lines, refundMethod: body.refund_method, address: body.address, source: "portal" });
  return publicView(rec);
}
// From a Helpdesk ticket (staff, or Emily's approved action). Saves the label PDF so it rides along on the next reply.
async function createForTicket({ orderName, lines, refundMethod, ticketId, who, staffOverride }) {
  const key = keyForOrderName(orderName); if (!key) throw httpError(400, "Order number must start with LB or LBO.");
  const st = shopFor(key);
  const order = await findOrder(st, STORE_DEFS[key], orderName, null);
  if (!order) throw httpError(404, `Order ${orderName} not found.`);
  // Lines may name items by title/sku (from Emily) — map to fulfillment line items.
  const items = await returnableItems(st, order.id), rs = await reasons(st);
  const pickReason = (txt) => { const t = String(txt || "").toLowerCase(); return rs.find((r) => r.id === txt) || rs.find((r) => r.name.toLowerCase() === t) || rs.find((r) => t && (r.name.toLowerCase().includes(t) || t.includes(r.name.toLowerCase()))) || rs.find((r) => REASON_RULES.some(([m]) => m.test(t) && m.test(r.name))) || rs[rs.length - 1]; };
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
  let voided = false, why2 = "";
  if (!rec.label_id) { voided = true; why2 = " (test — no label was bought)"; }
  else { try { const v = await voidLabel(rec.label_id); voided = v.ok; if (!v.ok) why2 = ` — ShipStation said: ${v.message || "void refused"}. Void it in ShipStation or ask ShipStation for a refund`; } catch (e) { why2 = ` — ${e.message}`; } }
  try { await gql(shopFor(rec.store), CANCEL, { id: rec.shopify_return_id }); } catch (e) { await update(rec.id, {}, "Shopify cancel failed: " + e.message); }
  await core.audit({ ticketId: rec.ticket_id || null, kind: "return-cancelled", detail: `${rec.rma} · ${why}`, who: who || "system", target: rec.id });
  return update(rec.id, { status: "cancelled", label_voided: voided }, `${why}. Label ${voided ? "voided" : "NOT voided"}${why2}.`);
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
  const unused = rec.status === "label_created" && ["NY", "UN"].includes(t.code);
  if (unused && s.void_unused_after_days > 0 && age >= s.void_unused_after_days) {
    rec = await cancel(rec, `Not dropped off within ${s.void_unused_after_days} days — return closed`, "system");
    if (rec && rec.status === "cancelled") await dropoffEmail(rec, "closed").catch((e) => update(rec.id, {}, "Closing email failed: " + e.message));
    return;
  }
  if (unused && s.dropoff_reminder_days > 0 && age >= s.dropoff_reminder_days && !rec.reminder_sent) {
    try { await dropoffEmail(rec, "reminder"); await update(rec.id, { reminder_sent: new Date().toISOString() }, `Drop-off reminder emailed (day ${Math.floor(age)})`); }
    catch (e) { await update(rec.id, {}, "Drop-off reminder failed: " + e.message); }
  }
}
// Customer emails for an unused return label: a reminder before the deadline, and a note when the return is closed.
// Render + send one of the branded emails (emails.js) for a return, threaded into its Helpdesk ticket when it has one.
async function sendBranded(kind, rec, opts = {}) {
  const s = await settings(), def = STORE_DEFS[rec.store];
  const theme = opts.theme || await require("./returns-theme").published(rec.store);
  const view = await publicView(rec);
  const m = require("./emails").render(kind, { view, theme, def, base: portalUrl(rec.store, s).replace(/\/returns\/\w+$/, "") });
  if (rec.ticket_id && !opts.fresh) { try { await core.sendReply({ ticketId: String(rec.ticket_id), text: m.text, html: m.html, who: "Returns" }); return { ticket_id: rec.ticket_id }; } catch (_) {} }
  return core.sendNewEmail({ mailbox: def.support, to: rec.email, subject: m.subject, text: m.text, html: m.html, who: "Returns", tags: ["return", kind.replace("_", "-")], name: rec.customer_name });
}
async function dropoffEmail(rec, kind) {
  const r = await sendBranded(kind === "reminder" ? "return_reminder" : "return_closed", rec);
  if (!rec.ticket_id && r && r.ticket_id) await update(rec.id, { ticket_id: r.ticket_id });
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

/* ---------------- analytics (Helpdesk → Return analytics) ---------------- */
const TZ = "America/Chicago";
const ORDERS_COUNT = `query OrdersCount($q: String!) { ordersCount(query: $q, limit: null) { count precision } }`;
const ordersCache = new Map();   // "key|from|to" -> { at, n }
async function ordersInRange(key, fromIso, toIso) {
  const ck = `${key}|${fromIso}|${toIso}`, hit = ordersCache.get(ck);
  if (hit && Date.now() - hit.at < 15 * 60e3) return hit.n;
  const r = await gql(shopFor(key), ORDERS_COUNT, { q: `created_at:>='${fromIso}' created_at:<'${toIso}'` });
  const n = Number(r.ordersCount && r.ordersCount.count) || 0;
  ordersCache.set(ck, { at: Date.now(), n }); if (ordersCache.size > 500) ordersCache.clear();
  return n;
}
const isoDay = (d) => d.toISOString().slice(0, 10);
const addDays = (day, n) => { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); };
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 864e5);
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const FIT_RE = /fit|size|small|big|large|tight|loose/i;

function summarize(recs) {
  const live = recs.filter((r) => r.status !== "cancelled");
  const refunded = live.filter((r) => r.status === "refunded");
  const sum = (a, f) => round2(a.reduce((t, r) => t + (Number(f(r)) || 0), 0));
  const days = refunded.filter((r) => r.refunded_at).map((r) => (new Date(r.refunded_at) - new Date(r.created_at)) / 864e5);
  const credit = live.filter((r) => r.refund_method === "store_credit").length;
  const spend = sum(live, (r) => r.label_cost), fees = sum(live, (r) => r.fee_charged);
  return {
    returns: live.length, cancelled: recs.length - live.length, units: live.reduce((t, r) => t + r.items.reduce((u, i) => u + (Number(i.quantity) || 0), 0), 0),
    value: sum(live, (r) => r.est_subtotal), refunded: sum(refunded, (r) => r.refund_method === "store_credit" ? 0 : r.refunded_amount),
    store_credit: sum(refunded, (r) => r.refund_method === "store_credit" ? r.refunded_amount : 0),
    label_spend: spend, fees, net_shipping: round2(spend - fees), avg_value: live.length ? round2(sum(live, (r) => r.est_subtotal) / live.length) : 0,
    credit_share: live.length ? Math.round((credit / live.length) * 100) : 0, avg_days_to_refund: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
    open: live.filter((r) => ["label_created", "in_transit", "delivered"].includes(r.status)).length, attention: live.filter((r) => r.status === "needs_attention").length,
    in_transit: live.filter((r) => r.status === "in_transit").length, refunded_count: refunded.length,
  };
}

async function analytics({ from, to, store } = {}) {
  const s = await settings();
  const today = todayLocal();
  to = /^\d{4}-\d{2}-\d{2}$/.test(to || "") ? to : today;
  from = /^\d{4}-\d{2}-\d{2}$/.test(from || "") ? from : addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  const len = daysBetween(from, to) + 1;
  if (len > 3660) throw httpError(400, "Pick a range of 10 years or less");
  const pFrom = addDays(from, -len), pTo = addDays(from, -1);
  const args = [s.stats_since, pFrom, addDays(to, 1)];
  let w = `${STATS_WHERE} AND created_at >= ($2::date::timestamp AT TIME ZONE '${TZ}') AND created_at < ($3::date::timestamp AT TIME ZONE '${TZ}')`;
  if (store && STORE_DEFS[store]) { args.push(store); w += ` AND store=$${args.length}`; }
  const rows = (await db(`SELECT *, to_char(created_at AT TIME ZONE '${TZ}', 'YYYY-MM-DD') AS local_day FROM hd_returns WHERE ${w} ORDER BY created_at`, args)).rows;
  const all = rows.map((r) => ({ ...rowToRec(r), day: r.local_day }));
  const cur = all.filter((r) => r.day >= from), prev = all.filter((r) => r.day < from);
  const live = cur.filter((r) => r.status !== "cancelled"), prevLive = prev.filter((r) => r.status !== "cancelled");

  // trend buckets: day (≤ 92 days), week (≤ 1 yr), month
  const unit = len <= 92 ? "day" : len <= 366 ? "week" : "month";
  const bucketOf = (day) => {
    if (unit === "day") return day;
    if (unit === "month") return day.slice(0, 7) + "-01";
    const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return isoDay(d);   // Monday
  };
  const buckets = new Map();
  for (let d = from; d <= to; d = addDays(d, 1)) { const b = bucketOf(d); if (!buckets.has(b)) buckets.set(b, { start: b < from ? from : b, end: d, returns: 0, units: 0, value: 0, lb: 0, lbo: 0 }); buckets.get(b).end = d; }
  for (const r of live) { const b = buckets.get(bucketOf(r.day)); if (!b) continue; b.returns++; b[r.store] = (b[r.store] || 0) + 1; b.units += r.items.reduce((u, i) => u + (Number(i.quantity) || 0), 0); b.value = round2(b.value + (Number(r.est_subtotal) || 0)); }

  // reasons (by units — one return can hold several items with different reasons)
  const reasonTally = (recs) => { const m = new Map(); for (const r of recs) for (const i of r.items) { const k = i.reason || "No reason"; const x = m.get(k) || { reason: k, units: 0, value: 0, returns: new Set() }; x.units += Number(i.quantity) || 0; x.value = round2(x.value + (Number(i.unit_price) || 0) * (Number(i.quantity) || 0)); x.returns.add(r.id); m.set(k, x); } return m; };
  const rc = reasonTally(live), rp = reasonTally(prevLive);
  const totalUnits = [...rc.values()].reduce((t, x) => t + x.units, 0);
  const order = (s.reasons || DEFAULTS.reasons);
  const reasons = [...new Set([...order, ...rc.keys()])].map((k) => { const x = rc.get(k) || { units: 0, value: 0, returns: new Set() }; return { reason: k, units: x.units, value: x.value, returns: x.returns.size, share: totalUnits ? Math.round((x.units / totalUnits) * 1000) / 10 : 0, prev_units: (rp.get(k) || { units: 0 }).units }; })
    .filter((x) => x.units || x.prev_units || order.includes(x.reason)).sort((a, b) => b.units - a.units);

  // products + variants
  const pm = new Map();
  for (const r of live) for (const i of r.items) {
    const k = i.title || "Unknown item"; const p = pm.get(k) || { title: k, units: 0, value: 0, returns: new Set(), reasons: {}, variants: {}, skus: new Set(), stores: new Set() };
    const q = Number(i.quantity) || 0; p.units += q; p.value = round2(p.value + (Number(i.unit_price) || 0) * q); p.returns.add(r.id); p.stores.add(r.store);
    const rs = i.reason || "No reason"; p.reasons[rs] = (p.reasons[rs] || 0) + q; if (i.variant) p.variants[i.variant] = (p.variants[i.variant] || 0) + q; if (i.sku) p.skus.add(i.sku); pm.set(k, p);
  }
  const products = [...pm.values()].map((p) => { const top = Object.entries(p.reasons).sort((a, b) => b[1] - a[1]); return { title: p.title, units: p.units, value: p.value, returns: p.returns.size, top_reason: top[0] ? top[0][0] : "", top_reason_units: top[0] ? top[0][1] : 0, reasons: p.reasons, variants: Object.entries(p.variants).sort((a, b) => b[1] - a[1]).slice(0, 6), skus: [...p.skus].slice(0, 5), stores: [...p.stores] }; })
    .sort((a, b) => b.units - a.units || b.value - a.value);
  const vm = new Map();
  for (const r of live) for (const i of r.items) { if (!FIT_RE.test(i.reason || "")) continue; const k = `${i.title || "Unknown item"}\u0000${i.variant || ""}`; vm.set(k, (vm.get(k) || 0) + (Number(i.quantity) || 0)); }
  const fit_sizes = [...vm.entries()].map(([k, units]) => { const [title, variant] = k.split("\u0000"); return { title, variant, units }; }).sort((a, b) => b.units - a.units).slice(0, 12);

  // customers who returned more than once in the range
  const cm = new Map();
  for (const r of live) { const k = (r.email || "").toLowerCase(); if (!k) continue; const c = cm.get(k) || { email: r.email, name: r.customer_name, returns: 0, units: 0, value: 0, orders: new Set() }; c.returns++; c.units += r.items.reduce((u, i) => u + (Number(i.quantity) || 0), 0); c.value = round2(c.value + (Number(r.est_subtotal) || 0)); c.orders.add(r.order_name); cm.set(k, c); }
  const repeat = [...cm.values()].filter((c) => c.returns > 1).map((c) => ({ ...c, orders: [...c.orders] })).sort((a, b) => b.returns - a.returns).slice(0, 15);

  // what customers wrote
  const comments = [];
  for (const r of live.slice().reverse()) for (const i of r.items) if (i.note && String(i.note).trim()) comments.push({ at: r.created_at, rma: r.rma, id: r.id, order: r.order_name, title: i.title, variant: i.variant, reason: i.reason, note: String(i.note).slice(0, 400) });

  // return rate (returns ÷ orders placed in the same range, from Shopify)
  const keys = store && STORE_DEFS[store] ? [store] : Object.keys(STORE_DEFS);
  const fromIso = (d) => { const p = new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "longOffset" }).formatToParts(new Date(d + "T12:00:00Z")).find((x) => x.type === "timeZoneName").value.replace("GMT", "") || "+00:00"; return new Date(`${d}T00:00:00${p}`).toISOString(); };
  let orders = null, prevOrders = null, ordersErr = null;
  try {
    const n = await Promise.all(keys.map((k) => Promise.all([ordersInRange(k, fromIso(from), fromIso(addDays(to, 1))), ordersInRange(k, fromIso(pFrom), fromIso(from))])));
    orders = n.reduce((t, x) => t + x[0], 0); prevOrders = n.reduce((t, x) => t + x[1], 0);
  } catch (e) { ordersErr = "Order counts unavailable from Shopify"; console.error("return analytics orders:", e.message); }
  const rate = (ret, ord) => (ord ? Math.round((ret / ord) * 1000) / 10 : null);
  const summary = summarize(cur), previous = summarize(prev);
  summary.orders = orders; summary.return_rate = rate(summary.returns, orders); previous.orders = prevOrders; previous.return_rate = rate(previous.returns, prevOrders);

  const split = (f) => { const m = {}; for (const r of live) { const k = f(r); m[k] = (m[k] || 0) + 1; } return m; };
  return {
    from, to, days: len, prev_from: pFrom, prev_to: pTo, store: store || "", unit, stats_since: s.stats_since, orders_error: ordersErr,
    summary, previous, trend: [...buckets.values()], reasons, products: products.slice(0, 25), product_count: products.length, fit_sizes, repeat,
    comments: comments.slice(0, 40), by_store: split((r) => r.store), by_method: split((r) => r.refund_method === "store_credit" ? "store_credit" : "original"), by_source: split((r) => r.source === "portal" ? "portal" : "staff"),
    by_status: split((r) => r.status),
    list: cur.slice().reverse().slice(0, 500).map((r) => ({ id: r.id, rma: r.rma, store: r.store, status: r.status, order: r.order_name, customer: r.customer_name, email: r.email, created_at: r.created_at, method: r.refund_method, value: r.est_subtotal, refunded: r.refunded_amount, label_cost: r.label_cost, items: r.items.map((i) => ({ title: i.title, variant: i.variant, quantity: i.quantity, reason: i.reason, note: i.note })) })),
  };
}
async function resetStats(who) { const s = await saveSettings({ stats_since: new Date().toISOString() }, who); return s.stats_since; }

/* ---------------- what Emily tells customers ---------------- */
async function portalRule() {
  const s = await settings();
  if (!s.portal_live) return "";
  return `\n\nRETURNS PORTAL (this overrides any Loop links anywhere above — Loop is retired): send customers to our own returns portal, picked by order prefix (LBO before LB): ` +
    `LBO = Larkspur Baby Outlet → ${portalUrl("lbo", s)} ; LB = Larkspur Baby → ${portalUrl("lb", s)} . ` +
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
  try { if (!(await core.syncGet("returns_windows_v4_29"))) { await saveSettings({ window_days: { lb: 7, lbo: 7 }, claim_window_days: 30, marked_delivered_window_days: 5 }, "system (v4.29 windows)"); await core.syncSet("returns_windows_v4_29", "done", {}); console.log("↩️  Returns: windows set — returns 7 days, defects 30 days, marked-delivered 5 days (from delivery)"); } } catch (e) { console.error("returns windows:", e.message); }
  const s = await settings();
  const p = setupProblems(s);
  console.log(`↩️  Returns: portal ${s.portal_live ? "LIVE" : "set up, not live yet"} · tracking every ${mins} min · ${s.test_labels ? "TEST mode (no labels bought)" : "real labels"}${p.length ? `\n   ⚠️  ${p.join("; ")}` : ""}`);
}

module.exports = { sendBranded, publicView, viewReturn, customerCancel, saveFeedback, printPdf, isPP, sign, verify, shopFor, gql, rowToRec, DEFAULTS, analytics, resetStats, portalUrl, storeForHost, ssStores, init, settings, saveSettings, setupProblems, STORE_DEFS, lookup, staffLookup, submitPortal, createForTicket, refund, cancel, checkOne, poll, list, counts, getRec, csv, carriers, labelToken, portalRule, httpError, keyForOrderName };
