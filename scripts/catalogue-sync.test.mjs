import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const memory = new Map(), timers = new Map(), requests = [];
let timerId = 0, conflict = false;
globalThis.window = new EventTarget();
globalThis.localStorage = { getItem:k=>memory.get(k)??null, setItem:(k,v)=>memory.set(k,v), removeItem:k=>memory.delete(k) };
Object.defineProperty(globalThis,'navigator',{value:{onLine:true},configurable:true});
globalThis.setTimeout = fn => { timers.set(++timerId,fn); return timerId };
globalThis.clearTimeout = id => timers.delete(id);
globalThis.fetch = async (url, options) => {
  assert.equal(url,'/api/sync-write'); requests.push(JSON.parse(options.body));
  return { status: conflict ? 409 : 200, json: async()=>({ok:!conflict,errors:conflict?['Conflict']:[]}) };
};
const source=fs.readFileSync(new URL('../artifacts/freshlink/src/lib/supabase/autoSync.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {onLocalWrite,suppressAutoSync}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
async function flush() {
  const pending=[...timers.values()]; timers.clear(); pending.forEach(fn=>fn());
  await new Promise(resolve=>setImmediate(resolve));
}
test('hydration seeds exact payload; stale conflict preserves baseline and raises a visible error event',async()=>{
  const original=[{id:'test-fruit',stockDisponible:10}];
  suppressAutoSync(()=>onLocalWrite('fl_articles',JSON.stringify(original)));
  await flush(); assert.equal(requests.length,0);
  const changed=[{...original[0],stockDisponible:9}];
  let error;
  window.addEventListener('fl_sync_error',event=>{error=event.detail});
  conflict=true;
  onLocalWrite('fl_articles',JSON.stringify(changed)); await flush();
  assert.deepEqual(requests.at(-1).upserts[0].expectedPayload,original[0]);
  assert.equal(error.table,'fl_articles'); assert.equal(error.code,'409');
  onLocalWrite('fl_articles',JSON.stringify(changed)); await flush();
  assert.deepEqual(requests.at(-1).upserts[0].expectedPayload,original[0]);
  conflict=false;
  onLocalWrite('fl_articles',JSON.stringify(changed)); await flush();
  onLocalWrite('fl_articles',JSON.stringify([{...changed[0],stockDisponible:8}])); await flush();
  assert.deepEqual(requests.at(-1).upserts[0].expectedPayload,changed[0]);
});
