import test,{after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import sharp from 'sharp';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {migrate} from '../scripts/migration-core.mjs';

const dir=await mkdtemp(path.join(os.tmpdir(),'elite-public-media-'));
Object.assign(process.env,{TURSO_DATABASE_URL:'file:'+path.join(dir,'fixture.db'),TURSO_AUTH_TOKEN:'',SITE_ORIGIN:'https://elite.test',STORAGE_DRIVER:'local',LOCAL_STORAGE_PATH:path.join(dir,'files'),BLOB_READ_WRITE_TOKEN:'',BLOB_STORE_ID:'',PRODUCT_MEDIA_READ_WRITE_TOKEN:'SIMULATED_PUBLIC_STORE',PRODUCT_MEDIA_DISABLED:'',VERCEL_ENV:'production'});delete process.env.VERCEL;
await mkdir('.test-runtime/tests',{recursive:true});const output=path.resolve('.test-runtime/tests/public-product-media.mjs');
await build({stdin:{contents:`import {publicProductMediaUrl as mediaUrl} from './modules/catalog/public-product-media';import {photoPreview} from './modules/catalog/photo-preview';export {PUBLIC_MEDIA_FILE_LIMIT,PUBLIC_MEDIA_TOTAL_LIMIT,withdrawPublicProductMedia,retryWithdrawnProductMedia} from './modules/catalog/public-product-media';export const publicProductMediaUrl=(key,size)=>mediaUrl(key,size,photoPreview);export {getSqlClient} from './lib/database';export {storage} from './lib/storage';export {GET as publicImage} from './app/api/product-images/[key]/route';export {saveProduct} from './modules/catalog/catalog-service';export {trashProduct} from './modules/catalog/product-trash';export {readProduct} from './modules/catalog/server';export {calls,reset,configure} from '@vercel/blob';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:output,banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},plugins:[{name:'isolate',setup(b){b.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path+'.js',external:true}));b.onResolve({filter:/^@vercel\/blob$/},()=>({path:'mock',namespace:'blob'}));b.onLoad({filter:/.*/,namespace:'blob'},()=>({loader:'js',contents:`export const calls=[];let options={};export function reset(){calls.length=0;options={};}export function configure(value){options=value;}export class BlobNotFoundError extends Error{};export async function put(key,bytes,opts){calls.push({operation:'put',key,bytes:Buffer.from(bytes),options:opts});await options.beforePut?.();if(options.failPut)throw Error('SIMULATED outage');return {url:options.badUrl?'https://untrusted.invalid/image.webp':'https://simulation.public.blob.vercel-storage.com/'+key};}export async function del(key,opts){calls.push({operation:'del',key,options:opts});if(options.failDelete)throw Error('SIMULATED deletion outage');}export async function head(){throw Error('Unexpected head');}export async function get(){throw Error('Unexpected original Blob read');}` }));}}]});
const m=await import(pathToFileURL(output)),client=m.getSqlClient();await migrate(client,new URL('../migrations/',import.meta.url));
let key,id;
const pixels=Buffer.alloc(1400*1700*3);let random=456;for(let i=0;i<pixels.length;i++){random=(random*1664525+1013904223)>>>0;pixels[i]=random>>>24}
const original=await sharp(pixels,{raw:{width:1400,height:1700,channels:3}}).jpeg({quality:94}).withMetadata({exif:{IFD0:{Artist:'SIMULATED PRIVATE CAMERA METADATA'}}}).toBuffer();
async function seed(status='published',photo=original){const pid=crypto.randomUUID(),photoKey=crypto.randomUUID();await m.storage.put(photoKey,photo,{httpMetadata:{contentType:'image/jpeg'}});await client.execute({sql:"INSERT INTO photos(key,content_type,size,source,created_at) VALUES(?,'image/jpeg',?,'simulation','2026-10-26')",args:[photoKey,photo.length]});await client.execute({sql:"INSERT INTO products(id,shortcode,instagram_url,name,brand,category,color,price,condition,defects,photo_key,photo_keys,status,reviewed,created_at,updated_at) VALUES(?,?,'','SIMULATED','Polo Ralph Lauren','Polo','Navy',185000,'Excellent','None',?,? ,?,1,'2026-10-26','2026-10-26')",args:[pid,pid,photoKey,JSON.stringify([photoKey]),status]});await client.execute({sql:"INSERT INTO size_groups(id,product_id,fits,qty,revision) VALUES(?,?,'[\"M\"]',1,0)",args:['g-'+pid,pid]});return {id:pid,key:photoKey}}
beforeEach(async()=>{m.reset();process.env.PRODUCT_MEDIA_READ_WRITE_TOKEN='SIMULATED_PUBLIC_STORE';process.env.PRODUCT_MEDIA_DISABLED='';process.env.VERCEL_ENV='production';await client.execute('DELETE FROM photo_public_derivatives');await client.execute('DELETE FROM size_groups');await client.execute('DELETE FROM products');({key,id}=await seed());});
after(async()=>{client.close();assert.equal(path.dirname(dir),os.tmpdir());assert.ok(path.basename(dir).startsWith('elite-public-media-'));await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200});await rm(output,{force:true})});

test('public route redirects small metadata-stripped rendition; repeat requests reuse stable URL without upload/head',async()=>{
 const context={params:Promise.resolve({key})},request=new Request('https://elite.test/api/product-images/'+key+'?size=cardSmall');
 const response=await m.publicImage(request,context);assert.equal(response.status,307);assert.equal((await response.arrayBuffer()).byteLength,0);assert.equal(response.headers.get('Cache-Control'),'private, max-age=60');assert.equal(response.headers.get('Vercel-CDN-Cache-Control'),'public, s-maxage=60, must-revalidate');assert.equal(response.headers.get('Set-Cookie'),null);
 const upload=m.calls.find(c=>c.operation==='put'),metadata=await sharp(upload.bytes).metadata();assert.equal(upload.options.access,'public');assert.equal(upload.options.token,'SIMULATED_PUBLIC_STORE');assert.equal(upload.options.allowOverwrite,false);assert.equal(metadata.width,395);assert.equal(metadata.height,480);assert.equal(metadata.exif,undefined);assert.ok(upload.bytes.length<=m.PUBLIC_MEDIA_FILE_LIMIT);assert.ok(upload.bytes.length<original.length);
 for(let i=0;i<5;i++)assert.equal(await m.publicProductMediaUrl(key,'cardSmall'),response.headers.get('Location'));
 assert.equal(m.calls.filter(c=>c.operation==='put').length,1);
 const row=(await client.execute('SELECT * FROM photo_public_derivatives')).rows[0];assert.equal(row.state,'ready');assert.equal(row.byte_size,upload.bytes.length);
});
test('draft, unattached proof, inactive colors and deleted products never upload even with public token',async()=>{
 const draft=await seed('draft'),proof=crypto.randomUUID(),inactive=crypto.randomUUID();await client.execute({sql:'UPDATE products SET color_variants=? WHERE id=?',args:[JSON.stringify([{id:'color',name:'Cream',active:false,photoKey:inactive,photoKeys:[inactive],swatchImage:inactive}]),id]});
 for(const value of [draft.key,proof,inactive])assert.equal(await m.publicProductMediaUrl(value,'thumb'),null);
 await client.execute({sql:"UPDATE products SET deleted_at='2026-10-26' WHERE id=?",args:[id]});assert.equal(await m.publicProductMediaUrl(key,'thumb'),null);assert.equal(m.calls.length,0);
});
test('active color galleries and swatches are eligible; removing a color withdraws derivatives',async()=>{
 const color=await seed('draft');await client.execute({sql:'UPDATE products SET color_variants=? WHERE id=?',args:[JSON.stringify([{id:'color',name:'Cream',active:true,photoKey:color.key,photoKeys:[color.key],swatchImage:color.key}]),id]});
 assert.ok(await m.publicProductMediaUrl(color.key,'thumb'));await client.execute({sql:'UPDATE products SET color_variants=? WHERE id=?',args:['[]',id]});await m.withdrawPublicProductMedia([color.key]);assert.ok(m.calls.some(c=>c.operation==='del'));assert.equal((await client.execute('SELECT * FROM photo_public_derivatives')).rows.length,0);
});
test('multiple Function contenders reserve one generation, with existing preview fallback while it builds',async()=>{
 let release,started;const barrier=new Promise(r=>{started=r}),hold=new Promise(r=>{release=r});m.configure({beforePut:async()=>{started();await hold}});const first=m.publicProductMediaUrl(key,'thumb');await barrier;const second=await m.publicProductMediaUrl(key,'thumb');assert.equal(second,null);release();assert.ok(await first);assert.equal(m.calls.filter(c=>c.operation==='put').length,1);
});
test('unpublish while upload runs never activates it and removes the uploaded derivative',async()=>{
 m.configure({beforePut:async()=>{await client.execute({sql:"UPDATE products SET status='draft' WHERE id=?",args:[id]});await m.withdrawPublicProductMedia([key]);}});assert.equal(await m.publicProductMediaUrl(key,'cardSmall'),null);assert.ok(m.calls.some(c=>c.operation==='del'));assert.equal((await client.execute("SELECT * FROM photo_public_derivatives WHERE state='ready'")).rows.length,0);
});
test('shared references keep CDN asset until the last published reference is removed',async()=>{
 await m.publicProductMediaUrl(key,'thumb');const shared=await seed();await client.execute({sql:'UPDATE products SET photo_key=?,photo_keys=? WHERE id=?',args:[key,JSON.stringify([key]),shared.id]});await client.execute({sql:"UPDATE products SET status='draft' WHERE id=?",args:[id]});await m.withdrawPublicProductMedia([key]);assert.equal(m.calls.filter(c=>c.operation==='del').length,0);await client.execute({sql:"UPDATE products SET status='draft' WHERE id=?",args:[shared.id]});await m.withdrawPublicProductMedia([key]);assert.equal(m.calls.filter(c=>c.operation==='del').length,1);
});
test('failed revocation stays durable and counts toward budget until bounded retry succeeds',async()=>{
 await m.publicProductMediaUrl(key,'thumb');await client.execute({sql:"UPDATE products SET status='draft' WHERE id=?",args:[id]});m.configure({failDelete:true});await m.withdrawPublicProductMedia([key]);assert.equal((await client.execute('SELECT state FROM photo_public_derivatives')).rows[0].state,'revoked');m.configure({});await m.retryWithdrawnProductMedia();assert.equal((await client.execute('SELECT * FROM photo_public_derivatives')).rows.length,0);
});
test('withdrawing a gallery deletes its presets in one Blob batch rather than serial file requests',async()=>{
 for(const size of ['thumb','cardSmall','card'])assert.ok(await m.publicProductMediaUrl(key,size));
 await client.execute({sql:"UPDATE products SET status='draft' WHERE id=?",args:[id]});await m.withdrawPublicProductMedia([key]);
 const deletes=m.calls.filter(call=>call.operation==='del');assert.equal(deletes.length,1);assert.equal(deletes[0].key.length,3);assert.equal((await client.execute('SELECT * FROM photo_public_derivatives')).rows.length,0);
});
test('128 MiB budget uses an atomic lease reservation and gracefully retains old delivery when full',async()=>{
 await client.execute({sql:"INSERT INTO photo_public_derivatives VALUES(?,?,?,'ready',?,?,?, ?,?)",args:[crypto.randomUUID(),'card','preview-v1',crypto.randomUUID(),'simulation.webp','https://simulation.public.blob.vercel-storage.com/simulation.webp',m.PUBLIC_MEDIA_TOTAL_LIMIT,Date.now()]});assert.equal(await m.publicProductMediaUrl(key,'thumb'),null);assert.equal(m.calls.length,0);
});
test('small/undecodable originals and overly large renditions never get copied into public storage',async()=>{
 const small=await seed('published',await sharp({create:{width:80,height:120,channels:3,background:'#082039'}}).jpeg().toBuffer());assert.equal(await m.publicProductMediaUrl(small.key,'thumb'),null);const broken=await seed('published',Buffer.alloc(20000));assert.equal(await m.publicProductMediaUrl(broken.key,'card'),null);assert.equal(await m.publicProductMediaUrl(key,'detail'),null);assert.equal(m.calls.filter(c=>c.operation==='put').length,0);
});
test('storage outage, invalid destination, missing token, preview environment and kill switch keep fallback working',async()=>{
 m.configure({failPut:true});assert.equal(await m.publicProductMediaUrl(key,'thumb'),null);m.reset();m.configure({badUrl:true});assert.equal(await m.publicProductMediaUrl(key,'cardSmall'),null);m.reset();
 for(const setting of [{PRODUCT_MEDIA_READ_WRITE_TOKEN:''},{PRODUCT_MEDIA_READ_WRITE_TOKEN:'SIMULATED_PUBLIC_STORE',VERCEL_ENV:'preview'},{VERCEL_ENV:'production',PRODUCT_MEDIA_DISABLED:'1'}]){Object.assign(process.env,setting);assert.equal(await m.publicProductMediaUrl(key,'card'),null)}assert.equal(m.calls.length,0);
});
test('admin save unpublish and trash withdraw derivatives without changing stock/original; trash remains idempotent',async()=>{
 await m.publicProductMediaUrl(key,'thumb');const product=await m.readProduct(id);await m.saveProduct({...product,status:'draft'},'SIMULATED_OWNER');assert.equal((await client.execute('SELECT * FROM photo_public_derivatives')).rows.length,0);assert.deepEqual(Buffer.from(await (await m.storage.get(key)).arrayBuffer()),original);assert.equal((await m.readProduct(id)).groups[0].qty,1);
 await client.execute({sql:"UPDATE products SET status='published' WHERE id=?",args:[id]});await m.publicProductMediaUrl(key,'thumb');const current=await m.readProduct(id),result=await m.trashProduct({id,version:current.version,confirmed:true},'SIMULATED_OWNER');assert.ok(result.deletedAt);assert.equal((await client.execute('SELECT * FROM photo_public_derivatives')).rows.length,0);assert.equal((await m.trashProduct({id,version:current.version,confirmed:true},'SIMULATED_OWNER')).deletedAt,result.deletedAt);
});
