'use client';
import {useEffect,useState} from 'react';
import type {PurchasePromotion} from '@/modules/order/first-purchase';
import type {CustomerProfile} from '@/modules/catalog/customer-types';
export function usePurchaseBenefit() {
 const [promotion,setPromotion]=useState<PurchasePromotion|null>(null),[customer,setCustomer]=useState<CustomerProfile|null>(null),[loading,setLoading]=useState(true),[rewardCount,setRewardCount]=useState(0);
 useEffect(()=>{
  let active=true;
  async function load(){try{const reply=await fetch('/api/customer',{cache:'no-store'});if(!reply.ok)throw Error();const data=await reply.json();if(active){setPromotion(data.promotion);setCustomer(data.customer);setRewardCount(data.rewardCount??0);}}catch{if(active){setPromotion(null);setRewardCount(0);}}finally{if(active)setLoading(false);}}
  void load();window.addEventListener('elite:customer-change',load);window.addEventListener('focus',load);
  return()=>{active=false;window.removeEventListener('elite:customer-change',load);window.removeEventListener('focus',load)};
 },[]);
 return {promotion,customer,loading,rewardCount};
}
export function PurchaseBenefit({promotion,currentOrderId}:{promotion:PurchasePromotion|null;currentOrderId?:string}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function resume(){setBusy(true);setError('');try{const reply=await fetch('/api/order/first-purchase',{method:'POST'});const value=await reply.json();if(!reply.ok)throw Error(value.error||'Invoice belum dapat dibuka.');window.location.assign('/order');}catch(e){setError((e as Error).message);setBusy(false);}}
 if(!promotion||promotion.state!=='reserved'||promotion.orderId===currentOrderId)return null;
 return <div className="purchase-benefit"><div><p>ELITE Reward tersimpan di invoice sebelumnya</p><small>Selesaikan invoice itu, atau batalkan jika belum dibayar.</small>{error&&<small role="alert">{error}</small>}</div><button type="button" className="text-button" disabled={busy} onClick={()=>void resume()}>{busy?'Membuka…':'Lanjutkan pesanan diskon'}</button></div>;
}
