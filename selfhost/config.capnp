# Central do PC fora da Cloudflare: o mesmo worker.js rodando no workerd, o motor de código aberto
# da Cloudflare (https://github.com/cloudflare/workerd). Veja docs/hospedagem-propria.md.
#
#   workerd serve selfhost/config.capnp
#
# Padrões pensados para o Docker (selfhost/Dockerfile). Fora dele, troque na linha de comando:
#   --socket-addr http=127.0.0.1:8080
#   --directory-path public=./public --directory-path data=./dados
#
# Segredos e opções vêm das variáveis de ambiente: SETUP_TOKEN, DEVICE_SECRET, AGENT_SECRET e,
# atrás de um proxy que não seja o Caddy deste projeto, CLIENT_IP_HEADER.
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "central", worker = .central),
    # Arquivos estáticos (xterm.js, ícones, manifesto, service worker): só leitura.
    (name = "public", disk = (path = "/app/public")),
    # Banco do Durable Object (SQLite). Faça backup desta pasta.
    (name = "data", disk = (path = "/data", writable = true)),
  ],
  sockets = [
    # HTTP simples: o HTTPS fica com o proxy da frente (Caddy), que manda X-Forwarded-Proto.
    # Sem isso a página acharia que está em http:// e a passkey não funcionaria.
    (name = "http", address = "*:8080", http = (forwardedProtoHeader = "X-Forwarded-Proto"), service = "central"),
  ],
);

const central :Workerd.Worker = (
  modules = [
    (name = "worker.js", esModule = embed "../worker.js"),
    (name = "page.js", esModule = embed "../page.js"),
  ],
  compatibilityDate = "2025-09-01",
  bindings = [
    (name = "STORE", durableObjectNamespace = (className = "Store")),
    (name = "ASSETS", service = "public"),
    (name = "SETUP_TOKEN", fromEnvironment = "SETUP_TOKEN"),
    (name = "DEVICE_SECRET", fromEnvironment = "DEVICE_SECRET"),
    (name = "AGENT_SECRET", fromEnvironment = "AGENT_SECRET"),
    (name = "CLIENT_IP_HEADER", fromEnvironment = "CLIENT_IP_HEADER"),
  ],
  durableObjectNamespaces = [
    (className = "Store", uniqueKey = "central-do-pc-store", enableSql = true),
  ],
  durableObjectStorage = (localDisk = "data"),
);
