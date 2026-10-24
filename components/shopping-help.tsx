'use client';

import {Ruler,ChevronDown} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription,DialogTrigger} from './ui/dialog';
import {WHATSAPP_URL} from '@/modules/catalog/customer-support';
import {RESERVE_HOURS} from '@/modules/order/reserve-types';

export function SizeGuideContent(){
  return <div className="size-guide-content"><p className="shopping-help-kicker">FIND YOUR FIT</p><h3>Bandingkan dengan pakaian favorit Anda.</h3><p>Letakkan pakaian yang pas di permukaan rata, tanpa ditarik. Ukur dalam sentimeter, lalu bandingkan dengan detail ukuran produk.</p>
    <ol><li><strong>Lebar</strong><span>Untuk atasan, ukur lurus dari ketiak ke ketiak. Angka ini adalah lebar saat dibentangkan, bukan lingkar dada.</span></li><li><strong>Panjang</strong><span>Untuk atasan, ukur dari titik bahu teratas di dekat kerah sampai ujung bawah pakaian.</span></li><li><strong>Cocokkan ukuran aktual</strong><span>Size on tag adalah ukuran pada label. Size fit to adalah acuan fit dari ELITE.VTG. Utamakan ukuran aktual karena potongan tiap brand bisa berbeda.</span></li></ol>
    <p className="shopping-help-note">Panduan di atas untuk atasan. Untuk celana, topi, atau aksesori, ikuti ukuran yang tercantum pada produk. Jika belum lengkap, tanyakan kepada kami sebelum membeli.</p>
  </div>;
}

export function SizeGuide({compact=false}:{compact?:boolean}){
  return <Dialog><DialogTrigger asChild><button type="button" className={'shopping-help-link'+(compact?' size-guide-inline':'')}><Ruler size={16} strokeWidth={1.5} aria-hidden="true"/>Panduan ukuran</button></DialogTrigger><DialogContent className="shopping-help-dialog"><DialogTitle>Panduan ukuran</DialogTitle><DialogDescription className="sr-only">Cara membandingkan ukuran pakaian dengan ukuran aktual produk ELITE.VTG.</DialogDescription><SizeGuideContent/><a className="shopping-help-contact" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Tanya ukuran lewat WhatsApp</a></DialogContent></Dialog>;
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
