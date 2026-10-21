import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test, after } from 'node:test';
process.env.DEVICE_SECRET = 'isolated-test-signing-key-never-use-in-production';
process.env.AUTH_SECRET = 'isolated-auth-key-never-use-in-production';
process.env.VITE_SUPABASE_URL = 'https://database.test';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://database.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
const nativeFetch = globalThis.fetch;
let role = 'admin', active = true, databaseDown = false, writeCount = 0, failWrites = false;
let catalogueRpcCode = null, catalogueRpcBody;
const orders = new Map();
const catalogue = [{ id: 'fruit', nom: 'Fruit', unite: 'kg', prix_public: 17, marketplace_actif: true, statut: 'disponible' }];
globalThis.fetch = async (input, options = {}) => {
  const url = String(input);
  if (!url.startsWith('https://database.test/')) throw new Error('Unexpected external network request blocked by test');
  if (databaseDown) return new Response('{}', { status: 503 });
  if (url.includes('/fl_users')) return Response.json([{id:'admin-test',payload:{role,actif:active,email:'test@example.invalid',password:'isolated-password',passwordMobile:'isolated-mobile-password'}}]);
  if (url.endsWith('/rpc/fl_catalogue_write') || url.endsWith('/rpc/fl_cash_write')) {
    catalogueRpcBody = JSON.parse(options.body);
    return catalogueRpcCode ? Response.json({code:catalogueRpcCode},{status:400}) : Response.json({ok:true});
  }
  if (url.includes('/v_marketplace_catalogue')) return Response.json(catalogue);
  if (url.includes('/fl_notices')) return Response.json([]);
  if (url.includes('/fl_commandes?')) {
    const id=new URL(url).searchParams.get('id')?.replace(/^eq\./,'');
    return Response.json(orders.has(id)?[orders.get(id)]:[]);
  }
  if(url.endsWith('/fl_commandes') && options.method==='POST' && !failWrites) {
    const row=JSON.parse(options.body);
    if(orders.has(row.id)) return new Response('',{status:409});
    orders.set(row.id,row); writeCount++;
    return new Response('',{status:201});
  }
  if (options.method === 'POST' || options.method === 'PATCH' || options.method === 'DELETE') {
    writeCount++;
    return new Response('', {status: failWrites ? 503 : 201});
  }
  return Response.json([]);
};
const { default: app } = await import('../artifacts/api-server/dist/app.mjs');
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening',resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
after(() => { globalThis.fetch = nativeFetch; server.close(); });
function token(claims) {
  const data = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return data+'.'+createHmac('sha256',process.env.AUTH_SECRET).update(data).digest('base64url');
}
const headers = {'Content-Type':'application/json', Authorization:'Bearer '+token({sub:'admin-test',role:'admin',exp:Date.now()+60000})};
const call = (path, options={}) => nativeFetch(base+path, options);

test('cash uses transactional writes and maps insufficient balance and invalid amounts without fallback',async()=>{
  const data=Buffer.from(JSON.stringify({fp:'device',exp:Date.now()+60000})).toString('base64url');
  const cookie=data+'.'+createHmac('sha256',process.env.DEVICE_SECRET).update(data).digest('base64url');
  const send=()=>call('/sync-write',{method:'POST',headers:{...headers,Cookie:'fl_device_token='+cookie},body:JSON.stringify({table:'fl_caisse_entries',upserts:[{id:'fixture',payload:{type:'sortie',montant:5}}]})});
  const before=writeCount;
  try {
    catalogueRpcCode=null; assert.equal((await send()).status,200);
    catalogueRpcCode='P0002'; assert.equal((await send()).status,409);
    catalogueRpcCode='22023'; assert.equal((await send()).status,400);
    catalogueRpcCode='42883'; assert.equal((await send()).status,503);
    assert.equal(writeCount,before);
  } finally { catalogueRpcCode=null }
});

test('catalogue writes use atomic RPC and never fall back after conflict or outage', async () => {
  const data=Buffer.from(JSON.stringify({fp:'device',exp:Date.now()+60000})).toString('base64url');
  const cookie=data+'.'+createHmac('sha256',process.env.DEVICE_SECRET).update(data).digest('base64url');
  const body={table:'fl_articles',upserts:[{id:'fruit',payload:{stockDisponible:9},expectedPayload:{stockDisponible:10}}]};
  const send=()=>call('/sync-write',{method:'POST',headers:{...headers,Cookie:'fl_device_token='+cookie},body:JSON.stringify(body)});
  const before=writeCount;
  assert.equal((await send()).status,200);
  assert.deepEqual(catalogueRpcBody.p_rows,body.upserts);
  try {
    catalogueRpcCode='P0001'; assert.equal((await send()).status,409);
    catalogueRpcCode='42883'; assert.equal((await send()).status,503);
    assert.equal(writeCount,before);
  } finally { catalogueRpcCode=null }
});
test('anonymous configuration read and write are refused', async () => {
  assert.equal((await call('/ext/web-integration-config')).status,401);
  assert.equal((await call('/ext/web-integration-config',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
});
test('declared adminId cannot revoke sessions', async () => {
  assert.equal((await call('/ext/revoke-sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({adminId:'admin-test',exceptUserId:'admin-test'})})).status,401);
});
test('signed role cannot override database role or disabled account', async () => {
  role='prevendeur'; assert.equal((await call('/ext/web-integration-config',{headers})).status,403);
  role='admin'; active=false; assert.equal((await call('/ext/web-integration-config',{headers})).status,403);
  active=true; assert.equal((await call('/ext/web-integration-config',{headers})).status,200);
});
test('rights lookup fails closed during database outage', async () => {
  databaseDown=true; assert.equal((await call('/ext/web-integration-config',{headers})).status,503); databaseDown=false;
});
test('expired or malformed token is refused', async () => {
  for(const auth of [token({sub:'admin-test',exp:Date.now()-1}),token({sub:'admin-test'}),headers.Authorization.slice(7)+'.extra']) {
    assert.equal((await call('/ext/web-integration-config',{headers:{Authorization:'Bearer '+auth}})).status,401);
  }
});
const order = {nom_client:'Test isolated',telephone:'0600000000',lignes:[{articleId:'fruit',quantite:2,prixUnitaire:0,total:0}],montant_total:49};
test('tampered total, negative quantity and zero-price products cause no writes',async()=>{
  for(const body of [{...order,montant_total:1},{...order,lignes:[{articleId:'fruit',quantite:-1}]}]) {
    const before=writeCount;
    const response=await call('/ext/commandes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert.ok([400,409].includes(response.status)); assert.equal(writeCount,before);
  }
  catalogue[0].prix_public=0;
  assert.equal((await call('/ext/commandes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(order)})).status,400);
  catalogue[0].prix_public=17;
});
test('failed order persistence never returns success',async()=>{
  failWrites=true;
  const response=await call('/ext/commandes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(order)});
  assert.equal(response.status,503); assert.equal((await response.json()).numero,undefined);
  failWrites=false;
});
test('device cookie alone does not authorize sync writes',async()=>{
  const data=Buffer.from(JSON.stringify({fp:'device',exp:Date.now()+60000})).toString('base64url');
  const cookie=data+'.'+createHmac('sha256',process.env.DEVICE_SECRET).update(data).digest('base64url');
  assert.equal((await call('/sync-write',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'fl_device_token='+cookie},body:JSON.stringify({table:'fl_users',clearAll:true})})).status,401);
});

test('server login issues HttpOnly session and never returns password variants', async()=>{
  const response=await call('/ext/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'test@example.invalid',password:'isolated-password'})});
  assert.equal(response.status,200);
  assert.match(response.headers.get('set-cookie'),/HttpOnly/);
  const body=await response.json();
  assert.equal(body.user.password,undefined); assert.equal(body.user.passwordMobile,undefined);
  const adminSession=await call('/admin-session',{method:'POST',headers:{Authorization:'Bearer '+body.token,'Content-Type':'application/json'},body:'{}'});
  assert.equal(adminSession.status,200);
});
test('order totals are authoritative and repeat submissions reuse the durable order',async()=>{
  const body={...order,statut:'livre',idempotencyKey:'11111111-1111-4111-8111-111111111111'};
  const send=()=>call('/ext/commandes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const first=await send(); assert.equal(first.status,201);
  const firstBody=await first.json();
  const stored=orders.get(firstBody.numero).payload;
  assert.equal(stored.statut,'nouveau'); assert.equal(stored.lignes[0].prixUnitaire,17); assert.equal(stored.montant_total,49);
  const writesAfter=writeCount;
  const repeat=await send(); assert.equal(repeat.status,200); assert.equal((await repeat.json()).numero,firstBody.numero);
  assert.equal(writeCount,writesAfter);
  body.montant_total=1;
  assert.equal((await send()).status,409);
});


test('ERP reads require an active account as well as a device', async()=>{
  const data=Buffer.from(JSON.stringify({fp:'device',exp:Date.now()+60000})).toString('base64url');
  const cookie=data+'.'+createHmac('sha256',process.env.DEVICE_SECRET).update(data).digest('base64url');
  const deviceHeaders={Cookie:'fl_device_token='+cookie};
  assert.equal((await call('/sync-read?table=fl_clients',{headers:deviceHeaders})).status,401);
  assert.equal((await call('/sync-read?table=fl_clients',{headers:{...headers,...deviceHeaders}})).status,200);
  active=false;
  try { assert.equal((await call('/sync-read?table=fl_clients',{headers:{...headers,...deviceHeaders}})).status,403) }
  finally { active=true }
});
