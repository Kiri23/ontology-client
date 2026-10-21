# GitHub Action

The action runs the [CLI](cli.md) in CI: it checks every project file ([Turtle](vocabulary/turtle.md)), and the
vocabularies you name, against the server's [SHACL shapes](vocabulary/shacl-shape.md) and flags the files that break
them.

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
          # archivos: proyectos/*/proyecto.ttl     # optional
          # vocabularios: domain/*/vocabulary.ttl  # optional
          # With neither: every proyecto.ttl and vocabulary.ttl that git knows
          # url: https://ontology.kiri231.com    # optional
          # timeout: 30                          # optional, seconds per file
```

| Input          | Default                        | What it is                                                                              |
| -------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| `token`        | (required)                     | the server's token; without it the step fails                                           |
| `archivos`     | see below                      | `proyecto.ttl` files: paths or globs (`**` included) separated by spaces or newlines    |
| `vocabularios` | see below                      | `vocabulary.ttl` files to check against `POST /vocabularios`, same syntax as `archivos` |
| `url`          | `https://ontology.kiri231.com` | the server's base URL                                                                   |
| `timeout`      | `30`                           | seconds per file before giving the server up as down                                    |

With `archivos` or `vocabularios`, it validates exactly what they say and looks for nothing else. With neither, it
validates the files named exactly `proyecto.ttl` and `vocabulary.ttl` (not `otroproyecto.ttl`, not `mi-vocabulary.ttl`)
that git knows, non-ASCII paths included; the file name picks the endpoint. If the repo has none, it exits 0 with a
notice.

```sh
git ls-files -z -- ':(glob)proyecto.ttl' ':(glob)**/proyecto.ttl' ':(glob)vocabulary.ttl' ':(glob)**/vocabulary.ttl'
```

A `vocabulary.ttl` that is not a SKOS vocabulary (this repo's `docs/vocabulary.ttl` is a documentation glossary) gets
reported by the server as not conforming, like a broken `proyecto.ttl` would; name the real ones in `vocabularios` to
leave it out. Both endpoints take the same token; a vocabulary that does not conform is annotated in the PR like a
project file.

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

`v0` is a moving tag that points to the latest `v0.x.y`; to pin, use `@v0.1.2` or a SHA.
