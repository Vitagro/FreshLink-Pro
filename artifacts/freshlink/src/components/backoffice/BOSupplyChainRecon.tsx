"use client"

import { useState, useEffect, useMemo } from "react"
import {
  store,
  type User,
  type ReconciliationLigne,
  type RelanceFournisseur,
  computeSupplyChainRecon,
} from "@/lib/store"

interface Props { user: User }

const STATUT_LABELS: Record<ReconciliationLigne["statut"], string> = {
  ok: "Conforme",
  manquant: "Manquant",
  surplus: "Surplus",
}
const STATUT_COLORS: Record<ReconciliationLigne["statut"], string> = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  manquant: "bg-red-50 text-red-700 border-red-200",
  surplus: "bg-amber-50 text-amber-700 border-amber-200",
}
const SOURCE_LABELS: Record<ReconciliationLigne["source"], string> = {
  bon_achat: "Marché (Bon Achat)",
  purchase_order: "Purchase Order",
  manuel: "Saisie manuelle",
}

function fmt(n: number) {
  return (Number(n) || 0).toLocaleString("fr-MA", { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export default function BOSupplyChainRecon({ user }: Props) {
  const [rows, setRows] = useState<ReconciliationLigne[]>([])
  const [relances, setRelances] = useState<RelanceFournisseur[]>([])
  const [loading, setLoading] = useState(true)
  const [statutFilter, setStatutFilter] = useState<"tous" | ReconciliationLigne["statut"]>("tous")
  const [search, setSearch] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [relanceTarget, setRelanceTarget] = useState<ReconciliationLigne | null>(null)
  const [relanceNotes, setRelanceNotes] = useState("")

  const load = () => {
    setLoading(true)
    setRows(computeSupplyChainRecon(store.getReceptions(), store.getPurchaseOrders(), store.getBonsAchat()))
    setRelances(store.getRelancesFournisseur())
    setLoading(false)
  }
  useEffect(load, [])

  const filtered = useMemo(() => rows.filter(r => {
    if (statutFilter !== "tous" && r.statut !== statutFilter) return false
    if (from && r.date < from) return false
    if (to && r.date > to) return false
    if (search) {
      const q = search.toLowerCase()
      if (!r.articleNom.toLowerCase().includes(q) && !(r.fournisseurNom ?? "").toLowerCase().includes(q)) return false
    }
    return true
  }), [rows, statutFilter, from, to, search])

  const kpis = useMemo(() => {
    const totalManquant = rows.reduce((s, r) => s + r.manquant, 0)
    const nbManquants = rows.filter(r => r.statut === "manquant").length
    const nbSurplus = rows.filter(r => r.statut === "surplus").length
    const nbOk = rows.filter(r => r.statut === "ok").length
    const tauxConformite = rows.length > 0 ? (nbOk / rows.length) * 100 : 100
    const relancesEnAttente = relances.filter(r => r.statut !== "resolu").length
    return { totalManquant, nbManquants, nbSurplus, nbOk, tauxConformite, relancesEnAttente }
  }, [rows, relances])

  const relanceExistante = (r: ReconciliationLigne) =>
    relances.find(x => x.receptionId === r.receptionId && x.articleId === r.articleId && x.statut !== "resolu")

  const declarerRelance = () => {
    if (!relanceTarget) return
    store.addRelanceFournisseur({
      id: store.genId(),
      receptionId: relanceTarget.receptionId,
      articleId: relanceTarget.articleId,
      articleNom: relanceTarget.articleNom,
      fournisseurNom: relanceTarget.fournisseurNom,
      quantiteManquante: relanceTarget.manquant,
      date: store.today(),
      statut: "en_attente",
      notes: relanceNotes || undefined,
      createdBy: user.id,
    })
    setRelanceTarget(null); setRelanceNotes("")
    load()
  }

  const avancerStatutRelance = (r: RelanceFournisseur) => {
    const next: RelanceFournisseur["statut"] = r.statut === "en_attente" ? "relance_envoyee" : "resolu"
    store.updateRelanceFournisseur(r.id, { statut: next })
    load()
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Rapprochement Supply Chain</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Contrôle des écarts entre quantité commandée, quantité achetée et quantité réceptionnée — par article et par réception.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Taux de conformité", val: `${kpis.tauxConformite.toFixed(1)}%`, color: kpis.tauxConformite >= 90 ? "text-emerald-600" : "text-amber-600" },
          { label: "Lignes conformes", val: kpis.nbOk, color: "text-emerald-600" },
          { label: "Lignes manquantes", val: kpis.nbManquants, color: "text-red-600" },
          { label: "Lignes en surplus", val: kpis.nbSurplus, color: "text-amber-600" },
          { label: "Relances en attente", val: kpis.relancesEnAttente, color: "text-blue-600" },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{k.label}</p>
            <p className={`text-xl font-black mt-1 ${k.color}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {kpis.totalManquant > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-red-800 text-sm">
          <span className="text-lg leading-none">⚠️</span>
          <span><strong>{fmt(kpis.totalManquant)} unité(s)</strong> au total non encore reçues sur l&apos;ensemble des réceptions (reliquats/manquants cumulés).</span>
        </div>
      )}

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 flex-wrap">
        <select value={statutFilter} onChange={e => setStatutFilter(e.target.value as typeof statutFilter)}
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
          <option value="tous">Tous les statuts</option>
          <option value="manquant">Manquants uniquement</option>
          <option value="surplus">Surplus uniquement</option>
          <option value="ok">Conformes uniquement</option>
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs" />
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Article ou fournisseur..."
          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs flex-1 min-w-[160px]" />
        <button onClick={load} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border border-emerald-200">
          🔄 Rafraîchir
        </button>
        <span className="ml-auto text-xs text-slate-400">{loading ? "Chargement…" : `${filtered.length} ligne(s)`}</span>
      </div>

      {/* Tableau de rapprochement */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100 bg-slate-50">
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Article</th>
                <th className="py-2 px-3">Fournisseur</th>
                <th className="py-2 px-3">Origine</th>
                <th className="py-2 px-3 text-right">Commandée</th>
                <th className="py-2 px-3 text-right">Achetée</th>
                <th className="py-2 px-3 text-right">Reçue</th>
                <th className="py-2 px-3 text-right">Manquant</th>
                <th className="py-2 px-3">Statut</th>
                <th className="py-2 px-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="py-8 text-center text-slate-400">Aucune ligne de réception sur cette sélection.</td></tr>
              )}
              {filtered.map((r, i) => {
                const relance = relanceExistante(r)
                return (
                  <tr key={`${r.receptionId}_${r.articleId}_${i}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-2 px-3 whitespace-nowrap">{r.date}</td>
                    <td className="py-2 px-3 font-semibold text-slate-700">{r.articleNom}</td>
                    <td className="py-2 px-3">{r.fournisseurNom ?? "—"}</td>
                    <td className="py-2 px-3 text-slate-400">{SOURCE_LABELS[r.source]}</td>
                    <td className="py-2 px-3 text-right">{fmt(r.quantiteCommandee)}</td>
                    <td className="py-2 px-3 text-right">{fmt(r.quantiteAchetee)}</td>
                    <td className="py-2 px-3 text-right font-semibold">{fmt(r.quantiteRecue)}</td>
                    <td className={`py-2 px-3 text-right font-bold ${r.manquant > 0 ? "text-red-600" : "text-slate-300"}`}>{r.manquant > 0 ? fmt(r.manquant) : "—"}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUT_COLORS[r.statut]}`}>{STATUT_LABELS[r.statut]}</span>
                    </td>
                    <td className="py-2 px-3">
                      {r.manquant > 0.01 ? (
                        relance ? (
                          <button onClick={() => avancerStatutRelance(relance)}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">
                            {relance.statut === "en_attente" ? "Marquer relancé" : "Marquer résolu"}
                          </button>
                        ) : (
                          <button onClick={() => setRelanceTarget(r)}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold bg-red-50 text-red-700 border border-red-200 hover:bg-red-100">
                            Relancer fournisseur
                          </button>
                        )
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Journal des relances */}
      {relances.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <p className="text-sm font-bold text-slate-800">Journal des relances fournisseurs ({relances.length})</p>
          </div>
          <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {relances.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800">{r.articleNom}</span>
                  <span className="text-slate-400 ml-2">{r.fournisseurNom ?? "—"} · {fmt(r.quantiteManquante)} manquant(s) · {r.date}</span>
                  {r.notes && <span className="text-slate-400 ml-2 italic">« {r.notes} »</span>}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 ${
                  r.statut === "resolu" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  r.statut === "relance_envoyee" ? "bg-blue-50 text-blue-700 border-blue-200" :
                  "bg-amber-50 text-amber-700 border-amber-200"}`}>
                  {r.statut === "resolu" ? "Résolu" : r.statut === "relance_envoyee" ? "Relance envoyée" : "En attente"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal relance */}
      {relanceTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setRelanceTarget(null)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900 mb-1">Relancer le fournisseur</h3>
            <p className="text-xs text-slate-500 mb-4">
              {relanceTarget.articleNom} — {fmt(relanceTarget.manquant)} unité(s) manquante(s) chez {relanceTarget.fournisseurNom ?? "fournisseur inconnu"}.
            </p>
            <textarea value={relanceNotes} onChange={e => setRelanceNotes(e.target.value)}
              placeholder="Notes (canal de relance, contact, délai promis...)"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-4" rows={3} />
            <div className="flex gap-2">
              <button onClick={declarerRelance} className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
                Déclarer la relance
              </button>
              <button onClick={() => setRelanceTarget(null)} className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
