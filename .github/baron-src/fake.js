/* Faux serveur du Baron pour la démo et les tests : mêmes fonctions que supabase/baron2.sql, en mémoire,
   avec 4 amis fictifs qui vendent, achètent et font bouger les cours. */
(function(){
const _now = Date.now.bind(Date); let OFF = 0; Date.now = () => _now() + OFF;
window.DEMO_SKIP = ms => { OFF += ms; };
const KEY = "baron_demo_db_v2";
let D = null; try{ D = JSON.parse(localStorage.getItem(KEY) || "null"); }catch(e){}
const H = 3600000, now = () => Date.now();
const bots = [
  { id:"b-lea", name:"Léa", specialty:"oeufs", f:182000, prod:46 },
  { id:"b-tom", name:"Tom", specialty:"lait", f:97000, prod:31 },
  { id:"b-ines", name:"Inès", specialty:"miel", f:241000, prod:58 },
  { id:"b-hugo", name:"Hugo", specialty:"bois", f:64000, prod:22 },
];
if (!D){
  D = { players:[], secrets:{}, saves:{}, listings:[], trades:[], credits:[], ctr:[], res:{}, seq:1 };
  bots.forEach(b => D.players.push({ id:b.id, name:b.name, specialty:b.specialty, created: now(), stats:{ fortune:b.f, prod:b.prod, baked: Math.round(Math.random()*400), orders: Math.round(Math.random()*12), traded: Math.round(b.f*.3), farms:[b.specialty], parcels:4 } }));
  // 7 jours d'historique
  const base = { ble:12, oeufs:13, lait:12.5, fruits:14, miel:16, bois:19, pain:36, crepes:52, tarte:50, confiture:38, gateau:78 };
  for (const k in base){
    let p = base[k]; const n = k.length > 5 && !["fruits"].includes(k) ? 40 : 160;
    for (let i = 0; i < n; i++){
      const t = now() - 7 * 24 * H + (i / n) * 7 * 24 * H + Math.random() * H;
      p = Math.max(10.2, p * (1 + (Math.random() - .48) * .08));
      const s = bots[Math.floor(Math.random() * 4)], b = bots[Math.floor(Math.random() * 4)];
      D.trades.push({ id: D.seq++, product:k, qty: Math.round(20 + Math.random() * 300), price: Math.round(p * 10) / 10, buyer_id: b.id, seller_id: s.id, at: new Date(t).toISOString() });
    }
  }
  bots.forEach(b => { D.listings.push({ id: D.seq++, seller_id:b.id, product:b.specialty, qty: Math.round(80 + Math.random() * 400), price: Math.round((13 + Math.random() * 6) * 10) / 10, created_at: new Date(now() - Math.random() * 3 * H).toISOString() }); });
  D.listings.push({ id: D.seq++, seller_id:"b-ines", product:"bois", qty: 60, price: 24.5, created_at: new Date(now() - 20 * 60000).toISOString() });
  D.listings.push({ id: D.seq++, seller_id:"b-lea", product:"crepes", qty: 40, price: 55, created_at: new Date(now() - 50 * 60000).toISOString() });
}
const persist = () => { try{ localStorage.setItem(KEY, JSON.stringify(D)); }catch(e){} };
const pid = t => { const v = D.secrets[t]; if (!v) throw new Error("jeton inconnu"); return v; };
const credits = (v, s) => D.credits.filter(c => c.player_id === v && c.id > ((s && s.credit_seen) || 0));
const clone = x => JSON.parse(JSON.stringify(x));
const iso = () => new Date(now()).toISOString(), ts = x => x ? new Date(x).getTime() : 0;
function start(c, price){ c.status = "active"; c.price = price; c.start_at = iso(); c.end_at = new Date(now() + H).toISOString(); c.updated_at = iso();
  D.credits.push({ id: D.seq++, player_id:c.seller_id, coins:price, product:c.product, buyer: D.players.find(x => x.id === c.buyer_id).name, kind:"contract" });
  D.listings.filter(l => l.seller_id === c.seller_id && l.product === c.product).forEach(l => { D.credits.push({ id: D.seq++, player_id:c.seller_id, coins:0, product:l.product, qty:l.qty, buyer:"Offre retirée (contrat)", kind:"goods" }); });
  D.listings = D.listings.filter(l => !(l.seller_id === c.seller_id && l.product === c.product)); }
function refuse(c, byBuyer){ c.status = byBuyer ? "cancelled" : "refused"; c.updated_at = iso(); D.credits.push({ id: D.seq++, player_id:c.buyer_id, coins:c.price, buyer: byBuyer ? "Contrat annulé" : "Contrat refusé", kind:"refund" }); }
function expire(){ D.ctr.forEach(c => { if (["offer","counter"].includes(c.status) && ts(c.updated_at) < now() - 30 * 60000){ c.status = "expired"; c.updated_at = iso(); D.credits.push({ id: D.seq++, player_id:c.buyer_id, coins:c.price, buyer:"Contrat sans réponse", kind:"refund" }); } }); }
// un ami fictif livre sa récolte de contrat, et Léa finit par proposer un contrat au joueur
setInterval(() => {
  D.ctr.filter(c => c.status === "active" && c.seller_id.startsWith("b-") && ts(c.end_at) > now()).forEach(c => { const sp = D.players.find(x => x.id === c.seller_id), q = Math.round(sp.stats.prod / 10 * 15);
    c.delivered += q; D.credits.push({ id: D.seq++, player_id:c.buyer_id, coins:0, product:c.product, qty:q, buyer:sp.name, kind:"goods" }); });
  const me = D.players.find(p => !p.id.startsWith("b-"));
  if (me && D.saves[me.id] && !D.offered && D.saves[me.id].farms && D.saves[me.id].farms[me.specialty].parcels.length >= 3){ D.offered = 1;
    D.ctr.push({ id: D.seq++, buyer_id:"b-lea", seller_id:me.id, product:me.specialty, price: 25000, counter:null, status:"offer", delivered:0, created_at: iso(), updated_at: iso(), start_at:null, end_at:null }); }
  persist();
}, 15000);
const F = {
  baron2_join({ p_profile, p_name, p_spec, p_state }){
    if (D.players.some(p => p.id === p_profile)) throw new Error("déjà inscrit");
    if (D.players.length >= 6) throw new Error("partie complète");
    if (D.players.some(p => p.specialty === p_spec)) throw new Error("spécialité prise");
    D.players.push({ id:p_profile, name:p_name, specialty:p_spec, stats:{}, created: now() });
    // démo : on démarre avec une ferme déjà avancée, pour essayer tout de suite le marché, le village et les contrats
    const st = clone(p_state); st.coins = 2e6; st.stock.bois = 6000; st.barn = 5;
    const f = st.farms[p_spec]; while (f.parcels.length < 4) f.parcels.push({ lvl: 12, mgr:true, pend:0, ph:"idle", t:0 }); f.parcels[0].lvl = 25; f.parcels[0].mgr = true; f.elev.mgr = f.cart.mgr = true; f.elev.lvl = f.cart.lvl = 20;
    const t = "tok-" + Math.random().toString(36).slice(2); D.secrets[t] = p_profile; D.saves[p_profile] = st; return t;
  },
  baron2_load({ p_token }){ const v = pid(p_token), p = D.players.find(x => x.id === v); const ct = D.ctr.filter(c => c.seller_id === v && c.status === "active").slice(-1)[0];
    return { me:{ id:p.id, name:p.name, specialty:p.specialty }, state: clone(D.saves[v]), credits: credits(v, D.saves[v]), ctr: ct ? clone(ct) : null }; },
  baron2_save({ p_token, p_state, p_stats }){ const v = pid(p_token); D.saves[v] = clone(p_state); D.players.find(x => x.id === v).stats = p_stats; return { credits: credits(v, p_state) }; },
  baron2_world(){
    const cut = now() - 7 * 24 * H;
    const slot = Math.floor(now() / 1200000), size = {}; ["ble","oeufs","lait","fruits","miel","bois","pain","crepes","tarte","confiture","gateau"].forEach(k => size[k] = k.length > 5 && k !== "fruits" ? 120 : 400);
    return clone({ players: D.players.map(p => ({ id:p.id, name:p.name, specialty:p.specialty, stats:p.stats })), listings: D.listings,
      trades: D.trades.filter(t => new Date(t.at).getTime() > cut).map(t => t.hidden ? Object.assign({}, t, { buyer_id:null }) : t),
      reserve: { slot, size, used: (D.res.slot === slot ? D.res.used : {}) } });
  },
  baron2_list({ p_token, p_state, p_product, p_qty, p_price }){ const v = pid(p_token); const id = D.seq++; D.listings.push({ id, seller_id:v, product:p_product, qty: Math.floor(p_qty), price: Math.round(p_price * 10) / 10, created_at: new Date(now()).toISOString() }); D.saves[v] = clone(p_state); return id; },
  baron2_unlist({ p_token, p_state, p_id, p_qty }){ const v = pid(p_token); const i = D.listings.findIndex(l => l.id === p_id && l.seller_id === v && +l.qty === +p_qty); if (i < 0) throw new Error("offre changée"); D.listings.splice(i, 1); D.saves[v] = clone(p_state); return null; },
  baron2_reserve_buy({ p_token, p_product, p_qty }){ pid(p_token); const slot = Math.floor(now() / 1200000); if (D.res.slot !== slot) D.res = { slot, used:{} };
    const sz = p_product.length > 5 && p_product !== "fruits" ? 120 : 400, u = D.res.used[p_product] || 0, g = Math.max(0, Math.min(Math.floor(p_qty), sz - u)); D.res.used[p_product] = u + g; return g; },
  baron2_buy2(a){ return F.baron2_buy(a, a.p_hidden); },
  baron2_contracts(){ expire(); const t = now(); return clone(D.ctr.filter(c => ["offer","counter"].includes(c.status) || (c.status === "active" && ts(c.end_at) > t - H) || (["refused","cancelled","expired"].includes(c.status) && ts(c.updated_at) > t - 30 * 60000))); },
  baron2_ctr_offer({ p_token, p_state, p_seller, p_price }){
    expire(); const v = pid(p_token), sp = D.players.find(x => x.id === p_seller); if (!sp) throw new Error("joueur inconnu"); if (p_seller === v) throw new Error("pas avec toi-même");
    if (D.ctr.some(c => c.seller_id === p_seller && (["offer","counter"].includes(c.status) || (c.status === "active" && ts(c.end_at) > now() - H)))) throw new Error("cette ferme est déjà sous contrat ou en pause");
    const c = { id: D.seq++, buyer_id:v, seller_id:p_seller, product:sp.specialty, price: Math.round(p_price), counter:null, status:"offer", delivered:0, created_at: iso(), updated_at: iso(), start_at:null, end_at:null };
    D.ctr.push(c); D.saves[v] = clone(p_state);
    // les amis fictifs répondent au bout de quelques secondes
    if (p_seller.startsWith("b-")) setTimeout(() => { if (c.status !== "offer") return; const val = sp.stats.prod / 10 * 3600 * 14;
      if (c.price >= val * .7) start(c, c.price); else if (c.price >= val * .3){ c.status = "counter"; c.counter = Math.round(val * .85); c.updated_at = iso(); } else refuse(c, false); persist(); }, 6000);
    return c.id; },
  baron2_ctr_accept({ p_token, p_state, p_id }){ expire(); const v = pid(p_token), c = D.ctr.find(x => x.id === p_id); if (!c) throw new Error("contrat introuvable");
    if (c.status === "offer" && c.seller_id === v) start(c, c.price);
    else if (c.status === "counter" && c.buyer_id === v){ if (c.counter < c.price) D.credits.push({ id: D.seq++, player_id:v, coins:c.price - c.counter, buyer:"Différence du contrat", kind:"refund" }); start(c, c.counter); }
    else throw new Error("le contrat a changé");
    D.saves[v] = clone(p_state); return clone(c); },
  baron2_ctr_counter({ p_token, p_id, p_price }){ const v = pid(p_token), c = D.ctr.find(x => x.id === p_id && x.seller_id === v && x.status === "offer"); if (!c) throw new Error("le contrat a changé");
    c.status = "counter"; c.counter = Math.round(p_price); c.updated_at = iso();
    setTimeout(() => { if (c.status !== "counter") return; if (c.counter <= c.price * 1.6) start(c, c.counter); else refuse(c, true); persist(); }, 6000); return null; },
  baron2_ctr_refuse({ p_token, p_id }){ const v = pid(p_token), c = D.ctr.find(x => x.id === p_id); if (!c || !["offer","counter"].includes(c.status) || ![c.buyer_id, c.seller_id].includes(v)) throw new Error("le contrat a changé"); refuse(c, v === c.buyer_id); return null; },
  baron2_ctr_deliver({ p_token, p_id, p_total }){ const v = pid(p_token), c = D.ctr.find(x => x.id === p_id); if (!c || c.seller_id !== v || c.status !== "active") throw new Error("le contrat a changé");
    const d = Math.floor(p_total) - c.delivered; if (d > 0){ c.delivered += d; D.credits.push({ id: D.seq++, player_id:c.buyer_id, coins:0, product:c.product, qty:d, buyer: D.players.find(x => x.id === v).name, kind:"goods" }); } return c.delivered; },
  baron2_buy({ p_token, p_state, p_id, p_qty, p_price }, hidden){
    const v = pid(p_token); const l = D.listings.find(x => x.id === p_id);
    if (!l || +l.price !== +p_price || l.qty < p_qty || p_qty < 1) throw new Error("offre changée");
    if (l.seller_id === v) throw new Error("ta propre offre");
    l.qty -= p_qty; if (l.qty <= 0) D.listings = D.listings.filter(x => x !== l);
    const tid = D.seq++; D.trades.push({ id: tid, product:l.product, qty:p_qty, price:l.price, buyer_id:v, seller_id:l.seller_id, hidden: !!hidden, at:new Date(now()).toISOString() });
    D.credits.push({ id: D.seq++, player_id:l.seller_id, coins:p_qty * l.price, product:l.product, qty:p_qty, buyer: hidden ? "🎩 Un mystérieux acheteur" : D.players.find(x => x.id === v).name });
    D.saves[v] = clone(p_state); return tid;
  },
};
// les amis fictifs vivent un peu : ils achètent tes offres pas trop chères et font des échanges entre eux
setInterval(() => {
  const me = D.players.find(p => !p.id.startsWith("b-"));
  const mine = D.listings.filter(l => me && l.seller_id === me.id);
  mine.forEach(l => { if (Math.random() < (l.price <= 16 ? .5 : l.price <= 22 ? .2 : .03)){ const b = bots[Math.floor(Math.random() * 4)]; const q = Math.max(1, Math.ceil(l.qty * (.3 + Math.random() * .7)));
    l.qty -= q; if (l.qty <= 0) D.listings = D.listings.filter(x => x !== l);
    D.trades.push({ id: D.seq++, product:l.product, qty:q, price:l.price, buyer_id:b.id, seller_id:me.id, at:new Date(now()).toISOString() });
    D.credits.push({ id: D.seq++, player_id:me.id, coins:q * l.price, product:l.product, qty:q, buyer:b.name }); } });
  if (Math.random() < .5){ const s = bots[Math.floor(Math.random() * 4)], b = bots[Math.floor(Math.random() * 4)]; const last = D.trades.filter(t => t.product === s.specialty).slice(-1)[0];
    D.trades.push({ id: D.seq++, hidden: Math.random() < .25, product:s.specialty, qty: Math.round(20 + Math.random() * 200), price: Math.max(10.2, Math.round(((last ? last.price : 14) * (1 + (Math.random() - .5) * .06)) * 10) / 10), buyer_id:b.id, seller_id:s.id, at:new Date(now()).toISOString() }); }
  bots.forEach(b => { const p = D.players.find(x => x.id === b.id); p.stats.fortune = Math.round(p.stats.fortune * (1 + Math.random() * .004)); });
  persist();
}, 15000);
window.supabaseFake = { rpc: async (fn, args) => { await new Promise(r => setTimeout(r, 120)); try{ const data = F[fn](args || {}); persist(); return { data, error:null }; }catch(e){ return { data:null, error:{ message: e.message } }; } } };
window.DEMO_RESET = () => { localStorage.removeItem(KEY); localStorage.removeItem("bn2_token"); localStorage.removeItem("bn2_coins"); location.reload(); };
})();
