import { Router } from "express";
import type { Request, Response } from "express";
import { SB_URL, SB_SERVICE_KEY } from "../lib/ext/supabaseEnv.js";

// Diagnostic panel (BOSettings → Connectivité Supabase) — the route it called,
// /api/setup-tables, never existed server-side, so the check always fell into
// its catch branch and showed "Connexion échouée" regardless of real state.
// Same table list as syncRead/syncWrite's ALLOWED_TABLES (the tables the app
// actually depends on).

const router = Router();

const EXPECTED_TABLES = [
  "fl_users", "fl_clients", "fl_articles", "fl_fournisseurs",
  "fl_commandes", "fl_commandes_web", "fl_bons_livraison",
  "fl_bons_preparation", "fl_retours", "fl_trips",
  "fl_site_access", "fl_account_requests", "fl_prospects",
  "fl_company", "fl_company_contacts", "fl_depots", "fl_documents",
  "fl_bons_achat", "fl_purchase_orders", "fl_receptions",
  "fl_caisses_vides", "fl_charges", "fl_caisse_entries",
  "fl_loyalty_config", "fl_loyalty_transactions", "fl_primes_nouveaux_clients",
  "fl_salaries", "fl_actionnaires", "fl_livreurs",
  "fl_feedbacks", "fl_gift_materials", "fl_pa_historique",
  "fl_invoices", "fl_avoirs", "fl_wallet_transactions", "fl_paiements",
  "fl_referrals", "fl_referral_config", "fl_tracking",
  "fl_promotions", "fl_coupons", "fl_notifications",
  "fl_contrats", "fl_organisations",
  "fl_process_config", "fl_workflow_config", "fl_alert_config", "fl_email_config", "fl_fiscal_config",
  "fl_intel_prix", "fl_conc_pv", "fl_conc_ventes_daily",
  "fl_notices",
  "fl_reglements_cv",
  "fl_group_names",
  "fl_mobile_tabs_visibility",
];

function projectRef(): string {
  try { return new URL(SB_URL).hostname.split(".")[0] ?? ""; } catch { return ""; }
}

router.get("/", async (_req: Request, res: Response) => {
  if (!SB_SERVICE_KEY) {
    res.json({
      connected: false,
      tables_exist: 0,
      tables_total: EXPECTED_TABLES.length,
      missing: EXPECTED_TABLES,
      ready: false,
      supabase_sql_editor: `https://supabase.com/dashboard/project/${projectRef()}/sql/new`,
    });
    return;
  }

  const missing: string[] = [];
  let connected = false;

  await Promise.all(
    EXPECTED_TABLES.map(async (table) => {
      try {
        const r = await fetch(`${SB_URL}/rest/v1/${table}?select=id&limit=1`, {
          headers: { apikey: SB_SERVICE_KEY, Authorization: `Bearer ${SB_SERVICE_KEY}` },
        });
        if (r.ok) connected = true;
        else missing.push(table);
      } catch {
        missing.push(table);
      }
    }),
  );

  res.json({
    connected,
    tables_exist: EXPECTED_TABLES.length - missing.length,
    tables_total: EXPECTED_TABLES.length,
    missing,
    ready: missing.length === 0,
    supabase_sql_editor: `https://supabase.com/dashboard/project/${projectRef()}/sql/new`,
  });
});

export default router;
