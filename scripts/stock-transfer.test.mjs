import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source = fs.readFileSync(new URL('../artifacts/freshlink/src/lib/stockTransfer.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { transferBalances } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)

test('both transfer directions conserve total stock, including full source transfer', () => {
  for (const direction of ['conforme_vers_defect', 'defect_vers_conforme']) {
    for (const quantity of [0.5, 5]) {
      const result = transferBalances(5, 5, quantity, direction)
      assert.equal(result.stockDisponible + result.stockDefect, 10)
      assert.ok(result.stockDisponible >= 0 && result.stockDefect >= 0)
    }
  }
  assert.deepEqual(transferBalances(5, 2, 5, 'conforme_vers_defect'), { stockDisponible: 0, stockDefect: 7 })
})
test('insufficient source stock cannot create stock at destination', () => {
  assert.throws(() => transferBalances(5, 20, 6, 'conforme_vers_defect'), /supérieure/)
  assert.throws(() => transferBalances(20, 5, 6, 'defect_vers_conforme'), /supérieure/)
})
test('invalid quantities, balances and directions are rejected', () => {
  for (const quantity of [0, -1, NaN, Infinity]) assert.throws(() => transferBalances(5, 5, quantity, 'conforme_vers_defect'))
  assert.throws(() => transferBalances(-1, 5, 1, 'conforme_vers_defect'))
  assert.throws(() => transferBalances(5, NaN, 1, 'conforme_vers_defect'))
  assert.throws(() => transferBalances(5, 5, 1, 'unknown'))
})
