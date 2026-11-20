# Pemulihan pencatatan Analytics

Perubahan ini memisahkan kegagalan teknis, pemulihan foto, penolakan stok/jadwal dan perjalanan Reserve. Tidak membutuhkan dependency, environment variable atau migrasi baru.

## Perilaku

- Client menunggu konfirmasi sesi melalui `X-Analytics-State`. Kegagalan awal dicoba ulang paling banyak tiga kali secara otomatis; setelah itu ada jeda 60 detik sebelum percobaan yang dipicu aktivitas berikutnya. Tidak ada polling tambahan.
- Antrean hanya di memori: maksimal 32 event dan umur lima menit. ID event tetap saat retry; deduplikasi sukses dibatasi 512 entri dan 20 menit. Staf/bot yang dikecualikan tidak dicoba ulang.
- Daftar pathname client/server sama, mencakup halaman lanjutan, pesanan dan tracking tanpa mengirim query/fragment/invoice.
- Foto preview yang pulih lewat original mencatat `image_recovered`. Kegagalan original mencatat `critical_image` dengan produk valid. QRIS memakai `qris_image_error`. Makna historis `critical_image` tidak ditulis ulang.
- Penolakan keranjang karena sold, jadwal atau batas jumlah dipisahkan dari kegagalan penyimpanan keranjang. Event berulang dideduplikasi per sesi/produk/lima menit.
- Checkout DP memakai event berawalan `reserve_` dan laporan terpisah. Mode diverifikasi dari pilihan katalog server. Event pembayaran Reserve dihubungkan melalui kolom checkout yang sudah ada; data lama tanpa view DP tidak direkonstruksi.
- Kegagalan bukti DP dan tindakan pembayaran/perpanjangan diamati secara best effort. Pencatatan tidak menentukan keberhasilan transaksi.
- Log kegagalan server menyimpan hanya nama dan kode error dari daftar aman, tanpa pesan mentah, SQL, URL atau kredensial.

## Validasi

714 tes lulus, build webpack dan TypeScript lulus, 49 pemeriksaan HTTP pada build terisolasi lulus. Lint scope app/components/modules/lib tetap 171 error dan 71 warning, tanpa perubahan jumlah per file terhadap baseline.

Browser lokal memaksa visit pertama gagal dan preview foto gagal. Setelah retry, database fixture menyimpan satu visit, satu product view, dan satu image_recovered; foto original tampil dan dashboard menampilkan pemulihan tanpa error gambar akhir. Tidak ada aktivitas transaksi/provider produksi untuk pengujian.

Hasil belum membuktikan penyebab spesifik LibsqlError historis atau memulihkan detail kejadian lama yang tidak tersimpan. Koneksi yang diblokir browser sepenuhnya atau antrean yang kedaluwarsa tetap bisa menghasilkan aktivitas tidak tercatat.

Rilis hanya setelah persetujuan produksi terpisah. Setelah rilis, periksa deployment/domain/commit dan pembacaan admin; jangan membuat transaksi produksi untuk smoke test.
