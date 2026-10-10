'use client';
import {Eye,EyeOff} from 'lucide-react';
import {isSold,type Product} from '@/modules/catalog/catalog-types';

export function SoldVisibility({product,disabled,onToggle}:{product:Product;disabled:boolean;onToggle:()=>void}) {
 if(!isSold(product))return null;
 const hidden=Boolean(product.soldHidden),label=hidden?'Tampilkan SOLD kembali':'Sembunyikan SOLD';
 return <div className="admin-sold-visibility"><p className="help-text">{hidden?'SOLD disembunyikan dari katalog dan Recently Sold.':'Sembunyikan barang ini dari katalog dan Recently Sold.'} Data, histori, dan link detail tetap tersimpan.</p><button className="button secondary" disabled={disabled} aria-label={label+' '+product.name} onClick={onToggle}>{hidden?<Eye size={16}/>:<EyeOff size={16}/>} {label}</button></div>;
}
