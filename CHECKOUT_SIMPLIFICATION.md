# Checkout simplification

- Beli sekarang pada tiap ukuran yang tersedia memakai endpoint checkout existing, satu unit dari ukuran yang dipilih, reward auto, validasi harga/stok/jadwal server existing. Tidak membuat invoice sampai form penerima disubmit.
- Keranjang tetap tersedia. Pembelian langsung tidak memasukkan keranjang lama dan handoff return tidak mengurangi keranjang lama, termasuk jika produk dan ukuran sama. Keranjang biasa mempertahankan cleanup existing.
- Error checkout langsung ditampilkan di detail dan tidak menghapus barang. Permintaan checkout simultan digabung dengan guard; tombol pembelian dinonaktifkan saat proses berlangsung.
- Checkout katalog tidak lagi menampilkan harga readonly bergaya input. Subtotal, diskon, ongkir, dan total tetap terlihat. Form manual masih memiliki input harga agreement.
- Ringkasan mobile duplikat disembunyikan; ringkasan utama dekat CTA tetap ada. Desktop tetap memiliki ringkasan samping. Side-note penggunaan data dihapus; consent existing tetap wajib.
- Reward Locked/future milestones tidak tampil di cart/checkout. Reward aktif, opsi voucher, syarat kelayakan, program loyalty dan halaman akun tetap tersedia.
- Cek ulang ongkir tampil saat error/expired; perhitungan, expiry, service selector, tarif dan semua validasi existing tidak berubah.
- Tidak mengubah API harga, pelanggan/auth, voucher, loyalty, pembayaran, QRIS/BCA, bukti, tracking, stok, maupun schema. Tidak ada migrasi atau paket layanan baru.
