/* Querida · Le Feu vert caché — réservé aux amis.
   Pour l'ouvrir : déjà sur l'onglet Carnet, taper 3 fois de suite sur « Carnet ».
   Fichier à part, préfixe « qf- » partout ; une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{

const Q = window.QUERIDA;
if (!Q || Q.role() !== "ami") return;

const TRIES = 5;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toHex = s => [...new TextEncoder().encode(s)].map(x => x.toString(16).padStart(2, "0")).join("");
const fromHex = h => { try{ return new TextDecoder().decode(new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)))); }catch(e){ return "?"; } };
const me = () => Q.me() || {};
const myId = () => String(me().id || "anon").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "anon";
const myName = () => me().name || "Quelqu'un";
let best = 0; try{ best = +localStorage.getItem("qf_best") || 0; }catch(e){}

/* =================== Styles =================== */
const CSS = `
.qf-wrap{position:fixed;inset:0;z-index:75;background:var(--bg);color:var(--label);overflow-y:auto;-webkit-overflow-scrolling:touch;animation:qf-in .35s ease;-webkit-user-select:none;user-select:none;font-family:var(--f)}
@keyframes qf-in{from{opacity:0;transform:scale(.98)}}
.qf-in{max-width:460px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 32px);display:flex;flex-direction:column;gap:12px}
.qf-head{display:flex;justify-content:space-between;align-items:center}
.qf-head h1{margin:0;font-family:var(--f-display);font-style:italic;font-weight:400;font-size:38px;line-height:1}
.qf-close{width:40px;height:40px;border-radius:50%;border:0;background:var(--fill2);color:var(--label);font-size:20px;cursor:pointer}
.qf-game{position:relative;width:100%;aspect-ratio:9/13;max-height:66vh;border-radius:18px;overflow:hidden;background:#fff;color:#3B1F17;box-shadow:0 8px 24px rgba(59,31,23,.14);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:58px 24px 24px;text-align:center;touch-action:none;cursor:pointer}
.qf-game.red{background:#C8372A;color:#fff}
.qf-game.green{background:#2E8B57;color:#fff}
.qf-game.foul{background:#2B1A1A;color:#fff}
.qf-tries{position:absolute;top:16px;left:16px;right:16px;display:flex;gap:6px;justify-content:center}
.qf-tries i{flex:1;max-width:58px;height:30px;border-radius:8px;background:rgba(0,0,0,.08);font-style:normal;font-size:12px;font-weight:700;display:grid;place-items:center;font-variant-numeric:tabular-nums}
.red .qf-tries i,.green .qf-tries i,.foul .qf-tries i{background:rgba(255,255,255,.18)}
.qf-tries i.done{background:rgba(255,255,255,.9);color:#3B1F17}
.qf-game:not(.red):not(.green):not(.foul) .qf-tries i.done{background:#3B1F17;color:#fff}
.qf-big{font-family:var(--f-display);font-style:italic;font-weight:400;font-size:56px;line-height:1;margin:0}
.qf-ms{font-size:min(20vw,86px);font-weight:800;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.03em}
.qf-ms small{font-size:.35em;font-weight:700;margin-left:4px;opacity:.75}
.qf-sub{font-size:15px;opacity:.85;margin:0;max-width:30ch}
.qf-cta{font-size:15px;font-weight:700;margin:0}
.qf-light{width:90px;height:90px;border-radius:50%;background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 6px rgba(255,255,255,.25)}
.green .qf-light{background:#B9F5CF;box-shadow:0 0 50px 10px rgba(185,245,207,.8)}
.qf-res{width:100%;max-width:300px;border-collapse:collapse;font-size:15px;font-variant-numeric:tabular-nums}
.qf-res td{padding:5px 8px;border-bottom:1px solid rgba(59,31,23,.1);text-align:left}
.qf-res td:last-child{text-align:right;font-weight:700}
.qf-res tr.best td:last-child::after{content:" ★";color:#F2873B}
.qf-rec{color:#C8372A;font-weight:700;margin:0}
.qf-board h2{margin:8px 0 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--label2)}
.qf-row{width:100%;display:flex;align-items:center;gap:12px;padding:11px 14px;border:0;border-radius:12px;background:var(--card);color:var(--label);font:inherit;text-align:left;cursor:pointer;font-variant-numeric:tabular-nums;margin-top:6px}
.qf-row .qf-rk{width:20px;font-family:var(--f-display);font-size:20px;color:var(--accent);text-align:center}
.qf-row .qf-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qf-row .qf-sc{font-weight:700}
.qf-row .qf-ch{opacity:.6;transition:transform .2s}
.qf-row[aria-expanded="true"] .qf-ch{transform:rotate(90deg)}
.qf-row.qf-me{box-shadow:inset 0 0 0 1.5px var(--rind)}
.qf-detail{background:var(--card);border-radius:12px;padding:6px 8px 8px;margin-top:2px;display:flex;justify-content:center;color:var(--label)}
.qf-detail .qf-res td{border-bottom-color:rgba(128,100,90,.15)}
.qf-empty{opacity:.6;font-size:14px;text-align:center;padding:12px}
.qf-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translate(-50%,-150%);transition:transform .5s cubic-bezier(.2,1.2,.4,1);z-index:80;background:#F3C77A;color:#1A1222;font-weight:700;border-radius:999px;padding:10px 18px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);white-space:nowrap}
.qf-toast.on{transform:translate(-50%,0)}
@media (prefers-reduced-motion: reduce){.qf-wrap{animation:none}}
`;
const st = document.createElement("style"); st.id = "qf-style"; st.textContent = CSS; document.head.appendChild(st);

/* =================== Le geste : 3 tapes sur « Carnet » quand on y est déjà =================== */
const TAPS_TO_OPEN = 3, MAX_GAP = 700;
let taps = [];
document.addEventListener("pointerdown", e => {
  try{
    if (wrap || !Q.me()) return;
    const tab = e.target.closest && e.target.closest('nav.tabbar .tab[data-v="carnet"]');
    if (!tab || tab.getAttribute("aria-current") !== "page"){ taps = []; return; }   // ne compte que si on est déjà sur le Carnet
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > MAX_GAP) taps = [];
    taps.push(now);
    if (taps.length >= TAPS_TO_OPEN){ taps = []; try{ navigator.vibrate && navigator.vibrate(20); }catch(e){} setTimeout(openGame, 60); }
  }catch(err){}
}, true);

/* =================== Classement partagé =================== */
// arcade/feuvert/<moyenne en ms sur 4 chiffres>__<date>__<id>__<prénom>__<les 5 temps>.txt
const Board = {
  async load(){
    if (Q.demo()) return [];
    const { data, error } = await Q.store().client.storage.from("capsules").list("arcade/feuvert", { limit: 500, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    const byPlayer = new Map();
    (data || []).forEach(f => {
      const m = f.name.match(/^(\d{4})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)__([0-9-]+)\.txt$/); if (!m) return;
      const r = { avg: +m[1], ts: +m[2], id: m[3], name: fromHex(m[4]), times: m[5].split("-").map(Number) };
      if (r.avg < 100) return;
      const old = byPlayer.get(r.id);
      if (!old || r.avg < old.avg) byPlayer.set(r.id, r);
    });
    return [...byPlayer.values()].sort((a, b) => a.avg - b.avg || a.ts - b.ts);
  },
  async submit(avg, times){
    if (Q.demo()) return;
    const key = `${String(Math.min(9999, avg)).padStart(4, "0")}__${String(Date.now()).padStart(14, "0")}__${myId()}__${toHex(myName().slice(0, 30))}__${times.map(t => Math.min(9999, t)).join("-")}.txt`;
    const r = await Q.store().client.storage.from("capsules").upload("arcade/feuvert/" + key, new Blob([myName()], { type:"text/plain" }), { contentType:"text/plain", upsert:false });
    if (r.error) throw r.error;
  }
};
let board = null, openRow = null;

/* =================== L'écran du jeu =================== */
let wrap = null, state = "title", times = [], timer = 0, greenAt = 0, readyAt = 0;
const $ = id => wrap && wrap.querySelector("#" + id);
function openGame(){
  if (Q.layerCount()) Q.clearLayers();
  closeGame();
  wrap = document.createElement("div"); wrap.className = "qf-wrap"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-label", "Le Feu vert");
  wrap.innerHTML = `<div class="qf-in"><div class="qf-head"><h1>Le Feu vert</h1><button type="button" class="qf-close" data-qf="close" aria-label="Fermer">×</button></div>
    <div class="qf-game" id="qf-game" role="application" aria-live="assertive" aria-label="Touche quand l'écran passe au vert"></div>
    <div class="qf-board" id="qf-board"></div></div>`;
  document.body.appendChild(wrap); document.body.style.overflow = "hidden";
  state = "title"; times = []; readyAt = performance.now() + 400; render(); drawBoard();
  $("qf-game").addEventListener("pointerdown", e => { e.preventDefault(); tap(performance.now()); });
  Board.load().then(b => { board = b; drawBoard(); }).catch(() => { board = "err"; drawBoard(); });
}
function closeGame(){ clearTimeout(timer); if (wrap){ wrap.remove(); wrap = null; if (!Q.layerCount()) document.body.style.overflow = ""; } }
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-qf]"); if (!b) return;
  e.stopPropagation();
  if (b.dataset.qf === "close") closeGame();
  if (b.dataset.qf === "row"){ openRow = openRow === b.dataset.v ? null : b.dataset.v; drawBoard(); }
}, true);

let actx = null;
function bip(f, d = .08, type = "sine", g = .1){
  try{
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const t = actx.currentTime, o = actx.createOscillator(), v = actx.createGain(); o.type = type; o.frequency.value = f;
    v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(v).connect(actx.destination); o.start(t); o.stop(t + d + .01);
  }catch(e){}
}
function resTable(ts){ const mn = Math.min(...ts); return `<table class="qf-res">${ts.map((t, i) => `<tr class="${t === mn ? "best" : ""}"><td>Essai ${i + 1}</td><td>${t} ms</td></tr>`).join("")}</table>`; }
function triesBar(){ return `<div class="qf-tries">${Array.from({ length: TRIES }, (_, i) => `<i class="${times[i] ? "done" : ""}">${times[i] ? times[i] : i + 1}</i>`).join("")}</div>`; }
function showCta(){ setTimeout(() => { const c = $("qf-cta"); if (c) c.style.visibility = "visible"; }, 900); }
function render(){
  const game = $("qf-game"); if (!game) return;
  game.className = "qf-game";
  if (state === "title"){
    game.innerHTML = `<p class="qf-big">Le Feu vert</p><p class="qf-sub">5 essais. Quand l'écran passe au vert, tape, le plus vite possible. Pas avant : un faux départ et c'est éliminé.</p>
      ${best ? `<p class="qf-sub">Ton record : <b>${best} ms</b> de moyenne</p>` : ""}<p class="qf-cta">Touche pour commencer</p>`;
  } else if (state === "red"){
    game.classList.add("red");
    game.innerHTML = triesBar() + `<div class="qf-light"></div><p class="qf-big">Attends…</p><p class="qf-sub">Essai ${times.length + 1} sur ${TRIES}</p>`;
  } else if (state === "green"){
    game.classList.add("green");
    game.innerHTML = triesBar() + `<div class="qf-light"></div><p class="qf-big">TAPE&nbsp;!</p>`;
  } else if (state === "shown"){
    const last = times[times.length - 1];
    game.innerHTML = triesBar() + `<div class="qf-ms">${last}<small>ms</small></div><p class="qf-sub">${last < 200 ? "Fulgurant." : last < 250 ? "Très rapide." : last < 320 ? "Bien." : "Un peu endormi…"}</p><p class="qf-cta">${times.length < TRIES ? "Touche pour l'essai suivant" : "Touche pour voir ton score"}</p>`;
  } else if (state === "foul"){
    game.classList.add("foul");
    game.innerHTML = triesBar() + `<p class="qf-big">Faux départ&nbsp;!</p><p class="qf-sub">Tu as tapé avant le vert. Éliminé.</p><p class="qf-cta" id="qf-cta" style="visibility:hidden">Touche pour recommencer</p>`;
    showCta();
  } else if (state === "end"){
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length), isBest = !best || avg < best;
    if (isBest){ best = avg; try{ localStorage.setItem("qf_best", String(best)); }catch(e){} afterGame(avg, times.slice()); }
    game.innerHTML = `<p class="qf-sub" style="opacity:.7">Ta moyenne</p><div class="qf-ms">${avg}<small>ms</small></div>
      <p class="${isBest ? "qf-rec" : "qf-sub"}">${isBest ? "Nouveau record !" : "Record : " + best + " ms"}</p>${resTable(times)}
      <p class="qf-cta" id="qf-cta" style="visibility:hidden">Touche pour rejouer</p>`;
    showCta();
  }
}
function arm(){
  state = "red"; render();
  clearTimeout(timer);
  timer = setTimeout(() => { if (!wrap) return; state = "green"; greenAt = performance.now(); render(); bip(880, .12); }, 1500 + Math.random() * 3500);   // entre 1,5 et 5 s
}
function foul(now){ clearTimeout(timer); state = "foul"; bip(150, .4, "sawtooth", .12); readyAt = now + 900; render(); }
function tap(now){
  if (now < readyAt) return;
  if (state === "title"){ times = []; arm(); return; }
  if (state === "red") return foul(now);
  if (state === "green"){
    const ms = Math.round(now - greenAt);
    if (ms < 100) return foul(now);                                 // personne ne réagit en moins de 100 ms : c'est de l'anticipation
    times.push(ms); bip(1320, .06, "square", .05); state = "shown"; readyAt = now + 300; render(); return;
  }
  if (state === "shown"){ if (times.length < TRIES) arm(); else { state = "end"; readyAt = now + 900; render(); } return; }
  if (state === "foul" || state === "end"){ times = []; arm(); }
}
function drawBoard(){
  const z = $("qf-board"); if (!z) return;
  let rows;
  if (board === null) rows = `<p class="qf-empty">Lecture du classement…</p>`;
  else if (board === "err") rows = `<p class="qf-empty">Le classement ne répond pas pour l'instant. Ton record est gardé.</p>`;
  else if (!board.length) rows = `<p class="qf-empty">Personne n'a encore joué. La couronne est libre.</p>`;
  else rows = board.slice(0, 15).map((p, i) => {
    const isOpen = openRow === p.id;
    return `<button type="button" class="qf-row ${p.id === myId() ? "qf-me" : ""}" data-qf="row" data-v="${esc(p.id)}" aria-expanded="${isOpen}"><span class="qf-rk">${i + 1}</span><span class="qf-nm">${esc(p.name)}${i === 0 ? " 👑" : ""}</span><span class="qf-sc">${p.avg} ms</span><span class="qf-ch">›</span></button>${isOpen ? `<div class="qf-detail">${resTable(p.times)}</div>` : ""}`;
  }).join("");
  z.innerHTML = `<h2>Classement de la bande · Le Feu vert</h2>${rows}`;
}
function toast(msg){
  document.getElementById("qf-toast")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="qf-toast" id="qf-toast" role="status">${esc(msg)}</div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("qf-toast")?.classList.add("on")));
  setTimeout(() => { const t = document.getElementById("qf-toast"); if (t){ t.classList.remove("on"); setTimeout(() => t.remove(), 600); } }, 3500);
}
async function afterGame(avg, ts){
  try{
    const before = await Board.load(), king = before[0];
    await Board.submit(avg, ts);
    board = await Board.load(); drawBoard();
    const nowKing = board[0];
    if (nowKing && nowKing.id === myId() && (!king || king.id !== myId())){
      toast("👑 Tu as la couronne du Feu vert !");
      Q.push("shared", "Nouvelle couronne 👑", `${myName()} a pris la couronne du Feu vert (${avg} ms de moyenne).`);
    }
  }catch(e){}
}

}catch(err){ /* le Feu vert ne doit jamais gêner l'appli */ }
})();
