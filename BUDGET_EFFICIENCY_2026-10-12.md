# Penghematan foto tanpa perubahan flow

## Implementasi

- Editor admin dan daftar stok meminta thumbnail 240 px. Foto utama editor tetap original untuk pemeriksaan detail/minus; jumlah maksimal 17 dan upload hingga 30 MB dari perangkat tetap sama.
- Preview draft diperbolehkan hanya setelah pemeriksaan admin per request. HTTP tetap private/no-store, tanpa validator draft. Cache Blob publik tidak dipakai untuk draft; cache byte draft terpisah dan dibatasi 8 MiB sumber +16 MiB preview, TTL 60 detik. Guest/sesi dicabut tidak dapat memakai cache tersebut.
- Kartu katalog menggunakan picture: viewport <=600 px meminta preview dengan sisi terpanjang 480 px; desktop tetap 800 px. Tidak crop, tidak upscale, WebP quality 88. Detail 1600 px dan zoom original tetap sama.
- Bila preview kartu gagal, picture beralih sekali ke original, termasuk melepas source mobile. Tidak ada retry loop atau polling baru.
- Foto lama tidak ditulis ulang. Tidak ada migrasi database, store baru, service baru, atau perubahan paket/budget.

## Pengukuran offline

24 foto produk snapshot lokal; tidak mengunduh ulang foto produksi:

| Gambar | Byte total |
| --- | ---: |
| Original | 15.855.968 |
| Kartu desktop 800 px | 2.616.656 |
| Kartu mobile 480 px | 851.410 |
| Thumbnail 240 px | 204.732 |

Mobile mengirim 67,5% lebih sedikit dibanding kartu desktop. Thumbnail mengirim 98,7% lebih sedikit dibanding original. Angka ini per foto sampel, bukan persentase penurunan keseluruhan tagihan. Editor masih membutuhkan satu original utama. Pengunjung baru, zoom, upload, header, Function, dan storage tetap memiliki biaya.

## Keputusan cache

Tidak mengubah route foto campuran menjadi cache CDN publik. Route yang sama juga melayani draft admin. Cache bersama berpotensi tetap menyajikan foto sesudah unpublish tanpa memeriksa akses. Dengan persyaratan akses dan flow existing tetap sama, pemeriksaan publication/admin tetap dijalankan sebelum cache. Optimasi baru mengurangi byte respons sambil mempertahankan sifat ini. CDN publik membutuhkan rancangan penarikan dan invalidasi tersendiri sebelum aman digunakan.

## Ruang lingkup yang dipertahankan

Stok, jadwal penjualan, SOLD, cart, checkout, perhitungan harga server, voucher, loyalty, signup/login, data pelanggan, QRIS, rekening, bukti pembayaran, ongkir, notifikasi, resi, analytics, dan interval refresh tidak berubah. Tidak membuat pesanan atau mengubah stok produksi untuk pengujian.

Build dilakukan lokal sebelum satu push GitHub untuk deployment otomatis. Hindari redeploy manual untuk commit yang sudah sedang dibangun.

## Validasi

Build produksi dan TypeScript lulus. Tes terfokus 23/23. Suite lengkap: 316/317 pada percobaan pertama, dengan satu kegagalan teardown Windows EBUSY pada database sementara; seluruh assertion bisnis berhasil. Tes promotions/schedules diulang terpisah dan lulus 15/15 termasuk cleanup. Browser menguji preview HP 390 px tanpa overflow, detail, keranjang, form checkout, serta fallback original saat preview sengaja dibuat gagal. Pengujian menggunakan database/layanan simulasi.
