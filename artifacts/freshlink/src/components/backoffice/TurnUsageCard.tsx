"use client"

import { useState, useEffect, useCallback } from "react"
import { store } from "@/lib/store"

// Suivi d'utilisation TURN (appels) — global + PAR PERSONNE, avec possibilité de
// DÉSACTIVER les appels chez certains utilisateurs. Source : GET /api/turn.
interface UserStat { name: string; calls: number; seconds: number; gb: number }
interface TurnUsage { calls: number; seconds: number; gb: number; byUser?: Record<string, UserStat> }

function dur(seconds: number) {
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m}min`
}

export default function TurnUsageCard() {
  const [usage, setUsage]   = useState<TurnUsage>({ calls: 0, seconds: 0, gb: 0, byUser: {} })
  const [capGb, setCapGb]   = useState(1000)
  const [percent, setPercent] = useState(0)
  const [month, setMonth]   = useState("")
  const [disabled, setDisabled] = useState<string[]>([])
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState("")
  const [showUsers, setShowUsers] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/turn", { cache: "no-store" })   // GET = lecture suivi
      if (r.ok) {
        const j = await r.json()
        setUsage(j.usage ?? { calls: 0, seconds: 0, gb: 0, byUser: {} })
        setCapGb(j.cap_gb ?? 1000)
        setPercent(j.percent ?? 0)
        setMonth(j.month ?? "")
        setDisabled(Array.isArray(j.disabled) ? j.disabled : [])
      }
    } catch { /* hors ligne */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleUser = async (userId: string) => {
    const next = disabled.includes(userId) ? disabled.filter(id => id !== userId) : [...disabled, userId]
    setDisabled(next); setSaving(userId)
    try {
      await fetch("/api/sync-write", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_notices", upserts: [{ id: "__calls_disabled", payload: { userIds: next }, updated_at: new Date().toISOString() }] }),
      })
    } catch { /* sync best-effort */ }
    setSaving("")
  }

  const near = percent >= 80
  const byUser = usage.byUser ?? {}
  // Tous les utilisateurs actifs + ceux ayant déjà consommé (pour le panneau de gestion)
  const users = store.getUsers()
    .filter(u => u.actif !== false && !["client", "client_proprietaire", "client_gerant", "fournisseur"].includes(String(u.role)))
    .sort((a, b) => (byUser[b.id]?.seconds ?? 0) - (byUser[a.id]?.seconds ?? 0))

  return (
    <div className="mb-5 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="font-bold text-gray-900 text-sm flex items-center gap-2">📞 Utilisation des appels (TURN)</div>
          <p className="text-xs text-gray-500 mt-0.5">Relais Cloudflare · mois {month || "courant"} · estimation</p>
        </div>
        <button onClick={load} className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700">
          {loading ? "…" : "🔄 Actualiser"}
        </button>
      </div>

      {/* Quota global */}
      <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, percent)}%`, background: near ? "linear-gradient(90deg,#f59e0b,#ef4444)" : "linear-gradient(90deg,#22c55e,#16a34a)" }} />
      </div>
      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="font-bold text-gray-900">{usage.gb} Go <span className="font-normal text-gray-400">/ {capGb} Go</span></span>
        <span className={near ? "font-bold text-red-600" : "text-gray-500"}>{percent}% · {usage.calls} appels · {dur(usage.seconds)}</span>
      </div>
      {near && <p className="mt-2 text-[11px] text-red-600">⚠️ Proche du quota — au-delà de {capGb} Go, les appels passent en STUN seul (sans relais, aucun coût).</p>}

      {/* Gestion PAR PERSONNE */}
      <button onClick={() => setShowUsers(v => !v)} className="mt-3 w-full text-left text-xs font-bold text-emerald-700 flex items-center justify-between">
        <span>👤 Par utilisateur · activer / désactiver les appels</span>
        <span>{showUsers ? "▲" : "▼"}</span>
      </button>

      {showUsers && (
        <div className="mt-2 border-t border-gray-100 pt-2 max-h-80 overflow-y-auto">
          {users.map(u => {
            const s = byUser[u.id]
            const off = disabled.includes(u.id)
            return (
              <div key={u.id} className="flex items-center justify-between gap-2 py-1.5">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{u.name} <span className="text-[10px] text-gray-400 font-normal">· {String(u.role)}</span></div>
                  <div className="text-[11px] text-gray-500">{s ? `${s.calls} appels · ${dur(s.seconds)} · ${s.gb} Go` : "aucun appel ce mois"}</div>
                </div>
                <button
                  onClick={() => toggleUser(u.id)}
                  disabled={saving === u.id}
                  role="switch" aria-checked={!off}
                  title={off ? "Appels désactivés — cliquez pour activer" : "Appels activés — cliquez pour désactiver"}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${off ? "bg-gray-300" : "bg-emerald-500"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${off ? "translate-x-1" : "translate-x-6"}`} />
                </button>
              </div>
            )
          })}
          <p className="mt-1 text-[11px] text-gray-400">Un utilisateur désactivé ne peut plus passer ni recevoir d&apos;appels (prise en compte à sa prochaine ouverture).</p>
        </div>
      )}

      <p className="mt-2 text-[11px] text-gray-400">Détail facturé exact : dashboard Cloudflare → Realtime → Analytics.</p>
    </div>
  )
}
