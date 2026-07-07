"use client"

import { useState, useEffect, useCallback } from "react"

// Suivi du stockage Supabase (bucket "freshlink-media"). Supabase n'expose pas
// d'API d'usage agrégé côté client — le total est calculé serveur (GET
// /api/ext/storage-usage, qui parcourt récursivement le bucket). La limite du
// plan n'est pas connue automatiquement (pas d'API publique côté client) :
// éditable ici et persistée en local pour calculer le %.
const CAP_GB_KEY = "fl_supabase_storage_cap_gb"
const DEFAULT_CAP_GB = 1 // plan gratuit Supabase par défaut — ajustez selon votre plan réel

function fmtGo(bytes: number): string {
  return (bytes / (1024 ** 3)).toFixed(2)
}

function relTime(iso: string | null): string {
  if (!iso) return "jamais"
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return "à l'instant"
  if (sec < 3600) return `il y a ${Math.round(sec / 60)} min`
  if (sec < 86400) return `il y a ${Math.round(sec / 3600)} h`
  return `il y a ${Math.round(sec / 86400)} j`
}

export default function SupabaseStorageCard() {
  const [totalBytes, setTotalBytes] = useState<number | null>(null)
  const [checkedAt, setCheckedAt]   = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [capGb, setCapGb] = useState<number>(() => {
    const raw = Number(localStorage.getItem(CAP_GB_KEY))
    return raw > 0 ? raw : DEFAULT_CAP_GB
  })
  const [editingCap, setEditingCap] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch("/api/ext/storage-usage", { cache: "no-store" })
      const j = await r.json()
      if (j.ok) {
        setTotalBytes(j.totalBytes)
        setCheckedAt(j.checkedAt)
      } else {
        setError(j.error ?? "Erreur inconnue")
      }
    } catch {
      setError("Hors ligne")
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const usedGb = totalBytes != null ? totalBytes / (1024 ** 3) : 0
  const percent = capGb > 0 ? Math.min(100, Math.round((usedGb / capGb) * 100)) : 0
  const near = percent >= 80

  function saveCap(v: number) {
    const clean = v > 0 ? v : DEFAULT_CAP_GB
    setCapGb(clean)
    localStorage.setItem(CAP_GB_KEY, String(clean))
    setEditingCap(false)
  }

  return (
    <div className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="font-bold text-foreground text-sm flex items-center gap-2">🗄️ Stockage Supabase</div>
          <p className="text-xs text-muted-foreground mt-0.5">Bucket freshlink-media · dernière vérif : {relTime(checkedAt)}</p>
        </div>
        <button onClick={load} disabled={loading}
          className="px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/70 text-xs font-semibold text-foreground disabled:opacity-50">
          {loading ? "…" : "🔄 Actualiser"}
        </button>
      </div>

      {error ? (
        <p className="text-xs text-red-600">Erreur : {error}</p>
      ) : (
        <>
          <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full transition-all"
              style={{ width: `${percent}%`, background: near ? "linear-gradient(90deg,#f59e0b,#ef4444)" : "linear-gradient(90deg,#22c55e,#16a34a)" }} />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-foreground">
              {totalBytes != null ? fmtGo(totalBytes) : "—"} Go
              <span className="font-normal text-muted-foreground"> / {capGb} Go</span>
            </span>
            <span className={near ? "font-bold text-red-600" : "text-muted-foreground"}>{percent}%</span>
          </div>
          {near && <p className="text-[11px] text-red-600">⚠️ Proche de la limite du plan Supabase — pensez à passer au palier supérieur ou à nettoyer les fichiers inutiles.</p>}
        </>
      )}

      {!editingCap ? (
        <button onClick={() => setEditingCap(true)} className="self-start text-[11px] text-muted-foreground hover:text-foreground underline">
          Limite du plan : {capGb} Go — modifier
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <input type="number" min={0.1} step={0.1} defaultValue={capGb}
            onKeyDown={e => { if (e.key === "Enter") saveCap(Number((e.target as HTMLInputElement).value)) }}
            className="w-24 px-2 py-1 rounded-lg border border-border text-xs"
            autoFocus
            onBlur={e => saveCap(Number(e.target.value))} />
          <span className="text-[11px] text-muted-foreground">Go — Entrée pour valider</span>
        </div>
      )}
    </div>
  )
}
