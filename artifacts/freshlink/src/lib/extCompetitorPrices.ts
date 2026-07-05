// ═══════════════════════════════════════════════════════════════════════════
// extCompetitorPrices — expose au reste de l'app (Intelligence Prix, Pricing,
// Concurrence & Perf.) les prix ET le tonnage GestFlux/Iziry deja synchronises
// par l'onglet "Comparatif Donnees Externes" (BOComparatifExterne), sans
// dependre d'une resaisie/import Excel manuel.
//
// Lit directement les caches localStorage deja alimentes par la sync externe :
//   fl_ext_gf_achat        -> PA GestFlux (prix reellement negocie du jour)
//   fl_ext_iz_lignes_fact, fl_ext_iz_factures, fl_ext_iz_articles
//                           -> PV Iziry (prix de vente a leurs clients)
// Si ces caches sont vides (sync jamais lancee), retourne un objet vide —
// l'appelant doit alors retomber sur sa source manuelle/Excel existante.
// ═══════════════════════════════════════════════════════════════════════════

interface GfAchatRow {
  date: string; article: string; qte_achetee: number; prix: number; statut: string
}
interface IzLigneFactRow {
  facture_id: string; article_id: string; quantite: number; prix_unitaire: number
}
interface IzFactRow { id: string; date_facture: string }
interface IzArticleRow { id: string; libelle: string }

function loadCache<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]") } catch { return [] }
}

export function normName(s: unknown): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[؀-ۿ]/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

export interface ExternalPriceInfo {
  paGf: number       // DH/kg — GestFlux, moyenne ponderee sur la periode
  qteGfKg: number    // kg achetes GestFlux sur la periode
  dateGf: string     // date du dernier achat GestFlux pris en compte
  pvIz: number       // DH/kg — Iziry (prix de VENTE a leurs clients, marge incluse)
  qteIzKg: number    // kg factures Iziry sur la periode
  dateIz: string     // date de la derniere facture Iziry prise en compte
}

// dateFrom/dateTo au format YYYY-MM-DD, bornes incluses. Chaine vide = pas de borne.
function inRange(d: string, dateFrom: string, dateTo: string): boolean {
  const x = String(d ?? "").slice(0, 10)
  if (dateFrom && x < dateFrom) return false
  if (dateTo && x > dateTo) return false
  return true
}

export function getExternalPricesByArticle(dateFrom = "", dateTo = ""): Record<string, ExternalPriceInfo> {
  const gfAgg: Record<string, { sum: number; qte: number; lastDate: string }> = {}
  loadCache<GfAchatRow>("fl_ext_gf_achat").forEach(a => {
    if (!inRange(a.date, dateFrom, dateTo) || a.qte_achetee <= 0 || a.prix <= 0) return
    const k = normName(a.article)
    const prev = gfAgg[k] ?? { sum: 0, qte: 0, lastDate: "" }
    prev.sum += a.prix * a.qte_achetee
    prev.qte += a.qte_achetee
    if (a.date > prev.lastDate) prev.lastDate = a.date
    gfAgg[k] = prev
  })

  const izArticleNormById: Record<string, string> = {}
  loadCache<IzArticleRow>("fl_ext_iz_articles").forEach(a => { izArticleNormById[a.id] = normName(a.libelle) })

  const izFactDateById: Record<string, string> = {}
  loadCache<IzFactRow>("fl_ext_iz_factures").forEach(f => { izFactDateById[f.id] = f.date_facture })

  const izAgg: Record<string, { sum: number; qte: number; lastDate: string }> = {}
  loadCache<IzLigneFactRow>("fl_ext_iz_lignes_fact").forEach(l => {
    if (!l.article_id || l.prix_unitaire <= 0) return
    const factDate = izFactDateById[l.facture_id]
    if (!factDate || !inRange(factDate, dateFrom, dateTo)) return
    const k = izArticleNormById[l.article_id]; if (!k) return
    const prev = izAgg[k] ?? { sum: 0, qte: 0, lastDate: "" }
    const qte = l.quantite || 1
    prev.sum += l.prix_unitaire * qte
    prev.qte += qte
    if (factDate > prev.lastDate) prev.lastDate = factDate
    izAgg[k] = prev
  })

  const keys = new Set([...Object.keys(gfAgg), ...Object.keys(izAgg)])
  const result: Record<string, ExternalPriceInfo> = {}
  keys.forEach(k => {
    const gf = gfAgg[k]; const iz = izAgg[k]
    result[k] = {
      paGf: gf && gf.qte > 0 ? Math.round((gf.sum / gf.qte) * 100) / 100 : 0,
      qteGfKg: gf?.qte ?? 0,
      dateGf: gf?.lastDate ?? "",
      pvIz: iz && iz.qte > 0 ? Math.round((iz.sum / iz.qte) * 100) / 100 : 0,
      qteIzKg: iz?.qte ?? 0,
      dateIz: iz?.lastDate ?? "",
    }
  })
  return result
}

export function lookupExternalPrice(m: Record<string, ExternalPriceInfo>, articleNomOuSku: string): ExternalPriceInfo | null {
  return m[normName(articleNomOuSku)] ?? null
}

// Tonnage total (GestFlux achats + Iziry factures) sur la periode — kg -> tonnes.
export function getTonnageDuJour(dateFrom = "", dateTo = ""): { gfTonnes: number; izTonnes: number } {
  const m = getExternalPricesByArticle(dateFrom, dateTo)
  let gfKg = 0, izKg = 0
  Object.values(m).forEach(v => { gfKg += v.qteGfKg; izKg += v.qteIzKg })
  return { gfTonnes: Math.round((gfKg / 1000) * 1000) / 1000, izTonnes: Math.round((izKg / 1000) * 1000) / 1000 }
}
