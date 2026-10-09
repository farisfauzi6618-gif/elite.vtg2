import { readLimitedText } from '@/modules/order/request-limits';
import { api,json,settings,db,decrypt,telegram,AppError } from "@/modules/order/order-server";
import { verifyTelegramRequest,verifyCallback,type Callback } from "@/modules/order/telegram-actions";
import { confirmPayment,processShipment,shipmentNotice } from "@/modules/order/fulfilment";
export const POST=(req:Request)=>api(async()=>{
 const s=await settings();await verifyTelegramRequest(req,s);if(Number(req.headers.get("content-length")||0)>32000)throw new AppError(413,"Update terlalu besar.");let v:{update_id?:number;callback_query?:Callback;message?:{text?:string;chat:{id:number;type:string;first_name?:string;last_name?:string;username?:string};from?:{id:number;is_bot:boolean}}};try{const raw=await readLimitedText(req,32000);if(raw.length>32000)throw new AppError(413,"Update terlalu besar.");v=JSON.parse(raw);}catch(e){if(e instanceof AppError)throw e;throw new AppError(400,"Update tidak valid.");}
 if(!Number.isSafeInteger(v?.update_id)||v.update_id!<0)throw new AppError(400,"Update tidak valid.");
 const now=Date.now();const claimed=await db().prepare("INSERT INTO telegram_receipts(update_id,state,lease,created_at) VALUES(?,'processing',?,?) ON CONFLICT(update_id) DO UPDATE SET lease=excluded.lease WHERE telegram_receipts.state='processing' AND telegram_receipts.lease<? RETURNING update_id").bind(v.update_id,now+240000,now,now).first();if(!claimed)return json({ok:true});
 try{
  const m=v.message;if(m&&s!.pair_nonce&&s!.pair_expires!>now&&m.text===`/start ${s!.pair_nonce}`&&m.chat.type==="private"&&!m.from?.is_bot&&m.from?.id===m.chat.id){const name=[m.chat.first_name,m.chat.last_name].filter(Boolean).join(" ")+(m.chat.username?` (@${m.chat.username})`:"");await db().prepare("UPDATE settings SET candidate_id=?,candidate_name=? WHERE id=1").bind(String(m.chat.id),name).run();}
  const c=v.callback_query;if(c){
   const token=await decrypt(s!.bot_cipher!);let permitted=true;try{verifyCallback(c,s!);}catch{permitted=false;}
   if(!permitted){await telegram(token,"answerCallbackQuery",{callback_query_id:c.id,text:"Hanya akun pemilik yang dapat melakukan tindakan ini.",show_alert:true}).catch(()=>{});}
   else{
    const match=/^(confirm|retry):(EV-\d{6}-[A-F0-9]{8})$/.exec(c.data||"");
    if(match){const [,action,id]=match;await telegram(token,"answerCallbackQuery",{callback_query_id:c.id,text:action==="confirm"?"Memeriksa pembayaran dan stok pesanan.":"Memeriksa booking dan label yang sama."}).catch(()=>{});
     try{if(action==="confirm")await confirmPayment(id,String(c.from.id),c.message!.message_id);await processShipment(id);}catch(e){await shipmentNotice(id,e instanceof AppError?e.message:"Pemrosesan belum berhasil. Coba lagi.");}
    }else await telegram(token,"answerCallbackQuery",{callback_query_id:c.id,text:"Tombol ini sudah tidak berlaku.",show_alert:true}).catch(()=>{});
   }
  }
  await db().prepare("UPDATE telegram_receipts SET state='done',lease=0 WHERE update_id=?").bind(v.update_id).run();return json({ok:true});
 }catch(e){await db().prepare("UPDATE telegram_receipts SET lease=0 WHERE update_id=?").bind(v.update_id).run();throw e;}
});

export const runtime="nodejs";
export const dynamic="force-dynamic";
