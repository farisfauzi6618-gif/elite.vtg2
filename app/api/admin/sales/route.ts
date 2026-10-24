import {z} from 'zod';
import {boundary,requireOwner,response,db,AppError} from '@/modules/catalog/server';
import {readLimitedText} from '@/modules/catalog/request-limits';
import {publicRate} from '@/modules/catalog/request-rate';
import {listLeads,leadDetail,saveLead,saveRequest,customerChoices} from '@/modules/sales/leads';
import {recommendations} from '@/modules/sales/inventory';
import {productsToPush,recordProductAction} from '@/modules/sales/push';
import {prepareDraft,saveOutreach,outreachHistory} from '@/modules/sales/outreach';
import {salesOverview,checkoutDiagnostics} from '@/modules/sales/report';
import {validated,id} from '@/modules/sales/validation';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function privateResponse(action:()=>Promise<Response>){const reply=await boundary(action);reply.headers.set('Cache-Control','private, no-store');reply.headers.set('Vary','Cookie');reply.headers.set('X-Robots-Tag','noindex, nofollow');return reply}
export const GET=(request:Request)=>privateResponse(async()=>{
 const owner=await requireOwner(request),params=new URL(request.url).searchParams,view=params.get('view')??'overview';
 if(view==='overview')return response(await salesOverview());
 if(view==='leads')return response(await listLeads(params));
 if(view==='lead')return response(await leadDetail(validated(id,params.get('id'))));
 if(view==='history')return response(await outreachHistory(Number(params.get('page')??1)));
 if(['matches','push','diagnostics'].includes(view))await publicRate(request,'sales-compute',60,owner.userId);
 if(view==='matches')return response(await recommendations(params.get('leadId')?validated(id,params.get('leadId')):undefined));
 if(view==='push')return response(await productsToPush());
 if(view==='diagnostics')return response(await checkoutDiagnostics());
 throw new AppError(400,'Tampilan Sales Intelligence tidak dikenal.');
});
export const POST=(request:Request)=>privateResponse(async()=>{
 const owner=await requireOwner(request);await publicRate(request,'sales-write',400,owner.userId);
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new AppError(415,'Gunakan formulir Sales Intelligence.');
 let raw:unknown;try{raw=JSON.parse(await readLimitedText(request,16000))}catch(error){if(error instanceof AppError)throw error;throw new AppError(400,'Data formulir tidak valid.')}
 const input=validated(z.object({op:z.enum(['lead','request','outreach','draft','product','config','customerLookup']),value:z.unknown()}).strict(),raw);
 if(input.op==='customerLookup'){const value=validated(z.object({q:z.string().trim().min(2).max(60)}).strict(),input.value);return response({customers:await customerChoices(value.q)})}
 if(input.op==='lead')return response({lead:await saveLead(input.value)});
 if(input.op==='request')return response({request:await saveRequest(input.value)});
 if(input.op==='outreach')return response({outreach:await saveOutreach(input.value)});
 if(input.op==='draft'){const value=validated(z.object({requestId:id,productId:id.nullable().optional(),groupId:id.nullable().optional()}).strict(),input.value);return response(await prepareDraft(value.requestId,value.productId,value.groupId))}
 if(input.op==='product'){const value=validated(z.object({productId:id,action:z.enum(['review','promote','dismiss','reset'])}).strict(),input.value);return response(await recordProductAction(value.productId,value.action,owner.userId))}
 const value=validated(z.object({days:z.number().int().min(0).max(90)}).strict(),input.value);await db().prepare('UPDATE sales_config SET cooldown_days=? WHERE id=1').bind(value.days).run();return response({cooldownDays:value.days});
});
