"use client"

import { useState, useEffect, useMemo } from "react"
import { store, type User, type Article, type Salarie, type FiscalConfig, DEFAULT_FISCAL_CONFIG } from "@/lib/store"

interface Props { user: User }

interface CmdLigne { articleId?: string; quantite?: number; prixVente?: number; prixUnitaire?: number; total?: number }
interface CmdRow { id: string; payload: { date?: string; lignes?: CmdLigne[]; clientNom?: string } }
interface BLRow { id: string; payload: { date?: string; montantTTC?: number; montantTotal?: number } }
interface InvoicePayload { numero?: string; date?: string; clientNom?: string; montantHT?: number; tva?: number; montantTTC?: number; modeReglement?: string; droitTimbre?: number; montantAvecTimbre?: number }
interface CaisseRow { id: string; date: string; libelle: string; type: "entree" | "sortie"; categorie: string; montant: number; reference?: string }

async function fetchTable<T>(table: string): Promise<T[]> {
  try {
    const res = await fetch(`/api/sync-read?table=${table}`, { cache: "no-store" })
    const json = await res.json()
    return json?.ok ? (json.data ?? []) : []
  } catch { return [] }
}

function fmtDH(n: number) {
  return n.toLocaleString("fr-MA", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " DH"
}

export default function BOFiscalite({ user }: Props) {
  const canEdit = ["super_super_admin", "super_admin", "admin"].includes(user.role)
  const [loading, setLoading] = useState(true)
  const [commandes, setCommandes] = useState<CmdRow[]>([])
  const [bls, setBls] = useState<BLRow[]>([])
  const [articles, setArticles] = useState<Article[]>([])
  const [salaries, setSalaries] = useState<Salarie[]>([])
  const [invoices, setInvoices] = useState<{ id: string; payload: InvoicePayload }[]>([])
  const [caisse, setCaisse] = useState<CaisseRow[]>([])
  const [cfg, setCfg] = useState<FiscalConfig>(store.getFiscalConfig())
  const [showCfg, setShowCfg] = useState(false)
  const [saved, setSaved] = useState(false)

  // Période — par défaut toute la donnée disponible
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const load = () => {
    setLoading(true)
    Promise.all([
      fetchTable<CmdRow>("fl_commandes"),
      fetchTable<BLRow>("fl_bons_livraison"),
      fetchTable<{ id: string; payload: Article }>("fl_articles"),
      fetchTable<{ id: string; payload: Salarie }>("fl_salaries"),
      fetchTable<{ id: string; payload: InvoicePayload }>("fl_invoices"),
      fetchTable<{ id: string; payload: Omit<CaisseRow, "id"> }>("fl_caisse_entries"),
    ]).then(([c, b, a, s, inv, cai]) => {
      setCommandes(c.filter(r => r.payload && !String(r.id).startsWith("__")))
      setBls(b.filter(r => r.payload && !String(r.id).startsWith("__")))
      setArticles(a.filter(r => r.payload).map(r => ({ ...r.payload, id: r.id })))
      setSalaries(s.filter(r => r.payload).map(r => ({ ...r.payload, id: r.id })))
      setInvoices(inv.filter(r => r.payload && !String(r.id).startsWith("__")))
      setCaisse(cai.filter(r => r.payload).map(r => ({ ...r.payload, id: r.id })))
      setLoading(false)
    })
  }
  useEffect(load, [])

  const inRange = (d?: string) => {
    if (!d) return false
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }

  const cmdInPeriod = useMemo(() => commandes.filter(c => inRange(c.payload?.date)), [commandes, from, to])
  const blInPeriod = useMemo(() => bls.filter(b => inRange(b.payload?.date)), [bls, from, to])

  const articleById = useMemo(() => {
    const m = new Map<string, Article>()
    articles.forEach(a => m.set(a.id, a))
    return m
  }, [articles])

  const stats = useMemo(() => {
    let caCommande = 0, qte = 0, coutMarchandise = 0
    const joursSet = new Set<string>()
    cmdInPeriod.forEach(c => {
      if (c.payload?.date) joursSet.add(c.payload.date)
      ;(c.payload?.lignes ?? []).forEach(l => {
        const total = Number(l.total) || (Number(l.quantite) || 0) * (Number(l.prixVente ?? l.prixUnitaire) || 0)
        caCommande += total
        qte += Number(l.quantite) || 0
        const art = l.articleId ? articleById.get(l.articleId) : undefined
        coutMarchandise += (Number(l.quantite) || 0) * (Number(art?.prixAchat) || 0)
      })
    })
    const caLivre = blInPeriod.reduce((s, b) => s + (Number(b.payload?.montantTTC ?? b.payload?.montantTotal) || 0), 0)
    const ca = caLivre > 0 ? caLivre : caCommande // CA facturé fait foi ; à défaut, CA commandé (pipeline)
    const margeBrute = caCommande - coutMarchandise
    const nbJours = joursSet.size

    const salariesActifs = salaries.filter(s => s.statut === "actif" || s.statut === "periode_essai")
    const masseSalariale = salariesActifs.reduce((s, sal) => s + (Number(sal.salaireBrut) || 0), 0)
    const chargesPatronales = masseSalariale * (cfg.tauxChargesPatronales / 100)
    const coutSuperbrutMensuel = masseSalariale + chargesPatronales

    const cotisationMinimale = ca * (cfg.tauxCotisationMinimale / 100)
    const tvaEstimee = ca * (cfg.tauxTVA / 100)
    const ratioMasseSalariale = ca > 0 ? (coutSuperbrutMensuel / ca) * 100 : 0

    // Projection : moyenne/jour observée × jours ouvrés — fiabilité liée à nbJours
    const caParJour = nbJours > 0 ? ca / nbJours : 0
    const qteParJour = nbJours > 0 ? qte / nbJours : 0
    const caProjeteMois = caParJour * cfg.joursOuvresParMois
    const qteProjeteeMois = qteParJour * cfg.joursOuvresParMois
    const caProjeteAn = caProjeteMois * 12
    const qteProjeteeAn = qteProjeteeMois * 12

    return {
      ca, caCommande, caLivre, qte, margeBrute, nbJours,
      masseSalariale, chargesPatronales, coutSuperbrutMensuel,
      cotisationMinimale, tvaEstimee, ratioMasseSalariale,
      caParJour, qteParJour, caProjeteMois, qteProjeteeMois, caProjeteAn, qteProjeteeAn,
      nbClients: new Set(cmdInPeriod.map(c => c.payload?.clientNom)).size,
      nbCommandes: cmdInPeriod.length,
      nbSalariesActifs: salariesActifs.length,
    }
  }, [cmdInPeriod, blInPeriod, articleById, salaries, cfg])

  const confianceFaible = stats.nbJours > 0 && stats.nbJours < 7

  // ── Journal TVA trimestriel ──────────────────────────────────────────────
  const trimestreOf = (d: string) => { const dt = new Date(d); return `${dt.getFullYear()}-T${Math.floor(dt.getMonth() / 3) + 1}` }
  const [trimestre, setTrimestre] = useState<string>(() => trimestreOf(new Date().toISOString()))
  const trimestresDisponibles = useMemo(() => {
    const set = new Set<string>()
    invoices.forEach(i => { if (i.payload.date) set.add(trimestreOf(i.payload.date)) })
    set.add(trimestreOf(new Date().toISOString()))
    return [...set].sort().reverse()
  }, [invoices])
  const journalTVA = useMemo(() => {
    const factures = invoices.filter(i => i.payload.date && trimestreOf(i.payload.date) === trimestre)
    const ventesExoneres = factures.reduce((s, i) => s + (Number(i.payload.montantHT) || 0), 0)
    const droitTimbreCumule = factures.reduce((s, i) => s + (Number(i.payload.droitTimbre) || 0), 0)
    const nbFacturesEspeces = factures.filter(i => i.payload.modeReglement === "especes").length
    return { factures, ventesExoneres, droitTimbreCumule, nbFactures: factures.length, nbFacturesEspeces }
  }, [invoices, trimestre])

  // ── Livre de caisse chronologique ────────────────────────────────────────
  const [caisseFrom, setCaisseFrom] = useState("")
  const [caisseTo, setCaisseTo] = useState("")
  const livreCaisse = useMemo(() => {
    const filtered = caisse
      .filter(e => (!caisseFrom || e.date >= caisseFrom) && (!caisseTo || e.date <= caisseTo))
      .sort((a, b) => a.date.localeCompare(b.date))
    let solde = 0
    const rows = filtered.map(e => {
      solde += e.type === "entree" ? e.montant : -e.montant
      return { ...e, soldeApres: solde }
    })
    return { rows, soldeFinal: solde }
  }, [caisse, caisseFrom, caisseTo])

  const exportCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const recommandations = useMemo(() => {
    const r: { level: "warn" | "info" | "ok"; text: string }[] = []
    if (stats.nbJours === 0) {
      r.push({ level: "info", text: "Aucune commande sur la période sélectionnée — élargissez la plage de dates." })
      return r
    }
    if (confianceFaible) {
      r.push({ level: "warn", text: `Projection basée sur seulement ${stats.nbJours} jour(s) de données réelles — marge d'erreur élevée. Collectez au moins 1-2 semaines avant de vous fier aux montants projetés.` })
    }
    if (stats.nbSalariesActifs === 0) {
      r.push({ level: "info", text: "Aucun salarié actif enregistré dans le module RH — les charges patronales affichées sont donc à 0. Ajoutez vos employés dans RH > Comptabilité RH pour un calcul réel de la masse salariale." })
    } else if (stats.ratioMasseSalariale > cfg.seuilAlerteMasseSalariale) {
      r.push({ level: "warn", text: `Ratio masse salariale (superbrut) / CA = ${stats.ratioMasseSalariale.toFixed(1)}% — au-dessus du seuil d'alerte (${cfg.seuilAlerteMasseSalariale}%). Réévaluez les prochains recrutements ou augmentez le volume traité avant d'embaucher.` })
    } else {
      r.push({ level: "ok", text: `Ratio masse salariale / CA = ${stats.ratioMasseSalariale.toFixed(1)}% — sous le seuil d'alerte (${cfg.seuilAlerteMasseSalariale}%).` })
    }
    if (stats.caLivre === 0 && stats.caCommande > 0) {
      r.push({ level: "info", text: "Le CA affiché est basé sur les commandes (pipeline), aucun BL facturé n'existe encore sur la période — le CA réel encaissable peut différer une fois les livraisons validées." })
    }
    if (stats.cotisationMinimale > 0) {
      r.push({ level: "info", text: `Cotisation minimale IS estimée : ${fmtDH(stats.cotisationMinimale)} sur la période — due même en l'absence de bénéfice si elle dépasse l'IS calculé sur le résultat réel.` })
    }
    return r
  }, [stats, cfg, confianceFaible])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Fiscalité & Fiduciaire</h1>
          <p className="text-sm text-slate-500 mt-0.5">Vita Fresh (Maroc) — calculs basés sur les données réelles de l&apos;ERP. Taux à valider avec votre fiduciaire avant toute déclaration.</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowCfg(v => !v)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            {showCfg ? "Masquer les taux" : "Régler les taux"}
          </button>
        )}
      </div>

      {showCfg && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 grid grid-cols-2 md:grid-cols-5 gap-3">
          {([
            ["tauxTVA", "TVA (%) — 0 = fruits/légumes frais exonérés"],
            ["tauxCotisationMinimale", "Cotisation minimale IS (% du CA)"],
            ["tauxChargesPatronales", "Charges patronales (% du brut)"],
            ["seuilAlerteMasseSalariale", "Seuil alerte masse salariale (% du CA)"],
            ["joursOuvresParMois", "Jours ouvrés / mois"],
            ["tauxDroitTimbre", "Droit de timbre espèces (%)"],
            ["plafondCashAchatJour", "Plafond cash achat/jour/fournisseur (DH)"],
            ["plafondCashVenteFacture", "Plafond cash vente/facture (DH)"],
          ] as [keyof FiscalConfig, string][]).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-[11px] font-semibold text-slate-500">{label}</label>
              <input type="number" step="0.01" value={cfg[key]}
                onChange={e => setCfg(c => ({ ...c, [key]: Number(e.target.value) || 0 }))}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm" />
            </div>
          ))}
          <div className="col-span-2 md:col-span-5 flex items-center gap-2">
            <button onClick={() => { store.saveFiscalConfig(cfg); setSaved(true); setTimeout(() => setSaved(false), 2000) }}
              className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800">
              Enregistrer les taux
            </button>
            <button onClick={() => setCfg(DEFAULT_FISCAL_CONFIG)}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-500 hover:bg-slate-50">
              Réinitialiser
            </button>
            {saved && <span className="text-xs font-semibold text-emerald-600">✓ Enregistré</span>}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-500">Du</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold text-slate-500">Au</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm" />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo("") }} className="self-end px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50">
            Tout afficher
          </button>
        )}
        <button onClick={load} className="self-end px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 hover:bg-emerald-50 border border-emerald-200">
          🔄 Rafraîchir
        </button>
        <span className="ml-auto text-xs text-slate-400">{loading ? "Chargement…" : `${stats.nbCommandes} commande(s) · ${stats.nbClients} client(s) · ${stats.nbJours} jour(s) de données`}</span>
      </div>

      {confianceFaible && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
          <span className="text-lg leading-none">⚠️</span>
          <span><strong>Échantillon limité ({stats.nbJours} jour{stats.nbJours > 1 ? "s" : ""})</strong> — les projections mensuelles/annuelles ci-dessous ont une marge d&apos;erreur élevée. Elles s&apos;affineront automatiquement à mesure que l&apos;ERP accumule des commandes réelles.</span>
        </div>
      )}

      {/* KPI réels */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "CA période", val: fmtDH(stats.ca), sub: stats.caLivre > 0 ? "facturé (BL)" : "commandé (pipeline)" },
          { label: "Tonnage période", val: `${(stats.qte / 1000).toFixed(2)} T`, sub: `${stats.qte.toFixed(0)} kg/unités cumulés` },
          { label: "Marge brute estimée", val: fmtDH(stats.margeBrute), sub: "CA commandé − coût marchandise" },
          { label: "Masse salariale (superbrut)", val: fmtDH(stats.coutSuperbrutMensuel), sub: `${stats.nbSalariesActifs} salarié(s) actif(s)` },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{k.label}</p>
            <p className="text-xl font-black text-slate-800 mt-1">{k.val}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Estimations fiscales */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-800 mb-3">Estimations fiscales (période sélectionnée)</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-500">Cotisation minimale IS (plancher)</span><span className="font-bold">{fmtDH(stats.cotisationMinimale)}</span></div>
          <div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-500">TVA estimée (collectée)</span><span className="font-bold">{fmtDH(stats.tvaEstimee)}</span></div>
          <div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-500">Charges patronales estimées</span><span className="font-bold">{fmtDH(stats.chargesPatronales)}</span></div>
          <div className="flex justify-between border-b border-slate-100 pb-2"><span className="text-slate-500">Ratio masse salariale / CA</span><span className={`font-bold ${stats.ratioMasseSalariale > cfg.seuilAlerteMasseSalariale ? "text-red-600" : "text-emerald-600"}`}>{stats.ratioMasseSalariale.toFixed(1)}%</span></div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">L&apos;IS proprement dit (sur le bénéfice réel) nécessite le résultat net complet (charges fixes, amortissements...) — non disponible dans l&apos;ERP. La cotisation minimale ci-dessus est le plancher légal, indépendant du bénéfice.</p>
      </div>

      {/* Projection */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-800 mb-3">Projection si le rythme actuel se maintient</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div><p className="text-slate-400 text-[11px]">CA / jour moyen</p><p className="font-bold text-base">{fmtDH(stats.caParJour)}</p></div>
          <div><p className="text-slate-400 text-[11px]">CA projeté / mois</p><p className="font-bold text-base">{fmtDH(stats.caProjeteMois)}</p></div>
          <div><p className="text-slate-400 text-[11px]">CA projeté / an</p><p className="font-bold text-base">{fmtDH(stats.caProjeteAn)}</p></div>
          <div><p className="text-slate-400 text-[11px]">Tonnage projeté / an</p><p className="font-bold text-base">{(stats.qteProjeteeAn / 1000).toFixed(1)} T</p></div>
        </div>
      </div>

      {/* Recommandations */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="text-sm font-bold text-slate-800 mb-3">Recommandations</h3>
        <div className="flex flex-col gap-2">
          {recommandations.map((r, i) => (
            <div key={i} className={`flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm ${
              r.level === "warn" ? "bg-amber-50 text-amber-800 border border-amber-200" :
              r.level === "ok" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" :
              "bg-slate-50 text-slate-600 border border-slate-200"}`}>
              <span>{r.level === "warn" ? "⚠️" : r.level === "ok" ? "✓" : "ℹ️"}</span>
              <span>{r.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Journal TVA trimestriel ─────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h3 className="text-sm font-bold text-slate-800">Journal TVA trimestriel</h3>
          <div className="flex items-center gap-2">
            <select value={trimestre} onChange={e => setTrimestre(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
              {trimestresDisponibles.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button onClick={() => exportCSV(
              `journal_tva_${trimestre}.csv`,
              ["N° Facture", "Date", "Client", "Montant HT (0% exo)", "Mode règlement", "Droit de timbre (0,25%)", "Total avec timbre"],
              journalTVA.factures.map(i => [i.payload.numero ?? i.id, i.payload.date ?? "", i.payload.clientNom ?? "", i.payload.montantHT ?? 0, i.payload.modeReglement ?? "-", i.payload.droitTimbre ?? 0, i.payload.montantAvecTimbre ?? i.payload.montantTTC ?? 0])
            )} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800">
              📤 Exporter CSV
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
          <div><p className="text-slate-400 text-[11px]">Factures émises</p><p className="font-bold text-base">{journalTVA.nbFactures}</p></div>
          <div><p className="text-slate-400 text-[11px]">Ventes à 0% (exonéré)</p><p className="font-bold text-base">{fmtDH(journalTVA.ventesExoneres)}</p></div>
          <div><p className="text-slate-400 text-[11px]">Droit de timbre cumulé</p><p className="font-bold text-base text-amber-700">{fmtDH(journalTVA.droitTimbreCumule)}</p></div>
          <div><p className="text-slate-400 text-[11px]">Dont réglées espèces</p><p className="font-bold text-base">{journalTVA.nbFacturesEspeces}</p></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-slate-400 border-b border-slate-100">
              <th className="py-1.5 pr-3">N° Facture</th><th className="py-1.5 pr-3">Date</th><th className="py-1.5 pr-3">Client</th>
              <th className="py-1.5 pr-3 text-right">HT (0%)</th><th className="py-1.5 pr-3">Règlement</th><th className="py-1.5 pr-3 text-right">Timbre</th>
            </tr></thead>
            <tbody>
              {journalTVA.factures.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-slate-400">Aucune facture sur ce trimestre.</td></tr>}
              {journalTVA.factures.map(i => (
                <tr key={i.id} className="border-b border-slate-50">
                  <td className="py-1.5 pr-3 font-mono">{i.payload.numero ?? i.id}</td>
                  <td className="py-1.5 pr-3">{i.payload.date}</td>
                  <td className="py-1.5 pr-3">{i.payload.clientNom}</td>
                  <td className="py-1.5 pr-3 text-right">{fmtDH(Number(i.payload.montantHT) || 0)}</td>
                  <td className="py-1.5 pr-3">{i.payload.modeReglement ?? "-"}</td>
                  <td className="py-1.5 pr-3 text-right">{i.payload.droitTimbre ? fmtDH(i.payload.droitTimbre) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Livre de caisse chronologique ───────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <h3 className="text-sm font-bold text-slate-800">Livre des opérations de caisse</h3>
          <div className="flex items-center gap-2">
            <input type="date" value={caisseFrom} onChange={e => setCaisseFrom(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs" />
            <input type="date" value={caisseTo} onChange={e => setCaisseTo(e.target.value)} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs" />
            <button onClick={() => exportCSV(
              `livre_caisse_${caisseFrom || "debut"}_${caisseTo || "fin"}.csv`,
              ["Date", "Libellé", "Type", "Catégorie", "Montant", "Référence", "Solde après"],
              livreCaisse.rows.map(r => [r.date, r.libelle, r.type, r.categorie, r.montant, r.reference ?? "", r.soldeApres])
            )} className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800">
              📤 Exporter CSV
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between mb-2 text-sm">
          <span className="text-slate-400">{livreCaisse.rows.length} opération(s)</span>
          <span className="font-bold">Solde : <span className={livreCaisse.soldeFinal >= 0 ? "text-emerald-700" : "text-red-600"}>{fmtDH(livreCaisse.soldeFinal)}</span></span>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white"><tr className="text-left text-slate-400 border-b border-slate-100">
              <th className="py-1.5 pr-3">Date</th><th className="py-1.5 pr-3">Libellé</th><th className="py-1.5 pr-3">Catégorie</th>
              <th className="py-1.5 pr-3 text-right">Montant</th><th className="py-1.5 pr-3 text-right">Solde après</th>
            </tr></thead>
            <tbody>
              {livreCaisse.rows.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-400">Aucune opération sur cette période.</td></tr>}
              {livreCaisse.rows.map(r => (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{r.date}</td>
                  <td className="py-1.5 pr-3">{r.libelle}</td>
                  <td className="py-1.5 pr-3">{r.categorie}</td>
                  <td className={`py-1.5 pr-3 text-right font-semibold ${r.type === "entree" ? "text-emerald-700" : "text-red-600"}`}>
                    {r.type === "entree" ? "+" : "-"}{fmtDH(r.montant)}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-bold">{fmtDH(r.soldeApres)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
