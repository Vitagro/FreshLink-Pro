import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../artifacts/api-server/src/lib/aiContext.ts',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'const SB_URL="https://test.invalid",SB_SERVICE_KEY="test",sbServiceHeaders=()=>({});\n');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {buildServerAiContext}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
test('ordinary accounts without mapped data permissions cause no database reads',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=()=>{throw Error('must not read')};
 try{assert.match(await buildServerAiContext({id:'a',role:'financier'}),/Aucun accès automatique/)}finally{globalThis.fetch=previous}
});
test('commercial context filters by server account and rejects foreign/simulated/refused rows',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>{
  if(String(url).includes('fl_dashboard_settings'))return Response.json([{payload:{scope:'real'}}]);
  assert.equal(new URL(url).searchParams.get('payload->>prevendeurId'),'eq.own');
  return Response.json([
   {id:'ok',payload:{prevendeurId:'own',statut:'livre'}},
   {id:'foreign',payload:{prevendeurId:'other',statut:'livre'}},
   {id:'hidden-sim',payload:{prevendeurId:'own',statut:'livre',sourceImport:'simulation_fixture'}},
   {id:'refused',payload:{prevendeurId:'own',statut:'refuse'}},
  ]);
 };
 try{const result=JSON.parse(await buildServerAiContext({id:'own',role:'prevendeur'}));assert.equal(result.count,1);assert.deepEqual(result.sourceIds,['ok']);assert.equal(result.scope,'real')}finally{globalThis.fetch=previous}
});
test('super super admin follows shared simulation mode, with explicit provenance',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>String(url).includes('fl_dashboard_settings')?Response.json([{payload:{scope:'simulation'}}]):Response.json([{id:'SIM-test',payload:{statut:'en_attente_approbation'}},{id:'real',payload:{statut:'livre'}}]);
 try{const result=JSON.parse(await buildServerAiContext({id:'admin',role:'super_super_admin'}));assert.equal(result.count,1);assert.match(result.notice,/simulées/)}finally{globalThis.fetch=previous}
});
test('database errors never become an empty business summary',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:503});
 try{await assert.rejects(()=>buildServerAiContext({id:'own',role:'prevendeur'}),/CONTEXT_UNAVAILABLE/)}finally{globalThis.fetch=previous}
});
