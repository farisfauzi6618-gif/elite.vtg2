import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { migrate } from '../scripts/migration-core.mjs';

test('weekly rotation prices real checkout groups, preserves manual choices and cannot apply twice', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(),'elite-weekly-featured-'));
  process.env.TURSO_DATABASE_URL = 'file:' + path.join(directory,'fixture.db');
  delete process.env.TURSO_AUTH_TOKEN;
  delete process.env.VERCEL;
  await mkdir('.test-runtime/tests',{recursive:true});
  const file = path.resolve('.test-runtime/tests/weekly-featured.mjs');
  await build({
    stdin:{
      contents:`export * from './modules/sales/weekly-featured-server';
        export {getSqlClient} from './lib/database';
        export {readProduct} from './modules/catalog/server';
        export {transactionPrice} from './modules/catalog/sale-price';
        export {setFeatured} from './modules/catalog/featured-server';
        export {saveProduct} from './modules/catalog/catalog-service';`,
      resolveDir:process.cwd(),loader:'ts',
    },
    bundle:true,platform:'node',format:'esm',packages:'external',outfile:file,
    plugins:[{name:'next',setup(plugin){
      plugin.onResolve({filter:/^next\/(headers|navigation)$/},args=>({path:args.path+'.js',external:true}));
    }}],
  });
  const api = await import(pathToFileURL(file));
  const client = api.getSqlClient();
  try {
    await migrate(client,new URL('../migrations/',import.meta.url));
    const now = Date.UTC(2026,10,2,2);
    const day = 86400000;
    async function product(id, price, qty, age, position=null, sale=null) {
      const date = new Date(now-age*day).toISOString();
      await client.execute({
        sql:`INSERT INTO products(id,shortcode,instagram_url,name,price,sale_price,created_at,updated_at,published_at,status,is_featured,featured_position)
          VALUES(?,?,'',?,?,?,?,?,?,'published',?,?)`,
        args:[id,id,id,price,sale,date,date,date,Number(position!=null),position],
      });
      await client.execute({sql:"INSERT INTO size_groups(id,product_id,fits,qty) VALUES(?,?,'[]',?)",args:[id+'-g',id,qty]});
    }
    async function view(productId, id, timestamp) {
      await client.execute({
        sql:"INSERT INTO analytics_events(id,dedupe_key,event_name,timestamp,session_id,visitor_id,product_id,traffic_source) VALUES(?,?,'product_view',?,?,?,?,'Direct')",
        args:[id,id,timestamp,id,id,productId],
      });
    }
    await product('manual',100000,1,90,8,90000);
    await product('hot',100000,1,10);
    await product('quiet',700000,1,45);
    await product('stock',100000,5,10);
    await product('quiet-edit',400000,1,35);
    await product('sold',100000,0,60);
    await product('manual-sale',100000,1,60,null,85000);
    for(let i=0;i<4;i++) await view('hot','view-'+i,now-1);
    await product('pending',100000,1,60);
    async function pendingInvoice(productId, createdAt) {
      await client.execute({
        sql:'INSERT INTO catalog_checkouts(id,token_hash,lines_json,amount,expires_at,created_at) VALUES(?,?,?,?,?,?)',
        args:[productId,productId,JSON.stringify([{groupId:productId+'-g'}]),100000,createdAt+day,createdAt],
      });
      await client.execute({
        sql:`INSERT INTO orders(id,session_hash,created_at,name,phone,address,postcode,item,total,item_amount,quantity,status,catalog_checkout_id)
          VALUES(?, ?, ?, 'Fixture', '000', 'Fixture', '00000', 'Fixture', 100000, 100000, 1, 'awaiting_proof', ?)`,
        args:[productId,productId,createdAt,productId],
      });
    }
    await pendingInvoice('pending',now-1);
    const preview=await api.previewWeeklyFeatured(now);
    assert.deepEqual(preview.plan.map(item=>item.productId),['hot','quiet','stock','quiet-edit']);
    assert.equal(preview.plan[1].discounts[0].reduction,50000);
    assert.equal((await api.readProduct('quiet')).isFeatured,false);

    assert.equal((await api.applyWeeklyFeatured(now)).applied,true);
    assert.equal((await api.applyWeeklyFeatured(now+100)).applied,false);
    const discounted=await api.readProduct('quiet');
    assert.equal(api.transactionPrice(discounted,discounted.groups[0]),650000);
    assert.equal((await api.readProduct('manual')).featuredPosition,8);
    const manualSale=await api.readProduct('manual-sale');
    assert.equal(api.transactionPrice(manualSale,manualSale.groups[0]),85000);

    const editable=await api.readProduct('quiet-edit');
    assert.equal(api.transactionPrice(editable,editable.groups[0]),360000);
    const edited=await api.saveProduct({...editable,price:900000,status:'draft'},'fixture-owner');
    assert.equal(api.transactionPrice(edited,edited.groups[0]),900000);

    await api.setFeatured({id:'stock',featured:true,version:(await api.readProduct('stock')).version});
    await client.execute("UPDATE size_groups SET qty=1 WHERE product_id='stock'");
    for(let i=0;i<3;i++) await view('quiet','quiet-view-'+i,now+day);
    await pendingInvoice('quiet',now+7*day-1);
    await api.applyWeeklyFeatured(now+7*day);
    const protectedProduct=await api.readProduct('quiet');
    assert.equal(api.transactionPrice(protectedProduct,protectedProduct.groups[0]),650000);
    await api.applyWeeklyFeatured(now+14*day);
    const rotated=await api.readProduct('quiet');
    assert.equal(api.transactionPrice(rotated,rotated.groups[0]),700000);
    assert.equal((await api.readProduct('stock')).isFeatured,true);
  } finally {
    client.close();
    await rm(directory,{recursive:true,force:true});
    await rm(file,{force:true});
  }
});
