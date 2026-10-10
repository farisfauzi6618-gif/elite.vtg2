import {analyticsSession,event,observe} from './server';
import {db} from '@/modules/catalog/server';
/** Only fixed codes, no raw errors, request bodies, provider messages or PII. */
export async function watch(r:Request,code:string,action:()=>Promise<Response>){
 const copy=code==='checkout_error'?r.clone():null;
 const reply=await action();
 if(reply.status>=400&&![401,403,429].includes(reply.status))await observe(async()=>{
  const s=await analyticsSession(r);if(!s)return;
  const minute=Math.floor(Date.now()/300000);await event(s,'error',`error:${s.id}:${code}:${minute}`,{errorCode:code});
  if(copy&&reply.status===409){const v=await copy.json();for(const line of Array.isArray(v.lines)?v.lines.slice(0,20):[]){if(typeof line.productId!=='string')continue;const p=await db().prepare("SELECT id FROM products WHERE id=? AND status='published' AND sold_at IS NOT NULL").bind(line.productId).first();if(p)await event(s,'error',`sold:${s.id}:${line.productId}:${minute}`,{productId:line.productId,errorCode:'sold_attempt'})}}
 });
 return reply;
}
