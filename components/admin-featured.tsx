'use client';
import {useEffect,useState} from 'react';
import type {Product} from '@/modules/catalog/catalog-types';
export function AdminFeatured({product,disabled,onChange}:{product:Product;disabled:boolean;onChange:(featured:boolean,position?:number)=>void}){
 const [position,setPosition]=useState(product.featuredPosition??1);
 useEffect(()=>setPosition(product.featuredPosition??1),[product.id,product.featuredPosition]);
 return <section className="panel admin-featured"><h2>Featured</h2><label className="featured-toggle"><input type="checkbox" role="switch" aria-label="Featured" checked={!!product.isFeatured} disabled={disabled} onChange={e=>onChange(e.target.checked)}/><span>Pilihan terkurasi ELITE</span></label>{product.isFeatured&&<div className="featured-order"><label>Featured Position<input type="number" min={1} max={8} step={1} value={position} disabled={disabled} onChange={e=>setPosition(Number(e.target.value))}/></label><button type="button" className="button secondary" disabled={disabled||!Number.isInteger(position)||position<1||position>8||position===product.featuredPosition} onClick={()=>onChange(true,position)}>Atur urutan</button></div>}<p className="help-text">Maksimal 8 pilihan aktif. SOLD dan seluruh stok Reserved tidak tampil; status Featured tetap tersimpan.</p>{disabled&&<p className="help-text">Simpan perubahan barang sebelum mengatur Featured.</p>}</section>;
}
