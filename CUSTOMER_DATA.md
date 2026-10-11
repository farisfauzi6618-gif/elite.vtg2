# Data pelanggan dan pencatatan giveaway ELITE.VTG

Halaman pemilik: `/admin/customers`, melalui **Admin → Data pelanggan**. Akun pelanggan tetap berada di database Turso saat pengguna logout atau sesi login 30 harinya berakhir. Pembaruan aplikasi tidak menghapus akun yang sudah ada.

## Data dan cara penggunaan

- Data akun: ID, nama, email atau nomor HP sesuai pilihan saat mendaftar, ulang tahun opsional, dan waktu pendaftaran.
- Data giveaway: kode giveaway, username Instagram, waktu verifikasi komentar, waktu pembaruan, dan versi catatan. Aktor pembaruan disimpan di database untuk pertanggungjawaban admin.
- Pilih kode unik untuk setiap promo, misalnya `giveaway-oktober-2026`; klik **Terapkan**. Catatan giveaway lain tetap tersimpan.
- Klik **Catat Instagram** pada pelanggan, isi username, dan tandai komentar terverifikasi setelah memeriksanya di Instagram. Website tidak mengambil komentar Instagram secara otomatis.
- Satu username tidak dapat dicatat untuk dua akun dalam giveaway yang sama. Pemilik tetap perlu memeriksa keaslian akun dan syarat promonya sendiri. Pencatatan tidak memilih pemenang secara otomatis.
- Filter rentang pendaftaran memakai hari kalender WIB, termasuk tanggal akhir. Pencarian mendukung nama, kontak, dan username Instagram dengan atau tanpa `@`.
- Filter **Terverifikasi** menghasilkan daftar akun yang komentarnya sudah diperiksa untuk giveaway terpilih.

## Arsip dan ekspor

**Unduh CSV** mengekspor seluruh pelanggan sesuai filter beserta catatan giveaway yang dipilih, bukan hanya 50 akun yang terlihat. Dibuka di Excel/Google Sheets. Sel yang berpotensi dianggap formula diberi awalan tab agar dibaca sebagai teks; nomor HP tetap berbentuk teks. CSV ditujukan untuk pemeriksaan manusia. [Rujukan OWASP](https://community.owasp.org/attacks/CSV_Injection).

**Unduh arsip JSON** menyimpan nilai asli data akun dan seluruh catatan giveaway milik pelanggan dalam hasil filter. Arsip menyertakan jumlah akun dan penanda `complete`. Reset filter sebelum mengunduh arsip semua pelanggan. Simpan file di tempat pribadi, misalnya folder arsip pemilik. Arsip ini tidak memuat kata sandi, hash kata sandi, token login, atau kredensial integrasi; bukan backup lengkap untuk mengembalikan autentikasi/database toko.

Database adalah penyimpanan utama; ekspor menjadi salinan terpisah yang dapat diakses nanti. Lakukan ekspor sebelum dan setelah periode promo untuk menyimpan catatan periode tersebut. Tidak ada pengiriman otomatis ke GitHub atau layanan pemasaran, dan tidak ada penggunaan Blob untuk data pelanggan ini.

[Turso mendokumentasikan PITR](https://docs.turso.tech/features/point-in-time-recovery) dengan jendela pemulihan 24 jam pada paket Free. Jendela pemulihan tersebut berbeda dari masa penyimpanan akun: akun normal tidak otomatis dihapus setelah 24 jam. Ekspor memberi salinan data pelanggan di luar jendela pemulihan layanan.

## Keamanan dan kapasitas

Halaman, daftar, unduhan, dan perubahan catatan hanya menerima sesi pemilik yang sah. Akun pelanggan dan tim, termasuk tim yang mendapat izin Analytics, tidak mendapat akses data pelanggan. Perubahan memerlukan origin aplikasi yang sama. Daftar/unduhan menggunakan `private, no-store`; tidak menyimpan data pelanggan di localStorage atau cache publik. Parameter query dibatasi dan SQL memakai binding.

Daftar mengambil 50 akun dengan cursor dan index waktu/ID. Unduhan membaca 500 akun per batch melalui stream, dengan pengecekan jumlah hasil dan kegagalan jika stream terputus. Halaman tidak melakukan polling otomatis. Login/pendaftaran, batas percobaan autentikasi, stok, checkout, pembayaran, analytics, dan paket hosting tetap memakai aturan sebelumnya. Kapasitas akhir tetap mengikuti kuota Turso dan Vercel; fitur ini tidak menjamin trafik tak terbatas.

Migrasi `release_0006_customer_directory.sql` hanya menambah index dan tabel catatan giveaway. Tidak menghapus atau mengubah baris pelanggan, produk, pesanan, atau konfigurasi pembayaran yang sudah ada. Riwayat giveaway dipisahkan berdasarkan kode; edit pada kode yang sama memperbarui catatan terkini dengan kontrol versi agar dua tab tidak saling menimpa.

Pengujian meliputi akses pemilik/pelanggan/tim, CSRF, logout/sesi kedaluwarsa, migrasi data lama, pencarian literal, tanggal WIB, pagination dengan waktu sama dan pendaftaran baru, username duplikat, edit bersamaan, ekspor 1.505 akun, seluruh riwayat giveaway di JSON, formula CSV, dan unduhan terputus.
