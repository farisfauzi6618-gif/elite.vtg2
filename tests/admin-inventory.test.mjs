import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const bundle=await build({stdin:{contents:"export * from './modules/catalog/admin-inventory';export {AdminFeaturedQuickActions} from './components/admin-featured';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',write:false});
await mkdir('.test-runtime/tests',{recursive:true});const file=path.resolve('.test-runtime/tests/admin-inventory.mjs');await writeFile(file,bundle.outputFiles[0].contents);const m=await import(pathToFileURL(file));
const product=(id,extra={})=>({id,name:'Cable Knit Sweater',brand:'Polo Ralph Lauren',category:'Sweater & Knitwear',status:'published',groups:[{id:'g-'+id,qty:1}],...extra});
const ids=(rows,filters)=>m.adminInventoryProducts(rows,filters).map(p=>p.id);
test('admin search finds name, brand and mixed words regardless of case, spaces or separators',()=>{
 const rows=[product('polo'),product('uspa',{name:'Corduroy Collar Jacket',brand:'USPA'}),product('blank',{name:'',brand:''})];
 for(const q of ['POLO RALPH LAUREN','  cable   knit  ','polo sweater','RALPH Cable','cable-knit'])assert.deepEqual(ids(rows,{q}),['polo']);
 assert.deepEqual(ids(rows,{q:'uspa collar'}),['uspa']);assert.deepEqual(ids(rows,{q:'polo jacket'}),[]);assert.deepEqual(ids(rows,{q:'  '}),['polo','uspa','blank']);
 assert.deepEqual(ids([product('accent',{brand:'A.P.C. Élite'})],{q:'a p c elite'}),['accent']);
});
test('search composes with existing draft, available, empty, hidden, review and trash filters',()=>{
 const rows=[product('live'),product('draft',{status:'draft'}),product('sold',{groups:[{id:'s',qty:0}],soldHidden:true}),product('review',{category:'Legacy'}),product('trash',{deletedAt:'2026-10-01',status:'draft'})];
 assert.deepEqual(ids(rows,{q:'ralph',status:'published'}),['live','review']);assert.deepEqual(ids(rows,{q:'polo',status:'draft'}),['draft','trash']);assert.deepEqual(ids(rows,{status:'empty'}),['sold']);assert.deepEqual(ids(rows,{status:'hidden'}),['sold']);assert.deepEqual(ids(rows,{status:'review'}),['review']);assert.deepEqual(ids(rows,{status:'trash'}),['trash']);
});
test('Featured view preserves marked drafts, reserved and sold for management, with active order first',()=>{
 const rows=[product('sold',{isFeatured:true,featuredPosition:1,groups:[{id:'s',qty:0}]}),product('second',{isFeatured:true,featuredPosition:2}),product('plain'),product('draft',{status:'draft',isFeatured:true,featuredPosition:3}),product('first',{isFeatured:true,featuredPosition:1,groups:[{id:'r',qty:1,reservedQty:1}]})];
 assert.deepEqual(ids(rows,{featuredOnly:true}),['first','second','draft','sold']);assert.deepEqual(ids(rows,{featuredOnly:true,q:'polo',status:'draft'}),['draft']);assert.deepEqual(ids(rows),['sold','second','plain','draft','first']);assert.equal(rows[0].id,'sold');
});
test('quick controls are named per product, respect order boundaries and disable SOLD additions',()=>{
 const html=(p,count=3)=>renderToStaticMarkup(React.createElement(m.AdminFeaturedQuickActions,{product:p,count,showOrder:true,disabled:false,onChange(){}}));
 const first=html(product('first',{isFeatured:true,featuredPosition:1}));assert.match(first,/Keluarkan dari Featured: Cable Knit Sweater/);assert.match(first,/aria-label="Naikkan urutan Featured: [^"]+" disabled/);assert.doesNotMatch(first,/aria-label="Turunkan urutan Featured: [^"]+" disabled/);
 const last=html(product('last',{isFeatured:true,featuredPosition:3}));assert.match(last,/aria-label="Turunkan urutan Featured: [^"]+" disabled/);
 const sold=html(product('sold',{groups:[{id:'s',qty:0}]}));assert.match(sold,/disabled="" aria-label="Tambahkan ke Featured:/);assert.doesNotMatch(sold,/Urutan Featured:/);
 const markedSold=html(product('sold',{isFeatured:true,featuredPosition:1,groups:[{id:'s',qty:0}]}));assert.match(markedSold,/Keluarkan dari Featured:/);assert.doesNotMatch(markedSold,/Urutan Featured:/);
});
