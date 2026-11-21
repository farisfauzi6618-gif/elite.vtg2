import {randomUUID} from 'node:crypto';
import type {InStatement,Transaction} from '@libsql/client';
import {AppError} from '@/modules/catalog/server';
import {allocate,idr,monthAt,monthRange,dateMonth,sum} from './calculations';
import {assignCosts,costPool} from './lots';
import {one,rows,run,statements,openPeriod,primary,type Actor} from './storage';
import type {FinanceSale,FinanceUnit} from './types';
import type {FinanceAction} from './validation';
type Line={productId:string;groupId:string;quantity:number;name:string;label:string;unitPrice:number;regularPrice?:number|null};
type OrderValue={id:string;confirmed_at:number|null;quantity:number;catalog_checkout_id:string|null;catalog_items_json?:string|null;lines_json?:string|null;item_amount:number|null;item_subtotal:number|null;discount_amount:number;status:string;order_type:string;reservation_status:string|null};
type Source=OrderValue&{stock_sync_state:string;payment_state:string;event_payload:string|null;finance_revision:number|null;review_required:number|null;checkout_lines_json:string|null};
function sourceLines(raw:string|null|undefined):Line[]{
 const value:unknown=JSON.parse(raw??'[]');if(!Array.isArray(value)||value.length>20)throw Error('Snapshot barang tidak valid.');
 const lines=value as Line[];for(const l of lines){if(typeof l.productId!=='string'||!l.productId||typeof l.groupId!=='string'||!l.groupId||!Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>20||typeof l.name!=='string'||typeof l.label!=='string')throw Error('Pemetaan barang belum lengkap.');idr(l.unitPrice);if(l.unitPrice<=0)throw Error('Harga satuan belum valid.');if(l.regularPrice!=null)idr(l.regularPrice)}
 if(sum(lines.map(l=>l.quantity))>20)throw Error('Jumlah unit melampaui batas.');return lines;
}
function unitRows(saleId:string,lines:Line[],net:number){
 idr(net);const expanded=lines.flatMap(l=>Array.from({length:l.quantity},()=>l));if(!expanded.length)throw Error('Barang penjualan belum dipetakan.');
 const weights=expanded.map(l=>l.unitPrice);if(net>sum(weights))throw Error('Pendapatan melebihi nilai snapshot barang.');
 const revenue=allocate(net,weights),now=Date.now();
 return expanded.map((l,i):FinanceUnit=>({id:randomUUID(),sale_id:saleId,unit_no:i+1,product_id:l.productId,group_id:l.groupId,product_name:l.name,label:l.label,gross_revenue:Math.max(l.unitPrice,l.regularPrice??l.unitPrice),net_revenue:revenue[i],lot_id:null,cost_version_id:null,cost_basis:null,capital_owner:null,kakak_bps:null,policy_version:1,created_at:now}));
}
function insertUnit(u:FinanceUnit):InStatement{return {sql:'INSERT INTO finance_units(id,sale_id,unit_no,product_id,group_id,product_name,label,gross_revenue,net_revenue,lot_id,cost_version_id,cost_basis,capital_owner,kakak_bps,policy_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',args:[u.id,u.sale_id,u.unit_no,u.product_id,u.group_id,u.product_name,u.label,u.gross_revenue,u.net_revenue,u.lot_id,u.cost_version_id,u.cost_basis,u.capital_owner,u.kakak_bps,u.policy_version,u.created_at]}}
function insertSale(s:FinanceSale):InStatement{return {sql:'INSERT INTO finance_sales(id,source,source_order_id,external_ref,month,sold_at,gross_merchandise,net_merchandise,unit_count,needs_review,review_reason,stock_ref,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',args:[s.id,s.source,s.source_order_id,s.external_ref,s.month,s.sold_at,s.gross_merchandise,s.net_merchandise,s.unit_count,s.needs_review,s.review_reason,s.stock_ref,s.created_at,s.created_by]}}
const paid=(o:Source)=>o.payment_state==='payment_confirmed'&&(o.order_type!=='reserve'||o.reservation_status==='PAID')&&!['cancelled','expired','refunded','failed'].includes(o.status);
// Both halves use a range index; joining with COALESCE would scan old orders.
export const pendingSourceIds=`SELECT e.order_id AS id,e.confirmed_at AS sold_at FROM finance_order_events e WHERE e.imported_at IS NULL AND e.confirmed_at>=? AND e.confirmed_at<? AND NOT EXISTS(SELECT 1 FROM finance_sales s WHERE s.source_order_id=e.order_id)
UNION ALL SELECT o.id,o.confirmed_at AS sold_at FROM orders o WHERE o.payment_state='payment_confirmed' AND o.confirmed_at>=? AND o.confirmed_at<? AND (o.order_type!='reserve' OR o.reservation_status='PAID') AND NOT EXISTS(SELECT 1 FROM finance_order_events e WHERE e.order_id=o.id) AND NOT EXISTS(SELECT 1 FROM finance_sales s WHERE s.source_order_id=o.id)`;
export async function syncSales(tx:Transaction,input:Extract<FinanceAction,{op:'sync'}>,actor:Actor){
 await openPeriod(tx,input.month);const {start,end}=monthRange(input.month);
 const earlier=await one<{confirmed_at:number}>(tx,'SELECT confirmed_at FROM finance_order_events WHERE imported_at IS NULL AND finance_revision>0 AND confirmed_at>0 AND confirmed_at<? ORDER BY confirmed_at LIMIT 1',[start]);
 if(earlier)throw new AppError(409,'Sinkronkan bulan '+monthAt(earlier.confirmed_at)+' terlebih dahulu agar urutan lot FIFO tetap benar.');
 const sources=await rows<Source>(tx,`WITH candidates AS (${pendingSourceIds}) SELECT o.id,o.confirmed_at,o.quantity,o.catalog_checkout_id,o.catalog_items_json,o.item_amount,o.item_subtotal,o.discount_amount,o.status,o.order_type,o.reservation_status,o.stock_sync_state,o.payment_state,e.payload AS event_payload,e.finance_revision,e.review_required,c.lines_json AS checkout_lines_json FROM candidates x JOIN orders o ON o.id=x.id LEFT JOIN finance_order_events e ON e.order_id=o.id LEFT JOIN catalog_checkouts c ON c.id=o.catalog_checkout_id ORDER BY x.sold_at,o.id LIMIT 101`,[start,end,start,end]);
 const selected=sources.slice(0,100),prepared:Array<{sale:FinanceSale;units:FinanceUnit[];revision:number}>=[];
 for(const source of selected){
  let snapshot:OrderValue=source,lines:Line[]=[],issue='',reviewIssue='';try{if(source.event_payload)snapshot=JSON.parse(source.event_payload) as OrderValue}catch{issue='Snapshot sumber perlu diperiksa.'}
  const sale:FinanceSale={id:randomUUID(),source:snapshot.catalog_checkout_id?'website':'manual_order',source_order_id:source.id,external_ref:null,month:input.month,sold_at:snapshot.confirmed_at??source.confirmed_at??start,gross_merchandise:null,net_merchandise:snapshot.item_amount,unit_count:Number.isSafeInteger(snapshot.quantity)?snapshot.quantity:0,needs_review:0,review_reason:'',stock_ref:null,created_at:Date.now(),created_by:actor.userId};
  if(!paid(source)){if(source.event_payload)reviewIssue='Sumber berubah setelah penjualan terkonfirmasi; tinjau refund/koreksi.';else issue='Status pembayaran/cancel/Reserve sumber perlu diperiksa.';}
  if(source.review_required)reviewIssue='Nilai atau status sumber berubah setelah konfirmasi.';
  if(snapshot.item_amount==null||!Number.isSafeInteger(snapshot.item_amount)||snapshot.item_amount<0)issue='Nilai merchandise lama belum diketahui; jangan memakai total termasuk ongkir.';
  if(!snapshot.catalog_checkout_id)issue='Pesanan manual perlu pemetaan SKU dan verifikasi pengurangan stok.';
  else if(source.stock_sync_state!=='applied')issue='Stok katalog belum tersinkron; selesaikan di pengelolaan pesanan.';
  try{lines=sourceLines(snapshot.lines_json??snapshot.catalog_items_json??source.checkout_lines_json);if(sum(lines.map(l=>l.quantity))!==sale.unit_count)issue='Jumlah unit berbeda dari snapshot order.'}catch{issue='Snapshot SKU tidak tersedia atau tidak valid.'}
  let units:FinanceUnit[]=[];
  if(!issue){try{units=unitRows(sale.id,lines,snapshot.item_amount!);sale.gross_merchandise=sum(units.map(u=>u.gross_revenue))}catch(e){issue=(e as Error).message}}
  if(issue||reviewIssue){sale.needs_review=1;sale.review_reason=issue||reviewIssue}
  prepared.push({sale,units,revision:source.finance_revision??0});
 }
 const pool=await costPool(tx,[...new Set(prepared.flatMap(p=>p.units.map(u=>u.group_id)))]),remaining=new Map<string,number>(),batch:InStatement[]=[];
 for(const p of prepared){assignCosts(p.units,pool,p.revision,remaining,p.sale.sold_at);batch.push(insertSale(p.sale),...p.units.map(insertUnit),{sql:'UPDATE finance_order_events SET imported_at=? WHERE order_id=?',args:[Date.now(),p.sale.source_order_id]});}
 await statements(tx,batch);return {result:{imported:prepared.length,needsReview:prepared.filter(p=>p.sale.needs_review).length,hasMore:sources.length>100},details:{month:input.month,orders:prepared.map(p=>p.sale.source_order_id)}};
}
async function mappedLines(tx:Transaction,lines:{productId:string;groupId:string;quantity:number;unitPrice:number}[]){
 const groupIds=[...new Set(lines.map(l=>l.groupId))];if(groupIds.length!==lines.length)throw new AppError(400,'Gabungkan SKU yang sama menjadi satu baris.');
 const groups=await rows<{id:string;product_id:string;name:string;label:string}>(tx,`SELECT g.id,g.product_id,g.label,p.name FROM size_groups g JOIN products p ON p.id=g.product_id WHERE g.id IN (${groupIds.map(()=>'?').join(',')})`,groupIds);
 return lines.map(l=>{const g=groups.find(g=>g.id===l.groupId&&g.product_id===l.productId);if(!g)throw new AppError(404,'SKU penjualan tidak ditemukan.');return {...l,name:g.name,label:g.label}});
}
async function stockReference(tx:Transaction,id:string,groupId:string,productId:string,quantity:number){
 const history=await one<{before_qty:number|null;after_qty:number|null;reason:string;undo_of:string|null;created_at:string}>(tx,'SELECT before_qty,after_qty,reason,undo_of,created_at FROM stock_history WHERE id=? AND group_id=? AND product_id=?',[id,groupId,productId]);
 if(!history||history.before_qty==null||history.after_qty==null||history.before_qty-history.after_qty!==quantity||history.undo_of||/^Pesanan |Reserve/i.test(history.reason))throw new AppError(409,'Pilih pengurangan stok manual untuk SKU dan jumlah yang sama, bukan riwayat stok order website/Reserve.');
 if(await one(tx,'SELECT id FROM stock_history WHERE undo_of=?',[id]))throw new AppError(409,'Riwayat pengurangan stok telah dibatalkan.');
 if(await one(tx,'SELECT sale_id AS id FROM finance_stock_claims WHERE history_id=?',[id]))throw new AppError(409,'Pengurangan stok ini sudah dicatat sebagai penjualan Finance.');
 return history;
}
export async function recordManualSale(tx:Transaction,input:Extract<FinanceAction,{op:'manualSale'}>,actor:Actor,revision:number){
 const month=dateMonth(input.soldOn);await openPeriod(tx,month);
 const existing=await one(tx,'SELECT id FROM finance_sales WHERE external_ref=?',[input.externalRef]);if(existing)throw new AppError(409,'Referensi penjualan sudah digunakan.');
 await stockReference(tx,input.stockHistoryId,input.groupId,input.productId,input.quantity);
 const lines=await mappedLines(tx,[{productId:input.productId,groupId:input.groupId,quantity:input.quantity,unitPrice:input.unitPrice}]),net=sum(lines.map(l=>l.unitPrice*l.quantity)),saleId=randomUUID(),units=unitRows(saleId,lines,net);
 assignCosts(units,await costPool(tx,[input.groupId]),input.soldOn===new Date(Date.now()+7*3600000).toISOString().slice(0,10)?revision:0,new Map(),Date.parse(input.soldOn+'T12:00:00+07:00'));
 const sale:FinanceSale={id:saleId,source:'instagram',source_order_id:null,external_ref:input.externalRef,month,sold_at:Date.parse(input.soldOn+'T12:00:00+07:00'),gross_merchandise:net,net_merchandise:net,unit_count:input.quantity,needs_review:0,review_reason:'',stock_ref:input.stockHistoryId,created_at:Date.now(),created_by:actor.userId};
 await statements(tx,[insertSale(sale),{sql:'INSERT INTO finance_stock_claims(history_id,sale_id,product_id,group_id,quantity) VALUES(?,?,?,?,?)',args:[input.stockHistoryId,saleId,input.productId,input.groupId,input.quantity]},...units.map(insertUnit)]);return {result:{saleId},details:{...input,stockNotChanged:true}};
}
export async function mapSale(tx:Transaction,input:Extract<FinanceAction,{op:'mapSale'}>,actor:Actor,revision:number){
 const sale=await one<FinanceSale>(tx,'SELECT * FROM finance_sales WHERE id=?',[input.saleId]);if(!sale)throw new AppError(404,'Penjualan tidak ditemukan.');await openPeriod(tx,sale.month);
 if(await one(tx,'SELECT id FROM finance_units WHERE sale_id=? LIMIT 1',[sale.id]))throw new AppError(409,'Unit penjualan sudah mempunyai snapshot. Gunakan koreksi, bukan ganti SKU.');
 const source=await one<Source>(tx,'SELECT id,confirmed_at,payment_state,status,order_type,reservation_status,stock_sync_state,catalog_checkout_id,item_amount,item_subtotal,discount_amount,quantity,catalog_items_json FROM orders WHERE id=?',[sale.source_order_id]);
 if(!source||!paid(source)||source.item_amount==null)throw new AppError(409,'Pemetaan memerlukan sumber yang sudah lunas dan tidak dibatalkan.');
 if(source.catalog_checkout_id&&source.stock_sync_state!=='applied')throw new AppError(409,'Stok order harus diselesaikan melalui alur existing. Finance tidak mengurangi stok.');
 // Manual order mapping does not assert a stock mutation. Owner reviews linkage explicitly.
 if(!source.catalog_checkout_id)primary(actor);
 const claims:InStatement[]=[];if(!source.catalog_checkout_id){for(const l of input.lines){if(!l.stockHistoryId)throw new AppError(400,'Pemetaan order manual memerlukan riwayat pengurangan stok existing per SKU.');await stockReference(tx,l.stockHistoryId,l.groupId,l.productId,l.quantity);claims.push({sql:'INSERT INTO finance_stock_claims(history_id,sale_id,product_id,group_id,quantity) VALUES(?,?,?,?,?)',args:[l.stockHistoryId,sale.id,l.productId,l.groupId,l.quantity]})}}
 const lines:Line[]=await mappedLines(tx,input.lines);if(source.catalog_checkout_id){const original=sourceLines(source.catalog_items_json);for(const line of lines)line.regularPrice=original.find(l=>l.groupId===line.groupId)?.regularPrice;}const units=unitRows(sale.id,lines,source.item_amount);
 if(units.length!==source.quantity||sum(lines.map(l=>l.unitPrice*l.quantity))!==(source.item_subtotal??source.item_amount+source.discount_amount))throw new AppError(409,'Jumlah unit/nilai sebelum voucher harus sama dengan sumber order.');
 if(source.catalog_checkout_id){const original=sourceLines(source.catalog_items_json);if(JSON.stringify(original.map(l=>[l.productId,l.groupId,l.quantity,l.unitPrice]))!==JSON.stringify(lines.map(l=>[l.productId,l.groupId,l.quantity,l.unitPrice])))throw new AppError(409,'SKU order website tidak boleh diganti lewat Finance.');}
 const event=await one<{finance_revision:number}>(tx,'SELECT finance_revision FROM finance_order_events WHERE order_id=?',[source.id]);
 assignCosts(units,await costPool(tx,[...new Set(units.map(u=>u.group_id))]),event?.finance_revision??0,new Map(),sale.sold_at);
 await statements(tx,[...claims,...units.map(insertUnit),{sql:'UPDATE finance_sales SET gross_merchandise=?,net_merchandise=?,unit_count=?,needs_review=0,review_reason=? WHERE id=?',args:[sum(units.map(u=>u.gross_revenue)),source.item_amount,units.length,source.catalog_checkout_id?'':'Pemetaan manual ditinjau pemilik; tidak ada perubahan stok oleh Finance.',sale.id]}]);
 return {result:{mapped:units.length},details:{...input,revision,stockNotChanged:true,manualInventoryReview:!source.catalog_checkout_id}};
}
export async function resolveSource(tx:Transaction,input:Extract<FinanceAction,{op:'resolveSource'}>,actor:Actor){
 primary(actor);const sale=await one<FinanceSale>(tx,'SELECT * FROM finance_sales WHERE id=?',[input.saleId]);if(!sale)throw new AppError(404,'Penjualan tidak ditemukan.');if(!input.adjustmentId)await openPeriod(tx,sale.month);
 if(!input.adjustmentId&&!input.acknowledgeNoAmountChange)throw new AppError(400,'Tautkan koreksi atau akui hasil peninjauan tanpa perubahan nominal.');
 if(input.adjustmentId){const adjustment=await one<{month:string}>(tx,'SELECT month FROM finance_adjustments WHERE id=? AND source_order_id IS ?',[input.adjustmentId,sale.source_order_id]);if(!adjustment)throw new AppError(409,'Koreksi tidak sesuai sumber penjualan.');await openPeriod(tx,adjustment.month);}
 if(!await one(tx,'SELECT id FROM finance_units WHERE sale_id=? LIMIT 1',[sale.id]))throw new AppError(409,'Pemetaan SKU perlu diselesaikan sebelum review ditutup.');
 await run(tx,'UPDATE finance_sales SET needs_review=0,review_reason=? WHERE id=?',[input.note,sale.id]);if(sale.source_order_id)await run(tx,'UPDATE finance_order_events SET review_required=0 WHERE order_id=?',[sale.source_order_id]);
 await run(tx,'UPDATE finance_stock_claims SET reviewed_undo_id=(SELECT h.id FROM stock_history h WHERE h.undo_of=finance_stock_claims.history_id ORDER BY h.created_at DESC,h.id DESC LIMIT 1) WHERE sale_id=?',[sale.id]);
 return {result:{reviewed:sale.id},details:input};
}
