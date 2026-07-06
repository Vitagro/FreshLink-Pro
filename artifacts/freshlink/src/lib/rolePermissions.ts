/**
 * rolePermissions.ts — Automatic permission assignment per role
 *
 * When a user is created or their role changes, call autoAssignPermissions(role)
 * to get the correct canView* flags. This ensures no manual configuration is needed.
 */

import type { UserRole, UserAccessType } from "@/lib/store"

export interface RolePermissions {
  canViewAchat?: boolean
  canViewCommercial?: boolean
  canViewLogistique?: boolean
  canViewStock?: boolean
  canViewCash?: boolean
  canViewFinance?: boolean
  canViewRecap?: boolean
  canViewDatabase?: boolean
  canViewRH?: boolean
  canViewInvestisseur?: boolean
  canViewExternal?: boolean
  canCreateCommandeBO?: boolean
  accessType?: UserAccessType
}

// ── Master permission map ──────────────────────────────────────────────────────
const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {

  // ─── Superadmins ───────────────────────────────────────────────────────────
  super_super_admin: {
    canViewAchat: true, canViewCommercial: true, canViewLogistique: true,
    canViewStock: true, canViewCash: true, canViewFinance: true,
    canViewRecap: true, canViewDatabase: true, canViewRH: true,
    canViewInvestisseur: true, canViewExternal: true, canCreateCommandeBO: true,
    accessType: "both",
  },
  super_admin: {
    canViewAchat: true, canViewCommercial: true, canViewLogistique: true,
    canViewStock: true, canViewCash: true, canViewFinance: true,
    canViewRecap: true, canViewDatabase: true, canViewRH: true,
    canViewExternal: true, canCreateCommandeBO: true,
    accessType: "both",
  },
  admin: {
    canViewAchat: true, canViewCommercial: true, canViewLogistique: true,
    canViewStock: true, canViewCash: true, canViewFinance: true,
    canViewRecap: true, canViewRH: true, canViewExternal: true,
    canCreateCommandeBO: true,
    accessType: "both",
  },

  // ─── Commercial ────────────────────────────────────────────────────────────
  resp_commercial: {
    canViewCommercial: true, canViewRecap: true, canViewExternal: true,
    canCreateCommandeBO: true,
    accessType: "both",
  },
  team_leader: {
    canViewCommercial: true, canViewRecap: true,
    accessType: "mobile",
  },
  prevendeur: {
    canViewCommercial: true,
    accessType: "mobile",
  },
  suivi_commande: {
    canViewCommercial: true, canViewLogistique: true, canViewRecap: true,
    accessType: "backoffice",
  },

  // ─── Achat / Logistique ────────────────────────────────────────────────────
  acheteur: {
    canViewAchat: true,
    accessType: "mobile",
  },
  resp_achat: {
    canViewAchat: true, canViewStock: true, canViewExternal: true,
    accessType: "backoffice",
  },
  ctrl_achat: {
    canViewAchat: true, canViewStock: true,
    accessType: "mobile",
  },
  ctrl_prep: {
    canViewStock: true, canViewLogistique: true,
    accessType: "mobile",
  },
  resp_logistique: {
    canViewLogistique: true, canViewStock: true, canViewRecap: true,
    accessType: "both",
  },
  magasinier: {
    canViewStock: true,
    accessType: "mobile",
  },
  dispatcheur: {
    canViewLogistique: true, canViewStock: true,
    accessType: "mobile",
  },
  livreur: {
    canViewLogistique: true,
    accessType: "mobile",
  },
  chef_depot: {
    canViewStock: true, canViewLogistique: true, canViewRecap: true,
    accessType: "backoffice",
  },

  // ─── Finance / RH ──────────────────────────────────────────────────────────
  cash_man: {
    canViewCash: true,
    accessType: "backoffice",
  },
  financier: {
    canViewFinance: true, canViewCash: true, canViewRecap: true,
    accessType: "backoffice",
  },
  charge_recouvrement: {
    canViewCash: true, canViewCommercial: true,
    accessType: "backoffice",
  },
  rh_manager: {
    canViewRH: true, canViewRecap: true,
    accessType: "backoffice",
  },
  comptable: {
    canViewFinance: true, canViewCash: true, canViewRecap: true,
    accessType: "backoffice",
  },

  // ─── Externes ──────────────────────────────────────────────────────────────
  client: {
    canViewCommercial: true,
    accessType: "mobile",
  },
  // CHR hierarchique: proprietaire = acces complet portail, gerant = commandes/livraison
  client_proprietaire: {
    canViewCommercial: true, canViewFinance: true, canViewRecap: true,
    accessType: "both",
  },
  client_gerant: {
    canViewCommercial: true, canViewLogistique: true,
    accessType: "mobile",
  },
  fournisseur: {
    canViewAchat: true,
    accessType: "mobile",
  },

  // ─── Investisseurs & Audit ─────────────────────────────────────────────────
  investisseur: {
    canViewInvestisseur: true, canViewRecap: true,
    accessType: "backoffice",
  },
  auditeur: {
    canViewAchat: true, canViewCommercial: true, canViewLogistique: true,
    canViewStock: true, canViewFinance: true, canViewRecap: true,
    accessType: "backoffice",
  },

  // ─── Divers ────────────────────────────────────────────────────────────────
  qualite: {
    canViewStock: true, canViewRecap: true,
    accessType: "backoffice",
  },
  it_admin: {
    canViewDatabase: true,
    accessType: "backoffice",
  },
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the permissions that should be assigned when a user has the given role.
 * All missing canView* fields will be set to false (no access).
 */
export function autoAssignPermissions(role: UserRole): RolePermissions {
  const base = ROLE_PERMISSIONS[role] ?? {}

  // Normalize: every canView* field must be explicitly set
  return {
    canViewAchat:         base.canViewAchat         ?? false,
    canViewCommercial:    base.canViewCommercial     ?? false,
    canViewLogistique:    base.canViewLogistique     ?? false,
    canViewStock:         base.canViewStock          ?? false,
    canViewCash:          base.canViewCash           ?? false,
    canViewFinance:       base.canViewFinance        ?? false,
    canViewRecap:         base.canViewRecap          ?? false,
    canViewDatabase:      base.canViewDatabase       ?? false,
    canViewRH:            base.canViewRH             ?? false,
    canViewInvestisseur:  base.canViewInvestisseur   ?? false,
    canViewExternal:      base.canViewExternal       ?? false,
    canCreateCommandeBO:  base.canCreateCommandeBO   ?? false,
    accessType:           base.accessType            ?? "mobile",
  }
}

/**
 * Merges auto-assigned permissions for a list of roles.
 * Any canView* that is true in ANY role will be true in the result.
 */
export function mergeRolePermissions(roles: UserRole[]): RolePermissions {
  const merged: RolePermissions = {}
  for (const role of roles) {
    const perms = autoAssignPermissions(role)
    if (perms.canViewAchat)        merged.canViewAchat        = true
    if (perms.canViewCommercial)   merged.canViewCommercial   = true
    if (perms.canViewLogistique)   merged.canViewLogistique   = true
    if (perms.canViewStock)        merged.canViewStock        = true
    if (perms.canViewCash)         merged.canViewCash         = true
    if (perms.canViewFinance)      merged.canViewFinance      = true
    if (perms.canViewRecap)        merged.canViewRecap        = true
    if (perms.canViewDatabase)     merged.canViewDatabase     = true
    if (perms.canViewRH)           merged.canViewRH           = true
    if (perms.canViewInvestisseur) merged.canViewInvestisseur = true
    if (perms.canViewExternal)     merged.canViewExternal     = true
    if (perms.canCreateCommandeBO) merged.canCreateCommandeBO = true
  }
  // accessType: "both" > "backoffice" > "mobile"
  const hasBO     = roles.some(r => ["backoffice", "both"].includes(autoAssignPermissions(r).accessType ?? ""))
  const hasMobile = roles.some(r => ["mobile",     "both"].includes(autoAssignPermissions(r).accessType ?? ""))
  if (hasBO && hasMobile) merged.accessType = "both"
  else if (hasBO)         merged.accessType = "backoffice"
  else                    merged.accessType = "mobile"
  return merged
}

/**
 * Returns a human-readable label for a role.
 */
export const ROLE_LABELS_FR: Record<UserRole, string> = {
  super_super_admin:   "Super Super Admin",
  super_admin:         "Super Admin",
  admin:               "Administrateur",
  resp_commercial:     "Responsable Commercial",
  team_leader:         "Team Leader",
  prevendeur:          "Prévendeur",
  suivi_commande:      "Suivi Commande",
  acheteur:            "Acheteur",
  resp_achat:          "Responsable Achat",
  ctrl_achat:          "Contrôle Achat",
  ctrl_prep:           "Contrôle Préparation",
  resp_logistique:     "Responsable Logistique",
  magasinier:          "Magasinier",
  dispatcheur:         "Dispatcheur",
  livreur:             "Livreur",
  chef_depot:          "Chef de Dépôt",
  cash_man:            "Cash Manager",
  financier:           "Financier",
  charge_recouvrement: "Chargé Recouvrement",
  rh_manager:          "RH Manager",
  comptable:           "Comptable",
  client:              "Client",
  client_proprietaire: "Propriétaire CHR",
  client_gerant:       "Gérant CHR",
  fournisseur:         "Fournisseur",
  investisseur:        "Investisseur",
  auditeur:            "Auditeur",
  qualite:             "Qualité",
  it_admin:            "IT Admin",
}
