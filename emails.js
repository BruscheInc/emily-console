/* =============================================================================================
 *  Branded customer emails for returns. Look (logo, colors, button shape) comes from the store's
 *  Portal Studio theme; every line of wording is in the theme too (Portal Studio → Emails), so the
 *  emails can be edited, previewed and test-sent without touching code.
 *
 *    return_created   sent right after a return is submitted in the portal (replaces Shopify's label email)
 *    return_reminder  drop-off reminder (day 21 by default)
 *    return_closed    return closed because it was never dropped off (day 29)
 * ============================================================================================= */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n) => "$" + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

const DEFAULT_COPY = {
  email_created_subject: "Your return label for order {order} is ready",
  email_created_title: "Your return label is ready",
  email_created_intro: "Hi {first},\n\nThanks for starting your return. Print your label and packing slip, put the packing slip inside the package, attach the label to the outside, and drop it off at any USPS location by **{deadline}**.",
  email_created_button: "Print label and packing slip",
  email_created_view: "View your return",
  email_created_steps: "Securely pack your items. If you have it, use the original packaging.\nPut the packing slip inside and attach your return label to the outside of the package.\nDrop off the package within {dropoff} days at your nearest USPS location.\nWe'll issue your {refund} as soon as the package is delivered back to us.",
  email_reminder_subject: "Reminder: drop off your return {rma} by {deadline}",
  email_reminder_title: "Don't forget to drop off your return",
  email_reminder_intro: "Hi {first},\n\nYour return **{rma}** for order {order} hasn't been dropped off yet. Please drop it off at any USPS location by **{deadline}**. After that the label expires and the return will be closed.\n\nAlready sent it? Thank you — tracking can take a day to update.",
  email_reminder_button: "Print label and packing slip",
  email_closed_subject: "Your return {rma} has been closed",
  email_closed_title: "Your return was closed",
  email_closed_intro: "Hi {first},\n\nYour return **{rma}** for order {order} was closed because the package wasn't dropped off within {dropoff} days, so the label no longer works. Nothing was charged.\n\nIf you still need help, just reply to this email.",
  email_footer: "Questions? Just reply to this email or write to {support}.",
};
const COPY_KEYS = Object.keys(DEFAULT_COPY);

function tok(s, v) { return String(s == null ? "" : s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m)); }
// **bold**, [text](url), blank line = new paragraph, single newline = line break
function rich(s, v, linkColor) {
  let h = esc(tok(s, v));
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, `<a href="$2" style="color:${linkColor};">$1</a>`);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return h.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px 0;">${p.replace(/\n/g, "<br>")}</p>`).join("");
}
const copyOf = (theme, k) => { const c = theme && theme.copy && theme.copy[k]; return c != null && String(c).trim() !== "" ? c : DEFAULT_COPY[k]; };
const absUrl = (u, base) => (!u ? "" : /^https?:\/\//i.test(u) ? u : base.replace(/\/$/, "") + (u.startsWith("/") ? u : "/" + u));

function layout({ theme, def, base, title, bodyHtml, preheader }) {
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
<tr><td style="padding:20px 32px 28px 32px;border-top:1px solid ${border};font-size:13px;color:${muted};text-align:center;">${rich(copyOf(theme, "email_footer"), v, primary)}${def.faqUrl ? `<a href="${esc(def.faqUrl)}" style="color:${muted};">FAQs</a> &nbsp;·&nbsp; ` : ""}<a href="${esc(def.shopUrl)}" style="color:${muted};">${esc(def.name)}</a></td></tr>
</table></td></tr></table></body></html>`;
}
const button = (href, label, k) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px 0;"><tr><td style="background:${k.primary};border-radius:${k.radius}px;"><a href="${esc(href)}" style="display:inline-block;padding:13px 26px;color:${k.onPrimary};font-weight:600;text-decoration:none;font-size:15px;">${esc(label)}</a></td></tr></table>`;

function itemsTable(view, k) {
  const rows = view.items.map((i) => `<tr>
    <td width="64" style="padding:10px 12px 10px 0;vertical-align:top;">${i.image ? `<img src="${esc(i.image)}" width="56" height="56" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid ${k.border};display:block;">` : `<div style="width:56px;height:56px;border-radius:8px;background:${k.soft};"></div>`}</td>
    <td style="padding:10px 0;vertical-align:top;"><div style="font-weight:600;color:${k.heading};">${esc(i.title)}</div><div style="color:${k.muted};font-size:13px;">${esc([i.variant, i.quantity > 1 ? `× ${i.quantity}` : ""].filter(Boolean).join(" · "))}</div></td>
    <td align="right" style="padding:10px 0;vertical-align:top;white-space:nowrap;">${money(i.unit_price * i.quantity)}</td></tr>`).join("");
  const sm = view.summary || {}, credit = view.refund_method === "store_credit";
  const line = (l, r, bold) => `<tr><td colspan="2" style="padding:3px 0;${bold ? `font-weight:700;color:${k.heading};` : `color:${k.muted};`}">${l}</td><td align="right" style="padding:3px 0;${bold ? `font-weight:700;color:${k.heading};` : ""}">${r}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${k.border};margin-top:6px;">${rows}
    <tr><td colspan="3" style="border-top:1px solid ${k.border};padding-top:8px;"></td></tr>
    ${line("Item subtotal", money(sm.subtotal))}${line("Tax", money(sm.tax))}${line("Return shipping label", sm.fee ? "−" + money(sm.fee) : "Free")}
    ${credit && sm.bonus ? line(`${sm.bonus_pct}% store credit bonus`, "+" + money(sm.bonus)) : ""}
    ${line(credit ? "Estimated store credit" : "Estimated refund", money(sm.total), true)}</table>
    <p style="margin:6px 0 0 0;font-size:12px;color:${k.muted};">${credit ? "Added to your account" : "Back to your original payment method"} as soon as your package is delivered back to us.</p>`;
}

function vars(view, def, s) {
  const first = String(view.customer_name || "").split(" ")[0] || "there";
  const deadline = new Date(view.dropoff_by).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" });
  return { store: def.name, support: def.support, order: view.order_name, rma: view.rma, first, deadline, dropoff: view.dropoff_days, refund: view.refund_method === "store_credit" ? "store credit" : "refund" };
}

function render(kind, { view, theme, def, base }) {
  const v = vars(view, def), C = (key) => copyOf(theme, key);
  if (kind === "return_created") {
    const title = tok(C("email_created_title"), v);
    const html = layout({ theme, def, base, title, preheader: `Drop it off by ${v.deadline}.`, bodyHtml: (k) =>
      rich(C("email_created_intro"), v, k.primary) + button(view.print_url, tok(C("email_created_button"), v), k) +
      `<p style="margin:0 0 20px 0;font-size:14px;"><a href="${esc(view.view_url)}" style="color:${k.primary};font-weight:600;">${esc(tok(C("email_created_view"), v))}</a>${view.tracking_url && view.tracking_url !== "#" ? ` &nbsp;·&nbsp; <a href="${esc(view.tracking_url)}" style="color:${k.primary};">Track your return</a>` : ""}</p>` +
      `<div style="font-weight:700;color:${k.heading};margin:4px 0 4px 0;">Return ${esc(view.rma)} · Order ${esc(view.order_name)}</div>` + itemsTable(view, k) +
      `<div style="font-weight:700;color:${k.heading};margin:22px 0 8px 0;">How to ship your item(s)</div><ol style="margin:0 0 6px 0;padding-left:20px;">${String(tok(C("email_created_steps"), v)).split("\n").map((x) => x.trim()).filter(Boolean).map((x) => `<li style="margin-bottom:6px;">${rich(x, v, k.primary).replace(/^<p[^>]*>|<\/p>$/g, "")}</li>`).join("")}</ol>` });
    return { subject: tok(C("email_created_subject"), v), html, text: textOf(C("email_created_intro"), v, [`Print label and packing slip: ${view.print_url}`, `View your return: ${view.view_url}`]) };
  }
  if (kind === "return_reminder") {
    const title = tok(C("email_reminder_title"), v);
    const html = layout({ theme, def, base, title, preheader: `Drop it off by ${v.deadline}.`, bodyHtml: (k) =>
      rich(C("email_reminder_intro"), v, k.primary) + button(view.print_url || view.view_url, tok(C("email_reminder_button"), v), k) +
      `<p style="margin:0 0 6px 0;font-size:14px;"><a href="${esc(view.view_url)}" style="color:${k.primary};font-weight:600;">View your return</a></p>` });
    return { subject: tok(C("email_reminder_subject"), v), html, text: textOf(C("email_reminder_intro"), v, [`Print label and packing slip: ${view.print_url || view.view_url}`]) };
  }
  if (kind === "return_closed") {
    const title = tok(C("email_closed_title"), v);
    const html = layout({ theme, def, base, title, preheader: "Your return label has expired.", bodyHtml: (k) => rich(C("email_closed_intro"), v, k.primary) });
    return { subject: tok(C("email_closed_subject"), v), html, text: textOf(C("email_closed_intro"), v, []) };
  }
  throw new Error("unknown email " + kind);
}
function textOf(copy, v, extra) { return [tok(copy, v).replace(/\*\*/g, ""), ...extra, "", `— The ${v.store} Team`].join("\n\n"); }

// Sample return for previews and test sends.
function sampleView(def, s, base) {
  return { id: "sample", rma: "LB190000-R1", order_name: "#LB190000", customer_name: "Jane Doe", email: "jane@example.com", refund_method: "original",
    dropoff_days: s.void_unused_after_days || 28, dropoff_by: new Date(Date.now() + (s.void_unused_after_days || 28) * 864e5).toISOString(),
    print_url: base + "/returns", view_url: base + "/returns", tracking_url: "#",
    items: [{ title: "Zipper Romper in Howl-O-Ween Parade", variant: "12-18 months", quantity: 1, unit_price: 28, image: null }, { title: "Bamboo Swaddle", variant: "One size", quantity: 1, unit_price: 24, image: null }],
    summary: { subtotal: 52, tax: 4.29, fee: Number(s.label_fee) || 0, bonus: 0, bonus_pct: s.store_credit_bonus_pct, total: Math.max(0, 56.29 - (Number(s.label_fee) || 0)) } };
}

module.exports = { render, sampleView, DEFAULT_COPY, COPY_KEYS, KINDS: ["return_created", "return_reminder", "return_closed"] };
