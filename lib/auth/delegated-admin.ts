import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getDatabase, getSqlClient } from '@/lib/database';
import { hashPassword, verifyPassword } from './password.mjs';
import { handoverEnabled, ownerCredentialRevision, signAdminValue, verifyAdminValue } from './admin-security';

export class HandoverError extends Error { constructor(public status: number, message: string) { super(message); } }
export type Delegate = { id: string; name: string; email: string; password_hash: string; version: number; active: number; signature: string };
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export const newAdminToken = () => randomBytes(32).toString('hex');
export const delegateValue = (a: Omit<Delegate, 'signature'>) => JSON.stringify([a.id, a.name, a.email, a.password_hash, a.version, a.active]);
export const validDelegate = (a: Delegate) => a.active === 1 && verifyAdminValue('account', delegateValue(a), a.signature);
export function requireHandoverEnabled() {
  if (!handoverEnabled() || process.env.VERCEL_ENV === 'preview') throw new HandoverError(503, 'Fitur serah terima admin belum diaktifkan pada lingkungan ini.');
}
export async function readDelegate() { return getDatabase().prepare('SELECT * FROM delegated_admin WHERE slot=1').first<Delegate>(); }
export async function delegateSession(token: string) {
  if (!handoverEnabled() || process.env.VERCEL_ENV === 'preview') return null;
  const row = await getDatabase().prepare('SELECT a.* FROM delegated_admin_sessions s JOIN delegated_admin a ON a.id=s.admin_id WHERE s.hash=? AND s.expires_at>? AND s.version=a.version AND s.credential_version=?').bind(digest(token), Date.now(), ownerCredentialRevision()).first<Delegate>();
  return row && validDelegate(row) ? { userId: row.id, email: row.email, displayName: row.name, fullName: null, delegated: true as const } : null;
}
export async function loginDelegate(address: string, password: unknown) {
  requireHandoverEnabled();
  const account = await readDelegate();
  const ok = await verifyPassword(password, account?.password_hash);
  if (!account || !validDelegate(account) || account.email !== address || !ok) throw new HandoverError(401, 'Email atau kata sandi tidak cocok.');
  const token = newAdminToken();
  // The signature and version condition also close the revoke-during-password-check race.
  const result = await getDatabase().prepare('INSERT INTO delegated_admin_sessions(hash,admin_id,version,credential_version,expires_at) SELECT ?,id,version,?,? FROM delegated_admin WHERE slot=1 AND id=? AND version=? AND signature=? AND active=1 RETURNING hash').bind(digest(token), ownerCredentialRevision(), Date.now() + 12 * 3600000, account.id, account.version, account.signature).first();
  if (!result) throw new HandoverError(401, 'Akses sudah berubah. Masuk kembali.');
  await getDatabase().prepare('DELETE FROM delegated_admin_sessions WHERE expires_at<?').bind(Date.now()).run();
  return token;
}
export async function deleteDelegateSession(token: string) {
  if (handoverEnabled()) await getDatabase().prepare('DELETE FROM delegated_admin_sessions WHERE hash=?').bind(digest(token)).run();
}
type LinkPayload = { actor: string; name?: string; email?: string; revision?: string };
export async function mintAdminLink(purpose: 'invite' | 'payment', payload: LinkPayload) {
  requireHandoverEnabled();
  const token = newAdminToken(), hash = digest(token), createdAt = Date.now(), expires = createdAt + 15 * 60000;
  const text = JSON.stringify(payload), signature = signAdminValue('link', JSON.stringify([hash, purpose, text, expires]));
  await getDatabase().batch([
    getDatabase().prepare('UPDATE admin_handover_links SET used_at=? WHERE purpose=? AND used_at IS NULL').bind(Date.now(), purpose),
    getDatabase().prepare('INSERT INTO admin_handover_links(hash,purpose,payload,signature,expires_at,created_at) VALUES(?,?,?,?,?,?)').bind(hash, purpose, text, signature, expires, createdAt),
    getDatabase().prepare('INSERT INTO admin_security_audit(id,actor,action,subject,created_at) VALUES(?,?,?,?,?)').bind(randomUUID(), payload.actor, purpose + '_issued', hash, Date.now()),
  ]);
  return { token, expiresAt: expires };
}
export async function readAdminLink(token: unknown, purpose: 'invite' | 'payment') {
  requireHandoverEnabled();
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new HandoverError(400, 'Tautan tidak valid, sudah digunakan, atau kedaluwarsa.');
  const hash = digest(token);
  const row = await getDatabase().prepare('SELECT * FROM admin_handover_links WHERE hash=? AND purpose=? AND used_at IS NULL AND expires_at>?').bind(hash, purpose, Date.now()).first<{ payload: string; signature: string; expires_at: number }>();
  if (!row || !verifyAdminValue('link', JSON.stringify([hash, purpose, row.payload, row.expires_at]), row.signature)) throw new HandoverError(400, 'Tautan tidak valid, sudah digunakan, atau kedaluwarsa.');
  return { hash, signature: row.signature, payload: JSON.parse(row.payload) as LinkPayload };
}
export async function issueDelegateInvite(actor: string, name: unknown, email: unknown) {
  requireHandoverEnabled();
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60 || /[\x00-\x1f\x7f]/.test(name)) throw new HandoverError(400, 'Nama harus 2–60 karakter.');
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HandoverError(400, 'Alamat email belum valid.');
  const address = email.trim().toLowerCase();
  if (address === process.env.ADMIN_EMAIL?.trim().toLowerCase()) throw new HandoverError(400, 'Gunakan email berbeda dari pemilik utama.');
  const existing = await readDelegate();
  if (existing?.active) throw new HandoverError(409, 'Satu akun pengelola penuh sudah aktif. Cabut aksesnya sebelum mengganti penerima.');
  return mintAdminLink('invite', { actor, name: name.trim(), email: address });
}
export async function acceptDelegateInvite(input: Record<string, unknown>) {
  const link = await readAdminLink(input.token, 'invite');
  if (typeof input.email !== 'string' || input.email.trim().toLowerCase() !== link.payload.email) throw new HandoverError(400, 'Email tidak cocok dengan penerima undangan.');
  if (input.password !== input.confirmPassword) throw new HandoverError(400, 'Konfirmasi kata sandi tidak cocok.');
  if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 128) throw new HandoverError(400, 'Kata sandi harus 12–128 karakter.');
  const account = { id: 'delegate:' + randomUUID(), name: link.payload.name!, email: link.payload.email!, password_hash: await hashPassword(input.password), version: 1, active: 1 };
  const tx = await getSqlClient().transaction('write');
  try {
    const consumed = await tx.execute({ sql: 'UPDATE admin_handover_links SET used_at=? WHERE hash=? AND signature=? AND used_at IS NULL AND expires_at>? RETURNING hash', args: [Date.now(), link.hash, link.signature, Date.now()] });
    if (!consumed.rows.length) throw new HandoverError(400, 'Tautan sudah digunakan atau kedaluwarsa.');
    const old = await tx.execute('SELECT active FROM delegated_admin WHERE slot=1');
    if (old.rows[0]?.active) throw new HandoverError(409, 'Akun pengelola penuh sudah aktif.');
    await tx.execute({ sql: 'INSERT INTO delegated_admin(slot,id,name,email,password_hash,version,active,signature,created_at) VALUES(1,?,?,?,?,?,?,?,?) ON CONFLICT(slot) DO UPDATE SET id=excluded.id,name=excluded.name,email=excluded.email,password_hash=excluded.password_hash,version=excluded.version,active=excluded.active,signature=excluded.signature,created_at=excluded.created_at', args: [account.id, account.name, account.email, account.password_hash, account.version, account.active, signAdminValue('account', delegateValue(account)), Date.now()] });
    await tx.execute('DELETE FROM delegated_admin_sessions');
    await tx.execute({ sql: 'INSERT INTO admin_security_audit(id,actor,action,subject,created_at) VALUES(?,?,?,?,?)', args: [randomUUID(), link.payload.actor, 'invite_accepted', account.id, Date.now()] });
    await tx.commit();
  } catch (error) { await tx.rollback(); throw error; } finally { tx.close(); }
}
export async function revokeDelegate(actor: string, expectedId: unknown) {
  requireHandoverEnabled();
  if (typeof expectedId !== 'string') throw new HandoverError(400, 'Pilih akun yang akan dicabut.');
  const tx = await getSqlClient().transaction('write');
  try {
    const changed = await tx.execute({sql:'UPDATE delegated_admin SET active=0,version=version+1 WHERE slot=1 AND id=? AND active=1 RETURNING id',args:[expectedId]});
    if (!changed.rows.length) throw new HandoverError(409, 'Akun sudah berubah. Muat ulang halaman.');
    await tx.execute({sql:'DELETE FROM delegated_admin_sessions WHERE admin_id=?',args:[expectedId]});
    await tx.execute({sql:"UPDATE admin_handover_links SET used_at=? WHERE purpose='invite' AND used_at IS NULL",args:[Date.now()]});
    await tx.execute({sql:'INSERT INTO admin_security_audit(id,actor,action,subject,created_at) VALUES(?,?,?,?,?)',args:[randomUUID(),actor,'delegate_revoked',expectedId,Date.now()]});
    await tx.commit();
  } catch(error) { await tx.rollback(); throw error; } finally { tx.close(); }
}
