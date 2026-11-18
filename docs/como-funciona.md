# Como funciona

## As peças

```
 Celular (página / app)
        │  HTTPS + WebSocket, passkey em cada ação
        ▼
 Cloudflare Worker  ──  Durable Object "Store" (um só, com SQLite)
   │   página, API, verificação das passkeys, sessões, fila de comandos, túnel dos terminais
   │
   ├── Agente do Windows (um por PC): consulta assinada a cada 5–10 s + WebSocket do túnel
   └── ESP32: consulta assinada a cada 5 s; manda o Wake-on-LAN na rede local
```

| Peça | Onde roda | Arquivos |
| --- | --- | --- |
| Worker | Cloudflare (sua conta) ou workerd numa VPS | `worker.js`, `wrangler.toml`, `selfhost/` |
| Página | Servida pelo Worker; vira app no celular | `page.js`, `public/` |
| Agente | Em cada PC, na sessão do usuário | `agent/agent.js`, `agent/helper.cs`, `agent/install.ps1` |
| Sensores (opcional) | Em cada PC, tarefa como SYSTEM | `agent/sensors.ps1`, `agent/install-sensores.ps1` |
| ESP32 (opcional) | Na rede de casa | `esp32/esp32_wol_passkey/` |

### Worker e Durable Object

O Worker serve a página e a API. Todo o estado fica num único Durable Object (`Store`): aparelhos
cadastrados, sessões, a lista de computadores, a fila de comandos de cada PC, as últimas métricas,
o print (por 10 minutos) e os WebSockets dos terminais. Os WebSockets usam a API de hibernação, então
o objeto dorme quando ninguém está usando e não gasta nada parado.

### Agente

Um programa Node.js que inicia com o Windows (tarefa agendada, sem janela) e roda com as permissões
do usuário. Ele:

- consulta o Worker a cada 10 segundos (5 com a central aberta), manda as métricas e busca comandos;
- mantém um WebSocket aberto com o Durable Object (o "túnel") para os terminais, o explorador e as
  sessões do Claude/Codex;
- abre os terminais com o `node-pty` (ConPTY do Windows) e guarda o histórico de cada um na memória;
- conversa com o `helper.exe` (C#, compilado na instalação) para métricas, print e suspender.

Só aceita a lista fixa de ações (`shutdown`, `restart`, `sleep`, `lock`, `screenshot`, `run`,
`awake-on`, `awake-off`, `program-add`) e os pedidos do túnel (abrir, digitar, redimensionar e
encerrar terminal, listar pasta, listar sessões). Não existe "rodar este comando" fora de um
terminal que você mesmo abriu com a digital.

### App instalado (PWA)

A central é um Progressive Web App: o `public/manifest.webmanifest` dá o nome, as cores e os ícones,
e o navegador instala a página como app, com ícone e tela cheia. O `public/sw.js` (service worker)
**não guarda nada**: ele só existe para o app ser instalável e para mostrar "Sem conexão" quando
falta internet. Por isso o app é sempre a versão atual da página, sem cache para limpar, e nada da
central fica salvo no celular além do cookie da sessão e de preferências da tela (a última aba, o
último PC e o assistente escolhido).

### ESP32

Consulta `/api/device/poll` a cada 5 segundos. Quando há um pedido de ligar (válido por 60
segundos), manda o pacote mágico de Wake-on-LAN três vezes, em broadcast, para o MAC configurado.

## O que acontece em cada ação

**Entrar.** O navegador pede um desafio, a passkey assina, o Worker confere a assinatura com a chave
pública guardada e cria uma sessão de 1 hora (cookie `__Host-sid`, `HttpOnly`, `Secure`,
`SameSite=Strict`). A sessão só deixa ver o painel.

**Ação com digital** (desligar, abrir terminal, trocar de PC…). A página pede um desafio para
aquela ação; o desafio fica amarrado à ação, ao argumento, à sessão e ao PC em uso. Depois da
passkey, o Worker:

- põe o comando na fila do PC (energia, print, apps), e o agente busca na próxima consulta, ou na
  hora, avisado pelo túnel. Comando não buscado em 60 segundos expira: nada de desligar o PC horas
  depois;
- ou executa direto no Durable Object (trocar de PC, abrir o explorador, terminais, computadores).

**Ligar.** A passkey autoriza um pedido de ligar que vale 60 segundos. O ESP32 busca, confere a
assinatura da resposta e manda o pacote. A página acompanha até o ESP32 confirmar.

**Terminal.** Abrir pede a digital; o Durable Object manda o pedido ao agente pelo túnel, e o
navegador abre um WebSocket próprio para aquele terminal. O que você digita vai pelo WebSocket até o
Durable Object, que repassa pelo túnel; a saída faz o caminho inverso. Ao reconectar, o agente manda
primeiro a cópia guardada da tela.

**Computadores.** A lista fica no Durable Object. O primeiro, `desktop`, sempre existe e é o que o
ESP32 liga. Adicionar cria um id com final aleatório (como `notebook-3fa9c1`), e a chave do PC é
`HMAC-SHA256(AGENT_SECRET, "pc|<id>")`: o Worker não guarda chave nenhuma, só recalcula. Remover tira
o id da lista, apaga os dados do PC e derruba o agente dele. Como um PC adicionado de novo ganha
outro id, a chave antiga nunca volta a valer.

## Segurança

### O que protege o quê

| Ameaça | Proteção |
| --- | --- |
| Alguém de fora entrar | Passkey (WebAuthn com verificação do usuário). Não existe senha. Só aparelhos cadastrados entram, e cadastrar exige o `SETUP_TOKEN`. |
| Sessão roubada fazer estrago | A sessão só lê. Cada ação pede uma passkey nova, amarrada à ação, à sessão e ao PC. |
| Repetir um pedido capturado | Desafios de uso único que vencem em 2 minutos; requisições do agente com horário crescente e nonce. |
| Alguém se passar pelo agente | Toda requisição do agente é assinada com a chave do PC; as respostas do Worker também. A chave de um PC não vale para outro. |
| Alguém injetar comandos no túnel | Os dois lados provam que conhecem a chave com nonces novos; cada mensagem para o agente vai numerada e assinada com uma chave daquela conexão. |
| Alguém mandar o ESP32 ligar o PC | Consulta e resposta assinadas com HMAC usando o `DEVICE_SECRET`; o ESP32 ignora respostas que não conferem. |
| Expor o PC na internet | Nenhuma porta aberta: o agente e o ESP32 só fazem conexões de saída. |
| Esgotar a cota gratuita | As rotas sem login não gravam nada; o limite de tentativas é por IP e fica em memória (30 desafios por minuto). |
| Página adulterada por script de fora | CSP com nonce por requisição, `frame-ancestors 'none'` e nenhum script de terceiros. |

### O que você precisa saber

- **Quem tem a sua passkey controla os seus PCs**, inclusive com terminal. Proteja o celular com
  bloqueio de tela e cadastre só aparelhos seus.
- O agente roda com **as suas permissões** no Windows: o terminal da central pode tudo o que você
  pode no PC. Não instale num computador que não é seu.
- O `SETUP_TOKEN` permite cadastrar aparelhos novos. Guarde num gerenciador de senhas; se vazar,
  troque com `npx wrangler secret put SETUP_TOKEN`.
- Se o `AGENT_SECRET` vazar, troque-o: todas as chaves de PC mudam. Depois, em cada PC, pegue o
  comando novo em **Sistema → Computadores → Instalar** e rode de novo.
- Se a chave de **um** PC vazar (o `config.json` dele ou o comando de instalação), remova o PC na
  central e adicione de novo.
- O print da tela passa pelo Worker e fica guardado por até 10 minutos. O que passa pelos terminais
  não é gravado em disco, nem no Worker nem no `agent.log`.
- A Cloudflare termina o TLS: tecnicamente, ela vê o tráfego entre a página, o Worker e o agente,
  como em qualquer site hospedado nela.

### Segredos

| Onde | O quê | No Git? |
| --- | --- | --- |
| Cloudflare (`wrangler secret`) | `SETUP_TOKEN`, `DEVICE_SECRET`, `AGENT_SECRET` | Não |
| PC: `%LOCALAPPDATA%\CentralPC\agent\config.json` | Endereço, id e chave do PC | Não |
| ESP32: `secrets.h` | Wi-Fi, `DEVICE_SECRET`, endereço e MAC | Não (`.gitignore`) |
| Desenvolvimento: `.dev.vars` | Segredos de teste para o Worker local | Não (`.gitignore`) |

## Limites

| Item | Limite |
| --- | --- |
| Aparelhos cadastrados | 5 |
| Computadores | 8 |
| Terminais abertos por PC | 6 |
| Sessão | 1 hora |
| Apps por PC | 24 |
| Pedido de ligar | 60 segundos |
| Comando na fila | 60 segundos |
| Print guardado | 10 minutos |
| Histórico por terminal | ~1 milhão de caracteres no agente; 30 mil linhas na tela |

## Custos

Na hospedagem própria, o custo é o da VPS. Na Cloudflare, para uso pessoal, cabe no plano gratuito. Cada PC ligado faz cerca de 8.600
consultas por dia (uma a cada 10 s), e o ESP32 cerca de 17.000 (uma a cada 5 s), longe do limite
diário de requisições do plano. A presença dos PCs e do ESP32 é gravada no máximo uma vez por
minuto, para poupar a cota de escritas.
