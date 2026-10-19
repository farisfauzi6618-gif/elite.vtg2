'use client';
import {ProductPrice} from './product-price';
import {useState} from 'react';
import {ProductShare} from './product-share';
import {photoUrl,publicPhotoUrl} from '@/modules/catalog/photo-url';
import {isNewArrival} from '@/modules/catalog/new-arrivals';
import {orderingLocked,scheduleLabel} from '@/modules/catalog/product-schedule';
import {type Product, availableGroups, displayPrice, FITS,isSold,isReserved} from '@/modules/catalog/catalog-types';
export function ProductCard({product, onNavigate,now=Date.now()}: {now?:number;product: Product; onNavigate: () => void}) {
  const sold=isSold(product),reserved=isReserved(product);
  const [failedPhoto,setFailedPhoto]=useState<string|null>(null);
  const useOriginal=failedPhoto===product.photoKey;
  const groups = sold||reserved?product.groups:availableGroups(product);
  const available = new Set(groups.flatMap(group => group.fits));
  const sizes = FITS.filter(size => available.has(size));
  const conditions = [...new Map(groups.map(group => {
    const value = (group.condition || product.condition || '').trim();
    return [value.toLowerCase(), value];
  })).values()].filter(Boolean);
  const condition = conditions.length > 1 ? 'Kondisi bervariasi' : conditions[0] || 'Kondisi belum tercantum';
  return <article className={'product-card'+(sold?' product-sold':'')}>
    <a className="product-card-link" href={'/produk/' + encodeURIComponent(product.id)} onClick={onNavigate}>
      <div className="product-photo">{reserved?<span className="sold-badge">RESERVED</span>:sold?<span className="sold-badge">SOLD</span>:orderingLocked(product,now)?<span className="scheduled-badge">Segera hadir</span>:isNewArrival(product,now)&&<span className="new-in-badge">NEW IN</span>}
        {product.photoKey ? <picture>{!useOriginal&&<source media="(max-width: 600px)" srcSet={publicPhotoUrl(product.photoKey,'cardSmall')}/>}<img src={useOriginal?photoUrl(product.photoKey):publicPhotoUrl(product.photoKey,'card')} onError={()=>{if(!useOriginal)setFailedPhoto(product.photoKey!)}} alt="" width="600" height="750" loading="lazy" decoding="async"/></picture> : <span className="product-photo-empty">ELITE.VTG</span>}
      </div>
      <div className="product-info">
        <div className="product-card-meta">
          {product.brand && <p className="product-brand">{product.brand}</p>}
          <p className="product-card-size">Size {sizes.length ? sizes.join(' / ') : 'belum tercantum'}</p>
        </div>
        <h2>{product.name}</h2>
        <ProductPrice product={product}/>
        <p className="product-card-condition" aria-label={'Kondisi: ' + condition}>{condition}</p>
      {!sold&&orderingLocked(product,now)&&<p className="product-card-schedule">Buka {scheduleLabel(product.orderableAt!)}</p>}</div>
    </a>
    <ProductShare product={product} compact/>
  </article>;
}
