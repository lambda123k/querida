import sys
fake=open("fake.js").read(); game=open(sys.argv[1]).read()
html=f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Le Baron · démo</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap">
<style>:root{{--f:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;--bg:#FBF5EF}}body{{margin:0;background:#FBF5EF;font-family:var(--f)}}
.demo-bar{{position:fixed;z-index:99;right:58px;top:calc(env(safe-area-inset-top,0px) + 13px);display:flex;gap:6px}}
.demo-bar button{{border:0;border-radius:999px;padding:6px 10px;font:800 12px ui-rounded,system-ui;background:rgba(59,31,23,.82);color:#FFF3DE;box-shadow:0 2px 8px rgba(0,0,0,.25)}}
.reopen{{display:block;margin:40vh auto 0;padding:14px 22px;border:0;border-radius:14px;font:800 16px ui-rounded,system-ui;background:#CC3F27;color:#fff}}</style></head>
<body><button class="reopen" onclick="QUERIDA_GAMES.baron.open()">Ouvrir Le Baron</button>
<div class="demo-bar"><button onclick="DEMO_SKIP(3600000)" title="Faire passer 1 heure">⏩ +1 h</button><button onclick="if(confirm('Recommencer la démo de zéro ?'))DEMO_RESET()">↺</button></div>
<script>{fake}
window.QUERIDA={{role:()=>"ami",me:()=>({{id:"naim",name:"Naïm"}}),demo:()=>false,store:()=>({{client:window.supabaseFake}}),layerCount:()=>0,now:()=>Date.now()}};
</script>
<script>{game}</script>
<script>QUERIDA_GAMES.baron.open();</script>
</body></html>'''
open(sys.argv[2],"w").write(html)
