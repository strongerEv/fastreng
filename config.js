/*
 * ============================================================
 *  KONFIGURASI TOKO FAST CIRENG
 *  Ubah file ini saja untuk mengganti nomor WA, menu, harga,
 *  ongkir, jam buka, dan promo. Tidak perlu menyentuh app.js.
 * ============================================================
 */
window.FASTRENG_CONFIG = {
  store: {
    name: "Fast Cireng",
    tagline: "Cireng crispy, diantar kilat!",
    // Nomor WhatsApp penjual, format internasional TANPA "+" / spasi / "0" depan.
    // Contoh: 0812-3456-7890  ->  "6281234567890"
    whatsapp: "6281234567890",
    address: "Jl. Cireng Renyah No. 8, Bandung",
    city: "Bandung",
    // Jam buka (format 24 jam). Pesanan tetap bisa dikirim saat tutup,
    // tapi pembeli diberi tahu pesanan akan diproses saat toko buka.
    openHour: 9,
    closeHour: 21,
    instagram: "fastcireng",
  },

  // PIN untuk membuka Dashboard Penjual (admin.html). GANTI sebelum dipakai.
  // Catatan: ini hanya kunci sederhana di perangkat, bukan pengaman server.
  admin: { pin: "1234" },

  delivery: {
    fee: 8000, // ongkir flat
    freeShippingMin: 75000, // gratis ongkir mulai subtotal ini (0 = nonaktif)
    minOrder: 15000, // minimal belanja
    estimate: "20-30 menit",
  },

  // Kode promo yang bisa dipakai pembeli di halaman keranjang.
  // type: "percent" (persen, dengan batas max) atau "flat" (potongan rupiah)
  promos: [
    { code: "FASTRENG10", type: "percent", value: 10, max: 10000, minSpend: 40000, label: "Diskon 10% (maks Rp10.000)" },
    { code: "CIRENGHEMAT", type: "flat", value: 5000, minSpend: 50000, label: "Potongan Rp5.000" },
  ],

  payments: [
    { id: "cod", label: "Bayar di Tempat (COD)", icon: "💵" },
    { id: "transfer", label: "Transfer Bank", icon: "🏦", info: "BCA 1234567890 a.n. Fast Cireng" },
    { id: "qris", label: "QRIS / E-Wallet", icon: "📱", info: "QRIS dikirim penjual via WhatsApp" },
  ],

  categories: [
    { id: "all", label: "Semua", emoji: "🍽️" },
    { id: "gurih", label: "Gurih", emoji: "🧄" },
    { id: "pedas", label: "Pedas", emoji: "🌶️" },
    { id: "manis", label: "Manis", emoji: "🍫" },
    { id: "paket", label: "Paket", emoji: "🎁" },
  ],

  menu: [
    {
      id: "original-rujak",
      name: "Cireng Original Bumbu Rujak",
      category: ["gurih", "pedas"],
      price: 15000,
      unit: "isi 9 pcs",
      image: "assets/menu/original-rujak.jpg",
      desc: "Cireng klasik khas Bandung, luar renyah dalam kenyal, dicocol bumbu rujak gula merah pedas manis dengan taburan kacang.",
      rating: 4.9,
      sold: 1200,
      badge: "Best Seller",
    },
    {
      id: "sambal-matah",
      name: "Cireng Sambal Matah",
      category: ["pedas", "gurih"],
      price: 20000,
      unit: "isi 6 pcs",
      image: "assets/menu/sambal-matah.jpg",
      desc: "Cireng crispy diberi topping sambal matah segar: bawang merah, serai, cabai rawit, dan perasan jeruk nipis.",
      rating: 4.8,
      sold: 860,
      badge: "Pedas",
    },
    {
      id: "daun-jeruk",
      name: "Cireng Pedas Daun Jeruk",
      category: ["pedas"],
      price: 20000,
      unit: "isi 6 pcs",
      image: "assets/menu/daun-jeruk.jpg",
      desc: "Topping irisan cabai, bawang, dan daun jeruk yang wangi. Segar, pedas, dan bikin nagih.",
      rating: 4.7,
      sold: 540,
    },
    {
      id: "daging-suwir",
      name: "Cireng Daging Suwir Serundeng",
      category: ["gurih"],
      price: 25000,
      unit: "isi 6 pcs",
      image: "assets/menu/daging-suwir.jpg",
      desc: "Cireng isi dengan topping daging sapi suwir bumbu manis gurih, serundeng kelapa, dan daun seledri.",
      rating: 4.9,
      sold: 720,
      badge: "Favorit",
    },
    {
      id: "mint-almond",
      name: "Cireng Kemangi Almond",
      category: ["gurih"],
      price: 23000,
      unit: "isi 6 pcs",
      image: "assets/menu/mint-almond.jpg",
      desc: "Cireng premium dengan saus keju lembut, almond panggang, daun kemangi, dan sambal madu. Disajikan dengan kacang sangrai & jeruk limau.",
      rating: 4.8,
      sold: 410,
      badge: "Baru",
    },
    {
      id: "sweet-mix",
      name: "Cireng Sweet Mix",
      category: ["manis"],
      price: 25000,
      unit: "isi 6 pcs",
      image: "assets/menu/sweet-mix.jpg",
      desc: "Cireng manis aneka topping: pisang brulee, krim pandan, karamel almond, selai stroberi, dan cokelat. Plus mangga & crumble.",
      rating: 4.8,
      sold: 630,
    },
    {
      id: "platter-dessert",
      name: "Paket Cireng Party Platter",
      category: ["manis", "paket"],
      price: 35000,
      unit: "isi 8 pcs",
      image: "assets/menu/platter-dessert.jpg",
      desc: "Paket lengkap 8 rasa: pisang brulee, pandan, ubi ungu, almond, keju wijen, pandan krispi, stroberi, dan cokelat. Cocok buat ramean!",
      rating: 5.0,
      sold: 380,
      badge: "Paket Hemat",
    },
  ],
};
