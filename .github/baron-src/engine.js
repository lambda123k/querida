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
