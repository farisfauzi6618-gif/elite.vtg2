# Audit Vercel Blob ELITE.VTG — 11 Oktober 2026

Audit source, request lokal, keamanan, dan optimisasi dengan mempertahankan private Blob store. Angka Usage awal berasal dari pemilik: sekitar 8.500 Simple Operations, transfer 2,42 GB, storage 83 MB, Advanced Operations 170, CDN Requests 28.000, dan Function Invocations 16.000 selama sekitar dua hari. Audit tidak mengunduh log billing per request, sehingga atribusi historis tepat 8.500 operasi belum dapat dibuktikan.

## Diagnosis sebelum perubahan

| Peringkat | Penyebab | Dampak | Bukti |
| --- | --- | --- | --- |
| 1 | `storage.get()` selalu `useCache:false` | HIGH | SDK menambahkan `cache=0`; seluruh pembacaan foto melewati Blob CDN cache. Foto terbit menggunakan endpoint proxy `/api/photos/{UUID}` dengan `private, no-store`, sehingga browser juga mengambil ulang file. |
| 2 | `storage.head()` sebenarnya menjalankan `get()` lalu membatalkan stream | MEDIUM | Pemeriksaan kesiapan QRIS mengunduh respons file hanya untuk membaca ukuran/MIME. `paymentConfig()` menjalankannya pada `/api/config`, dashboard pesanan, pembuatan order, perubahan metode, dan upload bukti. |
| 3 | Daftar stok admin menggunakan eager images | MEDIUM | 20 foto diambil pada pemuatan admin, meskipun sebagian berada jauh dari viewport. Refresh mengulang 20 unduhan. |
| 4 | Development, pengujian, migrasi, serta pembukaan halaman berulang | MEDIUM, atribusi belum pasti | Migrasi awal memverifikasi 162 file. Pengujian halaman/foto berulang memakai store produksi pada pekerjaan sebelumnya. Sumber ini dapat menambah Usage, tetapi jumlah historis per proses tidak tersedia. |
| 5 | Polling data dan request customer/analytics berulang | LOW untuk Blob | Katalog dan admin stok polling 15 detik, tetapi hanya membaca database. Tidak ada Blob `list()` pada runtime katalog. Analytics tidak membaca Blob. |

Kesimpulan: 8.500 operasi dalam dua hari masuk akal untuk arsitektur sebelum perbaikan, dan menunjukkan inefisiensi cache yang nyata. Sebagai ilustrasi, 425 kunjungan/refresh yang mengambil 20 foto menghasilkan 8.500 pembacaan foto. Itu ilustrasi, bukan estimasi jumlah pelanggan. Pemeriksaan QRIS, pengujian, serta cache bypass juga ikut meningkatkan operasi. Tidak ditemukan loop Blob yang dijalankan setiap detik atau bukti bahwa angka tersebut berarti 8.500 transaksi.

Simple Operations merupakan cache MISS akses Blob dan pemanggilan metadata `head`; Blob CDN HIT tidak dihitung sebagai Simple Operations. Akses URL tetap dapat menghasilkan CDN Requests dan transfer. Karena itu jumlah network request, pemanggilan SDK, dan operasi yang ditagihkan harus dibedakan. [Definisi resmi Vercel](https://vercel.com/docs/vercel-blob/usage-and-pricing).

## Inventaris lengkap runtime

| File / fungsi | Operasi | Pemicu / frekuensi potensial |
| --- | --- | --- |
| `lib/storage.ts` → `head` | Sebelum: SDK `get`, cancel stream. Sesudah: SDK `head` | Hanya probe metadata QRIS melalui `paymentConfig`. Sebelum satu per panggilan konfigurasi; sesudah maksimal satu per 60 detik per instance hangat untuk asset yang sama, selain pemeriksaan gagal. |
| `lib/storage.ts` → `get` | SDK `get` private | Wrapper semua unduhan. Sebelum bypass cache untuk semua file. Sesudah foto produk terbit boleh memakai Blob cache; default untuk file lain tetap bypass. |
| `lib/storage.ts` → `put` | SDK `put` private | Satu per unggahan foto, bukti, atau label; tidak dipanggil saat render. |
| `lib/storage.ts` → `delete` | SDK `del` | Cleanup yang sudah ada pada upload foto yang gagal menyimpan DB dan bukti yang kalah race. Audit tidak menjalankan delete Blob dan tidak mengubah perilaku cleanup. |
| `app/api/photos/[key]/route.ts` → GET | `bucket.get` | Satu per request foto yang tidak ditangani browser cache; conditional request yang cocok menjadi 304 tanpa membaca Blob. Publikasi/otorisasi tetap diperiksa sebelum 304. |
| `modules/catalog/photos.ts` → `storePhoto` | `put`, cleanup `delete` hanya jika DB gagal | Upload admin / import Instagram resmi. Setiap foto baru mendapat UUID baru; metadata ukuran, MIME, source, dan waktu tersimpan di tabel `photos`. |
| `modules/catalog/photos.ts` → `copyInstagramPhoto` | HTTP ke CDN Meta, kemudian `storePhoto` | Import yang diminta admin; bukan request render atau listing. |
| `modules/order/payment-config.ts` → `paymentConfig` | `BUCKET.head`, kini melalui probe TTL | `/api/config`, `/api/admin/order`, `ready()` jika konfigurasi belum diberikan, POST order, PATCH metode, POST proof. Data rekening/merchant tetap berasal dari environment terpercaya. |
| `app/api/qris/route.ts` → GET | `bucket.get` | Saat gambar QRIS benar-benar ditampilkan. Konsisten/no-store; ukuran, MIME signature, dan SHA-256 diperiksa setiap pembacaan. |
| `app/api/order/proof/route.ts` → POST | `put`, existing race cleanup `delete` | Sekali untuk upload bukti yang valid. Order yang sudah memiliki bukti tidak upload ulang. Tidak di-cache publik. |
| `modules/order/order-server.ts` → `notify` | `get` bukti | Saat bukti perlu dikirim ke Telegram dan message ID belum ada. Lease/status/message ID membatasi pengulangan; retry kegagalan tetap mungkin. |
| `app/api/admin/order/orders/[id]/route.ts` → GET | `get` bukti | Hanya setelah autentikasi owner; setiap download yang diminta. `no-store`, attachment. |
| `modules/order/fulfilment.ts` | `put` PDF, `get` PDF untuk render, `put` PNG; `get` PDF/PNG untuk Telegram | Untuk label yang belum disimpan / message yang belum terkirim; bukan polling atau render katalog. |
| `modules/order/kirimin-fulfilment.ts` | `put` PDF, `get` PDF untuk render, `put` PNG | Pipeline label KiriminAja; menggunakan guard label/message yang sama. |
| `app/api/admin/order/shipments/[id]/route.ts` → GET | `get` PDF/PNG | Setelah autentikasi owner, dan hanya saat format file diminta. Pembacaan summary shipment sendiri tidak membaca Blob. `private, no-store`. |
| `scripts/payment-qris.mjs` | `put` | Hanya jika provisioning owner dijalankan dengan `--upload`; key QRIS baru, tanpa menimpa file lama. Tidak dijalankan dalam audit. |

Tidak ada SDK `list`, `copy`, signed download URL generation, atau Blob metadata lookup per product card pada aplikasi produksi. `tests/all-products-flow.mjs` dan `tests/production-http.mjs` adalah pengujian manual, bukan cron. Test unit memakai file lokal/mock SDK. Tidak ada cron Blob dalam `vercel.json`.

## Skrip migrasi / development di luar paket deployment

`migration-private/upload-private-blob.mjs` memakai `list` sekali per halaman 1.000 file, `put` untuk file yang belum ada, `get(useCache:false)` untuk memverifikasi setiap file, dan satu pemeriksaan anonymous proof. Laporan migrasi mencatat 162 file (139 foto, 22 bukti, 1 QRIS), sekitar 82,8 MB. `migration-private/sync-delta-assets.mjs` memakai `get` untuk pemeriksaan keberadaan, `put` bila belum ada, dan `get` untuk verifikasi foto tambahan. Keduanya manual, tidak dipanggil dari website, dan tidak dijalankan ulang dalam audit ini. Checkout `sync-work/baseline` serta salinan `deploy-work` tidak menambah runtime terpisah hanya karena ada di disk.

Polling katalog/admin stok: 15 detik = sekitar 240 request data per jam per tab visible. Pada detail, refresh data membaca katalog dan produk. Polling tidak mengubah URL foto atau me-remount seluruh grid melalui loading skeleton. Reward quote dan tracking memakai 60 detik; clock jadwal 1 detik hanya state lokal. Dashboard pesanan mengambil konfigurasi saat dibuka, tanpa interval otomatis. HMR/Strict Mode dapat mengulang request pada development, tetapi server lokal sekarang memakai database/file simulasi, tanpa credential produksi.

## Alur gambar dan perubahan aman

Sebelum: browser → API foto → private Blob origin setiap kali. Sesudah: browser memakai cache pribadi foto terbit; jika belum ada, API tetap memeriksa publikasi lalu membaca private Blob melalui CDN cache terautentikasi. Tidak ada perubahan store, migrasi file, penghapusan file, atau public Blob URL baru.

- Foto terbit: `private, max-age=86400, immutable`, ETag berdasarkan UUID. Tidak memakai shared HTTP/CDN response cache, karena endpoint yang sama dapat melayani draf owner.
- Conditional GET foto terbit: 304 tanpa Blob read setelah status publikasi diperiksa. Error/404 tidak disimpan.
- Draf/foto belum terbit: autentikasi admin tetap wajib, `private, no-store`, tanpa ETag yang membypass pemeriksaan.
- Hanya route foto terbit memberikan `useCache:true` ke private Blob SDK. Proof, label, dan QRIS mempertahankan consistent reads serta no-store response.
- QRIS metadata memakai `head()` asli, single-flight, TTL keberhasilan 60 detik dan kegagalan 5 detik, dibatasi satu asset per instance. Key, MIME, fingerprint, atau bucket berubah langsung menyebabkan probe baru. Cache ini hanya kesiapan, bukan gambar atau tujuan pembayaran.
- Daftar stok dan thumbnail editor admin memakai native lazy loading. Foto utama editor tetap segera tampil.
- Tidak ada kompresi, resize, penurunan resolusi, atau perubahan bytes foto. Katalog tetap native `<img>`; tidak ditambah Next Image optimizer, preload, atau prefetch gambar.
- URL foto stabil tanpa query tambahan. Penggantian upload menggunakan UUID baru, sehingga cache lama tidak menutupi gambar baru. Stock, availability, SOLD, schedule, dan harga tetap data dinamis/no-store.
- Metadata foto sudah disimpan pada upload; tidak perlu migrasi tabel atau backfill. QRIS memerlukan pemeriksaan keberadaan sehingga dipakai metadata probe terbatas, bukan menganggap file selalu ada.

## Pengukuran sebelum/sesudah

Detail numerik berada di `BLOB_AUDIT_METRICS.json`. Ini pengukuran HTTP yang benar-benar mencapai server lokal menggunakan build produksi, database dan file terisolasi, melalui browser yang sama. JS/CSS sudah memiliki cache dari pengujian terdahulu. Foto pertama masih belum cached pada awal pengukuran. Request yang dilayani memory/disk browser tidak masuk hitungan HTTP server. Angka ini bukan billing counter Vercel.

Skenario desktop memakai 20 barang terbit (19 available, 1 SOLD) dalam fixture. Refresh, navigasi detail, cart, checkout, search, filter, dan admin diuji melalui UI. First view foto: 16 HTTP, lalu 4 foto tambahan saat scroll; native lazy loading memang bekerja. Tidak semua foto langsung preload. Pencarian/filter pada daftar yang sudah terbaca tidak menjalankan Blob lookup. Satu tab admin lama sempat polling selama awal pengukuran sesudah; request admin yang dapat diidentifikasi dikeluarkan dari hitungan customer dan jumlah pengecualiannya dicatat di JSON. Pengukuran refresh katalog final dilakukan setelah tab tersebut ditutup.

| Skenario utama | Sebelum: HTTP total / foto | Sesudah: HTTP total / foto |
| --- | --- | --- |
| Refresh homepage/katalog | 22 / 16 | 6 / 0 |
| Buka detail dari katalog | 10 / 1 | 9 / 0 |
| Refresh detail | 10 / 1 | 9 / 0 |
| Tambahkan + buka cart | 3 / 1 | 4 / 0 |
| Buka checkout | 12 / 0 | 14 / 0 |
| Refresh checkout | 12 / 0 | 12 / 0 |
| Buka admin setelah katalog selesai di-scroll | 22 / 20 | 3 / 0 |
| Refresh admin katalog | 23 / 20 | 3 / 0 |
| Search + filter katalog | 2 / 0 | 2 / 0 |
| Search + filter + scroll admin | 1 / 0 | 1 / 0 |

Total dapat sedikit berbeda karena polling 15 detik, favicon, waktu antar aksi, dan chunk admin baru. POST analytics ke URL yang sama dapat merekam event berbeda; kolom duplicate method/URL pada JSON bukan bukti semua POST tersebut redundan. Dua request `/api/customer` berasal dari hook akun dan notice reward; keduanya database-only. Tidak diubah karena bukan penyebab Blob tinggi.

Hasil yang relevan: 16 → 0 pembacaan ulang foto saat refresh katalog, dan 20 → 0 saat refresh admin pada browser yang sudah mempunyai foto. Itu 100% pengurangan repeated photo reads dalam skenario tersebut, serta sekitar 73% pengurangan HTTP total pada refresh katalog. Ini bukan klaim pengurangan 100% seluruh penggunaan Blob. Pengunjung/browser baru tetap memerlukan foto. Cold Blob CDN MISS tetap dapat ditagihkan; HIT tidak menambah Simple Operations.

Test probe menggunakan SDK mock: 120 pemeriksaan kesiapan berurutan dalam satu menit menghasilkan 1 metadata request, dibanding 120 sebelumnya: potensi pengurangan 99,2% pada instance hangat untuk kasus tersebut. 20 pemeriksaan concurrent juga berbagi satu request. Serverless instances/cold starts dan route bundles tidak berbagi cache global, sehingga penghematan proyek sesungguhnya perlu dinilai dari Usage sesudah rilis.

Pada checkout ada satu readiness lookup tersembunyi di belakang `/api/config`; ini tidak masuk jumlah image/Blob-asset HTTP browser. Tabel JSON mencatat `configRequests` agar perbedaan terlihat. Browser checkout yang diuji berhenti sebelum transaksi/bukti baru, dengan provider ongkir fixture yang memang tidak aktif (409). Uji order, shipping, proof, Telegram, label, dan konfirmasi penuh memakai provider simulasi dalam regression suite.

Scroll pada detail/cart/checkout tidak memiliki pemicu Blob tambahan kecuali gambar galeri baru benar-benar masuk viewport. Search/filter tidak tersedia pada detail/cart/checkout. Tidak diklaim sebagai aksi UI yang tidak dimiliki halaman tersebut. HP diuji pada viewport 390×844: grid, detail, serta zoom bekerja tanpa overflow; empat foto awal tetap memiliki lebar asli sekitar 1.121–1.122 px. Ukuran/resolusi file tidak diubah.

## Validasi

- 231 automated tests passed; build produksi dan TypeScript passed.
- Private Blob SDK tetap `access:'private'`; opt-in caching hanya foto terbit.
- Draf anonymous ditolak; conditional request pada produk yang menjadi draf kembali ditolak; conditional foto terbit tidak membaca storage.
- Penggantian foto memperoleh key dan ETag baru; bytes dan metadata tetap sama.
- Customer/tim/anonymous ditolak sebelum membaca proof dan label; owner proof download tetap no-store.
- QRIS yang bytes-nya berubah dari fingerprint terpercaya ditolak, dan dashboard tidak dapat mengubah QRIS/rekening. Nominal, stock sync, voucher, SOLD, shipping, analytics, dan auth ikut regression suite.
- Tidak ada order test, stock mutation, Blob upload, Blob delete, atau migrasi database produksi untuk audit ini.

## Batas dan rekomendasi 10× traffic

1. Angka 8.500 yang sudah terpakai tidak turun atau di-reset oleh deploy. Penghematan berlaku untuk operasi berikutnya. Cocokkan laju kenaikan Usage setelah rilis dengan durasi serta traffic yang sebanding; audit ini belum mengukur periode pascarilis sepanjang dua hari.
2. Foto yang sudah pernah publik dapat tetap berada di browser pelanggan hingga 24 jam setelah dijadikan draf. Request baru ke server tetap ditolak. Jika diperlukan pencabutan foto publik secara segera, gunakan strategi cache yang lebih pendek/harus revalidate; jangan men-cache draf/proof/label secara publik.
3. Kesiapan QRIS dapat tertahan maksimal 60 detik pada instance hangat apabila file hilang dari store. Gambar QRIS sendiri tetap dibaca konsisten dan diverifikasi; gambar yang berubah tidak lolos fingerprint. Kegagalan probe dapat pulih setelah 5 detik.
4. Cold user/device, banyak foto baru/region, atau CDN eviction tetap menghasilkan pembacaan. Private proxy masih memakai Function dan transfer dua jalur. Foto cached mengurangi operasi ulang, tetapi bukan menghilangkan semua CDN Requests/transfer.
5. Untuk traffic 10×, ukur hit ratio dan transfer aktual terlebih dahulu. Estimasi: jika 10.000 photo reads mempunyai 90% Blob HIT, sekitar 1.000 MISS foto dapat menambah Simple Operations, plus metadata/proof/label. Itu model, bukan jaminan. Jangan mengalikan penghematan browser lokal menjadi janji Usage proyek.
6. Pertahankan pemisahan data stok dan immutable foto. Bila bandwidth menjadi masalah berikutnya, pertimbangkan thumbnail baru sebagai asset tambahan sambil menjaga original untuk detail/zoom; tidak diterapkan dalam audit ini karena perlu pengujian kualitas/UX dan tambahan storage.
7. Bila Function overhead menjadi masalah, evaluasi CDN response cache khusus asset publik pada endpoint terpisah dengan aturan publikasi/revokasi yang jelas. Evaluasi public product store atau signed delivery hanya sebagai perubahan terencana; proof/customer uploads/admin docs tetap privat. Tidak ada perubahan arsitektur tersebut pada rilis ini.
8. Hindari pengujian visual/migrasi berulang ke store produksi. Pakai preview database/file lokal dan mock; smoke test produksi secukupnya. Tidak perlu mengurangi polling stok demi menekan Blob karena polling data bukan penyebabnya.
9. Kuota Hobby tetap terbatas; optimisasi tidak menjamin traffic 10× akan muat. Paket akun tidak diubah. Batas serta definisi operasi mengikuti [dokumentasi Vercel Blob](https://vercel.com/docs/vercel-blob/usage-and-pricing); consistent reads dan cache option mengikuti [SDK resmi](https://vercel.com/docs/vercel-blob/using-blob-sdk).
