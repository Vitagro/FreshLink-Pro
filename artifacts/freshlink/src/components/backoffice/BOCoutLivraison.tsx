"use client"

// ════════════════════════════════════════════════════════════════════════════
//  BOCoutLivraison — Coût de livraison & manutention (logistique)
//  À partir des relevés de trajet (fl_trip_charges) :
//   • Coût par SECTEUR / jour (avec choix date + période)
//   • Coût par LIVREUR
//   • Reporting : coût LIVRAISON + coût MANUTENTION + SOMME, + coût moyen / client
//  NB : les relevés de trajet sont par secteur+livreur (nbClients) ; le coût par
//  client est donc une moyenne (total ÷ nb clients livrés).
// ════════════════════════════════════════════════════════════════════════════

import { useState, useMemo } from "react"
import { store } from "@/lib/store"

function todayISO() { return new Date().toISOString().slice(0, 10) }
function daysAgoISO(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10) }
const fmt = (n: number) => (Number(n) || 0).toLocaleString("fr-MA", { maximumFractionDigits: 0 })

export default function BOCoutLivraison() {
  const [from, setFrom] = useState(daysAgoISO(7))
  const [to, setTo]     = useState(todayISO())

  const report = useMemo(() => {
    const charges = store.getTripCharges().filter(t => {
      const d = String(t.date ?? "").slice(0, 10)
      return d >= from && d <= to
    })
    const splitCharge = (c: { type: string; montant: number }) =>
      c.type === "manutention" ? { liv: 0, man: Number(c.montant) || 0 } : { liv: Number(c.montant) || 0, man: 0 }

    let totLiv = 0, totMan = 0, totTrajets = 0, totClients = 0
    const bySecteur = new Map<string, { liv: number; man: number; clients: number; trajets: number }>()
    const byLivreur = new Map<string, { liv: number; man: number; clients: number; trajets: number }>()
    const byJour    = new Map<string, { liv: number; man: number }>()

    for (const t of charges) {
      let liv = 0, man = 0
      for (const c of (t.charges ?? [])) { const s = splitCharge(c); liv += s.liv; man += s.man }
      totLiv += liv; totMan += man; totTrajets += 1; totClients += Number(t.nbClients) || 0
      const sec = t.secteur || "—", liv2 = t.livreur || "—", jour = String(t.date ?? "").slice(0, 10)
      const accS = bySecteur.get(sec) ?? { liv: 0, man: 0, clients: 0, trajets: 0 }
      accS.liv += liv; accS.man += man; accS.clients += Number(t.nbClients) || 0; accS.trajets += 1; bySecteur.set(sec, accS)
      const accL = byLivreur.get(liv2) ?? { liv: 0, man: 0, clients: 0, trajets: 0 }
      accL.liv += liv; accL.man += man; accL.clients += Number(t.nbClients) || 0; accL.trajets += 1; byLivreur.set(liv2, accL)
      const accJ = byJour.get(jour) ?? { liv: 0, man: 0 }
      accJ.liv += liv; accJ.man += man; byJour.set(jour, accJ)
    }
    const toArr = (m: Map<string, { liv: number; man: number; clients: number; trajets: number }>) =>
      [...m.entries()].map(([k, v]) => ({ k, ...v, total: v.liv + v.man, coutClient: v.clients > 0 ? (v.liv + v.man) / v.clients : 0 }))
        .sort((a, b) => b.total - a.total)
    return {
      totLiv, totMan, total: totLiv + totMan, totTrajets, totClients,
      coutClientMoyen: totClients > 0 ? (totLiv + totMan) / totClients : 0,
      secteurs: toArr(bySecteur), livreurs: toArr(byLivreur),
      jours: [...byJour.entries()].map(([k, v]) => ({ k, ...v, total: v.liv + v.man })).sort((a, b) => a.k.localeCompare(b.k)),
    }
  }, [from, to])

  const preset = (n: number) => { setFrom(daysAgoISO(n)); setTo(todayISO()) }

  return (
    <div className="flex flex-col gap-4 p-4 bg-slate-50 min-h-screen">
      <div>
        <h2 className="text-xl font-black text-slate-900">Coût de livraison & manutention</h2>
        <p className="text-sm text-slate-500">Par secteur, par jour et par livreur — à partir des relevés de trajet.</p>
      </div>

      {/* Filtres date / période */}
      <div className="flex flex-wrap items-end gap-3 bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Du</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Au</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-sm" />
        </div>
        <div className="flex gap-2">
          {[["Aujourd'hui", 0], ["7 jours", 7], ["30 jours", 30]].map(([l, n]) => (
            <button key={l as string} onClick={() => preset(n as number)} className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200">{l}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: "Coût livraison", v: `${fmt(report.totLiv)} DH`, c: "text-blue-600" },
          { l: "Coût manutention", v: `${fmt(report.totMan)} DH`, c: "text-amber-600" },
          { l: "SOMME", v: `${fmt(report.total)} DH`, c: "text-emerald-600" },
          { l: "Coût moyen / client", v: `${fmt(report.coutClientMoyen)} DH`, c: "text-violet-600" },
        ].map(k => (
          <div key={k.l} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{k.l}</p>
            <p className={`text-2xl font-black mt-1 ${k.c}`}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* Par secteur */}
      <Card title={`Coût par secteur (${report.totTrajets} trajet(s), ${report.totClients} client(s))`}>
        <Table rows={report.secteurs} label="Secteur" empty="Aucun relevé de trajet sur la période." />
      </Card>

      {/* Par livreur */}
      <Card title="Coût par livreur">
        <Table rows={report.livreurs} label="Livreur" empty="Aucun relevé." />
      </Card>

      {/* Par jour */}
      <Card title="Coût par jour">
        {report.jours.length === 0 ? <p className="text-xs text-slate-400 p-2">—</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[11px] uppercase text-slate-400 border-b border-slate-100">
              <th className="py-1.5">Jour</th><th className="py-1.5 text-right">Livraison</th><th className="py-1.5 text-right">Manutention</th><th className="py-1.5 text-right">Total</th>
            </tr></thead>
            <tbody>
              {report.jours.map(j => (
                <tr key={j.k} className="border-b border-slate-50">
                  <td className="py-1.5 font-semibold text-slate-700">{j.k}</td>
                  <td className="py-1.5 text-right text-blue-600">{fmt(j.liv)}</td>
                  <td className="py-1.5 text-right text-amber-600">{fmt(j.man)}</td>
                  <td className="py-1.5 text-right font-bold text-slate-800">{fmt(j.total)} DH</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="text-[11px] text-slate-400">
        ℹ️ Les relevés de trajet sont par secteur + livreur ; le « coût par client » est une moyenne (total ÷ clients livrés).
        Pour un coût par client nommé / par prévendeur exact, il faudra relier chaque BL à son client (à venir).
      </p>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <p className="text-sm font-black text-slate-800 mb-2">{title}</p>
      {children}
    </div>
  )
}

function Table({ rows, label, empty }: {
  rows: { k: string; liv: number; man: number; clients: number; trajets: number; total: number; coutClient: number }[]
  label: string; empty: string
}) {
  if (rows.length === 0) return <p className="text-xs text-slate-400 p-2">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase text-slate-400 border-b border-slate-100">
          <th className="py-1.5">{label}</th><th className="py-1.5 text-center">Trajets</th><th className="py-1.5 text-center">Clients</th>
          <th className="py-1.5 text-right">Livraison</th><th className="py-1.5 text-right">Manutention</th><th className="py-1.5 text-right">Total</th><th className="py-1.5 text-right">Coût/client</th>
        </tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.k} className="border-b border-slate-50">
              <td className="py-1.5 font-semibold text-slate-700">{r.k}</td>
              <td className="py-1.5 text-center text-slate-500">{r.trajets}</td>
              <td className="py-1.5 text-center text-slate-500">{r.clients}</td>
              <td className="py-1.5 text-right text-blue-600">{fmt(r.liv)}</td>
              <td className="py-1.5 text-right text-amber-600">{fmt(r.man)}</td>
              <td className="py-1.5 text-right font-bold text-slate-800">{fmt(r.total)} DH</td>
              <td className="py-1.5 text-right text-violet-600">{fmt(r.coutClient)} DH</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
