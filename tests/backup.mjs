import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'freshlink-backup-test-'));
process.env.SB_URL='https://backup.test'; process.env.SB_SERVICE_KEY='test-key'; process.env.OUT_DIR=directory;
const tables=['fl_users','fl_clients','fl_articles','fl_commandes','fl_caisse_entries'];
const original=globalThis.fetch;
globalThis.fetch=async(input)=>{
  const url=new URL(input); assert.equal(url.origin,'https://backup.test');
  if(url.pathname==='/rest/v1/') return Response.json({paths:Object.fromEntries(tables.map(t=>['/'+t,{}]))});
  const table=url.pathname.split('/').pop(); assert.ok(tables.includes(table));
  const count=table==='fl_clients'?2501:0;
  const offset=Number(url.searchParams.get('offset'));
  // Simulate a server cap LOWER than the requested page size.
  const data=Array.from({length:Math.max(0,Math.min(300,count-offset))},(_,i)=>({id:offset+i,payload:{test:true}}));
  return Response.json(data,{headers:{'content-range':`${offset}-${offset+data.length-1}/${count}`}});
};
try {
  await import('../scripts/backup-tables.mjs');
  const clients=JSON.parse(await readFile(join(directory,'fl_clients.json'),'utf8'));
  assert.equal(clients.length,2501); assert.equal(new Set(clients.map(c=>c.id)).size,2501);
  const manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
  assert.equal(manifest.tables.fl_clients.rows,2501); assert.equal(manifest.tables.fl_clients.sha256.length,64);
  console.log('PASS: complete backup beyond 1000 rows, server cap, manifest checksums');
} finally {
  globalThis.fetch=original;
  if(resolve(directory).startsWith(resolve(tmpdir())+'\\') || resolve(directory).startsWith(resolve(tmpdir())+'/')) await rm(directory,{recursive:true,force:true});
}
