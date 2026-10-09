# Pembayaran pada versi Vercel

Rekening dan QRIS berasal dari environment server; dashboard hanya menampilkan nilainya. Jangan memakai prefix `NEXT_PUBLIC_`, menaruh tujuan pembayaran dalam bundle browser, atau menyimpan token dalam GitHub.

| Variabel | Isi |
| --- | --- |
| `PAYMENT_BCA_ACCOUNT_NUMBER` | Rekening BCA pemilik, tepat 10 digit |
| `PAYMENT_BCA_ACCOUNT_HOLDER` | Nama pemilik rekening yang disepakati |
| `PAYMENT_QRIS_KEY` | Key asli berbentuk `qris/<id>` pada storage, tanpa prefix `elite/` |
| `PAYMENT_QRIS_MIME` | `image/png`, `image/jpeg`, atau `image/webp` |
| `PAYMENT_QRIS_MERCHANT` | Nama merchant pada QRIS asli |
| `PAYMENT_QRIS_SHA256` | SHA-256 byte gambar asli, 64 karakter hex lowercase |

Pada Vercel, masukkan nilainya di Environment Variables untuk environment tujuan, kemudian redeploy. Saat development lokal, gunakan `.env.local` yang tidak masuk Git. Konfigurasi valid menampilkan BCA sebagai default, dengan QRIS sebagai alternatif bila aset tersedia. Koneksi Telegram pemilik juga diperlukan sebelum checkout menerima pesanan.

## Memasang aset asli

Gambar merchant tidak disertakan dalam source GitHub. Simpan gambar asli secara terpisah. Script berikut memvalidasi format/ukuran dan menyimpan gambar tanpa mengubah byte atau menimpa QRIS lain:

```powershell
# Komputer lokal dengan storage lokal untuk pengujian:
pnpm payment:qris -- "C:\path\QRIS-ELITE-VTG.jpg" "ELITE.VTG" --local

# Target storage Blob baru, setelah token store privat dimasukkan ke .env.local:
pnpm payment:qris -- "C:\path\QRIS-ELITE-VTG.jpg" "ELITE.VTG" --upload
```

Salin empat nilai `PAYMENT_QRIS_*` hasil script ke environment tujuan yang sama. `--upload` menulis ke store yang tokennya ada di `.env.local`: pastikan itu store baru untuk versi Vercel. Tanpa flag, script hanya memvalidasi; tidak menyimpan aset atau mengubah konfigurasi.

Sesudah QRIS dan BCA dipasang, cek `/api/config` serta `/api/qris`, dan cocokkan penerima pembayaran dengan aplikasi bank. BCA tidak boleh diganti melalui formulir pelanggan. QRIS yang byte-nya tidak cocok dengan fingerprint konfigurasi tidak dikirim ke browser.

## Alur, hak akses, dan kompatibilitas

- `PATCH /api/order` hanya menerima `paymentMethod`. Nominal, rekening, penerima, QRIS URL dan status konfirmasi dari pelanggan ditolak.
- Bukti disimpan hanya jika metode, nominal, barang, dan quote masih cocok dengan snapshot pesanan. Perubahan dari tab lain ditolak.
- Unggah bukti berarti `proof_received`, bukan dana diterima. Pemilik memeriksa dana masuk sebelum konfirmasi Telegram; pesanan manual tetap perlu dicocokkan dengan harga kesepakatan.
- `POST /api/admin/order/qris` ditolak, termasuk untuk pemilik yang sudah login. Tim tidak memiliki akses pembayaran. Perubahan tujuan dilakukan pada konfigurasi deployment pemilik.
- Migrasi baru `order_0012_tidy_silk_fever.sql` menambah metode pembayaran tanpa mengubah migrasi lama. Pesanan lama tetap tercatat sebagai QRIS.
- Login Vercel memakai sesi pemilik mandiri yang sudah ada, bukan header identitas Sites. Header palsu dan login pelanggan tidak memberikan hak pemilik.

Konfigurasi rekening/QRIS dikendalikan melalui deployment. Akun dengan akses deployment atau tulis storage masih dapat mengubah konfigurasi; lindungi akses akun itu dan cocokkan penerima pada aplikasi bank. Foto bukti bukan bukti dana sudah masuk.

## Pemisahan dari situs aktif

Source, aset dan konfigurasi baru tidak otomatis memindahkan toko lama. Gunakan database, Blob store, dan bot uji berbeda. Script tidak mengubah environment Sites, rekening situs aktif, DNS, atau webhook Telegram. Pemindahan bot produksi serta data toko dilakukan setelah pengujian dan rencana penanganan pesanan lama siap.
