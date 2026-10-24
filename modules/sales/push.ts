import {db,AppError} from '@/modules/catalog/server';
import {availableGroups,type Product} from '@/modules/catalog/catalog-types';
import {transactionPrice} from '@/modules/catalog/sale-price';
import {groupColor} from '@/modules/catalog/color-variants';
import {orderingLocked} from '@/modules/catalog/product-schedule';
import {salesConfig,salesInventory,wantedCandidates,matchInventory} from './inventory';
import {DAY} from './matching';
import type {Match} from './types';
export type Signals={views:number;adds:number;checkouts:number};
export type ProductAction={product_id:string;reviewed_at:number|null;promoted_at:number|null;dismissed_until:number|null};
export function pushProducts(products:Product[],signals:Map<string,Signals>,matches:Match[],actions:Map<string,ProductAction>,now=Date.now()){
 const eligible=products.filter(p=>p.status==='published'&&!p.deletedAt&&!orderingLocked(p,now)&&availableGroups(p).some(g=>(transactionPrice(p,g)??0)>0));
 const listed=(p:Product)=>p.publishedAt?Date.parse(p.publishedAt):NaN;
 const exposure=(p:Product)=>Number.isFinite(listed(p))?Math.max(1,Math.min(30,(now-listed(p))/DAY)):30;
 const rates=eligible.map(p=>((signals.get(p.id)?.views??0)/exposure(p))).sort((a,b)=>a-b),middle=Math.floor(rates.length/2),median=rates.length?(rates.length%2?rates[middle]:(rates[middle-1]+rates[middle])/2):0;
 return eligible.flatMap(product=>{
  const action=actions.get(product.id);if((action?.dismissed_until??0)>now||(action?.promoted_at??0)>now-DAY)return [];
  const groups=availableGroups(product).filter(g=>(transactionPrice(product,g)??0)>0),group=groups[0],color=groupColor(product,group),m=signals.get(product.id)??{views:0,adds:0,checkouts:0};
  const knownAge=Number.isFinite(listed(product)),ageDays=knownAge?Math.max(0,Math.floor((now-listed(product))/DAY)):null,days=exposure(product),viewRate=Number((m.views/days).toFixed(2));
  const productMatches=matches.filter(hit=>hit.productId===product.id&&hit.priority!=='LOW'),requests=new Set(productMatches.map(hit=>hit.requestId)).size,leads=new Set(productMatches.map(hit=>hit.leadId)).size;
  const tags:string[]=[],evidence:string[]=['Tersedia pada varian yang ditautkan.'];let rank=0;
  if(requests){tags.push('CUSTOMER MATCH');rank+=45+Math.min(15,requests*3);evidence.push(`Cocok dengan ${requests} permintaan dari ${leads} lead yang dapat dihubungi.`)}
  if(knownAge&&m.views>=10&&viewRate>=Math.max(1,median*1.5)){tags.push('HIGH INTEREST');rank+=35;evidence.push(`${m.views} sesi melihat produk; ${viewRate} sesi/hari selama ${Number(days.toFixed(1))} hari eksposur pada window ini.`)}
  if(ageDays!==null&&ageDays>=30){tags.push('AGING INVENTORY');rank+=25;evidence.push(`Sudah terbit ${ageDays} hari dan masih tersedia.`)}
  if(ageDays!==null&&ageDays<=7){tags.push('NEW ARRIVAL');rank+=15;evidence.push(`Terbit ${ageDays} hari lalu; beri eksposur awal.`)}
  if(!knownAge)evidence.push('Tanggal terbit belum diketahui; umur dan laju engagement tidak diasumsikan.');
  const incomplete=groups.some(g=>g.lengthCm==null||g.widthCm==null)||!product.condition;
  if(incomplete||(m.views>=20&&m.checkouts>=3)){tags.push('REVIEW REQUIRED');rank+=5;evidence.push(incomplete?'Sebagian kondisi/ukuran aktual perlu ditinjau.':'Ada aktivitas checkout; tinjau listing dan error. Tidak membuktikan alasan pelanggan berhenti.')}
  if(!tags.length){tags.push('BASIC REVIEW');evidence.push('Belum cukup sinyal khusus; tetap dapat dipromosikan berdasarkan kurasi pemilik.')}
  return [{productId:product.id,name:product.name,brand:product.brand,category:product.category,groupId:group.id,color:color?.name??product.color,size:group.fits.join(' / ')||'Belum diketahui',price:transactionPrice(product,group)!,url:'/produk/'+encodeURIComponent(product.id)+(color?'?color='+encodeURIComponent(color.id):''),ageDays,exposureDays:knownAge?Number(days.toFixed(1)):null,viewsPerDay:knownAge?viewRate:null,signals:m,matchingRequests:requests,matchingLeads:leads,tags,evidence,confidence:m.views<10?'Data engagement terbatas — bukan bukti demand tinggi.':'Engagement teramati — bukan probabilitas pembelian.',nextAction:tags.includes('REVIEW REQUIRED')?'Periksa detail listing terlebih dahulu; gunakan produk tersedia yang sesuai untuk Story atau outreach manual.':'Siapkan Story berisi kondisi, ukuran aktual, dan tautan produk; atau draft untuk lead yang cocok.',reviewedAt:action?.reviewed_at??null,promotedAt:action?.promoted_at??null,rank}];
 }).sort((a,b)=>b.rank-a.rank||(b.ageDays??0)-(a.ageDays??0)||a.productId.localeCompare(b.productId)).slice(0,10).map(({rank,...row})=>row);
}
export async function productsToPush(){
 const now=Date.now(),start=now-30*DAY,d=db();
 const [inventory,wanted,config,events,checkoutRows,actionRows]=await Promise.all([salesInventory(),wantedCandidates(),salesConfig(),d.prepare("SELECT product_id,event_name,COUNT(DISTINCT session_id) AS n FROM analytics_events WHERE timestamp>=? AND timestamp<=? AND event_name IN ('product_view','add_to_cart') AND product_id IS NOT NULL GROUP BY product_id,event_name").bind(start,now).all<any>(),d.prepare("SELECT ep.product_id,COUNT(DISTINCT e.session_id) AS n FROM analytics_event_products ep JOIN analytics_events e ON e.id=ep.event_id WHERE e.timestamp>=? AND e.timestamp<=? AND e.event_name='checkout_started' GROUP BY ep.product_id").bind(start,now).all<any>(),d.prepare('SELECT product_id,reviewed_at,promoted_at,dismissed_until FROM sales_product_actions WHERE promoted_at>? OR reviewed_at>? OR dismissed_until>? LIMIT 1000').bind(start,start,now).all<ProductAction>()]);
 const matches=matchInventory(inventory.products,wanted.requests,wanted.leads,config.cooldown_days,now),signals=new Map<string,Signals>();
 for(const row of events.results){const metric=signals.get(row.product_id)??{views:0,adds:0,checkouts:0};if(row.event_name==='product_view')metric.views=Number(row.n);else metric.adds=Number(row.n);signals.set(row.product_id,metric)}
 for(const row of checkoutRows.results){const metric=signals.get(row.product_id)??{views:0,adds:0,checkouts:0};metric.checkouts=Number(row.n);signals.set(row.product_id,metric)}
 return {generatedAt:now,windowDays:30,products:pushProducts(inventory.products,signals,matches,new Map(actionRows.results.map(row=>[row.product_id,row])),now),capped:inventory.capped||wanted.capped,analyzed:{products:inventory.products.length,requests:wanted.requests.length},notes:['Product views, add-to-cart dan checkout memakai sesi unik per produk selama 30 hari.','Beli sekarang tidak wajib melewati keranjang. Tidak tersedia data modal/margin atau penjualan Instagram yang terverifikasi.','Promoted disembunyikan 24 jam; Dismiss disembunyikan 7 hari. Ini catatan internal, tidak mengubah produk.']};
}
export async function recordProductAction(productId:string,action:'review'|'promote'|'dismiss'|'reset',actor:string){
 const found=await db().prepare('SELECT id FROM products WHERE id=? AND deleted_at IS NULL').bind(productId).first();if(!found)throw new AppError(404,'Produk tidak ditemukan.');
 const now=Date.now();await db().prepare(`INSERT INTO sales_product_actions(product_id,reviewed_at,promoted_at,dismissed_until,updated_at,actor) VALUES(?,?,?,?,?,?) ON CONFLICT(product_id) DO UPDATE SET reviewed_at=CASE WHEN ?='review' THEN excluded.reviewed_at ELSE sales_product_actions.reviewed_at END,promoted_at=CASE WHEN ? IN ('promote','reset') THEN excluded.promoted_at ELSE sales_product_actions.promoted_at END,dismissed_until=CASE WHEN ? IN ('dismiss','reset') THEN excluded.dismissed_until ELSE sales_product_actions.dismissed_until END,updated_at=excluded.updated_at,actor=excluded.actor`).bind(productId,action==='review'?now:null,action==='promote'?now:null,action==='dismiss'?now+7*DAY:null,now,actor,action,action,action).run();return {ok:true};
}
