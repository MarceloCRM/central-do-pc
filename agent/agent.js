'use strict';
/*
  Agente do Windows da Central do PC.

  Roda na sessão do usuário (inicia junto com o logon) e faz três coisas:

    1. Consulta o Worker a cada poucos segundos (HTTP assinado com HMAC), envia as
       métricas do PC e executa os comandos da lista fixa: bloquear, suspender,
       reiniciar, desligar, manter acordado, print da tela e abrir programas do
       programs.json.

    2. Mantém um WebSocket aberto com o Worker (o "túnel"). Os dois lados provam que
       conhecem o segredo, e cada mensagem que desce vem numerada e assinada.

    3. Pelo túnel, abre terminais de verdade (ConPTY): cmd, PowerShell ou o Claude
       Code com Remote Control. O Worker só pede isso depois que a passkey autorizou.

  Nada aqui aceita conexões de entrada: o agente só faz conexões de saída para a URL
  do config.json.

  Arquivos, na mesma pasta:
    config.json     url do Worker, id deste PC (pc) e a chave dele (não vai para o Git)
    programs.json   programas que a central pode abrir (a central também cadastra novos)
    helper.exe      métricas, print e suspender (compilado de helper.cs pelo install.ps1)
    state.json      pastas usadas recentemente e se o modo "manter acordado" está ligado
    agent.log       registro
*/

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const util = require('node:util');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { spawn, execFile } = require('node:child_process');
const pty = require('node-pty');

const DIR = __dirname;
const HOME = os.homedir();
const CONFIG_FILE = process.env.WOL_AGENT_CONFIG || path.join(DIR, 'config.json');
// Os dados ficam junto do config.json (nos testes, cada agente tem a sua pasta).
const DATA_DIR = path.dirname(CONFIG_FILE);
const LOG_FILE = path.join(DATA_DIR, 'agent.log');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PROGRAMS_FILE = path.join(DATA_DIR, 'programs.json');
const HELPER_EXE = path.join(DIR, 'helper.exe');

const POLL_FAST_MS = 5_000;        // com o painel aberto
const POLL_IDLE_MS = 10_000;       // o Worker dá o PC como desligado depois de 30 s sem consulta
const METRICS_IDLE_MS = 60_000;    // sem ninguém olhando, as métricas vão só de vez em quando
const MAX_POLL_BODY = 15_000;      // o Worker recusa acima de 16 KB
const MAX_TERMS = 6;
const SCROLLBACK = 1_000_000;      // caracteres guardados por terminal para quem reconectar
const FRAME_MAX = 60_000;          // caracteres por mensagem de saída
const REPLAY_FRAME = 200_000;      // idem, para a cópia da tela (o limite do Worker é 1 MiB por mensagem)
const TERM_ID = /^[A-Za-z0-9_-]{11}$/;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CLAUDE_PROJECTS = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(HOME, '.claude'), 'projects');
const CODEX_SESSIONS = path.join(process.env.CODEX_HOME || path.join(HOME, '.codex'), 'sessions');
const CODEX_SCAN = 300;            // arquivos de sessão do Codex olhados por pedido (os mais novos)
const CODEX_HEAD = 64 * 1024;      // a pasta fica na primeira linha; o primeiro pedido, logo depois
const AGENT_SHELLS = new Set(['claude', 'codex']);   // terminais que retomam uma sessão pelo id
const MAX_DIRS = 400;              // subpastas listadas por pasta
const MAX_FILES = 400;             // arquivos listados por pasta
const MAX_PROGRAMS = 24;
const MAX_SESSIONS = 3;
const SESSION_TAIL = 512 * 1024;   // o título e o último pedido ficam perto do fim do arquivo da sessão
const PROGRAM_ID = /^[a-z0-9_-]{1,32}$/;
const GB = 1024 ** 3;

// Variáveis que marcam "estou dentro de uma sessão do Claude Code". Se o agente foi iniciado
// de dentro de uma, elas não podem vazar para os terminais (um Claude novo ficaria confuso).
const SESSION_ENV = new Set([
  'CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_MESSAGING_SOCKET', 'CLAUDE_CODE_MESSAGING_TOKEN', 'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_SSE_PORT', 'CLAUDE_EFFORT', 'CLAUDE_PID',
]);

/* ------------------------------------------------------------------ */
/* Registro e configuração                                             */
/* ------------------------------------------------------------------ */

// O registro nunca recebe segredos nem o que passa pelos terminais.
function log(...parts) {
  const line = new Date().toISOString() + ' ' + parts.map((p) => (typeof p === 'string' ? p : util.inspect(p))).join(' ');
  console.log(line);
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 1_000_000) fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {
    /* sem registro em arquivo: segue só no console */
  }
}

function fatal(message) {
  log('ERRO:', message);
  process.exit(1);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));   // o PowerShell grava com BOM
}

function loadConfig() {
  const file = CONFIG_FILE;
  let raw;
  try {
    raw = readJson(file);
  } catch (e) {
    fatal('não consegui ler ' + file + ': ' + e.message + '. Rode o install.ps1 ou copie config.example.json.');
  }
  const url = String(raw.url || '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+$/.test(url)) fatal('config.json: "url" precisa ser o endereço do Worker, sem caminho.');
  if (url.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
    fatal('config.json: http:// só vale para testes neste PC. Use https://.');
  }
  if (typeof raw.secret !== 'string' || raw.secret.length < 16) fatal('config.json: "secret" (a chave deste PC) está faltando.');
  const pc = String(raw.pc || '');
  if (!/^[a-z0-9-]{1,20}$/.test(pc)) fatal('config.json: "pc" precisa ser o id deste PC na central (aparece na aba Sistema, em Computadores).');
  const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);
  return {
    url,
    pc,
    secret: raw.secret,
    folders: strings(raw.folders),            // pastas que sempre aparecem como atalho na central
    folderRoots: raw.folderRoots === undefined ? [path.join(HOME, 'Desktop')] : strings(raw.folderRoots),
    claudeArgs: raw.claudeArgs === undefined ? ['--remote-control'] : strings(raw.claudeArgs),
  };
}

const cfg = loadConfig();
const WS_URL = cfg.url.replace(/^http/, 'ws');

function hmac(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function sameHex(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/* ------------------------------------------------------------------ */
/* Requisições assinadas                                               */
/* ------------------------------------------------------------------ */

// O Worker exige que cada requisição tenha um horário maior que o da anterior,
// então elas saem uma de cada vez, em fila.
let lastTs = 0;
let httpQueue = Promise.resolve();

function signedPost(pathAndQuery, body, contentType, timeoutMs = 15_000) {
  const run = async () => {
    const ts = Math.max(Date.now(), lastTs + 1);
    lastTs = ts;
    const nonce = crypto.randomBytes(16).toString('hex');
    const sig = hmac(cfg.secret, ['agent', pathAndQuery, String(ts), nonce, sha256(body)].join('|'));
    const res = await fetch(cfg.url + pathAndQuery, {
      method: 'POST',
      headers: { 'content-type': contentType, 'x-pc': cfg.pc, 'x-ts': String(ts), 'x-nonce': nonce, 'x-sig': sig },
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + text.slice(0, 160));
    // A resposta também vem assinada: comandos só valem se vierem de quem conhece o segredo.
    if (!sameHex(res.headers.get('x-sig') || '', hmac(cfg.secret, ['resp', nonce, sha256(text)].join('|')))) {
      throw new Error('a resposta do servidor veio sem assinatura válida');
    }
    return JSON.parse(text);
  };
  const job = httpQueue.then(run, run);
  httpQueue = job.catch(() => {});
  return job;
}

function postJson(pathAndQuery, data) {
  return signedPost(pathAndQuery, Buffer.from(JSON.stringify(data)), 'application/json');
}

/* ------------------------------------------------------------------ */
/* Ajudante (helper.exe): métricas, print e suspender                  */
/* ------------------------------------------------------------------ */

const helper = {
  proc: null,
  current: null,
  queue: [],

  start() {
    // Se o ajudante for reiniciado, ele já volta mantendo o PC acordado (quando for o caso).
    const p = spawn(HELPER_EXE, state.awake ? ['awake'] : [], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    this.proc = p;
    readline.createInterface({ input: p.stdout }).on('line', (line) => {
      const job = this.current;
      if (!job) return;
      this.finish(job);
      try {
        job.resolve(JSON.parse(line));
      } catch {
        job.reject(new Error('resposta inválida do ajudante'));
      }
      this.next();
    });
    const gone = (why) => {
      if (this.proc !== p) return;
      this.proc = null;
      const job = this.current;
      if (job) {
        this.finish(job);
        job.reject(new Error('o ajudante parou: ' + why));
      }
      this.next();
    };
    p.on('error', (e) => gone(e.message));
    p.on('exit', (code) => gone('código ' + code));
    p.stdin.on('error', () => {});
  },

  finish(job) {
    clearTimeout(job.timer);
    this.current = null;
  },

  // Um pedido por vez: o ajudante responde uma linha para cada linha recebida.
  ask(command, timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
      this.queue.push({ command, resolve, reject, timeoutMs });
      this.next();
    });
  },

  next() {
    if (this.current || this.queue.length === 0) return;
    const job = this.queue.shift();
    if (!fs.existsSync(HELPER_EXE)) {
      job.reject(new Error('helper.exe não encontrado (rode o install.ps1)'));
      return this.next();
    }
    if (!this.proc) this.start();
    this.current = job;
    job.timer = setTimeout(() => {
      this.finish(job);
      job.reject(new Error('o ajudante demorou demais'));
      const p = this.proc;
      this.proc = null;
      try { p.kill(); } catch { /* já saiu */ }
      this.next();
    }, job.timeoutMs);
    this.proc.stdin.write(job.command + '\n');
  },

  stop() {
    try { if (this.proc) this.proc.stdin.end(); } catch { /* já saiu */ }
  },
};

async function askHelper(command, timeoutMs) {
  const reply = await helper.ask(command, timeoutMs);
  if (!reply || reply.ok !== true) throw new Error((reply && reply.error) || 'o ajudante recusou o pedido');
  return reply;
}

/* ------------------------------------------------------------------ */
/* Métricas                                                            */
/* ------------------------------------------------------------------ */

const cpuName = (os.cpus()[0] || {}).model ? os.cpus()[0].model.replace(/\s+/g, ' ').trim() : 'Processador';
let physicalCores = 0;
let cpuBefore = os.cpus().map((c) => c.times);
let helperWarned = false;

// Uso de CPU desde a leitura anterior, total e por thread.
function cpuUsage() {
  const now = os.cpus().map((c) => c.times);
  let busyAll = 0;
  let totalAll = 0;
  const cores = now.map((t, i) => {
    const b = cpuBefore[i] || t;
    const idle = t.idle - b.idle;
    const busy = (t.user - b.user) + (t.sys - b.sys);
    busyAll += busy;
    totalAll += busy + idle;
    return busy + idle > 0 ? Math.round((100 * busy) / (busy + idle)) : 0;
  });
  cpuBefore = now;
  return { cpu: totalAll > 0 ? Math.round((100 * busyAll) / totalAll) : 0, cores };
}

let programsCache = { mtime: -1, list: [] };

// programs.json: [{ "id": "vscode", "label": "VS Code", "path": "C:\\...\\Code.exe", "args": [] }]
function loadPrograms() {
  try {
    const mtime = fs.statSync(PROGRAMS_FILE).mtimeMs;
    if (mtime === programsCache.mtime) return programsCache.list;
    const list = [];
    for (const p of readJson(PROGRAMS_FILE)) {
      if (!p || typeof p.id !== 'string' || !PROGRAM_ID.test(p.id)) continue;
      if (typeof p.label !== 'string' || !p.label || typeof p.path !== 'string' || !p.path) continue;
      list.push({
        id: p.id,
        label: p.label.slice(0, 40),
        path: p.path,
        args: Array.isArray(p.args) ? p.args.map(String) : [],
      });
    }
    programsCache = { mtime, list: list.slice(0, MAX_PROGRAMS) };
  } catch (e) {
    if (e.code !== 'ENOENT') log('programs.json inválido:', e.message);
    programsCache = { mtime: -1, list: [] };
  }
  return programsCache.list;
}

// Cadastro pela central (já autorizado pela passkey). O que já estiver no programs.json, inclusive
// campos que a central não usa, fica como está.
function addProgram(file, label) {
  let list = [];
  try {
    list = readJson(PROGRAMS_FILE);
  } catch (e) {
    if (e.code !== 'ENOENT') list = null;
  }
  if (!Array.isArray(list)) return [false, 'O programs.json deste PC está com erro. Corrija ou apague o arquivo.'];
  if (list.length >= MAX_PROGRAMS) return [false, 'A lista já tem ' + MAX_PROGRAMS + ' apps.'];
  if (list.some((p) => p && typeof p.path === 'string' && p.path.toLowerCase() === file.toLowerCase())) {
    return [false, 'Esse app já está na lista.'];
  }
  const base = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'app';
  let id = base;
  for (let n = 2; list.some((p) => p && p.id === id); n++) id = base + '-' + n;
  list.push({ id, label, path: file });
  fs.writeFileSync(PROGRAMS_FILE + '.tmp', JSON.stringify(list, null, 2));
  fs.renameSync(PROGRAMS_FILE + '.tmp', PROGRAMS_FILE);
  programsCache.mtime = -1;
  log('app cadastrado:', id, file);
  return [true, label + ' cadastrado.'];
}

let state = { recent: [], awake: false };
try {
  const saved = readJson(STATE_FILE);
  if (Array.isArray(saved.recent)) state.recent = saved.recent.filter((x) => typeof x === 'string').slice(0, 12);
  state.awake = saved.awake === true;
} catch {
  /* primeira execução */
}

function saveState() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    log('não consegui salvar state.json:', e.message);
  }
}

function rememberFolder(dir) {
  state.recent = [dir, ...state.recent.filter((x) => x.toLowerCase() !== dir.toLowerCase())].slice(0, 12);
  foldersCache.at = 0;
  saveState();
}

// Fica gravado: se o agente ou o PC reiniciar, o modo volta como estava.
async function setAwake(on) {
  const before = state.awake;
  state.awake = on;
  try {
    await askHelper(on ? 'awake 1' : 'awake 0');
  } catch (e) {
    state.awake = before;
    throw e;
  }
  saveState();
  log(on ? 'modo manter acordado ligado' : 'modo manter acordado desligado');
}

let foldersCache = { at: 0, list: [] };

// Atalhos de pasta para a central: usadas há pouco, as do config.json e as subpastas de folderRoots.
function folderList() {
  if (Date.now() - foldersCache.at < 60_000) return foldersCache.list;
  const out = [];
  const add = (p) => {
    if (typeof p !== 'string' || !p || p.length > 200) return;
    if (!out.some((x) => x.toLowerCase() === p.toLowerCase())) out.push(p);
  };
  state.recent.forEach(add);
  cfg.folders.forEach(add);
  add(HOME);
  for (const root of cfg.folderRoots) {
    try {
      const dirs = fs.readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('$'))
        .map((d) => d.name)
        .sort((a, b) => a.localeCompare(b));
      add(root);
      dirs.forEach((name) => add(path.join(root, name)));
    } catch {
      /* a pasta não existe neste PC */
    }
  }
  foldersCache = { at: Date.now(), list: out.slice(0, 40) };
  return foldersCache.list;
}

async function collectMetrics() {
  const usage = cpuUsage();
  let h = {};
  try {
    h = await askHelper('metrics');
    helperWarned = false;
  } catch (e) {
    if (!helperWarned) log('métricas incompletas:', e.message);
    helperWarned = true;
  }
  const total = os.totalmem();
  const metrics = {
    cpu: usage.cpu,
    cores: usage.cores,
    cpuInfo: { name: cpuName, cores: physicalCores || usage.cores.length, threads: usage.cores.length },
    ram: h.ram || { totalGB: Math.round((total / GB) * 10) / 10, usedGB: Math.round(((total - os.freemem()) / GB) * 10) / 10 },
    uptimeSec: Math.round(os.uptime()),
    session: h.session || 'active',
    processCount: h.processCount || 0,
    procs: h.procs || [],
    temps: h.temps || [],
    disks: h.disks || [],
    programs: loadPrograms().map((p) => ({ id: p.id, label: p.label })),
    folders: folderList(),
    awake: state.awake,
    power: h.power || null,
  };
  return metrics;
}

/* ------------------------------------------------------------------ */
/* Comandos da central                                                 */
/* ------------------------------------------------------------------ */

function run(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true }, (err) => (err ? reject(err) : resolve()));
  });
}

async function report(id, ok, message) {
  try {
    await postJson('/api/agent/result', { id, ok, message });
  } catch (e) {
    log('não consegui informar o resultado:', e.message);
  }
}

async function runCommand(c) {
  if (!c || typeof c.id !== 'string' || Date.now() > c.exp) return;   // comando vencido não se executa
  log('comando:', c.action, c.arg || '');
  try {
    switch (c.action) {
      case 'lock':
        await run('rundll32.exe', ['user32.dll,LockWorkStation']);
        return await report(c.id, true, 'Tela bloqueada.');

      case 'sleep':
        await report(c.id, true, 'Suspendendo o PC.');
        setTimeout(() => askHelper('sleep', 3_600_000).catch((e) => log('suspender falhou:', e.message)), 1500);
        return;

      case 'awake-on':
        await setAwake(true);
        return await report(c.id, true, 'O PC não vai mais repousar sozinho.');

      case 'awake-off':
        await setAwake(false);
        return await report(c.id, true, 'O PC volta a repousar quando ficar parado.');

      case 'shutdown':
        await run('shutdown.exe', ['/s', '/t', '10']);
        return await report(c.id, true, 'O PC desliga em 10 segundos.');

      case 'restart':
        await run('shutdown.exe', ['/r', '/t', '10']);
        return await report(c.id, true, 'O PC reinicia em 10 segundos.');

      case 'screenshot': {
        const file = path.join(os.tmpdir(), 'central-print-' + crypto.randomBytes(6).toString('hex') + '.jpg');
        try {
          await askHelper('shot ' + file);
          await signedPost('/api/agent/shot?id=' + encodeURIComponent(c.id), fs.readFileSync(file), 'image/jpeg', 60_000);
        } finally {
          fs.rm(file, { force: true }, () => {});
        }
        return await report(c.id, true, 'Print capturado.');
      }

      case 'run': {
        const program = loadPrograms().find((p) => p.id === c.arg);
        if (!program) return await report(c.id, false, 'Esse programa não está no programs.json.');
        // Executáveis abrem direto (com os argumentos); atalhos, pastas e links passam pelo Explorer.
        const direct = /\.(exe|com)$/i.test(program.path) || program.args.length > 0;
        const child = direct
          ? spawn(program.path, program.args, { detached: true, stdio: 'ignore', cwd: HOME })
          : spawn('explorer.exe', [program.path], { detached: true, stdio: 'ignore' });
        await new Promise((resolve, reject) => {
          child.once('error', reject);
          child.once('spawn', resolve);
        });
        child.unref();
        return await report(c.id, true, program.label + ' aberto.');
      }

      case 'program-add': {
        const a = c.arg || {};
        const file = typeof a.path === 'string' ? a.path : '';
        const label = typeof a.label === 'string' ? a.label.trim().slice(0, 40) : '';
        let isFile = false;
        try {
          isFile = fs.statSync(file).isFile();
        } catch {
          /* não existe */
        }
        if (!label || !path.isAbsolute(file) || !/\.exe$/i.test(file) || !isFile) {
          return await report(c.id, false, 'Escolha um arquivo .exe que exista neste PC.');
        }
        const [ok, message] = addProgram(file, label);
        await report(c.id, ok, message);
        if (ok) pollNow();   // a lista nova vai para a central já na próxima consulta
        return;
      }

      default:
        return await report(c.id, false, 'O agente não conhece essa ação.');
    }
  } catch (e) {
    log('comando falhou:', c.action, e.message);
    await report(c.id, false, String(e.message || e).slice(0, 280));
  }
}

/* ------------------------------------------------------------------ */
/* Consulta periódica                                                  */
/* ------------------------------------------------------------------ */

let fast = false;
let lastMetricsAt = 0;
let wakePoll = null;
let nudged = false;

// O túnel chama isto quando o Worker avisa que há algo novo (comando ou painel aberto).
function pollNow() {
  nudged = true;
  if (wakePoll) wakePoll();
}

function pause(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      wakePoll = null;
      resolve();
    }
    wakePoll = done;
  });
}

async function pollOnce(force) {
  const body = {};
  if (force || fast || Date.now() - lastMetricsAt > METRICS_IDLE_MS) {
    body.metrics = await collectMetrics();
    if (Buffer.byteLength(JSON.stringify(body)) > MAX_POLL_BODY) body.metrics.folders = body.metrics.folders.slice(0, 12);
    if (Buffer.byteLength(JSON.stringify(body)) > MAX_POLL_BODY) body.metrics.procs = [];
    lastMetricsAt = Date.now();
  }
  const res = await postJson('/api/agent/poll', body);
  fast = res.fast === true;
  for (const c of Array.isArray(res.cmds) ? res.cmds : []) runCommand(c);
}

async function pollLoop() {
  let failures = 0;
  for (;;) {
    const force = nudged;
    nudged = false;
    try {
      await pollOnce(force);
      if (failures > 0) log('consulta voltou a funcionar');
      failures = 0;
    } catch (e) {
      failures++;
      if (failures === 1 || failures % 60 === 0) log('consulta falhou (' + failures + 'x):', e.message);
    }
    if (!nudged) await pause(fast ? POLL_FAST_MS : POLL_IDLE_MS);
  }
}

/* ------------------------------------------------------------------ */
/* Terminais                                                           */
/* ------------------------------------------------------------------ */

const terms = new Map();   // id -> { id, shell, cwd, at, pty, buf, out, attached, timer, streak, lastFlush }
const POWERSHELL = findOnPath('pwsh.exe') || 'powershell.exe';

function findOnPath(name) {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    const full = path.join(dir, name);
    try {
      if (fs.statSync(full).isFile()) return full;
    } catch {
      /* não está nesta pasta */
    }
  }
  return null;
}

function termEnv() {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!SESSION_ENV.has(k.toUpperCase())) env[k] = v;
  return env;
}

// Aceita caminho completo, ~, %VARIAVEL% e caminho relativo à pasta do usuário.
function resolveFolder(input) {
  if (typeof input !== 'string' || !input.trim()) return HOME;
  let p = input.trim().replace(/%([^%]+)%/g, (all, name) => process.env[name] || all);
  if (p === '~') p = HOME;
  else if (p.startsWith('~/') || p.startsWith('~\\')) p = path.join(HOME, p.slice(2));
  return path.resolve(HOME, p);
}

function psQuote(text) {
  return "'" + String(text).replace(/'/g, "''") + "'";
}

function shellSpec(shell, cwd, resume) {
  if (shell === 'cmd') return { file: process.env.ComSpec || 'cmd.exe', args: [] };
  if (shell === 'powershell') return { file: POWERSHELL, args: ['-NoLogo'] };
  if (shell === 'claude') {
    // O Claude roda dentro de um PowerShell: se ele sair, o terminal continua aberto na pasta.
    const parts = ['claude', ...(resume ? ['--resume', resume] : []), ...cfg.claudeArgs];
    // --remote-control aceita um nome para a sessão; o da pasta ajuda a achar no app do Claude.
    const name = path.basename(cwd).replace(/[^A-Za-z0-9 _.-]/g, '').trim().slice(0, 40);
    const last = parts[parts.length - 1];
    if (name && (last === '--remote-control' || last === '--rc')) parts.push(name);
    // Bypass só neste processo: com scripts bloqueados no Windows, o claude.ps1 (npm/nvm) não roda.
    return { file: POWERSHELL, args: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', '& ' + parts.map(psQuote).join(' ')] };
  }
  if (shell === 'codex') {
    const parts = ['codex', ...(resume ? ['resume', resume] : [])];
    return { file: POWERSHELL, args: ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-NoExit', '-Command', '& ' + parts.map(psQuote).join(' ')] };
  }
  return null;
}

// Corta sem separar um par substituto (emoji e afins) entre duas mensagens.
function chunks(text, size) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + size);
    if (end < text.length) {
      const code = text.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end--;
    }
    out.push(text.slice(i, end));
    i = end;
  }
  return out;
}

function termExit(id, code, error) {
  tunnelSend(JSON.stringify({ t: 'exit', id, code: Number.isInteger(code) ? code : null, error: error || null }));
}

function sendTerms() {
  const list = [...terms.values()].map((t) => ({ id: t.id, shell: t.shell, cwd: t.cwd, at: t.at }));
  tunnelSend(JSON.stringify({ t: 'terms', list }));
}

function openTerm(m) {
  if (typeof m.id !== 'string' || !TERM_ID.test(m.id) || terms.has(m.id)) return;
  if (terms.size >= MAX_TERMS) return termExit(m.id, null, 'Limite de terminais abertos atingido.');

  const cwd = resolveFolder(m.cwd);
  try {
    if (!fs.statSync(cwd).isDirectory()) throw new Error('não é pasta');
  } catch {
    return termExit(m.id, null, 'Pasta não encontrada: ' + cwd);
  }
  if (m.resume !== null && m.resume !== undefined && (!AGENT_SHELLS.has(m.shell) || !SESSION_ID.test(m.resume))) {
    return termExit(m.id, null, 'Sessão inválida.');
  }
  const spec = shellSpec(m.shell, cwd, m.resume);
  if (!spec) return termExit(m.id, null, 'Tipo de terminal desconhecido.');

  let child;
  try {
    child = pty.spawn(spec.file, spec.args, {
      name: 'xterm-256color',
      cols: Number.isInteger(m.cols) ? m.cols : 100,
      rows: Number.isInteger(m.rows) ? m.rows : 30,
      cwd,
      env: termEnv(),
    });
  } catch (e) {
    log('não consegui abrir terminal:', e.message);
    return termExit(m.id, null, 'Não consegui abrir o terminal: ' + e.message);
  }

  const t = { id: m.id, shell: m.shell, cwd, at: Date.now(), pty: child, buf: '', out: '', attached: false, timer: null, streak: 0, lastFlush: 0 };
  terms.set(t.id, t);
  child.onData((data) => onOutput(t, data));
  child.onExit((e) => closeTerm(t, e.exitCode));
  log('terminal aberto:', t.shell + (m.resume ? ' (retomando ' + m.resume + ')' : ''), 'em', cwd, '(' + terms.size + ' no total)');
  rememberFolder(cwd);
  sendTerms();
}

function closeTerm(t, code) {
  if (terms.get(t.id) !== t) return;
  terms.delete(t.id);
  clearTimeout(t.timer);
  if (t.attached && t.out) for (const part of chunks(t.out, FRAME_MAX)) tunnelSend('o' + t.id + part);
  t.out = '';
  log('terminal encerrado:', t.shell, 'código', code);
  termExit(t.id, code, null);
  sendTerms();
}

function killTerm(id) {
  const t = terms.get(id);
  if (!t) return sendTerms();   // já não existe: a lista corrige a central
  try {
    t.pty.kill();
  } catch (e) {
    log('kill falhou:', e.message);
  }
  setTimeout(() => closeTerm(t, null), 3000);   // se o ConPTY não avisar que saiu
}

// Tudo o que o terminal escreve fica no histórico. Só vai para o túnel se alguém estiver olhando.
function onOutput(t, data) {
  t.buf += data;
  if (t.buf.length > SCROLLBACK * 1.25) {
    let cut = t.buf.length - SCROLLBACK;
    const newline = t.buf.indexOf('\n', cut);
    if (newline !== -1 && newline - cut < 4096) cut = newline + 1;   // recomeça numa linha inteira
    t.buf = t.buf.slice(cut);
  }
  if (!t.attached) return;
  t.out += data;
  if (t.out.length >= FRAME_MAX) return flush(t);
  if (!t.timer) {
    // Digitação responde em 15 ms. Saída contínua (um build, um log) passa a sair em lotes de
    // 100 ms: mesma informação em muito menos mensagens, que contam na cota da Cloudflare.
    if (Date.now() - t.lastFlush > 400) t.streak = 0;
    t.timer = setTimeout(() => flush(t), t.streak > 20 ? 100 : 15);
  }
}

function flush(t) {
  clearTimeout(t.timer);
  t.timer = null;
  const data = t.out;
  t.out = '';
  if (!data || !t.attached) return;
  t.lastFlush = Date.now();
  t.streak++;
  for (const part of chunks(data, FRAME_MAX)) tunnelSend('o' + t.id + part);
  holdIfCongested();
}

// Se a rede não dá conta, para de ler os terminais até a fila do túnel esvaziar.
let congested = false;

function holdIfCongested() {
  if (congested || !tunnel || tunnel.bufferedAmount < 1_000_000) return;
  congested = true;
  for (const t of terms.values()) try { t.pty.pause(); } catch { /* terminal saindo */ }
  const timer = setInterval(() => {
    if (tunnel && tunnel.bufferedAmount > 200_000) return;
    clearInterval(timer);
    congested = false;
    for (const t of terms.values()) try { t.pty.resume(); } catch { /* terminal saindo */ }
  }, 100);
}

// Alguém abriu este terminal na central: manda a cópia do histórico e passa a transmitir ao vivo.
function attachTerm(m) {
  const t = terms.get(m.id);
  if (!t) return termExit(m.id, null, 'O terminal não existe mais no PC.');
  clearTimeout(t.timer);
  t.timer = null;
  t.out = '';   // o que estava pendente já está no histórico
  if (Number.isInteger(m.cols) && Number.isInteger(m.rows)) resizeTerm(t, m.cols, m.rows);
  t.attached = true;
  const parts = chunks(t.buf, REPLAY_FRAME);
  tunnelSend('r' + t.id + (parts[0] || ''));
  for (const part of parts.slice(1)) tunnelSend('o' + t.id + part);
}

function resizeTerm(t, cols, rows) {
  try {
    t.pty.resize(Math.max(20, Math.min(400, cols)), Math.max(5, Math.min(200, rows)));
  } catch {
    /* terminal saindo */
  }
}

/* ------------------------------------------------------------------ */
/* Pastas e sessões do Claude e do Codex (só leitura)                  */
/* ------------------------------------------------------------------ */

// O Claude Code guarda as sessões de cada pasta em ~/.claude/projects/<pasta com tudo o que
// não é letra ou número trocado por "-">, um arquivo .jsonl por sessão.
function claudeProjectDir(dir) {
  return path.join(CLAUDE_PROJECTS, dir.replace(/[^a-zA-Z0-9]/g, '-'));
}

// Lê o fim do arquivo (e, se precisar, o começo) atrás do título e do último pedido.
async function readSession(file, size) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const read = async (start, length) => {
      const buf = Buffer.alloc(length);
      const { bytesRead } = await fh.read(buf, 0, length, start);
      return buf.toString('utf8', 0, bytesRead);
    };
    const tail = await read(Math.max(0, size - SESSION_TAIL), Math.min(size, SESSION_TAIL));
    const info = scanSession(tail);
    if (size > SESSION_TAIL && (!info.title || !info.prompt)) {
      const head = scanSession(await read(0, SESSION_TAIL));
      info.title = info.title || head.title;
      info.prompt = info.prompt || head.prompt;
    }
    return info;
  } finally {
    await fh.close();
  }
}

// Vale o último de cada: o nome que você deu (custom-title), senão o gerado pelo Claude (ai-title).
function scanSession(text) {
  let custom = null;
  let ai = null;
  let prompt = null;
  for (const line of text.split('\n')) {
    if (!line.includes('"custom-title"') && !line.includes('"ai-title"') && !line.includes('"last-prompt"')) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;   // linha cortada no começo do trecho lido
    }
    if (o.type === 'custom-title' && typeof o.customTitle === 'string') custom = o.customTitle;
    else if (o.type === 'ai-title' && typeof o.aiTitle === 'string') ai = o.aiTitle;
    else if (o.type === 'last-prompt' && typeof o.lastPrompt === 'string') prompt = o.lastPrompt;
  }
  return { title: custom || ai, prompt };
}

async function claudeSessions(dir) {
  const project = claudeProjectDir(dir);
  let files;
  try {
    files = (await fs.promises.readdir(project)).filter((f) => f.endsWith('.jsonl') && SESSION_ID.test(f.slice(0, -6)));
  } catch {
    return [];   // nunca houve Claude nesta pasta
  }
  const stats = [];
  for (const f of files) {
    try {
      const st = await fs.promises.stat(path.join(project, f));
      stats.push({ id: f.slice(0, -6), file: path.join(project, f), size: st.size, at: st.mtimeMs });
    } catch {
      /* apagado no meio */
    }
  }
  stats.sort((a, b) => b.at - a.at);
  const out = [];
  for (const s of stats) {
    if (out.length >= MAX_SESSIONS) break;
    try {
      const info = await readSession(s.file, s.size);
      // Sem nenhum pedido (Remote Control aberto e nunca usado, por exemplo): o Claude também esconde.
      if (!info.title && !info.prompt) continue;
      out.push({ id: s.id, at: Math.round(s.at), title: (info.title || info.prompt).slice(0, 120), prompt: info.prompt ? info.prompt.slice(0, 200) : null });
    } catch {
      /* arquivo em uso ou sem permissão */
    }
  }
  return out;
}

async function readHead(file, length) {
  const fh = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, 0);
    return buf.toString('utf8', 0, bytesRead);
  } finally {
    await fh.close();
  }
}

// Primeira linha do arquivo (session_meta): a pasta onde a sessão rodou. Com regex porque a linha
// pode ser maior que o trecho lido (ela traz as instruções do Codex), e a pasta vem antes delas.
function codexCwd(text) {
  const nl = text.indexOf('\n');
  const first = nl < 0 ? text : text.slice(0, nl);
  if (!first.includes('"session_meta"')) return null;
  const m = /"cwd":("(?:[^"\\]|\\.)*")/.exec(first);
  try {
    return m ? JSON.parse(m[1]).replace(/^\\\\\?\\/, '') : null;
  } catch {
    return null;
  }
}

// O primeiro pedido que você digitou (as instruções que o Codex injeta não contam).
function codexPrompt(text) {
  for (const line of text.split('\n')) {
    if (!line.includes('"user_message"')) continue;
    try {
      const p = JSON.parse(line).payload;
      if (p && p.type === 'user_message' && typeof p.message === 'string' && p.message.trim()) return p.message.trim();
    } catch {
      /* linha cortada no fim do trecho lido */
    }
  }
  return null;
}

// O Codex guarda as sessões de todas as pastas juntas, em sessions/AAAA/MM/DD/rollout-<data>-<id>.jsonl.
// shortcut: olha só os CODEX_SCAN arquivos mais novos; sessões mais antigas da pasta não aparecem.
async function codexSessions(dir) {
  const files = [];
  const walk = async (d, depth) => {
    let names;
    try {
      names = (await fs.promises.readdir(d)).sort().reverse();   // nomes com a data: mais novos primeiro
    } catch {
      return;   // nunca houve Codex neste PC
    }
    for (const n of names) {
      if (files.length >= CODEX_SCAN) return;
      if (depth < 3) await walk(path.join(d, n), depth + 1);
      else if (n.startsWith('rollout-') && n.endsWith('.jsonl') && SESSION_ID.test(n.slice(-42, -6))) {
        files.push({ id: n.slice(-42, -6), file: path.join(d, n) });
      }
    }
  };
  await walk(CODEX_SESSIONS, 0);
  for (const f of files) {
    try {
      const st = await fs.promises.stat(f.file);
      f.at = st.mtimeMs;
      f.size = st.size;
    } catch {
      f.at = -1;   // apagado no meio
    }
  }
  files.sort((a, b) => b.at - a.at);   // retomar escreve no mesmo arquivo: vale a última mexida
  const want = path.resolve(dir).toLowerCase();
  const out = [];
  for (const f of files) {
    if (out.length >= MAX_SESSIONS || f.at < 0) break;
    try {
      let head = await readHead(f.file, CODEX_HEAD);
      const cwd = codexCwd(head);
      if (!cwd || path.resolve(cwd).toLowerCase() !== want) continue;
      let prompt = codexPrompt(head);
      if (!prompt && f.size > CODEX_HEAD) prompt = codexPrompt(await readHead(f.file, Math.min(f.size, SESSION_TAIL)));
      if (!prompt) continue;   // aberta e fechada sem nenhum pedido
      out.push({ id: f.id, at: Math.round(f.at), title: prompt.slice(0, 120), prompt: null });
    } catch {
      /* arquivo em uso ou sem permissão */
    }
  }
  return out;
}

function agentSessions(agent, dir) {
  return agent === 'codex' ? codexSessions(dir) : claudeSessions(dir);
}

const byName = (a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });

// Subpastas, arquivos (nome e tamanho) e as últimas sessões do Claude (ou do Codex) de uma pasta.
async function listFolder(input, agent) {
  const dir = resolveFolder(input);
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return { error: 'Pasta não encontrada: ' + dir };
    if (e.code === 'EPERM' || e.code === 'EACCES') return { error: 'Sem permissão para abrir ' + dir };
    return { error: 'Não consegui abrir ' + dir + ': ' + e.code };
  }
  // Atalhos do sistema (junções como "Dados de Aplicativos") e pastas ocultas por nome ficam de fora.
  const names = entries
    .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('$'))
    .map((d) => d.name)
    .sort(byName);
  const fileNames = entries.filter((d) => d.isFile()).map((d) => d.name).sort(byName);
  const shown = fileNames.slice(0, MAX_FILES);
  const sizes = await Promise.all(shown.map((n) => fs.promises.stat(path.join(dir, n)).then((st) => st.size, () => null)));
  const parent = path.dirname(dir);
  return {
    path: dir,
    parent: parent === dir ? null : parent,
    dirs: names.slice(0, MAX_DIRS).map((name) => path.join(dir, name)),
    more: Math.max(0, names.length - MAX_DIRS),
    files: shown.map((n, i) => ({ n, s: sizes[i] })),
    moreFiles: Math.max(0, fileNames.length - MAX_FILES),
    sessions: await agentSessions(agent, dir),
  };
}

/* ------------------------------------------------------------------ */
/* Túnel (WebSocket com o Worker)                                      */
/* ------------------------------------------------------------------ */

let tunnel = null;       // o WebSocket, depois que os dois lados se autenticaram
let generation = 0;      // ignora eventos de conexões antigas
let lastPong = 0;
let retry = 0;
let tunnelWarned = false;

function tunnelSend(text) {
  if (!tunnel || tunnel.readyState !== 1) return false;
  try {
    tunnel.send(text);
    return true;
  } catch {
    return false;
  }
}

function onTunnelMessage(m) {
  if (m.t === 'ready') {
    sendTerms();   // a lista deste PC é a que vale
    return;
  }
  if (m.t === 'poll') return pollNow();
  if (m.t === 'sync') return sendTerms();
  if (m.t === 'open') return openTerm(m);
  if (m.t === 'attach') return attachTerm(m);
  if (m.t === 'kill') return killTerm(m.id);
  if (m.t === 'ls' || m.t === 'sessions') {
    // 'sessions' é só a lista de sessões (a área de vibecoding), sem listar a pasta.
    const dir = resolveFolder(m.path);
    (m.t === 'ls' ? listFolder(m.path, m.agent) : agentSessions(m.agent, dir).then((sessions) => ({ path: dir, sessions })))
      .catch((e) => ({ error: 'Não consegui listar a pasta: ' + e.message }))
      .then((data) => tunnelSend(JSON.stringify({ t: 'reply', rid: m.rid, data })));
    return;
  }

  const t = terms.get(m.id);
  if (!t) return;
  if (m.t === 'in' && typeof m.d === 'string') {
    try {
      t.pty.write(m.d);
    } catch {
      /* terminal saindo */
    }
  } else if (m.t === 'size' && Number.isInteger(m.cols) && Number.isInteger(m.rows)) {
    resizeTerm(t, m.cols, m.rows);
  } else if (m.t === 'detach') {
    t.attached = false;
    clearTimeout(t.timer);
    t.timer = null;
    t.out = '';
  }
}

function connectTunnel() {
  const gen = ++generation;
  const ts = String(Date.now());
  const nonce = crypto.randomBytes(16).toString('hex');
  const sig = hmac(cfg.secret, ['agentws', ts, nonce].join('|'));
  let ws;
  try {
    ws = new WebSocket(WS_URL + '/api/agent/ws?pc=' + cfg.pc + '&ts=' + ts + '&nonce=' + nonce + '&sig=' + sig);
  } catch (e) {
    log('túnel: ' + e.message);
    return scheduleReconnect(gen);
  }

  let key = null;    // chave desta conexão, derivada dos dois nonces
  let count = 0;     // número da última mensagem aceita

  const drop = (why) => {
    if (gen !== generation) return;
    if (why && !tunnelWarned) log('túnel caiu:', why);
    tunnelWarned = true;
    try { ws.close(); } catch { /* já fechado */ }
    scheduleReconnect(gen);
  };

  ws.onmessage = (ev) => {
    if (gen !== generation || typeof ev.data !== 'string') return;
    const data = ev.data;
    if (data === 'pong') {
      lastPong = Date.now();
      return;
    }

    if (!key) {
      // Primeira mensagem: o servidor prova que conhece o segredo, com o nonce que acabamos de criar.
      let hello;
      try {
        hello = JSON.parse(data);
      } catch {
        return drop('resposta inválida do servidor');
      }
      if (!hello || hello.t !== 'hello' || !/^[0-9a-f]{32}$/.test(hello.sn || '') ||
          !sameHex(hello.proof, hmac(cfg.secret, ['wsresp', nonce, hello.sn].join('|')))) {
        return drop('o servidor não provou que conhece o segredo');
      }
      key = hmac(cfg.secret, ['wskey', nonce, hello.sn].join('|'));
      ws.send(JSON.stringify({ t: 'auth', proof: hmac(cfg.secret, ['wsauth', nonce, hello.sn].join('|')) }));
      return;
    }

    // Daqui em diante: "<assinatura> <json>", com numeração sem buracos. Isso impede que
    // alguém no meio do caminho injete, repita ou reordene comandos para os terminais.
    const space = data.indexOf(' ');
    const text = data.slice(space + 1);
    if (space !== 64 || !sameHex(data.slice(0, 64), hmac(key, text))) return drop('mensagem com assinatura inválida');
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return drop('mensagem inválida');
    }
    if (!m || m.n !== count + 1) return drop('mensagem fora de ordem');
    count = m.n;

    if (m.t === 'ready') {
      tunnel = ws;
      lastPong = Date.now();
      retry = 0;
      tunnelWarned = false;
      for (const t of terms.values()) t.attached = false;   // o Worker pede de novo o que estiver em uso
      log('túnel conectado');
    }
    if (tunnel !== ws) return;
    try {
      onTunnelMessage(m);
    } catch (e) {
      log('erro ao tratar mensagem do túnel:', e.message);
    }
  };
  ws.onclose = (ev) => drop('conexão fechada (' + ev.code + ')');
  ws.onerror = () => drop('erro de conexão');
}

function scheduleReconnect(gen) {
  if (gen !== generation) return;
  generation++;   // invalida a conexão atual
  tunnel = null;
  const delay = [1000, 2000, 5000, 10_000, 15_000][Math.min(retry++, 4)];
  setTimeout(connectTunnel, delay);
}

// "ping" é respondido pela Cloudflare sem acordar o Worker. Sem resposta, a conexão morreu
// (rede caiu, PC voltou da suspensão): derruba e reconecta.
setInterval(() => {
  if (!tunnel) return;
  if (Date.now() - lastPong > 70_000) {
    log('túnel sem resposta: reconectando');
    const ws = tunnel;
    scheduleReconnect(generation);
    try { ws.close(); } catch { /* já fechado */ }
    return;
  }
  tunnelSend('ping');
}, 25_000);

/* ------------------------------------------------------------------ */
/* Início                                                              */
/* ------------------------------------------------------------------ */

process.on('uncaughtException', (e) => log('erro não tratado:', e && e.stack ? e.stack : e));
process.on('unhandledRejection', (e) => log('promessa rejeitada:', e && e.stack ? e.stack : e));

function shutdown() {
  for (const t of terms.values()) try { t.pty.kill(); } catch { /* já saiu */ }
  helper.stop();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Só um agente por PC da central: dois ao mesmo tempo brigariam pela ordem das requisições.
const lock = net.createServer();
lock.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log('O agente já está rodando para ' + cfg.url + ' (' + cfg.pc + ').');
    process.exit(0);
  }
  fatal('não consegui criar a trava de instância única: ' + e.message);
});
lock.listen('\\\\.\\pipe\\central-pc-agente-' + sha256(cfg.url + '|' + cfg.pc).slice(0, 12), () => {
  log('agente iniciado para', cfg.url, '| pc', cfg.pc, '| node', process.version, '| shell', path.basename(POWERSHELL) +
    (state.awake ? ' | mantendo o PC acordado' : ''));
  askHelper('info')
    .then((info) => { physicalCores = info.cores || 0; })
    .catch((e) => log('ajudante indisponível:', e.message));
  connectTunnel();
  pollLoop();
});
