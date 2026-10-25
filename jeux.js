/* Querida · Trois jeux « capacités » : L'Œil, Le Jeu des différences, La Mémoire des chiffres.
   Pour les amis et pour Romane. Un peu cachés :
   · L'Œil : toucher 3 fois le grand titre de la page ;
   · Les Différences : sur l'accueil, toucher 3 fois l'onglet de l'accueil ;
   · La Mémoire des chiffres : toucher 3 fois la petite ligne au-dessus du titre ;
   · L'Accord : toucher 3 fois le soleil de « Comment ça marche » ;
   · Les Tours de Hanoï (course chronométrée) : dans l'Arcade, toucher 3 fois le titre « Arcade » ;
   · Le Savant (culture générale) : dans « Mon profil » de l'Arcade, toucher 3 fois le radar.
   On les retrouve ensuite dans l'Arcade (hub.js).
   Fichier à part, préfixe « qj- » partout ; une erreur ici ne casse jamais l'appli. */
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
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
const lsGet = k => { try{ return +localStorage.getItem(k) || 0; }catch(e){ return 0; } };
const lsSet = (k, v) => { try{ localStorage.setItem(k, String(v)); }catch(e){} };
function markFound(id){
  try{ const a = JSON.parse(localStorage.getItem("qh_found") || "[]"); if (!a.includes(id)){ a.push(id); localStorage.setItem("qh_found", JSON.stringify(a)); window.dispatchEvent(new CustomEvent("qh-found", { detail: id })); } }catch(e){}
}

/* =================== Styles =================== */
const CSS = `
.qj-tap{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:manipulation}
.qj-wig{animation:qj-wig .3s ease}
@keyframes qj-wig{30%{transform:translateX(-3px) rotate(-1deg)}70%{transform:translateX(3px) rotate(1deg)}}
.qj-wrap{position:fixed;inset:0;z-index:75;background:var(--bg);color:var(--label);overflow-y:auto;-webkit-overflow-scrolling:touch;animation:qj-in .35s ease;-webkit-user-select:none;user-select:none;font-family:var(--f)}
@keyframes qj-in{from{opacity:0;transform:scale(.98)}}
.qj-in{max-width:460px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 32px);display:flex;flex-direction:column;gap:12px}
.qj-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
.qj-head h1{margin:0;font-family:var(--f-display);font-style:italic;font-weight:400;font-size:34px;line-height:1}
.qj-close{flex:none;width:40px;height:40px;border-radius:50%;border:0;background:var(--fill2);color:var(--label);font-size:20px;cursor:pointer}
.qj-game{position:relative;width:100%;border-radius:18px;background:#fff;color:#3B1F17;box-shadow:0 8px 24px rgba(59,31,23,.14);padding:14px 14px 16px;display:flex;flex-direction:column;gap:10px;touch-action:manipulation}
.qj-hud{display:flex;justify-content:space-between;align-items:center;font-variant-numeric:tabular-nums}
.qj-k{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7A5A4C}
.qj-v{font-size:30px;font-weight:800;line-height:1}
.qj-bar{height:8px;border-radius:999px;background:rgba(59,31,23,.08);overflow:hidden}
.qj-bar i{display:block;height:100%;width:100%;background:#F2873B;transform-origin:left}
.qj-bar.hot i{background:#CC3F27}
.qj-msg{font-size:15px;font-weight:600;text-align:center;min-height:22px;margin:0;color:#7A5A4C}
.qj-msg.hot{color:#CC3F27}
.qj-title{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:34px 8px}
.qj-title>b{font-family:var(--f-display);font-style:italic;font-weight:400;font-size:44px;line-height:1}
.qj-title p{margin:0;color:#7A5A4C;max-width:30ch}
.qj-title p b{color:#3B1F17}
.qj-go{margin-top:8px;font:700 17px var(--f);color:#fff;background:#CC3F27;border:0;border-radius:999px;padding:13px 30px;cursor:pointer}
.qj-over{position:absolute;inset:0;border-radius:18px;background:rgba(251,245,239,.97);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:22px;cursor:pointer;z-index:3}
.qj-over h2{margin:0;font-family:var(--f-display);font-style:italic;font-weight:400;font-size:40px;line-height:1;color:#CC3F27}
.qj-over .qj-big{font-size:66px;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.qj-over p{margin:0;color:#7A5A4C;font-size:15px;max-width:30ch}
.qj-over .qj-rec{color:#CC3F27;font-weight:700}
.qj-over .qj-cta{color:#3B1F17;font-weight:600;margin-top:8px;visibility:hidden}
/* L'Œil */
.qj-grid{position:relative;width:100%;aspect-ratio:1;display:grid;gap:5px}
.qj-grid button{border:0;padding:0;border-radius:10%;cursor:pointer;transition:transform .08s}
.qj-grid button:active{transform:scale(.94)}
.qj-shake{animation:qj-shake .3s}
@keyframes qj-shake{20%{transform:translateX(-8px)}40%{transform:translateX(7px)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}
.qj-grid button.qj-reveal{box-shadow:0 0 0 4px #fff,0 0 0 7px #3B1F17;z-index:1;animation:qj-pulse .8s ease-in-out infinite}
@keyframes qj-pulse{50%{transform:scale(1.08)}}
.qj-pen{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:44px;font-weight:800;color:#CC3F27;pointer-events:none;animation:qj-penup .7s ease-out forwards;text-shadow:0 2px 0 #fff}
@keyframes qj-penup{to{transform:translate(-50%,-110%);opacity:0}}
/* Différences */
.qj-lives{display:flex;gap:5px}
.qj-lives svg{width:22px;height:22px}
.qj-stage{position:relative;width:100%;aspect-ratio:360/300;border-radius:12px;overflow:hidden;background:#EDE5DC}
.qj-stage svg{position:absolute;inset:0;width:100%;height:100%;display:block}
.qj-blank{position:absolute;inset:0;display:grid;place-items:center;background:#E9E1D7;color:rgba(59,31,23,.4);font-size:40px;letter-spacing:.2em}
.qj-mark{position:absolute;border-radius:50%;pointer-events:none;transform:translate(-50%,-50%);animation:qj-mk .35s cubic-bezier(.2,1.4,.4,1)}
.qj-mark.ok{border:4px solid #2F7D4E;box-shadow:0 0 0 3px #fff}
.qj-mark.ko{border:4px dashed #fff;box-shadow:0 0 0 3px #CC3F27}
.qj-mark.x::before,.qj-mark.x::after{content:"";position:absolute;left:50%;top:50%;width:30px;height:5px;background:#CC3F27;border-radius:3px;box-shadow:0 0 0 2px #fff}
.qj-mark.x::before{transform:translate(-50%,-50%) rotate(45deg)} .qj-mark.x::after{transform:translate(-50%,-50%) rotate(-45deg)}
@keyframes qj-mk{from{transform:translate(-50%,-50%) scale(.3);opacity:0}}
/* Chiffres */
.qj-num{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-weight:700;letter-spacing:.08em;text-align:center;word-break:break-all;line-height:1.15;font-variant-numeric:tabular-nums}
.qj-num i{font-style:normal}
.qj-num i.bad{color:#CC3F27;text-decoration:underline;text-decoration-thickness:3px}
.qj-show{min-height:240px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px}
.qj-entry{min-height:64px;width:100%;border-radius:14px;background:rgba(59,31,23,.05);display:flex;align-items:center;justify-content:center;padding:8px 12px}
.qj-entry .ph{color:rgba(59,31,23,.3);font-size:15px}
.qj-caret{display:inline-block;width:3px;height:1em;background:#CC3F27;margin-left:2px;vertical-align:-.12em;animation:qj-blink 1s steps(1) infinite}
@keyframes qj-blink{50%{opacity:0}}
.qj-pad{width:100%;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.qj-pad button{height:56px;border:0;border-radius:14px;background:rgba(59,31,23,.07);color:#3B1F17;font:600 26px var(--f);cursor:pointer;transition:transform .06s}
.qj-pad button:active{transform:scale(.95)}
.qj-pad .ok{background:#CC3F27;color:#fff;font-size:18px}
.qj-pad .ok:disabled{opacity:.35}
.qj-cmp{width:100%;background:#fff;border-radius:12px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:4px;margin:4px 0}
.qj-verdict{font-family:var(--f-display);font-style:italic;font-size:42px;line-height:1;margin:0;color:#2F7D4E}
/* L'Accord */
.qj-stage2{min-height:200px;display:flex;align-items:center;justify-content:center;gap:22px}
.qj-ch{position:relative;width:118px;height:150px;border-radius:18px;background:rgba(59,31,23,.05);display:flex;align-items:flex-end;justify-content:center;gap:9px;padding:18px 0;transition:background-color .2s,transform .2s}
.qj-ch i{display:block;width:12px;height:16px;border-radius:6px;background:rgba(59,31,23,.15);transition:height .25s cubic-bezier(.3,1.5,.5,1),background-color .2s}
.qj-ch.on{background:#F1E9F7;transform:scale(1.05)} .qj-ch.on i{background:#5B2A6E}
.qj-ch.c2.on{background:#FCEBD6} .qj-ch.c2.on i{background:#F2873B}
.qj-ch span{position:absolute;top:10px;left:0;right:0;text-align:center;font-family:var(--f-display);font-style:italic;font-size:22px;color:rgba(59,31,23,.35)}
.qj-ch i.odd{background:#CC3F27!important;box-shadow:0 0 0 3px #fff,0 0 0 5px #CC3F27}
.qj-ab{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.qj-ab button{height:72px;border:0;border-radius:16px;font:700 18px var(--f);cursor:pointer;transition:transform .08s,opacity .15s}
.qj-ab button:active{transform:scale(.96)} .qj-ab button:disabled{opacity:.35}
.qj-ab .same{background:#E3F1E7;color:#2F7D4E} .qj-ab .diff{background:#FBE3D3;color:#CC3F27}
.qj-again{align-self:center;border:0;background:none;color:#7A5A4C;font:600 14px var(--f);text-decoration:underline;cursor:pointer;padding:4px}
.qj-again:disabled{opacity:.3}
.qj-hp{display:flex;gap:6px;align-items:center;font-size:13px;color:#7A5A4C;background:rgba(59,31,23,.05);border-radius:10px;padding:8px 12px}
.qj-hp svg{width:18px;height:18px;flex:none}
/* Classement */
.qj-board h2{margin:8px 0 6px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--label2)}
.qj-row{width:100%;display:flex;align-items:center;gap:12px;padding:11px 14px;border-radius:12px;background:var(--card);color:var(--label);font-variant-numeric:tabular-nums;margin-top:6px}
.qj-row .qj-rk{width:20px;font-family:var(--f-display);font-size:20px;color:var(--accent);text-align:center}
.qj-row .qj-nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qj-row .qj-sc{font-weight:700}
.qj-row.qj-me{box-shadow:inset 0 0 0 1.5px var(--rind)}
.qj-empty{opacity:.6;font-size:14px;text-align:center;padding:12px}
.qj-toast{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 14px);transform:translate(-50%,-150%);transition:transform .5s cubic-bezier(.2,1.2,.4,1);z-index:80;background:#F3C77A;color:#1A1222;font-weight:700;border-radius:999px;padding:10px 18px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);white-space:nowrap}
.qj-toast.on{transform:translate(-50%,0)}
@media (prefers-reduced-motion: reduce){.qj-wrap{animation:none}.qj-grid button.qj-reveal{animation:none}}
/* Tours de Hanoï */
.qj-hn-q{position:absolute;top:10px;right:10px;z-index:2;width:34px;height:34px;border-radius:50%;border:0;background:rgba(59,31,23,.08);color:#3B1F17;font:700 17px var(--f);cursor:pointer}
.qj-hn{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;height:200px}
.qj-hn-peg{position:relative;border:0;background:rgba(59,31,23,.05);border-radius:12px;padding:0 3px 12px;cursor:pointer;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;-webkit-tap-highlight-color:transparent;touch-action:manipulation;font:inherit}
.qj-hn-peg::after{content:"";position:absolute;left:5%;right:5%;bottom:6px;height:6px;border-radius:3px;background:#7A5A4C}
.qj-hn-peg.goal{background:rgba(47,125,78,.08)}
.qj-hn-peg.sel{background:rgba(242,135,59,.16)}
.qj-hn-pole{position:absolute;left:50%;bottom:8px;width:6px;height:160px;margin-left:-3px;border-radius:3px;background:#C9B8AC}
.qj-hn-st{position:relative;z-index:1;width:100%;display:flex;flex-direction:column-reverse;align-items:center;gap:2px;margin-bottom:4px}
.qj-hn-d{display:block;height:20px;border-radius:7px;box-shadow:inset 0 -3px 0 rgba(0,0,0,.18);transition:transform .14s cubic-bezier(.2,1.3,.4,1)}
.qj-hn-d.up{transform:translateY(-26px);box-shadow:inset 0 -3px 0 rgba(0,0,0,.18),0 6px 10px rgba(59,31,23,.25)}
.qj-hn-goal{position:absolute;top:7px;left:0;right:0;text-align:center;font-style:normal;font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#2F7D4E}
.qj-hn.done .qj-hn-peg.goal{background:rgba(47,125,78,.2)}
.qj-hn-lost{animation:qj-hurt .5s}
@keyframes qj-hurt{30%{transform:scale(1.4) rotate(-10deg)}}
.qj-hn-clock{display:flex;align-items:baseline;justify-content:center;gap:10px;font-family:ui-monospace,"SF Mono",Menlo,monospace;font-variant-numeric:tabular-nums}
.qj-hn-clock b{font-size:38px;font-weight:700;letter-spacing:-.02em;line-height:1}
.qj-hn-clock span{font-size:14px;color:#7A5A4C}
.qj-hn-splits{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.qj-hn-sp{border-radius:8px;background:rgba(59,31,23,.05);padding:5px 3px;text-align:center;font-variant-numeric:tabular-nums;min-width:0}
.qj-hn-sp small{display:block;font-size:10.5px;font-weight:700;color:#7A5A4C;white-space:nowrap}
.qj-hn-sp b{display:block;font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:13px;font-weight:700}
.qj-hn-sp i{display:block;font-style:normal;font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:11px;font-weight:700;min-height:14px}
.qj-hn-sp.cur{background:rgba(242,135,59,.16)} .qj-hn-sp.done{background:rgba(47,125,78,.1)}
.qj-game .up{color:#CC3F27} .qj-game .down{color:#2F7D4E}
.qj-msg.ok{color:#2F7D4E}
.qj-hn-over{justify-content:flex-start;overflow-y:auto}
.qj-hn-over>:first-child{margin-top:auto} .qj-hn-over>:last-child{margin-bottom:auto}
.qj-hn-big{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:50px;font-weight:700;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.qj-hn-det{width:100%;max-width:330px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(59,31,23,.12);text-align:left}
.qj-hn-det summary{list-style:none;cursor:pointer;padding:11px 14px;font-weight:700;font-size:15px;display:flex;justify-content:space-between;align-items:center}
.qj-hn-det summary::-webkit-details-marker{display:none}
.qj-hn-det summary::after{content:"";width:8px;height:8px;border-right:2px solid #7A5A4C;border-bottom:2px solid #7A5A4C;transform:rotate(45deg);transition:transform .2s;margin-top:-4px}
.qj-hn-det[open] summary::after{transform:rotate(-135deg);margin-top:4px}
.qj-hn-tbl{padding:0 14px 10px;font-variant-numeric:tabular-nums}
.qj-hn-tr{display:grid;grid-template-columns:1.1fr 1fr 1fr .8fr;gap:6px;padding:7px 0;border-top:1px solid rgba(59,31,23,.1);font-size:14px;align-items:baseline}
.qj-hn-tr.h{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#7A5A4C}
.qj-hn-tr .t{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-weight:700;text-align:right}
.qj-hn-tr .m{color:#7A5A4C;text-align:center}
.qj-hn-tr .dl{font-family:ui-monospace,"SF Mono",Menlo,monospace;font-size:12.5px;font-weight:700;text-align:right}
.qj-hn-tr.tot{font-weight:800}
.qj-hn-rules{position:absolute;inset:0;z-index:5;border-radius:18px;background:#fff;overflow-y:auto;-webkit-overflow-scrolling:touch}
.qj-hn-rin{display:flex;flex-direction:column;gap:4px;padding:18px 16px 18px;color:#3B1F17}
.qj-hn-rt{font-family:var(--f-display);font-style:italic;font-weight:400;font-size:32px;line-height:1.1}
.qj-hn-rin h4{margin:10px 0 0;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7A5A4C}
.qj-hn-rin p,.qj-hn-rin li{margin:0;font-size:15px;line-height:1.45}
.qj-hn-rin ul{margin:0;padding-left:20px}
.qj-hn-rin .qj-go{margin-top:14px}
/* Le Savant */
.qj-sv-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;width:100%;max-width:340px}
.qj-sv-steps div{background:rgba(59,31,23,.05);border-radius:10px;padding:8px 4px;font-size:12px;color:#7A5A4C;line-height:1.3}
.qj-sv-steps b{display:block;font-family:var(--f);font-style:normal;font-size:14px;font-weight:800;color:#3B1F17}
.qj-sv-lvl{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;padding:5px 10px;border-radius:999px;background:rgba(59,31,23,.05)}
.qj-sv-lvl i{display:flex;gap:2px}
.qj-sv-lvl i b{width:6px;height:12px;border-radius:2px;background:rgba(59,31,23,.15)}
.qj-sv-lvl i b.on{background:#F2873B}
.qj-sv-th{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.qj-sv-th span{width:10px;height:10px;border-radius:50%}
.qj-sv-q{margin:0;font-size:21px;font-weight:700;line-height:1.3;text-wrap:balance;min-height:82px}
.qj-sv-ans{display:flex;flex-direction:column;gap:8px}
.qj-sv-ans button{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:13px 14px;border-radius:14px;border:1.5px solid rgba(59,31,23,.1);background:#fff;color:#3B1F17;font:600 16px var(--f);cursor:pointer;transition:transform .08s,background .2s,border-color .2s;touch-action:manipulation}
.qj-sv-ans button:active{transform:scale(.98)}
.qj-sv-ans button em{flex:none;width:26px;height:26px;border-radius:8px;background:rgba(59,31,23,.05);display:grid;place-items:center;font-style:normal;font-size:13px;font-weight:800;color:#7A5A4C}
.qj-sv-ans button.ok{background:rgba(47,125,78,.12);border-color:#2F7D4E}
.qj-sv-ans button.ok em{background:#2F7D4E;color:#fff}
.qj-sv-ans button.ko{background:rgba(204,63,39,.1);border-color:#CC3F27}
.qj-sv-ans button.ko em{background:#CC3F27;color:#fff}
.qj-sv-ans button.dim{opacity:.45}
.qj-sv-miss{width:100%;max-width:340px;background:#fff;border-radius:12px;padding:12px 14px;text-align:left;box-shadow:0 1px 3px rgba(59,31,23,.12);display:flex;flex-direction:column;gap:4px}
.qj-sv-miss small{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#7A5A4C}
.qj-sv-miss b{font-size:15px;line-height:1.35}
.qj-sv-miss .good{color:#2F7D4E;font-weight:700}
.qj-sv-miss .bad{color:#CC3F27;font-weight:600;text-decoration:line-through}
.qj-sv-thr{padding:0 14px 10px;display:flex;flex-direction:column;gap:7px}
.qj-sv-thr div{display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center;font-size:14px}
.qj-sv-thr div i{grid-column:1/-1;height:6px;border-radius:3px;background:rgba(59,31,23,.08);overflow:hidden;display:block}
.qj-sv-thr div i s{display:block;height:100%;border-radius:3px;text-decoration:none}
.qj-sv-thr span{color:#7A5A4C;font-variant-numeric:tabular-nums}
`;
const st = document.createElement("style"); st.id = "qj-style"; st.textContent = CSS; document.head.appendChild(st);

/* =================== Son =================== */
let actx = null;
function bip(f, d = .07, type = "sine", g = .08){
  try{
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    const t = actx.currentTime, o = actx.createOscillator(), v = actx.createGain(); o.type = type; o.frequency.value = f;
    v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(v).connect(actx.destination); o.start(t); o.stop(t + d + .01);
  }catch(e){}
}
const vib = ms => { try{ navigator.vibrate && navigator.vibrate(ms); }catch(e){} };

/* =================== Classements (plus c'est haut, mieux c'est) =================== */
// arcade/<jeu>/<score sur 4 chiffres>__<date>__<id>__<prénom>.txt
function makeBoard(folder){
  return {
    async load(){
      if (Q.demo()) return [];
      const { data, error } = await Q.store().client.storage.from("capsules").list("arcade/" + folder, { limit: 500, sortBy: { column: "name", order: "desc" } });
      if (error) throw error;
      const by = new Map();
      (data || []).forEach(f => {
        const m = f.name.match(/^(\d{3,4})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)\.txt$/); if (!m) return;
        const r = { score: +m[1], ts: +m[2], id: m[3], name: fromHex(m[4]) };
        const old = by.get(r.id); if (!old || r.score > old.score || (r.score === old.score && r.ts < old.ts)) by.set(r.id, r);
      });
      return [...by.values()].sort((a, b) => b.score - a.score || a.ts - b.ts);
    },
    async submit(score){
      if (Q.demo()) return;
      const key = `${String(Math.min(9999, score)).padStart(4, "0")}__${String(Date.now()).padStart(14, "0")}__${myId()}__${toHex(myName().slice(0, 30))}.txt`;
      const r = await Q.store().client.storage.from("capsules").upload(`arcade/${folder}/` + key, new Blob([myName()], { type:"text/plain" }), { contentType:"text/plain", upsert:false });
      if (r.error) throw r.error;
    }
  };
}
function toast(msg){
  document.getElementById("qj-toast")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="qj-toast" id="qj-toast" role="status">${esc(msg)}</div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("qj-toast")?.classList.add("on")));
  setTimeout(() => { const t = document.getElementById("qj-toast"); if (t){ t.classList.remove("on"); setTimeout(() => t.remove(), 600); } }, 3500);
}

/* =================== L'écran commun (titre, jeu, classement) =================== */
let cur = null;      // { game, wrap, root, boardEl, board }
function openGame(G){
  try{
    if (Q.layerCount()) Q.clearLayers();
    closeGame();
    const wrap = document.createElement("div"); wrap.className = "qj-wrap"; wrap.setAttribute("role", "dialog"); wrap.setAttribute("aria-label", G.title);
    wrap.innerHTML = `<div class="qj-in"><div class="qj-head"><h1>${G.title}</h1><button type="button" class="qj-close" data-qj="close" aria-label="Fermer">×</button></div>
      <div class="qj-game" id="qj-game"></div><div class="qj-board" id="qj-board"></div></div>`;
    document.body.appendChild(wrap); document.body.style.overflow = "hidden";
    cur = { G, wrap, root: wrap.querySelector("#qj-game"), boardEl: wrap.querySelector("#qj-board"), board: null };
    markFound(G.id);
    G.mount(cur.root);
    drawBoard();
    G.Board.load().then(b => { if (cur && cur.G === G){ cur.board = b; drawBoard(); if (G.repair) G.repair(b); } }).catch(() => { if (cur && cur.G === G){ cur.board = "err"; drawBoard(); } });
  }catch(e){}
}
function closeGame(){
  if (!cur) return;
  try{ cur.G.stop(); }catch(e){}
  cur.wrap.remove(); cur = null;
  if (!Q.layerCount() && !document.querySelector(".qh-wrap")) document.body.style.overflow = "";
  try{ window.dispatchEvent(new Event("qh-games")); }catch(e){}
}
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest('[data-qj="close"]'); if (!b) return;
  e.stopPropagation(); closeGame();
}, true);
function drawBoard(){
  if (!cur) return;
  const { G, board } = cur;
  let rows;
  if (board === null) rows = `<p class="qj-empty">Lecture du classement…</p>`;
  else if (board === "err") rows = `<p class="qj-empty">Le classement ne répond pas pour l'instant. Ton record est gardé.</p>`;
  else if (!board.length) rows = `<p class="qj-empty">Personne n'a encore joué. La couronne est libre.</p>`;
  else rows = board.slice(0, 15).map((p, i) => `<div class="qj-row ${p.id === myId() ? "qj-me" : ""}"><span class="qj-rk">${i + 1}</span><span class="qj-nm">${esc(p.name)}${i === 0 ? " 👑" : ""}${window.QUERIDA_GRADE ? window.QUERIDA_GRADE.badge(G.title, board, i) : ""}</span><span class="qj-sc">${G.boardUnit ? G.boardUnit(p) : G.unit(p.score)}</span></div>`).join("");
  cur.boardEl.innerHTML = `<h2>Classement de la bande · ${G.title}</h2>${rows}`;
}
// Fin de partie commune : record perso, classement, couronne
async function finished(G, score){
  if (score <= lsGet(G.key)) return false;
  lsSet(G.key, score);
  (async () => {
    try{
      const before = await G.Board.load(), king = before[0];
      await G.Board.submit(score);
      const b = await G.Board.load();
      if (cur && cur.G === G){ cur.board = b; drawBoard(); }
      if (b[0] && b[0].id === myId() && (!king || king.id !== myId())){
        toast(`👑 Tu as la couronne de ${G.short} !`);
        Q.push("shared", "Nouvelle couronne 👑", `${myName()} a pris la couronne de ${G.short} (${G.unit(score)}).`);
      }
    }catch(e){}
  })();
  return true;
}
function overHTML(verdict, score, sub, extra, isBest, best, unit){
  return `<div class="qj-over" data-qj-over="1" role="dialog" aria-label="Fin de partie"><h2>${verdict}</h2><div class="qj-big">${score}</div><p>${sub}</p>${extra || ""}
    <p class="${isBest ? "qj-rec" : ""}">${isBest ? "Nouveau record !" : "Record : " + unit(best)}</p><p class="qj-cta">Touche pour rejouer</p></div>`;
}
function armReplay(root, again){
  const ov = root.querySelector("[data-qj-over]"), readyAt = performance.now() + 1000;
  setTimeout(() => { const c = ov && ov.querySelector(".qj-cta"); if (c) c.style.visibility = "visible"; }, 1000);
  if (ov) ov.addEventListener("pointerdown", e => { e.preventDefault(); if (performance.now() >= readyAt) again(); });
}
function titleHTML(name, text, best, unit){
  return `<div class="qj-title"><b>${name}</b><p>${text}</p>${best ? `<p>Ton record : <b>${unit(best)}</b></p>` : ""}<button type="button" class="qj-go" data-qj-go="1">Commencer</button></div>`;
}

/* ============================================================
   1 · L'ŒIL — trouver la case d'une couleur légèrement différente
   ============================================================ */
const OEIL = (() => {
  const DUR = 60, PEN = 3;
  let root, state, score, t0, penalty, raf, odd, n, delta, lastDelta, timers = [];
  const G = { id:"oeil", title:"L'Œil", short:"L'Œil", key:"qj_oeil_best", Board: makeBoard("oeil"), unit: s => `${s} case${s > 1 ? "s" : ""}` };
  const sizeFor = s => Math.min(8, 2 + Math.floor(s / 3));
  const deltaFor = s => Math.max(1.5, 22 * Math.pow(.9, s));
  function stop(){ cancelAnimationFrame(raf); timers.forEach(clearTimeout); timers = []; state = "off"; }
  function title(){ state = "title"; root.innerHTML = titleHTML("L'Œil", "Une case n'a pas tout à fait la même couleur que les autres. Trouve-la, puis la suivante… 60 secondes. Une erreur coûte 3 secondes.", lsGet(G.key), G.unit); }
  function round(){
    n = sizeFor(score); delta = deltaFor(score); odd = Math.floor(Math.random() * n * n);
    const h = Math.floor(Math.random() * 360), s = 45 + Math.random() * 35, l = 38 + Math.random() * 22, dl = (l > 50 ? -1 : 1) * delta;
    const base = `hsl(${h} ${s}% ${l}%)`, diff = `hsl(${h} ${s}% ${l + dl}%)`;
    const g = root.querySelector(".qj-grid");
    g.style.gridTemplateColumns = `repeat(${n},1fr)`; g.style.gap = (n > 5 ? 4 : 6) + "px";
    g.innerHTML = Array.from({ length: n * n }, (_, i) => `<button type="button" data-i="${i}" style="background:${i === odd ? diff : base}" aria-label="Case ${i + 1}"></button>`).join("");
    lastDelta = delta;
  }
  const left = () => DUR - (performance.now() - t0) / 1000 - penalty;
  function tick(){
    if (state !== "play") return;
    const l = Math.max(0, left());
    root.querySelector("#qj-tm").textContent = Math.ceil(l);
    root.querySelector(".qj-bar i").style.transform = `scaleX(${l / DUR})`;
    root.querySelector(".qj-bar").classList.toggle("hot", l < 10);
    if (l <= 0) return end();
    raf = requestAnimationFrame(tick);
  }
  function start(){
    stop(); state = "play"; score = 0; penalty = 0;
    root.innerHTML = `<div class="qj-hud"><div><div class="qj-k">Trouvées</div><div class="qj-v" id="qj-sc">0</div></div><div style="text-align:right"><div class="qj-k">Temps</div><div class="qj-v" id="qj-tm">${DUR}</div></div></div>
      <div class="qj-bar"><i></i></div><div class="qj-grid"></div><p class="qj-msg">Record : ${G.unit(lsGet(G.key))}</p>`;
    round(); t0 = performance.now(); raf = requestAnimationFrame(tick);
  }
  function hit(i){
    if (state !== "play") return;
    const g = root.querySelector(".qj-grid");
    if (i === odd){ score++; root.querySelector("#qj-sc").textContent = score; bip(600 + Math.min(900, score * 25), .06, "triangle"); round(); }
    else {
      penalty += PEN; bip(160, .25, "sawtooth", .08); vib(40);
      g.classList.remove("qj-shake"); void g.offsetWidth; g.classList.add("qj-shake");
      g.insertAdjacentHTML("beforeend", `<span class="qj-pen">−${PEN} s</span>`); timers.push(setTimeout(() => g.querySelector(".qj-pen")?.remove(), 700));
    }
  }
  function end(){
    state = "over"; cancelAnimationFrame(raf);
    root.querySelector("#qj-tm").textContent = "0"; root.querySelector(".qj-bar i").style.transform = "scaleX(0)";
    root.querySelector(`.qj-grid button[data-i="${odd}"]`)?.classList.add("qj-reveal");
    bip(220, .4, "sawtooth", .07);
    const prev = lsGet(G.key);
    finished(G, score).then(isBest => {
      timers.push(setTimeout(() => {
        if (state !== "over") return;
        const v = score >= 40 ? "Œil de faucon." : score >= 30 ? "Œil de lynx." : score >= 22 ? "Très bon œil." : score >= 14 ? "Pas mal du tout." : "Il faut des lunettes ?";
        root.insertAdjacentHTML("beforeend", overHTML(v, score, `case${score > 1 ? "s" : ""} trouvée${score > 1 ? "s" : ""} en 60 secondes`,
          `<p>Tu repères un écart de couleur de <b>${lastDelta.toFixed(1).replace(".", ",")} %</b>.</p>`, isBest, Math.max(prev, score), G.unit));
        armReplay(root, start);
      }, 1300));
    });
  }
  G.mount = el => { root = el; title();
    el.addEventListener("pointerdown", e => {
      if (e.target.closest("[data-qj-go]")){ e.preventDefault(); start(); return; }
      const b = e.target.closest(".qj-grid button"); if (!b) return; e.preventDefault(); hit(+b.dataset.i);
    }); };
  G.stop = stop;
  return G;
})();

/* ============================================================
   2 · LE JEU DES DIFFÉRENCES — une scène inventée à chaque manche
   ============================================================ */
const DIFF = (() => {
  const W = 360, H = 300, LIVES = 3, FIND = 12000;
  let root, state, score, lives, scene, change, timers = [], raf = 0;
  const G = { id:"diff", title:"Les Différences", short:"Les Différences", key:"qj_diff_best", Board: makeBoard("diff"), unit: s => `${s} trouvée${s > 1 ? "s" : ""}` };
  const HUES = [0, 22, 45, 120, 165, 200, 225, 265, 300, 330];
  const col = (h, l = 55, s = 65) => `hsl(${h} ${s}% ${l}%)`;
  const DRAW = {
    house: o => `<rect x="-24" y="-10" width="48" height="36" rx="2" fill="${col(o.h, 70, 45)}"/><path d="M-30 -9 L0 -34 L30 -9 Z" fill="${col(o.h2, 42, 55)}"/><rect x="-6" y="8" width="12" height="18" rx="1.5" fill="#6B4630"/><rect x="9" y="-3" width="10" height="10" rx="1" fill="#FFF6D8" stroke="#6B4630" stroke-width="1.5"/>`,
    tree: o => `<rect x="-4" y="4" width="8" height="22" rx="2" fill="#7A5232"/><circle cx="0" cy="-8" r="20" fill="${col(o.h, 38, 50)}"/><circle cx="-9" cy="-14" r="6" fill="#fff" opacity=".12"/>`,
    pine: o => `<rect x="-3.5" y="12" width="7" height="14" fill="#7A5232"/><path d="M0 -30 L18 0 L-18 0 Z M0 -16 L22 14 L-22 14 Z" fill="${col(o.h, 30, 45)}"/>`,
    car: o => `<path d="M-28 6 Q-28 -4 -18 -4 L-12 -4 L-6 -16 L12 -16 L20 -4 L24 -4 Q30 -4 30 6 L30 12 L-28 12 Z" fill="${col(o.h, 50, 70)}"/><path d="M-3 -13 L10 -13 L16 -4 L-8 -4 Z" fill="#DDEFFF"/><circle cx="-15" cy="13" r="6.5" fill="#2E2A28"/><circle cx="18" cy="13" r="6.5" fill="#2E2A28"/><circle cx="-15" cy="13" r="2.5" fill="#bbb"/><circle cx="18" cy="13" r="2.5" fill="#bbb"/>`,
    cat: o => `<path d="M14 14 Q30 10 26 -8" stroke="${col(o.h, 45, 35)}" stroke-width="5" fill="none" stroke-linecap="round"/><ellipse cx="2" cy="12" rx="16" ry="12" fill="${col(o.h, 45, 35)}"/><circle cx="-12" cy="-6" r="11" fill="${col(o.h, 45, 35)}"/><path d="M-21 -11 L-20 -22 L-13 -15 Z M-9 -16 L-4 -24 L-2 -12 Z" fill="${col(o.h, 45, 35)}"/><circle cx="-16" cy="-7" r="1.8" fill="#222"/><circle cx="-9" cy="-7" r="1.8" fill="#222"/>`,
    flower: o => `<path d="M0 26 L0 0" stroke="#3E8A3A" stroke-width="3"/><path d="M0 16 Q10 8 14 14 Q8 20 0 16" fill="#4E9A44"/>${[0,72,144,216,288].map(a => `<circle cx="${(9 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(-6 + 9 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="7" fill="${col(o.h, 62, 75)}"/>`).join("")}<circle cx="0" cy="-6" r="5" fill="#F6C945"/>`,
    bush: o => `<circle cx="-14" cy="10" r="12" fill="${col(o.h, 36, 45)}"/><circle cx="12" cy="10" r="13" fill="${col(o.h, 36, 45)}"/><circle cx="0" cy="0" r="15" fill="${col(o.h, 40, 45)}"/>`,
    mailbox: o => `<rect x="-2.5" y="2" width="5" height="24" fill="#6B4630"/><path d="M-14 4 L-14 -10 Q-14 -18 -6 -18 L6 -18 Q14 -18 14 -10 L14 4 Z" fill="${col(o.h, 48, 65)}"/><path d="M14 -14 L22 -14 L22 -8 L14 -8" fill="#CC3F27"/>`,
    cloud: o => `<g fill="${col(o.h, 96, 30)}"><circle cx="-14" cy="4" r="11"/><circle cx="0" cy="-4" r="15"/><circle cx="15" cy="4" r="11"/><rect x="-24" y="4" width="50" height="11" rx="5.5"/></g>`,
    sun: o => `<g stroke="${col(o.h, 55, 95)}" stroke-width="3.5" stroke-linecap="round">${[0,45,90,135,180,225,270,315].map(a => { const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180); return `<line x1="${(19 * c).toFixed(1)}" y1="${(19 * s).toFixed(1)}" x2="${(26 * c).toFixed(1)}" y2="${(26 * s).toFixed(1)}"/>`; }).join("")}</g><circle r="14" fill="${col(o.h, 58, 95)}"/>`,
    balloon: o => `<path d="M0 16 Q-5 24 2 32" stroke="#555" stroke-width="1.3" fill="none"/><ellipse cx="0" cy="-4" rx="13" ry="17" fill="${col(o.h, 55, 75)}"/><path d="M-3 12 L3 12 L0 16 Z" fill="${col(o.h, 55, 75)}"/><ellipse cx="-5" cy="-10" rx="3" ry="5" fill="#fff" opacity=".35"/>`,
    bird: o => `<path d="M-16 0 Q-8 -10 0 0 Q8 -12 18 -2" stroke="${col(o.h, 25, 30)}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`,
    kite: o => `<path d="M0 -22 L14 0 L0 22 L-14 0 Z" fill="${col(o.h, 55, 75)}"/><path d="M0 -22 L0 22 M-14 0 L14 0" stroke="#fff" stroke-width="1.5" opacity=".7"/><path d="M0 22 Q6 30 -2 36 Q-8 42 0 48" stroke="#555" stroke-width="1.3" fill="none"/>`,
  };
  const SKY = ["cloud", "cloud", "balloon", "bird", "kite", "sun"];
  const GROUND = ["house", "tree", "pine", "car", "cat", "flower", "bush", "mailbox", "house", "tree"];
  const FLIP = new Set(["car", "cat", "mailbox", "bird"]);
  const hueFor = t => t === "tree" || t === "pine" || t === "bush" ? pick([95, 110, 125, 140]) : t === "cloud" ? pick([210, 220]) : t === "sun" ? pick([42, 48]) : pick(HUES);
  const CELLS = [];
  for (let i = 0; i < 4; i++) CELLS.push({ x: 45 + i * 90, y: 62, sky: true });
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) CELLS.push({ x: 45 + i * 90, y: 176 + r * 78, sky: false });
  const makeObj = (cell, type) => { const t = type || pick(CELLS[cell].sky ? SKY : GROUND); return { cell, t, h: hueFor(t), h2: pick(HUES), s: rnd(.82, 1.05), f: Math.random() < .5 ? -1 : 1, dx: rnd(-10, 10), dy: rnd(-6, 6) }; };
  function makeScene(count){
    const sky = Math.random() < .5 ? { top:"#9FD3F0", bot:"#DDF0FA" } : Math.random() < .5 ? { top:"#F6B98A", bot:"#FCE3C8" } : { top:"#B7C7F0", bot:"#E8ECFA" };
    const grass = pick(["#9CCB6E", "#8DC26A", "#A9CF7A"]);
    const idx = CELLS.map((_, i) => i).sort(() => Math.random() - .5).slice(0, count);
    let sun = false;
    const objs = idx.map(i => { let o = makeObj(i); if (o.t === "sun"){ if (sun) o = makeObj(i, "cloud"); sun = true; } return o; });
    return { sky, grass, objs };
  }
  const draw = o => { const c = CELLS[o.cell], fl = FLIP.has(o.t) ? o.f : 1; return `<g transform="translate(${(c.x + o.dx).toFixed(1)} ${(c.y + o.dy).toFixed(1)}) scale(${(o.s * fl).toFixed(3)} ${o.s.toFixed(3)})">${DRAW[o.t](o)}</g>`; };
  let gid = 0;
  function sceneSVG(sc){
    const id = "qjsk" + (++gid), objs = sc.objs.slice().sort((a, b) => CELLS[a.cell].y - CELLS[b.cell].y);
    return `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sc.sky.top}"/><stop offset="1" stop-color="${sc.sky.bot}"/></linearGradient></defs>
      <rect width="${W}" height="${H}" fill="url(#${id})"/><path d="M0 128 Q90 116 180 126 T360 122 L360 300 L0 300 Z" fill="${sc.grass}"/>${objs.map(draw).join("")}</svg>`;
  }
  const clone = sc => ({ sky: sc.sky, grass: sc.grass, objs: sc.objs.map(o => ({ ...o })) });
  function hueAway(h, min){ for (let k = 0; k < 50; k++){ const n = pick(HUES.concat([(h + min) % 360, (h - min + 360) % 360])); if (Math.abs(((n - h + 540) % 360) - 180) >= min) return n; } return (h + 180) % 360; }
  function makeChange(sc, level){
    const out = clone(sc), used = new Set(sc.objs.map(o => o.cell)), free = CELLS.map((_, i) => i).filter(i => !used.has(i));
    const kinds = ["remove", "add", "color"];
    if (level >= 2) kinds.push("move", "flip");
    if (level >= 5) kinds.push("size", "color", "swap");
    for (let tries = 0; tries < 30; tries++){
      const k = pick(kinds), i = Math.floor(Math.random() * out.objs.length), o = out.objs[i];
      if (k === "remove"){ out.objs.splice(i, 1); return { sc: out, cells: [o.cell], k }; }
      if (k === "add" && free.length){ const c = pick(free); out.objs.push(makeObj(c)); return { sc: out, cells: [c], k }; }
      if (k === "move" && free.length){ const c = pick(free.filter(x => CELLS[x].sky === CELLS[o.cell].sky)); if (c === undefined) continue; const from = o.cell; o.cell = c; return { sc: out, cells: [from, c], k }; }
      if (k === "flip" && FLIP.has(o.t)){ o.f = -o.f; return { sc: out, cells: [o.cell], k }; }
      if (k === "color" && o.t !== "cloud" && o.t !== "sun"){
        const min = Math.max(35, 110 - level * 7);
        if (["tree","pine","bush"].includes(o.t)) o.h = o.h < 60 ? 120 : pick([30, 45, 0]); else o.h = hueAway(o.h, min);
        return { sc: out, cells: [o.cell], k };
      }
      if (k === "size"){ o.s *= Math.random() < .5 ? 1.32 : .68; return { sc: out, cells: [o.cell], k }; }
      if (k === "swap"){ const ty = CELLS[o.cell].sky ? SKY : GROUND, nt = pick(ty.filter(t => t !== o.t && t !== "sun")); o.t = nt; o.h = hueFor(nt); return { sc: out, cells: [o.cell], k }; }
    }
    const o = out.objs.shift(); return { sc: out, cells: [o.cell], k: "remove" };
  }
  const LABEL = { remove:"Un objet a disparu", add:"Un objet est apparu", color:"Un objet a changé de couleur", move:"Un objet s'est déplacé", flip:"Un objet s'est retourné", size:"Un objet a changé de taille", swap:"Un objet a été remplacé" };
  const countFor = s => Math.min(11, 5 + Math.floor(s / 2));
  const lookFor = s => Math.max(1600, 4200 - s * 150);
  const heart = on => `<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.2 0 3.6 1.2 5.2 3 1.6-1.8 3-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z" fill="${on ? "#CC3F27" : "rgba(59,31,23,.15)"}"/></svg>`;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  function stop(){ timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); state = "off"; }
  const $ = s => root.querySelector(s);
  function bar(dur, hot){
    const b = $(".qj-bar"), f = $(".qj-bar i"); b.classList.toggle("hot", !!hot); const t0 = performance.now();
    cancelAnimationFrame(raf);
    const tick = () => { if (!root.isConnected) return; const k = Math.max(0, 1 - (performance.now() - t0) / dur); f.style.transform = `scaleX(${k})`; if (k > 0) raf = requestAnimationFrame(tick); };
    tick();
  }
  function msg(t, hot){ const m = $(".qj-msg"); m.textContent = t; m.classList.toggle("hot", !!hot); }
  function title(){ state = "title"; root.innerHTML = titleHTML("Les Différences", "Regarde la scène. Elle disparaît, puis revient avec un seul changement. Touche-le. Trois vies. Chaque scène est inventée : jamais deux fois la même.", lsGet(G.key), G.unit); }
  function frame(){
    root.innerHTML = `<div class="qj-hud"><div><div class="qj-k">Trouvées</div><div class="qj-v" id="qj-sc">${score}</div></div><div class="qj-lives">${[0,1,2].map(i => heart(i < lives)).join("")}</div></div>
      <div class="qj-stage"></div><div class="qj-bar"><i></i></div><p class="qj-msg"></p>`;
  }
  function round(){
    timers.forEach(clearTimeout); timers = []; state = "look";
    scene = makeScene(countFor(score)); change = makeChange(scene, score);
    const stage = $(".qj-stage"), look = lookFor(score);
    stage.innerHTML = sceneSVG(scene); msg("Regarde bien…"); bar(look);
    later(() => { state = "blank"; stage.innerHTML = `<div class="qj-blank">· · ·</div>`; msg(""); }, look);
    later(() => {
      state = "find"; stage.innerHTML = sceneSVG(change.sc); msg("Qu'est-ce qui a changé ? Touche-le.", true); bar(FIND, true);
      later(() => { if (state === "find") miss(null); }, FIND);
    }, look + 700);
  }
  function mark(cx, cy, cls, size){
    const st = $(".qj-stage"), k = st.getBoundingClientRect().width / W;
    st.insertAdjacentHTML("beforeend", `<span class="qj-mark ${cls}" style="left:${cx * k}px;top:${cy * k}px;width:${size * k}px;height:${size * k}px"></span>`);
  }
  const reveal = cls => change.cells.forEach(c => mark(CELLS[c].x, CELLS[c].y, cls, 86));
  function tap(e){
    if (state !== "find") return;
    const r = $(".qj-stage").getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
    if (change.cells.some(c => Math.abs(x - CELLS[c].x) < 46 && Math.abs(y - CELLS[c].y) < (CELLS[c].sky ? 52 : 40))){
      timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); state = "won"; score++; $("#qj-sc").textContent = score;
      reveal("ok"); bip(880, .09); setTimeout(() => bip(1320, .12), 90); msg(LABEL[change.k] + ". Bien vu !");
      later(round, 1100);
    } else miss({ x, y });
  }
  function miss(p){
    timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); state = "lost"; lives--;
    if (p) mark(p.x, p.y, "x", 34);
    reveal("ko"); bip(160, .35, "sawtooth", .08); vib(40);
    $(".qj-lives").innerHTML = [0,1,2].map(i => heart(i < lives)).join("");
    msg((p ? "Raté. " : "Trop tard. ") + LABEL[change.k] + ".", true);
    later(() => { if (lives > 0) round(); else end(); }, 1900);
  }
  function end(){
    state = "over"; const prev = lsGet(G.key);
    finished(G, score).then(isBest => {
      if (state !== "over") return;
      const v = score >= 25 ? "Œil de détective." : score >= 16 ? "Rien ne t'échappe." : score >= 9 ? "Bonne mémoire visuelle." : score >= 4 ? "Pas mal." : "Distrait ?";
      root.insertAdjacentHTML("beforeend", overHTML(v, score, `différence${score > 1 ? "s" : ""} trouvée${score > 1 ? "s" : ""}`, "", isBest, Math.max(prev, score), G.unit));
      armReplay(root, start);
    });
  }
  function start(){ stop(); score = 0; lives = LIVES; frame(); round(); }
  G.mount = el => { root = el; title();
    el.addEventListener("pointerdown", e => {
      if (e.target.closest("[data-qj-go]")){ e.preventDefault(); start(); return; }
      if (e.target.closest(".qj-stage")){ e.preventDefault(); tap(e); }
    }); };
  G.stop = stop;
  return G;
})();

/* ============================================================
   3 · LA MÉMOIRE DES CHIFFRES — retenir un nombre de plus en plus long
   ============================================================ */
const CHIF = (() => {
  const START = 3;
  let root, state, len, target, typed, timers = [], raf = 0;
  const G = { id:"chiffres", title:"La Mémoire des chiffres", short:"La Mémoire des chiffres", key:"qj_chiffres_best", Board: makeBoard("chiffres"), unit: s => `${s} chiffre${s > 1 ? "s" : ""}` };
  const showTime = n => 1000 + n * 550;
  const sizeFor = n => n <= 6 ? 60 : n <= 9 ? 46 : n <= 13 ? 34 : 26;
  const newNumber = n => { let s = String(1 + Math.floor(Math.random() * 9)); while (s.length < n) s += Math.floor(Math.random() * 10); return s; };
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  function stop(){ timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); state = "off"; }
  const head = () => `<div class="qj-hud"><div><div class="qj-k">Longueur</div><div class="qj-v">${len}</div></div><div style="text-align:right"><div class="qj-k">Record</div><div class="qj-v">${lsGet(G.key)}</div></div></div>`;
  function title(){ state = "title"; root.innerHTML = titleHTML("La Mémoire<br>des chiffres", "Un nombre s'affiche, puis disparaît. Retape-le. Un chiffre de plus à chaque manche. Une erreur et c'est fini.", lsGet(G.key), G.unit); }
  function round(){
    target = newNumber(len); typed = ""; state = "show";
    root.innerHTML = head() + `<div class="qj-show"><div class="qj-num" style="font-size:${sizeFor(len)}px">${target}</div><div class="qj-bar" style="width:70%"><i></i></div></div>`;
    const t0 = performance.now(), dur = showTime(len), f = root.querySelector(".qj-bar i");
    cancelAnimationFrame(raf);
    const tick = () => { if (state !== "show") return; const k = Math.max(0, 1 - (performance.now() - t0) / dur); f.style.transform = `scaleX(${k})`; if (k > 0) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    later(typing, dur);
  }
  function typing(){
    state = "type";
    root.innerHTML = head() + `<div class="qj-entry"></div><p class="qj-msg">Retape le nombre</p>
      <div class="qj-pad">${[1,2,3,4,5,6,7,8,9].map(d => `<button type="button" data-d="${d}">${d}</button>`).join("")}<button type="button" data-d="del" aria-label="Effacer" style="font-size:20px">⌫</button><button type="button" data-d="0">0</button><button type="button" class="ok" data-d="ok" disabled>OK</button></div>`;
    paint();
  }
  function paint(){
    const e = root.querySelector(".qj-entry"); if (!e) return;
    e.innerHTML = typed ? `<span class="qj-num" style="font-size:${Math.min(38, sizeFor(len))}px">${typed}<span class="qj-caret"></span></span>` : `<span class="ph">${len} chiffres</span><span class="qj-caret"></span>`;
    const ok = root.querySelector('[data-d="ok"]'); if (ok) ok.disabled = !typed;
  }
  function check(){
    if (typed === target){
      bip(880, .1); setTimeout(() => bip(1320, .12), 90); state = "good";
      root.innerHTML = head() + `<div class="qj-show"><p class="qj-verdict">Exact !</p><div class="qj-num" style="font-size:${sizeFor(len)}px;color:#2F7D4E">${target}</div><p class="qj-msg">Prochain : ${len + 1} chiffres</p></div>`;
      later(() => { len++; round(); }, 1100);
    } else lose();
  }
  function lose(){
    state = "over"; bip(160, .4, "sawtooth", .08);
    const score = len > START ? len - 1 : 0, prev = lsGet(G.key), fs = Math.min(28, sizeFor(len));
    const a = [...target].map((d, i) => `<i class="${typed[i] === d ? "" : "bad"}">${d}</i>`).join("");
    const b = [...typed].map((d, i) => `<i class="${target[i] === d ? "" : "bad"}">${d}</i>`).join("") || "—";
    finished(G, score).then(isBest => {
      if (state !== "over") return;
      const v = score >= 12 ? "Mémoire d'éléphant." : score >= 9 ? "Impressionnant." : score >= 7 ? "Dans la moyenne haute." : score >= 5 ? "Pas mal." : "Distrait ?";
      root.insertAdjacentHTML("beforeend", overHTML(v, score, "chiffres retenus d'affilée",
        `<div class="qj-cmp"><span class="qj-k">Le nombre</span><span class="qj-num" style="font-size:${fs}px">${a}</span><span class="qj-k" style="margin-top:4px">Ta réponse</span><span class="qj-num" style="font-size:${fs}px">${b}</span></div>`,
        isBest, Math.max(prev, score), G.unit));
      armReplay(root, start);
    });
  }
  function key(d){
    if (state !== "type") return;
    if (d === "del"){ typed = typed.slice(0, -1); paint(); return; }
    if (d === "ok"){ if (typed) check(); return; }
    if (typed.length >= 30) return;
    typed += d; bip(500 + +d * 40, .04, "triangle", .05); paint();
    if (typed.length === target.length) later(() => { if (state === "type" && typed.length === target.length) check(); }, 250);
  }
  function start(){ stop(); len = START; round(); }
  G.mount = el => { root = el; title();
    el.addEventListener("pointerdown", e => {
      if (e.target.closest("[data-qj-go]")){ e.preventDefault(); start(); return; }
      const b = e.target.closest(".qj-pad button"); if (!b || b.disabled) return; e.preventDefault(); key(b.dataset.d);
    }); };
  G.stop = stop;
  return G;
})();

/* ============================================================
   4 · L'ACCORD — deux fois le même accord… ou une note a-t-elle glissé ?
   ============================================================ */
const ACC = (() => {
  const LIVES = 3;
  let root, state, lives, score, chord, shifted, shift, replays, smallest, timers = [];
  const G = { id:"accord", title:"L'Accord", short:"L'Accord", key:"qj_accord_best", Board: makeBoard("accord"), unit: s => `${s} bonne${s > 1 ? "s" : ""} réponse${s > 1 ? "s" : ""}` };
  const SHAPES = [["majeur",[0,4,7,12]],["mineur",[0,3,7,12]],["majeur 7",[0,4,7,11]],["mineur 7",[0,3,7,10]],["sus 2",[0,2,7,12]],["add 9",[0,4,7,14]],["sixte",[0,4,9,12]]];
  const NOTES = ["do","do♯","ré","mi♭","mi","fa","fa♯","sol","la♭","la","si♭","si"];
  const shiftFor = s => Math.max(3, 70 * Math.pow(.86, s));
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const HP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 15v-3a8 8 0 0116 0v3"/><rect x="3" y="14" width="4" height="7" rx="1.5"/><rect x="17" y="14" width="4" height="7" rx="1.5"/></svg>';
  const heart = on => `<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.2 0 3.6 1.2 5.2 3 1.6-1.8 3-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z" fill="${on ? "#CC3F27" : "rgba(59,31,23,.15)"}"/></svg>`;
  /* Son : un petit piano électrique doux, joué même si l'iPhone est en silencieux */
  let a = null, bus = null;
  function ac(){
    try{ if (navigator.audioSession) navigator.audioSession.type = "playback"; }catch(e){}
    if (!a){ a = new (window.AudioContext || window.webkitAudioContext)(); bus = a.createGain(); bus.gain.value = .55; const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 3200; bus.connect(lp).connect(a.destination); }
    if (a.state === "suspended") a.resume();
    return a;
  }
  function voice(f, t, dur){
    const out = a.createGain();
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(.16, t + .012); out.gain.exponentialRampToValueAtTime(.05, t + .35); out.gain.exponentialRampToValueAtTime(.0008, t + dur);
    out.connect(bus);
    [[1, 1], [2, .28], [3, .08], [4.01, .05]].forEach(([h, g]) => { const o = a.createOscillator(), v = a.createGain(); o.type = "sine"; o.frequency.value = f * h; v.gain.value = g; o.connect(v).connect(out); o.start(t); o.stop(t + dur + .05); });
  }
  const strum = (fs, at) => { const t = a.currentTime + at; fs.forEach((f, i) => voice(f, t + i * .028, 1.3)); };
  function stop(){ timers.forEach(clearTimeout); timers = []; state = "off"; }
  const $ = q => root.querySelector(q);
  const bars = (n, c) => `<div class="qj-ch ${c}"><span>${c === "c1" ? "1" : "2"}</span>${"<i></i>".repeat(n)}</div>`;
  function title(){ state = "title"; root.innerHTML = `<div class="qj-title"><b>L'Accord</b><p>Tu vas entendre deux fois le même accord… ou presque. Parfois, <b>une seule note a glissé</b>. Pareil ou différent ?</p><div class="qj-hp">${HP}<span>Mets le son, ou mieux, un casque.</span></div>${lsGet(G.key) ? `<p>Ton record : <b>${G.unit(lsGet(G.key))}</b></p>` : ""}<button type="button" class="qj-go" data-qj-go="1">Commencer</button></div>`; }
  function frame(){
    root.innerHTML = `<div class="qj-hud"><div><div class="qj-k">Bonnes réponses</div><div class="qj-v" id="qj-sc">${score}</div></div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px"><div class="qj-lives">${[0,1,2].map(i => heart(i < lives)).join("")}</div><div class="qj-k" id="qj-info"></div></div></div>
      <div class="qj-stage2"></div><p class="qj-msg"></p>
      <div class="qj-ab"><button type="button" class="same" data-a="same" disabled>Pareil</button><button type="button" class="diff" data-a="diff" disabled>Différent</button></div>
      <button type="button" class="qj-again" data-a="again" disabled>Réécouter</button>`;
  }
  function msg(t, cls){ const m = $(".qj-msg"); if (m){ m.textContent = t; m.style.color = cls === "ok" ? "#2F7D4E" : cls === "ko" ? "#CC3F27" : ""; } }
  function btns(on){ root.querySelectorAll(".qj-ab button").forEach(b => b.disabled = !on); const r = $(".qj-again"); if (r) r.disabled = !on || replays >= 1; }
  function light(which, on){ const el = $(".qj-ch." + which); if (!el) return; el.classList.toggle("on", on); el.querySelectorAll("i").forEach((b, k) => b.style.height = on ? (40 + chord.iv[k] * 5) + "px" : "16px"); }
  function play(){
    ac(); btns(false);
    const f2 = chord.f.map((f, k) => k === shifted ? f * Math.pow(2, shift / 1200) : f);
    strum(chord.f, .05); strum(f2, 1.45);
    later(() => light("c1", true), 50); later(() => light("c1", false), 1150);
    later(() => light("c2", true), 1450); later(() => { light("c2", false); if (state === "ask") btns(true); }, 2550);
  }
  function next(){
    replays = 0; state = "ask";
    const [n, iv] = SHAPES[Math.floor(Math.random() * SHAPES.length)], r = 48 + Math.floor(Math.random() * 12);
    chord = { name: NOTES[r % 12] + " " + n, iv, f: iv.map(i => 440 * Math.pow(2, (r + i - 69) / 12)) };
    const isDiff = Math.random() < .55;
    shifted = isDiff ? 1 + Math.floor(Math.random() * (iv.length - 1)) : -1;
    shift = isDiff ? (Math.random() < .5 ? -1 : 1) * shiftFor(score) : 0;
    $(".qj-stage2").innerHTML = bars(iv.length, "c1") + bars(iv.length, "c2");
    $("#qj-info").textContent = "Accord de " + chord.name;
    msg("Écoute…");
    later(() => { if (state === "ask"){ play(); later(() => { if (state === "ask") msg("Pareil, ou différent ?"); }, 2550); } }, 450);
  }
  function answer(saysDiff){
    if (state !== "ask") return;
    state = "wait"; btns(false);
    const isDiff = shifted >= 0, c = Math.round(Math.abs(shift));
    if (saysDiff === isDiff){
      score++; $("#qj-sc").textContent = score;
      if (isDiff) smallest = smallest ? Math.min(smallest, Math.abs(shift)) : Math.abs(shift);
      msg(isDiff ? `Bien entendu : une note avait glissé de ${c} cents.` : "Oui, c'était exactement le même.", "ok");
      bip(880, .08); setTimeout(() => bip(1320, .1), 80);
      later(next, 1300);
    } else {
      lives--; $(".qj-lives").innerHTML = [0,1,2].map(i => heart(i < lives)).join("");
      msg(isDiff ? `Raté : une note avait glissé de ${c} cents ${shift > 0 ? "vers l'aigu" : "vers le grave"}.` : "Raté : c'était exactement le même accord.", "ko");
      if (isDiff){ const b = root.querySelectorAll(".qj-ch.c2 i")[shifted]; if (b) b.classList.add("odd"); }
      bip(160, .3, "sawtooth", .05); vib(40);
      later(lives <= 0 ? end : next, lives <= 0 ? 1800 : 2000);
    }
  }
  function end(){
    state = "over"; const prev = lsGet(G.key);
    finished(G, score).then(isBest => {
      if (state !== "over") return;
      const v = score >= 30 ? "Oreille de chef d'orchestre." : score >= 22 ? "Oreille de musicien." : score >= 15 ? "Très fine oreille." : score >= 9 ? "Bonne oreille." : score >= 4 ? "Ça vient." : "Il faut déboucher les oreilles ?";
      const extra = smallest ? `<p>Le plus petit glissement que tu as repéré : <b>${Math.round(smallest)} cents</b>${smallest < 50 ? ", soit 1/" + Math.round(100 / smallest) + " de demi-ton" : ""}. Un demi-ton, c'est 100 cents.</p>` : "";
      root.insertAdjacentHTML("beforeend", overHTML(v, score, `bonne${score > 1 ? "s" : ""} réponse${score > 1 ? "s" : ""}`, extra, isBest, Math.max(prev, score), G.unit));
      armReplay(root, start);
    });
  }
  function start(){ stop(); ac(); lives = LIVES; score = 0; smallest = 0; frame(); next(); }
  G.mount = el => { root = el; title();
    el.addEventListener("click", e => {
      if (e.target.closest("[data-qj-go]")){ start(); return; }
      const b = e.target.closest("[data-a]"); if (!b || b.disabled) return;
      if (b.dataset.a === "same") answer(false); else if (b.dataset.a === "diff") answer(true);
      else if (b.dataset.a === "again" && state === "ask" && replays < 1){ replays++; play(); }
    }); };
  G.stop = () => { stop(); try{ if (a) a.suspend(); }catch(e){} };
  return G;
})();

/* ============================================================
   5 · LES TOURS DE HANOÏ — une course en 4 tours (3, 4, 5, 6 disques).
   Un chrono par tour, 3 vies (un grand sur un petit = une erreur), bonus de temps
   pour chaque tour faite au nombre minimum de coups. Le meilleur temps total gagne.
   ============================================================ */
const HANOI = (() => {
  const LEVELS = [3, 4, 5, 6], BONUS = [500, 1000, 2000, 4000], CHELEM = 3000, LIVES = 3, GOAL = 2;
  const COLS = ["#CC3F27", "#F2873B", "#E8B530", "#2F7D4E", "#1E4E9C", "#7B5BB0"];
  const fmt = ms => { const s = ms / 1000; if (s < 60) return s.toFixed(2).replace(".", ","); const m = Math.floor(s / 60); return m + ":" + (s - m * 60).toFixed(2).replace(".", ",").padStart(5, "0"); };
  const fmtD = ms => (ms > 0 ? "+" : "−") + (Math.abs(ms) / 1000).toFixed(2).replace(".", ",");
  const opt = k => Math.pow(2, k) - 1;
  const RUN = "qj_hanoi_run";       // meilleure course : { total, splits }
  const G = { id:"hanoi", title:"Les Tours de Hanoï", short:"Hanoï", key:"qj_hanoi_best", unit: ms => fmt(ms) + " s" };
  // Classement au temps (plus court = mieux) : arcade/hanoi2/<ms sur 7 chiffres>__<date>__<id>__<prénom>.txt
  G.Board = {
    async load(){
      if (Q.demo()) return [];
      const { data, error } = await Q.store().client.storage.from("capsules").list("arcade/hanoi2", { limit: 500, sortBy: { column: "name", order: "asc" } });
      if (error) throw error;
      const by = new Map();
      (data || []).forEach(f => {
        const m = f.name.match(/^(\d{7})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)\.txt$/); if (!m) return;
        const r = { score: +m[1], ts: +m[2], id: m[3], name: fromHex(m[4]) };
        const old = by.get(r.id); if (!old || r.score < old.score || (r.score === old.score && r.ts < old.ts)) by.set(r.id, r);
      });
      return [...by.values()].sort((a, b) => a.score - b.score || a.ts - b.ts);
    },
    async submit(ms){
      if (Q.demo()) return;
      const key = `${String(Math.min(9999999, Math.round(ms))).padStart(7, "0")}__${String(Date.now()).padStart(14, "0")}__${myId()}__${toHex(myName().slice(0, 30))}.txt`;
      const r = await Q.store().client.storage.from("capsules").upload("arcade/hanoi2/" + key, new Blob([myName()], { type:"text/plain" }), { contentType:"text/plain", upsert:false });
      if (r.error) throw r.error;
    }
  };
  function loadBest(){ try{ const b = JSON.parse(localStorage.getItem(RUN) || "null"); return b && b.total ? b : null; }catch(e){ return null; } }
  function saveBest(b){ try{ localStorage.setItem(RUN, JSON.stringify(b)); localStorage.setItem(G.key, String(Math.round(b.total))); }catch(e){} }
  let root, state, li, n, pegs, sel, moves, lives, t0, pausedAt, splits, movesLog, bonusLog, raf = 0, timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const $ = q => root.querySelector(q);
  const now = () => performance.now();
  const levelTime = () => t0 ? now() - t0 : 0;
  const total = () => splits.reduce((a, s) => a + s, 0);
  const heart = on => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.2 0 3.6 1.2 5.2 3 1.6-1.8 3-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z" fill="${on ? "#CC3F27" : "rgba(59,31,23,.15)"}"/></svg>`;
  const RULES = `<div class="qj-hn-rules" data-hn-rules-box="1"><div class="qj-hn-rin">
    <b class="qj-hn-rt">Les règles</b>
    <h4>Le but</h4><p>Faire passer toute la tour sur le piquet de droite, marqué « Arrivée », le plus vite possible.</p>
    <h4>Comment jouer</h4><ul><li>Touche un piquet pour soulever le disque du dessus.</li><li>Touche un autre piquet pour l'y poser.</li><li>Touche à nouveau le même piquet pour le reposer.</li><li>On ne déplace qu'un disque à la fois, toujours celui du dessus.</li></ul>
    <h4>La règle d'or</h4><p>Jamais un disque sur un plus petit que lui. Si tu essaies, tu perds une vie. À la 3e erreur, la course s'arrête et ton temps ne compte pas.</p>
    <h4>La course</h4><p>Quatre tours à la suite : 3, 4, 5 puis 6 disques. Le chrono de chaque tour démarre à ton premier toucher et s'arrête quand la tour est complète. Ton temps final, c'est l'addition des quatre.</p>
    <h4>Le bonus coups parfaits</h4><p>Faire plus de coups que nécessaire ne coûte que du temps. Mais une tour finie pile au nombre minimum de coups retire du temps à ton chrono : 0,5 s pour 3 disques, 1 s pour 4, 2 s pour 5 et 4 s pour 6. Les quatre parfaites dans la même course, c'est le grand chelem : 3 s de plus.</p>
    <h4>Le classement</h4><p>Le meilleur temps total gagne. À la fin, ouvre « Temps par tour » pour voir le détail, comparé à ton record.</p>
    <button type="button" class="qj-go" data-hn-rules-close="1" style="align-self:stretch">J'ai compris</button></div></div>`;
  const qBtn = `<button type="button" class="qj-hn-q" data-hn-rules="1" aria-label="Règles du jeu">?</button>`;
  function stop(){ timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); state = "off"; pausedAt = 0; }
  function title(){
    state = "title"; const b = loadBest();
    root.innerHTML = qBtn + `<div class="qj-title"><b>Les Tours<br>de Hanoï</b><p>Une course en quatre tours : 3, 4, 5 puis 6 disques. Fais passer chaque tour à droite le plus vite possible. Jamais un grand disque sur un petit : à 3 erreurs, la course est perdue. Une tour au nombre minimum de coups retire du temps à ton chrono.</p>
      ${b ? `<p>Ton record : <b>${fmt(b.total)} s</b></p>` : ""}<button type="button" class="qj-go" data-qj-go="1">Lancer la course</button></div>`;
  }
  function splitsHTML(){
    const best = loadBest();
    return LEVELS.map((k, i) => {
      const done = i < splits.length, cur = i === li && state === "play";
      const d = done && best && best.splits ? splits[i] - best.splits[i] : null;
      return `<div class="qj-hn-sp ${done ? "done" : cur ? "cur" : ""}"><small>${k} disques${done && bonusLog[i] ? " ★" : ""}</small><b id="qj-hn-sp${i}">${done ? fmt(splits[i]) : cur ? "0,00" : "—"}</b><i class="${d === null ? "" : d > 0 ? "up" : "down"}">${d === null ? "" : fmtD(d)}</i></div>`;
    }).join("");
  }
  function frame(){
    root.innerHTML = qBtn + `<div class="qj-hud" style="padding-right:40px"><div><div class="qj-k">Tour ${li + 1} / ${LEVELS.length}</div><div class="qj-v" style="font-size:22px">${n} disques</div></div>
      <div style="text-align:center"><div class="qj-k">Coups</div><div class="qj-v" style="font-size:22px" id="qj-hn-mv">0</div></div>
      <div><div class="qj-k">Vies</div><div class="qj-lives" id="qj-hn-lives">${[0,1,2].map(i => heart(i < lives)).join("")}</div></div></div>
      <div class="qj-hn-clock"><b id="qj-hn-clk">${fmt(total())}</b><span>temps total</span></div>
      <div class="qj-hn-splits" id="qj-hn-splits">${splitsHTML()}</div>
      <div class="qj-hn" id="qj-hn">${[0, 1, 2].map(p => `<button type="button" class="qj-hn-peg ${p === GOAL ? "goal" : ""}" data-p="${p}" aria-label="Piquet ${p + 1}${p === GOAL ? ", arrivée" : ""}"><i class="qj-hn-pole"></i><span class="qj-hn-st"></span>${p === GOAL ? '<em class="qj-hn-goal">Arrivée</em>' : ""}</button>`).join("")}</div>
      <p class="qj-msg" id="qj-hn-msg"></p>`;
    paint();
  }
  function paint(){
    root.querySelectorAll(".qj-hn-peg").forEach(b => {
      const p = +b.dataset.p;
      b.querySelector(".qj-hn-st").innerHTML = pegs[p].map((d, i) => `<i class="qj-hn-d ${sel === p && i === pegs[p].length - 1 ? "up" : ""}" style="width:${26 + (d - 1) / Math.max(1, n - 1) * 70}%;background:${COLS[(d - 1) % COLS.length]}"></i>`).join("");
      b.classList.toggle("sel", sel === p);
    });
    const mv = $("#qj-hn-mv"); if (mv) mv.textContent = moves;
  }
  function msg(t, c){ const m = $("#qj-hn-msg"); if (m){ m.textContent = t; m.className = "qj-msg" + (c ? " " + c : ""); } }
  function tick(){
    if (state !== "play") return;
    if (!pausedAt){ const lt = levelTime(), c = $("#qj-hn-clk"), s = $("#qj-hn-sp" + li); if (c) c.textContent = fmt(total() + lt); if (s) s.textContent = fmt(lt); }
    raf = requestAnimationFrame(tick);
  }
  function start(){ stop(); li = 0; lives = LIVES; splits = []; movesLog = []; bonusLog = []; level(true); }
  function level(first){
    n = LEVELS[li]; pegs = [Array.from({ length: n }, (_, i) => n - i), [], []];
    sel = null; moves = 0; t0 = 0; state = "play";
    frame(); msg(first ? "Le chrono démarre à ton premier toucher." : `${n} disques. Le chrono repart à ton premier toucher.`);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function animateMove(from, el){
    if (!el || !from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = el.getBoundingClientRect(), bd = $("#qj-hn").getBoundingClientRect();
    const dx = from.left - to.left, dy = from.top - to.top, y = Math.min(dy, bd.top + 6 - to.top);
    try{ el.animate([{ transform:`translate(${dx}px,${dy}px)` }, { transform:`translate(${dx}px,${y}px)`, offset:.3 }, { transform:`translate(0,${y}px)`, offset:.7 }, { transform:"translate(0,0)" }], { duration: 240, easing: "ease-out" }); }catch(e){}
  }
  function tap(p){
    if (state !== "play" || pausedAt) return;
    const top = k => pegs[k][pegs[k].length - 1];
    if (sel === null){
      if (!pegs[p].length) return;
      if (!t0) t0 = now();
      sel = p; bip(520 + top(p) * 50, .05, "triangle", .05); paint(); return;
    }
    if (p === sel){ sel = null; paint(); return; }
    if (pegs[p].length && top(p) < top(sel)){ mistake(p); return; }
    const src = root.querySelector(`.qj-hn-peg[data-p="${sel}"] .qj-hn-st .qj-hn-d:last-child`), from = src && src.getBoundingClientRect();
    pegs[p].push(pegs[sel].pop()); sel = null; moves++; paint();
    animateMove(from, root.querySelector(`.qj-hn-peg[data-p="${p}"] .qj-hn-st .qj-hn-d:last-child`));
    bip(380 + top(p) * 50, .06, "sine", .07);
    if (moves === 1) msg("");
    if (pegs[GOAL].length === n) done();
  }
  function mistake(p){
    lives--;
    const b = root.querySelector(`.qj-hn-peg[data-p="${p}"]`); if (b){ b.classList.remove("qj-shake"); void b.offsetWidth; b.classList.add("qj-shake"); }
    const L = $("#qj-hn-lives"); if (L){ L.innerHTML = [0,1,2].map(i => heart(i < lives)).join(""); L.children[lives]?.classList.add("qj-hn-lost"); }
    bip(150, .3, "sawtooth", .06); vib(60);
    if (lives <= 0){ sel = null; paint(); msg("Troisième erreur…", "hot"); fail(); return; }
    msg(`Pas de grand disque sur un petit ! Encore ${lives} vie${lives > 1 ? "s" : ""}.`, "hot");
  }
  function done(){
    const raw = levelTime(), perfect = moves === opt(n), bonus = perfect ? BONUS[li] : 0, lt = Math.max(0, raw - bonus);
    splits.push(lt); movesLog.push(moves); bonusLog.push(bonus); state = "between"; cancelAnimationFrame(raf);
    const c = $("#qj-hn-clk"); if (c) c.textContent = fmt(total());
    const sp = $("#qj-hn-splits"); if (sp) sp.innerHTML = splitsHTML();
    $("#qj-hn")?.classList.add("done");
    const best = loadBest(), d = best && best.splits ? lt - best.splits[li] : null;
    msg(`${n} disques en ${fmt(raw)} s${perfect ? ` · ★ coups parfaits −${fmt(bonus)} s = ${fmt(lt)} s` : ""}${d !== null ? ` (${fmtD(d)} s sur ton record)` : ""}`, "ok");
    bip(660, .1); later(() => bip(880, .1), 100); later(() => bip(1320, .16), 200); if (perfect) later(() => bip(1760, .12, "triangle", .05), 320);
    li++;
    if (li < LEVELS.length) later(() => level(false), 1500); else later(finish, 900);
  }
  function fail(){
    state = "over"; cancelAnimationFrame(raf);
    later(() => {
      if (state !== "over") return;
      root.insertAdjacentHTML("beforeend", `<div class="qj-over" data-qj-over="1" role="dialog" aria-label="Course perdue"><h2>Course perdue.</h2>
        <p>Trois disques posés sur plus petits qu'eux, à la tour de ${n} disques.</p>
        ${splits.length ? `<p>Tu avais bouclé ${splits.length} tour${splits.length > 1 ? "s" : ""} en <b>${fmt(total())} s</b>.</p>` : ""}<p class="qj-cta">Touche pour relancer la course</p></div>`);
      armReplay(root, start);
    }, 700);
  }
  function finish(){
    state = "over";
    const chelem = bonusLog.every(b => b > 0) ? CHELEM : 0;
    const t = Math.max(0, total() - chelem), best = loadBest(), isBest = !best || t < best.total;
    if (isBest) saveBest({ total: t, splits: splits.slice() });
    const s = t / 1000, v = s <= 45 ? "Machine." : s <= 70 ? "Speedrunner." : s <= 100 ? "Rapide." : s <= 150 ? "Bien joué." : "Arrivé au bout !";
    const rows = LEVELS.map((k, i) => {
      const d = best && best.splits ? splits[i] - best.splits[i] : null;
      return `<div class="qj-hn-tr"><span>${k} disques</span><span class="m">${movesLog[i]} / ${opt(k)}${bonusLog[i] ? ' <b class="down">★</b>' : ""}</span><span class="t">${fmt(splits[i])} s</span><span class="dl ${d === null ? "" : d > 0 ? "up" : "down"}">${d === null ? "—" : fmtD(d)}</span></div>`;
    }).join("");
    const dt = best ? t - best.total : null, bon = bonusLog.reduce((a, b) => a + b, 0) + chelem;
    root.insertAdjacentHTML("beforeend", `<div class="qj-over qj-hn-over" role="dialog" aria-label="Fin de course"><h2>${v}</h2>
      <div class="qj-hn-big">${fmt(t)} s</div>
      <p class="${isBest ? "qj-rec" : ""}">${isBest ? (best ? `Nouveau record, <b>${fmtD(dt)} s</b> !` : "Premier record posé !") : `Record : <b>${fmt(best.total)} s</b> · <b class="up">${fmtD(dt)} s</b>`}</p>
      <details class="qj-hn-det"><summary>Temps par tour</summary><div class="qj-hn-tbl">
        <div class="qj-hn-tr h"><span>Tour</span><span class="m">Coups</span><span class="t">Temps</span><span class="dl">Record</span></div>${rows}
        ${chelem ? `<div class="qj-hn-tr"><span>Grand chelem</span><span class="m"><b class="down">★★★★</b></span><span class="t down">−${fmt(chelem)} s</span><span class="dl"></span></div>` : ""}
        <div class="qj-hn-tr tot"><span>Total</span><span class="m">${movesLog.reduce((a, b) => a + b, 0)} / 116</span><span class="t">${fmt(t)} s</span><span class="dl ${dt === null ? "" : dt > 0 ? "up" : "down"}">${dt === null ? "—" : fmtD(dt)}</span></div>
      </div></details>
      ${bon ? `<p class="down" style="font-weight:700">Bonus coups parfaits : −${fmt(bon)} s${chelem ? " (grand chelem !)" : ""}</p>` : ""}
      <p style="font-size:13px">« Coups » : tes coups et le minimum possible. ★ = tour parfaite, bonus déjà retiré du temps.</p>
      <button type="button" class="qj-go" data-qj-go="1">Relancer la course</button></div>`);
    if (isBest) (async () => {
      try{
        const before = await G.Board.load(), king = before[0];
        await G.Board.submit(t);
        const b = await G.Board.load();
        if (cur && cur.G === G){ cur.board = b; drawBoard(); }
        if (b[0] && b[0].id === myId() && (!king || king.id !== myId())){
          toast(`👑 Tu as la couronne des Tours de Hanoï !`);
          Q.push("shared", "Nouvelle couronne 👑", `${myName()} a pris la couronne des Tours de Hanoï (${fmt(t)} s).`);
        }
      }catch(e){}
    })();
  }
  function rules(open){
    $("[data-hn-rules-box]")?.remove();
    if (open){
      if (state === "play" && t0 && !pausedAt) pausedAt = now();
      root.insertAdjacentHTML("beforeend", RULES);
    } else if (pausedAt){ t0 += now() - pausedAt; pausedAt = 0; }
  }
  G.mount = el => { root = el; title();
    el.addEventListener("pointerdown", e => {
      if (e.target.closest("[data-hn-rules]")){ e.preventDefault(); rules(true); return; }
      if (e.target.closest("[data-hn-rules-close]")){ e.preventDefault(); rules(false); return; }
      if (e.target.closest("[data-hn-rules-box]")) return;
      if (e.target.closest("[data-qj-go]")){ e.preventDefault(); start(); return; }
      if (e.target.closest(".qj-hn-det")) return;
      const b = e.target.closest(".qj-hn-peg"); if (!b) return; e.preventDefault(); tap(+b.dataset.p);
    }); };
  G.stop = stop;
  return G;
})();

/* ============================================================
   6 · LE SAVANT — culture générale : le plus de bonnes réponses d'affilée.
   4 réponses, une seule bonne, 20 s par question, difficulté qui monte.
   À série égale, le plus rapide gagne (temps cumulé des bonnes réponses).
   ============================================================ */
const SAVANT = (() => {
  const TIME = 20000, REC = "qj_savant_rec", SEEN = "qj_savant_seen";
  const THEMES = { H:["Histoire","#7A5A4C"], G:["Géographie","#1E4E9C"], S:["Sciences","#7B5BB0"], N:["Nature","#2F7D4E"], A:["Art et littérature","#CC3F27"], C:["Cinéma et musique","#B0457B"], P:["Sport","#F2873B"], L:["Langue française","#B08A1E"] };
  const LV = ["", "Échauffement", "Moyen", "Difficile", "Expert"];
  const levelFor = k => k < 3 ? 1 : k < 10 ? 2 : k < 20 ? 3 : 4;
  const fmtT = ms => { const s = ms / 1000; if (s < 60) return s.toFixed(1).replace(".", ",") + " s"; const m = Math.floor(s / 60); return m + " min " + String(Math.round(s - m * 60)).padStart(2, "0") + " s"; };
  const unit = n => `${n} bonne${n > 1 ? "s" : ""} réponse${n > 1 ? "s" : ""}`;
  const G = { id:"savant", title:"Le Savant", short:"Le Savant", key:"qj_savant_best", unit };
  const rec = () => { try{ const r = JSON.parse(localStorage.getItem(REC) || "null"); return r && r.n ? r : { n: 0, ms: 0 }; }catch(e){ return { n: 0, ms: 0 }; } };
  // Classement : arcade/savant/<série 3 chiffres>__<temps ms 7 chiffres>__<date>__<id>__<prénom>.txt
  G.Board = {
    async load(){
      if (Q.demo()) return [];
      const { data, error } = await Q.store().client.storage.from("capsules").list("arcade/savant", { limit: 500, sortBy: { column: "name", order: "desc" } });
      if (error) throw error;
      const by = new Map(), better = (a, b) => a.score > b.score || (a.score === b.score && (a.ms < b.ms || (a.ms === b.ms && a.ts < b.ts)));
      (data || []).forEach(f => {
        const m = f.name.match(/^(\d{3})__(\d{7})__(\d{14})__([A-Za-z0-9]{1,8})__([0-9a-f]+)\.txt$/); if (!m) return;
        const r = { score: +m[1], ms: +m[2], ts: +m[3], id: m[4], name: fromHex(m[5]) };
        if (!r.score) return;
        const old = by.get(r.id); if (!old || better(r, old)) by.set(r.id, r);
      });
      return [...by.values()].sort((a, b) => b.score - a.score || a.ms - b.ms || a.ts - b.ts);
    },
    async submit(n, ms){
      if (Q.demo()) return;
      const key = `${String(Math.min(999, n)).padStart(3, "0")}__${String(Math.min(9999999, Math.round(ms))).padStart(7, "0")}__${String(Date.now()).padStart(14, "0")}__${myId()}__${toHex(myName().slice(0, 30))}.txt`;
      const r = await Q.store().client.storage.from("capsules").upload("arcade/savant/" + key, new Blob([myName()], { type:"text/plain" }), { contentType:"text/plain", upsert:false });
      if (r.error) throw r.error;
    }
  };
  G.boardUnit = p => `${p.score} · ${fmtT(p.ms)}`;
  let QS = null, loading = null;
  function loadQs(){
    if (QS) return Promise.resolve(QS);
    if (loading) return loading;
    loading = new Promise((ok, ko) => {
      if (window.QUERIDA_SAVANT_Q){ QS = window.QUERIDA_SAVANT_Q; ok(QS); return; }
      const s = document.createElement("script"); s.src = "savant-q.js?v=1";
      s.onload = () => { QS = window.QUERIDA_SAVANT_Q || []; ok(QS); }; s.onerror = () => { loading = null; ko(); };
      document.head.appendChild(s);
    });
    return loading;
  }
  let root, state, streak, used, cq, t0, raf = 0, timers = [], byTheme, missed, spent;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const seenGet = () => { try{ return JSON.parse(localStorage.getItem(SEEN) || "[]"); }catch(e){ return []; } };
  const seenSet = a => { try{ localStorage.setItem(SEEN, JSON.stringify(a)); }catch(e){} };
  function stop(){ timers.forEach(clearTimeout); timers = []; cancelAnimationFrame(raf); state = "off"; }
  function title(){
    state = "title"; const r = rec();
    root.innerHTML = `<div class="qj-title"><b>Le Savant</b><p>Une question, quatre réponses, une seule est bonne. Enchaîne le plus de bonnes réponses d'affilée : à la première erreur, c'est fini. 20 secondes par question. À égalité, le plus rapide gagne.</p>
      <div class="qj-sv-steps"><div><b>Échauff.</b>1 à 3</div><div><b>Moyen</b>4 à 10</div><div><b>Difficile</b>11 à 20</div><div><b>Expert</b>21 et +</div></div>
      ${r.n ? `<p>Ton record : <b>${unit(r.n)}</b> en ${fmtT(r.ms)}</p>` : ""}<button type="button" class="qj-go" data-qj-go="1">Commencer</button></div>`;
  }
  function pick(level){
    const seen = seenGet();
    for (const L of [level, level + 1, level - 1, level + 2, level - 2, level + 3, level - 3]){
      const pool = []; QS.forEach((q, i) => { if (q[1] === L && !used.has(i)) pool.push(i); });
      if (!pool.length) continue;
      const fresh = pool.filter(i => !seen.includes(i)), from = fresh.length ? fresh : pool;
      return from[Math.floor(Math.random() * from.length)];
    }
    return null;
  }
  function start(){
    stop(); root.innerHTML = `<p class="qj-msg" style="margin:auto">Chargement des questions…</p>`;
    loadQs().then(() => { streak = 0; used = new Set(); byTheme = {}; missed = null; spent = 0; next(); })
      .catch(() => { root.innerHTML = `<p class="qj-msg hot" style="margin:auto">Les questions n'ont pas pu se charger. Vérifie ta connexion et réessaie.</p><button type="button" class="qj-go" data-qj-go="1" style="align-self:center">Réessayer</button>`; });
  }
  function next(){
    const L = levelFor(streak), i = pick(L);
    if (i === null){ end("all"); return; }
    used.add(i); const seen = seenGet(); if (!seen.includes(i)){ seen.push(i); seenSet(seen.length > QS.length * .8 ? [] : seen); }
    const q = QS[i], opts = [q[3], q[4], q[5], q[6]].sort(() => Math.random() - .5);
    cq = { q, opts, good: opts.indexOf(q[3]) }; state = "ask";
    const th = THEMES[q[0]] || ["Culture", "#7A5A4C"];
    root.innerHTML = `<div class="qj-hud"><div><div class="qj-k">Série</div><div class="qj-v">${streak}</div></div>
        <span class="qj-sv-lvl"><i>${[1,2,3,4].map(n => `<b class="${n <= L ? "on" : ""}"></b>`).join("")}</i>${LV[L]}</span>
        <div style="text-align:right"><div class="qj-k">Temps</div><div class="qj-v" style="font-size:20px;margin-top:6px" id="qj-sv-tt">${fmtT(spent)}</div></div></div>
      <div class="qj-bar" id="qj-sv-bar"><i id="qj-sv-bari"></i></div>
      <div class="qj-sv-th" style="color:${th[1]}"><span style="background:${th[1]}"></span>${th[0]}</div>
      <p class="qj-sv-q">${esc(q[2])}</p>
      <div class="qj-sv-ans">${opts.map((o, k) => `<button type="button" data-sv="${k}"><em>${"ABCD"[k]}</em><span>${esc(o)}</span></button>`).join("")}</div>
      <p class="qj-msg" id="qj-sv-msg"></p>`;
    t0 = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function tick(now){
    if (state !== "ask") return;
    const k = Math.max(0, 1 - (now - t0) / TIME), bi = root.querySelector("#qj-sv-bari"), b = root.querySelector("#qj-sv-bar"), tt = root.querySelector("#qj-sv-tt");
    if (bi) bi.style.transform = `scaleX(${k})`; if (b) b.classList.toggle("hot", k < .25);
    if (tt) tt.textContent = fmtT(spent + Math.min(TIME, now - t0));
    if (k <= 0){ answer(-1); return; }
    raf = requestAnimationFrame(tick);
  }
  function answer(k){
    if (state !== "ask") return;
    state = "wait"; cancelAnimationFrame(raf);
    const took = Math.min(TIME, performance.now() - t0), th = cq.q[0];
    byTheme[th] = byTheme[th] || { ok: 0, n: 0 }; byTheme[th].n++;
    root.querySelectorAll(".qj-sv-ans button").forEach((b, j) => b.classList.add(j === cq.good ? "ok" : j === k ? "ko" : "dim"));
    const m = root.querySelector("#qj-sv-msg");
    if (k === cq.good){
      streak++; byTheme[th].ok++; spent += took;
      const tt = root.querySelector("#qj-sv-tt"); if (tt) tt.textContent = fmtT(spent);
      m.textContent = (streak === 3 ? "Bonne réponse ! On passe au niveau Moyen." : streak === 10 ? "Bonne réponse ! Place au niveau Difficile." : streak === 20 ? "Bonne réponse ! Niveau Expert débloqué." : "Bonne réponse !") + ` (${fmtT(took)})`;
      m.className = "qj-msg ok"; bip(880, .08); later(() => bip(1320, .1), 80);
      later(next, [3, 10, 20].includes(streak) ? 1500 : 950);
    } else {
      missed = { q: cq.q, chose: k >= 0 ? cq.opts[k] : null };
      m.textContent = k < 0 ? "Temps écoulé !" : "Raté…"; m.className = "qj-msg hot";
      bip(160, .35, "sawtooth", .06); vib(60);
      later(() => end(k < 0 ? "time" : "wrong"), 1300);
    }
  }
  function end(why){
    state = "over";
    const B = rec(), isBest = streak > 0 && (streak > B.n || (streak === B.n && spent < B.ms));
    if (isBest){ try{ localStorage.setItem(REC, JSON.stringify({ n: streak, ms: spent })); localStorage.setItem(G.key, String(streak)); }catch(e){} }
    const v = streak >= 40 ? "Puits de science." : streak >= 30 ? "Encyclopédie vivante." : streak >= 20 ? "Grand savant." : streak >= 12 ? "Bien cultivé." : streak >= 6 ? "Pas mal du tout." : "La prochaine sera la bonne.";
    const rows = Object.keys(THEMES).filter(t => byTheme[t]).map(t => { const r = byTheme[t]; return `<div><b>${THEMES[t][0]}</b><span>${r.ok} / ${r.n}</span><i><s style="width:${Math.round(r.ok / r.n * 100)}%;background:${THEMES[t][1]}"></s></i></div>`; }).join("");
    root.insertAdjacentHTML("beforeend", `<div class="qj-over qj-hn-over" role="dialog" aria-label="Fin de partie"><h2>${v}</h2>
      <div class="qj-big">${streak}</div><p>${unit(streak).replace(/^\d+ /, "")} d'affilée · niveau ${LV[levelFor(streak)]}</p>
      ${streak ? `<p>en <b style="color:#3B1F17">${fmtT(spent)}</b>, soit ${fmtT(spent / streak)} par réponse en moyenne</p>` : ""}
      <p class="${isBest ? "qj-rec" : ""}">${isBest ? (streak === B.n ? "Nouveau record : même série, mais plus rapide !" : "Nouveau record !") : B.n ? `Record : ${unit(B.n)} en ${fmtT(B.ms)}` : ""}</p>
      ${missed ? `<div class="qj-sv-miss"><small>${why === "time" ? "Temps écoulé sur" : "La question ratée"}</small><b>${esc(missed.q[2])}</b>${missed.chose ? `<span class="bad">${esc(missed.chose)}</span>` : ""}<span class="good">Bonne réponse : ${esc(missed.q[3])}</span></div>` : why === "all" ? `<p>Tu as répondu à toutes les questions. Chapeau !</p>` : ""}
      ${rows ? `<details class="qj-hn-det"><summary>Tes résultats par thème</summary><div class="qj-sv-thr">${rows}</div></details>` : ""}
      <button type="button" class="qj-go" data-qj-go="1">Rejouer</button></div>`);
    const fN = streak, fMs = spent;
    if (isBest) (async () => {
      try{
        const before = await G.Board.load(), king = before[0];
        await G.Board.submit(fN, fMs);
        const b = await G.Board.load();
        if (cur && cur.G === G){ cur.board = b; drawBoard(); }
        if (b[0] && b[0].id === myId() && (!king || king.id !== myId())){
          toast("👑 Tu as la couronne du Savant !");
          Q.push("shared", "Nouvelle couronne 👑", `${myName()} a pris la couronne du Savant (${unit(fN)} d'affilée).`);
        }
      }catch(e){}
    })();
  }
  G.repair = board => {
    try{
      const r = rec(); if (!r.n || !Array.isArray(board)) return false;
      const mine = board.find(p => p.id === myId());
      if (mine && (mine.score > r.n || (mine.score === r.n && mine.ms <= r.ms))) return false;
      // une seule tentative par record (pour ne pas contourner un score masqué par la modération)
      const tag = r.n + "_" + Math.round(r.ms); if (localStorage.getItem("qj_savant_sync") === tag) return false;
      localStorage.setItem("qj_savant_sync", tag);
      G.Board.submit(r.n, r.ms).then(() => G.Board.load()).then(b => { if (cur && cur.G === G){ cur.board = b; drawBoard(); } }).catch(() => {});
      return true;
    }catch(e){ return false; }
  };
  G.mount = el => { root = el; title(); loadQs().catch(() => {});
    el.addEventListener("click", e => {
      if (e.target.closest("[data-qj-go]")){ start(); return; }
      const b = e.target.closest("[data-sv]"); if (b) answer(+b.dataset.sv);
    }); };
  G.stop = stop;
  return G;
})();

/* =================== Les cachettes (3 tapes rapides) =================== */
function triple(selectorFn, G){
  let taps = [];
  document.addEventListener("pointerdown", e => {
    try{
      if (cur || !Q.me()) return;
      const el = selectorFn(e.target); if (!el){ taps = []; return; }
      const now = performance.now();
      if (taps.length && now - taps[taps.length - 1] > 650) taps = [];
      taps.push(now);
      if (taps.length === 2){ el.classList.remove("qj-wig"); void el.offsetWidth; el.classList.add("qj-wig"); }
      if (taps.length >= 3){ taps = []; vib(20); setTimeout(() => openGame(G), 60); }
    }catch(err){}
  }, true);
}
const inHead = (t, sel) => { const h = t.closest && t.closest("#app > main.screen .head"); return h ? t.closest(sel) : null; };
triple(t => inHead(t, ".ltitle"), OEIL);                                    // le grand titre
triple(t => inHead(t, ".eyebrow"), CHIF);                                   // la petite ligne au-dessus
triple(t => t.closest && t.closest("#sun-logo"), ACC);                        // le soleil de « Comment ça marche »
triple(t => {                                                               // l'onglet de l'accueil, quand on y est déjà
  const tab = t.closest && t.closest("nav.tabbar .tab"); if (!tab || tab.getAttribute("aria-current") !== "page") return null;
  return tab.dataset.v === (ROMANE ? "today" : "depot") ? tab : null;
}, DIFF);
triple(t => t.closest && t.closest(".qh-wrap .qh-head h1"), HANOI);          // le titre « Arcade », dans l'Arcade même
triple(t => t.closest && t.closest(".qh-wrap .qh-radar"), SAVANT);        // le radar de « Mon profil »
function decorate(){ document.querySelectorAll("#app > main.screen .head .ltitle, #app > main.screen .head .eyebrow").forEach(el => el.classList.add("qj-tap")); }
let qd = false; new MutationObserver(() => { if (qd) return; qd = true; requestAnimationFrame(() => { qd = false; try{ decorate(); }catch(e){} }); }).observe(document.body, { childList:true, subtree:true });
decorate();

/* =================== Inscription dans l'Arcade =================== */
const R = window.QUERIDA_GAMES = window.QUERIDA_GAMES || {};
[OEIL, DIFF, CHIF, ACC, HANOI, SAVANT].forEach(G => { R[G.id] = { open: () => openGame(G), best: () => { const b = lsGet(G.key); return b ? G.unit(b) : ""; } }; });
window.dispatchEvent(new Event("qh-games"));

}catch(err){ /* ces jeux ne doivent jamais gêner l'appli */ }
})();
