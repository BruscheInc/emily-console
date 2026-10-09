/* =============================================================================================
 *  Customer emails — one registry for everything the customer gets in their inbox from the
 *  returns portal and claims.
 *
 *  Helpdesk-sent emails are branded (logo, colors, button shape from the store's published Portal
 *  Studio theme) and every line of wording is editable per store in Email Studio (/email-studio).
 *  Saved wording lives in hd_email_templates (store, kind) and goes live as soon as it's saved.
 *
 *  Shopify-sent emails are listed too (sender: "shopify") so staff can see the whole picture, but
 *  their wording is edited in Shopify Admin → Settings → Notifications.
 * ============================================================================================= */
const core = require("./core");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => "$" + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

/* ---------------- the registry ---------------- */
// Field types: text (one line) · rich (paragraphs, **bold**, [link](https://…)) · lines (one step per line)
const F = {
  subject: { k: "subject", label: "Subject line", type: "text", hint: "Only used when the email starts a new conversation — replies in an existing thread keep its subject." },
  title: { k: "title", label: "Heading", type: "text" },
  intro: { k: "intro", label: "Message", type: "rich", rows: 7 },
};
const T_RETURN = [["first", "Customer first name"], ["order", "Order number"], ["rma", "Return number"], ["deadline", "Drop-off deadline"], ["dropoff", "Days to drop off"], ["refund", "\"refund\" or \"store credit\""], ["store", "Store name"], ["support", "Support email"]];
const T_CLAIM = [["first", "Customer first name"], ["order", "Order number"], ["claim", "Claim number"], ["claim_type", "What kind of claim"], ["resolution", "What they asked for"], ["store", "Store name"], ["support", "Support email"]];

const EMAILS = {
  /* ---- returns ---- */
  return_created: { group: "Returns", name: "Return submitted", sender: "helpdesk",
    when: "Right after a customer starts a return in the portal. Replaces Shopify's label email.",
    fields: [F.subject, F.title, F.intro, { k: "button", label: "Button", type: "text" }, { k: "view", label: "Link under the button", type: "text" }, { k: "steps", label: "How-to-ship steps (one per line)", type: "lines", rows: 5 }],
    tokens: T_RETURN, shows: "Also shows: return + order number, the items with photos, and the refund summary.",
    defaults: {
      subject: "Your return label for order {order} is ready",
      title: "Your return label is ready",
      intro: "Hi {first},\n\nThanks for starting your return. Print your label and packing slip, put the packing slip inside the package, attach the label to the outside, and drop it off at any USPS location by **{deadline}**.",
      button: "Print label and packing slip",
      view: "View your return",
      steps: "Securely pack your items. If you have it, use the original packaging.\nPut the packing slip inside and attach your return label to the outside of the package.\nDrop off the package within {dropoff} days at your nearest USPS location.\nWe'll issue your {refund} as soon as the package is delivered back to us.",
    } },
  return_reminder: { group: "Returns", name: "Drop-off reminder", sender: "helpdesk",
    when: "When a return label still hasn't been dropped off (day set in Returns → Settings, default day 21).",
    fields: [F.subject, F.title, F.intro, { k: "button", label: "Button", type: "text" }], tokens: T_RETURN,
    defaults: {
      subject: "Reminder: drop off your return {rma} by {deadline}",
      title: "Don't forget to drop off your return",
      intro: "Hi {first},\n\nYour return **{rma}** for order {order} hasn't been dropped off yet. Please drop it off at any USPS location by **{deadline}**. After that the label expires and the return will be closed.\n\nAlready sent it? Thank you — tracking can take a day to update.",
      button: "Print label and packing slip",
    } },
  return_closed: { group: "Returns", name: "Return closed", sender: "helpdesk",
    when: "When the drop-off deadline passes — the label is voided and the return closed (default day 29).",
    fields: [F.subject, F.title, F.intro], tokens: T_RETURN,
    defaults: {
      subject: "Your return {rma} has been closed",
      title: "Your return was closed",
      intro: "Hi {first},\n\nYour return **{rma}** for order {order} was closed because the package wasn't dropped off within {dropoff} days, so the label no longer works. Nothing was charged.\n\nIf you still need help, just reply to this email.",
    } },

  /* ---- claims ---- */
  claim_received: { group: "Claims", name: "Claim received", sender: "helpdesk",
    when: "When a customer submits a defective-item or shipping claim in the portal.",
    fields: [F.subject, F.title, F.intro], tokens: T_CLAIM, shows: "Also shows: claim + order number and the items claimed.",
    defaults: {
      subject: "Your claim {claim} for order {order}",
      title: "We received your claim",
      intro: "Hi {first},\n\nWe received your {claim_type} for order {order}. Your claim number is **{claim}**.\n\nYou asked for: **{resolution}**. We'll email you here with the result, usually within one business day. If you have more photos or details, just reply to this email.",
    } },
  message_received: { group: "Claims", name: "Message received", sender: "helpdesk",
    when: "When a customer sends a message with \"Something else\" in the portal.",
    fields: [F.subject, F.title, F.intro], tokens: [["first", "Customer first name"], ["order", "Order number"], ["claim", "Reference number"], ["store", "Store name"], ["support", "Support email"]],
    shows: "Also shows: a copy of the customer's message.",
    defaults: {
      subject: "We got your message about order {order}",
      title: "We got your message",
      intro: "Hi {first},\n\nThanks for reaching out about order {order}. We got your message (reference **{claim}**) and our team will reply to this email soon.",
    } },
  claim_approved_replacement: { group: "Claims", name: "Claim approved — replacement", sender: "helpdesk",
    when: "When a claim is approved as a free replacement (automatically or by staff).",
    fields: [F.subject, F.title, F.intro, { k: "keep_note", label: "Extra line for defective items", type: "text", hint: "Only shown on defective-item claims." }, { k: "closing", label: "Closing line", type: "text" }],
    tokens: [...T_CLAIM, ["replacement_order", "Replacement order number"], ["ship_to", "Where it ships"]], shows: "Also shows: the items being replaced.",
    defaults: {
      subject: "Your claim {claim} was approved",
      title: "Your claim was approved",
      intro: "Hi {first},\n\nGood news — your claim **{claim}** was approved. We've created a free replacement order (**{replacement_order}**). It ships to {ship_to}, and you'll get a shipping confirmation with tracking as soon as it's on its way.",
      keep_note: "There's no need to send the item back.",
      closing: "Thank you for your patience, and sorry for the trouble.",
    } },
  claim_approved_credit: { group: "Claims", name: "Claim approved — store credit", sender: "helpdesk",
    when: "When a claim is approved as store credit.",
    fields: [F.subject, F.title, F.intro, { k: "keep_note", label: "Extra line for defective items", type: "text", hint: "Only shown on defective-item claims." }, { k: "closing", label: "Closing line", type: "text" }],
    tokens: [...T_CLAIM, ["amount", "Store credit amount"], ["email", "Customer email"]],
    defaults: {
      subject: "Your claim {claim} was approved",
      title: "Your claim was approved",
      intro: "Hi {first},\n\nGood news — your claim **{claim}** was approved.\n\nWe've added **{amount}** in store credit to your {store} account ({email}). It applies automatically at checkout when you're signed in with this email.",
      keep_note: "There's no need to send the item back.",
      closing: "Thank you for your patience, and sorry for the trouble.",
    } },
  claim_approved_refund: { group: "Claims", name: "Claim approved — refund", sender: "helpdesk",
    when: "When a claim is approved as a refund (defective items on orders without Package Protection).",
    fields: [F.subject, F.title, F.intro, { k: "keep_note", label: "Extra line for defective items", type: "text", hint: "Only shown on defective-item claims." }, { k: "closing", label: "Closing line", type: "text" }],
    tokens: [...T_CLAIM, ["amount", "Refund amount"]],
    defaults: {
      subject: "Your claim {claim} was approved",
      title: "Your claim was approved",
      intro: "Hi {first},\n\nGood news — your claim **{claim}** was approved.\n\nWe've refunded **{amount}** to your original payment method. Depending on your bank it can take 5–10 business days to show up.",
      keep_note: "There's no need to send the item back.",
      closing: "Thank you for your patience, and sorry for the trouble.",
    } },
  claim_denied: { group: "Claims", name: "Claim denied", sender: "helpdesk",
    when: "When staff deny a claim in Helpdesk → Claims. {message} is the note staff write.",
    fields: [F.subject, F.title, F.intro], tokens: [...T_CLAIM, ["message", "Staff's note to the customer"]],
    defaults: {
      subject: "About your claim {claim}",
      title: "About your claim",
      intro: "Hi {first},\n\nThank you for your patience while we reviewed claim **{claim}** for order {order}.\n\n{message}",
    } },
  claim_question: { group: "Claims", name: "Quick question", sender: "helpdesk",
    when: "When staff ask the customer for more information on a claim. {message} is the question staff write.",
    fields: [F.subject, F.title, F.intro], tokens: [...T_CLAIM, ["message", "Staff's question"]],
    defaults: {
      subject: "A quick question about claim {claim}",
      title: "A quick question about your claim",
      intro: "Hi {first},\n\nWe're reviewing claim **{claim}** for order {order}. {message}\n\nJust reply to this email — photos are welcome.",
    } },

  /* ---- shared ---- */
  _footer: { group: "All emails", name: "Footer", sender: "helpdesk",
    when: "The small print at the bottom of every Helpdesk email above.",
    fields: [{ k: "text", label: "Footer text", type: "rich", rows: 3 }], tokens: [["store", "Store name"], ["support", "Support email"]],
    defaults: { text: "Questions? Just reply to this email or write to {support}." } },

  /* ---- sent by Shopify (shown for reference; edited in Shopify) ---- */
  shopify_label: { group: "Returns", name: "Return label (Shopify)", sender: "shopify", shopify_template: "Return label",
    when: "Only for returns staff start from Helpdesk, or as a backup if \"Return submitted\" fails to send." },
  shopify_refund: { group: "Returns", name: "Refund issued (Shopify)", sender: "shopify", shopify_template: "Refund notification",
    when: "When the refund is issued after the return is delivered back to us." },
  shopify_credit: { group: "Returns", name: "Store credit bonus (Shopify)", sender: "shopify", shopify_template: "Store credit",
    when: "When the store credit bonus is added to a store-credit return." },
  shopify_pay_link: { group: "Order edits", name: "Pay for your changes (Shopify)", sender: "shopify", shopify_template: "Order edited — invoice",
    when: "When a customer's size change in the portal makes the order cost more." },
  shopify_edit_refund: { group: "Order edits", name: "Edit refund (Shopify)", sender: "shopify", shopify_template: "Refund notification",
    when: "When a customer's size change lowers the order total." },
  shopify_cancel: { group: "Order edits", name: "Order cancelled (Shopify)", sender: "shopify", shopify_template: "Order canceled",
    when: "When a customer cancels their order in the portal." },
};
const EDITABLE = Object.keys(EMAILS).filter((k) => EMAILS[k].sender === "helpdesk");

/* ---------------- saved wording ---------------- */
async function migrate() {
  await core.db(`CREATE TABLE IF NOT EXISTS hd_email_templates (store TEXT NOT NULL, kind TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}', updated_by TEXT, updated_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (store, kind))`);
  // One time: wording edited in the old Portal Studio → Emails section moves here.
  const LEGACY = { email_created_subject: ["return_created", "subject"], email_created_title: ["return_created", "title"], email_created_intro: ["return_created", "intro"], email_created_button: ["return_created", "button"],
    email_created_view: ["return_created", "view"], email_created_steps: ["return_created", "steps"], email_reminder_subject: ["return_reminder", "subject"], email_reminder_title: ["return_reminder", "title"],
    email_reminder_intro: ["return_reminder", "intro"], email_reminder_button: ["return_reminder", "button"], email_closed_subject: ["return_closed", "subject"], email_closed_title: ["return_closed", "title"],
    email_closed_intro: ["return_closed", "intro"], email_footer: ["_footer", "text"] };
  for (const store of ["lb", "lbo"]) {
    const key = `email_templates_imported:${store}`;
    if (await core.syncGet(key).catch(() => null)) continue;
    try {
      const r = (await core.db(`SELECT theme FROM hd_portal_themes WHERE store=$1 AND kind='published' ORDER BY id DESC LIMIT 1`, [store])).rows[0];
      const copy = (r && r.theme && r.theme.copy) || {}, got = {};
      for (const [old, [kind, field]] of Object.entries(LEGACY)) {
        const v = copy[old]; if (v == null || !String(v).trim() || v === EMAILS[kind].defaults[field]) continue;
        (got[kind] = got[kind] || {})[field] = String(v);
      }
      for (const [kind, data] of Object.entries(got)) await core.db(`INSERT INTO hd_email_templates (store, kind, data, updated_by) VALUES ($1,$2,$3,'Portal Studio') ON CONFLICT (store, kind) DO NOTHING`, [store, kind, JSON.stringify(data)]);
      await core.syncSet(key, new Date().toISOString(), {});
      if (Object.keys(got).length) console.log(`✉️  moved ${Object.keys(got).length} edited email(s) for ${store} from Portal Studio to Email Studio`);
    } catch (e) { console.error("email template import:", e.message); }
  }
}
async function init() { try { await migrate(); } catch (e) { console.error("email templates migrate:", e.message); } }

async function savedRows(store) {
  try { return (await core.db(`SELECT kind, data, updated_by, updated_at FROM hd_email_templates WHERE store=$1`, [store])).rows; }
  catch (e) { console.error("email templates read:", e.message); return []; }
}
const clean = (kind, data) => {
  const e = EMAILS[kind], out = {};
  for (const f of e.fields || []) { const v = data && data[f.k]; if (v != null && String(v).trim() !== "" && String(v) !== e.defaults[f.k]) out[f.k] = String(v).slice(0, 4000); }
  return out;
};
// Wording for one email: saved edits over the defaults. `over` = unsaved edits (previews).
async function copyFor(store, kind, over) {
  const rows = await savedRows(store), row = rows.find((r) => r.kind === kind), foot = rows.find((r) => r.kind === "_footer");
  const c = { ...EMAILS[kind].defaults, ...((row && row.data) || {}), ...(over ? clean(kind, over) : {}) };
  c._footer = (kind === "_footer" ? c.text : (foot && foot.data && foot.data.text)) || EMAILS._footer.defaults.text;
  return c;
}
async function listFor(store) {
  const rows = await savedRows(store);
  return Object.entries(EMAILS).map(([kind, e]) => {
    const row = rows.find((r) => r.kind === kind), data = (row && row.data) || {};
    return { kind, group: e.group, name: e.name, sender: e.sender, when: e.when, shows: e.shows || "", shopify_template: e.shopify_template || null,
      fields: e.fields || [], tokens: (e.tokens || []).map(([k, d]) => ({ k, d })), defaults: e.defaults || {}, copy: { ...(e.defaults || {}), ...data },
      edited: Object.keys(data).length > 0, updated_by: row ? row.updated_by : null, updated_at: row ? row.updated_at : null };
  });
}
async function save(store, kind, data, who) {
  if (!EDITABLE.includes(kind)) { const e = new Error("That email can't be edited here."); e.status = 400; throw e; }
  const d = clean(kind, data);
  if (!Object.keys(d).length) { await core.db(`DELETE FROM hd_email_templates WHERE store=$1 AND kind=$2`, [store, kind]); return { reset: true }; }
  await core.db(`INSERT INTO hd_email_templates (store, kind, data, updated_by, updated_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (store, kind) DO UPDATE SET data=$3, updated_by=$4, updated_at=now()`, [store, kind, JSON.stringify(d), who || null]);
  core.audit({ kind: "email-template", detail: `${store.toUpperCase()} · ${EMAILS[kind].name} saved`, who: who || "staff" }).catch(() => {});
  return { saved: true };
}

/* ---------------- rendering ---------------- */
function tok(s, v) { return String(s == null ? "" : s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)); }
// **bold**, [text](url), blank line = new paragraph, single newline = line break
function rich(s, v, linkColor) {
  let h = esc(tok(s, v));
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, `<a href="$2" style="color:${linkColor};">$1</a>`);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return h.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px 0;">${p.replace(/\n/g, "<br>")}</p>`).join("");
}
const absUrl = (u, base) => (!u ? "" : /^https?:\/\//i.test(u) ? u : base.replace(/\/$/, "") + (u.startsWith("/") ? u : "/" + u));

function layout({ theme, def, base, title, bodyHtml, preheader, footer }) {
  const c = (theme && theme.colors) || {}, b = (theme && theme.buttons) || {};
  const primary = c.primary || "#242F3F", onPrimary = c.on_primary || "#FFFFFF", heading = c.heading || "#242F3F", text = c.text || "#242F3F", muted = c.muted || "#6B7280", border = c.border || "#E6E3DC", soft = c.soft || "#F4F2EE";
  const logo = absUrl(theme && theme.brand && theme.brand.logo, base);
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const v = { store: def.name, support: def.support };
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${soft};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader || "")}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${soft};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${border};border-radius:14px;font-family:${font};color:${text};font-size:15px;line-height:1.55;">
<tr><td align="center" style="padding:30px 32px 6px 32px;">${logo ? `<img src="${esc(logo)}" alt="${esc(def.name)}" height="44" style="height:44px;width:auto;border:0;display:block;margin:0 auto;">` : `<div style="font-size:22px;font-weight:700;color:${heading};">${esc(def.name)}</div>`}</td></tr>
<tr><td style="padding:18px 32px 0 32px;"><h1 style="margin:0 0 14px 0;font-size:24px;line-height:1.25;color:${heading};font-weight:700;">${esc(title)}</h1></td></tr>
<tr><td style="padding:0 32px 8px 32px;">${bodyHtml({ primary, onPrimary, heading, text, muted, border, soft, radius: Math.min(Number(b.radius) || 10, 24) })}</td></tr>
<tr><td style="padding:20px 32px 28px 32px;border-top:1px solid ${border};font-size:13px;color:${muted};text-align:center;">${rich(footer, v, primary)}${def.faqUrl ? `<a href="${esc(def.faqUrl)}" style="color:${muted};">FAQs</a> &nbsp;·&nbsp; ` : ""}<a href="${esc(def.shopUrl)}" style="color:${muted};">${esc(def.name)}</a></td></tr>
</table></td></tr></table></body></html>`;
}
const button = (href, label, k) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;"><tr><td style="background:${k.primary};border-radius:${k.radius}px;"><a href="${esc(href)}" style="display:inline-block;padding:13px 26px;color:${k.onPrimary};font-weight:600;text-decoration:none;font-size:15px;">${esc(label)}</a></td></tr></table>`;
const itemRow = (i, k, right) => `<tr>
    <td width="64" style="padding:10px 12px 10px 0;vertical-align:top;">${i.image ? `<img src="${esc(i.image)}" width="56" height="56" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid ${k.border};display:block;">` : `<div style="width:56px;height:56px;border-radius:8px;background:${k.soft};"></div>`}</td>
    <td style="padding:10px 0;vertical-align:top;"><div style="font-weight:600;color:${k.heading};">${esc(i.title)}</div><div style="color:${k.muted};font-size:13px;">${esc([i.variant, i.quantity > 1 ? `× ${i.quantity}` : ""].filter(Boolean).join(" · "))}</div></td>
    <td align="right" style="padding:10px 0;vertical-align:top;white-space:nowrap;">${right || ""}</td></tr>`;

function returnItems(view, k) {
  const rows = view.items.map((i) => itemRow(i, k, money(i.unit_price * i.quantity))).join("");
  const sm = view.summary || {}, credit = view.refund_method === "store_credit";
  const line = (l, r, bold) => `<tr><td colspan="2" style="padding:3px 0;${bold ? `font-weight:700;color:${k.heading};` : `color:${k.muted};`}">${l}</td><td align="right" style="padding:3px 0;${bold ? `font-weight:700;color:${k.heading};` : ""}">${r}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${k.border};margin-top:6px;">${rows}
    <tr><td colspan="3" style="border-top:1px solid ${k.border};padding-top:8px;"></td></tr>
    ${line("Item subtotal", money(sm.subtotal))}${line("Tax", money(sm.tax))}${line("Return shipping label", sm.fee ? "−" + money(sm.fee) : "Free")}
    ${credit && sm.bonus ? line(`${sm.bonus_pct}% store credit bonus`, "+" + money(sm.bonus)) : ""}
    ${line(credit ? "Estimated store credit" : "Estimated refund", money(sm.total), true)}</table>
    <p style="margin:6px 0 0 0;font-size:12px;color:${k.muted};">${credit ? "Added to your account" : "Back to your original payment method"} as soon as your package is delivered back to us.</p>`;
}
const claimItems = (c, k) => `<div style="font-weight:700;color:${k.heading};margin:8px 0 2px 0;">Claim ${esc(c.number)} · Order ${esc(String(c.order_name || "").replace(/^#/, ""))}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${k.border};margin:4px 0 16px 0;">${(c.items || []).map((i) => itemRow(i, k, "")).join("")}</table>`;

const firstOf = (name) => String(name || "").split(" ")[0] || "there";
const RES_LABEL = { replacement: "Replacement (no charge)", store_credit: "Store credit", refund: "Refund to original payment" };
const SUB = { not_arrived: "my package hasn't arrived", delivered_missing: "marked delivered but not received", damaged: "my package arrived damaged" };
function returnVars(view, def) {
  const deadline = new Date(view.dropoff_by).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
  return { store: def.name, support: def.support, order: String(view.order_name || "").replace(/^#/, ""), rma: view.rma, first: firstOf(view.customer_name), deadline, dropoff: view.dropoff_days, refund: view.refund_method === "store_credit" ? "store credit" : "refund" };
}
function claimVars(c, def, extra = {}) {
  return { store: def.name, support: def.support, order: String(c.order_name || "").replace(/^#/, ""), claim: c.number, first: firstOf(c.customer_name), email: c.email,
    claim_type: c.type === "defective" ? "defective item claim" : c.type === "pp" ? `claim (${SUB[c.subtype] || "shipping"})` : "message", resolution: RES_LABEL[c.resolution] || "",
    amount: extra.amount != null ? money(extra.amount) : "", replacement_order: extra.replacement_order || "being created", ship_to: extra.ship_to || "your shipping address", message: extra.message || "" };
}
const textOf = (parts, v) => [...parts.filter(Boolean).map((p) => tok(p, v).replace(/\*\*/g, "").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")), `— The ${v.store} Team`].join("\n\n");

// kind + data → { subject, html, text }. data: { view } for returns, { claim, extra } for claims.
function render(kind, { copy, theme, def, base, view, claim, extra }) {
  const C = copy, foot = C._footer;
  if (kind.startsWith("return_")) {
    const v = returnVars(view, def), title = tok(C.title, v);
    if (kind === "return_created") {
      const html = layout({ theme, def, base, title, footer: foot, preheader: `Drop it off by ${v.deadline}.`, bodyHtml: (k) =>
        rich(C.intro, v, k.primary) + button(view.print_url, tok(C.button, v), k) +
        `<p style="margin:0 0 20px 0;font-size:14px;"><a href="${esc(view.view_url)}" style="color:${k.primary};font-weight:600;">${esc(tok(C.view, v))}</a>${view.tracking_url && view.tracking_url !== "#" ? ` &nbsp;·&nbsp; <a href="${esc(view.tracking_url)}" style="color:${k.primary};">Track your return</a>` : ""}</p>` +
        `<div style="font-weight:700;color:${k.heading};margin:4px 0 4px 0;">Return ${esc(view.rma)} · Order ${esc(v.order)}</div>` + returnItems(view, k) +
        `<div style="font-weight:700;color:${k.heading};margin:22px 0 8px 0;">How to ship your item(s)</div><ol style="margin:0 0 6px 0;padding-left:20px;">${String(tok(C.steps, v)).split("\n").map((x) => x.trim()).filter(Boolean).map((x) => `<li style="margin-bottom:6px;">${rich(x, v, k.primary).replace(/^<p[^>]*>|<\/p>$/g, "")}</li>`).join("")}</ol>` });
      return { subject: tok(C.subject, v), html, text: textOf([C.intro, `Print label and packing slip: ${view.print_url}`, `View your return: ${view.view_url}`], v) };
    }
    if (kind === "return_reminder") {
      const html = layout({ theme, def, base, title, footer: foot, preheader: `Drop it off by ${v.deadline}.`, bodyHtml: (k) =>
        rich(C.intro, v, k.primary) + button(view.print_url || view.view_url, tok(C.button, v), k) +
        `<p style="margin:0 0 6px 0;font-size:14px;"><a href="${esc(view.view_url)}" style="color:${k.primary};font-weight:600;">View your return</a></p>` });
      return { subject: tok(C.subject, v), html, text: textOf([C.intro, `Print label and packing slip: ${view.print_url || view.view_url}`], v) };
    }
    if (kind === "return_closed") {
      const html = layout({ theme, def, base, title, footer: foot, preheader: "Your return label has expired.", bodyHtml: (k) => rich(C.intro, v, k.primary) });
      return { subject: tok(C.subject, v), html, text: textOf([C.intro], v) };
    }
  }
  if (kind.startsWith("claim_") || kind === "message_received") {
    const v = claimVars(claim, def, extra || {}), title = tok(C.title, v), c = claim;
    const keep = c.type === "defective" && C.keep_note ? C.keep_note : "";
    const body = (k) => {
      let h = rich(C.intro, v, k.primary);
      if (kind === "claim_received" || kind === "claim_approved_replacement") h += claimItems(c, k);
      if (kind === "message_received") h += `<div style="border-left:3px solid ${k.border};background:${k.soft};padding:10px 14px;border-radius:6px;margin:4px 0 16px 0;color:${k.text};">${esc(c.description || "").replace(/\n/g, "<br>")}${(c.photos || []).length ? `<div style="color:${k.muted};font-size:13px;margin-top:6px;">${c.photos.length} photo${c.photos.length === 1 ? "" : "s"} attached</div>` : ""}</div>`;
      if (keep) h += rich(keep, v, k.primary);
      if (C.closing) h += rich(C.closing, v, k.primary);
      return h;
    };
    const html = layout({ theme, def, base, title, footer: foot, preheader: title, bodyHtml: body });
    const items = (kind === "claim_received" || kind === "claim_approved_replacement") ? (c.items || []).map((i) => `• ${i.quantity}× ${i.title}${i.variant ? ` (${i.variant})` : ""}`).join("\n") : "";
    return { subject: tok(C.subject, v), html, text: textOf([C.intro, items, kind === "message_received" ? `"${c.description || ""}"` : "", keep, C.closing], v) };
  }
  if (kind === "_footer") return render("return_reminder", { copy: { ...EMAILS.return_reminder.defaults, _footer: C._footer }, theme, def, base, view });
  throw new Error("unknown email " + kind);
}

/* ---------------- samples for previews / test sends ---------------- */
function sampleView(def, s, base) {
  return { id: "sample", rma: `${def.prefix}190000-R1`, order_name: `${def.prefix}190000`, customer_name: "Jane Doe", email: "jane@example.com", refund_method: "original",
    dropoff_days: s.void_unused_after_days || 28, dropoff_by: new Date(Date.now() + (s.void_unused_after_days || 28) * 864e5).toISOString(),
    print_url: base + "/returns", view_url: base + "/returns", tracking_url: "#",
    items: [{ title: "Zipper Romper in Howl-O-Ween Parade", variant: "12-18 months", quantity: 1, unit_price: 28, image: null }, { title: "Bamboo Swaddle", variant: "One size", quantity: 1, unit_price: 24, image: null }],
    summary: { subtotal: 52, tax: 4.29, fee: Number(s.label_fee) || 0, bonus: 0, bonus_pct: s.store_credit_bonus_pct, total: Math.max(0, 56.29 - (Number(s.label_fee) || 0)) } };
}
function sampleClaim(def, kind) {
  return { claim: { number: `${def.prefix}190000-C1`, order_name: `${def.prefix}190000`, customer_name: "Jane Doe", email: "jane@example.com",
      type: kind === "message_received" ? "other" : "defective", subtype: null, resolution: kind === "claim_approved_credit" ? "store_credit" : kind === "claim_approved_refund" ? "refund" : "replacement",
      items: [{ title: "Zipper Romper in Howl-O-Ween Parade", variant: "12-18 months", quantity: 1, image: null }],
      description: "The zipper came apart the first time we used it.", photos: kind === "message_received" ? ["x"] : [] },
    extra: { amount: 28, replacement_order: `${def.prefix}190123`, ship_to: "123 Main St, Plano, TX 75024",
      message: kind === "claim_denied" ? "The photos show wear from washing rather than a manufacturing defect, so this isn't covered. If we've missed something, just reply and we'll take another look." : "Could you send a photo of the tag inside the garment?" } };
}
// Everything a preview / test send needs, for any editable kind.
async function build(store, kind, { def, s, theme, base, over, view, claim, extra }) {
  if (!EDITABLE.includes(kind)) { const e = new Error("unknown email"); e.status = 400; throw e; }
  const copy = await copyFor(store, kind, over);
  if (kind === "_footer") return render("_footer", { copy, theme, def, base, view: view || sampleView(def, s, base) });
  if (kind.startsWith("return_")) return render(kind, { copy, theme, def, base, view: view || sampleView(def, s, base) });
  const smp = claim ? { claim, extra } : sampleClaim(def, kind);
  return render(kind, { copy, theme, def, base, claim: smp.claim, extra: smp.extra });
}

module.exports = { EMAILS, EDITABLE, init, copyFor, listFor, save, render, build, sampleView, sampleClaim };
