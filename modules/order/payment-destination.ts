import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

export type Destination = {
  version: string;
  bca: { bank: 'BCA'; accountNumber: string; accountHolder: string };
  qris: { key: string; mime: string; merchant: string; sha256: string };
};
export function signPaymentDestination(value: string) {
  if ((process.env.CONFIG_SECRET?.length || 0) < 32) throw new Error('Payment configuration security unavailable');
  return createHmac('sha256', process.env.CONFIG_SECRET!).update('elite-payment-destination:' + value).digest('hex');
}
export function paymentEnvironmentRevision() {
  return createHash('sha256').update(JSON.stringify(['env', ...['PAYMENT_BCA_ACCOUNT_NUMBER','PAYMENT_BCA_ACCOUNT_HOLDER','PAYMENT_QRIS_KEY','PAYMENT_QRIS_MIME','PAYMENT_QRIS_MERCHANT','PAYMENT_QRIS_SHA256'].map(key => process.env[key] || '')])).digest('hex');
}
const nameValid = (value: unknown): value is string => typeof value === 'string' && value.length >= 2 && value.length <= 100 && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
export function decodePaymentDestination(payload: string, signed: string): Destination {
  if (!/^[a-f0-9]{64}$/.test(signed) || !timingSafeEqual(Buffer.from(signPaymentDestination(payload),'hex'),Buffer.from(signed,'hex'))) throw new Error('Payment destination integrity check failed');
  const d = JSON.parse(payload) as Destination;
  if (typeof d.version !== 'string' || !/^[a-f0-9-]{36}$/.test(d.version) || d.bca?.bank !== 'BCA' || !/^\d{10}$/.test(d.bca.accountNumber) || !nameValid(d.bca.accountHolder) || !/^qris\/[a-f0-9-]{36}$/.test(d.qris?.key) || !['image/png','image/jpeg','image/webp'].includes(d.qris.mime) || !nameValid(d.qris.merchant) || !/^[a-f0-9]{64}$/.test(d.qris.sha256)) throw new Error('Invalid signed payment destination');
  return d;
}
export const paymentOverridesEnabled=()=>process.env.PAYMENT_DESTINATION_OVERRIDE_ENABLED==='1';
export async function paymentOverride() {
  if (!paymentOverridesEnabled()) return null;
  const record = await env.DB.prepare('SELECT payload,signature FROM payment_destination_override WHERE id=1').first<{payload:string;signature:string}>();
  return record ? decodePaymentDestination(record.payload, record.signature) : null;
}
export async function paymentDestinationRevision() { return (await paymentOverride())?.version || paymentEnvironmentRevision(); }
