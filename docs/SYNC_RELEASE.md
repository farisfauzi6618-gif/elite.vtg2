# Penyelarasan source gabungan — 9 Oktober 2026

Acuan katalog: commit `3f17ffb2d5b18d419a7765df1f3a6a0e561a5f6c`. Acuan order: commit `2b2bf019e7004842e3f3857f1ae8b0f41a20d991`. Perubahan diterapkan pada source gabungan. Migrasi dan publikasi produksi berikutnya selesai pada 10 Oktober 2026, seperti dicatat pada pembaruan runtime di bawah.

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

GitHub dan Vercel sudah terhubung. Turso, Blob privat, autentikasi pemilik, BCA dan QRIS asli terpasang pada Production. Migrasi final memuat 21 produk, 27 pesanan, 20 unit stok dan 162 aset (139 foto, 22 bukti, 1 QRIS). Data pelanggan, unggahan dan kredensial berada pada layanan privat; tidak dimasukkan ke GitHub.

Rilis kode 2780c4394463f9052df8599116270f7f2c556ebe berhasil diterbitkan. Pemeriksaan produksi pada 10 Oktober 2026 mencakup 72 pemeriksaan HTTP: seluruh detail produk, fingerprint foto/QRIS, ongkir J&T nyata dan penolakan akses admin/bukti anonim. Pemilik sudah berhasil membuka dashboard memakai password yang ditetapkan sendiri. Token bot dan RajaOngkir disimpan terenkripsi dengan konfigurasi target.

Pembelian baru di Vercel sudah aktif. Sebelum aktivasi, seluruh write pada tiga situs lama ditahan dan diverifikasi, snapshot final dibaca melalui database native, lalu delta diterapkan dalam satu transaksi dengan pemeriksaan setiap hash baris dan foreign key. Satu checkout terbaru disalin; tidak ada penghapusan, replay pesanan, konfirmasi dana, pemotongan stok, notifikasi ulang atau booking selama migrasi. Webhook Telegram dipindahkan dengan chat pemilik tetap dan drop_pending_updates=false.

Link katalog, order, ongkir serta admin lama kini mengarah ke halaman Vercel yang tepat. Penulisan melalui formulir lama ditolak dengan HTTP 409 agar tidak terjadi transaksi ganda. Invoice lama dipulihkan memakai token acak asli melalui fragment HTTPS yang segera dihapus, lalu cookie HttpOnly, Secure dan SameSite=Strict. Token palsu, sesi kedaluwarsa dan request lintas origin ditolak; nomor invoice saja tidak memberikan akses. Pengalihan produksi, checkout aktif dan penolakan webhook tanpa secret telah diverifikasi.

138 tes Node dan build produksi webpack/TypeScript lulus. Guard migrasi lolos 35 pemeriksaan. Pengujian menggunakan provider/bot tiruan untuk operasi bisnis dan tidak mengirim pesan, mengonfirmasi pembayaran atau membuat booking produksi.

Booking KiriminAja belum aktif pada sumber lama maupun target; API key dan PIN KA Credit belum tersedia. RajaOngkir menyediakan cek ongkir J&T; pengiriman diurus manual sampai layanan booking disambungkan. Reservasi stok saat checkout belum ditambahkan; konflik stok mengikuti perilaku toko sebelumnya. Harga pesanan manual tetap diverifikasi pemilik sebelum konfirmasi dana.
