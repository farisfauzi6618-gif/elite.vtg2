import {BrandLogo} from '@/components/brand-logo';
import {CustomerPasswordReset} from '@/components/customer-password-reset';
export const metadata={title:'Atur ulang kata sandi',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default function ResetPasswordPage(){return <main className="customer-recovery-page"><header><a href="/" aria-label="ELITE.VTG — Katalog"><BrandLogo/></a></header><section className="customer-recovery-card"><CustomerPasswordReset/></section><footer><a href="/">Kembali ke katalog</a></footer></main>;}
