import {clientIp} from '@/lib/request-security';
import { env } from '@/lib/env';
import { db,AppError } from '@/modules/catalog/server';
export async function publicRate(request:Request,action:string,max:number,scope?:string){
 const window=Math.floor(Date.now()/3600000),ip=clientIp(request);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${process.env.AUTH_SECRET||''}:${scope??ip}:${window}:${action}`));
 const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const row=await db().prepare('INSERT INTO request_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=MIN(count+1,1000) RETURNING count').bind(key,(window+1)*3600000).first<{count:number}>();
 if(!row||row.count>max)throw new AppError(429,'Terlalu banyak percobaan. Coba lagi dalam satu jam.');
 await db().prepare('DELETE FROM request_limits WHERE expires_at<?').bind(Date.now()).run();
}

export const checkoutRate=(request:Request)=>publicRate(request,'checkout',60);
