import type { ShippingQuote } from "@/modules/order/shipping-types";
import { jntServiceName } from "@/modules/order/shipping-types";
import { orderItems } from "@/modules/order/order-items";
import { paymentMethodLabel, paymentStatusLabel, type PaymentMethod } from "@/modules/order/payment-types";
export type Order = { order_type?:'normal'|'reserve';reservation_status?:import('./reserve-types').ReserveStatus;reservation_started_at?:number|null;reservation_deadline?:number|null;deposit_minimum?:number|null;deposit_amount?:number|null;reservation?:import('./reserve-types').ReserveSummary|null; proof_received_at?:number|null;preparing_at?:number|null;shipped_at?:number|null;courier_name?:string|null;tracking_number?:string|null;post_purchase_revision?:number;post_purchase_updated_by?:string|null; discount_voucher_id?:string|null;discount_label?:string|null; customer_id?:string|null;item_subtotal?:number|null;discount_amount?:number; payment_method?:PaymentMethod; catalog_checkout_id?:string|null;catalog_token?:string|null;catalog_items_json?:string|null;stock_sync_state?:string;stock_sync_error?:string|null; id:string; created_at:number; name:string; phone:string; address:string; postcode:string; item:string; quantity?:number; items?:string[]; items_json?:string|null; total:number; item_amount?:number|null; shipping_amount?:number|null; shipping_json?:string|null; quote?:ShippingQuote|null; status:string; proof_key?:string|null; proof_mime?:string|null; notify_status:string; invoice_message?:string|null; proof_message?:string|null; recipient_message?:string|null; session_hash?:string; delivery_chat?:string|null; payment_state?:string; confirmed_at?:number|null; confirmed_by?:string|null };
export const rupiah = (n:number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n);
export const dateLabel = (n:number)=>new Date(n).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})+" WIB";
export function orderQuote(o:Order):ShippingQuote|null {if(o.quote)return o.quote;if(!o.shipping_json)return null;try{return JSON.parse(o.shipping_json) as ShippingQuote;}catch{return null;}}
export function invoiceText(o:Order,options:{includeRecipient?:boolean}={}){
 if(o.order_type==='reserve'){const s=o.reservation;return ['ELITE Reserve · '+o.id,dateLabel(o.created_at),...orderItems(o),...(s?['Order value: '+rupiah(s.orderValue),'Deposit paid: '+rupiah(s.depositPaid),'Total paid: '+rupiah(s.totalPaid),'Remaining balance: '+rupiah(s.remaining),'Status: '+s.status,s.deadline?'Complete payment before: '+dateLabel(s.deadline):'72 jam sejak deposit dikonfirmasi']:['Order value: '+rupiah(o.item_amount??o.total),'Status: '+o.reservation_status]),'Ongkir dibayar saat pelunasan.'].join('\n')}
 const q=orderQuote(o),items=orderItems(o),service=q?(q.serviceName||jntServiceName(q.service)):"J&T",includeRecipient=options.includeRecipient!==false;
 return [`ELITE.VTG · INVOICE ${o.id}`,dateLabel(o.created_at),"",...(includeRecipient?[`Pembeli: ${o.name}`,`Telepon: ${o.phone}`,`Alamat: ${o.address}`,`Kode pos: ${o.postcode}`,""]:[]),`Jumlah barang: ${items.length}`,"Barang:",...items.map((name,index)=>`${index+1}. ${name}`),...(o.item_amount!=null?[...(o.discount_amount?[`Subtotal barang: ${rupiah(o.item_subtotal??o.item_amount+o.discount_amount)}`,`${o.discount_label||"Diskon pembelian pertama 5%"}: -${rupiah(o.discount_amount)}`]:[]),`Harga ${items.length>1?"total ":""}barang: ${rupiah(o.item_amount)}`,`Ongkir ${service}: ${rupiah(o.shipping_amount||0)}`]:[]),...(q?[...(includeRecipient?[`Tujuan: ${q.destination.label}`]:[]),`Berat paket: ${q.grams/1000} kg`,`Layanan: ${service} (${q.service})`,`Tarif dicek: ${dateLabel(q.checkedAt)}`]:[]),`Total pembayaran: ${rupiah(o.total)}`,`Metode: ${paymentMethodLabel(o.payment_method)}`,`Status pembayaran: ${paymentStatusLabel(o)}`,`Status pesanan: ${o.status==="awaiting_proof"?"Belum dikirim":"Pesanan berhasil dikirim"}`,...(o.status==="awaiting_proof"?[]:["Bukti pembayaran telah dilampirkan."])].join("\n");
}
export function recipientAddress(o:Order){
 const q=orderQuote(o);
 return [o.address,...(q?[q.destination.label]:[]),`Kode pos: ${o.postcode}`].join("\n");
}
export function recipientText(o:Order){
 return [`ELITE.VTG · DETAIL PENERIMA ${o.id}`,"",`Nama: ${o.name}`,`No. HP: ${o.phone}`,"Alamat lengkap:",recipientAddress(o)].join("\n");
}
export function recipientMessage(o:Order){
 const text=recipientText(o);
 // Telegram entity offsets use UTF-16 units, matching JavaScript string lengths.
 // All recipient fields stay in one copyable block, even beyond the button limit.
 return {text,entities:[{type:"pre",offset:0,length:text.length}],
  ...(text.length<=256?{reply_markup:{inline_keyboard:[[{text:"Salin detail penerima",copy_text:{text}}]]}}:{})};
}

// A document caption is limited to 1024 characters. Keep all payment amounts;
// unusually long item lists remain available in the existing owner dashboard.
export function telegramInvoiceCaption(o:Order){
 const items=orderItems(o),q=orderQuote(o),service=q?(q.serviceName||jntServiceName(q.service)):"J&T";
 const head=`ELITE.VTG · INVOICE ${o.id}\n${dateLabel(o.created_at)}\n\nJumlah barang: ${items.length}\n`;
 const tail=[...(o.item_amount!=null?[...(o.discount_amount?[`Subtotal barang: ${rupiah(o.item_subtotal??o.item_amount+o.discount_amount)}`,`Diskon: -${rupiah(o.discount_amount)}`]:[]),`Harga barang: ${rupiah(o.item_amount)}`,`Ongkir ${service}: ${rupiah(o.shipping_amount||0)}`]:[]),`Total pembayaran: ${rupiah(o.total)}`,`Metode: ${paymentMethodLabel(o.payment_method)}`,`Status: ${paymentStatusLabel(o)}`,"Bukti pembayaran terlampir.",...(o.catalog_checkout_id?[]:["Pesanan manual: cocokkan harga yang disepakati."])].join("\n");
 let names=items.map((name,i)=>`${i+1}. ${name}`).join("\n");
 const budget=1024-head.length-tail.length-2;
 if(names.length>budget){const note="\n… Daftar lengkap di dashboard pesanan.";names=Array.from(names).slice(0,Math.max(0,budget-note.length-1)).join("");while(names.length+note.length>budget)names=names.slice(0,-1);names+=note;}
 return head+names+"\n\n"+tail;
}
