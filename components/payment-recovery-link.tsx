'use client';
import {useState} from 'react';
import {Copy,Check} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {copyText} from '@/modules/order/clipboard';

export function PaymentRecoveryLink({invoice,disabled=false}:{invoice:string;disabled?:boolean}){
 const [busy,setBusy]=useState(false),[copied,setCopied]=useState(false),[error,setError]=useState(''),[manual,setManual]=useState('');
 async function save(){
  if(busy||disabled)return;
  setBusy(true);setCopied(false);setError('');setManual('');
  try{
   const response=await fetch('/api/order/payment-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invoice}),cache:'no-store',signal:AbortSignal.timeout(15000)});
   const value=await response.json();
   if(!response.ok)throw Error(value.error||'Tautan belum dapat dibuat. Coba lagi.');
   if(typeof value.url!=='string')throw Error('Tautan belum dapat dibuat. Coba lagi.');
   try{await copyText(value.url);setCopied(true)}catch{setManual(value.url)}
  }catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'?e.message:'Koneksi terlalu lama. Coba salin tautan sekali lagi.')}
  finally{setBusy(false)}
 }
 return <aside className="payment-recovery-link" aria-label="Simpan akses pembayaran">
  <Button type="button" className="text-button" disabled={disabled||busy} onClick={()=>void save()}>{copied?<Check size={16}/>:<Copy size={16}/>} {busy?'Menyiapkan tautan…':copied?'Tautan pembayaran tersalin':'Salin tautan pembayaran'}</Button>
  <small>Simpan untuk melanjutkan di perangkat lain. Tautan ini bersifat pribadi dan berlaku sampai 7 hari sejak invoice dibuat.</small>
  {copied&&<p role="status">Tautan tersalin. Simpan sebelum meninggalkan halaman pembayaran.</p>}
  {manual&&<label>Tekan lama tautan untuk menyalin<input readOnly value={manual} onFocus={e=>e.currentTarget.select()} aria-label="Tautan pembayaran pribadi"/></label>}
  {error&&<p className="field-error" role="alert">{error}</p>}
 </aside>;
}
