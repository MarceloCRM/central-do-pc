# Hospedagem própria (VPS, contêiner ou servidor em casa)

O caminho fácil é a Cloudflare ([instalacao.md](instalacao.md)): grátis, sem servidor para cuidar.
Se você prefere não depender dela, a central roda em qualquer lugar com o **workerd**, o motor de
código aberto da Cloudflare. É o **mesmo `worker.js`**, sem mudança: o banco do Durable Object vira
um SQLite em disco, e a pasta `public/` é servida pelo próprio Worker.

## Cloudflare ou hospedagem própria?

| | Cloudflare | Hospedagem própria |
| --- | --- | --- |
| Custo | Grátis | VPS (uns US$ 4 a 6 por mês) e um domínio |
| Manutenção | Nenhuma | Atualizações do sistema, firewall, backup do banco |
| Ataques e excesso de tráfego | A Cloudflare absorve | O servidor fica com as portas 80 e 443 na internet |
| Quem vê o tráfego | A Cloudflare termina o HTTPS | Só você |
| Endereço | `*.workers.dev` grátis | Precisa de um domínio (ou subdomínio) seu |

Nos dois casos os seus PCs continuam **sem nenhuma porta aberta**: só o servidor fica exposto.

## O que qualquer hospedagem precisa ter

1. **HTTPS com um nome fixo.** A passkey fica presa ao domínio e só funciona em HTTPS. Trocar de
   domínio depois obriga a cadastrar os aparelhos de novo.
2. **WebSocket** liberado (terminais e o túnel dos agentes).
3. **Disco persistente** em `/data`, onde fica o banco (aparelhos, sessões, computadores). Sem ele,
   tudo se perde a cada reinício.
4. **Uma única instância.** O Durable Object vive dentro de um processo só: não escale para duas
   cópias nem use "scale to zero" que derruba o processo parado.
5. Os três segredos (`SETUP_TOKEN`, `DEVICE_SECRET`, `AGENT_SECRET`) como **variáveis de ambiente**.
6. Que o proxy da frente mande o **`X-Forwarded-Proto`** (quase todos mandam) e informe o IP real do
   visitante (veja [`CLIENT_IP_HEADER`](#o-ip-do-visitante)).

Os arquivos ficam em `selfhost/`:

| Arquivo | O que é |
| --- | --- |
| `config.capnp` | Configuração do workerd: o Worker, o Durable Object, a pasta `public/` e o banco em `/data` |
| `Dockerfile` | Imagem com o workerd e a central (Node 22, Debian slim) |
| `compose.yaml` | Central + [Caddy](https://caddyserver.com) com HTTPS automático, para uma VPS |
| `Caddyfile` | O proxy HTTPS na frente da central |
| `.env.example` | Modelo do `.env` com o domínio e os segredos |

## Opção A: VPS com Docker (recomendada)

Serve qualquer VPS Linux (Hetzner, DigitalOcean, Contabo, Oracle Cloud, Lightsail…) com 512 MB de
RAM ou mais.

1. **DNS:** crie um registro `A` (e `AAAA`, se tiver IPv6) do seu domínio, por exemplo
   `central.seudominio.com.br`, apontando para o IP da VPS.
2. **Firewall:** libere as portas **80** e **443** (o Caddy usa a 80 para pedir o certificado).
3. **Docker:** instale o Docker com o plugin Compose (`curl -fsSL https://get.docker.com | sh`).
4. **Projeto e segredos:**

   ```bash
   git clone https://github.com/MarceloCRM/central-do-pc.git
   cd central-do-pc/selfhost
   cp .env.example .env
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ou: openssl rand -hex 32
   nano .env      # DOMINIO e os três segredos
   ```

5. **Subir:**

   ```bash
   docker compose up -d --build
   docker compose logs -f        # Ctrl+C para sair
   ```

6. Abra `https://SEU-DOMINIO` no celular e siga a [instalação](instalacao.md#4-cadastrar-o-celular)
   a partir do passo 4. O comando de instalação dos agentes já sai com o seu domínio.

**Atualizar:** `git pull` e `docker compose up -d --build`, na pasta `selfhost/`.

**Backup:** o banco está no volume `central-dados`.

```bash
docker compose cp central:/data ./backup-central      # copia o banco para ./backup-central
```

Para restaurar, pare a central (`docker compose stop central`), copie de volta com
`docker compose cp ./backup-central/. central:/data` e suba de novo.

## Opção B: VPS sem Docker

Com Node.js 22+ na VPS e o [Caddy](https://caddyserver.com/docs/install) instalado pelo
gerenciador de pacotes:

```bash
git clone https://github.com/MarceloCRM/central-do-pc.git /opt/central-do-pc
cd /opt/central-do-pc
npm ci
mkdir -p dados
```

Segredos em `/etc/central-do-pc.env` (só o root lê: `chmod 600`):

```
SETUP_TOKEN=...
DEVICE_SECRET=...
AGENT_SECRET=...
```

Serviço do systemd em `/etc/systemd/system/central-do-pc.service`:

```ini
[Unit]
Description=Central do PC
After=network-online.target

[Service]
WorkingDirectory=/opt/central-do-pc
EnvironmentFile=/etc/central-do-pc.env
ExecStart=/usr/bin/npm run serve
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

`npm run serve` escuta só em `127.0.0.1:8080` e guarda o banco em `dados/` (dê permissão de escrita
ao usuário do serviço: `chown -R www-data dados`). Ative com `systemctl enable --now central-do-pc`.

No `/etc/caddy/Caddyfile`:

```
central.seudominio.com.br {
	reverse_proxy 127.0.0.1:8080 {
		header_up CF-Connecting-IP {remote_host}
	}
}
```

e `systemctl reload caddy`. Backup: a pasta `/opt/central-do-pc/dados`.

## Opção C: serviços de contêiner (Fly.io, Railway, Render, Koyeb…)

Use o `selfhost/Dockerfile`, com a **raiz do projeto** como contexto do build:

- **Porta:** 8080 (HTTP; o serviço põe o HTTPS na frente).
- **Disco persistente** montado em `/data` (às vezes chamado de "volume").
- **Variáveis de ambiente:** `SETUP_TOKEN`, `DEVICE_SECRET`, `AGENT_SECRET` e `CLIENT_IP_HEADER`
  (veja abaixo).
- **Uma instância**, sempre ligada. Planos que "dormem" sem acesso não servem: os agentes e o ESP32
  precisam encontrar o servidor a qualquer hora.

O endereço que o serviço dá (como `central.fly.dev`) já é HTTPS e serve como domínio.

## Opção D: servidor em casa

Um Raspberry Pi ou um PC sempre ligado também rodam a Opção A ou B. Para não abrir portas no
roteador, publique por um túnel: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
(manda o `CF-Connecting-IP` sozinho) ou [Tailscale Funnel](https://tailscale.com/kb/1223/funnel).
Aponte o túnel para `http://localhost:8080` e dispense o Caddy.

## O IP do visitante

A central limita tentativas por IP (30 desafios de passkey por minuto), para quem abusa bloquear só
a si mesmo. Ela lê o IP do cabeçalho `CF-Connecting-IP`:

- o `Caddyfile` deste projeto e o Cloudflare Tunnel já preenchem esse cabeçalho;
- em outros proxies, defina `CLIENT_IP_HEADER` com o cabeçalho que ele usa: `Fly-Client-IP` no
  Fly.io, `X-Forwarded-For` na maioria dos outros (a central usa o último IP da lista, o que o
  proxy acrescentou).

Sem isso, todos os visitantes contam como o mesmo IP, e alguém tentando entrar pode atrasar o seu
próprio acesso por um minuto.

## Vindo da Cloudflare?

O servidor novo começa vazio. Depois de subir:

1. **Cadastre os aparelhos de novo**: a passkey fica presa ao domínio antigo.
2. **Adicione os computadores** em **Sistema → Computadores** e reinstale o agente em cada PC com o
   comando novo (ele traz o endereço novo).
3. No ESP32, troque o `WORKER_HOST` no `secrets.h` e grave de novo.

Se quiser manter as mesmas chaves, use o mesmo `AGENT_SECRET` e o `DEVICE_SECRET` da Cloudflare.

## Testar a hospedagem própria

```powershell
npm run test:selfhost
```

Roda o teste completo do projeto (o mesmo do `npm test`) com o servidor no workerd, pela
`selfhost/config.capnp`, em vez do `wrangler dev`.
