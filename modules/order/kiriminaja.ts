import { AppError,db,hash } from "@/modules/order/order-server";
import { normalize } from "@/modules/order/komship";
import { regularJnt } from "@/modules/order/shipping-types";
import type { ShippingLocation } from "@/modules/order/shipping-types";
import type { KomshipLocation } from "@/modules/order/fulfilment-types";

export const record=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
export class KiriminError extends AppError {
 constructor(message:string,public rejected=false){super(502,message);}
}
export class KiriminPinError extends KiriminError {}
export const kiriminOrigin=(mode:string)=>mode==="sandbox"?"https://tdev.kiriminaja.com":"https://client.kiriminaja.com";
export type KiriminLocation=KomshipLocation&{districtId:number;province:string;provinceId:number;cityId:number;provider:"kiriminaja"};
export type KiriminRate={service:string;description:string;gross:number;discount:number;net:number;insurance:number;insurancePercent:number;etd:string;useGeolocation:boolean;raw:Record<string,unknown>};

export function kiriminLocations(value:unknown):KiriminLocation[]{
 if(!Array.isArray(value))throw new KiriminError("Data wilayah KiriminAja belum dapat dibaca.");
 return value.flatMap(raw=>{
  const r=record(raw),parts=String(r.full_address||"").split(",").map(s=>s.trim());
  const [village,district,city,province,postcode]=[parts.slice(0,-4).join(", "),...parts.slice(-4)];
  const id=Number(r.subdistrict_id),districtId=Number(r.district_id),provinceId=Number(r.province_id),cityId=Number(r.city_id);
  if(![id,districtId,provinceId,cityId].every(n=>Number.isSafeInteger(n)&&n>0)||parts.length<5||!/^\d{5}$/.test(postcode)||!village||!district||!city||String(r.full_address).length>240)return [];
  return [{id,districtId,provinceId,cityId,village,district,city,province,postcode,label:String(r.full_address),provider:"kiriminaja" as const}];
 });
}
export const customerLocation=(l:KiriminLocation):ShippingLocation=>({id:l.id,label:l.label,province:l.province,city:l.city,district:l.district,village:l.village,postalCode:l.postcode,provider:"kiriminaja",districtId:l.districtId,provinceId:l.provinceId,cityId:l.cityId});
export function kiriminRates(value:unknown):KiriminRate[]{
 if(!Array.isArray(value))throw new KiriminError("Tarif KiriminAja belum dapat dibaca.");
 const rates=value.flatMap(raw=>{
  const r=record(raw),setting=record(r.setting),gross=Number(r.cost),service=String(r.service_type||""),discount=String(r.discount_type||"").toLowerCase()==="drop_only"?0:Number(r.discount_amount||0),insurance=r.insurance==null?0:Number(r.insurance),insurancePercent=Number(setting.insurance_fee||0);
  if(String(r.service||"").toLowerCase()!=="jnt"||!Number.isSafeInteger(gross)||gross<=0||gross>10000000||!Number.isSafeInteger(discount)||discount<0||discount>gross||!Number.isSafeInteger(insurance)||insurance<0||!Number.isFinite(insurancePercent)||insurancePercent<0||!/^[A-Za-z0-9][A-Za-z0-9 _&+./()-]{0,39}$/.test(service))return [];
  return [{service,description:String(r.service_name||"").slice(0,100),gross,discount,net:gross-discount,insurance,insurancePercent,etd:String(r.etd||"").slice(0,80),useGeolocation:r.use_geolocation===true,raw:r}];
 });
 // Only discounts explicitly returned for pickup are eligible. No invented voucher redemption.
 rates.sort((a,b)=>b.discount-a.discount||a.net-b.net);
 const seen=new Set<string>();return rates.filter(r=>{const k=r.service.toUpperCase();if(seen.has(k))return false;seen.add(k);return true;});
}
export {kiriminInsuranceEstimate as insuranceEstimate} from "@/modules/order/shipping-insurance";
export function selectedKiriminRate(rates:KiriminRate[],service:string){const r=rates.find(x=>x.service.toUpperCase()===service.toUpperCase())||(regularJnt(service)?rates.find(x=>regularJnt(x.service)):undefined);if(!r)throw new AppError(409,"Layanan J&T yang dipilih pembeli belum tersedia di KiriminAja. Pilih layanan yang sama sebelum mencoba ulang.");return r;}
export function validKiriminOrigin(l:KomshipLocation|null):l is KiriminLocation{return !!(l?.provider==="kiriminaja"&&l.districtId&&l.postcode==="40375"&&normalize(l.district)==="BALEENDAH"&&normalize(l.city)==="BANDUNG");}

export class KiriminAja {
 constructor(private key:string,public environment:"sandbox"|"production"){}
 async request(path:string,method="POST",body?:unknown):Promise<Record<string,unknown>>{
  let response:Response;try{response=await fetch(kiriminOrigin(this.environment)+path,{method,redirect:"manual",headers:{Authorization:"Bearer "+this.key,Accept:"application/json","Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(18000)});}catch{throw new KiriminError("Koneksi KiriminAja terputus. Aplikasi akan memeriksa booking yang sama sebelum mencoba kembali.");}
  if(response.status>=300&&response.status<400)throw new KiriminError("Respons KiriminAja tidak valid.");
  let data:Record<string,unknown>;try{data=record(await response.json());}catch{throw new KiriminError("Respons KiriminAja belum dapat dibaca.");}
  if(path.endsWith("/pin/validate")&&data.status===false&&record(data.data).valid===false)throw new KiriminPinError("PIN KA Credit ditolak. Isi PIN yang benar pada pengaturan pemilik; percobaan otomatis dihentikan.");
  if(!response.ok||data.status===false){
   const duplicate=/duplicate|already|sudah.*(?:ada|dibuat)|exist|unique/i.test(String(data.text||"")+JSON.stringify(data.errors||{}));
   const rejected=[400,401,403,422,429].includes(response.status)&&data.status===false&&!duplicate;
   const message=[401,403].includes(response.status)?"API key KiriminAja ditolak. Periksa lingkungan dan aktivasi akun.":response.status===429?"Batas permintaan KiriminAja tercapai. Tunggu sebentar lalu coba ulang.":"KiriminAja belum menerima data pengiriman. Periksa saldo, alamat, asuransi, dan layanan pada dashboard.";
   throw new KiriminError(message,rejected);
  }
  if(data.status!==true)throw new KiriminError("KiriminAja belum memastikan keberhasilan permintaan.");return data;
 }
 async search(query:string,fresh=false){const key=await hash(this.environment+this.key+query.trim().toLowerCase()),cached=fresh?null:await db().prepare("SELECT payload FROM kirimin_search_cache WHERE key=? AND expires_at>?").bind(key,Date.now()).first<{payload:string}>();if(cached)return JSON.parse(cached.payload) as KiriminLocation[];const rows=kiriminLocations((await this.request("/api/mitra/v6.1/addresses?"+new URLSearchParams({search:query}),"GET")).data);await db().prepare("INSERT INTO kirimin_search_cache(key,payload,expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at").bind(key,JSON.stringify(rows),Date.now()+86400000).run();return rows;}
 async destination(l:ShippingLocation){const rows=await this.search(l.postalCode);const match=rows.filter(r=>normalize(r.district)===normalize(l.district)&&normalize(r.city)===normalize(l.city)&&normalize(r.village)===normalize(l.village));if(match.length!==1)throw new AppError(409,"Wilayah invoice belum cocok tepat dengan KiriminAja. Periksa wilayah tujuan pada pesanan ini.");return match[0];}
 async rates(origin:KiriminLocation,destination:KiriminLocation,grams:number,value:number,insured:boolean,dimensions?:{length:number;width:number;height:number}){
  const weight=Math.max(grams,dimensions?Math.ceil(dimensions.length*dimensions.width*dimensions.height/6):grams);
  const size=dimensions&&dimensions.length&&dimensions.width&&dimensions.height?{length:Math.ceil(dimensions.length),width:Math.ceil(dimensions.width),height:Math.ceil(dimensions.height)}:{};
  const data=await this.request("/api/mitra/v6.1/shipping_price","POST",{origin:origin.districtId,subdistrict_origin:origin.id,destination:destination.districtId,subdistrict_destination:destination.id,weight,...size,item_value:value,insurance:insured?1:0,courier:["jnt"]});return kiriminRates(data.results);
 }
 async validatePin(pin:string){const data=await this.request("/api/mitra/v6.2/pin/validate","POST",{pin});if(record(data.data).valid!==true)throw new KiriminPinError("PIN KA Credit belum valid. Perbarui PIN pada pengaturan pemilik sebelum mencoba ulang.");}
 async balance(){const n=Number(record((await this.request("/api/mitra/v6.2/credit/balance","GET")).results).balance);if(!Number.isFinite(n)||n<0)throw new KiriminError("Saldo KA Credit belum dapat diperiksa.");return n;}
 async create(payload:Record<string,unknown>,pin:string){return this.request("/api/mitra/v6.2/request_pickup","POST",{...payload,payment_method:"credit",pin});}
 async detail(no:string){return this.request("/api/mitra/tracking","POST",{order_id:no});}
 async history(awb:string){return this.detail(awb);}
 async label(awb:string){
  const result=await this.request("/api/mitra/v6.1/awb/print","POST",{awb:[awb]}),url=String(record(record(result.data).data).url||"");
  let target:URL;try{target=new URL(url);}catch{throw new KiriminError("KiriminAja belum memberikan tautan PDF label yang valid.");}
  for(let redirects=0;redirects<4;redirects++){
   if(target.protocol!=="https:"||target.username||target.password||target.port||!(target.hostname==="kiriminaja.com"||target.hostname.endsWith(".kiriminaja.com")))throw new KiriminError("Lokasi PDF label belum dikenali. Minta KiriminAja memastikan domain unduhan label resmi.");
   let r:Response;try{r=await fetch(target.href,{redirect:"manual",signal:AbortSignal.timeout(18000)});}catch{throw new KiriminError("PDF label KiriminAja belum dapat diunduh.");}
   if(r.status>=300&&r.status<400){const to=r.headers.get("location");if(!to)throw new KiriminError("Tautan PDF label tidak valid.");target=new URL(to,target);continue;}
   if(!r.ok||Number(r.headers.get("content-length")||0)>4000000||!r.body)throw new KiriminError("PDF label KiriminAja belum tersedia.");
   const reader=r.body.getReader(),chunks:Uint8Array[]=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4000000){await reader.cancel();throw new KiriminError("PDF label terlalu besar.");}chunks.push(value);}
   const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}if(new TextDecoder().decode(bytes.subarray(0,5))!=="%PDF-")throw new KiriminError("Label resmi KiriminAja belum berupa PDF yang valid.");return bytes;
  }
  throw new KiriminError("Tautan PDF label berulang kali dialihkan.");
 }
}
