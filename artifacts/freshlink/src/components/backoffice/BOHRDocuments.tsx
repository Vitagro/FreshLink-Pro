"use client"

import { useState, useMemo } from "react"
import {
  store,
  type User,
  type UserRole,
  type Civilite,
  type Salarie,
  type StatutSalarie,
  type TypeContrat,
  type RHNotification,
  STATUT_SALARIE_LABELS,
  TYPE_CONTRAT_LABELS,
} from "@/lib/store"
import {
  printHRDoc,
  downloadHRDocAsWord,
  sendWhatsApp,
  buildHRWhatsAppText,
  type HRDocData,
} from "@/lib/print"

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocType =
  | "contrat"
  | "contrat_cdd"
  | "attestation_travail"
  | "attestation_salaire"
  | "mise_en_demeure"
  | "avertissement"
  | "fiche_paie"
  | "solde_tout_compte"
  | "rupture_conventionnelle"
  | "conge_sans_solde"

export type CycleType = "journalier" | "hebdomadaire" | "mensuel" | "avance"

export interface PaiementCycle {
  id: string
  userId: string
  userName: string
  userRole: UserRole
  cycleType: CycleType
  montant: number
  dateDebut: string
  dateFin?: string
  statut: "en_attente" | "paye" | "annule"
  reference?: string
  note?: string
  createdAt: string
  validePar?: string
}

export interface HRDoc {
  id: string
  userId: string
  userName: string
  userRole: UserRole
  docType: DocType
  titre: string
  contenu: string
  dateDoc: string
  statut: "brouillon" | "valide" | "signe" | "archive"
  generePar: string
  createdAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_LABELS: Record<DocType, string> = {
  contrat:               "Contrat CDI",
  contrat_cdd:           "Contrat CDD",
  attestation_travail:   "Attestation de travail",
  attestation_salaire:   "Attestation de salaire",
  mise_en_demeure:       "Mise en demeure",
  avertissement:         "Avertissement disciplinaire",
  fiche_paie:            "Bulletin de paie",
  solde_tout_compte:     "Solde de tout compte",
  rupture_conventionnelle: "Rupture conventionnelle",
  conge_sans_solde:      "Congé sans solde",
}

const CYCLE_LABELS: Record<CycleType, string> = {
  journalier:   "Paiement journalier (vacataire)",
  hebdomadaire: "Paiement hebdomadaire",
  mensuel:      "Salaire mensuel",
  avance:       "Avance sur salaire",
}

const CYCLE_COLORS: Record<CycleType, string> = {
  journalier:   "bg-amber-100 text-amber-700",
  hebdomadaire: "bg-blue-100 text-blue-700",
  mensuel:      "bg-emerald-100 text-emerald-700",
  avance:       "bg-violet-100 text-violet-700",
}

const STATUT_DOC_COLORS: Record<string, string> = {
  brouillon: "bg-slate-100 text-slate-600",
  valide:    "bg-emerald-100 text-emerald-700",
  signe:     "bg-blue-100 text-blue-700",
  archive:   "bg-gray-100 text-gray-500",
}

const STATUT_SAL_COLORS: Record<StatutSalarie, string> = {
  actif:         "bg-emerald-100 text-emerald-700",
  conge:         "bg-blue-100 text-blue-700",
  periode_essai: "bg-amber-100 text-amber-700",
  inactif:       "bg-red-100 text-red-600",
}

const LS_DOCS = "fl_hr_documents"
const LS_PAIE = "fl_paiements_cycles"

function getDocs(): HRDoc[] {
  try { return JSON.parse(localStorage.getItem(LS_DOCS) ?? "[]") } catch { return [] }
}
function saveDocs(d: HRDoc[]) { localStorage.setItem(LS_DOCS, JSON.stringify(d)) }
function getPaie(): PaiementCycle[] {
  try { return JSON.parse(localStorage.getItem(LS_PAIE) ?? "[]") } catch { return [] }
}
function savePaie(p: PaiementCycle[]) { localStorage.setItem(LS_PAIE, JSON.stringify(p)) }
function genId() { return `hr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }

// ─── Doc template ─────────────────────────────────────────────────────────────

function generateDoc(
  type: DocType,
  employee: User,
  extra: Record<string, string>,
  company: string,
  salarie?: Salarie,
): string {
  const date = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  const roleUp = (employee.role ?? "").replace(/_/g, " ").toUpperCase()
  const civ  = salarie?.civilite ?? employee.civilite ?? "M."
  const nom  = salarie ? `${salarie.nom} ${salarie.prenom}` : employee.name
  const cin  = salarie?.cin ?? "—"
  const cnssNum = salarie?.cnss ?? "—"
  const ville = extra.ville ?? "Casablanca"
  const dateEmb = extra.dateDebut ?? salarie?.dateEmbauche ?? date

  const header = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        ${company}
              Distribution Alimentaire Professionnelle
            Zone Industrielle, Casablanca, Maroc
            Tél : +212 5XX-XXXXXX  |  contact@vita-fresh.ma
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`

  let body = ""
  switch (type) {
    case "contrat":
      body = `CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE (CDI)
Loi 65-99 — Code du Travail Marocain

ENTRE : ${company} (Employeur)
ET    : ${civ} ${nom} — CIN: ${cin} — CNSS: ${cnssNum}

Art. 1 — Engagement
${company} engage ${civ} ${nom} en qualité de ${roleUp} à compter du ${dateEmb}.

Art. 2 — Période d'Essai (Art. 13-14 Loi 65-99)
Cadres: 3 mois (max 6 mois) / Employés: 1,5 mois (max 3 mois) / Ouvriers: 15 jours (max 30 jours).

Art. 3 — Rémunération
Salaire mensuel brut: ${extra.salaire ?? salarie?.salaireBrut?.toFixed(2) ?? "..."} DH, payable le ${extra.jourPaie ?? "25"} du mois.
Déductions légales: CNSS 4,48% + AMO 2,26% + IR barème progressif 2024.

Art. 4 — Durée du Travail (Art. 184 Loi 65-99)
44 heures/semaine. Heures sup. majorées 25% (jour) / 50% (nuit/fériés).

Art. 5 — Congés Payés (Art. 231-260 Loi 65-99)
18 jours ouvrables/an minimum (1,5 j/mois). Majoration ancienneté: +1,5 j par 5 ans.

Art. 6 — Affiliation CNSS & AMO
Affiliation obligatoire dans les 10 jours suivant l'embauche.

Art. 7 — Préavis de Rupture (Art. 43-50 Loi 65-99)
Cadres: 3 mois / Employés: 1 mois / Ouvriers: 8 jours. Sauf faute grave.

Art. 8 — Droit Applicable
Loi 65-99 — Juridiction de ${ville}.

Fait à ${ville}, le ${date}

Vita Fresh — Direction des Ressources Humaines
Signature & Cachet :          ${civ} ${nom} — Signature (Lu et approuvé) :`
      break

    case "contrat_cdd":
      body = `CONTRAT DE TRAVAIL À DURÉE DÉTERMINÉE (CDD)
Arts. 16-20 — Loi 65-99 — Code du Travail Marocain

ENTRE : ${company} (Employeur)
ET    : ${civ} ${nom} — CIN: ${cin} — CNSS: ${cnssNum}

DURÉE: Du ${dateEmb} au ${extra.dateFin ?? "…"} (max 2 ans renouvellement inclus)
MOTIF: ${extra.motifCdd ?? "Surcroît temporaire d'activité — haute saison de distribution"}
POSTE: ${roleUp}
SALAIRE BRUT: ${extra.salaire ?? "..."} DH/mois

Conditions de travail identiques au CDI standard (Loi 65-99).
Indemnité de fin de CDD: 5% du total du salaire brut perçu (si non renouvellement).

Fait à ${ville}, le ${date}

${company} — Direction des Ressources Humaines
Signature & Cachet :          ${civ} ${nom} — Signature :`
      break

    case "attestation_travail":
      body = `ATTESTATION DE TRAVAIL

Je soussigné(e), Directeur(rice) Général(e) de ${company}, atteste que :

${civ} ${nom}
CIN: ${cin} — N° CNSS: ${cnssNum}
Poste: ${roleUp}

Est employé(e) au sein de notre entreprise depuis le ${dateEmb} à ce jour,
à temps complet (44h/semaine). Cotisations CNSS & AMO régulièrement acquittées.

Délivrée à la demande de l'intéressé(e) pour faire valoir ce que de droit.

Fait à ${ville}, le ${date}

Vita Fresh — Direction des Ressources Humaines
Signature & Cachet :`
      break

    case "attestation_salaire":
      body = `ATTESTATION DE SALAIRE ET DE TRAVAIL

Je soussigné(e), Directeur(rice) Général(e) de ${company}, atteste que :

${civ} ${nom} — CIN: ${cin} — N° CNSS: ${cnssNum}
Poste: ${roleUp} — Date d'embauche: ${dateEmb}

Perçoit une rémunération mensuelle brute de : ${extra.salaire ?? salarie?.salaireBrut?.toFixed(2) ?? "..."} DH
Soit une rémunération mensuelle nette de    : ${extra.salaireNet ?? "..."} DH
Mode de paiement: ${salarie?.modePaiement ?? "virement bancaire"}

Cotisations légales prélevées à la source (CNSS 4,48% + AMO 2,26% + IR barème 2024).
Établie pour usage: ${extra.usage ?? "bancaire / administratif"}.

Fait à ${ville}, le ${date}

Vita Fresh — Direction des Ressources Humaines
Signature & Cachet :`
      break

    case "avertissement":
      body = `LETTRE D'AVERTISSEMENT
Réf: AV-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}

À : ${civ} ${nom} — Poste: ${roleUp}

Madame, Monsieur,

Nous avons constaté le manquement suivant:
${extra.motif ?? "Manquement aux obligations professionnelles."}

En application des articles 37 et 38 du Code du Travail (Loi 65-99), nous vous
adressons le présent avertissement formel.

Tout nouvel incident entraînera une mise à pied puis un licenciement pour faute
grave sans préavis ni indemnité (Art. 61 Loi 65-99).

Vous disposez de 48h pour nous faire parvenir vos observations écrites (Art. 62).

Fait à ${ville}, le ${date}

Vita Fresh — Direction des Ressources Humaines — Signature & Cachet :`
      break

    case "mise_en_demeure":
      body = `MISE EN DEMEURE FORMELLE (RAR)
Réf: MED-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}

À : ${civ} ${nom} — CIN: ${cin} — Poste: ${roleUp}

Madame, Monsieur,

Suite aux avertissements délivrés et restés sans effet, vous êtes mis(e) en demeure
de cesser immédiatement les faits suivants:

${extra.motif ?? "Manquements répétés aux obligations professionnelles."}

AVERTISSEMENT FINAL: Tout nouvel incident entraînera votre licenciement pour faute
grave, sans préavis ni indemnité (Art. 61-62 Loi 65-99).

Délai de réponse: 72 heures à compter de la réception du présent courrier.

Fait à ${ville}, le ${date}

Vita Fresh — Direction des Ressources Humaines — Signature & Cachet :

Accusé de réception (date & signature du salarié) :`
      break

    case "fiche_paie":
      body = "[Généré via le moteur d'impression — utilisez le bouton Imprimer Bulletin]"
      break

    case "solde_tout_compte":
      body = `REÇU POUR SOLDE DE TOUT COMPTE
Art. 73-75 — Loi 65-99 — Code du Travail Marocain

Je soussigné(e), ${civ} ${nom}
CIN: ${cin} — N° CNSS: ${cnssNum}
Employé(e) en qualité de ${roleUp} depuis le ${dateEmb},

Déclare avoir reçu de ${company} la somme totale de: ${extra.montantTotal ?? "..."} DH
(en lettres: ${extra.montantLettres ?? "..."})

Détail:
— Salaire période (prorata)            : ${extra.salairePeriode ?? "..."} DH
— Indemnité compensatrice de préavis   : ${extra.indemPreavis ?? "..."} DH
— Indemnité de licenciement / départ   : ${extra.indemLicenciement ?? "..."} DH
— Congés payés non pris                : ${extra.congesNonPris ?? "..."} DH
— Autres                               : ${extra.autres ?? "0,00"} DH
TOTAL NET VERSÉ                        : ${extra.montantTotal ?? "..."} DH

Le salarié dispose de 60 jours pour dénoncer ce reçu par lettre recommandée (Art. 75).

Fait à ${ville}, le ${date}

Vita Fresh — Direction des Ressources Humaines
Signature & Cachet :       ${civ} ${nom} — "Reçu pour solde de tout compte" :`
      break

    case "rupture_conventionnelle":
      body = `CONVENTION DE RUPTURE DU CONTRAT
D'un commun accord — Art. 36 — Loi 65-99

ENTRE : ${company} (Employeur)
ET    : ${civ} ${nom} — CIN: ${cin} — Poste: ${roleUp}

Art. 1 — Rupture amiable prenant effet le ${extra.dateRupture ?? "..."}
Art. 2 — Indemnité transactionnelle: ${extra.indemTransac ?? "..."} DH net
Art. 3 — Documents remis à la date de rupture: certificat travail, CNSS, solde tout compte
Art. 4 — Renonciation mutuelle à tout recours ultérieur

Fait à ${ville}, le ${date}

Vita Fresh — Direction des Ressources Humaines
Signature & Cachet :       ${civ} ${nom} — Signature :`
      break

    case "conge_sans_solde":
      body = `AUTORISATION DE CONGÉ SANS SOLDE
Réf: CSS-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}

À : ${civ} ${nom} — Poste: ${roleUp}

Suite à votre demande du ${extra.dateDemande ?? date}, la Direction de ${company}
vous autorise un congé sans solde du ${dateEmb} au ${extra.dateFin ?? "..."}
(${extra.nbJours ?? "..."} jours calendaires).

Conditions:
— Poste maintenu jusqu'au retour
— Cotisations CNSS suspendues pendant la période
— Non-reprise sans préavis = procédure abandon de poste

Fait à ${ville}, le ${date}

Vita Fresh — Direction des Ressources Humaines — Signature & Cachet :`
      break

    default:
      body = ""
  }

  return body ? header + body : ""
}


// ─── EMPTY SALARIE FORM ───────────────────────────────────────────────────────

const EMPTY_SAL: Omit<Salarie, "id" | "createdBy" | "createdAt"> = {
  civilite:        "M.",
  nom:             "",
  prenom:          "",
  poste:           "",
  departement:     "",
  telephone:       "",
  email:           "",
  adresse:         "",
  ville:           "",
  cin:             "",
  cnss:            "",
  numCompteBancaire: "",
  banque:          "",
  dateEmbauche:    new Date().toISOString().split("T")[0],
  typeContrat:     "cdi",
  salaireBrut:     0,
  avances:         0,
  modePaiement:    "virement",
  statut:          "actif",
  nationalite:     "Marocaine",
  notes:           "",
  dossierComplet:  false,
}

// ─── Main Component ───────────────────────────────────────────────────────────

// ─── Excel / CSV helper ────────────────────────────────────────────────────────

// ─── Calcul paie Maroc 2026 ────────────────────────────────────────────────────
function calcPayroll(brut: number): { cnss: number; amo: number; ir: number; totalRetenues: number; net: number } {
  if (brut <= 0) return { cnss: 0, amo: 0, ir: 0, totalRetenues: 0, net: 0 }
  // CNSS salarié : 6.74% plafonné à 6 000 DH/mois
  const cnss = Math.min(brut, 6000) * 0.0674
  // AMO (CNOPS) : 4.52%
  const amo = brut * 0.0452
  // Abattement professionnel : 20% du brut, plafonné 2 500 DH/mois (30 000/an)
  const abattProf = Math.min(brut * 0.20, 2500)
  // Base IR = Brut - CNSS - AMO - Abattement
  const baseIR = Math.max(0, brut - cnss - amo - abattProf)
  // Barème IR mensuel 2026
  let ir = 0
  if (baseIR <= 2500)        { ir = 0 }
  else if (baseIR <= 4166)   { ir = baseIR * 0.10 - 250.00 }
  else if (baseIR <= 5000)   { ir = baseIR * 0.20 - 666.60 }
  else if (baseIR <= 6666)   { ir = baseIR * 0.30 - 1166.60 }
  else if (baseIR <= 15000)  { ir = baseIR * 0.34 - 1433.24 }
  else                        { ir = baseIR * 0.38 - 2033.24 }
  ir = Math.max(0, ir)
  const totalRetenues = cnss + amo + ir
  const net = Math.max(0, brut - totalRetenues)
  return { cnss, amo, ir, totalRetenues, net }
}

function exportFichePayeExcel(salaries: { s: Salarie | null; emp: string; brut: number }[], periode: string, societe: string) {
  const header = ["Nom complet", "CIN", "CNSS", "Poste", "Salaire Brut (DH)", "CNSS sal. (DH)", "AMO (DH)", "IR (DH)", "Total Retenues (DH)", "NET A PAYER (DH)", "Periode", "Societe"]
  const rows = salaries.map(({ s, emp, brut }) => {
    const calc = brut > 0 ? calcPayroll(brut) : { cnss: 0, amo: 0, ir: 0, totalRetenues: 0, net: 0 }
    return [
      s ? `${s.civilite} ${s.nom} ${s.prenom}` : emp,
      s?.cin ?? "",
      s?.cnss ?? "",
      s?.poste ?? "",
      brut.toFixed(2),
      calc.cnss.toFixed(2),
      calc.amo.toFixed(2),
      calc.ir.toFixed(2),
      calc.totalRetenues.toFixed(2),
      calc.net.toFixed(2),
      periode,
      societe,
    ]
  })
  const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n")
  const bom = "\uFEFF"
  const blob = new Blob([bom + csv], { type: "application/vnd.ms-excel;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a   = document.createElement("a")
  a.href = url
  a.download = `Fiches_Paie_${(periode ?? "").replace(/\s/g, "_")}.xls`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Document models ──────────────────────────────────────────────────────────

interface DocModel {
  id:      string
  type:    DocType
  titre:   string
  apercu:  string
  extras:  Record<string, string>
}

const DOC_MODELS: DocModel[] = [
  {
    id:    "m_cdi",
    type:  "contrat",
    titre: "Modele CDI standard",
    apercu:"Contrat CDI marocain avec clauses Code du Travail, periode d'essai 3 mois, conges 18 j/an.",
    extras:{ dateDebut: new Date().toISOString().split("T")[0], salaire: "4000", ville: "Casablanca" },
  },
  {
    id:    "m_att_travail",
    type:  "attestation_travail",
    titre: "Attestation de travail simple",
    apercu:"Attestation delivree a la demande du salarie pour valoir ce que de droit.",
    extras:{ ville: "Casablanca" },
  },
  {
    id:    "m_att_salaire",
    type:  "attestation_salaire",
    titre: "Attestation de salaire bancaire",
    apercu:"Attestation avec salaire brut et net, utile pour dossier bancaire ou visa.",
    extras:{ salaire: "5000", salaireNet: "4250", ville: "Casablanca" },
  },
  {
    id:    "m_paie_standard",
    type:  "fiche_paie",
    titre: "Fiche de paie standard",
    apercu:"Bulletin de paie mensuel avec calcul CNSS / AMO / IR conforme au Code du Travail 2024.",
    extras:{
      salaire:   "4000",
      heuresSup: "0",
      primes:    "0",
      modePaie:  "virement",
      periode:   new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    },
  },
  {
    id:    "m_paie_prime",
    type:  "fiche_paie",
    titre: "Fiche de paie avec prime exceptionnelle",
    apercu:"Bulletin incluant une prime exceptionnelle integree au brut pour calcul IR.",
    extras:{
      salaire:   "5000",
      heuresSup: "300",
      primes:    "1000",
      modePaie:  "virement",
      periode:   new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" }),
    },
  },
  {
    id:    "m_avert1",
    type:  "avertissement",
    titre: "Avertissement — retards repetitifs",
    apercu:"Lettre d'avertissement pour retards consecutifs, avec delai de reponse 48h.",
    extras:{ motif: "Retards repetitifs et injustifies sur les 30 derniers jours malgre les rappels oraux effectues par votre responsable hierarchique.", ville: "Casablanca" },
  },
  {
    id:    "m_avert2",
    type:  "avertissement",
    titre: "Avertissement — faute professionnelle",
    apercu:"Lettre d'avertissement pour manquement grave aux obligations professionnelles.",
    extras:{ motif: "Manquement grave aux obligations professionnelles constate le " + new Date().toLocaleDateString("fr-FR") + ". Comportement inapproprie envers un collegue et refus d'executer les instructions de votre superieur.", ville: "Casablanca" },
  },
  {
    id:    "m_mise_demeure",
    type:  "mise_en_demeure",
    titre: "Mise en demeure disciplinaire",
    apercu:"Mise en demeure formelle avant sanction, avis que tout nouvel incident entrainera un licenciement.",
    extras:{ motif: "Suite aux avertissements precedents restes sans effet, la direction est dans l'obligation de vous mettre formellement en demeure.", ville: "Casablanca" },
  },
]

export default function BOHRDocuments({ user }: { user: User }) {
  type TabType = "notifs" | "salaries" | "docs" | "paie" | "calculator" | "modeles"
  const [tab, setTab] = useState<TabType>("notifs")

  const [docs,      setDocs]      = useState<HRDoc[]>(getDocs)
  const [paiements, setPaiements] = useState<PaiementCycle[]>(getPaie)

  // RH Notifications
  const [notifs, setNotifs] = useState<RHNotification[]>(() => store.getRHNotifications())
  const unreadCount = notifs.filter(n => !n.lu).length

  const reloadNotifs = () => setNotifs(store.getRHNotifications())

  // Salaries state
  const [salaries,    setSalaries]    = useState<Salarie[]>(() => store.getSalaries())
  const [showSalForm, setShowSalForm] = useState(false)
  const [editingSal,  setEditingSal]  = useState<Salarie | null>(null)
  const [salForm,     setSalForm]     = useState<Omit<Salarie, "id" | "createdBy" | "createdAt">>(EMPTY_SAL)
  const [salSearch,   setSalSearch]   = useState("")

  const reloadSalaries = () => setSalaries(store.getSalaries())

  const openNewSal = () => {
    setEditingSal(null)
    setSalForm(EMPTY_SAL)
    setShowSalForm(true)
  }

  const openEditSal = (s: Salarie) => {
    setEditingSal(s)
    setSalForm({
      civilite:          s.civilite,
      nom:               s.nom,
      prenom:            s.prenom,
      poste:             s.poste,
      departement:       s.departement ?? "",
      telephone:         s.telephone ?? "",
      email:             s.email ?? "",
      adresse:           s.adresse ?? "",
      ville:             s.ville ?? "",
      cin:               s.cin ?? "",
      cnss:              s.cnss ?? "",
      numCompteBancaire: s.numCompteBancaire ?? "",
      banque:            s.banque ?? "",
      dateEmbauche:      s.dateEmbauche,
      datefinCdd:        s.datefinCdd,
      typeContrat:       s.typeContrat,
      salaireBrut:       s.salaireBrut,
      salaireNet:        s.salaireNet,
      avances:           s.avances,
      modePaiement:      s.modePaiement ?? "virement",
      nationalite:       s.nationalite ?? "Marocaine",
      dateNaissance:     s.dateNaissance,
      lieuNaissance:     s.lieuNaissance,
      diplome:           s.diplome,
      experienceAns:     s.experienceAns,
      statutFamilial:    s.statutFamilial,
      nbEnfants:         s.nbEnfants,
      statut:            s.statut,
      notes:             s.notes ?? "",
      dossierComplet:    s.dossierComplet ?? false,
    })
    setShowSalForm(true)
  }

  // Auto-generate matricule
  const generateMatricule = (poste: string): string => {
    const year = new Date().getFullYear().toString()
    const codeMap: Record<string, string> = {
      "livreur": "LIV", "prévendeur": "PRV", "prevendeur": "PRV",
      "magasinier": "MAG", "acheteur": "ACH", "dispatcheur": "DIS",
      "resp. logistique": "LOG", "resp. commercial": "COM", "financier": "FIN",
      "caissier": "CAS", "rh": "RH", "comptable": "CPT", "qualité": "QUA",
      "chef dépôt": "CDP", "admin": "ADM",
    }
    const key = (poste ?? "").toLowerCase().trim()
    const code = Object.entries(codeMap).find(([k]) => key.includes(k))?.[1] ?? "EMP"
    const existing = store.getSalaries?.().filter((s: {cin?: string}) => s.cin?.startsWith(`FLP-${year}-${code}-`)) ?? []
    const seq = (existing.length + 1).toString().padStart(3, "0")
    return `FLP-${year}-${code}-${seq}`
  }

  const handleSaveSal = () => {
    if (!(salForm.nom ?? "").trim() || !(salForm.prenom ?? "").trim() || !(salForm.poste ?? "").trim()) return
    const now = new Date().toISOString()
    if (editingSal) {
      store.updateSalarie(editingSal.id, {
        ...salForm,
        updatedBy: user.name,
        updatedAt: now,
        dossierComplet: Boolean(salForm.cin && salForm.cnss && salForm.adresse && salForm.salaireBrut > 0),
      })
    } else {
      // Auto-generate matricule if not set
      const matricule = (salForm as Record<string, unknown>).matricule as string || generateMatricule(salForm.poste)
      const s: Salarie = {
        ...salForm,
        id: genId(),
        cin: matricule,
        createdBy: user.name,
        createdAt: now,
        dossierComplet: Boolean(salForm.cin && salForm.cnss && salForm.adresse && salForm.salaireBrut > 0),
      }
      store.addSalarie(s)
      // Mark related RH notification as traite if exists
      const notifLiee = notifs.find(n => n.type === "nouveau_salarie" && n.salarieNom === `${salForm.nom} ${salForm.prenom}` && !n.traite)
      if (notifLiee) {
        store.markRHNotifTraite(notifLiee.id)
        reloadNotifs()
      }
    }
    reloadSalaries()
    setShowSalForm(false)
  }

  const deleteSal = (id: string) => {
    if (!confirm("Supprimer ce salarie ?")) return
    store.deleteSalarie(id)
    reloadSalaries()
  }

  const filteredSalaries = useMemo(() =>
    salaries.filter(s => {
      const q = salSearch.toLowerCase()
      return !q ||
        (s.nom ?? "").toLowerCase().includes(q) ||
        (s.prenom ?? "").toLowerCase().includes(q) ||
        (s.poste ?? "").toLowerCase().includes(q)
    }),
    [salaries, salSearch]
  )

  // Employees (users with system access)
  const employees = store.getUsers().filter(u => !["client", "fournisseur"].includes(u.role))

  const company = useMemo(() => {
    try {
      const cfg = JSON.parse(localStorage.getItem("fl_company_config") ?? "{}")
      return cfg.nom ?? "Vita Fresh"
    } catch { return "Vita Fresh" }
  }, [])

  const companyConfig = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("fl_company") ?? localStorage.getItem("fl_company_config") ?? "{}") }
    catch { return {} }
  }, [])

  // ── Doc Generator State ─────────────────────────────────────────────────────
  const [selEmployee,  setSelEmployee]  = useState("")
  const [selDocType,   setSelDocType]   = useState<DocType>("attestation_travail")
  const [docExtras,    setDocExtras]    = useState<Record<string, string>>({})
  const [preview,      setPreview]      = useState("")
  const [generating,   setGenerating]   = useState(false)
  const [docSaved,     setDocSaved]     = useState(false)

  const generatePreview = () => {
    const emp = employees.find(e => e.id === selEmployee)
    if (!emp) return
    setGenerating(true)
    const linkedSal = salaries.find(s =>
      s.nom === emp.name.split(" ")[0] || `${s.nom} ${s.prenom}` === emp.name
    )
    setTimeout(() => {
      const txt = generateDoc(selDocType, emp, docExtras, company, linkedSal)
      setPreview(txt)
      setGenerating(false)
    }, 300)
  }

  const saveDoc = () => {
    const emp = employees.find(e => e.id === selEmployee)
    if (!emp || !preview) return
    const doc: HRDoc = {
      id: genId(),
      userId: emp.id,
      userName: emp.name,
      userRole: emp.role,
      docType: selDocType,
      titre: `${DOC_LABELS[selDocType]} — ${emp.name}`,
      contenu: preview,
      dateDoc: new Date().toISOString().split("T")[0],
      statut: "brouillon",
      generePar: user.name,
      createdAt: new Date().toISOString(),
    }
    const updated = [doc, ...docs]
    saveDocs(updated); setDocs(updated)
    setPreview(""); setSelEmployee(""); setDocExtras({})
    setDocSaved(true)
    setTimeout(() => setDocSaved(false), 3000)
  }

  const deleteDoc = (id: string) => {
    const updated = docs.filter(d => d.id !== id)
    saveDocs(updated); setDocs(updated)
  }

  // ── Paiement State ──────────────────────────────────────────────────────────
  const [pForm, setPForm] = useState({
    userId: "", cycleType: "mensuel" as CycleType, montant: 0,
    dateDebut: new Date().toISOString().split("T")[0], dateFin: "", note: "", reference: "",
  })

  const addPaiement = () => {
    const emp = employees.find(e => e.id === pForm.userId)
    if (!emp || !pForm.montant) return
    const p: PaiementCycle = {
      id: genId(), userId: emp.id, userName: emp.name, userRole: emp.role,
      cycleType: pForm.cycleType, montant: pForm.montant, dateDebut: pForm.dateDebut,
      dateFin: pForm.dateFin || undefined, statut: "en_attente",
      note: pForm.note, reference: pForm.reference, validePar: user.name,
      createdAt: new Date().toISOString(),
    }
    const updated = [p, ...paiements]
    savePaie(updated); setPaiements(updated)
    setPForm({ userId: "", cycleType: "mensuel", montant: 0, dateDebut: new Date().toISOString().split("T")[0], dateFin: "", note: "", reference: "" })
  }

  const markPaid = (id: string) => {
    const updated = paiements.map(p => p.id === id ? { ...p, statut: "paye" as const } : p)
    savePaie(updated); setPaiements(updated)
  }

  // ── Payroll Calculator ──────────────────────────────────────────────────────
  const [calcBrut, setCalcBrut] = useState(4000)
  const calcResult = useMemo(() => calcPayroll(calcBrut), [calcBrut])

  // ── Build HRDocData shared builder ──────────────────────────────────────────
  const buildHRData = (emp: User, extra?: Record<string, string>, linkedSal?: Salarie): HRDocData => {
    const brut = parseFloat(extra?.salaire ?? "0") || (linkedSal?.salaireBrut ?? 0)
    const calc = brut > 0 ? calcPayroll(brut) : null
    const civ  = linkedSal?.civilite ?? emp.civilite ?? "M."
    return {
      employeNom:      `${civ} ${linkedSal ? `${linkedSal.nom} ${linkedSal.prenom}` : emp.name}`,
      employeRole:     (emp.role ?? "").replace(/_/g, " ").toUpperCase(),
      employeEmail:    linkedSal?.email ?? emp.email,
      employePhone:    linkedSal?.telephone ?? emp.telephone ?? emp.phone,
      employeMatricule:linkedSal?.cin ?? extra?.matricule,
      dateEmbauche:    linkedSal?.dateEmbauche ?? extra?.dateDebut,
      societeNom:      companyConfig.nom ?? company,
      societeAdresse:  companyConfig.adresse,
      societeTel:      companyConfig.telephone,
      societeIce:      companyConfig.ice,
      societeRC:       companyConfig.rc,
      societeIF:       companyConfig.if,
      societeLogo:     companyConfig.logo,
      societeVille:    companyConfig.ville,
      societePiedPage: companyConfig.piedDePageRH,
      docType:         selDocType,
      salaireBrut:     brut || undefined,
      netAPayer:       calc?.net,
      cnssRetenue:     calc?.cnss,
      amo:             calc?.amo,
      ir:              calc?.ir,
      heuresSup:       parseFloat(extra?.heuresSup ?? "0") || undefined,
      primes:          parseFloat(extra?.primes ?? "0") || undefined,
      modePaie:        extra?.modePaie ?? linkedSal?.modePaiement ?? "Virement bancaire",
      datePaie:        extra?.datePaie,
      periode:         extra?.periode,
      motif:           extra?.motif,
      ville:           extra?.ville ?? companyConfig.ville ?? "Casablanca",
    }
  }

  // ── Print handlers ──────────────────────────────────────────────────────────
  const handlePrintHR = (doc: HRDoc) => {
    const emp = employees.find(e => e.id === doc.userId)
    if (!emp) return
    const empP = paiements.filter(p => p.userId === doc.userId && p.cycleType === "mensuel")
    const lp   = empP.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const brut = lp?.montant ?? 0
    const calc = brut > 0 ? calcPayroll(brut) : null
    const civ  = emp.civilite ?? "M."
    const data: HRDocData = {
      employeNom:      `${civ} ${emp.name}`,
      employeRole:     (emp.role ?? "").replace(/_/g, " ").toUpperCase(),
      employeEmail:    emp.email,
      employePhone:    emp.telephone ?? emp.phone,
      societeNom:      companyConfig.nom ?? company,
      societeAdresse:  companyConfig.adresse,
      societeTel:      companyConfig.telephone,
      societeIce:      companyConfig.ice,
      societeRC:       companyConfig.rc,
      societeIF:       companyConfig.if,
      societeLogo:     companyConfig.logo,
      societeVille:    companyConfig.ville,
      societePiedPage: companyConfig.piedDePageRH,
      docType:         doc.docType,
      salaireBrut:     brut,
      netAPayer:       calc?.net,
      cnssRetenue:     calc?.cnss,
      amo:             calc?.amo,
      ir:              calc?.ir,
      modePaie:        lp?.reference ?? "Virement bancaire",
      periode:         doc.dateDoc ? new Date(doc.dateDoc).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : undefined,
      ville:           companyConfig.ville ?? "Casablanca",
    }
    printHRDoc(data)
  }

  const handlePrintNewHR = () => {
    const emp = employees.find(e => e.id === selEmployee)
    if (!emp) return
    const linkedSal = salaries.find(s => `${s.nom} ${s.prenom}` === emp.name)
    printHRDoc(buildHRData(emp, docExtras, linkedSal))
  }

  const handleDownloadWordNew = () => {
    const emp = employees.find(e => e.id === selEmployee)
    if (!emp) return
    const linkedSal = salaries.find(s => `${s.nom} ${s.prenom}` === emp.name)
    downloadHRDocAsWord(buildHRData(emp, docExtras, linkedSal))
  }

  const handleDownloadWordDoc = (doc: HRDoc) => {
    const emp = employees.find(e => e.id === doc.userId)
    if (!emp) return
    const empP = paiements.filter(p => p.userId === doc.userId && p.cycleType === "mensuel")
    const lp   = empP.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const brut = lp?.montant ?? 0
    const calc = brut > 0 ? calcPayroll(brut) : null
    const civ  = emp.civilite ?? "M."
    const data: HRDocData = {
      employeNom:      `${civ} ${emp.name}`,
      employeRole:     (emp.role ?? "").replace(/_/g, " ").toUpperCase(),
      employeEmail:    emp.email,
      employePhone:    emp.telephone ?? emp.phone,
      societeNom:      companyConfig.nom ?? company,
      societeAdresse:  companyConfig.adresse,
      societeIce:      companyConfig.ice,
      societeRC:       companyConfig.rc,
      societeIF:       companyConfig.if,
      societeLogo:     companyConfig.logo,
      societeVille:    companyConfig.ville,
      societePiedPage: companyConfig.piedDePageRH,
      docType:         doc.docType,
      salaireBrut:     brut,
      netAPayer:       calc?.net,
      cnssRetenue:     calc?.cnss,
      amo:             calc?.amo,
      ir:              calc?.ir,
      modePaie:        lp?.reference ?? "Virement bancaire",
      periode:         doc.dateDoc ? new Date(doc.dateDoc).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : undefined,
      ville:           companyConfig.ville ?? "Casablanca",
    }
    downloadHRDocAsWord(data)
  }

  const handleWhatsAppNew = () => {
    const emp = employees.find(e => e.id === selEmployee)
    if (!emp) return
    const phone = emp.telephone ?? emp.phone ?? ""
    const linkedSal = salaries.find(s => `${s.nom} ${s.prenom}` === emp.name)
    const d = buildHRData(emp, docExtras, linkedSal)
    const txt = buildHRWhatsAppText(d)
    sendWhatsApp(phone, txt)
  }

  const handleWhatsAppDoc = (doc: HRDoc) => {
    const emp = employees.find(e => e.id === doc.userId)
    const phone = emp?.telephone ?? emp?.phone ?? ""
    const empP = paiements.filter(p => p.userId === doc.userId && p.cycleType === "mensuel")
    const lp   = empP.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    const txt = buildHRWhatsAppText({
      docType: doc.docType,
      employeNom: doc.userName,
      societeNom: companyConfig.nom ?? company,
      salaireBrut: lp?.montant,
      netAPayer: lp ? calcPayroll(lp.montant).net : undefined,
      periode: doc.dateDoc ? new Date(doc.dateDoc).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : undefined,
    })
    sendWhatsApp(phone, txt)
  }

  // Fiche paie auto-calc on salary change
  if (selDocType === "fiche_paie") {
    const brut = parseFloat(docExtras.salaire ?? "0")
    if (brut > 0 && !docExtras._calcDone) {
      const r = calcPayroll(brut)
      setTimeout(() => setDocExtras(x => ({
        ...x, _calcDone: "1",
        cnss: r.cnss.toFixed(2), amo: r.amo.toFixed(2),
        ir: r.ir.toFixed(2), totalRetenues: r.totalRetenues.toFixed(2),
        net: r.net.toFixed(2), brut: brut.toFixed(2),
      })), 0)
    }
  }

  const canEdit = user.role === "super_super_admin" || user.role === "admin" || user.role === "super_admin" || user.role === "rh_manager"

  // ── Field helper ──────────────────────────────────────────────────────────────
  const Field = ({ label, value, onChange, type = "text", placeholder = "" }: {
    label: string
    value: string
    onChange: (v: string) => void
    type?: string
    placeholder?: string
  }) => (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:bg-white transition-colors"
      />
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-slate-50 min-h-screen">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-5 py-4 shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Ressources Humaines — Gestion de la Paie</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Salaries, contrats, attestations, fiches de paie — cycles journalier / hebdo / mensuel / avance
            </p>
          </div>
          {canEdit && (
            <button
              onClick={openNewSal}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Nouveau salarie
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 overflow-x-auto pb-0.5">
          {([
            ["notifs",     `Notifications${unreadCount > 0 ? ` (${unreadCount})` : ""}`],
            ["salaries",   `Salaries (${salaries.length})`],
            ["docs",       "Documents RH"],
            ["paie",       "Cycles de Paiement"],
            ["calculator", "Simulateur Paie"],
            ["modeles",    "Modeles"],
          ] as const).map(([v, l]) => (
            <button key={v} onClick={() => setTab(v)}
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg whitespace-nowrap transition-colors ${
                tab === v
                  ? v === "notifs" && unreadCount > 0
                    ? "bg-amber-500 text-white"
                    : "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-5">

        {/* ── TAB: NOTIFICATIONS ───────────────────────────────────────────── */}
        {tab === "notifs" && (
          <div className="max-w-3xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-slate-800">
                Notifications RH
                {unreadCount > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-black">
                    {unreadCount}
                  </span>
                )}
              </h2>
              {notifs.some(n => !n.lu) && (
                <button
                  onClick={() => {
                    notifs.filter(n => !n.lu).forEach(n => store.markRHNotifLu(n.id))
                    reloadNotifs()
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline">
                  Tout marquer comme lu
                </button>
              )}
            </div>

            {notifs.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p className="text-sm font-medium">Aucune notification</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {notifs.map(n => (
                  <div
                    key={n.id}
                    className={`rounded-2xl border p-4 flex gap-3 items-start transition-all ${
                      n.traite
                        ? "bg-slate-50 border-slate-200 opacity-60"
                        : n.lu
                          ? "bg-white border-slate-200"
                          : "bg-amber-50 border-amber-300 shadow-sm"
                    }`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                      n.traite ? "bg-slate-200" : "bg-amber-100"
                    }`}>
                      <svg className={`w-4 h-4 ${n.traite ? "text-slate-400" : "text-amber-600"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className={`text-sm font-bold ${n.traite ? "text-slate-500" : "text-slate-900"}`}>{n.titre}</p>
                        {!n.lu && !n.traite && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">NOUVEAU</span>
                        )}
                        {n.traite && (
                          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">TRAITE</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">{n.message}</p>
                      <p className="text-[10px] text-slate-400 mt-2">
                        {new Date(n.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        {" "}&bull;{" "}Par {n.createdBy}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {!n.lu && (
                        <button
                          onClick={() => { store.markRHNotifLu(n.id); reloadNotifs() }}
                          title="Marquer comme lu"
                          className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-100 transition-colors">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      )}
                      {!n.traite && n.userId && (
                        <button
                          onClick={() => {
                            setTab("salaries")
                            openNewSal()
                          }}
                          title="Completer le dossier"
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                          Completer
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: SALARIES ────────────────────────────────────────────────── */}
        {tab === "salaries" && (
          <div className="flex flex-col gap-5 max-w-6xl">

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                ["actif",         STATUT_SAL_COLORS.actif],
                ["periode_essai", STATUT_SAL_COLORS.periode_essai],
                ["conge",         STATUT_SAL_COLORS.conge],
                ["inactif",       STATUT_SAL_COLORS.inactif],
              ] as const).map(([s, col]) => (
                <div key={s} className={`rounded-xl px-4 py-3 border ${col} border-current/20 flex items-center justify-between`}>
                  <span className="text-xs font-semibold">{STATUT_SALARIE_LABELS[s]}</span>
                  <span className="text-xl font-black">{salaries.filter(x => x.statut === s).length}</span>
                </div>
              ))}
            </div>

            {/* Search + add */}
            <div className="flex gap-2 flex-wrap items-center">
              <div className="flex-1 min-w-48 relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={salSearch}
                  onChange={e => setSalSearch(e.target.value)}
                  placeholder="Rechercher salarie..."
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              {canEdit && (
                <button onClick={openNewSal}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Ajouter salarie
                </button>
              )}
            </div>

            {/* Table */}
            {filteredSalaries.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-16 text-slate-400">
                <svg className="w-14 h-14 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm font-medium">Aucun salarie enregistre</p>
                {canEdit && (
                  <button onClick={openNewSal} className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl">
                    Ajouter le premier salarie
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-900 text-white">
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Salarie</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Poste</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Contrat</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Embauche</th>
                        <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide">Salaire brut</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide">Statut</th>
                        <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide">Avert.</th>
                        <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide">Dossier</th>
                        <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSalaries.map((s, i) => (
                        <tr key={s.id} className={`border-t border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-blue-50/30 transition-colors`}>
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-bold text-slate-900">{s.civilite} {s.nom} {s.prenom}</p>
                              <p className="text-[11px] text-slate-400">{s.cin ? `CIN: ${s.cin}` : "CIN non renseigne"} &bull; {s.telephone ?? "—"}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800">{s.poste}</p>
                            {s.departement && <p className="text-[11px] text-slate-400">{s.departement}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
                              {(s.typeContrat ?? "").toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-600 text-xs">
                            {new Date(s.dateEmbauche).toLocaleDateString("fr-FR")}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            {s.salaireBrut.toLocaleString("fr-MA")} DH
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${STATUT_SAL_COLORS[s.statut]}`}>
                              {STATUT_SALARIE_LABELS[s.statut]}
                            </span>
                          </td>
                          {/* Avertissements counter */}
                          <td className="px-4 py-3 text-center">
                            {(() => {
                              const nbAvert = docs.filter(d =>
                                d.docType === "avertissement" && (
                                  d.userId === s.id ||
                                  d.userName === `${s.nom} ${s.prenom}` ||
                                  d.userName === `${s.civilite} ${s.nom} ${s.prenom}`
                                )
                              ).length
                              if (nbAvert === 0) return <span className="text-slate-300 text-xs font-bold">—</span>
                              return (
                                <button
                                  onClick={() => setTab("docs")}
                                  title="Voir les avertissements"
                                  className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black transition-colors ${
                                    nbAvert >= 3 ? "bg-red-600 text-white" : nbAvert === 2 ? "bg-orange-500 text-white" : "bg-amber-400 text-slate-900"
                                  }`}>
                                  {nbAvert}
                                </button>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {s.dossierComplet ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                Complet
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" /></svg>
                                Incomplet
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-center">
                              {canEdit && (
                                <button onClick={() => openEditSal(s)} title="Modifier"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                              )}
                              {/* WhatsApp salarie */}
                              {s.telephone && (
                                <button
                                  onClick={() => {
                                    const msg = [
                                      `*${company}*`,
                                      `Bonjour ${s.civilite} ${s.nom} ${s.prenom},`,
                                      `Votre dossier RH a ete mis a jour.`,
                                      `Poste : ${s.poste}`,
                                      `Contrat : ${(s.typeContrat ?? "").toUpperCase()}`,
                                      `Statut : ${STATUT_SALARIE_LABELS[s.statut]}`,
                                    ].join("\n")
                                    sendWhatsApp(s.telephone!, msg)
                                  }}
                                  title="WhatsApp salarie"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                  </svg>
                                </button>
                              )}
                              {canEdit && (
                                <button onClick={() => deleteSal(s.id)} title="Supprimer"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: DOCS ─────────────────────────────────────────────────────── */}
        {tab === "docs" && (
          <div className="flex flex-col gap-5 max-w-5xl">

            {canEdit && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Generateur de document RH
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Employe (acces systeme)</label>
                    <select value={selEmployee} onChange={e => setSelEmployee(e.target.value)}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                      <option value="">-- Choisir --</option>
                      {employees.map(e => (
                        <option key={e.id} value={e.id}>
                          {e.civilite ? `${e.civilite} ` : ""}{e.name} — {(e.role ?? "").replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Type de document</label>
                    <select value={selDocType} onChange={e => { setSelDocType(e.target.value as DocType); setPreview(""); setDocExtras({}) }}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                      {Object.entries(DOC_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Ville</label>
                    <input value={docExtras.ville ?? ""} onChange={e => setDocExtras(x => ({ ...x, ville: e.target.value }))}
                      placeholder="Casablanca"
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>

                  {["contrat", "attestation_salaire", "fiche_paie"].includes(selDocType) && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-600">Salaire brut (DH)</label>
                        <input type="number" value={docExtras.salaire ?? ""} onChange={e => setDocExtras(x => ({ ...x, salaire: e.target.value, _calcDone: "" }))}
                          placeholder="Ex: 4000"
                          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-600">Date d&apos;embauche</label>
                        <input type="date" value={docExtras.dateDebut ?? ""} onChange={e => setDocExtras(x => ({ ...x, dateDebut: e.target.value }))}
                          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                      </div>
                    </>
                  )}

                  {selDocType === "fiche_paie" && (
                    <>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-600">Periode (mois/annee)</label>
                        <input value={docExtras.periode ?? ""} onChange={e => setDocExtras(x => ({ ...x, periode: e.target.value }))}
                          placeholder="Juin 2025"
                          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-600">Heures supplementaires (DH)</label>
                        <input type="number" value={docExtras.heuresSup ?? ""} onChange={e => setDocExtras(x => ({ ...x, heuresSup: e.target.value }))}
                          placeholder="0"
                          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-600">Primes (DH)</label>
                        <input type="number" value={docExtras.primes ?? ""} onChange={e => setDocExtras(x => ({ ...x, primes: e.target.value }))}
                          placeholder="0"
                          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-600">Mode de paiement</label>
                        <select value={docExtras.modePaie ?? "virement"} onChange={e => setDocExtras(x => ({ ...x, modePaie: e.target.value }))}
                          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                          <option value="virement">Virement bancaire</option>
                          <option value="cheque">Cheque</option>
                          <option value="especes">Especes</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold text-slate-600">Date de paiement</label>
                        <input type="date" value={docExtras.datePaie ?? ""} onChange={e => setDocExtras(x => ({ ...x, datePaie: e.target.value }))}
                          className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                      </div>
                    </>
                  )}

                  {selDocType === "avertissement" && (
                    <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
                      <label className="text-xs font-semibold text-slate-600">Motif de l&apos;avertissement</label>
                      <textarea value={docExtras.motif ?? ""} onChange={e => setDocExtras(x => ({ ...x, motif: e.target.value }))}
                        rows={3} placeholder="Decrivez le manquement constate..."
                        className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" />
                    </div>
                  )}
                </div>

                {/* Auto-calc display for paie */}
                {selDocType === "fiche_paie" && docExtras.cnss && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200">
                    {[
                      { l: "CNSS (6.74%)",     v: `-${parseFloat(docExtras.cnss).toFixed(2)} DH`,     c: "text-red-600" },
                      { l: "AMO (4.52%)",      v: `-${parseFloat(docExtras.amo ?? "0").toFixed(2)} DH`, c: "text-red-600" },
                      { l: "IR (progressif)",  v: `-${parseFloat(docExtras.ir ?? "0").toFixed(2)} DH`,  c: "text-red-600" },
                      { l: "NET A PAYER",      v: `${parseFloat(docExtras.net ?? "0").toFixed(2)} DH`,  c: "text-emerald-700 font-black" },
                    ].map(r => (
                      <div key={r.l} className="text-center">
                        <p className="text-[10px] text-slate-500 font-medium">{r.l}</p>
                        <p className={`text-sm font-bold ${r.c}`}>{r.v}</p>
                      </div>
                    ))}
                  </div>
                )}

                {docSaved && (
                  <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    Document sauvegarde avec succes
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  <button onClick={generatePreview} disabled={!selEmployee || generating}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm font-semibold rounded-xl hover:bg-slate-900 transition-colors disabled:opacity-40">
                    {generating
                      ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                    Apercu
                  </button>
                  <button onClick={handlePrintNewHR} disabled={!selEmployee}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-40">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Imprimer
                  </button>
                  <button onClick={handleDownloadWordNew} disabled={!selEmployee}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Word (.doc)
                  </button>
                  <button onClick={handleWhatsAppNew} disabled={!selEmployee}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-colors disabled:opacity-40">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp
                  </button>
                  {preview && (
                    <button onClick={saveDoc}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                      Sauvegarder
                    </button>
                  )}
                </div>

                {/* Apercu texte */}
                {preview && (
                  <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-64 overflow-auto">
                    <pre className="text-xs text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">{preview}</pre>
                  </div>
                )}
              </div>
            )}

            {/* Documents list */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-bold text-slate-800">{docs.length} document(s) enregistre(s)</p>
                {docs.some(d => d.docType === "fiche_paie") && (
                  <button
                    onClick={() => {
                      const periode = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                      const rows = salaries.map(s => {
                        const emp = employees.find(e => `${e.name}` === `${s.nom} ${s.prenom}` || e.name === s.nom)
                        const lp = paiements
                          .filter(p => p.cycleType === "mensuel" && (p.userId === emp?.id || p.userName === `${s.nom} ${s.prenom}`))
                          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
                        return { s, emp: `${s.civilite} ${s.nom} ${s.prenom}`, brut: lp?.montant ?? s.salaireBrut }
                      })
                      exportFichePayeExcel(rows, periode, company)
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-emerald-700 text-white text-xs font-bold rounded-xl hover:bg-emerald-800 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Exporter fiches de paie (.xls)
                  </button>
                )}
              </div>
              {docs.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
                  <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm">Aucun document genere pour l&apos;instant</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Document</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Employe</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Date</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Statut</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Genere par</th>
                        <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((doc, i) => (
                        <tr key={doc.id} className={`border-t border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/40"} hover:bg-blue-50/20 transition-colors`}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900 text-sm">{DOC_LABELS[doc.docType as DocType]}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-700 font-medium">{doc.userName}</td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {doc.dateDoc ? new Date(doc.dateDoc).toLocaleDateString("fr-FR") : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUT_DOC_COLORS[doc.statut] ?? "bg-slate-100 text-slate-600"}`}>
                              {(doc.statut ?? "").charAt(0).toUpperCase() + (doc.statut ?? "").slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">{doc.generePar}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-center">
                              <button onClick={() => handlePrintHR(doc)} title="Imprimer"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                              </button>
                              <button onClick={() => handleDownloadWordDoc(doc)} title="Telecharger Word"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                              </button>
                              <button onClick={() => handleWhatsAppDoc(doc)} title="WhatsApp"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                </svg>
                              </button>
                              {/* Excel export for fiche de paie */}
                              {doc.docType === "fiche_paie" && (
                                <button
                                  onClick={() => {
                                    const emp = employees.find(e => e.id === doc.userId)
                                    const linkedSal = salaries.find(s => `${s.nom} ${s.prenom}` === doc.userName || `${s.civilite} ${s.nom} ${s.prenom}` === doc.userName)
                                    const lp = paiements.filter(p => p.userId === doc.userId && p.cycleType === "mensuel").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
                                    const brut = lp?.montant ?? linkedSal?.salaireBrut ?? 0
                                    const periode = doc.dateDoc ? new Date(doc.dateDoc).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : "—"
                                    exportFichePayeExcel([{ s: linkedSal ?? null, emp: doc.userName, brut }], periode, company)
                                  }}
                                  title="Exporter Excel (.xls)"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                </button>
                              )}
                              {canEdit && (
                                <button onClick={() => deleteDoc(doc.id)} title="Supprimer"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </div>
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

        {/* ── TAB: PAIE ─────────────────────────────────────────────────────── */}
        {tab === "paie" && (
          <div className="flex flex-col gap-5 max-w-5xl">
            {canEdit && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="font-bold text-slate-800 text-sm mb-4">Nouveau cycle de paiement</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Employe</label>
                    <select value={pForm.userId} onChange={e => setPForm(f => ({ ...f, userId: e.target.value }))}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                      <option value="">-- Choisir --</option>
                      {employees.map(e => (
                        <option key={e.id} value={e.id}>
                          {e.civilite ? `${e.civilite} ` : ""}{e.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Type de cycle</label>
                    <select value={pForm.cycleType} onChange={e => setPForm(f => ({ ...f, cycleType: e.target.value as CycleType }))}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                      {Object.entries(CYCLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Montant (DH)</label>
                    <input type="number" value={pForm.montant || ""} onChange={e => setPForm(f => ({ ...f, montant: parseFloat(e.target.value) || 0 }))}
                      placeholder="Ex: 4000"
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Date debut</label>
                    <input type="date" value={pForm.dateDebut} onChange={e => setPForm(f => ({ ...f, dateDebut: e.target.value }))}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Date fin (optionnel)</label>
                    <input type="date" value={pForm.dateFin} onChange={e => setPForm(f => ({ ...f, dateFin: e.target.value }))}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Reference / Virement</label>
                    <input value={pForm.reference} onChange={e => setPForm(f => ({ ...f, reference: e.target.value }))}
                      placeholder="VIR-2025-001"
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                  <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
                    <label className="text-xs font-semibold text-slate-600">Note</label>
                    <input value={pForm.note} onChange={e => setPForm(f => ({ ...f, note: e.target.value }))}
                      placeholder="Avance sur salaire, prime exceptionnelle..."
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                  </div>
                </div>
                <button onClick={addPaiement} disabled={!pForm.userId || !pForm.montant}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-40 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Enregistrer le paiement
                </button>
              </div>
            )}

            {/* Paiements list */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100">
                <p className="text-sm font-bold text-slate-800">{paiements.length} paiement(s) enregistre(s)</p>
              </div>
              {paiements.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-slate-400">
                  <p className="text-sm">Aucun paiement enregistre</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Employe</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Type</th>
                        <th className="text-right px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Montant</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Periode</th>
                        <th className="text-left px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Statut</th>
                        <th className="text-center px-4 py-2.5 text-xs font-bold text-slate-600 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paiements.map((p, i) => (
                        <tr key={p.id} className={`border-t border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}>
                          <td className="px-4 py-3 font-medium text-slate-900">{p.userName}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${CYCLE_COLORS[p.cycleType]}`}>
                              {CYCLE_LABELS[p.cycleType].split(" ")[0]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            {p.montant.toLocaleString("fr-MA")} DH
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-xs">
                            {new Date(p.dateDebut).toLocaleDateString("fr-FR")}
                            {p.dateFin ? ` → ${new Date(p.dateFin).toLocaleDateString("fr-FR")}` : ""}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              p.statut === "paye" ? "bg-emerald-100 text-emerald-700"
                              : p.statut === "annule" ? "bg-red-100 text-red-600"
                              : "bg-amber-100 text-amber-700"
                            }`}>
                              {p.statut === "paye" ? "Paye" : p.statut === "annule" ? "Annule" : "En attente"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5 justify-center flex-wrap">
                              {canEdit && p.statut === "en_attente" && (
                                <button onClick={() => markPaid(p.id)}
                                  className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors">
                                  Marquer paye
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  const emp = employees.find(e => e.id === p.userId)
                                  const phone = emp?.telephone ?? emp?.phone ?? ""
                                  const msg = [
                                    `*Confirmation de paiement — ${company}*`,
                                    `${emp?.civilite ? `${emp.civilite} ` : ""}${p.userName}`,
                                    `Type : ${CYCLE_LABELS[p.cycleType]}`,
                                    `Montant : ${p.montant.toLocaleString("fr-MA")} DH`,
                                    `Periode : ${new Date(p.dateDebut).toLocaleDateString("fr-FR")}`,
                                    `Statut : ${p.statut === "paye" ? "PAYE" : "En attente"}`,
                                    p.reference ? `Ref : ${p.reference}` : "",
                                  ].filter(Boolean).join("\n")
                                  sendWhatsApp(phone, msg)
                                }}
                                title="WhatsApp"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                </svg>
                              </button>
                            </div>
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

        {/* ── TAB: CALCULATOR ──────────────────────────────────────────────── */}
        {tab === "calculator" && (
          <div className="max-w-2xl">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M12 7h.01M15 7h.01M9 7H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M7 7V5a2 2 0 012-2h8a2 2 0 012 2v2" />
                </svg>
                Simulateur de paie marocain
              </h3>
              <div className="flex flex-col gap-2 mb-5">
                <label className="text-xs font-semibold text-slate-600">Salaire brut mensuel (DH)</label>
                <input type="number" min={0} step={100} value={calcBrut}
                  onChange={e => setCalcBrut(parseFloat(e.target.value) || 0)}
                  className="px-4 py-3 border border-slate-200 rounded-xl text-lg font-bold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
              <div className="flex flex-col gap-2">
                {[
                  { label: "Salaire BRUT",                           val: calcBrut,                  color: "bg-slate-100",   text: "text-slate-800" },
                  { label: "CNSS salarie (6.74% / plaf. 6 000 DH)", val: -calcResult.cnss,           color: "bg-red-50",      text: "text-red-700"   },
                  { label: "AMO (4.52% / sans plafond)",             val: -calcResult.amo,            color: "bg-red-50",      text: "text-red-700"   },
                  { label: "IR (bareme progressif 2024-2025)",       val: -calcResult.ir,             color: "bg-red-50",      text: "text-red-700"   },
                  { label: "Total retenues",                         val: -calcResult.totalRetenues,  color: "bg-orange-50",   text: "text-orange-700"},
                ].map(r => (
                  <div key={r.label} className={`flex items-center justify-between px-4 py-2.5 rounded-xl ${r.color}`}>
                    <span className="text-sm font-medium text-slate-700">{r.label}</span>
                    <span className={`font-bold text-sm ${r.text}`}>
                      {r.val >= 0 ? "" : "- "}{Math.abs(r.val).toFixed(2)} DH
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-3.5 rounded-xl bg-emerald-600 mt-2">
                  <span className="font-bold text-white text-sm">NET A PAYER</span>
                  <span className="text-xl font-black text-white">{calcResult.net.toFixed(2)} DH</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-2 text-center leading-relaxed">
                  Calcul conforme au Code du Travail marocain (Loi 65-99)<br />
                  CNSS plafonne base 6 000 DH — AMO sans plafond — IR bareme 2024-2025
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: MODELES ─────────────────────────────────────────────────── */}
        {tab === "modeles" && (
          <div className="flex flex-col gap-5 max-w-5xl">

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-bold text-slate-900">Modeles de documents RH</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Selectionnez un modele pour le pre-remplir dans le generateur de documents.
                </p>
              </div>
              <button
                onClick={() => setTab("docs")}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Aller au generateur
              </button>
            </div>

            {/* Models grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {DOC_MODELS.map(m => {
                const isAvert = m.type === "avertissement" || m.type === "mise_en_demeure"
                const isPaie  = m.type === "fiche_paie"
                const isContr = m.type === "contrat"
                const accent  = isAvert ? { border: "border-red-200", bg: "bg-red-50", badge: "bg-red-100 text-red-700", icon: "text-red-500" }
                              : isPaie  ? { border: "border-emerald-200", bg: "bg-emerald-50", badge: "bg-emerald-100 text-emerald-700", icon: "text-emerald-600" }
                              : isContr ? { border: "border-blue-200", bg: "bg-blue-50", badge: "bg-blue-100 text-blue-700", icon: "text-blue-500" }
                              :           { border: "border-slate-200", bg: "bg-slate-50", badge: "bg-slate-100 text-slate-600", icon: "text-slate-500" }
                return (
                  <div key={m.id}
                    className={`bg-white rounded-2xl border ${accent.border} shadow-sm flex flex-col gap-4 p-5 hover:shadow-md transition-shadow`}>
                    {/* Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className={`w-9 h-9 rounded-xl ${accent.bg} flex items-center justify-center shrink-0`}>
                        {isPaie ? (
                          <svg className={`w-5 h-5 ${accent.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M12 7h.01M15 7h.01M9 7H7a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-2M7 7V5a2 2 0 012-2h8a2 2 0 012 2v2" />
                          </svg>
                        ) : isAvert ? (
                          <svg className={`w-5 h-5 ${accent.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        ) : (
                          <svg className={`w-5 h-5 ${accent.icon}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        )}
                      </div>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${accent.badge}`}>
                        {DOC_LABELS[m.type]}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5 flex-1">
                      <p className="text-sm font-bold text-slate-900 leading-tight">{m.titre}</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{m.apercu}</p>
                    </div>

                    {canEdit && (
                      <button
                        onClick={() => {
                          setSelDocType(m.type)
                          setDocExtras({ ...m.extras })
                          setPreview("")
                          setTab("docs")
                        }}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                          isAvert ? "bg-red-600 text-white hover:bg-red-700"
                          : isPaie  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-slate-900 text-white hover:bg-slate-700"
                        }`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Utiliser ce modele
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Avertissements global counter */}
            {salaries.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <h3 className="font-bold text-slate-800 text-sm mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Suivi des avertissements par salarie
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 uppercase">Salarie</th>
                        <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 uppercase">Poste</th>
                        <th className="text-center px-3 py-2 text-xs font-bold text-slate-500 uppercase">Avertissements</th>
                        <th className="text-center px-3 py-2 text-xs font-bold text-slate-500 uppercase">Mises en demeure</th>
                        <th className="text-left px-3 py-2 text-xs font-bold text-slate-500 uppercase">Risque</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salaries
                        .map(s => {
                          const avertNb = docs.filter(d => d.docType === "avertissement" && (d.userName.includes(s.nom) || d.userName.includes(s.prenom))).length
                          const miseNb  = docs.filter(d => d.docType === "mise_en_demeure" && (d.userName.includes(s.nom) || d.userName.includes(s.prenom))).length
                          return { s, avertNb, miseNb }
                        })
                        .sort((a, b) => (b.avertNb + b.miseNb * 2) - (a.avertNb + a.miseNb * 2))
                        .map(({ s, avertNb, miseNb }) => {
                          const risk = miseNb > 0 ? "critique" : avertNb >= 3 ? "eleve" : avertNb === 2 ? "moyen" : avertNb === 1 ? "faible" : "aucun"
                          const riskColors: Record<string, string> = {
                            critique: "bg-red-600 text-white",
                            eleve:    "bg-orange-500 text-white",
                            moyen:    "bg-amber-400 text-slate-900",
                            faible:   "bg-yellow-200 text-yellow-800",
                            aucun:    "bg-slate-100 text-slate-500",
                          }
                          return (
                            <tr key={s.id} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                              <td className="px-3 py-2.5 font-semibold text-slate-900 text-sm">
                                {s.civilite} {s.nom} {s.prenom}
                              </td>
                              <td className="px-3 py-2.5 text-slate-500 text-xs">{s.poste}</td>
                              <td className="px-3 py-2.5 text-center">
                                {avertNb === 0 ? (
                                  <span className="text-slate-300 text-xs font-bold">—</span>
                                ) : (
                                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black ${
                                    avertNb >= 3 ? "bg-orange-500 text-white" : avertNb === 2 ? "bg-amber-400 text-slate-900" : "bg-yellow-200 text-yellow-800"
                                  }`}>
                                    {avertNb}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {miseNb === 0 ? (
                                  <span className="text-slate-300 text-xs font-bold">—</span>
                                ) : (
                                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black bg-red-600 text-white">
                                    {miseNb}
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize ${riskColors[risk]}`}>
                                  {risk}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── SALARIE FORM MODAL ──────────────────────────────────────────────── */}
      {showSalForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-8 pb-4 px-4 bg-black/50 overflow-auto"
          onClick={e => e.target === e.currentTarget && setShowSalForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl animate-in slide-in-from-top-4">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-900 rounded-t-2xl">
              <div>
                <h3 className="font-bold text-white text-sm">
                  {editingSal ? `Modifier le dossier — ${editingSal.civilite} ${editingSal.nom} ${editingSal.prenom}` : "Nouveau salarie — Dossier administratif"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {editingSal ? "Modification du dossier RH complet" : "Ce salarie n&apos;a pas acces au systeme"}
                </p>
              </div>
              <button onClick={() => setShowSalForm(false)}
                className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-6 overflow-auto max-h-[75vh]">

              {/* Civilite */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Civilite *</h4>
                <div className="flex gap-2 flex-wrap">
                  {(["M.", "Mme", "Dr.", "Pr."] as Civilite[]).map(c => (
                    <button key={c} type="button"
                      onClick={() => setSalForm(f => ({ ...f, civilite: c }))}
                      className={`px-5 py-2 rounded-xl text-sm font-bold border transition-all ${
                        salForm.civilite === c
                          ? "bg-slate-900 text-white border-slate-900"
                          : "border-slate-200 text-slate-500 hover:border-slate-400"
                      }`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Identite */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Identite</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Nom *" value={salForm.nom} onChange={v => setSalForm(f => ({ ...f, nom: v }))} placeholder="ALAMI" />
                  <Field label="Prenom *" value={salForm.prenom} onChange={v => setSalForm(f => ({ ...f, prenom: v }))} placeholder="Mohamed" />
                  <Field label="CIN" value={salForm.cin ?? ""} onChange={v => setSalForm(f => ({ ...f, cin: v }))} placeholder="AB123456" />
                  <Field label="Nationalite" value={salForm.nationalite ?? ""} onChange={v => setSalForm(f => ({ ...f, nationalite: v }))} placeholder="Marocaine" />
                  <Field label="Date de naissance" value={salForm.dateNaissance ?? ""} onChange={v => setSalForm(f => ({ ...f, dateNaissance: v }))} type="date" />
                  <Field label="Lieu de naissance" value={salForm.lieuNaissance ?? ""} onChange={v => setSalForm(f => ({ ...f, lieuNaissance: v }))} placeholder="Casablanca" />
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Situation familiale</label>
                    <select value={salForm.statutFamilial ?? ""} onChange={e => setSalForm(f => ({ ...f, statutFamilial: e.target.value as Salarie["statutFamilial"] }))}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                      <option value="">-- Choisir --</option>
                      <option value="celibataire">Celibataire</option>
                      <option value="marie">Marie(e)</option>
                      <option value="divorce">Divorce(e)</option>
                      <option value="veuf">Veuf / Veuve</option>
                    </select>
                  </div>
                  <Field label="Nombre d&apos;enfants" value={String(salForm.nbEnfants ?? "")} onChange={v => setSalForm(f => ({ ...f, nbEnfants: parseInt(v) || 0 }))} type="number" placeholder="0" />
                </div>
              </div>

              {/* Coordonnees */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Coordonnees</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Telephone (WhatsApp)" value={salForm.telephone ?? ""} onChange={v => setSalForm(f => ({ ...f, telephone: v }))} placeholder="212661234567" />
                  <Field label="Email" value={salForm.email ?? ""} onChange={v => setSalForm(f => ({ ...f, email: v }))} type="email" placeholder="prenom.nom@societe.ma" />
                  <div className="sm:col-span-2">
                    <Field label="Adresse complete" value={salForm.adresse ?? ""} onChange={v => setSalForm(f => ({ ...f, adresse: v }))} placeholder="N rue, quartier, ville" />
                  </div>
                  <Field label="Ville" value={salForm.ville ?? ""} onChange={v => setSalForm(f => ({ ...f, ville: v }))} placeholder="Casablanca" />
                </div>
              </div>

              {/* Poste */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Poste &amp; Contrat</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Poste / Fonction *" value={salForm.poste} onChange={v => setSalForm(f => ({ ...f, poste: v }))} placeholder="Chauffeur livreur" />
                  <Field label="Departement" value={salForm.departement ?? ""} onChange={v => setSalForm(f => ({ ...f, departement: v }))} placeholder="Logistique" />
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Type de contrat *</label>
                    <select value={salForm.typeContrat} onChange={e => setSalForm(f => ({ ...f, typeContrat: e.target.value as TypeContrat }))}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                      {Object.entries(TYPE_CONTRAT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Statut</label>
                    <select value={salForm.statut} onChange={e => setSalForm(f => ({ ...f, statut: e.target.value as StatutSalarie }))}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                      {Object.entries(STATUT_SALARIE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <Field label="Date d&apos;embauche *" value={salForm.dateEmbauche} onChange={v => setSalForm(f => ({ ...f, dateEmbauche: v }))} type="date" />
                  {salForm.typeContrat === "cdd" && (
                    <Field label="Date fin CDD" value={salForm.datefinCdd ?? ""} onChange={v => setSalForm(f => ({ ...f, datefinCdd: v }))} type="date" />
                  )}
                  <Field label="Diplome / Formation" value={salForm.diplome ?? ""} onChange={v => setSalForm(f => ({ ...f, diplome: v }))} placeholder="BTS Logistique" />
                  <Field label="Annees d&apos;experience" value={String(salForm.experienceAns ?? "")} onChange={v => setSalForm(f => ({ ...f, experienceAns: parseInt(v) || 0 }))} type="number" placeholder="3" />
                </div>
              </div>

              {/* Remuneration */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Remuneration</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Salaire brut mensuel (DH) *</label>
                    <input type="number" min={0} step={100}
                      value={salForm.salaireBrut || ""}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 0
                        const c = v > 0 ? calcPayroll(v) : null
                        setSalForm(f => ({ ...f, salaireBrut: v, salaireNet: c?.net }))
                      }}
                      placeholder="Ex: 4000"
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 font-mono" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Salaire net (auto-calcule)</label>
                    <div className="px-3 py-2.5 border border-emerald-200 rounded-xl text-sm bg-emerald-50 text-emerald-800 font-bold font-mono">
                      {salForm.salaireNet ? `${salForm.salaireNet.toFixed(2)} DH` : "—"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Mode de paiement</label>
                    <select value={salForm.modePaiement ?? "virement"} onChange={e => setSalForm(f => ({ ...f, modePaiement: e.target.value as Salarie["modePaiement"] }))}
                      className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
                      <option value="virement">Virement bancaire</option>
                      <option value="cheque">Cheque</option>
                      <option value="especes">Especes</option>
                    </select>
                  </div>
                  <Field label="Avances en cours (DH)" value={String(salForm.avances || "")} onChange={v => setSalForm(f => ({ ...f, avances: parseFloat(v) || 0 }))} type="number" placeholder="0" />
                </div>
              </div>

              {/* Securite sociale */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Securite sociale &amp; Banque</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Numero CNSS" value={salForm.cnss ?? ""} onChange={v => setSalForm(f => ({ ...f, cnss: v }))} placeholder="CNSS000123456" />
                  <Field label="Numero de compte bancaire (RIB)" value={salForm.numCompteBancaire ?? ""} onChange={v => setSalForm(f => ({ ...f, numCompteBancaire: v }))} placeholder="007 810 00001234567890 12" />
                  <Field label="Banque" value={salForm.banque ?? ""} onChange={v => setSalForm(f => ({ ...f, banque: v }))} placeholder="CIH Bank" />
                </div>
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-600">Notes internes</label>
                <textarea value={salForm.notes ?? ""} onChange={e => setSalForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2} placeholder="Observations RH, remarques particulieres..."
                  className="px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none" />
              </div>

              {/* Dossier complet indicator */}
              {salForm.cin && salForm.cnss && salForm.adresse && salForm.salaireBrut > 0 ? (
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  Dossier complet — tous les champs requis sont renseignes
                </div>
              ) : (
                <div className="flex items-start gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5C3.312 18.333 4.274 20 5.814 20z" /></svg>
                  <span>Dossier incomplet — champs manquants :{" "}
                    {[!salForm.cin && "CIN", !salForm.cnss && "CNSS", !salForm.adresse && "Adresse", !salForm.salaireBrut && "Salaire"].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <button onClick={() => setShowSalForm(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                Annuler
              </button>
              <button onClick={handleSaveSal} disabled={!(salForm.nom ?? "").trim() || !(salForm.prenom ?? "").trim() || !(salForm.poste ?? "").trim()}
                className="flex items-center gap-2 px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-700 disabled:opacity-40 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {editingSal ? "Mettre a jour" : "Enregistrer le salarie"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
