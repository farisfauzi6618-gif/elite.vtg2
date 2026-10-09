import { api,owner,originCheck,AppError } from "@/modules/order/order-server";
export const POST=(r:Request)=>api(async()=>{
 originCheck(r);const user=await owner(r);
 console.warn("Payment destination change denied",{actor:user.userId,action:"dashboard_qris_change"});
 throw new AppError(403,"Tujuan pembayaran hanya dapat diubah melalui konfigurasi deployment pemilik.");
});

export const runtime="nodejs";
export const dynamic="force-dynamic";
