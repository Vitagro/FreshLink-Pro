"use client"

import { useState, useEffect, useMemo } from "react"
import { store, type User } from "@/lib/store"
import { hasPermission } from "@/lib/permissions"
import { logAction } from "@/lib/auditLog"
import type { FichePayroll } from "./BOResources"

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface ChargesConfig {
  loyerEntrepot:     number
  electricite:       number
  carburant:         number
  maintenanceVehicule: number
  emballages:        number
  telephonie:        number
  assurances:        number
  fraisBancaires:    number
  autresCharges:     number
}

const DEFAULT_CHARGES: ChargesConfig = {
  loyerEntrepot:       8000,
  electricite:         2500,
  carburant:           4000,
  maintenanceVehicule: 1500,
  emballages:          1200,
  telephonie:           800,
  assurances:          2000,
  fraisBancaires:       500,
  autresCharges:          0,
}

const CHARGES_LABELS: Record<keyof ChargesConfig, string> = {
  loyerEntrepot:       "Loyer entrepot / depot",
  electricite:         "Electricite & eau",
  carburant:           "Carburant vehicules",
  maintenanceVehicule: "Maintenance vehicules",
  emballages:          "Emballages & consommables",
  telephonie:          "Telephonie & internet",
  assurances:          "Assurances",
  fraisBancaires:      "Frais bancaires",
  autresCharges:       "Autres charges",
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL STORAGE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const LS = {
  getFiches: (): FichePayroll[] => {
    try { return JSON.parse(localStorage.getItem("fl_fiches_payroll") ?? "[]") }
    catch { return [] }
  },
  saveFiches: (f: FichePayroll[]) => localStorage.setItem("fl_fiches_payroll", JSON.stringify(f)),

  getCharges: (): ChargesConfig => {
    try {
      const raw = localStorage.getItem("fl_charges_fixes")
      return raw ? { ...DEFAULT_CHARGES, ...JSON.parse(raw) } : DEFAULT_CHARGES
    } catch { return DEFAULT_CHARGES }
  },
  saveCharges: (c: ChargesConfig) => localStorage.setItem("fl_charges_fixes", JSON.stringify(c)),

  // Calcul solde caisse à partir des mouvements réels
  getCaisseSolde: (): number => {
    try {
      const mv = JSON.parse(localStorage.getItem("fl_caisse_mouvements") ?? "[]") as any[]
      return mv.reduce((s: number, m: any) => {
        const montant = Number(m.montant ?? 0)
        return m.sens === "entree" ? s + montant : s - montant
      }, 0)
    } catch { return 0 }
  },

  // CA brut du mois : total commandes livrées
  getCAMois: (periode: string): number => {
    try {
      const bls = JSON.parse(localStorage.getItem("fl_bons_livraison") ?? "[]") as any[]
      return bls
        .filter((b: any) => (b.date ?? "").startsWith(periode) && b.statut === "livré")
        .reduce((s: number, b: any) => {
          const total = (b.lignes ?? []).reduce((ls: number, l: any) =>
            ls + Number(l.quantite ?? 0) * Number(l.prixVente ?? 0), 0)
          return s + total
        }, 0)
    } catch { return 0 }
  },

  // Total achats du mois
  getTotalAchatsMois: (periode: string): number => {
    try {
      const bons = JSON.parse(localStorage.getItem("fl_bons_achat") ?? "[]") as any[]
      return bons
        .filter((b: any) => (b.date ?? "").startsWith(periode))
        .reduce((s: number, b: any) => {
          const total = (b.lignes ?? []).reduce((ls: number, l: any) =>
            ls + Number(l.quantite ?? 0) * Number(l.prixAchat ?? 0), 0)
          return s + total
        }, 0)
    } catch { return 0 }
  },

  getGrilles: () => {
    try { return JSON.parse(localStorage.getItem("fl_grilles_salaire") ?? "[]") as any[] }
    catch { return [] }
  },
}

const FMT = (n: number) => n.toLocaleString("fr-MA", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " DH"
const PCT = (n: number) => n.toFixed(1) + "%"

// ─────────────────────────────────────────────────────────────────────────────
// CHARGES CONFIG PANEL
// ─────────────────────────────────────────────────────────────────────────────

function ChargesPanel({ charges, onSave, onClose }: {
  charges: ChargesConfig
  onSave: (c: ChargesConfig) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<ChargesConfig>({ ...charges })
  const totalCharges = Object.values(draft).reduce((s, v) => s + Number(v ?? 0), 0)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-foreground">Charges fixes mensuelles</h2>
            <p className="text-xs text-muted-foreground">Ces charges seront déduites avant le calcul du bénéfice net</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {(Object.keys(draft) as Array<keyof ChargesConfig>).map(key => (
            <div key={key}>
              <label className="text-xs font-medium text-muted-foreground">{CHARGES_LABELS[key]}</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number" min="0" value={draft[key]}
                  onChange={e => setDraft(p => ({ ...p, [key]: Number(e.target.value) }))}
                  className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground"
                />
                <span className="text-xs text-muted-foreground w-6">DH</span>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-muted/30 border-t border-border">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Total charges fixes</span>
            <span className="font-bold text-red-600">{FMT(totalCharges)}</span>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={() => { onSave(draft); onClose() }}
            className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors">
            Enregistrer
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-muted transition-colors">
            Annuler
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FICHE DETAIL
// ─────────────────────────────────────────────────────────────────────────────

function FicheDetail({ fiche, onSave, onClose, benefNetEntreprise, caisseSolde }: {
  fiche: FichePayroll
  onSave: (updated: FichePayroll) => void
  onClose: () => void
  benefNetEntreprise: number   // bénéfice net APRES déduction charges + masse salariale
  caisseSolde: number
}) {
  const [noteAzmi, setNoteAzmi] = useState(fiche.noteAzmi ?? "")

  const grilles = LS.getGrilles()
  const grille = grilles.find((g: any) => g.userId === fiche.userId)
  const actionnaire      = grille?.actionnaire ?? false
  const tauxBenef        = grille?.tauxBenef ?? 0
  const tauxSalaireBenef = grille?.tauxSalaireBenef ?? 0

  // Calculs actionnaire basés sur le bénéfice NET (après toutes charges)
  const partBenef         = actionnaire ? Math.max(0, (benefNetEntreprise * tauxBenef) / 100) : 0
  const supplementSalaire = actionnaire ? Math.max(0, (benefNetEntreprise * tauxSalaireBenef) / 100) : 0
  const salaireFinal      = fiche.salaireBrut + supplementSalaire
  const totalActionnaire  = actionnaire ? salaireFinal + partBenef : fiche.salaireBrut
  const resteEnCaisse     = actionnaire ? caisseSolde - totalActionnaire : null

  const handleValidate = () => {
    const session = store.getSession()
    if (!hasPermission(session?.role, "gerer_salaires")) { logAction(session, "gerer_salaires", "denied", { type: "fiche_paie", id: fiche.id }); return }
    logAction(session, "gerer_salaires", "success", { type: "fiche_paie", id: fiche.id })
    const updated: FichePayroll = {
      ...fiche,
      benefEntreprise:  actionnaire ? benefNetEntreprise : undefined,
      partBenef:        actionnaire ? partBenef : undefined,
      totalActionnaire: actionnaire ? totalActionnaire : undefined,
      noteAzmi,
      validéAzmi: true,
      statut: "payé",
    }
    onSave(updated)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-foreground">{fiche.userName}</h2>
            <p className="text-xs text-muted-foreground">{fiche.userRole.replace(/_/g, " ")} · {fiche.periode}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">

          {/* Calcul Ourai */}
          <div className="bg-muted/40 rounded-xl p-4 space-y-2.5">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Fiche RH — Ourai</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Salaire fixe</span>
              <span className="font-semibold">{FMT(fiche.salaireFixe)}</span>
            </div>
            {fiche.totalBonus > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bonus performance</span>
                <span className="font-semibold text-emerald-600">+{FMT(fiche.totalBonus)}</span>
              </div>
            )}
            {fiche.totalMalus > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Malus</span>
                <span className="font-semibold text-red-600">-{FMT(fiche.totalMalus)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-bold pt-2 border-t border-border">
              <span>Salaire brut RH</span>
              <span>{FMT(fiche.salaireBrut)}</span>
            </div>
          </div>

          {/* Actionnaire */}
          {actionnaire ? (
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">A</span>
                <p className="text-sm font-bold text-violet-800">Actionnaire — Calcul part bénéfice</p>
              </div>

              {/* Bénéfice net affiché en lecture seule — calculé depuis le tableau de bord */}
              <div className="rounded-lg bg-white border border-violet-200 px-3 py-2.5 space-y-1">
                <p className="text-[10px] text-violet-600 font-semibold uppercase">Bénéfice net entreprise ce mois</p>
                <p className="text-lg font-black text-violet-900">{FMT(benefNetEntreprise)}</p>
                <p className="text-[10px] text-violet-500">= CA — achats — charges fixes — masse salariale totale</p>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-violet-700">Part bénéfice ({PCT(tauxBenef)})</span>
                  <span className="font-bold text-violet-800">+{FMT(partBenef)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-violet-700">Supplément salaire ({PCT(tauxSalaireBenef)})</span>
                  <span className="font-bold text-violet-800">+{FMT(supplementSalaire)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-violet-200 font-bold">
                  <span className="text-violet-900">Total à verser</span>
                  <span className="text-violet-900 text-base">{FMT(totalActionnaire)}</span>
                </div>
              </div>

              {/* Reste en caisse */}
              {resteEnCaisse !== null && (
                <div className={`rounded-xl p-3 ${resteEnCaisse >= 0 ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Solde caisse actuel</span>
                    <span className="font-semibold">{FMT(caisseSolde)}</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-muted-foreground">- Versement</span>
                    <span className="font-semibold text-red-600">-{FMT(totalActionnaire)}</span>
                  </div>
                  <div className={`flex justify-between font-bold mt-2 pt-2 border-t ${resteEnCaisse >= 0 ? "border-emerald-200" : "border-red-200"}`}>
                    <span>Reste en caisse</span>
                    <span className={resteEnCaisse >= 0 ? "text-emerald-700" : "text-red-700"}>{FMT(resteEnCaisse)}</span>
                  </div>
                  {resteEnCaisse < 0 && (
                    <p className="text-xs text-red-600 mt-1 font-semibold">Solde insuffisant — approvisionnement requis</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-muted/30 rounded-xl p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Non actionnaire</p>
                <p className="text-xs text-muted-foreground">Salaire final: <strong>{FMT(fiche.salaireBrut)}</strong> — pas de part bénéfice</p>
              </div>
            </div>
          )}

          {/* Note Azmi */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Note Azmi</label>
            <textarea
              value={noteAzmi}
              onChange={e => setNoteAzmi(e.target.value)}
              rows={2}
              className="w-full mt-1 border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground resize-none focus:ring-2 focus:ring-primary outline-none"
              placeholder="Observations pour la comptabilité..."
            />
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-border">
          <button onClick={handleValidate}
            className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Valider & Marquer Payé
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-muted transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function BOComptabiliteRH({ user }: { user: User }) {
  const [fiches,   setFiches]   = useState<FichePayroll[]>([])
  const [charges,  setCharges]  = useState<ChargesConfig>(DEFAULT_CHARGES)
  const [periode,  setPeriode]  = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  })
  const [selected,       setSelected]       = useState<FichePayroll | null>(null)
  const [showCharges,    setShowCharges]    = useState(false)
  const [benefBrut,      setBenefBrut]      = useState(0)

  const caisseSolde = LS.getCaisseSolde()

  useEffect(() => {
    setFiches(LS.getFiches())
    setCharges(LS.getCharges())
    // Auto-calculer le CA et achats du mois sélectionné
    const ca      = LS.getCAMois(periode)
    const achats  = LS.getTotalAchatsMois(periode)
    setBenefBrut(Math.max(0, ca - achats))
  }, [periode])

  const saveCharges = (c: ChargesConfig) => {
    LS.saveCharges(c)
    setCharges(c)
  }

  const saveFiche = (updated: FichePayroll) => {
    const newFiches = fiches.map(f => f.id === updated.id ? updated : f)
    LS.saveFiches(newFiches)
    setFiches(newFiches)
  }

  const periodeFiches = fiches.filter(f =>
    f.periode === periode && ["transmis_azmi", "payé"].includes(f.statut)
  )

  // ── Calcul bénéfice net ───────────────────────────────────────────────────
  const totalChargesFixes  = useMemo(() => Object.values(charges).reduce((s, v) => s + Number(v ?? 0), 0), [charges])
  const masseSalarialeTotal = useMemo(() => periodeFiches.reduce((s, f) => s + f.salaireBrut, 0), [periodeFiches])

  // Bénéfice NET = bénéfice brut (CA - achats) - charges fixes - masse salariale totale
  const benefNetEntreprise = Math.max(0, benefBrut - totalChargesFixes - masseSalarialeTotal)

  const totalPaye = periodeFiches
    .filter(f => f.statut === "payé")
    .reduce((s, f) => s + (f.totalActionnaire ?? f.salaireBrut), 0)

  const totalEnAttente = periodeFiches
    .filter(f => f.statut !== "payé")
    .reduce((s, f) => s + f.salaireBrut, 0)

  const isSuperAdmin = user.role === "super_admin" || user.role === "super_super_admin"

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "oklch(0.94 0.04 280)" }}>
            <svg className="w-6 h-6" style={{ color: "oklch(0.45 0.2 280)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M12 7h.01M15 7h.01M9 7H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M7 7V5a2 2 0 012-2h8a2 2 0 012 2v2" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Comptabilite RH — Azmi</h1>
            <p className="text-sm text-muted-foreground">Validation salaires · Bénéfice net · Actionnaires · Reste en caisse</p>
          </div>
        </div>
        <button
          onClick={() => setShowCharges(true)}
          className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm font-medium hover:bg-muted transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Charges fixes
        </button>
      </div>

      {/* Periode picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <label className="text-xs font-medium text-muted-foreground mr-2">Période</label>
          <input type="month" value={periode}
            onChange={e => setPeriode(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground" />
        </div>
        {(isSuperAdmin) && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-muted-foreground">Bénéfice brut manuel</label>
            <input
              type="number" min="0" value={benefBrut}
              onChange={e => setBenefBrut(Number(e.target.value))}
              className="border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground w-36"
              placeholder="0 DH"
            />
          </div>
        )}
      </div>

      {/* ── Tableau bénéfice net ── */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Calcul Bénéfice Net — {periode}</p>
        </div>
        <div className="divide-y divide-border">
          <div className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-muted-foreground">Bénéfice brut (CA − Achats)</span>
            <span className="font-semibold text-foreground">{FMT(benefBrut)}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              Charges fixes déduites
            </span>
            <span className="font-semibold text-red-600">-{FMT(totalChargesFixes)}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-3">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
              Masse salariale ({periodeFiches.length} fiches)
            </span>
            <span className="font-semibold text-amber-600">-{FMT(masseSalarialeTotal)}</span>
          </div>
          <div className="flex justify-between items-center px-5 py-4 bg-muted/30">
            <span className="text-sm font-bold text-foreground">Bénéfice NET entreprise</span>
            <span className={`text-lg font-black ${benefNetEntreprise > 0 ? "text-emerald-600" : "text-red-600"}`}>
              {FMT(benefNetEntreprise)}
            </span>
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "A valider", val: FMT(totalEnAttente), color: "text-amber-600" },
          { label: "Deja paye",   val: FMT(totalPaye),      color: "text-emerald-600" },
          { label: "Solde caisse", val: FMT(caisseSolde),   color: caisseSolde >= totalEnAttente ? "text-emerald-600" : "text-red-600" },
          { label: "Benef net",   val: FMT(benefNetEntreprise), color: benefNetEntreprise > 0 ? "text-violet-600" : "text-red-600" },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-[10px] text-muted-foreground mb-1">{k.label}</p>
            <p className={`text-sm font-bold ${k.color}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Fiches list */}
      {periodeFiches.length === 0 ? (
        <div className="text-center py-16 space-y-2">
          <svg className="w-12 h-12 text-muted-foreground/30 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-muted-foreground font-medium">Aucune fiche transmise pour {periode}</p>
          <p className="text-xs text-muted-foreground">Ourai doit valider et transmettre les fiches depuis le module RH</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">Fiches — {periodeFiches.length} employés</p>
          {periodeFiches.map(f => {
            const grilles = LS.getGrilles()
            const g = grilles.find((gr: any) => gr.userId === f.userId)
            const isActionnaire = g?.actionnaire ?? false
            const total = f.totalActionnaire ?? f.salaireBrut

            return (
              <div key={f.id}
                className={`bg-card border rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:shadow-sm transition-all ${
                  f.statut === "payé" ? "border-emerald-200 bg-emerald-50/20" : "border-border"
                }`}
                onClick={() => setSelected(f)}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                  style={{ background: isActionnaire ? "oklch(0.45 0.2 280)" : "oklch(0.45 0.15 200)" }}>
                  {f.userName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-foreground">{f.userName}</p>
                    {isActionnaire && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                        style={{ background: "oklch(0.94 0.05 280)", color: "oklch(0.4 0.2 280)" }}>
                        ACTIONNAIRE
                      </span>
                    )}
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${
                      f.statut === "payé" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                    }`}>
                      {f.statut === "payé" ? "PAYE" : "A VALIDER"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{f.userRole.replace(/_/g, " ")}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-foreground">{FMT(total)}</p>
                  {isActionnaire && f.partBenef ? (
                    <p className="text-[10px] text-muted-foreground">base {FMT(f.salaireBrut)} + benef</p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">fixe + perf</p>
                  )}
                </div>
                <svg className="w-4 h-4 text-muted-foreground flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {selected && (
        <FicheDetail
          fiche={selected}
          onSave={saveFiche}
          onClose={() => setSelected(null)}
          benefNetEntreprise={benefNetEntreprise}
          caisseSolde={caisseSolde}
        />
      )}
      {showCharges && (
        <ChargesPanel
          charges={charges}
          onSave={saveCharges}
          onClose={() => setShowCharges(false)}
        />
      )}
    </div>
  )
}
