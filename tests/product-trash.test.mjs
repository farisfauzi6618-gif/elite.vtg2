import test,{beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';
import {migrate} from '../scripts/migration-core.mjs';import {hashPassword} from '../lib/auth/password.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'elite-product-trash-'));
Object.assign(process.env,{TURSO_DATABASE_URL:'file::memory:',TURSO_AUTH_TOKEN:'',SITE_ORIGIN:'https://elite.test',ADMIN_EMAIL:'owner@elite.test',ADMIN_PASSWORD_HASH:await hashPassword('SIMULATED_TRASH_OWNER_123'),AUTH_SECRET:'a'.repeat(64),CONFIG_SECRET:'b'.repeat(64),TEAM_ACCESS_SECRET:'c'.repeat(64),STORAGE_DRIVER:'local',LOCAL_STORAGE_PATH:path.join(dir,'files'),BLOB_READ_WRITE_TOKEN:'',BLOB_STORE_ID:''});delete process.env.VERCEL;
await mkdir('.test-runtime/tests',{recursive:true});const output=path.resolve('.test-runtime/tests/product-trash.mjs');
await build({stdin:{contents:`export {getSqlClient} from './lib/database';export {storage} from './lib/storage';export {loginOwner,ownerCookie} from './lib/auth/owner';export {readProduct,readProducts} from './modules/catalog/server';export {createCheckout,quoteCheckout} from './modules/catalog/checkout';export {saveProduct,changeStock,undoStock} from './modules/catalog/catalog-service';export {setFeatured} from './modules/catalog/featured-server';export {trashProduct,restoreProduct} from './modules/catalog/product-trash';export {GET as adminGet,POST as adminPost} from './app/api/admin/katalog/route';export {GET as publicImage} from './app/api/product-images/[key]/route';export {GET as privateImage} from './app/api/photos/[key]/route';export {GET as productGet} from './app/api/products/[id]/route';export {GET as selection} from './app/api/catalog/selection/route';export {api as orderBoundary} from './modules/order/order-server';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:output,banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'next',setup(b){b.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path+'.js',external:true}))}}]});
const m=await import(pathToFileURL(output)),client=m.getSqlClient();await migrate(client,new URL('../migrations/',import.meta.url));
let cookie;const key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='simulated-product',image=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(997)]);
const req=(route,body,cookieValue=cookie,origin='https://elite.test')=>new Request('https://elite.test'+route,{method:body===undefined?'GET':'POST',headers:{Origin:origin,Cookie:cookieValue??'','Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const context=value=>({params:Promise.resolve(value)});
const trash=(p)=>m.trashProduct({id:p.id,version:p.version,confirmed:true},'test-owner');
beforeEach(async()=>{
 for(const table of ['reserve_payments','reserve_audit','reserve_items','catalog_sales','stock_history','orders','catalog_checkouts','size_groups','products','photos','owner_sessions','admin_access'])await client.execute('DELETE FROM '+table);
 const token=await m.loginOwner(req('/'),{email:'owner@elite.test',password:'SIMULATED_TRASH_OWNER_123'});cookie=m.ownerCookie(req('/'),token).split(';')[0];
});
after(async()=>{client.close();global.gc?.();await new Promise(r=>setTimeout(r,100));assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elite-product-trash-'));await rm(dir,{recursive:true,force:true,maxRetries:8,retryDelay:200});await rm(output,{force:true})});
async function seed(status='draft'){
 const now=new Date().toISOString();await client.execute({sql:"INSERT INTO products(id,shortcode,instagram_url,name,brand,category,color,price,condition,defects,photo_key,photo_keys,description,created_at,updated_at,published_at,status,reviewed,is_featured) VALUES(?,?,'','Simulated Polo','Polo Ralph Lauren','Polo','Navy',200000,'Excellent','None',?,?,'Full description',?,?,?,?,1,1)",args:[id,id,key,JSON.stringify([key]),now,now,status==='published'?now:null,status]});
 await client.execute({sql:"INSERT INTO size_groups(id,product_id,label,fits,qty,length_cm,width_cm) VALUES('g-simulated',?,'M','[\"M\"]',2,65,50)",args:[id]});
 await client.execute({sql:"INSERT INTO photos(key,content_type,size,source,created_at) VALUES(?,'image/jpeg',?,'test',?)",args:[key,image.length,now]});await m.storage.put(key,image,{httpMetadata:{contentType:'image/jpeg'}});return m.readProduct(id);
}
async function checkout(){const p=await m.readProduct(id),result=await m.createCheckout({lines:[{productId:id,groupId:p.groups[0].id,quantity:1}]});const token=new URL(result.url,'https://elite.test').searchParams.get('catalog'),quote=await m.quoteCheckout(token);return {token,checkoutId:quote.id}}
async function order(checkoutId,{status='awaiting_proof',type='normal',reservation=null,sync='pending'}={}){const oid=crypto.randomUUID();await client.execute({sql:"INSERT INTO orders(id,session_hash,created_at,name,phone,address,postcode,item,total,status,catalog_checkout_id,order_type,reservation_status,stock_sync_state) VALUES(?,'test',?,'Simulated Buyer','081234567890','Simulated Address','12345','Simulated Polo',200000,?,?,?,?,?)",args:[oid,Date.now(),status,checkoutId,type,reservation,sync]});return oid}

test('draft deletion is recoverable, idempotent and absent from normal admin lists',async()=>{
 const p=await seed(),reply=await m.adminPost(req('/api/admin/katalog',{op:'trash',id,version:p.version,confirmed:true}));assert.equal(reply.status,200);
 assert.equal((await m.readProducts(true,true)).length,0);const bin=await(await m.adminGet(req('/api/admin/katalog?view=trash'))).json();assert.equal(bin.products.length,1);assert.ok(bin.products[0].deletedAt);assert.equal(bin.products[0].isFeatured,false);
 assert.equal((await client.execute('SELECT COUNT(*) n FROM products')).rows[0].n,1);assert.equal((await client.execute('SELECT qty FROM size_groups')).rows[0].qty,2);assert.equal((await client.execute('SELECT COUNT(*) n FROM photos')).rows[0].n,1);
 await trash(p);assert.equal((await client.execute('SELECT version FROM products')).rows[0].version,p.version+1);
 const restored=await m.adminPost(req('/api/admin/katalog',{op:'restore',id,version:bin.products[0].version}));assert.equal(restored.status,200);const full=await m.readProduct(id);assert.equal(full.status,'draft');assert.equal(full.reviewed,false);assert.equal(full.price,p.price);assert.deepEqual(full.photoKeys,p.photoKeys);assert.equal(full.description,p.description);assert.deepEqual(full.groups,p.groups);assert.equal((await m.readProducts(true,true,true)).length,0);
});
test('published deletion removes public access, checkout and origin photo access while keeping owner photos',async()=>{
 const p=await seed('published'),c=await checkout();assert.equal((await m.publicImage(req('/api/product-images/'+key+'?size=thumb',undefined,''),context({key}))).status,200);await trash(p);
 assert.equal((await m.readProducts()).length,0);assert.equal((await m.productGet(req('/api/products/'+id,undefined,''),context({id}))).status,404);const selection=await(await m.selection(req('/api/catalog/selection?ids='+id,undefined,''))).json();assert.equal(selection.products.length,0);
 assert.equal((await m.publicImage(req('/api/product-images/'+key+'?size=thumb',undefined,''),context({key}))).status,404);assert.equal((await m.privateImage(req('/api/photos/'+key),context({key}))).status,200);
 await assert.rejects(m.quoteCheckout(c.token),e=>e.status===404);await assert.rejects(m.createCheckout({lines:[{productId:id,groupId:'g-simulated',quantity:1}]}),e=>e.status===404);
});
test('authentication, CSRF, confirmation, stale versions and missing products cannot delete inventory',async()=>{
 const p=await seed(),payload={op:'trash',id,version:p.version,confirmed:true};assert.equal((await m.adminPost(req('/api/admin/katalog',payload,''))).status,401);assert.equal((await m.adminGet(req('/api/admin/katalog?view=trash',undefined,''))).status,401);assert.equal((await m.adminPost(req('/api/admin/katalog',payload,cookie,'https://evil.test'))).status,403);
 assert.equal((await m.adminPost(req('/api/admin/katalog',{...payload,confirmed:false}))).status,400);await assert.rejects(m.trashProduct({...payload,version:99},'owner'),e=>e.status===409);await assert.rejects(m.trashProduct({...payload,id:'missing'},'owner'),e=>e.status===404);assert.equal((await m.readProducts(true)).length,1);
});
test('pending normal invoice and confirmed payment awaiting stock synchronization block deletion',async()=>{
 const p=await seed('published'),c=await checkout(),oid=await order(c.checkoutId);await assert.rejects(trash(p),e=>e.status===409&&e.detail.activeOrder);
 await client.execute({sql:"UPDATE orders SET status='submitted',payment_state='payment_confirmed' WHERE id=?",args:[oid]});await assert.rejects(trash(p),e=>e.status===409);assert.equal((await m.readProduct(id)).status,'published');
});
test('Reserve invoices and active holds block deletion even without a catalog snapshot link',async()=>{
 const p=await seed('published'),c=await checkout(),oid=await order(c.checkoutId,{type:'reserve',reservation:'AWAITING_DEPOSIT'});await assert.rejects(trash(p),e=>e.status===409);
 await client.execute({sql:"UPDATE orders SET catalog_checkout_id=NULL,reservation_status='RESERVED',reservation_deadline=? WHERE id=?",args:[Date.now()+86400000,oid]});await client.execute({sql:"INSERT INTO reserve_items(order_id,product_id,group_id,quantity) VALUES(?,?,'g-simulated',1)",args:[oid,id]});await assert.rejects(trash(p),e=>e.status===409);assert.equal((await client.execute('SELECT state FROM reserve_items')).rows[0].state,'active');
});
test('completed orders and stock history remain after deletion and restoration',async()=>{
 const p=await seed('published'),c=await checkout(),oid=await order(c.checkoutId,{status:'submitted',sync:'applied'});await client.execute({sql:"INSERT INTO stock_history(id,group_id,product_id,before_qty,after_qty,before_revision,after_revision,reason,actor,created_at) VALUES('history','g-simulated',?,3,2,0,1,'Simulated sale','test',?)",args:[id,new Date().toISOString()]});
 await trash(p);assert.equal((await client.execute('SELECT COUNT(*) n FROM stock_history')).rows[0].n,1);assert.equal((await client.execute({sql:'SELECT item FROM orders WHERE id=?',args:[oid]})).rows[0].item,'Simulated Polo');const bin=(await m.readProducts(true,true,true))[0];await m.restoreProduct({id,version:bin.version});assert.equal((await m.readProduct(id)).status,'draft');assert.equal((await client.execute('SELECT COUNT(*) n FROM stock_history')).rows[0].n,1);
});
test('cancelled normal orders and terminal Reserve history do not prevent tidying inventory',async()=>{
 const p=await seed('published'),c=await checkout();await order(c.checkoutId,{status:'cancelled'});const other=await checkout();await order(other.checkoutId,{type:'reserve',reservation:'EXPIRED'});await trash(p);assert.equal((await m.readProducts(true,true,true)).length,1);assert.equal((await client.execute('SELECT COUNT(*) n FROM orders')).rows[0].n,2);
});
test('stale editors, stock controls, Featured and database publication cannot resurrect trash',async()=>{
 const p=await seed('published');await trash(p);await assert.rejects(m.saveProduct({...p,status:'published',reviewed:true},'test-owner'),e=>e.status===404);await assert.rejects(m.changeStock({groupId:'g-simulated',revision:0,mode:'delta',delta:1},'owner'),e=>e.status===404);await assert.rejects(m.undoStock({id},'owner'),e=>e.status===404);await assert.rejects(m.setFeatured({id,version:1,featured:true}),e=>e.status===404);await assert.rejects(client.execute("UPDATE products SET status='published'"),/Catalog product is in trash/);assert.equal((await client.execute('SELECT qty FROM size_groups')).rows[0].qty,2);
});
test('database fences a new invoice linked after deletion and reports a clear checkout conflict',async()=>{
 const p=await seed('published'),c=await checkout(),existing=await order(null);await trash(p);const response=await m.orderBoundary(async()=>{await order(c.checkoutId);return Response.json({ok:true})});assert.equal(response.status,409);assert.match((await response.json()).error,/tidak tersedia/);await assert.rejects(client.execute({sql:'UPDATE orders SET catalog_checkout_id=? WHERE id=?',args:[c.checkoutId,existing]}),/Catalog product is in trash/);assert.equal((await client.execute('SELECT COUNT(*) n FROM orders')).rows[0].n,1);
});
test('migration is additive and applies only once',async()=>{
 const p=await seed('published');const again=await migrate(client,new URL('../migrations/',import.meta.url));assert.deepEqual(again.pending,[]);assert.equal((await m.readProduct(id)).name,p.name);assert.equal((await m.readProduct(id)).deletedAt,undefined);
});
