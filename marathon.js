/* Querida · Le Marathon du pouce caché — réservé aux amis.
   Pour l'ouvrir : taper 10 fois très vite sur le nombre de capsules de l'accueil.
   Fichier à part, préfixe « qm- » partout ; une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{

const Q = window.QUERIDA;
if (!Q || Q.role() !== "ami") return;

const DUR = 10, MAXTAPS = 9999;                                 // pas de plafond réaliste : seule la taille du fichier limite
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toHex = s => [...new TextEncoder().encode(s)].map(x => x.toString(16).padStart(2, "0")).join("");
const fromHex = h => { try{ return new TextDecoder().decode(new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)))); }catch(e){ return "?"; } };
const me = () => Q.me() || {};
const myId = () => String(me().id || "anon").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "anon";
const myName = () => me().name || "Quelqu'un";
const fmt = (n, d = 1) => n.toFixed(d).replace(".", ",");
let best = 0; try{ best = +localStorage.getItem("qm_best") || 0; }catch(e){}

/* =================== Styles =================== */
const CSS = `
.qm-tap{touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
.qm-bump{animation:qm-bump .15s ease}
@keyframes qm-bump{50%{transform:scale(1.18)}}
.qm-wrap{position:fixed;inset:0;z-index:75;background:var(--bg);color:var(--label);overflow-y:auto;-webkit-overflow-scrolling:touch;animation:qm-in .35s ease;-webkit-user-select:none;user-select:none;font-family:var(--f)}
@keyframes qm-in{from{opacity:0;transform:scale(.98)}}
.qm-in{max-width:460px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 32px);display:flex;flex-direction:column;gap:12px}
.qm-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
.qm-head h1{margin:0;font-family:var(--f-display);font-style:italic;font-weight:400;font-size:34px;line-height:1}
.qm-close{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:var(--fill2);color:var(--label);font-size:20px;cursor:pointer}
.qm-game{position:relative;width:100%;aspect-ratio:9/13;max-height:66vh;border-radius:18px;overflow:hidden;background:#fff;color:#3B1F17;box-shadow:0 8px 24px rgba(59,31,23,.14);display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:18px 18px 22px;touch-action:none}
.qm-bar{width:100%;height:10px;border-radius:999px;background:rgba(59,31,23,.08);overflow:hidden}
.qm-bar i{display:block;height:100%;width:100%;background:#F2873B;border-radius:999px;transform-origin:left}
.qm-bar.hot i{background:#CC3F27}
.qm-hud{width:100%;display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:#7A5A4C;font-variant-numeric:tabular-nums;margin-top:8px}
.qm-count{font-size:min(26vw,110px);font-weight:800;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.03em;transition:transform .06s}
.qm-count.pop{transform:scale(1.08)}
.qm-cps{font-size:14px;color:#7A5A4C;font-variant-numeric:tabular-nums;min-height:18px;text-align:center}
.qm-pad{position:relative;width:min(56vw,230px);aspect-ratio:1;border-radius:50%;border:0;background:radial-gradient(circle at 35% 30%,#E8573C,#CC3F27 55%,#9E3320);color:#fff;font:800 26px var(--f);letter-spacing:.04em;box-shadow:0 10px 0 #9E3320,0 16px 26px rgba(158,51,32,.35);cursor:pointer;touch-action:none;transition:transform .05s,box-shadow .05s;overflow:hidden}
.qm-pad.down{transform:translateY(8px);box-shadow:0 2px 0 #9E3320,0 6px 12px rgba(158,51,32,.3)}
.qm-pad.idle{animation:qm-breathe 1.6s ease-in-out infinite}
@keyframes qm-breathe{50%{transform:scale(1.04)}}
.qm-pad:disabled{filter:grayscale(.6) brightness(.9);cursor:default}
.qm-rip{position:absolute;border-radius:50%;border:3px solid rgba(255,255,255,.8);pointer-events:none;animation:qm-rip .45s ease-out forwards}
@keyframes qm-rip{from{width:20px;height:20px;opacity:1;margin:-10px}to{width:160px;height:160px;opacity:0;margin:-80px}}
.qm-msg{font-size:15px;font-weight:600;color:#CC3F27;min-height:22px;text-align:center;margin:0}
.qm-over{position:absolute;inset:0;background:rgba(251,245,239,.96);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:24px;cursor:pointer;touch-action:none}
.qm-over h2{margin:0;font-family:var(--f-display);font-style:italic;font-weight:400;font-size:44px;line-height:1;color:#CC3F27}
.qm-over .qm-big{font-size:64px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.qm-over p{margin:0;color:#7A5A4C;font-size:15px;font-variant-numeric:tabular-nums}
.qm-over .qm-rec{color:#CC3F27;font-weight:700}
.qm-over .qm-cta{color:#3B1F17;font-weight:600;margin-top:12px;visibility:hidden}
.qm-board h2{margin:8px 0 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--label2)}
.qm-row{width:100%;display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:12px;background:var(--card);color:var(--label);font-variant-numeric:tabular-nums;margin-top:6px}
.qm-row .qm-rk{width:20px;font-family:var(--f-display);font-size:20px;color:var(--accent);text-align:center}
.qm-row .qm-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qm-row .qm-sc{font-weight:700}
.qm-row.qm-me{box-shadow:inset 0 0 0 1.5px var(--rind)}
.qm-empty{opacity:.6;font-size:14px;text-align:center;padding:12px}
.qm-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translate(-50%,-150%);transition:transform .5s cubic-bezier(.2,1.2,.4,1);z-index:80;background:#F3C77A;color:#1A1222;font-weight:700;border-radius:999px;padding:10px 18px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);white-space:nowrap}
.qm-toast.on{transform:translate(-50%,0)}
@media (prefers-reduced-motion: reduce){.qm-pad.idle,.qm-bump{animation:none}.qm-rip{display:none}.qm-wrap{animation:none}}
`;
const st = document.createElement("style"); st.id = "qm-style"; st.textContent = CSS; document.head.appendChild(st);

/* =================== Le geste : 10 tapes rapides sur le nombre de capsules =================== */
const TAPS_TO_OPEN = 10, MAX_GAP = 450;
function capsBox(){ return document.querySelector("#app > main.screen .hero.saff > div:nth-child(2)"); }
function decorate(){ const b = capsBox(); if (b && !b.classList.contains("qm-tap")) b.classList.add("qm-tap"); }
let qd = false; new MutationObserver(() => { if (qd) return; qd = true; requestAnimationFrame(() => { qd = false; try{ decorate(); }catch(e){} }); }).observe(document.body, { childList:true, subtree:true });
decorate();
let taps = [];
document.addEventListener("pointerdown", e => {
  try{
    if (wrap || !Q.me()) return;
    const box = e.target.closest && e.target.closest(".qm-tap"); if (!box){ taps = []; return; }
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > MAX_GAP) taps = [];
    taps.push(now);
    if (taps.length >= 4){                                         // à partir de la 4e tape, le nombre s'agite
      const n = box.querySelector(".big-num");
      if (n){ n.classList.remove("qm-bump"); void n.offsetWidth; n.classList.add("qm-bump"); }
    }
    if (taps.length >= TAPS_TO_OPEN){ taps = []; try{ navigator.vibrate && navigator.vibrate(20); }catch(e){} openGame(); }
  }catch(err){}
}, true);

/* =================== Classement partagé =================== */
// arcade/marathon/<tapes sur 3 ou 4 chiffres>__<date>__<id>__<prénom>.txt
const Board = {
  async load(){
    if (Q.demo()) return [];
    const { data, error } = await Q.store().client.storage.from("capsules").list("arcade/marathon", { limit: 500, sortBy: { column: "name", order: "desc" } });
    if (error) throw error;
    const byPlayer = new Map();
    (data || []).forEach(f => {
      const m = f.name.match(/^(\d{3,4})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)\.txt$/); if (!m) return;
      const r = { score: +m[1], ts: +m[2], id: m[3], name: fromHex(m[4]) };
      if (r.score > MAXTAPS) return;
      const old = byPlayer.get(r.id);
      if (!old || r.score > old.score) byPlayer.set(r.id, r);
    });
    return [...byPlayer.values()].sort((a, b) => b.score - a.score || a.ts - b.ts);
  },
  async submit(score){
    if (Q.demo()) return;
    const key = `${String(score).padStart(4, "0")}__${String(Date.now()).padStart(14, "0")}__${myId()}__${toHex(myName().slice(0, 30))}.txt`;
    const r = await Q.store().client.storage.from("capsules").upload("arcade/marathon/" + key, new Blob([myName()], { type:"text/plain" }), { contentType:"text/plain", upsert:false });
    if (r.error) throw r.error;
  }
};
let board = null;

/* =================== L'écran du jeu =================== */
let wrap = null, state = "ready", count = 0, t0 = 0, raf = 0, recent = [], openedAt = 0;
const $ = id => wrap && wrap.querySelector("#" + id);
function openGame(){
  if (Q.layerCount()) Q.clearLayers();
  closeGame();
  wrap = document.createElement("div"); wrap.className = "qm-wrap"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-label", "Le Marathon du pouce");
  wrap.innerHTML = `<div class="qm-in"><div class="qm-head"><h1>Le Marathon du pouce</h1><button type="button" class="qm-close" data-qm="close" aria-label="Fermer">×</button></div>
    <div class="qm-game" id="qm-game">
      <div style="width:100%"><div class="qm-bar" id="qm-bar"><i id="qm-fill"></i></div><div class="qm-hud"><span id="qm-time">10,0 s</span><span id="qm-rec">Record : ${best}</span></div></div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:4px"><div class="qm-count" id="qm-count">0</div><div class="qm-cps" id="qm-cps">10 secondes, tous les doigts permis</div></div>
      <button type="button" class="qm-pad idle" id="qm-pad" aria-label="Taper">TAPE !</button>
      <p class="qm-msg" id="qm-msg">Le chrono part à la première touche</p>
    </div>
    <div class="qm-board" id="qm-board"></div></div>`;
  document.body.appendChild(wrap); document.body.style.overflow = "hidden";
  state = "ready"; count = 0; openedAt = performance.now();
  $("qm-pad").addEventListener("pointerdown", tap);
  drawBoard();
  Board.load().then(b => { board = b; drawBoard(); }).catch(() => { board = "err"; drawBoard(); });
}
function closeGame(){ cancelAnimationFrame(raf); if (wrap){ wrap.remove(); wrap = null; if (!Q.layerCount()) document.body.style.overflow = ""; } }
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-qm]"); if (!b) return;
  e.stopPropagation();
  if (b.dataset.qm === "close") closeGame();
}, true);

let actx = null;
function snd(f, d = .04, type = "square", g = .04){
  try{
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const t = actx.currentTime, o = actx.createOscillator(), v = actx.createGain(); o.type = type; o.frequency.value = f;
    v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(v).connect(actx.destination); o.start(t); o.stop(t + d + .01);
  }catch(e){}
}
function tap(e){
  e.preventDefault();
  if (state === "over") return;
  const now = performance.now();
  if (state === "ready" && now - openedAt < 800) return;        // l'élan des 10 tapes d'ouverture ne lance pas la partie
  if (state === "ready"){ state = "run"; count = 0; recent = []; t0 = now; $("qm-pad").classList.remove("idle"); $("qm-msg").textContent = ""; raf = requestAnimationFrame(tick); }
  if (count >= MAXTAPS) return;
  count++; recent.push(now);
  const c = $("qm-count"); c.textContent = count; c.classList.remove("pop"); void c.offsetWidth; c.classList.add("pop");
  const pad = $("qm-pad"); pad.classList.add("down"); setTimeout(() => pad.classList.remove("down"), 50);
  snd(300 + Math.min(900, count * 6));
  const r = pad.getBoundingClientRect(), rp = document.createElement("span");
  rp.className = "qm-rip"; rp.style.left = ((e.clientX ?? r.left + r.width / 2) - r.left) + "px"; rp.style.top = ((e.clientY ?? r.top + r.height / 2) - r.top) + "px";
  pad.appendChild(rp); setTimeout(() => rp.remove(), 460);
}
function tick(){
  if (!wrap) return;
  const now = performance.now(), left = Math.max(0, DUR - (now - t0) / 1000);
  $("qm-fill").style.transform = `scaleX(${left / DUR})`;
  $("qm-bar").classList.toggle("hot", left < 3);
  $("qm-time").textContent = fmt(left) + " s";
  recent = recent.filter(x => now - x < 1000);
  $("qm-cps").textContent = recent.length + " tapes/s";
  if (left <= 0) return end();
  raf = requestAnimationFrame(tick);
}
function end(){
  state = "over"; cancelAnimationFrame(raf);
  const pad = $("qm-pad"); pad.disabled = true;
  snd(220, .4, "sawtooth", .08);
  const score = count, isBest = score > best;
  if (isBest){ best = score; try{ localStorage.setItem("qm_best", String(best)); }catch(e){} $("qm-rec").textContent = "Record : " + best; afterGame(score); }
  const verdict = score >= 90 ? "Inhumain." : score >= 75 ? "Pouce en feu !" : score >= 60 ? "Très costaud." : score >= 45 ? "Pas mal du tout." : "Échauffement…";
  $("qm-game").insertAdjacentHTML("beforeend", `<div class="qm-over" id="qm-over" role="dialog" aria-label="Fin de partie"><h2>${verdict}</h2>
    <div class="qm-big">${score}</div><p>tapes en 10 secondes · ${fmt(score / DUR)} par seconde</p>
    <p class="${isBest ? "qm-rec" : ""}">${isBest ? "Nouveau record !" : "Record : " + best}</p><p class="qm-cta" id="qm-cta">Touche pour rejouer</p></div>`);
  const readyAt = performance.now() + 1200;                         // évite de relancer par élan
  setTimeout(() => { const c = $("qm-cta"); if (c) c.style.visibility = "visible"; }, 1200);
  $("qm-over").addEventListener("pointerdown", ev => { ev.preventDefault(); if (performance.now() >= readyAt) reset(); });
}
function reset(){
  if (!wrap) return;
  $("qm-over")?.remove(); state = "ready"; count = 0;
  const pad = $("qm-pad"); pad.disabled = false; pad.classList.add("idle");
  $("qm-count").textContent = "0"; $("qm-cps").textContent = "10 secondes, tous les doigts permis"; $("qm-time").textContent = "10,0 s";
  $("qm-fill").style.transform = "scaleX(1)"; $("qm-bar").classList.remove("hot"); $("qm-msg").textContent = "Le chrono part à la première touche";
}
function drawBoard(){
  const z = $("qm-board"); if (!z) return;
  let rows;
  if (board === null) rows = `<p class="qm-empty">Lecture du classement…</p>`;
  else if (board === "err") rows = `<p class="qm-empty">Le classement ne répond pas pour l'instant. Ton record est gardé.</p>`;
  else if (!board.length) rows = `<p class="qm-empty">Personne n'a encore joué. La couronne est libre.</p>`;
  else rows = board.slice(0, 15).map((p, i) => `<div class="qm-row ${p.id === myId() ? "qm-me" : ""}"><span class="qm-rk">${i + 1}</span><span class="qm-nm">${esc(p.name)}${i === 0 ? " 👑" : ""}</span><span class="qm-sc">${p.score} tapes</span></div>`).join("");
  z.innerHTML = `<h2>Classement de la bande · Le Marathon</h2>${rows}`;
}
function toast(msg){
  document.getElementById("qm-toast")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="qm-toast" id="qm-toast" role="status">${esc(msg)}</div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("qm-toast")?.classList.add("on")));
  setTimeout(() => { const t = document.getElementById("qm-toast"); if (t){ t.classList.remove("on"); setTimeout(() => t.remove(), 600); } }, 3500);
}
async function afterGame(score){
  try{
    const before = await Board.load(), king = before[0];
    await Board.submit(score);
    board = await Board.load(); drawBoard();
    const nowKing = board[0];
    if (nowKing && nowKing.id === myId() && (!king || king.id !== myId())){
      toast("👑 Tu as la couronne du Marathon !");
      Q.push("shared", "Nouvelle couronne 👑", `${myName()} a pris la couronne du Marathon du pouce (${score} tapes en 10 s).`);
    }
  }catch(e){}
}

}catch(err){ /* le Marathon ne doit jamais gêner l'appli */ }
})();
