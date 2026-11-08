# Operasi ELITE.VTG dari laptop pengganti

Website produksi berjalan di Vercel, database di Turso, dan berkas privat di Vercel Blob. Menutup laptop tidak menghentikan toko atau jadwal Featured Vercel. Otomasi audit di aplikasi Codex bergantung pada ketersediaan aplikasi/laptop dan berbeda dari jadwal Featured server.

## Pemeriksaan rutin

- Buka `https://elitevtg.com/admin/sales`, tab Auto Push. Periksa status aktif, keberhasilan terakhir, dan jadwal berikutnya. Status ini membaca ledger; pratinjau kandidat adalah perhitungan terpisah. Tidak adanya error bukan bukti seluruh layanan sehat.
- Jadwal Featured: Senin 09.00 WIB (02.00 UTC). Waktu Sydney berubah mengikuti daylight saving. Periksa hasil setelah jadwal; jangan menjalankan ulang hanya karena halaman pratinjau lambat.
- Untuk gangguan, periksa domain produksi, deployment aktif dan commit di Vercel, lalu log request yang gagal. Bedakan kegagalan Vercel, database, media, dan provider eksternal. Jangan membuat transaksi produksi untuk pengujian.
- Periksa metrik Vercel/Turso dengan rentang waktu dan trafik sebanding sebelum menyatakan penghematan. Polling katalog pengunjung dikurangi menjadi 60 detik; detail/keranjang tetap 15 detik dan harga/stok tetap diverifikasi server.

## Rilis dan pemulihan

1. Pertahankan perubahan lokal. Ambil perubahan remote dan periksa commit/branch sebelum bekerja. Branch utama harus memuat source produksi yang sudah diuji.
2. Gunakan Node sesuai `engines`, pnpm sesuai `packageManager`, lalu `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck`, dan build dengan konfigurasi fixture lokal. Jangan menyalin credential produksi ke fixture.
3. Rilis hanya commit yang lolos validasi ke project `elite-vtg2`, team `elitevtg`. Periksa build, status READY, domain dan SHA deployment; push GitHub saja belum membuktikan domain sudah memakai rilis baru.
4. Rilis audit November ini tidak memerlukan migrasi. Bila rilis berikutnya memiliki migrasi, periksa ledger/checksum dengan runner resmi; jangan mengubah atau mengulang migrasi lama secara manual.
5. Untuk insiden, pilih perbaikan maju bila schema atau tujuan pembayaran berubah. Rollback kode harus diperiksa kompatibilitasnya dengan data dan konfigurasi aktif. Jangan mematikan flag pembacaan tujuan pembayaran baru; baca `ADMIN_HANDOVER.md`.

## Akses dan pemulihan akun

Akun admin website tidak otomatis memberi akses GitHub, Vercel, Turso, domain, atau billing. Delegasi infrastruktur memerlukan akun terpisah serta role yang sesuai pada setiap penyedia; jangan berbagi password/token. Simpan metode pemulihan/2FA secara pribadi di luar laptop tunggal. Cadangan dan uji restore database harus diverifikasi secara khusus sebelum dinyatakan siap; keberhasilan build tidak memverifikasinya.

## Kualitas data dan batas validasi

Brand dinormalisasi hanya untuk tampilan/filter; riwayat produk/pesanan tidak ditulis ulang dan nama mirip tidak digabung otomatis. Material yang belum diketahui ditampilkan sebagai “Belum diverifikasi”; lengkapi berdasarkan label/foto asli. Rekomendasi sold hanya memilih barang tersedia dalam kategori sama dan tetap membutuhkan pemeriksaan ukuran/kondisi pembeli.

Lint lama pada checkout/katalog/detail/sales masih memerlukan pekerjaan tersendiri. Hasil fixture, desktop dan viewport HP tidak menggantikan pengujian perangkat fisik, pemulihan backup, atau pengukuran Core Web Vitals dari pengguna nyata.
