import { requireAdmin } from '@/modules/catalog/server';
export async function AdminNavigation() {
  let user;
  try { user = await requireAdmin(); } catch { return null; }
  return <nav className="elite-admin-nav" aria-label="Pengelolaan ELITE.VTG"><a href="/admin">Dashboard</a><a href="/admin/katalog">Katalog & stok</a>{user.role === 'owner' && <><a href="/admin/order">Pesanan & pembayaran</a><a href="/ongkir">Kalkulator ongkir</a></>}<a href="/">Lihat toko</a></nav>;
}
