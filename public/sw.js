// Service worker do app instalado. Não guarda nada: painel, terminais e digital precisam da rede.
// Só troca a tela de erro do navegador por um aviso quando o celular está sem conexão.
const OFFLINE = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark light">' +
  '<title>Central do PC</title><style>' +
  'body{margin:0;min-height:100vh;display:grid;place-content:center;gap:14px;padding:24px;text-align:center;' +
  'background:#0b0f0e;color:#e3ece8;font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
  'h1{margin:0;font-size:1.25rem}p{margin:0;color:#86978f}' +
  'a{justify-self:center;min-height:44px;padding:11px 20px;border-radius:10px;background:#3ddc97;color:#04140d;font-weight:600;text-decoration:none}' +
  '@media (prefers-color-scheme: light){body{background:#f3f4f7;color:#16181c}p{color:#59616d}a{background:#2559d6}}' +
  '</style></head><body><h1>Sem conexão</h1><p>A Central do PC precisa de internet para falar com os PCs.</p>' +
  '<a href="/">Tentar de novo</a></body></html>';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;   // API, WebSocket e arquivos vão direto para a rede
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'content-type': 'text/html; charset=utf-8' } })));
});
