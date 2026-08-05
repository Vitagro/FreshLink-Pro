"use client"

// ═══════════════════════════════════════════════════════════════════════════
//  Coût Prévendeur & Coût par Trajet
//
//  Coût_trajet = C_fixe + C_transport + C_charges + C_freelance
//
//  Les tables vivent en localStorage (comme fl_intel_prix côté Concurrence) et
//  sont déclarées dans les 3 allowlists de synchronisation (autoSync
//  SYNCED_KEYS, db.ts ERP_TABLE_MAP, api-server ALLOWED_TABLES). Une table
//  absente d'UNE seule des trois reste silencieusement locale à l'appareil qui
//  l'a créée — c'est exactement le bug qui faisait « disparaître la liste des
//  transporteurs » d'un navigateur à l'autre.
// ═══════════════════════════════════════════════════════════════════════════

import { resolveBusinessDay } from "@/lib/businessDay"
import { store, type Commande, type Visite } from "@/lib/store"

// ─── Modèle ────────────────────────────────────────────────────────────────

export type TypeContrat = "SALARIE" | "FREELANCE" | "PRESTATAIRE"
export type BaseRepartition = "DUREE" | "FREQUENCE" | "FORFAIT_JOUR"
export type ModeDetention = "PROPRIETE" | "LOCATION" | "PERSONNEL"
export type ModeCumulPaliers = "PROGRESSIF" | "ATTEINT"
export type StatutTrajet = "PLANIFIE" | "EN_COURS" | "CLOTURE" | "ANNULE"

export type AssietteVariable =
  | "CA" | "TONNAGE" | "NB_CLIENTS_VISITES" | "NB_COMMANDES"
  | "TAUX_CONVERSION" | "NB_NOUVEAUX_CLIENTS"

// Assiettes qui sont des RATIOS et non des volumes. Un barème progressif
// découperait un pourcentage « par tranches », ce qui n'a aucun sens métier :
// pour elles le moteur force le mode ATTEINT (cf. calculerVariable).
const ASSIETTES_RATIO: AssietteVariable[] = ["TAUX_CONVERSION"]

export interface GrilleSalariale {
  id: string
  libelle: string
  salaireBrutMensuel: number
  tauxChargesPatronales: number      // 0.20 = 20 %
  primePanierJour: number
  forfaitTelecomMois: number
  amortissementMaterielMois: number
  joursTravaillesMois: number
  heuresParJour: number
  baseRepartition: BaseRepartition
  valideDu: string
  valideAu?: string
}

export interface Vehicule {
  id: string
  immatriculation: string
  modeDetention: ModeDetention
  coutAcquisition?: number
  dureeAmortissementMois?: number
  loyerMensuel?: number
  indemniteKm?: number
  consoL100km: number
  prixCarburantLitre: number
  assuranceMois: number
  entretienMois: number
  kmMoyensMois: number
  actif: boolean
}

export interface PalierFreelance {
  id: string
  assiette: AssietteVariable
  seuilMin: number
  seuilMax?: number
  typeCalcul: "POURCENTAGE" | "MONTANT_UNITAIRE" | "FORFAIT"
  valeur: number
}

export interface RegleFreelance {
  id: string
  libelle: string
  forfaitParTournee: number
  forfaitParJour: number
  modeCumulPaliers: ModeCumulPaliers
  plafondVariable?: number
  plancherGaranti: number
  paliers: PalierFreelance[]
  valideDu: string
  valideAu?: string
}

export interface PrevendeurCout {
  id: string
  userId?: string
  nom: string
  typeContrat: TypeContrat
  secteurDefaut?: string
  grilleSalarialeId?: string
  regleFreelanceId?: string
  vehiculeId?: string
  actif: boolean
}

export interface TrajetPrevente {
  id: string
  numero: string
  prevendeurId: string
  prevendeurNom: string
  vehiculeId?: string
  secteur?: string
  dateOperationnelle: string
  debutReel: string
  finReelle?: string
  kmDebut?: number
  kmFin?: number
  statut: StatutTrajet
  motifAnnulation?: string
  // Snapshot figé à la clôture — jamais recalculé ensuite (cf. cloturerTrajet)
  coutFixeSalarial?: number
  coutTransport?: number
  coutCharges?: number
  coutFreelanceFixe?: number
  coutFreelanceVar?: number
  coutTotal?: number
  caGenere?: number
  margeBrute?: number
  nbClientsVisites?: number
  nbCommandes?: number
  tonnage?: number
  clotureLe?: string
  clotureesPar?: string
  anomalies?: string[]
  parametresSnapshot?: Record<string, unknown>
}

// ─── Persistance ────────────────────────────────────────────────────────────

export const LS_GRILLES     = "fl_cp_grilles"
export const LS_VEHICULES   = "fl_cp_vehicules"
export const LS_REGLES      = "fl_cp_regles_freelance"
export const LS_PREVENDEURS = "fl_cp_prevendeurs"
export const LS_TRAJETS     = "fl_cp_trajets"

function get<T>(key: string): T[] {
  if (typeof window === "undefined") return []
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) as T[] : [] } catch { return [] }
}
function set<T>(key: string, v: T[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(key, JSON.stringify(v))
}

export const getGrilles      = () => get<GrilleSalariale>(LS_GRILLES)
export const saveGrilles     = (v: GrilleSalariale[]) => set(LS_GRILLES, v)
export const getVehicules    = () => get<Vehicule>(LS_VEHICULES)
export const saveVehicules   = (v: Vehicule[]) => set(LS_VEHICULES, v)
export const getRegles       = () => get<RegleFreelance>(LS_REGLES)
export const saveRegles      = (v: RegleFreelance[]) => set(LS_REGLES, v)
export const getPrevendeurs  = () => get<PrevendeurCout>(LS_PREVENDEURS)
export const savePrevendeurs = (v: PrevendeurCout[]) => set(LS_PREVENDEURS, v)
export const getTrajets      = () => get<TrajetPrevente>(LS_TRAJETS)
export const saveTrajets     = (v: TrajetPrevente[]) => set(LS_TRAJETS, v)

export function genCoutId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Version d'un paramètre en vigueur à une date donnée — et non la version
 * courante. Sans cela, une augmentation de salaire en mars réécrirait
 * rétroactivement le coût de janvier et fausserait toute comparaison historique.
 */
function versionA<T extends { valideDu: string; valideAu?: string }>(items: T[], date: string): T | undefined {
  return items
    .filter(i => i.valideDu <= date && (!i.valideAu || i.valideAu >= date))
    .sort((a, b) => b.valideDu.localeCompare(a.valideDu))[0]
}

// ─── Métriques d'un trajet ──────────────────────────────────────────────────

export interface MetriquesTrajet {
  ca: number
  margeBrute: number
  tonnage: number
  nbClientsVisites: number
  nbCommandes: number
  tauxConversion: number | null      // null = non évaluable (0 visite)
  nbNouveauxClients: number
}

/**
 * Agrège les métriques sur la DATE OPÉRATIONNELLE figée du trajet, pas sur la
 * date calendaire : une tournée démarrée à 14:02 appartient déjà à la journée
 * du lendemain, et ses commandes doivent suivre.
 */
export function metriquesTrajet(trajet: TrajetPrevente): MetriquesTrajet {
  const cmds = store.getCommandes().filter((c: Commande) =>
    c.statut !== "refuse" &&
    c.commercialId === trajet.prevendeurId &&
    resolveBusinessDay(c.createdAt ?? `${c.date}T12:00:00`, "PREVENTE").date === trajet.dateOperationnelle
  )
  const visites = store.getVisites().filter((v: Visite) =>
    v.prevendeurId === trajet.prevendeurId &&
    resolveBusinessDay(`${v.date}T12:00:00`, "PREVENTE").date === trajet.dateOperationnelle
  )

  const articles = store.getArticles()
  let ca = 0, cout = 0, tonnage = 0
  for (const c of cmds) {
    for (const l of c.lignes) {
      ca += l.quantite * l.prixVente
      tonnage += l.quantite
      const art = articles.find(a => a.id === l.articleId)
      cout += l.quantite * (art?.prixAchat ?? 0)
    }
  }

  const nbClientsVisites = new Set(visites.map(v => v.clientId)).size
  // 0/0 n'est pas 0 % mais INDÉFINI. Renvoyer 0 pénaliserait à tort un
  // prévendeur dont la tournée a été annulée pour une raison externe.
  const tauxConversion = visites.length > 0
    ? (visites.filter(v => v.resultat === "commande").length / visites.length) * 100
    : null

  return {
    ca,
    margeBrute: ca - cout,
    tonnage,
    nbClientsVisites,
    nbCommandes: cmds.length,
    tauxConversion,
    nbNouveauxClients: 0,
  }
}

// ─── Part variable freelance ────────────────────────────────────────────────

function valeurAssiette(a: AssietteVariable, m: MetriquesTrajet): number | null {
  switch (a) {
    case "CA":                  return m.ca
    case "TONNAGE":             return m.tonnage
    case "NB_CLIENTS_VISITES":  return m.nbClientsVisites
    case "NB_COMMANDES":        return m.nbCommandes
    case "NB_NOUVEAUX_CLIENTS": return m.nbNouveauxClients
    case "TAUX_CONVERSION":     return m.tauxConversion   // peut être null
  }
}

function appliquer(p: PalierFreelance, base: number): number {
  switch (p.typeCalcul) {
    case "POURCENTAGE":      return base * p.valeur / 100
    case "MONTANT_UNITAIRE": return base * p.valeur
    case "FORFAIT":          return p.valeur
  }
}

export interface ResultatVariable {
  montant: number
  plafonne: boolean
  assiettesNonEvaluables: AssietteVariable[]
}

export function calculerVariable(regle: RegleFreelance, m: MetriquesTrajet): ResultatVariable {
  let total = 0
  const nonEvaluables: AssietteVariable[] = []
  const assiettes = [...new Set(regle.paliers.map(p => p.assiette))]

  for (const a of assiettes) {
    const valeur = valeurAssiette(a, m)
    if (valeur === null) { nonEvaluables.push(a); continue }

    const paliers = regle.paliers
      .filter(p => p.assiette === a)
      .sort((x, y) => x.seuilMin - y.seuilMin)

    // Un ratio ne se découpe pas en tranches : mode ATTEINT forcé.
    const mode = ASSIETTES_RATIO.includes(a) ? "ATTEINT" : regle.modeCumulPaliers

    if (mode === "ATTEINT") {
      const atteint = [...paliers].reverse().find(p => valeur >= p.seuilMin)
      if (atteint) total += appliquer(atteint, valeur)
    } else {
      for (const p of paliers) {
        const borneHaute = Math.min(valeur, p.seuilMax ?? Number.POSITIVE_INFINITY)
        const tranche = Math.max(0, borneHaute - p.seuilMin)
        if (tranche > 0) total += appliquer(p, tranche)
      }
    }
  }

  let plafonne = false
  if (regle.plafondVariable != null && total > regle.plafondVariable) {
    total = regle.plafondVariable
    plafonne = true
  }
  return { montant: total, plafonne, assiettesNonEvaluables: nonEvaluables }
}

// ─── Moteur de calcul ───────────────────────────────────────────────────────

export interface DetailCout {
  fixeSalarial: number
  transport: number
  charges: number
  freelanceFixe: number
  freelanceVariable: number
  total: number
  anomalies: string[]
  dureeHeures: number
  km: number
  snapshot: Record<string, unknown>
}

export interface ContexteCalcul {
  /** Nombre de trajets non annulés du prévendeur sur la même date opérationnelle. */
  nbTrajetsDuJour: number
  /** Km médian du secteur, utilisé en repli quand le relevé est aberrant. */
  kmMedianSecteur?: number
}

const SEUIL_KM_ABERRANT = 500

export function calculerCoutTrajet(
  trajet: TrajetPrevente,
  metriques: MetriquesTrajet,
  ctx: ContexteCalcul,
): DetailCout {
  const anomalies: string[] = []
  const date = trajet.dateOperationnelle
  const prevendeur = getPrevendeurs().find(p => p.id === trajet.prevendeurId)

  // ── Durée ────────────────────────────────────────────────────────────────
  let dureeHeures = 0
  let dureeInvalide = false
  if (trajet.finReelle) {
    const ms = new Date(trajet.finReelle).getTime() - new Date(trajet.debutReel).getTime()
    if (Number.isFinite(ms) && ms > 0) dureeHeures = ms / 3_600_000
    else dureeInvalide = true
  } else dureeInvalide = true
  if (dureeInvalide) anomalies.push("Durée invalide ou trajet non clôturé — répartition forfaitaire appliquée")

  // ── Kilométrage ──────────────────────────────────────────────────────────
  let km = 0
  if (trajet.kmDebut != null && trajet.kmFin != null) {
    const brut = trajet.kmFin - trajet.kmDebut
    if (brut < 0) {
      // Ne pas retenir 0 : cela minorerait silencieusement le coût transport.
      km = ctx.kmMedianSecteur ?? 0
      anomalies.push("Compteur incohérent (km fin < km début) — km médian du secteur retenu")
    } else if (brut > SEUIL_KM_ABERRANT) {
      km = ctx.kmMedianSecteur ?? SEUIL_KM_ABERRANT
      anomalies.push(`Kilométrage aberrant (${brut} km) — valeur de repli retenue`)
    } else km = brut
  } else if (trajet.vehiculeId) {
    km = ctx.kmMedianSecteur ?? 0
    anomalies.push("Relevé kilométrique absent — km médian du secteur retenu")
  }

  // ── Coûts fixes salariaux ────────────────────────────────────────────────
  let fixeSalarial = 0
  const grilles = getGrilles().filter(g => !prevendeur?.grilleSalarialeId || g.id === prevendeur.grilleSalarialeId)
  const grille = versionA(grilles, date)
  let coutJour = 0
  if (grille && prevendeur?.typeContrat === "SALARIE") {
    coutJour = (grille.salaireBrutMensuel * (1 + grille.tauxChargesPatronales)) / Math.max(1, grille.joursTravaillesMois)
    const base = dureeInvalide ? "FORFAIT_JOUR" : grille.baseRepartition
    if (base === "DUREE") {
      fixeSalarial = (coutJour / Math.max(0.5, grille.heuresParJour)) * dureeHeures
    } else if (base === "FREQUENCE") {
      fixeSalarial = coutJour / Math.max(1, ctx.nbTrajetsDuJour)
    } else {
      fixeSalarial = coutJour
    }
  } else if (!grille && prevendeur?.typeContrat === "SALARIE") {
    anomalies.push("Aucune grille salariale en vigueur à cette date — coût fixe non calculé")
  }

  // ── Coûts de transport ───────────────────────────────────────────────────
  let transport = 0
  const vehicule = getVehicules().find(v => v.id === (trajet.vehiculeId ?? prevendeur?.vehiculeId))
  if (vehicule) {
    if (vehicule.modeDetention === "PERSONNEL") {
      // Ni amortissement ni loyer : le véhicule n'appartient pas à l'entreprise.
      transport = km * (vehicule.indemniteKm ?? 0)
    } else {
      const carburant = (km * vehicule.consoL100km / 100) * vehicule.prixCarburantLitre
      const amort = vehicule.modeDetention === "PROPRIETE" && vehicule.dureeAmortissementMois
        ? (vehicule.coutAcquisition ?? 0) / vehicule.dureeAmortissementMois
        : 0
      const loyer = vehicule.modeDetention === "LOCATION" ? (vehicule.loyerMensuel ?? 0) : 0
      const fixeMensuel = amort + loyer + vehicule.assuranceMois + vehicule.entretienMois
      transport = carburant + fixeMensuel * (km / Math.max(1, vehicule.kmMoyensMois))
    }
  }

  // ── Charges & frais généraux ─────────────────────────────────────────────
  // Les charges patronales sont DÉJÀ dans fixeSalarial via tauxChargesPatronales.
  // Les recompter ici est l'erreur de double comptage la plus fréquente.
  let charges = 0
  if (grille && prevendeur?.typeContrat === "SALARIE") {
    charges = grille.primePanierJour
      + (grille.forfaitTelecomMois + grille.amortissementMaterielMois) / Math.max(1, grille.joursTravaillesMois)
  }

  // ── Rémunération freelance ───────────────────────────────────────────────
  let freelanceFixe = 0
  let freelanceVariable = 0
  const estExterne = prevendeur?.typeContrat === "FREELANCE" || prevendeur?.typeContrat === "PRESTATAIRE"
  if (estExterne && prevendeur?.regleFreelanceId) {
    const regles = getRegles().filter(r => r.id === prevendeur.regleFreelanceId)
    const regle = versionA(regles, date)
    if (regle) {
      freelanceFixe = regle.forfaitParTournee + regle.forfaitParJour / Math.max(1, ctx.nbTrajetsDuJour)
      const v = calculerVariable(regle, metriques)
      freelanceVariable = v.montant
      if (v.plafonne) anomalies.push(`Plafond de part variable atteint (${regle.plafondVariable} DH)`)
      for (const a of v.assiettesNonEvaluables) {
        anomalies.push(`Assiette « ${a} » non évaluable (dénominateur nul) — non rémunérée`)
      }
      // Le plancher porte sur le TOTAL fixe + variable, pas sur la part variable seule.
      const sousTotal = freelanceFixe + freelanceVariable
      if (regle.plancherGaranti > 0 && sousTotal < regle.plancherGaranti) {
        freelanceFixe += regle.plancherGaranti - sousTotal
        anomalies.push(`Plancher garanti appliqué (${regle.plancherGaranti} DH)`)
      }
    } else {
      anomalies.push("Aucune règle freelance en vigueur à cette date — part variable non calculée")
    }
  }

  const total = fixeSalarial + transport + charges + freelanceFixe + freelanceVariable

  return {
    fixeSalarial, transport, charges, freelanceFixe, freelanceVariable, total,
    anomalies, dureeHeures, km,
    snapshot: {
      grilleId: grille?.id, grilleLibelle: grille?.libelle, coutJour,
      vehiculeId: vehicule?.id, prixCarburant: vehicule?.prixCarburantLitre,
      nbTrajetsDuJour: ctx.nbTrajetsDuJour, calculeLe: new Date().toISOString(),
    },
  }
}

/** Nombre de trajets non annulés d'un prévendeur sur une date opérationnelle. */
export function nbTrajetsDuJour(prevendeurId: string, date: string): number {
  return getTrajets().filter(t =>
    t.prevendeurId === prevendeurId && t.dateOperationnelle === date && t.statut !== "ANNULE"
  ).length || 1
}

/**
 * Clôture un trajet : calcule puis FIGE les montants. Après clôture les valeurs
 * sont immuables — une correction passe par une régularisation, jamais par une
 * réécriture, sans quoi l'ERP et la comptabilité ne se rapprochent plus.
 */
export function cloturerTrajet(trajetId: string, parUtilisateur: string): TrajetPrevente | null {
  const trajets = getTrajets()
  const idx = trajets.findIndex(t => t.id === trajetId)
  if (idx < 0) return null
  const t = trajets[idx]

  const m = metriquesTrajet(t)
  const d = calculerCoutTrajet(t, m, { nbTrajetsDuJour: nbTrajetsDuJour(t.prevendeurId, t.dateOperationnelle) })

  const clos: TrajetPrevente = {
    ...t,
    statut: "CLOTURE",
    finReelle: t.finReelle ?? new Date().toISOString(),
    coutFixeSalarial: d.fixeSalarial,
    coutTransport: d.transport,
    coutCharges: d.charges,
    coutFreelanceFixe: d.freelanceFixe,
    coutFreelanceVar: d.freelanceVariable,
    coutTotal: d.total,
    caGenere: m.ca,
    margeBrute: m.margeBrute,
    nbClientsVisites: m.nbClientsVisites,
    nbCommandes: m.nbCommandes,
    tonnage: m.tonnage,
    clotureLe: new Date().toISOString(),
    clotureesPar: parUtilisateur,
    anomalies: d.anomalies,
    parametresSnapshot: d.snapshot,
  }
  trajets[idx] = clos
  saveTrajets(trajets)
  return clos
}

/**
 * Reventilation de fin de journée pour la base FREQUENCE : le nombre de trajets
 * n'est connu avec certitude qu'une fois la journée terminée. Sans ce passage,
 * le premier trajet clôturé porterait 100 % du coût journalier et les suivants 0.
 * C'est la SEULE réécriture autorisée après clôture, bornée à la journée.
 */
export function reventilerJournee(date: string): number {
  const trajets = getTrajets()
  const concernes = trajets.filter(t => t.dateOperationnelle === date && t.statut === "CLOTURE")
  let modifies = 0
  for (const t of concernes) {
    const m = metriquesTrajet(t)
    const d = calculerCoutTrajet(t, m, { nbTrajetsDuJour: nbTrajetsDuJour(t.prevendeurId, date) })
    if (Math.abs((t.coutTotal ?? 0) - d.total) > 0.005) {
      Object.assign(t, {
        coutFixeSalarial: d.fixeSalarial, coutTransport: d.transport, coutCharges: d.charges,
        coutFreelanceFixe: d.freelanceFixe, coutFreelanceVar: d.freelanceVariable,
        coutTotal: d.total, anomalies: d.anomalies, parametresSnapshot: d.snapshot,
      })
      modifies++
    }
  }
  if (modifies > 0) saveTrajets(trajets)
  return modifies
}

function joursCalendaires(d1: string, d2: string): number {
  const a = new Date(`${d1}T12:00:00`), b = new Date(`${d2}T12:00:00`)
  const n = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Coûts non ventilés d'un salarié : jours payés sans aucune tournée (congés,
 * formation, jour creux). Les ignorer sous-estimerait le coût réel du
 * prévendeur. N'existe pas pour un freelance, qui ne coûte rien sans tournée.
 */
export function coutsNonVentiles(prevendeurId: string, dateDebut: string, dateFin: string): number {
  const p = getPrevendeurs().find(x => x.id === prevendeurId)
  if (!p || p.typeContrat !== "SALARIE") return 0
  const grille = versionA(getGrilles().filter(g => g.id === p.grilleSalarialeId), dateFin)
  if (!grille) return 0

  const joursAvecTrajet = new Set(
    getTrajets()
      .filter(t => t.prevendeurId === prevendeurId && t.statut !== "ANNULE"
        && t.dateOperationnelle >= dateDebut && t.dateOperationnelle <= dateFin)
      .map(t => t.dateOperationnelle)
  ).size

  const coutJour = (grille.salaireBrutMensuel * (1 + grille.tauxChargesPatronales)) / Math.max(1, grille.joursTravaillesMois)
  // Borné au nombre de jours ouvrés du mois : un intervalle plus long que le
  // mois ne doit pas produire un coût non ventilé supérieur au salaire.
  const joursPayes = Math.min(grille.joursTravaillesMois, joursCalendaires(dateDebut, dateFin))
  return Math.max(0, joursPayes - joursAvecTrajet) * coutJour
}

// ─── Agrégation par prévendeur ──────────────────────────────────────────────

export interface LignePrevendeur {
  prevendeurId: string
  nom: string
  typeContrat: TypeContrat
  nbTrajets: number
  fixeSalarial: number
  transport: number
  charges: number
  freelance: number
  total: number
  ca: number
  margeBrute: number
  nbClientsVisites: number
  anomalies: number
}

export function agregerParPrevendeur(dateDebut: string, dateFin: string): LignePrevendeur[] {
  const trajets = getTrajets().filter(t =>
    t.dateOperationnelle >= dateDebut && t.dateOperationnelle <= dateFin && t.statut === "CLOTURE"
  )
  const prevendeurs = getPrevendeurs()
  const map = new Map<string, LignePrevendeur>()

  for (const t of trajets) {
    const p = prevendeurs.find(x => x.id === t.prevendeurId)
    if (!map.has(t.prevendeurId)) {
      map.set(t.prevendeurId, {
        prevendeurId: t.prevendeurId, nom: t.prevendeurNom,
        typeContrat: p?.typeContrat ?? "SALARIE",
        nbTrajets: 0, fixeSalarial: 0, transport: 0, charges: 0, freelance: 0,
        total: 0, ca: 0, margeBrute: 0, nbClientsVisites: 0, anomalies: 0,
      })
    }
    const l = map.get(t.prevendeurId)!
    l.nbTrajets++
    l.fixeSalarial += t.coutFixeSalarial ?? 0
    l.transport    += t.coutTransport ?? 0
    l.charges      += t.coutCharges ?? 0
    l.freelance    += (t.coutFreelanceFixe ?? 0) + (t.coutFreelanceVar ?? 0)
    l.total        += t.coutTotal ?? 0
    l.ca           += t.caGenere ?? 0
    l.margeBrute   += t.margeBrute ?? 0
    l.nbClientsVisites += t.nbClientsVisites ?? 0
    l.anomalies    += (t.anomalies?.length ?? 0)
  }

  return [...map.values()].sort((a, b) => b.total - a.total)
}
