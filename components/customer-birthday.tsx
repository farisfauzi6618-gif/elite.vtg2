'use client';
import {useState} from 'react';
import type {CustomerProfile} from '@/modules/catalog/customer-types';
import {invalidateCustomer} from '@/modules/catalog/customer-request';

export function CustomerBirthday({customer,onChange}:{customer:CustomerProfile;onChange:(customer:CustomerProfile)=>void}){
  const [birthday,setBirthday]=useState(customer.birthday??''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  return <details className="customer-profile-edit"><summary>Ulang tahun (opsional)</summary><form onSubmit={async event=>{event.preventDefault();setBusy(true);setMessage('');try{const reply=await fetch('/api/customer',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({birthday:birthday||null})}),value=await reply.json();if(!reply.ok)throw Error(value.error||'Profil belum dapat disimpan.');onChange(value.customer);invalidateCustomer();window.dispatchEvent(new Event('elite:customer-change'));setMessage('Profil tersimpan.');}catch(error){setMessage((error as Error).message)}finally{setBusy(false)}}}>
    <label>Ulang tahun saya<input type="date" value={birthday} min="1900-01-01" max={new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta'})} disabled={busy} onChange={event=>setBirthday(event.target.value)}/></label>
    <p className="help-text">Anda dapat melengkapinya kapan saja.</p>
    <button type="submit" className="button secondary" disabled={busy}>{busy?'Menyimpan…':'Simpan profil'}</button>
    {message&&<p role="status" className="help-text">{message}</p>}
  </form></details>;
}
