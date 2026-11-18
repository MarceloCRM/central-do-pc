# Como usar

A central tem quatro abas na barra de baixo: **Início**, **Código**, **Apps** e **Sistema**. No topo
ficam o estado do ESP32, o estado do PC escolhido e, com mais de um PC, as abas de cada computador.

## A regra da digital

Tudo o que muda alguma coisa pede a passkey (digital, rosto ou PIN), e cada confirmação vale só para
aquela ação, naquele PC:

- entrar na central;
- ligar o PC;
- **trocar de PC** (as abas no topo);
- cada ação de energia, o print, abrir e cadastrar um app;
- **abrir o explorador** de pastas (vale para aquele PC até trocar de PC ou sair);
- **abrir** um terminal, **reconectar** a um terminal aberto em outra sessão e **encerrar** um terminal;
- **adicionar**, **remover** um computador e **ver o comando de instalação** dele.

Ver o painel, ver as sessões do Claude/Codex e digitar num terminal já aberto não pedem.

A sessão dura **1 hora**, sem renovação. Quando ela acaba, os terminais continuam rodando no PC:
entre de novo com a digital e tudo volta como estava, inclusive o terminal que estava na tela.
**Sair da central** fecha a sessão; os terminais continuam no PC até serem encerrados.

## Início

- **Botão de ligar**: com o PC desligado, toque e confirme; o ESP32 manda o Wake-on-LAN. Com o PC
  ligado, o botão fica verde e o anel mostra o uso da CPU (âmbar acima de 85%).
- **Estado**: há quanto tempo o PC está ligado e se a sessão do Windows está aberta, bloqueada ou
  sem ninguém.
- **Energia**: bloquear, suspender, reiniciar e desligar. Reiniciar e desligar fecham os programas
  em 10 segundos, e o que não estiver salvo se perde.
- **Repouso → Manter acordado**: impede que o PC repouse ou hiberne sozinho por ficar parado.
  Continua valendo depois de reiniciar o agente ou o PC, até você tocar em "Deixar repousar". Não
  muda o que fazem a tampa, o botão de energia e a bateria crítica: num notebook, a página avisa se
  fechar a tampa ainda suspende e diz onde mudar.
- **Tela → Capturar tela**: tira um print. Toque na imagem para ampliar. O print é apagado do
  servidor em 10 minutos.

## Código

### Terminal

Lista os terminais abertos no PC. Toque num para voltar a ele.

- É um terminal de verdade (ConPTY): cores, setas, Ctrl+C e programas interativos funcionam.
- Os terminais **continuam rodando com a página fechada**. Ao voltar, a tela é restaurada: o agente
  guarda o último ~1 milhão de caracteres de cada um, e a tela rola até 30 mil linhas.
- No celular, arraste o dedo no terminal para rolar o histórico. A barra de teclas tem Esc, Tab,
  Ctrl, setas e outras que o teclado do celular não tem.
- Limite: 6 terminais abertos por vez. Se o agente ou o PC reiniciar, os terminais se perdem.

### Vibecoding

1. Escolha o assistente: **Claude** ou **Codex**.
2. Escolha a pasta: digite, toque numa sugestão ou use **Explorar pastas**.
3. Aparecem as **3 últimas sessões** daquele assistente na pasta. Toque numa para retomar, ou em
   **Nova sessão**.

- **Claude** abre um PowerShell na pasta e roda `claude --remote-control <nome da pasta>`. A sessão
  também aparece no app do Claude e em claude.ai/code com esse nome. Retomar usa `--resume`.
- **Codex** roda `codex` (ou `codex resume <id>`) na pasta.
- Também dá para abrir **PowerShell** ou **CMD** na pasta escolhida.
- Evite retomar uma sessão que ainda está aberta em outro lugar: feche a outra antes.
- As sessões vêm dos arquivos que o próprio Claude (`~/.claude/projects`) e o Codex
  (`~/.codex/sessions`) salvam no PC. Sessões sem nenhum pedido não aparecem.

### Explorar pastas

Navega pelas pastas e arquivos do PC (pede a digital): caminho clicável, atalhos para a pasta do
usuário e os discos, e botões para abrir Claude, PowerShell ou CMD na pasta mostrada. Só lê: não
apaga nem move nada.

## Apps

A lista de programas que a central pode abrir naquele PC.

- **Cadastrar app** abre o explorador já em Arquivos de Programas: navegue até a pasta do app, toque
  no `.exe`, confira o nome e confirme com a digital. O app entra no `programs.json` daquele PC (até
  24 apps).
- Para tirar um app da lista, edite o `programs.json` no PC (veja abaixo).

## Sistema

- **Processador, Memória, Temperaturas e Discos**: com a página aberta, os dados atualizam a cada 5
  segundos. "Detalhes" mostra núcleos e os processos que mais usam CPU e memória.
- **Computadores**: a lista de PCs da central.
  - **Adicionar**: dê um nome e confirme com a digital. A central mostra o comando de instalação
    do agente para rodar naquele PC (veja [instalacao.md](instalacao.md#5-instalar-o-agente-em-cada-pc)).
  - **Instalar**: mostra de novo o comando de um PC (para reinstalar ou se você perdeu).
  - **Remover**: tira o PC da central na hora. O agente dele para de entrar, os terminais e dados
    dele somem, e quem estava naquele PC volta para o Desktop. Adicionar de novo cria outro id e
    outra chave.
  - O **Desktop** é o PC que o ESP32 liga e não pode ser removido.
- **Configurar aparelhos**: cadastrar este aparelho ou remover todos (pede o `SETUP_TOKEN`).
- **Sair da central**.

## Configuração do agente

Na pasta do agente, `%LOCALAPPDATA%\CentralPC\agent`:

| Arquivo | O que é |
| --- | --- |
| `config.json` | Endereço do Worker (`url`), id do PC (`pc`) e a chave dele (`secret`). **Não compartilhe.** |
| `programs.json` | Apps que a central abre: `id`, `label`, `path` e `args` (opcional). |
| `state.json` | Pastas usadas há pouco e se o "manter acordado" está ligado. |
| `agent.log` | Registro do agente. Não grava segredos nem o que passa pelos terminais. |
| `helper.exe` | Ajudante que lê métricas, tira o print e suspende o PC (compilado de `helper.cs`). |

Opções do `config.json` além das três obrigatórias:

- `folders`: pastas que sempre aparecem como sugestão, por exemplo `["C:\\Projetos\\site"]`.
- `folderRoots`: pastas cujas subpastas viram sugestão (padrão: a Área de Trabalho).
- `claudeArgs`: argumentos do Claude (padrão: `["--remote-control"]`).

Depois de editar, reinicie o agente: rode o `install.ps1` de novo ou reinicie a sessão do Windows.
