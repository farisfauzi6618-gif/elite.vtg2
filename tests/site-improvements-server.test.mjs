import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {createClient} from '@libsql/client';import {migrate} from '../scripts/migration-core.mjs';
const directory=await mkdtemp(path.join(os.tmpdir(),'elite-site-improvements-'));process.env.TURSO_DATABASE_URL='file:'+path.join(directory,'fixture.db');delete process.env.TURSO_AUTH_TOKEN;delete process.env.VERCEL;
const client=createClient({url:process.env.TURSO_DATABASE_URL});await migrate(client,new URL('../migrations/',import.meta.url));await mkdir('.test-runtime/tests',{recursive:true});const file=path.resolve('.test-runtime/tests/site-improvements-server.mjs');
await build({stdin:{contents:"export * from './modules/catalog/catalog-read-snapshot';export * from './modules/catalog/initial-listing';export {default as sitemap} from './app/sitemap';export {weeklyFeaturedStatus} from './modules/sales/weekly-featured-server';export {getSqlClient} from './lib/database';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:file,plugins:[{name:'next',setup(p){p.onResolve({filter:/^next\/(headers|navigation)$/},a=>({path:a.path+'.js',external:true}))}}]});
const m=await import(pathToFileURL(file));after(async()=>{client.close();m.getSqlClient().close();await rm(file,{force:true});await rm(directory,{recursive:true,force:true,maxRetries:3});});
async function seed(id,status='published',brand='POLO RALPH LAUREN'){
 const now='2026-11-08T00:00:00.000Z';await client.execute({sql:"INSERT INTO products(id,shortcode,instagram_url,name,brand,category,color,price,status,created_at,updated_at,published_at) VALUES(?,?,'',?,?,'Topi','Navy',350000,?,?,?,?)",args:[id,id,id,brand,status,now,now,now]});await client.execute({sql:"INSERT INTO size_groups(id,product_id,fits,qty) VALUES(?,?,'[\"M\"]',1)",args:[id+'-sku',id]});
}
test('initial listing reuses stock revision guards and excludes drafts',async()=>{
 await seed('one');await seed('two','published','Polo Ralph Lauren');await seed('private','draft');
 const first=await m.initialListing({brand:'Polo Ralph Lauren'});assert.equal(first.listing.availableCount,2);assert.deepEqual(first.listing.brands.filter(x=>x==='Polo Ralph Lauren'),['Polo Ralph Lauren']);
 await client.execute("UPDATE size_groups SET qty=0 WHERE product_id='one'");const changed=await m.initialListing({brand:'POLO RALPH LAUREN',availability:'available'});assert.equal(changed.listing.availableCount,1);assert.equal(changed.products[0].id,'two');
 assert.equal(await m.initialListing({q:'x'.repeat(121)}),undefined);
});
test('sitemap includes published product URLs only and never private routes',async()=>{
 await seed('deleted');await client.execute("UPDATE products SET deleted_at='2026-11-08' WHERE id='deleted'");await seed('hidden');await client.execute("UPDATE products SET sold_hidden=1 WHERE id='hidden'");
 const urls=(await m.sitemap()).map(x=>x.url);assert.ok(urls.includes('https://elitevtg.com/produk/two'));for(const name of ['private','deleted','hidden'])assert.ok(!urls.some(x=>x.endsWith('/'+name)));assert.ok(urls.every(x=>!x.includes('/admin')&&!x.includes('?')));
});
test('featured status reads one ledger row without computing candidates or applying changes',async()=>{
 const db=m.getSqlClient(),execute=db.execute.bind(db),queries=[];db.execute=async statement=>{queries.push(typeof statement==='string'?statement:statement.sql);return execute(statement)};
 try{const data=await m.weeklyFeaturedStatus(Date.UTC(2026,10,8));assert.equal(data.lastRun,null);assert.equal(data.nextRunAt,Date.UTC(2026,10,9,2));assert.equal(queries.length,1);assert.match(queries[0],/^SELECT period, applied_at, plan FROM weekly_featured_runs/);}finally{db.execute=execute;}
});
