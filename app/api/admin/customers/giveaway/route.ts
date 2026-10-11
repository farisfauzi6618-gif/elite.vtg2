import {boundary,requireOwner,readJson,response} from '@/modules/catalog/server';
import {saveGiveaway} from '@/modules/catalog/customer-directory';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const PUT=(request:Request)=>boundary(async()=>{const owner=await requireOwner(request),input=await readJson(request);if(!input||typeof input!=='object'||Array.isArray(input))return response({error:'Catatan giveaway tidak valid.'},400);return response({giveaway:await saveGiveaway(input,owner.userId)})});
