# Contributing

Thanks for contributing. This project enforces conformance automatically, so
most rules are checked for you — keep the pipeline green and follow the commit
convention.

## Development setup

```bash
npm install        # Node 22+; sets up the workspaces (lint plugin + demo)
npm run validate   # lint, round-trip, XSD, conventions, converter tests, convert and structure checks
npm run demo       # optional: interactive modeler playground at http://localhost:5173/modeler/
```

`npm run validate` chains the **positive** lint, round-trip, XSD core, the
generated extension XSD (drift guard and validation), conventions, the converter
tests, `convert:check` and `compare:structure`. The negative lint and the engine
run (`synthea:smoke`) run on their own. Individual checks:

| Command | Purpose |
|---------|---------|
| `npm run lint:valid` | `examples/valid/` and the real pathways in `lung-cancer/` must pass lint |
| `npm run lint:invalid` | `examples/invalid/` must fail lint (negative test) |
| `npm run roundtrip` | extension data of the examples and of `lung-cancer/` round-trips through `bpmn-moddle` |
| `npm run xsd` | BPMN core of the examples and of `lung-cancer/` validates against `BPMN20.xsd` |
| `npm run validate:diagram` / `validate:convert` | the two stages of `validate`: is the diagram a valid input (lint, round trip, XSD), then does the conversion work (converter tests, strict conversion, comparison) |
| `npm run xsd:gen` / `xsd:ext` | (optional) generate the extension XSD; validate the examples and `lung-cancer/` against BPMN core + that XSD |
| `npm run conventions` | `package.json` follows bpmn.io naming rules |
| `npm run test:bpmn2gmf` | tests of the converter in `tools/bpmn2gmf/` |
| `npm run convert:check` | the real pathways in `lung-cancer/` convert strictly (`--strict`) |
| `npm run compare:structure` | converted modules vs. the upstream modules, state by state |
| `npm run synthea:smoke` | (optional, needs Java) run the converted modules in a Synthea jar; not part of `validate` |
| `npm run demo` | (optional) interactive modeler playground — not a pass/fail gate |

For every lint rule you add, add a positive fixture in `examples/valid/` **and**
a deliberately broken one in `examples/invalid/`.

## Pull requests

- Branch from `dev`; keep PRs focused.
- `npm run validate` must pass locally before opening the PR.
- CI (`.github/workflows/validate.yml`) re-runs every check on the PR.
- Record non-obvious architectural decisions as an ADR under `docs/adr/`.

## Commit messages — Conventional Commits

Releases and version bumps are automated by
[Release Please](https://github.com/googleapis/release-please), which reads
[Conventional Commits](https://www.conventionalcommits.org/). Your commit
**type** determines the next [SemVer](https://semver.org/) version.

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

| Commit | Example | Release effect |
|--------|---------|----------------|
| `fix:` | `fix: serialise empty notes` | PATCH (`0.1.0` → `0.1.1`) |
| `feat:` | `feat: add severity attribute` | MINOR from 1.0; PATCH while pre-1.0 (`0.1.0` → `0.1.1`) |
| `feat!:` or `BREAKING CHANGE:` footer | `feat!: rename prefix` | MAJOR after 1.0; MINOR while pre-1.0 |
| `docs:` `chore:` `refactor:` `test:` `ci:` `build:` `style:` | `docs: clarify scope boundary` | no release |

While the package is below `1.0.0`, breaking changes bump the **minor** and
features bump the **patch** (configured via `bump-minor-pre-major` and
`bump-patch-for-minor-pre-major` in `release-please-config.json`). Remove those
flags once you cut `1.0.0`.

Force a specific version when needed with a `Release-As:` footer:

```
chore: release 1.0.0

Release-As: 1.0.0
```

## How a release happens

1. You merge Conventional Commits into `dev`.
2. Release Please opens (and keeps updating) a **release PR** that bumps the
   version in `package.json` and `.release-please-manifest.json` and writes the
   `CHANGELOG.md`.
3. When you merge that release PR, Release Please tags the commit and creates a
   GitHub Release.
The release workflow does **not publish to npm**: it has no publish step and no npm
token. A release is a tag and a GitHub Release with the generated `CHANGELOG.md`.
(`package.json` is not `private`, so a manual `npm publish` would go through; do not
run one without an explicit decision, see `AGENTS.md`.)

Never hand-edit the version in `package.json` or the manifest — let Release
Please own it.

### Release setup and known limits

- **Branch:** Release Please runs on a push to `dev` (`.github/workflows/release-please.yml`)
  and opens the release PR against `dev`. `main` carries no release workflow.
- **Tags:** `v<version>` (`include-component-in-tag: false`). `0.1.0` was never tagged, so the
  first release (`0.2.0`) lists every commit since the start and its compare link has no base.
- **Checks on the release PR:** the PR is opened by `github-actions[bot]` with `GITHUB_TOKEN`, so
  GitHub holds its `validate` run as *action required*. Approve the run in the PR before merging,
  or let an admin add a token secret (a fine-grained PAT or a GitHub App token with contents and
  pull-request write access) and pass it as `token:` to the action; runs then start by themselves.
- **Versions kept in sync:** `package.json`, `package-lock.json`, the manifest and the
  `extra-files` in `release-please-config.json` (lint plugin, descriptor, XSD). Generated files
  must not repeat the version, or their drift check fails on the release PR.

