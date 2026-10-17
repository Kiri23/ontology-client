# GitHub Action

The action runs the [CLI](cli.md) in CI: it checks every project file ([Turtle](vocabulary/turtle.md)) against the
server's [SHACL shapes](vocabulary/shacl-shape.md) and flags the files that break them.

In the repo that has the project files:

```yaml
# .github/workflows/fichas.yml
name: Fichas
on:
  pull_request:
    paths: ["**/proyecto.ttl"]
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  validar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: Kiri23/ontology-client@v0
        with:
          token: ${{ secrets.ONTOLOGY_PROYECTOS_TOKEN }}
          # archivos: proyectos/*/proyecto.ttl   # optional; default: every proyecto.ttl that git knows
          # url: https://ontology.kiri231.com    # optional
          # timeout: 30                          # optional, seconds per file
```

| Input      | Default                         | What it is                                                     |
| ---------- | ------------------------------- | -------------------------------------------------------------- |
| `token`    | (required)                      | the server's token; without it the step fails                  |
| `archivos` | the repo's `proyecto.ttl` files | paths or globs (`**` included) separated by spaces or newlines |
| `url`      | `https://ontology.kiri231.com`  | the server's base URL                                          |
| `timeout`  | `30`                            | seconds per file before giving the server up as down           |

Without `archivos`, it validates the files named exactly `proyecto.ttl` (not `otroproyecto.ttl`) that git knows:
`git ls-files -z -- ':(glob)proyecto.ttl' ':(glob)**/proyecto.ttl'`, non-ASCII paths included. If the repo has none, it
exits 0 with a warning.

Before you adopt it:

- **It goes after `actions/checkout`.** Without a checkout there is no repo, `git ls-files` fails and the action fails
  with exit 2 and an error that says so. It never goes green without validating anything.
- **The token.** `ONTOLOGY_PROYECTOS_TOKEN` is the token the server has configured; the server's owner gives it to you.
  Load it as a secret of the consuming repo: `gh secret set ONTOLOGY_PROYECTOS_TOKEN -R <owner>/<repo>` (it reads the
  value from stdin, so it stays out of the shell history).
- **PRs from forks.** GitHub does not pass them secrets: without a token the step fails with exit 2. Either the check is
  not required for forks, or the workflow uses `pull_request_target`. In that case the file comes from an outsider and
  the workflow has the secret: do not check out the PR's code to run it, only the project files. The action's output
  already neutralizes any workflow commands a file brings.
- **Deno on the PATH.** The action installs Deno 2.9.5 with `denoland/setup-deno` and it ends up first on the job's
  `PATH`: the steps that follow run with that Deno. If the job uses another version, put your own `setup-deno` after
  this action.

The inputs reach the script through environment variables, never interpolated: no shell can be injected. The action
installs Deno 2.9.5 with `denoland/setup-deno` pinned by SHA and runs the `cli.ts` of the action's own version, with its
own `deno.json` and lockfile (`--frozen`), so the consuming repo's `deno.json` does not interfere.

`v0` is a moving tag that points to the latest `v0.x.y`; to pin, use `@v0.1.1` or a SHA.
