/* Klaviyo / Django-style template language for emails and texts.
 *  {{ path|filter:arg }}  ·  {% if %}{% elif %}{% else %}{% endif %}  ·  {% for x in list %}{% empty %}{% endfor %}
 *  {% with a=b %}{% endwith %}  ·  {% currency_format expr %}  ·  forloop.counter / index / first / last
 * Unknown tags render nothing. Values are HTML-escaped unless the path ends in _url/_html or the |safe filter is used. */
"use strict";

const ENT = { "&quot;": '"', "&#39;": "'", "&#039;": "'", "&apos;": "'", "&amp;": "&", "&nbsp;": " ", "&#160;": " ", "&lt;": "<", "&gt;": ">" };
/** Inside {{ }} / {% %}: drop stray HTML the editor added, decode entities, straighten smart quotes. */
const cleanExpr = (s) => String(s).replace(/<[^>]*>/g, "").replace(/&(?:quot|#0?39|apos|amp|nbsp|#160|lt|gt);/g, (m) => ENT[m]).replace(/[‘’‚‛]/g, "'").replace(/[“”„]/g, '"').replace(/ /g, " ").trim();
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ---------------- values ---------------- */
function splitPath(p) {
  const out = []; const re = /\s*(?:\.?([A-Za-z_$][\w$]*)|\.(\d+)|\[\s*(?:'([^']*)'|"([^"]*)"|(\d+))\s*\])/y; let m; re.lastIndex = 0;
  while (re.lastIndex < p.length) { const at = re.lastIndex; m = re.exec(p); if (!m || re.lastIndex === at) return null; out.push(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]); }
  return out;
}
function lookupPath(ctx, path) {
  const parts = splitPath(String(path).trim()); if (!parts || !parts.length) return undefined;
  const get = (o, ks) => { for (const k of ks) { if (o == null) return undefined; if (Array.isArray(o) && /^-?\d+$/.test(k)) { const i = Number(k); o = o[i < 0 ? o.length + i : i]; } else o = o[k]; } return o; };
  let v = get(ctx, parts);
  if (v === undefined && parts[0] === "person") v = get(ctx.person, parts.slice(1)) ?? get(ctx, parts.slice(1));   // {{ person.first_name }} → first_name
  if (v === undefined && parts[0] === "organization" && parts[1] === "name") v = ctx.store_name;
  if (v === undefined && parts[0] === "organization" && parts[1] === "full_address") v = ctx.store_address;
  return v;
}
function literal(tok, ctx) {
  const t = String(tok).trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  const q = t.match(/^'([\s\S]*)'$|^"([\s\S]*)"$/); if (q) return q[1] ?? q[2];
  if (t === "True" || t === "true") return true; if (t === "False" || t === "false") return false; if (t === "None" || t === "null") return null;
  return lookupPath(ctx, t);
}
/** Split on a separator character, ignoring it inside quotes and brackets. */
function splitTop(s, sep) {
  const out = []; let cur = "", q = null, depth = 0;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue; }
    if (ch === "[" || ch === "(") depth++; if (ch === "]" || ch === ")") depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur); return out;
}
const num = (v) => { if (v == null || v === "") return NaN; const n = Number(String(v).replace(/[$,\s]/g, "")); return n; };
function money(v, sym = "$") { const n = num(v); if (!isFinite(n)) return v == null ? "" : String(v); return `${n < 0 ? "-" : ""}${sym}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function floatformat(v, arg) {
  const n = num(v); if (!isFinite(n)) return v == null ? "" : v;
  const d = arg == null || arg === "" ? -1 : Number(arg);
  if (d < 0) { const k = Math.abs(d); return Number.isInteger(n) ? String(n) : n.toFixed(k); }
  return n.toFixed(d);
}
const stripTags = (s) => String(s ?? "").replace(/<[^>]*>/g, "");

function applyFilter(v, name, arg, st) {
  switch (name) {
    case "default": return v == null || v === "" || v === false || (Array.isArray(v) && !v.length) ? arg : v;
    case "default_if_none": return v == null ? arg : v;
    case "upper": case "upcase": return v == null ? v : String(v).toUpperCase();
    case "lower": case "downcase": return v == null ? v : String(v).toLowerCase();
    case "title": return v == null ? v : String(v).replace(/\b\w/g, (c) => c.toUpperCase());
    case "capfirst": case "capitalize": return v == null ? v : String(v).charAt(0).toUpperCase() + String(v).slice(1);
    case "floatformat": return floatformat(v, arg);
    case "currency_format": case "money": return money(v);
    case "missing_product_image": return v ? v : st.missingImage || "";
    case "striptags": return stripTags(v);
    case "truncatechars": { const s = String(v ?? ""), n = Number(arg) || 0; return n && s.length > n ? s.slice(0, Math.max(0, n - 1)) + "…" : s; }
    case "truncatewords": { const w = String(v ?? "").split(/\s+/), n = Number(arg) || 0; return n && w.length > n ? w.slice(0, n).join(" ") + " …" : String(v ?? ""); }
    case "lookup": return v == null ? undefined : (v[arg] ?? (v.props || {})[arg]);
    case "length": case "count": case "size": return v == null ? 0 : Array.isArray(v) || typeof v === "string" ? v.length : Object.keys(v).length;
    case "first": return Array.isArray(v) ? v[0] : typeof v === "string" ? v[0] : v;
    case "last": return Array.isArray(v) ? v[v.length - 1] : typeof v === "string" ? v.slice(-1) : v;
    case "join": return Array.isArray(v) ? v.join(arg ?? ", ") : v;
    case "add": { const a = num(v), b = num(arg); return isFinite(a) && isFinite(b) ? a + b : `${v ?? ""}${arg ?? ""}`; }
    case "multiply": case "times": { const a = num(v), b = num(arg); return isFinite(a) && isFinite(b) ? +(a * b).toFixed(10) : v; }
    case "divide": case "divided_by": { const a = num(v), b = num(arg); return isFinite(a) && isFinite(b) && b ? +(a / b).toFixed(10) : v; }
    case "cut": return v == null ? v : String(v).split(String(arg ?? "")).join("");
    case "slice": { if (v == null) return v; const [a, b] = String(arg ?? ":").split(":").map((x) => (x === "" ? undefined : Number(x))); return v.slice(a, b); }
    case "pluralize": { const [one, many] = String(arg ?? ",s").includes(",") ? String(arg).split(",") : ["", String(arg ?? "s")]; return num(v) === 1 ? one : many; }
    case "urlencode": return encodeURIComponent(String(v ?? ""));
    case "safe": st.safe = true; return v;
    case "escape": return v;
    case "trim": case "strip": return v == null ? v : String(v).trim();
    case "replace": return v;   // Klaviyo has none; leave as is
    default: return v;
  }
}
/** path|filter:arg|filter2 → value (and whether it is safe HTML). */
function evalExpr(expr, ctx, st = {}) {
  const parts = splitTop(cleanExpr(expr), "|");
  const head = parts.shift().trim();
  let v = literal(head, ctx);
  st.path = head;
  for (const f of parts) {
    const m = f.trim().match(/^(\w+)\s*(?::\s*([\s\S]*))?$/); if (!m) continue;
    const arg = m[2] != null ? literal(m[2], ctx) : undefined;
    v = applyFilter(v, m[1], arg, st);
  }
  return v;
}
const show = (v) => (v == null ? "" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? "" : String(v));

/* ---------------- conditions ---------------- */
function condTokens(s) {
  const toks = []; const re = /\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|==|!=|>=|<=|>|<|\(|\)|[^\s()=!<>]+(?:\|[^\s()]+)*)/y; let m; re.lastIndex = 0;
  while (re.lastIndex < s.length) { const at = re.lastIndex; m = re.exec(s); if (!m || re.lastIndex === at) break; toks.push(m[1]); }
  return toks;
}
function evalCond(src, ctx) {
  const toks = condTokens(cleanExpr(src)); let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const val = () => { const t = next(); if (t === "(") { const v = or(); next(); return v; } return t == null ? undefined : evalExpr(t, ctx); };
  const truthy = (v) => !(v == null || v === false || v === "" || v === 0 || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length));
  const cmp = () => {
    const a = val(); const t = peek();
    if (["==", "!=", ">", "<", ">=", "<="].includes(t)) { next(); const b = val();
      const eq = a == b || String(a ?? "") === String(b ?? "");
      switch (t) { case "==": return eq; case "!=": return !eq; case ">": return num(a) > num(b); case "<": return num(a) < num(b); case ">=": return num(a) >= num(b); default: return num(a) <= num(b); } }
    if (t === "in" || (t === "not" && toks[i + 1] === "in")) { const neg = t === "not"; next(); if (neg) next(); const b = val();
      const has = Array.isArray(b) ? b.map(String).includes(String(a)) : b && typeof b === "object" ? String(a) in b : String(b ?? "").includes(String(a ?? "")); return neg ? !has : has; }
    return truthy(a);
  };
  const not = () => { if (peek() === "not") { next(); return !not(); } return cmp(); };
  const and = () => { let v = not(); while (peek() === "and") { next(); const b = not(); v = v && b; } return v; };
  const or = () => { let v = and(); while (peek() === "or") { next(); const b = and(); v = v || b; } return v; };
  try { return !!or(); } catch (_) { return false; }
}

/* ---------------- parse ---------------- */
function parse(src) {
  const toks = String(src).split(/(\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\})/);
  let i = 0;
  const block = (ends) => {
    const out = [];
    while (i < toks.length) {
      const t = toks[i];
      if (t.startsWith("{{") && t.endsWith("}}")) { out.push({ t: "var", e: t.slice(2, -2) }); i++; continue; }
      if (t.startsWith("{%") && t.endsWith("%}")) {
        const body = cleanExpr(t.slice(2, -2)); const name = (body.match(/^(\w+)/) || [])[1] || ""; const rest = body.slice(name.length).trim();
        if (ends.includes(name)) return { out, end: name, rest };
        i++;
        if (name === "if") {
          const branches = []; let cond = rest, els = null;
          for (;;) {
            const r = block(["elif", "else", "endif"]); branches.push({ cond, body: r.out });
            if (r.end === undefined) break; i++;
            if (r.end === "elif") { cond = r.rest; continue; }
            if (r.end === "else") { const r2 = block(["endif"]); if (r2.end) i++; els = r2.out; }
            break;
          }
          out.push({ t: "if", branches, els }); continue;
        }
        if (name === "for") {
          const m = rest.match(/^(\w+)(?:\s*,\s*(\w+))?\s+in\s+([\s\S]+?)(\s+reversed)?$/);
          const r = block(["empty", "endfor"]); if (r.end) i++; let empty = null;
          if (r.end === "empty") { const r2 = block(["endfor"]); if (r2.end) i++; empty = r2.out; }
          out.push({ t: "for", name: m ? m[1] : "item", name2: m && m[2], list: m ? m[3] : "", rev: !!(m && m[4]), body: r.out, empty }); continue;
        }
        if (name === "with") { const r = block(["endwith"]); if (r.end) i++; out.push({ t: "with", rest, body: r.out }); continue; }
        if (name === "comment") { const r = block(["endcomment"]); if (r.end) i++; continue; }
        out.push({ t: "tag", name, rest }); continue;
      }
      if (t) out.push({ t: "text", v: t });
      i++;
    }
    return { out, end: undefined };
  };
  return block([]).out;
}
const CACHE = new Map();
function compiled(src) { let c = CACHE.get(src); if (!c) { c = parse(src); CACHE.set(src, c); if (CACHE.size > 2000) CACHE.delete(CACHE.keys().next().value); } return c; }

/* ---------------- render ---------------- */
function run(nodes, ctx, opts) {
  let out = "";
  for (const n of nodes) {
    if (n.t === "text") out += n.v;
    else if (n.t === "var") {
      const st = { missingImage: opts.missingImage }; const v = evalExpr(n.e, ctx, st); const s = show(v);
      out += opts.html && !st.safe && !/(_url|_html)$/.test(st.path || "") ? escHtml(s) : s;
    } else if (n.t === "if") {
      const hit = n.branches.find((b) => evalCond(b.cond, ctx));
      out += run(hit ? hit.body || [] : n.els || [], ctx, opts);
    } else if (n.t === "for") {
      let list = evalExpr(n.list, ctx);
      if (list && !Array.isArray(list) && typeof list === "object") list = n.name2 ? Object.entries(list) : Object.values(list);
      if (!Array.isArray(list) || !list.length) { if (n.empty) out += run(n.empty, ctx, opts); continue; }
      if (n.rev) list = list.slice().reverse();
      list.slice(0, 200).forEach((it, k) => {
        const sc = Object.assign({}, ctx, { forloop: { counter: k + 1, counter0: k, index: k, first: k === 0, last: k === list.length - 1, length: list.length } });
        if (n.name2 && Array.isArray(it)) { sc[n.name] = it[0]; sc[n.name2] = it[1]; } else sc[n.name] = it;
        out += run(n.body, sc, opts);
      });
    } else if (n.t === "with") {
      const sc = Object.assign({}, ctx);
      for (const a of n.rest.match(/(\w+)\s*=\s*('[^']*'|"[^"]*"|\S+)/g) || []) { const [, k, e] = a.match(/(\w+)\s*=\s*([\s\S]+)/); sc[k] = evalExpr(e, ctx); }
      out += run(n.body, sc, opts);
    } else if (n.t === "tag") {
      if (n.name === "currency_format") { const s = money(evalExpr(n.rest, ctx)); out += opts.html ? escHtml(s) : s; }
      else if (opts.tags && opts.tags[n.name]) out += opts.tags[n.name](n.rest, ctx) || "";
      // anything else (Klaviyo-only tags) renders nothing
    }
  }
  return out;
}
/** Render a template string. opts: { html: true, missingImage, tags: { name: (args, ctx) => string } } */
function render(src, ctx, opts = {}) {
  const s = String(src ?? "");
  if (!/\{[{%]/.test(s)) return s;
  return run(compiled(s), ctx || {}, { html: opts.html !== false, missingImage: opts.missingImage, tags: opts.tags });
}

module.exports = { render, evalExpr, evalCond, lookupPath, money, floatformat, cleanExpr };
