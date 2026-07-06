"use client"

import { useState, useEffect } from "react"
import { store, type Retour } from "@/lib/store"

export default function BORetour() {
  const [retours, setRetours] = useState<Retour[]>([])
  const [filter, setFilter] = useState({ date: store.today() })

  useEffect(() => { setRetours(store.getRetours()) }, [])

  const filtered = retours.filter(r => !filter.date || r.date === filter.date)

  const handleValider = (id: string) => {
    const retours_ = store.getRetours()
    const r = retours_.find(r => r.id === id)
    if (!r) return
    r.statut = "validé"
    r.validePar = "magasinier"
    r.dateValidation = store.today()
    // Restore stock — SKIP lines with motifQualite = true (quality issue: product not put back)
    r.lignes.forEach(l => {
      if (!l.motifQualite) {
        store.updateStock(l.articleId, l.quantite)
      }
    })
    store.saveRetours(retours_)
    setRetours(store.getRetours())
  }

  const totalRetour = filtered.reduce((s, r) =>
    s + r.lignes.reduce((ls, l) => {
      const art = store.getArticles().find(a => a.id === l.articleId)
      const pv = art ? (art.pvMethode === "pourcentage" ? art.prixAchat * (1 + art.pvValeur / 100) : art.pvMethode === "montant" ? art.prixAchat + art.pvValeur : art.pvValeur) : 0
      return ls + l.quantite * pv
    }, 0), 0)

  return (
    <div className="flex flex-col gap-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <p className="text-2xl font-bold text-red-600 font-sans">{filtered.length}</p>
          <p className="text-sm text-muted-foreground font-sans">Retours</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <p className="text-xl font-bold text-orange-600 font-sans">{filtered.filter(r => r.statut === "en_attente").length}</p>
          <p className="text-sm text-muted-foreground font-sans">En attente</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 text-center">
          <p className="text-xl font-bold text-foreground font-sans">{totalRetour.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH</p>
          <p className="text-sm text-muted-foreground font-sans">Valeur retours</p>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-3">
        <label className="text-sm text-muted-foreground font-sans">Date:</label>
        <input
          type="date"
          value={filter.date}
          onChange={e => setFilter({ date: e.target.value })}
          className="px-3 py-2 rounded-lg border border-border bg-background text-sm font-sans focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button onClick={() => setFilter({ date: "" })} className="text-sm text-primary font-sans hover:underline">Tout afficher</button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm font-sans">
          <thead className="bg-muted">
            <tr>
              {["Date", "Livreur", "Client", "Articles", "Valeur", "Motif", "Statut", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-3 text-muted-foreground font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Aucun retour</td></tr>
            ) : filtered.map(r => {
              const valeur = r.lignes.reduce((s, l) => {
                const art = store.getArticles().find(a => a.id === l.articleId)
                const pv = art ? (art.pvMethode === "pourcentage" ? art.prixAchat * (1 + art.pvValeur / 100) : art.pvMethode === "montant" ? art.prixAchat + art.pvValeur : art.pvValeur) : 0
                return s + l.quantite * pv
              }, 0)
              return (
                <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-3">{r.date}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{r.livreurNom}</td>
                  <td className="px-4 py-3">{r.lignes[0]?.clientNom}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">
                    {r.lignes.map(l => `${l.articleNom} x${l.quantite}`).join(", ")}
                  </td>
                  <td className="px-4 py-3 font-semibold text-red-600">{valeur.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.lignes[0]?.motif}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.statut === "validé" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>
                      {r.statut}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.statut === "en_attente" && (
                      <button onClick={() => handleValider(r.id)} className="px-3 py-1 bg-green-600 text-white rounded-lg text-xs font-medium hover:opacity-90">
                        Valider retour
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
