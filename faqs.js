/* =============================================================================================
 *  Website FAQs — keep the store's FAQ page in line with the rules Buzzin actually runs.
 *
 *  The FAQ page (pages/faqs) is built from the live theme's templates/page.faqs.json: each "faqs"
 *  section is a group, each "item" block a question with an HTML answer. Buzzin reads that file,
 *  Emily suggests updated answers from the current Returns / Claims settings, staff review every
 *  change, and Publish writes the file back. The previous version is kept so a publish can be undone.
 *
 *  Needs the Emily Shopify app's read_themes (read) and write_themes (publish) permissions.
 * ============================================================================================= */
const crypto = require("crypto");
const core = require("./core");
const { db } = core;
const R = () => require("./returns");
const K = () => require("./emily").claimsKit();
const FILE = "templates/page.faqs.json";
const SHOP_VER = process.env.SHOPIFY_API_VERSION || "2025-07";

function httpError(status, message) { const e = new Error(message); e.status = status; return e; }

async function gql(st, query, variables = {}) {
  const token = await require("./emily").storeToken(st);
  const res = await fetch(`https://${st.domain}/admin/api/${SHOP_VER}/graphql.json`, { method: "POST", headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const j = await res.json();
  if (j.errors) {
    const msg = (Array.isArray(j.errors) ? j.errors.map((e) => e.message).join("; ") : String(j.errors));
    if (/access denied|access scope|ACCESS_DENIED/i.test(msg + JSON.stringify(j.errors))) throw httpError(403, `${st.brand}: the Emily Shopify app needs the read_themes and write_themes permissions to manage the FAQ page.`);
    throw httpError(502, `${st.brand}: Shopify error — ${msg.slice(0, 200)}`);
  }
  return j.data;
}
const canWrite = (st) => /\bwrite_themes\b/.test((st.tok && st.tok.scope) || "");

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS hd_faq_versions (id BIGSERIAL PRIMARY KEY, store TEXT NOT NULL, theme_id TEXT, content TEXT NOT NULL, note TEXT, created_by TEXT, created_at TIMESTAMPTZ DEFAULT now())`);
}
async function init() { try { await migrate(); } catch (e) { console.error("faqs migrate:", e.message); } schedule(); }

/* ---------------- reading the template ---------------- */
const READ_Q = `query($f:[String!]!){ themes(first: 1, roles: [MAIN]) { nodes { id name files(filenames: $f, first: 1) { nodes { filename checksumMd5 body { ... on OnlineStoreThemeFileBodyText { content } } } } } } }`;
// The file starts with Shopify's "auto-generated" comment block; keep it exactly as it was when writing back.
function splitHeader(content) {
  const m = String(content).match(/^\s*\/\*[\s\S]*?\*\/\s*/);
  return m ? { header: m[0], json: content.slice(m[0].length) } : { header: "", json: content };
}
async function readTemplate(store) {
  const st = R().shopFor(store);
  const d = await gql(st, READ_Q, { f: [FILE] });
  const theme = d.themes.nodes[0];
  if (!theme) throw httpError(404, "No live theme found.");
  const f = theme.files.nodes[0];
  if (!f || !f.body) throw httpError(404, `The live theme has no ${FILE} — the FAQ page may be built differently.`);
  const { header, json } = splitHeader(f.body.content);
  let tpl; try { tpl = JSON.parse(json); } catch (e) { throw httpError(500, "Couldn't read the FAQ template (" + e.message + ")."); }
  return { st, theme, checksum: f.checksumMd5, raw: f.body.content, header, tpl };
}
// Flatten to groups of questions, in page order (hidden sections and questions included, marked hidden).
function itemsOf(tpl) {
  const groups = [];
  for (const sid of tpl.order || Object.keys(tpl.sections || {})) {
    const sec = tpl.sections[sid]; if (!sec || sec.type !== "faqs") continue;
    const items = (sec.block_order || Object.keys(sec.blocks || {})).map((bid) => {
      const b = sec.blocks[bid]; if (!b) return null;
      return { id: `${sid}/${bid}`, title: (b.settings && b.settings.title) || "", answer: (b.settings && b.settings.answer) || "", hidden: !!b.disabled || !!sec.disabled };
    }).filter(Boolean);
    groups.push({ id: sid, title: (sec.settings && sec.settings.title) || "", hidden: !!sec.disabled, items });
  }
  return groups;
}

/* ---------------- what Buzzin actually does (the facts the FAQ must match) ---------------- */
const FACTS_VER = 4;   // bump when the facts or Emily's FAQ instructions change, so she re-checks both pages
async function facts(store) {
  const s = await R().settings(), def = R().STORE_DEFS[store];
  const portal = R().portalUrl(store, s);
  const fee = Number(s.label_fee) || 0, byWeight = s.label_fee_mode !== "flat";
  const onCredit = s.fee_on_store_credit ? " It comes off store credit too." : " It isn't charged when the customer chooses store credit.";
  const days = s.window_days[store], pp = s.pp_claim_window_days, nopp = s.nopp_claim_window_days;
  const feeLine = byWeight
    ? `Based on the weight of the return package (it's the real price of the prepaid USPS label), so it changes from return to return. The exact amount is shown in the returns portal before the customer confirms, and it's taken off the refund.${onCredit} Never state a fixed dollar amount.`
    : fee ? `$${fee.toFixed(2)}, taken off the refund.${onCredit}` : "Free.";
  return {
    store: def.name, support_email: def.support, returns_portal: portal,
    getting_started: `Everything self-serve happens in the returns portal (${portal}). The customer enters their order number (e.g. ${def.prefix}123456) and the email used at checkout, then picks: "Edit or cancel my order", "Start a return", "Defective item", "Package Protection claim" or "Other". Options that don't apply yet (e.g. a return before the order is delivered) show a short reason in the portal.`,
    returns: {
      window: `${days} days from the DELIVERY date (not the order date). The return option opens once tracking shows delivered. Local pickup orders: ${days} days from pickup.`,
      what_you_need: "Order number + checkout email, the items to send back (unwashed, tags attached, original packaging), and a printer for the label and packing slip.",
      steps: [
        `Open the returns portal (${portal}) and enter the order number and checkout email`,
        "Choose \"Start a return\", tick the items, the quantity and a reason for each (\"Other\" needs a short note)",
        `Choose the refund: original payment${s.store_credit_enabled ? `, or store credit with a ${s.store_credit_bonus_pct}% bonus` : ""}`,
        "Check the return address and confirm — the label fee and estimated refund are shown before confirming",
        "Print the prepaid USPS label and packing slip right away (also emailed). Packing slip inside, label on the outside",
        `Drop the package at any USPS location within ${s.void_unused_after_days} days`,
      ],
      dropoff_deadline: `${s.void_unused_after_days} days after the label is made. A reminder email goes out on day ${s.dropoff_reminder_days} if it hasn't been dropped off. After day ${s.void_unused_after_days} the label stops working and the return is closed (the customer can start a new one if still inside the return window).`,
      label: `Prepaid USPS label made instantly in the portal (Loop Returns is no longer used). One label per return; more items from the same order can be returned later as a separate return while the window is open. US addresses only — customers outside the US email ${def.support}.`,
      label_fee: feeLine,
      refund_amount: "The item price and its sales tax, minus the label fee. Original shipping isn't refunded.",
      refund_methods: s.store_credit_enabled ? `Original payment method, or store credit with a ${s.store_credit_bonus_pct}% bonus (added to the customer's account for the next order).` : "Original payment method.",
      refund_timing: s.auto_refund ? "Issued automatically as soon as the package is delivered back to us (no need to email). Banks can take 5–10 business days to show it; store credit is instant." : "Issued after the return is received and checked.",
      track_or_cancel: "The confirmation page (linked in the email) shows the label, tracking and status. A return can be cancelled there until the package is dropped off.",
      not_returnable: `Final-sale items (tagged ${s.final_sale_tags}) and Package Protection.`,
      exchanges: "No direct exchanges: return the item (store credit gets the bonus) and place a new order.",
    },
    defective_item: {
      what_it_is: "A manufacturing defect: holes, broken snaps or zippers, seams coming apart, misprints, factory stains.",
      window: `Report within ${s.claim_window_days} days of delivery.`,
      what_you_need: "Order number + checkout email, the item(s) and quantity, at least 1 clear photo of the problem (up to 8, JPG or PNG), and a short description.",
      steps: [
        `Open the returns portal (${portal}) and choose "Defective item"`,
        "Pick the item(s), add photos and describe the problem",
        "Pick the fix you'd like and submit",
      ],
      keep_the_item: "No need to send it back.",
      options: "Free replacement (when that size is in stock), store credit, or a refund to the original payment (refund only on orders without Package Protection).",
      after: "The customer gets an email with the claim number; we may ask for another photo; the decision is emailed.",
    },
    shipping_problems_with_package_protection: {
      where: `Returns portal (${portal}) → "Package Protection claim".`,
      hasnt_arrived: `Can be filed once ${s.transit_claim_days} days have passed since the order shipped and tracking still isn't delivered. Before that the portal shows the date it opens.${Number(s.transit_claim_max_days) ? ` Last day: ${s.transit_claim_max_days} days after shipping.` : ""}`,
      marked_delivered_not_received: `Wait ${s.delivered_wait_hours} hours after the delivery scan (carriers sometimes scan early) and check the mailbox, around the home and with neighbors, then file within ${pp} days of delivery. If the carrier left a notice / attempted delivery, contact the post office first — the portal asks.`,
      arrived_damaged: `File within ${pp} days of delivery with photos of the damaged package and items.`,
      resolution: "Free replacement or store credit (no cash refunds on Package Protection claims).",
    },
    defective_vs_damaged: `"Defective item" = something wrong with how the item was made (${s.claim_window_days} days from delivery). "Arrived damaged" = the package or items were damaged in shipping (with Package Protection: ${pp} days from delivery in "Package Protection claim"; without it: ${nopp} days). If unsure, pick the one that fits best — our team sorts it out.`,
    photos: "Defective and damaged claims need at least 1 photo (up to 8, JPG or PNG). Clear, well-lit photos of the problem — and for shipping damage, the outside of the box too — get claims approved fastest.",
    shipping_problems_without_package_protection: `Once tracking shows delivered we can't replace a lost package; the portal (\"Other\") shows how to file a claim with USPS. Damage has to be reported within ${nopp} days of delivery.`,
    order_changes: {
      edit: `Change a size or the shipping address within ${s.edit_window_minutes} minutes of placing the order, in the portal ("Edit or cancel my order"). Shopify emails the updated order; if the new item costs more, that email has a link to pay the difference; if less, the difference is refunded.`,
      cancel: "Cancel any time before the order ships, in the same place. Once it ships it can't be changed or cancelled — start a return after delivery instead.",
    },
    contact: `Questions or anything the portal can't do: ${def.support}.`,
    must_fix: [
      `Any link to Loop Returns (loopreturns.com) → the returns portal ${portal}`,
      `Any link to /pages/package-protection-claim-center (the old claim page) → the returns portal ${portal}`,
      `Any drop-off time other than ${s.void_unused_after_days} days after the label is made`,
      `"Email us" for returns, defects, damaged or missing packages → the returns portal (email ${def.support} stays fine as a fallback)`,
      byWeight ? `Any fixed dollar amount for the return label fee (e.g. "$5.95" or "$7.95") → weight-based, exact price shown in the portal before confirming` : `Any label fee other than $${fee.toFixed(2)}`,
      "Return, defect and claim answers missing the day limits, what the customer needs, or the steps",
    ],
    must_cover: [
      "How do I start a return? (steps)", "How long do I have to return? (window from delivery)", "What do I need to start a return?",
      "How much is the return label / is return shipping free?", "When do I have to drop off my return? (deadline + reminder + what happens after)",
      "When and how will I get my refund? (timing, methods, store credit bonus, what's refunded)", "Can I cancel my return or check its status?",
      "What can't be returned?", "Do you offer exchanges?",
      "My item is defective — what do I do? (window, photos, keep the item, options)", "My package arrived damaged",
      "My package hasn't arrived", "My package says delivered but I didn't get it", "What does Package Protection cover / how do I file a claim?",
      "Can I change or cancel my order? (size/address changes only in the first minutes; cancelling allowed until it ships — say both clearly and that both are done in the portal)",
      "Defective vs. arrived damaged — which do I pick? (the two windows side by side)", "How many photos do I need? (at least 1, up to 8)",
    ],
    never_change_policy: "Sale items being store credit only, international/Canada rules, shipping times and carrier choices are business policies Buzzin doesn't control: never rewrite them; if they conflict with the FACTS, add a note for staff instead.",
    unchanged_policies: "Return condition (unwashed, tags attached, original packaging), merging orders, P.O. boxes, delays, product care and sizing questions are not controlled by Buzzin — leave them as they are unless they mention Loop, a different drop-off time, or emailing for returns/defects.",
  };
}

/* ---------------- Emily's suggestions ---------------- */
const SUGGEST_SYS = `You keep a baby-clothing store's FAQ page accurate, complete and easy for busy parents to follow. You get the FAQ (groups with ids, questions with ids and their current HTML answers) and the FACTS: exactly what the store's systems do today.
1. FIX: rewrite any answer that is wrong, out of date or missing something from the FACTS (old Loop links, wrong day counts, "email us" where the portal handles it, a fixed label fee, missing deadlines).
2. COMPLETE: every topic in FACTS.must_cover needs a clear answer with the real numbers — day limits and what they count from (delivery, shipping, label date), what the customer needs, and the steps. Expand the closest existing answer; add a NEW question only when no existing question fits (put it in the group where a customer would look). Don't duplicate a topic another question already covers well.
Style: warm, friendly and plain, written to a parent on their phone. Short sentences, no jargon, no legal tone. Lead with the answer. Put limits in <strong> (e.g. <strong>7 days from delivery</strong>). NEVER use <ol>, <ul> or <li> — the store's theme displays them wrong. Write steps as numbered lines inside one paragraph: <p><strong>1.</strong> First step<br><strong>2.</strong> Second step</p>, and "what you'll need" as <p>You'll need:<br>• one thing<br>• another</p>. Keep each answer under ~120 words. Link the returns portal wherever the customer has to do something (<a href="...">returns portal</a>). Simple HTML only: <p>, <strong>, <a href>, <br>.
Never invent anything that isn't in the FACTS. Leave correct, complete answers alone. Policies in never_change_policy are never rewritten — raise conflicts as notes.
Reply with ONLY JSON, no code fences: {"changes":[{"id":"<question id>","answer":"<new HTML>","why":"<one short sentence for staff>"}],"new_questions":[{"group":"<group id>","question":"<question>","answer":"<HTML>","why":"<one short sentence>"}],"notes":["anything staff should decide"]}`;
async function suggest(store) {
  const k = K(); if (!k.anthropic) throw httpError(400, "Emily's AI isn't connected (no ANTHROPIC_API_KEY).");
  const t = await readTemplate(store);
  const groups = itemsOf(t.tpl).filter((g) => !g.hidden);
  const faq = groups.map((g) => ({ group_id: g.id, group: g.title, questions: g.items.filter((i) => !i.hidden).map((i) => ({ id: i.id, question: i.title, answer: i.answer })) }));
  const qs = faq.flatMap((g) => g.questions);
  const f = await facts(store);
  const resp = await k.anthropic.messages.stream({ model: k.model, max_tokens: 24000, system: SUGGEST_SYS, messages: [{ role: "user", content: `FACTS:\n${JSON.stringify(f, null, 2)}\n\nFAQ:\n${JSON.stringify(faq, null, 2)}` }] }).finalMessage();
  const txt = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let out; try { out = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)); }
  catch (_) { console.error(`faq suggest: unreadable reply (stop: ${resp.stop_reason}, ${txt.length} chars): ${txt.slice(0, 200)} … ${txt.slice(-200)}`); throw httpError(502, resp.stop_reason === "max_tokens" ? "Emily's suggestion was too long to finish. Try again." : "Emily's suggestion couldn't be read. Try again."); }
  const ids = new Set(qs.map((q) => q.id)), gids = new Set(groups.map((g) => g.id));
  const changes = (Array.isArray(out.changes) ? out.changes : []).filter((c) => c && ids.has(c.id) && typeof c.answer === "string").map((c) => ({ id: c.id, answer: cleanHtml(c.answer), why: String(c.why || "").slice(0, 300) }));
  // New questions: id "new:<group>:<n>" until published.
  (Array.isArray(out.new_questions) ? out.new_questions : []).filter((q) => q && gids.has(q.group) && String(q.question || "").trim() && typeof q.answer === "string").slice(0, 10)
    .forEach((q, n) => changes.push({ id: `new:${q.group}:${n + 1}`, group: q.group, title: String(q.question).trim().slice(0, 200), answer: cleanHtml(q.answer), why: String(q.why || "").slice(0, 300) }));
  return { changes,
    notes: (Array.isArray(out.notes) ? out.notes : []).map(String).slice(0, 8), checksum: t.checksum };
}

// Answers only ever contain simple formatting; strip anything else (scripts, styles, event handlers).
// The FAQ theme styles <ol>/<ul> badly (markers like "1TH", no bullets), so lists become numbered / bulleted lines.
function flattenLists(h) {
  const items = (body) => [...body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li\s*>/gi)].map((m) => m[1].replace(/<\/?p\b[^>]*>/gi, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  let out = String(h || "");
  for (let guard = 0; guard < 20 && /<(ol|ul)\b/i.test(out); guard++) {
    out = out.replace(/<(ol|ul)\b[^>]*>((?:(?!<(?:ol|ul)\b)[\s\S])*?)<\/\1\s*>/gi, (m, tag, body) => {
      const li = items(body); if (!li.length) return "";
      return "<p>" + li.map((x, i) => (tag.toLowerCase() === "ol" ? `<strong>${i + 1}.</strong> ` : "• ") + x).join("<br>") + "</p>";
    });
  }
  // A list that sat inside a paragraph would now nest <p> in <p>: close the outer one first, drop stray closers.
  let depth = 0;
  return out.replace(/<(\/?)p\b[^>]*>/gi, (m, close) => {
    if (!close) { const r = depth ? "</p><p>" : "<p>"; depth = 1; return r; }
    if (!depth) return ""; depth = 0; return "</p>";
  }).replace(/<p>\s*<\/p>/gi, "");
}
function cleanHtml(h) {
  let s = flattenLists(String(h || "").slice(0, 6000));
  s = s.replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, "").replace(/<\s*(script|style|iframe|object|embed)[^>]*>/gi, "");
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/javascript:/gi, "");
  s = s.replace(/<(\/?)([a-z0-9]+)([^>]*)>/gi, (m, slash, tag, attrs) => {
    tag = tag.toLowerCase();
    if (!["p", "strong", "b", "em", "i", "a", "br"].includes(tag)) return "";
    if (tag !== "a" || slash) return `<${slash}${tag}>`;
    const href = (attrs.match(/href\s*=\s*"([^"]*)"/i) || attrs.match(/href\s*=\s*'([^']*)'/i) || [])[1];
    return href && /^(https?:\/\/|\/|mailto:)/i.test(href) ? `<a href="${href.replace(/"/g, "&quot;")}">` : "<a>";
  });
  return s.trim();
}

/* ---------------- read / publish / undo ---------------- */
async function view(store) {
  const t = await readTemplate(store);
  return { theme: { id: t.theme.id, name: t.theme.name }, checksum: t.checksum, groups: itemsOf(t.tpl), can_publish: canWrite(t.st), facts: await facts(store),
    last: (await db(`SELECT id, created_by, created_at, note FROM hd_faq_versions WHERE store=$1 ORDER BY id DESC LIMIT 1`, [store])).rows[0] || null,
    auto: await (async () => { const st = await state(); const m = (st.stores || {})[store] || {}; return { last_run: m.last_run || null, last_result: m.last_result || "", notes: m.notes || [],
      pending: m.pending && m.pending.checksum === t.checksum ? m.pending.changes : [] }; })() };
}
const WRITE_M = `mutation($id: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!){ themeFilesUpsert(themeId: $id, files: $files) { upsertedThemeFiles { filename } userErrors { field message code filename } } }`;
async function writeFile(t, content) {
  if (!canWrite(t.st)) throw httpError(403, `${t.st.brand}: the Emily Shopify app needs the write_themes permission to publish FAQ changes.`);
  const d = await gql(t.st, WRITE_M, { id: t.theme.id, files: [{ filename: FILE, body: { type: "TEXT", value: content } }] });
  const ue = d.themeFilesUpsert.userErrors || [];
  if (ue.length) throw httpError(400, "Shopify refused the change: " + ue.map((e) => e.message).join("; "));
}
// changes: [{ id: "section/block", answer: "<p>…</p>" }]. checksum = the version staff reviewed.
async function publish(store, { changes, checksum }, who) {
  const t = await readTemplate(store);
  if (checksum && checksum !== t.checksum) throw httpError(409, "The FAQ page changed in Shopify since you opened this. Reload to see the latest before publishing.");
  const list = (Array.isArray(changes) ? changes : []).filter((c) => c && c.id && typeof c.answer === "string");
  if (!list.length) throw httpError(400, "Nothing to publish.");
  const done = [];
  for (const c of list) {
    if (String(c.id).startsWith("new:")) {
      const sid = c.group || String(c.id).split(":")[1], sec = t.tpl.sections[sid];
      if (!sec || sec.type !== "faqs") throw httpError(400, "The FAQ group for a new question no longer exists. Reload and try again.");
      const title = String(c.title || "").trim().slice(0, 200), html = cleanHtml(c.answer);
      if (!title || !html) throw httpError(400, "A new question needs both a question and an answer.");
      const order = sec.block_order || Object.keys(sec.blocks || {});
      const tmpl = order.map((k) => sec.blocks[k]).find(Boolean);
      if (!tmpl) throw httpError(400, `The "${(sec.settings && sec.settings.title) || sid}" group has no questions to copy the layout from.`);
      const nb = JSON.parse(JSON.stringify(tmpl)); delete nb.disabled;
      nb.settings = { ...(nb.settings || {}), title, answer: html };
      let bid; do { bid = "buzzin_" + crypto.randomBytes(4).toString("hex"); } while (sec.blocks[bid]);
      sec.blocks[bid] = nb; sec.block_order = [...order, bid];
      done.push(`New: ${title}`); continue;
    }
    const [sid, bid] = String(c.id).split("/");
    const b = t.tpl.sections[sid] && t.tpl.sections[sid].blocks && t.tpl.sections[sid].blocks[bid];
    if (!b || t.tpl.sections[sid].type !== "faqs") throw httpError(400, "One of the questions no longer exists. Reload and try again.");
    const html = cleanHtml(c.answer); if (!html) throw httpError(400, `The answer to "${b.settings.title}" is empty.`);
    if (html !== b.settings.answer) { b.settings.answer = html; done.push(b.settings.title); }
  }
  if (!done.length) throw httpError(400, "Nothing changed.");
  const next = t.header + JSON.stringify(t.tpl, null, 2) + "\n";
  await db(`INSERT INTO hd_faq_versions (store, theme_id, content, note, created_by) VALUES ($1,$2,$3,$4,$5)`, [store, t.theme.id, t.raw, `Before: ${done.join("; ")}`.slice(0, 1000), who || null]);
  await writeFile(t, next);
  await core.audit({ kind: "faq-publish", detail: `${store.toUpperCase()} FAQ updated: ${done.join("; ")}`.slice(0, 900), who: who || "staff" }).catch(() => {});
  if (!/^Emily/.test(who || "")) { try { const st = await state(); const m = (st.stores || {})[store]; if (m && m.action_id) { await E().dismissAction(m.action_id, `${who} (published in Buzzin)`).catch(() => {}); } await clearPending(store); } catch (_) {} }
  return { updated: done };
}
async function undo(store, who) {
  const v = (await db(`SELECT * FROM hd_faq_versions WHERE store=$1 ORDER BY id DESC LIMIT 1`, [store])).rows[0];
  if (!v) throw httpError(404, "There's no earlier version to go back to.");
  const t = await readTemplate(store);
  await writeFile(t, v.content);
  await db(`DELETE FROM hd_faq_versions WHERE id=$1`, [v.id]);
  await core.audit({ kind: "faq-undo", detail: `${store.toUpperCase()} FAQ put back to the version from ${new Date(v.created_at).toISOString().slice(0, 16).replace("T", " ")}`, who: who || "staff" }).catch(() => {});
  return { restored: true };
}

/* ---------------- Emily keeps an eye on the FAQ page ----------------
 * Once a day and right after Returns settings change, Emily compares the page with Buzzin. When something
 * is out of date she rewrites those answers and ASKS: an approval card in Slack (#cs-approvals: Apply / Dismiss)
 * and "FAQ changes waiting" on Buzzin's Home. Nothing is published until a person approves — Apply in Slack,
 * or Publish in Buzzin → Content → Website FAQs. Policy calls (like sale items) only ever come back as notes. */
const STATE_KEY = "faqs";
async function state() { return (await core.setting(STATE_KEY, null)) || { stores: {} }; }
async function saveState(st) { await db(`INSERT INTO emily_settings (key, value, updated_by, updated_at) VALUES ($1,$2,'Emily',now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [STATE_KEY, JSON.stringify(st)]); }
const E = () => require("./emily");
// The approval card. exec runs only when someone presses Apply (or re-runs it after a restart).
async function stageFaq({ store, checksum, changes, notes = [], reason = "" }) {
  const def = R().STORE_DEFS[store], titles = await titlesFor(store, changes);
  const summary = `${changes.length} answer${changes.length === 1 ? "" : "s"} on the ${def.name} FAQ page don't match how Buzzin works${reason ? ` (${reason})` : ""}:\n${changes.map((c) => `• *${titles[c.id] || c.id}* — ${c.why || "updated"}`).join("\n")}`
    + (notes.length ? `\n_For you to decide (not changed):_ ${notes.join(" · ")}` : "") + `\nReview or edit the wording first in Buzzin → Content → Website FAQs.`
  const short = summary.length > 2800 ? summary.slice(0, 2700).replace(/\n[^\n]*$/, "") + "\n…more in Buzzin → Content → Website FAQs." : summary;
  return E().stageAction({ kind: "faq_publish", input: { store, checksum, changes, notes }, title: `Update the ${def.name} FAQ page`, summary: short,
    exec: async () => { const r = await publish(store, { changes, checksum }, "Emily (approved)"); await clearPending(store); return { note: `Published: ${r.updated.join("; ")}` }; } });
}
async function titlesFor(store, changes) {
  const m = {}; for (const c of changes || []) if (c.title) m[c.id] = `New question: ${c.title}`;
  try { const t = await readTemplate(store); for (const g of itemsOf(t.tpl)) for (const i of g.items) m[i.id] = i.title; } catch (_) {}
  return m;
}
async function clearPending(store) {
  const st = await state(); const m = (st.stores || {})[store]; if (!m) return;
  m.pending = null; m.action_id = null; m.last_result = "Published"; await saveState(st);
}
const running = new Set();
async function autoRun(store, reason = "daily check", { force = false } = {}) {
  if (running.has(store)) return { skipped: "already running" };
  running.add(store);
  const st = await state(); st.stores = st.stores || {}; const mine = st.stores[store] || {};
  try {
    const t = await readTemplate(store), f = await facts(store);
    const sig = crypto.createHash("md5").update(FACTS_VER + t.checksum + JSON.stringify(f)).digest("hex");
    if (!force && mine.sig === sig) return { skipped: "nothing changed since the last check" };
    const sug = await suggest(store);
    // Any live answer still using a list gets the same text as numbered / bulleted lines (no wording change).
    const have = new Set(sug.changes.map((c) => c.id));
    for (const g of itemsOf(t.tpl)) for (const i of g.items)
      if (!i.hidden && !have.has(i.id) && /<(ol|ul|li)\b/i.test(i.answer)) sug.changes.push({ id: i.id, answer: cleanHtml(i.answer), why: "Formatting only: the list showed as \"1TH…\" on the site, now plain numbered lines" });
    mine.last_run = new Date().toISOString(); mine.sig = sig; mine.notes = sug.notes; mine.reason = reason;
    // An older card for this store is out of date now — take it down before asking again.
    if (mine.action_id) { try { await E().dismissAction(mine.action_id, "Emily (replaced by a newer check)"); } catch (_) {} mine.action_id = null; }
    if (!sug.changes.length) { mine.pending = null; mine.last_result = "FAQ page matches Buzzin"; return { ok: true, changes: 0 }; }
    mine.pending = { changes: sug.changes, checksum: sug.checksum, at: new Date().toISOString() };
    mine.action_id = await stageFaq({ store, checksum: sug.checksum, changes: sug.changes, notes: sug.notes, reason });
    mine.last_result = `Asked for approval: ${sug.changes.length} change(s)${canWrite(t.st) ? "" : " — publishing needs the write_themes permission"}`;
    return { ok: true, pending: sug.changes.length };
  } catch (e) { mine.last_result = "Check failed: " + e.message; console.error(`faq check (${store}):`, e.message); return { error: e.message }; }
  finally { st.stores[store] = mine; await saveState(st).catch(() => {}); running.delete(store); }
}
async function autoRunAll(reason) { for (const k of Object.keys(R().STORE_DEFS)) await autoRun(k, reason); }
let timer = null;
function schedule() {
  if (timer) return;
  setTimeout(() => autoRunAll("daily check").catch(() => {}), 3 * 60e3);           // shortly after start
  timer = setInterval(() => autoRunAll("daily check").catch(() => {}), 24 * 3600e3);
}
async function status() {
  const st = await state(); const out = { pending: 0, stores: {} };
  for (const [k, v] of Object.entries(st.stores || {})) { const n = (v.pending && v.pending.changes && v.pending.changes.length) || 0; out.pending += n; out.stores[k] = { pending: n, last_run: v.last_run, last_result: v.last_result, notes: v.notes || [] }; }
  return out;
}

module.exports = { init, view, suggest, publish, undo, cleanHtml, itemsOf, splitHeader, autoRun, autoRunAll, status, schedule, stageFaq, clearPending };
