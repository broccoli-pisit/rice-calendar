"use strict";
/* ================= storage ================= */
const STORE_KEY = "riceCal.v1";
let db = (() => {
  try { const d = JSON.parse(localStorage.getItem(STORE_KEY)); if (d && Array.isArray(d.plots)) return d; } catch (e) {}
  return { plots: [], zones: null };
})();
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch (e) { alert("บันทึกไม่สำเร็จ: " + e.message); } };
const ZONES = () => db.zones || DEFAULT_ZONES;

/* ================= utils ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const MONTHS_FULL = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const LV_COLOR = { g:"#2e8b3e", y:"#f2c230", r:"#e0483e" };
const LV_NAME = { g:"เขียว", y:"เหลือง", r:"แดง" };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmt = d => `${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getFullYear() + 543).slice(2)}`;
const fmtLong = d => `${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;
const fmtShort = d => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const parseIso = s => { const [y,m,d] = s.split("-").map(Number); return new Date(y, m-1, d); };
const diffDays = (a, b) => Math.round((b - a) / 86400000);
const jan1 = y => new Date(y, 0, 1);
const yearLen = y => diffDays(jan1(y), jan1(y+1));
const doyRef = (m, d) => diffDays(new Date(2025,0,1), new Date(2025,m-1,d));
const today = () => { const t = new Date(); t.setHours(0,0,0,0); return t; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const num = n => (Math.round(n * 10) / 10).toLocaleString("th-TH");

function zoneOf(date) {
  const k = (date.getMonth()+1)*100 + date.getDate();
  return ZONES().find(z => k >= z.from[0]*100+z.from[1] && k <= z.to[0]*100+z.to[1]) || { lv:"y", t:"ไม่ระบุ" };
}

/* ================= schedule ================= */
function schedule(plan) {
  const p = PROGRAMS[plan.method].groups[plan.g], H = p.harvest;
  const P = parseIso(plan.plant);
  const water = p.water.map(([s,e,t,l]) => ({ s, e: e ?? H, t, l }));
  const fert = p.fert.map(([d,stage,type,kg,max], i) => ({ d, n:i+1, stage, type, kg, max:!!max,
    rate: `${max ? "ไม่เกิน " : ""}${kg} กก./ไร่` }));
  const foliar = [
    { s:H-65, e:H-55, l:"ปุ๋ยทางใบเสริม: แตกกอ–ก่อนสร้างรวง (สูตรเสมอ เช่น 20-20-20)" },
    { s:H-45, e:H-35, l:"ปุ๋ยทางใบเสริม: ระยะตั้งท้อง (ฟอสฟอรัส/โพแทสเซียมสูง + แคลเซียม-โบรอน)" },
    { s:H-25, e:H-15, l:"ปุ๋ยทางใบเสริม: ระยะน้ำนม–เมล็ดเต่ง (โพแทสเซียมสูง เช่น 0-0-50)" }
  ];
  const harvestDate = addDays(P, H);
  return { p, H, P, water, fert, foliar, harvestDate, zone: zoneOf(harvestDate), flower: addDays(P, H-30) };
}
function fertTotals(sc, area) {
  let urea = 0, npk = 0;
  sc.fert.forEach(f => {
    if (f.type === "mix") { urea += f.kg/2; npk += f.kg/2; }
    else if (f.type === "npk") npk += f.kg; else urea += f.kg;
  });
  return { urea: urea*area, npk: npk*area, ureaPer: urea, npkPer: npk };
}
function rowsOf(sc, withFoliar) {
  const rows = [];
  sc.water.forEach(w => rows.push({ s:w.s, e:w.e, ord:0, kind:w.t, txt:esc(w.l) }));
  sc.fert.forEach(f => rows.push({ s:f.d, e:f.d, ord:1, kind:"fert",
    txt:`<b>ใส่ปุ๋ยครั้งที่ ${f.n}</b> (${f.stage}): ${FERT_NAME[f.type]} <b>${f.rate}</b>` }));
  rows.push({ s:sc.H, e:sc.H, ord:2, kind:"harvest", txt:`<b>🌾 เก็บเกี่ยว</b> <span class="badge lv-${sc.zone.lv}">${esc(sc.zone.t)}</span>` });
  if (withFoliar) sc.foliar.forEach(f => rows.push({ s:f.s, e:f.e, ord:3, kind:"foliar", txt:f.l }));
  return rows.sort((a,b) => a.s - b.s || a.ord - b.ord);
}
const KIND_COLOR = { wet:"#2f8fd8", dry:"#d9473f", fert:"#1f2a1f", harvest:"#2e8b3e", foliar:"#7ab648" };

function status(sc) {
  const d = diffDays(sc.P, today());
  if (d < 0) return { d, stage:`อีก ${-d} วันถึงวันปลูก`, next: sc.fert[0] };
  if (d > sc.H) return { d, stage:"เก็บเกี่ยวแล้ว", next:null, done:true };
  const w = sc.water.find(w => d >= w.s && d < w.e) || sc.water[sc.water.length-1];
  const next = sc.fert.find(f => f.d >= d);
  return { d, stage:`อายุ ${d} วัน · ${w.t === "wet" ? "ขังน้ำ" : "ปล่อยแห้ง"}`, next };
}

/* ================= table ================= */
function tableHtml(sc, withFoliar, highlightToday = true) {
  const dNow = diffDays(sc.P, today());
  return `<table class="tbl"><thead><tr><th>วันที่</th><th>นับจากวันปลูก</th><th>กิจกรรม</th></tr></thead><tbody>` +
    rowsOf(sc, withFoliar).map(r => {
      const d1 = addDays(sc.P, r.s), d2 = addDays(sc.P, r.e);
      const now = highlightToday && dNow >= r.s && dNow < Math.max(r.e, r.s+1);
      const date = r.s === r.e ? fmt(d1) : `${fmtShort(d1)} – ${fmt(d2)}`;
      const day = r.s === r.e ? `วันที่ ${r.s}` : `วันที่ ${r.s}–${r.e}`;
      return `<tr class="${now?"now":""}"><td class="d">${date}</td><td class="m">${day}</td><td><span class="dot" style="background:${KIND_COLOR[r.kind]}"></span>${r.txt}</td></tr>`;
    }).join("") + `</tbody></table>`;
}

/* ================= wheel ================= */
const C = 260, TAU = Math.PI * 2;
const ang = frac => frac*TAU - Math.PI/2;
const pt = (r, a) => [C + r*Math.cos(a), C + r*Math.sin(a)];
const rot = a => { let d = a*180/Math.PI + 90; d = ((d%360)+360)%360; return (d > 90 && d < 270) ? d - 180 : d; };
function arc(r1, r2, a1, a2) {
  if (a2 - a1 >= TAU - 1e-6) a2 = a1 + TAU - 1e-4;
  const large = (a2 - a1) > Math.PI ? 1 : 0;
  const [x1,y1] = pt(r2,a1), [x2,y2] = pt(r2,a2), [x3,y3] = pt(r1,a2), [x4,y4] = pt(r1,a1);
  return `M${x1},${y1} A${r2},${r2} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${r1},${r1} 0 ${large} 0 ${x4},${y4}Z`;
}
function wheelSvg(sc) {
  let s = `<svg class="wheel" viewBox="0 0 520 520" aria-label="วงล้อปฏิทินปลูกข้าว">`;
  ZONES().forEach(z => {
    s += `<path d="${arc(218,246,ang(doyRef(...z.from)/365),ang((doyRef(...z.to)+1)/365))}" fill="${LV_COLOR[z.lv]}" opacity=".9"/>`;
  });
  for (let m = 0; m < 12; m++) {
    const a = ang(doyRef(m+1,1)/365), [x1,y1] = pt(212,a), [x2,y2] = pt(252,a);
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="2"/>`;
    const am = ang((doyRef(m+1,1)+15)/365), [tx,ty] = pt(202,am);
    s += `<text x="${tx}" y="${ty}" font-size="12" text-anchor="middle" dominant-baseline="middle" fill="#555" transform="rotate(${rot(am)} ${tx} ${ty})">${MONTHS_FULL[m]}</text>`;
  }
  s += `<circle cx="${C}" cy="${C}" r="188" fill="#fbfaf6" stroke="#e4e0d4"/>`;
  const L = yearLen(sc.P.getFullYear()), p0 = diffDays(jan1(sc.P.getFullYear()), sc.P) / L;
  const A = d => ang(p0 + d/L);
  s += `<path d="${arc(40,150,A(0),A(sc.H))}" fill="${sc.p.color}" opacity=".92"/>`;
  sc.water.forEach(w => {
    s += `<path d="${arc(152,182,A(w.s),A(w.e))}" fill="${KIND_COLOR[w.t]}" stroke="#fff" stroke-width="1"/>`;
    if (w.e - w.s >= 8) {
      const am = A((w.s+w.e)/2), [tx,ty] = pt(167,am);
      s += `<text x="${tx}" y="${ty}" font-size="11" fill="#fff" font-weight="700" text-anchor="middle" dominant-baseline="middle" transform="rotate(${rot(am)} ${tx} ${ty})">${w.t==="wet"?"น้ำ":"แห้ง"} ${w.e-w.s} วัน</text>`;
    }
  });
  sc.fert.forEach(f => {
    const a = A(f.d), [x,y] = pt(122,a), [lx,ly] = pt(90,a);
    s += `<circle cx="${x}" cy="${y}" r="13" fill="#fff" stroke="#1f2a1f" stroke-width="2"/><text x="${x}" y="${y+1}" font-size="12" font-weight="700" text-anchor="middle" dominant-baseline="middle">${f.n}</text>`;
    s += `<text x="${lx}" y="${ly}" font-size="10" fill="#fff" font-weight="700" text-anchor="middle" dominant-baseline="middle">${f.d}ว.</text>`;
  });
  const arrow = a => {
    const [x,y] = pt(256,a), [bx,by] = pt(30,a), [h1x,h1y] = pt(242,a-0.04), [h2x,h2y] = pt(242,a+0.04);
    return `<line x1="${bx}" y1="${by}" x2="${x}" y2="${y}" stroke="#111" stroke-width="5" stroke-linecap="round"/><polygon points="${x},${y} ${h1x},${h1y} ${h2x},${h2y}" fill="#111" stroke="#111" stroke-width="4" stroke-linejoin="round"/>`;
  };
  s += arrow(A(0)) + arrow(A(sc.H));
  s += `<circle cx="${C}" cy="${C}" r="34" fill="#111"/><text x="${C}" y="${C-6}" fill="#fff" font-size="11" text-anchor="middle">ปลูก</text><text x="${C}" y="${C+10}" fill="#fff" font-size="12" font-weight="700" text-anchor="middle">${fmtShort(sc.P)}</text>`;
  return s + `</svg>`;
}

function barHtml(sc) {
  const dNow = diffDays(sc.P, today());
  let b = sc.water.map(w => `<div style="width:${(w.e-w.s)/sc.H*100}%;background:${KIND_COLOR[w.t]}">${w.e-w.s>=6?(w.e-w.s)+"ว.":""}</div>`).join("");
  b += sc.fert.map(f => `<span class="fmk" style="left:${f.d/sc.H*100}%">▼${f.n}<i></i></span>`).join("");
  if (dNow >= 0 && dNow <= sc.H) b += `<span class="todaymk" style="left:${dNow/sc.H*100}%">วันนี้</span>`;
  return `<div class="bar">${b}</div><div class="legend"><span class="dot" style="background:#2f8fd8"></span>ขังน้ำ/รักษาระดับน้ำ <span class="dot" style="background:#d9473f"></span>ปล่อยแห้ง ▼ = ใส่ปุ๋ย</div>`;
}

function stripSvg(plan, year) {
  const L = yearLen(year), W = 730, H = PROGRAMS[plan.method].groups[plan.g].harvest;
  let s = `<svg class="strip" viewBox="0 0 730 70" preserveAspectRatio="none">`, runs = [], cur = null;
  for (let i = 0; i < L; i++) {
    const z = zoneOf(addDays(jan1(year), i + H));
    s += `<rect x="${i/L*W}" y="0" width="${W/L+0.6}" height="44" fill="${LV_COLOR[z.lv]}"/>`;
    if (!cur || cur.lv !== z.lv) { cur = { lv:z.lv, a:i, b:i }; runs.push(cur); } else cur.b = i;
  }
  for (let m = 0; m < 12; m++) {
    const x = diffDays(jan1(year), new Date(year,m,1)) / L * W;
    s += `<line x1="${x}" y1="0" x2="${x}" y2="50" stroke="#fff" stroke-width="1.5"/><text x="${x+3}" y="64" font-size="11" fill="#555">${MONTHS[m]}</text>`;
  }
  const P = parseIso(plan.plant), px = diffDays(jan1(year), P) / L * W;
  if (px >= 0 && px <= W) s += `<rect x="${px-2}" y="-2" width="4" height="50" fill="#111"/>`;
  s += `</svg>`;
  const name = { g:"🟢 เกี่ยวช่วงเหมาะสม", y:"🟡 เสี่ยง (เลือกพันธุ์ทนสภาพอากาศ)", r:"🔴 หลีกเลี่ยง" };
  const ranges = ["g","y","r"].map(lv => `<div><b>${name[lv]}:</b> ` +
    runs.filter(r => r.lv === lv).map(r => `<span>${fmtShort(addDays(jan1(year),r.a))}–${fmtShort(addDays(jan1(year),r.b))}</span>`).join("") + `</div>`).join("");
  return { svg: s, ranges };
}

/* ================= planner (shared by #plan and #plot/ID) ================= */
function plannerView(el, plan, opts) {
  const ui = { foliar: false };
  el.innerHTML = `
  <div class="grid">
    <section class="stack">
      ${opts.header || ""}
      <div class="card">
        <div class="seg" data-r="method">
          ${Object.entries(PROGRAMS).map(([k,v]) => `<button data-m="${k}">${v.name}</button>`).join("")}
        </div>
        <div class="sub" data-r="methodLabel"></div>
        <div class="groups" data-r="groups"></div>
        <div class="row"><label>วันปลูก</label><input type="date" data-r="pdate"><select data-r="year"></select></div>
        <input type="range" data-r="slider" min="0" max="364" aria-label="เลื่อนวันปลูก">
        <div class="row"><label>หรือ อยากเกี่ยววันที่</label><input type="date" data-r="hdate"><button class="btn ghost" data-r="back">คำนวณวันปลูกย้อนกลับ</button></div>
      </div>
      <div class="card"><div data-r="wheel"></div><div class="hint">ลากหมุนวงล้อเพื่อเลื่อนวันปลูก</div></div>
    </section>
    <section class="stack">
      <div class="card"><h2>สรุปแผน</h2><div class="summary" data-r="summary"></div><div data-r="bar"></div></div>
      <div class="card"><h2>ตารางงานตามวันที่</h2>
        <label class="chk"><input type="checkbox" data-r="foliar"> แสดงจังหวะฉีดปุ๋ยทางใบเสริม (ค่าประมาณทั่วไป ไม่ได้มาจากวงล้อ)</label>
        <div data-r="table"></div>
        <div class="note">• ฤดูฝน: ปล่อยน้ำออกก่อนเก็บเกี่ยว ~15 วัน • ปริมาณปุ๋ยควรปรับตามค่าวิเคราะห์ดิน • ช่วงปล่อยแห้ง ให้เติมน้ำเมื่อข้าวแสดงอาการขาดน้ำ หรือตั้งท้องกลมใกล้ออกรวง</div>
      </div>
      <div class="card"><h2>ช่วงวันปลูกที่แนะนำทั้งปี</h2><div data-r="strip"></div>
        <div class="sub">สีของแต่ละวัน = ความเสี่ยงของวันเกี่ยว ถ้าปลูกวันนั้น · แตะแถบเพื่อเลือกวันปลูก</div><div class="ranges" data-r="ranges"></div></div>
    </section>
  </div>`;
  const R = n => el.querySelector(`[data-r="${n}"]`);
  const ys = R("year"), ty = today().getFullYear();
  for (let y = ty-2; y <= ty+2; y++) ys.insertAdjacentHTML("beforeend", `<option value="${y}">พ.ศ. ${y+543}</option>`);

  const set = patch => { Object.assign(plan, patch); opts.onChange && opts.onChange(plan); draw(); };
  $$("button", R("method")).forEach(b => b.onclick = () => set({ method: b.dataset.m }));
  R("pdate").onchange = e => e.target.value && set({ plant: e.target.value });
  ys.onchange = () => { const P = parseIso(plan.plant); set({ plant: iso(new Date(+ys.value, P.getMonth(), Math.min(P.getDate(),28))) }); };
  R("slider").oninput = e => set({ plant: iso(addDays(jan1(+ys.value), +e.target.value)) });
  R("back").onclick = () => { const v = R("hdate").value; if (v) set({ plant: iso(addDays(parseIso(v), -PROGRAMS[plan.method].groups[plan.g].harvest)) }); };
  R("foliar").onchange = e => { ui.foliar = e.target.checked; draw(); };

  // wheel drag
  let dragging = false;
  const fromEvent = e => {
    const svg = $("svg", R("wheel")); if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left)/r.width*520 - C, y = (e.clientY - r.top)/r.height*520 - C;
    let f = (Math.atan2(y,x) + Math.PI/2) / TAU; if (f < 0) f += 1;
    const yr = parseIso(plan.plant).getFullYear();
    const nd = iso(addDays(jan1(yr), Math.round(f*(yearLen(yr)-1))));
    if (nd !== plan.plant) set({ plant: nd });
  };
  const wh = R("wheel");
  wh.addEventListener("pointerdown", e => { dragging = true; wh.setPointerCapture(e.pointerId); fromEvent(e); });
  wh.addEventListener("pointermove", e => dragging && fromEvent(e));
  wh.addEventListener("pointerup", () => dragging = false);
  wh.addEventListener("pointercancel", () => dragging = false);
  R("strip").addEventListener("click", e => {
    const svg = $("svg", R("strip")), r = svg.getBoundingClientRect(), yr = parseIso(plan.plant).getFullYear();
    set({ plant: iso(addDays(jan1(yr), Math.round((e.clientX - r.left)/r.width*(yearLen(yr)-1)))) });
  });

  function draw() {
    const sc = schedule(plan), P = sc.P, st = status(sc);
    $$("button", R("method")).forEach(b => b.classList.toggle("on", b.dataset.m === plan.method));
    R("methodLabel").textContent = PROGRAMS[plan.method].label;
    R("groups").innerHTML = PROGRAMS[plan.method].groups.map((g,i) =>
      `<button class="grp ${i===plan.g?"on":""}" style="background:${g.color}" data-i="${i}"><b>อายุ ${g.age}</b>${g.varieties}<br><small>เกี่ยวที่ ~${g.harvest} วัน</small></button>`).join("");
    $$(".grp", R("groups")).forEach(b => b.onclick = () => set({ g: +b.dataset.i }));
    if (![...ys.options].some(o => +o.value === P.getFullYear())) ys.insertAdjacentHTML("beforeend", `<option value="${P.getFullYear()}">พ.ศ. ${P.getFullYear()+543}</option>`);
    ys.value = P.getFullYear();
    R("pdate").value = plan.plant;
    R("slider").max = yearLen(P.getFullYear()) - 1;
    R("slider").value = diffDays(jan1(P.getFullYear()), P);
    R("wheel").innerHTML = wheelSvg(sc);
    const area = +plan.area || 0, tot = fertTotals(sc, area || 1);
    R("summary").innerHTML = `
      <div class="stat"><small>วันปลูก</small><b>${fmt(P)}</b></div>
      <div class="stat"><small>วันเก็บเกี่ยว (${sc.H} วัน)</small><b>${fmt(sc.harvestDate)}</b></div>
      <div class="stat"><small>ความเสี่ยงวันเกี่ยว</small><span class="badge lv-${sc.zone.lv}">${LV_NAME[sc.zone.lv]} · ${esc(sc.zone.t)}</span></div>
      <div class="stat"><small>ออกดอกโดยประมาณ</small><b>${fmt(sc.flower)}</b></div>
      <div class="stat"><small>ทิ้งน้ำ (ฤดูฝน ~15 วันก่อนเกี่ยว)</small><b>${fmt(addDays(sc.harvestDate,-10))}</b><small>ฤดูฝน: ${fmt(addDays(sc.harvestDate,-15))}</small></div>
      <div class="stat"><small>สถานะวันนี้</small><b class="sm">${st.stage}</b></div>
      <div class="stat wide"><small>ปุ๋ยรวมทั้งฤดู ${area ? `(${num(area)} ไร่)` : "(ต่อ 1 ไร่)"}</small><b class="sm">ยูเรีย ~${num(tot.urea)} กก. · สามสูตร ~${num(tot.npk)} กก.</b></div>`;
    R("bar").innerHTML = barHtml(sc);
    R("table").innerHTML = tableHtml(sc, ui.foliar);
    const st2 = stripSvg(plan, P.getFullYear());
    R("strip").innerHTML = st2.svg; R("ranges").innerHTML = st2.ranges;
  }
  draw();
  return draw;
}

/* ================= views ================= */
const app = $("#app");
function newPlot(extra = {}) {
  return Object.assign({ id: uid(), name: `แปลงที่ ${db.plots.length + 1}`, area: "", method: "transplant", g: 0,
    plant: iso(today()), note: "", created: Date.now() }, extra);
}

function viewHome() {
  const plots = db.plots;
  const cards = plots.map(pl => {
    const sc = schedule(pl), st = status(sc);
    const pct = Math.max(0, Math.min(100, st.d / sc.H * 100));
    return `<a class="plot card" href="#plot/${pl.id}" style="border-left:6px solid ${sc.p.color}">
      <div class="ph"><b>${esc(pl.name)}</b><span class="badge lv-${sc.zone.lv}">${LV_NAME[sc.zone.lv]}</span></div>
      <div class="sub">${PROGRAMS[pl.method].name} · อายุ ${sc.p.age}${pl.area ? ` · ${num(pl.area)} ไร่` : ""}</div>
      <div class="prog"><i style="width:${pct}%;background:${sc.p.color}"></i></div>
      <div class="pm"><span>ปลูก ${fmt(sc.P)}</span><span>เกี่ยว ${fmt(sc.harvestDate)}</span></div>
      <div class="sm">${st.stage}${st.next ? ` · ถัดไป: ปุ๋ยครั้งที่ ${st.next.n} วันที่ ${fmt(addDays(sc.P, st.next.d))}` : ""}</div>
    </a>`;
  }).join("");
  app.innerHTML = `
    <div class="wrap">
      <div class="headrow"><h1>แปลงของฉัน</h1>
        <div class="actions"><button class="btn" id="add">+ เพิ่มแปลง</button>${plots.length ? `<a class="btn ghost" href="#report/all">📄 รายงานทุกแปลง</a>` : ""}</div></div>
      ${plots.length ? `<div class="plots">${cards}</div>` :
        `<div class="card empty"><p>ยังไม่มีแปลง กด <b>+ เพิ่มแปลง</b> เพื่อเริ่มวางแผน หรือไปที่ <a href="#plan">วางแผน</a> เพื่อลองเลื่อนวันดูก่อน</p></div>`}
      ${upcomingHtml()}
    </div>`;
  $("#add").onclick = () => { const p = newPlot(); db.plots.push(p); save(); location.hash = `plot/${p.id}`; };
}

function upcomingHtml() {
  const t = today(), items = [];
  db.plots.forEach(pl => {
    const sc = schedule(pl);
    rowsOf(sc, false).forEach(r => {
      const d = addDays(sc.P, r.s), dd = diffDays(t, d);
      if (dd >= 0 && dd <= 14 && (r.kind !== "dry" || r.s > 0))
        items.push({ d, dd, pl, txt: r.txt, kind: r.kind });
    });
  });
  if (!items.length) return "";
  items.sort((a,b) => a.d - b.d);
  return `<div class="card"><h2>งานใน 14 วันข้างหน้า</h2><table class="tbl"><tbody>` +
    items.map(i => `<tr><td class="d">${fmt(i.d)}<div class="m">${i.dd === 0 ? "วันนี้" : `อีก ${i.dd} วัน`}</div></td><td><b>${esc(i.pl.name)}</b></td><td><span class="dot" style="background:${KIND_COLOR[i.kind]}"></span>${i.txt}</td></tr>`).join("") +
    `</tbody></table></div>`;
}

function viewPlan() {
  const tmp = (() => { try { return JSON.parse(sessionStorage.getItem("riceCal.plan")); } catch (e) { return null; } })()
    || { method:"transplant", g:0, plant: iso(today()) };
  app.innerHTML = `<div class="wrap" id="pv"></div>`;
  plannerView($("#pv"), tmp, {
    header: `<div class="headrow"><h1>วางแผน (ทดลอง)</h1><button class="btn" id="saveAs">บันทึกเป็นแปลงใหม่</button></div>`,
    onChange: p => { try { sessionStorage.setItem("riceCal.plan", JSON.stringify(p)); } catch (e) {} }
  });
  $("#saveAs").onclick = () => { const p = newPlot({ method: tmp.method, g: tmp.g, plant: tmp.plant }); db.plots.push(p); save(); location.hash = `plot/${p.id}`; };
}

function viewPlot(id) {
  const pl = db.plots.find(p => p.id === id);
  if (!pl) { app.innerHTML = `<div class="wrap"><div class="card">ไม่พบแปลงนี้ <a href="#home">กลับหน้าแรก</a></div></div>`; return; }
  app.innerHTML = `<div class="wrap" id="pv"></div>`;
  const redraw = plannerView($("#pv"), pl, {
    header: `<div class="card">
      <div class="headrow"><a href="#home" class="back">← แปลงของฉัน</a>
        <div class="actions"><a class="btn" href="#report/${pl.id}">📄 รายงาน / PDF</a><button class="btn ghost danger" id="del">ลบแปลง</button></div></div>
      <div class="form">
        <label>ชื่อแปลง<input id="f-name" value="${esc(pl.name)}"></label>
        <label>พื้นที่ (ไร่)<input id="f-area" type="number" min="0" step="0.25" value="${esc(pl.area)}"></label>
        <label class="full">บันทึกเพิ่มเติม<textarea id="f-note" rows="2" placeholder="เช่น พันธุ์ที่ใช้จริง ที่ตั้งแปลง ผลวิเคราะห์ดิน">${esc(pl.note)}</textarea></label>
      </div><div class="sub" id="saved">บันทึกอัตโนมัติในเครื่องนี้</div></div>`,
    onChange: () => { save(); flash(); }
  });
  const flash = () => { const s = $("#saved"); if (s) { s.textContent = "✓ บันทึกแล้ว"; clearTimeout(flash.t); flash.t = setTimeout(() => s.textContent = "บันทึกอัตโนมัติในเครื่องนี้", 1200); } };
  ["name","area","note"].forEach(k => $(`#f-${k}`).oninput = e => { pl[k] = e.target.value; save(); flash(); if (k === "area") redraw(); });
  $("#del").onclick = () => { if (confirm(`ลบ "${pl.name}"?`)) { db.plots = db.plots.filter(p => p.id !== id); save(); location.hash = "home"; } };
}

function reportPlotHtml(pl) {
  const sc = schedule(pl), area = +pl.area || 0, tot = fertTotals(sc, area || 1);
  const fertRows = sc.fert.map(f => {
    const kg = f.kg * (area || 1);
    return `<tr><td>${f.n}</td><td class="d">${fmt(addDays(sc.P, f.d))}</td><td>วันที่ ${f.d}</td><td>${f.stage}</td><td>${FERT_NAME[f.type]}</td><td>${f.rate}</td><td><b>${f.max ? "≤ " : ""}${num(kg)} กก.</b></td></tr>`;
  }).join("");
  return `<article class="report">
    <header class="rh"><div><div class="rt">รายงานแผนการปลูกข้าว</div><h1>${esc(pl.name)}</h1></div>
      <div class="rmeta">ออกรายงาน ${fmtLong(today())}<br>ปฏิทินล้นเกวียน</div></header>
    <div class="rinfo">
      <div><small>วิธีปลูก</small><b>${PROGRAMS[pl.method].name}</b><small>${PROGRAMS[pl.method].label}</small></div>
      <div><small>กลุ่มพันธุ์</small><b>อายุ ${sc.p.age}</b><small>${sc.p.varieties}</small></div>
      <div><small>พื้นที่</small><b>${area ? num(area) + " ไร่" : "-"}</b></div>
      <div><small>วันปลูก</small><b>${fmtLong(sc.P)}</b></div>
      <div><small>วันเก็บเกี่ยว (${sc.H} วัน)</small><b>${fmtLong(sc.harvestDate)}</b></div>
      <div><small>ความเสี่ยงวันเกี่ยว</small><b><span class="badge lv-${sc.zone.lv}">${LV_NAME[sc.zone.lv]} · ${esc(sc.zone.t)}</span></b></div>
      <div><small>ออกดอกโดยประมาณ</small><b>${fmtLong(sc.flower)}</b></div>
      <div><small>ทิ้งน้ำเตรียมเกี่ยว</small><b>${fmtLong(addDays(sc.harvestDate,-10))}</b><small>ฤดูฝน: ${fmt(addDays(sc.harvestDate,-15))}</small></div>
    </div>
    <div class="rgrid"><div class="rwheel">${wheelSvg(sc)}</div>
      <div><h2>แผนการใส่ปุ๋ย</h2>
        <table class="tbl small"><thead><tr><th>#</th><th>วันที่</th><th>นับ</th><th>ระยะ</th><th>ปุ๋ย</th><th>อัตรา</th><th>${area ? `รวม ${num(area)} ไร่` : "ต่อไร่"}</th></tr></thead><tbody>${fertRows}</tbody></table>
        <p class="tot">รวมทั้งฤดู: <b>ยูเรีย ~${num(tot.urea)} กก.</b> (${num(tot.urea/50)} กระสอบ 50 กก.) · <b>สามสูตร ~${num(tot.npk)} กก.</b> (${num(tot.npk/50)} กระสอบ)</p>
        ${barHtml(sc)}
      </div></div>
    <h2>ตารางงานตามวันที่</h2>
    ${tableHtml(sc, true, false)}
    ${pl.note ? `<h2>บันทึก</h2><p class="pnote">${esc(pl.note)}</p>` : ""}
    <p class="note">หมายเหตุ: ข้อมูลน้ำและปุ๋ยอ้างอิงวงล้อ "ปฏิทินล้นเกวียน" · ปริมาณปุ๋ยควรปรับตามค่าวิเคราะห์ดิน · ปุ๋ยทางใบเป็นค่าประมาณทั่วไปเพื่อเสริม (ฉีดเช้า 06:00–09:00 น.) · ช่วงความเสี่ยงเป็นค่าประมาณ โปรดเทียบกับวงล้อจริง</p>
  </article>`;
}

function viewReport(id) {
  const list = id === "all" ? db.plots : db.plots.filter(p => p.id === id);
  if (!list.length) { app.innerHTML = `<div class="wrap"><div class="card">ไม่พบข้อมูล <a href="#home">กลับหน้าแรก</a></div></div>`; return; }
  const title = id === "all" ? "รายงานทุกแปลง" : `รายงาน-${list[0].name}`;
  document.title = `${title} ${iso(today())}`;
  app.innerHTML = `<div class="wrap">
    <div class="headrow no-print"><a href="${id === "all" ? "#home" : `#plot/${id}`}" class="back">← กลับ</a>
      <div class="actions"><button class="btn" id="print">🖨️ พิมพ์ / บันทึกเป็น PDF</button></div></div>
    <div class="card no-print sub">กดปุ่มด้านบน แล้วเลือกเครื่องพิมพ์เป็น <b>"บันทึกเป็น PDF" / "Save as PDF"</b> (บนมือถือ: แชร์ → พิมพ์ → บันทึก PDF)</div>
    ${list.map(reportPlotHtml).join("")}</div>`;
  $("#print").onclick = () => window.print();
}

function viewSettings() {
  const zs = ZONES();
  const md = ([m,d]) => `2025-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  app.innerHTML = `<div class="wrap">
    <h1>ตั้งค่า</h1>
    <div class="card"><h2>สำรอง / ย้ายข้อมูล</h2>
      <p class="sub">ข้อมูลเก็บไว้ในเบราว์เซอร์ของเครื่องนี้เท่านั้น ถ้าจะย้ายไปเครื่องอื่นหรือกันข้อมูลหาย ให้ส่งออกเป็นไฟล์เก็บไว้</p>
      <div class="actions"><button class="btn" id="exp">⬇️ ส่งออกข้อมูล (.json)</button>
        <label class="btn ghost">⬆️ นำเข้าข้อมูล<input type="file" id="imp" accept="application/json" hidden></label></div></div>
    <div class="card"><h2>ช่วงความเสี่ยง ณ วันเก็บเกี่ยว</h2>
      <p class="sub">ค่าเริ่มต้นประมาณจากวงล้อ ปรับให้ตรงกับวงล้อจริงหรือพื้นที่ของคุณได้ (ใช้แค่วันและเดือน ไม่สนปี)</p>
      <table class="tbl" id="zt"><thead><tr><th>ตั้งแต่</th><th>ถึง</th><th>ระดับ</th><th>คำอธิบาย</th><th></th></tr></thead><tbody>
      ${zs.map((z,i) => `<tr><td><input type="date" data-k="from" data-i="${i}" value="${md(z.from)}"></td><td><input type="date" data-k="to" data-i="${i}" value="${md(z.to)}"></td>
        <td><select data-k="lv" data-i="${i}">${["g","y","r"].map(l => `<option value="${l}" ${l===z.lv?"selected":""}>${LV_NAME[l]}</option>`).join("")}</select></td>
        <td><input data-k="t" data-i="${i}" value="${esc(z.t)}"></td><td><button class="btn ghost xs" data-del="${i}">✕</button></td></tr>`).join("")}
      </tbody></table>
      <div class="actions"><button class="btn ghost" id="zadd">+ เพิ่มช่วง</button><button class="btn" id="zsave">บันทึกช่วงความเสี่ยง</button><button class="btn ghost" id="zreset">คืนค่าเริ่มต้น</button></div>
      <div class="sub" id="zmsg"></div></div>
    <div class="card sub">ข้อมูลอ้างอิง: วงล้อ "ปฏิทินล้นเกวียน" (เมล็ดพันธุ์ข้าวเฮียใช้ จ.สุพรรณบุรี / ฮั้วเฮงหลี) และสถิติผลผลิตสมาชิกเฮียใช้ ปี 2565–2568 · แอปนี้เป็นเครื่องมือช่วยวางแผน ไม่ใช่คำแนะนำทางวิชาการอย่างเป็นทางการ</div>
  </div>`;
  let work = zs.map(z => ({ ...z, from:[...z.from], to:[...z.to] }));
  $("#zt").oninput = e => {
    const i = +e.target.dataset.i, k = e.target.dataset.k; if (isNaN(i)) return;
    if (k === "from" || k === "to") { const d = parseIso(e.target.value); if (!isNaN(d)) work[i][k] = [d.getMonth()+1, d.getDate()]; }
    else work[i][k] = e.target.value;
  };
  $("#zt").onclick = e => { const i = e.target.dataset.del; if (i !== undefined) { work.splice(+i,1); db.zones = work; save(); viewSettings(); } };
  $("#zadd").onclick = () => { work.push({ from:[1,1], to:[1,1], lv:"g", t:"เหมาะสม" }); db.zones = work; save(); viewSettings(); };
  $("#zsave").onclick = () => { work.sort((a,b) => (a.from[0]*100+a.from[1]) - (b.from[0]*100+b.from[1])); db.zones = work; save(); $("#zmsg").textContent = "✓ บันทึกแล้ว"; };
  $("#zreset").onclick = () => { db.zones = null; save(); viewSettings(); };
  $("#exp").onclick = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type:"application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `rice-calendar-backup-${iso(today())}.json`; a.click();
  };
  $("#imp").onchange = async e => {
    try { const d = JSON.parse(await e.target.files[0].text()); if (!Array.isArray(d.plots)) throw new Error("ไฟล์ไม่ถูกต้อง");
      if (confirm(`นำเข้า ${d.plots.length} แปลง (แทนที่ข้อมูลเดิม)?`)) { db = d; save(); location.hash = "home"; } }
    catch (err) { alert("นำเข้าไม่สำเร็จ: " + err.message); }
  };
}

/* ================= router ================= */
function route() {
  document.title = "ปฏิทินล้นเกวียน";
  const h = location.hash.replace(/^#\/?/, "") || "home";
  const [v, id] = h.split("/");
  $$("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === v || (v === "plot" && a.dataset.nav === "home")));
  if (v === "plan") viewPlan();
  else if (v === "plot") viewPlot(id);
  else if (v === "report") viewReport(id);
  else if (v === "settings") viewSettings();
  else viewHome();
  if (v !== "plot") scrollTo(0, 0);
}
addEventListener("hashchange", route);
route();
