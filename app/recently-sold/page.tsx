import Catalog from '@/app/catalog';
import {initialListing,type ListingSearch} from '@/modules/catalog/initial-listing';
export const dynamic='force-dynamic';
export const metadata={title:'Recently Sold',description:'Pilihan ELITE.VTG yang sudah menemukan pemilik baru. Temukan koleksi yang masih tersedia.',alternates:{canonical:'https://elitevtg.com/recently-sold'}};
export default async function RecentlySoldPage({searchParams}:{searchParams:Promise<ListingSearch>}){return <Catalog archive initialListing={await initialListing(await searchParams,true)}/>;}
