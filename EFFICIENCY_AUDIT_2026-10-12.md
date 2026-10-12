# Audit efisiensi ELITE.VTG — 12 Oktober 2026

Tujuan: mengurangi pemakaian Vercel dengan mempertahankan tampilan, pembelian, pembayaran, stok, dan akses pemilik.

## Temuan dan perubahan

- Penyumbang biaya terbesar pada snapshot Usage adalah Fast Origin Transfer ($0,79). Foto asli sebelumnya dikirim juga ke kartu katalog, thumbnail galeri, dan keranjang.
- Pengukuran seluruh 24 foto utama produk tersedia: asli 15.855.968 byte, preview kartu 2.616.656 byte. Ukuran turun **83,5%**. Ini penghematan byte foto kartu yang diukur, bukan jaminan penurunan tagihan sebesar persentase yang sama.
- Tiga ukuran preview: thumbnail 240 px, kartu 800 px, detail 1.600 px pada sisi terpanjang. WebP kualitas 88, tidak memotong frame, tidak memperbesar gambar kecil, dan hanya digunakan jika lebih kecil dari asli.
- Zoom tetap menggunakan foto asli. Jika preview gagal, browser mencoba foto asli sekali. File asli, database, dan upload admin tidak diubah.
- Cache dalam proses dibatasi 16 MiB sumber + 32 MiB preview; maksimal dua pekerjaan bersamaan. Ini mengurangi pembacaan/transformasi berulang pada proses yang masih hangat, bukan cache global atau penghapusan seluruh pemakaian Blob.
- Otorisasi dan status publik foto tetap diperiksa sebelum mengirim cache maupun respons 304. Foto draft pemilik tetap privat dan tidak disimpan dalam cache bersama. QRIS, bukti pembayaran, akun pelanggan, dan stok tidak mendapat cache publik.
- Respons stok yang rusak/tidak lengkap ditangani dengan pesan pemulihan. Tidak ada retry otomatis checkout atau perubahan harga, diskon, loyalty, stok, login, dan pembayaran.
- Pemeriksaan stok 15 detik pada tab terlihat tetap dipertahankan. Optimasi Blob dan validasi respons 304 yang sudah ada tetap dipakai.

## Validasi

- Seluruh 24 produk tersedia diuji dalam 25 skenario transaksi pada database sementara: katalog, detail, keranjang, harga server, ongkir simulasi, QRIS/BCA, bukti, invoice, dan kembali belanja. Tidak membuat pesanan nyata atau mengirim notifikasi nyata.
- 308 pengujian fungsional berbeda berhasil pada rangkaian pengujian akhir dan pengujian ulang terarah. Dua fixture Windows sempat gagal membersihkan file dengan EBUSY; pengujian ulang berhasil. Bundler test untuk route foto disesuaikan dengan native external Sharp pada production; 54 pengujian ulang berhasil seluruhnya.
- TypeScript dan build production Next.js berhasil.
- Pengujian preview meliputi ukuran/byte, orientasi EXIF, frame utuh, sumber rusak, fallback browser, deduplikasi, batas cache, batas concurrency, pemulihan sumber, perubahan status produk, akses draft, ETag, dan URL zoom asli.
- Browser desktop dan lebar HP 390 px: foto kartu/detail/zoom terbuka, keranjang dan pencarian bekerja, tidak ada console error/warning pada sesi lokal. Fixture browser memakai 24 produk dan foto utama; galeri lain diuji dengan pengujian unit, bukan mengunduh semua 186 foto produksi.

## Snapshot akun dan peringatan

- Akun terlihat **Pro** sebelum perubahan ini; paket tidak diubah oleh audit.
- Siklus Usage yang terlihat: 11 Oktober–11 November 2026. Biaya infrastruktur saat dibaca $1,38, seluruhnya tertutup kredit; on-demand $0. Angka dapat terlambat diperbarui dan berubah setelah audit.
- Observability 12 jam yang dilihat (11 Oktober 22.31–12 Oktober 10.31 WIB): function error 0%, timeout 0%. Ini tidak membuktikan seluruh kemungkinan kegagalan browser/provider telah hilang.
- Budget peringatan on-demand diubah dari $200 menjadi **$5 per siklus bulanan**, sesuai pilihan pemilik. Pause produksi tetap Off dan webhook tetap Off. Ini peringatan, bukan batas keras biaya, dan tidak mencakup semua lisensi/add-on/integrasi.
- Tidak mengaktifkan add-on analytics berbayar, mengubah mode billing CDN, membeli domain, atau menambah resource persistent.

## Fitur Pro yang relevan

| Fitur | Penggunaan untuk ELITE.VTG |
| --- | --- |
| Spend Management | Peringatan dini biaya tambahan; sudah diatur $5 tanpa menghentikan transaksi. |
| Observability dan runtime logs | Memeriksa endpoint lambat, error, timeout, dan sumber lonjakan. Retensi/fitur tambahan dapat berbiaya. |
| Preview deployment dan Instant Rollback | Memeriksa perubahan sebelum rilis dan kembali ke deployment sebelumnya. Transaksi uji harus memakai database terpisah. |
| CDN dan image delivery | Mengurangi byte gambar dan pekerjaan origin. Flat Rate CDN tersedia pada Pro; pengaturan akun saat audit menampilkan Disable Flat Rate CDN tercentang, sehingga mode billing tidak dialihkan otomatis. |
| Domain tahun pertama | Tim Pro berbayar yang memenuhi syarat dapat mengklaim satu domain pada TLD yang memenuhi syarat, misalnya .store/.app. Ketersediaan nama harus dicek; perpanjangan tahun berikutnya berbayar. |
| Viewer gratis | Akses dashboard hanya baca untuk kolaborator tanpa memberi izin deployment. Tidak ada anggota baru ditambahkan. |

Pro memiliki biaya dasar $20/bulan dengan kredit infrastruktur $20/bulan; pemakaian setelah kredit dapat ditagihkan. Pro bukan paket tanpa batas. Add-on Speed Insights Plus/Web Analytics Plus tidak diperlukan untuk perubahan ini.

Referensi resmi yang diperiksa 12 Oktober 2026:

- [Vercel Pro](https://vercel.com/docs/plans/pro-plan)
- [Spend Management](https://vercel.com/docs/spend-management)
- [Instant Rollback](https://vercel.com/docs/deployments/rollback-production-deployment)
- [Pengelolaan biaya gambar](https://vercel.com/docs/image-optimization/managing-image-optimization-costs)
- [Blob usage dan pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)

Hasil JSON, log, data pengukuran, dan screenshot audit disimpan lokal di migration-private; tidak dimasukkan ke deployment atau GitHub.
