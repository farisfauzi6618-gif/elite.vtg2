'use client';
import {useCallback,useEffect,useState,useRef} from 'react';
import {BrandLogo} from '@/components/brand-logo';
import {CustomerAccount} from '@/components/customer-account';
import {CustomerOrderCard} from '@/components/customer-order-card';
import type {CustomerOrderRow} from '@/modules/order/customer-orders';

export default function MyOrders(){
 const [orders,setOrders]=useState<CustomerOrderRow[]>([]),[before,setBefore]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[loginRequired,setLoginRequired]=useState(false);
 const generation=useRef(0),cursor=useRef(before);cursor.current=before;
 const load=useCallback(async(append=false)=>{
  const current=++generation.current;setBusy(true);setError('');
  try{
   const r=await fetch('/api/customer/orders'+(append&&cursor.current?'?before='+encodeURIComponent(cursor.current):''),{cache:'no-store',signal:AbortSignal.timeout(20000)}),v=await r.json();
   if(current!==generation.current)return;
   if(r.status===401){setOrders([]);setBefore(null);setLoginRequired(true);return}
   if(!r.ok)throw Error(v.error||'Pesanan belum dapat dimuat.');
   setLoginRequired(false);setOrders(old=>append?[...old,...v.orders]:v.orders);setBefore(v.nextBefore);
  }catch(e){if(current===generation.current)setError(e instanceof Error?e.message:'Pesanan belum dapat dimuat.')}
  finally{if(current===generation.current)setBusy(false)}
 },[]);
 useEffect(()=>{
  void load();const change=()=>{setOrders([]);setBefore(null);setLoginRequired(false);void load()};
  window.addEventListener('elite:customer-change',change);
  return()=>{generation.current++;window.removeEventListener('elite:customer-change',change)};
 },[load]);
 return <main className="customer-orders"><header><a href="/" aria-label="ELITE.VTG — Katalog"><BrandLogo/></a><CustomerAccount showOrdersLink={false}/></header>
  <div className="customer-orders-intro"><h1>Pesanan saya</h1><p>Pembayaran, status pesanan, dan nomor resi dalam satu tempat.</p></div>
  {loginRequired?<section className="customer-orders-empty"><h2>Masuk untuk melihat pesanan</h2><p>Pilih “Masuk” di atas dengan akun yang digunakan saat membeli. Riwayat pesanan tetap tersedia meskipun halaman pembayaran sudah ditutup.</p><a href="/lacak">Belanja tanpa akun? Lacak dengan invoice & nomor HP</a></section>:<>
   {error&&<p className="customer-orders-error" role="alert">{error}</p>}
   {busy&&!orders.length&&<p role="status">Memuat pesanan…</p>}
   <div className="customer-order-list" aria-busy={busy}>{orders.map(o=><CustomerOrderCard key={o.id} order={o}/>)}</div>
   {!busy&&!error&&!orders.length&&<section className="customer-orders-empty"><h2>Belum ada pesanan di akun ini</h2><p>Pesanan yang dibuat saat login akan tersimpan di sini. Untuk pembelian tanpa login, gunakan nomor invoice dan nomor HP penerima.</p></section>}
   <div className="customer-orders-controls"><button className="button secondary" disabled={busy} onClick={()=>void load()}>{busy?'Memuat…':'Perbarui pesanan'}</button>{before&&<button className="button secondary" disabled={busy} onClick={()=>void load(true)}>Pesanan sebelumnya</button>}</div>
  </>}
  <nav className="customer-orders-footer" aria-label="Bantuan pesanan"><a href="/lacak">Cari dengan invoice & nomor HP</a><a href="/">Kembali ke katalog</a></nav>
 </main>;
}
