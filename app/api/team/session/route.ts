import { boundary,checkAdminOrigin,readJson,response } from '@/modules/catalog/server';
import { startTeamSession,endTeamSession,sessionCookie } from '@/modules/catalog/team-access';
import { publicRate } from '@/modules/catalog/request-rate';
export const POST=(r:Request)=>boundary(async()=>{checkAdminOrigin(r);await publicRate(r,'team-login',30);const v=await readJson(r);const result=await startTeamSession(v?.token);const out=response({ok:true,name:result.name});out.headers.set('Set-Cookie',sessionCookie(r,result.session,result.expires));return out});
export const DELETE=(r:Request)=>boundary(async()=>{checkAdminOrigin(r);await endTeamSession(r.headers.get('cookie'));const out=response({ok:true});out.headers.set('Set-Cookie',sessionCookie(r,''));return out});

export const runtime="nodejs";
export const dynamic="force-dynamic";
