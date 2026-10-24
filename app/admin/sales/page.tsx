import {requireOwnerUser} from '@/lib/auth/owner';
import {requireOwner} from '@/modules/catalog/server';
import SalesIntelligence from './ui';
export const dynamic='force-dynamic';
export const metadata={title:'Sales Intelligence',robots:{index:false,follow:false}};
export default async function Page(){await requireOwnerUser('/admin/sales');await requireOwner();return <SalesIntelligence/>}
