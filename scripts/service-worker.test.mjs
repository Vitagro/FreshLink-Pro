import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../artifacts/freshlink/public/sw.js',import.meta.url),'utf8');
function harness(network=async()=>new Response('ok',{headers:{'Content-Type':'application/javascript'}})){
 const handlers={},entries=new Map(),deleted=[],calls=[];
 const key=r=>typeof r==='string'?r:r.url;
 const cache={match:async r=>entries.get(key(r))?.clone(),put:async(r,res)=>entries.set(key(r),res.clone()),addAll:async()=>{}};
 const context={URL,Response,console,self:{location:{origin:'https://erp.test'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:()=>{},clients:{claim:async()=>{}}},caches:{open:async()=>cache,match:cache.match,keys:async()=>['freshlink-v5','freshlink-v6','unrelated'],delete:async name=>{deleted.push(name)}},fetch:async(...args)=>{calls.push(args);return network(...args)}};
 vm.runInNewContext(source,context);
 async function request(path,mode='cors',method='GET'){
  let response;const waits=[];
  handlers.fetch({request:{url:'https://erp.test'+path,mode,method},respondWith:p=>response=p,waitUntil:p=>waits.push(p)});
  const result=await response;await Promise.all(waits);return result;
 }
 return {handlers,entries,deleted,calls,request};
}
test('API and writes bypass the service worker and never return cached private data',async()=>{
 const h=harness();h.entries.set('https://erp.test/api/sync-read',new Response('private'));
 assert.equal(await h.request('/api/sync-read'),undefined);assert.equal(await h.request('/api/ext/auth','cors','POST'),undefined);assert.equal(h.calls.length,0);
});
test('JavaScript uses valid cached bundles across deployments',async()=>{
 const h=harness(()=>{throw Error('old bundle removed')});h.entries.set('https://erp.test/assets/old.js',new Response('export default 1',{headers:{'Content-Type':'text/javascript'}}));
 assert.equal(await (await h.request('/assets/old.js')).text(),'export default 1');assert.equal(h.calls.length,0);
});
test('HTML masquerading as JavaScript is not persisted or executed',async()=>{
 const h=harness(async()=>new Response('<html>wrong</html>',{headers:{'Content-Type':'text/html'}}));
 assert.equal((await h.request('/assets/missing.js')).status,503);assert.equal(h.entries.size,0);
});
test('invalid old cache is replaced only with correct static content',async()=>{
 const h=harness();h.entries.set('https://erp.test/assets/app.js',new Response('<html>',{headers:{'Content-Type':'text/html'}}));
 assert.equal(await (await h.request('/assets/app.js')).text(),'ok');assert.equal(h.calls.length,1);
});
test('navigation bypasses HTTP cache and keeps a current offline shell',async()=>{
 const h=harness(async()=>new Response('<html>current</html>',{headers:{'Content-Type':'text/html'}}));
 assert.equal(await (await h.request('/','navigate')).text(),'<html>current</html>');assert.equal(h.calls[0][1].cache,'no-store');assert.equal(await h.entries.get('/').text(),'<html>current</html>');
});
test('activation removes only old ERP caches, including previously cached private responses',async()=>{
 const h=harness();let work;h.handlers.activate({waitUntil:p=>work=p});await work;assert.deepEqual(h.deleted,['freshlink-v5']);
});
test('offline navigation without a shell returns an explicit unavailable response',async()=>{
 const h=harness(()=>{throw Error('offline')});assert.equal((await h.request('/','navigate')).status,503);
});

test('entry failure retries once and then offers recovery instead of looping',()=>{
 const html=fs.readFileSync(new URL('../artifacts/freshlink/index.html',import.meta.url),'utf8');
 const bootstrap=html.match(/<script>\s*\/\/ Entry-module recovery[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g,'');
 const handlers={},stored=new Map(),replacements=[],root={childNodes:[],textContent:'',appendChild:b=>root.button=b};
 const location={href:'https://erp.test/?existing=1',replace:url=>replacements.push(url),reload:()=>{}};
 vm.runInNewContext(bootstrap,{URL,Date,location,window:{addEventListener:(name,fn)=>handlers[name]=fn},document:{getElementById:()=>root,createElement:()=>({})},sessionStorage:{getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)}});
 const event={target:{tagName:'SCRIPT',type:'module',src:'https://erp.test/assets/app.js'}};
 handlers.error(event);assert.equal(replacements.length,1);assert.equal(new URL(replacements[0]).searchParams.get('existing'),'1');
 handlers.error(event);assert.equal(replacements.length,1);assert.match(root.textContent,/connexion/);assert.ok(root.button);
});
