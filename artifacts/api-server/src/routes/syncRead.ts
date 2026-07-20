import { Router } from "express";
import type { Request, Response } from "express";
import { requireDeviceApi } from "../lib/deviceGuard.js";
import { SB_URL, SB_SERVICE_KEY } from "../lib/ext/supabaseEnv.js";

// ⚠️ Lecture via fetch brut sur l'API REST PostgREST (PAS @supabase/supabase-js).
// Le client supabase-js crashait dans la Lambda Vercel (FUNCTION_INVOCATION_FAILED
// → 500 non-JSON). Toutes les autres routes /ext/* utilisent déjà fetch brut et
// fonctionnent ; on aligne sync-read/sync-write sur ce modèle.

const router = Router();

const ALLOWED_TABLES = new Set([
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
  "fl_caisses_etrangeres",
  "fl_reglements_cv",
  "fl_group_names",
]);

router.get("/", async (req: Request, res: Response) => {
  if (requireDeviceApi(req)) {
    res.status(401).json({ ok: false, error: "Device non autorisé" });
    return;
  }
  if (!SB_SERVICE_KEY) {
    res.status(500).json({ ok: false, error: "SUPABASE_SERVICE_ROLE_KEY manquante" });
    return;
  }
  const table = req.query["table"] as string | undefined;
  if (!table) {
    res.status(400).json({ ok: false, error: "table param manquante" });
    return;
  }
  if (!ALLOWED_TABLES.has(table)) {
    res.status(403).json({ ok: false, error: `Table non autorisée: ${table}` });
    return;
  }
  // updatedSince est optionnel et n'affecte aucun appelant existant qui ne le
  // passe pas — filtre côté Postgres (updated_at=gte...) plutôt que de tout
  // rapatrier pour filtrer côté client. Ne couvre PAS les suppressions
  // survenues pendant qu'un appareil était hors-ligne (une lecture delta ne
  // peut pas signaler une ligne disparue) : ne pas l'utiliser pour un sync
  // qui doit rester correct face aux deletes sans un mécanisme de
  // tombstone/resync périodique complémentaire.
  const updatedSince = req.query["updatedSince"] as string | undefined;
  try {
    const filter = updatedSince ? `&updated_at=gte.${encodeURIComponent(updatedSince)}` : "";
    const r = await fetch(
      `${SB_URL}/rest/v1/${table}?select=id,payload,updated_at&limit=20000${filter}`,
      { headers: { apikey: SB_SERVICE_KEY, Authorization: `Bearer ${SB_SERVICE_KEY}` } },
    );
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      res.status(502).json({ ok: false, error: `Supabase ${r.status}: ${txt.slice(0, 200)}` });
      return;
    }
    const data = (await r.json()) as { id: string; payload: unknown; updated_at?: string }[];
    res.json({ ok: true, data: Array.isArray(data) ? data : [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Erreur interne" });
  }
});

export default router;
