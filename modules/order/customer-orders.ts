import {orderProgress} from './order-progress';
import type {Order} from './order-types';
import type {ReserveSummary} from './reserve-types';

export const PAYMENT_SESSION_LIFETIME=7*86400000;
export type CustomerOrderRow=ReturnType<typeof customerOrderRow>;

// History reads stored progress only; opening this list never calls a courier API.
export function customerOrderRow(o:Order,reservation:ReserveSummary|null,now=Date.now()){
 const progress=orderProgress(o),ended=['cancelled','expired'].includes(o.status);
 const awaitingPayment=!reservation&&!o.proof_key&&!ended&&o.status==='awaiting_proof'&&o.created_at>now-PAYMENT_SESSION_LIFETIME;
 let label=progress.label,action:'payment'|'tracking'|'reserve'|null=null;
 if(reservation){
  action=reservation.status==='PAID'&&o.proof_key?'tracking':'reserve';
 }else if(ended)label=o.status==='cancelled'?'Pesanan dibatalkan':'Pembayaran kedaluwarsa';
 else if(awaitingPayment){label='Menunggu pembayaran';action='payment'}
 else if(o.proof_key)action='tracking';
 else label='Sesi pembayaran berakhir';
 return {id:o.id,createdAt:o.created_at,...progress,label,awaitingPayment,action,reservation};
}
