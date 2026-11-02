import { AuthError } from '@/lib/auth/owner';
import { acceptDelegateInvite, HandoverError } from '@/lib/auth/delegated-admin';
import { sameOrigin } from '@/lib/request-security';
import { publicRate } from '@/modules/catalog/request-rate';
import { readLimitedText } from '@/modules/catalog/request-limits';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
export async function POST(request:Request){
  try{
    if(!sameOrigin(request))throw new AuthError(403,'Permintaan harus berasal dari aplikasi ini.');
    await publicRate(request,'admin-invitation',6);
    if(!request.headers.get('content-type')?.startsWith('application/json'))throw new AuthError(415,'Format formulir tidak valid.');
    let input:Record<string,unknown>;
    try{input=JSON.parse(await readLimitedText(request,2048));if(!input||Array.isArray(input)||typeof input!=='object')throw new Error();}catch{throw new AuthError(400,'Formulir tidak valid.');}
    await acceptDelegateInvite(input);return json({ok:true});
  }catch(error){if(error instanceof AuthError||error instanceof HandoverError)return json({error:error.message},error.status);if(error&&typeof error==='object'&&'status' in error&&'message' in error)return json({error:error.message},Number(error.status));console.error('Admin invitation operation failed');return json({error:'Undangan belum dapat diproses. Coba lagi.'},503);}
}
