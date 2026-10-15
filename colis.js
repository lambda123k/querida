/* Querida · Le suivi de tes capsules, façon colis.
   · Amis : sur l'accueil, chaque capsule envoyée devient une petite tuile colorée avec le logo de son type.
     En la touchant : Déposée → En route → Arrivée → Ouverte par Romane, et la réaction de Romane.
   · Romane : sous chaque capsule ouverte, une rangée de petits emojis pour réagir.
   Réactions : capreact/<capsule>/<date>__<code>.txt (la plus récente compte, « x » = retirée).
   Préfixe « qp- » ; une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{

const Q = window.QUERIDA;
if (!Q || (Q.role() !== "ami" && Q.role() !== "romane")) return;
const ROMANE = Q.role() === "romane";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safe = id => String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
const bucket = () => Q.store().client.storage.from("capsules");
const DAY = 864e5;

const REACT = [
  { c:"c", e:"❤️", t:"Je l'ai adorée" },
  { c:"r", e:"😂", t:"Trop drôle" },
  { c:"m", e:"🥲", t:"Ça m'a émue" },
  { c:"w", e:"😍", t:"Magnifique" },
  { c:"h", e:"🤗", t:"Câlin" },
  { c:"f", e:"🔥", t:"Incroyable" },
];
const byCode = Object.fromEntries(REACT.map(r => [r.c, r]));

/* =================== Réactions de Romane =================== */
const cache = new Map();          // capsule -> { code, ts } | null
async function loadReact(id){
  if (Q.demo()) return cache.get(id) || null;
  try{
    const { data } = await bucket().list("capreact/" + safe(id), { limit: 200, sortBy: { column: "name", order: "asc" } });
    let last = null;
    (data || []).forEach(f => { const m = f.name.match(/^(\d{14})__([a-z])\.txt$/); if (m && (!last || +m[1] >= last.ts)) last = { ts: +m[1], code: m[2] }; });
    const v = last && byCode[last.code] ? last : null; cache.set(id, v); return v;
  }catch(e){ return cache.get(id) || null; }
}
async function setReact(id, code){
  const prev = cache.get(id) || null, next = prev && prev.code === code ? "x" : code;
  cache.set(id, next === "x" ? null : { ts: Date.now(), code: next });
  if (Q.demo()) return;
  try{
    const r = await bucket().upload(`capreact/${safe(id)}/${String(Date.now()).padStart(14, "0")}__${next}.txt`, new Blob(["x"], { type:"text/plain" }), { contentType:"text/plain", upsert:false });
    if (r.error) throw r.error;
    if (next !== "x" && !prev) Q.push("shared", "💌 Romane a réagi à une capsule", `${byCode[next].e} ${byCode[next].t}`);
  }catch(e){ cache.set(id, prev); }
}

/* =================== Styles =================== */
const STYLE = `
.qp-hide{display:none!important}
.qp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:10px;background:var(--card);border-radius:14px;padding:14px}
.qp-tile{position:relative;aspect-ratio:1;border:0;border-radius:16px;display:grid;place-items:center;cursor:pointer;color:#fff;box-shadow:inset 0 -3px 0 rgba(0,0,0,.12);transition:transform .12s;-webkit-tap-highlight-color:transparent}
.qp-tile:active{transform:scale(.93)}
.qp-tile svg{width:46%;height:46%}
.qp-tile .qp-st{position:absolute;right:-4px;bottom:-4px;min-width:22px;height:22px;border-radius:11px;background:var(--card);box-shadow:0 1px 4px rgba(0,0,0,.18);display:grid;place-items:center;font-size:12px;padding:0 4px;color:var(--label2)}
.qp-tile .qp-st svg{width:13px;height:13px}
.qp-tile.qp-wait{opacity:.92}
.qp-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:12.5px;color:var(--label2);padding:8px 4px 0}
.qp-legend span{display:inline-flex;align-items:center;gap:5px}
.qp-legend i{width:10px;height:10px;border-radius:50%;display:inline-block}
.qp-wrap{position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.32);animation:qp-fade .2s ease}
@keyframes qp-fade{from{opacity:0}}
.qp-sheet{width:100%;max-width:560px;max-height:92vh;overflow-y:auto;background:var(--bg);border-radius:18px 18px 0 0;padding:10px 18px calc(env(safe-area-inset-bottom,0px) + 22px);animation:qp-up .32s cubic-bezier(.2,.8,.2,1);font-family:var(--f);color:var(--label)}
@keyframes qp-up{from{transform:translateY(100%)}}
.qp-grab{width:36px;height:5px;border-radius:3px;background:var(--fill2);margin:0 auto 12px}
.qp-top{display:flex;gap:14px;align-items:center}
.qp-top .qp-tile{width:64px;flex:none;cursor:default}
.qp-top b{display:block;font-size:18px}
.qp-top small{display:block;color:var(--label2);font-size:14px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.qp-x{margin-left:auto;align-self:flex-start;width:34px;height:34px;border-radius:50%;border:0;background:var(--fill2);color:var(--label);font-size:18px;cursor:pointer;flex:none}
.qp-eta{margin:16px 0 4px;background:var(--card);border-radius:14px;padding:14px 16px;text-align:center}
.qp-eta span{display:block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--label2)}
.qp-eta b{display:block;font-family:var(--f-display);font-style:italic;font-weight:400;font-size:30px;line-height:1.15;margin-top:2px;color:var(--accent)}
.qp-eta small{display:block;font-size:13px;color:var(--label2);margin-top:2px}
.qp-track{list-style:none;margin:14px 0 0;padding:0}
.qp-track li{position:relative;display:flex;gap:14px;padding:0 0 18px}
.qp-track li:last-child{padding-bottom:4px}
.qp-track li::before{content:"";position:absolute;left:13px;top:28px;bottom:0;width:2px;background:var(--sep)}
.qp-track li.done::before{background:var(--accent)}
.qp-track li:last-child::before{display:none}
.qp-dot{width:28px;height:28px;border-radius:50%;flex:none;display:grid;place-items:center;background:var(--card);border:2px solid var(--sep);color:var(--label3);z-index:1}
.qp-dot svg{width:15px;height:15px}
li.done .qp-dot{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
li.now .qp-dot{border-color:var(--accent);color:var(--accent);box-shadow:0 0 0 5px var(--fill2);animation:qp-pulse 1.6s ease-in-out infinite}
@keyframes qp-pulse{50%{box-shadow:0 0 0 9px var(--fill)}}
.qp-track b{display:block;font-size:15.5px}
.qp-track small{display:block;font-size:13.5px;color:var(--label2);margin-top:1px}
li.todo b{color:var(--label2)}
.qp-react{display:flex;align-items:center;gap:12px;background:var(--card);border-radius:14px;padding:12px 14px;margin-top:12px}
.qp-react .qp-big{font-size:34px;line-height:1}
.qp-react small{display:block;color:var(--label2);font-size:13px}
.qp-manage{margin-top:14px;width:100%;border:0;background:none;color:var(--label2);font:600 14px var(--f);text-decoration:underline;cursor:pointer;padding:6px}
.qp-rbar{display:flex;flex-direction:column;gap:8px;align-items:center;background:var(--card);border-radius:16px;padding:14px 12px;margin-top:4px}
.qp-rbar p{margin:0;font-size:13.5px;color:var(--label2)}
.qp-rbar div{display:flex;gap:6px;flex-wrap:wrap;justify-content:center}
.qp-rbar button{width:48px;height:48px;border-radius:50%;border:0;background:var(--fill);font-size:24px;cursor:pointer;transition:transform .12s,background-color .15s}
.qp-rbar button:active{transform:scale(.88)}
.qp-rbar button.on{background:var(--fill2);box-shadow:inset 0 0 0 2px var(--accent);transform:scale(1.1)}
.qp-rbar button.qp-pop{animation:qp-pop .4s ease}
@keyframes qp-pop{40%{transform:scale(1.35)}}
@media (prefers-reduced-motion: reduce){li.now .qp-dot{animation:none}}
`;
const st = document.createElement("style"); st.id = "qp-style"; st.textContent = STYLE; document.head.appendChild(st);

/* =================== Dessins =================== */
const SVG = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const KIND = {
  photo: SVG('<rect x="3" y="6" width="18" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8.5 6l1.5-2h4l1.5 2"/>'),
  video: SVG('<rect x="2.5" y="6" width="13.5" height="12" rx="3"/><path d="M16 10.5l5.5-3v9l-5.5-3z"/>'),
  audio: SVG('<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3.5"/>'),
  text:  SVG('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>'),
  song:  SVG('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
};
const KNAME = { photo:"Photo", video:"Vidéo", audio:"Vocal", text:"Message", song:"Chanson" };
const ICO = {
  box: SVG('<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>'),
  plane: SVG('<path d="M2.5 13.5l19-8-6 15-3.5-6.5z"/><path d="M12 14l9.5-8.5"/>'),
  home: SVG('<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/>'),
  open: SVG('<path d="M3 9l9 6 9-6"/><path d="M3 9v10a1 1 0 001 1h16a1 1 0 001-1V9l-9-6z"/>'),
  check: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  clock: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
};
const COLORS = ["#CC3F27","#F2873B","#1E4E9C","#2E8B57","#7B5BB0","#E0703A","#B5502E","#2F6E8F","#C24D7A","#9E7A1E"];
function hue(id){ let h = 2166136261; for (const ch of String(id)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return COLORS[(h >>> 0) % COLORS.length]; }
const tile = (c, badge = "", cls = "") => `<span class="qp-tile ${cls}" style="background:${hue(c.id)}">${KIND[c.kind] || KIND.text}${badge}</span>`;
const fmtD = (t, o) => new Date(t).toLocaleDateString("fr-FR", o || { weekday:"long", day:"numeric", month:"long" });
const fmtH = t => new Date(t).toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" }).replace(":", " h ");

/* =================== Statut d'une capsule =================== */
function status(c, plan){
  const now = Q.now(), P = plan[c.id] || {}, D = Q.dates(), m = c.moment || "voyage";
  const arrivedAt = m === "avant" ? (Date.parse(c.created_at) || now) : m === "cafard" ? D.depart : P.at;
  const arrived = !!c.opened_at || (arrivedAt != null && arrivedAt <= now) || (m === "avant");
  return { m, at: arrivedAt, arrived, opened: !!c.opened_at, ahead: P.ahead || 0 };
}
function etaText(c, s){
  const now = Q.now();
  if (s.opened) return { k:"Ouverte", b: fmtD(Date.parse(c.opened_at), { day:"numeric", month:"long" }), s: "à " + fmtH(Date.parse(c.opened_at)) };
  if (s.m === "cafard") return { k:"En réserve", b:"Quand elle aura besoin d'un sourire", s:"Elle l'ouvrira quand elle voudra." };
  if (s.arrived) return { k:"Arrivée", b:"Elle l'attend", s:"Romane ne l'a pas encore ouverte." };
  if (s.m === "retour") return { k:"Arrivée prévue", b: fmtD(s.at, { day:"numeric", month:"long" }), s:"Le jour de son retour." };
  if (s.at == null) return { k:"Arrivée prévue", b:"Bientôt", s:"" };
  const d = Math.max(1, Math.round((s.at - now) / DAY));
  const when = d < 7 ? `dans ${d} jour${d > 1 ? "s" : ""}` : d < 60 ? `dans environ ${Math.round(d / 7)} semaine${Math.round(d / 7) > 1 ? "s" : ""}` : `dans environ ${Math.round(d / 30)} mois`;
  return { k:"Arrivée prévue", b: when, s: "Vers le " + fmtD(s.at, { day:"numeric", month:"long" }) + (s.ahead ? ` · encore ${s.ahead} capsule${s.ahead > 1 ? "s" : ""} avant la tienne` : " · c'est la prochaine !") };
}

/* =================== Amis : les tuiles et la fiche colis =================== */
function mine(){ const me = Q.me() || {}; return (Q.store().caps || []).filter(c => c.author_id === me.id).slice().reverse(); }
function decorate(){
  if (ROMANE || !Q.me()) return;
  const tab = document.querySelector('.tabbar .tab[aria-current="page"]'); if (!tab || tab.dataset.v !== "depot") return;
  const main = document.querySelector("#app > main.screen"); if (!main || main.querySelector(".qp-grid")) return;
  const btn = main.querySelector('.rowi[data-act="my-capsule"]'); if (!btn) return;
  const group = btn.closest(".group"); if (!group) return;
  const caps = mine(); if (!caps.length) return;
  const plan = Q.plan();
  const tiles = caps.map(c => {
    const s = status(c, plan), badge = s.opened ? `<span class="qp-st" style="color:var(--accent)">${ICO.check}</span>` : s.arrived ? `<span class="qp-st">${ICO.home}</span>` : `<span class="qp-st">${ICO.clock}</span>`;
    return `<button type="button" class="qp-tile ${s.opened || s.arrived ? "" : "qp-wait"}" style="background:${hue(c.id)}" data-qp="open" data-v="${esc(c.id)}" aria-label="${KNAME[c.kind] || "Capsule"}">${KIND[c.kind] || KIND.text}${badge}</button>`;
  }).join("");
  group.classList.add("qp-hide");
  group.insertAdjacentHTML("afterend", `<div class="qp-grid">${tiles}</div><div class="qp-legend"><span>${ICO.clock.replace("<svg ", '<svg width="13" height="13" ')} en route</span><span>${ICO.home.replace("<svg ", '<svg width="13" height="13" ')} arrivée</span><span style="color:var(--accent)">${ICO.check.replace("<svg ", '<svg width="13" height="13" ')} ouverte</span></div>`);
  // les réactions de Romane apparaissent sur les tuiles dès qu'on les connaît
  caps.filter(c => c.opened_at).forEach(c => loadReact(c.id).then(r => {
    if (!r) return; const t = document.querySelector(`.qp-grid [data-v="${CSS.escape(c.id)}"] .qp-st`); if (t){ t.textContent = byCode[r.code].e; t.style.fontSize = "13px"; }
  }));
}
let qd = false; new MutationObserver(() => { if (qd) return; qd = true; requestAnimationFrame(() => { qd = false; try{ decorate(); decorateRomane(); }catch(e){} }); }).observe(document.body, { childList:true, subtree:true });

async function openSheet(id){
  const c = (Q.store().caps || []).find(x => x.id === id); if (!c) return;
  const s = status(c, Q.plan()), eta = etaText(c, s), created = Date.parse(c.created_at) || Q.now();
  const step = (state, ico, title, sub) => `<li class="${state}"><span class="qp-dot">${state === "done" ? ICO.check : ico}</span><div><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</div></li>`;
  const transit = s.arrived && s.m === "voyage" ? "Arrivée à destination" : s.m === "cafard" ? "Gardée en réserve pour un jour de cafard" : s.m === "avant" ? "Disponible tout de suite, avant son départ" : s.m === "retour" ? "Bien rangée jusqu'au jour du retour" : s.ahead ? `${s.ahead} capsule${s.ahead > 1 ? "s" : ""} à ouvrir avant la tienne` : "La tienne est la prochaine de la pile";
  const steps = [
    step("done", ICO.box, "Déposée", fmtD(created, { day:"numeric", month:"long" }) + " à " + fmtH(created)),
    step(s.arrived ? "done" : "now", ICO.plane, "En route", transit),
    step(s.opened ? "done" : s.arrived ? "now" : "todo", ICO.home, "Arrivée", s.arrived ? (s.m === "cafard" ? "Elle peut l'ouvrir quand elle veut" : "Elle l'attend dans l'appli") : eta.s.split(" · ")[0]),
    step(s.opened ? "done" : "todo", ICO.open, "Ouverte par Romane", s.opened ? fmtD(Date.parse(c.opened_at)) + " à " + fmtH(Date.parse(c.opened_at)) : "Pas encore"),
  ].join("");
  const wrap = document.createElement("div"); wrap.className = "qp-wrap"; wrap.dataset.qp = "bg";
  wrap.innerHTML = `<div class="qp-sheet" role="dialog" aria-label="Suivi de ta capsule"><div class="qp-grab"></div>
    <div class="qp-top">${tile(c)}<div style="min-width:0"><b>${KNAME[c.kind] || "Capsule"}</b><small>${esc(c.kind === "song" && c.song ? c.song.title + " · " + c.song.artist : c.text || "")}</small></div><button type="button" class="qp-x" data-qp="close" aria-label="Fermer">×</button></div>
    <div class="qp-eta"><span>${eta.k}</span><b>${eta.b}</b>${eta.s ? `<small>${eta.s}</small>` : ""}</div>
    <ol class="qp-track">${steps}</ol><div id="qp-r"></div>
    <button type="button" class="qp-manage" data-qp="manage" data-v="${esc(c.id)}">Revoir ou supprimer ma capsule</button></div>`;
  document.body.appendChild(wrap); document.body.style.overflow = "hidden";
  if (s.opened){
    const r = await loadReact(c.id), z = wrap.querySelector("#qp-r");
    if (z) z.innerHTML = r ? `<div class="qp-react"><span class="qp-big">${byCode[r.code].e}</span><div><b>Romane a réagi</b><small>« ${byCode[r.code].t} »</small></div></div>`
      : `<div class="qp-react"><span class="qp-big" style="opacity:.35">💌</span><div><b>Pas encore de réaction</b><small>Romane peut te laisser un petit emoji après l'avoir ouverte.</small></div></div>`;
  }
}
function closeSheet(){ document.querySelectorAll(".qp-wrap").forEach(w => w.remove()); if (!Q.layerCount()) document.body.style.overflow = ""; }

/* =================== Romane : réagir sous une capsule ouverte =================== */
function rbar(id){
  const cur = cache.get(id);
  return `<div class="qp-rbar" data-qp-cap="${esc(id)}"><p>${cur ? "Ta réaction : " + byCode[cur.code].t : "Envoie une petite réaction à son auteur"}</p><div>${REACT.map(r => `<button type="button" data-qp="react" data-c="${r.c}" class="${cur && cur.code === r.c ? "on" : ""}" aria-label="${r.t}">${r.e}</button>`).join("")}</div></div>`;
}
function decorateRomane(){
  if (!ROMANE) return;
  document.querySelectorAll('.sheet [data-cap]').forEach(el => {
    if (el.querySelector(".qp-rbar")) return;
    const id = el.dataset.cap; el.insertAdjacentHTML("beforeend", rbar(id));
    loadReact(id).then(() => { const b = el.querySelector(".qp-rbar"); if (b) b.outerHTML = rbar(id); });
  });
}

document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-qp]"); if (!b) return;
  const a = b.dataset.qp;
  if (a === "bg" && e.target !== b) return;
  e.stopPropagation(); e.preventDefault();
  if (a === "open") openSheet(b.dataset.v);
  else if (a === "close" || a === "bg") closeSheet();
  else if (a === "manage"){ const id = b.dataset.v; closeSheet(); Q.openMyCapsule(id); }
  else if (a === "react"){
    const box = b.closest("[data-qp-cap]"), id = box.dataset.qpCap;
    try{ navigator.vibrate && navigator.vibrate(10); }catch(err){}
    setReact(id, b.dataset.c);
    box.outerHTML = rbar(id);
    const nb = document.querySelector(`[data-qp-cap="${CSS.escape(id)}"] [data-c="${b.dataset.c}"]`); if (nb) nb.classList.add("qp-pop");
  }
}, true);

decorate(); decorateRomane();

}catch(err){ /* le suivi ne doit jamais gêner l'appli */ }
})();
