import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {migrate} from '../scripts/migration-core.mjs';

Object.assign(process.env,{TURSO_DATABASE_URL:'file::memory:',TURSO_AUTH_TOKEN:'',AUTH_SECRET:'a'.repeat(64),CONFIG_SECRET:'b'.repeat(64),SITE_ORIGIN:'https://elite.test',BLOB_READ_WRITE_TOKEN:'',BLOB_STORE_ID:''});delete process.env.VERCEL;
await mkdir('.test-runtime/tests',{recursive:true});const file=path.resolve('.test-runtime/tests/customer-orders.mjs');
await build({stdin:{contents:`export {getSqlClient} from './lib/database';export {hash,myOrder} from './modules/order/order-server';export {GET as orders} from './app/api/customer/orders/route';export {POST as resume} from './app/api/customer/orders/resume/route';export {GET as tracking,POST as lookup} from './app/api/order/tracking/route';export {customerOrderRow} from './modules/order/customer-orders';export {CustomerOrderCard} from './components/customer-order-card';export {resumeMemberInvoice} from './modules/order/checkout-session';export {createCheckout} from './modules/catalog/checkout';`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',outfile:file,banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'next',setup(b){b.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path+'.js',external:true}))}}]});
const m=await import(pathToFileURL(file)),client=m.getSqlClient();await migrate(client,new URL('../migrations/',import.meta.url));
const id='EV-261020-ABCDEF01',other='EV-261020-ABCDEF02',guest='EV-261020-ABCDEF03',aCookie='elite_customer='+'1'.repeat(64),bCookie='elite_customer='+'2'.repeat(64);
const req=(url,cookie='',body,origin='https://elite.test')=>new Request('https://elite.test'+url,{method:body===undefined?'GET':'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function row(orderId=id){return (await client.execute({sql:'SELECT * FROM orders WHERE id=?',args:[orderId]})).rows[0]}
async function seed(orderId=id,customer='a',age=0){await client.execute({sql:`INSERT INTO orders(id,session_hash,created_at,name,phone,address,postcode,item,total,item_amount,status,customer_id) VALUES(?,?,?,'SIMULATED','081234567890','SIMULATED ADDRESS','40375','Polo',175000,175000,'awaiting_proof',?)`,args:[orderId,await m.hash('old-session-'+orderId),Date.now()-age,customer]})}
async function proof(orderId=id){await client.execute({sql:"UPDATE orders SET proof_key='proof/SIMULATED',proof_mime='image/png',status='submitted',payment_state='proof_received' WHERE id=?",args:[orderId]})}
beforeEach(async()=>{
 for(const table of ['loyalty_stamp_history','loyalty_rewards','loyalty_cycles','loyalty_order_credits','purchase_voucher_claims','first_purchase_discounts','reserve_payments','reserve_items','reserve_audit','tracking_links','shipment_tracking','shipments','orders','catalog_sales','stock_history','catalog_checkouts','size_groups','products','customer_sessions','customers','limits'])await client.execute('DELETE FROM '+table);
 for(const [customer,token] of [['a','1'.repeat(64)],['b','2'.repeat(64)]]){await client.execute({sql:"INSERT INTO customers(id,name,identity,password_hash,created_at) VALUES(?,?,?,'SIMULATED',?)",args:[customer,customer,customer+'@elite.test',Date.now()]});await client.execute({sql:'INSERT INTO customer_sessions(hash,customer_id,created_at,expires_at) VALUES(?,?,?,?)',args:[await m.hash(token),customer,Date.now(),Date.now()+86400000]})}
 await seed();
});
after(async()=>{client.close();await rm(file,{force:true})});

test('history includes unpaid invoices, reads stored resi, and excludes foreign and guest purchases',async()=>{
 await seed(other,'b');await seed(guest,null);const pending=await (await m.orders(req('/api/customer/orders',aCookie))).json();assert.equal(pending.orders.length,1);assert.equal(pending.orders[0].label,'Menunggu pembayaran');assert.equal(pending.orders[0].action,'payment');
 await proof();await client.execute({sql:"UPDATE orders SET payment_state='payment_confirmed',confirmed_at=?,preparing_at=?,shipped_at=?,courier_name='J&T Regular',tracking_number='JP12345678' WHERE id=?",args:[Date.now(),Date.now(),Date.now(),id]});
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('History must not call a courier')};try{const response=await m.orders(req('/api/customer/orders',aCookie)),data=await response.json();assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(data.orders.length,1);const o=data.orders[0];assert.equal(o.id,id);assert.equal(o.action,'tracking');assert.equal(o.trackingNumber,'JP12345678');assert.equal(o.courier,'J&T Regular');for(const key of ['phone','address','session_hash','proof_key','catalog_token','customer_id'])assert.ok(!(key in o));}finally{globalThis.fetch=original}
 assert.equal((await m.orders(req('/api/customer/orders'))).status,401);
});

test('history pagination includes all equal-timestamp invoices without mixing accounts',async()=>{
 for(let i=2;i<=25;i++)await seed('EV-261020-'+i.toString(16).toUpperCase().padStart(8,'0'));await seed(other,'b');await client.execute('UPDATE orders SET created_at='+(Date.now()-1000));
 let cursor='',ids=[];do{const response=await m.orders(req('/api/customer/orders'+(cursor?'?before='+encodeURIComponent(cursor):''),aCookie));assert.equal(response.status,200);const value=await response.json();ids.push(...value.orders.map(o=>o.id));cursor=value.nextBefore}while(cursor);
 assert.equal(ids.length,25);assert.equal(new Set(ids).size,25);assert.ok(!ids.includes(other));assert.equal((await m.orders(req('/api/customer/orders?before=bad',aCookie))).status,400);
});

test('resuming payment restores only the owned existing invoice and preserves server totals and data',async()=>{
 const before=await row(),response=await m.resume(req('/api/customer/orders/resume',aCookie,{invoice:id}));assert.equal(response.status,200);const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict; Max-Age=604800/);const after=await row();assert.notEqual(after.session_hash,before.session_hash);delete before.session_hash;delete after.session_hash;assert.deepEqual(after,before);
 const reopened=await m.myOrder(req('/api/order',cookie.split(';')[0]));assert.equal(reopened.id,id);assert.equal(reopened.total,175000);assert.equal((await response.json()).id,id);assert.equal((await client.execute('SELECT COUNT(*) n FROM orders')).rows[0].n,1);
});

test('resume rejects anonymous, foreign-account, guest, CSRF and price tampering requests without mutation',async()=>{
 await seed(guest,null);const before=await row();assert.equal((await m.resume(req('/api/customer/orders/resume','',{invoice:id}))).status,401);assert.equal((await m.resume(req('/api/customer/orders/resume',bCookie,{invoice:id}))).status,409);assert.equal((await m.resume(req('/api/customer/orders/resume',aCookie,{invoice:guest}))).status,409);assert.equal((await m.resume(req('/api/customer/orders/resume',aCookie,{invoice:id},'https://outside.test'))).status,403);assert.equal((await m.resume(req('/api/customer/orders/resume',aCookie,{invoice:id,total:1}))).status,400);assert.deepEqual(await row(),before);
});

test('proof-submitted, cancelled, expired and Reserve invoices cannot use normal payment resume',async()=>{
 await proof();assert.equal((await m.resume(req('/api/customer/orders/resume',aCookie,{invoice:id}))).status,409);
 await seed(other,'a',8*86400000);assert.equal((await m.resume(req('/api/customer/orders/resume',aCookie,{invoice:other}))).status,409);let list=await (await m.orders(req('/api/customer/orders',aCookie))).json();assert.equal(list.orders.find(o=>o.id===other).action,null);
 await client.execute({sql:"UPDATE orders SET status='cancelled' WHERE id=?",args:[other]});assert.equal((await m.resume(req('/api/customer/orders/resume',aCookie,{invoice:other}))).status,409);
 await seed(guest);await client.execute({sql:"UPDATE orders SET order_type='reserve',reservation_status='AWAITING_DEPOSIT' WHERE id=?",args:[guest]});assert.equal((await m.resume(req('/api/customer/orders/resume',aCookie,{invoice:guest}))).status,409);
});

test('account tracking and guest invoice-plus-phone lookup survive leaving checkout; invoice alone stays private',async()=>{
 await proof();await client.execute({sql:"UPDATE orders SET created_at=?,payment_state='payment_confirmed',shipped_at=?,tracking_number='JP12345678',courier_name='J&T Regular' WHERE id=?",args:[Date.now()-10*86400000,Date.now(),id]});
 const member=await m.tracking(req('/api/order/tracking?invoice='+id,aCookie));assert.equal(member.status,200);assert.equal((await member.json()).awb,'JP12345678');assert.equal((await m.tracking(req('/api/order/tracking?invoice='+id,bCookie))).status,404);assert.equal((await m.tracking(req('/api/order/tracking?invoice='+id))).status,404);
 const bad=await m.lookup(req('/api/order/tracking','',{invoice:id,phone:'081234567899'}));assert.equal(bad.status,404);
 const response=await m.lookup(req('/api/order/tracking','',{invoice:id,phone:'+62 812-3456-7890'}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.awb,'JP12345678');const access=data.accessUrl.split('#')[1];assert.equal((await m.tracking(new Request('https://elite.test/api/order/tracking',{headers:{Authorization:'Bearer '+access}}))).status,200);
});

test('customer cards link to the right payment/tracking route and show manual resi safely',async()=>{
 let o=m.customerOrderRow(await row(),null),html=renderToStaticMarkup(createElement(m.CustomerOrderCard,{order:o}));assert.match(html,/Lanjutkan pembayaran/);assert.ok(html.includes('/order?invoice='+id));assert.ok(!html.includes('Nomor resi'));
 await proof();await client.execute({sql:"UPDATE orders SET payment_state='payment_confirmed',shipped_at=?,tracking_number='JP12345678',courier_name='J&T Regular',item='<script>SIMULATED</script>' WHERE id=?",args:[Date.now(),id]});o=m.customerOrderRow(await row(),null);html=renderToStaticMarkup(createElement(m.CustomerOrderCard,{order:o}));assert.ok(html.includes('/lacak?invoice='+id));assert.match(html,/Salin resi/);assert.match(html,/JP12345678/);assert.ok(!html.includes('<script>SIMULATED</script>'));
 const reservation={status:'RESERVED',totalPaid:50000,remaining:125000,deadline:Date.now()+86400000};html=renderToStaticMarkup(createElement(m.CustomerOrderCard,{order:m.customerOrderRow(await row(),reservation)}));assert.match(html,/Lunasi pesanan/);assert.ok(html.includes('/order?reserveInvoice='+id));
});

test('checkout member recovery uses the authenticated JSON endpoint accepted by the server',async()=>{const order=await m.resumeMemberInvoice(id,async(url,init)=>{const response=await m.resume(new Request('https://elite.test'+url,{...init,headers:{...init.headers,Cookie:aCookie,Origin:'https://elite.test'}}));assert.equal(response.status,200);return response.json()});assert.equal(order.id,id);assert.equal(order.total,175000)});

test('resume rechecks catalog stock and price before accepting payment again',async()=>{await client.execute("INSERT INTO products(id,shortcode,instagram_url,name,price,reviewed,status,created_at,updated_at) VALUES('p','SIMULATED','','Polo',175000,1,'published','2026-10-20','2026-10-20')");await client.execute("INSERT INTO size_groups(id,product_id,label,fits,qty) VALUES('g','p','M','[\"M\"]',1)");const checkout=await m.createCheckout({lines:[{productId:'p',groupId:'g',quantity:1}]},'a'),token=new URL(checkout.url,'https://elite.test').searchParams.get('catalog'),c=(await client.execute('SELECT id FROM catalog_checkouts')).rows[0];await client.execute({sql:'UPDATE orders SET catalog_checkout_id=?,catalog_token=? WHERE id=?',args:[c.id,token,id]});const before=await row();await client.execute("UPDATE size_groups SET qty=0 WHERE id='g'");assert.equal((await m.resume(req('/api/customer/orders/resume',aCookie,{invoice:id}))).status,409);assert.equal((await row()).session_hash,before.session_hash);await client.execute("UPDATE size_groups SET qty=1 WHERE id='g'");await client.execute("UPDATE products SET price=200000 WHERE id='p'");assert.equal((await m.resume(req('/api/customer/orders/resume',aCookie,{invoice:id}))).status,409);await client.execute("UPDATE products SET price=175000 WHERE id='p'");assert.equal((await m.resume(req('/api/customer/orders/resume',aCookie,{invoice:id}))).status,200);assert.equal((await row()).total,175000)});
