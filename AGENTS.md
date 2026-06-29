# AGENTS.md

Canonical context for AI coding agents working in this repository. Tool-specific
files (e.g. `CLAUDE.md`) import this file; point other agents (Cursor, Codex, …)
at it too.

## Project
A template for a custom BPMN 2.0 / bpmn.io extension with automated conformance
checks. Node 22, ES modules.

- `extension/` — the custom extension you author (moddle model descriptor, lint plugin, optional bpmn-js modules).
- `examples/valid/` and `examples/invalid/` — abstract diagrams used as positive and negative validation fixtures.
- `tools/` — deterministic checkers; their exit code is the source of truth for pass/fail.
- `skills/` — agent skills that orchestrate the checkers.
- `demo/` — private (non-published) bpmn-js modeler playground for trying the extension by hand; an npm workspace. NOT a pass/fail gate.
- `.devcontainer/` + `.github/workflows/pages.yml` — reproducible dev/Codespaces env and the GitHub Pages deploy for `demo/`.

## Always do
- Run `npm run validate` before proposing a commit or PR.
- Keep custom data in its own namespace; never reuse the `bpmn:` prefix for extension data.
- Treat `tools/` output as the decision. Do not declare conformance from your own reading of a diagram.

## Ask first
- Adding a runtime dependency (extensions should rely on `peerDependencies`).
- Changing the extension's `uri` or `prefix` (this breaks diagrams already in the wild).
- Editing files under `examples/invalid/` (they must keep failing lint).

## Never do
- Never report "XSD passed" as "extension valid" — the XSD does not cover `<extensionElements>`.
- Never hand-edit the version in `package.json` or `.release-please-manifest.json`; Release Please owns it.
- Never publish manually or outside the release workflow without an explicit request.

## Commits & releases
Use [Conventional Commits](https://www.conventionalcommits.org/): `fix:` → patch,
`feat:` → minor, `feat!:`/`BREAKING CHANGE:` → major. Release Please turns these
into a release PR and publishes on merge. See `CONTRIBUTING.md`.

## Commands
- Full check: `npm run validate`
- Lint, valid (must pass): `npm run lint:valid`
- Lint, invalid (must fail): `npm run lint:invalid`
- Round-trip: `npm run roundtrip`
- XSD core: `npm run xsd`
- Extension XSD (optional, structure-only): generate `npm run xsd:gen`, drift-guard `npm run xsd:gen:check`, validate `npm run xsd:ext`
- Conventions: `npm run conventions`
