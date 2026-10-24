import {db,AppError,readProduct} from '@/modules/catalog/server';
import {getLead,getRequest,outreachRow} from './leads';
import {salesConfig} from './inventory';
import {matchingProducts,contactBlock,outreachDraft} from './matching';
import {outreachSchema,validated} from './validation';
import {ACTIVE_STATUSES,type Outreach} from './types';

export async function prepareDraft(requestId:string,productId?:string|null,groupId?:string|null){
 const request=await getRequest(requestId),[lead,config]=await Promise.all([getLead(request.leadId),salesConfig()]);
 const blocked=contactBlock(lead,config.cooldown_days);if(blocked)throw new AppError(409,blocked);
 if(!ACTIVE_STATUSES.includes(request.status))throw new AppError(409,'Permintaan ini sudah ditutup atau tidak boleh dihubungi.');
 if(!productId&&!groupId)return {draft:`Halo kak, ini ELITE.VTG. ${request.wanted?'Untuk pilihan '+request.wanted+', ':''}boleh konfirmasi ukuran, warna, dan budget yang sedang dicari? Kami bantu cek koleksi yang tersedia.`,requestId:request.id,leadId:lead.id,productId:null,groupId:null,match:null};
 if(!productId||!groupId)throw new AppError(400,'Pilih produk dan varian yang sama.');const product=await readProduct(productId);
 const match=matchingProducts(product,request,lead,config.cooldown_days).find(row=>row.groupId===groupId);if(!match)throw new AppError(409,'Varian tidak lagi cocok/tersedia. Perbarui rekomendasi dan periksa preferensi.');
 return {draft:outreachDraft(lead,request,match),requestId:request.id,leadId:lead.id,productId,groupId,match:{...match,score:undefined}};
}
async function getOutreach(id:string):Promise<Outreach>{const row=await db().prepare('SELECT s.*,o.payment_state,o.status AS order_status FROM sales_outreach s LEFT JOIN orders o ON o.id=s.order_id WHERE s.id=?').bind(id).first();if(!row)throw new AppError(404,'Outreach tidak ditemukan.');return outreachRow(row)}
export async function saveOutreach(input:unknown){
 const v=validated(outreachSchema,input),request=await getRequest(v.requestId),[lead,config]=await Promise.all([getLead(request.leadId),salesConfig()]),old=v.id?await getOutreach(v.id):null,d=db(),now=Date.now();
 if(old&&(old.requestId!==request.id||old.leadId!==lead.id))throw new AppError(400,'Outreach tidak sesuai lead/permintaan.');
 if(!old?.sentAt&&!ACTIVE_STATUSES.includes(request.status))throw new AppError(409,'Permintaan ini sudah ditutup. Buat wanted item baru untuk kebutuhan berikutnya.');
 if(old&&!v.version)throw new AppError(400,'Versi outreach wajib diisi.');
 if(old?.orderId&&v.orderId!==old.orderId&&v.unlinkAttribution!==true)throw new AppError(409,'Konfirmasi koreksi atau pelepasan atribusi order terlebih dahulu.');
 let sentAt=old?.sentAt??null;
 if(v.outcome!=='DRAFT'&&!sentAt){
  if(v.sentConfirmed!==true)throw new AppError(400,'Konfirmasi bahwa pesan benar-benar sudah dikirim manual. Menyalin draft bukan mengirim pesan.');
  const blocked=contactBlock(lead,config.cooldown_days,now);if(blocked)throw new AppError(409,blocked);
  sentAt=v.sentAt??now;if(sentAt>now||sentAt<now-10*365*86400000)throw new AppError(400,'Tanggal kirim harus berada di masa lalu.');
 }
 if(old?.sentAt&&v.sentAt!==undefined&&v.sentAt!==old.sentAt)throw new AppError(400,'Waktu kirim yang sudah dicatat tidak dapat ditimpa.');
 if(sentAt&&v.outcome==='DRAFT')throw new AppError(400,'Pesan terkirim tidak dapat dikembalikan menjadi draft.');
 if(!old&&(lead.doNotContact||lead.contactPreference==='NONE'||lead.customerArchived))throw new AppError(409,'Lead tidak boleh dihubungi.');
 const productId=v.productId??old?.productId??null,groupId=v.groupId??old?.groupId??null;
 if(old&&(productId!==old.productId||groupId!==old.groupId))throw new AppError(400,'Produk pada outreach existing tidak dapat diganti.');
 if((productId&&!groupId)||(!productId&&groupId))throw new AppError(400,'Pilih produk dan varian yang sama.');
 if(productId&&groupId&&!old?.sentAt){await prepareDraft(request.id,productId,groupId)}
 if(v.outcome==='DRAFT'&&!v.draft)throw new AppError(400,'Draft belum diisi.');
 const orderId=v.orderId??null;
 if(orderId){
  if(v.outcome!=='PURCHASED'||v.confirmAttribution!==true||!sentAt)throw new AppError(400,'Konfirmasi hubungan order dengan outreach ini secara eksplisit.');
  const order=await d.prepare('SELECT id,customer_id,payment_state,status,confirmed_at,catalog_items_json FROM orders WHERE id=?').bind(orderId).first<any>();
  if(!order||order.payment_state!=='payment_confirmed'||['cancelled','expired','refunded','failed'].includes(order.status))throw new AppError(400,'Atribusi hanya untuk order yang benar-benar terkonfirmasi dan aktif.');
  if(!order.confirmed_at||order.confirmed_at<sentAt)throw new AppError(400,'Order harus dikonfirmasi setelah waktu kirim yang dicatat.');
  if(lead.customerId&&order.customer_id!==lead.customerId)throw new AppError(400,'Order bukan milik akun pelanggan yang ditautkan.');
  if(productId){let lines:any[]=[];try{const data=JSON.parse(order.catalog_items_json??'[]');if(Array.isArray(data))lines=data}catch{}if(!lines.some(row=>row&&row.productId===productId&&(!groupId||row.groupId===groupId)))throw new AppError(400,'Produk/varian outreach tidak ditemukan pada snapshot order ini.');}
 }
 const id=old?.id??crypto.randomUUID(),mutation=crypto.randomUUID(),status=v.outcome==='INTERESTED'?'INTERESTED':v.outcome==='PURCHASED'?'CONVERTED':v.outcome==='NOT_INTERESTED'?'CLOSED':v.outcome==='DRAFT'?null:'CONTACTED';
 const write=old?d.prepare('UPDATE sales_outreach SET draft=?,notes=?,outcome=?,sent_at=?,order_id=?,updated_at=?,mutation=?,version=version+1 WHERE id=? AND version=?').bind(v.draft,v.notes,v.outcome,sentAt,orderId,now,mutation,id,v.version):d.prepare('INSERT INTO sales_outreach(id,lead_id,request_id,product_id,group_id,draft,notes,outcome,sent_at,order_id,created_at,updated_at,mutation) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,lead.id,request.id,productId,groupId,v.draft,v.notes,v.outcome,sentAt,orderId,now,now,mutation);
 try{
  // Guard secondary status updates against an optimistic-version conflict, in the same transaction.
  const changes=await d.batch([write,d.prepare("UPDATE sales_requests SET status=CASE WHEN ? IS NOT NULL AND status NOT IN ('CLOSED','CONVERTED','DO_NOT_CONTACT') THEN ? ELSE status END,updated_at=?,version=version+1 WHERE id=? AND EXISTS(SELECT 1 FROM sales_outreach WHERE id=? AND mutation=?)").bind(status,status,now,request.id,id,mutation),d.prepare('UPDATE sales_leads SET updated_at=?,version=version+1 WHERE id=? AND EXISTS(SELECT 1 FROM sales_outreach WHERE id=? AND mutation=?)').bind(now,lead.id,id,mutation)]);
  if(changes[0].meta.changes!==1)throw new AppError(409,'Outreach telah berubah. Muat ulang sebelum menyimpan.');
 }catch(error){if(error instanceof Error&&/UNIQUE constraint/.test(error.message))throw new AppError(409,'Order tersebut sudah diatribusikan ke outreach lain.');throw error}
 return getOutreach(id);
}
export async function outreachHistory(page=1){if(!Number.isSafeInteger(page)||page<1||page>10000)throw new AppError(400,'Halaman tidak valid.');const rows=await db().prepare('SELECT s.*,l.name AS lead_name,l.instagram,o.payment_state,o.status AS order_status FROM sales_outreach s JOIN sales_leads l ON l.id=s.lead_id LEFT JOIN orders o ON o.id=s.order_id ORDER BY s.created_at DESC,s.id LIMIT 20 OFFSET ?').bind((page-1)*20).all();const count=await db().prepare('SELECT COUNT(*) n FROM sales_outreach').first<{n:number}>();return {history:rows.results.map(outreachRow),page,total:Number(count?.n??0)}}
