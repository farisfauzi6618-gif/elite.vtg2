'use client';
import {brandLabel} from '@/modules/catalog/brands';
import {ProductPrice} from './product-price';
import {useState} from 'react';
import {productColorSelection} from '@/modules/catalog/color-variants';
import {track} from '@/modules/analytics/client';
import {ProductShare} from './product-share';
import {WishlistButton} from './wishlist';
import {photoUrl,publicPhotoUrl} from '@/modules/catalog/photo-url';
import {isNewArrival} from '@/modules/catalog/new-arrivals';
import {orderingLocked,scheduleLabel} from '@/modules/catalog/product-schedule';
import {type Product, availableGroups, FITS,isSold,isReserved} from '@/modules/catalog/catalog-types';
export function ProductCard({product:parent, onNavigate,now=Date.now()}: {now?:number;product: Product; onNavigate: () => void}) {
  const [color,setColor]=useState<string|null>(null);
  const [showAllColors,setShowAllColors]=useState(false);
  const selection=productColorSelection(parent,color);
  const multiColor=selection.colors.length>1;
  const product=multiColor?selection.product:parent;
  const href='/produk/'+encodeURIComponent(parent.id)+(multiColor&&selection.selectedId?'?color='+encodeURIComponent(selection.selectedId):'');
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
  const image=<div className="product-photo">{reserved?<span className="sold-badge">RESERVED</span>:sold?<span className="sold-badge">SOLD</span>:orderingLocked(product,now)?<span className="scheduled-badge">Segera hadir</span>:isNewArrival(product,now)&&<span className="new-in-badge">NEW IN</span>}
        {product.photoKey ? <picture>{!useOriginal&&<source media="(max-width: 600px)" srcSet={publicPhotoUrl(product.photoKey,'cardSmall')}/>}<img src={useOriginal?photoUrl(product.photoKey):publicPhotoUrl(product.photoKey,'card')} onError={()=>{if(!useOriginal)setFailedPhoto(product.photoKey!)}} alt="" width="600" height="750" loading="lazy" decoding="async"/></picture> : <span className="product-photo-empty">ELITE.VTG</span>}
      </div>;
  const info=<div className="product-info">
        <div className="product-card-meta">
          {product.brand && <p className="product-brand">{brandLabel(product.brand)}</p>}
          <p className="product-card-size">Size {sizes.length ? sizes.join(' / ') : 'belum tercantum'}</p>
        </div>
        <h2>{product.name}</h2>
        <ProductPrice product={product}/>
        <p className="product-card-condition" aria-label={'Kondisi: ' + condition}>{condition}</p>
      {!sold&&orderingLocked(product,now)&&<p className="product-card-schedule">Buka {scheduleLabel(product.orderableAt!)}</p>}</div>;
  const shownColors=showAllColors?selection.colors:selection.colors.slice(0,4);
  return <article className={'product-card'+(multiColor?' product-card-colors':'')+(sold?' product-sold':'')}>
    <a className="product-card-link" href={href} onClick={onNavigate} aria-label={multiColor?'Lihat '+parent.name+(selection.selectedId?' · '+product.color:''):undefined}>
      {image}{!multiColor&&info}
    </a>
    {multiColor&&<>
      <fieldset className="catalog-color-selector">
        <legend className="sr-only">Warna {parent.name}</legend>
        <div className="catalog-color-swatches">
          {shownColors.map(variant=>{
            const available=selection.available.some(color=>color.id===variant.id);
            return <button key={variant.id} type="button" className="color-swatch" disabled={!available} aria-label={variant.name+(available?'':' · Tidak tersedia')} title={variant.name+(available?'':' · Tidak tersedia')} aria-pressed={selection.selectedId===variant.id} onClick={()=>{setColor(variant.id);track('product_color_selected',{productId:parent.id,variantId:variant.id});}}>
              <span style={{backgroundColor:variant.hex}}>{variant.swatchType==='IMAGE'&&variant.swatchImage&&<img src={publicPhotoUrl(variant.swatchImage,'thumb')} alt="" width={22} height={22} loading="lazy"/>}</span>
            </button>;
          })}
          {!showAllColors&&selection.colors.length>4&&<button type="button" className="catalog-more-colors" aria-label={'Tampilkan '+(selection.colors.length-4)+' warna lainnya'} onClick={()=>setShowAllColors(true)}>+{selection.colors.length-4}</button>}
        </div>
        <p className="catalog-color-caption"><span>Color — {product.color}</span><span>{orderingLocked(parent,now)?0:selection.available.length} Colours Available</span></p>
      </fieldset>
      <a className="product-card-info-link" href={href} onClick={onNavigate}>{info}</a>
    </>}
    <WishlistButton product={multiColor?product:parent} compact/>
    <ProductShare product={multiColor&&selection.selectedId?product:parent} compact/>
  </article>;
}
