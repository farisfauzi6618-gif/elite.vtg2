'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {useClientReady} from '@/components/use-client-ready';
export default function Invitation(){return useClientReady()?<InvitationForm/>:<p role="status">Memeriksa tautan…</p>;}
function InvitationForm(){
  const [token,setToken]=useState(()=>new URLSearchParams(window.location.hash.slice(1)).get('token')||''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  useEffect(()=>{window.history.replaceState(null,'',window.location.pathname);},[]);
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/auth/admin-invitation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,email,password,confirmPassword})}),v=await r.json();if(!r.ok)throw new Error(v.error||'Undangan belum berhasil digunakan.');setToken('');setPassword('');setConfirmPassword('');setDone(true);}catch(e){setError(e instanceof Error?e.message:'Aktivasi belum berhasil.');}finally{setBusy(false);}}
  if(done)return <section role="status"><h2>Akun Anda sudah aktif</h2><p>Masuk dengan email undangan dan kata sandi yang baru Anda buat.</p><a href="/admin/login">Masuk ke admin ELITE.VTG</a></section>;
  if(!token)return <section><p role="alert">Tautan undangan tidak lengkap. Buka tautan pribadi dari pemilik utama.</p><a href="/admin/login">Kembali ke login admin</a></section>;
  return <section><form onSubmit={submit}><fieldset disabled={busy}><label>Email penerima undangan<input type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Kata sandi baru · 12–128 karakter<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Ulangi kata sandi<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>{error&&<p className="security-error" role="alert">{error}</p>}<button>{busy?'Mengaktifkan akun…':'Aktifkan akun pengelola'}</button></fieldset></form></section>;
}
