"use client"

import { useState, useEffect } from "react"
import { store, type Trip, type BonLivraison, type Commande, type User } from "@/lib/store"

interface Props { user: User }

const fmtDH = (n: number) => n.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DH"

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-1 ${accent}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-60">{label}</p>
      <p className="text-2xl font-extrabold leading-tight">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="w-full h-2 rounded-full bg-black/10 overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

// Parse "HH:MM" time string to minutes
function timeToMin(t?: string): number | null {
  if (!t) return null
  const [h, m] = t.split(":").map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

// Classify delivery timing relative to requested time
// heureRequise: "HH:MM", heureLivraison: "HH:MM"
// Returns: "tot" | "a_temps" | "retard_30" | "retard_1h" | "unknown"
function classifyTiming(heureRequise?: string, heureLivraison?: string): "tot" | "a_temps" | "retard_30" | "retard_1h" | "unknown" {
  const req = timeToMin(heureRequise)
  const act = timeToMin(heureLivraison)
  if (req === null || act === null) return "unknown"
  const diff = act - req  // positive = late, negative = early
  if (diff < -30) return "tot"           // > 30min early = TOT (trop tôt)
  if (diff <= 30) return "a_temps"       // within 30min window = à temps
  if (diff <= 60) return "retard_30"     // 30–60 min late
  return "retard_1h"                     // > 60 min late
}

interface LivreurPerf {
  nom: string
  trips: number
  clients: number
  livres: number
  retours: number
  tonnage: number
  caTotal: number
  tot: number
  aTtemps: number
  retard30: number
  retard1h: number
  unknownTiming: number
  tauxLivraison: number
  tauxRetour: number
}

export default function BORapportLivraison({ user: _user }: Props) {
  const [trips, setTrips] = useState<Trip[]>([])
  const [bls, setBls] = useState<BonLivraison[]>([])
  const [commandes, setCommandes] = useState<Commande[]>([])
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]
  })
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split("T")[0])
  const [filterLivreur, setFilterLivreur] = useState("")
  const [activeTab, setActiveTab] = useState<"global" | "detail" | "livreur">("global")

  useEffect(() => {
    setTrips(store.getTrips())
    setBls(store.getBonsLivraison())
    setCommandes(store.getCommandes())
  }, [])

  const livreurs = [...new Set(trips.map(t => t.livreurNom))]

  const filteredTrips = trips.filter(t => {
    if (t.date < dateFrom || t.date > dateTo) return false
    if (filterLivreur && t.livreurNom !== filterLivreur) return false
    return true
  })

  // ── Per-livreur aggregation ───────────────────────────────────────────
  const livreurPerfMap: Record<string, LivreurPerf> = {}

  for (const trip of filteredTrips) {
    const tripBls = bls.filter(bl => bl.tripId === trip.id)
    const nom = trip.livreurNom

    if (!livreurPerfMap[nom]) {
      livreurPerfMap[nom] = {
        nom, trips: 0, clients: 0, livres: 0, retours: 0,
        tonnage: 0, caTotal: 0,
        tot: 0, aTtemps: 0, retard30: 0, retard1h: 0, unknownTiming: 0,
        tauxLivraison: 0, tauxRetour: 0,
      }
    }
    const p = livreurPerfMap[nom]
    p.trips++
    p.clients += trip.commandeIds.length
    p.livres += tripBls.filter(bl => bl.statutLivraison === "livre").length
    p.retours += tripBls.filter(bl => bl.statutLivraison === "retour").length
    p.tonnage += tripBls.reduce((s, bl) => s + bl.lignes.reduce((ls, l) => ls + l.quantite, 0), 0)
    p.caTotal += tripBls.reduce((s, bl) => s + (bl.montantTTC ?? bl.montantTotal), 0)

    // Timing analysis per BL
    for (const bl of tripBls.filter(b => b.statutLivraison === "livre")) {
      const cmd = commandes.find(c => c.id === bl.commandeId)
      // heurelivraison = requested delivery time, heureLivraison = actual (on BL)
      const requested = cmd?.heurelivraison
      const actual = bl.heureLivraisonReelle ?? bl.heureEffective
      const timing = classifyTiming(requested, actual)
      if (timing === "tot") p.tot++
      else if (timing === "a_temps") p.aTtemps++
      else if (timing === "retard_30") p.retard30++
      else if (timing === "retard_1h") p.retard1h++
      else p.unknownTiming++
    }
  }

  // Compute rates
  const livreurPerfs = Object.values(livreurPerfMap).map(p => ({
    ...p,
    tauxLivraison: p.clients > 0 ? Math.round((p.livres / p.clients) * 100) : 0,
    tauxRetour: p.clients > 0 ? Math.round((p.retours / p.clients) * 100) : 0,
  })).sort((a, b) => b.tauxLivraison - a.tauxLivraison)

  // ── Global KPIs ──────────────────────────────────────────────────────
  const totalTrips = filteredTrips.length
  const totalClients = livreurPerfs.reduce((s, p) => s + p.clients, 0)
  const totalLivres = livreurPerfs.reduce((s, p) => s + p.livres, 0)
  const totalRetours = livreurPerfs.reduce((s, p) => s + p.retours, 0)
  const totalTonnage = livreurPerfs.reduce((s, p) => s + p.tonnage, 0)
  const totalCA = livreurPerfs.reduce((s, p) => s + p.caTotal, 0)
  const totalATtemps = livreurPerfs.reduce((s, p) => s + p.aTtemps, 0)
  const totalTOT = livreurPerfs.reduce((s, p) => s + p.tot, 0)
  const totalRetard30 = livreurPerfs.reduce((s, p) => s + p.retard30, 0)
  const totalRetard1h = livreurPerfs.reduce((s, p) => s + p.retard1h, 0)
  const tauxGlobal = totalClients > 0 ? Math.round((totalLivres / totalClients) * 100) : 0
  const tauxRetourGlobal = totalClients > 0 ? Math.round((totalRetours / totalClients) * 100) : 0

  const exportCSV = () => {
    const header = "Livreur,Trips,Clients,Livrés,Retours,Taux Livraison (%),Taux Retour (%),Tonnage (kg),CA TTC (DH),A Temps,TOT,Retard 30min,Retard 1h+"
    const rows = livreurPerfs.map(p =>
      [p.nom, p.trips, p.clients, p.livres, p.retours, p.tauxLivraison, p.tauxRetour,
        p.tonnage.toFixed(1), p.caTotal.toFixed(2), p.aTtemps, p.tot, p.retard30, p.retard1h].join(",")
    )
    const csv = [header, ...rows].join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    a.download = `performance_livreurs_${dateFrom}_${dateTo}.csv`
    a.click()
  }

  const tabs = [
    { id: "global", label: "Vue globale" },
    { id: "detail", label: "Détail trips" },
    { id: "livreur", label: "Par livreur" },
  ] as const

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            Performance Livraison
            <span className="text-muted-foreground font-normal text-base ml-2">/ أداء التوصيل</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Nb clients · Tonnage · Taux retour · A temps / TOT / Retard 30min / Retard 1h+
          </p>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl border border-border p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground">Du</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground">Au</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-semibold text-muted-foreground">Livreur</label>
          <select value={filterLivreur} onChange={e => setFilterLivreur(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Tous les livreurs</option>
            {livreurs.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Global KPIs strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard label="Trips" value={totalTrips}
          accent="bg-slate-50 border-slate-200 text-slate-800" />
        <KpiCard label="Clients" value={totalClients}
          accent="bg-blue-50 border-blue-200 text-blue-800" />
        <KpiCard label="Livrés" value={totalLivres} sub={`${tauxGlobal}%`}
          accent="bg-green-50 border-green-200 text-green-800" />
        <KpiCard label="Retours" value={totalRetours} sub={`${tauxRetourGlobal}%`}
          accent="bg-red-50 border-red-200 text-red-800" />
        <KpiCard label="Tonnage" value={`${totalTonnage.toFixed(1)} kg`}
          accent="bg-cyan-50 border-cyan-200 text-cyan-800" />
        <KpiCard label="A temps" value={totalATtemps}
          accent="bg-emerald-50 border-emerald-200 text-emerald-800" />
        <KpiCard label="Retard 30min" value={totalRetard30}
          accent="bg-amber-50 border-amber-200 text-amber-800" />
        <KpiCard label="Retard 1h+" value={totalRetard1h}
          accent="bg-orange-50 border-orange-200 text-orange-800" />
      </div>

      {/* CA + TOT extra row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="CA Total" value={fmtDH(totalCA)}
          accent="bg-indigo-50 border-indigo-200 text-indigo-800" />
        <KpiCard label="TOT (trop tôt)" value={totalTOT}
          sub="Arrivée > 30min avant demandé"
          accent="bg-purple-50 border-purple-200 text-purple-800" />
        <div className="sm:col-span-2 bg-card rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-foreground">Taux de livraison global</p>
            <span className={`text-lg font-extrabold ${tauxGlobal >= 80 ? "text-green-600" : tauxGlobal >= 60 ? "text-amber-500" : "text-red-500"}`}>
              {tauxGlobal}%
            </span>
          </div>
          <ProgressBar pct={tauxGlobal} color={tauxGlobal >= 80 ? "bg-green-500" : tauxGlobal >= 60 ? "bg-amber-400" : "bg-red-400"} />
          <div className="flex flex-wrap gap-3 mt-2.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Livré ({totalLivres})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> Retour ({totalRetours})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" /> A temps ({totalATtemps})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" /> TOT ({totalTOT})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Retard 30min ({totalRetard30})</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> Retard 1h+ ({totalRetard1h})</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Vue globale — per-livreur cards */}
      {activeTab === "global" && (
        <div className="flex flex-col gap-3">
          {livreurPerfs.length === 0 ? (
            <div className="bg-card rounded-2xl border border-border p-12 text-center text-muted-foreground">
              Aucun trip dans la période sélectionnée
            </div>
          ) : livreurPerfs.map((p, i) => (
            <div key={p.nom} className="bg-card rounded-2xl border border-border p-5">
              {/* Top row */}
              <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shrink-0"
                    style={{ background: ["oklch(0.42 0.15 259)", "oklch(0.40 0.17 152)", "oklch(0.52 0.18 40)", "oklch(0.45 0.2 300)"][i % 4] }}>
                    {p.nom.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-foreground">{p.nom}</p>
                    <p className="text-xs text-muted-foreground">{p.trips} trip{p.trips > 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                    p.tauxLivraison >= 90 ? "bg-green-50 border-green-200 text-green-700" :
                    p.tauxLivraison >= 75 ? "bg-blue-50 border-blue-200 text-blue-700" :
                    p.tauxLivraison >= 60 ? "bg-amber-50 border-amber-200 text-amber-700" :
                    "bg-red-50 border-red-200 text-red-700"}`}>
                    {p.tauxLivraison}% livraison
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                    p.tauxRetour <= 5 ? "bg-green-50 border-green-200 text-green-700" :
                    p.tauxRetour <= 15 ? "bg-amber-50 border-amber-200 text-amber-700" :
                    "bg-red-50 border-red-200 text-red-700"}`}>
                    {p.tauxRetour}% retour
                  </span>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-4">
                {[
                  { label: "Clients", value: p.clients, color: "text-blue-600" },
                  { label: "Livrés", value: p.livres, color: "text-green-600" },
                  { label: "Retours", value: p.retours, color: "text-red-500" },
                  { label: "Tonnage", value: `${p.tonnage.toFixed(1)} kg`, color: "text-cyan-600" },
                  { label: "CA TTC", value: fmtDH(p.caTotal), color: "text-indigo-600" },
                  { label: "Nb livraisons", value: p.livres, color: "text-foreground" },
                ].map(s => (
                  <div key={s.label} className="bg-muted/40 rounded-xl p-3 text-center">
                    <p className={`text-lg font-extrabold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Timing breakdown */}
              <div className="bg-muted/30 rounded-xl p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Timing des livraisons</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { label: "A temps", value: p.aTtemps, bg: "bg-green-100 text-green-800 border-green-200", desc: "±30 min" },
                    { label: "TOT", value: p.tot, bg: "bg-purple-100 text-purple-800 border-purple-200", desc: "> 30min avant" },
                    { label: "Retard 30min", value: p.retard30, bg: "bg-amber-100 text-amber-800 border-amber-200", desc: "30–60 min" },
                    { label: "Retard 1h+", value: p.retard1h, bg: "bg-red-100 text-red-800 border-red-200", desc: "> 60 min" },
                  ].map(t => (
                    <div key={t.label} className={`rounded-lg border px-3 py-2 text-center ${t.bg}`}>
                      <p className="text-xl font-extrabold">{t.value}</p>
                      <p className="text-xs font-semibold">{t.label}</p>
                      <p className="text-[10px] opacity-70">{t.desc}</p>
                    </div>
                  ))}
                </div>
                {p.unknownTiming > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {p.unknownTiming} livraison(s) sans heure enregistrée
                  </p>
                )}
              </div>

              {/* Taux bar */}
              <div className="mt-3">
                <ProgressBar pct={p.tauxLivraison} color={p.tauxLivraison >= 80 ? "bg-green-500" : p.tauxLivraison >= 60 ? "bg-amber-400" : "bg-red-400"} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Détail trips */}
      {activeTab === "detail" && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "oklch(0.14 0.03 260)", color: "oklch(0.88 0.015 245)" }}>
                  {["Date", "Livreur", "Véhicule", "Clients", "Livrés", "Retours", "Taux", "Tonnage (kg)", "CA TTC"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredTrips.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">Aucun trip dans la période</td></tr>
                ) : filteredTrips.map((trip, i) => {
                  const tripBls = bls.filter(bl => bl.tripId === trip.id)
                  const livres = tripBls.filter(bl => bl.statutLivraison === "livre").length
                  const retours = tripBls.filter(bl => bl.statutLivraison === "retour").length
                  const clients = trip.commandeIds.length
                  const taux = clients > 0 ? Math.round((livres / clients) * 100) : 0
                  const tonnage = tripBls.reduce((s, bl) => s + bl.lignes.reduce((ls, l) => ls + l.quantite, 0), 0)
                  const ca = tripBls.reduce((s, bl) => s + (bl.montantTTC ?? bl.montantTotal), 0)
                  return (
                    <tr key={trip.id}
                      style={{ borderTop: "1px solid oklch(0.87 0.012 240)", background: i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)" }}>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{trip.date}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{trip.livreurNom}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{trip.vehicule || "—"}</td>
                      <td className="px-4 py-3 font-semibold text-blue-600">{clients}</td>
                      <td className="px-4 py-3 font-semibold text-green-600">{livres}</td>
                      <td className="px-4 py-3 font-semibold text-red-500">{retours}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className={`h-full rounded-full ${taux >= 80 ? "bg-green-500" : taux >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                              style={{ width: `${taux}%` }} />
                          </div>
                          <span className={`text-xs font-bold ${taux >= 80 ? "text-green-600" : taux >= 60 ? "text-amber-500" : "text-red-500"}`}>{taux}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-blue-600 font-semibold">{tonnage.toFixed(1)}</td>
                      <td className="px-4 py-3 font-bold">{fmtDH(ca)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "oklch(0.14 0.03 260)", color: "oklch(0.88 0.015 245)" }}>
                  <td colSpan={3} className="px-4 py-3 text-xs font-bold uppercase">Total</td>
                  <td className="px-4 py-3 font-bold">{totalClients}</td>
                  <td className="px-4 py-3 font-bold text-green-400">{totalLivres}</td>
                  <td className="px-4 py-3 font-bold text-red-400">{totalRetours}</td>
                  <td className="px-4 py-3 font-bold">{tauxGlobal}%</td>
                  <td className="px-4 py-3 font-bold">{totalTonnage.toFixed(1)}</td>
                  <td className="px-4 py-3 font-bold">{fmtDH(totalCA)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Par livreur — comparison table */}
      {activeTab === "livreur" && (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "oklch(0.14 0.03 260)", color: "oklch(0.88 0.015 245)" }}>
                  {["Livreur", "Trips", "Clients", "Livrés", "Retours", "Taux livr.", "Taux retour", "Tonnage", "A temps", "TOT", "Ret. 30min", "Ret. 1h+", "CA TTC"].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {livreurPerfs.length === 0 ? (
                  <tr><td colSpan={13} className="px-4 py-10 text-center text-muted-foreground">Aucune donnée</td></tr>
                ) : livreurPerfs.map((p, i) => (
                  <tr key={p.nom}
                    style={{ borderTop: "1px solid oklch(0.87 0.012 240)", background: i % 2 === 0 ? "white" : "oklch(0.975 0.003 240)" }}>
                    <td className="px-3 py-3 font-semibold text-foreground whitespace-nowrap">{p.nom}</td>
                    <td className="px-3 py-3 text-center text-muted-foreground">{p.trips}</td>
                    <td className="px-3 py-3 text-center font-semibold text-blue-600">{p.clients}</td>
                    <td className="px-3 py-3 text-center font-semibold text-green-600">{p.livres}</td>
                    <td className="px-3 py-3 text-center font-semibold text-red-500">{p.retours}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        p.tauxLivraison >= 90 ? "bg-green-100 text-green-700" :
                        p.tauxLivraison >= 75 ? "bg-blue-100 text-blue-700" :
                        p.tauxLivraison >= 60 ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"}`}>
                        {p.tauxLivraison}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        p.tauxRetour <= 5 ? "bg-green-100 text-green-700" :
                        p.tauxRetour <= 15 ? "bg-amber-100 text-amber-700" :
                        "bg-red-100 text-red-700"}`}>
                        {p.tauxRetour}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-cyan-600 font-semibold">{p.tonnage.toFixed(1)} kg</td>
                    <td className="px-3 py-3 text-center font-semibold text-emerald-600">{p.aTtemps}</td>
                    <td className="px-3 py-3 text-center font-semibold text-purple-600">{p.tot}</td>
                    <td className="px-3 py-3 text-center font-semibold text-amber-600">{p.retard30}</td>
                    <td className="px-3 py-3 text-center font-semibold text-orange-600">{p.retard1h}</td>
                    <td className="px-3 py-3 font-bold text-indigo-600 whitespace-nowrap">{fmtDH(p.caTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
