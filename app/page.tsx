import Catalog from '@/app/catalog';
import {initialListing,type ListingSearch} from '@/modules/catalog/initial-listing';
export const dynamic='force-dynamic';
export const metadata={alternates:{canonical:'https://elitevtg.com/'}};
export default async function Home({searchParams}:{searchParams:Promise<ListingSearch>}){return <Catalog initialListing={await initialListing(await searchParams)}/>;}
