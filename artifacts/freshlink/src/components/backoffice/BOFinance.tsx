"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import {
  store,
  type Actionnaire, type Charge, type CaisseEntry,
  type PeriodeDistribution, type CategorieCharge,
  type Salarie, type PaiementSalaire, type ReserveCaisseSnap,
  type StatutSalarie, type TypeContrat,
  type Client, type BonLivraison, type UserRole,
  CATEGORIE_CHARGE_LABELS, DELAI_RECOUVREMENT_LABELS,
} from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"
import BOChequesVirements from "@/components/backoffice/BOChequesVirements"

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => (Number(n) || 0).toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtMois = (s: string) => { const d = new Date((s ?? "") + "-01"); return isNaN(d.getTime()) ? String(s ?? "") : d.toLocaleDateString("fr-MA", { month: "long", year: "numeric" }) }

function KpiCard({ label, labelAr, value, sub, color }: { label: string; labelAr?: string; value: string; sub?: string; color: string }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
      {labelAr && <p className="text-[10px] text-muted-foreground" dir="rtl">{labelAr}</p>}
      <p className={`text-2xl font-extrabold font-sans ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

type FinanceTab = "synthese" | "caisse" | "actionnaires" | "charges" | "salaries" | "credit" | "cashman" | "cheques"

const DELAI_MS: Record<string, number> = {
  jour_meme:  0,
  "24h":      24 * 60 * 60 * 1000,
  "48h":      48 * 60 * 60 * 1000,
  "1_semaine":7 * 24 * 60 * 60 * 1000,
  "1_mois":   30 * 24 * 60 * 60 * 1000,
  a_definir:  Infinity,
}

const PERIODE_LABELS: Record<PeriodeDistribution, string> = {
  journalier: "Journaliere",
  hebdomadaire: "Hebdomadaire",
  mensuel: "Mensuelle",
}

const CONTRAT_LABELS: Record<TypeContrat, string> = {
  cdi: "CDI", cdd: "CDD", interim: "Intérim", saisonnier: "Saisonnier",
}

const STATUT_SAL_LABELS: Record<StatutSalarie, string> = {
  actif: "Actif", conge: "Congé", periode_essai: "Période essai", inactif: "Inactif",
}

const STATUT_SAL_COLORS: Record<StatutSalarie, string> = {
  actif: "bg-green-50 text-green-700 border-green-200",
  conge: "bg-amber-50 text-amber-700 border-amber-200",
  periode_essai: "bg-blue-50 text-blue-700 border-blue-200",
  inactif: "bg-muted text-muted-foreground border-border",
}

const TAB_DEF: { id: FinanceTab; label: string; labelAr: string; color: string }[] = [
  { id: "synthese",      label: "Synthese",       labelAr: "الملخص المالي",   color: "oklch(0.38 0.2 260)" },
  { id: "caisse",        label: "Caisse",          labelAr: "الصندوق",         color: "oklch(0.38 0.18 200)" },
  { id: "actionnaires",  label: "Actionnaires",    labelAr: "المساهمون",       color: "oklch(0.38 0.18 140)" },
  { id: "charges",       label: "Charges",         labelAr: "المصاريف",        color: "oklch(0.38 0.18 25)" },
  { id: "salaries",      label: "Salaries",        labelAr: "الأجراء",         color: "oklch(0.38 0.18 310)" },
  { id: "credit",        label: "Credit Client",   labelAr: "ائتمان العملاء",  color: "oklch(0.45 0.22 25)" },
  { id: "cashman",       label: "Cash Man",        labelAr: "تسيير النقد",     color: "oklch(0.38 0.18 155)" },
  { id: "cheques",       label: "Chèques & Virements", labelAr: "الشيكات والتحويلات", color: "oklch(0.42 0.15 195)" },
]

function getTauxCaisse(): number { return Number(localStorage.getItem("fl_taux_caisse") || "10") }
function saveTauxCaisse(t: number) { localStorage.setItem("fl_taux_caisse", String(t)) }

// ─────────────────────────────────────────────────────────────────────────────
export default function BOFinance({ user }: { user: { id: string; name: string; role: UserRole } }) {
  const [tab, setTab] = useState<FinanceTab>("synthese")
  const [actionnaires, setActionnaires] = useState<Actionnaire[]>([])
  const [charges, setCharges] = useState<Charge[]>([])
  const [caisse, setCaisse] = useState<CaisseEntry[]>([])
  const [salaries, setSalaries] = useState<Salarie[]>([])
  const [paiements, setPaiements] = useState<PaiementSalaire[]>([])
  const [reserveSnaps, setReserveSnaps] = useState<ReserveCaisseSnap[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [bls, setBls] = useState<BonLivraison[]>([])
  const [tauxCaisse, setTauxCaisse] = useState(10)
  const [saved, setSaved] = useState("")
  const isReadOnly = store.isReadOnly()
  // Credit payment form
  const [showCreditPaiForm, setShowCreditPaiForm] = useState(false)
  const [creditPaiClientId, setCreditPaiClientId] = useState("")
  const [creditPaiMontant, setCreditPaiMontant] = useState("")
  const [creditPaiNotes, setCreditPaiNotes] = useState("")
  // Credit filter
  const [creditFilter, setCreditFilter] = useState<"tous" | "alerte" | "retard" | "plafond">("tous")
  const [confirmResetCredit, setConfirmResetCredit] = useState(false)
  // Factures impayées (fl_invoices) → intégrées au crédit, comme BODashboard.tsx
  // (sinon un client à creditSolde=0 avec une facture "Impayée" n'apparaissait
  // jamais hors plafond ici alors qu'il l'était déjà sur le Dashboard).
  const [unpaidByClient, setUnpaidByClient] = useState<Record<string, number>>({})
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/sync-read?table=fl_invoices", { cache: "no-store" })
        const j = await res.json()
        const rows: { payload?: Record<string, unknown> }[] = j?.ok ? (j.data ?? []) : []
        const map: Record<string, number> = {}
        rows.forEach(r => {
          const p = r.payload ?? {}
          if (String(p.statut) !== "impayee") return
          const key = String(p.clientId || p.clientNom || "")
          if (!key) return
          const reste = Number(p.montantTTC ?? 0) - Number(p.montantPaye ?? 0)
          map[key] = (map[key] || 0) + (reste > 0 ? reste : 0)
        })
        setUnpaidByClient(map)
      } catch { /* offline */ }
    })()
  }, [])
  // CashMan date range
  const [cashFilter, setCashFilter] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    to: store.today(),
  })

  // Filters
  const todayMonth = store.today().slice(0, 7)
  const [periodFilter, setPeriodFilter] = useState({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    to: store.today(),
  })
  const [caisseFilter, setCaisseFilter] = useState({ mois: todayMonth, type: "" })

  // Actionnaire form
  const EMPTY_ACT: Omit<Actionnaire, "id"> = { nom: "", prenom: "", telephone: "", cotisation: 0, dateEntree: store.today(), periodeDistribution: "mensuel", actif: true }
  const [actForm, setActForm] = useState(EMPTY_ACT)
  const [editActId, setEditActId] = useState<string | null>(null)

  // Charge form
  const EMPTY_CHG: Omit<Charge, "id"> = { date: store.today(), libelle: "", categorie: "autre", montant: 0, recurrente: false, createdBy: user.id }
  const [chgForm, setChgForm] = useState(EMPTY_CHG)
  const [editChgId, setEditChgId] = useState<string | null>(null)
  const [showChgForm, setShowChgForm] = useState(false)

  // Caisse form
  const EMPTY_CAI: Omit<CaisseEntry, "id"> = { date: store.today(), libelle: "", type: "entree", categorie: "autre", montant: 0, createdBy: user.id }
  const [caiForm, setCaiForm] = useState(EMPTY_CAI)
  const [showCaiForm, setShowCaiForm] = useState(false)

  // Salarie form
  const EMPTY_SAL: Omit<Salarie, "id"> = { civilite: "M.", nom: "", prenom: "", poste: "", telephone: "", cin: "", cnss: "", dateEmbauche: store.today(), typeContrat: "cdi", salaireBrut: 0, avances: 0, statut: "actif", createdBy: "", createdAt: "" }
  const [salForm, setSalForm] = useState(EMPTY_SAL)
  const [editSalId, setEditSalId] = useState<string | null>(null)
  const [showSalForm, setShowSalForm] = useState(false)

  // Paiement salaire
  const [showPaiForm, setShowPaiForm] = useState(false)
  const [paiSalarieId, setPaiSalarieId] = useState("")
  const [paiMois, setPaiMois] = useState(todayMonth)
  const [paiAvance, setPaiAvance] = useState(0)

  // Reserve snap
  const [showReserveSnap, setShowReserveSnap] = useState(false)

  useEffect(() => {
    setActionnaires(store.getActionnaires())
    setCharges(store.getCharges())
    setCaisse(store.getCaisseEntries())
    setSalaries(store.getSalaries())
    setPaiements(store.getPaiementsSalaires())
    setReserveSnaps(store.getReserveSnaps())
    setClients(store.getVisibleClients())
    setBls(store.getVisibleBonsLivraison())
    setTauxCaisse(getTauxCaisse())
  }, [])

  const refresh = () => {
    setActionnaires(store.getActionnaires())
    setCharges(store.getCharges())
    setCaisse(store.getCaisseEntries())
    setSalaries(store.getSalaries())
    setPaiements(store.getPaiementsSalaires())
    setClients(store.getVisibleClients())
    setBls(store.getVisibleBonsLivraison())
    setReserveSnaps(store.getReserveSnaps())
  }

  const toast = (msg: string) => { setSaved(msg); setTimeout(() => setSaved(""), 3000) }

  // ── Finance calculations ──────────────────────────────────────────────────
  const synthese = useMemo(() => {
    const bonsAchat = store.getBonsAchat()
    const commandes = store.getVisibleCommandes()
    const inPeriod = (date: string) => date >= periodFilter.from && date <= periodFilter.to

    const totalAchat = bonsAchat
      .filter(b => inPeriod(b.date) && b.statut === "validé")
      .reduce((s, b) => s + b.lignes.reduce((ls, l) => ls + l.quantite * l.prixAchat, 0), 0)

    const totalVente = commandes
      .filter(c => inPeriod(c.date) && ["valide","livre","en_transit"].includes(c.statut))
      .reduce((s, c) => s + c.lignes.reduce((ls, l) => ls + l.quantite * l.prixVente, 0), 0)

    const marge = totalVente - totalAchat
    const margePct = totalVente > 0 ? (marge / totalVente) * 100 : 0
    const totalCharges = charges.filter(c => inPeriod(c.date)).reduce((s, c) => s + c.montant, 0)
    const totalSalaires = paiements.filter(p => p.datePaiement >= periodFilter.from && p.datePaiement <= periodFilter.to).reduce((s, p) => s + p.salaireNet, 0)
    const beneficeNet = marge - totalCharges - totalSalaires
    const totalCotisations = actionnaires.filter(a => a.actif).reduce((s, a) => s + a.cotisation, 0)
    const reserveCaisse = beneficeNet > 0 ? beneficeNet * (tauxCaisse / 100) : 0
    const beneficeDistribuable = beneficeNet - reserveCaisse

    return { totalAchat, totalVente, marge, margePct, totalCharges, totalSalaires, beneficeNet, totalCotisations, reserveCaisse, beneficeDistribuable }
  }, [periodFilter, charges, actionnaires, tauxCaisse, paiements])

  const distributions = useMemo(() => {
    const totalCot = actionnaires.filter(a => a.actif).reduce((s, a) => s + a.cotisation, 0)
    if (totalCot === 0) return []
    return actionnaires.filter(a => a.actif).map(a => {
      const part = (a.cotisation / totalCot) * 100
      const montant = synthese.beneficeDistribuable * (part / 100)
      return { ...a, part, montant }
    })
  }, [actionnaires, synthese.beneficeDistribuable])

  // ── Profitabilité par jour ────────────────────────────────────────────────
  const profitParJour = useMemo(() => {
    const bonsAchat = store.getBonsAchat()
    const commandes = store.getVisibleCommandes()
    const inPeriod = (date: string) => date >= periodFilter.from && date <= periodFilter.to

    // Group days that have activity
    const days = new Set<string>()
    commandes.filter(c => inPeriod(c.date)).forEach(c => days.add(c.date))
    bonsAchat.filter(b => inPeriod(b.date) && b.statut === "validé").forEach(b => days.add(b.date))

    const totalChargesPeriod = charges.filter(c => inPeriod(c.date)).reduce((s, c) => s + c.montant, 0)
    const nbJours = days.size || 1

    return Array.from(days).sort().map(day => {
      const ca = commandes
        .filter(c => c.date === day && ["valide", "livre", "en_transit"].includes(c.statut))
        .reduce((s, c) => s + c.lignes.reduce((ls, l) => ls + l.quantite * l.prixVente, 0), 0)
      const coutAchat = bonsAchat
        .filter(b => b.date === day && b.statut === "validé")
        .reduce((s, b) => s + b.lignes.reduce((ls, l) => ls + l.quantite * l.prixAchat, 0), 0)
      const chargesJour = totalChargesPeriod / nbJours
      const marge = ca - coutAchat
      const profit = marge - chargesJour
      const margePct = ca > 0 ? (marge / ca) * 100 : 0
      return { day, ca, coutAchat, chargesJour, marge, profit, margePct }
    })
  }, [periodFilter, charges])

  // ── Profitabilité par trip (BL) ───────────────────────────────────────────
  const profitParTrip = useMemo(() => {
    const inPeriod = (date: string) => date >= periodFilter.from && date <= periodFilter.to
    const commandes = store.getVisibleCommandes()
    const bonsAchat = store.getBonsAchat()

    const totalChargesPeriod = charges.filter(c => inPeriod(c.date)).reduce((s, c) => s + c.montant, 0)
    const nbBls = bls.filter(b => inPeriod(b.date)).length || 1

    return bls.filter(b => inPeriod(b.date)).map(bl => {
      // CA: the commande linked to this BL
      const blCmds = commandes.filter(c => c.id === bl.commandeId)
      const ca = blCmds.length > 0
        ? blCmds.reduce((s, c) => s + c.lignes.reduce((ls, l) => ls + l.quantite * l.prixVente, 0), 0)
        : bl.montantTotal
      // Coût achat: bons achat same day
      const coutAchat = bonsAchat
        .filter(b => b.date === bl.date && b.statut === "validé")
        .reduce((s, b) => s + b.lignes.reduce((ls, l) => ls + l.quantite * l.prixAchat, 0), 0) / nbBls
      const chargesTrip = totalChargesPeriod / nbBls
      const marge = ca - coutAchat
      const profit = marge - chargesTrip
      const margePct = ca > 0 ? (marge / ca) * 100 : 0
      return { bl, ca, coutAchat, chargesTrip, marge, profit, margePct, nbCommandes: blCmds.length }
    }).sort((a, b) => b.bl.date.localeCompare(a.bl.date))
  }, [periodFilter, bls, charges])

  // Caisse filtered
  const caisseFiltree = useMemo(() => caisse.filter(e => {
    const matchMois = !caisseFilter.mois || e.date.startsWith(caisseFilter.mois)
    const matchType = !caisseFilter.type || e.type === caisseFilter.type
    return matchMois && matchType
  }), [caisse, caisseFilter])

  const caisseBalance = useMemo(() => ({
    entrees: caisseFiltree.filter(e => e.type === "entree").reduce((s, e) => s + e.montant, 0),
    sorties: caisseFiltree.filter(e => e.type === "sortie").reduce((s, e) => s + e.montant, 0),
    total_entrees: caisse.filter(e => e.type === "entree").reduce((s, e) => s + e.montant, 0),
    total_sorties: caisse.filter(e => e.type === "sortie").reduce((s, e) => s + e.montant, 0),
  }), [caisse, caisseFiltree])

  // ── Auto-enregistrement encaissements ─────────────────────────────────────
  const autoSyncCaisse = () => {
    if (isReadOnly) { toast("Compte demo : lecture seule"); return }
    const actor = { ...user, role: user.role as UserRole }
    if (!hasPermission(actor.role, "valider_cash")) { logAction(actor, "valider_cash", "denied", { type: "caisse", label: "sync auto" }); return }
    logAction(actor, "valider_cash", "success", { type: "caisse", label: "sync auto" })
    const commandes = store.getVisibleCommandes().filter(c => c.statut === "livre")
    const existingRefs = new Set(caisse.filter(e => e.reference).map(e => e.reference!))
    let added = 0
    commandes.forEach(c => {
      const ref = `CMD-${c.id}`
      if (!existingRefs.has(ref)) {
        const montant = c.lignes.reduce((s, l) => s + l.quantite * l.prixVente, 0)
        store.addCaisseEntry({
          id: store.genId(), date: c.date, libelle: `Encaissement BL ${c.clientNom}`,
          type: "entree", categorie: "vente", montant, reference: ref, createdBy: user.id,
        })
        added++
      }
    })
    refresh()
    toast(added > 0 ? `${added} encaissement(s) enregistres automatiquement` : "Caisse deja a jour")
  }

  // ── Snapshot reserve caisse ───────────────────────────────────────────────
  const saveReserveSnap = () => {
    if (isReadOnly) { toast("Compte demo : lecture seule"); return }
    const periode = periodFilter.from.slice(0, 7)
    const totalCot = actionnaires.filter(a => a.actif).reduce((s, a) => s + a.cotisation, 0)
    const repartition = actionnaires.filter(a => a.actif).map(a => ({
      actionnaireId: a.id, nom: a.nom, prenom: a.prenom,
      part: totalCot > 0 ? (a.cotisation / totalCot) * 100 : 0,
      montant: totalCot > 0 ? synthese.reserveCaisse * (a.cotisation / totalCot) : 0,
    }))
    store.addReserveSnap({
      id: store.genId(), date: store.today(), periode,
      beneficeNet: synthese.beneficeNet, tauxReserve: tauxCaisse,
      montantReserve: synthese.reserveCaisse, repartition, createdBy: user.id,
    })
    refresh()
    toast("Historique reserve caisse sauvegarde")
    setShowReserveSnap(false)
  }

  // ── ACTIONNAIRE handlers ──────────────────────────────────────────────────
  const saveAct = () => {
    if (isReadOnly) { toast("Compte demo : lecture seule"); return }
    if (!actForm.nom || !actForm.prenom || actForm.cotisation <= 0) return
    if (editActId) store.updateActionnaire(editActId, actForm)
    else store.addActionnaire({ ...actForm, id: store.genId() })
    setActForm(EMPTY_ACT); setEditActId(null); refresh(); toast("Actionnaire sauvegarde")
  }
  const editAct = (a: Actionnaire) => {
    setActForm({ nom: a.nom, prenom: a.prenom, telephone: a.telephone || "", cotisation: a.cotisation, dateEntree: a.dateEntree, periodeDistribution: a.periodeDistribution, actif: a.actif })
    setEditActId(a.id)
  }

  // ── CHARGE handlers ───────────────────────────────────────────────────────
  const saveChg = () => {
    if (isReadOnly) { toast("Compte demo : lecture seule"); return }
    if (!chgForm.libelle || chgForm.montant <= 0) return
    // Contrôle caisse négative AVANT toute écriture — une charge nouvelle
    // implique une sortie caisse immédiate ; on ne veut jamais créer la
    // charge sans sa contrepartie caisse (état incohérent).
    if (!editChgId && store.getCaisseSolde() - chgForm.montant < 0) {
      toast(`Solde caisse insuffisant (${store.getCaisseSolde().toFixed(2)} DH) pour cette sortie de ${chgForm.montant.toFixed(2)} DH.`)
      return
    }
    if (editChgId) store.updateCharge(editChgId, chgForm)
    else store.addCharge({ ...chgForm, id: store.genId() })
    // Auto-ajout en caisse sortie
    if (!editChgId) {
      store.addCaisseEntry({ id: store.genId(), date: chgForm.date, libelle: chgForm.libelle, type: "sortie", categorie: "charge", montant: chgForm.montant, createdBy: user.id })
    }
    setChgForm(EMPTY_CHG); setEditChgId(null); setShowChgForm(false); refresh()
  }

  // ── CAISSE handlers ───────────────────────────────────────────────────────
  const saveCai = () => {
    if (isReadOnly) { toast("Compte demo : lecture seule"); return }
    if (!caiForm.libelle || caiForm.montant <= 0) return
    const r = store.addCaisseEntry({ ...caiForm, id: store.genId() })
    if (!r.ok) { toast(r.error ?? "Caisse insuffisante"); return }
    setCaiForm(EMPTY_CAI); setShowCaiForm(false); refresh()
  }

  // ── SALARIE handlers ──────────────────────────────────────────────────────
  const saveSal = () => {
    if (isReadOnly) { toast("Compte demo : lecture seule"); return }
    if (!salForm.nom || !salForm.prenom || !salForm.poste || salForm.salaireBrut <= 0) return
    if (editSalId) store.updateSalarie(editSalId, salForm)
    else store.addSalarie({ ...salForm, id: store.genId() })
    setSalForm(EMPTY_SAL); setEditSalId(null); setShowSalForm(false); refresh(); toast("Salarie sauvegarde")
  }

  const payerSalaire = () => {
    if (isReadOnly) { toast("Compte demo : lecture seule"); return }
    const sal = salaries.find(s => s.id === paiSalarieId)
    if (!sal || !paiMois) return
    const salaireNet = sal.salaireBrut - paiAvance
    if (store.getCaisseSolde() - salaireNet < 0) {
      toast(`Solde caisse insuffisant (${store.getCaisseSolde().toFixed(2)} DH) pour ce salaire de ${salaireNet.toFixed(2)} DH.`)
      return
    }
    const p: PaiementSalaire = {
      id: store.genId(), salarieId: sal.id, salarieNom: `${sal.prenom} ${sal.nom}`,
      mois: paiMois, salaireBrut: sal.salaireBrut, avance: paiAvance, salaireNet,
      datePaiement: store.today(), createdBy: user.id,
    }
    store.addPaiementSalaire(p)
    // Auto caisse sortie
    store.addCaisseEntry({
      id: store.genId(), date: store.today(), libelle: `Salaire ${sal.prenom} ${sal.nom} - ${fmtMois(paiMois)}`,
      type: "sortie", categorie: "salaire", montant: salaireNet, createdBy: user.id,
    })
    setShowPaiForm(false); setPaiSalarieId(""); setPaiAvance(0); refresh(); toast("Salaire verse et caisse mise a jour")
  }

  const activeColor = (id: FinanceTab) => TAB_DEF.find(t => t.id === id)?.color || "#000"

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      {/* Read-only banner */}
      {isReadOnly && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          Compte demo : consultation uniquement. Aucune modification n&apos;est enregistree.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-2xl bg-muted overflow-x-auto">
        {TAB_DEF.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 min-w-max px-4 py-2.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap"
            style={tab === t.id ? { background: t.color, color: "#fff" } : { color: "var(--muted-foreground)" }}>
            <span>{t.label}</span>
            <span className="block text-[9px] opacity-70" dir="rtl">{t.labelAr}</span>
          </button>
        ))}
      </div>

      {saved && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {saved}
        </div>
      )}

      {/* ═══════════════════════════════════════════════ SYNTHESE */}
      {tab === "synthese" && (
        <div className="flex flex-col gap-5">
          {/* Period filter + taux */}
          <div className="bg-card rounded-2xl border border-border p-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-muted-foreground">Periode :</span>
            <div className="flex items-center gap-2">
              <input type="date" value={periodFilter.from} onChange={e => setPeriodFilter(p => ({ ...p, from: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <span className="text-muted-foreground">→</span>
              <input type="date" value={periodFilter.to} onChange={e => setPeriodFilter(p => ({ ...p, to: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <label className="text-xs font-semibold text-muted-foreground">Reserve caisse :</label>
              <input type="number" min={0} max={100} value={tauxCaisse}
                onChange={e => { const v = Number(e.target.value); setTauxCaisse(v); saveTauxCaisse(v) }}
                className="w-16 px-2 py-1.5 rounded-lg border border-border bg-background text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
              <span className="text-sm font-bold">%</span>
            </div>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Total Achat" labelAr="إجمالي الشراء" value={`${fmt(synthese.totalAchat)} DH`} color="text-red-600" sub="Bons achat valides" />
            <KpiCard label="Total Vente" labelAr="إجمالي المبيعات" value={`${fmt(synthese.totalVente)} DH`} color="text-blue-600" sub="Commandes livrees" />
            <KpiCard label="Marge brute" labelAr="هامش الربح" value={`${fmt(synthese.marge)} DH`} sub={`${synthese.margePct.toFixed(1)}% du CA`} color={synthese.marge >= 0 ? "text-green-600" : "text-red-600"} />
            <KpiCard label="Charges + Salaires" labelAr="المصاريف والأجور" value={`${fmt(synthese.totalCharges + synthese.totalSalaires)} DH`} color="text-orange-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* P&L */}
            <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
              <h3 className="font-bold text-sm">Compte de resultat / حساب النتائج</h3>
              {[
                { label: "Chiffre d'affaires (ventes)", value: synthese.totalVente, color: "text-blue-700" },
                { label: "Couts des achats", value: -synthese.totalAchat, color: "text-red-600" },
                { label: "Marge brute", value: synthese.marge, color: "text-blue-600", border: true },
                { label: "Charges d'exploitation", value: -synthese.totalCharges, color: "text-orange-600" },
                { label: "Masse salariale", value: -synthese.totalSalaires, color: "text-purple-600" },
                { label: "Benefice net", value: synthese.beneficeNet, color: synthese.beneficeNet >= 0 ? "text-green-700" : "text-red-700", border: true, bold: true },
                { label: `Reserve caisse (${tauxCaisse}%)`, value: -synthese.reserveCaisse, color: "text-amber-600" },
                { label: "Benefice distribuable", value: synthese.beneficeDistribuable, color: "text-emerald-700", border: true, bold: true },
              ].map(row => (
                <div key={row.label} className={`flex justify-between items-center ${row.border ? "pt-2 border-t border-border" : ""}`}>
                  <span className={`text-sm ${row.bold ? "font-bold text-foreground" : "text-muted-foreground"}`}>{row.label}</span>
                  <span className={`text-sm font-bold font-mono ${row.color}`}>{row.value >= 0 ? "+" : ""}{fmt(row.value)} DH</span>
                </div>
              ))}
            </div>

            {/* Distribution par actionnaire */}
            <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">Distribution / توزيع الارباح</h3>
                <button onClick={() => setShowReserveSnap(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors font-medium">
                  Sauvegarder snapshot
                </button>
              </div>
              {distributions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun actionnaire actif.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {distributions.map(d => (
                    <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ background: "oklch(0.38 0.18 140)" }}>{d.prenom[0]}{d.nom[0]}</div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{d.prenom} {d.nom}</p>
                        <p className="text-xs text-muted-foreground">{d.part.toFixed(1)}% — {PERIODE_LABELS[d.periodeDistribution]}</p>
                      </div>
                      <p className="font-bold text-emerald-700 font-mono text-sm shrink-0">{fmt(d.montant)} DH</p>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-border">
                    <span className="text-sm font-semibold">Total</span>
                    <span className="font-bold text-emerald-700 font-mono">{fmt(distributions.reduce((s, d) => s + d.montant, 0))} DH</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Snapshot modal */}
          {showReserveSnap && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-md mx-4 shadow-xl">
                <h3 className="font-bold text-sm mb-3">Sauvegarder la reserve caisse</h3>
                <p className="text-xs text-muted-foreground mb-4">Cela enregistre un historique de la reserve et de la repartition par actionnaire pour la periode <strong>{periodFilter.from} → {periodFilter.to}</strong>.</p>
                <div className="bg-muted/40 rounded-xl p-3 text-sm mb-4">
                  <div className="flex justify-between"><span>Benefice net :</span><span className="font-bold">{fmt(synthese.beneficeNet)} DH</span></div>
                  <div className="flex justify-between"><span>Taux reserve ({tauxCaisse}%) :</span><span className="font-bold text-amber-600">{fmt(synthese.reserveCaisse)} DH</span></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveReserveSnap} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "oklch(0.38 0.2 260)" }}>Confirmer et sauvegarder</button>
                  <button onClick={() => setShowReserveSnap(false)} className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">Annuler</button>
                </div>
              </div>
            </div>
          )}

          {/* Repartition charges */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="font-bold text-sm mb-4">Repartition des charges / توزيع المصاريف</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Object.entries(CATEGORIE_CHARGE_LABELS).map(([cat, label]) => {
                const total = charges.filter(c => c.categorie === cat && c.date >= periodFilter.from && c.date <= periodFilter.to).reduce((s, c) => s + c.montant, 0)
                if (total === 0) return null
                return (
                  <div key={cat} className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">{label.split("(")[0].trim()}</p>
                    <p className="font-bold text-sm mt-1 font-mono">{fmt(total)} DH</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Profitabilité par jour ── */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="font-bold text-sm mb-1">Rentabilite par jour / الربحية اليومية</h3>
            <p className="text-xs text-muted-foreground mb-4">Les charges sont reparties equitablement sur le nombre de jours actifs de la periode.</p>
            {profitParJour.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune activite dans la periode selectionnee.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-sans">
                  <thead className="bg-muted">
                    <tr>
                      {["Date", "CA", "Coût achat", "Marge brute", "Charges/j", "Profit net", "Marge%"].map(h => (
                        <th key={h} className={`px-3 py-2.5 font-semibold text-muted-foreground ${h === "Date" ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profitParJour.map(row => (
                      <tr key={row.day} className="border-t border-border hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2.5 font-semibold text-foreground">{row.day}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-600 font-semibold">{fmt(row.ca)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-red-600">{fmt(row.coutAchat)}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold ${row.marge >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(row.marge)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-orange-600">{fmt(row.chargesJour)}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold ${row.profit >= 0 ? "text-green-700" : "text-red-700"}`}>
                          {row.profit >= 0 ? "+" : ""}{fmt(row.profit)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-bold ${row.margePct >= 25 ? "text-green-600" : row.margePct >= 15 ? "text-amber-600" : "text-red-600"}`}>
                          {row.margePct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/30 font-bold">
                      <td className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Total</td>
                      <td className="px-3 py-2.5 text-right font-mono text-blue-700 font-bold">{fmt(profitParJour.reduce((s, r) => s + r.ca, 0))}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-red-700 font-bold">{fmt(profitParJour.reduce((s, r) => s + r.coutAchat, 0))}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-emerald-700 font-bold">{fmt(profitParJour.reduce((s, r) => s + r.marge, 0))}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-orange-700">{fmt(profitParJour.reduce((s, r) => s + r.chargesJour, 0))}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-green-800">{fmt(profitParJour.reduce((s, r) => s + r.profit, 0))}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Profitabilité par trip ── */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="font-bold text-sm mb-1">Rentabilite par trip (BL) / الربحية حسب الرحلة</h3>
            <p className="text-xs text-muted-foreground mb-4">Chaque bon de livraison = 1 trip. Les charges et achats sont repartis proportionnellement.</p>
            {profitParTrip.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun bon de livraison dans la periode selectionnee.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs font-sans">
                  <thead className="bg-muted">
                    <tr>
                      {["BL", "Date", "Livreur", "Cmds", "CA", "Coût achat", "Marge brute", "Charges/trip", "Profit net", "Marge%"].map(h => (
                        <th key={h} className={`px-3 py-2.5 font-semibold text-muted-foreground ${["BL", "Date", "Livreur"].includes(h) ? "text-left" : "text-right"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profitParTrip.map(row => (
                      <tr key={row.bl.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2.5 font-mono text-muted-foreground">{row.bl.id.slice(0, 8)}</td>
                        <td className="px-3 py-2.5 font-semibold text-foreground">{row.bl.date}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{row.bl.livreurNom ?? "—"}</td>
                        <td className="px-3 py-2.5 text-right font-semibold">{row.nbCommandes}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-600 font-semibold">{fmt(row.ca)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-red-600">{fmt(row.coutAchat)}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold ${row.marge >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(row.marge)}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-orange-600">{fmt(row.chargesTrip)}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold ${row.profit >= 0 ? "text-green-700" : "text-red-700"}`}>
                          {row.profit >= 0 ? "+" : ""}{fmt(row.profit)}
                        </td>
                        <td className={`px-3 py-2.5 text-right font-bold ${row.margePct >= 25 ? "text-green-600" : row.margePct >= 15 ? "text-amber-600" : "text-red-600"}`}>
                          {row.margePct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ CAISSE */}
      {tab === "caisse" && (
        <div className="flex flex-col gap-4">
          {/* KPIs totaux */}
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Entrees totales" labelAr="مجموع الدخول" value={`${fmt(caisseBalance.total_entrees)} DH`} color="text-green-600" />
            <KpiCard label="Sorties totales" labelAr="مجموع الخروج" value={`${fmt(caisseBalance.total_sorties)} DH`} color="text-red-600" />
            <KpiCard label="Solde caisse" labelAr="رصيد الصندوق" value={`${fmt(caisseBalance.total_entrees - caisseBalance.total_sorties)} DH`}
              color={(caisseBalance.total_entrees - caisseBalance.total_sorties) >= 0 ? "text-blue-700" : "text-red-700"} />
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={autoSyncCaisse}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: "oklch(0.38 0.18 140)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Sync encaissements auto
            </button>
            <button onClick={() => setShowCaiForm(!showCaiForm)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: "oklch(0.38 0.18 200)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Mouvement manuel
            </button>
            <div className="flex items-center gap-2 ml-auto">
              <input type="month" value={caisseFilter.mois} onChange={e => setCaisseFilter(f => ({ ...f, mois: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none" />
              <select value={caisseFilter.type} onChange={e => setCaisseFilter(f => ({ ...f, type: e.target.value }))}
                className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none">
                <option value="">Tous types</option>
                <option value="entree">Entrees</option>
                <option value="sortie">Sorties</option>
              </select>
            </div>
          </div>

          {/* Form mouvement manuel */}
          {showCaiForm && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <h4 className="font-semibold text-sm mb-4">Nouveau mouvement</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { label: "Type", el: <select value={caiForm.type} onChange={e => setCaiForm(f => ({ ...f, type: e.target.value as "entree"|"sortie" }))} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none"><option value="entree">Entree (+)</option><option value="sortie">Sortie (-)</option></select> },
                  { label: "Categorie", el: <select value={caiForm.categorie} onChange={e => setCaiForm(f => ({ ...f, categorie: e.target.value as CaisseEntry["categorie"] }))} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none"><option value="vente">Vente</option><option value="achat">Achat</option><option value="charge">Charge</option><option value="salaire">Salaire</option><option value="distribution_actionnaire">Distribution actionnaire</option><option value="reserve_caisse">Reserve caisse</option><option value="autre">Autre</option></select> },
                  { label: "Date", el: <input type="date" value={caiForm.date} onChange={e => setCaiForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" /> },
                ].map(({ label, el }) => (
                  <div key={label} className="flex flex-col gap-1"><label className="text-xs font-semibold">{label}</label>{el}</div>
                ))}
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-xs font-semibold">Libelle</label>
                  <input value={caiForm.libelle} onChange={e => setCaiForm(f => ({ ...f, libelle: e.target.value }))}
                    placeholder="Description du mouvement..."
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold">Montant (DH)</label>
                  <input type="number" min={0} value={caiForm.montant} onChange={e => setCaiForm(f => ({ ...f, montant: Number(e.target.value) }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={saveCai} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "oklch(0.38 0.18 200)" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Enregistrer
                </button>
                <button onClick={() => setShowCaiForm(false)} className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">Annuler</button>
              </div>
            </div>
          )}

          {/* KPIs periode filtree */}
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label={`Entrees (${caisseFilter.mois || "tout"})`} labelAr="الدخول" value={`${fmt(caisseBalance.entrees)} DH`} color="text-green-600" />
            <KpiCard label={`Sorties (${caisseFilter.mois || "tout"})`} labelAr="الخروج" value={`${fmt(caisseBalance.sorties)} DH`} color="text-red-600" />
            <KpiCard label="Solde periode" labelAr="رصيد الفترة" value={`${fmt(caisseBalance.entrees - caisseBalance.sorties)} DH`} color={(caisseBalance.entrees - caisseBalance.sorties) >= 0 ? "text-blue-700" : "text-red-700"} />
          </div>

          {/* Historique mouvements */}
          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h4 className="font-semibold text-sm">Historique des mouvements ({caisseFiltree.length})</h4>
            </div>
            {caisseFiltree.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Aucun mouvement pour cette periode.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr style={{ background: "oklch(0.14 0.03 260)" }}>
                    {["Date","Libelle","Categorie","Entree","Sortie"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "oklch(0.88 0.015 245)" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {[...caisseFiltree].sort((a, b) => b.date.localeCompare(a.date)).map((e, idx) => (
                      <tr key={e.id} className={`border-t border-border ${idx % 2 === 0 ? "" : "bg-muted/20"}`}>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{e.date}</td>
                        <td className="px-4 py-3 font-medium text-foreground max-w-xs truncate">{e.libelle}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${e.type === "entree" ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                            {e.categorie.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold font-mono text-green-600">{e.type === "entree" ? `+${fmt(e.montant)}` : ""}</td>
                        <td className="px-4 py-3 font-bold font-mono text-red-600">{e.type === "sortie" ? `-${fmt(e.montant)}` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ ACTIONNAIRES */}
      {tab === "actionnaires" && (
        <div className="flex flex-col gap-4">
          {/* Form */}
          <div className="bg-card rounded-2xl border border-border p-5">
            <h3 className="font-semibold text-sm mb-4">{editActId ? "Modifier" : "Ajouter un actionnaire / إضافة مساهم"}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[{ f: "prenom", label: "Prenom", ph: "Mohammed" }, { f: "nom", label: "Nom", ph: "Benali" }, { f: "telephone", label: "Telephone", ph: "0661234567" }].map(({ f, label, ph }) => (
                <div key={f} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold">{label}</label>
                  <input value={(actForm as Record<string, string|number|boolean>)[f] as string}
                    onChange={e => setActForm(a => ({ ...a, [f]: e.target.value }))} placeholder={ph}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              ))}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">Cotisation (DH)</label>
                <input type="number" min={0} value={actForm.cotisation} onChange={e => setActForm(a => ({ ...a, cotisation: Number(e.target.value) }))}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">Date d&apos;entree</label>
                <input type="date" value={actForm.dateEntree} onChange={e => setActForm(a => ({ ...a, dateEntree: e.target.value }))}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold">Periode de distribution</label>
                <select value={actForm.periodeDistribution} onChange={e => setActForm(a => ({ ...a, periodeDistribution: e.target.value as PeriodeDistribution }))}
                  className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                  {Object.entries(PERIODE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveAct} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "oklch(0.38 0.18 140)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {editActId ? "Sauvegarder" : "Ajouter"}
              </button>
              {editActId && <button onClick={() => { setActForm(EMPTY_ACT); setEditActId(null) }} className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">Annuler</button>}
            </div>
          </div>

          {/* Table actionnaires */}
          {actionnaires.length > 0 && (
            <div className="bg-card rounded-2xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr style={{ background: "oklch(0.14 0.03 260)" }}>
                  {["Actionnaire","Cotisation","% Parts","Periode","Distribution estimee","Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: "oklch(0.88 0.015 245)" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {(() => {
                    const tot = actionnaires.filter(a => a.actif).reduce((s, a) => s + a.cotisation, 0)
                    return actionnaires.map(a => {
                      const part = tot > 0 ? (a.cotisation / tot) * 100 : 0
                      const dist = synthese.beneficeDistribuable * (part / 100)
                      return (
                        <tr key={a.id} className="border-t border-border hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: "oklch(0.38 0.18 140)" }}>{a.prenom[0]}{a.nom[0]}</div>
                              <div><p className="font-semibold">{a.prenom} {a.nom}</p>{a.telephone && <p className="text-xs text-muted-foreground">{a.telephone}</p>}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold text-blue-700">{fmt(a.cotisation)} DH</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full" style={{ width: `${part}%`, background: "oklch(0.38 0.18 140)" }} /></div>
                              <span className="text-xs font-mono font-bold">{part.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{PERIODE_LABELS[a.periodeDistribution]}</td>
                          <td className="px-4 py-3 font-bold font-mono text-emerald-700">{fmt(dist)} DH</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              <button onClick={() => editAct(a)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                              <button onClick={() => { store.deleteActionnaire(a.id); refresh() }} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          )}

          {/* Historique reserve caisse */}
          {reserveSnaps.length > 0 && (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border"><h4 className="font-semibold text-sm">Historique reserve caisse / سجل احتياطي الصندوق</h4></div>
              <div className="flex flex-col divide-y divide-border">
                {reserveSnaps.map(snap => (
                  <div key={snap.id} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-sm">{fmtMois(snap.periode)}</p>
                        <p className="text-xs text-muted-foreground">Sauvegarde le {snap.date} — Taux: {snap.tauxReserve}%</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-amber-600 font-mono">{fmt(snap.montantReserve)} DH</p>
                        <p className="text-xs text-muted-foreground">sur {fmt(snap.beneficeNet)} DH net</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {snap.repartition.map(r => (
                        <div key={r.actionnaireId} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted text-xs">
                          <span className="font-semibold">{r.prenom} {r.nom}</span>
                          <span className="text-muted-foreground">{r.part.toFixed(1)}%</span>
                          <span className="font-mono font-bold text-amber-700">{fmt(r.montant)} DH</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════ CHARGES */}
      {tab === "charges" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Charges / المصاريف</h3>
            <button onClick={() => { setShowChgForm(!showChgForm); setChgForm(EMPTY_CHG); setEditChgId(null) }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: "oklch(0.38 0.18 25)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Nouvelle charge
            </button>
          </div>

          {showChgForm && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <h4 className="font-semibold text-sm mb-4">{editChgId ? "Modifier" : "Nouvelle charge"}</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="flex flex-col gap-1 lg:col-span-2">
                  <label className="text-xs font-semibold">Description</label>
                  <input value={chgForm.libelle} onChange={e => setChgForm(f => ({ ...f, libelle: e.target.value }))}
                    placeholder="Ex: Location camion Honda 3T, balance electronique..."
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold">Categorie</label>
                  <select value={chgForm.categorie} onChange={e => setChgForm(f => ({ ...f, categorie: e.target.value as CategorieCharge }))}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                    {Object.entries(CATEGORIE_CHARGE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold">Montant (DH)</label>
                  <input type="number" min={0} value={chgForm.montant} onChange={e => setChgForm(f => ({ ...f, montant: Number(e.target.value) }))}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold">Date</label>
                  <input type="date" value={chgForm.date} onChange={e => setChgForm(f => ({ ...f, date: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1 justify-end">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={chgForm.recurrente} onChange={e => setChgForm(f => ({ ...f, recurrente: e.target.checked }))} className="w-4 h-4 rounded" />
                    <span className="text-sm">Charge recurrente (mensuelle)</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={saveChg} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "oklch(0.38 0.18 25)" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Enregistrer
                </button>
                <button onClick={() => { setShowChgForm(false); setEditChgId(null) }} className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">Annuler</button>
              </div>
            </div>
          )}

          {charges.length === 0 ? (
            <div className="bg-muted/40 rounded-2xl p-8 text-center text-muted-foreground text-sm">Aucune charge enregistree.</div>
          ) : (
            <div className="bg-card rounded-2xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr style={{ background: "oklch(0.14 0.03 260)" }}>
                  {["Date","Description","Categorie","Montant","Type","Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "oklch(0.88 0.015 245)" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {[...charges].sort((a, b) => b.date.localeCompare(a.date)).map(c => (
                    <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{c.date}</td>
                      <td className="px-4 py-3 font-medium">{c.libelle}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-orange-50 text-orange-700 border border-orange-200">{CATEGORIE_CHARGE_LABELS[c.categorie].split("(")[0].trim()}</span></td>
                      <td className="px-4 py-3 font-bold font-mono text-red-600">{fmt(c.montant)} DH</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border ${c.recurrente ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-muted text-muted-foreground border-border"}`}>{c.recurrente ? "Mensuelle" : "Ponctuelle"}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setChgForm({ date: c.date, libelle: c.libelle, categorie: c.categorie, montant: c.montant, recurrente: c.recurrente, createdBy: c.createdBy }); setEditChgId(c.id); setShowChgForm(true) }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                          <button onClick={() => { store.deleteCharge(c.id); refresh() }} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(() => {
            // Séparation claire FIXE (récurrente) vs VARIABLE (ponctuelle) + lien RH
            const fixesFinance = charges.filter(c => c.recurrente).reduce((s, c) => s + c.montant, 0)
            const variables = charges.filter(c => !c.recurrente).reduce((s, c) => s + c.montant, 0)
            let rhFixes = 0
            try {
              const cf = JSON.parse(localStorage.getItem("fl_charges_fixes") ?? "{}") as Record<string, unknown>
              rhFixes = (Object.values(cf) as unknown[]).reduce<number>((s, v) => s + (Number(v) || 0), 0)
            } catch { /* noop */ }
            return (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard label="Charges fixes (récurrentes)" value={`${fmt(fixesFinance)} DH`} color="text-orange-600" />
                  <KpiCard label="Charges variables (ponctuelles)" value={`${fmt(variables)} DH`} color="text-slate-600" />
                  <KpiCard label="Charges fixes RH / mois" value={`${fmt(rhFixes)} DH`} color="text-violet-600" />
                  <KpiCard label="Total charges fixes / mois" value={`${fmt(fixesFinance + rhFixes)} DH`} color="text-red-600" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  💡 Les <strong>charges fixes RH</strong> (loyer, assurances, téléphonie…) sont définies dans <strong>Comptabilité RH → Charges fixes mensuelles</strong> et reportées ici automatiquement. Les charges <strong>fixes</strong> (case « récurrente ») et <strong>variables</strong> sont séparées ci-dessus.
                </p>
              </div>
            )
          })()}

          {/* ── Analyse des charges : jour / mois / tonnage / catégorie ── */}
          {(() => {
            const chargesPeriod = charges.filter(c => c.date >= periodFilter.from && c.date <= periodFilter.to)
            const totalPeriod = chargesPeriod.reduce((s, c) => s + c.montant, 0)

            const byJour = new Map<string, number>()
            chargesPeriod.forEach(c => byJour.set(c.date, (byJour.get(c.date) ?? 0) + c.montant))
            const joursTries = [...byJour.entries()].sort((a, b) => b[0].localeCompare(a[0]))

            const byMois = new Map<string, number>()
            chargesPeriod.forEach(c => { const m = c.date.slice(0, 7); byMois.set(m, (byMois.get(m) ?? 0) + c.montant) })
            const moisTries = [...byMois.entries()].sort((a, b) => b[0].localeCompare(a[0]))

            // Tonnage retenu = commandes livrées (kg) sur la même période — cohérent
            // avec le CA utilisé ailleurs dans Finance (isolation par équipe incluse).
            const commandesLivrees = store.getVisibleCommandes().filter(c => c.statut === "livre" && c.date >= periodFilter.from && c.date <= periodFilter.to)
            const tonnageKg = commandesLivrees.reduce((s, c) => s + c.lignes.reduce((t, l) => t + l.quantite, 0), 0)
            const coutParKg = tonnageKg > 0 ? totalPeriod / tonnageKg : 0

            const byCategorie = Object.entries(CATEGORIE_CHARGE_LABELS)
              .map(([cat, label]) => ({ cat, label, total: chargesPeriod.filter(c => c.categorie === cat).reduce((s, c) => s + c.montant, 0) }))
              .filter(x => x.total > 0)
              .sort((a, b) => b.total - a.total)

            return (
              <div className="flex flex-col gap-4">
                <h3 className="font-bold text-sm">Analyse des charges — {periodFilter.from} → {periodFilter.to}</h3>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard label="Total charges (période)" value={`${fmt(totalPeriod)} DH`} color="text-red-600" />
                  <KpiCard label="Tonnage livré (période)" value={`${(tonnageKg / 1000).toFixed(2)} T`} color="text-blue-600" />
                  <KpiCard label="Coût charge / kg" value={`${coutParKg.toFixed(2)} DH`} color="text-orange-600" />
                  <KpiCard label="Coût charge / tonne" value={`${fmt(coutParKg * 1000)} DH`} color="text-orange-600" />
                </div>

                <div className="grid lg:grid-cols-2 gap-4">
                  <div className="bg-card rounded-2xl border border-border p-4">
                    <h4 className="font-semibold text-sm mb-3">Charges par jour</h4>
                    {joursTries.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucune charge sur la période.</p>
                    ) : (
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                          <tbody>
                            {joursTries.map(([day, montant]) => (
                              <tr key={day} className="border-t border-border/50 first:border-0">
                                <td className="py-1.5 text-muted-foreground">{day}</td>
                                <td className="py-1.5 text-right font-mono font-semibold">{fmt(montant)} DH</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="bg-card rounded-2xl border border-border p-4">
                    <h4 className="font-semibold text-sm mb-3">Charges par mois</h4>
                    {moisTries.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Aucune charge sur la période.</p>
                    ) : (
                      <table className="w-full text-xs">
                        <tbody>
                          {moisTries.map(([mois, montant]) => (
                            <tr key={mois} className="border-t border-border/50 first:border-0">
                              <td className="py-1.5 text-muted-foreground">{mois}</td>
                              <td className="py-1.5 text-right font-mono font-semibold">{fmt(montant)} DH</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                <div className="bg-card rounded-2xl border border-border p-4">
                  <h4 className="font-semibold text-sm mb-3">Charges par catégorie</h4>
                  {byCategorie.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Aucune charge sur la période.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {byCategorie.map(({ cat, label, total }) => (
                        <div key={cat} className="rounded-xl border border-border p-3">
                          <p className="text-xs text-muted-foreground">{label.split("(")[0].trim()}</p>
                          <p className="font-bold text-sm mt-1 font-mono">{fmt(total)} DH</p>
                          <p className="text-[10px] text-muted-foreground">{totalPeriod > 0 ? ((total / totalPeriod) * 100).toFixed(1) : 0}%</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground">
                  💡 Le tonnage retenu correspond aux commandes livrées (statut « livré ») sur la période sélectionnée plus haut (filtre de période). Le coût par kg/tonne rapporte le total des charges de la période au tonnage effectivement livré.
                </p>
              </div>
            )
          })()}
        </div>
      )}

      {/* ═══════════════════════════════════════════════ SALARIES */}
      {tab === "salaries" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <h3 className="font-semibold">Salaries / الأجراء</h3>
            <div className="flex gap-2">
              <button onClick={() => { setShowPaiForm(!showPaiForm); setShowSalForm(false) }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-border hover:bg-muted">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                Verser un salaire
              </button>
              <button onClick={() => { setShowSalForm(!showSalForm); setSalForm(EMPTY_SAL); setEditSalId(null); setShowPaiForm(false) }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: "oklch(0.38 0.18 310)" }}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Nouveau salarie
              </button>
            </div>
          </div>

          {/* Form paiement salaire */}
          {showPaiForm && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <h4 className="font-semibold text-sm mb-4">Verser un salaire / صرف الراتب</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold">Salarie</label>
                  <select value={paiSalarieId} onChange={e => { setPaiSalarieId(e.target.value); const s = salaries.find(s => s.id === e.target.value); setPaiAvance(s?.avances || 0) }}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                    <option value="">-- Choisir --</option>
                    {salaries.filter(s => s.statut === "actif").map(s => <option key={s.id} value={s.id}>{s.prenom} {s.nom} — {fmt(s.salaireBrut)} DH</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold">Mois</label>
                  <input type="month" value={paiMois} onChange={e => setPaiMois(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold">Avance a deduire (DH)</label>
                  <input type="number" min={0} value={paiAvance} onChange={e => setPaiAvance(Number(e.target.value))}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1 justify-end">
                  {paiSalarieId && (
                    <div className="px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold font-mono text-sm">
                      Net: {fmt((salaries.find(s => s.id === paiSalarieId)?.salaireBrut || 0) - paiAvance)} DH
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={payerSalaire} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "oklch(0.38 0.18 310)" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Valider le paiement
                </button>
                <button onClick={() => setShowPaiForm(false)} className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">Annuler</button>
              </div>
            </div>
          )}

          {/* Form salarie */}
          {showSalForm && (
            <div className="bg-card rounded-2xl border border-border p-5">
              <h4 className="font-semibold text-sm mb-4">{editSalId ? "Modifier le salarie" : "Nouveau salarie / موظف جديد"}</h4>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[{ f: "prenom", label: "Prenom", ph: "Mohammed" }, { f: "nom", label: "Nom", ph: "Benali" }, { f: "poste", label: "Poste", ph: "Magasinier, Livreur..." }, { f: "telephone", label: "Telephone", ph: "0661234567" }, { f: "cin", label: "CIN", ph: "AB123456" }, { f: "cnss", label: "N° CNSS", ph: "1234567" }].map(({ f, label, ph }) => (
                  <div key={f} className="flex flex-col gap-1">
                    <label className="text-xs font-semibold">{label}</label>
                    <input value={(salForm as unknown as Record<string, string|number>)[f] as string}
                      onChange={e => setSalForm(a => ({ ...a, [f]: e.target.value }))} placeholder={ph}
                      className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                ))}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold">Date embauche</label>
                  <input type="date" value={salForm.dateEmbauche} onChange={e => setSalForm(a => ({ ...a, dateEmbauche: e.target.value }))}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold">Type contrat</label>
                  <select value={salForm.typeContrat} onChange={e => setSalForm(a => ({ ...a, typeContrat: e.target.value as TypeContrat }))}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                    {Object.entries(CONTRAT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold">Salaire brut (DH)</label>
                  <input type="number" min={0} value={salForm.salaireBrut} onChange={e => setSalForm(a => ({ ...a, salaireBrut: Number(e.target.value) }))}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold">Avances en cours (DH)</label>
                  <input type="number" min={0} value={salForm.avances} onChange={e => setSalForm(a => ({ ...a, avances: Number(e.target.value) }))}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold">Statut</label>
                  <select value={salForm.statut} onChange={e => setSalForm(a => ({ ...a, statut: e.target.value as StatutSalarie }))}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none">
                    {Object.entries(STATUT_SAL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={saveSal} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: "oklch(0.38 0.18 310)" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  {editSalId ? "Sauvegarder" : "Ajouter"}
                </button>
                <button onClick={() => { setShowSalForm(false); setEditSalId(null) }} className="px-4 py-2.5 rounded-xl border border-border text-sm hover:bg-muted">Annuler</button>
              </div>
            </div>
          )}

          {/* Table salaries */}
          {salaries.length === 0 ? (
            <div className="bg-muted/40 rounded-2xl p-8 text-center text-muted-foreground text-sm">Aucun salarie enregistre. Cliquez sur &quot;Nouveau salarie&quot;.</div>
          ) : (
            <div className="bg-card rounded-2xl border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr style={{ background: "oklch(0.14 0.03 260)" }}>
                  {["Salarie","Poste","Contrat","Salaire brut","Avances","Statut","Actions"].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: "oklch(0.88 0.015 245)" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {salaries.slice().sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, "fr")).map(s => (
                    <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{s.prenom} {s.nom}</p>
                        {s.telephone && <p className="text-xs text-muted-foreground">{s.telephone}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{s.poste}</td>
                      <td className="px-4 py-3"><span className="text-xs px-2 py-0.5 rounded-full border bg-muted">{CONTRAT_LABELS[s.typeContrat]}</span></td>
                      <td className="px-4 py-3 font-bold font-mono text-blue-700">{fmt(s.salaireBrut)} DH</td>
                      <td className="px-4 py-3 font-mono text-orange-600">{s.avances > 0 ? `-${fmt(s.avances)} DH` : "—"}</td>
                      <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border ${STATUT_SAL_COLORS[s.statut]}`}>{STATUT_SAL_LABELS[s.statut]}</span></td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => { setSalForm({ civilite: s.civilite ?? "M.", nom: s.nom, prenom: s.prenom, poste: s.poste, telephone: s.telephone||"", cin: s.cin||"", cnss: s.cnss||"", dateEmbauche: s.dateEmbauche, typeContrat: s.typeContrat, salaireBrut: s.salaireBrut, avances: s.avances, statut: s.statut, createdBy: s.createdBy ?? "", createdAt: s.createdAt ?? "" }); setEditSalId(s.id); setShowSalForm(true); setShowPaiForm(false) }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                          <button onClick={() => { store.deleteSalarie(s.id); refresh() }} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Historique paiements salaires */}
          {paiements.length > 0 && (
            <div className="bg-card rounded-2xl border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h4 className="font-semibold text-sm">Historique des paiements / سجل الرواتب</h4>
                <span className="text-xs text-muted-foreground">{paiements.length} paiement(s)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr style={{ background: "oklch(0.14 0.03 260)" }}>
                    {["Salarie","Mois","Brut","Avance","Net","Date paiement"].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: "oklch(0.88 0.015 245)" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {paiements.map(p => (
                      <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                        <td className="px-4 py-3 font-semibold">{p.salarieNom}</td>
                        <td className="px-4 py-3 text-muted-foreground">{fmtMois(p.mois)}</td>
                        <td className="px-4 py-3 font-mono text-blue-700">{fmt(p.salaireBrut)} DH</td>
                        <td className="px-4 py-3 font-mono text-orange-600">{p.avance > 0 ? `-${fmt(p.avance)} DH` : "—"}</td>
                        <td className="px-4 py-3 font-bold font-mono text-emerald-700">{fmt(p.salaireNet)} DH</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{p.datePaiement}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================== CREDIT CLIENT ============================== */}
      {tab === "credit" && (() => {
        const now = Date.now()
        const unpaidOf = (c: Client) => Number(unpaidByClient[c.id] ?? unpaidByClient[c.nom] ?? 0) || 0
        const creditClients = clients
          // inclut aussi les clients ayant une facture impayée (même sans crédit configuré) — cf. BODashboard.tsx
          .filter(c => c.creditAutorise || (c.creditSolde ?? 0) > 0 || unpaidOf(c) > 0)
          .map(c => {
            // Solde = solde crédit enregistré + factures impayées non encore intégrées
            const solde = (c.creditSolde ?? 0) + unpaidOf(c)
            const plafond = c.plafondCredit ?? 0
            const delai = c.delaiRecouvrement ?? "a_definir"
            const delaiMs = DELAI_MS[delai] ?? Infinity
            const clientBLs = bls.filter(b => b.clientId === c.id || b.clientNom === c.nom)
            const lastBLDate = clientBLs.length > 0
              ? clientBLs.sort((a, b2) => b2.date.localeCompare(a.date))[0].date
              : null
            const ageMs = lastBLDate ? now - new Date(lastBLDate).getTime() : null
            const overduePct = plafond > 0 ? Math.round((solde / plafond) * 100) : 0
            const isOverdue = ageMs !== null && delaiMs !== Infinity && ageMs > delaiMs && solde > 0
            const isOverPlafond = plafond > 0 && solde > plafond
            return { client: c, solde, unpaid: unpaidOf(c), plafond, delai, overduePct, isOverdue, isOverPlafond, lastBLDate, ageMs }
          })
          .sort((a, b) => {
            if (b.isOverPlafond !== a.isOverPlafond) return a.isOverPlafond ? -1 : 1
            if (b.isOverdue !== a.isOverdue) return a.isOverdue ? -1 : 1
            return b.solde - a.solde
          })

        const filtered = creditFilter === "alerte" ? creditClients.filter(c => c.isOverdue || c.isOverPlafond)
          : creditFilter === "retard" ? creditClients.filter(c => c.isOverdue)
          : creditFilter === "plafond" ? creditClients.filter(c => c.isOverPlafond)
          : creditClients

        const totalEncours = creditClients.reduce((s, c) => s + c.solde, 0)
        const totalRetard = creditClients.filter(c => c.isOverdue).reduce((s, c) => s + c.solde, 0)
        const totalHorsPlafond = creditClients.filter(c => c.isOverPlafond).reduce((s, c) => s + c.solde, 0)
        const alertCount = creditClients.filter(c => c.isOverdue || c.isOverPlafond).length

        const handleCreditPaiement = () => {
          const actor = { ...user, role: user.role as UserRole }
          if (!hasPermission(actor.role, "gerer_recouvrement")) { logAction(actor, "gerer_recouvrement", "denied", { type: "client", id: creditPaiClientId }); return }
          if (!creditPaiClientId || !creditPaiMontant || Number(creditPaiMontant) <= 0) return
          const allClients = store.getClients()
          const idx = allClients.findIndex(c => c.id === creditPaiClientId)
          if (idx < 0) return
          logAction(actor, "gerer_recouvrement", "success", { type: "client", id: creditPaiClientId, label: allClients[idx].nom })
          const newSolde = Math.max(0, (allClients[idx].creditSolde ?? 0) - Number(creditPaiMontant))
          allClients[idx] = { ...allClients[idx], creditSolde: newSolde }
          store.saveClients(allClients)
          import("@/lib/supabase/db").then(db => { try { db.upsertClient(allClients[idx]) } catch { /* offline */ } }).catch(() => {})
          // Also register a caisse entry
          const entry = {
            id: store.genId(),
            date: store.today(),
            libelle: `Encaissement credit — ${allClients[idx].nom}${creditPaiNotes ? ` (${creditPaiNotes})` : ""}`,
            type: "entree" as const,
            categorie: "vente" as const,
            montant: Number(creditPaiMontant),
            createdBy: user.id,
          }
          store.addCaisseEntry(entry)
          refresh()
          setShowCreditPaiForm(false)
          setCreditPaiClientId("")
          setCreditPaiMontant("")
          setCreditPaiNotes("")
        }

        // Remise a 0 du credit de TOUS les clients (regularisation en masse) —
        // ne touche que le solde credit, jamais les commandes/BL/caisse.
        const handleResetAllCredit = () => {
          const actor = { ...user, role: user.role as UserRole }
          if (!hasPermission(actor.role, "gerer_recouvrement")) { logAction(actor, "gerer_recouvrement", "denied", { type: "credit_reset_masse" }); return }
          logAction(actor, "gerer_recouvrement", "success", { type: "credit_reset_masse", label: `${creditClients.length} client(s)` })
          const allClients = store.getClients()
          const touchedIds = new Set(allClients.filter(c => (c.creditSolde ?? 0) !== 0).map(c => c.id))
          const updated = allClients.map(c => touchedIds.has(c.id) ? { ...c, creditSolde: 0 } : c)
          store.saveClients(updated)
          refresh()
          setConfirmResetCredit(false)
          // Pousser vers Supabase — sans ça la remise a 0 reste locale a ce navigateur
          // et un prochain sync depuis Supabase (autre appareil, autre onglet) ecrase
          // le reset avec l'ancien solde jamais synchronise.
          import("@/lib/supabase/db").then(db => {
            updated.filter(c => touchedIds.has(c.id)).forEach(c => { try { db.upsertClient(c) } catch { /* offline */ } })
          }).catch(() => {})
        }

        return (
          <div className="flex flex-col gap-5">
            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Encours total", labelAr: "إجمالي الرصيد", value: `${fmt(totalEncours)} DH`, color: "text-primary" },
                { label: "En retard", labelAr: "متأخر", value: `${fmt(totalRetard)} DH`, color: "text-orange-600" },
                { label: "Hors plafond", labelAr: "تجاوز السقف", value: `${fmt(totalHorsPlafond)} DH`, color: "text-red-600" },
                { label: "Alertes", labelAr: "تنبيهات", value: String(alertCount), color: alertCount > 0 ? "text-red-600" : "text-emerald-600" },
              ].map(k => (
                <KpiCard key={k.label} label={k.label} labelAr={k.labelAr} value={k.value} color={k.color} />
              ))}
            </div>

            {/* Alert banner */}
            {alertCount > 0 && (
              <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 flex items-start gap-3">
                <svg className="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-800">
                    {alertCount} client(s) en situation critique — {fmt(totalRetard + totalHorsPlafond)} DH a risque
                  </p>
                  <p className="text-xs text-red-700">Clients hors plafond ou en retard de paiement</p>
                </div>
              </div>
            )}

            {/* Encaissement form toggle */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-foreground">Situation credit par client</h3>
              <div className="flex items-center gap-2 flex-wrap">
                {!confirmResetCredit ? (
                  <button onClick={() => setConfirmResetCredit(true)}
                    title="Remet a 0 le solde credit ajuste manuellement — les factures marquees Impayee ne sont pas affectees"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    Remise a 0 — Solde credit ajuste
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-red-700">
                      Remettre le solde credit ajuste de TOUS les clients a 0 ? Les factures impayees ne seront PAS effacees — reglez-les via l&apos;onglet Factures.
                    </span>
                    <button onClick={handleResetAllCredit} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700">Oui, remettre</button>
                    <button onClick={() => setConfirmResetCredit(false)} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-border hover:bg-muted">Annuler</button>
                  </div>
                )}
                <button onClick={() => setShowCreditPaiForm(v => !v)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white"
                  style={{ background: "oklch(0.38 0.18 155)" }}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Encaissement
                </button>
              </div>
            </div>

            {/* Encaissement form */}
            {showCreditPaiForm && (
              <div className="bg-card rounded-2xl border border-border p-5 flex flex-col gap-4">
                <h4 className="text-sm font-bold text-foreground">Enregistrer un paiement client / تسجيل دفعة عميل</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Client *</label>
                    <select value={creditPaiClientId} onChange={e => setCreditPaiClientId(e.target.value)}
                      className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="">-- Choisir un client --</option>
                      {creditClients.filter(c => c.solde > 0).map(c => (
                        <option key={c.client.id} value={c.client.id}>
                          {c.client.nom} — Solde : {fmt(c.solde)} DH
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Montant encaisse (DH) *</label>
                    <input type="number" min="0" step="0.01" value={creditPaiMontant}
                      onChange={e => setCreditPaiMontant(e.target.value)}
                      className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="0.00" />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wide">Notes</label>
                  <input type="text" value={creditPaiNotes} onChange={e => setCreditPaiNotes(e.target.value)}
                    className="px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Cheque n°, reference virement..." />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleCreditPaiement}
                    disabled={!creditPaiClientId || !creditPaiMontant || Number(creditPaiMontant) <= 0}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50"
                    style={{ background: "oklch(0.38 0.18 155)" }}>
                    Valider encaissement
                  </button>
                  <button onClick={() => setShowCreditPaiForm(false)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-muted-foreground hover:bg-muted">
                    Annuler
                  </button>
                </div>
              </div>
            )}

            {/* Filter pills */}
            <div className="flex gap-2 flex-wrap">
              {([
                { id: "tous", label: `Tous (${creditClients.length})` },
                { id: "alerte", label: `Alertes (${alertCount})` },
                { id: "retard", label: `Retard (${creditClients.filter(c => c.isOverdue).length})` },
                { id: "plafond", label: `Hors plafond (${creditClients.filter(c => c.isOverPlafond).length})` },
              ] as const).map(f => (
                <button key={f.id} onClick={() => setCreditFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${creditFilter === f.id ? "text-white border-transparent" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}
                  style={creditFilter === f.id ? { background: "oklch(0.45 0.22 25)" } : {}}>
                  {f.label}
                </button>
              ))}
            </div>

            {/* Client credit table */}
            <div className="rounded-2xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "oklch(0.14 0.03 260)" }}>
                      {["Client", "Encours", "Plafond", "Util.%", "Delai", "Dern.Livr.", "Statut", "Action"].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                          style={{ color: "oklch(0.88 0.015 245)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Aucun client correspondant
                        </td>
                      </tr>
                    ) : filtered.map(c => (
                      <tr key={c.client.id}
                        className={`border-t border-border transition-colors ${c.isOverPlafond ? "bg-red-50" : c.isOverdue ? "bg-orange-50" : "hover:bg-muted/30"}`}>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground whitespace-nowrap">{c.client.nom}</p>
                          <p className="text-xs text-muted-foreground">{c.client.secteur}</p>
                        </td>
                        <td className={`px-4 py-3 font-bold whitespace-nowrap ${c.isOverPlafond ? "text-red-700" : c.isOverdue ? "text-orange-700" : "text-foreground"}`}>
                          {fmt(c.solde)} DH
                          {c.unpaid > 0 && (
                            <p className="text-[10px] font-normal text-muted-foreground"
                              title="Montant des factures marquees Impayee — non affecte par Remise a 0, doit etre regle via l'onglet Factures">
                              dont {fmt(c.unpaid)} DH factures impayees
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {c.plafond > 0 ? `${fmt(c.plafond)} DH` : <span className="italic text-xs">Non defini</span>}
                        </td>
                        <td className="px-4 py-3">
                          {c.plafond > 0 ? (
                            <div className="flex flex-col gap-1 min-w-16">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-center ${c.overduePct >= 100 ? "bg-red-100 text-red-700" : c.overduePct >= 80 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                                {c.overduePct}%
                              </span>
                              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className={`h-full rounded-full ${c.overduePct >= 100 ? "bg-red-500" : c.overduePct >= 80 ? "bg-orange-500" : "bg-emerald-500"}`}
                                  style={{ width: `${Math.min(100, c.overduePct)}%` }} />
                              </div>
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {DELAI_RECOUVREMENT_LABELS[c.delai] ?? c.delai}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {c.lastBLDate ?? "—"}
                          {c.ageMs !== null && c.delai !== "a_definir" && (
                            <p className="text-[10px]">{Math.round(c.ageMs / (24 * 3600 * 1000))}j</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {c.isOverPlafond ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-100 text-red-700 border border-red-300 whitespace-nowrap">Hors plafond</span>
                          ) : c.isOverdue ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-orange-100 text-orange-700 border border-orange-300 whitespace-nowrap">En retard</span>
                          ) : c.solde > 0 ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-yellow-100 text-yellow-700 border border-yellow-300 whitespace-nowrap">En cours</span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-100 text-green-700 border border-green-300">Solde</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => { setCreditPaiClientId(c.client.id); setCreditPaiMontant(""); setShowCreditPaiForm(true) }}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold text-white whitespace-nowrap"
                            style={{ background: "oklch(0.38 0.18 155)" }}>
                            Encaisser
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ============================== CASH MAN ============================== */}
      {tab === "cashman" && (() => {
        const now = Date.now()
        // Filtered caisse entries by cashFilter date range
        const cashEntries = caisse.filter(e => e.date >= cashFilter.from && e.date <= cashFilter.to)
        const entrees = cashEntries.filter(e => e.type === "entree")
        const sorties = cashEntries.filter(e => e.type === "sortie")
        const totalEntrees = entrees.reduce((s, e) => s + e.montant, 0)
        const totalSorties = sorties.reduce((s, e) => s + e.montant, 0)
        const soldeNet = totalEntrees - totalSorties

        // Cash flow by day in the range
        const daysMap: Record<string, { entrees: number; sorties: number }> = {}
        cashEntries.forEach(e => {
          if (!daysMap[e.date]) daysMap[e.date] = { entrees: 0, sorties: 0 }
          if (e.type === "entree") daysMap[e.date].entrees += e.montant
          else daysMap[e.date].sorties += e.montant
        })
        const cashDays = Object.entries(daysMap).sort(([a], [b]) => a.localeCompare(b))

        // Credit encours as liability
        const totalCreditEncours = clients.reduce((s, c) => s + (c.creditSolde ?? 0), 0)

        // Charges in period
        const chargesInPeriod = charges.filter(c => c.date >= cashFilter.from && c.date <= cashFilter.to)
        const totalChargesPeriod = chargesInPeriod.reduce((s, c) => s + c.montant, 0)

        // Salaires in period (paiements)
        const salairesInPeriod = paiements.filter(p => {
          const d = p.datePaiement
          return d >= cashFilter.from && d <= cashFilter.to
        })
        const totalSalairesPeriod = salairesInPeriod.reduce((s, p) => s + p.salaireNet, 0)

        return (
          <div className="flex flex-col gap-5">
            {/* Date range filter */}
            <div className="bg-card rounded-2xl border border-border p-4 flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Du</label>
                <input type="date" value={cashFilter.from}
                  onChange={e => setCashFilter(prev => ({ ...prev, from: e.target.value }))}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Au</label>
                <input type="date" value={cashFilter.to}
                  onChange={e => setCashFilter(prev => ({ ...prev, to: e.target.value }))}
                  className="px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex gap-2">
                {["Ce mois", "7 jours", "30 jours"].map((lbl, i) => (
                  <button key={lbl} onClick={() => {
                    const today = store.today()
                    if (i === 0) {
                      const d = new Date(today)
                      setCashFilter({ from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, to: today })
                    } else {
                      const d = new Date(today)
                      d.setDate(d.getDate() - (i === 1 ? 7 : 30))
                      setCashFilter({ from: d.toISOString().slice(0, 10), to: today })
                    }
                  }}
                    className="px-3 py-2 rounded-xl text-xs font-semibold border border-border text-muted-foreground hover:bg-muted transition-colors">
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Encaissements", labelAr: "المقبوضات", value: `${fmt(totalEntrees)} DH`, color: "text-emerald-600" },
                { label: "Decaissements", labelAr: "المدفوعات", value: `${fmt(totalSorties)} DH`, color: "text-red-600" },
                { label: "Solde net", labelAr: "صافي الرصيد", value: `${fmt(soldeNet)} DH`, color: soldeNet >= 0 ? "text-primary" : "text-red-600" },
                { label: "Encours credit", labelAr: "رصيد الائتمان", value: `${fmt(totalCreditEncours)} DH`, color: "text-orange-600" },
              ].map(k => (
                <KpiCard key={k.label} label={k.label} labelAr={k.labelAr} value={k.value} color={k.color} />
              ))}
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: "Charges periode", value: `${fmt(totalChargesPeriod)} DH`, color: "text-orange-600" },
                { label: "Salaires payes", value: `${fmt(totalSalairesPeriod)} DH`, color: "text-violet-600" },
                { label: "Resultat operationnel", value: `${fmt(totalEntrees - totalSorties - totalChargesPeriod - totalSalairesPeriod)} DH`, color: (totalEntrees - totalSorties - totalChargesPeriod - totalSalairesPeriod) >= 0 ? "text-emerald-600" : "text-red-600" },
              ].map(k => (
                <div key={k.label} className="bg-card rounded-xl border border-border p-4">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{k.label}</p>
                  <p className={`text-lg font-extrabold ${k.color}`}>{k.value}</p>
                </div>
              ))}
            </div>

            {/* Cash flow table by day */}
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-foreground">Flux de tresorerie / تدفقات الخزينة</h3>
              <div className="rounded-2xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "oklch(0.14 0.03 260)" }}>
                        {["Date", "Encaissements", "Decaissements", "Solde jour"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                            style={{ color: "oklch(0.88 0.015 245)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cashDays.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune entree pour cette periode</td>
                        </tr>
                      ) : cashDays.map(([date, v]) => {
                        const net = v.entrees - v.sorties
                        return (
                          <tr key={date} className="border-t border-border hover:bg-muted/30">
                            <td className="px-4 py-3 font-semibold text-foreground">{date}</td>
                            <td className="px-4 py-3 font-bold text-emerald-700 font-mono">{fmt(v.entrees)} DH</td>
                            <td className="px-4 py-3 font-bold text-red-600 font-mono">{fmt(v.sorties)} DH</td>
                            <td className={`px-4 py-3 font-bold font-mono ${net >= 0 ? "text-primary" : "text-red-700"}`}>{net >= 0 ? "+" : ""}{fmt(net)} DH</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/50">
                        <td className="px-4 py-3 font-bold text-foreground text-xs uppercase">Total periode</td>
                        <td className="px-4 py-3 font-extrabold text-emerald-700 font-mono">{fmt(totalEntrees)} DH</td>
                        <td className="px-4 py-3 font-extrabold text-red-600 font-mono">{fmt(totalSorties)} DH</td>
                        <td className={`px-4 py-3 font-extrabold font-mono ${soldeNet >= 0 ? "text-primary" : "text-red-700"}`}>{soldeNet >= 0 ? "+" : ""}{fmt(soldeNet)} DH</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Credit aging — how long outstanding */}
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-bold text-foreground">Aging credit client / أعمار الديون</h3>
              <div className="rounded-2xl border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "oklch(0.14 0.03 260)" }}>
                        {["Client", "Solde DH", "Delai accorde", "Age (jours)", "Etat"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                            style={{ color: "oklch(0.88 0.015 245)" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {clients.filter(c => (c.creditSolde ?? 0) > 0).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">Aucun encours credit</td>
                        </tr>
                      ) : clients.filter(c => (c.creditSolde ?? 0) > 0).map(c => {
                        const clientBLs = bls.filter(b => b.clientId === c.id || b.clientNom === c.nom)
                        const lastBL = clientBLs.sort((a, b2) => b2.date.localeCompare(a.date))[0]
                        const ageMs = lastBL ? now - new Date(lastBL.date).getTime() : null
                        const ageDays = ageMs !== null ? Math.round(ageMs / (24 * 3600 * 1000)) : null
                        const delai = c.delaiRecouvrement ?? "a_definir"
                        const delaiMs = DELAI_MS[delai] ?? Infinity
                        const isOverdue = ageMs !== null && delaiMs !== Infinity && ageMs > delaiMs
                        return (
                          <tr key={c.id} className={`border-t border-border ${isOverdue ? "bg-orange-50" : "hover:bg-muted/30"}`}>
                            <td className="px-4 py-3 font-semibold text-foreground">{c.nom}</td>
                            <td className={`px-4 py-3 font-bold font-mono ${isOverdue ? "text-orange-700" : "text-foreground"}`}>{fmt(c.creditSolde ?? 0)} DH</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{DELAI_RECOUVREMENT_LABELS[delai] ?? delai}</td>
                            <td className={`px-4 py-3 font-semibold ${isOverdue ? "text-red-600" : "text-foreground"}`}>{ageDays !== null ? `${ageDays}j` : "—"}</td>
                            <td className="px-4 py-3">
                              {isOverdue ? (
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-orange-100 text-orange-700 border border-orange-300">En retard</span>
                              ) : (
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-green-100 text-green-700 border border-green-300">Dans delai</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {tab === "cheques" && <BOChequesVirements user={user} />}
    </div>
  )
}
