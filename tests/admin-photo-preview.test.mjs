import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

await mkdir('.test-runtime',{recursive:true});
const file=path.resolve('.test-runtime/admin-photo-preview.mjs');
await build({stdin:{contents:"export {AdminPhotoPreview} from './components/admin-photo-preview';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react/jsx-runtime'],banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"},outfile:file});
const {AdminPhotoPreview}=await import(pathToFileURL(file));
test.after(()=>rm(file,{force:true}));
const key='11111111-1111-4111-8111-111111111111';

test('editor initially renders only a bounded medium preview, without an original image or preload',()=>{
 const html=renderToStaticMarkup(createElement(AdminPhotoPreview,{photoKey:key,alt:'Kondisi barang',medium:true}));
 assert.match(html,/src="\/api\/photos\/[^\"]+\?size=card"/);
 assert.doesNotMatch(html,new RegExp('(src|href)="/api/photos/'+key+'"'));
 assert.equal((html.match(/<img /g)||[]).length,1);
 assert.match(html,/aria-label="Lihat foto asli — Kondisi barang"/);
 assert.match(html,/type="button"/);
 assert.doesNotMatch(html,/role="dialog"/);
});

test('gallery preview is small, lazy and cannot submit the product form',()=>{
 const html=renderToStaticMarkup(createElement(AdminPhotoPreview,{photoKey:key,alt:'Navy 2'}));
 assert.match(html,/\?size=thumb/);
 assert.match(html,/loading="lazy"/);
 assert.match(html,/decoding="async"/);
 assert.match(html,/width="240"/);
 assert.match(html,/type="button"/);
 assert.doesNotMatch(html,new RegExp('(src|href)="/api/photos/'+key+'"'));
});
