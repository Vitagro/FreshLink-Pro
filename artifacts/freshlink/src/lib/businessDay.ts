"use client"

// ═══════════════════════════════════════════════════════════════════════════
//  Journée Opérationnelle (Business Day)
//
//  Une journée opérationnelle est un intervalle SEMI-OUVERT [début, fin) qui
//  ne coïncide pas avec la date calendaire : la prise de commande démarre à
//  J-1 14:00 et se termine à J 04:00, mais tout ce qui tombe dedans doit être
//  imputé à la date comptable J.
//
//  Deux invariants qui justifient la forme du code ci-dessous :
//
//  1. SEMI-OUVERT. Avec des bornes fermées des deux côtés, un enregistrement
//     pile à 04:00 appartiendrait à la fois à J et à J+1 : il serait compté
//     deux fois dans le CA ET deux fois dans les coûts. Le semi-ouvert garantit
//     une partition stricte de l'axe du temps.
//
//  2. HEURE LOCALE. Toutes les bornes sont construites via Date(y, m, d, h, min).
//     Jamais toISOString() : celui-ci rend la date UTC et décale d'un jour selon
//     l'heure — bug déjà corrigé à répétition dans ce projet.
//
//  Le profil PREVENTE lit sa configuration dans "fl_commande_cutoff_config",
//  la même clé que store.getCommandeCutoffConfig(). C'est volontaire : il ne
//  doit exister qu'UNE définition du cycle de commande. Ce projet a déjà connu
//  deux copies du cutoff codées en dur à 14h, désynchronisées de la config —
//  changer le cutoff n'avait alors aucun effet sur une partie des écrans.
// ═══════════════════════════════════════════════════════════════════════════

export type PolitiqueHorsPlage = "RATTACHER_SUIVANT" | "RATTACHER_PRECEDENT" | "REJETER"

export interface BusinessDayProfile {
  id: string
  libelle: string
  heureDebut: string          // "14:00"
  debutJourOffset: number     // -1 = la veille (J-1), 0 = le jour J
  heureFin: string            // "04:00"
  finJourOffset: number       // 0 = le jour J, 1 = le lendemain
  politiqueHorsPlage: PolitiqueHorsPlage
  typesEntite: string[]
}

export const BUSINESS_DAY_LS_KEY = "fl_business_day_profiles"
const CUTOFF_LS_KEY = "fl_commande_cutoff_config"

export const DEFAULT_PROFILES: BusinessDayProfile[] = [
  {
    id: "PREVENTE", libelle: "Prévente",
    heureDebut: "14:00", debutJourOffset: -1,
    heureFin: "04:00", finJourOffset: 0,
    politiqueHorsPlage: "RATTACHER_SUIVANT",
    typesEntite: ["commande", "visite", "trajet_prevente", "depense_prevente"],
  },
  {
    id: "LIVRAISON", libelle: "Livraison",
    heureDebut: "04:00", debutJourOffset: 0,
    heureFin: "14:00", finJourOffset: 0,
    politiqueHorsPlage: "RATTACHER_SUIVANT",
    typesEntite: ["trip", "bon_livraison", "retour"],
  },
  {
    id: "ACHAT", libelle: "Achat",
    heureDebut: "22:00", debutJourOffset: -1,
    heureFin: "10:00", finJourOffset: 0,
    politiqueHorsPlage: "RATTACHER_SUIVANT",
    typesEntite: ["bon_achat", "reception"],
  },
  {
    id: "DEFAUT", libelle: "Journée calendaire",
    heureDebut: "00:00", debutJourOffset: 0,
    heureFin: "00:00", finJourOffset: 1,
    politiqueHorsPlage: "RATTACHER_SUIVANT",
    typesEntite: [],
  },
]

function readLS<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch { return fallback }
}

export function getBusinessDayProfiles(): BusinessDayProfile[] {
  const stored = readLS<BusinessDayProfile[]>(BUSINESS_DAY_LS_KEY, [])
  const base = stored.length > 0 ? stored : DEFAULT_PROFILES
  // PREVENTE reste asservi à la config cutoff partagée avec store.ts : une
  // seule source de vérité pour le cycle de commande, quel que soit l'écran
  // qui l'a modifiée.
  const cutoff = readLS<{ heureDebut?: string; heureFin?: string }>(CUTOFF_LS_KEY, {})
  return base.map(p => p.id === "PREVENTE"
    ? { ...p, heureDebut: cutoff.heureDebut || p.heureDebut, heureFin: cutoff.heureFin || p.heureFin }
    : p)
}

export function saveBusinessDayProfiles(profiles: BusinessDayProfile[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(BUSINESS_DAY_LS_KEY, JSON.stringify(profiles))
  // Répercute PREVENTE sur la clé cutoff partagée, sinon les écrans qui lisent
  // store.getCommandeCutoffConfig() garderaient l'ancienne valeur.
  const prevente = profiles.find(p => p.id === "PREVENTE")
  if (prevente) {
    localStorage.setItem(CUTOFF_LS_KEY, JSON.stringify({
      heureDebut: prevente.heureDebut, heureFin: prevente.heureFin,
    }))
  }
}

export function getProfile(id: string): BusinessDayProfile {
  const all = getBusinessDayProfiles()
  return all.find(p => p.id === id)
    ?? all.find(p => p.id === "DEFAUT")
    ?? DEFAULT_PROFILES[DEFAULT_PROFILES.length - 1]
}

/** Profil applicable à un type d'entité ("commande", "visite"…), DEFAUT sinon. */
export function profileForEntity(typeEntite: string): BusinessDayProfile {
  const all = getBusinessDayProfiles()
  return all.find(p => p.typesEntite.includes(typeEntite))
    ?? all.find(p => p.id === "DEFAUT")
    ?? DEFAULT_PROFILES[DEFAULT_PROFILES.length - 1]
}

// ─── Manipulation de dates locales ──────────────────────────────────────────

function parseHM(hm: string): [number, number] {
  const [h, m] = hm.split(":").map(Number)
  return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0]
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Instant local à partir d'une date comptable + décalage de jours + heure.
 * Passer par le constructeur Date plutôt que par une arithmétique en
 * millisecondes garde correctes les journées de 23 h / 25 h (heure légale).
 */
function at(dateStr: string, dayOffset: number, hm: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return null
  const [h, min] = parseHM(hm)
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + dayOffset, h, min, 0, 0)
}

/** Bornes [début, fin) de la journée opérationnelle `dateStr` pour ce profil. */
export function businessDayBounds(dateStr: string, profileId: string): { start: Date; end: Date } | null {
  const p = getProfile(profileId)
  const start = at(dateStr, p.debutJourOffset, p.heureDebut)
  const end = at(dateStr, p.finJourOffset, p.heureFin)
  if (!start || !end) return null
  return { start, end }
}

function contains(dateStr: string, profileId: string, t: Date): boolean {
  const b = businessDayBounds(dateStr, profileId)
  if (!b) return false
  return t.getTime() >= b.start.getTime() && t.getTime() < b.end.getTime()   // semi-ouvert
}

function shiftDays(dateStr: string, n: number): string {
  const d = at(dateStr, n, "12:00")   // midi : insensible aux sauts d'heure légale
  return d ? ymd(d) : dateStr
}

export interface BusinessDayResolution {
  date: string
  horsPlage: boolean
  rejete: boolean
}

/**
 * Date comptable d'un horodatage pour un profil donné.
 *
 * Quand l'instant tombe dans un TROU de couverture (avec 14:00→04:00, la plage
 * 04:00→14:00 n'appartient à aucune journée), on n'invente rien en silence :
 * la politique du profil décide, et `horsPlage` remonte l'information pour le
 * rapport de contrôle. Un enregistrement ne doit JAMAIS pouvoir disparaître de
 * tous les rapports faute de rattachement.
 */
export function resolveBusinessDay(ts: string | Date, profileId: string): BusinessDayResolution {
  const t = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(t.getTime())) return { date: "", horsPlage: true, rejete: false }

  const base = ymd(t)
  // La journée contenant l'instant est forcément J-1, J ou J+1 : les offsets
  // supportés ne dépassent pas un jour de part et d'autre.
  for (const cand of [base, shiftDays(base, 1), shiftDays(base, -1)]) {
    if (contains(cand, profileId, t)) return { date: cand, horsPlage: false, rejete: false }
  }

  const p = getProfile(profileId)
  if (p.politiqueHorsPlage === "REJETER") return { date: "", horsPlage: true, rejete: true }

  if (p.politiqueHorsPlage === "RATTACHER_PRECEDENT") {
    for (const cand of [base, shiftDays(base, -1), shiftDays(base, -2)]) {
      const b = businessDayBounds(cand, profileId)
      if (b && b.end.getTime() <= t.getTime()) return { date: cand, horsPlage: true, rejete: false }
    }
    return { date: base, horsPlage: true, rejete: false }
  }

  // RATTACHER_SUIVANT (défaut) : prochaine journée qui s'ouvre.
  for (const cand of [base, shiftDays(base, 1), shiftDays(base, 2)]) {
    const b = businessDayBounds(cand, profileId)
    if (b && b.start.getTime() > t.getTime()) return { date: cand, horsPlage: true, rejete: false }
  }
  return { date: base, horsPlage: true, rejete: false }
}

/** Date comptable seule, pour les appels qui n'ont pas besoin du diagnostic. */
export function businessDayOf(ts: string | Date, profileId: string): string {
  return resolveBusinessDay(ts, profileId).date
}

/** Date opérationnelle courante d'un profil. */
export function currentBusinessDay(profileId: string): string {
  return businessDayOf(new Date(), profileId)
}

/**
 * Heures NON couvertes par le profil sur 24 h. Sert l'avertissement de l'écran
 * de configuration : une fenêtre 14:00→04:00 laisse 10 h de trou, et il vaut
 * mieux que l'utilisateur le voie avant de valider qu'après.
 */
export function heuresNonCouvertes(p: BusinessDayProfile): number {
  const [hd, md] = parseHM(p.heureDebut)
  const [hf, mf] = parseHM(p.heureFin)
  const debutMin = (p.debutJourOffset * 24 * 60) + hd * 60 + md
  const finMin = (p.finJourOffset * 24 * 60) + hf * 60 + mf
  const couvert = Math.max(0, finMin - debutMin)
  return Math.max(0, 24 * 60 - couvert) / 60
}
