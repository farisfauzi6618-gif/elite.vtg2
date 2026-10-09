import { requireOwnerUser } from '@/lib/auth/owner';
import { AdminNavigation } from '@/components/admin-navigation';
import Calculator from './calculator';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kalkulator ongkir — ELITE.VTG', robots: { index: false, follow: false } };
export default async function Page() { await requireOwnerUser('/ongkir'); return <div data-section="shipping"><AdminNavigation /><Calculator /></div>; }
