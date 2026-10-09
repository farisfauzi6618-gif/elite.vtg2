"use client";
/* eslint-disable @next/next/no-img-element -- Preserve QRIS and private proof previews. */
import { BrandLogo } from "@/components/brand-logo";
import Link from "next/link";
import { useEffect,useRef,useState,type FormEvent } from "react";
import { ArrowRight,ArrowLeft,Check,CheckCircle2,Copy,Download,FileCheck2,LockKeyhole,Package,Upload,ReceiptText,RefreshCw,Truck,Plus,Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox,ComboboxInput,ComboboxContent,ComboboxList,ComboboxItem,ComboboxEmpty } from "@/components/ui/combobox";
import { copyText } from "@/modules/order/clipboard";
import { preparePaymentProof } from "@/modules/order/payment-proof";
import { dateLabel,rupiah,invoiceText,type Order } from "@/modules/order/order-types";
import { jntServiceName,type ShippingLocation,type ShippingQuote } from "@/modules/order/shipping-types";
import { MAX_ORDER_ITEMS,normalizeOrderItems,orderItems,orderShippingGrams } from "@/modules/order/order-items";
import { PaymentPanel } from "./payment-panel";
import { paymentMethodLabel,paymentStatusLabel,storedPaymentMethod,type PaymentConfig,type PaymentMethod } from "@/modules/order/payment-types";
import { TrackingCard } from "../tracking-card";
import { resumeCatalogSelection,catalogReturnHref,recoverSubmittedOrder } from "@/modules/order/checkout-session";
const blank={name:"",phone:"",address:"",postcode:"",item:"",itemAmount:""};
async function request<T>(path:string,init?:RequestInit):Promise<T>{const r=await fetch(path,init);const v=await r.json() as {error?:string};if(!r.ok||v.error)throw new Error(v.error||"Permintaan belum berhasil.");return v as T;}
const shipping=<T,>(body:Record<string,unknown>)=>request<T>("/api/shipping",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
export default function OrderForm(){
 const [form,setForm]=useState(blank),[consent,setConsent]=useState(false),[config,setConfig]=useState<{ready:boolean;payment:PaymentConfig;defaultGrams?:number}|null>(null),[order,setOrder]=useState<Order|null>(null),[step,setStep]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState(""),[info,setInfo]=useState(""),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState("");
 const [query,setQuery]=useState(""),[locations,setLocations]=useState<ShippingLocation[]>([]),[destination,setDestination]=useState<ShippingLocation|null>(null),[quote,setQuote]=useState<ShippingQuote|null>(null),[searching,setSearching]=useState(false),[quoting,setQuoting]=useState(false),[shippingError,setShippingError]=useState(""),[refresh,setRefresh]=useState(0),[expired,setExpired]=useState(false);
 const [preparingProof,setPreparingProof]=useState(false),[proofNote,setProofNote]=useState("");
 const [catalogToken,setCatalogToken]=useState(""),[linked,setLinked]=useState(false),[catalogLoading,setCatalogLoading]=useState(false);
 const [paymentAssetFailed,setPaymentAssetFailed]=useState(false);
 const method=storedPaymentMethod(order?.payment_method);
 const selectedAvailable=!!(config?.payment&&(method==="bca_transfer"?config.payment.bca:config.payment.qris&&!paymentAssetFailed));
 const proofSequence=useRef(0);
 const quoteSequence=useRef(0);
 const [itemNames,setItemNames]=useState<string[]>([""]),[quotes,setQuotes]=useState<ShippingQuote[]>([]);
 const weight=String(orderShippingGrams(Math.max(1,itemNames.length))/1000);
 useEffect(()=>{
  let active=true;
  async function init(){
   const params=new URLSearchParams(window.location.search),token=params.get('catalog')||'',newManual=!token&&params.get('manual')==='baru';
   if(token){setLinked(true);setCatalogLoading(true)}
   try{
    const [c,o]=await Promise.all([request<{ready:boolean;payment:PaymentConfig;defaultGrams?:number}>("/api/config"),fetch("/api/order").then(r=>r.ok?r.json() as Promise<Order>:null)]);
    if(!active)return;setConfig(c);
    if(newManual){await request("/api/order",{method:"DELETE"});return;}
    if(o){
     setOrder(o);setLinked(!!o.catalog_checkout_id);setCatalogToken(o.catalog_token||'');setItemNames(orderItems(o));setQuotes(o.quote?[o.quote]:[]);
     setForm({name:o.name,phone:o.phone,address:o.address,postcode:o.postcode,item:o.item,itemAmount:o.item_amount!=null?String(o.item_amount):""});
     if(o.quote){setDestination(o.quote.destination);setQuery(o.quote.destination.label);setQuote(o.quote)}
     setConsent(true);setStep(o.status==='awaiting_proof'?2:3);
    }
    if(token&&(!o||o.catalog_token!==token)){
     const q=await resumeCatalogSelection(token,o,request);
     if(!active)return;
     setOrder(null);setStep(1);setLinked(true);setCatalogToken(token);setConsent(false);setQuote(null);setQuotes([]);setExpired(false);
     setItemNames(q.lines.flatMap(l=>Array.from({length:l.quantity},()=>l.name+' · '+l.label)));
     setForm(f=>({...f,name:f.name||q.customer?.name||"",phone:f.phone||q.customer?.phone||"",itemAmount:String(q.amount)}));
    }
   }catch(e){if(active){setError((e as Error).message)}}
   finally{if(active)setCatalogLoading(false)}
  }
  void init();return()=>{active=false};
 },[]);
 useEffect(()=>{if(!file){setPreview("");return;}const u=URL.createObjectURL(file);setPreview(u);return()=>URL.revokeObjectURL(u);},[file]);
 useEffect(()=>()=>{proofSequence.current++;},[]);
 useEffect(()=>{
  if(step!==1||destination){setSearching(false);return;}
  const q=query.trim();if(q.length<3||(!/[\p{L}]/u.test(q)&&!/^\d{5}$/.test(q))){setLocations([]);setSearching(false);return;}
  let active=true;setSearching(true);setShippingError("");const timer=setTimeout(()=>{shipping<{locations:ShippingLocation[]}>({action:"search",query:q}).then(v=>{if(active)setLocations(v.locations);}).catch(e=>{if(active){setLocations([]);setShippingError(e.message);}}).finally(()=>{if(active)setSearching(false);});},450);
  return()=>{active=false;clearTimeout(timer);};
 },[query,destination,step]);
 useEffect(()=>{
  if(step!==1||!destination)return;
  const seq=++quoteSequence.current,grams=Math.round(Number(weight)*1000);let active=true;
  setQuote(null);setQuotes([]);setExpired(false);setShippingError("");
  if(catalogLoading||!itemNames.length){setQuoting(false);return;}
  if(!Number.isFinite(grams)||grams<100||grams>30000){setQuoting(false);setShippingError("Isi berat paket antara 0,1 dan 30 kg.");return;}
  setQuoting(true);const timer=setTimeout(()=>{shipping<{quotes:ShippingQuote[]}>({action:"rates",destinationId:destination.id,grams,quantity:itemNames.length,...(linked?{catalogToken}:{})}).then(({quotes:list})=>{if(active&&seq===quoteSequence.current){setQuotes(list);setQuote(list[0]||null);}}).catch(e=>{if(active&&seq===quoteSequence.current)setShippingError(e.message);}).finally(()=>{if(active&&seq===quoteSequence.current)setQuoting(false);});},300);
  return()=>{active=false;clearTimeout(timer);};
 },[destination,weight,refresh,step,catalogLoading,catalogToken,linked]);
 useEffect(()=>{if(!quote){setExpired(false);return;}const ms=quote.expiresAt-Date.now();if(ms<=0){setExpired(true);return;}setExpired(false);const timer=setTimeout(()=>setExpired(true),ms);return()=>clearTimeout(timer);},[quote]);
 const field=(k:keyof typeof form,v:string)=>setForm(f=>({...f,[k]:v}));
 function invalidate(){quoteSequence.current++;setQuote(null);setQuotes([]);setQuoting(false);setExpired(false);}
 function resizeItems(count:number){if(!Number.isSafeInteger(count)||count<1||count>MAX_ORDER_ITEMS)return;setItemNames(names=>Array.from({length:count},(_,index)=>names[index]||""));}
 function nameItem(index:number,value:string){setItemNames(names=>names.map((name,i)=>i===index?value:name));}
 const serviceName=(q:ShippingQuote)=>q.serviceName||jntServiceName(q.service);
 const serviceSelect=(id:string)=><label className="service-choice" htmlFor={id}>Layanan J&T<select id={id} value={quote?.id||""} onChange={e=>{setQuote(quotes.find(q=>q.id===e.target.value)||null);setError("");}}>{quotes.map(q=><option key={q.id} value={q.id}>{serviceName(q)} — {rupiah(q.amount)}{q.etd?` · ${q.etd}`:""}</option>)}</select><small>{quotes.length===1?"Hanya layanan ini yang tersedia untuk tujuan dan berat paket Anda.":"Pilih layanan yang sesuai. Ongkir dan total mengikuti pilihan Anda."}</small></label>;
 function editQuery(v:string){setQuery(v);setDestination(null);setLocations([]);field("postcode","");setShippingError("");invalidate();}
 function selectLocation(l:ShippingLocation|null){if(!l){editQuery("");return;}invalidate();setDestination(l);setQuery(l.label);setLocations([l]);field("postcode",l.postalCode);}
 const goods=Number(form.itemAmount),total=step>1&&order?order.total:quote?goods+quote.amount:0;
 const currentQuote=step>1?order?.quote:quote;
 const returnHref=order&&typeof window!=="undefined"?catalogReturnHref(order,window.location.search):"/";
 async function next(e:FormEvent){e.preventDefault();if(!quote||expired||quoting||quote.grams!==orderShippingGrams(Math.max(1,itemNames.length))){setError("Pilih tujuan dan cek ulang ongkir sebelum melanjutkan.");return;}setBusy(true);setError("");try{const o=await request<Order>("/api/order",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,...normalizeOrderItems({quantity:itemNames.length,items:itemNames}),itemAmount:goods,quoteId:quote.id,consent,...(linked?{catalogToken}:{})})});setOrder(o);setStep(2);window.scrollTo({top:0,behavior:"smooth"});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function submit(e:FormEvent){e.preventDefault();if(preparingProof||!selectedAvailable||!order)return;if(!file){setError("Unggah bukti transfer terlebih dahulu.");return;}setBusy(true);setError("");try{const f=new FormData();f.set("file",file);f.set("paymentMethod",method);const o=await request<Order>("/api/order/proof",{method:"POST",body:f});setOrder(o);setStep(3);setFile(null);setProofNote("");window.scrollTo({top:0,behavior:"smooth"});}catch(e){const saved=await recoverSubmittedOrder(order.id,request);if(saved){setOrder(saved);setStep(3);setFile(null);setProofNote("");setInfo("Bukti sudah tersimpan. Pesanan sedang menunggu verifikasi ELITE.VTG.");window.scrollTo({top:0,behavior:"smooth"});}else setError((e as Error).message);}finally{setBusy(false);}}
 async function copy(){if(!order)return;try{await copyText(invoiceText(order));setInfo("Invoice berhasil disalin.");}catch{setError("Salin tidak tersedia. Gunakan Simpan invoice untuk menyimpan ringkasan.");}}
 async function selectPayment(paymentMethod:PaymentMethod){if(busy||preparingProof)return;setBusy(true);setError("");try{const o=await request<Order>("/api/order",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({paymentMethod})});setOrder(o);setPaymentAssetFailed(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function pick(f:File|undefined){if(!f||busy)return;const seq=++proofSequence.current;setError("");setFile(null);setProofNote("");setPreparingProof(true);try{const prepared=await preparePaymentProof(f);if(seq!==proofSequence.current)return;setFile(prepared);setProofNote("Bukti siap diunggah. Pastikan nominal dan detail transaksi terbaca pada pratinjau.");}catch(e){if(seq===proofSequence.current)setError((e as Error).message);}finally{if(seq===proofSequence.current)setPreparingProof(false);}}
 return <><header className="site-header"><Link href="/" className="brand"><BrandLogo/><small>CURATED VINTAGE</small></Link><span className="header-note"><LockKeyhole size={14}/> ORDER & PEMBAYARAN</span></header>
 <main className="shell"><div className="intro"><h1>{step===3?"Terima kasih! Pesanan berhasil dikirim.":"Lengkapi pesanan Anda."}</h1><p>{step===3?"Pesanan dan bukti pembayaran sudah tersimpan. Simpan invoice sebagai catatan pembelian Anda.":linked?"Barang dan harga sudah terisi dari katalog. Lengkapi penerima dan ongkir, lalu pilih metode pembayaran.":"Pilih tujuan untuk cek ongkir, masukkan harga barang, lalu pilih metode pembayaran."}</p></div>
 <nav className="steps" aria-label="Tahapan pesanan">{["Detail pesanan","Pembayaran","Invoice"].map((x,i)=><div key={x} className={step===i+1?"active":step>i+1?"done":""}><span>{step>i+1?<Check size={14}/>:"0"+(i+1)}</span>{x}</div>)}</nav>
 {error&&<div className="notice error" role="alert">{error}{linked&&<a className="error-recovery" href="/">Kembali ke katalog untuk memilih ulang</a>}</div>}{info&&<div className="notice success" role="status">{info}</div>}
 <div className="order-grid"><section className="panel main-panel" data-checkout-step={step}>
 {step===1&&<><div className="section-title"><span className="iconbox"><Package size={21}/></span><div><h2>Detail pesanan</h2><p>Gunakan data penerima paket.</p></div></div>
 {!config?.ready&&<div className="notice setup" role="status">{config?"Pembayaran belum diaktifkan oleh ELITE.VTG. Hubungi penjual untuk melanjutkan.":"Memuat pengaturan pembayaran…"}</div>}
 <form onSubmit={next}><div className="fields-two"><label>Nama lengkap<input name="name" autoComplete="name" required minLength={2} maxLength={120} placeholder="Nama penerima" value={form.name} onChange={e=>field("name",e.target.value)}/></label><label>Nomor telepon / WhatsApp<input name="phone" type="tel" autoComplete="tel" required minLength={9} maxLength={20} placeholder="08xxxxxxxxxx" value={form.phone} onChange={e=>field("phone",e.target.value)}/></label></div>
 <div className="destination-field"><label htmlFor="destination">Kecamatan / kota / kode pos</label><Combobox items={locations} value={destination} inputValue={query} filter={null} itemToStringLabel={l=>l.label} isItemEqualToValue={(a,b)=>a.id===b.id} onInputValueChange={(v,details)=>{if(details.reason==="input-change"||details.reason==="clear-press")editQuery(v);}} onValueChange={selectLocation}>
 <ComboboxInput id="destination" autoComplete="off" placeholder="Cari kecamatan atau kode pos" showTrigger={false} showClear aria-describedby="destination-help" className="destination-input"/>
 <ComboboxContent className="destination-popup"><ComboboxEmpty>{searching?"Mencari wilayah…":query.trim().length<3?"Ketik minimal 3 huruf atau kode pos 5 angka.":"Wilayah belum ditemukan. Coba nama kota atau kode pos."}</ComboboxEmpty><ComboboxList>{(l:ShippingLocation)=><ComboboxItem key={l.id} value={l}><span><b>{l.village}, {l.district}</b><small>{l.city}, {l.province} · {l.postalCode}</small></span></ComboboxItem>}</ComboboxList></ComboboxContent></Combobox><p id="destination-help" className="field-help">Pilih wilayah yang sesuai agar ongkir dan kode pos terisi otomatis.</p></div>
 <label>Alamat lengkap<textarea name="address" autoComplete="street-address" required minLength={15} maxLength={650} rows={3} placeholder="Jalan, nomor rumah, RT/RW, kelurahan, dan patokan" value={form.address} onChange={e=>field("address",e.target.value)}/></label>
 <p className="shipping-auto" aria-live="polite">{destination&&<>Kode pos <span>{form.postcode}</span><span aria-hidden="true"> · </span></>}Berat otomatis <span>{weight} kg</span>{itemNames.length>0&&<> · {itemNames.length} barang</>}</p>
 <div className="shipping-card" aria-live="polite"><div><Truck size={19}/><b>Ongkir J&T</b></div>{quoting?<p>Memeriksa layanan dan ongkir…</p>:quote?<>{serviceSelect("shipping-service")}<strong>{rupiah(quote.amount)}</strong><p>{quote.grams/1000} kg{quote.etd?` · Estimasi ${quote.etd}`:""}{expired?" · Tarif perlu diperbarui":""}</p></>:<p>Pilih tujuan untuk melihat layanan dan biaya ongkir.</p>}{shippingError&&<p className="shipping-error" role="alert">{shippingError}</p>}{destination&&!quoting&&<Button type="button" className="text-button" onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={15}/>Cek ulang ongkir</Button>}</div>
 {linked?<div className="linked-catalog-items"><label>Barang dari katalog</label>{catalogLoading?<p role="status">Memuat pilihan barang…</p>:<ol className="item-list">{itemNames.map((name,index)=><li key={index}>{name}</li>)}</ol>}<label>Harga total barang<span className="money-input"><b>Rp</b><input name="catalogAmount" readOnly value={form.itemAmount}/></span></label><small>Barang dan harga mengikuti katalog. <a href="/">Ubah pilihan di katalog</a>.</small></div>:<> <p className="field-help"><a href="/">Pilih barang dan ukuran dari katalog stok</a></p><div className="items-field"><label htmlFor="quantity">Jumlah barang</label><div className="quantity-control"><Button type="button" className="secondary quantity-button" aria-label="Kurangi jumlah barang" disabled={itemNames.length===1} onClick={()=>resizeItems(itemNames.length-1)}><Minus size={17}/></Button><input id="quantity" name="quantity" type="number" inputMode="numeric" min={1} max={MAX_ORDER_ITEMS} step={1} value={itemNames.length} onChange={e=>resizeItems(Number(e.target.value))}/><Button type="button" className="secondary quantity-button" aria-label="Tambah jumlah barang" disabled={itemNames.length===MAX_ORDER_ITEMS} onClick={()=>resizeItems(itemNames.length+1)}><Plus size={17}/></Button></div><p className="field-help">Isi nama atau kode untuk setiap barang yang dibeli.</p></div>{itemNames.map((name,index)=><label key={index} htmlFor={`item-${index}`}>{itemNames.length===1?"Barang yang dibeli":`Nama barang ${index+1}`}<input id={`item-${index}`} name={`item-${index+1}`} required minLength={2} maxLength={300} placeholder="Contoh: Kemeja vintage / kode A12" value={name} onChange={e=>nameItem(index,e.target.value)}/></label>)}
 <label>{itemNames.length>1?"Harga total barang":"Harga barang"}<span className="money-input"><b>Rp</b><input name="itemAmount" type="number" inputMode="numeric" required min={1000} max={10000000} step={1} placeholder="Harga yang disepakati" value={form.itemAmount} onChange={e=>field("itemAmount",e.target.value)}/></span><small>{itemNames.length>1?`Masukkan harga total ${itemNames.length} barang yang disepakati dengan penjual.`:"Masukkan harga barang yang disepakati dengan penjual."} Ongkir ditambahkan otomatis.</small></label>
</>}
 <div className="checkout-total" aria-live="polite"><span>Total pembayaran</span><strong>{quote?rupiah(total):"—"}</strong><small>Harga barang + ongkir {quote?serviceName(quote):"J&T"}</small></div>
 <label className="consent"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Saya menyetujui data pesanan dan bukti pembayaran dikirim ke ELITE.VTG untuk memproses pembelian.</span></label>
 <Button className="primary full" type="submit" disabled={busy||catalogLoading||!config?.ready||!quote||expired||quoting||(linked&&(!catalogToken||!goods))}>{busy?"Menyimpan…":"Lanjut ke pembayaran"}<ArrowRight size={18}/></Button></form></>}
 {step===2&&order&&<><div className="section-title"><span className="iconbox"><ReceiptText size={21}/></span><div><h2>Pilih pembayaran</h2><p>{order.id}</p></div></div><div className="pay-total"><span>Total pembayaran</span><strong>{rupiah(order.total)}</strong>{order.item_amount!=null&&<small>Barang {rupiah(order.item_amount)} + ongkir {rupiah(order.shipping_amount||0)}</small>}</div>
 <PaymentPanel key={method} order={order} payment={config?.payment} busy={busy||preparingProof} onSelect={selectPayment} onAssetError={()=>setPaymentAssetFailed(true)}/>
 <form onSubmit={submit}><label className="upload" aria-busy={preparingProof}><Upload size={23}/><strong>{preparingProof?"Menyiapkan gambar…":file?file.name:"Unggah bukti transfer"}</strong><span>JPG, PNG, atau WebP · hingga 20 MB<br/>Gambar besar diperkecil otomatis.</span><input name="proof" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>void pick(e.target.files?.[0])}/></label>{preparingProof&&<p className="proof-status" role="status">Menyiapkan bukti pembayaran. Mohon tunggu sebentar…</p>}{preview&&<img className="proof-preview" src={preview} alt="Pratinjau bukti transfer yang dipilih"/>}{proofNote&&<p className="proof-status" role="status">{proofNote}</p>}<Button className="primary full" type="submit" disabled={busy||preparingProof||!file||!selectedAvailable}>{preparingProof?"Menyiapkan gambar…":busy?"Mengirim pesanan…":"Kirim bukti & selesaikan pesanan"}<ArrowRight size={18}/></Button><Button type="button" className="secondary full" onClick={()=>{proofSequence.current++;setPreparingProof(false);setFile(null);setProofNote("");setStep(1);setError("");}} disabled={busy}><ArrowLeft size={16}/>Ubah detail pesanan</Button></form></>}
 {step===3&&order&&<><div className="invoice-heading"><CheckCircle2 size={37}/><span className="eyebrow">INVOICE PEMBELIAN</span><h2>Terima kasih, {order.name.split(" ")[0]}.</h2><p>Bukti pembayaran sudah tersimpan.</p><a className="secondary link-button full" href={returnHref}>Lihat produk lainnya</a></div><div className="status-badge verified"><FileCheck2 size={15}/>Pesanan berhasil dikirim</div>
 <div className="invoice-meta"><span>Nomor invoice<b>{order.id}</b></span><span>Tanggal<b>{dateLabel(order.created_at)}</b></span></div><dl className="invoice-details"><dt>Penerima</dt><dd>{order.name}<br/>{order.phone}</dd><dt>Alamat</dt><dd>{order.address}<br/>{order.quote?.destination.label}<br/>Kode pos {order.postcode}</dd><dt>Jumlah barang</dt><dd>{orderItems(order).length} barang</dd><dt>Barang</dt><dd><ol className="item-list">{orderItems(order).map((name,index)=><li key={index}>{name}</li>)}</ol></dd>{order.item_amount!=null&&<><dt>Harga barang</dt><dd>{rupiah(order.item_amount)}</dd><dt>Ongkir</dt><dd>{rupiah(order.shipping_amount||0)}<br/><small>{order.quote?serviceName(order.quote):"J&T"}</small></dd></>}<dt>Pembayaran</dt><dd>{paymentMethodLabel(order.payment_method)}<br/><small>{paymentStatusLabel(order)}</small></dd></dl><div className="invoice-total"><span>Total pembayaran</span><strong>{rupiah(order.total)}</strong></div>
 <div className="action-row"><a className="primary link-button" href="/api/order/invoice"><Download size={16}/>Simpan invoice</a><Button className="secondary" onClick={copy}><Copy size={16}/>Salin</Button></div><TrackingCard/></>}
 </section><aside className="side-panel"><div className="summary"><span className="eyebrow">PESANAN ELITE.VTG</span><h2>Ringkasan pesanan</h2><div className="summary-line"><span>Barang ({itemNames.length})</span><div className="summary-products">{itemNames.some(name=>name.trim())?<ol className="item-list">{itemNames.map((name,index)=><li key={index}>{name||`Barang ${index+1} belum diisi`}</li>)}</ol>:"Belum diisi"}</div></div><div className="summary-line"><span>Penerima</span><b>{form.name||"Belum diisi"}</b></div><div className="summary-line"><span>Harga barang</span><b>{goods>0?rupiah(goods):"—"}</b></div><div className="summary-line"><span>{currentQuote?serviceName(currentQuote):"Ongkir J&T"}</span><b>{currentQuote?rupiah(currentQuote.amount):step>1&&order?.shipping_amount!=null?rupiah(order.shipping_amount):"—"}</b></div><div className="summary-line total"><span>Total pembayaran</span><strong>{total>0?rupiah(total):"—"}</strong><small>Harga barang + ongkir</small></div></div><div className="side-note"><LockKeyhole size={20}/><div><h3>Data untuk pesanan Anda</h3><p>Alamat dan bukti pembayaran tersedia untuk pemilik toko.</p></div></div></aside></div>
 </main><footer><span>© {new Date().getFullYear()} <BrandLogo className="brand-wordmark-footer"/></span><Link href="/lacak">Lacak pesanan</Link></footer>
 </>;
}
