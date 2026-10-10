/**
 * Klaviyo import — READ ONLY.
 *
 * Pulls Brusche's Klaviyo setup into Buzzin so the marketing features can be rebuilt from the real thing:
 * every flow with its full definition (trigger, splits, waits, emails, texts), the email templates those
 * flows use, lists, segments and sign-up forms.
 *
 * Only GET requests are ever made. Nothing in Klaviyo is created, changed or deleted.
 *   KLAVIYO_API_KEY   private API key (pk_…)
 */
const core = require("./core");
const { db } = core;

const BASE = "https://a.klaviyo.com/api";
const REVISION = process.env.KLAVIYO_REVISION || "2026-04-15";
const KEY = () => process.env.KLAVIYO_API_KEY || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let running = null;
let last = { at: null, counts: null, error: null };

async function kget(pathOrUrl, tries = 0) {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : BASE + pathOrUrl;
  const r = await fetch(url, { method: "GET", headers: { Authorization: `Klaviyo-API-Key ${KEY()}`, revision: REVISION, accept: "application/vnd.api+json" }, signal: AbortSignal.timeout(30000) });
  if (r.status === 429 && tries < 6) { const wait = Number(r.headers.get("retry-after")) || 2 ** tries; await sleep(wait * 1000); return kget(pathOrUrl, tries + 1); }
  if (!r.ok) { const t = await r.text().catch(() => ""); const e = new Error(`Klaviyo ${r.status} on ${url.replace(BASE, "")}: ${t.slice(0, 300)}`); e.status = r.status; throw e; }
  return r.json();
}

/** Every page of a list endpoint. */
async function kall(path, cap = 2000) {
  const out = []; let next = path;
  while (next && out.length < cap) { const j = await kget(next); out.push(...(j.data || [])); next = j.links && j.links.next; }
  return out;
}

async function save(kind, id, name, data) {
  await db(`INSERT INTO hd_klaviyo (kind, id, name, data, fetched_at) VALUES ($1,$2,$3,$4,now())
            ON CONFLICT (kind, id) DO UPDATE SET name=EXCLUDED.name, data=EXCLUDED.data, fetched_at=now()`, [kind, String(id), name || null, JSON.stringify(data)]);
}

/** Walk a flow definition's actions into a list of {id,type,...short} for the summary. */
function outline(def) {
  const acts = (def && def.actions) || [];
  const byType = {};
  for (const a of acts) byType[a.type] = (byType[a.type] || 0) + 1;
  return { actions: acts.length, by_type: byType, trigger: (def && def.triggers) || null };
}

function templateIds(def) {
  const ids = new Set();
  for (const a of (def && def.actions) || []) {
    const m = a.data && a.data.message;
    const t = m && (m.template_id || (m.content && m.content.template_id));
    if (t) ids.add(String(t));
  }
  return [...ids];
}

async function importAll(who = "system") {
  if (!KEY()) throw new Error("KLAVIYO_API_KEY isn't set.");
  if (running) return running;
  running = (async () => {
    const counts = { flows: 0, flow_errors: 0, templates: 0, lists: 0, segments: 0, forms: 0 };
    const summary = [];
    // Flows + full definitions
    const flows = await kall("/flows/?fields[flow]=name,status,archived,trigger_type,created,updated");
    const tids = new Set();
    for (const f of flows) {
      try {
        const j = await kget(`/flows/${f.id}/?additional-fields[flow]=definition`);
        const def = j.data && j.data.attributes && j.data.attributes.definition;
        await save("flow", f.id, f.attributes.name, j.data);
        templateIds(def).forEach((t) => tids.add(t));
        summary.push({ id: f.id, name: f.attributes.name, status: f.attributes.status, archived: f.attributes.archived, trigger: f.attributes.trigger_type, ...outline(def) });
        counts.flows++;
      } catch (e) {
        counts.flow_errors++;
        await save("flow", f.id, f.attributes.name, { id: f.id, attributes: f.attributes, error: e.message });
        summary.push({ id: f.id, name: f.attributes.name, status: f.attributes.status, error: e.message.slice(0, 160) });
      }
      await sleep(250);
    }
    // Templates used by flow emails (HTML kept so emails can be rebuilt)
    for (const t of tids) {
      try { const j = await kget(`/templates/${t}/`); await save("template", t, j.data.attributes.name, j.data); counts.templates++; } catch (e) { /* skip one bad template */ }
      await sleep(150);
    }
    // Lists, segments, sign-up forms
    for (const l of await kall("/lists/")) { await save("list", l.id, l.attributes.name, l); counts.lists++; }
    for (const s of await kall("/segments/")) { await save("segment", s.id, s.attributes.name, s); counts.segments++; }
    try { for (const f of await kall("/forms/")) { await save("form", f.id, f.attributes.name, f); counts.forms++; } }
    catch (e) { counts.forms_error = e.message.slice(0, 200); }
    await core.syncSet("klaviyo_import", new Date().toISOString(), { counts, by: who });
    last = { at: new Date().toISOString(), counts, error: null };
    console.log(`📥 Klaviyo import (read-only) done · ${JSON.stringify(counts)}`);
    for (const s of summary) console.log(`📥 flow · ${JSON.stringify(s)}`);
    return { counts, flows: summary };
  })().catch((e) => { last = { at: new Date().toISOString(), counts: null, error: e.message }; console.error("Klaviyo import failed:", e.message); throw e; })
    .finally(() => { running = null; });
  return running;
}

async function list(kind) {
  const r = await db(`SELECT id, name, fetched_at, data FROM hd_klaviyo WHERE kind=$1 ORDER BY name`, [kind]);
  return r.rows;
}
async function get(kind, id) {
  const r = await db(`SELECT id, name, fetched_at, data FROM hd_klaviyo WHERE kind=$1 AND id=$2`, [kind, String(id)]);
  return r.rows[0] || null;
}
async function status() {
  const r = await db(`SELECT kind, count(*)::int AS n, max(fetched_at) AS at FROM hd_klaviyo GROUP BY kind`);
  const p = await db(`SELECT count(*)::int AS n FROM hd_klaviyo_profiles`).catch(() => ({ rows: [{ n: 0 }] }));
  const ps = await core.syncGet("klaviyo_profiles_v1").catch(() => null);
  return { configured: !!KEY(), running: !!running, last, stored: r.rows, profiles: p.rows[0].n, profiles_export: ps ? ps.state : null };
}

/** One readable line per step, so a flow can be reviewed from the logs. Long message bodies are cut short. */
function stepLines(name, def) {
  const cut = (v) => JSON.stringify(v, (k, x) => (typeof x === "string" && x.length > 220 ? x.slice(0, 220) + "…" : (k === "html" || k === "body_html") ? undefined : x));
  return ((def && def.actions) || []).map((a) => `📋 ${name} · ${a.id} · ${a.type} · links ${cut(a.links || {})} · ${cut(a.data || {}).slice(0, 900)}`);
}
async function logOutlines() {
  const rows = (await db(`SELECT name, data FROM hd_klaviyo WHERE kind='flow' ORDER BY name`)).rows;
  for (const r of rows) {
    const def = r.data && r.data.attributes && r.data.attributes.definition;
    console.log(`📋 ${r.name} · entry ${def && def.entry_action_id} · trigger ${JSON.stringify((def && def.triggers) || null)} · filter ${JSON.stringify((def && def.profile_filter) || null).slice(0, 400)}`);
    for (const l of stepLines(r.name, def)) console.log(l);
  }
}

/* ---------------- Profiles, consent and memberships (read-only, resumable) ----------------
 * Klaviyo has been cancelled, so its API may stop answering. This copies every profile with its email and
 * SMS consent, properties and location, plus who is on each list and segment, into Buzzin. It saves its
 * place after every page, so a restart picks up where it stopped. */
let profRun = null;
async function exportProfiles() {
  if (profRun) return profRun;
  profRun = (async () => {
    const st = await core.syncGet("klaviyo_profiles_v1").catch(() => null);
    if (st && st.state && st.state.done) return st.state;
    let next = (st && st.cursor) || "/profiles/?additional-fields[profile]=subscriptions&page[size]=100";
    let n = (st && st.state && st.state.profiles) || 0, pages = 0;
    while (next) {
      const j = await kget(next);
      for (const p of j.data || []) {
        const a = p.attributes || {};
        await db(`INSERT INTO hd_klaviyo_profiles (id, email, phone, data, fetched_at) VALUES ($1,$2,$3,$4,now())
                  ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, phone=EXCLUDED.phone, data=EXCLUDED.data, fetched_at=now()`,
          [p.id, a.email ? String(a.email).toLowerCase() : null, a.phone_number || null, JSON.stringify(a)]);
        n++;
      }
      next = (j.links && j.links.next) || null;
      pages++;
      await core.syncSet("klaviyo_profiles_v1", next, { profiles: n, done: false });
      if (pages % 50 === 0) console.log(`📥 Klaviyo profiles · ${n} saved so far`);
      await sleep(120);
    }
    // Who is on each list and segment
    let memberships = 0;
    for (const kind of ["list", "segment"]) {
      const groups = (await db(`SELECT id, name FROM hd_klaviyo WHERE kind=$1`, [kind])).rows;
      for (const g of groups) {
        let url = `/${kind}s/${g.id}/profiles/?fields[profile]=email&page[size]=100`;
        while (url) {
          const j = await kget(url);
          for (const p of j.data || []) { await db(`INSERT INTO hd_klaviyo_members (kind, group_id, profile_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [kind, g.id, p.id]); memberships++; }
          url = (j.links && j.links.next) || null;
          await sleep(120);
        }
      }
    }
    const out = { profiles: n, memberships, done: true, at: new Date().toISOString() };
    await core.syncSet("klaviyo_profiles_v1", null, out);
    console.log(`📥 Klaviyo profiles done · ${JSON.stringify(out)}`);
    return out;
  })().catch((e) => { console.error("Klaviyo profiles export stopped (will resume on next start):", e.message); throw e; })
    .finally(() => { profRun = null; });
  return profRun;
}

async function init() {
  await db(`CREATE TABLE IF NOT EXISTS hd_klaviyo (kind TEXT NOT NULL, id TEXT NOT NULL, name TEXT, data JSONB, fetched_at TIMESTAMPTZ DEFAULT now(), PRIMARY KEY (kind, id))`);
  await db(`CREATE TABLE IF NOT EXISTS hd_klaviyo_profiles (id TEXT PRIMARY KEY, email TEXT, phone TEXT, data JSONB, fetched_at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE INDEX IF NOT EXISTS hd_klaviyo_profiles_email ON hd_klaviyo_profiles (email)`);
  await db(`CREATE TABLE IF NOT EXISTS hd_klaviyo_members (kind TEXT NOT NULL, group_id TEXT NOT NULL, profile_id TEXT NOT NULL, PRIMARY KEY (kind, group_id, profile_id))`);
  if (KEY()) setTimeout(() => exportProfiles().catch(() => {}), 40000);
  if (!KEY()) { console.log("📥 Klaviyo: no API key — import off"); return; }
  // First run after the key is added: import once, in the background.
  const done = await core.syncGet("klaviyo_import").catch(() => null);
  if (!done || !done.cursor) setTimeout(() => importAll("boot").catch(() => {}), 30000);
  else console.log(`📥 Klaviyo: last import ${done.cursor}`);
  // One-time: print each imported flow step by step (read from Buzzin's copy, nothing is fetched).
  // One-time: the names of Klaviyo's events (metrics), so flow splits like "metric WFY52h" can be read in plain words.
  if (done && done.cursor && !(await core.syncGet("klaviyo_metrics_v1").catch(() => null))) {
    setTimeout(async () => { try {
      const ms = await kall("/metrics/");
      for (const m of ms) await save("metric", m.id, m.attributes.name, m);
      console.log(`📋 Klaviyo metrics · ${ms.map((m) => `${m.id}=${m.attributes.name}${m.attributes.integration ? ` (${m.attributes.integration.name})` : ""}`).join(" | ")}`);
      await core.syncSet("klaviyo_metrics_v1", new Date().toISOString(), { n: ms.length });
    } catch (e) { console.error("Klaviyo metrics:", e.message); } }, 25000);
  }
  if (done && done.cursor && !(await core.syncGet("klaviyo_outline_v1").catch(() => null))) {
    setTimeout(async () => { try { await logOutlines(); await core.syncSet("klaviyo_outline_v1", new Date().toISOString(), {}); } catch (e) { console.error("Klaviyo outline:", e.message); } }, 20000);
  }
}

module.exports = { init, importAll, exportProfiles, list, get, status };
