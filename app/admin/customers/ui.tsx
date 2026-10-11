'use client';
import {useEffect,useState,type FormEvent} from 'react';
import type {CustomerDirectory,CustomerRecord} from '@/modules/catalog/customer-directory';
import './customers.css';

type Filters={q:string;start:string;end:string;campaign:string;status:string};
const initial:Filters={q:'',start:'',end:'',campaign:'giveaway-utama',status:'all'};
const number=(value:number)=>value.toLocaleString('id-ID');
const date=(value:number|string|null,time=false)=>value===null?'—':new Date(typeof value==='string'?value+'T00:00:00+07:00':value).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',year:'numeric',...(time?{hour:'2-digit',minute:'2-digit'}:{})});
export default function Customers(){
 const [draft,setDraft]=useState<Filters>(initial),[filters,setFilters]=useState<Filters>(initial),[data,setData]=useState<CustomerDirectory|null>(null);
 const [cursors,setCursors]=useState<(string|null)[]>([null]),[page,setPage]=useState(0),[snapshot,setSnapshot]=useState<number|null>(null),[refresh,setRefresh]=useState(0);
 const [busy,setBusy]=useState(false),[exporting,setExporting]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [editing,setEditing]=useState<CustomerRecord|null>(null),[username,setUsername]=useState(''),[verified,setVerified]=useState(false),[saving,setSaving]=useState(false);
 const cursor=cursors[page];
 useEffect(()=>{
  const abort=new AbortController();let active=true;setBusy(true);setError('');
  const params=new URLSearchParams(filters);if(cursor)params.set('cursor',cursor);if(snapshot!==null)params.set('asOf',String(snapshot));
  fetch('/api/admin/customers?'+params,{cache:'no-store',signal:abort.signal}).then(async response=>{const value=await response.json();if(!response.ok)throw Error(value.error||'Daftar pelanggan belum dapat dimuat.');if(active)setData(value)}).catch(error=>{if(active)setError(error.message)}).finally(()=>{if(active)setBusy(false)});
  return()=>{active=false;abort.abort()};
 },[filters,cursor,snapshot,refresh]);
 function reset(){setCursors([null]);setPage(0);setSnapshot(null);setRefresh(value=>value+1)}
 function apply(event:FormEvent){event.preventDefault();setEditing(null);setNotice('');setData(null);setFilters({...draft});reset()}
 function edit(customer:CustomerRecord){setEditing(customer);setUsername(customer.giveaway?.instagramUsername||'');setVerified(!!customer.giveaway?.commentVerifiedAt);setError('');setNotice('')}
 async function save(event:FormEvent){
  event.preventDefault();if(!editing||!data)return;setSaving(true);setError('');
  try{const reply=await fetch('/api/admin/customers/giveaway',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerId:editing.id,campaign:data.campaign,instagramUsername:username,commentVerified:verified,version:editing.giveaway?.version||0})});const value=await reply.json();if(!reply.ok)throw Error(value.error||'Catatan belum tersimpan.');setNotice('Catatan Instagram untuk '+editing.name+' tersimpan.');setEditing(null);reset()}catch(error){setError((error as Error).message)}finally{setSaving(false)}
 }
 async function download(format:'csv'|'json'){
  setExporting(true);setError('');setNotice('');
  try{const params=new URLSearchParams({...filters,format});if(data)params.set('asOf',String(data.asOf));const reply=await fetch('/api/admin/customers/export?'+params,{cache:'no-store'});if(!reply.ok){const value=await reply.json();throw Error(value.error||'Ekspor belum dapat diunduh.')}const blob=await reply.blob();if(format==='json'){const archive=JSON.parse(await blob.text());if(archive.complete!==true||archive.count!==archive.customers?.length)throw Error('Arsip belum lengkap. Coba unduh lagi.')}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=reply.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]||'elitevtg-pelanggan.'+format;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),30000);setNotice('Unduhan '+format.toUpperCase()+' berisi '+number(Number(reply.headers.get('X-ELITE-Export-Count')||0))+' pelanggan sesuai filter.')}catch(error){setError((error as Error).message||'Unduhan terputus. Coba lagi.')}finally{setExporting(false)}
 }
 function next(){if(!data?.nextCursor)return;setSnapshot(data.asOf);setCursors(values=>[...values.slice(0,page+1),data.nextCursor]);setPage(value=>value+1);setEditing(null)}
 return <main className="cd-shell">
  <header className="cd-header"><div><p className="cd-eyebrow">ELITE.VTG · KHUSUS PEMILIK</p><h1>Data pelanggan</h1><p>Akun terdaftar dan catatan giveaway Anda.</p></div><button className="cd-button cd-secondary" disabled={busy||saving||exporting} onClick={()=>{setEditing(null);reset()}}>{busy?'Memuat…':'Perbarui data'}</button></header>
  <div className="cd-stats">{[['Akun tersimpan',data?.total],['Daftar hari ini · WIB',data?.registeredToday],['Sesuai filter',data?.matched],['Komentar terverifikasi',data?.verified]].map(([label,value])=><section key={String(label)}><h2>{String(label)}</h2><p>{typeof value==='number'?number(value):'—'}</p></section>)}</div>
  <form className="cd-filters" onSubmit={apply} aria-label="Filter pelanggan">
   <label className="cd-search">Cari pelanggan<input value={draft.q} maxLength={120} onChange={event=>setDraft({...draft,q:event.target.value})} placeholder="Nama, email, nomor HP, atau username IG"/></label>
   <label>Terdaftar dari<input type="date" value={draft.start} onChange={event=>setDraft({...draft,start:event.target.value})}/></label><label>Sampai<input type="date" value={draft.end} onChange={event=>setDraft({...draft,end:event.target.value})}/></label>
   <label>Kode giveaway<input value={draft.campaign} required maxLength={60} pattern="[a-z0-9][a-z0-9_-]{0,59}" onChange={event=>setDraft({...draft,campaign:event.target.value})} placeholder="giveaway-utama"/></label>
   <label>Status komentar<select value={draft.status} onChange={event=>setDraft({...draft,status:event.target.value})}><option value="all">Semua pelanggan</option><option value="verified">Terverifikasi</option><option value="pending">Belum diverifikasi</option><option value="unrecorded">Belum dicatat</option></select></label>
   <button className="cd-button" disabled={busy||saving||exporting}>Terapkan</button><button type="button" className="cd-text" disabled={busy||saving||exporting} onClick={()=>{setDraft(initial);setFilters(initial);setEditing(null);setData(null);reset()}}>Reset filter</button>
  </form>
  <p className="cd-help">Tanggal memakai WIB. Gunakan kode berbeda untuk setiap giveaway; riwayat kode sebelumnya tetap tersimpan. Komentar Instagram diverifikasi manual oleh Anda.</p>
  {error&&<p className="cd-message cd-error" role="alert">{error}</p>}{notice&&<p className="cd-message" role="status">{notice}</p>}
  {editing&&<section className="cd-editor" aria-label="Catatan giveaway"><h2>Instagram · {editing.name}</h2><p>{data?.campaign}</p><form onSubmit={save}><label>Username Instagram<input autoFocus required maxLength={31} value={username} onChange={event=>{setUsername(event.target.value);setVerified(false)}} placeholder="@username" autoCapitalize="none" spellCheck={false}/></label><label className="cd-check"><input type="checkbox" checked={verified} onChange={event=>setVerified(event.target.checked)}/>Saya sudah memeriksa komentar akun Instagram ini.</label><div><button className="cd-button" disabled={saving}>{saving?'Menyimpan…':'Simpan catatan'}</button><button type="button" className="cd-text" disabled={saving} onClick={()=>setEditing(null)}>Batal</button></div></form></section>}
  <section className="cd-panel" aria-label="Daftar akun pelanggan" aria-busy={busy}>
   <div className="cd-export"><div><h2>Daftar akun</h2><p>{data?number(data.matched)+' pelanggan · giveaway '+data.campaign:'Memuat daftar…'}</p></div><div><button className="cd-button cd-secondary" disabled={busy||exporting||saving||!data} onClick={()=>void download('csv')}>Unduh CSV</button><button className="cd-button cd-secondary" disabled={busy||exporting||saving||!data} onClick={()=>void download('json')}>Unduh arsip JSON</button></div></div>
   <p className="cd-help">Unduhan mencakup semua pelanggan sesuai filter. CSV memuat giveaway yang dipilih; JSON menyertakan seluruh riwayat giveaway mereka. Reset filter untuk mengarsipkan semua akun.</p>
   {exporting&&<p role="status" className="cd-help">Menyiapkan unduhan lengkap…</p>}{busy&&<p role="status" className="cd-help">Memuat data terbaru…</p>}
   {data?.customers.length?<><div className="cd-scroll"><table><thead><tr>{['Pelanggan','Kontak','Ulang tahun','Terdaftar · WIB','Instagram / komentar',''].map((heading,index)=><th key={index} scope="col">{heading||<span className="cd-sr">Kelola giveaway</span>}</th>)}</tr></thead><tbody>{data.customers.map(customer=><tr key={customer.id}><td><span className="cd-name">{customer.name}</span><small>{customer.id}</small></td><td>{customer.email&&<span>{customer.email}</span>}{customer.phone&&<span>{customer.phone}</span>}{!customer.email&&!customer.phone&&'—'}</td><td>{date(customer.birthday)}</td><td>{date(customer.createdAt,true)}</td><td>{customer.giveaway?<><span>@{customer.giveaway.instagramUsername}</span><span className="cd-pill">{customer.giveaway.commentVerifiedAt?'Terverifikasi':'Belum diverifikasi'}</span></>:<span className="cd-muted">Belum dicatat</span>}</td><td><button className="cd-text" disabled={busy||saving||exporting} onClick={()=>edit(customer)} aria-label={'Kelola Instagram '+customer.name}>{customer.giveaway?'Edit catatan':'Catat Instagram'}</button></td></tr>)}</tbody></table></div><nav className="cd-pagination" aria-label="Halaman pelanggan"><button className="cd-button cd-secondary" disabled={page===0||busy||saving||exporting} onClick={()=>{setPage(value=>value-1);setEditing(null)}}>Sebelumnya</button><span>Halaman {page+1} · {data.customers.length} akun</span><button className="cd-button cd-secondary" disabled={!data.nextCursor||busy||saving||exporting} onClick={next}>Berikutnya</button></nav></>:!busy&&<p className="cd-empty">{data?.total?'Belum ada pelanggan sesuai filter ini.':'Belum ada akun pelanggan yang terdaftar.'}</p>}
  </section>
  <p className="cd-help cd-footnote">Data akun tidak dihapus ketika pelanggan logout atau sesi login berakhir. Simpan arsip unduhan di tempat pribadi sebagai salinan terpisah. Kata sandi dan token login tidak disertakan.</p>
 </main>;
}
