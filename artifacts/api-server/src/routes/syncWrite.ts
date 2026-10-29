import { Router } from "express";
import type { Request, Response } from "express";
import { requireDeviceApi } from "../lib/deviceGuard.js";
import { requireAccount } from "../lib/adminAuth.js";
import { canSyncWrite } from "../lib/syncPolicy.js";
import { SB_URL, SB_SERVICE_KEY, sbServiceHeaders } from "../lib/ext/supabaseEnv.js";

// ⚠️ Écriture via fetch brut sur l'API REST PostgREST (PAS @supabase/supabase-js).
// supabase-js crashait dans la Lambda Vercel → 500. Aligné sur les routes /ext/*.

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
  "fl_mobile_tabs_visibility",
  // Manquantes jusqu'ici -> ces tables ne remontaient/redescendaient jamais
  // de Supabase malgre un cote client deja pret (autoSync.ts / db.ts) :
  // 100% locales a l'appareil qui les avait creees, "disparaissant" sur
  // tout autre navigateur/appareil (ex: liste des transporteurs).
  "fl_messages", "fl_visites", "fl_demandes_achat", "fl_non_achats",
  "fl_transferts_stock", "fl_transport_companies",
  // Module Cout Prevendeur/Trajet
  "fl_cp_grilles", "fl_cp_vehicules", "fl_cp_regles_freelance",
  "fl_cp_prevendeurs", "fl_cp_trajets", "fl_business_day_profiles",
  // Meme bug, trouvees par audit des ecrans mobile (Charges Acheteur) et
  // BO (Cout Livraison) : jamais dans aucune des 3 allowlists.
  "fl_charges_client_acheteur", "fl_trip_charges",
]);

router.post("/", requireAccount, async (req: Request, res: Response) => {
  if (requireDeviceApi(req)) {
    res.status(401).json({ ok: false, errors: ["Device non autorisé"] });
    return;
  }
  if (!SB_SERVICE_KEY) {
    res.status(500).json({ ok: false, errors: ["SUPABASE_SERVICE_ROLE_KEY manquante"] });
    return;
  }

  const body = (req.body ?? {}) as {
    table: string;
    upserts?: Array<{ id: string; payload: unknown; updated_at: string }>;
    deletes?: string[];
    clearAll?: boolean;
    preserveId?: string;
    insertOnly?: boolean;
    expectedDeletes?: Record<string, unknown>;
  };

  if (!body.table) {
    res.status(400).json({ ok: false, errors: ["table manquante"] });
    return;
  }
  if (!ALLOWED_TABLES.has(body.table)) {
    res.status(403).json({ ok: false, errors: [`Table non autorisée: ${body.table}`] });
    return;
  }
  if (!canSyncWrite(String(res.locals.account.role), body.table, !!body.clearAll || !!body.deletes?.length)) {
    res.status(403).json({ ok: false, errors: ["Permission insuffisante pour cette opération."] });
    return;
  }

  const base = `${SB_URL}/rest/v1/${body.table}`;
  if (body.table === "fl_notices") {
    const protectedIds = new Set(["shop_admin_secret", "__loterie_winners"]);
    if (body.clearAll || body.upserts?.some(row => protectedIds.has(row.id)) || body.deletes?.some(id => protectedIds.has(id))) {
      res.status(403).json({ ok: false, errors: ["Secrets et participations sont gérés uniquement par leurs services dédiés."] }); return;
    }
  }
  const errors: string[] = [];

  if (body.table === "fl_articles" || body.table === "fl_caisse_entries") {
    const cash = body.table === "fl_caisse_entries";
    const label = cash ? "registre de caisse" : "catalogue";
    if (body.clearAll) {
      res.status(409).json({ ok: false, errors: [`Suppression globale du ${label} désactivée. Utilisez les opérations individuelles après actualisation.`] });
      return;
    }
    try {
      const response = await fetch(`${SB_URL}/rest/v1/rpc/${cash ? "fl_cash_write" : "fl_catalogue_write"}`, {
        method: "POST", headers: sbServiceHeaders(),
        body: JSON.stringify({ p_rows: body.upserts ?? [], p_deletes: (body.deletes ?? []).map(id => ({ id, expectedPayload: body.expectedDeletes?.[id] ?? null })) }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; code?: string } | null;
      if (!response.ok || result?.ok !== true) {
        const conflict = result?.code === "P0001";
        const insufficient = result?.code === "P0002";
        const invalid = result?.code === "22023";
        res.status(conflict || insufficient ? 409 : invalid ? 400 : 503).json({ ok: false, errors: [insufficient
          ? "Solde caisse insuffisant. Le lot entier a été annulé ; actualisez le solde."
          : invalid ? "Écriture invalide : montant strictement positif et type entrée/sortie requis."
          : conflict ? `Le ${label} a été modifié sur un autre appareil. Actualisez avant de refaire votre modification ; aucune ligne de ce lot n'a été enregistrée.`
          : `Sauvegarde du ${label} indisponible. Aucune confirmation de sauvegarde ; réessayez après actualisation.`] });
        return;
      }
      res.json({ ok: true, errors: [] });
    } catch {
      res.status(503).json({ ok: false, errors: [`Sauvegarde du ${label} non confirmée. Réessayez après actualisation.`] });
    }
    return;
  }

  try {
    if (body.clearAll) {
      // Supprime toutes les lignes sauf preserveId (sentinelle si absent → tout).
      const keep = encodeURIComponent(body.preserveId ?? "__never__");
      const r = await fetch(`${base}?id=neq.${keep}`, {
        method: "DELETE",
        headers: sbServiceHeaders({ Prefer: "return=minimal" }),
      });
      if (!r.ok) errors.push(`clearAll: ${r.status} ${(await r.text().catch(() => "")).slice(0, 150)}`);
    }

    if (body.upserts?.length) {
      const r = await fetch(base, {
        method: "POST",
        headers: sbServiceHeaders({ Prefer: body.insertOnly ? "resolution=ignore-duplicates,return=minimal" : "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(body.upserts),
      });
      if (!r.ok) errors.push(`upsert: ${r.status} ${(await r.text().catch(() => "")).slice(0, 150)}`);
    }

    if (body.deletes?.length) {
      const ids = body.deletes.map((d) => encodeURIComponent(d)).join(",");
      const r = await fetch(`${base}?id=in.(${ids})`, {
        method: "DELETE",
        headers: sbServiceHeaders({ Prefer: "return=minimal" }),
      });
      if (!r.ok) errors.push(`delete: ${r.status} ${(await r.text().catch(() => "")).slice(0, 150)}`);
    }

    res.status(errors.length ? 502 : 200).json({ ok: errors.length === 0, errors });
  } catch (e) {
    res.status(500).json({ ok: false, errors: [e instanceof Error ? e.message : String(e)] });
  }
});

export default router;
