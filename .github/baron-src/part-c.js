
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
.b2-sellbtn .l{font:900 16px/1.1 var(--round)}
.b2-sellbtn .v{display:flex;align-items:center;font:900 13px var(--round);font-variant-numeric:tabular-nums}
.b2-sellbtn .v .b2-coin{width:13px;height:13px}
.b2-sellbtn.empty{filter:saturate(.3) brightness(.95);opacity:.8}
.b2-sellbtn.ready{animation:b2-call 1.2s ease-in-out infinite}
.b2-sellbtn.ready::after{content:"👆";position:absolute;right:-22px;top:6px;font-size:26px;animation:b2-tap 1.1s ease-in-out infinite}
.b2-gauge{position:absolute;right:14px;top:112px;width:140px;z-index:1}
.b2-gbar{height:12px;border-radius:999px;background:rgba(59,31,23,.25);overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,.25)}
.b2-gbar i{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,#F6C543,#F2873B);transition:width .5s}
.b2-gbar.full i{background:var(--down);animation:b2-blink 1s infinite}
@keyframes b2-blink{50%{opacity:.55}}
.b2-glab{display:flex;justify-content:space-between;font:800 11.5px var(--round);color:var(--ink);margin-bottom:3px;text-shadow:0 1px 0 rgba(255,255,255,.6)}
.b2-cartlane{position:absolute;left:74px;right:118px;bottom:12px;height:50px;padding:0!important;z-index:1}
.b2-cart{position:absolute;left:12px;bottom:0;width:80px;will-change:transform}
.b2-cart .ld{position:absolute;left:50%;top:-20px;transform:translateX(-50%);background:var(--ink);color:#FFE6B8;border-radius:7px;padding:1px 6px;font:900 11.5px var(--round);transition:opacity .2s;white-space:nowrap}
.b2-cart .pusher{position:absolute;left:-20px;bottom:2px;font-size:22px;line-height:1}
.b2-cart.back .pusher{left:auto;right:-20px}
.b2-cart.back svg{transform:scaleX(-1)}
.b2-cart.mv .pusher{animation:b2-walk .3s ease-in-out infinite alternate}
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
.b2-stn .top{display:flex;align-items:center;gap:7px}
.b2-stn .nm{min-width:0;display:flex;flex-direction:column;gap:3px}
.b2-stn .nm b{font:400 italic 18px/1 var(--disp);white-space:nowrap}
.b2-stn .bot{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:7px}
.b2-stn .meta{font:800 11.5px var(--round);color:var(--ink2);font-variant-numeric:tabular-nums;line-height:1.2}
.b2-stn .btns{display:flex;gap:6px;margin-top:6px}
.b2-stn .btns .b2-btn{flex:1;min-width:0;padding:7px 4px;font-size:13px!important}
.b2-sign .b2-hire{padding:7px 8px;font-size:12.5px!important;flex:none}
.b2-stn .b2-slow{position:absolute;right:6px;top:-9px;margin:0}
.b2-seat{position:relative;width:38px;height:38px;flex:none;border-radius:50%!important;display:grid;place-items:center;font-size:21px!important;background:rgba(255,244,224,.7)!important;border:2px dashed var(--wood2)!important;padding:0!important;margin-bottom:6px}
.b2-seat > i{position:absolute;left:50%;bottom:-8px;transform:translateX(-50%);font:900 8.5px var(--round);font-style:normal;white-space:nowrap;background:var(--wood2);color:#FFF3DE;border-radius:5px;padding:1px 4px}
.b2-seat:not(.on){filter:saturate(.35)}
.b2-seat.can{filter:none;animation:b2-call 1.6s ease-in-out infinite}
.b2-seat.can > i{background:var(--up)}
.b2-seat.on{background:#FFF4E0!important;border:0!important;box-shadow:0 0 0 2.5px var(--gold),0 2px 0 3px rgba(0,0,0,.12)}
.b2-seat.on > i{background:var(--gold);color:#4A2C00}
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
.b2-wk .who{display:block;font-size:34px;line-height:1;filter:drop-shadow(0 3px 1px rgba(0,0,0,.3))}
.b2-wk .carry{position:absolute;left:50%;top:-20px;transform:translateX(-50%);font-size:24px;display:none;filter:drop-shadow(0 2px 1px rgba(0,0,0,.3))}
.b2-wk.go .carry{display:block}
.b2-wk.go .who{transform:scaleX(1)}
.b2-wk.back .who{transform:scaleX(-1)}
.b2-wk .bar{position:absolute;left:2px;right:2px;top:-12px;height:7px;border-radius:9px;background:rgba(59,31,23,.45);overflow:hidden;opacity:0;transition:opacity .15s}
.b2-wk .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#9BE07A,#3FAF4E);border-radius:9px}
.b2-wk.work .bar{opacity:1}
.b2-wk.work .who{animation:b2-dig .4s ease-in-out infinite alternate;transform-origin:50% 100%}
.b2-wk.go .who,.b2-wk.back .who{animation:b2-walk .28s ease-in-out infinite alternate}
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
.b2-order.done .stamp{position:absolute;right:14px;top:30px;transform:rotate(-12deg);border:3px solid var(--up);color:var(--up);border-radius:8px;padding:2px 8px;font:900 15px var(--round)}
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
const MGR = { parcel:"🧑‍🌾", elev:"👷", cart:"🧔" };
