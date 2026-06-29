# Contributing

Thanks for contributing. This project enforces conformance automatically, so
most rules are checked for you — keep the pipeline green and follow the commit
convention.

## Development setup

```bash
npm install        # Node 22+; sets up the workspaces (lint plugin + demo)
npm run validate   # positive lint, round-trip, XSD core, conventions
npm run demo       # optional: interactive modeler playground at http://localhost:5173
```

`npm run validate` chains the **positive** lint, round-trip, XSD core, and
conventions. The negative lint and the optional extension-XSD check run on their
own (and in CI). Individual checks:

| Command | Purpose |
|---------|---------|
| `npm run lint:valid` | `examples/valid/` must pass lint |
| `npm run lint:invalid` | `examples/invalid/` must fail lint (negative test) |
| `npm run roundtrip` | extension data round-trips through `bpmn-moddle` |
| `npm run xsd` | BPMN core validates against `BPMN20.xsd` |
| `npm run xsd:gen` / `xsd:ext` | (optional) generate the extension XSD; validate examples against BPMN core + that XSD |
| `npm run conventions` | `package.json` follows bpmn.io naming rules |
| `npm run demo` | (optional) interactive modeler playground — not a pass/fail gate |

For every lint rule you add, add a positive fixture in `examples/valid/` **and**
a deliberately broken one in `examples/invalid/`.

## Pull requests

- Branch from `main`; keep PRs focused.
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
| `feat:` | `feat: add severity attribute` | MINOR (`0.1.0` → `0.2.0`) |
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

1. You merge Conventional Commits into `main`.
2. Release Please opens (and keeps updating) a **release PR** that bumps the
   version in `package.json` and `.release-please-manifest.json` and writes the
   `CHANGELOG.md`.
3. When you merge that release PR, Release Please tags the commit and creates a
   GitHub Release.
4. The same workflow then publishes to npm (gated on `release_created`).

> Publishing runs inside `release-please.yml`, not on a tag trigger: a tag
> pushed by `GITHUB_TOKEN` does not start a second workflow, so a tag-triggered
> publish would never fire. Add an `NPM_TOKEN` repository secret to enable the
> publish step.

Never hand-edit the version in `package.json` or the manifest — let Release
Please own it.
