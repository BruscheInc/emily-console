/**
 * Emily Console — a full CS inbox over Gorgias, and an extension of Emily.
 *
 *  - View the queue: Pending (customer waiting), Responded (we replied last), Closed, All — per brand.
 *  - Open any ticket to read the FULL conversation thread (every message, both sides).
 *  - Act on it: reply to the customer (sends via Gorgias), add an internal note, close/reopen.
 *  - Every action is mirrored to the Slack CS channel, and there's an "Ask Emily to draft" button
 *    that pings Emily in Slack — so the console and Emily stay in sync.
 *
 * ENV
 *   CONSOLE_KEY                         access key (Jose only)
 *   GORGIAS_DOMAIN / GORGIAS_EMAIL / GORGIAS_API_KEY   (reused from the other services)
 *   SLACK_BOT_TOKEN, CS_CHANNEL         to mirror actions + ping Emily
 *   EMILY_SLACK_ID                      Emily's Slack user id (for the draft ping)
 *   PORT
 */
const express = require("express");
const path = require("path");
const https = require("https");

const KEY = process.env.CONSOLE_KEY || "";
const G_DOMAIN = process.env.GORGIAS_DOMAIN || "";
const G_AUTH = "Basic " + Buffer.from(`${process.env.GORGIAS_EMAIL}:${process.env.GORGIAS_API_KEY}`).toString("base64");
const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN || "";
const CS_CHANNEL = process.env.CS_CHANNEL || "";
const EMILY_ID = process.env.EMILY_SLACK_ID || "";

/* ---------------- Gorgias REST ---------------- */
function gorgias(method, pathname, body) {
  const data = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(`https://${G_DOMAIN}/api${pathname}`, {
      method, headers: { Authorization: G_AUTH, "Content-Type": "application/json", Accept: "application/json", ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let b = ""; res.on("data", (c) => (b += c));
      res.on("end", () => {
        let j; try { j = b ? JSON.parse(b) : {}; } catch { return reject(new Error(`Gorgias non-JSON ${res.statusCode}: ${b.slice(0, 160)}`)); }
        if (res.statusCode >= 400) return reject(new Error(`Gorgias ${res.statusCode}: ${(j.error && (j.error.msg || JSON.stringify(j.error))) || b.slice(0, 160)}`));
        resolve(j);
      });
    });
    req.on("error", reject); if (data) req.write(data); req.end();
  });
}

/* ---------------- Slack ---------------- */
function slack(method, payload) {
  const data = JSON.stringify(payload);
  return new Promise((resolve) => {
    const req = https.request(`https://slack.com/api/${method}`, {
      method: "POST", headers: { Authorization: `Bearer ${SLACK_TOKEN}`, "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(data) },
    }, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => { try { resolve(JSON.parse(b)); } catch { resolve({ ok: false }); } }); });
    req.on("error", () => resolve({ ok: false })); req.write(data); req.end();
  });
}
function slackPost(text) { if (!SLACK_TOKEN || !CS_CHANNEL) return Promise.resolve(); return slack("chat.postMessage", { channel: CS_CHANNEL, text }).catch(() => {}); }

/* ---------------- helpers ---------------- */
const EMILY_TAGS = { "emily-sent": "sent", "emily-drafted": "drafted", "emily-skip": "skip" };
// A ticket is customer service unless Emily tagged it non-CS (emily-skip / not-cs) or Gorgias flagged spam.
// (emily-skip-manual is NOT excluded — those are real CS tickets Emily drafted but held from auto-send.)
const NON_CS_TAGS = new Set(["emily-skip", "not-cs"]);
function isCS(t) {
  if (t.spam) return false;
  for (const tag of (t.tags || [])) if (NON_CS_TAGS.has(tag.name)) return false;
  return true;
}
// Collaboration / partnership requests — their own inbox. Matched by subject/snippet keywords, and
// surfaced even if Emily tagged them non-CS (they're not sales pitches). Obvious spam is still excluded.
const COLLAB_RE = /\b(collab|collaborat|partnership|partner with|brand ambassador|ambassador|influencer|ugc|content creator|creator program|sponsor|affiliate|gifting|brand deal|pr package|work with your brand)\b/i;
function isCollab(t) {
  if (t.spam) return false;
  return COLLAB_RE.test(`${t.subject || ""} ${t.excerpt || ""}`);
}
function brandOf(t) { const i = (t.integrations || [])[0] || {}; return { brand: i.name || "—", address: i.address || null }; }
function emilyStatusOf(t) { for (const tag of (t.tags || [])) { const m = EMILY_TAGS[tag.name]; if (m) return m; } return null; }
function repliedLast(t) { // true if our side sent the most recent message
  const lm = t.last_message_datetime, lr = t.last_received_message_datetime;
  if (!lm) return false; if (!lr) return true;
  return new Date(lm) > new Date(lr);
}
function categorize(t) {
  if (t.status === "closed") return "closed";
  return repliedLast(t) ? "responded" : "pending";
}
function shape(t) {
  const b = brandOf(t);
  return {
    id: t.id, subject: t.subject || "(no subject)", excerpt: t.excerpt || "", status: t.status,
    brand: b.brand, channel: t.channel, spam: !!t.spam, unread: !!t.is_unread, messages_count: t.messages_count,
    customer: { name: (t.customer && (t.customer.name || `${t.customer.firstname || ""} ${t.customer.lastname || ""}`.trim())) || (t.customer && t.customer.email) || "Customer", email: t.customer && t.customer.email },
    emily: emilyStatusOf(t), category: categorize(t),
    last: t.last_message_datetime || t.updated_datetime, assignee: t.assignee_user && t.assignee_user.name,
  };
}
const stripHtml = (s) => String(s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();

/* ---------------- HTTP ---------------- */
const app = express();
app.use(express.json({ limit: "512kb" }));
app.use(express.static(path.join(__dirname, "public"), { setHeaders: (res, p) => { if (p.endsWith(".webmanifest")) res.set("Content-Type", "application/manifest+json"); if (p.endsWith("sw.js")) res.set("Cache-Control", "no-cache"); } }));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/health", (_req, res) => res.json({ ok: true }));
const keyFrom = (req) => req.query.key || req.get("x-console-key") || (req.body && req.body.key) || "";
const authed = (req) => KEY && keyFrom(req) === KEY;
app.get("/api/role", (req, res) => res.json({ ok: authed(req) }));
function guard(req, res) { if (!authed(req)) { res.status(401).json({ error: "unauthorized" }); return false; } return true; }

// List + categorize the queue.
app.get("/api/tickets", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const tab = req.query.tab || "pending", brand = req.query.brand || "", q = (req.query.q || "").toLowerCase();
    const cursor = req.query.cursor || "";
    const j = await gorgias("GET", `/tickets?order_by=updated_datetime:desc&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    let rows;
    if (tab === "collabs") {
      rows = (j.data || []).filter(isCollab).map(shape);                  // collaboration/partnership inbox
    } else {
      rows = (j.data || []).filter((t) => isCS(t) && !isCollab(t)).map(shape); // CS only, collabs excluded
      if (tab !== "all") rows = rows.filter((r) => r.category === tab);
    }
    if (brand) rows = rows.filter((r) => r.brand === brand);
    if (q) rows = rows.filter((r) => (r.subject + " " + r.excerpt + " " + r.customer.name + " " + (r.customer.email || "")).toLowerCase().includes(q));
    res.json({ tickets: rows, next_cursor: j.meta && j.meta.next_cursor });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Counts across the fetched page (for the tab badges).
app.get("/api/counts", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const j = await gorgias("GET", `/tickets?order_by=updated_datetime:desc&limit=100`);
    const data = j.data || [];
    const rows = data.filter((t) => isCS(t) && !isCollab(t)).map(shape);
    const c = { pending: 0, responded: 0, closed: 0, all: rows.length, collabs: data.filter(isCollab).length };
    for (const r of rows) c[r.category] = (c[r.category] || 0) + 1;
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Full ticket + thread.
app.get("/api/ticket/:id", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const id = req.params.id;
    const [t, m] = await Promise.all([gorgias("GET", `/tickets/${id}`), gorgias("GET", `/tickets/${id}/messages?limit=100`)]);
    const b = brandOf(t);
    const messages = (m.data || []).map((x) => {
      const internal = x.channel === "internal-note" || x.public === false;
      const text = String(x.stripped_text || x.body_text || stripHtml(x.stripped_html || x.body_html) || "").trim();
      // Emily's auto-drafted suggestions come in as internal notes; flag them so the console can
      // float them to the right as a draft card with a one-tap "use this draft".
      const emily_draft = internal && /emily'?s suggested reply|review\s*&?(?:amp;)?\s*send from gorgias/i.test(text);
      return {
        id: x.id, from_agent: !!x.from_agent, channel: x.channel,
        sender: (x.sender && (x.sender.name || x.sender.email)) || (x.from_agent ? "Agent" : "Customer"),
        sender_email: x.sender && x.sender.email,
        text, internal, emily_draft, at: x.created_datetime,
        attachments: (x.attachments || []).map((a) => ({ name: a.name, url: a.url })),
      };
    }).sort((a, b2) => new Date(a.at) - new Date(b2.at));
    // Pull any order references (#LBO9622, LB1234, BB…) out of the subject + thread for the context rail.
    const orderRe = /#?\b((?:LBO|LB|BB)\s?\d{3,6})\b/gi;
    const scan = [t.subject || ""].concat(messages.map((mm) => mm.text || "")).join("  ");
    const orders = [...new Set((scan.match(orderRe) || []).map((s) => s.replace(/[#\s]/g, "").toUpperCase()))].slice(0, 8);
    res.json({
      id: t.id, subject: t.subject, status: t.status, brand: b.brand, brand_address: b.address,
      channel: t.channel, created: t.created_datetime, updated: t.updated_datetime, messages_count: messages.length,
      customer: { name: (t.customer && (t.customer.name || t.customer.email)) || "Customer", email: t.customer && t.customer.email },
      tags: (t.tags || []).map((x) => x.name), emily: emilyStatusOf(t), category: categorize(t), orders, messages,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Send a reply to the customer (via Gorgias), and mirror to Slack.
app.post("/api/reply", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { id, text } = req.body || {};
    if (!id || !text || !String(text).trim()) return res.status(400).json({ error: "id and text required" });
    const t = await gorgias("GET", `/tickets/${id}`);
    const b = brandOf(t);
    const custEmail = t.customer && t.customer.email;
    if (!b.address) return res.status(400).json({ error: "no connected sending address on this ticket" });
    if (!custEmail) return res.status(400).json({ error: "no customer email on this ticket" });
    const subject = /^re:/i.test(t.subject || "") ? t.subject : `Re: ${t.subject || ""}`;
    const html = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
    await gorgias("POST", `/tickets/${id}/messages`, {
      channel: "email", via: "api", from_agent: true, subject,
      sender: { email: process.env.GORGIAS_EMAIL }, receiver: { email: custEmail },
      source: { type: "email", to: [{ address: custEmail }], from: { address: b.address } },
      body_html: html, body_text: String(text),
    });
    slackPost(`✉️ *Reply sent via console* → ${custEmail} · ${b.brand} · ticket ${id}\n>>> ${String(text).slice(0, 500)}`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Add an internal note.
app.post("/api/note", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { id, text } = req.body || {};
    if (!id || !text) return res.status(400).json({ error: "id and text required" });
    await gorgias("POST", `/tickets/${id}/messages`, {
      channel: "internal-note", via: "api", from_agent: true,
      sender: { email: process.env.GORGIAS_EMAIL },
      body_html: String(text).replace(/\n/g, "<br>"), body_text: String(text),
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Close / reopen.
app.post("/api/status", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { id, status } = req.body || {};
    if (!id || !["open", "closed"].includes(status)) return res.status(400).json({ error: "id and status open|closed required" });
    await gorgias("PUT", `/tickets/${id}`, { status });
    slackPost(`${status === "closed" ? "✅ Closed" : "↩️ Reopened"} ticket ${id} via console`);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Ping Emily in Slack to draft this ticket.
app.post("/api/ask-emily", async (req, res) => {
  if (!guard(req, res)) return;
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    if (!EMILY_ID) return res.status(503).json({ error: "Emily Slack id not configured" });
    const r = await slackPost(`<@${EMILY_ID}> please draft ticket ${id}`);
    res.json({ ok: true, posted: !!(r && r.ok !== false) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`📨 Emily Console on :${PORT}`);
  console.log(`🔎 boot → key:${KEY ? "set" : "MISSING"} · gorgias:${G_DOMAIN ? G_DOMAIN : "MISSING"} · slack:${SLACK_TOKEN ? "set" : "off"} · cs-channel:${CS_CHANNEL ? "set" : "off"} · emily-id:${EMILY_ID ? "set" : "off"}`);
});
