/* =============================================================================================
 *  Buzzin Marketing · one Brusche profile per customer
 *
 *  Customers belong to Brusche, not to a store: there is one Brusche audience and profiles show no
 *  store. Internally every profile's `store` is 'lb' (the brand Brusche sends as); `stores` quietly
 *  keeps which shops someone came from, for history only.
 *
 *  1. backup()  — copies every profile-linked table to mk_bak_<stamp>_<table> before any change.
 *  2. merge()   — profiles with the same email become one. The strictest consent wins (an unsubscribe
 *                 or bounce in either store stays). Orders and spend from both stores are added up.
 *                 A profile with no email is folded into the one profile that has its phone; the same
 *                 phone on DIFFERENT emails is never merged (usually a spouse or a typo) — see sharedPhones().
 *                 Old ids are kept in mk_profile_merges so old unsubscribe links still work.
 *  3. Import of Shopify customer exports (CSV): names, address, tags, totals and survey answers.
 *     Email "yes" only fills in someone who has no consent record yet; it never overrides an
 *     unsubscribe. The file's SMS column is ignored: text consent comes only from Shopify's own SMS
 *     consent record (synced) or from a Buzzin form/keyword. Email subscribers who can't get texts are
 *     tagged sms_candidate and put on the "SMS candidates (email subscribers)" list for a join-texts email.
 * ============================================================================================= */
const core = require("./core");
const { db } = core;
const MK = () => require("./mk-core");

const LINKED = [   // [table, has a unique key that includes profile_id]
  ["mk_consent_log", false], ["mk_events", false], ["mk_list_members", true], ["mk_segment_members", true],
  ["mk_campaign_recipients", true], ["mk_sends", false], ["mk_flow_runs", false], ["mk_flow_log", false],
  ["mk_visitors", false], ["mk_coupons", false], ["mk_sms_inbound", false], ["mk_form_events", false],
];
const RANK = "CASE {c} WHEN 'stopped' THEN 4 WHEN 'unsubscribed' THEN 3 WHEN 'subscribed' THEN 2 ELSE 1 END";
const rank = (c) => RANK.replace("{c}", c);
const UNRANK = (x) => `CASE ${x} WHEN 4 THEN 'stopped' WHEN 3 THEN 'unsubscribed' WHEN 2 THEN 'subscribed' ELSE 'never' END`;

async function exists(t) { return !!(await db(`SELECT to_regclass($1) r`, [t])).rows[0].r; }

async function migrate() {
  await db(`ALTER TABLE mk_profiles ADD COLUMN IF NOT EXISTS stores TEXT[] NOT NULL DEFAULT '{}'`);
  await db(`UPDATE mk_profiles SET stores = ARRAY[store] WHERE stores = '{}'`);
  await db(`CREATE TABLE IF NOT EXISTS mk_profile_merges (old_id BIGINT PRIMARY KEY, new_id BIGINT NOT NULL, store TEXT, email TEXT, at TIMESTAMPTZ DEFAULT now())`);
  await db(`CREATE TABLE IF NOT EXISTS mk_import_rows (id BIGSERIAL PRIMARY KEY, batch TEXT NOT NULL, store TEXT NOT NULL, file TEXT, row JSONB NOT NULL)`);
  await db(`CREATE INDEX IF NOT EXISTS mk_import_rows_batch ON mk_import_rows (batch, id)`);
  await db(`CREATE INDEX IF NOT EXISTS mk_profiles_email ON mk_profiles (email)`);
  await db(`CREATE INDEX IF NOT EXISTS mk_profiles_phone ON mk_profiles (phone)`);
}

/** Old (merged-away) profile id → the profile it lives in now. */
async function resolveId(id) {
  let cur = Number(id);
  for (let i = 0; i < 5; i++) { const r = (await db(`SELECT new_id FROM mk_profile_merges WHERE old_id=$1`, [cur])).rows[0]; if (!r) break; cur = Number(r.new_id); }
  return cur;
}

/* ---------------- job state (one job at a time, progress shown on the Import page) ---------------- */
let job = null;
const log = [];
const note = (m) => { const line = `${new Date().toISOString().slice(11, 19)} ${m}`; log.push(line); if (log.length > 80) log.shift(); console.log(`🧩 ${m}`); };
function run(name, fn) {
  if (job) throw Object.assign(new Error(`"${job.name}" is still running.`), { status: 409 });
  job = { name, started: new Date().toISOString(), progress: "" };
  (async () => { try { note(`${name}: starting`); const out = await fn((p) => { job.progress = p; }); note(`${name}: done${out ? " — " + out : ""}`); }
    catch (e) { note(`${name}: FAILED — ${e.message}`); console.error(e); } finally { job = null; } })();
  return { started: true };
}

/* ---------------- 1. backup ---------------- */
async function backup(who) {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 12);
  const done = [];
  for (const t of ["mk_profiles", ...LINKED.map((x) => x[0]), "mk_lists"]) {
    if (!(await exists(t))) continue;
    await db(`CREATE TABLE mk_bak_${stamp}_${t} AS TABLE ${t}`);
    done.push(t);
  }
  const n = (await db(`SELECT count(*)::int n FROM mk_bak_${stamp}_mk_profiles`)).rows[0].n;
  const list = (await core.setting("mk_backups", null)) || [];
  list.unshift({ stamp, tables: done, profiles: n, by: who || null, at: new Date().toISOString() });
  await db(`INSERT INTO emily_settings (key, value, updated_by, updated_at) VALUES ('mk_backups',$1,$2,now()) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now()`, [JSON.stringify(list.slice(0, 10)), who || null]);
  await core.audit({ kind: "mk-backup", detail: `Profile backup ${stamp}: ${n} profiles, ${done.length} tables`, who: who || "staff" }).catch(() => {});
  return { stamp, profiles: n, tables: done };
}

/* ---------------- 2. merge ---------------- */
async function mergePreview() {
  const r = (await db(`SELECT
      (SELECT count(*)::int FROM mk_profiles) profiles,
      (SELECT count(*)::int FROM (SELECT email FROM mk_profiles WHERE email IS NOT NULL GROUP BY email HAVING count(*)>1) x) email_groups,
      (SELECT COALESCE(sum(n-1),0)::int FROM (SELECT count(*) n FROM mk_profiles WHERE email IS NOT NULL GROUP BY email HAVING count(*)>1) x) email_extra,
      (SELECT count(*)::int FROM mk_profiles p WHERE p.email IS NULL AND p.phone IS NOT NULL
         AND (SELECT count(DISTINCT q.email) FROM mk_profiles q WHERE q.phone=p.phone AND q.email IS NOT NULL)=1) phone_only_foldable,
      (SELECT count(*)::int FROM (SELECT phone FROM mk_profiles WHERE phone IS NOT NULL AND email IS NOT NULL GROUP BY phone HAVING count(DISTINCT email)>1) x) shared_phones`)).rows[0];
  return { ...r, after: r.profiles - r.email_extra - r.phone_only_foldable };
}

/** Fold every profile listed in tmp_merge (dup_id → keep_id) into its keeper. One transaction. */
async function foldMap(label) {
  const links = [];
  for (const [t, uniq] of LINKED) {
    if (!(await exists(t))) continue;
    if (uniq) links.push(`DELETE FROM ${t} x USING tmp_merge m WHERE x.profile_id=m.dup_id AND EXISTS (SELECT 1 FROM ${t} y WHERE y.profile_id=m.keep_id AND ${t === "mk_list_members" ? "y.list_id=x.list_id" : t === "mk_segment_members" ? "y.segment_id=x.segment_id" : "y.campaign_id=x.campaign_id AND y.round=x.round"});`);
    links.push(`UPDATE ${t} x SET profile_id=m.keep_id FROM tmp_merge m WHERE x.profile_id=m.dup_id;`);
  }
  const sql = `BEGIN;
    -- the keeper takes the best of every profile in its group
    WITH g AS (SELECT m.keep_id, p.* FROM tmp_merge m JOIN mk_profiles p ON p.id=m.dup_id
               UNION ALL SELECT p.id, p.* FROM mk_profiles p WHERE p.id IN (SELECT keep_id FROM tmp_merge)),
    a AS (SELECT keep_id,
            max(${rank("email_consent")}) er, max(${rank("sms_consent")}) sr,
            (array_agg(email_consent_at ORDER BY ${rank("email_consent")} DESC, email_consent_at DESC NULLS LAST))[1] e_at,
            (array_agg(sms_consent_at ORDER BY ${rank("sms_consent")} DESC, sms_consent_at DESC NULLS LAST))[1] s_at,
            sum(orders_count)::int oc, sum(total_spent) ts, min(first_order_at) fo, max(last_order_at) lo, max(last_engaged_at) le, min(created_at) ca,
            (array_agg(phone) FILTER (WHERE phone IS NOT NULL))[1] ph, (array_agg(email) FILTER (WHERE email IS NOT NULL))[1] em,
            (array_agg(first_name) FILTER (WHERE COALESCE(first_name,'')<>''))[1] fn, (array_agg(last_name) FILTER (WHERE COALESCE(last_name,'')<>''))[1] ln,
            (array_agg(shopify_id) FILTER (WHERE shopify_id IS NOT NULL))[1] sid, (array_agg(klaviyo_id) FILTER (WHERE klaviyo_id IS NOT NULL))[1] kid,
            (array_agg(city) FILTER (WHERE city IS NOT NULL))[1] city, (array_agg(region) FILTER (WHERE region IS NOT NULL))[1] region,
            (array_agg(country) FILTER (WHERE country IS NOT NULL))[1] country, (array_agg(zip) FILTER (WHERE zip IS NOT NULL))[1] zip,
            (array_agg(timezone) FILTER (WHERE timezone IS NOT NULL))[1] tz,
            ARRAY(SELECT DISTINCT x FROM tmp_merge m2 JOIN mk_profiles q ON q.id=m2.dup_id OR q.id=m2.keep_id, unnest(q.sources) x WHERE m2.keep_id=g.keep_id) srcs,
            ARRAY(SELECT DISTINCT x FROM tmp_merge m2 JOIN mk_profiles q ON q.id=m2.dup_id OR q.id=m2.keep_id, unnest(q.stores || q.store) x WHERE m2.keep_id=g.keep_id) sts
          FROM g GROUP BY keep_id)
    UPDATE mk_profiles p SET
      email_consent=${UNRANK("a.er")}, sms_consent=${UNRANK("a.sr")}, email_consent_at=a.e_at, sms_consent_at=a.s_at,
      orders_count=a.oc, total_spent=a.ts, first_order_at=a.fo, last_order_at=a.lo, last_engaged_at=a.le, created_at=COALESCE(a.ca, p.created_at),
      email=COALESCE(p.email,a.em), phone=COALESCE(p.phone,a.ph), first_name=COALESCE(NULLIF(p.first_name,''),a.fn), last_name=COALESCE(NULLIF(p.last_name,''),a.ln),
      shopify_id=COALESCE(p.shopify_id,a.sid), klaviyo_id=COALESCE(p.klaviyo_id,a.kid), city=COALESCE(p.city,a.city), region=COALESCE(p.region,a.region),
      country=COALESCE(p.country,a.country), zip=COALESCE(p.zip,a.zip), timezone=COALESCE(p.timezone,a.tz),
      sources=a.srcs, stores=a.sts, store=CASE WHEN 'lb' = ANY(a.sts) THEN 'lb' ELSE p.store END, updated_at=now()
    FROM a WHERE p.id=a.keep_id;
    -- the merged-away profiles' properties fill in what the keeper doesn't have
    UPDATE mk_profiles p SET props = x.props || p.props FROM
      (SELECT m.keep_id, jsonb_object_agg(k.key, k.value) props FROM tmp_merge m JOIN mk_profiles d ON d.id=m.dup_id, LATERAL jsonb_each(d.props) k GROUP BY m.keep_id) x
      WHERE p.id=x.keep_id;
    ${links.join("\n    ")}
    INSERT INTO mk_consent_log (profile_id, channel, state, previous, source, detail, at)
      SELECT m.keep_id, 'email', p.email_consent, p.email_consent, 'merge', '${label}: profile ' || m.dup_id || ' (' || d.store || ') merged in', now()
      FROM tmp_merge m JOIN mk_profiles d ON d.id=m.dup_id JOIN mk_profiles p ON p.id=m.keep_id;
    INSERT INTO mk_profile_merges (old_id, new_id, store, email) SELECT m.dup_id, m.keep_id, d.store, d.email FROM tmp_merge m JOIN mk_profiles d ON d.id=m.dup_id ON CONFLICT (old_id) DO UPDATE SET new_id=EXCLUDED.new_id;
    UPDATE mk_profile_merges x SET new_id=m.keep_id FROM tmp_merge m WHERE x.new_id=m.dup_id;
    DELETE FROM mk_profiles p USING tmp_merge m WHERE p.id=m.dup_id;
    COMMIT;`;
  await db(sql);
}

async function merge(who) {
  const before = (await db(`SELECT count(*)::int n FROM mk_profiles`)).rows[0].n;
  // Same email → one profile. Keeper: the Larkspur Baby profile, else the oldest.
  await db(`DROP TABLE IF EXISTS tmp_merge; CREATE TABLE tmp_merge AS
    SELECT id dup_id, first_value(id) OVER w keep_id FROM mk_profiles WHERE email IS NOT NULL
    WINDOW w AS (PARTITION BY email ORDER BY (store='lb') DESC, id)`);
  await db(`DELETE FROM tmp_merge WHERE dup_id=keep_id; CREATE INDEX ON tmp_merge (dup_id); CREATE INDEX ON tmp_merge (keep_id)`);
  const byEmail = (await db(`SELECT count(*)::int n FROM tmp_merge`)).rows[0].n;
  if (byEmail) await foldMap("same email");
  // No email, phone matches exactly one emailed profile → fold in.
  await db(`DROP TABLE IF EXISTS tmp_merge; CREATE TABLE tmp_merge AS
    SELECT p.id dup_id, (SELECT q.id FROM mk_profiles q WHERE q.phone=p.phone AND q.email IS NOT NULL ORDER BY (q.store='lb') DESC, q.id LIMIT 1) keep_id
    FROM mk_profiles p WHERE p.email IS NULL AND p.phone IS NOT NULL
      AND (SELECT count(DISTINCT q.email) FROM mk_profiles q WHERE q.phone=p.phone AND q.email IS NOT NULL)=1`);
  await db(`CREATE INDEX ON tmp_merge (dup_id); CREATE INDEX ON tmp_merge (keep_id)`);
  const byPhone = (await db(`SELECT count(*)::int n FROM tmp_merge`)).rows[0].n;
  if (byPhone) await foldMap("same phone, no email");
  await db(`DROP TABLE IF EXISTS tmp_merge`);
  // One Brusche audience: no profile belongs to a single store any more.
  await db(`UPDATE mk_profiles SET store='lb' WHERE store <> 'lb'`);
  await db(`UPDATE mk_lists SET store='lb' WHERE store <> 'lb'`);
  // From now on one email = one profile.
  await db(`DROP INDEX IF EXISTS mk_profiles_store_email`);
  await db(`CREATE UNIQUE INDEX IF NOT EXISTS mk_profiles_email_one ON mk_profiles (email) WHERE email IS NOT NULL`);
  await MK().recomputeTiers();
  const after = (await db(`SELECT count(*)::int n FROM mk_profiles`)).rows[0].n;
  await core.audit({ kind: "mk-merge", detail: `Profiles merged: ${before} → ${after} (${byEmail} by email, ${byPhone} phone-only)`, who: who || "staff" }).catch(() => {});
  return `${before} → ${after} profiles (${byEmail} same-email, ${byPhone} phone-only folded in)`;
}

/** Phones on more than one email — listed for a person to review, never merged automatically. */
async function sharedPhones(limit = 100000) {
  return (await db(`SELECT phone, count(*)::int profiles, string_agg(COALESCE(email,'(no email)') || ' · ' || trim(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) || ' · ' || store, ' | ' ORDER BY id) who
    FROM mk_profiles WHERE phone IS NOT NULL GROUP BY phone HAVING count(DISTINCT COALESCE(email, id::text)) > 1 ORDER BY count(*) DESC, phone LIMIT $1`, [limit])).rows;
}

/* ---------------- 3. CSV import ---------------- */
function parseCsv(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"') q = true; else if (c === ",") { row.push(f); f = ""; } else if (c === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (c !== "\r") f += c;
  }
  if (f !== "" || row.length) { row.push(f); rows.push(row); }
  return rows;
}
const clean = (v) => String(v == null ? "" : v).trim().replace(/^'/, "");
const SURVEY = { childs_gender: "child_gender", what_clothing_size_best_fits_your_child: "child_size", what_clothing_size_best_fits_your_child_please_choose_the_size_t: "child_size",
  your_size: "adult_size", our_studio_is_located_in_plano_tx_do_you_live_in_the_dfw_area: "lives_in_dfw", would_you_be_interested_in_modeling_our_adult_pjs: "adult_pj_model_interest",
  which_color_design_styles_would_you_like_to_see_more_of: "style_preference", how_would_you_rate_your_overall_experience_with_our_brand: "brand_rating",
  on_a_scale_of_1_to_5_how_likely_are_you_to_recommend_our_brand_t: "recommend_score", would_you_consider_purchasing_from_us_again_in_the_future: "would_buy_again",
  what_could_we_do_to_improve_your_experience_with_our_brand: "improve_feedback", what_influenced_your_decision_not_to_purchase_from_us_in_the_las: "no_purchase_reason",
  please_select_an_option_below: "survey_option", tell_us_more: "survey_note", tell_us_more_1: "survey_note", tell_us_more_1_1: "survey_note", order_no: "survey_order_no" };

async function upload(file, text, who) {
  const store = "brusche";
  const rows = parseCsv(text);
  const head = (rows.shift() || []).map((h) => h.trim());
  if (!head.includes("Email") || !head.includes("Accepts Email Marketing")) throw Object.assign(new Error("This doesn't look like a Shopify customer export (no Email / Accepts Email Marketing columns)."), { status: 400 });
  const batch = "current";
  let n = 0;
  for (let i = 0; i < rows.length; i += 2000) {
    const chunk = rows.slice(i, i + 2000).filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, k) => [h, r[k] == null ? "" : r[k]])));
    if (!chunk.length) continue;
    await db(`INSERT INTO mk_import_rows (batch, store, file, row) SELECT $1, $2, $3, x FROM jsonb_array_elements($4::jsonb) x`, [batch, store, file || null, JSON.stringify(chunk)]);
    n += chunk.length;
  }
  note(`uploaded ${file || "file"}: ${n} rows by ${who || "staff"}`);
  return { file, rows: n };
}

async function importPreview() {
  const files = (await db(`SELECT file, count(*)::int rows FROM mk_import_rows WHERE batch='current' GROUP BY file ORDER BY file`)).rows;
  const r = (await db(`WITH x AS (SELECT file, lower(trim(row->>'Email')) email, row->>'Accepts Email Marketing' em,
        regexp_replace(COALESCE(NULLIF(row->>'Phone',''), row->>'Default Address Phone',''), '\\D', '', 'g') ph FROM mk_import_rows WHERE batch='current'),
      u AS (SELECT email, bool_or(em='yes') em_yes, count(DISTINCT file) nf FROM x WHERE email <> '' GROUP BY email)
    SELECT (SELECT count(*)::int FROM x) rows,
      (SELECT count(*)::int FROM x WHERE email='' AND length(ph) < 10) skipped,
      (SELECT count(*)::int FROM u) people,
      (SELECT count(*)::int FROM u WHERE nf > 1) in_several_files,
      (SELECT count(*)::int FROM u WHERE em_yes) email_yes,
      (SELECT count(*)::int FROM u WHERE EXISTS (SELECT 1 FROM mk_profiles p WHERE p.email=u.email)) already_in_buzzin,
      (SELECT count(*)::int FROM u WHERE NOT EXISTS (SELECT 1 FROM mk_profiles p WHERE p.email=u.email)) new_people,
      (SELECT count(*)::int FROM u JOIN mk_profiles p ON p.email=u.email WHERE u.em_yes AND p.email_consent IN ('unsubscribed','stopped')) yes_but_unsubscribed_in_buzzin`)).rows[0];
  return { files, ...r };
}

async function runImport(progress, who) {
  const total = (await db(`SELECT count(*)::int n FROM mk_import_rows WHERE batch='current'`)).rows[0].n;
  if (!total) throw new Error("Nothing uploaded yet.");
  let last = 0, done = 0, emailSet = 0, skipped = 0;
  const before = (await db(`SELECT count(*)::int n FROM mk_profiles`)).rows[0].n;
  for (;;) {
    const rows = (await db(`SELECT id, file, row FROM mk_import_rows WHERE batch='current' AND id > $1 ORDER BY id LIMIT 1000`, [last])).rows;
    if (!rows.length) break;
    for (const { id, file, row: r } of rows) {
      last = id; done++;
      const email = MK().normEmail(clean(r["Email"]));
      const phone = MK().normPhone(clean(r["Phone"])) || MK().normPhone(clean(r["Default Address Phone"]));
      if (!email && !phone) { skipped++; continue; }
      const survey = {};
      for (const [h, v] of Object.entries(r)) { const m = h.match(/\(customer\.metafields\.custom\.([a-z0-9_]+)\)/); if (m && clean(v)) { const k = SURVEY[m[1]] || m[1]; survey[k] = survey[k] ? `${survey[k]} / ${clean(v)}` : clean(v); } }
      const tags = clean(r["Tags"]).split(",").map((t) => t.trim()).filter(Boolean);
      const fileKey = String(file || "file").replace(/[^A-Za-z0-9_ .-]/g, "").slice(0, 60) || "file";
      const totals = { orders: Number(clean(r["Total Orders"])) || 0, spent: Number(clean(r["Total Spent"])) || 0 };
      const prof = await MK().upsertProfile("lb", {
        email, phone, first_name: clean(r["First Name"]) || null, last_name: clean(r["Last Name"]) || null,
        city: clean(r["Default Address City"]) || null, region: clean(r["Default Address Province Code"]) || null, country: clean(r["Default Address Country Code"]) || null, zip: clean(r["Default Address Zip"]) || null,
        props: survey,
      }, "shopify_export");
      if (prof) await db(`UPDATE mk_profiles SET
          props = jsonb_set(jsonb_set(props, '{shopify_files}', COALESCE(props->'shopify_files','{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb)),
                  '{shopify_tags}', to_jsonb(ARRAY(SELECT DISTINCT x FROM (SELECT jsonb_array_elements_text(COALESCE(props->'shopify_tags','[]'::jsonb)) x UNION SELECT unnest($4::text[])) t)))
          WHERE id=$1`, [prof.id, fileKey, JSON.stringify(totals), tags]);
      if (!prof) { skipped++; continue; }
      // Email: "yes" fills in someone with no record yet; it never overrides an unsubscribe or a bounce.
      if (clean(r["Accepts Email Marketing"]).toLowerCase() === "yes" && (prof.email_consent || "never") === "never") {
        if (await MK().setConsent(prof, "email", "subscribed", { source: "shopify_export", detail: `Shopify customer export${file ? " · " + file : ""}`, at: new Date("2026-10-20T00:00:00Z") })) emailSet++;
      }
      // The file's SMS column is deliberately not used.
    }
    progress(`${done.toLocaleString()} of ${total.toLocaleString()} rows`);
  }
  // Orders and spend: the sum of each store's export, if higher than what Buzzin already counted.
  await db(`UPDATE mk_profiles p SET orders_count = GREATEST(p.orders_count, t.o), total_spent = GREATEST(p.total_spent, t.s)
            FROM (SELECT id, sum((v->>'orders')::int) o, sum((v->>'spent')::numeric) s FROM mk_profiles, jsonb_each(props->'shopify_files') e(k, v) WHERE props ? 'shopify_files' GROUP BY id) t
            WHERE p.id = t.id`);
  await db(`UPDATE mk_profiles SET store='lb' WHERE store <> 'lb'`);   // one Brusche audience
  const made = (await db(`SELECT count(*)::int n FROM mk_profiles`)).rows[0].n - before;
  const sms = await tagSmsCandidates();
  await MK().recomputeTiers();
  await db(`DELETE FROM mk_import_rows WHERE batch='current'`);
  await core.audit({ kind: "mk-import", detail: `Customer export import: ${done} rows, ${made} new profiles, ${emailSet} email consents filled, ${sms} SMS candidates`, who: who || "staff" }).catch(() => {});
  return `${done} rows · ${made} new profiles · ${emailSet} email consents filled in · ${skipped} skipped (no email or phone) · ${sms} SMS candidates`;
}

/** Email subscribers who can't get texts (and never said no to texts) → candidates for a join-texts email. */
async function tagSmsCandidates() {
  await db(`UPDATE mk_profiles SET props = props - 'sms_candidate' WHERE props ? 'sms_candidate'`);
  await db(`UPDATE mk_profiles SET props = props || '{"sms_candidate":true}'::jsonb WHERE email_consent='subscribed' AND sms_consent NOT IN ('subscribed','unsubscribed','stopped')`);
  const list = await MK().ensureList("lb", "SMS candidates (email subscribers)", { source: "buzzin", ext_id: "sms_candidates", description: "Email subscribers who haven't agreed to texts. Invite them with a join-texts email; don't text them." });
  await db(`DELETE FROM mk_list_members WHERE list_id=$1`, [list.id]);
  await db(`INSERT INTO mk_list_members (list_id, profile_id, source) SELECT $1, id, 'buzzin' FROM mk_profiles WHERE (props->>'sms_candidate')::boolean ON CONFLICT DO NOTHING`, [list.id]);
  return (await db(`SELECT count(*)::int n FROM mk_list_members WHERE list_id=$1`, [list.id])).rows[0].n;
}

async function status() {
  const backups = (await core.setting("mk_backups", null)) || [];
  const counts = (await db(`SELECT count(*)::int profiles, count(*) FILTER (WHERE email_consent='subscribed')::int email_ok, count(*) FILTER (WHERE sms_consent='subscribed')::int sms_ok,
      count(*) FILTER (WHERE (props->>'sms_candidate')::boolean)::int sms_candidates,
      (SELECT count(*)::int FROM mk_profile_merges) merged_away,
      (SELECT count(*)::int FROM pg_indexes WHERE indexname='mk_profiles_email_one') one_per_email FROM mk_profiles`)).rows[0];
  return { job, log: log.slice(-30), backups, counts, merge: await mergePreview(), staged: await importPreview() };
}

function routes(app, { admin, actorOf, fail }) {
  const express = require("express");
  app.get("/api/mk/consolidate", async (req, res) => { if (!admin(req, res)) return; try { res.json(await status()); } catch (e) { fail(res, e); } });
  app.post("/api/mk/consolidate/backup", async (req, res) => { if (!admin(req, res)) return; try { const who = actorOf(req); res.json(run("Backup", async () => { const b = await backup(who); return `${b.profiles} profiles saved as mk_bak_${b.stamp}_*`; })); } catch (e) { fail(res, e); } });
  app.post("/api/mk/consolidate/merge", async (req, res) => {
    if (!admin(req, res)) return;
    try { const who = actorOf(req); const b = ((await core.setting("mk_backups", null)) || [])[0];
      if (!b || Date.now() - new Date(b.at) > 6 * 3600e3) return res.status(400).json({ error: "Take a backup first (within the last 6 hours)." });
      res.json(run("Merge duplicate profiles", () => merge(who))); } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/consolidate/upload", express.text({ type: () => true, limit: "60mb" }), async (req, res) => {
    if (!admin(req, res)) return;
    try { if (job) return res.status(409).json({ error: `"${job.name}" is still running.` }); res.json(await upload(String(req.query.file || "").slice(0, 120), String(req.body || ""), actorOf(req))); } catch (e) { fail(res, e); }
  });
  app.post("/api/mk/consolidate/clear", async (req, res) => { if (!admin(req, res)) return; try { await db(`DELETE FROM mk_import_rows WHERE batch='current'`); note("cleared uploaded files"); res.json({ ok: true }); } catch (e) { fail(res, e); } });
  app.post("/api/mk/consolidate/import", async (req, res) => {
    if (!admin(req, res)) return;
    try { const who = actorOf(req); const one = (await db(`SELECT 1 FROM pg_indexes WHERE indexname='mk_profiles_email_one'`)).rows.length;
      if (!one) return res.status(400).json({ error: "Merge duplicate profiles first, so the import lands on one profile per customer." });
      res.json(run("Import customer files", (p) => runImport(p, who))); } catch (e) { fail(res, e); }
  });
  app.get("/api/mk/consolidate/shared-phones.csv", async (req, res) => {
    if (!admin(req, res)) return;
    try { const rows = await sharedPhones(); const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
      res.setHeader("Content-Disposition", 'attachment; filename="shared-phones-review.csv"');
      res.type("text/csv").send(["phone,profiles,who (email · name · store)", ...rows.map((r) => [r.phone, r.profiles, r.who].map(q).join(","))].join("\n")); } catch (e) { fail(res, e); }
  });
}

async function init() {
  await migrate();
  // A last order with no recognizable size left last_sizes as JSON null, which broke the Size-up segment.
  await db(`UPDATE mk_profiles SET props = props - 'last_sizes' WHERE jsonb_typeof(props->'last_sizes') IS DISTINCT FROM 'array' AND props ? 'last_sizes'`).catch((e) => console.error("last_sizes cleanup:", e.message));
}

module.exports = { parseCsv, init, migrate, routes, resolveId, backup, merge, mergePreview, sharedPhones, tagSmsCandidates, parseCsv, upload, importPreview, runImport };
