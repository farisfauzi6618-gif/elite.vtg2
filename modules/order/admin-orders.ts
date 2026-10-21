import {db,AppError,publicOrder} from './order-server';
import {shipmentSummary} from './fulfilment';
import type {Shipment} from './fulfilment-types';
import {ADMIN_ORDER_FILTERS,type AdminOrderStatus,type AdminOrderPage,type AdminOrderRow} from './admin-order-types';

const columns='shipping_protection_fee,declared_shipping_value,shipping_protection_source,shipping_protection_confirmed_at,shipping_protection_reference,order_type,reservation_status,proof_received_at,preparing_at,shipped_at,courier_name,tracking_number,post_purchase_revision,payment_method,id,created_at,name,phone,address,postcode,item,quantity,items_json,total,item_amount,item_subtotal,discount_amount,discount_voucher_id,discount_label,shipping_amount,status,notify_status,payment_state,confirmed_at,catalog_checkout_id,catalog_items_json,stock_sync_state,stock_sync_error,proof_key IS NOT NULL AS has_proof,shipping_json';
const base="proof_key IS NOT NULL AND (order_type='normal' OR reservation_status='PAID')";
const progress="CASE WHEN COALESCE(payment_state,'')!='payment_confirmed' THEN 'received' WHEN shipped_at IS NOT NULL AND COALESCE(tracking_number,'')!='' THEN 'shipped' WHEN preparing_at IS NOT NULL THEN 'preparing' ELSE 'confirmed' END";

export function adminOrderFilters(params:URLSearchParams){
  const q=(params.get('q')??'').trim(),status=params.get('status')??'all',raw=params.get('page')??'1';
  if(q.length>120||!ADMIN_ORDER_FILTERS.some(([value])=>value===status)||!/^\d{1,6}$/.test(raw)||Number(raw)<1)throw new AppError(400,'Pencarian atau halaman pesanan tidak valid.');
  return {q,status:status as AdminOrderStatus,page:Number(raw)};
}

export async function readAdminOrderPage(input:{q?:string;status?:AdminOrderStatus;page?:number;pageSize?:number}={}):Promise<AdminOrderPage>{
  const q=input.q??'',status=input.status??'all',pageSize=input.pageSize===100?100:20,clauses=[base],args:unknown[]=[];
  if(status!=='all'){clauses.push(`(${progress})=?`);args.push(status)}
  if(q){const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';clauses.push('(id LIKE ? ESCAPE char(92) OR name LIKE ? ESCAPE char(92) OR phone LIKE ? ESCAPE char(92))');args.push(pattern,pattern,pattern)}
  const where=clauses.join(' AND '),counts=await db().prepare(`SELECT COUNT(*) total,(SELECT COUNT(*) FROM orders WHERE order_type='reserve' AND reservation_status IN ('AWAITING_DEPOSIT','RESERVED','PARTIALLY_PAID')) reserveCount FROM orders WHERE ${where}`).bind(...args).first<{total:number;reserveCount:number}>();
  const total=Number(counts?.total??0),pageCount=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(pageCount,Math.max(1,input.page??1));
  const rows=await db().prepare(`SELECT ${columns} FROM orders WHERE ${where} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`).bind(...args,pageSize,(page-1)*pageSize).all<AdminOrderRow>();
  const shipments=rows.results.length?await db().prepare(`SELECT * FROM shipments WHERE order_id IN (${rows.results.map(()=>'?').join(',')})`).bind(...rows.results.map(o=>o.id)).all<Shipment>():{results:[]};
  const byOrder=new Map(shipments.results.map(s=>[s.order_id,shipmentSummary(s)]));
  return {orders:rows.results.map(o=>({...publicOrder(o),has_proof:o.has_proof,payment_state:o.payment_state,confirmed_at:o.confirmed_at,stock_sync_state:o.stock_sync_state,stock_sync_error:o.stock_sync_error,shipment:byOrder.get(o.id)??null})),page,pageCount,pageSize,total,reserveCount:Number(counts?.reserveCount??0)};
}
