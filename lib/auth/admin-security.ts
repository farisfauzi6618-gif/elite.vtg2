import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const handoverEnabled = () => process.env.ADMIN_HANDOVER_ENABLED === '1';
export const ownerIdentityId = () => 'owner:' + createHash('sha256').update(process.env.ADMIN_EMAIL?.trim().toLowerCase() || '').digest('hex').slice(0, 24);
export const ownerCredentialRevision = () => createHash('sha256').update((process.env.ADMIN_EMAIL?.trim().toLowerCase() || '') + ':' + process.env.ADMIN_PASSWORD_HASH + ':' + process.env.AUTH_SECRET).digest('hex');
export function signAdminValue(purpose: string, value: string) {
  if ((process.env.AUTH_SECRET?.length || 0) < 32) throw new Error('Admin security configuration unavailable');
  return createHmac('sha256', process.env.AUTH_SECRET!).update('elite-admin-handover:' + ownerCredentialRevision() + ':' + purpose + ':' + value).digest('hex');
}
export function verifyAdminValue(purpose: string, value: string, signature: string) {
  return /^[a-f0-9]{64}$/.test(signature) && timingSafeEqual(Buffer.from(signAdminValue(purpose, value), 'hex'), Buffer.from(signature, 'hex'));
}
