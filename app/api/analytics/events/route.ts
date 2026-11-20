import {startVisit,collect,observe} from '@/modules/analytics/server';
import {publicRate} from '@/modules/catalog/request-rate';
import {readLimitedText} from '@/modules/catalog/request-limits';
import {sameOrigin} from '@/lib/request-security';
import {analyticsPath} from '@/modules/analytics/paths';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(r:Request){
 if(!sameOrigin(r))return new Response(null,{status:403});
 if(r.headers.get('content-type')?.split(';')[0]!=='application/json')return new Response(null,{status:415});
 let cookies:string[]=[],state='retry';
 await observe(async()=>{
  const raw=await readLimitedText(r,2048),v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v)){state='excluded';return}
  if(/bot|spider|crawler|headless/i.test(r.headers.get('user-agent')||'')||r.headers.get('purpose')==='prefetch'||/(?:^|;\s*)elite_(?:admin|team)=/.test(r.headers.get('cookie')||'')){state='excluded';return}
  await publicRate(r,'analytics',600);
  if(v.event==='visit'){
   if(!analyticsPath(v.path)){state='excluded';return}
   cookies=await startVisit(r,v);state=cookies.length?'ready':'excluded';
  }else state=await collect(r,v)===false?'retry':'ready';
 });
 const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Analytics-State':state});cookies.forEach(c=>headers.append('Set-Cookie',c));return new Response(null,{status:204,headers});
}
