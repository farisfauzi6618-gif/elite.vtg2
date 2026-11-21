import {bps,dateMonth,monthRange} from './calculations';
import {randomUUID} from 'node:crypto';
import {AppError} from '@/modules/catalog/server';
import {financeAction,type FinanceAction} from './validation';
import {mutate,one,run,digest,primary,openPeriod,type Actor} from './storage';
import {saveLots,versionLots,backfillCosts} from './lots';
import {syncSales,mapSale,recordManualSale,resolveSource} from './sales';
import {saveExpense,voidExpense,addAdjustment,recordCash} from './ledger';
import {periodData} from './report';
export {requireFinance,financeEnabled} from './storage';
export {overview,listLots,catalogChoices,stockChoices,closingArchive} from './report';
export async function financeCommand(actor:Actor,value:unknown){
 const parsed=financeAction.safeParse(value);if(!parsed.success)throw new AppError(400,parsed.error.issues[0]?.message??'Input Finance tidak valid.');
 const input=parsed.data;
 try{if('kakakBps' in input)bps(input.kakakBps,input.adikBps);if('month' in input)monthRange(input.month);for(const key of ['spentOn','paidOn','soldOn','acquiredOn'] as const)if(key in input)dateMonth(String((input as unknown as Record<string,unknown>)[key]));}catch(error){throw new AppError(400,(error as Error).message);}
 return mutate<unknown>(actor,input,async(tx,revision)=>{
  switch(input.op){
   case 'lot':return saveLots(tx,input,actor,revision);
   case 'lotVersion':return versionLots(tx,input,actor,revision);
   case 'sync':return syncSales(tx,input,actor);
   case 'mapSale':return mapSale(tx,input,actor,revision);
   case 'manualSale':return recordManualSale(tx,input,actor,revision);
   case 'backfillCost':return backfillCosts(tx,input,actor);
   case 'expense':return saveExpense(tx,input,actor);
   case 'voidExpense':return voidExpense(tx,input,actor);
   case 'adjustment':return addAdjustment(tx,input,actor);
   case 'resolveSource':return resolveSource(tx,input,actor);
   case 'cash':return recordCash(tx,input,actor);
   case 'close':{
    primary(actor);await openPeriod(tx,input.month);const data=await periodData(tx,input.month);
    if(data.fingerprint!==input.fingerprint)throw new AppError(409,'Laporan berubah sejak ditinjau. Perbarui laporan sebelum finalisasi.');
    if(data.report.blockers.length||!data.report.reconciled||data.report.businessResult==null)throw new AppError(409,'Finalisasi ditahan: lengkapi HPP, kepemilikan, pemetaan, review dan rekonsiliasi dahulu.');
    if(data.report.unallocatedResult&&!input.acknowledgeUnallocated)throw new AppError(409,'Ada saldo belum dialokasikan. Pemilik harus mengakuinya secara eksplisit, tanpa memaksa pembagian ke salah satu pihak.');
    const prior=await one<{version:number}>(tx,'SELECT version FROM finance_periods WHERE month=?',[input.month]),version=(prior?.version??0)+1,id=randomUUID(),snapshot=JSON.stringify(data.report),hash=digest(data.report);
    await run(tx,'INSERT INTO finance_closings(id,month,version,snapshot_json,digest,note,created_at,created_by) VALUES(?,?,?,?,?,?,?,?)',[id,input.month,version,snapshot,hash,input.note,Date.now(),actor.userId]);
    await run(tx,"INSERT INTO finance_periods(month,status,version,closing_id) VALUES(?,'closed',?,?) ON CONFLICT(month) DO UPDATE SET status='closed',version=excluded.version,closing_id=excluded.closing_id",[input.month,version,id]);
    return {result:{closingId:id,version,digest:hash},details:{month:input.month,note:input.note,unallocated:data.report.unallocatedResult}};
   }
   case 'reopen':{
    primary(actor);const period=await one<{status:string;closing_id:string}>(tx,'SELECT status,closing_id FROM finance_periods WHERE month=?',[input.month]);if(period?.status!=='closed')throw new AppError(409,'Bulan ini belum ditutup.');
    await run(tx,"UPDATE finance_periods SET status='open' WHERE month=?",[input.month]);return {result:{reopened:input.month},details:{...input,previousClosingId:period.closing_id,previousSnapshotPreserved:true}};
   }
  }
 });
}
export type {FinanceAction};
