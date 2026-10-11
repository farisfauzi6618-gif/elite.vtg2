# Data pelanggan ELITE.VTG

Halaman pemilik: `/admin/customers`, melalui **Admin → Data pelanggan**. Halaman ini hanya mengelola data pelanggan. Pencatatan giveaway dilakukan di luar aplikasi.

## Data dan ekspor

Data yang terlihat: ID, nama, email atau nomor HP sesuai pilihan saat mendaftar, ulang tahun opsional, dan waktu pendaftaran. Cari melalui nama, email, atau nomor HP. Filter tanggal menggunakan hari kalender WIB, termasuk tanggal akhir.

Daftar mengambil 50 akun per halaman. **Unduh CSV** atau **Unduh arsip JSON** mencakup semua pelanggan sesuai filter dan tab yang dipilih, bukan hanya halaman yang terlihat. Reset filter pada tab **Pelanggan** sebelum mengarsipkan semua akun aktif. Untuk mengarsipkan akun yang dihapus, unduh juga dari tab **Sampah**; nama file diberi penanda sampah.

CSV memakai UTF-8 dan perlindungan sel yang berpotensi menjadi formula. JSON menyimpan nilai asli, versi format 2, jumlah akun dan penanda `complete`. Keduanya hanya memuat data pelanggan, tanpa kolom/catatan giveaway, kata sandi, hash kata sandi, token sesi, atau kredensial integrasi. Arsip ini bukan backup lengkap autentikasi/database toko. Simpan unduhan di tempat pribadi.

Database adalah penyimpanan utama. Logout dan kedaluwarsa sesi tidak menghapus akun. Ekspor menjadi salinan terpisah yang dapat diakses nanti. Tidak ada penggunaan Blob atau pengiriman otomatis ke layanan pemasaran.

## Hapus dan pulihkan

Klik **Hapus** pada pelanggan, periksa nama dan kontak pada panel konfirmasi, lalu pilih **Hapus ke Sampah**. Penghapusan dilakukan per akun dan dapat dibatalkan melalui **Sampah → Pulihkan → Pulihkan akun**.

Akun yang dihapus:
- tidak muncul pada daftar dan ekspor pelanggan aktif;
- tidak dapat login selama berada di Sampah;
- kehilangan seluruh sesi login aktif;
- tetap memiliki data asli dan referensi transaksi di database.

Pemulihan mengembalikan akun dengan ID, kontak, kata sandi, pesanan, serta riwayat diskon yang sama. Pelanggan harus login ulang; token lama tidak aktif kembali. Identitas tetap unik selama berada di Sampah, sehingga pendaftaran ulang tidak membuat akun duplikat atau mengulang hak diskon pertama.

Tidak tersedia penghapusan permanen, penghapusan massal, atau pembersihan Sampah otomatis. Ini adalah penghapusan yang dapat dipulihkan, bukan penghapusan seluruh data pribadi dari penyimpanan. Pesanan, pembayaran, stok, voucher, dan catatan giveaway lama tidak dihapus oleh tindakan ini. Catatan giveaway lama tetap disimpan di database untuk mencegah hilangnya data, tetapi tidak memiliki UI/API pencatatan dan tidak diekspor oleh fitur pelanggan.

## Keamanan dan efisiensi

Halaman, daftar, ekspor, Hapus, dan Pulihkan hanya menerima sesi pemilik yang sah. Akun pelanggan dan tim, termasuk tim berizin Analytics, tidak mendapat akses data pelanggan. Perubahan wajib berasal dari origin aplikasi yang sama dan memeriksa status yang dilihat admin untuk menolak perubahan basi dari tab lain.

Hapus/Pulihkan beserta pencabutan sesi berjalan dalam satu transaksi. Tidak ada penghapusan baris pelanggan atau transaksi bisnis. Migrasi `release_0007_customer_trash.sql` hanya menambah tabel Sampah dan index, tanpa mengubah data lama. Migrasi giveaway sebelumnya tidak diubah agar checksum tetap sah.

Daftar/ekspor menggunakan cache privat `no-store`. Data tidak disimpan di localStorage. SQL memakai binding; pagination menggunakan cursor; ekspor membaca 500 akun per batch. Tidak ada polling otomatis atau perubahan paket hosting.

Pengujian mencakup akses pemilik/pelanggan/tim, CSRF, pemisahan daftar/Sampah, Hapus/Pulihkan, sesi dan login, ID/riwayat transaksi tetap utuh, rollback, perubahan bersamaan, pencarian literal, tanggal WIB, pagination, ekspor 1.505 akun tanpa giveaway/kredensial, formula CSV, dan unduhan terputus.
