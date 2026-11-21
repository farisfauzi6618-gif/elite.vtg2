import {overview} from './report';
function cell(value:unknown){const v=typeof value==='number'?String(value):String(value??'').replace(/^[=+\-@\t\r]/,"'$&");return '"'+v.replaceAll('"','""')+'"'}
export function csvCell(value:unknown){return cell(value)}
export async function financeCsv(month:string){
 const d=await overview(month),rows:unknown[][]=[['ELITE Finance',month,d.status,d.report.policy],['Jenis','ID','Nama / kategori','Pendapatan bersih','HPP','Direct','Shared','Net unit','Kakak','Adik','Belum dialokasikan']];
 for(const u of d.report.units)rows.push(['unit',u.id,u.name,u.revenue,u.cogs??'BELUM DIISI',u.direct,u.shared,u.net??'UNKNOWN',u.kakak,u.adik,u.unallocated??'UNKNOWN']);
 rows.push([],['Biaya','ID','Kategori','Nominal','Pembayar','Jenis','Status']);for(const e of d.expenses)rows.push(['biaya',e.id,e.category,e.amount,e.paid_by,e.kind,e.voided?'VOID':'ACTIVE']);
 rows.push([],['Koreksi','ID','Jenis','Nominal','Pihak','Koreksi modal','Referensi','Alasan']);for(const a of d.adjustments)rows.push(['koreksi',a.id,a.kind,a.amount,a.party,a.capital_delta,a.reference,a.reason]);
 rows.push([],['Transfer tercatat','ID','Jenis','Nominal','Pihak','Arah','Tanggal','Referensi']);for(const c of d.cash)rows.push(['kas',c.id,c.kind,c.amount,c.party,c.direction,c.paid_on,c.reference]);
 rows.push([],['Business net',d.report.businessResult??'UNKNOWN'],['Kakak net',d.report.parties.KAKAK.netResult],['Adik net',d.report.parties.ADIK.netResult],['Unallocated',d.report.unallocatedResult??'UNKNOWN'],['Reconciled',d.report.reconciled],['Blockers',d.report.blockers.join('; ')],['New source warnings after closing',d.extraWarnings.join('; ')]);
 return new Response('\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename=elite-finance-${month}.csv`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
