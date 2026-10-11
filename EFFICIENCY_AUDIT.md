# Audit efisiensi ELITE.VTG — 11 Oktober 2026

Optimasi mempertahankan alur belanja, stok, voucher, akun, pembayaran, bukti, notifikasi, resi, tracking, dan analytics. Tidak ada perubahan paket, data produksi, QRIS, rekening, atau migrasi database.

## Evaluasi penggunaan

Dashboard terautentikasi (Last 30 Days; dapat tertunda sampai satu jam):

| Resource | Pemakaian | Evaluasi |
| --- | --- | --- |
| Fast Origin Transfer | 6,44 / 10 GB (64,4%) | Prioritas kapasitas setelah Blob |
| Fast Data Transfer | 3,26 / 100 GB | Masih rendah |
| Fluid Active CPU | 25m59s / 4h (10,8%) | Tidak tampak sebagai bottleneck kuota |
| Function Invocations | 21.969 / 1.000.000 (2,2%) | Rendah; request akun berulang dapat dihemat |
| CDN Requests | 38.112 / 1.000.000 (3,8%) | Rendah |
| Blob Simple Operations | 10.447 / 10.000 | Sudah melewati kuota; optimasi tidak menghapus penggunaan lama |
| Blob Transfer / Storage / Advanced | 3,26 GB / 83,92 MB / 172 | Belum melewati masing-masing kuota |
| Functions Storage | Screenshot: 417,21 MB / 10 GB; Usage Overview: 0 B | Tampilan berbeda; tidak menyimpulkan angka aktual berkurang |

Observability produksi 12 jam menunjukkan route foto sekitar 1,4K request dan 428,05 MB transfer keluar; katalog 427 request dan 2,44 MB keluar; akun 486 request dan 48,64 kB keluar. Foto mendominasi transfer route yang terlihat. Angka chart dan tabel bisa berbeda karena pembaruan waktunya; ini bukan persentase pasti seluruh periode.

Menurut [dokumentasi Private Blob](https://vercel.com/docs/vercel-blob/private-storage), pengiriman private file melalui Function melibatkan transfer Blob → Function dan Function → pengguna. Karena itu Fast Origin Transfer sekitar dua kali Blob Transfer masuk akal sebagai inferensi, bukan bukti atribusi seluruh 6,44 GB. Foto published tetap memakai optimasi browser/Blob sebelumnya; QRIS dan bukti tetap dilindungi.

## Perubahan yang diterapkan

1. GET katalog, detail produk, dan admin katalog memakai validator ETag yang dihitung dari pembacaan database terbaru. Data tidak berubah: 304 tanpa body; data berubah: 200 lengkap. Auth admin diperiksa sebelum validator. Respons private/no-store, Vary Cookie; snapshot hanya dalam komponen, dibatasi delapan URL, dihapus saat error. Jam server tetap dikirim supaya produk terjadwal terbuka tepat waktu.
2. Akun dan pemberitahuan reward berbagi request GET yang masih berjalan. Tidak menyimpan respons akun selesai. Login/logout membatalkan generasi lama agar respons sebelum pergantian sesi tidak menang.
3. Refresh otomatis hanya saat tab visible. Focus/pageshow/visibility digabung dalam 100 ms. Stok tetap diperiksa setiap 15 detik saat aktif, voucher setiap 60 detik; refresh manual tetap langsung.
4. Admin tidak lagi menjalankan INSERT identitas pemilik yang tidak mengubah data pada setiap baca. Binding tetap diperiksa setiap request, inisialisasi memakai konflik aman dan membaca ulang identitas yang tersimpan. Tidak ada cache otorisasi.
5. Query grup ukuran publik tidak menarik grup SOLD tersembunyi atau lewat 30 hari. Penggabungan produk/grup memakai Map, menghilangkan pemindaian semua grup untuk setiap produk. Pembacaan admin dan direct URL mempertahankan data lengkap.
6. WASM PDFium tidak dipaksa masuk semua API. Asset tetap tersedia untuk pemrosesan shipment admin, Telegram, dan callback KiriminAja. Tracing otomatis mempertahankan dependency lain yang diperlukan.

## Bukti pengukuran dan pengujian

| Skenario lokal, production build | Sebelum | Sesudah |
| --- | --- | --- |
| GET akun saat membuka katalog | 2 | 1 |
| Body empat pengecekan katalog tidak berubah | 66,320 byte | 0 byte (header tetap ada) |
| API trace yang membawa PDFium WASM | 35 | 6 |

Perbandingan body bukan klaim penghematan seluruh tagihan/transfer: respons 304 masih memanggil Function dan database, header tetap memakai jaringan. Penghematan request akun pada pembukaan katalog terukur 50%; tidak diasumsikan sebagai 50% seluruh invocations. Ukuran file trace bukan meter Functions Storage Vercel.

245 tes lulus, build produksi dan pemeriksaan TypeScript lulus. Cakupan: perubahan stok/harga/publication, SOLD aging/hide/direct URL, cart/checkout, harga server dan voucher, login/logout race, sesi admin invalid, konflik binding pemilik, origin protection, QRIS/BCA, upload bukti, Telegram idempotency, ongkir, tracking, dan render PDF/PNG resmi. Ketiga entry point render diverifikasi memiliki WASM dalam trace.

Browser: produk → keranjang → form checkout dengan barang/harga/voucher terisi; admin stok dikurangi/restock pada database simulasi menunjukkan 19 → 18 → 19 tersedia. Desktop 1265 × 720 diverifikasi. Permintaan emulasi HP 390 × 844 tidak diterapkan oleh browser aplikasi, sehingga verifikasi mobile tidak diklaim; override sudah di-reset. Layout/CSS tidak diubah. Tidak membuat transaksi, mengubah stok, mengirim Telegram, atau mengganti aset di produksi. Pengujian layanan eksternal memakai fixture/mocks lokal.

## Batas praktis

Usage historis tetap tercatat. Blob sudah melewati limit; optimasi membantu laju berikutnya, tidak menjamin akses Blob tidak dibatasi. Fast Origin Transfer adalah batas berikutnya yang harus diperhatikan; masih tersisa sekitar 3,56 GB menurut pembacaan ini. Pengunjung baru tetap perlu mengunduh foto. Tidak mematikan analytics, memperlambat interval stok, atau menyimpan keputusan checkout/pembayaran/otorisasi dalam cache.

Referensi: [CDN usage](https://vercel.com/docs/manage-cdn-usage), [Functions usage](https://vercel.com/docs/functions/usage-and-pricing), [Private Blob](https://vercel.com/docs/vercel-blob/private-storage). Hasil terstruktur: EFFICIENCY_AUDIT_METRICS.json.
