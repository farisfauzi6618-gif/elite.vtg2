import { requirePrimaryOwner, reauthenticatePrimaryOwner, AuthError } from '@/lib/auth/owner';
import { requireHandoverEnabled, readDelegate, issueDelegateInvite, revokeDelegate, mintAdminLink, HandoverError, validDelegate } from '@/lib/auth/delegated-admin';
import { sameOrigin } from '@/lib/request-security';
import { publicRate } from '@/modules/catalog/request-rate';
import { readLimitedText } from '@/modules/catalog/request-limits';
import { paymentDestinationRevision, paymentOverridesEnabled } from '@/modules/order/payment-destination';
import { siteOrigin } from '@/lib/env';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
async function boundary(action:()=>Promise<Response>) {
  try{return await action();}catch(error){if(error instanceof AuthError||error instanceof HandoverError)return json({error:error.message},error.status);if(error&&typeof error==='object'&&'status' in error&&'message' in error)return json({error:error.message},Number(error.status));console.error('Admin security operation failed');return json({error:'Pengaturan akses belum tersedia. Coba lagi.'},503);}
}
export const GET=(request:Request)=>boundary(async()=>{
  await requirePrimaryOwner(request);requireHandoverEnabled();const account=await readDelegate();
  return json({account:account?{id:account.id,name:account.name,email:account.email,active:account.active===1,credentialsValid:validDelegate(account)}:null});
});
export const POST=(request:Request)=>boundary(async()=>{
  if(!sameOrigin(request))throw new AuthError(403,'Permintaan harus berasal dari aplikasi ini.');
  await requirePrimaryOwner(request);requireHandoverEnabled();
  await publicRate(request,'admin-security',6);
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AuthError(415,'Format formulir tidak valid.');
  let input:Record<string,unknown>;
  try{input=JSON.parse(await readLimitedText(request,2048));if(!input||Array.isArray(input)||typeof input!=='object')throw new Error();}catch{throw new AuthError(400,'Formulir tidak valid.');}
  const owner=await reauthenticatePrimaryOwner(request,input.password);
  if(input.action==='invite'){
    const link=await issueDelegateInvite(owner.userId,input.name,input.email);
    return json({url:siteOrigin()+'/undangan-admin#token='+link.token,expiresAt:link.expiresAt});
  }
  if(input.action==='revoke'){
    if(input.confirmed!==true)throw new AuthError(400,'Konfirmasikan pencabutan akses terlebih dahulu.');
    await revokeDelegate(owner.userId,input.id);return json({ok:true});
  }
  if(input.action==='payment'){
    if(!paymentOverridesEnabled())throw new HandoverError(503,'Perubahan tujuan pembayaran belum diaktifkan pada server.');
    const link=await mintAdminLink('payment',{actor:owner.userId,revision:await paymentDestinationRevision()});
    return json({url:siteOrigin()+'/admin/pembayaran-sekali#token='+link.token,expiresAt:link.expiresAt});
  }
  throw new AuthError(400,'Tindakan tidak valid.');
});
