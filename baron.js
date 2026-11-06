/* Querida · Le Baron — jeu de farming et de marché entre amis (côté amis uniquement).
   Étape 1 : l'écran Ferme.
   · Première ouverture : choix d'une spécialité parmi celles encore libres (6 places).
   · Ferme illustrée : ciel selon l'heure réelle, météo du jour, animaux qui se promènent.
   · Récolte : taper ou glisser sur les produits, ou « Tout récolter ». Produit doré ×50 de temps en temps.
   · Stock (avec péremption des œufs et du lait) et vente instantanée au marché.
   Tout ce qui compte (production, stock, pièces, produit doré) est calculé par le serveur Supabase
   (fonctions baron_*, voir supabase/baron.sql) ; l'appli ne fait qu'afficher.
   Préfixe « bn- » partout ; une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{

const Q = window.QUERIDA;
if (!Q || Q.role() !== "ami") return;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const db = () => Q.store().client;
const KEY = "bn_token";
const getToken = () => { try{ return JSON.parse(localStorage.getItem(KEY) || "null"); }catch(e){ return null; } };
const setToken = t => { try{ localStorage.setItem(KEY, JSON.stringify(t)); }catch(e){} };
const seen = k => { try{ return localStorage.getItem("bn_seen_" + k) === "1"; }catch(e){ return true; } };
const markSeen = k => { try{ localStorage.setItem("bn_seen_" + k, "1"); }catch(e){} };

/* Ressources (miroir de baron_resources, pour l'affichage) */
const RES = {
  oeufs: { label:"Œufs",  e:"🥚", unit:"poule",    units:"poules",    who:"Éleveur·se de poules", animal:"🐔", walk:true,  rate:6,   price:10,  perish:24 },
  ble:   { label:"Blé",   e:"🌾", unit:"champ",    units:"champs",    who:"Céréalier·ère",        animal:"🌾", walk:false, rate:5,   price:12,  perish:null },
  lait:  { label:"Lait",  e:"🥛", unit:"vache",    units:"vaches",    who:"Vacher·ère",           animal:"🐄", walk:true,  rate:3,   price:20,  perish:12 },
  bois:  { label:"Bois",  e:"🪵", unit:"bûcheron", units:"bûcherons", who:"Bûcheron·ne",          animal:"🌲", walk:false, rate:2,   price:30,  perish:null },
  laine: { label:"Laine", e:"🧶", unit:"mouton",   units:"moutons",   who:"Berger·ère",           animal:"🐑", walk:true,  rate:1,   price:60,  perish:null },
  miel:  { label:"Miel",  e:"🍯", unit:"ruche",    units:"ruches",    who:"Apiculteur·rice",      animal:"🐝", walk:true,  rate:0.5, price:120, perish:null },
};
const ORDER = ["oeufs","ble","lait","bois","laine","miel"];
const perRate = r => r.rate >= 1 ? `${r.rate} / h` : `1 / ${Math.round(1 / r.rate)} h`;
const fmtN = n => Math.floor(n).toLocaleString("fr-FR");
const fmtDur = ms => {
  if (ms <= 0) return "maintenant";
  const m = Math.round(ms / 60000); if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${String(r).padStart(2,"0")}` : `${h} h`;
};
const errText = e => {
  const m = String((e && (e.message || e.error_description)) || e || "");
  if (m.includes("spécialité déjà prise")) return "Quelqu'un vient de prendre cette spécialité. Choisis-en une autre.";
  if (m.includes("partie complète")) return "Les 6 places sont prises.";
  if (m.includes("déjà inscrit")) return "Tu as déjà une ferme, mais ce téléphone n'a pas ta clé. Demande à Naïm de te la redonner.";
  if (m.includes("stock insuffisant")) return "Tu n'as plus assez en stock.";
  if (m.includes("trop tard")) return "Trop tard, il s'est envolé !";
  if (m.includes("jeton inconnu")) return "Ta clé de ferme n'est plus valable.";
  if (/fetch|network|Failed/i.test(m)) return "Pas de connexion. Réessaie dans un instant.";
  return "Oups, ça n'a pas marché. Réessaie.";
};
const rpc = async (fn, args) => { const { data, error } = await db().rpc(fn, args); if (error) throw error; return data; };

/* =================== Petits effets =================== */
let actx = null;
function sound(kind){
  try{
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    const f = kind === "coin" ? [988, 1319] : kind === "gold" ? [784, 1568] : [660, 880];
    o.type = kind === "coin" ? "square" : "sine";
    o.frequency.setValueAtTime(f[0], t); o.frequency.setValueAtTime(f[1], t + 0.06);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === "coin" ? 0.05 : 0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === "gold" ? 0.5 : 0.18));
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.55);
  }catch(e){}
}
const buzz = ms => { try{ navigator.vibrate && navigator.vibrate(ms); }catch(e){} };
function toast(html, kind){
  document.getElementById("bn-toast")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div id="bn-toast" class="bn-toast ${kind || ""}" role="status">${html}</div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("bn-toast")?.classList.add("on")));
  clearTimeout(toast.t); toast.t = setTimeout(() => { const t = document.getElementById("bn-toast"); if (t){ t.classList.remove("on"); setTimeout(() => t.remove(), 400); } }, 2600);
}
function floatText(x, y, text, gold){
  const d = document.createElement("div");
  d.className = "bn-float" + (gold ? " gold" : ""); d.textContent = text;
  d.style.left = x + "px"; d.style.top = y + "px";
  document.body.appendChild(d); setTimeout(() => d.remove(), 1000);
}

/* =================== Styles =================== */
const CSS = `
.bn{display:flex;flex-direction:column;gap:14px;padding-bottom:12px;-webkit-user-select:none;user-select:none}
.bn h1{margin:0;font-family:var(--f-display);font-style:italic;font-weight:400;font-size:40px;line-height:1}
.bn .bn-sub{margin:0;color:var(--label2);font-size:15px;line-height:1.4}
.bn-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}
.bn-purse{display:flex;align-items:center;gap:6px;background:var(--card);border-radius:999px;padding:7px 13px;font:700 17px var(--f);font-variant-numeric:tabular-nums;box-shadow:0 1px 3px rgba(0,0,0,.08);white-space:nowrap}
.bn-purse.bump{animation:bn-bump .5s ease}
@keyframes bn-bump{40%{transform:scale(1.15)}}
.bn-who{display:flex;align-items:center;gap:8px;color:var(--label2);font-size:14px;margin-top:-6px}
.bn-chip{background:var(--fill2);color:var(--accent);border-radius:999px;padding:3px 10px;font-weight:600;font-size:13px}
/* Scène */
.bn-scene{position:relative;border-radius:22px;overflow:hidden;aspect-ratio:16/11;touch-action:none;box-shadow:0 2px 10px rgba(60,20,10,.12)}
.bn-scene svg.bn-bg{position:absolute;inset:0;width:100%;height:100%;display:block}
.bn-animal{position:absolute;font-size:30px;line-height:1;transform:translate(-50%,-50%);pointer-events:none;filter:drop-shadow(0 2px 1px rgba(0,0,0,.15))}
.bn-animal.w{animation:bn-walk var(--d,14s) ease-in-out infinite alternate;animation-delay:var(--dl,0s)}
.bn-animal.s{animation:bn-sway 3.5s ease-in-out infinite alternate;animation-delay:var(--dl,0s);transform-origin:50% 100%}
.bn-animal.f{animation:bn-fly 6s ease-in-out infinite;animation-delay:var(--dl,0s);font-size:20px}
@keyframes bn-walk{0%{transform:translate(-50%,-50%) translateX(var(--a,-40px)) scaleX(1)}49%{transform:translate(-50%,-50%) translateX(var(--b,40px)) scaleX(1)}50%{transform:translate(-50%,-50%) translateX(var(--b,40px)) scaleX(-1)}100%{transform:translate(-50%,-50%) translateX(var(--a,-40px)) scaleX(-1)}}
@keyframes bn-sway{from{transform:translate(-50%,-50%) rotate(-4deg)}to{transform:translate(-50%,-50%) rotate(4deg)}}
@keyframes bn-fly{0%,100%{transform:translate(-50%,-50%) translate(0,0)}25%{transform:translate(-50%,-50%) translate(22px,-14px)}50%{transform:translate(-50%,-50%) translate(-8px,-24px)}75%{transform:translate(-50%,-50%) translate(-24px,-6px)}}
.bn-item{position:absolute;transform:translate(-50%,-50%);font-size:26px;line-height:1;border:0;background:none;padding:6px;cursor:pointer;-webkit-tap-highlight-color:transparent;animation:bn-pop .35s ease both;filter:drop-shadow(0 2px 1px rgba(0,0,0,.2))}
.bn-item .n{position:absolute;right:-2px;bottom:-2px;font:700 11px var(--f);background:var(--card);color:var(--label);border-radius:999px;padding:1px 5px;box-shadow:0 1px 2px rgba(0,0,0,.2)}
@keyframes bn-pop{from{transform:translate(-50%,-50%) scale(0)}}
.bn-item.got{animation:bn-got .45s ease forwards;pointer-events:none}
@keyframes bn-got{to{transform:translate(-50%,-160%) scale(1.3);opacity:0}}
.bn-item.gold{font-size:34px;filter:drop-shadow(0 0 8px #FFD24A) drop-shadow(0 0 3px #FFB800) sepia(1) saturate(4) hue-rotate(5deg);animation:bn-pop .35s ease both,bn-shine .8s ease-in-out infinite alternate}
@keyframes bn-shine{to{transform:translate(-50%,-50%) scale(1.15)}}
.bn-rain{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(transparent 0 60%,rgba(255,255,255,.55) 60% 100%);background-size:2px 22px;opacity:.35;animation:bn-rain .5s linear infinite;mask-image:linear-gradient(#000,transparent 85%);-webkit-mask-image:linear-gradient(#000,transparent 85%)}
@keyframes bn-rain{to{background-position:0 22px}}
.bn-cloud{position:absolute;font-size:34px;opacity:.9;animation:bn-cloud linear infinite;pointer-events:none}
@keyframes bn-cloud{from{transform:translateX(-80px)}to{transform:translateX(480px)}}
.bn-scene .bn-tag{position:absolute;left:10px;top:10px;background:rgba(0,0,0,.28);color:#fff;font:600 12px var(--f);border-radius:999px;padding:4px 9px;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
/* Jauge + bouton */
.bn-gauge{background:var(--card);border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.bn-gauge .row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:15px}
.bn-gauge .row b{font-size:17px;font-variant-numeric:tabular-nums}
.bn-gauge .row span{color:var(--label2);font-size:14px;text-align:right}
.bn-bar{height:10px;border-radius:999px;background:var(--fill2);overflow:hidden}
.bn-bar i{display:block;height:100%;border-radius:999px;background:var(--accent);transition:width .6s ease}
.bn-gauge.full .bn-bar i{background:#D92D20;animation:bn-blink 1s ease-in-out infinite alternate}
.bn-gauge.full .row span{color:#D92D20;font-weight:600}
@keyframes bn-blink{to{opacity:.55}}
.bn-btn{display:flex;align-items:center;justify-content:center;gap:8px;height:52px;border-radius:15px;border:0;background:var(--accent);color:var(--on-accent);font:600 17px var(--f);width:100%;cursor:pointer;-webkit-tap-highlight-color:transparent}
.bn-btn:active{transform:scale(.98)}
.bn-btn[disabled]{opacity:.45;cursor:default;transform:none}
.bn-btn.ghost{background:var(--fill2);color:var(--accent)}
.bn-btn.small{height:38px;border-radius:11px;font-size:15px;width:auto;padding:0 14px}
/* Stock */
.bn-sec{font:600 13px var(--f);text-transform:uppercase;letter-spacing:.06em;color:var(--label2);margin:6px 4px -6px}
.bn-list{background:var(--card);border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.bn-line{display:flex;align-items:center;gap:12px;padding:12px 14px}
.bn-line + .bn-line{border-top:.5px solid var(--sep)}
.bn-line .ico{font-size:28px;width:34px;text-align:center}
.bn-line .txt{flex:1;min-width:0}
.bn-line .txt b{display:block;font-size:16px;font-variant-numeric:tabular-nums}
.bn-line .txt small{display:block;color:var(--label2);font-size:13px;margin-top:2px}
.bn-line .txt small.warn{color:#D92D20}
.bn-empty{padding:16px;color:var(--label2);font-size:15px;text-align:center}
.bn-hint{background:var(--soft);border-radius:16px;padding:12px 14px;font-size:14px;line-height:1.45;display:flex;gap:10px;align-items:flex-start}
.bn-hint .i{font-size:20px}
/* Choix de spécialité */
.bn-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bn-card{background:var(--card);border:2px solid transparent;border-radius:18px;padding:14px 12px;text-align:left;display:flex;flex-direction:column;gap:4px;font:inherit;color:var(--label);cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.06);-webkit-tap-highlight-color:transparent}
.bn-card .big{font-size:36px;line-height:1.1}
.bn-card b{font-size:17px}
.bn-card small{color:var(--label2);font-size:13px;line-height:1.35}
.bn-card.on{border-color:var(--accent);background:var(--fill)}
.bn-card[disabled]{opacity:.5;cursor:default;filter:grayscale(.7)}
.bn-card .taken{color:var(--accent);font-weight:600}
.bn-err{color:#D92D20;font-size:14px;text-align:center;min-height:1em}
.bn-load{padding:40px 0;text-align:center;color:var(--label2)}
/* Annonce */
.bn-ann{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:rgba(20,8,4,.45);padding:24px;animation:bn-fade .25s ease}
.bn-ann .box{background:var(--card);color:var(--label);border-radius:24px;max-width:380px;width:100%;padding:22px 20px 18px;text-align:center;animation:bn-up .45s cubic-bezier(.2,1.4,.4,1) both;box-shadow:0 10px 40px rgba(0,0,0,.3)}
.bn-ann .big{font-size:54px;line-height:1;margin-bottom:8px}
.bn-ann h2{margin:0 0 8px;font-family:var(--f-display);font-weight:400;font-size:30px}
.bn-ann p{margin:0 0 16px;color:var(--label2);font-size:15px;line-height:1.45}
@keyframes bn-fade{from{opacity:0}}
@keyframes bn-up{from{transform:translateY(30px) scale(.9);opacity:0}}
.bn-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 12px);transform:translate(-50%,-140%);z-index:95;background:var(--label);color:var(--bg);font:600 15px var(--f);border-radius:999px;padding:10px 18px;box-shadow:0 6px 20px rgba(0,0,0,.25);transition:transform .35s cubic-bezier(.2,1.3,.4,1);white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis}
.bn-toast.on{transform:translate(-50%,0)}
.bn-toast.gold{background:#E8A500;color:#2A1A00}
.bn-float{position:fixed;z-index:96;transform:translate(-50%,-50%);font:800 18px var(--f);color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.55);pointer-events:none;animation:bn-floatup 1s ease-out forwards}
.bn-float.gold{color:#FFD24A;font-size:24px}
@keyframes bn-floatup{to{transform:translate(-50%,-260%);opacity:0}}
@media (prefers-reduced-motion: reduce){.bn-animal,.bn-cloud,.bn-rain{animation:none!important}}
`;
const st = document.createElement("style"); st.id = "bn-style"; st.textContent = CSS; document.head.appendChild(st);

/* =================== État =================== */
let S = null;               // dernier état renvoyé par le serveur
let fetchedAt = 0;          // Date.now() à la réception
let collected = 0;          // produits ramassés au doigt, pas encore envoyés au serveur
let harvestTimer = null, busy = false, golden = null, rootEl = null, picking = null, pickData = null;

function farm(){ return S && S.farms && S.farms[0]; }
function livePending(){
  const f = farm(); if (!f) return 0;
  const v = Number(f.pending) + Number(f.rate_per_h) * (Date.now() - fetchedAt) / 3600000;
  return Math.min(Number(f.cap), v);
}
function setState(s){ S = s; fetchedAt = Date.now(); }

/* =================== Montage dans l'onglet =================== */
function mount(){
  const root = document.getElementById("bn-root");
  if (!root || root.dataset.bn === "1") return;
  root.dataset.bn = "1"; rootEl = root;
  const me = Q.me();
  if (!me){ root.innerHTML = `<div class="bn-load">Crée d'abord ton profil Querida.</div>`; return; }
  if (Q.demo()){ root.innerHTML = `<div class="bn"><h1>Le Baron</h1><p class="bn-sub">Le jeu a besoin de la vraie base de Querida (pas dispo en démo).</p></div>`; return; }
  if (!getToken()) return showPick();
  if (S){ drawFarm(); refresh(); } else { root.innerHTML = `<div class="bn-load">Ouverture de ta ferme…</div>`; refresh(true); }
}
let md = false;
new MutationObserver(() => { if (md) return; md = true; requestAnimationFrame(() => { md = false; try{ mount(); }catch(e){} }); })
  .observe(document.body, { childList:true, subtree:true });
const alive = () => rootEl && document.body.contains(rootEl);

async function refresh(first){
  try{
    setState(await rpc("baron_state", { p_token: getToken() }));
    if (alive()) drawFarm();
    if (first){ welcome(); setTimeout(rollGolden, 4000); }
  }catch(e){
    const m = String(e && e.message || "");
    if (m.includes("jeton inconnu")){ setToken(null); S = null; if (alive()) showPick(); return; }
    if (alive() && !S) rootEl.innerHTML = `<div class="bn"><h1>Le Baron</h1><p class="bn-err">${esc(errText(e))}</p><button class="bn-btn ghost" data-bn="retry">Réessayer</button></div>`;
  }
}

/* =================== Choix de la spécialité =================== */
async function showPick(){
  if (!alive()) return;
  rootEl.innerHTML = `<div class="bn-load">Le Baron se prépare…</div>`;
  try{
    const { data, error } = await db().from("baron_players").select("id,name,specialty");
    if (error) throw error;
    pickData = data || [];
  }catch(e){
    rootEl.innerHTML = `<div class="bn"><h1>Le Baron</h1><p class="bn-err">${esc(errText(e))}</p><button class="bn-btn ghost" data-bn="pick-retry">Réessayer</button></div>`;
    return;
  }
  drawPick();
}
function drawPick(err){
  if (!alive()) return;
  const me = Q.me(), taken = Object.fromEntries(pickData.map(p => [p.specialty, p]));
  const mine = pickData.find(p => p.id === me.id);
  if (mine){
    rootEl.innerHTML = `<div class="bn"><h1>Le Baron</h1>
      <div class="bn-hint"><span class="i">🔑</span><span>Tu as déjà une ferme (${esc(RES[mine.specialty].label)}), mais ce téléphone n'a pas ta clé. Demande à Naïm de te la redonner.</span></div></div>`;
    return;
  }
  const full = pickData.length >= 6;
  rootEl.innerHTML = `<div class="bn">
    <div><h1>Le Baron</h1></div>
    <p class="bn-sub">Deviens le plus riche du groupe. Choisis ta spécialité : il n'y a qu'une place pour chacune, et ce choix est définitif. Au départ, toutes rapportent autant ; les plus rares bougent plus sur le marché.</p>
    <div class="bn-chip" style="align-self:flex-start">${pickData.length} / 6 places prises</div>
    ${full ? `<div class="bn-hint"><span class="i">🏰</span><span>Les 6 places sont prises. La partie continue sans toi pour l'instant.</span></div>` : ""}
    <div class="bn-grid">${ORDER.map(k => {
      const r = RES[k], t = taken[k];
      return `<button class="bn-card ${picking === k ? "on" : ""}" data-bn="pick" data-k="${k}" ${t || full ? "disabled" : ""}>
        <span class="big">${r.e}</span><b>${r.label}</b>
        <small>${perRate(r)} · ${r.price} pièces</small>
        <small>${t ? `<span class="taken">Pris par ${esc(t.name)}</span>` : r.perish ? `Se périme en ${r.perish} h` : "Ne se périme pas"}</small>
      </button>`; }).join("")}</div>
    <p class="bn-err">${err ? esc(err) : ""}</p>
    <button class="bn-btn" data-bn="join" ${picking && !taken[picking] && !full ? "" : "disabled"}>${picking ? `Devenir ${esc(RES[picking].who.toLowerCase())}` : "Choisis une spécialité"}</button>
  </div>`;
}
async function join(){
  if (busy || !picking) return; busy = true;
  const btn = rootEl.querySelector('[data-bn="join"]'); if (btn){ btn.disabled = true; btn.textContent = "Installation de ta ferme…"; }
  try{
    const me = Q.me();
    const token = await rpc("baron_join", { p_profile: String(me.id), p_name: String(me.name || "Ami").slice(0, 30), p_resource: picking });
    setToken(token); busy = false;
    rootEl.innerHTML = `<div class="bn-load">Ouverture de ta ferme…</div>`;
    await refresh(true);
  }catch(e){
    busy = false;
    try{ const { data } = await db().from("baron_players").select("id,name,specialty"); pickData = data || pickData; }catch(_){}
    if (String(e.message || "").includes("spécialité déjà prise")) picking = null;
    drawPick(errText(e));
  }
}

/* =================== La ferme =================== */
function sky(){
  const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
  if (h < 6 || h >= 21.5) return { top:"#141B38", bot:"#2E3A68", ground:"#2F5A35", hill:"#244A2B", night:true, h };
  if (h < 8)    return { top:"#F6A97E", bot:"#FCE3C8", ground:"#7FB35A", hill:"#5E9A45", h };
  if (h < 18)   return { top:"#9FD3F0", bot:"#E3F4FB", ground:"#8CC063", hill:"#69A64B", h };
  if (h < 20)   return { top:"#F2873B", bot:"#F9C9A0", ground:"#6E9E4F", hill:"#55873E", h };
  return { top:"#5B2A6E", bot:"#E07A5F", ground:"#4F7D3E", hill:"#3E6A31", h };
}
function weather(){
  // la même météo pour tout le monde, qui change chaque jour
  const d = new Date(); const n = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) * 2654435761 >>> 0;
  const r = (n % 100) / 100; return r < 0.5 ? "soleil" : r < 0.8 ? "nuages" : "pluie";
}
function sceneSVG(){
  const k = sky(), w = weather();
  // soleil ou lune, qui traverse le ciel selon l'heure
  const frac = k.night ? (((k.h + 24 - 21.5) % 24) / 8.5) : Math.min(1, Math.max(0, (k.h - 6) / 15.5));
  const cx = 30 + frac * 300, cy = 70 - Math.sin(frac * Math.PI) * 48;
  const stars = k.night ? Array.from({ length: 18 }, (_, i) => `<circle cx="${(i * 73) % 360}" cy="${8 + (i * 37) % 80}" r="${i % 3 ? 0.9 : 1.4}" fill="#fff" opacity="${0.5 + (i % 4) / 8}"/>`).join("") : "";
  const orb = k.night
    ? `<circle cx="${cx}" cy="${cy}" r="12" fill="#F4F1DE"/><circle cx="${cx + 5}" cy="${cy - 3}" r="11" fill="${k.top}"/>`
    : (w === "pluie" ? "" : `<circle cx="${cx}" cy="${cy}" r="15" fill="#FFD45E"/><circle cx="${cx}" cy="${cy}" r="22" fill="#FFD45E" opacity=".25"/>`);
  const gray = w === "pluie" && !k.night ? `<rect width="360" height="248" fill="#7B8794" opacity=".35"/>` : "";
  return `<svg class="bn-bg" viewBox="0 0 360 248" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="bn-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${k.top}"/><stop offset="1" stop-color="${k.bot}"/></linearGradient></defs>
    <rect width="360" height="248" fill="url(#bn-sky)"/>${stars}${orb}${gray}
    <path d="M0 128 Q60 96 130 120 T260 112 T360 118 V248 H0Z" fill="${k.hill}"/>
    <path d="M0 140 Q90 124 180 136 T360 132 V248 H0Z" fill="${k.ground}"/>
    <g transform="translate(262 88)">
      <rect x="0" y="22" width="62" height="40" fill="#B5432B"/><path d="M-6 24 L31 0 L68 24Z" fill="#7A2E1F"/>
      <rect x="22" y="36" width="18" height="26" fill="#5A2216"/><path d="M22 36 L40 62 M40 36 L22 62" stroke="#E9C7A8" stroke-width="2"/>
      <rect x="6" y="30" width="10" height="9" fill="${k.night ? "#FFD45E" : "#F6E7D4"}"/><rect x="46" y="30" width="10" height="9" fill="${k.night ? "#FFD45E" : "#F6E7D4"}"/>
    </g>
    <g stroke="#E9D3B6" stroke-width="3" stroke-linecap="round" opacity=".9">
      <path d="M8 212 H230"/><path d="M8 226 H230"/>${Array.from({ length: 9 }, (_, i) => `<path d="M${12 + i * 27} 204 V234"/>`).join("")}
    </g>
    ${k.night ? `<rect width="360" height="248" fill="#0B1030" opacity=".28"/>` : ""}
  </svg>`;
}
// Emplacements des produits au sol (en %)
const SLOTS = [[30,66],[52,80],[18,88],[74,80],[44,64],[34,92],[60,92],[14,76],[62,66],[86,90],[32,79],[84,72]];
function animalsHTML(f){
  const r = RES[f.resource], n = Math.min(6, f.units);
  return Array.from({ length: n }, (_, i) => {
    const x = 22 + i * 11 + (i % 2) * 4, y = r.walk ? (i % 2 ? 66 : 58) : 50 + (i % 2) * 6;
    if (f.resource === "miel") return `<div class="bn-animal f" style="left:${80 - i * 6}%;top:${40 + i * 4}%;--dl:-${i * 1.3}s">🐝</div>` + (i === 0 ? `<div class="bn-animal" style="left:82%;top:58%;font-size:30px">🌼</div>` : "");
    if (f.resource === "bois") return `<div class="bn-animal s" style="left:${10 + i * 9}%;top:${44 + (i % 2) * 4}%;font-size:36px;--dl:-${i}s">🌲</div>`;
    if (f.resource === "ble") return `<div class="bn-animal s" style="left:${14 + i * 10}%;top:${54 + (i % 2) * 5}%;font-size:28px;--dl:-${i * 0.7}s">🌾</div><div class="bn-animal s" style="left:${18 + i * 10}%;top:${58 + (i % 2) * 5}%;font-size:24px;--dl:-${i * 0.5}s">🌾</div>`;
    return `<div class="bn-animal w" style="left:${x}%;top:${y}%;--d:${11 + i * 3}s;--dl:-${i * 2.5}s;--a:-${30 + i * 4}px;--b:${30 + i * 5}px">${r.animal}</div>`;
  }).join("") + (f.resource === "oeufs" ? `<div class="bn-animal" style="left:12%;top:47%;font-size:24px">🏠</div>` : "");
}
function itemsHTML(){
  const f = farm(); if (!f) return "";
  const total = Math.max(0, Math.floor(livePending()) - collected);
  const n = Math.min(SLOTS.length, total);
  if (!n) return "";
  const base = Math.floor(total / n), extra = total % n, e = RES[f.resource].e;
  return Array.from({ length: n }, (_, i) => {
    const v = base + (i < extra ? 1 : 0), [x, y] = SLOTS[i];
    return `<button class="bn-item" data-bn="item" data-v="${v}" style="left:${x}%;top:${y}%;animation-delay:${i * 30}ms" aria-label="Ramasser ${v} ${esc(RES[f.resource].label)}">${e}${v > 1 ? `<span class="n">${v}</span>` : ""}</button>`;
  }).join("");
}
function gaugeData(){
  const f = farm(), p = livePending(), cap = Number(f.cap), ready = Math.max(0, Math.floor(p) - collected);
  const full = p >= cap - 1e-6, pct = Math.min(100, (p / cap) * 100);
  const left = (cap - p) / Number(f.rate_per_h) * 3600000;
  return { e: RES[f.resource].e, ready, full, pct, txt: full ? "Ferme pleine : la production est perdue !" : `Pleine dans ${fmtDur(left)}` };
}
function gaugeHTML(){
  const d = gaugeData();
  return `<div class="bn-gauge ${d.full ? "full" : ""}" id="bn-gauge">
    <div class="row"><b id="bn-g-ready">${d.e} ${d.ready} à ramasser</b><span id="bn-g-left">${d.txt}</span></div>
    <div class="bn-bar"><i id="bn-g-fill" style="width:${d.pct.toFixed(1)}%"></i></div>
    <button class="bn-btn" data-bn="all" id="bn-g-btn" ${d.ready ? "" : "disabled"}>Tout récolter</button>
  </div>`;
}
function updateGauge(){
  const g = document.getElementById("bn-gauge"); if (!g) return; const d = gaugeData();
  g.classList.toggle("full", d.full);
  const set = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== v) el.textContent = v; };
  set("bn-g-ready", `${d.e} ${d.ready} à ramasser`); set("bn-g-left", d.txt);
  const fill = document.getElementById("bn-g-fill"); if (fill) fill.style.width = d.pct.toFixed(1) + "%";
  const btn = document.getElementById("bn-g-btn"); if (btn) btn.disabled = !d.ready || busy;
}
function stockHTML(){
  const rate = Number(S.sell_rate || 0.7);
  if (!S.stocks.length) return `<div class="bn-list"><div class="bn-empty">Ton stock est vide. Ramasse ta production !</div></div>`;
  return `<div class="bn-list">${S.stocks.map(s => {
    const r = RES[s.resource], price = Number(S.market[s.resource] || r.price);
    const unit = price * rate, gain = Math.floor(price * rate * (1 - Math.pow(0.99, s.qty)) / 0.01);
    const exp = s.next_expiry ? new Date(s.next_expiry).getTime() - Date.now() : null;
    return `<div class="bn-line"><span class="ico">${r.e}</span>
      <div class="txt"><b>${fmtN(s.qty)} ${esc(r.label.toLowerCase())}</b>
        <small>${unit.toLocaleString("fr-FR", { maximumFractionDigits:1 })} pièces l'unité au marché</small>
        ${exp !== null ? `<small class="${exp < 3 * 3600000 ? "warn" : ""}">Les premiers se périment dans ${fmtDur(exp)}</small>` : ""}</div>
      <button class="bn-btn small" data-bn="sell" data-k="${s.resource}" data-q="${s.qty}">Vendre · ${fmtN(gain)} 🪙</button>
    </div>`; }).join("")}</div>`;
}
function drawFarm(){
  if (!alive() || !S || !farm()) return;
  const f = farm(), r = RES[f.resource], p = S.player;
  const w = weather();
  rootEl.innerHTML = `<div class="bn">
    <div class="bn-head"><h1>Ma ferme</h1><div class="bn-purse" id="bn-purse">🪙 <span>${fmtN(p.coins)}</span></div></div>
    <div class="bn-who"><span class="bn-chip">${r.e} ${esc(r.who)}</span><span>${f.units} ${f.units > 1 ? r.units : r.unit} · ${perRate({ rate: Number(f.rate_per_h) })}</span></div>
    <div class="bn-scene" id="bn-scene">${sceneSVG()}
      ${w !== "soleil" ? `<div class="bn-cloud" style="top:6%;animation-duration:70s;animation-delay:-20s">☁️</div><div class="bn-cloud" style="top:16%;font-size:26px;animation-duration:95s;animation-delay:-60s">☁️</div>` : ""}
      ${w === "pluie" ? `<div class="bn-rain"></div>` : ""}
      ${animalsHTML(f)}
      <div id="bn-items">${itemsHTML()}</div>
      <span class="bn-tag">${w === "pluie" ? "🌧️ Pluie" : w === "nuages" ? "⛅ Nuageux" : sky().night ? "🌙 Nuit" : "☀️ Beau temps"}</span>
    </div>
    ${gaugeHTML()}
    ${!p.first_sale_at ? `<div class="bn-hint"><span class="i">💡</span><span>Vends ta première récolte au marché : ça débloquera l'achat de nouvelles ${esc(r.units)}.</span></div>` : ""}
    <div class="bn-sec">Mon stock</div>
    ${stockHTML()}
  </div>`;
  if (golden) showGolden();
}
// Mise à jour légère chaque seconde (sans redessiner la scène)
setInterval(() => {
  try{
    if (!alive() || !S || !farm()) return;
    updateGauge();
    const box = document.getElementById("bn-items"); if (!box) return;
    const want = Math.min(SLOTS.length, Math.max(0, Math.floor(livePending()) - collected));
    const have = box.querySelectorAll(".bn-item:not(.got)").length;
    if (want !== have && !box.querySelector(".got")) box.innerHTML = itemsHTML();
  }catch(e){}
}, 1000);
// Resynchronisation avec le serveur toutes les minutes
setInterval(() => { if (alive() && S && !busy && !collected && document.visibilityState === "visible") refresh(); }, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && alive() && S) refresh(); });

/* =================== Récolte =================== */
function grab(el){
  if (!el || el.classList.contains("got")) return;
  const v = +el.dataset.v || 1, b = el.getBoundingClientRect();
  el.classList.add("got"); collected += v;
  floatText(b.left + b.width / 2, b.top, `+${v}`); sound("pop"); buzz(8);
  setTimeout(() => el.remove(), 450);
  updateGauge();
  clearTimeout(harvestTimer); harvestTimer = setTimeout(harvest, 900);
}
async function harvest(all){
  clearTimeout(harvestTimer);
  if (busy) { harvestTimer = setTimeout(harvest, 400); return; }
  busy = true;
  if (all) document.querySelectorAll("#bn-items .bn-item:not(.got)").forEach((el, i) => setTimeout(() => grab(el), i * 45));
  if (all) await new Promise(r => setTimeout(r, 120 + 45 * 12));
  clearTimeout(harvestTimer);
  try{
    const res = await rpc("baron_harvest", { p_token: getToken() });
    collected = 0; setState(res.state);
    const g = (res.gains || [])[0];
    if (g) toast(`+${g.qty} ${RES[g.resource].e} dans ton stock`);
    drawFarm();
  }catch(e){ collected = 0; toast(esc(errText(e))); refresh(); }
  busy = false;
}

/* =================== Vente instantanée =================== */
async function sell(k, q){
  if (busy) return; busy = true;
  try{
    const firstSale = !S.player.first_sale_at;
    const res = await rpc("baron_sell", { p_token: getToken(), p_resource: k, p_qty: q });
    setState(res.state); drawFarm();
    const purse = document.getElementById("bn-purse");
    if (purse){ purse.classList.add("bump"); const b = purse.getBoundingClientRect(); floatText(b.left + b.width / 2, b.bottom, `+${fmtN(res.earned)} 🪙`); }
    sound("coin"); buzz(15);
    toast(`Vendu ! +${fmtN(res.earned)} pièces`);
    if (firstSale) setTimeout(() => announce("🎉", "Première vente !", `Bravo, tes premières pièces. Bientôt, tu pourras acheter de nouvelles ${esc(RES[farm().resource].units)} pour produire plus.`, "Super", "firstsale"), 900);
  }catch(e){ toast(esc(errText(e))); refresh(); }
  busy = false;
}

/* =================== Produit doré =================== */
async function rollGolden(){
  try{
    if (!alive() || !S || golden || document.visibilityState !== "visible") return;
    const g = await rpc("baron_golden_roll", { p_token: getToken() });
    if (g && g.id){ golden = { id: g.id, until: Date.now() + Math.max(2000, new Date(g.until).getTime() - new Date(S.now).getTime() - (Date.now() - fetchedAt)) }; showGolden(); }
  }catch(e){}
}
setInterval(rollGolden, 45000); setTimeout(rollGolden, 5000);
function showGolden(){
  const sc = document.getElementById("bn-scene"); if (!sc || !golden) return;
  if (Date.now() > golden.until){ golden = null; return; }
  if (sc.querySelector(".bn-item.gold")) return;
  const [x, y] = [20 + Math.random() * 55, 58 + Math.random() * 24];
  sc.insertAdjacentHTML("beforeend", `<button class="bn-item gold" data-bn="gold" style="left:${x}%;top:${y}%" aria-label="Produit doré">${RES[farm().resource].e}</button>`);
  buzz([10, 40, 10]); sound("gold");
  const left = golden.until - Date.now();
  setTimeout(() => { const el = document.querySelector(".bn-item.gold:not(.got)"); if (el){ el.classList.add("got"); setTimeout(() => el.remove(), 450); } golden = null; }, left);
}
async function claimGolden(el){
  if (!golden) return; const id = golden.id; golden = null;
  const b = el.getBoundingClientRect(); el.classList.add("got");
  floatText(b.left + b.width / 2, b.top, "×50 !", true); sound("gold"); buzz(30);
  try{
    const res = await rpc("baron_golden_claim", { p_token: getToken(), p_id: id });
    setState(res.state);
    toast(`✨ Produit doré : +50 ${RES[farm().resource].e} !`, "gold");
    setTimeout(drawFarm, 500);
  }catch(e){ toast(esc(errText(e))); }
}

/* =================== Annonces (découverte progressive) =================== */
function announce(big, title, text, ok, key){
  if (key && seen(key)) return; if (key) markSeen(key);
  document.querySelector(".bn-ann")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="bn-ann" data-bn="ann-close"><div class="box" role="dialog" aria-modal="true">
    <div class="big">${big}</div><h2>${title}</h2><p>${text}</p><button class="bn-btn" data-bn="ann-close">${ok}</button></div></div>`);
}
function welcome(){
  const f = farm(); if (!f) return; const r = RES[f.resource];
  announce(r.e, "Bienvenue dans ta ferme", `Ta première ${esc(r.unit)} produit ${perRate({ rate: Number(f.rate_per_h) })}. Tape ou glisse ton doigt sur les ${esc(r.label.toLowerCase())} pour les ramasser, puis vends-les au marché. Attention : au bout de 8 h, ta ferme est pleine et le reste est perdu. Et ouvre l'œil : parfois, un produit doré apparaît quelques secondes…`, "C'est parti", "welcome");
}

/* =================== Interactions =================== */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-bn]"); if (!t) return;
  const a = t.dataset.bn;
  if (a === "pick"){ picking = t.dataset.k; drawPick(); buzz(5); }
  else if (a === "join") join();
  else if (a === "pick-retry") showPick();
  else if (a === "retry"){ rootEl.innerHTML = `<div class="bn-load">Ouverture de ta ferme…</div>`; refresh(true); }
  else if (a === "item") grab(t);
  else if (a === "all") harvest(true);
  else if (a === "sell") sell(t.dataset.k, +t.dataset.q);
  else if (a === "gold") claimGolden(t);
  else if (a === "ann-close" && (t.tagName === "BUTTON" || e.target === t)) document.querySelector(".bn-ann")?.remove();
});
// Glisser le doigt sur les produits pour les ramasser
let sweeping = false;
document.addEventListener("pointerdown", e => { if (e.target.closest && e.target.closest("#bn-scene")) sweeping = true; }, { passive:true });
document.addEventListener("pointerup", () => { sweeping = false; }, { passive:true });
document.addEventListener("pointercancel", () => { sweeping = false; }, { passive:true });
document.addEventListener("pointermove", e => {
  if (!sweeping) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const it = el && el.closest && el.closest(".bn-item");
  if (!it) return;
  if (it.dataset.bn === "gold") claimGolden(it); else grab(it);
}, { passive:true });

mount();

}catch(err){ /* Le Baron ne doit jamais gêner l'appli */ }
})();
