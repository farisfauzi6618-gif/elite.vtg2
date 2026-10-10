import {startVisit,collect,observe} from '@/modules/analytics/server';
import {publicRate} from '@/modules/catalog/request-rate';
import {readLimitedText} from '@/modules/catalog/request-limits';
import {sameOrigin} from '@/lib/request-security';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(r:Request){
 if(!sameOrigin(r))return new Response(null,{status:403});
 if(r.headers.get('content-type')?.split(';')[0]!=='application/json')return new Response(null,{status:415});
 let cookies:string[]=[];
 await observe(async()=>{const raw=await readLimitedText(r,2048),v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v))return;await publicRate(r,'analytics',600);if(v.event==='visit'){if(typeof v.path!=='string'||! /^(\/$|\/produk\/[^/?#]+$|\/recently-sold\/?$|\/order\/?$|\/ongkir\/?$)/.test(v.path))return;cookies=await startVisit(r,v)}else await collect(r,v)});
 const headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});cookies.forEach(c=>headers.append('Set-Cookie',c));return new Response(null,{status:204,headers});
}
