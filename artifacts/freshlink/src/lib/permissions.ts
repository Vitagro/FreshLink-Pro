// ══════════════════════════════════════════════════════════════════════════════
// permissions.ts — Matrice de permissions éditable, par rôle (Droits d'accès).
//
// Distincte de rolePermissions.ts (canView* auto-assignés à la création de
// compte, lecture seule dans l'écran "Rôles & Permissions") : ici, un
// administrateur peut cocher/décocher finement chaque droit pour chaque
// rôle — y compris super_admin — depuis l'écran "Matrice des Permissions"
// (BOPermissionsMatrix.tsx). Seul super_super_admin (Jawad) reste toujours
// autorisé sur tout, en dur, comme filet de sécurité.
//
// hasPermission(role, perm) est LE point d'entrée à utiliser dans les
// composants pour gater une action sensible (bouton, handler...).
// ══════════════════════════════════════════════════════════════════════════════

import type { UserRole } from "@/lib/store"

export type PermKey =
  // Commercial & Commandes
  | "voir_commandes" | "creer_commande" | "modifier_commande" | "supprimer_commande"
  | "valider_commande" | "appliquer_remise" | "voir_marge"
  // Clients
  | "voir_clients" | "creer_client" | "modifier_client" | "supprimer_client"
  | "voir_credit_client" | "modifier_plafond_credit"
  // Tarification
  | "voir_tarifs" | "modifier_tarifs_segment" | "modifier_tarifs_secteur"
  | "modifier_tarifs_echelle" | "modifier_tarifs_client_individuel"
  // Échelons Client
  | "creer_echelon" | "modifier_echelon" | "supprimer_echelon" | "configurer_attribution_auto"
  // Équipes & Groupes
  | "creer_equipe" | "voir_toutes_equipes" | "reaffecter_client_equipe"
  // Achats
  | "voir_achats" | "creer_bon_achat" | "modifier_bon_achat" | "valider_achat"
  // Logistique & Livraison
  | "voir_logistique" | "creer_trip" | "valider_trip" | "valider_bl" | "gerer_retour" | "voir_gps"
  // Stock
  | "voir_stock" | "modifier_stock" | "faire_inventaire" | "ajuster_stock"
  // Finance & Cash
  | "voir_cash" | "valider_cash" | "voir_finance" | "voir_pl" | "gerer_recouvrement"
  // RH
  | "voir_rh" | "gerer_salaires" | "gerer_contrats"
  // Portail Client/Fournisseur
  | "approuver_compte_client" | "approuver_compte_fournisseur" | "rejeter_demande_compte" | "creer_compte_manuellement"
  // Gestion Articles
  | "activer_article" | "desactiver_article" | "supprimer_article" | "modifier_article" | "catalogue_toggle"
  // Web integration
  | "voir_api_config" | "modifier_api_config"
  // Users
  | "creer_utilisateur" | "modifier_utilisateur" | "desactiver_utilisateur" | "gerer_droits_acces"
  // Rapports & Export
  | "exporter_donnees" | "voir_rapports_financiers" | "envoyer_rapports"
  // Administration système
  | "voir_base_donnees" | "backup_restore"

export interface PermDef {
  key: PermKey
  label: string
  desc: string
  category: string
}

export const PERMISSIONS: PermDef[] = [
  // Commercial & Commandes
  { key: "voir_commandes",     category: "Commercial & Commandes", label: "Voir les commandes",          desc: "Consulter la liste des commandes" },
  { key: "creer_commande",     category: "Commercial & Commandes", label: "Créer une commande",          desc: "Saisir une nouvelle commande (BO ou mobile)" },
  { key: "modifier_commande",  category: "Commercial & Commandes", label: "Modifier une commande",       desc: "Éditer les lignes/quantités d'une commande existante" },
  { key: "supprimer_commande", category: "Commercial & Commandes", label: "Supprimer une commande",      desc: "Suppression définitive d'une commande" },
  { key: "valider_commande",   category: "Commercial & Commandes", label: "Valider une commande",        desc: "Faire passer une commande au statut validé" },
  { key: "appliquer_remise",   category: "Commercial & Commandes", label: "Appliquer une remise",        desc: "Accorder une remise/promotion sur une commande" },
  { key: "voir_marge",         category: "Commercial & Commandes", label: "Voir la marge",               desc: "Voir le prix d'achat et la marge (réservé encadrement)" },
  // Clients
  { key: "voir_clients",           category: "Clients", label: "Voir les clients",             desc: "Consulter les fiches client" },
  { key: "creer_client",           category: "Clients", label: "Créer un client",              desc: "Ajouter une nouvelle fiche client" },
  { key: "modifier_client",        category: "Clients", label: "Modifier un client",           desc: "Éditer les informations d'un client" },
  { key: "supprimer_client",       category: "Clients", label: "Supprimer un client",          desc: "Suppression définitive d'une fiche client" },
  { key: "voir_credit_client",     category: "Clients", label: "Voir le crédit client",        desc: "Consulter le solde et l'historique de crédit" },
  { key: "modifier_plafond_credit",category: "Clients", label: "Modifier le plafond crédit",   desc: "Ajuster le plafond de crédit autorisé" },
  // Tarification
  { key: "voir_tarifs",                     category: "Tarification", label: "Voir les tarifs",                  desc: "Consulter l'écran Tarifs par Catégorie" },
  { key: "modifier_tarifs_segment",         category: "Tarification", label: "Modifier tarifs par catégorie",    desc: "CHR / Marchand / Particulier" },
  { key: "modifier_tarifs_secteur",         category: "Tarification", label: "Modifier tarifs par secteur",      desc: "" },
  { key: "modifier_tarifs_echelle",         category: "Tarification", label: "Modifier tarifs par échelle",      desc: "VIP / Gold / Titanium / Silver…" },
  { key: "modifier_tarifs_client_individuel",category:"Tarification", label: "Modifier tarifs client individuel",desc: "Override de prix propre à un client" },
  // Échelons Client
  { key: "creer_echelon",               category: "Échelons Client", label: "Créer un échelon",                desc: "Ajouter un nouveau palier de tarification" },
  { key: "modifier_echelon",            category: "Échelons Client", label: "Modifier un échelon",             desc: "Renommer, réordonner, activer/désactiver" },
  { key: "supprimer_echelon",           category: "Échelons Client", label: "Supprimer un échelon",            desc: "Suppression définitive d'un échelon" },
  { key: "configurer_attribution_auto", category: "Échelons Client", label: "Configurer l'attribution auto",   desc: "Seuils tonnage/fréquence/CA" },
  // Équipes & Groupes
  { key: "creer_equipe",             category: "Équipes & Groupes", label: "Créer une équipe",              desc: "Assigner un compte admin comme racine d'équipe" },
  { key: "voir_toutes_equipes",      category: "Équipes & Groupes", label: "Voir toutes les équipes",       desc: "Vision consolidée au-delà de sa propre équipe" },
  { key: "reaffecter_client_equipe", category: "Équipes & Groupes", label: "Réaffecter un client",          desc: "Changer l'équipe propriétaire d'un client" },
  // Achats
  { key: "voir_achats",       category: "Achats", label: "Voir les achats",        desc: "Consulter bons d'achat et fournisseurs" },
  { key: "creer_bon_achat",   category: "Achats", label: "Créer un bon d'achat",   desc: "" },
  { key: "modifier_bon_achat",category: "Achats", label: "Modifier un bon d'achat",desc: "" },
  { key: "valider_achat",     category: "Achats", label: "Valider un achat",       desc: "" },
  // Logistique & Livraison
  { key: "voir_logistique", category: "Logistique & Livraison", label: "Voir la logistique",  desc: "Dispatch, trips, BL" },
  { key: "creer_trip",      category: "Logistique & Livraison", label: "Créer une tournée",   desc: "" },
  { key: "valider_trip",    category: "Logistique & Livraison", label: "Valider une tournée", desc: "" },
  { key: "valider_bl",      category: "Logistique & Livraison", label: "Valider un BL",       desc: "Bon de livraison" },
  { key: "gerer_retour",    category: "Logistique & Livraison", label: "Gérer un retour",     desc: "" },
  { key: "voir_gps",        category: "Logistique & Livraison", label: "Voir le suivi GPS",   desc: "" },
  // Stock
  { key: "voir_stock",      category: "Stock", label: "Voir le stock",       desc: "" },
  { key: "modifier_stock",  category: "Stock", label: "Modifier le stock",   desc: "" },
  { key: "faire_inventaire",category: "Stock", label: "Faire un inventaire", desc: "" },
  { key: "ajuster_stock",   category: "Stock", label: "Ajuster le stock",    desc: "Correction manuelle (perte, casse…)" },
  // Finance & Cash
  { key: "voir_cash",           category: "Finance & Cash", label: "Voir la caisse",         desc: "" },
  { key: "valider_cash",        category: "Finance & Cash", label: "Valider un encaissement",desc: "" },
  { key: "voir_finance",        category: "Finance & Cash", label: "Voir la finance",        desc: "Comptabilité, contrôle de gestion" },
  { key: "voir_pl",             category: "Finance & Cash", label: "Voir le P&L",            desc: "Prévisionnels, résultat net" },
  { key: "gerer_recouvrement",  category: "Finance & Cash", label: "Gérer le recouvrement",  desc: "Analyse crédit clients/fournisseurs" },
  // RH
  { key: "voir_rh",         category: "RH", label: "Voir la RH",          desc: "" },
  { key: "gerer_salaires",  category: "RH", label: "Gérer les salaires",  desc: "" },
  { key: "gerer_contrats",  category: "RH", label: "Gérer les contrats",  desc: "" },
  // Portail externe
  { key: "approuver_compte_client",      category: "Portail Client/Fournisseur", label: "Approuver compte Client",      desc: "Valider une demande de compte client et créer le profil" },
  { key: "approuver_compte_fournisseur", category: "Portail Client/Fournisseur", label: "Approuver compte Fournisseur", desc: "Valider une demande de compte fournisseur" },
  { key: "rejeter_demande_compte",       category: "Portail Client/Fournisseur", label: "Rejeter une demande",          desc: "Refuser une demande de création de compte" },
  { key: "creer_compte_manuellement",    category: "Portail Client/Fournisseur", label: "Créer compte manuellement",   desc: "Créer un compte client/fournisseur sans demande externe" },
  // Articles
  { key: "activer_article",   category: "Gestion Articles", label: "Activer un article",             desc: "Remettre en service un article désactivé" },
  { key: "desactiver_article",category: "Gestion Articles", label: "Désactiver un article",          desc: "Désactiver stock + catalogue d'un article" },
  { key: "supprimer_article", category: "Gestion Articles", label: "Supprimer définitivement",       desc: "Suppression irréversible d'un article" },
  { key: "modifier_article",  category: "Gestion Articles", label: "Modifier un article",            desc: "Éditer prix, stock, photos, famille…" },
  { key: "catalogue_toggle",  category: "Gestion Articles", label: "Catalogue portail on/off",       desc: "Afficher/masquer un article sur le portail externe" },
  // Web API
  { key: "voir_api_config",    category: "Intégration Web", label: "Voir configuration API",         desc: "Consulter la clé API et les endpoints" },
  { key: "modifier_api_config",category: "Intégration Web", label: "Modifier configuration API",     desc: "Générer clé, activer/désactiver, gérer origines CORS" },
  // Utilisateurs
  { key: "creer_utilisateur",     category: "Gestion Utilisateurs", label: "Créer un utilisateur",     desc: "Ajouter un nouveau compte utilisateur ERP" },
  { key: "modifier_utilisateur",  category: "Gestion Utilisateurs", label: "Modifier un utilisateur",  desc: "Changer rôle, mot de passe, accès…" },
  { key: "desactiver_utilisateur",category: "Gestion Utilisateurs", label: "Désactiver un utilisateur",desc: "Bloquer l'accès d'un compte" },
  { key: "gerer_droits_acces",    category: "Gestion Utilisateurs", label: "Gérer les droits d'accès", desc: "Modifier cette matrice de permissions elle-même" },
  // Rapports
  { key: "exporter_donnees",       category: "Rapports & Export", label: "Exporter des données",         desc: "CSV/Excel/JSON depuis les écrans BO" },
  { key: "voir_rapports_financiers",category:"Rapports & Export", label: "Voir les rapports financiers", desc: "" },
  { key: "envoyer_rapports",       category: "Rapports & Export", label: "Envoyer des rapports",         desc: "Déclencher un envoi email de rapport" },
  // Administration système
  { key: "voir_base_donnees", category: "Administration Système", label: "Voir la base de données", desc: "Écran Database (export/backup complet)" },
  { key: "backup_restore",    category: "Administration Système", label: "Backup / Restore",        desc: "Sauvegarde et restauration complète" },
]

export type PermMatrix = Partial<Record<UserRole, Set<PermKey>>>

const FULL = new Set(PERMISSIONS.map(p => p.key))
const cat = (keys: PermKey[]) => new Set(keys)

export const DEFAULT_MATRIX: PermMatrix = {
  super_super_admin: FULL,
  super_admin: FULL,
  admin: cat([
    "voir_commandes", "creer_commande", "modifier_commande", "valider_commande", "appliquer_remise",
    "voir_clients", "creer_client", "modifier_client", "voir_credit_client", "modifier_plafond_credit",
    "voir_tarifs", "modifier_tarifs_segment", "modifier_tarifs_secteur", "modifier_tarifs_echelle", "modifier_tarifs_client_individuel",
    "creer_echelon", "modifier_echelon", "supprimer_echelon", "configurer_attribution_auto",
    "creer_equipe", "voir_toutes_equipes", "reaffecter_client_equipe",
    "voir_achats", "creer_bon_achat", "modifier_bon_achat", "valider_achat",
    "voir_logistique", "creer_trip", "valider_trip", "valider_bl", "gerer_retour", "voir_gps",
    "voir_stock", "modifier_stock", "faire_inventaire", "ajuster_stock",
    "voir_cash", "valider_cash", "voir_finance", "voir_pl", "gerer_recouvrement",
    "voir_rh", "gerer_salaires", "gerer_contrats",
    "approuver_compte_client", "approuver_compte_fournisseur", "rejeter_demande_compte", "creer_compte_manuellement",
    "activer_article", "desactiver_article", "supprimer_article", "modifier_article", "catalogue_toggle",
    "voir_api_config", "modifier_api_config",
    "creer_utilisateur", "modifier_utilisateur", "desactiver_utilisateur",
    "exporter_donnees", "voir_rapports_financiers", "envoyer_rapports",
    "voir_base_donnees",
  ]),
  resp_commercial: cat([
    "voir_commandes", "creer_commande", "modifier_commande", "valider_commande", "appliquer_remise",
    "voir_clients", "creer_client", "modifier_client", "voir_credit_client",
    "voir_tarifs", "modifier_tarifs_client_individuel",
    "approuver_compte_client", "rejeter_demande_compte", "creer_compte_manuellement",
    "catalogue_toggle", "modifier_article", "exporter_donnees",
  ]),
  team_leader: cat(["voir_commandes", "creer_commande", "voir_clients", "voir_tarifs"]),
  prevendeur: cat(["voir_commandes", "creer_commande", "voir_clients"]),
  suivi_commande: cat(["voir_commandes", "modifier_commande", "voir_logistique", "voir_clients"]),
  resp_logistique: cat([
    "voir_logistique", "creer_trip", "valider_trip", "valider_bl", "gerer_retour", "voir_gps",
    "voir_stock", "modifier_stock", "faire_inventaire",
    "activer_article", "desactiver_article", "modifier_article", "catalogue_toggle",
    "approuver_compte_fournisseur", "rejeter_demande_compte",
  ]),
  dispatcheur: cat(["voir_logistique", "creer_trip", "voir_gps"]),
  magasinier: cat(["voir_stock", "modifier_stock", "faire_inventaire", "ajuster_stock"]),
  livreur: cat(["voir_logistique", "valider_bl", "gerer_retour"]),
  conducteur: cat(["voir_logistique", "valider_bl", "gerer_retour"]),
  preparateur: cat(["voir_stock", "voir_logistique"]),
  chef_depot: cat(["voir_stock", "modifier_stock", "faire_inventaire", "ajuster_stock", "voir_logistique"]),
  qualite: cat(["voir_stock", "gerer_retour"]),
  resp_achat: cat(["voir_achats", "creer_bon_achat", "modifier_bon_achat", "valider_achat", "voir_stock", "approuver_compte_fournisseur", "rejeter_demande_compte", "modifier_article"]),
  acheteur: cat(["voir_achats", "creer_bon_achat", "approuver_compte_fournisseur", "rejeter_demande_compte", "modifier_article"]),
  ctrl_achat: cat(["voir_achats", "voir_stock"]),
  ctrl_prep: cat(["voir_stock", "voir_logistique"]),
  financier: cat(["voir_cash", "valider_cash", "voir_finance", "voir_pl", "gerer_recouvrement", "voir_rapports_financiers", "exporter_donnees"]),
  cash_man: cat(["voir_cash", "valider_cash"]),
  comptable: cat(["voir_finance", "voir_rapports_financiers", "exporter_donnees"]),
  charge_recouvrement: cat(["voir_credit_client", "gerer_recouvrement", "voir_clients"]),
  rh_manager: cat(["voir_rh", "gerer_salaires", "gerer_contrats"]),
  it_admin: cat(["voir_base_donnees", "voir_api_config", "modifier_api_config", "creer_utilisateur", "modifier_utilisateur", "desactiver_utilisateur"]),
  auditeur: cat(["voir_commandes", "voir_clients", "voir_stock", "voir_finance", "voir_pl", "voir_rapports_financiers", "voir_base_donnees"]),
}

const LS_KEY = "fl_permissions_matrix"

export function loadPermMatrix(): PermMatrix {
  try {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_MATRIX
    const parsed = JSON.parse(raw)
    const result: PermMatrix = {}
    for (const [role, perms] of Object.entries(parsed)) {
      result[role as UserRole] = new Set(perms as PermKey[])
    }
    // Seul super_super_admin (Jawad) est verrouillé en permanence — filet de
    // sécurité pour ne jamais se retrouver bloqué hors de sa propre ERP.
    result["super_super_admin"] = FULL
    return result
  } catch {
    return DEFAULT_MATRIX
  }
}

export function savePermMatrix(m: PermMatrix) {
  const serializable: Record<string, PermKey[]> = {}
  for (const [role, perms] of Object.entries(m)) {
    serializable[role] = [...(perms ?? [])]
  }
  localStorage.setItem(LS_KEY, JSON.stringify(serializable))
}

// ── Point d'entrée à utiliser dans les composants pour gater une action ────
// hasPermission(user.role, "supprimer_client") → true/false.
// super_super_admin passe toujours, quel que soit l'état de la matrice
// sauvegardée (double filet de sécurité en plus de loadPermMatrix()).
export function hasPermission(role: UserRole | undefined | null, perm: PermKey): boolean {
  if (!role) return false
  if (role === "super_super_admin") return true
  const m = loadPermMatrix()
  return m[role]?.has(perm) ?? false
}
