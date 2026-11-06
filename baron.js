/* Querida · Le Baron — jeu de farming et de marché entre amis (côté amis uniquement).
   Se lance depuis l'Arcade (toujours visible, pas caché) et s'ouvre en plein écran.
   Étape 1 : l'écran Ferme.
   · Première ouverture : choix d'une spécialité parmi celles encore libres (6 places).
   · Ferme illustrée : ciel selon l'heure réelle, météo du jour, animaux qui se promènent.
   · Récolte : taper ou glisser sur les produits, ou « Tout récolter ». Produit doré ×50 de temps en temps.
   · Stock (avec péremption des œufs et du lait) et vente instantanée au marché.
   Tout ce qui compte (production, stock, pièces, produit doré) est calculé par le serveur Supabase
   (fonctions baron_*, voir supabase/baron.sql) ; l'appli ne fait qu'afficher.
   Préfixe « bn- » partout ; une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{

const Q = window.QUERIDA;
if (!Q || Q.role() !== "ami") return;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const db = () => Q.store().client;
const KEY = "bn_token";
const getToken = () => { try{ return JSON.parse(localStorage.getItem(KEY) || "null"); }catch(e){ return null; } };
const setToken = t => { try{ localStorage.setItem(KEY, JSON.stringify(t)); }catch(e){} };
const seen = k => { try{ return localStorage.getItem("bn_seen_" + k) === "1"; }catch(e){ return true; } };
const markSeen = k => { try{ localStorage.setItem("bn_seen_" + k, "1"); }catch(e){} };

/* Ressources (miroir de baron_resources, pour l'affichage) */
const RES = {
  oeufs: { label:"Œufs",  e:"🥚", unit:"poule",    units:"poules",    who:"Éleveur·se de poules", animal:"🐔", walk:true,  rate:60,  price:10,  fem:true, perish:24 },
  ble:   { label:"Blé",   e:"🌾", unit:"champ",    units:"champs",    who:"Céréalier·ère",        animal:"🌾", walk:false, rate:50,  price:12,  fem:false, perish:null },
  lait:  { label:"Lait",  e:"🥛", unit:"vache",    units:"vaches",    who:"Vacher·ère",           animal:"🐄", walk:true,  rate:30,  price:20,  fem:true, perish:12 },
  bois:  { label:"Bois",  e:"🪵", unit:"bûcheron", units:"bûcherons", who:"Bûcheron·ne",          animal:"🌲", walk:false, rate:20,  price:30,  fem:false, perish:null },
  laine: { label:"Laine", e:"🧶", unit:"mouton",   units:"moutons",   who:"Berger·ère",           animal:"🐑", walk:true,  rate:10,  price:60,  fem:false, perish:null },
  miel:  { label:"Miel",  e:"🍯", unit:"ruche",    units:"ruches",    who:"Apiculteur·rice",      animal:"🐝", walk:true,  rate:5,   price:120, fem:true, perish:null },
};
const un = r => r.fem ? "une" : "un", nouv = r => r.fem ? "Nouvelle" : "Nouveau", prem = r => r.fem ? "Ta première" : "Ton premier";
const MAIN = { oeufs:"🐔", ble:"🌾", lait:"🐄", bois:"🌳", laine:"🐑", miel:"🐝" };
const ORDER = ["oeufs","ble","lait","bois","laine","miel"];
const perRate = r => r.rate >= 1 ? `${r.rate} / h` : `1 / ${Math.round(1 / r.rate)} h`;
// Gros nombres abrégés façon jeu : 9 999, puis 12,5K, 160K, 1,2M, 3,4B, 5T…
const fmtN = n => {
  n = Math.floor(Number(n) || 0); const a = Math.abs(n);
  if (a < 10000) return n.toLocaleString("fr-FR");
  const U = [[1e15, "Q"], [1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  for (const [v, u] of U) if (a >= v){
    const x = n / v; return (Math.abs(x) < 100 ? Math.floor(x * 10) / 10 : Math.floor(x)).toLocaleString("fr-FR") + u;
  }
  return String(n);
};
const fmtDur = ms => {
  if (ms <= 0) return "maintenant";
  const m = Math.round(ms / 60000); if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${String(r).padStart(2,"0")}` : `${h} h`;
};
const errText = e => {
  const m = String((e && (e.message || e.error_description)) || e || "");
  if (m.includes("spécialité déjà prise")) return "Quelqu'un vient de prendre cette spécialité. Choisis-en une autre.";
  if (m.includes("partie complète")) return "Les 6 places sont prises.";
  if (m.includes("déjà inscrit")) return "Tu as déjà une ferme, mais ce téléphone n'a pas ta clé. Demande à Naïm de te la redonner.";
  if (m.includes("stock insuffisant")) return "Tu n'as plus assez en stock.";
  if (m.includes("trop tard")) return "Trop tard, il s'est envolé !";
  if (m.includes("doucement")) return "Doucement, une corvée à la fois !";
  if (m.includes("pas assez de pièces")) return "Pas encore assez de pièces.";
  if (m.includes("vends d'abord")) return "Vends d'abord ta première récolte.";
  if (m.includes("déjà livrée")) return "Trop tard, quelqu'un l'a livrée avant toi !";
  if (m.includes("commande expirée")) return "Cette commande a expiré.";
  if (m.includes("il te manque")) return "Il te manque des produits pour cette commande.";
  if (m.includes("marché plein")) return "Le marché est plein : personne n'en veut pour l'instant.";
  if (m.includes("rupture")) return "Rupture : personne n'en a vendu au marché.";
  if (m.includes("pas assez au marché")) return "Il n'y en a plus autant au marché.";
  if (m.includes("jeton inconnu")) return "Ta clé de ferme n'est plus valable.";
  if (/fetch|network|Failed/i.test(m)) return "Pas de connexion. Réessaie dans un instant.";
  return "Oups, ça n'a pas marché. Réessaie.";
};
const rpc = async (fn, args) => { const { data, error } = await db().rpc(fn, args); if (error) throw error; return data; };

/* =================== Petits effets =================== */
let actx = null;
function sound(kind){
  try{
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    const f = kind === "coin" ? [988, 1319] : kind === "gold" ? [784, 1568] : [660, 880];
    o.type = kind === "coin" ? "square" : "sine";
    o.frequency.setValueAtTime(f[0], t); o.frequency.setValueAtTime(f[1], t + 0.06);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(kind === "coin" ? 0.05 : 0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === "gold" ? 0.5 : 0.18));
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.55);
  }catch(e){}
}
const buzz = ms => { try{ navigator.vibrate && navigator.vibrate(ms); }catch(e){} };
function toast(html, kind){
  document.getElementById("bn-toast")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div id="bn-toast" class="bn-toast ${kind || ""}" role="status">${html}</div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("bn-toast")?.classList.add("on")));
  clearTimeout(toast.t); toast.t = setTimeout(() => { const t = document.getElementById("bn-toast"); if (t){ t.classList.remove("on"); setTimeout(() => t.remove(), 400); } }, 2600);
}
function floatText(x, y, text, gold){
  const d = document.createElement("div");
  d.className = "bn-float" + (gold ? " gold" : ""); d.textContent = text;
  d.style.left = x + "px"; d.style.top = y + "px";
  document.body.appendChild(d); setTimeout(() => d.remove(), 1000);
}

/* =================== Styles =================== */
const CSS = `
.bn-wrap{position:fixed;inset:0;z-index:74;background:var(--bg);color:var(--label);overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:var(--f);animation:bn-in .3s ease}
@keyframes bn-in{from{opacity:0;transform:translateY(16px)}}
.bn-wrap .bn-in{max-width:520px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 28px)}
.bn-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
.bn-top button{border:0;background:var(--fill2);color:var(--label);cursor:pointer;-webkit-tap-highlight-color:transparent}
.bn-top .bn-back{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:8px 14px 8px 10px;font:600 15px var(--f);color:var(--accent)}
.bn-top .bn-x{width:40px;height:40px;border-radius:50%;font-size:20px}
.bn{display:flex;flex-direction:column;gap:14px;padding-bottom:12px;-webkit-user-select:none;user-select:none}
.bn h1{margin:0;font-family:var(--f-display);font-style:italic;font-weight:400;font-size:40px;line-height:1}
.bn .bn-sub{margin:0;color:var(--label2);font-size:15px;line-height:1.4}
.bn-head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px}
.bn-purse{display:flex;align-items:center;gap:6px;background:var(--card);border-radius:999px;padding:7px 13px;font:700 17px var(--f);font-variant-numeric:tabular-nums;box-shadow:0 1px 3px rgba(0,0,0,.08);white-space:nowrap}
.bn-purse.bump{animation:bn-bump .5s ease}
@keyframes bn-bump{40%{transform:scale(1.15)}}
.bn-who{display:flex;align-items:center;gap:8px;color:var(--label2);font-size:14px;margin-top:-6px}
.bn-chip{background:var(--fill2);color:var(--accent);border-radius:999px;padding:3px 10px;font-weight:600;font-size:13px}
/* Scène */
.bn-scene{position:relative;border-radius:22px;overflow:hidden;aspect-ratio:16/11;touch-action:none;box-shadow:0 2px 10px rgba(60,20,10,.12)}
.bn-scene svg.bn-bg{position:absolute;inset:0;width:100%;height:100%;display:block}
.bn-animal{position:absolute;font-size:30px;line-height:1;transform:translate(-50%,-50%);pointer-events:none;filter:drop-shadow(0 2px 1px rgba(0,0,0,.15))}
.bn-animal.w{animation:bn-walk var(--d,14s) ease-in-out infinite alternate;animation-delay:var(--dl,0s)}
.bn-animal.s{animation:bn-sway 3.5s ease-in-out infinite alternate;animation-delay:var(--dl,0s);transform-origin:50% 100%}
.bn-animal.f{animation:bn-fly 6s ease-in-out infinite;animation-delay:var(--dl,0s);font-size:20px}
@keyframes bn-walk{0%{transform:translate(-50%,-50%) translateX(var(--a,-40px)) scaleX(1)}49%{transform:translate(-50%,-50%) translateX(var(--b,40px)) scaleX(1)}50%{transform:translate(-50%,-50%) translateX(var(--b,40px)) scaleX(-1)}100%{transform:translate(-50%,-50%) translateX(var(--a,-40px)) scaleX(-1)}}
@keyframes bn-sway{from{transform:translate(-50%,-50%) rotate(-4deg)}to{transform:translate(-50%,-50%) rotate(4deg)}}
@keyframes bn-fly{0%,100%{transform:translate(-50%,-50%) translate(0,0)}25%{transform:translate(-50%,-50%) translate(22px,-14px)}50%{transform:translate(-50%,-50%) translate(-8px,-24px)}75%{transform:translate(-50%,-50%) translate(-24px,-6px)}}
.bn-item{position:absolute;transform:translate(-50%,-50%);font-size:26px;line-height:1;border:0;background:none;padding:6px;cursor:pointer;-webkit-tap-highlight-color:transparent;animation:bn-pop .35s ease both;filter:drop-shadow(0 2px 1px rgba(0,0,0,.2))}
.bn-item .n{position:absolute;right:-2px;bottom:-2px;font:700 11px var(--f);background:var(--card);color:var(--label);border-radius:999px;padding:1px 5px;box-shadow:0 1px 2px rgba(0,0,0,.2)}
@keyframes bn-pop{from{transform:translate(-50%,-50%) scale(0)}}
.bn-item.got{animation:bn-got .45s ease forwards;pointer-events:none}
@keyframes bn-got{to{transform:translate(-50%,-160%) scale(1.3);opacity:0}}
.bn-item.gold{font-size:34px;filter:drop-shadow(0 0 8px #FFD24A) drop-shadow(0 0 3px #FFB800) sepia(1) saturate(4) hue-rotate(5deg);animation:bn-pop .35s ease both,bn-shine .8s ease-in-out infinite alternate}
@keyframes bn-shine{to{transform:translate(-50%,-50%) scale(1.15)}}
.bn-rain{position:absolute;inset:0;pointer-events:none;background-image:linear-gradient(transparent 0 60%,rgba(255,255,255,.55) 60% 100%);background-size:2px 22px;opacity:.35;animation:bn-rain .5s linear infinite;mask-image:linear-gradient(#000,transparent 85%);-webkit-mask-image:linear-gradient(#000,transparent 85%)}
@keyframes bn-rain{to{background-position:0 22px}}
.bn-cloud{position:absolute;font-size:34px;opacity:.9;animation:bn-cloud linear infinite;pointer-events:none}
@keyframes bn-cloud{from{transform:translateX(-80px)}to{transform:translateX(480px)}}
.bn-scene .bn-tag{position:absolute;left:10px;top:10px;background:rgba(0,0,0,.28);color:#fff;font:600 12px var(--f);border-radius:999px;padding:4px 9px;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
/* Jauge + bouton */
.bn-gauge{background:var(--card);border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:10px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.bn-gauge .row{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:15px}
.bn-gauge .row b{font-size:17px;font-variant-numeric:tabular-nums}
.bn-gauge .row span{color:var(--label2);font-size:14px;text-align:right}
.bn-bar{height:10px;border-radius:999px;background:var(--fill2);overflow:hidden}
.bn-bar i{display:block;height:100%;border-radius:999px;background:var(--accent);transition:width .6s ease}
.bn-gauge.full .bn-bar i{background:#D92D20;animation:bn-blink 1s ease-in-out infinite alternate}
.bn-gauge.full .row span{color:#D92D20;font-weight:600}
@keyframes bn-blink{to{opacity:.55}}
.bn-btn{display:flex;align-items:center;justify-content:center;gap:8px;height:52px;border-radius:15px;border:0;background:var(--accent);color:var(--on-accent);font:600 17px var(--f);width:100%;cursor:pointer;-webkit-tap-highlight-color:transparent}
.bn-btn:active{transform:scale(.98)}
.bn-btn[disabled]{opacity:.45;cursor:default;transform:none}
.bn-btn.ghost{background:var(--fill2);color:var(--accent)}
.bn-btn.small{height:38px;border-radius:11px;font-size:15px;width:auto;padding:0 14px}
/* Stock */
.bn-sec{font:600 13px var(--f);text-transform:uppercase;letter-spacing:.06em;color:var(--label2);margin:6px 4px -6px}
.bn-list{background:var(--card);border-radius:18px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.bn-line{display:flex;align-items:center;gap:12px;padding:12px 14px}
.bn-line + .bn-line{border-top:.5px solid var(--sep)}
.bn-line .ico{font-size:28px;width:34px;text-align:center}
.bn-line .txt{flex:1;min-width:0}
.bn-line .txt b{display:block;font-size:16px;font-variant-numeric:tabular-nums}
.bn-line .txt small{display:block;color:var(--label2);font-size:13px;margin-top:2px}
.bn-line .txt small.warn{color:#D92D20}
.bn-empty{padding:16px;color:var(--label2);font-size:15px;text-align:center}
.bn-hint{background:var(--soft);border-radius:16px;padding:12px 14px;font-size:14px;line-height:1.45;display:flex;gap:10px;align-items:flex-start}
.bn-hint .i{font-size:20px}
/* Choix de spécialité */
.bn-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bn-card{background:var(--card);border:2px solid transparent;border-radius:18px;padding:14px 12px;text-align:left;display:flex;flex-direction:column;gap:4px;font:inherit;color:var(--label);cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,.06);-webkit-tap-highlight-color:transparent}
.bn-card .big{font-size:36px;line-height:1.1}
.bn-card b{font-size:17px}
.bn-card small{color:var(--label2);font-size:13px;line-height:1.35}
.bn-card.on{border-color:var(--accent);background:var(--fill)}
.bn-card[disabled]{opacity:.5;cursor:default;filter:grayscale(.7)}
.bn-card .taken{color:var(--accent);font-weight:600}
.bn-err{color:#D92D20;font-size:14px;text-align:center;min-height:1em}
.bn-load{padding:40px 0;text-align:center;color:var(--label2)}
/* Annonce */
.bn-ann{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:rgba(20,8,4,.45);padding:24px;animation:bn-fade .25s ease}
.bn-ann .box{background:var(--card);color:var(--label);border-radius:24px;max-width:380px;width:100%;padding:22px 20px 18px;text-align:center;animation:bn-up .45s cubic-bezier(.2,1.4,.4,1) both;box-shadow:0 10px 40px rgba(0,0,0,.3)}
.bn-ann .big{font-size:54px;line-height:1;margin-bottom:8px}
.bn-ann h2{margin:0 0 8px;font-family:var(--f-display);font-weight:400;font-size:30px}
.bn-ann p{margin:0 0 16px;color:var(--label2);font-size:15px;line-height:1.45}
@keyframes bn-fade{from{opacity:0}}
@keyframes bn-up{from{transform:translateY(30px) scale(.9);opacity:0}}
.bn-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 12px);transform:translate(-50%,-140%);z-index:95;background:var(--label);color:var(--bg);font:600 15px var(--f);border-radius:999px;padding:10px 18px;box-shadow:0 6px 20px rgba(0,0,0,.25);transition:transform .35s cubic-bezier(.2,1.3,.4,1);white-space:nowrap;max-width:92vw;overflow:hidden;text-overflow:ellipsis}
.bn-toast.on{transform:translate(-50%,0)}
.bn-toast.gold{background:#E8A500;color:#2A1A00}
.bn-float{position:fixed;z-index:96;transform:translate(-50%,-50%);font:800 18px var(--f);color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.55);pointer-events:none;animation:bn-floatup 1s ease-out forwards}
.bn-float.gold{color:#FFD24A;font-size:24px}
@keyframes bn-floatup{to{transform:translate(-50%,-260%);opacity:0}}
.bn-chore{position:absolute;transform:translate(-50%,-50%);border:0;background:none;padding:4px;cursor:pointer;-webkit-tap-highlight-color:transparent;display:flex;flex-direction:column;align-items:center;gap:2px;animation:bn-pop .35s ease both;z-index:3}
.bn-chore .ce{font-size:30px;line-height:1;width:46px;height:46px;display:grid;place-items:center;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.95) 0 52%,rgba(255,255,255,.35) 68%,transparent 72%);box-shadow:0 0 0 3px rgba(232,165,0,.85);animation:bn-wiggle 1.2s ease-in-out infinite}
.bn-chore .cl{font:700 11px var(--f);background:#fff;color:#3B1F17;border-radius:999px;padding:2px 7px;box-shadow:0 1px 3px rgba(0,0,0,.25);white-space:nowrap}
.bn-chore .cl i{font-style:normal;color:#CC3F27}
.bn-chore.hit .ce{animation:bn-hit .25s ease}
.bn-chore.done{animation:bn-got .5s ease forwards;pointer-events:none}
.bn-chore.fox .ce{animation:bn-fox 1.4s ease-in-out infinite}
.bn-chore.bye{animation:bn-bye .5s ease forwards;pointer-events:none}
@keyframes bn-wiggle{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg) scale(1.06)}}
@keyframes bn-hit{50%{transform:scale(.8) rotate(-12deg)}}
@keyframes bn-fox{0%,100%{transform:translateX(-4px)}50%{transform:translateX(4px) translateY(-3px)}}
@keyframes bn-bye{to{opacity:0;transform:translate(-50%,-50%) scale(.4)}}
.bn-combo{position:absolute;right:10px;top:10px;background:#E8A500;color:#2A1A00;font:800 13px var(--f);border-radius:999px;padding:4px 10px;box-shadow:0 2px 6px rgba(0,0,0,.2);transition:opacity .4s,transform .3s;z-index:4}
.bn-combo.off{opacity:0;transform:scale(.6)}
.bn-combo.pop{animation:bn-bump .4s ease}
.bn-main{position:absolute;left:28%;top:56%;transform:translate(-50%,-50%);border:0;background:none;padding:0;width:84px;height:84px;display:grid;place-items:center;font-size:58px;line-height:1;cursor:pointer;-webkit-tap-highlight-color:transparent;z-index:2;filter:drop-shadow(0 3px 2px rgba(0,0,0,.22));touch-action:manipulation}
.bn-main::before{content:"";position:absolute;inset:6px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.55),transparent 70%)}
.bn-main span{position:relative;display:block;transition:transform .08s}
.bn-main.squash span{transform:scale(1.18,.82)}
.bn-main.tired{filter:grayscale(.6) drop-shadow(0 3px 2px rgba(0,0,0,.22));opacity:.75}
.bn-main.no span{animation:bn-no .3s ease}
@keyframes bn-no{25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.bn-hand{position:absolute;left:36%;top:66%;font-size:34px;pointer-events:none;z-index:3;animation:bn-hand 1.1s ease-in-out infinite}
@keyframes bn-hand{50%{transform:translate(-8px,-10px) scale(.9)}}
.bn-energy{position:absolute;left:10px;bottom:10px;z-index:4;display:flex;align-items:center;gap:6px;background:rgba(0,0,0,.32);color:#fff;font:700 12px var(--f);border-radius:999px;padding:4px 10px 4px 7px;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);font-variant-numeric:tabular-nums}
.bn-energy i{display:block;width:54px;height:6px;border-radius:999px;background:rgba(255,255,255,.3);overflow:hidden}
.bn-energy i b{display:block;height:100%;background:#FFD24A;border-radius:999px;transition:width .3s}
.bn-quest{background:var(--card);border-radius:18px;padding:12px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);border:2px solid transparent}
.bn-quest .ico{font-size:26px}
.bn-quest .txt{flex:1;min-width:0}
.bn-quest .txt small{display:block;color:var(--label2);font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em}
.bn-quest .txt b{display:block;font-size:16px;margin:2px 0 6px}
.bn-quest .bn-bar{height:7px}
.bn-quest .rw{font:700 14px var(--f);color:var(--accent);white-space:nowrap}
.bn-quest.ready{border-color:#E8A500;animation:bn-ready 1.2s ease-in-out infinite}
@keyframes bn-ready{50%{box-shadow:0 0 0 6px rgba(232,165,0,.18)}}
.bn-quest.ready .bn-btn{background:#E8A500;color:#2A1A00}
.bn-tabs{display:flex;background:var(--fill2);border-radius:13px;padding:3px;gap:3px;margin-top:-4px}
.bn-tabs button{flex:1;border:0;background:none;border-radius:10px;padding:9px 6px;font:600 15px var(--f);color:var(--label2);cursor:pointer;-webkit-tap-highlight-color:transparent}
.bn-tabs button[aria-pressed="true"]{background:var(--card);color:var(--label);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.bn-tabs i{font-style:normal;background:#E8A500;color:#2A1A00;border-radius:999px;padding:1px 7px;font-size:12px;margin-left:2px}
.bn-crier{background:linear-gradient(135deg,#FCEBD6,#FBE3D3);color:#3B1F17;border-radius:18px;padding:14px;display:flex;gap:12px;align-items:center}
.bn-crier .big{font-size:34px}
.bn-crier b{display:block;font-size:16px}
.bn-crier small{display:block;font-size:13px;color:#7A5A4C;margin-top:2px}
.bn-order{background:var(--card);border-radius:18px;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,.06);display:flex;flex-direction:column;gap:10px;border:2px solid transparent}
.bn-order.ok{border-color:#E8A500}
.bn-order.won{opacity:.6}
.bn-order .top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.bn-order .top b{font-size:18px;color:var(--accent);font-variant-numeric:tabular-nums}
.bn-order .top small{color:var(--label2);font-size:13px}
.bn-order .its{display:flex;flex-wrap:wrap;gap:6px}
.bn-order .it{display:inline-flex;align-items:center;gap:4px;background:var(--fill);border-radius:10px;padding:5px 9px;font-size:14px;font-variant-numeric:tabular-nums}
.bn-order .it.miss{background:rgba(217,45,32,.1);color:#B42318}
.bn-order .it.have{background:rgba(47,125,78,.12);color:#2F7D4E}
.bn-order .it .star{font-size:11px}
.bn-stall{display:grid;grid-template-columns:32px 1fr auto;grid-template-areas:"ico txt pr" "ico sp acts";align-items:center;gap:6px 10px;padding:12px 14px}
.bn-stall + .bn-stall{border-top:.5px solid var(--sep)}
.bn-stall .ico{grid-area:ico;font-size:28px;width:32px;text-align:center;align-self:start;margin-top:2px}
.bn-stall .txt{grid-area:txt;min-width:0}
.bn-stall .txt b{display:block;font-size:16px}
.bn-stall .txt small{display:block;color:var(--label2);font-size:12px;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bn-stall .pr{grid-area:pr;text-align:right}
.bn-stall .pr b{display:block;font-size:16px;font-variant-numeric:tabular-nums}
.bn-stall .pr small{display:block;font:700 12px var(--f)}
.bn-stall .up{color:#2F7D4E}.bn-stall .down{color:#D92D20}.bn-stall .flat{color:var(--label2)}
.bn-stall svg{grid-area:sp;width:100%;height:28px}
.bn-stall .acts{grid-area:acts;display:flex;gap:6px}
.bn-stall .acts .bn-btn{height:32px;font-size:13px;padding:0 11px;border-radius:9px}
.bn-sheet{position:fixed;inset:0;z-index:92;display:flex;align-items:flex-end;justify-content:center;background:rgba(20,8,4,.4);animation:bn-fade .2s ease}
.bn-sheet .box{background:var(--card);color:var(--label);width:100%;max-width:520px;border-radius:24px 24px 0 0;padding:18px 16px calc(env(safe-area-inset-bottom,0px) + 18px);animation:bn-sheetup .3s cubic-bezier(.2,1.1,.4,1) both;display:flex;flex-direction:column;gap:14px}
@keyframes bn-sheetup{from{transform:translateY(100%)}}
.bn-sheet h2{margin:0;font-family:var(--f-display);font-weight:400;font-size:28px}
.bn-sheet .sub{margin:-8px 0 0;color:var(--label2);font-size:14px}
.bn-qty{display:flex;gap:8px;flex-wrap:wrap}
.bn-qty button{flex:1;min-width:60px;height:44px;border-radius:12px;border:2px solid var(--sep);background:var(--bg);color:var(--label);font:700 15px var(--f);cursor:pointer}
.bn-qty button[aria-pressed="true"]{border-color:var(--accent);background:var(--fill);color:var(--accent)}
.bn-qty button[disabled]{opacity:.35}
.bn-total{display:flex;justify-content:space-between;font-size:16px}
.bn-total b{font-variant-numeric:tabular-nums}
.bn-stall .txt small.lv{display:flex;align-items:center;gap:6px;font-weight:600}
.bn-stall .txt small.lv i{display:block;width:44px;height:5px;border-radius:999px;background:var(--fill2);overflow:hidden;flex:none}
.bn-stall .txt small.lv i b{display:block;height:100%;background:var(--accent);border-radius:999px}
.bn-baron{background:linear-gradient(135deg,#FFE7A3,#F6C945);color:#2A1A00;border-radius:22px;padding:18px;display:flex;align-items:center;gap:14px;box-shadow:0 4px 16px rgba(232,165,0,.3)}
.bn-baron .big{font-size:52px;line-height:1;animation:bn-shine 1.6s ease-in-out infinite alternate}
.bn-baron small{display:block;font:700 12px var(--f);text-transform:uppercase;letter-spacing:.06em;opacity:.7}
.bn-baron b{display:block;font-family:var(--f-display);font-weight:400;font-size:34px;line-height:1.05}
.bn-baron span{display:block;font-size:14px;margin-top:3px}
.bn-rank{display:grid;grid-template-columns:28px 1fr auto;gap:2px 10px;align-items:center;padding:12px 14px}
.bn-rank + .bn-rank{border-top:.5px solid var(--sep)}
.bn-rank .n{grid-row:span 2;font:800 18px var(--f);color:var(--label2);text-align:center}
.bn-rank.me{background:var(--fill)}
.bn-rank b{font-size:16px}
.bn-rank .chip{font:700 11px var(--f);background:var(--fill2);color:var(--accent);border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:2px}
.bn-rank .chip.baron{background:#F6C945;color:#2A1A00}
.bn-rank .f{font:800 16px var(--f);font-variant-numeric:tabular-nums;text-align:right}
.bn-rank small{grid-column:2 / 4;color:var(--label2);font-size:12px;font-variant-numeric:tabular-nums}
.bn-titles{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bn-title{background:var(--card);border-radius:16px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.bn-title .e{font-size:26px}
.bn-title small{display:block;color:var(--label2);font-size:12px;font-weight:600;margin-top:4px}
.bn-title b{display:block;font-size:16px;margin-top:2px}
.bn-title span{display:block;color:var(--label2);font-size:12px;margin-top:1px;font-variant-numeric:tabular-nums}
.bn-buy{background:var(--card);border-radius:18px;padding:12px 14px;display:flex;align-items:center;gap:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
.bn-buy .ico{font-size:30px}
.bn-buy .txt{flex:1;min-width:0}
.bn-buy .txt b{display:block;font-size:16px}
.bn-buy .txt small{display:block;color:var(--label2);font-size:13px;margin-top:2px}
@media (prefers-reduced-motion: reduce){.bn-animal,.bn-cloud,.bn-rain,.bn-chore .ce{animation:none!important}}
`;
const st = document.createElement("style"); st.id = "bn-style"; st.textContent = CSS; document.head.appendChild(st);

/* =================== État =================== */
let S = null;               // dernier état renvoyé par le serveur
let fetchedAt = 0;          // Date.now() à la réception
let collected = 0;          // produits ramassés au doigt, pas encore envoyés au serveur
let harvestTimer = null, busy = false, golden = null, rootEl = null, picking = null, pickData = null;

function farm(){ return S && S.farms && S.farms[0]; }
function livePending(){
  const f = farm(); if (!f) return 0;
  const v = Number(f.pending) + Number(f.rate_per_h) * (Date.now() - fetchedAt) / 3600000;
  return Math.min(Number(f.cap), v);
}
function setState(s){ S = s; fetchedAt = Date.now(); try{ localStorage.setItem("bn_coins", String(s.player.coins)); }catch(e){} }

/* =================== Ouverture depuis l'Arcade =================== */
function openBaron(){
  closeBaron();
  const w = document.createElement("div"); w.className = "bn-wrap"; w.setAttribute("role", "dialog"); w.setAttribute("aria-label", "Le Baron");
  w.innerHTML = `<div class="bn-in"><div class="bn-top"><button type="button" class="bn-back" data-bn="arcade">‹ Arcade</button><button type="button" class="bn-x" data-bn="close" aria-label="Fermer">×</button></div><div id="bn-root"></div></div>`;
  document.body.appendChild(w); document.body.style.overflow = "hidden";
  mount();
}
function closeBaron(){
  document.querySelector(".bn-wrap")?.remove(); rootEl = null;
  try{ if (!Q.layerCount()) document.body.style.overflow = ""; }catch(e){ document.body.style.overflow = ""; }
}
const coinsLabel = () => {
  if (S && S.player) return `${fmtN(S.player.coins)} pièces`;
  try{ const c = localStorage.getItem("bn_coins"); if (c !== null) return `${fmtN(+c)} pièces`; }catch(e){}
  return getToken() ? "" : "Choisis ta spécialité";
};
(window.QUERIDA_GAMES = window.QUERIDA_GAMES || {})["baron"] = { open: openBaron, status: coinsLabel };
try{ window.dispatchEvent(new Event("qh-games")); }catch(e){}

/* =================== Montage =================== */
function mount(){
  const root = document.getElementById("bn-root");
  if (!root || root.dataset.bn === "1") return;
  root.dataset.bn = "1"; rootEl = root;
  const me = Q.me();
  if (!me){ root.innerHTML = `<div class="bn-load">Crée d'abord ton profil Querida.</div>`; return; }
  if (Q.demo()){ root.innerHTML = `<div class="bn"><h1>Le Baron</h1><p class="bn-sub">Le jeu a besoin de la vraie base de Querida (pas dispo en démo).</p></div>`; return; }
  if (!getToken()) return showPick();
  if (S){ drawFarm(); refresh(); } else { root.innerHTML = `<div class="bn-load">Ouverture de ta ferme…</div>`; refresh(true); }
}
let md = false;
new MutationObserver(() => { if (md) return; md = true; requestAnimationFrame(() => { md = false; try{ mount(); }catch(e){} }); })
  .observe(document.body, { childList:true, subtree:true });
const alive = () => rootEl && document.body.contains(rootEl);

async function refresh(first){
  try{
    setState(await rpc("baron_state", { p_token: getToken() }));
    if (alive()) drawFarm();
    if (first){ welcome(); setTimeout(rollGolden, 4000); setTimeout(() => loadMarket(true), 1500); setTimeout(() => loadRank(true).then(() => { if (view === "farm" && iAmBaron()) drawFarm(); }), 2500); }
  }catch(e){
    const m = String(e && e.message || "");
    if (m.includes("jeton inconnu")){ setToken(null); S = null; if (alive()) showPick(); return; }
    if (alive() && !S) rootEl.innerHTML = `<div class="bn"><h1>Le Baron</h1><p class="bn-err">${esc(errText(e))}</p><button class="bn-btn ghost" data-bn="retry">Réessayer</button></div>`;
  }
}

/* =================== Choix de la spécialité =================== */
async function showPick(){
  if (!alive()) return;
  rootEl.innerHTML = `<div class="bn-load">Le Baron se prépare…</div>`;
  try{
    const { data, error } = await db().from("baron_players").select("id,name,specialty");
    if (error) throw error;
    pickData = data || [];
  }catch(e){
    rootEl.innerHTML = `<div class="bn"><h1>Le Baron</h1><p class="bn-err">${esc(errText(e))}</p><button class="bn-btn ghost" data-bn="pick-retry">Réessayer</button></div>`;
    return;
  }
  drawPick();
}
function drawPick(err){
  if (!alive()) return;
  const me = Q.me(), taken = Object.fromEntries(pickData.map(p => [p.specialty, p]));
  const mine = pickData.find(p => p.id === me.id);
  if (mine){
    rootEl.innerHTML = `<div class="bn"><h1>Le Baron</h1>
      <div class="bn-hint"><span class="i">🔑</span><span>Tu as déjà une ferme (${esc(RES[mine.specialty].label)}), mais ce téléphone n'a pas ta clé. Demande à Naïm de te la redonner.</span></div></div>`;
    return;
  }
  const full = pickData.length >= 6;
  rootEl.innerHTML = `<div class="bn">
    <div><h1>Le Baron</h1></div>
    <p class="bn-sub">Deviens le plus riche du groupe. Choisis ta spécialité : il n'y a qu'une place pour chacune, et ce choix est définitif. Au départ, toutes rapportent autant ; les plus rares bougent plus sur le marché.</p>
    <div class="bn-chip" style="align-self:flex-start">${pickData.length} / 6 places prises</div>
    ${full ? `<div class="bn-hint"><span class="i">🏰</span><span>Les 6 places sont prises. La partie continue sans toi pour l'instant.</span></div>` : ""}
    <div class="bn-grid">${ORDER.map(k => {
      const r = RES[k], t = taken[k];
      return `<button class="bn-card ${picking === k ? "on" : ""}" data-bn="pick" data-k="${k}" ${t || full ? "disabled" : ""}>
        <span class="big">${r.e}</span><b>${r.label}</b>
        <small>${perRate(r)} · ${r.price} pièces</small>
        <small>${t ? `<span class="taken">Pris par ${esc(t.name)}</span>` : r.perish ? `Se périme en ${r.perish} h` : "Ne se périme pas"}</small>
      </button>`; }).join("")}</div>
    <p class="bn-err">${err ? esc(err) : ""}</p>
    <button class="bn-btn" data-bn="join" ${picking && !taken[picking] && !full ? "" : "disabled"}>${picking ? `Devenir ${esc(RES[picking].who.toLowerCase())}` : "Choisis une spécialité"}</button>
  </div>`;
}
async function join(){
  if (busy || !picking) return; busy = true;
  const btn = rootEl.querySelector('[data-bn="join"]'); if (btn){ btn.disabled = true; btn.textContent = "Installation de ta ferme…"; }
  try{
    const me = Q.me();
    const token = await rpc("baron_join", { p_profile: String(me.id), p_name: String(me.name || "Ami").slice(0, 30), p_resource: picking });
    setToken(token); busy = false;
    rootEl.innerHTML = `<div class="bn-load">Ouverture de ta ferme…</div>`;
    await refresh(true);
  }catch(e){
    busy = false;
    try{ const { data } = await db().from("baron_players").select("id,name,specialty"); pickData = data || pickData; }catch(_){}
    if (String(e.message || "").includes("spécialité déjà prise")) picking = null;
    drawPick(errText(e));
  }
}

/* =================== La ferme =================== */
function sky(){
  const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
  if (h < 6 || h >= 21.5) return { top:"#141B38", bot:"#2E3A68", ground:"#2F5A35", hill:"#244A2B", night:true, h };
  if (h < 8)    return { top:"#F6A97E", bot:"#FCE3C8", ground:"#7FB35A", hill:"#5E9A45", h };
  if (h < 18)   return { top:"#9FD3F0", bot:"#E3F4FB", ground:"#8CC063", hill:"#69A64B", h };
  if (h < 20)   return { top:"#F2873B", bot:"#F9C9A0", ground:"#6E9E4F", hill:"#55873E", h };
  return { top:"#5B2A6E", bot:"#E07A5F", ground:"#4F7D3E", hill:"#3E6A31", h };
}
function weather(){
  // la même météo pour tout le monde, qui change chaque jour
  const d = new Date(); const n = (d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()) * 2654435761 >>> 0;
  const r = (n % 100) / 100; return r < 0.5 ? "soleil" : r < 0.8 ? "nuages" : "pluie";
}
function sceneSVG(){
  const k = sky(), w = weather();
  // soleil ou lune, qui traverse le ciel selon l'heure
  const frac = k.night ? (((k.h + 24 - 21.5) % 24) / 8.5) : Math.min(1, Math.max(0, (k.h - 6) / 15.5));
  const cx = 30 + frac * 300, cy = 70 - Math.sin(frac * Math.PI) * 48;
  const stars = k.night ? Array.from({ length: 18 }, (_, i) => `<circle cx="${(i * 73) % 360}" cy="${8 + (i * 37) % 80}" r="${i % 3 ? 0.9 : 1.4}" fill="#fff" opacity="${0.5 + (i % 4) / 8}"/>`).join("") : "";
  const orb = k.night
    ? `<circle cx="${cx}" cy="${cy}" r="12" fill="#F4F1DE"/><circle cx="${cx + 5}" cy="${cy - 3}" r="11" fill="${k.top}"/>`
    : (w === "pluie" ? "" : `<circle cx="${cx}" cy="${cy}" r="15" fill="#FFD45E"/><circle cx="${cx}" cy="${cy}" r="22" fill="#FFD45E" opacity=".25"/>`);
  const gray = w === "pluie" && !k.night ? `<rect width="360" height="248" fill="#7B8794" opacity=".35"/>` : "";
  return `<svg class="bn-bg" viewBox="0 0 360 248" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="bn-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${k.top}"/><stop offset="1" stop-color="${k.bot}"/></linearGradient></defs>
    <rect width="360" height="248" fill="url(#bn-sky)"/>${stars}${orb}${gray}
    <path d="M0 128 Q60 96 130 120 T260 112 T360 118 V248 H0Z" fill="${k.hill}"/>
    <path d="M0 140 Q90 124 180 136 T360 132 V248 H0Z" fill="${k.ground}"/>
    <g transform="translate(262 88)">
      <rect x="0" y="22" width="62" height="40" fill="#B5432B"/><path d="M-6 24 L31 0 L68 24Z" fill="#7A2E1F"/>
      <rect x="22" y="36" width="18" height="26" fill="#5A2216"/><path d="M22 36 L40 62 M40 36 L22 62" stroke="#E9C7A8" stroke-width="2"/>
      <rect x="6" y="30" width="10" height="9" fill="${k.night ? "#FFD45E" : "#F6E7D4"}"/><rect x="46" y="30" width="10" height="9" fill="${k.night ? "#FFD45E" : "#F6E7D4"}"/>
    </g>
    <g stroke="#E9D3B6" stroke-width="3" stroke-linecap="round" opacity=".9">
      <path d="M8 212 H230"/><path d="M8 226 H230"/>${Array.from({ length: 9 }, (_, i) => `<path d="M${12 + i * 27} 204 V234"/>`).join("")}
    </g>
    ${k.night ? `<rect width="360" height="248" fill="#0B1030" opacity=".28"/>` : ""}
  </svg>`;
}
// Emplacements des produits au sol (en %)
const SLOTS = [[30,66],[52,80],[18,88],[74,80],[44,64],[34,92],[60,92],[14,76],[62,66],[86,90],[32,79],[84,72]];
function animalsHTML(f){
  const r = RES[f.resource], n = Math.min(6, f.units);
  return Array.from({ length: n }, (_, i) => {
    const x = 22 + i * 11 + (i % 2) * 4, y = r.walk ? (i % 2 ? 66 : 58) : 50 + (i % 2) * 6;
    if (f.resource === "miel") return `<div class="bn-animal f" style="left:${80 - i * 6}%;top:${40 + i * 4}%;--dl:-${i * 1.3}s">🐝</div>` + (i === 0 ? `<div class="bn-animal" style="left:82%;top:58%;font-size:30px">🌼</div>` : "");
    if (f.resource === "bois") return `<div class="bn-animal s" style="left:${10 + i * 9}%;top:${44 + (i % 2) * 4}%;font-size:36px;--dl:-${i}s">🌲</div>`;
    if (f.resource === "ble") return `<div class="bn-animal s" style="left:${14 + i * 10}%;top:${54 + (i % 2) * 5}%;font-size:28px;--dl:-${i * 0.7}s">🌾</div><div class="bn-animal s" style="left:${18 + i * 10}%;top:${58 + (i % 2) * 5}%;font-size:24px;--dl:-${i * 0.5}s">🌾</div>`;
    return `<div class="bn-animal w" style="left:${x}%;top:${y}%;--d:${11 + i * 3}s;--dl:-${i * 2.5}s;--a:-${30 + i * 4}px;--b:${30 + i * 5}px">${r.animal}</div>`;
  }).join("") + (f.resource === "oeufs" ? `<div class="bn-animal" style="left:12%;top:47%;font-size:24px">🏠</div>` : "");
}
function itemsHTML(){
  const f = farm(); if (!f) return "";
  const total = Math.max(0, Math.floor(livePending()) - collected);
  const n = Math.min(SLOTS.length, total);
  if (!n) return "";
  const base = Math.floor(total / n), extra = total % n, e = RES[f.resource].e;
  return Array.from({ length: n }, (_, i) => {
    const v = base + (i < extra ? 1 : 0), [x, y] = SLOTS[i];
    return `<button class="bn-item" data-bn="item" data-v="${v}" style="left:${x}%;top:${y}%;animation-delay:${i * 30}ms" aria-label="Ramasser ${v} ${esc(RES[f.resource].label)}">${e}${v > 1 ? `<span class="n">${v}</span>` : ""}</button>`;
  }).join("");
}
function gaugeData(){
  const f = farm(), p = livePending(), cap = Number(f.cap), ready = Math.max(0, Math.floor(p) - collected);
  const full = p >= cap - 1e-6, pct = Math.min(100, (p / cap) * 100);
  const left = (cap - p) / Number(f.rate_per_h) * 3600000;
  return { e: RES[f.resource].e, ready, full, pct, txt: full ? "Ferme pleine : la production est perdue !" : `Pleine dans ${fmtDur(left)}` };
}
function gaugeHTML(){
  const d = gaugeData();
  return `<div class="bn-gauge ${d.full ? "full" : ""}" id="bn-gauge">
    <div class="row"><b id="bn-g-ready">${d.e} ${d.ready} à ramasser</b><span id="bn-g-left">${d.txt}</span></div>
    <div class="bn-bar"><i id="bn-g-fill" style="width:${d.pct.toFixed(1)}%"></i></div>
    <button class="bn-btn" data-bn="all" id="bn-g-btn" ${d.ready ? "" : "disabled"}>Tout récolter</button>
  </div>`;
}
function updateGauge(){
  const g = document.getElementById("bn-gauge"); if (!g) return; const d = gaugeData();
  g.classList.toggle("full", d.full);
  const set = (id, v) => { const el = document.getElementById(id); if (el && el.textContent !== v) el.textContent = v; };
  set("bn-g-ready", `${d.e} ${d.ready} à ramasser`); set("bn-g-left", d.txt);
  const fill = document.getElementById("bn-g-fill"); if (fill) fill.style.width = d.pct.toFixed(1) + "%";
  const btn = document.getElementById("bn-g-btn"); if (btn) btn.disabled = !d.ready || busy;
}
function stockHTML(){
  const rate = Number(S.sell_rate || 0.7);
  if (!S.stocks.length) return `<div class="bn-list"><div class="bn-empty">Ton stock est vide. Ramasse ta production !</div></div>`;
  return `<div class="bn-list">${S.stocks.map(s => {
    const r = RES[s.resource], price = Number(S.market[s.resource] || r.price);
    const room = mRoom(s.resource), q = Math.min(Number(s.qty), room), unit = price * rate, gain = q > 0 ? sellGain(s.resource, q) : 0;
    const exp = s.next_expiry ? new Date(s.next_expiry).getTime() - Date.now() : null;
    return `<div class="bn-line"><span class="ico">${r.e}</span>
      <div class="txt"><b>${fmtN(s.qty)} ${esc(r.label.toLowerCase())}</b>
        <small>${unit.toLocaleString("fr-FR", { maximumFractionDigits:1 })} pièces l'unité au marché</small>
        ${exp !== null ? `<small class="${exp < 3 * 3600000 ? "warn" : ""}">Les premiers se périment dans ${fmtDur(exp)}</small>` : ""}</div>
      ${q > 0 ? `<button class="bn-btn small" data-bn="sell" data-k="${s.resource}" data-q="${q}">Vendre${q < s.qty ? ` ${fmtN(q)}` : ""} · ${fmtN(gain)} 🪙</button>`
              : `<button class="bn-btn small ghost" disabled>Marché plein</button>`}
    </div>`; }).join("")}</div>`;
}
let view = "farm", M = null, mFetched = 0, mBusy = false, sheet = null;
function tabsHTML(){
  const n = M ? M.orders.filter(o => !o.winner && canDeliver(o)).length : 0;
  return `<div class="bn-tabs" role="tablist">
    <button data-bn="view" data-v="farm" aria-pressed="${view === "farm"}">${MAIN[farm().resource]} Ferme</button>
    <button data-bn="view" data-v="market" aria-pressed="${view === "market"}">🏪 Marché${n ? ` <i>${n}</i>` : ""}</button>
    <button data-bn="view" data-v="rank" aria-pressed="${view === "rank"}">🏆 Classement</button></div>`;
}
function drawFarm(){
  if (view === "market") return drawMarket();
  if (view === "rank") return drawRank();
  if (!alive() || !S || !farm()) return;
  const f = farm(), r = RES[f.resource], p = S.player;
  const w = weather();
  rootEl.innerHTML = `<div class="bn">${tabsHTML()}
    <div class="bn-head"><h1>Ma ferme${iAmBaron() ? " 👑" : ""}</h1><div class="bn-purse" id="bn-purse">🪙 <span>${fmtN(p.coins)}</span></div></div>
    <div class="bn-who"><span class="bn-chip">${r.e} ${esc(r.who)}</span><span>${f.units} ${f.units > 1 ? r.units : r.unit} · ${perRate({ rate: Number(f.rate_per_h) })}</span></div>
    ${questHTML()}
    <div class="bn-scene" id="bn-scene">${sceneSVG()}
      ${w !== "soleil" ? `<div class="bn-cloud" style="top:6%;animation-duration:70s;animation-delay:-20s">☁️</div><div class="bn-cloud" style="top:16%;font-size:26px;animation-duration:95s;animation-delay:-60s">☁️</div>` : ""}
      ${w === "pluie" ? `<div class="bn-rain"></div>` : ""}
      ${animalsHTML(f)}
      <button class="bn-main" id="bn-main" data-bn="tap" aria-label="Taper sur ta bête"><span>${MAIN[f.resource]}</span></button>
      ${seen("tap") ? "" : `<span class="bn-hand" id="bn-hand">👆</span>`}
      <span class="bn-energy" id="bn-energy">⚡ <span id="bn-en">30</span><i><b id="bn-enb" style="width:100%"></b></i></span>
      <div id="bn-items">${itemsHTML()}</div>
      <div id="bn-chores">${choresHTML()}</div>
      <span class="bn-combo ${comboOn() ? "" : "off"}" id="bn-combo">${comboText()}</span>
      <span class="bn-tag">${w === "pluie" ? "🌧️ Pluie" : w === "nuages" ? "⛅ Nuageux" : sky().night ? "🌙 Nuit" : "☀️ Beau temps"}</span>
    </div>
    ${gaugeHTML()}
    ${buyHTML()}
    <div class="bn-sec">Mon stock</div>
    ${stockHTML()}
  </div>`;
  if (golden) showGolden();
}
/* =================== Corvées =================== */
const CHORES = {
  arroser: { e:"🥀", done:"🌻", label:"Arroser",    need:1, life:22000, fx:"💧" },
  nourrir: { e:"🌽", done:"😋", label:"Nourrir",    need:1, life:22000, fx:"🌽" },
  herbes:  { e:"🌿", done:"✨", label:"Arracher",   need:3, life:24000, fx:"🌱" },
  renard:  { e:"🦊", done:"💨", label:"Chasser",    need:2, life:12000, fx:"💥" },
};
const CHORE_SLOTS = [[22,56],[48,58],[70,62],[36,74],[80,76],[16,72]];
let chores = [], nextSpawn = Date.now() + 4000, lastChore = 0, choreBusy = false;
const comboNow = () => (Date.now() - lastChore < 40000 && S) ? (S.combo || 0) : 0;
const comboOn = () => comboNow() > 0;
const comboText = () => `Combo ×${(1 + 0.2 * comboNow()).toLocaleString("fr-FR", { maximumFractionDigits:1 })}`;
function choreHTML(c){
  const d = CHORES[c.kind], left = d.need - c.taps;
  return `<button class="bn-chore ${c.kind === "renard" ? "fox" : ""}" data-bn="chore" data-id="${c.id}" style="left:${c.x}%;top:${c.y}%" aria-label="${d.label}">
    <span class="ce">${d.e}</span><span class="cl">${d.label}${left > 1 ? ` <i>×${left}</i>` : ""}</span></button>`;
}
function choresHTML(){ return chores.map(choreHTML).join(""); }
function spawnChore(){
  const free = CHORE_SLOTS.filter(([x, y]) => !chores.some(c => c.x === x && c.y === y));
  if (!free.length) return;
  const kinds = Object.keys(CHORES), kind = kinds[Math.floor(Math.random() * kinds.length)];
  const [x, y] = free[Math.floor(Math.random() * free.length)];
  const c = { id: Math.random().toString(36).slice(2, 9), kind, x, y, taps: 0, born: Date.now() };
  chores.push(c);
  document.getElementById("bn-chores")?.insertAdjacentHTML("beforeend", choreHTML(c));
  buzz(5);
}
setInterval(() => {
  try{
    const t = Date.now();
    // les corvées oubliées s'en vont (le renard file vite)
    chores.filter(c => t - c.born > CHORES[c.kind].life).forEach(c => {
      chores = chores.filter(x => x !== c);
      const el = document.querySelector(`.bn-chore[data-id="${c.id}"]`); if (el){ el.classList.add("bye"); setTimeout(() => el.remove(), 500); }
    });
    if (!alive() || !S || !farm() || document.visibilityState !== "visible") return;
    if (view === "farm" && chores.length < 2 && t >= nextSpawn){ spawnChore(); nextSpawn = t + 15000 + Math.random() * 10000; }
    const cb = document.getElementById("bn-combo"); if (cb){ cb.classList.toggle("off", !comboOn()); if (comboOn()) cb.textContent = comboText(); }
  }catch(e){}
}, 1000);
async function doChore(el){
  const c = chores.find(x => x.id === el.dataset.id); if (!c) return;
  const d = CHORES[c.kind];
  c.taps++; el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); buzz(8); sound("pop");
  const b = el.getBoundingClientRect(); floatText(b.left + b.width / 2, b.top + 10, d.fx);
  if (c.taps < d.need){
    if (c.kind === "renard"){ // le renard détale un peu plus loin
      c.x = Math.max(12, Math.min(86, c.x + (Math.random() < .5 ? -22 : 22))); el.style.left = c.x + "%";
    }
    const lab = el.querySelector(".cl"); if (lab) lab.innerHTML = `${d.label}${d.need - c.taps > 1 ? ` <i>×${d.need - c.taps}</i>` : ""}`;
    return;
  }
  if (choreBusy){ c.taps--; return; }
  choreBusy = true;
  try{
    const res = await rpc("baron_chore", { p_token: getToken(), p_kind: c.kind });
    chores = chores.filter(x => x !== c);
    el.querySelector(".ce").textContent = d.done; el.classList.add("done"); setTimeout(() => el.remove(), 500);
    lastChore = Date.now(); setState(res.state); S.combo = res.combo;
    floatText(b.left + b.width / 2, b.top - 8, `+${res.qty} ${RES[res.resource].e}`, res.combo >= 3);
    const cb = document.getElementById("bn-combo");
    if (cb){ cb.textContent = comboText(); cb.classList.toggle("off", !comboOn()); cb.classList.remove("pop"); void cb.offsetWidth; cb.classList.add("pop"); }
    if (res.combo >= 5) toast("🔥 Combo maximum ×2 !", "gold");
    refreshPanels();
  }catch(err){ c.taps = d.need - 1; toast(esc(errText(err))); }
  choreBusy = false;
}
// Redessine le stock et l'achat sans toucher à la scène (les corvées restent en place)
function refreshPanels(){
  if (view === "market"){ drawMarket(); return; }
  if (view === "rank") return;
  const list = rootEl && rootEl.querySelector(".bn-list"); if (list) list.outerHTML = stockHTML();
  const buy = document.getElementById("bn-buy"); if (buy) buy.outerHTML = buyHTML();
  const purse = document.querySelector("#bn-purse span"); if (purse) purse.textContent = fmtN(S.player.coins);
  const qu = document.getElementById("bn-quest"); if (qu) qu.outerHTML = questHTML();
  updateEnergy();
}

/* =================== Le marché =================== */
const stockOf = k => { const st = S && S.stocks.find(x => x.resource === k); return st ? Number(st.qty) : 0; };
const canDeliver = o => Object.entries(o.items).every(([k, q]) => stockOf(k) >= q);
// Marché à stocks : prix normal à mi-stock, jusqu'à ×4 en rupture, ×0,35 quand c'est plein (comme le serveur)
const mp = k => M && M.prices && M.prices[k];
const priceAt = (k, st) => { const m = mp(k); if (!m) return Number((S.market || {})[k] || RES[k].price);
  const cap = Number(m.cap); return Number(m.base) * Math.min(4, Math.max(0.35, Math.pow((cap / 2) / Math.max(st, cap * 0.05), 0.6))); };
const mStock = k => mp(k) ? Math.max(0, Math.floor(Number(mp(k).stock))) : 0;
const mRoom = k => mp(k) ? Math.max(0, Math.floor(Number(mp(k).cap) - Number(mp(k).stock))) : Infinity;
const buyCost = (k, q) => Math.ceil(q * priceAt(k, Number(mp(k).stock) - q / 2));
const sellGain = (k, q) => Math.floor(q * priceAt(k, (mp(k) ? Number(mp(k).stock) : 0) + q / 2) * Number(S.sell_rate || 0.7));
const maxBuy = (k, coins) => { let lo = 0, hi = mStock(k); while (lo < hi){ const m = Math.ceil((lo + hi) / 2); if (buyCost(k, m) <= coins) lo = m; else hi = m - 1; } return lo; };
const pfmt = n => Number(n).toLocaleString("fr-FR", { maximumFractionDigits: Number(n) < 20 ? 2 : 1 });
async function loadMarket(force){
  if (mBusy || (!force && Date.now() - mFetched < 4000)) return;
  mBusy = true;
  try{
    M = await rpc("baron_market_view", { p_token: getToken() }); mFetched = Date.now();
    if (alive() && view === "market" && !sheet) drawMarket();
    else if (alive()){ const tb = rootEl.querySelector(".bn-tabs"); if (tb) tb.outerHTML = tabsHTML(); }   // pastille des commandes livrables
  }
  catch(e){ if (view === "market" && alive() && !M) rootEl.innerHTML = `<div class="bn">${tabsHTML()}<p class="bn-err">${esc(errText(e))}</p></div>`; }
  mBusy = false;
}
setInterval(() => { if (alive() && S && document.visibilityState === "visible" && (view === "market" || Date.now() - mFetched > 60000)) loadMarket(); }, 15000);
function spark(hist, price, base){
  const pts = (hist || []).map(h => Number(h[1])); pts.push(Number(price));
  if (pts.length < 2) pts.unshift(Number(base));
  const lo = Math.min(...pts, base * 0.95), hi = Math.max(...pts, base * 1.05), w = 160, h = 28;
  const xy = pts.map((v, i) => `${(i / (pts.length - 1) * w).toFixed(1)},${(h - 2 - (v - lo) / (hi - lo) * (h - 4)).toFixed(1)}`);
  const col = pts[pts.length - 1] >= pts[0] ? "#2F7D4E" : "#D92D20";
  const by = (h - 2 - (base - lo) / (hi - lo) * (h - 4)).toFixed(1);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="${by}" x2="${w}" y2="${by}" stroke="currentColor" stroke-opacity=".18" stroke-dasharray="2 3"/><polyline points="${xy.join(" ")}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
function orderHTML(o){
  const ok = !o.winner && canDeliver(o), left = new Date(o.expires_at).getTime() - Date.now();
  const its = Object.entries(o.items).map(([k, q]) => {
    const have = stockOf(k), cls = o.winner ? "" : have >= q ? "have" : "miss";
    return `<span class="it ${cls}">${RES[k].e} ${fmtN(q)}${k === M.star ? ` <span class="star">⭐</span>` : ""}${!o.winner && have < q ? ` <small>(${fmtN(have)})</small>` : ""}</span>`;
  }).join("");
  const foot = o.winner
    ? `<small>${o.mine ? "🏆 Tu l'as livrée !" : `✅ Livrée par ${esc(o.winner)}`}</small>`
    : `<button class="bn-btn ${ok ? "" : "ghost"}" data-bn="deliver" data-id="${o.id}" ${ok ? "" : "disabled"}>${ok ? `Livrer · +${fmtN(o.reward)} 🪙` : "Il te manque des produits"}</button>`;
  return `<div class="bn-order ${ok ? "ok" : ""} ${o.winner ? "won" : ""}"><div class="top"><b>+${fmtN(o.reward)} 🪙</b><small>${o.winner ? "" : `encore ${fmtDur(left)}`}</small></div>
    <div class="its">${its}</div>${foot}</div>`;
}
function drawMarket(){
  if (!alive() || !S || !farm()) return;
  if (!M){ rootEl.innerHTML = `<div class="bn">${tabsHTML()}<div class="bn-load">Le marché ouvre ses étals…</div></div>`; loadMarket(true); return; }
  const p = S.player, star = RES[M.star];
  const stalls = ORDER.map(k => {
    const r = RES[k], m = M.prices[k], price = Number(m.price), ago = Number(m.ago);
    const ch = ago ? (price - ago) / ago * 100 : 0, cls = ch > 0.5 ? "up" : ch < -0.5 ? "down" : "flat";
    const who = M.producers && M.producers[k] ? `de ${esc(M.producers[k])}` : "pas encore de producteur";
    const have = stockOf(k), st = mStock(k), room = mRoom(k), cap = Number(m.cap);
    const lvl = st < 1 ? `<span class="down">Rupture !</span>` : room < 1 ? `<span class="down">Marché plein</span>` : `${fmtN(st)} au marché`;
    return `<div class="bn-stall"><span class="ico">${r.e}</span>
      <div class="txt"><b>${r.label}</b><small>${who}${have ? ` · tu en as ${fmtN(have)}` : ""}</small>
        <small class="lv">${lvl}<i><b style="width:${Math.min(100, st / cap * 100).toFixed(0)}%"></b></i></small></div>
      ${spark(m.history, price, m.base)}
      <div class="pr"><b>${pfmt(price)} 🪙</b><small class="${cls}">${cls === "up" ? "▲" : cls === "down" ? "▼" : "■"} ${Math.abs(ch).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %</small></div>
      <div class="acts"><button class="bn-btn small" data-bn="mbuy" data-k="${k}" ${st < 1 ? "disabled" : ""}>${st < 1 ? "Rupture" : "Acheter"}</button>${have ? `<button class="bn-btn small ghost" data-bn="msell" data-k="${k}" ${room < 1 ? "disabled" : ""}>${room < 1 ? "Plein" : "Vendre"}</button>` : ""}</div>
    </div>`;
  }).join("");
  rootEl.innerHTML = `<div class="bn">${tabsHTML()}
    <div class="bn-head"><h1>Le marché</h1><div class="bn-purse" id="bn-purse">🪙 <span>${fmtN(p.coins)}</span></div></div>
    <div class="bn-crier"><span class="big">📣</span><div><b>Le crieur : commandes du village</b><small>Le premier qui livre empoche tout. Star du jour : ${star.e} ${star.label}, comptée double ⭐</small></div></div>
    ${M.orders.map(orderHTML).join("")}
    <div class="bn-sec">Les étals · prix sur 1 h</div>
    <div class="bn-list">${stalls}</div>
    <p class="bn-sub" style="font-size:13px;text-align:center">Le marché ne vend que ce que vous lui avez vendu : quand c'est rare, c'est cher. Il n'achète que s'il a de la place, et les villageois vident les étals petit à petit.</p>
  </div>`;
}
/* Feuille d'achat / vente */
function openSheet(mode, k){
  const r = RES[k], price = Number(M.prices[k].price), coins = Number(S.player.coins), have = stockOf(k);
  const max = mode === "buy" ? maxBuy(k, coins) : Math.min(have, mRoom(k));
  if (!max){ toast(mode === "buy" ? (mStock(k) < 1 ? "Rupture : personne n'en a vendu au marché." : "Pas assez de pièces.") : (have ? "Le marché est plein : personne n'en veut pour l'instant." : "Tu n'en as pas.")); return; }
  const opts = [...new Set([10, 50, 100, 500].filter(q => q < max).concat([max]))].slice(-4);
  sheet = { mode, k, q: opts.includes(10) && max > 10 ? 10 : max, opts, max, price };
  drawSheet();
}
function drawSheet(){
  document.querySelector(".bn-sheet")?.remove(); if (!sheet) return;
  const { mode, k, q, opts, max, price } = sheet, r = RES[k];
  const total = mode === "buy" ? buyCost(k, q) : sellGain(k, q);
  document.body.insertAdjacentHTML("beforeend", `<div class="bn-sheet" data-bn="sheet-close"><div class="box" role="dialog" aria-modal="true">
    <h2>${mode === "buy" ? "Acheter" : "Vendre"} ${r.e} ${r.label.toLowerCase()}</h2>
    <p class="sub">${pfmt(price)} pièces l'unité${mode === "sell" ? ` · vente à ${Math.round(Number(S.sell_rate || 0.7) * 100)} %` : ""} · ${mode === "buy" ? `${fmtN(mStock(k))} disponibles` : `le marché en prend encore ${fmtN(mRoom(k))}`}</p>
    <div class="bn-qty">${opts.map(o => `<button data-bn="sq" data-q="${o}" aria-pressed="${o === q}">${o === max && o !== 10 && o !== 50 && o !== 100 && o !== 500 ? `Max ${fmtN(o)}` : fmtN(o)}</button>`).join("")}</div>
    <div class="bn-total"><span>${fmtN(q)} ${r.label.toLowerCase()}</span><b>${mode === "buy" ? "−" : "+"}${fmtN(total)} 🪙</b></div>
    <button class="bn-btn" data-bn="sheet-ok">${mode === "buy" ? "Acheter" : "Vendre"}</button>
  </div></div>`);
}
async function sheetOk(){
  if (!sheet || busy) return; busy = true;
  const { mode, k, q } = sheet; sheet = null; document.querySelector(".bn-sheet")?.remove();
  try{
    const res = await rpc(mode === "buy" ? "baron_buy" : "baron_sell", { p_token: getToken(), p_resource: k, p_qty: q });
    setState(res.state); sound("coin"); buzz(12);
    toast(mode === "buy" ? `Acheté : ${fmtN(q)} ${RES[k].e} pour ${fmtN(res.cost)} pièces` : res.sold < q ? `Vendu ${fmtN(res.sold)} : le marché est plein pour le reste` : `Vendu ! +${fmtN(res.earned)} pièces`);
    await loadMarket(true); drawMarket();
  }catch(e){ toast(esc(errText(e))); }
  busy = false;
}
async function deliver(id, btn){
  if (busy) return; busy = true;
  try{
    const res = await rpc("baron_order_deliver", { p_token: getToken(), p_order: +id });
    setState(res.state); M = res.market; mFetched = Date.now();
    const b = btn.getBoundingClientRect(); floatText(b.left + b.width / 2, b.top, `+${fmtN(res.reward)} 🪙`, true);
    sound("gold"); buzz([10, 40, 10, 40]);
    toast(`📣 Commande livrée ! +${fmtN(res.reward)} pièces`, "gold");
    drawMarket();
  }catch(e){ toast(esc(errText(e))); loadMarket(true); }
  busy = false;
}

/* =================== Classement =================== */
let RK = null, rkFetched = 0, rkBusy = false;
const meId = () => String((Q.me() || {}).id || "");
const iAmBaron = () => !!(RK && RK.reign && RK.reign.player_id === meId());
async function loadRank(force){
  if (rkBusy || (!force && Date.now() - rkFetched < 5000)) return;
  rkBusy = true;
  try{ RK = await rpc("baron_ranking", {}); rkFetched = Date.now(); if (alive() && view === "rank") drawRank(); }
  catch(e){ if (alive() && view === "rank" && !RK) rootEl.innerHTML = `<div class="bn">${tabsHTML()}<p class="bn-err">${esc(errText(e))}</p></div>`; }
  rkBusy = false;
}
setInterval(() => { if (alive() && S && view === "rank" && document.visibilityState === "visible") loadRank(); }, 20000);
const rankName = (f, i, isBaron) => isBaron ? "Baron" : f >= 50000 ? "Notable" : f >= 10000 ? "Marchand" : f >= 2000 ? "Fermier" : "Paysan";
const since = t => fmtDur(Date.now() - new Date(t).getTime());
function drawRank(){
  if (!alive() || !S || !farm()) return;
  if (!RK){ rootEl.innerHTML = `<div class="bn">${tabsHTML()}<div class="bn-load">Le crieur compte les pièces…</div></div>`; loadRank(true); return; }
  const P = RK.players || [], reign = RK.reign, me = meId();
  const king = reign && P.find(p => p.id === reign.player_id);
  const rows = P.map((p, i) => {
    const isB = reign && p.id === reign.player_id, rr = RES[p.specialty];
    return `<div class="bn-rank ${p.id === me ? "me" : ""}"><span class="n">${isB ? "👑" : i + 1}</span>
      <div><b>${rr.e} ${esc(p.name)}</b><span class="chip ${isB ? "baron" : ""}">${rankName(Number(p.fortune), i, isB)}</span></div>
      <span class="f">${fmtN(p.fortune)} 🪙</span>
      <small>🪙 ${fmtN(p.coins)} pièces · 📦 ${fmtN(p.stock_value)} en stock · ${MAIN[p.specialty]} ${fmtN(p.units)} (${fmtN(p.farm_value)})</small></div>`;
  }).join("");
  const best = (key, fmt) => { const w = P.slice().sort((a, b) => Number(b[key]) - Number(a[key]))[0]; return w && Number(w[key]) > 0 ? { name: w.name, v: fmt(Number(w[key])) } : null; };
  const T = [
    ["🚜", "Meilleur producteur", best("prod_value", v => `${fmtN(v)} pièces de production / h`)],
    ["📣", "Roi des commandes", best("orders_won", v => `${fmtN(v)} commande${v > 1 ? "s" : ""} livrée${v > 1 ? "s" : ""}`)],
    ["💰", "Meilleur marchand", best("market_earned", v => `${fmtN(v)} pièces gagnées au marché`)],
    ["💪", "Gros bosseur", best("work", v => `${fmtN(v)} taps et corvées`)],
  ].map(([e, t, w]) => `<div class="bn-title"><span class="e">${e}</span><small>${t}</small><b>${w ? esc(w.name) : "—"}</b><span>${w ? w.v : "Personne encore"}</span></div>`).join("");
  const hist = (RK.history || []).map(h => `<div class="bn-line"><span class="ico">👑</span><div class="txt"><b>${esc(h.name)}</b><small>${h.ended_at ? `a régné ${fmtDur(new Date(h.ended_at) - new Date(h.started_at))}` : `règne depuis ${since(h.started_at)}`}</small></div></div>`).join("");
  rootEl.innerHTML = `<div class="bn">${tabsHTML()}
    <div class="bn-head"><h1>Classement</h1><div class="bn-purse" id="bn-purse">🪙 <span>${fmtN(S.player.coins)}</span></div></div>
    ${king ? `<div class="bn-baron"><span class="big">👑</span><div><small>Le Baron du moment</small><b>${esc(king.name)}</b><span>${fmtN(king.fortune)} pièces de fortune · depuis ${since(reign.started_at)}</span></div></div>`
           : `<div class="bn-baron"><span class="big">👑</span><div><small>Le trône est vide</small><b>Personne</b><span>Le premier à 1 000 pièces de fortune devient Baron.</span></div></div>`}
    <div class="bn-sec">Les plus riches</div>
    <div class="bn-list">${rows}</div>
    <p class="bn-sub" style="font-size:13px;text-align:center">Fortune = pièces + valeur du stock + ce qu'ont coûté tes bêtes. Rangs : Paysan, Fermier (2 000), Marchand (10 000), Notable (50 000), et un seul Baron.</p>
    <div class="bn-sec">Les titres</div>
    <div class="bn-titles">${T}</div>
    ${hist ? `<div class="bn-sec">Les règnes</div><div class="bn-list">${hist}</div>` : ""}
  </div>`;
}

/* =================== Achat d'unités =================== */
function buyHTML(){
  const f = farm(), p = S.player;
  const r = RES[f.resource], cost = Number(f.unit_cost || 50), ok = Number(p.coins) >= cost;
  const next = [10, 25, 50].find(m => m > f.units), mult = next === 10 ? 2 : next === 25 ? 4 : 8;
  const pal = next ? `À ${next} ${esc(r.units)} : production ×${mult} (encore ${next - f.units})` : "Production ×8 : palier maximum !";
  return `<div class="bn-buy" id="bn-buy"><span class="ico">${MAIN[f.resource]}</span>
    <div class="txt"><b>${un(r) === "une" ? "Une" : "Un"} ${esc(r.unit)} de plus</b><small>Tu en as ${f.units} · ${pal}</small></div>
    <button class="bn-btn small" data-bn="buy" ${ok ? "" : "disabled"}>${fmtN(cost)} 🪙</button></div>`;
}
async function buyUnit(){
  if (busy) return; busy = true;
  try{
    const res = await rpc("baron_buy_unit", { p_token: getToken() });
    setState(res.state); drawFarm();
    const f = farm(), r = RES[f.resource];
    sound("gold"); buzz([10, 30, 10]);
    toast(`${r.animal} ${nouv(r)} ${esc(r.unit)} ! Tu en as ${f.units}`);
  }catch(e){ toast(esc(errText(e))); refresh(); }
  busy = false;
}

/* =================== Taper sur sa bête =================== */
let tapQueue = 0, tapTimer = null, tapBusy = false;
const energyNow = () => !S ? 0 : Math.max(0, Math.min(30, Number(S.energy || 0) + (Date.now() - fetchedAt) / 4000) - tapQueue);
function updateEnergy(){
  const e = energyNow(), n = document.getElementById("bn-en"), b = document.getElementById("bn-enb"), m = document.getElementById("bn-main");
  if (n) n.textContent = Math.floor(e); if (b) b.style.width = (e / 30 * 100).toFixed(0) + "%";
  if (m) m.classList.toggle("tired", e < 1);
}
setInterval(() => { try{ if (alive() && S) updateEnergy(); }catch(e){} }, 500);
function tapMain(el, x, y){
  if (!S) return;
  if (energyNow() < 1){ el.classList.remove("no"); void el.offsetWidth; el.classList.add("no"); buzz(20);
    toast("⚡ Plus d'énergie : elle revient toute seule (1 toutes les 4 s)"); return; }
  tapQueue++;
  if (!seen("tap")){ markSeen("tap"); document.getElementById("bn-hand")?.remove(); }
  el.classList.add("squash"); setTimeout(() => el.classList.remove("squash"), 80);
  floatText(x + (Math.random() * 30 - 15), y - 20, RES[farm().resource].e);
  sound("pop"); buzz(6); updateEnergy();
  clearTimeout(tapTimer); tapTimer = setTimeout(flushTaps, tapQueue >= 20 ? 0 : 500);
}
async function flushTaps(){
  if (tapBusy || !tapQueue){ if (tapQueue) tapTimer = setTimeout(flushTaps, 300); return; }
  tapBusy = true; const n = tapQueue;
  try{
    const res = await rpc("baron_tap", { p_token: getToken(), p_n: n });
    tapQueue -= n;
    if (res.state){ setState(res.state); }
    else if (S){ S.energy = res.energy; fetchedAt = Date.now(); }
    if (res.qty > 0){
      const m = document.getElementById("bn-main"); if (m){ const b = m.getBoundingClientRect(); floatText(b.left + b.width / 2, b.top - 6, `+${res.qty} ${RES[res.resource].e}`, true); }
    }
    refreshPanels();
  }catch(e){ tapQueue = 0; toast(esc(errText(e))); }
  tapBusy = false;
}

/* =================== Objectifs =================== */
function questProgress(q){
  const c = S.counters || {}, f = farm();
  const have = q.kind === "units" ? f.units : q.kind === "earned" ? Number(S.player.earned || 0) : q.kind === "chores" ? c.chores : Number(c[q.kind] || 0);
  return Math.min(q.target, have || 0);
}
function questText(q){
  const r = RES[farm().resource];
  if (q.kind === "harvested") return `Ramasse ta production`;
  if (q.kind === "taps") return `Tape ${q.target} fois sur ta bête`;
  if (q.kind === "sold") return `Vends au marché`;
  if (q.kind === "units") return `Aie ${q.target} ${esc(r.units)}`;
  if (q.kind === "chores") return `Fais ${q.target} corvées`;
  if (q.kind === "combo") return `Fais un combo ×${(1 + 0.2 * q.target).toLocaleString("fr-FR")}`;
  if (q.kind === "earned") return `Gagne ${fmtN(q.target)} pièces au total`;
  return "";
}
function questHTML(){
  const q = S && S.quest; if (!q) return `<div id="bn-quest" hidden></div>`;
  const have = questProgress(q), ok = have >= q.target;
  return `<div class="bn-quest ${ok ? "ready" : ""}" id="bn-quest"><span class="ico">${ok ? "🎁" : "🎯"}</span>
    <div class="txt"><small>Objectif ${q.idx} / 12</small><b>${questText(q)}</b>
      <div class="bn-bar"><i style="width:${(have / q.target * 100).toFixed(0)}%"></i></div></div>
    ${ok ? `<button class="bn-btn small" data-bn="quest">+${fmtN(q.reward)} 🪙</button>` : `<span class="rw">+${fmtN(q.reward)} 🪙</span>`}</div>`;
}
async function claimQuest(btn){
  if (busy) return; busy = true;
  try{
    const res = await rpc("baron_quest_claim", { p_token: getToken() });
    setState(res.state);
    const b = btn.getBoundingClientRect(); floatText(b.left + b.width / 2, b.top, `+${fmtN(res.reward)} 🪙`, true);
    sound("gold"); buzz([10, 30, 10]);
    toast(res.state.quest ? `🎁 Objectif réussi ! +${fmtN(res.reward)} pièces` : "🏆 Tous les objectifs réussis !", "gold");
    const pu = document.getElementById("bn-purse"); if (pu){ pu.classList.remove("bump"); void pu.offsetWidth; pu.classList.add("bump"); }
    refreshPanels();
  }catch(e){ toast(esc(errText(e))); refresh(); }
  busy = false;
}

// Mise à jour légère chaque seconde (sans redessiner la scène)
setInterval(() => {
  try{
    if (!alive() || !S || !farm()) return;
    updateGauge();
    const box = document.getElementById("bn-items"); if (!box) return;
    const want = Math.min(SLOTS.length, Math.max(0, Math.floor(livePending()) - collected));
    const have = box.querySelectorAll(".bn-item:not(.got)").length;
    if (want !== have && !box.querySelector(".got")) box.innerHTML = itemsHTML();
  }catch(e){}
}, 1000);
// Resynchronisation avec le serveur toutes les minutes
setInterval(() => { if (alive() && S && !busy && !collected && document.visibilityState === "visible") refresh(); }, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && alive() && S) refresh(); });

/* =================== Récolte =================== */
function grab(el){
  if (!el || el.classList.contains("got")) return;
  const v = +el.dataset.v || 1, b = el.getBoundingClientRect();
  el.classList.add("got"); collected += v;
  floatText(b.left + b.width / 2, b.top, `+${v}`); sound("pop"); buzz(8);
  setTimeout(() => el.remove(), 450);
  updateGauge();
  clearTimeout(harvestTimer); harvestTimer = setTimeout(harvest, 900);
}
async function harvest(all){
  clearTimeout(harvestTimer);
  if (busy) { harvestTimer = setTimeout(harvest, 400); return; }
  busy = true;
  if (all) document.querySelectorAll("#bn-items .bn-item:not(.got)").forEach((el, i) => setTimeout(() => grab(el), i * 45));
  if (all) await new Promise(r => setTimeout(r, 120 + 45 * 12));
  clearTimeout(harvestTimer);
  try{
    const res = await rpc("baron_harvest", { p_token: getToken() });
    collected = 0; setState(res.state);
    const g = (res.gains || [])[0];
    if (g) toast(`+${g.qty} ${RES[g.resource].e} dans ton stock`);
    drawFarm();
  }catch(e){ collected = 0; toast(esc(errText(e))); refresh(); }
  busy = false;
}

/* =================== Vente instantanée =================== */
async function sell(k, q){
  if (busy) return; busy = true;
  try{
    const firstSale = !S.player.first_sale_at;
    const res = await rpc("baron_sell", { p_token: getToken(), p_resource: k, p_qty: q });
    setState(res.state); drawFarm();
    const purse = document.getElementById("bn-purse");
    if (purse){ purse.classList.add("bump"); const b = purse.getBoundingClientRect(); floatText(b.left + b.width / 2, b.bottom, `+${fmtN(res.earned)} 🪙`); }
    sound("coin"); buzz(15);
    toast(res.sold < q ? `Vendu ${fmtN(res.sold)} sur ${fmtN(q)} : le marché est plein pour le reste` : `Vendu ! +${fmtN(res.earned)} pièces`);
    loadMarket(true);
    if (firstSale) setTimeout(() => announce("🎉", "Première vente !", `Bravo, tes premières pièces. Achète vite de ${RES[farm().resource].fem ? "nouvelles" : "nouveaux"} ${esc(RES[farm().resource].units)} juste sous ta ferme pour produire plus.`, "Super", "firstsale"), 900);
  }catch(e){ toast(esc(errText(e))); refresh(); }
  busy = false;
}

/* =================== Produit doré =================== */
async function rollGolden(){
  try{
    if (!alive() || !S || golden || document.visibilityState !== "visible") return;
    const g = await rpc("baron_golden_roll", { p_token: getToken() });
    if (g && g.id){ golden = { id: g.id, until: Date.now() + Math.max(2000, new Date(g.until).getTime() - new Date(S.now).getTime() - (Date.now() - fetchedAt)) }; showGolden(); }
  }catch(e){}
}
setInterval(rollGolden, 45000); setTimeout(rollGolden, 5000);
function showGolden(){
  const sc = document.getElementById("bn-scene"); if (!sc || !golden) return;
  if (Date.now() > golden.until){ golden = null; return; }
  if (sc.querySelector(".bn-item.gold")) return;
  const [x, y] = [20 + Math.random() * 55, 58 + Math.random() * 24];
  sc.insertAdjacentHTML("beforeend", `<button class="bn-item gold" data-bn="gold" style="left:${x}%;top:${y}%" aria-label="Produit doré">${RES[farm().resource].e}</button>`);
  buzz([10, 40, 10]); sound("gold");
  const left = golden.until - Date.now();
  setTimeout(() => { const el = document.querySelector(".bn-item.gold:not(.got)"); if (el){ el.classList.add("got"); setTimeout(() => el.remove(), 450); } golden = null; }, left);
}
async function claimGolden(el){
  if (!golden) return; const id = golden.id; golden = null;
  const b = el.getBoundingClientRect(); el.classList.add("got");
  floatText(b.left + b.width / 2, b.top, "×50 !", true); sound("gold"); buzz(30);
  try{
    const res = await rpc("baron_golden_claim", { p_token: getToken(), p_id: id });
    setState(res.state);
    toast(`✨ Produit doré : +50 ${RES[farm().resource].e} !`, "gold");
    setTimeout(drawFarm, 500);
  }catch(e){ toast(esc(errText(e))); }
}

/* =================== Annonces (découverte progressive) =================== */
function announce(big, title, text, ok, key){
  if (key && seen(key)) return; if (key) markSeen(key);
  document.querySelector(".bn-ann")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="bn-ann" data-bn="ann-close"><div class="box" role="dialog" aria-modal="true">
    <div class="big">${big}</div><h2>${title}</h2><p>${text}</p><button class="bn-btn" data-bn="ann-close">${ok}</button></div></div>`);
}
function welcome(){
  const f = farm(); if (!f) return; const r = RES[f.resource];
  if (seen("welcome")){
    announce("🚀", "Nouveau départ", `Tape sur ta bête pour produire tout de suite, suis les objectifs pour gagner des pièces, et achète des ${esc(r.units)} : elles coûtent bien moins cher. À 10, ta production double !`, "Je fonce", "debut");
    markSeen("rythme"); return;
  }
  markSeen("rythme"); markSeen("debut");
  announce(MAIN[f.resource], "Ta ferme t'attend", `Tape sur ta bête, ramasse, vends, achète d'autres ${esc(r.units)}. Le plus riche du groupe devient le Baron 👑`, "C'est parti", "welcome");
}

/* =================== Interactions =================== */
document.addEventListener("click", e => {
  const t = e.target.closest("[data-bn]"); if (!t) return;
  const a = t.dataset.bn;
  if (a === "pick"){ picking = t.dataset.k; drawPick(); buzz(5); }
  else if (a === "join") join();
  else if (a === "pick-retry") showPick();
  else if (a === "retry"){ rootEl.innerHTML = `<div class="bn-load">Ouverture de ta ferme…</div>`; refresh(true); }
  else if (a === "item") grab(t);
  else if (a === "all") harvest(true);
  else if (a === "sell") sell(t.dataset.k, +t.dataset.q);
  else if (a === "gold") claimGolden(t);
  else if (a === "chore") doChore(t);
  else if (a === "buy") buyUnit();
  else if (a === "quest") claimQuest(t);
  else if (a === "view"){ view = t.dataset.v; chores = []; drawFarm(); if (view === "market") loadMarket(true); else if (view === "rank") loadRank(true); else refresh(); buzz(5); }
  else if (a === "mbuy") openSheet("buy", t.dataset.k);
  else if (a === "msell") openSheet("sell", t.dataset.k);
  else if (a === "sq"){ sheet.q = +t.dataset.q; drawSheet(); }
  else if (a === "sheet-ok") sheetOk();
  else if (a === "sheet-close" && e.target === t){ sheet = null; t.remove(); }
  else if (a === "deliver") deliver(t.dataset.id, t);
  else if (a === "ann-close" && (t.tagName === "BUTTON" || e.target === t)) document.querySelector(".bn-ann")?.remove();
  else if (a === "close") closeBaron();
  else if (a === "arcade"){ closeBaron(); document.querySelector(".qh-btn")?.click(); }
});
// Glisser le doigt sur les produits pour les ramasser
let sweeping = false;
document.addEventListener("pointerdown", e => {
  const m = e.target.closest && e.target.closest("#bn-main");
  if (m){ tapMain(m, e.clientX, e.clientY); return; }
  if (e.target.closest && e.target.closest("#bn-scene")) sweeping = true;
}, { passive:true });
document.addEventListener("pointerup", () => { sweeping = false; }, { passive:true });
document.addEventListener("pointercancel", () => { sweeping = false; }, { passive:true });
document.addEventListener("pointermove", e => {
  if (!sweeping) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const it = el && el.closest && el.closest(".bn-item");
  if (!it) return;
  if (it.dataset.bn === "gold") claimGolden(it); else grab(it);
}, { passive:true });


}catch(err){ /* Le Baron ne doit jamais gêner l'appli */ }
})();
