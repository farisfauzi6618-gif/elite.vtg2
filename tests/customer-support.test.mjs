import test,{beforeEach,afterEach,after} from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {mkdir,rm} from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {createElement} from 'react';import {renderToStaticMarkup} from 'react-dom/server';
await mkdir('.test-runtime/tests',{recursive:true});const output=path.resolve('.test-runtime/tests/customer-support.mjs');
await build({stdin:{contents:"export {CustomerSupport,WHATSAPP_URL} from './components/customer-support';export {WHATSAPP_NUMBER,WHATSAPP_DISPLAY,copySupportNumber} from './modules/catalog/customer-support';export {refs,effects,resetHarness} from 'support-test-hooks';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',outfile:output,plugins:[{name:'support-hooks',setup(b){b.onResolve({filter:/^support-test-hooks$/},()=>({path:'hooks',namespace:'support-unit'}));b.onResolve({filter:/^react$/},args=>/[\\/]components[\\/]customer-support\.tsx$/.test(args.importer)?{path:'hooks',namespace:'support-unit'}:undefined);b.onLoad({filter:/.*/,namespace:'support-unit'},()=>({loader:'js',contents:"export const refs=[],effects=[];export function resetHarness(){refs.length=effects.length=0}export function useRef(value){const ref={current:value};refs.push(ref);return ref}export function useEffect(effect){effects.push(effect)}export function useState(value){return [value,()=>{}]}"}))}}]});
const m=await import(pathToFileURL(output));
let previousDocument,previousWindow;
beforeEach(()=>{m.resetHarness();previousDocument=globalThis.document;previousWindow=globalThis.window;globalThis.window={matchMedia:()=>({matches:true})};});
afterEach(()=>{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow});
after(()=>rm(output,{force:true}));
function fixture(){
 const events=new Map(),summary={focused:false,focus(){this.focused=true}},inside={inside:true},outside={};
 const details={open:false,contains(target){return target===this||!!target?.inside},querySelector(selector){assert.equal(selector,'summary');return summary}};
 globalThis.document={activeElement:outside,addEventListener:(name,callback)=>events.set(name,callback),removeEventListener:(name,callback)=>{if(events.get(name)===callback)events.delete(name)}};
 const element=m.CustomerSupport({});m.refs[0].current=details;return {element,details,inside,outside,summary,events};
}
test('one desktop click opens the menu even when pointer entry happens first',()=>{
 const f=fixture();f.element.props.onPointerEnter?.({pointerType:'mouse'});f.details.open=!f.details.open;assert.equal(f.details.open,true);
});
test('moving the pointer toward WhatsApp does not collapse an already open menu',()=>{
 const f=fixture();f.details.open=true;f.element.props.onPointerLeave?.({pointerType:'mouse'});assert.equal(f.details.open,true);
});
test('touch/browser blur with no next focused element keeps the WhatsApp target available',()=>{
 const f=fixture();f.details.open=true;f.element.props.onBlurCapture({relatedTarget:null});assert.equal(f.details.open,true);f.element.props.onBlurCapture({relatedTarget:f.inside});assert.equal(f.details.open,true);f.element.props.onBlurCapture({relatedTarget:f.outside});assert.equal(f.details.open,false);
});
test('outside pointer and Escape close the menu; internal taps stay open and listeners clean up',()=>{
 const f=fixture(),cleanup=m.effects[0]();f.details.open=true;f.events.get('pointerdown')({target:f.inside});assert.equal(f.details.open,true);f.events.get('pointerdown')({target:f.outside});assert.equal(f.details.open,false);f.details.open=true;f.events.get('keydown')({key:'Escape'});assert.equal(f.details.open,false);assert.equal(f.summary.focused,true);cleanup();assert.equal(f.events.size,0);
});
test('WhatsApp uses the confirmed international number and the number is visibly available as fallback',()=>{
 assert.equal(m.WHATSAPP_NUMBER,'6285174389305');assert.equal(m.WHATSAPP_URL,'https://wa.me/'+m.WHATSAPP_NUMBER);const html=renderToStaticMarkup(createElement(m.CustomerSupport,{}));assert.match(html,/0851 7438 9305/);assert.match(html,/Salin nomor/);assert.match(html,/href="https:\/\/wa.me\/6285174389305" target="_blank" rel="noopener noreferrer"/);assert.match(html,/href="https:\/\/www.instagram.com\/elite.vtg\/"/);
});
test('copy confirms success only after the clipboard accepts the actual WhatsApp number',async()=>{
 let received;assert.equal(await m.copySupportNumber(async number=>{received=number}),true);assert.equal(received,m.WHATSAPP_NUMBER);assert.equal(await m.copySupportNumber(undefined),false);assert.equal(await m.copySupportNumber(async()=>{throw new Error('Permission denied')}),false);
});
