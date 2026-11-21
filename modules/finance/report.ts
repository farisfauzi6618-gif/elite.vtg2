import {getSqlClient} from '@/lib/database';
import {AppError} from '@/modules/catalog/server';
import {calculateMonth,monthRange,sum} from './calculations';
import {rows,one,digest,type Executor} from './storage';
import {pendingSourceIds} from './sales';
import {FINANCE_LIMIT,type FinanceUnit,type FinanceSale,type Expense,type Adjustment,type CashMovement,type FinanceReport,type Party,type Lot,type LotVersion} from './types';
async function periodRecords(d:Executor,month:string){
 const {start,end}=monthRange(month);
 const sales=await rows<FinanceSale&{source_review:number}>(d,`SELECT s.*,CASE WHEN COALESCE(e.review_required,0)=1 OR EXISTS(SELECT 1 FROM finance_stock_claims c JOIN stock_history h ON h.undo_of=c.history_id WHERE c.sale_id=s.id AND h.id IS NOT c.reviewed_undo_id) THEN 1 ELSE 0 END AS source_review FROM finance_sales s LEFT JOIN finance_order_events e ON e.order_id=s.source_order_id WHERE s.month=? ORDER BY s.sold_at,s.id LIMIT ?`,[month,FINANCE_LIMIT+1]);
 const expenses=await rows<Expense>(d,'SELECT * FROM finance_expenses WHERE month=? ORDER BY spent_on,id LIMIT ?',[month,FINANCE_LIMIT+1]);
 const adjustments=await rows<Adjustment>(d,'SELECT * FROM finance_adjustments WHERE month=? ORDER BY created_at,id LIMIT ?',[month,FINANCE_LIMIT+1]);
 const pending=await one<{n:number}>(d,`SELECT COUNT(*) AS n FROM (${pendingSourceIds})`,[start,end,start,end]);
 const blockers=sales.filter(s=>s.needs_review||s.source_review).map(s=>'Sumber perlu review: '+(s.source_order_id??s.external_ref??s.id));
 if([sales,expenses,adjustments].some(a=>a.length>FINANCE_LIMIT))blockers.push('Batas laporan 4.000 baris tercapai. Jangan finalisasi laporan terpotong.');
 return {sales,expenses,adjustments,pending:pending?.n??0,blockers};
}
export async function periodData(d:Executor,month:string){
 const {sales,expenses,adjustments,pending,blockers}=await periodRecords(d,month);
 const units=await rows<FinanceUnit>(d,'SELECT u.* FROM finance_sales s JOIN finance_units u ON u.sale_id=s.id WHERE s.month=? ORDER BY s.sold_at,s.id,u.unit_no LIMIT ?',[month,FINANCE_LIMIT+1]);
 if(units.length>FINANCE_LIMIT)blockers.push('Batas laporan 4.000 unit tercapai. Jangan finalisasi laporan terpotong.');
 const linkedSales=new Set(units.map(u=>u.sale_id)),unmapped=sales.filter(s=>!linkedSales.has(s.id)).length;
 const report=calculateMonth({units:units.slice(0,FINANCE_LIMIT),expenses:expenses.slice(0,FINANCE_LIMIT),adjustments:adjustments.slice(0,FINANCE_LIMIT),pendingSales:pending+unmapped,sourceBlockers:blockers});
 return {report,sales,expenses,adjustments,fingerprint:digest({report,sales,expenses,adjustments})};
}
export function withCash(report:FinanceReport,cash:CashMovement[]){
 const balances={} as Record<Party,{capitalPaid:number;expensePaid:number;profitPaid:number;totalPaid:number;remaining:number|null}>;
 for(const party of ['KAKAK','ADIK'] as const){const forParty=cash.filter(c=>c.party===party),amount=(kind:string)=>sum(forParty.filter(c=>c.kind===kind).map(c=>c.amount*(c.direction==='out'?1:-1))),capitalPaid=amount('capital'),expensePaid=amount('expense'),profitPaid=amount('profit'),totalPaid=sum([capitalPaid,expensePaid,profitPaid]);balances[party]={capitalPaid,expensePaid,profitPaid,totalPaid,remaining:report.parties[party].entitlement==null?null:sum([report.parties[party].entitlement!,-totalPaid])}}
 return balances;
}
export async function overview(month:string){
 monthRange(month);const d=getSqlClient(),period=await one<{status:'open'|'closed';version:number;closing_id:string|null}>(d,'SELECT status,version,closing_id FROM finance_periods WHERE month=?',[month]);
 const cash=await rows<CashMovement>(d,'SELECT * FROM finance_cash_movements WHERE month=? ORDER BY created_at,id LIMIT ?',[month,FINANCE_LIMIT+1]),closings=await rows<{id:string;version:number;digest:string;note:string;created_at:number;created_by:string}>(d,'SELECT id,version,digest,note,created_at,created_by FROM finance_closings WHERE month=? ORDER BY version DESC LIMIT 20',[month]);
 let live:Awaited<ReturnType<typeof periodData>>;const extraWarnings:string[]=[];
 if(period?.status==='closed'){
  const closing=await one<{snapshot_json:string;digest:string}>(d,'SELECT snapshot_json,digest FROM finance_closings WHERE id=?',[period.closing_id]);if(!closing)throw new AppError(503,'Snapshot penutupan tidak ditemukan.');
  const report=JSON.parse(closing.snapshot_json) as FinanceReport;if(digest(report)!==closing.digest)throw new AppError(503,'Checksum snapshot Finance tidak sesuai; laporan ditahan.');
  const records=await periodRecords(d,month);extraWarnings.push(...records.blockers);if(records.pending)extraWarnings.push('Penjualan belum disinkron setelah penutupan: '+records.pending);
  live={report,sales:records.sales,expenses:records.expenses,adjustments:records.adjustments,fingerprint:closing.digest};
 }else live=await periodData(d,month);
 const report=live.report;
 if(cash.length>FINANCE_LIMIT)extraWarnings.push('Daftar pembayaran mencapai batas. Saldo perlu pemeriksaan ekspor terpisah.');
 return {month,status:period?.status==='closed'?'Finalized':report.blockers.length||report.unallocatedResult?'Needs Review':'Draft',period:period??{status:'open',version:0,closing_id:null},report,fingerprint:live.fingerprint,sales:live.sales,expenses:live.expenses,adjustments:live.adjustments,cash:cash.slice(0,FINANCE_LIMIT),balances:cash.length>FINANCE_LIMIT?null:withCash(report,cash),closings,extraWarnings};
}
export async function listLots(params:URLSearchParams){
 const d=getSqlClient(),q=(params.get('q')??'').trim().slice(0,100),group=params.get('groupId')?.slice(0,100)??null,owner=params.get('owner'),offset=Math.floor(Math.min(10000,Math.max(0,Number(params.get('offset'))||0)));
 if(owner&&!['KAKAK','ADIK'].includes(owner))throw new AppError(400,'Pemilik modal tidak valid.');
 return rows<Lot&LotVersion&{used:number;cost_version_id:string}>(d,`SELECT l.*,v.id AS cost_version_id,v.unit_cost,v.additional_cost,v.capital_owner,v.kakak_bps,(SELECT COUNT(*) FROM finance_units u WHERE u.lot_id=l.id) AS used FROM finance_lots l JOIN finance_lot_versions v ON v.lot_id=l.id AND v.revision=(SELECT MAX(revision) FROM finance_lot_versions WHERE lot_id=l.id) WHERE (?='' OR l.product_name LIKE ? OR l.id=?) AND (? IS NULL OR l.group_id=?) AND (? IS NULL OR v.capital_owner=?) ORDER BY l.created_at DESC,l.id LIMIT 101 OFFSET ?`,[q,'%'+q+'%',q,group,group,owner,owner,offset]);
}
export async function catalogChoices(q:string,productId:string|null){
 return rows<{id:string;product_id:string;name:string;shortcode:string;label:string;tag_size:string;fits:string;qty:number|null;color_variant_id:string|null}>(getSqlClient(),`SELECT g.id,g.product_id,g.label,g.tag_size,g.fits,g.qty,g.color_variant_id,p.name,p.shortcode FROM size_groups g JOIN products p ON p.id=g.product_id WHERE p.deleted_at IS NULL AND (? IS NULL OR p.id=?) AND (?='' OR p.name LIKE ? OR p.shortcode LIKE ? OR g.id=?) ORDER BY p.updated_at DESC,p.id,g.sort_order LIMIT 51`,[productId,productId,q,'%'+q+'%','%'+q+'%',q]);
}
export async function stockChoices(groupId:string){
 return rows<{id:string;before_qty:number;after_qty:number;reason:string;created_at:string}>(getSqlClient(),`SELECT h.id,h.before_qty,h.after_qty,h.reason,h.created_at FROM stock_history h WHERE h.group_id=? AND h.before_qty>h.after_qty AND h.undo_of IS NULL AND h.reason NOT LIKE 'Pesanan %' AND h.reason NOT LIKE 'Reserve%' AND NOT EXISTS(SELECT 1 FROM stock_history u WHERE u.undo_of=h.id) AND NOT EXISTS(SELECT 1 FROM finance_stock_claims s WHERE s.history_id=h.id) ORDER BY h.created_at DESC,h.id LIMIT 51`,[groupId]);
}
export async function closingArchive(id:string){
 const r=await one<{snapshot_json:string;digest:string}>(getSqlClient(),'SELECT snapshot_json,digest FROM finance_closings WHERE id=?',[id]);if(!r)throw new AppError(404,'Snapshot tidak ditemukan.');const report=JSON.parse(r.snapshot_json) as FinanceReport;if(digest(report)!==r.digest)throw new AppError(503,'Checksum snapshot tidak sesuai.');return {report,digest:r.digest};
}
