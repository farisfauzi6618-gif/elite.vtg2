# ELITE.VTG — source terbaru untuk GitHub dan Vercel

Paket tanggal 9 Oktober 2026 ini memuat source gabungan yang telah diselaraskan dengan perubahan katalog dan pembayaran terbaru pada situs aktif. Catatan implementasi serta pengujian ada di `untuk-vercel/docs/SYNC_RELEASE.md`.

Upload source ke repository GitHub baru tidak mengubah situs yang sedang dipakai pelanggan. Paket tidak memindahkan database, foto, pesanan, QRIS merchant, bukti, token, konfigurasi hosting atau webhook produksi.

## Pilih folder

Upload **isi folder `untuk-vercel`** ke satu repo GitHub, misalnya `elite-vtg`. Setelah diekstrak, `package.json`, `pnpm-lock.yaml`, `vercel.json`, `app/` dan `modules/` harus berada di root repo. Jangan upload ZIP saja atau seluruh folder induk paket.

Folder `backup-situs-aktif` menyimpan source katalog/order Sites yang menjadi acuan penyelarasan. Gunakan repo lain, misalnya `elite-vtg-live-backup`, bila ingin menyimpannya juga. Backup Sites tidak langsung berjalan di Vercel; source gabungan Next.js pada `untuk-vercel` adalah target Vercel. Source ongkir Sites yang terpisah belum termasuk backup ini, sedangkan modul ongkir gabungan tetap ada di source Vercel.

## GitHub Desktop

1. Login [GitHub](https://github.com/) dan install [GitHub Desktop](https://desktop.github.com/).
2. **File → Add local repository → Choose**. Pilih `C:\Users\faris\Downloads\ELITE-VTG-GitHub-Terbaru-2026-10-09\untuk-vercel`. Salinan pada komputer ini memiliki Git lokal kosong, tanpa remote atau commit.
3. Bila memakai ZIP di lokasi lain, buka PowerShell pada folder yang berisi `package.json`, jalankan `git init -b main`, lalu tambahkan folder itu ke Desktop.
4. Periksa **Changes**. `.env.local`, `.data`, `.next`, `node_modules`, database, foto unggahan dan token tidak boleh masuk; `.env.example` boleh.
5. Isi Summary `Add latest ELITE.VTG source`, lalu **Commit to main**.
6. **Publish repository**, nama `elite-vtg`, tetap centang **Keep this code private**, publish ke akunmu.
7. **Repository → View on GitHub**, periksa bahwa `package.json` dan `vercel.json` terlihat langsung pada halaman utama.

Dokumentasi resmi: [repository lokal](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop), [publish repository](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-an-existing-project-to-github-using-github-desktop).

## Alternatif PowerShell

Buat repo GitHub **Private** kosong `elite-vtg`, tanpa README/license/gitignore tambahan. Gunakan URL repo akunmu:

```powershell
Set-Location -LiteralPath 'C:\Users\faris\Downloads\ELITE-VTG-GitHub-Terbaru-2026-10-09\untuk-vercel'
# Jika belum ada Git lokal, misalnya sesudah ekstrak ZIP:
git init -b main
git add .
git status --short
git commit -m "Add latest ELITE.VTG source"
git remote add origin https://github.com/USERNAME_KAMU/elite-vtg.git
git push -u origin main
```

Ganti username dan nama repo sesuai milikmu. Periksa daftar file sebelum commit. Ikuti login browser/Git credential manager; jangan menaruh password/token dalam URL atau source. [Panduan GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github).

## Vercel setelah akun layanan tujuan siap

**Vercel Hobby gratis tidak mengizinkan penggunaan komersial.** Toko ELITE.VTG perlu paket yang mengizinkan penggunaan komersial, misalnya Pro; database/storage memiliki ketentuan penggunaan masing-masing. Jika tetap tanpa biaya tambahan, simpan source di GitHub dan gunakan hosting yang aktif sekarang. [Ketentuan resmi Vercel](https://vercel.com/docs/limits/fair-use-guidelines).

1. Siapkan database Turso baru. Isi URL remote dan auth token, bukan database file lokal.
2. Vercel **Add New → Project → Import Git Repository**, hubungkan GitHub dan pilih `elite-vtg`.
3. **Framework: Next.js**, **Root Directory: `./`** jika package berada pada root, **Node.js: 24.x**, install `pnpm install --frozen-lockfile`, build `pnpm build`, Output Directory default Next.js. [Panduan import Vercel](https://vercel.com/docs/git).
4. Hubungkan **Blob store Private** baru. Masukkan token storage serta database di Environment Variables. Gunakan layanan dan bot uji terpisah dari situs aktif.
5. Install dependensi lokal dengan pnpm 11.25.0. Buat `.env.local`, generate hash password dan rahasia dengan `pnpm admin:password` serta `pnpm secrets:generate`. Salin ke Environment Variables, jangan GitHub. Daftar lengkap ada di `.env.example` dan `docs/DEPLOY-VERCEL.md`.
6. Jalankan `pnpm db:migrate` serta `pnpm db:check` pada database baru. Ini menyiapkan tabel, tidak mengimpor stok/foto/order lama. Build tidak menjalankan migrasi otomatis.
7. Isi `PAYMENT_BCA_ACCOUNT_NUMBER` dan `PAYMENT_BCA_ACCOUNT_HOLDER` sesuai rekening pemilik yang disepakati. Pasang QRIS asli menggunakan `pnpm payment:qris -- "C:\path\QRIS-ELITE-VTG.jpg" "ELITE.VTG" --upload` setelah token **storage baru** disiapkan. Salin nilai `PAYMENT_QRIS_*` hasilnya ke environment tujuan. Panduan lengkap ada di `docs/PAYMENT_CONFIGURATION.md`.
8. Deploy/redeploy. Tetapkan `SITE_ORIGIN` ke alamat Vercel baru yang sebenarnya lalu redeploy jika nilainya berubah. Login `/admin/login`. Dashboard pembayaran hanya baca tujuan pembayaran; jangan mencoba mengganti QRIS di dashboard.
9. Pasangkan bot Telegram baru untuk uji dan konfigurasi provider ongkir. Jangan memindahkan bot yang menangani pesanan aktif di situs lama.
10. Periksa alur di HP: katalog → detail size → keranjang → checkout → alamat/ongkir → BCA/QRIS → bukti → invoice → belanja lagi. Cocokkan data/stock, penerima pembayaran, callback pemilik, hak tim/admin, retry, dan provider tujuan.
11. Migrasi produk, stok, foto, order dan file pembayaran lama dilakukan secara terpisah di luar GitHub. Login/cookie tidak otomatis pindah domain. Setelah data dan UAT selesai, barulah alihkan link pembeli dan webhook produksi dengan rencana penanganan pesanan lama.

Setelah repo terhubung, push dapat memicu deployment project Vercel itu. Situs lama tidak otomatis ikut berubah, tetapi memakai database atau webhook produksi yang sama saat uji bisa berdampak ke pesanan aktif. [Integrasi GitHub Vercel](https://vercel.com/docs/git/vercel-for-github).

## Link yang tetap digunakan hari ini

- https://elite-vtg-katalog.farisfzi.chatgpt.site/
- https://elite-vtg-order.farisfzi.chatgpt.site/
- https://elite-vtg-ongkir.farisfzi.chatgpt.site/

Pekerjaan ini menyelaraskan source dan memperbarui paket upload. Tidak membuat/publish repo GitHub, deploy Vercel, mengubah DNS, mengganti QRIS/rekening pada situs aktif, memindahkan data produksi atau bot Telegram.
