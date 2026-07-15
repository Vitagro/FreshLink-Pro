"use client"

import { useState } from "react"
import { type UserRole, ROLE_LABELS, isSuperSuperAdmin } from "@/lib/store"

// ── Permission definitions ─────────────────────────────────────────────────
// Matrice éditable, par rôle. Contrairement à Rôles & Permissions (lecture
// seule, reflète lib/rolePermissions.ts appliqué à la création de compte),
// cet écran permet d'ajuster finement les droits de TOUS les rôles internes
// — y compris super_admin. Seul super_super_admin (Jawad) reste toujours
// autorisé sur tout, filet de sécurité pour ne jamais se bloquer soi-même.

type PermKey =
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

interface PermDef {
  key: PermKey
  label: string
  desc: string
  category: string
}

const PERMISSIONS: PermDef[] = [
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

// ── Matrix: which roles have which permissions ─────────────────────────────

type PermMatrix = Partial<Record<UserRole, Set<PermKey>>>

const FULL = new Set(PERMISSIONS.map(p => p.key))
const cat = (keys: PermKey[]) => new Set(keys)

const DEFAULT_MATRIX: PermMatrix = {
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

// Rôles internes affichés dans la matrice (les rôles externes — client,
// fournisseur, investisseur — n'ont pas de droits BO à configurer ici).
const ROLE_HEADERS: { role: UserRole; label: string; cls: string }[] = [
  { role: "super_admin",         label: "Super Admin",     cls: "bg-violet-100 text-violet-700" },
  { role: "admin",               label: "Admin",           cls: "bg-blue-100 text-blue-700" },
  { role: "resp_commercial",     label: "Resp. Comm.",     cls: "bg-green-100 text-green-700" },
  { role: "team_leader",         label: "Team Leader",     cls: "bg-green-100 text-green-700" },
  { role: "prevendeur",          label: "Prévendeur",      cls: "bg-green-100 text-green-700" },
  { role: "suivi_commande",      label: "Suivi Cmd",       cls: "bg-green-100 text-green-700" },
  { role: "resp_logistique",     label: "Resp. Logist.",   cls: "bg-amber-100 text-amber-700" },
  { role: "dispatcheur",         label: "Dispatcheur",     cls: "bg-amber-100 text-amber-700" },
  { role: "magasinier",          label: "Magasinier",      cls: "bg-amber-100 text-amber-700" },
  { role: "livreur",             label: "Livreur",         cls: "bg-amber-100 text-amber-700" },
  { role: "chef_depot",          label: "Chef Dépôt",      cls: "bg-amber-100 text-amber-700" },
  { role: "qualite",             label: "Qualité",         cls: "bg-amber-100 text-amber-700" },
  { role: "resp_achat",          label: "Resp. Achat",     cls: "bg-orange-100 text-orange-700" },
  { role: "acheteur",            label: "Acheteur",        cls: "bg-orange-100 text-orange-700" },
  { role: "ctrl_achat",          label: "Ctrl Achat",      cls: "bg-orange-100 text-orange-700" },
  { role: "ctrl_prep",           label: "Ctrl Prép.",      cls: "bg-orange-100 text-orange-700" },
  { role: "financier",           label: "Financier",       cls: "bg-rose-100 text-rose-700" },
  { role: "cash_man",            label: "Cash Man",        cls: "bg-rose-100 text-rose-700" },
  { role: "comptable",           label: "Comptable",       cls: "bg-rose-100 text-rose-700" },
  { role: "charge_recouvrement", label: "Recouvrement",    cls: "bg-rose-100 text-rose-700" },
  { role: "rh_manager",          label: "RH Manager",      cls: "bg-pink-100 text-pink-700" },
  { role: "it_admin",            label: "IT Admin",        cls: "bg-slate-100 text-slate-700" },
  { role: "auditeur",            label: "Auditeur",        cls: "bg-slate-100 text-slate-700" },
]

const LS_KEY = "fl_permissions_matrix"

function loadMatrix(): PermMatrix {
  try {
    const raw = localStorage.getItem(LS_KEY)
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

function saveMatrix(m: PermMatrix) {
  const serializable: Record<string, PermKey[]> = {}
  for (const [role, perms] of Object.entries(m)) {
    serializable[role] = [...(perms ?? [])]
  }
  localStorage.setItem(LS_KEY, JSON.stringify(serializable))
}

// ── Component ──────────────────────────────────────────────────────────────

export function hasPermission(role: UserRole, perm: PermKey): boolean {
  const m = loadMatrix()
  return m[role]?.has(perm) ?? false
}

export default function BOPermissionsMatrix() {
  const [matrix, setMatrix] = useState<PermMatrix>(() => {
    if (typeof window !== "undefined") return loadMatrix()
    return DEFAULT_MATRIX
  })
  const [saved, setSaved] = useState(false)
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const isLockedRole = (role: UserRole) => role === "super_super_admin"

  const categories = Array.from(new Set(PERMISSIONS.map(p => p.category)))
  const q = search.trim().toLowerCase()
  const visibleRoles = ROLE_HEADERS.filter(rh =>
    !q || rh.label.toLowerCase().includes(q) || (ROLE_LABELS[rh.role] ?? "").toLowerCase().includes(q))

  const toggle = (role: UserRole, perm: PermKey) => {
    if (isLockedRole(role)) return
    setMatrix(prev => {
      const rolePerms = new Set(prev[role] ?? [])
      if (rolePerms.has(perm)) rolePerms.delete(perm)
      else rolePerms.add(perm)
      return { ...prev, [role]: rolePerms }
    })
  }

  const toggleAll = (role: UserRole, permsInCat: PermKey[]) => {
    if (isLockedRole(role)) return
    setMatrix(prev => {
      const rolePerms = new Set(prev[role] ?? [])
      const allChecked = permsInCat.every(p => rolePerms.has(p))
      if (allChecked) permsInCat.forEach(p => rolePerms.delete(p))
      else permsInCat.forEach(p => rolePerms.add(p))
      return { ...prev, [role]: rolePerms }
    })
  }

  const handleSave = () => {
    saveMatrix(matrix)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleReset = () => {
    if (!window.confirm("Réinitialiser la matrice aux valeurs par défaut ?")) return
    setMatrix(DEFAULT_MATRIX)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Matrice des Permissions
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Définissez précisément qui peut faire quoi dans chaque module — y compris Super Admin.</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Filtrer un rôle…"
            className="px-3 py-2 rounded-lg border border-border text-sm w-48" />
          <button onClick={handleReset} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Réinitialiser
          </button>
          <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Sauvegarder
          </button>
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm font-semibold">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Matrice sauvegardée avec succès.
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 flex-wrap text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-green-500" /> Autorisé</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-slate-200 border border-slate-300" /> Non autorisé</div>
        <div className="flex items-center gap-1.5"><div className="w-4 h-4 rounded bg-violet-200" /> Toujours autorisé (Super Super Admin uniquement)</div>
      </div>

      {/* Matrix by category */}
      {categories.map(category => {
        const permsInCat = PERMISSIONS.filter(p => p.category === category)
        const isExpanded = expandedCat === category || expandedCat === null

        return (
          <div key={category} className="bg-card rounded-2xl border border-border overflow-hidden">
            {/* Category header */}
            <button
              onClick={() => setExpandedCat(expandedCat === category ? null : category)}
              className="w-full flex items-center justify-between px-5 py-3.5 bg-muted/40 border-b border-border hover:bg-muted/60 transition-colors text-left">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-foreground">{category}</span>
                <span className="text-[10px] font-semibold text-muted-foreground px-2 py-0.5 rounded-full bg-muted">{permsInCat.length} permissions</span>
              </div>
              <svg className={`w-4 h-4 text-muted-foreground transition-transform ${expandedCat === null || expandedCat === category ? "" : "rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-5 py-2.5 text-left text-xs font-semibold text-muted-foreground w-56 sticky left-0 bg-card">Permission</th>
                      {visibleRoles.map(rh => (
                        <th key={rh.role} className="px-3 py-2.5 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${rh.cls}`}>{rh.label}</span>
                            {!isLockedRole(rh.role) && (
                              <button
                                onClick={() => toggleAll(rh.role, permsInCat.map(p => p.key))}
                                className="text-[9px] text-muted-foreground hover:text-foreground underline whitespace-nowrap">
                                {permsInCat.every(p => matrix[rh.role]?.has(p.key)) ? "Tout retirer" : "Tout cocher"}
                              </button>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {permsInCat.map(perm => (
                      <tr key={perm.key} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="px-5 py-3 sticky left-0 bg-card">
                          <p className="text-sm font-medium text-foreground">{perm.label}</p>
                          {perm.desc && <p className="text-[10px] text-muted-foreground mt-0.5">{perm.desc}</p>}
                        </td>
                        {visibleRoles.map(rh => {
                          const locked = isLockedRole(rh.role)
                          const checked = matrix[rh.role]?.has(perm.key) ?? false
                          return (
                            <td key={rh.role} className="px-3 py-3 text-center">
                              <button
                                onClick={() => toggle(rh.role, perm.key)}
                                disabled={locked}
                                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center mx-auto transition-all ${
                                  locked
                                    ? "bg-violet-200 border-violet-300 cursor-default"
                                    : checked
                                      ? "bg-green-500 border-green-600 hover:bg-green-600"
                                      : "bg-card border-slate-200 hover:border-slate-400"
                                }`}>
                                {(checked || locked) && (
                                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}

      {/* Note */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <span>
          Seul <strong>Super Super Admin</strong> ({isSuperSuperAdmin({ role: "super_super_admin" }) ? "Jawad" : "compte racine"}) a toujours accès à tout et ne peut pas être restreint —
          filet de sécurité pour ne jamais bloquer l&apos;accès à l&apos;ERP. Tous les autres rôles, y compris <strong>Super Admin</strong>, sont configurables ici.
        </span>
      </div>
    </div>
  )
}
