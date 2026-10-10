import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync,readdirSync,mkdirSync,writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const require=createRequire(import.meta.url);
const esbuild=require("esbuild");
mkdirSync(".test-runtime/tests",{recursive:true});
const result=await esbuild.build({stdin:{contents:`export * from './modules/order/order-items';export * from './modules/order/order-types';export * from './modules/order/checkout-shipping';export * from './modules/order/customer-tracking';export * from './modules/order/tracking-types';export {GET as trackingGet,POST as trackingPost} from './app/api/order/tracking/route';export {GET as printGet} from './app/api/admin/order/print/[id]/route';export {GET as adminTrackingGet} from './app/api/admin/order/tracking/[id]/route';export {GET as invoiceGet} from './app/api/order/invoice/route';export {POST as buyerOrderPost} from './app/api/order/route';export {POST as buyerShippingPost} from './app/api/shipping/route';export * from './modules/order/fulfilment';export * from './modules/order/kiriminaja';export * from './modules/order/kirimin-fulfilment';export * from './modules/order/kirimin-webhook';export {GET as kiriminWebhookGet,POST as kiriminWebhookPost} from './app/api/kiriminaja/webhook/[token]/route';export {status as calculatorStatus} from './modules/shipping/shipping-server';export * from './modules/order/komship';export * from './modules/order/order-server';export * from './modules/order/shipping-settings';export * from './modules/order/telegram-actions';export * from './modules/order/label-render';export * from './modules/order/shipping-insurance';export {POST as webhook} from './app/api/telegram/webhook/route';export {POST as proofUpload} from './app/api/order/proof/route';export {GET as shippingGet,POST as shippingPost} from './app/api/admin/order/shipping/route';export {GET as labelGet,POST as shipmentPost} from './app/api/admin/order/shipments/[id]/route';export {GET as orderGet} from './app/api/order/route';export {POST as telegramSettingsPost} from './app/api/admin/order/telegram/route';`,resolveDir:process.cwd(),loader:"ts"},bundle:true,platform:"node",format:"esm",target:"node24",write:false,external:['@hyzyla/pdfium','next/headers','next/navigation'],banner:{js:"import {createRequire as createBundleRequire} from 'node:module';const require=createBundleRequire(import.meta.url);"},plugins:[{name:"test-bindings",setup(b){
b.onResolve({filter:/^next\/(headers|navigation)$/},args=>({path:args.path+'.js',external:true}));
b.onResolve({filter:/^@\/lib\/env$/},()=>({path:"env",namespace:"fixture"}));
b.onLoad({filter:/.*/,namespace:"fixture"},()=>({contents:'export const env=globalThis.__testEnv;'}));
b.onResolve({filter:/^@\/lib\/auth\/owner$/},()=>({path:"auth",namespace:"owner"}));
b.onLoad({filter:/.*/,namespace:"owner"},()=>({contents:'export async function getOwnerUser(){return globalThis.__testUser;}'}));
b.onResolve({filter:/legacy-shipping-server$/},()=>({path:"legacy",namespace:"legacy"}));
b.onLoad({filter:/.*/,namespace:"legacy"},()=>({contents:`export class ShippingError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}export async function search(){return []}export async function rates(id,grams){return globalThis.__legacyRates(id,grams)}export async function status(){return {connected:false}}export function assertSameOrigin(){}`}));
}}]});
writeFileSync(".test-runtime/tests/bundle.mjs",result.outputFiles[0].contents);
const sqlite=new DatabaseSync(":memory:");
for(const file of readdirSync("migrations").filter(x=>x.endsWith(".sql")).sort())sqlite.exec(readFileSync("migrations/"+file,"utf8"));
function prepared(sql,values=[]){const stmt=sqlite.prepare(sql);return {bind(...v){return prepared(sql,v);},async first(){return stmt.get(...values)||null;},async all(){return {results:stmt.all(...values)};},async run(){const r=stmt.run(...values);return {meta:{changes:Number(r.changes)}};}};}
const storage=new Map();
globalThis.__testEnv={CONFIG_SECRET:"simulation-secret-not-a-live-credential-123456789",SITE_ORIGIN:"https://example.test",OWNER_EMAIL:"owner@example.test",DB:{prepare:prepared,client:{async transaction(){sqlite.exec('BEGIN IMMEDIATE');return {async execute(input){const sql=typeof input==='string'?input:input.sql,args=typeof input==='string'?[]:input.args;const stmt=sqlite.prepare(sql);if(/RETURNING|^SELECT/i.test(sql))return {rows:stmt.all(...args),rowsAffected:0};return {rows:[],rowsAffected:Number(stmt.run(...args).changes)}},async commit(){sqlite.exec('COMMIT')},async rollback(){sqlite.exec('ROLLBACK')},close(){}}}},async batch(statements){sqlite.exec("BEGIN");try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec("COMMIT");return results;}catch(e){sqlite.exec("ROLLBACK");throw e;}}},BUCKET:{async head(key){const bytes=storage.get(key);return bytes?{size:bytes.length,httpMetadata:{contentType:"image/png"}}:null;},async put(key,data){storage.set(key,data instanceof Uint8Array?data:new Uint8Array(data));},async get(key){const bytes=storage.get(key);return bytes?{size:bytes.length,body:bytes,arrayBuffer:async()=>bytes.slice().buffer}:null;},async delete(key){storage.delete(key);}}};
globalThis.__testUser={userId:"owner-id",email:"owner@example.test"};
const m=await import(pathToFileURL(process.cwd()+"/.test-runtime/tests/bundle.mjs"));
const pdf=new Uint8Array(readFileSync("tests/fixtures/komship-simulated-label.pdf"));
let telegramTexts=[];let telegramDeliveries=[];let providerServices=[];let counts={};let failed="",nextMessage=100,hook="",lastPayload=null;let providerDelay=0,pickupAccepted=false,trackingResponse=null;
function json(data,code=200){return Response.json({meta:{code,status:code<400?"success":"failed"},data},{status:code});}
const origin={id:10,label:"BALEENDAH, BALEENDAH, BANDUNG, 40375",village:"BALEENDAH",district:"BALEENDAH",city:"BANDUNG",postcode:"40375"};
const destination={id:20,label:"TENGAH, PONTIANAK KOTA, PONTIANAK, 78243",village:"TENGAH",district:"PONTIANAK KOTA",city:"PONTIANAK",postcode:"78243"};
const rawLocation=l=>({id:l.id,label:l.label,subdistrict_name:l.village,district_name:l.district,city_name:l.city,zip_code:l.postcode});
globalThis.__legacyRates=async(id,grams)=>{assert.equal(id,90);assert.equal(grams,1000);return {destination:destination.label,weight:1,services:providerServices}};
globalThis.fetch=async(input,init={})=>{
 const url=new URL(typeof input==="string"?input:input.url);
 if(url.hostname==="api.telegram.org"){
  if(typeof init.body==="string"&&url.pathname.endsWith("/sendMessage"))telegramTexts.push(JSON.parse(init.body).text);
  const method=url.pathname.split("/").at(-1);counts[method]=(counts[method]||0)+1;
  if(method==="getMe")return Response.json({ok:true,result:{username:"ELITE_SIMULATED_BOT"}});
  if(method==="deleteWebhook"){hook="";return Response.json({ok:true,result:true});}
  if(method==="getWebhookInfo")return Response.json({ok:true,result:{url:hook}});
  if(method==="setWebhook"){hook=JSON.parse(init.body).url;return Response.json({ok:true,result:true});}
  if(method==="sendDocument"&&failed==="telegram-png"&&init.body.get("document").name.endsWith(".png")){failed="";throw new Error("simulated Telegram PNG failure");}
  if(method==="sendMessage"||method==="sendDocument"){
   const payload=typeof init.body==="string"?JSON.parse(init.body):null;
   const kind=method==="sendDocument"?"proof":payload.text.includes("· DETAIL PENERIMA")?"recipient":payload.text.includes("· INVOICE")?"invoice":"other";
   if(failed==="telegram-"+kind){failed="";return Response.json({ok:false,error_code:503});}
   telegramDeliveries.push({kind,chat_id:payload?.chat_id||init.body.get("chat_id"),text:payload?.text||init.body.get("caption"),reply_markup:payload?.reply_markup,entities:payload?.entities,message_id:nextMessage});
  }
  return Response.json({ok:true,result:{message_id:nextMessage++}});
 }
 assert.ok(["api.collaborator.komerce.id","api-sandbox.collaborator.komerce.id"].includes(url.hostname),"No real network calls allowed");
 const path=url.pathname;counts[path]=(counts[path]||0)+1;
 if(path.endsWith("/history-airway-bill")){assert.equal(url.searchParams.get("shipping"),"JNT");assert.equal(url.searchParams.get("airway_bill"),"SIMULASI12345678");assert.equal(init.headers["x-api-key"],"SIMULATED_SHIPPING_KEY");if(failed==="tracking-error")return json(null,500);if(failed==="tracking-empty")return json({},400);if(failed==="tracking-delay")await new Promise(r=>setTimeout(r,15));return json(trackingResponse||{airway_bill:"SIMULASI12345678",last_status:"IN TRANSIT",history:[{desc:"Paket tiba di pusat sortir Bandung",date:"2026-10-05 18:20:00",code:"SORT",status:"IN TRANSIT"},{desc:"Paket dijemput kurir",date:"2026-10-05 12:00:00",code:"PICK",status:"PICKED UP"}],receiver_phone:"081234567890",receiver_address:"PRIVATE ADDRESS",api_key:"PRIVATE KEY"});}
 if(path.endsWith("destination/search"))return json([rawLocation(url.searchParams.get("keyword")==="40375"?origin:destination)]);
 if(path.endsWith("/calculate"))return json({calculate_reguler:[{shipping_name:"JNT",service_name:"EZ",shipping_cost:38000,shipping_cashback:9500,shipping_cost_net:28500},{shipping_name:"JNT",service_name:"EZ",shipping_cost:38000,shipping_cashback:10000,shipping_cost_net:28000}]});
 if(path.endsWith("/store")){
  lastPayload=JSON.parse(init.body);if(providerDelay)await new Promise(r=>setTimeout(r,providerDelay));
  if(failed==="timeout"){failed="";throw new Error("timeout after provider may have booked");}
  if(failed==="rejected"){failed="";return json(null,422);}
  return json({order_id:111,order_no:"KOMSIM"+counts[path]},201);
 }
 if(path.endsWith("/detail")&&url.searchParams.get("order_no")==="WRONG123")return json({order_no:"WRONG123",receiver_phone:"089999999999"});
 if(path.endsWith("/detail")){
  const detail={order_no:url.searchParams.get("order_no"),awb:pickupAccepted?"SIMULASI12345678":"",order_status:pickupAccepted?"Pickup Scheduled":"Diajukan",...(lastPayload||{})};
  if(failed==="insurance-missing")delete detail.insurance_value;
  if(failed==="insurance-mismatch")detail.insurance_value=0;
  if(failed==="insurance-underdeclared")detail.order_details=[{product_price:250000,qty:1,subtotal:250000}];
  return json(detail);
 }
 if(path.endsWith("/pickup/request")){
  const no=JSON.parse(init.body).orders[0].order_no;
  if(failed==="pickup-rejected"){failed="";return json([{status:"failed",order_no:no,awb:""}]);}
  pickupAccepted=true;if(failed==="pickup-timeout"){failed="";throw new Error("simulated timeout after pickup accepted");}
  return json([{status:"success",order_no:no,awb:"SIMULASI12345678"}],201);
 }
 if(path.endsWith("/print-label")){if(failed==="label"){failed="";return json(null,500);}return json({path:"/storage/label-simulated.pdf",base_64:Buffer.from(pdf).toString("base64")});}
 throw new Error("Unexpected API call: "+path);
};
const shippingConfig={enabled:true,environment:"sandbox",senderName:"ELITE.VTG",senderPhone:"081321423020",senderAddress:"Kp. Cipicung RT 01 RW 01 No. 43, Kec. Baleendah, Kab. Bandung, Jawa Barat",senderPostcode:"40375",senderEmail:"owner@example.test",origin,defaultGrams:1000,length:30,width:20,height:5,pickupTime:"14:00",pickupVehicle:"Motor",pickupDay:"next_day",labelPage:"page_6"};
async function setup(){sqlite.exec("DELETE FROM tracking_links;DELETE FROM shipment_tracking;DELETE FROM telegram_receipts;DELETE FROM shipments;DELETE FROM orders;DELETE FROM settings;DELETE FROM limits;DELETE FROM kirimin_search_cache;");storage.clear();const qrisBytes=new Uint8Array(80);qrisBytes.set([137,80,78,71,13,10,26,10]);storage.set('qris/test',qrisBytes);Object.assign(globalThis.__testEnv,{PAYMENT_QRIS_KEY:'qris/test',PAYMENT_QRIS_MIME:'image/png',PAYMENT_QRIS_MERCHANT:'MERCHANT SIMULASI',PAYMENT_QRIS_SHA256:Buffer.from(await crypto.subtle.digest('SHA-256',qrisBytes)).toString('hex')});telegramTexts=[];telegramDeliveries=[];counts={};failed="";lastPayload=null;providerDelay=0;pickupAccepted=false;trackingResponse=null;hook="https://example.test/api/telegram/webhook";await prepared("INSERT INTO settings(id,owner_id,bot_cipher,chat_id,qris_key,shipping_cipher,shipping_config,webhook_cipher,webhook_active) VALUES(1,?,?,?,?,?,?,?,1)").bind("owner-id",await m.encrypt("11111:SIMULATED_TOKEN"),"123456","test-qris",await m.encrypt("SIMULATED_SHIPPING_KEY"),JSON.stringify(shippingConfig),await m.encrypt("webhook-test-secret")).run();globalThis.__testUser={userId:"owner-id",email:"owner@example.test"};}
const id="EV-261004-ABCDEF12";
async function addOrder(withProof=true){const token="b".repeat(64);const q={id:"c".repeat(64),destination:{id:90,label:destination.label,province:"KALIMANTAN BARAT",city:"PONTIANAK",district:"PONTIANAK KOTA",village:"TENGAH",postalCode:"78243"},amount:38000,grams:1000,service:"EZ",source:"RajaOngkir/Komerce",checkedAt:Date.now(),expiresAt:Date.now()+100000};await prepared("INSERT INTO orders(id,created_at,session_hash,name,phone,address,postcode,item,total,item_amount,shipping_amount,shipping_json,status,payment_state,proof_key,proof_mime,invoice_message,delivery_chat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,Date.now(),await m.hash(token),"PEMBELI SIMULASI","081234567890","Jl. Jendral Urip No. 24","78243","PRL crewneck",338000,300000,38000,JSON.stringify(q),withProof?"submitted":"awaiting_proof",withProof?"proof_received":"awaiting_proof",withProof?"proof/test":null,withProof?"image/png":null,"50","123456").run();storage.set("proof/test",new Uint8Array(100));if(withProof)sqlite.prepare("INSERT INTO shipments(order_id,provider,state,updated_at) VALUES(?,'komship','awaiting_confirmation',?)").run(id,Date.now());return token;}
async function confirm(){await m.confirmPayment(id,"123456",50);}
function webhook(update,idUser=123456,header="webhook-test-secret",message=50){return m.webhook(new Request("https://example.test/api/telegram/webhook",{method:"POST",headers:{"Content-Type":"application/json","X-Telegram-Bot-Api-Secret-Token":header},body:JSON.stringify({update_id:update,callback_query:{id:String(update),from:{id:idUser,is_bot:false},message:{message_id:message,chat:{id:idUser,type:"private"}},data:"confirm:"+id}})}));}

test("upload proof preserves customer success without creating any shipment",async()=>{await setup();const token=await addOrder(false);const form=new FormData();const bytes=new Uint8Array(80);bytes.set([137,80,78,71,13,10,26,10]);form.set("file",new Blob([bytes],{type:"image/png"}),"proof.png");const r=await m.proofUpload(new Request("https://example.test/api/order/proof",{method:"POST",headers:{Origin:"https://example.test",Cookie:"elite_order="+token},body:form}));assert.equal(r.status,200);assert.equal((await r.json()).status,"submitted");assert.equal(sqlite.prepare("SELECT payment_state FROM orders").get().payment_state,"proof_received");assert.equal(sqlite.prepare("SELECT count(*) AS n FROM shipments").get().n,0);assert.equal(counts["/order/api/v1/orders/store"]||0,0);});
test("only correct Telegram owner, private chat, and webhook secret can confirm",async()=>{await setup();await addOrder();assert.equal((await webhook(1,123456,"wrong-secret")).status,403);await webhook(2,654321);await webhook(3,123456,"webhook-test-secret",999);assert.equal(sqlite.prepare("SELECT payment_state FROM orders").get().payment_state,"proof_received");assert.equal(counts["/order/api/v1/orders/store"]||0,0);assert.throws(()=>m.verifyCallback({from:{id:123456},message:{chat:{id:123456,type:"group"}}},{chat_id:"123456"}));});
test("anonymous and another owner identity cannot read shipping settings or labels",async()=>{await setup();globalThis.__testUser=null;assert.equal((await m.shippingGet()).status,401);assert.equal((await m.labelGet(new Request("https://example.test/x?format=pdf"),{params:Promise.resolve({id})})).status,401);globalThis.__testUser={userId:"another",email:"another@example.test"};assert.equal((await m.shippingGet()).status,403);assert.equal((await m.shipmentPost(new Request("https://example.test/x",{method:"POST",headers:{Origin:"https://example.test","Content-Type":"application/json"},body:JSON.stringify({action:"retry"})}),{params:Promise.resolve({id})})).status,403);});
test("confirmation creates one booking, pickup, official PDF and matching PNG",async()=>{await setup();await addOrder();await webhook(10);await webhook(10);await webhook(11);assert.equal(counts["/order/api/v1/orders/store"],1);assert.equal(counts["/order/api/v1/pickup/request"],1);const s=await m.shipment(id);assert.equal(s.state,"awb_available");assert.ok(s.pdf_message&&s.png_message);assert.deepEqual(storage.get(s.label_pdf),pdf);assert.equal(Buffer.from(storage.get(s.label_png).subarray(0,8)).toString("hex"),"89504e470d0a1a0a");assert.equal(lastPayload.shipping_cashback,10000);assert.equal(lastPayload.order_details[0].product_weight,1000);assert.equal(lastPayload.payment_method,"BANK TRANSFER");assert.equal(lastPayload.cod_value,0);assert.equal(lastPayload.insurance_value,600);assert.equal(lastPayload.additional_cost,0);assert.equal(lastPayload.grand_total,338000);assert.equal(s.insurance_state,"verified");assert.equal(s.insured_value,300000);assert.equal(s.insurance_fee,600);assert.equal(lastPayload.shipper_phone,"6281321423020");writeFileSync(".test-runtime/tests/label.png",storage.get(s.label_png));});
test("simultaneous clicks still create exactly one provider booking",async()=>{await setup();await addOrder();await confirm();providerDelay=30;await Promise.all([m.processShipment(id),m.processShipment(id),m.processShipment(id)]);assert.equal(counts["/order/api/v1/orders/store"],1);});
test("explicit booking rejection is retryable; one accepted booking is retained",async()=>{await setup();await addOrder();await confirm();failed="rejected";await m.processShipment(id);assert.equal((await m.shipment(id)).create_sent_at,null);await m.processShipment(id);await m.processShipment(id);assert.equal(counts["/order/api/v1/orders/store"],2);assert.equal(counts["/order/api/v1/pickup/request"],1);});
test("ambiguous booking time-out permanently blocks a blind create retry",async()=>{await setup();await addOrder();await confirm();failed="timeout";await m.processShipment(id);await m.processShipment(id);assert.equal(counts["/order/api/v1/orders/store"],1);assert.equal((await m.shipment(id)).state,"booking_unknown");await assert.rejects(()=>m.reconcileBooking(id,"WRONG123"));assert.equal(counts["/order/api/v1/orders/store"],1);});
test("failed label generation resumes existing booking without another store or pickup",async()=>{await setup();await addOrder();await confirm();failed="label";await m.processShipment(id);const before=await m.shipment(id);assert.ok(before.provider_no);await m.processShipment(id);assert.equal(counts["/order/api/v1/orders/store"],1);assert.equal(counts["/order/api/v1/pickup/request"],1);assert.ok((await m.shipment(id)).png_message);});
test("failed PNG Telegram delivery retries only unsent file; PDF bytes are reused",async()=>{await setup();await addOrder();await confirm();failed="telegram-png";await m.processShipment(id);const s=await m.shipment(id);assert.ok(s.pdf_message&&!s.png_message);const pdfMessage=s.pdf_message;await m.processShipment(id);assert.equal((await m.shipment(id)).pdf_message,pdfMessage);assert.equal(counts["/order/api/v1/orders/store"],1);assert.equal(counts["/order/api/v1/orders/print-label"],1);assert.equal(counts.sendDocument,3);});
test("unconfirmed payment and inactive account never trigger provider create",async()=>{await setup();await addOrder();await assert.rejects(()=>m.processShipment(id));await confirm();sqlite.prepare("UPDATE settings SET shipping_cipher=NULL").run();await m.processShipment(id);assert.equal(counts["/order/api/v1/orders/store"]||0,0);assert.equal((await m.shipment(id)).state,"booking_failed");});
test("max spending cap blocks a costly shipment before any booking",async()=>{await setup();await addOrder();await confirm();sqlite.prepare("UPDATE shipments SET max_cost=1000").run();await m.processShipment(id);assert.equal(counts["/order/api/v1/orders/store"]||0,0);assert.match((await m.shipment(id)).last_error,/melebihi batas/);});
test("public order response omits owner IDs, proofs, and shipment configuration",async()=>{await setup();const token=await addOrder();await confirm();const r=await m.orderGet(new Request("https://example.test/api/order",{headers:{Cookie:"elite_order="+token}}));const o=await r.json();for(const k of ["confirmed_by","proof_key","session_hash","delivery_chat","shipping_json","config_json","recipient_message"])assert.ok(!(k in o));assert.equal(o.status,"submitted");assert.equal(o.total,338000);});
test("pickup timing rolls over in WIB; cashback selection stays J&T Regular",()=>{const c={...shippingConfig,pickupDay:"same_or_next"};assert.equal(m.pickupSchedule(c,Date.parse("2026-10-04T12:30:00+07:00")).date,"2026-10-04");assert.equal(m.pickupSchedule(c,Date.parse("2026-10-04T14:30:00+07:00")).date,"2026-10-05");assert.throws(()=>m.bestRegularRate([{shipping_name:"JNE",service_name:"REG",shipping_cost:10000,shipping_cashback:9000,shipping_cost_net:1000}]));});

function ownerAction(action,extra={}){return m.shipmentPost(new Request("https://example.test/api/admin/shipments/"+id,{method:"POST",headers:{Origin:"https://example.test","Content-Type":"application/json"},body:JSON.stringify({action,...extra})}),{params:Promise.resolve({id})});}
test("owner package settings wait for Telegram confirmation and cannot book",async()=>{await setup();await addOrder();const r=await ownerAction("package",{grams:1700,maxCost:40000});assert.equal(r.status,200);assert.equal((await m.shipment(id)).state,"awaiting_confirmation");await assert.rejects(()=>m.processShipment(id));assert.equal(counts["/order/api/v1/orders/store"]||0,0);await confirm();assert.equal((await m.shipment(id)).state,"payment_confirmed");await m.processShipment(id);assert.equal(lastPayload.order_details[0].product_weight,1700);});
test("an existing invoice can gain the button without confirming or booking",async()=>{await setup();await addOrder();assert.equal((await ownerAction("confirmation-button")).status,200);assert.equal(counts.editMessageReplyMarkup,1);assert.equal(sqlite.prepare("SELECT payment_state FROM orders").get().payment_state,"proof_received");assert.equal(counts["/order/api/v1/orders/store"]||0,0);});
test("matching uncertain booking can be reconciled and reused without creating another",async()=>{await setup();await addOrder();await confirm();failed="timeout";await m.processShipment(id);await m.reconcileBooking(id,"KOMREC123");await m.processShipment(id);assert.equal(counts["/order/api/v1/orders/store"],1);assert.equal((await m.shipment(id)).provider_no,"KOMREC123");assert.ok((await m.shipment(id)).png_message);});
test("pickup timeout rechecks provider state and never repeats accepted pickup",async()=>{await setup();await addOrder();await confirm();failed="pickup-timeout";await m.processShipment(id);assert.equal((await m.shipment(id)).pickup_state,"unknown");await m.processShipment(id);assert.equal(counts["/order/api/v1/orders/store"],1);assert.equal(counts["/order/api/v1/pickup/request"],1);assert.equal((await m.shipment(id)).pickup_state,"scheduled");assert.ok((await m.shipment(id)).png_message);});
test("explicit pickup rejection retries pickup on the same booking",async()=>{await setup();await addOrder();await confirm();failed="pickup-rejected";await m.processShipment(id);assert.equal((await m.shipment(id)).pickup_state,"failed");await m.processShipment(id);assert.equal(counts["/order/api/v1/orders/store"],1);assert.equal(counts["/order/api/v1/pickup/request"],2);assert.ok((await m.shipment(id)).png_message);});
test("owner label download returns original bytes with private cache policy",async()=>{await setup();await addOrder();await confirm();await m.processShipment(id);const r=await m.labelGet(new Request("https://example.test/x?format=pdf"),{params:Promise.resolve({id})});assert.equal(r.status,200);assert.equal(r.headers.get("Cache-Control"),"private, no-store");assert.deepEqual(new Uint8Array(await r.arrayBuffer()),pdf);});
test("reconnecting the existing bot removes its own webhook for safe pairing",async()=>{await setup();const r=await m.telegramSettingsPost(new Request("https://example.test/api/admin/telegram",{method:"POST",headers:{Origin:"https://example.test","Content-Type":"application/json"},body:JSON.stringify({action:"save",token:"11111:"+"S".repeat(40)})}));assert.equal(r.status,200);assert.equal(counts.deleteWebhook,1);assert.equal(sqlite.prepare("SELECT webhook_active FROM settings").get().webhook_active,0);});
test("provider courier aliases use documented JNT/EZ order identifiers",()=>{assert.deepEqual(m.bestRegularRate([{shipping_name:"J&T EXPRESS",service_name:"REGULAR",shipping_cost:20000,shipping_cashback:5000,shipping_cost_net:15000}]),{courier:"JNT",service:"EZ",gross:20000,cashback:5000,net:15000});});

test("J&T premium uses product price, not product plus shipping, including float cents",()=>{assert.deepEqual(m.jntInsuranceQuote(400000),{eligible:true,declaredValue:400000,premium:800});assert.equal(m.jntInsuranceQuote(315555).premium,631.11);assert.equal(m.jntInsuranceQuote(299999).eligible,false);assert.equal(m.jntInsuranceQuote(300000).eligible,true);});
test("orders below insurance minimum are held and never create an uninsured shipment",async()=>{await setup();await addOrder();sqlite.prepare("UPDATE orders SET item_amount=250000,total=288000").run();await confirm();await m.processShipment(id);await m.processShipment(id);assert.equal(counts["/order/api/v1/orders/store"]||0,0);assert.match((await m.shipment(id)).last_error,/Asuransi wajib/);});
test("shipping plus insurance spending cap is enforced before create",async()=>{await setup();await addOrder();await confirm();sqlite.prepare("UPDATE shipments SET max_cost=28500").run();await m.processShipment(id);assert.equal(counts["/order/api/v1/orders/store"]||0,0);assert.match((await m.shipment(id)).last_error,/asuransi.*melebihi batas/);});
test("missing provider insurance holds pickup and retries the already accepted booking",async()=>{await setup();await addOrder();await confirm();failed="insurance-missing";await m.processShipment(id);assert.ok((await m.shipment(id)).provider_no);assert.equal((await m.shipment(id)).insurance_state,"unverified");assert.equal(counts["/order/api/v1/pickup/request"]||0,0);failed="";await m.processShipment(id);assert.equal(counts["/order/api/v1/orders/store"],1);assert.equal((await m.shipment(id)).insurance_state,"verified");assert.ok((await m.shipment(id)).png_message);});
test("incorrect insured product value holds pickup even if premium was recorded",async()=>{await setup();await addOrder();await confirm();failed="insurance-underdeclared";await m.processShipment(id);assert.equal(counts["/order/api/v1/pickup/request"]||0,0);assert.equal((await m.shipment(id)).insurance_state,"unverified");});
test("reconciliation refuses an existing booking without the requested insurance",async()=>{await setup();await addOrder();await confirm();failed="timeout";await m.processShipment(id);failed="insurance-mismatch";await assert.rejects(()=>m.reconcileBooking(id,"KOMREC123"));assert.equal((await m.shipment(id)).provider_no,null);assert.equal(counts["/order/api/v1/orders/store"],1);});
test("configuration cannot disable mandatory insurance or increase customer invoice",async()=>{await setup();const token=await addOrder();sqlite.prepare("UPDATE settings SET shipping_config=?").run(JSON.stringify({...shippingConfig,insuranceEnabled:false,insuranceRequired:false}));await confirm();await m.processShipment(id);assert.equal(lastPayload.insurance_value,600);assert.equal(lastPayload.additional_cost,0);const o=await (await m.orderGet(new Request("https://example.test/api/order",{headers:{Cookie:"elite_order="+token}}))).json();assert.equal(o.total,338000);});

async function checkoutSetup(){
 await setup();sqlite.exec("DELETE FROM shipping_locations;DELETE FROM shipping_quotes;");
 const location={id:90,label:destination.label,province:"KALIMANTAN BARAT",city:"PONTIANAK",district:"PONTIANAK KOTA",village:"TENGAH",postalCode:"78243"};
 await prepared("INSERT INTO shipping_locations(id,payload,expires_at) VALUES(?,?,?)").bind(90,JSON.stringify(location),Date.now()+100000).run();
 providerServices=[{service:"SUPER",description:"Super",amount:55000,etd:"1 hari"},{service:"EZ",description:"Regular",amount:38000,etd:"3–5 hari"}];
 return m.shippingQuotes(90,1000);
}
function buyerRequest(values,cookie=""){
 return m.buyerOrderPost(new Request("https://example.test/api/order",{method:"POST",headers:{Origin:"https://example.test","Content-Type":"application/json",...(cookie?{Cookie:cookie}:{})},body:JSON.stringify({name:"PEMBELI SIMULASI",phone:"081234567890",address:"Jl. Jendral Urip No. 24",postcode:"78243",itemAmount:300000,consent:true,...values})}));
}
test("legacy one-item orders remain valid; every extra item requires its own name",()=>{
 assert.deepEqual(m.normalizeOrderItems({item:"Kemeja vintage"}),{quantity:1,items:["Kemeja vintage"],item:"Kemeja vintage"});
 assert.deepEqual(m.normalizeOrderItems({quantity:2,items:[" Kemeja A12 ","Celana B34"]}).items,["Kemeja A12","Celana B34"]);
 for(const value of [{quantity:2,items:["Kemeja"]},{quantity:2,items:["Kemeja",""]},{quantity:0,items:[]},{quantity:21,items:Array(21).fill("Kemeja")},{quantity:2,item:"Kemeja"}])assert.throws(()=>m.normalizeOrderItems(value));
});
test("multi-item checkout persists and reloads names with selected server-priced service",async()=>{
 const quotes=await checkoutSetup();assert.equal(quotes[0].service,"EZ");const superQuote=quotes.find(q=>q.service==="SUPER");
 assert.equal((await buyerRequest({quantity:2,items:["Kemeja A12","Celana B34"],quoteId:superQuote.id,total:1,shipping_amount:1})).status,400);
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM orders").get().n,0);
 const response=await buyerRequest({quantity:2,items:["Kemeja A12","Celana B34"],quoteId:superQuote.id});
 assert.equal(response.status,201);const created=await response.json();assert.equal(created.quantity,2);assert.equal(created.total,355000);assert.equal(created.item_amount,300000);assert.equal(created.quote.service,"SUPER");
 const cookie=response.headers.get("set-cookie").split(";")[0];const restored=await (await m.orderGet(new Request("https://example.test/api/order",{headers:{Cookie:cookie}}))).json();
 assert.deepEqual(restored.items,["Kemeja A12","Celana B34"]);assert.equal(restored.quantity,2);
 const row=sqlite.prepare("SELECT quantity,items_json FROM orders").get();assert.equal(row.quantity,2);assert.deepEqual(JSON.parse(row.items_json),restored.items);
 const updated=await buyerRequest({quantity:1,items:["Jaket C56"],quoteId:quotes[0].id},cookie);assert.equal(updated.status,200);const changed=await updated.json();assert.equal(changed.total,338000);assert.deepEqual(changed.items,["Jaket C56"]);assert.equal(changed.quote.service,"EZ");assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM orders").get().n,1);
});
test("incomplete item names, expired quotes, mismatched postcodes, and forged quotes are rejected",async()=>{
 const [quote]=await checkoutSetup();
 assert.equal((await buyerRequest({quantity:2,items:["Kemeja",""] ,quoteId:quote.id})).status,400);
 assert.equal((await buyerRequest({quantity:2,items:["Kemeja"],quoteId:quote.id})).status,400);
 assert.equal((await buyerRequest({item:"Kemeja",quoteId:quote.id,postcode:"40375"})).status,409);
 assert.equal((await buyerRequest({item:"Kemeja",quoteId:"a".repeat(64)})).status,409);
 sqlite.prepare("UPDATE shipping_quotes SET expires_at=0").run();assert.equal((await buyerRequest({item:"Kemeja",quoteId:quote.id})).status,409);
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM orders").get().n,0);
});
test("available service API validates tariffs and refuses an unavailable route",async()=>{
 await checkoutSetup();providerServices.push({service:"FREE",amount:0},{service:"BAD",amount:NaN},{service:"EZ",amount:1});
 const request=()=>m.buyerShippingPost(new Request("https://example.test/api/shipping",{method:"POST",headers:{Origin:"https://example.test","Content-Type":"application/json"},body:JSON.stringify({action:"rates",destinationId:90,quantity:1,grams:1000})}));
 const response=await request();assert.equal(response.status,200);const {quotes}=await response.json();assert.deepEqual(quotes.map(q=>q.service),["EZ","SUPER"]);assert.equal(quotes[0].amount,38000);
 providerServices=[];assert.equal((await request()).status,503);
});
test("two item names and chosen service reach invoice and Telegram without exposing provider text",async()=>{
 const quotes=await checkoutSetup();const created=await buyerRequest({quantity:2,items:["Kemeja A12","Celana B34"],quoteId:quotes.find(q=>q.service==="SUPER").id});const order=await created.json();
 const invoice=m.invoiceText(order);assert.match(invoice,/Jumlah barang: 2/);assert.match(invoice,/1\. Kemeja A12\n2\. Celana B34/);assert.match(invoice,/J&T Super/);assert.doesNotMatch(invoice,/RajaOngkir|Komerce/);
 const cookie=created.headers.get("set-cookie").split(";")[0],form=new FormData(),bytes=new Uint8Array(80);bytes.set([137,80,78,71,13,10,26,10]);form.set("file",new Blob([bytes],{type:"image/png"}),"proof.png");
 const uploaded=await m.proofUpload(new Request("https://example.test/api/order/proof",{method:"POST",headers:{Origin:"https://example.test",Cookie:cookie},body:form}));assert.equal(uploaded.status,200);
 assert.ok(telegramTexts.some(text=>text.includes("Jumlah barang: 2")&&text.includes("Kemeja A12")&&text.includes("Celana B34")&&text.includes("J&T Super")));
 assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM shipments").get().n,0);assert.equal(counts["/order/api/v1/orders/store"]||0,0);
});
test("largest cashback applies only within buyer-selected service, with no silent fallback",()=>{
 const rows=[{shipping_name:"JNT",service_name:"EZ",shipping_cost:38000,shipping_cashback:30000,shipping_cost_net:8000},{shipping_name:"JNT",service_name:"SUPER",shipping_cost:55000,shipping_cashback:5000,shipping_cost_net:50000},{shipping_name:"JNT",service_name:"SUPER",shipping_cost:55000,shipping_cashback:7000,shipping_cost_net:48000}];
 assert.deepEqual(m.bestJntRate(rows,"SUPER"),{courier:"JNT",service:"SUPER",gross:55000,cashback:7000,net:48000});assert.throws(()=>m.bestJntRate(rows,"ECO"));
});
test("multi-item shipment preserves the agreed total and names without inventing unit prices",async()=>{
 await setup();await addOrder();const row=sqlite.prepare("SELECT * FROM orders").get();const payload=m.storePayload({...row,quantity:2,items_json:JSON.stringify(["Kemeja A12","Celana B34"])},shippingConfig,destination,1000,{courier:"JNT",service:"EZ",gross:38000,cashback:10000,net:28000});
 assert.equal(payload.order_details[0].subtotal,300000);assert.equal(payload.order_details[0].qty,1);assert.equal(payload.order_details[0].product_name,"Kemeja A12; Celana B34");assert.equal(payload.order_details[0].product_variant_name,"Paket 2 barang");assert.match(payload.notes,/2 barang/);assert.equal(payload.insurance_value,600);
});

async function freshNotification(withProof=true){
 await setup();const token=await addOrder(withProof);
 sqlite.prepare("UPDATE orders SET invoice_message=NULL,proof_message=NULL,recipient_message=NULL").run();return token;
}
test("proof upload delivers exactly three separate owner messages and keeps full customer invoice",async()=>{
 const token=await freshNotification(false),bytes=new Uint8Array(80);bytes.set([137,80,78,71,13,10,26,10]);
 const upload=()=>{const form=new FormData();form.set("file",new Blob([bytes],{type:"image/png"}),"proof.png");return m.proofUpload(new Request("https://example.test/api/order/proof",{method:"POST",headers:{Origin:"https://example.test",Cookie:"elite_order="+token},body:form}));};
 const response=await upload();assert.equal(response.status,200);const customer=await response.json();assert.equal(customer.notify_status,"sent");
 assert.deepEqual(telegramDeliveries.map(p=>p.kind),["proof","invoice","recipient"]);for(const p of telegramDeliveries){assert.equal(p.chat_id,"123456");assert.ok(p.text.includes(id));}
 const invoice=telegramDeliveries[1],recipient=telegramDeliveries[2];assert.match(invoice.text,/PRL crewneck/);assert.match(invoice.text,/Jumlah barang: 1/);assert.equal(invoice.reply_markup.inline_keyboard[0][0].callback_data,"confirm:"+id);
 for(const value of [customer.name,customer.phone,customer.address,destination.label,customer.postcode]){assert.ok(!invoice.text.includes(value));assert.ok(recipient.text.includes(value));}
 assert.ok(!recipient.text.includes("PRL crewneck"));assert.ok(!recipient.text.includes("Total pembayaran"));
 const address=[customer.address,customer.quote.destination.label,`Kode pos: ${customer.postcode}`].join("\n"),buttons=recipient.reply_markup.inline_keyboard.flat();
 assert.equal(buttons.length,1);assert.equal(buttons[0].text,"Salin alamat");assert.equal(buttons[0].copy_text.text,address);
 assert.ok(!buttons[0].copy_text.text.includes(customer.name));assert.ok(!buttons[0].copy_text.text.includes(customer.phone));
 assert.equal(recipient.entities.length,1);const entity=recipient.entities[0];assert.equal(entity.type,"pre");assert.equal(recipient.text.slice(entity.offset,entity.offset+entity.length),address);
 for(const value of [customer.name,customer.phone,customer.address])assert.ok(m.invoiceText(customer).includes(value));
 const row=sqlite.prepare("SELECT * FROM orders").get();for(const k of ["proof_message","invoice_message","recipient_message"])assert.ok(row[k]);assert.ok(!("recipient_message" in customer));
 assert.equal(row.payment_state,"proof_received");assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM shipments").get().n,0);assert.equal(counts["/order/api/v1/orders/store"]||0,0);
 await upload();await m.notify(id);assert.equal(telegramDeliveries.length,3);
});
test("address copy supports the Telegram limit exactly and preserves longer addresses in one block",()=>{
 const base={id,name:"PEMBELI SIMULASI",phone:"081234567890",address:"",postcode:"78243",status:"submitted",created_at:Date.now(),total:338000,notify_status:"pending"},suffix=m.recipientAddress(base).length;
 for(const length of [256,257,665]){
  const order={...base,address:"A".repeat(length-suffix)},payload=m.recipientMessage(order),address=m.recipientAddress(order),entity=payload.entities[0];
  assert.equal(address.length,length);assert.equal(payload.text.slice(entity.offset,entity.offset+entity.length),address);
  if(length===256)assert.equal(payload.reply_markup.inline_keyboard[0][0].copy_text.text,address);
  else assert.equal(payload.reply_markup,undefined);
 }
});
test("address formatting preserves Unicode, punctuation, region, and postcode without copying identity",()=>{
 const order={id,name:"PEMBELI 🧑 SIMULASI",phone:"081234567890",address:'Jl. Melati 🏠 No. 43\nRT 01 / RW 01, <blok A> & "Gerbang biru"',postcode:"40375",quote:{destination:{label:"CIPICUNG, BALEENDAH, BANDUNG, JAWA BARAT"}}},payload=m.recipientMessage(order),entity=payload.entities[0],expected=order.address+"\n"+order.quote.destination.label+"\nKode pos: 40375";
 assert.equal(payload.text.slice(entity.offset,entity.offset+entity.length),expected);assert.equal(payload.reply_markup.inline_keyboard[0][0].copy_text.text,expected);
 assert.ok(!expected.includes(order.name));assert.ok(!expected.includes(order.phone));assert.equal(payload.parse_mode,undefined);
});
test("long addresses still reach the owner once without truncation or additional Telegram messages",async()=>{
 await freshNotification();const address="Jl. Contoh Panjang, RT 01 RW 01, ".repeat(18);
 sqlite.prepare("UPDATE orders SET address=?").run(address);assert.equal(await m.notify(id),true);
 assert.deepEqual(telegramDeliveries.map(p=>p.kind),["proof","invoice","recipient"]);const recipient=telegramDeliveries[2],entity=recipient.entities[0];
 assert.equal(recipient.reply_markup,undefined);assert.equal(recipient.text.slice(entity.offset,entity.offset+entity.length),address+"\n"+destination.label+"\nKode pos: 78243");
 await m.notify(id);assert.equal(telegramDeliveries.length,3);assert.equal(counts["/order/api/v1/orders/store"]||0,0);
});
test("explicit failure at each Telegram message resumes only unsent parts",async()=>{
 for(const kind of ["proof","invoice","recipient"]){
  await freshNotification();failed="telegram-"+kind;assert.equal(await m.notify(id),false);const before=sqlite.prepare("SELECT * FROM orders").get();assert.equal(before.notify_status,"failed");assert.equal(before[kind==="recipient"?"recipient_message":kind+"_message"],null);
  assert.equal(await m.notify(id),true);const after=sqlite.prepare("SELECT * FROM orders").get();assert.equal(after.notify_status,"sent");assert.equal(after.notify_lease,0);
  assert.deepEqual(telegramDeliveries.map(p=>p.kind),["proof","invoice","recipient"]);
  for(const field of ["proof_message","invoice_message","recipient_message"])if(before[field])assert.equal(after[field],before[field]);
  await m.notify(id);assert.equal(telegramDeliveries.length,3);assert.equal(counts["/order/api/v1/orders/store"]||0,0);
 }
});
test("simultaneous notification attempts deliver one proof, one invoice, and one recipient message",async()=>{
 await freshNotification();await Promise.all([m.notify(id),m.notify(id),m.notify(id)]);
 assert.deepEqual(telegramDeliveries.map(p=>p.kind),["proof","invoice","recipient"]);assert.equal(sqlite.prepare("SELECT notify_status FROM orders").get().notify_status,"sent");
});
test("separate recipient details never go to a changed owner chat",async()=>{
 await freshNotification();sqlite.prepare("UPDATE settings SET chat_id='654321'").run();assert.equal(await m.notify(id),false);assert.equal(telegramDeliveries.length,0);assert.equal(sqlite.prepare("SELECT recipient_message FROM orders").get().recipient_message,null);
});

function trackingRequest(cookie="",bearer=""){return new Request("https://example.test/api/order/tracking",{headers:{...(cookie?{Cookie:"elite_order="+cookie}:{}),...(bearer?{Authorization:"Bearer "+bearer}:{})}});}
function trackingLookup(invoice=id,phone="081234567890",origin="https://example.test"){return m.trackingPost(new Request("https://example.test/api/order/tracking",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({invoice,phone})}));}
const trackingPath="/order/api/v1/orders/history-airway-bill";
async function bookedOrder(){await setup();const token=await addOrder();await confirm();await m.processShipment(id);return token;}

test("customer tracking stays pending before owner confirmation and never creates a shipment",async()=>{await setup();const token=await addOrder();sqlite.prepare("DELETE FROM shipments").run();const r=await m.trackingGet(trackingRequest(token)),body=await r.json();assert.equal(r.status,200);assert.equal(body.stage,"proof_received");assert.equal(body.paymentConfirmed,false);assert.equal(body.awb,null);assert.equal(counts[trackingPath]||0,0);assert.equal(counts["/order/api/v1/orders/store"]||0,0);assert.equal(sqlite.prepare("SELECT count(*) n FROM shipments").get().n,0);assert.match(body.accessUrl,/^https:\/\/example\.test\/lacak#[a-f0-9]{64}$/);});

test("tracking supports an expired checkout session using a personal link or full invoice and phone",async()=>{await setup();const token=await addOrder();sqlite.prepare("UPDATE orders SET created_at=?").run(Date.now()-10*86400000);assert.equal((await m.orderGet(new Request("https://example.test/api/order",{headers:{Cookie:"elite_order="+token}}))).status,404);const found=await trackingLookup(id,"+62 812-3456-7890"),body=await found.json();assert.equal(found.status,200);const bearer=body.accessUrl.split("#")[1];assert.equal((await m.trackingGet(trackingRequest("",bearer))).status,200);assert.equal((await m.trackingGet(trackingRequest(token,"c".repeat(64)))).status,404);sqlite.prepare("UPDATE tracking_links SET expires_at=?").run(Date.now()-1);assert.equal((await m.trackingGet(trackingRequest("",bearer))).status,404);});

test("tracking requires valid access and does not enumerate invoices or expose provider private fields",async()=>{const token=await bookedOrder();assert.equal((await m.trackingGet(trackingRequest())).status,404);assert.equal((await trackingLookup(id,"089999999999")).status,404);assert.equal((await trackingLookup("EV-261004-FFFFFFFF")).status,404);assert.equal((await trackingLookup(id,"081234567890","https://other.example")).status,403);const r=await m.trackingGet(trackingRequest(token)),body=await r.json();assert.equal(r.headers.get("Cache-Control"),"no-store");assert.equal(body.stage,"in_transit");assert.equal(body.events[0].description,"Paket tiba di pusat sortir Bandung");for(const key of ["name","phone","address","proof_key","delivery_chat","confirmed_by","token_cipher","provider_no","last_error","shipping_cipher","request_json"])assert.equal(body[key],undefined);assert.doesNotMatch(JSON.stringify(body),/PRIVATE ADDRESS|PRIVATE KEY|081234567890|SIMULATED_SHIPPING_KEY/);assert.equal(counts[trackingPath],1);assert.equal(counts["/order/api/v1/orders/store"],1);});

test("full-phone tracking lookup is rate limited before any provider request",async()=>{await setup();await addOrder();for(let i=0;i<8;i++)assert.equal((await trackingLookup(id,"089999999999")).status,404);assert.equal((await trackingLookup()).status,429);assert.equal(counts[trackingPath]||0,0);});

test("concurrent customer refreshes share one tracking lookup and one stable personal link",async()=>{const token=await bookedOrder();failed="tracking-delay";const responses=await Promise.all([m.trackingGet(trackingRequest(token)),m.trackingGet(trackingRequest(token)),m.trackingGet(trackingRequest(token))]);const bodies=await Promise.all(responses.map(r=>r.json()));assert.equal(new Set(bodies.map(b=>b.accessUrl)).size,1);assert.equal(sqlite.prepare("SELECT count(*) n FROM tracking_links").get().n,1);assert.equal(counts[trackingPath],1);const r=await m.trackingGet(trackingRequest(token));assert.equal((await r.json()).stage,"in_transit");assert.equal(counts[trackingPath],1);assert.equal(counts["/order/api/v1/orders/store"],1);});

test("a courier failure keeps prior tracking history and retries without another booking",async()=>{const token=await bookedOrder();await m.trackingGet(trackingRequest(token));sqlite.prepare("UPDATE shipment_tracking SET next_attempt_at=0").run();failed="tracking-error";const failedBody=await (await m.trackingGet(trackingRequest(token))).json();assert.equal(failedBody.stale,true);assert.equal(failedBody.events.length,2);assert.equal(failedBody.stage,"in_transit");assert.equal(counts[trackingPath],2);await m.trackingGet(trackingRequest(token));assert.equal(counts[trackingPath],2);failed="";sqlite.prepare("UPDATE shipment_tracking SET next_attempt_at=0").run();const recovered=await (await m.trackingGet(trackingRequest(token))).json();assert.equal(recovered.stale,false);assert.equal(counts["/order/api/v1/orders/store"],1);});

test("empty carrier history and an unscanned AWB never mean the parcel has shipped",async()=>{const token=await bookedOrder();failed="tracking-empty";const waiting=await (await m.trackingGet(trackingRequest(token))).json();assert.equal(waiting.stage,"awb_available");assert.equal(waiting.events.length,0);assert.equal(waiting.awb,"SIMULASI12345678");failed="";sqlite.prepare("UPDATE shipment_tracking SET next_attempt_at=0").run();trackingResponse={airway_bill:"SIMULASI12345678",last_status:"AWB CREATED",history:[]};const created=await (await m.trackingGet(trackingRequest(token))).json();assert.equal(created.stage,"awb_available");assert.match(created.message,/belum dianggap sudah dikirim/);assert.equal((await m.shipment(id)).state,"awb_available");});

test("explicit courier delivery status is separate from the internal AWB booking state",async()=>{const token=await bookedOrder();trackingResponse={airway_bill:"SIMULASI12345678",last_status:"DELIVERED",history:[{date:"2026-10-06 09:00:00",desc:"Paket diterima penerima",status:"DELIVERED",code:"DLV"}]};const body=await (await m.trackingGet(trackingRequest(token))).json();assert.equal(body.stage,"delivered");assert.equal((await m.shipment(id)).state,"awb_available");assert.equal(counts["/order/api/v1/orders/store"],1);});

test("tracking rejects a different provider AWB while preserving safe prior history",async()=>{const token=await bookedOrder();await m.trackingGet(trackingRequest(token));sqlite.prepare("UPDATE shipment_tracking SET next_attempt_at=0").run();trackingResponse={airway_bill:"OTHER-AWB",last_status:"DELIVERED",history:[{desc:"PRIVATE OTHER ORDER",date:"2026-10-06 09:00:00",status:"DELIVERED"}]};const body=await (await m.trackingGet(trackingRequest(token))).json();assert.equal(body.stale,true);assert.equal(body.stage,"in_transit");assert.doesNotMatch(JSON.stringify(body),/OTHER-AWB|PRIVATE OTHER ORDER/);});

test("customer status can discover a delayed AWB on an existing booking using only read APIs",async()=>{const token=await bookedOrder();sqlite.prepare("UPDATE shipments SET awb=NULL,state='booked'").run();const storeCount=counts["/order/api/v1/orders/store"],pickupCount=counts["/order/api/v1/pickup/request"],messages=counts.sendDocument;const body=await (await m.trackingGet(trackingRequest(token))).json();assert.equal(body.awb,"SIMULASI12345678");assert.equal(counts["/order/api/v1/orders/store"],storeCount);assert.equal(counts["/order/api/v1/pickup/request"],pickupCount);assert.equal(counts.sendDocument,messages);});

test("owner print metadata protects the official label and retains its booked paper format",async()=>{await setup();await addOrder();assert.equal((await m.printGet(new Request("https://example.test/x"),{params:Promise.resolve({id})})).status,409);await confirm();await m.processShipment(id);sqlite.prepare("UPDATE shipments SET config_json=?").run(await m.encrypt(JSON.stringify({...shippingConfig,labelPage:"page_5"})));const result=await m.printGet(new Request("https://example.test/x"),{params:Promise.resolve({id})}),body=await result.json();assert.equal(result.status,200);assert.deepEqual(body.size,{width:100,height:100,label:"10 × 10 cm"});assert.match(body.pdfUrl,/format=pdf$/);assert.match(body.pngUrl,/format=png$/);assert.deepEqual(storage.get((await m.shipment(id)).label_pdf),pdf);globalThis.__testUser=null;assert.equal((await m.printGet(new Request("https://example.test/x"),{params:Promise.resolve({id})})).status,401);assert.equal((await m.adminTrackingGet(new Request("https://example.test/x"),{params:Promise.resolve({id})})).status,401);globalThis.__testUser={userId:"another",email:"another@example.test"};assert.equal((await m.printGet(new Request("https://example.test/x"),{params:Promise.resolve({id})})).status,403);});

test("the buyer invoice and owner Telegram AWB summary include tracking and private print links",async()=>{const token=await bookedOrder();const invoice=await m.invoiceGet(new Request("https://example.test/api/order/invoice",{headers:{Cookie:"elite_order="+token}}));assert.match(await invoice.text(),/Lacak pesanan: https:\/\/example\.test\/lacak#[a-f0-9]{64}/);const summary=telegramDeliveries.find(v=>v.text?.includes("RESI TERSEDIA"));assert.ok(summary.reply_markup.inline_keyboard.flat().find(button=>button.url==="https://example.test/admin/order/print/"+id));assert.ok(summary.reply_markup.inline_keyboard.flat().find(button=>/^https:\/\/example\.test\/lacak#[a-f0-9]{64}$/.test(button.url||"")));assert.equal(counts["/order/api/v1/orders/store"],1);});
test("temporary tracking-link storage failure never blocks the existing invoice or official label delivery",async()=>{await setup();const token=await addOrder();await confirm();const prepare=globalThis.__testEnv.DB.prepare;globalThis.__testEnv.DB.prepare=(sql)=>{if(/tracking_links/.test(sql))throw new m.AppError(503,"Simulated tracking storage failure");return prepare(sql);};try{await m.processShipment(id);assert.ok((await m.shipment(id)).pdf_message);assert.ok((await m.shipment(id)).png_message);const invoice=await m.invoiceGet(new Request("https://example.test/api/order/invoice",{headers:{Cookie:"elite_order="+token}}));assert.equal(invoice.status,200);assert.match(await invoice.text(),/PRL crewneck/);assert.equal(counts["/order/api/v1/orders/store"],1);}finally{globalThis.__testEnv.DB.prepare=prepare;}});

// New-provider scenarios run only against intercepted requests and temporary SQLite/R2.
const legacyFetch=globalThis.fetch;
let kiriminLast=null,kiriminMode="",kiriminCreated=false,kiriminHookUrl="";
const kiriminAddress=l=>({province_id:l.id===10?9:13,city_id:l.id===10?100:200,district_id:l.id===10?1001:2001,subdistrict_id:l.id,full_address:[l.village,l.district,l.city,l.id===10?"JAWA BARAT":"KALIMANTAN BARAT",l.postcode].join(", ")});
const kiriminOriginLocation={...origin,provider:"kiriminaja",province:"JAWA BARAT",provinceId:9,cityId:100,districtId:1001,label:kiriminAddress(origin).full_address};
function kjson(data={},code=200){return Response.json({status:code<400,text:"Simulated provider response",...data},{status:code});}
globalThis.fetch=async(input,init={})=>{
 const url=new URL(typeof input==="string"?input:input.url);
 if(!["tdev.kiriminaja.com","client.kiriminaja.com"].includes(url.hostname))return legacyFetch(input,init);
 const path=url.pathname;counts[path]=(counts[path]||0)+1;
 if(path==="/simulated-label.pdf"){assert.equal(init.headers?.Authorization,undefined);return new Response(pdf.slice(),{headers:{"Content-Type":"application/pdf"}});}
 assert.equal(init.headers.Authorization,"Bearer SIMULATED_KIRIMINAJA_KEY");assert.equal(init.redirect,"manual");
 if(path.endsWith("/set_callback")){kiriminHookUrl=JSON.parse(init.body).url;assert.match(kiriminHookUrl,/^https:\/\/example\.test\/api\/kiriminaja\/webhook\/[a-f0-9]{64}$/);return kjson({method:"set_callback"});}
 if(path.endsWith("/addresses"))return kjson({data:[kiriminAddress(url.searchParams.get("search")==="40375"?origin:destination)]});
 if(path.endsWith("/shipping_price")){
  const p=JSON.parse(init.body);assert.equal(p.origin,1001);assert.equal(p.destination,2001);assert.equal(p.subdistrict_origin,10);assert.equal(p.subdistrict_destination,20);assert.deepEqual(p.courier,["jnt"]);
  const premium=p.insurance?Math.ceil(p.item_value*.002/100)*100:0;
  return kjson({results:[{service:"jnt",service_name:"J&T Regular",service_type:"EZ",cost:"38000",discount_amount:9500,discount_type:"all",etd:"3-5",insurance:premium,setting:{insurance_fee:"0.002"},use_geolocation:false},{service:"jnt",service_name:"J&T Regular",service_type:"EZ",cost:"38000",discount_amount:10000,discount_type:"all",etd:"3-5",insurance:kiriminMode==="insurance-unavailable"?0:premium,setting:{insurance_fee:"0.002"},use_geolocation:kiriminMode==="geolocation-required"}]});
 }
 if(path.endsWith("/pin/validate")){assert.equal(JSON.parse(init.body).pin,"123456");if(kiriminMode==="bad-pin")return kjson({status:false,data:{valid:false,attempt:1,max_attempt:3}});return kjson({data:{valid:true}});}
 if(path.endsWith("/credit/balance"))return kjson({results:{balance:kiriminMode==="low-balance"?100:1000000}});
 if(path.endsWith("/request_pickup")){
  kiriminLast=JSON.parse(init.body);assert.equal(kiriminLast.payment_method,"credit");assert.equal(kiriminLast.pin,"123456");
  if(kiriminMode==="reject"){kiriminMode="";return kjson({status:false,text:"Invalid selected service"},422);}
  if(kiriminMode==="duplicate")return kjson({status:false,text:"order_id already exists"},422);
  if(kiriminMode==="timeout-unaccepted"){kiriminCreated=false;throw new Error("simulated timeout");}
  kiriminCreated=true;
  if(kiriminMode==="timeout"){kiriminMode="";throw new Error("simulated timeout after acceptance");}
  if(kiriminMode==="slow")await new Promise(r=>setTimeout(r,20));
  return kjson({pickup_number:"EPR-SIMULATED",details:[{order_id:id,kj_order_id:id,awb:"SIMULASI12345678",service:"jnt",service_type:"EZ"}]});
 }
 if(path.endsWith("/tracking")){
  assert.ok([id,"SIMULASI12345678"].includes(JSON.parse(init.body).order_id));if(!kiriminCreated)return kjson({status:false},404);
  const p=kiriminLast.packages[0],details={order_id:id,awb:kiriminMode==="delayed-awb"?null:"SIMULASI12345678",service:"jnt",service_name:p.service_type,status_code:kiriminMode==="delivered"?200:100,delivered:kiriminMode==="delivered",delivered_at:kiriminMode==="delivered"?"2026-10-06 12:00:00":null,costs:{cod:0,shipping_cost:p.shipping_cost,insurance_amount:kiriminMode==="insurance-mismatch"?0:p.insurance_amount,insurance_percent:.002,discount_amount:10000},origin:{name:kiriminLast.name,address:kiriminLast.address,phone:kiriminLast.phone,zip_code:kiriminLast.zipcode},destination:{name:p.destination_name,address:p.destination_address,phone:p.destination_phone,zip_code:p.destination_zipcode}};
  if(kiriminMode==="wrong-tracking")details.awb="DIFFERENT-AWB";
  return kjson({details,status_code:details.status_code,histories:kiriminMode==="delivered"?[{created_at:"2026-10-06 12:00:00",status:"Delivered to buyer",status_code:200,driver:"PRIVATE DRIVER",receiver:"PRIVATE BUYER"}]:[]});
 }
 if(path.endsWith("/awb/print")){
  assert.deepEqual(JSON.parse(init.body).awb,["SIMULASI12345678"]);
  if(kiriminMode==="label-fail"){kiriminMode="";return kjson({status:false},500);}
  return kjson({data:{data:{url:kiriminMode==="unsafe-label"?"https://127.0.0.1/private":"https://tdev.kiriminaja.com/simulated-label.pdf"}}});
 }
 assert.fail("Unrecognized simulated KiriminAja endpoint: "+path);
};
async function kiriminSetup(proof=true){await setup();const token=await addOrder(proof);sqlite.prepare("DELETE FROM shipments").run();kiriminLast=null;kiriminMode="";kiriminCreated=false;sqlite.prepare("UPDATE settings SET kirimin_config=?,kirimin_cipher=?,kirimin_pin_cipher=?").run(JSON.stringify({...shippingConfig,origin:kiriminOriginLocation}),await m.encrypt("SIMULATED_KIRIMINAJA_KEY"),await m.encrypt("123456"));return token;}
const kCreate="/api/mitra/v6.2/request_pickup",kPrint="/api/mitra/v6.1/awb/print",kTrack="/api/mitra/tracking";

test("KiriminAja proof upload still only sends the existing Telegram messages and never books",async()=>{const token=await kiriminSetup(false),form=new FormData(),bytes=new Uint8Array(80);bytes.set([137,80,78,71,13,10,26,10]);form.set("file",new Blob([bytes],{type:"image/png"}),"proof.png");const r=await m.proofUpload(new Request("https://example.test/api/order/proof",{method:"POST",headers:{Origin:"https://example.test",Cookie:"elite_order="+token},body:form}));assert.equal(r.status,200);assert.equal(counts[kCreate]||0,0);assert.equal(sqlite.prepare("SELECT count(*) n FROM shipments").get().n,0);});
test("KiriminAja unauthorized callbacks do not confirm or spend KA Credit",async()=>{await kiriminSetup();await webhook(900,654321);await webhook(901,123456,"wrong");assert.equal(sqlite.prepare("SELECT payment_state FROM orders").get().payment_state,"proof_received");assert.equal(counts[kCreate]||0,0);});
test("KiriminAja confirmed order creates one insured pickup and sends original PDF and PNG",async()=>{await kiriminSetup();await webhook(910);await webhook(910);await webhook(911);const s=await m.shipment(id);assert.equal(counts[kCreate],1);assert.equal(counts[kPrint],1);assert.equal(s.provider,"kiriminaja");assert.equal(s.state,"awb_available");assert.equal(s.pickup_state,"scheduled");assert.equal(s.insurance_state,"verified");assert.equal(s.insurance_fee,600);assert.equal(s.insured_value,300000);assert.equal(kiriminLast.packages[0].item_value,300000);assert.equal(kiriminLast.packages[0].insurance_amount,600);assert.equal(kiriminLast.packages[0].cod,0);assert.equal(kiriminLast.packages[0].order_id,id);assert.equal(kiriminLast.packages[0].weight,1000);assert.equal(kiriminLast.phone,"6281321423020");assert.ok(s.pdf_message&&s.png_message);assert.deepEqual(storage.get(s.label_pdf),pdf);assert.equal(Buffer.from(storage.get(s.label_png).subarray(0,8)).toString("hex"),"89504e470d0a1a0a");assert.doesNotMatch(await m.decrypt(s.request_json),/"pin"\s*:|SIMULATED_KIRIMINAJA_KEY/);assert.ok(telegramTexts.some(t=>t.includes("Booking KiriminAja")));});
test("KiriminAja simultaneous owner confirmations retain one booking",async()=>{await kiriminSetup();await confirm();kiriminMode="slow";await Promise.all([m.processShipment(id),m.processShipment(id),m.processShipment(id)]);assert.equal(counts[kCreate],1);});
test("KiriminAja uncertain accepted create reconciles by invoice and never creates again",async()=>{await kiriminSetup();await confirm();kiriminMode="timeout";await m.processShipment(id);assert.equal((await m.shipment(id)).state,"booking_unknown");await m.processShipment(id);assert.equal(counts[kCreate],1);assert.ok((await m.shipment(id)).png_message);});
test("KiriminAja uncertain unaccepted create remains held instead of blindly retrying",async()=>{await kiriminSetup();await confirm();kiriminMode="timeout-unaccepted";await m.processShipment(id);await m.processShipment(id);await m.processShipment(id);assert.equal(counts[kCreate],1);assert.equal((await m.shipment(id)).state,"booking_unknown");});
test("KiriminAja explicit validation rejection allows retry on the same merchant ID",async()=>{await kiriminSetup();await confirm();kiriminMode="reject";await m.processShipment(id);assert.equal((await m.shipment(id)).create_sent_at,null);await m.processShipment(id);assert.equal(counts[kCreate],2);assert.equal((await m.shipment(id)).provider_no,id);});
test("KiriminAja duplicate merchant-ID rejection keeps an uncertain request blocked",async()=>{await kiriminSetup();await confirm();kiriminMode="duplicate";await m.processShipment(id);await m.processShipment(id);assert.equal(counts[kCreate],1);assert.ok((await m.shipment(id)).create_sent_at);});
test("KiriminAja low credit or unavailable insurance prevents paid booking",async()=>{await kiriminSetup();await confirm();kiriminMode="low-balance";await m.processShipment(id);assert.equal(counts[kCreate]||0,0);assert.match((await m.shipment(id)).last_error,/Saldo KA Credit/);kiriminMode="insurance-unavailable";await m.processShipment(id);assert.equal(counts[kCreate]||0,0);assert.match((await m.shipment(id)).last_error,/Asuransi wajib/);});
test("KiriminAja invalid PIN stops automatic attempts and is never returned by settings",async()=>{await kiriminSetup();await confirm();kiriminMode="bad-pin";await m.processShipment(id);await m.processShipment(id);assert.equal(counts["/api/mitra/v6.2/pin/validate"],1);assert.equal(counts[kCreate]||0,0);assert.equal(sqlite.prepare("SELECT kirimin_pin_cipher FROM settings").get().kirimin_pin_cipher,null);const r=await m.shippingGet(),s=await r.json();assert.equal(s.hasPin,false);assert.doesNotMatch(JSON.stringify(s),/SIMULATED_KIRIMINAJA_KEY|123456/);});
test("KiriminAja official label failure resumes the accepted booking",async()=>{await kiriminSetup();await confirm();kiriminMode="label-fail";await m.processShipment(id);assert.equal((await m.shipment(id)).provider_no,id);await m.processShipment(id);assert.equal(counts[kCreate],1);assert.equal(counts[kPrint],2);assert.ok((await m.shipment(id)).pdf_message);});
test("KiriminAja PNG Telegram failure resends only the missing document",async()=>{await kiriminSetup();await confirm();failed="telegram-png";await m.processShipment(id);const first=await m.shipment(id);assert.ok(first.pdf_message&&!first.png_message);await m.processShipment(id);assert.equal(counts[kCreate],1);assert.equal(counts[kPrint],1);assert.equal((await m.shipment(id)).pdf_message,first.pdf_message);assert.equal(counts.sendDocument,3);});
test("KiriminAja delayed AWB and insurance mismatch never cause duplicate pickup",async()=>{await kiriminSetup();await confirm();kiriminMode="delayed-awb";await m.processShipment(id);assert.equal((await m.shipment(id)).awb,null);kiriminMode="insurance-mismatch";await m.processShipment(id);assert.equal((await m.shipment(id)).insurance_state,"unverified");kiriminMode="";await m.processShipment(id);assert.equal(counts[kCreate],1);assert.ok((await m.shipment(id)).png_message);});
test("KiriminAja signed label download cannot access arbitrary hosts",async()=>{await kiriminSetup();await confirm();kiriminMode="unsafe-label";await m.processShipment(id);assert.equal(counts[kCreate],1);assert.equal((await m.shipment(id)).label_pdf,null);assert.match((await m.shipment(id)).last_error,/Lokasi PDF/);});
test("KiriminAja rates select highest eligible pickup discount and retain every J&T service",()=>{const rates=m.kiriminRates([{service:"jnt",service_type:"EZ",cost:"20000",discount_amount:2000},{service:"jnt",service_type:"EZ",cost:20000,discount_amount:5000},{service:"jnt",service_type:"EZ",cost:20000,discount_amount:10000,discount_type:"drop_only"},{service:"jnt",service_type:"SUPER",cost:25000,discount_amount:1000},{service:"jne",service_type:"REG",cost:10000}]);assert.deepEqual(rates.map(r=>[r.service,r.discount]),[["EZ",5000],["SUPER",1000]]);assert.equal(m.insuranceEstimate(315555).premium,700);assert.equal(m.insuranceEstimate(250000).eligible,true);});
test("KiriminAja customer tracking protects data and does not mark an unscanned AWB as shipped",async()=>{const token=await kiriminSetup();await confirm();await m.processShipment(id);const body=await (await m.trackingGet(trackingRequest(token))).json();assert.equal(body.stage,"awb_available");assert.equal(body.events.length,0);assert.doesNotMatch(JSON.stringify(body),/PIN|SIMULATED_KIRIMINAJA_KEY|destination|PRIVATE DRIVER/);sqlite.prepare("UPDATE shipment_tracking SET next_attempt_at=0").run();kiriminMode="delivered";const delivered=await (await m.trackingGet(trackingRequest(token))).json();assert.equal(delivered.stage,"delivered");assert.equal(delivered.events.length,1);assert.equal(counts[kCreate],1);});
test("KiriminAja geolocation-required services are held without inventing coordinates",async()=>{await kiriminSetup();await confirm();kiriminMode="geolocation-required";await m.processShipment(id);assert.equal(counts[kCreate]||0,0);assert.match((await m.shipment(id)).last_error,/titik lokasi/);});
test("KiriminAja production quotes use the same provider without creating a shipment",async()=>{await kiriminSetup();const c={...shippingConfig,origin:kiriminOriginLocation,environment:"production"};sqlite.prepare("UPDATE settings SET kirimin_config=?").run(JSON.stringify(c));const locations=await m.searchDestinations("78243");assert.equal(locations[0].provider,"kiriminaja");assert.equal(locations[0].districtId,2001);const quotes=await m.shippingQuotes(locations[0].id,1000);assert.equal(quotes[0].source,"KiriminAja");assert.equal(quotes[0].amount,38000);assert.equal(counts[kCreate]||0,0);assert.equal(counts["/order/api/v1/orders/store"]||0,0);});
test("KiriminAja encrypted configuration save does not validate PIN or book",async()=>{await kiriminSetup();const response=await m.shippingPost(new Request("https://example.test/api/admin/shipping",{method:"POST",headers:{Origin:"https://example.test","Content-Type":"application/json"},body:JSON.stringify({action:"save",config:{...shippingConfig,origin:kiriminOriginLocation},pin:"654321"})}));assert.equal(response.status,200);assert.equal(await m.decrypt(sqlite.prepare("SELECT kirimin_pin_cipher FROM settings").get().kirimin_pin_cipher),"654321");assert.equal(counts[kCreate]||0,0);assert.equal(counts["/api/mitra/v6.2/pin/validate"]||0,0);assert.doesNotMatch(JSON.stringify(await response.json()),/654321|SIMULATED_KIRIMINAJA_KEY/);});

async function kiriminCallback(body={method:"processed_packages",data:[{order_id:id,awb:"FORGED-HINT"}]},token=kiriminHookUrl.split("/").at(-1),auth="Bearer SIMULATED_KIRIMINAJA_KEY"){
 return m.kiriminWebhookPost(new Request("https://example.test/api/kiriminaja/webhook/"+token,{method:"POST",headers:{Authorization:auth,"Content-Type":"application/json"},body:JSON.stringify(body)}),{params:Promise.resolve({token})});
}
test("KiriminAja registration URL is checkable before the key but rejects every event",async()=>{
 await setup();const token="7".repeat(64);globalThis.__testEnv.KIRIMINAJA_WEBHOOK_TOKEN=token;
 try{
  const get=t=>m.kiriminWebhookGet(new Request("https://example.test/api/kiriminaja/webhook/"+t),{params:Promise.resolve({token:t})});
  assert.equal((await get(token)).status,200);assert.equal((await get("8".repeat(64))).status,403);
  assert.equal((await kiriminCallback(undefined,token)).status,403);
  assert.equal(sqlite.prepare("SELECT kirimin_cipher FROM settings").get().kirimin_cipher,null);
  assert.equal(sqlite.prepare("SELECT kirimin_webhook_cipher FROM settings").get().kirimin_webhook_cipher,null);
  assert.equal(counts[kCreate]||0,0);assert.equal(counts["/api/mitra/set_callback"]||0,0);
 }finally{delete globalThis.__testEnv.KIRIMINAJA_WEBHOOK_TOKEN;}
});
test("KiriminAja owner activation preserves the provisioned registration URL",async()=>{
 await kiriminSetup();const token="9".repeat(64);globalThis.__testEnv.KIRIMINAJA_WEBHOOK_TOKEN=token;
 try{
  assert.equal((await kiriminCallback(undefined,token)).status,403);
  await m.ensureKiriminWebhook();assert.equal(kiriminHookUrl,"https://example.test/api/kiriminaja/webhook/"+token);
  assert.equal(await m.decrypt(sqlite.prepare("SELECT kirimin_webhook_cipher FROM settings").get().kirimin_webhook_cipher),token);
  assert.equal((await kiriminCallback(undefined,token,"Bearer WRONG_KEY")).status,403);
  assert.equal((await kiriminCallback(undefined,token)).status,200);assert.equal(counts[kCreate]||0,0);
 }finally{delete globalThis.__testEnv.KIRIMINAJA_WEBHOOK_TOKEN;}
});
test("KiriminAja callback registration requires the owner and keeps its secret encrypted",async()=>{
 await kiriminSetup();globalThis.__testUser=null;
 const request=()=>new Request("https://example.test/api/admin/shipping",{method:"POST",headers:{Origin:"https://example.test","Content-Type":"application/json"},body:JSON.stringify({action:"kirimin-webhook"})});
 assert.equal((await m.shippingPost(request())).status,401);globalThis.__testUser={userId:"other-owner",email:"other@example.test"};assert.equal((await m.shippingPost(request())).status,403);assert.equal(counts["/api/mitra/set_callback"]||0,0);
 globalThis.__testUser={userId:"owner-id",email:"owner@example.test"};const response=await m.shippingPost(request());assert.equal(response.status,200);const settings=await response.json();assert.equal(settings.kiriminWebhookActive,true);assert.doesNotMatch(JSON.stringify(settings),new RegExp(kiriminHookUrl.split("/").at(-1)));assert.equal(counts[kCreate]||0,0);
 const s=sqlite.prepare("SELECT kirimin_webhook_cipher FROM settings").get();assert.notEqual(s.kirimin_webhook_cipher,kiriminHookUrl.split("/").at(-1));
});
test("KiriminAja callback rejects wrong token, wrong key, and oversized updates",async()=>{
 await kiriminSetup();await m.ensureKiriminWebhook();assert.equal((await kiriminCallback(undefined,"a".repeat(64))).status,403);assert.equal((await kiriminCallback(undefined,undefined,"Bearer WRONG_KEY")).status,403);
 assert.equal((await kiriminCallback({method:"processed_packages",data:[{order_id:id}],padding:"x".repeat(66000)})).status,413);assert.equal(counts[kCreate]||0,0);
});
test("KiriminAja callback cannot confirm payment or create an unsubmitted booking",async()=>{
 await kiriminSetup();await m.ensureKiriminWebhook();assert.equal((await kiriminCallback()).status,200);assert.equal((await m.shipment(id)),null);assert.equal(sqlite.prepare("SELECT payment_state FROM orders").get().payment_state,"proof_received");
 await confirm();assert.equal((await kiriminCallback()).status,200);assert.equal(counts[kCreate]||0,0);assert.equal(counts["/api/mitra/tracking"]||0,0);
});
test("KiriminAja delayed AWB callback sends verified original labels once and ignores forged hints",async()=>{
 await kiriminSetup();await m.ensureKiriminWebhook();await confirm();kiriminMode="delayed-awb";await m.processShipment(id);assert.equal((await m.shipment(id)).awb,null);
 kiriminMode="";await Promise.all([kiriminCallback(),kiriminCallback()]);await kiriminCallback();const s=await m.shipment(id);assert.equal(s.awb,"SIMULASI12345678");assert.ok(s.pdf_message&&s.png_message);assert.equal(counts[kCreate],1);assert.equal(counts[kPrint],1);assert.equal(counts.sendDocument,2);
});
test("KiriminAja callback recovers an uncertain accepted booking even after booking is disabled",async()=>{
 await kiriminSetup();await m.ensureKiriminWebhook();await confirm();kiriminMode="timeout";await m.processShipment(id);sqlite.prepare("UPDATE settings SET kirimin_config=?,kirimin_pin_cipher=NULL").run(JSON.stringify({...shippingConfig,origin:kiriminOriginLocation,enabled:false}));
 assert.equal((await kiriminCallback()).status,200);assert.equal(counts[kCreate],1);assert.ok((await m.shipment(id)).png_message);
});
test("KiriminAja callback label failure remains retryable on the same booking",async()=>{
 await kiriminSetup();await m.ensureKiriminWebhook();await confirm();kiriminMode="delayed-awb";await m.processShipment(id);kiriminMode="label-fail";assert.equal((await kiriminCallback()).status,503);assert.equal((await kiriminCallback()).status,200);assert.equal(counts[kCreate],1);assert.equal(counts[kPrint],2);assert.ok((await m.shipment(id)).png_message);
});
test("KiriminAja changing an existing AWB never sends the old label for the new number",async()=>{
 await kiriminSetup();await confirm();await m.processShipment(id);kiriminMode="wrong-tracking";const response=await m.processShipment(id);assert.equal(response.ok,false);assert.equal((await m.shipment(id)).awb,"SIMULASI12345678");assert.equal(counts.sendDocument,2);assert.equal(counts[kCreate],1);
});
test("calculator reads the shared production configuration without HTTP bridges or booking a shipment",async()=>{
 await kiriminSetup();
 sqlite.prepare("UPDATE settings SET kirimin_config=?").run(JSON.stringify({...shippingConfig,origin:kiriminOriginLocation,environment:"production"}));
 const data=await m.calculatorStatus();assert.equal(data.connected,true);assert.equal(data.kiriminReady,true);assert.doesNotMatch(JSON.stringify(data),/SIMULATED_KIRIMINAJA_KEY|kirimin_pin/);
 assert.equal(counts[kCreate]||0,0);assert.equal(await m.shipment(id),null);
});
