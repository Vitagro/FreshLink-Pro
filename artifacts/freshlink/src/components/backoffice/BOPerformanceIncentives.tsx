"use client"

import { useState, useMemo } from "react"
import {
  store,
  type User,
  type DriverBonusConfig,
  type DriverBonusRecord,
  type ShareholderDistribution,
  type Actionnaire,
  type BonusCriteria,
} from "@/lib/store"

function Icon({ d, className = "w-5 h-5" }: { d: string; className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  )
}

type ITab = "livreurs" | "actionnaires" | "config"

interface Props { user: User }

export default function BOPerformanceIncentives({ user }: Props) {
  const [tab, setTab] = useState<ITab>("livreurs")
  const [bonusConfig, setBonusConfig] = useState<DriverBonusConfig>(() => store.getDriverBonusConfig())
  const [bonusRecords, setBonusRecords] = useState<DriverBonusRecord[]>(() => store.getDriverBonusRecords())
  const [distributions, setDistributions] = useState<ShareholderDistribution[]>(() => store.getShareholderDistributions())
  const [saveMsg, setSaveMsg] = useState("")

  // New bonus record form
  const users_ = useMemo(() => store.getUsers().filter(u => u.role === "livreur" || u.role === "resp_logistique"), [])
  const [bForm, setBForm] = useState({
    livreurId: "", driverType: "interne" as "interne" | "externe",
    tripId: "", date: new Date().toISOString().split("T")[0],
    zeroRetard: false, zeroRetour: false, zeroQualite: false,
  })

  // Shareholder distribution form
  const actionnaires = useMemo<Actionnaire[]>(() => store.getActionnaires(), [])
  const totalCotisation = actionnaires.reduce((s, a) => s + a.cotisation, 0)
  const [dForm, setDForm] = useState({
    periode: new Date().toISOString().split("T")[0].slice(0, 7),
    cycleType: "mensuel" as "journalier" | "hebdomadaire" | "mensuel",
    beneficeNet: 0,
    notes: "",
  })

  const flash = (msg: string) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(""), 3200) }

  // ── Save driver bonus config ─────────────────────────────────────────────────
  const saveConfig = () => {
    store.saveDriverBonusConfig({ ...bonusConfig, updatedBy: user.id, updatedAt: new Date().toISOString() })
    setBonusConfig(store.getDriverBonusConfig())
    flash("Configuration des primes sauvegardee.")
  }

  // ── Calculate + add bonus record ─────────────────────────────────────────────
  const computeBonus = () => {
    const cfg = bonusConfig
    const isExt = bForm.driverType === "externe"
    const criteria: BonusCriteria[] = []
    let montant = 0
    if (bForm.zeroRetard) { criteria.push("zero_retard"); montant += isExt ? cfg.bonusExterneZeroRetard : cfg.bonusZeroRetard }
    if (bForm.zeroRetour) { criteria.push("zero_retour"); montant += isExt ? cfg.bonusExterneZeroRetour : cfg.bonusZeroRetour }
    if (bForm.zeroQualite) { criteria.push("zero_qualite"); montant += isExt ? cfg.bonusExterneZeroQualite : cfg.bonusZeroQualite }
    // Jackpot if all 3 criteria
    if (criteria.length === 3) montant = isExt ? cfg.bonusExterneParfait : cfg.bonusParfait
    return { criteria, montant }
  }

  const addBonusRecord = () => {
    if (!bForm.livreurId || !bForm.date) { flash("Livreur et date requis."); return }
    const livreur = users_.find(u => u.id === bForm.livreurId)
    const { criteria, montant } = computeBonus()
    const record: DriverBonusRecord = {
      id: store.genId(),
      livreurId: bForm.livreurId,
      livreurNom: livreur?.name ?? bForm.livreurId,
      driverType: bForm.driverType,
      tripId: bForm.tripId || "MANUEL",
      date: bForm.date,
      zeroRetard: bForm.zeroRetard,
      zeroRetour: bForm.zeroRetour,
      zeroQualite: bForm.zeroQualite,
      montantBonus: montant,
      criteriaRemplis: criteria,
      statut: "calcule",
      createdAt: new Date().toISOString(),
    }
    store.addDriverBonusRecord(record)
    setBonusRecords(store.getDriverBonusRecords())
    setBForm({ livreurId: "", driverType: "interne", tripId: "", date: new Date().toISOString().split("T")[0], zeroRetard: false, zeroRetour: false, zeroQualite: false })
    flash(`Prime calculee: ${montant} DH pour ${record.livreurNom}.`)
  }

  const validateBonus = (id: string) => {
    store.saveDriverBonusRecords(store.getDriverBonusRecords().map(r =>
      r.id === id ? { ...r, statut: "valide", validePar: user.id } : r
    ))
    setBonusRecords(store.getDriverBonusRecords())
  }

  // ── Build shareholder distribution ───────────────────────────────────────────
  const buildDistribution = () => {
    if (dForm.beneficeNet <= 0) { flash("Benefice net doit etre > 0."); return }
    if (actionnaires.length === 0) { flash("Aucun actionnaire enregistre."); return }
    const lignes = actionnaires.filter(a => a.actif).map(a => {
      const part = totalCotisation > 0 ? (a.cotisation / totalCotisation) * 100 : 0
      const montant = (dForm.beneficeNet * part) / 100
      return {
        actionnaireId: a.id,
        actionnaireNom: `${a.nom} ${a.prenom}`,
        cotisation: a.cotisation,
        part,
        montant,
        statut: "en_attente" as const,
      }
    })
    const dist: ShareholderDistribution = {
      id: store.genId(),
      periode: dForm.periode,
      cycleType: dForm.cycleType,
      beneficeNet: dForm.beneficeNet,
      totalDistribue: lignes.reduce((s, l) => s + l.montant, 0),
      lignes,
      statut: "brouillon",
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      notes: dForm.notes,
    }
    store.addShareholderDistribution(dist)
    setDistributions(store.getShareholderDistributions())
    setDForm({ periode: new Date().toISOString().split("T")[0].slice(0, 7), cycleType: "mensuel", beneficeNet: 0, notes: "" })
    flash("Distribution cree en brouillon.")
  }

  const validateDistribution = (id: string) => {
    store.saveShareholderDistributions(store.getShareholderDistributions().map(d =>
      d.id === id ? { ...d, statut: "valide", validePar: user.id } : d
    ))
    setDistributions(store.getShareholderDistributions())
    flash("Distribution validee.")
  }

  const markDistribue = (id: string) => {
    store.saveShareholderDistributions(store.getShareholderDistributions().map(d =>
      d.id === id ? { ...d, statut: "distribue", lignes: d.lignes.map(l => ({ ...l, statut: "paye" as const, datePaiement: new Date().toISOString().split("T")[0] })) } : d
    ))
    setDistributions(store.getShareholderDistributions())
    flash("Distribution marquee comme distribuee.")
  }

  // ── Totals ────────────────────────────────────────────────────────────────────
  const totalPrimes = bonusRecords.filter(r => r.statut === "valide").reduce((s, r) => s + r.montantBonus, 0)
  const pendingPrimes = bonusRecords.filter(r => r.statut === "calcule").reduce((s, r) => s + r.montantBonus, 0)

  const { criteria: previewCriteria, montant: previewMontant } = computeBonus()

  const TABS = [
    { id: "livreurs" as ITab, label: "Primes Livreurs", icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" },
    { id: "actionnaires" as ITab, label: "Distribution Actionnaires", icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 11v-1m0-2c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { id: "config" as ITab, label: "Parametres primes", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" },
  ]

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground">Performance & Incentives</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Primes livreurs, dividendes actionnaires, criteres editables</p>
        </div>
        {saveMsg && (
          <div className="px-4 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold">{saveMsg}</div>
        )}
      </div>

      {/* KPI bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Primes validees", value: `${totalPrimes.toLocaleString("fr-MA")} DH`, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
          { label: "Primes en attente", value: `${pendingPrimes.toLocaleString("fr-MA")} DH`, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
          { label: "Total livreurs", value: `${users_.length}`, color: "text-blue-700", bg: "bg-blue-50 border-blue-200" },
          { label: "Actionnaires actifs", value: `${actionnaires.filter(a => a.actif).length}`, color: "text-violet-700", bg: "bg-violet-50 border-violet-200" },
        ].map(k => (
          <div key={k.label} className={`rounded-2xl border p-4 ${k.bg}`}>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{k.label}</p>
            <p className={`text-2xl font-black mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all flex-1 justify-center ${tab === t.id ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            <Icon d={t.icon} className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ══ PRIMES LIVREURS ═══════════════════════════════════════════════════════ */}
      {tab === "livreurs" && (
        <div className="flex flex-col gap-5">
          {/* Add new record */}
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
            <h3 className="font-bold text-foreground">Calculer une prime livreur</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-foreground uppercase tracking-wide">Livreur</label>
                <select value={bForm.livreurId} onChange={e => setBForm({ ...bForm, livreurId: e.target.value })}
                  className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background">
                  <option value="">— Choisir —</option>
                  {users_.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-foreground uppercase tracking-wide">Type de livreur</label>
                <select value={bForm.driverType} onChange={e => setBForm({ ...bForm, driverType: e.target.value as "interne" | "externe" })}
                  className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background">
                  <option value="interne">Interne</option>
                  <option value="externe">Externe</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-foreground uppercase tracking-wide">Date / Trip</label>
                <input type="date" value={bForm.date} onChange={e => setBForm({ ...bForm, date: e.target.value })}
                  className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background" />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-foreground uppercase tracking-wide">Criteres de performance</label>
              <div className="flex flex-wrap gap-3">
                {[
                  { key: "zeroRetard" as const, label: "0 Retards", desc: `+${bForm.driverType === "interne" ? bonusConfig.bonusZeroRetard : bonusConfig.bonusExterneZeroRetard} DH`, color: "border-blue-300 bg-blue-50", activeColor: "border-blue-500 bg-blue-100" },
                  { key: "zeroRetour" as const, label: "0 Retours", desc: `+${bForm.driverType === "interne" ? bonusConfig.bonusZeroRetour : bonusConfig.bonusExterneZeroRetour} DH`, color: "border-emerald-300 bg-emerald-50", activeColor: "border-emerald-500 bg-emerald-100" },
                  { key: "zeroQualite" as const, label: "0 Pb Qualite", desc: `+${bForm.driverType === "interne" ? bonusConfig.bonusZeroQualite : bonusConfig.bonusExterneZeroQualite} DH`, color: "border-orange-300 bg-orange-50", activeColor: "border-orange-500 bg-orange-100" },
                ].map(c => (
                  <button key={c.key} onClick={() => setBForm({ ...bForm, [c.key]: !bForm[c.key] })}
                    className={`px-4 py-3 rounded-2xl border-2 text-sm font-bold flex flex-col items-center gap-0.5 transition-all min-w-[100px] ${bForm[c.key] ? c.activeColor : c.color}`}>
                    <span className={`text-lg ${bForm[c.key] ? "text-foreground" : "text-muted-foreground"}`}>{bForm[c.key] ? "✓" : "○"}</span>
                    <span className="text-foreground">{c.label}</span>
                    <span className="text-xs text-muted-foreground font-medium">{c.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            {previewCriteria.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-emerald-800">Prime calculee</p>
                  <p className="text-xs text-emerald-600">{previewCriteria.length === 3 ? "PARFAIT — Prime integrale !" : `${previewCriteria.length}/3 criteres remplis`}</p>
                </div>
                <p className="text-2xl font-black text-emerald-700">{previewMontant} DH</p>
              </div>
            )}

            <button onClick={addBonusRecord}
              className="self-start px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
              Enregistrer la prime
            </button>
          </div>

          {/* Records list */}
          {bonusRecords.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    {["Date", "Livreur", "Type", "Criteres", "Prime (DH)", "Statut", "Action"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-bold text-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bonusRecords.slice(0, 100).map(r => (
                    <tr key={r.id} className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-foreground">{r.date}</td>
                      <td className="px-4 py-2.5 font-semibold text-foreground">{r.livreurNom}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.driverType === "interne" ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800"}`}>
                          {r.driverType}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1 flex-wrap">
                          {r.zeroRetard && <span className="px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">0 Retard</span>}
                          {r.zeroRetour && <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">0 Retour</span>}
                          {r.zeroQualite && <span className="px-1.5 py-0.5 rounded text-xs bg-orange-50 text-orange-700 border border-orange-200">0 Qualite</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-bold text-foreground">{r.montantBonus}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.statut === "valide" ? "bg-green-100 text-green-800" : r.statut === "paye" ? "bg-emerald-100 text-emerald-800" : "bg-yellow-100 text-yellow-800"}`}>
                          {r.statut}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.statut === "calcule" && (
                          <button onClick={() => validateBonus(r.id)}
                            className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors">
                            Valider
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ DISTRIBUTION ACTIONNAIRES ════════════════════════════════════════════ */}
      {tab === "actionnaires" && (
        <div className="flex flex-col gap-5">
          {/* Build distribution */}
          <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
            <h3 className="font-bold text-foreground">Calculer une distribution de dividendes</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-foreground uppercase tracking-wide">Periode</label>
                <input type="month" value={dForm.periode} onChange={e => setDForm({ ...dForm, periode: e.target.value })}
                  className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-foreground uppercase tracking-wide">Cycle</label>
                <select value={dForm.cycleType} onChange={e => setDForm({ ...dForm, cycleType: e.target.value as "journalier" | "hebdomadaire" | "mensuel" })}
                  className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background">
                  <option value="journalier">Journalier</option>
                  <option value="hebdomadaire">Hebdomadaire</option>
                  <option value="mensuel">Mensuel</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-foreground uppercase tracking-wide">Benefice net (DH)</label>
                <input type="number" min={0} value={dForm.beneficeNet} onChange={e => setDForm({ ...dForm, beneficeNet: +e.target.value })}
                  className="border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background" />
              </div>
            </div>

            {/* Preview table */}
            {dForm.beneficeNet > 0 && actionnaires.filter(a => a.actif).length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted border-b border-border">
                      {["Actionnaire", "Cotisation (DH)", "Part (%)", "Montant (DH)"].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-bold text-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {actionnaires.filter(a => a.actif).map(a => {
                      const part = totalCotisation > 0 ? (a.cotisation / totalCotisation) * 100 : 0
                      const montant = (dForm.beneficeNet * part) / 100
                      return (
                        <tr key={a.id} className="border-b border-border">
                          <td className="px-4 py-2 font-semibold text-foreground">{a.nom} {a.prenom}</td>
                          <td className="px-4 py-2 text-foreground">{a.cotisation.toLocaleString("fr-MA")} DH</td>
                          <td className="px-4 py-2 text-foreground">{part.toFixed(1)}%</td>
                          <td className="px-4 py-2 font-bold text-emerald-700">{montant.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-emerald-50 border-t-2 border-emerald-200">
                      <td colSpan={3} className="px-4 py-2 font-bold text-emerald-800">Total distribue</td>
                      <td className="px-4 py-2 font-black text-emerald-700 text-base">{dForm.beneficeNet.toLocaleString("fr-MA")} DH</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <button onClick={buildDistribution}
              className="self-start px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
              Creer la distribution
            </button>
          </div>

          {/* History */}
          {distributions.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="font-bold text-foreground">Historique distributions</h3>
              {distributions.map(d => (
                <div key={d.id} className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="font-bold text-foreground">{d.periode} — {d.cycleType}</span>
                      <span className="ml-3 font-black text-emerald-700">{d.totalDistribue.toLocaleString("fr-MA")} DH</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${d.statut === "distribue" ? "bg-green-100 text-green-800" : d.statut === "valide" ? "bg-blue-100 text-blue-800" : "bg-yellow-100 text-yellow-800"}`}>
                        {d.statut}
                      </span>
                      {d.statut === "brouillon" && (
                        <button onClick={() => validateDistribution(d.id)}
                          className="px-3 py-1 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors">
                          Valider
                        </button>
                      )}
                      {d.statut === "valide" && (
                        <button onClick={() => markDistribue(d.id)}
                          className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-colors">
                          Marquer distribue
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          {["Actionnaire", "Part", "Montant", "Statut"].map(h => (
                            <th key={h} className="px-3 py-1.5 text-left font-bold text-foreground uppercase">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {d.lignes.map(l => (
                          <tr key={l.actionnaireId} className="border-b border-border">
                            <td className="px-3 py-1.5 font-semibold text-foreground">{l.actionnaireNom}</td>
                            <td className="px-3 py-1.5 text-muted-foreground">{l.part.toFixed(1)}%</td>
                            <td className="px-3 py-1.5 font-bold text-foreground">{l.montant.toLocaleString("fr-MA", { minimumFractionDigits: 2 })} DH</td>
                            <td className="px-3 py-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${l.statut === "paye" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}`}>{l.statut}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ CONFIG PRIMES ═════════════════════════════════════════════════════════ */}
      {tab === "config" && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-foreground">Parametres des primes livreurs</h2>
            <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer text-foreground">
              <input type="checkbox" checked={bonusConfig.actif} onChange={e => setBonusConfig({ ...bonusConfig, actif: e.target.checked })}
                className="w-4 h-4 rounded accent-primary" />
              Primes actives
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Internal driver */}
            <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                Livreur INTERNE (DH / trip)
              </h3>
              {[
                { key: "bonusZeroRetard" as const, label: "Prime 0 retard" },
                { key: "bonusZeroRetour" as const, label: "Prime 0 retour" },
                { key: "bonusZeroQualite" as const, label: "Prime 0 pb qualite" },
                { key: "bonusParfait" as const, label: "Prime PARFAIT (3/3 criteres)" },
              ].map(f => (
                <div key={f.key} className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{f.label}</span>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} value={bonusConfig[f.key]}
                      onChange={e => setBonusConfig({ ...bonusConfig, [f.key]: +e.target.value })}
                      className="w-24 border border-border rounded-lg px-2 py-1 text-sm text-right text-foreground bg-background" />
                    <span className="text-xs text-muted-foreground font-semibold">DH</span>
                  </div>
                </div>
              ))}
            </div>

            {/* External driver */}
            <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
              <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                Livreur EXTERNE (DH / trip)
              </h3>
              {[
                { key: "bonusExterneZeroRetard" as const, label: "Prime 0 retard" },
                { key: "bonusExterneZeroRetour" as const, label: "Prime 0 retour" },
                { key: "bonusExterneZeroQualite" as const, label: "Prime 0 pb qualite" },
                { key: "bonusExterneParfait" as const, label: "Prime PARFAIT (3/3 criteres)" },
              ].map(f => (
                <div key={f.key} className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{f.label}</span>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} value={bonusConfig[f.key]}
                      onChange={e => setBonusConfig({ ...bonusConfig, [f.key]: +e.target.value })}
                      className="w-24 border border-border rounded-lg px-2 py-1 text-sm text-right text-foreground bg-background" />
                    <span className="text-xs text-muted-foreground font-semibold">DH</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-foreground uppercase tracking-wide">Cycle de calcul des primes</label>
            <select value={bonusConfig.cycleBonus} onChange={e => setBonusConfig({ ...bonusConfig, cycleBonus: e.target.value as DriverBonusConfig["cycleBonus"] })}
              className="w-64 border border-border rounded-xl px-3 py-2 text-sm text-foreground bg-background">
              <option value="par_trip">Par trip (immediat)</option>
              <option value="journalier">Journalier</option>
              <option value="hebdomadaire">Hebdomadaire</option>
              <option value="mensuel">Mensuel</option>
            </select>
          </div>

          <button onClick={saveConfig}
            className="self-start px-6 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
            Sauvegarder les parametres
          </button>
        </div>
      )}
    </div>
  )
}
