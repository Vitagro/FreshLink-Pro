import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../artifacts/api-server/src/routes/ext/shopAssistant.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default router;','');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
async function run({question='maticha',ids=['t'],source='supabase',quota=true}={}){
 let handler,calls=0,payload,status=200;
 vm.runInNewContext(code,{Router:()=>({post:(_p,h)=>{handler=h}}),process:{env:{GROQ_API_KEY:'test'}},AbortSignal,Set,Date,JSON,reserveAiCall:async id=>{assert.equal(id,'public-shop-assistant');return quota},fetch:async(url,opts)=>{
  calls++;
  if(calls===1){assert.equal(url,'https://erp.vita-agro.com/api/ext/catalogue');return Response.json([{id:'t',nom:'Tomate',prix:8,unite:'kg',stockDisponible:2,privateField:'not forwarded'}],{headers:{'X-Source':source}})}
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.doesNotMatch(opts.body,/privateField/);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({ids,intent:'products',price:999,prose:'invented'})}}]});
 }});
 const res={setHeader(){},status(n){status=n;return res},json(b){payload=b}};
 await handler({body:{question}},res);return {status,payload:JSON.parse(JSON.stringify(payload)),calls};
}
test('shop assistant returns only public catalogue prices, never model prices or prose',async()=>{
 const r=await run();assert.equal(r.status,200);assert.equal(r.payload.products[0].prix,8);assert.doesNotMatch(JSON.stringify(r.payload),/999|invented|privateField/);
});
test('rejects fabricated IDs, fallback catalogue, exhausted shared quota and oversized input',async()=>{
 assert.equal((await run({ids:['invented']})).status,503);
 assert.equal((await run({source:'erp-defaults'})).calls,1);
 const quota=await run({quota:false});assert.equal(quota.status,429);assert.equal(quota.calls,0);
 const oversized=await run({question:'a'.repeat(1001)});assert.equal(oversized.status,400);assert.equal(oversized.calls,0);
});
