# What the validator does

A one-page overview of `npm run validate`. The exit code is the decision; do not judge conformance by reading a diagram.

`npm run validate` runs these checks in order:

| # | Check | Command and files | What it covers |
|---|---|---|---|
| 1 | Lint | `lint:valid`: `extension/lint/bpmnlint-plugin-synthea/` (`index.js`, `lib/utils.js`, `rules/*.js`), configured by `.bpmnlintrc`, reads the descriptor `extension/model/synthea.json` | the 25 semantic rules for the `synthea:` data in `examples/valid/` and `lung-cancer/`; every rule is in [lint-rules.md](lint-rules.md) |
| 2 | Round trip | `roundtrip`: `tools/moddle-roundtrip.mjs` | every example goes through `bpmn-moddle` and back; nothing may be lost and no warning may appear. This is the check that really covers `<extensionElements>` |
| 3 | XSD, core | `xsd`: `tools/validate-xsd.sh` | BPMN structure against the official BPMN 2.0 schema. Extension elements are not covered |
| 4 | XSD, extension | `xsd:gen:check`: `tools/moddle-to-xsd.mjs --check` (generates `extension/model/synthea.xsd`); `xsd:ext`: `tools/validate-xsd-ext.mjs` | a schema generated from the moddle descriptor (the single source); `--check` fails if the stored schema has drifted. Structure only, the lint covers meaning |
| 5 | Conventions | `conventions`: `tools/check-package-conventions.mjs` | package names (`bpmn-js-*`, `bpmnlint-plugin-*`), `bpmn-js` only as a peer dependency |
| 5b | Module schema | `schema:gen:check`: `tools/bpmn2gmf/gen-schema.mjs --check` (writes `tools/bpmn2gmf/module.schema.json` from `required-fields.mjs`) | a JSON Schema for the Synthea module JSON the converter writes; `--check` fails if the stored schema has drifted. Per-state structure only (see below) |
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
| `schema.test.mjs` | the schema is not stale, accepts the converted `lung-cancer/` modules and the upstream modules, rejects eleven broken modules, and agrees with `missingFields()` for every state type |
| `verify-flow.test.mjs` | the order checks of `verify-flow.mjs` on plain module JSON: one module that passes and one that is reported per rule |
| `compare.test.mjs`, `structure.test.mjs` | negative tests: the comparisons must report real differences |
| `lint-model-rules.test.mjs` | the lint rules `unique-element-names` and `exclusive-gateway-requires-default-flow`, run through the real bpmnlint CLI |
| `explanations.test.mjs` | every note and warning the converter can emit has an explanation (`explanations.mjs`) |
| `browser-parity.test.mjs` | the converter bundled for the browser gives the same modules and messages as Node and the command line |

## Not part of `validate`

- `npm run synthea:smoke` (`tools/synthea-smoke.mjs`) starts the real Synthea engine (needs Java and `synthea-with-dependencies.jar`) and fails if Synthea cannot load a module or find a submodule.
- `npm run check:pages` (`tools/check-pages-build.mjs`) builds the demo and the converter result with the Pages base path and checks the site before a deploy: asset paths under `/<repo>/`, all linked files present, no conversion errors, and `build.json` with the commit. The Pages workflow runs the same check before it deploys.
- `npm run check:attributes` (`tools/check-attribute-usage.mjs`) lists which attribute names occur in which files. Synthea attributes have no namespace: the same name in two modules is the same attribute.

## Order checks (Level 1) and how often they fire on Synthea's own modules

`tools/bpmn2gmf/verify-flow.mjs` runs inside the converter (check 6 and 7). The rules come from the States wiki and from Kramer et al. 2025. To see how many false alarms they give, they were run once over the 536 modules shipped in `synthea-with-dependencies.jar` (v4.0.0; 97 of them are not called by another module). This is a one-off measurement, not part of `validate`.

| Code | Level | Shipped modules hit | What the hits are |
|---|---|---|---|
| `INITIAL_WITHOUT_WAIT` | warning | 14 of 97 top-level | mostly diseases that start at birth on purpose (cystic fibrosis, renal dysplasia) and the generated `dental_idr` modules |
| `END_BEFORE_START` | warning | 8 of 536 | an end state that no path from its start reaches (a modelling quirk, the engine ignores it) |
| `ENCOUNTER_REQUIRED` | warning | 3 of 536 | an Observation, Procedure or MedicationOrder on a path without an open encounter. The wiki says the engine raises an error; these modules do it anyway, so the engine may be more lenient than the wiki |
| `ENCOUNTER_NOT_ENDED` | note | 10 of 536 | an encounter still open at `Terminal` (wiki: only recommended) |
| `GUARD_ATTRIBUTE_NEVER_SET` | note | 2 of 536 | attributes Synthea sets itself (`insurance_status`, `days_until_death`) |
| `END_START_MISSING` | warning | 1 of 536 | an end state that names a start state which does not exist |

`lung-cancer/` produces none of these. Level 2 (clinical content against the source) and Level 3 (population) are not automated: Level 3 needs a reference value, see `synthea:smoke` for a run with the real engine.

## The module JSON Schema

`tools/bpmn2gmf/module.schema.json` is generated, never edited by hand (`npm run schema:gen` rewrites it). It is a second statement of the rules in `required-fields.mjs`, not an independent check; it exists so people who write or edit Synthea JSON without our converter can validate it (editors read a JSON Schema for completion and errors).

| In the schema | Left to `verify.mjs` and `verify-flow.mjs` |
|---|---|
| module shape (`name`, `states`, a state named `Initial`) | transition targets exist, reachability from `Initial`, sub-modules exist |
| the state `type` is one the engine knows | probabilities sum to 1 |
| the required fields of each type; a list (`codes`) is not empty | the order of states (encounter scope, start before end) |
| exactly one transition per state, none on `Terminal` | attributes, code systems per state type |

It was tried on the 536 modules shipped with Synthea 4.0.0: 535 are valid. The one that is not (`urinary_tract_infections`, state `Care Pathways`) is a `Simple` state without a transition, which is a defect in that module. The first run found 37 more, all caused by our own list being too strict, and `required-fields.mjs` was loosened for it: `distribution` (GMF v2) is a third choice next to `exact` and `range` on `Delay`, `Observation` and `Symptom`; `Observation` also allows `sampled_data` and `attachment`; an `Observation` with a `value_code` needs no `unit`. Nothing was made stricter. The schema does not demand that the `Initial` state has the type `Initial`, because `encounter/vitals` ships without it.
