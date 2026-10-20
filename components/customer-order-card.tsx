'use client';
import {useState} from 'react';
import {WHATSAPP_URL} from '@/modules/catalog/customer-support';
import {reserveLabels} from '@/modules/order/reserve-types';
import {dateLabel,rupiah} from '@/modules/order/order-types';
import type {CustomerOrderRow} from '@/modules/order/customer-orders';

export function CustomerOrderCard({order:o}:{order:CustomerOrderRow}){
 const [copyStatus,setCopyStatus]=useState('');
 const href=o.action==='payment'?'/order?invoice=':o.action==='reserve'?'/order?reserveInvoice=':'/lacak?invoice=';
 const action=o.action==='payment'?'Lanjutkan pembayaran':o.action==='reserve'?['RESERVED','PARTIALLY_PAID'].includes(o.reservation!.status)?'Lunasi pesanan':'Detail Reserve':'Lihat status & lacak';
 return <article className="customer-order-card">
  <div className="customer-order-heading"><div><h2>{o.id}</h2><time dateTime={new Date(o.createdAt).toISOString()}>{dateLabel(o.createdAt)}</time></div><span className="customer-order-status">{o.reservation?reserveLabels[o.reservation.status]:o.label}</span></div>
  <ul className="customer-order-items">{o.items.map((item,index)=><li key={index}>{item}</li>)}</ul>
  <dl className="customer-order-values"><div><dt>Total pesanan</dt><dd>{rupiah(o.total)}</dd></div>{o.reservation&&<><div><dt>Sudah dibayar</dt><dd>{rupiah(o.reservation.totalPaid)}</dd></div><div><dt>Sisa pembayaran</dt><dd>{rupiah(o.reservation.remaining)}</dd></div></>}{o.trackingNumber&&<><div><dt>Kurir</dt><dd>{o.courier}</dd></div><div><dt>Nomor resi</dt><dd className="customer-order-awb">{o.trackingNumber}</dd></div></>}</dl>
  {o.reservation?.deadline&&['RESERVED','PARTIALLY_PAID'].includes(o.reservation.status)&&<p className="customer-order-note">Batas pelunasan {dateLabel(o.reservation.deadline)}</p>}
  {!o.trackingNumber&&o.paymentConfirmed&&<p className="customer-order-note">Nomor resi tampil di sini setelah pesanan dikirim.</p>}
  {!o.action&&<p className="customer-order-note"><a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Hubungi ELITE.VTG</a> dengan nomor invoice ini jika sudah membayar atau membutuhkan bantuan.</p>}
  <div className="customer-order-actions">{o.action&&<a className="button primary" href={href+encodeURIComponent(o.id)}>{action} <span aria-hidden="true">→</span></a>}{o.trackingNumber&&<button className="button secondary" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(o.trackingNumber!);setCopyStatus('Nomor resi tersalin.')}catch{setCopyStatus('Tekan lama nomor resi di atas untuk menyalin.')}}}>Salin resi</button>}</div>
  {copyStatus&&<p className="customer-order-note" role="status">{copyStatus}</p>}
 </article>;
}
