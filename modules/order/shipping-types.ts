export type ShippingLocation = { id:number; label:string; province:string; city:string; district:string; village:string; postalCode:string;provider?:"kiriminaja";districtId?:number;provinceId?:number;cityId?:number };
export type ShippingCourier='jnt'|'jne';
export type ShippingPayment='prepaid'|'collect';
export type ShippingQuote = { id:string; destination:ShippingLocation; amount:number; grams:number; service:string; serviceName?:string; courier?:ShippingCourier; paymentMode?:ShippingPayment; etd:string; source:string; checkedAt:number; expiresAt:number };
export const regularJnt=(service:string)=>["EZ","REG","REGULAR","REGULER"].includes(service.toUpperCase().replace(/[^A-Z0-9]/g,""));
export function jntServiceName(service:string,description?:string){if(regularJnt(service))return "J&T Regular";const label=description?.trim();return label?(/^J[&N]T\b/i.test(label)?label:`J&T ${label}`):`J&T ${service}`;}
/** Older stored quotes omit courier and retain their original J&T meaning. */
export function quoteServiceName(quote:ShippingQuote){return quote.serviceName||(quote.courier==='jne'?(quote.service.toUpperCase()==='REG'?'JNE Regular':`JNE ${quote.service}`):jntServiceName(quote.service));}
export const shippingCollect=(quote?:ShippingQuote|null)=>quote?.paymentMode==='collect';
export const shippingPayable=(quote:ShippingQuote)=>shippingCollect(quote)?0:quote.amount;
export function shippingDescription(quote?:ShippingQuote|null,amount?:number){
 const price=new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(shippingCollect(quote)?quote!.amount:amount??quote?.amount??0);
 return shippingCollect(quote)?`Bayar ke kurir saat paket tiba · estimasi ${price}`:price;
}
