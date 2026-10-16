Trampas que no se ven mirando el código. El resto está en README.md y explorador/README.md.

- **deno siempre con `--config deno.json`** (en Termux, `env -u LD_PRELOAD deno …`): `explorador/package.json` corta la
  búsqueda de config, y `deno fmt` sobre `explorador/` formatea a 80 columnas en vez de 120.
- **npm con `npm run …`**: en Termux los `.bin` de `node_modules` no corren por nombre (`#!/usr/bin/env` no existe). Los
  scripts de `explorador/package.json` llaman a `node node_modules/<paquete>/<bin>`; uno nuevo va igual.
- **Un archivo nuevo del SDK va en el `COPY` de `explorador/Dockerfile`** si el explorador lo importa, directo o por
  `mod.ts`. Termux no construye la imagen; `tests/dockerfile.test.ts` falla nombrando el que falta.
- **Worktrees en `~/wt`**: el clon vive en `/storage`, sin symlinks ni bit de ejecución, y `npm ci` no anda ahí.
  `explorador/node_modules` se puede copiar de otro worktree si el `package-lock.json` es idéntico.
- **Preview de cada PR**: `https://pr-ontology-client-<n>.exe.xyz/` (login de exe.dev). Le habla a producción: los GET y
  `POST /ai/sparql` van a `ontology.kiri231.com`; lo que escribe no pasa.
- **Pre-commit**: `deno task hooks`, una vez por clon. Corre fmt, lint, tipos, tests y `generar --check` de `ci.yml` y,
  si el commit toca `explorador/`, `npm run check` y `npm test`.
