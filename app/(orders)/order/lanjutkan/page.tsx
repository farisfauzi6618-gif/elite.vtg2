'use client';

import { useEffect, useRef, useState } from 'react';

export default function ContinueInvoice() {
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    const params = new URLSearchParams(window.location.search), next = new URLSearchParams();
    for (const name of ['catalog', 'basket']) {
      const value = params.get(name);
      if (value && /^[a-f0-9-]{36,64}$/.test(value)) next.set(name, value);
    }
    // Remove the capability immediately; fragments never reach HTTP logs/referrers.
    window.history.replaceState(null, '', window.location.pathname);
    if (!/^[a-f0-9]{64}$/.test(token)) { setError('Buka kembali invoice melalui situs lama pada perangkat yang digunakan untuk memesan.'); return; }
    void (async () => {
      try {
        const response = await fetch('/api/order/resume', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token}), cache:'no-store'});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Invoice belum dapat dibuka.');
        window.location.replace('/order' + (next.size ? '?' + next.toString() : ''));
      } catch (e) { setError(e instanceof Error ? e.message : 'Invoice belum dapat dibuka.'); }
    })();
  }, []);
  return <main style={{maxWidth:'32rem',margin:'3rem auto',padding:'1.25rem',lineHeight:1.6}}>
    <h1 style={{fontSize:'1.5rem'}}>Invoice ELITE.VTG</h1>
    <p role={error ? 'alert' : 'status'}>{error || 'Membuka invoice Anda…'}</p>
    {error && <a href="/">Kembali ke katalog</a>}
  </main>;
}
