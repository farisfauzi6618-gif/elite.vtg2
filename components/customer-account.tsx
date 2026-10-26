'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {readCustomer,invalidateCustomer} from '@/modules/catalog/customer-request';
import {visibleRefresh} from '@/modules/catalog/visible-refresh';
import type {PurchasePromotion} from '@/modules/order/first-purchase';
import { UserRound, LockKeyhole, Eye, EyeOff, LogOut } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { CustomerProfile } from '@/modules/catalog/customer-types';
import {LoyaltyCard} from '@/components/loyalty-card';
import {MemberInvite} from '@/components/member-invite';
import {CustomerBirthday} from '@/components/customer-birthday';
import {CustomerPasswordRecovery} from '@/components/customer-password-recovery';

export function CustomerAccount({inviteMembers=false,showOrdersLink=true,signedOutLabel='Masuk'}:{inviteMembers?:boolean;showOrdersLink?:boolean;signedOutLabel?:string}={}) {
  const [promotion,setPromotion]=useState<PurchasePromotion|null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null), [open, setOpen] = useState(false), [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [name, setName] = useState(''), [identity, setIdentity] = useState(''), [password, setPassword] = useState(''), [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      try { const value = await readCustomer(); if (active) { setCustomer(value.customer);setPromotion(value.promotion); setError(''); } }
      catch { if (active) setError('Akun belum dapat dimuat. Tutup dan buka lagi untuk mencoba.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    const focus = () => { void load(); };
    const stop=visibleRefresh(focus);window.addEventListener('elite:customer-change',focus);
    return () => { active = false; stop();window.removeEventListener('elite:customer-change',focus); };
  }, [open]);
  function changeMode(value: 'login' | 'register' | 'forgot') { setMode(value); setError(''); setPassword(''); setShowPassword(false); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    setBusy(true);
    try {
      const reply = await fetch('/api/customer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: mode, identity, password, ...(mode === 'register' ? { name, consent } : {}) }) });
      const value = await reply.json() as {customer:CustomerProfile;error?:string};
      if (!reply.ok) throw new Error(value.error || 'Akun belum dapat dibuka. Coba lagi.');
      setCustomer(value.customer); setPassword(''); setShowPassword(false); setOpen(false);invalidateCustomer();window.dispatchEvent(new Event('elite:customer-change'));
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try {
      const reply = await fetch('/api/customer', { method: 'DELETE' });
      if (!reply.ok) throw new Error((await reply.json() as {error?:string}).error || 'Belum berhasil keluar. Coba lagi.');
      setCustomer(null); setPassword(''); setOpen(false);invalidateCustomer();window.dispatchEvent(new Event('elite:customer-change'));
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <><div className="account-navigation">{showOrdersLink&&<a className="quiet-link account-orders-link" href={customer?'/pesanan':'/lacak'}>{customer?'Pesanan saya':'Lacak pesanan'}</a>}<Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) { setPassword(''); setShowPassword(false); } }}>
    <DialogTrigger asChild><button type="button" className="quiet-link account-trigger" aria-label={customer ? 'Buka akun pelanggan' : 'Masuk atau daftar pelanggan'}><UserRound size={19} aria-hidden="true"/><span>{customer ? 'Akun saya' : signedOutLabel}</span></button></DialogTrigger>
    <DialogContent className="customer-account-dialog">
      <DialogHeader><DialogTitle>{customer ? 'Akun saya' : mode === 'forgot' ? 'Lupa kata sandi?' : mode === 'register' ? 'Daftar' : 'Masuk'}</DialogTitle><DialogDescription>{customer ? 'Lihat pesanan, nomor resi, dan data penerima Anda.' : mode === 'forgot' ? 'Pulihkan akses menggunakan email atau nomor HP terdaftar.' : mode === 'register' ? 'Daftar untuk diskon 5% harga barang pada pembelian pertama, maksimal Rp50.000. Diskon otomatis saat Anda login.' : 'Masuk dengan email atau nomor HP yang Anda gunakan saat mendaftar.'}</DialogDescription></DialogHeader>
      {error && <p className="notice error" role="alert">{error}</p>}
      {loading ? <p role="status">Memuat akun…</p> : customer ? <div className="customer-profile">{promotion&&<p className="account-benefit">{promotion.state==='available'?'Diskon pembelian pertama 5% tersedia, maksimal Rp50.000. Login saat checkout agar diterapkan otomatis.':promotion.state==='reserved'?'Diskon 5% tersimpan pada invoice yang menunggu pembayaran.':'Promo pembelian pertama sudah terpakai.'}</p>}<dl><div><dt>Nama lengkap</dt><dd>{customer.name}</dd></div><div><dt>{customer.email ? 'Email' : 'Nomor HP'}</dt><dd>{customer.identity}</dd></div>{customer.birthday && <div><dt>Ulang tahun</dt><dd>{new Date(customer.birthday + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>}</dl><CustomerBirthday key={customer.identity} customer={customer} onChange={setCustomer}/><a className="button secondary" href="/pesanan">Pesanan saya</a>{open&&<LoyaltyCard/>}<button type="button" className="button secondary" disabled={busy} onClick={() => void logout()}><LogOut size={17}/>{busy ? 'Keluar…' : 'Keluar dari akun'}</button></div> : mode === 'forgot' ? <CustomerPasswordRecovery initialIdentity={identity} onBack={()=>changeMode('login')}/> : <form onSubmit={submit} className="customer-account-form">
        {mode === 'register' && <label htmlFor="customer-name">Nama lengkap<input id="customer-name" name="name" autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Nama lengkap Anda"/></label>}
        <label htmlFor="customer-identity">Email / nomor HP<div className="account-input-icon"><UserRound size={18} aria-hidden="true"/><input id="customer-identity" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} value={identity} onChange={e => setIdentity(e.target.value)} placeholder="nama@email.com / 08xxxxxxxxxx"/></div></label>
        <label htmlFor="customer-password">Kata sandi<div className="account-input-icon"><LockKeyhole size={18} aria-hidden="true"/><input id="customer-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 12 : 1} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'register' ? 'Minimal 12 karakter' : 'Kata sandi Anda'}/><button type="button" className="account-password-toggle" aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
        {mode === 'login'&&<button type="button" className="text-button account-forgot" onClick={()=>changeMode('forgot')}>Lupa kata sandi?</button>}
        {mode === 'register' && <><label className="account-consent"><input type="checkbox" checked={consent} required onChange={e => setConsent(e.target.checked)}/><span>Saya setuju data ini disimpan untuk akun dan proses belanja ELITE.VTG.</span></label></>}
        <button className="button primary account-submit" disabled={busy || (mode === 'register' && !consent)}>{busy ? 'Memproses…' : mode === 'register' ? 'Buat akun baru' : 'Masuk'}</button>
        <p className="account-switch">{mode === 'register' ? 'Sudah punya akun?' : 'Belum punya akun?'} <button type="button" className="text-button" onClick={() => changeMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? 'Login di sini' : 'Daftar di sini'}</button></p>
        <p className="account-guest-note">Anda tetap bisa belanja tanpa membuat akun.</p>
      </form>}
    </DialogContent>
  </Dialog></div>{inviteMembers&&<MemberInvite eligible={!loading&&!error&&customer===null} blocked={open} onJoin={()=>{changeMode('register');setOpen(true)}}/>}</>;
}
