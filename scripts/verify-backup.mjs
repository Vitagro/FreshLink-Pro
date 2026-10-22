import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
export async function verifyBackup(directory) {
  const root = resolve(directory),
    manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  if (!manifest.tables || !Object.keys(manifest.tables).length)
    throw Error("Empty backup manifest");
  for (const required of [
    "fl_users",
    "fl_clients",
    "fl_articles",
    "fl_commandes",
    "fl_caisse_entries",
  ])
    if (!manifest.tables[required])
      throw Error("Missing required table: " + required);
  let count = 0;
  for (const [table, expected] of Object.entries(manifest.tables)) {
    if (!/^fl_[a-z_]+$/.test(table)) throw Error("Invalid table name");
    const raw = await readFile(join(root, table + ".json"), "utf8");
    if (createHash("sha256").update(raw).digest("hex") !== expected.sha256)
      throw Error("Checksum mismatch: " + table);
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.length !== expected.rows)
      throw Error("Row count mismatch: " + table);
    const ids = new Set();
    for (const row of rows) {
      if (!row || typeof row !== "object") throw Error("Invalid row: " + table);
      const key =
        table === "fl_ai_usage"
          ? JSON.stringify([row.day, row.subject])
          : row.id;
      if (
        !row ||
        key == null ||
        (table === "fl_ai_usage" && (!row.day || !row.subject)) ||
        ids.has(key)
      )
        throw Error("Missing or duplicate primary key: " + table);
      ids.add(key);
    }
    count += rows.length;
  }
  return {
    tables: Object.keys(manifest.tables).length,
    rows: count,
    integrity: "verified",
    databaseRestore: "not_performed",
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (!process.argv[2])
    throw Error("Usage: node scripts/verify-backup.mjs <backup-directory>");
  console.log(JSON.stringify(await verifyBackup(process.argv[2])));
}
