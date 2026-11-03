import type { InStatement, Transaction } from '@libsql/client';
import { getSqlClient } from '@/lib/database';
import { AppError, groupFromRow, productFromRow } from '@/modules/catalog/server';
import { FEATURED_LIMIT } from '@/modules/catalog/featured';
import { reservedQuantitySql } from '@/modules/catalog/reserve-inventory';
import { PAYMENT_SESSION_LIFETIME } from '@/modules/order/customer-orders';
import { DAY } from './matching';
import type { Signals } from './push';
import { WEEKLY_DISCOUNT_TITLE, weeklyFeaturedPlan, weeklyPeriod } from './weekly-featured';

type Plan = ReturnType<typeof weeklyFeaturedPlan>;
type Applied = Plan[number] & { position: number };
type OwnedDiscount = Applied['discounts'][number] & { productId: string };
type Run = { period: number; appliedAt: number; plan: Applied[]; retained: OwnedDiscount[] };

async function latest(tx: Transaction): Promise<Run | null> {
  const row = (await tx.execute('SELECT period, applied_at, plan FROM weekly_featured_runs ORDER BY period DESC LIMIT 1')).rows[0];
  if (!row) return null;
  return {period:Number(row.period), appliedAt:Number(row.applied_at), ...JSON.parse(String(row.plan)) as Pick<Run, 'plan' | 'retained'>};
}

async function prepare(tx: Transaction, previous: Run | null, now: number) {
  const products = (await tx.execute(`
    SELECT p.*, a.dismissed_until, w.period AS weekly_featured_period
    FROM products p LEFT JOIN sales_product_actions a ON a.product_id=p.id
    LEFT JOIN weekly_featured_products w ON w.product_id=p.id
    WHERE p.deleted_at IS NULL AND (p.status='published' OR p.is_featured=1)
    ORDER BY p.id LIMIT 3001
  `)).rows;
  const groups = (await tx.execute(`
    SELECT g.*, ${reservedQuantitySql('g')} AS reserved_qty
    FROM size_groups g JOIN products p ON p.id=g.product_id
    WHERE p.deleted_at IS NULL AND p.status='published' AND g.qty>0 LIMIT 12001
  `)).rows;
  if (products.length > 3000 || groups.length > 12000) {
    throw new AppError(409,'Katalog melampaui batas pemrosesan promo mingguan.');
  }
  const actions = new Map(previous?.plan.map(item => [item.productId,item]));
  const protectedGroups = new Set((await tx.execute({sql:`
    SELECT DISTINCT json_extract(line.value,'$.groupId') AS group_id
    FROM orders o JOIN catalog_checkouts c ON c.id=o.catalog_checkout_id
    JOIN json_each(c.lines_json) line
    WHERE o.status='awaiting_proof' AND o.proof_key IS NULL
      AND COALESCE(o.order_type,'normal')='normal' AND COALESCE(c.order_type,'normal')='normal'
      AND o.created_at>?
  `,args:[now-PAYMENT_SESSION_LIFETIME]})).rows.map(row => String(row.group_id)));
  const ownedDiscounts = previous
    ? [...previous.retained, ...previous.plan.flatMap(item => item.discounts.map(group => ({...group,productId:item.productId})))]
    : [];
  const ownedGroups = new Map(ownedDiscounts.map(group => [group.groupId,group]));
  const byProduct = new Map<string, ReturnType<typeof groupFromRow>[]>();
  for (const row of groups) {
    const group = groupFromRow(row);
    const prior = ownedGroups.get(group.id);
    if (prior && !protectedGroups.has(group.id) && group.salePrice === prior.salePrice && group.discountTitle === WEEKLY_DISCOUNT_TITLE) {
      group.salePrice = null;
      group.discountTitle = null;
    }
    const productId = String(row.product_id);
    const list = byProduct.get(productId) ?? [];
    list.push(group);
    byProduct.set(productId,list);
  }

  let manualSlots = 0;
  const occupied = new Set<number>();
  const candidates = products.flatMap(row => {
    const product = productFromRow(row,byProduct.get(String(row.id)) ?? []);
    const prior = actions.get(product.id);
    if (prior && row.weekly_featured_period === previous?.period) {
      product.isFeatured = false;
    }
    if (product.isFeatured && (product.status !== 'published' || !product.soldAt)) {
      manualSlots++;
      if (product.featuredPosition != null) occupied.add(product.featuredPosition);
    }
    if (prior && !Number(row.is_featured)) return [];
    return Number(row.dismissed_until ?? 0) <= now ? [product] : [];
  });

  const events = await tx.execute({sql:`
    SELECT product_id, event_name, COUNT(DISTINCT session_id) AS sessions
    FROM analytics_events
    WHERE timestamp BETWEEN ? AND ? AND product_id IS NOT NULL AND event_name IN ('product_view','add_to_cart')
    GROUP BY product_id,event_name
    UNION ALL
    SELECT ep.product_id, e.event_name, COUNT(DISTINCT e.session_id) AS sessions
    FROM analytics_event_products ep JOIN analytics_events e ON e.id=ep.event_id
    WHERE e.timestamp BETWEEN ? AND ? AND e.event_name='checkout_started'
    GROUP BY ep.product_id,e.event_name
  `,args:[now-30*DAY,now,now-30*DAY,now]});
  const signals = new Map<string,Signals>();
  for (const row of events.rows) {
    const id = String(row.product_id);
    const item = signals.get(id) ?? {views:0,adds:0,checkouts:0};
    if (row.event_name === 'product_view') item.views = Number(row.sessions);
    if (row.event_name === 'add_to_cart') item.adds = Number(row.sessions);
    if (row.event_name === 'checkout_started') item.checkouts = Number(row.sessions);
    signals.set(id,item);
  }
  // An empty tracking window cannot justify a clearance discount.
  const hasTracking = [...signals.values()].some(value => value.views > 0);
  const plan = weeklyFeaturedPlan(candidates,signals,manualSlots,now,hasTracking,protectedGroups);
  const positions = Array.from({length:FEATURED_LIMIT}, (_,index) => index+1).filter(position => !occupied.has(position));
  return {plan, manualSlots, positions, hasTracking, ownedDiscounts, protectedGroups};
}

export async function previewWeeklyFeatured(now = Date.now()) {
  const tx = await getSqlClient().transaction('read');
  try {
    const previous = await latest(tx);
    const {plan,manualSlots,hasTracking} = await prepare(tx,previous,now);
    return {plan,manualSlots,hasTracking,lastRun:previous};
  } finally { tx.close(); }
}

export async function applyWeeklyFeatured(now = Date.now()) {
  const tx = await getSqlClient().transaction('write');
  try {
    const period = weeklyPeriod(now);
    const previous = await latest(tx);
    if (previous && previous.period >= period) return {applied:false, period};
    const {plan,positions,ownedDiscounts,protectedGroups} = await prepare(tx,previous,now);
    const stamp = new Date(now).toISOString();

    const writes: InStatement[] = [];
    if (previous) {
      for (const item of previous.plan) {
        writes.push({sql:`
          UPDATE products SET is_featured=0, featured_position=NULL, version=version+1, updated_at=?
          WHERE id=? AND EXISTS (SELECT 1 FROM weekly_featured_products w WHERE w.product_id=products.id AND w.period=?)
        `,args:[stamp,item.productId,previous.period]});
        writes.push({sql:"DELETE FROM weekly_featured_products WHERE product_id=? AND period=?",args:[item.productId,previous.period]});
      }
    }
    const retained: OwnedDiscount[] = [];
    for (const group of ownedDiscounts) {
      if (protectedGroups.has(group.groupId)) {
        retained.push(group);
        continue;
      }
      // Invalidate an open editor if a manually pinned product loses its weekly price.
      writes.push({sql:`
        UPDATE products SET version=version+1, updated_at=?
        WHERE id=? AND EXISTS (
          SELECT 1 FROM size_groups WHERE id=? AND product_id=products.id AND sale_price=? AND discount_title=?
        )
      `,args:[stamp,group.productId,group.groupId,group.salePrice,WEEKLY_DISCOUNT_TITLE]});
      writes.push({sql:`
        UPDATE size_groups SET sale_price=NULL, discount_title=NULL, revision=revision+1
        WHERE id=? AND product_id=? AND sale_price=? AND discount_title=?
      `,args:[group.groupId,group.productId,group.salePrice,WEEKLY_DISCOUNT_TITLE]});
    }

    const applied = plan.map((item,index) => ({...item,position:positions[index]}));
    const requiredWrites: number[] = [];
    for (const item of applied) {
      requiredWrites.push(writes.length);
      writes.push({sql:`
        UPDATE products SET is_featured=1, featured_position=?, version=version+1, updated_at=?
        WHERE id=? AND is_featured=0
      `,args:[item.position,stamp,item.productId]});
      writes.push({sql:"INSERT INTO weekly_featured_products(product_id,period) VALUES(?,?)",args:[item.productId,period]});
      for (const group of item.discounts) {
        requiredWrites.push(writes.length);
        writes.push({sql:`
          UPDATE size_groups SET sale_price=?, discount_title=?, revision=revision+1
          WHERE id=? AND product_id=? AND sale_price IS NULL
        `,args:[group.salePrice,WEEKLY_DISCOUNT_TITLE,group.groupId,item.productId]});
      }
    }

    writes.push({sql:'INSERT INTO weekly_featured_runs(period,applied_at,plan) VALUES(?,?,?)',args:[period,now,JSON.stringify({plan:applied,retained})]});
    const results = await tx.batch(writes);
    if (requiredWrites.some(index => results[index].rowsAffected !== 1)) {
      throw new AppError(409,'Produk berubah saat promosi dihitung.');
    }
    await tx.commit();
    return {applied:true, period, products:applied.length};
  } finally { tx.close(); }
}
