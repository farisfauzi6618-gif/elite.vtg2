import {orderQuote,type Order} from './order-types';
import {quoteServiceName} from './shipping-types';
import {orderItems} from './order-items';
export type ProgressStatus='PAYMENT_RECEIVED'|'PAYMENT_CONFIRMED'|'PREPARING'|'SHIPPED';
export const progressLabels:Record<ProgressStatus,string>={PAYMENT_RECEIVED:'Payment received',PAYMENT_CONFIRMED:'Payment confirmed',PREPARING:'Preparing your order',SHIPPED:'Order shipped'};
export function progressStatus(o:Order):ProgressStatus{
 if(o.payment_state!=='payment_confirmed')return 'PAYMENT_RECEIVED';
 return o.shipped_at&&o.tracking_number?'SHIPPED':o.preparing_at?'PREPARING':'PAYMENT_CONFIRMED';
}
export function orderProgress(o:Order,tracking?:{stage:string;awb:string|null;courier:string}){const quote=orderQuote(o);let status=progressStatus(o);if(o.payment_state==='payment_confirmed'&&!o.preparing_at&&!o.shipped_at&&tracking){if(['in_transit','out_for_delivery','delivered','returned'].includes(tracking.stage)&&tracking.awb)status='SHIPPED';else if(tracking.stage==='preparing')status='PREPARING';}return {status,label:progressLabels[status],items:orderItems(o),total:o.total,paymentConfirmed:o.payment_state==='payment_confirmed',courier:quote?.courier==='jne'&&status!=='SHIPPED'?'Pengiriman reguler':o.courier_name||tracking?.courier||(quote?quoteServiceName(quote):'J&T Regular'),trackingNumber:status==='SHIPPED'?o.tracking_number||tracking?.awb:null,revision:o.post_purchase_revision??0,timeline:[{status:'PAYMENT_RECEIVED',label:progressLabels.PAYMENT_RECEIVED,at:o.proof_received_at??null},{status:'PAYMENT_CONFIRMED',label:progressLabels.PAYMENT_CONFIRMED,at:o.confirmed_at??null},{status:'PREPARING',label:progressLabels.PREPARING,at:o.preparing_at??null},{status:'SHIPPED',label:progressLabels.SHIPPED,at:o.shipped_at??null}]}};
