import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {migrate} from '../scripts/migration-core.mjs';

Object.assign(process.env,{TURSO_DATABASE_URL:'file::memory:',TURSO_AUTH_TOKEN:'',AUTH_SECRET:'a'.repeat(64),CONFIG_SECRET:'b'.repeat(64),SITE_ORIGIN:'https://elite.test',BLOB_READ_WRITE_TOKEN:'',BLOB_STORE_ID:''});delete process.env.VERCEL;
await mkdir('.test-runtime/tests',{recursive:true});const file=path.resolve('.test-runtime/tests/payment-recovery.mjs');
await build({stdin:{contents:`export {getSqlClient} from './lib/database';export {hash,myOrder} from './modules/order/order-server';export {createCheckout,quoteCheckout} from './modules/catalog/checkout';export {POST as issue} from './app/api/order/payment-link/route';export {POST as resume} from './app/api/order/resume/route';export {POST as memberResume} from './app/api/customer/orders/resume/route';export {GET as history} from './app/api/customer/orders/route';export {GET as tracking,POST as lookup} from './app/api/order/tracking/route';export {guestPaymentLink} from './modules/order/payment-recovery';export {invoiceResumeInput,invoiceResumeDestination} from './modules/order/checkout-session';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:file,banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'next',setup(b){b.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path+'.js',external:true}))}}]});
const m=await import(pathToFileURL(file)),db=m.getSqlClient();await migrate(db,new URL('../migrations/',import.meta.url));
const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('No network allowed in recovery tests')};
after(async()=>{globalThis.fetch=originalFetch;db.close();await rm(file,{force:true})});
const id='EV-261025-ABCDEF01',other='EV-261025-ABCDEF02',guestToken='3'.repeat(64),guestCookie='elite_order='+guestToken,memberCookie='elite_customer='+'1'.repeat(64),foreignCookie='elite_customer='+'2'.repeat(64);
const req=(p,body,cookie='',origin='https://elite.test')=>new Request('https://elite.test'+p,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const row=async(orderId=id)=>(await db.execute({sql:'SELECT * FROM orders WHERE id=?',args:[orderId]})).rows[0];
async function seed({orderId=id,customer=null,age=0,discount=0,catalog=true}={}){
 let catalogId=null,catalogToken=null,lines=null;
 if(catalog){const c=await m.createCheckout({lines:[{productId:'p',groupId:'g',quantity:1}]},customer);catalogToken=new URL(c.url,'https://elite.test').searchParams.get('catalog');const stored=(await db.execute({sql:'SELECT id,lines_json FROM catalog_checkouts WHERE token_hash=?',args:[await m.hash(catalogToken)]})).rows[0];catalogId=stored.id;lines=stored.lines_json}
 await db.execute({sql:`INSERT INTO orders(id,session_hash,created_at,name,phone,address,postcode,item,items_json,total,item_amount,item_subtotal,discount_amount,shipping_amount,shipping_protection_fee,declared_shipping_value,shipping_protection_source,shipping_json,status,customer_id,catalog_checkout_id,catalog_token,catalog_items_json)
  VALUES(?,?,?,'SIMULATED BUYER','081234567890','SIMULATED ADDRESS','12345','SIMULATED POLO','["SIMULATED POLO"]',?,?,175000,?,10000,350,?,'jnt_counter',?,'awaiting_proof',?,?,?,?)`,args:[orderId,await m.hash(guestToken),Date.now()-age,185350-discount,175000-discount,discount,175000-discount,JSON.stringify({amount:10000,courier:'jnt',service:'EZ',grams:1000,destination:{postalCode:'12345'}}),customer,catalogId,catalogToken,lines]});
 return row(orderId);
}
async function expiredSelection(o){await db.execute({sql:'UPDATE catalog_checkouts SET expires_at=? WHERE id=?',args:[Date.now()-1000,o.catalog_checkout_id]})}
async function savedLink(o=undefined){o??=await seed();const response=await m.issue(req('/api/order/payment-link',{invoice:o.id},guestCookie));assert.equal(response.status,200);return {...await response.json(),response}}
const resumeBody=link=>{const u=new URL(link.url);return {invoice:u.searchParams.get('invoice'),token:u.hash.slice(1)}};
beforeEach(async()=>{
 process.env.CONFIG_SECRET='b'.repeat(64);
 for(const table of ['tracking_links','shipment_tracking','shipments','reserve_audit','reserve_items','reserve_payments','first_purchase_discounts','purchase_voucher_claims','orders','catalog_sales','stock_history','catalog_checkouts','size_groups','products','customer_sessions','customers','limits'])await db.execute('DELETE FROM '+table);
 for(const [customer,token] of [['a','1'.repeat(64)],['b','2'.repeat(64)]]){await db.execute({sql:"INSERT INTO customers(id,name,identity,password_hash,created_at) VALUES(?,?,?,'FIXTURE',?)",args:[customer,customer,customer+'@elite.test',Date.now()]});await db.execute({sql:'INSERT INTO customer_sessions(hash,customer_id,created_at,expires_at) VALUES(?,?,?,?)',args:[await m.hash(token),customer,Date.now(),Date.now()+86400000]})}
 const stamp=new Date().toISOString();await db.execute({sql:"INSERT INTO products(id,shortcode,instagram_url,name,price,reviewed,status,created_at,updated_at,published_at) VALUES('p','SIMULATED','','SIMULATED POLO',175000,1,'published',?,?,?)",args:[stamp,stamp,stamp]});await db.execute("INSERT INTO size_groups(id,product_id,label,fits,qty) VALUES('g','p','M','[\"M\"]',2)");
});

test('an owned two-day invoice resumes and refreshes only its catalog selection within its original seven-day window',async()=>{
 const before=await seed({customer:'a',age:2*86400000,discount:5000});await expiredSelection(before);
 assert.equal((await (await m.history(req('/api/customer/orders',undefined,memberCookie))).json()).orders[0].action,'payment');
 await assert.rejects(()=>m.quoteCheckout(before.catalog_token),e=>e.status===410);
 const response=await m.memberResume(req('/api/customer/orders/resume',{invoice:id},memberCookie));assert.equal(response.status,200);
 const after=await row();assert.notEqual(after.session_hash,before.session_hash);const oldHash=before.session_hash;before.session_hash=after.session_hash;assert.deepEqual(after,before);assert.notEqual(after.session_hash,oldHash);
 const quote=await m.quoteCheckout(after.catalog_token);assert.equal(quote.expiresAt,after.created_at+7*86400000);assert.equal(quote.amount,175000);
 assert.equal((await db.execute('SELECT COUNT(*) n FROM orders')).rows[0].n,1);assert.equal((await db.execute("SELECT qty FROM size_groups WHERE id='g'")).rows[0].qty,2);
});

test('expired unattached selections stay expired; account ownership and seven-day invoice boundary remain enforced',async()=>{
 const o=await seed({customer:'a',age:8*86400000});await expiredSelection(o);
 assert.equal((await m.memberResume(req('/api/customer/orders/resume',{invoice:id},memberCookie))).status,409);
 assert.equal((await m.memberResume(req('/api/customer/orders/resume',{invoice:id},foreignCookie))).status,409);
 await assert.rejects(()=>m.quoteCheckout(o.catalog_token),e=>e.status===410);
 await db.execute({sql:'DELETE FROM orders WHERE id=?',args:[id]});await assert.rejects(()=>m.quoteCheckout(o.catalog_token),e=>e.status===410);
});

test('resume still rejects changed price, missing stock, future release and inactive color without rotating the payment session',async()=>{
 const o=await seed({customer:'a',age:2*86400000});await expiredSelection(o);
 for(const [setup,restore] of [["UPDATE products SET price=200000 WHERE id='p'","UPDATE products SET price=175000 WHERE id='p'"],["UPDATE size_groups SET qty=0 WHERE id='g'","UPDATE size_groups SET qty=2 WHERE id='g'"],[`UPDATE products SET orderable_at='${new Date(Date.now()+86400000).toISOString()}' WHERE id='p'`,"UPDATE products SET orderable_at=NULL WHERE id='p'"],[`UPDATE products SET color_variants='[{"id":"color","active":false,"name":"Blue"}]' WHERE id='p'`,"UPDATE products SET color_variants='[]' WHERE id='p'"]]){
  await db.execute(setup);if(setup.includes('color_variants'))await db.execute("UPDATE size_groups SET color_variant_id='color' WHERE id='g'");
  const response=await m.memberResume(req('/api/customer/orders/resume',{invoice:id},memberCookie));assert.ok([404,409].includes(response.status));assert.equal((await row()).session_hash,o.session_hash);await db.execute(restore);await db.execute("UPDATE size_groups SET color_variant_id=NULL WHERE id='g'");
 }
 assert.equal((await m.memberResume(req('/api/customer/orders/resume',{invoice:id},memberCookie))).status,200);
});

test('guest can save a private signed link before proof and reopen it without cookies after 24 hours',async()=>{
 const before=await seed({age:2*86400000});const link=await savedLink(before);await expiredSelection(before);
 const u=new URL(link.url);assert.equal(u.origin,'https://elite.test');assert.equal(u.pathname,'/order/lanjutkan');assert.equal(u.searchParams.get('invoice'),id);assert.match(u.hash,/^#[a-f0-9]{64}$/);assert.ok(!u.search.includes(u.hash.slice(1)));assert.equal(link.expiresAt,before.created_at+7*86400000);
 assert.equal(link.response.headers.get('cache-control'),'private, no-store');assert.equal(link.response.headers.get('vary'),'Cookie');assert.equal(link.response.headers.get('x-robots-tag'),'noindex, nofollow');
 const response=await m.resume(req('/api/order/resume',resumeBody(link)));assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true,url:'/order'});const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly; Secure; SameSite=Strict/);
 const restored=await m.myOrder(req('/api/order',undefined,cookie.split(';')[0]));assert.equal(restored.id,id);assert.equal(restored.total,before.total);assert.equal(restored.customer_id,null);assert.equal((await db.execute('SELECT COUNT(*) n FROM orders')).rows[0].n,1);
 // Capability is reusable until invoice expiry; rotating the browser session is not account login.
 assert.equal((await m.resume(req('/api/order/resume',resumeBody(link)))).status,200);assert.equal((await db.execute('SELECT COUNT(*) n FROM customer_sessions')).rows[0].n,2);
});

test('issuing a link requires the invoice browser session, exact invoice and same origin, without exposing customer data',async()=>{
 await seed();
 for(const [cookie,origin,body,status] of [['','https://elite.test',{invoice:id},404],[memberCookie,'https://elite.test',{invoice:id},404],[guestCookie,'https://evil.test',{invoice:id},403],[guestCookie,'https://elite.test',{invoice:other},409],[guestCookie,'https://elite.test',{invoice:id,total:1},400]]){
  const response=await m.issue(req('/api/order/payment-link',body,cookie,origin));assert.equal(response.status,status);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.deepEqual(Object.keys(await response.json()),['error']);
 }
 const value=await m.guestPaymentLink(await row());assert.deepEqual(Object.keys(value).sort(),['expiresAt','url']);
});

test('invoice alone, forged/cross-invoice/legacy tokens, extra fields, cross-origin and secret rotation cannot restore a guest invoice',async()=>{
 const link=await savedLink(),valid=resumeBody(link),before=await row();
 for(const [body,origin,status] of [[{invoice:id},'https://elite.test',400],[{...valid,token:'0'.repeat(64)},'https://elite.test',404],[{...valid,invoice:other},'https://elite.test',404],[{...valid,token:guestToken},'https://elite.test',404],[{...valid,total:1},'https://elite.test',400],[valid,'https://evil.test',403]])assert.equal((await m.resume(req('/api/order/resume',body,'',origin))).status,status);
 process.env.CONFIG_SECRET='c'.repeat(64);assert.equal((await m.resume(req('/api/order/resume',valid))).status,404);assert.deepEqual(await row(),before);
});

test('guest link cannot cross the invoice age, cancellation, Reserve or account-ownership boundaries',async()=>{
 const link=await savedLink(),valid=resumeBody(link),original=await row();
 for(const [sql,restore] of [["UPDATE orders SET created_at=created_at-8*86400000","UPDATE orders SET created_at="+original.created_at],["UPDATE orders SET status='cancelled'","UPDATE orders SET status='awaiting_proof'"],["UPDATE orders SET order_type='reserve',reservation_status='AWAITING_DEPOSIT'","UPDATE orders SET order_type='normal',reservation_status=NULL"],["UPDATE orders SET customer_id='a'","UPDATE orders SET customer_id=NULL"]]){
  await db.execute(sql);assert.equal((await m.resume(req('/api/order/resume',valid))).status,404);assert.equal((await m.issue(req('/api/order/payment-link',{invoice:id},guestCookie))).status===200,false);await db.execute(restore);
 }
 assert.equal((await row()).session_hash,original.session_hash);
});

test('a saved guest payment link opens read-only tracking after proof, without reopening payment or creating another order',async()=>{
 const link=await savedLink();await db.execute("UPDATE orders SET proof_key='SIMULATED_PROOF',status='submitted',payment_state='proof_received'");const before=await row();
 const response=await m.resume(req('/api/order/resume',resumeBody(link)));assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);const v=await response.json();assert.match(v.url,/^\/lacak#[a-f0-9]{64}$/);assert.deepEqual(await row(),before);
 const tracking=await m.tracking(new Request('https://elite.test/api/order/tracking',{headers:{Authorization:'Bearer '+v.url.split('#')[1]}}));assert.equal(tracking.status,200);assert.equal((await tracking.json()).invoice,id);
 assert.equal((await db.execute('SELECT COUNT(*) n FROM orders')).rows[0].n,1);
});

test('saved guest link validates stock and sale changes while retaining invoice totals and reward/protection accounting',async()=>{
 const link=await savedLink(),before=await row();await expiredSelection(before);await db.execute("UPDATE products SET sale_price=150000 WHERE id='p'");assert.equal((await m.resume(req('/api/order/resume',resumeBody(link)))).status,409);assert.deepEqual(await row(),before);
 await db.execute("UPDATE products SET sale_price=NULL WHERE id='p'");await db.execute("UPDATE size_groups SET qty=0 WHERE id='g'");assert.equal((await m.resume(req('/api/order/resume',resumeBody(link)))).status,409);assert.deepEqual(await row(),before);
});

test('first invoice/phone Reserve lookup immediately includes deadline, balance and status, identical to the protected GET',async()=>{
 await seed();const now=Date.now();await db.execute({sql:"UPDATE orders SET order_type='reserve',reservation_status='RESERVED',deposit_minimum=50000,deposit_amount=50000,reservation_started_at=?,reservation_deadline=?,proof_key='SIMULATED_PROOF',status='submitted',payment_state='proof_received'",args:[now,now+48*3600000]});await db.execute({sql:"INSERT INTO reserve_payments(id,order_id,amount,payment_method,state,created_at,confirmed_at) VALUES('fixture-payment',?,50000,'bca_transfer','confirmed',?,?)",args:[id,now,now]});
 const response=await m.lookup(req('/api/order/tracking',{invoice:id,phone:'081234567890'}));assert.equal(response.status,200);const value=await response.json();assert.equal(value.reservation.status,'RESERVED');assert.equal(value.reservation.deadline,now+48*3600000);assert.equal(value.reservation.remaining,135350);assert.equal(value.reservation.totalPaid,50000);
 const get=await m.tracking(new Request('https://elite.test/api/order/tracking',{headers:{Authorization:'Bearer '+value.accessUrl.split('#')[1]}}));assert.equal(get.status,200);assert.deepEqual((await get.json()).reservation,value.reservation);
 for(const key of ['phone','address','proof_key','session_hash','catalog_token'])assert.ok(!(key in value));
 assert.equal((await m.lookup(req('/api/order/tracking',{invoice:id,phone:'081234567899'}))).status,404);
});

test('guest and legacy continuation inputs preserve only scoped arguments and never allow an external redirect',()=>{
 const token='a'.repeat(64),basket='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 assert.deepEqual(m.invoiceResumeInput('?invoice='+id,'#'+token),{body:{invoice:id,token},fallback:'/order'});
 const legacy=m.invoiceResumeInput('?catalog='+token+'&basket='+basket+'&next=https://evil.test','#'+token);assert.deepEqual(legacy.body,{token});assert.ok(legacy.fallback.startsWith('/order?catalog='));assert.ok(!legacy.fallback.includes('evil'));
 for(const query of ['?invoice=bad','?invoice='+id+'&invoice='+other])assert.throws(()=>m.invoiceResumeInput(query,'#'+token));assert.throws(()=>m.invoiceResumeInput('?invoice='+id,'#bad'));
 assert.equal(m.invoiceResumeDestination({ok:true},legacy.fallback),legacy.fallback);assert.equal(m.invoiceResumeDestination({url:'/lacak#'+token},'/order'),'/lacak#'+token);
 for(const url of ['https://evil.test','//evil.test','/admin','/order?total=1','/lacak#bad'])assert.throws(()=>m.invoiceResumeDestination({url},'/order'));
});
