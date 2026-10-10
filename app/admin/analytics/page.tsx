import {requireAnalytics} from '@/modules/analytics/server';
import {AppError} from '@/modules/catalog/server';
import {requireOwnerUser} from '@/lib/auth/owner';
import Analytics from './ui';
export const dynamic='force-dynamic';
export const metadata={title:'Website Analytics',robots:{index:false,follow:false}};
export default async function Page(){try{await requireAnalytics()}catch(e){if(e instanceof AppError&&e.status===401)await requireOwnerUser('/admin/analytics');return <main className="catalog-shell"><h1>Akses Analytics terbatas</h1><p>{e instanceof AppError?e.message:'Akses belum tersedia.'}</p><a className="button secondary" href="/admin/katalog">Kembali ke admin</a></main>}return <Analytics/>}
