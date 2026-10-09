import {CATEGORIES} from '@/modules/catalog/taxonomy';
import { headers } from 'next/headers';
import { teamIdentity } from '@/modules/catalog/team-access';
import { readLimitedText } from '@/modules/catalog/request-limits';
import { env } from '@/lib/env';
import { getOwnerUser } from '@/lib/auth/owner';
import type { Product, SizeGroup } from '@/modules/catalog/catalog-types';
export class AppError extends Error { constructor(public status:number,message:string,public detail:Record<string,unknown>={}){super(message)} }
export function db(){if(!env.DB)throw new AppError(503,'Database belum tersedia. Input Anda tetap ada; coba lagi nanti.');return env.DB}
export function bucket(){if(!env.BUCKET)throw new AppError(503,'Penyimpanan foto belum tersedia. Coba lagi nanti.');return env.BUCKET}
export function checkAdminOrigin(request:Request){if(request.method!=='GET'){if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')throw new AppError(403,'Permintaan harus berasal dari aplikasi katalog.')}}
export async function requireOwner(request?:Request){
 const user=await getOwnerUser(request);if(!user)throw new AppError(401,'Masuk dengan akun pemilik terlebih dahulu.');
 const allow=env.ADMIN_EMAIL?.trim().toLowerCase();if(!allow||user.email.trim().toLowerCase()!==allow)throw new AppError(403,'Akun ini tidak mempunyai akses admin ELITE.VTG.');
 // The signed-in owner identity is created only by the password-verified session service.
 await db().prepare('INSERT INTO admin_access(id,user_id,created_at) VALUES(1,?,?) ON CONFLICT(id) DO NOTHING').bind(user.userId,new Date().toISOString()).run();
 const access=await db().prepare('SELECT user_id FROM admin_access WHERE id=1').first<{user_id:string}>();
 if(!access||access.user_id!==user.userId)throw new AppError(403,'Halaman ini hanya untuk akun pemilik ELITE.VTG yang terdaftar.');

 if(request&&request.method!=='GET'){
  const origin=request.headers.get('origin');if(origin!==new URL(request.url).origin)throw new AppError(403,'Permintaan harus berasal dari aplikasi katalog.');
  if(request.headers.get('sec-fetch-site')==='cross-site')throw new AppError(403,'Permintaan lintas situs ditolak.');
 }
 return {...user,role:'owner' as const};
}
export async function requireAdmin(request?:Request){
 if(request)checkAdminOrigin(request);
 try{return await requireOwner(request)}catch(e){if(!(e instanceof AppError)||![401,403].includes(e.status))throw e}
 const cookie=request?request.headers.get('cookie'):(await headers()).get('cookie');
 const member=await teamIdentity(cookie);
 if(member)return member;
 const user=await getOwnerUser(request);throw new AppError(user?403:401,'Akses admin membutuhkan akun pemilik atau tautan tim yang masih aktif.');
}
export async function isAdmin(request?:Request){try{await requireAdmin(request);return true}catch{return false}}
export function response(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
export async function boundary(action:()=>Promise<Response>){try{return await action()}catch(e){if(e instanceof AppError)return response({error:e.message,...e.detail},e.status);console.error('Catalog operation failed',e instanceof Error?e.name:'UnknownError');return response({error:'Penyimpanan gagal. Data masukan tetap ada; muat ulang atau coba lagi.'},503)}}
export function groupFromRow(r:any):SizeGroup{return {id:r.id,productId:r.product_id,label:r.label,tagSize:r.tag_size,fits:JSON.parse(r.fits),lengthCm:r.length_cm,widthCm:r.width_cm,qty:r.qty,price:r.price,condition:r.condition,defects:r.defects,revision:r.revision,sortOrder:r.sort_order}}
export function productFromRow(r:any,groups:SizeGroup[]):Product{return {id:r.id,shortcode:r.shortcode,instagramUrl:r.instagram_url,name:r.name,brand:r.brand,category:r.category,legacyCategory:r.legacy_category??'',features:JSON.parse(r.feature_ids??'[]'),categoryNeedsReview:!CATEGORIES.includes(r.category),color:r.color,price:r.price,condition:r.condition,defects:r.defects,photoKey:r.photo_key,photoKeys:JSON.parse(r.photo_keys??'[]'),description:r.description??'',caption:r.caption,warnings:JSON.parse(r.warnings),reviewed:r.reviewed===1,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at,publishedAt:r.published_at,version:r.version,groups}}
export async function readProduct(id:string){const d=db();const r=await d.prepare('SELECT * FROM products WHERE id=?').bind(id).first();if(!r)throw new AppError(404,'Barang tidak ditemukan.');const g=await d.prepare('SELECT * FROM size_groups WHERE product_id=? ORDER BY sort_order,id').bind(id).all();return productFromRow(r,g.results.map(groupFromRow))}
export async function readProducts(admin=false){const d=db();const p=await d.prepare(admin?'SELECT * FROM products ORDER BY created_at DESC':'SELECT * FROM products WHERE status=\'published\' AND EXISTS (SELECT 1 FROM size_groups g WHERE g.product_id=products.id AND g.qty>0) ORDER BY published_at DESC').all();if(!p.results.length)return [];const g=await d.prepare(admin?'SELECT * FROM size_groups ORDER BY sort_order,id':'SELECT g.* FROM size_groups g JOIN products p ON p.id=g.product_id WHERE p.status=\'published\' AND g.qty>0 ORDER BY g.sort_order,g.id').all();return p.results.map((r:any)=>productFromRow(r,g.results.filter((gr:any)=>gr.product_id===r.id).map(groupFromRow)))}
export async function readHistory(id:string){const h=await db().prepare("SELECT h.*,g.label,CASE WHEN t.name IS NOT NULL THEN t.name WHEN h.actor=(SELECT user_id FROM admin_access WHERE id=1) THEN 'Pemilik' ELSE 'Sistem / pembayaran' END AS actor_name FROM stock_history h JOIN size_groups g ON g.id=h.group_id LEFT JOIN team_access t ON h.actor=('team:'||t.id) WHERE h.product_id=? ORDER BY h.rowid DESC LIMIT 50").bind(id).all();return h.results.map((r:any)=>({id:r.id,groupId:r.group_id,label:r.label,beforeQty:r.before_qty,afterQty:r.after_qty,reason:r.reason,createdAt:r.created_at,undoOf:r.undo_of,afterRevision:r.after_revision,actorName:r.actor_name}))}
export async function readJson(request:Request){if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new AppError(415,'Gunakan formulir aplikasi untuk mengirim data.');const raw=await readLimitedText(request,150000);try{return JSON.parse(raw)}catch{throw new AppError(400,'Data formulir tidak valid.')}}
export function textValue(v:unknown,max=500){if(typeof v!=='string')return '';return v.trim().slice(0,max)}
export function optionalText(v:unknown,max=500){if(v===null||v===undefined||v==='')return null;if(typeof v!=='string')throw new AppError(400,'Isian teks tidak valid.');return v.trim().slice(0,max)||null}
export function integerValue(v:unknown,label:string,max=1e9,nullable=true){if(v===null||v===undefined||v===''){if(nullable)return null;throw new AppError(400,`${label} wajib diisi.`)}if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>max)throw new AppError(400,`${label} harus bilangan bulat 0–${max}.`);return v}
export function measureValue(v:unknown){if(v==null||v==='')return null;if(typeof v!=='number'||!Number.isFinite(v)||v<=0||v>300)throw new AppError(400,'Ukuran aktual harus lebih dari 0 dan maksimal 300 cm.');return v}
