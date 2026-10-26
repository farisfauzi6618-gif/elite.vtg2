import {after} from 'next/server.js';
import {boundary,checkAdminOrigin,readJson,response,AppError} from '@/modules/catalog/server';
import {publicRate} from '@/modules/catalog/request-rate';
import {customerIdentity,customerSessionCookie} from '@/modules/catalog/customers';
import {emailCustomerRecovery,completeCustomerRecovery} from '@/modules/catalog/customer-recovery';
import {recoveryEmailConfigured,sendRecoveryEmail} from '@/modules/catalog/customer-recovery-email';
import {RECOVERY_MESSAGE} from '@/modules/catalog/customer-recovery-types';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=30;
export const POST=(request:Request)=>boundary(async()=>{
 checkAdminOrigin(request);await publicRate(request,'recovery-ip',20);
 const input=await readJson(request),identity=customerIdentity(input?.identity);
 if(!identity.email)throw new AppError(400,'Untuk akun nomor HP, gunakan bantuan WhatsApp pada formulir pemulihan.');
 await publicRate(request,'recovery-identity',3,identity.identity);
 if(!recoveryEmailConfigured()||process.env.VERCEL_ENV&&process.env.VERCEL_ENV!=='production')throw new AppError(503,'Pemulihan email belum tersedia. Hubungi bantuan ELITE.VTG.');
 after(()=>emailCustomerRecovery(identity.identity));return response({message:RECOVERY_MESSAGE});
});
export const PUT=(request:Request)=>boundary(async()=>{
 checkAdminOrigin(request);await publicRate(request,'recovery-complete',20);
 const result=await completeCustomerRecovery(await readJson(request));
 if(result.notification){const note=result.notification;after(async()=>{try{await sendRecoveryEmail(note.email,'changed',note.id)}catch{console.error('Customer password change notification could not be delivered.')}});}
 const reply=response({ok:true});reply.headers.set('Set-Cookie',customerSessionCookie(request));return reply;
});
