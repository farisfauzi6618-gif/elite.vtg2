import { BrandLogo } from '@/components/brand-logo';
import Login from './ui';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Login pemilik — ELITE.VTG', robots: { index: false, follow: false } };
export default function LoginPage() {
  return <main className="owner-login"><a className="owner-brand" href="/"><BrandLogo /></a><section className="owner-card"><p className="eyebrow">ELITE.VTG MANAGEMENT</p><h1>Masuk sebagai pemilik</h1><p>Kelola katalog, pesanan, pembayaran, dan pengiriman.</p><Login /></section><a className="quiet-link" href="/akses-tim">Masuk dengan tautan tim katalog</a></main>;
}
