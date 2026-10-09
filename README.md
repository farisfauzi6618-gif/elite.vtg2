> **STATUS 9 OKTOBER 2026: SOURCE KATALOG DAN PEMBAYARAN TELAH DISELARASKAN.** Pengujian, build dan pemeriksaan HTTP lokal tercatat di [docs/SYNC_RELEASE.md](docs/SYNC_RELEASE.md). Data toko dan konfigurasi produksi belum dipindahkan. Baca [STATUS_MIGRASI.md](STATUS_MIGRASI.md) dan [tutorial](TUTORIAL_GITHUB_VERCEL.md) sebelum deploy. Upload source ke repo GitHub baru tidak mengubah situs aktif.
# ELITE.VTG — satu aplikasi untuk katalog, order, dan ongkir

Source gabungan ini telah diselaraskan pada 9 Oktober 2026 dengan perubahan katalog dan pembayaran pada situs aktif: kartu ringkas, 40 barang per halaman, size tag/fit, belanja ulang, serta BCA dan QRIS dari konfigurasi server. Lihat [catatan penyelarasan](docs/SYNC_RELEASE.md). Penyelarasan source tidak memindahkan data toko atau mengubah situs yang sedang aktif.

Satu aplikasi Next.js, satu `package.json`, satu repo GitHub, satu project Vercel, satu database Turso, dan satu penyimpanan Vercel Blob privat. Katalog, pembayaran, stok, akun pelanggan, kalkulator ongkir, pelacakan, dan pengelolaan resi memakai backend yang sama.

Ini adalah source versi gabungan. Konfigurasi rahasia, isi database produksi lama, foto barang yang diunggah, QRIS, dan bukti pembayaran tidak disertakan. Pemindahan source ini belum memindahkan data atau mengubah aplikasi lama yang sedang live.

## Halaman

| Alamat pada domain Anda | Fungsi |
| --- | --- |
| `/` | Katalog publik dan keranjang |
| `/produk/[id]` | Detail barang |
| `/order` | Form order dan pembayaran QRIS |
| `/lacak` | Pelacakan pelanggan |
| `/admin/login` | Login pemilik dengan email dan kata sandi |
| `/admin` | Dashboard pengelolaan gabungan |
| `/admin/katalog` | Produk, foto, stok, kategori, ciri, dan akses tim |
| `/admin/order` | Pesanan, QRIS, Telegram, pengaturan kurir, dan resi |
| `/ongkir` | Kalkulator ongkir khusus pemilik |
| `/akses-tim` | Akses anggota tim katalog |

Katalog meneruskan pilihan ke `/order?catalog=...`. Harga dan stok diverifikasi langsung di server. Berat mengikuti jumlah unit: 1–3 barang = 1 kg; 4–6 = 2 kg; 7–9 = 3 kg; sampai maksimal 20 barang. Konfirmasi pembayaran tetap dilakukan pemilik melalui Telegram; mengunggah bukti tidak berarti dana sudah masuk.

## Upload ke GitHub

Ekstrak ZIP lalu unggah **isi folder `elite-vtg-monolith`** ke root repo. `package.json`, `pnpm-lock.yaml`, `next.config.ts`, `vercel.json`, `app/`, dan `modules/` harus berada pada tingkat tersebut. Jangan mengunggah ZIP sebagai satu-satunya isi repo. Sertakan juga `.env.example` dan `.gitignore`; jangan sertakan `.env.local`, `node_modules`, `.next`, atau `.data`.

Jika memakai Git:

```bash
git init
git add .
git commit -m "Add unified ELITE.VTG application"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
git push -u origin main
```

## Jalankan di komputer

Gunakan Node.js 24 dan pnpm 11.25.0.

```bash
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
```

Salin `.env.example` menjadi `.env.local` dan isi `ADMIN_EMAIL`. Buat hash kata sandi dan rahasia:

```bash
pnpm admin:password
pnpm secrets:generate
```

Kata sandi diminta melalui terminal dan tidak ditampilkan. Salin hash hasilnya ke `ADMIN_PASSWORD_HASH`. Untuk **file `.env.local`**, ubah setiap `$` pada hash menjadi `\$` agar pemrosesan `.env` tidak mengganti bagian hash. Saat memasukkan nilai di **dashboard Vercel**, gunakan hash asli dengan `$`, tanpa backslash. Setiap rahasia hasil generator menggunakan nilai berbeda.

Biarkan `TURSO_DATABASE_URL=file:.data/elite.db` untuk database lokal. Foto lokal disimpan di `.data/files`. Keduanya tidak masuk Git.

```bash
pnpm db:migrate
pnpm dev
```

Buka `http://localhost:3000` dan login pemilik di `/admin/login`. Untuk mencoba mode produksi di komputer: `pnpm build` lalu `pnpm start`; gunakan database dan penyimpanan remote, atau set `STORAGE_DRIVER=local` khusus untuk pengujian lokal.

## Deploy ke Vercel

Langkah lengkap ada di [docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md). Yang perlu Anda siapkan: repo GitHub, database Turso, Blob store **privat**, dan environment variables. Root Directory Vercel adalah `./`, Framework adalah `Next.js`. Jalankan migrasi database sebelum membuka aplikasi untuk digunakan.

Pasang tujuan pembayaran melalui environment server dan aset QRIS asli melalui [panduan pembayaran](docs/PAYMENT_CONFIGURATION.md). Dashboard `/admin/order` menampilkan tujuan pembayaran hanya baca; upload/penggantian QRIS melalui dashboard ditolak. Pasangkan bot Telegram uji berbeda, lalu atur RajaOngkir melalui `/ongkir`. KiriminAja/Komerce tetap dapat dikonfigurasi melalui panel pengiriman. Aktivasi provider tetap mengikuti akun serta izin provider Anda.

## Pengujian

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm db:check
```

Pengujian menggunakan database lokal sementara dan respons kurir/Telegram simulasi. Tidak melakukan pembayaran, booking, pickup, atau pengiriman pesan nyata. `db:check` menggunakan database dari environment dan memeriksa apakah semua migrasi sudah diterapkan.

## Susunan kode

`app/` berisi seluruh halaman dan API. `modules/catalog`, `modules/order`, dan `modules/shipping` adalah kelompok fungsi dalam aplikasi yang sama, tanpa project atau proses terpisah. `lib/database.ts` menyediakan satu koneksi database dan batch transaksi atomik; `lib/storage.ts` memakai Blob privat. Login pemilik ada di `lib/auth`, sedangkan akun pelanggan dan sesi tim tetap memiliki hak akses masing-masing. `migrations/` adalah satu urutan migrasi dengan pemeriksaan checksum.

Panduan arsitektur dan pemindahan data lama ada di [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

