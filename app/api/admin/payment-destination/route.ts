import { requirePrimaryOwner, AuthError } from '@/lib/auth/owner';
import { HandoverError, requireHandoverEnabled } from '@/lib/auth/delegated-admin';
import { replacePaymentDestination } from '@/modules/order/payment-destination-write';
import { sameOrigin } from '@/lib/request-security';
import { publicRate } from '@/modules/catalog/request-rate';
import { readLimitedForm } from '@/modules/order/request-limits';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
export async function POST(request:Request){
  try{
    if(!sameOrigin(request))throw new AuthError(403,'Permintaan harus berasal dari aplikasi ini.');
    const owner=await requirePrimaryOwner(request);requireHandoverEnabled();
    await publicRate(request,'payment-destination',6);
    if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw new AuthError(415,'Gunakan formulir pengaturan pembayaran.');
    const form=await readLimitedForm(request,4*1024*1024+12000);
    return json({ok:true,...await replacePaymentDestination(owner.userId,form)});
  }catch(error){if(error instanceof AuthError||error instanceof HandoverError)return json({error:error.message},error.status);if(error&&typeof error==='object'&&'status' in error&&'message' in error)return json({error:error.message},Number(error.status));console.error('Payment destination operation failed');return json({error:'Tujuan pembayaran belum diubah. Muat ulang pengaturan untuk memeriksa status sebelum mencoba kembali.'},503);}
}
