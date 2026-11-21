import {boundary,response,AppError} from '@/modules/catalog/server';
import {readLimitedText} from '@/modules/catalog/request-limits';
import {requireFinance,financeCommand,overview,listLots,catalogChoices,stockChoices,closingArchive} from '@/modules/finance/server';
import {one} from '@/modules/finance/storage';
import {getSqlClient} from '@/lib/database';
import {monthRange} from '@/modules/finance/calculations';
import {financeCsv} from '@/modules/finance/export';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const GET=(request:Request)=>boundary(async()=>{
 const actor=await requireFinance(request),p=new URL(request.url).searchParams,view=p.get('view')??'overview',month=p.get('month')??new Date(Date.now()+7*3600000).toISOString().slice(0,7);
 if(view==='overview'||view==='export'){try{monthRange(month)}catch{throw new AppError(400,'Bulan Finance tidak valid.');}}
 if(view==='overview')return response({...await overview(month),primary:!actor.delegated});
 if(view==='lots')return response({lots:await listLots(p)});
 if(view==='catalog')return response({groups:await catalogChoices((p.get('q')??'').slice(0,100),p.get('productId'))});
 if(view==='stock')return response({history:await stockChoices((p.get('groupId')??'').slice(0,100))});
 if(view==='source'){const source=await one(getSqlClient(),'SELECT o.id,o.quantity,o.item_amount,o.item_subtotal,o.discount_amount,o.catalog_checkout_id,o.catalog_items_json FROM finance_sales s JOIN orders o ON o.id=s.source_order_id WHERE s.id=?',[(p.get('saleId')??'').slice(0,100)]);if(!source)throw new AppError(404,'Sumber penjualan tidak ditemukan.');return response({source});}
 if(view==='closing')return response(await closingArchive((p.get('id')??'').slice(0,100)));
 if(view==='export')return financeCsv(month);
 throw new AppError(400,'Tampilan Finance tidak valid.');
});
export const POST=(request:Request)=>boundary(async()=>{
 const actor=await requireFinance(request);let value:unknown;try{value=JSON.parse(await readLimitedText(request,65536))}catch(error){if(error instanceof AppError)throw error;throw new AppError(400,'Input Finance harus berupa JSON yang valid.');}
 return response(await financeCommand(actor,value));
});
