import type { ShippingQuote } from "@/modules/order/shipping-types";
import { jntServiceName } from "@/modules/order/shipping-types";
import { orderItems } from "@/modules/order/order-items";
import { paymentMethodLabel, paymentStatusLabel, type PaymentMethod } from "@/modules/order/payment-types";
export type Order = { customer_id?:string|null;item_subtotal?:number|null;discount_amount?:number; payment_method?:PaymentMethod; catalog_checkout_id?:string|null;catalog_token?:string|null;catalog_items_json?:string|null;stock_sync_state?:string;stock_sync_error?:string|null; id:string; created_at:number; name:string; phone:string; address:string; postcode:string; item:string; quantity?:number; items?:string[]; items_json?:string|null; total:number; item_amount?:number|null; shipping_amount?:number|null; shipping_json?:string|null; quote?:ShippingQuote|null; status:string; proof_key?:string|null; proof_mime?:string|null; notify_status:string; invoice_message?:string|null; proof_message?:string|null; recipient_message?:string|null; session_hash?:string; delivery_chat?:string|null; payment_state?:string; confirmed_at?:number|null; confirmed_by?:string|null };
export const rupiah = (n:number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(n);
export const dateLabel = (n:number)=>new Date(n).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"})+" WIB";
export function orderQuote(o:Order):ShippingQuote|null {if(o.quote)return o.quote;if(!o.shipping_json)return null;try{return JSON.parse(o.shipping_json) as ShippingQuote;}catch{return null;}}
export function invoiceText(o:Order,options:{includeRecipient?:boolean}={}){
 const q=orderQuote(o),items=orderItems(o),service=q?(q.serviceName||jntServiceName(q.service)):"J&T",includeRecipient=options.includeRecipient!==false;
 return [`ELITE.VTG · INVOICE ${o.id}`,dateLabel(o.created_at),"",...(includeRecipient?[`Pembeli: ${o.name}`,`Telepon: ${o.phone}`,`Alamat: ${o.address}`,`Kode pos: ${o.postcode}`,""]:[]),`Jumlah barang: ${items.length}`,"Barang:",...items.map((name,index)=>`${index+1}. ${name}`),...(o.item_amount!=null?[...(o.discount_amount?[`Subtotal barang: ${rupiah(o.item_subtotal??o.item_amount+o.discount_amount)}`,`Diskon pembelian pertama 5%: -${rupiah(o.discount_amount)}`]:[]),`Harga ${items.length>1?"total ":""}barang: ${rupiah(o.item_amount)}`,`Ongkir ${service}: ${rupiah(o.shipping_amount||0)}`]:[]),...(q?[...(includeRecipient?[`Tujuan: ${q.destination.label}`]:[]),`Berat paket: ${q.grams/1000} kg`,`Layanan: ${service} (${q.service})`,`Tarif dicek: ${dateLabel(q.checkedAt)}`]:[]),`Total pembayaran: ${rupiah(o.total)}`,`Metode: ${paymentMethodLabel(o.payment_method)}`,`Status pembayaran: ${paymentStatusLabel(o)}`,`Status pesanan: ${o.status==="awaiting_proof"?"Belum dikirim":"Pesanan berhasil dikirim"}`,...(o.status==="awaiting_proof"?[]:["Bukti pembayaran telah dilampirkan."])].join("\n");
}
export function recipientAddress(o:Order){
 const q=orderQuote(o);
 return [o.address,...(q?[q.destination.label]:[]),`Kode pos: ${o.postcode}`].join("\n");
}
export function recipientText(o:Order){
 return [`ELITE.VTG · DETAIL PENERIMA ${o.id}`,"",`Nama: ${o.name}`,`No. HP: ${o.phone}`,"Alamat lengkap:",recipientAddress(o)].join("\n");
}
export function recipientMessage(o:Order){
 const text=recipientText(o),address=recipientAddress(o);
 // Telegram entity offsets use UTF-16 units, matching JavaScript string lengths.
 // The full address stays in one copyable block, even beyond CopyTextButton's limit.
 return {text,entities:[{type:"pre",offset:text.length-address.length,length:address.length}],
  ...(address.length<=256?{reply_markup:{inline_keyboard:[[{text:"Salin alamat",copy_text:{text:address}}]]}}:{})};
}
