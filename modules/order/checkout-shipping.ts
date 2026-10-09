import * as legacy from '@/modules/shipping/legacy-shipping-server';
import { AppError,db,random } from "@/modules/order/order-server";
import type { ShippingLocation,ShippingQuote } from "@/modules/order/shipping-types";
import { jntServiceName,regularJnt } from "@/modules/order/shipping-types";
import { kiriminRatesReady,kiriminSettings,kiriminClient } from "@/modules/order/shipping-settings";
import { customerLocation,validKiriminOrigin } from "@/modules/order/kiriminaja";

async function provider<T>(body:Record<string,unknown>):Promise<T>{
 try{
  if(body.action==='search')return {locations:await legacy.search(String(body.query))} as T;
  if(body.action==='rates')return await legacy.rates(Number(body.destinationId),Number(body.grams)) as T;
  throw new AppError(400,"Permintaan ongkir tidak valid.");
 }catch(e){if(e instanceof legacy.ShippingError)throw new AppError(e.status,e.message);throw e}
}
export async function searchDestinations(query:unknown){
 if(typeof query!=="string"||query.trim().length<3||query.trim().length>100||(!/[\p{L}]/u.test(query)&&!/^\d{5}$/.test(query.trim())))throw new AppError(400,"Ketik kecamatan/kota minimal 3 huruf atau kode pos 5 angka.");
 const data=await kiriminRatesReady()?{locations:(await (await kiriminClient()).search(query.trim())).map(customerLocation)}:await provider<{locations:ShippingLocation[]}>({action:"search",query:query.trim()});
 if(!Array.isArray(data.locations))throw new AppError(503,"Daftar tujuan belum dapat dimuat.");
 const locations=data.locations.filter(l=>Number.isSafeInteger(l.id)&&l.id>0&&typeof l.label==="string"&&l.label.length<=240&&typeof l.city==="string"&&typeof l.district==="string"&&/^\d{5}$/.test(l.postalCode));
 if(locations.length)await db().batch(locations.map(l=>db().prepare("INSERT INTO shipping_locations(id,payload,expires_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,expires_at=excluded.expires_at").bind(l.id,JSON.stringify(l),Date.now()+7*86400000)));
 return locations;
}
export async function shippingQuotes(destinationId:unknown,grams:unknown){
 if(typeof destinationId!=="number"||!Number.isSafeInteger(destinationId)||destinationId<=0||typeof grams!=="number"||!Number.isSafeInteger(grams)||grams<100||grams>30000)throw new AppError(400,"Pilih tujuan dan isi berat paket 0,1–30 kg.");
 const row=await db().prepare("SELECT payload FROM shipping_locations WHERE id=? AND expires_at>?").bind(destinationId,Date.now()).first<{payload:string}>();
 if(!row)throw new AppError(409,"Cari dan pilih ulang tujuan pengiriman.");
 const location=JSON.parse(row.payload) as ShippingLocation;
 const data=await kiriminRatesReady()?await kiriminQuoteData(location,grams):await provider<{destination:string;weight:number;source?:string;services:{amount:number;service:string;description?:string;etd:string}[]}>({action:"rates",destinationId,grams});
 if(data.destination!==location.label||Math.round(data.weight*1000)!==grams||!Array.isArray(data.services))throw new AppError(503,"Pilihan layanan J&T belum dapat dikonfirmasi. Coba lagi.");
 const checkedAt=Date.now(),seen=new Set<string>();
 const quotes:ShippingQuote[]=data.services.flatMap(row=>{if(!row||!Number.isSafeInteger(row.amount)||row.amount<=0||row.amount>10000000||typeof row.service!=="string"||!/^[A-Za-z0-9][A-Za-z0-9 _&+./()-]{0,39}$/.test(row.service))return [];const code=row.service.toUpperCase();if(seen.has(code))return [];seen.add(code);return [{id:random(),destination:location,amount:row.amount,grams,service:row.service,serviceName:jntServiceName(row.service,typeof row.description==="string"?row.description.slice(0,100):undefined),etd:typeof row.etd==="string"?row.etd.slice(0,80):"",source:data.source||"RajaOngkir/Komerce",checkedAt,expiresAt:checkedAt+45*60000}];});
 if(!quotes.length)throw new AppError(503,"Layanan J&T belum tersedia untuk tujuan dan berat paket ini.");
 quotes.sort((a,b)=>Number(regularJnt(b.service))-Number(regularJnt(a.service))||a.amount-b.amount);
 await db().batch([...quotes.map(q=>db().prepare("INSERT INTO shipping_quotes(id,payload,expires_at) VALUES(?,?,?)").bind(q.id,JSON.stringify(q),q.expiresAt)),db().prepare("DELETE FROM shipping_quotes WHERE expires_at<?").bind(checkedAt)]);
 return quotes;
}
export async function shippingQuote(destinationId:unknown,grams:unknown){
 const quotes=await shippingQuotes(destinationId,grams),regular=quotes.find(q=>regularJnt(q.service));
 if(!regular)throw new AppError(503,"J&T Regular belum tersedia untuk tujuan ini. Pilih layanan lain yang tersedia.");
 return regular;
}
export async function loadQuote(id:unknown,postcode:string){
 if(typeof id!=="string"||!/^[a-f0-9]{64}$/.test(id))throw new AppError(400,"Pilih tujuan dan cek ongkir dahulu.");
 const row=await db().prepare("SELECT payload FROM shipping_quotes WHERE id=? AND expires_at>?").bind(id,Date.now()).first<{payload:string}>();
 if(!row)throw new AppError(409,"Tarif telah kedaluwarsa. Tekan Cek ulang ongkir sebelum melanjutkan.");
 const quote=JSON.parse(row.payload) as ShippingQuote;
 if(quote.destination.postalCode!==postcode)throw new AppError(409,"Kode pos berubah. Pilih ulang tujuan untuk menghitung ongkir.");
 return quote;
}
export async function kiriminQuoteData(location:ShippingLocation,grams:number){
 const {config}=await kiriminSettings();if(!validKiriminOrigin(config.origin))throw new AppError(409,"Wilayah asal KiriminAja belum tersedia.");
 const client=await kiriminClient(),destination=await client.destination(location),services=(await client.rates(config.origin,destination,grams,0,false,config)).map(r=>({amount:r.gross,service:r.service,description:r.description,etd:r.etd}));
 return {destination:location.label,weight:grams/1000,source:"KiriminAja",services};
}
