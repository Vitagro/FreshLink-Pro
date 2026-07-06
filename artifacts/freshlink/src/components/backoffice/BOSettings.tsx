"use client"

import { useState, useEffect, useRef } from "react"
import { store, passwordMatches, type EmailConfig, type MotifRetour, type CompanyConfig, type CompanyContacts, type WorkflowConfig, type WorkflowStep, type ContenantTare, DEFAULT_WORKFLOW_STEPS, type ProcessConfig, DEFAULT_PROCESS_CONFIG, type TransportCompany, ROLE_LABELS, type UserRole } from "@/lib/store"
import { useRealtimeSync } from "@/lib/supabase/useRealtimeSync"
import { seedDemoData } from "@/lib/seedData"
// EmailJS retiré — l'envoi d'email passe par Resend (serveur, /api/send-email)
import { createClient } from "@/lib/supabase/client"

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
        <p className="text-sm text-muted-foreground mt-1">Cette section est reservee aux administrateurs.</p>
        <p className="text-xs text-muted-foreground/70 mt-0.5">هذا القسم للمسؤولين فقط</p>
      </div>
    </div>
  )
}

function MonCompteContent({ user, monNom, setMonNom, monPwd, setMonPwd, monPwdConfirm, setMonPwdConfirm, monCompteMsg, setMonCompteMsg }: {
  user: { id: string; name: string; role: string; email?: string; password?: string }
  monNom: string; setMonNom: (v: string) => void
  monPwd: string; setMonPwd: (v: string) => void
  monPwdConfirm: string; setMonPwdConfirm: (v: string) => void
  monCompteMsg: {ok:boolean;text:string}|null; setMonCompteMsg: (v: {ok:boolean;text:string}|null) => void
}) {
  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5 flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-lg shrink-0">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-bold text-slate-900">{user.name}</p>
          <p className="text-xs text-blue-700 mt-0.5">{ROLE_LABELS[user.role as UserRole] ?? user.role} — {user.email ?? ""}</p>
        </div>
      </div>

      {/* Modifier nom */}
      <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
        <h3 className="font-bold text-sm text-foreground">Informations personnelles</h3>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-600">Nom affiché</label>
          <input type="text" value={monNom} onChange={e => setMonNom(e.target.value)}
            className="px-3 py-2.5 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-600">Email (lecture seule)</label>
          <input type="text" value={user.email ?? ""} readOnly
            className="px-3 py-2.5 border border-border rounded-xl text-sm bg-muted text-muted-foreground cursor-not-allowed" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-600">Rôle</label>
          <input type="text" value={ROLE_LABELS[user.role as UserRole] ?? user.role} readOnly
            className="px-3 py-2.5 border border-border rounded-xl text-sm bg-muted text-muted-foreground cursor-not-allowed" />
        </div>
      </div>

      {/* Changer mot de passe */}
      <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
        <h3 className="font-bold text-sm text-foreground">Changer le mot de passe</h3>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-600">Nouveau mot de passe</label>
          <input type="password" value={monPwd} onChange={e => setMonPwd(e.target.value)}
            placeholder="Nouveau mot de passe"
            className="px-3 py-2.5 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-600">Confirmer</label>
          <input type="password" value={monPwdConfirm} onChange={e => setMonPwdConfirm(e.target.value)}
            placeholder="Confirmer le mot de passe"
            className="px-3 py-2.5 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
      </div>

      {monCompteMsg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${monCompteMsg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {monCompteMsg.text}
        </div>
      )}

      <button
        onClick={() => {
          if (monPwd && monPwd !== monPwdConfirm) {
            setMonCompteMsg({ ok: false, text: "Les mots de passe ne correspondent pas" }); return
          }
          if (monPwd && monPwd.length < 4) {
            setMonCompteMsg({ ok: false, text: "Mot de passe trop court (min 4 caractères)" }); return
          }
          const users = store.getUsers()
          const idx = users.findIndex(u => u.id === user.id)
          if (idx < 0) { setMonCompteMsg({ ok: false, text: "Utilisateur introuvable" }); return }
          const updated = {
            ...users[idx],
            name: monNom || users[idx].name,
            // Met aussi à jour les mots de passe mobile/BO s'ils existent (comptes
            // accessType "both"), sinon le nouveau mot de passe ne prendrait pas
            // effet à la connexion. Réinitialise l'obligation de changement.
            ...(monPwd ? {
              password: monPwd,
              ...(users[idx].passwordBO !== undefined ? { passwordBO: monPwd } : {}),
              ...(users[idx].passwordMobile !== undefined ? { passwordMobile: monPwd } : {}),
              mustChangePassword: false,
            } : {}),
          }
          users[idx] = updated
          store.saveUsers(users)            // sync Supabase via write-through
          if (monPwd) store.setSession(updated)  // reflète le changement dans la session active
          setMonPwd(""); setMonPwdConfirm("")
          setMonCompteMsg({ ok: true, text: "Profil mis à jour avec succès !" })
          setTimeout(() => setMonCompteMsg(null), 3000)
        }}
        className="self-start px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors">
        Enregistrer les modifications
      </button>
    </div>
  )
}

const SITE_WEB_KEY = "ef_site_web_settings"

type SiteWebSettings = {
  siteUrl: string
  email: string
  whatsapp: string
  whatsappMsg: string
  openHours: string
  instagram: string
  facebook: string
  tiktok: string
  metaTitle: string
  metaDesc: string
  maintenanceMode: boolean
}

const DEFAULT_SITE: SiteWebSettings = {
  siteUrl: "https://vita-fresh.co.site",
  email: "sales@vita-fresh.co.site",
  whatsapp: "+212600000000",
  whatsappMsg: "Bonjour Vita Fresh, je souhaite passer une commande.",
  openHours: "Lun–Sam : 6h–18h",
  instagram: "",
  facebook: "",
  tiktok: "",
  metaTitle: "Vita Fresh — Fruits & Légumes Casablanca",
  metaDesc: "Distribution de fruits et légumes frais à Casablanca. Livraison B2B sous 24h.",
  maintenanceMode: false,
}

function SiteWebTab({ saved, setSaved }: { saved: string; setSaved: (v: string) => void }) {
  const [settings, setSettings] = useState<SiteWebSettings>(DEFAULT_SITE)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SITE_WEB_KEY)
      if (stored) setSettings({ ...DEFAULT_SITE, ...JSON.parse(stored) })
    } catch {}
  }, [])

  function set<K extends keyof SiteWebSettings>(k: K, v: SiteWebSettings[K]) {
    setSettings(prev => ({ ...prev, [k]: v }))
  }

  function save() {
    localStorage.setItem(SITE_WEB_KEY, JSON.stringify(settings))
    setSaved("Paramètres site web sauvegardés")
    setTimeout(() => setSaved(""), 3000)
  }

  const Field = ({ label, id, value, onChange, type = "text", placeholder = "" }: {
    label: string; id: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
  }) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <input id={id} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="px-3 py-2.5 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
        </svg>
        <div>
          <p className="text-sm font-bold text-blue-900">Paramètres du site Vita Fresh</p>
          <p className="text-xs text-blue-700 mt-0.5">Ces informations alimentent le portail client et les liens de contact.</p>
        </div>
      </div>

      {/* Contact & URL */}
      <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
          URL & Contact
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="URL du site" id="siteUrl" value={settings.siteUrl} onChange={v => set("siteUrl", v)} placeholder="https://vita-fresh.co.site" />
          <Field label="Email contact" id="email" type="email" value={settings.email} onChange={v => set("email", v)} placeholder="sales@vita-fresh.co.site" />
          <Field label="Numéro WhatsApp" id="whatsapp" value={settings.whatsapp} onChange={v => set("whatsapp", v)} placeholder="+212600000000" />
          <Field label="Horaires d'ouverture" id="openHours" value={settings.openHours} onChange={v => set("openHours", v)} placeholder="Lun–Sam : 6h–18h" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-600">Message WhatsApp pré-rempli</label>
          <textarea value={settings.whatsappMsg} onChange={e => set("whatsappMsg", e.target.value)} rows={2}
            className="px-3 py-2.5 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" />
        </div>
      </div>

      {/* Réseaux sociaux */}
      <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
          <svg className="w-4 h-4 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
          Réseaux sociaux
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Instagram" id="instagram" value={settings.instagram} onChange={v => set("instagram", v)} placeholder="https://instagram.com/..." />
          <Field label="Facebook" id="facebook" value={settings.facebook} onChange={v => set("facebook", v)} placeholder="https://facebook.com/..." />
          <Field label="TikTok" id="tiktok" value={settings.tiktok} onChange={v => set("tiktok", v)} placeholder="https://tiktok.com/@..." />
        </div>
      </div>

      {/* SEO */}
      <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          SEO & Méta
        </h3>
        <Field label="Titre de la page (meta title)" id="metaTitle" value={settings.metaTitle} onChange={v => set("metaTitle", v)} placeholder="Vita Fresh — Fruits & Légumes" />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-600">Description (meta description)</label>
          <textarea value={settings.metaDesc} onChange={e => set("metaDesc", e.target.value)} rows={2}
            className="px-3 py-2.5 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" />
        </div>
      </div>

      {/* Mode maintenance */}
      <div className="bg-card rounded-2xl border border-border p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-foreground">Mode maintenance</p>
          <p className="text-xs text-muted-foreground mt-0.5">Affiche un message d'indisponibilité sur le portail client.</p>
        </div>
        <button onClick={() => set("maintenanceMode", !settings.maintenanceMode)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.maintenanceMode ? "bg-red-500" : "bg-slate-200"}`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${settings.maintenanceMode ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={save}
          className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition-colors">
          Sauvegarder
        </button>
      </div>
    </div>
  )
}

export default function BOSettings({ user }: { user: { id: string; name: string; role: string; email?: string } }) {
  // --- ALL hooks MUST come before any conditional return (Rules of Hooks) ---
  const [config, setConfig] = useState<EmailConfig>(() => store.getEmailConfig())
  const [contacts, setContacts] = useState<CompanyContacts>(() => store.getCompanyContacts())
  const [contactsSaved, setContactsSaved] = useState("")
  const { saveCompanyContacts: saveContactsToSupabase } = useRealtimeSync({ tables: ["contacts"] })
  const [motifs, setMotifs] = useState<MotifRetour[]>([])
  const [newMotif, setNewMotif] = useState({ label: "", labelAr: "" })
  const [saved, setSaved] = useState("")
  const [tab, setTab] = useState<"entreprise" | "contacts" | "process" | "workflow" | "emails" | "motifs" | "contenants" | "dataguard" | "ai_config" | "alertes" | "transporteurs" | "moncompte" | "systeme" | "siteweb">("entreprise")
  const [restartMsg, setRestartMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [restartLoading, setRestartLoading] = useState(false)

  // ── Supabase connectivity check state ──────────────────────────────────────
  interface SbCheckResult {
    connected: boolean
    tables_exist: number
    tables_total: number
    missing: string[]
    ready: boolean
    supabase_sql_editor?: string
  }
  const [sbCheck, setSbCheck]         = useState<SbCheckResult | null>(null)
  const [sbChecking, setSbChecking]   = useState(false)
  const [sbSyncing, setSbSyncing]     = useState(false)
  const [sbSyncResult, setSbSyncResult] = useState<{ ok: boolean; tables: string[]; errors: string[] } | null>(null)

  const handleSbCheck = async () => {
    setSbChecking(true); setSbCheck(null)
    try {
      const res  = await fetch("/api/setup-tables")
      const data = await res.json() as SbCheckResult
      setSbCheck(data)
    } catch (e) {
      setSbCheck({ connected: false, tables_exist: 0, tables_total: 22, missing: [], ready: false })
    }
    setSbChecking(false)
  }

  // Resynchroniser tire toutes les tables Supabase par-dessus le cache local —
  // action sensible (peut écraser des données locales non encore poussées) :
  // on exige une re-saisie du mot de passe avant de l'exécuter.
  const [showSyncConfirm, setShowSyncConfirm] = useState(false)
  const [syncConfirmPwd, setSyncConfirmPwd]   = useState("")
  const [syncConfirmError, setSyncConfirmError] = useState<string | null>(null)

  const confirmAndSync = () => {
    const full = store.getUsers().find(u => u.id === user.id)
    const ok = !!full && (
      passwordMatches(full.password, syncConfirmPwd) ||
      passwordMatches(full.passwordBO, syncConfirmPwd)
    )
    if (!ok) { setSyncConfirmError("Mot de passe incorrect."); return }
    setShowSyncConfirm(false); setSyncConfirmPwd(""); setSyncConfirmError(null)
    handleSbSync()
  }

  const handleSbSync = async () => {
    setSbSyncing(true); setSbSyncResult(null)
    try {
      const { syncFromSupabase } = await import("@/lib/supabase/db")
      const result = await syncFromSupabase()
      setSbSyncResult(result)
    } catch (e) {
      setSbSyncResult({ ok: false, tables: [], errors: [String(e)] })
    }
    setSbSyncing(false)
  }
  const [transporteurs, setTransporteurs] = useState<TransportCompany[]>([])
  const [editingTransport, setEditingTransport] = useState<TransportCompany | null>(null)
  const [showTransportForm, setShowTransportForm] = useState(false)
  const [transportSaved, setTransportSaved] = useState("")
  const emptyTransport = (): TransportCompany => ({
    id: store.genId(), nom: "", actif: true,
    ice: "", patente: "", rc: "", if_fiscal: "", tp: "", cnss: "",
    telephone: "", email: "", adresse: "", ville: "", contact: "", notes: ""
  })
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [dgMsg, setDgMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showClearConfirm, setShowClearConfirm]   = useState(false)
  const [showWipeConfirm, setShowWipeConfirm]         = useState(false)
  const [showResetConfirm, setShowResetConfirm]       = useState(false)
  const [wipingAll, setWipingAll]                     = useState(false)
  const [resetingDemo, setResetingDemo]               = useState(false)
  const [showAdvancedReset, setShowAdvancedReset]     = useState(false)
  const [showRevokeConfirm, setShowRevokeConfirm]     = useState(false)
  const [revokingAll, setRevokingAll]                 = useState(false)
  const [revokeMsg, setRevokeMsg]                     = useState<{ ok: boolean; text: string } | null>(null)
  const [clearMode, setClearMode] = useState<"local" | "supabase" | "both">("both")
  const [clearTables, setClearTables] = useState<Set<string>>(() => new Set([
    "fl_clients","fl_fournisseurs","fl_articles","fl_commandes","fl_bons_livraison",
    "fl_bons_preparation","fl_bons_achat","fl_purchase_orders","fl_receptions",
    "fl_trips","fl_retours","fl_visites","fl_transferts_stock","fl_demandes_achat",
    "fl_messages","fl_notices","fl_non_achats","fl_depots","fl_livreurs","fl_users",
    "fl_account_requests","fl_commandes_web","fl_prospects","fl_contrats","fl_caisse_vides",
    "fl_incentives","fl_perf_commercial",
  ]))
  const [sbTestResult, setSbTestResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [sbTesting, setSbTesting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const [company, setCompany] = useState<CompanyConfig>(() => store.getCompanyConfig())
  const [workflow, setWorkflow] = useState<WorkflowConfig>(() => {
    const wf = store.getWorkflowConfig()
    if (!wf.steps || wf.steps.length === 0) wf.steps = DEFAULT_WORKFLOW_STEPS
    return wf
  })
  const [contenants, setContenants] = useState<ContenantTare[]>([])
  const [contenantSaved, setContenantSaved] = useState("")
  const [processCfg, setProcessCfg] = useState<ProcessConfig>(() => store.getProcessConfig())
  const [processSaved, setProcessSaved] = useState("")
  const [processSubSteps, setProcessSubSteps] = useState<Record<string, Record<string, boolean>>>(() => store.getProcessSubSteps())
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  // ── AI Configuration state ──────────────────────────────────────────────────
  const [aiCfg, setAiCfg] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fl_ai_config") ?? "{}") as {
      openaiKey?: string; anthropicKey?: string; geminiKey?: string
      model?: string; systemPrompt?: string
      qcObligatoireBL?: boolean; alerteAchatEnabled?: boolean; alerteVenteEnabled?: boolean
    } } catch { return {} }
  })
  const [aiSaved, setAiSaved] = useState("")
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})

  // ── Alert config state ──────────────────────────────────────────────────────
  const [alertCfg, setAlertCfg] = useState(() => {
    try { return JSON.parse(localStorage.getItem("fl_alert_config") ?? "{}") as {
      paSeuilPct?: number; pvMargeMinPct?: number
      emailDestinataire?: string; alerteAchatEnabled?: boolean; alerteVenteEnabled?: boolean
    } } catch { return {} }
  })
  const [alertSaved, setAlertSaved] = useState("")
  const [alertInactivityDays, setAlertInactivityDays] = useState(() => store.getAlertConfig?.()?.inactivityDays ?? 30)
  const [artAbsenceJours, setArtAbsenceJours]   = useState(() => store.getAlertConfig?.()?.articleAbsenceJours ?? 7)
  const [artAbsenceMedium, setArtAbsenceMedium] = useState(() => store.getAlertConfig?.()?.articleAbsenceMedium ?? 14)
  const [artAbsenceUrgent, setArtAbsenceUrgent] = useState(() => store.getAlertConfig?.()?.articleAbsenceUrgent ?? 21)
  const [savedAlert, setSavedAlert] = useState(false)
  // Config Marché (rapport besoin / camions / heure d'arrivée)
  const [mcCapacite, setMcCapacite]   = useState(() => store.getMarcheConfig?.()?.capaciteHondaKg ?? 1500)
  const [mcHeure, setMcHeure]         = useState(() => store.getMarcheConfig?.()?.heureOuvertureMarche ?? "05:00")
  const [mcMinTonne, setMcMinTonne]   = useState(() => store.getMarcheConfig?.()?.minutesParTonne ?? 8)
  const [mcMarge, setMcMarge]         = useState(() => store.getMarcheConfig?.()?.margeSecuriteMin ?? 30)
  const [mcPrixCarb, setMcPrixCarb]   = useState(() => store.getEmailConfig?.()?.prixCarburantL ?? 15)
  const [savedMarche, setSavedMarche] = useState(false)
  const [seedMsg, setSeedMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [seeding, setSeeding] = useState(false)

  // ── Mon Compte state ────────────────────────────────────────────────────────
  const [monNom, setMonNom] = useState(user.name)
  const [monPwd, setMonPwd] = useState("")
  const [monPwdConfirm, setMonPwdConfirm] = useState("")
  const [monCompteMsg, setMonCompteMsg] = useState<{ok:boolean;text:string}|null>(null)

  // Access check — computed AFTER hooks
  const canAccess = user.role === "super_super_admin" || user.role === "admin" || user.role === "super_admin"
  const canEditEmails = canAccess

  useEffect(() => {
    if (!canAccess) return
    setConfig(store.getEmailConfig())
    setMotifs(store.getMotifs())
    setCompany(store.getCompanyConfig())
    setWorkflow(store.getWorkflowConfig())
    setContenants(store.getContenantsConfig())
    setProcessCfg(store.getProcessConfig())
    setTransporteurs(store.getTransportCompanies())
  }, [canAccess])

  // Guard AFTER hooks — safe conditional render
  // Non-admin users can only access "moncompte"
  if (!canAccess) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-xl font-bold text-foreground">Mon Compte <span className="text-muted-foreground font-normal text-base mr-1">/ حسابي</span></h2>
          <p className="text-sm text-muted-foreground">Gérez vos informations personnelles</p>
        </div>
        <MonCompteContent user={user} monNom={monNom} setMonNom={setMonNom} monPwd={monPwd} setMonPwd={setMonPwd} monPwdConfirm={monPwdConfirm} setMonPwdConfirm={setMonPwdConfirm} monCompteMsg={monCompteMsg} setMonCompteMsg={setMonCompteMsg} />
      </div>
    )
  }

  const handleSaveConfig = () => {
    store.saveEmailConfig(config)
    setSaved("Configuration sauvegardée"); setTimeout(() => setSaved(""), 2000)
  }

  const handleAddMotif = () => {
    if (!newMotif.label.trim()) return
    const m: MotifRetour = { id: store.genId(), label: newMotif.label, labelAr: newMotif.labelAr, actif: true }
    const all = [...motifs, m]
    store.saveMotifs(all)
    setMotifs(all)
    setNewMotif({ label: "", labelAr: "" })
  }

  const toggleMotif = (id: string) => {
    const all = motifs.map(m => m.id === id ? { ...m, actif: !m.actif } : m)
    store.saveMotifs(all); setMotifs(all)
  }

  const deleteMotif = (id: string) => {
    const all = motifs.filter(m => m.id !== id)
    store.saveMotifs(all); setMotifs(all)
  }

  // DataGuard helpers
  const handleExport = () => {
    try {
      const snapshot: Record<string, unknown> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k) snapshot[k] = localStorage.getItem(k)
      }
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `freshlink-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setDgMsg({ ok: true, text: "Sauvegarde exportée avec succès." })
      setTimeout(() => setDgMsg(null), 3000)
    } catch (e) {
      setDgMsg({ ok: false, text: "Erreur lors de l'export." })
    }
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (typeof data !== "object" || data === null) throw new Error("Format invalide")
        Object.entries(data).forEach(([k, v]) => {
          if (typeof v === "string") localStorage.setItem(k, v)
        })
        setDgMsg({ ok: true, text: "Données restaurées. Rechargez la page pour voir les changements." })
        setTimeout(() => setDgMsg(null), 5000)
      } catch {
        setDgMsg({ ok: false, text: "Fichier invalide. Vérifiez le format JSON." })
        setTimeout(() => setDgMsg(null), 4000)
      }
    }
    reader.readAsText(file)
    // reset input
    if (importRef.current) importRef.current.value = ""
  }

  const handleSeedDemo = () => {
    setSeeding(true)
    try {
      seedDemoData(store)
      setSeedMsg({ ok: true, text: "Données démo chargées avec succès — 6 clients, 8 articles, 3 fournisseurs, 5 commandes, 3 voyages et plus." })
    } catch {
      setSeedMsg({ ok: false, text: "Erreur lors du chargement des données démo." })
    } finally {
      setSeeding(false)
      setTimeout(() => setSeedMsg(null), 6000)
    }
  }

  const ERP_TABLES_SYNC = [
    "fl_commandes","fl_clients","fl_users","fl_articles","fl_fournisseurs",
    "fl_bons_achat","fl_bons_livraison","fl_bons_preparation","fl_receptions",
    "fl_trips","fl_retours","fl_visites","fl_purchase_orders","fl_transferts_stock",
    "fl_messages","fl_depots","fl_livreurs","fl_demandes_achat","fl_notices","fl_non_achats",
    "fl_account_requests","fl_commandes_web","fl_prospects","fl_contrats",
    "fl_caisse_vides","fl_incentives","fl_perf_commercial",
  ]

  // Mapping table → clé localStorage (même nom en général)
  const TABLE_LS_KEY: Record<string, string> = {
    fl_clients:"fl_clients", fl_fournisseurs:"fl_fournisseurs", fl_articles:"fl_articles",
    fl_commandes:"fl_commandes", fl_bons_livraison:"fl_bons_livraison",
    fl_bons_preparation:"fl_bons_preparation", fl_bons_achat:"fl_bons_achat",
    fl_purchase_orders:"fl_purchase_orders", fl_receptions:"fl_receptions",
    fl_trips:"fl_trips", fl_retours:"fl_retours", fl_visites:"fl_visites",
    fl_transferts_stock:"fl_transferts_stock", fl_demandes_achat:"fl_demandes_achat",
    fl_messages:"fl_messages", fl_notices:"fl_notices", fl_non_achats:"fl_non_achats",
    fl_depots:"fl_depots", fl_livreurs:"fl_livreurs", fl_users:"fl_users",
    fl_account_requests:"fl_account_requests", fl_commandes_web:"fl_commandes_web",
    fl_prospects:"fl_prospects", fl_contrats:"fl_contrats",
    fl_caisse_vides:"fl_caisse_vides", fl_incentives:"fl_incentives",
    fl_perf_commercial:"fl_perf_commercial",
  }

  const handleClearAll = async () => {
    if (clearTables.size === 0) return
    const isSuperAdmin = user.role === "super_super_admin"
    setShowClearConfirm(false)

    try {
      // 1. Effacer localStorage (uniquement les tables sélectionnées)
      if (clearMode === "local" || clearMode === "both") {
        clearTables.forEach(tableKey => {
          const lsKey = TABLE_LS_KEY[tableKey] ?? tableKey
          localStorage.setItem(lsKey, JSON.stringify([]))
        })
      }

      // 2. Effacer Supabase via /api/sync-write (service role → bypass RLS)
      if (clearMode === "supabase" || clearMode === "both") {
        let sbErrors = 0
        for (const table of ERP_TABLES_SYNC) {
          if (!clearTables.has(table)) continue
          try {
            const res = await fetch("/api/sync-write", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                table,
                clearAll: true,
                // Préserver le compte super_admin dans fl_users
                ...(table === "fl_users" && isSuperAdmin ? { preserveId: user.id } : {}),
              }),
            })
            const data = await res.json()
            if (!data.ok) sbErrors++
          } catch { sbErrors++ }
        }
        if (sbErrors > 0) {
          setDgMsg({ ok: false, text: `Effacement partiel — ${sbErrors} table(s) Supabase non effacée(s). Vérifiez les logs.` })
          setTimeout(() => setDgMsg(null), 6000)
          return
        }
      }

      const scopeLabel = clearMode === "local" ? "local" : clearMode === "supabase" ? "Supabase" : "local + Supabase"
      setDgMsg({ ok: true, text: `✅ ${clearTables.size} catégorie(s) effacée(s) (${scopeLabel}). Rechargez la page.` })
    } catch {
      setDgMsg({ ok: false, text: "Erreur lors de l'effacement." })
    }
    setTimeout(() => setDgMsg(null), 6000)
  }

  // Liste EXHAUSTIVE pour "Tout effacer sauf Jawad" — couvre AUSSI les tables
  // mobile/finance souvent oubliées (caisse, charges, salaires, PA historique,
  // factures, concurrence…). Sinon elles restent en base et « reviennent » par
  // sync sur le BO ET le mobile. (Les *_config de réglages sont volontairement
  // préservés.) fl_caisses_vides corrigé (était fl_caisse_vides, inexistant).
  const WIPE_ALL_TABLES = [
    "fl_users","fl_clients","fl_articles","fl_fournisseurs",
    "fl_commandes","fl_commandes_web","fl_bons_livraison","fl_bons_preparation",
    "fl_retours","fl_trips","fl_receptions","fl_bons_achat","fl_purchase_orders",
    "fl_depots","fl_livreurs","fl_visites","fl_messages","fl_notices",
    "fl_transferts_stock","fl_demandes_achat","fl_non_achats",
    "fl_site_access","fl_account_requests","fl_prospects","fl_company_contacts",
    "fl_documents","fl_contrats","fl_organisations",
    "fl_caisses_vides","fl_charges","fl_caisse_entries","fl_salaries","fl_actionnaires",
    "fl_invoices","fl_avoirs","fl_wallet_transactions","fl_paiements",
    "fl_feedbacks","fl_gift_materials","fl_pa_historique",
    "fl_referrals","fl_tracking","fl_promotions","fl_coupons","fl_notifications",
    "fl_intel_prix","fl_conc_pv","fl_conc_ventes_daily","fl_finance_mensuel",
    "fl_credits_fournisseurs","fl_charges_article",
  ]

  const handleWipeAllExceptJawad = async () => {
    setWipingAll(true); setShowWipeConfirm(false)
    try {
      // 1. Vider localStorage (toutes les tables, y compris mobile/finance)
      WIPE_ALL_TABLES.forEach(k => localStorage.setItem(k, JSON.stringify([])))
      // 2. Vider Supabase (préserver VFU00001, supprimer aussi l'ancien u_jawad_root)
      //    Liste exhaustive → le mobile, qui resynchronise depuis Supabase, se
      //    retrouve vide lui aussi au prochain pull.
      for (const table of WIPE_ALL_TABLES) {
        try {
          await fetch("/api/sync-write", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ table, clearAll: true, ...(table === "fl_users" ? { preserveId: "VFU00001" } : {}) }),
          })
        } catch {}
      }
      // 2b. Supprimer l'ancien doublon Jawad (u_jawad_root) si présent
      try {
        await fetch("/api/sync-write", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: "fl_users", deletes: ["u_jawad_root"] }),
        })
      } catch {}
      // 2b-bis. MARQUEUR DE RESET GLOBAL → les AUTRES appareils videront leur cache
      //         local au prochain pull (sinon leurs anciennes données « reviennent »).
      //         Cet appareil-ci a déjà le cache vidé → on note le reset comme « vu ».
      try {
        const resetAt = new Date().toISOString()
        await fetch("/api/sync-write", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: "fl_notices", upserts: [{ id: "__db_reset", payload: { at: resetAt }, updated_at: resetAt }] }),
        })
        try { localStorage.setItem("fl_db_reset_seen", resetAt) } catch {}
      } catch {}
      // 2c. Pousser un marqueur dans fl_articles pour indiquer que le catalogue
      //     a été vidé explicitement (évite le fallback vers ERP_DEFAULT_ARTICLES)
      try {
        await fetch("/api/sync-write", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            table: "fl_articles",
            upserts: [{ id: "__catalogue_cleared", payload: { marketplaceActif: false, clearedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }],
          }),
        })
      } catch {}
      // 3. Ré-injecter Jawad dans Supabase (garantie)
      await fetch("/api/sync-write", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          table: "fl_users",
          upserts: [{ id: "VFU00001", payload: { name:"Jawad", email:"jawad@vita-fresh.ma", telephone:"0647333456", password:"Medghaly@22", role:"super_super_admin", actif:true }, updated_at: new Date().toISOString() }],
        }),
      })
      setDgMsg({ ok: true, text: "✅ Toutes les données effacées. Seul le compte Jawad (VFU00001) est conservé. Rechargement..." })
      setTimeout(() => window.location.reload(), 2000)
    } catch {
      setDgMsg({ ok: false, text: "Erreur lors de l'effacement total." })
    }
    setWipingAll(false)
  }

  const handleRevokeAllSessions = async () => {
    setRevokingAll(true); setShowRevokeConfirm(false)
    try {
      const session = store.getSession()
      const exceptUserId = session?.id ?? "VFU00001"
      const token = (session as any)?.token ?? ""
      const res = await fetch("/api/ext/revoke-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exceptUserId, adminId: session?.id ?? exceptUserId }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setRevokeMsg({ ok: true, text: "✅ Déconnexion forcée activée. Tous les comptes seront déconnectés à leur prochaine interaction (sauf votre session actuelle)." })
      } else {
        setRevokeMsg({ ok: false, text: "Erreur : " + (data.error ?? data.message ?? "Supabase inaccessible.") })
      }
    } catch {
      setRevokeMsg({ ok: false, text: "Erreur réseau." })
    }
    setRevokingAll(false)
    setTimeout(() => setRevokeMsg(null), 8000)
  }

  const handleResetToDemo = async () => {
    setResetingDemo(true); setShowResetConfirm(false)
    try {
      // 1. Vider localStorage
      WIPE_ALL_TABLES.forEach(k => localStorage.setItem(k, JSON.stringify([])))
      // 2. Charger les données démo
      await seedDemoData(store)
      setDgMsg({ ok: true, text: "✅ Données démo rechargées avec succès. Rechargement..." })
      setTimeout(() => window.location.reload(), 2000)
    } catch {
      setDgMsg({ ok: false, text: "Erreur lors de la réinitialisation démo." })
    }
    setResetingDemo(false)
  }

  const handleTestSupabase = async () => {
    setSbTesting(true)
    setSbTestResult(null)
    try {
      const res = await fetch("/api/test-sync")
      const data = await res.json()
      if (data.status === "ok") {
        const missing = data.tables?.missing?.length ?? 0
        const withData = data.tables?.have_data ?? 0
        setSbTestResult({
          ok: true,
          text: `✅ Supabase connecté — ${data.tables?.exist}/${data.tables?.total_expected} tables, ${withData} avec données${missing > 0 ? ` · ⚠️ ${missing} tables manquantes` : ""}`,
        })
      } else {
        setSbTestResult({ ok: false, text: "❌ Supabase inaccessible — vérifiez les variables d'environnement Vercel" })
      }
    } catch {
      setSbTestResult({ ok: false, text: "❌ Erreur réseau — API test-sync inaccessible" })
    } finally {
      setSbTesting(false)
      setTimeout(() => setSbTestResult(null), 10000)
    }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCompany(c => ({ ...c, logo: ev.target?.result as string }))
    reader.readAsDataURL(file)
  }

  const handleSaveContacts = async () => {
    store.saveCompanyContacts(contacts)
    await saveContactsToSupabase(contacts)
    setContactsSaved("Coordonnées sauvegardées et synchronisées")
    setTimeout(() => setContactsSaved(""), 3000)
  }

  const TABS = [
    { id: "moncompte" as const,   label: "Mon Compte",               labelAr: "حسابي" },
    { id: "entreprise" as const,  label: "Entreprise",               labelAr: "معلومات الشركة" },
    { id: "contacts" as const,    label: "Contacts & Coordonnées",    labelAr: "أرقام التواصل والعناوين" },
    { id: "process" as const,     label: "Process",                   labelAr: "اختيار العملية" },
    { id: "workflow" as const,    label: "Validation commandes",      labelAr: "الموافقة على الطلبيات" },
    { id: "emails" as const,      label: "Emails & Notifications",    labelAr: "البريد الإلكتروني" },
    { id: "motifs" as const,      label: "Motifs retour",             labelAr: "أسباب الإرجاع" },
    { id: "contenants" as const,  label: "Poids contenants",          labelAr: "أوزان الحاويات" },
    { id: "dataguard" as const,   label: "DataGuard",                 labelAr: "حماية البيانات" },
    { id: "ai_config" as const,   label: "IA & Modeles",              labelAr: "الذكاء الاصطناعي" },
    { id: "alertes" as const,     label: "Alertes Email",             labelAr: "تنبيهات البريد" },
    // Transporteurs : géré dans Dispatch & Logistique → onglet Transporteurs (doublon retiré d'ici)
    { id: "siteweb" as const,       label: "🌐 Site Web",               labelAr: "إعدادات الموقع" },
    ...(user.role === "super_super_admin" ? [{ id: "systeme" as const, label: "⚡ Système", labelAr: "النظام" }] : []),
  ]

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-bold text-foreground">Paramètres <span className="text-muted-foreground font-normal text-base mr-1">/ الإعدادات</span></h2>
        <p className="text-sm text-muted-foreground">Configuration des emails, motifs retour et workflows</p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {saved}
        </div>
      )}

      <div className="flex gap-1 p-1 rounded-xl bg-muted overflow-x-auto">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* === ENTREPRISE === */}
      {tab === "entreprise" && (
        <div className="flex flex-col gap-5">

          {/* App Identity */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-sm">Identité de l&apos;application / هوية التطبيق</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Ces informations s&apos;affichent dans la barre latérale et sur l&apos;écran de connexion.</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Nom de l&apos;application</label>
                <input type="text"
                  value={company.appName ?? "FreshLink Pro"}
                  onChange={e => setCompany(c => ({ ...c, appName: e.target.value }))}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="FreshLink Pro" />
                <p className="text-[10px] text-muted-foreground">Nom principal affiché en haut de la sidebar</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Sous-titre / Slogan</label>
                <input type="text"
                  value={company.appSlogan ?? company.nom ?? "Vita Fresh"}
                  onChange={e => setCompany(c => ({ ...c, appSlogan: e.target.value }))}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Vita Fresh" />
                <p className="text-[10px] text-muted-foreground">Texte affiché sous le nom de l&apos;application</p>
              </div>
            </div>
          </div>

          {/* Logo + preview */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-sm">Logo / الشعار</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Utilisé dans la sidebar, l&apos;écran de connexion et les documents (BL, factures).</p>
            </div>
            <div className="flex items-start gap-6 flex-wrap">
              <div className="flex flex-col items-center gap-3">
                <div className="w-32 h-24 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted overflow-hidden">
                  {company.logo
                    ? <img src={company.logo} alt="Logo" className="w-full h-full object-contain" />
                    : <svg className="w-10 h-10 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                  }
                </div>
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <button onClick={() => logoRef.current?.click()}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors font-medium">
                  {company.logo ? "Changer le logo" : "Importer le logo"}
                </button>
                {company.logo && (
                  <button onClick={() => setCompany(c => ({ ...c, logo: undefined }))}
                    className="text-xs text-red-600 hover:underline">Supprimer</button>
                )}
              </div>
              {/* Apercu entete BL */}
              <div className="flex-1 min-w-48">
                <p className="text-xs text-muted-foreground mb-2">Apercu en-tête (BL / Facture)</p>
                <div className="rounded-xl border border-border p-3 text-xs" style={{ borderTopColor: company.couleurEntete, borderTopWidth: 4 }}>
                  <div className="flex items-center gap-3">
                    {company.logo && <img src={company.logo} alt="Logo" className="h-10 object-contain" />}
                    <div>
                      <p className="font-bold text-sm text-foreground">{company.nom || "Nom entreprise"}</p>
                      <p className="text-muted-foreground">{company.adresse}{company.ville ? `, ${company.ville}` : ""}</p>
                      <p className="text-muted-foreground">{company.telephone} — {company.email}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold">Couleur de l&apos;en-tête</label>
              <div className="flex items-center gap-3">
                <input type="color" value={company.couleurEntete || "#1e3a5f"}
                  onChange={e => setCompany(c => ({ ...c, couleurEntete: e.target.value }))}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
                <span className="text-xs font-mono text-muted-foreground">{company.couleurEntete || "#1e3a5f"}</span>
              </div>
            </div>
          </div>

          {/* Informations générales */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-sm">Informations générales / المعلومات العامة</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { f: "nom", label: "Raison sociale / الاسم التجاري", placeholder: "FreshLink Maroc" },
                { f: "telephone", label: "Téléphone", placeholder: "0522 000 000" },
                { f: "email", label: "Email", placeholder: "contact@freshlink.ma" },
                { f: "siteWeb", label: "Site web (optionnel)", placeholder: "www.freshlink.ma" },
              ].map(({ f, label, placeholder }) => (
                <div key={f} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">{label}</label>
                  <input type="text" value={(company as unknown as Record<string,string>)[f] || ""}
                    onChange={e => setCompany(c => ({ ...c, [f]: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={placeholder} />
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Adresse</label>
                <input type="text" value={company.adresse || ""}
                  onChange={e => setCompany(c => ({ ...c, adresse: e.target.value }))}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Bd Anfa, Quartier Gauthier" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Ville / المدينة</label>
                <input type="text" value={company.ville || "Casablanca"}
                  onChange={e => setCompany(c => ({ ...c, ville: e.target.value }))}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Casablanca" />
              </div>
            </div>
          </div>

          {/* Données fiscales Maroc */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-sm">Données fiscales Maroc / البيانات الجبائية</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { f: "ice", label: "ICE (20 chiffres)", placeholder: "00000000000000000000" },
                { f: "rc", label: "RC (Registre de commerce)", placeholder: "123456" },
                { f: "if_fiscal", label: "IF (Identifiant fiscal)", placeholder: "12345678" },
                { f: "tp", label: "TP (Taxe professionnelle)", placeholder: "12345678" },
                { f: "cnss", label: "CNSS", placeholder: "1234567" },
              ].map(({ f, label, placeholder }) => (
                <div key={f} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground">{label}</label>
                  <input type="text" value={(company as unknown as Record<string,string>)[f] || ""}
                    onChange={e => setCompany(c => ({ ...c, [f]: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={placeholder} />
                </div>
              ))}
            </div>
          </div>

          {/* Mentions BL / Facture */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-sm">Mentions sur les documents / ملاحظات على الوثائق</h3>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">Mentions BL</label>
                <textarea rows={2} value={company.mentionsBL || ""}
                  onChange={e => setCompany(c => ({ ...c, mentionsBL: e.target.value }))}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Marchandises voyagent aux risques et périls du destinataire..." />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">Mentions Facture</label>
                <textarea rows={2} value={company.mentionsFacture || ""}
                  onChange={e => setCompany(c => ({ ...c, mentionsFacture: e.target.value }))}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Pénalité de retard: 1,5% par mois. Escompte si paiement avant échéance: 2%..." />
              </div>
            </div>
          </div>

          <button onClick={() => { store.saveCompanyConfig(company); setSaved("Entreprise sauvegardée"); setTimeout(() => setSaved(""), 2500) }}
            className="self-start flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ background: "oklch(0.38 0.2 260)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Sauvegarder les informations entreprise
          </button>
        </div>
      )}

      {/* === CONTACTS & COORDONNÉES === */}
      {tab === "contacts" && (
        <div className="flex flex-col gap-6">
          {contactsSaved && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {contactsSaved}
            </div>
          )}

          {/* Téléphones */}
          <div className="bg-white border border-border rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
              </div>
              <div>
                <p className="font-bold text-foreground">Téléphones</p>
                <p className="text-xs text-muted-foreground">Numéros affichés sur le site et documents</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {([
                { key: "tel_principal", label: "Tél. principal", placeholder: "+212 6XX XXX XXX" },
                { key: "tel_secondaire", label: "Tél. secondaire", placeholder: "+212 5XX XXX XXX" },
                { key: "tel_urgence", label: "Tél. urgences", placeholder: "+212 6XX XXX XXX" },
              ] as { key: keyof CompanyContacts; label: string; placeholder: string }[]).map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{f.label}</label>
                  <input
                    type="tel"
                    value={(contacts[f.key] as string) ?? ""}
                    onChange={e => setContacts(c => ({ ...c, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* WhatsApp */}
          <div className="bg-white border border-border rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              </div>
              <div>
                <p className="font-bold text-foreground">WhatsApp</p>
                <p className="text-xs text-muted-foreground">Numéros WhatsApp Business par canal</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {([
                { key: "whatsapp_principal",  label: "Commandes clients",   placeholder: "+212 6XX XXX XXX" },
                { key: "whatsapp_commercial", label: "Équipe commerciale",   placeholder: "+212 6XX XXX XXX" },
                { key: "whatsapp_livraison",  label: "Suivi livraisons",     placeholder: "+212 6XX XXX XXX" },
              ] as { key: keyof CompanyContacts; label: string; placeholder: string }[]).map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{f.label}</label>
                  <input
                    type="tel"
                    value={(contacts[f.key] as string) ?? ""}
                    onChange={e => setContacts(c => ({ ...c, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Emails */}
          <div className="bg-white border border-border rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <div>
                <p className="font-bold text-foreground">Adresses Email</p>
                <p className="text-xs text-muted-foreground">Emails affichés sur le site et documents</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                { key: "email_principal",     label: "Email principal",         placeholder: "contact@vita-fresh.co.site" },
                { key: "email_commercial",    label: "Email commercial",        placeholder: "commercial@vita-fresh.co.site" },
                { key: "email_comptabilite",  label: "Email comptabilité",      placeholder: "compta@vita-fresh.co.site" },
                { key: "email_rh",            label: "Email RH",                placeholder: "rh@vita-fresh.co.site" },
              ] as { key: keyof CompanyContacts; label: string; placeholder: string }[]).map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{f.label}</label>
                  <input
                    type="email"
                    value={(contacts[f.key] as string) ?? ""}
                    onChange={e => setContacts(c => ({ ...c, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Adresse postale */}
          <div className="bg-white border border-border rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
              <div>
                <p className="font-bold text-foreground">Adresse Postale</p>
                <p className="text-xs text-muted-foreground">Adresse du siège social / entrepôt principal</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Adresse ligne 1</label>
                <input value={contacts.adresse_ligne1 ?? ""} onChange={e => setContacts(c => ({ ...c, adresse_ligne1: e.target.value }))} placeholder="N° de rue, nom de rue" className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Adresse ligne 2</label>
                <input value={contacts.adresse_ligne2 ?? ""} onChange={e => setContacts(c => ({ ...c, adresse_ligne2: e.target.value }))} placeholder="Quartier, résidence, étage…" className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Code postal</label>
                  <input value={contacts.code_postal ?? ""} onChange={e => setContacts(c => ({ ...c, code_postal: e.target.value }))} placeholder="20000" className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ville</label>
                  <input value={contacts.ville ?? ""} onChange={e => setContacts(c => ({ ...c, ville: e.target.value }))} placeholder="Casablanca" className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pays</label>
                  <input value={contacts.pays ?? ""} onChange={e => setContacts(c => ({ ...c, pays: e.target.value }))} placeholder="Maroc" className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* Réseaux sociaux */}
          <div className="bg-white border border-border rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-pink-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-pink-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
              </div>
              <div>
                <p className="font-bold text-foreground">Réseaux Sociaux</p>
                <p className="text-xs text-muted-foreground">Liens affichés sur le site web client</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {([
                { key: "instagram", label: "Instagram", placeholder: "@vita.fresh" },
                { key: "facebook",  label: "Facebook",  placeholder: "facebook.com/VitaFresh" },
                { key: "linkedin",  label: "LinkedIn",   placeholder: "linkedin.com/in/VitaFresh" },
                { key: "tiktok",    label: "TikTok",    placeholder: "@VitaFresh" },
              ] as { key: keyof CompanyContacts; label: string; placeholder: string }[]).map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{f.label}</label>
                  <input
                    type="text"
                    value={(contacts[f.key] as string) ?? ""}
                    onChange={e => setContacts(c => ({ ...c, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Horaires & Zone */}
          <div className="bg-white border border-border rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <p className="font-bold text-foreground">Horaires & Zone de livraison</p>
                <p className="text-xs text-muted-foreground">Affichés sur le site et le chatbot WhatsApp</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Horaires ouverture</label>
                <input value={contacts.horaires_ouverture ?? ""} onChange={e => setContacts(c => ({ ...c, horaires_ouverture: e.target.value }))} placeholder="Lun-Sam : 06h00 - 20h00" className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Horaires livraison</label>
                <input value={contacts.horaires_livraison ?? ""} onChange={e => setContacts(c => ({ ...c, horaires_livraison: e.target.value }))} placeholder="Lun-Sam : 07h00 - 18h00" className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Zone couverte</label>
                <input value={contacts.zone_livraison ?? ""} onChange={e => setContacts(c => ({ ...c, zone_livraison: e.target.value }))} placeholder="Casablanca et région" className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm" />
              </div>
            </div>
          </div>

          {/* Bouton Sauvegarder */}
          <div className="flex justify-end">
            <button onClick={handleSaveContacts} className="px-6 py-3 rounded-2xl bg-green-600 text-white font-bold text-sm hover:bg-green-700 transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              Sauvegarder & Synchroniser
            </button>
          </div>
        </div>
      )}

      {/* === PROCESS CONFIG === */}
      {tab === "process" && (
        <div className="flex flex-col gap-5">
          {/* Header */}
          <div className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-2xl p-5 flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-slate-900 text-base">Choix du Process Operationnel</p>
                <p className="text-xs text-teal-700">Selectionnez le mode de fonctionnement adapte a votre organisation</p>
              </div>
            </div>
          </div>

          {/* Mode selector */}
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
            <h3 className="font-bold text-sm text-slate-900">Mode operationnel / نمط التشغيل</h3>
            <div className="flex flex-col gap-3">
              {([
                {
                  mode: "prevendeur_direct" as const,
                  label: "Prevendeur Direct",
                  labelAr: "البائع المتجول — مباشر",
                  desc: "Le prevendeur saisit la commande qui est directement validee. Pas de validation logistique requise. Ideal pour les petites equipes.",
                  icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
                  color: "border-green-300 bg-green-50",
                  dot: "bg-green-500",
                },
                {
                  mode: "prevendeur_logistique" as const,
                  label: "Prevendeur + Logistique",
                  labelAr: "البائع + اللوجستيك",
                  desc: "Le prevendeur saisit la commande. La logistique valide, prepare et imprime le BL avant livraison. Mode recommande.",
                  icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2",
                  color: "border-blue-300 bg-blue-50",
                  dot: "bg-blue-500",
                },
                {
                  mode: "commercial_classique" as const,
                  label: "Commercial Classique",
                  labelAr: "التجاري الكلاسيكي",
                  desc: "Commercial saisit, Responsable Commercial approuve, puis Logistique prepare. Controle a deux niveaux.",
                  icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
                  color: "border-violet-300 bg-violet-50",
                  dot: "bg-violet-600",
                },
                {
                  mode: "full_process" as const,
                  label: "Processus Complet (BPM)",
                  labelAr: "العملية الكاملة",
                  desc: "Processus BPM complet: Commande → Achat → Reception → Preparation → Controle Qualite → Livraison → Encaissement. Pour les grandes structures.",
                  icon: "M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z",
                  color: "border-amber-300 bg-amber-50",
                  dot: "bg-amber-500",
                },
              ] as { mode: ProcessConfig["mode"]; label: string; labelAr: string; desc: string; icon: string; color: string; dot: string }[]).map(opt => (
                <label key={opt.mode}
                  className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${processCfg.mode === opt.mode ? opt.color : "border-border bg-background hover:bg-muted/30"}`}
                  onClick={() => setProcessCfg(p => ({
                    ...p,
                    mode: opt.mode,
                    // Auto-configure modules based on mode
                    enableAchat: opt.mode !== "prevendeur_direct",
                    enableReception: opt.mode === "commercial_classique" || opt.mode === "full_process",
                    enablePreparation: opt.mode !== "prevendeur_direct",
                    enableLogistiqueValidation: opt.mode !== "prevendeur_direct",
                    enableBLPrint: opt.mode !== "prevendeur_direct",
                    enableTripDispatch: opt.mode !== "prevendeur_direct",
                    enableQualiteControle: opt.mode === "full_process",
                  }))}>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${processCfg.mode === opt.mode ? "border-transparent" : "border-slate-300"}`}>
                    {processCfg.mode === opt.mode && <div className={`w-2 h-2 rounded-full ${opt.dot}`} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm text-slate-900">{opt.label}</p>
                      {processCfg.mode === opt.mode && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-300">Actif</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed" dir="rtl">{opt.labelAr}</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Module toggles */}
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
            <h3 className="font-bold text-sm text-slate-900">Modules actifs / الوحدات النشطة</h3>
            <div className="flex flex-col gap-3">
              {([
                { key: "enableAchat" as const,               label: "Module Achat",                desc: "Permet aux acheteurs de saisir des bons d'achat" },
                { key: "enableReception" as const,           label: "Reception marchandise",       desc: "Magasinier enregistre la reception physique" },
                { key: "enablePreparation" as const,         label: "Preparation commandes",       desc: "Equipe de preparation traite les commandes validees" },
                { key: "enableLogistiqueValidation" as const, label: "Validation Logistique",      desc: "Logistique doit valider avant livraison" },
                { key: "enableBLPrint" as const,             label: "Impression BL",               desc: "Bon de livraison imprime a chaque livraison" },
                { key: "enableTripDispatch" as const,        label: "Dispatch tournees",           desc: "Dispatching des tournees de livraison" },
                { key: "enableCaisse" as const,              label: "Module Caisse",               desc: "Suivi encaissements et mouvements de caisse" },
                { key: "enableQualiteControle" as const,     label: "Controle Qualite (QC)",       desc: "Porte qualite avec controle a chaque etape" },
                { key: "enableControlAchat" as const,        label: "Controle Achat",              desc: "Ctrl achat scanne et verifie la marchandise achetee avant entree en stock" },
                { key: "enableControlPreparation" as const,  label: "Controle Preparation",        desc: "Ctrl prep verifie les colis prepares avant chargement dans le camion" },
                { key: "enableControlExpedition" as const,   label: "Controle Expedition",         desc: "Ctrl expedition valide le chargement final avant le depart du camion" },
                { key: "enableDispatchCommandes" as const,   label: "Dispatch Commandes",          desc: "Le dispatcheur affecte les commandes aux trips de livraison" },
                { key: "photoAchatObligatoire" as const,     label: "Photo achat obligatoire",     desc: "Exiger une photo de la marchandise pour confirmer un achat (mobile acheteur)" },
                { key: "modeCrossdocking" as const,          label: "Mode Crossdocking",           desc: "Commercial saisit → acheteur (PO) → logistique prépare/valide/charge → écart achat↔prép → livraison → cash-man en fin de tournée" },
              ] as { key: keyof ProcessConfig; label: string; desc: string }[]).map(item => (
                <div key={item.key} className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                  </div>
                  <button
                    onClick={() => setProcessCfg(p => ({ ...p, [item.key]: !p[item.key as keyof ProcessConfig] }))}
                    className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0 mt-0.5 ${processCfg[item.key] ? "bg-teal-500" : "bg-slate-200"}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${processCfg[item.key] ? "left-5" : "left-1"}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Camera per stage */}
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <h3 className="font-bold text-sm text-slate-900">Caméra par étape / الكاميرا حسب المرحلة</h3>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">Activez ou désactivez l&apos;accès caméra pour chaque étape du process</p>
            <div className="flex flex-col gap-3">
              {([
                { key: "cameraReception"     as const, label: "Réception marchandise",    desc: "Photo à la réception des marchandises" },
                { key: "cameraPreparation"   as const, label: "Préparation commandes",     desc: "Photo lors de la préparation des colis" },
                { key: "cameraLivraison"     as const, label: "Livraison client",          desc: "Photo preuve de livraison chez le client" },
                { key: "cameraControlAchat"  as const, label: "Contrôle achat",            desc: "Photo pendant le contrôle de la marchandise achetée" },
                { key: "cameraControlPrep"   as const, label: "Contrôle préparation",      desc: "Photo pendant le contrôle des colis préparés" },
                { key: "cameraRetour"        as const, label: "Retours marchandise",       desc: "Photo des produits retournés par le client" },
                { key: "cameraSignature"     as const, label: "Signature & confirmation",  desc: "Photo de la signature client ou document signé" },
              ] as { key: keyof ProcessConfig; label: string; desc: string }[]).map(item => (
                <div key={item.key} className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <svg className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setProcessCfg(p => ({ ...p, [item.key]: !(p[item.key] ?? true) }))}
                    className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0 mt-0.5 ${(processCfg[item.key] ?? true) ? "bg-teal-500" : "bg-slate-200"}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${(processCfg[item.key] ?? true) ? "left-5" : "left-1"}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Détails par étape — sub-options per step ── */}
          {(() => {
            const STEP_DETAILS: {
              key: keyof ProcessConfig
              stepId: string
              label: string
              labelAr: string
              color: string
              icon: string
              subOptions: { id: string; label: string; labelAr: string; desc: string; risk?: "high" | "medium" }[]
            }[] = [
              {
                key: "enableAchat", stepId: "achat", label: "Achat Marché", labelAr: "الشراء",
                color: "border-amber-300 bg-amber-50",
                icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
                subOptions: [
                  { id: "requireGPS",          label: "GPS obligatoire",              labelAr: "GPS إلزامي",           desc: "L'acheteur doit partager sa position GPS lors de l'achat" },
                  { id: "requirePhoto",         label: "Photo marchandise obligatoire",labelAr: "صورة إلزامية",          desc: "Une photo des produits achetés doit être jointe au bon d'achat" },
                  { id: "requireValidation",    label: "Validation manager avant entrée stock", labelAr: "تأكيد المدير",  desc: "Un manager doit approuver le bon d'achat avant mise à jour du stock" },
                  { id: "requireFournisseur",   label: "Fournisseur obligatoire",      labelAr: "المورد إلزامي",         desc: "Le fournisseur doit être sélectionné depuis la liste officielle" },
                  { id: "limitMontant",         label: "Plafonner le montant par achat",labelAr: "سقف مبلغ الشراء",     desc: "Bloquer si le montant total dépasse un seuil défini", risk: "medium" },
                ],
              },
              {
                key: "enableReception", stepId: "reception", label: "Réception Marchandise", labelAr: "الاستلام",
                color: "border-sky-300 bg-sky-50",
                icon: "M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4",
                subOptions: [
                  { id: "requirePhotoReception", label: "Photo réception obligatoire", labelAr: "صورة الاستلام",        desc: "Photo de la marchandise reçue obligatoire avant validation" },
                  { id: "requirePesee",           label: "Pesée obligatoire",          labelAr: "الوزن إلزامي",          desc: "Saisir le poids exact reçu pour vérification avec bon d'achat" },
                  { id: "autoStock",              label: "Mise à jour stock automatique",labelAr: "تحديث تلقائي للمخزون", desc: "Le stock est mis à jour dès la validation de la réception" },
                  { id: "requireQC",              label: "Contrôle qualité à la réception",labelAr: "مراقبة الجودة",     desc: "Un contrôleur QC doit valider la qualité avant entrée en stock" },
                  { id: "requireSignatureMag",    label: "Signature magasinier",        labelAr: "توقيع أمين المخزن",    desc: "Le magasinier doit confirmer la réception avec sa signature" },
                ],
              },
              {
                key: "enablePreparation", stepId: "preparation", label: "Préparation Commandes", labelAr: "التحضير",
                color: "border-violet-300 bg-violet-50",
                icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
                subOptions: [
                  { id: "requirePrintBP",         label: "Impression bon de préparation",labelAr: "طباعة وصل التحضير",   desc: "Le bon de préparation doit être imprimé avant de commencer" },
                  { id: "requireScan",            label: "Scan articles obligatoire",   labelAr: "مسح المواد",           desc: "Chaque article doit être scanné (barcode/QR) lors de la prépa" },
                  { id: "requirePhotoColisP",     label: "Photo colis préparé",         labelAr: "صورة الطرد",           desc: "Photo du colis final obligatoire avant chargement" },
                  { id: "requireSignaturePrep",   label: "Signature préparateur",       labelAr: "توقيع المعبّأ",         desc: "Le préparateur doit signer le bon de préparation" },
                  { id: "requireWeightCheck",     label: "Vérification poids colis",    labelAr: "التحقق من وزن الطرد",  desc: "Peser chaque colis et comparer au poids théorique de la commande" },
                ],
              },
              {
                key: "enableTripDispatch", stepId: "dispatch", label: "Dispatch & Tournées", labelAr: "التوزيع",
                color: "border-cyan-300 bg-cyan-50",
                icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
                subOptions: [
                  { id: "requireGPSDepart",       label: "GPS départ obligatoire",      labelAr: "GPS الانطلاق",          desc: "Le livreur doit partager sa position GPS avant le départ" },
                  { id: "requireVerifCharge",     label: "Vérification charge camion",  labelAr: "تحقق من حمولة الشاحنة", desc: "Valider que le camion n'est pas surchargé avant départ" },
                  { id: "requireListeClients",    label: "Liste clients validée",       labelAr: "قائمة العملاء مؤكدة",  desc: "Le dispatch doit confirmer la liste des clients de la tournée" },
                  { id: "autoNotifyClients",      label: "Notification clients auto",   labelAr: "إشعار تلقائي للعملاء", desc: "Envoyer un WhatsApp automatique aux clients lors du départ du livreur" },
                ],
              },
              {
                key: "enableLogistiqueValidation", stepId: "livraison", label: "Livraison Client", labelAr: "التسليم",
                color: "border-emerald-300 bg-emerald-50",
                icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
                subOptions: [
                  { id: "requireSignatureClient", label: "Signature client obligatoire", labelAr: "توقيع العميل إلزامي",  desc: "Le client doit signer électroniquement ou sur papier à la livraison" },
                  { id: "requirePhotoLivraison",  label: "Photo preuve de livraison",   labelAr: "صورة إثبات التسليم",    desc: "Une photo de la livraison effectuée doit être capturée" },
                  { id: "requireGPSLivraison",    label: "GPS confirmation livraison",  labelAr: "GPS تأكيد التسليم",     desc: "La position GPS est enregistrée au moment de la livraison" },
                  { id: "allowPartial",           label: "Livraison partielle autorisée",labelAr: "تسليم جزئي مسموح",     desc: "Le livreur peut livrer une quantité partielle et noter le reste" },
                  { id: "requireCodeConfirm",     label: "Code de confirmation client", labelAr: "رمز تأكيد العميل",      desc: "Le client reçoit un code SMS/WhatsApp à donner au livreur", risk: "medium" },
                ],
              },
              {
                key: "enableCaisse", stepId: "caisse", label: "Caisse & Encaissement", labelAr: "الصندوق",
                color: "border-rose-300 bg-rose-50",
                icon: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
                subOptions: [
                  { id: "requirePhotoRecu",       label: "Photo reçu de paiement",      labelAr: "صورة إيصال الدفع",     desc: "Photo de l'argent remis ou du virement doit être jointe" },
                  { id: "requireValidationMgr",   label: "Validation manager caisse",   labelAr: "تأكيد المدير للصندوق", desc: "Un manager doit valider chaque encaissement au-delà du seuil" },
                  { id: "autoRapprochement",      label: "Rapprochement automatique",   labelAr: "تسوية تلقائية",        desc: "Comparer automatiquement cash reçu vs montant BL attendu" },
                  { id: "limitCashSansValid",     label: "Plafond cash sans validation",labelAr: "سقف النقد بدون تأكيد", desc: "Au-dessus de ce montant, validation manager obligatoire", risk: "high" },
                ],
              },
            ]

            const activeSteps = STEP_DETAILS.filter(s => processCfg[s.key])

            const toggleSubStep = (stepId: string, optId: string) => {
              setProcessSubSteps(prev => ({
                ...prev,
                [stepId]: { ...(prev[stepId] ?? {}), [optId]: !((prev[stepId] ?? {})[optId]) },
              }))
            }

            if (activeSteps.length === 0) return null

            return (
              <div className="bg-card rounded-2xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-3 bg-gradient-to-r from-teal-50 to-cyan-50">
                  <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Configuration détaillée par étape</h3>
                    <p className="text-xs text-teal-700">Activez ou désactivez les sous-options de chaque étape du process</p>
                  </div>
                </div>

                {/* Visual flow + per-step config */}
                <div className="divide-y divide-border">
                  {activeSteps.map((step, idx) => {
                    const isExpanded = expandedStep === step.stepId
                    const stepSub = processSubSteps[step.stepId] ?? {}
                    const activeCount = step.subOptions.filter(o => stepSub[o.id]).length
                    return (
                      <div key={step.stepId}>
                        {/* Step header */}
                        <button
                          type="button"
                          onClick={() => setExpandedStep(isExpanded ? null : step.stepId)}
                          className={`w-full flex items-center gap-3 px-5 py-3.5 hover:bg-muted/30 transition-colors text-left`}>
                          {/* Step number */}
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 border-2 ${step.color}`}>
                            {idx + 1}
                          </div>
                          <svg className="w-4 h-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={step.icon} />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-800">{step.label}</span>
                              <span className="text-[10px] text-slate-400" dir="rtl">{step.labelAr}</span>
                            </div>
                            <p className="text-xs text-slate-500">
                              {activeCount > 0
                                ? `${activeCount}/${step.subOptions.length} options activées`
                                : `${step.subOptions.length} options disponibles`}
                            </p>
                          </div>
                          {activeCount > 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 border border-teal-200 shrink-0">
                              {activeCount} actif{activeCount > 1 ? "s" : ""}
                            </span>
                          )}
                          <svg className={`w-4 h-4 text-slate-400 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {/* Sub-options */}
                        {isExpanded && (
                          <div className={`px-5 pb-4 pt-1 ${step.color.includes("amber") ? "bg-amber-50/40" : step.color.includes("sky") ? "bg-sky-50/40" : step.color.includes("violet") ? "bg-violet-50/40" : step.color.includes("cyan") ? "bg-cyan-50/40" : step.color.includes("emerald") ? "bg-emerald-50/40" : "bg-rose-50/40"}`}>
                            <div className="flex flex-col gap-2 pl-10">
                              {step.subOptions.map(opt => {
                                const isOn = !!stepSub[opt.id]
                                return (
                                  <div key={opt.id} className="flex items-start gap-3 py-2 border-b border-white/60 last:border-0">
                                    <button
                                      type="button"
                                      onClick={() => toggleSubStep(step.stepId, opt.id)}
                                      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 mt-0.5 ${isOn ? "bg-teal-500" : "bg-slate-200"}`}>
                                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${isOn ? "left-4" : "left-0.5"}`} />
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className={`text-sm font-semibold ${isOn ? "text-slate-900" : "text-slate-500"}`}>{opt.label}</p>
                                        {opt.risk === "high" && (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">⚠ CRITIQUE</span>
                                        )}
                                        {opt.risk === "medium" && (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 border border-orange-200">⚠ ATTENTION</span>
                                        )}
                                      </div>
                                      <p className="text-xs text-slate-400 mt-0.5">{opt.desc}</p>
                                      <p className="text-[10px] text-slate-400" dir="rtl">{opt.labelAr}</p>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${isOn ? "bg-teal-100 text-teal-700 border border-teal-200" : "bg-slate-100 text-slate-400 border border-slate-200"}`}>
                                      {isOn ? "ON" : "OFF"}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Notes */}
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-2">
            <label className="text-sm font-semibold text-slate-800">Notes / ملاحظات</label>
            <textarea
              rows={2}
              value={processCfg.notes ?? ""}
              onChange={e => setProcessCfg(p => ({ ...p, notes: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              placeholder="Notes sur la configuration du process..."
            />
          </div>

          {processSaved && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {processSaved}
            </div>
          )}

          <button
            onClick={() => {
              store.saveProcessConfig(processCfg)
              store.saveProcessSubSteps(processSubSteps)
              setProcessSaved("Process + sous-étapes sauvegardés")
              setTimeout(() => setProcessSaved(""), 2500)
            }}
            className="self-start flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: "oklch(0.45 0.18 185)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Sauvegarder le process
          </button>
        </div>
      )}

      {/* === BPM WORKFLOW MANAGER === */}
      {tab === "workflow" && (
        <div className="flex flex-col gap-5">
          {/* Header */}
          <div className="flex flex-col gap-1 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
              </div>
              <div>
                <p className="font-bold text-slate-900 text-base">Gestionnaire de Workflow BPM</p>
                <p className="text-xs text-blue-700">Activez, desactivez ou contournez chaque etape du processus logistique</p>
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-1 leading-relaxed">
              Les etapes <strong>obligatoires</strong> ne peuvent pas etre desactivees. Les <strong>Portes qualite</strong> peuvent etre contournees (bypass) sans etre desactivees.
            </p>
          </div>

          {/* Validation commande (existing) */}
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
            <h3 className="font-bold text-sm text-slate-900">Mode de validation des commandes / نمط المصادقة</h3>
            <div className="flex flex-col gap-2">
              {[
                { v: "direct" as const, label: "Validation directe", desc: "Commande auto-validee des la saisie du prevendeur. Aucune approbation requise.", color: "border-green-300 bg-green-50", dot: "bg-green-500" },
                { v: "responsable" as const, label: "Approbation Responsable Commercial", desc: "Commande en attente jusqu'a validation du Responsable Commercial ou Admin.", color: "border-blue-300 bg-blue-50", dot: "bg-blue-500" },
                { v: "admin" as const, label: "Approbation Admin uniquement", desc: "Seuls Admin et Super Admin peuvent valider. Niveau de controle maximal.", color: "border-violet-300 bg-violet-50", dot: "bg-violet-600" },
              ].map(opt => (
                <label key={opt.v} className={`flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${workflow.validationCommande === opt.v ? opt.color : "border-border bg-background hover:bg-muted/30"}`}>
                  <input type="radio" name="workflowval" className="hidden" checked={workflow.validationCommande === opt.v}
                    onChange={() => setWorkflow(prev => ({ ...prev, validationCommande: opt.v }))} />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${workflow.validationCommande === opt.v ? "border-transparent" : "border-slate-300"}`}>
                    {workflow.validationCommande === opt.v && <div className={`w-2 h-2 rounded-full ${opt.dot}`} />}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-slate-900">{opt.label}</p>
                    <p className="text-xs text-slate-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* BPM Steps */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Etapes du processus (BPM)</h3>
                <p className="text-xs text-slate-500 mt-0.5">9 etapes de la commande a l&apos;encaissement</p>
              </div>
              <button
                onClick={() => setWorkflow(prev => ({
                  ...prev,
                  steps: (prev.steps ?? DEFAULT_WORKFLOW_STEPS).map(s => s.mandatory ? s : { ...s, enabled: true, bypassed: false })
                }))}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 transition-colors">
                Tout activer
              </button>
            </div>
            <div className="divide-y divide-border">
              {(workflow.steps ?? DEFAULT_WORKFLOW_STEPS).map((step, idx) => (
                <div key={step.id} className={`flex items-start gap-4 px-5 py-4 transition-colors ${!step.enabled && !step.mandatory ? "bg-slate-50/50 opacity-60" : "bg-background"}`}>
                  {/* Step number */}
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black shrink-0 mt-0.5 ${
                    step.mandatory ? "bg-slate-900 text-white" :
                    step.gate ? "bg-amber-100 text-amber-800 border border-amber-300" :
                    step.enabled ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-400"
                  }`}>
                    {idx + 1}
                  </div>
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm text-slate-900">{step.label}</p>
                      {step.mandatory && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-900 text-white">Obligatoire</span>
                      )}
                      {step.gate && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">Porte qualite</span>
                      )}
                      {step.bypassed && step.enabled && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300">Contourne</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{step.description}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5" dir="rtl">{step.labelAr}</p>
                  </div>
                  {/* Controls */}
                  <div className="flex flex-col gap-2 items-end shrink-0">
                    {/* Enable/Disable toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 font-medium">
                        {step.enabled ? "Actif" : "Desactive"}
                      </span>
                      <button
                        disabled={step.mandatory}
                        onClick={() => setWorkflow(prev => ({
                          ...prev,
                          steps: (prev.steps ?? DEFAULT_WORKFLOW_STEPS).map(s =>
                            s.id === step.id ? { ...s, enabled: !s.enabled } : s
                          )
                        }))}
                        className={`relative w-10 h-6 rounded-full transition-colors ${step.mandatory ? "opacity-40 cursor-not-allowed" : "cursor-pointer"} ${step.enabled ? "bg-emerald-500" : "bg-slate-200"}`}
                        title={step.mandatory ? "Etape obligatoire — ne peut pas etre desactivee" : undefined}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${step.enabled ? "left-5" : "left-1"}`} />
                      </button>
                    </div>
                    {/* Bypass toggle — only for gate steps when enabled */}
                    {step.canBypass && step.enabled && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-orange-600 font-medium">Bypass</span>
                        <button
                          onClick={() => setWorkflow(prev => ({
                            ...prev,
                            steps: (prev.steps ?? DEFAULT_WORKFLOW_STEPS).map(s =>
                              s.id === step.id ? { ...s, bypassed: !s.bypassed } : s
                            )
                          }))}
                          className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${step.bypassed ? "bg-orange-400" : "bg-slate-200"}`}>
                          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${step.bypassed ? "left-5" : "left-1"}`} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-slate-700 mb-2">Resume du workflow actuel</p>
            <div className="flex flex-wrap gap-1.5">
              {(workflow.steps ?? DEFAULT_WORKFLOW_STEPS).map((step, idx) => (
                <div key={step.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                  !step.enabled && !step.mandatory ? "bg-slate-100 text-slate-400 border-slate-200 line-through" :
                  step.bypassed ? "bg-orange-100 text-orange-700 border-orange-300" :
                  step.mandatory ? "bg-slate-900 text-white border-slate-900" :
                  "bg-blue-100 text-blue-800 border-blue-200"
                }`}>
                  <span>{idx + 1}</span>
                  <span>{step.label.split(" ")[0]}</span>
                  {step.bypassed && <span>(bypass)</span>}
                  {!step.enabled && !step.mandatory && <span>(skip)</span>}
                </div>
              ))}
            </div>
          </div>

          <button onClick={() => { store.saveWorkflowConfig(workflow); setSaved("Workflow BPM sauvegarde"); setTimeout(() => setSaved(""), 2500) }}
            className="self-start flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: "oklch(0.38 0.2 260)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            Sauvegarder le workflow BPM
          </button>
        </div>
      )}

      {/* Email config */}
      {tab === "emails" && (
        <div className="flex flex-col gap-4">
          {/* Lock notice for non-admin */}
          {!canEditEmails && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>
                <strong>Acces restreint</strong> — La modification des adresses email de notification est reservee aux <strong>Admin</strong> et <strong>Super Admin</strong> uniquement.
              </span>
            </div>
          )}

          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-foreground text-sm">Adresses email de notification / عناوين الإشعار</h3>
              {canEditEmails && (
                <span className="text-[11px] text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5 font-semibold">Modifiable</span>
              )}
              {!canEditEmails && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground bg-muted border border-border rounded-full px-2.5 py-0.5">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Lecture seule
                </span>
              )}
            </div>
            {[
              { key: "achat" as keyof EmailConfig, label: "Email achat / الشراء", placeholder: "acheteur@freshlink.ma" },
              { key: "commercial" as keyof EmailConfig, label: "Email commercial / التجاري", placeholder: "commercial@freshlink.ma" },
              { key: "recap" as keyof EmailConfig, label: "Email recap journalier / الملخص اليومي", placeholder: "admin@freshlink.ma" },
              { key: "besoinAchat" as keyof EmailConfig, label: "Email besoin d'achat / احتياج الشراء", placeholder: "acheteur@freshlink.ma" },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">{label}</label>
                {canEditEmails ? (
                  <input type="email" value={config[key] as string}
                    onChange={e => setConfig({ ...config, [key]: e.target.value })}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={placeholder} />
                ) : (
                  <div className="px-3 py-2.5 rounded-xl border border-border bg-muted text-sm text-muted-foreground font-mono select-none">
                    {(config[key] as string) || <span className="italic text-muted-foreground/60">{placeholder}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <h3 className="font-semibold text-foreground text-sm">Envoi automatique du récap / الإرسال التلقائي</h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <div className={`relative w-11 h-6 rounded-full transition-colors ${config.recapAuto ? "bg-indigo-600" : "bg-muted"}`}
                onClick={() => setConfig({ ...config, recapAuto: !config.recapAuto })}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.recapAuto ? "translate-x-6" : "translate-x-1"}`} />
              </div>
              <span className="text-sm font-medium text-foreground">Récap journalier automatique</span>
            </label>
            {config.recapAuto && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Heure d&apos;envoi</label>
                <input type="time" value={config.recapHeure} onChange={e => setConfig({ ...config, recapHeure: e.target.value })}
                  className="w-32 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer">
              <div className={`relative w-11 h-6 rounded-full transition-colors ${config.besoinAuto ? "bg-indigo-600" : "bg-muted"}`}
                onClick={() => setConfig({ ...config, besoinAuto: !config.besoinAuto })}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.besoinAuto ? "translate-x-6" : "translate-x-1"}`} />
              </div>
              <span className="text-sm font-medium text-foreground">Besoin d&apos;achat automatique (email)</span>
            </label>
            {config.besoinAuto && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-foreground">Heure d&apos;envoi besoin achat</label>
                <input type="time" value={config.besoinHeure} onChange={e => setConfig({ ...config, besoinHeure: e.target.value })}
                  className="w-32 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            )}
          </div>

          {/* Besoin push mobile acheteur */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <div>
              <h3 className="font-semibold text-foreground text-sm">Notification besoin d&apos;achat — Acheteur mobile</h3>
              <p className="text-xs text-muted-foreground mt-1">Quand une commande est validee, le besoin par SKU est recalcule et envoye automatiquement a l&apos;acheteur sur son mobile apres le delai configure.</p>
            </div>

            <label className="flex items-center gap-3 cursor-pointer">
              <div className={`relative w-11 h-6 rounded-full transition-colors ${config.besoinPushAuto ? "bg-blue-600" : "bg-muted"}`}
                onClick={() => canEditEmails && setConfig({ ...config, besoinPushAuto: !config.besoinPushAuto })}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.besoinPushAuto ? "translate-x-6" : "translate-x-1"}`} />
              </div>
              <div>
                <span className="text-sm font-medium text-foreground">Push automatique vers l&apos;acheteur</span>
                <p className="text-xs text-muted-foreground">Le besoin SKU apparait automatiquement sur le mobile de l&apos;acheteur</p>
              </div>
            </label>

            {config.besoinPushAuto && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-foreground">Delai avant notification sur mobile acheteur (minutes)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min={0} max={480} step={5}
                    value={config.besoinDelaiMinutes ?? 0}
                    onChange={e => canEditEmails && setConfig({ ...config, besoinDelaiMinutes: Number(e.target.value) })}
                    className="flex-1 accent-blue-600"
                    disabled={!canEditEmails}
                  />
                  <input
                    type="number" min={0} max={480} step={5}
                    value={config.besoinDelaiMinutes ?? 0}
                    onChange={e => canEditEmails && setConfig({ ...config, besoinDelaiMinutes: Math.min(480, Math.max(0, Number(e.target.value))) })}
                    disabled={!canEditEmails}
                    className="w-20 px-2 py-2 rounded-xl border border-border bg-background text-center font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-muted disabled:text-muted-foreground"
                  />
                  <div className="w-20 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-2 rounded-xl text-center">
                    {config.besoinDelaiMinutes === 0
                      ? "Immediat"
                      : config.besoinDelaiMinutes < 60
                        ? `${config.besoinDelaiMinutes} min`
                        : `${Math.floor((config.besoinDelaiMinutes ?? 0) / 60)}h${(config.besoinDelaiMinutes ?? 0) % 60 > 0 ? `${(config.besoinDelaiMinutes ?? 0) % 60}min` : ""}`
                    }
                  </div>
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0 — Immediat</span>
                  <span>1h</span>
                  <span>2h</span>
                  <span>4h</span>
                  <span>8h max</span>
                </div>

                <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-800 mt-1">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    Apres validation d'une commande, le systeme attend <strong>{config.besoinDelaiMinutes === 0 ? "0 minute (immediat)" : `${config.besoinDelaiMinutes} minute(s)`}</strong> avant de mettre a jour l'onglet "Besoin par SKU" de l'acheteur. Ce delai permet de regrouper plusieurs commandes successives en un seul calcul.
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 p-4 rounded-2xl border border-border bg-card">
            <h3 className="font-semibold text-foreground text-sm">Intégration WhatsApp / واتساب</h3>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-green-50 border border-green-200">
              <svg className="w-5 h-5 text-green-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
              <div>
                <p className="text-sm font-semibold text-green-700">WhatsApp Business API</p>
                <p className="text-xs text-green-600 mt-0.5">Pour les workflows WhatsApp (BL, commandes, alertes), configurez votre clé API WhatsApp Business. Entrez votre numéro de groupe ou de communauté dans la section workflows.</p>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground">Numéro WhatsApp Business (avec indicatif)</label>
              <input type="tel" className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="+212 600 000 000" />
            </div>
          </div>

          {canEditEmails && (
            <button onClick={handleSaveConfig}
              className="self-start flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: "oklch(0.38 0.2 260)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Sauvegarder la configuration
            </button>
          )}
        </div>
      )}

      {/* Poids Contenants */}
      {tab === "contenants" && (
        <div className="flex flex-col gap-4">
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-bold text-foreground mb-1">Poids des contenants / Tares</h3>
            <p className="text-xs text-muted-foreground mb-4">
              Ces poids sont utilises pour calculer le poids net a la reception.
              Caisse, Demi-caisse, Dolly (bois), Chariot — modifiables a tout moment.
            </p>
            <div className="flex flex-col gap-3">
              {contenants.map((c, idx) => (
                <div key={c.id} className="flex items-center gap-3 p-3 bg-muted rounded-xl">
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={c.nom}
                      onChange={e => setContenants(prev => prev.map((x, i) => i === idx ? { ...x, nom: e.target.value } : x))}
                      className="w-full text-sm font-semibold bg-transparent border-none outline-none text-foreground"
                      placeholder="Nom du contenant"
                    />
                    <input
                      type="text"
                      value={c.notes ?? ""}
                      onChange={e => setContenants(prev => prev.map((x, i) => i === idx ? { ...x, notes: e.target.value } : x))}
                      className="w-full text-[11px] bg-transparent border-none outline-none text-muted-foreground mt-0.5"
                      placeholder="Notes (optionnel)"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={c.poidsKg}
                      onChange={e => setContenants(prev => prev.map((x, i) => i === idx ? { ...x, poidsKg: Number(e.target.value) } : x))}
                      className="w-20 text-sm font-bold text-right px-2 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <span className="text-xs text-muted-foreground">kg</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-muted-foreground mr-1">Actif</span>
                    <button
                      onClick={() => setContenants(prev => prev.map((x, i) => i === idx ? { ...x, actif: !x.actif } : x))}
                      className={`w-9 h-5 rounded-full transition-colors relative ${c.actif ? "bg-primary" : "bg-muted-foreground/30"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${c.actif ? "left-4" : "left-0.5"}`} />
                    </button>
                  </div>
                  <button
                    onClick={() => setContenants(prev => prev.filter((_, i) => i !== idx))}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors shrink-0">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>

            {/* Add new */}
            <button
              onClick={() => setContenants(prev => [...prev, {
                id: `ct_${Date.now()}`,
                nom: "Nouveau contenant",
                poidsKg: 1.0,
                actif: true,
                notes: "",
              }])}
              className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-primary text-primary text-sm font-semibold hover:bg-primary/5 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Ajouter un contenant
            </button>
          </div>

          {contenantSaved && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {contenantSaved}
            </div>
          )}

          <button
            onClick={() => {
              store.saveContenantsConfig(contenants)
              setContenantSaved("Poids des contenants sauvegardés.")
              setTimeout(() => setContenantSaved(""), 2500)
            }}
            className="self-start px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
            Sauvegarder les poids
          </button>
        </div>
      )}

      {/* DataGuard */}
      {tab === "dataguard" && (
        <div className="flex flex-col gap-4">

          {dgMsg && (
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm ${dgMsg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
              {dgMsg.ok
                ? <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                : <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              }
              {dgMsg.text}
            </div>
          )}

          {/* Données Démo */}
          <div className="bg-card rounded-2xl border border-emerald-200 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-50">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-emerald-700 text-sm">Charger les données démo / تحميل بيانات تجريبية</h3>
                <p className="text-xs text-muted-foreground">Pré-remplir l&apos;app avec des clients, articles, commandes et livraisons réalistes</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Clients", value: "6", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" },
                { label: "Articles", value: "8", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
                { label: "Commandes", value: "5", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
                { label: "Voyages", value: "3", icon: "M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" },
              ].map(item => (
                <div key={item.label} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                  <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                  </svg>
                  <span className="text-lg font-bold text-emerald-700">{item.value}</span>
                  <span className="text-xs text-emerald-600">{item.label}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ajoute des données marocaines réalistes (fruits & légumes, Casablanca) sans écraser les données existantes. Idéal pour explorer toutes les fonctionnalités. Les données portent le préfixe <code className="bg-muted px-1 rounded font-mono">seed-</code> et peuvent être supprimées via &quot;Effacer toutes les données&quot;.
            </p>
            {seedMsg && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${seedMsg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                {seedMsg.ok
                  ? <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  : <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                }
                {seedMsg.text}
              </div>
            )}
            <button
              onClick={handleSeedDemo}
              disabled={seeding}
              className="self-start flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              {seeding
                ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
              }
              {seeding ? "Chargement…" : "Charger les données démo"}
            </button>
          </div>

          {/* Sauvegarde */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.92 0.05 260)" }}>
                <svg className="w-5 h-5" style={{ color: "oklch(0.38 0.2 260)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Exporter la sauvegarde / تصدير النسخ الاحتياطي</h3>
                <p className="text-xs text-muted-foreground">Téléchargez toutes les données en un fichier JSON</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cette action exporte l&apos;intégralité des données stockées dans le navigateur (commandes, bons, stocks, utilisateurs, paramètres) dans un fichier <code className="bg-muted px-1 rounded font-mono">freshlink-backup-[date].json</code>. Conservez ce fichier en lieu sûr.
            </p>
            <button onClick={handleExport}
              className="self-start flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: "oklch(0.38 0.2 260)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
              Exporter (.json)
            </button>
          </div>

          {/* Restauration */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "oklch(0.92 0.06 165)" }}>
                <svg className="w-5 h-5 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm">Importer une sauvegarde / استيراد النسخ الاحتياطي</h3>
                <p className="text-xs text-muted-foreground">Restaurez les données depuis un fichier JSON exporté</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
              <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-xs text-amber-800">L&apos;import <strong>écrase</strong> les données actuelles. Faites d&apos;abord une sauvegarde si nécessaire.</p>
            </div>
            <input ref={importRef} type="file" accept=".json,application/json" onChange={handleImport} className="hidden" id="import-json-file" />
            <label htmlFor="import-json-file"
              className="self-start flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-colors cursor-pointer">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Choisir un fichier .json
            </label>
          </div>

          {/* (Test connectivité Supabase retiré d'ici — disponible dans 🔗 Connexion ERP) */}

          {/* Réinitialisation */}
          <div className="bg-card rounded-2xl border border-red-200 p-6 flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-50">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-red-700 text-sm">Réinitialiser les données / مسح البيانات</h3>
                <p className="text-xs text-muted-foreground">Choisissez le type de réinitialisation</p>
              </div>
            </div>

            {/* ── Deux actions principales ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Action 1 : Tout effacer sauf Jawad */}
              <div className="border-2 border-red-200 rounded-2xl p-5 bg-red-50/40 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🗑️</span>
                  <div>
                    <p className="text-sm font-black text-red-700">Tout effacer sauf Jawad</p>
                    <p className="text-[11px] text-red-500 mt-0.5">Local + Supabase · Irréversible · Supprime le doublon Jawad</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Supprime <strong>toutes les données</strong> (clients, commandes, articles, utilisateurs…).
                  Seul le compte Jawad est conservé.
                </p>
                {!showWipeConfirm ? (
                  <button onClick={() => setShowWipeConfirm(true)} disabled={wipingAll}
                    className="mt-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50">
                    {wipingAll ? "Effacement..." : "Tout effacer sauf Jawad"}
                  </button>
                ) : (
                  <div className="mt-auto flex flex-col gap-2">
                    <p className="text-xs font-bold text-red-700">Confirmer ? Cette action est irréversible.</p>
                    <div className="flex gap-2">
                      <button onClick={handleWipeAllExceptJawad}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors">
                        Oui, effacer tout
                      </button>
                      <button onClick={() => setShowWipeConfirm(false)}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-muted transition-colors">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Action 2 : Réinitialiser aux données démo */}
              <div className="border-2 border-amber-200 rounded-2xl p-5 bg-amber-50/40 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🔄</span>
                  <div>
                    <p className="text-sm font-black text-amber-700">Données démo</p>
                    <p className="text-[11px] text-amber-500 mt-0.5">Local uniquement · Restaure l&apos;état démo</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Recharge les <strong>données d&apos;exemple</strong> du système : clients démo, articles, commandes types, utilisateurs demo…
                </p>
                {!showResetConfirm ? (
                  <button onClick={() => setShowResetConfirm(true)} disabled={resetingDemo}
                    className="mt-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-amber-800 bg-amber-100 border border-amber-300 hover:bg-amber-200 transition-colors disabled:opacity-50">
                    {resetingDemo ? "Réinitialisation..." : "Réinitialiser aux données démo"}
                  </button>
                ) : (
                  <div className="mt-auto flex flex-col gap-2">
                    <p className="text-xs font-bold text-amber-700">Les données actuelles seront remplacées.</p>
                    <div className="flex gap-2">
                      <button onClick={handleResetToDemo}
                        className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors">
                        Oui, réinitialiser
                      </button>
                      <button onClick={() => setShowResetConfirm(false)}
                        className="flex-1 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-muted transition-colors">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* (Déconnecter tous les comptes déplacé dans la carte « Actions globales » ci-dessous — plus de doublon) */}

            {/* ── Mode avancé (sélection manuelle) ── */}
            <button onClick={() => setShowAdvancedReset(v => !v)}
              className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors self-start">
              <svg className={`w-3.5 h-3.5 transition-transform ${showAdvancedReset ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              Mode avancé — sélection manuelle des catégories
            </button>

            {showAdvancedReset && (
              <div className="flex flex-col gap-4 border border-border rounded-2xl p-4 bg-muted/20">
                {/* Scope */}
                <div className="flex gap-2 flex-wrap">
                  {([
                    { val: "local",    label: "Local uniquement",    desc: "Navigateur seulement" },
                    { val: "supabase", label: "Supabase uniquement", desc: "Base de données distante" },
                    { val: "both",     label: "Les deux",            desc: "Reset complet" },
                  ] as const).map(opt => (
                    <button key={opt.val} onClick={() => setClearMode(opt.val)}
                      className={`flex flex-col items-start px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${clearMode === opt.val ? "bg-red-100 border-red-400 text-red-800" : "border-border text-muted-foreground hover:bg-muted"}`}>
                      <span>{opt.label}</span>
                      <span className="text-[10px] opacity-70">{opt.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Checklist */}
                <div className="border border-red-100 rounded-xl p-4 flex flex-col gap-3 bg-red-50/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-700">Catégories à effacer ({clearTables.size}/{WIPE_ALL_TABLES.length})</span>
                    <div className="flex gap-2">
                      <button onClick={() => setClearTables(new Set(WIPE_ALL_TABLES))}
                        className="text-[11px] font-semibold text-red-600 hover:underline px-2 py-0.5 rounded hover:bg-red-100 transition-colors">Tout sélectionner</button>
                      <button onClick={() => setClearTables(new Set())}
                        className="text-[11px] font-semibold text-muted-foreground hover:underline px-2 py-0.5 rounded hover:bg-muted transition-colors">Tout décocher</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {([
                      { key: "fl_clients",          label: "Clients",              emoji: "👥" },
                      { key: "fl_fournisseurs",     label: "Fournisseurs",         emoji: "🏭" },
                      { key: "fl_articles",         label: "Articles / Catalogue", emoji: "📦" },
                      { key: "fl_commandes",        label: "Commandes Terrain",    emoji: "🛒" },
                      { key: "fl_commandes_web",    label: "Commandes Web",        emoji: "🌐" },
                      { key: "fl_bons_livraison",   label: "Bons de livraison",    emoji: "🚚" },
                      { key: "fl_bons_preparation", label: "Bons de préparation",  emoji: "📋" },
                      { key: "fl_bons_achat",       label: "Bons d'achat",         emoji: "🧾" },
                      { key: "fl_purchase_orders",  label: "Commandes achat",      emoji: "📄" },
                      { key: "fl_receptions",       label: "Réceptions",           emoji: "📥" },
                      { key: "fl_trips",            label: "Tournées",             emoji: "🗺️" },
                      { key: "fl_retours",          label: "Retours",              emoji: "↩️" },
                      { key: "fl_visites",          label: "Visites / Prospection",emoji: "📍" },
                      { key: "fl_transferts_stock", label: "Transferts stock",     emoji: "🔄" },
                      { key: "fl_demandes_achat",   label: "Demandes achat",       emoji: "📝" },
                      { key: "fl_messages",         label: "Messages",             emoji: "💬" },
                      { key: "fl_notices",          label: "Notices / Alertes",    emoji: "🔔" },
                      { key: "fl_non_achats",       label: "Non-achats",           emoji: "❌" },
                      { key: "fl_depots",           label: "Dépôts",               emoji: "🏪" },
                      { key: "fl_livreurs",         label: "Livreurs",             emoji: "🏍️" },
                      { key: "fl_users",            label: "Utilisateurs",         emoji: "👤" },
                      { key: "fl_account_requests", label: "Demandes de compte",   emoji: "📋" },
                      { key: "fl_prospects",        label: "Prospects",            emoji: "👀" },
                      { key: "fl_contrats",         label: "Contrats",             emoji: "📑" },
                      { key: "fl_caisse_vides",     label: "Caisses vides",        emoji: "📦" },
                      { key: "fl_incentives",       label: "Incentives",           emoji: "🎯" },
                      { key: "fl_perf_commercial",  label: "Perf. commerciale",    emoji: "📊" },
                    ] as const).map(t => {
                      const checked = clearTables.has(t.key)
                      return (
                        <label key={t.key}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer text-xs font-medium transition-colors select-none
                            ${checked ? "bg-red-100 border-red-300 text-red-800" : "bg-white border-gray-200 text-muted-foreground hover:border-red-200"}`}>
                          <input type="checkbox" checked={checked} onChange={e => {
                            const next = new Set(clearTables)
                            if (e.target.checked) next.add(t.key); else next.delete(t.key)
                            setClearTables(next)
                          }} className="accent-red-600 w-3.5 h-3.5 shrink-0" />
                          <span>{t.emoji}</span>
                          <span className="truncate">{t.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {clearTables.size === 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    ⚠️ Aucune catégorie sélectionnée.
                  </p>
                )}

                {!showClearConfirm ? (
                  <button onClick={() => setShowClearConfirm(true)} disabled={clearTables.size === 0}
                    className="self-start flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-red-300 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                    Effacer {clearTables.size} catégorie{clearTables.size > 1 ? "s" : ""} ({clearMode === "local" ? "local" : clearMode === "supabase" ? "Supabase" : "local + Supabase"})
                  </button>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-semibold text-red-700">
                      Confirmer la suppression de {clearTables.size} catégorie{clearTables.size > 1 ? "s" : ""} ?
                    </p>
                    <div className="flex gap-2">
                      <button onClick={handleClearAll} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors">
                        Oui, effacer
                      </button>
                      <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-colors">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Actions globales appareils ──────────────────────────────────── */}
          {user.role === "super_super_admin" && (
            <div className="bg-card rounded-2xl border border-orange-200 p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-orange-50">
                  <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-orange-700 text-sm">Actions globales / إجراءات عامة</h3>
                  <p className="text-xs text-muted-foreground">Déconnecter tous les comptes (sauf le vôtre). Le redémarrage des appareils est dans l'onglet Système.</p>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {/* Déconnecter tous les comptes */}
                <div className="flex items-start justify-between gap-3 p-4 rounded-xl bg-orange-50 border border-orange-200">
                  <div>
                    <p className="text-sm font-semibold text-orange-800">🔓 Déconnecter tous les comptes</p>
                    <p className="text-xs text-orange-600 mt-0.5">Force la déconnexion de tous les appareils connectés lors de leur prochaine interaction.</p>
                  </div>
                  <button
                    onClick={() => { if (confirm("Confirmer la déconnexion forcée de tous les comptes (sauf le vôtre) ?")) handleRevokeAllSessions() }}
                    disabled={revokingAll}
                    className="shrink-0 px-4 py-2 rounded-xl text-xs font-bold border border-orange-400 text-orange-700 bg-white hover:bg-orange-100 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    {revokingAll ? "En cours…" : "Déconnecter tout"}
                  </button>
                </div>
                {revokeMsg && (
                  <div className={`px-3 py-2 rounded-xl text-xs font-semibold ${revokeMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                    {revokeMsg.text}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* (Guide de passage en production retiré — non pertinent) */}

          {/* Info localStorage */}
          <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-muted/50">
            <svg className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-xs text-muted-foreground leading-relaxed">
              <p className="font-semibold text-foreground mb-1">Architecture de stockage actuelle</p>
              FreshLink utilise le <strong>localStorage</strong> du navigateur (~5–10 Mo). Les données sont propres à chaque appareil/navigateur. Pour une architecture multi-poste partagée, une migration vers une base de données cloud (Supabase, Firebase) est recommandée à long terme.
            </div>
          </div>
        </div>
      )}


      {/* Motifs retour */}
      {tab === "motifs" && (
        <div className="flex flex-col gap-4">
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
            <h3 className="font-semibold text-foreground text-sm">Ajouter un motif de retour / إضافة سبب إرجاع</h3>
            <div className="flex gap-2 flex-wrap">
              <input value={newMotif.label} onChange={e => setNewMotif({ ...newMotif, label: e.target.value })}
                className="flex-1 min-w-32 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Motif (Français)" />
              <input value={newMotif.labelAr} onChange={e => setNewMotif({ ...newMotif, labelAr: e.target.value })}
                dir="rtl"
                className="flex-1 min-w-32 px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="السبب (عربي)" />
              <button onClick={handleAddMotif}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0"
                style={{ background: "oklch(0.38 0.2 260)" }}>
                Ajouter
              </button>
            </div>
          </div>

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "oklch(0.14 0.03 260)", color: "oklch(0.88 0.015 245)" }}>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Motif</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" dir="rtl">السبب</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Statut</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {motifs.map((m, i) => (
                  <tr key={m.id} style={{ borderTop: "1px solid oklch(0.87 0.012 240)", background: i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)" }}>
                    <td className="px-4 py-3 font-medium text-foreground">{m.label}</td>
                    <td className="px-4 py-3 text-muted-foreground" dir="rtl">{m.labelAr}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${m.actif ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                        {m.actif ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => toggleMotif(m.id)} className={`p-1.5 rounded-lg hover:bg-muted transition-colors ${m.actif ? "text-amber-500" : "text-green-600"}`} title={m.actif ? "Désactiver" : "Activer"}>
                          {m.actif
                            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        </button>
                        <button onClick={() => deleteMotif(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
          ))}
          </tbody>
          </table>
          </div>
          </div>
          )}

      {/* ══ AI CONFIG TAB ══════════════════════════════════════════════════════ */}
      {tab === "ai_config" && (
        <div className="flex flex-col gap-5 max-w-3xl">

          {/* API Keys */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h3 className="font-bold text-sm text-foreground">Cles API (chiffrees en local)</h3>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">Les cles sont stockees uniquement dans le navigateur — elles ne quittent jamais votre appareil.</p>

            {[
              { key: "openaiKey",    label: "OpenAI API Key",    placeholder: "sk-proj-..." },
              { key: "anthropicKey", label: "Anthropic API Key", placeholder: "sk-ant-..." },
              { key: "geminiKey",    label: "Google Gemini Key", placeholder: "AIza..." },
            ].map(({ key, label, placeholder }) => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">{label}</label>
                <div className="flex gap-2">
                  <input
                    type={showKey[key] ? "text" : "password"}
                    value={aiCfg[key as keyof typeof aiCfg] as string ?? ""}
                    onChange={e => setAiCfg(c => ({ ...c, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="flex-1 px-3 py-2.5 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/30 font-mono"
                  />
                  <button type="button"
                    onClick={() => setShowKey(s => ({ ...s, [key]: !s[key] }))}
                    className="px-3 py-2 border border-border rounded-xl text-slate-400 hover:text-slate-700 hover:bg-muted transition-colors">
                    {showKey[key]
                      ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Model selector */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <h3 className="font-bold text-sm text-foreground">Modele IA par defaut</h3>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Modele actif</label>
              <select value={aiCfg.model ?? "gpt-4o"}
                onChange={e => setAiCfg(c => ({ ...c, model: e.target.value }))}
                className="px-3 py-2.5 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/30">
                <optgroup label="OpenAI">
                  <option value="gpt-4o">GPT-4o (recommande)</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                  <option value="gpt-3.5-turbo">GPT-3.5 Turbo (economique)</option>
                </optgroup>
                <optgroup label="Anthropic">
                  <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
                  <option value="claude-3-haiku">Claude 3 Haiku (rapide)</option>
                </optgroup>
                <optgroup label="Google">
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                </optgroup>
              </select>
            </div>
          </div>

          {/* System Prompt */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <h3 className="font-bold text-sm text-foreground">Prompt systeme (contexte logistique)</h3>
            <p className="text-xs text-muted-foreground -mt-2">Ce prompt est injecte en premier dans toutes les conversations IA pour garantir un comportement expert logistique.</p>
            <textarea
              value={aiCfg.systemPrompt ?? "Tu es un expert en logistique, distribution de fruits et legumes frais, et gestion d'operations commerciales. Tu reponds en francais, de facon concise et actionnable."}
              onChange={e => setAiCfg(c => ({ ...c, systemPrompt: e.target.value }))}
              rows={5}
              className="px-3 py-2.5 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none font-mono leading-relaxed"
            />
          </div>

          {/* Business toggles */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <h3 className="font-bold text-sm text-foreground">Regles metier — Interrupteurs</h3>
            {[
              { key: "qcObligatoireBL", label: "Verification QC obligatoire avant validation BL", desc: "Bloque l'expedition si le QC n'est pas signe" },
              { key: "alerteAchatEnabled", label: "Alertes email sur anomalies PA (Prix Achat)", desc: "Envoie un email si PA > Historique + seuil %" },
              { key: "alerteVenteEnabled", label: "Alertes email sur risque de perte (PV < PA)", desc: "Envoie un email si marge < seuil %" },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between gap-4 py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                </div>
                <button type="button"
                  onClick={() => setAiCfg(c => ({ ...c, [key]: !c[key as keyof typeof c] }))}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${aiCfg[key as keyof typeof aiCfg] ? "bg-emerald-500" : "bg-slate-200"}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${aiCfg[key as keyof typeof aiCfg] ? "left-6" : "left-1"}`} />
                </button>
              </div>
            ))}
          </div>

          {aiSaved && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {aiSaved}
            </div>
          )}
          <button
            onClick={() => {
              localStorage.setItem("fl_ai_config", JSON.stringify(aiCfg))
              // Sync qcObligatoireBL into workflow config too
              const wf = JSON.parse(localStorage.getItem("fl_workflow_config") ?? "{}")
              localStorage.setItem("fl_workflow_config", JSON.stringify({ ...wf, qcObligatoireBL: aiCfg.qcObligatoireBL ?? false }))
              setAiSaved("Configuration IA sauvegardee.")
              setTimeout(() => setAiSaved(""), 2500)
            }}
            className="self-start px-6 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 transition-colors shadow-sm">
            Sauvegarder configuration IA
          </button>
        </div>
      )}

      {/* ══ ALERTES TAB ═══════════════════════════════════════════════════════ */}
      {tab === "alertes" && (
        <div className="flex flex-col gap-5 max-w-3xl">

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-bold text-amber-800">Moteur d&apos;alertes Email — Logique de declenchement</p>
              <p className="text-xs text-amber-700 mt-1">
                Alerte PA : si nouveau PA &gt; Moyenne historique x (1 + seuil%), un email est envoye.<br />
                Alerte PV : si marge nette &lt; seuil%, un email &quot;Risque de perte&quot; est envoye.
              </p>
            </div>
          </div>

          {/* Email destinataire */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <h3 className="font-bold text-sm text-foreground">Email de reception des alertes</h3>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">Adresse email destinataire</label>
              <input type="email"
                value={alertCfg.emailDestinataire ?? ""}
                onChange={e => setAlertCfg(c => ({ ...c, emailDestinataire: e.target.value }))}
                placeholder="responsable@entreprise.ma"
                className="px-3 py-2.5 border border-border rounded-xl text-sm bg-background focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
              <p className="text-xs text-muted-foreground">Cet email recevra toutes les alertes PA et PV.</p>
            </div>
          </div>

          {/* Seuils */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <h3 className="font-bold text-sm text-foreground">Seuils de declenchement</h3>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">
                Seuil alerte PA — Ecart prix achat vs historique (%)
              </label>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={50} step={1}
                  value={alertCfg.paSeuilPct ?? 10}
                  onChange={e => setAlertCfg(c => ({ ...c, paSeuilPct: Number(e.target.value) }))}
                  className="flex-1 accent-amber-500"
                />
                <span className="font-bold text-amber-700 text-base w-12 text-center">
                  {alertCfg.paSeuilPct ?? 10}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Exemple : seuil 10% → alerte si PA &gt; Moy. historique x 1.10
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-slate-600">
                Seuil alerte PV — Marge minimum acceptable (%)
              </label>
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={40} step={1}
                  value={alertCfg.pvMargeMinPct ?? 5}
                  onChange={e => setAlertCfg(c => ({ ...c, pvMargeMinPct: Number(e.target.value) }))}
                  className="flex-1 accent-red-500"
                />
                <span className="font-bold text-red-700 text-base w-12 text-center">
                  {alertCfg.pvMargeMinPct ?? 5}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Exemple : seuil 5% → alerte si (PV - PA) / PV &lt; 5% (risque de perte)
              </p>
            </div>
          </div>

          {/* Alert inactivité */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <h3 className="font-bold text-sm text-foreground">Inactivité client (Habitudes mobile)</h3>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-foreground">Période d&apos;inactivité client (alertes)</label>
              <p className="text-[11px] text-muted-foreground">Nombre de jours sans commande avant alerte dans l&apos;onglet Habitudes</p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={alertInactivityDays}
                  onChange={e => setAlertInactivityDays(Number(e.target.value))}
                  className="w-24 px-3 py-2 rounded-xl border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-sm text-muted-foreground">jours</span>
                <span className="text-sm text-muted-foreground">jours</span>
              </div>
            </div>

            {/* Alertes articles par client (mobile prévendeur + analyses) */}
            <div className="flex flex-col gap-1.5 border-t border-border pt-4">
              <label className="text-xs font-bold text-foreground">Alertes « articles par client »</label>
              <p className="text-[11px] text-muted-foreground">Un article habituel d&apos;un client non recommandé depuis N jours déclenche une alerte (onglet Habitudes / mobile prévendeur).</p>
              <div className="grid grid-cols-3 gap-3 mt-1">
                <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground">
                  Seuil alerte (j)
                  <input type="number" min={1} max={365} value={artAbsenceJours} onChange={e => setArtAbsenceJours(Number(e.target.value))}
                    className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary" />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-semibold text-amber-700">
                  Moyen (j)
                  <input type="number" min={1} max={365} value={artAbsenceMedium} onChange={e => setArtAbsenceMedium(Number(e.target.value))}
                    className="px-3 py-2 rounded-xl border border-amber-300 bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-amber-400" />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-semibold text-red-700">
                  Urgent (j)
                  <input type="number" min={1} max={365} value={artAbsenceUrgent} onChange={e => setArtAbsenceUrgent(Number(e.target.value))}
                    className="px-3 py-2 rounded-xl border border-red-300 bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-red-400" />
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  store.saveAlertConfig({ inactivityDays: alertInactivityDays, articleAbsenceJours: artAbsenceJours, articleAbsenceMedium: artAbsenceMedium, articleAbsenceUrgent: artAbsenceUrgent })
                  setSavedAlert(true); setTimeout(() => setSavedAlert(false), 2000)
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background: "oklch(0.38 0.2 260)" }}>
                {savedAlert ? "✓ Sauvegardé" : "Enregistrer les alertes"}
              </button>
            </div>
          </div>

          {/* Config Marché (Rapport Besoin Marché) */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <h3 className="font-bold text-sm text-foreground">🚚 Marché (planification achat)</h3>
            <p className="text-[11px] text-muted-foreground -mt-2">Utilisé par le « Rapport Besoin Marché » : nombre de camions Honda et heure de départ selon le tonnage.</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground">
                Capacité Honda (kg)
                <input type="number" min={100} value={mcCapacite} onChange={e => setMcCapacite(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground">
                Heure ouverture marché
                <input type="time" value={mcHeure} onChange={e => setMcHeure(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground">
                Min. / tonne (anticipation)
                <input type="number" min={0} value={mcMinTonne} onChange={e => setMcMinTonne(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground">
                Marge sécurité (min)
                <input type="number" min={0} value={mcMarge} onChange={e => setMcMarge(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-semibold text-foreground">
                Prix carburant (DH/L)
                <input type="number" min={0} step="0.1" value={mcPrixCarb} onChange={e => setMcPrixCarb(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-primary" />
              </label>
            </div>
            <div>
              <button
                onClick={() => { store.saveMarcheConfig({ capaciteHondaKg: mcCapacite, heureOuvertureMarche: mcHeure, minutesParTonne: mcMinTonne, margeSecuriteMin: mcMarge }); store.saveEmailConfig({ ...store.getEmailConfig(), prixCarburantL: mcPrixCarb }); setSavedMarche(true); setTimeout(() => setSavedMarche(false), 2000) }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white" style={{ background: "oklch(0.38 0.2 260)" }}>
                {savedMarche ? "✓ Sauvegardé" : "Enregistrer le marché"}
              </button>
            </div>
          </div>

          {/* Simulation */}
          <div className="bg-card rounded-2xl border border-border p-6 flex flex-col gap-4">
            <h3 className="font-bold text-sm text-foreground">Simulation d&apos;alerte</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              {(() => {
                const pa = 100
                const hist = 92
                const seuil = alertCfg.paSeuilPct ?? 10
                const pvMarge = alertCfg.pvMargeMinPct ?? 5
                const paOk = pa <= hist * (1 + seuil / 100)
                const pv = 105
                const marge = ((pv - pa) / pv) * 100
                const pvOk = marge >= pvMarge
                return (
                  <>
                    <div className={`rounded-xl p-3 border ${paOk ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                      <p className="font-bold text-slate-700 mb-1">Alerte PA</p>
                      <p className="text-slate-500">PA simulé : {pa} DH</p>
                      <p className="text-slate-500">Hist. moy. : {hist} DH</p>
                      <p className="text-slate-500">Seuil +{seuil}% = {(hist * (1 + seuil / 100)).toFixed(2)} DH</p>
                      <p className={`font-bold mt-2 ${paOk ? "text-emerald-600" : "text-red-600"}`}>
                        {paOk ? "Pas d'alerte" : "ALERTE DECLENCHEE"}
                      </p>
                    </div>
                    <div className={`rounded-xl p-3 border ${pvOk ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                      <p className="font-bold text-slate-700 mb-1">Alerte PV</p>
                      <p className="text-slate-500">PV simulé : {pv} DH</p>
                      <p className="text-slate-500">PA : {pa} DH</p>
                      <p className="text-slate-500">Marge : {marge.toFixed(1)}% (min {pvMarge}%)</p>
                      <p className={`font-bold mt-2 ${pvOk ? "text-emerald-600" : "text-red-600"}`}>
                        {pvOk ? "Pas d'alerte" : "RISQUE DE PERTE"}
                      </p>
                    </div>
                  </>
                )
              })()}
            </div>
          </div>

          {alertSaved && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {alertSaved}
            </div>
          )}
          <button
            onClick={() => {
              localStorage.setItem("fl_alert_config", JSON.stringify(alertCfg))
              const ai = JSON.parse(localStorage.getItem("fl_ai_config") ?? "{}")
              localStorage.setItem("fl_ai_config", JSON.stringify({
                ...ai,
                alerteAchatEnabled: alertCfg.alerteAchatEnabled ?? true,
                alerteVenteEnabled: alertCfg.alerteVenteEnabled ?? true,
              }))
              setAlertSaved("Configuration alertes sauvegardee.")
              setTimeout(() => setAlertSaved(""), 2500)
            }}
            className="self-start px-6 py-2.5 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 transition-colors shadow-sm">
            Sauvegarder les seuils d&apos;alerte
          </button>
        </div>
      )}

      {/* ══ MON COMPTE ════════════════════════════════════════════════════════ */}
      {tab === "moncompte" && (
        <MonCompteContent user={user} monNom={monNom} setMonNom={setMonNom} monPwd={monPwd} setMonPwd={setMonPwd} monPwdConfirm={monPwdConfirm} setMonPwdConfirm={setMonPwdConfirm} monCompteMsg={monCompteMsg} setMonCompteMsg={setMonCompteMsg} />
      )}

      {/* ══ SYSTÈME — super_super_admin only ══════════════════════════════════ */}
      {tab === "systeme" && user.role === "super_super_admin" && (
        <div className="flex flex-col gap-6">
          <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-300 rounded-2xl p-5 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-yellow-500 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-white fill-white" viewBox="0 0 24 24"><path d="M2 19h20l-2-10-5 5-3-8-3 8-5-5z" /></svg>
            </div>
            <div>
              <p className="font-black text-slate-900 text-base">Contrôle Système — Super Administrateur</p>
              <p className="text-xs text-yellow-800 mt-0.5">Ces actions s'appliquent à <strong>tous les appareils connectés</strong> en temps réel. Utiliser avec précaution. / إجراءات تؤثر على جميع الأجهزة المتصلة</p>
            </div>
          </div>

          {/* ── Restart All Devices ── */}
          <div className="rounded-2xl border border-red-200 overflow-hidden">
            <div className="px-5 py-4 bg-red-50 flex items-center gap-3 border-b border-red-200">
              <svg className="w-5 h-5 text-red-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <div>
                <p className="font-bold text-red-900 text-sm">Redémarrer tous les appareils</p>
                <p className="text-xs text-red-700">Envoie un signal de rechargement à tous les navigateurs connectés à l'application</p>
              </div>
            </div>
            <div className="p-5 bg-white flex flex-col gap-4">
              <p className="text-sm text-slate-600">
                Tous les utilisateurs actuellement connectés verront leur page se recharger automatiquement dans les 2 secondes.
                Cela permet de forcer la mise à jour de l'application après un déploiement ou un changement de configuration.
              </p>
              {restartMsg && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm border ${restartMsg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                  {restartMsg.text}
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <button
                  disabled={restartLoading}
                  onClick={async () => {
                    setRestartLoading(true)
                    setRestartMsg(null)
                    try {
                      const { createClient } = await import("@/lib/supabase/client")
                      const sb = createClient()
                      const channel = sb.channel("freshlink-erp-realtime-v3")
                      await channel.subscribe()
                      await channel.send({
                        type: "broadcast",
                        event: "force_restart",
                        payload: { requestedBy: user.name, ts: new Date().toISOString() },
                      })
                      sb.removeChannel(channel)
                      setRestartMsg({ ok: true, text: "Signal envoyé à tous les appareils connectés. Rechargement dans 2 secondes..." })
                      // Recharger aussi ce device
                      setTimeout(() => window.location.reload(), 2500)
                    } catch (e) {
                      setRestartMsg({ ok: false, text: `Erreur: ${String(e)}` })
                    }
                    setRestartLoading(false)
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50 shadow-sm">
                  {restartLoading ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  )}
                  Redémarrer tous les appareils
                </button>
              </div>
            </div>
          </div>

          {/* ── Supabase Connectivity ── */}
          <div className="rounded-2xl border border-blue-200 overflow-hidden">
            <div className="px-5 py-4 bg-blue-50 flex items-center justify-between gap-3 border-b border-blue-200">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-blue-900 text-sm">Connectivité Supabase</p>
                  <p className="text-xs text-blue-700">Projet : bxdqkigoidwnscsjafwd</p>
                </div>
              </div>
              <button
                onClick={handleSbCheck}
                disabled={sbChecking}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-60 shadow-sm">
                {sbChecking
                  ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> Test…</>
                  : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> Tester</>
                }
              </button>
            </div>

            <div className="p-5 bg-white flex flex-col gap-4">

              {/* Env vars checklist */}
              <div>
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Variables d&apos;environnement (Vercel)</p>
                <div className="space-y-2">
                  {[
                    { key: "NEXT_PUBLIC_SUPABASE_URL",    label: "Supabase URL",          required: true,  hint: "https://bxdqkigoidwnscsjafwd.supabase.co" },
                    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "Anon Key (lecture)",  required: true,  hint: "eyJhb... (clé publique)" },
                    { key: "SUPABASE_SERVICE_ROLE_KEY",   label: "Service Role Key",       required: true,  hint: "eyJhb... ⚠️ CONFIDENTIEL — nécessaire pour sync-write" },
                    { key: "RESEND_API_KEY",              label: "Resend (email)",          required: false, hint: "re_... — Notifications email" },
                    { key: "CALLMEBOT_APIKEY",            label: "CallMeBot (WhatsApp)",    required: false, hint: "Clé gratuite callmebot.com" },
                    { key: "DEVICE_SECRET",               label: "Device Guard Secret",     required: false, hint: "Défaut: vt_device_secret_2026" },
                  ].map(env => (
                    <div key={env.key} className="flex items-start gap-2 text-xs">
                      <span className={`shrink-0 w-4 h-4 mt-0.5 rounded-full flex items-center justify-center text-[9px] font-black
                        ${env.required ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                        {env.required ? "!" : "○"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-slate-800">{env.key}</span>
                          {env.required && <span className="text-[9px] font-bold text-amber-600 uppercase">Requis</span>}
                        </div>
                        <div className="text-slate-400 text-[10px] mt-0.5">{env.hint}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>
                    Configurer sur :&nbsp;
                    <a href="https://vercel.com/dashboard" target="_blank" rel="noopener"
                      className="font-bold text-blue-600 hover:underline">vercel.com/dashboard</a>
                    &nbsp;→ Settings → Environment Variables
                  </span>
                </div>
              </div>

              {/* Test results */}
              {sbCheck && (
                <div className={`rounded-xl border p-4 ${sbCheck.connected ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-3 h-3 rounded-full ${sbCheck.connected ? "bg-emerald-500" : "bg-red-500"}`} />
                    <span className={`text-sm font-bold ${sbCheck.connected ? "text-emerald-800" : "text-red-800"}`}>
                      {sbCheck.connected ? "✅ Connecté à Supabase" : "❌ Connexion échouée"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                    <div className={`rounded-lg p-2 ${sbCheck.ready ? "bg-emerald-100" : "bg-amber-100"}`}>
                      <div className={`text-xl font-black ${sbCheck.ready ? "text-emerald-700" : "text-amber-700"}`}>{sbCheck.tables_exist}</div>
                      <div className={`text-[10px] ${sbCheck.ready ? "text-emerald-600" : "text-amber-600"}`}>Tables OK</div>
                    </div>
                    <div className="rounded-lg p-2 bg-slate-100">
                      <div className="text-xl font-black text-slate-700">{sbCheck.tables_total}</div>
                      <div className="text-[10px] text-slate-500">Tables total</div>
                    </div>
                    <div className={`rounded-lg p-2 ${sbCheck.missing.length === 0 ? "bg-emerald-100" : "bg-red-100"}`}>
                      <div className={`text-xl font-black ${sbCheck.missing.length === 0 ? "text-emerald-700" : "text-red-700"}`}>{sbCheck.missing.length}</div>
                      <div className={`text-[10px] ${sbCheck.missing.length === 0 ? "text-emerald-600" : "text-red-600"}`}>Manquantes</div>
                    </div>
                  </div>
                  {sbCheck.missing.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-bold text-red-700 mb-1">Tables manquantes :</p>
                      <div className="flex flex-wrap gap-1">
                        {sbCheck.missing.map(t => (
                          <span key={t} className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-mono rounded border border-red-200">{t}</span>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <span>
                          Créer les tables via le&nbsp;
                          <a href={sbCheck.supabase_sql_editor ?? "https://supabase.com/dashboard/project/bxdqkigoidwnscsjafwd/sql/new"}
                            target="_blank" rel="noopener" className="font-bold text-blue-600 hover:underline">
                            SQL Editor Supabase
                          </a>
                          &nbsp;— appeler GET /api/setup-tables pour le script SQL.
                        </span>
                      </div>
                    </div>
                  )}
                  {sbCheck.ready && (
                    <p className="text-xs text-emerald-700 font-semibold">🎉 Toutes les tables sont prêtes — synchronisation possible</p>
                  )}
                </div>
              )}

              {/* Sync button */}
              <div className="flex flex-col gap-2">
                {!showSyncConfirm ? (
                  <button
                    onClick={() => { setSyncConfirmError(null); setSyncConfirmPwd(""); setShowSyncConfirm(true) }}
                    disabled={sbSyncing}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition-colors disabled:opacity-60 shadow-sm w-fit">
                    {sbSyncing
                      ? <><svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> Synchronisation…</>
                      : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg> Sync Supabase → localStorage</>
                    }
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 w-fit min-w-[280px]">
                    <p className="text-xs font-bold text-emerald-800">Confirmez votre mot de passe pour synchroniser</p>
                    <input
                      type="password"
                      autoFocus
                      value={syncConfirmPwd}
                      onChange={e => { setSyncConfirmPwd(e.target.value); setSyncConfirmError(null) }}
                      onKeyDown={e => { if (e.key === "Enter") confirmAndSync() }}
                      placeholder="Mot de passe"
                      className="px-3 py-1.5 text-xs rounded-lg border border-emerald-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    />
                    {syncConfirmError && <p className="text-[11px] text-red-600 font-semibold">{syncConfirmError}</p>}
                    <div className="flex gap-2">
                      <button onClick={confirmAndSync}
                        className="flex-1 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors">
                        Confirmer
                      </button>
                      <button onClick={() => { setShowSyncConfirm(false); setSyncConfirmPwd(""); setSyncConfirmError(null) }}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted transition-colors">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
                {sbSyncResult && (
                  <div className={`flex items-start gap-2 px-3 py-2 rounded-xl text-xs border ${sbSyncResult.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                    <span>
                      {sbSyncResult.ok ? "✅" : "⚠️"}{" "}
                      {sbSyncResult.tables.length} table(s) synchronisée(s)
                      {sbSyncResult.errors.length > 0 && ` — ${sbSyncResult.errors.length} erreur(s): ${sbSyncResult.errors.slice(0, 2).join(", ")}`}
                    </span>
                  </div>
                )}
              </div>

              {/* Device Guard status */}
              <div className="flex items-start gap-2 px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-800">
                <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>
                  <strong>Device Guard :</strong> Votre compte super_super_admin est automatiquement exempt de la validation d&apos;appareil. Le cookie de bypass est valide 30 jours.
                </span>
              </div>
            </div>
          </div>

          {/* ── Session info ── */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
              <p className="font-bold text-slate-800 text-sm">Informations session super admin</p>
            </div>
            <div className="p-5 bg-white flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">Nom</span>
                <span className="font-bold text-slate-900">{user.name}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">Rôle</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800 border border-yellow-300">super_super_admin</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-600">Email</span>
                <span className="font-mono text-xs text-slate-700">{user.email ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-slate-600">ID</span>
                <span className="font-mono text-xs text-slate-500">{user.id}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === TRANSPORTEURS === */}
      {/* (Onglet Transporteurs retiré — géré dans Dispatch & Logistique → Transporteurs) */}

      {/* === SITE WEB === */}
      {tab === "siteweb" && <SiteWebTab saved={saved} setSaved={setSaved} />}
          </div>
          )
          }
