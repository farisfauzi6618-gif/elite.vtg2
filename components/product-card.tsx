'use client';
import {type Product, availableGroups, displayPrice, FITS} from '@/modules/catalog/catalog-types';
export function ProductCard({product, onNavigate}: {product: Product; onNavigate: () => void}) {
  const groups = availableGroups(product);
  const available = new Set(groups.flatMap(group => group.fits));
  const sizes = FITS.filter(size => available.has(size));
  const conditions = [...new Map(groups.map(group => {
    const value = (group.condition || product.condition || '').trim();
    return [value.toLowerCase(), value];
  })).values()].filter(Boolean);
  const condition = conditions.length > 1 ? 'Kondisi bervariasi' : conditions[0] || 'Kondisi belum tercantum';
  return <article className="product-card">
    <a className="product-card-link" href={'/produk/' + encodeURIComponent(product.id)} onClick={onNavigate}>
      <div className="product-photo">
        {product.photoKey ? <img src={'/api/photos/' + product.photoKey} alt="" width="600" height="750" loading="lazy"/> : <span className="product-photo-empty">ELITE.VTG</span>}
      </div>
      <div className="product-info">
        <div className="product-card-meta">
          {product.brand && <p className="product-brand">{product.brand}</p>}
          <p className="product-card-size">Size {sizes.length ? sizes.join(' / ') : 'belum tercantum'}</p>
        </div>
        <h2>{product.name}</h2>
        <p className="product-card-price">{displayPrice(product)}</p>
        <p className="product-card-condition" aria-label={'Kondisi: ' + condition}>{condition}</p>
      </div>
    </a>
  </article>;
}
