import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source = fs.readFileSync(new URL('../artifacts/freshlink/src/lib/orderBatch.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { prepareOrderBatch } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const client = { id: 'C1', nom: 'Client A', secteur: 'Zone A', zone: 'Casa' }
const article = { id: 'A1', nom: 'Tomate', nomAr: '', unite: 'kg' }
const history = [{ id: 'CMD-1', lignes: [{ articleId: 'A1', articleNom: 'Tomate' }] }]
const row = { id: 'SIM-2026-000001', date: '2026-10-31', creation: '2026-10-30T18:00:00+01:00', client: 'Client A', secteur: 'Zone A', commercial: 'Marouane Salim', reference: 'CMD-1', entrepot: 'SIM-DEPOT', tournee: 'SIM-TOUR', lignes: [{ article: 'Tomate', quantite: 12.5 }] }
const run = (rows = [row], clients = [client], articles = [article], price = () => 7) => prepareOrderBatch({ version: 1, nature: 'SIMULATION', orders: rows }, clients, articles, history, price, '2026-10-18T01:00:00Z', 'Admin')
test('preserves assignment and prices without claiming a completed delivery', () => {
  const result = run()
  assert.deepEqual(result.errors, [])
  const c = result.commands[0]
  assert.equal(c.id, row.id)
  assert.equal(c.commercialNom, 'Marouane Salim')
  assert.equal(c.statut, 'en_attente_approbation')
  assert.equal(c.createdAt, '2026-10-18T01:00:00Z')
  assert.equal(c.lignes[0].total, 87.5)
  assert.match(c.notes, /SIMULATION/)
})
test('blocks duplicate IDs and ambiguous clients', () => {
  assert.equal(run([row, row]).errors.length, 1)
  assert.equal(run([row], [client, { ...client, id: 'C2' }]).commands.length, 0)
})
test('blocks missing references, kg mismatch, zero prices and invalid quantities', () => {
  assert.equal(run([{ ...row, reference: 'missing' }]).commands.length, 0)
  assert.equal(run([row], [client], [{ ...article, unite: 'piece' }]).commands.length, 0)
  assert.equal(run([row], [client], [article], () => 0).commands.length, 0)
  assert.equal(run([{ ...row, lignes: [{ article: 'Tomate', quantite: -1 }] }]).commands.length, 0)
})
