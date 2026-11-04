import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

await mkdir('.test-runtime/tests', {recursive:true});
const file = path.resolve('.test-runtime/tests/catalog-color-swatches.mjs');
await build({
  stdin:{contents:`export * from './modules/catalog/color-variants';
    export {matchesProduct} from './modules/catalog/catalog-types';
    export {ProductCard} from './components/product-card';
    export {ProductDetail} from './components/product-detail';`,resolveDir:process.cwd(),loader:'tsx'},
  bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',outfile:file,
});
const api = await import(pathToFileURL(file));
after(() => rm(file,{force:true}));
const now = Date.now();
const colors = [
  {id:'navy',name:'Navy',hex:'#142333',price:350000},
  {id:'brown',name:'Brown',hex:'#76543d',price:385000},
  {id:'cream',name:'Cream',hex:'#efe8d7',price:350000},
].map(color => ({...color,active:true,swatchType:'COLOR',photoKey:color.id+'-photo',photoKeys:[color.id+'-photo']}));
function product() {
  return {id:'cap',name:'Fixture Classic Cap',brand:'PRL',category:'Topi',color:'Navy',
    status:'published',price:350000,photoKey:'cover',photoKeys:['cover'],features:[],
    defaultColorVariantId:'navy',colorVariants:colors,
    groups:colors.map((color,index) => ({id:color.id+'-sku',colorVariantId:color.id,
      fits:['One size'],qty:index===2?0:1,price:color.price,condition:'Excellent'})),
  };
}
const card = value => renderToStaticMarkup(React.createElement(api.ProductCard,{product:value,onNavigate(){},now}));
const detail = (value,initialColor) => renderToStaticMarkup(React.createElement(api.ProductDetail,{
  product:value,initialColor,now,backHref:'/',cart:[],cartCount:0,onPick(){},onBuyNow(){},onReserve(){},onOpenCart(){},
}));

test('catalog cover remains a preview and sold or reserved colors never count as available', () => {
  const p=product(),selection=api.productColorSelection(p);
  assert.equal(selection.product.color,'Navy');
  assert.equal(selection.selectedId,null);
  assert.equal(selection.requiresChoice,true);
  assert.deepEqual(selection.available.map(color=>color.id),['navy','brown']);
  p.groups[0].reservedQty=1;
  const reserved=api.productColorSelection(p);
  assert.equal(reserved.product.color,'Brown');
  assert.equal(reserved.requiresChoice,false);
  assert.deepEqual(reserved.available.map(color=>color.id),['brown']);
});

test('an explicit variant retains its gallery, price and inventory identity', () => {
  const selection=api.productColorSelection(product(),'brown');
  assert.equal(selection.requiresChoice,false);
  assert.equal(selection.selectedId,'brown');
  assert.equal(selection.product.price,385000);
  assert.equal(selection.product.photoKey,'brown-photo');
  assert.deepEqual(selection.product.groups.map(group=>group.id),['brown-sku']);
  assert.equal(api.productColorSelection(product(),'unknown').requiresChoice,true);
});

test('catalog renders one card with independent accessible swatches and accurate counts', () => {
  const html=card(product());
  assert.equal((html.match(/class="product-card-link"/g)||[]).length,1);
  assert.match(html,/2<!-- --> Colours Available|2 Colours Available/);
  assert.match(html,/aria-label="Cream · Tidak tersedia"/);
  assert.match(html,/disabled="" aria-label="Cream/);
  assert.doesNotMatch(html,/href="[^"]+\?color=/);
  assert.ok(html.indexOf('</a>')<html.indexOf('<fieldset'));
  for(const link of html.match(/<a[^>]*>[^]*?<\/a>/g)??[]) assert.doesNotMatch(link,/<button/);
});

test('single-color and legacy catalog cards retain their standard presentation', () => {
  for (const colorVariants of [[],[colors[0]]]) {
    const html=card({...product(),colorVariants,groups:[{id:'one',fits:['One size'],qty:1,price:350000}]});
    assert.doesNotMatch(html,/catalog-color-selector|Colours Available|product-card-info-link/);
    assert.match(html,/href="\/produk\/cap"/);
  }
});

test('detail requires explicit color before Buy Now, basket and DP for multiple purchasable colors', () => {
  const html=detail(product());
  assert.match(html,/Pilih warna terlebih dahulu/);
  assert.match(html,/buy-now-button" disabled=""/);
  assert.match(html,/pick-stock" disabled=""/);
  assert.match(html,/reserve-secondary" disabled=""/);
  assert.doesNotMatch(html,/aria-pressed="true"/);
  const selected=detail(product(),'brown');
  assert.match(selected,/brown-photo/);
  assert.match(selected,/385\.000/);
  assert.doesNotMatch(selected,/buy-now-button" disabled/);
  assert.match(selected,/Color — Brown/);
});

test('sold color links stay viewable without falling through to another purchasable color', () => {
  const html=detail(product(),'cream');
  assert.match(html,/SOLD/);
  assert.match(html,/cream-photo/);
  assert.doesNotMatch(html,/buy-now-button/);
  const p=product();
  p.colorVariants=colors.map(color=>({...color,active:color.id!=='brown'}));
  assert.equal(api.productColorSelection(p,'brown').selectedId,null);
  assert.equal(api.productColorSelection(p,'brown').product.color,'Navy');
});

test('extra swatches collapse after four and available color search uses the same parent', () => {
  const p=product();
  p.colorVariants=[...colors,...['green','red','white'].map(id=>({...colors[0],id,name:id}))];
  assert.match(card(p),/>\+2<\/button>/);
  assert.equal(api.matchesProduct(p,{q:'Brown',category:'Topi',brand:'PRL',size:'One size',max:'400000'}),true);
  assert.equal(api.matchesProduct(p,{q:'Brown',category:'Polo'}),false);
});
