import {boundary,requireOwner,readJson,response,AppError} from '@/modules/catalog/server';
import {manageCustomer} from '@/modules/catalog/customer-directory';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const POST=(request:Request)=>boundary(async()=>{
 const owner=await requireOwner(request),input=await readJson(request);
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError(400,'Permintaan pelanggan tidak valid.');
 const reply=response(await manageCustomer(input,owner.userId));
 reply.headers.set('Cache-Control','private, no-store');reply.headers.set('Vary','Cookie');return reply;
});
