import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const require=createRequire(import.meta.url),esbuild=require('esbuild');
const state={order:null,shipment:null,reads:[],calls:[]};
globalThis.__jneSafetyState=state;
const serverFixture=`
const s=globalThis.__jneSafetyState;
export class AppError extends Error{constructor(status,message){super(message);this.status=status;}}
export function forbidden(name){s.calls.push(name);throw new Error('Unexpected boundary: '+name);}
export function db(){return {prepare(sql){s.reads.push(sql);return {bind(){return this;},async first(){if(/^SELECT \\* FROM orders WHERE id=\\?/.test(sql))return s.order;if(/^SELECT \\* FROM shipments WHERE order_id=\\?/.test(sql))return s.shipment;return forbidden('database mutation or extra lookup');},async run(){return forbidden('database write');}};},async batch(){return forbidden('database batch');}};}
export const settings=async()=>forbidden('settings');
export const encrypt=async()=>forbidden('encrypt');
export const decrypt=async()=>forbidden('decrypt');
export const bucket=()=>forbidden('storage');
export const telegram=async()=>forbidden('telegram');
export const hash=async()=>forbidden('hash');
export const random=()=>forbidden('random');
export const session=()=>forbidden('session');
`;
const shippingFixture=`
const s=globalThis.__jneSafetyState;
function forbidden(name){s.calls.push(name);throw new Error('Unexpected boundary: '+name);}
export const readShippingConfig=()=>forbidden('shipping config');
export const shippingClient=async()=>forbidden('Komship provider');
export const validOrigin=()=>forbidden('origin');
export const kiriminClient=async()=>forbidden('KiriminAja provider');
export const kiriminPin=async()=>forbidden('KiriminAja PIN');
export const kiriminSettings=async()=>forbidden('KiriminAja settings');
export const validCoordinatePair=()=>false;
`;
const fixtures={
 server:serverFixture,
 shipping:shippingFixture,
 customer:'export const currentCustomer=async()=>null;',
 env:"export const env={SITE_ORIGIN:'https://example.test'};",
 stock:"export async function synchronizeCatalogStock(){globalThis.__jneSafetyState.calls.push('stock sync');throw new Error('Unexpected stock sync');}",
 label:"export async function pdfToPng(){throw new Error('Unexpected label render');}",
};
mkdirSync('.test-runtime/tests',{recursive:true});
const bundled=await esbuild.build({stdin:{contents:`export * from './modules/order/fulfilment';export * from './modules/order/kirimin-fulfilment';export {customerTracking} from './modules/order/customer-tracking';export {orderProgress} from './modules/order/order-progress';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,plugins:[{name:'isolated-booking-boundaries',setup(b){
 b.onResolve({filter:/(?:^|\/)order-server$/},()=>({path:'server',namespace:'fixture'}));
 b.onResolve({filter:/(?:^|\/)(?:legacy-)?shipping-settings$/},()=>({path:'shipping',namespace:'fixture'}));
 b.onResolve({filter:/^@\/modules\/catalog\/customers$/},()=>({path:'customer',namespace:'fixture'}));
 b.onResolve({filter:/^@\/lib\/env$/},()=>({path:'env',namespace:'fixture'}));
 b.onResolve({filter:/(?:^|\/)catalog-bridge$/},()=>({path:'stock',namespace:'fixture'}));
 b.onResolve({filter:/(?:^|\/)label-render$/},()=>({path:'label',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path]}));
}}]});
const bundlePath=process.cwd()+'/.test-runtime/tests/jne-booking-safety.bundle.mjs';
writeFileSync(bundlePath,bundled.outputFiles[0].contents);
const m=await import(pathToFileURL(bundlePath));
globalThis.fetch=async()=>{state.calls.push('network');throw new Error('No real network calls permitted');};

const quote={id:'c'.repeat(64),destination:{id:90,label:'SIMULATED DESTINATION',province:'SIMULATED',city:'SIMULATED',district:'SIMULATED',village:'SIMULATED',postalCode:'78243'},amount:38000,grams:1000,service:'REG',courier:'jne',serviceName:'JNE Regular',source:'RajaOngkir/Komerce',checkedAt:1,expiresAt:2};
function order(extra={}){return {id:'EV-261015-ABCDEF12',created_at:1,name:'SIMULATED BUYER',phone:'081234567890',address:'SIMULATED ADDRESS',postcode:'78243',item:'SIMULATED PRODUCT',item_amount:300000,shipping_amount:38000,total:338000,status:'submitted',payment_state:'payment_confirmed',proof_key:'simulation-proof',notify_status:'sent',shipping_json:JSON.stringify(quote),...extra};}
function reset(o=order()){state.order=o;state.shipment=null;state.reads.length=0;state.calls.length=0;}
const isJneGuard=e=>e.status===409&&/JNE/.test(e.message)&&/manual/.test(e.message)&&/nomor resi/.test(e.message);

test('JNE quotes are rejected from both decoded and persisted invoice representations',()=>{
 for(const o of [order(),order({shipping_json:null,quote})]){
  reset(o);assert.throws(()=>m.assertJntBookingQuote(o),isJneGuard);
  assert.deepEqual(state.reads,[]);assert.deepEqual(state.calls,[]);
 }
});

test('old quotes without courier and explicit J&T quotes remain compatible',()=>{
 for(const courier of [undefined,'jnt']){
  const old={...quote,courier,service:'EZ',serviceName:'J&T Regular'};
  assert.doesNotThrow(()=>m.assertJntBookingQuote(order({shipping_json:JSON.stringify(old)})));
 }
 assert.doesNotThrow(()=>m.assertJntBookingQuote(order({shipping_json:null})));
});

test('both J&T payload builders reject JNE before constructing a booking payload',()=>{
 reset();
 assert.throws(()=>m.storePayload(order(),undefined,undefined,1000,undefined),isJneGuard);
 assert.throws(()=>m.kiriminPayload(order(),undefined,undefined,1000,undefined,undefined),isJneGuard);
 assert.deepEqual(state.calls,[]);assert.deepEqual(state.reads,[]);
});

test('JNE blocks dispatcher and direct provider processors before stock, leases, settings, or network',async()=>{
 for(const process of [m.processShipment,m.processKomshipShipment,m.processKiriminShipment]){
  reset();await assert.rejects(()=>process(state.order.id),isJneGuard);
  assert.deepEqual(state.calls,[]);
  assert.equal(state.reads.length,1);assert.match(state.reads[0],/^SELECT \* FROM orders WHERE id=\?/);
 }
});

test('existing J&T processors pass the new guard and reach their original settings boundary',async()=>{
 const old={...quote,courier:undefined,service:'EZ',serviceName:'J&T Regular'};
 for(const [process,boundary] of [[m.processKomshipShipment,'settings'],[m.processKiriminShipment,'KiriminAja settings']]){
  reset(order({shipping_json:JSON.stringify(old)}));
  await assert.rejects(()=>process(state.order.id),new RegExp('Unexpected boundary: '+boundary));
  assert.deepEqual(state.calls,[boundary]);
 }
});

test('unshipped JNE tracking stays neutral without provider polling',async()=>{
 for(const extra of [{payment_state:'proof_received'},{},{preparing_at:2,courier_name:'JNE'}]){
  reset(order(extra));
  const tracking=await m.customerTracking(state.order),progress=m.orderProgress(state.order,tracking);
  assert.equal(tracking.courier,'Pengiriman reguler');assert.equal(progress.courier,'Pengiriman reguler');
  assert.equal(tracking.awb,null);assert.equal(progress.trackingNumber,null);assert.deepEqual(state.calls,[]);
 }
});

test('shipped JNE keeps the actual recorded courier and tracking number',async()=>{
 reset(order({preparing_at:2,shipped_at:3,courier_name:'JNE',tracking_number:'SIMULATED123456'}));
 const tracking=await m.customerTracking(state.order),progress=m.orderProgress(state.order,tracking);
 assert.equal(tracking.courier,'JNE');assert.equal(tracking.awb,'SIMULATED123456');
 assert.equal(progress.courier,'JNE');assert.equal(progress.trackingNumber,'SIMULATED123456');assert.equal(progress.status,'SHIPPED');
 assert.deepEqual(state.calls,[]);
});

test('legacy J&T tracking defaults stay unchanged',async()=>{
 const old={...quote,courier:undefined,service:'EZ',serviceName:'J&T Regular'};
 reset(order({shipping_json:JSON.stringify(old),payment_state:'proof_received'}));
 const tracking=await m.customerTracking(state.order);
 assert.equal(tracking.courier,'J&T Express');
 assert.equal(m.orderProgress(state.order).courier,'J&T Regular');assert.deepEqual(state.calls,[]);
});
