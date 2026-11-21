import {randomUUID} from 'node:crypto';
import type {Transaction} from '@libsql/client';
import {AppError} from '@/modules/catalog/server';
import {dateMonth} from './calculations';
import {one,run,openPeriod,primary,type Actor} from './storage';
import type {FinanceAction} from './validation';
import type {Expense} from './types';
export async function saveExpense(tx:Transaction,input:Extract<FinanceAction,{op:'expense'}>,actor:Actor){
 const month=dateMonth(input.spentOn);await openPeriod(tx,month);
 if(input.kind==='shared'&&(input.saleId||input.unitId)||input.kind==='direct'&&!input.saleId)throw new AppError(400,'Biaya direct harus menunjuk penjualan; biaya shared tidak boleh mempunyai tujuan direct.');
 if(input.kind==='direct'){
  if(!await one(tx,'SELECT id FROM finance_sales WHERE id=? AND month=?',[input.saleId,month]))throw new AppError(409,'Biaya direct harus terkait penjualan pada bulan pengakuan yang sama.');
  if(input.unitId&&!await one(tx,'SELECT id FROM finance_units WHERE id=? AND sale_id=?',[input.unitId,input.saleId]))throw new AppError(409,'Unit biaya direct tidak sesuai penjualan.');
 }
 const prior=input.id?await one<Expense>(tx,'SELECT * FROM finance_expenses WHERE id=?',[input.id]):null;
 if(input.id&&!prior)throw new AppError(404,'Biaya tidak ditemukan.');
 if(prior){await openPeriod(tx,prior.month);if(prior.voided||prior.revision!==input.revision)throw new AppError(409,'Biaya berubah atau sudah dibatalkan. Perbarui data.');if(await one(tx,'SELECT id FROM finance_cash_movements WHERE expense_id=? LIMIT 1',[prior.id]))throw new AppError(409,'Biaya sudah mempunyai reimburse; gunakan koreksi berjejak oleh pemilik utama.');}
 const id=prior?.id??randomUUID(),now=Date.now();
 if(prior)await run(tx,'UPDATE finance_expenses SET month=?,spent_on=?,category=?,amount=?,paid_by=?,kind=?,sale_id=?,unit_id=?,description=?,reference=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=?',[month,input.spentOn,input.category,input.amount,input.paidBy,input.kind,input.saleId,input.unitId,input.description,input.reference,now,actor.userId,id,input.revision!]);
 else await run(tx,'INSERT INTO finance_expenses(id,month,spent_on,category,amount,paid_by,kind,sale_id,unit_id,description,reference,created_at,updated_at,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[id,month,input.spentOn,input.category,input.amount,input.paidBy,input.kind,input.saleId,input.unitId,input.description,input.reference,now,now,actor.userId,actor.userId]);
 return {result:{expenseId:id},details:{before:prior,after:input}};
}
export async function voidExpense(tx:Transaction,input:Extract<FinanceAction,{op:'voidExpense'}>,actor:Actor){
 const expense=await one<Expense>(tx,'SELECT * FROM finance_expenses WHERE id=?',[input.id]);if(!expense)throw new AppError(404,'Biaya tidak ditemukan.');await openPeriod(tx,expense.month);
 if(expense.revision!==input.revision||expense.voided)throw new AppError(409,'Biaya berubah atau sudah dibatalkan.');if(await one(tx,'SELECT id FROM finance_cash_movements WHERE expense_id=? LIMIT 1',[expense.id]))throw new AppError(409,'Biaya mempunyai reimburse. Gunakan koreksi berjejak oleh pemilik utama.');
 await run(tx,'UPDATE finance_expenses SET voided=1,revision=revision+1,updated_at=?,updated_by=? WHERE id=?',[Date.now(),actor.userId,expense.id]);return {result:{voided:expense.id},details:{before:expense,note:input.note}};
}
export async function addAdjustment(tx:Transaction,input:Extract<FinanceAction,{op:'adjustment'}>,actor:Actor){
 primary(actor);await openPeriod(tx,input.month);if(input.party==='UNALLOCATED'&&input.capitalDelta)throw new AppError(400,'Koreksi hak modal memerlukan pihak yang jelas.');
 if(input.sourceOrderId&&!await one(tx,'SELECT id FROM orders WHERE id=?',[input.sourceOrderId]))throw new AppError(404,'Referensi order koreksi tidak ditemukan.');
 const id=randomUUID();await run(tx,'INSERT INTO finance_adjustments(id,month,kind,amount,party,capital_delta,source_order_id,reference,reason,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[id,input.month,input.kind,input.amount,input.party,input.capitalDelta,input.sourceOrderId,input.reference,input.reason,Date.now(),actor.userId]);return {result:{adjustmentId:id},details:input};
}
export async function recordCash(tx:Transaction,input:Extract<FinanceAction,{op:'cash'}>,actor:Actor){
 primary(actor);dateMonth(input.paidOn);const period=await one<{status:string}>(tx,'SELECT status FROM finance_periods WHERE month=?',[input.month]);
 if(input.kind!=='expense'&&period?.status!=='closed')throw new AppError(409,'Catat pengembalian modal/bagi laba setelah bulan target difinalisasi. Ini hanya pencatatan transfer yang sudah dilakukan.');
 if(input.expenseId){const e=await one<Expense>(tx,'SELECT * FROM finance_expenses WHERE id=?',[input.expenseId]);if(!e||e.voided||e.month!==input.month||e.paid_by!==input.party||input.kind!=='expense')throw new AppError(409,'Referensi reimburse tidak sesuai biaya, pembayar atau bulan target.');}
 const id=randomUUID();await run(tx,'INSERT INTO finance_cash_movements(id,month,paid_on,party,kind,direction,amount,expense_id,reference,note,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[id,input.month,input.paidOn,input.party,input.kind,input.direction,input.amount,input.expenseId,input.reference,input.note,Date.now(),actor.userId]);
 return {result:{cashMovementId:id,moneyTransferredBySystem:false},details:input};
}
