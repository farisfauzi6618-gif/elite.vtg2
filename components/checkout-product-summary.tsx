/* eslint-disable @next/next/no-img-element -- Reuse existing lightweight product thumbnails. */
import Link from 'next/link';
import {publicPhotoUrl} from '@/modules/catalog/photo-url';
import {rupiah} from '@/modules/order/order-types';
import type {CheckoutPreview} from '@/modules/order/checkout-ux';
export function CheckoutProductSummary({items,loading}:{items:CheckoutPreview[];loading:boolean}){return <section className="checkout-products" aria-label="Barang pesanan"><div className="checkout-products-heading"><h3>Barang pesanan</h3><Link href="/">Ubah pilihan</Link></div>{loading?<p role="status">Memuat pilihan barang…</p>:<ul>{items.map(item=><li key={item.groupId}>{item.photoKey&&<img width={52} height={66} src={publicPhotoUrl(item.photoKey,'thumb')} loading="lazy" alt=""/>}<div><small>{item.brand}</small><span>{item.name}</span><small>{item.label} · {item.quantity} pcs</small></div><span>{rupiah(item.unitPrice*item.quantity)}</span></li>)}</ul>}</section>}
