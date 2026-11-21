import {FINANCE_POLICY,type Party,type FinanceUnit,type Expense,type Adjustment,type FinanceReport,type PartyResult} from './types';
const MAX=1_000_000_000_000;
export function idr(value:number,signed=false){if(!Number.isSafeInteger(value)||Math.abs(value)>MAX||(!signed&&value<0))throw Error('Nominal harus bilangan bulat IDR dalam batas yang didukung.');return value}
export function sum(values:number[]){return idr(values.reduce((n,v)=>n+idr(v,true),0),true)}
export function bps(kakak:number,adik:number){if(!Number.isInteger(kakak)||!Number.isInteger(adik)||kakak<0||adik<0||kakak>10000||adik>10000||kakak+adik!==10000)throw Error('Persentase Kakak dan Adik harus berjumlah 100%.');return kakak}
/** Largest remainder, stable input order breaks ties; every rupiah is retained. */
export function allocate(amount:number,weights:number[]):number[]{
 idr(amount);weights.forEach(v=>idr(v));if(!weights.length){if(amount)throw Error('Tidak ada penerima alokasi.');return []}
 const total=weights.reduce((n,v)=>n+BigInt(v),BigInt(0));if(total===BigInt(0)){if(amount)throw Error('Bobot alokasi kosong.');return weights.map(()=>0)}
 const parts=weights.map((v,i)=>{const n=BigInt(amount)*BigInt(v);return {i,amount:Number(n/total),remainder:n%total}});
 let remaining=amount-sum(parts.map(p=>p.amount));
 for(const p of [...parts].sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1)){if(!remaining)break;p.amount++;remaining--}
 return parts.map(p=>p.amount);
}
export function splitUnit(net:number,owner:Party|null,kakakBps:number|null){
 idr(net,true);if(net===0)return {kakak:0,adik:0,unallocated:0};
 if(net<0)return owner?{kakak:owner==='KAKAK'?net:0,adik:owner==='ADIK'?net:0,unallocated:0}:{kakak:0,adik:0,unallocated:net};
 if(kakakBps==null)return {kakak:0,adik:0,unallocated:net};bps(kakakBps,10000-kakakBps);
 const [kakak,adik]=allocate(net,[kakakBps,10000-kakakBps]);return {kakak,adik,unallocated:0};
}
export function monthRange(month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<2000||Number(month.slice(0,4))>2100)throw Error('Bulan tidak valid.');
 const [y,m]=month.split('-').map(Number);return {start:Date.UTC(y,m-1,1)-7*3600000,end:Date.UTC(y,m,1)-7*3600000};
}
export function monthAt(at:number){if(!Number.isSafeInteger(at)||at<0)throw Error('Waktu penjualan belum valid.');const value=new Date(at+7*3600000).toISOString().slice(0,7);monthRange(value);return value}
export function dateMonth(date:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Tanggal tidak valid.');monthRange(date.slice(0,7));return date.slice(0,7)}
const emptyParty=():PartyResult=>({positiveProfit:0,capitalOwnerLoss:0,adjustments:0,netResult:0,capitalBasis:0,expenseAdvances:0,entitlement:null});
export function calculateMonth(input:{units:FinanceUnit[];expenses:Expense[];adjustments:Adjustment[];pendingSales?:number;sourceBlockers?:string[]}):FinanceReport{
 const units=[...input.units].sort((a,b)=>a.id.localeCompare(b.id)),expenses=input.expenses.filter(e=>!e.voided),blockers=[...(input.sourceBlockers??[])],parties={KAKAK:emptyParty(),ADIK:emptyParty()};
 const shared=sum(expenses.filter(e=>e.kind==='shared').map(e=>e.amount)),sharedParts=units.length?allocate(shared,units.map(()=>1)):[],direct=new Map(units.map(u=>[u.id,0]));let unallocatedDirect=0;
 for(const expense of expenses){
  idr(expense.amount);if(expense.paid_by!=='BUSINESS')parties[expense.paid_by].expenseAdvances=sum([parties[expense.paid_by].expenseAdvances,expense.amount]);
  if(expense.kind!=='direct')continue;
  const targets=units.filter(u=>u.sale_id===expense.sale_id&&(!expense.unit_id||u.id===expense.unit_id));
  if(!targets.length){unallocatedDirect+=expense.amount;blockers.push('Biaya direct belum mempunyai unit penjualan: '+expense.id);continue}
  const values=allocate(expense.amount,targets.map(()=>1));targets.forEach((u,i)=>direct.set(u.id,sum([direct.get(u.id)!,values[i]])));
 }
 const results=units.map((u,i)=>{
  idr(u.net_revenue);idr(u.gross_revenue);if(u.gross_revenue<u.net_revenue)throw Error('Pendapatan bersih melebihi pendapatan bruto.');
  if(u.cost_basis!=null)idr(u.cost_basis);if(u.kakak_bps!=null)bps(u.kakak_bps,10000-u.kakak_bps);
  if(u.cost_basis==null)blockers.push('HPP belum diisi: '+u.id);if(!u.capital_owner)blockers.push('Pemilik modal belum diisi: '+u.id);if(u.kakak_bps==null)blockers.push('Pembagian laba belum diisi: '+u.id);
  const costs=direct.get(u.id)!,allocation=sharedParts[i]??0,net=u.cost_basis==null?null:sum([u.net_revenue,-u.cost_basis,-costs,-allocation]);
  const split=net==null?{kakak:0,adik:0,unallocated:null}:splitUnit(net,u.capital_owner,u.kakak_bps);
  for(const [key,value] of [['KAKAK',split.kakak],['ADIK',split.adik]] as const){if(value>=0)parties[key].positiveProfit+=value;else parties[key].capitalOwnerLoss+=value}
  if(u.capital_owner&&u.cost_basis!=null)parties[u.capital_owner].capitalBasis+=u.cost_basis;
  return {id:u.id,saleId:u.sale_id,groupId:u.group_id,lotId:u.lot_id,costVersionId:u.cost_version_id,policyVersion:u.policy_version,productId:u.product_id,name:u.product_name,owner:u.capital_owner,gross:u.gross_revenue,revenue:u.net_revenue,cogs:u.cost_basis,direct:costs,shared:allocation,net,...split,kakakBps:u.kakak_bps};
 });
 let revenueAdjustments=0,cogsAdjustments=0,exceptional=0,unallocatedAdjustments=0;
 for(const a of input.adjustments){idr(a.amount,true);idr(a.capital_delta,true);if(a.kind==='revenue')revenueAdjustments+=a.amount;else if(a.kind==='cogs')cogsAdjustments+=a.amount;else exceptional+=a.amount;
  const result=a.kind==='cogs'?-a.amount:a.amount;
  if(a.party==='UNALLOCATED')unallocatedAdjustments+=result;else{parties[a.party].adjustments+=result;parties[a.party].capitalBasis+=a.capital_delta}
 }
 const missingCost=units.some(u=>u.cost_basis==null),gross=sum(units.map(u=>u.gross_revenue)),discount=sum(units.map(u=>u.gross_revenue-u.net_revenue)),revenue=sum([sum(units.map(u=>u.net_revenue)),revenueAdjustments]),knownCogs=sum(units.map(u=>u.cost_basis??0)),cogs=missingCost?null:sum([knownCogs,cogsAdjustments]),totalDirect=sum(expenses.filter(e=>e.kind==='direct').map(e=>e.amount)),unallocatedShared=units.length?0:shared;
 const business=cogs==null?null:sum([revenue,-cogs,-totalDirect,-shared,exceptional]);
 const unallocated=missingCost?null:sum([sum(results.map(u=>u.unallocated??0)),unallocatedAdjustments,-unallocatedShared,-unallocatedDirect]);
 for(const p of Object.values(parties)){p.netResult=sum([p.positiveProfit,p.capitalOwnerLoss,p.adjustments]);p.capitalBasis=idr(p.capitalBasis,true);p.expenseAdvances=idr(p.expenseAdvances);p.entitlement=(missingCost||units.some(u=>!u.capital_owner||u.kakak_bps==null))?null:sum([p.netResult,p.capitalBasis,p.expenseAdvances])}
 if(input.pendingSales)blockers.push('Penjualan belum dipetakan/disinkron: '+input.pendingSales);
 const reconciled=business!=null&&unallocated!=null&&sum([parties.KAKAK.netResult,parties.ADIK.netResult,unallocated])===business&&sum([shared-unallocatedShared,unallocatedShared])===shared;
 if(business!=null&&!reconciled)throw Error('Rekonsiliasi Finance tidak seimbang.');
 return {policy:FINANCE_POLICY,timezone:'Asia/Jakarta',soldUnits:units.length,pendingSales:input.pendingSales??0,grossSales:gross,discounts:discount,refundAndRevenueAdjustments:revenueAdjustments,netMerchandiseRevenue:revenue,knownCogs,cogs,cogsAdjustments,grossProfit:cogs==null?null:sum([revenue,-cogs]),directExpenses:totalDirect,sharedExpenses:shared,allocatedShared:shared-unallocatedShared,unallocatedShared,unallocatedDirect,exceptionalAdjustments:exceptional,businessResult:business,unallocatedResult:unallocated,parties,units:results,blockers:[...new Set(blockers)],reconciled};
}
