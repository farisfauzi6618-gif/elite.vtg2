export type ShippingLocation = { id:number; label:string; province:string; city:string; district:string; village:string; postalCode:string;provider?:"kiriminaja";districtId?:number;provinceId?:number;cityId?:number };
export type ShippingQuote = { id:string; destination:ShippingLocation; amount:number; grams:number; service:string; serviceName?:string; etd:string; source:string; checkedAt:number; expiresAt:number };
export const regularJnt=(service:string)=>["EZ","REG","REGULAR","REGULER"].includes(service.toUpperCase().replace(/[^A-Z0-9]/g,""));
export function jntServiceName(service:string,description?:string){if(regularJnt(service))return "J&T Regular";const label=description?.trim();return label?(/^J[&N]T\b/i.test(label)?label:`J&T ${label}`):`J&T ${service}`;}
