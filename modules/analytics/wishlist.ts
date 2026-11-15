import {dateRange} from '@/modules/analytics/common';
import {activeColorSql} from '@/modules/catalog/color-variants';
import {reservedQuantitySql} from '@/modules/catalog/reserve-inventory';
import {AppError,db} from '@/modules/catalog/server';

type WishlistRow={
  productId:string;
  name:string;
  brand:string;
  availability:'available'|'reserved'|'sold'|'scheduled'|'unpublished'|'removed';
  browsers:number;
  lastSavedAt:number;
};

const pageSize=25;

export async function wishlistInterest(params:URLSearchParams,range:ReturnType<typeof dateRange>,now=Date.now()){
  const page=Number(params.get('page')??1);
  if(!Number.isSafeInteger(page)||page<1||page>1000){
    throw new AppError(400,'Halaman wishlist tidak valid.');
  }
  const {start,end}=range;
  const {results}=await db().prepare(`
    WITH ranked AS (
      SELECT product_id,COUNT(DISTINCT visitor_id) AS browsers,MAX(timestamp) AS lastSavedAt
      FROM analytics_events
      WHERE event_name='wishlist_saved' AND timestamp>=? AND timestamp<? AND visitor_id IS NOT NULL AND product_id IS NOT NULL
      GROUP BY product_id
      ORDER BY browsers DESC,lastSavedAt DESC,product_id
      LIMIT ? OFFSET ?
    )
    SELECT r.product_id AS productId,COALESCE(p.name,'Produk dihapus') AS name,COALESCE(p.brand,'') AS brand,
      r.browsers,r.lastSavedAt,
      CASE
        WHEN p.id IS NULL OR p.deleted_at IS NOT NULL THEN 'removed'
        WHEN p.status<>'published' THEN 'unpublished'
        WHEN julianday(p.orderable_at)>julianday(?,'unixepoch') THEN 'scheduled'
        WHEN EXISTS(SELECT 1 FROM size_groups g WHERE g.product_id=p.id AND ${activeColorSql('g','p')} AND g.qty>${reservedQuantitySql('g')}) THEN 'available'
        WHEN EXISTS(SELECT 1 FROM size_groups g WHERE g.product_id=p.id AND ${activeColorSql('g','p')} AND g.qty>0) THEN 'reserved'
        ELSE 'sold'
      END AS availability
    FROM ranked r LEFT JOIN products p ON p.id=r.product_id
    ORDER BY r.browsers DESC,r.lastSavedAt DESC,r.product_id
  `).bind(start,Math.min(end,now+1),pageSize+1,(page-1)*pageSize,now/1000).all<WishlistRow>();
  return {view:'wishlist' as const,range,page,hasNext:page<1000&&results.length>pageSize,products:results.slice(0,pageSize)};
}
