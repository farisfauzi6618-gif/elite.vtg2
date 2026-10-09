import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from "node:fs";
import {createRequire} from "node:module";
import {pathToFileURL} from "node:url";
const require=createRequire(import.meta.url),esbuild=require("esbuild");
const sqlite=new DatabaseSync(":memory:");
for(const file of readdirSync("migrations").filter(f=>f.endsWith(".sql")).sort())sqlite.exec(readFileSync("migrations/"+file,"utf8"));
function prepared(sql,values=[]){const stmt=sqlite.prepare(sql);return {bind(...v){return prepared(sql,v);},async first(){return stmt.get(...values)||null;},async run(){return {meta:{changes:Number(stmt.run(...values).changes)}};}};}
globalThis.__shippingTestEnv={RAJAONGKIR_CONFIG_SECRET:"a".repeat(64),DB:{prepare:prepared,async batch(statements){sqlite.exec("BEGIN");try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec("COMMIT");return result;}catch(e){sqlite.exec("ROLLBACK");throw e;}}}};
mkdirSync(".test-runtime/tests",{recursive:true});
const result=await esbuild.build({stdin:{contents:"export * from './modules/shipping/shipping-data';export * from './modules/shipping/legacy-shipping-server';",resolveDir:process.cwd(),loader:"ts"},bundle:true,platform:"node",format:"esm",write:false,plugins:[{name:"fake-env",setup(b){b.onResolve({filter:/^@\/lib\/env$/},()=>({path:"env",namespace:"test"}));b.onLoad({filter:/.*/,namespace:"test"},()=>({contents:"export const env=globalThis.__shippingTestEnv;"}));}}]});
writeFileSync(".test-runtime/tests/shipping.mjs",result.outputFiles[0].contents);
const m=await import(pathToFileURL(process.cwd()+"/.test-runtime/tests/shipping.mjs"));
const origin={id:10,label:"BALEENDAH, BANDUNG, 40375",province_name:"JAWA BARAT",city_name:"BANDUNG",district_name:"BALEENDAH",subdistrict_name:"BALEENDAH",zip_code:"40375"};
const destination={id:90,label:"TENGAH, PONTIANAK KOTA, PONTIANAK, 78243",province_name:"KALIMANTAN BARAT",city_name:"PONTIANAK",district_name:"PONTIANAK KOTA",subdistrict_name:"TENGAH",zip_code:"78243"};
let providerRates=[];
globalThis.fetch=async(input,init={})=>{
 const url=new URL(input);assert.equal(url.origin,"https://rajaongkir.komerce.id");assert.equal(init.headers.key,"SIMULATED_RATE_KEY");
 if(url.pathname.endsWith("/domestic-destination"))return Response.json({meta:{code:200},data:[url.searchParams.get("search")==="Baleendah"?origin:destination]});
 assert.ok(url.pathname.endsWith("/domestic-cost"));const params=new URLSearchParams(init.body);assert.equal(params.get("origin"),"10");assert.equal(params.get("destination"),"90");assert.equal(params.get("weight"),"1000");assert.equal(params.get("courier"),"jnt");
 return Response.json({meta:{code:200},data:providerRates});
};
test("real response shape keeps valid J&T services and filters duplicates, other couriers, and invalid prices",()=>{
 const rows=[{code:"jnt",service:"EZ",description:"Regular",cost:38000,etd:"3-5 day"},{code:"jnt",service:"EZ",cost:39000},{code:"jnt",service:"SUPER",description:"Super",cost:"55000",etd:"1 day"},{code:"jne",service:"REG",cost:20000},{code:"jnt",service:"BAD",cost:-1},{code:"jnt",service:"bad<script>",cost:20000},null];
 assert.deepEqual(m.availableJntRates(rows).map(r=>[r.service,r.cost]),[["EZ",38000],["SUPER",55000]]);assert.equal(m.selectRegularRate(rows).service,"EZ");assert.throws(()=>m.availableJntRates({}));
});
test("route lookup returns available services while existing Regular quote stays compatible",async()=>{
 await m.connect("SIMULATED_RATE_KEY");await m.search("78243");providerRates=[{code:"jnt",service:"EZ",description:"Regular",cost:38000,etd:"3-5 day"},{code:"jnt",service:"SUPER",description:"Super",cost:55000,etd:"1 day"}];
 const result=await m.rates(90,1000);assert.equal(result.destination,destination.label);assert.equal(result.weight,1);assert.deepEqual(result.services.map(r=>r.service),["EZ","SUPER"]);
 const previous=await m.quote(90,1000);assert.equal(previous.service,"EZ");assert.equal(previous.amount,38000);
 providerRates=[{code:"jnt",service:"SUPER",cost:55000}];assert.equal((await m.rates(90,1000)).services[0].service,"SUPER");await assert.rejects(()=>m.quote(90,1000),e=>e.code==="NO_REGULAR_SERVICE");
 providerRates=[];await assert.rejects(()=>m.rates(90,1000),e=>e.code==="NO_JNT_SERVICE");await assert.rejects(()=>m.rates(999,1000),e=>e.code==="UNKNOWN_DESTINATION");
});

