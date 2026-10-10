import {money} from '@/modules/catalog/catalog-types';
import type {CartRow} from '@/modules/catalog/cart-availability';
export function CartItemStatus({row}:{row:CartRow}){
 return <p>{row.label} · {row.price!=null?money(row.price):row.pending?'Memuat harga…':'Harga belum tersedia'}
  {row.pending?<span role="status"> · Memeriksa stok…</span>:!row.available?<span className="field-error"> · {row.stock>0?`Tersisa ${row.stock} unit`:'Stok habis'}</span>:null}
 </p>;
}
