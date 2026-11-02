import { requireOwnerUser, requirePrimaryOwner, AuthError } from '@/lib/auth/owner';
import { paymentConfig } from '@/modules/order/payment-config';
import { handoverEnabled } from '@/lib/auth/admin-security';
import PaymentEditor from './ui';
import '@/components/admin-security.css';
export const dynamic='force-dynamic';
export const metadata={title:'Ubah tujuan pembayaran',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page(){
  await requireOwnerUser('/admin/akses');
  try{await requirePrimaryOwner();}catch(error){if(!(error instanceof AuthError))throw error;return <main className="admin-security"><h1>Khusus pemilik utama</h1><p>Masuk dengan akun utama untuk mengubah rekening dan QRIS.</p><a href="/admin">Kembali ke dashboard</a></main>;}
  if(!handoverEnabled())return <main className="admin-security"><h1>Pengaturan sekali pakai belum aktif</h1><a href="/admin">Kembali ke dashboard</a></main>;
  return <PaymentEditor initial={await paymentConfig()}/>;
}
