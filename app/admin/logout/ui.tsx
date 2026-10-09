'use client';
import { useState } from 'react';
export default function Logout() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function logout() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/owner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) });
      if (!response.ok) throw new Error('Belum dapat keluar. Coba lagi.');
      window.location.assign('/admin/login');
    } catch (cause) { setBusy(false); setError((cause as Error).message); }
  }
  return <><button className="button primary" disabled={busy} onClick={() => void logout()}>{busy ? 'Keluar…' : 'Keluar'}</button> <a className="quiet-link" href="/admin">Kembali</a>{error && <p role="alert">{error}</p>}</>;
}
