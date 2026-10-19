import {boundary,requireAdmin,response,AppError} from '@/modules/catalog/server';
import {readLimitedText} from '@/modules/catalog/request-limits';
import {publicRate} from '@/modules/catalog/request-rate';
import {prepareDirectPhoto,completeDirectPhoto} from '@/modules/catalog/direct-photo-upload';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const POST=(request:Request)=>boundary(async()=>{
 const user=await requireAdmin(request);
 if(request.headers.get('content-type')?.split(';')[0]!=='application/json')throw new AppError(415,'Gunakan formulir unggahan aplikasi.');
 let input;try{input=JSON.parse(await readLimitedText(request,4096))}catch(error){if(error instanceof AppError)throw error;throw new AppError(400,'Data upload tidak valid.')}
 if(!input||typeof input!=='object'||Array.isArray(input))throw new AppError(400,'Data upload tidak valid.');
 if(input.action==='prepare'){await publicRate(request,'photo-upload',600,user.userId);return response(await prepareDirectPhoto(input,user.userId))}
 if(input.action==='complete')return response(await completeDirectPhoto(input,user.userId));
 throw new AppError(400,'Tindakan upload tidak valid.');
});
