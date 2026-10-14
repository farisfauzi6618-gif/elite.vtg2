'use client';
import {useEffect,useRef,useState} from 'react';import {Share2,Link as LinkIcon} from 'lucide-react';
import {performProductShare,productShareUrl} from '@/modules/catalog/product-share';import type {Product} from '@/modules/catalog/catalog-types';import {track} from '@/modules/analytics/client';
export function ProductShare({product,admin=false}:{product:Product;admin?:boolean}){
 const [native,setNative]=useState(false),[copyOnly,setCopyOnly]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[manual,setManual]=useState('');const pending=useRef(false);
 useEffect(()=>{setNative(typeof navigator.share==='function')},[]);
 if(product.status!=='published')return null;
 async function share(story=false){if(pending.current)return;pending.current=true;setBusy(true);setNotice('');setManual('');const useNative=native&&!admin&&!copyOnly&&!story;track('product_share_clicked',{productId:product.id,shareMethod:useNative?'native_share':'copy_link'});
  try{const result=await performProductShare(product,{...(useNative?{share:(data)=>navigator.share(data)}:{}),...(navigator.clipboard?.writeText?{copy:(url)=>navigator.clipboard.writeText(url)}:{})},!useNative,story);if(result==='copy_link')setNotice('Link copied');else if(result==='copy_fallback'){setCopyOnly(true);setNotice('Silakan gunakan Copy Link.')}else if(result==='manual_copy'){setManual(productShareUrl(product,story));setNotice('Pilih dan salin tautan berikut.')}}finally{pending.current=false;setBusy(false)}
 }
 const controls=<><button className="product-share-button" type="button" disabled={busy} onClick={()=>void share()}><Share2 size={15}/>{admin?'Copy Product Link':native&&!copyOnly?'Share':'Copy Link'}</button>{admin&&<button className="product-share-button" type="button" disabled={busy} onClick={()=>void share(true)}><LinkIcon size={14}/>Copy Instagram Story Link</button>}</>;
 return <div className="product-share">{admin?<details><summary>Share Product</summary><div className="product-share-admin-actions">{controls}</div></details>:controls}{notice&&<span className="product-share-notice" role="status" aria-live="polite">{notice}</span>}{manual&&<input className="product-share-manual" aria-label="Product link" readOnly value={manual} onFocus={e=>e.currentTarget.select()}/>}</div>;
}
