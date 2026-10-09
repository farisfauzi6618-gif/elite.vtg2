import { getDatabase } from './database';
import { storage } from './storage';

export function siteOrigin() {
  const explicit = process.env.SITE_ORIGIN?.trim();
  const url = explicit || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000');
  const origin = new URL(url);
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('SITE_ORIGIN must be an origin without a path.');
  if (process.env.VERCEL && origin.protocol !== 'https:') throw new Error('SITE_ORIGIN must use HTTPS on Vercel.');
  return origin.origin;
}

type Env = {
  DB: ReturnType<typeof getDatabase>; BUCKET: typeof storage;
  SITE_ORIGIN: string; ADMIN_EMAIL: string | undefined; OWNER_EMAIL: string | undefined;
  CONFIG_SECRET: string | undefined; TEAM_ACCESS_SECRET: string | undefined;
  RAJAONGKIR_CONFIG_SECRET: string | undefined; RAJAONGKIR_API_KEY: string | undefined;
  INSTAGRAM_ACCESS_TOKEN: string | undefined; INSTAGRAM_USER_ID: string | undefined;
  INSTAGRAM_API_VERSION: string | undefined; KIRIMINAJA_WEBHOOK_TOKEN: string | undefined;
  PAYMENT_BCA_ACCOUNT_NUMBER: string | undefined; PAYMENT_BCA_ACCOUNT_HOLDER: string | undefined;
  PAYMENT_QRIS_KEY: string | undefined; PAYMENT_QRIS_MIME: string | undefined;
  PAYMENT_QRIS_MERCHANT: string | undefined; PAYMENT_QRIS_SHA256: string | undefined;
};
// Lazy access keeps builds independent of production secrets or database calls.
export const env = new Proxy({} as Env, { get(_target, name: string) {
  if (name === 'DB') return getDatabase();
  if (name === 'BUCKET') return storage;
  if (name === 'SITE_ORIGIN') return siteOrigin();
  if (name === 'OWNER_EMAIL') return process.env.ADMIN_EMAIL;
  return process.env[name];
} });
