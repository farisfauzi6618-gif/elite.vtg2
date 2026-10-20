'use client';
import {useEffect,useRef,useState} from 'react';
import {MessageCircle,Camera,ArrowUpRight} from 'lucide-react';
import {WHATSAPP_URL,WHATSAPP_DISPLAY,copySupportNumber} from '@/modules/catalog/customer-support';

export {WHATSAPP_URL} from '@/modules/catalog/customer-support';
export const INSTAGRAM_PROFILE='https://www.instagram.com/elite.vtg/';
export const SUPPORT_TITLE='Got question? ask us on dm or Whatsapp';

export function CustomerSupport({hasCart=false}:{hasCart?:boolean}){
 const ref=useRef<HTMLDetailsElement>(null);
 const [copyStatus,setCopyStatus]=useState('');
 async function copyNumber(){const copied=await copySupportNumber(value=>navigator.clipboard.writeText(value));setCopyStatus(copied?'Nomor tersalin.':'Tekan lama nomor di atas untuk menyalin, lalu buka WhatsApp.');}
 useEffect(()=>{
  const close=(event:PointerEvent)=>{if(ref.current&&!ref.current.contains(event.target as Node))ref.current.open=false};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&ref.current?.open){ref.current.open=false;ref.current.querySelector('summary')?.focus()}};
  document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape)};
 },[]);
 return <details ref={ref} className={'customer-support'+(hasCart?' has-cart':'')}
  onToggle={event=>{if(!event.currentTarget.open)setCopyStatus('')}}
  onBlurCapture={event=>{if(event.relatedTarget&&ref.current&&!ref.current.contains(event.relatedTarget as Node))ref.current.open=false}}>
  <summary aria-label="Hubungi ELITE.VTG melalui DM atau WhatsApp"><MessageCircle size={24} aria-hidden="true"/></summary>
  <div className="support-panel">
   <strong className="support-title">{SUPPORT_TITLE}</strong>
   <p>Tanya ukuran, kondisi, atau pilihan barang.</p>
   <a className="support-channel" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"><MessageCircle size={20}/><span><strong>WhatsApp</strong><small>Chat dengan ELITE.VTG</small></span><ArrowUpRight size={17}/></a>
   <div className="support-number"><span>{WHATSAPP_DISPLAY}</span><button type="button" className="support-copy" onClick={()=>void copyNumber()}>Salin nomor</button></div>
   {copyStatus&&<p className="support-copy-status" role="status" aria-live="polite">{copyStatus}</p>}
   <a className="support-channel" href={INSTAGRAM_PROFILE} target="_blank" rel="noopener noreferrer"><Camera size={20}/><span><strong>Instagram</strong><small>Kirim DM lewat profil @elite.vtg</small></span><ArrowUpRight size={17}/></a>
  </div>
 </details>
}
