'use client';
import {useEffect,useState} from 'react';
import {visibleRefresh} from '@/modules/catalog/visible-refresh';
import type {RewardQuote} from '@/modules/order/rewards';
import {money} from '@/modules/catalog/catalog-types';
export function useRewardQuote(input:Record<string,unknown>|null,version=''){
 const key=input?JSON.stringify(input):'',enabled=!!input, [quote,setQuote]=useState<RewardQuote|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{if(!enabled)return;const reload=()=>setRevision(v=>v+1);window.addEventListener('elite:customer-change',reload);const stop=visibleRefresh(reload,60000);return()=>{stop();window.removeEventListener('elite:customer-change',reload)}},[enabled]);
 useEffect(()=>{if(!key){setQuote(null);setLoading(false);setError('');return;}const controller=new AbortController();setQuote(null);setLoading(true);setError('');const timer=setTimeout(async()=>{try{const r=await fetch('/api/rewards/quote',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:key,signal:controller.signal});const value=await r.json();if(!r.ok)throw Error(value.error||'Reward belum dapat diperiksa.');if(!controller.signal.aborted)setQuote(value);}catch(e){if(!controller.signal.aborted)setError((e as Error).message);}finally{if(!controller.signal.aborted)setLoading(false);}},150);return()=>{clearTimeout(timer);controller.abort();}},[key,revision,version]);
 return {quote,loading,error,refresh:()=>setRevision(v=>v+1)};
}
export function CatalogRewardNotice({count}:{count:number}){
 const [dismissed,setDismissed]=useState(false);useEffect(()=>setDismissed(false),[count]);if(!count||dismissed)return null;
 return <aside className="catalog-reward-notice" aria-label="ELITE Reward"><p>Voucher kamu aktif <span>· otomatis digunakan saat checkout</span></p><button type="button" aria-label="Tutup pemberitahuan voucher" onClick={()=>setDismissed(true)}>×</button></aside>;
}
export function ProductReward({productId,canOrder,version,variantId,member=true}:{variantId?:string|null;member?:boolean;productId:string;canOrder:boolean;version:string}){
 const {quote}=useRewardQuote(member?{context:'product',productId,...(variantId?{variantId}:{})}:null,version);if(!quote?.loggedIn||!quote.options.length)return null;
 return <div className="personal-reward">{canOrder&&quote.personalPrice!=null?<><span>Your ELITE Price</span><p>{money(quote.personalPrice)}</p>{quote.selected?.id==='first-purchase-5'&&<small>Untuk 1 barang · diskon maks. Rp50.000 per pesanan</small>}</>:<p>ELITE Reward tersedia <small>· diterapkan sesuai syarat saat checkout</small></p>}</div>;
}
export function RewardSelection({quote,choice,onChange,loading,error,onRetry}:{quote:RewardQuote|null;choice:string;onChange:(v:string)=>void;loading:boolean;error:string;onRetry:()=>void}){
 if(error)return <div className="reward-selection reward-error"><p role="status">{error}</p><button type="button" className="text-button" onClick={()=>{onChange('auto');onRetry()}}>Periksa ulang reward</button></div>;
 if(loading)return <p className="reward-checking" role="status">Memeriksa benefit akun…</p>;
 if(!quote?.loggedIn||!quote.options.length)return null;
 return <div className="reward-selection">{quote.options.length>0?(quote.options.length>1||choice!=='auto'||quote.options.some(o=>o.id.startsWith('loyalty-'))?<label>ELITE Rewards<select aria-label="Pilih ELITE Reward" value={choice} onChange={e=>onChange(e.target.value)}><option value="auto">Voucher terbaik otomatis digunakan</option>{quote.options.map(o=><option key={o.id} value={o.id} disabled={!o.applicable}>{o.label}{o.applicable?' · Available · −'+money(o.discount):' · syarat belum terpenuhi'}</option>)}<option value="none">Tanpa voucher</option></select></label>:<p>{quote.selected?.label??'ELITE Reward tersedia'}</p>):<p>ELITE Rewards</p>}{choice==='auto'&&quote.selected&&<small>Voucher terbaik otomatis digunakan.</small>}{quote.options.filter(o=>!o.applicable).map(o=><small key={o.id}>{o.label}: {o.requirement}</small>)}</div>;
}
