import {kiriminSettings,kiriminRatesReady} from '@/modules/order/shipping-settings';
import {customerLocation,validKiriminOrigin} from '@/modules/order/kiriminaja';
import {searchDestinations,shippingQuotes} from '@/modules/order/checkout-shipping';
import {AppError} from '@/modules/order/order-server';
import * as legacy from "@/modules/shipping/legacy-shipping-server";
import type { Location } from "@/modules/shipping/shipping-data";
export { ShippingError,assertSameOrigin } from "@/modules/shipping/legacy-shipping-server";
async function bridge(body:Record<string,unknown>){
 try{
  const connected=await kiriminRatesReady(),{config}=await kiriminSettings();
  if(body.action==='status')return {connected,provider:'KiriminAja',origin:validKiriminOrigin(config.origin)?customerLocation(config.origin):null,checkedAt:null};
  if(!connected)return null;
  if(body.action==='search')return {locations:await searchDestinations(body.query)};
  if(body.action==='rates'){
   const quotes=await shippingQuotes(body.destinationId,body.grams),first=quotes[0];
   return {destination:first.destination.label,weight:first.grams/1000,source:'KiriminAja',services:quotes.map(q=>({amount:q.amount,service:q.service,description:q.serviceName,etd:q.etd}))};
  }
  throw new legacy.ShippingError(400,'INVALID_INPUT','Permintaan ongkir tidak valid.');
 }catch(e){if(e instanceof AppError)throw new legacy.ShippingError(e.status,'PROVIDER_ERROR',e.message);throw e}
}
export async function status(){const current=await bridge({action:"status"});if(current?.connected)return {...current,provider:"KiriminAja",kiriminReady:true};const previous=await legacy.status();return {...previous,provider:"RajaOngkir/Komerce",kiriminReady:false};}
export async function search(query:string){const current=await status();if(!current.kiriminReady)return legacy.search(query);const data=await bridge({action:"search",query});if(!Array.isArray(data?.locations))throw new legacy.ShippingError(502,"INVALID_RESPONSE","Wilayah KiriminAja belum dapat dibaca.");return data.locations as Location[];}
export async function rates(destinationId:number,grams:number){const current=await status();if(!current.kiriminReady)return {...await legacy.rates(destinationId,grams),source:"RajaOngkir/Komerce"};const data=await bridge({action:"rates",destinationId,grams});if(!data||!Array.isArray(data.services)||typeof data.destination!=="string")throw new legacy.ShippingError(502,"INVALID_RESPONSE","Tarif KiriminAja belum dapat dibaca.");return data as {destination:string;weight:number;source:string;services:{amount:number;service:string;description?:string;etd:string}[]};}
export async function quote(destinationId:number,grams:number){const data=await rates(destinationId,grams),row=data.services.find(r=>["EZ","REG","REGULAR","REGULER"].includes(r.service.toUpperCase().replace(/[^A-Z0-9]/g,"")));if(!row)throw new legacy.ShippingError(404,"NO_REGULAR_SERVICE","J&T Regular belum tersedia untuk rute ini.");return {destination:data.destination,weight:data.weight,amount:row.amount,service:row.service,etd:row.etd,source:data.source,checked:new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"}).format(new Date())+" WIB"};}
