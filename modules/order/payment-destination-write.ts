import {createHash, randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {getSqlClient} from '@/lib/database';
import {storage} from '@/lib/storage';
import {HandoverError, readAdminLink} from '@/lib/auth/delegated-admin';
import {decodePaymentDestination, paymentDestinationRevision, paymentEnvironmentRevision, paymentOverridesEnabled, signPaymentDestination, type Destination} from './payment-destination';
const nameValid = (value: unknown): value is string => typeof value === 'string' && value.length >= 2 && value.length <= 100 && value === value.trim() && !/[\x00-\x1f\x7f]/.test(value);
export async function replacePaymentDestination(actor: string, form: FormData) {
  if(!paymentOverridesEnabled())throw new HandoverError(503,'Perubahan tujuan pembayaran belum diaktifkan pada server.');
  const link = await readAdminLink(form.get('token'), 'payment');
  if (link.payload.actor !== actor) throw new HandoverError(403, 'Tautan ini dibuat untuk pemilik utama yang berbeda.');
  if (link.payload.revision !== await paymentDestinationRevision()) throw new HandoverError(409, 'Tujuan pembayaran sudah berubah. Buat akses sekali pakai yang baru.');
  const accountNumber = typeof form.get('accountNumber') === 'string' ? String(form.get('accountNumber')).trim() : '';
  const accountHolder = typeof form.get('accountHolder') === 'string' ? String(form.get('accountHolder')).trim() : '';
  const merchant = typeof form.get('merchant') === 'string' ? String(form.get('merchant')).trim() : '';
  if (!/^\d{10}$/.test(accountNumber) || !nameValid(accountHolder) || !nameValid(merchant)) throw new HandoverError(400, 'Lengkapi 10 digit rekening BCA, nama pemilik rekening, dan merchant QRIS.');
  if (form.get('confirmed') !== 'true') throw new HandoverError(400, 'Periksa dan konfirmasikan rekening serta merchant QRIS terlebih dahulu.');
  const file = form.get('file');
  if (!(file instanceof File) || file.size < 32 || file.size > 4*1024*1024) throw new HandoverError(400, 'Gunakan QRIS asli PNG/JPG/WebP, maksimal 4 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let format: string | undefined;
  try { format = (await sharp(bytes,{limitInputPixels:20000000,animated:false}).metadata()).format; }
  catch { throw new HandoverError(400, 'Gambar QRIS tidak dapat dibaca.'); }
  const mime = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : null;
  if (!mime) throw new HandoverError(400, 'QRIS harus berupa PNG, JPG, atau WebP asli.');
  const destination: Destination = { version: randomUUID(), bca: {bank:'BCA',accountNumber,accountHolder}, qris: {key:'qris/'+randomUUID(),mime,merchant,sha256:createHash('sha256').update(bytes).digest('hex')} };
  // A new immutable key preserves the old original. Never overwrite/delete QRIS assets.
  await storage.put(destination.qris.key,bytes,{httpMetadata:{contentType:mime}});
  const payload = JSON.stringify(destination), signed = signPaymentDestination(payload);
  const tx = await getSqlClient().transaction('write');
  try {
    const current = (await tx.execute('SELECT payload,signature FROM payment_destination_override WHERE id=1')).rows[0];
    const revision = current ? decodePaymentDestination(String(current.payload),String(current.signature)).version : paymentEnvironmentRevision();
    if (revision !== link.payload.revision) throw new HandoverError(409, 'Tujuan pembayaran sudah berubah. Buat akses yang baru.');
    const consumed = await tx.execute({sql:'UPDATE admin_handover_links SET used_at=? WHERE hash=? AND signature=? AND used_at IS NULL AND expires_at>? RETURNING hash',args:[Date.now(),link.hash,link.signature,Date.now()]});
    if (!consumed.rows.length) throw new HandoverError(400, 'Tautan sudah digunakan atau kedaluwarsa.');
    await tx.execute({sql:'INSERT INTO payment_destination_override(id,payload,signature,updated_at) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,signature=excluded.signature,updated_at=excluded.updated_at',args:[payload,signed,Date.now()]});
    await tx.execute({sql:'INSERT INTO admin_security_audit(id,actor,action,subject,created_at) VALUES(?,?,?,?,?)',args:[randomUUID(),actor,'payment_destination_changed',destination.version,Date.now()]});
    await tx.commit();
  } catch(error) { await tx.rollback(); throw error; } finally { tx.close(); }
  return {version:destination.version};
}
