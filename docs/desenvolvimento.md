# Desenvolvimento

## Estrutura

```
worker.js                 Worker + Durable Object "Store": API, passkeys, sessões, PCs, fila, túnel
page.js                   A página inteira (HTML, CSS e JS) dentro de um template literal
public/                   Arquivos estáticos: xterm.js, manifesto, ícones e service worker do app
wrangler.toml             Configuração do Worker (nome, Durable Object, pasta public/)
agent/agent.js            Agente do Windows (Node 22+, node-pty)
agent/helper.cs           Ajudante em C#: métricas, print, suspender, manter acordado
agent/install.ps1         Instala/atualiza o agente em %LOCALAPPDATA%\CentralPC\agent
agent/install-sensores.ps1, agent/sensors.ps1   Tarefa SYSTEM que lê as temperaturas
agent/acordar-pela-rede.ps1                     Libera o Wake-on-LAN na placa de rede
agent/entrar-sozinho.ps1                        Logon automático + bloquear a tela ao ligar
esp32/esp32_wol_passkey/  Sketch do ESP32 (Arduino)
selfhost/                 Hospedagem própria: config do workerd, Dockerfile, Compose e Caddyfile
scripts/vendor.mjs        Copia o xterm.js de node_modules para public/
test/e2e.mjs              Teste de ponta a ponta
docs/                     Esta documentação
```

## Rodar localmente

```powershell
npm install
copy .dev.vars.example .dev.vars      # segredos de teste para o Worker local; troque os valores
npm run dev                           # Worker local em http://localhost:8787 (wrangler dev)
# ou, como na hospedagem própria (lê os segredos das variáveis de ambiente, banco em dados/):
npm run serve                         # http://127.0.0.1:8080
```

Passkeys só funcionam em `localhost` ou HTTPS. Para testar no celular, publique numa conta de
teste (mude o `name` no `wrangler.toml`) em vez de usar o Worker local.

## Testes

```powershell
cd agent
npm install
# compila o helper.exe na pasta agent/ (o mesmo comando do install.ps1)
& "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" -nologo -optimize+ -target:exe -codepage:65001 -out:helper.exe -r:System.Management.dll -r:System.Web.Extensions.dll -r:System.Drawing.dll -r:System.Windows.Forms.dll helper.cs
cd ..
npm test
```

`npm test` (só Windows) sobe o Worker local com `wrangler dev`, dois agentes de verdade nesta
máquina e uma passkey simulada, e passa por tudo: login, desafios, ações, terminais, túnel,
explorador, sessões do Claude e do Codex (com arquivos de mentira), computadores, cadastro de apps e
limites. Ele abre terminais de verdade e tira um print da tela, que vai só para o Worker local.
Precisa do `.dev.vars`.

`npm run test:selfhost` roda o mesmo teste com o servidor no workerd puro, pela
`selfhost/config.capnp` (o caminho da hospedagem própria), em vez do `wrangler dev`.

## Regras do projeto

- **`page.js`** é o HTML dentro de um template literal. No JavaScript da página **não use crases,
  `${...}` nem barras invertidas**; para uma barra invertida, use a variável `BSL`.
- A página não carrega nada de fora: CSP com nonce por requisição e scripts só do próprio Worker.
  Para atualizar o xterm.js: mude a versão no `package.json`, `npm install` e `npm run vendor`.
- Toda ação que muda alguma coisa passa por `/api/action/options` + `/api/action/verify`, com a
  passkey amarrada à ação, ao argumento, à sessão e ao PC. Ação nova entra nessa lista, não numa
  rota própria sem passkey.
- O agente só executa a lista fixa de `ACTIONS` (e os pedidos do túnel). Validação de argumento nos
  dois lados: no Worker e no agente.
- As rotas sem login não gravam nada no Durable Object (cota de escritas do plano gratuito).
- `helper.cs` é compilado com o `csc.exe` do .NET Framework 4 que já vem no Windows: C# 5, sem
  interpolação de strings nem `?.`.
- Os scripts `.ps1` com acentos são salvos em UTF-8 **com BOM** (o Windows PowerShell 5.1 precisa).
- O Worker roda na Cloudflare **e** no workerd puro (`selfhost/`): não use recursos que só existem
  num dos dois. Arquivo novo em `public/` precisa de um tipo em `ASSET_TYPES` (worker.js) para ser
  servido na hospedagem própria.
- Rode `npm test` (e `npm run test:selfhost`, se mexeu no servidor) antes de mandar mudanças.

## Publicar

```powershell
npm run deploy     # npx wrangler deploy
```

Depois de um deploy, o Durable Object pode levar alguns minutos para trocar para o código novo;
nesse intervalo o túnel do terminal pode cair e o agente reconecta sozinho. Mudou o agente? Rode o
`agent\install.ps1` em cada PC.

## Contribuir

Issues e pull requests são bem-vindos. Para falhas de segurança, não abra uma issue pública: use o
"Report a vulnerability" da aba Security do GitHub.
