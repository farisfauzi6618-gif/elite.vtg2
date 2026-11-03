import { availableGroups, type Product } from '@/modules/catalog/catalog-types';
import { FEATURED_LIMIT } from '@/modules/catalog/featured';
import { orderingLocked } from '@/modules/catalog/product-schedule';
import { groupPricing } from '@/modules/catalog/sale-price';
import { DAY } from './matching';
import type { Signals } from './push';

export const WEEKLY_DISCOUNT_TITLE = 'Promo Featured Mingguan';

export function weeklyPeriod(now: number) {
  // Monday 09:00 WIB (02:00 UTC).
  const monday = Date.UTC(2026, 0, 5, 2);
  return Math.floor((now - monday) / (7 * DAY));
}

export function weeklyFeaturedPlan(products: Product[], signals: Map<string, Signals>, manualSlots: number, now: number, hasTracking = true, protectedGroups = new Set<string>()) {
  const capacity = Math.max(0, FEATURED_LIMIT - manualSlots);
  const rows = products.flatMap(product => {
    if (product.isFeatured || product.status !== 'published' || product.deletedAt || product.soldAt || orderingLocked(product, now)) return [];
    const groups = availableGroups(product).filter(group => (groupPricing(product, group).price ?? 0) > 0);
    if (!groups.length) return [];
    const stock = groups.reduce((sum, group) => sum + (group.qty ?? 0), 0);
    const engagement = signals.get(product.id) ?? {views:0, adds:0, checkouts:0};
    const published = Date.parse(product.publishedAt ?? '');
    const ageDays = Number.isFinite(published) ? Math.floor((now - published) / DAY) : null;
    const discounts = groups.flatMap(group => {
      const price = groupPricing(product, group);
      // Never stack or override a product, color or group promotion.
      if (protectedGroups.has(group.id) || price.sale != null || group.salePrice != null || price.regular == null) return [];
      const reduction = Math.min(Math.floor(price.regular / 10), 50000);
      if (reduction <= 0 || price.regular - reduction < 1000) return [];
      return [{groupId:group.id, regularPrice:price.regular, salePrice:price.regular - reduction, reduction}];
    });
    const quiet = hasTracking && ageDays != null && ageDays >= 30 && engagement.views <= 2 && !engagement.adds && !engagement.checkouts && discounts.length > 0;
    return [{productId:product.id, name:product.name, stock, ageDays, engagement, quiet, discounts}];
  });
  type Row = typeof rows[number];
  type Reason = 'high-interest' | 'old-quiet' | 'high-stock';
  const compareId = (a:Row,b:Row) => a.productId.localeCompare(b.productId);
  const lanes: {reason:Reason; rows:Row[]}[] = [
    {reason:'high-interest', rows:rows.filter(row => row.engagement.views >= 3).sort((a,b) => b.engagement.views - a.engagement.views || compareId(a,b))},
    {reason:'old-quiet', rows:rows.filter(row => row.quiet).sort((a,b) => (b.ageDays ?? 0) - (a.ageDays ?? 0) || a.engagement.views - b.engagement.views || compareId(a,b))},
    {reason:'high-stock', rows:rows.filter(row => row.stock >= 3).sort((a,b) => b.stock - a.stock || compareId(a,b))},
  ];
  const chosen = new Set<string>();
  const plan: (Omit<Row,'quiet'> & {reason:Reason})[] = [];
  while (plan.length < capacity) {
    const start = plan.length;
    for (const lane of lanes) {
      if (plan.length === capacity) break;
      const row = lane.rows.find(candidate => !chosen.has(candidate.productId));
      if (!row) continue;
      chosen.add(row.productId);
      const {quiet, ...item} = row;
      plan.push({...item, reason:lane.reason, discounts:quiet ? row.discounts : []});
    }
    if (plan.length === start) break;
  }
  return plan;
}
