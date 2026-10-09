'use client';
import {useEffect,useRef} from 'react';
import {MessageCircle,Camera,ArrowUpRight} from 'lucide-react';

export const WHATSAPP_URL='https://wa.me/6285174389305';
export const INSTAGRAM_PROFILE='https://www.instagram.com/elite.vtg/';
export const SUPPORT_TITLE='Got question? ask us on dm or Whatsapp';

export function CustomerSupport({hasCart=false}:{hasCart?:boolean}){
 const ref=useRef<HTMLDetailsElement>(null);
 useEffect(()=>{
  const close=(event:PointerEvent)=>{if(ref.current&&!ref.current.contains(event.target as Node))ref.current.open=false};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&ref.current?.open){ref.current.open=false;ref.current.querySelector('summary')?.focus()}};
  document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape)};
 },[]);
 return <details ref={ref} className={'customer-support'+(hasCart?' has-cart':'')}
  onPointerEnter={event=>{if(event.pointerType==='mouse'&&window.matchMedia('(hover: hover)').matches&&ref.current)ref.current.open=true}}
  onPointerLeave={event=>{if(event.pointerType==='mouse'&&ref.current&&!ref.current.contains(document.activeElement))ref.current.open=false}}
  onBlurCapture={event=>{if(ref.current&&!ref.current.contains(event.relatedTarget as Node))ref.current.open=false}}>
  <summary aria-label="Hubungi ELITE.VTG melalui DM atau WhatsApp"><MessageCircle size={24} aria-hidden="true"/></summary>
  <div className="support-panel">
   <strong className="support-title">{SUPPORT_TITLE}</strong>
   <p>Tanya ukuran, kondisi, atau pilihan barang.</p>
   <a className="support-channel" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer"><MessageCircle size={20}/><span><strong>WhatsApp</strong><small>Chat dengan ELITE.VTG</small></span><ArrowUpRight size={17}/></a>
   <a className="support-channel" href={INSTAGRAM_PROFILE} target="_blank" rel="noopener noreferrer"><Camera size={20}/><span><strong>Instagram</strong><small>Kirim DM lewat profil @elite.vtg</small></span><ArrowUpRight size={17}/></a>
  </div>
 </details>
}
