/*
  Ligar PC com passkey (digital / rosto) — Cloudflare Worker + Durable Object

  Fluxo:
    1. No celular você abre a página e toca em "Ligar".
    2. O navegador pede digital/rosto e assina um desafio com a passkey
       (a chave privada nunca sai do chip de segurança do aparelho).
    3. O Worker verifica a assinatura (WebAuthn) e deixa um "pedido de ligar" pendente.
    4. O ESP32 consulta o Worker a cada poucos segundos, recebe o pedido
       (resposta assinada com HMAC) e envia o magic packet de Wake-on-LAN.

  Central de comando (PC já ligado):
    5. Entrar com a passkey abre uma sessão curta, que só permite ler o painel.
    6. Cada ação (desligar, print, abrir programa...) pede a passkey de novo, e o
       desafio fica amarrado àquela ação.
    7. O agente no Windows consulta o Worker e executa só o que estiver na lista
       fixa dele. Requisições e respostas do agente são assinadas com HMAC.

  Terminais (cmd, PowerShell e Claude com Remote Control):
    8. O agente mantém um WebSocket aberto com o Durable Object (o "túnel"). Os
       dois lados provam que conhecem o AGENT_SECRET, e tudo o que desce para o
       agente vai numerado e assinado com uma chave que só vale naquela conexão.
    9. Abrir um terminal, reconectar a um terminal em outra sessão e encerrar um
       terminal pedem a passkey, como qualquer outra ação. A permissão fica presa
       à sessão que a pediu.
   10. O navegador abre um WebSocket por terminal. Digitar não pede a passkey:
       basta a sessão e a permissão daquele terminal. O Durable Object só repassa
       os dados; o terminal de verdade (ConPTY) roda no agente.
   11. A sessão dura 1 hora. Entrar de novo com a passkey libera para a sessão nova
       os terminais que já estavam abertos, e a página volta para onde estava.

  Vários PCs: a lista fica no Durable Object e é editada pela central (adicionar, remover e ver
  o comando de instalação pedem a passkey). Cada agente se identifica pelo id do PC e assina com
  a chave HMAC(AGENT_SECRET, "pc|<id>"). A sessão guarda o PC em uso; trocar de PC e abrir o
  explorador de pastas pedem a passkey, e o explorador vale só para o PC em uso.

  Rotas sem login (ligar, entrar, cadastrar) não gravam nada: o limite de tentativas
  é por IP e fica na memória, e o desafio da passkey vem assinado em vez de guardado.
  Assim ninguém de fora bloqueia o acesso nem gasta a cota de escritas.

  Segredos (wrangler secret put):
    SETUP_TOKEN    - necessário para cadastrar/remover passkeys
    DEVICE_SECRET  - segredo compartilhado com o ESP32 (HMAC)
    AGENT_SECRET   - origem das chaves dos agentes do Windows (uma por PC)
*/

import { DurableObject } from "cloudflare:workers";
import { PAGE } from "./page.js";

const WAKE_TTL_MS = 60_000;          // pedido de ligar expira se o ESP32 não buscar a tempo
const CHALLENGE_TTL_MS = 120_000;
const DEVICE_ONLINE_MS = 20_000;
const MAX_CREDS = 5;
const MAX_BODY = 8192;

const SESSION_TTL_MS = 60 * 60_000;        // depois disso, só entrando de novo com a passkey
const MAX_SESSIONS = 5;
const AGENT_ONLINE_MS = 30_000;            // o agente consulta a cada 5 s (painel aberto) ou 10 s
const PANEL_VIEW_MS = 15_000;        // painel aberto há pouco: o agente envia métricas a cada consulta
const COMMAND_TTL_MS = 60_000;       // comando não buscado expira: nada de desligar o PC horas depois
const COMMAND_LOST_MS = 90_000;      // entregue e sem resposta depois disso: dá como perdido
const COMMAND_KEEP_MS = 10 * 60_000;
const MAX_COMMANDS = 10;             // na fila, ainda não buscados pelo agente
const MAX_KEPT_COMMANDS = 30;
const SHOT_TTL_MS = 10 * 60_000;     // o print é apagado sozinho depois disso
const MAX_SHOT = 1_500_000;          // o limite de um valor no Durable Object é 2 MB
const MAX_AGENT_JSON = 16_384;
const AGENT_CLOCK_SKEW_MS = 5 * 60_000;
const SEEN_WRITE_MS = 60_000;        // presença vai para o disco no máximo 1x por minuto (cota de escritas)
const SESSION_COOKIE = "__Host-sid";
const ACTIONS = new Set(["shutdown", "restart", "sleep", "lock", "screenshot", "run", "awake-on", "awake-off", "program-add"]);
const PC_ACTIONS = new Set(["pc-add", "pc-remove", "pc-key"]);   // editar a lista de PCs: não vão para o agente
const PROGRAM_ID = /^[a-z0-9_-]{1,32}$/;
const COMMAND_ID = /^[A-Za-z0-9_-]{16}$/;

// PCs da central. A lista fica no Durable Object (Store.pcs); o "desktop" sempre existe, não pode
// ser removido e é o único que o ESP32 liga. O agente de cada PC assina com HMAC(AGENT_SECRET,
// "pc|<id>"): a chave de um PC não serve para se passar pelo outro. PCs adicionados pela central
// ganham um id com final aleatório, então remover e adicionar de novo gera outra chave e a do PC
// removido não volta a valer.
const DEFAULT_PC = "desktop";
const DEFAULT_PCS = { desktop: { label: "Desktop", wake: true } };
const MAX_PCS = 8;
const PC_ID = /^[a-z0-9-]{1,20}$/;
const PC_LABEL = /^[^\u0000-\u001f\u007f<>]{1,24}$/;

// Terminais. Estas ações também passam pela passkey, mas não viram comando na fila:
// vão direto para o agente pelo túnel.
const TERM_ACTIONS = new Set(["term-open", "term-attach", "term-close"]);
const TERM_SHELLS = new Set(["powershell", "cmd", "claude", "codex"]);
const TERM_ID = /^[A-Za-z0-9_-]{11}$/;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;   // sessão do Claude Code ou do Codex
const QUERY_TIMEOUT_MS = 10_000;     // pergunta ao agente (listar pasta) sem resposta
const MAX_TERMS = 6;
const MAX_CWD = 260;
const MAX_TERM_INPUT = 16_384;       // por mensagem do navegador; colar texto grande vai em pedaços
const TERM_PENDING_MS = 20_000;      // terminal pedido e ainda não confirmado pelo agente
const MAX_GRANTS = 16;               // terminais liberados por sessão
const WS_SESSION = 4401;             // códigos de fechamento que a página entende
const WS_GRANT = 4403;
const WS_GONE = 4404;
const WS_OFFLINE = 4409;
const WS_ENDED = 4410;

const ASSET_TYPES = { js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", png: "image/png", webmanifest: "application/manifest+json" };

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function fail(code) {
  throw new HttpError(401, "Autenticação recusada.", code);
}

function b64uEnc(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function b64uDec(str) {
  let s = str.replaceAll("-", "+").replaceAll("_", "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(data) {
  return crypto.subtle.digest("SHA-256", data);
}

async function hmacRaw(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, enc.encode(message));
}

async function hmacHex(secret, message) {
  return toHex(await hmacRaw(secret, message));
}

// Chave do agente de um PC (veja DEFAULT_PCS).
function pcKey(env, pc) {
  return hmacHex(env.AGENT_SECRET, "pc|" + pc);
}

// Comparação em tempo constante (strings de mesmo tamanho).
function safeEq(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function tokenOk(given, expected) {
  return safeEq(toHex(await sha256(enc.encode(given))), toHex(await sha256(enc.encode(expected))));
}

function bytesEq(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function randomB64u(n) {
  return b64uEnc(crypto.getRandomValues(new Uint8Array(n)));
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

/* ------------------------------------------------------------------ */
/* WebAuthn                                                            */
/* ------------------------------------------------------------------ */

// A assinatura ECDSA do WebAuthn vem em DER; o WebCrypto espera r||s (64 bytes).
function derToRaw(der, size = 32) {
  let o = 0;
  if (der[o++] !== 0x30) throw new Error("der");
  let len = der[o++];
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | der[o++];
  }
  const readInt = () => {
    if (der[o++] !== 0x02) throw new Error("der");
    const l = der[o++];
    let v = der.slice(o, o + l);
    o += l;
    while (v.length > 0 && v[0] === 0) v = v.slice(1);
    if (v.length > size) throw new Error("der");
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  };
  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(size * 2);
  raw.set(r, 0);
  raw.set(s, size);
  return raw;
}

function importPublicKey(spki, alg) {
  if (alg === -7) {
    return crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  }
  if (alg === -257) {
    return crypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  }
  throw new HttpError(400, "Algoritmo de chave não suportado.");
}

function checkClientData(bytes, type, challenge, origin) {
  let cd;
  try {
    cd = JSON.parse(dec.decode(bytes));
  } catch {
    fail("bad_clientdata");
  }
  if (!cd || cd.type !== type) fail("bad_type");
  if (cd.challenge !== challenge) fail("bad_challenge");
  if (cd.origin !== origin) fail("bad_origin");
  if (cd.crossOrigin === true) fail("cross_origin");
}

// Retorna o novo signCount se a assinatura for válida; lança HttpError(401) caso contrário.
async function verifyAssertion({ cred, body, challenge, rpId, origin }) {
  const clientDataJSON = b64(body.clientDataJSON, 2048);
  checkClientData(clientDataJSON, "webauthn.get", challenge, origin);

  const ad = b64(body.authenticatorData, 2048);
  if (ad.length < 37) fail("bad_authdata");

  const rpHash = new Uint8Array(await sha256(enc.encode(rpId)));
  if (!bytesEq(ad.subarray(0, 32), rpHash)) fail("rp_mismatch");

  const flags = ad[32];
  if (!(flags & 0x01)) fail("no_user_presence");
  if (!(flags & 0x04)) fail("no_user_verification"); // exige digital/rosto/PIN

  const counter = ((ad[33] << 24) | (ad[34] << 16) | (ad[35] << 8) | ad[36]) >>> 0;
  // Muitas passkeys sincronizadas mandam sempre 0; só rejeita se o contador existir e regredir.
  if ((counter !== 0 || cred.signCount !== 0) && counter <= cred.signCount) fail("counter_rollback");

  const signed = concat(ad, new Uint8Array(await sha256(clientDataJSON)));
  const signature = b64(body.signature, 2048);

  let ok = false;
  try {
    const key = await importPublicKey(b64uDec(cred.publicKey), cred.alg);
    if (cred.alg === -7) {
      ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(signature), signed);
    } else {
      ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed);
    }
  } catch {
    ok = false;
  }
  if (!ok) fail("bad_signature");
  return counter;
}

/* ------------------------------------------------------------------ */
/* Validação de entrada                                                */
/* ------------------------------------------------------------------ */

function str(v, max = 4096) {
  if (typeof v !== "string" || v.length === 0 || v.length > max) {
    throw new HttpError(400, "Parâmetro inválido.");
  }
  return v;
}

function b64(v, max = 4096) {
  const s = str(v, max);
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new HttpError(400, "Base64 inválido.");
  try {
    return b64uDec(s);
  } catch {
    throw new HttpError(400, "Base64 inválido.");
  }
}

async function readJson(request) {
  const ct = request.headers.get("content-type") || "";
  if (!ct.includes("application/json")) throw new HttpError(415, "Content-Type inválido.");
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, "Corpo grande demais.");
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
  } catch {
    /* cai no erro abaixo */
  }
  throw new HttpError(400, "JSON inválido.");
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Confere e normaliza o argumento das ações de terminal. O resultado fica guardado junto
// do desafio, então a passkey assina exatamente este shell, esta pasta ou este terminal.
function termArg(action, arg) {
  if (!arg || typeof arg !== "object" || Array.isArray(arg)) throw new HttpError(400, "Parâmetro inválido.");
  if (action !== "term-open") {
    if (typeof arg.id !== "string" || !TERM_ID.test(arg.id)) throw new HttpError(400, "Terminal inválido.");
    return { id: arg.id };
  }
  if (typeof arg.shell !== "string" || !TERM_SHELLS.has(arg.shell)) throw new HttpError(400, "Tipo de terminal inválido.");
  let resume = null;
  if (arg.resume !== undefined && arg.resume !== null) {
    if ((arg.shell !== "claude" && arg.shell !== "codex") || typeof arg.resume !== "string" || !SESSION_ID.test(arg.resume)) {
      throw new HttpError(400, "Sessão inválida.");
    }
    resume = arg.resume;
  }
  return {
    shell: arg.shell,
    cwd: checkCwd(arg.cwd),
    resume,
    cols: clampInt(arg.cols, 20, 400, 100),
    rows: clampInt(arg.rows, 5, 200, 30),
  };
}

// Pasta vinda do navegador: null (pasta do usuário) ou um caminho sem caracteres de controle
// nem os que o Windows proíbe em caminhos. O agente ainda confere se a pasta existe.
function checkCwd(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string") throw new HttpError(400, "Pasta inválida.");
  const cwd = v.trim();
  if (cwd.length === 0 || cwd.length > MAX_CWD || /[\u0000-\u001f"<>|?*]/.test(cwd)) {
    throw new HttpError(400, "Pasta inválida.");
  }
  return cwd;
}

// Cadastro de app: um .exe com caminho completo e um nome curto. O agente ainda confere o arquivo.
function programArg(arg) {
  if (!arg || typeof arg !== "object" || Array.isArray(arg)) throw new HttpError(400, "Parâmetro inválido.");
  const file = checkCwd(arg.path);
  if (!file || !/^[A-Za-z]:\\/.test(file) || !/\.exe$/i.test(file)) throw new HttpError(400, "Escolha um arquivo .exe.");
  const label = typeof arg.label === "string" ? arg.label.trim() : "";
  if (!label || label.length > 40 || /[\u0000-\u001f]/.test(label)) throw new HttpError(400, "Nome do app inválido.");
  return { path: file, label };
}

function isUpgrade(request) {
  return (request.headers.get("upgrade") || "").toLowerCase() === "websocket";
}

/* ------------------------------------------------------------------ */
/* Durable Object: todo o estado fica aqui (uma única instância)       */
/* ------------------------------------------------------------------ */

export class Store extends DurableObject {
  seen = new Map();
  written = new Map();
  agentTs = new Map();          // por PC: horário da última requisição do agente (evita repetição)
  panelViewedAt = new Map();    // por PC: quando alguém olhou o painel
  outbox = Promise.resolve();   // fila de envio para o agente: mantém a numeração em ordem
  replies = new Map();          // perguntas ao agente esperando resposta (rid -> resolve)
  limits = new Map();           // tentativas por rota e IP, só em memória
  chKey = null;                 // chave que assina os desafios da passkey
  pcMap = null;                 // lista de PCs (cópia em memória do que está no disco)

  constructor(ctx, env) {
    super(ctx, env);
    // "ping" é respondido sem acordar o objeto: mantém os WebSockets vivos de graça.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // Presença fica em memória; o disco só recebe uma cópia de vez em quando.
  async touch(key, now) {
    this.seen.set(key, now);
    if (now - (this.written.get(key) || 0) >= SEEN_WRITE_MS) {
      this.written.set(key, now);
      await this.ctx.storage.put(key, now);
    }
  }

  async lastSeen(key) {
    return this.seen.get(key) ?? (await this.ctx.storage.get(key));
  }

  async getCreds() {
    return (await this.ctx.storage.get("creds")) || [];
  }

  async addCred(cred) {
    const creds = await this.getCreds();
    if (creds.some((c) => c.id === cred.id)) return false;
    if (creds.length >= MAX_CREDS) return false;
    creds.push(cred);
    await this.ctx.storage.put("creds", creds);
    return true;
  }

  async setSignCount(id, count) {
    const creds = await this.getCreds();
    const c = creds.find((x) => x.id === id);
    if (c) {
      c.signCount = count;
      await this.ctx.storage.put("creds", creds);
    }
  }

  async resetAll() {
    const pcs = await this.ctx.storage.get("pcs");   // remover os aparelhos não apaga a lista de PCs
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    if (pcs) await this.ctx.storage.put("pcs", pcs);
    this.seen.clear();
    this.written.clear();
    this.chKey = null;   // desafios emitidos antes do reset deixam de valer
    // Sem aparelhos cadastrados não sobra sessão: derruba quem estiver num terminal.
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a && a.role === "term") this.closeTermSocket(ws, WS_SESSION, "session");
    }
    for (const pc of Object.keys(await this.pcs())) await this.sendAgent(pc, { t: "sync" });   // a lista de terminais foi apagada: pede de novo
  }

  // ---------- Lista de PCs ----------

  async pcs() {
    if (!this.pcMap) this.pcMap = (await this.ctx.storage.get("pcs")) || DEFAULT_PCS;
    return this.pcMap;
  }

  async hasPc(id) {
    return typeof id === "string" && PC_ID.test(id) && Object.hasOwn(await this.pcs(), id);
  }

  // Já autorizado pela passkey. Devolve o id novo, ou null se a lista está cheia.
  async addPc(label) {
    const pcs = { ...(await this.pcs()) };
    if (Object.keys(pcs).length >= MAX_PCS) return null;
    const slug = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").slice(0, 12).replace(/^-+|-+$/g, "") || "pc";
    const id = slug + "-" + toHex(crypto.getRandomValues(new Uint8Array(3)));
    pcs[id] = { label, wake: false };
    await this.ctx.storage.put("pcs", pcs);
    this.pcMap = pcs;
    return id;
  }

  // Já autorizado pela passkey. Apaga tudo o que era do PC e derruba o agente e os terminais dele.
  async removePc(id) {
    if (id === DEFAULT_PC || !(await this.hasPc(id))) return false;
    const pcs = { ...(await this.pcs()) };
    delete pcs[id];
    await this.ctx.storage.put("pcs", pcs);
    this.pcMap = pcs;
    await this.ctx.storage.delete(["cmds:", "metrics:", "shot:", "agentSeen:", "terms:"].map((k) => k + id));
    this.seen.delete("agentSeen:" + id);
    this.written.delete("agentSeen:" + id);
    this.agentTs.delete(id);
    this.panelViewedAt.delete(id);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (a && a.role === "agent" && a.pc === id) this.closeSocket(ws, 4001, "removed");
      if (a && a.role === "term" && a.pc === id) this.closeTermSocket(ws, WS_GRANT, "pc");
    }
    return true;
  }

  async userId() {
    let id = await this.ctx.storage.get("userId");
    if (!id) {
      id = randomB64u(16);
      await this.ctx.storage.put("userId", id);
    }
    return id;
  }

  // Gerada uma vez só; depois fica em memória.
  async challengeKey() {
    if (!this.chKey) {
      let k = await this.ctx.storage.get("chKey");
      if (!k) {
        k = randomB64u(32);
        await this.ctx.storage.put("chKey", k);
      }
      this.chKey = k;
    }
    return this.chKey;
  }

  // O desafio é a assinatura do próprio pedido (tipo, dados e validade), então não precisa
  // ser guardado: pedir desafios não grava nada. O navegador devolve o 'id' e o Worker
  // recalcula o desafio; quem mexer no 'id' recebe outro desafio, que a passkey não assinou.
  async newChallenge(type, data = null) {
    const id = b64uEnc(enc.encode(JSON.stringify({ type, data, exp: Date.now() + CHALLENGE_TTL_MS, r: randomB64u(12) })));
    return { id, challenge: b64uEnc(await hmacRaw(await this.challengeKey(), "ch|" + id)) };
  }

  // Lê o desafio sem gastá-lo. Quem chama ainda confere a passkey e depois chama useChallenge().
  async openChallenge(id, type) {
    let v;
    try {
      v = JSON.parse(dec.decode(b64uDec(id)));
    } catch {
      return null;
    }
    const now = Date.now();
    if (!v || v.type !== type || typeof v.exp !== "number" || v.exp < now || v.exp > now + CHALLENGE_TTL_MS) return null;
    return { challenge: b64uEnc(await hmacRaw(await this.challengeKey(), "ch|" + id)), data: v.data, exp: v.exp };
  }

  // Uso único. Só é chamado depois de a assinatura conferir, então só quem tem a passkey grava aqui.
  async useChallenge(challenge, exp) {
    const key = "used:" + challenge;
    if (await this.ctx.storage.get(key)) return false;
    await this.ctx.storage.put(key, exp);
    const now = Date.now();
    for (const [k, v] of await this.ctx.storage.list({ prefix: "used:" })) {
      if (v < now) await this.ctx.storage.delete(k);
    }
    return true;
  }

  // Limite de tentativas por IP, em janela fixa. Fica em memória: um IP abusando não bloqueia
  // os outros e não gasta a cota de escritas. Retorna false quando estourou.
  hit(name, ip, max, windowMs) {
    const now = Date.now();
    if (this.limits.size > 5000) {
      for (const [k, r] of this.limits) if (now - r.start > r.windowMs) this.limits.delete(k);
    }
    const key = name + "|" + ip;
    let r = this.limits.get(key);
    if (!r || now - r.start > windowMs) {
      r = { n: 0, start: now, windowMs };
      this.limits.set(key, r);
    }
    return ++r.n <= max;
  }

  async setWake() {
    await this.ctx.storage.put("wake", { at: Date.now() });
  }

  // Chamado pelo ESP32: registra presença e consome o pedido de ligar (se válido).
  async devicePoll() {
    const now = Date.now();
    await this.touch("lastPoll", now);
    const wake = await this.ctx.storage.get("wake");
    if (!wake) return false;
    await this.ctx.storage.delete("wake");
    return now - wake.at < WAKE_TTL_MS;
  }

  async status() {
    const creds = await this.getCreds();
    const last = await this.lastSeen("lastPoll");
    const wake = await this.ctx.storage.get("wake");
    const now = Date.now();
    return {
      registered: creds.length > 0,
      deviceOnline: !!last && now - last < DEVICE_ONLINE_MS,
      pending: !!wake && now - wake.at < WAKE_TTL_MS,
    };
  }

  // ---------- Sessões do painel (guarda só o hash do token) ----------

  // 'pc' é o PC em uso e 'fs' o PC cujo explorador foi aberto com a passkey. 'terms' guarda os
  // terminais liberados para esta sessão. Entrar já pede a passkey, então a sessão nova herda os
  // terminais abertos: depois que a anterior vence, tudo volta como estava.
  async createSession(key, pc) {
    const now = Date.now();
    const all = [...(await this.ctx.storage.list({ prefix: "sess:" }))];
    const live = [];
    for (const [k, v] of all) {
      if (v.exp < now) await this.deleteSession(k.slice(5));
      else live.push([k, v]);
    }
    live.sort((a, b) => a[1].exp - b[1].exp);
    while (live.length >= MAX_SESSIONS) await this.deleteSession(live.shift()[0].slice(5));
    const terms = [];
    for (const id of Object.keys(await this.pcs())) for (const t of await this.getTerms(id)) terms.push(t.id);
    await this.ctx.storage.put("sess:" + key, { exp: now + SESSION_TTL_MS, pc, fs: null, terms: terms.slice(-MAX_GRANTS) });
  }

  async liveSession(key) {
    if (!key) return null;
    const v = await this.ctx.storage.get("sess:" + key);
    if (!v) return null;
    if (v.exp < Date.now()) {
      await this.deleteSession(key);
      return null;
    }
    if (!(await this.hasPc(v.pc))) v.pc = DEFAULT_PC;   // o PC em uso foi removido: volta para o desktop
    return v;
  }

  // Apagar a sessão também fecha os terminais abertos com ela.
  async deleteSession(key) {
    await this.ctx.storage.delete("sess:" + key);
    for (const ws of this.ctx.getWebSockets("sess:" + key)) this.closeTermSocket(ws, WS_SESSION, "session");
  }

  // Já autorizado pela passkey. O explorador precisa ser aberto de novo, e os terminais do PC
  // anterior saem da tela.
  async switchPc(key, pc) {
    const sess = await this.liveSession(key);
    if (!sess) return false;
    sess.pc = pc;
    sess.fs = null;
    await this.ctx.storage.put("sess:" + key, sess);
    for (const ws of this.ctx.getWebSockets("sess:" + key)) {
      const a = ws.deserializeAttachment();
      if (a && a.pc !== pc) this.closeTermSocket(ws, WS_GRANT, "pc");
    }
    return true;
  }

  // Já autorizado pela passkey: libera o explorador do PC em uso até trocar de PC ou sair.
  async openFs(key, pc) {
    const sess = await this.liveSession(key);
    if (!sess) return false;
    sess.fs = pc;
    await this.ctx.storage.put("sess:" + key, sess);
    return true;
  }

  // ---------- Comandos para o agente ----------

  async queueCommand(pc, action, arg) {
    const now = Date.now();
    const cmds = ((await this.ctx.storage.get("cmds:" + pc)) || []).filter((c) => now - c.at < COMMAND_KEEP_MS);
    const pending = cmds.filter((c) => c.state === "queued" && now <= c.exp);
    if (pending.length >= MAX_COMMANDS) return null;
    const cmd = { id: randomB64u(12), action, arg: arg || null, at: now, exp: now + COMMAND_TTL_MS, state: "queued", message: null };
    cmds.push(cmd);
    await this.ctx.storage.put("cmds:" + pc, cmds.slice(-MAX_KEPT_COMMANDS));
    await this.sendAgent(pc, { t: "poll" });   // com o túnel aberto, o agente busca o comando na hora
    return cmd.id;
  }

  // Cada requisição do agente precisa ser de um PC da lista ("unknown" se não for) e ter um
  // horário maior que o da anterior (evita repetição). Conferir aqui poupa uma chamada a mais
  // ao Durable Object em cada consulta do agente.
  async acceptAgent(pc, ts) {
    if (!(await this.hasPc(pc))) return "unknown";
    if (ts <= (this.agentTs.get(pc) || 0)) return false;
    this.agentTs.set(pc, ts);
    return true;
  }

  async agentPoll(pc, ts, metrics) {
    const ok = await this.acceptAgent(pc, ts);
    if (ok !== true) return ok || null;
    const now = Date.now();
    await this.touch("agentSeen:" + pc, now);
    if (metrics) await this.ctx.storage.put("metrics:" + pc, { at: now, data: metrics });
    const fast = now - (this.panelViewedAt.get(pc) || 0) < PANEL_VIEW_MS;
    const cmds = await this.ctx.storage.get("cmds:" + pc);
    if (!cmds) return { cmds: [], fast };
    const out = [];
    let changed = false;
    for (const c of cmds) {
      if (c.state !== "queued") continue;
      changed = true;
      if (now > c.exp) {
        c.state = "expired";
      } else {
        c.state = "sent";
        out.push({ id: c.id, action: c.action, arg: c.arg, exp: c.exp });
      }
    }
    if (changed) await this.ctx.storage.put("cmds:" + pc, cmds);
    return { cmds: out, fast };
  }

  async agentResult(pc, ts, id, ok, message) {
    const accepted = await this.acceptAgent(pc, ts);
    if (accepted !== true) return accepted;
    const cmds = (await this.ctx.storage.get("cmds:" + pc)) || [];
    const c = cmds.find((x) => x.id === id);
    if (!c || c.state !== "sent") return false;
    c.state = ok ? "done" : "failed";
    c.message = message;
    await this.ctx.storage.put("cmds:" + pc, cmds);
    return true;
  }

  async commandStatus(pc, id) {
    const cmds = (await this.ctx.storage.get("cmds:" + pc)) || [];
    const c = cmds.find((x) => x.id === id);
    if (!c) return null;
    const now = Date.now();
    let state = c.state;
    if (state === "queued" && now > c.exp) state = "expired";
    if (state === "sent" && now - c.at > COMMAND_LOST_MS) state = "lost";
    return { state, message: c.message, action: c.action };
  }

  // Painel do PC em uso. Dos outros PCs vai só se estão online, para as abas.
  async pcInfo(sessKey) {
    const now = Date.now();
    const sess = await this.liveSession(sessKey);
    const pc = (sess && sess.pc) || DEFAULT_PC;
    const wasIdle = now - (this.panelViewedAt.get(pc) || 0) >= PANEL_VIEW_MS;
    this.panelViewedAt.set(pc, now);
    if (wasIdle) await this.sendAgent(pc, { t: "poll" });   // painel acabou de abrir: pede métricas já
    const all = await this.pcs();
    const pcs = [];
    for (const [id, info] of Object.entries(all)) {
      const s = await this.lastSeen("agentSeen:" + id);
      pcs.push({ id, label: info.label, online: !!s && now - s < AGENT_ONLINE_MS, seen: s || null });
    }
    const cur = pcs.find((x) => x.id === pc);
    const m = await this.ctx.storage.get("metrics:" + pc);
    const granted = new Set((sess && sess.terms) || []);
    return {
      pc,
      pcs: pcs.map((x) => ({ id: x.id, label: x.label, online: x.online })),
      canWake: !!all[pc].wake,
      explorer: !!sess && sess.fs === pc,
      agentOnline: cur.online,
      lastSeen: cur.seen,
      metrics: m ? m.data : null,
      metricsAgeMs: m ? now - m.at : null,
      tunnel: !!this.agentWs(pc),
      terms: (await this.getTerms(pc)).map((t) => ({ id: t.id, shell: t.shell, cwd: t.cwd, at: t.at, granted: granted.has(t.id) })),
    };
  }

  // ---------- Print da tela: só fica guardado por SHOT_TTL_MS ----------

  async storeShot(pc, ts, id, bytes) {
    const accepted = await this.acceptAgent(pc, ts);
    if (accepted !== true) return accepted;
    const cmds = (await this.ctx.storage.get("cmds:" + pc)) || [];
    const c = cmds.find((x) => x.id === id);
    if (!c || c.action !== "screenshot" || c.state !== "sent") return false;
    const now = Date.now();
    await this.ctx.storage.put("shot:" + pc, { id, at: now, bytes });
    await this.ctx.storage.setAlarm(now + SHOT_TTL_MS);
    return true;
  }

  async getShot(pc, id) {
    const s = await this.ctx.storage.get("shot:" + pc);
    if (!s || s.id !== id || Date.now() - s.at > SHOT_TTL_MS) return null;
    return s.bytes;
  }

  // O alarme é o do print mais novo; um mais antigo nunca é servido depois de vencer (getShot).
  async alarm() {
    await this.ctx.storage.delete(Object.keys(await this.pcs()).map((pc) => "shot:" + pc));
  }

  // ---------- Terminais: túnel com o agente e WebSockets do navegador ----------
  //
  // Os WebSockets usam a API de hibernação, então o estado de cada um fica no "attachment":
  //   agente:    { role: "agent", pc, authed, synced, cn, sn, key, n }
  //   navegador: { role: "term", id, sk, pc, exp, fresh }
  // Quem altera um attachment sempre relê antes de gravar (patchSocket), porque dois
  // tratadores podem estar no meio de um 'await' ao mesmo tempo.

  closeSocket(ws, code, reason) {
    try {
      ws.close(code, reason);
    } catch {
      /* já estava fechado */
    }
  }

  // Fecha o WebSocket de um terminal avisando antes o motivo. Há clientes (e o wrangler dev) que
  // demoram a concluir o fechamento; com o aviso, eles já sabem o que houve.
  closeTermSocket(ws, code, reason) {
    try {
      ws.send(JSON.stringify({ t: "close", code }));
    } catch {
      /* já estava fechado */
    }
    this.closeSocket(ws, code, reason);
  }

  patchSocket(ws, patch) {
    const a = ws.deserializeAttachment();
    if (!a) return null;
    Object.assign(a, patch);
    ws.serializeAttachment(a);
    return a;
  }

  // O WebSocket do agente do PC que já provou conhecer a chave. Só existe um por PC.
  agentWs(pc, except = null) {
    for (const ws of this.ctx.getWebSockets("agent:" + pc)) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment();
      if (a && a.authed) return ws;
    }
    return null;
  }

  // Envia para o agente uma mensagem numerada e assinada com a chave desta conexão.
  // Resolve com false se não há túnel. A fila garante que a numeração saia em ordem.
  sendAgent(pc, payload) {
    const ws = this.agentWs(pc);
    if (!ws) return Promise.resolve(false);
    const job = this.outbox.then(async () => {
      try {
        const a = ws.deserializeAttachment();
        a.n++;
        ws.serializeAttachment(a);
        const text = JSON.stringify({ n: a.n, ...payload });
        ws.send((await hmacHex(a.key, text)) + " " + text);
        return true;
      } catch {
        return false;   // o túnel caiu: o agente reconecta e manda a lista de terminais de novo
      }
    });
    this.outbox = job;
    return job;
  }

  broadcastTerms(pc, data) {
    const text = JSON.stringify(data);
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment();
      if (!a || a.role !== "term" || a.pc !== pc) continue;
      try {
        ws.send(text);
      } catch {
        /* fechando */
      }
    }
  }

  // Avisa quem está olhando um terminal que ele acabou e fecha esses WebSockets.
  endTermSockets(id, code, error) {
    const text = JSON.stringify({ t: "exit", code, error });
    for (const ws of this.ctx.getWebSockets("term:" + id)) {
      try {
        ws.send(text);
      } catch {
        /* fechando */
      }
      this.closeTermSocket(ws, WS_ENDED, "ended");
    }
  }

  async getTerms(pc) {
    return (await this.ctx.storage.get("terms:" + pc)) || [];
  }

  // Ações de terminal, já autorizadas pela passkey. Devolve { id } ou { error }.
  async termAction(sessKey, pc, action, arg) {
    const sess = await this.liveSession(sessKey);
    if (!sess) return { error: "session" };
    const terms = await this.getTerms(pc);
    let id;
    if (action === "term-open") {
      if (!this.agentWs(pc)) return { error: "offline" };
      if (terms.length >= MAX_TERMS) return { error: "limit" };
      id = randomB64u(8);
      terms.push({ id, shell: arg.shell, cwd: arg.cwd, at: Date.now(), pending: true });
      await this.ctx.storage.put("terms:" + pc, terms);
    } else {
      id = arg.id;
      if (!terms.some((t) => t.id === id)) return { error: "gone" };
    }
    if (action === "term-close") {
      return (await this.sendAgent(pc, { t: "kill", id })) ? { id } : { error: "offline" };
    }
    // Abrir e reconectar liberam este terminal para a sessão que confirmou com a passkey.
    sess.terms = [...(sess.terms || []).filter((x) => x !== id), id].slice(-MAX_GRANTS);
    await this.ctx.storage.put("sess:" + sessKey, sess);
    if (action === "term-open") {
      await this.sendAgent(pc, { t: "open", id, shell: arg.shell, cwd: arg.cwd, resume: arg.resume || null, cols: arg.cols, rows: arg.rows });
    }
    return { id };
  }

  // Pergunta algo ao agente pelo túnel e espera a resposta. Enquanto espera, o objeto fica
  // acordado (o pedido HTTP está aberto), então a resposta chega a esta mesma instância.
  async agentQuery(pc, payload) {
    if (!this.agentWs(pc)) return { error: "offline" };
    const rid = randomB64u(9);
    const answer = new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.replies.delete(rid);
        resolve({ error: "timeout" });
      }, QUERY_TIMEOUT_MS);
      this.replies.set(rid, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
    if (!(await this.sendAgent(pc, { ...payload, rid }))) {
      const done = this.replies.get(rid);
      this.replies.delete(rid);
      if (done) done({ error: "offline" });
    }
    return answer;
  }

  // Só chegam aqui pedidos de WebSocket que o Worker já conferiu (assinatura do agente
  // ou origem do navegador). A sessão do navegador é conferida aqui.
  async fetch(request) {
    if (!isUpgrade(request)) return new Response(null, { status: 426 });
    const url = new URL(request.url);
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const accepted = new Response(null, { status: 101, webSocket: client });

    if (url.pathname === "/agent") {
      const cn = url.searchParams.get("cn") || "";
      const pc = url.searchParams.get("pc") || "";
      if (!/^[0-9a-f]{32}$/.test(cn) || !(await this.hasPc(pc)) || !this.env.AGENT_SECRET) return new Response(null, { status: 400 });
      // Uma tentativa pendente por PC: quem não terminou de se autenticar sai.
      for (const old of this.ctx.getWebSockets("agent:" + pc)) {
        const a = old.deserializeAttachment();
        if (!a || !a.authed) this.closeSocket(old, 4000, "replaced");
      }
      const secret = await pcKey(this.env, pc);
      const sn = toHex(crypto.getRandomValues(new Uint8Array(16)));
      const key = await hmacHex(secret, ["wskey", cn, sn].join("|"));
      const proof = await hmacHex(secret, ["wsresp", cn, sn].join("|"));
      this.ctx.acceptWebSocket(server, ["agent:" + pc]);
      server.serializeAttachment({ role: "agent", pc, authed: false, synced: false, cn, sn, key, n: 0 });
      // 'proof' mostra ao agente que este lado conhece o segredo; ele responde com a prova dele.
      server.send(JSON.stringify({ t: "hello", sn, proof }));
      return accepted;
    }

    if (url.pathname === "/term") {
      // Recusa aceitando e fechando com um código: é o único jeito de a página saber o motivo.
      const refuse = (code, reason) => {
        server.accept();
        this.closeTermSocket(server, code, reason);
        return accepted;
      };
      const id = url.searchParams.get("id") || "";
      const sk = request.headers.get("x-sk") || "";
      if (!TERM_ID.test(id)) return refuse(4400, "id");
      const sess = await this.liveSession(sk);
      if (!sess) return refuse(WS_SESSION, "session");
      const pc = sess.pc || DEFAULT_PC;   // só terminais do PC em uso
      if (!(sess.terms || []).includes(id)) return refuse(WS_GRANT, "grant");
      if (!(await this.getTerms(pc)).some((t) => t.id === id)) return refuse(WS_GONE, "gone");
      if (!this.agentWs(pc)) return refuse(WS_OFFLINE, "offline");
      this.ctx.acceptWebSocket(server, ["term:" + id, "sess:" + sk]);
      // 'fresh': ainda não recebeu a cópia da tela; até lá ignora a saída ao vivo.
      server.serializeAttachment({ role: "term", id, sk, pc, exp: sess.exp, fresh: true });
      await this.sendAgent(pc, {
        t: "attach",
        id,
        cols: clampInt(url.searchParams.get("cols"), 20, 400, 100),
        rows: clampInt(url.searchParams.get("rows"), 5, 200, 30),
      });
      return accepted;
    }

    return new Response(null, { status: 404 });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string") return;
    const a = ws.deserializeAttachment();
    if (!a) return;
    if (a.role === "agent") await this.onAgentMessage(ws, a, message);
    else if (a.role === "term") await this.onTermMessage(ws, a, message);
  }

  async webSocketClose(ws) {
    this.closeSocket(ws, 1000, "");   // completa o fechamento
    await this.socketGone(ws);
  }

  async webSocketError(ws) {
    await this.socketGone(ws);
  }

  async socketGone(ws) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    if (a.role === "agent") {
      if (a.authed && !this.agentWs(a.pc, ws)) this.broadcastTerms(a.pc, { t: "offline" });
      return;
    }
    if (a.role === "term" && !this.ctx.getWebSockets("term:" + a.id).some((x) => x !== ws)) {
      await this.sendAgent(a.pc, { t: "detach", id: a.id });   // ninguém mais olhando: o agente para de transmitir
    }
  }

  async onAgentMessage(ws, a, message) {
    if (!a.authed) {
      let m = null;
      try {
        m = JSON.parse(message);
      } catch {
        /* cai na recusa abaixo */
      }
      const expected = await hmacHex(await pcKey(this.env, a.pc), ["wsauth", a.cn, a.sn].join("|"));
      if (!m || m.t !== "auth" || typeof m.proof !== "string" || !safeEq(m.proof, expected)) {
        console.warn("túnel recusado: prova inválida");
        this.closeSocket(ws, WS_SESSION, "auth");
        return;
      }
      for (const other of this.ctx.getWebSockets("agent:" + a.pc)) {
        if (other === ws) continue;
        this.patchSocket(other, { authed: false });
        this.closeSocket(other, 4000, "replaced");
      }
      this.patchSocket(ws, { authed: true });
      await this.sendAgent(a.pc, { t: "ready" });   // só depois disso o agente manda a lista de terminais
      return;
    }

    // Saída de um terminal: "o" + id + dados (ao vivo) ou "r" + id + dados (cópia da tela para quem acabou de entrar).
    const kind = message[0];
    if (kind === "o" || kind === "r") {
      if (message.length < 12) return;
      const data = kind + message.slice(12);
      for (const b of this.ctx.getWebSockets("term:" + message.slice(1, 12))) {
        const ba = b.deserializeAttachment();
        if (!ba) continue;
        if (kind === "r") {
          if (!ba.fresh) continue;
          ba.fresh = false;
          b.serializeAttachment(ba);
        } else if (ba.fresh) {
          continue;
        }
        try {
          b.send(data);
        } catch {
          /* fechando */
        }
      }
      return;
    }

    if (kind !== "{") return;
    let m;
    try {
      m = JSON.parse(message);
    } catch {
      return;
    }
    if (!m || typeof m !== "object") return;
    if (m.t === "terms") await this.syncTerms(ws, a.pc, m.list);
    else if (m.t === "exit") await this.termExited(a.pc, m);
    else if (m.t === "reply" && typeof m.rid === "string") {
      const done = this.replies.get(m.rid);
      this.replies.delete(m.rid);
      if (done) done(m.data && typeof m.data === "object" ? m.data : { error: "invalid" });
    }
  }

  // A lista do agente é a verdade: ele é quem tem os terminais.
  async syncTerms(ws, pc, list) {
    const now = Date.now();
    const fromAgent = [];
    for (const t of Array.isArray(list) ? list.slice(0, MAX_TERMS + 2) : []) {
      if (!t || typeof t.id !== "string" || !TERM_ID.test(t.id) || !TERM_SHELLS.has(t.shell)) continue;
      fromAgent.push({
        id: t.id,
        shell: t.shell,
        cwd: typeof t.cwd === "string" ? t.cwd.slice(0, MAX_CWD) : null,
        at: Number(t.at) || now,
      });
    }
    const known = new Set(fromAgent.map((t) => t.id));
    const next = fromAgent.slice();
    for (const t of await this.getTerms(pc)) {
      if (known.has(t.id)) continue;
      if (t.pending && now - t.at < TERM_PENDING_MS) next.push(t);   // pedido agora há pouco: o agente ainda vai confirmar
      else this.endTermSockets(t.id, null, "O terminal não existe mais no PC.");
    }
    await this.ctx.storage.put("terms:" + pc, next);

    const a = ws.deserializeAttachment();
    if (!a || a.synced) return;
    this.patchSocket(ws, { synced: true });
    // Primeira lista depois de (re)conectar: retoma a transmissão dos terminais que têm alguém olhando.
    for (const t of next) {
      const socks = this.ctx.getWebSockets("term:" + t.id);
      if (socks.length === 0) continue;
      for (const b of socks) this.patchSocket(b, { fresh: true });
      await this.sendAgent(pc, { t: "attach", id: t.id });
    }
  }

  async termExited(pc, m) {
    if (typeof m.id !== "string" || !TERM_ID.test(m.id)) return;
    const terms = await this.getTerms(pc);
    const next = terms.filter((t) => t.id !== m.id);
    if (next.length !== terms.length) await this.ctx.storage.put("terms:" + pc, next);
    this.endTermSockets(
      m.id,
      Number.isInteger(m.code) ? m.code : null,
      typeof m.error === "string" ? m.error.slice(0, 200) : null
    );
  }

  async onTermMessage(ws, a, message) {
    if (Date.now() > a.exp) {
      await this.liveSession(a.sk);   // apaga a sessão vencida e fecha os terminais dela
      this.closeTermSocket(ws, WS_SESSION, "session");
      return;
    }

    if (message[0] === "i") {
      if (message.length < 2 || message.length > MAX_TERM_INPUT + 1) return;
      if (!(await this.sendAgent(a.pc, { t: "in", id: a.id, d: message.slice(1) }))) {
        try {
          ws.send(JSON.stringify({ t: "offline" }));
        } catch {
          /* fechando */
        }
      }
      return;
    }

    if (message[0] !== "{") return;
    let m;
    try {
      m = JSON.parse(message);
    } catch {
      return;
    }
    if (m && m.t === "size") {
      await this.sendAgent(a.pc, {
        t: "size",
        id: a.id,
        cols: clampInt(m.cols, 20, 400, 100),
        rows: clampInt(m.rows, 5, 200, 30),
      });
    }
  }
}

/* ------------------------------------------------------------------ */
/* Rotas                                                               */
/* ------------------------------------------------------------------ */

async function requireSetupToken(store, body, env, ip) {
  if (!(await store.hit("setup", ip, 8, 15 * 60_000))) {
    throw new HttpError(429, "Muitas tentativas. Aguarde alguns minutos.");
  }
  if (typeof body.setupToken !== "string" || !(await tokenOk(body.setupToken, env.SETUP_TOKEN))) {
    throw new HttpError(403, "Token de configuração inválido.");
  }
}

function sessionToken(request) {
  const cookies = request.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === SESSION_COOKIE && v) return v;
  }
  return null;
}

async function sessionKey(token) {
  return toHex(await sha256(enc.encode(token)));
}

// Devolve a chave da sessão (o hash do token, que a identifica no Durable Object), o PC em uso
// e o PC cujo explorador foi aberto com a passkey.
async function requireSession(request, store) {
  const token = sessionToken(request);
  const key = token ? await sessionKey(token) : null;
  const sess = key ? await store.liveSession(key) : null;
  if (!sess) {
    throw new HttpError(401, "Entre com sua digital para continuar.");
  }
  return { sk: key, pc: sess.pc || DEFAULT_PC, fs: sess.fs || null };
}

const TERM_ERRORS = {
  session: [401, "Entre com sua digital para continuar."],
  offline: [409, "O PC não está conectado para terminais. Veja se ele está ligado e com o agente rodando."],
  limit: [429, "Limite de terminais abertos atingido. Encerre algum antes de abrir outro."],
  gone: [404, "Esse terminal não existe mais."],
};

// ---------- WebSockets ----------

// Túnel do agente. O cliente WebSocket do Node não manda cabeçalhos próprios, então a
// assinatura vem na URL. Ela só abre a conexão: lá dentro os dois lados ainda trocam
// provas com nonces novos, então repetir esta URL não serve para nada.
async function agentSocket(request, env, store, url) {
  if (!env.AGENT_SECRET) throw new HttpError(503, "Defina o secret AGENT_SECRET.");
  if (!isUpgrade(request)) throw new HttpError(400, "Esperava um WebSocket.");
  const pc = url.searchParams.get("pc") || "";
  if (!PC_ID.test(pc)) throw new HttpError(400, "PC desconhecido.");   // o Durable Object confere se ele está na lista
  const tsText = url.searchParams.get("ts") || "";
  const nonce = url.searchParams.get("nonce") || "";
  const sig = url.searchParams.get("sig") || "";
  if (!/^[0-9]{10,16}$/.test(tsText) || !/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) {
    throw new HttpError(400, "Requisição inválida.");
  }
  if (Math.abs(Date.now() - Number(tsText)) > AGENT_CLOCK_SKEW_MS) throw new HttpError(401, "Relógio fora de sincronia.");
  const expected = await hmacHex(await pcKey(env, pc), ["agentws", tsText, nonce].join("|"));
  if (!safeEq(sig, expected)) throw new HttpError(401, "Assinatura inválida.");
  return store.fetch(new Request("https://store/agent?cn=" + nonce + "&pc=" + pc, request));
}

// Terminal no navegador. O cookie de sessão vai junto no pedido; a origem precisa ser a da própria página.
async function termSocket(request, store, url, origin) {
  if (!isUpgrade(request)) throw new HttpError(400, "Esperava um WebSocket.");
  if (request.headers.get("origin") !== origin) throw new HttpError(403, "Origem não permitida.");
  const token = sessionToken(request);
  const inner = new Request("https://store/term" + url.search, request);
  inner.headers.set("x-sk", token ? await sessionKey(token) : "");   // sempre sobrescreve o que vier de fora
  return store.fetch(inner);
}

// Monta as opções do navegador; 'data' fica guardado junto do desafio.
async function assertionOptions(store, type, rpId, data = null) {
  const creds = await store.getCreds();
  if (creds.length === 0) {
    throw new HttpError(409, "Nenhum aparelho cadastrado. Abra a seção Configurar.");
  }
  const ch = await store.newChallenge(type, data);
  return json({
    chId: ch.id,
    challenge: ch.challenge,
    rpId,
    allowCredentials: creds.map((c) => c.id),
  });
}

const MAX_CHALLENGE_ID = 2048;

// Valida a assinatura da passkey e devolve o 'data' que veio com o desafio.
async function checkAssertion(store, body, type, rpId, origin) {
  const ch = await store.openChallenge(str(body.chId, MAX_CHALLENGE_ID), type);
  if (!ch) throw new HttpError(400, "Desafio expirado ou inválido.");
  const credId = str(body.credentialId, 1400);
  const cred = (await store.getCreds()).find((c) => c.id === credId);
  if (!cred) fail("unknown_credential");
  const counter = await verifyAssertion({ cred, body, challenge: ch.challenge, rpId, origin });
  if (!(await store.useChallenge(ch.challenge, ch.exp))) throw new HttpError(400, "Desafio expirado ou inválido.");
  await store.setSignCount(cred.id, counter);
  return ch.data;
}

// ---------- Agente do Windows ----------

// A assinatura cobre caminho, horário, nonce e corpo. O agente confere a resposta pelo mesmo nonce.
async function agentRoute(request, env, store, url) {
  if (!env.AGENT_SECRET) throw new HttpError(503, "Defina o secret AGENT_SECRET.");
  const tsText = request.headers.get("x-ts") || "";
  const nonce = request.headers.get("x-nonce") || "";
  const sig = request.headers.get("x-sig") || "";
  const pc = request.headers.get("x-pc") || "";
  if (!/^[0-9]{10,16}$/.test(tsText) || !/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) {
    throw new HttpError(400, "Requisição inválida.");
  }
  if (!PC_ID.test(pc)) throw new HttpError(400, "PC desconhecido.");   // o Durable Object confere se está na lista
  const key = await pcKey(env, pc);   // a chave de um PC só confere para o próprio PC
  const ts = Number(tsText);
  if (Math.abs(Date.now() - ts) > AGENT_CLOCK_SKEW_MS) throw new HttpError(401, "Relógio fora de sincronia.");

  const path = url.pathname;
  const limit = path === "/api/agent/shot" ? MAX_SHOT : MAX_AGENT_JSON;
  if (Number(request.headers.get("content-length") || 0) > limit) throw new HttpError(413, "Corpo grande demais.");
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > limit) throw new HttpError(413, "Corpo grande demais.");

  const bodyHash = toHex(await sha256(bytes));
  const expected = await hmacHex(key, ["agent", path + url.search, tsText, nonce, bodyHash].join("|"));
  if (!safeEq(sig, expected)) throw new HttpError(401, "Assinatura inválida.");

  const signed = async (data) => {
    const text = JSON.stringify(data);
    const proof = await hmacHex(key, ["resp", nonce, toHex(await sha256(enc.encode(text)))].join("|"));
    return new Response(text, {
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-sig": proof },
    });
  };

  if (path === "/api/agent/shot") {
    const id = url.searchParams.get("id") || "";
    if (!COMMAND_ID.test(id)) throw new HttpError(400, "Comando inválido.");
    const stored = await store.storeShot(pc, ts, id, bytes);
    if (stored === "unknown") throw new HttpError(400, "PC desconhecido.");
    if (!stored) throw new HttpError(409, "Comando inválido.");
    return signed({ ok: true });
  }

  let body;
  try {
    body = JSON.parse(dec.decode(bytes));
  } catch {
    throw new HttpError(400, "JSON inválido.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "JSON inválido.");

  if (path === "/api/agent/poll") {
    const metrics = body.metrics && typeof body.metrics === "object" ? body.metrics : null;
    const res = await store.agentPoll(pc, ts, metrics);
    if (res === "unknown") throw new HttpError(400, "PC desconhecido.");
    if (!res) throw new HttpError(409, "Requisição repetida.");
    return signed(res);
  }

  if (path === "/api/agent/result") {
    const id = str(body.id, 32);
    const message = typeof body.message === "string" ? body.message.slice(0, 300) : null;
    if ((await store.agentResult(pc, ts, id, body.ok === true, message)) === "unknown") throw new HttpError(400, "PC desconhecido.");
    return signed({ ok: true });
  }

  throw new HttpError(404, "Não encontrado.");
}

async function route(request, env) {
  if (!env.SETUP_TOKEN || !env.DEVICE_SECRET) {
    throw new HttpError(500, "Defina os secrets SETUP_TOKEN e DEVICE_SECRET.");
  }

  const url = new URL(request.url);
  const path = url.pathname;
  const rpId = url.hostname;
  const origin = url.origin;
  // Na Cloudflare o IP vem em cf-connecting-ip. Hospedagem própria pode apontar outro cabeçalho do
  // proxy (CLIENT_IP_HEADER); vale o último IP da lista, que é o que o proxy acrescentou.
  const ip = (request.headers.get(env.CLIENT_IP_HEADER || "cf-connecting-ip") || "?").split(",").pop().trim();
  const store = env.STORE.get(env.STORE.idFromName("main"));

  if (request.method === "GET" && path === "/") return page(url);
  if (request.method === "GET" && path === "/favicon.ico") return new Response(null, { status: 204 });
  // Na Cloudflare, public/ é servido antes do Worker ([assets] no wrangler.toml). Na hospedagem
  // própria (workerd, veja selfhost/), os arquivos vêm do binding ASSETS, uma pasta em disco.
  const asset = env.ASSETS && request.method === "GET" && /^\/[a-z0-9-]+\.(js|css|png|webmanifest)$/.exec(path);
  if (asset) {
    const res = await env.ASSETS.fetch(new Request("http://assets" + path));
    if (res.ok) {
      return new Response(res.body, {
        headers: { "content-type": ASSET_TYPES[asset[1]], "cache-control": "public, max-age=0, must-revalidate", "x-content-type-options": "nosniff" },
      });
    }
  }

  // ---------- WebSockets (túnel do agente e terminais) ----------
  if (request.method === "GET" && path === "/api/agent/ws") return agentSocket(request, env, store, url);
  if (request.method === "GET" && path === "/api/term/ws") return termSocket(request, store, url, origin);

  if (request.method === "GET" && path === "/api/status") {
    return json(await store.status());
  }

  // ---------- ESP32 ----------
  if (request.method === "GET" && path === "/api/device/poll") {
    const nonce = request.headers.get("x-nonce") || "";
    const sig = request.headers.get("x-sig") || "";
    if (!/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) {
      throw new HttpError(400, "Requisição inválida.");
    }
    if (!safeEq(sig, await hmacHex(env.DEVICE_SECRET, "poll|" + nonce))) {
      throw new HttpError(401, "Assinatura inválida.");
    }
    const w = (await store.devicePoll()) ? "1" : "0";
    const proof = await hmacHex(env.DEVICE_SECRET, "resp|" + nonce + "|" + w);
    return new Response(w + " " + proof, {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // ---------- Agente do Windows ----------
  if (request.method === "POST" && path.startsWith("/api/agent/")) {
    return agentRoute(request, env, store, url);
  }

  // ---------- Painel (leitura, exige sessão) ----------
  if (request.method === "GET" && path === "/api/pc") {
    return json(await store.pcInfo((await requireSession(request, store)).sk));
  }

  // Explorador: pastas, arquivos e as últimas sessões do Claude (ou do Codex) de uma pasta do PC
  // em uso. Só leitura, mas pede o explorador aberto com a digital (ação fs-open) neste PC.
  // /api/sessions (área de vibecoding) traz só as sessões, sem listar a pasta: basta estar logado.
  if (request.method === "GET" && (path === "/api/fs" || path === "/api/sessions")) {
    const s = await requireSession(request, store);
    if (path === "/api/fs" && s.fs !== s.pc) throw new HttpError(403, "Abra o explorador com a digital.");
    if (!(await store.hit("fs", ip, 120, 60_000))) throw new HttpError(429, "Muitas tentativas.");
    const res = await store.agentQuery(s.pc, {
      t: path === "/api/fs" ? "ls" : "sessions",
      path: checkCwd(url.searchParams.get("path")),
      agent: url.searchParams.get("agent") === "codex" ? "codex" : "claude",
    });
    if (res.error === "offline") throw new HttpError(409, TERM_ERRORS.offline[1]);
    if (res.error === "timeout" || res.error === "invalid") throw new HttpError(504, "O PC não respondeu a tempo.");
    if (res.error) throw new HttpError(404, String(res.error).slice(0, 200));
    return json(res);
  }

  if (request.method === "GET" && path === "/api/action/status") {
    const s = await requireSession(request, store);
    const id = url.searchParams.get("id") || "";
    if (!COMMAND_ID.test(id)) throw new HttpError(400, "Comando inválido.");
    const st = await store.commandStatus(s.pc, id);
    if (!st) throw new HttpError(404, "Comando não encontrado.");
    return json(st);
  }

  if (request.method === "GET" && path === "/api/pc/screenshot") {
    const s = await requireSession(request, store);
    const id = url.searchParams.get("id") || "";
    if (!COMMAND_ID.test(id)) throw new HttpError(400, "Comando inválido.");
    const bytes = await store.getShot(s.pc, id);
    if (!bytes) throw new HttpError(404, "O print expirou. Capture a tela de novo.");
    return new Response(bytes, {
      headers: { "content-type": "image/jpeg", "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }

  // ---------- API do navegador ----------
  if (request.method === "POST" && path.startsWith("/api/")) {
    const o = request.headers.get("origin");
    if (o && o !== origin) throw new HttpError(403, "Origem não permitida.");
    const body = await readJson(request);

    switch (path) {
      case "/api/register/options": {
        await requireSetupToken(store, body, env, ip);
        const creds = await store.getCreds();
        if (creds.length >= MAX_CREDS) throw new HttpError(409, "Limite de aparelhos atingido.");
        const ch = await store.newChallenge("reg");
        return json({
          chId: ch.id,
          challenge: ch.challenge,
          rpId,
          userId: await store.userId(),
          exclude: creds.map((c) => c.id),
        });
      }

      case "/api/register/verify": {
        const ch = await store.openChallenge(str(body.chId, MAX_CHALLENGE_ID), "reg");
        if (!ch) throw new HttpError(400, "Desafio expirado ou inválido.");
        checkClientData(b64(body.clientDataJSON, 2048), "webauthn.create", ch.challenge, origin);

        const alg = body.alg;
        if (alg !== -7 && alg !== -257) throw new HttpError(400, "Algoritmo de chave não suportado.");
        const id = str(body.credentialId, 1400);
        b64(id, 1400);
        const publicKey = str(body.publicKey, 2048);
        try {
          await importPublicKey(b64(publicKey, 2048), alg); // valida a chave
        } catch {
          throw new HttpError(400, "Chave pública inválida.");
        }
        if (!(await store.useChallenge(ch.challenge, ch.exp))) throw new HttpError(400, "Desafio expirado ou inválido.");
        const added = await store.addCred({ id, publicKey, alg, signCount: 0, createdAt: Date.now() });
        if (!added) throw new HttpError(409, "Aparelho já cadastrado ou limite atingido.");
        return json({ ok: true });
      }

      case "/api/wake/options": {
        if (!(await store.hit("wakeopt", ip, 30, 60_000))) throw new HttpError(429, "Muitas tentativas.");
        return assertionOptions(store, "auth", rpId);
      }

      case "/api/wake/verify": {
        await checkAssertion(store, body, "auth", rpId, origin);
        await store.setWake();
        return json({ ok: true });
      }

      case "/api/login/options": {
        if (!(await store.hit("loginopt", ip, 30, 60_000))) throw new HttpError(429, "Muitas tentativas.");
        // Entra direto no PC escolhido por último neste aparelho: o login já é uma passkey.
        return assertionOptions(store, "login", rpId, { pc: (await store.hasPc(body.pc)) ? body.pc : DEFAULT_PC });
      }

      case "/api/login/verify": {
        const data = await checkAssertion(store, body, "login", rpId, origin);
        const token = randomB64u(32);
        await store.createSession(await sessionKey(token), data && (await store.hasPc(data.pc)) ? data.pc : DEFAULT_PC);
        const maxAge = Math.floor(SESSION_TTL_MS / 1000);
        return json({ ok: true }, 200, {
          "set-cookie": SESSION_COOKIE + "=" + token + "; Max-Age=" + maxAge + "; Path=/; Secure; HttpOnly; SameSite=Strict",
        });
      }

      case "/api/logout": {
        const token = sessionToken(request);
        if (token) await store.deleteSession(await sessionKey(token));
        return json({ ok: true }, 200, {
          "set-cookie": SESSION_COOKIE + "=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict",
        });
      }

      case "/api/action/options": {
        const s = await requireSession(request, store);
        if (!(await store.hit("actionopt", ip, 30, 60_000))) throw new HttpError(429, "Muitas tentativas.");
        const action = body.action;
        if (typeof action !== "string") throw new HttpError(400, "Ação inválida.");
        let arg = null;
        if (TERM_ACTIONS.has(action)) {
          arg = termArg(action, body.arg);
        } else if (action === "pc-switch" || action === "pc-key" || action === "pc-remove") {
          if (!(await store.hasPc(body.arg)) || (action === "pc-remove" && body.arg === DEFAULT_PC)) throw new HttpError(400, "PC desconhecido.");
          arg = body.arg;
        } else if (action === "pc-add") {
          arg = typeof body.arg === "string" ? body.arg.trim() : "";
          if (!PC_LABEL.test(arg)) throw new HttpError(400, "Dê um nome de 1 a 24 letras ao computador.");
        } else if (action === "fs-open") {
          arg = null;
        } else if (!ACTIONS.has(action)) {
          throw new HttpError(400, "Ação inválida.");
        } else if (action === "run") {
          if (typeof body.arg !== "string" || !PROGRAM_ID.test(body.arg)) throw new HttpError(400, "Programa inválido.");
          arg = body.arg;
        } else if (action === "program-add") {
          arg = programArg(body.arg);
        }
        // O desafio fica amarrado à ação, ao argumento, à sessão que pediu e ao PC em uso.
        return assertionOptions(store, "action", rpId, { action, arg, sk: s.sk, pc: s.pc });
      }

      case "/api/action/verify": {
        const s = await requireSession(request, store);
        const data = await checkAssertion(store, body, "action", rpId, origin);
        if (data.sk !== s.sk) throw new HttpError(403, "Esse pedido é de outra sessão. Tente de novo.");
        if (data.pc !== s.pc) throw new HttpError(409, "Você trocou de PC no meio do pedido. Tente de novo.");
        if (data.action === "pc-switch") {
          if (!(await store.switchPc(s.sk, data.arg))) throw new HttpError(401, TERM_ERRORS.session[1]);
          return json({ pc: data.arg });
        }
        if (PC_ACTIONS.has(data.action)) {
          if (!env.AGENT_SECRET) throw new HttpError(503, "Defina o secret AGENT_SECRET.");
          if (data.action === "pc-remove") {
            if (!(await store.removePc(data.arg))) throw new HttpError(404, "PC desconhecido.");
            return json({ ok: true });
          }
          const id = data.action === "pc-add" ? await store.addPc(data.arg) : data.arg;
          if (!id) throw new HttpError(409, "Limite de " + MAX_PCS + " computadores atingido. Remova algum antes.");
          if (!(await store.hasPc(id))) throw new HttpError(404, "PC desconhecido.");
          // A chave só sai daqui depois da passkey; a página mostra o comando de instalação com ela.
          return json({ pc: id, key: await pcKey(env, id) });
        }
        if (data.action === "fs-open") {
          if (!(await store.openFs(s.sk, s.pc))) throw new HttpError(401, TERM_ERRORS.session[1]);
          return json({ ok: true });
        }
        if (TERM_ACTIONS.has(data.action)) {
          const res = await store.termAction(s.sk, s.pc, data.action, data.arg);
          if (res.error) {
            const [status, message] = TERM_ERRORS[res.error] || [500, "Erro interno."];
            throw new HttpError(status, message);
          }
          return json({ term: res.id });
        }
        const id = await store.queueCommand(s.pc, data.action, data.arg);
        if (!id) throw new HttpError(429, "Muitos comandos recentes. Tente em instantes.");
        return json({ id });
      }

      case "/api/reset": {
        await requireSetupToken(store, body, env, ip);
        await store.resetAll();
        return json({ ok: true });
      }
    }
  }

  throw new HttpError(404, "Não encontrado.");
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (e) {
      if (e instanceof HttpError) {
        if (e.code) console.warn("auth recusada:", e.code);
        return json({ error: e.message, code: e.code }, e.status);
      }
      console.error(e);
      return json({ error: "Erro interno." }, 500);
    }
  },
};

/* ------------------------------------------------------------------ */
/* Página                                                              */
/* ------------------------------------------------------------------ */

// O xterm.js (terminal) vem de arquivos estáticos do próprio Worker ('self') e cria as folhas de
// estilo dele em tempo de execução, por isso os estilos precisam de 'unsafe-inline'. Os scripts
// continuam restritos: só o da página (nonce) e os arquivos deste domínio.
function page(url) {
  const nonce = randomB64u(16);
  const html = PAGE.replaceAll("__NONCE__", nonce);
  const ws = (url.protocol === "https:" ? "wss://" : "ws://") + url.host;   // nem todo navegador inclui wss em 'self'
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; script-src 'nonce-" + nonce + "' 'self'; style-src 'self' 'unsafe-inline'" +
        "; img-src 'self'; connect-src 'self' " + ws + "; manifest-src 'self'; worker-src 'self'" +
        "; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}
