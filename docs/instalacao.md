# Instalação

Passo a passo para colocar a sua própria Central do PC no ar, na Cloudflare. Leva uns 20 minutos
sem o ESP32.

> Prefere uma VPS ou outro serviço? Faça a hospedagem por [hospedagem-propria.md](hospedagem-propria.md)
> no lugar dos passos 1 a 3 e continue daqui a partir do [passo 4](#4-cadastrar-o-celular).

1. [Preparar o computador que vai publicar](#1-preparar-o-computador-que-vai-publicar)
2. [Publicar o Worker na Cloudflare](#2-publicar-o-worker-na-cloudflare)
3. [Criar os segredos](#3-criar-os-segredos)
4. [Cadastrar o celular](#4-cadastrar-o-celular)
5. [Instalar o agente em cada PC](#5-instalar-o-agente-em-cada-pc)
6. [Instalar como app no celular](#6-instalar-como-app-no-celular)
7. [Opcionais](#7-opcionais): temperaturas, acordar pela rede, ESP32, Claude e Codex
8. [Atualizar](#8-atualizar)
9. [Desinstalar](#9-desinstalar)
10. [Problemas comuns](#10-problemas-comuns)

## 1. Preparar o computador que vai publicar

Pode ser o próprio PC que você vai controlar.

1. Instale o [Node.js](https://nodejs.org) **22 ou mais novo** (a versão LTS serve) e o
   [Git](https://git-scm.com).
2. Crie uma conta gratuita na [Cloudflare](https://dash.cloudflare.com/sign-up). Não precisa de
   domínio próprio: o Worker ganha um endereço `*.workers.dev`.
3. Baixe o projeto:

   ```powershell
   git clone https://github.com/MarceloCRM/central-do-pc.git
   cd central-do-pc
   npm install
   ```

## 2. Publicar o Worker na Cloudflare

```powershell
npx wrangler login      # abre o navegador para autorizar o wrangler na sua conta
npx wrangler deploy
```

No fim aparece o endereço, por exemplo `https://wol-passkey.SEU-USUARIO.workers.dev`. Guarde-o.

- Na primeira vez a Cloudflare pode pedir para escolher o subdomínio `workers.dev` da conta.
- O nome `wol-passkey` vem do `wrangler.toml`. Para outro endereço, troque `name` lá antes do deploy.
- A central usa um Durable Object com SQLite, disponível no plano gratuito.

## 3. Criar os segredos

A central usa três segredos. Eles ficam só na Cloudflare: não dá para ler o valor de volta, então
**anote-os num gerenciador de senhas**.

| Segredo | Para quê |
| --- | --- |
| `SETUP_TOKEN` | Cadastrar e remover os aparelhos que entram na central |
| `DEVICE_SECRET` | Conversa assinada com o ESP32 (crie mesmo sem ESP32) |
| `AGENT_SECRET` | Origem das chaves dos agentes, uma por PC |

Gere um valor aleatório para cada um e grave:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # rode 3 vezes, um valor para cada
npx wrangler secret put SETUP_TOKEN      # cole o valor quando pedir
npx wrangler secret put DEVICE_SECRET
npx wrangler secret put AGENT_SECRET
```

Até os três existirem, a página mostra um erro pedindo para defini-los.

## 4. Cadastrar o celular

1. Abra o endereço do Worker no celular (Chrome no Android, Safari no iPhone).
2. Toque em **Configurar aparelhos**, cole o `SETUP_TOKEN` e toque em **Cadastrar este aparelho**.
3. Confirme com a digital, o rosto ou o PIN. Pronto: esse aparelho é uma chave de acesso.

Dá para cadastrar até 5 aparelhos (celular, tablet, notebook…). **Remover todos os aparelhos**, na
mesma tela, também pede o `SETUP_TOKEN` e apaga todos de uma vez: os computadores da central são
mantidos.

## 5. Instalar o agente em cada PC

O agente é o programa que executa no Windows o que você pede na central. Ele roda com as
permissões do seu usuário (sem administrador) e inicia sozinho quando você entra no Windows.

1. No celular, toque em **Entrar na central** e vá na aba **Sistema → Computadores**.
2. O primeiro PC, **Desktop**, já existe. Toque em **Instalar** e confirme com a digital: aparece
   um comando como este (com a chave de verdade no lugar de `CHAVE`):

   ```powershell
   powershell -ExecutionPolicy Bypass -File agent\install.ps1 -Url https://wol-passkey.SEU-USUARIO.workers.dev -Pc desktop -Secret CHAVE
   ```

3. No PC: instale o Node.js 22+, baixe o projeto (`git clone` ou **Code → Download ZIP** no
   GitHub), abra o PowerShell **na pasta do projeto** e cole o comando.
4. O instalador copia o agente para `%LOCALAPPDATA%\CentralPC\agent`, compila o ajudante
   (`helper.exe`) com o compilador que já vem no Windows, baixa as dependências e cria a tarefa
   agendada **Central do PC - Agente**. Em alguns segundos o PC aparece como ligado na central.

Para **mais PCs**: em **Sistema → Computadores**, escreva o nome (por exemplo "Notebook") e toque em
**Adicionar**. A central mostra o comando de instalação daquele PC; rode-o nele como no passo 3.
Cabem até 8 PCs.

> O comando de instalação leva a chave do PC. Não mande para ninguém nem deixe salvo num lugar
> público. Se vazar, remova o PC na central e adicione de novo: ele ganha uma chave nova.

Depois de instalado, a pasta do projeto pode ser apagada; o agente fica na pasta dele.

## 6. Instalar como app no celular

- **Android (Chrome)**: abra o endereço e toque em **Instalar app** no topo da página (ou no menu ⋮,
  "Instalar app").
- **iPhone (Safari)**: Compartilhar → **Adicionar à Tela de Início**. O app do iPhone tem cookies
  próprios: entre uma vez com a digital dentro dele.

- **Computador (Chrome ou Edge)**: o mesmo botão **Instalar app**, ou o ícone de instalar na barra
  de endereço. A central abre numa janela própria.

O app é a mesma página. Nada fica guardado no celular: sem internet ele só mostra um aviso, e as
atualizações chegam sozinhas. O botão **Instalar app** só aparece quando o navegador permite instalar
(Chrome e Edge) e some depois de instalado.

**Ícone ou nome antigo depois de uma atualização?** O Android troca sozinho, mas pode levar alguns
dias; o iPhone não troca. Para atualizar na hora, remova o app e instale de novo (no iPhone, entre
de novo com a digital dentro dele).

## 7. Opcionais

### Temperaturas da CPU

Ler a temperatura exige administrador, e o agente roda sem privilégios. Uma tarefa separada,
**Central do PC - Sensores**, roda como SYSTEM e grava as leituras em
`C:\ProgramData\CentralPC\sensors.json`; o agente só lê esse arquivo. Num PowerShell **como
administrador**, na pasta do projeto:

```powershell
powershell -ExecutionPolicy Bypass -File agent\install-sensores.ps1
```

O script baixa o [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor)
e, se faltar, o driver PawnIO, das releases oficiais, e confere o hash de cada um. Para remover:
o mesmo comando com `-Remove`.

### Acordar pela rede (Wake-on-LAN)

Para o botão de ligar funcionar, a placa de rede precisa estar liberada para acordar o PC. Rode
uma vez em cada PC (pede administrador sozinho):

```powershell
powershell -ExecutionPolicy Bypass -File agent\acordar-pela-rede.ps1
```

O script mostra o **MAC** de cada placa: anote o da placa que o ESP32 vai acordar.

- **Pelo cabo**, o PC acorda do repouso, da hibernação e desligado, se a BIOS permitir (procure
  "Wake on LAN" ou "Power on by PCI-E" na BIOS).
- **Pelo Wi-Fi**, só acorda do repouso. O Windows hiberna depois de algumas horas repousando
  (padrão do plano de energia), e daí o Wi-Fi não acorda mais.
- O agente só roda com alguém logado no Windows. Depois de ligar o PC do zero, ele fica parado na
  tela de senha e a central mostra "sem resposta". Para usar de longe, ligue o logon automático
  (veja abaixo).

### Entrar sozinho ao ligar (logon automático)

Faz o Windows entrar sozinho na sua conta quando o PC liga, e o agente bloqueia a tela logo em
seguida. Assim o PC ligado pela central aparece como ligado e tudo funciona de longe. Rode uma vez,
na pasta do projeto (pede administrador sozinho):

```powershell
powershell -ExecutionPolicy Bypass -File agent\entrar-sozinho.ps1
```

O script desliga "só permitir entrar com Windows Hello", baixa o
[Autologon](https://learn.microsoft.com/sysinternals/downloads/autologon) da Microsoft (confere a
assinatura) e abre ele: **você** digita a senha do Windows e clica em **Enable**. A senha fica
guardada criptografada pelo próprio Windows. Depois o script liga a opção `lockAtBoot` do agente.

- Entre o Windows entrar e a tela bloquear passam alguns segundos com a área de trabalho aberta,
  para quem estiver na frente do PC.
- Para desligar: o mesmo comando com `-Remove` (clique em **Disable** no Autologon).

### ESP32 (ligar o PC desligado)

Um ESP32 qualquer (ESP32 Dev Module, ESP32-S3…) ligado na energia e no Wi-Fi 2,4 GHz da mesma rede
do PC. Ele consulta o Worker a cada 5 segundos e, quando você autoriza com a digital, manda o
"pacote mágico" do Wake-on-LAN três vezes.

1. Instale a [Arduino IDE](https://www.arduino.cc/en/software) e o pacote de placas **esp32** da
   Espressif (Gerenciador de Placas).
2. Copie `esp32/esp32_wol_passkey/secrets.example.h` para `secrets.h` na mesma pasta e preencha:
   Wi-Fi, `DEVICE_SECRET` (o mesmo da Cloudflare), `WORKER_HOST` (o endereço do Worker sem
   `https://`) e `MAC_PC` (o MAC anotado acima). O `secrets.h` não vai para o Git.
3. Abra `esp32_wol_passkey.ino`, escolha a placa (**ESP32 Dev Module**, ou **ESP32S3 Dev Module**)
   e grave. No Monitor Serial (115200) aparecem as consultas; a central passa a mostrar
   **ESP32 online**.

O ESP32 liga só o PC **Desktop** (o primeiro da lista). Os outros PCs precisam estar ligados.

### Claude Code e Codex (vibecoding)

- **Claude**: instale o [Claude Code](https://docs.anthropic.com/en/docs/claude-code) no PC e
  entre na sua conta uma vez, rodando `claude` no PowerShell. A central abre o Claude com
  `--remote-control`, então a sessão também aparece no app do Claude.
- **Codex**: `npm i -g @openai/codex` e rode `codex` uma vez para entrar.

Para mudar os argumentos do Claude ou as pastas sugeridas, edite o `config.json` do agente (veja
[como-usar.md](como-usar.md#configuração-do-agente)).

## 8. Atualizar

```powershell
git pull
npm install
npx wrangler deploy                                           # o Worker e a página
powershell -ExecutionPolicy Bypass -File agent\install.ps1    # em cada PC, na pasta do projeto atualizada
```

Rodar o `install.ps1` sem parâmetros mantém o `config.json` (endereço, PC e chave) e o
`programs.json`. Atualizar o agente reinicia ele, e **os terminais abertos naquele PC fecham**.

Depois de um deploy, a Cloudflare pode levar alguns minutos para trocar o código; nesse intervalo o
terminal pode cair, e o agente reconecta sozinho.

## 9. Desinstalar

Em cada PC, no PowerShell:

```powershell
Unregister-ScheduledTask -TaskName 'Central do PC - Agente' -Confirm:$false
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object CommandLine -like '*CentralPC*' | ForEach-Object { Stop-Process -Id $_.ProcessId }
Remove-Item "$env:LOCALAPPDATA\CentralPC" -Recurse -Force
Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name CentralPCAgente -ErrorAction SilentlyContinue
```

Se instalou os sensores: `agent\install-sensores.ps1 -Remove` como administrador. Para apagar o
Worker e tudo o que ele guardou: `npx wrangler delete`.

## 10. Problemas comuns

| Sintoma | O que fazer |
| --- | --- |
| A página diz para definir os secrets | Faltou algum dos três do passo 3. `npx wrangler secret list` mostra quais existem. |
| "Nenhum aparelho cadastrado" | Faça o passo 4. |
| O cadastro do aparelho não abre a digital | Use o Chrome (Android) ou o Safari (iPhone) atualizados, com bloqueio de tela configurado. |
| O PC aparece "sem resposta" | Veja o fim de `%LOCALAPPDATA%\CentralPC\agent\agent.log`. "Assinatura inválida": chave errada; pegue o comando de novo em **Instalar**. "PC desconhecido": o PC foi removido na central. "Relógio fora de sincronia": acerte o relógio do Windows. |
| `npm install` do agente falha compilando o `node-pty` | Use o Node.js LTS. Se ainda pedir compilação, instale as "Ferramentas de Build do Visual Studio" (C++). |
| Terminal não abre ("não está conectado para terminais") | O agente está desligado ou reconectando. Espere alguns segundos ou veja o `agent.log`. |
| ESP32 offline | Veja o Monitor Serial: Wi-Fi (só 2,4 GHz), `WORKER_HOST` sem `https://` e o `DEVICE_SECRET` igual ao da Cloudflare. |
| O PC ligou pela central, mas aparece "sem resposta" | Ele está na tela de senha: o agente só roda depois que alguém entra no Windows. Ligue o logon automático ([Entrar sozinho ao ligar](#entrar-sozinho-ao-ligar-logon-automático)). |
| O PC não liga pelo botão | O ESP32 precisa estar online. Rode `acordar-pela-rede.ps1`, confira o `MAC_PC` e a opção de Wake-on-LAN na BIOS. |
| Sem temperaturas | Instale a tarefa de sensores (seção 7). |
