/* Querida · Le Chrono caché — réservé aux amis.
   Pour l'ouvrir : garder le doigt environ 2 secondes sur la case du compteur de jours de l'accueil.
   Fichier à part, préfixe « qc- » partout ; une erreur ici ne casse jamais l'appli. */
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
const fmt = (s, d = 2) => s.toFixed(d).replace(".", ",");
const isPile = err => Math.round(err * 100) <= 1;                 // « pile » : au centième près, comme affiché

/* =================== Les niveaux =================== */
const SPICY = [7.77, 5.5, 9.09, 6.66, 11.11, 8.25, 12, 4.44, 10.5, 13.13, 7.07, 15];
function level(n){
  const target = n <= 7 ? [3, 4, 5, 6, 7, 8, 10][n - 1] : SPICY[(n - 8) % SPICY.length];
  const tol = Math.max(.03, .3 * Math.pow(.83, n - 1));
  const visible = Math.max(.45, 2 - .17 * (n - 1));
  return { n, target, tol, visible };
}
const lvOf = r => r.filter(x => x.ok).length;
const totOf = r => r.reduce((a, x) => a + (x.ok ? x.err : 0), 0);
const better = (a, b) => !b || lvOf(a) > lvOf(b) || (lvOf(a) === lvOf(b) && totOf(a) < totOf(b));
// un parcours se rebâtit à partir des seuls chronos (les cibles et marges se déduisent du niveau)
function runFromTimes(times, lv){ return times.map((time, i) => { const L = level(i + 1), err = Math.abs(time - L.target); return { n: i + 1, target: L.target, time, err, ok: i < lv }; }); }
let bestRun = null; try{ bestRun = JSON.parse(localStorage.getItem("qc_bestrun") || "null"); }catch(e){}

/* =================== Styles =================== */
const CSS = `
.qc-hold{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation}
.qc-spin{animation:qc-shake .08s linear infinite}
@keyframes qc-shake{50%{transform:translateY(-2px)}}
.qc-wrap{position:fixed;inset:0;z-index:75;background:var(--bg);color:var(--label);overflow-y:auto;-webkit-overflow-scrolling:touch;animation:qc-in .35s ease;-webkit-user-select:none;user-select:none;font-family:var(--f)}
@keyframes qc-in{from{opacity:0;transform:scale(.98)}}
.qc-in{max-width:460px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 32px);display:flex;flex-direction:column;gap:12px}
.qc-head{display:flex;justify-content:space-between;align-items:center}
.qc-head h1{margin:0;font-family:var(--f-display);font-style:italic;font-weight:400;font-size:38px;line-height:1}
.qc-close{width:40px;height:40px;border-radius:50%;border:0;background:var(--fill2);color:var(--label);font-size:20px;cursor:pointer}
.qc-game{position:relative;width:100%;aspect-ratio:9/13;max-height:66vh;border-radius:18px;overflow:hidden;box-shadow:0 8px 24px rgba(59,31,23,.14);touch-action:none;cursor:pointer;background:var(--card);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;transition:background-color .25s}
.qc-game.ok{background:#EAF5EE;color:#3B1F17}
.qc-game.ko{background:#FBE6E1;color:#3B1F17;gap:8px;padding-top:58px}
.qc-lvl{position:absolute;top:16px;left:18px;font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.65}
.qc-rec{position:absolute;top:16px;right:18px;font-size:13px;font-weight:600;opacity:.65;font-variant-numeric:tabular-nums}
.qc-dots{position:absolute;top:42px;left:18px;right:18px;display:flex;gap:4px;flex-wrap:wrap}
.qc-dots i{width:8px;height:8px;border-radius:50%;background:#CC3F27;display:block}
.qc-target{font-size:15px;opacity:.75;margin:0}
.qc-target b{font-family:var(--f-display);font-style:italic;font-weight:400;font-size:34px;display:block;line-height:1.1;opacity:1;font-variant-numeric:tabular-nums}
.qc-clock{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:min(20vw,88px);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1;transition:opacity .35s}
.qc-clock.hide{opacity:.08}
.qc-clock.sm{font-size:min(13vw,52px)}
.qc-clock small{font-size:.4em;opacity:.6;margin-left:4px}
.qc-title{font-family:var(--f-display);font-style:italic;font-weight:400;font-size:52px;line-height:1;margin:0}
.qc-msg{font-size:16px;font-weight:600;color:#CC3F27;min-height:22px;margin:0}
.qc-sub{font-size:14px;opacity:.7;max-width:28ch;margin:0}
.qc-verdict{font-family:var(--f-display);font-style:italic;font-size:42px;line-height:1;margin:0}
.ok .qc-verdict{color:#2F7D4E}
.ko .qc-verdict{color:#CC3F27;font-size:36px}
.qc-ecart{font-size:15px;opacity:.8;font-variant-numeric:tabular-nums;margin:0}
.qc-cta{font-size:14px;font-weight:600;opacity:.75;margin:0}
.qc-tblwrap{width:100%;max-height:46%;flex:none;overflow-y:auto;background:rgba(255,255,255,.6);border-radius:10px;padding:2px 4px}
.qc-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.qc-tbl th{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;opacity:.65;text-align:right;padding:4px 6px;border-bottom:1px solid rgba(128,100,90,.2)}
.qc-tbl th:first-child,.qc-tbl td:first-child{text-align:left}
.qc-tbl td{text-align:right;padding:5px 6px;border-bottom:1px solid rgba(128,100,90,.1)}
.qc-tbl tr.ok td:last-child{color:#2F7D4E;font-weight:700}
.qc-tbl tr.ko td{color:#CC3F27;font-weight:700}
.qc-tbl tr.pile td:last-child::after{content:" ★";color:#F2873B}
.qc-board h2{margin:8px 0 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--label2)}
.qc-row{width:100%;display:flex;align-items:center;gap:12px;padding:11px 14px;border:0;border-radius:12px;background:var(--card);color:var(--label);font:inherit;text-align:left;cursor:pointer;font-variant-numeric:tabular-nums;margin-top:6px}
.qc-row .qc-rk{width:20px;font-family:var(--f-display);font-size:20px;color:var(--accent);text-align:center}
.qc-row .qc-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qc-row .qc-lv{font-weight:700}
.qc-row .qc-ch{opacity:.6;transition:transform .2s}
.qc-row[aria-expanded="true"] .qc-ch{transform:rotate(90deg)}
.qc-row.qc-me{box-shadow:inset 0 0 0 1.5px var(--rind)}
.qc-detail{background:var(--card);border-radius:12px;padding:6px 8px 8px;margin-top:2px}
.qc-empty{opacity:.6;font-size:14px;text-align:center;padding:12px}
.qc-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translate(-50%,-150%);transition:transform .5s cubic-bezier(.2,1.2,.4,1);z-index:80;background:#F3C77A;color:#1A1222;font-weight:700;border-radius:999px;padding:10px 18px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);white-space:nowrap}
.qc-toast.on{transform:translate(-50%,0)}
@media (prefers-reduced-motion: reduce){.qc-spin{animation:none}.qc-wrap{animation:none}}
`;
const st = document.createElement("style"); st.id = "qc-style"; st.textContent = CSS; document.head.appendChild(st);

/* =================== Le geste : garder le doigt sur le compteur =================== */
// Toute la case du compteur réagit. Au doigt on écoute les événements « touch » (plus fiables sur iPhone
// que les « pointer », que Safari annule parfois pendant un appui long) ; à la souris, les « pointer ».
function counterBox(){ return document.querySelector("#app > main.screen .hero.saff > div"); }
function counterEl(){ const box = counterBox(); return box ? box.querySelector(".big-num") : null; }
function decorate(){
  const box = counterBox(); if (!box || box.classList.contains("qc-hold")) return;
  box.classList.add("qc-hold"); box.addEventListener("contextmenu", e => e.preventDefault());
}
let qd = false; new MutationObserver(() => { if (qd) return; qd = true; requestAnimationFrame(() => { qd = false; try{ decorate(); }catch(e){} }); }).observe(document.body, { childList:true, subtree:true });
decorate();
let holdT = null, spinT = null, holdEl = null, sx = 0, sy = 0;
function cancelHold(){ clearTimeout(holdT); clearInterval(spinT); holdT = spinT = null; if (holdEl){ holdEl.classList.remove("qc-spin"); if (holdEl.dataset.qcOrig) holdEl.textContent = holdEl.dataset.qcOrig; } holdEl = null; }
function startHold(target, x, y){
  if (!target.closest(".qc-hold") || !Q.me()) return;
  const c = counterEl(); if (!c) return;
  cancelHold(); holdEl = c; c.dataset.qcOrig = c.textContent; sx = x; sy = y;
  holdT = setTimeout(() => {                                  // au bout d'une demi-seconde, le compteur s'affole
    c.classList.add("qc-spin");
    try{ navigator.vibrate && navigator.vibrate(15); }catch(e){}
    spinT = setInterval(() => { c.textContent = String(Math.floor(Math.random() * 900) + 10); }, 45);
    holdT = setTimeout(() => { const el = holdEl; cancelHold(); if (el) el.textContent = el.dataset.qcOrig; openChrono(); }, 1100);
  }, 500);
}
function moveHold(x, y){ if (holdEl && Math.hypot(x - sx, y - sy) > 16) cancelHold(); }
document.addEventListener("touchstart", e => { if (e.touches.length === 1) startHold(e.target, e.touches[0].clientX, e.touches[0].clientY); else cancelHold(); }, { capture:true, passive:true });
document.addEventListener("touchmove", e => { if (e.touches[0]) moveHold(e.touches[0].clientX, e.touches[0].clientY); }, { capture:true, passive:true });
document.addEventListener("touchend", () => { if (holdEl) cancelHold(); }, true);
document.addEventListener("pointerdown", e => { if (e.pointerType === "mouse") startHold(e.target, e.clientX, e.clientY); }, true);
document.addEventListener("pointermove", e => { if (e.pointerType === "mouse") moveHold(e.clientX, e.clientY); }, true);
document.addEventListener("pointerup", e => { if (e.pointerType === "mouse" && holdEl) cancelHold(); }, true);

/* =================== Classement partagé =================== */
// arcade/chrono/<niveau>__<écart total en ms, inversé>__<date>__<id>__<prénom>__<chronos en centièmes>.txt
const Board = {
  async load(){
    if (Q.demo()) return [];
    const { data, error } = await Q.store().client.storage.from("capsules").list("arcade/chrono", { limit: 500, sortBy: { column: "name", order: "desc" } });
    if (error) throw error;
    const byPlayer = new Map();
    (data || []).forEach(f => {
      const m = f.name.match(/^(\d{3})__(\d{7})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)__([0-9-]+)\.txt$/); if (!m) return;
      const run = runFromTimes(m[6].split("-").map(x => +x / 100), +m[1]);
      const r = { id: m[4], name: fromHex(m[5]), ts: +m[3], run };
      const old = byPlayer.get(r.id);
      if (!old || better(r.run, old.run)) byPlayer.set(r.id, r);
    });
    return [...byPlayer.values()].sort((a, b) => lvOf(b.run) - lvOf(a.run) || totOf(a.run) - totOf(b.run) || a.ts - b.ts);
  },
  async submit(run){
    if (Q.demo()) return;
    const lv = String(lvOf(run)).padStart(3, "0"), inv = String(Math.max(0, 9999999 - Math.round(totOf(run) * 1000))).padStart(7, "0");
    const times = run.map(x => Math.max(0, Math.min(9999, Math.round(x.time * 100)))).join("-");
    const key = `${lv}__${inv}__${String(Date.now()).padStart(14, "0")}__${myId()}__${toHex(myName().slice(0, 30))}__${times}.txt`;
    const r = await Q.store().client.storage.from("capsules").upload("arcade/chrono/" + key, new Blob([myName()], { type:"text/plain" }), { contentType:"text/plain", upsert:false });
    if (r.error) throw r.error;
  }
};
let board = null, openRow = null;

/* =================== L'écran du Chrono =================== */
let wrap = null, state = "title", L = level(1), passed = 0, t0 = 0, raf = 0, lastResult = null, readyAt = 0, newBest = false, run = [];
function openChrono(){
  if (Q.layerCount()) Q.clearLayers();
  closeChrono();
  wrap = document.createElement("div"); wrap.className = "qc-wrap"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-label", "Le Chrono");
  wrap.innerHTML = `<div class="qc-in"><div class="qc-head"><h1>Le Chrono</h1><button type="button" class="qc-close" data-qc="close" aria-label="Fermer">×</button></div>
    <div class="qc-game" id="qc-game" role="application" aria-live="polite" aria-label="Touche pour lancer puis arrêter le chronomètre"></div>
    <div class="qc-board" id="qc-board"></div></div>`;
  document.body.appendChild(wrap); document.body.style.overflow = "hidden";
  state = "title"; L = level(1); passed = 0; run = []; render(); drawBoard();
  wrap.querySelector("#qc-game").addEventListener("pointerdown", e => { e.preventDefault(); tap(performance.now()); });
  Board.load().then(b => { board = b; drawBoard(); }).catch(() => { board = "err"; drawBoard(); });
}
function closeChrono(){ cancelAnimationFrame(raf); if (wrap){ wrap.remove(); wrap = null; if (!Q.layerCount()) document.body.style.overflow = ""; } }
document.addEventListener("click", e => {
  const b = e.target.closest("[data-qc]"); if (!b) return;
  e.stopPropagation();
  if (b.dataset.qc === "close") closeChrono();
  if (b.dataset.qc === "row"){ openRow = openRow === b.dataset.v ? null : b.dataset.v; drawBoard(); }
}, true);

let actx = null;
function snd(kind){
  try{
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const t = actx.currentTime, tone = (type, f, g, d, at = 0) => { const o = actx.createOscillator(), v = actx.createGain(); o.connect(v).connect(actx.destination); o.type = type; o.frequency.value = f; v.gain.setValueAtTime(g, t + at); v.gain.exponentialRampToValueAtTime(.001, t + at + d); o.start(t + at); o.stop(t + at + d + .01); };
    if (kind === "go") tone("square", 660, .05, .08);
    if (kind === "stop") tone("square", 440, .05, .06);
    if (kind === "ok"){ tone("sine", 660, .1, .12); tone("sine", 990, .1, .25, .09); }
    if (kind === "pile") [784, 988, 1175, 1568].forEach((f, i) => tone("sine", f, .08, .25, i * .07));
    if (kind === "ko"){ const o = actx.createOscillator(), v = actx.createGain(); o.connect(v).connect(actx.destination); o.type = "sawtooth"; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(70, t + .45); v.gain.setValueAtTime(.09, t); v.gain.exponentialRampToValueAtTime(.001, t + .5); o.start(t); o.stop(t + .51); }
  }catch(e){}
}
function runTable(r){
  return `<table class="qc-tbl"><thead><tr><th>Niv.</th><th>Cible</th><th>Chrono</th><th>Écart</th></tr></thead><tbody>${r.map(x =>
    `<tr class="${x.ok ? (isPile(x.err) ? "ok pile" : "ok") : "ko"}"><td>${x.n}</td><td>${fmt(x.target)}</td><td>${fmt(x.time)}</td><td>${x.ok ? "" : (x.time < x.target ? "−" : "+")}${fmt(x.err)}</td></tr>`).join("")}</tbody></table>`;
}
function render(){
  const box = wrap && wrap.querySelector("#qc-game"); if (!box) return;
  box.classList.remove("ok", "ko");
  const bestLv = bestRun ? lvOf(bestRun) : 0;
  const head = `<span class="qc-lvl">Niveau ${L.n}</span><span class="qc-rec">Record : niveau ${bestLv}</span><div class="qc-dots">${"<i></i>".repeat(Math.min(passed, 60))}</div>`;
  if (state === "title"){
    box.innerHTML = `<span class="qc-rec">Record : niveau ${bestLv}</span><p class="qc-title">Le Chrono</p>
      <p class="qc-sub">Lance le chrono, il disparaît, et tu l'arrêtes à l'instinct pile sur la cible. Chaque niveau est plus serré.</p><p class="qc-msg">Touche pour commencer</p>`;
  } else if (state === "arm" || state === "run"){
    box.innerHTML = head + `<p class="qc-target">Arrête à<b>${fmt(L.target)} s</b>à ±${fmt(L.tol)} s près</p>
      <div class="qc-clock" id="qc-clock">0,00<small>s</small></div><p class="qc-msg">${state === "arm" ? "Touche pour lancer" : "Touche pour arrêter"}</p>`;
  } else {
    const r = lastResult, ok = r.ok;
    box.classList.add(ok ? "ok" : "ko");
    const verdict = ok ? (isPile(r.err) ? "Pile !" : "Dans la marge") : (r.early ? "Trop tôt…" : "Trop tard…");
    box.innerHTML = head + `<p class="qc-verdict">${verdict}</p><div class="qc-clock ${ok ? "" : "sm"}">${fmt(r.time)}<small>s</small></div>
      <p class="qc-ecart">Cible ${fmt(L.target)} s · écart <b>${fmt(r.err)} s</b></p>
      ${ok ? "" : `<p class="qc-ecart">Tu t'arrêtes au <b>niveau ${passed}</b>${newBest ? " · nouveau record !" : ""}</p><div class="qc-tblwrap">${runTable(run)}</div>`}
      <p class="qc-cta" id="qc-cta" style="visibility:hidden">${ok ? "Touche pour le niveau " + (L.n + 1) : "Touche pour rejouer"}</p>`;
    setTimeout(() => { const c = document.getElementById("qc-cta"); if (c) c.style.visibility = "visible"; }, 600);
  }
}
function tick(){
  if (!wrap) return;
  const s = (performance.now() - t0) / 1000, c = document.getElementById("qc-clock");
  if (c){ if (s < L.visible) c.innerHTML = fmt(s) + "<small>s</small>"; else if (!c.classList.contains("hide")){ c.classList.add("hide"); c.innerHTML = "?,??<small>s</small>"; } }
  if (s > L.target + 6){ stop(performance.now()); return; }
  raf = requestAnimationFrame(tick);
}
function stop(now){
  cancelAnimationFrame(raf);
  const time = (now - t0) / 1000, err = Math.abs(time - L.target), ok = err <= L.tol;
  lastResult = { time, err, ok, early: time < L.target };
  run.push({ n: L.n, target: L.target, time, err, ok });
  if (ok){ passed = L.n; snd(isPile(err) ? "pile" : "ok"); }
  else { snd("ko"); newBest = better(run, bestRun) && lvOf(run) > 0; if (newBest) afterGame(run.slice()); }
  state = "result"; readyAt = performance.now() + 600; render();
}
function tap(now){
  if (state === "title"){ L = level(1); passed = 0; newBest = false; run = []; state = "arm"; render(); return; }
  if (state === "arm"){ state = "run"; render(); t0 = now; snd("go"); raf = requestAnimationFrame(tick); return; }
  if (state === "run"){ snd("stop"); stop(now); return; }
  if (state === "result"){
    if (now < readyAt) return;
    if (lastResult.ok){ L = level(L.n + 1); state = "arm"; }
    else { L = level(1); passed = 0; newBest = false; run = []; state = "arm"; }
    render();
  }
}
function drawBoard(){
  const z = wrap && wrap.querySelector("#qc-board"); if (!z) return;
  let rows;
  if (board === null) rows = `<p class="qc-empty">Lecture du classement…</p>`;
  else if (board === "err") rows = `<p class="qc-empty">Le classement ne répond pas pour l'instant. Tes records sont gardés.</p>`;
  else if (!board.length) rows = `<p class="qc-empty">Personne n'a encore joué. La couronne est libre.</p>`;
  else rows = board.slice(0, 15).map((p, i) => {
    const isOpen = openRow === p.id;
    return `<button type="button" class="qc-row ${p.id === myId() ? "qc-me" : ""}" data-qc="row" data-v="${esc(p.id)}" aria-expanded="${isOpen}"><span class="qc-rk">${i + 1}</span><span class="qc-nm">${esc(p.name)}${i === 0 ? " 👑" : ""}</span><span class="qc-lv">niveau ${lvOf(p.run)}</span><span class="qc-ch">›</span></button>${isOpen ? `<div class="qc-detail">${runTable(p.run)}</div>` : ""}`;
  }).join("");
  z.innerHTML = `<h2>Classement de la bande · Le Chrono</h2>${rows}`;
}
function toast(msg){
  document.getElementById("qc-toast")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="qc-toast" id="qc-toast" role="status">${esc(msg)}</div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("qc-toast")?.classList.add("on")));
  setTimeout(() => { const t = document.getElementById("qc-toast"); if (t){ t.classList.remove("on"); setTimeout(() => t.remove(), 600); } }, 3500);
}
async function afterGame(r){
  bestRun = r; try{ localStorage.setItem("qc_bestrun", JSON.stringify(r)); }catch(e){}
  try{
    const before = await Board.load(), king = before[0];
    await Board.submit(r);
    board = await Board.load(); drawBoard();
    const nowKing = board[0];
    if (nowKing && nowKing.id === myId() && (!king || king.id !== myId())){
      const lv = lvOf(r);
      toast("👑 Tu as la couronne du Chrono !");
      Q.push("shared", "Nouvelle couronne 👑", `${myName()} a pris la couronne du Chrono (niveau ${lv}).`);
    }
  }catch(e){}
}

}catch(err){ /* le Chrono ne doit jamais gêner l'appli */ }
})();
