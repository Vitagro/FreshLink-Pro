#!/usr/bin/env node
// Dump critical ERP tables to local JSON files (one per table), for backup.
// Read-only against Supabase — used by .github/workflows/backup-data.yml.
// Requires SB_URL and SB_SERVICE_KEY in the environment.

const SB_URL = process.env.SB_URL;
const SB_KEY = process.env.SB_SERVICE_KEY;
const OUT_DIR = process.env.OUT_DIR ?? "./backup-output";

if (!SB_URL || !SB_KEY) {
  console.error("SB_URL and SB_SERVICE_KEY are required");
  process.exit(1);
}

// Discover every exposed ERP table; fail closed if discovery or a critical
// table is unavailable. Optional modules absent from this project are explicit.
const schemaResponse = await fetch(`${SB_URL}/rest/v1/`, {
  headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Accept: "application/openapi+json" },
});
if (!schemaResponse.ok) throw new Error(`Schema discovery failed: ${schemaResponse.status}`);
const schema = await schemaResponse.json();
const TABLES = Object.keys(schema.paths ?? {}).filter(p => /^\/fl_[a-z_]+$/.test(p)).map(p => p.slice(1)).sort();
for (const required of ["fl_users", "fl_clients", "fl_articles", "fl_commandes", "fl_caisse_entries"]) {
  if (!TABLES.includes(required)) throw new Error(`Required table missing: ${required}`);
}

async function fetchTable(table) {
  const rows = [];
  let expected;
  for (let offset = 0; ; ) {
    const res = await fetch(`${SB_URL}/rest/v1/${table}?select=*&order=${table === "fl_ai_usage" ? "day.asc,subject.asc" : "id.asc"}&offset=${offset}&limit=1000`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: "count=exact" },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
    const count = Number(res.headers.get("content-range")?.split("/")[1]);
    if (!Number.isFinite(count)) throw new Error(`${table}: missing row count`);
    if (expected !== undefined && expected !== count) throw new Error(`${table}: changed during backup; retry required`);
    expected = count;
    const page = await res.json();
    if (!Array.isArray(page)) throw new Error(`${table}: invalid response`);
    rows.push(...page);
    offset += page.length;
    if (offset >= expected) break;
    if (!page.length) throw new Error(`${table}: truncated backup`);
  }
  if (rows.length !== expected) throw new Error(`${table}: incomplete backup`);
  return rows;
}

const fs = await import("node:fs/promises");
await fs.mkdir(OUT_DIR, { recursive: true });

const manifest = { createdAt: new Date().toISOString(), tables: {} };
const { createHash } = await import("node:crypto");
let ok = 0, failed = 0, totalRows = 0;
for (const table of TABLES) {
  let data;
  try { data = await fetchTable(table); } catch (e) { console.error(String(e)); failed++; continue; }
  if (data === null) { failed++; continue; }
  const content = JSON.stringify(data);
  await fs.writeFile(`${OUT_DIR}/${table}.json`, content, "utf8");
  manifest.tables[table] = { rows: data.length, sha256: createHash("sha256").update(content).digest("hex") };
  totalRows += Array.isArray(data) ? data.length : 0;
  ok++;
  console.log(`  ${table}: ${Array.isArray(data) ? data.length : "?"} rows`);
}

console.log(`\nDone: ${ok} tables backed up, ${failed} failed, ${totalRows} total rows.`);
if (failed > 0) process.exit(1);

await fs.writeFile(`${OUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 2));
