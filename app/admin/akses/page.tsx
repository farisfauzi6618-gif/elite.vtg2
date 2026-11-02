import { requireOwnerUser, requirePrimaryOwner, AuthError } from '@/lib/auth/owner';
import { handoverEnabled } from '@/lib/auth/admin-security';
import Security from './ui';
import '@/components/admin-security.css';
export const dynamic='force-dynamic';
export const metadata={title:'Akses pengelola',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page(){
  await requireOwnerUser('/admin/akses');
  try{await requirePrimaryOwner();}catch(error){if(!(error instanceof AuthError))throw error;return <main className="admin-security"><h1>Khusus pemilik utama</h1><p>Undangan pengelola dan akses pembayaran dibuat oleh pemilik utama.</p><a href="/admin">Kembali ke dashboard</a></main>;}
  if(!handoverEnabled())return <main className="admin-security"><h1>Akses pengelola belum aktif</h1><p>Fitur ini belum diaktifkan pada server.</p><a href="/admin">Kembali ke dashboard</a></main>;
  return <Security/>;
}
