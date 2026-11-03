import { timingSafeEqual } from 'node:crypto';
import { boundary, response } from '@/modules/catalog/server';
import { applyWeeklyFeatured } from '@/modules/sales/weekly-featured-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from('Bearer ' + (secret ?? ''));
  if (!secret || expected.length !== provided.length || !timingSafeEqual(expected,provided)) {
    return response({error:'Unauthorized'},401);
  }
  if (process.env.VERCEL_ENV !== 'production' || process.env.WEEKLY_FEATURED_ENABLED !== '1') {
    return response({applied:false, disabled:true});
  }
  return boundary(async () => response(await applyWeeklyFeatured()));
}
