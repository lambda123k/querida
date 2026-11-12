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
// sous-produits : chaque ferme en sort un peu en plus de sa ressource (inutile pour elle, utile aux autres pour leurs outils)
const SUB = ["paille","plumes","cuir","noyaux","cire","sciure"];
const SUBOF = { ble:"paille", oeufs:"plumes", lait:"cuir", fruits:"noyaux", miel:"cire", bois:"sciure" };
// produits de luxe : faits au cellier (une ressource brute vieillit en tonneau, puis on la met en bouteille)
const AGED = ["biere","cidre","fromage","hydromel"];
const ALL = RAW.concat(CRAFT, SUB, AGED);
const AGEDOF = { ble:"biere", lait:"fromage", fruits:"cidre", miel:"hydromel" };
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
  paille: { label:"Paille", e:"🌿", floor:20, sub:true, of:"ble" },
  plumes: { label:"Plumes", e:"🪶", floor:20, sub:true, of:"oeufs" },
  cuir:   { label:"Cuir",   e:"🥾", floor:20, sub:true, of:"lait" },
  noyaux: { label:"Noyaux", e:"🌰", floor:20, sub:true, of:"fruits" },
  cire:   { label:"Cire",   e:"🕯️", floor:20, sub:true, of:"miel" },
  sciure: { label:"Sciure", e:"🍂", floor:20, sub:true, of:"bois" },
  // produits de luxe : même quantité que la matière première, mais une prime sur son cours (plus c'est long, plus ça vaut)
  biere:    { label:"Bière",    e:"🍺", floor:12.5, aged:true, src:"ble",  prem:1.25, h:2 },
  cidre:    { label:"Cidre",    e:"🍾", floor:14, aged:true, src:"fruits", prem:1.4, h:4 },
  fromage:  { label:"Fromage",  e:"🧀", floor:15.5, aged:true, src:"lait", prem:1.55, h:6 },
  hydromel: { label:"Hydromel", e:"🍷", floor:17, aged:true, src:"miel",   prem:1.7, h:8 },
};

/* ---------- Outils de l'atelier ----------
   3 emplacements (parcelles, monte-charge, charrette), 3 qualités. Un outil s'use : il dure un temps, puis il faut le refaire.
   Ils se fabriquent avec du bois (les sous-produits servent à l'établi). Ils ne marchent que sur ta ferme principale. */
const TQ = [
  { id:"simple", label:"Simple", mul:1.3, h:1, qty:1,  need:1 },
  { id:"solide", label:"Solide", mul:1.6, h:3, qty:4,  need:2 },
  { id:"dore",   label:"Doré",   mul:2,   h:8, qty:12, need:3 },
];
const TOOLP = { ble:["Faux","🌙"], oeufs:["Mangeoire","🥣"], lait:["Trayeuse","🪣"], fruits:["Sécateur","✂️"], miel:["Enfumoir","💨"], bois:["Scie","🪚"] };
const TOOLK = {
  parcel: { where:"Parcelles",    txt:"Tes fermiers récoltent plus" },
  elev:   { where:"Monte-charge", txt:"Le monte-charge porte plus", name:"Poulie", e:"⚙️", subs:["cuir","sciure"] },
  cart:   { where:"Charrette",    txt:"La charrette porte plus",   name:"Roues cerclées", e:"🛞", subs:["paille","cire"] },
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
  subRatio: 0.1,                                // 1 sous-produit pour 10 unités récoltées
  colpMult: 4,                                  // le marchand vend les sous-produits 4× le prix de base (dépannage)
  toolSecs: 600,                                // outil simple : ~10 min de production de sous-produit par ingrédient
  atelierSecs: [900, 3600, 14400],              // construire / améliorer l'atelier : 15 min, 1 h, 4 h de tes revenus
  atelierMax: 3,
  cellarMax: 6,
  cellarCost: L => ({ coins: 4e9 * Math.pow(3, L), wood: 2e7 * Math.pow(3, L) }),   // prix fixe : 4B pour le construire, ×3 par niveau
  cellarBatch: (L, eff) => Math.max(50, eff * 600 * (1 + 0.5 * (L - 1))),   // ~10 min de production par place
  luxSwing: 0.1,                                // le cours d'un produit de luxe = cours de sa matière × prime × (±10 %) : toujours plus cher
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
// bonus des outils en ce moment (uniquement sur la ferme principale)
function tmOf(s, key, now){
  if (!s || key !== s.spec || !s.tools) return { p:1, e:1, c:1 };
  const m = k => { const t = s.tools[k]; return t && t.until > now && TQ[t.q] ? TQ[t.q].mul : 1; };
  return { p: m("parcel"), e: m("elev"), c: m("cart") };
}
const TM1 = { p:1, e:1, c:1 };
const stockUnits = s => ALL.reduce((a, k) => a + (s.stock[k] || 0), 0);
const barnCap = s => BAL.barnCap(s.barn);
const barnFree = s => Math.max(0, barnCap(s) - stockUnits(s));
const quaiCap = (f, tm) => Math.max(BAL.elevCap(f.elev.lvl) * (tm ? tm.e : 1), BAL.cartCap(f.cart.lvl) * (tm ? tm.c : 1)) * 3;
const pendTotal = f => f.parcels.reduce((a, p) => a + p.pend, 0);

/* ---------- Rythmes moyens (affichage, goulot, hors ligne) ---------- */
const elevTrip = (L, n) => 2 * n / BAL.elevSpeed(L) + n * BAL.elevStop + BAL.elevUnload;
const elevRate = (L, n) => BAL.elevCap(L) / elevTrip(L, n || 1);
const cartRate = L => BAL.cartCap(L) / (2 * BAL.cartTime(L) + BAL.cartUnload);
const farmMul = (s, key) => key === s.spec ? 1 : BAL.farm2Mul;
const pRate = (s, key, i, L) => BAL.parcelRate(i, L) * farmMul(s, key);
function farmRates(f, now, mul, tm){
  const boost = f.boost > now ? 2 : 1; tm = tm || TM1;
  let P = 0; f.parcels.forEach((p, i) => P += BAL.parcelRate(i, p.lvl) * boost * (mul == null ? 1 : mul) * tm.p);
  return { P, E: elevRate(f.elev.lvl, f.parcels.length) * tm.e, C: cartRate(f.cart.lvl) * tm.c, boost };
}
// production réelle possible (en unités / s), le maillon le plus faible de chaque ferme
function effRate(s, now){
  let t = 0; for (const k in s.farms){ const r = farmRates(s.farms[k], now || 0, farmMul(s, k), tmOf(s, k, now || 0)); t += Math.min(r.P / r.boost, r.E, r.C); }
  return t;
}
const prodValue = s => effRate(s, 0) * 10;      // pièces / s au prix plancher

/* ---------- Simulation trajet par trajet (appli ouverte) ---------- */
function startParcel(p){ if (p.ph !== "idle") return false; p.ph = "work"; p.t = 0; return true; }
function startElev(f){ const e = f.elev; if (e.ph !== "idle") return false; e.ph = "down"; e.fl = 1; e.load = 0; e.t = 0; return true; }
function startCart(f, m){ const c = f.cart; if (c.ph !== "idle") return false; c.load = Math.min(BAL.cartCap(c.lvl) * (m || 1), f.quai); f.quai -= c.load; c.ph = "go"; c.pos = 0; c.t = 0; return true; }
function tickFarm(s, key, f, dt, now, ev){
  const boost = f.boost > now ? 2 : 1, n = f.parcels.length, cyc = BAL.work + 2 * BAL.walk, tm = tmOf(s, key, now);
  // les fermiers : récoltent, portent au panier, reviennent
  f.parcels.forEach((p, i) => {
    if (p.ph === "idle"){ if (!p.mgr) return; p.ph = "work"; p.t = 0; }
    p.t += dt;
    if (p.ph === "work" && p.t >= BAL.work){ p.ph = "go"; p.t = 0; }
    else if (p.ph === "go" && p.t >= BAL.walk){
      const r = pRate(s, key, i, p.lvl) * boost * tm.p, amt = r * cyc, cap = BAL.pendCap(r), nv = p.pend + amt;
      if (nv > cap){ f.lost += nv - cap; p.pend = cap; } else p.pend = nv;
      ev && ev.push({ k:"drop", key, i, amt }); p.ph = "back"; p.t = 0;
    } else if (p.ph === "back" && p.t >= BAL.walk){ p.ph = "idle"; p.t = 0; if (p.mgr){ p.ph = "work"; } }
  });
  // le monte-charge
  const e = f.elev, ecap = BAL.elevCap(e.lvl) * tm.e, v = BAL.elevSpeed(e.lvl), qc = quaiCap(f, tm);
  if (e.ph === "idle" && e.mgr && pendTotal(f) >= 1 && f.quai < qc - 1) startElev(f);
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
      const put = Math.min(e.load, Math.max(0, qc - f.quai));
      if (put > 0){ f.quai += put; e.load -= put; ev && ev.push({ k:"top", key, amt: put }); }
      if (e.load < 1e-6){ e.load = 0; e.ph = "idle"; e.fl = 0; }
    }
  }
  // la charrette
  const c = f.cart, T = BAL.cartTime(c.lvl);
  if (c.ph === "idle" && c.mgr && f.quai >= 1) startCart(f, tm.c);
  if (c.ph === "go"){ c.pos += dt / T; if (c.pos >= 1){ c.pos = 1; c.ph = "unload"; c.t = 0; } }
  else if (c.ph === "unload"){
    c.t += dt;
    if (c.t >= BAL.cartUnload){
      const put = Math.min(c.load, barnFree(s));
      if (put > 0){ s.stock[key] += put; s.stats.produced += put; addSub(s, key, put); c.load -= put; ev && ev.push({ k:"barn", key, amt: put }); }
      if (c.load < 1e-6){ c.load = 0; c.ph = "back"; }
    }
  } else if (c.ph === "back"){ c.pos -= dt / T; if (c.pos <= 0){ c.pos = 0; c.ph = "idle"; } }
}
// le sous-produit arrive dans la grange avec la récolte
function addSub(s, key, put){ const k = SUBOF[key]; if (k) s.stock[k] = (s.stock[k] || 0) + put * BAL.subRatio; }
function step(s, dt, now, ev){
  let left = dt;
  while (left > 1e-9){ const d = Math.min(left, 0.05); for (const k in s.farms) tickFarm(s, k, s.farms[k], d, now, ev); left -= d; }
  return ovenTick(s, now);
}

/* ---------- Rattrapage hors ligne : seuls les postes avec contremaître travaillent ---------- */
function flush(s, key, f){
  const e = f.elev, c = f.cart;
  if (e.load > 0){ f.quai += e.load; e.load = 0; }
  if (c.load > 0){ const put = Math.min(c.load, barnFree(s)); s.stock[key] += put; s.stats.produced += put; addSub(s, key, put); f.quai += c.load - put; c.load = 0; }
  e.ph = "idle"; e.pos = 0; e.fl = 0; c.ph = "idle"; c.pos = 0;
  f.parcels.forEach(p => { p.ph = "idle"; p.t = 0; });
}
function stepAvg(s, key, f, dt, now){
  const boost = f.boost > now ? 2 : 1, tm = tmOf(s, key, now);
  if (f.cart.mgr){ const mv = Math.min(cartRate(f.cart.lvl) * tm.c * dt, f.quai, barnFree(s)); if (mv > 0){ f.quai -= mv; s.stock[key] += mv; s.stats.produced += mv; addSub(s, key, mv); } }
  if (f.elev.mgr){
    const tot = pendTotal(f), take = Math.min(elevRate(f.elev.lvl, f.parcels.length) * tm.e * dt, tot, Math.max(0, quaiCap(f, tm) - f.quai));
    if (take > 0 && tot > 0){ const k = take / tot; f.parcels.forEach(p => p.pend -= p.pend * k); f.quai += take; }
  }
  f.parcels.forEach((p, i) => {
    if (!p.mgr) return;
    const r = pRate(s, key, i, p.lvl) * boost * tm.p, cap = BAL.pendCap(r), nv = p.pend + r * dt;
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
  // atelier et cellier : le prix suit tes revenus (sinon trop facile pour les riches, impossible pour les autres)
  atelier: s => { const sec = BAL.atelierSecs[s.atelier || 0] || 0; return { coins: nice(Math.max(500, prodValue(s) * sec)), wood: nice(Math.max(30, effRate(s, 0) * sec * 0.05)) }; },
  cellar: s => BAL.cellarCost(s.cellar.lvl),
};

/* ---------- Atelier ---------- */
const toolName = (s, kind) => kind === "parcel" ? TOOLP[s.spec][0] : TOOLK[kind].name;
const toolIcon = (s, kind) => kind === "parcel" ? TOOLP[s.spec][1] : TOOLK[kind].e;
// ingrédients : les sous-produits des autres fermes (pour les parcelles : 2 fermes voisines dans le cercle)
function toolSubs(s, kind){
  if (kind !== "parcel") return TOOLK[kind].subs;
  const i = RAW.indexOf(s.spec); return [SUB[(i + 1) % 6], SUB[(i + 3) % 6]];
}
function toolRecipe(s, kind, qi){
  const q = Math.max(5, nice(effRate(s, 0) * BAL.subRatio * BAL.toolSecs * TQ[qi].qty));
  const rec = { bois: q * 4 };
  return rec;
}
const canCraft = (s, kind, qi) => { const r = toolRecipe(s, kind, qi); return (s.atelier || 0) >= TQ[qi].need && Object.keys(r).every(k => s.stock[k] >= r[k]); };
function craftTool(s, kind, qi, now){
  if (!canCraft(s, kind, qi)) return false;
  const r = toolRecipe(s, kind, qi); for (const k in r) s.stock[k] -= r[k];
  s.tools = s.tools || {}; s.tools[kind] = { q: qi, until: now + TQ[qi].h * 3600000, t0: now };
  s.stats.tools = (s.stats.tools || 0) + 1;
  return true;
}

/* ---------- Cellier ---------- */
const cellarSlots = s => Math.min(BAL.cellarMax, s.cellar.lvl);
const cellarBatch = s => nice(BAL.cellarBatch(s.cellar.lvl, effRate(s, 0)));
function cellarPut(s, src, q, t){
  const k = AGEDOF[src]; if (!k) return false;
  q = Math.min(Math.floor(q), Math.floor(s.stock[src] || 0), cellarBatch(s)); if (q < 1) return false;
  let i = -1; for (let j = 0; j < cellarSlots(s); j++) if (!s.cellar.slots[j]){ i = j; break; }
  if (i < 0) return false;
  s.stock[src] -= q; s.cellar.slots[i] = { k, qty: q, t0: t, dur: P[k].h * 3600000 };
  return true;
}
// un tonneau est prêt au bout de sa durée (comme une cuisson) ; attendre plus longtemps ne change rien
const caskDur = sl => sl.dur || P[sl.k].h * 3600000;
const caskLeft = (sl, t) => Math.max(0, sl.t0 + caskDur(sl) - t);
const cellarYield = sl => Math.floor(sl.qty);
const ageState = (sl, t) => caskLeft(sl, t) > 0 ? "monte" : "point";
// mettre en bouteille : le tonneau devient un produit en stock, seulement quand il est prêt
function cellarBottle(s, i, t){
  const sl = s.cellar.slots[i]; if (!sl || caskLeft(sl, t) > 0) return 0;
  const q = cellarYield(sl); s.cellar.slots[i] = null;
  s.stock[sl.k] = (s.stock[sl.k] || 0) + q; s.stats.aged = (s.stats.aged || 0) + q;
  return q;
}
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
  // visiteurs des demandes surprises (ils débarquent entre deux créneaux)
  tavernier:  { name:"Le tavernier",   e:"🍻", wants:["biere","cidre","hydromel"] },
  fromager:   { name:"Le fromager",    e:"🧀", wants:["fromage"] },
  colporteur: { name:"Le marchand",  e:"🧳", wants:[], lines:["Il passe en coup de vent et repart ce soir", "Il a une charrette vide et des poches pleines", "Il revend tout en ville, il lui en faut vite"] },
  chatelaine: { name:"La châtelaine",  e:"👑", wants:[], lines:["Elle donne un bal ce soir au château", "Ses invités de marque arrivent, rien n'est prêt", "Elle ne mange que ce qu'il y a de meilleur"] },
  noce:       { name:"La noce",        e:"💒", wants:[], lines:["Un mariage au village : il manque de tout !", "Cent invités et un buffet presque vide", "La mariée a tout prévu… sauf ça"] },
  cirque:     { name:"Le cirque",      e:"🎪", wants:[], lines:["Le cirque s'installe sur la place", "Les éléphants ont faim, le chapiteau aussi", "Grande représentation ce soir"] },
  capitaine:  { name:"Le capitaine",   e:"⚓", wants:[], lines:["Son bateau lève l'ancre bientôt", "Il remplit la cale pour une longue traversée", "L'équipage réclame des provisions"] },
  forgeron:   { name:"Le forgeron",    e:"🔨", wants:[], lines:["Sa forge tourne à plein régime", "Une grosse commande d'outils l'attend", "Il travaille toute la nuit, il faut le nourrir"] },
  voisine:    { name:"La fermière d'à côté", e:"👩‍🌾", wants:[], lines:["Sa récolte a raté, elle cherche qui la dépanne", "Ses bêtes sont malades, elle rachète tout", "Elle a promis une livraison qu'elle ne peut pas tenir"] },
  meunier:    { name:"Le meunier",     e:"🧑‍🌾", wants:[], lines:["Son moulin tourne à vide", "La rivière est haute, le moulin veut du grain", "Il a promis de la farine à tout le canton"] },
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
    if (used.has(k)) k = pick(ALL.filter(x => !used.has(x) && x !== s.spec && !P[x].sub && (recipes.length || !P[x].rec)));
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
const reservePrice = k => vPrice(k, Date.now()) * 1.25;   // le village revend au cours (+ son écart)

/* ---------- Cours du village : 6 forces (11 nov. 2026) ----------
   Le cours de chaque produit = son prix de base × 6 forces. Cinq sont calculées à partir de l'heure (les mêmes
   pour tout le monde, sans serveur), la 6e est partagée par le serveur :
     1. la saison (printemps, été, automne, hiver : 1 h 30 chacune, affichée) ;
     2. la commande phare (le produit de la prochaine grande commande, annoncé 20 min avant, affiché) ;
     3. la nouvelle du village (une par créneau, au hasard, affichée) ;
     4. les liens entre produits (cachés : expliqués dans la fiche) ;
     5. l'emballement (une bulle qui gonfle puis éclate à un moment inconnu, l'avertissement est affiché) ;
     6. le village : ce que tout le monde achète et vend au village (caché, partagé par le serveur).
   Plus une petite vague de fond pour que ça bouge toujours un peu. Entre ×0,3 et ×3 le prix de base. */
const MIN = 60000, LN2 = Math.LN2;
const MK = { press:{}, med:5, bigs:{} };                       // rempli par l'interface depuis le serveur
function setMarket(o){ if (o.press) MK.press = o.press; if (o.med) MK.med = +o.med; if (o.bigs) MK.bigs = o.bigs; }
const SEASONS = [{ id:"printemps", label:"Printemps", e:"🌸" }, { id:"ete", label:"Été", e:"☀️" }, { id:"automne", label:"Automne", e:"🍂" }, { id:"hiver", label:"Hiver", e:"❄️" }];
const SEASON_MS = 90 * MIN;
// effet de chaque saison sur le prix (de -2 : abondant, pas cher, à +2 : recherché, cher)
const SEASONV = { ble:[1, -2, 0, 1], oeufs:[-2, 0, 1, 1], lait:[-1, 1, -1, 1], fruits:[1, -1, -2, 2], miel:[1, -2, 0, 1], bois:[-1, -2, 2, 1] };
function seasonAt(t){ const n = Math.floor(t / SEASON_MS); return { i: ((n % 4) + 4) % 4, left: (n + 1) * SEASON_MS - t, next: (((n + 1) % 4) + 4) % 4 }; }
function seasonLog(k, t){
  const v = SEASONV[k]; if (!v) return 0;
  const s = seasonAt(t), blend = 20 * MIN, f = s.left < blend ? 1 - s.left / blend : 0;   // les 20 dernières minutes, on glisse vers la suivante
  return 0.13 * (v[s.i] * (1 - f) + v[s.next] * f);
}
const WAVE = [0.12, 0.08, 0.05];
const VPH = {}; ALL.forEach(k => { const r = rng(hash("cours:" + k)); VPH[k] = BAL.vPeriods.map(T => ({ T: T * (0.75 + r() * 0.5), ph: r() * Math.PI * 2 })); });
function waveLog(k, t){ const sec = t / 1000; let x = 0; VPH[k].forEach((w, j) => x += WAVE[j] * Math.sin(2 * Math.PI * sec / w.T + w.ph)); return x; }
// la nouvelle du village : une par créneau de 20 min, tirée au hasard (la même pour tous), qui s'efface en ~1 h
const NEWS = {
  ble:    { up:["Orage sur les champs","La rouille attaque les épis","Les moineaux pillent les champs"], down:["Moisson record","Le meunier a trop de grain","Pluie idéale sur les champs"] },
  oeufs:  { up:["Un renard rôde au poulailler","Les poules ont la grippe","Le château commande une omelette géante"], down:["Les poules pondent comme jamais","Une charrette d'œufs arrive de la ville","Printemps des poussins"] },
  lait:   { up:["Les vaches sont malades","Le fromager de la ville achète tout","Sécheresse dans les prés"], down:["Herbe grasse dans les prés","Les vaches donnent sans compter","Trop de lait au village"] },
  fruits: { up:["La grêle abîme le verger","Les guêpes dévorent les pommes","La confiturerie du château a faim"], down:["Les arbres croulent sous les fruits","Récolte précoce au verger","Arrivage de fruits du sud"] },
  miel:   { up:["Les abeilles ont essaimé","Un ours a visité les ruches","Les apothicaires s'arrachent le miel"], down:["Les fleurs sont partout","Les ruches débordent","Un colporteur brade son miel"] },
  bois:   { up:["Le pont du village s'est effondré","L'hiver s'annonce rude","Le seigneur construit une tour"], down:["Une tempête a couché la forêt","Les bûcherons de la vallée arrivent","Le chantier du château est fini"] },
};
const NEWS_MS = 30 * MIN;
const newsCache = {};
function newsOf(slot){
  if (slot in newsCache) return newsCache[slot];
  const r = rng(hash("nouvelle:" + slot)); let n = null;
  if (r() >= 0.12){
    const k = RAW[Math.floor(r() * RAW.length)], up = r() < 0.5, mag = 0.28 + r() * 0.32, l = NEWS[k][up ? "up" : "down"];
    n = { slot, k, up, mag, txt: l[Math.floor(r() * l.length)] };
  }
  return newsCache[slot] = n;
}
function newsLog(k, t){
  const cur = Math.floor(t / BAL.slotMs); let x = 0;
  for (let s = cur - 3; s <= cur; s++){ const n = newsOf(s); if (!n || n.k !== k) continue; const dt = t - s * BAL.slotMs; if (dt >= 0) x += (n.up ? 1 : -1) * n.mag * Math.exp(-dt / NEWS_MS); }
  return x;
}
// la commande phare : le produit de la prochaine grande commande monte pendant les 20 min d'annonce, puis redescend
function phareLog(k, t){
  const sl = Math.floor(t / BAL.slotMs), f = (t - sl * BAL.slotMs) / BAL.slotMs; let x = 0;
  if (MK.bigs[sl + 1] === k) x += 0.22 * f;
  if (MK.bigs[sl] === k) x += 0.22 * (1 - 0.7 * f);
  if (MK.bigs[sl - 1] === k) x += 0.066 * (1 - f);
  return x;
}
// le village (partagé) : la poussée des achats (+) et des ventes (-) de tout le monde, oubliée de moitié en 20 min
const HALF = 20 * MIN;
function pressAt(k, t){
  const r = MK.press[k]; if (!r) return 0;
  if (t >= r.t) return r.p * Math.pow(0.5, (t - r.t) / HALF);
  const h = r.h || []; let e = null;
  for (let j = h.length - 1; j >= 0; j--) if (h[j][0] <= t){ e = h[j]; break; }
  return e ? e[1] * Math.pow(0.5, (t - e[0]) / HALF) : 0;
}
const DEPTH = { pain:0.5, confiture:0.5, crepes:0.34, tarte:0.34, gateau:0.25 };
const depth = k => Math.max(1, MK.med * 1800 * (P[k].sub ? 0.1 : DEPTH[k] || 1));
function pushLocal(k, units, t){
  const r = MK.press[k] || { p:0, t, h:[] }, p = Math.max(-4, Math.min(4, pressAt(k, t) + units / depth(k)));
  MK.press[k] = { p, t, h: (r.h || []).concat([[t, p]]) };
}
// l'emballement : par moments, un produit gonfle longtemps… puis la bulle éclate d'un coup (on ne sait pas quand)
const EPOCH = 7 * 3600000;
function bubbleOf(k, E){
  const r = rng(hash("bulle:" + k + ":" + E)); if (r() > 0.6) return null;
  const off = (hash("decal:" + k) % 1000) / 1000 * EPOCH;
  return { s: E * EPOCH + off + r() * 2.5 * 3600000, d: (70 + r() * 150) * MIN };
}
const CRASH = 6 * MIN, RECOV = 40 * MIN, PEAK = 0.6, DIP = -0.3;
function bubbleAt(k, t){
  if (!SEASONV[k]) return null;
  const off = (hash("decal:" + k) % 1000) / 1000 * EPOCH, E = Math.floor((t - off) / EPOCH);
  for (const e of [E, E - 1]){
    const b = bubbleOf(k, e); if (!b) continue;
    const a = t - b.s; if (a < 0) continue;
    if (a < b.d){ const x = a / b.d; return { ph:"monte", x: PEAK * Math.pow(x, 1.6), warn: a > 45 * MIN }; }
    if (a < b.d + CRASH) return { ph:"krach", x: PEAK + (DIP - PEAK) * (a - b.d) / CRASH };
    if (a < b.d + CRASH + RECOV) return { ph:"apres", x: DIP * (1 - (a - b.d - CRASH) / RECOV) };
  }
  return null;
}
// les liens entre produits (cachés) : qui entraîne qui
const LINKS = { oeufs:[["lait", 0.35]], lait:[["oeufs", 0.35]], fruits:[["miel", 0.3]], miel:[["fruits", 0.3]], ble:[["bois", -0.3]], bois:[["ble", -0.3]] };
function fundLog(k, t){ return waveLog(k, t) + seasonLog(k, t) + newsLog(k, t) + phareLog(k, t) + LN2 * pressAt(k, t); }
function linkLog(k, t){
  if (P[k].rec){ const ks = Object.keys(P[k].rec); return 0.7 * ks.reduce((a, x) => a + fundLog(x, t), 0) / ks.length; }
  if (P[k].sub) return 0.6 * fundLog(P[k].of, t);
  return (LINKS[k] || []).reduce((a, [x, w]) => a + w * fundLog(x, t), 0);
}
function vMul(k, t){
  if (P[k].aged){ const w = VPH[k][2]; return vMul(P[k].src, t) * Math.exp(BAL.luxSwing * Math.sin(2 * Math.PI * (t / 1000) / w.T + w.ph) + LN2 * pressAt(k, t)); }
  const b = bubbleAt(k, t);
  return Math.exp(Math.max(-1.2, Math.min(1.1, fundLog(k, t) + linkLog(k, t) + (b ? b.x : 0))));
}
const vPrice = (k, t) => P[k].floor * vMul(k, t);
const SPREAD = 1.25;                                          // le village revend 25 % plus cher qu'il ne rachète
const vAsk = (k, t) => vPrice(k, t) * SPREAD;
const vMyPrice = (s, k, t) => vPrice(k, t);
// vendre q unités d'un coup au village : le cours baisse à chaque unité vendue
function vValue(s, k, q, t){
  if (q <= 0) return 0;
  const A = depth(k); return Math.floor(vPrice(k, t) * A / LN2 * (1 - Math.exp(-LN2 * q / A)));
}
// acheter q unités au village : le cours monte à chaque unité achetée
function vBuyCost(k, q, t){
  if (q <= 0) return 0;
  const A = depth(k); return Math.ceil(vAsk(k, t) * A / LN2 * (Math.exp(LN2 * q / A) - 1));
}
function vBuyMax(k, coins, t){ const A = depth(k), x = 1 + coins * LN2 / (vAsk(k, t) * A); return Math.max(0, Math.floor(A / LN2 * Math.log(x))); }
function vSell(s, k, q, t){
  q = Math.min(Math.floor(q), Math.floor(s.stock[k] || 0)); if (q < 1) return 0;
  const g = vValue(s, k, q, t);
  s.stock[k] -= q; pushLocal(k, -q, t);
  s.coins += g; s.stats.earned += g; s.stats.villageSold += g;
  return g;
}

/* ---------- Le pari (une position à effet de levier) ----------
   Tu mises sur la hausse ou la baisse d'un produit. Ta mise suit le cours du village ×2. Tu te retires quand tu veux.
   Si le cours part trop dans le mauvais sens, ta mise tombe à zéro et le pari se ferme tout seul. Petite taxe à l'ouverture. */
const BET = { lev:2, fee:0.03, max:3 };
const betCap = (k, t) => Math.max(200, nice(depth(k) * 0.5 * vPrice(k, t)));     // ~15 min de production du groupe
const betValue = (b, t) => Math.max(0, b.m * (1 + b.d * BET.lev * (vPrice(b.k, t) / b.p0 - 1)));
const betLimit = b => b.p0 * (1 - b.d / BET.lev);                                 // le cours où la mise tombe à zéro
function openBet(s, k, d, m, t){
  m = Math.floor(m); s.bets = s.bets || [];
  const fee = Math.ceil(m * BET.fee);
  if (m < 1 || s.bets.length >= BET.max || m > betCap(k, t) || m + fee > s.coins) return null;
  const b = { id: t + "-" + k, k, d: d > 0 ? 1 : -1, m, p0: vPrice(k, t), t0: t, chk: t };
  s.coins -= m + fee; s.bets.push(b); s.stats.betIn = (s.stats.betIn || 0) + m;
  return b;
}
function closeBet(s, id, t){
  const b = (s.bets || []).find(x => x.id === id); if (!b) return null;
  const v = Math.floor(betValue(b, t)); s.coins += v; s.stats.betOut = (s.stats.betOut || 0) + v;
  s.bets = s.bets.filter(x => x !== b); return v;
}
// au retour (ou en jouant), on vérifie que le cours n'a pas touché la limite entre-temps
function checkBets(s, t){
  const out = [];
  (s.bets || []).slice().forEach(b => {
    const from = Math.max(b.chk || b.t0, t - 24 * 3600000), step = Math.max(2 * MIN, (t - from) / 400);
    let dead = false;
    for (let x = from; x <= t && !dead; x += step) if (betValue(b, x) <= 0) dead = true;
    if (!dead && betValue(b, t) <= 0) dead = true;
    if (dead){ s.bets = s.bets.filter(y => y !== b); out.push(b); } else b.chk = t;
  });
  return out;
}

/* ---------- Fortune ---------- */
function fortune(s, t){
  t = t || Date.now(); let st = 0; (s.bets || []).forEach(b => st += betValue(b, t)); ALL.forEach(k => st += (s.stock[k] || 0) * P[k].floor);
  if (s.cellar) s.cellar.slots.forEach(sl => { if (sl) st += sl.qty * P[P[sl.k].src].floor; });
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
    case "atelier": return np >= 3;
    case "farm2": return np >= BAL.farmNeeds && Object.keys(s.farms).length < BAL.farmMax;
  }
  return true;
}
// le maillon lent de la ferme
function bottleneck(s, key, now){
  const f = s.farms[key], r = farmRates(f, now, farmMul(s, key), tmOf(s, key, now));
  if (barnFree(s) < 1) return "barn";
  const anyMgr = f.parcels.some(p => p.mgr) || f.elev.mgr || f.cart.mgr;
  if (!anyMgr) return null;
  if (f.quai >= quaiCap(f, tmOf(s, key, now)) * 0.9 || r.C < Math.min(r.P, r.E) * 0.95) return "cart";
  if (r.E < r.P * 0.95) return "elev";
  return null;
}

return { SUB, SUBOF, AGED, AGEDOF, TQ, TOOLK, tmOf, toolName, toolIcon, toolRecipe, canCraft, craftTool, cellarSlots, cellarBatch, caskLeft, caskDur, cellarPut, cellarYield, cellarBottle, ageState,
  RAW, CRAFT, ALL, P, BAL, gateOf, gateState, newParcel, fixFarm, quaiCap, pendTotal, elevRate, cartRate, startParcel, startElev, startCart, CHARS, MILES, isPalier, newState, newFarm, step, catchUp, farmRates, effRate, prodValue,
  stockUnits, barnCap, barnFree, costs, canPay, pay, bulk, nextParcelCost, nice, ovenTick, ovenBatch, ovenDur, canBake,
  ensureOrders, genOrders, deliver, bigOf, fullBonus, reserveLeft, reservePrice, fortune, unlocked, bottleneck, farmMul, pRate, vMul, vPrice, vMyPrice, vValue, vSell,
  setMarket, MK, SEASONS, SEASONV, seasonAt, newsOf, bubbleAt, LINKS, depth, vAsk, vBuyCost, vBuyMax, pushLocal, SPREAD, BET, betCap, betValue, betLimit, openBet, closeBet, checkBets };
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
let mkt = { k: null, period: "24h", open: false, tab: "market" };

function publicStats(){
  return { fortune: BX.fortune(S), prod: Math.round(BX.prodValue(S) * 100) / 100, baked: Math.floor(S.stats.baked), orders: S.stats.orders,
    traded: Math.floor(S.stats.sold + S.stats.bought), farms: Object.keys(S.farms), parcels: S.farms[S.spec].parcels.length, pio: S.reform ? 1 : 0,
    etb: S.etb && S.etb.job && S.etb.job.cid === etbCid(now()) ? S.etb.job.cid : 0, crafted: S.stats.crafted || 0 };
}
function applyCredits(list){
  const msgs = [], bank = [];
  const arr = (list || []).slice().sort((a, b) => a.id - b.id);
  for (const c of arr){
    if (+c.id <= (S.credit_seen || 0)) continue;
    if (c.product === "casino_win" && CZ.hold) break;          // le gain arrive quand la bille s'arrête
    S.coins += +c.coins || 0; S.credit_seen = +c.id; dirty = true;
    if (c.product === "casino_win") continue;
    if (c.product === "casino"){ bank.push(c); continue; }
    S.stats.sold += +c.coins || 0; S.stats.earned += +c.coins || 0;
    msgs.push(c);
  }
  if (bank.length){
    const tot = bank.reduce((a, c) => a + (+c.coins || 0), 0), who = bank[bank.length - 1].buyer || "Un joueur";
    toast(tot >= 0 ? `🎰 Casino : ${bank.length === 1 ? esc(who) + " a perdu" : "les joueurs ont perdu"}, ta banque encaisse +${COIN}${fmtN(tot)}` : `🎰 Casino : ${bank.length === 1 ? esc(who) + " a gagné" : "les joueurs ont gagné"}, ta banque paie −${COIN}${fmtN(-tot)}`, tot >= 0 ? "gold" : "");
    sound(tot >= 0 ? "coin" : "tap");
    if (view === "casino") loadCasino();
  }
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
  if (!s.ord2){ s.ord2 = 1; s.orders = { slot:0, list:[], prog:{} }; }
  s.ord3 = 1; s.v4 = 1; s.v5 = 1;                                                  // atelier, sous-produits, cellier
  s.etb = Object.assign({ rep:0, job:null, inv:{} }, s.etb || {}); s.etb.inv = s.etb.inv || {};
  s.bets = s.bets || []; s.tools = s.tools || {}; s.atelier = s.atelier || 0; s.cellar = s.cellar || { lvl:0, slots:[] };                                                            // demandes surprises (11 nov. 2026)   // commandes du village en course (11 nov. 2026)
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
    BX.setMarket({ press: r.press || {}, med: r.med });
    W = { res: r.reserve || null, players: r.players || [], listings: r.listings || [], trades: (r.trades || []).map(t => Object.assign({}, t, { ts: new Date(t.at).getTime() })).sort((a, b) => a.ts - b.ts), at: now() };
    await loadOrders(true); await loadEtb(); loadCasino();
    if (wrapEl && (view === "market" || view === "village" || view === "atelier") && !gestOpen && !sheetOpen) draw();
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
.b2-tab{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:1px;padding:6px 1px 5px;border-radius:12px;color:#F5DFC2!important;font:700 11.5px var(--round)!important;position:relative}
.b2-tab .i{font-size:22px;line-height:1.1;filter:saturate(.85)}
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
.b2-slot small{display:block;font:700 12px var(--round);color:var(--ink2)}
.b2-tool.off{opacity:.92}.b2-tool.off .ic{filter:grayscale(1);opacity:.6}
.b2-tool.gold{background:linear-gradient(#FFF6D8,#FFE9A8)}
.b2-q{display:inline-block;border-radius:999px;padding:1px 7px;font:800 10.5px var(--round);vertical-align:2px;background:#E8DCC8;color:var(--ink)}
.b2-q.q1{background:#D9E6F5;color:#2C4E7C}.b2-q.q2{background:#F6C543;color:#5A3A00}
.b2-mul{font:900 13px var(--round);color:var(--up2)}
.b2-rec.lock{opacity:.55}
.b2-cask .b2-btn{white-space:nowrap}
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
.b2-luxe{display:grid;gap:8px}
.b2-cask .st{font-weight:800;color:var(--up2)!important}
.b2-cask.point{box-shadow:0 0 0 2px #F2B33D,0 2px 0 rgba(124,74,36,.2)}.b2-luxe .b2-slot{color:var(--ink)}
.b2-mhead{padding:10px 2px 2px}.b2-mhead h2{margin:0;font:400 italic 30px var(--disp);color:var(--chalk)}.b2-mhead small{font:700 12.5px var(--round);color:var(--chalk2)}
.b2-msec{margin:18px 2px 8px;font:800 12px var(--round);letter-spacing:.08em;text-transform:uppercase;color:var(--chalk2)}
.b2-mlist{background:var(--board2);border-radius:16px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(239,234,219,.08)}
.b2-mrow{display:flex;align-items:center;gap:10px;width:100%;padding:11px 12px;text-align:left;color:var(--chalk)!important;background:none!important;border-top:1px solid rgba(239,234,219,.07)!important}
.b2-mrow:first-child{border-top:0!important}
.b2-mrow:active{background:rgba(255,255,255,.05)!important}
.b2-mrow .ic{width:36px;height:36px;display:grid;place-items:center;font-size:26px;flex:none;background:rgba(239,234,219,.92);border-radius:11px}
.b2-mrow .ic .b2-ic{font-size:24px}
.b2-mrow .nm{flex:1;min-width:0}.b2-mrow .nm b{display:block;font:800 15px var(--round);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.b2-mrow .nm small{display:block;font:700 12px var(--round);color:var(--chalk2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.b2-spark{width:58px;height:24px;flex:none}
.b2-mrow .pr{width:62px;text-align:right;flex:none;display:flex;flex-direction:column;font:800 12px var(--round);font-variant-numeric:tabular-nums}
.b2-mrow .pr b{font:900 15px var(--round);color:var(--chalk)}
.b2-tag{display:inline-block;vertical-align:1px;border-radius:999px;padding:1px 6px;font:800 10px var(--round);background:rgba(239,234,219,.15);color:var(--chalk)}
.b2-tag.gold{background:#F2B33D;color:#3B1F17}
.b2-mtop{display:flex;align-items:center;gap:10px;padding:10px 0 4px}
.b2-mtop .ic{width:34px;height:34px;display:grid;place-items:center;font-size:24px;background:rgba(239,234,219,.92);border-radius:10px}
.b2-mtop .ic .b2-ic{font-size:22px}
.b2-mtop b{font:400 italic 26px var(--disp);color:var(--chalk)}
.b2-back{width:36px;height:36px;border-radius:12px;background:var(--board2)!important;color:var(--chalk)!important;font:900 22px var(--round)!important;display:grid;place-items:center;box-shadow:inset 0 0 0 1px rgba(239,234,219,.12)}
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
.b2-order .line{font:600 italic 12.5px/1.25 var(--round);color:var(--ink2);margin:1px 0 2px}
.b2-order.surp{background:#FFF7D6;box-shadow:0 0 0 2px #F2B33D,0 3px 0 rgba(124,74,36,.35),0 8px 18px rgba(59,31,23,.15);padding-top:22px}
.b2-order.surp.new{animation:b2-surp .5s ease-out}
.b2-order.surp.gros{background:#FDEBDD;box-shadow:0 0 0 2px #E0703A,0 3px 0 rgba(124,74,36,.35),0 8px 18px rgba(59,31,23,.15)}
@keyframes b2-surp{0%{transform:scale(.85) rotate(-3deg);opacity:0}70%{transform:scale(1.03)}100%{transform:none;opacity:1}}
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
/* marché : saisons, forces, fiche, paris (11 nov. 2026) */
.b2-sea{border:0;cursor:pointer}.b2-sea .lb{font-size:13px}
.b2-mhead .b2-seachip{display:inline-block;margin-top:4px;padding:3px 10px!important;border-radius:999px!important;background:rgba(239,234,219,.12)!important;color:var(--chalk)!important;font:800 12.5px var(--round)!important}
.b2-news{display:flex;align-items:center;gap:10px;width:100%;margin:12px 0 0;padding:10px 12px!important;border-radius:14px!important;background:#FFF4E0!important;color:var(--ink)!important;text-align:left;box-shadow:0 3px 0 rgba(0,0,0,.25)}
.b2-news.calm{background:rgba(239,234,219,.08)!important;color:var(--chalk)!important;box-shadow:none}
.b2-news .i{font-size:24px;line-height:1}.b2-news .sp{flex:1;min-width:0}
.b2-news b{display:block;font:400 italic 19px/1.15 var(--disp)}
.b2-news small{display:block;font:800 12px var(--round);opacity:.75;margin-top:2px}
.b2-news .go{font:900 22px var(--round);opacity:.5}
.b2-intro{position:relative;margin:12px 0 0;padding:10px 34px 10px 12px;border-radius:14px;background:rgba(242,179,61,.16);border:1px solid rgba(242,179,61,.5);font:700 13px/1.4 var(--round);color:var(--chalk)}
.b2-intro > b{display:block;color:var(--gold);font-size:14px}
.b2-intro button{position:absolute;top:6px;right:8px;font-size:18px!important;color:var(--chalk2)!important}
.b2-fhead{display:flex;align-items:center;justify-content:space-between;gap:8px}
.b2-q{width:30px;height:30px;border-radius:50%!important;background:rgba(239,234,219,.15)!important;color:var(--chalk)!important;font:900 16px var(--round)!important;flex:none;margin-top:12px}
.b2-q.top{margin:0 0 0 auto}
/* l'établi (12 nov. 2026) */
.b2-erep{display:flex;align-items:center;gap:8px;margin-top:8px;font:900 12px var(--round);color:var(--gold2)}
.b2-erep .bar{flex:1;height:8px;border-radius:9px;background:rgba(59,31,23,.1);overflow:hidden}.b2-erep .bar i{display:block;height:100%;background:linear-gradient(90deg,#F2B33D,#E08A1E)}
.b2-client{margin-top:12px;border-radius:16px;background:linear-gradient(160deg,#3B2A4F,#2B1E3A);color:#F6EEDD;padding:14px;position:relative;overflow:hidden}
.b2-client.king{background:linear-gradient(160deg,#6B4A12,#3E2A08);box-shadow:0 0 0 2px #F2B33D}
.b2-client .ctop{display:flex;gap:12px;align-items:center}
.b2-client .av{width:54px;height:54px;border-radius:50%;background:#F4E2C4;display:grid;place-items:center;font-size:32px;border:3px solid var(--gold);flex:none}
.b2-client .cn{font:900 16px var(--round);flex:1;min-width:0}.b2-client .cn small{display:block;font:800 12px var(--round);opacity:.7;margin-top:1px}
.b2-client .timer{align-self:flex-start;background:rgba(255,255,255,.12);border-radius:999px;padding:4px 10px;font:900 12px var(--round);white-space:nowrap;font-variant-numeric:tabular-nums}
.b2-client .quote{font:400 italic 20px/1.2 var(--disp);margin:12px 0 10px}
.b2-client .obj{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.08);border-radius:14px;padding:10px}
.b2-client .obj .big{font-size:36px;line-height:1}.b2-client .obj b{font:900 15px var(--round);display:block}.b2-client .obj small{font:800 12px var(--round);opacity:.75}
.b2-client .prime{margin-left:auto;text-align:right}.b2-client .prime b{font:900 20px var(--round);color:#FFD45E;display:flex;align-items:center;gap:4px;justify-content:flex-end}.b2-client .prime small{display:block;font:800 11px var(--round);opacity:.7}
.b2-eing{display:flex;gap:6px;margin-top:10px}
.b2-eing span{flex:1;min-width:0;text-align:center;border-radius:12px;padding:7px 4px;background:rgba(255,255,255,.1);font:900 12.5px var(--round);font-variant-numeric:tabular-nums}
.b2-eing span .b2-ic{display:block;margin:0 auto 2px;font-size:26px}.b2-eing span b{display:block;font:900 12px var(--round)}
.b2-eing .ko{box-shadow:inset 0 0 0 2px #FF8A70;color:#FFB3A2}.b2-eing .ok{box-shadow:inset 0 0 0 2px #6EE09A}
.b2-esteps{display:flex;align-items:center;justify-content:center;gap:6px;margin:12px 0 10px;opacity:.9}
.b2-esteps em{font-style:normal;font-size:18px;background:rgba(255,255,255,.12);width:34px;height:34px;border-radius:50%;display:grid;place-items:center}
.b2-esteps em.done{background:#2F9E57}.b2-esteps i{font-style:normal;opacity:.6}
.b2-client .b2-two{margin-top:0}.b2-client .b2-btn.big{width:100%;margin-top:10px}
.b2-client .race{margin-top:10px;font:800 12px var(--round);opacity:.8;text-align:center}
.b2-ewin{margin-top:12px;text-align:center;background:rgba(255,255,255,.08);border-radius:12px;padding:10px}.b2-ewin b{font:900 15px var(--round)}.b2-ewin small{display:block;font:800 12px var(--round);opacity:.75;margin-top:2px}
.b2-einv{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.b2-einv div{background:#FFFAF1;border-radius:12px;padding:8px;display:flex;align-items:center;gap:8px;box-shadow:0 2px 0 rgba(124,74,36,.2)}
.b2-einv span{font-size:26px}.b2-einv b{font:900 13px var(--round);min-width:0}.b2-einv small{display:block;font:800 11px var(--round);color:var(--ink2)}
.b2-geste{position:absolute;inset:0;z-index:30;background:radial-gradient(circle at 50% 30%,#5A3A22,#2A1A10);color:#F6EEDD;display:flex;flex-direction:column;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px 20px;animation:b2-in .25s ease;touch-action:manipulation}
.b2-geste .gtop{display:flex;align-items:center;gap:10px;width:100%;max-width:420px;font:900 13px var(--round)}
.b2-geste .x{width:36px;height:36px;border-radius:50%!important;background:rgba(255,255,255,.12)!important;color:#F6EEDD!important;font-size:18px!important}
.b2-geste .prog{flex:1;display:flex;gap:6px}.b2-geste .prog i{flex:1;height:8px;border-radius:9px;background:rgba(255,255,255,.15)}.b2-geste .prog i.on{background:var(--gold)}.b2-geste .prog i.done{background:#6EE09A}
.b2-geste .gt{text-align:center;margin-top:10px}.b2-geste .gt b{font:400 italic 32px/1.1 var(--disp);display:block}.b2-geste .gt small{font:800 14px var(--round);opacity:.75}
.b2-geste .stage{margin-top:14px;width:min(330px,86vw);aspect-ratio:1.08;border-radius:24px;background:repeating-linear-gradient(90deg,#9B6A3E 0 30px,#93633A 30px 31px);box-shadow:inset 0 0 40px rgba(0,0,0,.35),0 8px 0 #4A2C15;position:relative;display:grid;place-items:center}
.b2-geste .stage svg{width:92%;height:92%}
.b2-geste .fb{margin-top:16px;font:900 18px var(--round);min-height:24px}.b2-geste .fb.p{color:#9CF2BD}.b2-geste .fb.r{color:#FF8A70}
.b2-geste .chips{display:flex;gap:8px;margin-top:10px}.b2-geste .chips span{background:rgba(255,255,255,.1);border-radius:12px;padding:7px 10px;font:900 12.5px var(--round)}
.b2-geste .chips .p{background:rgba(110,224,154,.2);color:#9CF2BD}.b2-geste .chips .r{background:rgba(255,138,112,.2);color:#FFB3A2}
.b2-geste .tap{margin-top:auto;width:100%;max-width:340px;padding:20px!important;border-radius:20px!important;font:900 21px var(--round)!important;background:var(--gold)!important;color:#4A2A0A!important;box-shadow:0 6px 0 var(--gold2);-webkit-user-select:none;user-select:none;touch-action:none}
.b2-geste .tap:active{transform:translateY(3px);box-shadow:0 3px 0 var(--gold2)}.b2-geste .tap:disabled{opacity:.5}
.b2-geste .foot{font:800 12.5px var(--round);opacity:.65;margin:12px 0 0;text-align:center}
.b2-geste .gauge{position:absolute;left:24px;top:24px;bottom:24px;width:46px;border-radius:14px;background:rgba(0,0,0,.35);overflow:hidden;box-shadow:inset 0 0 0 3px rgba(255,255,255,.2)}
.b2-geste .gauge .zone{position:absolute;left:0;right:0;background:rgba(110,224,154,.55);box-shadow:0 0 0 2px #6EE09A}
.b2-geste .gauge .fill{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(#E8A33A,#B5701A);opacity:.85}
.b2-geste .plank{font-size:110px;margin-left:50px;filter:drop-shadow(0 6px 6px rgba(0,0,0,.4))}

.b2-fh4{margin:4px 0 6px;font:800 12px var(--round);letter-spacing:.08em;text-transform:uppercase;color:var(--ink2)}
.b2-fbox{border-radius:12px;background:rgba(59,31,23,.06);padding:0 10px;margin-bottom:14px}
.b2-fiche .b2-frow.up b,.b2-fiche .b2-frow .up{color:var(--up2)!important}.b2-fiche .b2-frow.down b,.b2-fiche .b2-frow .down{color:var(--red)!important}.b2-fiche .b2-frow.warn b{color:var(--gold2)!important}.b2-fiche .b2-frow small{color:var(--ink2)}
.b2-mtabs{margin-top:12px}
.b2-pint{margin:12px 0 0;font:700 13px/1.4 var(--round);color:var(--chalk2)}
.b2-pempty{color:var(--chalk2)}
.b2-prow{display:flex;align-items:center;gap:8px;padding:8px 10px 8px 0;border-top:1px solid rgba(239,234,219,.07)}
.b2-prow:first-child{border-top:0}
.b2-pnm{flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:3px 0 3px 12px;text-align:left;color:var(--chalk)!important;background:none!important}
.b2-pnm .ic{width:36px;height:36px;display:grid;place-items:center;font-size:26px;flex:none;background:rgba(239,234,219,.92);border-radius:11px}
.b2-pnm .nm{min-width:0}.b2-pnm b{display:block;font:800 15px var(--round);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.b2-pnm small{display:block;font:800 12px var(--round);color:var(--chalk2);font-variant-numeric:tabular-nums}
.b2-pb{width:46px;height:40px;flex:none;border-radius:12px!important;font-size:20px!important;display:grid;place-items:center}
.b2-pb.up{background:#2F9E5B!important;box-shadow:0 3px 0 #1E6E3E}.b2-pb.down{background:#C9452B!important;box-shadow:0 3px 0 #8E2C19}
.b2-frow{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid rgba(127,127,127,.15)}
.b2-frow:first-child{border-top:0}
.b2-frow .i{font-size:20px;line-height:1.1;width:24px;text-align:center;flex:none}
.b2-frow .tx{flex:1;min-width:0}.b2-frow b{display:block;font:800 14px/1.3 var(--round)}
.b2-frow small{display:block;font:700 12.5px/1.35 var(--round);opacity:.72;margin-top:1px}
.b2-frow .up{color:var(--up)}.b2-frow .down{color:var(--down)}
.b2-board .b2-frow .up{color:#6EE09A}.b2-board .b2-frow .down{color:#FF8A70}
.b2-board .b2-frow.up b{color:#6EE09A}.b2-board .b2-frow.down b{color:#FF8A70}.b2-board .b2-frow.warn b{color:#F2B33D}
.b2-fiche{max-height:56vh;overflow:auto;margin:0 0 12px;color:var(--ink)}
.b2-seas{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 0 6px 34px}
.b2-seas span{background:rgba(59,31,23,.06);border-radius:10px;padding:5px 8px;font:800 12px var(--round);color:var(--ink2)}
.b2-seas span.on{box-shadow:0 0 0 2px var(--gold)}
.b2-seas b{display:block;font:800 12.5px var(--round);color:var(--ink)}
.b2-seas b.up{color:var(--up2)}.b2-seas b.down{color:var(--red)}
.b2-ord.bet .pr{width:auto;min-width:56px}
.b2-ord.bet .who{white-space:normal}.b2-ord.bet .who small{white-space:normal;line-height:1.3}
.b2-ord .pr.up{color:#6EE09A}.b2-ord .pr.down{color:#FF8A70}
@media (max-width:420px){ .b2-sea .lb{display:none} .b2-sea{padding:4px 6px!important} }
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
  // sous-produits
  paille: `<path d="M7 9 l-1 -4 M11 9 l0 -5 M16 9 l1 -5 M21 9 l1 -4 M25 9 l2 -3" stroke="#D9B04A" stroke-width="1.4" stroke-linecap="round"/><rect x="4" y="9" width="24" height="17" rx="3.5" fill="#EBC761" stroke="#B88A2B" stroke-width="1.3"/><path d="M6 13.5 h20 M6 17.5 h20 M6 21.5 h20" stroke="#C9A04A" stroke-width="1"/><path d="M11 9 v17 M21 9 v17" stroke="#A0522D" stroke-width="2"/>`,
  plumes: `<path d="M25 3 C 13 5, 6 15, 8 26 C 19 23, 27 14, 25 3z" fill="#FBF7EE" stroke="#B9AE98" stroke-width="1.3"/><path d="M5 29 L 21 9" stroke="#8C7F68" stroke-width="1.5" stroke-linecap="round"/><path d="M12 19 l-3 -2 M15 15 l-3 -3 M18 12 l-2 -4 M14 21 l4 1 M17 17 l5 0 M20 13 l4 -1" stroke="#CFC4AE" stroke-width="1" stroke-linecap="round"/>`,
  cuir: `<path d="M8 5 l3 4 h10 l3 -4 l2.5 5.5 l-2 4 l2 6 l-2.5 6 l-3.5 -2.5 h-9 l-3.5 2.5 l-2.5 -6 l2 -6 l-2 -4z" fill="#A9693B" stroke="#6B3E1E" stroke-width="1.3" stroke-linejoin="round"/><path d="M11.5 12 h9 v10 h-9z" fill="none" stroke="#E2B27A" stroke-width="1.1" stroke-dasharray="2 1.6"/>`,
  noyaux: `<ellipse cx="11.5" cy="17" rx="6" ry="9" transform="rotate(-18 11.5 17)" fill="#B9773E" stroke="#7A4A20" stroke-width="1.2"/><path d="M9 10 q2 7 4.5 14" stroke="#7A4A20" stroke-width="1" fill="none"/><ellipse cx="21.5" cy="18" rx="5.5" ry="8.5" transform="rotate(20 21.5 18)" fill="#C98A50" stroke="#7A4A20" stroke-width="1.2"/><path d="M23.5 11 q-2 7 -4 13.5" stroke="#7A4A20" stroke-width="1" fill="none"/>`,
  cire: `${[[11,11],[21,11],[16,19.5],[6,19.5],[26,19.5]].map(([x,y]) => `<path d="M${x} ${y-5.5} l4.8 2.75 v5.5 l-4.8 2.75 l-4.8 -2.75 v-5.5z" fill="#F7DC86" stroke="#C99A2E" stroke-width="1.2"/>`).join("")}<path d="M16 15 l4.8 2.75 v5.5 l-4.8 2.75 l-4.8 -2.75 v-5.5z" fill="#F2C24B"/>`,
  sciure: `<path d="M3 27 q4 -13 13 -14 q9 1 13 14z" fill="#E2BC86" stroke="#A8794A" stroke-width="1.3"/>${[[10,22],[14,18],[18,21],[21,24],[13,25],[17,16],[23,20],[8,25]].map(([x,y]) => `<circle cx="${x}" cy="${y}" r="0.9" fill="#A8794A"/>`).join("")}<path d="M6 10 l2 -2 M24 8 l2 1 M14 7 l1 -2" stroke="#C99A62" stroke-width="1.3" stroke-linecap="round"/>`,
  // cellier
  biere: `<rect x="6" y="10" width="15" height="18" rx="2.5" fill="#F2A93B" stroke="#B5701A" stroke-width="1.3"/><path d="M21 13 h3 a3 3 0 0 1 3 3 v4 a3 3 0 0 1 -3 3 h-3" fill="none" stroke="#B5701A" stroke-width="2"/><path d="M5 11 q0 -5 5 -4 q2 -3 5 -1 q4 -2 6 2 q2 1 1 3z" fill="#FFFDF5" stroke="#D9CDB4" stroke-width="1.1"/><path d="M10 15 v9 M15 15 v9" stroke="#F8C870" stroke-width="1.4" stroke-linecap="round"/>`,
  fromage: `<path d="M3 21 L26 9 L29 15 V25 H3z" fill="#F6D04D" stroke="#C9971C" stroke-width="1.3" stroke-linejoin="round"/><path d="M3 21 H29" stroke="#C9971C" stroke-width="1.1"/><circle cx="10" cy="23.5" r="1.4" fill="#D9A52A"/><circle cx="20" cy="23" r="1.8" fill="#D9A52A"/><circle cx="25.5" cy="17.5" r="1.3" fill="#D9A52A"/><circle cx="17" cy="16.5" r="1.1" fill="#D9A52A"/>`,
  cidre: `<path d="M13 3 h6 v6 q5 3 5 9 v9 a2 2 0 0 1 -2 2 h-12 a2 2 0 0 1 -2 -2 v-9 q0 -6 5 -9z" fill="#4F9A4A" stroke="#2E6A2A" stroke-width="1.3"/><rect x="12.5" y="2" width="7" height="3.5" rx="1" fill="#C98A50" stroke="#7A4A20" stroke-width="1"/><rect x="10" y="16" width="12" height="7" rx="1.5" fill="#FFF4D8" stroke="#D9C39A" stroke-width=".8"/><circle cx="16" cy="19.5" r="2" fill="#E0392B"/>`,
  hydromel: `<path d="M9 5 h14 q0 10 -7 12 q-7 -2 -7 -12z" fill="#E8A33A" stroke="#A86A12" stroke-width="1.3"/><path d="M9.6 8 h12.8" stroke="#F8D690" stroke-width="1.3"/><path d="M16 17 v8 M11 27 h10" stroke="#A86A12" stroke-width="2" stroke-linecap="round"/>`,
};
for (const k in PIC) P[k].e = `<i class="b2-ic"><svg viewBox="0 0 32 32" aria-hidden="true">${PIC[k]}</svg></i>`;


const st = document.createElement("style"); st.id = "b2-style"; st.textContent = STYLE; document.head.appendChild(st);

/* =================== Ouverture =================== */
let mult = 1;           // améliorer par ×1, ×10 ou au maximum
let sheetOpen = false;
const TABS = [
  { id:"farm",    label:"Ferme",  i:"🌾" },
  { id:"barn",    label:"Grange", i:"🏚️", need:"grange",  why:"La grange s'ouvre dès ta première récolte livrée." },
  { id:"atelier", label:"Atelier",i:"🛠️", need:"atelier", why:"L'atelier ouvre quand tu débloques ta 3e parcelle." },
  { id:"market",  label:"Marché", i:"📈", need:"marche",  why:"Le marché ouvre quand tu débloques ta 2e parcelle." },
  { id:"village", label:"Village",i:"🏘️", need:"village", why:"Le village ouvre quand tu débloques ta 3e parcelle." },
  { id:"casino",  label:"Casino", i:"🎰", need:"village", why:"Le casino ouvre avec le village, à ta 3e parcelle." },
];
function openBaron(){
  closeBaron(true);
  const w = document.createElement("div"); w.className = "b2-wrap"; w.setAttribute("role", "dialog"); w.setAttribute("aria-label", "Le Baron");
  w.innerHTML = `<div class="b2-hud"><div class="b2-col"><button class="b2-hbtn" data-a="arcade" aria-label="Retour à l'Arcade">‹</button>
    <div class="b2-pill"><i class="b2-coin"></i><span data-live="coins">…</span></div><div class="b2-pill"><span class="b2-e">🪵</span><span data-live="wood">…</span></div><button class="b2-pill b2-sea" data-a="season" aria-label="Saison"><span class="b2-e" data-live="sea-e">🌸</span><span class="lb" data-live="sea">…</span></button>
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
    if (n % 4 === 0) checkSurprises();
    if (n % 20 === 10) betCheck();
    if (view === "atelier") etbTick(now());
    if (n % 16 === 8 && view === "casino" && !CZ.spinning) loadCasino();
    if (n % 80 === 20 && view === "atelier") loadEtb().then(() => { if (view === "atelier" && !sheetOpen && !gestOpen) draw(); });
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
  if (view === "village") surpDot = false;
  if (view === "casino" && CZ.spinning && wrapEl.querySelector(".cz-wh.spin")) return;
  const html = view === "farm" ? farmHTML() : view === "barn" ? barnHTML() : view === "atelier" ? atelierHTML() : view === "market" ? marketHTML() : view === "casino" ? casinoHTML() : villageHTML();
  main.innerHTML = html; main.dataset.v = view; main.scrollTop = keep;
  wrapEl.querySelector("#b2-dock").innerHTML = view === "farm" ? dockHTML() : "";
  wrapEl.querySelector("#b2-main").classList.toggle("dockpad", view === "farm");
  wrapEl.querySelector("#b2-tabs").innerHTML = `<div class="b2-col">${TABS.map(t => {
    const lock = t.need && !BX.unlocked(S, t.need);
    const dot = !lock && t.need && (!seen("tab_" + t.id) || (t.id === "village" && surpDot && view !== "village"));
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
  { const sa = BX.seasonAt(now()), c = BX.SEASONS[sa.i], e1 = wrapEl.querySelector('[data-live="sea-e"]'), e2 = wrapEl.querySelector('[data-live="sea"]'); if (e1) e1.textContent = c.e; if (e2) e2.textContent = c.label; }
  q("[data-bet]").forEach(el => { const b = (S.bets || []).find(x => x.id === el.dataset.bet); if (!b) return; const v = BX.betValue(b, now()); el.textContent = fmtN(v); el.classList.toggle("up", v >= b.m); el.classList.toggle("down", v < b.m); });
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
  if (view === "market") q("[data-cask]").forEach(el => caskTick(el, t));
  if (view === "atelier"){
    let expired = false;
    q("[data-tool]").forEach(el => {
      const kind = el.dataset.tool, left = toolLeft(kind, t), x = S.tools[kind];
      if (!left){ expired = true; return; }
      el.querySelector(".t").textContent = fmtT(left); el.querySelector(".pb i").style.width = (left / (BX.TQ[x.q].h * 3600000) * 100) + "%";
    });
    q("[data-cask]").forEach(el => caskTick(el, t));
    if (expired && !sheetOpen) draw();
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
  const r = BX.farmRates(f, t, BX.farmMul(S, key), BX.tmOf(S, key, t)), cap = BX.barnCap(S), used = BX.stockUnits(S);
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
  { id:"crash",  when: () => BX.unlocked(S, "marche") && S.stats.villageSold > 0, i:"📉", txt:"Attention : quand tout le monde vend au village, son prix s'écroule. Garde ta récolte dans la grange et vends au bon moment." },
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
  const tiles = BX.ALL.filter(k => (!P[k].rec || BX.unlocked(S, "four")) && (!P[k].aged || S.cellar.lvl || S.stock[k] >= 1)).map(k => `<button class="b2-tile ${k === S.spec ? "mine" : ""} ${S.stock[k] < 1 ? "zero" : ""}" data-a="prod" data-k="${k}">
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

/* ---------- L'Établi (12 nov. 2026) ----------
   Un grand client pour tout le village toutes les 30 min (même tirage sur tous les téléphones).
   Il veut un objet sur mesure fait de sous-produits de plusieurs fermes. On le fabrique en 2-3 gestes à faire soi-même
   (découper, coudre, assembler, vernir) ; la précision fixe le prix, tout parfait = chef-d'œuvre ×3.
   Le premier qui livre gagne (serveur : baron2_etabli_win). Un objet livré trop tard reste dans « tes objets ». */
const ETB = {
  ms: 1800000, mins: 40, dryMs: 180000,
  OBJ: {
    fauteuil: { label:"Fauteuil",          e:"🪑", subs:["cuir","plumes","sciure"],  g:["cut","sew","build"],   q:"Un fauteuil en cuir, rembourré de plumes, pour mon salon." },
    matelas:  { label:"Matelas",           e:"🛏️", subs:["paille","plumes"],         g:["cut","sew"],           q:"Un matelas de paille et de plumes. Je dors si mal !" },
    lustre:   { label:"Lustre",            e:"🏮", subs:["cire","sciure"],           g:["build","polish"],      q:"Un lustre plein de bougies pour ma grande salle." },
    selle:    { label:"Selle",             e:"🐎", subs:["cuir","paille"],           g:["cut","sew","polish"],  q:"Une selle en cuir pour mon plus beau cheval." },
    coffre:   { label:"Coffre",            e:"🧰", subs:["sciure","cuir","cire"],    g:["cut","build","polish"],q:"Un coffre bien solide pour cacher mes trésors." },
    bougies:  { label:"Bougies parfumées", e:"🕯️", subs:["cire","noyaux"],           g:["cut","polish"],        q:"Des bougies qui sentent bon le fruit." },
    collier:  { label:"Collier",           e:"📿", subs:["noyaux","cuir"],           g:["cut","build"],         q:"Un collier de noyaux polis, pour le bal de ce soir." },
    eventail: { label:"Éventail",          e:"🪭", subs:["plumes","sciure"],         g:["build","polish"],      q:"Un éventail de plumes, il fait si chaud à la cour." },
  },
  CLI: [{ n:"La Duchesse", e:"👒", f:1 }, { n:"Le Notaire", e:"🎩" }, { n:"L'Aubergiste", e:"🧔" }, { n:"Le Comte", e:"🤵" }, { n:"La Capitaine", e:"⚓", f:1 }, { n:"L'Abbesse", e:"⛪", f:1 }],
  KING: { n:"Le Roi", e:"👑" },
  REP: [[0, "Apprenti", 1], [3, "Artisan", 1.25], [10, "Maître", 1.5], [25, "Grand maître", 2]],
  G: {
    cut:    { e:"✂️", t:"Découper", h:"Touche quand la lame passe sur une croix", btn:"Couper !", n:4 },
    sew:    { e:"🧵", t:"Coudre",   h:"Touche quand le cercle touche le point",    btn:"Piquer !", n:4 },
    build:  { e:"🔨", t:"Assembler",h:"Touche pour lâcher la pièce pile en place", btn:"Lâcher !", n:3 },
    polish: { e:"🎨", t:"Vernir",   h:"Reste appuyé, lâche dans la zone verte",     btn:"Appuie…",  n:3 },
  },
};
const enice = n => { if (n < 100) return Math.ceil(n); const p = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.ceil(n / p) * p; };
const ehash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
function erng(seed){ let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const etbCid = t => Math.floor(t / ETB.ms);
const OBJK = Object.keys(ETB.OBJ);
function etbObjOf(cid){ const r = erng(ehash("etabli:" + cid)); return OBJK[Math.floor(r() * OBJK.length)]; }
function etbClient(cid){
  const r = erng(ehash("etabli:" + cid)); r();
  let o = etbObjOf(cid); if (o === etbObjOf(cid - 1)) o = OBJK[(OBJK.indexOf(o) + 1 + Math.floor(r() * (OBJK.length - 1))) % OBJK.length];
  const king = r() < 0.12, c = king ? ETB.KING : ETB.CLI[Math.floor(r() * ETB.CLI.length)];
  return { cid, o, king, n: c.n, e: c.e, f: !!c.f };
}
let ETW = {};                                             // gagnants des clients en cours (serveur)
async function loadEtb(){ try{ const r = await rpc("baron2_etabli_get", {}); ETW = r || {}; }catch(e){} }
const etbRep = () => { const n = S.etb.rep; let cur = ETB.REP[0], nx = null; for (const x of ETB.REP){ if (n >= x[0]) cur = x; else { nx = x; break; } } return { n, cur, nx }; };
function etbNeed(k, king){ return Math.max(20, enice(BX.effRate(S, 0) * BAL.subRatio * 900 * (king ? 1.5 : 1))); }
function etbRecipe(cl){ const r = {}; ETB.OBJ[cl.o].subs.forEach(k => r[k] = etbNeed(k, cl.king)); return r; }
function etbBase(cl){
  const own = BX.prodValue(S), prime = Math.min(Math.max(groupProd(), own), own * 5);
  return enice(Math.max(5000, prime * 60 * ETB.mins * (cl.king ? 2 : 1) * etbRep().cur[2]));
}
const etbPay = (cl, it) => enice(etbBase(cl) * (0.5 + 0.5 * it.q) * (it.chef ? 3 : 1));
const qWord = it => it.chef ? "Chef-d'œuvre ✨" : it.q >= 0.75 ? "Belle facture" : it.q >= 0.45 ? "Correct" : "Un peu raté";
function etbWorkers(cid){ return W.players.filter(p => p.id !== ME.id && p.stats && +p.stats.etb === cid).map(p => esc(p.name)); }

function etabliHTML(t){
  const cl = etbClient(etbCid(t)), O = ETB.OBJ[cl.o], left = (cl.cid + 1) * ETB.ms - t, w = ETW[cl.cid], rp = etbRep(), job = S.etb.job;
  const recipe = etbRecipe(cl), have = (S.etb.inv[cl.o] || []).slice().sort((a, b) => etbPay(cl, b) - etbPay(cl, a))[0];
  const steps = O.g.map((g, i) => `<em class="${job && job.cid === cl.cid && i < job.step ? "done" : ""}">${ETB.G[g].e}</em>`).join("<i>›</i>");
  let body;
  if (w){
    body = `<div class="b2-ewin">🏆 <b>${w.id === ME.id ? "Tu l'as livré" : esc(w.name) + " a livré"}</b><small>Prochain client dans <span data-etbt>${fmtT(left)}</span></small></div>`;
  } else if (job && job.cid === cl.cid){
    const dry = job.dry > t;
    body = `<div class="b2-esteps">${steps}</div>
      ${dry ? `<button class="b2-btn big" disabled>${ETB.G[O.g[job.step - 1]].e} Ça sèche… <span data-etbd>${fmtT(job.dry - t)}</span></button>`
        : `<button class="b2-btn gold big" data-a="etb-go">${ETB.G[O.g[job.step]].e} ${ETB.G[O.g[job.step]].t} (${job.step + 1}/${O.g.length})</button>`}`;
  } else if (have){
    body = `<button class="b2-btn gold big" data-a="etb-give" data-o="${cl.o}">Livrer ton ${esc(O.label.toLowerCase())} · ${qWord(have)}</button>`;
  } else {
    const miss = Object.keys(recipe).find(k => S.stock[k] < recipe[k]);
    body = `<div class="b2-eing">${Object.keys(recipe).map(k => `<span class="${S.stock[k] >= recipe[k] ? "ok" : "ko"}">${P[k].e}<b>${esc(P[k].label)}</b>${fmtN(Math.floor(S.stock[k]))} / ${fmtN(recipe[k])}</span>`).join("")}</div>
      <div class="b2-esteps">${steps}</div>
      ${job ? `<p class="b2-note" style="color:#F6EEDD;opacity:.8;text-align:center">Finis d'abord ton ${esc(ETB.OBJ[job.o].label.toLowerCase())} en cours.</p>`
        : `<div class="b2-two">${miss ? `<button class="b2-btn red" data-a="goto-mkt" data-k="${miss}">Acheter ${P[miss].e}</button>` : ""}<button class="b2-btn" data-a="etb-start" ${miss ? "disabled" : ""}>Fabriquer</button></div>`}`;
  }
  const wk = w ? [] : etbWorkers(cl.cid);
  const old = job && job.cid !== cl.cid ? `<div class="b2-slot" style="margin-top:10px"><span class="ic">${ETB.OBJ[job.o].e}</span><div class="sp"><b>${esc(ETB.OBJ[job.o].label)} en cours</b><small>Le client est parti : il ira dans tes objets</small></div>
      ${job.dry > t ? `<span class="t" data-etbd>${fmtT(job.dry - t)}</span>` : `<button class="b2-btn" data-a="etb-go">Finir</button>`}</div>` : "";
  const inv = OBJK.flatMap(k => (S.etb.inv[k] || []).map(it => ({ k, it })));
  return `<div class="b2-paper b2-etabli">
    <div style="display:flex;align-items:flex-start;gap:8px"><h2 class="b2-h2" style="flex:1;margin:0">L'établi<small>Des objets sur mesure pour les grands clients</small></h2><button class="b2-q" style="margin:0;background:rgba(59,31,23,.08)!important;color:var(--ink)!important" data-a="etb-help" aria-label="Comment ça marche">?</button></div>
    <div class="b2-erep"><span>⭐ ${rp.cur[1]}</span><div class="bar"><i style="width:${rp.nx ? Math.min(100, (rp.n - rp.cur[0]) / (rp.nx[0] - rp.cur[0]) * 100) : 100}%"></i></div><span>${rp.nx ? rp.nx[1] + " →" : "×" + rp.cur[2]}</span></div>
    <div class="b2-client ${cl.king ? "king" : ""}">
      <div class="ctop"><div class="av">${cl.e}</div><div class="cn">${cl.n}<small>${cl.king ? "Rare ! Paie double" : (cl.f ? "Cliente" : "Client") + " de tout le village"}</small></div>${w ? "" : `<div class="timer">⏳ <span data-etbt>${fmtT(left)}</span></div>`}</div>
      <div class="quote">« ${esc(O.q)} »</div>
      <div class="obj"><span class="big">${O.e}</span><div><b>${esc(O.label)}</b><small>${O.g.length} gestes</small></div><div class="prime"><b>${COIN}${fmtN(etbBase(cl))}</b><small>×3 si chef-d'œuvre</small></div></div>
      ${body}
      ${wk.length ? `<div class="race">🔨 ${wk.join(", ")} ${wk.length > 1 ? "sont" : "est"} aussi à l'établi…</div>` : ""}
    </div>${old}
    ${inv.length ? `<h3 class="b2-msec" style="color:var(--ink2);margin:14px 2px 6px">Tes objets</h3><div class="b2-einv">${inv.map(({ k, it }) => `<div><span>${ETB.OBJ[k].e}</span><b>${esc(ETB.OBJ[k].label)}<small>${qWord(it)}</small></b></div>`).join("")}</div>` : ""}
  </div>`;
}
function etbHelp(){
  sheetCtx = null;
  sheet(`<h3>🪑 L'établi</h3><div class="b2-fiche">
    ${frow("👒", "Un client pour tout le village", "Toutes les 30 min, un grand client passe. Il veut un objet sur mesure. Le premier qui le lui livre empoche la prime.")}
    ${frow(P.cuir.e, "Les sous-produits", "Chaque ferme en sort un peu : 1 pour 10 récoltés. Un objet en demande de plusieurs fermes : achète ceux des autres au marché, vends-leur les tiens.")}
    ${frow("✂️", "Les gestes", "Découper, coudre, assembler, vernir : c'est toi qui les fais. Plus tu es précis, plus le client paie. Après l'assemblage, la colle sèche 3 min.")}
    ${frow("✨", "Chef-d'œuvre", "Tous les gestes parfaits : le client paie ×3.")}
    ${frow("⭐", "Réputation", "Chaque objet livré te fait monter : Artisan (×1,25), Maître (×1,5), Grand maître (×2).")}
    ${frow("👑", "Le Roi", "Il passe rarement, demande plus et paie double.")}
    ${frow("🧰", "Trop tard ?", "Si un ami livre avant toi, ton objet n'est pas perdu : le prochain client qui veut le même te le prend tout de suite.")}
    </div><button class="b2-btn big" data-a="close-sheet">Compris</button>`);
}
function etbStart(){
  const t = now(), cl = etbClient(etbCid(t)), r = etbRecipe(cl);
  if (S.etb.job || ETW[cl.cid]) return;
  if (Object.keys(r).some(k => S.stock[k] < r[k])){ toast("Il te manque des sous-produits.", "err"); return; }
  for (const k in r) S.stock[k] -= r[k];
  S.etb.job = { cid: cl.cid, o: cl.o, step: 0, sc: [], perf: true, dry: 0 };
  dirty = true; save(true); etbPlay();
}
function etbPlay(){
  const job = S.etb.job; if (!job || job.dry > now()) return;
  const O = ETB.OBJ[job.o], g = O.g[job.step];
  gesture(g, job.step, O, res => {
    if (res == null){ draw(); return; }                   // abandon : on reprendra à cette étape
    job.sc.push(res.avg); job.perf = job.perf && res.perfect; job.step++;
    dirty = true;
    if (job.step >= O.g.length){ etbFinish(); return; }
    if (g === "build") job.dry = now() + ETB.dryMs;
    save(true); draw();
    if (job.dry > now()) toast(`${O.e} La colle sèche : reviens dans 3 min`);
    else setTimeout(etbPlay, 350);
  });
}
function etbFinish(){
  const job = S.etb.job, it = { q: job.sc.reduce((a, b) => a + b, 0) / job.sc.length, chef: job.perf };
  S.etb.job = null; S.etb.inv[job.o] = (S.etb.inv[job.o] || []).concat(it);
  S.stats.crafted = (S.stats.crafted || 0) + 1;
  sound("done"); buzz(30);
  if (job.cid === etbCid(now())) etbGive(job.o, it);
  else { toast(`${ETB.OBJ[job.o].e} ${ETB.OBJ[job.o].label} terminé · ${qWord(it)}. Il attend un client.`, "gold"); save(true); draw(); }
}
let etbBusy = false;
async function etbGive(o, pick){
  if (etbBusy) return;
  const t = now(), cl = etbClient(etbCid(t)); if (cl.o !== o) return;
  const list = S.etb.inv[o] || []; if (!list.length) return;
  const it = pick || list.slice().sort((a, b) => etbPay(cl, b) - etbPay(cl, a))[0];
  etbBusy = true;
  try{
    const r = await rpc("baron2_etabli_win", { p_token: getToken(), p_cid: cl.cid });
    if (r && r.won){
      const i = list.indexOf(it); if (i >= 0) list.splice(i, 1);
      const g = etbPay(cl, it), before = etbRep().cur[1];
      S.coins += g; S.stats.earned += g; S.etb.rep++;
      ETW[cl.cid] = { id: ME.id, name: ME.name };
      toast(`🏆 ${cl.e} ${esc(cl.n)} est ravi${cl.f ? "e" : ""} : +${COIN}${fmtN(g)}${it.chef ? " · chef-d'œuvre ✨" : ""}`, "gold");
      const after = etbRep().cur[1]; if (after !== before) setTimeout(() => toast(`⭐ Te voilà ${after} ! Tes clients paient plus.`, "gold"), 1400);
    } else if (r && r.name){ ETW[cl.cid] = { id: "?", name: r.name }; toast(`Trop tard : ${esc(r.name)} a livré avant toi. Ton objet attend le prochain client.`, "err"); }
    else toast("Le client est déjà reparti. Ton objet attend le prochain.", "err");
  }catch(e){ toast("Pas de réseau : réessaie de livrer.", "err"); }
  etbBusy = false; dirty = true; save(true); if (view === "atelier" && !sheetOpen) draw();
}
function etbTick(t){
  wrapEl.querySelectorAll("[data-etbt]").forEach(el => { const left = (etbCid(t) + 1) * ETB.ms - t; el.textContent = fmtT(left); });
  const job = S.etb.job;
  wrapEl.querySelectorAll("[data-etbd]").forEach(el => { if (!job || job.dry <= t){ if (!sheetOpen && !gestOpen) draw(); } else el.textContent = fmtT(job.dry - t); });
  if (wrapEl.querySelector(".b2-etabli") && wrapEl.querySelector(".b2-etabli").dataset.cid != etbCid(t) && !sheetOpen && !gestOpen) draw();
}

/* ----- les gestes : une petite scène plein écran, chaque touche est notée de 0 à 1 ----- */
let gestOpen = false;
function gesture(kind, stepI, O, done){
  const G = ETB.G[kind], N = G.n, scores = [];
  const ov = document.createElement("div"); ov.className = "b2-geste";
  ov.innerHTML = `<div class="gtop"><button class="x" aria-label="Arrêter">×</button><div class="prog">${O.g.map((x, i) => `<i class="${i < stepI ? "done" : i === stepI ? "on" : ""}"></i>`).join("")}</div><span>${stepI + 1}/${O.g.length}</span></div>
    <div class="gt"><b>${G.t} ${kind === "cut" ? "le cuir" : kind === "sew" ? "les coutures" : kind === "build" ? "les pièces" : "le bois"}</b><small>${G.h}</small></div>
    <div class="stage"></div><div class="fb">&nbsp;</div><div class="chips">${Array.from({ length: N }, () => `<span>${G.e} …</span>`).join("")}</div>
    <button class="tap">${G.btn}</button><p class="foot">Tout parfait sur tous les gestes = chef-d'œuvre ×3</p>`;
  wrapEl.appendChild(ov); gestOpen = true;
  const stage = ov.querySelector(".stage"), fb = ov.querySelector(".fb"), chips = ov.querySelectorAll(".chips span"), tap = ov.querySelector(".tap");
  let raf = 0, over = false, t0 = performance.now();
  const end = res => { if (over) return; over = true; cancelAnimationFrame(raf); setTimeout(() => { ov.remove(); gestOpen = false; done(res); }, res ? 700 : 0); };
  ov.querySelector(".x").addEventListener("click", e => { e.stopPropagation(); end(null); });
  ov.addEventListener("click", e => e.stopPropagation());
  const mark = s => {
    const i = scores.length; scores.push(s);
    const w = s >= 0.85 ? ["✨ Parfait !", "p"] : s >= 0.5 ? ["👍 Bien", "b"] : ["😬 Raté", "r"];
    fb.textContent = w[0]; fb.className = "fb " + w[1]; chips[i].textContent = `${G.e} ${w[0].split(" ")[1]}`; chips[i].className = w[1];
    sound(s >= 0.5 ? "coin" : "err"); buzz(s >= 0.85 ? 25 : 10);
    if (scores.length >= N){ tap.disabled = true; const avg = scores.reduce((a, b) => a + b, 0) / N; end({ avg, perfect: scores.every(x => x >= 0.85) }); }
  };
  const loopF = fn => { const f = now2 => { if (over) return; fn((now2 - t0) / 1000); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); };
  if (kind === "cut"){
    // la lame fait le tour d'un carré ; 4 croix au milieu des côtés
    stage.innerHTML = `<svg viewBox="0 0 270 250"><path d="M30 40 Q20 10 70 18 L200 12 Q250 14 246 60 L252 190 Q254 236 200 232 L70 238 Q22 240 24 190 Z" fill="#8A4B26" stroke="#5E3017" stroke-width="3"/>
      <rect x="60" y="50" width="150" height="150" rx="6" fill="none" stroke="#F6EEDD" stroke-width="3" stroke-dasharray="9 7"/>
      <path class="cutp" d="" fill="none" stroke="#6EE09A" stroke-width="5" stroke-linecap="round"/>
      <g class="crx" stroke="#FFD45E" stroke-width="4" stroke-linecap="round"></g><text class="blade" font-size="40" text-anchor="middle" dominant-baseline="middle">🔪</text></svg>`;
    const pt = u => { u = ((u % 1) + 1) % 1; const s = u * 4, i = Math.floor(s), f = s - i; return [[60 + 150 * f, 50], [210, 50 + 150 * f], [210 - 150 * f, 200], [60, 200 - 150 * f]][i]; };
    const X = [0.125, 0.375, 0.625, 0.875];
    stage.querySelector(".crx").innerHTML = X.map((u, i) => { const [x, y] = pt(u); return `<path data-i="${i}" d="M${x - 7} ${y - 7} l14 14 M${x + 7} ${y - 7} l-14 14"/>`; }).join("");
    const sp = 0.16 + Math.random() * 0.03, u0 = -0.1; let u = u0;
    const blade = stage.querySelector(".blade"), cutp = stage.querySelector(".cutp");
    const hit = s => { stage.querySelector(`[data-i="${scores.length}"]`)?.setAttribute("stroke", s >= 0.85 ? "#6EE09A" : s >= 0.5 ? "#F6EEDD" : "#FF8A70"); mark(s); };
    loopF(sec => {
      u = u0 + sec * sp; const [x, y] = pt(u); blade.setAttribute("x", x); blade.setAttribute("y", y - 14);
      let d = "M60 50"; const steps = Math.min(200, Math.floor(u * 200)); for (let k = 1; k <= steps; k++){ const p = pt(k / 200); d += ` L${p[0]} ${p[1]}`; } cutp.setAttribute("d", d);
      const next = X[scores.length]; if (next != null && u - next > 0.06) hit(0);
      if (u >= 1.02 && scores.length < N) hit(0);
    });
    tap.addEventListener("click", () => { const next = X[scores.length]; if (next == null) return; hit(Math.max(0, 1 - Math.abs(u - next) / 0.05)); });
  } else if (kind === "sew"){
    // un cercle se resserre sur un point de couture
    const P4 = [[60, 125], [110, 110], [160, 140], [210, 120]];
    stage.innerHTML = `<svg viewBox="0 0 270 250"><rect x="20" y="40" width="230" height="170" rx="18" fill="#E9D8B4" stroke="#B89A66" stroke-width="3"/>
      <path d="M40 125 C 90 95, 140 160, 230 115" fill="none" stroke="#B89A66" stroke-width="2" stroke-dasharray="6 6"/>
      <g class="pts">${P4.map(([x, y], i) => `<circle data-i="${i}" cx="${x}" cy="${y}" r="9" fill="#7A4A2A"/>`).join("")}</g>
      <circle class="ring" r="60" fill="none" stroke="#3B2A4F" stroke-width="4"/><text class="nd" font-size="30" text-anchor="middle">🪡</text></svg>`;
    const ring = stage.querySelector(".ring"), nd = stage.querySelector(".nd"), dur = 1.25;
    let s0 = 0.4, r = 60;
    const cur = () => P4[scores.length];
    const hit = s => { stage.querySelector(`[data-i="${scores.length}"]`)?.setAttribute("fill", s >= 0.85 ? "#2F9E57" : s >= 0.5 ? "#C98A12" : "#CC3F27"); mark(s); };
    loopF(sec => {
      const p = cur(); if (!p){ ring.setAttribute("r", 0); return; }
      const k = (sec - s0) / dur; r = k < 0 ? 60 : 60 - 60 * k;
      ring.setAttribute("cx", p[0]); ring.setAttribute("cy", p[1]); ring.setAttribute("r", Math.max(0, r)); ring.style.opacity = k < 0 ? 0.25 : 1;
      nd.setAttribute("x", p[0] + 22); nd.setAttribute("y", p[1] - 18);
      if (r < 0){ hit(0); s0 = sec + 0.35 + Math.random() * 0.3; }
    });
    tap.addEventListener("click", () => { if (!cur() || r >= 60) return; const sec = (performance.now() - t0) / 1000; hit(Math.max(0, 1 - Math.abs(r - 12) / 14)); s0 = sec + 0.35 + Math.random() * 0.3; r = 60; });
  } else if (kind === "build"){
    // une pièce glisse au-dessus de sa place ; on la lâche
    stage.innerHTML = `<svg viewBox="0 0 270 250"><rect x="0" y="222" width="270" height="20" fill="#6B3E1E"/>
      <g class="stk"></g><rect class="slot" width="90" height="26" rx="4" fill="none" stroke="#F6EEDD" stroke-width="3" stroke-dasharray="7 5"/>
      <rect class="pc" width="90" height="26" rx="4" fill="#C98A50" stroke="#7A4A20" stroke-width="3"/></svg>`;
    const pc = stage.querySelector(".pc"), slot = stage.querySelector(".slot"), stk = stage.querySelector(".stk");
    let x = 0, base = 0;
    const lay = () => { const sx = 90 + (scores.length % 2 ? -14 : 14) * (scores.length ? 1 : 0), sy = 196 - scores.length * 28; slot.setAttribute("x", sx); slot.setAttribute("y", sy); return [sx, sy]; };
    let [sx, sy] = lay();
    loopF(sec => { const sp = 1.6 + scores.length * 0.35; x = 90 + Math.sin((sec - base) * sp) * 88; pc.setAttribute("x", x); pc.setAttribute("y", sy - 70); });
    tap.addEventListener("click", () => {
      if (scores.length >= N) return;
      const s = Math.max(0, 1 - Math.abs(x - sx) / 34);
      stk.insertAdjacentHTML("beforeend", `<rect x="${x}" y="${sy}" width="90" height="26" rx="4" fill="${s >= 0.85 ? "#D9A066" : s >= 0.5 ? "#C98A50" : "#9E5E30"}" stroke="#7A4A20" stroke-width="3"/>`);
      mark(s); [sx, sy] = lay(); base = (performance.now() - t0) / 1000 + Math.random() * 2;
    });
  } else {
    // vernir : appuyer pour remplir, lâcher dans la zone verte
    stage.innerHTML = `<div class="gauge"><div class="zone"></div><div class="fill"></div></div><div class="plank">🪵</div>`;
    const zone = stage.querySelector(".zone"), fill = stage.querySelector(".fill");
    let a = 0, v = 0, hold = false, h0 = 0;
    const newZone = () => { a = 0.45 + Math.random() * 0.38; zone.style.bottom = a * 100 + "%"; zone.style.height = "14%"; v = 0; fill.style.height = "0%"; };
    newZone();
    const release = () => { if (!hold) return; hold = false; tap.textContent = G.btn; const c = a + 0.07, s = v >= a && v <= a + 0.14 ? 1 - Math.max(0, Math.abs(v - c) - 0.03) * 2 : Math.max(0, 1 - Math.min(Math.abs(v - a), Math.abs(v - a - 0.14)) / 0.18) * 0.8; mark(Math.max(0, Math.min(1, s))); if (scores.length < N) setTimeout(newZone, 350); };
    loopF(() => { if (!hold) return; v = Math.min(1.05, (performance.now() - h0) / 1000 / (1.5 - scores.length * 0.15)); fill.style.height = Math.min(100, v * 100) + "%"; if (v >= 1.05) release(); });
    tap.addEventListener("pointerdown", e => { e.preventDefault(); if (scores.length >= N || hold) return; hold = true; h0 = performance.now(); tap.textContent = "Lâche dans le vert !"; });
    ["pointerup", "pointerleave", "pointercancel"].forEach(ev => tap.addEventListener(ev, release));
  }
}

/* ---------- Atelier : outils + cellier ---------- */
const toolLeft = (kind, t) => { const x = S.tools && S.tools[kind]; return x && x.until > t ? x.until - t : 0; };
function toolRow(kind, t){
  const x = S.tools && S.tools[kind], left = toolLeft(kind, t), q = x && BX.TQ[x.q];
  const nm = BX.toolName(S, kind), ic = BX.toolIcon(S, kind), K = BX.TOOLK[kind];
  if (!left) return `<div class="b2-slot b2-tool off"><span class="ic">${ic}</span><div class="sp"><b>${esc(K.where)}</b><small>${x ? `${esc(nm)} · à refaire` : "Aucun outil"}</small></div><button class="b2-btn" data-a="tool" data-kind="${kind}">Fabriquer</button></div>`;
  const tot = q.h * 3600000;
  return `<div class="b2-slot b2-tool ${x.q === 2 ? "gold" : ""}" data-tool="${kind}"><span class="ic">${ic}</span><div class="sp"><b>${esc(nm)} <span class="b2-q q${x.q}">${q.label}</span> <span class="b2-mul">×${String(q.mul).replace(".", ",")}</span></b><small>${esc(K.txt)}</small><div class="pb"><i style="width:${left / tot * 100}%"></i></div></div><span class="t">${fmtT(left)}</span></div>`;
}
function cellarRow(i, t){
  const sl = S.cellar.slots[i];
  if (!sl) return `<button class="b2-slot free" data-a="cellar">＋ Place libre · mettre à vieillir</button>`;
  const st = BX.ageState(sl, t), left = BX.caskLeft(sl, t), tot = BX.caskDur(sl);
  return `<div class="b2-slot b2-cask ${st}" data-cask="${i}"><span class="ic">${P[sl.k].e}</span><div class="sp"><b>${fmtN(sl.qty)} ${esc(P[sl.k].label)}</b>
    ${st === "monte" ? `<div class="pb"><i style="width:${(1 - left / tot) * 100}%"></i></div>` : `<small class="st">Prêt !</small>`}</div>
    ${st === "monte" ? `<span class="t" data-age>${fmtT(left)}</span>` : `<button class="b2-btn gold" data-a="cel-sell" data-i="${i}">🍾 Mettre en bouteille</button>`}</div>`;
}
function caskTick(el, t){
  const sl = S.cellar.slots[+el.dataset.cask]; if (!sl) return;
  const st = BX.ageState(sl, t);
  if (!el.classList.contains(st)){ if (!sheetOpen) draw(); return; }
  if (st === "monte"){ const left = BX.caskLeft(sl, t); const a = el.querySelector("[data-age]"); if (a) a.textContent = fmtT(left); const b = el.querySelector(".pb i"); if (b) b.style.width = (1 - left / BX.caskDur(sl)) * 100 + "%"; }
}
function atelierHTML(){
  const t = now(), ac = BX.costs.atelier(S);
  const tools = !S.atelier
    ? `<div class="b2-paper"><div class="b2-oven cold"><div class="art" style="font-size:54px;display:grid;place-items:center">🛠️</div><div><h2 class="b2-h2">L'atelier<small>Des outils qui accélèrent ta ferme. Ils s'usent, et se fabriquent avec du bois.</small></h2>
      <button class="b2-btn gold" data-a="up-atelier" data-cc="${ac.coins}" data-cw="${ac.wood}">Construire ${price(ac)}</button></div></div></div>`
    : `<div class="b2-paper"><div style="display:flex;align-items:center;gap:8px"><h2 class="b2-h2" style="flex:1;margin:0">L'atelier<small>Niveau ${S.atelier} · outils ${BX.TQ.filter(q => q.need <= S.atelier).map(q => q.label.toLowerCase()).join(", ")}</small></h2>
      ${S.atelier < BAL.atelierMax ? `<button class="b2-btn" data-a="up-atelier" data-cc="${ac.coins}" data-cw="${ac.wood}">Niv. ${S.atelier + 1} ${price(ac)}</button>` : ""}</div>
      <div class="b2-slots">${["parcel", "elev", "cart"].map(k => toolRow(k, t)).join("")}</div></div>`;
  const cc = BX.costs.cellar(S), L = S.cellar.lvl;
  const cellar = !L
    ? `<div class="b2-paper"><div class="b2-oven cold"><div class="art" style="display:grid;place-items:center"><svg viewBox="0 0 60 64" width="58" height="62" aria-hidden="true"><path d="M12 6 Q6 32 12 58 H48 Q54 32 48 6Z" fill="#B87A45" stroke="#6B3E1E" stroke-width="2.5"/><path d="M10 18 H50 M9 46 H51" stroke="#5A5A5A" stroke-width="4"/><path d="M22 6 Q19 32 22 58 M38 6 Q41 32 38 58" stroke="#8C5A30" stroke-width="1.6" fill="none"/><ellipse cx="30" cy="6" rx="18" ry="3.5" fill="#D9A066" stroke="#6B3E1E" stroke-width="2"/><circle cx="30" cy="34" r="3" fill="#6B3E1E"/></svg></div><div><h2 class="b2-h2">Le cellier<small>Bière, fromage, cidre, hydromel : des produits de luxe que le village s'arrache. Il faut juste de la patience.</small></h2>
      <button class="b2-btn gold" data-a="up-cellar" data-cc="${cc.coins}" data-cw="${cc.wood}">Construire ${price(cc)}</button></div></div></div>`
    : `<div class="b2-paper"><div style="display:flex;align-items:center;gap:8px"><h2 class="b2-h2" style="flex:1;margin:0">Le cellier<small>Niveau ${L} · ${BX.cellarSlots(S)} place${BX.cellarSlots(S) > 1 ? "s" : ""} · ${fmtN(BX.cellarBatch(S))} max par tonneau</small></h2>
      ${L < BAL.cellarMax ? `<button class="b2-btn" data-a="up-cellar" data-cc="${cc.coins}" data-cw="${cc.wood}">Niv. ${L + 1} ${price(cc)}</button>` : ""}</div>
      <div class="b2-slots">${Array.from({ length: BX.cellarSlots(S) }, (_, i) => cellarRow(i, t)).join("")}</div>
      <p class="b2-note">Un produit de luxe vaut toujours plus que sa matière première. Plus c'est long, plus ça vaut.</p></div>`;
  return `<div class="b2-barnin"><div class="b2-col b2-pad">${etabliHTML(t).replace('class="b2-paper b2-etabli"', `class="b2-paper b2-etabli" data-cid="${etbCid(t)}"`)}${tools}${cellar}</div></div>`;
}
function toolSheet(kind){
  const cur = S.tools && S.tools[kind] && toolLeft(kind, now()) > 0;
  sheetCtx = null;
  sheet(`<h3>${BX.toolIcon(S, kind)} ${esc(BX.toolName(S, kind))}</h3><p>${esc(BX.TOOLK[kind].txt)}, seulement sur ta ferme principale (${P[S.spec].e} ${esc(P[S.spec].label)}).${cur ? " <b>Il remplacera ton outil actuel.</b>" : ""}</p>
    ${BX.TQ.map((q, qi) => {
      const r = BX.toolRecipe(S, kind, qi), lock = S.atelier < q.need;
      const ing = Object.keys(r).map(x => `<span class="${S.stock[x] >= r[x] ? "ok" : "ko"}">${P[x].e} ${fmtN(Math.floor(S.stock[x]))} / ${fmtN(r[x])}</span>`).join("");
      const miss = Object.keys(r).find(x => S.stock[x] < r[x]);
      const btn = lock ? `<span class="b2-note" style="margin:0">Atelier niv. ${q.need}</span>`
        : BX.canCraft(S, kind, qi) ? `<button class="b2-btn" data-a="craft" data-kind="${kind}" data-q="${qi}">Fabriquer</button>`
        : miss && BX.unlocked(S, "marche") ? `<button class="b2-btn red" data-a="goto-mkt" data-k="${miss}">Acheter ${P[miss].e}</button>` : "";
      return `<div class="b2-rec ${lock ? "lock" : ""}"><span class="ic">${q.id === "dore" ? "🌟" : q.id === "solide" ? "💪" : "🔧"}</span><div class="sp"><b>${q.label} · ×${String(q.mul).replace(".", ",")} pendant ${q.h} h</b><div class="b2-ing">${ing}</div></div>${btn}</div>`;
    }).join("")}`);
}
function cellarSheet(src){
  if (!src){
    sheetCtx = null;
    sheet(`<h3>Que mettre à vieillir ?</h3>${BX.AGED.map(a => P[a].src).map(k => { const a = BX.AGEDOF[k]; return `<div class="b2-rec"><span class="ic">${P[a].e}</span><div class="sp"><b>${esc(P[a].label)} <span class="b2-mul">×${String(P[a].prem).replace(".", ",")}</span> <span style="font:700 12px var(--round);color:var(--ink2)">· ${P[a].h} h</span></b><div class="b2-ing"><span class="${S.stock[k] >= 1 ? "ok" : "ko"}">${P[k].e} ${fmtN(S.stock[k])}</span></div></div>
      ${S.stock[k] >= 1 ? `<button class="b2-btn" data-a="cellar" data-k="${k}">Choisir</button>` : BX.unlocked(S, "marche") ? `<button class="b2-btn red" data-a="goto-mkt" data-k="${k}">Acheter ${P[k].e}</button>` : ""}</div>`; }).join("")}`);
    return;
  }
  const a = BX.AGEDOF[src], max = Math.min(Math.floor(S.stock[src]), BX.cellarBatch(S));
  sheetCtx = { type:"cellar", k: src };
  sheet(`<h3>${P[a].e} ${esc(P[a].label)}</h3><p>${P[src].e} ${esc(P[src].label)} → ${P[a].e} ${esc(P[a].label)} en ${P[a].h} h. Même quantité, mais ça se vend environ ${String(P[a].prem).replace(".", ",")} fois plus cher.</p>
    ${qtyBlock(max, max, "q")}<div class="b2-sum" data-sum></div><button class="b2-btn big" data-a="confirm">Mettre en tonneau</button>`);
  sheetSum();
}
function colpSheet(k){
  const pr = P[k].floor * BAL.colpMult, left = BX.reserveLeft(S, k, now()), max = Math.min(left, Math.floor(S.coins / pr));
  sheetCtx = { type:"colp", k, price: pr };
  sheet(`<h3>🧳 Le marchand</h3><p>Il dépanne en ${esc(P[k].label.toLowerCase())} quand personne n'en vend, mais il est cher : ${fmtP(pr)} l'unité. Il lui en reste ${fmtN(left)} ${P[k].e} pour toi jusqu'au prochain passage (toutes les 20 min).</p>
    ${qtyBlock(max, max, "q")}<div class="b2-sum" data-sum></div><button class="b2-btn gold big" data-a="confirm" ${max < 1 ? "disabled" : ""}>Acheter</button>`);
  sheetSum();
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
const vChg = k => { const t = now(), a = priceOf(k, t - 3600000); return (priceOf(k, t) - a) / a * 100; };
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
const priceOf = (k, t) => BX.vPrice(k, t);
function chartSVG(k, period){
  const cs = candles(k, period), W_ = 340, H = 170, padL = 4, padR = 34, top = 10, bot = 22;
  const span = { "1h": 3600000, "24h": 86400000, "7j": 7 * 86400000 }[period], tN = now(), NP = 90;
  const curve = Array.from({ length: NP + 1 }, (_, j) => priceOf(k, tN - span + span * j / NP));
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
// petite courbe du cours du village sur 3 h (couleur : variation sur 1 h, comme le %)
function spark(k){
  const t = now(), n = 36, span = 3 * 3600000, v = Array.from({ length: n + 1 }, (_, j) => priceOf(k, t - span + span * j / n));
  const mx = Math.max(...v), mn = Math.min(...v), y = x => 3 + (mx - x) / Math.max(1e-9, mx - mn) * 22;
  const up = vChg(k) >= 0;
  return `<svg class="b2-spark" viewBox="0 0 72 28" aria-hidden="true"><path d="${v.map((x, j) => (j ? "L" : "M") + (j * 72 / n).toFixed(1) + " " + y(x).toFixed(1)).join(" ")}" fill="none" stroke="${up ? "#6EE09A" : "#FF8A70"}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
/* ---------- Le marché : saisons, forces, fiche, paris (11 nov. 2026) ---------- */
const fmtMin = ms => { const m = Math.max(1, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`; };
const seaWord = v => v >= 2 ? "très recherché" : v === 1 ? "recherché" : v === 0 ? "normal" : v === -1 ? "abondant" : "très abondant";
const seaCls = v => v > 0 ? "up" : v < 0 ? "down" : "";
function seasonLine(){ const s = BX.seasonAt(now()), c = BX.SEASONS[s.i]; return `${c.e} ${c.label} · encore ${fmtMin(s.left)}`; }
function setPress(k, r){ if (!r || r.p == null) return; const o = BX.MK.press[k] || { h:[] }; BX.MK.press[k] = { p: +r.p, t: +r.t, h: (o.h || []).filter(e => e[0] < +r.t).concat([[+r.t, +r.p]]) }; }
// vendre au village : le cours baisse pour tout le monde (le serveur garde la poussée commune)
function villageSell(k, q){
  const before = Math.floor(S.stock[k] || 0), g = BX.vSell(S, k, q, now()), sold = before - Math.floor(S.stock[k] || 0);
  if (sold > 0) queue(() => rpc("baron2_vtrade", { p_token: getToken(), p_product: k, p_units: -sold })).then(r => setPress(k, r)).catch(() => {});
  return g;
}
function newsBanner(){
  const n = BX.newsOf(curSlot());
  if (!n) return `<div class="b2-news calm"><span class="i">📰</span><span class="sp"><b>Calme plat au village</b><small>Aucune nouvelle sur ce créneau</small></span></div>`;
  return `<button class="b2-news" data-a="mkt-k" data-k="${n.k}"><span class="i">📰</span><span class="sp"><b>${esc(n.txt)}</b><small>${P[n.k].e} ${esc(P[n.k].label)} : le prix ${n.up ? "grimpe" : "chute"}</small></span><span class="go">›</span></button>`;
}
const frow = (i, b, sm, cls) => `<div class="b2-frow ${cls || ""}"><span class="i">${i}</span><span class="tx"><b>${b}</b>${sm ? `<small>${sm}</small>` : ""}</span></div>`;
// ce qui se voit : saison, commande phare, nouvelle, emballement
function forcesRows(k){
  const t = now(), rows = [], v = BX.SEASONV[k];
  if (v){
    const s = BX.seasonAt(t), c = BX.SEASONS[s.i], nx = BX.SEASONS[s.next];
    rows.push(frow(c.e, `${c.label} : <span class="${seaCls(v[s.i])}">${seaWord(v[s.i])}</span>`, `Dans ${fmtMin(s.left)}, ${nx.e} ${nx.label.toLowerCase()} : ${seaWord(v[s.next])}`));
  }
  if (ORD && ORD.next_big === k) rows.push(frow("📋", "Commande phare", `Le maire en voudra beaucoup au prochain créneau`));
  else if (bigNow() === k) rows.push(frow("📋", "Grande commande en cours", "Tout le village en cherche"));
  const cur = curSlot();
  for (let sl = cur; sl >= cur - 2; sl--){
    const n = BX.newsOf(sl); if (!n || n.k !== k) continue;
    const ago = t - sl * BAL.slotMs; if (n.mag * Math.exp(-ago / 1800000) < 0.08) continue;
    rows.push(frow("📰", esc(n.txt), sl === cur ? `Le prix ${n.up ? "grimpe" : "chute"}` : `Il y a ${fmtMin(ago)}, l'effet s'estompe`, n.up ? "up" : "down"));
    break;
  }
  const b = BX.bubbleAt(k, t);
  if (b && b.ph === "monte" && b.warn) rows.push(frow("🔥", "Ça s'emballe", "Ça monte depuis longtemps… la bulle peut éclater à tout moment", "warn"));
  if (b && b.ph === "krach") rows.push(frow("💥", "La bulle éclate !", "Le prix s'effondre", "down"));
  if (b && b.ph === "apres") rows.push(frow("💥", "Après la bulle", "Le prix se remet doucement", "down"));
  return rows;
}
const lab = k => `${P[k].e} ${esc(P[k].label)}`;
function linksText(k){
  if (P[k].rec) return `Suit le prix de ses ingrédients : ${Object.keys(P[k].rec).map(lab).join(", ")}.`;
  if (P[k].sub) return `Suit le prix de la récolte d'où il vient : ${lab(P[k].of)}.`;
  if (P[k].aged) return `Suit le prix de sa matière : ${lab(P[k].src)}, en toujours plus cher.`;
  const l = (BX.LINKS[k] || []).map(([x, w]) => w > 0 ? `Lié à ${lab(x)} : quand l'un grimpe, l'autre suit un peu.` : `Lié à ${lab(x)}, à l'envers : quand l'un grimpe, l'autre baisse un peu.`);
  const dep = BX.CRAFT.filter(r => P[r].rec[k]);
  return l.join(" ") + (dep.length ? ` Il entraîne aussi ${dep.map(lab).join(", ")}.` : "");
}
function ficheSheet(k){
  sheetCtx = null;
  const v = BX.SEASONV[k], s = BX.seasonAt(now()), nw = BX.newsOf ? (k in { ble:1, oeufs:1, lait:1, fruits:1, miel:1, bois:1 }) : false;
  const sea = v ? `<div class="b2-seas">${BX.SEASONS.map((c, i) => `<span class="${i === s.i ? "on" : ""}">${c.e} ${c.label}<b class="${seaCls(v[i])}">${seaWord(v[i])}</b></span>`).join("")}</div>`
    : `<p class="b2-note" style="margin:0 0 6px">Pas de saison à lui.</p>`;
  const nowRows = forcesRows(k);
  sheet(`<h3>${P[k].e} ${esc(P[k].label)} : le prix</h3>
    <div class="b2-fiche">
    <h4 class="b2-fh4">En ce moment</h4>
    <div class="b2-fbox">${nowRows.join("") || frow("🤫", "Rien d'annoncé", "Le reste, à toi de le deviner")}</div>
    <h4 class="b2-fh4">Les 6 choses qui le font bouger</h4>
    ${frow("🌸", "La saison", "Printemps, été, automne, hiver : 1 h 30 chacune. Recherché = cher, abondant = pas cher.")}${sea}
    ${frow("📋", "La commande phare", "20 min avant, on annonce le produit de la prochaine grande commande : il grimpe, puis redescend.")}
    ${frow("📰", "La nouvelle du village", nw ? "Une par créneau, au hasard, sans prévenir. Elle fait bondir ou chuter un produit, puis s'efface en une heure environ." : "Elles touchent les récoltes, et donc ce qui en dépend.")}
    ${frow("🔗", "Les liens (ça ne s'affiche pas)", linksText(k))}
    ${frow("👥", "Le village (ça ne s'affiche pas)", "Quand beaucoup de monde vend au village, le prix baisse. Quand beaucoup achète, il monte. On ne te dit pas qui : à toi de le sentir. Ça s'oublie de moitié en 20 min.")}
    ${frow("🔥", "L'emballement", "Parfois un produit monte, monte… puis la bulle éclate d'un coup et il tombe plus bas qu'avant. On voit quand ça s'emballe, jamais quand ça éclate.")}
    ${frow("🏘️", "Acheter et vendre au village", "Le village rachète au cours, et revend un quart plus cher. Plus tu en prends d'un coup, plus ça grimpe ; plus tu en vends, plus ça baisse.")}
    </div><button class="b2-btn big" data-a="close-sheet">Compris</button>`);
}
function seasonSheet(){
  sheetCtx = null;
  const s = BX.seasonAt(now()), c = BX.SEASONS[s.i], nx = BX.SEASONS[s.next];
  sheet(`<h3>${c.e} ${c.label}</h3><p>Encore ${fmtMin(s.left)}, puis ${nx.e} ${nx.label.toLowerCase()}. Chaque saison dure 1 h 30. Recherché = cher, abondant = pas cher.</p>
    <div class="b2-fiche">${BX.RAW.map(k => { const v = BX.SEASONV[k]; return frow(P[k].e, `${esc(P[k].label)} : <span class="${seaCls(v[s.i])}">${seaWord(v[s.i])}</span>`, `Puis ${nx.label.toLowerCase()} : ${seaWord(v[s.next])}`); }).join("")}</div>
    <button class="b2-btn big" data-a="close-sheet">Fermer</button>`);
}
// les paris en cours
function betRow(b){
  const v = BX.betValue(b, now());
  return `<div class="b2-ord bet"><span class="who">${P[b.k].e} ${b.d > 0 ? "📈 Hausse" : "📉 Baisse"}<small>Misé ${fmtN(b.m)} · zéro si le cours passe ${b.d > 0 ? "sous" : "au-dessus de"} ${fmtP(BX.betLimit(b))}</small></span>
    <span class="pr ${v >= b.m ? "up" : "down"}" data-bet="${esc(b.id)}">${fmtN(v)}</span><button class="b2-btn gold" data-a="bet-close" data-id="${esc(b.id)}">Me retirer</button></div>`;
}
function parisHTML(){
  const l = S.bets || [];
  const row = x => `<div class="b2-prow"><button class="b2-pnm" data-a="mkt-k" data-k="${x}"><span class="ic">${P[x].e}</span><span class="nm"><b>${esc(P[x].label)}</b><small>${fmtP(BX.vPrice(x, now()))} ${chg(vChg(x))}</small></span></button>
    <button class="b2-pb up" data-a="bet" data-k="${x}" data-d="1" aria-label="Parier à la hausse">📈</button><button class="b2-pb down" data-a="bet" data-k="${x}" data-d="-1" aria-label="Parier à la baisse">📉</button></div>`;
  const sec = (title, list) => list.length ? `<h3 class="b2-msec">${title}</h3><div class="b2-mlist">${list.map(row).join("")}</div>` : "";
  return `<div class="b2-fhead"><p class="b2-pint">Mise sur la hausse ou la baisse d'un produit. Retire-toi quand tu veux.</p><button class="b2-q" data-a="bet-help" aria-label="Comment marche le pari">?</button></div>
    <h3 class="b2-msec">Tes paris${l.length ? ` · ${l.length}/${BX.BET.max}` : ""}</h3>
    ${l.length ? `<div class="b2-book">${l.map(betRow).join("")}</div>` : `<div class="b2-empty b2-pempty">Aucun pari en cours.</div>`}
    ${sec("Récoltes", BX.RAW)}${BX.unlocked(S, "four") ? sec("Recettes", BX.CRAFT) : ""}${sec("Produits de luxe", BX.AGED)}`;
}
function betHelpSheet(){
  sheetCtx = null;
  sheet(`<h3>🎯 Le pari</h3><div class="b2-fiche">
    ${frow("📈", "À la hausse", `Tu gagnes si le cours monte. Ta mise suit le cours ×${BX.BET.lev} : s'il monte de moitié, ta mise double.`)}
    ${frow("📉", "À la baisse", "Pareil, à l'envers : tu gagnes si le cours baisse.")}
    ${frow("🚪", "Te retirer", "Quand tu veux. Tu récupères ce que vaut ta mise à ce moment-là.")}
    ${frow("💥", "Au pire", "Si le cours part trop dans l'autre sens, ta mise tombe à zéro. Tu ne perds jamais plus que ta mise.")}
    ${frow("🪙", "La taxe", `3 pièces pour 100 misées. ${BX.BET.max} paris en même temps au maximum.`)}
    </div><button class="b2-btn big" data-a="close-sheet">Compris</button>`);
}
function betSheet(k, d){
  const t = now(); S.bets = S.bets || [];
  if (S.bets.length >= BX.BET.max){ toast(`${BX.BET.max} paris en même temps au maximum. Retire-toi d'un pari d'abord.`, "err"); return; }
  const cap = Math.min(BX.betCap(k, t), Math.floor(S.coins / (1 + BX.BET.fee)));
  if (cap < 1){ toast("Tu n'as pas assez de pièces pour parier.", "err"); return; }
  sheetCtx = { type:"bet", k, d };
  sheet(`<h3>${d > 0 ? "📈 Parier à la hausse" : "📉 Parier à la baisse"}</h3>
    <p>${lab(k)} · cours ${fmtP(BX.vPrice(k, t))}. Ta mise suit le cours ×${BX.BET.lev}. Tu te retires quand tu veux. Au pire, tu perds ta mise.</p>
    ${qtyBlock(cap, Math.max(1, Math.floor(cap / 4)), "q")}<div class="b2-sum" data-sum></div><p class="b2-note" data-betex></p>
    <p class="b2-note">Mise maximale sur ce produit : ${fmtN(BX.betCap(k, t))}.</p>
    <button class="b2-btn gold big" data-a="confirm">Parier</button>`);
  sheetSum();
}
function betCheck(){
  if (!S || !W.at || !(S.bets || []).length) return;
  const dead = BX.checkBets(S, now());
  dead.forEach(b => { toast(`💥 Ton pari ${b.d > 0 ? "à la hausse" : "à la baisse"} sur ${P[b.k].label.toLowerCase()} est tombé à zéro`, "err"); dirty = true; });
  if (dead.length){ save(true); if (view === "market" && !sheetOpen) draw(); }
}
function marketListHTML(){
  const casks = x => S.cellar.slots.filter(sl => sl && sl.k === x);
  const row = x => {
    const n = W.listings.filter(l => l.product === x && l.seller_id !== ME.id).length, mine = x === S.spec || x === BX.SUBOF[S.spec];
    return `<button class="b2-mrow" data-a="mkt-k" data-k="${x}"><span class="ic">${P[x].e}</span>
      <span class="nm"><b>${esc(P[x].label)}${x === bigNow() ? ` <span class="b2-tag gold">🎩 Grande commande</span>` : ""}${mine ? ` <span class="b2-tag">Toi</span>` : ""}</b><small>${S.stock[x] >= 1 ? `Tu en as ${fmtN(S.stock[x])}` : "Tu n'en as pas"}${P[x].aged && casks(x).length ? ` · ${casks(x).length} tonneau${casks(x).length > 1 ? "x" : ""}` : ""}${n ? ` · ${n} offre${n > 1 ? "s" : ""}` : ""}</small></span>
      ${spark(x)}<span class="pr"><b>${fmtP(BX.vPrice(x, now()))}</b>${chg(vChg(x))}</span></button>`;
  };
  const sec = (title, list) => list.length ? `<h3 class="b2-msec">${title}</h3><div class="b2-mlist">${list.map(row).join("")}</div>` : "";
  return `<div class="b2-board"><div class="b2-col" style="padding:6px 16px 28px">
    <div class="b2-mhead"><h2>Le marché</h2><button class="b2-seachip" data-a="season">${seasonLine()}</button></div>
    ${seen("mk2") ? "" : `<div class="b2-intro"><b>Nouveau marché</b><span>Saisons, nouvelles, emballement… et les paris (onglet 🎯). Touche le <b>?</b> d'un produit pour tout comprendre. Le village vend maintenant au cours.</span><button data-a="mk2x" aria-label="J'ai compris">×</button></div>`}
    <div class="b2-seg b2-mtabs"><button class="${mkt.tab !== "paris" ? "on" : ""}" data-a="mkt-tab" data-t="market">Marché</button><button class="${mkt.tab === "paris" ? "on" : ""}" data-a="mkt-tab" data-t="paris">🎯 Paris${(S.bets || []).length ? ` · ${S.bets.length}` : ""}</button></div>
    ${mkt.tab === "paris" ? parisHTML() : `${newsBanner()}
    ${sec("Récoltes", BX.RAW)}${BX.unlocked(S, "four") ? sec("Recettes", BX.CRAFT) : ""}${sec("Sous-produits", BX.SUB)}${sec("Produits de luxe", BX.AGED)}`}
  </div></div>`;
}
function casksHTML(k){
  const t = now(), src = P[k].src, my = S.cellar.slots.map((sl, i) => sl && sl.k === k ? cellarRow(i, t) : "").join("");
  const free = S.cellar.lvl && S.cellar.slots.slice(0, BX.cellarSlots(S)).filter(Boolean).length < BX.cellarSlots(S);
  return `<h3 class="b2-h3">Tes tonneaux</h3>
    <div class="b2-luxe">${my || `<div class="b2-empty">Aucun tonneau de ${esc(P[k].label.toLowerCase())} au cellier. Il se fait avec ${P[src].e} ${esc(P[src].label.toLowerCase())}.</div>`}</div>
    ${!S.cellar.lvl ? `<p class="b2-note" style="color:var(--chalk2)">Construis le cellier dans l'atelier pour en fabriquer.</p>`
      : free ? `<button class="b2-btn big" style="margin-top:10px" data-a="cellar" data-k="${src}" ${S.stock[src] < 1 ? "disabled" : ""}>Mettre ${P[src].e} à vieillir</button>` : `<p class="b2-note" style="color:var(--chalk2)">Ton cellier est plein.</p>`}`;
}
function marketHTML(){
  if (!mkt.open || !mkt.k) return marketListHTML();
  const k = mkt.k, qv = quote(k);
  const offers = W.listings.filter(l => l.product === k).sort((a, b) => a.price - b.price || a.id - b.id);
  const resL = resLeft(k);
  const rows = offers.map(l => {
    const mine = l.seller_id === ME.id;
    return `<div class="b2-ord ${mine ? "me" : ""}"><span class="who">${mine ? "Toi" : esc(nameOf(l.seller_id))}<small>${fmtAgo(new Date(l.created_at).getTime())}</small></span><span class="q">${fmtN(l.qty)}</span><span class="pr">${fmtP(+l.price)}</span>
      ${mine ? `<button class="b2-btn ghost" style="color:var(--chalk)!important;background:rgba(255,255,255,.1)!important" data-a="unlist" data-id="${l.id}">Retirer</button>` : `<button class="b2-btn" data-a="buy" data-id="${l.id}">Acheter</button>`}</div>`;
  }).join("");
  const colpL = P[k].sub ? BX.reserveLeft(S, k, now()) : 0;
  const res = P[k].aged || P[k].sub ? ""
    : `<div class="b2-ord res"><span class="who">🏘️ Le village<small>Au cours, + un quart</small></span><span class="q">${fmtN(resL)}</span><span class="pr">${fmtP(BX.vAsk(k, now()))}</span>
    <button class="b2-btn gold" data-a="buy-res" ${resL < 1 ? "disabled" : ""}>Acheter</button></div>`;
  const hist = W.trades.filter(t => t.product === k).slice(-12).reverse().map(t => `<div class="b2-ord"><span class="who">${esc(t.buyer_id === ME.id ? "Toi" : nameOf(t.buyer_id))} ← ${esc(t.seller_id === ME.id ? "toi" : nameOf(t.seller_id))}<small>${fmtAgo(t.ts)}</small></span><span class="q">${fmtN(t.qty)}</span><span class="pr">${fmtP(+t.price)}</span></div>`).join("");
  return `<div class="b2-board"><div class="b2-col" style="padding:4px 16px 24px">
    <div class="b2-mtop"><button class="b2-back" data-a="mkt-back" aria-label="Retour au marché">‹</button><span class="ic">${P[k].e}</span><b>${esc(P[k].label)}</b><button class="b2-q top" data-a="mfiche" data-k="${k}" aria-label="Ce qui fait bouger le prix">?</button></div>
    <div class="b2-quote"><div><div style="font:800 13px var(--round);color:var(--chalk2)">Le village rachète</div><span class="big">${COIN}${fmtP(BX.vPrice(k, now()))}</span><span class="ch">${chg(vChg(k))} <small style="opacity:.6">1 h</small></span></div>
      <div class="lim">${P[k].aged || P[k].sub ? "" : `Le village vend <b>${fmtP(BX.vAsk(k, now()))}</b><br>`}${qv.p != null ? `Entre joueurs (24 h) <b>${fmtP(qv.p)}</b><br>` : ""}Tu en as <b>${fmtN(S.stock[k])}</b></div></div>
    <div class="b2-seg">${["1h", "24h", "7j"].map(p => `<button class="${mkt.period === p ? "on" : ""}" data-a="mkt-p" data-p="${p}">${p === "1h" ? "1 h" : p === "24h" ? "24 h" : "7 j"}</button>`).join("")}</div>
    <div class="b2-chart">${chartSVG(k, mkt.period)}</div>
    <div class="b2-two"><button class="b2-btn" data-a="list" data-k="${k}" ${S.stock[k] < 1 ? "disabled" : ""}>Mettre en vente</button><button class="b2-btn gold" data-a="sell" data-k="${k}" ${S.stock[k] < 1 ? "disabled" : ""}>Vendre au village</button></div>
    ${P[k].aged ? casksHTML(k) : ""}
    <h3 class="b2-h3">Offres des joueurs</h3>
    <div class="b2-book">${rows || `<div class="b2-empty">Personne n'en vend pour l'instant.${k === S.spec || k === BX.SUBOF[S.spec] ? " Tu es le seul à en produire : à toi de fixer ton prix." : P[k].sub ? " Demande à celui qui en produit d'en mettre en vente." : ""}</div>`}${res}</div>
    <h3 class="b2-h3">Dernières transactions</h3>
    <div class="b2-book b2-hist">${hist || `<div class="b2-empty">Aucune transaction encore.</div>`}</div>
  </div></div>`;
}

/* ---------- Village ---------- */
function villageHTML(){
  syncOrders();
  const ready = ORD && S.orders.slot === ORD.slot;
  const notes = !ready ? `<div class="b2-paper" style="text-align:center;color:var(--ink2);font:700 14px var(--round)">Le village prépare ses commandes…</div>` : visibleOrders().map(o => {
    const got = S.orders.prog[o.id] || 0, c = BX.CHARS[o.who] || BX.CHARS.epiciere, have = Math.floor(S.stock[o.k]);
    const w = winnerOf(o.id), mine = !!(w && w.id === ME.id), pend = !w && got >= o.qty, done = !!w || pend;
    const canBake = P[o.k].rec && S.oven.lvl && BX.canBake(S, o.k) >= 1;
    const action = done ? "" : have >= 1 ? `<button class="b2-btn" data-a="deliver" data-id="${o.id}">Livrer ${fmtN(Math.min(have, o.qty - got))}</button>`
      : canBake ? `<button class="b2-btn gold" data-a="bake" data-k="${o.k}">Au four</button>`
      : `<button class="b2-btn red" data-a="goto-mkt" data-k="${o.k}">Acheter</button>`;
    return `<div class="b2-order ${done ? "done" : ""} ${o.big ? "big" : ""} ${o.surprise ? "surp " + (o.kind === "gros" ? "gros" : "vite") + (now() - outAt(o) < 4000 ? " new" : "") : ""}">${o.big ? `<span class="b2-bigtag">Grande commande · tout le village</span>` : o.surprise ? `<span class="b2-bigtag">${o.kind === "gros" ? "💰 Surprise · gros coup" : "⚡ Surprise · ça presse"}</span>` : ""}<div class="hd"><span class="face">${c.e}</span><div class="sp"><div class="who">${c.name}</div>${o.surprise && c.lines ? `<div class="line">${esc(c.lines[(+o.line || 0) % c.lines.length])}</div>` : ""}<div class="want">veut ${fmtN(o.qty)} ${P[o.k].e} ${esc(P[o.k].label)}</div></div>
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

/* =================== Le Casino du Baron (12 nov. 2026) ===================
   Roulette européenne. Le Baron du moment tient la banque (il ouvre ou ferme, ne joue pas,
   encaisse les pertes et paie les gains, quitte à passer en négatif). Tirage fait par le serveur. */
const CZ_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
const CZ_RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const czCol = n => n === 0 ? "g" : CZ_RED.has(n) ? "r" : "k";
const CZ = { info:null, at:0, bets:{}, last:null, chip:1, spinning:false, hold:false, wheel:0, ball:0, res:null, seen:0 };
const CZ_LABEL = { rouge:"Rouge", noir:"Noir", pair:"Pair", impair:"Impair", manque:"1 à 18", passe:"19 à 36", d1:"1 à 12", d2:"13 à 24", d3:"25 à 36", c1:"Colonne", c2:"Colonne", c3:"Colonne" };
async function loadCasino(){
  try{
    const r = await rpc("baron2_casino_get", {}); CZ.info = r; CZ.at = now();
    if (view === "casino" && !CZ.spinning && !sheetOpen) draw();
  }catch(e){}
}
const czBaron = () => CZ.info && CZ.info.baron ? CZ.info.baron : null;
const czIamBaron = () => !!(czBaron() && czBaron().id === ME.id);
const czStake = () => Object.values(CZ.bets).reduce((a, b) => a + b, 0);
function czChips(){
  const c = Math.max(0, S.coins);
  const down = x => { if (x < 10) return Math.max(1, Math.floor(x)); const p = Math.pow(10, Math.floor(Math.log10(x))), m = x / p; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p; };
  if (c < 100) return [1, 5, 10, 25];
  return [down(c * .01), down(c * .05), down(c * .2), down(c * .5)];
}
function czWheelSVG(){
  const a = 360 / 37, R = 100, r1 = 66;
  const pt = (ang, rad) => { const t = (ang - 90) * Math.PI / 180; return [(rad * Math.cos(t)).toFixed(2), (rad * Math.sin(t)).toFixed(2)]; };
  const secs = CZ_ORDER.map((n, i) => {
    const s = i * a - a / 2, e = s + a, [x1, y1] = pt(s, R), [x2, y2] = pt(e, R), [x3, y3] = pt(e, r1), [x4, y4] = pt(s, r1), [tx, ty] = pt(i * a, 86);
    return `<path d="M${x1} ${y1}A${R} ${R} 0 0 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 0 0 ${x4} ${y4}Z" class="cz-${czCol(n)}"/><text x="${tx}" y="${ty}" transform="rotate(${(i * a).toFixed(2)} ${tx} ${ty})">${n}</text>`;
  }).join("");
  return `<svg viewBox="-118 -118 236 236" class="cz-svg" aria-hidden="true">
    <circle r="116" class="cz-rim"/><circle r="104" class="cz-track"/>
    <g class="cz-wheel" style="transform:rotate(${CZ.wheel}deg)">${secs}
      <circle r="${r1}" class="cz-cone"/><circle r="40" class="cz-cone2"/>
      ${[0,1,2,3].map(i => `<rect x="-3" y="-38" width="6" height="76" rx="3" class="cz-spoke" transform="rotate(${i * 45})"/>`).join("")}<circle r="9" class="cz-hub"/></g>
    <g class="cz-ballg" style="transform:rotate(${CZ.ball}deg)"><g class="cz-balli ${CZ.spinning ? "out" : ""}"><circle cy="-76" r="5.2" class="cz-ball"/></g></g>
    <path d="M0 -112 L-6 -122 L6 -122Z" class="cz-mark"/></svg>`;
}
function czCell(k, label, cls){
  const m = CZ.bets[k], win = CZ.res && czWins(k, CZ.res.n);
  return `<button class="cz-c ${cls || ""} ${win ? "win" : ""}" data-a="cz-bet" data-k="${k}">${label}${m ? `<span class="cz-chip">${fmtN(m)}</span>` : ""}</button>`;
}
function czWins(k, n){
  if (k[0] === "n" && k !== "noir") return +k.slice(1) === n;
  if (n === 0) return false;
  switch (k){
    case "rouge": return CZ_RED.has(n); case "noir": return !CZ_RED.has(n);
    case "pair": return n % 2 === 0; case "impair": return n % 2 === 1;
    case "manque": return n <= 18; case "passe": return n >= 19;
    case "d1": case "d2": case "d3": return Math.floor((n - 1) / 12) + 1 === +k[1];
    case "c1": case "c2": case "c3": return ((n - 1) % 3) + 1 === +k[1];
  }
  return false;
}
function czTable(){
  let g = `<div class="cz-tab">`;
  g += `<div style="grid-area:1/3/2/6">${czCell("n0", "0", "z")}</div>`;
  const side = [["manque", "1-18"], ["pair", "Pair"], ["rouge", `<i class="cz-dia r"></i>`], ["noir", `<i class="cz-dia k"></i>`], ["impair", "Impair"], ["passe", "19-36"]];
  side.forEach(([k, l], i) => g += `<div style="grid-area:${2 + i * 2}/1/${4 + i * 2}/2">${czCell(k, l, "o")}</div>`);
  [1, 2, 3].forEach(d => g += `<div style="grid-area:${2 + (d - 1) * 4}/2/${6 + (d - 1) * 4}/3">${czCell("d" + d, `<span class="v">${["1-12", "13-24", "25-36"][d - 1]}</span>`, "o")}</div>`);
  for (let n = 1; n <= 36; n++){ const row = Math.ceil(n / 3) + 1, col = ((n - 1) % 3) + 3; g += `<div style="grid-area:${row}/${col}/${row + 1}/${col + 1}">${czCell("n" + n, n, czCol(n))}</div>`; }
  [1, 2, 3].forEach(c => g += `<div style="grid-area:14/${c + 2}/15/${c + 3}">${czCell("c" + c, "2 à 1", "o")}</div>`);
  return g + `</div>`;
}
function czFeed(){
  const sp = (CZ.info && CZ.info.spins) || [];
  if (!sp.length) return `<p class="cz-empty">Personne n'a encore joué.</p>`;
  return sp.slice(0, 12).map(s => { const net = +s.win - +s.stake; return `<div class="cz-row"><span class="cz-ball2 ${czCol(+s.n)}">${s.n}</span><span class="sp">${esc(s.pid === ME.id ? "Toi" : s.name)}<small>a misé ${fmtN(s.stake)} · ${fmtAgo(new Date(s.at).getTime())}</small></span><b class="${net > 0 ? "up" : "dn"}">${net > 0 ? "+" : "−"}${COIN}${fmtN(Math.abs(net))}</b></div>`; }).join("");
}
function casinoHTML(){
  const info = CZ.info, bar = czBaron(), open = !!(info && info.open), me = czIamBaron();
  const lastN = ((info && info.spins) || []).slice(0, 10).map(s => `<span class="cz-ball2 ${czCol(+s.n)}">${s.n}</span>`).join("");
  const res = CZ.res && !CZ.spinning ? `<div class="cz-res ${CZ.res.win > 0 ? "w" : ""}"><span class="cz-big ${czCol(CZ.res.n)}">${CZ.res.n}</span><b>${CZ.res.win > 0 ? `+${COIN}${fmtN(CZ.res.win)}` : `Perdu ${COIN}${fmtN(CZ.res.stake)}`}</b></div>` : "";
  const chips = czChips(), stake = czStake();
  let body;
  if (!info) body = `<p class="cz-empty">Le croupier arrive…</p>`;
  else if (me) body = `<div class="cz-bank"><h3>Tu tiens la banque</h3><p>Tant que tu es le Baron, ce que les joueurs perdent est à toi et c'est toi qui paies leurs gains, même si tu passes en négatif. Tu ne peux pas jouer.</p>
      <div class="cz-sum"><span>Banque sur 24 h</span><b class="${+info.bank >= 0 ? "up" : "dn"}">${+info.bank >= 0 ? "+" : "−"}${COIN}${fmtN(Math.abs(+info.bank))}</b></div>
      <button class="b2-btn big ${open ? "red" : "gold"}" data-a="cz-toggle">${open ? "Fermer le casino" : "Ouvrir le casino"}</button></div>`;
  else body = `<div class="cz-play ${open ? "" : "shut"}">
      ${open ? "" : `<div class="cz-closed">🔒 Le casino est fermé<small>Seul le Baron peut l'ouvrir.</small></div>`}
      <div class="cz-chips">${chips.map((v, i) => `<button class="cz-tok t${i} ${CZ.chip === i ? "on" : ""}" data-a="cz-chip" data-i="${i}">${fmtN(v)}</button>`).join("")}<button class="cz-tok all ${CZ.chip === 4 ? "on" : ""}" data-a="cz-chip" data-i="4">Tapis</button></div>
      ${czTable()}
      <div class="cz-acts"><button class="b2-btn ghost" data-a="cz-clear" ${stake ? "" : "disabled"}>Effacer</button><button class="b2-btn ghost" data-a="cz-again" ${CZ.last && !stake ? "" : "disabled"}>Rejouer</button></div>
      <button class="b2-btn big gold cz-go" data-a="cz-spin" ${stake && open && !CZ.spinning ? "" : "disabled"}>${stake ? `Lancer · ${COIN}${fmtN(stake)}` : "Pose tes jetons"}</button></div>`;
  return `<div class="cz"><div class="b2-col b2-pad">
    <div class="cz-hd"><span class="cz-st ${open ? "on" : ""}">${open ? "Ouvert" : "Fermé"}</span></div>
    <h2 class="cz-ttl">Casino du Baron</h2>
    <div class="cz-banker">${CROWN}<span>La banque : <b>${bar ? esc(me ? "toi" : bar.name) : "…"}</b></span></div>
    <div class="cz-wh">${czWheelSVG()}${res}</div>
    <div class="cz-last">${lastN}</div>
    ${body}
    <div class="cz-feed"><h3>Derniers tours</h3>${czFeed()}</div>
    <p class="cz-note">Roulette européenne : un numéro paie 35 fois la mise, une douzaine ou une colonne 2 fois, rouge, noir, pair, impair, 1-18 et 19-36 paient 1 fois. Le 0 fait tout perdre, sauf si tu as misé dessus.</p>
  </div></div>`;
}
function czBet(k){
  if (CZ.spinning) return;
  if (!CZ.info || !CZ.info.open){ toast("Le casino est fermé."); return; }
  if (CZ.res){ CZ.res = null; }
  const left = Math.floor(S.coins - czStake());
  if (left < 1){ toast("Tu as déjà tout misé."); return; }
  const v = CZ.chip === 4 ? left : Math.min(left, czChips()[CZ.chip]);
  CZ.bets[k] = (CZ.bets[k] || 0) + v; sound("tap"); buzz(8); draw();
}
async function czSpin(){
  if (CZ.spinning) return;
  const bets = Object.entries(CZ.bets).filter(([, m]) => m >= 1).map(([k, m]) => ({ k, m: Math.floor(m) }));
  const stake = bets.reduce((a, b) => a + b.m, 0);
  if (!stake) return;
  if (stake > S.coins){ toast("Tu n'as plus assez de pièces pour cette mise."); CZ.bets = {}; draw(); return; }
  CZ.spinning = true; CZ.hold = true; CZ.res = null;
  S.coins -= stake; dirty = true; live();
  let r;
  try{ r = await queue(() => rpc("baron2_casino_spin", { p_token: getToken(), p_state: S, p_bets: bets })); lastSave = now(); }
  catch(e){
    S.coins += stake; CZ.spinning = false; CZ.hold = false;
    const m = String(e && e.message || "");
    toast(m.includes("casino fermé") ? "Le Baron vient de fermer le casino." : m.includes("tu es le baron") ? "Tu es devenu le Baron : tu tiens la banque, tu ne peux plus jouer." : errText(e));
    loadCasino(); draw(); return;
  }
  CZ.last = Object.assign({}, CZ.bets);
  const n = +r.n, idx = CZ_ORDER.indexOf(n), a = 360 / 37;
  draw();
  try{ wrapEl.querySelector("#b2-main").scrollTo({ top: 0, behavior: "smooth" }); }catch(e){}
  // la roue tourne, la bille part dans l'autre sens et finit en haut, sur le bon numéro
  const target = -idx * a, cur = ((CZ.wheel % 360) + 360) % 360;
  CZ.wheel += 360 * 4 + (((target - cur) % 360) + 360) % 360;
  CZ.ball -= 360 * 7 + (((CZ.ball % 360) + 360) % 360);
  const wrap = wrapEl.querySelector(".cz-wh");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (!wrap) return;
    wrap.querySelector(".cz-wheel").style.transform = `rotate(${CZ.wheel}deg)`;
    wrap.querySelector(".cz-ballg").style.transform = `rotate(${CZ.ball}deg)`;
    wrap.classList.add("spin");
    setTimeout(() => wrap.querySelector(".cz-balli")?.classList.remove("out"), 3600);
  }));
  sound("tap");
  setTimeout(() => {
    CZ.spinning = false; CZ.hold = false;
    CZ.res = { n, win: +r.win, stake: +r.stake }; CZ.bets = {};
    applyCredits(r.credits);
    if (+r.win > 0){ sound("coin"); buzz([30, 50, 30]); } else buzz(40);
    if (wrapEl && view === "casino") draw();
    loadCasino(); loadWorld(true);
  }, 5200);
}
async function czToggle(){
  if (!CZ.info) return;
  try{ CZ.info = await rpc("baron2_casino_set", { p_token: getToken(), p_open: !CZ.info.open }); sound("up"); toast(CZ.info.open ? "🎰 Le casino est ouvert : à toi la banque !" : "Le casino est fermé."); }
  catch(e){ toast(String(e && e.message || "").includes("pas le baron") ? "Tu n'es plus le Baron : la banque est passée à quelqu'un d'autre." : errText(e)); loadCasino(); }
  draw();
}
function casinoCard(){
  const info = CZ.info, bar = czBaron(), open = !!(info && info.open);
  return `<button class="cz-card" data-a="casino"><span class="cz-cardw">🎰</span><span class="sp"><b>Casino du Baron</b><small>${bar ? (czIamBaron() ? "Tu tiens la banque" : "Banque : " + esc(bar.name)) : "Roulette"}</small></span><span class="cz-st ${open ? "on" : ""}">${open ? "Ouvert" : "Fermé"}</span></button>`;
}
const CZ_STYLE = `
.cz{background:radial-gradient(120% 70% at 50% 0,#1B7A4E,#0E4B30 60%,#0A3826);min-height:100%;color:#F5ECD6}
.cz-hd{display:flex;align-items:center;justify-content:center}
.cz .b2-btn.ghost{background:rgba(255,255,255,.12)!important;color:#F5ECD6!important}
.cz-st{font:800 12px var(--round);padding:4px 10px;border-radius:99px;background:rgba(0,0,0,.3);color:#E9C9B5;letter-spacing:.02em}
.cz-st.on{background:#F2B33D;color:#4A2C00}
.cz-ttl{font:400 38px/1 var(--disp);text-align:center;margin:10px 0 4px;color:#FFE6B8;text-shadow:0 2px 0 rgba(0,0,0,.25)}
.cz-banker{display:flex;justify-content:center;align-items:center;gap:6px;font:700 14px var(--round);color:#F5ECD6;opacity:.9}
.cz-banker svg,.cz-banker img{width:18px;height:18px}
.cz-wh{position:relative;width:min(78vw,300px);margin:12px auto 6px}
.cz-svg{width:100%;display:block;filter:drop-shadow(0 8px 14px rgba(0,0,0,.35))}
.cz-rim{fill:#7C4A24;stroke:#C98A12;stroke-width:3}.cz-track{fill:#3B1F17}
.cz-r{fill:#C8312A}.cz-k{fill:#1C1C1C}.cz-g{fill:#1F8A4C}
.cz-svg path{stroke:#D9B46A;stroke-width:.6}
.cz-svg text{fill:#fff;font:700 8.5px var(--round);text-anchor:middle;dominant-baseline:central}
.cz-cone{fill:#8A5A2E;stroke:#D9B46A;stroke-width:1}.cz-cone2{fill:#A8743F}.cz-spoke{fill:#E8C26A}.cz-hub{fill:#F2D58A}
.cz-ball{fill:#fff;stroke:#bbb;stroke-width:.6}.cz-mark{fill:#F2B33D}
.cz-wheel,.cz-ballg{transform-origin:0 0;transform-box:view-box}
.cz-wh.spin .cz-wheel{transition:transform 5s cubic-bezier(.12,.62,.18,1)}
.cz-wh.spin .cz-ballg{transition:transform 4.6s cubic-bezier(.2,.55,.25,1)}
.cz-balli{transition:transform .6s cubic-bezier(.5,0,.6,1.6)}.cz-balli.out{transform:translateY(-22px)}
.cz-res{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px;background:rgba(10,30,20,.86);padding:10px 16px;border-radius:16px;animation:b2-in .3s ease}
.cz-res b{font:800 16px var(--round);white-space:nowrap}.cz-res.w b{color:#F2D58A}
.cz-big{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;font:800 22px var(--round);color:#fff}
.cz-big.r,.cz-ball2.r{background:#C8312A}.cz-big.k,.cz-ball2.k{background:#1C1C1C}.cz-big.g,.cz-ball2.g{background:#1F8A4C}
.cz-last{display:flex;justify-content:center;gap:5px;flex-wrap:wrap;min-height:26px;margin-bottom:10px}
.cz-ball2{width:24px;height:24px;border-radius:50%;display:inline-grid;place-items:center;font:800 11px var(--round);color:#fff;border:1.5px solid rgba(255,255,255,.5);flex:none}
.cz-play{position:relative}
.cz-play.shut .cz-tab,.cz-play.shut .cz-chips,.cz-play.shut .cz-acts,.cz-play.shut .cz-go{opacity:.3;pointer-events:none}
.cz-closed{position:absolute;z-index:3;left:50%;top:130px;transform:translateX(-50%);background:#3B1F17;color:#FFE6B8;padding:14px 20px;border-radius:16px;font:800 16px var(--round);text-align:center;box-shadow:0 6px 16px rgba(0,0,0,.4);white-space:nowrap}
.cz-closed small{display:block;font:600 12px var(--round);opacity:.8;margin-top:3px}
.cz-chips{display:flex;justify-content:center;gap:7px;margin:4px 0 12px}
.cz-tok{width:54px;height:54px;border-radius:50%;font:800 11px var(--round)!important;color:#fff!important;border:4px dashed rgba(255,255,255,.75)!important;box-shadow:0 3px 0 rgba(0,0,0,.35);transition:transform .15s}
.cz-tok.t0{background:#2E6FD8!important}.cz-tok.t1{background:#C8312A!important}.cz-tok.t2{background:#2F9E57!important;border-color:rgba(255,255,255,.6)!important}.cz-tok.t3{background:#1C1C1C!important}.cz-tok.all{background:linear-gradient(135deg,#F2D58A,#C98A12)!important;color:#4A2C00!important}
.cz-tok.on{transform:translateY(-6px) scale(1.06);box-shadow:0 0 0 3px #FFE6B8,0 6px 10px rgba(0,0,0,.4)}
.cz-tab{display:grid;grid-template-columns:50px 46px 1fr 1fr 1fr;grid-template-rows:repeat(14,32px);gap:3px;background:#0B4229;padding:6px;border-radius:12px;border:2px solid #D9B46A}
.cz-tab>div{display:flex}
.cz-c{position:relative;flex:1;border-radius:6px!important;font:800 14px var(--round)!important;color:#fff!important;border:1px solid rgba(217,180,106,.55)!important;display:flex;align-items:center;justify-content:center}
.cz-c.r{background:#C8312A!important}.cz-c.k{background:#1C1C1C!important}.cz-c.z{background:#1F8A4C!important}.cz-c.o{background:rgba(255,255,255,.06)!important;font-size:12px!important}
.cz-c .v{writing-mode:vertical-rl;transform:rotate(180deg)}
.cz-c:active{filter:brightness(1.3)}
.cz-c.win{box-shadow:0 0 0 3px #F2D58A,0 0 14px #F2D58A;z-index:2}
.cz-dia{width:16px;height:16px;transform:rotate(45deg);border-radius:2px;border:1.5px solid #fff}.cz-dia.r{background:#C8312A}.cz-dia.k{background:#1C1C1C}
.cz-chip{position:absolute;z-index:2;right:-4px;top:-6px;min-width:28px;height:22px;padding:0 4px;border-radius:11px;background:#F2D58A;color:#4A2C00;font:800 10px/22px var(--round);border:2px dashed #fff;box-shadow:0 2px 3px rgba(0,0,0,.4);pointer-events:none}
.cz-acts{display:flex;gap:8px;margin:12px 0 8px}.cz-acts .b2-btn{flex:1}
.cz-bank{background:rgba(0,0,0,.25);border-radius:18px;padding:16px;border:1.5px solid rgba(217,180,106,.5)}
.cz-bank h3{font:400 26px var(--disp);margin:0 0 6px;color:#FFE6B8}.cz-bank p{font:600 14px/1.4 var(--round);margin:0 0 12px;opacity:.9}
.cz-sum{display:flex;justify-content:space-between;align-items:center;font:700 14px var(--round);margin-bottom:12px}
.cz .up{color:#7FE3A2}.cz .dn{color:#FF9C88}
.cz-feed{margin-top:18px;background:rgba(0,0,0,.2);border-radius:16px;padding:12px 14px}
.cz-feed h3{font:800 13px var(--round);text-transform:uppercase;letter-spacing:.06em;opacity:.7;margin:0 0 8px}
.cz-row{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid rgba(255,255,255,.08)}
.cz-row .sp{flex:1;font:700 14px var(--round)}.cz-row small{display:block;font:600 11px var(--round);opacity:.65}.cz-row b{font:800 14px var(--round);white-space:nowrap}
.cz-empty{text-align:center;opacity:.7;font:600 14px var(--round);margin:8px 0}
.cz-note{font:600 12px/1.45 var(--round);opacity:.65;margin:14px 4px 0;text-align:center}
.cz-card{width:100%;display:flex;align-items:center;gap:12px;margin-top:12px;padding:14px 16px;border-radius:18px;background:linear-gradient(135deg,#1B7A4E,#0E4B30)!important;color:#FFE6B8!important;box-shadow:0 4px 0 #082A1C;text-align:left}
.cz-card .sp{flex:1}.cz-card b{display:block;font:400 22px var(--disp)}.cz-card small{font:700 12px var(--round);opacity:.85}
.cz-cardw{font-size:30px}
`;
try{ const cst = document.createElement("style"); cst.id = "cz-style"; cst.textContent = CZ_STYLE; document.head.appendChild(cst); }catch(e){}

/* ---------- Commandes en course : les mêmes pour tous, la prime au premier ---------- */
let ORD = null;
const curSlot = () => Math.floor(now() / BAL.slotMs);
const winnerOf = id => ORD && S && S.orders.slot === ORD.slot ? (ORD.winners || {})[id] : null;
// demandes surprises : cachées jusqu'à leur moment d'apparition (secondes après le début du créneau)
const outAt = o => (ORD ? ORD.slot : curSlot()) * BAL.slotMs + (+o.at || 0) * 1000;
const isOut = o => !!o && (!o.surprise || now() >= outAt(o));
function visibleOrders(){
  const l = (S.orders.list || []).filter(isOut);
  const sp = l.filter(o => o.surprise).sort((a, b) => b.at - a.at);
  return sp.concat(l.filter(o => !o.surprise));
}
const announced = new Set(); let surpDot = false;
function checkSurprises(){
  if (!ORD || !S || S.orders.slot !== ORD.slot) return;
  for (const o of ORD.list || []){
    if (!o.surprise || announced.has(o.id) || !isOut(o)) continue;
    announced.add(o.id);
    if ((ORD.winners || {})[o.id]) continue;
    const fresh = now() - outAt(o) < 90000;          // à l'ouverture du jeu, pas de bandeau pour une vieille surprise
    surpDot = view !== "village";
    if (fresh){
      const c = BX.CHARS[o.who] || BX.CHARS.colporteur;
      toast(`${c.e} <b>${esc(c.name)}</b> débarque : ${fmtN(o.qty)} ${P[o.k].e} ${esc(P[o.k].label)} · +${COIN}${fmtN(o.bonus)} au premier !`, "gold");
      sound("done"); buzz(40);
    }
    if (wrapEl && !sheetOpen) draw();
  }
}
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
    BX.setMarket({ bigs: r.bigs || {} });
    syncOrders();
    if (prev) for (const id in ORD.winners){
      const w = ORD.winners[id]; if (prev[id] || w.id === ME.id) continue;
      const o = ORD.list.find(x => x.id === id); if (!o) continue;
      toast(`🏆 ${esc(w.name)} a raflé la prime ${o.big ? "du maire" : "de " + (BX.CHARS[o.who] || BX.CHARS.epiciere).name.toLowerCase()} : ${COIN}${fmtN(o.bonus)}`, (S.orders.prog[id] || 0) > 0 ? "err" : "");
    }
    if (fresh){ toast("📜 Nouvelles commandes au village : premier arrivé, premier servi !"); const n = BX.newsOf(+r.slot); if (n && BX.unlocked(S, "marche")) setTimeout(() => toast(`📰 ${esc(n.txt)} : le ${esc(P[n.k].label.toLowerCase())} ${n.up ? "grimpe" : "chute"}`, n.up ? "gold" : "err"), 2500); }
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
    toast(r === 1 ? `${CROWN} Tu es le nouveau Baron ! Tu tiens la banque du casino.` : `Tu passes ${r}e, devant ${esc(passed ? passed.name : "un voisin")} !`, "gold");
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
  if (c.type === "cellar"){ const a = BX.AGEDOF[c.k], t = now(); s.innerHTML = `<span>${P[c.k].e} ${COIN}${fmtN(q * BX.vPrice(c.k, t))} → ${P[a].e}</span><span>${COIN}${fmtN(q * BX.vPrice(a, t))}</span>`; }
  if (c.type === "res"){ const cost = BX.vBuyCost(c.k, q, now()); s.innerHTML = `<span>Tu paies${q > 0 ? ` <small>(${fmtP(cost / q)} l'unité)</small>` : ""}</span><span>${COIN}${fmtN(cost)}</span>`; const b = wrapEl.querySelector("[data-a=confirm]"); if (b) b.disabled = q < 1 || cost > S.coins; }
  if (c.type === "bet"){ const fee = Math.ceil(q * BX.BET.fee), p0 = BX.vPrice(c.k, now()), d = c.d, L = BX.BET.lev, val = p => Math.max(0, q * (1 + d * L * (p / p0 - 1)));
    s.innerHTML = `<span>Mise + taxe</span><span>${COIN}${fmtN(q + fee)}</span>`;
    const ex = wrapEl.querySelector("[data-betex]"), pu = p0 * 1.25, pd = p0 * 0.8;
    if (ex) ex.innerHTML = `Si le cours passe à ${fmtP(pu)} → ta mise vaut <b>${fmtN(val(pu))}</b>. S'il passe à ${fmtP(pd)} → <b>${fmtN(val(pd))}</b>. À ${fmtP(p0 * (1 - d / L))}, elle tombe à zéro.`;
    const b = wrapEl.querySelector("[data-a=confirm]"); if (b) b.disabled = q < 1 || q + fee > S.coins; }
  if (c.type === "buy" || c.type === "colp"){ s.innerHTML = `<span>Tu paies</span><span>${COIN}${fmtN(q * c.price)}</span>`; const b = wrapEl.querySelector("[data-a=confirm]"); if (b) b.disabled = q < 1 || q * c.price > S.coins; }
  if (c.type === "bake"){ s.innerHTML = `<span>Cuisson</span><span>${fmtT(BX.ovenDur(S, c.k))}</span>`; }
}
function sellSheet(k){
  sheetCtx = { type:"sell", k };
  sheet(`<h3>${P[k].e} Vendre au village</h3><p>Cours du village : <b>${fmtP(BX.vPrice(k, now()))}</b> ${vTrend(k)}. Plus tu vends d'un coup, plus son prix baisse, pour tout le village.</p>
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
    <p class="b2-note">Cours du village : ${fmtP(BX.vPrice(k, now()))}${P[k].aged || P[k].sub ? "" : ` · Réserve du village : ${fmtP(BX.reservePrice(k))}`}</p>
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
  const pr = BX.vAsk(k, now()), left = resLeft(k), max = Math.min(left, BX.vBuyMax(k, S.coins, now()));
  sheetCtx = { type:"res", k, price: pr };
  sheet(`<h3>🏘️ Le village vend</h3><p>Au cours du village, un quart plus cher qu'il ne rachète : ${fmtP(pr)} l'unité pour commencer, et ça grimpe à chaque unité achetée (pour tout le monde). Il en reste ${fmtN(left)} ${P[k].e} jusqu'au prochain réassort (toutes les 20 min).</p>
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
  if (c.type === "bet"){
    const b = BX.openBet(S, c.k, c.d, q, now());
    if (!b){ toast("Ce pari n'est pas possible.", "err"); closeSheet(); return; }
    dirty = true; save(true); closeSheet(); draw(); sound("up"); toast(`🎯 ${fmtN(q)} misés ${c.d > 0 ? "à la hausse" : "à la baisse"} sur ${P[c.k].label.toLowerCase()}`); return;
  }
  if (c.type === "sell"){
    if (S.stock[c.k] < q) return;
    const g = villageSell(c.k, q); dirty = true;
    closeSheet(); draw(); sound("coin"); coinsFly(wrapEl.querySelector(`[data-k="${c.k}"]`) || wrapEl.querySelector("#b2-main"), 6); toast(`+${COIN}${fmtN(g)}`, "gold");
    return;
  }
  if (c.type === "res"){
    if (BX.vBuyCost(c.k, q, now()) > S.coins) return;
    queue(async () => {
      let g = 0;
      try{ g = +(await rpc("baron2_reserve_buy", { p_token: getToken(), p_product: c.k, p_qty: q })) || 0; }
      catch(e){ toast(errText(e), "err"); if (btn) btn.disabled = false; return; }
      if (g >= 1){
        const cost = Math.min(S.coins, BX.vBuyCost(c.k, g, now())); S.coins -= cost; S.stock[c.k] += g; S.stats.bought += cost; BX.pushLocal(c.k, g, now()); dirty = true;
        if (W.res){ W.res.used = W.res.used || {}; W.res.used[c.k] = (+W.res.used[c.k] || 0) + g; }
      }
      closeSheet(); loadWorld(true); draw();
      if (g < 1) toast(`Trop tard : quelqu'un a vidé la réserve de ${P[c.k].label.toLowerCase()}`, "err");
      else { sound("up"); toast(g < q ? `Il n'en restait que ${fmtN(g)} ${P[c.k].e} : tu as tout pris` : `${fmtN(g)} ${P[c.k].e} achetés au village`); }
    });
    return;
  }
  if (c.type === "colp"){
    const left = BX.reserveLeft(S, c.k, now()), n = Math.min(q, left), cost = n * c.price;
    if (n < 1 || cost > S.coins) return;
    S.coins -= cost; S.stock[c.k] += n; S.stats.bought += cost; S.reserve.used[c.k] = (S.reserve.used[c.k] || 0) + n; dirty = true;
    closeSheet(); draw(); sound("up"); toast(`${fmtN(n)} ${P[c.k].e} achetés au marchand`); return;
  }
  if (c.type === "cellar"){
    if (!BX.cellarPut(S, c.k, q, now())){ toast("Plus de place dans le cellier.", "err"); closeSheet(); return; }
    dirty = true; closeSheet(); if (view !== "market") view = "atelier"; draw(); sound("up"); toast(`${fmtN(q)} ${P[BX.AGEDOF[c.k]].label.toLowerCase()} en tonneau`); return;
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
      if (tb.id === "market") mkt.open = false;
      view = tb.id; markSeen("tab_" + tb.id); closeSheet(); wrapEl.querySelector("#b2-main").scrollTop = 0; draw();
      if (view === "market" || view === "village") loadWorld(true);
      if (view === "casino"){ CZ.res = null; loadCasino(); }
      return;
    }
    case "casino": view = "casino"; CZ.res = null; closeSheet(); wrapEl.querySelector("#b2-main").scrollTop = 0; draw(); loadCasino(); return;
    case "cz-chip": CZ.chip = +b.dataset.i; sound("tap"); draw(); return;
    case "cz-bet": czBet(b.dataset.k); return;
    case "cz-clear": CZ.bets = {}; draw(); return;
    case "cz-again": {
      const tot = Object.values(CZ.last || {}).reduce((x, y) => x + y, 0);
      if (tot > S.coins){ toast("Pas assez de pièces pour rejouer la même mise."); return; }
      CZ.bets = Object.assign({}, CZ.last); CZ.res = null; draw(); return;
    }
    case "cz-spin": czSpin(); return;
    case "cz-toggle": czToggle(); return;
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
      if (BX.pendTotal(f) >= 1) BX.startElev(f); if (f.quai >= 1) BX.startCart(f, BX.tmOf(S, S.cur, now()).c);
      sound("tap"); bounce(b); buzz(10); markSeen("tip_start"); live(); return;
    }
    case "tap-elev": case "tap-cart": {
      const el = a === "tap-elev";
      const st = el ? f.elev : f.cart;
      if (st.ph !== "idle"){ floatText(b, st.mgr ? "Ton contremaître s'en occupe" : "Déjà en route"); return; }
      if (el && BX.pendTotal(f) < 1){ toast("Les paniers sont vides : touche d'abord un champ pour récolter."); return; }
      if (!el && f.quai < 1){ toast("Rien à transporter : le monte-charge doit d'abord remonter un panier."); return; }
      if (el ? BX.startElev(f) : BX.startCart(f, BX.tmOf(S, S.cur, now()).c)){ sound("tap"); }
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
    case "up-atelier": { if ((S.atelier || 0) >= BAL.atelierMax) return; const c = BX.costs.atelier(S); if (!paid(c, b)) return; S.atelier = (S.atelier || 0) + 1; sound("done"); draw(); toast(S.atelier === 1 ? "🛠️ L'atelier est construit" : `Atelier niveau ${S.atelier} : outils ${BX.TQ[S.atelier - 1].label.toLowerCase()}s débloqués`, "gold"); return; }
    case "up-cellar": { if (S.cellar.lvl >= BAL.cellarMax) return; const c = BX.costs.cellar(S); if (!paid(c, b)) return; S.cellar.lvl++; sound("done"); draw(); toast(S.cellar.lvl === 1 ? "Le cellier est construit" : `Cellier niveau ${S.cellar.lvl}`, "gold"); return; }
    case "tool": toolSheet(b.dataset.kind); return;
    case "craft": {
      const kind = b.dataset.kind, qi = +b.dataset.q;
      if (!BX.craftTool(S, kind, qi, now())){ sound("err"); toast("Il te manque des ingrédients.", "err"); return; }
      dirty = true; closeSheet(); draw(); sound("done"); buzz(30);
      toast(`${BX.toolIcon(S, kind)} Nouvel outil : ${esc(BX.toolName(S, kind))} ${BX.TQ[qi].label.toLowerCase()} · ×${String(BX.TQ[qi].mul).replace(".", ",")} pendant ${BX.TQ[qi].h} h`, "gold");
      return;
    }
    case "cellar": cellarSheet(b.dataset.k); return;
    case "cel-sell": {
      const sl = S.cellar.slots[+b.dataset.i]; if (!sl) return;
      const g = BX.cellarBottle(S, +b.dataset.i, now()); if (!g){ toast("Pas encore prêt."); return; } dirty = true;
      sound("done"); toast(`🍾 ${fmtN(g)} ${P[sl.k].e} ${esc(P[sl.k].label.toLowerCase())} mis en bouteille, dans ta grange`, "gold"); draw(); return;
    }
    case "buy-colp": colpSheet(mkt.k); return;
    case "up-oven": { const c = BX.costs.oven(S); if (!paid(c, b)) return; S.oven.lvl++; sound("done"); draw(); toast(S.oven.lvl === 1 ? "🔥 Le four est construit" : `Four niveau ${S.oven.lvl}`); return; }
    case "farm2": farm2Sheet(); return;
    case "farm2-go": {
      const k = b.dataset.k, c = BX.costs.farm(S); if (S.farms[k] || !paid(c, b)) return;
      S.farms[k] = BX.newFarm(); S.cur = k; closeSheet(); sound("done"); draw(); toast(`${P[k].e} Nouvelle exploitation : ${P[k].place.toLowerCase()}`); save(true); return;
    }
    case "prod": prodSheet(b.dataset.k); return;
    case "sell": sellSheet(b.dataset.k); return;
    case "mfiche": ficheSheet(b.dataset.k); return;
    case "season": seasonSheet(); return;
    case "mk2x": markSeen("mk2"); draw(); return;
    case "bet": betSheet(b.dataset.k, +b.dataset.d); return;
    case "bet-help": betHelpSheet(); return;
    case "etb-help": etbHelp(); return;
    case "etb-start": etbStart(); return;
    case "etb-go": etbPlay(); return;
    case "etb-give": etbGive(b.dataset.o); return;
    case "mkt-tab": mkt.tab = b.dataset.t; draw(); return;
    case "bet-close": { const v = BX.closeBet(S, b.dataset.id, now()); if (v == null) return; dirty = true; save(true); sound("coin"); toast(`Tu te retires : +${COIN}${fmtN(v)}`, "gold"); draw(); return; }
    case "quick-sell": {
      const k = S.cur, q = Math.floor(S.stock[k] || 0);
      if (q < 1){ toast("La grange est vide : attends que la charrette livre ta récolte."); bounce(b); return; }
      const g = villageSell(k, q); dirty = true;
      markSeen("tip_sell"); sound("coin"); buzz(15); bounce(b); coinsFly(b, 8); floatText(b, "+" + fmtN(g), "gold");
      if (!seen("hint_market") && BX.unlocked(S, "marche")){ markSeen("hint_market"); setTimeout(() => toast("Astuce : au Marché, tes amis peuvent t'acheter plus cher que le village."), 1200); }
      live(); setTimeout(draw, 900); return;
    }
    case "list": listSheet(b.dataset.k); return;
    case "goto-mkt": {
      if (!BX.unlocked(S, "marche")){ toast(TABS[2].why); return; }
      mkt.k = b.dataset.k; mkt.open = true; view = "market"; closeSheet(); wrapEl.querySelector("#b2-main").scrollTop = 0; draw(); loadWorld(true); return;
    }
    case "mkt-k": mkt.k = b.dataset.k; mkt.open = true; wrapEl.querySelector("#b2-main").scrollTop = 0; draw(); return;
    case "mkt-back": mkt.open = false; draw(); return;
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
      if (!isOut((S.orders.list || []).find(x => x.id === b.dataset.id))) return;
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
