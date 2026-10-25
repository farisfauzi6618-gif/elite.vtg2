import {api,json,originCheck,rate,body,myOrder,AppError} from '@/modules/order/order-server';
import {guestPaymentLink,PAYMENT_INVOICE_PATTERN} from '@/modules/order/payment-recovery';
export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function POST(r:Request){
 const response=await api(async()=>{
  originCheck(r);await rate(r,'guest_payment_link',30);
  const value=await body(r);
  if(Object.keys(value).length!==1||typeof value.invoice!=='string'||!PAYMENT_INVOICE_PATTERN.test(value.invoice))throw new AppError(400,'Nomor invoice tidak valid.');
  const order=await myOrder(r);
  if(order.id!==value.invoice)throw new AppError(409,'Pesanan berubah di tab lain. Buka kembali invoice yang ingin disimpan.');
  return json(await guestPaymentLink(order));
 });
 response.headers.set('Cache-Control','private, no-store');response.headers.set('Vary','Cookie');response.headers.set('X-Robots-Tag','noindex, nofollow');
 return response;
}
