import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const compile = source => ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const library = name => dataUrl(compile(fs.readFileSync(new URL(`../artifacts/freshlink/src/lib/${name}.ts`,import.meta.url),'utf8')));
let source=fs.readFileSync(new URL('../artifacts/freshlink/src/lib/store.ts',import.meta.url),'utf8');
// Run the real business functions with an isolated cache and no network sync.
source=source.replace('from "bcryptjs"',`from "${dataUrl('export default {}')}"`)
  .replace('from "./stockTransfer"',`from "${library('stockTransfer')}"`)
  .replace('from "./dashboardMetrics"',`from "${library('dashboardMetrics')}"`)
  .replace('from "./supabase/autoSync"',`from "${dataUrl('export const onLocalWrite = () => {}')}"`);
const memory=new Map();
globalThis.window=new EventTarget();
globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
globalThis.fetch=()=>{throw new Error('No external requests allowed in isolated workflow tests')};
const {store}=await import(dataUrl(compile(source)));
test('delivery regularization excludes all simulation markers and never fabricates payment',()=>{
  const base={date:'2026-10-21',statut:'valide',clientId:'fixture-client',clientNom:'Fixture',commercialNom:'Fixture',lignes:[{articleId:'fixture',articleNom:'Fixture',quantite:10,prixVente:5,unite:'kg'}]};
  store.saveClients([]); store.saveBonsLivraison([]); store.saveCaisseEntries([]);
  store.saveCommandes([{...base,id:'real'},{...base,id:'SIM-1'},{...base,id:'flag',isSimulation:true},{...base,id:'import',sourceImport:'simulation_fixture'},{...base,id:'returned',statut:'retour'}]);
  assert.equal(store.bulkMarkCommandesLivrees('fixture-user','Fixture'),1);
  assert.equal(store.getBonsLivraison().length,1);
  assert.equal(store.getBonsLivraison()[0].statut,'émis');
  assert.equal(store.getBonsLivraison()[0].statutLivraison,'livre');
  assert.equal(store.getCaisseEntries().length,0);
  assert.equal(store.getCommandes().filter(c=>c.statut==='livre').length,1);
  assert.equal(store.bulkMarkCommandesLivrees('fixture-user','Fixture'),0);
  assert.equal(store.getBonsLivraison().length,1);
});
test('stock transfer preserves balances and rejects duplicate or insufficient movements',()=>{
  store.saveArticles([{id:'fixture',nom:'Fixture',stockDisponible:10,stockDefect:2}]);
  store.saveTransferts([]);
  const transfer={id:'transfer-1',articleId:'fixture',quantite:3,sens:'conforme_vers_defect'};
  // Isolate warehouse mode, independent of production configuration.
  store.isCrossdockMode=()=>false;
  store.addTransfert(transfer); store.addTransfert(transfer);
  const article=store.getArticles()[0];
  assert.equal(article.stockDisponible,7); assert.equal(article.stockDefect,5);
  assert.equal(store.getTransferts().length,1);
  assert.throws(()=>store.addTransfert({...transfer,id:'transfer-2',quantite:8}));
  assert.equal(store.getTransferts().length,1);
  assert.equal(store.getArticles()[0].stockDisponible,7);
});
