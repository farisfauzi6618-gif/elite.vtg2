'use client';
import {ShippingProtectionDetail} from './shipping-protection-detail';
import {useEffect,useState,type FormEvent} from 'react';
import {ManualOrderStatus} from './manual-order-status';
import {OrderShipping} from '@/app/(orders)/admin/order/shipping-ui';
import {ADMIN_ORDER_FILTERS,type AdminOrderPage,type AdminOrderStatus} from '@/modules/order/admin-order-types';
import {orderProgress} from '@/modules/order/order-progress';
import {dateLabel,rupiah,orderQuote} from '@/modules/order/order-types';
import {quoteServiceName,shippingDescription} from '@/modules/order/shipping-types';
import {paymentMethodLabel} from '@/modules/order/payment-types';
import {visibleRefresh} from '@/modules/catalog/visible-refresh';

export function AdminOrderList({onReserveCount}:{onReserveCount:(count:number)=>void}){
  const [q,setQ]=useState(''),[search,setSearch]=useState(''),[status,setStatus]=useState<AdminOrderStatus>('all'),[page,setPage]=useState(1);
  const [data,setData]=useState<AdminOrderPage|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState(''),[revision,setRevision]=useState(0);
  const path='/api/admin/order/list?'+new URLSearchParams({q:search,status,page:String(page)});
  async function read(signal?:AbortSignal){const response=await fetch(path,{cache:'no-store',signal}),value=await response.json();if(!response.ok)throw Error(value.error||'Pesanan belum dapat dimuat.');return value as AdminOrderPage}
  async function refresh(){const value=await read();setData(value);onReserveCount(value.reserveCount)}
  useEffect(()=>{const abort=new AbortController();setLoading(true);setError('');read(abort.signal).then(value=>{if(!abort.signal.aborted){setData(value);onReserveCount(value.reserveCount)}}).catch(error=>{if(!abort.signal.aborted)setError(error.message)}).finally(()=>{if(!abort.signal.aborted)setLoading(false)});return()=>abort.abort()},[path,revision]);
  useEffect(()=>visibleRefresh(()=>setRevision(value=>value+1)),[]);
  async function action(id:string,kind:string){setBusy(true);setError('');setInfo('');try{const response=await fetch('/api/admin/order/orders/'+encodeURIComponent(id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:kind})}),value=await response.json();if(!response.ok)throw Error(value.error||'Pesanan belum dapat diperbarui.');await refresh();setInfo(kind==='retry'?'Invoice, bukti, dan penerima terkirim ke Telegram.':'Stok berhasil disinkronkan.')}catch(error){setError((error as Error).message)}finally{setBusy(false)}}
  function find(event:FormEvent){event.preventDefault();setSearch(q.trim());setPage(1);setRevision(value=>value+1)}
  const locked=busy||loading;
  return <section className="panel orders-panel" aria-busy={loading}>
    <div className="section-title"><div><h2>Pesanan masuk</h2><p>{data?`${data.total} pesanan sesuai pencarian`:'Memuat pesanan…'}</p></div><button type="button" className="button secondary" disabled={locked} onClick={()=>setRevision(value=>value+1)}>Perbarui</button></div>
    <form className="admin-order-filters" onSubmit={find}>
      <label>Cari pesanan<input type="search" value={q} maxLength={120} onChange={event=>setQ(event.target.value)} placeholder="Invoice, nama, atau nomor HP"/></label>
      <label>Status<select value={status} onChange={event=>{setStatus(event.target.value as AdminOrderStatus);setPage(1)}}>{ADMIN_ORDER_FILTERS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <button className="button secondary" disabled={locked}>Cari</button>
    </form>
    {error&&<p className="notice error" role="alert">{error}</p>}{info&&<p className="notice success" role="status">{info}</p>}
    {data?.orders.length?<div className="orders-list">{data.orders.map(order=>{const progress=orderProgress(order),quote=orderQuote(order),shipment=order.shipment,showShipment=shipment&&(shipment.provider_no||shipment.awb||shipment.pdfReady||shipment.pngReady||['booking_unknown','booking_processing','booking_failed'].includes(shipment.state));return <article className="order-card" key={order.id}>
      <div className="order-top"><b>{order.id}</b><span>{dateLabel(order.created_at)}</span></div><h3>{order.name}</h3><p className="order-item-names">{order.quantity||1} barang · {order.item}</p>
      <div className="order-bottom"><strong>{rupiah(order.total)}</strong><span className="status-badge verified">{progress.label}</span></div>
      <div className="action-row"><a className="secondary link-button" href={'/api/admin/order/orders/'+order.id}>Lihat / unduh bukti</a>{order.notify_status!=='sent'&&<button className="button secondary" disabled={locked} onClick={()=>void action(order.id,'retry')}>Kirim ulang Telegram</button>}</div>
      <details className="admin-order-details"><summary>Penerima dan rincian pembayaran</summary><p>{order.name}<br/>{order.phone}<br/>{order.address}<br/>{quote?.destination.label||order.postcode}</p><p>{paymentMethodLabel(order.payment_method)}</p>{order.item_amount!=null&&<p>Harga barang {rupiah(order.item_amount)} · Ongkir {quote?quoteServiceName(quote):'J&T'} {shippingDescription(quote,order.shipping_amount??0)}</p>}<ShippingProtectionDetail order={order} admin/><p>Telegram: {order.notify_status==='sent'?'terkirim':order.notify_status==='sending'?'sedang dikirim':'perlu dikirim ulang'}</p></details>
      {order.catalog_checkout_id&&order.payment_state==='payment_confirmed'&&order.stock_sync_state!=='applied'&&<div className="notice error"><p>Sinkronisasi stok perlu diperiksa.</p>{order.stock_sync_error&&<p>{order.stock_sync_error}</p>}<button className="button secondary" disabled={locked} onClick={()=>void action(order.id,'stock-sync')}>Coba sinkron stok</button></div>}
      <ManualOrderStatus order={order} refresh={refresh}/>
      {showShipment&&<details><summary>Riwayat pengiriman terintegrasi</summary><OrderShipping order={order} refresh={refresh}/></details>}
    </article>})}</div>:!loading&&<p className="empty">Belum ada pesanan sesuai pencarian dan status ini.</p>}
    {data&&data.pageCount>1&&<nav className="admin-order-pagination" aria-label="Halaman pesanan"><button className="button secondary" disabled={locked||data.page<=1} onClick={()=>setPage(data.page-1)}>Sebelumnya</button><span>Halaman {data.page} dari {data.pageCount}</span><button className="button secondary" disabled={locked||data.page>=data.pageCount} onClick={()=>setPage(data.page+1)}>Berikutnya</button></nav>}
    <p className="field-help">Bukti yang diterima menunggu verifikasi dana. Konfirmasikan pembayaran setelah transfer masuk.</p>
  </section>;
}
