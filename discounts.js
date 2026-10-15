/**
 * Live discount lookup (Larkspur Baby only — the Outlet takes and offers no discounts).
 *
 * Reads the store's discounts from Shopify so Emily (chat and email) can answer "my code isn't working":
 * the right spelling, whether it's active, when it ends, what it applies to, minimums, and why it may not apply.
 *
 * Privacy: Emily only talks about codes the customer names (or a near-miss spelling of one). Single-use codes and
 * codes limited to specific customers are never revealed. She doesn't list codes nobody asked about.
 */
const E = () => require("./emily");
const CACHE = new Map();   // "LB" → { at, codes, autos }
const SHOP_URL = { LB: "https://larkspurbaby.com" };
const TTL = 10 * 60e3;
// Codes only given when the customer asks for them by name or purpose (never suggested as a "did you mean").
const ASK_ONLY = /^thankyoumilitary$/i;

const FIELDS = `title status summary startsAt endsAt asyncUsageCount
  combinesWith { orderDiscounts productDiscounts shippingDiscounts }`;
const CODE_FIELDS = `${FIELDS} usageLimit appliesOncePerCustomer codes(first: 3) { nodes { code } }
  customerSelection { __typename }`;
const BASIC_EXTRA = `minimumRequirement { __typename ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount } } ... on DiscountMinimumQuantity { greaterThanOrEqualToQuantity } }
  customerGets { appliesOnOneTimePurchase items { __typename ... on AllDiscountItems { allItems } ... on DiscountCollections { collections(first: 6) { nodes { title handle } } } ... on DiscountProducts { products(first: 6) { nodes { title } } } } }`;
const CODE_FRAGS = `... on DiscountCodeBasic { ${CODE_FIELDS} ${BASIC_EXTRA} }
  ... on DiscountCodeBxgy { ${CODE_FIELDS} }
  ... on DiscountCodeFreeShipping { ${CODE_FIELDS} minimumRequirement { __typename ... on DiscountMinimumSubtotal { greaterThanOrEqualToSubtotal { amount } } } }
  ... on DiscountCodeApp { ${CODE_FIELDS.replace("summary ", "")} }`;
const AUTO_FRAGS = `... on DiscountAutomaticBasic { ${FIELDS} ${BASIC_EXTRA} }
  ... on DiscountAutomaticBxgy { ${FIELDS} }
  ... on DiscountAutomaticFreeShipping { ${FIELDS} }
  ... on DiscountAutomaticApp { ${FIELDS.replace("summary ", "")} }`;

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

function shape(n, kind, prefix) {
  const d = n || {};
  const items = d.customerGets && d.customerGets.items;
  const appliesTo = !items ? null : items.allItems ? "all items" : items.collections ? "collections: " + items.collections.nodes.map((c) => c.title).join(", ")
    : items.products ? "products: " + items.products.nodes.map((p) => p.title).join(", ") : null;
  const mr = d.minimumRequirement || null;
  const minimum = !mr ? null : mr.greaterThanOrEqualToSubtotal ? `$${Number(mr.greaterThanOrEqualToSubtotal.amount)} minimum subtotal` : mr.greaterThanOrEqualToQuantity ? `${mr.greaterThanOrEqualToQuantity} items minimum` : null;
  const code = d.codes && d.codes.nodes && d.codes.nodes[0] ? d.codes.nodes[0].code : null;
  const used = Number(d.asyncUsageCount || 0);
  // Never revealed: one-time / customer-specific codes, Emily's goodwill codes, and test or 100%-off codes.
  const privateCode = kind === "code" && ((d.customerSelection && d.customerSelection.__typename !== "DiscountCustomerAll") || Number(d.usageLimit) === 1 || /^EMILY/i.test(code || "")
    || /test/i.test(`${code || ""} ${d.title || ""}`) || /\b100% off\b/i.test(d.summary || ""));
  return {
    kind, code, title: d.title, status: String(d.status || "").toLowerCase(), summary: d.summary || null,
    starts: d.startsAt || null, ends: d.endsAt || null, applies_to: appliesTo, minimum,
    once_per_customer: !!d.appliesOncePerCustomer,
    used_up: d.usageLimit ? used >= Number(d.usageLimit) : false,
    combines_with_other_discounts: d.combinesWith ? !!(d.combinesWith.productDiscounts || d.combinesWith.orderDiscounts) : null,
    ...(code && SHOP_URL[prefix] ? { link: `${SHOP_URL[prefix]}/discount/${encodeURIComponent(code)}` } : {}),
    private: privateCode,
  };
}

async function load(prefix = "LB") {
  const c = CACHE.get(prefix); if (c && Date.now() - c.at < TTL) return c;
  const st = E().storeForPrefix(prefix); if (!st) throw new Error(`No Shopify store set up for ${prefix}.`);
  const g = E().claimsKit().storeGraphQL;
  const q = `query { codes: codeDiscountNodes(first: 100, query: "status:active OR status:scheduled") { nodes { codeDiscount { __typename ${CODE_FRAGS} } } }
                     autos: automaticDiscountNodes(first: 30, query: "status:active OR status:scheduled") { nodes { automaticDiscount { __typename ${AUTO_FRAGS} } } } }`;
  const d = await g(st, q);
  const v = { at: Date.now(), st,
    codes: (d.codes ? d.codes.nodes : []).map((n) => shape(n.codeDiscount, "code", prefix)).filter((x) => x.code),
    autos: (d.autos ? d.autos.nodes : []).map((n) => shape(n.automaticDiscount, "automatic", prefix)) };
  CACHE.set(prefix, v); return v;
}

async function byCode(prefix, code) {
  const st = E().storeForPrefix(prefix); if (!st) return null;
  try { const d = await E().claimsKit().storeGraphQL(st, `query($c:String!){ codeDiscountNodeByCode(code:$c){ codeDiscount { __typename ${CODE_FRAGS} } } }`, { c: code });
    return d.codeDiscountNodeByCode ? shape(d.codeDiscountNodeByCode.codeDiscount, "code", prefix) : null; } catch (_) { return null; }
}

// Words in a message that could be a discount code.
function candidates(text) {
  const t = String(text || "");
  const out = new Set();
  for (const m of t.matchAll(/\b(?:code|coupon|promo|discount)\s*(?:is|was|of|:|-)?\s*["“']?([A-Za-z0-9][A-Za-z0-9_-]{2,29})/gi)) out.add(m[1]);
  for (const m of t.matchAll(/["“']([A-Za-z0-9][A-Za-z0-9_-]{2,29})["”']/g)) out.add(m[1]);
  for (const m of t.matchAll(/\b([A-Z0-9][A-Z0-9_-]{3,29})\b/g)) if (/[A-Z]/.test(m[1]) && !/^(LBO?|BB)\d+$/.test(m[1]) && !/^(USPS|UPS|FEDEX|USA|ZIP|FAQ|SMS|VIP|OK)$/.test(m[1])) out.add(m[1]);
  return [...out].filter((w) => !/^(is|was|the|for|and|not|that|this|isnt|working|code|codes)$/i.test(w)).slice(0, 6);
}

const publicView = (x) => { const { private: _p, ...rest } = x; return rest; };

/** What we know about the codes a customer mentioned, plus the store's automatic sales. */
async function check(prefix, text, { codes = [] } = {}) {
  if (prefix !== "LB") return { store: prefix, note: "Larkspur Baby Outlet takes and offers no discount codes or discounts of any kind." };
  const v = await load("LB");
  const asked = [...new Set([...codes, ...candidates(text)].map((c) => String(c).trim()).filter(Boolean))];
  const results = [];
  for (const w of asked) {
    const n = norm(w);
    let hit = v.codes.find((c) => norm(c.code) === n) || null;
    if (!hit) hit = await byCode("LB", w);                       // exact, any status (expired, scheduled, private)
    if (hit) { results.push(hit.private ? { asked: w, found: true, private: true, note: "This is a one-time or customer-specific code — don't share details; the team can help." } : { asked: w, found: true, ...publicView(hit) }); continue; }
    const near = v.codes.filter((c) => !c.private && !ASK_ONLY.test(c.code)).map((c) => [c, lev(n, norm(c.code))]).filter(([c, dist]) => dist <= 2 || (norm(c.code).startsWith(n) && norm(c.code).length - n.length <= 2) || (n.startsWith(norm(c.code)) && n.length - norm(c.code).length <= 2))
      .sort((a, b) => a[1] - b[1])[0];
    results.push(near ? { asked: w, found: false, did_you_mean: publicView(near[0]) } : { asked: w, found: false, note: "No discount with this code exists at Larkspur Baby." });
  }
  return { store: "LB", checked_at: new Date(v.at).toISOString(), codes_asked: results, automatic_sales: v.autos.filter((a) => a.status === "active").map(publicView) };
}

module.exports = { check, load, candidates, _q: { CODE_FRAGS, AUTO_FRAGS } };
