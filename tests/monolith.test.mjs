import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrate } from '../scripts/migration-core.mjs';
import { hashPassword } from '../lib/auth/password.mjs';

const temporary = await mkdtemp(path.join(os.tmpdir(), 'elite-monolith-'));
process.env.TURSO_DATABASE_URL = 'file:' + path.join(temporary, 'elite.db');
process.env.SITE_ORIGIN = 'https://elite.test';
process.env.ADMIN_EMAIL = 'owner@elite.test';
process.env.ADMIN_PASSWORD_HASH = await hashPassword('SIMULATED_OWNER_PASSWORD_123');
process.env.PAYMENT_BCA_ACCOUNT_NUMBER='1234567890';
process.env.PAYMENT_BCA_ACCOUNT_HOLDER='PEMILIK SIMULASI';
process.env.AUTH_SECRET = 'a'.repeat(64);
process.env.CONFIG_SECRET = 'b'.repeat(64);
process.env.TEAM_ACCESS_SECRET = 'c'.repeat(64);
process.env.RAJAONGKIR_CONFIG_SECRET = 'd'.repeat(64);
process.env.LOCAL_STORAGE_PATH = path.join(temporary, 'files');
process.env.STORAGE_DRIVER = 'local';
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.BLOB_STORE_ID;
delete process.env.VERCEL;

await mkdir('.test-runtime', { recursive: true });
const compiled = await build({
  stdin: { contents: `
    export * from './lib/database';
    export {storage} from './lib/storage';
    export {getOwnerFromCookie,safeReturnPath} from './lib/auth/owner';
    export {createCheckout,quoteCheckout,applyCheckoutSale} from './modules/catalog/checkout';
    export {checkoutDestination} from './modules/catalog/checkout-navigation';
    export {catalogQuote,synchronizeCatalogStock} from './modules/order/catalog-bridge';
    export {registerCustomer,currentCustomer} from './modules/catalog/customers';
    export {listTeam,startTeamSession} from './modules/catalog/team-access';
    export {encrypt,ready,settings} from './modules/order/order-server';
    export {status as legacyShippingStatus} from './modules/shipping/legacy-shipping-server';
    export {GET as publicConfig} from './app/api/config/route';
    export {createManualDraft} from './modules/catalog/catalog-service';
    export {POST as ownerLogin} from './app/api/auth/owner/route';
    export {GET as catalogAdmin} from './app/api/admin/katalog/route';
    export {GET as orderAdmin} from './app/api/admin/order/route';
    export {GET as ongkirAdmin,POST as ongkirPost} from './app/api/ongkir/route';
    export {GET as photosGet} from './app/api/photos/[key]/route';
    export {POST as customerAuth,DELETE as customerLogout} from './app/api/customer/route';
    export {POST as checkoutPost} from './app/api/checkout/route';
    export {POST as shippingPost} from './app/api/shipping/route';
    export {POST as orderPost,PATCH as paymentPatch} from './app/api/order/route';
    export {GET as qrisGet} from './app/api/qris/route';
    export {POST as qrisAdminPost} from './app/api/admin/order/qris/route';
    export {paymentConfig} from './modules/order/payment-config';
    export {POST as proofPost} from './app/api/order/proof/route';
    export {POST as resumeInvoice} from './app/api/order/resume/route';
  `, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
  external: ['@libsql/client', '@vercel/blob', '@hyzyla/pdfium'],
  banner: { js: "import {createRequire as createBundleRequire} from 'node:module';const require=createBundleRequire(import.meta.url);" },
  plugins: [{ name: 'node-next-imports', setup(builder) {
    builder.onResolve({ filter: /^next\/(headers|navigation)$/ }, args => ({ path: args.path + '.js', external: true }));
  } }],
});
await writeFile('.test-runtime/monolith.mjs', compiled.outputFiles[0].contents);
const m = await import(pathToFileURL(path.resolve('.test-runtime/monolith.mjs')));
const d = m.getDatabase(), client = m.getSqlClient();
await migrate(client, new URL('../migrations/', import.meta.url));
const originalFetch = globalThis.fetch;
let providerCalls = 0, forbiddenHttp = 0;
const destination = { id: 90, label: 'TENGAH, PONTIANAK KOTA, PONTIANAK, 78243', province_name: 'KALIMANTAN BARAT', city_name: 'PONTIANAK', district_name: 'PONTIANAK KOTA', subdistrict_name: 'TENGAH', zip_code: '78243' };
const origin = { id: 10, label: 'BALEENDAH, BANDUNG, 40375', province_name: 'JAWA BARAT', city_name: 'BANDUNG', district_name: 'BALEENDAH', subdistrict_name: 'BALEENDAH', zip_code: '40375' };
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.origin === 'https://rajaongkir.komerce.id') {
    providerCalls++;
    assert.equal(init.headers.key, 'SIMULATED_RATE_KEY');
    if (url.pathname.endsWith('domestic-destination')) return Response.json({ meta: { code: 200 }, data: [url.searchParams.get('search') === 'Baleendah' ? origin : destination] });
    const form = new URLSearchParams(init.body);
    assert.equal(form.get('origin'), '10'); assert.equal(form.get('destination'), '90');
    return Response.json({ meta: { code: 200 }, data: [{ code: 'jnt', service: 'EZ', description: 'Regular', cost: 38000 * Math.ceil(Number(form.get('weight')) / 1000), etd: '3–5 hari' }] });
  }
  if (url.origin === 'https://api.telegram.org') {
    if (url.pathname.endsWith('getWebhookInfo')) return Response.json({ ok: true, result: { url: 'https://elite.test/api/telegram/webhook' } });
    if (url.pathname.endsWith('sendMessage') || url.pathname.endsWith('sendDocument')) return Response.json({ ok: true, result: { message_id: 50 } });
    return Response.json({ ok: true, result: true });
  }
  forbiddenHttp++;
  throw new Error('Unexpected HTTP bridge: ' + url.origin);
};
const request = (pathname, payload, cookie = '', extra = {}) => new Request('https://elite.test' + pathname, {
  method: payload === undefined ? 'GET' : 'POST',
  headers: { ...(payload === undefined ? {} : { Origin: 'https://elite.test', 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...extra },
  ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
});
let ownerCookie = '', teamCookie = '', customerCookie = '', checkoutToken = '', checkoutId = '', orderCookie = '', invoiceId = '', groupId = '', productId = '';
const photoKey = crypto.randomUUID();
const png = new Uint8Array(80); png.set([137,80,78,71,13,10,26,10]);
after(async () => {
  globalThis.fetch = originalFetch; client.close();
  if (path.dirname(path.resolve(temporary)) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('elite-monolith-')) throw Error('Unexpected temporary cleanup target');
  await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('the unified migration sequence is repeatable and prepares all three domains', async () => {
  const result = await migrate(client, new URL('../migrations/', import.meta.url));
  assert.equal(result.pending.length, 0); assert.equal(result.total, 28);
  const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map(row => row.name);
  for (const name of ['products','orders','shipping_config','customers','owner_sessions']) assert.ok(tables.includes(name));
});
test('the libSQL adapter rolls back every statement when one batch statement fails', async () => {
  await client.execute('CREATE TABLE adapter_probe(id INTEGER PRIMARY KEY,value TEXT)');
  await assert.rejects(d.batch([d.prepare('INSERT INTO adapter_probe VALUES(1,?)').bind('before failure'),d.prepare('INSERT INTO adapter_probe VALUES(1,?)').bind('duplicate')]));
  assert.equal(await d.prepare('SELECT COUNT(*) AS count FROM adapter_probe').first('count'), 0);
});
test('untrusted hosting headers and customer identity cannot authenticate the owner', async () => {
  const fake = { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@elite.test' };
  assert.equal((await m.catalogAdmin(request('/api/admin/katalog', undefined, '', fake))).status, 401);
  assert.equal((await m.orderAdmin(request('/api/admin/order', undefined, '', fake))).status, 401);
  assert.equal((await m.ongkirAdmin(request('/api/ongkir', undefined, '', fake))).status, 401);
  assert.equal(await m.getOwnerFromCookie('elite_customer=' + 'a'.repeat(64)), null);
});
test('owner login checks password and origin, stores a hashed session, and rejects open redirects', async () => {
  const input = { email: 'owner@elite.test', password: 'SIMULATED_OWNER_PASSWORD_123', next: '//evil.test' };
  assert.equal((await m.ownerLogin(request('/api/auth/owner', input, '', { Origin: 'https://evil.test' }))).status, 403);
  assert.equal((await m.ownerLogin(request('/api/auth/owner', { ...input, password: 'wrong' }))).status, 401);
  const response = await m.ownerLogin(request('/api/auth/owner', input));
  assert.equal(response.status, 200); assert.equal((await response.json()).next, '/admin');
  const cookie = response.headers.get('set-cookie'); assert.match(cookie, /HttpOnly; Secure; SameSite=Strict/);
  ownerCookie = cookie.split(';')[0];
  const stored = await d.prepare('SELECT hash FROM owner_sessions').first(); assert.notEqual(stored.hash, ownerCookie.split('=')[1]);
  assert.equal((await m.getOwnerFromCookie(ownerCookie)).email, 'owner@elite.test');
  assert.equal(m.safeReturnPath('/\\evil.test'), '/admin');
});
test('one owner session opens catalog, order settings, and the shipping calculator', async () => {
  assert.equal((await m.catalogAdmin(request('/api/admin/katalog', undefined, ownerCookie))).status, 200);
  assert.equal((await m.orderAdmin(request('/api/admin/order', undefined, ownerCookie))).status, 200);
  const connected = await m.ongkirPost(request('/api/ongkir', { action:'connect', key:'SIMULATED_RATE_KEY' }, ownerCookie));
  assert.equal(connected.status, 200); assert.equal((await connected.json()).connected, true);
  assert.equal((await m.ongkirAdmin(request('/api/ongkir', undefined, ownerCookie))).status, 200);
});
test('catalog team sessions have no access to payment, private proofs, or calculator settings', async () => {
  const links = await m.listTeam('https://elite.test'), token = links[0].link.split('#')[1];
  const session = await m.startTeamSession(token); teamCookie = 'elite_team=' + session.session;
  assert.equal((await m.catalogAdmin(request('/api/admin/katalog', undefined, teamCookie))).status, 200);
  assert.equal((await m.orderAdmin(request('/api/admin/order', undefined, teamCookie))).status, 401);
  assert.equal((await m.ongkirAdmin(request('/api/ongkir', undefined, teamCookie))).status, 401);
});
test('customer signup persists independently and cannot elevate an owner email to admin', async () => {
  const response = await m.customerAuth(request('/api/customer', { action:'register', name:'PEMBELI SIMULASI', identity:'owner@elite.test', password:'SIMULATED_CUSTOMER_PASSWORD_123', consent:true }));
  assert.equal(response.status, 201); customerCookie = response.headers.get('set-cookie').split(';')[0];
  assert.equal((await m.currentCustomer(customerCookie)).name, 'PEMBELI SIMULASI');
  assert.equal((await m.catalogAdmin(request('/api/admin/katalog', undefined, customerCookie))).status, 401);
  assert.equal(await m.getOwnerFromCookie(customerCookie), null);
});
test('one shared storage serves published photos while private drafts stay protected', async () => {
  await m.storage.put(photoKey, png, { httpMetadata: { contentType:'image/png' } });
  await d.prepare('INSERT INTO photos(key,content_type,size,source,created_at) VALUES(?,?,?,?,?)').bind(photoKey,'image/png',png.length,'simulation',new Date().toISOString()).run();
  const now = new Date().toISOString(); productId = crypto.randomUUID(); groupId = crypto.randomUUID();
  await d.prepare("INSERT INTO products(id,shortcode,instagram_url,name,brand,category,color,price,condition,defects,photo_key,caption,created_at,updated_at,status) VALUES(?,?,'','PRL SIMULASI','PRL','Polo','Navy',300000,'Good','Tidak ada',?,'',?,?,'draft')").bind(productId,'local_'+productId,photoKey,now,now).run();
  await d.prepare("INSERT INTO size_groups(id,product_id,label,fits,qty) VALUES(?,?,'M','[\"M\"]',5)").bind(groupId,productId).run();
  const context = { params:Promise.resolve({key:photoKey}) };
  assert.equal((await m.photosGet(request('/api/photos/'+photoKey),context)).status,404);
  await d.prepare("UPDATE products SET status='published',published_at=? WHERE id=?").bind(now,productId).run();
  const visible = await m.photosGet(request('/api/photos/'+photoKey),context);
  assert.equal(visible.status,200); assert.equal(visible.headers.get('content-type'),'image/png');
  assert.deepEqual(new Uint8Array(await visible.arrayBuffer()),png);
});
test('catalog checkout carries the customer and server prices directly to /order', async () => {
  const response = await m.checkoutPost(request('/api/checkout', { lines:[{productId,groupId,quantity:4}],amount:1 }, customerCookie));
  assert.equal(response.status,201); const checkout = await response.json(); assert.match(checkout.url,/^\/order\?catalog=[a-f0-9]{64}$/);
  const basket=crypto.randomUUID(),target=m.checkoutDestination(checkout.url,process.env.SITE_ORIGIN,basket);
  assert.equal(target.origin,process.env.SITE_ORIGIN); assert.equal(target.pathname,'/order'); assert.equal(target.searchParams.get('basket'),basket);
  checkoutToken = target.searchParams.get('catalog');
  const quoted = await m.catalogQuote(checkoutToken); checkoutId=quoted.id;
  assert.equal(quoted.amount,1200000); assert.equal(quoted.customer.name,'PEMBELI SIMULASI');
  assert.equal(forbiddenHttp,0);
});
test('checkout gets the real provider rate at 2 kg for four catalog units, ignoring forged weight', async () => {
  const search = await m.shippingPost(request('/api/shipping',{action:'search',query:'78243'})); assert.equal(search.status,200);
  const response = await m.shippingPost(request('/api/shipping',{action:'rates',destinationId:90,catalogToken:checkoutToken,quantity:1,grams:100}));
  assert.equal(response.status,200); const quote=(await response.json()).quotes[0];
  assert.equal(quote.grams,2000); assert.equal(quote.amount,76000); globalThis.__monolithQuote=quote;
  assert.ok(providerCalls>=3); assert.equal(forbiddenHttp,0);
});
test('unified order creation uses verified catalog totals and rejects expired or mismatched quotes', async () => {
  const cipher=await m.encrypt('SIMULATED_TELEGRAM_TOKEN');
  await d.prepare("UPDATE settings SET qris_key='qris-simulation',bot_cipher=?,chat_id='12345',webhook_cipher=?,webhook_active=1 WHERE id=1").bind(cipher,await m.encrypt('SIMULATED_WEBHOOK_SECRET')).run();
  const base={name:'PEMBELI SIMULASI',phone:'081234567890',address:'Jl. Jendral Urip No. 24, Tengah',postcode:'78243',itemAmount:1,consent:true,catalogToken:checkoutToken,quoteId:globalThis.__monolithQuote.id};
  const bad=await m.orderPost(request('/api/order',{...base,postcode:'40375'})); assert.equal(bad.status,409);
  const response=await m.orderPost(request('/api/order',base)); assert.equal(response.status,201);
  const order=await response.json(); invoiceId=order.id; orderCookie=response.headers.get('set-cookie').split(';')[0];
  assert.equal(order.quantity,4); assert.equal(order.total,1276000); assert.equal(order.stock_sync_state,'pending');
  assert.equal((await d.prepare('SELECT qty FROM size_groups WHERE id=?').bind(groupId).first()).qty,5);
});
test('payment destinations are deployment-controlled and QRIS bytes are checked in shared storage', async () => {
  process.env.PAYMENT_QRIS_KEY='qris/simulation'; process.env.PAYMENT_QRIS_MIME='image/png'; process.env.PAYMENT_QRIS_MERCHANT='MERCHANT SIMULASI';
  process.env.PAYMENT_QRIS_SHA256=Buffer.from(await crypto.subtle.digest('SHA-256',png)).toString('hex');
  await m.storage.put('qris/simulation',png,{httpMetadata:{contentType:'image/png'}});
  const config=await m.paymentConfig(); assert.equal(config.defaultMethod,'bca_transfer'); assert.equal(config.qris.merchant,'MERCHANT SIMULASI');
  assert.doesNotMatch(JSON.stringify(config),/sha256|PAYMENT_/);
  const image=await m.qrisGet(); assert.equal(image.status,200); assert.deepEqual(new Uint8Array(await image.arrayBuffer()),png);
  const originalKey=(await d.prepare('SELECT qris_key FROM settings').first()).qris_key;
  for(const [cookie,status] of [[ownerCookie,403],[teamCookie,401],['',401]]) {
    const denied=await m.qrisAdminPost(request('/api/admin/order/qris',{merchant:'ATTACKER'},cookie)); assert.equal(denied.status,status);
  }
  assert.equal((await d.prepare('SELECT qris_key FROM settings').first()).qris_key,originalKey);
  const replaced=png.slice();replaced[79]^=1;await m.storage.put('qris/simulation',replaced,{httpMetadata:{contentType:'image/png'}});
  assert.equal((await m.qrisGet()).status,503);
  await m.storage.put('qris/simulation',png,{httpMetadata:{contentType:'image/png'}});
  const fingerprint=process.env.PAYMENT_QRIS_SHA256;delete process.env.PAYMENT_QRIS_SHA256;
  assert.equal((await m.paymentConfig()).qris,null);assert.equal((await m.qrisGet()).status,404);process.env.PAYMENT_QRIS_SHA256=fingerprint;
});

test('switching payment methods cannot change destination, total, or verification state', async () => {
  const patch=(data,origin='https://elite.test')=>m.paymentPatch(new Request('https://elite.test/api/order',{method:'PATCH',headers:{Origin:origin,Cookie:orderCookie,'Content-Type':'application/json'},body:JSON.stringify(data)}));
  assert.equal((await patch({paymentMethod:'qris_dana'},'https://evil.test')).status,403);
  for(const extra of [{total:1},{accountNumber:'0000000000'},{payment_state:'payment_confirmed'},{qrisUrl:'https://evil.test'}])assert.equal((await patch({paymentMethod:'qris_dana',...extra})).status,400);
  for(const method of ['qris_dana','bca_transfer']){const response=await patch({paymentMethod:method});assert.equal(response.status,200);const changed=await response.json();assert.equal(changed.payment_method,method);assert.equal(changed.total,1276000);assert.equal(changed.payment_state,'awaiting_proof');assert.equal(changed.confirmed_at,null);}
});

test('proof upload submits the order without confirming funds or booking a shipment', async () => {
  const cipher=await m.encrypt('SIMULATED_TELEGRAM_TOKEN');
  await d.prepare("UPDATE settings SET qris_key='qris-simulation',bot_cipher=?,chat_id='12345',webhook_cipher=?,webhook_active=1 WHERE id=1").bind(cipher,await m.encrypt('SIMULATED_WEBHOOK_SECRET')).run();
  const form=new FormData(); form.set('paymentMethod','bca_transfer'); form.set('file',new Blob([png],{type:'image/png'}),'proof.png');
  const response=await m.proofPost(new Request('https://elite.test/api/order/proof',{method:'POST',headers:{Origin:'https://elite.test',Cookie:orderCookie},body:form}));
  assert.equal(response.status,200); assert.equal((await response.json()).status,'submitted');
  assert.equal((await d.prepare('SELECT payment_state FROM orders WHERE id=?').bind(invoiceId).first()).payment_state,'proof_received');
  assert.equal(await d.prepare('SELECT COUNT(*) AS count FROM shipments').first('count'),0);
});
test('submitted payment methods are locked while owner confirmation remains required', async () => {
  const response=await m.paymentPatch(new Request('https://elite.test/api/order',{method:'PATCH',headers:{Origin:'https://elite.test',Cookie:orderCookie,'Content-Type':'application/json'},body:JSON.stringify({paymentMethod:'qris_dana'})}));assert.equal(response.status,409);
  const row=await d.prepare('SELECT payment_state,payment_method,confirmed_at FROM orders WHERE id=?').bind(invoiceId).first();assert.equal(row.payment_state,'proof_received');assert.equal(row.payment_method,'bca_transfer');assert.equal(row.confirmed_at,null);
});

test('stock is reduced atomically once after confirmation, including repeated concurrent retries', async () => {
  await d.prepare("UPDATE orders SET payment_state='payment_confirmed',confirmed_by='SIMULATED_OWNER' WHERE id=?").bind(invoiceId).run();
  await Promise.all([m.synchronizeCatalogStock(invoiceId),m.synchronizeCatalogStock(invoiceId)]);
  assert.equal((await d.prepare('SELECT qty FROM size_groups WHERE id=?').bind(groupId).first()).qty,1);
  assert.equal(await d.prepare('SELECT COUNT(*) AS count FROM catalog_sales WHERE checkout_id=?').bind(checkoutId).first('count'),1);
  assert.equal((await d.prepare('SELECT stock_sync_state FROM orders WHERE id=?').bind(invoiceId).first()).stock_sync_state,'applied');
  assert.equal(forbiddenHttp,0);
});
test('shared owner authentication revokes sessions on password rotation and logout', async () => {
  const previous=process.env.ADMIN_PASSWORD_HASH;
  process.env.ADMIN_PASSWORD_HASH=await hashPassword('SIMULATED_NEW_OWNER_PASSWORD_123');
  assert.equal(await m.getOwnerFromCookie(ownerCookie),null);
  process.env.ADMIN_PASSWORD_HASH=previous;
  const response=await m.ownerLogin(request('/api/auth/owner',{action:'logout'},ownerCookie)); assert.equal(response.status,200);
  assert.equal(await m.getOwnerFromCookie(ownerCookie),null);
  assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
});

test('migrated Telegram ciphertext cannot enable payments under a different server secret', async () => {
  const previous = process.env.CONFIG_SECRET, s = await m.settings(), calls = providerCalls;
  assert.equal(await m.ready(s), true);
  assert.equal(await m.ready({...s,webhook_active:0}),false);
  assert.equal(await m.ready({...s,webhook_cipher:'malformed'}),false);
  try {
    process.env.CONFIG_SECRET = 'e'.repeat(64);
    assert.equal(await m.ready(s), false);
    assert.equal(await m.ready({ ...s, bot_cipher: 'malformed' }), false);
    const response = await m.publicConfig(), configuration = await response.json();
    assert.equal(response.status, 200); assert.equal(configuration.ready, false);
    assert.equal(configuration.payment.bca.accountNumber, '1234567890');
    assert.equal(providerCalls, calls);
    assert.equal((await m.settings()).bot_cipher, s.bot_cipher);
  } finally { process.env.CONFIG_SECRET = previous; }
  assert.equal(await m.ready(s), true);
});

test('migrated RajaOngkir ciphertext reports reconnection without changing the saved origin or key', async () => {
  const previous = process.env.RAJAONGKIR_CONFIG_SECRET;
  const row = await d.prepare('SELECT * FROM shipping_config WHERE id=1').first(), calls = providerCalls;
  assert.equal((await m.legacyShippingStatus()).connected, true);
  try {
    process.env.RAJAONGKIR_CONFIG_SECRET = 'f'.repeat(64);
    const state = await m.legacyShippingStatus();
    assert.equal(state.connected, false); assert.equal(state.needsReconnect, true);
    assert.equal(state.origin.id, 10);
    assert.equal(providerCalls, calls);
    assert.deepEqual(await d.prepare('SELECT * FROM shipping_config WHERE id=1').first(), row);
    assert.doesNotMatch(JSON.stringify(state), /encrypted_key|SIMULATED_RATE_KEY/);
  } finally { process.env.RAJAONGKIR_CONFIG_SECRET = previous; }
  assert.equal((await m.legacyShippingStatus()).connected, true);
});

test('migrated team links remain manageable without invalidating existing access', async () => {
  const previous = process.env.TEAM_ACCESS_SECRET, before = await m.listTeam('https://elite.test');
  const token = before[0].link.split('#')[1];
  const rows = (await d.prepare('SELECT * FROM team_access ORDER BY slot').all()).results;
  try {
    process.env.TEAM_ACCESS_SECRET = 'f'.repeat(64);
    const members = await m.listTeam('https://elite.test');
    assert.equal(members.length, 3); assert.ok(members.every(member => member.link === null));
    assert.deepEqual((await d.prepare('SELECT * FROM team_access ORDER BY slot').all()).results, rows);
    assert.ok((await m.startTeamSession(token)).session);
  } finally { process.env.TEAM_ACCESS_SECRET = previous; }
  assert.deepEqual(await m.listTeam('https://elite.test'), before);
});

test('invoice migration requires the original bearer cookie and preserves payment and stock', async () => {
  const token = orderCookie.split(';')[0].slice('elite_order='.length);
  const before = await d.prepare('SELECT * FROM orders WHERE id=?').bind(invoiceId).first();
  const stock = (await d.prepare('SELECT * FROM size_groups').all()).results;
  const resume = (payload, origin = 'https://elite.test') => m.resumeInvoice(new Request('https://elite.test/api/order/resume', {method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(payload)}));
  assert.equal((await resume({token}, 'https://evil.test')).status, 403);
  for (const input of [{id:invoiceId},{token:'invalid'},{token, id:invoiceId}]) assert.equal((await resume(input)).status, 400);
  assert.equal((await resume({token:'0'.repeat(64)})).status, 404);
  const response = await resume({token});
  assert.equal(response.status,200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
  assert.deepEqual(await response.json(),{ok:true});
  assert.deepEqual(await d.prepare('SELECT * FROM orders WHERE id=?').bind(invoiceId).first(), before);
  assert.deepEqual((await d.prepare('SELECT * FROM size_groups').all()).results, stock);
  await d.prepare('UPDATE orders SET created_at=? WHERE id=?').bind(Date.now()-8*86400000,invoiceId).run();
  try { assert.equal((await resume({token})).status,404); }
  finally {await d.prepare('UPDATE orders SET created_at=? WHERE id=?').bind(before.created_at,invoiceId).run();}
});
