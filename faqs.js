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
async function facts(store) {
  const s = await R().settings(), def = R().STORE_DEFS[store];
  const portal = R().portalUrl(store, s);
  const fee = Number(s.label_fee) || 0;
  return {
    store: def.name, support_email: def.support, returns_portal: portal,
    return_window_days_from_delivery: s.window_days[store],
    dropoff_days_after_label: s.void_unused_after_days, dropoff_reminder_day: s.dropoff_reminder_days,
    return_label: "Prepaid USPS label, made in the returns portal (no Loop Returns any more). Customer prints the label and packing slip from the portal or the confirmation email.",
    label_fee: fee ? `$${fee.toFixed(2)} taken off the refund${s.fee_on_store_credit ? " (also on store credit)" : " (not charged when choosing store credit)"}` : "free",
    refund_methods: s.store_credit_enabled ? `Refund to the original payment method, or store credit with a ${s.store_credit_bonus_pct}% bonus` : "Refund to the original payment method",
    refund_timing: s.auto_refund ? "Issued automatically as soon as the return package is delivered back to us; the bank may take 5–10 business days to show it." : "Issued after the return is received and checked.",
    final_sale: `Items tagged final sale (${s.final_sale_tags}) can't be returned.`,
    defective_items: `Report in the returns portal (\"Defective item\") within ${s.claim_window_days} days of delivery, with photos and a short description. The customer keeps the item. Options: free replacement (if in stock), store credit, or a refund (refund only on orders without Package Protection).`,
    package_protection: `Orders with Package Protection: claims are filed in the returns portal. \"Marked delivered but not received\" and \"arrived damaged\" must be reported within ${s.pp_claim_window_days} days of delivery; \"hasn't arrived\" can be filed once ${s.transit_claim_days} days have passed since shipping with no delivery. Resolution: free replacement or store credit (no cash refunds).`,
    no_package_protection: `Orders without Package Protection: once a package is marked delivered we can't replace it; the customer files a claim with the carrier (USPS). Damage must be reported within ${s.nopp_claim_window_days} days of delivery.`,
    order_changes: `In the returns portal, customers can change sizes or the shipping address within ${s.edit_window_minutes} minutes of ordering, and cancel any time before the order ships. After it ships, changes aren't possible.`,
    exchanges: "There are no direct exchanges. Customers return the item (store credit gets the bonus) and place a new order.",
    must_fix: [
      `Any link to Loop Returns (loopreturns.com) → the returns portal ${portal}`,
      `Any link to /pages/package-protection-claim-center (the old claim page) → the returns portal ${portal}, where Package Protection claims are filed now`,
      `Any drop-off time other than ${s.void_unused_after_days} days after the label is made`,
      `"Email us" for returns, defects or damaged items → use the returns portal (email ${def.support} stays fine as a fallback for questions)`,
      `Return answers that don't mention the ${fee ? `$${fee.toFixed(2)} label fee` : "free label"}${s.store_credit_enabled ? ` and the ${s.store_credit_bonus_pct}% store-credit bonus` : ""}`,
    ],
    never_change_policy: "Sale items being store credit only, international/Canada rules, shipping times and carrier choices are business policies Buzzin doesn't control: never rewrite them; if they conflict with the FACTS, add a note for staff instead.",
    unchanged_policies: "Return condition (unwashed, tags attached, original packaging), merging orders, P.O. boxes, delays, product care and sizing questions are not controlled by Buzzin — leave them as they are unless they mention Loop, a 7-day drop-off, or emailing for returns/defects.",
  };
}

/* ---------------- Emily's suggestions ---------------- */
const SUGGEST_SYS = `You keep a baby-clothing store's FAQ page accurate. You get the FAQ questions (with their current HTML answers) and the FACTS: what the store's systems actually do today.
Rewrite ONLY answers that are wrong, out of date or missing something important per the FACTS (e.g. old Loop Returns links, wrong day counts, "email us" where there is now a portal flow, missing label fee or store-credit bonus). Leave correct answers alone.
Keep the brand voice: warm, short, plain, written to parents. Keep answers brief (1–4 short sentences, a list only if it really helps). Use simple HTML only: <p>, <strong>, <a href="...">, <ul><li>. Link the returns portal where customers need it.
Never invent policies that aren't in the FACTS. If a question can't be answered from the FACTS and its current answer isn't contradicted, leave it.
Reply with ONLY JSON: {"changes":[{"id":"<question id>","answer":"<new HTML>","why":"<one short sentence for staff>"}],"notes":["anything staff should decide, e.g. a policy the FAQ promises that the system doesn't enforce"]}`;
async function suggest(store) {
  const k = K(); if (!k.anthropic) throw httpError(400, "Emily's AI isn't connected (no ANTHROPIC_API_KEY).");
  const t = await readTemplate(store);
  const groups = itemsOf(t.tpl).filter((g) => !g.hidden);
  const qs = groups.flatMap((g) => g.items.filter((i) => !i.hidden).map((i) => ({ id: i.id, group: g.title, question: i.title, answer: i.answer })));
  const f = await facts(store);
  const resp = await k.anthropic.messages.create({ model: k.model, max_tokens: 4000, system: SUGGEST_SYS, messages: [{ role: "user", content: `FACTS:\n${JSON.stringify(f, null, 2)}\n\nFAQ:\n${JSON.stringify(qs, null, 2)}` }] });
  const txt = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  let out; try { out = JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1)); } catch (_) { throw httpError(502, "Emily's suggestion couldn't be read. Try again."); }
  const ids = new Set(qs.map((q) => q.id));
  return { changes: (Array.isArray(out.changes) ? out.changes : []).filter((c) => c && ids.has(c.id) && typeof c.answer === "string").map((c) => ({ id: c.id, answer: cleanHtml(c.answer), why: String(c.why || "").slice(0, 300) })),
    notes: (Array.isArray(out.notes) ? out.notes : []).map(String).slice(0, 8), checksum: t.checksum };
}

// Answers only ever contain simple formatting; strip anything else (scripts, styles, event handlers).
function cleanHtml(h) {
  let s = String(h || "").slice(0, 6000);
  s = s.replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, "").replace(/<\s*(script|style|iframe|object|embed)[^>]*>/gi, "");
  s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/javascript:/gi, "");
  s = s.replace(/<(\/?)([a-z0-9]+)([^>]*)>/gi, (m, slash, tag, attrs) => {
    tag = tag.toLowerCase();
    if (!["p", "strong", "b", "em", "i", "a", "ul", "ol", "li", "br"].includes(tag)) return "";
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
    auto: await (async () => { const st = await state(); const m = (st.stores || {})[store] || {}; return { on: st.auto !== false, last_run: m.last_run || null, last_result: m.last_result || "", notes: m.notes || [],
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

/* ---------------- Emily keeps the FAQ page up to date ----------------
 * Runs once a day and right after Returns settings change. If anything on the page disagrees with
 * Buzzin, Emily rewrites those answers and (with auto-publish on and write_themes granted) publishes
 * them, then posts what changed to Slack. Otherwise the suggestions wait in Buzzin → Website FAQs.
 * Policy calls (like sale items) are never changed automatically — they come back as notes. */
const STATE_KEY = "faqs";
async function state() { return (await core.setting(STATE_KEY, null)) || { auto: true, stores: {} }; }
async function saveState(st) { await db(`INSERT INTO emily_settings (key, value, updated_by, updated_at) VALUES ($1,$2,'Emily',now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [STATE_KEY, JSON.stringify(st)]); }
async function setAuto(on, who) { const st = await state(); st.auto = !!on; await saveState(st); core.audit({ kind: "faq-auto", detail: `Emily auto-updating the FAQ page turned ${on ? "on" : "off"}`, who: who || "staff" }).catch(() => {}); return st; }
const running = new Set();
async function autoRun(store, reason = "daily check", { force = false } = {}) {
  if (running.has(store)) return { skipped: "already running" };
  running.add(store);
  const st = await state(); st.stores = st.stores || {}; const mine = st.stores[store] || {};
  try {
    const t = await readTemplate(store), f = await facts(store);
    const sig = crypto.createHash("md5").update(t.checksum + JSON.stringify(f)).digest("hex");
    if (!force && mine.sig === sig && !(mine.pending && mine.pending.changes && mine.pending.changes.length && st.auto && canWrite(t.st))) return { skipped: "nothing changed since the last check" };
    const sug = await suggest(store);
    mine.last_run = new Date().toISOString(); mine.sig = sig; mine.notes = sug.notes; mine.reason = reason;
    if (!sug.changes.length) { mine.pending = null; mine.last_result = "FAQ page matches Buzzin"; return { ok: true, changes: 0 }; }
    if (st.auto && canWrite(t.st)) {
      const r = await publish(store, { changes: sug.changes, checksum: sug.checksum }, "Emily");
      mine.pending = null; mine.last_result = `Emily updated ${r.updated.length} answer(s): ${r.updated.join("; ")}`.slice(0, 600);
      const def = R().STORE_DEFS[store];
      core.slackPost(`🐝 Emily updated the ${def.name} FAQ page (${reason}): ${r.updated.map((x) => `“${x}”`).join(", ")}. Review or undo in Buzzin → Content → Website FAQs.${sug.notes.length ? `\nFor you to decide: ${sug.notes.join(" · ")}` : ""}`).catch(() => {});
      return { ok: true, published: r.updated };
    }
    mine.pending = { changes: sug.changes, checksum: sug.checksum, at: new Date().toISOString() };
    mine.last_result = `${sug.changes.length} suggested change(s) waiting${canWrite(t.st) ? "" : " — needs the write_themes permission to publish"}`;
    return { ok: true, pending: sug.changes.length };
  } catch (e) { mine.last_result = "Check failed: " + e.message; console.error(`faq auto (${store}):`, e.message); return { error: e.message }; }
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
  const st = await state(); const out = { auto: st.auto !== false, pending: 0, stores: {} };
  for (const [k, v] of Object.entries(st.stores || {})) { const n = (v.pending && v.pending.changes && v.pending.changes.length) || 0; out.pending += n; out.stores[k] = { pending: n, last_run: v.last_run, last_result: v.last_result, notes: v.notes || [] }; }
  return out;
}

module.exports = { init, view, suggest, publish, undo, cleanHtml, itemsOf, splitHeader, autoRun, autoRunAll, setAuto, status, schedule };
