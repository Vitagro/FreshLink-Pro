"use client"

import { useState, useMemo } from "react"
import { store, type AnalyseAchat, type CmdVsFacturation } from "@/lib/store"
import { TrendingDown, TrendingUp, AlertTriangle, BarChart3 } from "lucide-react"

// Compute AnalyseAchat dynamically from real bons + receptions filtered by date range
function computeAnalyseAchat(dateFrom: string, dateTo: string): AnalyseAchat[] {
  const bons = store.getBonsAchat().filter(b => b.date >= dateFrom && b.date <= dateTo)
  const receptions = store.getReceptions().filter(r => r.date >= dateFrom && r.date <= dateTo)

  // Aggregate by article name
  const map = new Map<string, AnalyseAchat>()

  for (const bon of bons) {
    for (const ligne of bon.lignes) {
      const key = ligne.articleNom
      const existing = map.get(key) ?? { article: key, qteAchat: 0, valeurAchat: 0, qteReception: 0, valeurReception: 0, valeurRetenue: 0, montantDonne: 0, montantRendu: 0, ecart: 0 }
      existing.qteAchat += ligne.quantite
      existing.valeurAchat += ligne.quantite * ligne.prixAchat
      existing.montantDonne += ligne.quantite * ligne.prixAchat
      map.set(key, existing)
    }
  }

  for (const rec of receptions) {
    for (const ligne of rec.lignes) {
      const key = ligne.articleNom
      const existing = map.get(key) ?? { article: key, qteAchat: 0, valeurAchat: 0, qteReception: 0, valeurReception: 0, valeurRetenue: 0, montantDonne: 0, montantRendu: 0, ecart: 0 }
      const prixFact = (ligne as { prixFacture?: number }).prixFacture ?? (ligne as { prixAchat?: number }).prixAchat ?? 0
      existing.qteReception += ligne.quantiteRecue
      existing.valeurReception += ligne.quantiteRecue * prixFact
      existing.montantRendu += ligne.quantiteRecue * prixFact
      map.set(key, existing)
    }
  }

  // Compute valeurRetenue and ecart
  return Array.from(map.values()).map(a => {
    const valeurRetenue = Math.min(a.valeurAchat, a.valeurReception)
    const ecart = a.montantRendu + valeurRetenue - a.montantDonne
    return { ...a, valeurRetenue, ecart }
  })
}

function computeCmdVsFacturation(dateFrom: string, dateTo: string): CmdVsFacturation[] {
  const commandes = store.getCommandes().filter(c => c.date >= dateFrom && c.date <= dateTo)
  const bls = store.getBonsLivraison().filter(b => b.date >= dateFrom && b.date <= dateTo)

  const rows: CmdVsFacturation[] = []
  for (const cmd of commandes) {
    for (const ligne of cmd.lignes) {
      const matchingBLs = bls.filter(b => b.commandeId === cmd.id)
      const qteFact = matchingBLs.reduce((s, b) => s + (b.lignes.find(l => l.articleNom === ligne.articleNom)?.quantite ?? 0), 0)
      const prixFact = matchingBLs.reduce((s, b) => {
        const l = b.lignes.find(l => l.articleNom === ligne.articleNom)
        return s + (l ? l.total : 0)
      }, 0)
      rows.push({
        article: ligne.articleNom,
        client: cmd.clientNom,
        qteCmdee: ligne.quantite,
        prixCmd: ligne.quantite * ligne.prixVente,
        qteFact,
        prixFact,
        ecartQte: Math.max(0, ligne.quantite - qteFact),
        ecartValeur: Math.max(0, ligne.quantite * ligne.prixVente - prixFact),
      })
    }
  }
  return rows
}

function AnalyseRow({ a }: { a: AnalyseAchat }) {
  const isNegEcart = a.ecart < 0
  return (
    <tr style={{ borderBottom: "1px solid #1a253520" }}>
      <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>{a.article}</td>
      <td className="px-4 py-3 text-center">
        <span className="font-mono text-xs" style={{ color: "#94a3b8" }}>{a.qteAchat} kg</span>
        <br />
        <span className="text-xs" style={{ color: "#60a5fa" }}>{a.valeurAchat.toLocaleString()} DH</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="font-mono text-xs" style={{ color: "#94a3b8" }}>{a.qteReception} kg</span>
        <br />
        <span className="text-xs" style={{ color: "#a78bfa" }}>{a.valeurReception.toLocaleString()} DH</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#0d2e18", color: "#6ee7b7", border: "1px solid #15352a" }}>
          {a.valeurRetenue.toLocaleString()} DH
        </span>
        <p className="text-[10px] mt-0.5" style={{ color: "#374151" }}>min(achat,récep.)</p>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs font-bold" style={{ color: "#f59e0b" }}>{a.montantDonne.toLocaleString()} DH</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs font-bold" style={{ color: "#06b6d4" }}>{a.montantRendu.toLocaleString()} DH</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{
          background: isNegEcart ? "#1c0a0a" : "#0d2e18",
          color: isNegEcart ? "#fca5a5" : "#6ee7b7",
          border: `1px solid ${isNegEcart ? "#3b1515" : "#15352a"}`,
        }}>
          {isNegEcart ? "" : "+"}{a.ecart.toLocaleString()} DH
        </span>
      </td>
    </tr>
  )
}

function CmdFactRow({ r }: { r: CmdVsFacturation }) {
  return (
    <tr style={{ borderBottom: "1px solid #1a253520" }}>
      <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>{r.article}</td>
      <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{r.client}</td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs" style={{ color: "#60a5fa" }}>{r.qteCmdee} kg</span>
        <br />
        <span className="text-xs" style={{ color: "#4b5563" }}>{r.prixCmd.toLocaleString()} DH</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs" style={{ color: "#a78bfa" }}>{r.qteFact} kg</span>
        <br />
        <span className="text-xs" style={{ color: "#4b5563" }}>{r.prixFact.toLocaleString()} DH</span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs font-bold" style={{ color: r.ecartQte !== 0 ? "#ef4444" : "#10b981" }}>
          {r.ecartQte !== 0 ? `−${r.ecartQte} kg` : "="}
        </span>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{
          background: r.ecartValeur !== 0 ? "#1c0a0a" : "#0d2e18",
          color: r.ecartValeur !== 0 ? "#fca5a5" : "#6ee7b7",
          border: `1px solid ${r.ecartValeur !== 0 ? "#3b1515" : "#15352a"}`,
        }}>
          {r.ecartValeur !== 0 ? `−${r.ecartValeur.toLocaleString()} DH` : "0"}
        </span>
      </td>
    </tr>
  )
}

export default function AnalyseAchatPanel() {
  const today = new Date().toISOString().split("T")[0]
  const firstOfMonth = today.slice(0, 8) + "01"
  const [tab, setTab] = useState<"achat" | "cmd">("achat")
  const [dateFrom, setDateFrom] = useState(firstOfMonth)
  const [dateTo, setDateTo]   = useState(today)

  // Compute dynamically from real data filtered by date range
  const analyseData = useMemo(() => computeAnalyseAchat(dateFrom, dateTo), [dateFrom, dateTo])
  const cmdData     = useMemo(() => computeCmdVsFacturation(dateFrom, dateTo), [dateFrom, dateTo])

  const totalDonne   = analyseData.reduce((s, a) => s + a.montantDonne, 0)
  const totalRetenu  = analyseData.reduce((s, a) => s + a.valeurRetenue, 0)
  const totalRendu   = analyseData.reduce((s, a) => s + a.montantRendu, 0)
  const totalEcart   = analyseData.reduce((s, a) => s + a.ecart, 0)
  const totalEcartFact = cmdData.reduce((s, r) => s + r.ecartValeur, 0)

  const DH = (n: number) => n.toLocaleString("fr-MA", { maximumFractionDigits: 0 }) + " DH"

  return (
    <div className="h-full flex flex-col gap-4 p-4" style={{ background: "#080c14" }}>

      {/* Header + Date pickers */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold" style={{ color: "#e2e8f0" }}>
            Analyse Achat &nbsp;<span style={{ color: "#4b5563", fontWeight: 400 }}>/ تحليل المشتريات</span>
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#4b5563" }}>Comparaison achats vs réceptions et commandes vs facturation</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold" style={{ color: "#4b5563" }}>Du</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ background: "#0f1623", border: "1px solid #1d3a5e", color: "#e2e8f0" }} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] font-semibold" style={{ color: "#4b5563" }}>Au</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ background: "#0f1623", border: "1px solid #1d3a5e", color: "#e2e8f0" }} />
          </div>
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px]">&nbsp;</label>
            <div className="flex gap-1">
              {[
                { l: "Auj.", from: today, to: today },
                { l: "Sem.", from: (() => { const d = new Date(today); d.setDate(d.getDate() - 6); return d.toISOString().split("T")[0] })(), to: today },
                { l: "Mois", from: firstOfMonth, to: today },
              ].map(q => (
                <button key={q.l} onClick={() => { setDateFrom(q.from); setDateTo(q.to) }}
                  className="px-2 py-1.5 rounded-lg text-[10px] font-bold transition-colors"
                  style={dateFrom === q.from && dateTo === q.to
                    ? { background: "#1d4ed8", color: "#fff", border: "1px solid #2563eb" }
                    : { background: "#0f1623", color: "#4b5563", border: "1px solid #1a2535" }}>
                  {q.l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { l: "Montant Donné", v: DH(totalDonne), c: "#f59e0b", icon: TrendingUp },
          { l: "Valeur Retenue", v: DH(totalRetenu), c: "#6366f1", icon: BarChart3 },
          { l: "Montant Rendu", v: DH(totalRendu), c: "#06b6d4", icon: TrendingDown },
          { l: "Ecart Global", v: `${totalEcart >= 0 ? "+" : ""}${DH(totalEcart)}`, c: totalEcart >= 0 ? "#10b981" : "#ef4444", icon: AlertTriangle },
        ].map(({ l, v, c, icon: Icon }) => (
          <div key={l} className="rounded-xl p-3.5" style={{ background: "#0f1623", border: `1px solid ${c}22` }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs" style={{ color: "#4b5563" }}>{l}</p>
              <Icon className="w-4 h-4" style={{ color: c }} />
            </div>
            <p className="text-base font-bold" style={{ color: c }}>{v}</p>
          </div>
        ))}
      </div>

      {/* Formula box */}
      <div className="px-4 py-3 rounded-xl text-xs" style={{ background: "#0a0f18", border: "1px solid #1d3a5e" }}>
        <p className="font-semibold mb-1" style={{ color: "#60a5fa" }}>Formules de calcul</p>
        <div className="grid grid-cols-2 gap-2" style={{ color: "#64748b" }}>
          <p><span style={{ color: "#6ee7b7" }}>Valeur retenue</span> = min(Valeur Achat, Valeur Réception)</p>
          <p><span style={{ color: "#fde68a" }}>Ecart</span> = Montant Rendu + Valeur Retenue − Montant Donné</p>
        </div>
      </div>

      {/* Sub tabs */}
      <div className="flex gap-2">
        {[
          { key: "achat", label: "Achat vs Réception" },
          { key: "cmd",   label: "Commandes vs Facturation" },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as "achat" | "cmd")}
            className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={{
              background: tab === t.key ? "#1d4ed8" : "#0f1623",
              color: tab === t.key ? "white" : "#4b5563",
              border: `1px solid ${tab === t.key ? "#2563eb" : "#1a2535"}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tables */}
      <div className="flex-1 overflow-y-auto rounded-xl overflow-hidden" style={{ border: "1px solid #1a2535" }}>
        {tab === "achat" ? (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "#0a0f18", borderBottom: "1px solid #1a2535" }}>
                {["Article", "Achat (Qté / Val.)", "Réception (Qté / Val.)", "Val. Retenue", "Montant Donné", "Montant Rendu", "Ecart"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium text-center first:text-left" style={{ color: "#4b5563" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody style={{ background: "#0f1623" }}>
              {analyseData.map((a, i) => <AnalyseRow key={i} a={a} />)}
            </tbody>
            <tfoot>
              <tr style={{ background: "#0a0f18", borderTop: "1px solid #1a2535" }}>
                <td className="px-4 py-2.5 font-bold text-xs" style={{ color: "#f1f5f9" }}>TOTAL</td>
                <td className="px-4 py-2.5 text-center"><span className="text-xs font-bold" style={{ color: "#60a5fa" }}>{analyseData.reduce((s, a) => s + a.valeurAchat, 0).toLocaleString()} DH</span></td>
                <td className="px-4 py-2.5 text-center"><span className="text-xs font-bold" style={{ color: "#a78bfa" }}>{analyseData.reduce((s, a) => s + a.valeurReception, 0).toLocaleString()} DH</span></td>
                <td className="px-4 py-2.5 text-center"><span className="text-xs font-bold" style={{ color: "#6ee7b7" }}>{totalRetenu.toLocaleString()} DH</span></td>
                <td className="px-4 py-2.5 text-center"><span className="text-xs font-bold" style={{ color: "#f59e0b" }}>{totalDonne.toLocaleString()} DH</span></td>
                <td className="px-4 py-2.5 text-center"><span className="text-xs font-bold" style={{ color: "#06b6d4" }}>{totalRendu.toLocaleString()} DH</span></td>
                <td className="px-4 py-2.5 text-center"><span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: totalEcart >= 0 ? "#0d2e18" : "#1c0a0a", color: totalEcart >= 0 ? "#6ee7b7" : "#fca5a5" }}>{totalEcart >= 0 ? "+" : ""}{totalEcart.toLocaleString()} DH</span></td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "#0a0f18", borderBottom: "1px solid #1a2535" }}>
                {["Article", "Client", "Commande (Qté / Prix)", "Facturé (Qté / Prix)", "Ecart Qté", "Ecart Valeur"].map(h => (
                  <th key={h} className="px-4 py-2.5 font-medium text-center first:text-left" style={{ color: "#4b5563" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody style={{ background: "#0f1623" }}>
              {cmdData.map((r, i) => <CmdFactRow key={i} r={r} />)}
            </tbody>
            <tfoot>
              <tr style={{ background: "#0a0f18", borderTop: "1px solid #1a2535" }}>
                <td colSpan={5} className="px-4 py-2.5 font-bold text-xs" style={{ color: "#f1f5f9" }}>TOTAL ECART FACTURATION</td>
                <td className="px-4 py-2.5 text-center">
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: totalEcartFact !== 0 ? "#1c0a0a" : "#0d2e18", color: totalEcartFact !== 0 ? "#fca5a5" : "#6ee7b7" }}>
                    {totalEcartFact !== 0 ? `−${totalEcartFact.toLocaleString()} DH` : "0 DH"}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
