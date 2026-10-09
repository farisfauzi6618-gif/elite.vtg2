# Deploy satu project ELITE.VTG ke Vercel

Source telah diselaraskan dengan perubahan katalog/pembayaran situs aktif pada 9 Oktober 2026; data dan konfigurasi produksi lama tidak disertakan. Vercel Hobby gratis dibatasi untuk penggunaan pribadi nonkomersial. Toko ELITE.VTG memerlukan paket yang mengizinkan penggunaan komersial, misalnya Pro. [Ketentuan resmi](https://vercel.com/docs/limits/fair-use-guidelines).

## 1. Repo

Upload isi folder source ke satu repo GitHub. Di Vercel pilih **Add New → Project → Import Git Repository**, lalu pilih repo tersebut. Root Directory `./`, Framework `Next.js`, Node.js **24.x**. Konfigurasi build dan region Singapore sudah ada di `vercel.json`.

Build: `pnpm build`. Install: `pnpm install --frozen-lockfile`. Tidak ada tiga build, tiga subproject, Vite, Wrangler, atau binding Cloudflare pada runtime ini.

## 2. Database Turso

Buat satu database di [Turso](https://turso.tech), pilih region dekat pengguna Indonesia bila tersedia, lalu dapatkan URL database dan auth token melalui akun Anda. Gunakan database baru untuk versi gabungan ini.

Isi environment variables Vercel:

| Nama | Nilai |
| --- | --- |
| `TURSO_DATABASE_URL` | URL remote `libsql://...` atau HTTPS yang diberikan Turso |
| `TURSO_AUTH_TOKEN` | Token database tersebut |

`file:.data/elite.db` hanya untuk komputer lokal. Kode menolak database file saat berjalan di Vercel.

## 3. Penyimpanan foto dan dokumen

Di project Vercel buka **Storage**, buat/connect Blob store dengan access **Private**, lalu hubungkan ke project. Pastikan `BLOB_READ_WRITE_TOKEN` tersedia. Store publik tidak cocok untuk source ini karena bukti pembayaran dan label harus tetap terlindungi.

Semua file memakai awalan `elite/`. Foto produk yang sudah diterbitkan disajikan lewat API katalog; bukti pembayaran dan label hanya disajikan lewat API yang memeriksa pemilik. URL Blob privat tidak diberikan kepada pelanggan.

## 4. Login dan rahasia

Di komputer, jalankan `pnpm admin:password` dan `pnpm secrets:generate`. Simpan nilai berikut di Environment Variables untuk **Production**:

| Nama | Penggunaan |
| --- | --- |
| `ADMIN_EMAIL` | Email akun pemilik |
| `ADMIN_PASSWORD_HASH` | Hash scrypt hasil `pnpm admin:password`, dengan `$` asli |
| `AUTH_SECRET` | Pengenal versi sesi dan salt batas permintaan |
| `CONFIG_SECRET` | Enkripsi token Telegram dan konfigurasi kurir |
| `TEAM_ACCESS_SECRET` | Enkripsi tautan anggota tim katalog |
| `RAJAONGKIR_CONFIG_SECRET` | Rahasia 64 karakter hex untuk konfigurasi RajaOngkir |
| `KIRIMINAJA_WEBHOOK_TOKEN` | Token callback KiriminAja, bila provider digunakan |
| `SITE_ORIGIN` | Domain final, contohnya `https://elite-vtg.vercel.app`, tanpa path |
| `BLOB_READ_WRITE_TOKEN` | Token Blob store privat |
| `PAYMENT_BCA_ACCOUNT_NUMBER` | Rekening BCA pemilik, 10 digit |
| `PAYMENT_BCA_ACCOUNT_HOLDER` | Nama pemilik rekening yang benar |
| `PAYMENT_QRIS_KEY` | Key aset asli `qris/<id>`, tanpa prefix `elite/` |
| `PAYMENT_QRIS_MIME` | MIME PNG/JPEG/WebP aset asli |
| `PAYMENT_QRIS_MERCHANT` | Merchant pada QRIS asli |
| `PAYMENT_QRIS_SHA256` | SHA-256 byte QRIS asli, 64 karakter hex lowercase |

`SITE_ORIGIN` juga dipakai membuat tautan Telegram, pelacakan, dan webhook. Jika belum diisi, server menggunakan `VERCEL_PROJECT_PRODUCTION_URL` atau `VERCEL_URL`. Tetapkan domain final setelah domain diketahui, lalu redeploy agar tautan provider konsisten.

Tidak ada `ORDER_ORIGIN`, `CATALOG_ORIGIN`, token akses hosting lama, atau bridge secret yang harus dipasangkan antaraplikasi.

Untuk Preview/Development, gunakan database, Blob store, dan bot simulasi yang terpisah bila ingin mencoba perubahan data. Hanya memasang variabel Production tidak otomatis mengonfigurasi Preview.

## 5. Terapkan skema database

Di komputer yang memiliki source, isi `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN` pada `.env.local` dengan database remote baru yang telah disiapkan. File ini diabaikan Git.

```bash
pnpm db:migrate
pnpm db:check
```

Migrasi dipanggil secara eksplisit; build Vercel tidak mengubah database secara otomatis. Setiap migrasi memiliki checksum dan hanya diterapkan sekali. Perintah ini menyiapkan tabel, bukan mengambil data dari aplikasi lama. Saat menambahkan migrasi baru di masa depan, jalankan perintah yang sama sebelum release yang membutuhkannya.

Kembalikan `.env.local` ke database lokal jika ingin melanjutkan pengembangan dengan data percobaan.

## 6. Deploy dan pengaturan toko

Deploy/redeploy project dari dashboard Vercel. Buka `/admin/login` dengan email dan kata sandi yang Anda pilih. Satu login membuka seluruh panel.

1. `/admin/katalog`: isi produk, ukuran, harga, foto, dan stok. Terbitkan barang setelah detail lengkap.
2. Siapkan rekening pada Environment Variables. Pasang QRIS asli dengan `pnpm payment:qris` sesuai [PAYMENT_CONFIGURATION.md](PAYMENT_CONFIGURATION.md), lalu isi keempat nilai QRIS pada environment dan redeploy. `/admin/order` hanya menampilkan tujuan pembayaran; penggantian melalui dashboard ditolak.
3. `/admin/order`: pasangkan bot Telegram dengan akun pemilik, konfirmasi penerima, lalu gunakan tombol uji koneksi.
4. `/ongkir`: simpan API key Cek Ongkir RajaOngkir/Komerce. Asal dicocokkan ke Baleendah, Kabupaten Bandung.
5. Bila memakai KiriminAja: atur API key, environment, asal, PIN, batas biaya, dan callback di panel pengiriman. Tarif produksi mengikuti konfigurasi produksi yang aktif.
6. Coba perjalanan katalog → order → ongkir → QRIS → bukti, lalu periksa pesan Telegram dan stok.

Bot yang masih menunjuk webhook aplikasi lama akan ditolak saat dipasangkan. Gunakan bot baru untuk pengujian Vercel. Pemindahan bot lama ke domain baru dilakukan saat cutover, setelah menerima pesanan pada aplikasi lama dihentikan dan status pesanan lama sudah ditangani. Source ini tidak mengalihkan bot lama secara otomatis.

## Batas upload

Vercel membatasi body request Function. Upload manual foto dan bukti dibatasi 4 MiB; foto besar dikompresi di browser sebelum dikirim. Untuk data QRIS, unggah PNG/JPG/WebP maksimal 4 MiB. Format file diperiksa kembali di server. Render PDF label memakai PDFium lokal dalam Node dan file Wasm masuk production bundle.

## Jika belum berjalan

| Gejala | Pemeriksaan |
| --- | --- |
| Build gagal saat install | Pastikan lockfile dan `pnpm-workspace.yaml` ikut masuk repo; gunakan pnpm 11.25.0 |
| Login belum dikonfigurasi | `ADMIN_EMAIL`, hash scrypt lengkap, `AUTH_SECRET`, dan migrasi `owner_sessions` |
| Katalog/API memberi 503 | URL/token Turso, tabel hasil migrasi, dan log Function |
| Foto gagal disimpan | Blob store privat terhubung dan token ada pada environment deployment |
| Checkout belum tersedia | Tujuan BCA atau QRIS valid, token bot, dan chat pemilik belum lengkap |
| QRIS tidak tampil | Key/metadata/fingerprint pada environment harus cocok dengan byte asli di Blob privat |
| Ongkir belum tersedia | API key provider dan konfigurasi asal belum terverifikasi |
| Telegram menunjuk domain lama | `SITE_ORIGIN` dan webhook bot belum dipindahkan saat cutover |

Dokumentasi resmi: [Next.js di Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk), [Turso SDK](https://docs.turso.tech/sdk/ts/reference), [batas Function](https://vercel.com/docs/functions/limitations).
