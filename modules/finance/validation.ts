import {z} from 'zod';
import {EXPENSE_CATEGORIES} from './types';
const id=z.string().trim().min(1).max(100),amount=z.number().int().min(0).max(1_000_000_000_000),positive=amount.min(1),signed=z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000),text=z.string().trim().max(500).refine(v=>!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v),'Teks memuat karakter yang tidak didukung.'),reason=text.min(8),month=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),date=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-\d{2}$/),party=z.enum(['KAKAK','ADIK']),percent=z.number().int().min(0).max(10000);
const base={requestId:z.string().uuid()};
export const mappedLine=z.object({productId:id,groupId:id,quantity:z.number().int().min(1).max(20),unitPrice:positive,stockHistoryId:id.optional()}).strict();
export const financeAction=z.discriminatedUnion('op',[
 z.object({...base,op:z.literal('lot'),groupIds:z.array(id).min(1).max(100),quantity:z.number().int().min(1).max(100000),unitCost:amount,additionalCost:amount,capitalOwner:party,kakakBps:percent,adikBps:percent,acquiredOn:date,mode:z.enum(['inventory','historical']),note:text}).strict(),
 z.object({...base,op:z.literal('lotVersion'),lotIds:z.array(id).min(1).max(100),unitCost:amount.optional(),additionalCost:amount.optional(),capitalOwner:party.optional(),kakakBps:percent,adikBps:percent,note:reason}).strict(),
 z.object({...base,op:z.literal('sync'),month}).strict(),
 z.object({...base,op:z.literal('mapSale'),saleId:id,lines:z.array(mappedLine).min(1).max(20),note:reason}).strict(),
 z.object({...base,op:z.literal('manualSale'),externalRef:text.min(3).max(120),stockHistoryId:id,productId:id,groupId:id,quantity:z.number().int().min(1).max(20),unitPrice:positive,soldOn:date,note:reason}).strict(),
 z.object({...base,op:z.literal('backfillCost'),unitIds:z.array(id).min(1).max(200),lotId:id,note:reason}).strict(),
 z.object({...base,op:z.literal('expense'),id:id.optional(),revision:z.number().int().min(1).optional(),spentOn:date,category:z.enum(EXPENSE_CATEGORIES),amount:positive,paidBy:z.enum(['KAKAK','ADIK','BUSINESS']),kind:z.enum(['shared','direct']),saleId:id.nullable(),unitId:id.nullable(),description:text.min(3),reference:text.max(250)}).strict(),
 z.object({...base,op:z.literal('voidExpense'),id,revision:z.number().int().min(1),note:reason}).strict(),
 z.object({...base,op:z.literal('adjustment'),month,kind:z.enum(['revenue','cogs','exceptional']),amount:signed.refine(v=>v!==0),party:z.enum(['KAKAK','ADIK','UNALLOCATED']),capitalDelta:signed,sourceOrderId:id.nullable(),reference:text.min(3),reason}).strict(),
 z.object({...base,op:z.literal('resolveSource'),saleId:id,note:reason,acknowledgeNoAmountChange:z.boolean(),adjustmentId:id.nullable()}).strict(),
 z.object({...base,op:z.literal('cash'),month,paidOn:date,party,kind:z.enum(['capital','expense','profit']),direction:z.enum(['out','return']),amount:positive,expenseId:id.nullable(),reference:text.min(3),note:reason}).strict(),
 z.object({...base,op:z.literal('close'),month,fingerprint:z.string().regex(/^[a-f0-9]{64}$/),acknowledgeUnallocated:z.boolean(),note:reason}).strict(),
 z.object({...base,op:z.literal('reopen'),month,note:reason}).strict(),
]);
export type FinanceAction=z.infer<typeof financeAction>;
