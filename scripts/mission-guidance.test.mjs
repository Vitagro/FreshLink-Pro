import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const source=fs.readFileSync(new URL('../artifacts/freshlink/src/lib/missionGuidance.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {commercialGuidance,purchaseGuidance}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
const product={id:'t',nom:'Tomates',unite:'kg',stockDisponible:15,prixAchat:5,um:'caisse',colisageParUM:10};
const line={articleId:'t',quantite:'1',prixVente:'8',uniteMode:'caisse'};
test('cumulative stock check converts cases and catches duplicate lines',()=>{
 const result=commercialGuidance([line,line],[product]);
 assert.ok(result.some(a=>a.code==='stock-t'&&a.message.includes('20')));
 assert.ok(result.some(a=>a.code==='duplicate-t'));
 assert.equal(commercialGuidance([line],[product]).length,0);
});
test('unknown conversion and unknown stock never produce false numeric availability',()=>{
 const unknown=commercialGuidance([line],[{...product,colisageParUM:undefined}]);
 assert.ok(unknown.some(a=>a.code==='unit-0'));assert.ok(!unknown.some(a=>a.code==='stock-t'));
 assert.equal(commercialGuidance([line],[{...product,stockDisponible:undefined}]).length,0);
});
test('flags loss and invalid quantity while excluding unknown purchase cost',()=>{
 assert.ok(commercialGuidance([{...line,prixVente:'4'}],[product]).some(a=>a.code==='loss-0'));
 assert.ok(!commercialGuidance([{...line,prixVente:'4'}],[{...product,prixAchat:0}]).some(a=>a.code==='loss-0'));
 assert.ok(commercialGuidance([{...line,quantite:'-2'}],[product]).some(a=>a.code==='qty-0'));
 assert.match(purchaseGuidance(12,10),/20.0 % au-dessus/);
 assert.match(purchaseGuidance(12,0),/référence absent/);
});
