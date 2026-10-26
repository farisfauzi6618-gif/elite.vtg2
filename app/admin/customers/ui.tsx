'use client';
import {useEffect,useState,type FormEvent} from 'react';
import type {CustomerDirectory,CustomerRecord} from '@/modules/catalog/customer-directory';
import './customers.css';
import {LoyaltyCard} from '@/components/loyalty-card';
import {AdminCustomerRecovery} from '@/components/admin-customer-recovery';

type Filters={q:string;start:string;end:string;view:'active'|'trash'};
const initial:Filters={q:'',start:'',end:'',view:'active'};
const number=(value:number)=>value.toLocaleString('id-ID');
const date=(value:number|string|null,time=false)=>value===null?'—':new Date(typeof value==='string'?value+'T00:00:00+07:00':value).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',year:'numeric',...(time?{hour:'2-digit',minute:'2-digit'}:{})});
export default function Customers(){
 const [draft,setDraft]=useState<Filters>(initial),[filters,setFilters]=useState<Filters>(initial),[data,setData]=useState<CustomerDirectory|null>(null);
 const [cursors,setCursors]=useState<(string|null)[]>([null]),[page,setPage]=useState(0),[snapshot,setSnapshot]=useState<number|null>(null),[refresh,setRefresh]=useState(0);
 const [busy,setBusy]=useState(false),[exporting,setExporting]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [selected,setSelected]=useState<CustomerRecord|null>(null),[saving,setSaving]=useState(false);
 const [inspecting,setInspecting]=useState<CustomerRecord|null>(null),[recovering,setRecovering]=useState<CustomerRecord|null>(null);
 const cursor=cursors[page],locked=busy||saving||exporting;
 useEffect(()=>{
  const abort=new AbortController();let active=true;setBusy(true);setError('');
  const params=new URLSearchParams(filters);if(cursor)params.set('cursor',cursor);if(snapshot!==null)params.set('asOf',String(snapshot));
  fetch('/api/admin/customers?'+params,{cache:'no-store',signal:abort.signal}).then(async response=>{const value=await response.json();if(!response.ok)throw Error(value.error||'Daftar pelanggan belum dapat dimuat.');if(active)setData(value)}).catch(error=>{if(active)setError(error.message)}).finally(()=>{if(active)setBusy(false)});
  return()=>{active=false;abort.abort()};
 },[filters,cursor,snapshot,refresh]);
 function reset(){setCursors([null]);setPage(0);setSnapshot(null);setRefresh(value=>value+1)}
 function apply(event:FormEvent){event.preventDefault();setSelected(null);setNotice('');setData(null);setFilters({...draft});reset()}
 function changeView(view:Filters['view']){const value={...initial,view};setDraft(value);setFilters(value);setSelected(null);setNotice('');setData(null);reset()}
 async function manage(){
  if(!selected)return;setSaving(true);setError('');
  const action=selected.deletedAt===null?'trash':'restore';
  try{const reply=await fetch('/api/admin/customers/manage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({customerId:selected.id,action,deletedAt:selected.deletedAt})});const value=await reply.json();if(!reply.ok)throw Error(value.error||'Data pelanggan belum diperbarui.');setNotice(selected.name+(action==='trash'?' dipindahkan ke Sampah. Anda dapat memulihkannya kapan saja.':' dipulihkan ke daftar pelanggan.'));setSelected(null);reset()}catch(error){setError((error as Error).message)}finally{setSaving(false)}
 }
 async function download(format:'csv'|'json'){
  setExporting(true);setError('');setNotice('');
  try{const params=new URLSearchParams({...filters,format});if(data)params.set('asOf',String(data.asOf));const reply=await fetch('/api/admin/customers/export?'+params,{cache:'no-store'});if(!reply.ok){const value=await reply.json();throw Error(value.error||'Ekspor belum dapat diunduh.')}const blob=await reply.blob();if(format==='json'){const archive=JSON.parse(await blob.text());if(archive.complete!==true||archive.count!==archive.customers?.length)throw Error('Arsip belum lengkap. Coba unduh lagi.')}const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=reply.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]||'elitevtg-pelanggan.'+format;link.click();window.setTimeout(()=>URL.revokeObjectURL(url),30000);setNotice('Unduhan '+format.toUpperCase()+' berisi '+number(Number(reply.headers.get('X-ELITE-Export-Count')||0))+' pelanggan sesuai filter.')}catch(error){setError((error as Error).message||'Unduhan terputus. Coba lagi.')}finally{setExporting(false)}
 }
 function next(){if(!data?.nextCursor)return;setSnapshot(data.asOf);setCursors(values=>[...values.slice(0,page+1),data.nextCursor]);setPage(value=>value+1);setSelected(null)}
 return <main className="cd-shell">
  <header className="cd-header"><div><p className="cd-eyebrow">ELITE.VTG · KHUSUS PEMILIK</p><h1>Data pelanggan</h1><p>Kelola akun terdaftar dan simpan arsip pelanggan.</p></div><button className="cd-button cd-secondary" disabled={locked} onClick={()=>{setSelected(null);reset()}}>{busy?'Memuat…':'Perbarui data'}</button></header>
  <div className="cd-stats">{[['Pelanggan aktif',data?.total],['Daftar hari ini · WIB',data?.registeredToday],['Sesuai filter',data?.matched]].map(([label,value])=><section key={String(label)}><h2>{String(label)}</h2><p>{typeof value==='number'?number(value):'—'}</p></section>)}</div>
  <nav className="cd-views" aria-label="Daftar pelanggan"><button className="cd-button cd-secondary" aria-current={filters.view==='active'?'page':undefined} disabled={locked} onClick={()=>changeView('active')}>Pelanggan</button><button className="cd-button cd-secondary" aria-current={filters.view==='trash'?'page':undefined} disabled={locked} onClick={()=>changeView('trash')}>Sampah{data?' ('+number(data.trashed)+')':''}</button></nav>
  <form className="cd-filters" onSubmit={apply} aria-label="Filter pelanggan">
   <label className="cd-search">Cari pelanggan<input value={draft.q} maxLength={120} onChange={event=>setDraft({...draft,q:event.target.value})} placeholder="Nama, email, atau nomor HP"/></label>
   <label>Terdaftar dari<input type="date" value={draft.start} onChange={event=>setDraft({...draft,start:event.target.value})}/></label><label>Sampai<input type="date" value={draft.end} onChange={event=>setDraft({...draft,end:event.target.value})}/></label>
   <button className="cd-button" disabled={locked}>Terapkan</button><button type="button" className="cd-text" disabled={locked} onClick={()=>changeView(filters.view)}>Reset filter</button>
  </form>
  <p className="cd-help">{filters.view==='trash'?'Akun di Sampah tidak dapat login sampai dipulihkan. Riwayat pesanan dan diskon tetap tersimpan.':'Tanggal pendaftaran memakai WIB. Hapus akun yang tidak relevan ke Sampah; tersedia opsi Pulihkan.'}</p>
  {error&&<p className="cd-message cd-error" role="alert">{error}</p>}{notice&&<p className="cd-message" role="status">{notice}</p>}
  {recovering&&<AdminCustomerRecovery key={recovering.id} customer={recovering} onClose={()=>setRecovering(null)}/>}
  {inspecting&&<section className="cd-loyalty-detail" aria-label="Loyalty pelanggan"><header><h2>{inspecting.name} · Loyalty</h2><button type="button" className="cd-text" onClick={()=>setInspecting(null)}>Tutup detail loyalty</button></header><LoyaltyCard key={inspecting.id} customerId={inspecting.id}/></section>}
  {selected&&<section className="cd-editor" aria-label="Konfirmasi pengelolaan pelanggan"><h2>{selected.deletedAt===null?'Hapus pelanggan?':'Pulihkan pelanggan?'}</h2><p className="cd-selected">{selected.name}<br/>{selected.email||selected.phone}</p><p>{selected.deletedAt===null?'Akun ini akan masuk Sampah, dikeluarkan dari daftar dan ekspor pelanggan aktif, serta tidak dapat login sampai dipulihkan. Riwayat pesanan dan diskon tetap tersimpan.':'Akun kembali ke daftar pelanggan dan bisa login menggunakan kata sandi sebelumnya. Pelanggan perlu login ulang.'}</p><div><button autoFocus className="cd-button" disabled={locked} onClick={()=>void manage()}>{saving?'Menyimpan…':selected.deletedAt===null?'Hapus ke Sampah':'Pulihkan akun'}</button><button className="cd-text" disabled={saving} onClick={()=>setSelected(null)}>Batal</button></div></section>}
  <section className="cd-panel" aria-label="Daftar akun pelanggan" aria-busy={busy}>
   <div className="cd-export"><div><h2>{filters.view==='trash'?'Sampah pelanggan':'Daftar akun'}</h2><p>{data?number(data.matched)+' pelanggan':'Memuat daftar…'}</p></div><div><button className="cd-button cd-secondary" disabled={locked||!data} onClick={()=>void download('csv')}>Unduh CSV</button><button className="cd-button cd-secondary" disabled={locked||!data} onClick={()=>void download('json')}>Unduh arsip JSON</button></div></div>
   <p className="cd-help">Unduhan mencakup semua pelanggan sesuai filter dan daftar yang dipilih. Reset filter pada tab Pelanggan untuk mengarsipkan seluruh akun aktif.</p>
   {exporting&&<p role="status" className="cd-help">Menyiapkan unduhan lengkap…</p>}{busy&&<p role="status" className="cd-help">Memuat data terbaru…</p>}
   {data?.customers.length?<><div className="cd-scroll"><table><thead><tr>{['Pelanggan','Kontak','Ulang tahun','Terdaftar · WIB',...(filters.view==='trash'?['Dihapus · WIB']:[]),''].map((heading,index)=><th key={index} scope="col">{heading||<span className="cd-sr">Kelola pelanggan</span>}</th>)}</tr></thead><tbody>{data.customers.map(customer=><tr key={customer.id}><td><span className="cd-name">{customer.name}</span><small>{customer.id}</small></td><td>{customer.email&&<span>{customer.email}</span>}{customer.phone&&<span>{customer.phone}</span>}{!customer.email&&!customer.phone&&'—'}</td><td>{date(customer.birthday)}</td><td>{date(customer.createdAt,true)}</td>{filters.view==='trash'&&<td>{date(customer.deletedAt,true)}</td>}<td>{customer.deletedAt===null&&customer.phone&&!customer.email&&<button className="cd-text" disabled={locked} aria-label={'Bantu pulihkan akun '+customer.name} onClick={()=>{setRecovering(customer);setInspecting(null);setSelected(null)}}>Bantu pulihkan akun</button>}<button className="cd-text" disabled={locked} onClick={()=>{setInspecting(customer);setSelected(null)}} aria-label={'Lihat loyalty '+customer.name}>Loyalty</button><button className="cd-text" disabled={locked} onClick={()=>{setSelected(customer);setError('');setNotice('')}} aria-label={(customer.deletedAt===null?'Hapus pelanggan ':'Pulihkan pelanggan ')+customer.name}>{customer.deletedAt===null?'Hapus':'Pulihkan'}</button></td></tr>)}</tbody></table></div><nav className="cd-pagination" aria-label="Halaman pelanggan"><button className="cd-button cd-secondary" disabled={page===0||locked} onClick={()=>{setPage(value=>value-1);setSelected(null)}}>Sebelumnya</button><span>Halaman {page+1} · {data.customers.length} akun</span><button className="cd-button cd-secondary" disabled={!data.nextCursor||locked} onClick={next}>Berikutnya</button></nav></>:!busy&&<p className="cd-empty">{filters.view==='trash'?'Sampah kosong atau belum ada akun sesuai filter.':data?.total?'Belum ada pelanggan sesuai filter ini.':'Belum ada akun pelanggan aktif.'}</p>}
  </section>
  <p className="cd-help cd-footnote">Logout tidak menghapus data akun. Simpan arsip unduhan di tempat pribadi. Kata sandi dan token login tidak disertakan.</p>
 </main>;
}
