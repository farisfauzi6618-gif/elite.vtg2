# Serah terima pengelola dan perubahan pembayaran

Fitur ini menambah satu akun pengelola operasional dengan email dan kata sandi sendiri. Akun utama berbasis konfigurasi server tetap dipertahankan. Tidak menambah paket atau penyedia autentikasi.

## Halaman dan batas akses

- `/admin/akses`: khusus pemilik utama; kata sandi utama harus diverifikasi ulang pada setiap penerbitan tautan atau pencabutan akun.
- `/undangan-admin#token=…`: undangan 15 menit, satu kali aktivasi, terikat nama/email penerima. Penerima membuat kata sandi 12–128 karakter lalu login melalui `/admin/login`. Tautan merupakan bukti undangan; aplikasi tidak mengirim email dan tidak melakukan verifikasi kepemilikan inbox terpisah. Bagikan secara pribadi kepada penerima yang benar.
- `/admin/pembayaran-sekali#token=…`: memerlukan sesi pemilik utama dan token 15 menit. Token digunakan hanya setelah satu penyimpanan rekening BCA dan QRIS berhasil. Penerbitan tautan baru membatalkan tautan lama dengan tujuan sama. Bukan tautan login umum.
- `/admin/order?tab=settings#telegram`: membuka pengaturan bot yang sudah tersedia. Penggantian token dan pemasangan penerima dilakukan pemilik/pengelola melalui formulir tersebut. Tidak ada pengiriman pesan uji otomatis dari fitur baru.

Pengelola tambahan memiliki akses katalog/stok, pesanan normal dan Reserve, pemeriksaan/konfirmasi pembayaran, pelanggan/loyalty, Sales Intelligence, Analytics, kurir, kalkulator ongkir, dan bot Telegram. Identitas aktor tetap terpisah dari pemilik utama. Penerbitan undangan pengelola lain, pencabutan akun penuh, serta perubahan rekening/QRIS tetap khusus pemilik utama. Fitur ini tidak memberi akses GitHub, Vercel, Turso, atau akun penyedia lain.

Tautan tidak menyertakan kata sandi. Verifier token hanya disimpan sebagai SHA-256, payload undangan ditandatangani server, dan token dikirim dalam fragment URL sebelum formulir mengirimnya ke API. Tidak disimpan di localStorage, tidak dimasukkan ke query URL, dan tidak dicatat ke log. Fragment dibersihkan setelah formulir dimuat; untuk memuat ulang formulir, buka kembali tautan aslinya.

Aktivasi akun, pemakaian token, audit, dan pencabutan sesi memakai transaksi. Pengelola yang dicabut tidak dapat memakai sesi lama. Perubahan kredensial utama juga membatalkan tanda tangan akun pengelola dan undangan yang lama; cabut lalu undang ulang akun tambahan jika kredensial utama dirotasi. Akun pengelola yang masih aktif harus dicabut sebelum mengganti penerima.

## Tujuan pembayaran

Konfigurasi environment lama tetap menjadi sumber awal jika belum ada tujuan baru yang disimpan. Formulir khusus menulis satu penggantian lengkap berupa rekening BCA, nama pemilik, gambar QRIS asli dan nama merchant. Payload ditandatangani dengan `CONFIG_SECRET`, sedangkan hash gambar tetap diverifikasi pada `/api/qris`. Panel pengaturan biasa serta endpoint QRIS lama tetap tidak mengizinkan perubahan tujuan pembayaran.

Gambar QRIS baru memakai key baru. Aset lama tidak ditimpa/dihapus. Jika upload berhasil tetapi transaksi gagal/dikalahkan permintaan bersamaan, aset upload dapat tersisa tanpa menjadi tujuan aktif. Tidak ada pembersihan data otomatis. Penyimpanan tidak membuktikan merchant di QRIS cocok dengan nama yang diketik; pemilik wajib memeriksa gambar dan penerima sebelum mengonfirmasi.

**Tujuan aktif berlaku juga pada halaman pembayaran pesanan yang masih terbuka.** Harga, invoice, stok, pembayaran terkonfirmasi, Reserve/DP, voucher, loyalty, maupun transaksi lama tidak ditulis ulang. Pemilik harus memeriksa transfer ke rekening lama dan baru selama peralihan. Tidak ada transaksi pembayaran yang dilakukan aplikasi saat mengganti tujuan.

Tanda tangan yang tidak valid gagal tertutup; aplikasi tidak diam-diam mengganti tujuan aktif dengan konfigurasi lama. Rotasi `CONFIG_SECRET` memerlukan penandatanganan ulang tujuan melalui proses pemulihan terverifikasi, selain memperhatikan konfigurasi terenkripsi lain yang sudah menggunakan secret tersebut.

## Aktivasi produksi — memerlukan persetujuan terpisah

1. Verifikasi team/project/commit deployment serta perubahan kode yang akan diterapkan. Tidak ada deploy atau push otomatis oleh dokumen ini.
2. Periksa ledger `elite_migrations` dan checksum seluruh migrasi yang sudah diterapkan dengan runner `scripts/migration-core.mjs`. Hentikan jika ada ketidakcocokan; jangan mengubah file lama, menghapus ledger, atau menjalankan ulang SQL migrasi lama secara manual.
3. Migrasi tambahan hanya `release_0026_admin_handover.sql` (lima tabel baru dan satu indeks). Tidak mengubah/menghapus isi tabel bisnis yang sudah ada. Setelah ledger cocok, gunakan runner migrasi resmi dengan akses produksi yang sudah disetujui, lalu pastikan tidak ada migrasi tertunda.
4. Deploy kode yang telah ditinjau. Default kedua flag berikut adalah `0`; sebelum diaktifkan, perilaku login utama dan tujuan pembayaran tetap memakai jalur lama.
5. Aktifkan `ADMIN_HANDOVER_ENABLED=1` dan `PAYMENT_DESTINATION_OVERRIDE_ENABLED=1` pada environment produksi yang benar, lalu terapkan melalui deployment baru sesuai proses Vercel. Preview Vercel menolak penerbitan/aktivasi undangan serta login akun tambahan.
6. Pemilik masuk ke `/admin/akses`, memeriksa identitas penerima, mengetik kata sandinya sendiri, lalu membuat undangan. Tautan disalin oleh pemilik dan dibagikan secara pribadi; tidak ada email/pesan yang dikirim otomatis.
7. Buat akses pembayaran ketika gambar QRIS asli, rekening, serta nama merchant sudah siap. Pemilik memasukkan data langsung pada formulir, memeriksa, lalu menyimpan sendiri. Token bot baru juga dimasukkan langsung melalui pengaturan Telegram.

`ADMIN_HANDOVER_ENABLED=0` menghentikan akses pengelola/undangan serta perubahan pembayaran baru. **Biarkan `PAYMENT_DESTINATION_OVERRIDE_ENABLED=1` setelah tujuan baru disimpan** agar checkout terus menggunakan tujuan yang aktif. Mematikan flag pembacaan tujuan atau mengembalikan kode lama akan menggunakan konfigurasi pembayaran environment lama; jangan lakukan rollback itu tanpa menyelaraskan tujuan pembayaran secara terverifikasi. Pemulihan paling aman menggunakan perbaikan maju, dengan akun utama tetap tersedia.

Jangan menyalin secret produksi ke pengujian. Tidak ada akun/order/pembayaran/pesan Telegram produksi yang dibuat untuk validasi ini. Keberhasilan pengujian lokal tidak menyatakan akun undangan produksi sudah aktif atau migrasi produksi sudah diterapkan.
