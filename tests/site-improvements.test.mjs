import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
await mkdir('.test-runtime/tests',{recursive:true});
const file=path.resolve('.test-runtime/tests/site-improvements.mjs');
await build({stdin:{contents:"export * from './modules/catalog/brands';export * from './modules/catalog/related-products';export {matchesProduct} from './modules/catalog/catalog-types';export {ProductDetail} from './components/product-detail';export {default as robots} from './app/robots';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',outfile:file});
const m=await import(pathToFileURL(file));after(()=>rm(file,{force:true}));
const now=Date.UTC(2026,10,8,0),product=(id,extra={})=>({id,name:'Fixture cap',status:'published',brand:'Polo Ralph Lauren',category:'Topi',color:'Navy',price:350000,groups:[{id:id+'-sku',fits:['M'],qty:1,price:350000}],...extra});
test('brand aliases find historical capitalization without changing product records',()=>{
 const p=product('a',{brand:'POLO RALPH LAUREN'});
 assert.equal(m.matchesProduct(p,{brand:'Polo Ralph Lauren'}),true);
 assert.equal(m.matchesProduct(p,{brand:'Lacoste'}),false);
 assert.equal(p.brand,'POLO RALPH LAUREN');
 assert.deepEqual(m.catalogBrands(['POLO RALPH LAUREN','Polo Ralph Lauren','UNKNOWN','uknown','-']),['Brand belum diketahui','Polo Ralph Lauren']);
 assert.notEqual(m.brandKey('Arnold Palmer'),m.brandKey('Arnold Parmer'));
});
test('sold alternatives exclude unavailable, hidden, inactive-color and scheduled inventory',()=>{
 const parent=product('sold',{groups:[{id:'old',fits:['M'],qty:0}]}),good=product('good');
 const candidates=[parent,good,product('sold2',{groups:[{id:'sold2-sku',fits:['M'],qty:0}]}),product('held',{groups:[{id:'held-sku',fits:['M'],qty:1,reservedQty:1}]}),product('draft',{status:'draft'}),product('deleted',{deletedAt:'2026-11-01'}),product('future',{orderableAt:'2027-01-01T00:00:00Z'}),product('other',{category:'Polo'}),product('inactive',{colorVariants:[{id:'off',active:false}],groups:[{id:'inactive-sku',colorVariantId:'off',qty:1,fits:['M']} ]})];
 assert.deepEqual(m.relatedProducts(parent,candidates,now).map(p=>p.id),['good']);
});
test('alternatives prefer compatible fit and canonical brand and remain bounded',()=>{
 const parent=product('parent'),same=product('best',{brand:'POLO RALPH LAUREN'}),others=Array.from({length:8},(_,i)=>product('p'+i,{brand:'Other',groups:[{id:'g'+i,fits:['XL'],qty:2}]}));
 const rows=m.relatedProducts(parent,[...others,same],now);assert.equal(rows.length,4);assert.equal(rows[0].id,'best');assert.equal(new Set(rows.map(p=>p.id)).size,4);
});
test('mobile summary has one heading and only links to guarded purchase controls',()=>{
 const colors=['navy','brown'].map(id=>({id,name:id,hex:'#123456',active:true,swatchType:'COLOR',photoKeys:[],photoKey:null,price:350000}));
 const p=product('cap',{colorVariants:colors,groups:colors.map(c=>({id:c.id+'-sku',colorVariantId:c.id,qty:1,fits:['M'],price:350000}))});
 const html=renderToStaticMarkup(React.createElement(m.ProductDetail,{product:p,now,backHref:'/',cart:[],cartCount:0,onPick(){},onBuyNow(){},onOpenCart(){}}));
 assert.equal((html.match(/<h1>/g)||[]).length,1);assert.ok(html.indexOf('<h1>')<html.indexOf('product-gallery'));
 assert.match(html,/href="#product-color-options"/);assert.match(html,/buy-now-button" disabled=""/);assert.match(html,/id="product-purchase-options"/);
 const selected=renderToStaticMarkup(React.createElement(m.ProductDetail,{product:p,initialColor:'brown',now,backHref:'/',cart:[],cartCount:0,onPick(){},onBuyNow(){},onOpenCart(){}}));
 assert.match(selected,/href="#product-purchase-options"/);assert.doesNotMatch(selected,/buy-now-button" disabled/);
});
test('robots advertises the public sitemap and keeps management and private flows out',()=>{
 const data=m.robots();assert.equal(data.sitemap,'https://elitevtg.com/sitemap.xml');for(const path of ['/admin/','/api/','/order','/undangan-admin'])assert.ok(data.rules.disallow.includes(path));
});
