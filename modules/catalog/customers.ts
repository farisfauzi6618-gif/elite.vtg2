import { scrypt, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { AppError, db } from '@/modules/catalog/server';
import type { CustomerProfile } from '@/modules/catalog/customer-types';

export const CUSTOMER_COOKIE = 'elite_customer';
const SESSION_MS = 30 * 86400000;
const KDF = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
type Customer = { id: string; name: string; identity: string; email: string | null; phone: string | null; birthday: string | null; password_hash: string };
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
async function digest(value: string) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }

export function customerIdentity(value: unknown) {
  if (typeof value !== 'string' || value.length > 254) throw new AppError(400, 'Isi email atau nomor HP yang valid.');
  const identity = value.trim().toLowerCase();
  if (/^[^\s@<>]{1,64}@[^\s@<>.]+(?:\.[^\s@<>.]+)+$/.test(identity)) return { identity, email: identity, phone: null };
  const digits = identity.replace(/[\s()-]/g, '');
  if (!/^(?:\+62|62|0)\d{8,13}$/.test(digits)) throw new AppError(400, 'Gunakan email atau nomor HP Indonesia yang valid.');
  const phone = digits.startsWith('0') ? '+62' + digits.slice(1) : '+' + digits.replace(/^\+/, '');
  return { identity: phone, email: null, phone };
}
function passwordValue(value: unknown, registering = false) {
  if (typeof value !== 'string' || value.length < (registering ? 12 : 1) || value.length > 128) throw new AppError(400, registering ? 'Kata sandi harus 12–128 karakter.' : 'Isi kata sandi Anda.');
  return value;
}
export function customerBirthday(value: unknown) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(400, 'Tanggal ulang tahun belum valid.');
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || value < '1900-01-01' || value > new Date().toISOString().slice(0, 10)) throw new AppError(400, 'Tanggal ulang tahun belum valid.');
  return value;
}
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 32, KDF, (error, key) => error ? reject(error) : resolve(key)));
}
async function hashPassword(password: string) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return `scrypt$16384$8$5$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
async function passwordMatches(password: string, stored: string) {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts.slice(0, 4).join('$') !== 'scrypt$16384$8$5' || !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{64}$/.test(parts[5])) return false;
  return timingSafeEqual(await derive(password, parts[4]), Buffer.from(parts[5], 'hex'));
}
export function customerProfile(customer: Customer): CustomerProfile {
  return { name: customer.name, identity: customer.identity, email: customer.email, phone: customer.phone, birthday: customer.birthday };
}
function cookieToken(cookie: string | null) {
  const value = cookie?.split(';').map(v => v.trim()).find(v => v.startsWith(CUSTOMER_COOKIE + '='))?.slice(CUSTOMER_COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export async function currentCustomer(cookie: string | null): Promise<Customer | null> {
  const token = cookieToken(cookie);
  if (!token) return null;
  return db().prepare('SELECT c.* FROM customer_sessions s JOIN customers c ON c.id=s.customer_id WHERE s.hash=? AND s.expires_at>?').bind(await digest(token), Date.now()).first<Customer>();
}
async function startSession(customer: Customer, previousCookie: string | null) {
  const token = randomToken(), now = Date.now(), previous = cookieToken(previousCookie);
  const statements = [db().prepare('INSERT INTO customer_sessions(hash,customer_id,created_at,expires_at) VALUES(?,?,?,?)').bind(await digest(token), customer.id, now, now + SESSION_MS)];
  if (previous) statements.push(db().prepare('DELETE FROM customer_sessions WHERE hash=?').bind(await digest(previous)));
  statements.push(db().prepare('DELETE FROM customer_sessions WHERE expires_at<?').bind(now));
  await db().batch(statements);
  return { customer: customerProfile(customer), token };
}
export async function registerCustomer(input: Record<string, unknown>, cookie: string | null) {
  if (typeof input.name !== 'string' || input.name.trim().length < 2 || input.name.trim().length > 120 || /[\x00-\x1f]/.test(input.name)) throw new AppError(400, 'Nama lengkap harus 2–120 karakter.');
  const identity = customerIdentity(input.identity), password = passwordValue(input.password, true), birthday = customerBirthday(input.birthday);
  if (input.consent !== true) throw new AppError(400, 'Setujui penyimpanan data akun terlebih dahulu.');
  const customer: Customer = { id: crypto.randomUUID(), name: input.name.trim(), ...identity, birthday, password_hash: await hashPassword(password) };
  // The unique identity index also handles simultaneous registrations safely.
  const inserted = await db().prepare('INSERT INTO customers(id,name,identity,email,phone,birthday,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(identity) DO NOTHING RETURNING id').bind(customer.id, customer.name, customer.identity, customer.email, customer.phone, birthday, customer.password_hash, Date.now()).first();
  if (!inserted) throw new AppError(409, 'Email atau nomor HP ini sudah terdaftar. Silakan masuk.');
  return startSession(customer, cookie);
}
export async function loginCustomer(input: Record<string, unknown>, cookie: string | null) {
  const { identity } = customerIdentity(input.identity), password = passwordValue(input.password);
  const customer = await db().prepare('SELECT * FROM customers WHERE identity=?').bind(identity).first<Customer>();
  const dummy = 'scrypt$16384$8$5$' + '0'.repeat(32) + '$' + '0'.repeat(64);
  const valid = await passwordMatches(password, customer?.password_hash ?? dummy);
  if (!customer || !valid) throw new AppError(401, 'Email/nomor HP atau kata sandi tidak cocok.');
  return startSession(customer, cookie);
}
export async function logoutCustomer(cookie: string | null) {
  const token = cookieToken(cookie);
  if (token) await db().prepare('DELETE FROM customer_sessions WHERE hash=?').bind(await digest(token)).run();
}
export function customerSessionCookie(request: Request, token = '') {
  return `${CUSTOMER_COOKIE}=${token}; Path=/; HttpOnly; ${new URL(request.url).protocol === 'https:' ? 'Secure; ' : ''}SameSite=Lax; Max-Age=${token ? SESSION_MS / 1000 : 0}`;
}
