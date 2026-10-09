export type TrackingStage="proof_received"|"payment_confirmed"|"preparing"|"awb_available"|"in_transit"|"out_for_delivery"|"delivered"|"returned"|"cancelled";
export type TrackingEvent={date:string;description:string;status:string;code:string};
export type TrackingHistory={stage:TrackingStage;lastStatus:string;events:TrackingEvent[]};
export type CustomerTracking=TrackingHistory&{invoice:string;awb:string|null;courier:string;paymentConfirmed:boolean;checkedAt:number|null;stale:boolean;simulation:boolean;message:string;accessUrl?:string};
export const trackingStageLabels:Record<TrackingStage,string>={proof_received:"Bukti pembayaran diterima",payment_confirmed:"Pembayaran dikonfirmasi",preparing:"Pesanan sedang disiapkan",awb_available:"Resi tersedia · menunggu pembaruan kurir",in_transit:"Paket dalam perjalanan",out_for_delivery:"Paket diantar ke penerima",delivered:"Paket telah diterima",returned:"Paket dalam proses retur",cancelled:"Pengiriman dibatalkan"};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
const clean=(value:unknown,max:number)=>typeof value==="string"?value.replace(/[\x00-\x1f\x7f]/g," ").trim().slice(0,max):"";
function statusStage(value:string):TrackingStage{
 const s=value.toUpperCase().trim();
 if(/CANCELLED|CANCELED|DIBATALKAN/.test(s))return "cancelled";
 if(/RETURN|RETUR|DIKEMBALIKAN/.test(s))return "returned";
 if(/^(DELIVERED|DITERIMA PENERIMA|DITERIMA OLEH PENERIMA|PAKET TELAH DITERIMA)(\b|\s|[:.-])/.test(s))return "delivered";
 if(/OUT FOR DELIVERY|SEDANG DIANTAR|DIANTAR KE PENERIMA|WITH DELIVERY COURIER/.test(s))return "out_for_delivery";
 if(/PICKED UP|PICKUP COMPLETED|DIJEMPUT|IN TRANSIT|DALAM PERJALANAN|DEPARTED|ARRIVED|SORTING|SORTIR|DITERIMA DI|RECEIVED AT/.test(s))return "in_transit";
 return "awb_available";
}
// Explicitly project the documented history response; never return provider order details.
export function normalizeTrackingHistory(value:unknown,awb:string):TrackingHistory{
 const data=object(value);
 if(data.details&&Array.isArray(data.histories)){
  const details=object(data.details);if(details.awb!==awb)throw new Error("Riwayat resi belum dapat dikonfirmasi.");
  const seen=new Set<string>(),events:TrackingEvent[]=data.histories.slice(0,200).flatMap(raw=>{const row=object(raw),status=clean(row.status,1200),date=clean(row.created_at,64);if(!status)return [];const event={date:/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(date)?date:"",description:status,status:status.slice(0,300),code:clean(String(row.status_code??""),60)};const key=JSON.stringify(event);if(seen.has(key))return [];seen.add(key);return [event];}).sort((a,b)=>b.date.localeCompare(a.date));
  const lastStatus=events[0]?.status||clean(data.text,300),code=Number(details.status_code??data.status_code);
  // Root status_code is a shipment code, never an HTTP success code. Delivery
  // requires actual courier evidence; a newly assigned AWB cannot imply transit.
  let stage=statusStage(lastStatus);if(details.delivered===true&&details.delivered_at)stage="delivered";else if(code===300)stage="cancelled";else if(code===400)stage="returned";else if(stage==="awb_available"&&[103,104,106].includes(code)&&events.length)stage="in_transit";
  return {stage,lastStatus,events};
 }
 if(data.airway_bill!==awb||!Array.isArray(data.history))throw new Error("Riwayat resi belum dapat dikonfirmasi.");
 const seen=new Set<string>();
 const events:TrackingEvent[]=data.history.slice(0,200).flatMap(raw=>{const row=object(raw),description=clean(row.desc,1200),status=clean(row.status,300),code=clean(String(row.code??""),60),date=clean(row.date,64);if(!description&&!status)return [];
 const event={description,status,code,date:/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(date)?date:""};const key=JSON.stringify(event);if(seen.has(key))return [];seen.add(key);return [event];}).sort((a,b)=>b.date.localeCompare(a.date));
 const lastStatus=clean(data.last_status,300)||events[0]?.status||"";
 return {stage:statusStage(lastStatus),lastStatus,events};
}
