import {randomUUID} from 'node:crypto';
import type {InStatement,Transaction} from '@libsql/client';
import {AppError} from '@/modules/catalog/server';
import {bps,dateMonth,sum} from './calculations';
import {rows,one,statements,primary,openPeriod,type Executor,type Actor} from './storage';
import type {FinanceAction} from './validation';
import type {Lot,LotVersion,FinanceUnit} from './types';
export type AvailableLot=Lot&LotVersion&{lot_id:string;used:number};
export async function costPool(d:Executor,groups:string[]){
 if(!groups.length)return [];
 const found:AvailableLot[]=[];
 for(let i=0;i<groups.length;i+=200){const batch=groups.slice(i,i+200);found.push(...await rows<AvailableLot>(d,`SELECT l.*,v.id AS cost_version_id,v.lot_id,v.revision,v.unit_cost,v.additional_cost,v.capital_owner,v.kakak_bps,(SELECT COUNT(*) FROM finance_units u WHERE u.lot_id=l.id) AS used FROM finance_lots l JOIN finance_lot_versions v ON v.lot_id=l.id WHERE l.group_id IN (${batch.map(()=>'?').join(',')}) ORDER BY l.acquired_on,l.id,v.revision DESC LIMIT 10001`,batch));if(found.length>10000)throw new AppError(409,'Terlalu banyak versi lot untuk satu sinkronisasi. Proses dalam kelompok SKU lebih kecil.');}
 return found;
}
export function assignCosts(units:FinanceUnit[],pool:AvailableLot[],atRevision:number,remaining:Map<string,number>,soldAt:number){
 for(const u of units){
  const candidates=pool.filter(l=>l.group_id===u.group_id&&l.mode==='inventory'&&l.acquired_on<=new Date(soldAt+7*3600000).toISOString().slice(0,10)&&l.created_revision<=atRevision&&l.revision<=atRevision),seen=new Set<string>();
  for(const lot of candidates){if(seen.has(lot.lot_id))continue;seen.add(lot.lot_id);const left=remaining.get(lot.lot_id)??lot.quantity-lot.used;if(left<=0)continue;
   remaining.set(lot.lot_id,left-1);u.lot_id=lot.lot_id;u.cost_version_id=(lot as AvailableLot&{cost_version_id:string}).cost_version_id;u.cost_basis=sum([lot.unit_cost,lot.additional_cost]);u.capital_owner=lot.capital_owner;u.kakak_bps=lot.kakak_bps;break;
  }
 }
}
export async function saveLots(tx:Transaction,input:Extract<FinanceAction,{op:'lot'}>,actor:Actor,revision:number){
 bps(input.kakakBps,input.adikBps);dateMonth(input.acquiredOn);if(input.mode==='historical')primary(actor);
 if(input.mode==='historical'&&input.note.trim().length<8)throw new AppError(400,'Lot historis memerlukan alasan pemilik utama.');
 const ids=[...new Set(input.groupIds)],groups=await rows<{id:string;product_id:string;name:string;label:string;qty:number|null}>(tx,`SELECT g.id,g.product_id,g.label,g.qty,p.name FROM size_groups g JOIN products p ON p.id=g.product_id WHERE g.id IN (${ids.map(()=>'?').join(',')}) AND p.deleted_at IS NULL`,ids);
 if(groups.length!==ids.length)throw new AppError(404,'SKU produk tidak ditemukan.');
 const pool=await costPool(tx,ids),created:string[]=[],batch:InStatement[]=[];
 for(const g of groups){if(input.mode==='inventory'){const seen=new Set<string>();let unassigned=0;for(const l of pool){if(l.group_id===g.id&&l.mode==='inventory'&&!seen.has(l.lot_id)){seen.add(l.lot_id);unassigned+=l.quantity-l.used}}
   if(g.qty==null||input.quantity>g.qty-unassigned)throw new AppError(409,'Jumlah lot melebihi stok yang belum dicatat modalnya. Untuk penjualan lama, pemilik utama dapat memakai lot historis.');
  }
  const id=randomUUID(),now=Date.now();created.push(id);
  batch.push({sql:'INSERT INTO finance_lots(id,product_id,group_id,product_name,label,quantity,acquired_on,mode,created_revision,created_at,created_by,note) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',args:[id,g.product_id,g.id,g.name,g.label,input.quantity,input.acquiredOn,input.mode,revision,now,actor.userId,input.note]},
   {sql:'INSERT INTO finance_lot_versions(id,lot_id,revision,unit_cost,additional_cost,capital_owner,kakak_bps,created_at,created_by,note) VALUES(?,?,?,?,?,?,?,?,?,?)',args:[randomUUID(),id,revision,input.unitCost,input.additionalCost,input.capitalOwner,input.kakakBps,now,actor.userId,input.note]});
 }
 await statements(tx,batch);return {result:{lotIds:created},details:{...input,unitCostBasis:sum([input.unitCost,input.additionalCost])}};
}
export async function versionLots(tx:Transaction,input:Extract<FinanceAction,{op:'lotVersion'}>,actor:Actor,revision:number){
 bps(input.kakakBps,input.adikBps);const ids=[...new Set(input.lotIds)],batch:InStatement[]=[];
 const current=await rows<LotVersion&{quantity:number;used:number}>(tx,`SELECT v.*,l.quantity,(SELECT COUNT(*) FROM finance_units u WHERE u.lot_id=l.id) AS used FROM finance_lots l JOIN finance_lot_versions v ON v.lot_id=l.id WHERE l.id IN (${ids.map(()=>'?').join(',')}) AND v.revision=(SELECT MAX(v2.revision) FROM finance_lot_versions v2 WHERE v2.lot_id=l.id)`,ids);
 for(const id of ids){const row=current.find(v=>v.lot_id===id);
  if(!row)throw new AppError(404,'Lot tidak ditemukan.');if(row.quantity<=row.used)throw new AppError(409,'Seluruh unit lot sudah mempunyai snapshot penjualan. Gunakan koreksi keuangan, bukan edit HPP historis.');
  batch.push({sql:'INSERT INTO finance_lot_versions(id,lot_id,revision,unit_cost,additional_cost,capital_owner,kakak_bps,created_at,created_by,note) VALUES(?,?,?,?,?,?,?,?,?,?)',args:[randomUUID(),id,revision,input.unitCost??row.unit_cost,input.additionalCost??row.additional_cost,input.capitalOwner??row.capital_owner,input.kakakBps,Date.now(),actor.userId,input.note]});
 }
 await statements(tx,batch);return {result:{updated:ids.length},details:input};
}
export async function backfillCosts(tx:Transaction,input:Extract<FinanceAction,{op:'backfillCost'}>,actor:Actor){
 primary(actor);const ids=[...new Set(input.unitIds)],units=await rows<FinanceUnit&{month:string}>(tx,`SELECT u.*,s.month FROM finance_units u JOIN finance_sales s ON s.id=u.sale_id WHERE u.id IN (${ids.map(()=>'?').join(',')})`,ids);
 if(units.length!==ids.length||units.some(u=>u.cost_basis!=null))throw new AppError(409,'Pilih hanya unit yang HPP-nya masih kosong.');
 for(const month of new Set(units.map(u=>u.month)))await openPeriod(tx,month);
 const lot=await one<Lot&LotVersion&{used:number;cost_version_id:string}>(tx,'SELECT l.*,v.id AS cost_version_id,v.unit_cost,v.additional_cost,v.capital_owner,v.kakak_bps,(SELECT COUNT(*) FROM finance_units u WHERE u.lot_id=l.id) AS used FROM finance_lots l JOIN finance_lot_versions v ON v.lot_id=l.id WHERE l.id=? ORDER BY v.revision DESC LIMIT 1',[input.lotId]);
 if(!lot||units.some(u=>u.group_id!==lot.group_id)||lot.quantity-lot.used<units.length)throw new AppError(409,'SKU atau sisa unit lot tidak sesuai.');
 await statements(tx,units.map(u=>({sql:'UPDATE finance_units SET lot_id=?,cost_version_id=?,cost_basis=?,capital_owner=?,kakak_bps=? WHERE id=? AND cost_basis IS NULL',args:[input.lotId,lot.cost_version_id,sum([lot.unit_cost,lot.additional_cost]),lot.capital_owner,lot.kakak_bps,u.id]})));
 return {result:{updated:units.length},details:{unitIds:ids,lotId:input.lotId,note:input.note,historicalBackfill:true}};
}
