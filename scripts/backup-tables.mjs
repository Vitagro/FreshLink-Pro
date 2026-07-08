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

// Mirrors WIPE_ALL_TABLES in BOSettings.tsx — every table considered
// important enough to wipe deliberately is important enough to back up.
const TABLES = [
  "fl_users", "fl_clients", "fl_articles", "fl_fournisseurs",
  "fl_commandes", "fl_commandes_web", "fl_bons_livraison", "fl_bons_preparation",
  "fl_retours", "fl_trips", "fl_receptions", "fl_bons_achat", "fl_purchase_orders",
  "fl_depots", "fl_livreurs", "fl_visites", "fl_messages", "fl_notices",
  "fl_transferts_stock", "fl_demandes_achat", "fl_non_achats",
  "fl_site_access", "fl_account_requests", "fl_prospects", "fl_company_contacts",
  "fl_documents", "fl_contrats", "fl_organisations",
  "fl_caisses_vides", "fl_charges", "fl_caisse_entries", "fl_salaries", "fl_actionnaires",
  "fl_invoices", "fl_avoirs", "fl_wallet_transactions", "fl_paiements",
  "fl_feedbacks", "fl_gift_materials", "fl_pa_historique",
  "fl_referrals", "fl_tracking", "fl_promotions", "fl_coupons", "fl_notifications",
  "fl_intel_prix", "fl_conc_pv", "fl_conc_ventes_daily", "fl_finance_mensuel",
  "fl_credits_fournisseurs", "fl_charges_article",
];

async function fetchTable(table) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?select=*`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) {
    console.error(`  ${table}: HTTP ${res.status} — skipped`);
    return null;
  }
  return res.json();
}

const fs = await import("node:fs/promises");
await fs.mkdir(OUT_DIR, { recursive: true });

let ok = 0, failed = 0, totalRows = 0;
for (const table of TABLES) {
  const data = await fetchTable(table);
  if (data === null) { failed++; continue; }
  await fs.writeFile(`${OUT_DIR}/${table}.json`, JSON.stringify(data), "utf8");
  totalRows += Array.isArray(data) ? data.length : 0;
  ok++;
  console.log(`  ${table}: ${Array.isArray(data) ? data.length : "?"} rows`);
}

console.log(`\nDone: ${ok} tables backed up, ${failed} failed, ${totalRows} total rows.`);
if (failed > 0 && ok === 0) process.exit(1);
