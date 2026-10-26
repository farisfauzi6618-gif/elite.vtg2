import {BrandLogo} from '@/components/brand-logo';
import {CustomerPasswordRecovery} from '@/components/customer-password-recovery';
export const metadata={title:'Lupa kata sandi',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default function ForgotPasswordPage(){return <main className="customer-recovery-page"><header><a href="/" aria-label="ELITE.VTG — Katalog"><BrandLogo/></a></header><section className="customer-recovery-card"><h1>Lupa kata sandi?</h1><p>Gunakan email atau nomor HP yang Anda daftarkan.</p><CustomerPasswordRecovery/></section><footer><a href="/">Kembali ke katalog</a></footer></main>;}
