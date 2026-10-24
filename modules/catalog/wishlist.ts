// Device-local product IDs only: no customer data, image copies, or server writes.
export const WISHLIST_KEY='elite.catalog.wishlist.v1';
export const WISHLIST_LIMIT=60;
export const WISHLIST_PAGE_SIZE=12;
const PRODUCT_ID=/^[A-Za-z0-9_-]{1,100}$/;

export function wishlistIds(value:string|null):string[]{
  if(!value||value.length>10000)return [];
  try{
    const rows:unknown=JSON.parse(value);
    if(!Array.isArray(rows))return [];
    return [...new Set(rows.filter((id):id is string=>typeof id==='string'&&PRODUCT_ID.test(id)))].slice(0,WISHLIST_LIMIT);
  }catch{return []}
}

export function toggleWishlist(ids:string[],id:string):string[]{
  if(!PRODUCT_ID.test(id))return ids;
  if(ids.includes(id))return ids.filter(value=>value!==id);
  return ids.length<WISHLIST_LIMIT?[id,...ids]:ids;
}

export function wishlistPage(ids:string[],page:number){
  const pageCount=Math.max(1,Math.ceil(ids.length/WISHLIST_PAGE_SIZE));
  const current=Math.max(1,Math.min(Number.isSafeInteger(page)?page:1,pageCount));
  return {page:current,pageCount,ids:ids.slice((current-1)*WISHLIST_PAGE_SIZE,current*WISHLIST_PAGE_SIZE)};
}
