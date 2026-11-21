# ELITE Finance V1 — Laporan implementasi dan audit lokal

**Tanggal:** 21 November 2026, Australia/Sydney. **Status:** implementasi lokal untuk ditinjau; belum push, merge, deploy, aktivasi atau migrasi produksi.

Lokasi hasil: `/Users/mac/Projects/elite.vtg2-finance-v1`, branch `codex/elite-finance-v1`. Basis source `4fe3eaca2b59809e0b19d73232260f62d52e5e09`. Deployment produksi `dpl_D2b4pf24fuBJpCwP87PsuT2SnEvG` kembali diperiksa melalui konektor Vercel: **READY**, target production, commit yang sama. Main asli dipertahankan. AGENTS.md, README/arsitektur, source aktual, migrasi dan dokumentasi Next.js lokal dibaca sebelum implementasi; rencana awal ada di `docs/ELITE-FINANCE-V1-PLAN.md`.

## A. Existing System Audit

### Bagian yang dipakai ulang

| Kebutuhan | Sumber existing dan keputusan |
|---|---|
| Produk, ukuran/warna dan stok | `products` dan `size_groups`, termasuk identitas SKU/varian; tidak membuat master produk baru. |
| Riwayat stok manual | `stock_history`; Finance hanya merujuk pengurangan stok yang sudah terjadi. |
| Pilihan barang dan harga transaksi | Snapshot `catalog_checkouts.lines_json` dan `orders.catalog_items_json`; harga katalog saat ini tidak dipakai untuk menghitung ulang order lama. |
| Pembayaran dan penjualan website | `orders.payment_state`, `confirmed_at`, merchandise net/subtotal/diskon dan marker stok existing. Bukti terunggah saja bukan penjualan. |
| Reserve/DP | Diakui sebagai penjualan barang hanya saat PAID dan pembayaran dikonfirmasi; tidak menghitung DP awal/cicilan sebagai penjualan penuh. |
| Izin | Session pemilik utama dan pengelola penuh existing. Tim katalog/Analytics dan pelanggan tidak otomatis mendapat Finance. |
| Sales Intelligence / Analytics | Tetap dipakai untuk pemasaran/interaksi; tidak diduplikasi menjadi buku laba. |

Belum ditemukan master HPP/lot modal, pemilik modal, split laba per unit, ledger biaya, advance, settlement atau closing keuangan yang memenuhi kebutuhan ini. Order manual existing tidak selalu mempunyai SKU terverifikasi; Finance menahan pengakuan lengkap sampai pemetaan dan referensi stok diperiksa.

### Risiko yang ditangani

- HPP historis kosong **UNKNOWN**, bukan Rp0; closing ditahan. Rp0 hanya sah bila diisi secara eksplisit sebagai biaya nyata nol.
- Satu produk dengan biaya/pemilik berbeda memakai beberapa lot SKU. Tidak dipaksa menjadi satu HPP rata-rata.
- Edit modal setelah konfirmasi tidak mengubah versi biaya yang berlaku saat konfirmasi, walaupun sinkronisasi Finance dilakukan belakangan.
- Penjualan/pengurangan stok yang sama tidak boleh digunakan ulang sebagai penjualan DM.
- Pembatalan, refund, perubahan nilai sumber atau undo stok memerlukan review. Tidak otomatis membebankan kerugian luar biasa kepada pemilik modal.
- Bila source legacy tidak lengkap, Finance tidak menebak SKU, harga, tanggal atau HPP; diperlukan pemeriksaan pemilik.

## B. ELITE Finance Architecture

### Modal, lot dan snapshot

Lot berisi SKU, jumlah unit, tanggal perolehan, HPP/unit, biaya perolehan tambahan/unit, pemilik modal dan split. Bulk entry berlaku untuk beberapa SKU dengan konfigurasi sama. Preset berlabel Kakak/Adik 70/30, 50/50, 30/70 serta custom sampai dua angka desimal; server wajib memvalidasi total 100%.

Versi modal disimpan append-only. Penjualan memakai FIFO lot yang tersedia pada SKU dan revisi modal saat konfirmasi, dengan tanggal perolehan yang sudah berlaku. Unit terjual menyimpan HPP, pemilik, persentase, identitas lot/versi dan versi kebijakan. Perubahan berikutnya hanya berlaku untuk unit tersisa. Biaya historis yang belum diketahui hanya dapat dilengkapi melalui review/backfill pemilik utama; snapshot yang sudah lengkap tidak ditimpa.

### Penjualan dan periode

Periode V1 memakai **Asia/Jakarta/WIB**, sesuai operasional Indonesia; pemilik di Australia tetap melihat batas bulan WIB yang sama. Order normal diakui pada konfirmasi pembayaran; Reserve pada konfirmasi pelunasan. Merchandise setelah diskon/voucher menjadi pendapatan. Ongkir dan Shipping Protection pass-through dikeluarkan dari pendapatan barang; subsidi/biaya provider yang sungguh ditanggung usaha dicatat sebagai biaya nyata.

Sebuah outbox menyimpan hanya snapshot ekonomi, SKU dan revisi modal saat konfirmasi. Tidak menyimpan nama/alamat pelanggan, password, bukti pembayaran atau token. Tidak ada kalkulasi laporan bulanan atau request eksternal di checkout. Migrasi menambahkan penulisan database ringan pada konfirmasi/perubahan ekonomi; overhead ini tetap harus diamati setelah aktivasi, tanpa mengklaim angka penghematan atau dampak produksi yang belum diukur.

Admin menyinkronkan satu bulan, maksimal 100 sumber per proses; tombol Perbarui penjualan melanjutkan batch berikutnya. Query memakai indeks rentang waktu dan indeks referensi penjualan. Bulan lama yang mempunyai antrean relevan harus disinkronkan dahulu untuk menjaga urutan FIFO.

Untuk DM tanpa invoice website, pilih SKU, pengurangan stok manual existing yang belum dipakai, jumlah sesuai riwayat, tanggal dan harga kesepakatan serta referensi unik. Finance tidak mengurangi stok atau membuat order kedua. DM yang dicatat mundur dari tanggal hari ini tidak otomatis mengambil biaya terbaru seolah-olah sudah berlaku dahulu: HPP memerlukan backfill eksplisit. Order manual existing dipetakan ke SKU dan riwayat stok dengan total unit/subtotal yang cocok; tidak dibuat penjualan DM duplikat.

### Rumus dan pembulatan

`Hasil unit = merchandise net − HPP − biaya direct − alokasi shared`.

Shared dibagi rata per unit terjual bulan tersebut. Direct diarahkan ke satu unit, atau dibagi rata hanya di antara unit dalam order tujuan. Distribusi diskon proporsional terhadap nilai unit. Semua memakai integer IDR; largest remainder dan urutan ID stabil mempertahankan setiap rupiah. Sisa pembulatan split dengan bobot sama menggunakan urutan Kakak kemudian Adik.

Hasil unit positif mengikuti split; negatif seluruhnya ke pemilik modal; nol tidak membagikan laba/rugi. Keputusan dilakukan per unit, bukan setelah untung/rugi seluruh bulan digabungkan. Kerugian exceptional/refund/chargeback memakai koreksi pemilik utama dengan atribusi eksplisit Kakak/Adik/belum dialokasikan, serta perubahan hak modal terpisah bila diperlukan. Finance tidak menjalankan refund atau restock.

Bulan nol penjualan menyimpan biaya sebagai kerugian periode belum dialokasikan. Pemilik dapat mengakui saldo itu saat closing; sistem tidak membuat penjualan palsu atau membebankannya otomatis ke salah satu pihak.

### Biaya, advance dan pembayaran aktual

Biaya mempunyai tanggal, kategori, nominal, pembayar, shared/direct, keterangan, referensi teks dan metadata revisi. Draft dapat diedit dengan pemeriksaan revisi atau dibatalkan tanpa hard-delete; biaya yang sudah direimburse tidak diedit diam-diam. Biaya pribadi menciptakan advance pihak terkait. Reimburse dicatat sebagai settlement, tidak menjadi biaya/profit kedua. Gaji yang sudah menjadi biaya tidak dipotong lagi.

Saldo pihak = hak modal + hasil bersih + advance biaya − transfer tercatat. Kerugian mengurangi hak total; angka modal bruto bukan instruksi untuk membayar seluruh modal tanpa memperhitungkan rugi. Kelebihan transfer tetap terlihat sebagai saldo negatif/piutang. Arah pengembalian dapat dicatat terpisah. **Semua transfer hanya catatan atas uang yang sudah dipindahkan sendiri; sistem tidak mengirim uang.**

### Closing dan izin

Pemilik utama memeriksa semua sumber, HPP/pemilik/split, biaya, koreksi dan rekonsiliasi sebelum finalisasi. Fingerprint menolak persetujuan terhadap laporan yang sudah berubah. Snapshot closing/checksum immutable; membuka ulang menyimpan versi lama dan alasan/audit. Pembacaan bulan tertutup memakai snapshot tersimpan, bukan menghitung ulang unit. Perubahan sumber setelah closing menampilkan peringatan tanpa menimpa hasil lama; koreksi dapat dicatat pada bulan terbuka dengan referensi sumber.

Pengelola penuh existing dapat melihat Finance dan mengisi data operasional yang diizinkan. Hanya pemilik utama melakukan backfill historis, pemetaan order manual sensitif, koreksi, tutup/buka bulan serta pencatatan settlement. Customer/tim katalog/Analytics ditolak. Proteksi session/origin existing dipakai, body API dibatasi 64 KB, idempotency key mencegah pengulangan write, dan data sensitif tidak masuk DTO produk publik.

## C. Implementation

### File dan database

- `modules/finance/{types,validation,calculations,storage,lots,sales,ledger,report,export,server}.ts`: aturan, akses privat, lot/versi, sinkronisasi, ledger, closing, rekonsiliasi, ekspor CSV.
- `app/api/admin/finance/route.ts`: GET/POST terautentikasi, tanpa DELETE.
- `app/admin/finance/{page,ui,client,forms}.tsx` dan `finance.css`: ringkasan bulanan, modal, biaya, penjualan, tutup buku; kontrol mobile dan tabel bergulir.
- `components/admin-navigation.tsx`, `app/admin/katalog/page.tsx`, `app/admin/katalog/admin.tsx`: menu Finance privat dan tautan di editor produk. Tidak menambahkan HPP ke tampilan pelanggan.
- `migrations/release_0029_finance.sql`: 13 tabel Finance termasuk claims stok dan outbox, indeks, trigger snapshot/append-only dan proteksi periode. Tidak mengubah migrasi lama.
- `tests/finance-calculations.test.mjs`, `tests/finance-server.test.mjs`, rencana dan laporan ini.

Jumlah perubahan akhir: 24 file, termasuk laporan ini. Package/dependency tidak diubah. Tidak ada kode checkout/payment/customer publik yang diedit. Tidak ada layanan berbayar baru, ARUS, cron Finance atau transfer bank otomatis.

Flag server **`ELITE_FINANCE_ENABLED=1`** diperlukan setelah skema tersedia; default nonaktif. Flag belum diubah pada produksi. Migrasi hanya dijalankan terhadap database fixture lokal. Ledger/checksum produksi **belum diperiksa pada tugas Finance ini**, sehingga keberadaan file release_0029 tidak dianggap bukti migrasi produksi boleh langsung dijalankan.

### Batas V1 yang disengaja

- Catatan biaya menggunakan referensi nota teks, belum upload gambar nota.
- Pencatatan DM mengharuskan riwayat stok existing; Finance bukan jalur stok baru.
- Koreksi/refund luar biasa ditinjau manusia; tidak menebak pihak penanggung atau memodifikasi source order/stok.
- Laporan dibatasi 4.000 baris/unit per jenis dalam satu bulan. Jika terpotong, ditandai dan finalisasi ditahan; bukan laporan lengkap untuk volume di atas batas itu.
- Unit dipaginasi 25, biaya/penjualan 50, lot 100. Filter lot di tampilan berlaku pada halaman lot yang sedang dimuat; pencarian SKU terpisah dibatasi dan perlu dipersempit. CSV mencakup bulan penuh dalam batas laporan, bukan hanya filter tampilan.
- Hak Finance pengelola mengikuti akun admin penuh existing; belum membuat role keuangan baru atau approval dua orang.
- Saldo adalah pencatatan hak dan transfer, bukan rekonsiliasi rekening bank otomatis.

## D. Test Results

| Pemeriksaan | Hasil akhir |
|---|---|
| Seluruh suite project | **766/766 lulus**, 0 gagal, 0 dilewati; termasuk 715 tes existing dan 51 tes Finance baru. |
| Perhitungan Finance | **22/22 lulus**. |
| Integrasi Finance/API/migrasi | **29/29 lulus**, termasuk upgrade database sebelum Finance dan penolakan checksum berubah. |
| TypeScript | `tsc --noEmit` berhasil. |
| Build produksi lokal | `next build --webpack` berhasil; tidak melakukan deployment. |
| Lint source Finance baru dan navigasi | 0 error, 0 warning. |
| Lint dua file katalog yang disentuh | 25 error dan 6 warning lama, sama dengan baseline main; tidak ada diagnostik baru. Lint seluruh repository tidak diklaim bersih. |
| Kebersihan patch | `git diff --check` berhasil. |

Tidak ada kegagalan akhir yang tersisa pada pemeriksaan di atas. Pengujian tidak membuktikan kebenaran HPP historis nyata atau perubahan kuota produksi; data tersebut tetap memerlukan review pemilik.

Skenario integrasi memakai API Finance aktual, session existing, migrasi lokal dan jalur konfirmasi pembayaran/stok existing. Semua data adalah fixture; request eksternal diblokir. Tidak membuat transaksi, bukti, pelanggan, booking, pembayaran atau pesan Telegram produksi.

Cakupan penting: kedua pemilik pada laba/rugi, preset/custom/0–100%, pembulatan IDR, data modal kosong, beberapa lot berbeda, voucher/diskon dan pengecualian ongkir/protection, reserve belum/lunas, duplicate events/write, sumber refund sebelum/sesudah import, biaya direct per unit/shared, nol penjualan, reimbursement/return/kelebihan bayar, immutable closing dan reopen versi baru, status fulfillment normal, mapping manual/stock claims, undo stok, izin primary/delegate/team/customer, CSRF/body limit, DTO publik, CSV injection, indeks query, upgrade legacy dan penolakan checksum berubah.

### Bukti mobile lokal

Pada viewport 390 × 844: login akun fixture, pencatatan modal Cap Rp80.000 + Rp5.000 dengan pemilik Adik dan split Kakak25%/Adik75%, penambahan biaya packaging pribadi Adik Rp10.000, serta finalisasi bulan berhasil melalui UI → API → SQLite → tampilan. Lebar dokumen 390 px, sama dengan viewport; tidak ada error/warning browser yang tertangkap selama alur tersebut. Ini uji viewport browser, bukan bukti pengujian perangkat iPhone fisik.

Snapshot fixture: 2 unit, merchandise Rp400.000, HPP Rp380.000, shared Rp70.001, hasil usaha **−Rp50.001**, Kakak **Rp45.500**, Adik **−Rp95.501**, unallocated Rp0. Total kedua pihak persis sama dengan hasil usaha. Closing Finalized; sumber produksi tidak digunakan.

Screenshot: `finance-mobile-overview.jpg` dan `finance-mobile-closing.jpg` di folder artefak `elite-finance-v1` pada chat ini. Screenshot diambil dari alur inti tersebut; setelahnya ada penyempurnaan kecil kontrol checkbox, pilihan direct per unit dan paginasi yang divalidasi melalui pemeriksaan kode/tipe/build. Bukti visual bukan klaim bahwa fitur sudah aktif di elitevtg.com.

## E. Usage Guide

1. **Masukkan modal:** dari editor produk pilih tautan Finance, atau menu ELITE Finance → Modal barang. Pilih SKU, jumlah unit yang biayanya sama, HPP/unit dan biaya tambahan/unit. Lot lain dipakai bila modal/pemilik berbeda. Jangan isi nol untuk HPP yang belum diketahui.
2. **Pilih pemilik modal:** Kakak atau Adik, terpisah dari persentase laba. Masukkan tanggal perolehan dan catatan bila perlu.
3. **Atur split:** preset berlabel atau custom Kakak/Adik dengan total100%. Lot tersisa dapat diberi versi baru; data unit yang sudah terjual tetap.
4. **Catat biaya:** pilih bulan WIB → Biaya. Isi tanggal, kategori, nominal, pembayar dan keterangan. Shared dibagi otomatis; Direct memilih order dan opsional unit tertentu. Biaya pribadi otomatis menjadi advance. Referensi nota opsional.
5. **Periksa penjualan:** Perbarui penjualan membaca order website yang benar-benar confirmed dan Reserve lunas. Lanjutkan batch bila masih tersisa. Jangan mencatat lagi di DM bila sudah ada invoice. Untuk DM tanpa invoice, kurangi stok lewat Katalog existing dahulu lalu pilih riwayat itu di Finance. Untuk order manual, pemilik memeriksa pemetaan SKU/riwayat stok. Lengkapi HPP historis melalui review, bukan edit diam-diam.
6. **Tinjau hasil:** Ringkasan menampilkan omzet merchandise, diskon, HPP, biaya, hasil unit dan hasil pihak. Lihat blocker dan saldo belum dialokasikan. Draft/Needs Review bukan pembagian final. CSV seluruh bulan membantu pemeriksaan di luar aplikasi.
7. **Finalisasi:** pemilik utama memeriksa checklist Tutup buku, rekonsiliasi dan pengakuan unallocated bila ada, lalu memberi catatan dan Finalisasi bulan. Perubahan belakangan memakai koreksi di bulan terbuka atau reopen beralasan; snapshot lama tetap ada.
8. **Catat pembayaran:** sesudah transfer pribadi dilakukan sendiri, pemilik mencatat tujuan (modal/reimburse/laba), pihak, nominal, tanggal dan referensi. Modal/laba mensyaratkan bulan telah final; reimbursement biaya dapat dicatat terpisah. Koreksi transfer lewat catatan pengembalian; tidak menghapus sejarah.

## F. Owner Approval

**Sudah dilakukan dalam izin lokal:** audit, rencana, implementasi pada branch terpisah, migrasi fixture, pengujian dan laporan. Source produksi/main asli tetap.

**Belum diotorisasi/dilakukan pada tugas ini:** commit/push/merge rilis Finance, migrasi atau perubahan data/config produksi, aktivasi flag dan deployment.

Sebelum meminta rilis, pemilik perlu meninjau kebijakan WIB, FIFO/rounding, lingkup izin Adik, shared rata per unit/direct order rata, pengakuan Reserve setelah lunas, serta cara review biaya historis dan exceptional loss. Tidak ada import HPP otomatis dari perkiraan.

Sesudah review fitur, otorisasi push/merge dan otorisasi migrasi/aktivasi produksi harus jelas. Pada tahap migrasi, periksa ledger/checksum Turso terlebih dahulu dan terapkan hanya migrasi baru yang masih pending; jangan mengulang migrasi lama. Deployment Vercel memerlukan persetujuan terpisah beserta verifikasi setelah rilis. Jangan menggunakan transaksi produksi atau Telegram untuk pengujian.
