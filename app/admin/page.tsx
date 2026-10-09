import { redirect } from 'next/navigation';
import { requireAdmin } from '@/modules/catalog/server';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dashboard — ELITE.VTG', robots: { index: false, follow: false } };
export default async function Dashboard() {
  let user;
  try { user = await requireAdmin(); } catch { redirect('/admin/login'); }
  return <main className="management"><p className="eyebrow">ELITE.VTG MANAGEMENT</p><h1>Satu tempat untuk toko Anda.</h1><p>Masuk sebagai {user.role === 'owner' ? 'pemilik' : user.displayName}.</p><div className="management-grid"><a href="/admin/katalog"><span>01</span><h2>Katalog & stok</h2><p>Tambah barang, atur foto, ukuran, harga, dan stok.</p></a>{user.role === 'owner' && <><a href="/admin/order"><span>02</span><h2>Pesanan & pembayaran</h2><p>Periksa bukti pembayaran, Telegram, resi, dan pengaturan kurir.</p></a><a href="/ongkir"><span>03</span><h2>Kalkulator ongkir</h2><p>Cek ongkir J&T dan salin ringkasan untuk pelanggan.</p></a></>}</div></main>;
}
