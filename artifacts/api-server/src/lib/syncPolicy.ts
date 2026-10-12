const admins = new Set(["super_super_admin", "super_admin", "admin"]);
const grants: Record<string, string[]> = {
  financier: ["fl_caisse_entries", "fl_charges", "fl_invoices", "fl_avoirs", "fl_wallet_transactions", "fl_paiements", "fl_reglements_cv"],
  cash_man: ["fl_caisse_entries", "fl_caisses_vides", "fl_reglements_cv"],
  comptable: ["fl_invoices", "fl_avoirs", "fl_paiements"],
  charge_recouvrement: ["fl_paiements", "fl_wallet_transactions"],
  rh_manager: ["fl_salaries", "fl_contrats"],
};
const sensitive = new Set([
  "fl_users", "fl_site_access", "fl_notices", "fl_company", "fl_salaries", "fl_actionnaires",
  "fl_caisse_entries", "fl_charges", "fl_invoices", "fl_avoirs", "fl_wallet_transactions", "fl_paiements",
  "fl_reglements_cv", "fl_contrats", "fl_organisations", "fl_email_config", "fl_fiscal_config",
  "fl_process_config", "fl_workflow_config", "fl_alert_config", "fl_mobile_tabs_visibility",
]);
const internal = new Set(["resp_commercial", "commercial", "team_leader", "prevendeur", "suivi_commande",
  "resp_logistique", "dispatcheur", "magasinier", "livreur", "conducteur", "preparateur", "chef_depot",
  "qualite", "resp_achat", "acheteur", "ctrl_achat", "ctrl_prep", "financier", "cash_man", "comptable",
  "charge_recouvrement", "rh_manager", "it_admin"]);

export function canSyncWrite(role: string, table: string, destructive: boolean): boolean {
  if (admins.has(role)) return true;
  if (destructive || !internal.has(role)) return false;
  if (sensitive.has(table)) return grants[role]?.includes(table) ?? false;
  return true;
}
