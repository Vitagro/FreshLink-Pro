"use client"

import { useState, useEffect, useRef } from "react"
import { store, type User, type UserRole, type UserAccessType, type GranularPermissions, type Civilite, ROLE_LABELS, ROLE_COLORS, JAWAD_ID, FAMILLES_ARTICLES, getAllSecteurs, effectiveGroupId } from "@/lib/store"
import { autoAssignPermissions } from "@/lib/rolePermissions"
import { sendEmail } from "@/lib/email"

// ──────────────────────────────────────────────────────────────────────────────
// GRANULAR RBAC — Ultra-detailed permissions (each action = independent toggle)
// No auto-selection, no grouping — complete individual control
// ──────────────────────────────────────────────────────────────────────────────
interface GranularPermDef {
  key: keyof GranularPermissions
  label: string
  labelAr: string
  group: string
  description?: string
}

const GRANULAR_PERM_DEFS: GranularPermDef[] = [
  // Commercial
  { key: "perm_view_commercial",    group: "Commercial", label: "Voir module Commercial",      labelAr: "رؤية التجاري",              description: "Acces a la liste des commandes en back-office" },
  { key: "perm_create_order",       group: "Commercial", label: "Creer une commande",          labelAr: "إنشاء طلبية",               description: "Saisir une nouvelle commande depuis le BO" },
  { key: "perm_edit_order",         group: "Commercial", label: "Modifier une commande",       labelAr: "تعديل طلبية",               description: "Editer une commande existante (produits, quantites)" },
  { key: "perm_delete_order",       group: "Commercial", label: "Supprimer une commande",      labelAr: "حذف طلبية",                 description: "Supprimer definitivement une commande" },
  { key: "perm_view_clients",       group: "Commercial", label: "Voir les clients",            labelAr: "رؤية الزبائن",              description: "Acceder a la fiche client et ses contrats" },
  { key: "perm_create_client",      group: "Commercial", label: "Creer un client",             labelAr: "إضافة زبون",                description: "Ajouter un nouveau client dans le systeme" },
  { key: "perm_edit_client",        group: "Commercial", label: "Modifier un client",          labelAr: "تعديل زبون",                description: "Editer les informations d'un client existant" },
  { key: "perm_delete_client",      group: "Commercial", label: "Supprimer un client",         labelAr: "حذف زبون",                  description: "Supprimer un client (irreversible)" },
  { key: "perm_view_price",         group: "Commercial", label: "Voir les prix de vente",      labelAr: "رؤية الأسعار",              description: "Voir le prix de vente sur les produits" },
  { key: "perm_edit_price",         group: "Commercial", label: "Modifier les prix de vente",  labelAr: "تعديل الأسعار",             description: "Changer le PV sur une commande (champ debloque)" },
  { key: "perm_apply_discount",     group: "Commercial", label: "Accorder des remises",        labelAr: "منح تخفيضات",               description: "Appliquer une reduction sur une commande client" },
  { key: "perm_view_margin",        group: "Commercial", label: "Voir les marges / PA",        labelAr: "رؤية هامش الربح",           description: "Acces au prix d'achat et a la marge brute" },
  // Achat
  { key: "perm_view_achat",         group: "Achat",      label: "Voir module Achat",           labelAr: "رؤية المشتريات",            description: "Acces a la liste des bons d'achat" },
  { key: "perm_create_bon_achat",   group: "Achat",      label: "Creer un bon d'achat",        labelAr: "إنشاء وصل شراء",            description: "Saisir un bon achat depuis le mobile ou BO" },
  { key: "perm_edit_bon_achat",     group: "Achat",      label: "Modifier un bon d'achat",     labelAr: "تعديل وصل شراء",            description: "Editer un bon achat existant" },
  { key: "perm_validate_achat",     group: "Achat",      label: "Valider un achat",            labelAr: "التحقق من الشراء",           description: "Approuver / valider un bon achat ou une reception" },
  // Logistique
  { key: "perm_view_logistique",    group: "Logistique", label: "Voir module Logistique",      labelAr: "رؤية اللوجستيك",            description: "Acces au dispatch, trips, livraisons" },
  { key: "perm_create_trip",        group: "Logistique", label: "Creer une tournee (Trip)",    labelAr: "إنشاء جولة",                description: "Planifier et assigner une tournee de livraison" },
  { key: "perm_validate_trip",      group: "Logistique", label: "Valider une tournee",         labelAr: "التحقق من الجولة",           description: "Confirmer le depart et l'arrivee d'une tournee" },
  { key: "perm_view_livraison",     group: "Logistique", label: "Voir les bons de livraison",  labelAr: "رؤية وصولات التسليم",        description: "Consulter l'historique des BL" },
  { key: "perm_validate_bl",        group: "Logistique", label: "Valider un BL",               labelAr: "التحقق من وصل التسليم",      description: "Signer / confirmer un bon de livraison" },
  { key: "perm_manage_retour",      group: "Logistique", label: "Gerer les retours",           labelAr: "إدارة المرتجعات",            description: "Saisir et valider les retours marchandise" },
  // Workflow bypass
  { key: "perm_bypass_market_qc",   group: "Workflow",   label: "Bypass Porte 1 (QC Marche)", labelAr: "تجاوز بوابة 1",             description: "Peut sauter le controle qualite au marche (urgence)" },
  { key: "perm_bypass_loading_qc",  group: "Workflow",   label: "Bypass Porte 2 (Chargement)",labelAr: "تجاوز بوابة 2",             description: "Peut sauter le controle de chargement" },
  // Stock
  { key: "perm_view_stock",         group: "Stock",      label: "Voir le stock",               labelAr: "رؤية المخزون",              description: "Consulter les niveaux de stock en temps reel" },
  { key: "perm_edit_stock",         group: "Stock",      label: "Modifier le stock",           labelAr: "تعديل المخزون",             description: "Ajuster manuellement les quantites de stock" },
  { key: "perm_do_inventaire",      group: "Stock",      label: "Faire un inventaire",         labelAr: "جرد المخزون",               description: "Saisir et valider un inventaire physique" },
  // Finance
  { key: "perm_view_cash",          group: "Finance",    label: "Voir Cash & BL",              labelAr: "رؤية الصندوق",              description: "Acces aux encaissements et bons de livraison" },
  { key: "perm_validate_cash",      group: "Finance",    label: "Valider les encaissements",   labelAr: "التحقق من المبالغ",          description: "Confirmer la reception des fonds du livreur" },
  { key: "perm_view_finance",       group: "Finance",    label: "Voir la Finance",             labelAr: "رؤية المالية",              description: "Acces aux charges, actionnaires, distribution benefices" },
  { key: "perm_view_recap",         group: "Finance",    label: "Voir les recaps & KPI",       labelAr: "رؤية ملخصات الأداء",         description: "Acces aux tableaux de bord et syntheses journalieres" },
  // Administration
  { key: "perm_view_database",      group: "Admin",      label: "Voir la base de donnees",     labelAr: "رؤية قاعدة البيانات",        description: "Acces au module admin / database" },
  { key: "perm_manage_users",       group: "Admin",      label: "Gerer les utilisateurs",      labelAr: "إدارة المستخدمين",           description: "Creer, modifier, supprimer des comptes utilisateur" },
  { key: "perm_manage_workflow",    group: "Admin",      label: "Gerer le workflow BPM",       labelAr: "إدارة سير العمل",            description: "Configurer les etapes du processus logistique" },
  { key: "perm_view_rh",            group: "Admin",      label: "Voir RH & Comptabilite RH",   labelAr: "رؤية الموارد البشرية",       description: "Acces aux modules RH, salaires, productivite" },
]

const GRANULAR_GROUPS = [...new Set(GRANULAR_PERM_DEFS.map(p => p.group))]

// ── Role permission templates — quick-apply presets ────────────────────────
interface RoleTemplate {
  id: string
  label: string
  labelAr: string
  color: string
  icon: string
  description: string
  perms: Partial<GranularPermissions>
}

const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: "prevendeur",
    label: "Prévendeur",
    labelAr: "البائع المتجول",
    color: "bg-green-100 border-green-300 text-green-800",
    icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    description: "Prise de commande terrain, accès clients et prix de vente",
    perms: {
      perm_view_commercial: true, perm_create_order: true,
      perm_view_clients: true, perm_create_client: true, perm_view_price: true,
    },
  },
  {
    id: "commercial",
    label: "Commercial",
    labelAr: "المندوب التجاري",
    color: "bg-blue-100 border-blue-300 text-blue-800",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
    description: "Commercial terrain + modification prix + remises",
    perms: {
      perm_view_commercial: true, perm_create_order: true, perm_edit_order: true,
      perm_view_clients: true, perm_create_client: true, perm_edit_client: true,
      perm_view_price: true, perm_apply_discount: true,
    },
  },
  {
    id: "resp_commercial",
    label: "Responsable Commercial",
    labelAr: "مسؤول تجاري",
    color: "bg-violet-100 border-violet-300 text-violet-800",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
    description: "Accès complet commercial + marges + suppression",
    perms: {
      perm_view_commercial: true, perm_create_order: true, perm_edit_order: true, perm_delete_order: true,
      perm_view_clients: true, perm_create_client: true, perm_edit_client: true, perm_delete_client: true,
      perm_view_price: true, perm_edit_price: true, perm_apply_discount: true, perm_view_margin: true,
    },
  },
  {
    id: "acheteur",
    label: "Acheteur",
    labelAr: "المشتري",
    color: "bg-amber-100 border-amber-300 text-amber-800",
    icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
    description: "Bons d'achat, réception marchandise et stock",
    perms: {
      perm_view_achat: true, perm_create_bon_achat: true, perm_edit_bon_achat: true, perm_validate_achat: true,
      perm_view_stock: true,
    },
  },
  {
    id: "logisticien",
    label: "Logisticien",
    labelAr: "مسؤول اللوجستيك",
    color: "bg-cyan-100 border-cyan-300 text-cyan-800",
    icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
    description: "Dispatch tournées, livraisons, retours et stock",
    perms: {
      perm_view_logistique: true, perm_create_trip: true, perm_validate_trip: true,
      perm_view_livraison: true, perm_validate_bl: true, perm_manage_retour: true,
      perm_view_stock: true,
    },
  },
  {
    id: "magasinier",
    label: "Magasinier",
    labelAr: "أمين المستودع",
    color: "bg-orange-100 border-orange-300 text-orange-800",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    description: "Stock, inventaire et réception marchandise",
    perms: {
      perm_view_stock: true, perm_edit_stock: true, perm_do_inventaire: true,
      perm_view_logistique: true, perm_view_achat: true,
    },
  },
  {
    id: "cash_man",
    label: "Cash Man",
    labelAr: "أمين الصندوق",
    color: "bg-emerald-100 border-emerald-300 text-emerald-800",
    icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
    description: "Encaissements, validation cash et bons de livraison",
    perms: {
      perm_view_cash: true, perm_validate_cash: true, perm_view_livraison: true,
    },
  },
  {
    id: "financier",
    label: "Financier",
    labelAr: "المسؤول المالي",
    color: "bg-rose-100 border-rose-300 text-rose-800",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 11v-1m0-8h.01M20 12a8 8 0 11-16 0 8 8 0 0116 0z",
    description: "Finance, caisse, récap & KPI et marges",
    perms: {
      perm_view_cash: true, perm_validate_cash: true,
      perm_view_finance: true, perm_view_recap: true, perm_view_margin: true,
    },
  },
  {
    id: "manager",
    label: "Manager (Accès Large)",
    labelAr: "المدير العام",
    color: "bg-slate-100 border-slate-400 text-slate-800",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    description: "Accès complet sauf admin — idéal pour les directeurs",
    perms: {
      perm_view_commercial: true, perm_create_order: true, perm_edit_order: true,
      perm_view_clients: true, perm_create_client: true, perm_edit_client: true,
      perm_view_price: true, perm_edit_price: true, perm_apply_discount: true, perm_view_margin: true,
      perm_view_achat: true, perm_create_bon_achat: true, perm_validate_achat: true,
      perm_view_logistique: true, perm_create_trip: true, perm_validate_trip: true,
      perm_view_livraison: true, perm_validate_bl: true, perm_manage_retour: true,
      perm_view_stock: true, perm_edit_stock: true,
      perm_view_cash: true, perm_validate_cash: true,
      perm_view_finance: true, perm_view_recap: true,
      perm_view_rh: true,
    },
  },
]

const GROUP_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  Commercial: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", dot: "bg-emerald-500" },
  Achat:      { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-800",   dot: "bg-amber-500"   },
  Logistique: { bg: "bg-cyan-50",    border: "border-cyan-200",    text: "text-cyan-800",    dot: "bg-cyan-500"    },
  Workflow:   { bg: "bg-orange-50",  border: "border-orange-200",  text: "text-orange-800",  dot: "bg-orange-500"  },
  Stock:      { bg: "bg-blue-50",    border: "border-blue-200",    text: "text-blue-800",    dot: "bg-blue-500"    },
  Finance:    { bg: "bg-violet-50",  border: "border-violet-200",  text: "text-violet-800",  dot: "bg-violet-500"  },
  Admin:      { bg: "bg-rose-50",    border: "border-rose-200",    text: "text-rose-800",    dot: "bg-rose-500"    },
}

interface GranularRBACProps {
  userId: string
  userName: string
}

function GranularRBACPanel({ userId, userName }: GranularRBACProps) {
  const [perms, setPerms] = useState<GranularPermissions>(() => store.getGranularPerms(userId))
  const [saved, setSaved] = useState(false)
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(GRANULAR_GROUPS.map(g => [g, true]))
  )

  const handleToggle = (key: keyof GranularPermissions) => {
    setPerms(prev => ({ ...prev, [key]: !prev[key] }))
    setAppliedTemplate(null)
  }

  const handleGroupToggle = (group: string, on: boolean) => {
    const groupKeys = GRANULAR_PERM_DEFS.filter(p => p.group === group).map(p => p.key)
    const update: Partial<GranularPermissions> = {}
    groupKeys.forEach(k => { update[k] = on })
    setPerms(prev => ({ ...prev, ...update }))
    setAppliedTemplate(null)
  }

  const handleApplyTemplate = (tpl: RoleTemplate) => {
    // Reset all then apply template perms
    const reset: GranularPermissions = Object.fromEntries(
      GRANULAR_PERM_DEFS.map(p => [p.key, false])
    ) as GranularPermissions
    setPerms({ ...reset, ...tpl.perms })
    setAppliedTemplate(tpl.id)
  }

  const handleSave = () => {
    store.saveGranularPerms(userId, perms)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const totalActive = GRANULAR_PERM_DEFS.filter(p => perms[p.key]).length

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-slate-900 text-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-sm">Permissions ultra-granulaires — {userName}</p>
            <p className="text-xs text-white/60">{totalActive} / {GRANULAR_PERM_DEFS.length} permissions actives — chaque action est independante</p>
          </div>
        </div>
        <button onClick={handleSave}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${saved ? "bg-emerald-500 text-white" : "bg-white text-slate-900 hover:bg-slate-100"}`}>
          {saved ? "Sauvegarde !" : "Sauvegarder"}
        </button>
      </div>

      {/* ── Role Templates — Quick Preset Apply ── */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/60 overflow-hidden">
        <div className="px-4 py-3 bg-blue-600 flex items-center gap-3">
          <svg className="w-4 h-4 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
          </svg>
          <div>
            <p className="font-bold text-sm text-white">Modèles de rôle / قوالب الأدوار</p>
            <p className="text-xs text-blue-100">Cliquez pour pré-appliquer les permissions typiques d&apos;un poste. Vous pouvez ensuite personnaliser manuellement.</p>
          </div>
        </div>
        <div className="p-3 flex flex-wrap gap-2">
          {ROLE_TEMPLATES.map(tpl => {
            const isApplied = appliedTemplate === tpl.id
            return (
              <button key={tpl.id} type="button"
                onClick={() => handleApplyTemplate(tpl)}
                title={tpl.description}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-all hover:opacity-90 ${isApplied ? "ring-2 ring-blue-400 shadow-md scale-[1.02]" : ""} ${tpl.color}`}>
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tpl.icon} />
                </svg>
                <span>{tpl.label}</span>
                {isApplied && <span className="ml-1">✓</span>}
              </button>
            )
          })}
          <button type="button"
            onClick={() => {
              const reset = Object.fromEntries(GRANULAR_PERM_DEFS.map(p => [p.key, false])) as GranularPermissions
              setPerms(reset)
              setAppliedTemplate(null)
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            Tout effacer
          </button>
        </div>
        {appliedTemplate && (
          <div className="px-4 pb-3">
            <p className="text-[11px] text-blue-700 font-semibold">
              ✓ Modèle &quot;{ROLE_TEMPLATES.find(t => t.id === appliedTemplate)?.label}&quot; appliqué — {Object.values(perms).filter(Boolean).length} permissions actives. Personnalisez ci-dessous puis cliquez Sauvegarder.
            </p>
          </div>
        )}
      </div>


      {/* Groups */}
      {GRANULAR_GROUPS.map(group => {
        const groupPerms = GRANULAR_PERM_DEFS.filter(p => p.group === group)
        const activeCount = groupPerms.filter(p => perms[p.key]).length
        const allOn = activeCount === groupPerms.length
        const colors = GROUP_COLORS[group] ?? GROUP_COLORS.Admin
        const isExpanded = expandedGroups[group] ?? true

        return (
          <div key={group} className={`rounded-2xl border overflow-hidden ${colors.border}`}>
            {/* Group header */}
            <button
              type="button"
              onClick={() => setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }))}
              className={`w-full flex items-center justify-between px-4 py-3 ${colors.bg} hover:opacity-90 transition-opacity`}>
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                <span className={`font-bold text-sm ${colors.text}`}>{group}</span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${allOn ? colors.bg : "bg-white/60"} ${colors.text} border ${colors.border}`}>
                  {activeCount}/{groupPerms.length} actif
                </span>
              </div>
              <div className="flex items-center gap-3">
                {/* Group master controls */}
                <button type="button"
                  onClick={e => { e.stopPropagation(); handleGroupToggle(group, true) }}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/80 text-slate-700 hover:bg-white border border-slate-200">
                  Tout activer
                </button>
                <button type="button"
                  onClick={e => { e.stopPropagation(); handleGroupToggle(group, false) }}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white/80 text-slate-700 hover:bg-white border border-slate-200">
                  Tout desactiver
                </button>
                <svg className={`w-4 h-4 ${colors.text} transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Individual permissions — NEVER auto-toggled */}
            {isExpanded && (
              <div className="divide-y divide-border bg-background">
                {groupPerms.map(perm => {
                  const isOn = !!perms[perm.key]
                  return (
                    <div key={perm.key} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                      {/* Independent toggle — NO side effects */}
                      <button type="button"
                        onClick={() => handleToggle(perm.key)}
                        aria-label={`${isOn ? "Desactiver" : "Activer"} — ${perm.label}`}
                        className={`relative w-10 h-6 rounded-full shrink-0 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 ${isOn ? "bg-emerald-500" : "bg-slate-200"}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${isOn ? "left-5" : "left-1"}`} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${isOn ? "text-slate-900" : "text-slate-500"}`}>{perm.label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{perm.description}</p>
                        <p className="text-[10px] text-slate-400" dir="rtl">{perm.labelAr}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0 ${isOn ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-400 border border-slate-200"}`}>
                        {isOn ? "ACTIF" : "INACTIF"}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function generatePassword(len = 10): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#"
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

const ALL_ROLES: UserRole[] = [
  "super_super_admin","super_admin","admin","resp_commercial","team_leader",
  "cash_man","financier","comptable",
  "rh_manager",
  "prevendeur","resp_logistique","magasinier","dispatcheur","livreur",
  "acheteur","ctrl_achat","ctrl_prep",
  "client","fournisseur",
  "investisseur","qualite","it_admin","auditeur",
  "chef_depot","resp_achat","suivi_commande","charge_recouvrement"
]

// User grade display categories for the list
const USER_GRADE_CATEGORIES = [
  { id: "direction", label: "🏆 Direction & Admin", labelAr: "الإدارة", roles: ["super_super_admin", "super_admin", "admin"] },
  { id: "directeurs", label: "👔 Directeurs & Managers", labelAr: "المديرون", roles: ["resp_commercial", "team_leader", "resp_logistique", "resp_achat"] },
  { id: "finance", label: "💰 Finance & Comptabilité", labelAr: "المالية", roles: ["financier", "cash_man", "comptable", "charge_recouvrement"] },
  { id: "rh", label: "👥 RH & Administration", labelAr: "الموارد البشرية", roles: ["rh_manager", "auditeur", "it_admin"] },
  { id: "qualite", label: "✅ Qualité", labelAr: "الجودة", roles: ["qualite", "chef_depot"] },
  { id: "terrain", label: "🚛 Terrain & Opérations", labelAr: "الميدان", roles: ["prevendeur", "magasinier", "dispatcheur", "livreur", "acheteur", "ctrl_achat", "ctrl_prep", "suivi_commande"] },
  { id: "investisseurs", label: "📈 Investisseurs", labelAr: "المستثمرون", roles: ["investisseur"] },
  { id: "clients_marche", label: "🏪 Clients — Marchands / CHR", labelAr: "الزبائن التجاريون", roles: ["client"] },
  { id: "fournisseurs_marche", label: "🌿 Fournisseurs — Marché / Ferme", labelAr: "موردو السوق والمزرعة", roles: ["fournisseur"] },
] as const

// Roles grouped by default interface
const ROLE_GROUPS: { label: string; labelAr: string; roles: UserRole[] }[] = [
  {
    label: "Direction / Back-office",
    labelAr: "الإدارة والمكتب",
    roles: ["super_super_admin", "super_admin", "admin", "resp_commercial", "team_leader"],
  },
  {
    label: "Finance & Caisse",
    labelAr: "المالية والصندوق",
    roles: ["financier", "cash_man"],
  },
  {
    label: "RH & Comptabilite",
    labelAr: "الموارد البشرية والمحاسبة",
    roles: ["rh_manager", "comptable"],
  },
  {
    label: "Mobile — Terrain",
    labelAr: "الميدان",
    roles: ["prevendeur", "resp_logistique", "magasinier", "dispatcheur", "livreur"],
  },
  {
    label: "Direction & Accès spéciaux",
    labelAr: "الإدارة والوصول الخاص",
    roles: ["investisseur", "it_admin", "auditeur"],
  },
  {
    label: "Qualité & Opérations",
    labelAr: "الجودة والعمليات",
    roles: ["qualite", "chef_depot", "charge_recouvrement", "suivi_commande", "resp_achat"],
  },
  {
    label: "Achat & Controle",
    labelAr: "الشراء والمراقبة",
    roles: ["acheteur", "ctrl_achat", "ctrl_prep"],
  },
  {
    label: "Externe",
    labelAr: "خارجي",
    roles: ["client", "fournisseur"],
  },
]

// Grouped permissions — all app sections
const PERM_GROUPS_LABELS = [
  {
    group: "🛒 Commercial", items: [
      { key: "canViewCommercial" as keyof User, label: "Commandes & Clients" },
      { key: "canViewCash" as keyof User, label: "Cash & BL" },
      { key: "canViewRecap" as keyof User, label: "Synthèse & Récap" },
      { key: "canCreateCommandeBO" as keyof User, label: "Créer commandes (BO)" },
    ]
  },
  {
    group: "🛍️ Achat & Réception", items: [
      { key: "canViewAchat" as keyof User, label: "Bons d'achat, PO, Fournisseurs" },
    ]
  },
  {
    group: "🚛 Logistique & Stock", items: [
      { key: "canViewLogistique" as keyof User, label: "Dispatch, BL, Trips, Retours" },
      { key: "canViewStock" as keyof User, label: "Stock, Inventaire, DLC" },
    ]
  },
  {
    group: "💰 Finance & RH", items: [
      { key: "canViewFinance" as keyof User, label: "Finance, Caisse, Comptabilité" },
      { key: "canViewRH" as keyof User, label: "RH, Salaires, Paie" },
    ]
  },
  {
    group: "👥 Clients & Portails", items: [
      { key: "canViewExternal" as keyof User, label: "Clients, Fournisseurs, Portails" },
    ]
  },
  {
    group: "⚙️ Administration", items: [
      { key: "canViewDatabase" as keyof User, label: "Base données, Paramètres, Utilisateurs" },
    ]
  },
  {
    group: "🔐 Accès Spéciaux", items: [
      { key: "canViewInvestisseur" as keyof User, label: "Dashboard Investisseur (CONFIDENTIEL — Jawad only)" },
    ]
  },
]

const PERM_LABELS: { key: keyof User; label: string; labelAr: string }[] = [
  { key: "canViewAchat", label: "🛍️ Achats — Bons, PO, Réception, Fournisseurs", labelAr: "المشتريات" },
  { key: "canViewCommercial", label: "🛒 Commercial — Commandes, Clients, Affectation", labelAr: "التجاري" },
  { key: "canViewLogistique", label: "🚛 Logistique — Dispatch, BL, Trips, Retours, GPS", labelAr: "اللوجستيك" },
  { key: "canViewStock", label: "📦 Stock — Inventaire, DLC, Forecast", labelAr: "المخزون" },
  { key: "canViewCash", label: "💵 Cash & BL — Encaissements, Réconciliation", labelAr: "الكاش" },
  { key: "canViewFinance", label: "💰 Finance — Comptabilité, Analyse P&L, CdG", labelAr: "المالية" },
  { key: "canViewRecap", label: "📊 Récap & KPIs — Tableaux de bord, Rapports", labelAr: "الملخص" },
  { key: "canViewDatabase", label: "⚙️ Admin — Paramètres, DB, Utilisateurs, Caméra", labelAr: "قاعدة البيانات" },
  { key: "canViewRH", label: "👥 RH — Salaires, Matricules, Contrats, Paie", labelAr: "الموارد البشرية" },
  { key: "canViewExternal", label: "🌐 Portails — Clients, Fournisseurs, Demandes", labelAr: "الزبائن والموردون" },
  { key: "canCreateCommandeBO", label: "➕ Créer commandes depuis le BO", labelAr: "إنشاء الطلبيات" },
  { key: "canViewInvestisseur", label: "🔐 Dashboard Investisseur (CONFIDENTIEL)", labelAr: "لوحة المستثمر السرية" },
]

// Section groups for permission UI — maps each nav section to its permKey
interface PermSection {
  group: string
  groupAr: string
  color: string
  pages: { label: string; labelAr: string; permKey: keyof User }[]
}

// ── MOBILE sections (what the user can see on the mobile app) ─────────────────
const MOBILE_PERM_SECTIONS: PermSection[] = [
  {
    group: "Commandes & Ventes (Mobile)", groupAr: "الطلبيات والمبيعات",
    color: "emerald",
    pages: [
      { label: "Prise de commande (prevendeur)", labelAr: "الطلبيات", permKey: "canViewCommercial" },
      { label: "Bilan & Objectifs prevendeur",   labelAr: "الأهداف",   permKey: "canViewCommercial" },
    ],
  },
  {
    group: "Achat terrain (Mobile)", groupAr: "الشراء الميداني",
    color: "amber",
    pages: [
      { label: "Bons d'achat (acheteur)",        labelAr: "وصولات الشراء", permKey: "canViewAchat" },
      { label: "Controle achat",                 labelAr: "مراقبة الشراء", permKey: "canViewAchat" },
    ],
  },
  {
    group: "Magasinier & Reception (Mobile)", groupAr: "المستودع والاستلام",
    color: "cyan",
    pages: [
      { label: "Reception marchandise",          labelAr: "الاستلام الميداني", permKey: "canViewAchat" },
      { label: "Validation BL (magasinier)",     labelAr: "التحقق من وصل التسليم", permKey: "canViewLogistique" },
      { label: "Preparation commandes",          labelAr: "تحضير الطلبيات",   permKey: "canViewLogistique" },
      { label: "Controle preparation",           labelAr: "مراقبة التحضير",   permKey: "canViewLogistique" },
    ],
  },
  {
    group: "Livraison terrain (Mobile)", groupAr: "التوصيل الميداني",
    color: "violet",
    pages: [
      { label: "Bons de livraison (livreur)",    labelAr: "وصولات التوصيل",  permKey: "canViewLogistique" },
      { label: "Retours clients",                labelAr: "المرتجعات",        permKey: "canViewLogistique" },
    ],
  },
]

// ── BACK-OFFICE sections (what the user can see in the BO) ────────────────────
const BACKOFFICE_PERM_SECTIONS: PermSection[] = [
  {
    group: "Analyse & KPI", groupAr: "التحليل",
    color: "indigo",
    pages: [
      { label: "Synthese & Recap",               labelAr: "الملخص",            permKey: "canViewRecap" },
      { label: "Finance & Caisse",               labelAr: "المالية",           permKey: "canViewFinance" },
      { label: "Rapport Livraison",              labelAr: "تقرير التوصيل",     permKey: "canViewLogistique" },
    ],
  },
  {
    group: "Achat Back-office", groupAr: "المشتريات",
    color: "amber",
    pages: [
      { label: "Bons d'achat",                   labelAr: "وصولات الشراء",     permKey: "canViewAchat" },
      { label: "Commandes Fournisseurs (PO)",     labelAr: "أوامر الشراء",     permKey: "canViewAchat" },
      { label: "Reception Achat BO",             labelAr: "الاستلام",          permKey: "canViewAchat" },
      { label: "Credit Fournisseur",             labelAr: "ائتمان الموردين",   permKey: "canViewAchat" },
      { label: "Analyse Achat",                  labelAr: "تحليل المشتريات",   permKey: "canViewAchat" },
    ],
  },
  {
    group: "Commercial Back-office", groupAr: "التجاري",
    color: "emerald",
    pages: [
      { label: "Commandes (BO)",                 labelAr: "الطلبيات",          permKey: "canViewCommercial" },
      { label: "Affectation Commerciale",        labelAr: "التوزيع التجاري",   permKey: "canViewCommercial" },
      { label: "Cash & BL",                      labelAr: "النقديات",          permKey: "canViewCash" },
      { label: "Prospection IA",                 labelAr: "الاستهداف الذكي",   permKey: "canViewCommercial" },
      { label: "Creer commandes (BO)",           labelAr: "إنشاء الطلبيات",    permKey: "canCreateCommandeBO" },
    ],
  },
  {
    group: "Logistique Back-office", groupAr: "اللوجستيك",
    color: "cyan",
    pages: [
      { label: "Stock & Inventaire",             labelAr: "المخزون",           permKey: "canViewStock" },
      { label: "Dispatch & Livreurs",            labelAr: "التوزيع",           permKey: "canViewLogistique" },
      { label: "Preparation (BO)",               labelAr: "وصولات التحضير",    permKey: "canViewLogistique" },
      { label: "Retours",                        labelAr: "المرتجعات",         permKey: "canViewLogistique" },
    ],
  },
  {
    group: "Donnees", groupAr: "البيانات",
    color: "violet",
    pages: [
      { label: "Catalogue Produits",             labelAr: "الفواكه والخضر",    permKey: "canViewStock" },
      { label: "Clients & Fournisseurs",         labelAr: "الزبائن والموردون", permKey: "canViewExternal" },
    ],
  },
  {
    group: "RH & Comptabilite", groupAr: "الموارد البشرية",
    color: "violet",
    pages: [
      { label: "Productivite & Salaires (Ourai)", labelAr: "الإنتاجية والرواتب", permKey: "canViewRH" },
      { label: "Comptabilite RH (Azmi)",           labelAr: "محاسبة الموارد",    permKey: "canViewRH" },
    ],
  },
  {
    group: "Administration", groupAr: "الإدارة",
    color: "rose",
    pages: [
      { label: "Utilisateurs & Roles",           labelAr: "المستخدمون",        permKey: "canViewDatabase" },
      { label: "Droits Camera",                  labelAr: "صلاحيات الكاميرا", permKey: "canViewDatabase" },
      { label: "Base de donnees & Parametres",   labelAr: "قاعدة البيانات",    permKey: "canViewDatabase" },
    ],
  },
]

// Combined for "all" view and legacy
const PERM_SECTIONS: PermSection[] = [...MOBILE_PERM_SECTIONS, ...BACKOFFICE_PERM_SECTIONS]

// ─────────────────────────────────────────────────────────────
// DEFAULT PERMISSIONS BY ROLE — auto-applied on role selection
// ─────────────────────────────────────────────────────────────
type PermFlags = {
  canViewAchat?: boolean; canViewCommercial?: boolean; canViewLogistique?: boolean
  canViewStock?: boolean; canViewCash?: boolean; canViewFinance?: boolean
  canViewRecap?: boolean; canViewDatabase?: boolean; canViewRH?: boolean
  canViewExternal?: boolean; canCreateCommandeBO?: boolean
}
const ALL_OFF: PermFlags = {
  canViewAchat: false, canViewCommercial: false, canViewLogistique: false,
  canViewStock: false, canViewCash: false, canViewFinance: false,
  canViewRecap: false, canViewDatabase: false, canViewRH: false,
  canViewExternal: false, canCreateCommandeBO: false,
}
const ALL_ON: PermFlags = {
  canViewAchat: true, canViewCommercial: true, canViewLogistique: true,
  canViewStock: true, canViewCash: true, canViewFinance: true,
  canViewRecap: true, canViewDatabase: true, canViewRH: true,
  canViewExternal: true, canCreateCommandeBO: true,
}
const DEFAULT_PERMS_BY_ROLE: Partial<Record<UserRole, PermFlags>> = {
  super_super_admin: ALL_ON,
  super_admin:       ALL_ON,
  admin:             ALL_ON,
  resp_commercial:   { ...ALL_OFF, canViewCommercial: true, canViewCash: true, canViewRecap: true, canViewExternal: true, canCreateCommandeBO: true },
  team_leader:       { ...ALL_OFF, canViewCommercial: true, canViewCash: true, canViewRecap: true },
  prevendeur:        { ...ALL_OFF, canViewCommercial: true, canViewCash: true },
  livreur:           { ...ALL_OFF, canViewLogistique: true, canViewCash: true },
  magasinier:        { ...ALL_OFF, canViewStock: true, canViewLogistique: true },
  dispatcheur:       { ...ALL_OFF, canViewLogistique: true, canViewStock: true },
  acheteur:          { ...ALL_OFF, canViewAchat: true, canViewStock: true },
  ctrl_achat:        { ...ALL_OFF, canViewAchat: true },
  ctrl_prep:         { ...ALL_OFF, canViewLogistique: true },
  cash_man:          { ...ALL_OFF, canViewCash: true, canViewLogistique: true },
  financier:         { ...ALL_OFF, canViewFinance: true, canViewCash: true, canViewRecap: true },
  comptable:         { ...ALL_OFF, canViewFinance: true, canViewCash: true, canViewRH: true },
  rh_manager:        { ...ALL_OFF, canViewRH: true, canViewRecap: true },
  resp_logistique:   { ...ALL_OFF, canViewLogistique: true, canViewStock: true, canViewRecap: true },
  resp_achat:        { ...ALL_OFF, canViewAchat: true, canViewStock: true, canViewRecap: true },
  auditeur:          { ...ALL_OFF, canViewFinance: true, canViewRecap: true, canViewRH: true },
  qualite:           { ...ALL_OFF, canViewStock: true, canViewLogistique: true },
  it_admin:          { ...ALL_OFF, canViewDatabase: true },
  charge_recouvrement: { ...ALL_OFF, canViewCash: true, canViewFinance: true, canViewExternal: true },
  suivi_commande:    { ...ALL_OFF, canViewCommercial: true, canViewLogistique: true },
  chef_depot:        { ...ALL_OFF, canViewStock: true, canViewLogistique: true },
}

const EMPTY_USER: Omit<User, "id"> = {
  name: "", email: "", password: "1234", role: "prevendeur", accessType: undefined, secteur: "", depotId: undefined,
  phone: "", actif: true, isDemo: false,
  mustChangePassword: true,   // ← forcer changement mot de passe à la première connexion
  canViewAchat: false, canViewCommercial: false, canViewLogistique: false,
  canViewStock: false, canViewCash: false, canViewFinance: false, canViewRecap: false,
  canViewDatabase: false, canViewRH: false, canViewExternal: false, canCreateCommandeBO: false,
  objectifClients: 0, objectifTonnage: 0,
  objectifJournalierCA: 0, objectifHebdomadaireCA: 0, objectifMensuelCA: 0,
  objectifJournalierClients: 0, objectifHebdomadaireClients: 0, objectifMensuelClients: 0,
}

// ─────────────────────────────────────────────────────────────
// PERMISSION_GROUPS — Grouped permission definitions with cascade
// ─────────────────────────────────────────────────────────────

const PERMISSION_GROUPS = [
  {
    id: "commercial",
    label: "Commercial & Ventes",
    labelAr: "التجارة والمبيعات",
    color: "bg-lime-500",
    borderColor: "border-lime-500",
    borderLeftClass: "border-l-lime-500",
    bgLight: "bg-lime-50",
    borderLight: "border-lime-200",
    textColor: "text-lime-800",
    icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2",
    permissions: ["canViewCommercial", "canViewCash", "canCreateCommandeBO"] as (keyof User)[],
    description: "Commandes, BL, prospection, caisse",
    subLabels: {
      canViewCommercial:    { label: "Commandes & Clients",          labelAr: "الطلبيات والزبائن" },
      canViewCash:          { label: "Cash & Bons de livraison",     labelAr: "الكاش ووصولات التسليم" },
      canCreateCommandeBO:  { label: "Créer commandes (Back-office)",labelAr: "إنشاء الطلبيات" },
    } as Record<string, { label: string; labelAr: string }>,
  },
  {
    id: "stock",
    label: "Stock & Logistique",
    labelAr: "المخزون والخدمات اللوجستية",
    color: "bg-sky-500",
    borderColor: "border-sky-500",
    borderLeftClass: "border-l-sky-500",
    bgLight: "bg-sky-50",
    borderLight: "border-sky-200",
    textColor: "text-sky-800",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    permissions: ["canViewStock", "canViewLogistique"] as (keyof User)[],
    description: "Stock, réception, dispatch, livraison",
    subLabels: {
      canViewStock:       { label: "Stock & Inventaire",               labelAr: "المخزون والجرد" },
      canViewLogistique:  { label: "Logistique — Dispatch, Trips, BL", labelAr: "اللوجستيك والتوصيل" },
    } as Record<string, { label: string; labelAr: string }>,
  },
  {
    id: "finance",
    label: "Finance & Comptabilité",
    labelAr: "المالية والمحاسبة",
    color: "bg-emerald-500",
    borderColor: "border-emerald-500",
    borderLeftClass: "border-l-emerald-500",
    bgLight: "bg-emerald-50",
    borderLight: "border-emerald-200",
    textColor: "text-emerald-800",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 11v-1",
    permissions: ["canViewFinance", "canViewRecap"] as (keyof User)[],
    description: "Trésorerie, marges, P&L, synthèse",
    subLabels: {
      canViewFinance: { label: "Finance & Comptabilité", labelAr: "المالية والمحاسبة" },
      canViewRecap:   { label: "Récap & KPIs",           labelAr: "ملخصات الأداء" },
    } as Record<string, { label: string; labelAr: string }>,
  },
  {
    id: "achat",
    label: "Achats & Sourcing",
    labelAr: "المشتريات والتوريد",
    color: "bg-amber-500",
    borderColor: "border-amber-500",
    borderLeftClass: "border-l-amber-500",
    bgLight: "bg-amber-50",
    borderLight: "border-amber-200",
    textColor: "text-amber-800",
    icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17",
    permissions: ["canViewAchat"] as (keyof User)[],
    description: "Bons d'achat, fournisseurs, prix marché",
    subLabels: {
      canViewAchat: { label: "Bons d'achat & Fournisseurs", labelAr: "وصولات الشراء والموردون" },
    } as Record<string, { label: string; labelAr: string }>,
  },
  {
    id: "rh",
    label: "RH & Administration",
    labelAr: "الموارد البشرية",
    color: "bg-violet-500",
    borderColor: "border-violet-500",
    borderLeftClass: "border-l-violet-500",
    bgLight: "bg-violet-50",
    borderLight: "border-violet-200",
    textColor: "text-violet-800",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    permissions: ["canViewRH"] as (keyof User)[],
    description: "Équipe, salaires, congés, matricules",
    subLabels: {
      canViewRH: { label: "RH — Salaires, Matricules, Contrats", labelAr: "الموارد البشرية والرواتب" },
    } as Record<string, { label: string; labelAr: string }>,
  },
  {
    id: "database",
    label: "Base de Données & Config",
    labelAr: "قاعدة البيانات والإعدادات",
    color: "bg-orange-500",
    borderColor: "border-orange-500",
    borderLeftClass: "border-l-orange-500",
    bgLight: "bg-orange-50",
    borderLight: "border-orange-200",
    textColor: "text-orange-800",
    icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582 4-8 4s8 1.79 8 4",
    permissions: ["canViewDatabase"] as (keyof User)[],
    description: "Articles, clients, paramètres système",
    subLabels: {
      canViewDatabase: { label: "Base de données & Paramètres", labelAr: "قاعدة البيانات والإعدادات" },
    } as Record<string, { label: string; labelAr: string }>,
  },
  {
    id: "external",
    label: "Portails Externes",
    labelAr: "البوابات الخارجية",
    color: "bg-indigo-500",
    borderColor: "border-indigo-500",
    borderLeftClass: "border-l-indigo-500",
    bgLight: "bg-indigo-50",
    borderLight: "border-indigo-200",
    textColor: "text-indigo-800",
    icon: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9",
    permissions: ["canViewExternal"] as (keyof User)[],
    description: "Comptes clients, fournisseurs, demandes",
    subLabels: {
      canViewExternal: { label: "Portails — Clients & Fournisseurs", labelAr: "بوابات الزبائن والموردين" },
    } as Record<string, { label: string; labelAr: string }>,
  },
]

// ─────────────────────────────────────────────────────────────
// PermissionsTabs — Grouped permission cards with cascade toggle
// ─────────────────────────────────────────────────────────────

function PermissionsTabs({
  form,
  setForm,
}: {
  form: Omit<User, "id">
  setForm: React.Dispatch<React.SetStateAction<Omit<User, "id">>>
}) {
  // Only super_super_admin (Jawad) is immutable — super_admin can have perms configured
  const isFullAccessRole = form.role === "super_super_admin"
  const isSuperAdminRole = form.role === "super_admin" || form.role === "admin" || form.role === "super_super_admin"

  const handleToggleAll = (on: boolean) => {
    const update: Partial<Omit<User, "id">> = {}
    PERMISSION_GROUPS.forEach(g => g.permissions.forEach(k => { (update as Record<string, unknown>)[k as string] = on }))
    setForm(prev => ({ ...prev, ...update }))
  }

  const handleGroupToggle = (group: typeof PERMISSION_GROUPS[number], on: boolean) => {
    const update: Partial<Omit<User, "id">> = {}
    group.permissions.forEach(k => { (update as Record<string, unknown>)[k as string] = on })
    setForm(prev => ({ ...prev, ...update }))
  }

  const handlePermToggle = (key: keyof User) => {
    setForm(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))
  }

  // BO vs Mobile mapping for each permKey
  const PERM_INTERFACES: Record<string, { bo: string; mobile: string }> = {
    canViewCommercial:   { bo: "Commandes, Clients, Affectation, Prospection", mobile: "Prise commande terrain, Bilan objectifs" },
    canViewCash:         { bo: "Cash & BL, Encaissements, Réconciliation",     mobile: "Validation encaissements livreur" },
    canCreateCommandeBO: { bo: "Créer/modifier commandes depuis le BO",         mobile: "—" },
    canViewStock:        { bo: "Stock, Inventaire, DLC, Forecast",              mobile: "Réception marchandise, Inventaire terrain" },
    canViewLogistique:   { bo: "Dispatch, BL, Trips, Retours, GPS",            mobile: "Livraison terrain, BL, Retours clients" },
    canViewAchat:        { bo: "Bons achat, PO, Fournisseurs, Analyse achat",  mobile: "Bons achat terrain, Contrôle chargement" },
    canViewFinance:      { bo: "Finance, Comptabilité, P&L, CdG",              mobile: "—" },
    canViewRecap:        { bo: "KPIs, Tableaux de bord, Synthèse journalière", mobile: "Rapport livraison" },
    canViewRH:           { bo: "Salaires, Matricules, Contrats, Paie",         mobile: "—" },
    canViewExternal:     { bo: "Clients, Fournisseurs, Demandes comptes",       mobile: "Comptes externes" },
    canViewDatabase:     { bo: "Utilisateurs, Paramètres, Base données",       mobile: "—" },
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Droits d&apos;accès / الصلاحيات</h4>
          <p className="text-[10px] text-muted-foreground mt-0.5">Chaque permission donne accès à des modules précis selon l&apos;interface</p>
        </div>
        {!isFullAccessRole && !isSuperAdminRole && (
          <div className="flex gap-2">
            <button type="button" onClick={() => handleToggleAll(true)}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
              Tout activer
            </button>
            <button type="button" onClick={() => handleToggleAll(false)}
              className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
              Tout désactiver
            </button>
          </div>
        )}
      </div>

      {/* Full access banner — only for super_super_admin (immutable) */}
      {isFullAccessRole ? (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
          <div className="w-9 h-9 rounded-xl bg-amber-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-bold text-amber-800">Super Super Admin — accès root, non configurable</p>
            <p className="text-xs text-amber-600 mt-0.5">Ce rôle possède tous les droits système de façon permanente. Les permissions ne peuvent pas être restreintes.</p>
          </div>
        </div>
      ) : isSuperAdminRole ? (
        /* Super Admin / Admin — show permissions but with info banner */
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-violet-50 border border-violet-200">
            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-violet-800">{form.role === "super_admin" ? "Super Admin" : "Admin"} — configurez les accès par module</p>
              <p className="text-xs text-violet-600 mt-0.5">Cochez les modules accessibles. Les droits s&apos;appliquent à la fois sur le Back-office et le Mobile selon le module.</p>
            </div>
          </div>
          {/* BO vs Mobile info grid */}
          <div className="grid grid-cols-2 gap-2 px-1">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-blue-700 mb-1.5 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                Back-office
              </p>
              <ul className="space-y-0.5 text-[10px] text-blue-800">
                <li>🛒 Commercial → Commandes, Affectation</li>
                <li>💵 Cash → Encaissements, BL</li>
                <li>🛍️ Achats → PO, Fournisseurs</li>
                <li>📦 Stock → Inventaire, DLC</li>
                <li>💰 Finance → P&L, Comptabilité</li>
                <li>📊 Récap → KPIs, Tableaux de bord</li>
                <li>👥 RH → Salaires, Paie</li>
                <li>⚙️ Admin → Utilisateurs, Paramètres</li>
                <li>🌐 Portails → Clients, Fournisseurs</li>
                <li>➕ Créer commandes BO</li>
              </ul>
            </div>
            <div className="rounded-xl border border-green-200 bg-green-50 p-3">
              <p className="text-[10px] font-black uppercase tracking-wide text-green-700 mb-1.5 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                Mobile terrain
              </p>
              <ul className="space-y-0.5 text-[10px] text-green-800">
                <li>🛒 Commercial → Prise commande, Bilan</li>
                <li>💵 Cash → Validation encaissements</li>
                <li>🛍️ Achats → Bons achat terrain</li>
                <li>📦 Stock → Réception, Validation BL</li>
                <li>🚛 Logistique → Dispatch, Livraison</li>
                <li>📊 Récap → Rapport livraison</li>
                <li>🌐 Portails → Comptes externes</li>
              </ul>
            </div>
          </div>
          {/* Standard permission groups */}
          <div className="flex flex-col gap-3">
            {PERMISSION_GROUPS.map(group => {
              const activeCount = group.permissions.filter(k => !!form[k as keyof typeof form]).length
              const totalCount = group.permissions.length
              const allOn = activeCount === totalCount
              const someOn = activeCount > 0 && activeCount < totalCount
              return (
                <div key={group.id}
                  className={`rounded-xl overflow-hidden border border-l-4 ${group.borderLight} ${group.borderLeftClass} bg-card`}>
                  <div className={`flex items-center justify-between px-4 py-3 ${group.bgLight}`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-8 h-8 rounded-lg ${group.color} flex items-center justify-center shrink-0`}>
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={group.icon} />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-bold ${group.textColor}`}>{group.label}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{group.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className={`text-[10px] font-semibold ${allOn ? "text-emerald-600" : someOn ? "text-amber-600" : "text-slate-400"}`}>
                        {activeCount}/{totalCount}
                      </span>
                      <button type="button"
                        onClick={() => handleGroupToggle(group, !allOn)}
                        className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none ${allOn ? "bg-emerald-500" : someOn ? "bg-amber-400" : "bg-slate-200"}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${allOn ? "left-6" : someOn ? "left-3" : "left-1"}`} />
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-border bg-background">
                    {group.permissions.map(permKey => {
                      const isOn = !!form[permKey as keyof typeof form]
                      const subLabel = group.subLabels[permKey as string]
                      return (
                        <div key={permKey as string}
                          className="flex items-center gap-3 px-4 pl-8 py-2.5 hover:bg-slate-50/70 transition-colors">
                          <button type="button"
                            onClick={() => handlePermToggle(permKey)}
                            className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${isOn ? "bg-emerald-500" : "bg-slate-200"}`}>
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${isOn ? "left-4" : "left-0.5"}`} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${isOn ? "text-slate-900" : "text-slate-400"}`}>{subLabel?.label ?? permKey as string}</p>
                          </div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isOn ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>
                            {isOn ? "ON" : "OFF"}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* Grouped permission cards */
        <div className="flex flex-col gap-3">
          {PERMISSION_GROUPS.map(group => {
            const activeCount = group.permissions.filter(k => !!form[k as keyof typeof form]).length
            const totalCount = group.permissions.length
            const allOn = activeCount === totalCount
            const someOn = activeCount > 0 && activeCount < totalCount

            return (
              <div key={group.id}
                className={`rounded-xl overflow-hidden border border-l-4 ${group.borderLight} ${group.borderLeftClass} bg-card`}>
                {/* Group header */}
                <div className={`flex items-center justify-between px-4 py-3 ${group.bgLight}`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Icon */}
                    <div className={`w-8 h-8 rounded-lg ${group.color} flex items-center justify-center shrink-0`}>
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={group.icon} />
                      </svg>
                    </div>
                    {/* Label + description */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-bold ${group.textColor}`}>{group.label}</span>
                        <span className="text-[10px] text-muted-foreground" dir="rtl">{group.labelAr}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{group.description}</p>
                    </div>
                  </div>
                  {/* Master toggle — right side */}
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className={`text-[10px] font-semibold ${allOn ? "text-emerald-600" : someOn ? "text-amber-600" : "text-slate-400"}`}>
                      {activeCount}/{totalCount}
                    </span>
                    {/* Toggle button with indeterminate visual */}
                    <button
                      type="button"
                      aria-label={`${allOn ? "Désactiver" : "Activer"} tout le groupe ${group.label}`}
                      onClick={() => handleGroupToggle(group, !allOn)}
                      className={`relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                        allOn
                          ? "bg-emerald-500 focus:ring-emerald-400"
                          : someOn
                            ? "bg-amber-400 focus:ring-amber-400"
                            : "bg-slate-200 focus:ring-slate-300"
                      }`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${
                        allOn ? "left-6" : someOn ? "left-3" : "left-1"
                      }`} />
                    </button>
                  </div>
                </div>

                {/* Sub-permissions list */}
                <div className="divide-y divide-border bg-background">
                  {group.permissions.map(permKey => {
                    const isOn = !!form[permKey as keyof typeof form]
                    const subLabel = group.subLabels[permKey as string]
                    return (
                      <div key={permKey as string}
                        className="flex items-center gap-3 px-4 pl-8 py-2.5 hover:bg-slate-50/70 transition-colors">
                        {/* Indented checkbox toggle */}
                        <button
                          type="button"
                          aria-label={`${isOn ? "Désactiver" : "Activer"} — ${subLabel?.label ?? permKey as string}`}
                          onClick={() => handlePermToggle(permKey)}
                          className={`relative w-9 h-5 rounded-full shrink-0 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-400 ${isOn ? "bg-emerald-500" : "bg-slate-200"}`}>
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${isOn ? "left-4" : "left-0.5"}`} />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${isOn ? "text-slate-900" : "text-slate-500"}`}>
                            {subLabel?.label ?? permKey as string}
                          </p>
                          {/* BO / Mobile detail */}
                          {PERM_INTERFACES[permKey as string] && (
                            <div className="flex flex-col gap-0.5 mt-0.5">
                              <p className="text-[9px] text-blue-600 flex items-center gap-1">
                                <span className="font-bold shrink-0">BO:</span>
                                <span className="truncate">{PERM_INTERFACES[permKey as string].bo}</span>
                              </p>
                              {PERM_INTERFACES[permKey as string].mobile !== "—" && (
                                <p className="text-[9px] text-green-600 flex items-center gap-1">
                                  <span className="font-bold shrink-0">📱:</span>
                                  <span className="truncate">{PERM_INTERFACES[permKey as string].mobile}</span>
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold shrink-0 ${isOn ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-slate-100 text-slate-400 border border-slate-200"}`}>
                          {isOn ? "OUI" : "NON"}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-lg font-bold text-foreground">Acces restreint</p>
        <p className="text-sm text-muted-foreground mt-1">Gestion des utilisateurs reservee aux administrateurs.</p>
      </div>
    </div>
  )
}

export default function BOUsers({ currentUser }: { currentUser: User }) {
  // --- ALL hooks MUST come before any conditional return (Rules of Hooks) ---
  const [users, setUsers] = useState<User[]>([])
  const [search, setSearch] = useState("")
  const [filterRole, setFilterRole] = useState<UserRole | "">("")
  // Interne (équipe) vs Externe (clients / fournisseurs)
  const [filterScope, setFilterScope] = useState<"" | "interne" | "externe">("")
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<User | null>(null)
  const [form, setForm] = useState<Omit<User, "id">>(EMPTY_USER)
  const [saved, setSaved] = useState(false)
  const [genPwdState, setGenPwdState] = useState<{ userId: string; pwd: string; sending: boolean; sent: boolean } | null>(null)
  const [changePwdModal, setChangePwdModal] = useState<{ user: User; pwd: string; mobilePwd: string; saving: boolean; done: boolean } | null>(null)
  const [showRoles, setShowRoles] = useState(false)
  const [showPurge, setShowPurge] = useState(false)
  const [purging, setPurging] = useState(false)
  const [purgeCount, setPurgeCount] = useState(0)
  const [syncingAllUsers, setSyncingAllUsers] = useState(false)
  const [syncAllUsersDone, setSyncAllUsersDone] = useState(false)

  // Access check — computed AFTER hooks
  const canAccess = currentUser.role === "super_super_admin" || currentUser.role === "admin" || currentUser.role === "super_admin" || currentUser.role === "rh_manager"

  // Secteurs proposés = ceux déjà utilisés par l'équipe + défauts (combobox : saisie libre conservée)
  const secteurOptions = getAllSecteurs(users.map(u => u.secteur || "")).sort()

  useEffect(() => {
    if (canAccess) {
      const isCurrentJawad = currentUser.role === "super_super_admin"
      const all = store.getUsers().filter(u => {
        if (u.id === JAWAD_ID) return isCurrentJawad
        if (u.role === "super_super_admin") return currentUser.id === u.id || isCurrentJawad
        return true
      })
      setUsers(all)

      // ── Auto-nettoyage doublon Jawad dans Supabase ────────────────────────
      // Si VFU00001 existe, supprimer silencieusement u_jawad_root de Supabase
      if (isCurrentJawad) {
        fetch("/api/sync-write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: "fl_users", deletes: ["u_jawad_root"] }),
        }).catch(() => {})
      }
    }
  }, [canAccess, currentUser.id, currentUser.role])

  // Re-sync when Supabase pushes fresh data (fl_store_updated fires on every setLS call)
  useEffect(() => {
    const handler = (e: Event) => {
      const key = (e as CustomEvent).detail as string
      if (key === "fl_users" && canAccess) reload()
    }
    window.addEventListener("fl_store_updated", handler)
    return () => window.removeEventListener("fl_store_updated", handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccess])

  // Guard AFTER hooks — safe conditional render
  if (!canAccess) return <AccessDenied />

  // Access levels:
  // super_admin + admin → full CRUD on ALL users
  // resp_commercial → can create/edit prevendeur + team_leader only (their team)
  // resp_logistique  → can create/edit magasinier + dispatcheur + livreur only (their team)
  // others           → read-only: name, phone, email, secteur only
  const isJawadUser = currentUser.role === "super_super_admin"
  const isFullAdmin = currentUser.role === "super_super_admin" || currentUser.role === "super_admin" || currentUser.role === "admin"

  const TEAM_LEADER_ALLOWED: Record<string, UserRole[]> = {
    resp_commercial: ["prevendeur", "team_leader"],
    resp_logistique: ["magasinier", "dispatcheur", "livreur"],
  }
  const isTeamLeader = currentUser.role === "resp_commercial" || currentUser.role === "resp_logistique"
  const teamAllowedRoles: UserRole[] = TEAM_LEADER_ALLOWED[currentUser.role] ?? []

  // Alias so JSX references isSuperAdmin work without crashes
  const isSuperAdmin = isFullAdmin
  const canManageUsers = isFullAdmin
  const canCreateTeamMember = isTeamLeader
  // resp_commercial can edit objectifs of their team members
  const canEditObjectifs = currentUser.role === "resp_commercial" || currentUser.role === "team_leader" || isFullAdmin
  const canEditUser = (u: User) => {
    if (isFullAdmin) return true
    if (isTeamLeader && teamAllowedRoles.includes(u.role)) return true
    return false
  }
  const canDeleteUser = (u: User) => {
    if (u.id === JAWAD_ID) return false
    if (isJawadUser) return u.id !== currentUser.id
    return isFullAdmin && u.role !== "super_super_admin"
  }
  const canSeeFullDetails = (u: User) => isFullAdmin || (isTeamLeader && teamAllowedRoles.includes(u.role))

  // Roles available in new-user form depending on current user role
  const creatableRoles: UserRole[] = isFullAdmin
    ? ALL_ROLES
    : isTeamLeader
      ? teamAllowedRoles
      : []

  const canOpenNewForm = isFullAdmin || isTeamLeader

  const reload = () => {
    const all = store.getUsers()
    // JAWAD (super admin root) is NEVER visible in the user list
    const visible = all.filter(u => {
      if (u.id === JAWAD_ID) return false  // Jawad never visible
      if (u.role === "super_super_admin") return currentUser.id === u.id // super admin only sees itself
      return true
    })
    setUsers(visible)
  }

  // ── Supabase sync helpers ─────────────────────────────────────────────────
  const syncAllUsersToSupabase = async () => {
    setSyncingAllUsers(true)
    setSyncAllUsersDone(false)
    try {
      const all = store.getUsers()
      const upserts = all.map(u => {
        const { id, ...payload } = u
        return { id, payload, updated_at: new Date().toISOString() }
      })
      await fetch("/api/sync-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_users", upserts }),
      })
      setSyncAllUsersDone(true)
      setTimeout(() => setSyncAllUsersDone(false), 4000)
    } catch (e) {
      console.error("[BOUsers] syncAllUsersToSupabase error:", e)
    } finally {
      setSyncingAllUsers(false)
    }
  }

  const syncUserToSupabase = async (user: User) => {
    try {
      const { id, ...payload } = user
      await fetch("/api/sync-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "fl_users",
          upserts: [{ id, payload, updated_at: new Date().toISOString() }],
        }),
      })
    } catch (e) {
      console.error("[BOUsers] syncUserToSupabase error:", e)
    }
  }

  const deleteUserFromSupabase = async (userId: string) => {
    try {
      await fetch("/api/sync-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_users", deletes: [userId] }),
      })
    } catch (e) {
      console.error("[BOUsers] deleteUserFromSupabase error:", e)
    }
  }

  const handlePurge = async () => {
    setPurging(true)
    const all = store.getUsers()
    // Keep only: JAWAD_ID + super_super_admin accounts
    const toKeep = all.filter(u => u.id === JAWAD_ID || u.role === "super_super_admin")
    const toDelete = all.filter(u => u.id !== JAWAD_ID && u.role !== "super_super_admin")
    store.saveUsers(toKeep)
    await Promise.all(toDelete.map(u => deleteUserFromSupabase(u.id)))
    setPurgeCount(toDelete.length)
    reload()
    setShowPurge(false)
    setPurging(false)
  }

  const EXTERNAL_ROLES: UserRole[] = ["client", "client_proprietaire", "client_gerant", "fournisseur"]
  const isExternal = (u: User) => EXTERNAL_ROLES.includes(u.role)
  const filtered = users.filter(u => {
    const matchSearch = (u.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (u.email ?? "").toLowerCase().includes(search.toLowerCase())
    const matchRole = filterRole === "" || u.role === filterRole
    const matchScope = filterScope === "" ||
      (filterScope === "externe" ? isExternal(u) : !isExternal(u))
    return matchSearch && matchRole && matchScope
  }).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "fr"))
  const nbInterne = users.filter(u => !isExternal(u)).length
  const nbExterne = users.filter(u => isExternal(u)).length

  const openNew = () => {
    setEditing(null)
    // Équipe par défaut = celle de l'admin qui crée le compte — modifiable
    // via le sélecteur "Équipe" (utile pour super_super_admin qui gère
    // plusieurs équipes).
    setForm({ ...EMPTY_USER, groupeId: effectiveGroupId(currentUser) })
    setShowForm(true)
  }

  const openEdit = (u: User) => {
    if (!canEditUser(u)) return
    setEditing(u)
    setForm({
      name: u.name, email: u.email, password: u.password, role: u.role, accessType: u.accessType,
      secteur: u.secteur || "", depotId: u.depotId, phone: u.phone || "", actif: u.actif, isDemo: u.isDemo || false,
      groupeId: u.groupeId,
      canViewAchat: u.canViewAchat || false, canViewCommercial: u.canViewCommercial || false,
      canViewLogistique: u.canViewLogistique || false, canViewStock: u.canViewStock || false,
      canViewCash: u.canViewCash || false, canViewFinance: u.canViewFinance || false,
      canViewRecap: u.canViewRecap || false, canViewDatabase: u.canViewDatabase || false,
      canViewRH: u.canViewRH || false, canViewExternal: u.canViewExternal || false,
      canCreateCommandeBO: u.canCreateCommandeBO || false,
      objectifClients: u.objectifClients || 0, objectifTonnage: u.objectifTonnage || 0,
      objectifJournalierCA: u.objectifJournalierCA || 0,
      objectifHebdomadaireCA: u.objectifHebdomadaireCA || 0,
      objectifMensuelCA: u.objectifMensuelCA || 0,
      objectifJournalierClients: u.objectifJournalierClients || 0,
      objectifHebdomadaireClients: u.objectifHebdomadaireClients || 0,
      objectifMensuelClients: u.objectifMensuelClients || 0,
      passwordMobile: u.passwordMobile, passwordBO: u.passwordBO,
      photoUrl: u.photoUrl, telephone: u.telephone,
      requireCameraAuth: u.requireCameraAuth, fournisseurId: u.fournisseurId, clientId: u.clientId,
      specialitesAchat: u.specialitesAchat ?? [],
    })
    setShowForm(true)
  }

  const handleSave = () => {
    if (!(form.name ?? "").trim() || !(form.email ?? "").trim()) return
    const all = store.getUsers()
    let savedUser: User | null = null
    if (editing) {
      const idx = all.findIndex(u => u.id === editing.id)
      if (idx >= 0) {
        all[idx] = { ...all[idx], ...form }
        savedUser = all[idx]
        store.saveUsers(all)
      }
    } else {
      const newId  = store.genId()
      // Auto-assign permissions based on role — no manual setup needed
      const autoPerms = autoAssignPermissions(form.role as UserRole)
      const newUser = { ...autoPerms, ...form, id: newId }
      all.push(newUser)
      savedUser = newUser
      store.saveUsers(all)
      // Notifier le RH : nouveau compte cree — dossier administratif a completer
      if (["super_super_admin", "admin", "super_admin"].includes(currentUser.role)) {
        store.addRHNotification({
          id: `rhnotif_${Date.now()}`,
          type: "nouveau_salarie",
          titre: `Nouveau compte cree : ${form.name}`,
          message: `L'administrateur ${currentUser.name} a cree un compte pour ${form.name} (${ROLE_LABELS[form.role as UserRole]}). Veuillez completer le dossier administratif : adresse, CIN, CNSS, salaire, modalite de paiement, etc.`,
          userId: newId,
          salarieNom: form.name,
          createdBy: currentUser.name,
          createdAt: new Date().toISOString(),
          lu: false,
          traite: false,
        })
      }
    }
    // ── Sync to Supabase (async, non-blocking) ───────────────────────────────
    if (savedUser) syncUserToSupabase(savedUser)
    reload()
    setShowForm(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const toggleActive = (u: User) => {
    const all = store.getUsers()
    const idx = all.findIndex(x => x.id === u.id)
    if (idx >= 0) {
      all[idx].actif = !all[idx].actif
      store.saveUsers(all)
      syncUserToSupabase(all[idx])
      reload()
    }
  }

  const handleDelete = (u: User) => {
    if (!canDeleteUser(u)) return
    if (!confirm(`Supprimer l'utilisateur "${u.name}" ?`)) return
    const all = store.getUsers().filter(x => x.id !== u.id)
    store.saveUsers(all)
    deleteUserFromSupabase(u.id)
    reload()
  }

  const handleChangePassword = async (userId: string, pwd: string, mobilePwd: string) => {
    const all = store.getUsers()
    const idx = all.findIndex(x => x.id === userId)
    if (idx < 0) return
    all[idx] = { ...all[idx], password: pwd || all[idx].password, passwordMobile: mobilePwd || all[idx].passwordMobile }
    store.saveUsers(all)
    await syncUserToSupabase(all[idx])
    reload()
  }

  const handleGeneratePassword = async (u: User) => {
    const pwd = generatePassword()
    setGenPwdState({ userId: u.id, pwd, sending: true, sent: false })
    // Save new password
    const all = store.getUsers()
    const idx = all.findIndex(x => x.id === u.id)
    if (idx >= 0) {
      all[idx] = { ...all[idx], password: pwd }
      store.saveUsers(all)
      syncUserToSupabase(all[idx])
      reload()
    }
    // Send via email
    if (u.email && u.email.includes("@")) {
      await sendEmail({
        to_email: u.email,
        subject: `FreshLink Pro — Nouveau mot de passe pour ${u.name}`,
        body: [
          `Bonjour ${u.name},`,
          "",
          "Un administrateur a généré un nouveau mot de passe pour votre compte FreshLink Pro.",
          "",
          `  Identifiant : ${u.email || u.name}`,
          `  Nouveau mot de passe : ${pwd}`,
          "",
          "Merci de vous connecter avec ces nouvelles informations.",
          "",
          "---",
          `مرحبا ${u.name}،`,
          "تم توليد كلمة مرور جديدة من طرف المسؤول.",
          `  كلمة المرور الجديدة: ${pwd}`,
        ].join("\n"),
      })
    }
    setGenPwdState(prev => prev ? { ...prev, sending: false, sent: true } : null)
    setTimeout(() => setGenPwdState(null), 5000)
  }

  const roleStats = ALL_ROLES.map(r => ({ role: r, count: users.filter(u => u.role === r).length }))
    .filter(r => r.count > 0)

  // Export CSV
  const exportCSV = () => {
    const cols = ["id", "name", "email", "role", "secteur", "phone", "actif"]
    const rows = users.map(u => cols.map(c => `"${String((u as unknown as Record<string, unknown>)[c] ?? "")}"`).join(","))
    const csv = [cols.join(","), ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `utilisateurs_${new Date().toISOString().split("T")[0]}.csv`
    a.click()
  }

  // Export JSON
  const exportJSON = () => {
    const clean = users.map(u => ({ ...u, password: "***" }))
    const blob = new Blob([JSON.stringify(clean, null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `utilisateurs_${new Date().toISOString().split("T")[0]}.json`
    a.click()
  }

  // Import JSON
  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const imported: User[] = JSON.parse(ev.target?.result as string)
        if (!Array.isArray(imported)) { alert("Format invalide: le fichier doit contenir un tableau d'utilisateurs."); return }
        const existing = store.getUsers()
        let added = 0
        for (const u of imported) {
          if (!u.id || !u.name || !u.email) continue
          if (!existing.find(x => x.id === u.id)) {
            existing.push({ ...u, password: u.password || "1234" })
            added++
          }
        }
        store.saveUsers(existing)
        reload()
        setSaved(true)
        alert(`${added} utilisateur(s) importé(s) avec succès.`)
      } catch { alert("Erreur de lecture du fichier JSON.") }
    }
    reader.readAsText(file)
    e.target.value = ""
  }

  // Role reference data shown in the roles legend card
  const ROLE_DETAILS: { role: UserRole; label: string; acces: string; droits: string; processus: string; reception: boolean }[] = [
    { role: "super_super_admin", label: "Super Admin",             acces: "Back-office complet", droits: "Contrôle total — tous les droits, purge, accès JAWAD, paramètres critiques",                          processus: "Peut intervenir sur toutes les étapes du processus. Accès aux logs systeme et à la purge des données.",                                            reception: true  },
    { role: "super_admin",       label: "Admin Principal",         acces: "Back-office complet", droits: "Tous les droits : utilisateurs, DB, workflow, finance, RH, commandes, stock",                         processus: "Supervision complète — peut valider, annuler ou modifier toute étape : commande → achat → réception → préparation → livraison → encaissement.",   reception: true  },
    { role: "admin",             label: "Administrateur",          acces: "Back-office complet", droits: "Idem super_admin sauf purge et paramètres système critiques",                                          processus: "Supervision complète des processus opérationnels. Peut créer/modifier utilisateurs, articles, clients, fournisseurs.",                            reception: true  },
    { role: "resp_commercial",   label: "Resp. Commercial",        acces: "Back-office",         droits: "Commandes, clients, fournisseurs, affectation commerciale, marges, récap, caisse",                    processus: "Porte 0 : Valide les commandes des prévendeurs. Peut modifier prix/remises. Accède aux objectifs et KPIs de son équipe.",                         reception: false },
    { role: "team_leader",       label: "Team Leader",             acces: "Back-office",         droits: "Commandes, caisse, récap journalier — supervise l'équipe de prévendeurs",                             processus: "Contrôle du terrain commercial : valide les commandes, suit les encaissements, gère les objectifs de l'équipe prévendeurs.",                      reception: false },
    { role: "prevendeur",        label: "Prévendeur",              acces: "Mobile",              droits: "Prise de commandes clients, visites terrain, objectifs journaliers CA et clients visités",             processus: "Étape 1 — Création commande terrain. Saisit la commande, choisit les articles, quantités, conditions de paiement. Soumet pour validation.",       reception: false },
    { role: "resp_logistique",   label: "Resp. Logistique",        acces: "Back-office + Mobile",droits: "Stock, dispatch, BL, trips, retours, réceptions, bons de préparation",                               processus: "Porte 3 : Valide les BL avant départ. Supervise les tournées, les retours et l'état du stock. Coordonne acheteurs, magasiniers et livreurs.",      reception: true  },
    { role: "magasinier",        label: "Magasinier",              acces: "Mobile",              droits: "Réception marchandise, validation BL, préparation commandes, contrôle préparation",                   processus: "Porte 2 : Réceptionne et contrôle la marchandise arrivée au dépôt. Prépare les commandes selon les bons. Valide les BL de sortie.",               reception: true  },
    { role: "dispatcheur",       label: "Dispatcheur",             acces: "Mobile",              droits: "Affectation livreurs, planning tournées, réception marchandise, suivi GPS",                           processus: "Organise les tournées de livraison : affecte les commandes aux livreurs, optimise les routes, suit les départs/retours en temps réel.",           reception: true  },
    { role: "livreur",           label: "Livreur",                 acces: "Mobile",              droits: "Bons de livraison, rapport tournée, retours clients, GPS, signature",                                 processus: "Étape finale livraison : reçoit les BL, livre les clients, encaisse ou confirme, saisit les retours marchandise et valide la tournée.",          reception: false },
    { role: "acheteur",          label: "Acheteur",                acces: "Mobile",              droits: "Bons d'achat, besoin par SKU, historique prix fournisseurs — PAS de réception",                       processus: "Étape 2 achat : Saisit les bons d'achat selon les besoins du stock. Consulte l'historique des prix et compare les fournisseurs.",                  reception: false },
    { role: "ctrl_achat",        label: "Contrôleur Achat",        acces: "Mobile",              droits: "Vérification qualité, conformité prix, validation des achats effectués",                              processus: "Contrôle Porte 1 achat : vérifie que les achats effectués sont conformes au bon d'achat (quantité, qualité, prix). Peut bloquer ou valider.",      reception: false },
    { role: "ctrl_prep",         label: "Contrôleur Préparation",  acces: "Mobile",              droits: "Contrôle des bons de préparation avant départ livreur",                                               processus: "Porte 2B : Vérifie que chaque BL préparé par le magasinier est correct (produits, quantités, DLC) avant de valider le chargement.",               reception: false },
    { role: "cash_man",          label: "Cash Manager",            acces: "Back-office",         droits: "Encaissements livreurs, réconciliation BL, suivi caisse journalière",                                 processus: "Fin de journée : récupère les espèces et chèques des livreurs, pointe les BL encaissés/non-encaissés, produit le rapport de caisse.",             reception: false },
    { role: "financier",         label: "Financier",               acces: "Back-office",         droits: "Trésorerie, P&L, charges, actionnaires, distribution bénéfices",                                     processus: "Analyse hebdomadaire/mensuelle : consolide les données de vente, achat et caisse. Produit les tableaux de bord financiers et calcule les marges.",  reception: false },
    { role: "comptable",         label: "Comptable",               acces: "Back-office",         droits: "Comptabilité RH, salaires, paiements, journaux comptables",                                           processus: "Traite la paie mensuelle, édite les fiches de salaire, saisit les écritures comptables RH, gère les avances et déductions.",                    reception: false },
    { role: "rh_manager",        label: "RH Manager",              acces: "Back-office",         droits: "Dossiers salariés, contrats, congés, matricules, CNSS, productivité",                                 processus: "Gestion des ressources humaines : onboarding, dossier administratif, suivi présences, objectifs, évaluations et reporting RH.",                   reception: false },
    { role: "resp_achat",        label: "Resp. Achat",             acces: "Back-office",         droits: "Validation PO, négociation fournisseurs, analyse coûts, budget achat",                                processus: "Valide les bons d'achat et PO. Négocie les tarifs fournisseurs. Analyse les écarts prix/qualité. Suit le budget achat vs réalisé.",               reception: true  },
    { role: "auditeur",          label: "Auditeur",                acces: "Back-office (lecture)", droits: "Lecture seule sur toutes les données — rapport, audit trail",                                        processus: "Contrôle interne : consulte les journaux d'activité, vérifie la cohérence des données (stock, ventes, achats) sans pouvoir modifier.",            reception: false },
    { role: "investisseur",      label: "Investisseur",            acces: "Dashboard dédié",     droits: "Dashboard confidentiel — CA, marges, ROI, dividendes, projection",                                    processus: "Accès au tableau de bord investisseur uniquement : performance financière consolidée, évolution du portefeuille et distribution des bénéfices.",  reception: false },
    { role: "client",            label: "Client",                  acces: "Portail client",      droits: "Consultation commandes, historique, factures, retours via portail dédié",                             processus: "Portail client : consulte ses commandes en cours et passées, télécharge les BL/factures, suit les livraisons et soumet les réclamations.",       reception: false },
    { role: "fournisseur",       label: "Fournisseur",             acces: "Portail fournisseur", droits: "Consultation PO, statuts livraisons, factures, historique prix",                                      processus: "Portail fournisseur : reçoit les PO, confirme les disponibilités, met à jour les prix, consulte l'historique des transactions.",                 reception: false },
  ]

  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            Gestion Utilisateurs <span className="text-muted-foreground font-normal text-base mr-1">/ إدارة المستخدمين</span>
          </h2>
          <p className="text-sm text-muted-foreground">{users.length} utilisateur(s) — {users.filter(u => u.actif).length} actifs</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportCSV}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            CSV
          </button>
          <button onClick={exportJSON}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            JSON
          </button>
          {isSuperAdmin && (
            <label className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l4-4m0 0l4 4m-4-4v12" /></svg>
              Importer JSON
              <input type="file" accept=".json" className="hidden" onChange={importJSON} />
            </label>
          )}
          {isSuperAdmin && (
            <button
              onClick={syncAllUsersToSupabase}
              disabled={syncingAllUsers}
              title="Synchronise tous les utilisateurs localStorage → Supabase (corrige les connexions website)"
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors disabled:opacity-60 ${syncAllUsersDone ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"}`}>
              {syncingAllUsers
                ? <><span className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />Sync en cours...</>
                : syncAllUsersDone
                  ? <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>Sync OK !</>
                  : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Sync Utilisateurs →</>
              }
            </button>
          )}
          {canOpenNewForm && (
            <button onClick={openNew}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-primary-foreground bg-primary hover:opacity-90 transition-opacity">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {isTeamLeader ? "Ajouter membre equipe" : "Nouvel utilisateur"}
            </button>
          )}
          {isJawadUser && (
            <div className="relative">
              <button
                onClick={() => setShowPurge(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-all">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Purge
              </button>
              {showPurge && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl border border-red-200 shadow-2xl z-50 p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-red-700">Purge des utilisateurs</p>
                      <p className="text-xs text-red-500">Cette action est irréversible</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600">Tous les comptes sauf <strong>Super Admin</strong> seront supprimés définitivement ({users.filter(u => u.role !== "super_super_admin").length} comptes).</p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowPurge(false)} className="flex-1 py-2 rounded-xl text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">Annuler</button>
                    <button onClick={handlePurge} disabled={purging} className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
                      {purging ? "Suppression..." : "Confirmer la purge"}
                    </button>
                  </div>
                </div>
              )}
              {purgeCount > 0 && (
                <div className="absolute right-0 top-full mt-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-xs font-semibold text-green-700 whitespace-nowrap">
                  ✓ {purgeCount} compte(s) supprimé(s)
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Roles Reference Card */}
      <div className="border border-indigo-200 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowRoles(p => !p)}
          className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 hover:bg-indigo-100 transition-colors text-left">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
            <span className="text-sm font-semibold text-indigo-800">Guide des roles et droits d&apos;acces</span>
            <span className="text-xs text-indigo-500 hidden sm:inline">— Qui peut faire quoi ?</span>
          </div>
          <svg className={`w-4 h-4 text-indigo-600 transition-transform ${showRoles ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </button>
        {showRoles && (
          <div className="bg-white">
            {/* ── Table des rôles ── */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-indigo-700 text-white">
                    <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wide">Rôle</th>
                    <th className="text-center px-3 py-2.5 font-semibold uppercase tracking-wide text-[10px]">
                      <span className="flex items-center justify-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        Mobile
                      </span>
                    </th>
                    <th className="text-center px-3 py-2.5 font-semibold uppercase tracking-wide text-[10px]">
                      <span className="flex items-center justify-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        Back-office
                      </span>
                    </th>
                    <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wide">Droits / Accès</th>
                    <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wide hidden lg:table-cell">Rôle dans le processus</th>
                    <th className="text-center px-3 py-2.5 font-semibold uppercase tracking-wide text-[10px]">Réception</th>
                  </tr>
                </thead>
                <tbody>
                  {ROLE_DETAILS.filter(r => r.role !== "super_super_admin" || isJawadUser).map((r, i) => (
                    <tr key={r.role} style={{ background: i % 2 === 0 ? "white" : "#f8f8ff", borderTop: "1px solid #e0e7ff" }}>
                      <td className="px-4 py-2.5 min-w-[120px]">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${ROLE_COLORS[r.role as UserRole] ? `text-white ${ROLE_COLORS[r.role as UserRole]}` : "bg-slate-100 text-slate-700"}`}>
                          {r.label}
                        </span>
                        <p className="text-[9px] text-muted-foreground mt-0.5">{r.acces}</p>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {(r.acces.includes("Mobile") || r.acces.includes("Portail") || r.acces.includes("terrain"))
                          ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></span>
                          : <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-400"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></span>
                        }
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {(r.acces.includes("Back-office") || r.acces.includes("complet") || r.acces.includes("Dashboard"))
                          ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-600"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg></span>
                          : <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-400"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg></span>
                        }
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground text-[11px] max-w-[220px]">{r.droits}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-[11px] max-w-[260px] hidden lg:table-cell leading-relaxed">{r.processus}</td>
                      <td className="px-3 py-2.5 text-center">
                        {r.reception
                          ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-600">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            </span>
                          : <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-100 text-red-500">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                            </span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ── Flux processus détaillé ── */}
            <div className="border-t border-indigo-200 bg-indigo-50/60 px-4 py-4">
              <p className="text-xs font-bold text-indigo-800 uppercase tracking-wide mb-3">Flux processus complet — Qui intervient à chaque étape ?</p>
              <div className="flex flex-col gap-2">
                {[
                  { step: "Étape 1 — Commande terrain",          color: "bg-emerald-500", roles: ["prévendeur"],                                                     desc: "Le prévendeur saisit la commande chez le client (mobile). Soumise à la validation du responsable commercial." },
                  { step: "Porte A — Validation commerciale",    color: "bg-lime-500",    roles: ["resp_commercial", "team_leader", "admin"],                        desc: "Le responsable commercial/team leader valide ou refuse la commande. Peut modifier prix et conditions." },
                  { step: "Étape 2 — Besoin achat & PO",         color: "bg-amber-500",   roles: ["acheteur", "resp_achat"],                                         desc: "L'acheteur identifie le besoin par SKU et crée le bon d'achat ou la PO fournisseur." },
                  { step: "Porte B — Contrôle achat",            color: "bg-orange-500",  roles: ["ctrl_achat", "resp_achat"],                                       desc: "Vérifie la conformité de l'achat (prix, quantité, fournisseur) avant engagement financier." },
                  { step: "Étape 3 — Réception marchandise",     color: "bg-cyan-500",    roles: ["magasinier", "dispatcheur", "resp_logistique", "admin"],          desc: "Réceptionne la marchandise au dépôt, contrôle la qualité/quantité, met à jour le stock." },
                  { step: "Étape 4 — Préparation commandes",     color: "bg-sky-500",     roles: ["magasinier"],                                                     desc: "Prépare les commandes selon les bons de préparation validés." },
                  { step: "Porte C — Contrôle préparation",      color: "bg-blue-500",    roles: ["ctrl_prep", "resp_logistique"],                                   desc: "Vérifie chaque BL préparé (produits, poids, DLC) avant autorisation de chargement." },
                  { step: "Étape 5 — Dispatch & tournée",        color: "bg-violet-500",  roles: ["dispatcheur", "resp_logistique"],                                 desc: "Affecte les BL aux livreurs, crée les trips, optimise les tournées." },
                  { step: "Étape 6 — Livraison terrain",         color: "bg-purple-500",  roles: ["livreur"],                                                        desc: "Le livreur effectue la tournée, livre les clients, collecte les signatures et les paiements." },
                  { step: "Étape 7 — Encaissement & caisse",     color: "bg-rose-500",    roles: ["cash_man", "resp_commercial"],                                    desc: "Le cash man récupère les espèces/chèques, pointe les BL, produit le rapport de caisse." },
                  { step: "Étape 8 — Clôture financière",        color: "bg-pink-500",    roles: ["financier", "comptable", "admin"],                                desc: "Consolidation P&L, rapprochement banque, calcul des marges, distribution des résultats." },
                  { step: "Étape 9 — RH & Paie",                 color: "bg-fuchsia-500", roles: ["rh_manager", "comptable"],                                        desc: "Traitement des présences, calcul des salaires, édition fiches de paie, virements." },
                ].map((item, idx) => (
                  <div key={idx} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                    <div className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${item.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-bold text-slate-800">{item.step}</span>
                        <div className="flex gap-1 flex-wrap">
                          {item.roles.map(r => (
                            <span key={r} className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">{r}</span>
                          ))}
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
        </div>

      {saved && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Utilisateur sauvegardé avec succès
        </div>
      )}

      {/* ── Manual password change modal ─────────────────────────────── */}
      {changePwdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && !changePwdModal.saving && setChangePwdModal(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h3 className="font-bold text-foreground">Changer le mot de passe</h3>
                <p className="text-xs text-muted-foreground">{changePwdModal.user.name} — {changePwdModal.user.email}</p>
              </div>
              <button onClick={() => !changePwdModal.saving && setChangePwdModal(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-foreground">🔑 Mot de passe BO / Web</label>
                <input
                  type="text"
                  placeholder="Nouveau mot de passe"
                  value={changePwdModal.pwd}
                  onChange={e => setChangePwdModal(prev => prev ? { ...prev, pwd: e.target.value } : null)}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  autoComplete="new-password"
                />
                <p className="text-[11px] text-muted-foreground">Utilisé pour se connecter sur shop.vita-core.org et le back-office</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-foreground">📱 Mot de passe Mobile (optionnel)</label>
                <input
                  type="text"
                  placeholder="Mot de passe mobile (laisser vide = inchangé)"
                  value={changePwdModal.mobilePwd}
                  onChange={e => setChangePwdModal(prev => prev ? { ...prev, mobilePwd: e.target.value } : null)}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  autoComplete="new-password"
                />
                <p className="text-[11px] text-muted-foreground">Mot de passe secondaire pour l&apos;application mobile terrain</p>
              </div>
              {changePwdModal.done && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm font-semibold">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Mot de passe mis à jour et synchronisé ✓
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => !changePwdModal.saving && setChangePwdModal(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                  Annuler
                </button>
                <button
                  disabled={(!changePwdModal.pwd.trim() && !changePwdModal.mobilePwd.trim()) || changePwdModal.saving}
                  onClick={async () => {
                    setChangePwdModal(prev => prev ? { ...prev, saving: true } : null)
                    await handleChangePassword(changePwdModal.user.id, changePwdModal.pwd.trim(), changePwdModal.mobilePwd.trim())
                    setChangePwdModal(prev => prev ? { ...prev, saving: false, done: true, pwd: "", mobilePwd: "" } : null)
                    setTimeout(() => setChangePwdModal(null), 2000)
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all hover:opacity-90"
                  style={{ background: "oklch(0.38 0.2 260)" }}>
                  {changePwdModal.saving ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enregistrement...</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Enregistrer</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generated password toast */}
      {genPwdState && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm ${genPwdState.sent ? "bg-green-50 border-green-200 text-green-800" : "bg-blue-50 border-blue-200 text-blue-800"}`}>
          {genPwdState.sending ? (
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0 mt-0.5" />
          ) : (
            <svg className="w-4 h-4 shrink-0 mt-0.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          )}
          <div>
            <p className="font-semibold">{genPwdState.sending ? "Génération en cours..." : "Mot de passe généré et envoyé"}</p>
            {!genPwdState.sending && (
              <p className="text-xs mt-0.5">
                Nouveau mot de passe : <code className="font-mono font-bold bg-white px-2 py-0.5 rounded border border-green-200">{genPwdState.pwd}</code>
                <span className="ml-2 text-muted-foreground">(envoyé par email si configuré)</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Interne / Externe */}
      <div className="flex items-center gap-1 bg-muted rounded-xl p-1 w-fit">
        {([
          { id: "", label: `Tous (${users.length})` },
          { id: "interne", label: `Interne / الفريق (${nbInterne})` },
          { id: "externe", label: `Externe / خارجي (${nbExterne})` },
        ] as { id: "" | "interne" | "externe"; label: string }[]).map(s => (
          <button key={s.id} onClick={() => setFilterScope(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filterScope === s.id ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Role stats chips */}
      <div className="flex items-center gap-2 flex-wrap">
        {roleStats.map(({ role, count }) => (
          <button key={role} onClick={() => setFilterRole(filterRole === role ? "" : role)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${filterRole === role ? "text-white border-transparent" : "bg-card border-border text-muted-foreground hover:border-primary/40"}`}
            style={filterRole === role ? { background: "oklch(0.38 0.2 260)" } : {}}>
            <span className={`w-1.5 h-1.5 rounded-full ${ROLE_COLORS[role]}`} />
            {ROLE_LABELS[role]} ({count})
          </button>
        ))}
        {filterRole && (
          <button onClick={() => setFilterRole("")} className="text-xs text-muted-foreground hover:text-foreground underline">
            Tout afficher
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou email..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary" />
      </div>

      {/* Read-only notice for non-managers */}
      {!canOpenNewForm && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted border border-border text-muted-foreground text-xs">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          Acces en lecture seule — vous pouvez voir les noms, contacts et secteurs uniquement. / قراءة فقط
        </div>
      )}

      {/* Team leader notice */}
      {isTeamLeader && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          Vous pouvez creer et modifier uniquement les membres de votre equipe
          {" "}({teamAllowedRoles.map(r => ROLE_LABELS[r]).join(", ")}).
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sidebar text-sidebar-foreground">
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Nom / الاسم</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Contact</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Role</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Secteur</th>
                <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Depot</th>
                {canOpenNewForm && <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Statut</th>}
                {isFullAdmin && <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Permissions</th>}
                {canOpenNewForm && <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Aucun utilisateur trouve</td></tr>
              ) : filtered.map((u, i) => (
                <tr key={u.id} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"} style={{ borderTop: "1px solid var(--border)" }}>
                  {/* Name — always visible */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {u.photoUrl ? (
                        <img
                          src={u.photoUrl}
                          alt={u.name}
                          className="w-8 h-8 rounded-full object-cover border border-border shrink-0"
                        />
                      ) : (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${ROLE_COLORS[u.role]}`}>
                          {(u.name?.[0] ?? "?").toUpperCase()}
                        </div>
                      )}
                      <p className="font-semibold text-foreground">{u.name}</p>
                    </div>
                  </td>
                  {/* Contact — always visible (phone + email) */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                      {u.phone && <span>{u.phone}</span>}
                      <span>{u.email}</span>
                    </div>
                  </td>
                  {/* Role badge */}
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold text-white ${ROLE_COLORS[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  {/* Secteur — always visible */}
                  <td className="px-4 py-3 text-muted-foreground text-sm">{u.secteur || "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-sm">
                    {u.depotId ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary">
                        <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                        </svg>
                        {store.getDepots().find(d => d.id === u.depotId)?.nom ?? u.depotId}
                      </span>
                    ) : <span className="text-muted-foreground/50">Tous</span>}
                  </td>
                  {/* Statut — only for managers */}
                  {canOpenNewForm && (
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${u.actif ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {u.actif ? "Actif" : "Inactif"}
                      </span>
                    </td>
                  )}
                  {/* Permissions — full admin only */}
                  {isFullAdmin && (
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {u.canViewAchat && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">Achat</span>}
                        {u.canViewCommercial && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Commercial</span>}
                        {u.canViewLogistique && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-700">Logistique</span>}
                        {u.canViewStock && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-700">Stock</span>}
                        {u.canViewCash && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Cash</span>}
                        {u.canViewFinance && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">Finance</span>}
                        {u.canViewRecap && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">Recap</span>}
                        {u.canViewDatabase && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">Admin</span>}
                        {u.canViewExternal && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-700">Clients</span>}
                        {!u.canViewAchat && !u.canViewCommercial && !u.canViewLogistique && !u.canViewStock && !u.canViewCash && !u.canViewFinance && !u.canViewRecap && !u.canViewDatabase && (
                          <span className="text-[10px] text-muted-foreground italic">Aucune permission</span>
                        )}
                      </div>
                    </td>
                  )}
                  {/* Actions — only if can edit this user */}
                  {canOpenNewForm && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {canEditUser(u) && (
                          <button onClick={() => openEdit(u)} title="Modifier"
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                        )}
                        {isFullAdmin && (
                          <>
                            <button onClick={() => handleGeneratePassword(u)} title="Generer un mot de passe aleatoire"
                              disabled={!!u.id && genPwdState?.userId === u.id && genPwdState?.sending}
                              className="p-1.5 rounded-lg hover:bg-violet-50 text-muted-foreground hover:text-violet-600 transition-colors disabled:opacity-50">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                              </svg>
                            </button>
                            <button onClick={() => setChangePwdModal({ user: u, pwd: "", mobilePwd: "", saving: false, done: false })} title="Changer le mot de passe manuellement"
                              className="p-1.5 rounded-lg hover:bg-amber-50 text-muted-foreground hover:text-amber-600 transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={() => toggleActive(u)} title={u.actif ? "Desactiver" : "Activer"}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                              {u.actif
                                ? <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                : <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                            </button>
                            {u.id !== currentUser.id && (
                              <button onClick={() => handleDelete(u)} title="Supprimer"
                                className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h3 className="font-bold text-foreground">{editing ? "Modifier l&apos;utilisateur" : "Nouvel utilisateur"}</h3>
                <p className="text-xs text-muted-foreground">{editing ? "تعديل المستخدم" : "مستخدم جديد"}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={!(form.name ?? "").trim() || !(form.email ?? "").trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ background: "oklch(0.38 0.2 260)" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {editing ? "Enregistrer" : "Créer"}
                </button>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="p-6 flex flex-col gap-5">
              {!canManageUsers && canEditObjectifs && (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  En tant que Responsable Commercial, vous pouvez uniquement modifier les objectifs des prévendeurs.
                </div>
              )}
              {/* Identity — only for admins */}
              {canManageUsers && <div>
                <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Identite / الهوية</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                  {/* Photo profile — spans full width */}
                  <div className="sm:col-span-2 flex items-center gap-4">
                    {/* Avatar preview */}
                    <div className="relative shrink-0">
                      {(form as User).photoUrl ? (
                        <img
                          src={(form as User).photoUrl}
                          alt="Photo profil"
                          className="w-16 h-16 rounded-full object-cover border-2 border-primary shadow"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-dashed border-primary/30 flex items-center justify-center">
                          <svg className="w-7 h-7 text-primary/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                      )}
                      {(form as User).photoUrl && (
                        <button
                          type="button"
                          onClick={() => setForm({ ...form, photoUrl: undefined } as typeof form)}
                          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center text-[10px] font-bold hover:opacity-90">
                          &times;
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-xs font-semibold text-foreground">Photo de profil / صورة الملف الشخصي</label>
                      <label className="cursor-pointer flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 transition-colors text-xs text-primary font-medium">
                        <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        Choisir une photo / اختر صورة
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = ev => {
                              setForm({ ...form, photoUrl: ev.target?.result as string } as typeof form)
                            }
                            reader.readAsDataURL(file)
                          }}
                        />
                      </label>
                      <p className="text-[10px] text-muted-foreground">JPG, PNG, WEBP — Max 2 MB</p>
                    </div>
                  </div>

                  {/* Civilite */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground">Civilite *</label>
                    <div className="flex gap-2 flex-wrap">
                      {(["M.", "Mme", "Dr.", "Pr."] as Civilite[]).map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setForm({ ...form, civilite: c } as typeof form)}
                          className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
                            (form as {civilite?: Civilite}).civilite === c
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-background border-border text-muted-foreground hover:border-primary/60"
                          }`}>
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground">Nom complet *</label>
                    <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Mohamed Alami" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground">Email *</label>
                    <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                      className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="user@freshlink.ma" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground">Mot de passe</label>
                    <div className="flex gap-2">
                      <input type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                        className="flex-1 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                        placeholder="1234" />
                      <button type="button"
                        onClick={() => setForm({ ...form, password: generatePassword() })}
                        title="Générer un mot de passe fort"
                        className="px-3 py-2.5 rounded-xl border border-violet-300 bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 transition-colors shrink-0">
                        Générer
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground">Téléphone</label>
                    <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                      className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="0661234567" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground">Secteur / Zone</label>
                    <input type="text" list="secteur-options" value={form.secteur} onChange={e => setForm({ ...form, secteur: e.target.value })}
                      className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Nord, Centre..." />
                    <datalist id="secteur-options">
                      {secteurOptions.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>

                  {/* Depot assignment — visible for roles that need depot access */}
                  {(form.role === "magasinier" || form.role === "acheteur" || form.role === "livreur" || form.role === "admin" || form.role === "super_admin") && (
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-primary shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                        </svg>
                        Depot assigne / المستودع
                        <span className="text-[10px] font-normal text-muted-foreground">(optionnel — filtre la vision du magasinier)</span>
                      </label>
                      {(() => {
                        const depots = store.getDepots().filter(d => d.actif)
                        return (
                          <select
                            value={form.depotId ?? ""}
                            onChange={e => setForm({ ...form, depotId: e.target.value || undefined } as typeof form)}
                            className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                            <option value="">— Tous les depots (aucune restriction)</option>
                            {depots.map(d => (
                              <option key={d.id} value={d.id}>
                                {d.nom}{d.ville ? ` — ${d.ville}` : ""}{d.responsableNom ? ` (resp: ${d.responsableNom})` : ""}
                              </option>
                            ))}
                          </select>
                        )
                      })()}
                      <p className="text-[10px] text-muted-foreground">
                        Si un depot est assigne, le magasinier/acheteur ne verra que les bons destines a ce depot.
                        Laissez vide pour voir tous les depots.
                      </p>
                    </div>
                  )}

                  {/* Grouped Role Selector */}
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-foreground">Role * / الدور</label>
                    <div className="flex flex-col gap-2">
                      {ROLE_GROUPS.map(group => {
                        // Filter to only roles this user is allowed to assign
                        const visibleRoles = group.roles.filter(r => creatableRoles.includes(r))
                        if (visibleRoles.length === 0) return null
                        return (
                          <div key={group.label}>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-1.5">{group.label}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {visibleRoles.map(r => (
                                <button key={r} type="button"
                                  onClick={() => {
                                    // Auto-apply permissions + accessType for the selected role
                                    const defaultPerms = DEFAULT_PERMS_BY_ROLE[r] ?? ALL_OFF
                                    const autoPerms    = autoAssignPermissions(r)
                                    // Reset subtype and roles when primary role changes
                                    setForm(prev => ({ ...prev, role: r, subtype: undefined, roles: undefined, ...defaultPerms, accessType: autoPerms.accessType }))
                                  }}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${form.role === r ? "text-primary-foreground border-transparent shadow-sm bg-primary" : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary"}`}>
                                  {ROLE_LABELS[r]}
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* ── Équipe (isolation des données par groupe) ────────────────── */}
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-foreground">Équipe</label>
                    <select
                      value={(form as { groupeId?: string }).groupeId ?? ""}
                      onChange={e => setForm({ ...form, groupeId: e.target.value || undefined } as typeof form)}
                      className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="">— Aucune (visible par toutes les équipes) —</option>
                      {users
                        .filter(u => u.role === "super_super_admin" || u.role === "super_admin" || u.role === "admin")
                        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
                        .map(admin => (
                          <option key={admin.id} value={effectiveGroupId(admin)}>
                            {admin.name} ({admin.role === "super_super_admin" ? "Super Admin" : admin.role === "super_admin" ? "Super Admin" : "Admin"})
                          </option>
                        ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">Ce compte et les clients qu&apos;il crée ne seront visibles que par cette équipe (sauf pour le super administrateur, qui voit tout).</p>
                  </div>

                  {/* ── Subtype selector — Client ──────────────────────────────── */}
                  {form.role === "client" && (
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label className="text-xs font-semibold text-foreground">Type de client / نوع الزبون</label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { val: "particulier",  icon: "🛒", label: "Particulier",   sub: "Achat direct" },
                          { val: "marchand",     icon: "🏪", label: "Marchand",      sub: "Commerce détail" },
                          { val: "chr",          icon: "🏨", label: "CHR / HORECA",  sub: "Hôtel, resto, café" },
                        ] as const).map(opt => (
                          <button key={opt.val} type="button"
                            onClick={() => setForm(prev => ({ ...prev, subtype: opt.val }))}
                            className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all text-center
                              ${(form as { subtype?: string }).subtype === opt.val
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background text-muted-foreground hover:border-primary/50"}`}>
                            <span className="text-xl">{opt.icon}</span>
                            <span className="text-[10px] font-bold leading-tight">{opt.label}</span>
                            <span className="text-[9px] opacity-60">{opt.sub}</span>
                          </button>
                        ))}
                      </div>
                      {!(form as { subtype?: string }).subtype && (
                        <p className="text-[10px] text-amber-600">⚠️ Sélectionnez un type de client pour affiner la connexion</p>
                      )}
                    </div>
                  )}

                  {/* ── Subtype selector — Fournisseur ─────────────────────────── */}
                  {form.role === "fournisseur" && (
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label className="text-xs font-semibold text-foreground">Type de fournisseur / نوع المورد</label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { val: "ferme",         icon: "🌾", label: "Ferme",         sub: "Production agricole" },
                          { val: "vendeur",        icon: "🏬", label: "Vendeur",       sub: "Grossiste / marché" },
                          { val: "intermediaire",  icon: "🤝", label: "Intermédiaire", sub: "Courtier / agent" },
                        ] as const).map(opt => (
                          <button key={opt.val} type="button"
                            onClick={() => setForm(prev => ({ ...prev, subtype: opt.val }))}
                            className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border-2 transition-all text-center
                              ${(form as { subtype?: string }).subtype === opt.val
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background text-muted-foreground hover:border-primary/50"}`}>
                            <span className="text-xl">{opt.icon}</span>
                            <span className="text-[10px] font-bold leading-tight">{opt.label}</span>
                            <span className="text-[9px] opacity-60">{opt.sub}</span>
                          </button>
                        ))}
                      </div>
                      {!(form as { subtype?: string }).subtype && (
                        <p className="text-[10px] text-amber-600">⚠️ Sélectionnez un type de fournisseur</p>
                      )}
                    </div>
                  )}

                  {/* ── Multi-role — rôles supplémentaires ────────────────────── */}
                  {!["client", "fournisseur"].includes(form.role) && (
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        Rôles supplémentaires
                        <span className="text-[9px] font-normal text-muted-foreground">(optionnel — active le Switch de rôle sur mobile)</span>
                      </label>
                      <div className="flex flex-wrap gap-1.5 p-3 rounded-xl border border-border bg-muted/30">
                        {([
                          "prevendeur","acheteur","magasinier","livreur","dispatcheur","ctrl_achat","ctrl_prep","resp_logistique","resp_commercial","team_leader","cash_man","financier","comptable",
                        ] as UserRole[])
                          .filter(r => r !== form.role && creatableRoles.includes(r))
                          .map(r => {
                            const currentRoles: UserRole[] = (form as { roles?: UserRole[] }).roles ?? [form.role as UserRole]
                            const isChecked = currentRoles.includes(r)
                            return (
                              <button key={r} type="button"
                                onClick={() => {
                                  const base = (form as { roles?: UserRole[] }).roles ?? [form.role as UserRole]
                                  const next = isChecked
                                    ? base.filter(x => x !== r)
                                    : [...base, r]
                                  setForm(prev => ({ ...prev, roles: next.length > 1 ? next : undefined }))
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all
                                  ${isChecked
                                    ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                                    : "bg-background border-border text-muted-foreground hover:border-violet-400"}`}>
                                {isChecked ? "✓ " : ""}{ROLE_LABELS[r]}
                              </button>
                            )
                          })}
                      </div>
                      {((form as { roles?: UserRole[] }).roles?.length ?? 0) > 1 && (
                        <p className="text-[10px] text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5">
                          ✓ Switch activé : {((form as { roles?: UserRole[] }).roles ?? []).map(r => ROLE_LABELS[r]).join(" ↔ ")}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Access Type */}
                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-foreground">Interface d&apos;acces / واجهة الوصول</label>
                    <p className="text-[10px] text-muted-foreground">Par défaut, basé sur le rôle. Vous pouvez forcer une interface.</p>
                    <div className="flex gap-2 flex-wrap mt-1">
                      {([
                        { val: undefined,    label: "Auto (rôle)",       tag: "AUTO" },
                        { val: "mobile",     label: "Mobile",            tag: "MOB" },
                        { val: "backoffice", label: "Back-office",       tag: "BO" },
                        { val: "both",       label: "Mobile + Back-office", tag: "2x" },
                      ] as { val: UserAccessType | undefined; label: string; tag: string }[]).map(opt => (
                        <button key={opt.label} type="button"
                          onClick={() => setForm({ ...form, accessType: opt.val })}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${form.accessType === opt.val ? "text-white border-transparent shadow-sm" : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary"}`}
                          style={form.accessType === opt.val ? { background: "oklch(0.38 0.2 260)" } : {}}>
                          <span className={`text-[9px] font-black px-1 py-0.5 rounded ${form.accessType === opt.val ? "bg-white/20" : "bg-muted"}`}>{opt.tag}</span>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dual password section — only when accessType === "both" */}
                  {form.accessType === "both" && (
                    <div className="flex flex-col gap-3 sm:col-span-2">
                      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                        <p className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-1">Mots de passe par interface</p>
                        <p className="text-[11px] text-blue-700 mb-3">
                          Definissez un mot de passe different pour chaque interface. La connexion redirigera automatiquement sans afficher le selecteur.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                              <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                              Mot de passe Mobile
                            </label>
                            <input type="text"
                              value={(form as { passwordMobile?: string }).passwordMobile ?? ""}
                              onChange={e => setForm({ ...form, passwordMobile: e.target.value } as typeof form)}
                              className="px-3 py-2 rounded-xl border border-border bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                              placeholder="ex: 1234" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                              <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                              </svg>
                              Mot de passe Back-office
                            </label>
                            <input type="text"
                              value={(form as { passwordBO?: string }).passwordBO ?? ""}
                              onChange={e => setForm({ ...form, passwordBO: e.target.value } as typeof form)}
                              className="px-3 py-2 rounded-xl border border-border bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                              placeholder="ex: BO1234" />
                          </div>
                        </div>
                        {(form as { passwordMobile?: string }).passwordMobile && (form as { passwordBO?: string }).passwordBO && (
                          <div className="mt-2 p-2 rounded-lg bg-white border border-blue-200 text-[11px] text-blue-800">
                            Mobile : <strong className="font-mono">{(form as { passwordMobile?: string }).passwordMobile}</strong>
                            {" → "}interface terrain |{" "}
                            BO : <strong className="font-mono">{(form as { passwordBO?: string }).passwordBO}</strong>
                            {" → "}interface gestion
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Hidden legacy role select for open form (unused but keep to avoid TS issue) */}
                  <div className="hidden">
                    <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value as UserRole })}>
                      {ALL_ROLES.map(r => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>}

              {/* Objectifs prevendeur */}
              {(form.role === "prevendeur" || form.role === "resp_commercial" || form.role === "team_leader") && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Objectifs / الأهداف</h4>
                  <div className="flex flex-col gap-4">
                    {/* CA Objectifs */}
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-2">CA (Chiffre d&apos;affaires en DH)</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-muted-foreground">Journalier</label>
                          <input type="number" value={form.objectifJournalierCA ?? 0}
                            onChange={e => setForm({ ...form, objectifJournalierCA: Number(e.target.value) })}
                            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-muted-foreground">Hebdomadaire</label>
                          <input type="number" value={form.objectifHebdomadaireCA ?? 0}
                            onChange={e => setForm({ ...form, objectifHebdomadaireCA: Number(e.target.value) })}
                            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-muted-foreground">Mensuel</label>
                          <input type="number" value={form.objectifMensuelCA ?? 0}
                            onChange={e => setForm({ ...form, objectifMensuelCA: Number(e.target.value) })}
                            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                    </div>
                    {/* Clients Objectifs */}
                    <div>
                      <p className="text-xs font-semibold text-foreground mb-2">Clients visités</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-muted-foreground">Journalier</label>
                          <input type="number" value={form.objectifJournalierClients ?? 0}
                            onChange={e => setForm({ ...form, objectifJournalierClients: Number(e.target.value) })}
                            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-muted-foreground">Hebdomadaire</label>
                          <input type="number" value={form.objectifHebdomadaireClients ?? 0}
                            onChange={e => setForm({ ...form, objectifHebdomadaireClients: Number(e.target.value) })}
                            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-xs text-muted-foreground">Mensuel</label>
                          <input type="number" value={form.objectifMensuelClients ?? 0}
                            onChange={e => setForm({ ...form, objectifMensuelClients: Number(e.target.value) })}
                            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        </div>
                      </div>
                    </div>
                    {/* Legacy tonnage */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-muted-foreground">Objectif tonnage mensuel (kg)</label>
                        <input type="number" value={form.objectifTonnage ?? 0}
                          onChange={e => setForm({ ...form, objectifTonnage: Number(e.target.value) })}
                          className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Spécialisation achat — familles affectées à l'acheteur */}
              {form.role === "acheteur" && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Spécialisation achat / تخصص الشراء</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Familles que cet acheteur achète. Sur le mobile, son catalogue est filtré sur ces familles
                    (il peut afficher tout). Aucune sélection = toutes les familles.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {FAMILLES_ARTICLES.map(f => {
                      const sel = (form.specialitesAchat ?? []).includes(f)
                      return (
                        <button key={f} type="button"
                          onClick={() => setForm({
                            ...form,
                            specialitesAchat: sel
                              ? (form.specialitesAchat ?? []).filter(x => x !== f)
                              : [...(form.specialitesAchat ?? []), f],
                          })}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${sel ? "bg-emerald-600 text-white border-emerald-600" : "bg-background text-muted-foreground border-border hover:border-emerald-400"}`}>
                          {sel ? "✓ " : ""}{f}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Permissions — Mobile vs Back-office tabs */}
              <PermissionsTabs form={form} setForm={setForm} />
              {/* Legacy permissions block — removed, replaced by PermissionsTabs above */}

              {/* Workflows info */}
              <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: "oklch(0.38 0.2 260 / 0.06)", border: "1px solid oklch(0.38 0.2 260 / 0.2)" }}>
                <svg className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "oklch(0.38 0.2 260)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Les workflows email (validation commande, besoin achat, récap journalier) sont envoyés à l'adresse email renseignée. Pour WhatsApp, l'application génère un lien <code className="font-mono">wa.me/</code> vers le numéro de téléphone.
                </p>
              </div>

              {/* Securite — Camera & Micro obligatoire */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: "oklch(0.14 0.018 148)" }}>
                  <svg className="w-4 h-4 shrink-0" style={{ color: "oklch(0.65 0.18 148)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="text-xs font-bold" style={{ color: "oklch(0.75 0.14 148)" }}>Securite — Acces terrain</span>
                </div>
                <label className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">Activer camera &amp; micro obligatoire</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      L&apos;utilisateur devra autoriser la camera et le micro avant d&apos;acceder a l&apos;application.
                      {(typeof form.name === "string" && form.name.toLowerCase().startsWith("demo")) && (
                        <span className="ml-1 text-amber-500 font-medium">(Comptes demo — toujours ignore)</span>
                      )}
                    </p>
                  </div>
                  <div
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${(form as Record<string,unknown>).requireCameraAuth ? "bg-emerald-500" : "bg-muted"}`}
                    onClick={() => setForm({ ...form, requireCameraAuth: !(form as Record<string,unknown>).requireCameraAuth } as typeof form)}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${(form as Record<string,unknown>).requireCameraAuth ? "left-6" : "left-1"}`} />
                  </div>
                </label>
              </div>

              {/* Compte demo — reserve a Jawad */}
              {isJawadUser && (
                <label className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-800">Compte demo</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Ecriture bloquee (lecture seule) et visible dans la liste de comptes demo sur l&apos;ecran de connexion.
                    </p>
                  </div>
                  <div className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${form.isDemo ? "bg-amber-500" : "bg-muted"}`}
                    onClick={() => setForm({ ...form, isDemo: !form.isDemo })}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.isDemo ? "left-6" : "left-1"}`} />
                  </div>
                </label>
              )}

              {/* Statut */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className={`relative w-11 h-6 rounded-full transition-colors ${form.actif ? "bg-green-500" : "bg-muted"}`}
                  onClick={() => setForm({ ...form, actif: !form.actif })}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${form.actif ? "left-6" : "left-1"}`} />
                </div>
                <span className="text-sm font-semibold text-foreground">{form.actif ? "Compte actif" : "Compte inactif"}</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors">
                Annuler
              </button>
              <button onClick={handleSave}
                disabled={!(form.name ?? "").trim() || !(form.email ?? "").trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                style={{ background: "oklch(0.38 0.2 260)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {editing ? "Enregistrer les modifications" : "Cr\u00e9er l'utilisateur"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
