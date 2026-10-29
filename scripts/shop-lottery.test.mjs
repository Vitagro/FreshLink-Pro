import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
const source=fs.readFileSync('artifacts/api-server/src/routes/ext/loterie.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default router;','');
const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
function setup(){
 let get,post,guard;
 const reward={id:'s1',label:'Reward',type:'reduction',montant:70,poids:1,maxGagnants:1,ciblesAutorisees:['tous']};
 const records={__loterie_config:{payload:{active:true,seuilCible:50,segments:[reward]}},__loterie_winners:{payload:{_revision:'initial',_claims:{}},updated_at:'date'}};
 const coupons={};
 const requireAccount=()=>{};
 vm.runInNewContext(code,{Router:()=>({use(){},get(_p,h){get=h},post(_p,g,h){guard=g;post=h}}),process:{env:{VITE_SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'fake'}},randomUUID,randomInt:()=>0,requireAccount,rateLimit:()=>false,AbortSignal,Date,Number,JSON,encodeURIComponent,fetch:async(url,options)=>{
   const u=new URL(url),id=u.searchParams.get('id')?.slice(3),table=u.pathname.split('/').pop(),body=options.body?JSON.parse(options.body):null;
   const data=table==='fl_coupons'?coupons:records;
   if(options.method==='GET')return Response.json(data[id]?[data[id]]:[]);
   if(options.method==='POST'){if(data[body.id])return new Response('',{status:409});data[body.id]=body;return Response.json([body]);}
   const revision=u.searchParams.get('payload->>_revision')?.slice(3);
   if(revision!==records[id].payload._revision)return Response.json([]);
   records[id]=body;return Response.json([body]);
 }});
 async function call(handler,id='u1'){let result,status=200;const res={locals:{account:{id,role:'client'}},status(n){status=n;return this},json(v){result=JSON.parse(JSON.stringify(v))}};await handler({body:{segmentId:'forged',userId:'victim'}},res);return{status,result};}
 return {get:()=>call(get),post:id=>call(post,id),records,coupons,guard,requireAccount};
}
test('public config exposes neither coupon codes nor participant identities',async()=>{const s=setup();const r=await s.get();assert.equal(r.result.active,true);assert.doesNotMatch(JSON.stringify(r.result),/_claims|revision/);assert.equal(s.guard,s.requireAccount);});
test('server selects reward, replay is idempotent and concurrent quota cannot overspend',async()=>{const s=setup();const results=await Promise.all([s.post('u1'),s.post('u2')]);assert.equal(results.filter(r=>r.status===200).length,1);const winner=results[0].status===200?'u1':'u2';const first=results.find(r=>r.status===200);const again=await s.post(winner);assert.equal(again.result.coupon.code,first.result.coupon.code);assert.equal(Object.keys(s.coupons).length,1);assert.equal(s.records.__loterie_winners.payload.s1.count,1);});
test('disabled offers cannot award prizes',async()=>{const s=setup();s.records.__loterie_config.payload.active=false;assert.equal((await s.post()).status,409);assert.equal(Object.keys(s.coupons).length,0);});
