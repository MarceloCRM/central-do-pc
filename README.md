# Central do PC

Ligue, acompanhe e controle os seus computadores Windows pelo celular, com a **digital ou o rosto**
(passkey) em toda ação importante. Funciona como um app instalado no celular e não precisa abrir
nenhuma porta no roteador.

- **Ligar o PC** de longe: um ESP32 na sua rede manda o Wake-on-LAN quando você autoriza.
- **Painel**: CPU, memória, discos, temperaturas e os processos que mais pesam.
- **Ações**: bloquear, suspender, reiniciar, desligar, manter acordado, print da tela e abrir apps.
- **Terminal no navegador**: PowerShell, CMD, Claude Code ou Codex rodando de verdade no PC.
- **Vibecoding**: escolha Claude ou Codex e a pasta; as 3 últimas sessões aparecem para retomar.
- **Explorador de pastas** do PC, para abrir um terminal numa pasta ou cadastrar um app.
- **Vários computadores**: adicione até 8 PCs pela própria central, cada um com a sua chave.
- **App**: instale no Android ou no iPhone e abra pelo ícone, em tela cheia.

## Como funciona, em uma figura

```
 Celular (página / app)
        │  digital ou rosto (passkey)
        ▼
 Cloudflare Worker + Durable Object   ← o servidor, na sua conta gratuita da Cloudflare
   ├──────────────►  Agente no PC 1   (programa Node que roda escondido no Windows)
   ├──────────────►  Agente no PC 2
   └──────────────►  ESP32 na sua rede (opcional: só para LIGAR um PC desligado)
```

Os agentes e o ESP32 é que se conectam ao servidor, nunca o contrário: nada no seu PC ou no
roteador fica exposto à internet. Cada pessoa publica a **própria** cópia do servidor; não existe um
servidor central compartilhado.

## Onde hospedar

| Caminho | Para quem | Guia |
| --- | --- | --- |
| **Cloudflare** (recomendado) | Quase todo mundo: grátis, sem servidor para cuidar, no ar em minutos | [Instalação rápida](#instalação-rápida) |
| **VPS com Docker** | Quem prefere não depender da Cloudflare: Docker Compose com HTTPS automático | [docs/hospedagem-propria.md](docs/hospedagem-propria.md#opção-a-vps-com-docker-recomendada) |
| **VPS sem Docker, serviços de contêiner ou servidor em casa** | Fly.io, Railway, Render, Raspberry Pi… | [docs/hospedagem-propria.md](docs/hospedagem-propria.md) |

O servidor é o mesmo código nos dois casos: fora da Cloudflare ele roda no
[workerd](https://github.com/cloudflare/workerd), o motor de código aberto dela.

Detalhes em [docs/como-funciona.md](docs/como-funciona.md).

## O que você precisa

| Item | Para quê | Obrigatório? |
| --- | --- | --- |
| Conta na [Cloudflare](https://dash.cloudflare.com/sign-up) (plano gratuito) **ou** uma VPS com domínio | Hospedar o servidor | Sim |
| Node.js 22 ou mais novo e Git, num computador | Publicar o Worker | Sim |
| PC com Windows 10 ou 11 e Node.js 22+ | Rodar o agente | Sim, em cada PC |
| Celular ou computador com passkey (digital, rosto ou PIN) | Entrar e autorizar ações | Sim |
| ESP32 + PC ligado por cabo de rede (ou Wi-Fi que acorde do repouso) | Ligar o PC desligado | Não |
| Claude Code e/ou Codex instalados no PC | Vibecoding | Não |

## Instalação rápida

Na Cloudflare (para VPS, veja [docs/hospedagem-propria.md](docs/hospedagem-propria.md)). O passo a passo completo, com explicações e solução de problemas, está em
**[docs/instalacao.md](docs/instalacao.md)**. Resumo:

```powershell
# 1. Baixe o projeto e as dependências
git clone https://github.com/MarceloCRM/central-do-pc.git
cd central-do-pc
npm install

# 2. Entre na Cloudflare e publique o Worker (mostra o endereço: https://wol-passkey.SEU-USUARIO.workers.dev)
npx wrangler login
npx wrangler deploy

# 3. Crie os três segredos (rode uma vez para cada; cole um valor aleatório quando pedir)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx wrangler secret put SETUP_TOKEN
npx wrangler secret put DEVICE_SECRET
npx wrangler secret put AGENT_SECRET
```

4. Abra o endereço do Worker no celular, toque em **Configurar aparelhos**, cole o `SETUP_TOKEN`
   e toque em **Cadastrar este aparelho** (a digital ou o rosto viram a sua chave de acesso).
5. Toque em **Entrar na central** e vá em **Sistema → Computadores → Instalar**. A central mostra o
   comando de instalação do agente, já com o endereço e a chave daquele PC.
6. No PC, baixe o projeto, abra o PowerShell na pasta dele e cole o comando. Em segundos o PC
   aparece como ligado na central.
7. Para mais PCs: **Sistema → Computadores → Adicionar computador**, e repita o passo 6 no PC novo.

Opcionais: temperaturas da CPU, ligar pelo ESP32 e acordar pela rede, em
[docs/instalacao.md](docs/instalacao.md#7-opcionais).

## Documentação

| Documento | O que tem |
| --- | --- |
| [docs/instalacao.md](docs/instalacao.md) | Instalação completa na Cloudflare, atualização, desinstalação e problemas comuns |
| [docs/hospedagem-propria.md](docs/hospedagem-propria.md) | Rodar numa VPS (Docker ou não), em serviços de contêiner ou num servidor em casa |
| [docs/como-usar.md](docs/como-usar.md) | Cada aba e função da central: ligar, terminais, vibecoding, apps, computadores |
| [docs/como-funciona.md](docs/como-funciona.md) | Arquitetura, o que acontece em cada ação e o modelo de segurança |
| [docs/desenvolvimento.md](docs/desenvolvimento.md) | Estrutura do código, testes, rodar localmente e regras do projeto |

## Segurança, em poucas linhas

- Entrar e **toda** ação que muda alguma coisa (ligar, desligar, abrir terminal, trocar de PC, abrir
  o explorador, adicionar ou remover computador) pedem a passkey de novo.
- Só aparelhos cadastrados entram, e cadastrar um aparelho exige o `SETUP_TOKEN`.
- Cada PC tem a sua chave: a de um não serve para se passar por outro, e remover um PC na central
  invalida a chave dele na hora.
- Os segredos ficam só na Cloudflare (`wrangler secret`) e nos arquivos locais que o Git ignora.

O agente dá acesso de terminal ao PC para quem tem a sua passkey. Leia
[docs/como-funciona.md](docs/como-funciona.md#segurança) antes de instalar num computador de
trabalho ou compartilhado.

## Licença

[MIT](LICENSE). Use, modifique e distribua à vontade, sem garantia.
