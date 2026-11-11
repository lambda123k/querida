
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
