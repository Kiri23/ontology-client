# Documentation

Reference for ontology-client, one file per topic.

- [library.md](library.md) — the JSR library: `validarProyecto`, `jobs`, `sparql`, the typed client (`crearCliente`),
  and how the types are generated from the server's contract.
- [engines.md](engines.md) — where `jobs.get()` reads from: HTTP or the Neo4j view, and `deno task neo4j:hola`.
- [cli.md](cli.md) — the CLI that validates project files: flags, variables, exit codes.
- [action.md](action.md) — the GitHub Action that runs the CLI on pull requests.
- [development.md](development.md) — tests, pre-commit, fake servers, the lockfile, and publishing to JSR.

Also in the repo:

- [`explorador/README.md`](../explorador/README.md) — the API explorer at <https://ontology.kiri231.com/explorador/>: a
  Storybook of the SDK where each function in `mod.ts` is a story you run against the server. It lives in `explorador/`
  (Vite + React) and is not part of the JSR package. `tests/explorador.test.ts` fails if an exported function has no
  story. Its Graph view downloads the whole graph with `sparql.consultar` and queries it in the browser.
- [`neo4j/README.md`](../neo4j/README.md) — the Neo4j view of the graph: how it is built, loaded and mapped.
- [`vocabulary/`](vocabulary/README.md) — the terms this project uses, one page each.

To try the SDK in one command, with no secrets: `deno task hola`.

License: MIT ([`LICENSE`](../LICENSE)).
