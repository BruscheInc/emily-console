/* =============================================================================================
 *  Order exceptions (goodwill)
 *
 *  Staff can exempt one order from specific return / claim policies — e.g. let a customer return
 *  after the 7-day window, or file a shipping claim without Package Protection. Each exception
 *  names the order, which rules are waived, an optional "valid until" date, a note and who added it.
 *  The portal and Buzzin check these wherever the matching rule is enforced (returns.js, claims.js).
 * ============================================================================================= */
const crypto = require("crypto");
const core = require("./core");
const { db } = core;

// key → what staff see in Buzzin. Keep keys stable: they're stored on exceptions, returns and claims.
const RULES = {
  return_window:   { label: "Return window", hint: "Can return any time (even before tracking shows delivered)" },
  final_sale:      { label: "Final sale", hint: "Final-sale items can be returned" },
  label_fee:       { label: "Return label fee", hint: "No label fee is taken off the refund" },
  dropoff_deadline:{ label: "Drop-off deadline", hint: "Label isn't voided and no reminder is sent" },
  defect_window:   { label: "Defect claim window", hint: "Defect claims open any time after delivery" },
  claim_window:    { label: "Missing / damaged window", hint: "\"Marked delivered\" and damage claims open any time after delivery" },
  transit_wait:    { label: "14-day hasn't-arrived wait", hint: "\"Hasn't arrived\" claims open right away (and no last day)" },
  delivered_wait:  { label: "Marked-delivered wait", hint: "No wait after the carrier marks it delivered" },
  po_check:        { label: "Post-office check", hint: "Attempted deliveries skip the post-office question and lock" },
  pp_required:     { label: "Package Protection", hint: "Treated as if the order had Package Protection" },
  edit_window:     { label: "Edit window", hint: "Size / address changes allowed any time before it ships" },
};
const norm = (n) => String(n || "").replace(/^#/, "").replace(/\s+/g, "").toUpperCase();

async function migrate() {
  await db(`CREATE TABLE IF NOT EXISTS hd_policy_exceptions (id TEXT PRIMARY KEY, order_name TEXT NOT NULL, rules JSONB NOT NULL DEFAULT '[]',
            until TIMESTAMPTZ, note TEXT, created_by TEXT, created_at TIMESTAMPTZ DEFAULT now(), removed_at TIMESTAMPTZ, removed_by TEXT)`);
  await db(`CREATE INDEX IF NOT EXISTS hd_policy_exceptions_order ON hd_policy_exceptions (order_name)`);
}
async function init() { try { await migrate(); } catch (e) { console.error("exceptions migrate:", e.message); } }

const live = (r) => !r.removed_at && (!r.until || new Date(r.until).getTime() > Date.now());
const shape = (r) => ({ id: r.id, order_name: r.order_name, rules: r.rules || [], until: r.until, note: r.note || "", created_by: r.created_by, created_at: r.created_at,
  removed_at: r.removed_at, removed_by: r.removed_by, active: live(r), expired: !r.removed_at && !!r.until && !live(r) });

// Waived rules for an order: { rules:Set, notes:[...], has(k) }. Never throws — a lookup failure means no exception.
async function forOrder(orderName) {
  const n = norm(orderName), out = { rules: new Set(), notes: [], has(k) { return this.rules.has(k); } };
  if (!n) return out;
  try {
    const rows = (await db(`SELECT * FROM hd_policy_exceptions WHERE order_name=$1 AND removed_at IS NULL`, [n])).rows.filter(live);
    for (const r of rows) { for (const k of r.rules || []) if (RULES[k]) out.rules.add(k); if (r.note) out.notes.push(r.note); }
  } catch (e) { console.error("exceptions lookup:", e.message); }
  return out;
}
// One line for claim / return logs: "Goodwill exception: Return window, Final sale (note)".
function describe(ex, keys) {
  const ks = (keys || [...ex.rules]).filter((k) => ex.has(k));
  if (!ks.length) return "";
  return `Goodwill exception: ${ks.map((k) => RULES[k].label).join(", ")}${ex.notes.length ? ` (${ex.notes.join("; ").slice(0, 200)})` : ""}`;
}

async function list({ all = false, q = "" } = {}) {
  const term = norm(q);
  const rows = (await db(`SELECT * FROM hd_policy_exceptions ${term ? "WHERE order_name LIKE $1" : ""} ORDER BY created_at DESC LIMIT 300`, term ? [`%${term}%`] : [])).rows.map(shape);
  return all ? rows : rows.filter((r) => r.active);
}
async function add({ order_name, rules, until, note }, who) {
  const n = norm(order_name);
  if (!/^LBO?\d{3,}$/.test(n)) { const e = new Error("Enter an order number like LB191494 or LBO12345."); e.status = 400; throw e; }
  const ks = [...new Set((Array.isArray(rules) ? rules : []).filter((k) => RULES[k]))];
  if (!ks.length) { const e = new Error("Pick at least one policy to waive."); e.status = 400; throw e; }
  let u = null;
  if (until) { const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(until) ? `${until}T23:59:59-05:00` : until); if (isNaN(d)) { const e = new Error("That date isn't valid."); e.status = 400; throw e; } u = d.toISOString(); }
  if (u && Date.parse(u) < Date.now()) { const e = new Error("The end date is already in the past."); e.status = 400; throw e; }
  const id = crypto.randomUUID();
  await db(`INSERT INTO hd_policy_exceptions (id, order_name, rules, until, note, created_by) VALUES ($1,$2,$3,$4,$5,$6)`, [id, n, JSON.stringify(ks), u, String(note || "").trim().slice(0, 500), who || null]);
  await core.audit({ kind: "policy-exception", detail: `${n}: waived ${ks.map((k) => RULES[k].label).join(", ")}${u ? ` until ${u.slice(0, 10)}` : ""}${note ? ` — ${String(note).slice(0, 120)}` : ""}`, who: who || "staff", target: id }).catch(() => {});
  return shape((await db(`SELECT * FROM hd_policy_exceptions WHERE id=$1`, [id])).rows[0]);
}
async function remove(id, who) {
  const r = (await db(`UPDATE hd_policy_exceptions SET removed_at=now(), removed_by=$2 WHERE id=$1 AND removed_at IS NULL RETURNING *`, [id, who || null])).rows[0];
  if (!r) { const e = new Error("That exception was already removed."); e.status = 404; throw e; }
  await core.audit({ kind: "policy-exception-removed", detail: `${r.order_name}: exception removed`, who: who || "staff", target: id }).catch(() => {});
  return shape(r);
}

module.exports = { RULES, init, forOrder, describe, list, add, remove, norm };
