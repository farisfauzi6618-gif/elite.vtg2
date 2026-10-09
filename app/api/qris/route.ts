import { api,bucket,AppError } from "@/modules/order/order-server";
import { trustedQris } from "@/modules/order/payment-config";
export const GET=()=>api(async()=>{
 const asset=trustedQris();if(!asset)throw new AppError(404,"QRIS belum tersedia.");
 const f=await bucket().get(asset.key);if(!f||f.size<32||f.size>4*1024*1024)throw new AppError(404,"QRIS belum tersedia.");
 const bytes=await f.arrayBuffer(),b=new Uint8Array(bytes);
 const png=b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71&&b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10;
 const jpeg=b[0]===255&&b[1]===216&&b[2]===255;
 const webp=new TextDecoder().decode(b.slice(0,4))==="RIFF"&&new TextDecoder().decode(b.slice(8,12))==="WEBP";
 if(!(asset.mime==="image/png"?png:asset.mime==="image/jpeg"?jpeg:webp))throw new AppError(404,"QRIS belum tersedia.");
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const actual=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 if(actual!==asset.sha256){console.error('Payment QRIS integrity check failed');throw new AppError(503,"QRIS sedang tidak tersedia. Gunakan transfer BCA atau hubungi ELITE.VTG.");}
 const extension=asset.mime==="image/jpeg"?"jpg":asset.mime==="image/webp"?"webp":"png";
 return new Response(bytes,{headers:{"Content-Type":asset.mime,"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Cross-Origin-Resource-Policy":"same-origin","Content-Disposition":"inline; filename=QRIS-ELITE-VTG."+extension}});
});

export const runtime="nodejs";
export const dynamic="force-dynamic";
