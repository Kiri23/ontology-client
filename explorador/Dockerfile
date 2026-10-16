# https://ontology.kiri231.com/explorador/: el explorador del SDK, estático, detrás de kiri-edge.
# El contexto es la raíz del repo, porque el explorador importa el SDK de ahí (../mod.ts):
#
#   docker build -f explorador/Dockerfile .
#
# Dos etapas. `construir` (node) instala, chequea tipos y buildea; .github/workflows/deploy.yml corre los tests
# adentro (`docker run <imagen de esta etapa> npm test`). La final es Caddy sirviendo dist/ sin privilegios.
# La prueba explorador/scripts/humo-imagen antes de publicarla.
FROM node:24-alpine AS construir

# Las dependencias primero: cambian poco, la capa se reusa entre builds.
WORKDIR /repo/explorador
COPY explorador/package.json explorador/package-lock.json ./
RUN npm ci --no-audit --no-fund

# El SDK que importa el explorador, y los datos de prueba que usan sus tests (tests/datos/jobs.json).
WORKDIR /repo
COPY mod.ts cliente.ts jobs.ts sparql.ts ./
COPY generado ./generado
COPY contrato ./contrato
COPY tests/datos ./tests/datos
COPY explorador ./explorador

WORKDIR /repo/explorador
RUN npm run build

# Caddy y no nginx o static-web-server: es lo mismo que el borde (kiri-edge), el Caddyfile se lee en diez líneas y
# hace el redirect, los headers de cache y la CSP sin módulos aparte.
FROM caddy:2.11-alpine

COPY explorador/Caddyfile /etc/caddy/Caddyfile
COPY --from=construir /repo/explorador/dist /srv/explorador

# Usuario sin privilegios en un puerto alto. /data y /config son de Caddy (instance.uuid y similares): pasan a ser
# suyos para que no falle al arrancar.
RUN addgroup -S -g 10001 explorador \
    && adduser -S -D -H -u 10001 -G explorador explorador \
    && chown -R explorador:explorador /data /config
USER explorador

EXPOSE 8080

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
