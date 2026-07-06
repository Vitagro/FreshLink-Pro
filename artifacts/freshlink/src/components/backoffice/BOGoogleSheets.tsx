"use client"

import { useState, useEffect, useRef } from "react"
import { store, type User } from "@/lib/store"
import {
  SHEET_CONFIGS, getSheetsConfig, saveSheetsConfig,
  serializeArticles, serializeClients, serializeStock,
  serializeCommandes, serializeFactures, serializeRetours,
  pushToSheet, APPS_SCRIPT_TEMPLATE,
  type SheetKey, type SheetsUrlConfig, type PushResult,
} from "@/lib/googleSheets"

interface Props { user: User }

type SyncStatus = "idle" | "syncing" | "done" | "error"

interface SheetState {
  status: SyncStatus
  result?: PushResult
  lastSync?: string
}

// Sync interval options (minutes)
const INTERVAL_OPTIONS = [
  { label: "Toutes les 15 min (4×/h)", value: 15 },
  { label: "Toutes les 30 min (2×/h)", value: 30 },
  { label: "Toutes les heures",         value: 60 },
  { label: "Toutes les 2 heures",       value: 120 },
  { label: "Manuellement seulement",    value: 0 },
]

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
      </div>
    </div>
  )
}

export default function BOGoogleSheets({ user }: Props) {
  // --- ALL hooks MUST come before any conditional return (Rules of Hooks) ---
  const [urls, setUrls] = useState<SheetsUrlConfig>(() => getSheetsConfig())
  const [saved, setSaved] = useState(false)
  const [sheetStates, setSheetStates] = useState<Record<SheetKey, SheetState>>({
    articles: { status: "idle" },
    clients:  { status: "idle" },
    stock:    { status: "idle" },
    commandes:{ status: "idle" },
    factures: { status: "idle" },
    retours:  { status: "idle" },
  })
  const [showScript, setShowScript] = useState(false)
  const [globalSyncing, setGlobalSyncing] = useState(false)
  const [syncInterval, setSyncInterval] = useState<number>(() => {
    try { return parseInt(localStorage.getItem("fl_gs_interval") ?? "0", 10) || 0 } catch { return 0 }
  })
  const [nextSyncAt, setNextSyncAt] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number>(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Use a ref so pushAllFn can be called from useEffect without temporal dead zone
  const pushAllRef = useRef<() => Promise<void>>(async () => {})
  const canAccess = user.role === "super_super_admin" || user.role === "admin" || user.role === "super_admin"

  // ALL useEffects MUST be before any conditional return
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    setNextSyncAt(null)
    setCountdown(0)
    if (syncInterval === 0) return
    const intervalMs = syncInterval * 60 * 1000
    const scheduleNext = () => {
      setCountdown(syncInterval * 60)
      const nextTime = new Date(Date.now() + intervalMs)
      setNextSyncAt(nextTime.toLocaleTimeString("fr-MA", { hour: "2-digit", minute: "2-digit" }))
    }
    scheduleNext()
    const syncTimer = setInterval(async () => {
      await pushAllRef.current()
      scheduleNext()
    }, intervalMs)
    countdownRef.current = setInterval(() => setCountdown(s => Math.max(0, s - 1)), 1000)
    return () => {
      clearInterval(syncTimer)
      if (countdownRef.current) clearInterval(countdownRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncInterval])

  // Guard AFTER all hooks — safe conditional render
  if (!canAccess) return <AccessDenied />

  const isAdmin = canAccess
  const handleSetInterval = (val: number) => {
    setSyncInterval(val)
    try { localStorage.setItem("fl_gs_interval", String(val)) } catch { /* noop */ }
  }

  const handleSaveUrls = () => {
    saveSheetsConfig(urls)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const setStatus = (key: SheetKey, state: Partial<SheetState>) =>
    setSheetStates(prev => ({ ...prev, [key]: { ...prev[key], ...state } }))

  const getRows = (key: SheetKey) => {
    switch (key) {
      case "articles":  return serializeArticles(store.getArticles())
      case "clients":   return serializeClients(store.getClients())
      case "stock":     return serializeStock(store.getArticles())
      case "commandes": return serializeCommandes(store.getCommandes())
      case "factures":  return serializeFactures(store.getBonsLivraison())
      case "retours":   return serializeRetours(store.getRetours())
      default:          return []
    }
  }

  const pushOne = async (key: SheetKey) => {
    setStatus(key, { status: "syncing" })
    const rows = getRows(key) as Record<string, unknown>[]
    const result = await pushToSheet(key, rows, urls[key])
    setStatus(key, {
      status: result.ok ? "done" : "error",
      result,
      lastSync: result.ok ? new Date().toLocaleTimeString("fr-MA") : undefined,
    })
  }

  const pushAllFn = async () => {
    setGlobalSyncing(true)
    for (const cfg of SHEET_CONFIGS) {
      if (urls[cfg.key]) await pushOne(cfg.key)
    }
    setGlobalSyncing(false)
  }
  // keep ref in sync so auto-sync interval always calls the latest version
  pushAllRef.current = pushAllFn

  const configuredCount = Object.values(urls).filter(Boolean).length

  return (
    <div className="flex flex-col gap-6">

      {/* Header card */}
      <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "oklch(0.93 0.04 152)" }}>
              <svg className="w-6 h-6" viewBox="0 0 48 48" fill="none">
                <rect width="48" height="48" rx="8" fill="#0F9D58"/>
                <rect x="10" y="10" width="28" height="28" rx="3" fill="white"/>
                <rect x="14" y="16" width="8" height="3" rx="1" fill="#0F9D58"/>
                <rect x="14" y="22" width="20" height="2" rx="1" fill="#ccc"/>
                <rect x="14" y="27" width="20" height="2" rx="1" fill="#ccc"/>
                <rect x="14" y="32" width="14" height="2" rx="1" fill="#ccc"/>
              </svg>
            </div>
            <div>
              <h2 className="font-bold text-foreground text-base">Liaison Google Sheets</h2>
              <p className="text-xs text-muted-foreground">
                Drive: <a href="https://drive.google.com/drive/folders/12nzqnZtK2EuFV8LNBfKrApj9nCtAo8pb" target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:underline underline-offset-2">
                  Dossier FreshLink
                </a>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Configured count badge */}
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${configuredCount > 0 ? "bg-green-50 border-green-300 text-green-700" : "bg-muted border-border text-muted-foreground"}`}>
              {configuredCount} / {SHEET_CONFIGS.length} configurées
            </span>

            {/* Auto-sync interval selector */}
            {configuredCount > 0 && (
              <select
                value={syncInterval}
                onChange={e => handleSetInterval(Number(e.target.value))}
                className="text-xs font-semibold px-2.5 py-1.5 rounded-full border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer">
                {INTERVAL_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            )}

            {/* Countdown badge when auto-sync is active */}
            {syncInterval > 0 && countdown > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border bg-blue-50 border-blue-200 text-blue-700">
                <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {nextSyncAt ? `Prochain : ${nextSyncAt}` : ""}
                {" "}({Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")})
              </span>
            )}

            {/* Manual sync all button */}
            {configuredCount > 0 && (
              <button onClick={pushAllFn} disabled={globalSyncing}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-60"
                style={{ background: "oklch(0.38 0.2 152)" }}>
                {globalSyncing
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                }
                Tout synchroniser
              </button>
            )}
          </div>
        </div>

        {/* Info banner */}
        <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800 leading-relaxed">
          <strong>Comment ca fonctionne :</strong> Collez l'URL de votre Apps Script Web App dans le champ de chaque feuille, puis cliquez
          "Synchroniser" pour envoyer les données. L'Apps Script ecrit les lignes dans la feuille Google correspondante.
          <button onClick={() => setShowScript(s => !s)}
            className="ml-2 font-bold underline underline-offset-2 hover:text-blue-900">
            {showScript ? "Masquer le script" : "Voir le script AppScript a coller"}
          </button>
        </div>

        {/* AppScript template */}
        {showScript && (
          <div className="rounded-xl border border-border bg-muted/40 p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-foreground">Script AppScript (meme script pour chaque feuille)</p>
              <button onClick={() => navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE)}
                className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-border hover:bg-background transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                Copier
              </button>
            </div>
            <pre className="text-[10px] text-muted-foreground overflow-x-auto max-h-52 thin-scroll font-mono leading-relaxed whitespace-pre">
              {APPS_SCRIPT_TEMPLATE}
            </pre>
            <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1 mt-1">
              <li>Ouvrir la feuille Google ({'"'}base articles{'"'}, {'"'}client{'"'}, etc.)</li>
              <li>Extensions → Apps Script → coller le script → Enregistrer</li>
              <li>Deployer → Nouveau deploiement → Application Web</li>
              <li>Executer en tant que : <strong>Moi</strong> — Acces : <strong>Tout le monde</strong></li>
              <li>Copier l&apos;URL generee et la coller ci-dessous dans le champ correspondant</li>
            </ol>
          </div>
        )}
      </div>

      {/* URL config — admin only */}
      {isAdmin && (
        <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-foreground text-sm">Configuration des URLs AppScript</h3>
            <button onClick={handleSaveUrls}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${saved ? "bg-green-100 text-green-700 border border-green-300" : "bg-primary text-primary-foreground hover:opacity-90"}`}>
              {saved
                ? <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Sauvegarde</>
                : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>Sauvegarder</>
              }
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {SHEET_CONFIGS.map(cfg => (
              <div key={cfg.key} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shrink-0 ${cfg.color}`} />
                <span className="text-xs font-semibold text-foreground w-28 shrink-0">{cfg.label}</span>
                <input
                  type="url"
                  value={urls[cfg.key]}
                  onChange={e => setUrls(prev => ({ ...prev, [cfg.key]: e.target.value }))}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary font-mono" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sheet cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {SHEET_CONFIGS.map(cfg => {
          const state = sheetStates[cfg.key]
          const hasUrl = !!urls[cfg.key]
          const rows = getRows(cfg.key)
          return (
            <div key={cfg.key} className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
              {/* Card header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-black shrink-0 ${cfg.color}`}>
                    {cfg.label[0]}
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-sm">{cfg.label}</p>
                    <p className="text-[10px] text-muted-foreground" dir="rtl">{cfg.labelAr}</p>
                  </div>
                </div>
                {/* Status badge */}
                {state.status === "done" && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    OK
                  </span>
                )}
                {state.status === "error" && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-full">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    Erreur
                  </span>
                )}
              </div>

              {/* Description */}
              <p className="text-xs text-muted-foreground leading-relaxed">{cfg.description}</p>

              {/* Stats row */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted">
                  <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
                  <span className="font-semibold text-foreground">{rows.length} lignes</span>
                </div>
                {state.lastSync && (
                  <span className="text-muted-foreground">Derniere sync : {state.lastSync}</span>
                )}
                {state.status === "error" && state.result?.error && (
                  <span className="text-red-500 text-[10px] truncate max-w-[150px]">{state.result.error}</span>
                )}
              </div>

              {/* Drive file name */}
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Fichier Drive : <span className="font-medium text-foreground">{cfg.driveFile}</span>
              </div>

              {/* URL status */}
              {!hasUrl && isAdmin && (
                <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  URL non configuree. Deployez l'AppScript et collez l'URL ci-dessus.
                </p>
              )}
              {!hasUrl && !isAdmin && (
                <p className="text-[10px] text-muted-foreground bg-muted rounded-lg px-2 py-1.5">
                  Contacter l'administrateur pour configurer la synchronisation.
                </p>
              )}

              {/* Push button */}
              <button
                onClick={() => pushOne(cfg.key)}
                disabled={!hasUrl || state.status === "syncing"}
                className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 ${hasUrl ? "text-white" : "bg-muted text-muted-foreground"}`}
                style={hasUrl ? { background: "oklch(0.38 0.2 152)" } : {}}>
                {state.status === "syncing"
                  ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Synchronisation...</>
                  : <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Synchroniser {cfg.label}</>
                }
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
