# Arsitektur versi gabungan

## Satu runtime

Katalog, order, dan ongkir sekarang ada di satu Next.js App Router dengan runtime Node.js. Folder `modules/` membagi tanggung jawab kode; ketiganya tidak lagi berjalan sebagai service terpisah. URL API admin diberi nama `/api/admin/katalog` dan `/api/admin/order` agar tidak bertabrakan.

Checkout menggunakan `quoteCheckout` secara langsung. Konfirmasi pembayaran menggunakan `applyCheckoutSale` pada database yang sama. Kalkulator dan checkout berbagi konfigurasi kurir order; fallback RajaOngkir dipanggil langsung sebagai fungsi. Tidak ada HTTP ke aplikasi ELITE.VTG lain.

Semua tabel lama berbeda nama, sehingga dapat digabung dalam satu database tanpa menulis ulang query bisnis. Interface prepared query lama sekarang didukung libSQL. `batch()` memakai transaksi write Turso: seluruh pernyataan commit bersama, atau semuanya rollback. Penanda unik pada penjualan katalog mencegah pengurangan stok ulang akibat klik atau callback bersamaan.

Status pembayaran, sinkronisasi stok, booking, pickup, label, dan pengiriman Telegram tetap menyimpan state masing-masing. Retry menggunakan status tersimpan. Respons booking yang tidak pasti tidak memicu booking baru secara buta.

## Identitas

Pemilik memakai email yang dikonfigurasi server dan password hash scrypt. Token sesi random hanya ada pada cookie HttpOnly; database menyimpan SHA-256 token. Sesi berlaku 12 jam dan versi kredensial berubah saat email/hash/`AUTH_SECRET` berubah. Header identitas ChatGPT dari request tidak dipakai.

Pelanggan menggunakan tabel akun dan sesi pelanggan, dengan cookie terpisah. Mendaftarkan email yang sama dengan pemilik sebagai pelanggan tidak memberikan hak admin. Anggota tim hanya memiliki akses katalog; pembayaran, Telegram, ongkir privat, dan bukti tetap khusus pemilik. Mutasi dari browser memerlukan origin yang sama. IP pembatasan permintaan Vercel dibaca dari header ingress Vercel, bukan header Cloudflare yang dikirim pengunjung.

## Penyimpanan

Produksi memakai satu Turso remote dan satu Vercel Blob private. Komputer lokal dapat memakai SQLite file dan direktori lokal. Fallback file tidak diizinkan di Vercel. Akses foto draft, bukti, label, dan QRIS tetap menggunakan endpoint dengan aturan akses yang sesuai.

Tujuan pembayaran dibaca dari environment server. BCA menjadi default jika valid; QRIS alternatif diperiksa terhadap fingerprint SHA-256 gambar asli. Pengaturan QRIS lama pada tabel `settings` dipertahankan untuk kompatibilitas data, tetapi tidak digunakan sebagai sumber tujuan pembayaran. Dashboard dan request pembeli tidak dapat mengganti rekening/QRIS. Migrasi baru menambah `orders.payment_method`, dengan default QRIS untuk pesanan lama.

Belanja ulang memakai fragment identitas keranjang pada domain aplikasi yang sama. Pilihan baru diverifikasi sebelum cookie invoice sebelumnya dilepas; invoice tetap tersimpan. Pembersihan keranjang hanya mengurangi unit yang dikirim, bukan stok atau status pembayaran.

CSS order dan ongkir diberi scope berdasarkan halaman agar tampilan ketiga modul tidak saling menimpa. Katalog tetap menjadi halaman utama. `scripts/scope-styles.mjs` meregenerasi dua stylesheet scope ketika stylesheet asalnya diedit.

## Pemindahan data dari tiga aplikasi lama

Paket ini tidak berisi database atau file pengguna yang tersimpan di hosting lama. Source dapat diunggah ke GitHub, tetapi stok, pelanggan, pesanan, QRIS, bukti, dan konfigurasi provider perlu dipindahkan melalui proses tersendiri bila ingin digunakan di domain baru.

Urutan cutover yang sesuai dengan model data ini:

1. Siapkan database dan Blob baru; terapkan seluruh migrasi.
2. Ekspor tabel masing-masing aplikasi lama beserta file storage-nya, di luar repo Git.
3. Impor data dengan mempertahankan ID produk, kelompok ukuran, checkout, pesanan, dan nama key file. Salin file ke Blob privat memakai awalan `elite/`.
4. Jangan memindahkan sesi login owner/tim/pelanggan atau cookie browser lama. Buat sesi baru pada domain baru.
5. Pengenal pemilik berubah. Isi `admin_access.user_id` dan `settings.owner_id` dengan identitas pemilik baru yang dibuat login mandiri. Pastikan riwayat actor lama tetap disimpan sebagai riwayat; jangan memberinya hak akses.
6. Konfigurasi terenkripsi tidak dapat dibaca memakai rahasia baru. Masukkan ulang konfigurasi provider/Telegram melalui panel, atau lakukan re-enkripsi terkontrol menggunakan rahasia lama dan baru di luar repo.
7. Periksa jumlah stok, total pesanan, foto, bukti, dan file label. Tangani pesanan aktif serta booking yang sudah terjadi sebelum memindahkan webhook/bot.
8. Alihkan tautan pelanggan dan provider setelah verifikasi. URL pelacakan, checkout, dan tautan tim lama merujuk domain lama; jangan menganggap cookie atau tautan tersebut otomatis pindah.

Migrasi skema dalam paket dapat dijalankan sekarang tanpa akun hosting lama. Migrasi data belum dijalankan karena target Turso dan Blob akun Vercel belum disediakan.

## Validasi sebelumnya dan penyelarasan terbaru

Catatan berikut adalah validasi source gabungan sebelum penyelarasan 9 Oktober. Hasil pemeriksaan source terbaru dicatat pada [SYNC_RELEASE.md](SYNC_RELEASE.md).

Build produksi Next.js dan pemeriksaan TypeScript lulus. Suite memiliki 117 pengujian otomatis, termasuk batch rollback pada libSQL asli, login owner, pemisahan role, pendaftaran pelanggan, perhitungan berat server, checkout dengan harga katalog, proof upload, sinkronisasi stok sekali, Telegram, KiriminAja/Komerce, tracking, dan render PDF menjadi PNG dalam Node. Pengujian domain caption/filter tambahan dipertahankan. Respons provider memakai simulasi; ini tidak menggantikan aktivasi atau UAT akun kurir produksi.

Smoke test HTTP pada hasil build produksi juga lulus 29 pemeriksaan: halaman publik, redirect halaman privat, satu sesi untuk tiga panel, API bersama, login pelanggan terpisah, penolakan mutasi lintas origin, pencabutan sesi saat logout, serta seluruh asset CSS/JavaScript yang ditautkan. Interaksi visual desktop/HP dan konfigurasi layanan remote masih perlu diperiksa setelah deployment percobaan.
