/* Querida · Les réactions de la bande sur ce que Romane partage (pages du carnet et montages).
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
    bar.innerHTML = html(eid);
    if (popCode){ const ch = bar.querySelector(`.qr-chip[data-qr="${popCode}"]`); if (ch) ch.classList.add("qr-pop"); }
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
    card.insertAdjacentHTML("afterend", `<div class="qr-bar" data-qr-bar="${esc(eid)}">${html(eid)}</div>`);
    load(eid).then(() => paintAll(eid)).catch(() => {});
  });
}
let queued = false;
new MutationObserver(() => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; try{ decorate(); }catch(e){} }); }).observe(document.body, { childList:true, subtree:true });
decorate();
// au retour dans l'appli, on rafraîchit ce qui est affiché
document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") return;
  document.querySelectorAll(".qr-bar[data-qr-bar]").forEach(b => { const id = b.dataset.qrBar; load(id, true).then(() => paintAll(id)).catch(() => {}); }); });

document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("button.qr-chip[data-qr]"); if (!b) return;
  e.stopPropagation(); e.preventDefault();
  try{ navigator.vibrate && navigator.vibrate(8); }catch(err){}
  react(b.dataset.qrE, b.dataset.qr);
}, true);

}catch(err){ /* les réactions ne doivent jamais gêner l'appli */ }
})();
