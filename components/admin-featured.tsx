'use client';
import {useEffect,useState} from 'react';
import {isSold,type Product} from '@/modules/catalog/catalog-types';
import {ArrowUp,ArrowDown,Star} from 'lucide-react';
import {FEATURED_LIMIT} from '@/modules/catalog/featured';
export function AdminFeaturedQuickActions({product,disabled,showOrder=false,count,onChange}:{product:Product;disabled:boolean;showOrder?:boolean;count:number;onChange:(featured:boolean,position?:number)=>void}){
 const position=product.featuredPosition,canOrder=showOrder&&product.isFeatured&&!isSold(product)&&position!=null&&count<=FEATURED_LIMIT;
 return <div className="admin-featured-actions">
  <button type="button" className="button secondary" disabled={disabled||!product.isFeatured&&isSold(product)} aria-label={(product.isFeatured?'Keluarkan dari Featured: ':'Tambahkan ke Featured: ')+product.name} onClick={()=>onChange(!product.isFeatured)}><Star size={15} fill={product.isFeatured?'currentColor':'none'}/>{product.isFeatured?'Keluarkan dari Featured':'Tambahkan ke Featured'}</button>
  {canOrder&&<div className="admin-featured-order" role="group" aria-label={'Urutan Featured: '+product.name}><span>Posisi {position}</span><button type="button" className="icon-button" aria-label={'Naikkan urutan Featured: '+product.name} disabled={disabled||position<=1} onClick={()=>onChange(true,position-1)}><ArrowUp size={17}/></button><button type="button" className="icon-button" aria-label={'Turunkan urutan Featured: '+product.name} disabled={disabled||position>=Math.min(count,FEATURED_LIMIT)} onClick={()=>onChange(true,position+1)}><ArrowDown size={17}/></button></div>}
 </div>;
}
export function AdminFeatured({product,disabled,onChange}:{product:Product;disabled:boolean;onChange:(featured:boolean,position?:number)=>void}){
 const [position,setPosition]=useState(product.featuredPosition??1);
 useEffect(()=>setPosition(product.featuredPosition??1),[product.id,product.featuredPosition]);
 return <section className="panel admin-featured"><h2>Featured</h2><label className="featured-toggle"><input type="checkbox" role="switch" aria-label="Featured" checked={!!product.isFeatured} disabled={disabled} onChange={e=>onChange(e.target.checked)}/><span>Pilihan terkurasi ELITE</span></label>{product.isFeatured&&<div className="featured-order"><label>Featured Position<input type="number" min={1} max={8} step={1} value={position} disabled={disabled} onChange={e=>setPosition(Number(e.target.value))}/></label><button type="button" className="button secondary" disabled={disabled||!Number.isInteger(position)||position<1||position>8||position===product.featuredPosition} onClick={()=>onChange(true,position)}>Atur urutan</button></div>}<p className="help-text">Maksimal 8 pilihan aktif. SOLD dan seluruh stok Reserved tidak tampil; status Featured tetap tersimpan.</p>{disabled&&<p className="help-text">Simpan perubahan barang sebelum mengatur Featured.</p>}</section>;
}
