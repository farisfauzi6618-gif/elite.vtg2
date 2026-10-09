import { AppError } from "@/modules/order/order-server";
import type { KomshipLocation,ShippingConfig } from "@/modules/order/fulfilment-types";
import type { ShippingLocation } from "@/modules/order/shipping-types";
import { regularJnt } from "@/modules/order/shipping-types";

type Dict=Record<string,unknown>;
const object=(v:unknown):Dict=>v&&typeof v==="object"&&!Array.isArray(v)?v as Dict:{};
export class KomshipError extends AppError {constructor(message:string,public uncertain=false,public rejected=false){super(502,message);}}
export const komshipOrigin=(mode:string)=>mode==="sandbox"?"https://api-sandbox.collaborator.komerce.id":"https://api.collaborator.komerce.id";
export class Komship {
 constructor(private key:string,public environment:"sandbox"|"production"){}
 async request(path:string,method="GET",payload?:unknown):Promise<unknown>{
  let response:Response;
  try{response=await fetch(komshipOrigin(this.environment)+path,{method,redirect:"manual",headers:{"x-api-key":this.key,"Content-Type":"application/json","Accept":"application/json"},...(payload===undefined?{}:{body:JSON.stringify(payload)}),signal:AbortSignal.timeout(18000)});}catch{throw new KomshipError("Koneksi Komship terputus. Respons pengiriman belum bisa dipastikan.",true);}
  if(response.status>=300&&response.status<400)throw new KomshipError("Komship memberikan respons pengalihan yang tidak valid.",true);
  let v:Dict;try{v=object(await response.json());}catch{throw new KomshipError("Respons Komship tidak dapat dibaca.",true);}
  const meta=object(v.meta),code=Number(meta.code||response.status);
  if(!response.ok||meta.status==="failed"||meta.status==="error"||meta.status===false||code>=400){
   // Only an explicit validation/auth rejection proves the create request was not accepted.
   const rejected=[400,401,403,422,429].includes(code)&&["failed","error",false].includes(meta.status as string|boolean);
   throw new KomshipError([401,403].includes(code)?"Komship menolak key Shipping Delivery. Periksa aktivasi akun dan lingkungan API.":[400,422].includes(code)?"Komship menolak data atau saldo booking. Periksa saldo, alamat, berat, dan layanan di pengaturan.":"Komship belum dapat memproses permintaan. Coba ulang setelah memeriksa status pesanan.",!rejected,rejected);
  }
  if(!("data" in v))throw new KomshipError("Data Komship belum lengkap.",true);
  return v.data;
 }
 async search(keyword:string):Promise<KomshipLocation[]>{
  const data=await this.request("/tariff/api/v1/destination/search?"+new URLSearchParams({keyword}));
  if(!Array.isArray(data))throw new KomshipError("Daftar wilayah Komship tidak valid.");
  return data.map(v=>{const r=object(v);return {id:Number(r.id),label:String(r.label||""),village:String(r.subdistrict_name||""),district:String(r.district_name||""),city:String(r.city_name||""),postcode:String(r.zip_code||"")};}).filter(r=>Number.isSafeInteger(r.id)&&r.id>0&&r.label.length<300&&/^\d{5}$/.test(r.postcode));
 }
 async destination(location:ShippingLocation){const rows=await this.search(location.postalCode);const matching=rows.filter(r=>normalize(r.district)===normalize(location.district)&&normalize(r.city)===normalize(location.city)&&normalize(r.village)===normalize(location.village));if(matching.length!==1)throw new AppError(409,"Wilayah tujuan belum cocok tepat di Komship. Pilih wilayah Komship pada pengaturan pesanan.");return matching[0];}
 async tariff(origin:number,destination:number,grams:number,value:number,service="EZ"){
  const data=object(await this.request("/tariff/api/v1/calculate?"+new URLSearchParams({shipper_destination_id:String(origin),receiver_destination_id:String(destination),weight:String(grams/1000),item_value:String(value),cod:"no"})));
  return bestJntRate(data.calculate_reguler,service);
 }
 async store(payload:Dict){const data=object(await this.request("/order/api/v1/orders/store","POST",payload));if(!/^[A-Za-z0-9_-]{5,90}$/.test(String(data.order_no||"")))throw new KomshipError("Komship belum mengembalikan nomor booking yang valid. Periksa dashboard Komship.",true);return {id:String(data.order_id||""),no:String(data.order_no)};}
 async detail(no:string){let data=object(await this.request("/order/api/v1/orders/detail?"+new URLSearchParams({order_no:no})));if(data.data&&data.meta)data=object(data.data);return data;}
 async history(awb:string){return this.request("/order/api/v1/orders/history-airway-bill?"+new URLSearchParams({shipping:"JNT",airway_bill:awb}));}
 async pickup(no:string,schedule:{date:string;time:string;vehicle:string}){const data=await this.request("/order/api/v1/pickup/request","POST",{pickup_date:schedule.date,pickup_time:schedule.time,pickup_vehicle:schedule.vehicle,orders:[{order_no:no}]});const row=(Array.isArray(data)?data:[]).map(object).find(r=>r.order_no===no);if(!row||row.status!=="success")throw new KomshipError("Pickup belum dikonfirmasi Komship. Cek kembali booking yang sudah tersimpan.",!row,!!row&&["failed","error"].includes(String(row.status)));return String(row.awb||"");}
 async label(no:string,page:string){const data=object(await this.request("/order/api/v1/orders/print-label?"+new URLSearchParams({page,order_no:no}),"POST"));let bytes:Uint8Array;
  if(typeof data.base_64==="string"&&data.base_64.length<6_000_000){const raw=data.base_64.replace(/^data:application\/pdf;base64,/,"");try{bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));}catch{throw new KomshipError("PDF label Komship tidak valid.");}}
  else {const path=String(data.path||"");if(!/^\/storage\/label-[A-Za-z0-9_-]+\.pdf$/.test(path))throw new KomshipError("Lokasi PDF label Komship tidak valid.");let r:Response;try{r=await fetch(komshipOrigin(this.environment)+"/order"+path,{redirect:"manual",headers:{"x-api-key":this.key},signal:AbortSignal.timeout(18000)});}catch{throw new KomshipError("PDF label belum dapat diunduh.");}if(!r.ok||Number(r.headers.get("Content-Length")||0)>4_000_000)throw new KomshipError("PDF label belum dapat diunduh.");bytes=new Uint8Array(await r.arrayBuffer());}
  if(bytes.length>4_000_000||new TextDecoder().decode(bytes.subarray(0,5))!=="%PDF-")throw new KomshipError("File label resmi belum berupa PDF yang valid.");return bytes;
 }
}
export const normalize=(s:string)=>s.toUpperCase().replace(/\b(KABUPATEN|KAB\.?|KOTA|KECAMATAN|KEC\.?|KELURAHAN|KEL\.?|DESA)\b/g,"").replace(/[^A-Z0-9]/g,"");
export type RegularRate={courier:string;service:string;gross:number;cashback:number;net:number};
export function bestJntRate(data:unknown,service="EZ"):RegularRate{
 if(!Array.isArray(data))throw new AppError(409,"Layanan J&T yang dipilih belum tersedia untuk booking di Komship.");
 const regular=regularJnt(service),code=service.toUpperCase();
 const rows=data.map(object).filter(r=>["JNT","J&T","J&T EXPRESS"].includes(String(r.shipping_name).toUpperCase())&&(regular?regularJnt(String(r.service_name)):String(r.service_name).toUpperCase()===code)).map(r=>({courier:"JNT",service:regular?"EZ":String(r.service_name),gross:Number(r.shipping_cost),cashback:Number(r.shipping_cashback||0),net:Number(r.shipping_cost_net)})).filter(r=>Number.isSafeInteger(r.gross)&&r.gross>0&&Number.isSafeInteger(r.cashback)&&r.cashback>=0&&r.cashback<=r.gross&&Number.isSafeInteger(r.net)&&r.net===r.gross-r.cashback);
 rows.sort((a,b)=>b.cashback-a.cashback||a.net-b.net);
 if(!rows.length)throw new AppError(409,`Layanan J&T ${service} yang dipilih pembeli belum tersedia untuk booking di Komship. Periksa layanan ini sebelum mencoba ulang.`);
 return rows[0];
}
export function bestRegularRate(data:unknown):RegularRate{return bestJntRate(data,"EZ");}

export function pickupSchedule(c:ShippingConfig,now=Date.now()){const date=new Date(now+7*3600000);const today=date.toISOString().slice(0,10),target=Date.parse(today+"T"+c.pickupTime+":00+07:00");const next=c.pickupDay==="next_day"||now+3600000>target;const day=new Date(Date.parse(today+"T00:00:00Z")+(next?86400000:0)).toISOString().slice(0,10);return {date:day,time:c.pickupTime+":00",vehicle:c.pickupVehicle};}
