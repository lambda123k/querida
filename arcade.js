/* Querida · L'Arcade cachée — réservée aux amis.
   Pour l'ouvrir : toucher 5 fois de suite la cloche rouge des notifications.
   Fichier à part, préfixe « qa- » partout ; une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{

const Q = window.QUERIDA;
if (!Q || Q.role() !== "ami") return;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toHex = s => [...new TextEncoder().encode(s)].map(x => x.toString(16).padStart(2, "0")).join("");
const fromHex = h => { try{ return new TextDecoder().decode(new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)))); }catch(e){ return "?"; } };
const me = () => Q.me() || {};
const myId = () => String(me().id || "anon").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "anon";
const myName = () => me().name || "Quelqu'un";
const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/></svg>';
let best = 0; try{ best = +localStorage.getItem("qa_tour_best") || 0; }catch(e){}

/* =================== Styles =================== */
const CSS = `
.qa-bellrow{display:flex;align-items:center;gap:12px;padding:4px 16px 0;color:var(--label2);font-size:14px}
.qa-bellrow .sq{flex:none}
.qa-wiggle{animation:qa-wiggle .35s ease}
@keyframes qa-wiggle{25%{transform:rotate(-14deg)}75%{transform:rotate(14deg)}}
.qa-arcade{position:fixed;inset:0;z-index:75;background:radial-gradient(120% 70% at 50% 0%,#3A2440,#1A1222 65%);color:#FBF5EF;overflow-y:auto;-webkit-overflow-scrolling:touch;animation:qa-up .45s cubic-bezier(.2,.8,.2,1);font-family:var(--f);-webkit-user-select:none;user-select:none}
@keyframes qa-up{from{transform:translateY(100%)}}
.qa-arcade button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
.qa-in{max-width:460px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 32px);display:flex;flex-direction:column;gap:18px}
.qa-head{display:flex;justify-content:space-between;align-items:center}
.qa-head h1{margin:0;font-family:var(--f-display);font-style:italic;font-weight:400;font-size:40px;line-height:1}
.qa-close{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.1)!important;font-size:20px;line-height:1}
.qa-sub{margin:-10px 0 0;color:rgba(251,245,239,.6);font-size:14px}
.qa-card{display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:14px}
.qa-card .qa-ic{width:58px;height:58px;border-radius:12px;flex:none;overflow:hidden}
.qa-card .qa-ic svg{width:100%;height:100%;display:block}
.qa-card .qa-t{flex:1;min-width:0}
.qa-card .qa-t b{display:block;font-family:var(--f-display);font-style:italic;font-weight:400;font-size:26px;line-height:1.1}
.qa-card .qa-t small{color:rgba(251,245,239,.6);font-size:13px}
.qa-play{background:#F3C77A!important;color:#1A1222!important;font-weight:700;border-radius:999px;padding:10px 18px!important}
.qa-board h2{margin:0 0 8px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:rgba(251,245,239,.6)}
.qa-row{display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:12px;background:rgba(255,255,255,.04);font-variant-numeric:tabular-nums}
.qa-row + .qa-row{margin-top:6px}
.qa-row .qa-rk{width:22px;text-align:center;font-family:var(--f-display);font-size:20px;color:#F3C77A}
.qa-row .qa-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qa-row .qa-sc{font-weight:700}
.qa-row.qa-me{background:rgba(243,199,122,.16);border:1px solid rgba(243,199,122,.35)}
.qa-row.qa-king{background:linear-gradient(90deg,rgba(243,199,122,.28),rgba(243,199,122,.08))}
.qa-empty{color:rgba(251,245,239,.55);font-size:14px;text-align:center;padding:14px}
.qa-game{position:fixed;inset:0;z-index:76;background:#1A1222;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:calc(env(safe-area-inset-top,0px) + 8px) 12px calc(env(safe-area-inset-bottom,0px) + 12px)}
.qa-game .qa-bar{width:100%;max-width:460px;display:flex;justify-content:space-between;align-items:center;color:#FBF5EF;font-size:14px}
.qa-game .qa-bar button{color:#F3C77A;font-weight:600;min-height:40px;font:inherit;background:none;border:0;cursor:pointer}
.qa-stage{position:relative;width:100%;max-width:460px;flex:1;max-height:calc(100% - 60px);border-radius:18px;overflow:hidden;touch-action:none;cursor:pointer;background:#FCEBD6}
.qa-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.qa-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translate(-50%,-150%);transition:transform .5s cubic-bezier(.2,1.2,.4,1);z-index:80;background:#F3C77A;color:#1A1222;font-weight:700;border-radius:999px;padding:10px 18px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);white-space:nowrap}
.qa-toast.on{transform:translate(-50%,0)}
@media (prefers-reduced-motion: reduce){.qa-arcade{animation:none}.qa-wiggle{animation:none}}
`;
const st = document.createElement("style"); st.id = "qa-style"; st.textContent = CSS; document.head.appendChild(st);

/* =================== La cloche (5 touches) =================== */
function mainEl(){ return document.querySelector("#app > main.screen"); }
function decorate(){
  const main = mainEl(); if (!main || !Q.me()) return;
  const tabBtn = document.querySelector('.tabbar .tab[aria-current="page"]');
  if (!tabBtn || tabBtn.dataset.v !== "depot") return;
  // si la carte « Active les notifications » n'est pas là, on laisse une petite cloche à sa place
  if (!main.querySelector(".notif") && !main.querySelector(".qa-bellrow")){
    main.insertAdjacentHTML("beforeend", `<div class="qa-bellrow"><span class="sq qa-bell" style="background:var(--accent);color:var(--on-accent);width:30px;height:30px;border-radius:8px;display:grid;place-items:center">${BELL}</span><span>${Q.pushOn() ? "Notifications activées" : "Notifications"}</span></div>`);
  }
}
let queued = false;
new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; try{ decorate(); }catch(e){} }); }).observe(document.body, { childList:true, subtree:true });
decorate();

let taps = 0, tapT = 0;
document.addEventListener("pointerdown", e => {
  const bell = e.target.closest(".notif .sq, .qa-bell"); if (!bell) return;
  const now = Date.now();
  taps = now - tapT < 1200 ? taps + 1 : 1; tapT = now;
  if (taps >= 2){ bell.classList.remove("qa-wiggle"); void bell.offsetWidth; bell.classList.add("qa-wiggle"); }
  if (taps >= 5){ taps = 0; openArcade(); }
}, true);

/* =================== Classement partagé =================== */
// un fichier par record battu : arcade/tour/<score>__<date>__<id>__<prénom>.txt
const Board = {
  async load(){
    if (Q.demo()) return [];
    const { data, error } = await Q.store().client.storage.from("capsules").list("arcade/tour", { limit: 500, sortBy: { column: "name", order: "desc" } });
    if (error) throw error;
    const byPlayer = new Map();
    (data || []).forEach(f => {
      const m = f.name.match(/^(\d{6})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)\.txt$/); if (!m) return;
      const r = { score:+m[1], ts:+m[2], id:m[3], name: fromHex(m[4]) };
      const old = byPlayer.get(r.id);
      if (!old || r.score > old.score || (r.score === old.score && r.ts < old.ts)) byPlayer.set(r.id, r);
    });
    return [...byPlayer.values()].sort((a, b) => b.score - a.score || a.ts - b.ts);
  },
  async submit(score){
    if (Q.demo()) return;
    const key = `${String(score).padStart(6, "0")}__${String(Date.now()).padStart(14, "0")}__${myId()}__${toHex(myName().slice(0, 30))}.txt`;
    const r = await Q.store().client.storage.from("capsules").upload("arcade/tour/" + key, new Blob([myName()], { type:"text/plain" }), { contentType:"text/plain", upsert:false });
    if (r.error) throw r.error;
  }
};
let board = null;

/* =================== La borne =================== */
const TOUR_ICON = '<svg viewBox="0 0 58 58"><rect width="58" height="58" fill="#FCEBD6"/><rect x="14" y="40" width="30" height="8" fill="#F2873B"/><rect x="16" y="32" width="26" height="8" fill="#1E4E9C"/><rect x="18" y="24" width="23" height="8" fill="#CC3F27"/><rect x="21" y="16" width="19" height="8" fill="#FFFDF9"/><rect x="25" y="8" width="16" height="8" fill="#F2873B" opacity=".9"/></svg>';
function openArcade(){
  if (Q.layerCount()) Q.clearLayers();
  document.getElementById("qa-arcade")?.remove();
  const el = document.createElement("div"); el.id = "qa-arcade"; el.className = "qa-arcade"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Arcade");
  document.body.appendChild(el); document.body.style.overflow = "hidden";
  renderArcade();
  Board.load().then(b => { board = b; renderArcade(); }).catch(() => { board = "err"; renderArcade(); });
}
function closeArcade(){ document.getElementById("qa-arcade")?.remove(); if (!Q.layerCount()) document.body.style.overflow = ""; }
function renderArcade(){
  const el = document.getElementById("qa-arcade"); if (!el) return;
  let rows;
  if (board === null) rows = `<p class="qa-empty">Lecture du classement…</p>`;
  else if (board === "err") rows = `<p class="qa-empty">Le classement ne répond pas pour l'instant. Tes records sont gardés, ils apparaîtront plus tard.</p>`;
  else if (!board.length) rows = `<p class="qa-empty">Personne n'a encore joué. La couronne est libre.</p>`;
  else {
    const top = board.slice(0, 10), mine = board.findIndex(r => r.id === myId());
    rows = top.map((r, i) => `<div class="qa-row ${i === 0 ? "qa-king" : ""} ${r.id === myId() ? "qa-me" : ""}"><span class="qa-rk">${i + 1}</span><span class="qa-nm">${esc(r.name)}${i === 0 ? " 👑" : ""}</span><span class="qa-sc">${r.score}</span></div>`).join("");
    if (mine >= 10) rows += `<div class="qa-row qa-me" style="margin-top:12px"><span class="qa-rk">${mine + 1}</span><span class="qa-nm">${esc(board[mine].name)}</span><span class="qa-sc">${board[mine].score}</span></div>`;
  }
  el.innerHTML = `<div class="qa-in">
    <div class="qa-head"><h1>Arcade</h1><button type="button" class="qa-close" data-qa="close" aria-label="Fermer">×</button></div>
    <p class="qa-sub">Ici, on ne parle de rien à personne. Sauf de son score.</p>
    <div class="qa-card"><span class="qa-ic">${TOUR_ICON}</span><span class="qa-t"><b>La Tour</b><small>Ton record : ${best} étage${best > 1 ? "s" : ""}</small></span><button type="button" class="qa-play" data-qa="play">Jouer</button></div>
    <div class="qa-board"><h2>Classement de la bande · La Tour</h2>${rows}</div>
  </div>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-qa]"); if (!b) return;
  e.stopPropagation();
  const v = b.dataset.qa;
  if (v === "close") closeArcade();
  if (v === "play") Tour.open();
  if (v === "back") Tour.close();
}, true);
function toast(msg){
  document.getElementById("qa-toast")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="qa-toast" id="qa-toast" role="status">${esc(msg)}</div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("qa-toast")?.classList.add("on")));
  setTimeout(() => { const t = document.getElementById("qa-toast"); if (t){ t.classList.remove("on"); setTimeout(() => t.remove(), 600); } }, 3500);
}

/* Après une partie : record, classement, couronne */
async function afterGame(score){
  if (score <= best) return;
  best = score; try{ localStorage.setItem("qa_tour_best", String(best)); }catch(e){}
  try{
    const before = await Board.load();
    const king = before[0];
    await Board.submit(score);
    board = await Board.load(); renderArcade();
    const nowKing = board[0];
    if (nowKing && nowKing.id === myId() && (!king || king.id !== myId())){
      toast("👑 Tu as la couronne de La Tour !");
      Q.push("shared", "Nouvelle couronne 👑", `${myName()} a pris la couronne de La Tour (${score} étage${score > 1 ? "s" : ""}).`);
    }
  }catch(e){}
}

/* =================== Le jeu : La Tour =================== */
const Tour = (() => {
  let root = null, cv, g, W = 0, H = 0, DPR = 1, BH = 34, raf = 0, ro = null, onKey = null;
  let state = "ready", tower = [], cur = null, falling = [], cam = 0, camTarget = 0, streak = 0, flashT = 0, popText = null, overT = 0, newBest = false, t = 0, last = 0;
  const C = { sang:"#CC3F27", encre:"#3B1F17", ombre:"#7A5A4C" };
  const FACES = [ { bg:"#FFFDF9", tile:"#1E4E9C" }, { bg:"#CC3F27", tile:"#F6C9AE" }, { bg:"#FBE3D3", tile:"#CC3F27" }, { bg:"#1E4E9C", tile:"#FBF5EF" }, { bg:"#F2873B", tile:"#FFFDF9" }, { bg:"#FFFDF9", tile:"#F2873B" } ];
  let actx = null;
  function snd(kind, k = 0){
    try{
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const tt = actx.currentTime, o = actx.createOscillator(), v = actx.createGain(); o.connect(v).connect(actx.destination);
      if (kind === "pose"){ o.type = "triangle"; o.frequency.value = 330; v.gain.setValueAtTime(.09, tt); v.gain.exponentialRampToValueAtTime(.001, tt + .12); o.start(tt); o.stop(tt + .13); }
      if (kind === "parfait"){ const n = [523, 587, 659, 784, 880, 988, 1047]; o.type = "sine"; o.frequency.value = n[Math.min(k, n.length - 1)]; v.gain.setValueAtTime(.12, tt); v.gain.exponentialRampToValueAtTime(.001, tt + .35); o.start(tt); o.stop(tt + .36); }
      if (kind === "fin"){ o.type = "sawtooth"; o.frequency.setValueAtTime(220, tt); o.frequency.exponentialRampToValueAtTime(55, tt + .6); v.gain.setValueAtTime(.1, tt); v.gain.exponentialRampToValueAtTime(.001, tt + .65); o.start(tt); o.stop(tt + .66); }
    }catch(e){}
  }
  function resize(){
    const stage = root && root.querySelector(".qa-stage"); if (!stage) return;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    const r = stage.getBoundingClientRect(); W = Math.max(200, r.width); H = Math.max(260, r.height);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    BH = Math.round(H / 15);
  }
  function reset(){
    const w0 = Math.round(W * .62);
    tower = [{ x: (W - w0) / 2, w: w0, f: 0 }]; falling = []; cam = camTarget = 0; streak = 0; flashT = 0; popText = null; newBest = false;
    spawn();
  }
  function spawn(){
    const top = tower[tower.length - 1], n = tower.length, fromLeft = n % 2 === 1;
    cur = { w: top.w, x: fromLeft ? top.x - top.w - 14 : top.x + top.w + 14, dir: fromLeft ? 1 : -1, v: Math.min(430, 150 + n * 7), f: n % FACES.length };
  }
  function tap(){
    if (state === "ready"){ state = "play"; reset(); return; }
    if (state === "over"){ if (overT > .5){ state = "play"; reset(); } return; }
    place();
  }
  function place(){
    const top = tower[tower.length - 1];
    const L = Math.max(cur.x, top.x), R = Math.min(cur.x + cur.w, top.x + top.w), over = R - L;
    if (over <= 0){ falling.push({ x: cur.x, w: cur.w, y: yOf(tower.length), vy: 0, rot: 0, vr: cur.dir * 1.5, f: cur.f }); cur = null; return end(); }
    if (Math.abs(cur.x - top.x) <= Math.max(3, W * .012)){
      streak++; let x = top.x, w = top.w;
      if (streak >= 3){ const grow = Math.min(W * .62 - w, 12); x -= grow / 2; w += grow; }
      tower.push({ x, w, f: cur.f }); flashT = .35; popText = { s: streak >= 3 ? "Parfait ! +" : "Parfait !", t: .9 }; snd("parfait", streak - 1);
    } else {
      streak = 0;
      const cutX = cur.x < top.x ? cur.x : R;
      falling.push({ x: cutX, w: cur.w - over, y: yOf(tower.length), vy: 0, rot: 0, vr: (cur.x < top.x ? -1 : 1) * 2, f: cur.f });
      tower.push({ x: L, w: over, f: cur.f }); snd("pose");
    }
    camTarget = Math.max(0, tower.length * BH - H * .55);
    spawn();
  }
  function end(){
    state = "over"; overT = 0; snd("fin");
    const sc = tower.length - 1;
    if (sc > best){ newBest = true; }
    afterGame(sc);
    const lbl = root && root.querySelector(".qa-best"); if (lbl) lbl.textContent = "Record : " + Math.max(best, sc);
  }
  const yOf = i => H - 18 - (i + 1) * BH + cam;
  function loop(now){
    if (!root) return;
    const dt = Math.min(.034, (now - last) / 1000); last = now; t += dt;
    if (state === "play" && cur){
      cur.x += cur.dir * cur.v * dt;
      const top = tower[tower.length - 1];
      if (cur.x > top.x + top.w + 14 && cur.dir > 0) cur.dir = -1;
      if (cur.x + cur.w < top.x - 14 && cur.dir < 0) cur.dir = 1;
    }
    if (state === "over") overT += dt;
    cam += (camTarget - cam) * Math.min(1, dt * 6);
    falling.forEach(p => { p.vy += 1500 * dt; p.y += p.vy * dt; p.rot += p.vr * dt; }); falling = falling.filter(p => p.y < H + 200);
    flashT = Math.max(0, flashT - dt); if (popText){ popText.t -= dt; if (popText.t <= 0) popText = null; }
    draw(); raf = requestAnimationFrame(loop);
  }
  function block(x, y, w, f, alpha = 1){
    const F = FACES[f]; g.globalAlpha = alpha;
    g.fillStyle = F.bg; g.fillRect(x, y, w, BH);
    g.save(); g.beginPath(); g.rect(x, y, w, BH); g.clip();
    const s = BH * .34, gap = BH * .16; g.fillStyle = F.tile;
    for (let k = x + gap; k < x + w; k += s + gap){ g.save(); g.translate(k + s / 2, y + BH / 2); g.rotate(Math.PI / 4); g.fillRect(-s / 3, -s / 3, s * .66, s * .66); g.restore(); }
    g.restore();
    g.fillStyle = "rgba(59,31,23,.16)"; g.fillRect(x, y + BH - 3, w, 3);
    g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(x, y, w, 2);
    g.globalAlpha = 1;
  }
  function mix(a, b, k){ const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)); const A = p(a), B = p(b); return "rgb(" + A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(",") + ")"; }
  function draw(){
    const k = Math.min(1, (tower.length - 1) / 40);
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, mix("#FCEBD6", "#3B2440", k)); sky.addColorStop(1, mix("#F9E3C8", "#CC6A3B", k));
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.font = "600 11px -apple-system, Segoe UI, Roboto, sans-serif"; g.textAlign = "left";
    for (let i = 10; i < tower.length + 12; i += 10){ const y = yOf(i - 1) + BH; if (y < -10 || y > H) continue; g.strokeStyle = k > .5 ? "rgba(255,255,255,.25)" : "rgba(59,31,23,.15)"; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.setLineDash([]); g.fillStyle = k > .5 ? "rgba(255,255,255,.6)" : "rgba(59,31,23,.4)"; g.fillText(i + " étages", 10, y - 5); }
    const gy = H - 18 + cam; if (gy < H + 20){ g.fillStyle = "#E9D9C4"; g.fillRect(0, gy, W, H); g.fillStyle = "rgba(59,31,23,.12)"; g.fillRect(0, gy, W, 3); }
    tower.forEach((b, i) => { const y = yOf(i); if (y > -BH && y < H) block(b.x, y, b.w, b.f); });
    if (flashT > 0){ const b = tower[tower.length - 1]; g.strokeStyle = `rgba(255,255,255,${flashT * 2.4})`; g.lineWidth = 3; g.strokeRect(b.x - 3, yOf(tower.length - 1) - 3, b.w + 6, BH + 6); }
    if (state === "play" && cur) block(cur.x, yOf(tower.length), cur.w, cur.f);
    falling.forEach(p => { g.save(); g.translate(p.x + p.w / 2, p.y + BH / 2); g.rotate(p.rot); block(-p.w / 2, -BH / 2, p.w, p.f, .9); g.restore(); });
    g.textAlign = "center";
    if (state === "play"){ g.fillStyle = k > .5 ? "#FBF5EF" : C.encre; g.font = "italic 54px 'Instrument Serif', Georgia, serif"; g.fillText(String(tower.length - 1), W / 2, 70); }
    if (popText){ g.globalAlpha = Math.min(1, popText.t * 2); g.fillStyle = k > .5 ? "#FFD27A" : C.sang; g.font = "600 17px -apple-system, Segoe UI, Roboto, sans-serif"; g.fillText(popText.s, W / 2, 98); g.globalAlpha = 1; }
    if (state === "ready"){
      g.fillStyle = "rgba(251,245,239,.6)"; g.fillRect(0, 0, W, H);
      g.fillStyle = C.encre; g.font = "italic 60px 'Instrument Serif', Georgia, serif"; g.fillText("La Tour", W / 2, H * .3);
      g.fillStyle = C.sang; g.font = "600 16px -apple-system, Segoe UI, Roboto, sans-serif"; g.fillText("Touche pour commencer", W / 2, H * .3 + 38);
      g.fillStyle = C.ombre; g.font = "14px -apple-system, Segoe UI, Roboto, sans-serif"; g.fillText(best ? "Record : " + best + " étages" : "Monte le plus haut possible.", W / 2, H * .3 + 62);
    }
    if (state === "over"){
      g.fillStyle = "rgba(251,245,239,.88)"; g.fillRect(0, 0, W, H);
      g.fillStyle = C.sang; g.font = "italic 50px 'Instrument Serif', Georgia, serif"; g.fillText("Patatras !", W / 2, H * .3);
      g.fillStyle = C.encre; g.font = "700 40px -apple-system, Segoe UI, Roboto, sans-serif"; g.fillText((tower.length - 1) + " étage" + (tower.length - 1 > 1 ? "s" : ""), W / 2, H * .3 + 52);
      g.fillStyle = newBest ? C.sang : C.ombre; g.font = "600 15px -apple-system, Segoe UI, Roboto, sans-serif"; g.fillText(newBest ? "Nouveau record !" : "Record : " + best, W / 2, H * .3 + 80);
      if (overT > .5){ g.fillStyle = C.encre; g.fillText("Touche pour rejouer", W / 2, H * .3 + 114); }
    }
  }
  function open(){
    close();
    root = document.createElement("div"); root.className = "qa-game"; root.setAttribute("role", "application"); root.setAttribute("aria-label", "La Tour : touche pour poser l'étage");
    root.innerHTML = `<div class="qa-bar"><button type="button" data-qa="back">← Arcade</button><span class="qa-best">Record : ${best}</span></div><div class="qa-stage"><canvas></canvas></div>`;
    document.body.appendChild(root);
    cv = root.querySelector("canvas"); g = cv.getContext("2d");
    resize(); ro = new ResizeObserver(resize); ro.observe(root.querySelector(".qa-stage"));
    state = "ready"; reset();
    root.querySelector(".qa-stage").addEventListener("pointerdown", e => { e.preventDefault(); tap(); });
    onKey = e => { if (e.code === "Space" || e.code === "Enter"){ e.preventDefault(); if (!e.repeat) tap(); } };
    addEventListener("keydown", onKey);
    last = performance.now(); raf = requestAnimationFrame(loop);
  }
  function close(){
    cancelAnimationFrame(raf); if (ro) ro.disconnect(); ro = null;
    if (onKey) removeEventListener("keydown", onKey); onKey = null;
    if (root) root.remove(); root = null;
    renderArcade();
  }
  return { open, close };
})();

}catch(err){ /* l'arcade ne doit jamais gêner l'appli */ }
})();
