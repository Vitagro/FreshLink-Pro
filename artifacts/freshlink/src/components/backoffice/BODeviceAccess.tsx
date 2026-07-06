"use client"

import { useState, useEffect, useCallback } from "react"
import type { User } from "@/lib/store"
import TurnUsageCard from "./TurnUsageCard"

// ── Types ──────────────────────────────────────────────────────────────────────
interface DeviceRequest {
  id: string
  device_id: string
  nom: string | null
  telephone: string | null
  statut: "en_attente" | "autorise" | "bloque"
  gps_lat: number | null
  gps_lng: number | null
  gps_precision: number | null
  user_agent: string | null
  first_visit_at: string | null
  updated_at: string | null
  autorise_par: string | null
  autorise_at: string | null
  notes: string | null
  last_seen: string | null
  connections: string[]
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface Props { user: User }

// ── Statut config ──────────────────────────────────────────────────────────────
const STATUT: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  en_attente: { label: "En attente",  bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-400" },
  autorise:   { label: "Autorisé",    bg: "bg-green-50",  text: "text-green-700",  dot: "bg-green-500" },
  bloque:     { label: "Bloqué",      bg: "bg-red-50",    text: "text-red-700",    dot: "bg-red-500"   },
}

function fmt(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

function canAccess(user: User) {
  return ["super_super_admin", "super_admin", "admin"].includes(user.role)
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function BODeviceAccess({ user }: Props) {
  const [rows,    setRows]    = useState<DeviceRequest[]>([])
  const [filter,  setFilter]  = useState<"tous" | "en_attente" | "autorise" | "bloque">("en_attente")
  const [loading, setLoading] = useState(false)
  const [msg,     setMsg]     = useState<{ ok: boolean; text: string } | null>(null)
  const [search,  setSearch]  = useState("")
  const [openHist, setOpenHist] = useState<string | null>(null)   // device dont l'historique est ouvert

  // ── Edit modal ─────────────────────────────────────────────────────────────
  const [editRow,  setEditRow]  = useState<DeviceRequest | null>(null)
  const [editNom,  setEditNom]  = useState("")
  const [editNotes,setEditNotes]= useState("")
  const [editTel,  setEditTel]  = useState("")

  // ── Interrupteur global du contrôle d'accès appareils ───────────────────────
  const [enforce,   setEnforce]   = useState(true)   // défaut : contrôle ACTIVÉ
  const [savingCfg, setSavingCfg] = useState(false)

  // Lecture/écriture via l'API service_role (bypass RLS) — format JSONB {id, payload}
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch("/api/sync-read?table=fl_site_access", { cache: "no-store" })
      const json = await res.json()
      const raw: Array<{ id: string; payload?: Record<string, unknown> }> = json?.ok ? (json.data ?? []) : []
      // Lit l'interrupteur global (id="__config") avant de filtrer les "__"
      const cfg = raw.find(r => r.id === "__config")
      setEnforce((cfg?.payload?.enforce as boolean | undefined) !== false)
      const list: DeviceRequest[] = raw
        .filter((r: { id: string }) => !String(r.id).startsWith("__"))
        .map((r: { id: string; payload?: Record<string, unknown> }) => {
          const p = r.payload ?? {}
          return {
            id:             r.id,
            device_id:      String(p.device_id ?? r.id),
            nom:            (p.nom as string) ?? null,
            telephone:      (p.telephone as string) ?? null,
            statut:         (p.statut as DeviceRequest["statut"]) ?? "en_attente",
            gps_lat:        (p.gps_lat as number) ?? null,
            gps_lng:        (p.gps_lng as number) ?? null,
            gps_precision:  (p.gps_precision as number) ?? null,
            user_agent:     (p.user_agent as string) ?? null,
            first_visit_at: (p.first_visit_at as string) ?? null,
            updated_at:     (p.updated_at as string) ?? null,
            autorise_par:   (p.autorise_par as string) ?? null,
            autorise_at:    (p.autorise_at as string) ?? null,
            notes:          (p.notes as string) ?? null,
            last_seen:      (p.last_seen as string) ?? null,
            connections:    Array.isArray(p.connections) ? (p.connections as string[]) : [],
          }
        })
        .sort((a: DeviceRequest, b: DeviceRequest) =>
          new Date(b.last_seen || b.first_visit_at || 0).getTime() - new Date(a.last_seen || a.first_visit_at || 0).getTime())
      setRows(list)
    } catch { /* hors ligne */ }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Auto-refresh toutes les 30s ────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  // ── Actions ────────────────────────────────────────────────────────────────
  // Reconstruit le payload JSONB complet depuis la ligne affichée + champs modifiés
  function rowToPayload(r: DeviceRequest, over: Record<string, unknown>): Record<string, unknown> {
    return {
      device_id: r.device_id, nom: r.nom, telephone: r.telephone, statut: r.statut,
      gps_lat: r.gps_lat, gps_lng: r.gps_lng, gps_precision: r.gps_precision,
      user_agent: r.user_agent, first_visit_at: r.first_visit_at,
      autorise_par: r.autorise_par, autorise_at: r.autorise_at, notes: r.notes,
      last_seen: r.last_seen, connections: r.connections,
      updated_at: new Date().toISOString(), ...over,
    }
  }
  async function writeRow(id: string, payload: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch("/api/sync-write", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_site_access", upserts: [{ id, payload, updated_at: new Date().toISOString() }] }),
      })
      const j = await res.json()
      return j.ok === true
    } catch { return false }
  }

  async function setStatut(deviceId: string, statut: "autorise" | "bloque", nom: string | null) {
    const now = new Date().toISOString()
    const row = rows.find(r => r.device_id === deviceId || r.id === deviceId)
    const base: DeviceRequest = row ?? ({ id: deviceId, device_id: deviceId, nom, statut } as DeviceRequest)
    const payload = rowToPayload(base, {
      statut,
      autorise_par: user.name ?? user.email ?? "Jawad",
      ...(statut === "autorise" ? { autorise_at: now } : {}),
    })
    const ok = await writeRow(row?.id ?? deviceId, payload)
    if (ok) {
      const action = statut === "autorise" ? "✅ Autorisé" : "🚫 Bloqué"
      setMsg({ ok: true, text: `${action} — ${nom ?? deviceId.slice(0, 12)}` })
      setTimeout(() => setMsg(null), 4000)
      load()
    } else {
      setMsg({ ok: false, text: "Erreur lors de la mise à jour." })
    }
  }

  async function deleteRow(deviceId: string, nom: string | null) {
    if (!confirm(`Supprimer la demande de ${nom ?? deviceId} ? Action irréversible.`)) return
    const row = rows.find(r => r.device_id === deviceId || r.id === deviceId)
    try {
      await fetch("/api/sync-write", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: "fl_site_access", deletes: [row?.id ?? deviceId] }),
      })
    } catch { /* ignore */ }
    load()
  }

  function openEdit(row: DeviceRequest) {
    setEditRow(row)
    setEditNom(row.nom ?? "")
    setEditTel(row.telephone ?? "")
    setEditNotes(row.notes ?? "")
  }

  async function saveEdit() {
    if (!editRow) return
    const payload = rowToPayload(editRow, {
      nom:       editNom.trim() || null,
      telephone: editTel.trim() || null,
      notes:     editNotes.trim() || null,
    })
    const ok = await writeRow(editRow.id, payload)
    if (ok) {
      setMsg({ ok: true, text: "✅ Appareil mis à jour." })
      setTimeout(() => setMsg(null), 3000)
      setEditRow(null)
      load()
    } else {
      setMsg({ ok: false, text: "Erreur lors de la mise à jour." })
    }
  }

  // ── Activer / désactiver le contrôle d'accès global ─────────────────────────
  async function toggleEnforce(next: boolean) {
    if (next) {
      const authorized = rows.filter(r => r.statut === "autorise").length
      if (!confirm(
        `Activer le contrôle d'accès ?\n\n` +
        `✅ ${authorized} appareil(s) autorisé(s) garderont l'accès.\n` +
        `🚫 Tous les autres appareils seront BLOQUÉS jusqu'à autorisation.\n\n` +
        `Astuce : autorisez d'abord les appareils à garder (bouton « Autoriser ») avant d'activer.\n\nContinuer ?`
      )) return
    }
    setSavingCfg(true)
    const ok = await writeRow("__config", {
      enforce: next,
      updated_at: new Date().toISOString(),
      updated_by: user.name ?? user.email ?? "admin",
    })
    setSavingCfg(false)
    if (ok) {
      setEnforce(next)
      setMsg({ ok: true, text: next
        ? "🔒 Contrôle d'accès ACTIVÉ — seuls les appareils autorisés passent."
        : "🔓 Contrôle d'accès DÉSACTIVÉ — tous les appareils ont accès." })
      setTimeout(() => setMsg(null), 5000)
    } else {
      setMsg({ ok: false, text: "Erreur lors de la mise à jour du contrôle." })
    }
  }

  if (!canAccess(user)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-4xl mb-3">🔒</div>
          <p className="text-sm text-gray-500">Accès réservé aux administrateurs.</p>
        </div>
      </div>
    )
  }

  // ── Filtrage ───────────────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    if (filter !== "tous" && r.statut !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        (r.nom ?? "").toLowerCase().includes(q) ||
        (r.telephone ?? "").includes(q) ||
        r.device_id.includes(q)
      )
    }
    return true
  })

  const counts = {
    tous:       rows.length,
    en_attente: rows.filter(r => r.statut === "en_attente").length,
    autorise:   rows.filter(r => r.statut === "autorise").length,
    bloque:     rows.filter(r => r.statut === "bloque").length,
  }

  // ── Rendu ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">

      {/* ── EDIT MODAL ────────────────────────────────────────────────────── */}
      {editRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-blue-700 text-base">✏️ Modifier l&apos;appareil</h3>
              <button onClick={() => setEditRow(null)} className="text-gray-400 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <p className="text-xs text-gray-500 font-mono bg-gray-50 rounded-lg px-3 py-2">
              🔑 {editRow.device_id.slice(0, 24)}...
            </p>
            {[
              { label: "Nom / Prénom", val: editNom,   set: setEditNom,   type: "text", ph: "Mohammed Alami" },
              { label: "Téléphone",   val: editTel,   set: setEditTel,   type: "tel",  ph: "+212 6XX XXX XXX" },
            ].map(f => (
              <div key={f.label} className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-700">{f.label}</label>
                <input type={f.type} value={f.val} placeholder={f.ph}
                  onChange={e => f.set(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-700">Notes internes</label>
              <textarea rows={2} value={editNotes} onChange={e => setEditNotes(e.target.value)}
                placeholder="Notes sur cet appareil ou utilisateur…"
                className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
            </div>
            <div className="flex gap-3 pt-2 border-t border-gray-100">
              <button onClick={saveEdit}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all">
                💾 Enregistrer
              </button>
              <button onClick={() => setEditRow(null)}
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50 transition-all">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* En-tête */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
            🛡️ Accès Appareils
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Gérez les demandes d'accès à FreshLink Pro
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-semibold text-gray-700 transition-all"
        >
          {loading ? (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
          ) : "🔄"} Actualiser
        </button>
      </div>

      {/* Interrupteur global du contrôle d'accès */}
      <div className={`mb-5 rounded-2xl border p-4 flex items-center justify-between gap-4 flex-wrap ${enforce ? "border-green-200 bg-green-50/40" : "border-amber-300 bg-amber-50/60"}`}>
        <div className="min-w-0">
          <div className="font-bold text-gray-900 flex items-center gap-2 text-sm">
            {enforce ? "🔒 Contrôle d'accès ACTIVÉ" : "🔓 Contrôle d'accès DÉSACTIVÉ"}
          </div>
          <p className="text-xs text-gray-500 mt-0.5 max-w-md">
            {enforce
              ? "Seuls les appareils « Autorisé » ci-dessous peuvent ouvrir FreshLink Pro. Les autres sont bloqués."
              : "Tous les appareils peuvent ouvrir FreshLink Pro (aucun blocage). Activez pour ne garder que les appareils autorisés."}
          </p>
        </div>
        <button
          onClick={() => toggleEnforce(!enforce)}
          disabled={savingCfg}
          role="switch"
          aria-checked={enforce}
          title={enforce ? "Désactiver le contrôle" : "Activer le contrôle"}
          className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${enforce ? "bg-green-500" : "bg-gray-300"}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enforce ? "translate-x-8" : "translate-x-1"}`} />
        </button>
      </div>

      {/* Suivi d'utilisation des appels (TURN Cloudflare) */}
      <TurnUsageCard />

      {/* Message */}
      {msg && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-semibold ${msg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {msg.text}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(["tous", "en_attente", "autorise", "bloque"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all ${
              filter === f
                ? f === "en_attente" ? "bg-amber-500 text-white border-amber-500"
                : f === "autorise"   ? "bg-green-500 text-white border-green-500"
                : f === "bloque"     ? "bg-red-500 text-white border-red-500"
                : "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            {f === "tous" ? "Tous" : STATUT[f]?.label}
            {" "}
            <span className="opacity-70">({counts[f]})</span>
          </button>
        ))}

        {/* Recherche */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Nom, téléphone, device ID..."
          className="ml-auto px-3 py-1.5 rounded-full text-xs border border-gray-200 outline-none focus:border-blue-400 w-48"
        />
      </div>

      {/* Alerte en attente */}
      {counts.en_attente > 0 && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2">
          <span className="text-lg">⏳</span>
          <span>
            <strong>{counts.en_attente} demande{counts.en_attente > 1 ? "s" : ""}</strong> en attente d'approbation.
          </span>
        </div>
      )}

      {/* Liste */}
      {loading && rows.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          Aucune demande {filter !== "tous" ? `avec statut "${STATUT[filter]?.label}"` : ""}.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(row => {
            const s = STATUT[row.statut] ?? STATUT.en_attente
            const hasGps = row.gps_lat != null && row.gps_lng != null
            const mapsUrl = hasGps
              ? `https://maps.google.com/?q=${row.gps_lat!.toFixed(6)},${row.gps_lng!.toFixed(6)}`
              : null

            return (
              <div
                key={row.id}
                className={`rounded-2xl border p-4 md:p-5 transition-all ${
                  row.statut === "en_attente"
                    ? "border-amber-200 bg-white shadow-sm"
                    : row.statut === "autorise"
                    ? "border-green-200 bg-green-50/30"
                    : "border-red-200 bg-red-50/30 opacity-80"
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Statut badge */}
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${s.bg} ${s.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`}/>
                        {s.label}
                      </span>
                      <span className="text-base font-black text-gray-900">
                        {row.nom ?? <span className="text-gray-400 italic">Inconnu</span>}
                      </span>
                      {row.telephone && (
                        <a
                          href={`https://wa.me/${row.telephone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-green-600 font-semibold hover:underline"
                        >
                          📱 {row.telephone}
                        </a>
                      )}
                    </div>

                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1 text-xs text-gray-500">
                      <span>🕒 Demande : {fmt(row.first_visit_at)}</span>
                      {row.last_seen && <span>📶 Vu : {fmt(row.last_seen)}</span>}
                      {row.autorise_at && <span>✅ Autorisé : {fmt(row.autorise_at)}</span>}
                      {row.autorise_par && <span>👤 Par : {row.autorise_par}</span>}
                      <span className="font-mono truncate">🔑 {row.device_id.slice(0, 20)}...</span>
                    </div>

                    {/* Historique de connexion */}
                    {row.connections.length > 0 && (
                      <div className="mt-2">
                        <button onClick={() => setOpenHist(openHist === row.id ? null : row.id)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800">
                          🕘 Historique de connexion ({row.connections.length}) {openHist === row.id ? "▲" : "▼"}
                        </button>
                        {openHist === row.id && (
                          <div className="mt-1.5 max-h-40 overflow-y-auto rounded-lg bg-gray-50 border border-gray-100 p-2 flex flex-col gap-0.5">
                            {[...row.connections].reverse().map((c, i) => (
                              <span key={i} className="text-[11px] text-gray-500 font-mono">• {fmt(c)}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* GPS */}
                    {hasGps && (
                      <div className="mt-2 flex items-center gap-2">
                        <a
                          href={mapsUrl!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-all"
                        >
                          📍 Voir sur Maps
                          {row.gps_precision && <span className="opacity-60">± {Math.round(row.gps_precision)}m</span>}
                        </a>
                      </div>
                    )}

                    {/* User agent (tronqué) */}
                    {row.user_agent && (
                      <p className="mt-1.5 text-[11px] text-gray-400 truncate max-w-xs">
                        {row.user_agent}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    {row.statut !== "autorise" && (
                      <button
                        onClick={() => setStatut(row.device_id, "autorise", row.nom)}
                        className="px-4 py-2 rounded-xl bg-green-500 hover:bg-green-600 text-white text-xs font-bold transition-all shadow-sm"
                      >
                        ✅ Autoriser
                      </button>
                    )}
                    {row.statut !== "bloque" && (
                      <button
                        onClick={() => setStatut(row.device_id, "bloque", row.nom)}
                        className="px-4 py-2 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold transition-all"
                      >
                        🚫 Bloquer
                      </button>
                    )}
                    {row.statut !== "en_attente" && (
                      <button
                        onClick={() => setStatut(row.device_id, "autorise", row.nom)}
                        className="px-4 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-bold transition-all"
                        title="Remettre en attente"
                      >
                        ⏳ En attente
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(row)}
                      className="px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-all"
                    >
                      ✏️ Modifier
                    </button>
                    <button
                      onClick={() => deleteRow(row.device_id, row.nom)}
                      className="px-4 py-2 rounded-xl bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 text-xs font-semibold transition-all"
                    >
                      🗑️ Supprimer
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
