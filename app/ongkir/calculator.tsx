"use client";
import { BrandLogo } from "@/components/brand-logo";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Check, MapPin, Package, RotateCcw, ExternalLink, ShieldCheck, Info, ReceiptText, Link2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Combobox, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from "@/components/ui/combobox";
import { toast } from "sonner";
import type { Location } from "@/modules/shipping/shipping-data";
import { InstallApp } from "@/components/install-app";
const ORIGIN = "Baleendah, Kabupaten Bandung, Jawa Barat";
const sources: Record<string, string> = { berdu: "Berdu.id — input manual", jnt: "Konfirmasi J&T — input manual", other: "Sumber lain — input manual" };
type Quote = { destination: string; weight: number; amount: number; source: string; checked: string; service?: string; etd?: string };
type Draft = { destination: string; weight: string; tariff: string; source: string; note: string };
const initial: Draft = { destination: "", weight: "1", tariff: "", source: "berdu", note: "" };
const rupiah = (value: number) => "Rp" + new Intl.NumberFormat("id-ID").format(value);
const kg = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(value) + " kg";

function validate(draft: Draft): Quote {
  const destination = draft.destination.trim().replace(/\s+/g, " ");
  if (destination.length < 3 || destination.length > 160) throw new Error("Isi kota/kecamatan atau kode pos tujuan (3–160 karakter).");
  if (/^\d+$/.test(destination) && !/^\d{5}$/.test(destination)) throw new Error("Kode pos harus terdiri dari 5 digit.");
  if (!/[a-zA-Z\p{L}]/u.test(destination) && !/^\d{5}$/.test(destination)) throw new Error("Isi nama tujuan atau kode pos 5 digit yang valid.");
  const weightText = draft.weight.trim().replace(",", ".");
  const weight = Number(weightText);
  if (!/^\d+(?:\.\d{1,3})?$/.test(weightText) || !Number.isFinite(weight) || weight <= 0 || weight > 100) throw new Error("Berat harus lebih dari 0 dan maksimal 100 kg, hingga 3 angka desimal.");
  const tariffText = draft.tariff.trim().replace(/^rp\s*/i, "").replace(/\s/g, "");
  if (!/^(?:\d+|\d{1,3}(?:[.,]\d{3})+)$/.test(tariffText)) throw new Error("Masukkan total ongkir dalam rupiah, misalnya 25000 atau Rp25.000.");
  const amount = Number(tariffText.replace(/[.,]/g, ""));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000) throw new Error("Total ongkir harus lebih dari Rp0 dan maksimal Rp100.000.000.");
  if (!sources[draft.source]) throw new Error("Pilih sumber tarif yang valid.");
  if (draft.source === "other" && !draft.note.trim()) throw new Error("Tulis sumber tarif, misalnya nama agen atau aplikasi.");
  if (draft.note.length > 160) throw new Error("Catatan sumber maksimal 160 karakter.");
  return { destination, weight, amount, source: sources[draft.source] + (draft.source === "other" ? " (" + draft.note.trim() + ")" : ""), checked: new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }).format(new Date()) + " WIB" };
}
function summary(q: Quote) {
  return ["ELITE.VTG — Estimasi Ongkir", "Kurir: J&T Regular", "Dari: " + ORIGIN, "Tujuan: " + q.destination, "Berat paket: " + kg(q.weight), "Estimasi ongkir: " + rupiah(q.amount), "Sumber: " + q.source, ...(q.etd && q.etd !== "-" ? ["Estimasi tiba: " + q.etd] : []), "Dicatat: " + q.checked, "Tarif akhir mengikuti konfirmasi J&T; belum termasuk asuransi atau biaya tambahan."].join("\n");
}

type Connection = {provider?:string;kiriminReady?:boolean; connected: boolean; origin: Location | null; checkedAt: string | null };
async function api<T>(body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch("/api/ongkir", { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, signal, cache: "no-store" });
  let data;
  try { data = await res.json(); } catch { throw new Error("Layanan ongkir belum merespons. Coba lagi atau gunakan tarif manual."); }
  if (!res.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Layanan ongkir tidak tersedia.");
  return data as T;
}
const gramsFrom = (value: string) => {
  const text = value.trim().replace(",", ".");
  const weight = Number(text);
  if (!/^\d+(?:\.\d{1,3})?$/.test(text) || !Number.isFinite(weight) || weight <= 0 || weight > 100) throw new Error("Berat harus lebih dari 0 hingga 100 kg, maksimal 3 angka desimal.");
  return Math.round(weight * 1000);
};

export default function Home() {
  const [draft, setDraft] = useState<Draft>(initial);
  const [mode, setMode] = useState("auto");
  const [connection, setConnection] = useState<Connection | null>(null);
  const [connectionError, setConnectionError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [apiKey,setApiKey] = useState(''), [connecting,setConnecting] = useState(false), [keyError,setKeyError] = useState('');
  async function connectRaja(e:React.FormEvent){e.preventDefault();setConnecting(true);setKeyError('');try{await api({action:'connect',key:apiKey});setApiKey('');await checkConnection();setSelected(null);setLocations([]);setQuery('');setDialogOpen(false);toast.success('Koneksi RajaOngkir disimpan.');}catch(e){setKeyError((e as Error).message);}finally{setConnecting(false);}}

  const [query, setQuery] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selected, setSelected] = useState<Location | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchDone, setSearchDone] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">("idle");
  const destinationRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const quoteGeneration = useRef(0);
  const quoteAbort = useRef<AbortController | null>(null);

  const checkConnection = useCallback(async () => {
    setConnectionError("");
    try { setConnection(await api<Connection>()); } catch(e) {setConnection(null);setConnectionError((e as Error).message);}
  }, []);
  useEffect(() => { void checkConnection(); }, [checkConnection]);
  function clearQuote() {
    quoteGeneration.current++; quoteAbort.current?.abort(); setQuote(null); setLoadingQuote(false); setError(""); setCopyState("idle");
  }
  function edit(key: keyof Draft, value: string) {
    const routeChanged = (key === "destination" || key === "weight") && value !== draft[key];
    if (routeChanged && draft.tariff) toast.info("Tujuan/berat berubah. Masukkan ulang tarif manual yang sesuai.");
    setDraft(d => ({ ...d, [key]: value, ...(routeChanged ? { tariff: "" } : {}) })); clearQuote();
  }
  function changeMode(next: string) { setMode(next); setComboOpen(false); clearQuote(); }
  function chooseLocation(location: Location | null) {
    setSelected(location); setComboOpen(false); setQuery(location?.label || ""); setDraft(d => ({ ...d, destination: location?.label || "", tariff: "" })); clearQuote();
  }
  useEffect(() => {
    if (mode !== "auto" || !connection?.connected || selected || query.trim().length < 3) {setSearching(false);setSearchDone(false);return;}
    const controller = new AbortController();
    setSearchError(""); setSearchDone(false); setLocations([]); setSearching(true);
    const timer = setTimeout(async () => {
      try {const data = await api<{locations:Location[]}>({action:"search",query:query.trim()},controller.signal); if(!controller.signal.aborted){setLocations(data.locations);setSearchDone(true);}}
      catch(e) {if(!controller.signal.aborted) setSearchError((e as Error).message);}
      finally {if(!controller.signal.aborted)setSearching(false);}
    },650);
    return () => {clearTimeout(timer);controller.abort();};
  }, [query, selected, connection?.connected, mode]);
  const fetchQuote = useCallback(async (location: Location, weight: string, scroll = false) => {
    const generation = ++quoteGeneration.current;
    quoteAbort.current?.abort();
    const controller = new AbortController(); quoteAbort.current=controller;
    setQuote(null);setError("");setCopyState("idle");
    let grams;
    try {grams=gramsFrom(weight);} catch(e) {setError((e as Error).message);setLoadingQuote(false);return;}
    setLoadingQuote(true);
    try {
      const data=await api<Quote>({action:"quote",destinationId:location.id,grams},controller.signal);
      if(generation!==quoteGeneration.current || controller.signal.aborted)return;
      setQuote(data);
      if(scroll && window.matchMedia("(max-width:760px)").matches) requestAnimationFrame(()=>resultRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));
    } catch(e) {if(generation===quoteGeneration.current&&!controller.signal.aborted)setError((e as Error).message);}
    finally {if(generation===quoteGeneration.current)setLoadingQuote(false);}
  },[]);
  useEffect(() => {
    if(mode!=="auto"||!connection?.connected||!selected)return;
    const timer=setTimeout(()=>void fetchQuote(selected,draft.weight),350);
    return ()=>{clearTimeout(timer);quoteGeneration.current++;quoteAbort.current?.abort();};
  },[selected,draft.weight,mode,connection?.connected,fetchQuote]);
  const completeManual=useCallback((next:Draft,scroll=true)=>{
    const q=validate(next);setDraft(next);setQuote(q);setError("");setCopyState("idle");
    if(scroll&&window.matchMedia("(max-width:760px)").matches)requestAnimationFrame(()=>resultRef.current?.scrollIntoView({behavior:"smooth",block:"start"}));
    return q;
  },[]);
  function submit(e:React.FormEvent) {
    e.preventDefault();
    if(mode==="auto") {
      if(!connection?.connected){setDialogOpen(true);return;}
      if(!selected){setError("Pilih tujuan dari daftar hasil pencarian terlebih dahulu.");return;}
      void fetchQuote(selected,draft.weight,true);
    } else {try {completeManual(draft);}catch(e){setError((e as Error).message);setQuote(null);}}
  }
  function reset() {setComboOpen(false);setDraft(initial);setSelected(null);setQuery("");setLocations([]);setSearchError("");clearQuote();destinationRef.current?.focus();}
  async function copy() {
    if(!quote)return;
    try {await navigator.clipboard.writeText(summary(quote));setCopyState("copied");toast.success("Ringkasan ongkir tersalin.");}
    catch {const field=summaryRef.current;field?.focus();field?.select();field?.setSelectionRange(0,summary(quote).length);if(document.execCommand("copy")){setCopyState("copied");toast.success("Ringkasan ongkir tersalin.");}else{setCopyState("manual");toast.info("Pilih teks ringkasan lalu salin dari menu perangkat.");}}
  }
  useEffect(()=>{
    const context=(document as Document & {modelContext?:{registerTool:(tool:unknown,options:unknown)=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;
    const life=new AbortController();
    const tool={name:"create_manual_shipping_quote",title:"Buat estimasi ongkir manual",description:"Menampilkan total ongkir J&T Regular yang disediakan pengguna beserta sumber. Tidak mengambil tarif otomatis.",inputSchema:{type:"object",properties:{destination:{type:"string"},weight_kg:{type:"number",exclusiveMinimum:0,maximum:100},total_tariff_idr:{type:"integer",minimum:1,maximum:100000000},source:{type:"string",enum:["berdu","jnt","other"]},source_note:{type:"string"}},required:["destination","weight_kg","total_tariff_idr","source"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input:unknown){
      if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Input tidak valid.");const d=input as Record<string,unknown>;
      if(Object.keys(d).some(k=>!["destination","weight_kg","total_tariff_idr","source","source_note"].includes(k))||typeof d.destination!=="string"||typeof d.weight_kg!=="number"||typeof d.total_tariff_idr!=="number"||!Number.isInteger(d.total_tariff_idr)||typeof d.source!=="string"||(d.source_note!==undefined&&typeof d.source_note!=="string"))throw new Error("Input ongkir tidak valid.");
      const next={destination:d.destination,weight:String(d.weight_kg),tariff:String(d.total_tariff_idr),source:d.source,note:(d.source_note as string)||""};validate(next);setMode("manual");const q=completeManual(next,false);return new Promise(resolve=>requestAnimationFrame(()=>resolve({...q,summary:summary(q)})));
    }};
    try{Promise.resolve(context.registerTool(tool,{signal:life.signal})).catch(()=>{});}catch{}return()=>life.abort();
  },[completeManual]);

  return <div className="site-shell">
    <Toaster theme="light" position="bottom-center"/>
    <header className="topbar"><div className="topbar-inner"><a className="brand" href="/" aria-label="ELITE.VTG beranda"><BrandLogo/></a><span className="workspace-label">PENGIRIMAN</span><span className="private-label"><ShieldCheck size={15} aria-hidden="true"/>Privat</span><InstallApp /></div></header>
    <main className="workspace">
      <div className="page-heading"><div><p className="eyebrow">PESANAN HARIAN</p><h1>Kalkulator ongkir</h1></div><Button type="button" variant="outline" className="reset-button" onClick={reset}><RotateCcw aria-hidden="true"/>Pesanan baru</Button></div>
      <div className="origin-strip"><MapPin size={19} aria-hidden="true"/><div><span className="origin-label">DIKIRIM DARI</span><strong>Baleendah, Kabupaten Bandung</strong><span className="origin-province">Jawa Barat</span></div><span className="courier-pill">J&T <span>Regular</span></span></div>
      <div className={"connection-bar "+(connection?.connected?"is-connected":"")}><div><Link2 size={18} aria-hidden="true"/><p>{connection?.connected?<><strong>{connection.kiriminReady?"KiriminAja tersambung":"Ongkir lama masih aktif"}</strong><span>{connection.kiriminReady?"Pilih tujuan untuk cek tarif otomatis.":"Aktifkan KiriminAja dari pengaturan aplikasi order."}</span></>:connectionError?<><strong>Koneksi belum dapat diperiksa</strong><span>{connectionError}</span></>:connection?<><strong>Hubungkan KiriminAja sekali saja</strong><span>Atur API key satu kali pada aplikasi order.</span></>:<><strong>Memeriksa koneksi KiriminAja…</strong></>}</p></div><Button type="button" variant="outline" onClick={()=>{setDialogOpen(true);}} className="connect-button">{"Pengaturan KiriminAja"}</Button></div>
      <div className="work-grid">
        <form className="input-panel" onSubmit={submit} noValidate>
          <div className="mode-tabs"><Tabs value={mode} onValueChange={changeMode}><TabsList aria-label="Cara cek ongkir"><TabsTrigger value="auto">Otomatis</TabsTrigger><TabsTrigger value="manual">Tarif manual</TabsTrigger></TabsList></Tabs></div>
          <section className="form-section"><div className="section-title"><span className="step">01</span><h2>Detail pengiriman</h2></div>
            <label htmlFor="destination">Kecamatan/kota atau kode pos tujuan</label>
            {mode==="auto"?<><Combobox open={comboOpen} onOpenChange={setComboOpen} items={locations} filteredItems={locations} filter={null} value={selected} inputValue={query} itemToStringLabel={(item:Location)=>item.label} isItemEqualToValue={(a:Location,b:Location)=>a.id===b.id} onValueChange={chooseLocation} onInputValueChange={(value,details)=>{if(details.reason==="input-change"||details.reason==="clear-press"){setQuery(value);setComboOpen(value.length>0);setSelected(null);setLocations([]);clearQuote();}}} disabled={!connection?.connected}><ComboboxInput id="destination" ref={destinationRef} autoComplete="off" placeholder={connection?.connected?"Ketik kecamatan atau kode pos":"Hubungkan KiriminAja terlebih dahulu"} showTrigger={false} className="destination-combo" aria-describedby="destination-help"/><ComboboxContent className="destination-menu"><ComboboxList>{(item:Location)=><ComboboxItem value={item} key={item.id} className="destination-item"><div><strong>{item.district}, {item.city}</strong><span>{item.village} · {item.province} · {item.postalCode}</span></div></ComboboxItem>}</ComboboxList><ComboboxEmpty>{searching?"Mencari wilayah…":searchError?"Pencarian belum berhasil.":query.length<3?"Ketik minimal 3 karakter.":searchDone?"Tidak ada hasil. Coba nama kota/kecamatan lebih lengkap.":"Ketik nama tujuan untuk mencari."}</ComboboxEmpty></ComboboxContent></Combobox>
              <p className="field-help" id="destination-help">Pilih hasil yang sesuai kota dan kecamatan. Kelurahan/kode pos membantu membedakan tujuan.</p>
              {searching&&<p className="search-feedback" role="status"><Loader2 size={14} className="spin" aria-hidden="true"/>Mencari wilayah…</p>}
              {searchError&&<p className="form-error" role="alert">{searchError}</p>}
              {selected&&<p className="selected-location"><Check size={14} aria-hidden="true"/>{selected.label}</p>}
            </>:<><input ref={destinationRef} id="destination" type="text" autoComplete="off" maxLength={160} placeholder="Contoh: Balikpapan Selatan atau 76114" value={draft.destination} onChange={e=>edit("destination",e.target.value)} aria-describedby="destination-help"/><p className="field-help" id="destination-help">Tambahkan kota/kabupaten jika nama kecamatan sama.</p></>}
            <div className="weight-row"><div className="weight-field"><label htmlFor="weight">Berat paket</label><div className="unit-input"><input id="weight" inputMode="decimal" type="text" value={draft.weight} onChange={e=>edit("weight",e.target.value)} aria-describedby="weight-help"/><span>kg</span></div></div><div className="weight-presets" aria-label="Berat cepat">{["0.5","1","2"].map(w=><Button key={w} type="button" variant="outline" aria-pressed={draft.weight.replace(",",".")===w} className="weight-chip" onClick={()=>edit("weight",w)}>{w.replace(".",",")} kg</Button>)}</div></div><p className="field-help" id="weight-help">Berat setelah dikemas. Default 1 kg; pembulatan ongkir mengikuti kurir.</p>
          </section>
          <section className="form-section tariff-section"><div className="section-title"><span className="step">02</span><h2>{mode==="auto"?"Cek tarif J&T":"Tarif ongkir"}</h2><span className="manual-badge">{mode==="auto"?"KIRIMINAJA API":"INPUT MANUAL"}</span></div>
            {mode==="auto"?<><div className="manual-notice"><Info size={17} aria-hidden="true"/><p>{connection?.connected?"Tarif diambil otomatis setelah tujuan dipilih. Berat berubah akan memicu cek tarif baru.":"Aktifkan koneksi dengan API key Anda. Sementara itu, Anda tetap bisa memakai tab Tarif manual."}</p></div>{error&&<p className="form-error" role="alert">{error}</p>}<Button type="submit" className="calculate-button" disabled={loadingQuote}>{loadingQuote?<Loader2 className="spin" aria-hidden="true"/>:<Search aria-hidden="true"/>}{loadingQuote?"Mengambil tarif…":!connection?.connected?"Hubungkan KiriminAja":quote?"Cek ulang tarif":"Cek ongkir"}</Button>{error&&<Button type="button" variant="outline" className="fallback-button" onClick={()=>changeMode("manual")}>Gunakan tarif manual</Button>}</>:<>
              <div className="manual-notice"><Info size={17} aria-hidden="true"/><p>Cek rute dan berat yang sama, lalu masukkan total J&T Regular. Hasil ditandai sebagai input manual.</p></div><a className="berdu-link" href="https://berdu.id/cek-ongkir" target="_blank" rel="noopener noreferrer">Cek tarif di Berdu.id<ExternalLink size={16} aria-hidden="true"/><span>Terbuka di tab baru</span></a>
              <label htmlFor="tariff">Total ongkir untuk paket ini</label><div className="currency-input"><span>Rp</span><input id="tariff" inputMode="numeric" type="text" maxLength={20} placeholder="Masukkan nominal" value={draft.tariff} onChange={e=>edit("tariff",e.target.value)} aria-describedby="tariff-help"/></div><p className="field-help" id="tariff-help">Total sesuai berat di atas, bukan tarif per kg. Bisa tempel Rp25.000.</p>
              <fieldset className="source-fieldset"><legend>Sumber tarif</legend><RadioGroup className="source-options" value={draft.source} onValueChange={value=>edit("source",value)}>{[["berdu","Berdu.id"],["jnt","Konfirmasi J&T"],["other","Sumber lain"]].map(([key,label])=><label className="source-option" htmlFor={"source-"+key} key={key}><RadioGroupItem id={"source-"+key} value={key}/>{label}</label>)}</RadioGroup></fieldset>
              {draft.source==="other"&&<div className="other-source"><label htmlFor="source-note">Nama sumber</label><input id="source-note" maxLength={160} placeholder="Nama agen atau aplikasi" value={draft.note} onChange={e=>edit("note",e.target.value)}/></div>}{error&&<p role="alert" className="form-error">{error}</p>}<Button type="submit" className="calculate-button"><ReceiptText aria-hidden="true"/>Tampilkan estimasi manual</Button>
            </>}
          </section>
        </form>
        <aside ref={resultRef} className="result-panel" aria-label="Hasil estimasi"><div className="result-top"><span className="eyebrow">ESTIMASI ONGKIR</span><Package size={23} aria-hidden="true"/></div>
          <div aria-live="polite" aria-atomic="true" className="quote-display"><div className="result-amount">{loadingQuote?<Loader2 className="spin result-spinner" aria-label="Mengambil tarif"/>:quote?rupiah(quote.amount):"Rp —"}</div><p className="result-caption">{loadingQuote?"Mengambil tarif J&T Regular…":quote?"J&T Regular"+(quote.service?" ("+quote.service+")":"")+" · "+kg(quote.weight):mode==="auto"?"Pilih tujuan untuk menampilkan tarif.":"Isi tujuan, berat, dan tarif paket."}</p></div>
          <div className="route-details"><div><span>Dari</span><strong>Baleendah, Kab. Bandung</strong></div><div><span>Ke</span><strong>{quote?.destination||selected?.label||"Belum ditentukan"}</strong></div><div><span>Sumber</span><strong>{quote?.source||(mode==="auto"?connection?.connected?(connection.kiriminReady?"Menunggu hasil KiriminAja":"Menunggu hasil ongkir"):"KiriminAja belum terhubung":"Menunggu tarif manual")}</strong></div>{quote?.etd&&quote.etd!=="-"&&<div><span>Tiba</span><strong>{quote.etd}</strong></div>}{quote&&<div><span>Dicatat</span><strong>{quote.checked}</strong></div>}</div>
          <div className="copy-area"><label htmlFor="summary">Ringkasan untuk pelanggan</label><textarea ref={summaryRef} id="summary" readOnly value={quote?summary(quote):"Ringkasan muncul setelah tarif berhasil ditampilkan."} rows={quote?9:3} spellCheck={false}/><Button type="button" disabled={!quote||loadingQuote} className="copy-button" onClick={copy}>{copyState==="copied"?<Check aria-hidden="true"/>:<Copy aria-hidden="true"/>}{copyState==="copied"?"Ringkasan tersalin":"Salin ringkasan ongkir"}</Button>{copyState==="manual"&&<p className="copy-help" role="status">Teks sudah dipilih. Salin melalui menu perangkat atau Ctrl/Cmd+C.</p>}</div><p className="estimate-note">Tarif akhir mengikuti konfirmasi J&T. Asuransi dan biaya tambahan belum termasuk.</p>
        </aside>
      </div>
      <footer className="page-footer"><BrandLogo className="brand-wordmark-footer"/><p>{mode==="auto"?"Tarif selalu diambil saat Anda memilih tujuan atau mengubah berat.":"Tujuan atau berat berubah? Tarif manual sebelumnya akan dikosongkan."}</p></footer>
    </main>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="connection-dialog"><DialogHeader><DialogTitle>Pengaturan ongkir</DialogTitle><DialogDescription>Gunakan RajaOngkir untuk cek ongkir, atau aktifkan KiriminAja melalui pengaturan pengiriman.</DialogDescription></DialogHeader><p className="field-help">API key dan PIN KA Credit dikelola di satu pengaturan khusus pemilik. Kalkulator akan mengikuti pengaturan produksi secara otomatis. Ongkir sebelumnya tetap tersedia selama aktivasi.</p><a className="account-link" href="/admin/order" target="_blank" rel="noopener noreferrer">Buka pengaturan pengiriman<ExternalLink size={14} aria-hidden="true"/></a><form className="shipping-key-form" onSubmit={connectRaja}><label htmlFor="shipping-api-key">API key RajaOngkir / Komerce</label><input id="shipping-api-key" type="password" autoComplete="off" value={apiKey} onChange={e=>setApiKey(e.target.value)} required minLength={10} maxLength={256}/><p className="field-help">Key disimpan terenkripsi. Asal pengiriman mengikuti Baleendah, Kabupaten Bandung.</p>{keyError&&<p className="form-error" role="alert">{keyError}</p>}<Button type="submit" className="calculate-button" disabled={connecting}>{connecting?'Menghubungkan…':'Simpan koneksi RajaOngkir'}</Button></form><Button type="button" className="calculate-button" onClick={()=>void checkConnection()}>Periksa koneksi</Button></DialogContent></Dialog>
  </div>;
}
