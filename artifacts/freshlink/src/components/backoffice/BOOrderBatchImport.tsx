import { useRef, useState } from 'react'
import { store, type Article, type Client, type Commande, type User } from '@/lib/store'
import { prepareOrderBatch, readBatchTable, type OrderBatch } from '@/lib/orderBatch'
import { hasPermission } from '@/lib/permissions'
import { logAction } from '@/lib/auditLog'

export function BOOrderBatchImport({ user, onDone }: { user: User; onDone: () => void }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false)
  const [commands, setCommands] = useState<Commande[]>([]), [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState(''), [existing, setExisting] = useState(0)
  const lock = useRef(false)
  if (!hasPermission(user.role, 'creer_commande')) return null
  async function preview(file?: File) {
    if (!file) return
    setBusy(true); setCommands([]); setErrors([]); setMessage('Vérification du catalogue et des tarifs…')
    try {
      const batch = JSON.parse(await file.text()) as OrderBatch
      const [clients, articles, history] = await Promise.all([
        readBatchTable<Client>('fl_clients'), readBatchTable<Article>('fl_articles'), readBatchTable<Commande>('fl_commandes'),
      ])
      const prepared = prepareOrderBatch(batch, clients, articles, history, store.computePrixEffectif, new Date().toISOString(), user.name)
      setCommands(prepared.commands); setErrors(prepared.errors)
      const ids = new Set(history.map(c => c.id))
      setExisting(prepared.commands.filter(c => ids.has(c.id)).length)
      setMessage(`${batch.orders.length} commandes examinées. Aucune donnée modifiée.`)
    } catch (e) { setErrors([e instanceof Error ? e.message : String(e)]); setMessage('') }
    finally { setBusy(false) }
  }
  async function commit() {
    if (lock.current || errors.length || !commands.length) return
    lock.current = true; setBusy(true); setErrors([])
    try {
      const before = await readBatchTable<Commande>('fl_commandes')
      const ids = new Set(before.map(c => c.id))
      const fresh = commands.filter(c => !ids.has(c.id))
      for (let i = 0; i < fresh.length; i += 25) {
        setMessage(`Enregistrement : ${i} / ${fresh.length} nouvelles commandes`)
        const r = await fetch('/api/sync-write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
          table: 'fl_commandes', insertOnly: true,
          upserts: fresh.slice(i, i + 25).map(c => ({ id: c.id, payload: c, updated_at: new Date().toISOString() })),
        }) })
        const result = await r.json()
        if (!r.ok || !result.ok) throw new Error(`Échec après ${i} enregistrements : ${result.errors?.join(', ') || r.status}. Relancer le contrôle pour reprendre sans doublons.`)
      }
      const saved = await readBatchTable<Commande>('fl_commandes')
      const byId = new Map(saved.map(c => [c.id, c]))
      const failures = fresh.filter(c => {
        const s = byId.get(c.id)
        return !s || s.clientId !== c.clientId || s.commercialNom !== c.commercialNom || s.date !== c.date || s.statut !== c.statut || s.notes !== c.notes ||
          s.lignes?.length !== c.lignes.length || c.lignes.some((l, i) => {
            const actual = s.lignes[i]
            return actual.articleId !== l.articleId || actual.quantite !== l.quantite || actual.prixVente !== l.prixVente || actual.total !== l.total
          })
      })
      if (failures.length) throw new Error(`${failures.length} commandes non vérifiées. Aucun succès global déclaré.`)
      logAction(user, 'creer_commande', 'success', { type: 'import_simulation', label: `${fresh.length} nouvelles commandes, ${commands.length - fresh.length} identifiants préexistants ignorés` })
      setMessage(`Import vérifié : ${fresh.length} commandes enregistrées ; ${commands.length - fresh.length} identifiants déjà présents ignorés. Statut : en attente d’approbation. Aucun paiement ni livraison réelle créé.`)
      setExisting(commands.length); onDone()
    } catch (e) { setErrors([e instanceof Error ? e.message : String(e)]) }
    finally { lock.current = false; setBusy(false) }
  }
  return <>
    <button className="px-3 py-2 rounded-xl border text-sm" onClick={() => setOpen(true)}>Importer une simulation contrôlée</button>
    {open && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <section className="bg-white rounded-xl p-6 max-w-3xl w-full max-h-[90vh] overflow-auto space-y-4">
        <h2 className="text-xl font-bold">Simulation — import dans le carnet de commandes</h2>
        <p>Tarifs actuels de l’ERP, clients et articles existants uniquement. Les commerciaux sont conservés sans créer de comptes. Les commandes attendront une approbation ; les étapes logistiques du scénario ne sont pas des livraisons réalisées.</p>
        <label className="block">Fichier de simulation JSON <input aria-label="Fichier de simulation JSON" type="file" accept=".json" disabled={busy} onChange={e => void preview(e.target.files?.[0])} /></label>
        <p role="status">{message}</p>
        {commands.length > 0 && <div>
          <p>{commands.length} commandes · {commands.reduce((s, c) => s + c.lignes.reduce((v, l) => v + l.quantite, 0), 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kg · {existing} identifiants déjà présents</p>
          <p>Commerciaux : {[...new Set(commands.map(c => c.commercialNom))].join(', ')}</p>
          <p>Valorisation : {commands.reduce((s, c) => s + c.lignes.reduce((v, l) => v + l.total, 0), 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} DH</p>
        </div>}
        {errors.length > 0 && <div role="alert" className="text-red-700"><p>{errors.length} problème(s) — import bloqué</p><ul>{errors.slice(0, 100).map(e => <li key={e}>{e}</li>)}</ul></div>}
        <div className="flex gap-4">
          <button className="px-4 py-2 bg-emerald-700 text-white rounded disabled:opacity-40" disabled={busy || !!errors.length || !commands.length || existing === commands.length} onClick={() => void commit()}>Enregistrer les commandes en attente d’approbation</button>
          <button disabled={busy} onClick={() => setOpen(false)}>Fermer</button>
        </div>
      </section>
    </div>}
  </>
}
