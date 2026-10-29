import test,{after,beforeEach} from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {mkdir,writeFile,rm} from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {migrate} from '../scripts/migration-core.mjs';
Object.assign(process.env,{TURSO_DATABASE_URL:'file::memory:',TURSO_AUTH_TOKEN:'',SITE_ORIGIN:'https://elite.test',STORAGE_DRIVER:'local'});delete process.env.VERCEL;
await mkdir('.test-runtime/tests',{recursive:true});const file=path.resolve('.test-runtime/tests/catalog-revision.mjs');
await build({stdin:{contents:`export {versionedCatalogResponse,catalogStamp,clearCatalogSnapshot} from './modules/catalog/catalog-read-snapshot';export {getSqlClient} from './lib/database';export {listingPage,listingRequest} from './modules/catalog/catalog-listing-page';export {readProducts} from './modules/catalog/server';export {readTaxonomy} from './modules/catalog/taxonomy-service';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:file,banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'next',setup(b){b.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path+'.js',external:true}))}}]});
const m=await import(pathToFileURL(file)),client=m.getSqlClient();await migrate(client,new URL('../migrations/',import.meta.url));
const originalNow=Date.now;let now=Date.parse('2026-10-30T00:00:00Z');Date.now=()=>now;
const execute=client.execute;let queries=[];client.execute=function(statement,...args){queries.push(typeof statement==='string'?statement:statement.sql);return execute.call(this,statement,...args)};
const url='https://elite.test/api/catalog?paged=1&page=1';
const get=(path=url,etag)=>m.versionedCatalogResponse(new Request(path,{headers:etag?{'If-None-Match':etag}:{}}),({products,taxonomy})=>m.listingPage(products,taxonomy,m.listingRequest(new URL(path).searchParams),now));
async function seed(){const id=crypto.randomUUID(),group=crypto.randomUUID();await client.execute({sql:"INSERT INTO products(id,shortcode,instagram_url,name,brand,category,color,price,photo_key,photo_keys,caption,warnings,reviewed,status,created_at,updated_at,published_at) VALUES(?,?,'','Fixture','Brand','Polo','Blue',100,NULL,'[]','','[]',1,'published',?,?,?)",args:[id,id,new Date(now).toISOString(),new Date(now).toISOString(),new Date(now).toISOString()]});await client.execute({sql:"INSERT INTO size_groups(id,product_id,label,fits,qty,price,revision,sort_order) VALUES(?,?,'M','[\"M\"]',1,100,0,0)",args:[group,id]});return {id,group}}
beforeEach(async()=>{await client.execute('DELETE FROM size_groups');await client.execute('DELETE FROM products');m.clearCatalogSnapshot();queries=[];now=Date.parse('2026-10-30T00:00:00Z')});
after(async()=>{Date.now=originalNow;client.execute=execute;client.close();await rm(file,{force:true})});
test('unchanged conditional refresh reads only revision; new filters reuse version-validated snapshot with identical listing output',async()=>{
 await seed();const first=await get(),body=await first.json(),etag=first.headers.get('ETag');assert.equal(first.status,200);assert.equal(first.headers.get('Cache-Control'),'private, no-store');queries=[];
 const unchanged=await get(url,etag);assert.equal(unchanged.status,304);assert.equal(queries.length,1);assert.match(queries[0],/FROM catalog_revision/);
 queries=[];const filteredUrl=url+'&brand=Brand',filtered=await get(filteredUrl,etag);assert.equal(filtered.status,200);assert.equal(queries.length,2);assert.ok(queries.every(q=>q.includes('FROM catalog_revision')));assert.notEqual(filtered.headers.get('ETag'),etag);
 const legacy=m.listingPage(await m.readProducts(false,true),await m.readTaxonomy(),m.listingRequest(new URL(url).searchParams),now);assert.deepEqual(body,JSON.parse(JSON.stringify(legacy)));
});
test('stock, product and taxonomy mutations immediately invalidate old validators and snapshots',async()=>{
 const {id,group}=await seed();let response=await get(),etag=response.headers.get('ETag');
 await client.execute({sql:'UPDATE size_groups SET qty=0 WHERE id=?',args:[group]});response=await get(url,etag);assert.equal(response.status,200);assert.notEqual(response.headers.get('ETag'),etag);assert.equal((await response.json()).listing.availableCount,0);
 etag=response.headers.get('ETag');await client.execute({sql:"UPDATE products SET status='draft' WHERE id=?",args:[id]});response=await get(url,etag);assert.equal(response.status,200);
 etag=response.headers.get('ETag');await client.execute("UPDATE catalog_features SET label=label||' ' WHERE id=(SELECT id FROM catalog_features LIMIT 1)");response=await get(url,etag);assert.equal(response.status,200);
});
test('time boundaries invalidate without any write for scheduled release and SOLD seven/thirty day transitions',async()=>{
 const {id}=await seed();await client.execute({sql:'UPDATE products SET orderable_at=? WHERE id=?',args:[new Date(now+10000).toISOString(),id]});let stamp=await m.catalogStamp();now+=10001;assert.notEqual(await m.catalogStamp(),stamp);
 await client.execute({sql:'UPDATE products SET sold_at=? WHERE id=?',args:[new Date(now).toISOString(),id]});stamp=await m.catalogStamp();now+=7*86400000+2;assert.notEqual(await m.catalogStamp(),stamp);stamp=await m.catalogStamp();now+=23*86400000;assert.notEqual(await m.catalogStamp(),stamp);
});
test('a mutation during render never attaches an old ETag to a new snapshot',async()=>{
 const {id}=await seed();let mutation;const response=await m.versionedCatalogResponse(new Request(url),({products})=>{mutation=client.execute({sql:'UPDATE products SET price=200 WHERE id=?',args:[id]});return {products}});await mutation;assert.equal(response.headers.get('ETag'),null);
 assert.equal((await get()).status,200);
});
test('Reserve deadline changes the catalog clock without waiting for a database mutation',async()=>{
 const id=crypto.randomUUID();await client.execute({sql:"INSERT INTO orders(id,session_hash,created_at,name,phone,address,postcode,item,total,order_type,reservation_status,reservation_deadline) VALUES(?,? ,?,'SIMULATION','08000000000','SIMULATION','00000','Fixture',100,'reserve','RESERVED',?)",args:[id,id,now,now+5000]});
 const stamp=await m.catalogStamp();now+=5001;assert.notEqual(await m.catalogStamp(),stamp);
 const changed=await m.catalogStamp();await client.execute({sql:'UPDATE orders SET reservation_deadline=? WHERE id=?',args:[now+10000,id]});assert.notEqual(await m.catalogStamp(),changed);await client.execute({sql:'DELETE FROM orders WHERE id=?',args:[id]});
});
