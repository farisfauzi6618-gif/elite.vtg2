# Source terbaru telah diselaraskan — 9 Oktober 2026

Source gabungan pada `untuk-vercel` mengikuti perubahan katalog dan pembayaran terbaru: kartu ringkas, pagination 40, size tag/fit, belanja ulang, BCA/QRIS dari environment, penolakan penggantian pembayaran via dashboard, fingerprint QRIS dan header keamanan. Detail implementasi serta validasi berada pada `docs/SYNC_RELEASE.md` di source.

Runtime tetap Next.js Node dengan Turso, Blob privat dan login mandiri pemilik. Login, origin, jalur admin dan pengiriman disesuaikan untuk satu aplikasi. Backup Sites memakai Cloudflare Worker/vinext, D1, R2 serta identitas Sites dan tidak langsung dijalankan di Vercel.

Paket terbaru ini menggantikan paket source Vercel sebelumnya sebagai acuan upload. Paket lama tetap merupakan arsip sebelum penyelarasan.

**Source siap disimpan di GitHub; domain baru belum siap menerima uang tanpa konfigurasi layanan, data toko dan uji deployment.** Produk, stok, pesanan, QRIS merchant, bukti, token, bot dan environment produksi tidak ikut GitHub.

Situs aktif tidak dideploy ulang atau diubah. Gunakan database/storage baru dan bot uji berbeda. Pengalihan link serta webhook produksi dilakukan terakhir setelah verifikasi data, pembayaran dan penanganan pesanan lama selesai.

Vercel Hobby gratis hanya untuk penggunaan pribadi nonkomersial; toko memerlukan paket yang mengizinkan penggunaan komersial. [Ketentuan resmi](https://vercel.com/docs/limits/fair-use-guidelines).
