# AGENTS.md

Canonical context for AI coding agents working in this repository. Tool-specific
files (e.g. `CLAUDE.md`) import this file; point other agents (Cursor, Codex, …)
at it too.

## Project
A custom BPMN 2.0 / bpmn.io extension (`synthea:`) with a converter from BPMN to
Synthea modules (`extension/src/converter`) and automated conformance checks. Node 22, ES modules.

- `extension/` — the extension: `model/` (moddle descriptor, values, generated XSD), `lint/` (bpmnlint plugin), `src/` (bpmn-js modules; `src/converter/` is the BPMN → Synthea converter with its CLI `bpmn2gmf`), `test/` (converter and extension tests, golden files).
- `examples/` — `valid/` and `invalid/`: abstract diagrams used as positive and negative validation fixtures; `lung-cancer/`: the real pathways (main pathway and four submodules) that the converter is checked against (golden files); `drafts/`: the first draft diagrams (v0.1), kept to show where the models started, not checked; `consumer/`: a minimal app that installs the packed package (`npm run test:consumer`, CI).
- `tools/` — deterministic checkers, generators and build scripts; their exit code is the source of truth for pass/fail.
- `skills/` — agent skills that orchestrate the checkers (see "Agent skills" below); `.claude/skills` and `.agents/skills` are symlinks to it.
- `docs-site/` — Astro + Starlight site (Pages root: overview and the guides from `docs/`, copied by `scripts/sync-docs.mjs`; not an npm workspace). `npm run site` builds the whole Pages site (docs, `demo/` at `/modeler/`, converter result at `/modules/`) into `site/`.
- `demo/` — private (non-published) bpmn-js modeler playground for trying the extension by hand; an npm workspace. NOT a pass/fail gate.
- `.devcontainer/` + `.github/workflows/pages.yml` — reproducible dev/Codespaces env and the GitHub Pages deploy of the whole site (built by `tools/build-site.mjs`).

## Agent skills
`skills/<name>/SKILL.md` is the single source; Claude Code finds the skills through `.claude/skills`,
Codex and Copilot through `.agents/skills` (both symlinks to `skills/`). See `skills/README.md`.

- `bpmn-conformance`: when checking or changing a `.bpmn` file or the extension. Gate: `npm run validate`, `npm run lint:invalid`.
- `moddle-extension-review`: when changing `extension/model/synthea.json`. Gate: `npm run roundtrip`.

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
- Never publish the package anywhere (it is `private`) without an explicit request.

## Commits & releases
Use [Conventional Commits](https://www.conventionalcommits.org/): `fix:` → patch,
`feat:` → minor, `feat!:`/`BREAKING CHANGE:` → major (one level lower while below 1.0.0, see `CONTRIBUTING.md`). Release Please turns these
into a release PR; merging it tags a release. Nothing is published to npm. See `CONTRIBUTING.md`.

## Commands
- Full check: `npm run validate` (two stages: `npm run validate:diagram`, then `npm run validate:convert`; `conventions` and `jsdoc:check` run between them)
- Lint, valid (must pass; covers `examples/valid/` and `examples/lung-cancer/`): `npm run lint:valid`
- Lint, invalid (must fail): `npm run lint:invalid`
- Round-trip: `npm run roundtrip`
- XSD core: `npm run xsd`
- Extension XSD (structure only; drift guard and validation run in `validate`): generate `npm run xsd:gen`, drift-guard `npm run xsd:gen:check`, validate `npm run xsd:ext`
- Generated type reference: `npm run api:gen` (drift guard `npm run api:gen:check`, in `validate`); JSDoc: `npm run jsdoc:check` (in `validate`)
- What each step of `validate` covers: `docs/validator-overview.md`
- Conventions: `npm run conventions`
- BPMN → Synthea converter (`docs/bpmn2gmf-concept.md`): tests `npm test`; convert the real pathways (must pass, strict) `npm run convert:check`; write the modules `npm run bpmn2gmf -- examples/lung-cancer --out-dir out/modules` (`--fuse-gateways` for fewer Simple states, `--strict` to refuse incomplete modules); the golden files `extension/test/golden/` pin the converted modules (rewrite with `UPDATE_GOLDEN=1 npm test`); run them in a real Synthea (needs Java + the release jar, not part of `validate`) `npm run synthea:smoke -- <synthea-with-dependencies.jar>`
