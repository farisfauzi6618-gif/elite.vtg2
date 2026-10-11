import {Buffer} from 'node:buffer';
import {AppError,db} from '@/modules/catalog/server';

export type GiveawayRecord={instagramUsername:string;commentVerifiedAt:number|null;updatedAt:number;version:number};
export type CustomerRecord={id:string;name:string;email:string|null;phone:string|null;birthday:string|null;createdAt:number;giveaway:GiveawayRecord|null};
export type CustomerDirectory={customers:CustomerRecord[];total:number;matched:number;registeredToday:number;verified:number;campaign:string;asOf:number;nextCursor:string|null};
type Cursor={createdAt:number;id:string};
type Selection={query:string;start:number|null;end:number|null;campaign:string;status:string;asOf:number;cursor:Cursor|null};
type Row={id:string;name:string;email:string|null;phone:string|null;birthday:string|null;created_at:number;instagram_username:string|null;comment_verified_at:number|null;updated_at:number|null;version:number|null};
const DAY=86400000,WIB=7*3600000;
export const CUSTOMER_PAGE_SIZE=50;
export const CUSTOMER_EXPORT_BATCH=500;
const columns='c.id,c.name,c.email,c.phone,c.birthday,c.created_at,g.instagram_username,g.comment_verified_at,g.updated_at,g.version';
const join='customers c LEFT JOIN customer_giveaway_entries g ON g.customer_id=c.id AND g.campaign=?';
const record=(row:Row):CustomerRecord=>({id:row.id,name:row.name,email:row.email,phone:row.phone,birthday:row.birthday,createdAt:Number(row.created_at),giveaway:row.instagram_username?{instagramUsername:row.instagram_username,commentVerifiedAt:row.comment_verified_at===null?null:Number(row.comment_verified_at),updatedAt:Number(row.updated_at),version:Number(row.version)}:null});
export function giveawayCampaign(value:unknown){if(typeof value!=='string'||!/^[a-z0-9][a-z0-9_-]{0,59}$/.test(value))throw new AppError(400,'Kode giveaway: 1–60 huruf kecil, angka, tanda hubung, atau underscore.');return value}

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
 const campaign=giveawayCampaign(params.get('campaign')||'giveaway-utama'),status=params.get('status')||'all';if(!['all','verified','pending','unrecorded'].includes(status))throw new AppError(400,'Status giveaway tidak valid.');
 return {query,start,end,campaign,status,asOf,cursor:cursorValue(params.get('cursor'))};
}
function where(selection:Selection,cursor:Cursor|null=null){
 const clauses=['c.created_at<=?'],args:unknown[]=[selection.asOf];
 if(selection.start!==null){clauses.push('c.created_at>=?');args.push(selection.start)}
 if(selection.end!==null){clauses.push('c.created_at<?');args.push(selection.end)}
 if(selection.query){const escape=(value:string)=>'%'+value.replace(/[\\%_]/g,'\\$&')+'%',term=escape(selection.query);clauses.push("(c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\' OR g.instagram_username LIKE ? ESCAPE '\\')");args.push(term,term,term,escape(selection.query.replace(/^@/,'')))}
 if(selection.status==='verified')clauses.push('g.comment_verified_at IS NOT NULL');
 if(selection.status==='pending')clauses.push('g.customer_id IS NOT NULL AND g.comment_verified_at IS NULL');
 if(selection.status==='unrecorded')clauses.push('g.customer_id IS NULL');
 if(cursor){clauses.push('(c.created_at<? OR (c.created_at=? AND c.id<?))');args.push(cursor.createdAt,cursor.createdAt,cursor.id)}
 return {sql:clauses.join(' AND '),args};
}
async function readRows(selection:Selection,cursor:Cursor|null,limit:number){const w=where(selection,cursor);return (await db().prepare(`SELECT ${columns} FROM ${join} WHERE ${w.sql} ORDER BY c.created_at DESC,c.id DESC LIMIT ?`).bind(selection.campaign,...w.args,limit).all<Row>()).results.map(record)}
export async function customerDirectory(params:URLSearchParams):Promise<CustomerDirectory>{
 const s=customerSelection(params),w=where(s),today=Math.floor((s.asOf+WIB)/DAY)*DAY-WIB;
 const [rows,counts]=await Promise.all([readRows(s,s.cursor,CUSTOMER_PAGE_SIZE+1),db().prepare(`SELECT (SELECT COUNT(*) FROM customers WHERE created_at<=?) total,(SELECT COUNT(*) FROM customers WHERE created_at>=? AND created_at<=?) registeredToday,(SELECT COUNT(*) FROM ${join} WHERE ${w.sql}) matched,(SELECT COUNT(*) FROM ${join} WHERE ${w.sql} AND g.comment_verified_at IS NOT NULL) verified`).bind(s.asOf,today,s.asOf,s.campaign,...w.args,s.campaign,...w.args).first<{total:number;registeredToday:number;matched:number;verified:number}>()]);
 const customers=rows.slice(0,CUSTOMER_PAGE_SIZE),last=customers.at(-1);
 return {customers,total:Number(counts?.total||0),registeredToday:Number(counts?.registeredToday||0),matched:Number(counts?.matched||0),verified:Number(counts?.verified||0),campaign:s.campaign,asOf:s.asOf,nextCursor:rows.length>CUSTOMER_PAGE_SIZE&&last?Buffer.from(JSON.stringify({createdAt:last.createdAt,id:last.id})).toString('base64url'):null};
}

/** CSV is for spreadsheets; JSON preserves exact values for a portable archive. */
export function customerCsvCell(value:unknown){let text=value===null||value===undefined?'':String(value);if(/^[\s\x00-\x1f]*[=+\-@＝＋－＠]|^[\x00-\x1f]/u.test(text))text='\t'+text;return '"'+text.replaceAll('"','""')+'"'}
function csvLine(customer:CustomerRecord,campaign:string){return [customer.id,customer.name,customer.email,customer.phone,customer.birthday,new Date(customer.createdAt).toISOString(),campaign,customer.giveaway?.instagramUsername,customer.giveaway?.commentVerifiedAt?'Terverifikasi':customer.giveaway?'Belum diverifikasi':'Belum dicatat',customer.giveaway?.commentVerifiedAt?new Date(customer.giveaway.commentVerifiedAt).toISOString():''].map(customerCsvCell).join(',')+'\r\n'}
async function archiveRows(rows:CustomerRecord[]){
 const entries=await db().prepare(`SELECT customer_id,campaign,instagram_username,comment_verified_at,updated_at,version FROM customer_giveaway_entries WHERE customer_id IN (${rows.map(()=>'?').join(',')}) ORDER BY customer_id,campaign`).bind(...rows.map(row=>row.id)).all<{customer_id:string;campaign:string;instagram_username:string;comment_verified_at:number|null;updated_at:number;version:number}>();
 const grouped=new Map<string,unknown[]>();for(const entry of entries.results){const list=grouped.get(entry.customer_id)||[];list.push({campaign:entry.campaign,instagramUsername:entry.instagram_username,commentVerifiedAt:entry.comment_verified_at,updatedAt:entry.updated_at,version:entry.version});grouped.set(entry.customer_id,list)}
 return rows.map(({giveaway,...customer})=>({...customer,giveaways:grouped.get(customer.id)||[]}));
}
export async function exportCustomers(params:URLSearchParams,signal?:AbortSignal){
 const format=params.get('format')||'csv';if(!['csv','json'].includes(format))throw new AppError(400,'Pilih CSV atau JSON.');
 const s=customerSelection(params);s.cursor=null;const w=where(s);
 const expected=Number((await db().prepare(`SELECT COUNT(*) n FROM ${join} WHERE ${w.sql}`).bind(s.campaign,...w.args).first<{n:number}>())?.n||0);
 // Fetch before sending headers so initial database failures return a normal error.
 let rows=await readRows(s,null,CUSTOMER_EXPORT_BATCH),cursor:Cursor|null=null,stage=0,exported=0,cancelled=false;
 const encoder=new TextEncoder(),stream=new ReadableStream<Uint8Array>({
  async pull(controller){
   try{
    if(cancelled||signal?.aborted){controller.error(new Error('Export interrupted'));return}
    if(stage===0){stage=1;controller.enqueue(encoder.encode(format==='csv'?'\uFEFF'+['ID pelanggan','Nama','Email','Nomor HP','Ulang tahun','Terdaftar (UTC)','Giveaway','Instagram','Komentar','Diverifikasi (UTC)'].map(customerCsvCell).join(',')+'\r\n':JSON.stringify({version:1,exportedAt:new Date().toISOString(),asOf:s.asOf,filters:{query:s.query,start:s.start,end:s.end,campaign:s.campaign,status:s.status}}).slice(0,-1)+',"customers":['));return}
    if(stage===2){rows=await readRows(s,cursor,CUSTOMER_EXPORT_BATCH);stage=1}
    if(rows.length){const first=exported===0;controller.enqueue(encoder.encode(format==='csv'?rows.map(row=>csvLine(row,s.campaign)).join(''):(first?'':',')+(await archiveRows(rows)).map(row=>JSON.stringify(row)).join(',')));exported+=rows.length;const last=rows.at(-1)!;cursor={createdAt:last.createdAt,id:last.id};rows=[];stage=2;return}
    if(exported!==expected)throw Error('Customer export count changed');
    if(format==='json')controller.enqueue(encoder.encode('],"count":'+exported+',"complete":true}'));
    controller.close();
   }catch{controller.error(new Error('Customer export incomplete'))}
  },cancel(){cancelled=true;rows=[]},
 });
 return new Response(stream,{headers:{'Content-Type':format==='csv'?'text/csv; charset=utf-8':'application/json; charset=utf-8','Content-Disposition':`attachment; filename="elitevtg-pelanggan-${new Date(s.asOf+WIB).toISOString().slice(0,10)}.${format}"`,'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow','X-ELITE-Export-Count':String(expected)}});
}

export async function saveGiveaway(input:Record<string,unknown>,actor:string){
 const campaign=giveawayCampaign(input.campaign),id=input.customerId;
 if(typeof id!=='string'||id.length<1||id.length>128||/[\x00-\x1f]/.test(id))throw new AppError(400,'Pelanggan tidak valid.');
 const username=typeof input.instagramUsername==='string'?input.instagramUsername.trim().replace(/^@/,'').toLowerCase():'';
 if(!/^[a-z0-9._]{1,30}$/.test(username))throw new AppError(400,'Isi username Instagram, tanpa link profil.');
 if(typeof input.commentVerified!=='boolean'||!Number.isSafeInteger(input.version)||Number(input.version)<0)throw new AppError(400,'Status verifikasi tidak valid.');
 if(!await db().prepare('SELECT id FROM customers WHERE id=?').bind(id).first())throw new AppError(404,'Pelanggan tidak ditemukan.');
 if(Number(input.version)>0&&!await db().prepare('SELECT version FROM customer_giveaway_entries WHERE customer_id=? AND campaign=?').bind(id,campaign).first())throw new AppError(409,'Catatan telah berubah. Perbarui daftar sebelum menyimpan lagi.');
 const duplicate=async()=>!!await db().prepare('SELECT customer_id FROM customer_giveaway_entries WHERE campaign=? AND instagram_username=? AND customer_id!=?').bind(campaign,username,id).first();
 if(await duplicate())throw new AppError(409,'Username Instagram ini sudah dicatat untuk pelanggan lain pada giveaway yang sama.');
 const now=Date.now();let saved;
 try{saved=await db().prepare(`INSERT INTO customer_giveaway_entries(customer_id,campaign,instagram_username,comment_verified_at,updated_at,updated_by,version) VALUES(?,?,?,?,?,?,1) ON CONFLICT(customer_id,campaign) DO UPDATE SET instagram_username=excluded.instagram_username,comment_verified_at=CASE WHEN excluded.comment_verified_at IS NULL THEN NULL WHEN customer_giveaway_entries.instagram_username=excluded.instagram_username AND customer_giveaway_entries.comment_verified_at IS NOT NULL THEN customer_giveaway_entries.comment_verified_at ELSE excluded.comment_verified_at END,updated_at=excluded.updated_at,updated_by=excluded.updated_by,version=customer_giveaway_entries.version+1 WHERE customer_giveaway_entries.version=? RETURNING instagram_username,comment_verified_at,updated_at,version`).bind(id,campaign,username,input.commentVerified?now:null,now,actor,input.version).first<{instagram_username:string;comment_verified_at:number|null;updated_at:number;version:number}>();}catch(error){if(await duplicate())throw new AppError(409,'Username Instagram ini sudah dicatat untuk pelanggan lain pada giveaway yang sama.');throw error}
 if(!saved)throw new AppError(409,'Catatan diubah di tab lain. Perbarui daftar sebelum menyimpan lagi.');
 return {instagramUsername:saved.instagram_username,commentVerifiedAt:saved.comment_verified_at,updatedAt:saved.updated_at,version:saved.version};
}
