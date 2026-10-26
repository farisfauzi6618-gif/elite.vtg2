'use client';
import {useState,type FormEvent} from 'react';
import {recoveryHelpUrl} from '@/modules/catalog/customer-recovery-types';
import {WHATSAPP_URL} from '@/modules/catalog/customer-support';
import './customer-recovery.css';
export function CustomerPasswordRecovery({initialIdentity='',onBack}:{initialIdentity?:string;onBack?:()=>void}){
 const [identity,setIdentity]=useState(initialIdentity),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[phone,setPhone]=useState(false);
 async function submit(event:FormEvent){
  event.preventDefault();setError('');setMessage('');setPhone(false);
  const value=identity.trim();
  if(!value.includes('@')){const digits=value.replace(/[\s()-]/g,'');if(!/^(?:\+62|62|0)\d{8,13}$/.test(digits)){setError('Isi email atau nomor HP Indonesia yang digunakan saat mendaftar.');return}setPhone(true);return}
  setBusy(true);try{const reply=await fetch('/api/customer/password-reset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identity:value}),signal:AbortSignal.timeout(15000)}),result=await reply.json();if(!reply.ok)throw Error(result.error||'Permintaan belum berhasil. Coba lagi.');setMessage(result.message);}catch(error){setError(error instanceof Error&&error.name!=='TimeoutError'?error.message:'Koneksi terlalu lama. Coba lagi atau hubungi bantuan.');}finally{setBusy(false)}
 }
 return <div className="customer-recovery">
  {phone?<div className="recovery-result" role="status"><p>Pemulihan akun nomor HP dibantu admin melalui WhatsApp.</p><p>Gunakan nomor yang terdaftar pada akun. Setelah verifikasi, admin mengirim link untuk membuat kata sandi baru.</p><a className="button primary" href={recoveryHelpUrl(identity)} target="_blank" rel="noopener noreferrer">Hubungi admin WhatsApp</a><p className="help-text">Nomor sudah tidak aktif? Sampaikan kepada admin untuk pemeriksaan lebih lanjut.</p><button type="button" className="text-button" onClick={()=>setPhone(false)}>Gunakan email / nomor lain</button></div>:message?<div className="recovery-result" role="status"><p>{message}</p><a className="text-button" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Perlu bantuan?</a><button type="button" className="text-button" onClick={()=>setMessage('')}>Kembali ke formulir</button></div>:<form onSubmit={submit} className="customer-account-form"><label htmlFor="recovery-identity">Email / nomor HP terdaftar<input id="recovery-identity" required maxLength={254} autoComplete="username" autoCapitalize="none" spellCheck={false} value={identity} onChange={event=>setIdentity(event.target.value)} placeholder="nama@email.com / 08xxxxxxxxxx"/></label>{error&&<p className="notice error" role="alert">{error}</p>}<button className="button primary" disabled={busy}>{busy?'Memproses…':'Lanjutkan pemulihan'}</button>{error&&<a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-button">Hubungi bantuan ELITE.VTG</a>}</form>}
  {onBack&&<button type="button" className="text-button recovery-back" disabled={busy} onClick={onBack}>Kembali ke login</button>}
 </div>;
}
