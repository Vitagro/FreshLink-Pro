"use client"

import { useEffect, useState } from "react"
import { isSyncDone, runFullSync, resetSync, type SyncProgress } from "@/lib/supabase/syncManager"
import { createClient } from "@/lib/supabase/client"

const SUPABASE_URL = "https://nphrncmuxbwahqnzdyxp.supabase.co"
const ANON_KEY_PREVIEW = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...SeK7cszs"

type ConnStatus = "idle" | "checking" | "connected" | "error"

// Show this banner once on first app load to push localStorage → Supabase
export default function SyncBanner() {
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [manualTriggered, setManualTriggered] = useState(false)
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle")
  const [connDetail, setConnDetail] = useState<string>("")
  const [showConnTest, setShowConnTest] = useState(false)

  async function runConnectionTest() {
    setConnStatus("checking")
    setConnDetail("")
    try {
      const supabase = createClient()
      const start = Date.now()
      const { data, error } = await supabase.from("fl_config").select("id").limit(1)
      const ms = Date.now() - start
      if (error) {
        setConnStatus("error")
        setConnDetail(`Erreur: ${error.message} (${error.code ?? "unknown"}) — ${ms}ms`)
      } else {
        setConnStatus("connected")
        setConnDetail(`Connexion OK — reponse en ${ms}ms — ${data?.length ?? 0} ligne(s) dans fl_config`)
      }
    } catch (e: unknown) {
      setConnStatus("error")
      setConnDetail(`Exception: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Auto-ping on mount
  useEffect(() => {
    let mounted = true
    async function ping() {
      try {
        const supabase = createClient()
        const { error } = await supabase.from("fl_config").select("id").limit(1)
        if (!mounted) return
        setConnStatus(error ? "error" : "connected")
        setConnDetail(error ? error.message : "Ping OK")
      } catch {
        if (mounted) { setConnStatus("error"); setConnDetail("Impossible de joindre Supabase") }
      }
    }
    ping()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    // Only sync if Supabase env vars are configured — otherwise skip silently
    const hasSupabase =
      typeof process !== "undefined" &&
      import.meta.env.VITE_SUPABASE_URL &&
      import.meta.env.VITE_SUPABASE_URL !== ""
    if (!hasSupabase) return

    // Auto-trigger if not yet synced
    if (!isSyncDone()) {
      setVisible(true)
      startSync()
    }
  }, [])

  const startSync = () => {
    setProgress({ step: "Preparation...", done: 0, total: 1, errors: 0, finished: false })
    runFullSync((p) => setProgress(p))
  }

  const handleManualSync = () => {
    resetSync()
    setManualTriggered(true)
    setVisible(true)
    startSync()
  }

  if (!visible && !manualTriggered) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
        {/* Connection test panel */}
        {showConnTest && (
          <div className="w-80 rounded-2xl shadow-2xl border border-gray-700 bg-gray-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <p className="text-xs font-bold text-white">Test connexion Supabase</p>
              <button onClick={() => setShowConnTest(false)} className="text-gray-500 hover:text-gray-300">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-4 py-3 flex flex-col gap-2.5">
              {/* URL */}
              <div>
                <p className="text-[10px] text-gray-500 font-semibold uppercase mb-0.5">URL Supabase</p>
                <p className="text-xs font-mono text-emerald-400 break-all">{SUPABASE_URL}</p>
              </div>
              {/* Anon key */}
              <div>
                <p className="text-[10px] text-gray-500 font-semibold uppercase mb-0.5">Anon Key</p>
                <p className="text-xs font-mono text-blue-400">{ANON_KEY_PREVIEW}</p>
              </div>
              {/* Status */}
              <div className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-xs ${
                connStatus === "connected" ? "bg-green-900/40 border-green-700 text-green-400" :
                connStatus === "error"     ? "bg-red-900/40 border-red-700 text-red-400" :
                connStatus === "checking"  ? "bg-blue-900/40 border-blue-700 text-blue-400" :
                "bg-gray-800 border-gray-700 text-gray-400"
              }`}>
                {connStatus === "checking" ? (
                  <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin shrink-0 mt-0.5"
                    style={{ borderColor: "currentColor", borderTopColor: "transparent" }} />
                ) : connStatus === "connected" ? (
                  <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : connStatus === "error" ? (
                  <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : null}
                <span>{
                  connStatus === "idle"      ? "Cliquez Tester pour verifier la connexion" :
                  connStatus === "checking"  ? "Connexion en cours..." :
                  connStatus === "connected" ? `Connexion etablie` :
                  `Connexion echouee`
                }</span>
              </div>
              {connDetail && (
                <p className="text-[10px] text-gray-500 font-mono break-all">{connDetail}</p>
              )}
              <button
                onClick={runConnectionTest}
                disabled={connStatus === "checking"}
                className="w-full py-2 rounded-xl text-xs font-bold text-white disabled:opacity-50 transition-opacity"
                style={{ background: "oklch(0.38 0.2 260)" }}>
                {connStatus === "checking" ? "Test en cours..." : "Tester la connexion"}
              </button>
            </div>
          </div>
        )}
        {/* Buttons row */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConnTest(s => !s)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold shadow-lg border transition-all ${
              connStatus === "connected" ? "border-green-600 bg-gray-800 text-green-400" :
              connStatus === "error"     ? "border-red-600 bg-gray-800 text-red-400" :
              "border-gray-700 bg-gray-800 text-gray-400 hover:text-gray-200"
            }`}
            title="Tester la connexion Supabase">
            <span className={`w-2 h-2 rounded-full ${
              connStatus === "connected" ? "bg-green-400" :
              connStatus === "error"     ? "bg-red-400" :
              connStatus === "checking"  ? "bg-blue-400 animate-pulse" :
              "bg-gray-600"
            }`} />
            {connStatus === "connected" ? "Supabase OK" : connStatus === "error" ? "Supabase erreur" : "Supabase"}
          </button>
          <button
            onClick={handleManualSync}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold shadow-lg border border-gray-700 bg-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-all"
            title="Synchroniser les donnees locales vers Supabase">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync
          </button>
        </div>
      </div>
    )
  }

  if (!progress) return null

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-2xl shadow-2xl border border-gray-700 bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        {progress.finished ? (
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ background: progress.errors > 0 ? "#f59e0b" : "#16a34a" }}>
            <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        ) : (
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin shrink-0"
            style={{ borderColor: "oklch(0.38 0.2 260)", borderTopColor: "transparent" }} />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-white">
            {progress.finished
              ? progress.errors > 0 ? `Sync termine avec ${progress.errors} erreur(s)` : "Sync Supabase complete"
              : "Synchronisation en cours..."}
          </p>
          <p className="text-[11px] text-gray-500 truncate">{progress.step}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setExpanded(!expanded)}
            className="p-1 rounded hover:bg-gray-700 text-gray-500 transition-colors">
            <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {progress.finished && (
            <button onClick={() => { setVisible(false); setManualTriggered(false) }}
              className="p-1 rounded hover:bg-gray-700 text-gray-500 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-800">
        <div className="h-full transition-all duration-300 rounded-full"
          style={{
            width: `${pct}%`,
            background: progress.finished && progress.errors === 0
              ? "#16a34a"
              : progress.finished && progress.errors > 0
              ? "#f59e0b"
              : "oklch(0.38 0.2 260)",
          }} />
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 py-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Avancement</span>
            <span className="font-bold text-foreground">{pct}%</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Etape</span>
            <span className="font-semibold text-foreground">{progress.step}</span>
          </div>
          {progress.errors > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-amber-700">Erreurs</span>
              <span className="font-semibold text-amber-700">{progress.errors}</span>
            </div>
          )}
          {progress.finished && (
            <button onClick={handleManualSync}
              className="mt-1 w-full py-1.5 rounded-lg text-xs font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors">
              Relancer la synchronisation
            </button>
          )}
        </div>
      )}
    </div>
  )
}
