/* Querida · Les réactions et commentaires de la bande sur ce que Romane partage (pages du carnet et montages).
   Commentaires : comments/<page>/<date>__<id>__c__<prénom>.txt (le texte est dans le fichier) ;
   suppression : comments/<page>/<date>__<id>__d__<prénom>__<date du commentaire>.txt
   Les amis réagissent sous chaque carte du Carnet ; Romane voit qui a réagi, sous ses pages partagées.
   Une réaction = un petit fichier vide dans le stockage : reactions/<page>/<date>__<id>__<code>__<prénom>.txt
   Pour chaque personne, seule sa dernière réaction compte (« x » = réaction retirée).
   Fichier à part, préfixe « qr- » partout ; une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{

const Q = window.QUERIDA;
if (!Q || (Q.role() !== "ami" && Q.role() !== "romane")) return;
const ROMANE = Q.role() === "romane";

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const toHex = s => [...new TextEncoder().encode(s)].map(x => x.toString(16).padStart(2, "0")).join("");
const fromHex = h => { try{ return new TextDecoder().decode(new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)))); }catch(e){ return "?"; } };
const me = () => Q.me() || {};
const myId = () => String(me().id || "anon").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "anon";
const myName = () => me().name || "Quelqu'un";
const safeId = id => String(id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);

const KINDS = [
  { c:"c", e:"❤️", t:"J'adore" },
  { c:"r", e:"😂", t:"Trop drôle" },
  { c:"w", e:"😍", t:"Magnifique" },
  { c:"o", e:"😮", t:"Waouh" },
  { c:"m", e:"🥲", t:"Tu nous manques" },
];
const byCode = Object.fromEntries(KINDS.map(k => [k.c, k]));

/* =================== Styles =================== */
const STYLE = `
.entry.qr-has{border-bottom-left-radius:0;border-bottom-right-radius:0}
.qr-bar{margin-top:-22px;background:var(--card);border-radius:0 0 16px 16px;padding:2px 14px 12px;display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--sep)}
.qr-chips{display:flex;gap:6px;flex-wrap:wrap;padding-top:10px}
.qr-chip{display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 11px;border-radius:999px;border:0;background:var(--fill);color:var(--label);font:600 14px var(--f);font-variant-numeric:tabular-nums;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .12s,background-color .15s}
.qr-chip .qr-e{font-size:17px;line-height:1}
.qr-chip.on{background:var(--fill2);box-shadow:inset 0 0 0 1.5px var(--accent)}
.qr-chip:active{transform:scale(.92)}
.qr-chip.qr-pop{animation:qr-pop .35s ease}
@keyframes qr-pop{40%{transform:scale(1.18)}}
span.qr-chip{cursor:default}
.qr-who{font-size:13px;color:var(--label2);line-height:1.4}
.qr-who b{font-weight:600;color:var(--label)}
.qr-hint{font-size:13px;color:var(--label3)}
.qr-react{display:flex;flex-direction:column;gap:8px}
.qr-com{display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--sep);padding-top:10px;margin-top:2px}
.qr-clist{display:flex;flex-direction:column;gap:7px}
.qr-clist:empty{display:none}
.qr-c{font-size:14.5px;line-height:1.4;color:var(--label);overflow-wrap:anywhere}
.qr-c b{font-weight:600;margin-right:5px}
.qr-c b.qr-queen{color:var(--accent)}
.qr-c .qr-cm{display:block;font-size:12px;color:var(--label3);margin-top:1px}
.qr-c .qr-cm button{font:inherit;color:var(--label2);background:none;border:0;padding:0 0 0 8px;cursor:pointer;text-decoration:underline}
.qr-c.qr-pending{opacity:.55}
.qr-more{align-self:flex-start;font:600 13px var(--f);color:var(--label2);background:none;border:0;padding:0;cursor:pointer}
.qr-cform{display:flex;gap:8px;align-items:flex-end;margin:0}
.qr-cform textarea{flex:1;min-width:0;resize:none;font:16px/1.35 var(--f);color:var(--label);background:var(--fill);border:0;border-radius:18px;padding:8px 14px;max-height:120px;outline:none}
.qr-cform textarea::placeholder{color:var(--label3)}
.qr-cform button{flex:none;height:36px;padding:0 14px;border-radius:999px;border:0;background:var(--accent);color:var(--on-accent);font:600 14px var(--f);cursor:pointer}
.qr-cform button:disabled{opacity:.35}
.qr-err{font-size:12.5px;color:var(--accent)}
@media (prefers-reduced-motion: reduce){.qr-chip.qr-pop{animation:none}}
`;
const st = document.createElement("style"); st.id = "qr-style"; st.textContent = STYLE; document.head.appendChild(st);

/* =================== Données =================== */
const cache = new Map();      // page -> { at, people: Map(id -> { code, name, ts }) }
const loading = new Map();
async function load(eid, force){
  const c = cache.get(eid);
  if (c && !force && Date.now() - c.at < 30000) return c;
  if (loading.has(eid)) return loading.get(eid);
  const p = (async () => {
    const people = new Map();
    if (!Q.demo()){
      const { data, error } = await Q.store().client.storage.from("capsules").list("reactions/" + eid, { limit: 1000, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      (data || []).forEach(f => {
        const m = f.name.match(/^(\d{14})__([A-Za-z0-9]{1,8})__([a-z])__([0-9a-f]*)\.txt$/); if (!m) return;
        const r = { ts: +m[1], id: m[2], code: m[3], name: fromHex(m[4]) || "?" };
        const old = people.get(r.id); if (!old || r.ts >= old.ts) people.set(r.id, r);
      });
    } else if (c){ c.people.forEach((v, k) => people.set(k, v)); }
    const out = { at: Date.now(), people };
    cache.set(eid, out); return out;
  })().finally(() => loading.delete(eid));
  loading.set(eid, p); return p;
}
async function react(eid, code){
  const c = cache.get(eid) || { at: Date.now(), people: new Map() };
  const mine = c.people.get(myId()), next = mine && mine.code === code ? "x" : code;   // retoucher la même réaction la retire
  c.people.set(myId(), { ts: Date.now(), id: myId(), code: next, name: myName() });
  cache.set(eid, c); paintAll(eid, next !== "x" ? next : null);
  if (Q.demo()) return;
  try{
    const key = `${String(Date.now()).padStart(14, "0")}__${myId()}__${next}__${toHex(myName().slice(0, 30))}.txt`;
    const r = await Q.store().client.storage.from("capsules").upload(`reactions/${eid}/${key}`, new Blob([myName()], { type:"text/plain" }), { contentType:"text/plain", upsert:false });
    if (r.error) throw r.error;
  }catch(e){
    if (mine) c.people.set(myId(), mine); else c.people.delete(myId());   // pas de réseau : on annule l'affichage
    paintAll(eid);
  }
}

/* =================== Commentaires =================== */
const MAXLEN = 500;
const coms = new Map();       // page -> { at, list: [{ ts, id, name, text, pending, failed }] }
const texts = new Map();      // chemin -> texte (un commentaire ne change jamais)
const drafts = new Map(), expanded = new Set(), comErr = new Map(), comLoading = new Map();
async function readText(path){
  if (texts.has(path)) return texts.get(path);
  const bucket = Q.store().client.storage.from("capsules");
  let t = null;
  try{ const { data, error } = await bucket.download(path); if (!error && data) t = await data.text(); }catch(e){}
  if (t === null){ try{ const u = bucket.getPublicUrl(path).data.publicUrl; const r = await fetch(u); if (r.ok) t = await r.text(); }catch(e){} }
  if (t !== null) texts.set(path, t);
  return t;
}
async function loadCom(eid, force){
  const c = coms.get(eid);
  if (c && !force && Date.now() - c.at < 30000) return c;
  if (comLoading.has(eid)) return comLoading.get(eid);
  const p = (async () => {
    const pend = c ? c.list.filter(x => x.pending || x.failed) : [];
    let list = [];
    if (!Q.demo()){
      const { data, error } = await Q.store().client.storage.from("capsules").list("comments/" + eid, { limit: 1000, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      const gone = new Set(), raw = [];
      (data || []).forEach(f => {
        const m = f.name.match(/^(\d{14})__([A-Za-z0-9]{1,8})__([cd])__([0-9a-f]*)(?:__(\d{14}))?\.txt$/); if (!m) return;
        if (m[3] === "d"){ if (m[5]) gone.add(m[2] + "/" + m[5]); return; }
        raw.push({ ts: +m[1], id: m[2], name: fromHex(m[4]) || "?", path: `comments/${eid}/${f.name}` });
      });
      const keep = raw.filter(x => !gone.has(x.id + "/" + String(x.ts).padStart(14, "0")));
      const got = await Promise.all(keep.map(x => readText(x.path)));
      list = keep.map((x, i) => ({ ts: x.ts, id: x.id, name: x.name, text: got[i] })).filter(x => x.text !== null && x.text.trim());
    } else if (c){ list = c.list.filter(x => !x.pending && !x.failed); }
    const seen = new Set(list.map(x => x.id + "/" + x.ts));
    pend.forEach(x => { if (!seen.has(x.id + "/" + x.ts)) list.push(x); });
    list.sort((a, b) => a.ts - b.ts);
    const out = { at: Date.now(), list }; coms.set(eid, out); comErr.delete(eid); return out;
  })().finally(() => comLoading.delete(eid));
  comLoading.set(eid, p); return p;
}
async function sendCom(eid, text){
  text = text.trim().slice(0, MAXLEN); if (!text) return;
  const c = coms.get(eid) || { at: Date.now(), list: [] }; coms.set(eid, c);
  const ts = Date.now(), item = { ts, id: myId(), name: myName(), text, pending: true };
  c.list.push(item); drafts.delete(eid); paintCom(eid, true);
  if (Q.demo()){ item.pending = false; paintCom(eid); return; }
  try{
    const key = `${String(ts).padStart(14, "0")}__${myId()}__c__${toHex(myName().slice(0, 30))}.txt`;
    const r = await Q.store().client.storage.from("capsules").upload(`comments/${eid}/${key}`, new Blob([text], { type:"text/plain;charset=utf-8" }), { contentType:"text/plain;charset=utf-8", upsert:false });
    if (r.error) throw r.error;
    texts.set(`comments/${eid}/${key}`, text); item.pending = false;
    if (ROMANE) Q.push("shared", `${myName()} a répondu sur son carnet`, text.length > 110 ? text.slice(0, 107) + "…" : text, { carnet: true });
  }catch(e){ item.pending = false; item.failed = true; }
  paintCom(eid);
}
async function delCom(eid, ts){
  const c = coms.get(eid); if (!c) return;
  const i = c.list.findIndex(x => x.ts === ts && x.id === myId()); if (i < 0) return;
  const [item] = c.list.splice(i, 1); paintCom(eid);
  if (item.failed || Q.demo()) return;
  try{
    const key = `${String(Date.now()).padStart(14, "0")}__${myId()}__d__${toHex(myName().slice(0, 30))}__${String(ts).padStart(14, "0")}.txt`;
    const r = await Q.store().client.storage.from("capsules").upload(`comments/${eid}/${key}`, new Blob(["x"], { type:"text/plain" }), { contentType:"text/plain", upsert:false });
    if (r.error) throw r.error;
  }catch(e){ c.list.push(item); c.list.sort((a, b) => a.ts - b.ts); paintCom(eid); }
}
function when(ts){
  const d = Date.now() - ts;
  if (d < 60e3) return "à l'instant";
  if (d < 3600e3) return `il y a ${Math.floor(d / 60e3)} min`;
  if (d < 86400e3) return `il y a ${Math.floor(d / 3600e3)} h`;
  return new Date(ts).toLocaleDateString("fr-FR", { day:"numeric", month:"short" });
}
function comHtml(eid){
  const c = coms.get(eid);
  if (!c) return comErr.get(eid) ? `<span class="qr-err">Les commentaires ne répondent pas pour l'instant.</span>` : "";
  let list = c.list, more = "";
  if (list.length > 3 && !expanded.has(eid)){ more = `<button type="button" class="qr-more" data-qr-more="${esc(eid)}">Voir les ${list.length} commentaires</button>`; list = list.slice(-2); }
  return more + list.map(x => {
    const mine = x.id === myId(), queen = x.id === "romane";
    const meta = x.pending ? "envoi…" : x.failed ? `pas envoyé <button type="button" data-qr-retry="${esc(eid)}" data-ts="${x.ts}">Réessayer</button>` : when(x.ts) + (mine ? `<button type="button" data-qr-del="${esc(eid)}" data-ts="${x.ts}">Supprimer</button>` : "");
    return `<div class="qr-c ${x.pending ? "qr-pending" : ""}"><b class="${queen ? "qr-queen" : ""}">${esc(mine && !ROMANE ? "Toi" : x.name)}</b>${esc(x.text)}<span class="qr-cm">${meta}</span></div>`;
  }).join("");
}
function paintCom(eid, scroll){
  document.querySelectorAll(`.qr-bar[data-qr-bar="${CSS.escape(eid)}"]`).forEach(bar => {
    const z = bar.querySelector(".qr-clist"); if (z) z.innerHTML = comHtml(eid);
    const f = bar.querySelector(".qr-cform");
    if (f && scroll){ const ta = f.querySelector("textarea"); ta.value = drafts.get(eid) || ""; ta.style.height = ""; f.querySelector("button").disabled = true; }
  });
}
// saisie : on garde le brouillon même si l'écran se redessine
document.addEventListener("input", e => {
  const ta = e.target.closest && e.target.closest(".qr-cform textarea"); if (!ta) return;
  const eid = ta.closest(".qr-cform").dataset.qrForm;
  drafts.set(eid, ta.value);
  ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px";
  ta.closest(".qr-cform").querySelector("button").disabled = !ta.value.trim();
}, true);
document.addEventListener("submit", e => {
  const f = e.target.closest && e.target.closest(".qr-cform"); if (!f) return;
  e.preventDefault(); e.stopPropagation();
  const ta = f.querySelector("textarea"); sendCom(f.dataset.qrForm, ta.value); ta.blur();
}, true);
document.addEventListener("keydown", e => {
  const ta = e.target.closest && e.target.closest(".qr-cform textarea"); if (!ta || e.key !== "Enter" || e.shiftKey || e.isComposing) return;
  e.preventDefault(); const f = ta.closest(".qr-cform"); sendCom(f.dataset.qrForm, ta.value); ta.blur();
}, true);
document.addEventListener("click", e => {
  const t = e.target.closest && e.target.closest("[data-qr-more],[data-qr-del],[data-qr-retry]"); if (!t) return;
  e.stopPropagation(); e.preventDefault();
  if (t.dataset.qrMore){ expanded.add(t.dataset.qrMore); paintCom(t.dataset.qrMore); }
  if (t.dataset.qrDel) delCom(t.dataset.qrDel, +t.dataset.ts);
  if (t.dataset.qrRetry){ const eid = t.dataset.qrRetry, c = coms.get(eid), i = c ? c.list.findIndex(x => x.ts === +t.dataset.ts && x.failed) : -1;
    if (i >= 0){ const [x] = c.list.splice(i, 1); sendCom(eid, x.text); } }
}, true);

/* =================== Affichage =================== */
function html(eid){
  const c = cache.get(eid), people = c ? [...c.people.values()].filter(p => byCode[p.code]) : [];
  const count = k => people.filter(p => p.code === k).length;
  const mine = c && c.people.get(myId());
  let chips;
  if (ROMANE){
    const used = KINDS.filter(k => count(k.c));
    chips = used.map(k => `<span class="qr-chip" title="${k.t}"><span class="qr-e">${k.e}</span>${count(k.c)}</span>`).join("");
  } else {
    chips = KINDS.map(k => { const n = count(k.c), on = mine && mine.code === k.c;
      return `<button type="button" class="qr-chip ${on ? "on" : ""}" data-qr="${k.c}" data-qr-e="${esc(eid)}" aria-pressed="${!!on}" aria-label="${k.t}${n ? ", " + n : ""}"><span class="qr-e">${k.e}</span>${n || ""}</button>`; }).join("");
  }
  people.sort((a, b) => a.ts - b.ts);
  const names = people.map(p => `<b>${esc(p.id === myId() && !ROMANE ? "Toi" : p.name)}</b> ${byCode[p.code].e}`);
  let who;
  if (!c) who = `<span class="qr-hint">…</span>`;
  else if (!names.length) who = `<span class="qr-hint">${ROMANE ? "Pas encore de réaction de la bande." : "Sois le premier à réagir."}</span>`;
  else who = `<span class="qr-who">${names.slice(0, 8).join(", ")}${names.length > 8 ? ` et ${names.length - 8} autre${names.length > 9 ? "s" : ""}` : ""}</span>`;
  return `${chips ? `<div class="qr-chips">${chips}</div>` : ""}${ROMANE && !chips ? `<div style="height:8px"></div>` : ""}${who}`;
}
function paintAll(eid, popCode){
  document.querySelectorAll(`.qr-bar[data-qr-bar="${CSS.escape(eid)}"]`).forEach(bar => {
    const zone = bar.querySelector(".qr-react"); if (!zone) return;
    zone.innerHTML = html(eid);
    if (popCode){ const ch = zone.querySelector(`.qr-chip[data-qr="${popCode}"]`); if (ch) ch.classList.add("qr-pop"); }
  });
}
function decorate(){
  if (!Q.me()) return;
  const tab = document.querySelector('.tabbar .tab[aria-current="page"]');
  if (!tab || tab.dataset.v !== "carnet") return;
  document.querySelectorAll('#app > main.screen button.entry[data-act="entry"][data-v]').forEach(card => {
    if (card.classList.contains("qr-has")) return;
    if (ROMANE && !card.querySelector(".tag.on")) return;          // Romane : seulement sous ses pages partagées
    const eid = safeId(card.dataset.v); if (!eid) return;
    card.classList.add("qr-has");
    card.insertAdjacentHTML("afterend", `<div class="qr-bar" data-qr-bar="${esc(eid)}"><div class="qr-react">${html(eid)}</div>
      <div class="qr-com"><div class="qr-clist">${comHtml(eid)}</div>
      <form class="qr-cform" data-qr-form="${esc(eid)}"><textarea rows="1" maxlength="${MAXLEN}" placeholder="${ROMANE ? "Répondre à la bande…" : "Écris un commentaire…"}" aria-label="Commentaire" enterkeyhint="send">${esc(drafts.get(eid) || "")}</textarea><button type="submit" ${(drafts.get(eid) || "").trim() ? "" : "disabled"}>Envoyer</button></form></div></div>`);
    load(eid).then(() => paintAll(eid)).catch(() => {});
    loadCom(eid).then(() => paintCom(eid)).catch(() => { comErr.set(eid, "load"); paintCom(eid); });
  });
}
let queued = false;
new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; try{ decorate(); }catch(e){} }); }).observe(document.body, { childList:true, subtree:true });
decorate();
// au retour dans l'appli, on rafraîchit ce qui est affiché
document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") return;
  document.querySelectorAll(".qr-bar[data-qr-bar]").forEach(b => { const id = b.dataset.qrBar; load(id, true).then(() => paintAll(id)).catch(() => {}); loadCom(id, true).then(() => paintCom(id)).catch(() => {}); }); });

document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("button.qr-chip[data-qr]"); if (!b) return;
  e.stopPropagation(); e.preventDefault();
  try{ navigator.vibrate && navigator.vibrate(8); }catch(err){}
  react(b.dataset.qrE, b.dataset.qr);
}, true);

}catch(err){ /* les réactions ne doivent jamais gêner l'appli */ }
})();
