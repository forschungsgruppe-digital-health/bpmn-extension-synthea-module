# What the validator does

A one-page overview of `npm run validate`. The exit code is the decision; do not judge conformance by reading a diagram.

`npm run validate` runs these checks in order:

| # | Check | Command and files | What it covers |
|---|---|---|---|
| 1 | Lint | `lint:valid`: `extension/lint/bpmnlint-plugin-synthea/` (`index.js`, `lib/utils.js`, `rules/*.js`), configured by `.bpmnlintrc`, reads the descriptor `extension/model/synthea.json` | the 23 semantic rules for the `synthea:` data in `examples/valid/` and `lung-cancer/`; every rule is in [lint-rules.md](lint-rules.md) |
| 2 | Round trip | `roundtrip`: `tools/moddle-roundtrip.mjs` | every example goes through `bpmn-moddle` and back; nothing may be lost and no warning may appear. This is the check that really covers `<extensionElements>` |
| 3 | XSD, core | `xsd`: `tools/validate-xsd.sh` | BPMN structure against the official BPMN 2.0 schema. Extension elements are not covered |
| 4 | XSD, extension | `xsd:gen:check`: `tools/moddle-to-xsd.mjs --check` (generates `extension/model/synthea.xsd`); `xsd:ext`: `tools/validate-xsd-ext.mjs` | a schema generated from the moddle descriptor (the single source); `--check` fails if the stored schema has drifted. Structure only, the lint covers meaning |
| 5 | Conventions | `conventions`: `tools/check-package-conventions.mjs` | package names (`bpmn-js-*`, `bpmnlint-plugin-*`), `bpmn-js` only as a peer dependency |
| 6 | Converter tests | `test:bpmn2gmf`: `tools/bpmn2gmf/test/*.test.mjs` (with `helpers.mjs`), which run the converter in `tools/bpmn2gmf/` | unit and golden tests (below) |
| 7 | Converter check | `convert:check`: `tools/bpmn2gmf/cli.mjs lung-cancer --check --strict` | `lung-cancer/` converts strictly, nothing is written |
| 8 | Structure comparison | `compare:structure`: `tools/bpmn2gmf/compare-structure.mjs` with `structure.mjs`, against `tools/bpmn2gmf/test/upstream/` | the converted modules against Synthea master (see [converter-overview.md](converter-overview.md)) |

"XSD passed" never means "extension valid": the XSD does not cover `<extensionElements>`. Checks 2 and 4 plus the lint do.

`lint:invalid` is the opposite check: the files in `examples/invalid/` must keep failing. It is not part of `validate`.

## Converter tests

| File | Covers |
|---|---|
| `convert.test.mjs` | converter behavior and its error cases |
| `matrix.test.mjs` | keeps [extension-matrix.md](extension-matrix.md) and the behavior of panel and converter together |
| `coverage.test.mjs` | which Synthea v4.0.0 state and transition classes the converter covers |
| `complete.test.mjs` | for every offered state type a fully filled example converts strictly and every state has all required fields |
| `compare.test.mjs`, `structure.test.mjs` | negative tests: the comparisons must report real differences |

## Not part of `validate`

- `npm run synthea:smoke` (`tools/synthea-smoke.mjs`) starts the real Synthea engine (needs Java and `synthea-with-dependencies.jar`) and fails if Synthea cannot load a module or find a submodule.
- `npm run check:attributes` (`tools/check-attribute-usage.mjs`) lists which attribute names occur in which files. Synthea attributes have no namespace: the same name in two modules is the same attribute.
