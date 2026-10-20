import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source=fs.readFileSync(new URL('../artifacts/freshlink/src/lib/dashboardMetrics.ts',import.meta.url),'utf8')
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {isSimulationOrder,selectOrderScope,selectPeriod,lineWeightKg}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
test('simulation markers never contribute to real operational totals',()=>{
 const rows=[{id:'CMD-1',statut:'livre'},{id:'SIM-1',statut:'en_attente'},{id:'legacy',statut:'valide',isSimulation:true},{id:'import',statut:'valide',sourceImport:'simulation_batch'},{id:'cancelled',statut:'refuse'},{id:'returned',statut:'retour'}]
 assert.deepEqual(selectOrderScope(rows,'real').map(o=>o.id),['CMD-1'])
 assert.equal(selectOrderScope(rows,'simulation').length,3)
 assert.equal(isSimulationOrder(rows[2]),true)
})
test('weights convert only known mass units and never invent crate weights',()=>{
 assert.equal(lineWeightKg({quantite:2,unite:'t'}),2000)
 assert.equal(lineWeightKg({quantite:500,unite:'g'}),0.5)
 assert.equal(lineWeightKg({quantite:12},'kg'),12)
 assert.equal(lineWeightKg({quantite:12,unite:'piece'},'kg'),0)
 for(const unit of ['caisse','unité','']) assert.equal(lineWeightKg({quantite:12,unite:unit}),0)
 assert.equal(lineWeightKg({quantite:NaN,unite:'kg'}),0)
})
test('date range is inclusive and excludes future orders from period-to-date',()=>{
 const rows=[{date:'2026-10-01'},{date:'2026-10-19'},{date:'2026-10-31'},{date:'2026-09-30'}]
 assert.equal(selectPeriod(rows,'2026-10-01','2026-10-19').length,2)
 assert.equal(selectPeriod(rows,'2026-10-20','2026-10-19').length,0)
 assert.equal(selectPeriod(rows,'','2026-10-19').length,0)
})
