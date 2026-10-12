/* Querida · Le titre royal de Romane dans les classements des jeux.
   Un petit sceau (dessiné, sans emoji) toujours collé à son nom, quel que soit son score :
   l'appli est pour elle, c'est elle la reine. En le touchant, une bulle dévoile son titre.
   Fichier à part, préfixe « qg- » partout ; une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{

const Q = window.QUERIDA;
if (!Q) return;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

// le sceau : un médaillon pourpre bordé d'or, avec une couronne d'or
function seal(size){
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#5B2A6E" stroke="#E8B530" stroke-width="1.6"/>
    <path d="M6 15.5 L5.2 8.6 L9 11.4 L12 6.4 L15 11.4 L18.8 8.6 L18 15.5 Z" fill="#F3C24A" stroke="#B8861B" stroke-width=".6" stroke-linejoin="round"/>
    <rect x="6" y="16.2" width="12" height="2" rx=".6" fill="#F3C24A"/>
    <circle cx="12" cy="6.2" r="1" fill="#F3C24A"/><circle cx="5.2" cy="8.4" r=".9" fill="#F3C24A"/><circle cx="18.8" cy="8.4" r=".9" fill="#F3C24A"/>
    <circle cx="12" cy="13" r=".9" fill="#CC3F27"/></svg>`;
}
/* badge(jeu, classement, position) → le sceau à côté du nom de Romane (vide pour les autres) */
function badge(game, board, i){
  try{
    const p = board && board[i]; if (!p || p.id !== "romane") return "";
    return ` <span class="qg-badge" role="button" tabindex="0" data-qg="1" aria-label="Titre de ${esc(p.name)} : Reine de Querida">${seal(18)}</span>`;
  }catch(e){ return ""; }
}

const CSS = `
.qg-badge{display:inline-grid;place-items:center;vertical-align:-4px;margin-left:3px;width:24px;height:24px;margin-top:-4px;margin-bottom:-4px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.qg-badge:active{transform:scale(.9)}
.qg-pop{position:fixed;z-index:90;width:min(290px,calc(100vw - 32px));background:#FFFDF9;color:#3B1F17;border-radius:16px;padding:16px 18px;box-shadow:0 12px 32px rgba(0,0,0,.35);border:1.5px solid #E8B530;font:14px/1.45 var(--f,-apple-system,sans-serif);animation:qg-in .22s ease;text-align:center}
@keyframes qg-in{from{opacity:0;transform:translateY(6px) scale(.97)}}
.qg-pop svg{width:46px;height:46px;display:block;margin:0 auto 6px}
.qg-pop .qg-k{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8A6A2A}
.qg-pop b.qg-n{display:block;font-family:var(--f-display,Georgia,serif);font-style:italic;font-weight:400;font-size:28px;line-height:1.1;margin:2px 0 10px;color:#5B2A6E}
.qg-pop dl{margin:0 0 10px;display:grid;grid-template-columns:auto 1fr;gap:3px 10px;text-align:left}
.qg-pop dt{color:#7A5A4C;font-size:13px}
.qg-pop dd{margin:0;font-weight:600;font-size:13px}
.qg-pop .qg-lv{display:flex;gap:4px;margin:2px 0 10px}
.qg-pop .qg-lv i{flex:1;height:6px;border-radius:3px;background:linear-gradient(90deg,#E8B530,#F3C24A)}
.qg-pop p{margin:0;color:#7A5A4C;font-style:italic;font-size:13.5px}
`;
const st = document.createElement("style"); st.id = "qg-style"; st.textContent = CSS; document.head.appendChild(st);

function closePop(){ document.getElementById("qg-pop")?.remove(); }
function openPop(el){
  closePop();
  const pop = document.createElement("div"); pop.className = "qg-pop"; pop.id = "qg-pop"; pop.setAttribute("role", "dialog"); pop.setAttribute("aria-label", "Titre de Romane");
  pop.innerHTML = `${seal(46)}<span class="qg-k">Sa Majesté</span><b class="qg-n">Reine de Querida</b>
    <div class="qg-lv">${"<i></i>".repeat(5)}</div>
    <dl><dt>Rang</dt><dd>Au-dessus de tous les classements</dd><dt>Force</dt><dd>Hors catégorie</dd><dt>Règne</dt><dd>À vie, sans partage</dd></dl>
    <p>Les couronnes des jeux changent de tête. Celle-ci, jamais.</p>`;
  document.body.appendChild(pop);
  const r = el.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  let top = r.bottom + 8; if (top + pr.height > innerHeight - 12) top = Math.max(12, r.top - pr.height - 8);
  pop.style.top = top + "px"; pop.style.left = Math.max(16, Math.min(innerWidth - pr.width - 16, r.left + r.width / 2 - pr.width / 2)) + "px";
}
// écoute au tout début (window, capture) : le sceau ne déclenche jamais la ligne du classement en dessous
window.addEventListener("pointerdown", e => {
  const b = e.target.closest && e.target.closest(".qg-badge");
  if (b){ e.stopPropagation(); return; }
  if (!(e.target.closest && e.target.closest("#qg-pop"))) closePop();
}, true);
window.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest(".qg-badge"); if (!b) return;
  e.stopPropagation(); e.preventDefault(); openPop(b);
}, true);
window.addEventListener("scroll", closePop, true);

window.QUERIDA_GRADE = { badge };

}catch(err){ /* le titre ne doit jamais gêner l'appli */ }
})();
