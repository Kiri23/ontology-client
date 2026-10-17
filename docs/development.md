# Development

```sh
deno task test        # tests: fake fetch, annotations, workflow commands, timeout, process exit codes
ONTOLOGY_PRODUCCION=1 deno task test   # also jobs.get() against production (read-only)
ONTOLOGY_ACCIONES_URL=http://127.0.0.1:8800 ONTOLOGY_ACCIONES_TOKEN=prueba-local deno task test   # actions, local server
NEO4J_URL=bolt://localhost:7687 doppler run -p ontology -c dev -- deno task test   # also Neo4j == production parity
doppler run -p ontology -c dev -- deno task neo4j:cargar   # rebuilds the Neo4j view from /sparql
deno fmt --check && deno lint && deno task generar --check && deno task vocabulario --check
deno run --allow-net --allow-read tests/servidor-falso.ts --puerto 8787 --token prueba
deno task hola        # hello world against production (read-only, no secrets): ejemplos/hola.ts
```

In Termux, run every `deno` command as `env -u LD_PRELOAD deno … --config deno.json` (see `AGENTS.md`).

## Pre-commit

`deno task hooks` turns it on once per clone, and it covers that clone's worktrees. Before each commit,
`.githooks/pre-commit` runs fmt, lint, `deno check`, `deno task test`, `deno task generar --check` and
`deno task vocabulario --check` from `ci.yml` (not `deno install --frozen`, `publish --dry-run` or the action's jobs).
If the commit touches `explorador/`, it also runs `npm run check` and `npm test` there; without
`explorador/node_modules` (the clone in `/storage`) it skips them with a warning and leaves them to CI. For each step it
prints the summary, and the whole output if the step fails. The task leaves a shim in
`~/.local/share/git-hooks/ontology-client/` that runs the hook with `sh`: in `/storage` (Termux) git ignores a hook
without the executable bit. On a branch that does not have the hook yet, the shim does nothing. `git commit --no-verify`
skips it; only use it if you know why.

## Testing the actions end to end

The actions write, so their end-to-end test runs **only** against a local ontologyLearning
(`ONTOLOGY_ACCIONES_TOKEN=prueba-local python3 main.py web --puerto 8800` with `datos/jobs.trig` =
`tests/fixtures/jobs.trig`): without `ONTOLOGY_ACCIONES_URL` it is skipped (CI does not run it), and if the url is not
`localhost`/`127.0.0.1` it fails before sending anything. Each run dismisses a job post that had no decisions; when none
are left, delete `datos/decisiones.trig` on the server.

## Fake servers

`tests/servidor-falso.ts` imitates the contract without the engine: a project file does not conform if it has the line
`# servidor-falso: no conforma`. CI starts it to test the action with `uses: ./`, and in another job tests it with no
git repo, with a repo that has no project files, and with names that look like `proyecto.ttl`. `tests/servidor-mudo.ts`
accepts connections and never answers: it tests the timeout.

## The lockfile

`deno.json` has `lock.frozen`: nothing changes `deno.lock` by accident. To add or upgrade a dependency, run
`deno install --frozen=false` and commit the lock.

## Publishing

`.github/workflows/publish.yml` publishes to JSR over OIDC (no token) when a `v*` tag is pushed, or when a push to
`main` touches `deno.json`. For a new version: bump `version` in `deno.json`, merge,
`git tag vX.Y.Z && git push --tags`, and move `v0` to the same commit:
`git tag -f v0 'vX.Y.Z^{}' && git push -f origin v0`.

OIDC requires the package to exist on jsr.io and to be linked to this repo:

1. Create the package: <https://jsr.io/new?scope=kiri23&package=ontology-client>.
2. In <https://jsr.io/@kiri23/ontology-client/settings>, **GitHub repository** → `Kiri23/ontology-client` → Link.
3. Run the publish: `gh workflow run publish.yml -R Kiri23/ontology-client`.
