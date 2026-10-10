import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,mkdir,writeFile,rm,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createClient} from '@libsql/client';
import {migrate} from '../scripts/migration-core.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'elite-promotions-'));
Object.assign(process.env,{TURSO_DATABASE_URL:'file:'+path.join(dir,'test.db'),SITE_ORIGIN:'https://elite.test',CONFIG_SECRET:'a'.repeat(64),AUTH_SECRET:'b'.repeat(64),PAYMENT_BCA_ACCOUNT_NUMBER:'1234567890',PAYMENT_BCA_ACCOUNT_HOLDER:'SIMULATED OWNER',STORAGE_DRIVER:'local',LOCAL_STORAGE_PATH:path.join(dir,'files')});
delete process.env.VERCEL;delete process.env.TURSO_AUTH_TOKEN;delete process.env.BLOB_READ_WRITE_TOKEN;
await mkdir('.test-runtime',{recursive:true});
const compiled=await build({stdin:{contents:`
 export * from './lib/database';export * from './modules/order/first-purchase';export * from './modules/order/first-purchase-server';
 export * from './modules/catalog/product-schedule';export {registerCustomer,currentCustomer} from './modules/catalog/customers';
 export {readProduct,readProducts} from './modules/catalog/server';export {saveProduct} from './modules/catalog/catalog-service';
 export {createCheckout,quoteCheckout} from './modules/catalog/checkout';export {cartAvailability,cartSummary} from './modules/catalog/cart-availability';
 export {encrypt,hash,myOrder} from './modules/order/order-server';export {invoiceText} from './modules/order/order-types';
 export {confirmPayment} from './modules/order/fulfilment';export {POST as orderPost,DELETE as orderDelete} from './app/api/order/route';
 export {GET as catalogQuoteGet} from './app/api/order/catalog/route';export {POST as resumePost} from './app/api/order/first-purchase/route';
 export {GET as customerGet} from './app/api/customer/route';export {POST as proofPost} from './app/api/order/proof/route';
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,external:['@libsql/client','@vercel/blob','@hyzyla/pdfium'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'next',setup(b){b.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path+'.js',external:true}))}}]});
await writeFile('.test-runtime/promotions.mjs',compiled.outputFiles[0].contents);
const m=await import(pathToFileURL(path.resolve('.test-runtime/promotions.mjs'))),client=m.getSqlClient();
await migrate(client,new URL('../migrations/',import.meta.url));
const originalFetch=globalThis.fetch;
let messages=[];
globalThis.fetch=async(input,init={})=>{const url=new URL(typeof input==='string'?input:input.url);assert.equal(url.hostname,'api.telegram.org');if(typeof init.body==='string')messages.push(JSON.parse(init.body));return Response.json({ok:true,result:{message_id:50}});};
const request=(route,body,cookie='')=>new Request('https://elite.test'+route,{method:body===undefined?'GET':'POST',headers:{Origin:'https://elite.test','Content-Type':'application/json',Cookie:cookie},...(body===undefined?{}:{body:JSON.stringify(body)})});
const payload={name:'Simulated Buyer',phone:'081234567890',address:'Jalan Pengujian Nomor 12 RT 01',postcode:'78243',item:'Simulated vintage',quantity:1,itemAmount:185000,quoteId:'f'.repeat(64),consent:true};
let buyer,buyerCookie,product,selection;
beforeEach(async()=>{
 for(const table of ['first_purchase_discounts','shipments','orders','catalog_sales','catalog_checkouts','stock_history','size_groups','products','customer_sessions','customers','photos','limits','request_limits','shipping_quotes','settings'])await client.execute('DELETE FROM '+table);
 messages=[];
 await client.execute({sql:'INSERT INTO settings(id,bot_cipher,chat_id,webhook_cipher,webhook_active) VALUES(1,?,?,?,1)',args:[await m.encrypt('SIMULATED_BOT'),'123456',await m.encrypt('SIMULATED_HOOK')]});
 const q={id:'f'.repeat(64),amount:38000,grams:1000,service:'EZ',destination:{id:90,label:'Simulated destination',postalCode:'78243'},checkedAt:Date.now(),expiresAt:Date.now()+3600000};
 await client.execute({sql:'INSERT INTO shipping_quotes VALUES(?,?,?)',args:[q.id,JSON.stringify(q),q.expiresAt]});
 const registered=await m.registerCustomer({name:'Simulated Buyer',identity:'buyer@example.test',password:'SIMULATED_PASSWORD_123',consent:true},null);
 buyerCookie='elite_customer='+registered.token;buyer=await m.currentCustomer(buyerCookie);
 const now=new Date().toISOString(),photo='10000000-0000-4000-8000-000000000000';
 await client.execute({sql:'INSERT INTO photos VALUES(?,?,?,?,?)',args:[photo,'image/png',80,'manual',now]});
 await client.execute({sql:"INSERT INTO products(id,shortcode,instagram_url,name,brand,category,color,price,condition,defects,photo_key,created_at,updated_at,published_at,status,reviewed) VALUES('product','product','','Simulated Polo','Beanpole','Polo','Black',185000,'Very good','Tidak ada',?,?,?,?,'published',1)",args:[photo,now,now,now]});
 await client.execute("INSERT INTO size_groups(id,product_id,fits,qty,length_cm,width_cm) VALUES('group','product','[\"M\"]',10,60,50)");
 product=await m.readProduct('product');selection={lines:[{productId:'product',groupId:'group',quantity:1}]};
});
after(async()=>{globalThis.fetch=originalFetch;client.close();assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elite-promotions-'));await rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:200});});
async function create(cookie=buyerCookie,extra={}){return m.orderPost(request('/api/order',{...payload,...extra},cookie));}
async function discounted(){const response=await create();assert.equal(response.status,201,JSON.stringify(await response.clone().json()));return {order:await response.json(),cookie:buyerCookie+'; '+response.headers.get('set-cookie').split(';')[0]};}
test('5% rounds down to whole rupiah and excludes the full shipping price',async()=>{
 assert.equal(m.firstPurchaseDiscount(185000),9250);assert.equal(m.firstPurchaseDiscount(1001),50);assert.equal(m.firstPurchaseDiscount(NaN),0);
 const {order}=await discounted();assert.equal(order.item_subtotal,185000);assert.equal(order.discount_amount,9250);assert.equal(order.item_amount,175750);assert.equal(order.shipping_amount,38000);assert.equal(order.total,213750);assert.ok(!('customer_id' in order));
});
test('guest checkout remains optional and pays the original total',async()=>{const reply=await create('');assert.equal(reply.status,201);const o=await reply.json();assert.equal(o.discount_amount,0);assert.equal(o.total,223000);});
test('catalog prices and account eligibility come from the server, with discount visible in quote',async()=>{
 const checkout=await m.createCheckout(selection,buyer.id),token=new URL(checkout.url,'https://elite.test').searchParams.get('catalog');
 const q=await (await m.catalogQuoteGet(request('/api/order/catalog?token='+token,undefined,buyerCookie))).json();assert.equal(q.amount,185000);assert.equal(q.discountAmount,9250);
 const reply=await create(buyerCookie,{catalogToken:token,itemAmount:1000});assert.equal(reply.status,201);const o=await reply.json();assert.equal(o.item_subtotal,185000);assert.equal(o.discount_amount,9250);
});
test('forged discount or customer fields and foreign origins are rejected',async()=>{
 for(const extra of [{discount_amount:185000},{customer_id:buyer.id},{discount:100},{item_subtotal:1}])assert.equal((await create('',extra)).status,400);
 const r=request('/api/order',payload,buyerCookie);r.headers.set('origin','https://evil.test');assert.equal((await m.orderPost(r)).status,403);assert.equal((await client.execute('SELECT * FROM orders')).rows.length,0);
});
test('two parallel checkouts can reserve only one discounted invoice',async()=>{
 const replies=await Promise.all([create(),create()]);assert.deepEqual(replies.map(r=>r.status).sort(),[201,409]);assert.equal((await client.execute('SELECT * FROM first_purchase_discounts')).rows.length,1);assert.equal((await client.execute('SELECT * FROM orders')).rows.length,1);
});
test('editing the same unpaid invoice recalculates once and requires its account',async()=>{
 const {order,cookie}=await discounted();const updated=await create(cookie,{itemAmount:200000});assert.equal(updated.status,200);const o=await updated.json();assert.equal(o.id,order.id);assert.equal(o.discount_amount,10000);assert.equal(o.total,228000);
 assert.equal((await create(cookie.split('; ')[1],{itemAmount:200000})).status,409);assert.equal((await client.execute('SELECT * FROM first_purchase_discounts')).rows.length,1);
});
test('only owner confirmation consumes the benefit, and confirmation is idempotent',async()=>{
 const {order,cookie}=await discounted();assert.equal((await m.purchasePromotion(buyerCookie)).state,'reserved');
 const form=new FormData(),png=new Uint8Array(80);png.set([137,80,78,71,13,10,26,10]);form.set('file',new File([png],'proof.png',{type:'image/png'}));form.set('paymentMethod','bca_transfer');
 const proof=await m.proofPost(new Request('https://elite.test/api/order/proof',{method:'POST',headers:{Origin:'https://elite.test',Cookie:cookie},body:form}));assert.equal(proof.status,200);assert.equal((await m.purchasePromotion(buyerCookie)).state,'reserved');
 assert.ok(messages.some(message=>message.text?.includes('ELITE Reward · Pembelian pertama 5%')));
 await assert.rejects(m.confirmPayment(order.id,'other-owner',50));assert.equal((await client.execute('SELECT redeemed_at FROM first_purchase_discounts')).rows[0].redeemed_at,null);
 await m.confirmPayment(order.id,'123456',50);await m.confirmPayment(order.id,'123456',50);assert.equal((await m.purchasePromotion(buyerCookie)).state,'redeemed');
 const next=await create();assert.equal(next.status,201);assert.equal((await next.json()).discount_amount,0);
});
test('account recovery requires the same authenticated customer',async()=>{
 const {order}=await discounted();assert.equal((await m.resumePost(request('/api/order/first-purchase',{},''))).status,401);
 const other=await m.registerCustomer({name:'Other Buyer',identity:'other@example.test',password:'SIMULATED_PASSWORD_123',consent:true},null);
 assert.equal((await m.resumePost(request('/api/order/first-purchase',{},'elite_customer='+other.token))).status,404);
 const resumed=await m.resumePost(request('/api/order/first-purchase',{},buyerCookie));assert.equal(resumed.status,200);assert.equal((await resumed.json()).id,order.id);
});
test('cancelling an unpaid invoice releases the discount and invalidates the old order session',async()=>{
 const {cookie}=await discounted();const req=new Request('https://elite.test/api/order',{method:'DELETE',headers:{Origin:'https://elite.test',Cookie:cookie}});assert.equal((await m.orderDelete(req)).status,200);
 assert.equal((await m.purchasePromotion(buyerCookie)).state,'available');await assert.rejects(m.myOrder(request('/api/order',undefined,cookie)));assert.equal((await create()).status,201);
});
test('expired unpaid drafts release their claim, submitted proof never does',async()=>{
 const {order}=await discounted();await client.execute({sql:'UPDATE orders SET created_at=? WHERE id=?',args:[Date.now()-8*86400000,order.id]});assert.equal((await m.purchasePromotion(buyerCookie)).state,'available');
 const again=await discounted();await client.execute({sql:"UPDATE orders SET created_at=?,status='submitted',proof_key='proof' WHERE id=?",args:[Date.now()-8*86400000,again.order.id]});assert.equal((await m.purchasePromotion(buyerCookie)).state,'reserved');
});
test('existing customers with confirmed purchases are ineligible',async()=>{const {order}=await discounted();await client.execute('DELETE FROM first_purchase_discounts');await client.execute({sql:"UPDATE orders SET confirmed_at=?,payment_state='payment_confirmed',discount_amount=0 WHERE id=?",args:[Date.now(),order.id]});assert.equal((await m.purchasePromotion(buyerCookie)).state,'redeemed');const next=await create();assert.equal((await next.json()).discount_amount,0);});
test('scheduled products remain public with details and stock, but cannot checkout early',async()=>{
 product=await m.saveProduct({...product,orderableAt:new Date(Date.now()+86400000).toISOString(),reviewed:true},'simulated-owner');assert.equal((await m.readProducts()).length,1);assert.equal(product.groups[0].qty,10);
 await assert.rejects(m.createCheckout(selection),/Pemesanan dibuka/);const rows=m.cartAvailability([{...selection.lines[0],name:'Polo',label:'M'}],[product],true);assert.equal(rows[0].available,true);assert.equal(rows[0].scheduled,true);assert.equal(m.cartSummary(rows).canCheckout,false);
});
test('rescheduling invalidates an old checkout token and prevents a forged time bypass',async()=>{
 const checkout=await m.createCheckout(selection),token=new URL(checkout.url,'https://elite.test').searchParams.get('catalog');await m.saveProduct({...product,orderableAt:new Date(Date.now()+86400000).toISOString(),reviewed:true},'owner');
 await assert.rejects(m.quoteCheckout(token),/Pemesanan dibuka/);assert.equal((await create('',{catalogToken:token})).status,409);
 const lines=[{...selection.lines[0],unitPrice:185000}];await assert.rejects(m.persistPurchase(request('/api/order',payload),null, 'forged',185000,lines,()=>({sql:'SELECT 1',args:[]})),/Pemesanan dibuka/);
});
test('WIB scheduling handles exact opening boundary, midnight, invalid dates and clearing',async()=>{
 const start=m.scheduleFromInput('2026-10-11T00:15');assert.equal(start,'2026-10-10T17:15:00.000Z');assert.equal(m.scheduleInput(start),'2026-10-11T00:15');assert.match(m.scheduleLabel(start),/11 Okt 2026.*00[.:]15 WIB/);
 assert.equal(m.orderingLocked({orderableAt:start},Date.parse(start)-1),true);assert.equal(m.orderingLocked({orderableAt:start},Date.parse(start)),false);
 for(const invalid of ['2026-02-30T10:00:00Z','tomorrow',42,'2026-01-01T00:00:00+07:00'])assert.throws(()=>m.normalizeSchedule(invalid));
 await assert.rejects(m.saveProduct({...product,orderableAt:'tomorrow',reviewed:true},'owner'),/valid/);
 product=await m.saveProduct({...product,orderableAt:new Date(Date.now()+100000).toISOString(),reviewed:true},'owner');const {orderableAt,...oldClient}=product;product=await m.saveProduct({...oldClient,reviewed:true},'owner');assert.equal(product.orderableAt,orderableAt);
 product=await m.saveProduct({...product,orderableAt:null,reviewed:true},'owner');assert.equal(product.orderableAt,null);assert.ok((await m.createCheckout(selection)).url);
});
test('migration links historical account purchases without altering their amounts',async()=>{
 const previous=createClient({url:'file:'+path.join(dir,'history.db')});try{
  for(const name of (await readdir('migrations')).filter(n=>n.endsWith('.sql')&&!n.startsWith('release_')).sort())await previous.executeMultiple(await readFile('migrations/'+name,'utf8'));
  await previous.execute("INSERT INTO customers VALUES('historical','Buyer','historic@example.test',NULL,NULL,NULL,'hash',0)");
  await previous.execute("INSERT INTO catalog_checkouts VALUES('checkout','token','[]',200000,100,0,'historical')");
  await previous.execute("INSERT INTO orders(id,session_hash,created_at,name,phone,address,postcode,item,total,item_amount,catalog_checkout_id,confirmed_at) VALUES('historic','hash',0,'Buyer','08123456789','Address','78243','Polo',238000,200000,'checkout',1)");
  await previous.executeMultiple(await readFile('migrations/release_0000_promotions_schedules.sql','utf8'));const row=(await previous.execute('SELECT * FROM orders')).rows[0];assert.equal(row.customer_id,'historical');assert.equal(row.total,238000);assert.equal(row.item_amount,200000);assert.equal(row.discount_amount,0);
 }finally{previous.close();}
});
