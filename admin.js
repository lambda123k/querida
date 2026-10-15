/* Querida · Modération.
   1 · Pour tout le monde : une liste de « masqués » (moderation/…) est lue au démarrage ; tout fichier masqué
       (commentaire, réaction, score) disparaît des listes, sans rien effacer.
   2 · Pour Naim seulement (lien secret ?admin=…, vérifié par empreinte SHA-256) : un écran « Modération »
       pour masquer / rétablir commentaires, réactions et scores, et supprimer une capsule.
   Préfixe « qx- » ; une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{

const Q = window.QUERIDA;
if (!Q) return;
const ADMIN_HASH = "a56450f402d195dc68c2a25eeb94300e1d543389afc922085efb17844fae6f5b";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toHex = s => [...new TextEncoder().encode(s)].map(x => x.toString(16).padStart(2, "0")).join("");
const fromHex = h => { try{ return new TextDecoder().decode(new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)))); }catch(e){ return "?"; } };
const bucket = () => Q.store().client.storage.from("capsules");

/* =================== 1 · La liste des masqués =================== */
// moderation/<date>__h__<chemin en hex>.txt = masqué ; …__s__… = rétabli. Le plus récent l'emporte.
const hidden = new Set();
let modReady = null, modAt = 0;
function loadMod(force){
  if (Q.demo()) return Promise.resolve();
  if (!force && modReady && Date.now() - modAt < 60000) return modReady;
  modAt = Date.now();
  modReady = (async () => {
    try{
      const { data, error } = await rawList("moderation", { limit: 1000, sortBy: { column: "name", order: "asc" } });
      if (error) return;
      const last = new Map();
      (data || []).forEach(f => { const m = f.name.match(/^(\d{14})__([hs])__([0-9a-f]+)\.txt$/); if (m) last.set(m[3], m[2]); });
      hidden.clear(); last.forEach((k, hex) => { if (k === "h") hidden.add(fromHex(hex)); });
    }catch(e){}
  })();
  return modReady;
}
let rawList = null;
// On enveloppe la lecture des dossiers : chaque liste renvoyée est filtrée des fichiers masqués.
function patch(){
  const st = Q.store(), cl = st && st.client;
  if (!cl || cl.__qxPatched) return !!(cl && cl.__qxPatched);
  const orig = cl.storage.from.bind(cl.storage);
  rawList = (folder, opts) => orig("capsules").list(folder, opts);
  cl.storage.from = name => {
    const api = orig(name);
    if (name !== "capsules") return api;
    const ol = api.list.bind(api);
    api.list = async (folder, opts) => {
      if (folder !== "moderation"){ try{ await Promise.race([loadMod(), new Promise(r => setTimeout(r, 2500))]); }catch(e){} }
      const r = await ol(folder, opts);
      if (r && Array.isArray(r.data) && hidden.size) r.data = r.data.filter(f => !hidden.has(folder + "/" + f.name));
      return r;
    };
    return api;
  };
  cl.__qxPatched = true;
  loadMod();
  return true;
}
if (!Q.demo()){ const t = setInterval(() => { try{ if (patch()) clearInterval(t); }catch(e){} }, 50); setTimeout(() => clearInterval(t), 30000); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && rawList) loadMod(true); });

/* =================== 2 · L'accès administrateur =================== */
async function sha(s){ const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
async function isAdmin(){
  try{
    const qs = new URLSearchParams(location.search), k = qs.get("admin");
    if (k){
      if (await sha(k) === ADMIN_HASH) localStorage.setItem("qx_admin", k);
      qs.delete("admin"); history.replaceState(null, "", location.pathname + (qs.toString() ? "?" + qs : "") + location.hash);   // on retire le secret de l'adresse
    }
    const s = localStorage.getItem("qx_admin");
    return !!s && await sha(s) === ADMIN_HASH;
  }catch(e){ return false; }
}
isAdmin().then(ok => { if (ok) startAdmin(); });

function startAdmin(){
const SHIELD = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8l7.5 3v5.6c0 4.6-3.2 8.3-7.5 9.8-4.3-1.5-7.5-5.2-7.5-9.8V5.8z"/><path d="M8.8 12l2.2 2.2 4.4-4.6"/></svg>`;
const CSS = `
.topbar .qx-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;margin-right:8px;border:0;border-radius:50%;background:var(--card);color:#5B2A6E;box-shadow:0 1px 3px rgba(0,0,0,.08);cursor:pointer}
.topbar .qx-btn svg{width:20px;height:20px}
.qx-wrap{position:fixed;inset:0;z-index:78;background:var(--bg);color:var(--label);overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:var(--f)}
.qx-in{max-width:620px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 40px);display:flex;flex-direction:column;gap:12px}
.qx-head{display:flex;justify-content:space-between;align-items:center}
.qx-head h1{margin:0;font-family:var(--f-display);font-style:italic;font-weight:400;font-size:36px;display:flex;gap:8px;align-items:center}
.qx-head h1 svg{width:28px;height:28px;color:#5B2A6E}
.qx-close{width:40px;height:40px;border-radius:50%;border:0;background:var(--fill2);color:var(--label);font-size:20px;cursor:pointer}
.qx-note{font-size:13px;color:var(--label2);margin:0}
.qx-seg{display:flex;flex-wrap:wrap;gap:6px}
.qx-seg button{border:0;border-radius:999px;padding:7px 12px;background:var(--fill);color:var(--label2);font:600 13.5px var(--f);cursor:pointer}
.qx-seg button[aria-pressed="true"]{background:#5B2A6E;color:#fff}
.qx-list{display:flex;flex-direction:column;gap:6px}
.qx-item{display:flex;gap:10px;align-items:flex-start;background:var(--card);border-radius:12px;padding:10px 12px}
.qx-item .qx-t{flex:1;min-width:0;font-size:14.5px;line-height:1.4;overflow-wrap:anywhere}
.qx-item .qx-t small{display:block;color:var(--label2);font-size:12.5px;margin-top:2px}
.qx-item.qx-off{opacity:.55}
.qx-item.qx-off .qx-t{text-decoration:line-through}
.qx-act{flex:none;border:0;border-radius:999px;padding:7px 12px;font:600 13px var(--f);cursor:pointer;background:var(--fill2);color:var(--accent)}
.qx-act.qx-on{background:#E3F1E7;color:#2F7D4E}
.qx-act.qx-sure{background:var(--accent);color:var(--on-accent)}
.qx-h{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--label2);margin:10px 0 2px}
.qx-empty{font-size:14px;color:var(--label3);text-align:center;padding:14px}
.qx-prev{background:var(--card);border-radius:12px;padding:14px;margin-top:-2px;border:1.5px solid #5B2A6E22}
.qx-prev .letter{font-size:17px}
.qx-prev img,.qx-prev video{max-height:50vh}
.qx-btns{display:flex;flex-direction:column;gap:6px;flex:none}
.qx-act.qx-see{background:#EEE6F3;color:#5B2A6E}
.qx-toast{position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 30px);transform:translateX(-50%);z-index:90;background:var(--label);color:var(--bg);border-radius:999px;padding:9px 16px;font:600 14px var(--f)}
`;
const st = document.createElement("style"); st.id = "qx-style"; st.textContent = CSS; document.head.appendChild(st);

function decorate(){
  const bar = document.querySelector("#app > main.screen .topbar"); if (!bar || bar.querySelector(".qx-btn")) return;
  const help = bar.querySelector(".helpbtn"); const html = `<button type="button" class="qx-btn" data-qx="open" aria-label="Modération">${SHIELD}</button>`;
  if (help) help.insertAdjacentHTML("beforebegin", html); else bar.insertAdjacentHTML("beforeend", html);
}
let qd = false; new MutationObserver(() => { if (qd) return; qd = true; requestAnimationFrame(() => { qd = false; try{ decorate(); }catch(e){} }); }).observe(document.body, { childList:true, subtree:true });
decorate();

let wrap = null, view = "capsules", items = null, armed = null, seen = null;
const GAMES = [["tour","La Tour"],["chrono","Le Chrono"],["marathon","Le Marathon"],["feuvert","Le Feu vert"],["oeil","L'Œil"],["diff","Les Différences"],["chiffres","La Mémoire des chiffres"],["accord","L'Accord"]];
function toast(t){ document.getElementById("qx-toast")?.remove(); document.body.insertAdjacentHTML("beforeend", `<div class="qx-toast" id="qx-toast">${esc(t)}</div>`); setTimeout(() => document.getElementById("qx-toast")?.remove(), 2200); }
const when = ts => { try{ return new Date(ts).toLocaleString("fr-FR", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }); }catch(e){ return ""; } };
async function subfolders(folder){
  const { data } = await rawList(folder, { limit: 1000 });
  const set = new Set();
  (data || []).forEach(f => { const seg = f.name.split("/")[0]; if (!/\.txt$/.test(seg) || f.name.includes("/")) set.add(seg); });
  return [...set];
}
async function filesIn(folder){
  const { data } = await rawList(folder, { limit: 1000, sortBy: { column: "name", order: "desc" } });
  return (data || []).filter(f => /\.txt$/.test(f.name) && !f.name.includes("/")).map(f => folder + "/" + f.name);
}
async function readText(path){
  try{ const { data } = await bucket().download(path); if (data) return await data.text(); }catch(e){}
  try{ const r = await fetch(bucket().getPublicUrl(path).data.publicUrl); if (r.ok) return await r.text(); }catch(e){}
  return "";
}
const pageName = id => { const e = (Q.store().journal || []).find(x => String(x.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) === id); return e ? (e.title || e.place || e.date || "Page") : "Page " + id.slice(0, 6); };
async function load(){
  items = null; render();
  await loadMod(true);
  const out = [];
  try{
    if (view === "comments"){
      for (const eid of await subfolders("comments")){
        for (const path of await filesIn("comments/" + eid)){
          const m = path.split("/").pop().match(/^(\d{14})__([A-Za-z0-9]{1,8})__c__([0-9a-f]*)\.txt$/); if (!m) continue;
          out.push({ path, ts: +m[1], who: fromHex(m[3]), what: await readText(path), where: pageName(eid) });
        }
      }
    } else if (view === "reactions"){
      const E = { c:"❤️", r:"😂", w:"😍", o:"😮", m:"🥲", x:"(retirée)" };
      for (const eid of await subfolders("reactions")){
        for (const path of await filesIn("reactions/" + eid)){
          const m = path.split("/").pop().match(/^(\d{14})__([A-Za-z0-9]{1,8})__([a-z])__([0-9a-f]*)\.txt$/); if (!m) continue;
          out.push({ path, ts: +m[1], who: fromHex(m[4]), what: E[m[3]] || m[3], where: pageName(eid) });
        }
      }
    } else if (view === "scores"){
      for (const [dir, name] of GAMES){
        for (const path of await filesIn("arcade/" + dir)){
          const parts = path.split("/").pop().replace(/\.txt$/, "").split("__");
          const it = parts.findIndex(p => /^\d{14}$/.test(p)), ts = it >= 0 ? +parts[it] : 0, hex = it >= 0 ? (parts[it + 2] || "") : "";
          out.push({ path, ts, who: fromHex(hex), what: `${name} · ${dir === "chrono" ? "niveau " + +parts[0] : dir === "feuvert" ? +parts[0] + " ms" : +parts[0]}`, where: name, group: name });
        }
      }
    } else if (view === "capsules"){
      const KIND = { photo:"Photo", video:"Vidéo", audio:"Vocal", text:"Message", song:"Chanson" }, WHEN = { voyage:"pendant le voyage", avant:"avant le départ", cafard:"quand elle a besoin d'un sourire", retour:"au retour" };
      (Q.store().caps || []).slice().sort((a, b) => (!!a.opened_at - !!b.opened_at) || ((Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))).forEach(c => out.push({ cap: c, ts: Date.parse(c.created_at) || 0, who: c.author_name, what: (c.kind === "song" && c.song ? c.song.title + " · " + c.song.artist : c.text || ""), where: `${KIND[c.kind] || c.kind} · à ouvrir ${WHEN[c.moment || "voyage"] || ""}` + (c.opened_at ? " · déjà ouverte par Romane" : " · pas encore vue par Romane") }));
    } else if (view === "hidden"){
      for (const path of hidden){
        const parts = path.split("/"), file = parts.pop(), bits = file.replace(/\.txt$/, "").split("__"), it = bits.findIndex(x => /^\d{14}$/.test(x));
        const who = it >= 0 ? fromHex(bits[it + (parts[0] === "arcade" ? 2 : 2)] || bits[it + 3] || "") : "";
        let what = path, where = "Masqué";
        if (parts[0] === "comments"){ what = await readText(path) || "(commentaire)"; where = "Commentaire · " + pageName(parts[1]); }
        else if (parts[0] === "reactions"){ what = "Réaction"; where = pageName(parts[1]); }
        else if (parts[0] === "arcade"){ const g = GAMES.find(x => x[0] === parts[1]); what = (g ? g[1] : parts[1]) + " · score " + +bits[0]; where = "Score"; }
        out.push({ path, ts: it >= 0 ? +bits[it] : 0, who: parts[0] === "comments" || parts[0] === "reactions" ? fromHex(bits[3] || "") : who, what, where });
      }
    }
  }catch(e){ toast("Lecture impossible pour l'instant"); }
  if (view !== "capsules" && view !== "hidden") out.sort((a, b) => b.ts - a.ts);
  items = out; render();
}
function render(){
  if (!wrap) return;
  const tabs = [["capsules","Capsules"],["comments","Commentaires"],["reactions","Réactions"],["scores","Scores"],["hidden","Masqués"]];
  let list;
  if (items === null) list = `<p class="qx-empty">Chargement…</p>`;
  else if (!items.length) list = `<p class="qx-empty">Rien à afficher.</p>`;
  else {
    let lastGroup = null;
    list = items.slice(0, 400).map((x, i) => {
      const head = x.group && x.group !== lastGroup ? `<p class="qx-h">${esc(x.group)}</p>` : ""; lastGroup = x.group || lastGroup;
      if (x.cap){
        const sure = armed === "cap:" + x.cap.id;
        const open = seen === x.cap.id;
        let prev = ""; if (open){ try{ prev = `<div class="qx-prev">${Q.capsuleHTML ? Q.capsuleHTML(x.cap) : esc(x.what)}</div>`; }catch(e){ prev = `<div class="qx-prev">${esc(x.what)}</div>`; } }
        return `<div class="qx-item"><div class="qx-t"><b>${esc(x.who)}</b>${x.what ? " · " + esc(x.what.length > 90 ? x.what.slice(0, 88) + "…" : x.what) : ""}<small>${esc(x.where)} · ${when(x.ts)}</small></div><div class="qx-btns"><button type="button" class="qx-act qx-see" data-qx="see" data-i="${i}">${open ? "Fermer" : "Voir"}</button><button type="button" class="qx-act ${sure ? "qx-sure" : ""}" data-qx="delcap" data-i="${i}">${sure ? "Confirmer" : "Supprimer"}</button></div></div>${prev}`;
      }
      const off = hidden.has(x.path);
      return head + `<div class="qx-item ${off ? "qx-off" : ""}"><div class="qx-t">${x.who ? `<b>${esc(x.who)}</b> · ` : ""}${esc(x.what)}<small>${esc(x.where)}${x.ts ? " · " + when(x.ts) : ""}</small></div><button type="button" class="qx-act ${off ? "qx-on" : ""}" data-qx="toggle" data-i="${i}">${off ? "Rétablir" : "Masquer"}</button></div>`;
    }).join("");
  }
  wrap.innerHTML = `<div class="qx-in"><div class="qx-head"><h1>${SHIELD}Modération</h1><button type="button" class="qx-close" data-qx="close" aria-label="Fermer">×</button></div>
    <p class="qx-note">Visible par toi seul. « Masquer » fait disparaître l'élément pour tout le monde, et tu peux le rétablir. « Supprimer » une capsule est définitif.</p>
    <div class="qx-seg">${tabs.map(([k, l]) => `<button type="button" data-qx="view" data-v="${k}" aria-pressed="${view === k}">${l}</button>`).join("")}</div>
    <div class="qx-list">${list}</div></div>`;
}
async function setHidden(path, hide){
  const key = `moderation/${String(Date.now()).padStart(14, "0")}__${hide ? "h" : "s"}__${toHex(path)}.txt`;
  const r = await bucket().upload(key, new Blob(["x"], { type:"text/plain" }), { contentType:"text/plain", upsert:false });
  if (r.error) throw r.error;
  if (hide) hidden.add(path); else hidden.delete(path);
}
document.addEventListener("click", async e => {
  const b = e.target.closest && e.target.closest("[data-qx]"); if (!b) return;
  e.stopPropagation(); e.preventDefault();
  const a = b.dataset.qx;
  if (a === "open"){ if (Q.layerCount()) Q.clearLayers(); wrap = document.createElement("div"); wrap.className = "qx-wrap"; document.body.appendChild(wrap); document.body.style.overflow = "hidden"; load(); }
  else if (a === "close"){ wrap?.remove(); wrap = null; document.body.style.overflow = ""; Q.render(); }
  else if (a === "view"){ view = b.dataset.v; armed = null; seen = null; load(); }
  else if (a === "toggle"){
    const x = items[+b.dataset.i]; if (!x) return; const hide = !hidden.has(x.path);
    try{ await setHidden(x.path, hide); toast(hide ? "Masqué pour tout le monde" : "Rétabli"); }catch(err){ toast("Échec, réessaie"); }
    if (view === "hidden") items = items.filter(y => hidden.has(y.path) || y === x);
    render();
  }
  else if (a === "see"){ const x = items[+b.dataset.i]; if (!x) return; wrap.querySelectorAll("video,audio").forEach(m => { try{ m.pause(); }catch(err){} }); seen = seen === x.cap.id ? null : x.cap.id; render(); }
  else if (a === "delcap"){
    const x = items[+b.dataset.i]; if (!x) return;
    if (armed !== "cap:" + x.cap.id){ armed = "cap:" + x.cap.id; render(); return; }
    try{ await Q.store().removeCapsule(x.cap); toast("Capsule supprimée"); items = items.filter(y => y !== x); }catch(err){ toast("Suppression refusée par le serveur"); }
    armed = null; render();
  }
}, true);
}

}catch(err){ /* la modération ne doit jamais gêner l'appli */ }
})();
