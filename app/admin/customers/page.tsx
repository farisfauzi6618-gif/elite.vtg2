import {AppError,requireOwner} from '@/modules/catalog/server';
import {requireOwnerUser} from '@/lib/auth/owner';
import Customers from './ui';
export const dynamic='force-dynamic';
export const metadata={title:'Data pelanggan — ELITE.VTG',robots:{index:false,follow:false}};
export default async function Page(){
 try{await requireOwner()}catch(error){if(error instanceof AppError&&error.status===401)await requireOwnerUser('/admin/customers');return <main className="management"><h1>Akses khusus pemilik</h1><p>Data pelanggan hanya dapat dibuka oleh pemilik ELITE.VTG.</p><a href="/admin">Kembali ke dashboard</a></main>}
 return <Customers/>;
}
