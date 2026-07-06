"use client"

import { useState, useMemo, useRef } from "react"
import { store, type Reception, type BonLivraison } from "@/lib/store"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, PieChart, Pie, Legend,
} from "recharts"

// ─── Tabs ─────────────────────────────────────────────────────────────────
type View = "global" | "qte_article" | "article" | "client" | "article_client" | "facturation"

// ─── Custom tooltip ───────────────────────────────────────────────────────
function CTip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl p-3 text-xs shadow-xl" style={{ background: "#0f1623", border: "1px solid #1a2535" }}>
      <p className="font-bold mb-1" style={{ color: "#e2e8f0" }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <span className="font-bold">{typeof p.value === "number" ? p.value.toLocaleString("fr-MA") : p.value}</span></p>
      ))}
    </div>
  )
}

// ─── KPI tile ──────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color = "#60a5fa" }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="flex-1 min-w-0 rounded-2xl px-4 py-3" style={{ background: "#0f1a2e", border: "1px solid #1a2535" }}>
      <p className="text-[11px] font-medium mb-1" style={{ color: "#6b7280" }}>{label}</p>
      <p className="text-xl font-black" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: "#4b5563" }}>{sub}</p>}
    </div>
  )
}

// ─── Tab button ────────────────────────────────────────────────────────────
function TabBtn({ id, label, active, onClick }: { id: View; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
      style={active ? { background: "#1d3a5f", color: "#93c5fd", border: "1px solid #2563eb44" }
                    : { background: "#0f1623", color: "#4b5563", border: "1px solid #1a2535" }}>
      {label}
    </button>
  )
}

export default function AnalyseReceptionPanel() {
  const [view, setView] = useState<View>("global")
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState(store.today())
  const [filterArticle, setFilterArticle] = useState("")
  const [filterClient, setFilterClient] = useState("")
  const contentRef = useRef<HTMLDivElement>(null)

  const changeView = (v: View) => {
    setView(v)
    // scroll back to top of panel so user stays at current position
    contentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  // ─── Raw data ────────────────────────────────────────────────────────────
  const receptions: Reception[] = useMemo(() => {
    return store.getReceptions().filter(r => r.date >= dateFrom && r.date <= dateTo)
  }, [dateFrom, dateTo])

  const bls: BonLivraison[] = useMemo(() => {
    return store.getBonsLivraison().filter(b => b.date >= dateFrom && b.date <= dateTo)
  }, [dateFrom, dateTo])

  // ─── GLOBAL metrics ──────────────────────────────────────────────────────
  const globalMetrics = useMemo(() => {
    const totalCmd   = receptions.reduce((s, r) => s + r.lignes.reduce((ls, l) => ls + l.quantiteCommandee, 0), 0)
    const totalRec   = receptions.reduce((s, r) => s + r.lignes.reduce((ls, l) => ls + l.quantiteRecue, 0), 0)
    const totalMont  = receptions.reduce((s, r) => s + r.lignes.reduce((ls, l) => ls + (l.prixAchat ?? 0) * l.quantiteRecue, 0), 0)
    const totalFact  = bls.reduce((s, b) => s + (b.montantTotal ?? 0), 0)
    const totalQtyFact = bls.reduce((s, b) => s + b.lignes.reduce((ls, l) => ls + l.quantite, 0), 0)
    const taux = totalCmd > 0 ? Math.round((totalRec / totalCmd) * 100) : 0
    return { totalCmd, totalRec, totalMont, totalFact, totalQtyFact, taux, reliquat: totalCmd - totalRec }
  }, [receptions, bls])

  // ─── Daily trend (14 days) ───────────────────────────────────────────────
  const dailyTrend = useMemo(() => {
    const days: Record<string, { date: string; recu: number; facture: number }> = {}
    receptions.forEach(r => {
      if (!days[r.date]) days[r.date] = { date: r.date, recu: 0, facture: 0 }
      days[r.date].recu += r.lignes.reduce((s, l) => s + l.quantiteRecue, 0)
    })
    bls.forEach(b => {
      if (!days[b.date]) days[b.date] = { date: b.date, recu: 0, facture: 0 }
      days[b.date].facture += (b.montantTotal ?? 0)
    })
    return Object.values(days).sort((a, b) => a.date.localeCompare(b.date)).slice(-14)
      .map(d => ({ ...d, date: d.date.slice(5) }))
  }, [receptions, bls])

  // ─── Per article ─────────────────────────────────────────────────────────
  const byArticle = useMemo(() => {
    const map: Record<string, { nom: string; qteCmd: number; qteRec: number; montRec: number; qteFacture: number; montFacture: number }> = {}
    receptions.forEach(r => {
      r.lignes.forEach(l => {
        if (!map[l.articleId ?? l.articleNom]) map[l.articleId ?? l.articleNom] = { nom: l.articleNom, qteCmd: 0, qteRec: 0, montRec: 0, qteFacture: 0, montFacture: 0 }
        map[l.articleId ?? l.articleNom].qteCmd += l.quantiteCommandee
        map[l.articleId ?? l.articleNom].qteRec += l.quantiteRecue
        map[l.articleId ?? l.articleNom].montRec += (l.prixAchat ?? 0) * l.quantiteRecue
      })
    })
    bls.forEach(b => {
      b.lignes.forEach(l => {
        const key = Object.keys(map).find(k => map[k].nom === l.articleNom) ?? l.articleNom
        if (!map[key]) map[key] = { nom: l.articleNom, qteCmd: 0, qteRec: 0, montRec: 0, qteFacture: 0, montFacture: 0 }
        map[key].qteFacture += l.quantite
        map[key].montFacture += l.total
      })
    })
    return Object.values(map).sort((a, b) => b.montFacture - a.montFacture)
  }, [receptions, bls])

  // ─── Per client ──────────────────────────────────────────────────────────
  const byClient = useMemo(() => {
    const map: Record<string, { nom: string; qteFacture: number; montFacture: number; nbBL: number }> = {}
    bls.forEach(b => {
      if (!map[b.clientNom]) map[b.clientNom] = { nom: b.clientNom, qteFacture: 0, montFacture: 0, nbBL: 0 }
      map[b.clientNom].montFacture += (b.montantTotal ?? 0)
      map[b.clientNom].nbBL += 1
      map[b.clientNom].qteFacture += b.lignes.reduce((s, l) => s + l.quantite, 0)
    })
    return Object.values(map).sort((a, b) => b.montFacture - a.montFacture)
  }, [bls])

  // ─── Article x Client cross ───────────────────────────────────────────────
  const crossData = useMemo(() => {
    const rows: Record<string, Record<string, { qte: number; mont: number }>> = {}
    bls.forEach(b => {
      b.lignes.forEach(l => {
        if (!rows[l.articleNom]) rows[l.articleNom] = {}
        if (!rows[l.articleNom][b.clientNom]) rows[l.articleNom][b.clientNom] = { qte: 0, mont: 0 }
        rows[l.articleNom][b.clientNom].qte += l.quantite
        rows[l.articleNom][b.clientNom].mont += l.total
      })
    })
    return rows
  }, [bls])

  const allClients = useMemo(() => Array.from(new Set(bls.map(b => b.clientNom))).sort(), [bls])
  const allArticles = useMemo(() => Object.keys(crossData).sort(), [crossData])

  // ─── Filtered lists ───────────────────────────────────────────────────────
  const filteredByArticle = filterArticle
    ? byArticle.filter(a => a.nom.toLowerCase().includes(filterArticle.toLowerCase()))
    : byArticle

  const filteredByClient = filterClient
    ? byClient.filter(c => c.nom.toLowerCase().includes(filterClient.toLowerCase()))
    : byClient

  const filteredArticles = filterArticle
    ? allArticles.filter(a => a.toLowerCase().includes(filterArticle.toLowerCase()))
    : allArticles

  const filteredClients = filterClient
    ? allClients.filter(c => c.toLowerCase().includes(filterClient.toLowerCase()))
    : allClients

  // ─── Export CSV ───────────────────────────────────────────────────────────
  const exportCSV = () => {
    const rows: string[][] = [["Article","Qte Commande","Qte Recue","Taux Service","Reliquat","Mont Reception","Qte Facture","Mont Facture","Ecart Qte","Ecart Mont"]]
    byArticle.forEach(a => {
      const taux = a.qteCmd > 0 ? ((a.qteRec/a.qteCmd)*100).toFixed(1) : "-"
      rows.push([a.nom, String(a.qteCmd.toFixed(1)), String(a.qteRec.toFixed(1)), `${taux}%`,
        String((a.qteCmd-a.qteRec).toFixed(1)), String(a.montRec.toFixed(2)),
        String(a.qteFacture.toFixed(1)), String(a.montFacture.toFixed(2)),
        String((a.qteRec-a.qteFacture).toFixed(1)), String((a.montRec-a.montFacture).toFixed(2))])
    })
    const csv = rows.map(r => r.join(";")).join("\n")
    const blob = new Blob(["\uFEFF"+csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a2 = document.createElement("a"); a2.href = url; a2.download = `analyse_reception_${store.today()}.csv`
    a2.click(); URL.revokeObjectURL(url)
  }

  // Format a date string dd/mm/yyyy for display
  const fmtDate = (d: string) => d.split("-").reverse().join("/")

  return (
    <div ref={contentRef} className="flex flex-col gap-5 p-5 font-sans" style={{ background: "#080f1a", minHeight: "100vh" }}>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-black" style={{ color: "#f1f5f9" }}>Analyse Reception & Facturation</h2>
          <p className="text-xs mt-0.5" style={{ color: "#6b7280" }}>Reception vs Facturation — quantites, montants, ecarts par article et client</p>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold"
          style={{ background: "#0d1a2e", color: "#60a5fa", border: "1px solid #1d3a5e" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          Export CSV
        </button>
      </div>

      {/* Date filter + active period badge */}
      <div className="flex items-end gap-3 flex-wrap">
        {[
          { label: "Du", val: dateFrom, set: setDateFrom },
          { label: "Au", val: dateTo, set: setDateTo },
        ].map(f => (
          <div key={f.label} className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#6b7280" }}>{f.label}</label>
            <input type="date" value={f.val} onChange={e => f.set(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs font-semibold"
              style={{ background: "#0f1a2e", color: "#e2e8f0", border: "1px solid #1a2535" }} />
          </div>
        ))}
        {/* Active period badge */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold"
          style={{ background: "#0d2040", color: "#93c5fd", border: "1px solid #1d3a5e" }}>
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Periode : {fmtDate(dateFrom)} — {fmtDate(dateTo)}
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-black"
            style={{ background: "#1d3a5e", color: "#60a5fa" }}>
            {receptions.length} receptions
          </span>
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 flex-wrap">
        {([
          { id: "global"        , label: "Global" },
          { id: "qte_article"   , label: "Qte / Article" },
          { id: "article"       , label: "Montants Art." },
          { id: "client"        , label: "Par Client" },
          { id: "article_client", label: "Art × Client" },
          { id: "facturation"   , label: "Facturation" },
        ] as { id: View; label: string }[]).map(t => (
          <TabBtn key={t.id} id={t.id} label={t.label} active={view===t.id} onClick={()=>changeView(t.id)} />
        ))}
      </div>

      {/* ── GLOBAL ─────────────────────────────────────────────────────────── */}
      {view === "global" && (
        <div className="flex flex-col gap-4">
          {/* KPI row */}
          <div className="flex gap-3 flex-wrap">
            <KPI label="Taux Service" value={`${globalMetrics.taux}%`} sub="Recu / Commande" color={globalMetrics.taux>=90?"#10b981":globalMetrics.taux>=70?"#f59e0b":"#ef4444"} />
            <KPI label="Total Recu" value={`${globalMetrics.totalRec.toFixed(0)} kg`} color="#60a5fa" />
            <KPI label="Reliquat" value={`${globalMetrics.reliquat.toFixed(0)} kg`} color={globalMetrics.reliquat>0?"#f59e0b":"#10b981"} />
            <KPI label="Mont Reception" value={`${globalMetrics.totalMont.toFixed(0)} DH`} color="#a78bfa" />
            <KPI label="Mont Facture" value={`${globalMetrics.totalFact.toFixed(0)} DH`} color="#34d399" />
            <KPI label="Ecart Mont" value={`${(globalMetrics.totalMont-globalMetrics.totalFact).toFixed(0)} DH`}
              color={Math.abs(globalMetrics.totalMont-globalMetrics.totalFact)<100?"#10b981":"#f59e0b"}
              sub="Reception − Facturation" />
          </div>

          {/* Trend chart */}
          <div className="rounded-2xl p-4" style={{ background: "#0f1a2e", border: "1px solid #1a2535" }}>
            <p className="text-xs font-bold mb-3" style={{ color: "#e2e8f0" }}>Evolution 14 jours — Qte Recue vs Montant Facture</p>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={dailyTrend}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} />
                <YAxis yAxisId="qty" orientation="left" tick={{ fontSize: 10, fill: "#60a5fa" }} />
                <YAxis yAxisId="mont" orientation="right" tick={{ fontSize: 10, fill: "#34d399" }} />
                <Tooltip content={<CTip />} />
                <Legend />
                <Line yAxisId="qty" type="monotone" dataKey="recu" name="Qte recue (kg)" stroke="#60a5fa" dot={false} strokeWidth={2} />
                <Line yAxisId="mont" type="monotone" dataKey="facture" name="Montant facture (DH)" stroke="#34d399" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Summary table top 10 articles */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1a2535" }}>
            <div className="px-4 py-3" style={{ background: "#0d1a2e", borderBottom: "1px solid #1a2535" }}>
              <p className="text-xs font-bold" style={{ color: "#e2e8f0" }}>Top 10 Articles — Reception vs Facturation</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "#0a1520" }}>
                    {["Article","Qte Rec","Qte Fact","Ecart Qte","Mont Rec","Mont Fact","Ecart Mont","Taux"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: "#6b7280" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byArticle.slice(0,10).map((a, i) => {
                    const ecartQte = a.qteRec - a.qteFacture
                    const ecartMont = a.montRec - a.montFacture
                    const taux = a.qteCmd > 0 ? Math.round((a.qteRec/a.qteCmd)*100) : 0
                    return (
                      <tr key={a.nom} style={{ background: i%2===0?"#0f1a2e":"#0d1520", borderBottom: "1px solid #1a2535" }}>
                        <td className="px-3 py-2 font-semibold" style={{ color: "#e2e8f0" }}>{a.nom}</td>
                        <td className="px-3 py-2" style={{ color: "#60a5fa" }}>{a.qteRec.toFixed(1)}</td>
                        <td className="px-3 py-2" style={{ color: "#34d399" }}>{a.qteFacture.toFixed(1)}</td>
                        <td className="px-3 py-2 font-bold" style={{ color: ecartQte>0?"#f59e0b":ecartQte<0?"#ef4444":"#10b981" }}>{ecartQte>0?"+":""}{ecartQte.toFixed(1)}</td>
                        <td className="px-3 py-2" style={{ color: "#a78bfa" }}>{a.montRec.toFixed(0)} DH</td>
                        <td className="px-3 py-2" style={{ color: "#34d399" }}>{a.montFacture.toFixed(0)} DH</td>
                        <td className="px-3 py-2 font-bold" style={{ color: ecartMont>0?"#f59e0b":ecartMont<0?"#ef4444":"#10b981" }}>{ecartMont>0?"+":""}{ecartMont.toFixed(0)} DH</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: taux>=90?"#052e16":taux>=70?"#1c1007":"#2d0a0a", color: taux>=90?"#10b981":taux>=70?"#f59e0b":"#ef4444" }}>
                            {taux}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── QTE PAR ARTICLE ────────────────────────────────────────────────── */}
      {view === "qte_article" && (
        <div className="flex flex-col gap-4">
          <input value={filterArticle} onChange={e => setFilterArticle(e.target.value)}
            placeholder="Filtrer par article..."
            className="w-full px-4 py-2.5 rounded-xl text-sm"
            style={{ background: "#0d1420", color: "#e2e8f0", border: "1px solid #1e293b" }} />

          {/* Bar chart — Qte Reception vs Qte Facturation */}
          <div className="rounded-2xl p-4" style={{ background: "#0d1420", border: "1px solid #1e293b" }}>
            <p className="text-xs font-bold mb-1" style={{ color: "#e2e8f0" }}>Quantites par Article — Reception vs Facturation (top 15)</p>
            <p className="text-[10px] mb-3" style={{ color: "#6b7280" }}>Unites : kg / pieces selon article</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={filteredByArticle.slice(0,15).map(a=>({
                  nom: a.nom.length > 10 ? a.nom.slice(0,10)+"…" : a.nom,
                  reception: parseFloat(a.qteRec.toFixed(1)),
                  facturation: parseFloat(a.qteFacture.toFixed(1)),
                  reliquat: parseFloat((a.qteCmd - a.qteRec).toFixed(1)),
                }))}
                margin={{ left: 0, right: 0 }}>
                <XAxis dataKey="nom" tick={{ fontSize: 9, fill: "#6b7280" }} />
                <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} />
                <Tooltip content={<CTip />} />
                <Legend />
                <Bar dataKey="reception"   name="Qte Recue"   fill="#3b82f6" radius={[4,4,0,0]} />
                <Bar dataKey="facturation" name="Qte Facturee" fill="#f59e0b" radius={[4,4,0,0]} />
                <Bar dataKey="reliquat"    name="Reliquat"     fill="#ef4444" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Detailed qty table */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1e293b" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ background: "#0a1220", borderBottom: "1px solid #1e293b" }}>
              <p className="text-xs font-bold" style={{ color: "#e2e8f0" }}>Detail Quantites Reception vs Facturation</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: "#1e3a5f", color: "#60a5fa" }}>
                {filteredByArticle.length} articles
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "#080e1a" }}>
                    {[
                      { h: "Article",         w: "min-w-[130px]" },
                      { h: "Qte Commandee",   w: "text-right" },
                      { h: "Qte Recue",       w: "text-right" },
                      { h: "Reliquat",        w: "text-right" },
                      { h: "Taux Reception",  w: "text-right" },
                      { h: "Qte Facturee",    w: "text-right" },
                      { h: "Ecart Rec/Fact",  w: "text-right" },
                      { h: "% Couverture",    w: "text-right" },
                    ].map(col => (
                      <th key={col.h} className={`px-3 py-2.5 font-semibold whitespace-nowrap ${col.w}`} style={{ color: "#64748b" }}>{col.h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredByArticle.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-xs" style={{ color: "#475569" }}>
                        Aucune donnee pour la periode selectionnee
                      </td>
                    </tr>
                  )}
                  {filteredByArticle.map((a, i) => {
                    const reliquat   = a.qteCmd - a.qteRec
                    const tauxRec    = a.qteCmd > 0 ? Math.round((a.qteRec / a.qteCmd) * 100) : 0
                    const ecartRF    = a.qteRec - a.qteFacture
                    const couverture = a.qteRec > 0 ? Math.round((a.qteFacture / a.qteRec) * 100) : 0
                    const rowBg      = i % 2 === 0 ? "#0d1420" : "#0b1018"
                    return (
                      <tr key={a.nom} style={{ background: rowBg, borderBottom: "1px solid #1e293b" }}>
                        {/* Article name */}
                        <td className="px-3 py-2.5 font-semibold" style={{ color: "#f1f5f9" }}>{a.nom}</td>

                        {/* Qte Commandee */}
                        <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#94a3b8" }}>
                          {a.qteCmd.toFixed(1)}
                        </td>

                        {/* Qte Recue */}
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: "#3b82f6" }}>
                          {a.qteRec.toFixed(1)}
                        </td>

                        {/* Reliquat */}
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: reliquat > 0.5 ? "#ef4444" : reliquat > 0 ? "#f59e0b" : "#10b981" }}>
                          {reliquat > 0 ? "−" : ""}{Math.abs(reliquat).toFixed(1)}
                        </td>

                        {/* Taux Reception bar */}
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "#1e293b" }}>
                              <div className="h-full rounded-full transition-all"
                                style={{
                                  width: `${Math.min(tauxRec, 100)}%`,
                                  background: tauxRec >= 90 ? "#10b981" : tauxRec >= 70 ? "#f59e0b" : "#ef4444"
                                }} />
                            </div>
                            <span className="text-[11px] font-bold tabular-nums min-w-[32px]"
                              style={{ color: tauxRec >= 90 ? "#10b981" : tauxRec >= 70 ? "#f59e0b" : "#ef4444" }}>
                              {tauxRec}%
                            </span>
                          </div>
                        </td>

                        {/* Qte Facturee */}
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: "#f59e0b" }}>
                          {a.qteFacture.toFixed(1)}
                        </td>

                        {/* Ecart Rec/Fact */}
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold"
                          style={{ color: Math.abs(ecartRF) < 0.5 ? "#10b981" : ecartRF > 0 ? "#f59e0b" : "#ef4444" }}>
                          {ecartRF > 0 ? "+" : ""}{ecartRF.toFixed(1)}
                        </td>

                        {/* % Couverture (Fact/Rec) */}
                        <td className="px-3 py-2.5 text-right">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{
                              background: couverture >= 90 ? "#052e16" : couverture >= 70 ? "#1c1007" : "#2d0a0a",
                              color:      couverture >= 90 ? "#10b981" : couverture >= 70 ? "#f59e0b" : "#ef4444",
                            }}>
                            {couverture}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer totals */}
            {filteredByArticle.length > 0 && (() => {
              const totCmd  = filteredByArticle.reduce((s, a) => s + a.qteCmd, 0)
              const totRec  = filteredByArticle.reduce((s, a) => s + a.qteRec, 0)
              const totFact = filteredByArticle.reduce((s, a) => s + a.qteFacture, 0)
              const totReliq = totCmd - totRec
              const tauxGlobal = totCmd > 0 ? Math.round((totRec / totCmd) * 100) : 0
              const ecartGlobal = totRec - totFact
              return (
                <div className="flex items-center gap-6 px-4 py-3 flex-wrap" style={{ background: "#0a1220", borderTop: "1px solid #1e293b" }}>
                  <div className="text-[11px]">
                    <span style={{ color: "#64748b" }}>Total Commande </span>
                    <span className="font-bold tabular-nums" style={{ color: "#94a3b8" }}>{totCmd.toFixed(1)}</span>
                  </div>
                  <div className="text-[11px]">
                    <span style={{ color: "#64748b" }}>Total Recu </span>
                    <span className="font-bold tabular-nums" style={{ color: "#3b82f6" }}>{totRec.toFixed(1)}</span>
                  </div>
                  <div className="text-[11px]">
                    <span style={{ color: "#64748b" }}>Reliquat </span>
                    <span className="font-bold tabular-nums" style={{ color: totReliq > 0 ? "#ef4444" : "#10b981" }}>{totReliq.toFixed(1)}</span>
                  </div>
                  <div className="text-[11px]">
                    <span style={{ color: "#64748b" }}>Taux Reception </span>
                    <span className="font-bold tabular-nums" style={{ color: tauxGlobal >= 90 ? "#10b981" : tauxGlobal >= 70 ? "#f59e0b" : "#ef4444" }}>{tauxGlobal}%</span>
                  </div>
                  <div className="text-[11px]">
                    <span style={{ color: "#64748b" }}>Total Facture </span>
                    <span className="font-bold tabular-nums" style={{ color: "#f59e0b" }}>{totFact.toFixed(1)}</span>
                  </div>
                  <div className="text-[11px]">
                    <span style={{ color: "#64748b" }}>Ecart Rec/Fact </span>
                    <span className="font-bold tabular-nums" style={{ color: Math.abs(ecartGlobal) < 1 ? "#10b981" : ecartGlobal > 0 ? "#f59e0b" : "#ef4444" }}>{ecartGlobal > 0 ? "+" : ""}{ecartGlobal.toFixed(1)}</span>
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── PAR ARTICLE ────────────────────────────────────────────────────── */}
      {view === "article" && (
        <div className="flex flex-col gap-4">
          <input value={filterArticle} onChange={e => setFilterArticle(e.target.value)}
            placeholder="Rechercher un article..."
            className="w-full px-4 py-2.5 rounded-xl text-sm"
            style={{ background: "#0f1a2e", color: "#e2e8f0", border: "1px solid #1a2535" }} />

          {/* Bar chart */}
          <div className="rounded-2xl p-4" style={{ background: "#0f1a2e", border: "1px solid #1a2535" }}>
            <p className="text-xs font-bold mb-3" style={{ color: "#e2e8f0" }}>Montant — Reception vs Facturation (top 12)</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={filteredByArticle.slice(0,12).map(a=>({ nom: a.nom.slice(0,12), rec: Math.round(a.montRec), fact: Math.round(a.montFacture) }))} margin={{ left: 0, right: 0 }}>
                <XAxis dataKey="nom" tick={{ fontSize: 9, fill: "#6b7280" }} />
                <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} />
                <Tooltip content={<CTip />} />
                <Legend />
                <Bar dataKey="rec" name="Mont Reception" fill="#a78bfa" radius={[4,4,0,0]} />
                <Bar dataKey="fact" name="Mont Facture" fill="#34d399" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1a2535" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "#0a1520" }}>
                    {["Article","Qte Cmd","Qte Recue","Reliquat","Qte Fact","Ecart Qte","Mont Rec (DH)","Mont Fact (DH)","Ecart Mont","Taux Svc"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: "#6b7280" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredByArticle.map((a, i) => {
                    const reliquat = a.qteCmd - a.qteRec
                    const ecartQte = a.qteRec - a.qteFacture
                    const ecartMont = a.montRec - a.montFacture
                    const taux = a.qteCmd > 0 ? Math.round((a.qteRec/a.qteCmd)*100) : 0
                    return (
                      <tr key={a.nom} style={{ background: i%2===0?"#0f1a2e":"#0d1520", borderBottom: "1px solid #1a2535" }}>
                        <td className="px-3 py-2 font-semibold" style={{ color: "#e2e8f0" }}>{a.nom}</td>
                        <td className="px-3 py-2" style={{ color: "#94a3b8" }}>{a.qteCmd.toFixed(1)}</td>
                        <td className="px-3 py-2" style={{ color: "#60a5fa" }}>{a.qteRec.toFixed(1)}</td>
                        <td className="px-3 py-2" style={{ color: reliquat>0?"#f59e0b":"#10b981" }}>{reliquat.toFixed(1)}</td>
                        <td className="px-3 py-2" style={{ color: "#34d399" }}>{a.qteFacture.toFixed(1)}</td>
                        <td className="px-3 py-2 font-bold" style={{ color: Math.abs(ecartQte)<0.5?"#10b981":ecartQte>0?"#f59e0b":"#ef4444" }}>{ecartQte>0?"+":""}{ecartQte.toFixed(1)}</td>
                        <td className="px-3 py-2" style={{ color: "#a78bfa" }}>{a.montRec.toFixed(0)}</td>
                        <td className="px-3 py-2" style={{ color: "#34d399" }}>{a.montFacture.toFixed(0)}</td>
                        <td className="px-3 py-2 font-bold" style={{ color: Math.abs(ecartMont)<10?"#10b981":ecartMont>0?"#f59e0b":"#ef4444" }}>{ecartMont>0?"+":""}{ecartMont.toFixed(0)}</td>
                        <td className="px-3 py-2">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ background: taux>=90?"#052e16":taux>=70?"#1c1007":"#2d0a0a", color: taux>=90?"#10b981":taux>=70?"#f59e0b":"#ef4444" }}>
                            {taux}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── PAR CLIENT ──────────────────────────────────────────────────────── */}
      {view === "client" && (
        <div className="flex flex-col gap-4">
          <input value={filterClient} onChange={e => setFilterClient(e.target.value)}
            placeholder="Rechercher un client..."
            className="w-full px-4 py-2.5 rounded-xl text-sm"
            style={{ background: "#0f1a2e", color: "#e2e8f0", border: "1px solid #1a2535" }} />

          <div className="rounded-2xl p-4" style={{ background: "#0f1a2e", border: "1px solid #1a2535" }}>
            <p className="text-xs font-bold mb-3" style={{ color: "#e2e8f0" }}>Montant Facture par Client (top 12)</p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={filteredByClient.slice(0,12).map(c=>({ nom: c.nom.slice(0,10), mont: Math.round(c.montFacture) }))} margin={{ left:0,right:0 }}>
                <XAxis dataKey="nom" tick={{ fontSize: 9, fill: "#6b7280" }} />
                <YAxis tick={{ fontSize: 9, fill: "#6b7280" }} />
                <Tooltip content={<CTip />} />
                <Bar dataKey="mont" name="Montant DH" radius={[4,4,0,0]}>
                  {filteredByClient.slice(0,12).map((_,i) => <Cell key={i} fill={["#60a5fa","#34d399","#a78bfa","#f59e0b","#f87171","#38bdf8"][i%6]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1a2535" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "#0a1520" }}>
                    {["Client","Nb BL","Qte Facturee","Montant Facture","Panier Moyen"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: "#6b7280" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredByClient.map((c, i) => (
                    <tr key={c.nom} style={{ background: i%2===0?"#0f1a2e":"#0d1520", borderBottom: "1px solid #1a2535" }}>
                      <td className="px-3 py-2 font-semibold" style={{ color: "#e2e8f0" }}>{c.nom}</td>
                      <td className="px-3 py-2" style={{ color: "#94a3b8" }}>{c.nbBL}</td>
                      <td className="px-3 py-2" style={{ color: "#60a5fa" }}>{c.qteFacture.toFixed(1)}</td>
                      <td className="px-3 py-2 font-bold" style={{ color: "#34d399" }}>{c.montFacture.toFixed(0)} DH</td>
                      <td className="px-3 py-2" style={{ color: "#a78bfa" }}>{c.nbBL>0?(c.montFacture/c.nbBL).toFixed(0):"-"} DH</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── ARTICLE × CLIENT ──────────────────────────────────────────────── */}
      {view === "article_client" && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <input value={filterArticle} onChange={e => setFilterArticle(e.target.value)} placeholder="Filtrer article..."
              className="flex-1 px-3 py-2 rounded-xl text-sm"
              style={{ background: "#0f1a2e", color: "#e2e8f0", border: "1px solid #1a2535" }} />
            <input value={filterClient} onChange={e => setFilterClient(e.target.value)} placeholder="Filtrer client..."
              className="flex-1 px-3 py-2 rounded-xl text-sm"
              style={{ background: "#0f1a2e", color: "#e2e8f0", border: "1px solid #1a2535" }} />
          </div>
          <div className="rounded-2xl overflow-auto max-h-[65vh]" style={{ border: "1px solid #1a2535" }}>
            <table className="text-xs">
              <thead className="sticky top-0" style={{ background: "#0a1520", zIndex: 2 }}>
                <tr>
                  <th className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: "#6b7280" }}>Article</th>
                  {filteredClients.map(c => (
                    <th key={c} className="px-2 py-2 text-center font-semibold whitespace-nowrap" style={{ color: "#6b7280" }}>{c.slice(0,10)}</th>
                  ))}
                  <th className="px-3 py-2 text-right font-bold whitespace-nowrap" style={{ color: "#60a5fa" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredArticles.map((art, i) => {
                  const rowTotal = filteredClients.reduce((s, c) => s + (crossData[art]?.[c]?.mont ?? 0), 0)
                  return (
                    <tr key={art} style={{ background: i%2===0?"#0f1a2e":"#0d1520", borderBottom: "1px solid #1a2535" }}>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap" style={{ color: "#e2e8f0" }}>{art}</td>
                      {filteredClients.map(c => {
                        const cell = crossData[art]?.[c]
                        return (
                          <td key={c} className="px-2 py-2 text-center whitespace-nowrap" style={{ color: cell ? "#34d399" : "#1f2937" }}>
                            {cell ? (
                              <div className="flex flex-col">
                                <span className="font-bold">{cell.qte.toFixed(1)}</span>
                                <span className="text-[10px]">{cell.mont.toFixed(0)} DH</span>
                              </div>
                            ) : "—"}
                          </td>
                        )
                      })}
                      <td className="px-3 py-2 text-right font-black whitespace-nowrap" style={{ color: "#60a5fa" }}>{rowTotal.toFixed(0)} DH</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#0a1520", borderTop: "1px solid #1a2535" }}>
                  <td className="px-3 py-2 font-black" style={{ color: "#60a5fa" }}>TOTAL</td>
                  {filteredClients.map(c => {
                    const colTotal = filteredArticles.reduce((s, a) => s + (crossData[a]?.[c]?.mont ?? 0), 0)
                    return (
                      <td key={c} className="px-2 py-2 text-center font-black whitespace-nowrap" style={{ color: "#34d399" }}>
                        {colTotal > 0 ? colTotal.toFixed(0) : "—"}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-right font-black" style={{ color: "#f1f5f9" }}>
                    {filteredArticles.reduce((s, a) => s + filteredClients.reduce((s2, c) => s2 + (crossData[a]?.[c]?.mont ?? 0), 0), 0).toFixed(0)} DH
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── FACTURATION ─────────────────────────────────────────────────────── */}
      {view === "facturation" && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 flex-wrap">
            <KPI label="Nb BL emis" value={bls.length} color="#60a5fa" />
            <KPI label="CA Total" value={`${globalMetrics.totalFact.toFixed(0)} DH`} color="#34d399" />
            <KPI label="Qte Facturee" value={`${globalMetrics.totalQtyFact.toFixed(0)} kg`} color="#a78bfa" />
            <KPI label="Panier Moyen" value={bls.length>0?`${(globalMetrics.totalFact/bls.length).toFixed(0)} DH`:"—"} color="#f59e0b" />
          </div>

          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1a2535" }}>
            <div className="px-4 py-3" style={{ background: "#0d1a2e", borderBottom: "1px solid #1a2535" }}>
              <p className="text-xs font-bold" style={{ color: "#e2e8f0" }}>Detail Bons de Livraison</p>
            </div>
            <div className="overflow-x-auto max-h-[55vh]">
              <table className="w-full text-xs">
                <thead className="sticky top-0" style={{ background: "#0a1520" }}>
                  <tr>
                    {["Date","Client","Secteur","Livreur","Nb art.","Montant HT","Statut"].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap" style={{ color: "#6b7280" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bls.sort((a,b)=>b.date.localeCompare(a.date)).map((bl, i) => (
                    <tr key={bl.id} style={{ background: i%2===0?"#0f1a2e":"#0d1520", borderBottom: "1px solid #1a2535" }}>
                      <td className="px-3 py-2 font-mono" style={{ color: "#94a3b8" }}>{bl.date}</td>
                      <td className="px-3 py-2 font-semibold" style={{ color: "#e2e8f0" }}>{bl.clientNom}</td>
                      <td className="px-3 py-2" style={{ color: "#6b7280" }}>{bl.secteur}</td>
                      <td className="px-3 py-2" style={{ color: "#6b7280" }}>{bl.livreurNom}</td>
                      <td className="px-3 py-2 text-center" style={{ color: "#60a5fa" }}>{bl.lignes.length}</td>
                      <td className="px-3 py-2 font-bold" style={{ color: "#34d399" }}>{(bl.montantTotal ?? 0).toFixed(0)} DH</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{
                            background: bl.statut==="encaissé"?"#052e16":bl.statut==="retour_partiel"?"#2d0a0a":"#0c1a2e",
                            color: bl.statut==="encaissé"?"#10b981":bl.statut==="retour_partiel"?"#ef4444":"#60a5fa"
                          }}>
                          {bl.statut}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
