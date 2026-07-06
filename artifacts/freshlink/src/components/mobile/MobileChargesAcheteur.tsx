"use client"

/**
 * MobileChargesAcheteur — Unified one-screen charge manager for the Acheteur role.
 *
 * All charges are visible in a scrollable list. A floating "+" button opens
 * an inline form to add a new charge. No sub-tabs — everything on ONE screen.
 */

import { useState, useEffect, useCallback } from "react"
import {
  store,
  type User,
  type ChargeClientAcheteur,
  type ChargeTypeAcheteur,
  CHARGE_TYPE_LABELS,
} from "@/lib/store"

interface Props { user: User }

const CHARGE_ICONS: Record<ChargeTypeAcheteur, string> = {
  transport:    "🚛",
  manutention:  "💪",
  emballage:    "📦",
  frais_marche: "🏪",
  peage:        "🛣️",
  autre:        "📝",
}

const CHARGE_COLORS: Record<ChargeTypeAcheteur, string> = {
  transport:    "#3b82f6",
  manutention:  "#f59e0b",
  emballage:    "#8b5cf6",
  frais_marche: "#06b6d4",
  peage:        "#ef4444",
  autre:        "#6b7280",
}

// Blank form state
function emptyForm() {
  return {
    clientNom:   "",
    bonAchatId:  "",
    date:        new Date().toISOString().slice(0, 10),
    type:        "transport" as ChargeTypeAcheteur,
    montant:     "",
    description: "",
  }
}

export default function MobileChargesAcheteur({ user }: Props) {
  const [charges, setCharges]   = useState<ChargeClientAcheteur[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(emptyForm())
  const [errors, setErrors]     = useState<Record<string, string>>({})
  const [saved, setSaved]       = useState(false)
  const [search, setSearch]     = useState("")
  const [filterType, setFilterType] = useState<ChargeTypeAcheteur | "all">("all")

  // Load all charges from localStorage
  const reload = useCallback(() => {
    setCharges(store.getChargesClient())
  }, [])

  useEffect(() => { reload() }, [reload])

  // All individual charge rows (flattened for display)
  // key encodes `${bonAchatId}|||${chargeIndex}` for reliable parsing
  const allRows = charges.flatMap(c =>
    c.charges.map((ch, i) => ({
      key:         `${c.bonAchatId}|||${i}`,
      clientNom:   c.clientNom,
      bonAchatId:  c.bonAchatId,
      date:        c.date,
      type:        ch.type,
      montant:     ch.montant,
      description: ch.description ?? "",
    }))
  )

  // Filter
  const filtered = allRows.filter(r => {
    const matchSearch =
      !search ||
      r.clientNom.toLowerCase().includes(search.toLowerCase()) ||
      r.bonAchatId.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase())
    const matchType = filterType === "all" || r.type === filterType
    return matchSearch && matchType
  })

  // Sort by date desc
  const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date))

  // Totals
  const totalAll    = allRows.reduce((s, r) => s + r.montant, 0)
  const totalToday  = allRows
    .filter(r => r.date === new Date().toISOString().slice(0, 10))
    .reduce((s, r) => s + r.montant, 0)

  function validate() {
    const e: Record<string, string> = {}
    if (!form.clientNom.trim()) e.clientNom = "Nom client requis"
    if (!form.bonAchatId.trim()) e.bonAchatId = "Réf. bon achat requise"
    if (!form.montant || Number(form.montant) <= 0) e.montant = "Montant invalide"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSave() {
    if (!validate()) return

    const existing = store.getChargesClient()

    // Find or create the ChargeClientAcheteur record for this bonAchatId
    const idx = existing.findIndex(c => c.bonAchatId === form.bonAchatId.trim())
    const newCharge = {
      type:        form.type,
      montant:     Number(form.montant),
      description: form.description.trim() || undefined,
    }

    if (idx >= 0) {
      existing[idx].charges.push(newCharge)
    } else {
      existing.push({
        clientId:   `cli_${form.clientNom.trim().toLowerCase().replace(/\s+/g, "_")}`,
        clientNom:  form.clientNom.trim(),
        bonAchatId: form.bonAchatId.trim(),
        date:       form.date,
        charges:    [newCharge],
      })
    }

    store.saveChargesClient(existing)
    reload()
    setForm(emptyForm())
    setShowForm(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function handleDelete(bonAchatId: string, idx: number) {
    const existing = store.getChargesClient()
    const recIdx   = existing.findIndex(c => c.bonAchatId === bonAchatId)
    if (recIdx < 0) return
    existing[recIdx].charges.splice(idx, 1)
    if (existing[recIdx].charges.length === 0) existing.splice(recIdx, 1)
    store.saveChargesClient(existing)
    reload()
  }

  // Count idx within the original record for deletion
  const fmt = (n: number) => n.toLocaleString("fr-MA", { maximumFractionDigits: 2 }) + " DH"

  return (
    <div className="flex flex-col h-full" style={{ background: "transparent" }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3">
        <h2 className="text-lg font-black mb-1" style={{ color: "#f1f5f9" }}>
          Charges Acheteur
        </h2>
        <p className="text-xs mb-3" style={{ color: "#64748b" }}>
          {allRows.length} charge{allRows.length !== 1 ? "s" : ""} enregistrée{allRows.length !== 1 ? "s" : ""}
        </p>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { label: "Total global", value: fmt(totalAll), color: "#4ade80" },
            { label: "Aujourd'hui",  value: fmt(totalToday), color: "#fbbf24" },
          ].map(k => (
            <div key={k.label} className="rounded-2xl px-3 py-2 text-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "#64748b" }}>
                {k.label}
              </p>
              <p className="text-sm font-black" style={{ color: k.color }}>
                {k.value}
              </p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "#475569" }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher client, réf, note…"
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm focus:outline-none"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#f1f5f9",
            }}
          />
        </div>

        {/* Type filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setFilterType("all")}
            className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all"
            style={{
              background: filterType === "all" ? "#1a4f2a" : "rgba(255,255,255,0.05)",
              color:      filterType === "all" ? "#4ade80" : "#64748b",
              border:     filterType === "all" ? "1px solid rgba(74,222,128,0.3)" : "1px solid rgba(255,255,255,0.06)",
            }}
          >
            Tous
          </button>
          {(Object.keys(CHARGE_TYPE_LABELS) as ChargeTypeAcheteur[]).map(t => (
            <button
              key={t}
              onClick={() => setFilterType(filterType === t ? "all" : t)}
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all"
              style={{
                background: filterType === t ? `${CHARGE_COLORS[t]}22` : "rgba(255,255,255,0.05)",
                color:      filterType === t ? CHARGE_COLORS[t] : "#64748b",
                border:     filterType === t ? `1px solid ${CHARGE_COLORS[t]}44` : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <span>{CHARGE_ICONS[t]}</span>
              <span>{CHARGE_TYPE_LABELS[t].split(" / ")[0].split(" / ")[0].split(" ")[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable charge list ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-2">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="text-5xl mb-4">🧾</div>
            <p className="text-sm font-bold mb-1" style={{ color: "#f1f5f9" }}>
              {allRows.length === 0 ? "Aucune charge enregistrée" : "Aucun résultat"}
            </p>
            <p className="text-xs" style={{ color: "#64748b" }}>
              {allRows.length === 0
                ? "Appuyez sur + pour ajouter votre première charge"
                : "Modifiez vos filtres pour voir d'autres charges"}
            </p>
          </div>
        ) : (
          sorted.map((row, i) => {
            // Parse original charge index within its record from the key (format: bonAchatId|||index)
            const chargeIdxInRec = Number(row.key.split("|||")[1] ?? "0")
            return (
              <div key={row.key + i}
                className="rounded-2xl p-3 flex items-start gap-3"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}>

                {/* Type icon */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                  style={{ background: `${CHARGE_COLORS[row.type]}18`, border: `1px solid ${CHARGE_COLORS[row.type]}33` }}>
                  {CHARGE_ICONS[row.type]}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: "#f1f5f9" }}>
                        {row.clientNom}
                      </p>
                      <p className="text-[11px] truncate" style={{ color: "#64748b" }}>
                        {row.bonAchatId} · {new Date(row.date).toLocaleDateString("fr-MA")}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-sm font-black" style={{ color: CHARGE_COLORS[row.type] }}>
                        {fmt(row.montant)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{
                          background: `${CHARGE_COLORS[row.type]}22`,
                          color: CHARGE_COLORS[row.type],
                        }}>
                        {CHARGE_TYPE_LABELS[row.type].split(" / ")[0]}
                      </span>
                    </div>
                  </div>
                  {row.description && (
                    <p className="text-[11px] mt-1 italic truncate" style={{ color: "#94a3b8" }}>
                      {row.description}
                    </p>
                  )}
                </div>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(row.bonAchatId, chargeIdxInRec)}
                  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center opacity-40
                             hover:opacity-90 transition-opacity"
                  style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}
                  title="Supprimer cette charge"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* ── Floating "+" button ──────────────────────────────────────────────── */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="fixed bottom-24 right-5 w-14 h-14 rounded-full flex items-center justify-center
                     text-2xl font-black shadow-xl transition-transform active:scale-90 z-40"
          style={{
            background:  "linear-gradient(135deg,#1a4f2a,#2d7a46)",
            boxShadow:   "0 0 24px rgba(26,79,42,0.7)",
            color:       "#ffffff",
            border:      "2px solid rgba(74,222,128,0.3)",
          }}
          title="Ajouter une charge"
        >
          +
        </button>
      )}

      {/* ── Success toast ────────────────────────────────────────────────────── */}
      {saved && (
        <div className="fixed bottom-32 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-2xl text-sm font-bold z-50
                        flex items-center gap-2 animate-bounce"
          style={{ background: "#1a4f2a", color: "#4ade80", border: "1px solid rgba(74,222,128,0.4)" }}>
          <span>✓</span> Charge enregistrée
        </div>
      )}

      {/* ── Add charge drawer/sheet ──────────────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowForm(false) }}
        >
          <div
            className="w-full max-h-[92vh] overflow-y-auto rounded-t-3xl p-5"
            style={{ background: "#0a1f12", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {/* Sheet header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-black" style={{ color: "#f1f5f9" }}>
                Nouvelle charge
              </h3>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.08)", color: "#94a3b8" }}
              >
                ✕
              </button>
            </div>

            {/* Form grid */}
            <div className="space-y-3">

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#94a3b8" }}>
                  Date
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                  style={{
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f1f5f9",
                  }}
                />
              </div>

              {/* Client nom */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#94a3b8" }}>
                  Nom du client <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  value={form.clientNom}
                  onChange={e => setForm(f => ({ ...f, clientNom: e.target.value }))}
                  placeholder="Ex: Marché Central"
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: errors.clientNom ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.1)",
                    color: "#f1f5f9",
                  }}
                />
                {errors.clientNom && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.clientNom}</p>}
              </div>

              {/* Bon achat ref */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#94a3b8" }}>
                  Réf. bon d&apos;achat <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  value={form.bonAchatId}
                  onChange={e => setForm(f => ({ ...f, bonAchatId: e.target.value }))}
                  placeholder="Ex: BA-2026-001"
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: errors.bonAchatId ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.1)",
                    color: "#f1f5f9",
                  }}
                />
                {errors.bonAchatId && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.bonAchatId}</p>}
              </div>

              {/* Type de charge */}
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: "#94a3b8" }}>
                  Type de charge
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(CHARGE_TYPE_LABELS) as ChargeTypeAcheteur[]).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, type: t }))}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold
                                 transition-all text-left"
                      style={{
                        background: form.type === t ? `${CHARGE_COLORS[t]}22` : "rgba(255,255,255,0.04)",
                        border:     form.type === t ? `1.5px solid ${CHARGE_COLORS[t]}66` : "1px solid rgba(255,255,255,0.06)",
                        color:      form.type === t ? CHARGE_COLORS[t] : "#94a3b8",
                      }}
                    >
                      <span className="text-lg">{CHARGE_ICONS[t]}</span>
                      <span className="text-[11px] leading-tight">
                        {CHARGE_TYPE_LABELS[t].split(" / ").join("\n")}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Montant */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#94a3b8" }}>
                  Montant (DH) <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.montant}
                    onChange={e => setForm(f => ({ ...f, montant: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 pr-12 rounded-xl text-sm focus:outline-none"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: errors.montant ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.1)",
                      color: "#f1f5f9",
                    }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold"
                    style={{ color: "#4ade80" }}>DH</span>
                </div>
                {errors.montant && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.montant}</p>}
              </div>

              {/* Note optionnelle */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "#94a3b8" }}>
                  Note (optionnelle)
                </label>
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Détails supplémentaires…"
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f1f5f9",
                  }}
                />
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setShowForm(false); setForm(emptyForm()); setErrors({}) }}
                  className="flex-1 py-3 rounded-2xl text-sm font-bold"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "#94a3b8",
                  }}
                >
                  Annuler
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-3 rounded-2xl text-sm font-black"
                  style={{
                    background: "linear-gradient(135deg,#1a4f2a,#2d7a46)",
                    color: "#ffffff",
                    border: "1px solid rgba(74,222,128,0.3)",
                    boxShadow: "0 0 16px rgba(26,79,42,0.5)",
                  }}
                >
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
