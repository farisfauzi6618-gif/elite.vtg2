'use client';

import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {Heart,ChevronLeft,ChevronRight} from 'lucide-react';
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription,SheetTrigger} from './ui/sheet';
import {createCatalogReader} from '@/modules/catalog/catalog-request';
import {selectionPath} from '@/modules/catalog/catalog-selection';
import {publicPhotoUrl} from '@/modules/catalog/photo-url';
import {isSold,isReserved,type Product} from '@/modules/catalog/catalog-types';
import {orderingLocked} from '@/modules/catalog/product-schedule';
import {WISHLIST_KEY,WISHLIST_LIMIT,wishlistIds,toggleWishlist,wishlistPage} from '@/modules/catalog/wishlist';
import {ProductPrice} from './product-price';

type WishlistState={ids:string[];ready:boolean;persistent:boolean;notice:string;toggle:(id:string)=>void;remove:(id:string)=>void};
const WishlistContext=createContext<WishlistState|null>(null);

export function WishlistProvider({children}:{children:ReactNode}){
  const [ids,setIds]=useState<string[]>([]),[ready,setReady]=useState(false),[persistent,setPersistent]=useState(true),[notice,setNotice]=useState('');
  const current=useRef<string[]>([]);
  useEffect(()=>{
    try{current.current=wishlistIds(localStorage.getItem(WISHLIST_KEY));setIds(current.current)}catch{setPersistent(false)}
    setReady(true);
    const sync=(event:StorageEvent)=>{
      if(event.key!==WISHLIST_KEY&&event.key!==null)return;
      try{if(event.storageArea!==localStorage)return}catch{return}
      current.current=wishlistIds(event.newValue);setIds(current.current);setNotice('');
    };
    window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);
  },[]);
  function save(next:string[]){
    current.current=next;setIds(next);
    try{localStorage.setItem(WISHLIST_KEY,JSON.stringify(next));setPersistent(true)}catch{setPersistent(false)}
  }
  function toggle(id:string){
    if(!ready)return;
    const before=current.current,next=toggleWishlist(before,id);
    if(next===before){if(before.length>=WISHLIST_LIMIT)setNotice(`Wishlist penuh. Hapus salah satu dari ${WISHLIST_LIMIT} barang untuk menyimpan pilihan baru.`);return}
    save(next);setNotice(next.includes(id)?'Barang disimpan ke wishlist. Menyimpan barang tidak menahan stok.':'Barang dihapus dari wishlist.');
  }
  function remove(id:string){save(current.current.filter(value=>value!==id));setNotice('Barang dihapus dari wishlist.')}
  return <WishlistContext.Provider value={{ids,ready,persistent,notice,toggle,remove}}>{children}<p className="sr-only" role="status" aria-live="polite">{notice}</p></WishlistContext.Provider>;
}

export function WishlistButton({product,compact=false}:{product:Pick<Product,'id'|'name'>;compact?:boolean}){
  const wishlist=useContext(WishlistContext);if(!wishlist)return null;
  const saved=wishlist.ids.includes(product.id);
  return <button type="button" className={'wishlist-save'+(compact?' wishlist-save-card':'')} disabled={!wishlist.ready} aria-pressed={saved} aria-label={(saved?'Hapus dari wishlist: ':'Simpan ke wishlist: ')+product.name} onClick={()=>wishlist.toggle(product.id)}>
    <Heart size={19} strokeWidth={1.5} fill={saved?'currentColor':'none'} aria-hidden="true"/>{!compact&&(saved?'Tersimpan':'Simpan')}
  </button>;
}

export function WishlistPanel({onNavigate}:{onNavigate:()=>void}){
  const wishlist=useContext(WishlistContext);
  const [open,setOpen]=useState(false),[page,setPage]=useState(1),[retry,setRetry]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(''),[products,setProducts]=useState<Product[]>([]);
  const reader=useRef(createCatalogReader()).current;
  const selection=wishlistPage(wishlist?.ids??[],page),signature=selection.ids.join(',');
  useEffect(()=>{
    if(!open||!signature){setProducts([]);setError('');setLoading(false);return}
    let active=true;setLoading(true);setError('');setProducts([]);
    // One bounded read when opened/page changed; no background polling or image fetch here.
    void reader(selectionPath(signature.split(','))).then(data=>{if(active)setProducts(data.products)}).catch(error=>{if(active)setError(error instanceof Error?error.message:'Wishlist belum dapat dimuat.')}).finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[open,signature,retry,reader]);
  if(!wishlist)return null;
  const byId=new Map(products.map(product=>[product.id,product]));
  return <Sheet open={open} onOpenChange={value=>{setOpen(value);if(value)setPage(1)}}><SheetTrigger asChild><button type="button" className="wishlist-open" aria-label={'Buka wishlist, '+wishlist.ids.length+' barang'}><Heart size={18} strokeWidth={1.5} aria-hidden="true"/><span>Wishlist</span>{wishlist.ids.length>0&&<small aria-hidden="true">{wishlist.ids.length}</small>}</button></SheetTrigger>
    <SheetContent className="wishlist-sheet"><SheetHeader><SheetTitle>Wishlist Anda</SheetTitle><SheetDescription>Disimpan di browser ini. Stok tetap tersedia untuk pembeli lain.</SheetDescription></SheetHeader>
      {!wishlist.persistent&&<p className="wishlist-notice" role="status">Browser tidak mengizinkan penyimpanan. Wishlist hanya tersedia selama halaman ini terbuka.</p>}
      {wishlist.notice&&<p className="wishlist-notice" role="status">{wishlist.notice}</p>}
      {!wishlist.ids.length?<div className="wishlist-empty"><Heart size={25} strokeWidth={1.3} aria-hidden="true"/><h3>Simpan yang Anda suka.</h3><p>Ketuk ikon hati pada produk untuk melihatnya lagi di sini.</p><button type="button" className="button secondary" onClick={()=>setOpen(false)}>Lanjut belanja</button></div>:loading?<p className="wishlist-loading" role="status">Memuat pilihan Anda…</p>:error?<div className="wishlist-error" role="alert"><p>{error}</p><button type="button" className="button secondary" onClick={()=>setRetry(value=>value+1)}>Coba lagi</button></div>:<ul className="wishlist-items">{selection.ids.map(id=>{
        const product=byId.get(id),status=product?(isSold(product)?'SOLD':isReserved(product)?'RESERVED':orderingLocked(product)?'Segera hadir':''):'';
        return <li key={id} className="wishlist-item">{product?<>
          <a className="wishlist-product" href={'/produk/'+encodeURIComponent(id)} onClick={onNavigate}>{product.photoKey?<img src={publicPhotoUrl(product.photoKey,'thumb')} alt="" width={64} height={80} loading="lazy" decoding="async" onError={event=>{event.currentTarget.style.visibility='hidden'}}/>:<span className="wishlist-photo-empty">E.</span>}<div>{product.brand&&<p className="wishlist-brand">{product.brand}</p>}<h3>{product.name}</h3><ProductPrice product={product}/>{status&&<span className="wishlist-availability">{status}</span>}</div></a>
          <button type="button" className="wishlist-remove" aria-label={'Hapus '+product.name+' dari wishlist'} onClick={()=>wishlist.remove(id)}>Hapus</button>
        </>:<><p className="wishlist-unavailable">Barang ini sudah tidak tersedia di katalog.</p><button type="button" className="wishlist-remove" aria-label="Hapus barang tidak tersedia dari wishlist" onClick={()=>wishlist.remove(id)}>Hapus</button></>}</li>;
      })}</ul>}
      {wishlist.ids.length>0&&<div className="wishlist-bottom"><p>{wishlist.ids.length} barang disimpan</p>{selection.pageCount>1&&<nav className="wishlist-pages" aria-label="Halaman wishlist"><button type="button" disabled={selection.page===1||loading} aria-label="Wishlist sebelumnya" onClick={()=>setPage(selection.page-1)}><ChevronLeft size={18}/></button><span>{selection.page} / {selection.pageCount}</span><button type="button" disabled={selection.page===selection.pageCount||loading} aria-label="Wishlist berikutnya" onClick={()=>setPage(selection.page+1)}><ChevronRight size={18}/></button></nav>}</div>}
    </SheetContent>
  </Sheet>;
}
