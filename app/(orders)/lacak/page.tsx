import { BrandLogo } from "@/components/brand-logo";
import Link from "next/link";
import {CustomerAccount} from "@/components/customer-account";
import { TrackingCard } from "@/app/(orders)/tracking-card";
export const metadata={title:"Lacak pesanan · ELITE.VTG",robots:{index:false,follow:false}};
export default function TrackingPage(){return <><header className="site-header"><Link href="/" className="brand"><BrandLogo/><small>CURATED VINTAGE</small></Link><CustomerAccount showOrdersLink={false}/></header><main className="shell tracking-shell"><div className="intro"><h1>Lacak pesanan Anda.</h1><p>Periksa konfirmasi pembayaran, nomor resi, dan riwayat perjalanan paket.</p></div><p className="tracking-account-link"><Link href="/pesanan">Punya akun? Buka Pesanan saya</Link></p><div className="panel"><TrackingCard lookup/></div></main><footer><BrandLogo className="brand-wordmark-footer"/><Link href="/">Kembali ke katalog</Link></footer></>;}
