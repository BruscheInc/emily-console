/* =============================================================================================
 *  Buzzin Marketing · domain DNS (GoDaddy)
 *
 *  Shows a store domain's DNS records with what each one is for, and ADDS records an admin approves
 *  (Amazon SES sending records, SPF, etc.). It never edits or deletes an existing record.
 *  Keys live only in Railway: GODADDY_API_KEY and GODADDY_API_SECRET (a Production key from
 *  developer.godaddy.com). Domains it may touch: larkspurbaby.com and larkspurbabyoutlet.com.
 * ============================================================================================= */
const dns = require("dns").promises;
const core = require("./core");

const DOMAINS = { lb: "larkspurbaby.com", lbo: "larkspurbabyoutlet.com" };
const ALLOWED = new Set(Object.values(DOMAINS));
const BASE = "https://api.godaddy.com";
// GoDaddy's new developer site issues a Personal Access Token (GODADDY_PAT, sent as "Bearer");
// older accounts may still have a key + secret (sent as "sso-key"). Either works.
const configured = () => !!(process.env.GODADDY_PAT || (process.env.GODADDY_API_KEY && process.env.GODADDY_API_SECRET));
const authHeader = () => (process.env.GODADDY_PAT ? `Bearer ${process.env.GODADDY_PAT}` : `sso-key ${process.env.GODADDY_API_KEY}:${process.env.GODADDY_API_SECRET}`);

async function gd(method, path, body) {
  if (!configured()) throw Object.assign(new Error("GoDaddy isn't connected yet: add GODADDY_PAT (your Personal Access Token) in Railway."), { status: 400 });
  const r = await fetch(BASE + path, { method, headers: { Authorization: authHeader(), Accept: "application/json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (_) { j = { raw: t }; }
  if (!r.ok) throw Object.assign(new Error(`GoDaddy ${r.status}: ${(j && (j.message || (j.fields || []).map((f) => f.message).join("; "))) || t.slice(0, 200)}`), { status: r.status === 401 || r.status === 403 ? 400 : 502 });
  return j;
}
const checkDomain = (d) => { d = String(d || "").toLowerCase().trim(); if (!ALLOWED.has(d)) throw Object.assign(new Error("Only the store domains can be changed here."), { status: 400 }); return d; };

/* What a record is for — so it's clear what not to touch. */
function purpose(r, domain) {
  const n = r.name, d = String(r.data || "").toLowerCase();
  if (r.type === "NS" || r.type === "SOA") return "GoDaddy (domain itself)";
  if (r.type === "A" && n === "@" && d.startsWith("23.227.38.")) return "Shopify store";
  if (r.type === "AAAA" && n === "@" && d.startsWith("2620:127:f00f") || (r.type === "AAAA" && d.startsWith("2620:0127:f00f"))) return "Shopify store";
  if (r.type === "CNAME" && (n === "www" || n === "account") && d.includes("myshopify.com")) return "Shopify store";
  if (d.includes("email.myshopify.com") || d.includes(".email.myshopify")) return "Shopify emails (orders, shipping)";
  if (r.type === "MX" && d.includes("google.com")) return "Google email (receiving)";
  if (n === "google._domainkey" || d.startsWith("google-site-verification")) return "Google email";
  if (r.type === "TXT" && d.includes("_spf.google.com")) return "Google email (SPF)";
  if (d.includes("amazonses.com")) return "Amazon SES (Buzzin marketing email)";
  if (n === "_dmarc") return "Email security (DMARC)";
  if (r.type === "TXT" && n === "@" && d.startsWith("v=spf1")) return "Email security (SPF)";
  if (d.includes("railway") || n.startsWith("_railway")) return "Buzzin (returns portal / app)";
  if (d.includes("sendgrid.net")) return "SendGrid (some app's email)";
  if (d.includes("mailgun.org")) return "Mailgun (old verification)";
  if (n === "k1._domainkey") return "Mailchimp";
  if (d.includes("twilio") || d.includes("telnyx")) return "Texting provider";
  return "Unknown";
}

async function listAll(domain) {
  try { return await gd("GET", `/v1/domains/${domain}/records`); }
  catch (e) {   // some tokens only allow the per-type listing
    if (e.status === 400 && /GoDaddy 40[13]/.test(e.message)) throw e;
    const out = [];
    for (const t of ["A", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "AAAA"]) { try { out.push(...(await gd("GET", `/v1/domains/${domain}/records/${t}`))); } catch (_) {} }
    if (!out.length) throw e;
    return out;
  }
}
async function records(domain) {
  domain = checkDomain(domain);
  const list = await listAll(domain);
  return (list || []).map((r) => ({ type: r.type, name: r.name, data: r.data, ttl: r.ttl, priority: r.priority, purpose: purpose(r, domain) }))
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}

/* ---------------- turning pasted text / Amazon's CSV into records ---------------- */
function relName(name, domain) {
  let n = String(name || "").trim().replace(/^"|"$/g, "").replace(/\.$/, "").toLowerCase();
  if (n === domain || n === "") return "@";
  if (n.endsWith("." + domain)) n = n.slice(0, -(domain.length + 1));
  return n;
}
/** Accepts Amazon's "Download .csv record set" file or rows pasted as "TYPE  name  value". */
function parse(text, domain) {
  const out = [], errors = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    let cols = line.includes(",") && !/^txt\b/i.test(line) ? line.split(",") : line.split(/\t|\s{2,}|\s(?=\S)/);
    cols = cols.map((c) => c.trim().replace(/^"|"$/g, "")).filter((c) => c !== "");
    const ti = cols.findIndex((c) => /^(CNAME|MX|TXT|A)$/i.test(c));
    if (ti < 0) { if (!/type|name|value|record/i.test(line)) errors.push(`Couldn't read: ${line.slice(0, 80)}`); continue; }
    const type = cols[ti].toUpperCase();
    // "TYPE name value" or "name,TYPE,value" (Amazon's CSV puts the name first)
    const nameCol = ti > 0 ? cols[0] : cols[1], valueCols = ti > 0 ? cols.slice(ti + 1) : cols.slice(2);
    if (!nameCol || !valueCols.length) { errors.push(`Missing name or value: ${line.slice(0, 80)}`); continue; }
    let name = relName(nameCol, domain), data = valueCols.join(" ").trim().replace(/^"|"$/g, "").replace(/\.$/, "");
    let priority;
    if (type === "MX") { const m = data.match(/^(\d+)\s+(.+)$/); if (m) { priority = Number(m[1]); data = m[2]; } else priority = 10; }
    out.push({ type, name, data, ttl: 3600, ...(priority != null ? { priority } : {}) });
  }
  return { records: out, errors };
}

/* Ready-made sets. */
function preset(key, domain, region = "us-east-2") {
  if (key === "ses_mail_from") return [
    { type: "MX", name: "send", data: `feedback-smtp.${region}.amazonses.com`, priority: 10, ttl: 3600 },
    { type: "TXT", name: "send", data: "v=spf1 include:amazonses.com ~all", ttl: 3600 }];
  if (key === "google_spf") return [{ type: "TXT", name: "@", data: "v=spf1 include:_spf.google.com ~all", ttl: 3600 }];
  return [];
}

/** Check a proposed set against what's there: skip exact duplicates, refuse anything that would clash. */
async function plan(domain, proposed) {
  domain = checkDomain(domain);
  const cur = await listAll(domain);
  const norm = (s) => String(s || "").toLowerCase().replace(/\.$/, "").replace(/^"|"$/g, "");
  return (proposed || []).map((p) => {
    const r = { type: String(p.type).toUpperCase(), name: relName(p.name, domain), data: String(p.data || "").trim(), ttl: 3600, ...(p.priority != null ? { priority: Number(p.priority) } : {}) };
    const same = cur.filter((c) => c.name.toLowerCase() === r.name.toLowerCase());
    let status = "add", why = "";
    if (!["CNAME", "MX", "TXT"].includes(r.type)) { status = "blocked"; why = "Only CNAME, MX and TXT records can be added here."; }
    else if (!r.name || !r.data) { status = "blocked"; why = "Missing name or value."; }
    else if (same.some((c) => c.type === r.type && norm(c.data) === norm(r.data))) { status = "exists"; why = "Already there."; }
    else if (r.type === "CNAME" && same.length) { status = "blocked"; why = `"${r.name}" already has a ${same[0].type} record; a CNAME can't share its name.`; }
    else if (r.type !== "CNAME" && same.some((c) => c.type === "CNAME")) { status = "blocked"; why = `"${r.name}" is a CNAME; delete it in GoDaddy first.`; }
    else if (r.name === "_dmarc" && same.some((c) => c.type === "TXT" && /^v=dmarc1/i.test(c.data))) { status = "blocked"; why = "A DMARC record already exists; a domain can only have one."; }
    else if (r.type === "TXT" && /^v=spf1/i.test(r.data) && same.some((c) => c.type === "TXT" && /^v=spf1/i.test(c.data))) { status = "blocked"; why = "There's already an SPF record on this name; it has to be merged by hand."; }
    else if (r.name === "@" && r.type === "MX") { status = "blocked"; why = "Adding an MX on the main domain would change where your email goes."; }
    return { ...r, status, why, purpose: purpose(r, domain) };
  });
}

/** Add the approved records (only those still marked "add"). Never replaces anything. */
async function apply(domain, proposed, who) {
  const p = await plan(domain, proposed);
  const add = p.filter((x) => x.status === "add").map(({ type, name, data, ttl, priority }) => ({ type, name, data, ttl, ...(priority != null ? { priority } : {}) }));
  if (!add.length) return { added: [], plan: p };
  await gd("PATCH", `/v1/domains/${checkDomain(domain)}/records`, add);
  const detail = `${domain}: added ${add.map((r) => `${r.type} ${r.name}`).join(", ")}`;
  await core.audit({ kind: "dns-change", detail, who: who || "staff" }).catch(() => {});
  core.slackPost(`🌐 DNS records added by ${who}: ${detail}`).catch(() => {});
  return { added: add, plan: p };
}

/** Is it live? Ask the public DNS (what Gmail etc. will see), not GoDaddy. */
async function live(domain, recs) {
  domain = checkDomain(domain);
  const out = [];
  for (const r of recs || []) {
    const fq = r.name === "@" ? domain : `${r.name}.${domain}`;
    let seen = [];
    try {
      if (r.type === "CNAME") seen = await dns.resolveCname(fq);
      else if (r.type === "MX") seen = (await dns.resolveMx(fq)).map((m) => `${m.priority} ${m.exchange}`);
      else if (r.type === "TXT") seen = (await dns.resolveTxt(fq)).map((a) => a.join(""));
    } catch (_) { seen = []; }
    const want = String(r.data).toLowerCase().replace(/\.$/, "");
    out.push({ ...r, fq, live: seen.some((s) => String(s).toLowerCase().replace(/\.$/, "").endsWith(want)), seen });
  }
  return out;
}

function routes(app, { guard, admin, actorOf, fail }) {
  app.get("/api/mk/dns", async (req, res) => { if (!guard(req, res)) return; res.json({ connected: configured(), domains: DOMAINS }); });
  app.get("/api/mk/dns/:domain", async (req, res) => { if (!admin(req, res)) return; try { res.json({ records: await records(req.params.domain) }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/dns/:domain/plan", async (req, res) => {
    if (!admin(req, res)) return;
    try { const b = req.body || {}; const d = checkDomain(req.params.domain);
      const parsed = b.text ? parse(b.text, d) : { records: [], errors: [] };
      const list = [...parsed.records, ...(b.presets || []).flatMap((k) => preset(k, d, b.region || "us-east-2")), ...(b.records || [])];
      res.json({ plan: await plan(d, list), errors: parsed.errors }); } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/dns/:domain/apply", async (req, res) => { if (!admin(req, res)) return; try { res.json(await apply(req.params.domain, (req.body || {}).records || [], actorOf(req))); } catch (e) { fail(res, e); } });
  app.post("/api/mk/dns/:domain/live", async (req, res) => { if (!admin(req, res)) return; try { res.json({ results: await live(req.params.domain, (req.body || {}).records || []) }); } catch (e) { fail(res, e); } });
}

module.exports = { routes, parse, plan, apply, records, live, preset, purpose, relName, DOMAINS };
