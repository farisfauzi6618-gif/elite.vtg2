import {createHash} from 'node:crypto';
import {db} from './server';
import {siteOrigin} from '@/lib/env';
const DAILY_EMAIL_CAP=90;
function sender(){const value=process.env.CUSTOMER_RECOVERY_FROM?.trim()??'';return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)?value:'';}
export function recoveryEmailConfigured(){return !!sender()&&!!process.env.RESEND_API_KEY?.trim();}
/** One bounded, transactional quota shared by requests and password-change notifications. */
export async function sendRecoveryEmail(to:string,kind:'reset'|'changed',id:string,url?:string,fetcher:typeof fetch=fetch){
 if(!recoveryEmailConfigured())return false;
 const day=Math.floor(Date.now()/86400000),key=createHash('sha256').update((process.env.AUTH_SECRET??'')+':customer-recovery-emails:'+day).digest('hex');
 const result=await db().prepare('INSERT INTO request_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=MIN(count+1,1000) RETURNING count').bind(key,(day+1)*86400000).first<{count:number}>();
 if(!result||result.count>DAILY_EMAIL_CAP)return false;
 const text=kind==='reset'?'Kami menerima permintaan untuk mengatur ulang kata sandi akun ELITE.VTG Anda.\n\nAtur ulang kata sandi:\n'+url+'\n\nLink berlaku 15 menit dan hanya sekali pakai. Jika Anda tidak meminta perubahan ini, abaikan email ini. Kata sandi Anda belum berubah.':'Kata sandi akun ELITE.VTG Anda berhasil diubah. Semua sesi login sebelumnya telah dikeluarkan.\n\nJika Anda tidak melakukan perubahan ini, segera hubungi ELITE.VTG melalui '+siteOrigin()+'/akun/lupa-kata-sandi.';
 try{const response=await fetcher('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'customer-recovery-'+kind+'-'+id},body:JSON.stringify({from:'ELITE.VTG <'+sender()+'>',to:[to],subject:kind==='reset'?'Atur ulang kata sandi ELITE.VTG':'Kata sandi ELITE.VTG berhasil diubah',text})});if(!response.ok)return false;const value=await response.json();return typeof value?.id==='string'&&value.id.length>0;}catch{return false;}
}
