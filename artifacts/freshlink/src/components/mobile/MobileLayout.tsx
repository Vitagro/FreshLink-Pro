"use client"

import { useState, useEffect, Suspense, lazy } from "react"
import { store, type User, type UserRole, ROLE_LABELS, ROLE_COLORS, isDemoUser } from "@/lib/store"
import { useLang } from "@/lib/i18n"
// Lazy : chaque rôle n'utilise qu'un sous-ensemble de ces écrans (gérés par
// resolvedTab, un seul monté à la fois) — les charger statiquement forçait
// tous les rôles à télécharger le JS de tous les autres rôles au premier
// chargement de l'app (ex: un acheteur téléchargeait aussi Commercial,
// Logistique, Contrôles...). CallCenter reste statique : toujours monté
// (écoute des appels entrants indépendamment de l'onglet actif).
const MobileAchat            = lazy(() => import("./MobileAchat"))
const MobileCommercial       = lazy(() => import("./MobileCommercial"))
const MobileLogistique       = lazy(() => import("./MobileLogistique"))
const MessagerieChannel      = lazy(() => import("../MessagerieChannel"))
import CallCenter from "../CallCenter"
const MobileObjectifs        = lazy(() => import("./MobileObjectifs"))
const MobilePreparation      = lazy(() => import("./MobilePreparation"))
const MobileControlAchat     = lazy(() => import("./MobileControlAchat"))
const MobileControlPrep      = lazy(() => import("./MobileControlPrep"))
const MobileControlRetour    = lazy(() => import("./MobileControlRetour"))
const MobileAgentIA          = lazy(() => import("./MobileAgentIA"))
const MobileFeedback         = lazy(() => import("./MobileFeedback"))
const MobileMagasinier       = lazy(() => import("./MobileMagasinier"))
import FreshLinkLogo from "@/components/ui/FreshLinkLogo"
import LangSwitcher from "@/components/ui/LangSwitcher"
import ThemeToggle from "@/components/ui/ThemeToggle"
const MobilePricing          = lazy(() => import("./MobilePricing"))
const MobileBLValidation     = lazy(() => import("./MobileBLValidation"))
const MobileAlertes          = lazy(() => import("./MobileAlertes"))
const MobileChargesAcheteur  = lazy(() => import("./MobileChargesAcheteur"))
const MobileClientPortail    = lazy(() => import("./MobileClientPortail"))
const MobileFournisseurPortail = lazy(() => import("./MobileFournisseurPortail"))
import RoleSwitcher from "@/components/ui/RoleSwitcher"
import MobileAutoTranslate from "./MobileAutoTranslate"
import DismissibleBanner from "@/components/ui/DismissibleBanner"

interface Props {
  user: User
  onLogout: () => void
}

type MobileTab =
  | "achat" | "charges" | "commercial" | "logistique" | "bilan"
  | "preparation" | "ctrl_achat" | "ctrl_prep" | "ctrl_retour"
  | "agent_ia" | "avis" | "magasinier" | "pricing" | "bl_validation" | "alertes"
  | "client_portail" | "fournisseur_portail" | "messages"

export default function MobileLayout({ user: initialUser, onLogout }: Props) {
  const lang = useLang()
  const [isOnline, setIsOnline] = useState(true)
  // Local user state so role-switch re-renders the layout instantly
  const [user, setUser] = useState<User>(initialUser)
  const isDemo = isDemoUser(user)
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const on  = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener("online", on)
    window.addEventListener("offline", off)
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off) }
  }, [])

  // Un toggle BO (ex: "Photo achat obligatoire") doit être prioritaire côté
  // mobile sans que l'utilisateur ait à se déconnecter/reconnecter — l'app
  // reste ouverte des heures sur le terrain. Rafraîchit process/workflow/
  // alertes/email config toutes les 2 min tant que la session est active.
  useEffect(() => {
    const tick = () => { import("@/lib/supabase/db").then(({ hydrateConfigs }) => hydrateConfigs()).catch(() => {}) }
    const t = setInterval(tick, 120_000)
    return () => clearInterval(t)
  }, [])

  // ── Active role (supports multi-role) ──────────────────────────────────────
  const activeRole: UserRole = user.activeRole ?? user.role

  // ── Role → tabs mapping ─────────────────────────────────────────────────────
  const ROLE_TAB_ACCESS: Record<string, MobileTab[]> = {
    acheteur:         ["achat", "charges", "pricing", "agent_ia", "avis"],
    ctrl_achat:       ["ctrl_achat", "agent_ia", "avis"],
    ctrl_prep:        ["ctrl_prep",  "agent_ia", "avis"],
    magasinier:       ["magasinier", "preparation", "ctrl_prep", "agent_ia", "avis"],
    prevendeur:       ["commercial", "pricing", "bilan", "alertes",     "agent_ia", "avis"],
    team_leader:      ["commercial", "pricing", "bilan", "alertes", "ctrl_retour", "agent_ia", "avis"],
    resp_commercial:  ["commercial", "pricing", "bilan", "alertes", "ctrl_retour", "agent_ia", "avis"],
    resp_logistique:  ["logistique", "preparation", "ctrl_prep", "ctrl_retour", "agent_ia", "avis"],
    dispatcheur:      ["logistique", "preparation", "ctrl_prep", "ctrl_retour", "agent_ia", "avis"],
    livreur:          ["bl_validation", "logistique", "ctrl_retour", "agent_ia", "avis"],
    conducteur:       ["bl_validation", "logistique", "ctrl_retour", "agent_ia", "avis"],
    preparateur:      ["preparation", "ctrl_prep", "agent_ia", "avis"],
    client:           ["client_portail",      "avis"],
    fournisseur:      ["fournisseur_portail", "avis"],
  }

  // Tab icon helper
  function T(d: string) {
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
      </svg>
    )
  }

  const allTabs: { id: MobileTab; label: string; labelAr: string; labelEn: string; icon: React.ReactNode }[] = [
    { id: "magasinier",   label: "Reception",  labelAr: "الاستلام",         labelEn: "Receipt",    icon: T("M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4") },
    { id: "achat",        label: "Achat",      labelAr: "الشراء",           labelEn: "Purchase",   icon: T("M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z") },
    { id: "charges",      label: "Charges",    labelAr: "المصاريف",         labelEn: "Charges",    icon: T("M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z") },
    { id: "commercial",   label: "Commande",   labelAr: "الطلبية",          labelEn: "Order",      icon: T("M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2") },
    { id: "logistique",   label: "Livraison",  labelAr: "التوصيل",          labelEn: "Delivery",   icon: T("M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2") },
    { id: "bilan",        label: "Bilan",      labelAr: "ملخصي",            labelEn: "Report",     icon: T("M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z") },
    { id: "preparation",  label: "Prep",       labelAr: "التحضير",          labelEn: "Prep",       icon: T("M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01") },
    { id: "ctrl_achat",   label: "Ctrl Ach",   labelAr: "مراقبة الشراء",    labelEn: "Ctrl Buy",   icon: T("M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z") },
    { id: "ctrl_prep",    label: "Ctrl Prep",  labelAr: "مراقبة التحضير",   labelEn: "Ctrl Prep",  icon: T("M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4") },
    { id: "ctrl_retour",  label: "Retour",     labelAr: "المرتجعات",        labelEn: "Return",     icon: T("M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6") },
    { id: "agent_ia",     label: "IA",         labelAr: "المساعد",          labelEn: "AI",         icon: T("M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.694-1.338 2.694H4.136c-1.368 0-2.337-1.694-1.338-2.694L4 15.3") },
    { id: "avis",         label: "Avis",       labelAr: "تقييم",            labelEn: "Reviews",    icon: T("M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z") },
    { id: "pricing",      label: "Prix",       labelAr: "الأسعار",          labelEn: "Prices",     icon: T("M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z") },
    { id: "bl_validation",label: "Mes BL",     labelAr: "وصولاتي",         labelEn: "My DL",      icon: T("M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4") },
    { id: "alertes",           label: "Alertes",    labelAr: "التنبيهات",        labelEn: "Alerts",     icon: T("M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9") },
    { id: "client_portail",    label: "Mon espace", labelAr: "فضائي",           labelEn: "My Space",   icon: T("M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z") },
    { id: "fournisseur_portail", label: "Portail",  labelAr: "البوابة",         labelEn: "Portal",     icon: T("M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4") },
    { id: "messages",     label: "Messages",   labelAr: "الرسائل",          labelEn: "Messages",   icon: T("M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 21l1.8-4A8.96 8.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z") },
  ]

  // Messagerie d'équipe accessible à tous les rôles mobiles
  const allowedTabIds: MobileTab[] = [...(ROLE_TAB_ACCESS[activeRole] ?? ["achat"]), "messages"]
  const allowedTabs = allTabs.filter(t => allowedTabIds.includes(t.id))
  const [activeTab, setActiveTab] = useState<MobileTab>(allowedTabIds[0] ?? "achat")

  // When role switches, reset to first tab of new role
  function handleRoleSwitch(updatedUser: User, newRole: UserRole) {
    setUser(updatedUser)
    const newTabs = ROLE_TAB_ACCESS[newRole] ?? ["achat"]
    setActiveTab(newTabs[0] ?? "achat")
  }

  // If active tab no longer allowed after role switch, go to first allowed tab
  const currentTabAllowed = allowedTabIds.includes(activeTab)
  const resolvedTab = currentTabAllowed ? activeTab : (allowedTabIds[0] ?? "achat")

  return (
    // h-[100dvh] borne la hauteur → <main> devient une vraie région de scroll
    // (sinon le scroll est saccadé avec la nav fixe). 100dvh gère la barre
    // d'adresse mobile mieux que h-screen.
    <div id="mobile-root" className="h-[100dvh] flex flex-col w-full font-sans bg-slate-50 text-slate-800 overflow-hidden">

      {/* Traduction automatique Darija / English (repli FR pour le reste) */}
      <MobileAutoTranslate rootId="mobile-root" />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="px-4 pt-safe-top pb-3 flex items-center justify-between gap-2 flex-wrap sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: "#1B4332" }}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
              <path d="M12 3 C12 3 19 7 19 13 C19 17.4 16 20 12 20 C8 20 5 17.4 5 13 C5 7 12 3 12 3Z" fill="#4ADE80" opacity="0.9" />
              <path d="M12 20 L12 9" stroke="#1B4332" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M12 15 L15 12" stroke="#1B4332" strokeWidth="1.1" strokeLinecap="round" />
              <path d="M12 17.5 L9 15" stroke="#1B4332" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
          </div>
          <div className="leading-none min-w-0">
            <p className="text-sm font-black leading-tight">
              <span className="text-slate-800">FRESH</span><span className="text-green-600">LINK</span>
              <span className="text-[9px] font-black tracking-widest text-green-700 ml-0.5">PRO</span>
            </p>
            <p className="text-[10px] font-medium text-slate-500 mt-0.5 truncate max-w-[140px]">{user.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-wrap justify-end" data-no-translate>
          {/* Role badge — l'info la plus utile, toujours visible en premier */}
          <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-blue-50 border border-blue-200 text-blue-700">
            {ROLE_LABELS[activeRole]}
          </span>

          {/* Online indicator — juste le point sur mobile, le libellé ne tient pas à côté de tout le reste */}
          <span className={`w-2 h-2 rounded-full shrink-0 ${isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}
            title={isOnline ? "En ligne" : "Hors ligne"} />

          {isDemo && (
            <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-amber-50 border border-amber-200 text-amber-700 hidden sm:inline">
              Demo
            </span>
          )}

          <LangSwitcher compact />
          <ThemeToggle compact />

          <button onClick={onLogout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            aria-label="Deconnexion">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Multi-role switcher (shows only if user has ≥ 2 roles) ────────────── */}
      {user.roles && user.roles.length >= 2 && (
        <div className="flex items-center px-4 py-2 gap-2 bg-white border-b border-slate-100">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Vue&nbsp;:
          </span>
          <RoleSwitcher user={user} onSwitch={handleRoleSwitch} layout="horizontal" />
        </div>
      )}

      {/* Demo banner */}
      {isDemo && (
        <DismissibleBanner
          id="mobile-demo"
          icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        >
          <strong>Demo</strong> — Modifications locales uniquement / التعديلات محلية فقط
        </DismissibleBanner>
      )}

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
        style={{ WebkitOverflowScrolling: "touch", paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
        <Suspense fallback={
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          {resolvedTab === "magasinier"    && <MobileMagasinier user={user} />}
          {resolvedTab === "achat"         && <MobileAchat user={user} />}
          {resolvedTab === "charges"       && <MobileChargesAcheteur user={user} />}
          {resolvedTab === "commercial"    && <MobileCommercial user={user} />}
          {resolvedTab === "logistique"    && <MobileLogistique user={user} />}
          {resolvedTab === "bilan"         && <MobileObjectifs user={user} />}
          {resolvedTab === "preparation"   && <MobilePreparation user={user} />}
          {resolvedTab === "ctrl_achat"    && <MobileControlAchat user={user} />}
          {resolvedTab === "ctrl_prep"     && <MobileControlPrep user={user} />}
          {resolvedTab === "ctrl_retour"   && <MobileControlRetour user={user} />}
          {resolvedTab === "agent_ia"      && <MobileAgentIA user={user} />}
          {resolvedTab === "avis"          && <MobileFeedback user={user} />}
          {resolvedTab === "pricing"       && <MobilePricing user={user} />}
          {resolvedTab === "bl_validation" && <MobileBLValidation user={user} />}
          {resolvedTab === "alertes"             && <MobileAlertes user={user} />}
          {resolvedTab === "client_portail"      && <MobileClientPortail user={user} />}
          {resolvedTab === "fournisseur_portail" && <MobileFournisseurPortail user={user} />}
          {resolvedTab === "messages"            && <div className="p-3"><MessagerieChannel user={user} compact /></div>}
        </Suspense>
      </main>

      {/* Appels audio in-app (WebRTC) — sonne quel que soit l'écran */}
      <CallCenter user={user} />

      {/* ── Bottom nav ──────────────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 w-full z-40 mobile-nav-safe bg-white border-t border-slate-200"
        style={{ boxShadow: "0 -1px 12px rgba(0,0,0,0.07)" }}>
        <div className="flex w-full">
          {allowedTabs.slice(0, allowedTabs.length <= 5 ? 5 : 4).map(tab => {
            const isActive = resolvedTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 min-w-0 transition-colors relative"
              >
                {isActive && (
                  <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-green-600" />
                )}
                <span className={`w-5 h-5 transition-colors ${isActive ? "text-green-700" : "text-slate-400"}`}>
                  {tab.icon}
                </span>
                <span className={`text-[9px] font-semibold truncate max-w-full px-0.5 ${isActive ? "text-green-700" : "text-slate-400"}`}>
                  {(lang as string) === "en" ? tab.labelEn : lang === "ar" ? tab.labelAr : tab.label}
                </span>
              </button>
            )
          })}

          {/* Overflow "Plus" button for roles with many tabs — ouvre un menu
              listant TOUS les onglets caches (l'ancienne version sautait
              toujours vers le 1er onglet cache, rendant les suivants —
              dont Messages, toujours en dernier — inaccessibles). */}
          {allowedTabs.length > 5 && (
            <button
              onClick={() => setShowMoreMenu(true)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 min-w-0 transition-colors relative ${
                allowedTabs.slice(4).some(t => t.id === resolvedTab) ? "text-green-700" : "text-slate-400"
              }`}
            >
              {allowedTabs.slice(4).some(t => t.id === resolvedTab) && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-green-600" />
              )}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01" />
              </svg>
              <span className="text-[9px] font-semibold">Plus</span>
            </button>
          )}
        </div>
      </nav>

      {/* ── Overflow menu : tous les onglets au-dela des 4 affiches ─────────── */}
      {showMoreMenu && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={() => setShowMoreMenu(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative w-full bg-white rounded-t-2xl mobile-nav-safe pb-4 pt-3 px-3" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto mb-3" />
            <div className="grid grid-cols-4 gap-2">
              {allowedTabs.slice(4).map(tab => {
                const isActive = resolvedTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setShowMoreMenu(false) }}
                    className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl transition-colors ${isActive ? "bg-green-50 text-green-700" : "text-slate-500 hover:bg-slate-50"}`}
                  >
                    <span className="w-5 h-5">{tab.icon}</span>
                    <span className="text-[10px] font-semibold truncate max-w-full px-0.5">
                      {(lang as string) === "en" ? tab.labelEn : lang === "ar" ? tab.labelAr : tab.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
