# Fastreng — Fast Cireng Delivery Order

Aplikasi web (PWA) untuk pesan cireng. Pembeli memilih menu, memasukkan ke keranjang, lalu
daftar belanja yang rapi beserta total harga langsung terkirim ke WhatsApp penjual.

## Fitur
- **Tap foto menu = +1 porsi** (tap 2x = 2 porsi, dst.), lengkap dengan animasi & badge jumlah.
- Tombol **+ / −** manual di kartu menu, halaman detail, dan keranjang.
- Kategori (Gurih, Pedas, Manis, Paket), pencarian, dan menu favorit ❤️.
- Keranjang dengan data pemesan, pilihan **Diantar / Ambil Sendiri**, metode pembayaran,
  kode promo, ongkir otomatis (gratis ongkir di atas minimal belanja), dan minimal order.
- **Pesan via WhatsApp**: pesan otomatis berisi no. order, data pemesan, alamat (+ link Google Maps
  jika lokasi dibagikan), daftar item, subtotal, ongkir, diskon, dan **TOTAL BAYAR**.
- Riwayat pesanan + tombol "Pesan Lagi", status toko Buka/Tutup, keranjang & data tersimpan otomatis.
- Bisa di-install ke HP (PWA) dan tetap bisa dibuka offline.

## Mengatur toko
Semua pengaturan ada di **`config.js`**:
- `store.whatsapp` — **ganti dengan nomor WA penjual** (format `628xxxxxxxxxx`, tanpa `+`/`0`).
- `menu` — nama, harga, isi, foto, deskripsi, kategori.
- `delivery` — ongkir, batas gratis ongkir, minimal belanja, estimasi.
- `promos`, `payments`, jam buka, alamat toko.

Foto menu ada di `assets/menu/`. Kalau mengubah daftar file, perbarui juga daftar `ASSETS` dan
naikkan `VERSION` di `sw.js`.

## Menjalankan
Tidak perlu build. Jalankan server statis apa saja dari folder ini, misalnya:

```bash
python3 -m http.server 8080
# buka http://localhost:8080
```

Untuk online, upload folder ini ke hosting statis (Vercel, Netlify, GitHub Pages, dsb.).
