# CLI

The CLI validates project files (`proyecto.ttl`, written in [Turtle](vocabulary/turtle.md)) against the server's
[SHACL shapes](vocabulary/shacl-shape.md). It is the same code the [GitHub Action](action.md) runs.

```sh
export ONTOLOGY_PROYECTOS_TOKEN=...
deno run --allow-net --allow-read --allow-env jsr:@kiri23/ontology-client@0.1.2/cli proyectos/*/proyecto.ttl
deno run --allow-net --allow-read --allow-env cli.ts --url http://localhost:8899 proyecto.ttl   # from the repo
```

- URL: `--url`, or `ONTOLOGY_URL`, or `https://ontology.kiri231.com` (an empty value counts as not given). If it is
  `http://` to a host that is not local, it warns: the token travels in clear text.
- Token: only `ONTOLOGY_PROYECTOS_TOKEN` (as a flag it would end up in the shell history and the process list).
- Timeout per file: `--timeout` or `ONTOLOGY_TIMEOUT`, in seconds (default 30).
- Exit: **0** all files conform · **1** some file does not conform · **2** usage, read, network, timeout or token error.
  **2 wins over 1**: if one file does not conform and another could not be validated, it exits 2, because the result
  does not cover every file.
- A 401, a 503, any other 5xx, the network down or the timeout stop at the first file: the rest would fail the same way.
  A 400, 413 or 415 belong to that file: it goes on with the others.
- With `GITHUB_ACTIONS=true` it emits `::error file=<archivo>,title=...::<mensaje>` for each file that does not conform
  or could not be validated. The rest of the output (the report copies literals from the file) is neutralized: a line
  that would start with `::` gets a zero-width space in front, so a file cannot sneak a workflow command
  (`::add-mask::`, `::stop-commands::`, fake annotations) into the log.
