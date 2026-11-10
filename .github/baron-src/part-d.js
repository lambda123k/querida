
const st = document.createElement("style"); st.id = "b2-style"; st.textContent = STYLE; document.head.appendChild(st);

/* =================== Ouverture =================== */
let mult = 1;           // améliorer par ×1, ×10 ou au maximum
let sheetOpen = false;
const TABS = [
  { id:"farm",    label:"Ferme",  i:"🌾" },
  { id:"barn",    label:"Grange", i:"🏚️", need:"grange",  why:"La grange s'ouvre dès ta première récolte livrée." },
  { id:"market",  label:"Marché", i:"📈", need:"marche",  why:"Le marché ouvre quand tu débloques ta 2e parcelle." },
  { id:"village", label:"Village",i:"🏘️", need:"village", why:"Le village ouvre quand tu débloques ta 3e parcelle." },
];
function openBaron(){
  closeBaron(true);
  const w = document.createElement("div"); w.className = "b2-wrap"; w.setAttribute("role", "dialog"); w.setAttribute("aria-label", "Le Baron");
  w.innerHTML = `<div class="b2-hud"><div class="b2-col"><button class="b2-hbtn" data-a="arcade" aria-label="Retour à l'Arcade">‹</button>
    <div class="b2-pill"><i class="b2-coin"></i><span data-live="coins">…</span></div><div class="b2-pill"><span class="b2-e">🪵</span><span data-live="wood">…</span></div>
    <div class="b2-sp"></div><button class="b2-hbtn" data-a="close" aria-label="Fermer">×</button></div></div>
    <div class="b2-scroll" id="b2-main"><div class="b2-load">Le Baron se prépare…</div></div><div id="b2-dock"></div><nav class="b2-tabs" id="b2-tabs"></nav>`;
  document.body.appendChild(w); document.body.style.overflow = "hidden"; wrapEl = w;
  w.addEventListener("click", onClick);
  w.addEventListener("input", onInput);
  start();
}
function closeBaron(silent){
  if (S && !silent) save(true);
  clearInterval(loopT); loopT = null;
  document.querySelector(".b2-wrap")?.remove(); wrapEl = null; sheetOpen = false;
  try{ if (!Q.layerCount()) document.body.style.overflow = ""; }catch(e){ document.body.style.overflow = ""; }
}
async function start(){
  const me = Q.me();
  const main = () => wrapEl && wrapEl.querySelector("#b2-main");
  if (!me){ main().innerHTML = `<div class="b2-load">Crée d'abord ton profil Querida.</div>`; return; }
  if (Q.demo()){ main().innerHTML = `<div class="b2-load">Le Baron a besoin de la vraie base de Querida.</div>`; return; }
  if (!getToken()) return showPick();
  try{
    const gained = await load();
    if (!wrapEl) return;
    view = "farm"; draw(); lastSig = unlockSig();
    if (gained >= 1) setTimeout(() => toast(`Pendant ton absence, tes contremaîtres ont rentré ${fmtN(gained)} ${P[S.spec].e} dans la grange`, "gold"), 500);
    loop(); loadWorld(true); save(true);
  }catch(e){
    const m = String(e && e.message || "");
    if (m.includes("jeton inconnu")){ setToken(null); return showPick(); }
    if (main()) main().innerHTML = `<div class="b2-load"><div style="text-align:center;padding:24px">${esc(errText(e))}<br><br><button class="b2-btn" data-a="retry">Réessayer</button></div></div>`;
  }
}
let lastSig = "";
const unlockSig = () => ["grange","mgr","boost","marche","village","four","farm2"].map(k => BX.unlocked(S, k) ? 1 : 0).join("") + (view === "farm" ? (TIPS.find(x => !seen("tip_" + x.id) && x.when()) || {}).id : "");
let raf = null;
function frame(){
  if (!wrapEl || !S){ raf = null; return; }
  const t = now(), dt = (t - lastTick) / 1000; lastTick = t;
  if (dt > 3){ BX.catchUp(S, t); }
  else if (dt > 0){
    const ev = [], done = BX.step(S, dt, t, ev) || []; S.last = t;
    if (done.length){ const d = done[0]; toast(`${P[d.rec].e} ${fmtN(d.qty)} ${P[d.rec].label.toLowerCase()} sorti${d.qty > 1 ? "s" : ""} du four`, "gold"); sound("done"); if (view === "barn") draw(); }
    if (view === "farm" && ev.length) showEvents(ev);
  }
  if (view === "farm") animate();
  raf = requestAnimationFrame(frame);
}
function loop(){
  clearInterval(loopT); if (!raf) raf = requestAnimationFrame(frame);
  let n = 0;
  loopT = setInterval(() => {
    if (!wrapEl || !S) return;
    if (!raf) raf = requestAnimationFrame(frame);
    if (BX.ensureOrders(S, now(), ME.id, groupProd())){ dirty = true; if (view === "village") draw(); }
    live();
    n++;
    if (n % 4 === 0 && !sheetOpen){ const sig = unlockSig(); if (sig !== lastSig){ lastSig = sig; draw(); } }
    if (n % 80 === 0) save();                       // toutes les 20 s si quelque chose a changé
    if (n % 120 === 0) loadWorld((view === "market" || view === "village"));
  }, 250);
}
/* l'animation suit exactement la simulation : où est chaque fermier, la cabine, la charrette */
let geo = null;
function measure(){
  const sh = wrapEl && wrapEl.querySelector(".b2-shaft"); if (!sh){ geo = null; return; }
  const ys = [0]; wrapEl.querySelectorAll(".b2-plot").forEach(el => ys.push(el.offsetTop + 80));
  const lane = wrapEl.querySelector(".b2-cartlane");
  geo = { ys, lane: lane ? Math.max(40, lane.clientWidth - 72) : 100 };
  const rope = wrapEl.querySelector(".b2-rail .rope"); if (rope) rope.style.height = (ys[ys.length - 1] + 24) + "px";
}
function animate(){
  if (!geo) measure(); if (!geo) return;
  const f = S.farms[S.cur]; if (!f) return;
  f.parcels.forEach((p, i) => {
    const w = wrapEl.querySelector(`[data-wk="${i}"]`); if (!w) return;
    const k = Math.min(1, p.t / BAL.walk), sm = k * k * (3 - 2 * k);
    const x = p.ph === "go" ? 66 - 44 * sm : p.ph === "back" ? 22 + 44 * sm : 66;
    w.style.left = x + "%";
    const cls = "b2-wk " + p.ph + (p.ph === "idle" && !p.mgr ? " tap" : "") + (p.mgr ? " mgr" : ""); if (w.className !== cls) w.className = cls;
    const bar = w.firstElementChild.firstElementChild; if (bar) bar.style.width = (p.ph === "work" ? Math.min(100, p.t / BAL.work * 100) : 0) + "%";
  });
  const e = f.elev, cab = wrapEl.querySelector(".b2-cab");
  if (cab){
    const a = Math.max(0, Math.floor(e.pos)), b2 = Math.min(geo.ys.length - 1, a + 1), fr = e.pos - a;
    const ya = geo.ys[Math.min(a, geo.ys.length - 1)] || 0, yb = geo.ys[b2] || ya;
    cab.style.transform = `translateY(${ya + (yb - ya) * fr}px)`;
    const l = cab.querySelector(".ld"); if (l){ l.textContent = fmtN(e.load); l.style.opacity = e.load >= 1 ? 1 : 0; }
  }
  const c = f.cart, ce = wrapEl.querySelector(".b2-cart");
  if (ce){
    ce.style.transform = `translateX(${c.pos * geo.lane}px)`;
    ce.classList.toggle("mv", c.ph === "go" || c.ph === "back"); ce.classList.toggle("back", c.ph === "back");
    const l = ce.querySelector(".ld"); if (l){ l.textContent = fmtN(c.load); l.style.opacity = c.load >= 1 ? 1 : 0; }
  }
}
const lastPop = {};
function pop(el, text, key){
  const t = now(); if (lastPop[key] && t - lastPop[key] < 700) return; lastPop[key] = t;
  floatText(el, text, "small");
}
function flyGoods(from, to, e, n){
  try{
    if (!from || !to) return;
    const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
    if (a.bottom < 0 || a.top > innerHeight) return;
    for (let j = 0; j < (n || 3); j++){
      const g = document.createElement("span"); g.className = "b2-good"; g.innerHTML = e;
      g.style.left = (a.left + a.width / 2 - 10) + "px"; g.style.top = (a.top + a.height / 2 - 10) + "px";
      g.style.setProperty("--dx", (b.left + b.width / 2 - a.left - a.width / 2) + "px"); g.style.setProperty("--dy", (b.top + b.height / 2 - a.top - a.height / 2) + "px");
      g.style.animationDelay = (j * 90) + "ms"; document.body.appendChild(g); setTimeout(() => g.remove(), 900 + j * 90);
    }
  }catch(_){}
}
function showEvents(ev){
  ev.forEach(x => {
    if (x.key !== S.cur) return;
    const e = P[x.key].e;
    if (x.k === "drop"){ const el = wrapEl.querySelector(`[data-plot="${x.i}"] .pend`); if (el){ pop(el, "+" + fmtN(x.amt, 1), "d" + x.i); bounce(el.querySelector("svg")); } }
    if (x.k === "lift"){ const from = wrapEl.querySelector(`[data-plot="${x.i}"] .pend`), cab = wrapEl.querySelector(".b2-cab"); flyGoods(from, cab, e, 3); if (cab) pop(cab, "+" + fmtN(x.amt, 1), "l"); }
    if (x.k === "top"){ const cab = wrapEl.querySelector(".b2-cab"), q = wrapEl.querySelector(".b2-quai"); flyGoods(wrapEl.querySelector(".b2-tower"), q, e, 3); if (q) pop(q, "+" + fmtN(x.amt, 1), "t"); }
    if (x.k === "barn"){ const el = wrapEl.querySelector(".b2-barn"); flyGoods(wrapEl.querySelector(".b2-cart"), el, e, 4); if (el){ pop(el, "+" + fmtN(x.amt, 1) + " " + e, "b"); bounce(el); } }
  });
}
document.addEventListener("visibilitychange", () => { if (document.hidden && S && wrapEl) save(true); else if (!document.hidden && S && wrapEl){ lastTick = now(); } });

/* =================== Affichage =================== */
function draw(){
  if (!wrapEl || !S) return;
  const main = wrapEl.querySelector("#b2-main");
  const keep = main.dataset.v === view ? main.scrollTop : 0;
  const html = view === "farm" ? farmHTML() : view === "barn" ? barnHTML() : view === "market" ? marketHTML() : villageHTML();
  main.innerHTML = html; main.dataset.v = view; main.scrollTop = keep;
  wrapEl.querySelector("#b2-dock").innerHTML = view === "farm" ? dockHTML() : "";
  wrapEl.querySelector("#b2-tabs").innerHTML = `<div class="b2-col">${TABS.map(t => {
    const lock = t.need && !BX.unlocked(S, t.need);
    const dot = !lock && t.need && !seen("tab_" + t.id);
    return `<button class="b2-tab ${view === t.id ? "on" : ""} ${lock ? "locked" : ""}" data-a="tab" data-v="${t.id}"><span class="i">${lock ? "🔒" : t.i}</span>${t.label}${dot ? `<span class="dot"></span>` : ""}</button>`;
  }).join("")}</div>`;
  geo = null; if (view === "farm") requestAnimationFrame(measure);
  live(true);
}
let shown = { coins: null, wood: null };
function live(force){
  if (!wrapEl || !S) return;
  const q = s => wrapEl.querySelectorAll(s);
  // compteurs qui défilent
  for (const k of ["coins", "wood"]){
    const target = k === "coins" ? S.coins : S.stock.bois;
    if (shown[k] === null || force && Math.abs(target - shown[k]) > target * .5) shown[k] = target;
    shown[k] += (target - shown[k]) * 0.35; if (Math.abs(target - shown[k]) < 0.5) shown[k] = target;
    const el = wrapEl.querySelector(`[data-live="${k}"]`); if (el) el.textContent = fmtN(shown[k]);
  }
  try{ localStorage.setItem("bn2_coins", String(Math.floor(S.coins))); }catch(e){}
  // boutons trop chers
  q("[data-cc]").forEach(b => { const ok = S.coins >= +b.dataset.cc && S.stock.bois >= +(b.dataset.cw || 0); b.classList.toggle("no", !ok); });
  q("[data-mgrc]").forEach(b => b.classList.toggle("can", S.coins >= +b.dataset.mgrc));
  const t = now();
  if (view === "farm"){
    const key = S.cur, f = S.farms[key]; if (!f) return;
    f.parcels.forEach((p, i) => {
      const el = wrapEl.querySelector(`[data-plot="${i}"]`); if (!el) return;
      el.classList.toggle("idle", p.ph === "idle");
      const pe = el.querySelector("[data-pend]"); if (pe) pe.textContent = fmtN(p.pend);
      const full = p.pend >= BAL.pendCap(BAL.parcelRate(i, p.lvl) * (f.boost > t ? 2 : 1)) * .98;
      pe && pe.classList.toggle("warn", full);
    });
    wrapEl.querySelector(".b2-tower")?.classList.toggle("idle", f.elev.ph === "idle");
    const tot = BX.pendTotal(f);
    const he = wrapEl.querySelector("[data-hint=elev]"); if (he) he.style.display = !f.elev.mgr && f.elev.ph === "idle" && tot >= 1 ? "" : "none";
    const hc = wrapEl.querySelector("[data-hint=cart]"); if (hc) hc.style.display = !f.cart.mgr && f.cart.ph === "idle" && f.quai >= 1 ? "" : "none";
    const qe = wrapEl.querySelector("[data-live=quai]"); if (qe) qe.textContent = fmtN(f.quai);
    const sk = wrapEl.querySelector(".b2-quai .sacks");
    if (sk){ const n = Math.min(8, Math.ceil(f.quai / Math.max(1, BX.quaiCap(f)) * 8)); if (+sk.dataset.n !== n){ sk.dataset.n = n; sk.innerHTML = "<i class='sk'></i>".repeat(n); } }
    const cap = BX.barnCap(S), used = BX.stockUnits(S), fill = Math.min(1, used / cap);
    const gb = wrapEl.querySelector(".b2-sky .b2-gbar"); if (gb){ gb.querySelector("i").style.width = (fill * 100) + "%"; gb.classList.toggle("full", fill >= .999); }
    const gl = wrapEl.querySelector("[data-live=barn]"); if (gl) gl.textContent = `${fmtN(used)} / ${fmtN(cap)}`;
    const sv = wrapEl.querySelector("[data-live=sellv]");
    if (sv){ const q = Math.floor(S.stock[S.cur] || 0); sv.textContent = fmtN(q * P[S.cur].floor); const btn = sv.closest(".b2-sellbtn"); btn.classList.toggle("empty", q < 1); btn.classList.toggle("ready", q >= 1 && S.stats.earned === 0); }
    const ba = wrapEl.querySelector(".b2-barn"); if (ba){ const n = Math.round(fill * 10); if (+ba.dataset.n !== n){ ba.dataset.n = n; ba.innerHTML = barnArt(fill); } }
    const bn = BX.bottleneck(S, key, t);
    q("[data-slow]").forEach(e => e.style.display = e.dataset.slow === bn ? "" : "none");
    const bb = wrapEl.querySelector("[data-a=boost]");
    if (bb){
      const on = f.boost > t, cd = f.boostCd > t;
      bb.classList.toggle("on", on); bb.classList.toggle("cool", !on && cd);
      bb.querySelector(".t").textContent = on ? `×2 · ${fmtT(f.boost - t)}` : cd ? fmtT(f.boostCd - t) : "×2";
    }
  }
  if (view === "barn"){
    q("[data-slot]").forEach(el => {
      const sl = S.oven.slots[+el.dataset.slot]; if (!sl) return;
      const k = Math.min(1, (t - sl.t0) / sl.dur);
      el.querySelector(".pb i").style.width = (k * 100) + "%"; el.querySelector(".t").textContent = fmtT(sl.t0 + sl.dur - t);
    });
    const cg = wrapEl.querySelector("[data-live=cap]"); if (cg){ const cap = BX.barnCap(S), used = BX.stockUnits(S); cg.textContent = `${fmtN(used)} / ${fmtN(cap)}`; const gb = cg.closest(".b2-cap").querySelector(".b2-gbar"); gb.querySelector("i").style.width = Math.min(100, used / cap * 100) + "%"; gb.classList.toggle("full", used >= cap); }
    q("[data-stock]").forEach(e => e.textContent = fmtN(S.stock[e.dataset.stock]));
  }
  if (view === "village"){
    const c = wrapEl.querySelector("[data-live=clock]"); if (c) c.textContent = fmtT((S.orders.slot + 1) * BAL.slotMs - t);
  }
}

/* ---------- Ferme ---------- */
// le rond du contremaître : vide (à engager) ou occupé
function seatHTML(kind, has, cost, i){
  const di = i !== undefined ? `data-i="${i}"` : "";
  return has ? `<button class="b2-seat on" data-a="station" data-k="${kind}" ${di} aria-label="Contremaître engagé">${MGR[kind]}<i>Auto</i></button>`
    : `<button class="b2-btn gold b2-hire" data-a="hire" data-k="${kind}" ${di} data-cc="${cost}" aria-label="Engager un contremaître pour ${fmtN(cost)} pièces">+${MGR[kind]} ${COIN}${fmtN(cost)}</button>`;
}
function upCost(kind, f, i){
  const at = kind === "parcel" ? L => BAL.parcelCost(i, L) : kind === "elev" ? BAL.elevCost : BAL.cartCost;
  const L = kind === "parcel" ? f.parcels[i].lvl : f[kind].lvl;
  const b = BX.bulk(at, L, mult === "max" ? "max" : mult, S.coins);
  if (b.n === 0) return { n: 1, coins: BX.nice(at(L)) };
  return b;
}
const upLabel = u => `⬆ ${u.n > 1 ? `+${u.n} ` : ""}${COIN}${fmtN(u.coins)}`;
function stationChip(kind, f){
  const u = upCost(kind, f), lvl = f[kind].lvl, cap = kind === "elev" ? BAL.elevCap(lvl) : BAL.cartCap(lvl);
  const cost = kind === "elev" ? BAL.elevMgr : BAL.cartMgr, has = f[kind].mgr;
  return `<div class="b2-stn ${kind}" data-a="station" data-k="${kind}">
    <span class="b2-slow" data-slow="${kind}" style="display:none">Lent</span>
    <div class="top">${has ? `<span class="b2-seat on">${MGR[kind]}<i>Auto</i></span>` : ""}<div class="nm"><b>${kind === "elev" ? "Monte-charge" : "Charrette"}</b><span class="meta">Niv ${lvl} · ${fmtN(cap)} par trajet</span></div></div>
    <div class="btns"><button class="b2-btn" data-a="up-${kind}" data-cc="${u.coins}">${upLabel(u)}</button>${has ? "" : seatHTML(kind, false, cost)}</div></div>`;
}
function farmHTML(){
  const key = S.cur, f = S.farms[key], t = now(), pr = P[key];
  const r = BX.farmRates(f, t), cap = BX.barnCap(S), used = BX.stockUnits(S);
  const farmsK = Object.keys(S.farms);
  const depth = i => `hsl(${26 - i * 1.2} ${42 - i * 2}% ${34 - i * 2.6}%)`;
  const tip = farmTip();
  let plots = f.parcels.map((p, i) => {
    const pu = upCost("parcel", f, i), rate = BAL.parcelRate(i, p.lvl) * r.boost;
    const next = BX.MILES.find(m => m > p.lvl);
    return `<div class="b2-plot" data-plot="${i}" style="--soil:${depth(i)}">
      <div class="art" data-a="tap-parcel" data-i="${i}">${plotArt(key, i, p.lvl)}<div class="b2-path"></div>
        <div class="pend"><span class="b2-tag" data-pend>${fmtN(p.pend)}</span>${CRATE}</div>
        <div class="b2-wk ${p.ph}" data-wk="${i}"><div class="bar"><i></i></div><span class="carry">${pr.e}</span><span class="who">${BODY.parcel}</span><span class="b2-call">👆 Récolter</span></div>
      </div><span class="b2-plvl">Niv <b>${p.lvl}</b></span>
      <div class="b2-sign"><div class="row">
        ${seatHTML("parcel", p.mgr, BX.nice(BAL.parcelMgr(i)), i)}
        <div class="sp" data-a="station" data-k="parcel" data-i="${i}"><h3>${esc(pr.short)} ${i + 1}</h3>
        <div class="meta">${pr.e} ${fmtN(rate, 1)}/s</div>${next ? `<div class="meta" style="font-size:11.5px;opacity:.8">×2 au niveau ${next}</div>` : ""}</div>
        <button class="b2-btn" data-a="up-parcel" data-i="${i}" data-cc="${pu.coins}">${upLabel(pu)}</button>
      </div></div></div>`;
  }).join("");
  const nc = BX.nextParcelCost(f), ni = f.parcels.length;
  plots += `<div class="b2-locked">${nc.palier ? `<span class="palier">Palier</span>` : ""}<h3>${esc(pr.short)} ${ni + 1}</h3>
    <p>${nc.wood ? `Il faut aussi du bois pour la construire.${S.stock.bois < nc.wood && key !== "bois" ? " Le bois s'achète au marché." : ""}` : "Une nouvelle parcelle produit beaucoup plus que la précédente."}</p>
    <button class="b2-btn gold" data-a="unlock" data-cc="${nc.coins}" data-cw="${nc.wood}">🔓 Débloquer ${price(nc)}</button></div>`;
  return `<div class="b2-farm"><div class="b2-col">
    <div class="b2-sky">
      <div class="sun"></div><div class="b2-cloud" style="top:92px;width:58px;animation-duration:70s;animation-delay:-20s"></div><div class="b2-cloud" style="top:120px;width:44px;animation-duration:95s;animation-delay:-60s"></div>
      <svg class="b2-hills" viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 50 Q60 10 130 38 T260 30 T400 34 V70 H0Z" fill="#A9D47D"/><path d="M0 60 Q90 34 180 54 T400 50 V70 H0Z" fill="#94C66A"/></svg>
      ${stationChip("elev", f)}
      ${stationChip("cart", f)}
      <div class="b2-gauge" data-a="tab" data-v="barn"><div class="b2-glab"><span>Grange</span><span data-live="barn">${fmtN(used)} / ${fmtN(cap)}</span></div><div class="b2-gbar"><i style="width:${Math.min(100, used / cap * 100)}%"></i></div>
        <div data-slow="barn" style="display:none;margin-top:4px;text-align:right"><span class="b2-tag warn">Pleine : la récolte s'arrête</span></div></div>
      <div class="b2-barn" data-a="tab" data-v="barn" data-n="-1"></div>
      <button class="b2-sellbtn" data-a="quick-sell" aria-label="Vendre ta récolte au village"><span class="l">Vendre</span><span class="v">${COIN}<b data-live="sellv">0</b></span></button>
      <div class="b2-ground"></div><div class="b2-road"></div>
      <button class="b2-tower" data-a="tap-elev" aria-label="Faire monter le monte-charge">${TOWER}<span class="b2-call up" data-hint="elev">👆 Ramasser</span></button>
      <div class="b2-quai"><span class="b2-tag" data-live="quai">${fmtN(f.quai)}</span><div class="sacks" data-n="-1"></div><small>Dépôt</small></div>
      <button class="b2-cartlane" data-a="tap-cart" aria-label="Faire rouler la charrette"><div class="b2-cart"><span class="ld">0</span>${CART}<span class="pusher">${BODY.cart}</span><span class="b2-call up" data-hint="cart">👆 Livrer</span></div></button>
    </div>
    ${farmsK.length > 1 ? `<div class="b2-farmsw">${farmsK.map(k => `<button class="${k === key ? "on" : ""}" data-a="farm" data-k="${k}">${P[k].e} ${P[k].label}</button>`).join("")}</div>` : ""}
    ${tip}
    <div class="b2-shaft">
      <button class="b2-rail" data-a="tap-elev" aria-label="Faire monter le monte-charge"><div class="rope"></div><div class="b2-cab"><span class="ld">0</span>${CABIN}</div></button>
      ${plots}
    </div>
    ${farm2HTML()}
    <div class="b2-deep"></div><div style="height:84px;background:#2A190D"></div>
  </div></div>`;
}
/* fiche d'une station : ce que l'amélioration apporte, et le contremaître */
function stationSheet(kind, i){ sheetCtx = { type:"station", kind, i }; sheet(stationInner().replace('<div class="grab"></div>', '')); }
function stationInner(){
  const { kind, i } = sheetCtx, f = S.farms[S.cur], t = now(), boost = f.boost > t ? 2 : 1;
  const st = kind === "parcel" ? f.parcels[i] : f[kind], L = st.lvl, u = upCost(kind, f, i), L2 = L + u.n;
  const rate = l => BAL.parcelRate(i, l) * boost;
  const name = kind === "parcel" ? `${P[S.cur].short} ${i + 1}` : kind === "elev" ? "Monte-charge" : "Charrette";
  const what = kind === "parcel" ? `Produit ${P[S.cur].e} ${esc(P[S.cur].label.toLowerCase())} dans son panier, en bas à gauche.`
    : kind === "elev" ? "Descend étage par étage, vide le panier de chaque parcelle dans sa cabine, puis remonte et dépose tout en haut." : "Charge le tas en haut du monte-charge, le roule jusqu'à la grange, décharge et revient.";
  const cost = kind === "parcel" ? BX.nice(BAL.parcelMgr(i)) : kind === "elev" ? BAL.elevMgr : BAL.cartMgr;
  const manual = kind === "parcel" ? "toucher la parcelle" : kind === "elev" ? "toucher le monte-charge" : "toucher la charrette";
  const next = BX.MILES.find(m => m > L);
  const rows = (kind === "parcel" ? [["Production", `${fmtN(rate(L), 1)}/s`, `${fmtN(rate(L2), 1)}/s`]]
    : kind === "elev" ? [["Par trajet", fmtN(BAL.elevCap(L)), fmtN(BAL.elevCap(L2))], ["Vitesse", `${fmtN(BAL.elevSpeed(L), 1)} étage/s`, `${fmtN(BAL.elevSpeed(L2), 1)} étage/s`]]
    : [["Par trajet", fmtN(BAL.cartCap(L)), fmtN(BAL.cartCap(L2))], ["Aller jusqu'à la grange", `${fmtN(BAL.cartTime(L), 1)} s`, `${fmtN(BAL.cartTime(L2), 1)} s`]]);
  return `<div class="grab"></div><h3>${MGR[kind]} ${name} <span class="b2-lvl">Niv ${L}</span></h3><p>${what}</p>
    <div class="b2-stat">${rows.map(([a, b, c]) => `<div><span>${a}</span><b>${b}</b><span class="ar">→</span><b class="up2">${c}</b></div>`).join("")}</div>
    ${next ? `<p class="b2-note" style="margin:6px 0 0">Au niveau ${next}, ${kind === "parcel" ? "la production" : "la capacité"} double.</p>` : ""}
    <div class="b2-seg light">${[1, 10, "max"].map(m => `<button class="${mult === m ? "on" : ""}" data-a="st-mult" data-m="${m}">${m === "max" ? "Max" : "×" + m}</button>`).join("")}</div>
    <button class="b2-btn big" style="margin-top:10px" data-a="st-up" data-cc="${u.coins}">Améliorer au niveau ${L2} · ${COIN}${fmtN(u.coins)}</button>
    <div class="b2-boss ${st.mgr ? "on" : ""}"><span class="f">${MGR[kind]}</span><div class="sp">${st.mgr
      ? `<b>Contremaître engagé</b><span>Il travaille tout seul, même quand l'appli est fermée.</span></div>`
      : `<b>Contremaître</b><span>Sans lui, il faut ${manual} à chaque fois. Lui le fait tout seul, même appli fermée.</span></div><button class="b2-btn gold" data-a="st-hire" data-cc="${cost}">Engager ${COIN}${fmtN(cost)}</button>`}</div>`;
}
function refreshStation(){ const sh = wrapEl && wrapEl.querySelector(".b2-sheet"); if (sh && sheetCtx && sheetCtx.type === "station"){ sh.innerHTML = stationInner(); live(); } }
function farm2HTML(){
  if (!BX.unlocked(S, "farm2") || S.cur !== S.spec) return "";
  const free = BX.RAW.filter(k => !S.farms[k]); if (!free.length) return "";
  const c = BX.costs.farm(S);
  return `<div style="padding:0 10px 14px"><div class="b2-locked" style="background:#3B2414"><span class="palier">Concurrence</span><h3>Ouvrir une autre exploitation</h3>
    <p>Produis aussi une ressource d'un voisin et vends-la moins cher que lui.</p><button class="b2-btn gold" data-a="farm2" data-cc="${c.coins}" data-cw="${c.wood}">Choisir ${price(c)}</button></div></div>`;
}
function dockHTML(){
  const f = S.farms[S.cur], all = f.parcels.every(p => p.mgr) && f.elev.mgr && f.cart.mgr;
  const a = P[S.cur].act;
  return `<div class="b2-dock"><div class="b2-col">
    ${all ? "" : `<button class="b2-act main" data-a="harvest">🧺 Tout récolter</button>`}
    ${BX.unlocked(S, "boost") ? `<button class="b2-act" data-a="boost" aria-label="${esc(a.label)} : production ×2 pendant 1 minute">${a.e} ${esc(a.label)} <span class="t">×2</span></button>` : ""}
  </div></div>`;
}
const TIPS = [
  { id:"start",  when: () => S.stats.produced === 0 && S.coins === 0, i:"👆", txt:"Touche ton champ pour récolter. Puis touche le monte-charge (à gauche) pour remonter le panier, et la charrette pour le porter à la grange. « Tout récolter » fait tout d'un coup." },
  { id:"sell",   when: () => S.stats.earned === 0 && S.stock[S.spec] >= 1, i:"💰", txt:"Ta récolte est dans la grange ! Touche le bouton doré « Vendre » sur la grange pour la transformer en pièces." },
  { id:"mgr",    when: () => S.coins >= 25 && !S.farms[S.spec].parcels[0].mgr, i:"🧑‍🌾", txt:"Fatigué de toucher ? Engage un contremaître (les ronds « Engager ») : il fait le travail tout seul, même quand l'appli est fermée." },
  { id:"slow",   when: () => !!BX.bottleneck(S, S.cur, now()) && S.farms[S.cur].parcels[0].mgr, i:"🐢", txt:"Le badge « Lent » montre le maillon qui freine ta ferme. Paniers pleins en bas : améliore le monte-charge. Tas en haut : la charrette." },
  { id:"boost",  when: () => BX.unlocked(S, "boost"), i: () => P[S.spec].act.e, txt: () => `${P[S.spec].act.txt}, pendant 1 minute. Tu peux recommencer toutes les 4 minutes.` },
  { id:"marche", when: () => BX.unlocked(S, "marche"), i:"📈", txt:"Le marché est ouvert : achète et vends avec tes amis, au prix que tu choisis." },
  { id:"wood",   when: () => { const n = BX.nextParcelCost(S.farms[S.spec]); return n.wood > 0 && S.spec !== "bois"; }, i:"🪵", txt:"Les constructions demandent du bois. Achète-le au marché, ou au village (plus cher)." },
  { id:"village",when: () => BX.unlocked(S, "village"), i:"🏘️", txt:"Le village passe commande toutes les 20 minutes, avec de grosses primes. Et le four est prêt à être construit dans la grange." },
  { id:"farm2",  when: () => BX.unlocked(S, "farm2"), i:"⚔️", txt:"Tu peux maintenant ouvrir une 2e exploitation, d'un produit d'un ami. Tout en bas de ta ferme." },
];
function farmTip(){
  const t = TIPS.find(x => !seen("tip_" + x.id) && x.when());
  const v = x => typeof x === "function" ? x() : x;
  return t ? `<div class="b2-tip"><span class="i">${v(t.i)}</span><span>${v(t.txt)}</span><button data-a="tipx" data-id="${t.id}" aria-label="J'ai compris">×</button></div>` : "";
}

/* ---------- Grange ---------- */
function barnHTML(){
  const cap = BX.barnCap(S), used = BX.stockUnits(S), bc = BX.costs.barn(S);
  const tiles = BX.ALL.filter(k => !P[k].rec || BX.unlocked(S, "four")).map(k => `<button class="b2-tile ${k === S.spec ? "mine" : ""} ${S.stock[k] < 1 ? "zero" : ""}" data-a="prod" data-k="${k}">
      <div class="ic">${P[k].e}</div><b data-stock="${k}">${fmtN(S.stock[k])}</b><small>${esc(P[k].label)}</small></button>`).join("");
  return `<div class="b2-barnin"><div class="b2-col b2-pad">
    <div class="b2-paper">
      <h2 class="b2-h2">Ta grange<small>Niveau ${S.barn}. Quand elle est pleine, ta ferme s'arrête.</small></h2>
      <div class="b2-cap"><div class="b2-gbar"><i style="width:${Math.min(100, used / cap * 100)}%"></i></div><b data-live="cap">${fmtN(used)} / ${fmtN(cap)}</b></div>
      <div style="display:flex;align-items:center;gap:8px;margin-top:10px"><span class="b2-note" style="margin:0;flex:1">Agrandir : ${fmtN(BAL.barnCap(S.barn + 1))} places</span>
      <button class="b2-btn" data-a="up-barn" data-cc="${bc.coins}" data-cw="${bc.wood}">Agrandir ${price(bc)}</button></div>
    </div>
    <div class="b2-paper"><h2 class="b2-h2">Le stock<small>Touche un produit pour le vendre.</small></h2><div class="b2-stock">${tiles}</div></div>
    ${ovenHTML()}
  </div></div>`;
}
function ovenHTML(){
  if (!BX.unlocked(S, "four")) return `<div class="b2-paper"><div class="b2-teaser"><span class="i">🔥</span><span>Un four pour fabriquer pain, crêpes et gâteaux se débloque avec ta 3e parcelle.</span></div></div>`;
  const o = S.oven, c = BX.costs.oven(S);
  if (!o.lvl) return `<div class="b2-paper"><div class="b2-oven cold"><div class="art">${ovenArt()}</div><div><h2 class="b2-h2">Le four<small>Transforme tes produits et ceux de tes amis en pain, crêpes, tartes, confitures et gâteaux, très demandés par le village.</small></h2>
    <button class="b2-btn gold" data-a="up-oven" data-cc="${c.coins}" data-cw="${c.wood}">Construire ${price(c)}</button></div></div></div>`;
  const nS = BAL.ovenSlots(o.lvl), hot = o.slots.some(x => x);
  const next = o.lvl >= BAL.ovenMax ? "" : o.lvl < 4 ? `Niveau ${o.lvl + 1} : ${o.lvl + 1} places de cuisson` : `Niveau ${o.lvl + 1} : cuisson plus rapide`;
  const slots = Array.from({ length: nS }, (_, i) => {
    const sl = o.slots[i];
    if (!sl) return `<button class="b2-slot free" data-a="bake" data-slot="-1">＋ Place libre · cuisiner quelque chose</button>`;
    const k = Math.min(1, (now() - sl.t0) / sl.dur);
    return `<div class="b2-slot" data-slot="${i}"><span class="ic">${P[sl.rec].e}</span><div class="sp"><b>${fmtN(sl.qty)} ${esc(P[sl.rec].label)}</b><div class="pb"><i style="width:${k * 100}%"></i></div></div><span class="t">${fmtT(sl.t0 + sl.dur - now())}</span></div>`;
  }).join("");
  const recs = BX.CRAFT.map(k => {
    const can = BX.canBake(S, k);
    const ing = Object.keys(P[k].rec).map(x => { const ok = S.stock[x] >= 1; return `<span class="${ok ? "ok" : "ko"}">${P[x].e} ${fmtN(S.stock[x])}</span>`; }).join("");
    const miss = Object.keys(P[k].rec).find(x => S.stock[x] < 1);
    return `<div class="b2-rec"><span class="ic">${P[k].e}</span><div class="sp"><b>${esc(P[k].label)}</b><div class="b2-ing">${ing}</div></div>
      ${can >= 1 ? `<button class="b2-btn" data-a="bake" data-k="${k}">Cuire</button>` : miss && BX.unlocked(S, "marche") ? `<button class="b2-btn red" data-a="goto-mkt" data-k="${miss}">Acheter ${P[miss].e}</button>` : ""}</div>`;
  }).join("");
  return `<div class="b2-paper"><div class="b2-oven ${hot ? "" : "cold"}"><div class="art">${ovenArt(hot)}</div><div style="flex:1"><h2 class="b2-h2">Le four<small>Niveau ${o.lvl} · ${nS} place${nS > 1 ? "s" : ""} · fournées de ${fmtN(BX.ovenBatch(S))} max</small></h2>
    ${o.lvl < BAL.ovenMax ? `<button class="b2-btn" data-a="up-oven" data-cc="${c.coins}" data-cw="${c.wood}">Améliorer ${price(c)}</button><p class="b2-note">${next}</p>` : ""}</div></div>
    <div class="b2-slots">${slots}</div></div>
    <div class="b2-paper"><h2 class="b2-h2">Recettes<small>En vert : tu as l'ingrédient. En rouge : il te manque.</small></h2>${recs}</div>`;
}

/* ---------- Marché ---------- */
function tradesOf(k, since){ return W.trades.filter(t => t.product === k && (!since || t.ts >= since)); }
function quote(k){
  const t = now(), d = 86400000;
  const vw = a => { let q = 0, v = 0; a.forEach(x => { q += +x.qty; v += x.qty * x.price; }); return q ? v / q : null; };
  const cur = vw(tradesOf(k, t - d)), prev = vw(W.trades.filter(x => x.product === k && x.ts < t - d && x.ts >= t - 2 * d));
  const all = tradesOf(k);
  const last = all.length ? +all[all.length - 1].price : null;
  const p = cur ?? last;
  let ch = null;
  if (p != null){ const ref = prev ?? (tradesOf(k, t - d)[0] || {}).price; if (ref) ch = (p - ref) / ref * 100; }
  return { p, ch, n: all.length };
}
const chg = ch => ch == null ? `<span class="flat">—</span>` : `<span class="${ch > 0.05 ? "up" : ch < -0.05 ? "down" : "flat"}">${ch > 0 ? "+" : ""}${ch.toFixed(1).replace(".", ",")} %</span>`;
function candles(k, period){
  const t = now(), spec = { "1h": [12, 300000], "24h": [24, 3600000], "7j": [28, 21600000] }[period];
  const [n, b] = spec, t0 = t - n * b;
  const all = tradesOf(k);
  let prev = null; all.forEach(x => { if (x.ts < t0) prev = +x.price; });
  const out = [];
  for (let j = 0; j < n; j++){
    const a = tradesOf(k).filter(x => x.ts >= t0 + j * b && x.ts < t0 + (j + 1) * b);
    if (a.length){ const ps = a.map(x => +x.price), v = a.reduce((s, x) => s + +x.qty, 0); out.push({ o: prev ?? ps[0], c: ps[ps.length - 1], h: Math.max(...ps, prev ?? ps[0]), l: Math.min(...ps, prev ?? ps[0]), v }); prev = ps[ps.length - 1]; }
    else out.push(prev == null ? null : { o: prev, c: prev, h: prev, l: prev, v: 0, flat: true });
  }
  return out;
}
function chartSVG(k, period){
  const cs = candles(k, period), floor = P[k].floor, W_ = 340, H = 170, padL = 4, padR = 34, top = 10, bot = 22;
  const vals = cs.filter(Boolean).flatMap(c => [c.h, c.l]).concat([floor]);
  let mx = Math.max(...vals) * 1.06, mn = Math.min(...vals) * 0.9; if (mx - mn < 1) mx = mn + 1;
  const y = v => top + (mx - v) / (mx - mn) * (H - top - bot);
  const cw = (W_ - padL - padR) / cs.length;
  const vmax = Math.max(1, ...cs.filter(Boolean).map(c => c.v));
  let g = "";
  [0.25, 0.5, 0.75].forEach(f => { const v = mn + (mx - mn) * f; g += `<path d="M${padL} ${y(v)} H${W_ - padR}" stroke="rgba(239,234,219,.08)"/><text x="${W_ - padR + 4}" y="${y(v) + 4}" font-size="10" fill="rgba(239,234,219,.5)" font-family="ui-rounded,system-ui" font-weight="700">${fmtP(v)}</text>`; });
  cs.forEach((c, j) => {
    if (!c) return;
    const x = padL + j * cw + cw / 2, upC = c.c >= c.o, col = c.flat ? "rgba(239,234,219,.35)" : upC ? "#6EE09A" : "#FF8A70";
    g += `<rect x="${x - cw * .35}" y="${H - bot - (c.v / vmax) * 18}" width="${cw * .7}" height="${(c.v / vmax) * 18}" fill="rgba(239,234,219,.08)"/>`;
    g += `<path d="M${x} ${y(c.h)} V${y(c.l)}" stroke="${col}" stroke-width="1.4"/>`;
    const yo = y(Math.max(c.o, c.c)), hh = Math.max(1.5, Math.abs(y(c.o) - y(c.c)));
    g += `<rect x="${x - cw * .32}" y="${yo}" width="${cw * .64}" height="${hh}" rx="1" fill="${col}"/>`;
  });
  g += `<path d="M${padL} ${y(floor)} H${W_ - padR}" stroke="#F2B33D" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${padL + 4}" y="${y(floor) - 5}" font-size="10.5" fill="#F2B33D" font-family="ui-rounded,system-ui" font-weight="800">Rachat du village · ${fmtP(floor)}</text>`;
  const lab = { "1h": ["il y a 1 h", "maintenant"], "24h": ["hier", "maintenant"], "7j": ["il y a 7 j", "maintenant"] }[period];
  g += `<text x="${padL}" y="${H - 6}" font-size="10" fill="rgba(239,234,219,.5)" font-family="ui-rounded,system-ui" font-weight="700">${lab[0]}</text><text x="${W_ - padR}" y="${H - 6}" text-anchor="end" font-size="10" fill="rgba(239,234,219,.5)" font-family="ui-rounded,system-ui" font-weight="700">${lab[1]}</text>`;
  if (!cs.some(Boolean)) g += `<text x="${(W_ - padR) / 2}" y="${H / 2 - 10}" text-anchor="middle" font-size="13" fill="rgba(239,234,219,.6)" font-family="ui-rounded,system-ui" font-weight="800">Pas encore d'échange sur cette période</text>`;
  return `<svg viewBox="0 0 ${W_} ${H}" role="img" aria-label="Cours de ${esc(P[k].label)}">${g}</svg>`;
}
function marketHTML(){
  if (!mkt.k) mkt.k = BX.RAW.find(k => k !== S.spec) || "bois";
  const k = mkt.k, qv = quote(k);
  const prods = BX.ALL.filter(x => !P[x].rec || BX.unlocked(S, "four"));
  const pills = prods.map(x => { const q = quote(x); return `<button class="b2-chip ${x === k ? "on" : ""}" data-a="mkt-k" data-k="${x}"><span class="n">${P[x].e} ${esc(P[x].label)}</span><span class="p">${q.p != null ? fmtP(q.p) : "—"}</span><span class="c">${chg(q.ch)}</span></button>`; }).join("");
  const offers = W.listings.filter(l => l.product === k).sort((a, b) => a.price - b.price || a.id - b.id);
  const resL = BX.reserveLeft(S, k, now());
  const rows = offers.map(l => {
    const mine = l.seller_id === ME.id;
    return `<div class="b2-ord ${mine ? "me" : ""}"><span class="who">${mine ? "Toi" : esc(nameOf(l.seller_id))}<small>${fmtAgo(new Date(l.created_at).getTime())}</small></span><span class="q">${fmtN(l.qty)}</span><span class="pr">${fmtP(+l.price)}</span>
      ${mine ? `<button class="b2-btn ghost" style="color:var(--chalk)!important;background:rgba(255,255,255,.1)!important" data-a="unlist" data-id="${l.id}">Retirer</button>` : `<button class="b2-btn" data-a="buy" data-id="${l.id}">Acheter</button>`}</div>`;
  }).join("");
  const res = `<div class="b2-ord res"><span class="who">🏘️ Le village<small>Dépannage, cher et limité</small></span><span class="q">${fmtN(resL)}</span><span class="pr">${fmtP(BX.reservePrice(k))}</span>
    <button class="b2-btn gold" data-a="buy-res" ${resL < 1 ? "disabled" : ""}>Acheter</button></div>`;
  const hist = W.trades.filter(t => t.product === k).slice(-12).reverse().map(t => `<div class="b2-ord"><span class="who">${esc(t.buyer_id === ME.id ? "Toi" : nameOf(t.buyer_id))} ← ${esc(t.seller_id === ME.id ? "toi" : nameOf(t.seller_id))}<small>${fmtAgo(t.ts)}</small></span><span class="q">${fmtN(t.qty)}</span><span class="pr">${fmtP(+t.price)}</span></div>`).join("");
  return `<div class="b2-board"><div class="b2-pills">${pills}</div><div class="b2-col" style="padding:4px 16px 24px">
    <div class="b2-quote"><div><div style="font:800 13px var(--round);color:var(--chalk2)">${P[k].e} ${esc(P[k].label)} · prix moyen 24 h</div><span class="big">${COIN}${qv.p != null ? fmtP(qv.p) : "—"}</span><span class="ch">${chg(qv.ch)}</span></div>
      <div class="lim">Village rachète à <b>${fmtP(P[k].floor)}</b><br>Réserve du village <b>${fmtP(BX.reservePrice(k))}</b><br>Tu en as <b>${fmtN(S.stock[k])}</b></div></div>
    <div class="b2-seg">${["1h", "24h", "7j"].map(p => `<button class="${mkt.period === p ? "on" : ""}" data-a="mkt-p" data-p="${p}">${p === "1h" ? "1 h" : p === "24h" ? "24 h" : "7 j"}</button>`).join("")}</div>
    <div class="b2-chart">${chartSVG(k, mkt.period)}</div>
    <div class="b2-two"><button class="b2-btn" data-a="list" data-k="${k}" ${S.stock[k] < 1 ? "disabled" : ""}>Mettre en vente</button><button class="b2-btn gold" data-a="sell" data-k="${k}" ${S.stock[k] < 1 ? "disabled" : ""}>Vendre au village</button></div>
    <h3 class="b2-h3">Offres des joueurs</h3>
    <div class="b2-book">${rows || `<div class="b2-empty">Personne n'en vend pour l'instant.${k === S.spec ? " Tu es le seul à en produire : à toi de fixer ton prix." : ""}</div>`}${res}</div>
    <h3 class="b2-h3">Dernières transactions</h3>
    <div class="b2-book b2-hist">${hist || `<div class="b2-empty">Aucune transaction encore.</div>`}</div>
  </div></div>`;
}

/* ---------- Village ---------- */
function villageHTML(){
  BX.ensureOrders(S, now(), ME.id, groupProd());
  const notes = S.orders.list.map(o => {
    const got = S.orders.prog[o.id] || 0, done = got >= o.qty, c = BX.CHARS[o.who], have = Math.floor(S.stock[o.k]);
    const canBake = P[o.k].rec && S.oven.lvl && BX.canBake(S, o.k) >= 1;
    const action = done ? "" : have >= 1 ? `<button class="b2-btn" data-a="deliver" data-id="${o.id}">Livrer ${fmtN(Math.min(have, o.qty - got))}</button>`
      : canBake ? `<button class="b2-btn gold" data-a="bake" data-k="${o.k}">Au four</button>`
      : `<button class="b2-btn red" data-a="goto-mkt" data-k="${o.k}">Acheter</button>`;
    return `<div class="b2-order ${done ? "done" : ""}"><div class="hd"><span class="face">${c.e}</span><div class="sp"><div class="who">${c.name}</div><div class="want">veut ${fmtN(o.qty)} ${P[o.k].e} ${esc(P[o.k].label)}</div></div>
      <div class="prime">+${COIN}${fmtN(o.bonus)}<small>de prime</small></div></div>
      <div class="pb"><i style="width:${Math.min(100, got / o.qty * 100)}%"></i></div>
      <div class="ft"><span>${fmtN(got)} / ${fmtN(o.qty)} livrés</span><span class="sp"></span><span>Tu en as ${fmtN(have)}</span>${action}</div>${done ? `<span class="stamp">Livré !</span>` : ""}</div>`;
  }).join("");
  const players = W.players.map(p => p.id === ME.id ? Object.assign({}, p, { stats: publicStats() }) : p);
  if (!players.some(p => p.id === ME.id)) players.push({ id: ME.id, name: ME.name, specialty: S.spec, stats: publicStats() });
  players.sort((a, b) => (+b.stats?.fortune || 0) - (+a.stats?.fortune || 0));
  const top = players[0];
  const best = (key, label, i, unit) => { const p = players.slice().sort((a, b) => (+b.stats?.[key] || 0) - (+a.stats?.[key] || 0))[0]; return p && +p.stats?.[key] > 0 ? `<div class="b2-ttl"><span class="i">${i}</span><b>${label}</b><span>${esc(p.id === ME.id ? "Toi" : p.name)}</span></div>` : `<div class="b2-ttl"><span class="i" style="filter:grayscale(1)">${i}</span><b>${label}</b><span style="color:var(--ink3)">Personne encore</span></div>`; };
  return `<div class="b2-vil"><div class="b2-col b2-pad">
    <div class="b2-paper" style="background:#FFF4E0"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><h2 class="b2-h2" style="margin:0">Commandes du village<small>Livre en plusieurs fois. La prime tombe à la fin.</small></h2><span class="b2-clock">⏳ <span data-live="clock">${fmtT((S.orders.slot + 1) * BAL.slotMs - now())}</span></span></div></div>
    <div class="b2-notes">${notes}</div>
    ${top ? `<div class="b2-baron"><span class="crown">👑</span><div class="sp"><small>Le Baron du moment</small><b>${esc(top.id === ME.id ? "C'est toi !" : top.name)}</b><span class="f">${COIN}${fmtN(top.stats?.fortune || 0)} · ${P[top.specialty]?.e || ""} ${esc(P[top.specialty]?.label || "")}</span></div></div>` : ""}
    <div class="b2-paper b2-rank"><h2 class="b2-h2">Classement<small>Fortune : argent, stock et la moitié de ce que tu as construit.</small></h2>
      ${players.map((p, i) => `<div class="b2-rk ${p.id === ME.id ? "me" : ""}"><span class="n">${i === 0 ? "👑" : i + 1}</span><span class="ic">${P[p.specialty]?.e || ""}</span><span class="sp">${esc(p.id === ME.id ? "Toi" : p.name)}<small>${esc(P[p.specialty]?.label || "")}${p.stats?.farms && p.stats.farms.length > 1 ? " + " + p.stats.farms.filter(x => x !== p.specialty).map(x => P[x]?.e).join("") : ""} · ${fmtN(p.stats?.prod || 0, 1)} pièces/s</small></span><span class="f">${COIN}${fmtN(p.stats?.fortune || 0)}</span></div>`).join("")}
    </div>
    <div class="b2-titles">${best("prod", "Gros producteur", "🏭")}${best("traded", "Meilleur trader", "📈")}${best("baked", "Pâtissier", "🧁")}${best("orders", "Ami du village", "📦")}</div>
  </div></div>`;
}

/* ---------- Choix de la spécialité ---------- */
let picking = null, pickData = [];
async function showPick(err){
  const main = wrapEl && wrapEl.querySelector("#b2-main"); if (!main) return;
  wrapEl.querySelector("#b2-tabs").innerHTML = ""; wrapEl.querySelectorAll("[data-live]").forEach(e => e.textContent = "0");
  try{ const r = await rpc("baron2_world", {}); pickData = r.players || []; }catch(e){ main.innerHTML = `<div class="b2-load"><div style="text-align:center;padding:24px">${esc(errText(e))}<br><br><button class="b2-btn" data-a="pick-retry">Réessayer</button></div></div>`; return; }
  drawPick(err);
}
function drawPick(err){
  const main = wrapEl && wrapEl.querySelector("#b2-main"); if (!main) return;
  const me = Q.me(), taken = Object.fromEntries(pickData.map(p => [p.specialty, p])), mine = pickData.find(p => p.id === me.id);
  const full = pickData.length >= 6;
  main.innerHTML = `<div class="b2-pick"><div class="b2-col b2-pad">
    <h1>Le Baron</h1>
    <p>Monte ta ferme, vends au village et à tes amis, deviens le plus riche du groupe. Une seule place par spécialité : choisis la tienne.</p>
    ${mine ? `<div class="b2-tip" style="margin:0 0 12px"><span class="i">🔑</span><span>Tu as déjà une ferme (${esc(P[mine.specialty].label)}), mais ce téléphone n'a pas ta clé. Demande à Naïm de te la redonner.</span></div>` : ""}
    <div class="b2-specs">${BX.RAW.map(k => { const t = taken[k]; return `<button class="b2-spec ${picking === k ? "on" : ""}" data-a="pick" data-k="${k}" ${t || full || mine ? "disabled" : ""}>
      <div class="art">${plotArt(k, 0, 12)}</div><div class="tx"><b>${P[k].e} ${esc(P[k].label)}</b><small>${t ? `Pris par ${esc(t.name)}` : `${esc(P[k].place)} · ${esc(P[k].act.label.toLowerCase())}`}</small></div></button>`; }).join("")}</div>
    ${err ? `<p style="color:var(--down);margin:10px 0 0">${esc(err)}</p>` : ""}
    <div style="margin-top:14px"><button class="b2-btn big" data-a="join" ${picking && !taken[picking] && !full && !mine ? "" : "disabled"}>${picking ? `Ouvrir mon ${esc(P[picking].place.toLowerCase())}` : "Choisis une spécialité"}</button></div>
  </div></div>`;
}
async function join(){
  const btn = wrapEl.querySelector('[data-a="join"]'); if (!btn || btn.disabled) return; btn.disabled = true; btn.textContent = "Installation…";
  try{
    const me = Q.me(), s0 = BX.newState(picking, now());
    const token = await rpc("baron2_join", { p_profile: String(me.id), p_name: String(me.name || "Ami").slice(0, 30), p_spec: picking, p_state: s0 });
    setToken(token); await start();
  }catch(e){ if (String(e.message || "").includes("spécialité prise")) picking = null; await showPick(errText(e)); }
}

/* =================== Feuilles =================== */
function sheet(html){
  closeSheet();
  wrapEl.insertAdjacentHTML("beforeend", `<div class="b2-sheetbg" data-a="sheetbg"><div class="b2-sheet" role="dialog"><div class="grab"></div>${html}</div></div>`);
  sheetOpen = true;
}
function closeSheet(){ wrapEl && wrapEl.querySelector(".b2-sheetbg")?.remove(); sheetOpen = false; }
function qtyBlock(max, start, id){
  max = Math.max(0, Math.floor(max)); start = Math.min(max, Math.floor(start));
  return `<div class="b2-qty"><input type="range" min="${max ? 1 : 0}" max="${max}" value="${start}" step="1" data-q="${id}" aria-label="Quantité"><span class="v" data-qv="${id}">${fmtN(start)}</span></div>
    <div class="b2-quick">${[[.25, "¼"], [.5, "½"], [1, "Tout"]].map(([f, l]) => `<button data-a="qset" data-id="${id}" data-f="${f}">${l}</button>`).join("")}</div>`;
}
const qval = id => { const r = wrapEl.querySelector(`[data-q="${id}"]`); return r ? Math.floor(+r.value) : 0; };
let sheetCtx = null;
function sheetSum(){
  if (!sheetCtx) return;
  const c = sheetCtx, q = qval("q");
  const el = wrapEl.querySelector("[data-qv=q]"); if (el) el.textContent = fmtN(q);
  const s = wrapEl.querySelector("[data-sum]");
  if (c.type === "sell"){ s.innerHTML = `<span>Le village te paie</span><span>${COIN}${fmtN(q * P[c.k].floor)}</span>`; }
  if (c.type === "list"){ const p = Math.max(0, +String(wrapEl.querySelector("[data-price]").value).replace(",", ".") || 0); s.innerHTML = `<span>Si tout part</span><span>${COIN}${fmtN(q * p)}</span>`; }
  if (c.type === "buy" || c.type === "res"){ s.innerHTML = `<span>Tu paies</span><span>${COIN}${fmtN(q * c.price)}</span>`; const b = wrapEl.querySelector("[data-a=confirm]"); if (b) b.disabled = q < 1 || q * c.price > S.coins; }
  if (c.type === "bake"){ s.innerHTML = `<span>Cuisson</span><span>${fmtT(BX.ovenDur(S, c.k))}</span>`; }
}
function sellSheet(k){
  sheetCtx = { type:"sell", k };
  sheet(`<h3>${P[k].e} Vendre au village</h3><p>Le village rachète toujours, à ${fmtP(P[k].floor)} pièces l'unité : c'est le prix plancher. Au marché, tes amis paieront peut-être plus.</p>
    ${qtyBlock(S.stock[k], S.stock[k], "q")}<div class="b2-sum" data-sum></div><button class="b2-btn gold big" data-a="confirm">Vendre au village</button>`);
  sheetSum();
}
function prodSheet(k){
  const q = quote(k);
  sheetCtx = null;
  sheet(`<h3>${P[k].e} ${esc(P[k].label)}</h3><p>Tu en as ${fmtN(S.stock[k])}. Le village le rachète ${fmtP(P[k].floor)}${q.p != null ? `, le marché en ce moment autour de ${fmtP(q.p)}` : ""}.</p>
    <div class="b2-two"><button class="b2-btn gold" data-a="sell" data-k="${k}" ${S.stock[k] < 1 ? "disabled" : ""}>Vendre au village</button>
    ${BX.unlocked(S, "marche") ? `<button class="b2-btn" data-a="goto-mkt" data-k="${k}">Voir au marché</button>` : ""}</div>`);
}
function listSheet(k){
  const q = quote(k), cheapest = W.listings.filter(l => l.product === k).sort((a, b) => a.price - b.price)[0];
  const sug = q.p != null ? q.p : P[k].floor * 1.5;
  sheetCtx = { type:"list", k };
  sheet(`<h3>${P[k].e} Mettre en vente</h3><p>Tu fixes ton prix. Tes produits sortent de la grange et attendent un acheteur ; tu peux les retirer quand tu veux.${cheapest ? ` L'offre la moins chère est à ${fmtP(+cheapest.price)}.` : ""}</p>
    ${qtyBlock(S.stock[k], S.stock[k] / 2, "q")}
    <div class="b2-field"><i class="b2-coin"></i><input data-price inputmode="decimal" value="${String(Math.round(sug * 10) / 10).replace(".", ",")}" aria-label="Prix à l'unité"><span style="font:700 13px var(--round);color:var(--ink2)">l'unité</span></div>
    <p class="b2-note">Plancher du village : ${fmtP(P[k].floor)} · Réserve du village : ${fmtP(BX.reservePrice(k))}</p>
    <div class="b2-sum" data-sum></div><button class="b2-btn big" data-a="confirm">Mettre en vente</button>`);
  sheetSum();
}
function buySheet(l){
  const max = Math.min(+l.qty, Math.floor(S.coins / +l.price));
  sheetCtx = { type:"buy", l, price: +l.price, k: l.product };
  sheet(`<h3>${P[l.product].e} Acheter à ${esc(nameOf(l.seller_id))}</h3><p>${fmtN(l.qty)} en vente à ${fmtP(+l.price)} l'unité.${max < 1 ? " Tu n'as pas assez de pièces." : ""}</p>
    ${qtyBlock(max, max, "q")}<div class="b2-sum" data-sum></div><button class="b2-btn big" data-a="confirm" ${max < 1 ? "disabled" : ""}>Acheter</button>`);
  sheetSum();
}
function resSheet(k){
  const pr = BX.reservePrice(k), left = BX.reserveLeft(S, k, now()), max = Math.min(left, Math.floor(S.coins / pr));
  sheetCtx = { type:"res", k, price: pr };
  sheet(`<h3>🏘️ Réserve du village</h3><p>Le village dépanne quand personne ne vend, mais à ${fmtP(pr)} l'unité, et seulement ${fmtN(left)} ${P[k].e} d'ici les prochaines commandes.</p>
    ${qtyBlock(max, max, "q")}<div class="b2-sum" data-sum></div><button class="b2-btn gold big" data-a="confirm" ${max < 1 ? "disabled" : ""}>Acheter</button>`);
  sheetSum();
}
function bakeSheet(k){
  const free = S.oven.slots.slice(0, BAL.ovenSlots(S.oven.lvl)).length < BAL.ovenSlots(S.oven.lvl) || S.oven.slots.slice(0, BAL.ovenSlots(S.oven.lvl)).some(x => !x);
  if (!k){
    sheetCtx = null;
    sheet(`<h3>Que cuisiner ?</h3>${BX.CRAFT.map(r => { const c = BX.canBake(S, r); return `<div class="b2-rec"><span class="ic">${P[r].e}</span><div class="sp"><b>${esc(P[r].label)}</b><div class="b2-ing">${Object.keys(P[r].rec).map(x => `<span class="${S.stock[x] >= 1 ? "ok" : "ko"}">${P[x].e} ${fmtN(S.stock[x])}</span>`).join("")}</div></div>${c >= 1 ? `<button class="b2-btn" data-a="bake" data-k="${r}">Choisir</button>` : ""}</div>`; }).join("")}`);
    return;
  }
  if (!S.oven.lvl){ toast("Construis d'abord le four, dans la grange."); return; }
  if (!free){ toast("Toutes les places du four sont occupées."); return; }
  const max = Math.min(BX.canBake(S, k), BX.ovenBatch(S));
  sheetCtx = { type:"bake", k };
  sheet(`<h3>${P[k].e} ${esc(P[k].label)}</h3><p>Chaque ${esc(P[k].label.toLowerCase())} demande ${Object.keys(P[k].rec).map(x => `1 ${P[x].e}`).join(" + ")}. Fournée de ${fmtN(BX.ovenBatch(S))} au maximum.</p>
    ${qtyBlock(max, max, "q")}<div class="b2-sum" data-sum></div><button class="b2-btn big" data-a="confirm" ${max < 1 ? "disabled" : ""}>🔥 Lancer la cuisson</button>`);
  sheetSum();
}
function farm2Sheet(){
  const c = BX.costs.farm(S), free = BX.RAW.filter(k => !S.farms[k]);
  sheetCtx = null;
  sheet(`<h3>Nouvelle exploitation</h3><p>Elle a ses propres parcelles, son monte-charge et sa charrette, et livre dans la même grange. Coût : ${price(c)}.</p>
    <div class="b2-specs">${free.map(k => `<button class="b2-spec" data-a="farm2-go" data-k="${k}"><div class="art">${plotArt(k, 0, 6)}</div><div class="tx"><b>${P[k].e} ${esc(P[k].label)}</b><small>${esc((W.players.find(p => p.specialty === k) || {}).name ? "Concurrence " + (W.players.find(p => p.specialty === k)).name : "Personne n'en produit")}</small></div></button>`).join("")}</div>`);
}

/* =================== Actions =================== */
async function confirm(){
  const c = sheetCtx; if (!c) return;
  const q = qval("q"); if (q < 1) return;
  const btn = wrapEl.querySelector("[data-a=confirm]"); if (btn) btn.disabled = true;
  if (c.type === "sell"){
    if (S.stock[c.k] < q) return;
    S.stock[c.k] -= q; const g = q * P[c.k].floor; S.coins += g; S.stats.earned += g; S.stats.villageSold += g; dirty = true;
    closeSheet(); draw(); sound("coin"); coinsFly(wrapEl.querySelector(`[data-k="${c.k}"]`) || wrapEl.querySelector("#b2-main"), 6); toast(`+${COIN}${fmtN(g)}`, "gold");
    return;
  }
  if (c.type === "res"){
    const cost = q * c.price; if (cost > S.coins) return;
    S.coins -= cost; S.stock[c.k] += q; S.reserve.used[c.k] = (S.reserve.used[c.k] || 0) + q; S.stats.bought += cost; dirty = true;
    closeSheet(); draw(); sound("up"); toast(`${fmtN(q)} ${P[c.k].e} achetés au village`); return;
  }
  if (c.type === "bake"){
    const nS = BAL.ovenSlots(S.oven.lvl); let idx = -1; for (let i = 0; i < nS; i++) if (!S.oven.slots[i]){ idx = i; break; }
    if (idx < 0 || BX.canBake(S, c.k) < q) return;
    for (const x in P[c.k].rec) S.stock[x] -= q * P[c.k].rec[x];
    S.oven.slots[idx] = { rec: c.k, qty: q, t0: now(), dur: BX.ovenDur(S, c.k) }; dirty = true;
    closeSheet(); view = "barn"; draw(); sound("up"); toast(`🔥 ${fmtN(q)} ${P[c.k].label.toLowerCase()} au four`); return;
  }
  if (c.type === "list"){
    const p = Math.round((+String(wrapEl.querySelector("[data-price]").value).replace(",", ".") || 0) * 10) / 10;
    if (!(p > 0)) { toast("Indique un prix.", "err"); if (btn) btn.disabled = false; return; }
    if (S.stock[c.k] < q) return;
    S.stock[c.k] -= q;
    try{ await queue(() => rpc("baron2_list", { p_token: getToken(), p_state: S, p_product: c.k, p_qty: q, p_price: p })); lastSave = now(); closeSheet(); toast(`${fmtN(q)} ${P[c.k].e} mis en vente à ${fmtP(p)}`); await loadWorld(true); draw(); }
    catch(e){ S.stock[c.k] += q; toast(errText(e), "err"); if (btn) btn.disabled = false; }
    return;
  }
  if (c.type === "buy"){
    const cost = q * c.price; if (cost > S.coins) return;
    S.coins -= cost; S.stock[c.k] += q; S.stats.bought += cost;
    try{ await queue(() => rpc("baron2_buy", { p_token: getToken(), p_state: S, p_id: c.l.id, p_qty: q, p_price: c.price })); lastSave = now(); closeSheet(); sound("up"); toast(`${fmtN(q)} ${P[c.k].e} achetés à ${esc(nameOf(c.l.seller_id))}`); await loadWorld(true); draw(); }
    catch(e){ S.coins += cost; S.stock[c.k] -= q; S.stats.bought -= cost; toast(errText(e), "err"); closeSheet(); await loadWorld(true); draw(); }
  }
}
function onInput(e){
  if (e.target.matches("[data-q]") || e.target.matches("[data-price]")) sheetSum();
}
function paid(c, el){
  if (!BX.pay(S, c)){ sound("err"); buzz(20); toast(S.stock.bois < (c.wood || 0) ? "Il te manque du bois." : "Pas encore assez de pièces."); bounce(el); return false; }
  dirty = true; return true;
}
function onClick(e){
  const b = e.target.closest("[data-a]"); if (!b || !wrapEl) return;
  const a = b.dataset.a, f = S && S.farms[S.cur], t = now();
  if (a === "sheetbg"){ if (e.target === b) closeSheet(); return; }
  if (a === "close"){ closeBaron(); return; }
  if (a === "arcade"){ closeBaron(); try{ document.querySelector(".topbar .qh-btn")?.click(); }catch(_){} return; }
  if (a === "retry"){ start(); return; }
  if (a === "pick-retry"){ showPick(); return; }
  if (a === "pick"){ picking = b.dataset.k; drawPick(); return; }
  if (a === "join"){ join(); return; }
  if (!S) return;
  switch (a){
    case "tab": {
      const tb = TABS.find(x => x.id === b.dataset.v);
      if (tb.need && !BX.unlocked(S, tb.need)){ toast(tb.why); bounce(b); return; }
      view = tb.id; markSeen("tab_" + tb.id); closeSheet(); wrapEl.querySelector("#b2-main").scrollTop = 0; draw();
      if (view === "market" || view === "village") loadWorld(true);
      return;
    }
    case "tipx": markSeen("tip_" + b.dataset.id); draw(); return;
    case "mult": mult = b.dataset.m === "max" ? "max" : +b.dataset.m; draw(); return;
    case "farm": S.cur = b.dataset.k; draw(); return;
    case "tap-parcel": {
      const p = f.parcels[+b.dataset.i];
      if (p.mgr){ floatText(b, "Ton contremaître s'en occupe"); return; }
      if (BX.startParcel(p)){ sound("tap"); bounce(b.querySelector(".b2-wk") || b); }
      live(); return;
    }
    case "harvest": {
      f.parcels.forEach(p => BX.startParcel(p));
      if (BX.pendTotal(f) >= 1) BX.startElev(f); if (f.quai >= 1) BX.startCart(f);
      sound("tap"); bounce(b); buzz(10); markSeen("tip_start"); live(); return;
    }
    case "tap-elev": case "tap-cart": {
      const el = a === "tap-elev";
      const st = el ? f.elev : f.cart;
      if (st.ph !== "idle"){ floatText(b, st.mgr ? "Ton contremaître s'en occupe" : "Déjà en route"); return; }
      if (el && BX.pendTotal(f) < 1){ toast("Les paniers sont vides : touche d'abord un champ pour récolter."); return; }
      if (!el && f.quai < 1){ toast("Rien à transporter : le monte-charge doit d'abord remonter un panier."); return; }
      if (el ? BX.startElev(f) : BX.startCart(f)){ sound("tap"); }
      live(); return;
    }
    case "hire": {
      const kind = b.dataset.k, i = b.dataset.i !== undefined ? +b.dataset.i : undefined;
      const st = kind === "parcel" ? f.parcels[i] : f[kind]; if (st.mgr) return;
      const c = { coins: kind === "parcel" ? BX.nice(BAL.parcelMgr(i)) : kind === "elev" ? BAL.elevMgr : BAL.cartMgr };
      if (!paid(c, b)) return;
      st.mgr = true; markSeen("tip_mgr"); sound("done"); buzz(20); draw(); save(true);
      toast(`${MGR[kind]} Contremaître engagé : ${kind === "parcel" ? "il récolte" : kind === "elev" ? "il fait marcher le monte-charge" : "il conduit la charrette"} tout seul, même appli fermée`);
      return;
    }
    case "station": stationSheet(b.dataset.k, b.dataset.i !== undefined ? +b.dataset.i : undefined); return;
    case "st-mult": mult = b.dataset.m === "max" ? "max" : +b.dataset.m; refreshStation(); draw(); return;
    case "st-up": {
      const { kind, i } = sheetCtx; const u = upCost(kind, f, i);
      if (!paid({ coins: u.coins }, b)) return;
      const st = kind === "parcel" ? f.parcels[i] : f[kind]; const m0 = BX.MILES.filter(m => m <= st.lvl).length; st.lvl += u.n;
      const crossed = BX.MILES.filter(m => m <= st.lvl).length > m0;
      sound("up"); floatText(b, crossed ? "×2 !" : `Niv ${st.lvl}`, crossed ? "gold" : ""); draw(); refreshStation(); return;
    }
    case "st-hire": {
      const { kind, i } = sheetCtx; const st = kind === "parcel" ? f.parcels[i] : f[kind]; if (st.mgr) return;
      const c = { coins: kind === "parcel" ? BX.nice(BAL.parcelMgr(i)) : kind === "elev" ? BAL.elevMgr : BAL.cartMgr };
      if (!paid(c, b)) return;
      st.mgr = true; markSeen("tip_mgr"); sound("done"); buzz(20); draw(); refreshStation(); save(true); return;
    }
    case "boost": {
      if (f.boost > t){ toast(`Déjà ×2 encore ${fmtT(f.boost - t)}`); return; }
      if (f.boostCd > t){ toast(`${P[S.cur].act.label} : de nouveau possible dans ${fmtT(f.boostCd - t)}`); return; }
      f.boost = t + BAL.boostDur * 1000; f.boostCd = t + BAL.boostCd * 1000; dirty = true; markSeen("tip_boost");
      sound("done"); buzz(15); floatText(b, "×2 !", "gold"); draw(); return;
    }
    case "up-parcel": case "up-elev": case "up-cart": {
      const kind = a.slice(3), i = +b.dataset.i, u = upCost(kind, f, i);
      if (!paid({ coins: u.coins }, b)) return;
      let crossed = false;
      if (kind === "parcel"){ const p = f.parcels[i]; const m0 = BX.MILES.filter(m => m <= p.lvl).length; p.lvl += u.n; crossed = BX.MILES.filter(m => m <= p.lvl).length > m0; }
      else f[kind].lvl += u.n;
      sound("up"); draw();
      const row = kind === "parcel" ? wrapEl.querySelector(`[data-plot="${i}"]`) : wrapEl.querySelector(kind === "elev" ? ".b2-elev" : ".b2-cartsign");
      if (row){ row.classList.add("lvlup"); floatText(row, crossed ? "Production ×2 !" : `Niv ${kind === "parcel" ? f.parcels[i].lvl : f[kind].lvl}`, crossed ? "gold" : ""); }
      return;
    }
    case "mgr-parcel": case "mgr-elev": case "mgr-cart": {
      const kind = a.slice(4), i = +b.dataset.i;
      const c = kind === "parcel" ? BX.costs.parcelMgr(f, i) : kind === "elev" ? BX.costs.elevMgr() : BX.costs.cartMgr();
      if (!paid(c, b)) return;
      if (kind === "parcel") f.parcels[i].mgr = true; else f[kind].mgr = true;
      markSeen("tip_mgr"); sound("done"); draw(); toast(`${MGR[kind]} Contremaître engagé : il travaille même quand tu n'es pas là`); save(true); return;
    }
    case "unlock": {
      const c = BX.nextParcelCost(f); if (!paid(c, b)) return;
      f.parcels.push(BX.newParcel()); sound("done"); buzz(25); draw(); save(true);
      const el = wrapEl.querySelector(`[data-plot="${f.parcels.length - 1}"]`); if (el){ el.classList.add("lvlup"); el.scrollIntoView({ behavior:"smooth", block:"center" }); }
      const np = S.farms[S.spec].parcels.length;
      if (S.cur === S.spec && (np === 2 || np === 3 || np === BAL.farmNeeds)) setTimeout(() => toast(np === 2 ? "📈 Le marché est ouvert !" : np === 3 ? "🏘️ Le village et le four sont ouverts !" : "⚔️ Tu peux ouvrir une 2e exploitation"), 700);
      return;
    }
    case "up-barn": { const c = BX.costs.barn(S); if (!paid(c, b)) return; S.barn++; sound("done"); draw(); toast(`Grange agrandie : ${fmtN(BX.barnCap(S))} places`); return; }
    case "up-oven": { const c = BX.costs.oven(S); if (!paid(c, b)) return; S.oven.lvl++; sound("done"); draw(); toast(S.oven.lvl === 1 ? "🔥 Le four est construit" : `Four niveau ${S.oven.lvl}`); return; }
    case "farm2": farm2Sheet(); return;
    case "farm2-go": {
      const k = b.dataset.k, c = BX.costs.farm(S); if (S.farms[k] || !paid(c, b)) return;
      S.farms[k] = BX.newFarm(); S.cur = k; closeSheet(); sound("done"); draw(); toast(`${P[k].e} Nouvelle exploitation : ${P[k].place.toLowerCase()}`); save(true); return;
    }
    case "prod": prodSheet(b.dataset.k); return;
    case "sell": sellSheet(b.dataset.k); return;
    case "quick-sell": {
      const k = S.cur, q = Math.floor(S.stock[k] || 0);
      if (q < 1){ toast("La grange est vide : attends que la charrette livre ta récolte."); bounce(b); return; }
      const g = q * P[k].floor; S.stock[k] -= q; S.coins += g; S.stats.earned += g; S.stats.villageSold += g; dirty = true;
      markSeen("tip_sell"); sound("coin"); buzz(15); bounce(b); coinsFly(b, 8); floatText(b, "+" + fmtN(g), "gold");
      if (!seen("hint_market") && BX.unlocked(S, "marche")){ markSeen("hint_market"); setTimeout(() => toast("Astuce : au Marché, tes amis peuvent t'acheter plus cher que le village."), 1200); }
      live(); setTimeout(draw, 900); return;
    }
    case "list": listSheet(b.dataset.k); return;
    case "goto-mkt": {
      if (!BX.unlocked(S, "marche")){ toast(TABS[2].why); return; }
      mkt.k = b.dataset.k; view = "market"; closeSheet(); wrapEl.querySelector("#b2-main").scrollTop = 0; draw(); loadWorld(true); return;
    }
    case "mkt-k": mkt.k = b.dataset.k; draw(); return;
    case "mkt-p": mkt.period = b.dataset.p; draw(); return;
    case "buy": { const l = W.listings.find(x => String(x.id) === b.dataset.id); if (l) buySheet(l); return; }
    case "buy-res": resSheet(mkt.k); return;
    case "unlist": {
      const l = W.listings.find(x => String(x.id) === b.dataset.id); if (!l) return;
      b.disabled = true; S.stock[l.product] += +l.qty;
      queue(() => rpc("baron2_unlist", { p_token: getToken(), p_state: S, p_id: l.id, p_qty: +l.qty }))
        .then(() => { lastSave = now(); toast(`${fmtN(l.qty)} ${P[l.product].e} rentrés dans la grange`); return loadWorld(true); })
        .catch(err => { S.stock[l.product] -= +l.qty; toast(errText(err), "err"); return loadWorld(true); })
        .then(() => draw());
      return;
    }
    case "deliver": {
      const r = BX.deliver(S, b.dataset.id); if (!r) return; dirty = true;
      sound(r.complete ? "done" : "coin"); coinsFly(b, r.complete ? 8 : 4);
      toast(r.complete ? `Commande livrée ! +${COIN}${fmtN(r.paid)}` : `${fmtN(r.give)} livrés · +${COIN}${fmtN(r.paid)}`, "gold");
      draw(); if (r.complete) save(true); return;
    }
    case "bake": bakeSheet(b.dataset.k); return;
    case "qset": { const r = wrapEl.querySelector(`[data-q="${b.dataset.id}"]`); if (r){ r.value = Math.max(+r.min, Math.floor(+r.max * +b.dataset.f)); sheetSum(); } return; }
    case "confirm": confirm(); return;
  }
}

/* =================== Inscription dans l'Arcade =================== */
const status = () => {
  if (S) return `${fmtN(S.coins)} pièces`;
  try{ const c = localStorage.getItem("bn2_coins"); if (c !== null && getToken()) return `${fmtN(+c)} pièces`; }catch(e){}
  return getToken() ? "" : "Choisis ta spécialité";
};
(window.QUERIDA_GAMES = window.QUERIDA_GAMES || {})["baron"] = { open: openBaron, status };
try{ window.dispatchEvent(new Event("qh-games")); }catch(e){}
