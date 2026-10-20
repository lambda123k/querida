/* Querida · Les insignes à côté des noms dans les classements des jeux.
   · Le sceau royal de Romane : toujours là, quel que soit son score (« Reine de Querida »).
   · Les médailles du classement général de l'Arcade : 1er Légende, 2e As, 3e Prodige.
   Le classement général additionne des points gagnés dans chaque jeu selon sa place
   (1er 10, 2e 7, 3e 5, 4e 4, 5e 3, 6e 2, sinon 1 point par jeu où l'on a un score).
   En touchant un insigne, une bulle l'explique. Préfixe « qg- » ; une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{

const Q = window.QUERIDA;
if (!Q) return;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fromHex = h => { try{ return new TextDecoder().decode(new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)))); }catch(e){ return "?"; } };

/* =================== Classement général =================== */
const POINTS = [10, 7, 5, 4, 3, 2];
const ptsFor = rank => POINTS[rank] ?? 1;
// Pour chaque jeu : dossier, format des fichiers, et une « valeur » (plus haut = mieux) pour départager
const GAMES = [
  { id:"tour",     name:"La Tour",          dir:"tour",     re:/^(\d{6})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)\.txt$/, v: m => +m[1], ts:2, idx:3, nm:4, show: m => `${+m[1]} étage${+m[1] > 1 ? "s" : ""}` },
  { id:"chrono",   name:"Le Chrono",        dir:"chrono",   re:/^(\d{3})__(\d{7})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)__[0-9-]+\.txt$/, v: m => +m[1] * 1e7 + +m[2], ts:3, idx:4, nm:5, show: m => `niveau ${+m[1]}` },
  { id:"marathon", name:"Le Marathon",      dir:"marathon", re:/^(\d{3,4})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)\.txt$/, v: m => +m[1], ts:2, idx:3, nm:4, show: m => `${+m[1]} tapes` },
  { id:"feuvert",  name:"Le Feu vert",      dir:"feuvert",  re:/^(\d{4})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)__[0-9-]+\.txt$/, v: m => (+m[1] >= 100 ? 1e4 - +m[1] : -1), ts:2, idx:3, nm:4, show: m => `${+m[1]} ms` },
  { id:"oeil",     name:"L'Œil",            dir:"oeil",     re:/^(\d{3,4})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)\.txt$/, v: m => +m[1], ts:2, idx:3, nm:4, show: m => `${+m[1]} cases` },
  { id:"diff",     name:"Les Différences",  dir:"diff",     re:/^(\d{3,4})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)\.txt$/, v: m => +m[1], ts:2, idx:3, nm:4, show: m => `${+m[1]} trouvées` },
  { id:"accord",   name:"L'Accord",         dir:"accord",   re:/^(\d{3,4})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)\.txt$/, v: m => +m[1], ts:2, idx:3, nm:4, show: m => `${+m[1]} bonnes réponses` },
  { id:"hanoi",    name:"Les Tours de Hanoï", dir:"hanoi", re:/^(\d{3,4})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)\.txt$/, v: m => +m[1], ts:2, idx:3, nm:4, show: m => `${+m[1]} pts` },
  { id:"chiffres", name:"La Mémoire des chiffres", dir:"chiffres", re:/^(\d{3,4})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)\.txt$/, v: m => +m[1], ts:2, idx:3, nm:4, show: m => `${+m[1]} chiffres` },
];
const TITLES = [
  { name:"Légende de l'Arcade", short:"Légende", col:"#E8B530", dark:"#9A7414", say:"La meilleure place de toute l'Arcade. Tout le monde te court après." },
  { name:"As de l'Arcade",      short:"As",      col:"#B8C1CC", dark:"#6E7884", say:"Deuxième de toute l'Arcade. La première place n'est pas loin." },
  { name:"Prodige de l'Arcade", short:"Prodige", col:"#D08A4E", dark:"#8A5226", say:"Sur le podium de toute l'Arcade. Continue comme ça." },
];
let overall = null, loadedAt = 0, loading = null;
async function loadGame(G){
  const { data, error } = await Q.store().client.storage.from("capsules").list("arcade/" + G.dir, { limit: 1000, sortBy: { column: "name", order: "desc" } });
  if (error) throw error;
  const best = new Map();
  (data || []).forEach(f => {
    const m = f.name.match(G.re); if (!m) return;
    const r = { id: m[G.idx], name: fromHex(m[G.nm]), v: G.v(m), ts: +m[G.ts], show: G.show(m), raw: +m[1] };
    if (r.v < 0) return;
    const o = best.get(r.id); if (!o || r.v > o.v || (r.v === o.v && r.ts < o.ts)) best.set(r.id, r);
  });
  return [...best.values()].sort((a, b) => b.v - a.v || a.ts - b.ts);
}
function loadOverall(force){
  if (Q.demo()) return Promise.resolve(overall || (overall = []));
  if (!force && overall && Date.now() - loadedAt < 60000) return Promise.resolve(overall);
  if (loading) return loading;
  loading = (async () => {
    const boards = await Promise.all(GAMES.map(G => loadGame(G).catch(() => [])));
    const people = new Map();
    boards.forEach((b, gi) => b.forEach((r, rank) => {
      const p = people.get(r.id) || { id: r.id, name: r.name, pts: 0, games: [], lastTs: 0, raw: {} };
      p.raw[GAMES[gi].id] = r.raw;
      if (r.ts > p.lastTs){ p.lastTs = r.ts; p.name = r.name; }
      const pts = ptsFor(rank); p.pts += pts;
      p.games.push({ game: GAMES[gi].name, rank: rank + 1, pts, show: r.show });
      people.set(r.id, p);
    }));
    overall = [...people.values()].sort((a, b) => b.pts - a.pts || b.games.length - a.games.length || a.lastTs - b.lastTs);
    overall.forEach((p, i) => { p.rank = i + 1; p.games.sort((a, b) => b.pts - a.pts); });
    loadedAt = Date.now();
    window.dispatchEvent(new Event("qg-overall"));
    return overall;
  })().finally(() => { loading = null; });
  return loading;
}
const medalOf = id => { if (!overall) return -1; const i = overall.findIndex(p => p.id === id); return i >= 0 && i < 3 && overall[i].pts > 0 ? i : -1; };

/* =================== Dessins =================== */
function seal(size){
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#5B2A6E" stroke="#E8B530" stroke-width="1.6"/>
    <path d="M6 15.5 L5.2 8.6 L9 11.4 L12 6.4 L15 11.4 L18.8 8.6 L18 15.5 Z" fill="#F3C24A" stroke="#B8861B" stroke-width=".6" stroke-linejoin="round"/>
    <rect x="6" y="16.2" width="12" height="2" rx=".6" fill="#F3C24A"/>
    <circle cx="12" cy="6.2" r="1" fill="#F3C24A"/><circle cx="5.2" cy="8.4" r=".9" fill="#F3C24A"/><circle cx="18.8" cy="8.4" r=".9" fill="#F3C24A"/>
    <circle cx="12" cy="13" r=".9" fill="#CC3F27"/></svg>`;
}
function medal(i, size){
  const T = TITLES[i];
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
    <path d="M7 1 L11 9 L8 10 L4 2 Z" fill="#CC3F27"/><path d="M17 1 L13 9 L16 10 L20 2 Z" fill="#1E4E9C"/>
    <circle cx="12" cy="15" r="8" fill="${T.col}" stroke="${T.dark}" stroke-width="1.4"/>
    <circle cx="12" cy="15" r="5.6" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1"/>
    <text x="12" y="18.4" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="9.5" fill="${T.dark}">${i + 1}</text></svg>`;
}

/* badge(jeu, classement, position) → insignes à côté du nom (sceau de Romane, médaille du général) */
function badgeFor(id, name){
  let out = "";
  if (id === "romane") out += ` <span class="qg-badge" role="button" tabindex="0" data-qg="seal" data-n="${esc(name)}" aria-label="Titre de ${esc(name)} : Reine de Querida">${seal(18)}</span>`;
  const m = medalOf(id);
  if (m >= 0) out += ` <span class="qg-badge" role="button" tabindex="0" data-qg="medal" data-id="${esc(id)}" aria-label="${esc(name)} : ${TITLES[m].name}">${medal(m, 19)}</span>`;
  return out;
}
function badge(game, board, i){ try{ const p = board && board[i]; return p ? badgeFor(p.id, p.name) : ""; }catch(e){ return ""; } }

const CSS = `
.qg-badge{display:inline-grid;place-items:center;vertical-align:-4px;margin-left:2px;width:24px;height:24px;margin-top:-4px;margin-bottom:-4px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.qg-badge:active{transform:scale(.9)}
.qg-pop{position:fixed;z-index:90;width:min(300px,calc(100vw - 32px));background:#FFFDF9;color:#3B1F17;border-radius:16px;padding:16px 18px;box-shadow:0 12px 32px rgba(0,0,0,.35);border:1.5px solid #E8B530;font:14px/1.45 var(--f,-apple-system,sans-serif);animation:qg-in .22s ease;text-align:center}
@keyframes qg-in{from{opacity:0;transform:translateY(6px) scale(.97)}}
.qg-pop > svg{width:46px;height:46px;display:block;margin:0 auto 6px}
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
function place(pop, el){
  const r = el.getBoundingClientRect(), pr = pop.getBoundingClientRect();
  let top = r.bottom + 8; if (top + pr.height > innerHeight - 12) top = Math.max(12, r.top - pr.height - 8);
  pop.style.top = top + "px"; pop.style.left = Math.max(16, Math.min(innerWidth - pr.width - 16, r.left + r.width / 2 - pr.width / 2)) + "px";
}
function openPop(el){
  closePop();
  const pop = document.createElement("div"); pop.className = "qg-pop"; pop.id = "qg-pop"; pop.setAttribute("role", "dialog");
  if (el.dataset.qg === "medal"){
    const p = overall && overall.find(x => x.id === el.dataset.id), m = medalOf(el.dataset.id); if (!p || m < 0) return;
    const T = TITLES[m];
    pop.style.borderColor = T.col;
    pop.innerHTML = `${medal(m, 46)}<span class="qg-k">Classement général · ${m + 1}${m ? "e" : "er"}</span><b class="qg-n" style="color:${T.dark}">${T.name}</b>
      <dl><dt>Joueur</dt><dd>${esc(p.name)}</dd><dt>Points</dt><dd>${p.pts} point${p.pts > 1 ? "s" : ""} sur ${p.games.length} jeu${p.games.length > 1 ? "x" : ""}</dd>
      <dt>Meilleur jeu</dt><dd>${esc(p.games[0].game)} (${p.games[0].rank}${p.games[0].rank > 1 ? "e" : "er"})</dd></dl><p>${T.say}</p>`;
  } else {
    pop.innerHTML = `${seal(46)}<span class="qg-k">Sa Majesté</span><b class="qg-n">Reine de Querida</b>
      <div class="qg-lv">${"<i></i>".repeat(5)}</div>
      <dl><dt>Rang</dt><dd>Au-dessus de tous les classements</dd><dt>Force</dt><dd>Hors catégorie</dd><dt>Règne</dt><dd>À vie, sans partage</dd></dl>
      <p>Les couronnes des jeux changent de tête. Celle-ci, jamais.</p>`;
  }
  document.body.appendChild(pop); place(pop, el);
}
// écoute au tout début (window, capture) : l'insigne ne déclenche jamais la ligne du classement en dessous
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

window.QUERIDA_GRADE = { badge, badgeFor, medal, loadOverall, overall: () => overall, POINTS, TITLES, GAMES };
// on charge le général tout de suite (en fond) pour que les médailles s'affichent dans les jeux
setTimeout(() => { loadOverall().catch(() => {}); }, 1500);

}catch(err){ /* les insignes ne doivent jamais gêner l'appli */ }
})();
