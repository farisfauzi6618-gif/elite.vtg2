import test,{after,afterEach,beforeEach}from'node:test';import assert from'node:assert/strict';import{build as bundle}from'esbuild';import{mkdtemp,mkdir,rm,writeFile}from'node:fs/promises';import os from'node:os';import path from'node:path';import{pathToFileURL}from'node:url';import{migrate}from'../scripts/migration-core.mjs';import{hashPassword}from'../lib/auth/password.mjs';
const build=options=>bundle({...options,banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'next',setup(b){b.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path+'.js',external:true}))}}]});
const temporary=await mkdtemp(path.join(os.tmpdir(),'elite-reserve-'));process.env.TURSO_DATABASE_URL='file:'+path.join(temporary,'test.db');process.env.SITE_ORIGIN='https://elite.test';process.env.AUTH_SECRET='a'.repeat(64);process.env.CONFIG_SECRET='b'.repeat(64);process.env.STORAGE_DRIVER='local';process.env.LOCAL_STORAGE_PATH=path.join(temporary,'files');process.env.PAYMENT_BCA_ACCOUNT_NUMBER='1234567890';process.env.PAYMENT_BCA_ACCOUNT_HOLDER='Simulated Owner';delete process.env.VERCEL;delete process.env.TURSO_AUTH_TOKEN;await mkdir('.test-runtime/tests',{recursive:true});const file=path.resolve('.test-runtime/tests/reserve.mjs');await build({stdin:{contents:"export {registerCustomer,currentCustomer} from './modules/catalog/customers';export {loyaltyCard} from './modules/loyalty/server';export {getSqlClient} from './lib/database';export {GET as reserveGet,POST as reservePost} from './app/api/reserve/route';export {POST as reserveProof} from './app/api/reserve/proof/route';export {GET as adminReserveGet,POST as adminReservePost} from './app/api/admin/reserve/route';export {orderProgress} from './modules/order/order-progress';export {updateManualProgress} from './modules/order/manual-progress';export {trackingAccess} from './modules/order/customer-tracking';export {loginOwner,ownerCookie} from './lib/auth/owner';export {hash} from './modules/order/order-server';export * from './modules/order/reserve-server';export * from './modules/order/reserve-types';export {createCheckout,quoteCheckout,applyCheckoutSale} from './modules/catalog/checkout';export {GET as selectionGet} from './app/api/catalog/selection/route';export * from './modules/catalog/catalog-selection';export {readProduct,readProducts} from './modules/catalog/server';export {saveProduct} from './modules/catalog/catalog-service';export * from './modules/catalog/color-variants';export {productShareUrl,productShareMetadata} from './modules/catalog/product-share';export {publicProduct,isReserved,isSold,availableGroups} from './modules/catalog/catalog-types';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:file});const m=await import(pathToFileURL(file));
let client;
beforeEach(async()=>{
 process.env.TURSO_DATABASE_URL='file:'+path.join(temporary,crypto.randomUUID()+'.db');
 client=m.getSqlClient();
 await migrate(client,new URL('../migrations/',import.meta.url));
});
afterEach(()=>{client.close();global.gc?.();});
after(async()=>{await rm(file,{force:true});if(path.dirname(temporary)!==os.tmpdir())throw Error('Unsafe cleanup');await rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:200})});
async function seed(id,qty=1,price=180000){const now=new Date().toISOString();await client.execute({sql:"INSERT INTO products(id,shortcode,instagram_url,name,brand,category,color,price,condition,defects,photo_key,created_at,updated_at,published_at,status,reviewed) VALUES(?,?,'',?,'PRL','Polo','Blue',?,'Good','None','photo',?,?,?,'published',1)",args:[id,id,id,price,now,now,now]});await client.execute({sql:"INSERT INTO size_groups(id,product_id,fits,qty) VALUES(?,?,'[\"M\"]',?)",args:['g-'+id,id,qty]});return{productId:id,groupId:'g-'+id,quantity:1};}
async function reserve(lines,deposit,shipping=10000,customerCookie='',shippingPayment='prepaid'){const checkout=await m.createCheckout({mode:'reserve',lines}),token=new URL(checkout.url,'https://elite.test').searchParams.get('catalog'),q=await m.quoteCheckout(token);const r=new Request('https://elite.test/api/order',{method:'POST',headers:{origin:'https://elite.test',cookie:customerCookie}});const v={name:'Simulated Customer',phone:'081234567890',address:'Simulated road house 10',postcode:'12345',item:'Simulated',quantity:lines.reduce((n,l)=>n+l.quantity,0),items:lines.flatMap(l=>Array(l.quantity).fill('Simulated')),itemAmount:q.amount};const response=await m.createReserveOrder(r,v,q,{amount:shipping,paymentMode:shippingPayment,courier:'jnt',service:'EZ',grams:v.quantity*1000,destination:{label:'Simulated'}},deposit,'bca_transfer',token),o=await response.json();assert.equal(response.status,201);assert.equal(o.discount_amount,0);const p=o.reservation.payments[0];await client.execute({sql:"UPDATE reserve_payments SET state='submitted',proof_key='simulated-proof',submitted_at=? WHERE id=?",args:[Date.now(),p.id]});await client.execute({sql:"UPDATE orders SET proof_key='simulated-proof',status='submitted' WHERE id=?",args:[o.id]});return{...o,paymentId:p.id,cookie:response.headers.get('set-cookie').split(';')[0]};}
const order=id=>client.execute({sql:'SELECT * FROM orders WHERE id=?',args:[id]}).then(r=>r.rows[0]);
test('minimum is whole-order25percent or50000 with valid deposit cap',()=>{assert.equal(m.minimumReserveDeposit(180000),50000);assert.equal(m.minimumReserveDeposit(1200000),300000);assert.equal(m.minimumReserveDeposit(5000000),1250000);assert.equal(m.validReserveDeposit(180000,180001),false);assert.throws(()=>m.minimumReserveDeposit(49999));});

test('Reserve freight collect charges only the goods ledger and retains the carrier estimate',async()=>{
 const line=await seed('reserve-freight-collect',1,180000),o=await reserve([line],50000,38000,'','collect');assert.equal(o.total,180000);assert.equal(o.shipping_amount,0);assert.equal(o.quote.amount,38000);assert.equal(o.quote.paymentMode,'collect');assert.equal(o.reservation.shippingPayment,'collect');assert.equal(o.reservation.shippingEstimate,38000);assert.equal(o.reservation.remaining,180000);
 await m.confirmReservePayment(o.paymentId,'owner');let fresh=await order(o.id);assert.equal((await m.reserveSummary(fresh)).remaining,130000);assert.notEqual(m.orderProgress(fresh).status,'PREPARING');const resi={action:'ship',courier:'J&T Regular',trackingNumber:'JP12345678'};await assert.rejects(m.updateManualProgress(o.id,{...resi,revision:fresh.post_purchase_revision},'owner'),e=>e.status===409);const second=await m.newReservePayment(fresh,130000,'bca_transfer');await client.execute({sql:"UPDATE reserve_payments SET state='submitted',proof_key='local-collect-proof',submitted_at=? WHERE id=?",args:[Date.now(),second]});await m.confirmReservePayment(second,'owner');fresh=await order(o.id);assert.equal(fresh.reservation_status,'PAID');assert.equal(m.orderProgress(fresh).status,'PREPARING');assert.equal((await m.updateManualProgress(o.id,{...resi,revision:fresh.post_purchase_revision},'owner')).status,'SHIPPED');assert.equal((await m.reserveSummary(fresh)).remaining,0);assert.equal((await m.readProduct(line.productId)).groups[0].qty,0);
});
test('deposit locks one-of-one without sale; duplicate confirmation never doubles lock',async()=>{const line=await seed('one'),o=await reserve([line],50000);assert.equal((await m.readProduct('one')).groups[0].reservedQty,0);await m.confirmReservePayment(o.paymentId,'owner');let p=await m.readProduct('one');assert.equal(p.groups[0].qty,1);assert.equal(p.groups[0].reservedQty,1);assert.equal(m.publicProduct(p).groups[0].qty,0);assert.equal(m.isReserved(p),true);assert.equal(m.isSold(p),false);await assert.rejects(m.createCheckout({lines:[line]}),/Stok/);await m.confirmReservePayment(o.paymentId,'owner');p=await m.readProduct('one');assert.equal(p.groups[0].reservedQty,1);const fresh=await order(o.id);assert.equal(fresh.confirmed_at,null);assert.equal(fresh.reservation_deadline-fresh.reservation_started_at,7*86400000);await assert.rejects(client.execute({sql:'UPDATE size_groups SET qty=0 WHERE id=?',args:[line.groupId]}),/locked/);});
test('concurrent deposits serialize, only one winner; failed multi-item holds roll back entirely',async()=>{const free=await seed('free'),held=await seed('held'),multi=await reserve([free,held],90000),single=await reserve([held],50000);await m.confirmReservePayment(single.paymentId,'owner');await assert.rejects(m.confirmReservePayment(multi.paymentId,'owner'),/tidak tersedia/);assert.equal((await m.readProduct('free')).groups[0].reservedQty,0);assert.equal((await order(multi.id)).reservation_status,'AWAITING_DEPOSIT');const line=await seed('race'),a=await reserve([line],50000),b=await reserve([line],50000);const results=await Promise.allSettled([m.confirmReservePayment(a.paymentId,'owner'),m.confirmReservePayment(b.paymentId,'owner')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await m.readProduct('race')).groups[0].reservedQty,1);});
test('multiple stock permits normal purchase only for remaining units; staged payments finish existing fulfillment once',async()=>{const line=await seed('many',8,250000),o=await reserve([{...line,quantity:3}],200000);await m.confirmReservePayment(o.paymentId,'owner');assert.equal(m.publicProduct(await m.readProduct('many')).groups[0].qty,5);const normal=await m.createCheckout({lines:[{...line,quantity:5}]}),q=await m.quoteCheckout(new URL(normal.url,'https://elite.test').searchParams.get('catalog'));await m.applyCheckoutSale({orderId:'EV-261014-AAAAAAAA',checkoutId:q.id});assert.equal((await m.readProduct('many')).groups[0].qty,3);await assert.rejects(m.createCheckout({lines:[line]}),/Stok/);let fresh=await order(o.id);const second=await m.newReservePayment(fresh,300000,'bca_transfer','owner','Verified simulated transfer');await m.confirmReservePayment(second,'owner');fresh=await order(o.id);assert.equal(fresh.reservation_status,'PARTIALLY_PAID');assert.equal((await m.reserveSummary(fresh)).remaining,260000);await assert.rejects(m.newReservePayment(fresh,260001,'bca_transfer'),/melebihi/);const last=await m.newReservePayment(fresh,260000,'bca_transfer','owner','Verified simulated transfer');await m.confirmReservePayment(last,'owner');fresh=await order(o.id);assert.equal(fresh.reservation_status,'PAID');assert.equal(fresh.payment_state,'payment_confirmed');assert.equal((await m.reserveSummary(fresh)).payments.length,3);assert.equal((await m.readProduct('many')).groups[0].qty,0);assert.equal(m.isSold(await m.readProduct('many')),true);assert.equal((await client.execute({sql:'SELECT * FROM shipments WHERE order_id=?',args:[o.id]})).rows.length,1);await m.confirmReservePayment(last,'owner');await m.expireReservations(Date.now()+8*86400000);assert.equal((await m.readProduct('many')).groups[0].qty,0);});
test('extension needs one authenticated customer request and approval after verified DP reaches 50%',async()=>{
 const line=await seed('extension',1,180001),o=await reserve([line],50000);
 await m.confirmReservePayment(o.paymentId,'owner');
 const row=await order(o.id),limit=row.reservation_started_at+14*m.RESERVE_DAY_MS;
 await assert.rejects(m.extendReserve(o.id,limit,'owner'),/permintaan/);
 const request=(cookie,origin='https://elite.test')=>m.reservePost(new Request('https://elite.test/api/reserve?invoice='+o.id,{
  method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({action:'request_extension'})
 }));
 assert.equal((await request('')).status,404);
 assert.equal((await request(o.cookie,'https://other.test')).status,403);
 assert.equal((await request(o.cookie)).status,200);
 assert.equal((await request(o.cookie)).status,409);
 const adminRequest=(cookie='')=>new Request('https://elite.test/api/admin/reserve',{
  method:'POST',headers:{origin:'https://elite.test','content-type':'application/json',cookie},
  body:JSON.stringify({action:'extend',orderId:o.id,deadline:limit})
 });
 assert.equal((await m.adminReservePost(adminRequest())).status,401);
 process.env.ADMIN_EMAIL='owner@elite.test';
 const password='LOCAL_RESERVE_ADMIN_FIXTURE_PASSWORD';
 process.env.ADMIN_PASSWORD_HASH=await hashPassword(password);
 const login=new Request('https://elite.test/api/auth/owner');
 const ownerCookie=m.ownerCookie(login,await m.loginOwner(login,{email:'owner@elite.test',password})).split(';')[0];
 assert.equal((await m.reserveSummary(await order(o.id))).extension.requiredTopUp,40001);
 const pay=await m.newReservePayment(row,40000,'bca_transfer','owner','Simulated top-up');
 await assert.rejects(m.extendReserve(o.id,limit,'owner'),/50%/);
 await m.confirmReservePayment(pay,'owner');
 await assert.rejects(m.extendReserve(o.id,limit,'owner'),/50%/);
 const final=await m.newReservePayment(await order(o.id),1,'bca_transfer','owner','Simulated top-up difference');
 await m.confirmReservePayment(final,'owner');
 assert.equal((await m.reserveSummary(await order(o.id))).extension.requiredTopUp,0);
 assert.equal((await order(o.id)).reservation_deadline,row.reservation_deadline);
 await assert.rejects(m.extendReserve(o.id,limit+1,'owner'),/maksimal/);
 assert.equal((await m.adminReservePost(adminRequest(ownerCookie))).status,200);
 assert.equal((await order(o.id)).reservation_deadline,limit);
 assert.equal((await m.reserveSummary(await order(o.id))).extension.state,'approved');
 await assert.rejects(m.requestReserveExtension(o.id),/satu kali/);
 await assert.rejects(m.extendReserve(o.id,limit,'owner'),/permintaan/);
 await m.expireReservations(row.reservation_deadline+1);
 assert.equal((await order(o.id)).reservation_status,'PARTIALLY_PAID');
 const result=await Promise.allSettled([m.expireReservations(limit),m.expireReservations(limit)]);
 assert.equal(result.reduce((n,x)=>n+(x.status==='fulfilled'?x.value:0),0),1);
 assert.equal(await m.expireReservations(limit+1),0);
 const expired=await m.reserveSummary(await order(o.id));
 assert.equal(expired.status,'EXPIRED');
 assert.equal(expired.forfeitedAmount,90001);
 assert.equal(expired.payments.filter(p=>p.state==='confirmed').length,3);
 assert.equal((await m.readProduct(line.productId)).groups[0].reservedQty,0);
 const ledger=(await client.execute({sql:"SELECT amount,note FROM reserve_audit WHERE order_id=? AND action='expired'",args:[o.id]})).rows;
 assert.equal(ledger.length,1);
 assert.equal(ledger[0].amount,90001);
 assert.match(ledger[0].note,/hangus/);
 assert.equal((await client.execute({sql:'SELECT * FROM catalog_sales WHERE order_id=?',args:[o.id]})).rows.length,0);
 assert.notEqual((await order(o.id)).payment_state,'payment_confirmed');
 const metrics=await m.reserveMetrics();
 assert.ok(metrics.requested>=1&&metrics.approved>=1&&metrics.forfeited>=90001);
});

test('an initial deposit at 50% can receive a single extension with no extra payment',async()=>{
 const o=await reserve([await seed('extension-no-top-up')],90000);
 await m.confirmReservePayment(o.paymentId,'owner');
 const before=await order(o.id);
 assert.equal((await m.reserveSummary(before)).extension.requiredTopUp,0);
 await m.requestReserveExtension(o.id);
 await m.extendReserve(o.id,before.reservation_deadline+m.RESERVE_DAY_MS,'owner');
 const after=await m.reserveSummary(await order(o.id));
 assert.equal(after.extension.state,'approved');
 assert.equal(after.payments.length,1);
});

test('declined extension requests cannot be reopened',async()=>{
 const o=await reserve([await seed('extension-rejected')],90000);
 await m.confirmReservePayment(o.paymentId,'owner');
 const before=await order(o.id);
 assert.equal((await m.reserveSummary(before)).extension.requiredTopUp,0);
 await m.requestReserveExtension(o.id);
 await m.rejectReserveExtension(o.id,'owner');
 assert.equal((await m.reserveSummary(await order(o.id))).extension.state,'rejected');
 assert.equal((await order(o.id)).reservation_deadline,before.reservation_deadline);
 await assert.rejects(m.requestReserveExtension(o.id),/satu kali/);
 await assert.rejects(m.extendReserve(o.id,before.reservation_deadline+1,'owner'),/permintaan/);
 await m.cancelReserve(o.id,'owner');
 await m.cancelReserve(o.id,'owner');
 assert.equal((await m.reserveSummary(await order(o.id))).forfeitedAmount,0);
});

test('legacy terms preserve original deadline, extension rules and treatment of funds',async()=>{
 const o=await reserve([await seed('legacy-reserve')],50000);
 await client.execute({sql:'UPDATE orders SET reserve_policy_version=1 WHERE id=?',args:[o.id]});
 await m.confirmReservePayment(o.paymentId,'owner');
 const old=await order(o.id),limit=old.reservation_started_at+7*m.RESERVE_DAY_MS;
 assert.equal(old.reservation_deadline-old.reservation_started_at,2*m.RESERVE_DAY_MS);
 assert.equal((await m.reserveSummary(old)).policyVersion,1);
 await assert.rejects(m.requestReserveExtension(o.id),/ketentuan sebelumnya/);
 await m.extendReserve(o.id,limit,'owner');
 assert.equal((await order(o.id)).reservation_deadline,limit);
 await m.expireReservations(limit);
 assert.equal((await m.reserveSummary(await order(o.id))).forfeitedAmount,0);
 assert.equal((await client.execute({sql:"SELECT amount FROM reserve_audit WHERE order_id=? AND action='expired'",args:[o.id]})).rows[0].amount,null);
});
test('twenty pieces form one Reserve with minimum based on total, not per piece',async()=>{const line=await seed('twenty',20,60000),o=await reserve([{...line,quantity:20}],300000);assert.equal(o.reservation.orderValue,1200000);assert.equal(o.reservation.depositMinimum,300000);await m.confirmReservePayment(o.paymentId,'owner');assert.equal((await client.execute({sql:'SELECT COUNT(*) AS n FROM orders WHERE id=?',args:[o.id]})).rows[0].n,1);assert.equal((await m.readProduct('twenty')).groups[0].reservedQty,20);});

test('Reserve routes require ownership, origin, private proof without exposing private payments',async()=>{const line=await seed('security'),o=await reserve([line],50000),other=await reserve([await seed('other-security')],50000),request=(path,body,cookie=o.cookie,origin='https://elite.test')=>new Request('https://elite.test'+path,{method:body?'POST':'GET',headers:{cookie,origin,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});assert.equal((await m.adminReserveGet(request('/api/admin/reserve',null,''))).status,401);assert.equal((await m.reserveGet(request('/api/reserve?invoice='+other.id))).status,404);assert.equal((await m.reservePost(request('/api/reserve',{action:'payment',amount:1,method:'bca_transfer'},o.cookie,'https://attacker.test'))).status,403);await client.execute({sql:"UPDATE reserve_payments SET state='awaiting_proof',proof_key=NULL WHERE id=?",args:[o.paymentId]});const bytes=new Uint8Array(40);bytes.set([255,216,255]);const upload=async(paymentId,extra=false)=>{const f=new FormData();f.set('file',new File([bytes],'proof.jpg',{type:'image/jpeg'}));f.set('paymentId',paymentId);f.set('paymentMethod','bca_transfer');if(extra)f.set('amount','1');return m.reserveProof(new Request('https://elite.test/api/reserve/proof',{method:'POST',headers:{cookie:o.cookie,origin:'https://elite.test'},body:f}))};assert.equal((await upload(other.paymentId)).status,404);assert.equal((await upload(o.paymentId,true)).status,400);assert.equal((await upload(o.paymentId)).status,200);const p1=(await client.execute({sql:'SELECT * FROM reserve_payments WHERE id=?',args:[o.paymentId]})).rows[0];assert.equal((await upload(o.paymentId)).status,200);const p2=(await client.execute({sql:'SELECT * FROM reserve_payments WHERE id=?',args:[o.paymentId]})).rows[0];assert.equal(p1.proof_key,p2.proof_key);assert.equal((await order(o.id)).reservation_status,'AWAITING_DEPOSIT');await m.rejectReservePayment(o.paymentId,'owner');const replacement=await m.newReservePayment(await order(o.id),50000,'bca_transfer');assert.notEqual(replacement,o.paymentId);assert.equal((await m.reserveSummary(await order(o.id))).payments.length,2);});
test('twenty distinct variants stay in one atomic Reserve; Reserve checkout cannot bypass its ledger',async()=>{const lines=[];for(let i=0;i<20;i++)lines.push(await seed('distinct-'+i,1,60000));const o=await reserve(lines,300000);await assert.rejects(m.applyCheckoutSale({orderId:o.id,checkoutId:o.catalog_checkout_id}),/Reserve/);await m.confirmReservePayment(o.paymentId,'owner');assert.equal((await client.execute({sql:"SELECT COUNT(*) AS n FROM reserve_items WHERE order_id=? AND state='active'",args:[o.id]})).rows[0].n,20);await m.cancelReserve(o.id,'owner');for(const l of lines)assert.equal((await m.readProduct(l.productId)).groups[0].reservedQty,0);});

test('member loyalty earns nothing for DP, then credits once on full Reserve settlement; private tracking works without the latest checkout cookie',async()=>{const a=await m.registerCustomer({name:'Simulated member',identity:'reserve-member@example.test',password:'SIMULATED_RESERVE_MEMBER_PASSWORD',consent:true},null),cookie='elite_customer='+a.token,c=await m.currentCustomer(cookie),o=await reserve([await seed('member-reserve',1,180000)],50000,10000,cookie);await m.confirmReservePayment(o.paymentId,'owner');assert.equal((await m.loyaltyCard(c.id)).stamps,0);const access=await m.trackingAccess(await order(o.id)),r=new Request('https://elite.test/api/reserve?invoice='+o.id,{headers:{Authorization:'Bearer '+access.token}});assert.equal((await m.reserveGet(r)).status,200);assert.equal((await m.reserveGet(new Request('https://elite.test/api/reserve?invoice='+o.id))).status,404);const requestId=crypto.randomUUID(),last=await m.newReservePayment(await order(o.id),140000,'bca_transfer','owner','Simulated verified settlement',requestId);await m.confirmReservePayment(last,'owner');const retry=await m.newReservePayment(await order(o.id),140000,'bca_transfer','owner','Simulated verified settlement',requestId);assert.equal(last,retry);await m.confirmReservePayment(retry,'owner');assert.equal((await m.loyaltyCard(c.id)).stamps,1);assert.equal((await m.reserveSummary(await order(o.id))).payments.length,2);});

test('normal checkout and Reserve confirmation cannot both take the last piece',async()=>{const line=await seed('normal-reserve-race'),o=await reserve([line],50000),normal=await m.createCheckout({lines:[line]}),q=await m.quoteCheckout(new URL(normal.url,'https://elite.test').searchParams.get('catalog'));const result=await Promise.allSettled([m.confirmReservePayment(o.paymentId,'owner'),m.applyCheckoutSale({orderId:'EV-261014-BBBBBBBB',checkoutId:q.id})]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);const product=await m.readProduct(line.productId);assert.ok(product.groups[0].qty>=0);assert.equal(product.groups[0].qty-(product.groups[0].reservedQty||0),0);});

test('expiry releases sellable stock on the database clock without a scheduled job or admin action',async()=>{const line=await seed('no-job-expiry'),o=await reserve([line],50000);await m.confirmReservePayment(o.paymentId,'owner');const initial=await order(o.id);assert.equal(initial.reservation_deadline-initial.reservation_started_at,7*86400000);await client.execute({sql:'UPDATE orders SET reservation_deadline=? WHERE id=?',args:[Date.now()-1000,o.id]});assert.equal((await order(o.id)).reservation_status,'RESERVED');const product=await m.readProduct(line.productId);assert.equal(product.groups[0].qty,1);assert.equal(product.groups[0].reservedQty,0);assert.equal(m.publicProduct(product).groups[0].qty,1);assert.equal((await m.reserveSummary(await order(o.id))).status,'EXPIRED');assert.equal((await m.reserveSummary(await order(o.id))).totalPaid,50000);assert.ok((await m.createCheckout({lines:[line]})).url);assert.equal(await m.expireReservations(),1);assert.equal(await m.expireReservations(),0);assert.equal((await m.readProduct(line.productId)).groups[0].qty,1);});

async function colored(id){const navy=await seed(id,1,650000),blackId='g-'+id+'-black';const variants=[{id:crypto.randomUUID(),name:'Navy',hex:'#1D2A3A',swatchType:'COLOR',swatchImage:null,active:true,price:650000,condition:'Excellent',defects:'None',photoKey:'navy-photo',photoKeys:['navy-photo']},{id:crypto.randomUUID(),name:'Black',hex:'#111111',swatchType:'COLOR',swatchImage:null,active:true,price:850000,condition:'Very Good',defects:'Slight fading',photoKey:'black-photo',photoKeys:['black-photo']}];await client.execute({sql:'UPDATE products SET color_variants=?,default_color_variant_id=? WHERE id=?',args:[JSON.stringify(variants),variants[0].id,id]});await client.execute({sql:'UPDATE size_groups SET color_variant_id=? WHERE id=?',args:[variants[0].id,navy.groupId]});await client.execute({sql:'INSERT INTO size_groups(id,product_id,fits,qty,color_variant_id,length_cm,width_cm) VALUES(?,?,?,3,?,76,56)',args:[blackId,id,'["L"]',variants[1].id]});return {navy,black:{productId:id,groupId:blackId,quantity:1},variants};}
test('color selection isolates gallery, price, condition, minus and measurements; share retains selection and parent canonical',async()=>{const c=await colored('colors-view'),p=await m.readProduct(c.navy.productId),v=m.selectedColorProduct(p,c.variants[1].id);assert.equal(v.color,'Black');assert.equal(v.price,850000);assert.equal(v.condition,'Very Good');assert.equal(v.defects,'Slight fading');assert.deepEqual(v.photoKeys,['black-photo']);assert.equal(v.groups.length,1);assert.equal(v.groups[0].lengthCm,76);assert.equal(new URL(m.productShareUrl(v)).searchParams.get('color'),c.variants[1].id);assert.equal(new URL(m.productShareMetadata(v).alternates.canonical).search,'');assert.equal(m.productShareMetadata(v).openGraph.images[0].url.includes('black-photo'),true);assert.equal(m.selectedColorProduct(p,'invalid').color,'Navy');const rows=await m.readProducts();assert.equal(rows.filter(x=>x.id===p.id).length,1);const q=await m.createCheckout({lines:[c.black]}),quote=await m.quoteCheckout(new URL(q.url,'https://elite.test').searchParams.get('catalog'));assert.equal(quote.amount,850000);assert.match(quote.lines[0].label,/Color Black.*Fit L/);assert.equal(quote.lines[0].groupId,c.black.groupId);});
test('Navy Reserve locks only Navy; sold Navy remains viewable while Black stays purchasable',async()=>{const c=await colored('colors-reserve'),o=await reserve([c.navy],200000);await m.confirmReservePayment(o.paymentId,'owner');let p=await m.readProduct(c.navy.productId);assert.equal(m.isReserved(m.selectedColorProduct(p,c.variants[0].id)),true);assert.equal(m.availableGroups(m.selectedColorProduct(p,c.variants[1].id))[0].qty,3);assert.equal(m.isSold(p),false);await m.cancelReserve(o.id,'owner');await client.execute({sql:'UPDATE size_groups SET qty=0 WHERE id=?',args:[c.navy.groupId]});p=await m.readProduct(c.navy.productId);assert.equal(m.isSold(m.selectedColorProduct(p,c.variants[0].id)),true);assert.equal(m.isSold(p),false);assert.equal(m.publicProduct(p).colorVariants.length,2);assert.ok((await m.createCheckout({lines:[c.black]})).url);await assert.rejects(m.createCheckout({lines:[c.navy]}),/Stok/);});
test('inactive color cannot checkout or confirm an old normal selection; unrelated colors remain available',async()=>{const c=await colored('colors-inactive'),checkout=await m.createCheckout({lines:[c.black]}),q=await m.quoteCheckout(new URL(checkout.url,'https://elite.test').searchParams.get('catalog'));c.variants[1].active=false;await client.execute({sql:'UPDATE products SET color_variants=? WHERE id=?',args:[JSON.stringify(c.variants),c.navy.productId]});const p=await m.readProduct(c.navy.productId);assert.equal(m.publicProduct(p).colorVariants.length,1);assert.equal(m.publicProduct(p).groups.length,1);await assert.rejects(m.createCheckout({lines:[c.black]}),/Stok/);await assert.rejects(m.quoteCheckout(new URL(checkout.url,'https://elite.test').searchParams.get('catalog')),/tidak tersedia/);await assert.rejects(m.applyCheckoutSale({orderId:'EV-261014-CCCCCCCC',checkoutId:q.id}),/Stok/);assert.equal(m.availableGroups(p).length,1);});

test('admin saves independent color values and inherited prices safely; variant identity cannot be reassigned',async()=>{const c=await colored('colors-editor');const photos=[crypto.randomUUID(),crypto.randomUUID()];for(const key of photos)await client.execute({sql:"INSERT INTO photos(key,content_type,size,source,created_at) VALUES(?,'image/jpeg',100,'test',?)",args:[key,new Date().toISOString()]});let p=await m.readProduct(c.navy.productId);p.photoKey=photos[0];p.photoKeys=[photos[0]];p.colorVariants=p.colorVariants.map((v,i)=>({...v,photoKey:photos[i],photoKeys:[photos[i]]}));p.status='draft';p=await m.saveProduct(p,'owner');assert.equal(p.groups[1].price,850000);assert.equal(p.groups[1].colorPriceInherited,true);p.colorVariants[1].price=900000;p=await m.saveProduct(p,'owner');assert.equal(p.groups[1].price,900000);assert.equal(p.groups[0].price,650000);const rows=(await client.execute({sql:'SELECT price,color_variant_id FROM size_groups WHERE product_id=? ORDER BY id',args:[p.id]})).rows;assert.ok(rows.every(g=>g.price===null));const moved={...p,groups:p.groups.map(g=>({...g,colorVariantId:p.colorVariants[0].id}))};await assert.rejects(m.saveProduct(moved,'owner'),/tidak dapat dipindah/);const duplicate={...p,colorVariants:[p.colorVariants[0],p.colorVariants[0]]};await assert.rejects(m.saveProduct(duplicate,'owner'),/ganda/);const removed={...p,colorVariants:[p.colorVariants[0]]};await assert.rejects(m.saveProduct(removed,'owner'),/tidak dapat dihapus/);const saved=await m.readProduct(p.id);assert.equal(saved.version,p.version);assert.equal(saved.groups[1].price,900000);});
test('SOLD timestamp follows active colors while preserving inactive inventory',async()=>{const c=await colored('colors-sold-lifecycle');c.variants[1].active=false;await client.execute({sql:'UPDATE products SET color_variants=? WHERE id=?',args:[JSON.stringify(c.variants),c.navy.productId]});await client.execute({sql:'UPDATE size_groups SET qty=0 WHERE id=?',args:[c.navy.groupId]});let p=await m.readProduct(c.navy.productId);assert.ok(p.soldAt);assert.equal(m.isSold(p),true);assert.equal(p.groups.find(g=>g.id===c.black.groupId).qty,3);c.variants[1].active=true;await client.execute({sql:'UPDATE products SET color_variants=? WHERE id=?',args:[JSON.stringify(c.variants),p.id]});p=await m.readProduct(p.id);assert.equal(p.soldAt,null);assert.equal(m.isSold(p),false);});

test('scoped detail snapshot includes both carts, keeps fresh stock and excludes drafts without loading unrelated inventory',async()=>{const a=await seed('scoped-main'),b=await seed('scoped-cart'),c=await seed('scoped-reserve'),draft=await seed('scoped-draft');await client.execute({sql:"UPDATE products SET status='draft' WHERE id=?",args:[draft.productId]});const values={'elite.catalog.cart':JSON.stringify([b,b]),'elite.reserve.cart':JSON.stringify([c])},ids=m.selectionIds(a.productId,k=>values[k]??null);assert.deepEqual(ids,['scoped-cart','scoped-main','scoped-reserve']);assert.deepEqual(m.selectionIds(a.productId,()=>{throw Error('Storage disabled')}),[a.productId]);const path=m.selectionPath([...ids,draft.productId,'missing']);const read=etag=>m.selectionGet(new Request('https://elite.test'+path,{headers:etag?{'If-None-Match':etag}:{}}));const response=await read(),data=await response.json();assert.equal(response.status,200);assert.equal(data.products.length,3);assert.ok(data.products.every(p=>!p.id.includes('draft')));assert.ok(!data.products.some(p=>p.id==='colors-view'));assert.equal((await read(response.headers.get('ETag'))).status,304);await client.execute({sql:'UPDATE size_groups SET qty=0 WHERE id=?',args:[b.groupId]});const changed=await read(response.headers.get('ETag'));assert.equal(changed.status,200);assert.equal((await changed.json()).products.find(p=>p.id===b.productId).groups[0].qty,0);const o=await reserve([c],50000);await m.confirmReservePayment(o.paymentId,'owner');assert.equal((await (await read()).json()).products.find(p=>p.id===c.productId).groups[0].qty,0);await client.execute({sql:'UPDATE orders SET reservation_deadline=? WHERE id=?',args:[Date.now()-1000,o.id]});assert.equal((await (await read()).json()).products.find(p=>p.id===c.productId).groups[0].qty,1);assert.equal((await m.selectionGet(new Request('https://elite.test/api/catalog/selection?ids=x%27%20OR%201'))).status,400);assert.equal((await m.selectionGet(new Request('https://elite.test/api/catalog/selection?ids='+Array.from({length:42},(_,i)=>'p'+i).join(',')))).status,400);});

test('guest initial DP uses its existing session before proof, while invoice/member/bearer authorization stays enforced',async()=>{
 const line=await seed('guest-initial-proof'),o=await reserve([line],50000);
 await client.execute({sql:"UPDATE orders SET proof_key=NULL,proof_mime=NULL,proof_received_at=NULL,status='awaiting_proof',payment_state='awaiting_proof' WHERE id=?",args:[o.id]});
 await client.execute({sql:"UPDATE reserve_payments SET state='awaiting_proof',proof_key=NULL,submitted_at=NULL WHERE id=?",args:[o.paymentId]});
 const initial=await order(o.id),url='https://elite.test'+m.reserveRequestPath(initial);
 assert.equal(m.reserveRequestPath(initial),'/api/reserve');
 assert.equal(m.reserveRequestPath(initial,'',true),'/api/reserve?invoice='+o.id);
 assert.equal(m.reserveRequestPath(initial,'bearer'),'/api/reserve?invoice='+o.id);
 assert.equal((await m.reserveGet(new Request(url,{headers:{cookie:o.cookie}}))).status,200);
 assert.equal((await m.reserveGet(new Request(url))).status,404);
 assert.equal((await m.reserveGet(new Request(url+'?invoice='+o.id,{headers:{cookie:o.cookie}}))).status,404);
 const png=new Uint8Array(80);png.set([137,80,78,71,13,10,26,10]);const form=new FormData();form.set('file',new File([png],'SIMULATION.png',{type:'image/png'}));form.set('paymentId',o.paymentId);form.set('paymentMethod','bca_transfer');
 const result=await m.reserveProof(new Request(url.replace('/api/reserve','/api/reserve/proof'),{method:'POST',headers:{origin:'https://elite.test',cookie:o.cookie},body:form}));assert.equal(result.status,200);
 const value=await result.json();assert.equal(value.reservation.payments[0].state,'submitted');assert.equal(value.reservation.status,'AWAITING_DEPOSIT');assert.equal(value.reservation.totalPaid,0);assert.equal((await m.readProduct(line.productId)).groups[0].qty,1);assert.equal((await m.readProduct(line.productId)).groups[0].reservedQty,0);
 assert.equal(m.reserveRequestPath(await order(o.id)),'/api/reserve?invoice='+o.id);
});

async function pendingSettlement(key,amount){
 const line=await seed(key),o=await reserve([line],50000);
 await m.confirmReservePayment(o.paymentId,'owner');
 const id=await m.newReservePayment(await order(o.id),amount,'bca_transfer');
 const submitted=Date.now()-10000,deadline=submitted+1;
 await client.execute({sql:'UPDATE orders SET reservation_deadline=? WHERE id=?',args:[deadline,o.id]});
 await client.execute({sql:"UPDATE reserve_payments SET state='submitted',submitted_at=?,proof_key='fixture-proof' WHERE id=?",args:[submitted,id]});
 return {o,line,id,deadline};
}

test('timely full proof retains the hold and can settle after deadline without overselling',async()=>{
 const {o,line,id}=await pendingSettlement('timely-full',140000);
 assert.equal((await m.reserveSummary(await order(o.id))).reviewAfterDeadline,true);
 await m.expireReservations();
 assert.equal((await m.readProduct(line.productId)).groups[0].reservedQty,1);
 await assert.rejects(m.createCheckout({lines:[line]}),/Stok/);
 await assert.rejects(client.execute({sql:'UPDATE size_groups SET qty=0 WHERE id=?',args:[line.groupId]}),/locked/);
 await assert.rejects(client.execute({sql:'DELETE FROM size_groups WHERE id=?',args:[line.groupId]}),/locked/);
 await assert.rejects(m.cancelReserve(o.id,'owner'),/Periksa bukti/);
 await m.confirmReservePayment(id,'owner');
 await m.confirmReservePayment(id,'owner');
 await m.expireReservations();
 assert.equal((await order(o.id)).reservation_status,'PAID');
 assert.equal((await m.readProduct(line.productId)).groups[0].qty,0);
 assert.equal((await client.execute({sql:'SELECT COUNT(*) AS n FROM catalog_sales WHERE order_id=?',args:[o.id]})).rows[0].n,1);
});

test('rejected or insufficient timely proof releases the hold without a merchandise sale',async()=>{
 for(const outcome of ['rejected','insufficient']){
  const {o,line,id}=await pendingSettlement('timely-'+outcome,20000);
  await assert.rejects(m.rejectReservePayment(id,'customer','awaiting_proof'),/ditolak/);
  if(outcome==='rejected')await m.rejectReservePayment(id,'owner');
  else await m.confirmReservePayment(id,'owner');
  const s=await m.reserveSummary(await order(o.id));
  assert.equal(s.status,'EXPIRED');
  assert.equal(s.forfeitedAmount,outcome==='rejected'?50000:70000);
  assert.equal((await m.readProduct(line.productId)).groups[0].reservedQty,0);
  assert.equal((await client.execute({sql:'SELECT * FROM catalog_sales WHERE order_id=?',args:[o.id]})).rows.length,0);
 }
});

test('post-deadline proof cannot restore a hold',async()=>{
 const {o,line,id,deadline}=await pendingSettlement('late-proof',140000);
 await client.execute({sql:'UPDATE reserve_payments SET submitted_at=? WHERE id=?',args:[deadline+1,id]});
 await assert.rejects(m.confirmReservePayment(id,'owner'),/sebelum batas/);
 await m.expireReservations();
 assert.equal((await m.reserveSummary(await order(o.id))).forfeitedAmount,50000);
 assert.equal((await m.readProduct(line.productId)).groups[0].reservedQty,0);
});

test('a stale admin cancellation cannot bypass expiry and the forfeiture ledger',async()=>{
 const o=await reserve([await seed('stale-cancel')],50000);
 await m.confirmReservePayment(o.paymentId,'owner');
 await client.execute({sql:'UPDATE orders SET reservation_deadline=? WHERE id=?',args:[Date.now()-1,o.id]});
 await m.cancelReserve(o.id,'owner');
 const s=await m.reserveSummary(await order(o.id));
 assert.equal(s.status,'EXPIRED');
 assert.equal(s.forfeitedAmount,50000);
});

async function memberForVoucher(){
 const account=await m.registerCustomer({name:'Simulated Buyer',identity:'reserve-voucher@example.test',password:'SIMULATED_BUYER_PASSWORD_123',consent:true},null);
 const cookie='elite_customer='+account.token;
 return {cookie,id:(await m.currentCustomer(cookie)).id};
}

async function createDiscountedReserve(line,deposit,cookie,expectedDiscount,choice='auto'){
 const checkout=await m.createCheckout({mode:'reserve',lines:[line]});
 const token=new URL(checkout.url,'https://elite.test').searchParams.get('catalog');
 const quote=await m.quoteCheckout(token);
 const request=new Request('https://elite.test/api/order',{headers:{cookie}});
 return m.createReserveOrder(request,{
  name:'Simulated Buyer',phone:'081234567890',address:'Simulated address number 10',postcode:'12345',
  item:'Simulated item',quantity:1,items:['Simulated item'],itemAmount:quote.amount
 },quote,{amount:25000,paymentMode:'prepaid',courier:'jnt',service:'EZ',grams:1000,destination:{label:'Simulated'}},
 deposit,'bca_transfer',token,choice,expectedDiscount);
}

async function confirmFixtureDeposit(o){
 const paymentId=o.reservation.payments[0].id;
 await client.execute({sql:"UPDATE orders SET proof_key='fixture-proof',status='submitted' WHERE id=?",args:[o.id]});
 await client.execute({sql:"UPDATE reserve_payments SET state='submitted',proof_key='fixture-proof',submitted_at=? WHERE id=?",args:[Date.now(),paymentId]});
 await m.confirmReservePayment(paymentId,'owner');
}

const firstClaim=orderId=>client.execute({sql:'SELECT redeemed_at FROM first_purchase_discounts WHERE order_id=?',args:[orderId]}).then(r=>r.rows[0]);
const voucherClaim=orderId=>client.execute({sql:'SELECT redeemed_at FROM purchase_voucher_claims WHERE order_id=?',args:[orderId]}).then(r=>r.rows[0]);

test('automatic first-purchase discount sets net DP and top-up, and redeems only on verified settlement',async()=>{
 const buyer=await memberForVoucher();
 const line=await seed('first-reserve-voucher',1,400000);
 await assert.rejects(createDiscountedReserve(line,95000,buyer.cookie,0),/Diskon berubah/);
 assert.equal((await client.execute('SELECT COUNT(*) AS n FROM orders')).rows[0].n,0);
 await assert.rejects(createDiscountedReserve(line,94999,buyer.cookie,20000),/DP minimum/);

 const o=await (await createDiscountedReserve(line,95000,buyer.cookie,20000)).json();
 assert.equal(o.discount_voucher_id,'first-purchase-5');
 assert.equal(o.item_subtotal,400000);
 assert.equal(o.item_amount,380000);
 assert.equal(o.total,405000);
 assert.equal(o.reservation.depositMinimum,95000);
 assert.equal((await firstClaim(o.id)).redeemed_at,null);
 const another=await seed('duplicate-first-reserve',1,400000);
 await assert.rejects(createDiscountedReserve(another,95000,buyer.cookie,20000),/Diskon berubah/);

 await confirmFixtureDeposit(o);
 const active=await m.reserveSummary(await order(o.id));
 assert.equal(active.extension.requiredTopUp,95000);
 assert.equal(active.remaining,310000);
 assert.equal((await firstClaim(o.id)).redeemed_at,null);
 const payment=await m.newReservePayment(await order(o.id),active.remaining,'bca_transfer','owner','Verified fixture balance');
 await m.confirmReservePayment(payment,'owner');
 const redeemed=(await firstClaim(o.id)).redeemed_at;
 assert.ok(redeemed);
 await m.confirmReservePayment(payment,'owner');
 assert.equal((await firstClaim(o.id)).redeemed_at,redeemed);
 assert.equal((await order(o.id)).total,405000);
});

test('highest eligible voucher is locked, remains priced past voucher expiry, and releases on Reserve expiry',async()=>{
 const buyer=await memberForVoucher();
 const line=await seed('personal-reserve-voucher',2,400000);
 await client.execute({sql:`INSERT INTO purchase_vouchers(id,label,owner_user_id,type,fixed_amount,minimum_order,usage_limit,valid_from,valid_until)
 VALUES('voucher-fixture','Simulated voucher',?,'fixed',80000,300000,1,0,?)`,args:[buyer.id,Date.now()+86400000]});
 const o=await (await createDiscountedReserve(line,80000,buyer.cookie,80000)).json();
 assert.equal(o.discount_voucher_id,'voucher-fixture');
 assert.equal(o.reservation.orderValue,320000);
 assert.equal((await voucherClaim(o.id)).redeemed_at,null);
 assert.equal(await firstClaim(o.id),undefined);
 await assert.rejects(createDiscountedReserve(line,80000,buyer.cookie,80000,'voucher-fixture'),/Reward sudah tidak berlaku/);
 await confirmFixtureDeposit(o);
 await client.execute("UPDATE purchase_vouchers SET valid_until=1 WHERE id='voucher-fixture'");
 const active=await order(o.id);
 assert.equal(active.total,345000);
 assert.equal((await m.reserveSummary(active)).remaining,265000);
 await m.expireReservations(active.reservation_deadline);
 assert.equal(await voucherClaim(o.id),undefined);
 assert.equal((await m.reserveSummary(await order(o.id))).forfeitedAmount,80000);
 assert.equal((await client.execute("SELECT usage_count FROM purchase_vouchers WHERE id='voucher-fixture'")).rows[0].usage_count,0);
});

test('a discounted Reserve below Rp50.000 creates no invoice or voucher claim',async()=>{
 const buyer=await memberForVoucher();
 await assert.rejects(createDiscountedReserve(await seed('small-reserve',1,50000),50000,buyer.cookie,2500),/pembayaran penuh/);
 assert.equal((await client.execute('SELECT COUNT(*) AS n FROM orders')).rows[0].n,0);
 assert.equal((await client.execute('SELECT COUNT(*) AS n FROM first_purchase_discounts')).rows[0].n,0);
});

test('cancelling a discounted Reserve releases the first purchase reward',async()=>{
 const buyer=await memberForVoucher();
 const line=await seed('cancel-reserve-voucher',1,400000);
 const first=await (await createDiscountedReserve(line,95000,buyer.cookie,20000)).json();
 await m.cancelReserve(first.id,'owner');
 assert.equal(await firstClaim(first.id),undefined);
 const second=await (await createDiscountedReserve(line,95000,buyer.cookie,20000)).json();
 assert.equal(second.discount_amount,20000);
});
