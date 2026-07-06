"use client"
import { useState, useEffect, useMemo } from "react"
import { store, type Article } from "@/lib/store"
import ArticleCombobox from "@/components/ui/ArticleCombobox"

interface Lot {
  id: string
  articleId: string
  articleNom: string
  qte: number
  unite: string
  dateEntree: string
  shelfLifeJours: number
  fournisseur?: string
  prix?: number
}

const KEY = "fl_lots_dlc"

function getLots(): Lot[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") } catch { return [] }
}
function saveLots(lots: Lot[]) {
  localStorage.setItem(KEY, JSON.stringify(lots))
}

function jourRestants(dateEntree: string, shelfLifeJours: number): number {
  const entree = new Date(dateEntree)
  const expiry = new Date(entree.getTime() + shelfLifeJours * 86400000)
  return Math.ceil((expiry.getTime() - Date.now()) / 86400000)
}

function prixSolde(prixAchat: number, joursRestants: number, shelfLifeJours: number): number {
  // Degressif: si < 30% shelf life restant → -30%, si < 15% → -50%
  const ratio = joursRestants / shelfLifeJours
  if (ratio <= 0) return Math.round(prixAchat * 0.3 * 100) / 100
  if (ratio < 0.15) return Math.round(prixAchat * 0.5 * 100) / 100
  if (ratio < 0.3) return Math.round(prixAchat * 0.7 * 100) / 100
  return prixAchat
}

function statusBadge(jours: number) {
  if (jours <= 0)  return { label: "Expire",   color: "bg-red-100 text-red-700 border-red-300" }
  if (jours <= 2)  return { label: "Critique", color: "bg-red-100 text-red-700 border-red-300" }
  if (jours <= 5)  return { label: "Alerte",   color: "bg-orange-100 text-orange-700 border-orange-300" }
  if (jours <= 10) return { label: "Surveiller", color: "bg-amber-100 text-amber-700 border-amber-300" }
  return           { label: "OK",             color: "bg-green-100 text-green-700 border-green-300" }
}

export default function ShelfLifePanel() {
  const [lots, setLots]     = useState<Lot[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [showAdd, setShowAdd]   = useState(false)
  const [filter, setFilter]     = useState<"all"|"alerte"|"critique"|"expire">("all")
  const [form, setForm]         = useState({
    articleId: "", qte: "", dateEntree: store.today(), fournisseur: ""
  })

  useEffect(() => {
    setLots(getLots())
    setArticles(store.getArticles())
  }, [])

  const enriched = useMemo(() => lots.map(lot => {
    const jours = jourRestants(lot.dateEntree, lot.shelfLifeJours)
    const art   = articles.find(a => a.id === lot.articleId)
    return { ...lot, joursRestants: jours, status: statusBadge(jours), prixSolde: art ? prixSolde(art.prixAchat * 1.3, jours, lot.shelfLifeJours) : null }
  }), [lots, articles])

  const filtered = useMemo(() => {
    if (filter === "all")      return enriched
    if (filter === "critique") return enriched.filter(l => l.joursRestants <= 2)
    if (filter === "alerte")   return enriched.filter(l => l.joursRestants > 2 && l.joursRestants <= 5)
    return enriched.filter(l => l.joursRestants <= 0)
  }, [enriched, filter])

  const stats = useMemo(() => ({
    total:    enriched.length,
    ok:       enriched.filter(l => l.joursRestants > 10).length,
    surveiller: enriched.filter(l => l.joursRestants > 5 && l.joursRestants <= 10).length,
    alerte:   enriched.filter(l => l.joursRestants > 2 && l.joursRestants <= 5).length,
    critique: enriched.filter(l => l.joursRestants <= 2 && l.joursRestants > 0).length,
    expire:   enriched.filter(l => l.joursRestants <= 0).length,
  }), [enriched])

  function addLot() {
    if (!form.articleId || !form.qte) return
    const art = articles.find(a => a.id === form.articleId)
    if (!art) return
    const newLot: Lot = {
      id: store.genId(),
      articleId: form.articleId,
      articleNom: art.nom,
      qte: parseFloat(form.qte),
      unite: art.unite,
      dateEntree: form.dateEntree,
      shelfLifeJours: art.shelfLifeJours ?? 7,
      fournisseur: form.fournisseur || undefined,
      prix: art.prixAchat,
    }
    const updated = [...lots, newLot]
    setLots(updated)
    saveLots(updated)
    setShowAdd(false)
    setForm({ articleId: "", qte: "", dateEntree: store.today(), fournisseur: "" })
  }

  function removeLot(id: string) {
    const updated = lots.filter(l => l.id !== id)
    setLots(updated)
    saveLots(updated)
  }

  const Tab = ({ id, label, count, color }: { id: typeof filter; label: string; count: number; color: string }) => (
    <button onClick={() => setFilter(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
        filter === id ? `${color} border-current` : "bg-card text-muted-foreground border-border"
      }`}>
      {label}
      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${filter === id ? "bg-white/60" : "bg-muted"}`}>{count}</span>
    </button>
  )

  return (
    <div className="flex flex-col gap-5 p-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-foreground">Shelf Life & DLC</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Suivi par lot — fruits et legumes</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white"
          style={{ background: "oklch(0.65 0.17 145)" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nouveau lot
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "OK",          val: stats.ok,          bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200" },
          { label: "Surveiller",  val: stats.surveiller,  bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200" },
          { label: "Alerte",      val: stats.alerte,      bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
          { label: "Critique",    val: stats.critique,    bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200" },
          { label: "Expire",      val: stats.expire,      bg: "bg-red-100",   text: "text-red-900",    border: "border-red-300" },
        ].map(k => (
          <div key={k.label} className={`${k.bg} border ${k.border} rounded-2xl p-4 text-center`}>
            <p className={`text-2xl font-black ${k.text}`}>{k.val}</p>
            <p className={`text-xs font-semibold ${k.text}`}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Alerts banner */}
      {(stats.critique > 0 || stats.expire > 0) && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-300">
          <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-sm font-bold text-red-800">
              {stats.expire > 0 && `${stats.expire} lot(s) expire(s). `}
              {stats.critique > 0 && `${stats.critique} lot(s) en etat critique (≤2 jours).`}
            </p>
            <p className="text-xs text-red-700 mt-0.5">Action immediate requise : ecoulement ou mise en degrade.</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Tab id="all"      label="Tous"      count={stats.total}    color="bg-blue-100 text-blue-700" />
        <Tab id="alerte"   label="Alerte"    count={stats.alerte}   color="bg-orange-100 text-orange-700" />
        <Tab id="critique" label="Critique"  count={stats.critique} color="bg-red-100 text-red-700" />
        <Tab id="expire"   label="Expires"   count={stats.expire}   color="bg-red-200 text-red-900" />
      </div>

      {/* Lots table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Aucun lot dans cette categorie.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.sort((a,b) => a.joursRestants - b.joursRestants).map(lot => (
            <div key={lot.id} className="bg-card border border-border rounded-2xl p-4 flex items-start gap-4">
              {/* Progress arc */}
              <div className="shrink-0 flex flex-col items-center gap-1">
                <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center font-black text-lg ${
                  lot.joursRestants <= 0  ? "border-red-500 text-red-700" :
                  lot.joursRestants <= 2  ? "border-red-400 text-red-600" :
                  lot.joursRestants <= 5  ? "border-orange-400 text-orange-600" :
                  lot.joursRestants <= 10 ? "border-amber-400 text-amber-600" :
                  "border-green-400 text-green-600"
                }`}>
                  {lot.joursRestants <= 0 ? "!" : lot.joursRestants}
                </div>
                <span className="text-[10px] text-muted-foreground font-semibold">
                  {lot.joursRestants <= 0 ? "Expire" : `j. rest.`}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <p className="font-bold text-sm text-foreground">{lot.articleNom}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${lot.status.color}`}>
                    {lot.status.label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Qte : <strong className="text-foreground">{lot.qte} {lot.unite}</strong></span>
                  <span>Entree : <strong className="text-foreground">{lot.dateEntree}</strong></span>
                  <span>Duree vie : <strong className="text-foreground">{lot.shelfLifeJours} j</strong></span>
                  <span>Expiry : <strong className="text-foreground">
                    {new Date(new Date(lot.dateEntree).getTime() + lot.shelfLifeJours*86400000).toISOString().slice(0,10)}
                  </strong></span>
                  {lot.fournisseur && <span>Fourn. : <strong className="text-foreground">{lot.fournisseur}</strong></span>}
                </div>
                {/* Prix solde suggestion */}
                {lot.joursRestants <= 10 && lot.joursRestants > 0 && lot.prixSolde && (
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-300">
                    <svg className="w-3.5 h-3.5 text-amber-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    <span className="text-xs font-bold text-amber-800">
                      Prix solde suggere : {lot.prixSolde.toFixed(2)} MAD/{lot.unite}
                      {lot.joursRestants <= 2 ? " (urgence)" : lot.joursRestants <= 5 ? " (promo)" : " (reduit)"}
                    </span>
                  </div>
                )}
                {lot.joursRestants <= 0 && (
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-50 border border-red-300">
                    <span className="text-xs font-bold text-red-800">Produit expire — retirer du stock immediatement</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 shrink-0">
                <button onClick={() => removeLot(lot.id)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-red-200 text-red-600 hover:bg-red-50">
                  Retirer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add lot modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ background: "oklch(0.13 0.02 260)", border: "1px solid oklch(0.22 0.04 260)" }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid oklch(0.22 0.04 260)" }}>
              <p className="font-bold text-sm" style={{ color: "#f1f5f9" }}>Ajouter un lot</p>
              <button onClick={() => setShowAdd(false)}>
                <svg className="w-4 h-4" style={{ color: "#6b7280" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              {/* Article */}
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: "#94a3b8" }}>Article</label>
                <ArticleCombobox
                  articles={articles.filter(a => a.shelfLifeJours)}
                  value={form.articleId}
                  onChange={(artId, _art) => setForm(f => ({ ...f, articleId: artId }))}
                  placeholder="Choisir un article"
                />
              </div>
              {/* Qte */}
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: "#94a3b8" }}>Quantite</label>
                <input type="number" value={form.qte} onChange={e => setForm(f => ({ ...f, qte: e.target.value }))}
                  placeholder="ex: 150"
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                  style={{ background: "oklch(0.18 0.03 260)", color: "#f1f5f9", border: "1px solid oklch(0.28 0.05 260)" }} />
              </div>
              {/* Date entree */}
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: "#94a3b8" }}>Date d&apos;entree en stock</label>
                <input type="date" value={form.dateEntree} onChange={e => setForm(f => ({ ...f, dateEntree: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                  style={{ background: "oklch(0.18 0.03 260)", color: "#f1f5f9", border: "1px solid oklch(0.28 0.05 260)" }} />
              </div>
              {/* Fournisseur */}
              <div>
                <label className="text-xs font-semibold mb-1.5 block" style={{ color: "#94a3b8" }}>Fournisseur (optionnel)</label>
                <input type="text" value={form.fournisseur} onChange={e => setForm(f => ({ ...f, fournisseur: e.target.value }))}
                  placeholder="Nom du fournisseur"
                  className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                  style={{ background: "oklch(0.18 0.03 260)", color: "#f1f5f9", border: "1px solid oklch(0.28 0.05 260)" }} />
              </div>
              {/* DLC preview */}
              {form.articleId && form.dateEntree && (() => {
                const art = articles.find(a => a.id === form.articleId)
                if (!art?.shelfLifeJours) return null
                const jours = jourRestants(form.dateEntree, art.shelfLifeJours)
                const badge = statusBadge(jours)
                const expiry = new Date(new Date(form.dateEntree).getTime() + art.shelfLifeJours * 86400000)
                return (
                  <div className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${badge.color}`}>
                    <span className="text-xs font-bold">
                      Expiry : {expiry.toISOString().slice(0,10)} — {jours > 0 ? `${jours} jours restants` : "Deja expire !"}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ml-auto ${badge.color}`}>{badge.label}</span>
                  </div>
                )
              })()}
              <button onClick={addLot}
                disabled={!form.articleId || !form.qte}
                className="w-full py-3 rounded-xl font-bold text-white disabled:opacity-50"
                style={{ background: "oklch(0.65 0.17 145)" }}>
                Enregistrer le lot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
