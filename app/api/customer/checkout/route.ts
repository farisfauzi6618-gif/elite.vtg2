import {currentCustomer} from '@/modules/catalog/customers';
import {db,api,json,AppError} from '@/modules/order/order-server';
import type {ShippingLocation} from '@/modules/order/shipping-types';
export const GET=(request:Request)=>api(async()=>{
 const customer=await currentCustomer(request.headers.get('cookie'));if(!customer)throw new AppError(401,'Masuk untuk memakai alamat pesanan sebelumnya.');
 const row=await db().prepare("SELECT name,phone,address,postcode,shipping_json FROM orders WHERE customer_id=? AND status NOT IN ('cancelled','expired') ORDER BY created_at DESC LIMIT 1").bind(customer.id).first<{name:string;phone:string;address:string;postcode:string;shipping_json:string|null}>();
 let destination:ShippingLocation|null=null;try{const value=JSON.parse(row?.shipping_json??'{}').destination;if(value&&Number.isSafeInteger(value.id)&&value.id>0&&typeof value.label==='string'&&value.label.length<=240&&/^\d{5}$/.test(value.postalCode)&&value.postalCode===row?.postcode)destination=value}catch{/* Address remains editable without a reusable destination. */}
 if(destination){const cached=await db().prepare('SELECT payload FROM shipping_locations WHERE id=? AND expires_at>?').bind(destination.id,Date.now()).first<{payload:string}>();try{const current=JSON.parse(cached?.payload??'{}');destination=current.postalCode===row?.postcode?current:null}catch{destination=null}}
 return json({recipient:row?{name:row.name,phone:row.phone,address:row.address,postcode:row.postcode,destination}:null},200,{'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow'});
});
export const runtime='nodejs';
export const dynamic='force-dynamic';
