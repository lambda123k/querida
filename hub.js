/* Querida · L'Arcade : un bouton en haut de l'écran qui rassemble tous les jeux trouvés dans l'appli.
   Les jeux pas encore trouvés apparaissent verrouillés, avec un indice pour les dénicher.
   Chaque jeu s'inscrit lui-même dans window.QUERIDA_GAMES ; un jeu est « trouvé » quand on l'a ouvert
   une fois par sa cachette (localStorage « qh_found »), ou si on y a déjà un record.
   Fichier à part, préfixe « qh- » partout ; une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{

const Q = window.QUERIDA;
if (!Q || (Q.role() !== "ami" && Q.role() !== "romane")) return;
const ROMANE = Q.role() === "romane";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const R = () => window.QUERIDA_GAMES || {};

const ic = (bg, inner) => `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="${bg}"/>${inner}</svg>`;
const CATALOG = [
  { id:"tour",     name:"La Tour",          what:"Empile les étages",            hint:"Une cloche, ça se sonne plusieurs fois de suite.",
    icon: ic("#FCEBD6", `<rect x="12" y="34" width="24" height="6" fill="#F2873B"/><rect x="14" y="27" width="20" height="6" fill="#1E4E9C"/><rect x="16" y="20" width="17" height="6" fill="#CC3F27"/><rect x="18" y="13" width="14" height="6" fill="#7A5A4C"/>`) },
  { id:"chrono",   name:"Le Chrono",        what:"Arrête le temps à l'instinct", hint:"Garde le doigt sur le compteur de jours.",
    icon: ic("#E6EEF7", `<circle cx="24" cy="26" r="12" fill="none" stroke="#1E4E9C" stroke-width="3"/><path d="M24 26 L24 19 M21 11 h6" stroke="#1E4E9C" stroke-width="3" stroke-linecap="round"/><circle cx="24" cy="26" r="2" fill="#CC3F27"/>`) },
  { id:"marathon", name:"Le Marathon",      what:"Tape le plus vite possible",   hint: ROMANE ? "Tape 10 fois très vite sur ton compteur de jours." : "Tape 10 fois très vite sur le nombre de capsules.",
    icon: ic("#FBE3D3", `<circle cx="24" cy="24" r="12" fill="#CC3F27"/><circle cx="24" cy="24" r="12" fill="none" stroke="#9E3320" stroke-width="2"/><path d="M14 10 l3 4 M34 10 l-3 4 M24 7 v5" stroke="#CC3F27" stroke-width="2.5" stroke-linecap="round"/>`) },
  { id:"feuvert",  name:"Le Feu vert",      what:"Tes réflexes",                 hint:"Frappe 3 fois à la porte du Carnet… quand tu y es déjà.",
    icon: ic("#E3F1E7", `<rect x="17" y="8" width="14" height="32" rx="7" fill="#3B1F17"/><circle cx="24" cy="15" r="4" fill="#5a3a30"/><circle cx="24" cy="24" r="4" fill="#5a3a30"/><circle cx="24" cy="33" r="4" fill="#4BD37B"/>`) },
  { id:"oeil",     name:"L'Œil",            what:"Trouve la couleur différente", hint:"Le grand titre a des yeux : touche-le 3 fois.",
    icon: ic("#F1E9F7", `<rect x="10" y="10" width="13" height="13" rx="3" fill="#7B5BB0"/><rect x="25" y="10" width="13" height="13" rx="3" fill="#7B5BB0"/><rect x="10" y="25" width="13" height="13" rx="3" fill="#7B5BB0"/><rect x="25" y="25" width="13" height="13" rx="3" fill="#9579C7"/>`) },
  { id:"diff",     name:"Les Différences",  what:"Qu'est-ce qui a changé ?",     hint:"Déjà sur l'accueil ? Touche encore son onglet, 3 fois.",
    icon: ic("#DDF0FA", `<path d="M0 30 Q24 25 48 29 V48 H0 Z" fill="#9CCB6E"/><circle cx="35" cy="14" r="5" fill="#F6C945"/><rect x="9" y="25" width="13" height="11" fill="#E9B8A8"/><path d="M7 26 L15.5 18 L24 26 Z" fill="#CC3F27"/><circle cx="33" cy="30" r="6" fill="#3E8A3A"/>`) },
  { id:"chiffres", name:"La Mémoire des chiffres", what:"Retiens le nombre",     hint:"La petite ligne au-dessus du titre compte pour toi : touche-la 3 fois.",
    icon: ic("#FFF3D6", `<text x="24" y="31" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-weight="700" font-size="17" fill="#3B1F17">372</text>`) },
];
const PAD = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8h10a5 5 0 015 5v1a4 4 0 01-7 2.6L14 15h-4l-1 1.6A4 4 0 012 14v-1a5 5 0 015-5z"/><path d="M8 11v3M6.5 12.5h3"/><circle cx="16" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.6" cy="13.6" r=".6" fill="currentColor"/></svg>`;
const LOCK = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>`;

function foundList(){ try{ return JSON.parse(localStorage.getItem("qh_found") || "[]"); }catch(e){ return []; } }
function isFound(id){ if (foundList().includes(id)) return true; const g = R()[id]; try{ return !!(g && g.best && g.best()); }catch(e){ return false; } }
const count = () => CATALOG.filter(c => isFound(c.id)).length;

/* =================== Styles =================== */
const CSS = `
.topbar .qh-btn{margin-right:auto;display:inline-flex;align-items:center;gap:6px;background:var(--card);border:0;border-radius:999px;padding:6px 12px 6px 7px;font:600 14px var(--f);color:var(--label);box-shadow:0 1px 3px rgba(0,0,0,.08);cursor:pointer;-webkit-tap-highlight-color:transparent}
.topbar .qh-btn svg{width:22px;height:22px;color:var(--accent)}
.topbar .qh-btn .qh-n{min-width:20px;height:20px;border-radius:999px;background:var(--fill2);color:var(--accent);font-size:12px;font-weight:700;display:grid;place-items:center;padding:0 6px;font-variant-numeric:tabular-nums}
.topbar .qh-btn.qh-new .qh-n{background:var(--accent);color:var(--on-accent);animation:qh-pop .6s ease 2}
@keyframes qh-pop{50%{transform:scale(1.25)}}
.qh-wrap{position:fixed;inset:0;z-index:74;background:var(--bg);color:var(--label);overflow-y:auto;-webkit-overflow-scrolling:touch;animation:qh-in .3s ease;font-family:var(--f);-webkit-user-select:none;user-select:none}
@keyframes qh-in{from{opacity:0;transform:translateY(16px)}}
.qh-in{max-width:520px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 32px);display:flex;flex-direction:column;gap:14px}
.qh-head{display:flex;justify-content:space-between;align-items:center}
.qh-head h1{margin:0;font-family:var(--f-display);font-style:italic;font-weight:400;font-size:42px;line-height:1;display:flex;align-items:center;gap:10px}
.qh-head h1 svg{width:34px;height:34px;color:var(--accent)}
.qh-close{width:40px;height:40px;border-radius:50%;border:0;background:var(--fill2);color:var(--label);font-size:20px;cursor:pointer}
.qh-sub{margin:-6px 0 0;color:var(--label2);font-size:15px}
.qh-prog{height:6px;border-radius:999px;background:var(--fill2);overflow:hidden}
.qh-prog i{display:block;height:100%;background:var(--accent);border-radius:999px}
.qh-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.qh-card{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:14px;border-radius:16px;background:var(--card);border:0;text-align:left;color:var(--label);font:inherit;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.06);transition:transform .1s}
.qh-card:active{transform:scale(.97)}
.qh-card svg.qh-ic{width:48px;height:48px;display:block}
.qh-card b{font-size:16px;font-weight:700;line-height:1.15}
.qh-card small{font-size:13px;color:var(--label2);line-height:1.3}
.qh-card .qh-rec{font-size:12.5px;font-weight:700;color:var(--accent);margin-top:auto}
.qh-card.qh-lock{background:transparent;border:1.5px dashed var(--sep);box-shadow:none;cursor:default}
.qh-card.qh-lock:active{transform:none}
.qh-card.qh-lock .qh-q{width:48px;height:48px;border-radius:12px;background:var(--fill);display:grid;place-items:center;color:var(--label3)}
.qh-card.qh-lock .qh-q svg{width:24px;height:24px}
.qh-card.qh-lock b{color:var(--label2)}
.qh-card.qh-lock small{font-style:italic}
.qh-foot{font-size:13px;color:var(--label3);text-align:center;margin:4px 0 0}
.qh-seg{display:flex;background:var(--fill);border-radius:10px;padding:3px;gap:3px}
.qh-seg button{flex:1;border:0;background:none;padding:8px 4px;border-radius:8px;font:600 14px var(--f);color:var(--label2);cursor:pointer}
.qh-seg button[aria-pressed="true"]{background:var(--card);color:var(--label);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.qh-pod{display:grid;grid-template-columns:1fr 1.15fr 1fr;align-items:end;gap:8px;margin-top:4px}
.qh-pod div{display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;min-width:0}
.qh-pod svg{width:40px;height:40px}
.qh-pod b{font-size:15px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qh-pod small{font-size:12.5px;color:var(--label2)}
.qh-pod i{display:block;width:100%;border-radius:10px 10px 0 0;background:var(--fill2)}
.qh-pod .p1 i{height:70px;background:linear-gradient(#F3D27A,#E8B530)} .qh-pod .p2 i{height:50px;background:linear-gradient(#DCE2E8,#B8C1CC)} .qh-pod .p3 i{height:36px;background:linear-gradient(#E9B88E,#D08A4E)}
.qh-row{width:100%;display:flex;align-items:center;gap:10px;padding:11px 14px;border:0;border-radius:12px;background:var(--card);color:var(--label);font:inherit;text-align:left;cursor:pointer;font-variant-numeric:tabular-nums;margin-top:6px}
.qh-row .qh-rk{width:22px;font-family:var(--f-display);font-size:20px;color:var(--accent);text-align:center}
.qh-row .qh-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qh-row .qh-pt{font-weight:800}
.qh-row .qh-pt small{font-weight:600;color:var(--label2);font-size:12px;margin-left:2px}
.qh-row.qh-me{box-shadow:inset 0 0 0 1.5px var(--rind)}
.qh-det{background:var(--card);border-radius:12px;padding:6px 14px 10px;margin-top:2px;font-size:14px}
.qh-det div{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid var(--sep)}
.qh-det div:last-child{border-bottom:0}
.qh-det span{color:var(--label2)}
.qh-rules{font-size:13px;color:var(--label2);background:var(--card);border-radius:12px;padding:12px 14px;line-height:1.45}
.qh-rules b{color:var(--label)}
.qh-toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 96px);transform:translate(-50%,40px);opacity:0;transition:transform .45s cubic-bezier(.2,1.2,.4,1),opacity .3s;z-index:85;background:var(--label);color:var(--bg);font-weight:600;border-radius:999px;padding:10px 16px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.3);white-space:nowrap;display:flex;align-items:center;gap:8px}
.qh-toast svg{width:20px;height:20px}
.qh-toast.on{transform:translate(-50%,0);opacity:1}
`;
const st = document.createElement("style"); st.id = "qh-style"; st.textContent = CSS; document.head.appendChild(st);

/* =================== Le bouton =================== */
let fresh = false;
function btnHTML(){ return `${PAD}<span>Arcade</span><span class="qh-n">${count()}</span>`; }
function decorate(){
  if (!Q.me()) return;
  const bar = document.querySelector("#app > main.screen .topbar"); if (!bar) return;
  let b = bar.querySelector(".qh-btn");
  if (!b){ bar.insertAdjacentHTML("afterbegin", `<button type="button" class="qh-btn ${fresh ? "qh-new" : ""}" data-qh="open" aria-label="Arcade : ${count()} jeux trouvés">${btnHTML()}</button>`); return; }
  const n = b.querySelector(".qh-n"); if (n && n.textContent !== String(count())) n.textContent = count();
}
let qd = false; new MutationObserver(() => { if (qd) return; qd = true; requestAnimationFrame(() => { qd = false; try{ decorate(); }catch(e){} }); }).observe(document.body, { childList:true, subtree:true });
decorate();

/* =================== L'écran de l'Arcade =================== */
let wrap = null, view = "jeux", openRow = null;
const G = () => window.QUERIDA_GRADE;
const meId = () => String((Q.me() || {}).id || "anon").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
function rankingHTML(){
  const g = G(); if (!g) return `<p class="qh-foot">Classement indisponible.</p>`;
  const ov = g.overall();
  const rules = `<div class="qh-rules">Chaque jeu rapporte des points selon ta place dans son classement : <b>1er 10 pts</b>, 2e 7, 3e 5, 4e 4, 5e 3, 6e 2, et <b>1 pt</b> pour chaque autre jeu où tu as un score. Plus tu joues à de jeux, plus tu montes. Les trois premiers portent un grade dans tous les classements : <b>Légende</b>, <b>As</b> et <b>Prodige</b>.</div>`;
  if (ov === null) return `<p class="qh-foot">Calcul du classement…</p>` + rules;
  if (!ov.length) return `<p class="qh-foot">Personne n'a encore de score. À toi de jouer !</p>` + rules;
  const pod = [1, 0, 2].map(i => { const p = ov[i]; if (!p) return `<div></div>`; return `<div class="p${i + 1}">${g.medal(i, 40)}<b>${esc(p.name)}</b><small>${p.pts} pts</small><i></i></div>`; }).join("");
  const rows = ov.slice(0, 30).map((p, i) => {
    const open = openRow === p.id;
    return `<button type="button" class="qh-row ${p.id === meId() ? "qh-me" : ""}" data-qh="row" data-v="${esc(p.id)}" aria-expanded="${open}"><span class="qh-rk">${i + 1}</span><span class="qh-nm">${esc(p.name)}${g.badgeFor(p.id, p.name)}</span><span class="qh-pt">${p.pts}<small>pts</small></span></button>`
      + (open ? `<div class="qh-det">${p.games.map(x => `<div><span>${esc(x.game)} · ${x.rank}${x.rank > 1 ? "e" : "er"} · ${esc(x.show)}</span><b>+${x.pts}</b></div>`).join("")}</div>` : "");
  }).join("");
  return `<div class="qh-pod">${pod}</div>${rows}${rules}`;
}
function render(){
  if (!wrap) return;
  const n = count(), total = CATALOG.length;
  const cards = CATALOG.map(c => {
    if (isFound(c.id)){
      const g = R()[c.id]; let rec = ""; try{ rec = g && g.best ? g.best() : ""; }catch(e){}
      return `<button type="button" class="qh-card" data-qh="play" data-v="${c.id}" ${g ? "" : "disabled"}>${c.icon.replace("<svg ", '<svg class="qh-ic" ')}<b>${c.name}</b><small>${c.what}</small><span class="qh-rec">${rec ? "Record : " + esc(rec) : "Pas encore joué"}</span></button>`;
    }
    return `<div class="qh-card qh-lock"><span class="qh-q">${LOCK}</span><b>Jeu caché</b><small>${esc(c.hint)}</small></div>`;
  }).join("");
  wrap.innerHTML = `<div class="qh-in"><div class="qh-head"><h1>${PAD}Arcade</h1><button type="button" class="qh-close" data-qh="close" aria-label="Fermer">×</button></div>
    <p class="qh-sub">${n === total ? "Tu as trouvé tous les jeux de Querida. Respect." : `${n} jeu${n > 1 ? "x" : ""} trouvé${n > 1 ? "s" : ""} sur ${total}. Les autres sont cachés dans l'appli.`}</p>
    <div class="qh-prog"><i style="width:${Math.round(n / total * 100)}%"></i></div>
    <div class="qh-seg" role="tablist"><button type="button" data-qh="view" data-v="jeux" aria-pressed="${view === "jeux"}">Les jeux</button><button type="button" data-qh="view" data-v="general" aria-pressed="${view === "general"}">Classement général</button></div>
    ${view === "jeux" ? `<div class="qh-grid">${cards}</div><p class="qh-foot">Chaque jeu a son classement de la bande. Le premier porte la couronne.</p>` : rankingHTML()}</div>`;
}
function openHub(){
  if (Q.layerCount()) Q.clearLayers();
  closeHub(); fresh = false; document.querySelector(".qh-btn")?.classList.remove("qh-new");
  wrap = document.createElement("div"); wrap.className = "qh-wrap"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-label", "Arcade");
  document.body.appendChild(wrap); document.body.style.overflow = "hidden"; render();
  if (G()) G().loadOverall().then(render).catch(() => {});
}
function closeHub(){ if (wrap){ wrap.remove(); wrap = null; if (!Q.layerCount()) document.body.style.overflow = ""; } }
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-qh]"); if (!b) return;
  e.stopPropagation(); e.preventDefault();
  if (b.dataset.qh === "open") openHub();
  else if (b.dataset.qh === "close") closeHub();
  else if (b.dataset.qh === "view"){ view = b.dataset.v; render(); if (view === "general" && G()) G().loadOverall(true).then(render).catch(render); }
  else if (b.dataset.qh === "row"){ openRow = openRow === b.dataset.v ? null : b.dataset.v; render(); }
  else if (b.dataset.qh === "play"){ const g = R()[b.dataset.v]; if (!g) return; closeHub(); try{ g.open(); }catch(err){} }
}, true);
// les jeux s'inscrivent au fil du chargement : on rafraîchit le compteur
window.addEventListener("qh-games", () => { decorate(); render(); });

/* Un nouveau jeu trouvé : petit message, et le compteur du bouton s'anime */
function toast(name){
  document.getElementById("qh-toast")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="qh-toast" id="qh-toast" role="status">${PAD}Nouveau jeu dans l'Arcade : ${esc(name)}</div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("qh-toast")?.classList.add("on")));
  setTimeout(() => { const t = document.getElementById("qh-toast"); if (t){ t.classList.remove("on"); setTimeout(() => t.remove(), 500); } }, 3200);
}
window.addEventListener("qh-found", e => {
  const c = CATALOG.find(x => x.id === e.detail); if (!c) return;
  fresh = true; toast(c.name);
  const b = document.querySelector(".qh-btn"); if (b){ b.classList.add("qh-new"); const n = b.querySelector(".qh-n"); if (n) n.textContent = count(); }
});

}catch(err){ /* l'Arcade ne doit jamais gêner l'appli */ }
})();
