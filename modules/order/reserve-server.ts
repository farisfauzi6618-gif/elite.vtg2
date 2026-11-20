import {purchaseRewardInTransaction,savePurchaseRewardClaim,releasePurchaseRewardClaim} from './first-purchase-server';
import {rewardChoice} from './rewards';
import {protectionGoodsValue} from './shipping-protection-types';
import {protectionConfig,protectionFields,protectedOrderTotal} from './shipping-protection';
import {activeColorSql,colorPriceSql} from '@/modules/catalog/color-variants';
import type {Transaction,InValue} from '@libsql/client';
import {db,AppError,hash,random,myOrder,publicOrder,json} from './order-server';
import type {Order} from './order-types';
import type {CatalogQuote} from './catalog-bridge';
import {shippingPayable,shippingCollect,type ShippingQuote} from './shipping-types';
import {orderQuote,rupiah} from './order-types';
import {currentCustomer} from '@/modules/catalog/customers';
import {reservedQuantitySql,timelyReserveProofSql} from '@/modules/catalog/reserve-inventory';
import {minimumReserveDeposit,validReserveDeposit,RESERVE_DAY_MS,RESERVE_DAYS,RESERVE_POLICY_VERSION,RESERVE_TERMS,reserveExtensionDeadline,reserveTopUp,type ReserveSummary,type ReserveStatus,type ReserveExtensionState} from './reserve-types';

type ReserveRow=Order&{order_type:string;reservation_status:ReserveStatus;reservation_started_at:number|null;reservation_deadline:number|null;deposit_minimum:number;deposit_amount:number};
type PaymentRow={id:string;order_id:string;amount:number;payment_method:'bca_transfer'|'qris_dana';state:ReserveSummary['payments'][number]['state'];source:string;note:string|null;created_at:number;submitted_at:number|null;confirmed_at:number|null;proof_key:string|null};
const legacyReserveDays=2;
const activeReserve=(status:string)=>status==='RESERVED'||status==='PARTIALLY_PAID';
const legacyPolicy='Kedaluwarsa atau pembatalan melepas penguncian barang. Penanganan deposit ditinjau pemilik.';
const terminal=(s:string)=>['PAID','EXPIRED','CANCELLED'].includes(s);
async function atomic<T>(work:(tx:Transaction)=>Promise<T>){const tx=await db().client.transaction('write');try{const result=await work(tx);await tx.commit();return result}catch(e){await tx.rollback();throw e}finally{tx.close()}}
const execute=(tx:Transaction,sql:string,args:InValue[]=[])=>tx.execute({sql,args});
async function audit(tx:Transaction,orderId:string,action:string,actor:string,extra:{previous?:number|null;deadline?:number|null;paymentId?:string|null;amount?:number|null;note?:string|null}={}){await execute(tx,'INSERT INTO reserve_audit(id,order_id,action,actor,created_at,previous_deadline,new_deadline,payment_id,amount,note) VALUES(?,?,?,?,?,?,?,?,?,?)',[crypto.randomUUID(),orderId,action,actor,Date.now(),extra.previous??null,extra.deadline??null,extra.paymentId??null,extra.amount??null,extra.note??null])}
async function touchProducts(tx:Transaction,id:string){await execute(tx,"UPDATE products SET version=version+1,updated_at=?,last_mutation=? WHERE id IN (SELECT product_id FROM reserve_items WHERE order_id=?)",[new Date().toISOString(),crypto.randomUUID(),id]);await execute(tx,'UPDATE size_groups SET revision=revision+1 WHERE id IN (SELECT group_id FROM reserve_items WHERE order_id=?)',[id]);}
async function reserveEvent(tx:Transaction,o:ReserveRow,name:string,payment?:PaymentRow){
 try{
 const metadata=JSON.stringify({reserve_id:o.id,item_count:o.quantity??1,order_value:o.item_amount,deposit_value:payment?.amount??o.deposit_amount});
 // Only business values, never recipient details. Existing attribution is reused.
 await execute(tx,"INSERT OR IGNORE INTO analytics_events(id,dedupe_key,event_name,timestamp,session_id,visitor_id,user_id,order_id,traffic_source,checkout_id) SELECT ?,?,?,?,s.id,s.visitor_id,NULL,?,COALESCE(s.traffic_source,'Other'),? FROM (SELECT 1) LEFT JOIN analytics_order_context c ON c.order_id=? LEFT JOIN analytics_sessions s ON s.id=c.session_id",['reserve:'+name+':'+(payment?.id??o.id),'reserve:'+name+':'+(payment?.id??o.id),name,Date.now(),o.id,o.catalog_checkout_id??null,o.id]);
 await execute(tx,'INSERT OR IGNORE INTO reserve_event_values(event_id,values_json) VALUES(?,?)',['reserve:'+name+':'+(payment?.id??o.id),metadata]);
 }catch{console.warn('Reserve analytics observer unavailable');}
}
async function confirmedTotal(tx:Transaction,orderId:string){
 const result=await execute(tx,"SELECT COALESCE(SUM(amount),0) AS paid FROM reserve_payments WHERE order_id=? AND state='confirmed'",[orderId]);
 return Number(result.rows[0].paid);
}

type PolicyAudit={action:string;amount:number|null};
const policyActions="'extension_requested','extended','extension_rejected','expired'";
async function extensionAudit(tx:Transaction,orderId:string){
 return (await execute(tx,`SELECT action FROM reserve_audit WHERE order_id=? AND action IN (${policyActions})`,[orderId])).rows;
}

export async function reserveSummary(o:Order):Promise<ReserveSummary|null>{
 if(o.order_type!=='reserve')return null;
 const row=o as ReserveRow;
 const version=row.reserve_policy_version===RESERVE_POLICY_VERSION?2:1;
 const d=db();
 const [rows,terms,history]=await Promise.all([
  d.prepare('SELECT * FROM reserve_payments WHERE order_id=? ORDER BY created_at,id').bind(o.id).all<PaymentRow>(),
  version===1?d.prepare('SELECT policy_text FROM reserve_config WHERE id=1').first<{policy_text:string}>():null,
  version===2?d.prepare(`SELECT action,amount FROM reserve_audit WHERE order_id=? AND action IN (${policyActions})`).bind(o.id).all<PolicyAudit>():null
 ]);
 const confirmed=rows.results.filter(p=>p.state==='confirmed').sort((a,b)=>(a.confirmed_at??0)-(b.confirmed_at??0));
 const paid=confirmed.reduce((sum,p)=>sum+Number(p.amount),0);
 const due=activeReserve(row.reservation_status)&&row.reservation_deadline!=null&&row.reservation_deadline<=Date.now();
 const reviewAfterDeadline=due&&rows.results.some(p=>p.state==='submitted'&&p.submitted_at!=null&&p.submitted_at<=row.reservation_deadline!&&(!!p.proof_key||p.source==='owner'));
 const status=due&&!reviewAfterDeadline&&paid<o.total?'EXPIRED':row.reservation_status;
 const actions=history?.results??[];
 const extensionState:ReserveExtensionState=actions.some(a=>a.action==='extended')?'approved':
  actions.some(a=>a.action==='extension_rejected')?'rejected':
  !activeReserve(status)||due?'closed':actions.some(a=>a.action==='extension_requested')?'requested':'available';
 const value=o.item_amount??o.total;
 const quote=orderQuote(o);
 return {
  id:o.id,status,itemCount:o.quantity??1,orderValue:value,total:o.total,shippingAmount:o.shipping_amount??0,
  shippingPayment:shippingCollect(quote)?'collect':'prepaid',shippingEstimate:quote?.amount??o.shipping_amount??0,
  depositMinimum:row.deposit_minimum,depositPaid:confirmed[0]?.amount??0,totalPaid:paid,remaining:Math.max(0,o.total-paid),
  startedAt:row.reservation_started_at,deadline:row.reservation_deadline,policyVersion:version,
  reviewAfterDeadline,forfeitedAmount:Number(actions.find(a=>a.action==='expired')?.amount??0),
  extension:version===2&&row.reservation_started_at!=null&&row.reservation_deadline!=null?{
   state:extensionState,requiredTopUp:reserveTopUp(value,paid),latestDeadline:reserveExtensionDeadline(row.reservation_started_at,row.reservation_deadline)
  }:null,
  payments:rows.results.map(p=>({id:p.id,amount:p.amount,paymentMethod:p.payment_method,state:p.state,createdAt:p.created_at,submittedAt:p.submitted_at,confirmedAt:p.confirmed_at,hasProof:!!p.proof_key,source:p.source,note:p.source==='owner'?p.note:null})),
  policy:version===2?RESERVE_TERMS:terms?.policy_text||legacyPolicy
 };
}
export async function publicReserveOrder(o:Order){return {...publicOrder(o),reservation:await reserveSummary(o)}}
export async function createReserveOrder(r:Request,v:{name:string;phone:string;address:string;postcode:string;item:string;quantity:number;items:string[];itemAmount:number},linked:CatalogQuote,quote:ShippingQuote,amount:unknown,paymentMethod:string,catalogToken:string,selectedReward:unknown='none',expectedDiscount?:unknown,expectedVoucher?:unknown){
 let choice:string;
 try{choice=rewardChoice(selectedReward)}catch{throw new AppError(400,'Pilihan reward tidak valid.');}
 if((expectedDiscount!==undefined&&(typeof expectedDiscount!=='number'||!Number.isSafeInteger(expectedDiscount)||expectedDiscount<0))||
  (expectedVoucher!=null&&(typeof expectedVoucher!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(expectedVoucher)))){
  throw new AppError(400,'Ringkasan diskon belum valid. Muat ulang checkout.');
 }
 const customer=await currentCustomer(r.headers.get('cookie'));let existing:Order|null=null;try{existing=await myOrder(r)}catch(e){if(!(e instanceof AppError)||e.status!==404)throw e}
 if(existing&&(existing.order_type!=='reserve'||existing.reservation_status!=='AWAITING_DEPOSIT'||existing.proof_key||existing.catalog_checkout_id!==linked.id))throw new AppError(409,'Selesaikan atau tutup invoice sebelumnya terlebih dahulu. Reserve dan pesanan biasa memakai invoice terpisah.');
 if(existing?.discount_amount&&existing.customer_id!==customer?.id)throw new AppError(409,'Masuk kembali ke akun yang digunakan untuk invoice diskon ini.');
 const now=Date.now(),token=random(),id=existing?.id||'EV-'+new Date(now).toISOString().slice(2,10).replaceAll('-','')+'-'+crypto.randomUUID().slice(0,8).toUpperCase();
 const sessionHash=existing?.session_hash||await hash(token),shippingAmount=shippingPayable(quote),protectionPolicy=await protectionConfig();
 await atomic(async tx=>{
 for(const line of linked.lines){const row=(await execute(tx,`SELECT p.status,${colorPriceSql('g','p')} AS price,g.qty-${reservedQuantitySql('g')} AS qty FROM products p JOIN size_groups g ON g.product_id=p.id WHERE p.id=? AND g.id=? AND ${activeColorSql('g','p')}`,[line.productId,line.groupId])).rows[0];if(!row||row.status!=='published'||Number(row.price)!==line.unitPrice||Number(row.qty)<line.quantity)throw new AppError(409,'Stok atau harga berubah. Pilih kembali di katalog.');}
  const used=(await execute(tx,'SELECT id FROM orders WHERE catalog_checkout_id=? AND id!=?',[linked.id,id])).rows[0];if(used)throw new AppError(409,'Pilihan barang sudah digunakan invoice lain. Pilih kembali di katalog.');
  const priced=existing?null:await purchaseRewardInTransaction(tx,customer,id,linked.amount,linked.lines,choice,false);
  const gross=existing?.item_subtotal??priced?.subtotal??linked.amount;
  const net=existing?.item_amount??priced?.net??linked.amount;
  const discount=existing?.discount_amount??priced?.discount??0;
  const voucherId=existing?.discount_voucher_id??priced?.selected?.id??null;
  if((expectedDiscount!==undefined&&discount!==expectedDiscount)||(expectedVoucher!==undefined&&voucherId!==expectedVoucher))throw new AppError(409,'Diskon berubah. Periksa ulang voucher dan nominal DP.');
  if(net<50000)throw new AppError(400,'Harga setelah voucher kurang dari Rp50.000. Lanjutkan dengan pembayaran penuh untuk memakai voucher.');
  if(typeof amount!=='number'||!validReserveDeposit(net,amount)){
   throw new AppError(400,`DP minimum ${rupiah(minimumReserveDeposit(net))} dan paling tinggi ${rupiah(net)} berdasarkan harga setelah diskon.`);
  }
  const protection=protectionFields(quote,protectionGoodsValue(gross,net,quote.protection?.valueBasis),protectionPolicy,existing);
  const total=protectedOrderTotal(net,shippingAmount,protection.shipping_protection_fee);
  if(existing){
   const changed=await execute(tx,`UPDATE orders SET name=?,phone=?,address=?,postcode=?,shipping_amount=?,shipping_json=?,total=?,deposit_amount=?,
    shipping_protection_fee=?,declared_shipping_value=?,shipping_protection_source=?
    WHERE id=? AND reservation_status='AWAITING_DEPOSIT' AND status='awaiting_proof' AND proof_key IS NULL`,
    [v.name,v.phone,v.address,v.postcode,shippingAmount,JSON.stringify(quote),total,amount,protection.shipping_protection_fee,protection.declared_shipping_value,protection.shipping_protection_source,id]);
   if(!changed.rowsAffected)throw new AppError(409,'Invoice berubah. Muat ulang halaman.');
   await execute(tx,"UPDATE reserve_payments SET amount=? WHERE order_id=? AND state='awaiting_proof'",[amount,id]);
  }else{
   await execute(tx,`INSERT INTO orders(id,session_hash,created_at,name,phone,address,postcode,item,quantity,items_json,total,item_amount,
    shipping_amount,shipping_json,catalog_checkout_id,catalog_token,catalog_items_json,stock_sync_state,payment_method,customer_id,
    item_subtotal,discount_amount,discount_voucher_id,discount_label,order_type,reservation_status,deposit_minimum,deposit_amount,
    shipping_protection_fee,declared_shipping_value,shipping_protection_source,reserve_policy_version)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?,?,?,?,?,?,'reserve','AWAITING_DEPOSIT',?,?,?,?,?,?)`,
    [id,sessionHash,now,v.name,v.phone,v.address,v.postcode,v.item,v.quantity,JSON.stringify(v.items),total,net,
     shippingAmount,JSON.stringify(quote),linked.id,catalogToken,JSON.stringify(linked.lines),paymentMethod,customer?.id??null,
     gross,discount,voucherId,priced?.selected?.label??null,minimumReserveDeposit(net),amount,
     protection.shipping_protection_fee,protection.declared_shipping_value,protection.shipping_protection_source,RESERVE_POLICY_VERSION]);
   if(discount)await savePurchaseRewardClaim(tx,id,customer?.id??null,voucherId);
   await execute(tx,'INSERT INTO reserve_payments(id,order_id,amount,payment_method,created_at) VALUES(?,?,?,?,?)',[crypto.randomUUID(),id,amount,paymentMethod,now]);
   await audit(tx,id,'created',customer?.id??'guest');
  }
 });
 const o=await db().prepare('SELECT * FROM orders WHERE id=?').bind(id).first<Order>();if(!o)throw new AppError(503,'Invoice belum dapat dibuka.');
 const {observe,attachOrder}=await import('@/modules/analytics/server');await observe(()=>attachOrder(r,id));await observe(()=>atomic(tx=>reserveEvent(tx,o as ReserveRow,'reserve_started')));
 return json(await publicReserveOrder(o),existing?200:201,existing?{}:{'Set-Cookie':`elite_order=${token}; Path=/; HttpOnly; ${new URL(r.url).protocol==='https:'?'Secure; ':''}SameSite=Strict; Max-Age=2592000`});
}
export async function confirmReservePayment(paymentId:string,actor:string){
 const id=await atomic(async tx=>{
  const p=(await execute(tx,'SELECT * FROM reserve_payments WHERE id=?',[paymentId])).rows[0] as unknown as PaymentRow|undefined;if(!p)throw new AppError(404,'Pembayaran Reserve tidak ditemukan.');
  const o=(await execute(tx,"SELECT * FROM orders WHERE id=? AND order_type='reserve'",[p.order_id])).rows[0] as unknown as ReserveRow|undefined;if(!o)throw new AppError(404,'Reserve tidak ditemukan.');if(p.state==='confirmed')return o.id;
  if(p.state!=='submitted'||(!p.proof_key&&p.source!=='owner')||terminal(o.reservation_status))throw new AppError(409,'Pembayaran belum dapat dikonfirmasi. Periksa status Reserve dan bukti pembayaran.');
  const now=Date.now(),paid=await confirmedTotal(tx,o.id);
  if(p.amount>o.total-paid)throw new AppError(409,'Pembayaran melebihi sisa tagihan.');
  if(o.reservation_status==='AWAITING_DEPOSIT'){
   if(!validReserveDeposit(o.item_amount!,p.amount)||!p.proof_key)throw new AppError(409,'Bukti dan minimum deposit belum terpenuhi.');
   const lines=JSON.parse(o.catalog_items_json!) as CatalogQuote['lines'];
   const inventory=await tx.batch(lines.map(line=>({sql:`SELECT g.qty-${reservedQuantitySql('g')} AS available,p.status,p.orderable_at FROM size_groups g JOIN products p ON p.id=g.product_id WHERE g.id=? AND g.product_id=? AND ${activeColorSql('g','p')}`,args:[line.groupId,line.productId]})));
   for(const [index,line] of lines.entries()){const g=inventory[index].rows[0];if(!g||g.status!=='published'||Number(g.available)<line.quantity||g.orderable_at&&Date.parse(String(g.orderable_at))>now)throw new AppError(409,'Sebagian barang sudah tidak tersedia. Tidak ada barang yang dikunci; periksa transfer dan pilihan pesanan.');}
   await execute(tx,"UPDATE orders SET reservation_status='RESERVED',reservation_started_at=?,reservation_deadline=?,deposit_amount=?,payment_method=? WHERE id=?",[now,now+(o.reserve_policy_version===RESERVE_POLICY_VERSION?RESERVE_DAYS*RESERVE_DAY_MS:legacyReserveDays*RESERVE_DAY_MS),p.amount,p.payment_method,o.id]);
   await tx.batch(lines.map(line=>({sql:'INSERT INTO reserve_items(order_id,group_id,product_id,quantity) VALUES(?,?,?,?)',args:[o.id,line.groupId,line.productId,line.quantity]})));
   o.deposit_amount=p.amount;await touchProducts(tx,o.id);await reserveEvent(tx,o,'reserve_confirmed',p);
  }else if(!o.reservation_deadline||(o.reservation_deadline<=now&&!(p.submitted_at!=null&&p.submitted_at<=o.reservation_deadline))){
   throw new AppError(409,'Bukti pembayaran tidak tercatat sebelum batas Reserve. Dana dan bukti tetap tersimpan untuk ditinjau pemilik.');
  }
  await execute(tx,"UPDATE reserve_payments SET state='confirmed',confirmed_at=?,confirmed_by=? WHERE id=? AND state='submitted'",[now,actor,p.id]);await audit(tx,o.id,'payment_confirmed',actor,{paymentId:p.id,amount:p.amount});
  if(paid+p.amount===o.total){
   const lines=(await execute(tx,"SELECT * FROM reserve_items WHERE order_id=? AND state='active'",[o.id])).rows;
   if(!lines.length)throw new AppError(409,'Penguncian barang tidak ditemukan.');
   await execute(tx,"UPDATE reserve_items SET state='sold' WHERE order_id=? AND state='active'",[o.id]);
   for(const line of lines){const result=await execute(tx,'INSERT INTO stock_history(id,group_id,product_id,before_qty,after_qty,before_revision,after_revision,reason,actor,created_at) SELECT ?,id,product_id,qty,qty-?,revision,revision+1,?,?,? FROM size_groups WHERE id=? AND product_id=? AND qty>=?',[crypto.randomUUID(),Number(line.quantity),'Reserve lunas '+o.id,actor,new Date(now).toISOString(),String(line.group_id),String(line.product_id),Number(line.quantity)]);if(!result.rowsAffected)throw new AppError(409,'Stok Reserve perlu diperiksa pemilik.');await execute(tx,'UPDATE size_groups SET qty=qty-?,revision=revision+1 WHERE id=?',[Number(line.quantity),String(line.group_id)]);}
   await execute(tx,'INSERT INTO catalog_sales(order_id,checkout_id,marker,created_at) VALUES(?,?,?,?)',[o.id,o.catalog_checkout_id!,crypto.randomUUID(),new Date(now).toISOString()]);
   await execute(tx,"UPDATE orders SET reservation_status='PAID',payment_state='payment_confirmed',confirmed_at=?,confirmed_by=?,stock_sync_state='applied',stock_sync_error=NULL,post_purchase_revision=post_purchase_revision+1 WHERE id=?",[now,actor,o.id]);
   if(o.discount_amount)await execute(tx,'UPDATE first_purchase_discounts SET redeemed_at=COALESCE(redeemed_at,?) WHERE order_id=?',[now,o.id]);
   await execute(tx,"INSERT INTO shipments(order_id,updated_at) VALUES(?,?) ON CONFLICT(order_id) DO UPDATE SET state='payment_confirmed',updated_at=excluded.updated_at WHERE shipments.state='awaiting_confirmation'",[o.id,now]);await touchProducts(tx,o.id);await reserveEvent(tx,o,'reserve_completed');
  }else {
   await execute(tx,"UPDATE orders SET reservation_status=? WHERE id=?",[paid>0?'PARTIALLY_PAID':'RESERVED',o.id]);
   if(o.reservation_deadline!=null&&o.reservation_deadline<=now)await expireReserve(tx,o,paid+p.amount);
  }
  return o.id;
 });return publicReserveOrder((await db().prepare('SELECT * FROM orders WHERE id=?').bind(id).first<Order>())!);
}
async function expireReserve(tx:Transaction,o:ReserveRow,paid:number){
 const forfeited=o.reserve_policy_version===RESERVE_POLICY_VERSION?paid:null;
 await execute(tx,"UPDATE orders SET reservation_status='EXPIRED' WHERE id=?",[o.id]);
 if(o.discount_amount)await releasePurchaseRewardClaim(tx,o.id);
 await execute(tx,"UPDATE reserve_items SET state='released' WHERE order_id=? AND state='active'",[o.id]);
 await touchProducts(tx,o.id);
 await audit(tx,o.id,'expired','system',{
  previous:o.reservation_deadline,amount:forfeited,
  note:forfeited==null?null:'Pelunasan belum lengkap saat batas Reserve berakhir. DP terverifikasi hangus.'
 });
 await reserveEvent(tx,o,'reserve_expired');
}

export async function expireReservations(now=Date.now()){
 const dueSql=`o.order_type='reserve' AND o.reservation_status IN ('RESERVED','PARTIALLY_PAID')
  AND o.reservation_deadline<=? AND NOT ${timelyReserveProofSql('o')}`;
 const due=await db().prepare(`SELECT o.id FROM orders o WHERE ${dueSql} ORDER BY o.reservation_deadline LIMIT 100`).bind(now).all<{id:string}>();
 let count=0;
 for(const {id} of due.results){
  const changed=await atomic(async tx=>{
   const o=(await execute(tx,`SELECT o.* FROM orders o WHERE o.id=? AND ${dueSql}`,[id,now])).rows[0] as unknown as ReserveRow|undefined;
   if(!o)return false;
   const paid=await confirmedTotal(tx,id);
   if(paid>=o.total)return false;
   await expireReserve(tx,o,paid);
   return true;
  });
  if(changed)count++;
 }
 return count;
}

async function activeExtensionOrder(tx:Transaction,id:string){
 const o=(await execute(tx,"SELECT * FROM orders WHERE id=? AND order_type='reserve'",[id])).rows[0] as unknown as ReserveRow|undefined;
 if(!o||!activeReserve(o.reservation_status)||o.reservation_started_at==null||o.reservation_deadline==null||o.reservation_deadline<=Date.now()){
  throw new AppError(409,'Perpanjangan hanya tersedia sebelum batas Reserve aktif.');
 }
 return {...o,reservation_started_at:o.reservation_started_at,reservation_deadline:o.reservation_deadline};
}

export async function requestReserveExtension(id:string){
 await atomic(async tx=>{
  const o=await activeExtensionOrder(tx,id);
  if(o.reserve_policy_version!==RESERVE_POLICY_VERSION)throw new AppError(409,'Reserve ini mengikuti ketentuan sebelumnya.');
  if((await extensionAudit(tx,id)).length)throw new AppError(409,'Permintaan perpanjangan hanya dapat diajukan satu kali.');
  await audit(tx,id,'extension_requested',o.customer_id??'guest',{previous:o.reservation_deadline});
 });
}

export async function extendReserve(id:string,deadline:number,actor:string){
 await atomic(async tx=>{
  const o=await activeExtensionOrder(tx,id);
  const currentPolicy=o.reserve_policy_version===RESERVE_POLICY_VERSION;
  const latest=currentPolicy?reserveExtensionDeadline(o.reservation_started_at,o.reservation_deadline):o.reservation_started_at+7*RESERVE_DAY_MS;
  if(currentPolicy){
   const history=await extensionAudit(tx,id);
   if(!history.some(a=>a.action==='extension_requested')||history.some(a=>a.action==='extended'||a.action==='extension_rejected')){
    throw new AppError(409,'Tidak ada permintaan perpanjangan yang dapat disetujui.');
   }
   if(reserveTopUp(o.item_amount??o.total,await confirmedTotal(tx,id))>0){
    throw new AppError(409,'Total DP terverifikasi harus mencapai 50% nilai barang.');
   }
  }
  if(!Number.isSafeInteger(deadline)||deadline<=o.reservation_deadline||deadline>latest){
   throw new AppError(400,currentPolicy?'Batas baru harus setelah batas saat ini, maksimal 7 hari tambahan dan 14 hari sejak DP awal.':'Batas baru harus setelah batas saat ini, maksimal 7 hari sejak DP awal.');
  }
  await execute(tx,'UPDATE orders SET reservation_deadline=? WHERE id=?',[deadline,id]);
  await audit(tx,id,'extended',actor,{previous:o.reservation_deadline,deadline});
  await touchProducts(tx,id);
 });
}

export async function rejectReserveExtension(id:string,actor:string){
 await atomic(async tx=>{
  const o=await activeExtensionOrder(tx,id);
  const history=await extensionAudit(tx,id);
  if(o.reserve_policy_version!==RESERVE_POLICY_VERSION||!history.some(a=>a.action==='extension_requested')||history.some(a=>a.action==='extended'||a.action==='extension_rejected')){
   throw new AppError(409,'Tidak ada permintaan perpanjangan yang dapat ditolak.');
  }
  await audit(tx,id,'extension_rejected',actor,{previous:o.reservation_deadline});
 });
}
export async function cancelReserve(id:string,actor:string){
 await atomic(async tx=>{
  const o=(await execute(tx,"SELECT * FROM orders WHERE id=? AND order_type='reserve'",[id])).rows[0] as unknown as ReserveRow|undefined;
  if(!o||o.reservation_status==='PAID')throw new AppError(409,'Reserve lunas tidak dapat dibatalkan melalui tindakan ini.');
  if(terminal(o.reservation_status))return;
  if(activeReserve(o.reservation_status)&&o.reservation_deadline!=null&&o.reservation_deadline<=Date.now()){
   const review=(await execute(tx,`SELECT 1 FROM orders o WHERE o.id=? AND ${timelyReserveProofSql('o')}`,[id])).rows.length>0;
   if(review)throw new AppError(409,'Periksa bukti sebelum melepas stok Reserve.');
   await expireReserve(tx,o,await confirmedTotal(tx,id));
   return;
  }
  await execute(tx,"UPDATE orders SET reservation_status='CANCELLED' WHERE id=?",[id]);
  if(o.discount_amount)await releasePurchaseRewardClaim(tx,id);
  await execute(tx,"UPDATE reserve_items SET state='released' WHERE order_id=? AND state='active'",[id]);
  await touchProducts(tx,id);
  await audit(tx,id,'cancelled',actor);
 });
}
export async function newReservePayment(o:Order,amount:number,method:string,source='customer',note:string|null=null,requestId?:string){await expireReservations();return atomic(async tx=>{const row=(await execute(tx,'SELECT * FROM orders WHERE id=?',[o.id])).rows[0] as unknown as ReserveRow|undefined;if(requestId){if(!/^[a-f0-9-]{36}$/.test(requestId))throw new AppError(400,'Identitas pembayaran tidak valid.');const prior=(await execute(tx,'SELECT * FROM reserve_payments WHERE id=?',[requestId])).rows[0];if(prior){if(prior.order_id!==o.id||prior.amount!==amount||prior.payment_method!==method||prior.source!==source)throw new AppError(409,'Identitas pembayaran sudah digunakan.');return requestId}}if(!['bca_transfer','qris_dana'].includes(method)||!['customer','owner'].includes(source))throw new AppError(400,'Metode pembayaran tidak valid.');const now=Date.now();if(!row||row.order_type!=='reserve'||!(activeReserve(row.reservation_status)&&row.reservation_deadline!=null&&row.reservation_deadline>now||row.reservation_status==='AWAITING_DEPOSIT'))throw new AppError(409,'Reserve sudah tidak aktif.');const paid=Number((await execute(tx,"SELECT COALESCE(SUM(amount),0) AS paid FROM reserve_payments WHERE order_id=? AND state='confirmed'",[o.id])).rows[0].paid);if(!Number.isSafeInteger(amount)||amount<1||amount>row.total-paid)throw new AppError(400,'Nominal pembayaran harus lebih dari nol dan tidak melebihi sisa tagihan.');if((await execute(tx,"SELECT id FROM reserve_payments WHERE order_id=? AND state IN ('awaiting_proof','submitted')",[o.id])).rows.length)throw new AppError(409,'Selesaikan pembayaran yang masih menunggu bukti atau verifikasi terlebih dahulu.');if(row.reservation_status==='AWAITING_DEPOSIT'&&(!validReserveDeposit(row.item_amount!,amount)||source==='owner'))throw new AppError(400,'Deposit awal membutuhkan bukti customer dan minimum deposit.');const id=requestId||crypto.randomUUID();await execute(tx,'INSERT INTO reserve_payments(id,order_id,amount,payment_method,state,created_at,submitted_at,source,note) VALUES(?,?,?,?,?,?,?,?,?)',[id,o.id,amount,method,source==='owner'?'submitted':'awaiting_proof',now,source==='owner'?now:null,source,note]);return id;});}
export async function reservationAccess(r:Request){
 let o:Order|null=null;
 if(r.headers.has('authorization'))o=await (await import('./customer-tracking')).trackingOrder(r);
 else {const invoice=new URL(r.url).searchParams.get('invoice');if(!invoice)o=await myOrder(r);else {const c=await currentCustomer(r.headers.get('cookie'));if(c)o=await db().prepare("SELECT * FROM orders WHERE id=? AND customer_id=? AND order_type='reserve'").bind(invoice,c.id).first<Order>();if(!o)o=await (await import('./customer-tracking')).trackingOrder(r);}}
 if(!o||o.order_type!=='reserve')throw new AppError(404,'Reserve tidak ditemukan.');return o;
}
export async function rejectReservePayment(id:string,actor:string,expectedState?:'awaiting_proof'){
 await atomic(async tx=>{
  const p=(await execute(tx,'SELECT * FROM reserve_payments WHERE id=?',[id])).rows[0] as unknown as PaymentRow|undefined;
  if(!p||!['submitted','awaiting_proof'].includes(p.state)||(expectedState&&p.state!==expectedState))throw new AppError(409,'Pembayaran tidak dapat ditolak.');
  await execute(tx,"UPDATE reserve_payments SET state='rejected' WHERE id=?",[id]);
  await audit(tx,p.order_id,'payment_rejected',actor,{paymentId:id,amount:p.amount});
  const now=Date.now();
  const o=(await execute(tx,"SELECT * FROM orders WHERE id=? AND reservation_status IN ('RESERVED','PARTIALLY_PAID') AND reservation_deadline<=?",[p.order_id,now])).rows[0] as unknown as ReserveRow|undefined;
  if(o)await expireReserve(tx,o,await confirmedTotal(tx,o.id));
 });
}
let nextSweep=0,sweep:Promise<number>|null=null;
export function sweepReserveExpiry(){if(sweep)return sweep;if(Date.now()<nextSweep)return Promise.resolve(0);nextSweep=Date.now()+30000;sweep=expireReservations().finally(()=>{sweep=null});return sweep;}
export async function observeReserveSubmission(o:Order,paymentId:string){const p=await db().prepare('SELECT * FROM reserve_payments WHERE id=?').bind(paymentId).first<PaymentRow>();if(p)await atomic(tx=>reserveEvent(tx,o as ReserveRow,o.reservation_status==='AWAITING_DEPOSIT'?'reserve_deposit_submitted':'reserve_payment_submitted',p));}

// One cohort of confirmed holds. Pending first deposits are excluded.
export async function reserveMetrics(now=Date.now()){
 const from=now-30*RESERVE_DAY_MS;
 const totals=await db().prepare(`
  WITH cohort AS (
   SELECT id,reservation_started_at AS started,reservation_status AS status,reservation_deadline AS deadline,confirmed_at
   FROM orders WHERE order_type='reserve' AND reservation_started_at>=? AND reservation_started_at<?
  ), history AS (
   SELECT a.order_id,
    MAX(a.action='extension_requested') AS requested,
    MAX(a.action='extended') AS extended,
    MAX(CASE WHEN a.action='cancelled' THEN a.created_at
     WHEN a.action='expired' THEN COALESCE(a.previous_deadline,c.deadline,a.created_at) END) AS ended,
    MAX(CASE WHEN a.action IN ('payment_confirmed','payment_rejected')
      AND a.created_at>c.deadline AND p.submitted_at<=c.deadline
      AND (p.proof_key IS NOT NULL OR p.source='owner') THEN a.created_at END) AS reviewed,
    SUM(CASE WHEN a.action='expired' THEN COALESCE(a.amount,0) ELSE 0 END) AS forfeited
   FROM cohort c JOIN reserve_audit a ON a.order_id=c.id
   LEFT JOIN reserve_payments p ON p.id=a.payment_id GROUP BY a.order_id
  )
  SELECT COUNT(*) AS started,
   COALESCE(SUM(c.status='PAID'),0) AS completed,
   COALESCE(SUM(c.status='EXPIRED'),0) AS expired,
   COALESCE(SUM(h.requested),0) AS requested,
   COALESCE(SUM(CASE WHEN h.requested=1 THEN h.extended ELSE 0 END),0) AS approved,
   COALESCE(SUM(c.status='PAID' AND h.requested=1 AND h.extended=1),0) AS extendedCompleted,
   AVG(CASE WHEN c.status='PAID' THEN c.confirmed_at-c.started
    WHEN c.status IN ('EXPIRED','CANCELLED') THEN MAX(h.ended,COALESCE(h.reviewed,h.ended))-c.started END) AS averageClosedHoldMs,
   COALESCE(SUM(h.forfeited),0) AS forfeited
  FROM cohort c LEFT JOIN history h ON h.order_id=c.id
 `).bind(from,now).first<{
  started:number;completed:number;expired:number;requested:number;approved:number;
  extendedCompleted:number;averageClosedHoldMs:number|null;forfeited:number
 }>();
 return {from,to:now,...totals!};
}
