import { api, AppError, body, db, hash, json, originCheck, rate } from '@/modules/order/order-server';

// The existing invoice's random bearer cookie is transferred by the old site.
// Never accept an invoice ID or customer details as proof of ownership.
export const POST = (request: Request) => api(async () => {
  originCheck(request);
  await rate(request, 'invoice-resume', 30);
  const input = await body(request);
  if (Object.keys(input).length !== 1 || typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) {
    throw new AppError(400, 'Tautan invoice belum valid. Buka kembali invoice di situs lama.');
  }
  const order = await db().prepare('SELECT created_at FROM orders WHERE session_hash=? ORDER BY created_at DESC LIMIT 1').bind(await hash(input.token)).first<{created_at:number}>();
  const remaining = order ? Math.floor((order.created_at + 7 * 86400000 - Date.now()) / 1000) : 0;
  if (!order || remaining <= 0 || remaining > 604800) throw new AppError(404, 'Sesi invoice telah berakhir. Hubungi ELITE.VTG dengan nomor invoice Anda.');
  return json({ok:true}, 200, {'Set-Cookie': `elite_order=${input.token}; Path=/; HttpOnly; ${new URL(request.url).protocol === 'https:' ? 'Secure; ' : ''}SameSite=Strict; Max-Age=${remaining}`});
});
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
