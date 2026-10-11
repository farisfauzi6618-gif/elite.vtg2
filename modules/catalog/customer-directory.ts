import {Buffer} from 'node:buffer';
import {AppError,db} from '@/modules/catalog/server';

export type CustomerRecord={id:string;name:string;email:string|null;phone:string|null;birthday:string|null;createdAt:number;deletedAt:number|null};
export type CustomerDirectory={customers:CustomerRecord[];total:number;trashed:number;matched:number;registeredToday:number;view:'active'|'trash';asOf:number;nextCursor:string|null};
type Cursor={createdAt:number;id:string};
type Selection={query:string;start:number|null;end:number|null;view:'active'|'trash';asOf:number;cursor:Cursor|null};
type Row={id:string;name:string;email:string|null;phone:string|null;birthday:string|null;created_at:number;deleted_at:number|null};
const DAY=86400000,WIB=7*3600000;
export const CUSTOMER_PAGE_SIZE=50;
export const CUSTOMER_EXPORT_BATCH=500;
const columns='c.id,c.name,c.email,c.phone,c.birthday,c.created_at,t.deleted_at';
const join='customers c LEFT JOIN customer_trash t ON t.customer_id=c.id';
const record=(row:Row):CustomerRecord=>({id:row.id,name:row.name,email:row.email,phone:row.phone,birthday:row.birthday,createdAt:Number(row.created_at),deletedAt:row.deleted_at===null?null:Number(row.deleted_at)});
function dateValue(value:string|null){
 if(!value)return null;
 const timestamp=Date.parse(value+'T00:00:00+07:00');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(timestamp)||new Date(timestamp+WIB).toISOString().slice(0,10)!==value)throw new AppError(400,'Tanggal pendaftaran tidak valid.');
 return timestamp;
}
function cursorValue(value:string|null):Cursor|null{
 if(!value)return null;
 try{if(value.length>512||!/^[A-Za-z0-9_-]+$/.test(value))throw Error();const parsed=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));if(!Number.isSafeInteger(parsed.createdAt)||parsed.createdAt<0||typeof parsed.id!=='string'||parsed.id.length<1||parsed.id.length>128||/[\x00-\x1f]/.test(parsed.id))throw Error();return {createdAt:parsed.createdAt,id:parsed.id};}catch{throw new AppError(400,'Halaman pelanggan tidak valid. Muat ulang daftar.');}
}
export function customerSelection(params:URLSearchParams,now=Date.now()):Selection{
 const query=(params.get('q')||'').trim();if(query.length>120||/[\x00-\x1f]/.test(query))throw new AppError(400,'Pencarian maksimal 120 karakter.');
 const start=dateValue(params.get('start')),last=dateValue(params.get('end')),end=last===null?null:last+DAY;
 if(start!==null&&end!==null&&start>=end)throw new AppError(400,'Tanggal akhir harus sama atau setelah tanggal awal.');
 const raw=params.get('asOf'),asOf=raw===null?now:Number(raw);if(raw===''||!Number.isSafeInteger(asOf)||asOf<0||asOf>now+1000)throw new AppError(400,'Waktu daftar tidak valid. Muat ulang daftar.');
 const view=params.get('view')||'active';if(view!=='active'&&view!=='trash')throw new AppError(400,'Pilih daftar pelanggan atau Sampah.');
 return {query,start,end,view,asOf,cursor:cursorValue(params.get('cursor'))};
}
function where(selection:Selection,cursor:Cursor|null=null){
 const clauses=['c.created_at<=?',selection.view==='trash'?'t.customer_id IS NOT NULL':'t.customer_id IS NULL'],args:unknown[]=[selection.asOf];
 if(selection.start!==null){clauses.push('c.created_at>=?');args.push(selection.start)}
 if(selection.end!==null){clauses.push('c.created_at<?');args.push(selection.end)}
 if(selection.query){const term='%'+selection.query.replace(/[\\%_]/g,'\\$&')+'%';clauses.push("(c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')");args.push(term,term,term)}
 if(cursor){clauses.push('(c.created_at<? OR (c.created_at=? AND c.id<?))');args.push(cursor.createdAt,cursor.createdAt,cursor.id)}
 return {sql:clauses.join(' AND '),args};
}
async function readRows(selection:Selection,cursor:Cursor|null,limit:number){const w=where(selection,cursor);return (await db().prepare(`SELECT ${columns} FROM ${join} WHERE ${w.sql} ORDER BY c.created_at DESC,c.id DESC LIMIT ?`).bind(...w.args,limit).all<Row>()).results.map(record)}
export async function customerDirectory(params:URLSearchParams):Promise<CustomerDirectory>{
 const s=customerSelection(params),w=where(s),today=Math.floor((s.asOf+WIB)/DAY)*DAY-WIB;
 const [rows,counts]=await Promise.all([readRows(s,s.cursor,CUSTOMER_PAGE_SIZE+1),db().prepare(`SELECT (SELECT COUNT(*) FROM ${join} WHERE c.created_at<=? AND t.customer_id IS NULL) total,(SELECT COUNT(*) FROM ${join} WHERE c.created_at<=? AND t.customer_id IS NOT NULL) trashed,(SELECT COUNT(*) FROM ${join} WHERE c.created_at>=? AND c.created_at<=? AND t.customer_id IS NULL) registeredToday,(SELECT COUNT(*) FROM ${join} WHERE ${w.sql}) matched`).bind(s.asOf,s.asOf,today,s.asOf,...w.args).first<{total:number;trashed:number;registeredToday:number;matched:number}>()]);
 const customers=rows.slice(0,CUSTOMER_PAGE_SIZE),last=customers.at(-1);
 return {customers,total:Number(counts?.total||0),trashed:Number(counts?.trashed||0),registeredToday:Number(counts?.registeredToday||0),matched:Number(counts?.matched||0),view:s.view,asOf:s.asOf,nextCursor:rows.length>CUSTOMER_PAGE_SIZE&&last?Buffer.from(JSON.stringify({createdAt:last.createdAt,id:last.id})).toString('base64url'):null};
}

/** CSV is for spreadsheets; JSON preserves exact values for a portable archive. */
export function customerCsvCell(value:unknown){let text=value===null||value===undefined?'':String(value);if(/^[\s\x00-\x1f]*[=+\-@＝＋－＠]|^[\x00-\x1f]/u.test(text))text='\t'+text;return '"'+text.replaceAll('"','""')+'"'}
function csvLine(customer:CustomerRecord){return [customer.id,customer.name,customer.email,customer.phone,customer.birthday,new Date(customer.createdAt).toISOString(),customer.deletedAt===null?'':new Date(customer.deletedAt).toISOString()].map(customerCsvCell).join(',')+'\r\n'}
export async function exportCustomers(params:URLSearchParams,signal?:AbortSignal){
 const format=params.get('format')||'csv';if(!['csv','json'].includes(format))throw new AppError(400,'Pilih CSV atau JSON.');
 const s=customerSelection(params);s.cursor=null;const w=where(s);
 const expected=Number((await db().prepare(`SELECT COUNT(*) n FROM ${join} WHERE ${w.sql}`).bind(...w.args).first<{n:number}>())?.n||0);
 // Fetch before sending headers so initial database failures return a normal error.
 let rows=await readRows(s,null,CUSTOMER_EXPORT_BATCH),cursor:Cursor|null=null,stage=0,exported=0,cancelled=false;
 const encoder=new TextEncoder(),stream=new ReadableStream<Uint8Array>({
  async pull(controller){
   try{
    if(cancelled||signal?.aborted){controller.error(new Error('Export interrupted'));return}
    if(stage===0){stage=1;controller.enqueue(encoder.encode(format==='csv'?'\uFEFF'+['ID pelanggan','Nama','Email','Nomor HP','Ulang tahun','Terdaftar (UTC)','Dihapus (UTC)'].map(customerCsvCell).join(',')+'\r\n':JSON.stringify({version:2,exportedAt:new Date().toISOString(),asOf:s.asOf,filters:{query:s.query,start:s.start,end:s.end,view:s.view}}).slice(0,-1)+',"customers":['));return}
    if(stage===2){rows=await readRows(s,cursor,CUSTOMER_EXPORT_BATCH);stage=1}
    if(rows.length){const first=exported===0;controller.enqueue(encoder.encode(format==='csv'?rows.map(csvLine).join(''):(first?'':',')+rows.map(row=>JSON.stringify(row)).join(',')));exported+=rows.length;const last=rows.at(-1)!;cursor={createdAt:last.createdAt,id:last.id};rows=[];stage=2;return}
    const currentCount=Number((await db().prepare(`SELECT COUNT(*) n FROM ${join} WHERE ${w.sql}`).bind(...w.args).first<{n:number}>())?.n||0);
    if(exported!==expected||currentCount!==expected)throw Error('Customer export count changed');
    if(format==='json')controller.enqueue(encoder.encode('],"count":'+exported+',"complete":true}'));
    controller.close();
   }catch{controller.error(new Error('Customer export incomplete'))}
  },cancel(){cancelled=true;rows=[]},
 });
 return new Response(stream,{headers:{'Content-Type':format==='csv'?'text/csv; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="elitevtg-pelanggan${s.view==='trash'?'-sampah':''}-${new Date(s.asOf+WIB).toISOString().slice(0,10)}.${format}"`,'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','X-ELITE-Export-Count':String(expected)}});
}

/** Reversible removal keeps customer IDs, transaction references and promotion history intact. */
function mutationError(error:unknown){
 if(error&&typeof error==='object'&&'code' in error&&/^(?:SQLITE_BUSY|SQLITE_LOCKED)(?:_|$)/.test(String(error.code)))return new AppError(409,'Data sedang diperbarui. Perbarui daftar sebelum mencoba lagi.');
 return error;
}
export async function manageCustomer(input:Record<string,unknown>,actor:string){
 const id=input.customerId,action=input.action,expected=input.deletedAt;
 if(typeof id!=='string'||!id.length||id.length>128||/[\x00-\x1f]/.test(id)||!['trash','restore'].includes(String(action)))throw new AppError(400,'Permintaan pelanggan tidak valid.');
 if(expected!==null&&(!Number.isSafeInteger(expected)||Number(expected)<=0))throw new AppError(400,'Status pelanggan tidak valid. Perbarui daftar.');
 const tx=await db().client.transaction('write').catch(error=>{throw mutationError(error)});
 try{
  const row=(await tx.execute({sql:`SELECT c.id,t.deleted_at FROM ${join} WHERE c.id=?`,args:[id]})).rows[0];
  if(!row)throw new AppError(404,'Pelanggan tidak ditemukan.');
  const current=row.deleted_at===null?null:Number(row.deleted_at);
  if(current!==expected)throw new AppError(409,'Status pelanggan berubah. Perbarui daftar sebelum melanjutkan.');
  if(action==='trash'&&current!==null||action==='restore'&&current===null)throw new AppError(409,'Status pelanggan sudah berubah. Perbarui daftar.');
  const deletedAt=action==='trash'?Date.now():null;
  if(action==='trash')await tx.execute({sql:'INSERT INTO customer_trash(customer_id,deleted_at,deleted_by) VALUES(?,?,?)',args:[id,deletedAt,actor]});
  else await tx.execute({sql:'DELETE FROM customer_trash WHERE customer_id=?',args:[id]});
  // Restore requires a fresh login too; revoked tokens never become valid again.
  await tx.execute({sql:'DELETE FROM customer_sessions WHERE customer_id=?',args:[id]});
  await tx.commit();return {customerId:id,deletedAt};
 }catch(error){await tx.rollback();throw mutationError(error)}finally{tx.close()}
}
