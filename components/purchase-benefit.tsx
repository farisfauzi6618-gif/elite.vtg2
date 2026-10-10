'use client';
import {useEffect,useState} from 'react';
import {CustomerAccount} from './customer-account';
import type {PurchasePromotion} from '@/modules/order/first-purchase';
import type {CustomerProfile} from '@/modules/catalog/customer-types';
export function usePurchaseBenefit() {
 const [promotion,setPromotion]=useState<PurchasePromotion|null>(null),[customer,setCustomer]=useState<CustomerProfile|null>(null),[loading,setLoading]=useState(true);
 useEffect(()=>{
  let active=true;
  async function load(){try{const reply=await fetch('/api/customer',{cache:'no-store'});if(!reply.ok)throw Error();const data=await reply.json();if(active){setPromotion(data.promotion);setCustomer(data.customer);}}catch{if(active)setPromotion(null);}finally{if(active)setLoading(false);}}
  void load();window.addEventListener('elite:customer-change',load);window.addEventListener('focus',load);
  return()=>{active=false;window.removeEventListener('elite:customer-change',load);window.removeEventListener('focus',load)};
 },[]);
 return {promotion,customer,loading};
}
export function PurchaseBenefit({promotion,currentOrderId}:{promotion:PurchasePromotion|null;currentOrderId?:string}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function resume(){setBusy(true);setError('');try{const reply=await fetch('/api/order/first-purchase',{method:'POST'});const value=await reply.json();if(!reply.ok)throw Error(value.error||'Invoice belum dapat dibuka.');window.location.assign('/order');}catch(e){setError((e as Error).message);setBusy(false);}}
 if(!promotion||promotion.state==='redeemed')return null;
 return <div className="purchase-benefit"><div><p>{promotion.state==='guest'?'Diskon 5% untuk pembelian pertama':promotion.state==='reserved'&&promotion.orderId!==currentOrderId?'Diskon 5% tersimpan di invoice sebelumnya':'Diskon pembelian pertama 5% aktif'}</p><small>{promotion.state==='guest'?'Masuk atau daftar. Diskon harga barang diterapkan otomatis; ongkir tetap.':promotion.state==='reserved'&&promotion.orderId!==currentOrderId?'Selesaikan invoice itu, atau batalkan jika belum dibayar.':'Harga barang dipotong 5%. Hak diskon terpakai setelah pembayaran dikonfirmasi.'}</small>{error&&<small role="alert">{error}</small>}</div>{promotion.state==='guest'?<CustomerAccount/>:promotion.state==='reserved'&&promotion.orderId!==currentOrderId?<button type="button" className="text-button" disabled={busy} onClick={()=>void resume()}>{busy?'Membuka…':'Lanjutkan pesanan diskon'}</button>:null}</div>;
}
