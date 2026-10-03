/* Shared order store for the seller dashboard.
 * Orders live in this device's localStorage. They arrive three ways:
 *  - "wa":     pasted from a WhatsApp order message (parseWhatsApp)
 *  - "device": placed from the shop page on this same device (kasir mode)
 *  - "manual": typed in on the dashboard
 */
(function () {
  "use strict";

  const KEY = "fastreng:seller:v1";

  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(d && d.orders) ? d.orders : [];
    } catch (e) {
      return [];
    }
  }

  function save(orders) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ orders }));
      return true;
    } catch (e) {
      return false;
    }
  }

  // Merge new orders in, skipping ids already stored. Returns { added, dup }.
  function add(list) {
    const orders = load();
    const ids = new Set(orders.map((o) => o.id));
    let added = 0;
    let dup = 0;
    for (const o of list) {
      if (ids.has(o.id)) {
        dup++;
        continue;
      }
      ids.add(o.id);
      orders.push(o);
      added++;
    }
    orders.sort((a, b) => new Date(b.at) - new Date(a.at));
    save(orders);
    return { added, dup };
  }

  const num = (s) => Number(String(s || "").replace(/[^\d]/g, "")) || 0;

  // FC-yymmdd-hhmmNN carries the order time.
  function dateFromId(id) {
    const m = /FC-(\d{2})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(id || "");
    if (!m) return null;
    const d = new Date(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    return isNaN(d) ? null : d;
  }

  function field(text, label) {
    const re = new RegExp("^\\s*" + label + "\\s*:\\s*(.+)$", "im");
    const m = re.exec(text);
    return m ? m[1].trim() : "";
  }

  function parseOne(raw) {
    // WhatsApp keeps *bold* / _italic_ markers when copying; drop them.
    const text = raw.replace(/[*_]/g, "").replace(/\r/g, "");
    const idm = /No\.?\s*Order\s*:\s*(FC-\d{6}-\d{4,8})/i.exec(text);
    if (!idm) return null;
    const id = idm[1].toUpperCase();

    const items = [];
    const lines = text.split("\n");
    for (let i = 0; i < lines.length - 1; i++) {
      const name = /^\s*\d+\.\s+(.+?)\s*$/.exec(lines[i]);
      const qty = /(\d+)\s*x\s*Rp\s?([\d.,]+)\s*=\s*Rp\s?([\d.,]+)/i.exec(lines[i + 1]);
      if (name && qty) {
        let n = name[1];
        let unit = "";
        const u = /^(.*)\s+\(([^)]*)\)$/.exec(n);
        if (u) {
          n = u[1];
          unit = u[2];
        }
        items.push({ name: n.trim(), unit, qty: num(qty[1]), price: num(qty[2]) });
        i++;
      }
    }
    if (!items.length) return null;

    const subtotal = items.reduce((a, it) => a + it.qty * it.price, 0);
    const ongkir = field(text, "Ongkir");
    const shipping = /gratis/i.test(ongkir) ? 0 : num(ongkir);
    const discM = /Diskon[^:\n]*:\s*-?\s*Rp\s?([\d.,]+)/i.exec(text);
    const discount = discM ? num(discM[1]) : 0;
    const totalM = /TOTAL\s+BAYAR\s*:\s*Rp\s?([\d.,]+)/i.exec(text);
    const total = totalM ? num(totalM[1]) : subtotal + shipping - discount;
    const metode = field(text, "Metode");

    return {
      id,
      at: (dateFromId(id) || new Date()).toISOString(),
      name: field(text, "Nama") || "Tanpa nama",
      phone: field(text, "No\\.?\\s*WA"),
      method: /ambil|pickup/i.test(metode) ? "pickup" : "delivery",
      address: field(text, "Alamat"),
      payment: field(text, "Pembayaran") || "-",
      note: field(text, "Catatan"),
      items,
      subtotal,
      shipping,
      discount,
      total,
      status: "baru",
      source: "wa",
    };
  }

  // A paste may hold several order messages; split on the header line.
  function parseWhatsApp(text) {
    const chunks = String(text || "").split(/(?=\*?PESANAN BARU)/i);
    const out = [];
    const seen = new Set();
    for (const c of chunks) {
      const o = parseOne(c);
      if (o && !seen.has(o.id)) {
        seen.add(o.id);
        out.push(o);
      }
    }
    return out;
  }

  window.FastrengOrders = { KEY, load, save, add, parseWhatsApp };
})();
