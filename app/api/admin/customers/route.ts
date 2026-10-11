import {boundary,requireOwner,response} from '@/modules/catalog/server';
import {customerDirectory} from '@/modules/catalog/customer-directory';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>boundary(async()=>{
 await requireOwner(request);
 const reply=response(await customerDirectory(new URL(request.url).searchParams));
 reply.headers.set('Cache-Control','private, no-store');reply.headers.set('Vary','Cookie');reply.headers.set('X-Robots-Tag','noindex, nofollow');return reply;
});
