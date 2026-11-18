// Teste de ponta a ponta, tudo local: sobe o Worker (wrangler dev) e o agente de verdade,
// e faz o papel do navegador com uma passkey simulada por software.
//
//   npm test
//
// Precisa do agente pronto (agent/helper.exe compilado e `npm install` em agent/).
// Abre terminais de verdade neste PC e tira um print da tela, que só vai para o Worker local.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes, webcrypto as crypto } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8799;
const BASE = "http://127.0.0.1:" + PORT;
const WS = "ws://127.0.0.1:" + PORT;
const TMP = mkdtempSync(join(tmpdir(), "central-e2e-"));

const vars = Object.fromEntries(
  readFileSync(join(ROOT, ".dev.vars"), "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = new TextEncoder();
const children = [];
let step = 0;

function ok(name) {
  console.log("  ok " + String(++step).padStart(2) + "  " + name);
  watch();
}

function childLogs(size) {
  for (const child of children) {
    console.error("\n--- saída de: " + child.spawnargs.slice(1, 3).join(" ") + (child.label ? " (" + child.label + ")" : "") + "\n" + child.log.slice(-size));
  }
}

// Algumas esperas (um WebSocket fechar, por exemplo) não têm prazo próprio. Se nenhum passo
// terminar em 4 minutos, alguma travou: mostra os registros e encerra em vez de ficar parado.
let watchdog = null;
function watch() {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    console.error("\nTRAVOU: nenhum passo terminou em 4 minutos depois do passo " + step + ".");
    childLogs(4000);
    children.forEach(stop);
    process.exit(1);
  }, 240_000);
}

function start(args, env) {
  const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  child.log = "";
  child.stdout.on("data", (d) => (child.log += d));
  child.stderr.on("data", (d) => (child.log += d));
  children.push(child);
  return child;
}

function stop(child) {
  if (child.exitCode === null) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
}

async function until(what, fn, timeoutMs = 20_000) {
  const end = Date.now() + timeoutMs;
  let last;
  for (;;) {
    try {
      last = await fn();
      if (last) return last;
    } catch (e) {
      last = e;
    }
    if (Date.now() > end) throw new Error("tempo esgotado esperando: " + what + " (último: " + (last && last.message ? last.message : JSON.stringify(last)) + ")");
    await sleep(250);
  }
}

/* ---------- Passkey de mentira (o mesmo que o chip do celular faz) ---------- */

const b64u = (buf) => Buffer.from(buf).toString("base64url");

function rawToDer(raw) {
  const int = (bytes) => {
    let b = Buffer.from(bytes);
    while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.subarray(1);
    if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
    return Buffer.concat([Buffer.from([0x02, b.length]), b]);
  };
  const body = Buffer.concat([int(raw.subarray(0, 32)), int(raw.subarray(32))]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

class Passkey {
  // 'synced': como as passkeys sincronizadas (iCloud, Google), o contador fica sempre em 0.
  static async create(synced = false) {
    const p = new Passkey();
    p.synced = synced;
    p.keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    p.id = b64u(crypto.getRandomValues(new Uint8Array(16)));
    p.counter = 0;
    return p;
  }

  async register(setupToken) {
    const o = await api("/api/register/options", { setupToken });
    const clientData = enc.encode(JSON.stringify({ type: "webauthn.create", challenge: o.challenge, origin: BASE, crossOrigin: false }));
    await api("/api/register/verify", {
      chId: o.chId,
      credentialId: this.id,
      clientDataJSON: b64u(clientData),
      publicKey: b64u(await crypto.subtle.exportKey("spki", this.keys.publicKey)),
      alg: -7,
    });
  }

  async assert(o) {
    assert.ok(o.allowCredentials.includes(this.id), "o servidor não listou esta passkey");
    const clientData = enc.encode(JSON.stringify({ type: "webauthn.get", challenge: o.challenge, origin: BASE, crossOrigin: false }));
    const authData = Buffer.alloc(37);
    Buffer.from(await crypto.subtle.digest("SHA-256", enc.encode(o.rpId))).copy(authData, 0);
    authData[32] = 0x05;   // usuário presente e verificado
    authData.writeUInt32BE(this.synced ? 0 : ++this.counter, 33);
    const signed = Buffer.concat([authData, Buffer.from(await crypto.subtle.digest("SHA-256", clientData))]);
    const sig = Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, this.keys.privateKey, signed));
    return {
      chId: o.chId,
      credentialId: this.id,
      clientDataJSON: b64u(clientData),
      authenticatorData: b64u(authData),
      signature: b64u(rawToDer(sig)),
    };
  }
}

/* ---------- "Navegador" ---------- */

async function api(path, body, cookie) {
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  const res = await fetch(BASE + path, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch { /* resposta sem JSON */ }
  if (!res.ok) {
    const err = new Error(data.error || "HTTP " + res.status);
    err.status = res.status;
    throw err;
  }
  data.setCookie = res.headers.get("set-cookie");
  return data;
}

async function fails(status, promise, name) {
  await assert.rejects(promise, (e) => e.status === status, name + " devia responder " + status);
}

async function login(passkey, pc) {
  const o = await api("/api/login/options", pc ? { pc } : {});
  const res = await api("/api/login/verify", await passkey.assert(o));
  assert.match(res.setCookie, /^__Host-sid=[A-Za-z0-9_-]+; Max-Age=3600; Path=\/; Secure; HttpOnly; SameSite=Strict$/);
  return res.setCookie.split(";")[0];
}

// Uma ação com a digital: pede o desafio, assina e confirma. Os pedidos de desafio têm limite por
// IP (30 por minuto), e o teste faz mais que isso: espera a janela virar em vez de falhar.
async function actionOptions(cookie, name, arg) {
  for (let waited = 0; ; waited += 5000) {
    try {
      return await api("/api/action/options", { action: name, arg }, cookie);
    } catch (e) {
      if (e.status !== 429 || waited >= 70_000) throw e;
      await sleep(5000);
    }
  }
}

async function action(passkey, cookie, name, arg, verifyCookie = cookie) {
  const o = await actionOptions(cookie, name, arg);
  return api("/api/action/verify", await passkey.assert(o), verifyCookie);
}

// Chave do agente de um PC, como o Worker calcula.
const pcKey = (pc) => createHmac("sha256", vars.AGENT_SECRET).update("pc|" + pc).digest("hex");

// Uma consulta de agente assinada com a chave 'key', em nome do PC 'pc'. Devolve o status HTTP.
async function agentPoll(pc, key) {
  const ts = String(Date.now());
  const nonce = randomBytes(16).toString("hex");
  const body = "{}";
  const hash = createHash("sha256").update(body).digest("hex");
  const sig = createHmac("sha256", key).update(["agent", "/api/agent/poll", ts, nonce, hash].join("|")).digest("hex");
  const res = await fetch(BASE + "/api/agent/poll", {
    method: "POST",
    headers: { "content-type": "application/json", "x-pc": pc, "x-ts": ts, "x-nonce": nonce, "x-sig": sig },
    body,
  });
  return res.status;
}

// Espera um comando da fila (energia, print...) terminar no PC.
function finished(cookie, id) {
  return until("o comando terminar", async () => {
    const s = await api("/api/action/status?id=" + id, null, cookie);
    assert.notEqual(s.state, "failed", s.message);
    return s.state === "done" ? s : null;
  });
}

const metrics = async (cookie) => (await api("/api/pc", null, cookie)).metrics || {};

// Um terminal aberto na central: junta o que chega e deixa esperar por um texto.
class Term {
  constructor(id, cookie, { origin = BASE, cols = 100, rows = 30 } = {}) {
    this.replay = null;   // cópia da tela recebida ao conectar
    this.out = "";        // saída ao vivo
    this.events = [];
    this.closed = new Promise((resolve) => (this.onclosed = resolve));
    const headers = { origin };
    if (cookie) headers.cookie = cookie;
    this.ws = new WebSocket(WS + "/api/term/ws?id=" + id + "&cols=" + cols + "&rows=" + rows, { headers });
    this.ws.onmessage = (ev) => {
      const d = ev.data;
      if (d === "pong") this.pong = true;
      else if (d[0] === "r") this.replay = d.slice(1);
      else if (d[0] === "o") this.out += d.slice(1);
      else if (d[0] === "{") {
        const e = JSON.parse(d);
        this.events.push(e);
        // O servidor avisa o código antes de fechar. O wrangler dev às vezes não termina a conexão
        // e o fechamento fica pendurado; como o navegador, desiste de esperar em 2 s.
        if (e.t === "close") setTimeout(() => this.onclosed(e.code), 2000);
      }
    };
    this.ws.onclose = (ev) => this.onclosed(ev.code);
    this.ws.onerror = () => this.onclosed(-1);
  }

  type(text) {
    this.ws.send("i" + text);
  }

  // Sem as sequências de cor e cursor, que o terminal mistura no texto.
  text() {
    return ((this.replay || "") + this.out).replace(/\x1b\][^\x07]*\x07/g, "").replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
  }

  see(needle, timeoutMs = 20_000) {
    return until("\"" + needle + "\" no terminal", () => this.text().includes(needle), timeoutMs);
  }

  close() {
    try { this.ws.close(); } catch { /* já fechado */ }
  }
}

/* ---------- Sessões do Claude de mentira (no lugar de ~/.claude) ---------- */

const FAKE_CLAUDE = join(TMP, "claude");
const sid = (n) => "0000000" + n + "-0000-4000-8000-000000000000";

function fakeSessions() {
  const dir = join(FAKE_CLAUDE, "projects", ROOT.replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(dir, { recursive: true });
  const line = (o) => JSON.stringify(o) + "\n";
  const write = (n, minutesAgo, text) => {
    const file = join(dir, sid(n) + ".jsonl");
    writeFileSync(file, text);
    const t = new Date(Date.now() - minutesAgo * 60_000);
    utimesSync(file, t, t);
  };
  write(1, 10, line({ type: "ai-title", aiTitle: "Gerado antigo" }) + line({ type: "custom-title", customTitle: "Meu nome" }) +
    line({ type: "ai-title", aiTitle: "Gerado depois" }) + line({ type: "last-prompt", lastPrompt: "faz o X" }));
  write(2, 40, line({ type: "ai-title", aiTitle: "Só gerado" }) + line({ type: "last-prompt", lastPrompt: "pedido 2" }));   // passa do limite de 3
  write(3, 20, line({ type: "last-prompt", lastPrompt: "só pedido" }));
  write(4, 5, line({ type: "mode", mode: "x" }));   // a mais nova, mas sem nenhum pedido: fica de fora
  // Grande: o título (gerado) está só no começo, longe do trecho final que o agente lê primeiro.
  write(5, 30, line({ type: "ai-title", aiTitle: "Título no começo" }) +
    line({ type: "user", pad: "x".repeat(700_000) }) + line({ type: "last-prompt", lastPrompt: "fim" }));
  write(6, 50, line({ type: "last-prompt", lastPrompt: "seis" }));
  write(7, 60, line({ type: "last-prompt", lastPrompt: "sete" }));
  writeFileSync(join(dir, "agent-abc.jsonl"), line({ type: "last-prompt", lastPrompt: "subagente" }));
}

/* ---------- Sessões do Codex de mentira (no lugar de ~/.codex) e um "codex" que só ecoa ---------- */

const FAKE_CODEX = join(TMP, "codex");
const FAKE_BIN = join(TMP, "bin");
const cid = (n) => "0199a000-0000-7000-8000-00000000000" + n;

function fakeCodex() {
  const line = (o) => JSON.stringify(o) + "\n";
  const meta = (n, cwd, extra = {}) => line({ timestamp: "2026-11-16T10:00:00Z", type: "session_meta", payload: { id: cid(n), timestamp: "2026-11-16T10:00:00Z", cwd, ...extra } });
  const user = (text) => line({ type: "event_msg", payload: { type: "user_message", message: text, kind: "plain" } });
  const write = (n, day, minutesAgo, text) => {
    const dir = join(FAKE_CODEX, "sessions", "2026", "11", day);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "rollout-2026-11-" + day + "T10-0" + n + "-00-" + cid(n) + ".jsonl");
    writeFileSync(file, text);
    const t = new Date(Date.now() - minutesAgo * 60_000);
    utimesSync(file, t, t);
  };
  write(1, "16", 5, meta(1, ROOT) + user("arruma o teste"));
  write(2, "16", 1, meta(2, join(ROOT, "agent")) + user("outra pasta"));   // a mais nova, mas de outra pasta
  // Pasta com outra caixa e as instruções que o Codex injeta antes do primeiro pedido.
  write(3, "15", 10, meta(3, ROOT.toUpperCase()) +
    line({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>" }] } }) + user("segundo"));
  // Primeira linha maior que o trecho lido: a pasta vem antes das instruções; o pedido está mais longe.
  write(4, "14", 15, meta(4, ROOT, { instructions: "x".repeat(100_000) }) + user("longo"));
  write(5, "16", 6, meta(5, ROOT));   // aberta e fechada sem pedido: fica de fora
  write(6, "13", 20, meta(6, ROOT) + user("antiga"));   // passa do limite de 3
  mkdirSync(FAKE_BIN, { recursive: true });
  writeFileSync(join(FAKE_BIN, "codex.cmd"), "@echo codex-de-mentira %*\r\n");
}

/* ---------- Teste ---------- */

async function main() {
  watch();
  // "npm run test:selfhost" testa a hospedagem própria (selfhost/config.capnp no workerd) em vez do wrangler dev.
  const selfhost = process.argv.includes("--selfhost");
  console.log("Subindo o Worker local (" + (selfhost ? "workerd, hospedagem própria" : "wrangler dev") + ") e o agente…");
  const worker = selfhost
    ? start(["node_modules/workerd/bin/workerd", "serve", "selfhost/config.capnp", "--socket-addr", "http=127.0.0.1:" + PORT,
        "--directory-path", "public=" + join(ROOT, "public"), "--directory-path", "data=" + (mkdirSync(join(TMP, "state"), { recursive: true }), join(TMP, "state"))], vars)
    : start(["node_modules/wrangler/bin/wrangler.js", "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", join(TMP, "state"), "--show-interactive-dev-session=false"], {});
  await until("o Worker local responder", async () => (await fetch(BASE + "/api/status")).ok, 60_000).catch((e) => {
    throw new Error(e.message + "\n" + worker.log.slice(-2000));
  });

  // Os dois PCs da central rodam nesta máquina, cada agente com a sua pasta (config, programas e
  // estado). claudeArgs trocado: aqui o "Claude" só imprime a versão, sem abrir uma sessão de verdade.
  const agentConfig = (pc) => {
    const dir = join(TMP, "agent-" + pc);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "config.json"), JSON.stringify({ url: BASE, pc, secret: pcKey(pc), claudeArgs: ["--version"], folderRoots: [ROOT] }));
    return join(dir, "config.json");
  };
  const desktopConfig = agentConfig("desktop");
  fakeSessions();
  fakeCodex();
  const pathKey = Object.keys(process.env).find((k) => k.toUpperCase() === "PATH");
  const startAgent = (config = desktopConfig) => {
    const child = start(["agent/agent.js"], {
      WOL_AGENT_CONFIG: config,
      CLAUDE_CONFIG_DIR: FAKE_CLAUDE,
      CODEX_HOME: FAKE_CODEX,
      [pathKey]: FAKE_BIN + ";" + process.env[pathKey],
    });
    child.label = config === desktopConfig ? "desktop" : "notebook";   // só para os logs
    return child;
  };
  let agent = startAgent();
  let NB, notebook;   // o notebook entra pela central, depois do login (veja "Computadores")

  // --- Página e arquivos estáticos
  const page = await fetch(BASE + "/");
  const csp = page.headers.get("content-security-policy");
  assert.match(csp, /script-src 'nonce-[A-Za-z0-9_-]+' 'self';/);
  assert.match(csp, /connect-src 'self' ws:\/\/127\.0\.0\.1:8799;/);
  assert.ok((await page.text()).includes('id="termsec"'));
  for (const file of ["/xterm.js", "/xterm.css", "/addon-fit.js", "/sw.js", "/apple-touch-icon.png"]) assert.equal((await fetch(BASE + file)).status, 200, file);
  assert.match(csp, /manifest-src 'self'; worker-src 'self';/);
  const manifest = await (await fetch(BASE + "/manifest.webmanifest")).json();
  assert.equal(manifest.display, "standalone");
  assert.deepEqual(manifest.icons.map((i) => i.sizes), ["192x192", "512x512", "512x512"]);
  for (const icon of manifest.icons) assert.equal((await fetch(BASE + icon.src)).headers.get("content-type"), "image/png", icon.src);
  ok("página com a seção de terminal, xterm.js estático e o app instalável (manifesto, ícones, service worker)");

  // --- Sem sessão não há nada
  await fails(401, api("/api/pc"), "/api/pc sem sessão");
  assert.equal(await new Term("AAAAAAAAAAA", null).closed, 4401);
  assert.equal(await new Term("AAAAAAAAAAA", null, { origin: "https://evil.example" }).closed, -1);
  assert.equal((await fetch(BASE + "/api/term/ws?id=AAAAAAAAAAA")).status, 400);
  ok("terminal sem sessão é recusado (4401) e de outra origem nem conecta");

  // --- Túnel do agente: só entra quem conhece o segredo
  const badTunnel = new WebSocket(WS + "/api/agent/ws?ts=" + Date.now() + "&nonce=" + "0".repeat(32) + "&sig=" + "0".repeat(64));
  assert.equal(await new Promise((resolve) => { badTunnel.onopen = () => resolve("abriu"); badTunnel.onerror = () => resolve("recusado"); }), "recusado");
  assert.equal(await agentPoll("desktop", pcKey("laptop")), 401);
  assert.equal(await agentPoll("desktop", vars.AGENT_SECRET), 401);
  assert.equal(await agentPoll("laptop", pcKey("laptop")), 400);
  ok("túnel com assinatura errada é recusado; a chave de um PC não vale para outro");

  // --- Passkey e login
  const passkey = await Passkey.create();
  await passkey.register(vars.SETUP_TOKEN);
  const cookie = await login(passkey);
  const cookie2 = await login(passkey);
  ok("passkey cadastrada e login feito");

  // --- Computadores: um PC novo entra pela central, e a chave dele só sai depois da digital
  assert.deepEqual((await api("/api/pc", null, cookie)).pcs.map((x) => x.id), ["desktop"]);
  await fails(400, actionOptions(cookie, "pc-add", "  "), "PC sem nome");
  await fails(400, actionOptions(cookie, "pc-remove", "desktop"), "remover o desktop");
  await fails(400, actionOptions(cookie, "pc-key", "laptop"), "chave de um PC que não existe");
  const added = await action(passkey, cookie, "pc-add", "Notebook");
  NB = added.pc;
  assert.match(NB, /^notebook-[0-9a-f]{6}$/);
  assert.equal(added.key, pcKey(NB));
  assert.equal((await action(passkey, cookie, "pc-key", NB)).key, added.key);
  notebook = startAgent(agentConfig(NB));
  ok("adicionar computador: id novo e a chave dele, só com a digital");

  // --- Desafios: assinados em vez de guardados, e de uso único
  const synced = await Passkey.create(true);
  await synced.register(vars.SETUP_TOKEN);
  const once = await synced.assert(await api("/api/login/options", {}));
  await api("/api/login/verify", once);
  await fails(400, api("/api/login/verify", once), "desafio usado de novo (passkey com contador 0)");
  const shotOpt = await api("/api/action/options", { action: "screenshot" }, cookie);
  const fields = JSON.parse(Buffer.from(shotOpt.chId, "base64url"));
  fields.data.action = "shutdown";
  const forged = await passkey.assert(shotOpt);
  forged.chId = b64u(JSON.stringify(fields));
  await fails(401, api("/api/action/verify", forged, cookie), "desafio com a ação trocada");
  ok("desafio não pode ser repetido nem ter a ação trocada");

  const pc = await until("o agente aparecer online com túnel", async () => {
    const info = await api("/api/pc", null, cookie);
    return info.agentOnline && info.tunnel && info.metrics ? info : null;
  }, 30_000).catch((e) => {
    throw new Error(e.message + "\n--- agente:\n" + agent.log.slice(-2000));
  });
  const m = pc.metrics;
  assert.equal(typeof m.cpu, "number");
  assert.ok(m.cores.length > 0 && m.cpuInfo.name && m.cpuInfo.threads === m.cores.length);
  assert.ok(m.ram.totalGB > 0 && m.ram.usedGB > 0 && m.ram.availableGB > 0 && m.ram.commitLimitGB > 0);
  assert.ok(m.procs.length > 0 && m.procs.every((p) => p.n && p.k >= 1 && typeof p.c === "number" && typeof p.m === "number"));
  assert.ok(m.disks.length > 0 && m.disks[0].totalGB > 0);
  assert.ok(m.uptimeSec > 0 && ["active", "locked"].includes(m.session));
  assert.ok(Array.isArray(m.programs) && m.folders.includes(ROOT));
  assert.deepEqual(pc.terms, []);
  ok("agente online, túnel aberto e métricas completas (" + m.cpuInfo.name + ", " + m.procs.length + " processos)");

  // --- Validação das ações de terminal
  await fails(400, action(passkey, cookie, "term-open", { shell: "bash" }), "shell desconhecido");
  await fails(400, action(passkey, cookie, "term-open", { shell: "cmd", cwd: 'C:\\x" & calc' }), "pasta com aspas");
  await fails(400, action(passkey, cookie, "term-attach", { id: "curto" }), "id inválido");
  await fails(404, action(passkey, cookie, "term-attach", { id: "AAAAAAAAAAA" }), "terminal inexistente");
  await fails(401, api("/api/action/options", { action: "term-open", arg: { shell: "cmd" } }), "abrir sem sessão");
  ok("pedidos inválidos de terminal são recusados antes da digital");

  // --- PowerShell de verdade
  const ps = (await action(passkey, cookie, "term-open", { shell: "powershell", cwd: ROOT, cols: 100, rows: 30 })).term;
  assert.match(ps, /^[A-Za-z0-9_-]{11}$/);
  let t = new Term(ps, cookie);
  await until("a cópia inicial da tela", () => t.replay !== null);
  t.type('echo "e2e-$(20+22)-ok"\r');
  await t.see("e2e-42-ok");
  t.type("(Get-Location).Path\r");
  await t.see(ROOT);
  ok("PowerShell abre na pasta pedida e executa comandos");

  t.ws.send(JSON.stringify({ t: "size", cols: 132, rows: 40 }));
  await sleep(300);
  t.type('echo "largura=$($Host.UI.RawUI.WindowSize.Width)"\r');
  await t.see("largura=132");
  t.ws.send("ping");
  await until("o pong", () => t.pong);
  ok("redimensionar chega ao terminal e o ping é respondido");

  let list = (await api("/api/pc", null, cookie)).terms;
  assert.equal(list.length, 1);
  assert.deepEqual({ id: list[0].id, shell: list[0].shell, cwd: list[0].cwd, granted: list[0].granted }, { id: ps, shell: "powershell", cwd: ROOT, granted: true });

  // --- Reconectar na mesma sessão: sem digital, e a tela volta
  t.close();
  await t.closed;
  await sleep(300);
  t = new Term(ps, cookie);
  await until("a cópia da tela ao reconectar", () => t.replay !== null);
  assert.ok(t.text().includes("e2e-42-ok"), "a cópia da tela devia trazer o que já foi feito");
  t.type('echo "depois-$(1+1)"\r');
  await t.see("depois-2");
  ok("reconectar na mesma sessão devolve a tela e continua funcionando");

  // --- Sessão aberta antes do terminal existir: precisa da digital para entrar nele
  assert.equal(await new Term(ps, cookie2).closed, 4403);
  assert.equal((await api("/api/pc", null, cookie2)).terms[0].granted, false);
  await fails(403, action(passkey, cookie, "term-attach", { id: ps }, cookie2), "desafio de uma sessão usado em outra");
  assert.equal(await new Term(ps, cookie2).closed, 4403);
  assert.equal((await action(passkey, cookie2, "term-attach", { id: ps })).term, ps);
  const t2 = new Term(ps, cookie2);
  await until("a cópia da tela na segunda sessão", () => t2.replay !== null);
  assert.ok(t2.text().includes("depois-2"));
  t2.type('echo "duas-$(3*3)-telas"\r');
  await Promise.all([t.see("duas-9-telas"), t2.see("duas-9-telas")]);
  ok("outra sessão só entra no terminal depois da digital; as duas telas veem a mesma saída");

  // --- Login novo (a sessão anterior venceu): os terminais abertos voltam sem pedir a digital de novo
  const cookie3 = await login(passkey);
  assert.equal((await api("/api/pc", null, cookie3)).terms[0].granted, true);
  const t3 = new Term(ps, cookie3);
  await until("a cópia da tela depois do login novo", () => t3.replay !== null);
  assert.ok(t3.text().includes("duas-9-telas"));
  t3.close();
  await api("/api/logout", {}, cookie3);
  ok("login novo herda os terminais abertos, com a tela de antes");

  // --- Sair da central derruba os terminais daquela sessão
  await api("/api/logout", {}, cookie2);
  assert.equal(await t2.closed, 4401);
  await fails(401, api("/api/pc", null, cookie2), "sessão encerrada");
  ok("sair da central fecha os terminais daquela sessão");

  // --- CMD, e fechar digitando exit
  const cmd = (await action(passkey, cookie, "term-open", { shell: "cmd", cwd: ROOT })).term;
  const c = new Term(cmd, cookie);
  await until("a cópia inicial do cmd", () => c.replay !== null);
  c.type("echo cmd-%OS%-ok\r");
  await c.see("cmd-Windows_NT-ok");
  c.type("exit\r");
  assert.equal(await c.closed, 4410);
  assert.deepEqual(c.events.filter((e) => e.t !== "close"), [{ t: "exit", code: 0, error: null }]);
  assert.deepEqual(c.events.at(-1), { t: "close", code: 4410 });
  await until("o cmd sair da lista", async () => (await api("/api/pc", null, cookie)).terms.length === 1);
  ok("CMD funciona e some da lista quando o shell termina (exit)");

  // --- Claude: abre dentro de um PowerShell, na pasta escolhida
  const claude = (await action(passkey, cookie, "term-open", { shell: "claude", cwd: ROOT })).term;
  const cl = new Term(claude, cookie);
  await cl.see("(Claude Code)", 40_000);
  cl.type('echo "ainda-$(2+2)-aqui"\r');
  await cl.see("ainda-4-aqui");
  ok("terminal do Claude chama o claude e continua aberto depois que ele sai");

  // --- Navegar nas pastas e ver as sessões do Claude
  // Vibecoding: só as sessões da pasta, sem o explorador e sem digital (basta estar logado).
  const sess = (p, agent, c = cookie) => api("/api/sessions?agent=" + agent + "&path=" + encodeURIComponent(p), null, c);
  await fails(401, sess(ROOT, "claude", null), "sessões sem login");
  const cl3 = await sess(ROOT, "claude");
  assert.equal(cl3.path, ROOT);
  assert.deepEqual(cl3.sessions.map((s) => s.id), [1, 3, 5].map(sid));
  assert.deepEqual(cl3.sessions.map((s) => s.title), ["Meu nome", "só pedido", "Título no começo"]);
  assert.deepEqual(cl3.sessions.map((s) => s.prompt), ["faz o X", "só pedido", "fim"]);
  assert.ok(cl3.sessions[0].at > cl3.sessions[1].at);
  assert.equal((await sess(join(ROOT, "agent"), "claude")).sessions.length, 0);
  const cx = await sess(ROOT, "codex");
  assert.deepEqual(cx.sessions.map((s) => s.id), [1, 3, 4].map(cid));
  assert.deepEqual(cx.sessions.map((s) => s.title), ["arruma o teste", "segundo", "longo"]);
  assert.deepEqual((await sess(join(ROOT, "agent"), "codex")).sessions.map((s) => s.title), ["outra pasta"]);
  assert.equal((await sess(homedir(), "codex")).sessions.length, 0);
  ok("vibecoding: as 3 últimas sessões do Claude e do Codex de uma pasta, sem digital");

  const ls = (p, c = cookie) => api("/api/fs?path=" + encodeURIComponent(p), null, c);
  await fails(401, ls(ROOT, null), "listar sem sessão");
  await fails(403, ls(ROOT), "listar sem abrir o explorador com a digital");
  await action(passkey, cookie, "fs-open");
  const here = await ls(ROOT);
  assert.ok(here.files.some((f) => f.n === "package.json" && f.s > 0), JSON.stringify(here.files));
  assert.equal(here.path, ROOT);
  assert.equal(here.parent, dirname(ROOT));
  assert.ok(here.dirs.includes(join(ROOT, "agent")) && here.dirs.includes(join(ROOT, "test")), JSON.stringify(here.dirs));
  assert.ok(!here.dirs.includes(join(ROOT, ".git")), "pastas ocultas por nome não aparecem");
  assert.deepEqual(here.sessions, cl3.sessions);
  assert.equal((await ls(join(ROOT, "agent"))).sessions.length, 0);
  assert.deepEqual((await api("/api/fs?agent=codex&path=" + encodeURIComponent(ROOT), null, cookie)).sessions, cx.sessions);
  assert.equal((await ls("")).path, homedir());
  assert.equal((await ls("~")).path, homedir());
  await fails(404, ls("C:\\nao\\existe\\mesmo"), "pasta inexistente");
  await fails(400, ls('C:\\x"y'), "pasta com aspas");
  ok("explorador: só com a digital; subpastas, arquivos, pasta de cima e as sessões do Claude ou do Codex");

  // --- Retomar uma sessão (aqui o "claude" só imprime a versão)
  await fails(400, action(passkey, cookie, "term-open", { shell: "cmd", resume: sid(1) }), "retomar em cmd");
  await fails(400, action(passkey, cookie, "term-open", { shell: "claude", resume: "nao-e-id" }), "id de sessão inválido");
  const resumed = (await action(passkey, cookie, "term-open", { shell: "claude", cwd: ROOT, resume: sid(1) })).term;
  const rs = new Term(resumed, cookie);
  await rs.see("(Claude Code)", 40_000);
  await until("o agente registrar a sessão retomada", () => agent.log.includes("retomando " + sid(1)));
  await action(passkey, cookie, "term-close", { id: resumed });
  assert.equal(await rs.closed, 4410);
  ok("retomar uma sessão do Claude pede a digital e abre com --resume");

  // --- Codex: retomar abre "codex resume <id>" (aqui o codex é um .cmd que só ecoa)
  await fails(400, action(passkey, cookie, "term-open", { shell: "powershell", resume: cid(1) }), "retomar em powershell");
  const cxTerm = (await action(passkey, cookie, "term-open", { shell: "codex", cwd: ROOT, resume: cid(1) })).term;
  const cxt = new Term(cxTerm, cookie);
  await cxt.see("codex-de-mentira resume " + cid(1));
  await action(passkey, cookie, "term-close", { id: cxTerm });
  assert.equal(await cxt.closed, 4410);
  ok("retomar uma sessão do Codex pede a digital e abre com codex resume");

  // --- Pasta que não existe
  const ghost = (await action(passkey, cookie, "term-open", { shell: "cmd", cwd: "C:\\nao\\existe\\mesmo" })).term;
  const g = new Term(ghost, cookie);
  const ghostCode = await g.closed;
  assert.ok(ghostCode === 4410 || ghostCode === 4404, "código " + ghostCode);
  await until("o terminal fantasma sair da lista", async () => !(await api("/api/pc", null, cookie)).terms.some((x) => x.id === ghost));
  ok("pasta inexistente não abre terminal");

  // --- Limite de terminais
  const extra = [];
  for (;;) {
    try {
      extra.push((await action(passkey, cookie, "term-open", { shell: "cmd" })).term);
    } catch (e) {
      assert.equal(e.status, 429);
      break;
    }
    assert.ok(extra.length < 10, "o limite não foi aplicado");
  }
  assert.equal((await api("/api/pc", null, cookie)).terms.length, 6);
  ok("limite de 6 terminais abertos");

  // --- Encerrar pede a digital e mata o processo
  for (const id of [claude, ...extra]) await action(passkey, cookie, "term-close", { id });
  assert.equal(await cl.closed, 4410);
  await until("sobrar só o PowerShell", async () => (await api("/api/pc", null, cookie)).terms.length === 1);
  ok("encerrar com a digital fecha os terminais");

  // --- Ação antiga (print) continua funcionando, agora avisada pelo túnel
  const before = Date.now();
  const shot = await action(passkey, cookie, "screenshot");
  const done = await finished(cookie, shot.id);
  const img = await fetch(BASE + "/api/pc/screenshot?id=" + shot.id, { headers: { cookie } });
  const bytes = Buffer.from(await img.arrayBuffer());
  assert.equal(img.headers.get("content-type"), "image/jpeg");
  assert.ok(bytes.length > 5000 && bytes[0] === 0xff && bytes[1] === 0xd8, "o print devia ser um JPEG");
  ok("print da tela: \"" + done.message + "\" em " + (Date.now() - before) + " ms, " + Math.round(bytes.length / 1024) + " KB");

  // --- Manter acordado (desligado de novo no fim do teste)
  await finished(cookie, (await action(passkey, cookie, "awake-on")).id);
  await until("o painel mostrar o modo acordado", async () => (await metrics(cookie)).awake === true);
  const power = (await metrics(cookie)).power;
  assert.ok(power === null || (typeof power.ac === "boolean" && power.pct >= 0 && power.pct <= 100), JSON.stringify(power));
  ok("manter acordado liga com a digital (energia: " + JSON.stringify(power) + ")");

  // --- O agente cai: a central avisa; quando ele volta, a lista se corrige
  stop(agent);
  await until("a tela saber que o PC caiu", () => t.events.some((e) => e.t === "offline"));
  assert.equal((await api("/api/pc", null, cookie)).tunnel, false);
  await fails(409, action(passkey, cookie, "term-open", { shell: "cmd" }), "abrir sem túnel");
  agent = startAgent();
  assert.equal(await t.closed, 4410);   // o terminal morreu junto com o agente antigo
  await until("a lista esvaziar depois que o agente volta", async () => {
    const info = await api("/api/pc", null, cookie);
    return info.tunnel && info.terms.length === 0;
  }, 30_000);
  ok("agente reiniciado: a central avisa a queda e limpa os terminais que não existem mais");

  assert.equal((await metrics(cookie)).awake, true);
  await finished(cookie, (await action(passkey, cookie, "awake-off")).id);
  await until("o painel mostrar o repouso liberado", async () => (await metrics(cookie)).awake === false);
  ok("o modo acordado sobrevive ao agente reiniciar e desliga com a digital");

  // --- E um terminal novo funciona depois da reconexão
  const again = (await action(passkey, cookie, "term-open", { shell: "powershell" })).term;
  const a = new Term(again, cookie);
  await until("a cópia inicial depois da reconexão", () => a.replay !== null);
  a.type('echo "voltou-$(5+5)"\r');
  await a.see("voltou-10");
  await action(passkey, cookie, "term-close", { id: again });
  assert.equal(await a.closed, 4410);
  ok("terminal novo depois da reconexão do túnel");

  // --- Dois PCs: cada um com os seus terminais; trocar de PC pede a digital
  const both = await until("o notebook aparecer online", async () => {
    const info = await api("/api/pc", null, cookie);
    const nb = info.pcs.find((x) => x.id === NB);
    return nb && nb.online ? info : null;
  }, 30_000);
  assert.equal(both.pc, "desktop");
  assert.deepEqual(both.pcs.map((x) => x.id), ["desktop", NB]);
  assert.equal(both.canWake, true);
  assert.equal(both.explorer, true);
  await fails(400, action(passkey, cookie, "pc-switch", "laptop"), "PC desconhecido");
  const dterm = (await action(passkey, cookie, "term-open", { shell: "cmd" })).term;
  const dt = new Term(dterm, cookie);
  await until("a cópia inicial do cmd do desktop", () => dt.replay !== null);
  const stale = await actionOptions(cookie, "lock");   // pedido feito ainda no desktop
  assert.equal((await action(passkey, cookie, "pc-switch", NB)).pc, NB);
  assert.equal(await dt.closed, 4403);   // o terminal do desktop sai da tela
  await fails(409, api("/api/action/verify", await passkey.assert(stale), cookie), "pedido de um PC confirmado depois de trocar");
  const onNb = await until("o painel do notebook com túnel", async () => {
    const info = await api("/api/pc", null, cookie);
    return info.pc === NB && info.tunnel ? info : null;
  });
  assert.equal(onNb.canWake, false);
  assert.equal(onNb.explorer, false);
  assert.ok(!onNb.terms.some((t) => t.id === dterm), "o terminal do desktop não aparece no notebook");
  await fails(403, ls(ROOT), "o explorador aberto no desktop não vale no notebook");
  assert.equal(await new Term(dterm, cookie).closed, 4404);
  const opened = (notebook.log.match(/terminal aberto/g) || []).length;
  const nterm = (await action(passkey, cookie, "term-open", { shell: "cmd", cwd: ROOT })).term;
  const nt = new Term(nterm, cookie);
  await until("a cópia inicial no notebook", () => nt.replay !== null);
  nt.type("echo notebook-%OS%\r");
  await nt.see("notebook-Windows_NT");
  assert.equal((notebook.log.match(/terminal aberto/g) || []).length, opened + 1, "o terminal devia abrir no agente do notebook");
  ok("dois PCs: trocar pede a digital, e terminais e explorador ficam separados por PC");

  // --- Cadastrar app (no notebook): só .exe que existe, nome curto, sem repetir
  await fails(400, action(passkey, cookie, "program-add", { path: "C:\\Windows\\win.ini", label: "x" }), "arquivo que não é .exe");
  await fails(400, action(passkey, cookie, "program-add", { path: process.execPath, label: "" }), "app sem nome");
  await finished(cookie, (await action(passkey, cookie, "program-add", { path: process.execPath, label: "Node de teste" })).id);
  await until("o app aparecer na lista do notebook", async () => ((await metrics(cookie)).programs || []).some((x) => x.id === "node-de-teste" && x.label === "Node de teste"));
  const saved = JSON.parse(readFileSync(join(TMP, "agent-" + NB, "programs.json"), "utf8"));
  assert.deepEqual(saved, [{ id: "node-de-teste", label: "Node de teste", path: process.execPath }]);
  const dup = await action(passkey, cookie, "program-add", { path: process.execPath, label: "De novo" });
  const st = await until("o cadastro repetido terminar", async () => {
    const x = await api("/api/action/status?id=" + dup.id, null, cookie);
    return x.state === "done" || x.state === "failed" ? x : null;
  });
  assert.equal(st.state, "failed");
  assert.match(st.message, /já está na lista/);
  ok("cadastrar app: o .exe vai para o programs.json do PC em uso e aparece na central");

  // --- Login novo entra no PC pedido (o último usado no aparelho)
  const nbCookie = await login(passkey, NB);
  assert.equal((await api("/api/pc", null, nbCookie)).pc, NB);
  await action(passkey, cookie, "term-close", { id: nterm });
  assert.equal(await nt.closed, 4410);
  assert.equal((await action(passkey, cookie, "pc-switch", "desktop")).pc, "desktop");
  assert.equal((await api("/api/pc", null, cookie)).pc, "desktop");
  await action(passkey, cookie, "term-close", { id: dterm });
  ok("login entra direto no PC escolhido; voltar ao desktop pede a digital");

  // --- Remover um computador: some da lista, quem estava nele volta para o desktop e a chave para de valer
  await action(passkey, cookie, "pc-remove", NB);
  assert.deepEqual((await api("/api/pc", null, cookie)).pcs.map((x) => x.id), ["desktop"]);
  assert.equal((await api("/api/pc", null, nbCookie)).pc, "desktop");
  assert.equal(await agentPoll(NB, pcKey(NB)), 400);
  await fails(400, actionOptions(cookie, "pc-switch", NB), "trocar para o PC removido");
  const readd = await action(passkey, cookie, "pc-add", "Notebook");
  assert.notEqual(readd.pc, NB, "adicionar de novo gera outro id (e outra chave)");
  await action(passkey, cookie, "pc-remove", readd.pc);
  await api("/api/logout", {}, nbCookie);
  ok("remover computador: sai da lista, a sessão nele volta para o desktop e a chave antiga para de valer");

  // --- Limite de tentativas por IP (por último: este IP fica bloqueado por 1 minuto)
  let tries = 0;
  for (;;) {
    try {
      await api("/api/wake/options", {});
    } catch (e) {
      assert.equal(e.status, 429);
      break;
    }
    assert.ok(++tries <= 30, "o limite por IP não foi aplicado");
  }
  ok("limite de tentativas por IP (" + tries + " pedidos de desafio)");

  console.log("\nTudo certo: " + step + " verificações passaram.");
}

let failed = false;
try {
  await main();
} catch (e) {
  failed = true;
  console.error("\nFALHOU:", e.stack || e);
  childLogs(1500);
} finally {
  children.forEach(stop);
  await sleep(500);
  try { rmSync(TMP, { recursive: true, force: true }); } catch { /* o Windows ainda segura algum arquivo */ }
}
process.exit(failed ? 1 : 0);
