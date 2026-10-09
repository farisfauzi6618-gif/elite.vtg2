import { AuthError, loginOwner, logoutOwner, ownerCookie, safeReturnPath } from '@/lib/auth/owner';
import { sameOrigin } from '@/lib/request-security';
import { publicRate } from '@/modules/catalog/request-rate';
import { readLimitedText } from '@/modules/catalog/request-limits';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200, cookie?: string) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) throw new AuthError(403, 'Permintaan harus berasal dari aplikasi ini.');
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AuthError(415, 'Format formulir tidak valid.');
    const raw = await readLimitedText(request, 2048);
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw); if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error(); } catch { throw new AuthError(400, 'Formulir tidak valid.'); }
    if (input.action === 'logout') { await logoutOwner(request); return json({ ok: true }, 200, ownerCookie(request)); }
    await publicRate(request, 'owner-login', 12);
    const token = await loginOwner(request, input);
    return json({ ok: true, next: safeReturnPath(input.next) }, 200, ownerCookie(request, token));
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    if (error && typeof error === 'object' && 'status' in error && 'message' in error) return json({ error: error.message }, Number(error.status));
    console.error('Owner session operation failed');
    return json({ error: 'Login belum tersedia. Periksa konfigurasi dan database aplikasi.' }, 503);
  }
}
