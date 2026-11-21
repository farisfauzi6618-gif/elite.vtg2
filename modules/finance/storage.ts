import {createHash} from 'node:crypto';
import type {Client,InValue,InStatement,Transaction} from '@libsql/client';
import {getSqlClient} from '@/lib/database';
import {AppError,requireOwner} from '@/modules/catalog/server';
import {monthRange} from './calculations';
export type Executor=Pick<Client,'execute'>;
export type Actor={userId:string;delegated?:true};
export const financeEnabled=()=>process.env.ELITE_FINANCE_ENABLED==='1';
export const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export async function rows<T>(d:Executor,sql:string,args:InValue[]=[]){return (await d.execute({sql,args})).rows as unknown as T[]}
export async function one<T>(d:Executor,sql:string,args:InValue[]=[]){return (await rows<T>(d,sql,args))[0]??null}
export async function run(d:Executor,sql:string,args:InValue[]=[]){return d.execute({sql,args})}
export async function statements(tx:Transaction,values:InStatement[]){for(let i=0;i<values.length;i+=200)await tx.batch(values.slice(i,i+200))}
export function primary(actor:Actor){if(actor.delegated)throw new AppError(403,'Tindakan Finance ini hanya untuk pemilik utama.');}
export async function requireFinance(request?:Request){
 const actor=await requireOwner(request);if(!financeEnabled())throw new AppError(503,'ELITE Finance belum diaktifkan pada lingkungan ini.');
 try{await getSqlClient().execute('SELECT policy_version FROM finance_config WHERE id=1')}catch{throw new AppError(503,'Skema Finance belum tersedia. Aktivasi memerlukan pemeriksaan migrasi oleh pemilik.');}
 return actor;
}
export async function openPeriod(d:Executor,month:string){monthRange(month);if((await one<{status:string}>(d,'SELECT status FROM finance_periods WHERE month=?',[month]))?.status==='closed')throw new AppError(409,'Bulan sudah ditutup. Gunakan koreksi pada bulan terbuka atau buka ulang dengan persetujuan pemilik utama.');}
export async function mutate<T>(actor:Actor,input:{requestId:string;op:string},work:(tx:Transaction,revision:number)=>Promise<{result:T;details?:unknown}>):Promise<T>{
 const tx=await getSqlClient().transaction('write'),requestHash=digest(input);
 try{
  const prior=await one<{actor:string;request_hash:string;result_json:string}>(tx,'SELECT actor,request_hash,result_json FROM finance_audit WHERE id=?',[input.requestId]);
  if(prior){if(prior.actor!==actor.userId||prior.request_hash!==requestHash)throw new AppError(409,'Identitas permintaan telah dipakai untuk perubahan berbeda.');await tx.commit();return JSON.parse(prior.result_json) as T;}
  const config=await one<{revision:number}>(tx,'UPDATE finance_config SET revision=revision+1 WHERE id=1 RETURNING revision');if(!config)throw new AppError(503,'Konfigurasi Finance belum tersedia.');
  const {result,details}=await work(tx,config.revision);
  await run(tx,'INSERT INTO finance_audit(id,action,actor,request_hash,details_json,result_json,created_at) VALUES(?,?,?,?,?,?,?)',[input.requestId,input.op,actor.userId,requestHash,JSON.stringify(details??{}),JSON.stringify(result),Date.now()]);
  await tx.commit();return result;
 }catch(error){await tx.rollback();throw error}finally{tx.close()}
}
