/* Querida · L'Observatoire — énigme cachée, réservée aux amis.
   Chargé par index.html uniquement côté amis (jamais avec le lien de Romane).
   Tout est isolé : préfixe « qe- » partout, et une erreur ici ne casse jamais l'appli. */
(function(){
"use strict";
try{

const Q = window.QUERIDA;
if (!Q || Q.role() !== "ami") return;

/* =================== Modèle du ciel =================== */
const DAY = 864e5, HOUR = 36e5;
const T0 = new Date(2026, 9, 15).getTime();           // 15 octobre 2026
const E = 6, PR = 42, AR = Math.pow(PR / E, 2/3);      // Terre 6 j ; planète rouge 42 j
const PV = 3.75, AV = Math.pow(PV / E, 2/3);           // Vénus 3,75 j (cycle des phases : 10 j)
const MOONS = [ {L:"N", r:5.9, T:1.769, f:.4}, {L:"O", r:9.4, T:3.551, f:2.1}, {L:"V", r:15.0, T:7.155, f:4.0}, {L:"A", r:26.4, T:16.689, f:5.3} ];
const TAU = Math.PI * 2;
const wrap360 = d => ((d % 360) + 360) % 360;
const wrap180 = d => ((d + 540) % 360) - 180;
const deg = r => r * 180 / Math.PI;
function bodies(ms){
  const t = (ms - T0) / DAY;
  const tE = TAU * t / E, tR = TAU * t / PR, tV = TAU * t / PV + 1.1;
  const Ex = Math.cos(tE), Ey = Math.sin(tE);
  const Rx = AR * Math.cos(tR), Ry = AR * Math.sin(tR);
  const Vx = AV * Math.cos(tV), Vy = AV * Math.sin(tV);
  const lamR = wrap360(deg(Math.atan2(Ry - Ey, Rx - Ex)));
  const lamV = wrap360(deg(Math.atan2(Vy - Ey, Vx - Ex)));
  const lamS = wrap360(deg(Math.atan2(-Ey, -Ex)));
  const dVx = Ex - Vx, dVy = Ey - Vy, dist = Math.hypot(dVx, dVy);
  const cosi = ((-Vx) * dVx + (-Vy) * dVy) / (AV * dist);
  const lit = (1 + cosi) / 2;
  const moons = MOONS.map(m => { const a = TAU * t / m.T + m.f; return { L:m.L, x: m.r * Math.cos(a), behind: Math.sin(a) > 0 && Math.abs(m.r * Math.cos(a)) < 1.15 }; });
  return { t, tE, lamR, lamV, lamS, lit, dist, moons };
}

/* =================== État du joueur (sur son téléphone) =================== */
const KEY = "qe_obs_v1";
const fresh = () => ({ discovered:false, stars:[], polaris:false, spent:0, doors:["locked","locked","locked","locked","locked"], visits:[], crescent:false, attempts:{}, finished:false, introSeen:false, signed:null, rank:null });
let S = (() => { try{ return Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || "{}")); }catch(e){ return fresh(); } })();
const save = () => { try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} };
let WORLD = null;                       // { by, at } : le premier à avoir prouvé, partagé par toute la bande
try{ WORLD = JSON.parse(localStorage.getItem("qe_world") || "null"); }catch(e){}
const now = () => Date.now();
const skyHour = () => Math.floor(now() / HOUR) * HOUR;
let viewHour = null;
const COSTS = [2,2,1,2,2];
const available = () => S.stars.length - S.spent;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtH = ms => new Date(ms).toLocaleString("fr-FR", { weekday:"short", day:"numeric", month:"short", hour:"2-digit" }).replace(":00","");
const fmtDay = ms => new Date(ms).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" });
const myName = () => { const m = Q.me(); return (m && m.name) || "Quelqu'un"; };

/* =================== Styles (tous préfixés) =================== */
const CSS = `
.qe-obs,.qe-intro,.qe-finale,.qe-plates,.qe-eclipse,.qe-notif{--qe-night:#0E0A12;--qe-ink:#EFE6F2;--qe-ink2:rgba(239,230,242,.62);--qe-ink3:rgba(239,230,242,.32);--qe-gold:#F3C77A;--qe-rose:#FF8A6B;--qe-mars:#E0573D;--qe-mono:ui-monospace,"SF Mono",Menlo,monospace;--qe-serif:"Instrument Serif",ui-serif,"New York",Georgia,serif}
@keyframes qe-fadein{from{opacity:0}}
.qe-hs{display:inline-grid;place-items:center;width:28px;height:28px;margin:-10px;position:relative;z-index:2;line-height:1;vertical-align:middle;color:#E3B45E;background:none;border:0;padding:0;cursor:pointer}
.qe-hs svg{width:11px;height:11px;filter:drop-shadow(0 0 3px rgba(243,199,122,.8));animation:qe-glint 9s ease-in-out infinite;animation-delay:var(--d,0s)}
@keyframes qe-glint{0%,88%,100%{transform:scale(1);filter:drop-shadow(0 0 3px rgba(243,199,122,.8))}93%{transform:scale(1.7) rotate(20deg);filter:drop-shadow(0 0 7px #FFD27A) brightness(1.4)}}
.qe-hs.qe-twinkle svg{animation:qe-twinkle 10s infinite}
@keyframes qe-twinkle{0%,82%,100%{opacity:.3}91%{opacity:1;transform:scale(1.6)}}
.qe-hs.qe-inline{width:22px;height:22px;margin:-6px -4px;vertical-align:baseline}
.qe-hs.qe-inline svg{width:9px;height:9px}
.qe-fly{animation:qe-fly .9s ease-in forwards}
@keyframes qe-fly{to{transform:translateY(-140px) scale(.2);opacity:0}}
.qe-pullsky{position:fixed;left:0;right:0;top:0;height:0;overflow:hidden;z-index:0;background:linear-gradient(#1A1222,#3B2440 70%,var(--bg));display:flex;align-items:center;justify-content:center;pointer-events:none}
.qe-pullsky.on{pointer-events:auto}
.qe-pullsky::before{content:"";position:absolute;inset:0;background-image:radial-gradient(1px 1px at 20% 30%,#fff 50%,transparent 51%),radial-gradient(1px 1px at 70% 20%,#fff 50%,transparent 51%),radial-gradient(1px 1px at 45% 60%,#fff8 50%,transparent 51%),radial-gradient(1px 1px at 85% 55%,#fff8 50%,transparent 51%),radial-gradient(1px 1px at 10% 70%,#fff6 50%,transparent 51%)}
.qe-pullsky .qe-hs{margin-top:calc(env(safe-area-inset-top,0px) + 20px)}
body.qe-pulling{-webkit-user-select:none;user-select:none}
body.qe-pullable #app > main.screen{position:relative;z-index:1;background:var(--bg)}
.qe-land{display:none;justify-content:center;padding-top:8px}
@media (orientation:landscape) and (max-height:520px){.qe-land{display:flex}}
.qe-patience{display:none;justify-content:flex-end;padding-right:10px;margin-top:-6px}
.qe-patience.show{display:flex;animation:qe-fadein 2s ease}
.qe-bottom{display:flex;justify-content:flex-end;padding:30px 8px 0}
.qe-gap{height:0;position:relative}
.qe-gap .qe-hs{position:absolute;right:40px;top:-14px}
.qe-counter{position:absolute;top:-8px;right:calc(50% - 46px)}
.qe-env{position:absolute;left:50%;top:64%;transform:translate(-50%,-50%);z-index:3}
#sun-logo.qe-armed{touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
#sun-logo.qe-armed .sunbody{transition:transform .3s}
#sun-logo.qe-armed.qe-sinking .sunbody{transform:translateY(26px);transition:transform 5s linear}
#sun-logo #qe-moonsh{transition:transform .5s cubic-bezier(.3,1.4,.5,1)}
#sun-logo.qe-dragging #qe-moonsh{transition:none}
#sun-logo #qe-corona{transition:opacity .8s ease}
body.qe-night{--bg:#120D18;--card:#1E1726;--label:#F1E6EE;--label2:rgba(241,230,238,.62);--label3:rgba(241,230,238,.34);--sep:rgba(255,255,255,.09);--fill:rgba(233,184,102,.08);--fill2:rgba(233,184,102,.14);--accent:#E9B866;--on-accent:#1A1222;--soft:#251B2E;--peach:#251B2E;--peach2:#3A2A44;--deep:#C9984E;--saff-soft:#251B2E;--bar:rgba(18,13,24,.86);color-scheme:dark;background-color:var(--bg);
  background-image:radial-gradient(1px 1px at 12% 18%,rgba(255,255,255,.5) 50%,transparent 51%),radial-gradient(1px 1px at 78% 9%,rgba(255,255,255,.4) 50%,transparent 51%),radial-gradient(1px 1px at 42% 66%,rgba(255,255,255,.3) 50%,transparent 51%),radial-gradient(1px 1px at 90% 48%,rgba(255,255,255,.35) 50%,transparent 51%),radial-gradient(1.4px 1.4px at 25% 88%,rgba(255,255,255,.4) 50%,transparent 51%);background-attachment:fixed}
body.qe-night.qe-pullable #app > main.screen{background:transparent}
body{transition:background-color 1.5s ease,color 1.5s ease}
.qe-world{display:flex;gap:12px;align-items:center;background:linear-gradient(120deg,#2A1A10,#4A2C14);color:#F8E4BC;border-radius:16px;padding:12px 14px;box-shadow:0 6px 20px rgba(120,60,10,.25)}
.qe-world .qe-wic{width:34px;height:34px;flex:none;border-radius:8px;overflow:hidden}
.qe-world .qe-wic svg{width:100%;height:100%;display:block}
.qe-world b{font-family:var(--f-display);font-style:italic;font-weight:400;font-size:20px;display:block;line-height:1.1}
.qe-world small{font-size:12.5px;opacity:.8}

.qe-obs{position:fixed;inset:0;z-index:60;background:radial-gradient(120% 80% at 50% 0%,#211830 0%,var(--qe-night) 60%);color:var(--qe-ink);overflow-y:auto;-webkit-overflow-scrolling:touch;animation:qe-fadein .35s ease;font-size:16px;line-height:1.4}
.qe-obs button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
.qe-wrap{max-width:460px;margin:0 auto;padding:calc(env(safe-area-inset-top,0px) + 10px) 16px calc(env(safe-area-inset-bottom,0px) + 40px);display:flex;flex-direction:column;gap:18px}
.qe-obs header{display:flex;justify-content:space-between;align-items:center;gap:8px}
.qe-obs .qe-back{color:var(--qe-rose);font-size:15px;min-height:40px}
.qe-obs .qe-clock{font-family:var(--qe-mono);font-size:12px;color:var(--qe-ink2);text-align:right}
.qe-obs h1{font-family:var(--qe-serif);font-style:italic;font-weight:400;font-size:40px;margin:0;line-height:1}
.qe-obs .qe-motto{font-family:var(--qe-serif);font-style:italic;font-size:18px;color:var(--qe-ink2);margin:0}
.qe-sky{width:100%;height:auto;display:block;border-radius:16px;background:linear-gradient(#120D1A,#0B0810);border:1px solid rgba(255,255,255,.06);touch-action:manipulation}
.qe-sky text{font-family:var(--qe-mono)}
.qe-panel{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:12px}
.qe-panel h2{font-family:var(--qe-serif);font-weight:400;font-style:italic;font-size:24px;margin:0}
.qe-keys{display:flex;align-items:center;gap:10px;font-size:14px;color:var(--qe-ink2)}
.qe-keys .qe-k{font-family:var(--qe-mono);color:var(--qe-gold)}
.qe-obs .qe-door{display:flex;align-items:center;gap:14px;padding:12px;border-radius:12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);width:100%;text-align:left}
.qe-door .qe-num{font-family:var(--qe-serif);font-size:30px;width:34px;text-align:center;color:var(--qe-gold)}
.qe-door .qe-dt{flex:1;min-width:0}
.qe-door .qe-dt b{display:block;font-weight:600}
.qe-door .qe-dt small{color:var(--qe-ink2);font-size:13px}
.qe-door .qe-cost{font-family:var(--qe-mono);color:var(--qe-gold);font-size:13px;white-space:nowrap}
.qe-door.qe-locked{opacity:.45}
.qe-door.qe-solved .qe-num{color:var(--qe-rose)}
.qe-obs .qe-pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:8px 14px;font-size:14px;font-weight:600;background:rgba(255,255,255,.08);color:var(--qe-ink)}
.qe-obs .qe-obtn{height:48px;border-radius:12px;background:var(--qe-mars);color:#fff;font-weight:600;width:100%}
.qe-obs .qe-obtn.qe-ghost{background:rgba(255,255,255,.08);color:var(--qe-ink)}
.qe-input{width:100%;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:13px 14px;font-size:18px;color:var(--qe-ink);outline:none;text-transform:uppercase;letter-spacing:.08em;font-family:inherit}
.qe-input:focus{border-color:var(--qe-rose)}
.qe-text{font-family:var(--qe-serif);font-size:20px;line-height:1.45;color:var(--qe-ink)}
.qe-text p{margin:0}
.qe-text p + p{margin-top:12px}
.qe-text em{color:var(--qe-gold)}
.qe-formula{font-family:var(--qe-mono);font-size:17px;text-align:center;background:rgba(243,199,122,.08);border:1px solid rgba(243,199,122,.2);border-radius:10px;padding:10px;color:var(--qe-gold)}
.qe-nope{min-height:20px;color:var(--qe-rose);font-size:14px;margin:0}
.qe-shake{animation:qe-shake .4s}
@keyframes qe-shake{20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}
.qe-tables{width:100%;border-collapse:collapse;font-size:14px}
.qe-tables th,.qe-tables td{padding:8px 6px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}
.qe-tables th{color:var(--qe-ink2);font-weight:500;font-size:12px;text-transform:uppercase;letter-spacing:.05em}
.qe-tables td.qe-n{font-family:var(--qe-mono);text-align:right}
.qe-log{display:flex;flex-direction:column;gap:6px;font-size:13px}
.qe-log div{background:rgba(255,255,255,.04);border-radius:10px;padding:8px 10px;font-family:var(--qe-mono);color:var(--qe-ink2);line-height:1.5}
.qe-log div b{color:var(--qe-ink);font-weight:600}
.qe-banner{background:rgba(243,199,122,.12);border:1px solid rgba(243,199,122,.3);color:var(--qe-gold);border-radius:10px;padding:8px 12px;font-size:13px;text-align:center;margin:0}
.qe-small{font-size:13px;color:var(--qe-ink2);margin:0}
.qe-earth{font-family:var(--qe-serif);font-style:italic;font-size:15px;color:var(--qe-ink3);text-align:center;margin:4px 0 0}
.qe-hint{font-family:var(--qe-serif);font-style:italic;font-size:15px;line-height:1.4;color:var(--qe-ink3);text-align:center;padding:0 16px;margin:-4px 0 0}
.qe-dial{display:flex;flex-direction:column;gap:10px}
.qe-dial input[type=range]{width:100%;accent-color:#F3C77A;height:28px}
.qe-dial .qe-when{font-family:var(--qe-mono);font-size:13px;color:var(--qe-gold);text-align:center;margin:0}
.qe-dial .qe-ends{display:flex;justify-content:space-between;font-size:11px;color:var(--qe-ink3);font-family:var(--qe-mono)}
.qe-tinst{display:flex;flex-direction:column;gap:10px}
.qe-tinst .qe-lab{font-size:12px;color:var(--qe-ink2);font-family:var(--qe-mono);text-transform:uppercase;letter-spacing:.06em}
.qe-lights{display:flex;gap:7px;align-items:center}
.qe-lights i{width:9px;height:9px;border-radius:50%;border:1px solid rgba(243,199,122,.55);display:block}
.qe-lights i.on{background:#FFC21A;border-color:#FFC21A;box-shadow:0 0 6px #FFB300}
.qe-final{display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding-top:20px}
.qe-final h2{font-family:var(--qe-serif);font-style:italic;font-weight:400;font-size:40px;margin:0}

.qe-intro{position:fixed;inset:0;z-index:85;background:radial-gradient(120% 80% at 50% 0%,#1A1222,#07050C 70%);overflow-y:auto;display:flex;align-items:center;justify-content:center;padding:calc(env(safe-area-inset-top,0px) + 32px) 22px calc(env(safe-area-inset-bottom,0px) + 32px);transition:opacity .9s ease}
.qe-intro.out{opacity:0}
.qe-intro .qe-in{max-width:400px;display:flex;flex-direction:column;gap:16px}
.qe-intro h2,.qe-intro p,.qe-intro button{opacity:0;animation:qe-introIn 1.2s ease forwards;animation-delay:calc(var(--i) * 1.6s + .4s)}
@keyframes qe-introIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.qe-intro h2{margin:0 0 6px;font-family:var(--qe-serif);font-style:italic;font-weight:400;font-size:38px;line-height:1.05;color:#EFE6F2;text-wrap:balance}
.qe-intro p{margin:0;font-family:var(--qe-serif);font-size:20px;line-height:1.4;color:rgba(239,230,242,.72)}
.qe-intro p.qe-order{margin-top:10px;font-style:italic;font-size:26px;line-height:1.25;color:var(--qe-gold)}
.qe-intro button{align-self:flex-start;margin-top:14px;font-family:var(--f);font-size:15px;font-weight:600;color:#1A1222;background:var(--qe-gold);border:0;border-radius:999px;padding:11px 22px;cursor:pointer}

.qe-eclipse{position:fixed;inset:0;z-index:65;background:radial-gradient(circle at var(--x) var(--y),rgba(255,244,216,.17) 0,rgba(255,244,216,.06) 20px,rgba(3,2,6,.975) 50px);animation:qe-eclin 3.4s cubic-bezier(.4,0,.2,1) both;touch-action:none;-webkit-user-select:none;user-select:none}
@keyframes qe-eclin{0%{opacity:0}35%{opacity:.55}100%{opacity:1}}
.qe-eclipse.out{opacity:0!important;transition:opacity 1.4s ease;animation:none}
.qe-eclipse .qe-spot{position:absolute;left:var(--x);top:var(--y);width:60px;height:60px;margin:-30px;border-radius:50%;background:none;border:0;padding:0;cursor:pointer;animation:qe-spotp 4.5s ease-in-out 3.4s infinite}
@keyframes qe-spotp{50%{box-shadow:0 0 34px 6px rgba(255,244,216,.13)}}

.qe-plates{position:fixed;inset:0;z-index:72;background:#040306;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:calc(env(safe-area-inset-top,0px) + 30px) 16px 48px;display:flex;flex-direction:column;align-items:center;gap:28px;animation:qe-fadein 1.4s ease}
.qe-plate{position:relative;flex:none;width:100%;max-width:420px;aspect-ratio:4/5;margin:0;background:radial-gradient(120% 90% at 28% 12%,#1c1f26 0,#0c0d11 55%,#060608 100%);border:1px solid rgba(190,210,225,.17);border-radius:2px;clip-path:polygon(0 0,calc(100% - 20px) 0,100% 15px,100% 100%,0 100%);box-shadow:inset 0 0 0 7px rgba(255,255,255,.025),inset 0 0 70px rgba(0,0,0,.85);overflow:hidden;color:#EEF1F4;font-family:var(--qe-serif)}
.qe-plate::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 36%,rgba(255,255,255,.045) 45%,transparent 54%);pointer-events:none}
.qe-plate svg.qe-sk{position:absolute;inset:0;width:100%;height:100%}
.qe-plate .qe-notes{position:absolute;inset:0;padding:34px 26px 58px;display:flex;flex-direction:column;gap:13px}
.qe-plate .qe-sp{flex:1}
.qe-plate .qe-n{font-style:italic;font-size:19px;line-height:1.28;text-shadow:0 0 7px rgba(238,241,244,.2);transform:rotate(var(--r,-1deg));opacity:.92;max-width:92%}
.qe-plate .qe-n s{opacity:.5;text-decoration-thickness:1px}
.qe-plate .qe-n.qe-sm{font-size:15px;opacity:.68}
.qe-plate .qe-n.qe-r{align-self:flex-end;text-align:right}
.qe-plate .qe-n.qe-co{font-family:var(--qe-mono);font-style:normal;font-size:11.5px;letter-spacing:.09em;opacity:.55}
.qe-plate .qe-lbl{position:absolute;left:14px;bottom:15px;background:#E8E1CE;color:#2A2420;font-family:var(--qe-mono);font-size:10.5px;letter-spacing:.06em;padding:4px 8px;transform:rotate(-1.4deg);box-shadow:0 1px 3px rgba(0,0,0,.6)}
.qe-plate .qe-no{position:absolute;right:18px;bottom:10px;font-style:italic;font-size:32px;color:rgba(238,241,244,.3)}
.qe-plates .qe-shut{font-family:var(--qe-mono);font-size:12px;letter-spacing:.14em;color:rgba(238,241,244,.45);text-transform:uppercase;padding:10px 16px;background:none;border:0;cursor:pointer}

.qe-finale{position:fixed;inset:0;z-index:80;background:#05030A;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:calc(env(safe-area-inset-top,0px) + 24px) 16px calc(env(safe-area-inset-bottom,0px) + 24px);animation:qe-fadein 1.2s ease;overflow:hidden}
.qe-finale canvas{width:min(92vw,440px);height:min(92vw,440px);display:block}
.qe-finale .qe-cap{min-height:96px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.qe-finale .qe-cap p{margin:0;font-family:var(--qe-serif);font-style:italic;color:#EFE6F2;font-size:24px;line-height:1.25;opacity:0;transition:opacity 1.2s ease}
.qe-finale .qe-cap p.qe-sm{font-size:16px;color:rgba(239,230,242,.55)}
.qe-finale .qe-cap p.on{opacity:1}
.qe-finale .qe-flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(255,214,120,.95),rgba(243,199,122,.4) 35%,transparent 70%);opacity:0;pointer-events:none;transition:opacity 1.6s ease}
.qe-finale .qe-flash.on{opacity:1}
.qe-finale .qe-fgo{font-family:var(--f);font-size:15px;font-weight:600;color:#1A1222;background:#F3C77A;border:0;border-radius:999px;padding:11px 22px;opacity:0;transition:opacity 1s ease;pointer-events:none;cursor:pointer}
.qe-finale .qe-fgo.on{opacity:1;pointer-events:auto}
.qe-notif{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 10px);z-index:95;width:min(360px,calc(100vw - 20px));transform:translate(-50%,-160%);transition:transform .7s cubic-bezier(.2,1.2,.4,1);background:rgba(245,240,235,.94);color:#1C1410;border-radius:18px;padding:11px 13px;display:flex;gap:11px;align-items:flex-start;box-shadow:0 10px 30px rgba(0,0,0,.35);font-family:var(--f)}
.qe-notif.on{transform:translate(-50%,0)}
.qe-notif .qe-nic{width:38px;height:38px;border-radius:9px;overflow:hidden;flex:none}
.qe-notif .qe-nic svg{width:100%;height:100%;display:block}
.qe-notif .qe-ntx{flex:1;font-size:14px;line-height:1.3}
.qe-notif .qe-ntx small{display:flex;justify-content:space-between;font-size:12px;color:rgba(28,20,16,.5);text-transform:uppercase;letter-spacing:.02em}
.qe-notif .qe-ntx b{display:block}
.qe-notif .qe-nto{position:absolute;left:0;right:0;top:100%;text-align:center;font-size:12px;color:rgba(255,255,255,.7);padding-top:6px}
@media (prefers-reduced-motion: reduce){.qe-intro h2,.qe-intro p,.qe-intro button{animation:none;opacity:1}.qe-hs svg{animation:none}}
`;
const st = document.createElement("style"); st.id = "qe-style"; st.textContent = CSS; document.head.appendChild(st);

/* =================== Petits dessins =================== */
const STARSVG = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 0l1.2 3.8L10 5 6.2 6.2 5 10 3.8 6.2 0 5l3.8-1.2z" fill="currentColor"/></svg>';
const SUNICON = '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#2A1A10"/><g class="sunbody"><g stroke="#F3C77A" stroke-width="2.4" stroke-linecap="round">' + Array.from({length:12}, (_, k) => { const a = k * Math.PI / 6; return `<line x1="${(36 + Math.cos(a) * 20).toFixed(1)}" y1="${(36 + Math.sin(a) * 20).toFixed(1)}" x2="${(36 + Math.cos(a) * 27).toFixed(1)}" y2="${(36 + Math.sin(a) * 27).toFixed(1)}"/>`; }).join("") + '</g><circle cx="36" cy="36" r="14" fill="#F3C77A"/></g></svg>';
const CRESCENT = '<svg viewBox="0 0 72 72" aria-hidden="true"><defs><filter id="qe-cgl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter></defs><rect width="72" height="72" fill="#1A1222"/><g class="sunbody"><circle id="qe-corona" cx="36" cy="34" r="17.5" fill="none" stroke="#FFF4D8" stroke-width="3.5" filter="url(#qe-cgl)" opacity="0"/><circle cx="36" cy="34" r="16" fill="#FFF4D8"/><circle id="qe-moonsh" cx="44" cy="30" r="16.4" fill="#1A1222"/></g><circle cx="16" cy="16" r="1.2" fill="#F3C77A"/><circle cx="58" cy="54" r="1" fill="#F3C77A"/></svg>';
const SUNSET = '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#FBF5EF"/><clipPath id="qe-hz"><rect x="0" y="0" width="72" height="46"/></clipPath><g clip-path="url(#qe-hz)"><path class="sunbody" d="M16 44a20 20 0 0 1 40 0z" fill="#CC3F27"/></g><rect x="12" y="46" width="48" height="5" rx="2.5" fill="#1E4E9C"/><rect x="20" y="54" width="32" height="4" rx="2" fill="#1E4E9C" fill-opacity=".5"/></svg>';
function logoSVG(){ if (S.crescent) return CRESCENT; if (WORLD && !S.finished) return SUNICON; return SUNSET; }
function starBtn(id, extra = ""){ return `<button type="button" class="qe-hs ${extra}" data-qstar="${id}" style="--d:${(id * 1.9) % 9}s" aria-label="Étoile">${STARSVG}</button>`; }
const want = id => S.discovered && !S.stars.includes(id);

/* =================== Le monde partagé (premier à avoir prouvé) =================== */
const toHex = s => [...new TextEncoder().encode(s)].map(x => x.toString(16).padStart(2, "0")).join("");
const fromHex = h => { try{ return new TextDecoder().decode(new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)))); }catch(e){ return "?"; } };
const World = {
  list: null,
  async load(){
    if (Q.demo()) return;
    const { data, error } = await Q.store().client.storage.from("capsules").list("observatoire", { limit: 200, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    this.list = (data || []).filter(f => /^\d{14}__[0-9a-f]+\.txt$/.test(f.name)).sort((a, b) => a.name.localeCompare(b.name))
      .map(f => { const [ts, hx] = f.name.replace(".txt", "").split("__"); return { ts:+ts, name: fromHex(hx), key: f.name }; });
    WORLD = this.list.length ? { by: this.list[0].name, at: this.list[0].ts } : null;
    try{ localStorage.setItem("qe_world", JSON.stringify(WORLD)); }catch(e){}
    if (S.signed){ const r = this.list.findIndex(w => w.key === S.signed) + 1; if (r){ S.rank = r; save(); } }
  },
  async sign(){
    if (Q.demo()) return null;
    if (!S.signed){
      const key = `${String(Date.now()).padStart(14, "0")}__${toHex(myName().slice(0, 30))}.txt`;
      const r = await Q.store().client.storage.from("capsules").upload("observatoire/" + key, new Blob([myName()], { type:"text/plain" }), { contentType:"text/plain", upsert:false });
      if (r.error) throw r.error;
      S.signed = key; save();
    }
    await this.load();
    return S.rank;
  }
};
function syncWorld(){
  if (Q.demo()) return;
  if (!Q.store() || !Q.store().ready || !Q.store().client){ setTimeout(syncWorld, 1500); return; }
  World.load().then(() => { decorate(); if (document.getElementById("qe-obs")?.innerHTML) renderObs(); }).catch(() => {});
  if (S.finished && (!S.signed || !S.rank)) World.sign().catch(() => {});
}

/* =================== Décorer l'appli (les étoiles cachées) =================== */
let decoQueued = false;
function queueDecorate(){ if (decoQueued) return; decoQueued = true; requestAnimationFrame(() => { decoQueued = false; try{ decorate(); }catch(e){} }); }
function curTab(){ const t = document.querySelector('.tabbar .tab[aria-current="page"]'); return t ? t.dataset.v : null; }
function mainEl(){ return document.querySelector("#app > main.screen"); }
function decorate(){
  if (!Q.me()) return;
  document.body.classList.toggle("qe-night", !!S.crescent);
  const main = mainEl(), tab = curTab();
  // Le monde a changé : bandeau sur l'accueil de tous les amis
  if (main && tab === "depot" && WORLD && !main.querySelector(".qe-world")){
    const head = main.querySelector(".head");
    if (head) head.insertAdjacentHTML("afterend", `<div class="qe-world"><span class="qe-wic">${SUNICON}</span><span><b>Le Soleil est au centre.</b><small>Prouvé par ${esc(WORLD.by)} le ${fmtDay(WORLD.at)}. Le monde a changé.</small></span></div>`);
  }
  // 1 · le compteur des capsules de la bande
  if (main && tab === "depot" && want(1) && !document.querySelector('[data-qstar="1"]')){
    const box = main.querySelectorAll(".hero.saff > div")[1];
    if (box){ box.style.position = "relative"; box.insertAdjacentHTML("beforeend", starBtn(1, "qe-twinkle qe-counter")); }
  }
  // 8 · téléphone à l'horizontale
  if (main && tab === "depot" && want(8) && !document.querySelector('[data-qstar="8"]')) main.insertAdjacentHTML("beforeend", `<div class="qe-land">${starBtn(8)}</div>`);
  // 5 · au-dessus de l'accueil (tirer vers le bas)
  const pullOn = !!(main && tab === "depot" && want(5));
  document.body.classList.toggle("qe-pullable", pullOn);
  let sky = document.getElementById("qe-pullsky");
  if (pullOn && !sky){ document.body.insertAdjacentHTML("beforeend", `<div class="qe-pullsky" id="qe-pullsky" aria-hidden="true">${starBtn(5)}</div>`); }
  if (!pullOn && sky){ sky.remove(); }
  // 4 · le bas du Carnet · 9 · la patience
  if (main && tab === "carnet"){
    if (want(4) && !document.querySelector('[data-qstar="4"]')) main.insertAdjacentHTML("beforeend", `<div class="qe-bottom">${starBtn(4)}</div>`);
    if (want(9) && !document.getElementById("qe-patience")){ const head = main.querySelector(".head"); if (head){ head.insertAdjacentHTML("beforeend", `<div class="qe-patience" id="qe-patience">${starBtn(9)}</div>`); armPatience(); } }
  }
  // 2 · entre « Vocal » et « Message »
  const msg = document.querySelector('.asheet [data-act="compose"][data-v="text"]');
  if (msg && want(2) && !document.querySelector('[data-qstar="2"]')) msg.insertAdjacentHTML("beforebegin", `<div class="qe-gap">${starBtn(2)}</div>`);
  // 6 · dans l'enveloppe de la capsule déposée
  const env = document.querySelector(".sheet .envelope.open");
  if (env && want(6) && !env.querySelector('[data-qstar="6"]')) env.insertAdjacentHTML("beforeend", `<span class="qe-env">${starBtn(6)}</span>`);
  // Comment ça marche : le logo, le chuchotement, et 3 · le point final
  const logo = document.getElementById("sun-logo");
  if (logo && !logo.classList.contains("qe-armed")) armLogo(logo);
  if (logo && want(3) && !document.querySelector('[data-qstar="3"]')){
    const sm = [...document.querySelectorAll(".sheet .steps small")].find(x => /ou à son retour\.\s*$/.test(x.textContent));
    if (sm){ const tn = [...sm.childNodes].reverse().find(n => n.nodeType === 3 && /\.\s*$/.test(n.nodeValue)); if (tn){ tn.nodeValue = tn.nodeValue.replace(/\.\s*$/, ""); sm.insertAdjacentHTML("beforeend", starBtn(3, "qe-inline")); } }
  }
}
new MutationObserver(queueDecorate).observe(document.body, { childList:true, subtree:true });

function collect(id, el){
  if (S.stars.includes(id)) return;
  S.stars.push(id); save();
  if (el){ el.classList.add("qe-fly"); setTimeout(() => { el.remove(); queueDecorate(); }, 900); }
}

/* ---------- Le soleil de « Comment ça marche » ---------- */
function armLogo(el){
  el.classList.add("qe-armed");
  el.innerHTML = logoSVG();
  const sheetBody = el.closest(".sbody");
  if (sheetBody && !sheetBody.querySelector(".qe-whisper")){
    sheetBody.insertAdjacentHTML("beforeend", `<p class="whisper qe-whisper">${S.crescent ? "Un jour, elle passera devant lui." : "Le soleil ne se couche que pour ceux qui le retiennent."}</p>`);
  }
  let t = null;
  const stop = () => { clearTimeout(t); t = null; el.classList.remove("qe-sinking"); };
  el.addEventListener("contextmenu", e => e.preventDefault());
  const moon = el.querySelector("#qe-moonsh"), corona = el.querySelector("#qe-corona");
  let sx = 0, sy = 0, drag = false, done = false, down = false;
  el.addEventListener("pointerdown", e => {
    e.preventDefault(); stop(); down = true; drag = false; sx = e.clientX; sy = e.clientY;
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
    el.classList.add("qe-sinking");
    t = setTimeout(() => { stop(); down = false; Q.clearLayers(); enterObservatory(); }, 5000);
  });
  el.addEventListener("pointermove", e => {
    if (!down || !moon || done) return;
    const k = 72 / el.getBoundingClientRect().width, dx = (e.clientX - sx) * k, dy = (e.clientY - sy) * k;
    if (!drag && Math.hypot(e.clientX - sx, e.clientY - sy) > 10){ drag = true; stop(); el.classList.add("qe-dragging"); }
    if (!drag) return;
    let mx = Math.max(-30, Math.min(30, dx)), my = Math.max(-30, Math.min(30, dy));
    if (Math.hypot(8 + mx, -4 + my) < 3.5){ mx = -8; my = 4; done = true; }
    moon.setAttribute("transform", `translate(${mx} ${my})`);
    if (done){ corona.setAttribute("opacity", "1"); try{ navigator.vibrate && navigator.vibrate(30); }catch(_){}
      setTimeout(() => { Q.clearLayers(); startEclipse(); }, 1500); }
  });
  const up = () => { stop(); down = false; el.classList.remove("qe-dragging"); if (moon && !done) moon.removeAttribute("transform"); };
  ["pointerup","pointercancel"].forEach(ev => el.addEventListener(ev, up));
}

/* ---------- Lever les yeux : tirer l'accueil vers le bas ---------- */
let pull = null, pullLock = null;
function setPull(d, anim){
  const m = mainEl(), sky = document.getElementById("qe-pullsky"); if (!m) return;
  const tr = anim ? "transform .45s cubic-bezier(.2,.8,.2,1), height .45s cubic-bezier(.2,.8,.2,1)" : "none";
  m.style.transition = tr; m.style.transform = d ? `translateY(${d}px)` : "";
  if (sky){ sky.style.transition = anim ? "height .45s cubic-bezier(.2,.8,.2,1)" : "none"; sky.style.height = d + "px"; sky.classList.toggle("on", d > 60); }
}
function canPull(target){
  if (!document.body.classList.contains("qe-pullable") || Q.layerCount() || document.getElementById("qe-obs")) return false;
  if (window.scrollY > 2 || !target.closest("#app > main.screen") || target.closest("button,input,textarea,a")) return false;
  return true;
}
function movePull(y){ pull.d = Math.max(0, Math.min(140, (y - pull.y) * .55)); if (pull.d > 4) setPull(pull.d, false); }
document.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse" || !canPull(e.target)) return; pull = { y: e.clientY, d: 0 }; document.body.classList.add("qe-pulling"); });
document.addEventListener("pointermove", e => { if (pull && e.pointerType === "mouse"){ movePull(e.clientY); if (pull.d > 4) e.preventDefault(); } });
document.addEventListener("pointerup", e => { if (e.pointerType === "mouse") endPull(); });
document.addEventListener("touchstart", e => { if (e.touches.length !== 1 || !canPull(e.target)) return; pull = { y: e.touches[0].clientY, d: 0 }; document.body.classList.add("qe-pulling"); }, { passive:true });
document.addEventListener("touchmove", e => {
  if (!pull) return;
  const dy = e.touches[0].clientY - pull.y;
  if (dy > 0 && window.scrollY <= 2){ e.preventDefault(); movePull(e.touches[0].clientY); }
  else if (pull.d <= 4){ pull = null; document.body.classList.remove("qe-pulling"); }
}, { passive:false });
document.addEventListener("touchend", endPull); document.addEventListener("touchcancel", endPull);
function endPull(){
  if (!pull) return; const d = pull.d; pull = null; document.body.classList.remove("qe-pulling"); if (d > 4) try{ window.getSelection().removeAllRanges(); }catch(e){}
  if (d > 90){ setPull(126, true); clearTimeout(pullLock); pullLock = setTimeout(() => setPull(0, true), 5000); }
  else setPull(0, true);
}

/* ---------- La patience : 10 secondes sans toucher le Carnet ---------- */
let patT = null;
function armPatience(){ clearTimeout(patT); const el = document.getElementById("qe-patience"); if (!el) return; el.classList.remove("show"); patT = setTimeout(() => { const p = document.getElementById("qe-patience"); if (p) p.classList.add("show"); }, 10000); }
document.addEventListener("pointerdown", e => { if (document.getElementById("qe-patience") && !e.target.closest("#qe-patience")) armPatience(); }, true);

/* =================== Observatoire =================== */
let obsView = "home", idleT = null, shooting = false;
const DIPPER = [ [40,280],[82,258],[114,250],[150,248],[162,282],[214,286],[210,248],[146,30],[236,96] ];
const POLARIS = [190, 58];
const BG = (() => { let s = 7, out = []; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; while (out.length < 70){ const p = [rnd() * 360, rnd() * 320, .4 + rnd() * .9, .25 + rnd() * .5]; if (Math.hypot(p[0] - 190, p[1] - 58) > 30) out.push(p); } return out; })();
let finaleAudio = null;

function obsBox(){ let o = document.getElementById("qe-obs"); if (!o){ o = document.createElement("div"); o.id = "qe-obs"; document.body.appendChild(o); } return o; }
function enterObservatory(){
  if (!S.discovered){ S.discovered = true; save(); }
  obsView = "home"; viewHour = null; document.body.style.overflow = "hidden"; renderObs();
  if (!S.introSeen) showIntro();
  queueDecorate();
}
function leaveObservatory(){ clearTimeout(idleT); const o = document.getElementById("qe-obs"); if (o) o.remove(); if (!Q.layerCount()) document.body.style.overflow = ""; Q.render(); }
function showIntro(){
  document.getElementById("qe-intro")?.remove();
  const L = [
    ["h", "Le géocentrisme est une foutaise."],
    ["p", "Tu viens de le comprendre. Et ici, le comprendre suffit à te mettre en danger."],
    ["p", "Ceux qui l'ont dit avant toi ont été réduits au silence. Mais ce qu'ils ont vu est trop fort pour disparaître avec eux."],
    ["p", "Ils n'ont pas eu le temps de finir. Leurs observations sont cachées, tout près, dans ce que tu crois connaître."],
    ["p", "C'est à toi de prouver que la Terre tourne."],
    ["o", "Observe le ciel.<br>Retrouve les données de tes confrères."],
  ];
  document.body.insertAdjacentHTML("beforeend", `<div class="qe-intro" id="qe-intro" role="dialog" aria-label="Ordre de mission"><div class="qe-in">
    ${L.map(([k, t], i) => k === "h" ? `<h2 style="--i:${i}">${t}</h2>` : k === "o" ? `<p class="qe-order" style="--i:${i}">${t}</p>` : `<p style="--i:${i}">${t}</p>`).join("")}
    <button type="button" style="--i:${L.length}" data-qo="introok">Lever les yeux</button></div></div>`);
}
function recordVisit(){ const h = skyHour(); if (!S.visits.includes(h)){ S.visits.push(h); S.visits.sort((a, b) => a - b); if (S.visits.length > 2000) S.visits = S.visits.slice(-2000); save(); } }
function obsShell(inner, back = '<button type="button" class="qe-back" data-qo="leave">← Revenir sur Terre</button>'){
  const h = viewHour ?? skyHour();
  return `<div class="qe-obs" role="dialog" aria-label="L'Observatoire"><div class="qe-wrap">
    <header>${back}<div class="qe-clock" id="qe-oclock">${viewHour ? "voyage · " : ""}${fmtH(h)}</div></header>${inner}</div></div>`;
}
function skySVG(){
  let out = `<svg class="qe-sky" id="qe-skysvg" viewBox="0 0 360 320" role="img" aria-label="Ciel de l'observatoire">`;
  BG.forEach(([x, y, r, o]) => out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" opacity="${o.toFixed(2)}"/>`);
  DIPPER.slice(0, 7).forEach(([x, y]) => out += `<circle cx="${x}" cy="${y}" r="2.3" fill="#fff" opacity=".9"/><circle cx="${x}" cy="${y}" r="6" fill="#fff" opacity=".06"/>`);
  S.stars.forEach(id => { const p = DIPPER[id - 1]; if (p) out += `<circle cx="${p[0]}" cy="${p[1]}" r="3.2" fill="#F3C77A"/><circle cx="${p[0]}" cy="${p[1]}" r="9" fill="#F3C77A" opacity=".12"/>`; });
  if (WORLD){ out += `<circle cx="300" cy="150" r="3.6" fill="#FFD27A"/><circle cx="300" cy="150" r="13" fill="#FFD27A" opacity=".16"/><text x="300" y="172" text-anchor="middle" font-family="Instrument Serif, Georgia, serif" font-style="italic" font-size="13" fill="#F3C77A">${esc(WORLD.by)}</text>`; }
  if (S.polaris){ const [x, y] = POLARIS; out += `<circle cx="${x}" cy="${y}" r="4" fill="#fff"/><circle cx="${x}" cy="${y}" r="14" fill="#fff" opacity=".12"/>`; }
  out += `<g id="qe-shoot" ${shooting ? "" : 'style="display:none"'}><line x1="300" y1="30" x2="250" y2="62" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/></g>`;
  out += `<rect x="0" y="0" width="360" height="320" fill="transparent" data-qo="skytap"/></svg>`;
  return out;
}
function doorsHTML(){
  const names = ["Copernic","Galilée","Galilée","Kepler","Bessel"], subs = ["La planète qui recule","Les lunes de Jupiter","Les phases de Vénus","Les tables","L'étoile qui bouge"];
  const lights = [1,2,3,4,5,6,7,8,9].map(id => `<i class="${S.stars.includes(id) ? "on" : ""}"></i>`).join("") + `<i class="${S.polaris ? "on" : ""}"></i>`;
  return `<div class="qe-panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h2>La galerie</h2><span class="qe-keys">Clés <span class="qe-k">${"✦".repeat(Math.max(0, available()))}${available() ? "" : "—"}</span></span></div>
    <div style="display:flex;justify-content:space-between;align-items:center"><span class="qe-small">Lumières du ciel</span><span class="qe-lights" aria-label="Lumières retrouvées">${lights}</span></div>
    ${[0,1,2,3,4].map(i => {
      const st = S.doors[i], prevOk = i === 0 || S.doors[i-1] === "solved";
      const need = COSTS.slice(0, i + 1).reduce((x, y) => x + y, 0);
      if (st === "locked" && S.stars.length < need) return "";
      const cls = st === "solved" ? "qe-solved" : (!prevOk ? "qe-locked" : "");
      const right = st === "solved" ? "résolue" : st === "open" ? "ouverte" : "✦".repeat(COSTS[i]);
      return `<button type="button" class="qe-door ${cls}" data-qo="door" data-v="${i}"><span class="qe-num">${["I","II","III","IV","V"][i]}</span><span class="qe-dt"><b>${st === "locked" ? "Porte fermée" : names[i]}</b><small>${st === "locked" ? (prevOk ? `Il faut ${COSTS[i]} étoile${COSTS[i] > 1 ? "s" : ""}` : "Scellée") : subs[i]}</small></span><span class="qe-cost">${right}</span></button>`;
    }).join("")}
  </div>`;
}
function renderObs(){
  recordVisit();
  const o = obsBox();
  if (S.finished && obsView === "home") return renderFinal();
  if (obsView === "home"){
    o.innerHTML = obsShell(`<div><h1>L'Observatoire</h1><p class="qe-motto">Le ciel ne ment pas. Il faut seulement savoir le regarder.</p></div>
      ${skySVG()}
      ${S.polaris ? dialHTML() : `<p class="qe-hint">Le bord de la casserole pointe vers celle qui ne bouge pas. Cinq pas.</p>`}
      ${doorsHTML()}
      ${S.doors.some(d => d !== "locked") ? `<button type="button" class="qe-pill" data-qo="carnet" style="align-self:flex-start">❏ Carnet d'observation</button>` : ""}
      <p class="qe-earth">Ton carnet est resté sur Terre. Il attend l'ombre.</p>`);
    armIdle(); armDial();
  } else if (obsView === "carnet"){
    o.innerHTML = obsShell(carnetHTML(), '<button type="button" class="qe-back" data-qo="home">← L\'Observatoire</button>');
  } else {
    o.innerHTML = obsShell(doorPage(+obsView), '<button type="button" class="qe-back" data-qo="home">← La galerie</button>');
    const f = document.getElementById("qe-ansform"); if (f) f.addEventListener("submit", onAnswer);
    if (+obsView === 4) preloadMusic();
  }
}
const MAXBACK = 30 * 24;
function instrumentsHTML(ms){
  const d = S.doors, parts = [];
  if (d[0] !== "locked") parts.push(`<span class="qe-lab">La planète rouge</span>${rulerSVG(ms)}`);
  if (d[1] !== "locked") parts.push(`<span class="qe-lab">Jupiter</span>${jupiterSVG(ms)}`);
  if (d[2] !== "locked") parts.push(`<span class="qe-lab">Vénus</span>${venusSVG(ms)}`);
  if (d[4] !== "locked") parts.push(`<span class="qe-lab">Le champ d'étoiles</span>${starfieldSVG(ms)}`);
  return parts.join("") || `<p class="qe-small">Ouvre une porte pour voir ce que le ciel faisait.</p>`;
}
function dialHTML(){
  const k = viewHour ? Math.round((viewHour - skyHour()) / HOUR) : 0;
  return `<div class="qe-panel qe-dial"><h2>La molette du temps</h2>
    <p class="qe-small">L'étoile polaire guide les voyageurs. Fais glisser pour remonter le ciel, heure par heure.</p>
    <input type="range" id="qe-dial" min="${-MAXBACK}" max="0" step="1" value="${k}" aria-label="Remonter le temps">
    <div class="qe-ends"><span>il y a 30 jours</span><span>maintenant</span></div>
    <p class="qe-when" id="qe-dialwhen">${k ? fmtH(skyHour() + k * HOUR) : "Maintenant"}</p>
    <div class="qe-tinst" id="qe-tinst">${instrumentsHTML(viewHour ?? skyHour())}</div>
    ${k ? '<button type="button" class="qe-obtn qe-ghost" data-qo="present">Revenir au présent</button>' : ""}</div>`;
}
function armDial(){
  const dl = document.getElementById("qe-dial"); if (!dl) return;
  let raf = 0;
  dl.addEventListener("input", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const k = +dl.value; viewHour = k < 0 ? skyHour() + k * HOUR : null;
      const ms = viewHour ?? skyHour();
      document.getElementById("qe-dialwhen").textContent = k ? fmtH(ms) : "Maintenant";
      document.getElementById("qe-tinst").innerHTML = instrumentsHTML(ms);
      const c = document.getElementById("qe-oclock"); if (c) c.textContent = (viewHour ? "voyage · " : "") + fmtH(ms);
    });
  });
  dl.addEventListener("change", () => { if (!document.querySelector('[data-qo="present"]') && viewHour) renderObs(); if (!viewHour && document.querySelector('[data-qo="present"]')) renderObs(); });
}
function armIdle(){
  clearTimeout(idleT); shooting = false;
  idleT = setTimeout(() => {
    if (obsView !== "home" || S.stars.includes(7) || !S.discovered || !document.getElementById("qe-shoot")) return;
    shooting = true; const g = document.getElementById("qe-shoot"); g.style.display = "";
    setTimeout(() => { shooting = false; if (g) g.style.display = "none"; armIdle(); }, 3500);
  }, 8000);
}

/* ---------- Instruments ---------- */
function rulerSVG(ms){
  const b = bodies(ms), W = 340, x = l => 10 + l / 360 * W;
  let s = `<svg class="qe-sky" viewBox="0 0 360 120" role="img" aria-label="Règle du ciel"><rect x="10" y="44" width="340" height="30" rx="6" fill="rgba(255,255,255,.03)"/>`;
  for (let d = 0; d <= 360; d += 10){ const big = d % 30 === 0; s += `<line x1="${x(d)}" y1="${big ? 74 : 70}" x2="${x(d)}" y2="80" stroke="rgba(255,255,255,${big ? .5 : .2})"/>`; if (big) s += `<text x="${x(d)}" y="96" fill="rgba(239,230,242,.55)" font-size="9" text-anchor="middle">${d}°</text>`; }
  BG.slice(0, 26).forEach(([bx, by, r]) => s += `<circle cx="${(10 + bx / 360 * W).toFixed(1)}" cy="${(46 + by / 320 * 26).toFixed(1)}" r="${(r * .8).toFixed(2)}" fill="#fff" opacity=".4"/>`);
  if (!viewHour){ S.visits.filter(h => h < skyHour() && h > skyHour() - 10 * DAY).forEach(h => { const p = bodies(h).lamR; s += `<circle cx="${x(p).toFixed(1)}" cy="59" r="1.6" fill="#E0573D" opacity=".35"/>`; }); }
  s += `<circle cx="${x(b.lamR).toFixed(1)}" cy="59" r="5" fill="#E0573D"/><circle cx="${x(b.lamR).toFixed(1)}" cy="59" r="11" fill="#E0573D" opacity=".18"/>`;
  s += `<text x="180" y="28" fill="#F3C77A" font-size="12" text-anchor="middle">planète rouge : ${b.lamR.toFixed(0)}°</text></svg>`;
  return s;
}
function jupiterSVG(ms){
  const b = bodies(ms), cx = 180, k = 6.1;
  let s = `<svg class="qe-sky" viewBox="0 0 360 110" role="img" aria-label="Jupiter et ses lunes dans la lunette"><circle cx="${cx}" cy="55" r="52" fill="none" stroke="rgba(255,255,255,.05)"/>`;
  BG.slice(30, 44).forEach(([bx, by, r]) => s += `<circle cx="${bx.toFixed(1)}" cy="${(by / 320 * 110).toFixed(1)}" r="${(r * .7).toFixed(2)}" fill="#fff" opacity=".25"/>`);
  s += `<circle cx="${cx}" cy="55" r="9" fill="#E9D3B0"/><rect x="${cx - 9}" y="52" width="18" height="2" fill="#C49A6C" opacity=".6"/>`;
  b.moons.forEach(m => { if (m.behind) return; const mx = cx + m.x * k; s += `<circle cx="${mx.toFixed(1)}" cy="55" r="2.2" fill="#fff"/><text x="${mx.toFixed(1)}" y="70" fill="rgba(239,230,242,.7)" font-size="8" text-anchor="middle">${m.L}</text>`; });
  return s + `</svg>`;
}
function venusGeom(ms){
  const b = bodies(ms), horizon = 150, cx = 180, ppd = 2.6;
  const el = wrap180(b.lamV - b.lamS);
  const vx = cx, vy = horizon - 22 - Math.abs(el) * 1.8;
  const sx = cx - el * ppd, sy = horizon + 70;
  return { b, horizon, cx, vx, vy, sx, sy, el };
}
function venusSVG(ms){
  const g = venusGeom(ms), r = Math.max(5, Math.min(18, 7 / g.b.dist));
  const ang = deg(Math.atan2(g.sy - g.vy, g.sx - g.vx));
  const k = g.b.lit, tx = r * Math.abs(2 * k - 1);
  let s = `<svg class="qe-sky" id="qe-venus" viewBox="0 0 360 230" role="img" aria-label="Vénus au-dessus de l'horizon">`;
  BG.slice(44, 64).forEach(([bx, by, rr]) => s += `<circle cx="${bx.toFixed(1)}" cy="${(by / 320 * 140).toFixed(1)}" r="${(rr * .7).toFixed(2)}" fill="#fff" opacity=".3"/>`);
  s += `<g transform="translate(${g.vx.toFixed(1)} ${g.vy.toFixed(1)}) rotate(${ang.toFixed(1)})">
    <circle r="${r.toFixed(1)}" fill="#2A2233"/>
    <clipPath id="qe-vh"><rect x="0" y="${-r - 1}" width="${r + 1}" height="${2 * r + 2}"/></clipPath>
    <circle r="${r.toFixed(1)}" fill="#FFF4D8" clip-path="url(#qe-vh)"/>
    <ellipse rx="${tx.toFixed(2)}" ry="${r.toFixed(1)}" fill="${k >= .5 ? "#FFF4D8" : "#2A2233"}"/></g>`;
  s += `<rect x="0" y="${g.horizon}" width="360" height="80" fill="#07050A"/><line x1="0" y1="${g.horizon}" x2="360" y2="${g.horizon}" stroke="rgba(255,255,255,.25)"/>
    <text x="180" y="${g.horizon + 18}" fill="rgba(239,230,242,.4)" font-size="9" text-anchor="middle">horizon</text>
    <rect x="0" y="${g.horizon - 10}" width="360" height="90" fill="transparent" data-qo="horizon"/></svg>`;
  return s;
}
function starfieldSVG(ms){
  const b = bodies(ms);
  let s = `<svg class="qe-sky" id="qe-field" viewBox="0 0 360 260" role="img" aria-label="Champ d'étoiles">`;
  let hits = "";
  BG.forEach(([x, y, r, o], i) => { const yy = y / 320 * 260; s += `<circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="${(r * 1.1).toFixed(2)}" fill="#fff" opacity="${(o + .15).toFixed(2)}"/>`; hits += `<circle cx="${x.toFixed(1)}" cy="${yy.toFixed(1)}" r="8" fill="transparent" data-qo="fstar" data-v="${i}"/>`; });
  const px = 214 + 7 * Math.sin(b.tE), py = 118 + 2 * Math.cos(b.tE);
  s += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="1.1" fill="#fff" opacity=".85"/>` + hits + `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="8" fill="transparent" data-qo="fstar" data-v="near"/>`;
  return s + `</svg>`;
}

/* ---------- Portes ---------- */
// Les réponses ne sont gardées que sous forme d'empreinte : impossible de les lire dans le code.
const DOORS = [
  { h:"82b846520dbe47a64e68015ca96daf15d606661e97a873480f808d38549daec9", text:`<p><em>Copernic, 1543.</em></p><p>Vue de la Terre, la planète rouge avance parmi les étoiles. Puis, certaines nuits, elle recule.</p><p>Pendant 1 400 ans, on a cru que tout tournait autour de nous, et on a empilé des cercles dans des cercles pour expliquer ce recul.</p><p>Copernic a compris que c'est nous qui bougeons. Quand la Terre dépasse la planète, comme une voiture qui en double une autre, celle-ci semble reculer.</p><p><em>Dans ce ciel, la Terre fait le tour du Soleil en 6 jours.</em></p><p>Mesure le temps entre deux reculs (S). Puis trouve, comme Copernic, combien de jours il faut à la planète rouge pour faire le tour du Soleil (P).</p>`, formula:"1/P = 1/6 − 1/S", inst:rulerSVG, input:"Nombre de jours" },
  { h:"7b7d15792965ce218436df5ce78846bc71ee9ea1e1b6546b61144f80e5f09e66", text:`<p><em>Galilée, janvier 1610.</em></p><p>Avec sa lunette, Galilée voit quatre petites « étoiles » alignées à côté de Jupiter. Nuit après nuit, elles changent de place, disparaissent derrière la planète, réapparaissent de l'autre côté.</p><p>Ce ne sont pas des étoiles : ce sont des lunes qui tournent autour de Jupiter. Tout ne tourne donc pas autour de la Terre.</p><p><em>Les plus proches tournent le plus vite.</em></p><p>Observe-les. Range leurs lettres de la plus proche de Jupiter à la plus lointaine.</p>`, inst:jupiterSVG, input:"Quatre lettres" },
  { tap:true, text:`<p><em>Galilée, fin 1610.</em></p><p>En pointant sa lunette vers Vénus, Galilée la voit changer de forme comme la Lune : pleine, puis à moitié, puis en fin croissant. Et plus elle s'affine, plus elle grossit.</p><p>Si Vénus tournait autour de la Terre, on ne la verrait jamais pleine. Elle tourne donc autour du Soleil.</p><p><em>Le côté éclairé d'un croissant regarde toujours le Soleil.</em></p><p>Il fait nuit. Le Soleil est quelque part sous l'horizon. <b>Touche l'endroit où il se cache.</b></p>`, inst:venusSVG },
  { h:"deb866bfb5bcbc8b6d1f66ef05101d50338971b6464893455452bd991c9d3e51", text:`<p><em>Kepler, 1619.</em></p><p>Pendant vingt ans, Tycho Brahe a noté la position des planètes avec une précision jamais vue. Avec ses tables, Kepler découvre une harmonie cachée : plus une planète est loin du Soleil, plus son année est longue, et toujours dans la même proportion.</p><p><em>Le carré de la durée d'une orbite est proportionnel au cube de sa distance.</em></p><p>Une planète invisible tourne autour du Soleil de ce ciel, 9 fois plus loin que la Terre. Combien de jours dure son année ?</p>`, formula:"P² / d³ = constante", tables:true, input:"Nombre de jours" },
  { tapStar:true, text:`<p><em>Bessel, 1838.</em></p><p>Si la Terre tourne autour du Soleil, les étoiles proches doivent sembler bouger un tout petit peu au fil de l'année, comme ton doigt tendu qui saute quand tu fermes un œil puis l'autre. On a cherché ce décalage pendant trois siècles.</p><p>Bessel l'a enfin mesuré : une étoile, minuscule, qui oscille au rythme de la Terre.</p><p><em>Dans ce ciel, l'année dure 6 jours.</em></p><p>Une seule étoile de ce champ n'est pas à la même place d'un jour à l'autre. <b>Touche-la.</b></p>`, inst:starfieldSVG }
];
function doorPage(i){
  const D = DOORS[i], solved = S.doors[i] === "solved", ms = viewHour ?? skyHour();
  const att = attemptsLeft(i);
  let ans = "";
  if (solved) ans = `<p class="qe-banner">Porte résolue.</p>`;
  else if (viewHour) ans = `<p class="qe-banner">Tu regardes le passé. On ne répond qu'au présent.</p>`;
  else if (D.tap || D.tapStar) ans = att > 0 ? `<p class="qe-small">${att} essai${att > 1 ? "s" : ""} avant que le ciel se couvre.</p><p class="qe-nope" id="qe-nope" aria-live="polite"></p>` : `<p class="qe-banner">Le ciel se couvre. Reviens dans une heure.</p>`;
  else ans = `<form id="qe-ansform" data-i="${i}" style="display:flex;flex-direction:column;gap:10px" novalidate><input class="qe-input" id="qe-ans" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${D.input}" aria-label="${D.input}"><p class="qe-nope" id="qe-nope" aria-live="polite"></p><button class="qe-obtn" type="submit">Proposer</button></form>`;
  return `<div><span class="qe-small" style="font-family:var(--qe-mono)">PORTE ${["I","II","III","IV","V"][i]}</span></div>
    <div class="qe-text">${D.text}</div>
    ${D.formula ? `<div class="qe-formula">${D.formula}</div>` : ""}
    ${D.tables ? tablesHTML() : ""}
    ${D.inst ? D.inst(ms) : ""}
    ${ans}`;
}
function tablesHTML(){
  return `<table class="qe-tables"><thead><tr><th>Astre</th><th style="text-align:right">Année (jours)</th><th style="text-align:right">Distance</th></tr></thead><tbody>
    <tr><td>Vénus</td><td class="qe-n">3,75</td><td class="qe-n">0,73</td></tr>
    <tr><td>Terre</td><td class="qe-n">?</td><td class="qe-n">1</td></tr>
    <tr><td>Planète rouge</td><td class="qe-n">?</td><td class="qe-n">3,66</td></tr>
    <tr><td>Planète invisible</td><td class="qe-n">?</td><td class="qe-n">9</td></tr></tbody></table>`;
}
function attemptsLeft(i){ const a = S.attempts[i]; const h = skyHour(); if (!a || a.h !== h) return 3; return Math.max(0, 3 - a.n); }
function useAttempt(i){ const h = skyHour(); const a = S.attempts[i]; S.attempts[i] = (!a || a.h !== h) ? { h, n:1 } : { h, n:a.n + 1 }; save(); }
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
async function sha(s){ const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
function wrong(msg){ const n = document.getElementById("qe-nope"); if (n) n.textContent = msg || ["Non.", "Pas encore.", "Le ciel dit autre chose.", "Regarde mieux."][Math.floor(Math.random() * 4)]; const w = document.querySelector(".qe-wrap"); if (w){ w.classList.remove("qe-shake"); void w.offsetWidth; w.classList.add("qe-shake"); } }
async function onAnswer(e){
  e.preventDefault(); const i = +e.target.dataset.i;
  const v = norm(document.getElementById("qe-ans").value);
  if (!v) return wrong("Il faut bien proposer quelque chose.");
  let ok = false; try{ ok = (await sha("qe:" + v)) === DOORS[i].h; }catch(x){ return wrong("Ce téléphone ne peut pas vérifier la réponse."); }
  if (!ok) return wrong();
  solve(i);
}
function solve(i){
  S.doors[i] = "solved";
  if (i === 2) S.crescent = true;
  if (i === 4) S.finished = true;
  save();
  if (i === 2){ queueDecorate(); const o = document.querySelector(".qe-wrap"); if (o) o.insertAdjacentHTML("afterbegin", `<p class="qe-banner">Une lueur dorée monte de l'horizon…</p>`); setTimeout(() => { obsView = "home"; renderObs(); }, 1600); return; }
  if (i === 4){
    const firstEver = !WORLD;
    playFinale(firstEver);
    World.sign().then(rank => {
      if (rank === 1) Q.push("shared", "Le Soleil est au centre.", `${myName()} l'a prouvé. Le monde vient de changer.`);
    }).catch(() => {});
    return;
  }
  obsView = "home"; renderObs();
}

/* ---------- Carnet d'observation ---------- */
function carnetHTML(){
  const d = S.doors;
  const cols = h => { const b = bodies(h); const parts = [];
    if (d[0] !== "locked") parts.push(`rouge <b>${b.lamR.toFixed(0)}°</b>`);
    if (d[1] !== "locked"){ const vis = b.moons.filter(m => !m.behind).sort((p, q) => p.x - q.x); const left = vis.filter(m => m.x < 0).map(m => m.L).join(" "), right = vis.filter(m => m.x >= 0).map(m => m.L).join(" "); parts.push(`lunes <b>${left || "·"} | ${right || "·"}</b>`); }
    if (d[2] !== "locked") parts.push(`Vénus <b>${Math.round(b.lit * 100)} %</b>`);
    return parts.join(" · ") || "ciel noté";
  };
  const visits = S.visits.slice().reverse().slice(0, 60);
  return `<div><h1 style="font-size:34px">Carnet</h1><p class="qe-motto" style="font-size:16px">Chaque nuit où tu as levé les yeux.</p></div>
    ${S.polaris ? `<p class="qe-banner">La molette du temps se trouve dans l'observatoire.</p>` : ""}
    <div class="qe-log">${visits.map(h => `<div>${fmtH(h)}<br>${cols(h)}</div>`).join("") || "<div>Aucune observation.</div>"}</div>`;
}

/* =================== Éclipse et plaques de verre =================== */
function emptySpot(){
  window.scrollTo(0, 0);
  const H = innerHeight, main = mainEl();
  const mr = main ? main.getBoundingClientRect() : { left:0, right:innerWidth };
  // le vide à droite du titre « Pour Romane »
  const tl = main && main.querySelector(".head .ltitle");
  if (tl){ const rg = document.createRange(); rg.selectNodeContents(tl); const r = rg.getBoundingClientRect(); if (mr.right - r.right > 70) return [Math.round((r.right + mr.right) / 2 + 6), Math.round(r.top + r.height / 2 + 2)]; }
  return [Math.round(innerWidth * .7), Math.round(H * .2)];
}
function startEclipse(){
  document.getElementById("qe-eclipse")?.remove();
  Q.goTab("depot");
  setTimeout(() => {
    const [x, y] = emptySpot();
    document.body.insertAdjacentHTML("beforeend", `<div class="qe-eclipse" id="qe-eclipse" style="--x:${x}px;--y:${y}px" aria-hidden="true"><button type="button" class="qe-spot" aria-label="Lumière"></button></div>`);
    const ov = document.getElementById("qe-eclipse");
    const lift = () => { ov.classList.add("out"); setTimeout(() => ov.remove(), 1400); };
    const auto = setTimeout(lift, 45000);
    ov.addEventListener("click", e => { e.stopPropagation(); if (!e.target.closest(".qe-spot")) return; clearTimeout(auto); openPlates(); setTimeout(lift, 300); });
  }, 60);
}
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function starDots(seed, n, avoid = []){
  const r = rng(seed); let out = "";
  for (let i = 0; i < n; i++){
    const x = r() * 400, y = r() * 500, big = r(), rad = big > .96 ? 1.9 : big > .8 ? 1.1 : .35 + r() * .5, o = .35 + r() * .6;
    if (avoid.some(([ax, ay, ar]) => Math.hypot(x - ax, y - ay) < ar)) continue;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}" fill="#fff" opacity="${o.toFixed(2)}"/>`;
    if (rad > 1.5) out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#fff" opacity=".07"/>`;
  }
  return out;
}
function inkCircle(cx, cy, rad, seed){
  const r = rng(seed); let d = "";
  for (let i = 0; i <= 44; i++){ const a = -0.6 + i / 40 * Math.PI * 2, k = rad * (1 + (r() - .5) * .07 + i / 400);
    d += (i ? "L" : "M") + (cx + Math.cos(a) * k * 1.08).toFixed(1) + " " + (cy + Math.sin(a) * k).toFixed(1); }
  return `<path d="${d}" fill="none" stroke="#EEF1F4" stroke-width="1.1" stroke-linecap="round" opacity=".75"/>`;
}
const INK = 'fill="none" stroke="#EEF1F4" stroke-width="1.1" stroke-linecap="round" opacity=".7"';
function plate(no, label, sky, notes){
  return `<figure class="qe-plate"><svg class="qe-sk" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${sky}</svg>
    <div class="qe-notes">${notes}</div><span class="qe-lbl">${label}</span><span class="qe-no">${no}</span></figure>`;
}
function openPlates(){
  document.getElementById("qe-plates")?.remove();
  let trails = ""; const r1 = rng(7);
  for (let i = 0; i < 70; i++){ const R = 14 + r1() * 470, a0 = r1() * 6.28, span = .5 + r1() * .25;
    const x1 = 300 + Math.cos(a0) * R, y1 = 80 + Math.sin(a0) * R, x2 = 300 + Math.cos(a0 + span) * R, y2 = 80 + Math.sin(a0 + span) * R;
    trails += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}A${R.toFixed(1)} ${R.toFixed(1)} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="#fff" stroke-width="${(.4 + r1() * 1).toFixed(2)}" opacity="${(.15 + r1() * .5).toFixed(2)}"/>`; }
  trails += `<circle cx="300" cy="80" r="1.6" fill="#fff"/><defs><linearGradient id="qe-fadeb" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#08090c" stop-opacity="0"/><stop offset=".72" stop-color="#08090c" stop-opacity=".85"/></linearGradient></defs><rect width="400" height="500" fill="url(#qe-fadeb)"/>`;
  const p1 = plate("I", "22 · VI · 1633", trails,
    `<span class="qe-n qe-co">pose : 6 h · objectif fixe</span><span class="qe-sp"></span>
     <span class="qe-n" style="--r:-2deg">Ils disaient : <s>elle ne bouge pas</s>.</span>
     <span class="qe-n" style="--r:-.5deg">On l'a fait taire ce jour-là.</span>
     <span class="qe-n qe-r" style="--r:-1.5deg">Elle tournait quand même.</span>`);
  const p2 = plate("II", "15 · X · 2026 · 21 h 40",
    starDots(11, 140) + inkCircle(300, 236, 15, 3) + `<circle cx="300" cy="236" r="1.5" fill="#fff"/><path d="M84 220 L84 168 M76 178 L84 168 L92 178" ${INK}/>`,
    `<span class="qe-n" style="--r:-1deg">↑ avant la première ligne.</span>
     <span class="qe-n qe-r" style="--r:1deg">Un nombre qui respire.</span>
     <span class="qe-sp"></span>
     <span class="qe-n" style="--r:-2deg">Le dernier point n'en est pas un.</span>
     <span class="qe-n qe-sm" style="--r:-.5deg">Au bout du journal, en bas, une veilleuse.</span>`);
  const p3 = plate("III", "16 · X · 2026 · 23 h 05",
    starDots(23, 130) + `<path d="M330 70 A34 34 0 1 1 296 36" ${INK}/><path d="M290 30 L297 36 L289 43" ${INK}/>`,
    `<span class="qe-n" style="--r:-1.5deg">Entre la voix et les mots.</span>
     <span class="qe-n qe-sm" style="--r:-.5deg">Ce qui part dans l'enveloppe<br>ne part pas seul.</span>
     <span class="qe-sp"></span>
     <span class="qe-n" style="--r:-1deg">Copernic n'a rien inventé.<br>Il a seulement tourné la tête.</span>
     <span class="qe-n qe-co">⟲ 90°</span>
     <span class="qe-n qe-r" style="--r:1.5deg">10 s. Ne touche à rien. Regarde.</span>`);
  const p4 = plate("IV", "17 · X · 2026 · 02 h 10",
    starDots(41, 150, [[96, 150, 52], [290, 229, 30]]) +
    `<defs><linearGradient id="qe-strk" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".9"/></linearGradient></defs>
     <path d="M232 262 L350 196" stroke="url(#qe-strk)" stroke-width="1.6" stroke-linecap="round"/>
     <circle cx="96" cy="150" r="1.8" fill="#fff"/>` + inkCircle(96, 150, 24, 9) + `<path d="M96 116 L96 92 M90 100 L96 92 L102 100" ${INK}/>`,
    `<span class="qe-n qe-r" style="--r:1deg">Elles ne filent que<br>pour les immobiles.</span>
     <span class="qe-sp"></span>
     <span class="qe-n" style="--r:-1.5deg">La seule qui ne tourne pas.</span>
     <span class="qe-n qe-sm" style="--r:-.5deg">Seule, dans son coin vide. <s>en bas</s> en haut.</span>`);
  const p5 = plate("V", "— · — · ————",
    starDots(57, 90),
    `<span class="qe-n qe-co">30 nuits · pas une de plus</span>
     <span class="qe-n" style="--r:-1deg">Tout vu ? Alors remonte.</span>
     <span class="qe-n qe-sm" style="--r:-.5deg">Mais on ne répond qu'au présent.</span>
     <span class="qe-sp"></span>
     <span class="qe-n" style="--r:-2deg"><s>Il faut se taire.</s></span>
     <span class="qe-n qe-r" style="--r:-1deg">L'héliocentrisme<br>n'a plus à se cacher.</span>`);
  document.body.insertAdjacentHTML("beforeend", `<div class="qe-plates" id="qe-plates" role="dialog" aria-label="Plaques de l'astronome">${p1}${p2}${p3}${p4}${p5}<button type="button" class="qe-shut" data-qo="closeplates">Ranger les plaques</button></div>`);
  document.body.style.overflow = "hidden";
}

/* =================== Finale =================== */
function preloadMusic(){ if (!finaleAudio){ try{ finaleAudio = new Audio("la-decouverte.mp3?v=1"); finaleAudio.preload = "auto"; }catch(e){} } }
let finaleRaf = 0;
function playFinale(firstEver){
  preloadMusic();
  let useAudio = !!finaleAudio;
  try{ finaleAudio.pause(); finaleAudio.currentTime = 0; const p = finaleAudio.play(); if (p && p.catch) p.catch(() => { useAudio = false; }); }catch(e){ useAudio = false; }
  document.getElementById("qe-finale")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="qe-finale" id="qe-finale" role="dialog" aria-label="Le Soleil est au centre">
    <canvas id="qe-fcv" width="880" height="880" aria-hidden="true"></canvas>
    <div class="qe-cap" id="qe-fcap"></div>
    <button type="button" class="qe-fgo" id="qe-fgo" data-qo="finalecard">Continuer</button>
    <div class="qe-flash" id="qe-fflash"></div></div>`);
  document.body.style.overflow = "hidden";
  const cv = document.getElementById("qe-fcv"), g = cv.getContext("2d"), W = cv.width, C = W / 2;
  const B = { v:{ R:.30, P:PV, c:"#FFF4D8" }, e:{ R:.50, P:E, c:"#6FA8FF" }, m:{ R:.86, P:PR, c:"#E0573D" } };
  const U = W * .5;
  const helio = (b, t) => { const a = 2 * Math.PI * t / b.P - Math.PI / 2; return [Math.cos(a) * b.R, Math.sin(a) * b.R]; };
  const at = (b, t, k) => { const p = helio(b, t), e = helio(B.e, t); return [p[0] - k * e[0], p[1] - k * e[1]]; };
  let Z = 1;
  const X = ([x, y]) => [C + x * Z, C + y * Z];
  const cap = lines => { const el = document.getElementById("qe-fcap"); if (!el) return; el.innerHTML = lines.map(([t, c]) => `<p class="${c || ""}">${t}</p>`).join(""); requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll("p").forEach((p, i) => setTimeout(() => p.classList.add("on"), i * 900)))); };
  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  const T_DRAW = 7, T_SHIFT = 6, T_HOLD = 5;
  let t0 = null, phase = 0;
  const bg = Array.from({ length:120 }, () => [Math.random() * W, Math.random() * W, Math.random() * 1.6 + .3, Math.random() * .5 + .15]);
  function trail(b, tEnd, k, span, alpha, width){
    g.beginPath(); const n = 420, t1 = Math.max(0, tEnd - span);
    for (let i = 0; i <= n; i++){ const t = t1 + (tEnd - t1) * i / n; const [x, y] = X(at(b, t, k)); i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = b.c; g.globalAlpha = alpha; g.lineWidth = width; g.stroke(); g.globalAlpha = 1;
  }
  function body(p, r, col, glow){ const [x, y] = X(p); const gr = g.createRadialGradient(x, y, 0, x, y, glow); gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)"); g.globalAlpha = .45; g.fillStyle = gr; g.beginPath(); g.arc(x, y, glow, 0, 7); g.fill(); g.globalAlpha = 1; g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
  function frame(ts){
    if (!document.getElementById("qe-finale")) return;
    if (t0 === null) t0 = ts;
    if (useAudio && finaleAudio.currentTime === 0 && ts - t0 > 4000){ useAudio = false; t0 = ts; }   // le son ne part pas : on joue sans
    const s = useAudio ? finaleAudio.currentTime : (ts - t0) / 1000;      // les images suivent la musique
    const days = s * 6;
    const k = 1 - ease((s - T_DRAW) / T_SHIFT);
    Z = U * .94 / (B.m.R + B.e.R * k);
    g.clearRect(0, 0, W, W);
    bg.forEach(([x, y, r, o]) => { g.globalAlpha = o; g.fillStyle = "#fff"; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }); g.globalAlpha = 1;
    const span = s < T_DRAW ? days : PR;
    trail(B.m, days, k, Math.min(span, PR), .85, 2.6);
    trail(B.v, days, k, Math.min(span, 10), .55, 1.8);
    const circ = ease((s - T_DRAW - T_SHIFT * .6) / 2.5);
    if (circ > 0){ const sun = X(at({ R:0, P:1 }, days, k)); g.strokeStyle = "rgba(255,255,255,.18)"; g.lineWidth = 1.4; g.globalAlpha = circ; [B.v, B.e, B.m].forEach(b => { g.beginPath(); g.arc(sun[0], sun[1], b.R * Z, 0, 7); g.stroke(); }); g.globalAlpha = 1; }
    const sunP = at({ R:0, P:1 }, days, k);
    body(sunP, 13 + 9 * (1 - k), "#F3C77A", 70 + 60 * (1 - k));
    body(at(B.v, days, k), 6, B.v.c, 18);
    body(at(B.e, days, k), 8, B.e.c, 22);
    body(at(B.m, days, k), 8, B.m.c, 22);
    if (k > .6){ g.globalAlpha = (k - .6) / .4 * .7; g.fillStyle = "#EFE6F2"; g.font = "italic 26px 'Instrument Serif', Georgia, serif"; g.textAlign = "center"; const [ex, ey] = X(at(B.e, days, k)); g.fillText("Terre", ex, ey + 40); g.globalAlpha = 1; }
    if (phase === 0){ phase = 1; cap([["Ce qu'ils voyaient."], ["La Terre au centre. Et des planètes qui font des boucles.", "qe-sm"]]); }
    if (phase === 1 && s > T_DRAW){ phase = 2; cap([["Eppur si muove."], ["Et pourtant, elle tourne.", "qe-sm"]]); }
    if (phase === 2 && s > T_DRAW + T_SHIFT){ phase = 3; cap([["Le Soleil est au centre."], ["Les boucles n'ont jamais existé. C'est nous qui bougions.", "qe-sm"]]); }
    if (phase === 3 && s > T_DRAW + T_SHIFT + T_HOLD){ phase = 4; worldShift(firstEver); }
    finaleRaf = requestAnimationFrame(frame);
  }
  cancelAnimationFrame(finaleRaf);
  finaleRaf = requestAnimationFrame(frame);
}
function worldShift(firstEver){
  document.getElementById("qe-fflash")?.classList.add("on");
  setTimeout(() => {
    document.getElementById("qe-fflash")?.classList.remove("on");
    const c = document.getElementById("qe-fcap"); if (!c) return;
    const first = firstEver || S.rank === 1;
    c.innerHTML = first ? `<p>Le monde vient de changer.</p><p class="qe-sm">Toute la bande le sait.</p>`
                        : `<p>Tu l'as compris à ton tour.</p><p class="qe-sm">${WORLD ? esc(WORLD.by) + " avait ouvert la voie." : "Le monde avait déjà changé."}</p>`;
    requestAnimationFrame(() => requestAnimationFrame(() => c.querySelectorAll("p").forEach((p, i) => setTimeout(() => p.classList.add("on"), i * 900))));
    if (first) showNotif();
    setTimeout(() => document.getElementById("qe-fgo")?.classList.add("on"), 3200);
  }, 1700);
}
function showNotif(){
  document.getElementById("qe-notif")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="qe-notif" id="qe-notif" role="status"><span class="qe-nic">${SUNICON}</span><span class="qe-ntx"><small><span>Querida</span><span>maintenant</span></small><b>Le Soleil est au centre.</b>${esc(myName())} l'a prouvé. Le monde vient de changer.</span><span class="qe-nto">Envoyé sur le téléphone de toute la bande</span></div>`);
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById("qe-notif")?.classList.add("on")));
  setTimeout(() => { const n = document.getElementById("qe-notif"); if (n){ n.classList.remove("on"); setTimeout(() => n.remove(), 800); } }, 7000);
}
function closeFinale(){ cancelAnimationFrame(finaleRaf); document.getElementById("qe-finale")?.remove(); obsView = "home"; renderFinal(); queueDecorate(); }
function renderFinal(){
  const o = obsBox();
  const first = S.rank === 1 || (!S.rank && (!WORLD || WORLD.by === myName()));
  const line = first
    ? `Le ${fmtDay(WORLD ? WORLD.at : now())}, ${esc(myName())} a remis le ciel dans l'ordre.<br>Depuis, une étoile porte son nom.`
    : `Le ${fmtDay(WORLD.at)}, ${esc(WORLD.by)} a remis le ciel dans l'ordre.<br>${S.rank ? `Tu es le ${S.rank}ᵉ à l'avoir compris.` : "Tu l'as compris à ton tour."}`;
  o.innerHTML = obsShell(`<div class="qe-final">
    <svg viewBox="0 0 200 200" width="200" height="200" aria-hidden="true"><circle cx="100" cy="100" r="16" fill="#F3C77A"/><circle cx="100" cy="100" r="34" fill="#F3C77A" opacity=".12"/>
      ${[[30,"#FFF4D8",3.75],[46,"#6FA8FF",6],[74,"#E0573D",42]].map(([r, c, p]) => `<circle cx="100" cy="100" r="${r}" fill="none" stroke="rgba(255,255,255,.12)"/><g><circle cx="${100 + r}" cy="100" r="4" fill="${c}"/><animateTransform attributeName="transform" type="rotate" from="0 100 100" to="-360 100 100" dur="${(p * 1.2).toFixed(1)}s" repeatCount="indefinite"/></g>`).join("")}
    </svg>
    <h2>Le Soleil est au centre.</h2>
    <p class="qe-text" style="font-size:19px">${line}</p>
    <button type="button" class="qe-pill" data-qo="replay" style="align-self:center">Revoir la révolution</button>
  </div>`);
}

/* =================== Clics =================== */
function svgPoint(svg, e){ const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
document.addEventListener("click", e => {
  try{
    const stb = e.target.closest("[data-qstar]");
    if (stb){ e.stopPropagation(); e.preventDefault(); collect(+stb.dataset.qstar, stb); return; }
    const o = e.target.closest("[data-qo]"); if (!o) return;
    const v = o.dataset.qo;
    const wasShooting = shooting;
    if (document.getElementById("qe-obs")) armIdle();
    if (v === "leave") return leaveObservatory();
    if (v === "introok"){ S.introSeen = true; save(); const el = document.getElementById("qe-intro"); if (el){ el.classList.add("out"); setTimeout(() => el.remove(), 900); } return; }
    if (v === "finalecard") return closeFinale();
    if (v === "replay") return playFinale(S.rank === 1);
    if (v === "closeplates"){ document.getElementById("qe-plates")?.remove(); if (!Q.layerCount() && !document.getElementById("qe-obs")) document.body.style.overflow = ""; return; }
    if (v === "home"){ obsView = "home"; return renderObs(); }
    if (v === "carnet"){ obsView = "carnet"; return renderObs(); }
    if (v === "present"){ viewHour = null; return renderObs(); }
    if (v === "skytap"){
      const svg = document.getElementById("qe-skysvg"), p = svgPoint(svg, e);
      if (wasShooting && Math.hypot(p.x - 260, p.y - 55) < 34){ collect(7); return renderObs(); }
      if (Math.hypot(p.x - POLARIS[0], p.y - POLARIS[1]) < 20 && !S.polaris){ S.polaris = true; save(); renderObs(); }
      return;
    }
    if (v === "door"){
      const i = +o.dataset.v, st = S.doors[i], prevOk = i === 0 || S.doors[i-1] === "solved";
      if (st !== "locked"){ obsView = String(i); return renderObs(); }
      if (!prevOk) return;
      if (available() < COSTS[i]){ o.classList.remove("qe-shake"); void o.offsetWidth; o.classList.add("qe-shake"); o.querySelector("small").textContent = `Il te manque ${COSTS[i] - available()} étoile${COSTS[i] - available() > 1 ? "s" : ""}.`; return; }
      S.spent += COSTS[i]; S.doors[i] = "open"; save(); obsView = String(i); return renderObs();
    }
    if (v === "horizon"){
      const i = 2; if (viewHour || S.doors[i] === "solved" || attemptsLeft(i) <= 0) return;
      const svg = document.getElementById("qe-venus"), p = svgPoint(svg, e), g = venusGeom(skyHour());
      useAttempt(i);
      if (Math.abs(p.x - g.sx) <= 22) return solve(i);
      renderObs(); wrong(attemptsLeft(i) ? "Le Soleil n'est pas là." : "");
      return;
    }
    if (v === "fstar"){
      const i = 4; if (viewHour || S.doors[i] === "solved" || attemptsLeft(i) <= 0) return;
      useAttempt(i);
      if (o.dataset.v === "near") return solve(i);
      renderObs(); wrong(attemptsLeft(i) ? "Celle-ci n'a pas bougé." : "");
    }
  }catch(err){ /* l'énigme ne doit jamais gêner l'appli */ }
}, true);

/* =================== Démarrage =================== */
queueDecorate();
syncWorld();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncWorld(); });

}catch(err){ /* en cas de souci, l'appli continue sans l'énigme */ }
})();
