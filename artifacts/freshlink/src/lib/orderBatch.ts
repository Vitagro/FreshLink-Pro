import type { Article, Client, Commande } from './store'

export interface OrderBatchRow {
  id: string; date: string; creation: string; client: string; secteur: string;
  commercial: string; reference: string; entrepot: string; tournee: string;
  lignes: { article: string; quantite: number }[];
}
export interface OrderBatch { version: 1; nature: 'SIMULATION'; orders: OrderBatchRow[] }
export const normalizeName = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const articleName = (s: string) => normalizeName(s).replace(/[\u0600-\u06ff]/g, '').replace(/[^a-z0-9]/g, '')

/** Keep source identity separate from login accounts and never invent completed deliveries. */
export function prepareOrderBatch(batch: OrderBatch, clients: Client[], articles: Article[], history: Commande[], price: (a: Article, c: Client) => number, importedAt: string, actor: string) {
  if (batch.version !== 1 || batch.nature !== 'SIMULATION' || !Array.isArray(batch.orders) || !batch.orders.length || batch.orders.length > 10000) throw new Error('Format de simulation invalide')
  const seen = new Set<string>(), errors = new Set<string>(), commands: Commande[] = []
  const byArticle = new Map(articles.map(a => [a.id, a]))
  const byHistory = new Map(history.map(c => [c.id, c]))
  for (const row of batch.orders) {
    try {
      if (!/^SIM-\d{4}-\d{6}$/.test(row.id) || seen.has(row.id)) throw new Error(`Identifiant invalide ou répété : ${row.id}`)
      seen.add(row.id)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) || !Number.isFinite(Date.parse(row.creation))) throw new Error('Date invalide')
      if (!row.commercial?.trim() || !row.lignes?.length) throw new Error('Commercial ou lignes absents')
      const candidates = clients.filter(c => normalizeName(c.nom) === normalizeName(row.client) && normalizeName(c.secteur) === normalizeName(row.secteur))
      if (candidates.length !== 1) throw new Error(`Client introuvable ou ambigu : ${row.client} (${row.secteur})`)
      const client = candidates[0]
      const reference = byHistory.get(row.reference)
      if (!reference) throw new Error(`Commande source absente : ${row.reference}`)
      const lignes = row.lignes.map(l => {
        if (!Number.isFinite(l.quantite) || l.quantite <= 0) throw new Error(`Quantité invalide : ${l.article}`)
        const sourceIds = [...new Set(reference.lignes.filter(s => articleName(s.articleNom) === articleName(l.article)).map(s => s.articleId))]
        if (sourceIds.length !== 1) throw new Error(`Article source introuvable ou ambigu : ${l.article} / ${row.reference}`)
        const article = byArticle.get(sourceIds[0])
        if (!article || normalizeName(article.unite) !== 'kg') throw new Error(`Article absent ou unité différente du kg : ${l.article}`)
        const pv = price(article, client)
        if (!Number.isFinite(pv) || pv <= 0) throw new Error(`Prix absent ou nul : ${article.nom} / ${client.nom}`)
        return { articleId: article.id, articleNom: article.nom, articleNomAr: article.nomAr, unite: 'kg', quantite: l.quantite, prixUnitaire: pv, prixVente: pv, total: Math.round(l.quantite * pv * 100) / 100 }
      })
      commands.push({ id: row.id, date: row.date, createdAt: importedAt, createdVia: 'backoffice',
        commercialId: `simulation:${normalizeName(row.commercial)}`, commercialNom: row.commercial.trim(),
        clientId: client.id, clientNom: client.nom, secteur: client.secteur, zone: client.zone || '', gpsLat: 0, gpsLng: 0,
        lignes, heurelivraison: '', statut: 'en_attente_approbation', emailDestinataire: '',
        notes: `SIMULATION — à valider avant exécution. Création du scénario : ${row.creation}. Entrepôt fictif : ${row.entrepot}. Tournée fictive : ${row.tournee}. Référence : ${row.reference}. Import : ${importedAt} par ${actor}. Tarifs ERP au moment de l’import.`,
      })
    } catch (e) { errors.add(e instanceof Error ? e.message : String(e)) }
  }
  return { commands, errors: [...errors] }
}

export async function readBatchTable<T>(table: string): Promise<T[]> {
  const result: T[] = []
  for (let offset = 0; offset < 100000; offset += 250) {
    const r = await fetch(`/api/sync-read?table=${encodeURIComponent(table)}&offset=${offset}&limit=250`, { cache: 'no-store' })
    const body = await r.json()
    if (!r.ok || !body.ok || !Array.isArray(body.data)) throw new Error(`Lecture impossible : ${table}`)
    result.push(...body.data.map((row: { payload: T }) => row.payload))
    if (body.data.length < 250) return result
  }
  throw new Error('Lecture trop volumineuse : import interrompu')
}
