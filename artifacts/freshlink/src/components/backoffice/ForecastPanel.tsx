"use client"
import { useState, useEffect, useMemo } from "react"
import { store, type Article, type Commande } from "@/lib/store"

interface ForecastLine {
  articleId: string
  articleNom: string
  unite: string
  stock: number
  shelfLifeJours: number
  avgSale7j: number
  avgSale30j: number
  trend: number          // +/- % trend vs 7d average
  besoinBrut: number     // avg7j for tomorrow
  stockNet: number       // stock - besoinBrut
  qteACommander: number  // max(0, besoinBrut - stock)
  prixAchat: number
  montantCommande: number
}

export default function ForecastPanel() {
  const [articles, setArticles]     = useState<Article[]>([])
  const [commandes, setCommandes]   = useState<Commande[]>([])
  const [generated, setGenerated]   = useState(false)
  const [autoHour]                  = useState("08:00")
  const [lastRun, setLastRun]       = useState<string | null>(null)
  const [forecasts, setForecasts]   = useState<ForecastLine[]>([])
  const [filter, setFilter]         = useState<"all"|"order"|"ok">("order")

  useEffect(() => {
    setArticles(store.getArticles())
    setCommandes(store.getCommandes())
    const lr = localStorage.getItem("fl_forecast_lastrun")
    if (lr) setLastRun(lr)
  }, [])

  const compute = useMemo(() => () => {
    const today     = new Date()
    const d7ago     = new Date(today); d7ago.setDate(d7ago.getDate()-7)
    const d30ago    = new Date(today); d30ago.setDate(d30ago.getDate()-30)

    const salesMap: Record<string, { dates: string[]; qtys: number[] }> = {}

    commandes.forEach(cmd => {
      cmd.lignes.forEach(l => {
        if (!l.articleId) return
        if (!salesMap[l.articleId]) salesMap[l.articleId] = { dates: [], qtys: [] }
        salesMap[l.articleId].dates.push(cmd.date)
        salesMap[l.articleId].qtys.push(Number(l.quantite) || 0)
      })
    })

    return articles
      .filter(a => a.stockDisponible !== undefined)
      .map(art => {
        const data = salesMap[art.id] ?? { dates: [], qtys: [] }

        const pairs = data.dates.map((d,i) => ({ d, q: data.qtys[i] }))
        const last7  = pairs.filter(p => new Date(p.d) >= d7ago)
        const last30 = pairs.filter(p => new Date(p.d) >= d30ago)

        const sum7   = last7.reduce((s,p)=>s+p.q,0)
        const sum30  = last30.reduce((s,p)=>s+p.q,0)
        const avg7   = last7.length  > 0 ? sum7  / 7  : 0
        const avg30  = last30.length > 0 ? sum30 / 30 : 0

        // Trend: compare last 3d avg vs prev 4d avg
        const last3  = pairs.filter(p => { const dd = new Date(p.d); return dd >= new Date(today.getTime()-3*86400000) })
        const prev4  = pairs.filter(p => { const dd = new Date(p.d); return dd >= new Date(today.getTime()-7*86400000) && dd < new Date(today.getTime()-3*86400000) })
        const a3 = last3.reduce((s,p)=>s+p.q,0) / 3
        const a4 = prev4.reduce((s,p)=>s+p.q,0) / 4
        const trend  = a4 > 0 ? ((a3-a4)/a4)*100 : 0

        // Besoin brut: weighted avg (70% last 7d, 30% last 30d), adjusted for trend
        const weighted = avg7 * 0.7 + avg30 * 0.3
        const trendFactor = 1 + Math.max(-0.3, Math.min(0.5, trend/100))
        const besoinBrut = Math.ceil(weighted * trendFactor * 10) / 10

        const stock          = art.stockDisponible ?? 0
        const stockNet       = stock - besoinBrut
        const qteACommander  = Math.max(0, Math.ceil((besoinBrut - stock) * 10) / 10)

        return {
          articleId: art.id,
          articleNom: art.nom,
          unite: art.unite,
          stock,
          shelfLifeJours: art.shelfLifeJours ?? 99,
          avgSale7j: Math.round(avg7 * 10) / 10,
          avgSale30j: Math.round(avg30 * 10) / 10,
          trend: Math.round(trend),
          besoinBrut,
          stockNet,
          qteACommander,
          prixAchat: art.prixAchat,
          montantCommande: Math.round(qteACommander * art.prixAchat * 100) / 100,
        } as ForecastLine
      })
      .filter(f => f.avgSale7j > 0 || f.avgSale30j > 0 || f.stock > 0)
      .sort((a,b) => b.qteACommander - a.qteACommander)
  }, [articles, commandes])

  function generateForecast() {
    const result = compute()
    setForecasts(result)
    setGenerated(true)
    const ts = new Date().toLocaleString("fr-FR")
    setLastRun(ts)
    localStorage.setItem("fl_forecast_lastrun", ts)
  }

  function triggerAchat() {
    // Create a bon d'achat from the forecast lines that need ordering
    const toOrder = forecasts.filter(f => f.qteACommander > 0)
    if (toOrder.length === 0) return
    // Build and save a bon d'achat
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1)
    const tomorrowStr = tomorrow.toISOString().slice(0,10)
    const bon = {
      id: store.genId(),
      date: store.today(),
      acheteurId: "",
      acheteurNom: "FORECAST AUTO",
      fournisseurId: "forecast",
      fournisseurNom: "FORECAST AUTO",
      emailDestinataire: "",
      statut: "brouillon" as const,
      lignes: toOrder.map(f => ({
        articleId: f.articleId,
        articleNom: f.articleNom,
        quantite: f.qteACommander,
        prixAchat: f.prixAchat,
      })),
    }
    store.addBonAchat(bon)
    alert(`Bon d'achat cree (${toOrder.length} articles) pour livraison le ${tomorrowStr} a 08h00.`)
  }

  const displayed = useMemo(() => {
    if (filter === "order") return forecasts.filter(f => f.qteACommander > 0)
    if (filter === "ok")    return forecasts.filter(f => f.qteACommander === 0)
    return forecasts
  }, [forecasts, filter])

  const totalMontant = useMemo(() => forecasts.reduce((s,f)=>s+f.montantCommande,0), [forecasts])
  const nbToOrder    = useMemo(() => forecasts.filter(f=>f.qteACommander>0).length, [forecasts])

  return (
    <div className="flex flex-col gap-5 p-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-black text-foreground">Forecast & Achat Auto</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Prevision J+1 · Declenchement achat a {autoHour}</p>
          {lastRun && <p className="text-[11px] text-muted-foreground mt-0.5">Derniere generation : {lastRun}</p>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={generateForecast}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{ background: "oklch(0.38 0.18 260)" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Generer le forecast
          </button>
          {generated && nbToOrder > 0 && (
            <button onClick={triggerAchat}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: "oklch(0.65 0.17 145)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Declencher achat ({nbToOrder} articles)
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      {generated && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4">
            <p className="text-2xl font-black text-foreground">{forecasts.length}</p>
            <p className="text-xs text-muted-foreground font-semibold">Articles analyses</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
            <p className="text-2xl font-black text-orange-700">{nbToOrder}</p>
            <p className="text-xs text-orange-700 font-semibold">A commander</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
            <p className="text-2xl font-black text-green-700">{forecasts.length - nbToOrder}</p>
            <p className="text-xs text-green-700 font-semibold">Stock suffisant</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <p className="text-xl font-black text-blue-700">{totalMontant.toFixed(0)} MAD</p>
            <p className="text-xs text-blue-700 font-semibold">Montant total achat</p>
          </div>
        </div>
      )}

      {/* Info box — methodology */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-start gap-3">
        <svg className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-xs text-blue-800">
          <strong>Methode :</strong> Prevision = moyenne ponderee (70% moy. 7j + 30% moy. 30j) ajustee par la tendance recente.
          Stock restant deduit. Bon d&apos;achat genere automatiquement pour les articles en deficit.
          Livraison ciblee le lendemain a 08h00.
        </p>
      </div>

      {!generated ? (
        <div className="text-center py-20 flex flex-col items-center gap-4">
          <svg className="w-16 h-16 text-muted-foreground/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-muted-foreground text-sm">Cliquez &quot;Generer le forecast&quot; pour calculer les besoins de demain.</p>
        </div>
      ) : (
        <>
          {/* Filter */}
          <div className="flex items-center gap-2">
            {(["all","order","ok"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                  filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
                }`}>
                {f === "all" ? "Tous" : f === "order" ? `A commander (${nbToOrder})` : "Stock OK"}
              </button>
            ))}
          </div>

          {/* Lines */}
          <div className="flex flex-col gap-2">
            {displayed.map(f => (
              <div key={f.articleId} className={`bg-card border rounded-2xl p-4 flex items-center gap-4 ${
                f.qteACommander > 0 ? "border-orange-200" : "border-border"
              }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p className="font-bold text-sm text-foreground">{f.articleNom}</p>
                    {f.trend !== 0 && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        f.trend > 0 ? "bg-green-100 text-green-700 border border-green-300" :
                                      "bg-red-100 text-red-700 border border-red-300"
                      }`}>
                        {f.trend > 0 ? "+" : ""}{f.trend}% tendance
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Stock : <strong className={f.qteACommander>0?"text-orange-600":"text-green-600"}>{f.stock} {f.unite}</strong></span>
                    <span>Moy 7j : <strong className="text-foreground">{f.avgSale7j} {f.unite}/j</strong></span>
                    <span>Moy 30j : <strong className="text-foreground">{f.avgSale30j} {f.unite}/j</strong></span>
                    <span>Besoin J+1 : <strong className="text-foreground">{f.besoinBrut} {f.unite}</strong></span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {f.qteACommander > 0 ? (
                    <>
                      <p className="font-black text-orange-600">{f.qteACommander} {f.unite}</p>
                      <p className="text-[11px] text-muted-foreground">{f.montantCommande.toFixed(2)} MAD</p>
                    </>
                  ) : (
                    <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      OK
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
