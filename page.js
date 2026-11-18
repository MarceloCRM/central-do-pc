// Página da central. Atenção: o HTML abaixo está dentro de um template literal.
// Não use crases, ${...} nem barras invertidas no JavaScript da página.
export const PAGE = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="color-scheme" content="dark light">
<title>Central do PC</title>
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0b0f0e" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#eef3f0" media="(prefers-color-scheme: light)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Central PC">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<style nonce="__NONCE__">
/* Tema "grafite terminal": fundo grafite esverdeado, destaque verde-menta, títulos e números em fonte de código. */
:root{--bg:#0b0f0e;--surface:#111816;--raised:#18221f;--card:#141c19;--line:#22302b;--text:#e3ece8;--mut:#86978f;--ok:#3ddc97;--bad:#ff7a6b;--warn:#f0b450;--acc:#3ddc97;--onacc:#04140d;--mono:ui-monospace,"Cascadia Mono","SF Mono",Menlo,Consolas,"Roboto Mono","DejaVu Sans Mono",monospace}
@media (prefers-color-scheme: light){:root{--bg:#eef3f0;--surface:#fbfdfc;--raised:#e7efea;--card:#fbfdfc;--line:#cbd8d1;--text:#0f1a16;--mut:#4f6058;--ok:#0d8152;--bad:#bf3a2b;--warn:#8a6200;--acc:#0d8152;--onacc:#fff}}
*{box-sizing:border-box}
[hidden]{display:none!important}
html,body{margin:0;background:var(--bg);color:var(--text);font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{min-height:100dvh;max-width:1040px;margin:0 auto;padding:calc(20px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(32px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left));display:grid;gap:28px;grid-template-columns:minmax(0,1fr);align-content:start}
.top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px}
h1{margin:0;font-family:var(--mono);font-size:1.2rem;font-weight:700;letter-spacing:-.01em}
h2{margin:0 0 12px;font-family:var(--mono);font-size:.9375rem;font-weight:700}
/* Ícone de cada cartão, num quadradinho com o tom do destaque. */
.panel h2{display:flex;align-items:center;gap:10px}
.cic{display:grid;place-items:center;flex:0 0 28px;width:28px;height:28px;border-radius:9px;background:color-mix(in srgb,var(--acc) 15%,transparent);color:var(--acc)}
.cic svg{width:17px;height:17px}
.meter .val,.proc .val,.facts dd,.temps dd{font-family:var(--mono)}
.pills{display:flex;flex-wrap:wrap;gap:8px}
.pill{display:inline-flex;align-items:center;gap:8px;padding:5px 11px;border:1px solid var(--line);border-radius:999px;background:var(--card);color:var(--mut);font-size:.8125rem}
.dot{width:9px;height:9px;border-radius:50%;background:var(--mut)}
.pill.on .dot{background:var(--ok)}
.pill.off .dot{background:var(--bad)}
.pill.on{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%,transparent);background:color-mix(in srgb,var(--ok) 13%,transparent)}
.pill.off{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 40%,transparent);background:color-mix(in srgb,var(--bad) 13%,transparent)}
.tabs{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:4px;width:100%;padding:4px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.tab{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:6px 12px;border:0;border-radius:7px;background:none;color:var(--mut);font:inherit;font-weight:600;cursor:pointer}
.tab:hover:not(:disabled){color:var(--text)}
.tab[aria-pressed="true"]{background:var(--acc);color:var(--onacc)}
.tab.on .dot{background:var(--ok)}
.tab.off .dot{background:var(--bad)}
.tab[aria-pressed="true"] .dot{box-shadow:0 0 0 2px var(--onacc)}
.tab:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
.tab:disabled:not([aria-pressed="true"]){opacity:.5;cursor:not-allowed}

.hero{display:flex;flex-direction:column;align-items:center;gap:18px}
#wake{position:relative;width:188px;height:188px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--text);cursor:pointer;display:grid;place-items:center;-webkit-tap-highlight-color:transparent;transition:transform .12s ease}
#wake:active:not(:disabled){transform:scale(.97)}
#wake:focus-visible{outline:3px solid var(--acc);outline-offset:4px}
#wake:disabled{cursor:default}
#wake .ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
#wake .track{fill:var(--card);stroke:var(--line);stroke-width:1.5}
#wake .load{fill:none;stroke:var(--ok);stroke-width:6;stroke-linecap:round;stroke-dasharray:100;stroke-dashoffset:100;transition:stroke-dashoffset .8s ease,stroke .3s ease;opacity:0}
#wake.pcon .load{opacity:1}
#wake.hot .load{stroke:var(--warn)}
#wake .power{position:relative;width:68px;height:68px;transition:color .2s ease}
#wake:hover:not(:disabled) .power{color:var(--acc)}
#wake:hover:not(:disabled) .track{stroke:var(--acc)}
#wake.pcon .power{color:var(--ok)}
#wake.pcon{box-shadow:0 0 40px 2px color-mix(in srgb,var(--ok) 22%,transparent)}
#wake.pcon .ring{filter:drop-shadow(0 0 8px color-mix(in srgb,var(--ok) 55%,transparent))}
#wake.busy .track{animation:pulse 1.4s ease-in-out infinite}
@keyframes pulse{50%{stroke:var(--acc)}}
#msg{min-height:3em;max-width:32ch;margin:0 auto;text-align:center;color:var(--mut)}
/* Com a central aberta, a mensagem vira um aviso flutuante acima da barra de abas (toque fecha). */
main:not(.locked) #msg:empty{display:none}
main:not(.locked) #msg:not(:empty){position:fixed;left:50%;bottom:calc(86px + env(safe-area-inset-bottom));z-index:6;transform:translateX(-50%);width:min(520px,calc(100% - 32px));max-width:none;padding:12px 16px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--text);box-shadow:0 8px 28px rgba(0,0,0,.35);cursor:pointer}
#msg.ok{color:var(--ok)}#msg.err{color:var(--bad)}#msg.warn{color:var(--warn)}

.panel{display:grid;gap:14px;min-width:0}
/* Cada seção é um cartão; dentro dele, botões e listas usam um tom acima do cartão. */
.panel section,#setup{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px;min-width:0;--card:var(--raised)}
#setup{padding:4px 16px}
/* Abas: só a seção da aba escolhida aparece (antes do login, nada disso vale). */
main:not(.locked)[data-tab="home"] [data-tab]:not([data-tab="home"]),
main:not(.locked)[data-tab="code"] [data-tab]:not([data-tab="code"]),
main:not(.locked)[data-tab="apps"] [data-tab]:not([data-tab="apps"]),
main:not(.locked)[data-tab="sys"] [data-tab]:not([data-tab="sys"]){display:none}
main:not(.locked){padding-bottom:calc(96px + env(safe-area-inset-bottom))}
.tabbar{position:fixed;left:0;right:0;bottom:0;z-index:5;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;padding:6px 8px calc(6px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:color-mix(in srgb,var(--surface) 90%,transparent);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
.tabbar button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:54px;padding:4px;border:0;border-radius:12px;background:none;color:var(--mut);font:inherit;font-size:.75rem;font-weight:600;cursor:pointer;-webkit-tap-highlight-color:transparent}
.tabbar .ico{display:grid;place-items:center;width:52px;height:30px;border-radius:999px;transition:background .15s ease}
.tabbar svg{width:22px;height:22px}
.tabbar button[aria-current="page"]{color:var(--acc)}
.tabbar button[aria-current="page"] .ico{background:color-mix(in srgb,var(--acc) 18%,transparent)}
.tabbar button:focus-visible{outline:3px solid var(--acc);outline-offset:-2px}
.state{margin:0;color:var(--mut)}
.state strong{color:var(--text);font-weight:600;font-size:1.0625rem}
.notice{margin:0;color:var(--warn)}
.panel.stale .data{opacity:.45}

.meter{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;margin:0 0 14px}
.meter:last-child{margin-bottom:0}
.meter .name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.meter .val{color:var(--mut);font-variant-numeric:tabular-nums;text-align:right}
progress{grid-column:1/-1;width:100%;height:10px;border:0;border-radius:5px;overflow:hidden;background:var(--line);-webkit-appearance:none;appearance:none}
progress::-webkit-progress-bar{background:var(--line)}
progress::-webkit-progress-value{background:var(--acc);border-radius:5px}
progress::-moz-progress-bar{background:var(--acc);border-radius:5px}
progress.high::-webkit-progress-value{background:var(--warn)}
progress.high::-moz-progress-bar{background:var(--warn)}
progress.full::-webkit-progress-value{background:var(--bad)}
progress.full::-moz-progress-bar{background:var(--bad)}

h3{margin:18px 0 8px;font-size:.875rem;font-weight:600;color:var(--mut)}
.sub{margin:-6px 0 12px;color:var(--mut);font-size:.875rem}
.cores{display:grid;grid-template-columns:repeat(auto-fit,minmax(14px,1fr));gap:3px;height:36px;margin-top:2px}
.core{position:relative;background:var(--line);border-radius:2px;overflow:hidden}
.core i{position:absolute;left:0;right:0;bottom:0;background:var(--acc)}
.core.high i{background:var(--warn)}
.procs{display:grid;gap:9px}
.proc{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:3px 12px}
.proc .pname{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.proc .pname small{color:var(--mut);font-size:.8125rem;margin-left:6px}
.proc .val{color:var(--mut);font-variant-numeric:tabular-nums}
.proc progress{height:4px}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px 20px;margin:14px 0 0}
.facts div{min-width:0}
.facts dt{color:var(--mut);font-size:.8125rem}
.facts dd{margin:0;font-variant-numeric:tabular-nums}
.temps{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:16px 20px;margin:0}
.temps div{min-width:0}
.temps dt{color:var(--mut);font-size:.8125rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.temps dd{margin:0;font-size:1.75rem;font-weight:600;line-height:1.15;font-variant-numeric:tabular-nums}
.temps dd.warm{color:var(--warn)}
.temps dd.hot{color:var(--bad)}
.empty{margin:0;color:var(--mut);font-size:.875rem}

.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.btn{min-height:46px;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;cursor:pointer;overflow-wrap:anywhere}
.btn:hover:not(:disabled){border-color:var(--acc)}
.btn:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
.btn.primary{background:var(--acc);border-color:var(--acc);color:var(--onacc);font-weight:600}
.btn.danger{color:var(--bad)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.hint{margin:10px 0 0;font-size:.8125rem;color:var(--mut)}

#shotbox{margin-top:12px;overflow:auto;border:1px solid var(--line);border-radius:8px;background:var(--card)}
#shot{display:block;width:100%;height:auto;cursor:zoom-in}
#shot.zoom{width:auto;max-width:none;cursor:zoom-out}
#shot:focus-visible{outline:3px solid var(--acc);outline-offset:-3px}

details{border-top:1px solid var(--line);padding-top:2px}
summary{cursor:pointer;padding:12px 0;color:var(--mut);font-size:.9375rem}
summary:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
details.more{border-top:0;padding-top:0;margin-top:-6px}
.more .sub{margin:2px 0 12px}
.more .facts{margin-top:2px}
.box{display:flex;flex-direction:column;gap:12px;padding:0 0 16px;max-width:380px}
label{font-size:.875rem;color:var(--mut)}
input{width:100%;padding:11px 12px;border-radius:8px;border:1px solid var(--line);background:var(--bg);color:var(--text);font:inherit}
input:focus-visible{outline:2px solid var(--acc);outline-offset:1px}
.linkish{justify-self:start;min-height:40px;padding:8px 0;border:0;background:none;color:var(--mut);font:inherit;text-decoration:underline;cursor:pointer}
.linkish:focus-visible{outline:3px solid var(--acc);outline-offset:2px}

.actions.three{grid-template-columns:repeat(3,minmax(0,1fr))}
/* Computadores da central (aba Sistema). */
.pclist{display:grid;gap:8px}
.pcrow{display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 6px 6px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card)}
.pcrow .dot{flex:0 0 auto}
.pcrow.on .dot{background:var(--ok)}.pcrow.off .dot{background:var(--bad)}
.pcrow .pcname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.btn.sm{flex:0 0 auto;min-height:40px;padding:6px 12px}
#pcsec .flabel{margin-top:16px}
.addrow{display:flex;gap:8px}
.addrow input{flex:1;min-width:0}
.addrow .btn{flex:0 0 auto}
.pcinstall .sub{margin:14px 0 8px}
.cmd{margin:0 0 10px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);font:.8125rem/1.5 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere;-webkit-user-select:all;user-select:all}
.flabel{display:block;margin:0 0 6px}
.termlist{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.termbtn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left}
.termbtn small{color:var(--mut);font-size:.8125rem}
.termbtn span,.termbtn small{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wide{width:100%;margin-top:12px}
.actions.pair{grid-template-columns:repeat(2,minmax(0,1fr))}
.chips{display:flex;gap:8px;overflow-x:auto;padding:10px 0 12px;scrollbar-width:thin}
.chip{flex:0 0 auto;min-height:36px;padding:6px 12px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--text);font:inherit;font-size:.875rem;white-space:nowrap;cursor:pointer}
.chip:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
.chip.sel{border-color:var(--acc);color:var(--acc)}

/* Explorador de pastas em tela cheia, nas cores da página. */
body.exopen{overflow:hidden}
.ex{position:fixed;inset:0;z-index:9;display:flex;flex-direction:column;background:var(--bg);color:var(--text)}
.exbar{display:flex;align-items:center;gap:10px;padding:calc(8px + env(safe-area-inset-top)) 12px 8px;border-bottom:1px solid var(--line)}
.extitle{margin:0;min-width:0;font-size:1rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.exbar .btn,.exnav .btn{flex:0 0 auto;min-height:40px;padding:6px 12px}
.exnav{display:flex;align-items:center;gap:8px;padding:8px 12px 0}
.crumbs{display:flex;align-items:center;gap:2px;min-width:0;overflow-x:auto;white-space:nowrap;scrollbar-width:none}
.crumbs::-webkit-scrollbar{display:none}
.crumb{flex:0 0 auto;min-height:38px;padding:4px 8px;border:0;border-radius:6px;background:none;color:var(--acc);font:inherit;cursor:pointer}
.crumb[aria-current]{color:var(--text);font-weight:600}
.crumb:focus-visible{outline:3px solid var(--acc);outline-offset:-2px}
.crumbs .sep{color:var(--mut)}
.explaces{padding:8px 12px}
.exstatus{margin:0;padding:0 12px 8px;color:var(--mut);font-size:.875rem}
.exstatus.err{color:var(--bad)}.exstatus.ok{color:var(--ok)}.exstatus.warn{color:var(--warn)}
.exlist{flex:1;min-height:0;overflow-y:auto;padding:0 12px 12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));gap:6px;align-content:start}
.exhead{grid-column:1/-1;margin:10px 0 2px;color:var(--mut);font-size:.8125rem;font-weight:600}
.exitem{display:flex;align-items:center;gap:10px;min-width:0;min-height:50px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);font:inherit;text-align:left}
button.exitem{cursor:pointer}
button.exitem:hover:not(:disabled){border-color:var(--acc)}
.exitem:focus-visible{outline:3px solid var(--acc);outline-offset:1px}
.exitem:disabled{opacity:.5;cursor:not-allowed}
.exitem.dim{opacity:.45}
.exitem .ico{flex:0 0 28px;width:28px;height:28px}
.exitem .ico svg{display:block;width:100%;height:100%}
.exitem.dir .ico{color:var(--warn)}
.exitem.file .ico{color:var(--mut)}
.exitem.exe .ico{color:var(--acc)}
.exitem.sess .ico{color:var(--ok)}
.vsess{display:grid;gap:6px}
#vibeagent{margin-bottom:12px}
.extext{display:flex;flex-direction:column;min-width:0}
.exname,.exmeta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.exmeta{color:var(--mut);font-size:.75rem}
.exfoot{padding:10px 12px calc(10px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--card)}
.exhere{margin:0 0 8px;color:var(--mut);font-size:.875rem}
.exfoot .sub{margin:6px 0 10px;overflow-wrap:anywhere}

/* Terminal em tela cheia. É sempre escuro, como um terminal, mesmo com a página no tema claro. */
body.tvopen{overflow:hidden}
.tv{position:fixed;left:0;top:0;z-index:10;width:100%;height:100dvh;display:flex;flex-direction:column;background:#070a09;color:#e3ece8}
.tvbar{display:flex;align-items:center;gap:8px;padding:calc(8px + env(safe-area-inset-top)) 10px 8px;border-bottom:1px solid #22302b}
.tvtitle{flex:1;min-width:0;display:flex;align-items:center;gap:8px;font-size:.875rem;white-space:nowrap}
.tvtitle .dot{flex:0 0 auto;background:#ff7a6b}
.tvtitle .dot.on{background:#3ddc97}
#tvname{overflow:hidden;text-overflow:ellipsis}
.tvbtn{min-height:38px;padding:6px 11px;border-radius:8px;border:1px solid #22302b;background:#111816;color:#e3ece8;font:inherit;font-size:.8125rem;cursor:pointer}
.tvbtn.primary{background:#3ddc97;border-color:#3ddc97;color:#04140d}
.tvbtn.danger{color:#ff7a6b}
.tvbtn:disabled{opacity:.5;cursor:not-allowed}
.tvbtn:focus-visible,.tvkeys button:focus-visible{outline:3px solid #3ddc97;outline-offset:1px}
.tvstatus{padding:6px 12px;border-bottom:1px solid #22302b;color:#86978f;font-size:.8125rem}
.tvstatus.err{color:#ff7a6b}
.tvstatus.warn{color:#f0b450}
.tvterm{flex:1;min-height:0;padding:4px 0 0 6px;overflow:hidden;touch-action:none}
.tvkeys{display:flex;gap:6px;padding:6px 8px;overflow-x:auto;border-top:1px solid #22302b;scrollbar-width:none}
.tvkeys::-webkit-scrollbar{display:none}
.tvkeys button{flex:0 0 auto;min-width:46px;min-height:40px;padding:6px 10px;border-radius:8px;border:1px solid #22302b;background:#111816;color:#e3ece8;font:inherit;font-size:.875rem;cursor:pointer;touch-action:manipulation}
.tvkeys button[aria-pressed="true"]{background:#3ddc97;border-color:#3ddc97;color:#04140d}
.tvmsg{display:flex;align-items:flex-end;gap:8px;padding:6px 8px calc(8px + env(safe-area-inset-bottom))}
.tvmsg textarea{flex:1;min-width:0;max-height:120px;padding:9px 10px;border-radius:8px;border:1px solid #22302b;background:#0b0f0e;color:#e3ece8;font:inherit;resize:none}
.tvmsg textarea:focus-visible{outline:2px solid #3ddc97;outline-offset:1px}

@media (min-width:780px){
  main{max-width:880px;padding-top:32px}
  .panel{grid-template-columns:repeat(2,minmax(0,1fr))}
  .panel > :not(.data){grid-column:1/-1}
  .tabbar{left:50%;right:auto;bottom:calc(14px + env(safe-area-inset-bottom));width:min(520px,calc(100% - 32px));transform:translateX(-50%);padding:6px;border:1px solid var(--line);border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,.3)}
  .actions{grid-template-columns:repeat(4,minmax(0,1fr))}
  .actions.programs{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media (prefers-reduced-motion: reduce){#wake,#wake .load,#wake .power{transition:none}#wake.busy .track{animation:none}}
</style>
</head>
<body>
<main id="app" class="locked">
  <header class="top">
    <h1>Central do PC</h1>
    <div class="pills">
      <div id="pill" class="pill"><span class="dot"></span><span id="pilltxt">Verificando…</span></div>
      <div id="pcpill" class="pill" hidden><span class="dot"></span><span id="pctxt"></span></div>
    </div>
    <button id="install" class="btn primary" type="button" hidden>Instalar app</button>
    <div id="pctabs" class="tabs" role="group" aria-label="Escolher o PC" hidden></div>
  </header>

  <div class="hero" data-tab="home">
    <button id="wake" type="button" aria-label="Ligar o PC com digital ou rosto">
      <svg class="ring" viewBox="0 0 188 188" aria-hidden="true">
        <circle class="track" cx="94" cy="94" r="84"/>
        <circle id="load" class="load" cx="94" cy="94" r="88" pathLength="100"/>
      </svg>
      <svg class="power" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/></svg>
    </button>
    <button id="login" class="btn primary" type="button" hidden>Entrar na central</button>
  </div>
  <div id="msg" role="status" aria-live="polite"></div>

  <div id="panel" class="panel" hidden>
    <section data-tab="home">
      <p class="state" id="state"></p>
      <p class="notice" id="notice" hidden></p>
    </section>

    <section id="termsec" data-tab="code">
      <h2><span class="cic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/></svg></span>Terminal</h2>
      <p class="notice" id="termoff" hidden>O PC não está conectado para terminais. Veja se ele está ligado e com o agente rodando.</p>
      <div class="termlist" id="termlist"></div>
      <p class="empty" id="termsempty">Nenhum terminal aberto.</p>
      <p class="hint">Reconectar e encerrar um terminal pedem a digital; digitar nele não pede.</p>
    </section>

    <section id="vibesec" data-tab="code">
      <h2><span class="cic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg></span>Vibecoding</h2>
      <div id="vibeagent" class="tabs" role="group" aria-label="Assistente de código">
        <button class="tab" type="button" data-agent="claude" aria-pressed="true">Claude</button>
        <button class="tab" type="button" data-agent="codex" aria-pressed="false">Codex</button>
      </div>
      <label class="flabel" for="cwd">Pasta</label>
      <input id="cwd" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Vazio abre na pasta do usuário">
      <div class="chips" id="cwdchips" role="group" aria-label="Pastas sugeridas"></div>
      <h3 id="vsesshead">Últimas sessões nesta pasta</h3>
      <div class="vsess" id="vsess" role="group" aria-labelledby="vsesshead"></div>
      <p class="empty" id="vsessnote" role="status" aria-live="polite"></p>
      <div class="actions pair wide">
        <button class="btn primary topen" id="vnew" type="button" data-shell="claude">Nova sessão do Claude</button>
        <button class="btn tneed" id="exopen" type="button">Explorar pastas</button>
      </div>
      <h3>Terminal nesta pasta</h3>
      <div class="actions pair">
        <button class="btn topen" type="button" data-shell="powershell">PowerShell</button>
        <button class="btn topen" type="button" data-shell="cmd">CMD</button>
      </div>
      <p class="hint">Escolha o assistente e a pasta: aparecem as 3 últimas sessões dele ali; toque numa para retomar. Ver as sessões não pede a digital; abrir, retomar e o explorador pedem. O Claude já abre com o Remote Control ligado, e a sessão aparece no app do Claude com o nome da pasta. O Codex precisa estar instalado no PC (npm i -g @openai/codex).</p>
    </section>

    <section class="data" data-tab="sys">
      <h2><span class="cic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1.5"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/></svg></span>Processador</h2>
      <div class="meter"><span class="name">Uso total</span><span class="val" id="cpuval"></span><progress id="cpu" max="100" value="0" aria-label="Uso total de CPU"></progress></div>
      <details class="more" id="cpumore">
        <summary>Detalhes do processador</summary>
        <p class="sub" id="cpuinfo" hidden></p>
        <div class="cores" id="cores" role="img" hidden></div>
        <h3>O que mais usa CPU</h3>
        <div class="procs" id="topcpu"></div>
      </details>
    </section>

    <section class="data" data-tab="sys">
      <h2><span class="cic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M7 11v2M11 11v2M15 11v2M6 17v3M18 17v3"/></svg></span>Memória</h2>
      <div class="meter"><span class="name">Em uso</span><span class="val" id="ramval"></span><progress id="ram" max="100" value="0" aria-label="Uso de memória"></progress></div>
      <details class="more" id="memmore">
        <summary>Detalhes da memória</summary>
        <dl class="facts" id="memfacts" hidden>
          <div><dt>Disponível</dt><dd id="memavail"></dd></div>
          <div><dt>Cache do sistema</dt><dd id="memcache"></dd></div>
          <div><dt>Reservada, com arquivo de paginação</dt><dd id="memcommit"></dd></div>
          <div><dt>Em execução</dt><dd id="proccount"></dd></div>
        </dl>
        <h3>O que mais usa memória</h3>
        <div class="procs" id="topmem"></div>
        <p class="hint" id="procshint">Programas com vários processos aparecem somados. Com esta página aberta, os dados atualizam a cada 5 segundos.</p>
        <p class="empty" id="procsempty" hidden>Atualize o agente neste PC para ver os processos.</p>
      </details>
    </section>

    <section class="data" data-tab="sys">
      <h2><span class="cic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/></svg></span>Temperaturas</h2>
      <dl class="temps" id="temps"></dl>
      <p class="empty" id="tempsempty" hidden>Sem leitura de temperatura no momento.</p>
    </section>

    <section class="data" data-tab="sys">
      <h2><span class="cic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></svg></span>Discos</h2>
      <div id="disks"></div>
    </section>

    <section data-tab="home">
      <h2><span class="cic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3L5 13h6l-1 8 8-10h-6l1-8z"/></svg></span>Energia</h2>
      <div class="actions">
        <button class="btn act" type="button" data-action="lock" data-label="bloquear a tela">Bloquear</button>
        <button class="btn act" type="button" data-action="sleep" data-label="suspender o PC">Suspender</button>
        <button class="btn act" type="button" data-action="restart" data-label="reiniciar o PC">Reiniciar</button>
        <button class="btn act danger" type="button" data-action="shutdown" data-label="desligar o PC">Desligar</button>
      </div>
      <p class="hint">Reiniciar e Desligar fecham os programas abertos em 10 segundos, e o que não estiver salvo se perde.</p>
    </section>

    <section data-tab="home">
      <h2><span class="cic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg></span>Repouso</h2>
      <p class="state" id="awakestate"></p>
      <div class="actions"><button class="btn act" type="button" id="awakebtn" data-action="awake-on" data-label="manter o PC acordado">Manter acordado</button></div>
      <p class="notice" id="lidnote" hidden></p>
      <p class="hint" id="powernote" hidden></p>
      <p class="hint" id="wakehint">Se o PC já estiver repousando, o botão de ligar lá em cima acorda ele pelo ESP32, desde que a placa de rede esteja liberada para isso.</p>
    </section>

    <section data-tab="apps">
      <h2><span class="cic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/></svg></span>Programas</h2>
      <div class="actions programs" id="programs"></div>
      <p class="empty" id="programsempty" hidden>Nenhum programa na lista ainda.</p>
      <button class="btn tneed wide" id="progadd" type="button">Cadastrar app</button>
      <p class="hint">Cadastrar abre o explorador para você escolher o .exe do app. Abrir e cadastrar pedem a digital.</p>
    </section>


    <section data-tab="home">
      <h2><span class="cic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></span>Tela</h2>
      <div class="actions"><button class="btn act" type="button" data-action="screenshot" data-label="capturar a tela">Capturar tela</button></div>
      <div id="shotbox" hidden><img id="shot" alt="Print da tela do PC" tabindex="0"></div>
      <p class="hint" id="shothint" hidden>Toque na imagem para ampliar. O print é apagado do servidor em 10 minutos.</p>
    </section>

    <section id="pcsec" data-tab="sys">
      <h2><span class="cic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 19h20"/></svg></span>Computadores</h2>
      <div class="pclist" id="pcmanage" role="group" aria-label="Computadores da central"></div>
      <label class="flabel" for="pcname">Adicionar computador</label>
      <div class="addrow">
        <input id="pcname" type="text" maxlength="24" autocomplete="off" spellcheck="false" placeholder="Nome, como Notebook">
        <button class="btn primary" id="pcadd" type="button">Adicionar</button>
      </div>
      <div id="pcinstall" class="pcinstall" hidden>
        <p class="sub">Para ligar o <strong id="pcinstfor"></strong> à central: nele, baixe este projeto do GitHub, abra o PowerShell na pasta do projeto e rode:</p>
        <pre class="cmd" id="pccmd"></pre>
        <button class="btn" id="pccopy" type="button">Copiar comando</button>
        <p class="hint">O comando leva a chave desse PC: não mande para ninguém. O PC precisa do Node.js 22 ou mais novo.</p>
      </div>
      <p class="hint">Adicionar, remover e ver o comando pedem a digital. Remover tira o PC da central na hora; se você adicionar de novo, ele ganha uma chave nova. O Desktop é o PC que o ESP32 liga e não pode ser removido.</p>
    </section>

    <button id="logout" class="linkish" type="button" data-tab="sys">Sair da central</button>
  </div>

  <nav id="tabbar" class="tabbar" aria-label="Seções" hidden>
    <button type="button" data-go="home"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v8"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/></svg></span>Início</button>
    <button type="button" data-go="code"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 8l-4 4 4 4"/><path d="M16 8l4 4-4 4"/><path d="M13.5 5l-3 14"/></svg></span>Código</button>
    <button type="button" data-go="apps"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/></svg></span>Apps</button>
    <button type="button" data-go="sys"><span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg></span>Sistema</button>
  </nav>

  <details id="setup" data-tab="sys">
    <summary>Configurar aparelhos</summary>
    <div class="box">
      <p class="hint" id="installios" hidden>Para instalar como app no iPhone: no Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.</p>
      <label for="token">Token de configuração</label>
      <input id="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">
      <button id="reg" class="btn primary" type="button">Cadastrar este aparelho</button>
      <button id="reset" class="btn danger" type="button">Remover todos os aparelhos</button>
      <p class="hint">O cadastro usa a digital, o rosto ou o PIN deste aparelho. O token é o valor do secret SETUP_TOKEN.</p>
    </div>
  </details>
</main>

<div id="ex" class="ex" role="dialog" aria-modal="true" aria-labelledby="extitle" hidden>
  <div class="exbar">
    <button id="exclose" class="btn" type="button">Fechar</button>
    <h2 id="extitle" class="extitle"></h2>
  </div>
  <div class="exnav">
    <button id="exup" class="btn" type="button" aria-label="Ir para a pasta de cima">Subir</button>
    <nav id="excrumbs" class="crumbs" aria-label="Caminho da pasta"></nav>
  </div>
  <div id="explaces" class="chips explaces" role="group" aria-label="Atalhos"></div>
  <p id="exstatus" class="exstatus" role="status" aria-live="polite" hidden></p>
  <div id="exlist" class="exlist" role="group" aria-label="Conteúdo da pasta"></div>
  <div id="exterm" class="exfoot">
    <p class="exhere">Abrir terminal nesta pasta</p>
    <div class="actions three">
      <button class="btn primary exopenterm" id="exagent" type="button" data-shell="claude">Claude</button>
      <button class="btn exopenterm" type="button" data-shell="powershell">PowerShell</button>
      <button class="btn exopenterm" type="button" data-shell="cmd">CMD</button>
    </div>
  </div>
  <div id="expick" class="exfoot" hidden>
    <p class="exhere" id="expickmsg">Navegue até a pasta do app e toque no arquivo .exe dele.</p>
    <div id="expickform" hidden>
      <label class="flabel" for="exlabel">Nome do app</label>
      <input id="exlabel" type="text" maxlength="40" autocomplete="off" spellcheck="false">
      <p class="sub" id="expickfile"></p>
      <div class="actions pair">
        <button class="btn primary" id="exadd" type="button">Cadastrar</button>
        <button class="btn" id="excancel" type="button">Escolher outro</button>
      </div>
    </div>
  </div>
</div>

<div id="tv" class="tv" hidden>
  <div class="tvbar">
    <button id="tvback" class="tvbtn" type="button">Voltar</button>
    <div class="tvtitle"><span id="tvdot" class="dot"></span><span id="tvname"></span></div>
    <button id="tvsmaller" class="tvbtn" type="button" aria-label="Diminuir a letra">A−</button>
    <button id="tvbigger" class="tvbtn" type="button" aria-label="Aumentar a letra">A+</button>
    <button id="tvkill" class="tvbtn danger" type="button">Encerrar</button>
  </div>
  <div id="tvstatus" class="tvstatus" role="status" aria-live="polite" hidden></div>
  <div id="tvterm" class="tvterm"></div>
  <div id="tvkeys" class="tvkeys" role="toolbar" aria-label="Teclas extras">
    <button type="button" data-k="esc">Esc</button>
    <button type="button" data-k="tab">Tab</button>
    <button type="button" data-k="stab">⇧Tab</button>
    <button type="button" data-k="ctrl" id="tvctrl" aria-pressed="false">Ctrl</button>
    <button type="button" data-k="up" aria-label="Seta para cima">↑</button>
    <button type="button" data-k="down" aria-label="Seta para baixo">↓</button>
    <button type="button" data-k="left" aria-label="Seta para a esquerda">←</button>
    <button type="button" data-k="right" aria-label="Seta para a direita">→</button>
    <button type="button" data-k="ctrlc">Ctrl+C</button>
    <button type="button" data-k="enter">Enter</button>
    <button type="button" data-k="paste">Colar</button>
  </div>
  <div class="tvmsg">
    <textarea id="tvinput" rows="1" placeholder="Mensagem ou comando" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Mensagem para o terminal"></textarea>
    <button id="tvsend" class="tvbtn primary" type="button">Enviar</button>
  </div>
</div>

<script nonce="__NONCE__">
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var app = $('app'), wakeBtn = $('wake'), msg = $('msg'), pill = $('pill'), pillTxt = $('pilltxt');
  var regBtn = $('reg'), resetBtn = $('reset'), tokenIn = $('token'), setup = $('setup');
  var loginBtn = $('login'), logoutBtn = $('logout'), panel = $('panel'), pcPill = $('pcpill'), pcTxt = $('pctxt');
  var shot = $('shot'), shotBox = $('shotbox'), shotHint = $('shothint');
  var authed = false, agentOnline = false, busy = false, registered = false, lastPrograms = null;

  // Terminal. Lembrete: nada de barra invertida neste script, então os caracteres
  // de controle saem de String.fromCharCode.
  var ESC = String.fromCharCode(27), CR = String.fromCharCode(13), LF = String.fromCharCode(10), BSL = String.fromCharCode(92);
  var KEYS = {
    esc: ESC, tab: String.fromCharCode(9), stab: ESC + '[Z', enter: CR, ctrlc: String.fromCharCode(3),
    up: ESC + '[A', down: ESC + '[B', right: ESC + '[C', left: ESC + '[D'
  };
  var SHELLS = { claude: 'Claude', codex: 'Codex', powershell: 'PowerShell', cmd: 'CMD' };
  var tv = $('tv'), tvBox = $('tvterm'), tvStatus = $('tvstatus'), tvName = $('tvname'), tvDot = $('tvdot');
  var tvInput = $('tvinput'), tvCtrl = $('tvctrl'), tvKillBtn = $('tvkill'), cwdIn = $('cwd');
  var tunnel = false, termList = [], lastTerms = null, lastFolders = null, xtermLoading = null, ticks = 0;
  // PC em uso e a lista de PCs, como vêm do /api/pc. 'disks' alimenta os atalhos do explorador.
  var curPc = null, pcList = [], lastTabs = null, canWake = true, disks = [];
  // Explorador: modo 'browse' (abrir terminal) ou 'pick' (escolher o .exe de um app novo).
  var ex = $('ex');
  var X = { mode: null, path: null, seq: 0, sessions: [], full: null, opener: null };
  // Vibecoding: o assistente escolhido e as últimas sessões dele na pasta do campo (V.path, V.agent).
  var vibe = store('vibe') === 'codex' ? 'codex' : 'claude';
  var V = { seq: 0, ctx: null, timer: null, path: '', agent: vibe, sessions: [] };
  // T.id é o terminal aberto na tela cheia (null = tela fechada).
  var T = { id: null, term: null, fit: null, ws: null, ended: false, ctrl: false, retry: 0, timer: null, beat: null, fitTimer: null, pongAt: 0 };

  function enc(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
  }
  function dec(str) {
    var s = str.replaceAll('-', '+').replaceAll('_', '/');
    while (s.length % 4) s += '=';
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function say(text, kind) {
    msg.textContent = text || '';
    msg.className = kind || '';
  }

  function friendly(e) {
    if (e && e.name === 'NotAllowedError') return 'Cancelado ou tempo esgotado.';
    if (e && e.name === 'InvalidStateError') return 'Este aparelho já está cadastrado.';
    if (e && e.name === 'SecurityError') return 'A página precisa de HTTPS e do domínio correto.';
    return (e && e.message) ? e.message : 'Algo deu errado.';
  }

  async function api(path, body) {
    var opts = { cache: 'no-store' };
    if (body) {
      opts.method = 'POST';
      opts.headers = { 'content-type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    var r = await fetch(path, opts);
    var data = {};
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) {
      var err = new Error(data.error || ('Erro ' + r.status));
      err.status = r.status;
      throw err;
    }
    return data;
  }

  // Pede a digital para o desafio em 'o' e devolve os campos que o Worker verifica.
  async function assertion(o) {
    if (!window.PublicKeyCredential) throw new Error('Este navegador não suporta passkeys.');
    var cred = await navigator.credentials.get({ publicKey: {
      challenge: dec(o.challenge),
      rpId: o.rpId,
      timeout: 60000,
      userVerification: 'required',
      allowCredentials: o.allowCredentials.map(function (id) { return { type: 'public-key', id: dec(id) }; })
    }});
    var r = cred.response;
    return {
      chId: o.chId,
      credentialId: enc(cred.rawId),
      clientDataJSON: enc(r.clientDataJSON),
      authenticatorData: enc(r.authenticatorData),
      signature: enc(r.signature)
    };
  }

  /* ---------- Formatação ---------- */

  function num(v, digits) {
    return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: digits || 0 });
  }
  function duration(sec) {
    var m = Math.floor(sec / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return d + (d === 1 ? ' dia ' : ' dias ') + (h % 24) + ' h';
    if (h > 0) return h + ' h ' + (m % 60) + ' min';
    return m + ' min';
  }
  function ago(ms) {
    var s = Math.round(ms / 1000);
    if (s < 60) return s + ' s';
    return duration(s);
  }
  function setProgress(el, pct) {
    pct = Math.max(0, Math.min(100, Number(pct) || 0));
    el.value = pct;
    el.classList.toggle('high', pct >= 80 && pct < 95);
    el.classList.toggle('full', pct >= 95);
  }

  /* ---------- Painel ---------- */

  function setAuthed(on) {
    authed = on;
    app.classList.toggle('locked', !on);
    $('tabbar').hidden = !on;
    panel.hidden = !on;
    pcPill.hidden = !on;
    loginBtn.hidden = on || !registered;
    if (!on) {
      agentOnline = false;
      tunnel = false;
      canWake = true;
      curPc = null;
      pcList = [];
      lastTabs = null;
      V.ctx = null;
      showInstall(null);
      exHide();
      wakeBtn.classList.remove('pcon', 'hot');
      wakeBtn.disabled = false;
      wakeBtn.setAttribute('aria-label', 'Ligar o PC com digital ou rosto');
      tvHide();
    }
    renderTabs();
    if (!on) loadSessions();
    updateButtons();
  }

  function updateButtons() {
    var off = busy || !agentOnline;
    document.querySelectorAll('.act').forEach(function (b) { b.disabled = off; });
    document.querySelectorAll('.topen').forEach(function (b) { b.disabled = busy || !tunnel; });
    document.querySelectorAll('.termbtn').forEach(function (b) { b.disabled = busy; });
    document.querySelectorAll('.tneed, .exopenterm, .exitem.sess').forEach(function (b) { b.disabled = busy || !tunnel; });
    document.querySelectorAll('.tab, #exadd, #pcsec .btn').forEach(function (b) { b.disabled = busy; });
    $('tvkill').disabled = busy;
    logoutBtn.disabled = busy;
  }

  function renderTemps(list) {
    var box = $('temps');
    box.textContent = '';
    (list || []).forEach(function (t) {
      var wrap = document.createElement('div');
      var dt = document.createElement('dt');
      var dd = document.createElement('dd');
      dt.textContent = t.name;
      dt.title = t.name;
      dd.textContent = num(t.c) + '°C';
      if (t.c >= 90) dd.className = 'hot';
      else if (t.c >= 80) dd.className = 'warm';
      wrap.appendChild(dt);
      wrap.appendChild(dd);
      box.appendChild(wrap);
    });
    $('tempsempty').hidden = !!(list && list.length);
  }

  function renderProcs(box, list, labelOf, percentOf) {
    box.textContent = '';
    list.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'proc';
      var name = document.createElement('span');
      name.className = 'pname';
      name.title = p.n;
      name.textContent = p.n;
      if (p.k > 1) {
        var count = document.createElement('small');
        count.textContent = p.k + ' processos';
        name.appendChild(count);
      }
      var val = document.createElement('span');
      val.className = 'val';
      val.textContent = labelOf(p);
      var bar = document.createElement('progress');
      bar.max = 100;
      bar.value = Math.max(0, Math.min(100, percentOf(p)));
      bar.setAttribute('aria-label', p.n);
      row.appendChild(name);
      row.appendChild(val);
      row.appendChild(bar);
      box.appendChild(row);
    });
  }

  function renderCores(list) {
    var box = $('cores');
    box.hidden = !(list && list.length);
    if (box.hidden) return;
    box.setAttribute('aria-label', 'Uso de cada uma das ' + list.length + ' threads do processador');
    if (box.children.length !== list.length) {
      box.textContent = '';
      list.forEach(function () {
        var c = document.createElement('div');
        c.className = 'core';
        c.appendChild(document.createElement('i'));
        box.appendChild(c);
      });
    }
    list.forEach(function (pct, i) {
      var c = box.children[i];
      pct = Math.max(0, Math.min(100, Number(pct) || 0));
      c.firstChild.style.height = pct + '%';
      c.title = 'Thread ' + (i + 1) + ': ' + pct + '%';
      c.classList.toggle('high', pct >= 90);
    });
  }

  function renderDetails(m) {
    var info = m.cpuInfo;
    $('cpuinfo').hidden = !info;
    if (info) $('cpuinfo').textContent = info.name + ', ' + info.cores + ' núcleos e ' + info.threads + ' threads';
    renderCores(m.cores);

    var hasProcs = !!(m.procs && m.procs.length);
    $('procsempty').hidden = hasProcs;
    $('procshint').hidden = !hasProcs;
    var byCpu = (m.procs || []).slice().sort(function (a, b) { return b.c - a.c; }).slice(0, 8);
    var byMem = (m.procs || []).slice().sort(function (a, b) { return b.m - a.m; }).slice(0, 8);
    var totalMb = m.ram && m.ram.totalGB ? m.ram.totalGB * 1024 : 0;
    renderProcs($('topcpu'), byCpu, function (p) { return num(p.c, 1) + '%'; }, function (p) { return p.c; });
    renderProcs($('topmem'), byMem, function (p) {
      return p.m >= 1024 ? num(p.m / 1024, 1) + ' GB' : num(p.m) + ' MB';
    }, function (p) { return totalMb ? p.m / totalMb * 100 : 0; });

    var r = m.ram || {};
    var hasMem = r.availableGB !== undefined;
    $('memfacts').hidden = !hasMem;
    if (hasMem) {
      $('memavail').textContent = num(r.availableGB, 1) + ' GB';
      $('memcache').textContent = num(r.cacheGB, 1) + ' GB';
      $('memcommit').textContent = num(r.commitGB, 1) + ' de ' + num(r.commitLimitGB, 1) + ' GB';
      $('proccount').textContent = num(m.processCount) + ' processos';
    }
  }

  function renderDisks(list) {
    disks = list || [];
    var box = $('disks');
    box.textContent = '';
    (list || []).forEach(function (d) {
      var row = document.createElement('div');
      row.className = 'meter';
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = d.label ? d.name + ' ' + d.label : d.name;
      var val = document.createElement('span');
      val.className = 'val';
      val.textContent = num(d.freeGB) + ' GB livres de ' + num(d.totalGB);
      var bar = document.createElement('progress');
      bar.max = 100;
      bar.setAttribute('aria-label', 'Uso do disco ' + d.name);
      setProgress(bar, d.totalGB ? (1 - d.freeGB / d.totalGB) * 100 : 0);
      row.appendChild(name);
      row.appendChild(val);
      row.appendChild(bar);
      box.appendChild(row);
    });
  }

  var LID = { 1: 'suspende', 2: 'hiberna', 3: 'desliga' };

  function renderAwake(m) {
    var on = m.awake === true, b = $('awakebtn'), p = m.power;
    b.dataset.action = on ? 'awake-off' : 'awake-on';
    b.dataset.label = on ? 'deixar o PC repousar de novo' : 'manter o PC acordado';
    b.textContent = on ? 'Deixar repousar' : 'Manter acordado';
    $('awakestate').textContent = on
      ? 'O PC não repousa sozinho enquanto isto estiver ligado, mesmo depois de reiniciar.'
      : 'O PC repousa sozinho quando fica parado, como de costume.';

    // Notebook: a tampa tem configuração própria e continua valendo.
    var lid = p ? (p.ac ? p.lidAc : p.lidDc) : 0;
    var lidNote = $('lidnote');
    lidNote.hidden = !(on && p && lid !== 0);
    if (!lidNote.hidden) {
      lidNote.textContent = 'Fechar a tampa ainda ' + (LID[lid] || 'pode suspender') + ' o notebook. Para mudar, no PC: Painel de Controle, Opções de Energia, "Escolher a função do fechamento da tampa", Não fazer nada.';
    }
    var powerNote = $('powernote');
    powerNote.hidden = !p;
    if (p) {
      powerNote.textContent = (p.ac ? 'Na tomada, ' : 'Na bateria, ') + p.pct + '% de carga.' +
        (on && !p.ac ? ' Com a bateria quase no fim, o Windows hiberna mesmo assim.' : '');
    }
  }

  function renderPrograms(list) {
    list = list || [];
    var key = JSON.stringify(list);
    if (key === lastPrograms) return;
    lastPrograms = key;
    var box = $('programs');
    box.textContent = '';
    list.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn act';
      b.textContent = p.label;
      b.dataset.action = 'run';
      b.dataset.arg = p.id;
      b.dataset.label = 'abrir ' + p.label;
      box.appendChild(b);
    });
    $('programsempty').hidden = list.length > 0;
    updateButtons();
  }

  function pcLabel() {
    var p = pcList.filter(function (x) { return x.id === curPc; })[0];
    return p ? p.label : 'PC';
  }

  // Abas dos PCs. A do PC em uso fica marcada; trocar de aba pede a digital.
  function renderTabs() {
    var box = $('pctabs');
    box.hidden = !authed || pcList.length < 2;
    var key = JSON.stringify([curPc, pcList]);
    if (key === lastTabs) return;
    lastTabs = key;
    box.textContent = '';
    pcList.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tab ' + (p.online ? 'on' : 'off');
      b.dataset.pc = p.id;
      b.setAttribute('aria-pressed', p.id === curPc ? 'true' : 'false');
      b.setAttribute('aria-label', p.label + (p.online ? ', ligado' : ', sem resposta'));
      var dot = document.createElement('span');
      dot.className = 'dot';
      var name = document.createElement('span');
      name.textContent = p.label;
      b.appendChild(dot);
      b.appendChild(name);
      box.appendChild(b);
    });
    renderPcManage();
    updateButtons();
  }

  /* ---------- Computadores da central (aba Sistema) ---------- */

  var pcInstall = null;   // PC cujo comando de instalação está na tela: { pc, label, key }

  function renderPcManage() {
    var box = $('pcmanage');
    box.textContent = '';
    pcList.forEach(function (p) {
      var row = document.createElement('div');
      row.className = 'pcrow ' + (p.online ? 'on' : 'off');
      var dot = document.createElement('span');
      dot.className = 'dot';
      var name = document.createElement('span');
      name.className = 'pcname';
      name.textContent = p.label + (p.id === 'desktop' ? ' · liga pelo ESP32' : '');
      row.appendChild(dot);
      row.appendChild(name);
      var inst = document.createElement('button');
      inst.type = 'button';
      inst.className = 'btn sm';
      inst.dataset.key = p.id;
      inst.textContent = 'Instalar';
      inst.setAttribute('aria-label', 'Ver o comando de instalação do ' + p.label);
      row.appendChild(inst);
      if (p.id !== 'desktop') {
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'btn sm danger';
        rm.dataset.remove = p.id;
        rm.textContent = 'Remover';
        rm.setAttribute('aria-label', 'Remover o ' + p.label + ' da central');
        row.appendChild(rm);
      }
      box.appendChild(row);
    });
    if (pcInstall && !pcList.some(function (p) { return p.id === pcInstall.pc; })) showInstall(null);
  }

  function showInstall(info) {
    pcInstall = info;
    $('pcinstall').hidden = !info;
    $('pccmd').textContent = info
      ? 'powershell -ExecutionPolicy Bypass -File agent' + BSL + 'install.ps1 -Url ' + location.origin + ' -Pc ' + info.pc + ' -Secret ' + info.key
      : '';
    $('pcinstfor').textContent = info ? info.label : '';
  }

  // Adicionar, remover e ver a chave de um PC: pede a digital e devolve a resposta (ou null).
  async function pcManage(action, arg, prompt) {
    if (busy) return null;
    setBusy(true);
    try {
      var res = await termAction(action, arg, prompt, say);
      say('');
      return res;
    } catch (e) {
      if (e.status === 401) setAuthed(false);
      say(friendly(e), 'err');
      return null;
    } finally {
      setBusy(false);
    }
  }

  function renderPc(info) {
    agentOnline = !!info.agentOnline;
    curPc = info.pc || null;
    pcList = info.pcs || [];
    canWake = info.canWake !== false;
    renderTabs();
    var m = info.metrics;
    pcPill.className = 'pill ' + (agentOnline ? 'on' : 'off');
    pcTxt.textContent = pcLabel() + (agentOnline ? ' ligado' : ' sem resposta');
    panel.classList.toggle('stale', !agentOnline);

    wakeBtn.classList.toggle('pcon', agentOnline);
    wakeBtn.disabled = agentOnline || busy || !canWake;
    wakeBtn.setAttribute('aria-label', agentOnline ? 'O ' + pcLabel() + ' já está ligado'
      : (canWake ? 'Ligar o PC com digital ou rosto' : 'O ' + pcLabel() + ' não liga pelo ESP32'));
    $('wakehint').hidden = !canWake;

    var stateEl = $('state'), notice = $('notice');
    stateEl.textContent = '';
    notice.hidden = agentOnline;
    if (!agentOnline) {
      notice.textContent = info.lastSeen
        ? 'O PC está desligado, suspenso ou sem rede. Última resposta há ' + ago(Date.now() - info.lastSeen) + '.'
        : 'O agente deste PC ainda não respondeu.';
    }
    if (m) {
      var main = document.createElement('strong');
      main.textContent = agentOnline ? 'Ligado há ' + duration(m.uptimeSec || 0) : 'Últimos dados recebidos';
      stateEl.appendChild(main);
      var session = m.session === 'active' ? 'Sessão aberta' : (m.session === 'locked' ? 'Tela bloqueada' : 'Ninguém entrou no Windows');
      if (agentOnline) stateEl.appendChild(document.createTextNode('. ' + session + '.'));

      setProgress($('cpu'), m.cpu);
      $('cpuval').textContent = num(m.cpu) + '%';
      $('load').setAttribute('stroke-dashoffset', String(100 - Math.max(0, Math.min(100, Number(m.cpu) || 0))));
      $('load').style.strokeDashoffset = String(100 - Math.max(0, Math.min(100, Number(m.cpu) || 0)));
      wakeBtn.classList.toggle('hot', Number(m.cpu) >= 85);
      if (m.ram) {
        setProgress($('ram'), m.ram.totalGB ? m.ram.usedGB / m.ram.totalGB * 100 : 0);
        $('ramval').textContent = num(m.ram.usedGB, 1) + ' de ' + num(m.ram.totalGB) + ' GB';
      }
      renderDetails(m);
      renderTemps(m.temps);
      renderDisks(m.disks);
      renderPrograms(m.programs);
      renderFolders(m.folders);
      renderAwake(m);
    }
    renderTerms(info);
    var ctx = curPc + '|' + tunnel;
    if (ctx !== V.ctx) { V.ctx = ctx; loadSessions(); }
    updateButtons();
  }

  function showStatus(s) {
    registered = !!s.registered;
    pill.className = 'pill ' + (s.deviceOnline ? 'on' : 'off');
    pillTxt.textContent = s.deviceOnline ? 'ESP32 online' : 'ESP32 offline';
    loginBtn.hidden = authed || !registered;
    if (!registered) {
      setup.open = true;
      if (!msg.textContent) say('Nenhum aparelho cadastrado ainda. Use a seção Configurar aparelhos.', 'warn');
    }
    return s;
  }

  async function refreshPc() {
    try {
      var info = await api('/api/pc');
      var fresh = !authed;
      if (fresh) setAuthed(true);
      renderPc(info);
      if (fresh) restoreTerm();
    } catch (e) {
      if (e.status === 401) {
        if (authed) say('Sua sessão terminou. Entre de novo para ver o PC.', 'warn');
        setAuthed(false);
      }
    }
  }

  async function refresh() {
    try { showStatus(await api('/api/status')); }
    catch (e) { pill.className = 'pill off'; pillTxt.textContent = 'Sem conexão'; }
    await refreshPc();
  }

  /* ---------- Ações ---------- */

  function setBusy(on) {
    busy = on;
    wakeBtn.classList.toggle('busy', on && !agentOnline);
    wakeBtn.disabled = on || agentOnline || !canWake;
    loginBtn.disabled = on;
    updateButtons();
  }

  async function wake() {
    setBusy(true);
    try {
      say('Confirme com digital ou rosto…');
      var o = await api('/api/wake/options', {});
      await api('/api/wake/verify', await assertion(o));
      say('Autorizado. Avisando o ESP32…', 'ok');
      for (var i = 0; i < 20; i++) {
        await sleep(1500);
        var s = showStatus(await api('/api/status'));
        if (!s.pending) { say('O ESP32 recebeu o comando. O PC deve ligar em instantes.', 'ok'); return; }
      }
      say('Autorizado, mas o ESP32 ainda não buscou o comando. Veja se ele está online.', 'warn');
    } catch (e) {
      say(friendly(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    setBusy(true);
    try {
      say('Confirme com digital ou rosto…');
      var o = await api('/api/login/options', { pc: store('pc') || '' });
      await api('/api/login/verify', await assertion(o));
      say('');
      setBusy(false);
      await refreshPc();
    } catch (e) {
      say(friendly(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    store('tvterm', '');   // saiu de propósito: não volta para o terminal no próximo login
    tvHide();
    try { await api('/api/logout', {}); } catch (e) {}
    shot.removeAttribute('src');
    shotBox.hidden = true;
    shotHint.hidden = true;
    say('Você saiu da central.');
    setAuthed(false);
  }

  function act(btn) {
    runAction(btn.dataset.action, btn.dataset.arg || null, btn.dataset.label, say);
  }

  // Ação que vira comando para o agente: pede a digital e espera o PC responder. Devolve se deu certo.
  async function runAction(action, arg, label, sayFn) {
    setBusy(true);
    try {
      sayFn('Confirme com digital ou rosto para ' + label + '.');
      var req = { action: action };
      if (arg) req.arg = arg;
      var o = await api('/api/action/options', req);
      var sent = await api('/api/action/verify', await assertion(o));
      sayFn('Autorizado. Aguardando o PC…');
      var waitTurns = action === 'screenshot' ? 40 : 25;
      for (var i = 0; i < waitTurns; i++) {
        await sleep(1500);
        var s = await api('/api/action/status?id=' + encodeURIComponent(sent.id));
        if (s.state === 'done') {
          sayFn(s.message || 'Feito.', 'ok');
          if (action === 'screenshot') {
            shot.classList.remove('zoom');
            shot.src = '/api/pc/screenshot?id=' + encodeURIComponent(sent.id);
            shotBox.hidden = false;
            shotHint.hidden = false;
          }
          return true;
        }
        if (s.state === 'failed') { sayFn(s.message || 'O PC não conseguiu fazer isso.', 'err'); return false; }
        if (s.state === 'expired' || s.state === 'lost') {
          sayFn('O PC não respondeu a tempo, então o comando foi cancelado.', 'warn');
          return false;
        }
      }
      sayFn('O PC não respondeu a tempo. Veja se ele continua ligado.', 'warn');
    } catch (e) {
      if (e.status === 401) { setAuthed(false); say(friendly(e), 'err'); }
      else sayFn(friendly(e), 'err');
    } finally {
      setBusy(false);
      refreshPc();
    }
    return false;
  }

  // Trocar de PC pede a digital. O que é do PC anterior (terminal, explorador, print) sai da tela.
  async function switchPc(id) {
    if (id === curPc || busy) return;
    var p = pcList.filter(function (x) { return x.id === id; })[0];
    setBusy(true);
    try {
      await termAction('pc-switch', id, 'Confirme com digital ou rosto para trocar para o ' + (p ? p.label : id) + '.', say);
      store('pc', id);
      tvHide();
      exHide();
      shot.removeAttribute('src');
      shotBox.hidden = true;
      shotHint.hidden = true;
      lastPrograms = lastTerms = lastFolders = null;
      say('');
      setBusy(false);
      await refreshPc();
    } catch (e) {
      if (e.status === 401) setAuthed(false);
      say(friendly(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Terminal: lista e pastas no painel ---------- */

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {}
    return null;
  }

  function baseName(p) {
    if (!p) return 'pasta do usuário';
    var parts = p.split(BSL).join('/').split('/').filter(function (x) { return x; });
    return parts.length ? parts[parts.length - 1] : p;
  }

  function termLabel(t) {
    return (SHELLS[t.shell] || t.shell) + ' · ' + baseName(t.cwd);
  }

  function renderTerms(info) {
    tunnel = !!info.tunnel;
    termList = info.terms || [];
    $('termoff').hidden = tunnel;
    var key = JSON.stringify(termList);
    if (key === lastTerms) return;
    lastTerms = key;
    var box = $('termlist');
    box.textContent = '';
    termList.forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn termbtn';
      b.dataset.id = t.id;
      b.title = t.cwd || '';
      var name = document.createElement('span');
      name.textContent = termLabel(t);
      var sub = document.createElement('small');
      sub.textContent = t.granted ? 'Toque para voltar a ele' : 'Pede a digital para reconectar';
      b.appendChild(name);
      b.appendChild(sub);
      box.appendChild(b);
    });
    $('termsempty').hidden = termList.length > 0;
  }

  function markFolder() {
    var cur = cwdIn.value.trim().toLowerCase();
    document.querySelectorAll('#cwdchips .chip').forEach(function (c) {
      c.classList.toggle('sel', c.dataset.path.toLowerCase() === cur);
    });
  }

  function renderFolders(list) {
    list = list || [];
    var key = JSON.stringify(list);
    if (key === lastFolders) return;
    lastFolders = key;
    var box = $('cwdchips');
    box.textContent = '';
    list.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.path = p;
      b.title = p;
      b.textContent = baseName(p);
      box.appendChild(b);
    });
    markFolder();
  }

  function setCwd(p) {
    cwdIn.value = p || '';
    store('cwd', cwdIn.value.trim());
    markFolder();
    loadSessions();
  }

  /* ---------- Vibecoding: Claude ou Codex e as últimas sessões da pasta ---------- */

  function sessItem(s) {
    var b = exItem('button', 'sess', s.title, 'há ' + ago(Date.now() - s.at) + (s.prompt && s.prompt !== s.title ? ' · ' + s.prompt : ''));
    b.dataset.session = s.id;
    b.title = 'Retomar: ' + (s.prompt || s.title);
    return b;
  }

  function renderVibe() {
    document.querySelectorAll('#vibeagent .tab').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.agent === vibe ? 'true' : 'false');
    });
    $('vnew').dataset.shell = vibe;
    $('vnew').textContent = 'Nova sessão do ' + SHELLS[vibe];
    $('exagent').dataset.shell = vibe;
    $('exagent').textContent = SHELLS[vibe];
  }

  // As últimas sessões do assistente escolhido na pasta do campo. Só leitura: não pede a digital.
  async function loadSessions() {
    clearTimeout(V.timer);
    var seq = ++V.seq, p = cwdIn.value.trim(), agent = vibe;
    var box = $('vsess'), note = $('vsessnote');
    if (!authed || !tunnel) {
      box.textContent = '';
      V.sessions = [];
      note.textContent = authed ? 'As sessões aparecem quando o PC estiver conectado.' : '';
      return;
    }
    note.textContent = 'Procurando sessões…';
    try {
      var r = await api('/api/sessions?agent=' + agent + '&path=' + encodeURIComponent(p));
      if (seq !== V.seq) return;
      V.path = p;
      V.agent = agent;
      V.sessions = r.sessions || [];
      box.textContent = '';
      V.sessions.forEach(function (s) { box.appendChild(sessItem(s)); });
      note.textContent = V.sessions.length ? '' : 'Nenhuma sessão do ' + SHELLS[agent] + ' nesta pasta ainda.';
      updateButtons();
    } catch (e) {
      if (seq !== V.seq) return;
      box.textContent = '';
      V.sessions = [];
      note.textContent = friendly(e);
    }
  }

  /* ---------- Explorador de pastas ---------- */
  // Funciona pela mesma conexão dos terminais (o agente lista a pasta), sem bibliotecas de fora.

  var ICONS = {
    dir: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2h8.4A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>',
    exe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18"/><path d="M8 12l3 2.5L8 17"/><path d="M13 17h3"/></svg>',
    sess: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H10l-6 4z"/></svg>'
  };

  function exSay(text, kind) {
    var el = $('exstatus');
    el.textContent = text || '';
    el.className = 'exstatus' + (kind ? ' ' + kind : '');
    el.hidden = !text;
  }

  // Abrir o explorador pede a digital; ele vale para o PC em uso até trocar de PC ou sair.
  async function exOpen(mode, opener) {
    setBusy(true);
    try {
      await termAction('fs-open', null, 'Confirme com digital ou rosto para abrir o explorador do ' + pcLabel() + '.', say);
      say('');
      X.mode = mode;
      X.opener = opener || null;
      X.path = null;
      $('extitle').textContent = (mode === 'pick' ? 'Escolha o .exe do app' : 'Explorador') + ' · ' + pcLabel();
      $('exterm').hidden = mode !== 'browse';
      $('expick').hidden = mode !== 'pick';
      $('excrumbs').textContent = '';
      $('exlist').textContent = '';
      exPick(null);
      renderPlaces();
      ex.hidden = false;
      document.body.classList.add('exopen');
      $('exclose').focus();
      exGo(mode === 'pick' ? '%ProgramFiles%' : cwdIn.value.trim());
    } catch (e) {
      if (e.status === 401) setAuthed(false);
      say(friendly(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  function exHide() {
    if (ex.hidden) return;
    ex.hidden = true;
    document.body.classList.remove('exopen');
    X.mode = null;
    X.seq++;
    var back = X.opener;
    X.opener = null;
    if (back && document.contains(back) && !back.disabled) back.focus();
  }

  // Mostra a pasta 'p' (vazio = pasta do usuário; aceita %VARIAVEL%, como %ProgramFiles%).
  async function exGo(p) {
    var seq = ++X.seq;
    exSay('Carregando…');
    try {
      var r = await api('/api/fs?agent=' + vibe + '&path=' + encodeURIComponent(p || ''));
      if (seq !== X.seq) return;
      exRender(r);
    } catch (e) {
      if (seq !== X.seq) return;
      if (e.status === 401) { setAuthed(false); say(friendly(e), 'err'); return; }
      if (e.status === 403) { exHide(); say(friendly(e), 'warn'); return; }
      exSay(friendly(e), 'err');
    }
  }

  function exItem(tag, kind, name, meta) {
    var el = document.createElement(tag);
    if (tag === 'button') el.type = 'button';
    el.className = 'exitem ' + kind;
    el.title = name;
    var ico = document.createElement('span');
    ico.className = 'ico';
    ico.innerHTML = ICONS[kind];   // ícone fixo desta página, nunca dado vindo do PC
    var text = document.createElement('span');
    text.className = 'extext';
    var n = document.createElement('span');
    n.className = 'exname';
    n.textContent = name;
    text.appendChild(n);
    if (meta) {
      var m = document.createElement('span');
      m.className = 'exmeta';
      m.textContent = meta;
      text.appendChild(m);
    }
    el.appendChild(ico);
    el.appendChild(text);
    return el;
  }

  function exHead(box, text) {
    var h = document.createElement('p');
    h.className = 'exhead';
    h.textContent = text;
    box.appendChild(h);
  }

  function fileSize(b) {
    if (typeof b !== 'number') return '';
    if (b < 1024) return num(b) + ' B';
    if (b < 1048576) return num(b / 1024) + ' KB';
    if (b < 1073741824) return num(b / 1048576, 1) + ' MB';
    return num(b / 1073741824, 1) + ' GB';
  }

  // Caminho clicável: cada parte leva para a pasta até ela.
  function renderCrumbs(p) {
    var nav = $('excrumbs');
    nav.textContent = '';
    var parts = p.split(BSL).filter(function (x) { return x; });
    parts.forEach(function (part, i) {
      if (i) {
        var sep = document.createElement('span');
        sep.className = 'sep';
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = '›';
        nav.appendChild(sep);
      }
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'crumb';
      b.textContent = part;
      b.dataset.path = parts.slice(0, i + 1).join(BSL) + (i === 0 ? BSL : '');
      if (i === parts.length - 1) b.setAttribute('aria-current', 'location');
      nav.appendChild(b);
    });
    nav.scrollLeft = nav.scrollWidth;
  }

  // Atalhos: a pasta do usuário e os discos do PC (os mesmos da seção Discos).
  function renderPlaces() {
    var box = $('explaces');
    box.textContent = '';
    [{ path: '', label: 'Pasta do usuário' }].concat(disks.map(function (d) {
      return { path: d.name + BSL, label: d.label ? d.name + ' ' + d.label : d.name };
    })).forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.path = p.path;
      b.textContent = p.label;
      box.appendChild(b);
    });
  }

  function exRender(r) {
    X.path = r.path;
    X.sessions = r.sessions || [];
    exPick(null);
    renderCrumbs(r.path);
    $('exup').disabled = !r.parent;
    $('exup').dataset.path = r.parent || '';
    var box = $('exlist');
    box.textContent = '';
    if (X.mode === 'browse' && X.sessions.length) {
      exHead(box, 'Sessões do ' + SHELLS[vibe] + ' nesta pasta');
      X.sessions.forEach(function (s) { box.appendChild(sessItem(s)); });
    }
    var dirs = r.dirs || [], files = r.files || [];
    if (dirs.length) exHead(box, 'Pastas');
    dirs.forEach(function (full) {
      var b = exItem('button', 'dir', baseName(full), '');
      b.dataset.path = full;
      box.appendChild(b);
    });
    if (files.length) exHead(box, 'Arquivos');
    files.forEach(function (f) {
      var isExe = /[.]exe$/i.test(f.n);
      var pick = X.mode === 'pick' && isExe;
      var el = exItem(pick ? 'button' : 'div', isExe ? 'exe' : 'file', f.n, fileSize(f.s));
      if (pick) el.dataset.file = f.n;
      else if (X.mode === 'pick') el.classList.add('dim');
      box.appendChild(el);
    });
    box.scrollTop = 0;
    var more = [];
    if (r.more) more.push(r.more + ' pastas');
    if (r.moreFiles) more.push(r.moreFiles + ' arquivos');
    exSay(more.length ? 'Mais ' + more.join(' e ') + ' não couberam na lista.' : (dirs.length || files.length ? '' : 'Pasta vazia.'));
    updateButtons();
  }

  // Modo de escolha: tocar num .exe mostra o nome do app para confirmar.
  function exPick(file) {
    X.full = file ? (X.path.endsWith(BSL) ? X.path : X.path + BSL) + file : null;
    $('expickform').hidden = !file;
    $('expickmsg').hidden = !!file;
    if (!file) return;
    $('expickfile').textContent = X.full;
    $('exlabel').value = file.replace(/[.]exe$/i, '').slice(0, 40);
    $('exlabel').focus();
  }

  async function programAdd() {
    var label = $('exlabel').value.trim();
    if (!label) { exSay('Dê um nome para o app.', 'err'); $('exlabel').focus(); return; }
    if (await runAction('program-add', { path: X.full, label: label }, 'cadastrar ' + label, exSay)) {
      exHide();
      say(label + ' cadastrado. Ele aparece em Programas em instantes.', 'ok');
    }
  }

  /* ---------- Terminal: tela cheia ---------- */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Não consegui carregar o terminal. Veja sua conexão.')); };
      document.head.appendChild(s);
    });
  }

  // O xterm.js só é baixado na primeira vez que um terminal é aberto.
  function loadXterm() {
    if (!xtermLoading) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = '/xterm.css';
      document.head.appendChild(css);
      xtermLoading = loadScript('/xterm.js')
        .then(function () { return loadScript('/addon-fit.js'); })
        .catch(function (e) { xtermLoading = null; throw e; });
    }
    return xtermLoading;
  }

  function tvSay(text, kind) {
    tvStatus.textContent = text || '';
    tvStatus.className = 'tvstatus' + (kind ? ' ' + kind : '');
    tvStatus.hidden = !text;
    tvLayout();
  }

  function tvRaw(text) {
    if (T.ws && T.ws.readyState === 1) T.ws.send(text);
  }

  // Tudo o que é digitado vai como "i" + texto, em pedaços que cabem no limite do servidor.
  function tvSend(data) {
    for (var i = 0; i < data.length; i += 4000) tvRaw('i' + data.slice(i, i + 4000));
  }

  function setCtrl(on) {
    T.ctrl = on;
    tvCtrl.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function tvFit() {
    if (tv.hidden || !T.fit) return;
    try { T.fit.fit(); } catch (e) {}
  }

  // Mantém a tela do terminal do tamanho da área visível (ela encolhe quando o teclado abre).
  function tvLayout() {
    if (tv.hidden) return;
    var vv = window.visualViewport;
    if (vv) {
      tv.style.height = Math.round(vv.height) + 'px';
      tv.style.top = Math.round(vv.offsetTop) + 'px';
    }
    clearTimeout(T.fitTimer);
    T.fitTimer = setTimeout(tvFit, 80);
  }

  function createTerm() {
    var size = Number(store('tvfont')) || (window.innerWidth < 600 ? 12 : 14);
    T.term = new Terminal({
      cursorBlink: true,
      fontSize: size,
      fontFamily: 'ui-monospace, "Cascadia Mono", Consolas, "DejaVu Sans Mono", Menlo, monospace',
      scrollback: 30000,
      theme: { background: '#070a09', foreground: '#e3ece8', cursor: '#3ddc97', cursorAccent: '#070a09', selectionBackground: '#1f4d3a' }
    });
    T.fit = new FitAddon.FitAddon();
    T.term.loadAddon(T.fit);
    T.term.open(tvBox);
    // O xterm não rola com o dedo: arrastar na tela rola o histórico, linha a linha. Toque sem
    // arrastar continua abrindo o teclado.
    var touchY = null, touchRest = 0;
    tvBox.addEventListener('touchstart', function (ev) {
      touchY = ev.touches.length === 1 ? ev.touches[0].clientY : null;
      touchRest = 0;
    }, { passive: true });
    tvBox.addEventListener('touchmove', function (ev) {
      if (touchY === null || !T.term) return;
      var y = ev.touches[0].clientY;
      var lineH = (T.term.element.querySelector('.xterm-screen').clientHeight / T.term.rows) || 16;
      touchRest += touchY - y;
      touchY = y;
      var lines = Math.trunc(touchRest / lineH);
      if (lines) {
        touchRest -= lines * lineH;
        T.term.scrollLines(lines);
      }
      ev.preventDefault();
    }, { passive: false });
    tvBox.addEventListener('touchend', function () { touchY = null; });
    T.term.onData(function (d) {
      // Ctrl da barra de teclas vale para a próxima tecla: Ctrl + letra vira o caractere de controle.
      if (T.ctrl) {
        setCtrl(false);
        if (d.length === 1) {
          var code = d.toUpperCase().charCodeAt(0);
          if (code >= 64 && code <= 95) d = String.fromCharCode(code - 64);
        }
      }
      tvSend(d);
    });
    T.term.onResize(function (s) { tvRaw(JSON.stringify({ t: 'size', cols: s.cols, rows: s.rows })); });
  }

  function tvEnded(text, kind) {
    T.ended = true;
    store('tvterm', '');
    tvKillBtn.textContent = 'Fechar';
    tvSay(text, kind);
    refreshPc();
  }

  function tvRetry(text) {
    T.retry++;
    tvSay(text, 'warn');
    clearTimeout(T.timer);
    T.timer = setTimeout(tvConnect, Math.min(8000, 500 * Math.pow(2, T.retry)));
  }

  function tvConnect() {
    clearTimeout(T.timer);
    if (!T.id || T.ended) return;
    var dims = null;
    try { dims = T.fit.proposeDimensions(); } catch (e) {}
    var cols = dims && dims.cols ? dims.cols : 80, rows = dims && dims.rows ? dims.rows : 24;
    var ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host +
      '/api/term/ws?id=' + encodeURIComponent(T.id) + '&cols=' + cols + '&rows=' + rows);
    T.ws = ws;
    T.pongAt = Date.now();
    if (!tvStatus.textContent) tvSay('Conectando ao PC…');

    ws.onmessage = function (ev) {
      if (T.ws !== ws || typeof ev.data !== 'string') return;
      var d = ev.data;
      if (d === 'pong') { T.pongAt = Date.now(); return; }
      var kind = d.charAt(0);
      if (kind === 'o') { T.term.write(d.slice(1)); return; }
      if (kind === 'r') {
        // Cópia do que já estava na tela do terminal: chega uma vez, logo depois de conectar.
        T.term.reset();
        T.term.write(d.slice(1));
        T.retry = 0;
        tvDot.classList.add('on');
        tvSay('');
        return;
      }
      if (kind !== '{') return;
      var m;
      try { m = JSON.parse(d); } catch (e) { return; }
      if (m.t === 'exit') {
        var code = (m.code === null || m.code === undefined) ? '.' : ' (código ' + m.code + ').';
        tvEnded(m.error || ('Terminal encerrado' + code), m.error ? 'err' : '');
      } else if (m.t === 'offline') {
        tvDot.classList.remove('on');
        tvSay('O PC perdeu a conexão. Assim que ele voltar, o terminal continua de onde parou.', 'warn');
      }
    };

    ws.onclose = function (ev) {
      if (T.ws !== ws) return;
      T.ws = null;
      tvDot.classList.remove('on');
      if (!T.id || T.ended) return;
      if (ev.code === 4410 || ev.code === 4404) { tvEnded('Esse terminal não existe mais.', 'warn'); return; }
      if (ev.code === 4401) {
        say('Sua sessão terminou. Entre de novo para voltar ao terminal.', 'warn');
        setAuthed(false);
        return;
      }
      if (ev.code === 4403) {
        store('tvterm', '');
        tvHide();
        say('Toque no terminal de novo e confirme com a digital para reconectar.', 'warn');
        return;
      }
      tvRetry(ev.code === 4409 ? 'O PC não está conectado. Tentando de novo…' : 'Conexão perdida. Reconectando…');
    };
  }

  async function tvShow(t) {
    await loadXterm();
    tvHide();
    store('tvterm', t.id);   // se a sessão vencer, o próximo login volta para este terminal
    T.id = t.id;
    T.ended = false;
    T.retry = 0;
    tvName.textContent = termLabel(t);
    tvKillBtn.textContent = 'Encerrar';
    tv.hidden = false;
    document.body.classList.add('tvopen');
    if (!T.term) createTerm();
    else T.term.reset();
    setCtrl(false);
    tvSay('Conectando ao PC…');
    tvFit();
    tvConnect();
    // "ping" é respondido pelo servidor; sem resposta, a conexão morreu e é refeita.
    T.beat = setInterval(function () {
      var ws = T.ws;
      if (!ws || ws.readyState !== 1) return;
      if (Date.now() - T.pongAt > 50000) {
        T.ws = null;
        try { ws.close(); } catch (e) {}
        tvDot.classList.remove('on');
        tvRetry('Conexão perdida. Reconectando…');
        return;
      }
      ws.send('ping');
    }, 20000);
    if (window.matchMedia('(pointer: fine)').matches) T.term.focus();
  }

  function tvHide() {
    if (!T.id) return;
    T.id = null;
    clearTimeout(T.timer);
    clearInterval(T.beat);
    var ws = T.ws;
    T.ws = null;
    if (ws) { try { ws.close(1000); } catch (e) {} }
    tvDot.classList.remove('on');
    tv.hidden = true;
    document.body.classList.remove('tvopen');
  }

  // Envia o texto da caixa como se fosse colado e, logo depois, um Enter separado.
  // (Programas como o Claude tratam texto + Enter na mesma leva como colagem, sem enviar.)
  function tvSubmit() {
    var text = tvInput.value;
    tvInput.value = '';
    if (!T.term) return;
    if (text) T.term.paste(text.split(LF).join(CR));
    setTimeout(function () { tvSend(CR); }, text ? 150 : 0);
  }

  function tvKey(k) {
    if (!T.term) return;
    if (k === 'ctrl') { setCtrl(!T.ctrl); return; }
    if (k === 'paste') {
      if (!navigator.clipboard || !navigator.clipboard.readText) {
        tvSay('Este navegador não deixa ler a área de transferência. Cole na caixa de mensagem.', 'warn');
        return;
      }
      navigator.clipboard.readText()
        .then(function (text) { if (text) T.term.paste(text); })
        .catch(function () { tvSay('O navegador não liberou a área de transferência. Cole na caixa de mensagem.', 'warn'); });
      return;
    }
    if (KEYS[k]) tvSend(KEYS[k]);
  }

  function tvFont(delta) {
    if (!T.term) return;
    var size = Math.max(8, Math.min(24, T.term.options.fontSize + delta));
    T.term.options.fontSize = size;
    store('tvfont', String(size));
    tvFit();
  }

  // Terminal que estava na tela quando a sessão anterior acabou. O login já libera os
  // terminais abertos para a sessão nova, então volta direto, sem pedir a digital de novo.
  function restoreTerm() {
    var id = store('tvterm');
    if (!id || T.id) return;
    var t = termList.filter(function (x) { return x.id === id && x.granted; })[0];
    if (!t) { store('tvterm', ''); return; }
    tvShow(t).catch(function (e) { say(friendly(e), 'err'); });
  }

  /* ---------- Terminal: ações que pedem a digital ---------- */

  async function termAction(action, arg, prompt, sayFn) {
    sayFn(prompt);
    var o = await api('/api/action/options', { action: action, arg: arg });
    return api('/api/action/verify', await assertion(o));
  }

  // Abre um terminal na pasta 'cwd' (vazio = pasta do usuário). 'session' (opcional): sessão do
  // Claude a retomar. 'sayFn' mostra as mensagens onde a pessoa está (painel ou explorador).
  async function termOpen(shell, cwd, session, sayFn) {
    sayFn = sayFn || say;
    var what = session
      ? 'retomar "' + session.title + '"'
      : 'abrir ' + (shell === 'claude' ? 'o Claude' : 'o ' + SHELLS[shell]) + (cwd ? ' em ' + baseName(cwd) : '');
    var arg = { shell: shell, cwd: cwd || null };
    if (session) arg.resume = session.id;
    setBusy(true);
    try {
      var r = await termAction('term-open', arg, 'Confirme com digital ou rosto para ' + what + '.', sayFn);
      setCwd(cwd);
      sayFn('');
      exHide();
      await tvShow({ id: r.term, shell: shell, cwd: cwd });
    } catch (e) {
      if (e.status === 401) { setAuthed(false); say(friendly(e), 'err'); }
      else sayFn(friendly(e), 'err');
    } finally {
      setBusy(false);
      refreshPc();
    }
  }

  async function termAttach(t) {
    setBusy(true);
    try {
      if (!t.granted) {
        await termAction('term-attach', { id: t.id }, 'Confirme com digital ou rosto para reconectar a ' + termLabel(t) + '.', say);
        say('');
      }
      await tvShow(t);
    } catch (e) {
      if (e.status === 401) setAuthed(false);
      say(friendly(e), 'err');
    } finally {
      setBusy(false);
      refreshPc();
    }
  }

  async function termKill() {
    if (!T.id) return;
    if (T.ended) { tvHide(); refreshPc(); return; }
    setBusy(true);
    try {
      await termAction('term-close', { id: T.id }, 'Confirme com digital ou rosto para encerrar este terminal.', tvSay);
      if (!T.ended) tvSay('Encerrando…');
    } catch (e) {
      if (e.status === 401) { setAuthed(false); say(friendly(e), 'err'); }
      else tvSay(friendly(e), 'err');
    } finally {
      setBusy(false);
    }
  }

  /* ---------- Cadastro ---------- */

  async function register() {
    if (!window.PublicKeyCredential) { say('Este navegador não suporta passkeys.', 'err'); return; }
    regBtn.disabled = true;
    try {
      say('Aguardando confirmação…');
      var o = await api('/api/register/options', { setupToken: tokenIn.value.trim() });
      var cred = await navigator.credentials.create({ publicKey: {
        challenge: dec(o.challenge),
        rp: { name: 'Central do PC', id: o.rpId },
        user: { id: dec(o.userId), name: 'dono', displayName: 'Dono do PC' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        excludeCredentials: o.exclude.map(function (id) { return { type: 'public-key', id: dec(id) }; }),
        attestation: 'none',
        timeout: 60000
      }});
      var r = cred.response;
      if (!r.getPublicKey || !r.getPublicKeyAlgorithm) throw new Error('Navegador antigo demais. Atualize o navegador.');
      await api('/api/register/verify', {
        chId: o.chId,
        credentialId: enc(cred.rawId),
        clientDataJSON: enc(r.clientDataJSON),
        publicKey: enc(r.getPublicKey()),
        alg: r.getPublicKeyAlgorithm()
      });
      tokenIn.value = '';
      say('Aparelho cadastrado! Agora é só tocar no botão.', 'ok');
      setup.open = false;
      refresh();
    } catch (e) {
      say(friendly(e), 'err');
    } finally {
      regBtn.disabled = false;
    }
  }

  async function reset() {
    if (!confirm('Remover todos os aparelhos cadastrados?')) return;
    resetBtn.disabled = true;
    try {
      await api('/api/reset', { setupToken: tokenIn.value.trim() });
      tokenIn.value = '';
      say('Todos os aparelhos foram removidos.', 'ok');
      setAuthed(false);
      refresh();
    } catch (e) {
      say(friendly(e), 'err');
    } finally {
      resetBtn.disabled = false;
    }
  }

  wakeBtn.addEventListener('click', wake);
  loginBtn.addEventListener('click', login);
  logoutBtn.addEventListener('click', logout);
  regBtn.addEventListener('click', register);
  resetBtn.addEventListener('click', reset);
  panel.addEventListener('click', function (ev) {
    var b = ev.target.closest('.act');
    if (b && !b.disabled) act(b);
  });
  shot.addEventListener('click', function () { shot.classList.toggle('zoom'); });
  shot.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); shot.classList.toggle('zoom'); }
  });

  $('pcadd').addEventListener('click', async function () {
    var label = $('pcname').value.trim();
    if (!label) { say('Dê um nome ao computador, como Notebook ou Escritório.', 'warn'); $('pcname').focus(); return; }
    var res = await pcManage('pc-add', label, 'Confirme com digital ou rosto para adicionar o ' + label + '.');
    if (!res) return;
    $('pcname').value = '';
    showInstall({ pc: res.pc, label: label, key: res.key });
    say(label + ' adicionado. Agora instale o agente nele com o comando abaixo.', 'ok');
    refreshPc();
  });
  $('pcmanage').addEventListener('click', async function (ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    var id = b.dataset.key || b.dataset.remove;
    var p = pcList.filter(function (x) { return x.id === id; })[0];
    var label = p ? p.label : id;
    if (b.dataset.key) {
      var res = await pcManage('pc-key', id, 'Confirme com digital ou rosto para ver o comando de instalação do ' + label + '.');
      if (res) showInstall({ pc: res.pc, label: label, key: res.key });
      return;
    }
    if (await pcManage('pc-remove', id, 'Confirme com digital ou rosto para remover o ' + label + ' da central.')) {
      say(label + ' removido. O agente dele não entra mais na central.', 'ok');
      refreshPc();
    }
  });
  $('pccopy').addEventListener('click', function () {
    var box = $('pccmd');
    var select = function () {
      var r = document.createRange();
      r.selectNodeContents(box);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      say('Comando selecionado: copie pelo menu do aparelho.', 'warn');
    };
    if (navigator.clipboard) navigator.clipboard.writeText(box.textContent).then(function () { say('Comando copiado.', 'ok'); }, select);
    else select();
  });

  $('pctabs').addEventListener('click', function (ev) {
    var b = ev.target.closest('.tab');
    if (b && !b.disabled) switchPc(b.dataset.pc);
  });
  $('progadd').addEventListener('click', function (ev) { exOpen('pick', ev.currentTarget); });
  function onTermClick(ev) {
    var tab = ev.target.closest('#vibeagent .tab');
    if (tab) {
      if (!tab.disabled && tab.dataset.agent !== vibe) {
        vibe = tab.dataset.agent;
        store('vibe', vibe);
        renderVibe();
        loadSessions();
      }
      return;
    }
    var ss = ev.target.closest('#vsess .sess');
    if (ss) {
      var s = V.sessions.filter(function (x) { return x.id === ss.dataset.session; })[0];
      if (s && !ss.disabled) termOpen(V.agent, V.path, s);
      return;
    }
    var open = ev.target.closest('.topen');
    if (open) { if (!open.disabled) termOpen(open.dataset.shell, cwdIn.value.trim()); return; }
    var chip = ev.target.closest('.chip');
    if (chip) { setCwd(chip.dataset.path); return; }
    var exb = ev.target.closest('#exopen');
    if (exb) { if (!exb.disabled) exOpen('browse', exb); return; }
    var b = ev.target.closest('.termbtn');
    if (!b || b.disabled) return;
    var t = termList.filter(function (x) { return x.id === b.dataset.id; })[0];
    if (t) termAttach(t);
  }
  $('termsec').addEventListener('click', onTermClick);
  $('vibesec').addEventListener('click', onTermClick);
  cwdIn.addEventListener('input', function () {
    store('cwd', cwdIn.value.trim());
    markFolder();
    clearTimeout(V.timer);
    V.timer = setTimeout(loadSessions, 600);
  });
  cwdIn.value = store('cwd') || '';
  renderVibe();
  ex.addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.id === 'exclose') { exHide(); return; }
    if (b.id === 'exadd') { programAdd(); return; }
    if (b.id === 'excancel') { exPick(null); return; }
    if (b.id === 'exup' || b.classList.contains('crumb') || b.classList.contains('chip') || b.classList.contains('dir')) {
      exGo(b.dataset.path);
      return;
    }
    if (b.classList.contains('exopenterm')) { termOpen(b.dataset.shell, X.path, null, exSay); return; }
    if (b.classList.contains('sess')) {
      var s = X.sessions.filter(function (x) { return x.id === b.dataset.session; })[0];
      if (s) termOpen(vibe, X.path, s, exSay);
      return;
    }
    if (b.classList.contains('exe')) exPick(b.dataset.file);
  });
  ex.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); exHide(); }
    else if (ev.key === 'Enter' && ev.target.id === 'exlabel') { ev.preventDefault(); if (!$('exadd').disabled) programAdd(); }
  });
  $('tvback').addEventListener('click', function () {
    store('tvterm', '');
    tvHide();
    refreshPc();
    loadSessions();   // a sessão que acabou de usar sobe para o topo
  });
  tvKillBtn.addEventListener('click', termKill);
  $('tvsmaller').addEventListener('click', function () { tvFont(-1); });
  $('tvbigger').addEventListener('click', function () { tvFont(1); });
  $('tvsend').addEventListener('click', tvSubmit);
  tvInput.addEventListener('keydown', function (ev) {
    // No computador, Enter envia e Shift+Enter quebra a linha. No celular, quem envia é o botão.
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing && window.matchMedia('(pointer: fine)').matches) {
      ev.preventDefault();
      tvSubmit();
    }
  });
  // Estes botões não podem tirar o foco de onde se digita, senão o teclado do celular fecha.
  [$('tvkeys'), $('tvsend')].forEach(function (el) {
    el.addEventListener('mousedown', function (ev) { if (ev.target.closest('button')) ev.preventDefault(); });
  });
  $('tvkeys').addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (b) tvKey(b.dataset.k);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', tvLayout);
    window.visualViewport.addEventListener('scroll', tvLayout);
  }
  window.addEventListener('resize', tvLayout);

  // App instalável. Chrome e Edge (Android e PC) avisam quando dá para instalar; no iPhone é
  // pelo Compartilhar do Safari. O service worker só mostra um aviso quando falta internet.
  var installEv = null;
  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();
    installEv = ev;
    $('install').hidden = false;
  });
  window.addEventListener('appinstalled', function () {
    installEv = null;
    $('install').hidden = true;
  });
  $('install').addEventListener('click', function () {
    if (!installEv) return;
    installEv.prompt();
    installEv = null;
    $('install').hidden = true;
  });
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  $('installios').hidden = standalone || !/iPhone|iPad|iPod/.test(navigator.userAgent);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {});

  // Abas da barra de baixo. A escolhida fica salva neste aparelho.
  function showTab(name) {
    if (!/^(home|code|apps|sys)$/.test(name || '')) name = 'home';
    app.dataset.tab = name;
    store('tab', name);
    document.querySelectorAll('#tabbar button').forEach(function (b) {
      if (b.dataset.go === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  }
  $('tabbar').addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    if (app.dataset.tab !== b.dataset.go) window.scrollTo(0, 0);
    showTab(b.dataset.go);
  });
  showTab(store('tab'));
  msg.addEventListener('click', function () { say(''); });

  setAuthed(false);
  refresh();
  setInterval(function () {
    ticks++;
    // Com o terminal na frente, o painel atrás só atualiza de vez em quando.
    if (document.hidden || busy || (T.id && ticks % 6)) return;
    refresh();
  }, 5000);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    refresh();
    // O celular derruba a conexão quando a página fica em segundo plano: volta na hora.
    if (T.id && !T.ended && !T.ws) { T.retry = 0; tvConnect(); }
  });
})();
</script>
</body>
</html>`;
