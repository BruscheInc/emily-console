/**
 * Loop → Buzzin: bring the returns that were still open in Loop into Buzzin's returns system.
 *
 * Input: Loop's "ASN Report" .xlsx exports (one per store). Only returns with Status = open are looked at.
 * Each one is checked against Shopify (Loop created a Shopify return with the label's tracking number), then:
 *   - label made, not dropped off yet, still inside the drop-off window  → tracked like a new return
 *   - on its way back                                                     → tracked like a new return
 *   - delivered back in the last 14 days                                  → refunded the same way as a new return
 *   - delivered back long ago and never refunded, or "in transit" for months → Needs attention (a person decides)
 *   - exchanges, labels never used past the window, Shopify return already closed → skipped (listed, not imported)
 * Nothing is emailed to customers on import — they already have Loop's label and emails.
 */
const crypto = require("crypto");
const core = require("./core");
const { db } = core;
const R = () => require("./returns");

const STALE_DAYS = 60;          // older than this, a "delivered" or "in transit" Loop return goes to a person
const RECENT_DELIVERED_DAYS = 14;

/* ---------------- read the .xlsx ---------------- */
function cellValue(v) {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text != null) return v.text;
    if (v.result != null) return v.result;
    return null;
  }
  return v;
}
async function parseXlsx(buf) {
  const ExcelJS = require("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const head = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { head[i] = String(cellValue(c.value) || "").trim(); });
  if (!head.includes("Return ID") || !head.includes("Status") || !head.includes("Order Name")) throw new Error("This doesn't look like a Loop ASN report (needs Return ID, Status and Order Name columns).");
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n === 1) return;
    const o = {};
    row.eachCell({ includeEmpty: true }, (c, i) => { if (head[i]) o[head[i]] = cellValue(c.value); });
    if (o["Return ID"] != null) rows.push(o);
  });
  return rows;
}
// Loop exports dates without a time zone (UTC). ExcelJS reads them as UTC dates already.
const asDate = (v) => { if (!v) return null; const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? null : d; };
const days = (a, b = new Date()) => (b.getTime() - a.getTime()) / 86400e3;
const fmtDay = (d) => d ? d.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" }) : "";

function storeFor(fileName, orderName) {
  const f = String(fileName || "").toUpperCase(), n = String(orderName || "").replace(/^#/, "").toUpperCase();
  if (n.startsWith("LBO")) return "lbo";
  if (n.startsWith("BB")) return "bb";
  if (n.startsWith("LB")) return "lb";
  if (/(^|[_\-\s])LBO([_\-\s.]|$)/.test(f)) return "lbo";
  if (/(^|[_\-\s])BB([_\-\s.]|$)/.test(f)) return "bb";
  if (/(^|[_\-\s])LB([_\-\s.]|$)/.test(f)) return "lb";
  return null;
}

/* ---------------- group the report into returns ---------------- */
function groupOpen(files) {
  const out = new Map(); let total = 0, open = 0;
  for (const f of files) for (const r of f.rows) {
    total++;
    if (String(r["Status"] || "").toLowerCase() !== "open") continue;
    open++;
    const id = String(r["Return ID"]);
    if (!out.has(id)) out.set(id, {
      loop_id: id, file: f.name, store: storeFor(f.name, r["Order Name"]), order_name: String(r["Order Name"] || "").trim(),
      email: String(r["Customer E-Mail"] || "").trim().toLowerCase(), submitted: asDate(r["Return Submitted Date"]),
      label_status: String(r["Label Status"] || "").toLowerCase() || "none", label_updated: asDate(r["Label Last Updated Date"]),
      delivered: asDate(r["Date Delivered"]), outcome: String(r["Return Outcome"] || ""), carrier: String(r["Carrier"] || "USPS"),
      tracking: r["Tracking Number"] ? String(r["Tracking Number"]).trim() : null, loop_tracking_url: r["Integration Tracking URL"] || null, lines: [],
    });
    out.get(id).lines.push({ title: String(r["Product Title"] || ""), sku: r["SKU"] ? String(r["SKU"]) : null, reason: String(r["Reason"] || ""), price: Number(r["Purchase Price"]) || 0 });
  }
  return { returns: [...out.values()], total, open };
}

/* ---------------- what should happen to each one (before looking at Shopify) ---------------- */
function classify(x, s) {
  const age = x.submitted ? days(x.submitted) : 9999;
  const skip = (why) => ({ action: "skip", why });
  if (x.store === "bb") return skip("Bumbunny is closed");
  if (!x.store) return skip("Couldn't tell which store this is from");
  if (!/^refund$/i.test(x.outcome.trim())) return skip(/exchange/i.test(x.outcome) ? `${x.outcome} — Loop already handled the exchange` : `${x.outcome || "No outcome"} — not a refund`);
  if (!x.tracking) return skip("No return label in Loop");
  const ls = x.label_status;
  if (ls === "delivered") {
    const d = x.delivered || x.label_updated;
    if (d && days(d) <= RECENT_DELIVERED_DAYS) return { action: "refund", status: "delivered", why: `Delivered back ${fmtDay(d)} — refund the same way as a new return` };
    return { action: "review", status: "needs_attention", why: `Loop shows it delivered back on ${fmtDay(d)}, but it was never refunded. Check the items, then click Refund now (or Cancel).` };
  }
  if (["in_transit", "out_for_delivery", "available_for_pickup", "return_to_sender", "failure"].includes(ls)) {
    if (age <= STALE_DAYS) return { action: "track", status: "in_transit", why: "On its way back" };
    return { action: "review", status: "needs_attention", why: `Loop has shown it in transit since ${fmtDay(x.label_updated || x.submitted)} and it never arrived. Decide whether to refund.` };
  }
  // new / pre_transit / error / none: label made, not dropped off
  if (age < Number(s.void_unused_after_days || 28)) return { action: "track", status: "label_created", why: `Label made ${fmtDay(x.submitted)}, not dropped off yet` };
  return skip(`Label never used and the ${s.void_unused_after_days || 28}-day drop-off window passed (${fmtDay(x.submitted)})`);
}

/* ---------------- Shopify check ---------------- */
const ORDER_RETURNS = `query LoopOrder($q: String!) { orders(first: 5, query: $q) { nodes {
  id name email currencyCode customer { id } shippingAddress { name } billingAddress { name }
  refunds { createdAt totalRefundedSet { shopMoney { amount } } }
  returns(first: 20) { nodes { id name status createdAt
    returnLineItems(first: 50) { nodes { id quantity ... on ReturnLineItem { fulfillmentLineItem { id lineItem { id title variantTitle sku image { url(transform: { maxWidth: 200 }) } discountedUnitPriceAfterAllDiscountsSet { shopMoney { amount } } } } } } }
    reverseFulfillmentOrders(first: 5) { nodes { reverseDeliveries(first: 5) { nodes { deliverable { ... on ReverseDeliveryShippingDeliverable { tracking { number } } } } } } } } } } } }`;
async function shopifyFor(x) {
  const st = R().shopFor(x.store);
  const name = x.order_name.replace(/^#/, "").trim();
  const d = await R().gql(st, ORDER_RETURNS, { q: `name:${name}` });
  const order = (d.orders.nodes || []).find((o) => o.name.replace(/^#/, "").toUpperCase() === name.toUpperCase());
  if (!order) return { why: `Order ${x.order_name} not found in Shopify` };
  const rets = order.returns.nodes || [];
  const trk = (r) => r.reverseFulfillmentOrders.nodes.flatMap((f) => f.reverseDeliveries.nodes.map((v) => v.deliverable && v.deliverable.tracking && v.deliverable.tracking.number)).filter(Boolean);
  const match = rets.find((r) => trk(r).includes(x.tracking)) || (rets.filter((r) => r.status === "OPEN").length === 1 ? rets.find((r) => r.status === "OPEN") : null);
  if (!match) return { order, why: "No matching return in Shopify" };
  if (match.status !== "OPEN") return { order, ret: match, why: `Shopify return ${match.name} is ${match.status.toLowerCase()} — already handled` };
  const since = new Date(match.createdAt).getTime() - 60e3;
  const refundedAfter = (order.refunds || []).filter((f) => new Date(f.createdAt).getTime() >= since).reduce((t, f) => t + Number(f.totalRefundedSet.shopMoney.amount || 0), 0);
  return { order, ret: match, refundedAfter: Math.round(refundedAfter * 100) / 100 };
}

/* ---------------- preview / import ---------------- */
async function run(files, { apply = false, who = "staff" } = {}) {
  const s = await R().settings();
  const parsed = [];
  for (const f of files) parsed.push({ name: f.name, rows: await parseXlsx(f.buffer) });
  const g = groupOpen(parsed);
  const have = new Set((await db(`SELECT data->>'loop_return_id' l, data->>'shopify_return_id' s FROM hd_returns WHERE data->>'loop_return_id' IS NOT NULL OR data->>'source' = 'loop'`)).rows.flatMap((r) => [r.l, r.s]).filter(Boolean));
  const allShopifyReturns = new Set((await db(`SELECT data->>'shopify_return_id' s FROM hd_returns`)).rows.map((r) => r.s).filter(Boolean));
  const out = [];
  for (const x of g.returns.sort((a, b) => (b.submitted || 0) - (a.submitted || 0))) {
    const base = { loop_id: x.loop_id, store: x.store, order_name: x.order_name, email: x.email, submitted: x.submitted, label_status: x.label_status, outcome: x.outcome, tracking: x.tracking, items: x.lines.length, value: Math.round(x.lines.reduce((t, l) => t + l.price, 0) * 100) / 100 };
    if (have.has(x.loop_id)) { out.push({ ...base, action: "skip", why: "Already imported" }); continue; }
    let c = classify(x, s);
    if (c.action === "skip") { out.push({ ...base, ...c }); continue; }
    let sh;
    try { sh = await shopifyFor(x); } catch (e) { out.push({ ...base, action: "error", why: e.message }); continue; }
    if (!sh.ret || sh.ret.status !== "OPEN") { out.push({ ...base, action: "skip", why: sh.why }); continue; }
    if (allShopifyReturns.has(sh.ret.id)) { out.push({ ...base, action: "skip", why: `${sh.ret.name} is already in Buzzin` }); continue; }
    if (sh.refundedAfter > 0) c = { action: "review", status: "needs_attention", why: `Shopify already shows $${sh.refundedAfter.toFixed(2)} refunded on this order since the return started — check before refunding. (${c.why})` };
    const row = { ...base, ...c, rma: sh.ret.name.replace(/^#/, ""), shopify_return: sh.ret.name };
    if (apply) {
      try { const rec = await createRecord(x, c, sh, s, who); row.imported = rec.id; row.result = rec.status; }
      catch (e) { row.action = "error"; row.why = e.message; }
    }
    out.push(row);
  }
  const count = (a) => out.filter((r) => r.action === a).length;
  const summary = { lines: g.total, open_lines: g.open, open_returns: g.returns.length, track: count("track"), refund: count("refund"), review: count("review"), skip: count("skip"), error: count("error") };
  if (apply) {
    const n = out.filter((r) => r.imported).length;
    await core.audit({ kind: "loop-import", detail: `Imported ${n} open Loop return${n === 1 ? "" : "s"} (${summary.track} tracking, ${summary.refund} refunding, ${summary.review} needs attention; ${summary.skip} skipped)`, who }).catch(() => {});
    core.slackPost(`↩️ ${who} imported ${n} open Loop return${n === 1 ? "" : "s"} into Buzzin — ${summary.track} being tracked, ${summary.review} need a person${summary.refund ? `, ${summary.refund} refunding now` : ""}; ${summary.skip} skipped.`).catch(() => {});
  }
  return { summary, returns: out, usps_tracking: R().trackerReady() };
}

async function createRecord(x, c, sh, s, who) {
  const { order, ret } = sh, st = R().shopFor(x.store);
  const reasonFor = (sku, title) => { const l = x.lines.find((l) => (sku && l.sku === sku) || (title && l.title.startsWith(title))); return l ? l.reason : ""; };
  const items = ret.returnLineItems.nodes.filter((n) => n.fulfillmentLineItem).map((n) => {
    const li = n.fulfillmentLineItem.lineItem;
    return { fli: n.fulfillmentLineItem.id, line_item_id: li.id, title: li.title, variant: li.variantTitle, sku: li.sku, quantity: n.quantity,
      unit_price: Number(li.discountedUnitPriceAfterAllDiscountsSet.shopMoney.amount), reason: reasonFor(li.sku, li.title), note: "", image: (li.image && li.image.url) || null };
  });
  let estTax = 0;
  try {
    const out = (await R().gql(st, R().Q.SUGGEST, { id: ret.id, items: ret.returnLineItems.nodes.map((n) => ({ id: n.id, quantity: n.quantity })) })).return.suggestedFinancialOutcome;
    const ft = out.financialTransfer || {};
    if (ft.amount) estTax = Math.max(0, Math.round((Number(ft.amount.shopMoney.amount) - Number(out.discountedSubtotal.shopMoney.amount)) * 100) / 100);
  } catch (e) { console.error("loop import tax estimate:", e.message); }
  const num = x.tracking;
  const rec = {
    id: crypto.randomUUID(), store: x.store, rma: ret.name.replace(/^#/, ""), status: c.status, source: "loop", created_by: who, ticket_id: null,
    loop_return_id: x.loop_id, loop_tracking_url: x.loop_tracking_url, loop_label_status: x.label_status,
    order_id: order.id, order_name: order.name, customer_id: order.customer ? order.customer.id : null, email: order.email || x.email,
    customer_name: (order.shippingAddress && order.shippingAddress.name) || (order.billingAddress && order.billingAddress.name) || "",
    currency: order.currencyCode, refund_method: "original", shopify_return_id: ret.id, shopify_return_name: ret.name,
    label_id: null, label_src: null, label_cost: null, label_fee: Number(s.label_fee), carrier: x.carrier || "USPS",
    tracking_number: num, tracking_url: R().trackingUrl(x.carrier, num), tracking_code: c.status === "label_created" ? "NY" : c.status === "in_transit" ? "IT" : "DE",
    accepted_at: c.status === "in_transit" ? (x.label_updated || x.submitted || new Date()).toISOString() : null,
    delivered_at: c.status === "delivered" || x.label_status === "delivered" ? (x.delivered || x.label_updated || new Date()).toISOString() : null,
    est_subtotal: Math.round(items.reduce((t, i) => t + i.unit_price * i.quantity, 0) * 100) / 100, est_tax: estTax, test_label: false,
    label_emailed: true, own_email: false, reminder_sent: "loop",   // the customer already has Loop's label and emails
    items,
  };
  await R().putRec(rec, `Imported from Loop (return ${x.loop_id}, started ${fmtDay(x.submitted)}) by ${who}. Loop label ${num} — Loop status: ${x.label_status.replace(/_/g, " ")}. Label fee on refund: $${Number(s.label_fee).toFixed(2)}.`);
  if (x.submitted) await db(`UPDATE hd_returns SET created_at=$2 WHERE id=$1`, [rec.id, x.submitted.toISOString()]);
  let saved = await R().getRec(rec.id);
  saved = await R().update(saved.id, {}, c.why);
  if (c.action === "refund" && s.auto_refund) {
    try { saved = await R().refund(saved, { who: "auto" }); } catch (e) { saved = await R().update(saved.id, { status: "needs_attention" }, "Auto refund failed: " + e.message); }
  }
  return saved;
}

module.exports = { run, parseXlsx, groupOpen, classify, storeFor };
