import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const source = fs.readFileSync(new URL('../artifacts/freshlink/src/lib/ai.ts', import.meta.url), 'utf8')
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
const { callLLM } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
const originalFetch = globalThis.fetch
const run = async (response, check) => {
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++; assert.equal(url, '/api/ai-chat'); assert.equal(options.credentials, 'include')
    return response
  }
  try { await check(); assert.equal(calls, 1) } finally { globalThis.fetch = originalFetch }
}
test('returns successful backend answer without external browser requests', async () => {
  await run(Response.json({ok:true,text:'  Bonjour  '}), async () => assert.equal(await callLLM('test',[{role:'user',text:'bonjour'}]),'Bonjour'))
})
test('expired session does not retry on a third-party provider', async () => {
  await run(Response.json({error:'denied'},{status:401}), async () => assert.rejects(callLLM('test',[{role:'user',text:'bonjour'}]), /Session expirée/))
})
test('preserves configuration diagnostic rather than reporting false quota', async () => {
  await run(Response.json({error:'IA non configurée'},{status:503}), async () => assert.rejects(callLLM('test',[{role:'user',text:'bonjour'}]), /IA non configurée/))
})
test('rejects empty provider responses', async () => {
  await run(Response.json({ok:true,text:''}), async () => assert.rejects(callLLM('test',[{role:'user',text:'bonjour'}]), /réponse vide/))
})
