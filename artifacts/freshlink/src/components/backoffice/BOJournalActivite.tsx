"use client"

import { useState, useMemo } from "react"
import { store, type User } from "@/lib/store"
import { getVisibleAuditLog, type AuditLogEntry } from "@/lib/auditLog"
import { PERMISSIONS } from "@/lib/permissions"

// ══════════════════════════════════════════════════════════════════════════════
// Journal d'Activité — qui fait quoi et quand.
// Isolation par équipe (cf. getVisibleAuditLog) : chaque équipe ne voit que
// son propre historique, seul super_super_admin a la vision globale.
// ══════════════════════════════════════════════════════════════════════════════

interface Props { user: User }

const CATEGORIES = Array.from(new Set(PERMISSIONS.map(p => p.category)))

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
  } catch { return iso }
}

export default function BOJournalActivite({ user }: Props) {
  const [entries] = useState<AuditLogEntry[]>(() => getVisibleAuditLog(user))
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState("")
  const [result, setResult] = useState<"" | "success" | "denied">("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries
      .filter(e => {
        const matchSearch = !q ||
          e.userName.toLowerCase().includes(q) ||
          e.actionLabel.toLowerCase().includes(q) ||
          (e.entityLabel ?? "").toLowerCase().includes(q)
        const matchCat = !category || e.category === category
        const matchResult = !result || e.result === result
        const day = e.timestamp.slice(0, 10)
        const matchFrom = !dateFrom || day >= dateFrom
        const matchTo = !dateTo || day <= dateTo
        return matchSearch && matchCat && matchResult && matchFrom && matchTo
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }, [entries, search, category, result, dateFrom, dateTo])

  const exportCSV = () => {
    const headers = ["Date", "Utilisateur", "Rôle", "Action", "Catégorie", "Entité", "Résultat"]
    const rows = filtered.map(e => [
      fmtDateTime(e.timestamp), e.userName, e.userRole, e.actionLabel, e.category,
      e.entityLabel ?? "", e.result === "success" ? "Autorisé" : "Refusé",
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `journal-activite_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">📋 Journal d&apos;Activité</h1>
          <p className="text-sm text-slate-500 mt-1">
            Qui fait quoi et quand — {entries.length} action(s) enregistrée(s){entries.length >= 5000 ? " (limite de rétention atteinte, les plus anciennes sont purgées)" : ""}.
          </p>
        </div>
        <button onClick={exportCSV} disabled={filtered.length === 0}
          className="px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors disabled:opacity-40">
          Exporter CSV
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Utilisateur, action, entité…"
          className="flex-1 min-w-52 px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          <option value="">Toutes catégories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={result} onChange={e => setResult(e.target.value as "" | "success" | "denied")}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm">
          <option value="">Autorisé + Refusé</option>
          <option value="success">Autorisé uniquement</option>
          <option value="denied">Refusé uniquement</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
        <span className="text-xs text-muted-foreground">→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="px-3 py-2 rounded-xl border border-border bg-background text-sm" />
        {(search || category || result || dateFrom || dateTo) && (
          <button onClick={() => { setSearch(""); setCategory(""); setResult(""); setDateFrom(""); setDateTo("") }}
            className="px-3 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground">
            ✕ Effacer
          </button>
        )}
        <span className="text-xs text-muted-foreground bg-muted rounded-lg px-2 py-1.5 font-medium ml-auto">
          {filtered.length}/{entries.length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Utilisateur</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Action</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Entité</th>
                <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Résultat</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.id} className={`border-b border-border last:border-0 hover:bg-muted/20 ${e.result === "denied" ? "bg-red-50/40" : ""}`}>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono whitespace-nowrap">{fmtDateTime(e.timestamp)}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{e.userName}</p>
                    <p className="text-[10px] text-muted-foreground">{e.userRole}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-foreground">{e.actionLabel}</p>
                    <p className="text-[10px] text-muted-foreground">{e.category}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {e.entityLabel ?? (e.entityType ?? "—")}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${e.result === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {e.result === "success" ? "Autorisé" : "Refusé"}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">Aucune activité trouvée.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
