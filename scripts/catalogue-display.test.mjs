import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const code = ts.transpileModule(fs.readFileSync(new URL('../artifacts/freshlink/src/lib/catalogueDisplay.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText
const {markupPercent,stockTotalsByUnit} = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
test('missing cost cannot be displayed as a zero margin',()=>{
 for(const cost of [0,-1,NaN,Infinity]) assert.equal(markupPercent(cost,20),null)
 assert.equal(markupPercent(10,NaN),null)
 assert.equal(markupPercent(10,10),0)
 assert.equal(markupPercent(10,15),50)
 assert.equal(markupPercent(10,5),-50)
})
test('stock keeps kilograms, pieces and unknown units separate',()=>{
 const rows=[{unite:'kg',stockDisponible:10,stockDefect:1},{unite:'kg',stockDisponible:5,stockDefect:2},{unite:'pièce',stockDisponible:7,stockDefect:3},{stockDisponible:2,stockDefect:0}]
 assert.deepEqual(Object.fromEntries(stockTotalsByUnit(rows,'stockDisponible')),{'kg':15,'pièce':7,'unité non renseignée':2})
 assert.deepEqual(Object.fromEntries(stockTotalsByUnit(rows,'stockDefect')),{'kg':3,'pièce':3,'unité non renseignée':0})
 assert.deepEqual(stockTotalsByUnit([],'stockDisponible'),[])
})

