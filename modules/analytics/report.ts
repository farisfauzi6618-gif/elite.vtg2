import {activeColorSql} from '@/modules/catalog/color-variants';
import {reservedQuantitySql} from '@/modules/catalog/reserve-inventory';
import {checkoutFlowReport} from './checkout-flow';
import {db} from '@/modules/catalog/server';
import {dateRange,STAGES,STAGE_LABELS,SOURCES,percent} from './common';
const validCompleted="e.event_name='order_completed' AND o.payment_state='payment_confirmed' AND o.status NOT IN ('cancelled','expired','refunded','failed')";
export async function analyticsReport(params:URLSearchParams,now=Date.now()){
 const range=dateRange(params,now),d=db(),args=[range.start,range.end],view=params.get('view')||'all';
 const overview=view==='all'||view==='overview',productView=view==='all'||view==='products',searchView=view==='all'||view==='search',trafficView=view==='all'||view==='traffic';
 const empty={results:[]};
 const [counts,orders,products,searches,zeros,trafficRows,errors,config]=await Promise.all([
  !overview?empty:d.prepare(`SELECT e.event_name,COUNT(DISTINCT e.visitor_id) AS visitors FROM analytics_events e LEFT JOIN orders o ON o.id=e.order_id WHERE e.timestamp>=? AND e.timestamp<? AND (e.event_name!='order_completed' OR (${validCompleted})) GROUP BY e.event_name`).bind(...args).all<{event_name:string;visitors:number}>(),
  !overview?null:d.prepare(`SELECT COUNT(*) AS n,COALESCE(SUM(o.total),0) AS revenue,COALESCE(SUM(COALESCE(o.item_amount,o.total-COALESCE(o.shipping_amount,0)-COALESCE(o.shipping_protection_fee,0))),0) AS merchandiseRevenue,COALESCE(SUM(o.shipping_amount),0) AS shippingRevenue,COALESCE(SUM(o.shipping_protection_fee),0) AS protectionRevenue FROM analytics_events e JOIN orders o ON o.id=e.order_id WHERE e.timestamp>=? AND e.timestamp<? AND ${validCompleted}`).bind(...args).first<{n:number;revenue:number;merchandiseRevenue:number;shippingRevenue:number;protectionRevenue:number}>(),
  !productView?empty:d.prepare(`WITH metrics AS (
   SELECT e.product_id AS pid,e.event_name,COUNT(*) AS n FROM analytics_events e WHERE e.timestamp>=? AND e.timestamp<? AND e.product_id IS NOT NULL GROUP BY e.product_id,e.event_name
   UNION ALL SELECT p.product_id,e.event_name,COUNT(*) AS n FROM analytics_event_products p JOIN analytics_events e ON e.id=p.event_id LEFT JOIN orders o ON o.id=e.order_id WHERE e.timestamp>=? AND e.timestamp<? AND (e.event_name='checkout_started' OR (${validCompleted})) GROUP BY p.product_id,e.event_name
  ) SELECT p.id,p.shortcode,p.name,p.published_at AS listedAt,p.sold_at AS soldAt,CASE
   WHEN p.deleted_at IS NOT NULL THEN 'Deleted' WHEN p.status!='published' THEN 'Draft'
   WHEN julianday(p.orderable_at)>julianday(?) THEN 'Scheduled'
   WHEN EXISTS(SELECT 1 FROM size_groups g WHERE g.product_id=p.id AND ${activeColorSql('g','p')} AND g.qty-${reservedQuantitySql('g')}>0) THEN 'Available'
   WHEN EXISTS(SELECT 1 FROM size_groups g WHERE g.product_id=p.id AND ${activeColorSql('g','p')} AND ${reservedQuantitySql('g')}>0) THEN 'Reserved'
   WHEN EXISTS(SELECT 1 FROM size_groups g WHERE g.product_id=p.id AND ${activeColorSql('g','p')}) AND NOT EXISTS(SELECT 1 FROM size_groups g WHERE g.product_id=p.id AND ${activeColorSql('g','p')} AND (g.qty IS NULL OR g.qty!=0)) THEN 'Sold'
   ELSE 'Unavailable' END AS status,
  COALESCE(SUM(CASE WHEN m.event_name='product_view' THEN m.n END),0) AS views,
  COALESCE(SUM(CASE WHEN m.event_name='add_to_cart' THEN m.n END),0) AS adds,
  COALESCE(SUM(CASE WHEN m.event_name='checkout_started' THEN m.n END),0) AS checkouts,
  COALESCE(SUM(CASE WHEN m.event_name='order_completed' THEN m.n END),0) AS completed
  FROM products p LEFT JOIN metrics m ON m.pid=p.id WHERE p.status='published' OR m.pid IS NOT NULL GROUP BY p.id ORDER BY views DESC,adds DESC,p.id`).bind(...args,...args,new Date(now).toISOString()).all(),
  !searchView?empty:d.prepare("SELECT search_query AS query,COUNT(*) AS count,ROUND(AVG(result_count),1) AS results,MAX(timestamp) AS lastSearched FROM analytics_events WHERE event_name='search' AND timestamp>=? AND timestamp<? GROUP BY search_query ORDER BY count DESC,lastSearched DESC LIMIT 100").bind(...args).all(),
  !searchView?empty:d.prepare("SELECT search_query AS query,COUNT(*) AS count,0 AS results,MAX(timestamp) AS lastSearched FROM analytics_events WHERE event_name='search' AND result_count=0 AND timestamp>=? AND timestamp<? GROUP BY search_query ORDER BY count DESC,lastSearched DESC LIMIT 100").bind(...args).all(),
  !trafficView?empty:d.prepare(`SELECT e.traffic_source AS source,COUNT(DISTINCT CASE WHEN e.event_name='visit' THEN e.visitor_id END) AS visitors,SUM(CASE WHEN ${validCompleted} THEN 1 ELSE 0 END) AS orders,COALESCE(SUM(CASE WHEN ${validCompleted} THEN o.total ELSE 0 END),0) AS revenue FROM analytics_events e LEFT JOIN orders o ON o.id=e.order_id WHERE e.timestamp>=? AND e.timestamp<? GROUP BY e.traffic_source`).bind(...args).all(),
  !overview?empty:d.prepare("SELECT error_code AS code,COUNT(*) AS count,MAX(timestamp) AS lastSeen FROM analytics_events WHERE event_name='error' AND timestamp>=? AND timestamp<? GROUP BY error_code ORDER BY lastSeen DESC").bind(...args).all(),
  d.prepare('SELECT started_at FROM analytics_config WHERE id=1').first<{started_at:number}>()
 ]);
 const c=Object.fromEntries(counts.results.map(r=>[r.event_name,Number(r.visitors)]));
 const funnel=STAGES.map((key,i)=>{const count=c[key]||0,previous=i?c[STAGES[i-1]]||0:count;return {key,label:STAGE_LABELS[i],count,conversion:i?previous?percent(count,previous):null:100,drop:i?previous?Math.max(0,100-percent(count,previous)):null:0}});
 const biggest=[...funnel.slice(1)].filter(f=>f.drop!==null).sort((a,b)=>(b.drop??0)-(a.drop??0))[0];
 const productRows=products.results.map((p:any)=>({...p,addRate:percent(Number(p.adds),Number(p.views))}));
 return {view,generatedAt:now,checkoutFlow:overview?await checkoutFlowReport(range.start,range.end):null,range,startedAt:config?.started_at??now,kpis:{visitors:c.visit||0,completedOrders:orders?.n||0,revenue:orders?.revenue||0,merchandiseRevenue:orders?.merchandiseRevenue||0,shippingRevenue:orders?.shippingRevenue||0,protectionRevenue:orders?.protectionRevenue||0,conversion:percent(orders?.n||0,c.visit||0),addRate:percent(c.add_to_cart||0,c.product_view||0),biggestDrop:biggest?{label:biggest.label,percent:biggest.drop}:null},funnel,products:productRows,leaderboards:{viewed:productRows.filter(p=>p.views>0).slice(0,5),added:[...productRows].filter(p=>p.adds>0).sort((a,b)=>b.adds-a.adds||b.views-a.views).slice(0,5),interest:[...productRows].filter(p=>p.status==='Available'&&(p.views>0||p.adds>0)).sort((a,b)=>b.adds-a.adds||b.views-a.views).slice(0,5)},search:searches.results,zeroSearch:zeros.results,traffic:SOURCES.map(source=>{const r:any=trafficRows.results.find((r:any)=>r.source===source)||{visitors:0,orders:0,revenue:0};return {source,visitors:Number(r.visitors),orders:Number(r.orders),revenue:Number(r.revenue),conversion:percent(Number(r.orders),Number(r.visitors))}}),errors:errors.results};
}
export type AnalyticsReport=Awaited<ReturnType<typeof analyticsReport>>;
