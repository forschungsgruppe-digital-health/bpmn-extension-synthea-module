# What the validator does

`npm run validate` runs every automated check of this repository in one go. The exit code is the decision; do not judge conformance by reading a diagram. CI (`.github/workflows/validate.yml`) runs the same checks.

The checks follow the three levels of Kramer et al. 2025 ("Leveraging Generative AI to Enhance Synthea Module Development", arXiv:2507.21123): Level 1 is the structure and order of a module, Level 2 its clinical content against the source, Level 3 the simulated population. Everything described here is Level 1; the last section says what is not automated.

## The steps

`npm run validate` runs these in order. Steps 1 to 5 check the extension and the diagrams, steps 6 to 9 the Synthea modules the converter generates from them.

### Extension and diagrams

| # | Check | Command and files | What it covers |
|---|---|---|---|
| 1 | Lint | `lint:valid`: `extension/lint/bpmnlint-plugin-synthea/` (`index.js`, `lib/utils.js`, `rules/*.js`), configured by `.bpmnlintrc`, reads the descriptor `extension/model/synthea.json` | the 25 semantic rules for the `synthea:` data in `examples/valid/` and `lung-cancer/`; every rule is in [lint-rules.md](lint-rules.md) |
| 2 | Round trip | `roundtrip`: `tools/moddle-roundtrip.mjs` | every example goes through `bpmn-moddle` and back; nothing may be lost and no warning may appear. This is the check that really covers `<extensionElements>` |
| 3 | XSD, core | `xsd`: `tools/validate-xsd.sh` | BPMN structure against the official BPMN 2.0 schema. Extension elements are not covered |
| 4 | XSD, extension | `xsd:gen:check`: `tools/moddle-to-xsd.mjs --check` (generates `extension/model/synthea.xsd`); `xsd:ext`: `tools/validate-xsd-ext.mjs` | a schema generated from the moddle descriptor (the single source); `--check` fails if the stored schema has drifted. Structure only, the lint covers meaning |
| 5 | Conventions | `conventions`: `tools/check-package-conventions.mjs` | package names (`bpmn-js-*`, `bpmnlint-plugin-*`), `bpmn-js` only as a peer dependency |

"XSD passed" never means "extension valid": the XSD does not cover `<extensionElements>`. Checks 2 and 4 plus the lint do.

### Generated Synthea modules

| # | Check | Command and files | What it covers |
|---|---|---|---|
| 6 | Module schema | `schema:gen:check`: `tools/bpmn2gmf/gen-schema.mjs --check` (writes `tools/bpmn2gmf/module.schema.json` from `required-fields.mjs`) | the structure of every state; `--check` fails if the stored schema has drifted (see [Structure](#structure-of-a-module-the-json-schema)) |
| 7 | Converter tests | `test:bpmn2gmf`: `tools/bpmn2gmf/test/*.test.mjs` (with `helpers.mjs`), which run the converter in `tools/bpmn2gmf/` | unit and golden tests (see [Tests](#tests-of-the-converter)) |
| 8 | Converter check | `convert:check`: `tools/bpmn2gmf/cli.mjs lung-cancer --check --strict` | `lung-cancer/` converts strictly, nothing is written |
| 9 | Structure comparison | `compare:structure`: `tools/bpmn2gmf/compare-structure.mjs` with `structure.mjs`, against `tools/bpmn2gmf/test/upstream/` | the converted modules against Synthea master (see [converter-overview.md](converter-overview.md)) |

The converter checks its own output while it converts (`verify.mjs`, `verify-flow.mjs`, and `codes.mjs` for the code system of each state type). Steps 7 and 8 run those checks, and a module with an error is not written.

### Not part of `validate`

- `lint:invalid` is the opposite of step 1: the files in `examples/invalid/` must keep failing. CI runs it as a separate step.
- `npm run synthea:smoke` (`tools/synthea-smoke.mjs`) starts the real Synthea engine (needs Java and `synthea-with-dependencies.jar`) and fails if Synthea cannot load a module or find a submodule.
- `npm run check:attributes` (`tools/check-attribute-usage.mjs`) lists which attribute names occur in which files. Synthea attributes have no namespace: the same name in two modules is the same attribute.

## Structure of a module: the JSON Schema

`tools/bpmn2gmf/module.schema.json` is generated, never edited by hand (`npm run schema:gen` rewrites it). It is a second statement of the rules in `required-fields.mjs`, not an independent check; it exists so people who write or edit Synthea JSON without our converter can validate it (editors read a JSON Schema for completion and errors).

| In the schema | Left to the converter's checks (`verify.mjs`, `verify-flow.mjs`, `codes.mjs`) |
|---|---|
| module shape (`name`, `states`, a state named `Initial`) | transition targets exist, reachability from `Initial`, sub-modules exist |
| the state `type` is one the engine knows | probabilities sum to 1 |
| the required fields of each type; a list (`codes`) is not empty | the order of states (encounter scope, start before end) |
| exactly one transition per state, none on `Terminal` | attributes, and the code system per state type |

It was tried on the 536 modules shipped with Synthea 4.0.0: 535 are valid. The one that is not (`urinary_tract_infections`, state `Care Pathways`) is a `Simple` state without a transition, which is a defect in that module. The first run found 37 more, all caused by our own list being too strict, and `required-fields.mjs` was loosened for it: `distribution` (GMF v2) is a third choice next to `exact` and `range` on `Delay`, `Observation` and `Symptom`; `Observation` also allows `sampled_data` and `attachment`; an `Observation` with a `value_code` needs no `unit`. Nothing was made stricter. The schema does not demand that the `Initial` state has the type `Initial`, because `encounter/vitals` ships without it.

## Order of states: the order checks

`tools/bpmn2gmf/verify-flow.mjs` runs inside the converter (steps 7 and 8). The rules come from the States wiki and from the eight Level 1 checks of Kramer et al. Five of those checks existed before: path integrity (`STATE_UNREACHABLE`), transition completeness (`NO_TRANSITION`, `TERMINAL_HAS_TRANSITION`), existing sub-modules and targets (`SUBMODULE_NOT_FOUND`, `TRANSITION_TARGET_MISSING`), probabilities that sum to 1 (`DISTRIBUTION_SUM`, lint `probability-sum-valid`), and an EncounterEnd for every Encounter, which the converter derives from `encounterId`. A long Delay (a day or more after the last state of an encounter, a week or more inside it) ends the encounter there, so it does not keep one open for months, which Kramer et al. observed. The rules below are the rest. To see how many false alarms they give, they were run once over the 536 modules shipped in `synthea-with-dependencies.jar` (v4.0.0; 97 of them are not called by another module). This is a one-off measurement, not part of `validate`.

| Code | Level | Check in Kramer et al. | Shipped modules hit | What the hits are |
|---|---|---|---|---|
| `INITIAL_WITHOUT_WAIT` | warning | temporal logic: a Delay or Guard after `Initial` | 14 of 97 top-level | mostly diseases that start at birth on purpose (cystic fibrosis, renal dysplasia) and the generated `dental_idr` modules |
| `END_BEFORE_START` | warning | event timing: onset before end | 8 of 536 | an end state that no path from its start reaches (a modelling quirk, the engine ignores it) |
| `ENCOUNTER_REQUIRED` | warning | care delivery sequence: clinical states between Encounter and EncounterEnd | 3 of 536 | an Observation, Procedure or MedicationOrder on a path without an open encounter. The wiki says the engine raises an error; these modules do it anyway, so the engine may be more lenient than the wiki |
| `ENCOUNTER_NOT_ENDED` | note | clinical workflow: an EncounterEnd for every Encounter | 10 of 536 | an encounter still open at `Terminal` (wiki: only recommended, a wellness encounter needs none) |
| `GUARD_ATTRIBUTE_NEVER_SET` | note | attribute validity: assigned before read | 2 of 536 | attributes Synthea sets itself (`insurance_status`, `days_until_death`) |
| `END_START_MISSING`, `END_START_TYPE` | warning | state validity: referenced states exist | 1 of 536 | an end state that names a start state which does not exist |

Two checks are covered only in part. Attribute validity covers a Guard and the assign/referenced pairs (lint `referenced-by-attribute-matches-assign`), not attribute conditions in transitions, because Synthea sets some attributes itself and modules share them. Event timing covers Condition, Allergy, Medication, CarePlan and Device; a Symptom has no end state to pair.

`lung-cancer/` produces none of these. All of them are warnings or notes, because a graph cannot see that two branches exclude each other.

## Tests of the converter

| File | Covers |
|---|---|
| `convert.test.mjs` | converter behavior and its error cases |
| `matrix.test.mjs` | keeps [extension-matrix.md](extension-matrix.md) and the behavior of panel and converter together |
| `coverage.test.mjs` | which Synthea v4.0.0 state and transition classes the converter covers |
| `complete.test.mjs` | for every offered state type a fully filled example converts strictly and every state has all required fields |
| `schema.test.mjs` | the schema is not stale, accepts the converted `lung-cancer/` modules and the upstream modules, rejects eleven broken modules, and agrees with `missingFields()` for every state type |
| `verify-flow.test.mjs` | the order checks of `verify-flow.mjs` on plain module JSON: one module that passes and one that is reported per rule |
| `compare.test.mjs`, `structure.test.mjs` | negative tests: the comparisons must report real differences |

## What is not automated

- **Level 2, clinical content against the source:** the author reviews the pathway by hand. Kramer et al. let an LLM score the module against a disease profile and put a requirement number on every state; we do neither.
- **Level 3, the simulated population:** comparing rates with real ones, as Chen et al. 2019 ("The validity of synthetic clinical data", BMC Med Inform Decis Mak 19:44) did, needs a reference value from the pathway author. Without one, a run through `synthea:smoke` that reports states and branches no patient reaches would be possible; it is not built. The paper is from 2018 and measures Synthea of that time, so its findings are a reason for Level 3, not a statement about Synthea v4.
- **Codes:** wrong SNOMED, LOINC and RxNorm codes belong to the FHIR mapping and the medical terminology extension; here only the code system per state type is checked.

## Sources

- Kramer, M. A., Mathur, A., Adams, C. E., & Walonoski, J. A. (2025). *Leveraging Generative AI to Enhance Synthea Module Development*. MITRE Corporation. arXiv:2507.21123. <https://arxiv.org/abs/2507.21123>. The three validation levels and the eight Level 1 checks.
- Chen, J., Chun, D., Patel, M., Chiang, E., & James, J. (2019). The validity of synthetic clinical data: a validation study of a leading synthetic data generator (Synthea) using clinical quality measures. *BMC Medical Informatics and Decision Making, 19*, 44. <https://doi.org/10.1186/s12911-019-0793-0>. An example of Level 3 with clinical quality measures.
- Walonoski, J., Kramer, M., Nichols, J., Quina, A., Moesel, C., Hall, D., et al. (2018). Synthea: an approach, method, and software mechanism for generating synthetic patients and the synthetic electronic health care record. *Journal of the American Medical Informatics Association, 25*(3), 230–238. <https://doi.org/10.1093/jamia/ocx079>.
- Synthea, v4.0.0: <https://github.com/synthetichealth/synthea>. The 536 shipped modules used for the measurements above come from its `synthea-with-dependencies.jar`.
- Synthea wiki, Generic Module Framework: States, the source of the required fields and of the encounter rules: <https://github.com/synthetichealth/synthea/wiki/Generic-Module-Framework%3A-States>.
- `synthea-llm`, the modules generated in Kramer et al. (the repository holds the modules, not the checks): <https://github.com/synthetichealth/synthea-llm>.
- Synthea module builder (checks input ranges only, see #8): <https://github.com/synthetichealth/module-builder>.
- OMG (2011). *Business Process Model and Notation (BPMN), Version 2.0*; the BPMN 2.0 XSD used in step 3 ships in `bpmn-moddle`.
- JSON Schema, draft-07: <https://json-schema.org/draft-07/schema>; validated in the tests with Ajv 8.
