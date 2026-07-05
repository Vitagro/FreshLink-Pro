"use client"

import { useState, useRef, useCallback } from "react"
import { store, type User } from "@/lib/store"
import { getExternalPricesByArticle, lookupExternalPrice } from "@/lib/extCompetitorPrices"

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetitorEntry {
  id: string
  concurrentNom: string
  sku: string           // article name / SKU
  prixConcurrent: number
  prixNotre: number
  unite: string         // "kg" | "piece" | "caisse"
  promotion?: string    // promo description
  reduction?: number    // % reduction from concurrent
  photo?: string        // base64 or URL
  lieu?: string         // "Marche Derb Omar" etc
  source: "photo" | "terrain" | "en_ligne" | "catalogue"
  date: string          // ISO date
  note?: string
}

const SOURCES = [
  { v: "terrain",    l: "Terrain / Visite" },
  { v: "photo",      l: "Photo etagere" },
  { v: "en_ligne",   l: "En ligne / Web" },
  { v: "catalogue",  l: "Catalogue / Brochure" },
]

const UNITES = ["kg", "piece", "caisse", "sac", "litre", "palette"]

const LS_KEY = "fl_intel_prix"

function getEntries(): CompetitorEntry[] {
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]") } catch { return [] }
}
function saveEntries(e: CompetitorEntry[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(e))
}
function genId() { return `ip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }

// ─── Delta badge ─────────────────────────────────────────────────────────────

function DeltaBadge({ prixC, prixN }: { prixC: number; prixN: number }) {
  if (!prixC || !prixN) return null
  const delta = ((prixN - prixC) / prixC) * 100
  const abs = Math.abs(delta).toFixed(1)
  const isWorse = delta > 0
  const isBetter = delta < 0
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${
      isWorse
        ? "bg-red-100 text-red-700"
        : isBetter
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-600"
    }`}>
      {isWorse ? "+" : isBetter ? "-" : "="}
      {abs}%
      {isWorse ? " plus cher" : isBetter ? " moins cher" : " identique"}
    </span>
  )
}

// ─── EMPTY FORM ────────────────────────────────────────────────────────────────

const EMPTY: Omit<CompetitorEntry, "id" | "date"> = {
  concurrentNom: "", sku: "", prixConcurrent: 0, prixNotre: 0, unite: "kg",
  promotion: "", reduction: 0, lieu: "", source: "terrain", note: "", photo: "",
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function BOIntelligencePrix({ user }: { user: User }) {
  const [entries, setEntries] = useState<CompetitorEntry[]>(getEntries)
  // Liste des produits du catalogue → liste déroulante pour le relevé de prix
  const [articleNames] = useState<string[]>(() => {
    try { return Array.from(new Set(store.getArticles().map(a => a.nom).filter(Boolean))).sort() } catch { return [] }
  })
  const [form, setForm] = useState({ ...EMPTY })
  const [editing, setEditing] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [filterSku, setFilterSku] = useState("")
  const [filterConcurrent, setFilterConcurrent] = useState("")
  const [filterFrom, setFilterFrom] = useState("")
  const [filterTo, setFilterTo] = useState("")
  const [photoDrag, setPhotoDrag] = useState(false)
  const [tab, setTab] = useState<"tableau" | "stats">("tableau")
  const photoRef = useRef<HTMLInputElement>(null)

  const filtered = entries.filter(e => {
    const d = String(e.date ?? "").slice(0, 10)
    return (!filterSku || e.sku.toLowerCase().includes(filterSku.toLowerCase())) &&
      (!filterConcurrent || e.concurrentNom.toLowerCase().includes(filterConcurrent.toLowerCase())) &&
      (!filterFrom || d >= filterFrom) &&
      (!filterTo || d <= filterTo)
  })

  // Source prioritaire : sync GestFlux/Iziry (Comparatif Données Externes),
  // sur la même plage de dates que le filtre ci-dessus.
  const externalPrices = getExternalPricesByArticle(filterFrom, filterTo)

  // Photo handling
  const handlePhoto = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = ev => setForm(f => ({ ...f, photo: ev.target?.result as string ?? "" }))
    reader.readAsDataURL(file)
  }, [])

  const save = () => {
    if (!form.sku.trim() || !form.concurrentNom.trim()) return
    if (editing) {
      const updated = entries.map(e => e.id === editing
        ? { ...e, ...form, date: e.date } : e)
      saveEntries(updated); setEntries(updated)
    } else {
      const n: CompetitorEntry = { ...form, id: genId(), date: new Date().toISOString() }
      const updated = [n, ...entries]
      saveEntries(updated); setEntries(updated)
    }
    setForm({ ...EMPTY }); setEditing(null); setShowForm(false)
  }

  const openEdit = (e: CompetitorEntry) => {
    setForm({ concurrentNom: e.concurrentNom, sku: e.sku, prixConcurrent: e.prixConcurrent,
      prixNotre: e.prixNotre, unite: e.unite, promotion: e.promotion ?? "",
      reduction: e.reduction ?? 0, lieu: e.lieu ?? "", source: e.source,
      note: e.note ?? "", photo: e.photo ?? "" })
    setEditing(e.id); setShowForm(true)
  }

  const del = (id: string) => {
    const updated = entries.filter(e => e.id !== id)
    saveEntries(updated); setEntries(updated)
  }

  // Stats — relevés manuels (terrain/photo) + prix GestFlux/Iziry synchronisés
  // (Comparatif Données Externes) en référence, sur la même plage de dates.
  const skus = [...new Set([...entries.map(e => e.sku), ...Object.keys(externalPrices)])]
  const statsBySku = skus.map(sku => {
    const rows = entries.filter(e => e.sku === sku)
    const avgConc = rows.length ? rows.reduce((s, r) => s + r.prixConcurrent, 0) / rows.length : 0
    const avgNous = rows.length ? rows.reduce((s, r) => s + r.prixNotre, 0) / rows.length : 0
    const delta = avgNous && avgConc ? ((avgNous - avgConc) / avgConc) * 100 : 0
    const ext = lookupExternalPrice(externalPrices, sku)
    return {
      sku, count: rows.length, avgConc, avgNous, delta,
      minConc: rows.length ? Math.min(...rows.map(r => r.prixConcurrent)) : 0,
      extPA: ext?.paGf ?? 0, extPV: ext?.pvIz ?? 0,
    }
  }).sort((a, b) => b.delta - a.delta)

  const canEdit = user.role === "admin" || user.role === "super_admin" || user.role === "super_super_admin" ||
    user.role === "resp_commercial" || user.role === "acheteur" || user.role === "ctrl_achat"

  return (
    <div className="flex flex-col gap-0 h-full bg-slate-50 min-h-screen">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">Intelligence Prix & Concurrence</h1>
            <p className="text-sm text-slate-500 mt-0.5">Analyse competitive — prix terrain, photos, calcul delta</p>
          </div>
          {canEdit && (
            <button onClick={() => { setForm({ ...EMPTY }); setEditing(null); setShowForm(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouvelle entree
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {([["tableau", "Tableau comparatif"], ["stats", "Statistiques SKU"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                tab === v ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="px-6 py-3 flex gap-3 flex-wrap bg-white border-b border-slate-100">
        <input value={filterSku} onChange={e => setFilterSku(e.target.value)}
          placeholder="Filtrer par produit (SKU)..."
          className="flex-1 min-w-[180px] px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        <input value={filterConcurrent} onChange={e => setFilterConcurrent(e.target.value)}
          placeholder="Filtrer par concurrent..."
          className="flex-1 min-w-[180px] px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        <label className="flex items-center gap-1.5 text-xs text-slate-500">Du
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
            className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-500">Au
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
            className="px-2 py-1.5 text-sm border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
        </label>
        <span className="self-center text-xs text-slate-400 font-medium">{filtered.length} entree(s)</span>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto px-4 py-4">

        {tab === "tableau" && (
          <>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <p className="text-sm font-semibold">Aucune entree de veille prix</p>
                <p className="text-xs">Ajoutez des prix concurrents pour calculer les deltas</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map(e => (
                  <div key={e.id} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    {/* Photo header */}
                    {e.photo ? (
                      <div className="h-40 bg-slate-100 overflow-hidden">
                        <img src={e.photo} alt="Photo prix concurrent" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="h-20 bg-gradient-to-r from-slate-100 to-slate-50 flex items-center justify-center">
                        <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    )}

                    <div className="p-4 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{e.sku}</p>
                          <p className="text-xs text-slate-500">{e.concurrentNom}</p>
                        </div>
                        <DeltaBadge prixC={e.prixConcurrent} prixN={e.prixNotre} />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-red-50 rounded-lg px-3 py-2">
                          <p className="text-red-500 font-medium mb-0.5">Concurrent</p>
                          <p className="font-bold text-red-700 text-base">{e.prixConcurrent.toFixed(2)} DH
                            <span className="text-xs font-normal text-red-400 ml-1">/{e.unite}</span>
                          </p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg px-3 py-2">
                          <p className="text-emerald-600 font-medium mb-0.5">Notre prix</p>
                          <p className="font-bold text-emerald-700 text-base">{e.prixNotre.toFixed(2)} DH
                            <span className="text-xs font-normal text-emerald-500 ml-1">/{e.unite}</span>
                          </p>
                        </div>
                      </div>

                      {e.promotion && (
                        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                          <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                          </svg>
                          <span className="text-xs font-semibold text-amber-700">{e.promotion}</span>
                          {(e.reduction ?? 0) > 0 && (
                            <span className="ml-auto text-xs font-bold text-amber-600">-{e.reduction}%</span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs text-slate-400 mt-1">
                        <span className="capitalize">{SOURCES.find(s => s.v === e.source)?.l ?? e.source}</span>
                        {e.lieu && <span className="truncate max-w-[120px]">{e.lieu}</span>}
                        <span>{new Date(e.date).toLocaleDateString("fr-FR")}</span>
                      </div>

                      {canEdit && (
                        <div className="flex gap-2 pt-1 border-t border-slate-100">
                          <button onClick={() => openEdit(e)}
                            className="flex-1 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg py-1.5 transition-colors">
                            Modifier
                          </button>
                          <button onClick={() => del(e.id)}
                            className="flex-1 text-xs font-semibold text-red-500 hover:bg-red-50 rounded-lg py-1.5 transition-colors">
                            Supprimer
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "stats" && (
          <div className="flex flex-col gap-4 max-w-4xl">
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <h3 className="font-bold text-slate-800 text-sm">Analyse par produit (SKU)</h3>
              </div>
              {statsBySku.length === 0 ? (
                <p className="text-center text-slate-400 text-sm py-10">Aucune donnee disponible</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500 font-semibold uppercase tracking-wide">
                        <th className="px-4 py-3 text-left">Produit</th>
                        <th className="px-4 py-3 text-right">Nb releves</th>
                        <th className="px-4 py-3 text-right">Prix conc. moy.</th>
                        <th className="px-4 py-3 text-right">Prix conc. min</th>
                        <th className="px-4 py-3 text-right">Notre prix moy.</th>
                        <th className="px-4 py-3 text-right">Delta</th>
                        <th className="px-4 py-3 text-right" title="Sync GestFlux — Comparatif Données Externes">PA GestFlux</th>
                        <th className="px-4 py-3 text-right" title="Sync Iziry — Comparatif Données Externes">PV Iziry</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {statsBySku.map(s => (
                        <tr key={s.sku} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-slate-800">{s.sku}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{s.count}</td>
                          <td className="px-4 py-3 text-right text-red-600 font-medium">{s.count ? `${s.avgConc.toFixed(2)} DH` : "—"}</td>
                          <td className="px-4 py-3 text-right text-orange-500 font-medium">{s.count ? `${s.minConc.toFixed(2)} DH` : "—"}</td>
                          <td className="px-4 py-3 text-right text-slate-700 font-medium">{s.count ? `${s.avgNous.toFixed(2)} DH` : "—"}</td>
                          <td className="px-4 py-3 text-right">
                            {s.count ? <DeltaBadge prixC={s.avgConc} prixN={s.avgNous} /> : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-blue-600 font-medium">{s.extPA > 0 ? `${s.extPA.toFixed(2)} DH` : "—"}</td>
                          <td className="px-4 py-3 text-right text-orange-600 font-medium">{s.extPV > 0 ? `${s.extPV.toFixed(2)} DH` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Produits surveilles", val: skus.length.toString(), color: "blue" },
                { label: "Concurrents identifies", val: [...new Set(entries.map(e => e.concurrentNom))].length.toString(), color: "violet" },
                { label: "Photos etagere", val: entries.filter(e => e.photo).length.toString(), color: "amber" },
              ].map(c => (
                <div key={c.label} className={`bg-white rounded-2xl border border-${c.color}-100 p-4 shadow-sm`}>
                  <p className={`text-2xl font-black text-${c.color}-600`}>{c.val}</p>
                  <p className="text-xs text-slate-500 mt-1 font-medium">{c.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── FORM MODAL ──────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="font-bold text-slate-900">{editing ? "Modifier" : "Nouvelle"} entree concurrence</h2>
              <button onClick={() => { setShowForm(false); setEditing(null) }}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Concurrent */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Nom du concurrent *</label>
                <input value={form.concurrentNom} onChange={e => setForm(f => ({ ...f, concurrentNom: e.target.value }))}
                  placeholder="Ex: Marche Centrale, Souss Frais..."
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>

              {/* SKU — liste déroulante du catalogue (+ saisie libre = produit hors liste) */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Produit / SKU *</label>
                <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  list="ip-article-list"
                  placeholder="Choisir dans le catalogue, ou saisir un produit hors liste…"
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                <datalist id="ip-article-list">
                  {articleNames.map(n => <option key={n} value={n} />)}
                </datalist>
                {form.sku.trim() && !articleNames.some(n => n.toLowerCase() === form.sku.trim().toLowerCase()) && (
                  <p className="text-[11px] text-amber-600 font-semibold">⏳ Produit hors catalogue — relevé enregistré, mais non ajouté au catalogue sans validation admin.</p>
                )}
              </div>

              {/* Prix concurrent */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Prix concurrent (DH)</label>
                <input type="number" min={0} step={0.01} value={form.prixConcurrent || ""}
                  onChange={e => setForm(f => ({ ...f, prixConcurrent: parseFloat(e.target.value) || 0 }))}
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>

              {/* Notre prix */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Notre prix (DH)</label>
                <input type="number" min={0} step={0.01} value={form.prixNotre || ""}
                  onChange={e => setForm(f => ({ ...f, prixNotre: parseFloat(e.target.value) || 0 }))}
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>

              {/* Unite */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Unite</label>
                <select value={form.unite} onChange={e => setForm(f => ({ ...f, unite: e.target.value }))}
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                  {UNITES.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              {/* Source */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Source</label>
                <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value as CompetitorEntry["source"] }))}
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                  {SOURCES.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </div>

              {/* Promo */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Promotion (description)</label>
                <input value={form.promotion} onChange={e => setForm(f => ({ ...f, promotion: e.target.value }))}
                  placeholder="Ex: -20% weekend, 2+1 offert..."
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>

              {/* Reduction */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">% Reduction affichee</label>
                <input type="number" min={0} max={100} value={form.reduction || ""}
                  onChange={e => setForm(f => ({ ...f, reduction: parseFloat(e.target.value) || 0 }))}
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>

              {/* Lieu */}
              <div className="flex flex-col gap-1 sm:col-span-2">
                <label className="text-xs font-semibold text-slate-700">Lieu / Point de vente</label>
                <input value={form.lieu} onChange={e => setForm(f => ({ ...f, lieu: e.target.value }))}
                  placeholder="Ex: Derb Omar Casablanca, Carrefour Maarif..."
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>

              {/* Delta preview */}
              {form.prixConcurrent > 0 && form.prixNotre > 0 && (
                <div className="sm:col-span-2 bg-slate-50 rounded-xl px-4 py-3 flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-600">Delta calcule :</span>
                  <DeltaBadge prixC={form.prixConcurrent} prixN={form.prixNotre} />
                </div>
              )}

              {/* Photo upload */}
              <div className="sm:col-span-2 flex flex-col gap-2">
                <label className="text-xs font-semibold text-slate-700">Photo etagere / catalogue</label>
                <input ref={photoRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handlePhoto(f); e.target.value = "" }} />
                <div
                  onDragOver={e => { e.preventDefault(); setPhotoDrag(true) }}
                  onDragLeave={() => setPhotoDrag(false)}
                  onDrop={e => { e.preventDefault(); setPhotoDrag(false); const f = e.dataTransfer.files?.[0]; if (f) handlePhoto(f) }}
                  onClick={() => photoRef.current?.click()}
                  className={`flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all text-sm ${
                    photoDrag ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-200 text-slate-400 hover:border-slate-300 hover:bg-slate-50"
                  }`}>
                  {form.photo ? (
                    <div className="relative w-full">
                      <img src={form.photo} alt="Apercu photo concurrent" className="h-32 w-full object-contain rounded-lg" />
                      <button type="button" onClick={ev => { ev.stopPropagation(); setForm(f => ({ ...f, photo: "" })) }}
                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600">
                        &times;
                      </button>
                    </div>
                  ) : (
                    <>
                      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>Cliquer ou glisser-deposer une photo de prix</span>
                    </>
                  )}
                </div>
              </div>

              {/* Note */}
              <div className="sm:col-span-2 flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Note interne</label>
                <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  rows={2} placeholder="Observations, contexte, strategie..."
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end sticky bottom-0 bg-white">
              <button onClick={() => { setShowForm(false); setEditing(null) }}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Annuler
              </button>
              <button onClick={save} disabled={!form.sku.trim() || !form.concurrentNom.trim()}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-sm">
                {editing ? "Enregistrer" : "Ajouter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
