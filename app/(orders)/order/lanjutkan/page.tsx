'use client';

import { useEffect, useRef, useState } from 'react';
import {invoiceResumeInput,invoiceResumeDestination} from '@/modules/order/checkout-session';

export default function ContinueInvoice() {
  const started = useRef(false);
  const retry=useRef<(()=>Promise<void>)|null>(null);
  const [busy,setBusy]=useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const search=window.location.search,hash=window.location.hash;
    // Remove the capability immediately; fragments never reach HTTP logs/referrers.
    window.history.replaceState(null, '', window.location.pathname);
    let input:ReturnType<typeof invoiceResumeInput>;
    try{input=invoiceResumeInput(search,hash)}catch(e){setError(e instanceof Error?e.message:'Tautan tidak valid.');return}
    retry.current=async () => {
      setBusy(true);setError('');
      try {
        const response = await fetch('/api/order/resume', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(input.body), cache:'no-store',signal:AbortSignal.timeout(20000)});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Invoice belum dapat dibuka.');
        window.location.replace(invoiceResumeDestination(data,input.fallback));
      } catch (e) { setError(e instanceof Error&&e.name!=='TimeoutError' ? e.message : 'Koneksi terlalu lama. Coba buka invoice sekali lagi.'); }
      finally{setBusy(false)}
    };
    void retry.current();
  }, []);
  return <main style={{maxWidth:'32rem',margin:'3rem auto',padding:'1.25rem',lineHeight:1.6}}>
    <h1 style={{fontSize:'1.5rem'}}>Invoice ELITE.VTG</h1>
    <p role={error ? 'alert' : 'status'}>{error || 'Membuka invoice Anda…'}</p>
    {error&&retry.current&&<button type="button" className="button secondary" disabled={busy} onClick={()=>void retry.current?.()}>Coba lagi</button>}
    {error && <p><a href="/lacak">Lacak pesanan jika bukti sudah dikirim</a> · <a href="/pesanan">Pesanan saya</a> · <a href="/">Kembali ke katalog</a></p>}
  </main>;
}
