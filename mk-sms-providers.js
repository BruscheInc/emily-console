/* =============================================================================================
 *  Buzzin Marketing · texting providers
 *  Each provider knows how to check that a webhook really came from it, read an incoming text or a
 *  delivery update, and answer a keyword. Sending is not wired yet: no number has been approved, and
 *  mk-send.js holds every text until one is. A provider only counts as configured when its keys are
 *  set as Railway variables (SMS_TWILIO_KEY = auth token, SMS_TWILIO_SID; SMS_TELNYX_KEY, SMS_TELNYX_PUBLIC_KEY).
 * ============================================================================================= */
const crypto = require("crypto");

const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const safeEq = (a, b) => { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const publicUrl = (req) => `${String(process.env.PUBLIC_URL || "").replace(/\/$/, "")}${req.originalUrl}`;

const twilio = {
  id: "twilio", name: "Twilio",
  notes: "Toll-free or 10DLC numbers. Toll-free needs a verification form (business, website, opt-in proof, sample messages); 10DLC needs a brand and a campaign registration.",
  configured: () => !!(process.env.SMS_TWILIO_KEY && process.env.SMS_TWILIO_SID),
  verify(req) {
    const params = req.body && typeof req.body === "object" ? req.body : {};
    const data = publicUrl(req) + Object.keys(params).sort().map((k) => k + params[k]).join("");
    const sig = crypto.createHmac("sha1", process.env.SMS_TWILIO_KEY || "").update(Buffer.from(data, "utf8")).digest("base64");
    return safeEq(sig, req.headers["x-twilio-signature"]);
  },
  parse(req) {
    const b = req.body || {};
    if (b.MessageStatus && !b.Body) return { kind: "status", providerId: b.MessageSid, status: String(b.MessageStatus).toLowerCase() };
    return { kind: "inbound", from: b.From, to: b.To, body: b.Body || "", providerId: b.MessageSid };
  },
  reply(res, text) { res.type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response>${text ? `<Message>${xml(text)}</Message>` : ""}</Response>`); },
};

const telnyx = {
  id: "telnyx", name: "Telnyx",
  notes: "Usually cheaper per text. Same toll-free verification or 10DLC registration as any US provider.",
  configured: () => !!(process.env.SMS_TELNYX_KEY && process.env.SMS_TELNYX_PUBLIC_KEY),
  verify(req) {
    // Telnyx signs "timestamp|raw body" with ed25519. Without the raw body we can't check it, so we refuse.
    if (!req.rawBody) return false;
    try {
      const ts = req.headers["telnyx-timestamp"], sig = req.headers["telnyx-signature-ed25519"];
      if (!ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
      const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(process.env.SMS_TELNYX_PUBLIC_KEY, "base64")]), format: "der", type: "spki" });
      return crypto.verify(null, Buffer.from(`${ts}|${req.rawBody}`), key, Buffer.from(sig, "base64"));
    } catch (_) { return false; }
  },
  parse(req) {
    const d = (req.body && req.body.data) || {}, p = d.payload || {};
    if (d.event_type === "message.received") return { kind: "inbound", from: p.from && p.from.phone_number, to: p.to && p.to[0] && p.to[0].phone_number, body: p.text || "", providerId: p.id };
    if (d.event_type === "message.finalized") return { kind: "status", providerId: p.id, status: String((p.to && p.to[0] && p.to[0].status) || "").replace("delivery_failed", "failed") };
    return { kind: "other" };
  },
  reply(res) { res.status(200).end(); }, // Telnyx replies are sent through its API, not in the webhook answer (wired with sending)
};

const ALL = { twilio, telnyx };
module.exports = {
  get: (id) => ALL[id] || null,
  list: () => Object.values(ALL).map((p) => ({ id: p.id, name: p.name, notes: p.notes, configured: p.configured() })),
};
