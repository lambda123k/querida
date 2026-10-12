/* Querida · Le grade de Romane dans les classements des jeux.
   Un petit insigne à côté de son nom ; en le touchant, une bulle dit à quel point elle est forte.
   Fichier à part, préfixe « qg- » partout ; une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{

const Q = window.QUERIDA;
if (!Q) return;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const GRADES = [
  null,
  { name:"Débutante",  col:"#B08A6E", say:"Elle découvre encore le jeu : la marge de progression est immense." },
  { name:"Apprentie",  col:"#C9773F", say:"Elle commence à prendre le coup de main." },
  { name:"Confirmée",  col:"#9AA3AE", say:"Elle tient son rang au milieu de la bande." },
  { name:"Experte",    col:"#D9A43A", say:"Elle fait partie des meilleurs de la bande. Méfiance." },
  { name:"Légende",    col:"#E8B530", say:"Personne ne fait mieux qu'elle. La couronne est à elle." },
];
// insigne : un écusson avec autant de chevrons que de niveaux
function insignia(lv, col){
  const chev = Array.from({ length: lv }, (_, i) => `<path d="M6 ${15 - i * 2.6} L10 ${12.4 - i * 2.6} L14 ${15 - i * 2.6}" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
  return `<svg viewBox="0 0 20 22" width="17" height="19" aria-hidden="true"><path d="M10 1 L18 4 V11 C18 16 14.5 19.5 10 21 C5.5 19.5 2 16 2 11 V4 Z" fill="${col}" stroke="rgba(0,0,0,.18)" stroke-width="1"/>${chev}</svg>`;
}
function compute(board, i){
  const n = board.length, rank = i + 1;
  if (n <= 1) return { lv: 3, n, rank, beat: 0, solo: true };
  const beat = n - rank, pct = beat / (n - 1);
  const lv = rank === 1 ? 5 : pct >= .75 ? 4 : pct >= .5 ? 3 : pct >= .25 ? 2 : 1;
  return { lv, n, rank, beat, pct };
}
let seq = 0; const store = new Map();
/* badge(jeu, classement, position de Romane, texte du record) → HTML de l'insigne (vide si ce n'est pas Romane) */
function badge(game, board, i, record){
  try{
    const p = board && board[i]; if (!p || p.id !== "romane") return "";
    const g = compute(board, i), G = GRADES[g.lv], key = "g" + (++seq);
    store.set(key, { game, g, record, name: p.name });
    if (store.size > 200) store.delete(store.keys().next().value);
    return ` <span class="qg-badge" role="button" tabindex="0" data-qg="${key}" aria-label="Grade de ${esc(p.name)} : ${G.name}">${insignia(g.lv, G.col)}</span>`;
  }catch(e){ return ""; }
}

const CSS = `
.qg-badge{display:inline-grid;place-items:center;vertical-align:-4px;margin-left:4px;width:24px;height:24px;margin-top:-4px;margin-bottom:-4px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.qg-badge:active{transform:scale(.9)}
.qg-pop{position:fixed;z-index:90;width:min(290px,calc(100vw - 32px));background:#FFFDF9;color:#3B1F17;border-radius:14px;padding:14px 16px;box-shadow:0 12px 32px rgba(0,0,0,.35);font:14px/1.4 var(--f,-apple-system,sans-serif);animation:qg-in .2s ease;text-align:left}
@keyframes qg-in{from{opacity:0;transform:translateY(6px)}}
.qg-pop .qg-top{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.qg-pop .qg-top svg{width:30px;height:33px}
.qg-pop .qg-k{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7A5A4C}
.qg-pop b.qg-n{display:block;font-family:var(--f-display,Georgia,serif);font-style:italic;font-weight:400;font-size:26px;line-height:1}
.qg-pop .qg-lv{display:flex;gap:4px;margin:6px 0 10px}
.qg-pop .qg-lv i{flex:1;height:6px;border-radius:3px;background:rgba(59,31,23,.12)}
.qg-pop p{margin:0 0 4px}
.qg-pop .qg-say{color:#7A5A4C;font-style:italic;margin-top:6px}
`;
const st = document.createElement("style"); st.id = "qg-style"; st.textContent = CSS; document.head.appendChild(st);

function closePop(){ document.getElementById("qg-pop")?.remove(); }
function openPop(el){
  closePop();
  const d = store.get(el.dataset.qg); if (!d) return;
  const { g, game, record } = d, G = GRADES[g.lv];
  const line = g.solo ? "Elle est la seule à avoir joué pour l'instant."
    : `${g.rank === 1 ? "1re" : g.rank + "e"} sur ${g.n} joueurs de la bande${g.beat ? `, devant ${g.beat} d'entre eux (${Math.round(g.pct * 100)} %)` : ""}.`;
  const pop = document.createElement("div"); pop.className = "qg-pop"; pop.id = "qg-pop"; pop.setAttribute("role", "dialog");
  pop.innerHTML = `<div class="qg-top">${insignia(g.lv, G.col)}<div><span class="qg-k">Grade de ${esc(d.name)} · ${esc(game)}</span><b class="qg-n">${G.name}</b></div></div>
    <div class="qg-lv">${[1, 2, 3, 4, 5].map(k => `<i style="${k <= g.lv ? "background:" + G.col : ""}"></i>`).join("")}</div>
    <p>${line}</p>${record ? `<p>Record : <b>${esc(record)}</b></p>` : ""}<p class="qg-say">${g.solo ? "Personne pour lui tenir tête… pour l'instant." : G.say}</p>`;
  document.body.appendChild(pop);
  const r = el.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  let top = r.bottom + 8; if (top + pr.height > innerHeight - 12) top = Math.max(12, r.top - pr.height - 8);
  pop.style.top = top + "px"; pop.style.left = Math.max(16, Math.min(innerWidth - pr.width - 16, r.left + r.width / 2 - pr.width / 2)) + "px";
}
// écoute au tout début (window, capture) : l'insigne ne déclenche jamais la ligne du classement en dessous
let downOnBadge = false;
window.addEventListener("pointerdown", e => {
  const b = e.target.closest && e.target.closest(".qg-badge");
  downOnBadge = !!b;
  if (b){ e.stopPropagation(); return; }
  if (!(e.target.closest && e.target.closest("#qg-pop"))) closePop();
}, true);
window.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest(".qg-badge"); if (!b) return;
  e.stopPropagation(); e.preventDefault(); openPop(b);
}, true);
window.addEventListener("scroll", closePop, true);

window.QUERIDA_GRADE = { badge };

}catch(err){ /* le grade ne doit jamais gêner l'appli */ }
})();
