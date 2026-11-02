import Invitation from './ui';
import '@/components/admin-security.css';
export const metadata={title:'Undangan pengelola',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default function Page(){return <main className="admin-security"><p>ELITE.VTG · AKSES PENGELOLA</p><h1>Aktifkan akun pengelola Anda</h1><p>Gunakan email penerima undangan dan buat kata sandi Anda sendiri. Undangan berlaku 15 menit dan hanya dapat dipakai sekali.</p><Invitation/></main>;}
