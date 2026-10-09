# Penyelarasan source gabungan — 9 Oktober 2026

Acuan katalog: commit `3f17ffb2d5b18d419a7765df1f3a6a0e561a5f6c`. Acuan order: commit `2b2bf019e7004842e3f3857f1ae8b0f41a20d991`. Perubahan diterapkan pada source gabungan, tanpa deployment atau perubahan konfigurasi/data situs aktif.

## Perilaku yang diselaraskan

- Katalog dua kolom HP memakai kartu ringkas: nama, brand, size tersedia, harga dan kondisi. Kategori tetap dapat dicari/difilter. Informasi lengkap dan pemilihan stok berada pada detail produk.
- Font, harga tanpa bold, padding kartu, size tag serta size fit mengikuti source katalog terbaru. Paginasi membatasi 40 barang; filter diterapkan sebelum pembagian halaman dan halaman tersimpan di URL.
- Invoice memakai “Lihat produk lainnya”. Tombol “Buat pesanan baru” duplikat dihilangkan sesuai persetujuan sebelumnya; order manual tetap dapat dimulai lewat `/order?manual=baru`.
- Belanja kedua memverifikasi pilihan baru sebelum melepas cookie invoice lama. Data penerima dapat dipakai ulang; persetujuan dan ongkir diperiksa kembali. Invoice lama tetap tersimpan.
- Keranjang hanya dibersihkan sesuai unit yang dikirim. Respons upload bukti yang terputus dipulihkan dari pesanan sama di server.
- BCA dan QRIS dari konfigurasi server; nominal katalog dan ongkir tetap diverifikasi backend. Request pelanggan hanya dapat memilih metode yang tersedia.
- QRIS diperiksa format/ukuran dan SHA-256 byte asli. Dashboard hanya baca dan endpoint penggantian QRIS ditolak, termasuk bagi pemilik. Tim tidak mendapat hak pembayaran.
- Bukti tetap membutuhkan konfirmasi dana oleh pemilik. Metode serta snapshot nominal/barang/ongkir dikunci saat bukti disimpan.
- Header `DENY`, CSP `frame-ancestors 'none'`, `nosniff`, dan `no-referrer` melindungi aplikasi gabungan.

## Adaptasi Vercel yang dipertahankan

Next.js Node, satu database Turso, Blob privat, login email/password pemilik, rate limit berdasarkan ingress Vercel, ongkir langsung dari modul bersama, dan render PDF Node dipertahankan. Source tidak dipindahkan kembali ke runtime Cloudflare. Tautan belanja ulang menuju `/`, checkout menuju `/order`, dan admin tetap pada `/admin/katalog` serta `/admin/order`.

Migration lama tidak diubah. `order_0012_tidy_silk_fever.sql` ditambahkan untuk metode pembayaran pesanan; data pesanan lama memakai QRIS. Script `payment:qris` memasang aset melalui konfigurasi deployment pemilik, bukan melalui dashboard.

## Pemeriksaan

Pemeriksaan lokal pada 9 Oktober 2026 menggunakan Node.js 24.15.0 dan Next.js 16.3.8:

- `node --test --test-concurrency=1 tests/*.test.mjs`: 138 tes lulus, tidak ada gagal atau dilewati. Mencakup katalog/paginasi, belanja ulang, checkout, auth pemilik/tim/pelanggan, tujuan pembayaran, upload bukti, konfirmasi stok dan pengiriman. Suite domain katalog juga memeriksa 22 skenario caption/filter di dalam suite tersebut.
- `node node_modules/next/dist/bin/next build --webpack`: build produksi berhasil, termasuk pemeriksaan TypeScript dan seluruh route gabungan.
- `node node_modules/typescript/bin/tsc --noEmit`: lulus sesudah build.
- `node tests/production-http.mjs`: 41 pemeriksaan HTTP lulus pada server hasil build dengan database/storage sementara. Mencakup halaman/aset, header, login/logout nyata, penolakan identitas palsu, tujuan pembayaran dari server, penolakan perubahan QRIS dan penolakan gambar dengan fingerprint berbeda.
- `pnpm audit --prod --json`: tidak ada kerentanan dependency produksi yang diketahui oleh registry saat pemeriksaan. Ini tidak menggantikan pemeriksaan konfigurasi dan akses akun hosting.
- Bantuan CLI QRIS diperiksa tanpa unggah gambar produksi. Paket mempertahankan dependency registry biasa; tidak memakai path cache atau tarball lokal.

Simulasi menggunakan data pembayaran contoh serta provider/bot tiruan; tidak melakukan transaksi, booking, perubahan situs aktif atau deployment Vercel. Masalah origin pada harness HTTP lokal diselesaikan dengan memakai `localhost`, sesuai normalisasi loopback NextRequest. Pemeriksaan tampilan dan transaksi pada deployment tujuan tetap diperlukan sebelum pengalihan pelanggan.

## Runtime tujuan — pembaruan 10 Oktober 2026

GitHub dan Vercel sudah terhubung. Turso, Blob privat, autentikasi pemilik, BCA dan QRIS asli sudah dipasang pada Production. Salinan terakhir memuat 21 produk, 27 pesanan, 20 unit stok dan 162 aset (139 foto, 22 bukti, 1 QRIS). Identitas/alamat pelanggan, unggahan dan kredensial tetap berada pada layanan privat; tidak dimasukkan ke GitHub.

Deployment commit 7551202abc18fd299e4ce169df9378028aaab4d7 lolos 72 pemeriksaan HTTP produksi pada 9 Oktober 2026, termasuk seluruh detail produk, fingerprint aset dan QRIS, ongkir J&T nyata, serta penolakan akses admin/bukti anonim. Pemilik berhasil masuk ke dashboard dengan password yang ditetapkan sendiri. Token bot dan RajaOngkir dari pemilik valid dan disimpan terenkripsi dengan konfigurasi target.

Webhook Telegram masih di situs lama. Pembayaran baru pada Vercel sengaja ditahan sampai pengalihan selesai. Persiapan terbaru menambahkan pemulihan sesi invoice lama dengan token acak asli, tanpa mengubah pembayaran atau stok. Token dipindahkan melalui fragment HTTPS dan segera dihapus dari alamat, lalu disimpan sebagai cookie HttpOnly, Secure, SameSite=Strict. Endpoint menolak token palsu, sesi kedaluwarsa dan request lintas origin. Kalkulator menampilkan nama provider yang sedang aktif.

138 tes Node dan build produksi webpack beserta TypeScript lulus pada 10 Oktober 2026. Tes memakai provider/bot tiruan dan tidak mengirim pesan atau membuat booking produksi. Perubahan persiapan ini masih perlu diterbitkan dan diverifikasi di Vercel.

Sebelum cutover: tahan penulisan situs lama, ambil delta terakhir beserta aset, verifikasi setiap baris, lalu alihkan webhook tanpa membuang update tertunda. Link lama perlu diarahkan ke domain baru agar pelanggan melanjutkan invoice pada perangkat yang sama. Situs lama tetap menjadi sumber transaksi sampai rangkaian ini berhasil; jangan menjalankan ulang pembayaran, notifikasi, booking, atau pemotongan stok selama menyalin data.

Booking KiriminAja belum aktif pada sumber lama maupun target; API key dan PIN KA Credit belum tersedia. RajaOngkir tetap menyediakan cek ongkir J&T. Reservasi stok saat checkout belum ditambahkan; konflik stok mengikuti perilaku toko sebelumnya. Harga order manual tetap perlu diverifikasi pemilik sebelum konfirmasi dana.
