const admins = new Set(["super_super_admin", "super_admin", "admin"]);
const internal = new Set([
  "resp_commercial",
  "commercial",
  "team_leader",
  "prevendeur",
  "suivi_commande",
  "resp_logistique",
  "dispatcheur",
  "magasinier",
  "livreur",
  "conducteur",
  "preparateur",
  "chef_depot",
  "qualite",
  "resp_achat",
  "acheteur",
  "ctrl_achat",
  "ctrl_prep",
  "financier",
  "cash_man",
  "comptable",
  "charge_recouvrement",
  "rh_manager",
  "it_admin",
  "auditeur",
]);
const finance = new Set(["financier", "comptable", "auditeur"]);
const financial = new Set([
  "fl_caisse_entries",
  "fl_charges",
  "fl_invoices",
  "fl_avoirs",
  "fl_wallet_transactions",
  "fl_paiements",
  "fl_reglements_cv",
  "fl_actionnaires",
]);
const hr = new Set(["fl_salaries", "fl_contrats"]);
const administration = new Set([
  "fl_site_access",
  "fl_account_requests",
  "fl_email_config",
  "fl_fiscal_config",
]);
/** Server-side policy: hiding a menu alone must never grant data access. */
export function canSyncRead(role: string, table: string) {
  if (admins.has(role)) return true;
  if (!internal.has(role)) return false;
  if (administration.has(table)) return false;
  if (hr.has(table)) return role === "rh_manager";
  if (financial.has(table))
    return (
      finance.has(role) ||
      (role === "cash_man" &&
        ["fl_caisse_entries", "fl_reglements_cv"].includes(table)) ||
      (role === "charge_recouvrement" &&
        ["fl_invoices", "fl_paiements", "fl_wallet_transactions"].includes(
          table,
        ))
    );
  return true;
}
export function projectSyncRows(
  role: string,
  table: string,
  rows: { id: string; payload: unknown; updated_at?: string }[],
) {
  if (table === "fl_notices") return rows.filter(row => row.id !== "shop_admin_secret").map(row => {
    if (row.id !== "__loterie_winners") return row;
    const payload = row.payload as Record<string, unknown> | null;
    return { ...row, payload: Object.fromEntries(Object.entries(payload || {}).filter(([key]) => !key.startsWith("_"))) };
  });
  if (table !== "fl_users" || admins.has(role)) return rows;
  // Internal directory: no password hash, phone, email, salary or permission flags.
  return rows.map((row) => {
    const p = (
      row.payload && typeof row.payload === "object" ? row.payload : {}
    ) as Record<string, unknown>;
    return {
      id: row.id,
      updated_at: row.updated_at,
      payload: { id: row.id, name: p.name, role: p.role, actif: p.actif },
    };
  });
}
