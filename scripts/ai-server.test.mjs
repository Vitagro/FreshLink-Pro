import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import vm from 'node:vm'
const source = fs.readFileSync(new URL('../artifacts/api-server/src/routes/aiChat.ts', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace('export default router;', '')
const code = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText
function setup(env={}, fetcher=async()=>{throw Error('unexpected provider request')}) {
 let handler, middleware
 const account = ()=>{}
 vm.runInNewContext(code, {Router:()=>({post:(_path,m,h)=>{middleware=m;handler=h}}), requireAccount:account, requireDeviceApi:()=>null, reserveAiCall:async()=>true, buildServerAiContext:async()=>'{"scope":"real","count":2}', process:{env}, fetch:fetcher, AbortController, AbortSignal, setTimeout, clearTimeout})
 assert.equal(middleware,account)
 return async (body={system:'test',messages:[{role:'user',content:'bonjour'}]})=>{
  let status=200, payload
  const res={locals:{account:{id:'test',role:'super_super_admin'}},status:n=>{status=n;return res},json:x=>{payload=x}}
  await handler({body},res)
  return {status,payload}
 }
}
test('missing server configuration returns an actionable diagnostic', async()=>{
 const r=await setup()(); assert.equal(r.status,503); assert.match(r.payload.error,/ANTHROPIC_API_KEY/)
})
test('rejects invalid roles and excessive generation budgets before provider call', async()=>{
 const run=setup({ANTHROPIC_API_KEY:'test-only'})
 for(const body of [{system:'test',messages:[{role:'system',content:'bad'}]}, {system:'test',messages:[{role:'user',content:'hi'}],max_tokens:99999}]) assert.equal((await run(body)).status,400)
})
test('does not expose provider response body or secrets', async()=>{
 const r=await setup({ANTHROPIC_API_KEY:'test-only'},async()=>({ok:false,status:401,text:async()=> 'PRIVATE_PROVIDER_DETAILS'}))()
 assert.equal(r.status,502); assert.match(r.payload.error,/Clé IA refusée/); assert.doesNotMatch(JSON.stringify(r),/PRIVATE_PROVIDER/)
})
test('falls back to configured Gemini and joins text parts',async()=>{
 let calls=0
 const r=await setup({ANTHROPIC_API_KEY:'test-only',GEMINI_API_KEY:'test-only'},async()=>{
  calls++; return calls===1?{ok:false,status:503}:{ok:true,json:async()=>({candidates:[{content:{parts:[{text:'Bonjour'},{text:'Vita'}]}}]})}
 })()
 assert.equal(calls,2); assert.equal(r.status,200); assert.equal(r.payload.text,'Bonjour\nVita')
})

test('OpenAI returns completed text with server instructions and no retention flag',async()=>{
 const r=await setup({OPENAI_API_KEY:'test-only',OPENAI_CHAT_MODEL:'test-model'},async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/responses');
  const body=JSON.parse(options.body); assert.equal(body.store,false);assert.match(body.instructions,/CONTEXTE SERVEUR/);
  return {ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:'Réponse vérifiable'}]}]})};
 })();assert.equal(r.status,200);assert.equal(r.payload.text,'Réponse vérifiable');
})
