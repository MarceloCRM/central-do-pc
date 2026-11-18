# Central do PC em contêiner: o workerd (motor de código aberto da Cloudflare) servindo o mesmo
# worker.js. Construa a partir da RAIZ do projeto:
#   docker build -f selfhost/Dockerfile -t central-do-pc .
# Roda em qualquer lugar que aceite um contêiner com disco persistente em /data.
FROM node:22-bookworm-slim

WORKDIR /app

# Só o motor, na mesma versão que o wrangler do projeto usa (lida do package-lock.json).
COPY package-lock.json ./
RUN npm install --no-save --no-package-lock --no-fund --no-audit \
      "workerd@$(node -p "require('./package-lock.json').packages['node_modules/workerd'].version")" \
 && rm package-lock.json

COPY worker.js page.js ./
COPY public ./public
COPY selfhost/config.capnp ./selfhost/config.capnp

# Banco do Durable Object (SQLite). Monte um volume aqui e faça backup dele.
RUN mkdir /data && chown node:node /data
VOLUME /data

USER node
EXPOSE 8080
CMD ["node", "node_modules/workerd/bin/workerd", "serve", "selfhost/config.capnp"]
