// Run with a local snapshot of the public catalog. Every mutation uses a temporary database.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {migrate} from '../scripts/migration-core.mjs';
import {hashPassword} from '../lib/auth/password.mjs';
const snapshot=process.argv[2];if(!snapshot)throw Error('Pass the path to a public catalog snapshot.');
const catalog=JSON.parse(await readFile(snapshot,'utf8'));assert.ok(catalog.products?.length);
const temporary=await mkdtemp(path.join(os.tmpdir(),'elite-all-products-'));
const origin='https://elite.test',png=new Uint8Array(80);png.set([137,80,78,71,13,10,26,10]);
Object.assign(process.env,{TURSO_DATABASE_URL:'file:'+path.join(temporary,'test.db'),SITE_ORIGIN:origin,ADMIN_EMAIL:'owner@elite.test',ADMIN_PASSWORD_HASH:await hashPassword('SIMULATED_OWNER_PASSWORD_123'),AUTH_SECRET:'a'.repeat(64),CONFIG_SECRET:'b'.repeat(64),TEAM_ACCESS_SECRET:'c'.repeat(64),RAJAONGKIR_CONFIG_SECRET:'d'.repeat(64),LOCAL_STORAGE_PATH:path.join(temporary,'files'),STORAGE_DRIVER:'local',PAYMENT_BCA_ACCOUNT_NUMBER:'1234567890',PAYMENT_BCA_ACCOUNT_HOLDER:'PEMILIK SIMULASI',PAYMENT_QRIS_KEY:'qris/simulation',PAYMENT_QRIS_MIME:'image/png',PAYMENT_QRIS_MERCHANT:'MERCHANT SIMULASI',PAYMENT_QRIS_SHA256:createHash('sha256').update(png).digest('hex')});
for(const key of ['VERCEL','TURSO_AUTH_TOKEN','BLOB_READ_WRITE_TOKEN','BLOB_STORE_ID','RAJAONGKIR_API_KEY'])delete process.env[key];
await mkdir('.test-runtime/tests',{recursive:true});
const output=path.resolve('.test-runtime/tests/all-products-flow.mjs');
await build({stdin:{contents:`
 export * from './lib/database';export {storage} from './lib/storage';
 export {readProduct} from './modules/catalog/server';export {publicProduct} from './modules/catalog/catalog-types';
 export {encrypt} from './modules/order/order-server';
 export {checkoutDestination} from './modules/catalog/checkout-navigation';
 export {cartAvailability,cartSummary} from './modules/catalog/cart-availability';
 export {catalogReturnHref,resumeCatalogSelection} from './modules/order/checkout-session';
 export {reconcileReturnedCart} from './modules/catalog/cart-return';
 export {POST as ownerLogin} from './app/api/auth/owner/route';
 export {POST as ongkirPost} from './app/api/ongkir/route';
 export {POST as checkoutPost} from './app/api/checkout/route';
 export {GET as orderCatalog} from './app/api/order/catalog/route';
 export {POST as shippingPost} from './app/api/shipping/route';
 export {GET as orderGet,POST as orderPost,PATCH as paymentPatch,DELETE as orderDelete} from './app/api/order/route';
 export {POST as proofPost} from './app/api/order/proof/route';
 export {GET as invoiceGet} from './app/api/order/invoice/route';
 export {GET as configGet} from './app/api/config/route';
`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:output,external:['@libsql/client','@vercel/blob','@hyzyla/pdfium'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'next-node',setup(b){b.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path+'.js',external:true}));}}]});
const m=await import(pathToFileURL(output)),d=m.getDatabase(),client=m.getSqlClient();
const originalFetch=globalThis.fetch;let providerCalls=0,mockNotifications=0;
const destination={id:90,label:'TENGAH, PONTIANAK KOTA, PONTIANAK, 78243',province_name:'KALIMANTAN BARAT',city_name:'PONTIANAK',district_name:'PONTIANAK KOTA',subdistrict_name:'TENGAH',zip_code:'78243'};
const originLocation={id:10,label:'BALEENDAH, BANDUNG, 40375',province_name:'JAWA BARAT',city_name:'BANDUNG',district_name:'BALEENDAH',subdistrict_name:'BALEENDAH',zip_code:'40375'};
globalThis.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input.url);
 if(url.origin==='https://rajaongkir.komerce.id'){
  providerCalls++;assert.equal(init.headers.key,'SIMULATED_RATE_KEY');
  if(url.pathname.endsWith('domestic-destination'))return Response.json({meta:{code:200},data:[url.searchParams.get('search')==='Baleendah'?originLocation:destination]});
  const form=new URLSearchParams(init.body);assert.equal(form.get('destination'),'90');assert.equal(form.get('origin'),'10');
  return Response.json({meta:{code:200},data:[{code:'jnt',service:'EZ',description:'Regular',cost:38000*Math.ceil(Number(form.get('weight'))/1000),etd:'3–5 hari'}]});
 }
 if(url.origin==='https://api.telegram.org'){
  assert.ok(url.pathname.startsWith('/botSIMULATED_BOT_TOKEN/'));
  if(url.pathname.endsWith('sendMessage')||url.pathname.endsWith('sendDocument')){mockNotifications++;return Response.json({ok:true,result:{message_id:50}});}
  return Response.json({ok:true,result:true});
 }
 throw Error('External HTTP is disabled in this test: '+url.origin);
};
const request=(route,data,cookie='',method=data===undefined?'GET':'POST')=>new Request(origin+route,{method,headers:{Origin:origin,...(data===undefined?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
const read=async(response,status=200)=>{const value=await response.json();assert.equal(response.status,status,JSON.stringify(value));return value;};
const rows=[];
try{
 await migrate(client,new URL('../migrations/',import.meta.url));
 await m.storage.put('qris/simulation',png,{httpMetadata:{contentType:'image/png'}});
 const login=await m.ownerLogin(request('/api/auth/owner',{email:'owner@elite.test',password:'SIMULATED_OWNER_PASSWORD_123'}));await read(login);const ownerCookie=login.headers.get('set-cookie').split(';')[0];
 await read(await m.ongkirPost(request('/api/ongkir',{action:'connect',key:'SIMULATED_RATE_KEY'},ownerCookie)));
 await m.configGet();
 await d.prepare("INSERT INTO settings(id,bot_cipher,chat_id,webhook_cipher,webhook_active) VALUES(1,?,'12345',?,1) ON CONFLICT(id) DO UPDATE SET bot_cipher=excluded.bot_cipher,chat_id=excluded.chat_id,webhook_cipher=excluded.webhook_cipher,webhook_active=1").bind(await m.encrypt('SIMULATED_BOT_TOKEN'),await m.encrypt('SIMULATED_WEBHOOK_SECRET')).run();
 assert.equal((await read(await m.configGet())).ready,true);
 const now=new Date().toISOString();
 for(const p of catalog.products){
  await d.prepare("INSERT INTO products(id,shortcode,instagram_url,name,brand,category,color,price,condition,defects,photo_key,description,caption,feature_ids,created_at,updated_at,published_at,status) VALUES(?,?,'',?,?,?,?,?,?,?,?,?,'',?,?,?,?,'published')").bind(p.id,'simulation_'+p.id,p.name,p.brand,p.category,p.color,p.price,p.condition,p.defects,p.photoKey,p.description??'',JSON.stringify(p.features??[]),now,now,now).run();
  for(const g of p.groups)await d.prepare('INSERT INTO size_groups(id,product_id,label,tag_size,fits,length_cm,width_cm,qty,price,condition,defects,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(g.id,p.id,g.label??'',g.tagSize??'',JSON.stringify(g.fits),g.lengthCm,g.widthCm,g.qty,g.price,g.condition,g.defects,0).run();
 }
 await read(await m.shippingPost(request('/api/shipping',{action:'search',query:'78243'})));
 const initialStock=(await client.execute('SELECT id,qty FROM size_groups ORDER BY id')).rows;
 const scenarios=catalog.products.flatMap(p=>p.groups.filter(g=>g.qty>0).map(g=>({label:p.brand+' · '+p.name+' · '+g.fits.join('/'),lines:[{productId:p.id,groupId:g.id,quantity:1}],amount:g.price??p.price})));
 const combined=catalog.products.slice(0,20).map(p=>({productId:p.id,groupId:p.groups.find(g=>g.qty>0).id,quantity:1}));
 scenarios.push({label:'Combined basket: '+combined.length+' products',lines:combined,amount:combined.reduce((sum,l)=>{const p=catalog.products.find(p=>p.id===l.productId),g=p.groups.find(g=>g.id===l.groupId);return sum+(g.price??p.price);},0)});
 for(const [index,scenario] of scenarios.entries()){
  // Each scenario is a separate buyer; local requests otherwise share the same rate bucket.
  await client.execute('DELETE FROM limits');await client.execute('DELETE FROM request_limits');
  const checkout=await read(await m.checkoutPost(request('/api/checkout',{lines:scenario.lines,amount:1})),201);
  const basket=crypto.randomUUID(),target=m.checkoutDestination(checkout.url,origin,basket),token=target.searchParams.get('catalog');
  const selection=await read(await m.orderCatalog(request('/api/order/catalog?token='+token)));
  assert.equal(selection.amount,scenario.amount);assert.equal(selection.lines.length,scenario.lines.length);
  const restored=scenario.lines.map(l=>({...l,name:'Selected product',label:'Selected size'})),view=m.cartAvailability(restored,catalog.products,false);assert.equal(m.cartSummary(view).canCheckout,true);
  const rates=await read(await m.shippingPost(request('/api/shipping',{action:'rates',destinationId:90,catalogToken:token,grams:1,quantity:1}))),quote=rates.quotes[0];
  const quantity=scenario.lines.reduce((sum,l)=>sum+l.quantity,0),grams=Math.ceil(quantity/3)*1000;assert.equal(quote.grams,grams);
  const payload={name:'PEMBELI SIMULASI '+index,phone:'081234567890',address:'Alamat simulasi lengkap untuk pengujian lokal',postcode:'78243',consent:true,itemAmount:1,catalogToken:token,quoteId:quote.id};
  const response=await m.orderPost(request('/api/order',payload)),order=await read(response,201),cookie=response.headers.get('set-cookie').split(';')[0];
  assert.equal(order.item_amount,scenario.amount);assert.equal(order.total,scenario.amount+quote.amount);assert.equal(order.quantity,quantity);assert.equal(order.status,'awaiting_proof');
  assert.equal((await m.invoiceGet(request('/api/order/invoice',undefined,cookie))).status,409);
  // A customer can edit details before payment; this keeps the same invoice.
  const edited=await read(await m.orderPost(request('/api/order',{...payload,address:'Alamat simulasi diperbarui sebelum membayar'},cookie)));assert.equal(edited.id,order.id);
  for(const method of ['qris_dana','bca_transfer']){
   const changed=await read(await m.paymentPatch(request('/api/order',{paymentMethod:method},cookie,'PATCH')));assert.equal(changed.total,order.total);assert.equal(changed.payment_method,method);assert.equal(changed.confirmed_at,null);
  }
  const form=new FormData();form.set('paymentMethod','bca_transfer');form.set('file',new Blob([png],{type:'image/png'}),'simulated-proof.png');
  const submitted=await read(await m.proofPost(new Request(origin+'/api/order/proof',{method:'POST',headers:{Origin:origin,Cookie:cookie},body:form})));assert.equal(submitted.status,'submitted');assert.equal(submitted.payment_state,'proof_received');assert.equal(submitted.confirmed_at,null);assert.equal(submitted.notify_status,'sent');
  const saved=await read(await m.orderGet(request('/api/order',undefined,cookie)));assert.equal(saved.id,order.id);assert.equal(saved.total,order.total);
  const invoice=await m.invoiceGet(request('/api/order/invoice',undefined,cookie));assert.equal(invoice.status,200);const text=await invoice.text();assert.ok(text.includes(order.id));for(const line of selection.lines)assert.ok(text.includes(line.name));
  const href=m.catalogReturnHref(saved,target.search),returned=m.reconcileReturnedCart(restored,{id:basket,lines:scenario.lines},href.slice(href.indexOf('#')));assert.equal(returned.completed,true);assert.equal(returned.cart.length,0);
  assert.deepEqual((await client.execute('SELECT id,qty FROM size_groups ORDER BY id')).rows,initialStock);
  rows.push({scenario:scenario.label,checkout:true,shipping:true,paymentMethods:true,proof:true,invoice:true,returnToShop:true,stockUnchanged:true});
 }
 assert.equal((await d.prepare('SELECT COUNT(*) AS count FROM shipments').first()).count,0);
 await new Promise(resolve=>process.stdout.write(JSON.stringify({passed:true,products:catalog.products.length,scenarios:rows.length,providerCalls,mockNotifications,liveOrders:0,liveMessages:0,rows},null,2)+'\n',resolve));
}finally{
 globalThis.fetch=originalFetch;client.close();await rm(output,{force:true});
 if(path.dirname(path.resolve(temporary))!==path.resolve(os.tmpdir())||!path.basename(temporary).startsWith('elite-all-products-'))throw Error('Unexpected cleanup target');
 await rm(temporary,{recursive:true,force:true,maxRetries:10,retryDelay:200});
}
// Next's server runtime can retain timers; this standalone audit has finished all work and cleanup.
process.exit(0);
