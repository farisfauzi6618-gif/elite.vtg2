import {boundary,response,AppError} from '@/modules/catalog/server';
import {currentCustomer} from '@/modules/catalog/customers';
import {loyaltyCard} from '@/modules/loyalty/server';
export const dynamic='force-dynamic';export const runtime='nodejs';
export const GET=(request:Request)=>boundary(async()=>{
 const customer=await currentCustomer(request.headers.get('cookie'));if(!customer)throw new AppError(401,'Masuk ke akun untuk melihat ELITE Card.');
 const params=new URL(request.url).searchParams;if([...params.keys()].some(k=>k!=='rewardsBefore'))throw new AppError(400,'Permintaan ELITE Card tidak valid.');
 const reply=response(await loyaltyCard(customer.id,params));reply.headers.set('Cache-Control','private, no-store');reply.headers.set('Vary','Cookie');return reply;
});
