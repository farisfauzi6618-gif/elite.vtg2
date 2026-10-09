'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { UserRound, LockKeyhole, Eye, EyeOff, LogOut } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import type { CustomerProfile } from '@/modules/catalog/customer-types';

const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
export function CustomerAccount() {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null), [open, setOpen] = useState(false), [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState(''), [identity, setIdentity] = useState(''), [password, setPassword] = useState(''), [showPassword, setShowPassword] = useState(false);
  const [day, setDay] = useState(''), [month, setMonth] = useState(''), [year, setYear] = useState(''), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    async function load() {
      try { const reply = await fetch('/api/customer', { cache: 'no-store' }); if (!reply.ok) throw new Error(); const value = await reply.json() as {customer:CustomerProfile|null}; if (active) { setCustomer(value.customer); setError(''); } }
      catch { if (active) setError('Akun belum dapat dimuat. Tutup dan buka lagi untuk mencoba.'); }
      finally { if (active) setLoading(false); }
    }
    void load();
    const focus = () => { void load(); };
    window.addEventListener('focus', focus);
    return () => { active = false; window.removeEventListener('focus', focus); };
  }, [open]);
  function changeMode(value: 'login' | 'register') { setMode(value); setError(''); setPassword(''); setShowPassword(false); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const hasBirthday = !!(day || month || year);
    if (mode === 'register' && hasBirthday && !(day && month && year)) { setError('Lengkapi tanggal, bulan, dan tahun, atau kosongkan semuanya.'); return; }
    setBusy(true);
    try {
      const reply = await fetch('/api/customer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: mode, identity, password, ...(mode === 'register' ? { name, birthday: hasBirthday ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : null, consent } : {}) }) });
      const value = await reply.json() as {customer:CustomerProfile;error?:string};
      if (!reply.ok) throw new Error(value.error || 'Akun belum dapat dibuka. Coba lagi.');
      setCustomer(value.customer); setPassword(''); setShowPassword(false); setOpen(false);
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try {
      const reply = await fetch('/api/customer', { method: 'DELETE' });
      if (!reply.ok) throw new Error((await reply.json() as {error?:string}).error || 'Belum berhasil keluar. Coba lagi.');
      setCustomer(null); setPassword(''); setOpen(false);
    } catch (error) { setError((error as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={value => { setOpen(value); if (!value) { setPassword(''); setShowPassword(false); } }}>
    <DialogTrigger asChild><button className="quiet-link account-trigger" aria-label={customer ? 'Buka akun pelanggan' : 'Masuk atau daftar pelanggan'}><UserRound size={19} aria-hidden="true"/><span>{customer ? 'Akun saya' : 'Masuk'}</span></button></DialogTrigger>
    <DialogContent className="customer-account-dialog">
      <DialogHeader><DialogTitle>{customer ? 'Akun saya' : mode === 'register' ? 'Daftar' : 'Masuk'}</DialogTitle><DialogDescription>{customer ? 'Gunakan akun ini untuk mengisi data penerima lebih cepat.' : mode === 'register' ? 'Buat akun ELITE.VTG agar nama dan nomor HP yang tersimpan dapat terisi saat checkout.' : 'Masuk dengan email atau nomor HP yang Anda gunakan saat mendaftar.'}</DialogDescription></DialogHeader>
      {error && <p className="notice error" role="alert">{error}</p>}
      {loading ? <p role="status">Memuat akun…</p> : customer ? <div className="customer-profile"><dl><div><dt>Nama lengkap</dt><dd>{customer.name}</dd></div><div><dt>{customer.email ? 'Email' : 'Nomor HP'}</dt><dd>{customer.identity}</dd></div>{customer.birthday && <div><dt>Ulang tahun</dt><dd>{new Date(customer.birthday + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>}</dl><button type="button" className="button secondary" disabled={busy} onClick={() => void logout()}><LogOut size={17}/>{busy ? 'Keluar…' : 'Keluar dari akun'}</button></div> : <form onSubmit={submit} className="customer-account-form">
        {mode === 'register' && <label htmlFor="customer-name">Nama lengkap<input id="customer-name" name="name" autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} placeholder="Nama lengkap Anda"/></label>}
        <label htmlFor="customer-identity">Email / nomor HP<div className="account-input-icon"><UserRound size={18} aria-hidden="true"/><input id="customer-identity" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} value={identity} onChange={e => setIdentity(e.target.value)} placeholder="nama@email.com / 08xxxxxxxxxx"/></div></label>
        <label htmlFor="customer-password">Kata sandi<div className="account-input-icon"><LockKeyhole size={18} aria-hidden="true"/><input id="customer-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={mode === 'register' ? 12 : 1} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'register' ? 'Minimal 12 karakter' : 'Kata sandi Anda'}/><button type="button" className="account-password-toggle" aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</button></div></label>
        {mode === 'register' && <><fieldset className="account-birthday"><legend>Ulang tahun saya <span>(opsional)</span></legend><div><select aria-label="Tanggal ulang tahun" value={day} onChange={e => setDay(e.target.value)}><option value="">Tanggal</option>{Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</select><select aria-label="Bulan ulang tahun" value={month} onChange={e => setMonth(e.target.value)}><option value="">Bulan</option>{months.map((value, i) => <option key={value} value={i + 1}>{value}</option>)}</select><select aria-label="Tahun ulang tahun" value={year} onChange={e => setYear(e.target.value)}><option value="">Tahun</option>{Array.from({ length: new Date().getFullYear() - 1899 }, (_, i) => <option key={i} value={new Date().getFullYear() - i}>{new Date().getFullYear() - i}</option>)}</select></div></fieldset><label className="account-consent"><input type="checkbox" checked={consent} required onChange={e => setConsent(e.target.checked)}/><span>Saya setuju data ini disimpan untuk akun dan proses belanja ELITE.VTG.</span></label></>}
        <button className="button primary account-submit" disabled={busy || (mode === 'register' && !consent)}>{busy ? 'Memproses…' : mode === 'register' ? 'Buat akun baru' : 'Masuk'}</button>
        <p className="account-switch">{mode === 'register' ? 'Sudah punya akun?' : 'Belum punya akun?'} <button type="button" className="text-button" onClick={() => changeMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? 'Login di sini' : 'Daftar di sini'}</button></p>
        <p className="account-guest-note">Anda tetap bisa belanja tanpa membuat akun.</p>
      </form>}
    </DialogContent>
  </Dialog>;
}
