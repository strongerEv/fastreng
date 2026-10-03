/* Fastreng — seller dashboard (order summary + charts). Local data only. */
(function () {
  "use strict";

  const CFG = window.FASTRENG_CONFIG;
  const DB = window.FastrengOrders;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const SESSION_KEY = "fastreng:admin-unlocked";
  const DAY = 86400000;

  const STATUS = {
    baru: { label: "Baru", color: "#2a78d6" },
    proses: { label: "Diproses", color: "#eda100" },
    selesai: { label: "Selesai", color: "#1baf7a" },
    batal: { label: "Batal", color: "#a39a94" },
  };

  let orders = [];
  let range = "today";
  let statusFilter = "";
  let search = "";
  let listLimit = 30;
  const manualQty = {};

  // ---------------------------------------------------------------- helpers
  const rupiah = (n) => "Rp" + Math.round(n).toLocaleString("id-ID");
  const compact = (n) => {
    if (n >= 1e6) return (n / 1e6).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "jt";
    if (n >= 1e3) return (n / 1e3).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "rb";
    return String(Math.round(n));
  };
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const qtyOf = (o) => o.items.reduce((a, it) => a + it.qty, 0);
  const counted = (o) => o.status !== "batal";

  let toastTimer;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
  }

  function waNumber(phone) {
    let d = String(phone || "").replace(/\D/g, "");
    if (d.startsWith("0")) d = "62" + d.slice(1);
    return d;
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
  }

  // ---------------------------------------------------------------- periods
  function periodBounds(r, now = new Date()) {
    const end = now;
    if (r === "all") {
      const first = orders.length ? new Date(Math.min(...orders.map((o) => +new Date(o.at)))) : now;
      return { start: startOfDay(first), end, days: Math.round((startOfDay(now) - startOfDay(first)) / DAY) + 1 };
    }
    const days = r === "today" ? 1 : Number(r);
    const start = new Date(startOfDay(now) - (days - 1) * DAY);
    return { start, end, days };
  }

  function inPeriod(o, b) {
    const t = new Date(o.at);
    return t >= b.start && t <= b.end;
  }

  // ---------------------------------------------------------------- tooltip
  const tip = $("#tooltip");
  function showTip(el, x, y) {
    tip.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = el.dataset.tipValue;
    const span = document.createElement("span");
    span.textContent = el.dataset.tipLabel;
    tip.append(strong, span);
    tip.hidden = false;
    const w = tip.offsetWidth / 2 + 8;
    tip.style.left = Math.max(w, Math.min(window.innerWidth - w, x)) + "px";
    tip.style.top = Math.max(60, y) + "px";
  }
  function bindTooltips() {
    document.addEventListener("pointerover", (e) => {
      const el = e.target.closest("[data-tip-value]");
      if (el) showTip(el, e.clientX, e.clientY);
    });
    document.addEventListener("pointermove", (e) => {
      const el = e.target.closest("[data-tip-value]");
      if (el) showTip(el, e.clientX, e.clientY);
      else tip.hidden = true;
    });
    document.addEventListener("focusin", (e) => {
      const el = e.target.closest("[data-tip-value]");
      if (!el) return;
      const r = el.getBoundingClientRect();
      showTip(el, r.left + r.width / 2, r.top);
    });
    document.addEventListener("focusout", () => (tip.hidden = true));
    window.addEventListener("scroll", () => (tip.hidden = true), { passive: true });
  }

  // ---------------------------------------------------------------- charts
  function niceStep(max, ticks = 4) {
    const raw = max / ticks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
    const n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  }

  // Single-series column chart. Bars grow from one baseline, 4px rounded cap.
  function columnChart(el, data, opts) {
    const W = Math.max(280, el.clientWidth || 600);
    const H = opts.height || 220;
    const m = { t: 22, r: 8, b: 26, l: 44 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const maxV = Math.max(0, ...data.map((d) => d.value));
    if (!data.length || maxV === 0) {
      el.innerHTML = `<p class="chart-none">Belum ada data di periode ini</p>`;
      return;
    }
    const step = opts.integer ? Math.max(1, Math.ceil(niceStep(maxV))) : niceStep(maxV);
    const top = Math.ceil(maxV / step) * step;
    const y = (v) => m.t + ih - (v / top) * ih;
    const band = iw / data.length;
    const bw = Math.max(2, Math.min(24, band * 0.62));
    const labelEvery = Math.max(1, Math.ceil(data.length / Math.floor(iw / 44)));
    const maxIdx = data.findIndex((d) => d.value === maxV);

    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opts.aria)}">`;
    for (let v = 0; v <= top + 1e-9; v += step) {
      const yy = Math.round(y(v)) + 0.5;
      s += `<line class="grid-line" x1="${m.l}" x2="${W - m.r}" y1="${yy}" y2="${yy}"/>`;
      s += `<text class="axis-text" x="${m.l - 8}" y="${yy + 4}" text-anchor="end">${esc(opts.fmtAxis(v))}</text>`;
    }
    data.forEach((d, i) => {
      const cx = m.l + band * i + band / 2;
      const x = cx - bw / 2;
      const y0 = m.t + ih;
      const h = y0 - y(d.value);
      s += `<rect class="hit" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${ih}" tabindex="0"
        data-tip-value="${esc(d.tipValue)}" data-tip-label="${esc(d.tipLabel)}" aria-label="${esc(d.tipLabel + ": " + d.tipValue)}"/>`;
      if (d.value > 0) {
        const r = Math.min(4, h, bw / 2);
        s += `<path class="bar" pointer-events="none" d="M${x},${y0} V${y0 - h + r} Q${x},${y0 - h} ${x + r},${y0 - h} H${x + bw - r} Q${x + bw},${y0 - h} ${x + bw},${y0 - h + r} V${y0} Z"/>`;
      } else {
        s += `<path class="bar" d=""/>`;
      }
      if (i % labelEvery === 0 || data.length <= 8)
        s += `<text class="axis-text" x="${cx}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text>`;
      if (i === maxIdx) s += `<text class="val-text" x="${cx}" y="${y(d.value) - 6}" text-anchor="middle">${esc(opts.fmtValue(d.value))}</text>`;
    });
    s += `</svg>`;
    el.innerHTML = s;
  }

  function hbarChart(el, rows) {
    if (!rows.length) {
      el.innerHTML = `<p class="chart-none">Belum ada data di periode ini</p>`;
      return;
    }
    const max = rows[0].qty;
    el.innerHTML = rows
      .map(
        (r) => `<div class="hbar" tabindex="0" data-tip-value="${esc(rupiah(r.revenue))}" data-tip-label="${esc(r.name)} · omzet">
          <div class="hbar-top"><span>${esc(r.name)}</span><b>${r.qty} porsi</b></div>
          <div class="hbar-track"><div class="hbar-fill" style="width:${(r.qty / max) * 100}%"></div></div>
        </div>`
      )
      .join("");
  }

  function shareChart(el, title, parts) {
    const total = parts.reduce((a, p) => a + p.value, 0);
    if (!total) {
      el.innerHTML = `<div class="share-title">${esc(title)}</div><p class="chart-none">Belum ada data</p>`;
      return;
    }
    const colors = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];
    const shown = parts.filter((p) => p.value > 0);
    const pct = (v) => Math.round((v / total) * 100) + "%";
    el.innerHTML = `<div class="share-title">${esc(title)}</div>
      <div class="share-bar">${shown
        .map(
          (p) => `<div class="share-seg" tabindex="0" style="flex:${p.value};background:${colors[parts.indexOf(p) % 3]}"
            data-tip-value="${p.value} pesanan · ${pct(p.value)}" data-tip-label="${esc(p.label)}"></div>`
        )
        .join("")}</div>
      <ul class="share-legend">${parts
        .map(
          (p, i) => `<li><i style="background:${colors[i % 3]}"></i><span>${esc(p.label)}</span><b>${p.value}</b><small>${pct(p.value)}</small></li>`
        )
        .join("")}</ul>`;
  }

  // ---------------------------------------------------------------- render
  function render() {
    orders = DB.load();
    const empty = orders.length === 0;
    $("#dashEmpty").hidden = !empty;
    $("#dashBody").hidden = empty;
    const hasDemo = orders.some((o) => o.source === "demo");
    $("#dashSub").textContent = hasDemo ? "Menampilkan data contoh — tekan Hapus Semua Data untuk mulai asli" : "Ringkasan orderan " + CFG.store.name;
    if (empty) return;

    const b = periodBounds(range);
    const inRange = orders.filter((o) => inPeriod(o, b));
    const valid = inRange.filter(counted);

    // stats
    const revenue = valid.reduce((a, o) => a + o.total, 0);
    const qty = valid.reduce((a, o) => a + qtyOf(o), 0);
    $("#sRevenue").textContent = rupiah(revenue);
    $("#sOrders").textContent = valid.length.toLocaleString("id-ID");
    $("#sAvg").textContent = rupiah(valid.length ? revenue / valid.length : 0);
    $("#sQty").textContent = qty.toLocaleString("id-ID");

    if (range === "all") {
      setDelta("#sRevenueDelta", null);
      setDelta("#sOrdersDelta", null);
    } else {
      const len = b.days * DAY;
      const pb = { start: new Date(+b.start - len), end: new Date(+b.end - len) };
      const prev = orders.filter((o) => inPeriod(o, pb) && counted(o));
      const prevName = range === "today" ? "kemarin" : `${b.days} hari sebelumnya`;
      setDelta("#sRevenueDelta", [revenue, prev.reduce((a, o) => a + o.total, 0)], prevName);
      setDelta("#sOrdersDelta", [valid.length, prev.length], prevName);
    }

    // status chips
    $("#statusRow").innerHTML = Object.entries(STATUS)
      .map(([k, s]) => {
        const n = inRange.filter((o) => o.status === k).length;
        return `<button class="status-chip" data-status="${k}"><i style="background:${s.color}"></i>${s.label} <b>${n}</b></button>`;
      })
      .join("");

    renderTrend(valid, b);
    renderHours(valid);
    renderMenu(valid);
    renderShares(valid);
    renderTopCustomers(valid);
    renderOrders(inRange);
  }

  function setDelta(sel, pair, prevName) {
    const el = $(sel);
    el.className = "stat-delta";
    if (!pair) {
      el.textContent = "Sepanjang waktu";
      return;
    }
    const [cur, prev] = pair;
    if (!prev) {
      el.textContent = `Belum ada data ${prevName}`;
      return;
    }
    const d = ((cur - prev) / prev) * 100;
    const sign = d > 0 ? "▲ +" : d < 0 ? "▼ " : "";
    el.textContent = `${sign}${d.toLocaleString("id-ID", { maximumFractionDigits: 0 })}% vs ${prevName}`;
    el.classList.add(d > 0 ? "up" : d < 0 ? "down" : "flat");
  }

  function renderTrend(valid, b) {
    const el = $("#trendChart");
    let data;
    if (range === "today") {
      $("#trendTitle").textContent = "Omzet per jam hari ini";
      const [h0, h1] = hourSpan(valid);
      data = [];
      for (let h = h0; h <= h1; h++) {
        const v = valid.filter((o) => new Date(o.at).getHours() === h).reduce((a, o) => a + o.total, 0);
        data.push({ label: pad(h), value: v, tipValue: rupiah(v), tipLabel: `Pukul ${pad(h)}.00–${pad(h)}.59` });
      }
    } else if (b.days > 92) {
      $("#trendTitle").textContent = "Omzet per bulan";
      const map = new Map();
      for (let d = new Date(b.start.getFullYear(), b.start.getMonth(), 1); d <= b.end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1))
        map.set(`${d.getFullYear()}-${d.getMonth()}`, { d, v: 0 });
      valid.forEach((o) => {
        const t = new Date(o.at);
        const e = map.get(`${t.getFullYear()}-${t.getMonth()}`);
        if (e) e.v += o.total;
      });
      data = [...map.values()].map(({ d, v }) => ({
        label: d.toLocaleDateString("id-ID", { month: "short" }),
        value: v,
        tipValue: rupiah(v),
        tipLabel: d.toLocaleDateString("id-ID", { month: "long", year: "numeric" }),
      }));
    } else {
      $("#trendTitle").textContent = "Omzet per hari";
      data = [];
      for (let i = 0; i < b.days; i++) {
        const d = new Date(+b.start + i * DAY);
        const next = new Date(+d + DAY);
        const v = valid.filter((o) => {
          const t = new Date(o.at);
          return t >= d && t < next;
        }).reduce((a, o) => a + o.total, 0);
        data.push({
          label: b.days <= 7 ? d.toLocaleDateString("id-ID", { weekday: "short" }) : String(d.getDate()),
          value: v,
          tipValue: rupiah(v),
          tipLabel: d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" }),
        });
      }
    }
    columnChart(el, data, { aria: "Grafik omzet", fmtAxis: compact, fmtValue: compact });
  }

  function hourSpan(list) {
    let h0 = CFG.store.openHour;
    let h1 = CFG.store.closeHour - 1;
    list.forEach((o) => {
      const h = new Date(o.at).getHours();
      h0 = Math.min(h0, h);
      h1 = Math.max(h1, h);
    });
    return [h0, h1];
  }

  function renderHours(valid) {
    const [h0, h1] = hourSpan(valid);
    const data = [];
    for (let h = h0; h <= h1; h++) {
      const n = valid.filter((o) => new Date(o.at).getHours() === h).length;
      data.push({ label: pad(h), value: n, tipValue: `${n} pesanan`, tipLabel: `Pukul ${pad(h)}.00–${pad(h)}.59` });
    }
    columnChart($("#hourChart"), data, {
      aria: "Grafik jam ramai",
      integer: true,
      height: 190,
      fmtAxis: (v) => String(v),
      fmtValue: (v) => `${v} pesanan`,
    });
  }

  function renderMenu(valid) {
    const map = new Map();
    valid.forEach((o) =>
      o.items.forEach((it) => {
        const r = map.get(it.name) || { name: it.name, qty: 0, revenue: 0 };
        r.qty += it.qty;
        r.revenue += it.qty * it.price;
        map.set(it.name, r);
      })
    );
    const rows = [...map.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 8);
    hbarChart($("#menuChart"), rows);
  }

  function renderShares(valid) {
    shareChart($("#methodShare"), "Cara terima", [
      { label: "Diantar", value: valid.filter((o) => o.method !== "pickup").length },
      { label: "Ambil sendiri", value: valid.filter((o) => o.method === "pickup").length },
    ]);
    const labels = CFG.payments.map((p) => p.label);
    const parts = labels.map((l) => ({ label: l, value: valid.filter((o) => o.payment === l).length }));
    const other = valid.filter((o) => !labels.includes(o.payment)).length;
    if (other) parts.push({ label: "Lainnya", value: other });
    shareChart($("#payShare"), "Pembayaran", parts.slice(0, 3));
  }

  function renderTopCustomers(valid) {
    const map = new Map();
    valid.forEach((o) => {
      const key = waNumber(o.phone) || o.name.toLowerCase();
      const r = map.get(key) || { name: o.name, phone: o.phone, n: 0, total: 0 };
      r.n++;
      r.total += o.total;
      map.set(key, r);
    });
    const rows = [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
    $("#topCust").innerHTML = rows.length
      ? rows
          .map((r) => `<li><span>${esc(r.name)}<small>${r.n}× pesan${r.phone ? " · " + esc(r.phone) : ""}</small></span><b>${rupiah(r.total)}</b></li>`)
          .join("")
      : `<p class="chart-none">Belum ada data di periode ini</p>`;
  }

  // ---------------------------------------------------------------- order list
  function renderOrders(inRange) {
    const q = search.trim().toLowerCase();
    const list = inRange.filter(
      (o) => (!statusFilter || o.status === statusFilter) && (!q || (o.name + " " + o.id + " " + o.phone).toLowerCase().includes(q))
    );
    $("#orderCount").textContent = `(${list.length})`;
    if (!list.length) {
      $("#orderList").innerHTML = `<li class="order-none">Tidak ada pesanan untuk filter ini.</li>`;
      return;
    }
    const shown = list.slice(0, listLimit);
    $("#orderList").innerHTML =
      shown.map(orderHTML).join("") +
      (list.length > listLimit ? `<li><button class="btn btn-outline btn-sm" id="moreBtn" style="width:100%">Tampilkan lebih banyak</button></li>` : "");
  }

  function orderHTML(o) {
    const d = new Date(o.at);
    const when = d.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const st = STATUS[o.status] || STATUS.baru;
    const src = { wa: "dari WA", device: "dari toko", manual: "manual", demo: "contoh" }[o.source] || "";
    return `<li class="order ${o.status === "batal" ? "is-batal" : ""}" data-id="${esc(o.id)}"><details>
      <summary>
        <span class="o-name">${esc(o.name)}</span>
        <span class="o-total">${rupiah(o.total)}</span>
        <span class="o-meta">${esc(when)} · ${qtyOf(o)} porsi · ${o.method === "pickup" ? "Ambil" : "Antar"} · ${esc(o.id)}</span>
        <span class="o-status st-${o.status}">${st.label}</span>
      </summary>
      <div class="o-body">
        <ul class="o-items">${o.items
          .map((it) => `<li><span>${it.qty}× ${esc(it.name)}</span><span>${rupiah(it.qty * it.price)}</span></li>`)
          .join("")}</ul>
        <div class="o-sum">
          <div><span>Subtotal</span><span>${rupiah(o.subtotal)}</span></div>
          ${o.method !== "pickup" ? `<div><span>Ongkir</span><span>${o.shipping ? rupiah(o.shipping) : "GRATIS"}</span></div>` : ""}
          ${o.discount ? `<div><span>Diskon</span><span>-${rupiah(o.discount)}</span></div>` : ""}
          <div class="t"><span>Total</span><span>${rupiah(o.total)}</span></div>
        </div>
        <div class="o-info">
          ${o.phone ? `📱 ${esc(o.phone)}<br/>` : ""}
          ${o.address ? `📍 ${esc(o.address)}<br/>` : ""}
          💳 ${esc(o.payment)}${o.note ? `<br/>📝 ${esc(o.note)}` : ""}<br/>
          <small>Sumber: ${src}</small>
        </div>
        <div class="o-act">
          <select data-act="status" aria-label="Ubah status">
            ${Object.entries(STATUS)
              .map(([k, s]) => `<option value="${k}" ${k === o.status ? "selected" : ""}>${s.label}</option>`)
              .join("")}
          </select>
          ${o.phone ? `<a class="btn btn-wa" data-act="notify" target="_blank" rel="noopener" href="${notifyLink(o)}">Kabari Pembeli</a>` : ""}
          <button class="btn btn-outline danger" data-act="delete">Hapus</button>
        </div>
      </div>
    </details></li>`;
  }

  function notifyLink(o) {
    const first = o.name.split(" ")[0];
    const msg = {
      baru: `Halo kak ${first}, pesanan ${o.id} sudah kami terima ya. Total ${rupiah(o.total)}. Terima kasih! 🙏`,
      proses: `Halo kak ${first}, pesanan ${o.id} sedang kami siapkan${o.method === "pickup" ? "" : " dan segera diantar"} 🛵`,
      selesai: `Halo kak ${first}, pesanan ${o.id} sudah selesai. Terima kasih sudah jajan di ${CFG.store.name}! 🧡`,
      batal: `Halo kak ${first}, mohon maaf pesanan ${o.id} tidak dapat kami proses.`,
    }[o.status];
    return `https://wa.me/${waNumber(o.phone)}?text=${encodeURIComponent(msg)}`;
  }

  function updateOrder(id, fn) {
    const all = DB.load();
    const o = all.find((x) => x.id === id);
    if (!o) return;
    fn(o, all);
    DB.save(all);
  }

  function onOrderEvent(e) {
    const act = e.target.closest("[data-act]");
    if (e.target.id === "moreBtn") {
      listLimit += 30;
      render();
      return;
    }
    if (!act) return;
    const li = act.closest(".order");
    const id = li.dataset.id;
    if (act.dataset.act === "status" && e.type === "change") {
      updateOrder(id, (o) => (o.status = act.value));
      toast(`Status ${id}: ${STATUS[act.value].label}`);
      render();
      const again = $(`.order[data-id="${CSS.escape(id)}"] details`);
      if (again) again.open = true;
    } else if (act.dataset.act === "delete" && e.type === "click") {
      if (!confirm(`Hapus pesanan ${id}?`)) return;
      const all = DB.load().filter((o) => o.id !== id);
      DB.save(all);
      render();
    }
  }

  // ---------------------------------------------------------------- sheets
  function openSheet(id) {
    $$(".sheet").forEach((s) => (s.hidden = true));
    $(id).hidden = false;
    $("#backdrop").hidden = false;
    document.body.style.overflow = "hidden";
  }
  function closeSheets() {
    $$(".sheet").forEach((s) => (s.hidden = true));
    $("#backdrop").hidden = true;
    document.body.style.overflow = "";
  }

  function previewPaste() {
    const parsed = DB.parseWhatsApp($("#pasteInput").value);
    const p = $("#pastePreview");
    $("#importBtn").disabled = !parsed.length;
    if (!$("#pasteInput").value.trim()) {
      p.textContent = "";
      p.className = "paste-preview";
    } else if (!parsed.length) {
      p.textContent = "Format pesanan tidak dikenali. Pastikan menyalin pesan pesanan dari aplikasi Fast Cireng.";
      p.className = "paste-preview bad";
    } else {
      const total = parsed.reduce((a, o) => a + o.total, 0);
      p.textContent = `✓ ${parsed.length} pesanan terbaca: ${parsed.map((o) => o.name).join(", ")} · total ${rupiah(total)}`;
      p.className = "paste-preview ok";
    }
    return parsed;
  }

  function importPaste() {
    const parsed = previewPaste();
    if (!parsed.length) return;
    const { added, dup } = DB.add(parsed);
    closeSheets();
    $("#pasteInput").value = "";
    toast(added ? `${added} pesanan tersimpan${dup ? `, ${dup} sudah ada` : ""} ✅` : "Pesanan ini sudah tercatat sebelumnya");
    render();
  }

  function renderManual() {
    $("#mMenu").innerHTML = CFG.menu
      .map((m) => {
        const q = manualQty[m.id] || 0;
        return `<li class="${q ? "on" : ""}" data-id="${m.id}">
          <img src="${esc(m.image)}" alt="" />
          <div class="mm-info"><b>${esc(m.name)}</b><small>${rupiah(m.price)}</small></div>
          <div class="stepper"><button type="button" data-d="-1" aria-label="Kurangi">−</button><output>${q}</output><button type="button" class="inc" data-d="1" aria-label="Tambah">+</button></div>
        </li>`;
      })
      .join("");
    manualTotals();
  }

  function manualTotals() {
    const subtotal = CFG.menu.reduce((a, m) => a + (manualQty[m.id] || 0) * m.price, 0);
    const method = $('input[name="mMethod"]:checked').value;
    const d = CFG.delivery;
    const shipping = method === "delivery" && subtotal > 0 && !(d.freeShippingMin && subtotal >= d.freeShippingMin) ? d.fee : 0;
    $("#mTotal").textContent = rupiah(subtotal + shipping) + (shipping ? ` (ongkir ${rupiah(shipping)})` : "");
    $("#mSave").disabled = subtotal === 0;
    return { subtotal, shipping, method };
  }

  function saveManual() {
    const { subtotal, shipping, method } = manualTotals();
    if (!subtotal) return;
    const now = new Date();
    const id = `FC-${String(now.getFullYear()).slice(2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${Math.floor(Math.random() * 90 + 10)}`;
    DB.add([
      {
        id,
        at: now.toISOString(),
        name: $("#mName").value.trim() || "Pembeli langsung",
        phone: $("#mPhone").value.trim(),
        method,
        address: "",
        payment: $("#mPay").value,
        note: "",
        items: CFG.menu.filter((m) => manualQty[m.id]).map((m) => ({ name: m.name, unit: m.unit, qty: manualQty[m.id], price: m.price })),
        subtotal,
        shipping,
        discount: 0,
        total: subtotal + shipping,
        status: "selesai",
        source: "manual",
      },
    ]);
    Object.keys(manualQty).forEach((k) => delete manualQty[k]);
    $("#mName").value = $("#mPhone").value = "";
    closeSheets();
    toast("Pesanan manual tersimpan ✅");
    render();
  }

  // ---------------------------------------------------------------- data tools
  function exportCsv() {
    const all = DB.load();
    if (!all.length) return toast("Belum ada data untuk diunduh");
    const head = ["No Order", "Tanggal", "Jam", "Nama", "No WA", "Metode", "Alamat", "Pembayaran", "Item", "Jumlah Porsi", "Subtotal", "Ongkir", "Diskon", "Total", "Status", "Sumber"];
    const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = all.map((o) => {
      const d = new Date(o.at);
      return [
        o.id,
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        o.name,
        o.phone,
        o.method === "pickup" ? "Ambil sendiri" : "Diantar",
        o.address,
        o.payment,
        o.items.map((it) => `${it.qty}x ${it.name}`).join(", "),
        qtyOf(o),
        o.subtotal,
        o.shipping,
        o.discount,
        o.total,
        (STATUS[o.status] || STATUS.baru).label,
        o.source,
      ]
        .map(cell)
        .join(";");
    });
    download(`fastcireng-pesanan-${new Date().toISOString().slice(0, 10)}.csv`, "﻿sep=;\n" + [head.map(cell).join(";"), ...rows].join("\n"), "text/csv;charset=utf-8");
  }

  function backup() {
    const all = DB.load();
    download(`fastcireng-cadangan-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "fastreng", version: 1, orders: all }, null, 2), "application/json");
  }

  function restore(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        const list = (Array.isArray(data) ? data : data.orders || []).filter((o) => o && o.id && Array.isArray(o.items));
        if (!list.length) throw new Error("kosong");
        const { added, dup } = DB.add(list);
        toast(`${added} pesanan dipulihkan${dup ? `, ${dup} sudah ada` : ""}`);
        render();
      } catch (e) {
        toast("File cadangan tidak valid");
      }
    };
    r.readAsText(file);
  }

  function loadDemo() {
    const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    const names = ["Siti", "Budi", "Rina", "Andi", "Dewi", "Fajar", "Putri", "Rizky", "Nadia", "Yoga", "Ayu", "Dimas"];
    const hourWeights = [9, 10, 11, 12, 12, 13, 15, 16, 16, 17, 17, 18, 19, 19, 20];
    const weights = [6, 4, 2, 4, 2, 3, 2]; // favour the best sellers
    const pick = () => {
      let r = Math.random() * weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < CFG.menu.length; i++) if ((r -= weights[i % weights.length]) < 0) return CFG.menu[i];
      return CFG.menu[0];
    };
    const now = new Date();
    const list = [];
    for (let day = 29; day >= 0; day--) {
      const n = rnd(1, day < 7 ? 6 : 4);
      for (let k = 0; k < n; k++) {
        const d = new Date(startOfDay(now) - day * DAY);
        d.setHours(hourWeights[rnd(0, hourWeights.length - 1)], rnd(0, 59));
        if (d > now) continue;
        const items = new Map();
        for (let j = 0, c = rnd(1, 3); j < c; j++) {
          const m = pick();
          items.set(m.id, { name: m.name, unit: m.unit, qty: (items.get(m.id)?.qty || 0) + rnd(1, 3), price: m.price });
        }
        const it = [...items.values()];
        const subtotal = it.reduce((a, x) => a + x.qty * x.price, 0);
        const method = Math.random() < 0.72 ? "delivery" : "pickup";
        const shipping = method === "delivery" && subtotal < CFG.delivery.freeShippingMin ? CFG.delivery.fee : 0;
        const name = names[rnd(0, names.length - 1)];
        list.push({
          id: `FC-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${rnd(10, 99)}`,
          at: d.toISOString(),
          name,
          phone: "08" + rnd(1100000000, 1999999999),
          method,
          address: method === "delivery" ? `Jl. Contoh No. ${rnd(1, 99)}, ${CFG.store.city}` : "",
          payment: CFG.payments[[0, 0, 1, 2, 2][rnd(0, 4)] % CFG.payments.length].label,
          note: "",
          items: it,
          subtotal,
          shipping,
          discount: 0,
          total: subtotal + shipping,
          status: day === 0 ? ["baru", "proses", "selesai"][rnd(0, 2)] : Math.random() < 0.06 ? "batal" : "selesai",
          source: "demo",
        });
      }
    }
    DB.add(list);
    toast(`${list.length} pesanan contoh dimuat`);
    render();
  }

  // ---------------------------------------------------------------- init
  function unlock() {
    $("#gate").hidden = true;
    $("#dash").hidden = false;
    render();
  }

  function init() {
    const pin = String((CFG.admin && CFG.admin.pin) || "");
    let unlocked = !pin;
    try {
      unlocked = unlocked || sessionStorage.getItem(SESSION_KEY) === "1";
    } catch (e) {}
    if (unlocked) unlock();
    else setTimeout(() => $("#pinInput").focus(), 100);

    $("#pinForm").addEventListener("submit", (e) => {
      e.preventDefault();
      if ($("#pinInput").value === pin) {
        try {
          sessionStorage.setItem(SESSION_KEY, "1");
        } catch (err) {}
        unlock();
      } else {
        $("#pinErr").textContent = "PIN salah, coba lagi.";
        $("#pinInput").value = "";
      }
    });
    $("#lockBtn").addEventListener("click", () => {
      try {
        sessionStorage.removeItem(SESSION_KEY);
      } catch (e) {}
      location.reload();
    });

    $$(".filters button").forEach((b) =>
      b.addEventListener("click", () => {
        range = b.dataset.range;
        listLimit = 30;
        $$(".filters button").forEach((x) => x.classList.toggle("active", x === b));
        render();
      })
    );
    $("#statusRow").addEventListener("click", (e) => {
      const b = e.target.closest("[data-status]");
      if (!b) return;
      statusFilter = statusFilter === b.dataset.status ? "" : b.dataset.status;
      $("#statusFilter").value = statusFilter;
      render();
      $(".orders").scrollIntoView({ behavior: "smooth" });
    });
    $("#statusFilter").addEventListener("change", (e) => {
      statusFilter = e.target.value;
      render();
    });
    $("#orderSearch").addEventListener("input", (e) => {
      search = e.target.value;
      render();
    });
    $("#orderList").addEventListener("change", onOrderEvent);
    $("#orderList").addEventListener("click", onOrderEvent);

    // add orders
    $("#pasteBtn").addEventListener("click", () => {
      openSheet("#pasteSheet");
      previewPaste();
      setTimeout(() => $("#pasteInput").focus(), 200);
    });
    $("#pasteInput").addEventListener("input", previewPaste);
    $("#clipBtn").addEventListener("click", async () => {
      try {
        $("#pasteInput").value = await navigator.clipboard.readText();
        previewPaste();
      } catch (e) {
        toast("Izin clipboard ditolak. Tempel manual (tekan lama → Tempel).");
      }
    });
    $("#importBtn").addEventListener("click", importPaste);

    $("#mPay").innerHTML = CFG.payments.map((p) => `<option>${esc(p.label)}</option>`).join("");
    $("#manualBtn").addEventListener("click", () => {
      renderManual();
      openSheet("#manualSheet");
    });
    $("#mMenu").addEventListener("click", (e) => {
      const b = e.target.closest("[data-d]");
      if (!b) return;
      const id = b.closest("li").dataset.id;
      manualQty[id] = Math.max(0, Math.min(99, (manualQty[id] || 0) + Number(b.dataset.d)));
      renderManual();
    });
    $("#mMethod").addEventListener("change", manualTotals);
    $("#mSave").addEventListener("click", saveManual);

    $$("[data-close]").forEach((b) => b.addEventListener("click", closeSheets));
    $("#backdrop").addEventListener("click", closeSheets);
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeSheets());

    // tools
    $("#demoBtn").addEventListener("click", loadDemo);
    $("#csvBtn").addEventListener("click", exportCsv);
    $("#backupBtn").addEventListener("click", backup);
    $("#restoreInput").addEventListener("change", (e) => {
      if (e.target.files[0]) restore(e.target.files[0]);
      e.target.value = "";
    });
    $("#wipeBtn").addEventListener("click", () => {
      if (!confirm("Hapus SEMUA data pesanan di perangkat ini? Unduh cadangan dulu kalau perlu.")) return;
      DB.save([]);
      render();
      toast("Semua data pesanan dihapus");
    });

    bindTooltips();
    // Orders placed from the shop tab on this device show up live.
    window.addEventListener("storage", (e) => e.key === DB.KEY && render());
    let rt;
    window.addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => !$("#dash").hidden && render(), 200);
    });
  }

  init();
})();
