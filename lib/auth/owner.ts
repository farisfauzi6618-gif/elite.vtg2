import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createHash, randomBytes } from 'node:crypto';
import { getDatabase } from '../database';
import { verifyPassword } from './password.mjs';

export type OwnerUser = { userId: string; displayName: string; email: string; fullName: null };
export class AuthError extends Error { constructor(public status: number, message: string) { super(message); } }
const COOKIE = 'elite_admin';
const TTL = 12 * 3600000;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const email = () => process.env.ADMIN_EMAIL?.trim().toLowerCase() || '';
const revision = () => digest(email() + ':' + process.env.ADMIN_PASSWORD_HASH + ':' + process.env.AUTH_SECRET);

function tokenFromCookie(cookie: string | null) {
  const value = cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
function configurationReady() {
  return !!(email() && /^scrypt\$16384\$8\$5\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(process.env.ADMIN_PASSWORD_HASH || '') && (process.env.AUTH_SECRET?.length || 0) >= 32);
}

export async function getOwnerFromCookie(cookie: string | null): Promise<OwnerUser | null> {
  const token = tokenFromCookie(cookie);
  if (!token || !configurationReady()) return null;
  const found = await getDatabase().prepare('SELECT hash FROM owner_sessions WHERE hash=? AND credential_version=? AND expires_at>?').bind(digest(token), revision(), Date.now()).first();
  if (!found) return null;
  const address = email();
  return { userId: 'owner:' + digest(address).slice(0, 24), email: address, displayName: address, fullName: null };
}
export async function getOwnerUser(request?: Request) {
  const cookie = request ? request.headers.get('cookie') : (await headers()).get('cookie');
  return getOwnerFromCookie(cookie);
}
export async function requireOwnerUser(returnTo = '/admin') {
  const user = await getOwnerUser();
  if (user) return user;
  redirect('/admin/login?next=' + encodeURIComponent(safeReturnPath(returnTo)));
}
export function safeReturnPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/admin';
  const parsed = new URL(value, 'https://elite.local');
  if (parsed.origin !== 'https://elite.local' || parsed.pathname.startsWith('/admin/login') || parsed.pathname.startsWith('/admin/logout')) return '/admin';
  return parsed.pathname + parsed.search;
}
export const ownerSignOutPath = (_returnTo = '/') => '/admin/logout';

export async function loginOwner(request: Request, input: Record<string, unknown>) {
  if (!configurationReady()) throw new AuthError(503, 'Login pemilik belum dikonfigurasi. Lengkapi pengaturan server.');
  const address = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const ok = await verifyPassword(input.password, process.env.ADMIN_PASSWORD_HASH);
  if (!ok || address !== email()) throw new AuthError(401, 'Email atau kata sandi tidak cocok.');
  const token = randomBytes(32).toString('hex'), now = Date.now(), d = getDatabase();
  const statements = [d.prepare('INSERT INTO owner_sessions(hash,credential_version,created_at,expires_at) VALUES(?,?,?,?)').bind(digest(token), revision(), now, now + TTL), d.prepare('DELETE FROM owner_sessions WHERE expires_at<? OR credential_version!=?').bind(now, revision())];
  const previous = tokenFromCookie(request.headers.get('cookie'));
  if (previous) statements.push(d.prepare('DELETE FROM owner_sessions WHERE hash=?').bind(digest(previous)));
  await d.batch(statements);
  return token;
}
export async function logoutOwner(request: Request) {
  const token = tokenFromCookie(request.headers.get('cookie'));
  if (token) await getDatabase().prepare('DELETE FROM owner_sessions WHERE hash=?').bind(digest(token)).run();
}
export function ownerCookie(request: Request, token = '') {
  return `${COOKIE}=${token}; Path=/; HttpOnly; ${new URL(request.url).protocol === 'https:' ? 'Secure; ' : ''}SameSite=Strict; Max-Age=${token ? TTL / 1000 : 0}`;
}
