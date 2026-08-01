"use client"

import React, { useState, useEffect, useCallback, Component } from "react"
// next/dynamic replaced with React.lazy
import LangSwitcher from "@/components/ui/LangSwitcher"
import ThemeToggle from "@/components/ui/ThemeToggle"
import BONotifications from "./BONotifications"
import DismissibleBanner from "@/components/ui/DismissibleBanner"
import AppDownloadQR from "@/components/ui/AppDownloadQR"
import type { User } from "@/lib/store"
import { store, ROLE_LABELS, ROLE_COLORS, isDemoUser, isSuperSuperAdmin, JAWAD_ID } from "@/lib/store"
import { useLang, T } from "@/lib/i18n"
import type { AppLang } from "@/lib/lang"

// ─────────────────────────────────────────────────────────────
// ERROR BOUNDARY — catches any render crash inside a panel
// instead of letting the whole page go white
// ─────────────────────────────────────────────────────────────
interface EBState { hasError: boolean; msg: string }
// Chunk périmé après déploiement (nom de fichier hashé qui n'existe plus côté
// serveur) → "Failed to fetch dynamically imported module". Un rechargement
// récupère le nouvel index.html avec les bonnes références — un seul essai
// automatique par session pour éviter une boucle si le problème est autre.
const STALE_CHUNK_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i
const RELOAD_GUARD_KEY = "fl_chunk_reload_once"
class PanelErrorBoundary extends Component<{ children: React.ReactNode; label: string }, EBState> {
  constructor(props: { children: React.ReactNode; label: string }) {
    super(props)
    this.state = { hasError: false, msg: "" }
  }
  static getDerivedStateFromError(err: unknown): EBState {
    return { hasError: true, msg: err instanceof Error ? err.message : String(err) }
  }
  componentDidCatch(err: unknown, info: React.ErrorInfo) {
    console.error("[PanelErrorBoundary] ERROR:", err)
    console.error("[PanelErrorBoundary] STACK:", info?.componentStack)
    const msg = err instanceof Error ? err.message : String(err)
    if (STALE_CHUNK_RE.test(msg)) {
      try {
        if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return
        sessionStorage.setItem(RELOAD_GUARD_KEY, "1")
      } catch { /* noop */ }
      window.location.reload()
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-foreground text-base">{this.props.label} — Erreur de chargement</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs font-mono break-all">{this.state.msg}</p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, msg: "" })}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity">
            Reessayer
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ALL panels loaded dynamically — one broken import never crashes the whole BO
const L = (label: string) => () => <div className="p-8 text-center text-muted-foreground text-sm">{label}</div>
const BODashboard            = React.lazy(() => import("./BODashboard"))
const BOAchat                = React.lazy(() => import("./BOAchat"))
const BOReception            = React.lazy(() => import("./BOReception"))
const BOStock                = React.lazy(() => import("./BOStock"))
const BODispatch             = React.lazy(() => import("./BODispatch"))
const BOFournisseurs         = React.lazy(() => import("./BOFournisseurs"))
const BORapportLivraison     = React.lazy(() => import("./BORapportLivraison"))
const BOBonPreparation       = React.lazy(() => import("./BOBonPreparation"))
const BOCash                 = React.lazy(() => import("./BOCash"))
const BORetour               = React.lazy(() => import("./BORetour"))
const BORecap                = React.lazy(() => import("./BORecap"))
const BOPurchaseOrders       = React.lazy(() => import("./BOPurchaseOrders"))
const BOUsers                = React.lazy(() => import("./BOUsers"))
const BOEquipes              = React.lazy(() => import("./BOEquipes"))
const BOSettings             = React.lazy(() => import("./BOSettings"))
const BOFinance              = React.lazy(() => import("./BOFinance"))
const BOFiscalite            = React.lazy(() => import("./BOFiscalite"))
const BOArticles             = React.lazy(() => import("./BOArticles"))
const BOFamilles             = React.lazy(() => import("./BOFamilles"))
const BOGestionPA            = React.lazy(() => import("./BOGestionPA"))
const BOWhatsApp             = React.lazy(() => import("./BOWhatsApp"))
const BOAffectationCommerciale = React.lazy(() => import("./BOAffectationCommerciale"))
const BOZonesSecteurs        = React.lazy(() => import("./BOZonesSecteurs"))
const BOLoterie              = React.lazy(() => import("./BOLoterie"))
const BOGoogleSheets         = React.lazy(() => import("./BOGoogleSheets"))
const BOComptesExternes      = React.lazy(() => import("./BOComptesExternes"))
const BOProspection          = React.lazy(() => import("./BOProspection"))
const BOCreditFournisseur    = React.lazy(() => import("./BOCreditFournisseur"))
const AgentsIAPanel          = React.lazy(() => import("./AgentsIAPanel"))
const BOGPSTracker           = React.lazy(() => import("./BOGPSTracker"))
const FeedbackPanel          = React.lazy(() => import("./FeedbackPanel"))
const TripChargesPanel       = React.lazy(() => import("./TripChargesPanel"))
const AnalyseAchatPanel      = React.lazy(() => import("./AnalyseAchatPanel"))
const AnalyseTempsAchat      = React.lazy(() => import("./AnalyseTempsAchat"))
const BOShopAnalytics        = React.lazy(() => import("./BOShopAnalytics"))
const BOPromoCodes           = React.lazy(() => import("./BOPromoCodes"))
const AnalyseCaisseAcheteur  = React.lazy(() => import("./AnalyseCaisseAcheteur"))
const BOAnalyseCredit        = React.lazy(() => import("./BOAnalyseCredit"))
const BORolesPermissionsHub  = React.lazy(() => import("./BORolesPermissionsHub"))
const BORapportMarche        = React.lazy(() => import("./BORapportMarche"))
const AnalyseReceptionPanel  = React.lazy(() => import("./AnalyseReceptionPanel"))
const ShelfLifePanel         = React.lazy(() => import("./ShelfLifePanel"))
const ForecastPanel          = React.lazy(() => import("./ForecastPanel"))
const CameraPermissionsPanel = React.lazy(() => import("./CameraPermissionsPanel"))
const CaissesVidesPanel      = React.lazy(() => import("./CaissesVidesPanel"))
const DeployGuidePanel       = React.lazy(() => import("./DeployGuidePanel"))
const BODepots               = React.lazy(() => import("./BODepots"))
const BOResources            = React.lazy(() => import("./BOResources"))
const BOComptabiliteRH       = React.lazy(() => import("./BOComptabiliteRH"))
const BODatabase             = React.lazy(() => import("./BODatabase"))
const BOIntelligencePrix     = React.lazy(() => import("./BOIntelligencePrix"))
const BOConcurrence          = React.lazy(() => import("./BOConcurrence"))
const BOPricingConcurrence   = React.lazy(() => import("./BOPricingConcurrence"))
const BOCoutLivraison        = React.lazy(() => import("./BOCoutLivraison"))
const BOBonLivraison         = React.lazy(() => import("./BOBonLivraison"))
const BOHRDocuments          = React.lazy(() => import("./BOHRDocuments"))
const BOLoyalty              = React.lazy(() => import("./BOLoyalty"))
const BOPerformanceIncentives = React.lazy(() => import("./BOPerformanceIncentives"))
const BOTemplateEditor       = React.lazy(() => import("./BOTemplateEditor"))
const BOInvestissement       = React.lazy(() => import("./BOInvestissement"))
const BOInvestisseurDashboard = React.lazy(() => import("./BOInvestisseurDashboard"))
const MessagerieChannel      = React.lazy(() => import("../MessagerieChannel"))
const CallCenter = React.lazy(() => import("../CallCenter"))
const BOFinanceControlGestion  = React.lazy(() => import("./BOFinanceControlGestion"))
const BOSourcing             = React.lazy(() => import("./BOSourcing"))
const BOPricing              = React.lazy(() => import("./BOPricing"))
const BODemandesComptes      = React.lazy(() => import("./BODemandesComptes"))
const BOWebIntegration       = React.lazy(() => import("./BOWebIntegration"))
const BOMarketplace          = React.lazy(() => import("./BOMarketplace"))
const BODocuments            = React.lazy(() => import("./BODocuments"))
const BOCategoryPricing      = React.lazy(() => import("./BOCategoryPricing"))
const BOEchelonsClient       = React.lazy(() => import("./BOEchelonsClient"))
const BOJournalActivite      = React.lazy(() => import("./BOJournalActivite"))
const BOExternalLinks        = React.lazy(() => import("./BOExternalLinks"))
const BODeviceAccess         = React.lazy(() => import("./BODeviceAccess"))
const BOMobileGestion        = React.lazy(() => import("./BOMobileGestion"))
const BOCommandesUnifiees    = React.lazy(() => import("./BOCommandesUnifiees"))
const BOAlertesClients       = React.lazy(() => import("./BOAlertesClients"))
const BOImportExterne        = React.lazy(() => import("./BOImportExterne"))
// ── Modules V3 (moteur commercial, cadeaux, cutoffs, feedbacks, PA) ──
const BOCutoffsV3            = React.lazy(() => import("./BOCutoffs"))
const BOGiftsV3              = React.lazy(() => import("./BOGifts"))
const BOMoteurCommercialV3   = React.lazy(() => import("./BOMoteurCommercial"))
const BOPaHistoriqueV3       = React.lazy(() => import("./BOPaHistorique"))

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export type Tab =
  | "dashboard" | "achat" | "reception" | "po"
  | "affectation" | "zones_secteurs" | "dispatch"
  | "stock" | "retour" | "cash"
  | "recap" | "rapport_livraison" | "preparation"
  | "fournisseurs" | "articles" | "familles"
  | "finance" | "fiscalite" | "whatsapp"
  | "users" | "equipes" | "database" | "settings" | "gsheets"
  | "comptes_externes"
  | "prospection" | "credit_fournisseur" | "agents_ia"
  | "gps_tracker"
  | "feedback" | "trip_charges" | "analyse_achat" | "temps_achat" | "analyse_reception" | "caisse_acheteur" | "analyse_credit" | "roles_permissions" | "rapport_marche" | "shop_analytics" | "promo_codes"
  | "caisses_vides" | "shelf_life" | "forecast"
  | "camera_perms" | "cutoffs" | "deploy_guide"
  | "depots"
  | "rh_productivite" | "rh_comptabilite"
  | "intelligence_prix" | "concurrence" | "cout_livraison" | "bon_livraison" | "hr_documents"
  | "loyalty" | "performance_incentives" | "template_editor"
  | "investissement" | "sourcing" | "pricing" | "pricing_concurrent" | "finance_cdg"
  | "demandes_comptes" | "web_integration" | "journal_activite"
  | "marketplace"
  | "documents"
  | "category_pricing"
  | "echelons_client"
  | "liens_externes"
  | "device_access"
  | "mobile_gestion"
  | "commandes_unifiees"
  | "alertes_clients"
  | "moteur_commercial" | "gifts_v3" | "loterie" | "pa_historique" | "gestion_pa" | "cutoffs_v3" | "feedbacks_v3"
  | "import_externe"
  | "messagerie"

interface NavItem {
  id: Tab
  label: string
  labelAr: string
  icon: React.ReactNode
  permKey?: keyof User
  badge?: number
  superOnly?: boolean   // visible UNIQUEMENT par le super super admin (ex: Droits Caméra)
}

interface NavGroup {
  label: string
  labelAr: string
  items: NavItem[]
}

// ─────────────────────────────────────────────────────────────
// TRANSLATION HELPER — nav items use T dictionary
// ─────────────────────────────────────────────────────────────

// Maps tab id → T key prefix for nav translations
const NAV_I18N_KEYS: Partial<Record<string, keyof typeof T>> = {
  recap: "nav.recap", finance: "nav.finance", rapport_livraison: "nav.rapport_livr",
  achat: "nav.achat", po: "nav.po", fournisseurs: "nav.fournisseurs",
  reception: "nav.reception", affectation: "nav.affectation",
  cash: "nav.cash", stock: "nav.stock", dispatch: "nav.dispatch",
  preparation: "nav.preparation", retour: "nav.retours", bon_livraison: "nav.bon_livr",
  articles: "nav.articles", comptes_externes: "nav.clients", whatsapp: "nav.whatsapp",
  agents_ia: "nav.agents_ia", gps_tracker: "nav.gps", feedback: "nav.feedback",
  users: "nav.users", settings: "nav.settings_tab", database: "nav.settings_tab",
  demandes_comptes: "nav.demandes", web_integration: "nav.web_int",
}

const NAV_GROUP_I18N: Record<string, { fr: string; ar: string; en: string }> = {
  "Vue d'ensemble":       { fr: "Vue d'ensemble",        ar: "نظرة عامة",           en: "Overview" },
  "Achats":               { fr: "Achats",                 ar: "المشتريات",           en: "Purchases" },
  "Commercial":           { fr: "Commercial",             ar: "التجاري",             en: "Sales" },
  "Clients & Fournisseurs": { fr: "Clients & Fournisseurs", ar: "الزبائن والموردون",   en: "Clients & Suppliers" },
  "Stock & Catalogue":    { fr: "Stock & Catalogue",      ar: "المخزون والفهرس",     en: "Stock & Catalog" },
  "Logistique":           { fr: "Logistique",             ar: "اللوجستيك",           en: "Logistics" },
  "Finance & Contrôle":   { fr: "Finance & Contrôle",     ar: "المالية والرقابة",    en: "Finance & Control" },
  "RH & Equipe":          { fr: "RH & Equipe",            ar: "الموارد البشرية",     en: "HR & Team" },
  "Administration":       { fr: "Administration",         ar: "الإدارة والإعدادات",  en: "Administration" },
}

function getNavLabel(id: string, fallbackFr: string, fallbackAr: string | undefined, lang: AppLang): string {
  const key = NAV_I18N_KEYS[id]
  if (key && (lang as string) === "en") return (T[key] as { fr: string; ar: string; en?: string }).en ?? fallbackFr
  if (lang === "ar" && fallbackAr) return fallbackAr
  return fallbackFr
}

function getGroupLabel(groupLabel: string, lang: AppLang): string {
  const entry = NAV_GROUP_I18N[groupLabel]
  if (!entry) return groupLabel
  if ((lang as string) === "en") return entry.en
  if (lang === "ar") return entry.ar
  return entry.fr
}

// ─────────────────────────────────────────────────────────────
// ICON HELPER
// ─────────────────────────────────────────────────────────────

function Icon({ d, className = "w-[18px] h-[18px]" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={d} />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────
// NAV CONFIGURATION
// ─────────────────────────────────────────────────────────────

const NAV_GROUPS_RAW: NavGroup[] = [
  // ── 1. VUE D'ENSEMBLE ─────────────────────────────────────────────────────
  {
    label: "Vue d'ensemble", labelAr: "نظرة عامة",
    items: [
      { id: "dashboard",        label: "Tableau de bord",        labelAr: "لوحة التحكم",      icon: <Icon d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /> },
      { id: "messagerie",       label: "Messagerie",             labelAr: "المراسلة",         icon: <Icon d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 21l1.8-4A8.96 8.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /> },
      { id: "recap",            label: "Synthese & Recap",       labelAr: "الملخص",           permKey: "canViewRecap",      icon: <Icon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
      { id: "rapport_livraison", label: "Rapport Livraison",     labelAr: "تقرير التوصيل",    permKey: "canViewLogistique", icon: <Icon d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
    ],
  },
  // ── 2. ACHATS & APPROVISIONNEMENT ────────────────────────────────────────
  {
    label: "Achats", labelAr: "المشتريات",
    items: [
      { id: "achat",             label: "Bons d'achat",           labelAr: "وصولات الشراء",      permKey: "canViewAchat", icon: <Icon d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /> },
      { id: "po",                label: "Commandes Fournisseurs", labelAr: "أوامر الشراء",       permKey: "canViewAchat", icon: <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
      { id: "reception",         label: "Reception Achat",        labelAr: "الاستلام",           permKey: "canViewAchat", icon: <Icon d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /> },
      { id: "sourcing",          label: "Sourcing Marche",        labelAr: "تحديد المصادر",      permKey: "canViewAchat", icon: <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /> },
      { id: "pa_historique",     label: "PA Historique",          labelAr: "تاريخ سعر الشراء",   permKey: "canViewAchat", icon: <Icon d="M3 3v18h18M7 14l3-3 3 3 5-5" /> },
      { id: "gestion_pa",        label: "Gestion des PA",         labelAr: "إدارة سعر الشراء",   permKey: "canViewAchat", icon: <Icon d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 11v-1m9-5a9 9 0 11-18 0 9 9 0 0118 0z" /> },
      { id: "rapport_marche",    label: "Rapport Marché",         labelAr: "تقرير السوق",        permKey: "canViewAchat", icon: <Icon d="M8 7h12m0 0l-4-4m4 4l-4 4M4 7h.01M4 12h.01M4 17h.01M8 12h12M8 17h12" /> },
      { id: "pricing",           label: "Releve de Prix",         labelAr: "رصد الأسعار",        permKey: "canViewAchat", icon: <Icon d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /> },
      { id: "analyse_achat",     label: "Analyse Achat",          labelAr: "تحليل المشتريات",    permKey: "canViewAchat", icon: <Icon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
      { id: "temps_achat",       label: "Temps Achat",            labelAr: "وقت الشراء",          permKey: "canViewAchat", icon: <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
      { id: "analyse_reception", label: "Analyse Reception",      labelAr: "تحليل الاستلام",     permKey: "canViewAchat", icon: <Icon d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
    ],
  },
  // ── 3. COMMERCIAL & VENTES ───────────────────────────────────────────────
  {
    label: "Commercial", labelAr: "التجاري",
    items: [
      { id: "commandes_unifiees", label: "Commandes",              labelAr: "الطلبيات",          permKey: "canViewCommercial", icon: <Icon d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /> },
      { id: "alertes_clients",    label: "Alertes Articles Clients",labelAr: "تنبيهات أصناف الزبائن", permKey: "canViewCommercial", icon: <Icon d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /> },
      { id: "affectation",        label: "Affectation Commerciale",labelAr: "التوزيع التجاري",   permKey: "canViewCommercial", icon: <Icon d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /> },
      { id: "zones_secteurs",     label: "Zones & Secteurs",       labelAr: "المناطق والقطاعات", permKey: "canViewCommercial", icon: <Icon d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" /> },
      { id: "category_pricing",   label: "Tarifs par Categorie",   labelAr: "أسعار الفئات",      permKey: "canViewCommercial", icon: <Icon d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /> },
      { id: "echelons_client",    label: "Échelons Client",        labelAr: "مستويات الزبائن",   permKey: "canViewCommercial", icon: <Icon d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /> },
      { id: "documents",          label: "Devis & Contrats CHR",   labelAr: "العروض والعقود",    permKey: "canViewCommercial", icon: <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
      { id: "prospection",        label: "Prospection IA",         labelAr: "الاستهداف الذكي",  permKey: "canViewCommercial", icon: <Icon d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /> },
      { id: "intelligence_prix",  label: "Intelligence Prix",      labelAr: "استخبارات الأسعار",permKey: "canViewCommercial", icon: <Icon d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /> },
      { id: "concurrence",        label: "Concurrence & Perf.",    labelAr: "المنافسة والأداء", permKey: "canViewCommercial", icon: <Icon d="M3 3v18h18 M7 14l3-3 3 3 4-4" /> },
      { id: "pricing_concurrent", label: "Pricing",                labelAr: "التسعير",          permKey: "canViewCommercial", icon: <Icon d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /> },
      { id: "whatsapp",           label: "WhatsApp Pro",           labelAr: "واتساب",            permKey: "canViewCommercial", icon: (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      )},
    ],
  },
  // ── 4. CLIENTS & FOURNISSEURS (tiers externes — distinct des employés) ───
  {
    label: "Clients & Fournisseurs", labelAr: "الزبائن والموردون",
    items: [
      { id: "comptes_externes",   label: "Gestion Clients",        labelAr: "إدارة الزبائن",     permKey: "canViewExternal",   icon: <Icon d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /> },
      { id: "fournisseurs",       label: "Fournisseurs",           labelAr: "الموردون",          permKey: "canViewAchat",      icon: <Icon d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /> },
      { id: "credit_fournisseur", label: "Credit Fournisseur",     labelAr: "ائتمان الموردين",   permKey: "canViewAchat",      icon: <Icon d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /> },
      { id: "demandes_comptes",   label: "Demandes Comptes Web",   labelAr: "طلبات الحسابات",    permKey: "canViewExternal",   icon: <Icon d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /> },
      { id: "loyalty",            label: "Promotions & Fidelite",  labelAr: "العروض والولاء",    permKey: "canViewCommercial" as keyof User, icon: <Icon d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /> },
      { id: "marketplace",        label: "Marketplace & Web",      labelAr: "المتجر الإلكتروني", permKey: "canViewCommercial", icon: <Icon d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /> },
      { id: "promo_codes",        label: "Codes Promo",            labelAr: "أكواد الخصم",        permKey: "canViewExternal", icon: <Icon d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" /> },
      { id: "shop_analytics",     label: "Compteur Boutique",      labelAr: "عداد المتجر",        permKey: "canViewExternal", icon: <Icon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
      { id: "moteur_commercial",  label: "Moteur commercial",      labelAr: "محرك تجاري",       permKey: "canViewCommercial", icon: <Icon d="M9 7h6m0 0v6m0-6l-6 6" /> },
      { id: "gifts_v3",           label: "Cadeaux incentives",     labelAr: "هدايا تحفيزية",    permKey: "canViewCommercial", icon: <Icon d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /> },
      { id: "loterie",            label: "Loterie / Roue",         labelAr: "العجلة والقرعة",    permKey: "canViewCommercial", icon: <Icon d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 0v10l6 4" /> },
    ],
  },
  // ── 5. STOCK & CATALOGUE ─────────────────────────────────────────────────
  {
    label: "Stock & Catalogue", labelAr: "المخزون والفهرس",
    items: [
      { id: "articles",     label: "Catalogue Produits",    labelAr: "الفواكه والخضر",   permKey: "canViewStock",      icon: <Icon d="M4 6h16M4 10h16M4 14h16M4 18h16" /> },
      { id: "familles",     label: "Gestion des Familles",  labelAr: "إدارة الفئات",     permKey: "canViewStock",      icon: <Icon d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /> },
      { id: "stock",        label: "Stock & Inventaire",    labelAr: "المخزون",          permKey: "canViewStock",      icon: <Icon d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /> },
      { id: "shelf_life",   label: "Shelf Life & DLC",      labelAr: "تاريخ الصلاحية",  permKey: "canViewStock",      icon: <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> },
      { id: "forecast",     label: "Forecast & Achat Auto", labelAr: "التوقعات",         permKey: "canViewStock",      icon: <Icon d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /> },
      { id: "caisses_vides",label: "Caisses Vides",         labelAr: "الصناديق الفارغة", permKey: "canViewLogistique", icon: <Icon d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /> },
    ],
  },
  // ── 6. LOGISTIQUE & TRANSPORT ─────────────────────────────────────────────
  {
    label: "Logistique", labelAr: "اللوجستيك",
    items: [
      { id: "dispatch",     label: "Dispatch & Livreurs",  labelAr: "التوزيع",          permKey: "canViewLogistique", icon: <Icon d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /> },
      { id: "preparation",  label: "Preparation",          labelAr: "وصولات التحضير",   permKey: "canViewLogistique", icon: <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /> },
      { id: "bon_livraison",label: "Bons de Livraison",    labelAr: "وصولات التوصيل",   permKey: "canViewLogistique", icon: <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /> },
      { id: "retour",       label: "Retours",              labelAr: "المرتجعات",        permKey: "canViewLogistique", icon: <Icon d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /> },
      { id: "trip_charges", label: "Coût Trajet",          labelAr: "تكلفة المسار",     permKey: "canViewLogistique", icon: <Icon d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M12 7h.01M15 7h.01M9 7H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M7 7V5a2 2 0 012-2h8a2 2 0 012 2v2" /> },
      { id: "cout_livraison", label: "Coût Livraison",     labelAr: "تكلفة التوصيل",    permKey: "canViewLogistique", icon: <Icon d="M3 3v18h18M9 17V9m4 8V5m4 12v-6" /> },
      { id: "gps_tracker",  label: "GPS Livreurs",         labelAr: "تتبع GPS",         icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )},
    ],
  },
  // ── 7. FINANCE & CONTRÔLE ────────────────────────────────────────────────
  {
    label: "Finance & Contrôle", labelAr: "المالية والرقابة",
    items: [
      { id: "finance",               label: "Finance & Caisse",       labelAr: "المالية والصندوق",  permKey: "canViewFinance",                    icon: <Icon d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 11v-1m0-8h.01M20 12a8 8 0 11-16 0 8 8 0 0116 0z" /> },
      { id: "fiscalite",             label: "Fiscalite & Fiduciaire", labelAr: "الضرائب والمحاسبة", permKey: "canViewFinance",                    icon: <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
      { id: "cash",                  label: "Cash & BL",              labelAr: "النقديات",          permKey: "canViewCash",                       icon: <Icon d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /> },
      { id: "caisse_acheteur",       label: "Caisse Acheteur",        labelAr: "صندوق المشتري",     permKey: "canViewFinance",                    icon: <Icon d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /> },
      { id: "analyse_credit",        label: "Analyse Crédit",         labelAr: "تحليل الائتمان",    permKey: "canViewFinance",                    icon: <Icon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
      { id: "finance_cdg",           label: "Controle de Gestion",    labelAr: "مراقبة التسيير",    permKey: "canViewFinance" as keyof User,      icon: <Icon d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
      { id: "performance_incentives", label: "Primes & Actionnaires", labelAr: "العلاوات والمساهمون",permKey: "canViewFinance" as keyof User,      icon: <Icon d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /> },
      { id: "investissement",         label: "Dashboard Investisseur", labelAr: "ملف المستثمر",      permKey: "canViewInvestisseur" as keyof User, icon: <Icon d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /> },
    ],
  },
  // ── 8. RH & EQUIPE ───────────────────────────────────────────────────────
  {
    label: "RH & Equipe", labelAr: "الموارد البشرية",
    items: [
      { id: "rh_productivite",   label: "RH — Productivite & Salaires", labelAr: "الموارد البشرية",        permKey: "canViewRH" as keyof User, icon: <Icon d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /> },
      { id: "rh_comptabilite",   label: "Comptabilite RH",              labelAr: "محاسبة الموارد",         permKey: "canViewRH" as keyof User, icon: <Icon d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M12 7h.01M15 7h.01M9 7H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M7 7V5a2 2 0 012-2h8a2 2 0 012 2v2" /> },
      { id: "hr_documents",      label: "Docs & Paie Multi-Cycles",     labelAr: "وثائق الموارد البشرية",  permKey: "canViewRH" as keyof User, icon: <Icon d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /> },
      { id: "template_editor",   label: "Editeur de Templates",         labelAr: "محرر النماذج",           permKey: "canViewRH" as keyof User, icon: <Icon d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /> },
      { id: "agents_ia",         label: "Agents IA — Equipe Complete",  labelAr: "فريق الذكاء الاصطناعي", icon: <Icon d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.694-1.338 2.694H4.136c-1.368 0-2.337-1.694-1.338-2.694L4 15.3" /> },
      { id: "feedback",          label: "Feedbacks & Avis",             labelAr: "الآراء والتقييمات",      icon: <Icon d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /> },
    ],
  },
  // ── 9. ADMINISTRATION ────────────────────────────────────────────────────
  {
    label: "Administration", labelAr: "الإدارة والإعدادات",
    items: [
      { id: "users",             label: "Utilisateurs",          labelAr: "المستخدمون",        permKey: "canViewDatabase", icon: <Icon d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /> },
      { id: "equipes",           label: "Equipes",               labelAr: "الفرق",             permKey: "canViewDatabase", superOnly: true, icon: <Icon d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-2.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-4-4 4 4 0 004 4z" /> },
      { id: "roles_permissions", label: "Roles & Permissions",   labelAr: "الأدوار والصلاحيات", permKey: "canViewDatabase", icon: <Icon d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /> },
      { id: "journal_activite",  label: "Journal d'Activité",     labelAr: "سجل النشاط",        permKey: "canViewDatabase", icon: <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /> },
      { id: "device_access",     label: "Acces Appareils",       labelAr: "أجهزة الوصول",     permKey: "canViewDatabase", icon: <Icon d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /> },
      { id: "mobile_gestion",    label: "Gestion Mobile",        labelAr: "إدارة الموبايل",   permKey: "canViewDatabase", icon: <Icon d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /> },
      { id: "depots",            label: "Multi-Depots",          labelAr: "المستودعات",        permKey: "canViewDatabase", icon: <Icon d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /> },
      { id: "web_integration",   label: "Integration Site Web",  labelAr: "ربط الموقع",        permKey: "canViewDatabase", icon: <Icon d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /> },
      { id: "camera_perms",      label: "Droits Camera",         labelAr: "صلاحيات الكاميرا",  permKey: "canViewDatabase", superOnly: true, icon: <Icon d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z" /> },
      { id: "cutoffs",           label: "Notifications Cut-off", labelAr: "إشعارات الإيقاف",   permKey: "canViewDatabase", icon: <Icon d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /> },
      { id: "database",          label: "Base de donnees",       labelAr: "قاعدة البيانات",    permKey: "canViewDatabase", icon: <Icon d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /> },
      { id: "liens_externes",    label: "Liens Partenaires",     labelAr: "روابط الشركاء",     permKey: "canViewDatabase", icon: <Icon d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /> },
      { id: "settings",          label: "Parametres",            labelAr: "الإعدادات",         permKey: "canViewDatabase", icon: <Icon d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /> },
      { id: "gsheets",           label: "Google Sheets",         labelAr: "جوجل شيتس",        permKey: "canViewDatabase" as keyof User, icon: (
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 7h8M8 11h8M8 15h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M4 6h16" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        ),
      },
      { id: "import_externe",    label: "Import Bases Externes", labelAr: "استيراد قواعد البيانات", permKey: "canViewDatabase", icon: <Icon d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4M15 3l2 2-2 2M9 3L7 5l2 2" /> },
    ],
  },
]

// ─────────────────────────────────────────────────────────────
// PANELS — lazy, safe, no crashes
// ─────────────────────────────────────────────────────────────

// ── Réorganisation A→Z du menu (groupes logiques par domaine) ─────────────────
// Les items restent définis verbatim dans NAV_GROUPS_RAW ; on les regroupe ici
// par domaine métier. Pour réorganiser : éditer les listes d'ids ci-dessous.
const NAV_ITEM_MAP: Record<string, NavItem> =
  Object.fromEntries(NAV_GROUPS_RAW.flatMap(g => g.items).map(i => [i.id, i]))

const NAV_GROUP_DEF: { label: string; labelAr: string; ids: string[] }[] = [
  { label: "Vue d'ensemble",              labelAr: "نظرة عامة",            ids: ["dashboard", "recap", "rapport_livraison"] },
  { label: "Communication",               labelAr: "التواصل",              ids: ["messagerie", "whatsapp", "feedback"] },
  // "Rapport Marché" remonte en tete : c'est le point de depart quotidien de
  // l'acheteur (besoin net = demande prevendeurs - stock, cf. BORapportMarche)
  // — il repondait a "qu'est-ce qu'il faut acheter aujourd'hui" mais etait
  // enterre en position 9, apres des ecrans de reference/analyse consultes
  // bien moins souvent. Le reste garde son ordre (pipeline achat -> po ->
  // reception, puis reference/prix, puis analytics retrospectifs).
  { label: "Achats & Approvisionnement",  labelAr: "المشتريات والتموين",   ids: ["rapport_marche", "achat", "po", "reception", "sourcing", "fournisseurs", "credit_fournisseur", "pa_historique", "gestion_pa", "analyse_achat", "analyse_reception", "temps_achat"] },
  // Ordre par frequence reelle : Stock (niveau verifie plusieurs fois/jour) et
  // Shelf Life/DLC (denrees perissables — controle quotidien de fraicheur)
  // remontes devant le Catalogue/Caisses vides (reference, plus ponctuels) et
  // Forecast/Familles (planification, edition rare).
  { label: "Stock & Catalogue",           labelAr: "المخزون والفهرس",      ids: ["stock", "shelf_life", "articles", "caisses_vides", "forecast", "familles"] },
  // Ordre par frequence d'usage reelle : Commandes (quotidien, volume le
  // plus eleve) → Alertes (suivi quotidien des clients/articles) → gestion
  // d'equipe/zones (ponctuel) → devis/prospection (strategique/occasionnel).
  // "Moteur commercial" deplace vers "Prix, Marge & Concurrence" : c'est un
  // moteur de regles de remises/bonus (pricing), pas un outil de gestion de
  // commandes/zones/equipe — mal classe ici avant ce reajustement.
  { label: "Commercial & Ventes",         labelAr: "التجاري والمبيعات",    ids: ["commandes_unifiees", "alertes_clients", "affectation", "zones_secteurs", "documents", "prospection"] },
  // "Pricing" (pricing_concurrent, cf. BOPricingConcurrence) remonte juste
  // apres "Releve de Prix" : les deux forment le cycle quotidien de l'acheteur
  // (collecter les prix marche -> en deduire le PV imbattable / alerte achat).
  // Le reste (tarifs/echelons/moteur de remises) est de la configuration
  // ponctuelle, et les tableaux de bord d'intelligence/concurrence sont des
  // analyses retrospectives consultees moins souvent.
  { label: "Prix, Marge & Concurrence",   labelAr: "الأسعار والهامش والمنافسة", ids: ["pricing", "pricing_concurrent", "category_pricing", "echelons_client", "moteur_commercial", "intelligence_prix", "concurrence"] },
  { label: "Marketing & E-commerce",      labelAr: "التسويق والمتجر الإلكتروني", ids: ["marketplace", "promo_codes", "loyalty", "gifts_v3", "loterie", "shop_analytics"] },
  { label: "Clients & Comptes Web",       labelAr: "الزبائن والحسابات",    ids: ["comptes_externes", "demandes_comptes"] },
  { label: "Logistique & Transport",      labelAr: "اللوجستيك والنقل",     ids: ["dispatch", "preparation", "bon_livraison", "retour", "trip_charges", "cout_livraison", "gps_tracker"] },
  // Cash & BL et Caisse Acheteur remontent devant Fiscalite : ce sont des
  // encaissements/decaissements quotidiens (vente au comptant + achats
  // payes cash), contrairement a la fiscalite/controle de gestion qui sont
  // des cloture mensuelles. Analyse Credit remonte aussi : c'est un rapport
  // quotidien de suivi credit fournisseurs/clients (cf. BOAnalyseCredit).
  { label: "Finance & Contrôle de Gestion", labelAr: "المالية ومراقبة التسيير", ids: ["finance", "cash", "caisse_acheteur", "analyse_credit", "fiscalite", "finance_cdg", "performance_incentives", "investissement"] },
  { label: "Ressources Humaines",         labelAr: "الموارد البشرية",      ids: ["rh_productivite", "rh_comptabilite", "hr_documents", "template_editor", "agents_ia"] },
  // Utilisateurs/Parametres devant : ce sont les ecrans admin les plus
  // consultes (onboarding, reglages courants). Puis droits d'acces/equipes,
  // puis config operationnelle (cutoffs, mobile, depots, integrations), puis
  // outils techniques rarement ouverts (BDD, imports, liens) et enfin les
  // ecrans reserves super-admin (camera) en dernier.
  { label: "Administration & Système",    labelAr: "الإدارة والنظام",      ids: ["users", "settings", "roles_permissions", "equipes", "cutoffs", "journal_activite", "mobile_gestion", "device_access", "depots", "web_integration", "gsheets", "database", "liens_externes", "import_externe", "camera_perms"] },
]

const NAV_GROUPS: NavGroup[] = NAV_GROUP_DEF.map(g => ({
  label: g.label, labelAr: g.labelAr,
  items: g.ids.map(id => NAV_ITEM_MAP[id]).filter(Boolean) as NavItem[],
}))

const PANELS: Record<Tab, (u: User, nav: (tab: Tab) => void) => React.ReactNode> = {
  dashboard:         (u) => <BODashboard user={u} />,
  messagerie:        (u) => <MessagerieChannel user={u} />,
  achat:             (_u) => <BOAchat />,
  reception:         (u) => <BOReception user={u} />,
  po:                (_u) => <BOPurchaseOrders />,
  affectation:       (u) => <BOAffectationCommerciale user={u} />,
  zones_secteurs:    (u) => <BOZonesSecteurs user={u} />,
  dispatch:          (u) => <BODispatch user={u} />,
  fournisseurs:      (u) => <BOFournisseurs user={u} />,
  preparation:       (u, nav) => <BOBonPreparation user={u} onValidated={() => nav("bon_livraison")} />,
  rapport_livraison: (u) => <BORapportLivraison user={u} />,
  stock:             (u) => <BOStock user={u} />,
  retour:            (_u) => <BORetour />,
  articles:          (u) => <BOArticles user={u} />,
  familles:          (u) => <BOFamilles user={u} />,
  finance:           (u) => <BOFinance user={u} />,
  fiscalite:         (u) => <BOFiscalite user={u} />,
  whatsapp:          (u) => <BOWhatsApp user={u} />,
  cash:              (u) => <BOCash user={u} />,
  recap:             (_u) => <BORecap />,
  users:             (u) => <BOUsers currentUser={u} />,
  equipes:           (u) => <BOEquipes user={u} />,
  depots:            (u) => <BODepots user={u} />,
  database:          (u) => <BODatabase user={u} />,
  marketplace:       (u) => <BOMarketplace user={u} />,
  moteur_commercial: (_u) => <BOMoteurCommercialV3 />,
  pa_historique:     (_u) => <BOPaHistoriqueV3 />,
  gestion_pa:        (u)  => <BOGestionPA user={u} />,
  gifts_v3:          (_u) => <BOGiftsV3 />,
  loterie:           (u)  => <BOLoterie user={u} />,
  cutoffs_v3:        (u)  => <BOCutoffsV3 currentUserId={u.id} />,
  feedbacks_v3:      (u) => <FeedbackPanel user={u} />,
  commandes_unifiees:  (u) => <BOCommandesUnifiees user={u} />,
  alertes_clients:     (u) => <BOAlertesClients user={u} />,
  category_pricing:  (u) => <BOCategoryPricing user={u} />,
  echelons_client:   (u) => <BOEchelonsClient user={u} />,
  documents:         (u) => <BODocuments user={u} />,
  liens_externes:    (u)  => <BOExternalLinks user={u} />,
  demandes_comptes:  (u) => <BODemandesComptes user={u} />,
  web_integration:   (u) => <BOWebIntegration user={u} />,
  journal_activite:  (u) => <BOJournalActivite user={u} />,
  settings:          (u) => <BOSettings user={u} />,
  gsheets:           (u) => <BOGoogleSheets user={u} />,
  comptes_externes:  (u) => <BOComptesExternes user={u} />,
  prospection:       (u) => <BOProspection user={u} />,
  credit_fournisseur:(u) => <BOCreditFournisseur user={u} />,
  agents_ia:         (u) => <AgentsIAPanel user={u} initialAgent="ashel" />,
  gps_tracker:       (u) => <BOGPSTracker user={u} />,
  feedback:          (u) => <FeedbackPanel user={u} />,
  trip_charges:      (_u) => <TripChargesPanel />,
  caisses_vides:     (_u) => <CaissesVidesPanel />,
  analyse_achat:       (_u) => <AnalyseAchatPanel />,
  temps_achat:         (_u) => <AnalyseTempsAchat />,
  shop_analytics:      (_u) => <BOShopAnalytics />,
  promo_codes:         (_u) => <BOPromoCodes />,
  caisse_acheteur:     (_u) => <AnalyseCaisseAcheteur />,
  analyse_credit:      (_u) => <BOAnalyseCredit />,
  roles_permissions:   (u) => <BORolesPermissionsHub user={u} />,
  rapport_marche:      (_u) => <BORapportMarche />,
  analyse_reception:   (_u) => <AnalyseReceptionPanel />,
  shelf_life:          (_u) => <ShelfLifePanel />,
  forecast:            (_u) => <ForecastPanel />,
  camera_perms:      (u) => <CameraPermissionsPanel currentUser={u} />,
  cutoffs:           (u)  => <BOCutoffsV3 currentUserId={u.id} />,
  deploy_guide:      (_u) => <DeployGuidePanel />,
  rh_productivite:   (u) => <BOResources user={u} />,
  rh_comptabilite:   (u) => <BOComptabiliteRH user={u} />,
  intelligence_prix: (u) => <BOIntelligencePrix user={u} />,
  concurrence: (u) => <BOConcurrence user={u} />,
  pricing_concurrent: (u) => <BOPricingConcurrence user={u} />,
  cout_livraison: (_u) => <BOCoutLivraison />,
  bon_livraison:     (u) => <BOBonLivraison user={u} />,
  hr_documents:          (u) => <BOHRDocuments user={u} />,
  loyalty:               (u) => <BOLoyalty user={u} />,
  performance_incentives:(u) => <BOPerformanceIncentives user={u} />,
  template_editor:       (u) => <BOTemplateEditor user={u} />,
  investissement:        (u) => <BOInvestisseurDashboard user={u} />,
  finance_cdg:          (u) => <BOFinanceControlGestion user={u} />,
  sourcing:              (u)  => <BOSourcing user={u} />,
  pricing:               (u)  => <BOPricing  user={u} />,
  device_access:         (u)  => <BODeviceAccess user={u} />,
  mobile_gestion:        (u)  => <BOMobileGestion user={u} />,
  import_externe:        (_u) => <BOImportExterne />,
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

interface Props { user: User; onLogout: () => void }

export default function BackOfficeLayout({ user, onLogout }: Props) {
  const lang = useLang()
  const [activeTab, setActiveTab]       = useState<Tab>("dashboard")
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [isOnline, setIsOnline]         = useState(true)
  const [sbStatus, setSbStatus]         = useState<"checking" | "connected" | "error">("checking")
  const [syncRunning, setSyncRunning]   = useState(false)
  const [syncDone, setSyncDone]         = useState(false)
  const [showProfil, setShowProfil]     = useState(false)
  const [profilPhoto, setProfilPhoto]   = useState(user.photoUrl ?? "")
  const [navSearch, setNavSearch]       = useState("")
  const [companyBrand, setCompanyBrand] = useState(() => store.getCompanyConfig())
  const isDemo           = isDemoUser(user)

  // Re-read company brand whenever settings are saved
  useEffect(() => {
    const reload = () => setCompanyBrand(store.getCompanyConfig())
    window.addEventListener("fl_company_updated", reload)
    return () => window.removeEventListener("fl_company_updated", reload)
  }, [])
  const isJawad          = user.id === JAWAD_ID || isSuperSuperAdmin(user)
  const isSuperAdmin     = user.role === "super_super_admin" || user.role === "super_admin" || user.role === "admin"
  const isStrictSuperAdmin = user.role === "super_super_admin" || user.role === "super_admin"
  const isAdminOrAbove   = user.role === "super_super_admin" || user.role === "super_admin" || user.role === "admin"

  // Supabase connectivity check
  useEffect(() => {
    let cancelled = false

    // Écouter les events du LiveSyncProvider (JSONB v3)
    const onStatus = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (!cancelled) setSbStatus(detail === "connected" ? "connected" : "error")
    }
    window.addEventListener("fl_supabase_status", onStatus)

    // Ping actif au démarrage et toutes les 60s. Cible fl_notices (accès anon
    // explicitement accordé, cf. migration 0001) et NON fl_clients : depuis le
    // durcissement RLS, anon/authenticated n'ont plus aucun accès à fl_clients,
    // donc ce ping échouait systématiquement — "DB offline" s'affichait en
    // permanence même quand Supabase était parfaitement joignable.
    async function ping() {
      try {
        const { createClient } = await import("@/lib/supabase/client")
        const sb = createClient()
        const { error } = await sb.from("fl_notices").select("id").limit(1)
        if (!cancelled) setSbStatus(error ? "error" : "connected")
      } catch {
        if (!cancelled) setSbStatus("error")
      }
    }
    ping()
    const timer = setInterval(ping, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener("fl_supabase_status", onStatus)
    }
  }, [])

  // Online / offline detection
  useEffect(() => {
    setIsOnline(navigator.onLine)
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off) }
  }, [])

  // Close sidebar on ESC
  useEffect(() => {
    if (!sidebarOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false) }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [sidebarOpen])

  // ── Écouter les actions globales super admin (force logout / reload) ──
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "fl_force_logout" && e.newValue) {
        // Ne pas déconnecter le super_super_admin lui-même
        if (!isSuperSuperAdmin(user)) {
          store.logout()
          onLogout()
        }
      }
      if (e.key === "fl_force_reload" && e.newValue) {
        window.location.reload()
      }
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [user, onLogout])

  const isVisible = useCallback((item: NavItem): boolean => {
    // Super Administrateur voit TOUT
    if (user.role === "super_super_admin") return true
    // Réservé au super super admin uniquement (ex: Droits Caméra)
    if (item.superOnly) return false
    if (!item.permKey) return true
    // Investisseur dashboard — permission spéciale super confidentielle
    if (item.permKey === "canViewInvestisseur") return (user as unknown as Record<string,unknown>)["canViewInvestisseur"] === true
    // database / settings / gsheets / users (canViewDatabase): only admin + super_admin
    if (item.permKey === "canViewDatabase") return isAdminOrAbove
    // All other permKeys: super_admin + admin bypass, others check their flag
    if (isSuperAdmin) return true
    return (user as unknown as Record<string, unknown>)[item.permKey as string] === true
  }, [isSuperAdmin, isAdminOrAbove, user])

  const navigate = useCallback((tab: Tab) => {
    setActiveTab(tab)
    setSidebarOpen(false)
  }, [])

  const allItems   = NAV_GROUPS.flatMap(g => g.items)
  const activeItem = allItems.find(i => i.id === activeTab)

  // Filter nav by search
  const searchQ = navSearch.toLowerCase().trim()
  const filteredGroups = NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(item =>
      isVisible(item) && (
        !searchQ ||
        (item.label ?? "").toLowerCase().includes(searchQ) ||
        item.labelAr?.includes(navSearch)
      )
    )
  })).filter(g => g.items.length > 0)

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden font-sans bg-muted text-foreground">

      {isAdminOrAbove && <BONotifications navigate={navigate} />}

      {/* Desktop sidebar — collapsible */}
      <div className={`hidden lg:flex flex-col shrink-0 transition-all duration-300 ${sidebarCollapsed ? "w-16" : "w-60"}`}>
        <SidebarContent
          user={user}
          activeTab={activeTab}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          profilPhoto={profilPhoto}
          navSearch={navSearch}
          setNavSearch={setNavSearch}
          filteredGroups={filteredGroups}
          searchQ={searchQ}
          navigate={navigate}
          onLogout={onLogout}
          onOpenProfil={() => setShowProfil(true)}
          appName={companyBrand.appName || "FreshLink Pro"}
          appSlogan={companyBrand.appSlogan || companyBrand.nom || "Vita Fresh"}
          appLogo={companyBrand.logo || ""}
          lang={lang}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Drawer */}
          <div className="w-60 shrink-0 shadow-2xl">
            <SidebarContent
              user={user}
              activeTab={activeTab}
              sidebarCollapsed={sidebarCollapsed}
              setSidebarCollapsed={setSidebarCollapsed}
              profilPhoto={profilPhoto}
              navSearch={navSearch}
              setNavSearch={setNavSearch}
              filteredGroups={filteredGroups}
              searchQ={searchQ}
                  navigate={navigate}
              onLogout={onLogout}
              onOpenProfil={() => setShowProfil(true)}
              appName={companyBrand.appName || "FreshLink Pro"}
              appSlogan={companyBrand.appSlogan || companyBrand.nom || "Vita Fresh"}
              appLogo={companyBrand.logo || ""}
              lang={lang}
            />
          </div>
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/60 backdrop-blur-[2px]"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* ── Topbar ─────────────────────────────────────── */}
        <header className="flex items-center justify-between px-4 lg:px-5 py-3 shrink-0 gap-3 bg-white border-b border-border shadow-sm">

          {/* Left: hamburger + breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors shrink-0"
              aria-label="Ouvrir le menu">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground hidden sm:inline font-medium">
                  {(() => { const g = NAV_GROUPS.find(g => g.items.some(i => i.id === activeTab)); return g ? getGroupLabel(g.label, lang) : "Dashboard" })()}
                </span>
                <svg className="w-3 h-3 text-muted-foreground hidden sm:block shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <h1 className="text-sm font-bold text-foreground truncate">
                  {activeItem ? getNavLabel(activeItem.id, activeItem.label, activeItem.labelAr, lang) : "Tableau de bord"}
                </h1>
              </div>
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                {new Date().toLocaleDateString("fr-MA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>

          {/* Right: status chips + user */}
          <div className="flex items-center gap-2 shrink-0">

            {/* Language switcher */}
            <LangSwitcher />

            {/* Online / Offline */}
            <div className={[
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border",
              isOnline
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-red-50 border-red-200 text-red-700"
            ].join(" ")}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
              <span className="hidden sm:inline">{isOnline ? "En ligne" : "Hors ligne"}</span>
            </div>

            {/* Supabase status — cliquable pour déclencher la sync */}
            <button
              onClick={async () => {
                if (syncRunning) return
                setSyncRunning(true)
                setSyncDone(false)
                try {
                  const { resetSync, runFullSync } = await import("@/lib/supabase/syncManager")
                  resetSync()
                  await runFullSync(() => {})
                  setSyncDone(true)
                  setTimeout(() => setSyncDone(false), 3000)
                } catch { /* offline */ }
                setSyncRunning(false)
              }}
              disabled={syncRunning}
              title="Cliquer pour synchroniser les données → Supabase"
              className={[
                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all",
                syncDone      ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                : syncRunning ? "bg-emerald-50 border-emerald-200 text-emerald-600"
                : sbStatus === "connected" ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                : sbStatus === "error"     ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
                                           : "bg-muted border-border text-muted-foreground"
              ].join(" ")}>
              {syncRunning ? (
                <svg className="w-3 h-3 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              ) : syncDone ? (
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                </svg>
              ) : (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  sbStatus === "connected" ? "bg-emerald-500 animate-pulse"
                  : sbStatus === "error"   ? "bg-rose-500"
                                           : "bg-slate-400 animate-pulse"
                }`} />
              )}
              <span className="hidden sm:inline">
                {syncRunning ? "Sync..." : syncDone ? "Sync OK" : sbStatus === "connected" ? "Supabase" : sbStatus === "error" ? "DB offline" : "DB..."}
              </span>
            </button>

            {/* Jawad crown badge */}
            {isJawad && (
              <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-yellow-50 border border-yellow-400 text-yellow-700 shadow-sm shadow-yellow-200">
                <svg className="w-3.5 h-3.5 fill-yellow-500" viewBox="0 0 24 24">
                  <path d="M2 19h20l-2-10-5 5-3-8-3 8-5-5z" />
                </svg>
                Super Jawad
              </div>
            )}

            {/* Demo badge */}
            {isDemo && (
              <div className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-700">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                Demo
              </div>
            )}

            {/* Avatar + name */}
            <button
              onClick={() => setShowProfil(true)}
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border border-border bg-muted hover:bg-muted transition-colors">
              {profilPhoto ? (
                <img src={profilPhoto} alt={user.name} className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${ROLE_COLORS[user.role]}`}>
                  {user.name[0]?.toUpperCase()}
                </div>
              )}
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-foreground leading-none">{user.name}</p>
                <p className="text-[10px] text-muted-foreground">{ROLE_LABELS[user.role]}</p>
              </div>
            </button>

            {/* Theme toggle (Phase 9) */}
            <ThemeToggle compact />

            {/* Logout */}
            <button
              onClick={onLogout}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Deconnexion
            </button>
          </div>
        </header>

        {/* Jawad banner — accès Super Admin */}
        {isJawad && (
          <DismissibleBanner
            id="bo-jawad"
            icon={<svg className="fill-amber-500" viewBox="0 0 24 24"><path d="M2 19h20l-2-10-5 5-3-8-3 8-5-5z" /></svg>}
          >
            <span className="font-semibold">Super Admin</span>
          </DismissibleBanner>
        )}

        {/* Demo banner */}
        {isDemo && (
          <DismissibleBanner
            id="bo-demo"
            icon={
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          >
            <strong>Compte Demo</strong> — Modifications sauvegardees localement uniquement.{" "}
            <span className="opacity-60">حساب تجريبي — التعديلات محلية فقط</span>
          </DismissibleBanner>
        )}



        {/* ── Content ────────────────────────────────────── */}
        <main className="flex-1 overflow-auto bg-muted">
          <div className="p-4 lg:p-6 min-h-full">
            <PanelErrorBoundary key={activeTab} label={allItems.find(i => i.id === activeTab)?.label ?? activeTab}>
              {PANELS[activeTab]?.(user, setActiveTab) ?? (
                <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
                  Section non disponible
                </div>
              )}
            </PanelErrorBoundary>
          </div>
        </main>

        {/* Appels audio in-app (WebRTC) — sonne quel que soit l'onglet ouvert */}
        <CallCenter user={user} />

        {/* ── Footer ─────────────────────────────────────── */}
        <footer className="shrink-0 border-t border-border bg-white px-4 py-2 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[11px] text-muted-foreground">
            &copy; 2026{" "}
            <span className="font-black" style={{ color: "#1a4f2a" }}>
              Vita<span style={{ color: "#b8962e" }}>Fresh</span>
            </span>
            {" "}&mdash;{" "}
            <span className="font-bold" style={{ color: "#1a4f2a" }}>Fresh Link Pro</span>
          </p>
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1 text-[10px] font-semibold" style={{ color: "#6b7280" }}>
              ⚡ Powered by{" "}
              <span className="font-black" style={{ color: "#1a4f2a" }}>Vita tech</span>
            </span>
          </div>
        </footer>
      </div>

      {/* ── Profil modal ──────────────────────────────────── */}
      {showProfil && (
        <ProfilModal
          user={user}
          profilPhoto={profilPhoto}
          setProfilPhoto={setProfilPhoto}
          onClose={() => setShowProfil(false)}
          canUseCamera={isStrictSuperAdmin}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR CONTENT COMPONENT — extracted to avoid remount on every render
// ─────────────────────────────────────────────────────────────

interface SidebarContentProps {
  user: User
  activeTab: Tab
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean) => void
  profilPhoto: string
  navSearch: string
  setNavSearch: (v: string) => void
  filteredGroups: Array<{ label: string; labelAr: string; items: NavItem[] }>
  searchQ: string
  navigate: (t: Tab) => void
  onLogout: () => void
  onOpenProfil: () => void
  appName: string
  appSlogan: string
  appLogo: string
  lang: AppLang
}

function SidebarContent({
  user, activeTab, sidebarCollapsed, setSidebarCollapsed,
  profilPhoto, navSearch, setNavSearch, filteredGroups, searchQ,
  navigate, onLogout, onOpenProfil,
  appName, appSlogan, appLogo, lang,
}: SidebarContentProps) {
  const BG = "#0d2218"
  const BG2 = "#1a4f2a"
  const ACTIVE = "#22c55e"

  // Groupes (grandes rubriques) repliés — liste déroulable, persistée pour
  // la session courante (remise à zéro — tout replié — à chaque reconnexion,
  // voir store.logout()). Comportement accordéon : ouvrir une rubrique (ou
  // naviguer vers l'un de ses éléments) replie automatiquement les autres.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set()
    try {
      const saved = localStorage.getItem("fl_nav_collapsed")
      if (saved != null) return new Set(JSON.parse(saved) as string[])
    } catch { /* noop */ }
    return new Set(filteredGroups.map(g => g.label))
  })
  const persistCollapsed = (next: Set<string>) => {
    try { localStorage.setItem("fl_nav_collapsed", JSON.stringify([...next])) } catch { /* noop */ }
  }
  const toggleGroup = (label: string) => setCollapsedGroups(prev => {
    const isCollapsing = !prev.has(label)
    // Ouvrir `label` replie les autres ; le replier n'affecte que lui-même.
    const next = isCollapsing
      ? new Set(prev).add(label)
      : new Set(filteredGroups.map(g => g.label).filter(l => l !== label))
    persistCollapsed(next)
    return next
  })
  const collapseAllExcept = (label: string) => {
    const next = new Set(filteredGroups.map(g => g.label).filter(l => l !== label))
    persistCollapsed(next)
    setCollapsedGroups(next)
  }

  return (
    <aside className="flex flex-col h-full" style={{ background: BG, color: "#d1fae5" }}>

      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: "#1a4f2a" }}>
        <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border-2 shadow-lg" style={{ borderColor: "#22c55e" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={appLogo || "/vita-fresh-logo.png"} alt={appName} className="w-full h-full object-contain p-0.5 bg-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <p className="font-black text-sm leading-tight text-white truncate">
              <span style={{ color: "#d1fae5" }}>FRESHLINK </span>
              <span style={{ color: "#4ade80" }}>PRO</span>
            </p>
            <p className="text-[10px] font-bold truncate" style={{ color: "#6ee7b7" }}>{appSlogan || "Vita Fresh"}</p>
          </div>
        )}
      </div>

      {/* Search bar */}
      {!sidebarCollapsed && (
        <div className="px-3 pt-3 pb-1">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "#6ee7b7" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" value={navSearch} onChange={e => setNavSearch(e.target.value)}
              placeholder="Rechercher..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs focus:outline-none transition-all"
              style={{ background: BG2, color: "#d1fae5", border: "1px solid #22c55e33" }}
            />
            {navSearch && (
              <button onClick={() => setNavSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "#6ee7b7" }}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 thin-scroll" style={{ scrollbarColor: "#1a4f2a transparent" }}>
        {filteredGroups.map(group => {
          const isGroupCollapsed = collapsedGroups.has(group.label) && !searchQ
          return (
          <div key={group.label} className="mb-2">
            {!sidebarCollapsed && !searchQ && (
              <button onClick={() => toggleGroup(group.label)}
                className="w-full flex items-center justify-between px-3 pt-3 pb-1 group/hdr"
                title={isGroupCollapsed ? "Dérouler" : "Replier"}>
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#4ade80", opacity: 0.7 }}>
                  {getGroupLabel(group.label, lang)}
                </span>
                <svg className={`w-3 h-3 transition-transform duration-200 ${isGroupCollapsed ? "" : "rotate-90"}`}
                  style={{ color: "#4ade80", opacity: 0.7 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            {!isGroupCollapsed && group.items.map(item => {
              const isActive = activeTab === item.id
              const itemLabel = getNavLabel(item.id, item.label, item.labelAr, lang)
              return (
                <button
                  key={item.id}
                  onClick={() => { navigate(item.id); setNavSearch(""); collapseAllExcept(group.label) }}
                  title={sidebarCollapsed ? itemLabel : undefined}
                  className={[
                    "w-full flex items-center gap-3 rounded-xl text-sm transition-all duration-150 group mb-0.5",
                    sidebarCollapsed ? "justify-center p-2.5" : "px-3 py-2.5",
                  ].join(" ")}
                  style={isActive
                    ? { background: ACTIVE, color: "#052e16" }
                    : { color: "#bbf7d0" }
                  }
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = BG2 }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "transparent" }}
                >
                  <span className={`shrink-0 ${isActive ? "opacity-100" : "opacity-80"}`} style={{ color: isActive ? "#052e16" : "#4ade80" }}>
                    {item.icon}
                  </span>
                  {!sidebarCollapsed && (
                    <>
                      <span className="flex-1 truncate text-left text-[13px] font-semibold">{itemLabel}</span>
                      {item.badge ? (
                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#052e16", color: ACTIVE }}>
                          {item.badge}
                        </span>
                      ) : isActive ? (
                        <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#052e16" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      ) : null}
                    </>
                  )}
                </button>
              )
            })}
          </div>
          )
        })}
        {searchQ && filteredGroups.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8" style={{ color: "#4ade80", opacity: 0.5 }}>
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs">Aucun résultat</p>
          </div>
        )}
      </nav>

      {/* Collapse toggle */}
      <div className="px-2 py-2 border-t hidden lg:block" style={{ borderColor: BG2 }}>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl transition-all text-xs"
          style={{ color: "#4ade80" }}
          onMouseEnter={e => (e.currentTarget.style.background = BG2)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          <svg className={`w-4 h-4 transition-transform ${sidebarCollapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          {!sidebarCollapsed && <span>Réduire</span>}
        </button>
      </div>

      {/* User footer */}
      <div className="px-2 py-3 border-t" style={{ borderColor: BG2 }}>
        {/* Settings + Logout quick buttons */}
        {!sidebarCollapsed && (
          <div className="flex gap-1 mb-2">
            <button onClick={() => navigate("settings")} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ color: "#6ee7b7" }}
              onMouseEnter={e => (e.currentTarget.style.background = BG2)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Paramètres
            </button>
            <button onClick={onLogout} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all"
              style={{ color: "#fca5a5" }}
              onMouseEnter={e => { (e.currentTarget.style.background = "#450a0a"); (e.currentTarget.style.color = "#f87171") }}
              onMouseLeave={e => { (e.currentTarget.style.background = "transparent"); (e.currentTarget.style.color = "#fca5a5") }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Déconnexion
            </button>
          </div>
        )}
        <div
          className="w-full flex items-center gap-2.5 rounded-xl transition-colors cursor-pointer"
          style={{ padding: sidebarCollapsed ? "8px" : "8px 12px" }}
          onClick={onOpenProfil}
          onMouseEnter={e => (e.currentTarget.style.background = BG2)}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          role="button" tabIndex={0}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onOpenProfil() }}
        >
          {profilPhoto ? (
            <img src={profilPhoto} alt={user.name} className="w-8 h-8 rounded-full object-cover border-2 shrink-0" style={{ borderColor: ACTIVE }} />
          ) : (
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0" style={{ background: ACTIVE, color: "#052e16" }}>
              {user.name[0]?.toUpperCase()}
            </div>
          )}
          {!sidebarCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate text-white">{user.name}</p>
              <p className="text-[10px] truncate" style={{ color: "#6ee7b7" }}>{ROLE_LABELS[user.role]}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
function TabPill({ id, activeTab, navigate, label }: {
  id: Tab; activeTab: Tab; navigate: (t: Tab) => void; label: string
}) {
  const isActive = activeTab === id
  return (
    <button
      onClick={() => navigate(id)}
      className={[
        "shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap",
        isActive
          ? "bg-blue-600 text-white shadow-sm"
          : "bg-white text-muted-foreground hover:bg-muted hover:text-foreground border border-border",
      ].join(" ")}
    >
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// PROFIL MODAL — self-edit : password, email ; Jawad : permissions
// ─────────────────────────────────────────────────────────────

function ProfilModal({ user, profilPhoto, setProfilPhoto, onClose, canUseCamera }: {
  user: User
  profilPhoto: string
  setProfilPhoto: (url: string) => void
  onClose: () => void
  canUseCamera: boolean
}) {
  const isJawad = isSuperSuperAdmin(user)

  const PERM_KEYS: (keyof User)[] = [
    "canViewAchat","canViewCommercial","canViewLogistique",
    "canViewStock","canViewCash","canViewFinance","canViewRecap","canViewDatabase","canViewRH","canViewExternal","canViewInvestisseur",
  ]
  const PERM_MAP: Partial<Record<keyof User, string>> = {
    canViewAchat: "Achats", canViewCommercial: "Commercial",
    canViewLogistique: "Logistique", canViewStock: "Stock",
    canViewCash: "Cash", canViewFinance: "Finance",
    canViewRecap: "Récap", canViewDatabase: "Base données",
    canViewRH: "RH", canViewExternal: "Clients/Fourn.", canViewInvestisseur: "Investisseur",
  }

  // ── Edit mode state ──
  const [editMode, setEditMode]       = useState(false)
  const [editEmail, setEditEmail]     = useState(user.email)
  const [editPwd1, setEditPwd1]       = useState("")
  const [editPwd2, setEditPwd2]       = useState("")
  const [editPerms, setEditPerms]     = useState<Partial<Record<keyof User, boolean>>>(
    Object.fromEntries(PERM_KEYS.map(k => [k, !!(user as unknown as Record<string,unknown>)[k as string]])) as Partial<Record<keyof User, boolean>>
  )
  const [saveMsg, setSaveMsg]         = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving]           = useState(false)

  const handleSave = () => {
    setSaveMsg(null)
    if (editPwd1 && editPwd1.length < 6) { setSaveMsg({ ok: false, text: "Mot de passe : minimum 6 caractères" }); return }
    if (editPwd1 && editPwd1 !== editPwd2) { setSaveMsg({ ok: false, text: "Les mots de passe ne correspondent pas" }); return }
    if (!editEmail.includes("@")) { setSaveMsg({ ok: false, text: "Email invalide" }); return }
    setSaving(true)
    const users = store.getUsers()
    const idx = users.findIndex(u => u.id === user.id)
    if (idx >= 0) {
      users[idx] = {
        ...users[idx],
        email: editEmail.trim(),
        ...(editPwd1 ? { password: editPwd1 } : {}),
        // Jawad peut aussi modifier ses propres permissions
        ...(isJawad ? Object.fromEntries(PERM_KEYS.map(k => [k, editPerms[k] ?? false])) : {}),
      }
      store.saveUsers(users)
    }
    setSaving(false)
    setSaveMsg({ ok: true, text: "✅ Modifications enregistrées — rechargement en cours…" })
    // Reload après 1.5s pour prendre en compte les nouveaux droits
    setTimeout(() => window.location.reload(), 1500)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-sm flex flex-col overflow-hidden animate-scale-in">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-muted border-b border-border">
          <h2 className="font-bold text-sm text-foreground">Mon Profil / ملفي الشخصي</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => { setEditMode(v => !v); setSaveMsg(null) }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${editMode ? "bg-muted text-foreground" : "bg-green-100 text-green-700 hover:bg-green-200"}`}>
              {editMode ? "Annuler" : "✏️ Modifier"}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto max-h-[82vh]">

          {/* Avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {profilPhoto ? (
                <img src={profilPhoto} alt={user.name} className="w-20 h-20 rounded-full object-cover border-4 border-primary shadow-lg" />
              ) : (
                <div className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black text-white border-4 border-border shadow-md ${ROLE_COLORS[user.role]}`}>
                  {user.name[0]?.toUpperCase()}
                </div>
              )}
              {canUseCamera && (
                <label className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center cursor-pointer shadow border-2 border-card hover:opacity-90 transition-opacity">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]; if (!file) return
                      const reader = new FileReader()
                      reader.onload = ev => {
                        const url = ev.target?.result as string
                        setProfilPhoto(url)
                        const users = store.getUsers(); const idx = users.findIndex(u => u.id === user.id)
                        if (idx >= 0) { users[idx] = { ...users[idx], photoUrl: url }; store.saveUsers(users) }
                      }
                      reader.readAsDataURL(file)
                    }} />
                </label>
              )}
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-foreground">{user.name}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              {isJawad && <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-bold border border-yellow-300">👑 Super Admin</span>}
            </div>
          </div>

          <AppDownloadQR />

          {/* ── Edit mode form ── */}
          {editMode ? (
            <div className="flex flex-col gap-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 font-medium">
                ✏️ Modifiez vos informations ci-dessous. Laissez le mot de passe vide pour le conserver.
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-muted-foreground">Email</label>
                <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-muted-foreground">Nouveau mot de passe <span className="text-muted-foreground font-normal">(laisser vide = inchangé)</span></label>
                <input type="password" value={editPwd1} onChange={e => setEditPwd1(e.target.value)}
                  placeholder="Min. 6 caractères"
                  className="px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-bold text-muted-foreground">Confirmer le mot de passe</label>
                <input type="password" value={editPwd2} onChange={e => setEditPwd2(e.target.value)}
                  placeholder="Répétez le mot de passe"
                  className="px-3 py-2 rounded-xl border border-border text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              </div>

              {/* ── Super admin can also modify own permissions ── */}
              {isJawad && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-muted-foreground">Mes permissions / صلاحياتي</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PERM_KEYS.map(k => (
                      <label key={k} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border cursor-pointer hover:bg-muted text-xs">
                        <input type="checkbox" checked={!!editPerms[k]}
                          onChange={e => setEditPerms(prev => ({ ...prev, [k]: e.target.checked }))}
                          className="accent-green-600 w-3.5 h-3.5 shrink-0" />
                        <span className="truncate font-medium">{PERM_MAP[k]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {saveMsg && (
                <div className={`px-3 py-2 rounded-xl text-xs font-medium border ${saveMsg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"}`}>
                  {saveMsg.text}
                </div>
              )}

              <button onClick={handleSave} disabled={saving}
                className="w-full py-2.5 rounded-xl font-bold text-sm text-white transition-colors disabled:opacity-60"
                style={{ background: "#1a4f2a" }}>
                {saving ? "Enregistrement…" : "💾 Enregistrer les modifications"}
              </button>
            </div>
          ) : (
            <>
              {/* Info grid — lecture seule */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-muted/40 border border-border p-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Rôle</p>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full text-white inline-block ${ROLE_COLORS[user.role]}`}>
                    {ROLE_LABELS[user.role]}
                  </span>
                </div>
                <div className="rounded-xl bg-muted/40 border border-border p-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">Accès</p>
                  <p className="text-sm font-semibold text-foreground capitalize">{user.accessType ?? "standard"}</p>
                </div>
                {user.secteur && (
                  <div className="col-span-2 rounded-xl bg-muted/40 border border-border p-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Secteur</p>
                    <p className="text-sm font-semibold text-foreground">{user.secteur}</p>
                  </div>
                )}
                <div className="col-span-2 rounded-xl bg-muted/40 border border-border p-3">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">ID</p>
                  <p className="text-xs font-mono text-muted-foreground">{user.id}</p>
                </div>
              </div>

              {/* Permissions */}
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Permissions actives</p>
                <div className="flex flex-wrap gap-1.5">
                  {PERM_KEYS.filter(k => user[k as keyof User]).map(k => (
                    <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold border border-primary/20">
                      {PERM_MAP[k]}
                    </span>
                  ))}
                  {PERM_KEYS.filter(k => user[k as keyof User]).length === 0 && (
                    <span className="text-xs text-muted-foreground">Accès global (rôle admin)</span>
                  )}
                </div>
              </div>

              <button onClick={onClose}
                className="w-full py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-95"
                style={{ background: "#1a4f2a", color: "white" }}>
                Fermer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
