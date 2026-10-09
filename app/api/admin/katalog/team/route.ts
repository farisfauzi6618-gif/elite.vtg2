import { boundary,requireOwner,readJson,response } from '@/modules/catalog/server';
import { listTeam,editTeam } from '@/modules/catalog/team-access';
export const dynamic='force-dynamic';
export const GET=(r:Request)=>boundary(async()=>{await requireOwner(r);return response({members:await listTeam(new URL(r.url).origin)})});
export const POST=(r:Request)=>boundary(async()=>{await requireOwner(r);await editTeam(await readJson(r));return response({members:await listTeam(new URL(r.url).origin)})});

export const runtime="nodejs";
