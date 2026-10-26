import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {siteOrigin} from '@/lib/env';
import {AppError,db} from './server';
import {hashCustomerPassword} from './customers';
import {RECOVERY_INVALID,type OwnerRecovery} from './customer-recovery-types';
import {sendRecoveryEmail} from './customer-recovery-email';
export const RESET_LIFETIME_MS=15*60000;
type Target={id:string;identity:string;email:string|null;phone:string|null;password_hash:string};
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
function resetUrl(token:string){const origin=siteOrigin();if(process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')throw new AppError(503,'Pemulihan akun tidak diaktifkan pada preview.');return origin+'/akun/reset-kata-sandi#token='+token;}
function tokenHash(value:unknown){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw new AppError(400,RECOVERY_INVALID);return digest(value);}
async function prune(){await db().prepare('DELETE FROM customer_password_resets WHERE expires_at<?').bind(Date.now()-86400000).run();}
async function issue(target:Target,channel:'email'|'phone',actor:string|null){
 const token=randomBytes(32).toString('hex'),hash=digest(token),now=Date.now(),expiresAt=now+RESET_LIFETIME_MS,url=resetUrl(token);
 const saved=await db().prepare(`INSERT INTO customer_password_resets(token_hash,customer_id,password_digest,channel,created_at,expires_at,ready,issued_by) SELECT ?,?,?,?, ?,?,?,? FROM customers c WHERE c.id=? AND c.password_hash=? AND NOT EXISTS(SELECT 1 FROM customer_trash WHERE customer_id=c.id) AND NOT EXISTS(SELECT 1 FROM customer_password_resets r WHERE r.customer_id=c.id AND r.channel=? AND r.created_at>?)`).bind(hash,target.id,digest(target.password_hash),channel,now,expiresAt,Number(channel==='phone'),actor,target.id,target.password_hash,channel,now-60000).run();
 return saved.meta.changes===1?{hash,url,expiresAt}:null;
}
/** Invoked after the generic HTTP response: no account lookup timing reaches the visitor. */
export async function emailCustomerRecovery(identity:string,fetcher?:typeof fetch){
 try{
  await prune();
  const target=await db().prepare('SELECT c.id,c.identity,c.email,c.phone,c.password_hash FROM customers c WHERE c.identity=? AND c.email=? AND NOT EXISTS(SELECT 1 FROM customer_trash WHERE customer_id=c.id)').bind(identity,identity).first<Target>();
  if(!target)return;
  const created=await issue(target,'email',null);if(!created)return;
  const sent=await sendRecoveryEmail(target.email!,'reset',created.hash,created.url,fetcher);
  if(sent)await db().prepare('UPDATE customer_password_resets SET ready=1 WHERE token_hash=? AND used_at IS NULL').bind(created.hash).run();
  else{await db().prepare('DELETE FROM customer_password_resets WHERE token_hash=?').bind(created.hash).run();console.error('Customer recovery email could not be delivered.');}
 }catch{console.error('Customer recovery request could not be processed.');}
}
export async function ownerCustomerRecovery(input:Record<string,unknown>,actor:string):Promise<OwnerRecovery>{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError(400,'Permintaan pemulihan tidak valid.');
 if(typeof input.customerId!=='string'||input.customerId.length>128||input.verifiedRegisteredPhone!==true)throw new AppError(400,'Konfirmasi verifikasi nomor WhatsApp terdaftar terlebih dahulu.');
 const target=await db().prepare('SELECT c.id,c.identity,c.email,c.phone,c.password_hash FROM customers c WHERE c.id=? AND NOT EXISTS(SELECT 1 FROM customer_trash WHERE customer_id=c.id)').bind(input.customerId).first<Target>();
 if(!target||!target.phone||target.phone!==target.identity||!/^\+62\d{8,13}$/.test(target.phone))throw new AppError(409,'Pemulihan WhatsApp hanya untuk akun aktif dengan nomor HP terdaftar.');
 await prune();const created=await issue(target,'phone',actor);if(!created)throw new AppError(429,'Tunggu satu menit sebelum membuat link baru. Link sebelumnya tetap berlaku hingga kedaluwarsa.');
 return {url:created.url,phone:target.phone,expiresAt:created.expiresAt};
}
export async function completeCustomerRecovery(input:Record<string,unknown>){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError(400,RECOVERY_INVALID);
 const hash=tokenHash(input.token);
 if(typeof input.password!=='string'||input.password!==input.confirmPassword)throw new AppError(400,'Ulangi kata sandi baru dengan isian yang sama.');
 // Check the cheap verifier before running the password KDF.
 const candidate=await db().prepare('SELECT token_hash FROM customer_password_resets WHERE token_hash=? AND ready=1 AND used_at IS NULL AND expires_at>?').bind(hash,Date.now()).first();
 if(!candidate)throw new AppError(400,RECOVERY_INVALID);
 const passwordHash=await hashCustomerPassword(input.password),tx=await db().client.transaction('write');let email:string|null=null;
 try{
  const now=Date.now(),row=(await tx.execute({sql:`SELECT r.customer_id,r.password_digest,c.password_hash,c.email FROM customer_password_resets r JOIN customers c ON c.id=r.customer_id WHERE r.token_hash=? AND r.ready=1 AND r.used_at IS NULL AND r.expires_at>? AND NOT EXISTS(SELECT 1 FROM customer_trash WHERE customer_id=c.id)`,args:[hash,now]})).rows[0];
  if(!row||!timingSafeEqual(Buffer.from(String(row.password_digest),'hex'),Buffer.from(digest(String(row.password_hash)),'hex')))throw new AppError(400,RECOVERY_INVALID);
  await tx.execute({sql:'UPDATE customers SET password_hash=? WHERE id=?',args:[passwordHash,row.customer_id]});
  await tx.execute({sql:'UPDATE customer_password_resets SET used_at=? WHERE customer_id=? AND used_at IS NULL',args:[now,row.customer_id]});
  await tx.execute({sql:'DELETE FROM customer_sessions WHERE customer_id=?',args:[row.customer_id]});
  email=row.email?String(row.email):null;await tx.commit();
 }catch(error){await tx.rollback();throw error;}finally{tx.close();}
 return {notification:email?{email,id:hash}:null};
}
