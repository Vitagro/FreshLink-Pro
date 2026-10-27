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

test('Ollama uses fixed cloud endpoint, server context and default model without fallback',async()=>{
 let calls=0;
 const r=await setup({OLLAMA_API_KEY:'test-only',OPENAI_API_KEY:'unused'},async(url,options)=>{
  calls++;assert.equal(url,'https://ollama.com/api/chat');
  const body=JSON.parse(options.body);assert.equal(body.model,'gpt-oss:120b');assert.equal(body.stream,false);
  assert.match(body.messages[0].content,/CONTEXTE SERVEUR/);assert.equal(body.options.num_predict,1500);
  return {ok:true,json:async()=>({done:true,message:{content:'Bonjour Vita',thinking:'not returned'}})};
 })();assert.equal(calls,1);assert.equal(r.payload.text,'Bonjour Vita');assert.doesNotMatch(JSON.stringify(r),/not returned/);
});
test('Ollama rejects empty, truncated and unauthorized responses without leaking details or fallback',async()=>{
 for(const response of [{ok:false,status:401},{ok:true,json:async()=>({done:true,done_reason:'length',message:{content:'partial'}})},{ok:true,json:async()=>({done:true,message:{content:''}})}]) {
  let calls=0;const r=await setup({OLLAMA_API_KEY:'private-key',GEMINI_API_KEY:'unused'},async()=>{calls++;return response})();
  assert.equal(r.status,502);assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(r),/private-key|partial/);
 }
});

test('Groq is primary when authorized with its key and never falls back',async()=>{
 let calls=0;
 const r=await setup({GROQ_API_KEY:'test',OLLAMA_API_KEY:'unused'},async(url,options)=>{
  calls++;assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(JSON.parse(options.body).model,'openai/gpt-oss-120b');
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'Connexion réussie'}}]})};
 })();assert.equal(r.payload.text,'Connexion réussie');assert.equal(calls,1);
 for(const response of [{ok:false,status:429},{ok:true,json:async()=>({choices:[{finish_reason:'length',message:{content:'partial'}}]})}]){
  calls=0;const bad=await setup({GROQ_API_KEY:'test',OLLAMA_API_KEY:'unused'},async()=>{calls++;return response})();assert.equal(bad.status,502);assert.equal(calls,1);
 }
});
