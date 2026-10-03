/* Fastreng — Fast Cireng delivery order app
 * Vanilla JS, no build step. All store data lives in config.js.
 */
(function () {
  "use strict";

  const CFG = window.FASTRENG_CONFIG;
  const MENU = CFG.menu;
  const MENU_BY_ID = Object.fromEntries(MENU.map((m) => [m.id, m]));
  const STORE_KEY = "fastreng:v1";
  const MAX_QTY = 99;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------------------------------------------------------------- state
  const state = Object.assign(
    {
      onboarded: false,
      cart: {}, // { menuId: qty }
      favs: [],
      customer: { name: "", phone: "", address: "", landmark: "", note: "" },
      method: "delivery",
      payment: CFG.payments[0].id,
      promo: "",
      geo: null, // { lat, lng }
      history: [],
    },
    load()
  );
  // Drop cart entries for menu items that no longer exist in config.
  for (const id of Object.keys(state.cart)) if (!MENU_BY_ID[id]) delete state.cart[id];

  let activeCat = "all";
  let query = "";
  let detailId = null;
  let detailQty = 1;
  let lastWaUrl = "";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      /* storage unavailable (private mode) — app still works for this session */
    }
  }

  // ---------------------------------------------------------------- helpers
  const rupiah = (n) => "Rp" + Math.round(n).toLocaleString("id-ID");
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function cartLines() {
    return Object.entries(state.cart)
      .filter(([id, q]) => q > 0 && MENU_BY_ID[id])
      .map(([id, qty]) => ({ item: MENU_BY_ID[id], qty, total: MENU_BY_ID[id].price * qty }));
  }

  function totals() {
    const lines = cartLines();
    const qty = lines.reduce((a, l) => a + l.qty, 0);
    const subtotal = lines.reduce((a, l) => a + l.total, 0);
    const d = CFG.delivery;
    let shipping = 0;
    if (state.method === "delivery" && subtotal > 0) {
      shipping = d.freeShippingMin && subtotal >= d.freeShippingMin ? 0 : d.fee;
    }
    const promo = findPromo(state.promo);
    let discount = 0;
    let promoValid = false;
    if (promo && subtotal >= (promo.minSpend || 0)) {
      promoValid = true;
      discount = promo.type === "percent" ? Math.min((subtotal * promo.value) / 100, promo.max || Infinity) : promo.value;
      discount = Math.min(discount, subtotal);
    }
    const total = Math.max(0, subtotal + shipping - discount);
    return { lines, qty, subtotal, shipping, discount, promo, promoValid, total };
  }

  function findPromo(code) {
    if (!code) return null;
    return CFG.promos.find((p) => p.code.toUpperCase() === code.trim().toUpperCase()) || null;
  }

  function isOpen(date = new Date()) {
    const h = date.getHours() + date.getMinutes() / 60;
    return h >= CFG.store.openHour && h < CFG.store.closeHour;
  }

  const pad = (n) => String(n).padStart(2, "0");
  const hoursText = () => `${pad(CFG.store.openHour)}.00 – ${pad(CFG.store.closeHour)}.00 WIB`;

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  function vibrate(ms = 12) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // ---------------------------------------------------------------- cart ops
  function setQty(id, qty, opts = {}) {
    if (!MENU_BY_ID[id]) return;
    const prev = state.cart[id] || 0;
    qty = Math.max(0, Math.min(MAX_QTY, qty));
    if (qty === prev) {
      if (qty === MAX_QTY) toast(`Maksimal ${MAX_QTY} porsi per menu`);
      return;
    }
    if (qty === 0) delete state.cart[id];
    else state.cart[id] = qty;
    save();
    refreshItem(id, qty > prev);
    refreshCartUI();
    if (qty > prev) {
      vibrate();
      bumpCart();
      if (opts.fromEl) flyToCart(opts.fromEl, MENU_BY_ID[id].image);
    }
  }
  const addQty = (id, delta, opts) => setQty(id, (state.cart[id] || 0) + delta, opts);

  function bumpCart() {
    const ic = $("#cartIcon");
    ic.classList.remove("bump");
    void ic.offsetWidth;
    ic.classList.add("bump");
  }

  function flyToCart(fromEl, src) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = $("#cartBar:not([hidden]) .cart-bar-qty") || $("#cartIcon");
    const a = fromEl.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    const img = document.createElement("img");
    img.src = src;
    img.className = "fly";
    img.alt = "";
    img.style.left = a.left + a.width / 2 - 27 + "px";
    img.style.top = a.top + a.height / 2 - 27 + "px";
    document.body.appendChild(img);
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const anim = img.animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 80}px) scale(.8)`, opacity: 1, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(.25)`, opacity: 0.4 },
      ],
      { duration: 650, easing: "cubic-bezier(.5,0,.6,1)" }
    );
    anim.onfinish = () => img.remove();
  }

  // ---------------------------------------------------------------- menu rendering
  function cardHTML(m) {
    const fav = state.favs.includes(m.id);
    return `
      <article class="item" data-id="${m.id}">
        <button class="item-media" data-act="tap" aria-label="Tambah 1 ${esc(m.name)}">
          <img src="${esc(m.image)}" alt="${esc(m.name)}" loading="lazy" />
          ${m.badge ? `<span class="item-badge">${esc(m.badge)}</span>` : ""}
          <span class="qty-pill" hidden></span>
        </button>
        <button class="fav-btn ${fav ? "on" : ""}" data-act="fav" aria-label="Favorit" aria-pressed="${fav}">
          <svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-9.2-9.3A5 5 0 0 1 12 6.6a5 5 0 0 1 9.2 4.1C19.5 15.4 12 20 12 20z"/></svg>
        </button>
        <div class="item-body">
          <button class="item-name" data-act="detail">${esc(m.name)}</button>
          <div class="item-sub"><span class="star">★</span>${m.rating.toFixed(1)} · ${esc(m.unit)}</div>
          <div class="item-foot">
            <span class="price">${rupiah(m.price)}</span>
            <div class="ctrl"></div>
          </div>
        </div>
      </article>`;
  }

  function ctrlHTML(m, qty) {
    if (!qty) return `<button class="add-btn" data-act="inc" aria-label="Tambah ${esc(m.name)}">+</button>`;
    return `<div class="stepper">
        <button type="button" data-act="dec" aria-label="Kurangi">−</button>
        <output>${qty}</output>
        <button type="button" class="inc" data-act="inc" aria-label="Tambah">+</button>
      </div>`;
  }

  function refreshItem(id, popped) {
    const m = MENU_BY_ID[id];
    const qty = state.cart[id] || 0;
    $$(`.item[data-id="${id}"]`).forEach((card) => {
      card.classList.toggle("in-cart", qty > 0);
      const pill = $(".qty-pill", card);
      pill.hidden = !qty;
      pill.textContent = "×" + qty;
      if (popped && qty) {
        pill.classList.remove("pop");
        void pill.offsetWidth;
        pill.classList.add("pop");
      }
      const ctrl = $(".ctrl", card);
      // Keep the stepper node if it exists so rapid taps don't lose focus.
      const out = $("output", ctrl);
      if (qty && out) out.textContent = qty;
      else ctrl.innerHTML = ctrlHTML(m, qty);
      const fav = state.favs.includes(id);
      const fb = $(".fav-btn", card);
      fb.classList.toggle("on", fav);
      fb.setAttribute("aria-pressed", fav);
    });
  }

  function filteredMenu() {
    const q = query.trim().toLowerCase();
    return MENU.filter((m) => {
      const catOk = activeCat === "all" || m.category.includes(activeCat);
      const qOk = !q || (m.name + " " + m.desc).toLowerCase().includes(q);
      return catOk && qOk;
    });
  }

  function renderMenu() {
    const list = filteredMenu();
    $("#menuGrid").innerHTML = list.map(cardHTML).join("");
    $("#menuEmpty").hidden = list.length > 0;
    const cat = CFG.categories.find((c) => c.id === activeCat);
    $("#menuTitle").textContent = activeCat === "all" ? "Menu Cireng" : `Cireng ${cat.label}`;
    list.forEach((m) => refreshItem(m.id));
  }

  function renderFavs() {
    const list = MENU.filter((m) => state.favs.includes(m.id));
    $("#favGrid").innerHTML = list.map(cardHTML).join("");
    $("#favEmpty").hidden = list.length > 0;
    list.forEach((m) => refreshItem(m.id));
  }

  function renderCats() {
    $("#cats").innerHTML = CFG.categories
      .map(
        (c) => `<button class="cat ${c.id === activeCat ? "active" : ""}" role="tab" aria-selected="${c.id === activeCat}" data-cat="${c.id}">
          <span class="emo">${c.emoji}</span>${esc(c.label)}</button>`
      )
      .join("");
  }

  function toggleFav(id) {
    const i = state.favs.indexOf(id);
    if (i >= 0) state.favs.splice(i, 1);
    else state.favs.push(id);
    save();
    refreshItem(id);
    if (detailId === id) $("#dFav").classList.toggle("on", state.favs.includes(id));
    if (currentView() === "fav") renderFavs();
    toast(i >= 0 ? "Dihapus dari favorit" : "Ditambahkan ke favorit ❤️");
  }

  function onGridClick(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const card = btn.closest(".item");
    const id = card && card.dataset.id;
    if (!id) return;
    switch (btn.dataset.act) {
      case "tap":
        addQty(id, 1, { fromEl: btn });
        spawnPlus(btn);
        break;
      case "inc":
        addQty(id, 1, { fromEl: $(".item-media", card) });
        break;
      case "dec":
        addQty(id, -1);
        break;
      case "fav":
        toggleFav(id);
        break;
      case "detail":
        openDetail(id);
        break;
    }
  }

  function spawnPlus(el) {
    const s = document.createElement("span");
    s.className = "plus-pop";
    s.textContent = "+1";
    el.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }

  // ---------------------------------------------------------------- cart view
  function renderCart() {
    const t = totals();
    const has = t.lines.length > 0;
    $("#cartEmpty").hidden = has;
    $("#cartFilled").hidden = !has;
    $("#cartSub").textContent = has ? `${t.qty} item dari ${CFG.store.name}` : "Cek lagi pesananmu ya";

    $("#cartList").innerHTML = t.lines
      .map(
        ({ item, qty, total }) => `
        <li class="cart-item" data-id="${item.id}">
          <div class="ci-thumb"><img src="${esc(item.image)}" alt="" /></div>
          <div class="ci-info">
            <h4>${esc(item.name)}</h4>
            <small>${rupiah(item.price)} · ${esc(item.unit)}</small>
            <div class="ci-row">
              <b class="price">${rupiah(total)}</b>
              <div class="stepper">
                <button type="button" data-act="dec" aria-label="Kurangi">−</button>
                <output>${qty}</output>
                <button type="button" class="inc" data-act="inc" aria-label="Tambah">+</button>
              </div>
            </div>
          </div>
          <button class="ci-del" data-act="del" aria-label="Hapus ${esc(item.name)}">
            <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>
          </button>
        </li>`
      )
      .join("");

    renderSummary(t);
  }

  function renderSummary(t = totals()) {
    $("#sumQty").textContent = t.qty;
    $("#sumSubtotal").textContent = rupiah(t.subtotal);
    $("#sumShip").textContent = state.method === "pickup" ? "Ambil sendiri" : t.shipping === 0 ? "GRATIS" : rupiah(t.shipping);
    $("#sumDiscRow").hidden = !t.promoValid;
    $("#sumDiscCode").textContent = t.promo ? `(${t.promo.code})` : "";
    $("#sumDisc").textContent = "-" + rupiah(t.discount);
    $("#sumTotal").textContent = rupiah(t.total);
    $("#checkoutTotal").textContent = rupiah(t.total);

    const d = CFG.delivery;
    let hint = "";
    if (t.subtotal < d.minOrder) hint = `Minimal belanja ${rupiah(d.minOrder)}. Tambah ${rupiah(d.minOrder - t.subtotal)} lagi ya.`;
    else if (state.method === "delivery" && d.freeShippingMin && t.subtotal < d.freeShippingMin)
      hint = `🛵 Tambah ${rupiah(d.freeShippingMin - t.subtotal)} lagi untuk GRATIS ONGKIR!`;
    $("#shipHint").textContent = hint;

    const msg = $("#promoMsg");
    if (!state.promo) {
      msg.textContent = "";
      msg.className = "promo-msg";
    } else if (!t.promo) {
      msg.textContent = "Kode promo tidak ditemukan.";
      msg.className = "promo-msg bad";
    } else if (!t.promoValid) {
      msg.textContent = `${t.promo.code}: minimal belanja ${rupiah(t.promo.minSpend)}.`;
      msg.className = "promo-msg bad";
    } else {
      msg.textContent = `✓ ${t.promo.label} berhasil dipakai.`;
      msg.className = "promo-msg ok";
    }
  }

  function onCartClick(e) {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const id = btn.closest(".cart-item").dataset.id;
    const act = btn.dataset.act;
    if (act === "inc") addQty(id, 1);
    else if (act === "dec") {
      if (state.cart[id] === 1 && !confirm(`Hapus ${MENU_BY_ID[id].name} dari keranjang?`)) return;
      addQty(id, -1);
    } else if (act === "del") {
      setQty(id, 0);
      toast("Item dihapus dari keranjang");
    }
  }

  function refreshCartUI() {
    const t = totals();
    const badge = $("#cartBadge");
    const nb = $("#navBadge");
    badge.hidden = nb.hidden = t.qty === 0;
    badge.textContent = nb.textContent = t.qty > 99 ? "99+" : t.qty;
    $("#cartBarQty").textContent = t.qty;
    $("#cartBarTotal").textContent = rupiah(t.subtotal);
    updateBars();
    if (currentView() === "cart") renderCart();
  }

  function updateBars() {
    const v = currentView();
    const has = totals().qty > 0;
    const sheetOpen = !$("#sheetBackdrop").hidden;
    $("#cartBar").hidden = !(has && (v === "home" || v === "fav") && !sheetOpen);
    $("#checkoutBar").hidden = !(has && v === "cart");
  }

  // ---------------------------------------------------------------- checkout form
  function fillForm() {
    const c = state.customer;
    $("#fName").value = c.name;
    $("#fPhone").value = c.phone;
    $("#fAddress").value = c.address;
    $("#fLandmark").value = c.landmark;
    $("#fNote").value = c.note;
    $$('input[name="method"]').forEach((r) => (r.checked = r.value === state.method));
    $("#promoInput").value = state.promo;
    applyMethod();
    renderGeo();
  }

  function applyMethod() {
    const pickup = state.method === "pickup";
    $("#addrFields").hidden = pickup;
    const info = $("#pickupInfo");
    info.hidden = !pickup;
    info.innerHTML = `🏪 Ambil di: <b>${esc(CFG.store.address)}</b><br/>Jam buka ${hoursText()}`;
  }

  function renderPayments() {
    $("#payList").innerHTML = CFG.payments
      .map(
        (p) => `<label class="pay">
          <input type="radio" name="payment" value="${p.id}" ${p.id === state.payment ? "checked" : ""} />
          <span class="pi">${p.icon}</span>
          <span class="pt">${esc(p.label)}${p.info ? `<small>${esc(p.info)}</small>` : ""}</span>
        </label>`
      )
      .join("");
  }

  function renderLocLabel() {
    const c = state.customer;
    $("#locLabel").textContent = c.address ? c.address + (c.landmark ? ` (${c.landmark})` : "") : "Atur alamat pengiriman";
  }

  function renderGeo() {
    const b = $("#geoBtn");
    b.classList.toggle("ok", !!state.geo);
    $("#geoLabel").textContent = state.geo ? "Lokasi Maps terlampir ✓ (tap untuk hapus)" : "Bagikan lokasi saya (Maps)";
  }

  function requestGeo() {
    if (state.geo) {
      state.geo = null;
      save();
      renderGeo();
      return;
    }
    if (!navigator.geolocation) return toast("Perangkat tidak mendukung lokasi");
    $("#geoLabel").textContent = "Mengambil lokasi...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.geo = { lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) };
        save();
        renderGeo();
        toast("Lokasi berhasil ditambahkan 📍");
      },
      () => {
        renderGeo();
        toast("Gagal mengambil lokasi. Izinkan akses lokasi ya.");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  function onFormInput(e) {
    const el = e.target;
    const map = { fName: "name", fPhone: "phone", fAddress: "address", fLandmark: "landmark", fNote: "note" };
    if (map[el.id]) {
      state.customer[map[el.id]] = el.value;
      el.closest(".field")?.classList.remove("invalid");
      el.closest(".field")?.querySelector(".err")?.remove();
      if (el.id === "fAddress" || el.id === "fLandmark") renderLocLabel();
    } else if (el.name === "method") {
      state.method = el.value;
      applyMethod();
      renderSummary();
    } else if (el.name === "payment") {
      state.payment = el.value;
    }
    save();
  }

  function setInvalid(input, msg) {
    const f = input.closest(".field");
    f.classList.add("invalid");
    if (!f.querySelector(".err")) {
      const s = document.createElement("span");
      s.className = "err";
      s.textContent = msg;
      f.appendChild(s);
    }
  }

  function validate() {
    const c = state.customer;
    const errs = [];
    if (c.name.trim().length < 2) errs.push([$("#fName"), "Nama wajib diisi"]);
    const digits = c.phone.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) errs.push([$("#fPhone"), "Nomor WhatsApp tidak valid"]);
    if (state.method === "delivery" && c.address.trim().length < 8) errs.push([$("#fAddress"), "Alamat lengkap wajib diisi"]);
    errs.forEach(([el, m]) => setInvalid(el, m));
    if (errs.length) {
      errs[0][0].scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => errs[0][0].focus({ preventScroll: true }), 300);
      toast("Lengkapi data pemesan dulu ya 🙏");
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- WhatsApp message
  function orderId(d = new Date()) {
    const ymd = `${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    return `FC-${ymd}-${pad(d.getHours())}${pad(d.getMinutes())}${Math.floor(Math.random() * 90 + 10)}`;
  }

  function buildMessage(id, t, date = new Date()) {
    const c = state.customer;
    const pay = CFG.payments.find((p) => p.id === state.payment) || CFG.payments[0];
    const when = date.toLocaleString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const L = [];
    L.push(`*PESANAN BARU — ${CFG.store.name.toUpperCase()}*`);
    L.push(`No. Order: *${id}*`);
    L.push(`Waktu: ${when}`);
    L.push("");
    L.push("*DATA PEMESAN*");
    L.push(`Nama : ${c.name.trim()}`);
    L.push(`No. WA : ${c.phone.trim()}`);
    if (state.method === "delivery") {
      L.push("Metode : Diantar (Delivery)");
      L.push(`Alamat : ${c.address.trim()}`);
      if (c.landmark.trim()) L.push(`Patokan : ${c.landmark.trim()}`);
      if (state.geo) L.push(`Lokasi : https://maps.google.com/?q=${state.geo.lat},${state.geo.lng}`);
    } else {
      L.push("Metode : Ambil Sendiri (Pickup)");
    }
    L.push("");
    L.push("*DAFTAR PESANAN*");
    L.push("--------------------------------");
    t.lines.forEach(({ item, qty, total }, i) => {
      L.push(`${i + 1}. ${item.name} (${item.unit})`);
      L.push(`    ${qty} x ${rupiah(item.price)} = *${rupiah(total)}*`);
    });
    L.push("--------------------------------");
    L.push(`Subtotal (${t.qty} item) : ${rupiah(t.subtotal)}`);
    if (state.method === "delivery") L.push(`Ongkir : ${t.shipping === 0 ? "GRATIS" : rupiah(t.shipping)}`);
    if (t.promoValid) L.push(`Diskon (${t.promo.code}) : -${rupiah(t.discount)}`);
    L.push(`*TOTAL BAYAR : ${rupiah(t.total)}*`);
    L.push("");
    L.push(`Pembayaran : ${pay.label}`);
    if (pay.info) L.push(`(${pay.info})`);
    if (c.note.trim()) {
      L.push("");
      L.push(`Catatan : ${c.note.trim()}`);
    }
    L.push("");
    if (!isOpen(date)) L.push(`_Pesanan dikirim di luar jam buka (${hoursText()})._`);
    L.push("Mohon dikonfirmasi ya kak, terima kasih! 🙏");
    return L.join("\n");
  }

  function waLink(text) {
    const num = String(CFG.store.whatsapp).replace(/\D/g, "");
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  }

  function sendOrder() {
    const t = totals();
    if (!t.lines.length) return toast("Keranjang masih kosong");
    if (t.subtotal < CFG.delivery.minOrder) {
      toast(`Minimal belanja ${rupiah(CFG.delivery.minOrder)}`);
      return;
    }
    if (!validate()) return;
    const now = new Date();
    const id = orderId(now);
    lastWaUrl = waLink(buildMessage(id, t, now));

    state.history.unshift({
      id,
      at: now.toISOString(),
      items: t.lines.map((l) => ({ id: l.item.id, name: l.item.name, qty: l.qty })),
      total: t.total,
      method: state.method,
    });
    state.history = state.history.slice(0, 20);
    save();

    window.open(lastWaUrl, "_blank", "noopener");
    $("#doneId").textContent = id;
    $("#doneReopen").href = lastWaUrl;
    openSheet("#doneSheet");
  }

  // ---------------------------------------------------------------- sheets
  function openSheet(sel) {
    $$(".sheet").forEach((s) => (s.hidden = true));
    $(sel).hidden = false;
    $("#sheetBackdrop").hidden = false;
    document.body.style.overflow = "hidden";
    updateBars();
  }
  function closeSheets() {
    $$(".sheet").forEach((s) => (s.hidden = true));
    $("#sheetBackdrop").hidden = true;
    document.body.style.overflow = "";
    detailId = null;
    updateBars();
  }

  function openDetail(id) {
    const m = MENU_BY_ID[id];
    detailId = id;
    detailQty = 1;
    $("#dImg").src = m.image;
    $("#dImg").alt = m.name;
    $("#dName").textContent = m.name;
    $("#dPrice").textContent = rupiah(m.price);
    $("#dUnit").textContent = m.unit;
    $("#dDesc").textContent = m.desc;
    $("#dRating").textContent = m.rating.toFixed(1);
    $("#dSold").textContent = m.sold >= 1000 ? (m.sold / 1000).toLocaleString("id-ID") + "rb+" : m.sold + "+";
    $("#dBadge").textContent = m.badge || "";
    $("#dEta").textContent = CFG.delivery.estimate;
    $("#dFav").classList.toggle("on", state.favs.includes(id));
    renderDetailQty();
    openSheet("#detailSheet");
  }
  function renderDetailQty() {
    $("#dQty").textContent = detailQty;
    $("#dTotal").textContent = rupiah(MENU_BY_ID[detailId].price * detailQty);
  }

  function openAddr() {
    $("#aAddress").value = state.customer.address;
    $("#aLandmark").value = state.customer.landmark;
    openSheet("#addrSheet");
    setTimeout(() => $("#aAddress").focus(), 250);
  }

  // ---------------------------------------------------------------- profile
  function renderProfile() {
    const s = CFG.store;
    $("#storeName").textContent = s.name;
    $("#storeTagline").textContent = s.tagline;
    $("#infoAddr").textContent = s.address;
    $("#infoHours").textContent = `Buka setiap hari, ${hoursText()}`;
    const d = CFG.delivery;
    $("#infoShip").textContent =
      `Ongkir ${rupiah(d.fee)}` + (d.freeShippingMin ? ` · Gratis ongkir min. ${rupiah(d.freeShippingMin)}` : "") + ` · Estimasi ${d.estimate}`;
    $("#infoWa").href = waLink(`Halo ${s.name}, saya mau tanya-tanya dulu 😊`);

    const h = state.history;
    $("#historyEmpty").hidden = h.length > 0;
    $("#clearHistory").hidden = h.length === 0;
    $("#historyList").innerHTML = h
      .map((o, i) => {
        const date = new Date(o.at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
        return `<li>
          <div class="h-top"><span>${esc(o.id)}</span><span>${rupiah(o.total)}</span></div>
          <div class="h-items">${esc(date)} · ${o.method === "pickup" ? "Ambil sendiri" : "Diantar"}<br/>${o.items
            .map((it) => `${it.qty}× ${esc(it.name)}`)
            .join(", ")}</div>
          <div class="h-act"><button class="btn btn-outline btn-sm" data-reorder="${i}">Pesan Lagi</button></div>
        </li>`;
      })
      .join("");
  }

  function reorder(i) {
    const o = state.history[i];
    if (!o) return;
    let added = 0;
    o.items.forEach((it) => {
      if (MENU_BY_ID[it.id]) {
        state.cart[it.id] = Math.min(MAX_QTY, (state.cart[it.id] || 0) + it.qty);
        added++;
      }
    });
    save();
    MENU.forEach((m) => refreshItem(m.id));
    refreshCartUI();
    if (added) {
      toast("Pesanan dimasukkan ke keranjang 🛒");
      location.hash = "#cart";
    } else toast("Menu pada pesanan ini sudah tidak tersedia");
  }

  // ---------------------------------------------------------------- routing
  const VIEWS = ["home", "fav", "cart", "profile"];
  function currentView() {
    const v = location.hash.replace("#", "");
    return VIEWS.includes(v) ? v : "home";
  }
  function route() {
    const v = currentView();
    closeSheets();
    $$(".view").forEach((el) => (el.hidden = el.dataset.view !== v));
    $$(".bottom-nav a").forEach((a) => a.classList.toggle("active", a.dataset.nav === v));
    if (v === "fav") renderFavs();
    if (v === "cart") {
      renderCart();
      fillForm();
    }
    if (v === "profile") renderProfile();
    updateBars();
    window.scrollTo({ top: 0 });
  }

  function renderStatus() {
    const open = isOpen();
    ["#storeStatus", "#storeStatus2"].forEach((s) => {
      const el = $(s);
      el.textContent = open ? "● Buka" : "● Tutup";
      el.className = "store-status " + (open ? "open" : "closed");
      el.title = hoursText();
    });
    const h = new Date().getHours();
    const sapa = h < 11 ? "Selamat pagi" : h < 15 ? "Selamat siang" : h < 18 ? "Selamat sore" : "Selamat malam";
    const name = state.customer.name.trim().split(" ")[0];
    $("#greetText").textContent = `${sapa}${name ? ", " + name : ""}! 👋`;
  }

  // ---------------------------------------------------------------- init
  function init() {
    document.title = `${CFG.store.name} — Delivery Order Cireng`;
    $("#year").textContent = new Date().getFullYear();
    const firstPromo = CFG.promos[0];
    if (firstPromo) {
      $("#promoTitle").textContent = firstPromo.type === "percent" ? `Diskon ${firstPromo.value}%` : `Hemat ${rupiah(firstPromo.value)}`;
      $("#promoText").textContent = `Kode ${firstPromo.code}` + (firstPromo.minSpend ? ` · min. ${rupiah(firstPromo.minSpend)}` : "");
    } else {
      const fs = CFG.delivery.freeShippingMin;
      $("#promoTitle").textContent = fs ? "Gratis Ongkir" : CFG.store.name;
      $("#promoText").textContent = fs ? `Belanja min. ${rupiah(fs)}` : CFG.store.tagline;
      $("#promoBtn").hidden = true;
    }

    if (state.onboarded) $("#splash").remove();
    else
      $("#startBtn").addEventListener("click", () => {
        state.onboarded = true;
        save();
        const sp = $("#splash");
        sp.classList.add("leave");
        setTimeout(() => sp.remove(), 450);
      });

    renderCats();
    renderMenu();
    renderPayments();
    renderLocLabel();
    renderStatus();
    refreshCartUI();
    route();
    setInterval(renderStatus, 60000);

    // events
    window.addEventListener("hashchange", route);
    $("#menuGrid").addEventListener("click", onGridClick);
    $("#favGrid").addEventListener("click", onGridClick);
    $("#cats").addEventListener("click", (e) => {
      const b = e.target.closest("[data-cat]");
      if (!b) return;
      activeCat = b.dataset.cat;
      renderCats();
      renderMenu();
    });
    $("#searchInput").addEventListener("input", (e) => {
      query = e.target.value;
      renderMenu();
    });
    $("#promoBtn").addEventListener("click", () => {
      state.promo = firstPromo.code;
      save();
      toast(`Kode ${firstPromo.code} disimpan, otomatis dipakai di keranjang 🎉`);
    });

    $("#cartList").addEventListener("click", onCartClick);
    $("#clearCart").addEventListener("click", () => {
      if (!confirm("Kosongkan semua isi keranjang?")) return;
      state.cart = {};
      save();
      MENU.forEach((m) => refreshItem(m.id));
      refreshCartUI();
    });
    $("#checkoutForm").addEventListener("input", onFormInput);
    $("#checkoutForm").addEventListener("change", onFormInput);
    $("#checkoutForm").addEventListener("submit", (e) => {
      e.preventDefault();
      sendOrder();
    });
    $("#geoBtn").addEventListener("click", requestGeo);
    $("#applyPromo").addEventListener("click", () => {
      state.promo = $("#promoInput").value.trim().toUpperCase();
      $("#promoInput").value = state.promo;
      save();
      renderSummary();
    });
    $("#promoInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        $("#applyPromo").click();
      }
    });
    $("#sendWa").addEventListener("click", sendOrder);

    // detail sheet
    $("#dClose").addEventListener("click", closeSheets);
    $("#sheetBackdrop").addEventListener("click", closeSheets);
    $("#dFav").addEventListener("click", () => detailId && toggleFav(detailId));
    $(".d-actions .stepper").addEventListener("click", (e) => {
      const b = e.target.closest("[data-d]");
      if (!b) return;
      detailQty = Math.max(1, Math.min(MAX_QTY, detailQty + Number(b.dataset.d)));
      renderDetailQty();
    });
    $("#dAdd").addEventListener("click", () => {
      const id = detailId;
      const name = MENU_BY_ID[id].name;
      const q = detailQty;
      closeSheets();
      addQty(id, q);
      toast(`${q}× ${name} masuk keranjang 🛒`);
    });

    // address sheet
    $("#locBtn").addEventListener("click", openAddr);
    $("#aCancel").addEventListener("click", closeSheets);
    $("#aSave").addEventListener("click", () => {
      state.customer.address = $("#aAddress").value.trim();
      state.customer.landmark = $("#aLandmark").value.trim();
      if (state.customer.address) state.method = "delivery";
      save();
      renderLocLabel();
      closeSheets();
      if (currentView() === "cart") fillForm();
      toast("Alamat disimpan 📍");
    });

    // done sheet
    $("#doneNew").addEventListener("click", () => {
      state.cart = {};
      state.promo = "";
      save();
      MENU.forEach((m) => refreshItem(m.id));
      refreshCartUI();
      closeSheets();
      location.hash = "#home";
    });
    $("#doneKeep").addEventListener("click", closeSheets);

    // profile
    $("#historyList").addEventListener("click", (e) => {
      const b = e.target.closest("[data-reorder]");
      if (b) reorder(+b.dataset.reorder);
    });
    $("#clearHistory").addEventListener("click", () => {
      if (!confirm("Hapus semua riwayat pesanan?")) return;
      state.history = [];
      save();
      renderProfile();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeSheets();
    });

    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
  }

  init();
})();
