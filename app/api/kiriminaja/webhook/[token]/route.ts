import { readLimitedText } from '@/modules/order/request-limits';
import { api,json,AppError } from "@/modules/order/order-server";
import { verifyKiriminWebhook,receiveKiriminWebhook } from "@/modules/order/kirimin-webhook";
type Context={params:Promise<{token:string}>};
export const GET=(_req:Request,c:Context)=>api(async()=>{await verifyKiriminWebhook((await c.params).token);return json({ok:true});});
export const POST=(req:Request,c:Context)=>api(async()=>{
 const s=await verifyKiriminWebhook((await c.params).token,req);
 if(Number(req.headers.get("content-length")||0)>65536)throw new AppError(413,"Callback terlalu besar.");
 const raw=await readLimitedText(req,65536);if(raw.length>65536)throw new AppError(413,"Callback terlalu besar.");
 let value:unknown;try{value=JSON.parse(raw);}catch{throw new AppError(400,"Callback tidak valid.");}
 await receiveKiriminWebhook(value,s);return json({ok:true});
});

export const runtime="nodejs";
export const dynamic="force-dynamic";
