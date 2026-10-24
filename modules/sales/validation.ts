import {z} from 'zod';
import {FITS} from '@/modules/catalog/catalog-types';
import {AppError} from '@/modules/catalog/server';
import {REQUEST_STATUSES,OUTCOMES} from './types';
const text=(max:number)=>z.string().trim().max(max).refine(value=>!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),'Teks tidak valid.');
export const id=z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const optionalId=id.nullable().optional();
const money=z.number().int().min(0).max(1e9).nullable().optional();
const measure=z.number().min(0.1).max(300).nullable().optional();
export function normalizedInstagram(value:string){return value.trim().replace(/^@/,'').toLowerCase()}
export const preferencesSchema=z.object({brand:text(100).optional(),category:text(100).optional(),size:z.string().refine(value=>value===''||FITS.includes(value),'Size tidak dikenal.').optional(),colors:z.array(text(40).refine(value=>value.length>0)).max(8).optional(),budgetMin:money,budgetMax:money,lengthMin:measure,lengthMax:measure,widthMin:measure,widthMax:measure}).strict().superRefine((value,ctx)=>{for(const [min,max] of [['budgetMin','budgetMax'],['lengthMin','lengthMax'],['widthMin','widthMax']] as const)if(value[min]!=null&&value[max]!=null&&value[min]!>value[max]!)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Batas minimum melebihi maksimum.',path:[min]})});
export const leadSchema=z.object({id:optionalId,version:z.number().int().positive().optional(),name:text(100).default(''),instagram:text(31).transform(normalizedInstagram).refine(value=>!value||/^[a-z0-9._]{1,30}$/.test(value),'Username Instagram tidak valid.').default(''),customerId:optionalId,source:z.enum(['Instagram','Website','Other']),contactPreference:z.enum(['MANUAL','INSTAGRAM','WHATSAPP','NONE']).default('MANUAL'),doNotContact:z.boolean().default(false),notes:text(2000).default('')}).strict();
export const requestSchema=z.object({id:optionalId,version:z.number().int().positive().optional(),leadId:id,wanted:text(300).default(''),preferences:preferencesSchema.default({}),notes:text(2000).default(''),status:z.enum(REQUEST_STATUSES).default('OPEN')}).strict();
export const outreachSchema=z.object({id:optionalId,version:z.number().int().positive().optional(),requestId:id,productId:optionalId,groupId:optionalId,draft:text(3000).default(''),notes:text(2000).default(''),outcome:z.enum(OUTCOMES),sentConfirmed:z.boolean().optional(),sentAt:z.number().int().min(0).optional(),orderId:optionalId,confirmAttribution:z.boolean().optional(),unlinkAttribution:z.boolean().optional()}).strict();
export function validated<S extends z.ZodTypeAny>(schema:S,input:unknown):z.output<S>{const result=schema.safeParse(input);if(!result.success)throw new AppError(400,'Isian Sales Intelligence tidak valid. '+result.error.issues[0]?.message);return result.data}
