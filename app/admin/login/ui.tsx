'use client';
import { useState, type FormEvent } from 'react';
export default function Login() {
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const next = new URLSearchParams(window.location.search).get('next') || '/admin';
      const response = await fetch('/api/auth/owner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, next }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Belum dapat masuk.');
      setPassword(''); window.location.assign(data.next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Belum dapat masuk.'); setBusy(false); }
  }
  return <form onSubmit={submit}><label>Email pemilik<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label><label>Kata sandi<input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p className="notice error" role="alert">{error}</p>}<button type="submit" className="button primary" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button></form>;
}
