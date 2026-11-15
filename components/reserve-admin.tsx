'use client';

import {useCallback,useEffect,useState,useRef} from 'react';
import {ShippingProtectionDetail} from './shipping-protection-detail';
import {type Order,dateLabel,rupiah} from '@/modules/order/order-types';
import {RESERVE_DAY_MS,reserveDurationLabel,reserveLabels} from '@/modules/order/reserve-types';

type Row=Order&{audit:{action:string;created_at:number;previous_deadline:number|null;new_deadline:number|null;amount:number|null;actor:string;note:string|null}[]};
type Metrics={started:number;completed:number;expired:number;requested:number;approved:number;extendedCompleted:number;averageClosedHoldMs:number|null;forfeited:number};
const percent=(part:number,total:number)=>total?`${(100*part/total).toLocaleString('id-ID',{maximumFractionDigits:1})}%`:'—';

async function readRows(signal?:AbortSignal){
 const response=await fetch('/api/admin/reserve',{cache:'no-store',signal});
 const value=await response.json();
 if(!response.ok)throw Error(value.error);
 return value as {orders:Row[];metrics:Metrics;policy:string};
}

export function ReserveAdmin(){
 const [rows,setRows]=useState<Row[]>([]);
 const [metrics,setMetrics]=useState<Metrics|null>(null);
 const [policy,setPolicy]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [asOf,setAsOf]=useState(0);
 const flight=useRef(false);

 const update=useCallback(({orders,metrics,policy}:Awaited<ReturnType<typeof readRows>>)=>{
  setRows(orders);
  setMetrics(metrics);
  setPolicy(policy);
  setAsOf(Date.now());
 },[]);

 useEffect(()=>{
  const controller=new AbortController();
  void readRows(controller.signal).then(value=>{
   if(!controller.signal.aborted)update(value);
  }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return ()=>controller.abort();
 },[update]);

 async function action(value:Record<string,unknown>){
  if(flight.current)return;
  flight.current=true;
  setBusy(true);
  setError('');
  try{
   const response=await fetch('/api/admin/reserve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   update(await readRows());
  }catch(e){setError((e as Error).message)}
  finally{flight.current=false;setBusy(false)}
 }

 return <section className="panel reserve-admin">
  <h2>Kelola Reserve</h2>
  <button className="button secondary" disabled={busy} onClick={()=>void readRows().then(update).catch(e=>setError(e.message))}>Perbarui Reserve</button>
  {error&&<p className="notice error" role="alert">{error}</p>}
  {metrics&&<details>
   <summary>Ringkasan Reserve · 30 hari terakhir</summary>
   <p>Dihitung dari {metrics.started} Reserve yang DP awalnya terverifikasi dalam periode ini.</p>
   <dl className="reserve-values">
    <dt>Lunas</dt><dd>{metrics.completed} · {percent(metrics.completed,metrics.started)}</dd>
    <dt>Kedaluwarsa</dt><dd>{metrics.expired} · {percent(metrics.expired,metrics.started)}</dd>
    <dt>Meminta perpanjangan</dt><dd>{metrics.requested} · {percent(metrics.requested,metrics.started)}</dd>
    <dt>Permintaan disetujui</dt><dd>{metrics.approved} · {percent(metrics.approved,metrics.requested)}</dd>
    <dt>Lunas setelah perpanjangan</dt><dd>{metrics.extendedCompleted} · {percent(metrics.extendedCompleted,metrics.approved)}</dd>
    <dt>Rata-rata durasi hold yang selesai</dt><dd>{metrics.averageClosedHoldMs==null?'—':(metrics.averageClosedHoldMs/RESERVE_DAY_MS).toLocaleString('id-ID',{maximumFractionDigits:1})+' hari'}</dd>
    <dt>DP hangus</dt><dd>{rupiah(metrics.forfeited)}</dd>
   </dl>
  </details>}
  {rows.map(o=>{
   const s=o.reservation!;
   const active=['RESERVED','PARTIALLY_PAID'].includes(s.status);
   const extension=s.extension;
   const review=extension?.state==='requested';
   const legacy=s.policyVersion===1&&active&&!s.reviewAfterDeadline;
   const latest=extension?.latestDeadline??(s.startedAt??0)+7*RESERVE_DAY_MS;
   return <article key={o.id}>
    <h3>{o.id} · {reserveLabels[s.status]}</h3>
    <p>{o.name} · {o.phone}</p>
    <p>{o.items?.join(' · ')||o.item}</p>
    <p>{o.address} · {o.postcode}</p>
    <small>Dibuat {dateLabel(o.created_at)}</small>
    {active&&s.deadline!=null&&s.deadline>asOf&&s.deadline-asOf<=RESERVE_DAY_MS&&<p className="notice">Jatuh tempo dalam 24 jam.</p>}
    {s.reviewAfterDeadline&&<p className="notice">Bukti masuk sebelum tenggat. Tinjau bukti untuk menyelesaikan pembayaran atau melepas stok.</p>}
    {s.forfeitedAmount>0&&<p className="notice">DP hangus: {rupiah(s.forfeitedAmount)}.</p>}
    <dl className="reserve-values">
     <dt>Nilai barang</dt><dd>{rupiah(o.item_subtotal??s.orderValue)}</dd>
     {!!o.discount_amount&&<>
      <dt>{o.discount_label||'Voucher'}</dt><dd>−{rupiah(o.discount_amount)}</dd>
      <dt>Harga setelah voucher</dt><dd>{rupiah(s.orderValue)}</dd>
     </>}
     <dt>DP minimum</dt><dd>{rupiah(s.depositMinimum)}</dd>
     <dt>DP awal terverifikasi</dt><dd>{rupiah(s.depositPaid)}</dd>
     <dt>Total terverifikasi</dt><dd>{rupiah(s.totalPaid)}</dd>
     <dt>{s.shippingPayment==='collect'?'Sisa pembayaran · ongkir ke kurir':'Sisa pembayaran termasuk ongkir'}</dt><dd>{rupiah(s.remaining)}</dd>
     <dt>Batas pelunasan</dt><dd>{s.deadline?dateLabel(s.deadline):reserveDurationLabel(s.policyVersion)+' setelah DP dikonfirmasi'}</dd>
    </dl>
    <ShippingProtectionDetail order={o} admin/>
    {s.payments.map(p=><div key={p.id}>
     <p>{dateLabel(p.createdAt)} · {rupiah(p.amount)} · {p.paymentMethod} · {p.state}</p>
     {p.submittedAt&&<p>Bukti tercatat {dateLabel(p.submittedAt)}</p>}
     {p.note&&<p>{p.note}</p>}
     {p.hasProof&&<a href={'/api/admin/reserve?proof='+encodeURIComponent(p.id)} target="_blank" rel="noreferrer">Lihat bukti</a>}
     {p.state==='submitted'&&<div className="action-row">
      {p.hasProof&&<button className="button secondary" disabled={busy} onClick={()=>void action({action:'retry',orderId:o.id,paymentId:p.id})}>Kirim ulang ke Telegram</button>}
      <button className="button primary" disabled={busy||!['RESERVED','PARTIALLY_PAID','AWAITING_DEPOSIT'].includes(s.status)} onClick={()=>{
       if(window.confirm('Transfer '+rupiah(p.amount)+' sudah diterima?'))void action({action:'confirm',orderId:o.id,paymentId:p.id});
      }}>Konfirmasi pembayaran</button>
      <button className="button secondary" disabled={busy} onClick={()=>{
       if(window.confirm('Tolak bukti ini? Riwayat tetap disimpan.'))void action({action:'reject',orderId:o.id,paymentId:p.id});
      }}>Tolak bukti</button>
     </div>}
    </div>)}
    {extension&&active&&<p className="help-text">
     {extension.state==='approved'?'Perpanjangan disetujui.':extension.state==='rejected'?'Perpanjangan ditolak.':
      extension.state==='closed'?'Perpanjangan sudah ditutup.':extension.requiredTopUp>0?
       'Top-up menuju 50%: '+rupiah(extension.requiredTopUp):'DP terverifikasi sudah mencapai 50%.'}
    </p>}
    {(review||legacy)&&<form onSubmit={e=>{
     e.preventDefault();
     const value=String(new FormData(e.currentTarget).get('deadline'));
     const deadline=value?Date.parse(value+'+07:00'):latest;
     void action({action:'extend',orderId:o.id,deadline});
    }}>
     <h4>{review?'Permintaan perpanjangan':'Perpanjang sesuai ketentuan sebelumnya'}</h4>
     <label>Batas baru (opsional) · WIB<input name="deadline" type="datetime-local"/></label>
     <p className="help-text">Kosongkan untuk memakai batas maksimal {dateLabel(latest)}.</p>
     <div className="action-row">
      <button className="button primary" disabled={busy||Boolean(review&&extension.requiredTopUp>0)}>Setujui perpanjangan</button>
      {review&&<button type="button" className="button secondary" disabled={busy} onClick={()=>{
       if(window.confirm('Tolak permintaan? Batas pelunasan saat ini tetap berlaku.'))void action({action:'reject_extension',orderId:o.id});
      }}>Tolak perpanjangan</button>}
     </div>
    </form>}
    {active&&!s.reviewAfterDeadline&&<form onSubmit={e=>{
     e.preventDefault();
     const f=new FormData(e.currentTarget);
     if(window.confirm('Nominal ini sudah diterima dan diverifikasi?'))void action({action:'record',requestId:crypto.randomUUID(),orderId:o.id,amount:Number(f.get('amount')),method:f.get('method'),note:f.get('note')});
    }}>
     <label>Catat pembayaran tambahan<input name="amount" type="number" min={1} max={s.remaining} defaultValue={s.remaining} required/></label>
     <label>Metode pembayaran<select name="method"><option value="bca_transfer">Bank Central Asia (BCA)</option><option value="qris_dana">QRIS</option></select></label>
     <label>Keterangan verifikasi<input name="note" minLength={5} maxLength={300} required/></label>
     <button className="button secondary" disabled={busy}>Catat pembayaran terverifikasi</button>
     <p className="help-text">Untuk pelunasan, catat tepat {rupiah(s.remaining)} setelah seluruh transfer diperiksa.</p>
    </form>}
    {!['PAID','EXPIRED','CANCELLED'].includes(s.status)&&<button className="text-button" disabled={busy||s.reviewAfterDeadline} onClick={()=>{
     if(window.confirm('Batalkan Reserve dan lepas penguncian barang? Dana ditangani manual.'))void action({action:'cancel',orderId:o.id});
    }}>Batalkan Reserve</button>}
    <details><summary>Riwayat perubahan</summary>{o.audit.map((a,i)=><p key={i}>
     {dateLabel(a.created_at)} · {a.action} · {a.actor}{a.previous_deadline&&' · '+dateLabel(a.previous_deadline)}{a.new_deadline&&' → '+dateLabel(a.new_deadline)}
     {a.amount!=null&&' · '+rupiah(a.amount)}{a.note&&' · '+a.note}
    </p>)}</details>
   </article>;
  })}
  <details>
   <summary>Ketentuan Reserve lama</summary>
   <label>Kebijakan untuk Reserve lama<textarea value={policy} maxLength={2000} onChange={e=>setPolicy(e.target.value)}/></label>
   <button className="button secondary" disabled={busy} onClick={()=>void action({action:'policy',text:policy})}>Simpan kebijakan</button>
  </details>
 </section>;
}
