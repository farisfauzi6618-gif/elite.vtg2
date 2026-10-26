'use client';

import {Ruler,ChevronDown} from 'lucide-react';
import {useId,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogTrigger} from './ui/dialog';
import {WHATSAPP_URL} from '@/modules/catalog/customer-support';
import {RESERVE_HOURS} from '@/modules/order/reserve-types';

export function SizeGuideContent(){
  const id='size-guide-'+useId().replace(/[^a-zA-Z0-9_-]/g,''),[dimension,setDimension]=useState<'width'|'length'>('width');
  return <div className="size-guide-content size-guide-visual">
    <div className="size-guide-brand" aria-hidden="true">elite.vtg</div>
    <p className="shopping-help-kicker">Panduan ukuran · Atasan</p>
    <h3>Temukan ukuran yang pas.</h3>
    <p className="size-guide-intro">Bandingkan dengan baju yang nyaman Anda pakai. Ukur bajunya, bukan tubuh Anda.</p>
    <p className="size-guide-step"><span>01</span> Bentangkan di permukaan rata</p>
    <p className="size-guide-flat-note">Rapikan baju tanpa ditarik.</p>
    <svg className={'size-guide-drawing focus-'+dimension} viewBox="40 18 320 267" role="img" aria-label="Baju dibentangkan: A adalah lebar dari ketiak ke ketiak; B adalah panjang dari bahu dekat kerah ke ujung bawah.">
      <defs><marker id={id+'-arrow'} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse"><path d="M5 3 1 1 1 5Z" fill="currentColor"/></marker></defs>
      <path className="size-guide-cloth" d="M148 43 113 58 67 104 96 137 115 119 115 265Q184 278 253 265L253 119 272 137 301 104 255 58 220 43Q184 71 148 43Z"/>
      <path className="size-guide-seam" d="M148 43Q156 85 184 85Q212 85 220 43M149 48 170 67 184 62 198 67 219 48M184 65V117M177 115H191M72 106 99 131M296 106 269 131M119 258Q184 270 249 258"/>
      <g className="size-guide-measure size-guide-width"><path d="M118 137H250" markerStart={'url(#'+id+'-arrow)'} markerEnd={'url(#'+id+'-arrow)'}/><path d="M89 137H111" className="size-guide-reference"/><circle cx="73" cy="137" r="13" className="size-guide-letter-circle"/><text x="73" y="137" className="size-guide-letter">A</text></g>
      <g className="size-guide-measure size-guide-length"><path d="M220 43H324M253 267H324" className="size-guide-reference"/><path d="M316 46V264" markerStart={'url(#'+id+'-arrow)'} markerEnd={'url(#'+id+'-arrow)'}/><circle cx="338" cy="155" r="13" className="size-guide-letter-circle"/><text x="338" y="155" className="size-guide-letter">B</text></g>
    </svg>
    <p className="size-guide-step"><span>02</span> Ukur dalam sentimeter</p>
    <div className="size-guide-measure-buttons" role="group" aria-label="Bagian baju yang diukur">
      <button type="button" aria-pressed={dimension==='width'} aria-controls={id+'-tip'} onClick={()=>setDimension('width')}><span>A</span> Lebar</button>
      <button type="button" aria-pressed={dimension==='length'} aria-controls={id+'-tip'} onClick={()=>setDimension('length')}><span>B</span> Panjang</button>
    </div>
    <div className="size-guide-tip" id={id+'-tip'} aria-live="polite" aria-atomic="true">
      <strong>{dimension==='width'?'Dari ketiak ke ketiak.':'Dari bahu dekat kerah ke ujung bawah.'}</strong>
      <p>{dimension==='width'?'Ukur lurus dari sisi kiri ke kanan. Ini lebar baju saat dibentangkan, bukan lingkar dada.':'Mulai dari titik bahu teratas di dekat kerah. Ukur lurus sampai ujung bawah baju.'}</p>
    </div>
    <section className="size-guide-compare" aria-label="Membandingkan ukuran">
      <p className="size-guide-step"><span>03</span> Cocokkan</p>
      <p>Bandingkan hasilnya dengan <span className="size-guide-details-label">Details size</span> pada produk.</p>
      <dl className="size-guide-definitions"><div><dt>Size on tag</dt><dd>Ukuran pada label baju.</dd></div><div><dt>Size fit to</dt><dd>Acuan fit dari ELITE.VTG.</dd></div></dl>
      <p className="size-guide-actual">Utamakan ukuran aktual, bukan label. Potongan setiap brand bisa berbeda.</p>
    </section>
    <p className="shopping-help-note">Untuk celana, topi, dan aksesori, ikuti ukuran pada detail produk. Jika belum lengkap, tanyakan kepada kami sebelum membeli.</p>
  </div>;
}

export function SizeGuide({compact=false}:{compact?:boolean}){
  return <Dialog><DialogTrigger asChild><button type="button" className={'shopping-help-link'+(compact?' size-guide-inline':'')}><Ruler size={16} strokeWidth={1.5} aria-hidden="true"/>Panduan ukuran</button></DialogTrigger><DialogContent className="shopping-help-dialog size-guide-dialog"><DialogTitle className="sr-only">Panduan ukuran</DialogTitle><DialogDescription className="sr-only">Cara membandingkan ukuran pakaian dengan ukuran aktual produk ELITE.VTG.</DialogDescription><SizeGuideContent/><a className="shopping-help-contact" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Tanya ukuran lewat WhatsApp</a></DialogContent></Dialog>;
}

export const SHOPPING_FAQ=[
  {question:'Bagaimana cara membeli?',answer:'Pilih barang, cek ukuran dan kondisi, lalu pilih Beli sekarang atau tambahkan ke keranjang. Isi data penerima, pilih opsi pengiriman, lalu ikuti pembayaran dan unggah bukti di halaman pesanan.'},
  {question:'Apakah harus membuat akun?',answer:'Anda bisa checkout tanpa akun. Dengan akun, Anda dapat membuka Pesanan saya untuk melihat pesanan dan resi. Untuk checkout tanpa akun, simpan tautan invoice agar mudah kembali ke pesanan.'},
  {question:'Apakah wishlist atau keranjang menahan stok?',answer:'Tidak. Wishlist menyimpan pilihan di browser ini dan tidak tersinkron ke perangkat lain. Barang di wishlist atau keranjang tetap dapat dibeli pelanggan lain. Status pembayaran dan Reserve mengikuti konfirmasi ELITE.VTG.'},
  {question:'Apa pilihan pembayaran dan pengirimannya?',answer:'Pilihan rekening, QRIS, tarif, dan opsi pengiriman yang tersedia ditampilkan saat checkout. Jika memilih ongkir di tempat, harga barang tetap dibayar melalui website dan ongkir dibayar kepada kurir saat paket tiba.'},
  {question:'Bagaimana cara Reserve dengan DP?',answer:`Pilih Pesan dengan DP pada detail produk jika tersedia, lalu ikuti petunjuk pembayaran. Barang di-reserve ${RESERVE_HOURS} jam setelah DP dikonfirmasi. Reserve tidak memakai diskon; ikuti nominal dan batas pelunasan pada halaman pesanan.`},
  {question:'Di mana saya melihat resi?',answer:'Jika memiliki akun, buka Pesanan saya / lacak pesanan. Jika membeli tanpa akun, buka kembali tautan invoice yang Anda simpan. Resi akan tampil setelah ditambahkan oleh ELITE.VTG. Jika tautan tidak ditemukan, hubungi kami dengan informasi pesanan Anda.'},
  {question:'Bagaimana memastikan kondisi dan ukurannya?',answer:'Periksa foto detail, kondisi, minus, Size on tag, Size fit to, dan ukuran aktual pada produk. Gunakan Panduan ukuran untuk membandingkan dengan pakaian Anda. Tanyakan detail yang belum jelas melalui WhatsApp atau DM.'},
];

export function FaqContent(){
  return <div className="shopping-faq">{SHOPPING_FAQ.map(item=><details key={item.question}><summary>{item.question}<ChevronDown size={16} aria-hidden="true"/></summary><p>{item.answer}</p></details>)}</div>;
}

export function ShoppingFaq(){
  return <Dialog><DialogTrigger asChild><button type="button" className="shopping-help-link">Bantuan belanja / FAQ</button></DialogTrigger><DialogContent className="shopping-help-dialog shopping-faq-dialog"><DialogTitle>Bantuan belanja</DialogTitle><DialogDescription>Jawaban singkat, sebelum Anda memilih.</DialogDescription><FaqContent/><a className="shopping-help-contact" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Masih ada pertanyaan? Hubungi ELITE.VTG</a></DialogContent></Dialog>;
}
