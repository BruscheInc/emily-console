/**
 * Buzzin — Claude connector (remote MCP server, stateless Streamable HTTP).
 *
 * Lets Claude open Buzzin tickets the way staff see them: the conversation, Emily's drafts,
 * the actions she staged, the ticket history, and her written policies. It can add an internal
 * note. It can NOT email a customer, approve an action, or change an order.
 *
 * Turned on by setting BUZZIN_MCP_TOKEN (a long random string). Without it, /mcp answers 404.
 * Add to claude.ai → Settings → Connectors → Add custom connector with:
 *     https://<buzzin-host>/mcp/<BUZZIN_MCP_TOKEN>
 */
const crypto = require("crypto");

const PROTOCOL = "2025-06-18";
const MAX_BODY = 8000;   // characters per message body sent back to Claude

module.exports = function mountMcp(app, deps = {}) {
  const core = deps.core || require("./core");
  const emily = () => deps.emily || require("./emily");
  const db = (q, p) => core.db(q, p);

  /* ---------------- auth ---------------- */
  function tokenOk(given) {
    const want = process.env.BUZZIN_MCP_TOKEN || "";
    if (!want || !given) return false;
    const a = Buffer.from(String(given)), b = Buffer.from(want);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  const tokenFrom = (req) => req.params.token || req.query.key || (req.headers.authorization || "").replace(/^Bearer /i, "");

  /* ---------------- helpers ---------------- */
  const cut = (s, n = MAX_BODY) => { s = String(s || ""); return s.length > n ? s.slice(0, n) + `… [${s.length - n} more characters]` : s; };
  const ticketId = (v) => { const n = Number(String(v || "").replace(/[^\d]/g, "")); if (!n) throw new Error("ticket id is required (a number like 9000000517)"); return n; };

  async function getTicket(id) {
    const t = (await db(`SELECT * FROM hd_tickets WHERE id=$1`, [id])).rows[0];
    if (!t) throw new Error(`Ticket ${id} not found in Buzzin.`);
    const msgs = (await db(`SELECT id, from_agent, internal, channel, sender_name, sender_email, to_emails, subject, body_text, attachments, sent_by, at
                            FROM hd_messages WHERE ticket_id=$1 ORDER BY at ASC, id ASC`, [id])).rows;
    const messages = msgs.map((m) => ({
      at: m.at,
      who: m.internal ? "internal note" : m.from_agent ? "us (to customer)" : "customer",
      sender: m.sender_name || m.sender_email || null,
      sent_by: m.sent_by || null,
      text: cut(core.stripQuoted ? core.stripQuoted(m.body_text).text : m.body_text),
      attachments: (m.attachments || []).map((a) => a.name).filter(Boolean),
    }));
    const drafts = (await db(`SELECT id, category, intent, sentiment, escalate, escalate_reason, draft, final_text, outcome, todo, decided_by, created_at, decided_at
                             FROM emily_drafts WHERE ticket_id=$1 ORDER BY id ASC`, [String(id)])).rows
      .map((d) => ({ ...d, draft: cut(d.draft), final_text: d.final_text ? cut(d.final_text) : null }));
    let actions = [];
    try { actions = (await db(`SELECT id, kind, title, summary, input, status, result, decided_by, created_at, decided_at
                               FROM emily_actions WHERE ticket_id=$1 ORDER BY created_at ASC`, [String(id)])).rows; }
    catch (_) { actions = await emily().listActions(id).catch(() => []); }
    const events = (await db(`SELECT kind, detail, user_name AS who, target, ts FROM hd_events WHERE ticket_id=$1 ORDER BY ts ASC LIMIT 200`, [String(id)])).rows;
    return {
      ticket: {
        id: t.id, subject: t.subject, status: t.status, brand: t.brand, mailbox: t.mailbox, channel: t.channel,
        customer: { name: t.customer_name, email: t.customer_email }, order_number: t.order_number || null,
        tags: t.tags || [], category: t.category || null, assignee: t.assignee, created: t.created_at, updated: t.updated_at,
      },
      messages, emily_drafts: drafts, emily_actions: actions, history: events,
    };
  }

  async function listTickets(a) {
    const where = [], p = [];
    const add = (sql, v) => { p.push(v); where.push(sql.replace(/\$\?/g, `$${p.length}`)); };
    if (a.status) add(`t.status = $?`, String(a.status));
    if (a.brand) add(`t.brand ILIKE $?`, `%${a.brand}%`);
    if (a.emily === "drafted") where.push(`'emily-drafted' = ANY(t.tags)`);
    if (a.emily === "sent") where.push(`'emily-sent' = ANY(t.tags)`);
    if (a.emily === "escalated") where.push(`EXISTS (SELECT 1 FROM emily_drafts d WHERE d.ticket_id = t.id::text AND d.escalate)`);
    if (a.before_id) add(`t.id < $?`, Number(a.before_id));
    if (a.q) {
      const q = String(a.q).trim();
      p.push(`%${q}%`); const i = p.length;
      p.push(q.replace(/[#\s]/g, "").toUpperCase()); const j = p.length;
      where.push(`(t.subject ILIKE $${i} OR t.customer_email ILIKE $${i} OR t.customer_name ILIKE $${i} OR upper(coalesce(t.order_number,'')) = $${j}
                  OR EXISTS (SELECT 1 FROM hd_messages m WHERE m.ticket_id = t.id AND m.body_text ILIKE $${i}))`);
    }
    if (!a.include_spam) where.push(`NOT coalesce(t.spam, false)`);
    const limit = Math.min(Math.max(Number(a.limit) || 25, 1), 100);
    const rows = (await db(`SELECT t.id, t.subject, t.status, t.brand, t.customer_name, t.customer_email, t.order_number, t.tags, t.messages_count, t.last_message_at
                            FROM hd_tickets t ${where.length ? "WHERE " + where.join(" AND ") : ""}
                            ORDER BY t.id DESC LIMIT ${limit}`, p)).rows;
    return { tickets: rows, next_before_id: rows.length === limit ? rows[rows.length - 1].id : null };
  }

  async function policies(key) {
    if (key) {
      const r = (await db(`SELECT key, body, note, updated_by, created_at FROM emily_policies WHERE key=$1 ORDER BY id DESC LIMIT 1`, [String(key)])).rows[0];
      if (!r) throw new Error(`No policy named "${key}". Call without a key to list them.`);
      return r;
    }
    const r = (await db(`SELECT DISTINCT ON (key) key, left(body, 300) AS preview, updated_by, created_at FROM emily_policies ORDER BY key, id DESC`)).rows;
    return { policies: r };
  }

  async function addNote(a) {
    const id = ticketId(a.id), text = String(a.text || "").trim();
    if (!text) throw new Error("text is required");
    const t = (await db(`SELECT id FROM hd_tickets WHERE id=$1`, [id])).rows[0];
    if (!t) throw new Error(`Ticket ${id} not found in Buzzin.`);
    await core.addNote({ ticketId: id, text, who: "Claude" });
    await core.audit({ ticketId: id, kind: "note", detail: "internal note added from Claude", who: "Claude" });
    return { ok: true, ticket: id, note: "Internal note added. The customer does not see it." };
  }

  /* ---------------- tools ---------------- */
  const TOOLS = [
    {
      name: "buzzin_get_ticket",
      description: "Open one Buzzin ticket: the full conversation (customer messages, our replies, internal notes), every draft Emily wrote with her category/intent/escalation, the actions she staged (replacements, address changes, refunds…) with their inputs and status, and the ticket history. Use this to review how Emily handled a ticket.",
      inputSchema: { type: "object", properties: { id: { type: "number", description: "Buzzin ticket id, e.g. 9000000517" } }, required: ["id"] },
      annotations: { readOnlyHint: true },
      run: (a) => getTicket(ticketId(a.id)),
    },
    {
      name: "buzzin_list_tickets",
      description: "List Buzzin tickets, newest first. Filter by status ('open','closed'), brand, Emily state ('drafted','sent','escalated'), or a search q that matches subject, customer name/email, order number, or message text. Page with before_id.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string" }, brand: { type: "string" },
          emily: { type: "string", enum: ["drafted", "sent", "escalated"] },
          q: { type: "string", description: "Search text, an email, or an order number like LB12345" },
          limit: { type: "number", description: "1–100, default 25" },
          before_id: { type: "number", description: "next_before_id from the previous page" },
          include_spam: { type: "boolean" },
        },
      },
      annotations: { readOnlyHint: true },
      run: listTickets,
    },
    {
      name: "buzzin_emily_policies",
      description: "Read Emily's written policies/instructions as stored in Buzzin. Without a key, lists every policy with a preview; with a key, returns the full current text.",
      inputSchema: { type: "object", properties: { key: { type: "string" } } },
      annotations: { readOnlyHint: true },
      run: (a) => policies(a.key),
    },
    {
      name: "buzzin_add_internal_note",
      description: "Add an internal note to a Buzzin ticket (team only; the customer never sees it). Signed as Claude.",
      inputSchema: { type: "object", properties: { id: { type: "number" }, text: { type: "string" } }, required: ["id", "text"] },
      annotations: { readOnlyHint: false, destructiveHint: false },
      run: addNote,
    },
  ];

  /* ---------------- JSON-RPC ---------------- */
  async function handle(msg) {
    const { id, method, params = {} } = msg || {};
    const reply = (result) => ({ jsonrpc: "2.0", id, result });
    const error = (code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
    if (!msg || msg.jsonrpc !== "2.0" || typeof method !== "string") return error(-32600, "Invalid request");
    if (id === undefined) return null;   // notification (e.g. notifications/initialized) — nothing to send back
    switch (method) {
      case "initialize":
        return reply({
          protocolVersion: params.protocolVersion || PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "buzzin", version: require("./package.json").version },
          instructions: "Buzzin is Brusche Inc.'s own support desk; Emily is the AI agent inside it. Ticket ids are numbers from 9000000000 up. Read-only except internal notes.",
        });
      case "ping": return reply({});
      case "tools/list":
        return reply({ tools: TOOLS.map(({ run, ...t }) => t) });
      case "tools/call": {
        const tool = TOOLS.find((t) => t.name === params.name);
        if (!tool) return error(-32602, `Unknown tool: ${params.name}`);
        try {
          const out = await tool.run(params.arguments || {});
          return reply({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }] });
        } catch (e) {
          return reply({ isError: true, content: [{ type: "text", text: `Error: ${e.message}` }] });
        }
      }
      default: return error(-32601, `Method not found: ${method}`);
    }
  }

  async function endpoint(req, res) {
    if (!process.env.BUZZIN_MCP_TOKEN) return res.status(404).json({ error: "connector not enabled" });
    if (!tokenOk(tokenFrom(req))) return res.status(401).json({ error: "unauthorized" });
    if (req.method !== "POST") return res.status(405).set("Allow", "POST").json({ error: "use POST" });
    const body = req.body;
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(handle))).filter(Boolean);
      return out.length ? res.json(out) : res.status(202).end();
    }
    const out = await handle(body);
    return out ? res.json(out) : res.status(202).end();
  }

  app.all("/mcp", endpoint);
  app.all("/mcp/:token", endpoint);
  return { handle, TOOLS };
};
