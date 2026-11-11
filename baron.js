/* Querida · Le Baron (version 2) — jeu de ferme idle et de marché entre amis (côté amis uniquement).
   Se lance depuis l'Arcade. Mécanique façon Idle Miner : parcelles empilées, monte-charge, charrette, contremaîtres,
   goulots d'étranglement ; et l'âme du Baron : un marché entre amis, les commandes du village, devenir le plus riche.
   · La ferme est simulée sur le téléphone (production hors ligne calculée au retour) et sauvegardée sur Supabase.
   · Le marché, le classement et les ventes entre joueurs passent par les fonctions baron2_* (supabase/baron2.sql).
   · Tout l'équilibrage (prix, temps, primes) est dans BAL, en haut du moteur.
   Préfixe « b2- » partout ; une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{
/* =================== MOTEUR (aucun affichage ici) ===================
   Toute la ferme est simulée sur le téléphone, puis sauvegardée sur le serveur.
   Flux façon Idle Miner : parcelles → dépôt de chaque parcelle → monte-charge → quai → charrette → grange. */
const BX = (function(){
const RAW = ["ble","oeufs","lait","fruits","miel","bois"];
const CRAFT = ["pain","crepes","tarte","confiture","gateau"];
const ALL = RAW.concat(CRAFT);
const P = {
  ble:    { label:"Blé",    e:"🌾", floor:10, place:"Champ de blé", short:"Champ", who:"Céréalier·ère",  act:{ id:"arroser",  label:"Arroser",         e:"💧", txt:"Le blé arrosé pousse 2× plus vite" } },
  oeufs:  { label:"Œufs",   e:"🥚", floor:10, place:"Poulailler", short:"Poulailler",   who:"Éleveur·se",     act:{ id:"grain",    label:"Donner du grain", e:"🌽", txt:"Les poules bien nourries pondent 2× plus" } },
  lait:   { label:"Lait",   e:"🥛", floor:10, place:"Étable", short:"Étable",       who:"Vacher·ère",     act:{ id:"traire",   label:"Traire",          e:"🪣", txt:"Traire à la main double le lait" } },
  fruits: { label:"Fruits", e:"🍎", floor:10, place:"Verger", short:"Verger",       who:"Arboriculteur·rice", act:{ id:"tailler", label:"Tailler",        e:"✂️", txt:"Des arbres taillés donnent 2× plus de fruits" } },
  miel:   { label:"Miel",   e:"🍯", floor:10, place:"Rucher", short:"Rucher",       who:"Apiculteur·rice", act:{ id:"enfumer",  label:"Enfumer",         e:"💨", txt:"Des abeilles calmes laissent récolter 2× plus" } },
  bois:   { label:"Bois",   e:"🪵", floor:10, place:"Forêt", short:"Coupe",        who:"Bûcheron·ne",    act:{ id:"affuter",  label:"Affûter les haches", e:"🪓", txt:"Des haches affûtées coupent 2× plus vite" } },
  pain:      { label:"Pain",             e:"🍞", floor:30, rec:{ ble:1, lait:1 },                   t:60 },
  crepes:    { label:"Crêpes",           e:"🥞", floor:45, rec:{ ble:1, oeufs:1, lait:1 },          t:90 },
  tarte:     { label:"Tarte aux fruits", e:"🥧", floor:45, rec:{ ble:1, fruits:1, oeufs:1 },        t:120 },
  confiture: { label:"Confiture",        e:"🫙", floor:30, rec:{ fruits:1, miel:1 },                t:90 },
  gateau:    { label:"Gâteau",           e:"🍰", floor:65, rec:{ ble:1, oeufs:1, lait:1, miel:1 },  t:180 },
};

/* ---------- Réglages (tout l'équilibrage est ici) ---------- */
const MILES = [10, 25, 50, 100, 150, 200, 300, 400, 500, 750, 1000];
const miles = L => { let n = 0; for (const m of MILES) if (L >= m) n++; return n; };
// paliers façon Idle Miner : avant les champs 4, 7, 10, 13… il faut réunir une grosse somme, payer, puis attendre la fin des travaux
const GATES = [{ coins:5e7, h:1 }, { coins:5e10, h:3 }, { coins:5e13, h:8 }, { coins:5e16, h:16 }];
const isPalier = i => i >= 3 && i % 3 === 0;
const gateOf = i => { if (!isPalier(i)) return null; const k = i / 3 - 1; const g = GATES[Math.min(k, GATES.length - 1)]; const extra = Math.max(0, k - GATES.length + 1);
  return { n: k + 1, coins: g.coins * Math.pow(1000, extra), ms: (extra ? 24 : g.h) * 3600000 }; };
const BAL = {
  boostDur: 60, boostCd: 240,                   // corvée : ×2 pendant 1 min, toutes les 4 min
  parcelRate: (i, L) => 0.3 * Math.pow(5, i) * L * Math.pow(2, miles(L)),          // unités / s
  parcelCost: (i, L) => 4 * Math.pow(8, i) * Math.pow(1.2, L - 1),                 // niveau L → L+1 (1,13 au départ, 1,25 trop lent, 1,2)
  parcelUnlock: i => i === 0 ? 0 : 500 * Math.pow(30, i - 1),
  parcelWood: i => i < 2 ? 0 : Math.round(12 * Math.pow(8, i - 2)),
  parcelMgr: i => 25 * Math.pow(12, i),
  // monte-charge : il descend étage par étage, remplit sa cabine, remonte et vide en haut
  elevCap: L => Math.round(8 * Math.pow(1.2, L - 1) * Math.pow(2, miles(L))),   // unités par trajet
  elevSpeed: L => Math.min(5, 1.2 + 0.05 * (L - 1)),                           // étages par seconde
  elevStop: 0.5, elevUnload: 0.7,
  elevCost: L => 10 * Math.pow(1.25, L - 1),
  // charrette : elle charge le tas du haut, roule jusqu'à la grange, décharge et revient
  cartCap: L => Math.round(9 * Math.pow(1.2, L - 1) * Math.pow(2, miles(L))),
  cartTime: L => Math.max(1.2, 3.2 - 0.05 * (L - 1)),                          // aller simple, en secondes
  cartUnload: 0.7,
  cartCost: L => 12 * Math.pow(1.25, L - 1),
  elevMgr: 40, cartMgr: 60,
  work: 2.4, walk: 1.3,                         // parcelle : récolte, porte au panier, revient (5 s)
  pendCap: r => Math.max(40, r * 120),          // dépôt d'une parcelle : 2 min de production
  barnCap: L => Math.round(400 * Math.pow(2.6, L - 1)),
  barnCost: L => 120 * Math.pow(3.3, L - 1),
  barnWood: L => L < 2 ? 0 : Math.round(10 * Math.pow(3.2, L - 2)),
  ovenBuild: { coins: 400, wood: 25 },
  ovenCost: L => 1500 * Math.pow(4.5, L - 1),   // niveau L → L+1
  ovenWood: L => Math.round(40 * Math.pow(3, L - 1)),
  ovenMax: 8,
  ovenSlots: L => Math.min(4, L),
  ovenSpeed: L => Math.pow(0.82, Math.max(0, L - 4)),
  ovenBatch: (L, eff) => Math.max(20, Math.round(eff * 90 * (1 + 0.5 * (L - 1)))),
  farmCost: k => ({ coins: 2e6 * Math.pow(25, k - 1), wood: Math.round(4000 * Math.pow(10, k - 1)) }), // k-ième exploitation en plus
  farmMax: 2,                                   // ta ferme + une seule exploitation en plus
  farm2Mul: 0.25,                               // l'exploitation en plus produit 4× moins que ta spécialité
  farmNeeds: 5,                                 // parcelles nécessaires dans ta ferme principale
  slotMs: 20 * 60 * 1000,                       // commandes renouvelées toutes les 20 min
  bigQty: 1.5, bigBonus: 1.5,                   // la grande commande : même produit pour tout le village, 1,5× la quantité, 1,5× la prime
  fullBonus: 0.3,                               // carton plein (toutes les commandes livrées) : +30 % des primes
  orders: 4,
  orderSecs: [150, 360], recipeSecs: [60, 150], // quantité = X s de ta production
  bonusMins: [5, 10], recipeBonus: 1.4,        // prime = X min de production (moyenne du groupe ou la tienne)
  reserveMult: 3, reserveSecs: 60,              // réserve du village : 3× le prix plancher, limitée
  startWood: 40, startCoins: 0,
  // cours du village : chaque produit a son cours (le même pour tous), qui monte et descend tout seul
  vSwing: [0.45, 0.3, 0.15],                    // amplitude des 3 vagues (lente, moyenne, rapide)
  vPeriods: [9 * 3600, 2.3 * 3600, 37 * 60],    // durée de chaque vague, en secondes (variée selon le produit)
  // et ton propre cours s'effondre si tu lui vends trop d'un coup
  vAbsorb: 1800,                                // le village encaisse ~30 min de ta production avant que son prix soit divisé par 2
  vHalfLife: 20 * 60,                           // il « oublie » tes ventes de moitié toutes les 20 min
};

/* ---------- État ---------- */
const newParcel = () => ({ lvl:1, mgr:false, pend:0, ph:"idle", t:0 });
function newFarm(){ return { parcels:[newParcel()], elev:{ lvl:1, mgr:false, ph:"idle", t:0, pos:0, fl:0, load:0 }, cart:{ lvl:1, mgr:false, ph:"idle", t:0, pos:0, load:0 }, quai:0, boost:0, boostCd:0, lost:0 }; }
function newState(spec, now){
  const stock = {}; ALL.forEach(k => stock[k] = 0); stock.bois = BAL.startWood;
  const farms = {}; farms[spec] = newFarm();
  return { v:2, spec, cur:spec, coins:BAL.startCoins, stock, farms, barn:1, oven:{ lvl:0, slots:[] },
    orders:{ slot:0, list:[], prog:{} }, reserve:{ slot:0, used:{} },
    stats:{ produced:0, invested:0, baked:0, orders:0, sold:0, bought:0, earned:0, villageSold:0 },
    seen:{}, last:now, credit_seen:0, created:now };
}
function fixFarm(f){
  f.parcels.forEach(p => { if (!p.ph){ p.ph = "idle"; p.t = 0; } delete p.run; });
  for (const k of ["elev", "cart"]){ const x = f[k]; if (!x.ph){ x.ph = "idle"; x.t = 0; x.pos = 0; x.load = 0; x.fl = 0; } delete x.run; }
  return f;
}
const stockUnits = s => ALL.reduce((a, k) => a + (s.stock[k] || 0), 0);
const barnCap = s => BAL.barnCap(s.barn);
const barnFree = s => Math.max(0, barnCap(s) - stockUnits(s));
const quaiCap = f => Math.max(BAL.elevCap(f.elev.lvl), BAL.cartCap(f.cart.lvl)) * 3;
const pendTotal = f => f.parcels.reduce((a, p) => a + p.pend, 0);

/* ---------- Rythmes moyens (affichage, goulot, hors ligne) ---------- */
const elevTrip = (L, n) => 2 * n / BAL.elevSpeed(L) + n * BAL.elevStop + BAL.elevUnload;
const elevRate = (L, n) => BAL.elevCap(L) / elevTrip(L, n || 1);
const cartRate = L => BAL.cartCap(L) / (2 * BAL.cartTime(L) + BAL.cartUnload);
const farmMul = (s, key) => key === s.spec ? 1 : BAL.farm2Mul;
const pRate = (s, key, i, L) => BAL.parcelRate(i, L) * farmMul(s, key);
function farmRates(f, now, mul){
  const boost = f.boost > now ? 2 : 1;
  let P = 0; f.parcels.forEach((p, i) => P += BAL.parcelRate(i, p.lvl) * boost * (mul == null ? 1 : mul));
  return { P, E: elevRate(f.elev.lvl, f.parcels.length), C: cartRate(f.cart.lvl), boost };
}
// production réelle possible (en unités / s), le maillon le plus faible de chaque ferme
function effRate(s, now){
  let t = 0; for (const k in s.farms){ const r = farmRates(s.farms[k], now || 0, farmMul(s, k)); t += Math.min(r.P / r.boost, r.E, r.C); }
  return t;
}
const prodValue = s => effRate(s, 0) * 10;      // pièces / s au prix plancher

/* ---------- Simulation trajet par trajet (appli ouverte) ---------- */
function startParcel(p){ if (p.ph !== "idle") return false; p.ph = "work"; p.t = 0; return true; }
function startElev(f){ const e = f.elev; if (e.ph !== "idle") return false; e.ph = "down"; e.fl = 1; e.load = 0; e.t = 0; return true; }
function startCart(f){ const c = f.cart; if (c.ph !== "idle") return false; c.load = Math.min(BAL.cartCap(c.lvl), f.quai); f.quai -= c.load; c.ph = "go"; c.pos = 0; c.t = 0; return true; }
function tickFarm(s, key, f, dt, now, ev){
  const boost = f.boost > now ? 2 : 1, n = f.parcels.length, cyc = BAL.work + 2 * BAL.walk;
  // les fermiers : récoltent, portent au panier, reviennent
  f.parcels.forEach((p, i) => {
    if (p.ph === "idle"){ if (!p.mgr) return; p.ph = "work"; p.t = 0; }
    p.t += dt;
    if (p.ph === "work" && p.t >= BAL.work){ p.ph = "go"; p.t = 0; }
    else if (p.ph === "go" && p.t >= BAL.walk){
      const r = pRate(s, key, i, p.lvl) * boost, amt = r * cyc, cap = BAL.pendCap(r), nv = p.pend + amt;
      if (nv > cap){ f.lost += nv - cap; p.pend = cap; } else p.pend = nv;
      ev && ev.push({ k:"drop", key, i, amt }); p.ph = "back"; p.t = 0;
    } else if (p.ph === "back" && p.t >= BAL.walk){ p.ph = "idle"; p.t = 0; if (p.mgr){ p.ph = "work"; } }
  });
  // le monte-charge
  const e = f.elev, ecap = BAL.elevCap(e.lvl), v = BAL.elevSpeed(e.lvl);
  if (e.ph === "idle" && e.mgr && pendTotal(f) >= 1 && f.quai < quaiCap(f) - 1) startElev(f);
  if (e.ph === "down"){ e.pos += v * dt; if (e.pos >= e.fl){ e.pos = e.fl; e.ph = "load"; e.t = 0; } }
  else if (e.ph === "load"){
    e.t += dt;
    if (e.t >= BAL.elevStop){
      const p = f.parcels[e.fl - 1], take = p ? Math.min(ecap - e.load, p.pend) : 0;
      if (take > 0){ p.pend -= take; e.load += take; ev && ev.push({ k:"lift", key, i: e.fl - 1, amt: take }); }
      if (e.load >= ecap - 1e-6 || e.fl >= n) e.ph = "up"; else { e.fl++; e.ph = "down"; }
    }
  } else if (e.ph === "up"){ e.pos -= v * dt; if (e.pos <= 0){ e.pos = 0; e.ph = "unload"; e.t = 0; } }
  else if (e.ph === "unload"){
    e.t += dt;
    if (e.t >= BAL.elevUnload){
      const put = Math.min(e.load, Math.max(0, quaiCap(f) - f.quai));
      if (put > 0){ f.quai += put; e.load -= put; ev && ev.push({ k:"top", key, amt: put }); }
      if (e.load < 1e-6){ e.load = 0; e.ph = "idle"; e.fl = 0; }
    }
  }
  // la charrette
  const c = f.cart, T = BAL.cartTime(c.lvl);
  if (c.ph === "idle" && c.mgr && f.quai >= 1) startCart(f);
  if (c.ph === "go"){ c.pos += dt / T; if (c.pos >= 1){ c.pos = 1; c.ph = "unload"; c.t = 0; } }
  else if (c.ph === "unload"){
    c.t += dt;
    if (c.t >= BAL.cartUnload){
      const put = Math.min(c.load, barnFree(s));
      if (put > 0){ s.stock[key] += put; s.stats.produced += put; c.load -= put; ev && ev.push({ k:"barn", key, amt: put }); }
      if (c.load < 1e-6){ c.load = 0; c.ph = "back"; }
    }
  } else if (c.ph === "back"){ c.pos -= dt / T; if (c.pos <= 0){ c.pos = 0; c.ph = "idle"; } }
}
function step(s, dt, now, ev){
  let left = dt;
  while (left > 1e-9){ const d = Math.min(left, 0.05); for (const k in s.farms) tickFarm(s, k, s.farms[k], d, now, ev); left -= d; }
  return ovenTick(s, now);
}

/* ---------- Rattrapage hors ligne : seuls les postes avec contremaître travaillent ---------- */
function flush(s, key, f){
  const e = f.elev, c = f.cart;
  if (e.load > 0){ f.quai += e.load; e.load = 0; }
  if (c.load > 0){ const put = Math.min(c.load, barnFree(s)); s.stock[key] += put; s.stats.produced += put; f.quai += c.load - put; c.load = 0; }
  e.ph = "idle"; e.pos = 0; e.fl = 0; c.ph = "idle"; c.pos = 0;
  f.parcels.forEach(p => { p.ph = "idle"; p.t = 0; });
}
function stepAvg(s, key, f, dt, now){
  const boost = f.boost > now ? 2 : 1;
  if (f.cart.mgr){ const mv = Math.min(cartRate(f.cart.lvl) * dt, f.quai, barnFree(s)); if (mv > 0){ f.quai -= mv; s.stock[key] += mv; s.stats.produced += mv; } }
  if (f.elev.mgr){
    const tot = pendTotal(f), take = Math.min(elevRate(f.elev.lvl, f.parcels.length) * dt, tot, Math.max(0, quaiCap(f) - f.quai));
    if (take > 0 && tot > 0){ const k = take / tot; f.parcels.forEach(p => p.pend -= p.pend * k); f.quai += take; }
  }
  f.parcels.forEach((p, i) => {
    if (!p.mgr) return;
    const r = pRate(s, key, i, p.lvl) * boost, cap = BAL.pendCap(r), nv = p.pend + r * dt;
    if (nv > cap){ f.lost += nv - cap; p.pend = cap; } else p.pend = nv;
  });
}
function catchUp(s, now){
  let from = s.last || now; if (now <= from){ s.last = now; return 0; }
  const total = Math.min((now - from) / 1000, 7 * 86400);
  const before = s.stats.produced;
  for (const k in s.farms) flush(s, k, s.farms[k]);
  let left = total, t = from;
  while (left > 0){
    const dt = Math.min(left, total > 600 ? 20 : 1);
    t += dt * 1000; for (const k in s.farms) stepAvg(s, k, s.farms[k], dt, t); ovenTick(s, t); left -= dt;
  }
  s.last = now; return s.stats.produced - before;
}

/* ---------- Actions ---------- */
const nice = n => { if (n < 100) return Math.ceil(n); const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.ceil(n / p) * p; };
const nextParcelCost = f => { const i = f.parcels.length; return { coins: nice(BAL.parcelUnlock(i)), wood: BAL.parcelWood(i), palier: isPalier(i) }; };
// où en est le palier avant le prochain champ : "none" (pas de palier), "todo" (somme à réunir), "work" (travaux), "done"
function gateState(f, now){
  const i = f.parcels.length, g = gateOf(i); if (!g) return { st:"none" };
  if ((f.gates || []).includes(i)) return { st:"done", g };
  if (f.gate && f.gate.i === i){ if (now >= f.gate.until){ f.gates = (f.gates || []).concat(i); f.gate = null; return { st:"done", g, fresh:true }; } return { st:"work", g, left: f.gate.until - now }; }
  return { st:"todo", g };
}
function canPay(s, c){ return s.coins >= (c.coins || 0) && s.stock.bois >= (c.wood || 0); }
function pay(s, c, key){
  if (!canPay(s, c)) return false;
  s.coins -= c.coins || 0; s.stock.bois -= c.wood || 0;
  // le bois de ta propre forêt ne compte pas comme une dépense de patrimoine
  s.stats.invested += (c.coins || 0) + (c.wood || 0) * 10;
  return true;
}
const costs = {
  parcel: (f, i) => ({ coins: nice(BAL.parcelCost(i, f.parcels[i].lvl)) }),
  parcelMgr: (f, i) => ({ coins: nice(BAL.parcelMgr(i)) }),
  elev: f => ({ coins: nice(BAL.elevCost(f.elev.lvl)) }),
  cart: f => ({ coins: nice(BAL.cartCost(f.cart.lvl)) }),
  elevMgr: () => ({ coins: BAL.elevMgr }), cartMgr: () => ({ coins: BAL.cartMgr }),
  barn: s => ({ coins: nice(BAL.barnCost(s.barn)), wood: BAL.barnWood(s.barn) }),
  oven: s => s.oven.lvl === 0 ? { coins: BAL.ovenBuild.coins, wood: BAL.ovenBuild.wood } : { coins: nice(BAL.ovenCost(s.oven.lvl)), wood: BAL.ovenWood(s.oven.lvl) },
  farm: s => { const c = BAL.farmCost(Object.keys(s.farms).length); return { coins: nice(c.coins), wood: c.wood }; },
};
// combien de niveaux d'un coup (×1, ×10, max) et pour quel prix
function bulk(costAt, startLvl, n, coins){
  let tot = 0, k = 0;
  while (true){
    const c = nice(costAt(startLvl + k));
    if (n === "max" ? tot + c > coins : k >= n) break;
    tot += c; k++;
    if (k > 1000) break;
  }
  return { n: k, coins: tot };
}

/* ---------- Le four ---------- */
function ovenTick(s, now){
  const o = s.oven; if (!o.lvl) return [];
  const done = [];
  o.slots.forEach((sl, i) => {
    if (sl && now >= sl.t0 + sl.dur){ s.stock[sl.rec] += sl.qty; s.stats.baked += sl.qty; done.push(sl); o.slots[i] = null; }
  });
  return done;
}
const ovenBatch = s => BAL.ovenBatch(s.oven.lvl, effRate(s, 0));
const ovenDur = (s, rec) => Math.round(P[rec].t * BAL.ovenSpeed(s.oven.lvl)) * 1000;
const canBake = (s, rec) => { let m = Infinity; for (const k in P[rec].rec) m = Math.min(m, Math.floor(s.stock[k] / P[rec].rec[k])); return m; };

/* ---------- Commandes du village ---------- */
function rng(seed){ let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const CHARS = {
  boulanger:  { name:"Le boulanger",   e:"👨‍🍳", wants:["pain","ble"] },
  aubergiste: { name:"L'aubergiste",   e:"🧔", wants:["crepes","oeufs","lait"] },
  patissiere: { name:"La pâtissière",  e:"👩‍🍳", wants:["gateau","tarte"] },
  epiciere:   { name:"L'épicière",     e:"👵", wants:["confiture","fruits","miel"] },
  charpentier:{ name:"Le charpentier", e:"👷", wants:["bois"] },
  maire:      { name:"Le maire",       e:"🎩", wants:[] },
};
const charFor = (k, r) => { const c = Object.keys(CHARS).filter(id => CHARS[id].wants.includes(k)); return c[Math.floor(r() * c.length)] || "epiciere"; };
function genOrders(s, slot, playerId, groupProd){
  const r = rng(hash(playerId + ":" + slot));
  const eff = Math.max(effRate(s, 0), 0.5);
  const own = eff * 10, prime = Math.min(Math.max(groupProd || 0, own), own * 5);
  const others = RAW.filter(k => k !== s.spec);
  const recipes = s.oven.lvl ? CRAFT : [];
  const pick = a => a[Math.floor(r() * a.length)];
  const between = (a, b) => a + r() * (b - a);
  const prods = [pick(others), recipes.length ? pick(recipes) : pick(others), pick(others), pick(recipes.length && r() < .5 ? recipes : others)];
  const used = new Set([bigOf(slot)]);
  const list = prods.slice(0, BAL.orders).map((k, i) => {
    if (used.has(k)) k = pick(ALL.filter(x => !used.has(x) && x !== s.spec && (recipes.length || !P[x].rec)));
    used.add(k);
    const rec = !!P[k].rec, n = rec ? Object.keys(P[k].rec).length : 1;
    const qty = Math.max(10, nice(eff * (rec ? between(...BAL.recipeSecs) / n : between(...BAL.orderSecs))));
    const bonus = nice(prime * 60 * between(...BAL.bonusMins) * (rec ? BAL.recipeBonus : 1));
    return { id: slot + "-" + i, k, qty, bonus, who: charFor(k, r) };
  });
  // la grande commande : le même produit pour tout le monde (annoncée 20 min à l'avance)
  const gk = bigOf(slot);
  list.unshift({ id: slot + "-G", k: gk, big: true, who: "maire",
    qty: Math.max(15, nice(eff * between(...BAL.orderSecs) * BAL.bigQty)),
    bonus: nice(prime * 60 * between(...BAL.bonusMins) * BAL.bigBonus) });
  return list;
}
// produit de la grande commande d'un créneau (identique pour tous les joueurs)
const bigOf = slot => RAW[Math.floor(rng(hash("grande:" + slot))() * RAW.length)];
const fullBonus = s => nice(s.orders.list.reduce((a, o) => a + o.bonus, 0) * BAL.fullBonus);
function ensureOrders(s, now, playerId, groupProd){
  const slot = Math.floor(now / BAL.slotMs);
  if (s.orders.slot !== slot){ s.orders = { slot, list: genOrders(s, slot, playerId, groupProd), prog:{} }; return true; }
  return false;
}
// livrer (en plusieurs fois possible) : marchandise payée au prix plancher, prime à la fin
function deliver(s, id){
  const o = s.orders.list.find(x => x.id === id); if (!o) return null;
  const done = s.orders.prog[id] || 0, need = o.qty - done;
  const give = Math.min(need, Math.floor(s.stock[o.k]));
  if (give <= 0) return null;
  s.stock[o.k] -= give; s.orders.prog[id] = done + give;
  const paid = give * P[o.k].floor, complete = s.orders.prog[id] >= o.qty;
  s.coins += paid; s.stats.earned += paid;
  return { give, paid, complete };
}

/* ---------- Réserve du village (le plafond) ---------- */
function reserveLeft(s, k, now){
  const slot = Math.floor(now / BAL.slotMs);
  if (s.reserve.slot !== slot) s.reserve = { slot, used:{} };
  const lim = Math.max(30, nice(effRate(s, 0) * BAL.reserveSecs / (P[k].rec ? 3 : 1)));
  return Math.max(0, lim - (s.reserve.used[k] || 0));
}
const reservePrice = k => P[k].floor * BAL.reserveMult;

/* ---------- Cours du village ----------
   Le même pour tout le monde (calculé à partir de l'heure, sans serveur) : 3 vagues de durées différentes
   par produit, donc jamais deux produits au même moment. Entre ~0,4× et ~2,5× le prix de base. */
const VPH = {}; ALL.forEach(k => { const r = rng(hash("cours:" + k)); VPH[k] = BAL.vPeriods.map(T => ({ T: T * (0.75 + r() * 0.5), ph: r() * Math.PI * 2 })); });
function vMul(k, t){
  const sec = t / 1000; let x = 0;
  VPH[k].forEach((w, j) => x += BAL.vSwing[j] * Math.sin(2 * Math.PI * sec / w.T + w.ph));
  return Math.exp(x);
}
const vPrice = (k, t) => P[k].floor * vMul(k, t);
// ce que tu as vendu au village récemment (ça s'oublie petit à petit)
function vSold(s, k, t){
  s.vsold = s.vsold || {}; const v = s.vsold[k]; if (!v) return 0;
  return v.q * Math.pow(0.5, Math.max(0, t - v.t) / 1000 / BAL.vHalfLife);
}
const vAbsorb = s => Math.max(60, effRate(s, 0) * BAL.vAbsorb);
// ton prix à toi en ce moment (cours du village, baissé par tes ventes récentes)
const vMyPrice = (s, k, t) => vPrice(k, t) / (1 + vSold(s, k, t) / vAbsorb(s));
// combien rapporte la vente de q unités d'un coup (le prix baisse à chaque unité vendue)
function vValue(s, k, q, t){
  if (q <= 0) return 0;
  const A = vAbsorb(s), x0 = vSold(s, k, t);
  return Math.floor(vPrice(k, t) * A * Math.log((A + x0 + q) / (A + x0)));
}
function vSell(s, k, q, t){
  q = Math.min(Math.floor(q), Math.floor(s.stock[k] || 0)); if (q < 1) return 0;
  const g = vValue(s, k, q, t);
  s.stock[k] -= q; s.vsold[k] = { q: vSold(s, k, t) + q, t };
  s.coins += g; s.stats.earned += g; s.stats.villageSold += g;
  return g;
}

/* ---------- Fortune ---------- */
function fortune(s){
  let st = 0; ALL.forEach(k => st += (s.stock[k] || 0) * P[k].floor);
  return Math.floor(s.coins + st + s.stats.invested * 0.5);
}
// ce qui se découvre petit à petit
function unlocked(s, what){
  const f = s.farms[s.spec], np = f.parcels.length;
  switch (what){
    case "grange": return s.stats.produced > 0 || s.coins > 0;
    case "mgr": return s.stats.earned >= 15 || np > 1 || f.parcels[0].lvl > 2;
    case "boost": return f.parcels[0].lvl >= 3 || np > 1;
    case "marche": return np >= 2;
    case "village": return np >= 3;
    case "four": return np >= 3;
    case "farm2": return np >= BAL.farmNeeds && Object.keys(s.farms).length < BAL.farmMax;
  }
  return true;
}
// le maillon lent de la ferme
function bottleneck(s, key, now){
  const f = s.farms[key], r = farmRates(f, now, farmMul(s, key));
  if (barnFree(s) < 1) return "barn";
  const anyMgr = f.parcels.some(p => p.mgr) || f.elev.mgr || f.cart.mgr;
  if (!anyMgr) return null;
  if (f.quai >= quaiCap(f) * 0.9 || r.C < Math.min(r.P, r.E) * 0.95) return "cart";
  if (r.E < r.P * 0.95) return "elev";
  return null;
}

return { RAW, CRAFT, ALL, P, BAL, gateOf, gateState, newParcel, fixFarm, quaiCap, pendTotal, elevRate, cartRate, startParcel, startElev, startCart, CHARS, MILES, isPalier, newState, newFarm, step, catchUp, farmRates, effRate, prodValue,
  stockUnits, barnCap, barnFree, costs, canPay, pay, bulk, nextParcelCost, nice, ovenTick, ovenBatch, ovenDur, canBake,
  ensureOrders, genOrders, deliver, bigOf, fullBonus, reserveLeft, reservePrice, fortune, unlocked, bottleneck, farmMul, pRate, vMul, vPrice, vMyPrice, vValue, vSell };
})();

try{ window.BARON_ENGINE = BX; }catch(e){}
const Q = window.QUERIDA;
if (!Q || Q.role() !== "ami") return;

/* =================== Petits outils =================== */
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const P = BX.P, BAL = BX.BAL;
const now = () => Date.now();
// gros nombres abrégés : 9 999, 12,5K, 1,2M, 3,4B, 5T…
function fmtN(n, dec){
  n = Number(n) || 0; const a = Math.abs(n);
  if (a < 1000){
    if (dec && a < 100 && Math.abs(n - Math.round(n)) > 0.05) return (Math.round(n * 10) / 10).toLocaleString("fr-FR");
    return Math.floor(n + 1e-9).toLocaleString("fr-FR");
  }
  const U = [[1e18, "Qi"], [1e15, "Q"], [1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [v, u] of U) if (a >= v){ const x = n / v; return (x < 100 ? Math.floor(x * 10) / 10 : Math.floor(x)).toLocaleString("fr-FR") + u; }
  return String(Math.floor(n));
}
const fmtP = p => p >= 100 ? fmtN(p) : (Math.round(p * 10) / 10).toLocaleString("fr-FR", { minimumFractionDigits: p < 10 ? 1 : 0 });
const fmtT = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); const m = Math.floor(s / 60), r = s % 60; if (m >= 60) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; return `${m}:${String(r).padStart(2, "0")}`; };
const fmtAgo = t => { const m = Math.round((now() - t) / 60000); if (m < 1) return "à l'instant"; if (m < 60) return `il y a ${m} min`; const h = Math.round(m / 60); if (h < 24) return `il y a ${h} h`; return `il y a ${Math.round(h / 24)} j`; };
const COIN = `<i class="b2-coin" aria-hidden="true"></i>`;
const WOOD = `<span class="b2-e" aria-hidden="true">🪵</span>`;
const price = c => `${c.coins ? `${COIN}${fmtN(c.coins)}` : ""}${c.wood ? ` ${WOOD}${fmtN(c.wood)}` : ""}`;
const seen = k => S && S.seen && S.seen[k];
const markSeen = k => { if (S){ S.seen[k] = 1; dirty = true; } };

let actx = null;
function sound(kind){
  try{
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    const f = { coin:[988, 1319], up:[523, 784], tap:[440, 520], done:[659, 988], err:[220, 180] }[kind] || [660, 880];
    o.type = kind === "coin" ? "square" : kind === "err" ? "sawtooth" : "triangle";
    o.frequency.setValueAtTime(f[0], t); o.frequency.setValueAtTime(f[1], t + 0.07);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === "coin" ? 0.035 : 0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === "done" ? 0.4 : 0.18));
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.45);
  }catch(e){}
}
const buzz = ms => { try{ navigator.vibrate && navigator.vibrate(ms); }catch(e){} };
function toast(html, kind){
  const w = wrapEl || document.body;
  w.querySelector("#b2-toast")?.remove();
  w.insertAdjacentHTML("beforeend", `<div id="b2-toast" class="b2-toast ${kind || ""}" role="status">${html}</div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => w.querySelector("#b2-toast")?.classList.add("on")));
  clearTimeout(toast.t); toast.t = setTimeout(() => { const t = w.querySelector("#b2-toast"); if (t){ t.classList.remove("on"); setTimeout(() => t.remove(), 400); } }, 2800);
}
// des pièces qui volent jusqu'au porte-monnaie
function coinsFly(fromEl, n){
  try{
    const hud = wrapEl && wrapEl.querySelector('[data-live="coins"]'); if (!hud || !fromEl) return;
    const a = fromEl.getBoundingClientRect(), b = hud.getBoundingClientRect();
    const k = Math.min(8, Math.max(3, n || 5));
    for (let i = 0; i < k; i++){
      const c = document.createElement("i"); c.className = "b2-coin b2-fly";
      c.style.left = (a.left + a.width / 2 - 9 + (Math.random() - .5) * 40) + "px"; c.style.top = (a.top + a.height / 2 - 9) + "px";
      c.style.setProperty("--dx", (b.left - a.left - a.width / 2 + 10) + "px"); c.style.setProperty("--dy", (b.top - a.top - a.height / 2 + 4) + "px");
      c.style.animationDelay = (i * 55) + "ms";
      document.body.appendChild(c); setTimeout(() => c.remove(), 1100 + i * 55);
    }
    setTimeout(() => { hud.closest(".b2-pill")?.classList.remove("bump"); void hud.offsetWidth; hud.closest(".b2-pill")?.classList.add("bump"); }, 650);
  }catch(e){}
}
function floatText(el, text, cls){
  try{
    const r = el.getBoundingClientRect(), d = document.createElement("div");
    d.className = "b2-float " + (cls || ""); d.innerHTML = text;
    d.style.left = (r.left + r.width / 2) + "px"; d.style.top = (r.top + 6) + "px";
    document.body.appendChild(d); setTimeout(() => d.remove(), 1100);
  }catch(e){}
}
function bounce(el){ if (!el) return; el.classList.remove("b2-pop"); void el.offsetWidth; el.classList.add("b2-pop"); }

/* =================== Serveur =================== */
const db = () => Q.store().client;
const TOKEN = "bn2_token";
const getToken = () => { try{ return localStorage.getItem(TOKEN) || null; }catch(e){ return null; } };
const setToken = t => { try{ t ? localStorage.setItem(TOKEN, t) : localStorage.removeItem(TOKEN); }catch(e){} };
const rpc = async (fn, args) => { const { data, error } = await db().rpc(fn, args); if (error) throw error; return data; };
let chain = Promise.resolve();
const queue = fn => { const p = chain.then(fn); chain = p.catch(() => {}); return p; };
const errText = e => {
  const m = String((e && (e.message || e.error_description)) || e || "");
  if (m.includes("spécialité prise")) return "Quelqu'un vient de prendre cette spécialité. Choisis-en une autre.";
  if (m.includes("partie complète")) return "Les 6 places sont prises.";
  if (m.includes("déjà inscrit")) return "Tu as déjà une ferme, mais ce téléphone n'a pas ta clé. Demande à Naïm de te la redonner.";
  if (m.includes("offre changée")) return "Cette offre vient de changer. Regarde les nouvelles offres.";
  if (m.includes("ta propre offre")) return "C'est ta propre offre : retire-la plutôt.";
  if (m.includes("jeton inconnu")) return "Ta clé de ferme n'est plus valable.";
  if (/fetch|network|Failed|Load failed/i.test(m)) return "Pas de connexion. Réessaie dans un instant.";
  return "Ça n'a pas marché. Réessaie.";
};

/* =================== État =================== */
let S = null, ME = null, W = { res:null, players:[], listings:[], trades:[], at:0 };
// réserve du village commune : ce qu'il reste pour tout le monde sur ce créneau de 20 min
const resLeft = k => { const r = W.res; if (!r || r.slot !== Math.floor(now() / BAL.slotMs)) return 0; return Math.max(0, Math.floor((+(r.size || {})[k] || 0) - (+(r.used || {})[k] || 0))); };
let dirty = false, lastSave = 0, lastTick = 0, saving = false, loopT = null, wrapEl = null, view = "farm";
let mkt = { k: null, period: "24h" };

function publicStats(){
  return { fortune: BX.fortune(S), prod: Math.round(BX.prodValue(S) * 100) / 100, baked: Math.floor(S.stats.baked), orders: S.stats.orders,
    traded: Math.floor(S.stats.sold + S.stats.bought), farms: Object.keys(S.farms), parcels: S.farms[S.spec].parcels.length, pio: S.reform ? 1 : 0 };
}
function applyCredits(list){
  const msgs = [];
  (list || []).slice().sort((a, b) => a.id - b.id).forEach(c => {
    if (+c.id <= (S.credit_seen || 0)) return;
    S.coins += +c.coins || 0; S.stats.sold += +c.coins || 0; S.stats.earned += +c.coins || 0;
    S.credit_seen = +c.id; dirty = true;
    msgs.push(c);
  });
  if (msgs.length){
    const tot = msgs.reduce((a, c) => a + (+c.coins || 0), 0);
    const c = msgs[msgs.length - 1];
    toast(msgs.length === 1 ? `${esc(c.buyer || "Quelqu'un")} t'a acheté ${fmtN(c.qty)} ${P[c.product]?.e || ""} : +${COIN}${fmtN(tot)}` : `${msgs.length} ventes au marché : +${COIN}${fmtN(tot)}`, "gold");
    sound("coin");
  }
}
/* La Grande Réforme (nov. 2026) : les fermes repartent de zéro, chacun garde sa spécialité
   et reçoit en pièces une part de son ancienne fortune (calculée par le serveur), + une médaille de Pionnier. */
let reformMsg = null;
function applyReform(s){
  const r = s.reform || {}, n = BX.newState(s.spec, now());
  n.coins = Math.max(0, Math.floor(+r.coins || 0));
  n.stock.bois = Math.max(BAL.startWood, Math.floor(+r.wood || 0));
  while (BAL.barnCap(n.barn) < n.stock.bois * 2) n.barn++;   // une grange assez grande pour la récompense
  n.reform = { v: 1, from: +r.from || 0, coins: n.coins, wood: n.stock.bois, rank: r.rank || 0, at: r.at || now() };
  n.credit_seen = s.credit_seen || 0;
  n.seen = Object.assign({}, s.seen || {});
  ["sold", "bought", "orders", "baked"].forEach(k => n.stats[k] = (s.stats && +s.stats[k]) || 0);
  reformMsg = n.reform;
  return n;
}
function fixState(s){
  if (s.reform_todo) s = applyReform(s);
  BX.ALL.forEach(k => { if (typeof s.stock[k] !== "number") s.stock[k] = 0; });
  s.stats = Object.assign({ produced:0, invested:0, baked:0, orders:0, sold:0, bought:0, earned:0, villageSold:0 }, s.stats || {});
  s.seen = s.seen || {}; s.oven = s.oven || { lvl:0, slots:[] }; s.orders = s.orders || { slot:0, list:[], prog:{} };
  s.reserve = s.reserve || { slot:0, used:{} }; s.vsold = s.vsold || {};
  if (!s.ord2){ s.ord2 = 1; s.orders = { slot:0, list:[], prog:{} }; }   // commandes du village en course (11 nov. 2026)
  s.claims = (s.claims || []).map(c => ({ id: c.id, slot: c.slot })); s.wonIds = s.wonIds || [];
  // une seule exploitation en plus : on garde la plus développée
  const extra = Object.keys(s.farms).filter(k => k !== s.spec);
  if (extra.length > BAL.farmMax - 1){
    const score = k => s.farms[k].parcels.reduce((a, p, i) => a + p.lvl * Math.pow(5, i), 0);
    extra.sort((a, b) => score(b) - score(a)).slice(BAL.farmMax - 1).forEach(k => delete s.farms[k]);
  }
  if (!s.farms[s.cur]) s.cur = s.spec;
  for (const k in s.farms) BX.fixFarm(s.farms[k]);
  return s;
}
async function load(){
  const r = await queue(() => rpc("baron2_load", { p_token: getToken() }));
  ME = r.me;
  S = fixState(r.state && r.state.farms ? r.state : BX.newState(ME.specialty, now()));
  const gained = BX.catchUp(S, now());
  applyCredits(r.credits);
  lastTick = now();
  return gained;
}
async function save(force){
  if (!S || saving) return;
  if (!force && !dirty && now() - lastSave < 60000) return;
  saving = true; dirty = false;
  try{
    const r = await queue(() => rpc("baron2_save", { p_token: getToken(), p_state: S, p_stats: publicStats() }));
    lastSave = now(); applyCredits(r && r.credits);
  }catch(e){ dirty = true; }
  saving = false;
}
async function loadWorld(force){
  if (!force && now() - W.at < 25000) return;
  try{
    const r = await rpc("baron2_world", {});
    W = { res: r.reserve || null, players: r.players || [], listings: r.listings || [], trades: (r.trades || []).map(t => Object.assign({}, t, { ts: new Date(t.at).getTime() })).sort((a, b) => a.ts - b.ts), at: now() };
    await loadOrders(true);
    if (wrapEl && (view === "market" || view === "village")) draw();
  }catch(e){}
}
const groupProd = () => {
  const p = W.players.map(x => +(x.stats && x.stats.prod) || 0).filter(x => x > 0);
  return p.length ? p.reduce((a, b) => a + b, 0) / p.length : 0;
};
const nameOf = id => (W.players.find(p => p.id === id) || {}).name || "Un voisin";

/* =================== Styles =================== */
const STYLE = `
.b2-wrap{--sky1:#9ED6EE;--sky2:#FFE3BC;--grass:#86C35A;--grass2:#5E9E3C;--wood:#B07240;--wood2:#7C4A24;--woodl:#DDA468;
  --paper:#FFF4E0;--paper2:#F7E3C2;--ink:#3B1F17;--ink2:#7A5A4C;--ink3:rgba(59,31,23,.45);--red:#CC3F27;--red2:#9E3320;--gold:#F2B33D;--gold2:#C98A12;
  --up:#2F9E57;--up2:#1F7A40;--down:#D9442B;--board:#20372C;--board2:#2A4538;--chalk:#EFEADB;--chalk2:rgba(239,234,219,.6);
  --round:ui-rounded,"SF Pro Rounded","Nunito",system-ui,-apple-system,sans-serif;--disp:"Instrument Serif",ui-serif,Georgia,serif;
  position:fixed;inset:0;z-index:74;background:#F3E3C7;color:var(--ink);font-family:var(--f,system-ui);overflow:hidden;
  -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;animation:b2-in .3s ease;display:flex;flex-direction:column}
@keyframes b2-in{from{opacity:0;transform:translateY(14px)}}
.b2-wrap button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;-webkit-tap-highlight-color:transparent}
.b2-wrap :focus-visible{outline:3px solid var(--gold);outline-offset:2px}
.b2-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.b2-col{max-width:520px;margin:0 auto;position:relative}
.b2-pad{padding:14px 16px 24px}

/* barre du haut : argent et bois toujours visibles */
.b2-hud{position:relative;z-index:5;padding:calc(env(safe-area-inset-top,0px) + 8px) 12px 8px;background:linear-gradient(#5B3519,#6E4222);box-shadow:0 2px 0 #3E220F,0 6px 14px rgba(0,0,0,.18)}
.b2-hud .b2-col{display:flex;align-items:center;gap:8px}
.b2-hbtn{width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.12)!important;color:#FBEFE0!important;font-size:20px!important;display:grid;place-items:center;flex:none}
.b2-pill{display:flex;align-items:center;gap:6px;background:#2E1A0C;border-radius:999px;padding:5px 12px 5px 6px;color:#FFF3DE;font:800 17px var(--round);font-variant-numeric:tabular-nums;box-shadow:inset 0 2px 3px rgba(0,0,0,.4)}
.b2-pill.bump{animation:b2-bump .45s ease}
@keyframes b2-bump{40%{transform:scale(1.14)}}
.b2-pill .b2-coin{width:22px;height:22px}
.b2-pill .b2-e{font-size:18px}
.b2-hud .b2-sp{flex:1}
.b2-coin{display:inline-block;width:15px;height:15px;border-radius:50%;vertical-align:-2px;margin-right:3px;flex:none;
  background:radial-gradient(circle at 35% 30%,#FFE9A6 0 18%,#F6C543 30%,#D9940F 75%);box-shadow:inset 0 0 0 2px #B97A0C,inset 0 0 0 3.5px #FFD15C}
.b2-e{font-size:14px;margin-right:2px}
.b2-fly{position:fixed;z-index:95;width:18px;height:18px;pointer-events:none;animation:b2-fly .9s cubic-bezier(.5,-.3,.7,1) forwards}
@keyframes b2-fly{0%{transform:translate(0,0) scale(.6);opacity:0}15%{transform:translate(0,-28px) scale(1.1);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(.7);opacity:.9}}
.b2-float{position:fixed;z-index:95;transform:translateX(-50%);font:900 18px var(--round);color:#fff;text-shadow:0 2px 0 var(--up2),0 0 8px rgba(0,0,0,.25);pointer-events:none;animation:b2-up 1.05s ease forwards}
.b2-float.small{font-size:14px;color:#FFF3DE;text-shadow:0 1px 0 rgba(0,0,0,.5),0 0 6px rgba(0,0,0,.35)}
@keyframes b2-dig{to{transform:rotate(-14deg) translateY(2px)}}
@keyframes b2-walk{to{transform:translateY(-3px)}}
.b2-float.gold{color:#FFE08A;text-shadow:0 2px 0 #9B6700}
@keyframes b2-up{to{transform:translate(-50%,-46px);opacity:0}}
.b2-pop{animation:b2-pop .32s cubic-bezier(.3,1.6,.5,1)}
@keyframes b2-pop{40%{transform:scale(.92)}70%{transform:scale(1.05)}}

/* barre d'onglets (planche de bois) */
.b2-tabs{position:relative;z-index:5;background:linear-gradient(#7C4A24,#5E3517);box-shadow:0 -2px 0 #9A6334 inset,0 -6px 14px rgba(0,0,0,.15);padding:6px 6px calc(env(safe-area-inset-bottom,0px) + 6px)}
.b2-tabs .b2-col{display:flex;gap:4px}
.b2-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 2px 5px;border-radius:12px;color:#F5DFC2!important;font:700 12px var(--round)!important;position:relative}
.b2-tab .i{font-size:23px;line-height:1.1;filter:saturate(.85)}
.b2-tab.on{background:#F3E3C7!important;color:var(--ink)!important;box-shadow:0 3px 0 #C9A57A}
.b2-tab.locked{opacity:.45}
.b2-tab.locked .i{filter:grayscale(1)}
.b2-tab .dot{position:absolute;top:4px;right:calc(50% - 20px);width:10px;height:10px;border-radius:50%;background:var(--red);box-shadow:0 0 0 2px #6E4222}

/* boutons de jeu */
.b2-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;border-radius:12px!important;padding:8px 12px;font:800 14px var(--round)!important;white-space:nowrap;
  background:var(--up)!important;color:#fff!important;box-shadow:0 3px 0 var(--up2);transition:transform .08s}
.b2-btn:active{transform:translateY(2px);box-shadow:0 1px 0 var(--up2)}
.b2-btn .b2-coin{width:14px;height:14px}
.b2-btn.no{background:#BFA88C!important;box-shadow:0 3px 0 #9C8468;color:#F7EEE2!important}
.b2-btn.gold{background:var(--gold)!important;color:#4A2C00!important;box-shadow:0 3px 0 var(--gold2)}
.b2-btn.red{background:var(--red)!important;box-shadow:0 3px 0 var(--red2)}
.b2-btn.ghost{background:rgba(59,31,23,.08)!important;color:var(--ink)!important;box-shadow:none}
.b2-btn.big{padding:13px 18px;font-size:16px!important;border-radius:16px!important;width:100%}
.b2-btn[disabled]{opacity:.55;pointer-events:none}

/* ======== FERME ======== */
.b2-farm{background:#5B3A21}
.b2-sky{position:relative;height:300px;overflow:hidden;background:linear-gradient(var(--sky1),var(--sky2) 78%)}
.b2-sky .sun{position:absolute;left:calc(50% - 23px);top:118px;width:46px;height:46px;border-radius:50%;background:radial-gradient(#FFF3B0,#FFC94D 60%,rgba(255,201,77,0) 72%);box-shadow:0 0 30px 8px rgba(255,214,110,.55)}
.b2-cloud{position:absolute;height:18px;background:#fff;border-radius:20px;opacity:.85;animation:b2-cloud linear infinite}
.b2-cloud::before,.b2-cloud::after{content:"";position:absolute;background:#fff;border-radius:50%}
.b2-cloud::before{width:24px;height:24px;left:10px;top:-11px}.b2-cloud::after{width:18px;height:18px;left:28px;top:-7px}
@keyframes b2-cloud{from{transform:translateX(-90px)}to{transform:translateX(560px)}}
.b2-hills{position:absolute;left:0;right:0;bottom:44px;height:70px}
.b2-ground{position:absolute;left:0;right:0;bottom:0;height:50px;background:linear-gradient(var(--grass) 0 30%,var(--grass2) 30% 36%,#C9965E 36% 100%)}
.b2-road{position:absolute;left:0;right:0;bottom:8px;height:18px;background:repeating-linear-gradient(90deg,#B98552 0 18px,#B07D4A 18px 30px);border-top:2px solid #9C6A3B}
.b2-barn{position:absolute;right:10px;bottom:30px;width:150px}
.b2-barn svg{display:block;width:100%}
.b2-sellbtn{position:absolute!important;right:40px;bottom:92px;z-index:3;display:flex;flex-direction:column;align-items:center;gap:0;padding:6px 14px 7px!important;border-radius:14px!important;
  background:linear-gradient(#FFD45E,#F2B33D)!important;color:#4A2C00!important;box-shadow:0 4px 0 var(--gold2),0 8px 16px rgba(0,0,0,.25);transition:transform .08s}
.b2-sellbtn:active{transform:translateY(3px);box-shadow:0 1px 0 var(--gold2)}

.b2-sellbtn .v{display:flex;align-items:center;font:900 17px var(--round);font-variant-numeric:tabular-nums}
.b2-sellbtn .v .b2-coin{width:18px;height:18px}
.b2-sellbtn.empty{display:none!important}
.b2-sellbtn.ready{animation:b2-call 1.2s ease-in-out infinite}
.b2-sellbtn.ready::after{display:none;content:"👆";position:absolute;right:-22px;top:6px;font-size:26px;animation:b2-tap 1.1s ease-in-out infinite}
.b2-gauge{position:absolute;right:14px;top:112px;width:140px;z-index:1}
.b2-gbar{height:12px;border-radius:999px;background:rgba(59,31,23,.25);overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.25)}
.b2-gbar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#F6C543,#F2873B);transition:width .5s}
.b2-gbar.full i{background:var(--down);animation:b2-blink 1s infinite}
@keyframes b2-blink{50%{opacity:.55}}
.b2-glab{display:flex;justify-content:space-between;font:800 11.5px var(--round);color:var(--ink);margin-bottom:3px;text-shadow:0 1px 0 rgba(255,255,255,.6)}
.b2-cartlane{position:absolute;left:74px;right:118px;bottom:12px;height:50px;padding:0!important;z-index:1}
.b2-cart{position:absolute;left:12px;bottom:0;width:80px;will-change:transform}
.b2-cart .ld{position:absolute;left:50%;top:-20px;transform:translateX(-50%);background:var(--ink);color:#FFE6B8;border-radius:7px;padding:1px 6px;font:900 11.5px var(--round);transition:opacity .2s;white-space:nowrap}
.b2-cart .pusher{position:absolute;left:-24px;bottom:-2px;width:30px;height:44px}
.b2-cart .pusher svg{width:100%;height:100%;display:block}
.b2-cart.back .pusher{left:auto;right:-24px;transform:scaleX(-1)}
.b2-cart.back svg{transform:scaleX(-1)}
.b2-cart.mv .pusher svg{animation:b2-walk .3s ease-in-out infinite alternate}
.b2-cart svg{display:block;width:100%}
.b2-cart .wheel{transform-box:fill-box;transform-origin:center}
.b2-cart.mv .wheel{animation:b2-spin .6s linear infinite}

@keyframes b2-spin{to{transform:rotate(360deg)}}

.b2-quai{position:absolute;left:68px;bottom:56px;width:56px;text-align:center;pointer-events:none;z-index:2}
.b2-quai small{display:block;font:800 10.5px var(--round);color:var(--ink);opacity:.75;margin-top:1px}
.b2-quai .sacks{display:flex;flex-wrap:wrap-reverse;justify-content:center;gap:1px;min-height:18px}
.b2-quai .sk{width:13px;height:11px;border-radius:5px 5px 4px 4px;background:#E7C48B;box-shadow:inset 0 -2px 0 #C79B5C}
.b2-tag{display:inline-block;background:rgba(59,31,23,.78);color:#FFF3DE;border-radius:8px;padding:2px 6px;font:800 11px var(--round);font-variant-numeric:tabular-nums}
.b2-tag.warn{background:var(--down)}
.b2-farmsw{display:flex;gap:6px;padding:10px 12px 0;overflow-x:auto}
.b2-farmsw button{flex:none;color:var(--ink)!important;background:#FFF4E0!important;border-radius:999px;padding:4px 10px;font:800 13px var(--round)!important}
.b2-farmsw button.on{background:var(--ink)!important;color:#FFF3DE!important}

/* panneaux en bois (charrette, monte-charge, parcelles) */
.b2-sign{position:relative;background:linear-gradient(180deg,#E9BC84,#D9A066);border-radius:12px;padding:8px 10px;color:var(--ink);
  box-shadow:0 3px 0 #9A6334,inset 0 1px 0 rgba(255,255,255,.35);background-image:repeating-linear-gradient(0deg,rgba(124,74,36,.07) 0 2px,transparent 2px 9px),linear-gradient(180deg,#EDC28C,#D9A066)}
.b2-sign::before,.b2-sign::after{content:"";position:absolute;top:7px;width:5px;height:5px;border-radius:50%;background:#7C4A24;box-shadow:inset 0 1px 0 rgba(255,255,255,.35)}
.b2-sign::before{left:6px}.b2-sign::after{right:6px}
.b2-sign h3{margin:0;font:400 italic 20px/1 var(--disp);color:var(--ink)}
.b2-sign .meta{font:800 12.5px var(--round);color:var(--ink2);font-variant-numeric:tabular-nums}
.b2-sign .row{display:flex;align-items:center;gap:8px}
.b2-sign .row + .row{margin-top:6px}
.b2-sign .sp{flex:1;min-width:0}
.b2-lvl{display:inline-grid;place-items:center;min-width:30px;height:22px;border-radius:7px;background:var(--ink);color:#FFE6B8;font:900 12.5px var(--round);padding:0 6px;font-variant-numeric:tabular-nums}
.b2-slow{display:inline-block;margin-left:4px;padding:1px 7px;border-radius:6px;background:var(--down);color:#fff;font:900 11px var(--round);animation:b2-blink 1.2s infinite;vertical-align:2px}
.b2-mgr{width:40px;height:40px;border-radius:50%;flex:none;display:grid;place-items:center;font-size:22px;background:#FFF4E0;box-shadow:0 0 0 2.5px var(--gold),0 2px 0 3px rgba(0,0,0,.12);position:relative}
.b2-mgr.hire{background:rgba(255,244,224,.55);box-shadow:none;border:2px dashed var(--wood2);font-size:13px;font-weight:900;color:var(--wood2);flex-direction:column;line-height:1;gap:1px}
.b2-mgr.hire .b2-coin{width:11px;height:11px;margin:0}
.b2-mgr.can{animation:b2-call 1.6s ease-in-out infinite}
@keyframes b2-call{50%{box-shadow:0 0 0 5px rgba(242,179,61,.6)}}
.b2-stn{position:absolute;top:10px;z-index:3;width:calc(50% - 14px);max-width:210px;box-sizing:border-box;border-radius:12px;padding:7px 8px 8px;color:var(--ink);cursor:pointer;
  box-shadow:0 3px 0 #9A6334,0 6px 14px rgba(59,31,23,.18);background-image:repeating-linear-gradient(0deg,rgba(124,74,36,.07) 0 2px,transparent 2px 9px),linear-gradient(180deg,#EDC28C,#D9A066)}
.b2-stn.elev{left:8px}.b2-stn.cart{right:8px}
.b2-stn{display:flex;align-items:center;gap:8px;padding:10px 8px 8px 14px!important;width:auto!important}
.b2-stn > .b2-btn{flex:1;padding:8px 6px;font-size:14px!important}
.b2-stn .nm{min-width:0;display:flex;flex-direction:column;gap:3px}
.b2-stn .nm b{font:400 italic 18px/1 var(--disp);white-space:nowrap}
.b2-stn .bot{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:7px}
.b2-stn .meta{font:800 11.5px var(--round);color:var(--ink2);font-variant-numeric:tabular-nums;line-height:1.2}
.b2-stn .btns{display:flex;gap:6px;margin-top:6px}
.b2-stn .btns .b2-btn{flex:1;min-width:0;padding:7px 4px;font-size:13px!important}
.b2-sign .b2-hire{padding:7px 8px;font-size:12.5px!important;flex:none}
.b2-stn .b2-slow{position:absolute;right:6px;top:-9px;margin:0}
.b2-seat{position:relative;width:38px;height:38px;flex:none;border-radius:50%!important;display:grid;place-items:center;font-size:21px!important;background:rgba(255,244,224,.7)!important;border:2px dashed var(--wood2)!important;padding:0!important;margin-bottom:6px}
.b2-seat > i:not(.b2-face){position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);font:900 8.5px var(--round);font-style:normal;white-space:nowrap;background:var(--wood2);color:#FFF3DE;border-radius:5px;padding:1px 4px}
.b2-seat:not(.on){filter:saturate(.35)}
.b2-seat.can{filter:none;animation:b2-call 1.6s ease-in-out infinite}
.b2-seat.can > i:not(.b2-face){background:var(--up)}
.b2-seat.on{background:#FFF4E0!important;border:0!important;box-shadow:0 0 0 2.5px var(--gold),0 2px 0 3px rgba(0,0,0,.12)}
.b2-seat.on > i:not(.b2-face){background:var(--gold);color:#4A2C00}
.b2-tower{position:absolute!important;left:10px;bottom:34px;width:58px;padding:0!important;z-index:2}
.b2-tower svg{display:block;width:100%}
.b2-tower .pulley{transform-box:fill-box;transform-origin:center;animation:b2-spin 1.4s linear infinite}
.b2-tower.idle .pulley{animation-play-state:paused}
@keyframes b2-tap{0%,100%{transform:translateY(0)}50%{transform:translateY(7px) scale(.92)}}
.b2-plot .b2-sign .sp{cursor:pointer}
.b2-stat > div{display:flex;align-items:baseline;gap:8px;padding:8px 0;border-bottom:1px solid rgba(59,31,23,.1);font:700 14px var(--round);font-variant-numeric:tabular-nums}
.b2-stat > div > span:first-child{flex:1;color:var(--ink2)}
.b2-stat b{font-weight:900}.b2-stat .up2{color:var(--up2)}.b2-stat .ar{color:var(--ink3)}
.b2-seg.light{background:rgba(59,31,23,.08);margin-top:12px}
.b2-seg.light button{color:var(--ink2)!important}
.b2-seg.light button.on{background:#fff!important;color:var(--ink)!important;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.b2-boss{display:flex;align-items:center;gap:10px;margin-top:14px;background:#FFF0C8;border-radius:14px;padding:10px 12px}
.b2-boss .f{font-size:30px}.b2-boss .sp{flex:1;min-width:0}
.b2-boss b{display:block;font:900 14.5px var(--round)}
.b2-boss span{display:block;font:600 12.5px/1.35 var(--round);color:var(--ink2)}
.b2-boss.on{background:#DDF3E2}

/* la coupe de terrain */
.b2-shaft{position:relative;padding:10px 10px 12px 74px}
.b2-rail{position:absolute!important;left:12px;top:0;bottom:0;width:50px;padding:0!important}
.b2-rail::before,.b2-rail::after{content:"";position:absolute;top:0;bottom:0;width:7px;background:linear-gradient(90deg,#8C5A30,#5E3517);border-radius:3px}
.b2-rail::before{left:2px}.b2-rail::after{right:2px}
.b2-rail .rope{position:absolute;left:24px;top:0;width:2px;height:var(--rope,40px);background:#3E220F}
.b2-cab{position:absolute;left:2px;top:4px;width:46px;height:44px;will-change:transform;z-index:2}
.b2-cab .ld{position:absolute;left:50%;top:-16px;transform:translateX(-50%);background:var(--ink);color:#FFE6B8;border-radius:7px;padding:1px 5px;font:900 11px var(--round);transition:opacity .2s;white-space:nowrap;z-index:2}

.b2-cab svg{display:block;width:100%}
.b2-elev{margin:0 0 10px -62px}
.b2-plot{position:relative;margin-bottom:12px;border-radius:14px;background:var(--soil,#8A5A33);box-shadow:inset 0 2px 0 rgba(255,255,255,.08),0 2px 0 rgba(0,0,0,.25)}
.b2-plot .art{position:relative;display:block;width:100%;height:124px;border-radius:14px 14px 0 0;overflow:hidden}
.b2-plot .art svg{display:block;width:100%;height:100%}
.b2-plot.idle .art svg *{animation-play-state:paused!important}
.b2-plot .b2-sign{margin:6px 8px 8px}
@keyframes b2-hint{50%{transform:scale(1.07)}}
.b2-path{position:absolute;left:0;right:0;bottom:0;height:30px;background:linear-gradient(#B98552,#9C6A3B);border-top:2px solid rgba(255,255,255,.25);box-shadow:inset 0 3px 4px rgba(0,0,0,.15)}
.b2-plot .pend{position:absolute;left:2px;bottom:2px;width:46px;text-align:center;z-index:3;pointer-events:none}
.b2-plot .pend svg{display:block;width:44px;margin:0 auto}
.b2-plot .pend .b2-tag{position:relative;top:-2px}
.b2-plot .pend .b2-tag.warn{animation:b2-blink 1s infinite}
.b2-wk{position:absolute;bottom:4px;left:66%;width:40px;margin-left:-20px;pointer-events:none;z-index:4;text-align:center}
.b2-wk .who{display:block;width:40px;height:58px;filter:drop-shadow(0 2px 1px rgba(0,0,0,.2))}
.b2-wk .who svg{width:100%;height:100%;display:block}
.b2-wk .carry{position:absolute;left:50%;top:-20px;transform:translateX(-50%);font-size:24px;display:none;filter:drop-shadow(0 2px 1px rgba(0,0,0,.3))}
.b2-wk.go .carry{display:block}
.b2-wk .carry{top:-4px!important;font-size:26px!important;z-index:2}
.b2-wk.go .who{transform:scaleX(1)}
.b2-wk.back .who{transform:scaleX(-1)}
.b2-wk .bar{position:absolute;left:2px;right:2px;top:-12px;height:7px;border-radius:9px;background:rgba(59,31,23,.45);overflow:hidden;opacity:0;transition:opacity .15s}
.b2-wk .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#9BE07A,#3FAF4E);border-radius:9px}
.b2-wk.work .bar{opacity:1}
.b2-wk.go .who svg,.b2-wk.back .who svg{animation:b2-walk .32s ease-in-out infinite alternate}
.b2-call{display:none;position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);white-space:nowrap;background:#fff;color:var(--ink);border-radius:999px;padding:4px 10px;font:900 13px var(--round);box-shadow:0 3px 10px rgba(0,0,0,.25);animation:b2-hint 1.2s ease-in-out infinite;pointer-events:none;z-index:6}
.b2-call::after{content:"";position:absolute;left:50%;top:100%;margin-left:-6px;border:6px solid transparent;border-top-color:#fff}
.b2-wk.tap .b2-call{display:block}
.b2-wk.tap .who{animation:b2-hint 1.2s ease-in-out infinite}
.b2-wk.tap::before{content:"";position:absolute;left:50%;bottom:-2px;width:46px;height:14px;margin-left:-23px;border-radius:50%;background:rgba(255,224,138,.8);animation:b2-blink 1.1s infinite}
.b2-call.up{display:block}
.b2-tower .b2-call{left:50%;bottom:auto;top:-30px}
.b2-cart .b2-call{bottom:calc(100% + 18px)}
.b2-good{position:fixed;z-index:94;font-size:20px;pointer-events:none;animation:b2-good .8s cubic-bezier(.4,0,.3,1) forwards}
@keyframes b2-good{0%{transform:translate(0,0) scale(.7);opacity:0}15%{opacity:1;transform:translate(0,-10px) scale(1.1)}100%{transform:translate(var(--dx),var(--dy)) scale(.8);opacity:.6}}
.b2-ic{display:inline-block;width:1.2em;height:1.2em;vertical-align:-.25em;font-style:normal;line-height:0}
.b2-ic svg,.b2-face svg{display:block;width:100%;height:100%}
.b2-face{display:inline-block;width:1.25em;height:1.25em;vertical-align:-.3em;font-style:normal;line-height:0;border-radius:50%;background:#FFF4E0;overflow:hidden}
.b2-person .lg,.b2-person .ar{transform-box:fill-box;transform-origin:50% 8%}
.b2-wk.go .lg.l,.b2-wk.back .lg.l,.b2-cart.mv .lg.l{animation:b2-leg .32s ease-in-out infinite alternate}
.b2-wk.go .lg.r,.b2-wk.back .lg.r,.b2-cart.mv .lg.r{animation:b2-leg .32s ease-in-out infinite alternate-reverse}
.b2-wk.go .ar.l,.b2-wk.back .ar.l{animation:b2-arm .32s ease-in-out infinite alternate-reverse}
.b2-wk.back .ar.r{animation:b2-arm .32s ease-in-out infinite alternate}
.b2-wk.work .ar.r{animation:b2-fork .4s ease-in-out infinite alternate}
.b2-wk.work .ar.l{animation:b2-arm .4s ease-in-out infinite alternate}
.b2-cart.mv .ar{animation:none;transform:rotate(-55deg)}
.b2-cart .ar{transform:rotate(-55deg)}
@keyframes b2-leg{from{transform:rotate(-22deg)}to{transform:rotate(22deg)}}
@keyframes b2-arm{from{transform:rotate(-25deg)}to{transform:rotate(25deg)}}
@keyframes b2-fork{from{transform:rotate(-10deg)}to{transform:rotate(-60deg)}}
.b2-point{position:absolute;width:34px;height:40px;pointer-events:none;z-index:8;display:none;filter:drop-shadow(0 3px 3px rgba(0,0,0,.35))}
.b2-point.on{display:block;animation:b2-poke .9s ease-in-out infinite}
.b2-point svg{display:block;width:100%;height:100%}
@keyframes b2-poke{0%,100%{transform:translate(0,0)}50%{transform:translate(-5px,-9px)}}
.b2-wk .b2-point{left:22px;top:20px}
.b2-tower .b2-point{left:40px;top:40px}
.b2-cart .b2-point{left:44px;top:6px}
.b2-sellbtn .b2-point{left:auto;right:-26px;top:16px}
.b2-sign .b2-point{left:28px;top:22px}
.b2-up{width:14px;height:14px;margin-right:2px;flex:none}
.b2-btn small{font-size:11px;margin-right:3px;opacity:.85}
.b2-lv{position:absolute;left:-6px;top:-7px;min-width:26px;height:26px;padding:0 5px;border-radius:13px;background:var(--ink);color:#FFE6B8;display:grid;place-items:center;font:900 13px var(--round);box-shadow:0 2px 0 rgba(0,0,0,.25);z-index:2}
.b2-rate{display:inline-flex;align-items:center;gap:3px;font:900 17px var(--round);font-variant-numeric:tabular-nums;color:var(--ink)}
.b2-rate .b2-ic{font-size:20px}
.b2-rate small{font-size:12px;color:var(--ink2)}
.b2-seat.hire{position:relative;width:44px;height:44px;border-radius:50%!important;border:2.5px dashed var(--wood2)!important;background:rgba(255,244,224,.6)!important;padding:0!important;display:grid;place-items:center;flex:none;margin-bottom:8px}
.b2-seat.hire .b2-face{width:36px;height:36px;filter:saturate(.35) opacity(.75);background:transparent}
.b2-seat.hire > i:not(.b2-face){position:absolute;left:50%;bottom:-10px;transform:translateX(-50%);display:flex;align-items:center;white-space:nowrap;background:var(--gold);color:#4A2C00;border-radius:7px;padding:1px 5px;font:900 10.5px var(--round);font-style:normal;box-shadow:0 2px 0 var(--gold2)}
.b2-seat.hire > i:not(.b2-face) .b2-coin{width:10px;height:10px;margin-right:2px}
.b2-seat.hire.can{animation:b2-call 1.4s ease-in-out infinite}
.b2-seat.hire.can .b2-face{filter:none}
.b2-seat.on{width:44px!important;height:44px!important;overflow:hidden}
.b2-seat.on .b2-face{width:100%;height:100%}
.b2-locked .lock{display:block;width:40px;height:44px;margin:0 auto 8px}
.b2-locked .lock svg{display:block;width:100%;height:100%}
.b2-locked.palier{border-color:var(--gold)}
.b2-cr{display:inline-block;width:1.3em;height:1em;vertical-align:-.12em}
.b2-crown{display:flex;align-items:center;gap:5px;height:38px;padding:0 11px 0 8px!important;border-radius:999px!important;background:#2E1A0C!important;color:#FFE6B8!important;font:900 15px var(--round)!important;box-shadow:inset 0 2px 3px rgba(0,0,0,.4),0 0 0 2px #C98A12;flex:none}
.b2-crown .c{display:block;line-height:0}
.b2-crown .c .b2-cr{width:24px;height:18px}
.b2-crown.top{background:linear-gradient(#F6C543,#E0A020)!important;color:#4A2C00!important;box-shadow:0 0 0 2px #FFE08A,0 0 14px rgba(246,197,67,.7)}
.b2-throne{text-align:center;background:radial-gradient(circle at 50% 30%,#7A3A22,#3B1F17);color:#FFE6B8;border-radius:18px;padding:18px 14px 16px;margin:4px 0 10px;box-shadow:0 4px 0 #22100A}
.b2-throne .c{display:block;width:72px;margin:0 auto 4px;animation:b2-hint 2.4s ease-in-out infinite}
.b2-throne .c .b2-cr{width:72px;height:54px}
.b2-throne small{display:block;font:800 13px var(--round);opacity:.8}
.b2-throne b{display:block;font:400 italic 38px/1.05 var(--disp);color:#fff;margin:2px 0 4px}
.b2-throne .f{font:900 18px var(--round);font-variant-numeric:tabular-nums}
.b2-chase{text-align:center;background:#FFF0C8;border-radius:12px;padding:9px;font:800 14px var(--round);margin-bottom:6px}
.b2-chase b{font-weight:900}
.b2-chase.win{background:#DDF3E2;color:var(--up2)}
.b2-rk .n .b2-cr{width:22px;height:17px}
.b2-baron .crown .b2-cr{width:46px;height:35px}
.b2-gate{position:relative;border-radius:16px;overflow:hidden;background:#4A2E19;padding:14px 12px;min-height:120px;display:grid;place-items:center;box-shadow:inset 0 0 0 3px var(--gold)}
.b2-gate .b2-fence{position:absolute;inset:auto 0 0 0;width:100%;height:70px;opacity:.9}
.b2-gate .in{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:8px;width:100%}
.b2-gn{background:var(--gold);color:#4A2C00;border-radius:8px;padding:2px 10px;font:900 14px var(--round)}
.b2-gbar.big{position:relative;width:86%;height:24px;border-radius:12px;background:rgba(0,0,0,.45);box-shadow:inset 0 2px 3px rgba(0,0,0,.4)}
.b2-gbar.big i{background:linear-gradient(90deg,#F6C543,#F2873B);border-radius:12px}
.b2-gbar.big.work i{background:linear-gradient(90deg,#7DCB8F,#2F9E57)}
.b2-gbar.big span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:4px;color:#fff;font:900 13px var(--round);text-shadow:0 1px 2px rgba(0,0,0,.6);font-variant-numeric:tabular-nums}
.b2-gate .b2-btn .dur{display:inline-flex;align-items:center;gap:3px;margin-left:6px;padding-left:8px;border-left:1.5px solid rgba(74,44,0,.3);font-size:13px}
.b2-clk{width:15px;height:15px;flex:none}
.b2-workers{display:flex;gap:6px;font-size:30px}
.b2-workers .b2-face{animation:b2-walk .35s ease-in-out infinite alternate}
.b2-workers .b2-face:nth-child(2){animation-delay:-.12s}.b2-workers .b2-face:nth-child(3){animation-delay:-.24s}
.b2-plvl{position:absolute;left:8px;top:8px;background:rgba(59,31,23,.82);color:#FFE6B8;border-radius:9px;padding:3px 8px;font:800 11.5px var(--round);pointer-events:none}
.b2-plvl b{font-size:15px;font-weight:900}
.b2-plot .runbar{position:absolute;left:0;top:0;height:4px;border-radius:14px 0 0 0;background:#FFE08A;transition:width .25s linear}
.b2-plot.lvlup::after{content:"";position:absolute;inset:0;border-radius:14px;box-shadow:inset 0 0 0 3px #FFE08A;animation:b2-ring .7s ease-out forwards;pointer-events:none}
@keyframes b2-ring{from{box-shadow:inset 0 0 0 3px #FFE08A,0 0 0 0 rgba(255,224,138,.8)}to{box-shadow:inset 0 0 0 0 #FFE08A,0 0 0 18px rgba(255,224,138,0)}}
.b2-locked{position:relative;border-radius:14px;padding:16px 12px;text-align:center;color:#F5E4CC;background:repeating-linear-gradient(135deg,rgba(0,0,0,.12) 0 10px,transparent 10px 20px),#4A2E19;border:2px dashed rgba(245,228,204,.35)}
.b2-locked h3{margin:2px 0 4px;font:400 italic 22px var(--disp)}
.b2-locked p{margin:0 0 10px;font:600 13px/1.35 var(--round);color:rgba(245,228,204,.75)}
.b2-locked .palier{display:inline-block;background:var(--gold);color:#4A2C00;border-radius:6px;padding:1px 8px;font:900 11.5px var(--round);margin-bottom:4px}
.b2-deep{height:40px;background:linear-gradient(#3B2414,#2A190D)}

/* barre d'actions flottante */
#b2-dock{position:relative;height:0;z-index:6}
.b2-dock{position:absolute;left:0;right:0;bottom:0;z-index:4;pointer-events:none;padding:0 12px 10px}
.b2-dock .b2-col{display:flex;gap:8px;justify-content:center}
.b2-dock button{pointer-events:auto}
.b2-act{display:flex;align-items:center;gap:6px;border-radius:999px!important;padding:11px 16px;font:900 15px var(--round)!important;background:#FFF4E0!important;color:var(--ink)!important;box-shadow:0 4px 0 #B98A57,0 8px 18px rgba(0,0,0,.25)}
.b2-act:active{transform:translateY(2px)}
.b2-act.main{background:var(--gold)!important;color:#4A2C00!important;box-shadow:0 4px 0 var(--gold2),0 8px 18px rgba(0,0,0,.25)}
.b2-act.cool{opacity:.7}
.b2-act .t{font-variant-numeric:tabular-nums;font-size:13px;opacity:.75}
.b2-act.on{background:#BDE7FF!important;box-shadow:0 4px 0 #6FB4DA,0 8px 18px rgba(0,0,0,.25)}

/* animations des décors */
.b2-sway{transform-box:fill-box;transform-origin:50% 100%;animation:b2-sway 2.6s ease-in-out infinite}
@keyframes b2-sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
.b2-peck{transform-box:fill-box;transform-origin:30% 90%;animation:b2-peck 1.6s ease-in-out infinite}
@keyframes b2-peck{0%,60%,100%{transform:rotate(0)}70%,85%{transform:rotate(22deg)}}
.b2-chew{transform-box:fill-box;transform-origin:20% 30%;animation:b2-chew 2.2s ease-in-out infinite}
@keyframes b2-chew{0%,100%{transform:rotate(0)}50%{transform:rotate(7deg)}}
.b2-ripe{transform-box:fill-box;transform-origin:center;animation:b2-ripe 3s ease-in-out infinite}
@keyframes b2-ripe{0%,100%{transform:scale(.75)}50%{transform:scale(1.08)}}
.b2-bee{animation:b2-bee 3.2s linear infinite}
@keyframes b2-bee{0%{transform:translate(0,0)}25%{transform:translate(14px,-8px)}50%{transform:translate(26px,2px)}75%{transform:translate(10px,8px)}100%{transform:translate(0,0)}}
.b2-chop{transform-box:fill-box;transform-origin:90% 90%;animation:b2-chop 1.1s ease-in infinite}
@keyframes b2-chop{0%,100%{transform:rotate(-40deg)}55%{transform:rotate(18deg)}65%{transform:rotate(10deg)}}
.b2-grow{transform-box:fill-box;transform-origin:50% 100%;animation:b2-grow 5s ease-out infinite}
@keyframes b2-grow{0%{transform:scaleY(.55)}70%,100%{transform:scaleY(1)}}
@media (prefers-reduced-motion:reduce){.b2-wrap *,.b2-wrap *::before{animation-duration:0s!important;animation-iteration-count:1!important}}

/* ======== GRANGE (intérieur en planches) ======== */
.b2-barnin{background:repeating-linear-gradient(90deg,#C88D57 0 46px,#BE8350 46px 48px,#C48A55 48px 94px,#B67B48 94px 96px);min-height:100%}
.b2-h2{margin:0 0 8px;font:400 italic 28px/1.05 var(--disp);color:var(--ink)}
.b2-h2 small{display:block;font:700 13px var(--round);font-style:normal;color:var(--ink2);margin-top:3px}
.b2-paper{background:var(--paper);border-radius:16px;padding:14px;box-shadow:0 3px 0 rgba(124,74,36,.35),0 8px 20px rgba(59,31,23,.12)}
.b2-paper + .b2-paper{margin-top:14px}
.b2-cap{display:flex;align-items:center;gap:10px}
.b2-cap .b2-gbar{flex:1;height:16px}
.b2-cap b{font:900 15px var(--round);font-variant-numeric:tabular-nums}
.b2-stock{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:4px}
.b2-tile{position:relative;background:#FFFAF1;border-radius:14px;padding:10px 6px 8px;text-align:center;box-shadow:0 2px 0 rgba(124,74,36,.25)}
.b2-tile .ic{font-size:30px;line-height:1.1}
.b2-tile b{display:block;font:900 16px var(--round);font-variant-numeric:tabular-nums;margin-top:2px}
.b2-tile small{display:block;font:700 11.5px var(--round);color:var(--ink2)}
.b2-tile.mine{background:#FFF0C8;box-shadow:0 0 0 2.5px var(--gold),0 2px 0 rgba(124,74,36,.25)}
.b2-tile.mine::after{content:"Ta spécialité";position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:var(--gold);color:#4A2C00;border-radius:6px;padding:1px 6px;font:900 9.5px var(--round);white-space:nowrap}
.b2-tile.zero{opacity:.5}
.b2-oven{display:flex;gap:12px;align-items:flex-end}
.b2-oven .art{width:120px;flex:none}
.b2-oven .art svg{display:block;width:100%}
.b2-flame{transform-box:fill-box;transform-origin:50% 100%;animation:b2-flame .5s ease-in-out infinite alternate}
@keyframes b2-flame{from{transform:scale(.85,.8)}to{transform:scale(1.05,1.12)}}
.b2-oven.cold .b2-flame{display:none}
.b2-slots{display:grid;gap:8px;margin-top:10px}
.b2-slot{display:flex;align-items:center;gap:10px;background:#FFFAF1;border-radius:12px;padding:8px 10px;box-shadow:0 2px 0 rgba(124,74,36,.2)}
.b2-slot .ic{font-size:26px}
.b2-slot .sp{flex:1;min-width:0}
.b2-slot b{font:800 14px var(--round)}
.b2-slot .pb{height:8px;border-radius:999px;background:rgba(59,31,23,.12);margin-top:5px;overflow:hidden}
.b2-slot .pb i{display:block;height:100%;background:linear-gradient(90deg,#F6C543,#F2873B);border-radius:999px}
.b2-slot .t{font:800 12px var(--round);color:var(--ink2);font-variant-numeric:tabular-nums}
.b2-slot.free{background:transparent;border:2px dashed rgba(124,74,36,.35);box-shadow:none;color:var(--ink2);font:700 13px var(--round)}
.b2-rec{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid rgba(124,74,36,.15)}
.b2-rec:first-of-type{border-top:0}
.b2-rec .ic{font-size:30px;width:38px;text-align:center}
.b2-rec .sp{flex:1;min-width:0}
.b2-rec b{font:800 15px var(--round)}
.b2-ing{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.b2-ing span{border-radius:7px;padding:2px 6px;font:800 11.5px var(--round);font-variant-numeric:tabular-nums}
.b2-ing .ok{background:#DDF3E2;color:var(--up2)}
.b2-ing .ko{background:#FBE0DA;color:var(--down)}
.b2-note{font:600 13px/1.4 var(--round);color:var(--ink2);margin:6px 0 0}
.b2-teaser{display:flex;gap:10px;align-items:center;border:2px dashed rgba(59,31,23,.25);border-radius:14px;padding:12px;font:700 13.5px/1.35 var(--round);color:var(--ink2)}
.b2-teaser .i{font-size:26px;filter:grayscale(.6)}

/* ======== MARCHÉ (le tableau à la craie) ======== */
.b2-board{background:var(--board);color:var(--chalk);min-height:100%;background-image:radial-gradient(rgba(255,255,255,.035) 1px,transparent 1px);background-size:6px 6px}
.b2-pills{display:flex;gap:6px;overflow-x:auto;padding:12px 16px 4px;scrollbar-width:none}
.b2-pills::-webkit-scrollbar{display:none}
.b2-chip{flex:none;display:flex;flex-direction:column;align-items:flex-start;gap:1px;background:var(--board2)!important;border-radius:12px;padding:7px 10px;color:var(--chalk)!important;min-width:76px;box-shadow:inset 0 0 0 1px rgba(239,234,219,.12)}
.b2-chip.on{box-shadow:inset 0 0 0 2px var(--chalk)}
.b2-chip .n{font:800 13px var(--round)}
.b2-chip .p{font:900 13px var(--round);font-variant-numeric:tabular-nums}
.b2-chip .c{font:800 11px var(--round);font-variant-numeric:tabular-nums}
.b2-tr{font:900 11px var(--round)}.b2-tr.up{color:var(--up)}.b2-tr.down{color:var(--down)}.b2-board .b2-tr.up{color:#6EE09A}.b2-board .b2-tr.down{color:#FF8A70}
.up{color:#6EE09A}.down{color:#FF8A70}.flat{color:var(--chalk2)}
.b2-quote{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;padding:8px 0 2px}
.b2-quote .big{font:900 40px/1 var(--round);font-variant-numeric:tabular-nums;letter-spacing:-.5px}
.b2-quote .big .b2-coin{width:26px;height:26px;vertical-align:2px}
.b2-quote .ch{font:900 16px var(--round);margin-left:6px}
.b2-quote .lim{text-align:right;font:700 12px/1.45 var(--round);color:var(--chalk2)}
.b2-quote .lim b{color:var(--chalk)}
.b2-seg{display:flex;gap:4px;background:rgba(0,0,0,.2);border-radius:10px;padding:3px;margin-top:10px}
.b2-seg button{flex:1;padding:6px;border-radius:8px;font:800 13px var(--round)!important;color:var(--chalk2)!important}
.b2-seg button.on{background:var(--board2)!important;color:var(--chalk)!important}
.b2-chart{margin-top:8px;background:rgba(0,0,0,.14);border-radius:12px;padding:6px 4px 2px}
.b2-chart svg{display:block;width:100%;height:170px}
.b2-two{display:flex;gap:8px;margin-top:12px}
.b2-two .b2-btn{flex:1;padding:12px}
.b2-h3{margin:18px 0 6px;font:400 italic 23px var(--disp);color:var(--chalk)}
.b2-book{border-radius:12px;overflow:hidden;background:rgba(0,0,0,.14)}
.b2-ord{display:flex;align-items:center;gap:8px;padding:9px 10px;border-top:1px solid rgba(239,234,219,.08);font:700 14px var(--round);font-variant-numeric:tabular-nums}
.b2-ord:first-child{border-top:0}
.b2-ord .who{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.b2-ord .who small{display:block;font-size:11.5px;color:var(--chalk2)}
.b2-ord .q{width:62px;text-align:right;color:var(--chalk2)}
.b2-ord .pr{width:64px;text-align:right;font-weight:900}
.b2-ord.res{background:rgba(242,179,61,.1)}
.b2-ord.me .who{color:var(--gold)}
.b2-ord .b2-btn{padding:6px 10px;font-size:13px!important}
.b2-empty{padding:14px;text-align:center;font:700 13.5px/1.4 var(--round);color:var(--chalk2)}
.b2-hist .b2-ord{font-size:12.5px;padding:7px 10px}

/* ======== VILLAGE (tableau d'affichage) ======== */
.b2-vil{background:#C9A06A;min-height:100%;background-image:radial-gradient(rgba(59,31,23,.09) 1.5px,transparent 1.5px);background-size:14px 14px}
.b2-clock{display:inline-flex;align-items:center;gap:6px;background:var(--ink);color:#FFE6B8;border-radius:999px;padding:5px 11px;font:800 13px var(--round);font-variant-numeric:tabular-nums}
.b2-notes{display:grid;gap:12px;margin-top:10px}
.b2-order{position:relative;background:var(--paper);border-radius:6px 6px 14px 14px;padding:14px 12px 12px;box-shadow:0 3px 0 rgba(124,74,36,.35),0 8px 18px rgba(59,31,23,.15)}
.b2-order:nth-child(odd){transform:rotate(-.6deg)}.b2-order:nth-child(even){transform:rotate(.5deg)}
.b2-order::before{content:"";position:absolute;top:-6px;left:50%;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#F28A72,#B8341F);box-shadow:0 2px 3px rgba(0,0,0,.3)}
.b2-order .hd{display:flex;align-items:center;gap:10px}
.b2-order .face{width:44px;height:44px;border-radius:50%;background:#FBE3D3;display:grid;place-items:center;font-size:26px;flex:none}
.b2-order .hd .sp{flex:1;min-width:0}
.b2-order .who{font:400 italic 19px/1.05 var(--disp)}
.b2-order .want{font:800 14px var(--round);color:var(--ink)}
.b2-order .prime{text-align:right;font:900 16px var(--round);color:var(--up2);font-variant-numeric:tabular-nums;white-space:nowrap}
.b2-order .prime small{display:block;font:700 11px var(--round);color:var(--ink2)}
.b2-order .pb{height:10px;border-radius:999px;background:rgba(59,31,23,.12);margin:10px 0 8px;overflow:hidden}
.b2-order .pb i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#7DCB8F,#2F9E57)}
.b2-order .ft{display:flex;align-items:center;gap:8px;font:700 12.5px var(--round);color:var(--ink2);font-variant-numeric:tabular-nums}
.b2-order .ft .sp{flex:1}
.b2-order.done{opacity:.6}
.b2-order.big{background:linear-gradient(#FFF1CC,#FFE3A3);box-shadow:0 0 0 2px var(--gold),0 3px 0 var(--gold2),0 8px 18px rgba(59,31,23,.18);padding-top:22px}
.b2-bigtag{position:absolute;top:-10px;left:12px;background:var(--ink);color:#FFE6B8;border-radius:999px;padding:3px 10px;font:800 11px var(--round)}
.b2-ann{margin-top:10px;background:var(--ink);color:#FFE6B8;border-radius:14px;padding:10px 12px;font:700 13.5px var(--round)}
.b2-ann b{color:#fff}
.b2-order .prime.lost{color:var(--ink2)}
.b2-order.done .stamp.lost{border-color:var(--red);color:var(--red)}.b2-ann small{display:block;font-weight:700;font-size:11.5px;opacity:.75;margin-top:2px}
.b2-full{display:flex;align-items:center;gap:8px;margin-top:8px;background:var(--paper2);border-radius:12px;padding:8px 12px;font:800 13px var(--round);color:var(--ink2);font-variant-numeric:tabular-nums}
.b2-full .sp{flex:1}.b2-full.ok{background:#DDF3E2;color:var(--up2)}
.b2-order.done .stamp{position:absolute;right:14px;bottom:12px;top:auto;transform:rotate(-12deg);border:3px solid var(--up);color:var(--up);border-radius:8px;padding:2px 8px;font:900 15px var(--round)}
.b2-baron{position:relative;margin-top:18px;background:linear-gradient(135deg,#3B1F17,#6B2E1F);color:#FFE6B8;border-radius:18px;padding:16px;display:flex;align-items:center;gap:12px;box-shadow:0 4px 0 #22100A}
.b2-baron .crown{font-size:38px;animation:b2-hint 2.4s ease-in-out infinite}
.b2-baron .sp{flex:1}
.b2-baron small{font:800 12px var(--round);opacity:.8}
.b2-baron b{display:block;font:400 italic 27px/1 var(--disp);color:#fff;margin:2px 0}
.b2-baron .f{font:900 15px var(--round);font-variant-numeric:tabular-nums}
.b2-rank{margin-top:10px}
.b2-rk{display:flex;align-items:center;gap:10px;padding:9px 6px;border-top:1px solid rgba(124,74,36,.15);font:700 14px var(--round)}
.b2-rk:first-child{border-top:0}
.b2-rk .n{width:22px;text-align:center;font-weight:900;color:var(--ink2)}
.b2-rk .ic{font-size:20px}
.b2-rk .sp{flex:1;min-width:0}
.b2-rk .sp small{display:block;font-size:11.5px;color:var(--ink2);font-weight:700}
.b2-rk .f{font-weight:900;font-variant-numeric:tabular-nums}
.b2-rk.me{background:#FFF0C8;border-radius:10px;border-top-color:transparent}
.b2-titles{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
.b2-ttl{background:#FFFAF1;border-radius:12px;padding:9px 10px;box-shadow:0 2px 0 rgba(124,74,36,.2)}
.b2-ttl .i{font-size:20px}
.b2-ttl b{display:block;font:800 12px var(--round);color:var(--ink2)}
.b2-ttl span{display:block;font:900 14px var(--round)}

/* ======== Choix de la spécialité ======== */
.b2-pick{background:linear-gradient(var(--sky1),var(--sky2) 40%,#F3E3C7 70%);min-height:100%}
.b2-pick h1{margin:6px 0 4px;font:400 italic 44px/1 var(--disp)}
.b2-pick p{margin:0 0 12px;font:600 14.5px/1.45 var(--round);color:var(--ink2)}
.b2-specs{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.b2-spec{display:flex;flex-direction:column;border-radius:16px!important;overflow:hidden;background:var(--paper)!important;box-shadow:0 3px 0 rgba(124,74,36,.35);text-align:left;padding:0!important}
.b2-spec .art{height:70px;background:#8A5A33}
.b2-spec .art svg{display:block;width:100%;height:100%}
.b2-spec .tx{padding:8px 10px 10px}
.b2-spec b{display:block;font:900 16px var(--round)}
.b2-spec small{display:block;font:700 12px var(--round);color:var(--ink2)}
.b2-spec.on{box-shadow:0 0 0 3px var(--up),0 3px 0 rgba(124,74,36,.35)}
.b2-spec[disabled]{opacity:.55}
.b2-spec[disabled] .art{filter:grayscale(.8)}

/* feuille (quantités, détails) */
.b2-sheetbg{position:absolute;inset:0;z-index:20;background:rgba(30,16,8,.45);display:flex;align-items:flex-end;animation:b2-fade .2s}
@keyframes b2-fade{from{opacity:0}}
.b2-sheet{width:100%;max-width:520px;margin:0 auto;background:var(--paper);border-radius:22px 22px 0 0;padding:10px 18px calc(env(safe-area-inset-bottom,0px) + 18px);animation:b2-rise .28s cubic-bezier(.2,.9,.3,1);max-height:85%;overflow-y:auto}
@keyframes b2-rise{from{transform:translateY(100%)}}
.b2-sheet .grab{width:40px;height:5px;border-radius:99px;background:rgba(59,31,23,.2);margin:0 auto 10px}
.b2-sheet h3{margin:0 0 4px;font:400 italic 26px var(--disp)}
.b2-sheet p{margin:0 0 10px;font:600 14px/1.4 var(--round);color:var(--ink2)}
.b2-qty{display:flex;align-items:center;gap:10px;margin:8px 0}
.b2-qty input[type=range]{flex:1;accent-color:var(--up)}
.b2-qty .v{min-width:70px;text-align:right;font:900 18px var(--round);font-variant-numeric:tabular-nums}
.b2-quick{display:flex;gap:6px;margin-bottom:10px}
.b2-quick button{flex:1;background:rgba(59,31,23,.07)!important;border-radius:10px;padding:7px;font:800 13px var(--round)!important}
.b2-field{display:flex;align-items:center;gap:8px;background:#fff;border-radius:12px;padding:8px 12px;margin:6px 0 4px;box-shadow:inset 0 0 0 1.5px rgba(59,31,23,.15)}
.b2-field input{flex:1;border:0;outline:0;background:none;font:900 20px var(--round);color:var(--ink);width:100%;font-variant-numeric:tabular-nums}
.b2-sum{display:flex;justify-content:space-between;font:800 14.5px var(--round);margin:10px 0;font-variant-numeric:tabular-nums}
.b2-toast{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 200px);transform:translate(-50%,-20px);opacity:0;transition:transform .4s cubic-bezier(.2,1.3,.4,1),opacity .3s;z-index:30;
  background:var(--ink);color:#FFF3DE;font:800 14px var(--round);border-radius:999px;padding:10px 16px;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:calc(100% - 32px);text-align:center;pointer-events:none}
.b2-toast.on{transform:translate(-50%,0);opacity:1}
.b2-toast.gold{background:#5C3A00;color:#FFE6A8}
.b2-toast.err{background:var(--red2)}
.b2-load{display:grid;place-items:center;height:100%;font:800 15px var(--round);color:var(--ink2)}
.b2-tip{display:flex;gap:10px;align-items:flex-start;background:#FFF9EA;border-radius:14px;padding:10px 12px;margin:10px 10px 0;box-shadow:0 3px 0 rgba(124,74,36,.3);font:700 13.5px/1.4 var(--round);color:var(--ink)}
.b2-tip .i{font-size:22px;line-height:1}
.b2-tip button{margin-left:auto;font-size:18px!important;color:var(--ink2)!important;padding:0 2px}
/* ---------- Petits écrans (iPhone SE, zoom d'affichage : 320 px) ---------- */
.b2-hud .b2-col{min-width:0}
.b2-pill{flex:none;white-space:nowrap}
.b2-stn{width:calc(50% - 12px)!important;max-width:210px;min-width:0}
.b2-stn > .b2-btn{min-width:0;overflow:hidden;white-space:nowrap}
.b2-sign .row > .b2-btn{flex:none;white-space:nowrap}
.b2-rate{white-space:nowrap}
.b2-scroll.dockpad{padding-bottom:76px}
.b2-quote{flex-wrap:wrap}
.b2-quote .ch{white-space:nowrap}
.b2-scroll{overflow-x:hidden}
.b2-oven > div{min-width:0}
.b2-oven .b2-btn{max-width:100%;white-space:normal;display:inline-flex;flex-wrap:wrap;justify-content:center;align-items:center;column-gap:6px;row-gap:2px}
.b2-paper{min-width:0;max-width:100%;box-sizing:border-box}
.b2-barnrow{flex-wrap:wrap}
@media (max-width:420px){
  .b2-hud{padding-left:8px;padding-right:8px}
  .b2-hud .b2-col{gap:5px}
  .b2-hbtn{width:32px;height:32px;font-size:17px!important}
  .b2-pill{font-size:14px;padding:4px 9px 4px 4px;gap:4px}
  .b2-pill .b2-coin{width:18px;height:18px}.b2-pill .b2-e{font-size:15px}
  .b2-crown{height:32px;padding:0 8px 0 6px!important;font-size:13px!important}
  .b2-crown .c .b2-cr{width:20px;height:15px}
  .b2-stn{gap:5px!important;padding:9px 6px 7px 10px!important;width:calc(50% - 10px)!important}
  .b2-stn.elev{left:6px}.b2-stn.cart{right:6px}
  .b2-stn > .b2-btn{font-size:12.5px!important;padding:7px 4px}
  .b2-stn .b2-mgr{width:34px;height:34px}
  .b2-sign .row{gap:6px}
  .b2-sign .b2-mgr{width:34px;height:34px}
  .b2-rate{font-size:15px}.b2-rate .b2-ic{font-size:17px}
  .b2-sign .row > .b2-btn{font-size:13px!important;padding:8px 9px}
  .b2-act{padding:9px 13px;font-size:14px!important}
  .b2-quote .big{font-size:32px}
  .b2-quote .lim{text-align:left}
  .b2-rate{font-size:14px;gap:2px}.b2-rate .b2-ic{font-size:15px}.b2-rate small{display:none}
  .b2-oven{flex-wrap:wrap;align-items:center}.b2-oven .art{width:84px}
  .b2-oven .b2-btn{font-size:14px!important}
}
@media (max-width:345px){
  .b2-hud .b2-col{gap:4px}
  .b2-hbtn{width:30px;height:30px}
  .b2-pill{font-size:13px;padding:3px 7px 3px 3px;gap:3px}
  .b2-pill .b2-coin{width:16px;height:16px}.b2-pill .b2-e{font-size:13px}
  .b2-crown{padding:0 6px 0 5px!important;font-size:12px!important;gap:3px}
  .b2-crown .c .b2-cr{width:17px;height:13px}
}
`;

/* =================== Dessins =================== */
const seedR = n => { let a = n * 9301 + 49297; return () => { a = (a * 9301 + 49297) % 233280; return a / 233280; }; };
// le décor d'une parcelle, propre à chaque spécialité ; plus de monde à mesure qu'elle monte de niveau
function plotArt(k, i, lvl){
  const r = seedR(i * 7 + 3), n = Math.min(9, 3 + Math.floor((lvl || 1) / 6));
  const sky = `<rect width="240" height="96" fill="url(#b2s${k})"/>`;
  const grad = { ble:["#FCE7B5","#F4CF7A"], oeufs:["#FCE3C9","#F3C79E"], lait:["#E3F2D8","#C3E2A8"], fruits:["#E6F3D6","#BFE09A"], miel:["#FFF0C7","#F8D98A"], bois:["#D9EDD9","#A9D3A4"] }[k] || ["#eee","#ddd"];
  let g = `<defs><linearGradient id="b2s${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${grad[0]}"/><stop offset="1" stop-color="${grad[1]}"/></linearGradient></defs>${sky}`;
  const ground = c => `<path d="M0 74 Q60 68 120 72 T240 70 V96 H0Z" fill="${c}"/>`;
  if (k === "ble"){
    g += ground("#C79A4E");
    const cnt = 10 + n * 2;
    for (let j = 0; j < cnt; j++){
      const x = 8 + j * (226 / cnt) + r() * 6, h = 34 + r() * 18, d = (r() * 2).toFixed(2);
      g += `<g class="b2-sway" style="animation-delay:-${d}s"><path d="M${x} 78 L${x} ${78 - h}" stroke="#B9862B" stroke-width="2"/>`;
      for (let s = 0; s < 4; s++) g += `<ellipse cx="${x + (s % 2 ? 3 : -3)}" cy="${78 - h + 4 + s * 5}" rx="2.6" ry="5" fill="${s % 2 ? "#E8B53A" : "#F2C94C"}" transform="rotate(${s % 2 ? 25 : -25} ${x} ${78 - h + 4 + s * 5})"/>`;
      g += `<path d="M${x} ${78 - h} l0 -8" stroke="#E8B53A" stroke-width="1.2"/></g>`;
    }
  } else if (k === "oeufs"){
    g += ground("#C9A266") + `<g><rect x="176" y="36" width="52" height="38" fill="#D96C4A"/><path d="M170 38 L202 18 L234 38Z" fill="#8E3B26"/><rect x="194" y="52" width="16" height="22" rx="8" fill="#5B2A1C"/><path d="M180 74 h44" stroke="#7A3320" stroke-width="2"/></g>`;
    g += `<ellipse cx="150" cy="80" rx="16" ry="5" fill="#E7C27A"/><ellipse cx="146" cy="77" rx="4" ry="5" fill="#FFF7EA"/><ellipse cx="154" cy="77.5" rx="4" ry="5" fill="#F5E6CF"/>`;
    for (let j = 0; j < Math.min(6, n); j++){
      const x = 14 + j * 26 + r() * 6, y = 66 + r() * 6, f = j % 2 ? 1 : -1, d = (r() * 1.6).toFixed(2), col = j % 3 === 2 ? "#C9773F" : "#FFFBF2";
      g += `<g transform="translate(${x} ${y}) scale(${f} 1)"><g class="b2-peck" style="animation-delay:-${d}s"><ellipse cx="0" cy="0" rx="11" ry="8" fill="${col}" stroke="#D9C3A0" stroke-width="1"/><path d="M-9 -3 q-6 -6 -3 3" fill="${col}"/><circle cx="8" cy="-8" r="5" fill="${col}"/><path d="M6 -14 q2 -4 4 0 q2 -4 3 1" fill="#D93B2B"/><path d="M12.5 -8 l4 1.5 -4 1.5z" fill="#F2A33A"/><circle cx="9" cy="-9" r=".9" fill="#3B1F17"/></g><path d="M-2 7 v5 M3 7 v5" stroke="#E39A3B" stroke-width="1.5"/></g>`;
    }
  } else if (k === "lait"){
    g += ground("#8DB862") + `<path d="M0 60 H240" stroke="#9A6A3E" stroke-width="2.5"/><path d="M0 68 H240" stroke="#9A6A3E" stroke-width="2.5"/>`;
    for (let x = 6; x < 240; x += 26) g += `<rect x="${x}" y="54" width="4" height="22" fill="#B07D4A"/>`;
    for (let j = 0; j < Math.min(4, Math.ceil(n / 2)); j++){
      const x = 26 + j * 56 + r() * 8, f = j % 2 ? -1 : 1, d = (r() * 2).toFixed(2);
      g += `<g transform="translate(${x} 70) scale(${f} 1)"><rect x="-18" y="-16" width="34" height="18" rx="8" fill="#FFFDF8" stroke="#3B1F17" stroke-width="1"/><ellipse cx="-6" cy="-10" rx="5" ry="4" fill="#3B1F17"/><ellipse cx="8" cy="-4" rx="4" ry="3" fill="#3B1F17"/>
        <path d="M-14 2 v8 M-6 2 v8 M6 2 v8 M12 2 v8" stroke="#3B1F17" stroke-width="2.4"/><ellipse cx="-2" cy="4" rx="4" ry="2.5" fill="#F6B9C4"/>
        <g class="b2-chew" style="animation-delay:-${d}s"><rect x="14" y="-22" width="14" height="13" rx="5" fill="#FFFDF8" stroke="#3B1F17" stroke-width="1"/><rect x="21" y="-14" width="9" height="6" rx="3" fill="#F6B9C4"/><circle cx="19" cy="-18" r="1.2" fill="#3B1F17"/><path d="M15 -22 l-3 -4 M22 -22 l2 -4" stroke="#C9A066" stroke-width="2"/></g></g>`;
    }
  } else if (k === "fruits"){
    g += ground("#86B85A");
    for (let j = 0; j < Math.min(5, Math.ceil(n * .7)); j++){
      const x = 24 + j * 48 + r() * 6, s = .85 + r() * .3;
      g += `<g transform="translate(${x} 76) scale(${s})"><rect x="-3.5" y="-26" width="7" height="26" rx="2" fill="#7C4A24"/><circle cx="0" cy="-36" r="19" fill="#4E9A3E"/><circle cx="-11" cy="-30" r="11" fill="#5FAE4A"/><circle cx="11" cy="-31" r="12" fill="#57A645"/>`;
      for (let a = 0; a < 5; a++){ const ax = -12 + r() * 24, ay = -46 + r() * 22, d = (r() * 3).toFixed(2); g += `<circle class="b2-ripe" style="animation-delay:-${d}s" cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="3.6" fill="#E03B2E"/>`; }
      g += `</g>`;
    }
    g += `<g transform="translate(206 86)"><path d="M-12 -10 h24 l-3 10 h-18z" fill="#B07D4A"/><circle cx="-5" cy="-12" r="4" fill="#E03B2E"/><circle cx="3" cy="-12" r="4" fill="#E9562F"/></g>`;
  } else if (k === "miel"){
    g += ground("#9CC266");
    for (let x = 10; x < 240; x += 18) g += `<g class="b2-sway" style="animation-delay:-${(r()*2).toFixed(2)}s"><path d="M${x} 76 v-9" stroke="#4E8A33" stroke-width="1.5"/><circle cx="${x}" cy="66" r="3" fill="${["#F28AB0","#FFFFFF","#B98AF2","#FFD54A"][Math.floor(r()*4)]}"/></g>`;
    for (let j = 0; j < Math.min(4, Math.ceil(n / 2)); j++){
      const x = 22 + j * 56;
      g += `<g transform="translate(${x} 76)"><rect x="-16" y="-8" width="32" height="8" fill="#7C4A24"/><rect x="-14" y="-22" width="28" height="14" rx="2" fill="#F2B33D"/><rect x="-14" y="-36" width="28" height="14" rx="2" fill="#F6C55A"/><path d="M-18 -36 h36 l-4 -6 h-28z" fill="#B85C2A"/><path d="M-14 -22 h28 M-14 -29 h28" stroke="#C98A12" stroke-width="1"/><rect x="-5" y="-12" width="10" height="3" rx="1.5" fill="#5B3519"/></g>`;
    }
    for (let j = 0; j < 3 + n; j++){ const x = 10 + r() * 200, y = 16 + r() * 40, d = (r() * 3).toFixed(2); g += `<g class="b2-bee" style="animation-delay:-${d}s"><g transform="translate(${x.toFixed(0)} ${y.toFixed(0)})"><ellipse cx="0" cy="0" rx="4" ry="3" fill="#F2B33D"/><path d="M-1 -3 v6 M1.5 -3 v6" stroke="#3B1F17" stroke-width="1.2"/><ellipse cx="-1" cy="-4" rx="3" ry="2" fill="#fff" opacity=".85"/></g></g>`; }
  } else if (k === "bois"){
    g += ground("#6E9A4E");
    for (let j = 0; j < Math.min(7, n + 1); j++){
      const x = 14 + j * 30 + r() * 8, s = .7 + r() * .45;
      g += `<g transform="translate(${x} 78) scale(${s})" class="b2-grow" style="animation-delay:-${(r()*5).toFixed(1)}s"><rect x="-3" y="-12" width="6" height="12" fill="#6B3E1E"/><path d="M0 -62 L18 -26 H-18Z" fill="#2F6B3A"/><path d="M0 -50 L22 -12 H-22Z" fill="#3A7E45"/></g>`;
    }
    g += `<g transform="translate(196 80)"><ellipse cx="0" cy="-2" rx="14" ry="5" fill="#C98F55"/><ellipse cx="0" cy="-4" rx="12" ry="4" fill="#E2B27A"/><circle cx="0" cy="-4" r="2" fill="none" stroke="#B07D4A"/></g>`;
    g += `<g transform="translate(180 64)"><g class="b2-chop"><path d="M0 0 L18 16" stroke="#7C4A24" stroke-width="3" stroke-linecap="round"/><path d="M-4 -5 l9 -2 -2 9z" fill="#9AA6AE"/></g></g>`;
    g += `<g transform="translate(222 84)"><rect x="-14" y="-6" width="28" height="6" rx="3" fill="#A86B3C"/><rect x="-11" y="-12" width="22" height="6" rx="3" fill="#B87A46"/><circle cx="-14" cy="-3" r="3" fill="#E2B27A"/><circle cx="-11" cy="-9" r="3" fill="#E2B27A"/></g>`;
  }
  return `<svg viewBox="0 0 240 96" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${g}</svg>`;
}
function barnArt(fill){
  const n = Math.round(Math.min(1, fill) * 10);
  let sacks = ""; for (let j = 0; j < n; j++){ const row = Math.floor(j / 4), col = j % 4; sacks += `<rect x="${54 + col * 11 - (row % 2) * 5}" y="${100 - row * 9}" width="10" height="9" rx="3.5" fill="${j % 2 ? "#E7C48B" : "#DDB57A"}" stroke="#B88A50" stroke-width=".8"/>`; }
  return `<svg viewBox="0 0 150 120" aria-hidden="true"><ellipse cx="78" cy="116" rx="70" ry="5" fill="rgba(0,0,0,.15)"/>
  <rect x="118" y="34" width="24" height="80" rx="10" fill="#D8D2C4"/><path d="M118 40 a12 12 0 0 1 24 0" fill="#A9A294"/><path d="M118 60 h24 M118 80 h24 M118 100 h24" stroke="#B9B2A3" stroke-width="2"/>
  <path d="M14 56 L66 20 L118 56 V114 H14Z" fill="#CC3F27"/><path d="M8 58 L66 16 L124 58" fill="none" stroke="#7A2516" stroke-width="7" stroke-linejoin="round"/>
  <path d="M8 58 L66 16 L124 58" fill="none" stroke="#FFF4E6" stroke-width="2" stroke-linejoin="round"/>
  <rect x="56" y="34" width="20" height="16" fill="#7A2516"/><path d="M56 34 h20 v16 h-20z M56 34 l20 16 M76 34 l-20 16" stroke="#FFF4E6" stroke-width="2" fill="none"/>
  <rect x="44" y="72" width="44" height="42" fill="#5B2213"/>${sacks}
  <path d="M44 72 h44 v42 h-44z" stroke="#FFF4E6" stroke-width="3" fill="none"/><path d="M44 72 l-0 0" />
  <path d="M20 114 V62 M112 114 V62" stroke="#A83220" stroke-width="2"/></svg>`;
}
const CART = `<svg viewBox="0 0 62 40" aria-hidden="true"><path d="M2 14 h44 l-4 16 h-36z" fill="#A86B3C" stroke="#6B3E1E" stroke-width="1.5"/><path d="M8 18 h32 M7 24 h32" stroke="#8C5A30" stroke-width="1.2"/>
  <rect x="9" y="5" width="11" height="10" rx="4" fill="#E7C48B" stroke="#B88A50"/><rect x="21" y="3" width="11" height="12" rx="4" fill="#DDB57A" stroke="#B88A50"/><rect x="31" y="7" width="10" height="8" rx="3.5" fill="#E7C48B" stroke="#B88A50"/>
  <path d="M46 20 l14 -4" stroke="#6B3E1E" stroke-width="2.5" stroke-linecap="round"/>
  <g class="wheel"><circle cx="13" cy="32" r="7" fill="#5B3519"/><circle cx="13" cy="32" r="4.5" fill="#C98F55"/><path d="M13 27.5 v9 M8.5 32 h9" stroke="#5B3519" stroke-width="1.5"/></g>
  <g class="wheel"><circle cx="36" cy="32" r="7" fill="#5B3519"/><circle cx="36" cy="32" r="4.5" fill="#C98F55"/><path d="M36 27.5 v9 M31.5 32 h9" stroke="#5B3519" stroke-width="1.5"/></g></svg>`;
const TOWER = `<svg viewBox="0 0 60 110" aria-hidden="true"><path d="M8 20 L8 110 M52 20 L52 110" stroke="#6B3E1E" stroke-width="7" stroke-linecap="round"/>
  <path d="M8 40 L52 66 M52 40 L8 66 M8 72 L52 98 M52 72 L8 98" stroke="#9A6334" stroke-width="3"/><path d="M4 20 H56" stroke="#5B3519" stroke-width="6" stroke-linecap="round"/>
  <path d="M2 18 L30 2 L58 18Z" fill="#CC3F27"/><path d="M30 28 V110" stroke="#3E220F" stroke-width="2"/>
  <g class="pulley"><circle cx="30" cy="22" r="9" fill="#C98F55" stroke="#5B3519" stroke-width="2.5"/><path d="M30 14 V30 M22 22 H38" stroke="#5B3519" stroke-width="2"/></g></svg>`;
const CROWN = `<svg class="b2-cr" viewBox="0 0 40 30" aria-hidden="true"><path d="M4 26 L2 8 L12 15 L20 3 L28 15 L38 8 L36 26Z" fill="#F6C543" stroke="#B97A0C" stroke-width="2" stroke-linejoin="round"/><rect x="4" y="24" width="32" height="5" rx="2" fill="#E0A020" stroke="#B97A0C" stroke-width="1.5"/><circle cx="20" cy="17" r="2.6" fill="#E0392B"/><circle cx="11" cy="20" r="2" fill="#3F6FB0"/><circle cx="29" cy="20" r="2" fill="#3F6FB0"/><circle cx="2" cy="8" r="2" fill="#F6C543"/><circle cx="20" cy="3" r="2" fill="#F6C543"/><circle cx="38" cy="8" r="2" fill="#F6C543"/></svg>`;
const FENCE = `<svg class="b2-fence" viewBox="0 0 320 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 22 H320 M0 50 H320" stroke="#8C5A30" stroke-width="9"/>${Array.from({length:9},(_,j)=>`<path d="M${14+j*37} 66 V10 l7 -8 l7 8 V66z" fill="#C98F55" stroke="#6B3E1E" stroke-width="2.5"/>`).join("")}<path d="M0 22 H320 M0 50 H320" stroke="#6B3E1E" stroke-width="2" opacity=".5"/></svg>`;
const CLOCK = `<svg class="b2-clk" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="#fff" stroke="currentColor" stroke-width="2.2"/><path d="M10 5 V10 L13.5 12" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>`;
const HAND = `<svg viewBox="0 0 40 46" aria-hidden="true"><path d="M15 4 a4 4 0 0 1 8 0 v15 l9 2 a5 5 0 0 1 4 6 l-2 12 a6 6 0 0 1 -6 5 h-11 a6 6 0 0 1 -5 -3 l-8 -12 a3.5 3.5 0 0 1 5 -4.5 l6 5z" fill="#fff" stroke="#3B1F17" stroke-width="2.6" stroke-linejoin="round"/><path d="M23 20 v8 M28 21 v7" stroke="#3B1F17" stroke-width="2" stroke-linecap="round"/></svg>`;
const UP = `<svg class="b2-up" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 L14 9 H10.5 V14 H5.5 V9 H2Z" fill="#fff"/></svg>`;
const LOCK = `<svg viewBox="0 0 40 44" aria-hidden="true"><path d="M11 19 v-6 a9 9 0 0 1 18 0 v6" fill="none" stroke="#D9C3A0" stroke-width="5"/><rect x="6" y="18" width="28" height="23" rx="5" fill="#F2B33D" stroke="#9E6A0A" stroke-width="2"/><circle cx="20" cy="28" r="3.5" fill="#6B4400"/><rect x="18.5" y="29" width="3" height="7" rx="1.5" fill="#6B4400"/></svg>`;
const CRATE = `<svg viewBox="0 0 44 30" aria-hidden="true"><path d="M3 8 h38 l-3 20 h-32z" fill="#B07D4A" stroke="#6B3E1E" stroke-width="2"/><path d="M5 15 h34 M6 21 h32" stroke="#8C5A30" stroke-width="1.6"/><ellipse cx="22" cy="8" rx="19" ry="4" fill="#E7C48B" stroke="#6B3E1E" stroke-width="1.5"/></svg>`;
const CABIN = `<svg viewBox="0 0 38 36" aria-hidden="true"><path d="M19 0 v6" stroke="#3E220F" stroke-width="2"/><rect x="2" y="6" width="34" height="28" rx="4" fill="#D9A066" stroke="#7C4A24" stroke-width="2"/><path d="M2 14 h34" stroke="#7C4A24" stroke-width="2"/><rect x="8" y="17" width="10" height="12" rx="4" fill="#E7C48B" stroke="#B88A50"/><rect x="19" y="19" width="10" height="10" rx="4" fill="#DDB57A" stroke="#B88A50"/></svg>`;
function ovenArt(hot){
  return `<svg viewBox="0 0 120 100" aria-hidden="true"><rect x="52" y="0" width="16" height="30" fill="#8C7B6B"/><rect x="49" y="0" width="22" height="5" fill="#6E5F51"/>
  <path d="M8 96 V58 A52 46 0 0 1 112 58 V96Z" fill="#B9A58F"/>
  ${[[14,62],[36,40],[62,30],[86,42],[100,64],[22,82],[96,84],[60,50]].map(([x,y]) => `<rect x="${x}" y="${y}" width="16" height="9" rx="3" fill="#A6927C"/>`).join("")}
  <path d="M32 96 V70 A28 26 0 0 1 88 70 V96Z" fill="#2A140A"/>
  <g><path class="b2-flame" d="M44 96 q4 -22 12 -26 q-2 12 6 16 q2 -10 8 -14 q2 14 6 24z" fill="#F2873B"/><path class="b2-flame" style="animation-delay:-.2s" d="M52 96 q3 -14 8 -16 q0 8 4 10 q2 -6 5 -8 q1 8 3 14z" fill="#FFD15C"/></g>
  <rect x="4" y="92" width="112" height="8" rx="3" fill="#8C7B6B"/></svg>`;
}
/* =================== Personnages et produits dessinés =================== */
// un personnage (corps entier ou portrait), bras et jambes animables
function person(o, portrait){
  const sk = o.skin || "#F2C29B", ink = "#3B1F17", sh = o.shirt || "#D9533B", pa = o.pants || "#3F6FB0", hr = o.hair || "#6B3E1E";
  const legs = portrait ? "" : `<g class="lg l"><rect x="14" y="41" width="5.5" height="13" rx="2.5" fill="${pa}"/><rect x="12.5" y="52" width="8" height="4.5" rx="2.2" fill="#4A2C17"/></g>
    <g class="lg r"><rect x="20.5" y="41" width="5.5" height="13" rx="2.5" fill="${pa}"/><rect x="19.5" y="52" width="8" height="4.5" rx="2.2" fill="#4A2C17"/></g>`;
  const back = `<g class="ar l"><rect x="8.5" y="27" width="5" height="13" rx="2.5" fill="${sh}"/><circle cx="11" cy="40.5" r="2.6" fill="${sk}"/></g>`;
  const tool = o.tool === "fork" ? `<path d="M30 24 L30 50" stroke="#8C5A30" stroke-width="2" stroke-linecap="round"/><path d="M27 19 v6 M30 18 v7 M33 19 v6 M27 25 h6" stroke="#9AA6AE" stroke-width="1.6" stroke-linecap="round" fill="none"/>`
    : o.tool === "whip" ? `<path d="M30 40 q6 -10 2 -20" stroke="#6B3E1E" stroke-width="1.6" fill="none"/>` : "";
  const front = `<g class="ar r">${tool}<rect x="26.5" y="27" width="5" height="13" rx="2.5" fill="${sh}"/><circle cx="29" cy="40.5" r="2.6" fill="${sk}"/></g>`;
  const body = `<rect x="12" y="25.5" width="16" height="18" rx="6" fill="${sh}"/>` + (o.over !== false ? `<rect x="14" y="31" width="12" height="12.5" rx="2.5" fill="${pa}"/><path d="M15 31 L14.5 26.5 M25 31 L25.5 26.5" stroke="${pa}" stroke-width="2.4"/><circle cx="15.5" cy="32.5" r="1" fill="#F2D27A"/><circle cx="24.5" cy="32.5" r="1" fill="#F2D27A"/>` : "")
    + (o.apron ? `<path d="M14 30 h12 v13 a2 2 0 0 1 -2 2 h-8 a2 2 0 0 1 -2 -2z" fill="${o.apron}"/>` : "") + (o.vest ? `<path d="M12.5 28 h4 v15 h-4z M23.5 28 h4 v15 h-4z" fill="${o.vest}"/><path d="M12.5 35 h4 M23.5 35 h4" stroke="#F4F1E8" stroke-width="1.5"/>` : "");
  let hat = "", hair = "";
  if (o.hair2 === "bun") hair = `<circle cx="20" cy="7.5" r="4.5" fill="${hr}"/>`;
  hair += `<path d="M11.2 16 a8.8 8.8 0 0 1 17.6 0 q-3 -3.5 -8.8 -3.5 q-5.8 0 -8.8 3.5z" fill="${hr}"/>`;
  if (o.hat === "straw") hat = `<ellipse cx="20" cy="11.5" rx="13.5" ry="3.2" fill="#E2B85A"/><path d="M13.5 11.5 q0 -7.5 6.5 -7.5 q6.5 0 6.5 7.5z" fill="#F2D27A"/><path d="M13.6 10 h12.8" stroke="#C0392B" stroke-width="2"/>`;
  if (o.hat === "hard") hat = `<path d="M11 13.5 a9 8.5 0 0 1 18 0z" fill="#F2B33D"/><rect x="9" y="12.5" width="22" height="3" rx="1.5" fill="#D99A1C"/><path d="M20 5.5 v8" stroke="#D99A1C" stroke-width="2"/>`;
  if (o.hat === "cap") hat = `<path d="M11.3 13.5 a8.7 7.8 0 0 1 17.4 0z" fill="${o.capc || "#3A7E45"}"/><path d="M27 13 h6.5 a1.5 1.5 0 0 1 0 3 h-7z" fill="${o.capc || "#3A7E45"}"/>`;
  if (o.hat === "chef") hat = `<rect x="13.5" y="8" width="13" height="5.5" rx="1.5" fill="#FFFFFF" stroke="#E2DCCF"/><circle cx="15.5" cy="6" r="4" fill="#fff" stroke="#E2DCCF"/><circle cx="20" cy="4" r="4.5" fill="#fff" stroke="#E2DCCF"/><circle cx="24.5" cy="6" r="4" fill="#fff" stroke="#E2DCCF"/><rect x="14" y="7" width="12" height="5" fill="#fff"/>`;
  if (o.hat === "scarf") hat = `<path d="M10.5 18 a9.5 10 0 0 1 19 0 l-1.5 3 q-8 -9 -16 0z" fill="${o.scarfc || "#5E8FCB"}"/><circle cx="14" cy="11" r=".9" fill="#fff"/><circle cx="21" cy="9" r=".9" fill="#fff"/><circle cx="26" cy="12" r=".9" fill="#fff"/>`;
  const beard = o.beard ? `<path d="M12 18 q1 9 8 9 q7 0 8 -9 q-2 4 -8 4 q-6 0 -8 -4z" fill="${hr}"/>` : "";
  const head = `<circle cx="11.3" cy="18.5" r="2" fill="${sk}"/><circle cx="28.7" cy="18.5" r="2" fill="${sk}"/><circle cx="20" cy="17.5" r="9" fill="${sk}"/>${hair}${beard}
    <circle cx="16.8" cy="17.6" r="1.25" fill="${ink}"/><circle cx="23.2" cy="17.6" r="1.25" fill="${ink}"/><circle cx="15" cy="20.6" r="1.6" fill="#F28C7A" opacity=".55"/><circle cx="25" cy="20.6" r="1.6" fill="#F28C7A" opacity=".55"/>
    ${o.beard ? `<path d="M17.8 21.6 q2.2 1.4 4.4 0" stroke="${ink}" stroke-width="1" fill="none" stroke-linecap="round"/>` : `<path d="M17.6 21 q2.4 2.2 4.8 0" stroke="${ink}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`}${o.mous ? `<path d="M16.5 20.4 q3.5 -1.6 7 0 q-3.5 1.2 -7 0z" fill="${hr}"/>` : ""}${hat}`;
  const vb = portrait ? "5 -0.5 30 30" : "0 0 40 58";
  return `<svg class="b2-person" viewBox="${vb}" aria-hidden="true">${portrait ? "" : `<ellipse cx="20" cy="56.5" rx="10" ry="1.8" fill="rgba(0,0,0,.18)"/>`}${legs}${back}${body}${front}${head}</svg>`;
}
const PEOPLE = {
  parcel: { hat:"straw", shirt:"#D9533B", pants:"#3F6FB0", tool:"fork" },
  elev:   { hat:"hard", shirt:"#4E7FB8", pants:"#46505C", vest:"#F2873B", over:false, skin:"#E0A87E" },
  cart:   { hat:"cap", capc:"#3A7E45", shirt:"#EAD9B5", pants:"#7C4A24", beard:true, hair:"#5B3519", over:false, skin:"#F0BE96" },
  boulanger:  { hat:"chef", shirt:"#FFFFFF", pants:"#E9E2D3", over:false, mous:true, hair:"#3B2A20" },
  aubergiste: { shirt:"#B65C3B", pants:"#5B3519", over:false, apron:"#F2E6CC", beard:true, hair:"#A0522D", skin:"#E8B48C" },
  patissiere: { hat:"chef", shirt:"#F4A9B8", pants:"#F4A9B8", over:false, apron:"#FFFFFF", hair:"#8B4A2B", skin:"#C98E6B" },
  epiciere:   { hat:"scarf", scarfc:"#5E8FCB", shirt:"#8E6BB8", pants:"#8E6BB8", over:false, hair:"#C9C3BA", apron:"#F2D27A" },
  charpentier:{ hat:"cap", capc:"#C0392B", shirt:"#C0392B", pants:"#3F6FB0", hair:"#2B1D14", skin:"#B07A55" },
};
const face = k => `<i class="b2-face">${person(PEOPLE[k], true)}</i>`;
const MGR = { parcel: face("parcel"), elev: face("elev"), cart: face("cart") };
const BODY = { parcel: person(PEOPLE.parcel), cart: person(Object.assign({}, PEOPLE.cart, { tool:null })) };
for (const k in BX.CHARS) if (PEOPLE[k]) BX.CHARS[k].e = face(k);

// les 11 produits
const PIC = {
  ble: `<path d="M16 30 L9 7 M16 30 L16 4 M16 30 L23 7" stroke="#B9862B" stroke-width="1.6" stroke-linecap="round"/>${[[9,7],[16,4],[23,7]].map(([x,y]) => [0,1,2,3].map(j => `<ellipse cx="${x + (j % 2 ? 1.8 : -1.8) + (x - 16) * j * .03}" cy="${y + 2 + j * 3}" rx="1.9" ry="3.2" fill="${j % 2 ? "#E8B53A" : "#F5CB52"}" stroke="#C98A12" stroke-width=".6" transform="rotate(${j % 2 ? 22 : -22} ${x} ${y + 2 + j * 3})"/>`).join("")).join("")}<path d="M11 20 q5 3 10 0 l0.5 3 q-5.5 3 -11 0z" fill="#C0392B"/>`,
  oeufs: `<ellipse cx="12" cy="18" rx="7" ry="9" fill="#FFF8EA" stroke="#D9C3A0" stroke-width="1.2"/><ellipse cx="21.5" cy="20.5" rx="7" ry="8.5" fill="#F3D9B5" stroke="#C9A77A" stroke-width="1.2"/><ellipse cx="9.5" cy="14" rx="1.8" ry="2.8" fill="#fff"/><ellipse cx="19.3" cy="16.5" rx="1.6" ry="2.4" fill="#FFF3E0"/>`,
  lait: `<path d="M12 4 h8 v4 l3 4 v15 a3 3 0 0 1 -3 3 h-8 a3 3 0 0 1 -3 -3 v-15 l3 -4z" fill="#FFFFFF" stroke="#9FB3C8" stroke-width="1.3"/><rect x="11.5" y="2.5" width="9" height="3.5" rx="1.2" fill="#3F6FB0"/><rect x="9" y="15" width="14" height="7" fill="#7FB2E5"/><path d="M12 18.5 q4 -3 8 0" stroke="#fff" stroke-width="1.3" fill="none"/><rect x="10.5" y="10" width="2" height="4" rx="1" fill="#EEF4FA"/>`,
  fruits: `<path d="M16 9 C 9 5, 3 11, 5 19 C 7 27, 12 30, 16 28 C 20 30, 25 27, 27 19 C 29 11, 23 5, 16 9z" fill="#E0392B" stroke="#A82418" stroke-width="1.2"/><path d="M16 9 q0 -4 2 -6" stroke="#6B3E1E" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M18 5 q6 -3 8 1 q-5 3 -8 -1z" fill="#5FAE4A"/><ellipse cx="10" cy="14" rx="2" ry="3.4" fill="#FF8A7A" opacity=".8" transform="rotate(25 10 14)"/>`,
  miel: `<path d="M8 11 h16 l1 4 q1 13 -9 14 q-10 -1 -9 -14z" fill="#F2B33D" stroke="#B87A10" stroke-width="1.2"/><rect x="7" y="7" width="18" height="5" rx="2" fill="#B85C2A"/><path d="M10 12 q1 5 2.5 0 q1.5 7 3 0" fill="#F2B33D"/><rect x="10.5" y="17" width="11" height="6.5" rx="1.5" fill="#FFF0C7"/><path d="M13 20.3 h6" stroke="#B87A10" stroke-width="1.3" stroke-linecap="round"/><ellipse cx="11" cy="19" rx="1" ry="2.5" fill="#FFE08A" opacity=".7"/>`,
  bois: `<rect x="4" y="16" width="22" height="9" rx="4.5" fill="#A86B3C" stroke="#6B3E1E" stroke-width="1.2"/><circle cx="25" cy="20.5" r="4.5" fill="#E2B27A" stroke="#6B3E1E" stroke-width="1.2"/><circle cx="25" cy="20.5" r="2.2" fill="none" stroke="#B07D4A" stroke-width="1"/><rect x="7" y="7" width="20" height="9" rx="4.5" fill="#B87A46" stroke="#6B3E1E" stroke-width="1.2"/><circle cx="26" cy="11.5" r="4.5" fill="#E8BC86" stroke="#6B3E1E" stroke-width="1.2"/><circle cx="26" cy="11.5" r="2.2" fill="none" stroke="#B07D4A" stroke-width="1"/><path d="M9 20 h8 M11 11 h7" stroke="#8C5A30" stroke-width="1" stroke-linecap="round"/>`,
  pain: `<path d="M4 20 q0 -9 12 -11 q12 -2 12 7 q0 8 -12 10 q-12 1 -12 -6z" fill="#D9903F" stroke="#9E5E1E" stroke-width="1.2"/><path d="M10 13.5 l3 5 M15 12 l3 5 M20 11.5 l3 5" stroke="#F6D190" stroke-width="2" stroke-linecap="round"/>`,
  crepes: `<ellipse cx="16" cy="25" rx="13" ry="3.5" fill="#E8F0F5" stroke="#B9C7D2"/>${[21, 17.5, 14].map(y => `<ellipse cx="16" cy="${y}" rx="11" ry="3.2" fill="#F0C46A" stroke="#C98A2B" stroke-width="1"/>`).join("")}<path d="M10 13 q6 -3 12 0 q1 4 -2 6 q-1 -3 -3 -2 q-2 3 -4 0 q-3 1 -3 -4z" fill="#9E5A1E" opacity=".85"/><rect x="14" y="8" width="5" height="4" rx="1" fill="#FFF3C4" stroke="#E2C77A" stroke-width=".8"/>`,
  tarte: `<ellipse cx="16" cy="19" rx="13" ry="9" fill="#D9903F" stroke="#9E5E1E" stroke-width="1.2"/><ellipse cx="16" cy="18" rx="10" ry="6.5" fill="#C0392B"/><path d="M8 15.5 l16 5 M8 20.5 l16 -5 M12 12.5 l1 11 M20 12.5 l-1 11" stroke="#F0B562" stroke-width="2.2" stroke-linecap="round"/>`,
  confiture: `<rect x="8" y="11" width="16" height="17" rx="4" fill="#C2263A" stroke="#8E1828" stroke-width="1.2"/><path d="M6 10 q10 -6 20 0 l-2 4 q-8 -3 -16 0z" fill="#fff" stroke="#E2DCCF"/><path d="M8.5 9 l3 1.5 M13 7.5 l3 1.5 M18 7.5 l3 1.5 M22 9 l2.5 1.5" stroke="#E0392B" stroke-width="1.6"/><path d="M8 13.5 h16" stroke="#7C4A24" stroke-width="1.2"/><rect x="11" y="17" width="10" height="6" rx="1.5" fill="#FFF0C7"/><ellipse cx="11" cy="20" rx="1" ry="3" fill="#E85A6B" opacity=".7"/>`,
  gateau: `<rect x="5" y="17" width="22" height="10" rx="2.5" fill="#F4A9B8" stroke="#C26A7E" stroke-width="1.2"/><rect x="5" y="20.5" width="22" height="2.5" fill="#FFF3E0"/><path d="M5 17 q2.75 3 5.5 0 q2.75 3 5.5 0 q2.75 3 5.5 0 q2.75 3 5.5 0 v-3 q-11 -4 -22 0z" fill="#FFFFFF" stroke="#E2DCCF"/><circle cx="16" cy="10.5" r="3" fill="#E0392B"/><path d="M16 7.5 q1 -3 3.5 -3.5" stroke="#5FAE4A" stroke-width="1.3" fill="none"/><rect x="4" y="27" width="24" height="2.5" rx="1.2" fill="#C7D3DC"/>`,
};
for (const k in PIC) P[k].e = `<i class="b2-ic"><svg viewBox="0 0 32 32" aria-hidden="true">${PIC[k]}</svg></i>`;


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
    <div class="b2-sp"></div><button class="b2-crown" data-a="rank" aria-label="Classement"><span class="c">${CROWN}</span><b data-live="rank">–</b></button><button class="b2-hbtn" data-a="close" aria-label="Fermer">×</button></div></div>
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
    if (reformMsg){ const m = reformMsg; reformMsg = null; dirty = true; setTimeout(() => reformSheet(m), 400); }
    else if (gained >= 1) setTimeout(() => toast(`Pendant ton absence, tes contremaîtres ont rentré ${fmtN(gained)} ${P[S.spec].e} dans la grange`, "gold"), 500);
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
    if (n % 20 === 0 && (!ORD || ORD.slot < curSlot())) loadOrders();
    if (n % 80 === 40 && S.claims.length) S.claims.forEach(c => claimOrder(c));
    live();
    n++;
    if (n % 4 === 0) rankTick();
    if (n % 4 === 0 && !sheetOpen){ const sig = unlockSig(); if (sig !== lastSig){ lastSig = sig; draw(); } }
    if (n % 80 === 0) save();                       // toutes les 20 s si quelque chose a changé
    if (n % 120 === 0){ loadWorld((view === "market" || view === "village")); loadOrders(); }
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
    const cls = "b2-wk " + p.ph + (p.mgr ? " mgr" : ""); if (w.className !== cls) w.className = cls;
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
// au retour sur l'appli (téléphone verrouillé, autre appli…) : on rattrape la production faite pendant l'absence
document.addEventListener("visibilitychange", () => { if (document.hidden && S && wrapEl) save(true); else if (!document.hidden && S && wrapEl){ const t = now(), gained = BX.catchUp(S, t); lastTick = t; dirty = true; if (gained >= 1){ draw(); toast(`Pendant ton absence : +${fmtN(gained)} ${P[S.spec].e}`, "gold"); } } });
window.addEventListener("pageshow", e => { if (e.persisted && S && wrapEl){ const t = now(); BX.catchUp(S, t); lastTick = t; dirty = true; draw(); } });

/* =================== Affichage =================== */
function draw(){
  if (!wrapEl || !S) return;
  const main = wrapEl.querySelector("#b2-main");
  const keep = main.dataset.v === view ? main.scrollTop : 0;
  const html = view === "farm" ? farmHTML() : view === "barn" ? barnHTML() : view === "market" ? marketHTML() : villageHTML();
  main.innerHTML = html; main.dataset.v = view; main.scrollTop = keep;
  wrapEl.querySelector("#b2-dock").innerHTML = view === "farm" ? dockHTML() : "";
  wrapEl.querySelector("#b2-main").classList.toggle("dockpad", view === "farm");
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
  q(".b2-seat.hire").forEach(b => b.classList.toggle("can", S.coins >= +b.dataset.cc));
  const t = now();
  if (view === "farm"){
    const key = S.cur, f = S.farms[key]; if (!f) return;
    f.parcels.forEach((p, i) => {
      const el = wrapEl.querySelector(`[data-plot="${i}"]`); if (!el) return;
      el.classList.toggle("idle", p.ph === "idle");
      const pe = el.querySelector("[data-pend]"); if (pe) pe.textContent = fmtN(p.pend);
      const full = p.pend >= BAL.pendCap(BX.pRate(S, key, i, p.lvl) * (f.boost > t ? 2 : 1)) * .98;
      pe && pe.classList.toggle("warn", full);
    });
    wrapEl.querySelector(".b2-tower")?.classList.toggle("idle", f.elev.ph === "idle");
    const tot = BX.pendTotal(f);
    const want = nextStep(f, tot);
    wrapEl.querySelectorAll("[data-hint]").forEach(h => { const on = h.dataset.hint === want; if (h.classList.contains("on") !== on) h.classList.toggle("on", on); });
    const qe = wrapEl.querySelector("[data-live=quai]"); if (qe) qe.textContent = fmtN(f.quai);
    const sk = wrapEl.querySelector(".b2-quai .sacks");
    if (sk){ const n = Math.min(8, Math.ceil(f.quai / Math.max(1, BX.quaiCap(f)) * 8)); if (+sk.dataset.n !== n){ sk.dataset.n = n; sk.innerHTML = "<i class='sk'></i>".repeat(n); } }
    const cap = BX.barnCap(S), used = BX.stockUnits(S), fill = Math.min(1, used / cap);
    const gb = wrapEl.querySelector(".b2-sky .b2-gbar"); if (gb){ gb.querySelector("i").style.width = (fill * 100) + "%"; gb.classList.toggle("full", fill >= .999); }
    const gl = wrapEl.querySelector("[data-live=barn]"); if (gl) gl.textContent = `${fmtN(used)} / ${fmtN(cap)}`;
    const gtb = wrapEl.querySelector("[data-live=gatebar]");
    if (gtb || wrapEl.querySelector("[data-live=gateleft]")){
      const gs = BX.gateState(f, t);
      if (gs.st === "done"){ if (gs.fresh){ sound("done"); buzz([30, 50, 30]); toast("Palier franchi ! De nouveaux champs t'attendent", "gold"); dirty = true; } draw(); return; }
      if (gs.st === "todo" && gtb){ gtb.style.width = Math.min(100, S.coins / gs.g.coins * 100) + "%"; wrapEl.querySelector("[data-live=gatetxt]").innerHTML = `${COIN}${fmtN(S.coins)} / ${fmtN(gs.g.coins)}`; }
      if (gs.st === "work"){ const l = wrapEl.querySelector("[data-live=gateleft]"); if (l) l.textContent = fmtT(gs.left); const w = wrapEl.querySelector("[data-live=gatework]"); if (w) w.style.width = (1 - gs.left / gs.g.ms) * 100 + "%"; }
    }
    const sv = wrapEl.querySelector("[data-live=sellv]");
    if (sv){ const q = Math.floor(S.stock[S.cur] || 0); sv.textContent = fmtN(BX.vValue(S, S.cur, q, t)); const btn = sv.closest(".b2-sellbtn"); btn.classList.toggle("empty", q < 1); btn.classList.toggle("ready", q >= 1 && S.stats.earned === 0); }
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
  return has ? `<button class="b2-seat on" data-a="station" data-k="${kind}" ${di} aria-label="Contremaître engagé">${MGR[kind]}</button>`
    : `<button class="b2-seat hire" data-a="hire" data-k="${kind}" ${di} data-cc="${cost}" aria-label="Engager un contremaître pour ${fmtN(cost)} pièces">${MGR[kind]}<i>${COIN}${fmtN(cost)}</i></button>`;
}
function upCost(kind, f, i){
  const at = kind === "parcel" ? L => BAL.parcelCost(i, L) : kind === "elev" ? BAL.elevCost : BAL.cartCost;
  const L = kind === "parcel" ? f.parcels[i].lvl : f[kind].lvl;
  const b = BX.bulk(at, L, mult === "max" ? "max" : mult, S.coins);
  if (b.n === 0) return { n: 1, coins: BX.nice(at(L)) };
  return b;
}
const upLabel = u => `${UP}${u.n > 1 ? `<small>+${u.n}</small>` : ""}${COIN}${fmtN(u.coins)}`;
function stationChip(kind, f){
  const u = upCost(kind, f), lvl = f[kind].lvl, cap = kind === "elev" ? BAL.elevCap(lvl) : BAL.cartCap(lvl);
  const cost = kind === "elev" ? BAL.elevMgr : BAL.cartMgr, has = f[kind].mgr;
  return `<div class="b2-stn ${kind}" data-a="station" data-k="${kind}">
    <span class="b2-slow" data-slow="${kind}" style="display:none">Lent</span>
    <span class="b2-lv">${lvl}</span>${has ? `<span class="b2-seat on">${MGR[kind]}</span>` : seatHTML(kind, false, cost)}
    <button class="b2-btn" data-a="up-${kind}" data-cc="${u.coins}">${upLabel(u)}</button></div>`;
}
function farmHTML(){
  const key = S.cur, f = S.farms[key], t = now(), pr = P[key];
  const r = BX.farmRates(f, t, BX.farmMul(S, key)), cap = BX.barnCap(S), used = BX.stockUnits(S);
  const farmsK = Object.keys(S.farms);
  const depth = i => `hsl(${26 - i * 1.2} ${42 - i * 2}% ${34 - i * 2.6}%)`;
  const tip = farmTip();
  let plots = f.parcels.map((p, i) => {
    const pu = upCost("parcel", f, i), rate = BX.pRate(S, key, i, p.lvl) * r.boost;
    const next = BX.MILES.find(m => m > p.lvl);
    return `<div class="b2-plot" data-plot="${i}" style="--soil:${depth(i)}">
      <div class="art" data-a="tap-parcel" data-i="${i}">${plotArt(key, i, p.lvl)}<div class="b2-path"></div>
        <div class="pend"><span class="b2-tag" data-pend>${fmtN(p.pend)}</span>${CRATE}</div>
        <div class="b2-wk ${p.ph}" data-wk="${i}"><div class="bar"><i></i></div><span class="carry">${pr.e}</span><span class="who">${BODY.parcel}</span><span class="b2-point" data-hint="p${i}">${HAND}</span></div>
      </div><span class="b2-plvl">Niv <b>${p.lvl}</b></span>
      <div class="b2-sign"><div class="row">
        ${seatHTML("parcel", p.mgr, BX.nice(BAL.parcelMgr(i)), i)}${i === 0 && !p.mgr ? `<span class="b2-point" data-hint="hire">${HAND}</span>` : ""}
        <div class="sp" data-a="station" data-k="parcel" data-i="${i}"><span class="b2-rate">${pr.e}<b>${fmtN(rate, 1)}</b><small>/s</small></span></div>
        <button class="b2-btn" data-a="up-parcel" data-i="${i}" data-cc="${pu.coins}">${upLabel(pu)}</button>
      </div></div></div>`;
  }).join("");
  const nc = BX.nextParcelCost(f), ni = f.parcels.length;
  const gs = BX.gateState(f, t);
  if (gs.st === "todo" || gs.st === "work"){
    const g = gs.g, k = Math.min(1, S.coins / g.coins);
    plots += `<div class="b2-gate" data-gate>${FENCE}<div class="in"><span class="b2-gn">Palier ${g.n}</span>
      ${gs.st === "todo" ? `<div class="b2-gbar big"><i data-live="gatebar" style="width:${k * 100}%"></i><span data-live="gatetxt">${COIN}${fmtN(S.coins)} / ${fmtN(g.coins)}</span></div>
        <button class="b2-btn gold" data-a="gate" data-cc="${g.coins}">${COIN}${fmtN(g.coins)} <span class="dur">${CLOCK}${fmtT(g.ms)}</span></button>`
      : `<div class="b2-gbar big work"><i data-live="gatework" style="width:${(1 - gs.left / g.ms) * 100}%"></i><span>${CLOCK}<b data-live="gateleft">${fmtT(gs.left)}</b></span></div><div class="b2-workers">${MGR.parcel}${MGR.elev}${MGR.cart}</div>`}
    </div></div>`;
  } else plots += `<div class="b2-locked"><span class="lock">${LOCK}</span>
    <button class="b2-btn gold" data-a="unlock" data-cc="${nc.coins}" data-cw="${nc.wood}">${price(nc)}</button></div>`;
  return `<div class="b2-farm"><div class="b2-col">
    <div class="b2-sky">
      <div class="sun"></div><div class="b2-cloud" style="top:92px;width:58px;animation-duration:70s;animation-delay:-20s"></div><div class="b2-cloud" style="top:120px;width:44px;animation-duration:95s;animation-delay:-60s"></div>
      <svg class="b2-hills" viewBox="0 0 400 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 50 Q60 10 130 38 T260 30 T400 34 V70 H0Z" fill="#A9D47D"/><path d="M0 60 Q90 34 180 54 T400 50 V70 H0Z" fill="#94C66A"/></svg>
      ${stationChip("elev", f)}
      ${stationChip("cart", f)}
      <div class="b2-gauge" data-a="tab" data-v="barn"><div class="b2-glab"><span></span><span data-live="barn">${fmtN(used)} / ${fmtN(cap)}</span></div><div class="b2-gbar"><i style="width:${Math.min(100, used / cap * 100)}%"></i></div>
        <div data-slow="barn" style="display:none;margin-top:4px;text-align:right"><span class="b2-tag warn">Pleine : la récolte s'arrête</span></div></div>
      <div class="b2-barn" data-a="tab" data-v="barn" data-n="-1"></div>
      <button class="b2-sellbtn" data-a="quick-sell" aria-label="Vendre ta récolte au village"><span class="v">${COIN}<b data-live="sellv">0</b></span><span class="b2-point" data-hint="sell">${HAND}</span></button>
      <div class="b2-ground"></div><div class="b2-road"></div>
      <button class="b2-tower" data-a="tap-elev" aria-label="Faire monter le monte-charge">${TOWER}<span class="b2-point" data-hint="elev">${HAND}</span></button>
      <div class="b2-quai"><span class="b2-tag" data-live="quai">${fmtN(f.quai)}</span><div class="sacks" data-n="-1"></div></div>
      <button class="b2-cartlane" data-a="tap-cart" aria-label="Faire rouler la charrette"><div class="b2-cart"><span class="ld">0</span>${CART}<span class="pusher">${BODY.cart}</span><span class="b2-point" data-hint="cart">${HAND}</span></div></button>
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
  const rate = l => BX.pRate(S, S.cur, i, l) * boost;
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
    <p>Une seule possible. Elle produit 4× moins que ta spécialité, mais assez pour concurrencer un voisin.</p><button class="b2-btn gold" data-a="farm2" data-cc="${c.coins}" data-cw="${c.wood}">Choisir ${price(c)}</button></div></div>`;
}
function dockHTML(){
  const f = S.farms[S.cur], all = f.parcels.every(p => p.mgr) && f.elev.mgr && f.cart.mgr;
  const a = P[S.cur].act;
  return `<div class="b2-dock"><div class="b2-col">
    ${BX.unlocked(S, "boost") ? `<button class="b2-act" data-a="boost" aria-label="${esc(a.label)} : production ×2 pendant 1 minute">${a.e} ${esc(a.label)} <span class="t">×2</span></button>` : ""}
  </div></div>`;
}
const TIPS = [
  { id:"start",  when: () => S.stats.produced === 0 && S.coins === 0, i:"👆", txt:"Touche ton champ pour récolter. Puis touche le monte-charge (à gauche) pour remonter le panier, et la charrette pour le porter à la grange." },
  { id:"sell",   when: () => S.stats.earned === 0 && S.stock[S.spec] >= 1, i:"💰", txt:"Ta récolte est dans la grange ! Touche le bouton doré « Vendre » sur la grange pour la transformer en pièces." },
  { id:"mgr",    when: () => S.coins >= 25 && !S.farms[S.spec].parcels[0].mgr, i:"🧑‍🌾", txt:"Fatigué de toucher ? Engage un contremaître (les ronds « Engager ») : il fait le travail tout seul, même quand l'appli est fermée." },
  { id:"slow",   when: () => !!BX.bottleneck(S, S.cur, now()) && S.farms[S.cur].parcels[0].mgr, i:"🐢", txt:"Le badge « Lent » montre le maillon qui freine ta ferme. Paniers pleins en bas : améliore le monte-charge. Tas en haut : la charrette." },
  { id:"boost",  when: () => BX.unlocked(S, "boost"), i: () => P[S.spec].act.e, txt: () => `${P[S.spec].act.txt}, pendant 1 minute. Tu peux recommencer toutes les 4 minutes.` },
  { id:"marche", when: () => BX.unlocked(S, "marche"), i:"📈", txt:"Le marché est ouvert ! Le prix du village monte et descend toute la journée : vends quand il est haut, achète à tes amis quand il est bas." },
  { id:"crash",  when: () => BX.unlocked(S, "marche") && S.stats.villageSold > 0, i:"📉", txt:"Attention : si tu vends trop d'un coup au village, son prix s'écroule. Garde ta récolte dans la grange et vends au bon moment." },
  { id:"wood",   when: () => { const n = BX.nextParcelCost(S.farms[S.spec]); return n.wood > 0 && S.spec !== "bois"; }, i:"🪵", txt:"Les constructions demandent du bois. Achète-le au marché, ou au village (plus cher)." },
  { id:"village",when: () => BX.unlocked(S, "village"), i:"🏘️", txt:"Le village passe commande toutes les 20 minutes, avec de grosses primes. Et le four est prêt à être construit dans la grange." },
  { id:"farm2",  when: () => BX.unlocked(S, "farm2"), i:"⚔️", txt:"Tu peux maintenant ouvrir une 2e exploitation, d'un produit d'un ami. Tout en bas de ta ferme." },
];
// le tutoriel façon Idle Miner : une main qui montre la seule chose à toucher maintenant
function nextStep(f, tot){
  if (S.cur !== S.spec || f.parcels.every(p => p.mgr) && f.elev.mgr && f.cart.mgr) return null;
  if (S.stock[S.cur] >= 1 && S.stats.earned === 0) return "sell";
  if (S.stats.earned > 0 && S.coins >= BX.nice(BAL.parcelMgr(0)) && !f.parcels[0].mgr) return "hire";
  if (!f.cart.mgr && f.cart.ph === "idle" && f.quai >= 1) return "cart";
  if (!f.elev.mgr && f.elev.ph === "idle" && tot >= 1 && f.elev.load < 1) return "elev";
  const p = f.parcels.findIndex(p => !p.mgr && p.ph === "idle");
  if (p >= 0 && f.elev.ph === "idle" && f.cart.ph === "idle" && f.quai < 1) return "p" + p;
  return null;
}
function farmTip(){ return ""; }
function farmTipOld(){
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
      <div class="b2-barnrow" style="display:flex;align-items:center;gap:8px;margin-top:10px"><span class="b2-note" style="margin:0;flex:1 1 120px">Agrandir : ${fmtN(BAL.barnCap(S.barn + 1))} places</span>
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
// variation du cours du village sur la dernière heure
const vChg = k => { const t = now(), a = BX.vPrice(k, t - 3600000); return (BX.vPrice(k, t) - a) / a * 100; };
const vTrend = k => { const c = vChg(k); return c > 3 ? `<span class="b2-tr up">▲</span>` : c < -3 ? `<span class="b2-tr down">▼</span>` : ""; };
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
  const cs = candles(k, period), W_ = 340, H = 170, padL = 4, padR = 34, top = 10, bot = 22;
  const span = { "1h": 3600000, "24h": 86400000, "7j": 7 * 86400000 }[period], tN = now(), NP = 90;
  const curve = Array.from({ length: NP + 1 }, (_, j) => BX.vPrice(k, tN - span + span * j / NP));
  const vals = cs.filter(Boolean).flatMap(c => [c.h, c.l]).concat(curve);
  let mx = Math.max(...vals) * 1.12, mn = Math.min(...vals) * 0.9; if (mx - mn < 1) mx = mn + 1;
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
  const cx = j => padL + (W_ - padR - padL) * j / NP, last = curve[NP];
  g += `<path d="${curve.map((v, j) => (j ? "L" : "M") + cx(j).toFixed(1) + " " + y(v).toFixed(1)).join(" ")}" fill="none" stroke="#F2B33D" stroke-width="2" stroke-linejoin="round" opacity=".9"/>`;
  g += `<circle cx="${cx(NP)}" cy="${y(last)}" r="3.5" fill="#F2B33D"/><text x="${padL + 4}" y="${top + 10}" font-size="10.5" fill="#F2B33D" font-family="ui-rounded,system-ui" font-weight="800">— Village · ${fmtP(last)}</text>`;
  const lab = { "1h": ["il y a 1 h", "maintenant"], "24h": ["hier", "maintenant"], "7j": ["il y a 7 j", "maintenant"] }[period];
  g += `<text x="${padL}" y="${H - 6}" font-size="10" fill="rgba(239,234,219,.5)" font-family="ui-rounded,system-ui" font-weight="700">${lab[0]}</text><text x="${W_ - padR}" y="${H - 6}" text-anchor="end" font-size="10" fill="rgba(239,234,219,.5)" font-family="ui-rounded,system-ui" font-weight="700">${lab[1]}</text>`;

  return `<svg viewBox="0 0 ${W_} ${H}" role="img" aria-label="Cours de ${esc(P[k].label)}">${g}</svg>`;
}
function marketHTML(){
  if (!mkt.k) mkt.k = BX.RAW.find(k => k !== S.spec) || "bois";
  const k = mkt.k, qv = quote(k);
  const prods = BX.ALL.filter(x => !P[x].rec || BX.unlocked(S, "four"));
  const pills = prods.map(x => `<button class="b2-chip ${x === k ? "on" : ""}" data-a="mkt-k" data-k="${x}"><span class="n">${P[x].e} ${esc(P[x].label)}${x === bigNow() ? " 🎩" : ""}</span><span class="p">${fmtP(BX.vPrice(x, now()))}</span><span class="c">${chg(vChg(x))}</span></button>`).join("");
  const offers = W.listings.filter(l => l.product === k).sort((a, b) => a.price - b.price || a.id - b.id);
  const resL = resLeft(k);
  const rows = offers.map(l => {
    const mine = l.seller_id === ME.id;
    return `<div class="b2-ord ${mine ? "me" : ""}"><span class="who">${mine ? "Toi" : esc(nameOf(l.seller_id))}<small>${fmtAgo(new Date(l.created_at).getTime())}</small></span><span class="q">${fmtN(l.qty)}</span><span class="pr">${fmtP(+l.price)}</span>
      ${mine ? `<button class="b2-btn ghost" style="color:var(--chalk)!important;background:rgba(255,255,255,.1)!important" data-a="unlist" data-id="${l.id}">Retirer</button>` : `<button class="b2-btn" data-a="buy" data-id="${l.id}">Acheter</button>`}</div>`;
  }).join("");
  const res = `<div class="b2-ord res"><span class="who">🏘️ Le village<small>Réserve commune</small></span><span class="q">${fmtN(resL)}</span><span class="pr">${fmtP(BX.reservePrice(k))}</span>
    <button class="b2-btn gold" data-a="buy-res" ${resL < 1 ? "disabled" : ""}>Acheter</button></div>`;
  const hist = W.trades.filter(t => t.product === k).slice(-12).reverse().map(t => `<div class="b2-ord"><span class="who">${esc(t.buyer_id === ME.id ? "Toi" : nameOf(t.buyer_id))} ← ${esc(t.seller_id === ME.id ? "toi" : nameOf(t.seller_id))}<small>${fmtAgo(t.ts)}</small></span><span class="q">${fmtN(t.qty)}</span><span class="pr">${fmtP(+t.price)}</span></div>`).join("");
  return `<div class="b2-board"><div class="b2-pills">${pills}</div><div class="b2-col" style="padding:4px 16px 24px">
    <div class="b2-quote"><div><div style="font:800 13px var(--round);color:var(--chalk2)">${P[k].e} ${esc(P[k].label)} · cours du village</div><span class="big">${COIN}${fmtP(BX.vPrice(k, now()))}</span><span class="ch">${chg(vChg(k))} <small style="opacity:.6">1 h</small></span></div>
      <div class="lim">${qv.p != null ? `Entre joueurs (24 h) <b>${fmtP(qv.p)}</b><br>` : ""}${BX.vMyPrice(S, k, now()) < BX.vPrice(k, now()) * 0.95 ? `Pour toi <b>${fmtP(BX.vMyPrice(S, k, now()))}</b> (tu as trop vendu)<br>` : ""}Réserve du village <b>${fmtP(BX.reservePrice(k))}</b><br>Tu en as <b>${fmtN(S.stock[k])}</b></div></div>
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
  syncOrders();
  const ready = ORD && S.orders.slot === ORD.slot;
  const notes = !ready ? `<div class="b2-paper" style="text-align:center;color:var(--ink2);font:700 14px var(--round)">Le village prépare ses commandes…</div>` : S.orders.list.map(o => {
    const got = S.orders.prog[o.id] || 0, c = BX.CHARS[o.who] || BX.CHARS.epiciere, have = Math.floor(S.stock[o.k]);
    const w = winnerOf(o.id), mine = !!(w && w.id === ME.id), pend = !w && got >= o.qty, done = !!w || pend;
    const canBake = P[o.k].rec && S.oven.lvl && BX.canBake(S, o.k) >= 1;
    const action = done ? "" : have >= 1 ? `<button class="b2-btn" data-a="deliver" data-id="${o.id}">Livrer ${fmtN(Math.min(have, o.qty - got))}</button>`
      : canBake ? `<button class="b2-btn gold" data-a="bake" data-k="${o.k}">Au four</button>`
      : `<button class="b2-btn red" data-a="goto-mkt" data-k="${o.k}">Acheter</button>`;
    return `<div class="b2-order ${done ? "done" : ""} ${o.big ? "big" : ""}">${o.big ? `<span class="b2-bigtag">Grande commande · tout le village</span>` : ""}<div class="hd"><span class="face">${c.e}</span><div class="sp"><div class="who">${c.name}</div><div class="want">veut ${fmtN(o.qty)} ${P[o.k].e} ${esc(P[o.k].label)}</div></div>
      <div class="prime ${w && !mine ? "lost" : ""}">${w ? (mine ? "🏆 À toi" : "🏆 " + esc(w.name)) : `+${COIN}${fmtN(o.bonus)}`}<small>${w ? (mine ? `+${fmtN(o.bonus)} gagnés` : "a eu la prime") : "pour le 1er qui finit"}</small></div></div>
      <div class="pb"><i style="width:${Math.min(100, got / o.qty * 100)}%"></i></div>
      <div class="ft"><span>${fmtN(got)} / ${fmtN(o.qty)} livrés</span><span class="sp"></span>${w ? "" : `<span>Tu en as ${fmtN(have)}</span>`}${action}</div>${w ? `<span class="stamp ${mine ? "" : "lost"}">${mine ? "Premier !" : "Trop tard"}</span>` : pend ? `<span class="stamp">…</span>` : ""}</div>`;
  }).join("");
  const players = ranking();
  const top = players[0];
  const best = (key, label, i, unit) => { const p = players.slice().sort((a, b) => (+b.stats?.[key] || 0) - (+a.stats?.[key] || 0))[0]; return p && +p.stats?.[key] > 0 ? `<div class="b2-ttl"><span class="i">${i}</span><b>${label}</b><span>${esc(p.id === ME.id ? "Toi" : p.name)}</span></div>` : `<div class="b2-ttl"><span class="i" style="filter:grayscale(1)">${i}</span><b>${label}</b><span style="color:var(--ink3)">Personne encore</span></div>`; };
  return `<div class="b2-vil"><div class="b2-col b2-pad">
    <div class="b2-paper" style="background:#FFF4E0"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><h2 class="b2-h2" style="margin:0">Commandes du village<small>Les mêmes pour tout le village. La prime va au premier qui termine : les autres sont seulement payés au prix de base.</small></h2><span class="b2-clock">⏳ <span data-live="clock">${fmtT(((ORD ? ORD.slot : curSlot()) + 1) * BAL.slotMs - now())}</span></span></div></div>
    ${ORD && P[ORD.next_big] ? `<div class="b2-ann"><span>📣 Prochaine grande commande : <b>${P[ORD.next_big].e} ${esc(P[ORD.next_big].label)}</b><small>Fais ton stock avant les autres !</small></span></div>` : ""}
    <div class="b2-notes">${notes}</div>
    ${top ? `<div class="b2-baron"><span class="crown">${CROWN}</span><div class="sp"><small>Le Baron du moment</small><b>${esc(top.id === ME.id ? "C'est toi !" : top.name)}</b><span class="f">${COIN}${fmtN(top.stats?.fortune || 0)} · ${P[top.specialty]?.e || ""} ${esc(P[top.specialty]?.label || "")}</span></div></div>` : ""}
    <div class="b2-paper b2-rank"><h2 class="b2-h2">Classement<small>Fortune : argent, stock et la moitié de ce que tu as construit.</small></h2>
      ${players.map((p, i) => `<div class="b2-rk ${p.id === ME.id ? "me" : ""}"><span class="n">${i === 0 ? CROWN : i + 1}</span><span class="ic">${P[p.specialty]?.e || ""}</span><span class="sp">${esc(p.id === ME.id ? "Toi" : p.name)}${p.stats?.pio ? " 🎖️" : ""}<small>${esc(P[p.specialty]?.label || "")}${p.stats?.farms && p.stats.farms.length > 1 ? " + " + p.stats.farms.filter(x => x !== p.specialty).map(x => P[x]?.e).join("") : ""} · ${fmtN(p.stats?.prod || 0, 1)} pièces/s</small></span><span class="f">${COIN}${fmtN(p.stats?.fortune || 0)}</span></div>`).join("")}
    </div>
    <div class="b2-titles">${best("prod", "Gros producteur", "🏭")}${best("traded", "Meilleur trader", "📈")}${best("baked", "Pâtissier", "🧁")}${best("orders", "Ami du village", "📦")}</div>
  </div></div>`;
}

/* ---------- Commandes en course : les mêmes pour tous, la prime au premier ---------- */
let ORD = null;
const curSlot = () => Math.floor(now() / BAL.slotMs);
const winnerOf = id => ORD && S && S.orders.slot === ORD.slot ? (ORD.winners || {})[id] : null;
const bigNow = () => { const o = ORD && (ORD.list || []).find(x => x.big); return o ? o.k : null; };
function syncOrders(){
  if (!ORD || !S) return;
  if (S.orders.slot !== ORD.slot){ S.orders = { slot: ORD.slot, list: ORD.list, prog:{} }; dirty = true; }
  else S.orders.list = ORD.list;
}
let ordBusy = false;
async function loadOrders(){
  if (ordBusy) return; ordBusy = true;
  try{
    const r = await rpc("baron2_orders", {}); if (!r || !Array.isArray(r.list)) return;
    const prev = ORD && ORD.slot === +r.slot ? (ORD.winners || {}) : null, fresh = ORD && ORD.slot !== +r.slot;
    ORD = { slot: +r.slot, list: r.list, winners: r.winners || {}, next_big: r.next_big };
    syncOrders();
    if (prev) for (const id in ORD.winners){
      const w = ORD.winners[id]; if (prev[id] || w.id === ME.id) continue;
      const o = ORD.list.find(x => x.id === id); if (!o) continue;
      toast(`🏆 ${esc(w.name)} a raflé la prime ${o.big ? "du maire" : "de " + (BX.CHARS[o.who] || BX.CHARS.epiciere).name.toLowerCase()} : ${COIN}${fmtN(o.bonus)}`, (S.orders.prog[id] || 0) > 0 ? "err" : "");
    }
    if (fresh) toast("📜 Nouvelles commandes au village : premier arrivé, premier servi !");
    if (wrapEl && view === "village" && !sheetOpen) draw();
  }catch(e){} finally { ordBusy = false; }
}
async function claimOrder(c){
  if (c.busy) return; c.busy = true;
  try{
    const r = await rpc("baron2_order_win", { p_token: getToken(), p_slot: c.slot, p_oid: c.id });
    S.claims = S.claims.filter(x => !(x.id === c.id && x.slot === c.slot));
    const o = (ORD && ORD.list || []).find(x => x.id === c.id);
    if (r && r.won){
      if (!S.wonIds.includes(c.id)){
        S.wonIds = S.wonIds.concat(c.id).slice(-60);
        const g = +r.bonus || 0; S.coins += g; S.stats.earned += g; S.stats.orders++;
        toast(`🏆 Premier ! La prime de ${COIN}${fmtN(g)} est pour toi`, "gold"); sound("done"); buzz(30);
      }
    } else toast(r && r.name ? `Trop tard : ${esc(r.name)} a eu la prime${o ? " (" + fmtN(o.bonus) + ")" : ""}` : "Trop tard : la commande est terminée", "err");
    dirty = true; save(true); await loadOrders(); if (wrapEl && view === "village") draw();
  }catch(e){ c.busy = false; }
}

/* ---------- Classement (la couronne en haut) ---------- */
function ranking(){
  const me = publicStats();
  const players = W.players.map(p => p.id === ME.id ? Object.assign({}, p, { stats: me }) : p);
  if (!players.some(p => p.id === ME.id)) players.push({ id: ME.id, name: ME.name, specialty: S.spec, stats: me });
  return players.sort((a, b) => (+b.stats?.fortune || 0) - (+a.stats?.fortune || 0));
}
let lastRank = null;
function rankTick(){
  if (!W.at) return;
  const pl = ranking(), r = pl.findIndex(p => p.id === ME.id) + 1;
  const el = wrapEl.querySelector("[data-live=rank]"); if (el) el.textContent = r === 1 ? "Baron" : r + "e";
  const cr = wrapEl.querySelector(".b2-crown"); if (cr) cr.classList.toggle("top", r === 1);
  if (lastRank !== null && r < lastRank){
    const passed = pl[r]; sound("done"); buzz([20, 40, 20]);
    toast(r === 1 ? `${CROWN} Tu es le nouveau Baron !` : `Tu passes ${r}e, devant ${esc(passed ? passed.name : "un voisin")} !`, "gold");
    if (cr){ cr.classList.remove("b2-pop"); void cr.offsetWidth; cr.classList.add("b2-pop"); }
  }
  lastRank = r;
}
function rankSheet(){
  sheetCtx = null;
  const pl = ranking(), top = pl[0], r = pl.findIndex(p => p.id === ME.id), above = r > 0 ? pl[r - 1] : null;
  const f = p => +p.stats?.fortune || 0;
  const gap = above ? f(above) - f(pl[r]) : 0;
  sheet(`<div class="b2-throne"><span class="c">${CROWN}</span><small>Le Baron du moment</small><b>${esc(top.id === ME.id ? "Toi !" : top.name)}</b>
      <span class="f">${COIN}${fmtN(f(top))} ${P[top.specialty]?.e || ""}</span></div>
    ${above ? `<div class="b2-chase">Encore ${COIN}<b>${fmtN(gap)}</b> pour dépasser ${esc(above.name)}</div>` : `<div class="b2-chase win">Garde ta couronne !</div>`}
    <div class="b2-rank">${pl.map((p, i) => `<div class="b2-rk ${p.id === ME.id ? "me" : ""}"><span class="n">${i === 0 ? CROWN : i + 1}</span><span class="ic">${P[p.specialty]?.e || ""}</span><span class="sp">${esc(p.id === ME.id ? "Toi" : p.name)}${p.stats?.pio ? " 🎖️" : ""}</span><span class="f">${COIN}${fmtN(f(p))}</span></div>`).join("")}</div>
    <p class="b2-note" style="text-align:center">Fortune = pièces + stock + la moitié de ce que tu as construit</p>`);
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
function reformSheet(m){
  sheetCtx = null;
  sheet(`<div style="text-align:center;font-size:54px;line-height:1">🎖️</div><h3 style="text-align:center">La Grande Réforme</h3>
    <p>Le village a changé ses règles : les prix montent et descendent toute la journée, et vendre trop d'un coup fait chuter le cours. Le marché devient l'endroit où l'on fait fortune.</p>
    <p>Ta ferme repart de zéro, mais tu gardes ta spécialité et une part de ton ancienne fortune.</p>
    <div class="b2-sum"><span>Ancienne fortune</span><span>${COIN}${fmtN(m.from)}</span></div>
    <div class="b2-sum"><span>Ta récompense</span><span>${COIN}${fmtN(m.coins)} ${WOOD}${fmtN(m.wood)}</span></div>
    <p class="b2-note">Et la médaille de Pionnier 🎖️ à côté de ton nom, pour toujours.</p>
    <button class="b2-btn gold big" data-a="close-sheet">C'est parti</button>`);
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
  if (c.type === "sell"){ const g = BX.vValue(S, c.k, q, now()); s.innerHTML = `<span>Le village te paie${q > 0 ? ` <small>(${fmtP(g / q)} l'unité)</small>` : ""}</span><span>${COIN}${fmtN(g)}</span>`; }
  if (c.type === "list"){ const p = Math.max(0, +String(wrapEl.querySelector("[data-price]").value).replace(",", ".") || 0); s.innerHTML = `<span>Si tout part</span><span>${COIN}${fmtN(q * p)}</span>`; }
  if (c.type === "buy" || c.type === "res"){ s.innerHTML = `<span>Tu paies</span><span>${COIN}${fmtN(q * c.price)}</span>`; const b = wrapEl.querySelector("[data-a=confirm]"); if (b) b.disabled = q < 1 || q * c.price > S.coins; }
  if (c.type === "bake"){ s.innerHTML = `<span>Cuisson</span><span>${fmtT(BX.ovenDur(S, c.k))}</span>`; }
}
function sellSheet(k){
  sheetCtx = { type:"sell", k };
  sheet(`<h3>${P[k].e} Vendre au village</h3><p>Cours du village : <b>${fmtP(BX.vPrice(k, now()))}</b> ${vTrend(k)}. Plus tu vends d'un coup, plus son prix baisse.</p>
    ${qtyBlock(S.stock[k], S.stock[k], "q")}<div class="b2-sum" data-sum></div><button class="b2-btn gold big" data-a="confirm">Vendre au village</button>`);
  sheetSum();
}
function prodSheet(k){
  const q = quote(k);
  sheetCtx = null;
  sheet(`<h3>${P[k].e} ${esc(P[k].label)}</h3><p>Tu en as ${fmtN(S.stock[k])}. Le village le rachète ${fmtP(BX.vMyPrice(S, k, now()))} ${vTrend(k)}${q.p != null ? `, le marché en ce moment autour de ${fmtP(q.p)}` : ""}.</p>
    <div class="b2-two"><button class="b2-btn gold" data-a="sell" data-k="${k}" ${S.stock[k] < 1 ? "disabled" : ""}>Vendre au village</button>
    ${BX.unlocked(S, "marche") ? `<button class="b2-btn" data-a="goto-mkt" data-k="${k}">Voir au marché</button>` : ""}</div>`);
}
function listSheet(k){
  const q = quote(k), cheapest = W.listings.filter(l => l.product === k).sort((a, b) => a.price - b.price)[0];
  const sug = q.p != null ? q.p : BX.vPrice(k, now()) * 1.2;
  sheetCtx = { type:"list", k };
  sheet(`<h3>${P[k].e} Mettre en vente</h3><p>Tu fixes ton prix. Tes produits sortent de la grange et attendent un acheteur ; tu peux les retirer quand tu veux.${cheapest ? ` L'offre la moins chère est à ${fmtP(+cheapest.price)}.` : ""}</p>
    ${qtyBlock(S.stock[k], S.stock[k] / 2, "q")}
    <div class="b2-field"><i class="b2-coin"></i><input data-price inputmode="decimal" value="${String(Math.round(sug * 10) / 10).replace(".", ",")}" aria-label="Prix à l'unité"><span style="font:700 13px var(--round);color:var(--ink2)">l'unité</span></div>
    <p class="b2-note">Cours du village : ${fmtP(BX.vPrice(k, now()))} · Réserve du village : ${fmtP(BX.reservePrice(k))}</p>
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
  const pr = BX.reservePrice(k), left = resLeft(k), max = Math.min(left, Math.floor(S.coins / pr));
  sheetCtx = { type:"res", k, price: pr };
  sheet(`<h3>🏘️ Réserve du village</h3><p>Une seule réserve pour tout le village, à ${fmtP(pr)} l'unité. Il en reste ${fmtN(left)} ${P[k].e} jusqu'au prochain réassort (toutes les 20 min). Si tu la vides, plus personne ne peut en acheter ici.</p>
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
  sheet(`<h3>Nouvelle exploitation</h3><p>Une seule exploitation en plus, pour toute la partie : choisis bien. Elle produit 4× moins que ta spécialité et livre dans la même grange. Coût : ${price(c)}.</p>
    <div class="b2-specs">${free.map(k => `<button class="b2-spec" data-a="farm2-go" data-k="${k}"><div class="art">${plotArt(k, 0, 6)}</div><div class="tx"><b>${P[k].e} ${esc(P[k].label)}</b><small>${esc((W.players.find(p => p.specialty === k) || {}).name ? "Concurrence " + (W.players.find(p => p.specialty === k)).name : "Personne n'en produit")}</small></div></button>`).join("")}</div>`);
}

/* =================== Actions =================== */
async function confirm(){
  const c = sheetCtx; if (!c) return;
  const q = qval("q"); if (q < 1) return;
  const btn = wrapEl.querySelector("[data-a=confirm]"); if (btn) btn.disabled = true;
  if (c.type === "sell"){
    if (S.stock[c.k] < q) return;
    const g = BX.vSell(S, c.k, q, now()); dirty = true;
    closeSheet(); draw(); sound("coin"); coinsFly(wrapEl.querySelector(`[data-k="${c.k}"]`) || wrapEl.querySelector("#b2-main"), 6); toast(`+${COIN}${fmtN(g)}`, "gold");
    return;
  }
  if (c.type === "res"){
    if (q * c.price > S.coins) return;
    queue(async () => {
      let g = 0;
      try{ g = +(await rpc("baron2_reserve_buy", { p_token: getToken(), p_product: c.k, p_qty: q })) || 0; }
      catch(e){ toast(errText(e), "err"); if (btn) btn.disabled = false; return; }
      if (g >= 1){
        const cost = g * c.price; S.coins -= cost; S.stock[c.k] += g; S.stats.bought += cost; dirty = true;
        if (W.res){ W.res.used = W.res.used || {}; W.res.used[c.k] = (+W.res.used[c.k] || 0) + g; }
      }
      closeSheet(); loadWorld(true); draw();
      if (g < 1) toast(`Trop tard : quelqu'un a vidé la réserve de ${P[c.k].label.toLowerCase()}`, "err");
      else { sound("up"); toast(g < q ? `Il n'en restait que ${fmtN(g)} ${P[c.k].e} : tu as tout pris` : `${fmtN(g)} ${P[c.k].e} achetés au village`); }
    });
    return;
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
    case "rank": if (!W.at){ loadWorld(true).then(() => S && rankSheet()); return; } rankSheet(); loadWorld(); return;
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
      toast(`${MGR[kind]} Engagé ! Il travaille tout seul, même appli fermée`);
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
      const gs0 = BX.gateState(f, t); if (gs0.st === "todo" || gs0.st === "work") return;
      const c = BX.nextParcelCost(f); if (!paid(c, b)) return;
      f.parcels.push(BX.newParcel()); sound("done"); buzz(25); draw(); save(true);
      const el = wrapEl.querySelector(`[data-plot="${f.parcels.length - 1}"]`); if (el){ el.classList.add("lvlup"); el.scrollIntoView({ behavior:"smooth", block:"center" }); }
      const np = S.farms[S.spec].parcels.length;
      if (S.cur === S.spec && (np === 2 || np === 3 || np === BAL.farmNeeds)) setTimeout(() => toast(np === 2 ? "📈 Le marché est ouvert !" : np === 3 ? "🏘️ Le village et le four sont ouverts !" : "⚔️ Tu peux ouvrir une 2e exploitation"), 700);
      return;
    }
    case "gate": {
      const gs = BX.gateState(f, t); if (gs.st !== "todo") return;
      if (!paid({ coins: gs.g.coins }, b)) return;
      f.gate = { i: f.parcels.length, until: t + gs.g.ms }; sound("done"); buzz(25); draw(); save(true);
      toast(`Travaux lancés : ${fmtT(gs.g.ms)}`); return;
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
      const g = BX.vSell(S, k, q, now()); dirty = true;
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
      const w = winnerOf(b.dataset.id);
      if (w){ toast(`Trop tard : ${esc(w.name)} a déjà eu la prime`, "err"); draw(); return; }
      const r = BX.deliver(S, b.dataset.id); if (!r) return; dirty = true;
      sound("coin"); coinsFly(b, 4);
      toast(r.complete ? `Commande terminée ! On vérifie si tu es le premier…` : `${fmtN(r.give)} livrés · +${COIN}${fmtN(r.paid)}`, "gold");
      if (r.complete){ const c = { id: b.dataset.id, slot: S.orders.slot }; S.claims.push(c); claimOrder(c); }
      draw(); return;
    }
    case "bake": bakeSheet(b.dataset.k); return;
    case "qset": { const r = wrapEl.querySelector(`[data-q="${b.dataset.id}"]`); if (r){ r.value = Math.max(+r.min, Math.floor(+r.max * +b.dataset.f)); sheetSum(); } return; }
    case "confirm": confirm(); return;
    case "close-sheet": closeSheet(); return;
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

}catch(e){ try{ console.error("Le Baron", e); }catch(_){} }
})();
