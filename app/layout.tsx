import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: { default: 'ELITE.VTG — Shop', template: '%s | ELITE.VTG' },
  description: 'Koleksi curated vintage ELITE.VTG. Pilih barang, ukuran, dan lanjutkan ke pembayaran.',
  applicationName: 'ELITE.VTG',
  icons: { icon: '/favicon.svg', apple: '/icons/apple-touch-icon.png' },
  manifest: '/manifest.webmanifest',
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#071f3a' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="id"><body>{children}</body></html>; }
