import { api,json,owner } from "@/modules/order/order-server";
import { labelPrintInfo } from "@/modules/order/label-print";
export const GET=(r:Request,ctx:{params:Promise<{id:string}>})=>api(async()=>{await owner(r);return json(await labelPrintInfo((await ctx.params).id));});

export const runtime="nodejs";
export const dynamic="force-dynamic";
