import {readCatalogSnapshot} from './catalog-read-snapshot';
import {listingPage,listingRequest} from './catalog-listing-page';
export type ListingSearch=Record<string,string|string[]|undefined>;
export async function initialListing(search:ListingSearch,archive=false){
 const params=new URLSearchParams();
 for(const [key,value] of Object.entries(search)){if(typeof value==='string')params.set(key,value);else if(value?.length)params.set(key,value[0]);}
 if(archive)params.set('archive','1');
 // Preserve explicit sorting on both the server and client.
 if(params.has('sort'))params.set('explicitSort','1');
 try{const input=listingRequest(params),{products,taxonomy}=await readCatalogSnapshot();return listingPage(products,taxonomy,input);}
 catch{return undefined;} // Client retains its existing retry/error UI.
}
