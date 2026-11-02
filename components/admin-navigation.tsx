import Link from 'next/link';
import { handoverEnabled } from '@/lib/auth/admin-security';
import { requireAdmin } from '@/modules/catalog/server';
export async function AdminNavigation() {
  let user;
  try { user = await requireAdmin(); } catch { return null; }
  return <nav className="elite-admin-nav" aria-label="Pengelolaan ELITE.VTG"><Link prefetch={false} href="/admin">Dashboard</Link><Link prefetch={false} href="/admin/katalog">Katalog & stok</Link>{user.role === 'owner' && <><Link prefetch={false} href="/admin/order">Pesanan & pembayaran</Link><Link prefetch={false} href="/admin/customers">Data pelanggan</Link><Link prefetch={false} href="/admin/sales">Sales Intelligence</Link><Link prefetch={false} href="/ongkir">Kalkulator ongkir</Link>{handoverEnabled()&&!user.delegated&&<Link prefetch={false} href="/admin/akses">Akses pengelola</Link>}</>}{(user.role==='owner'||user.analyticsAllowed)&&<Link prefetch={false} href="/admin/analytics">Analytics</Link>}<Link prefetch={false} href="/">Lihat toko</Link></nav>;
}
