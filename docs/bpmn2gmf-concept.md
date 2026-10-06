# `tools/bpmn2gmf` — Concept

- **Status:** decisions made; phases 1 and 2 implemented (see [§8](#8-build-order))
- **Goal:** turn the BPMN pathway models (`synthea:` + `fhirmap:` + `term:`) into Synthea Generic Module Framework (GMF) `.json` modules that the Synthea engine can load.
- **Reads:** [implicit-rules.md](implicit-rules.md) (the mapping rules, tables B/B.1/C), [ADR-0003](adr/0003-encounter-context-implicit-scoping.md) (encounter synthesis), [modeling-guide.md](modeling-guide.md) (what modelers are told to draw).

This document fixes the architecture, the build order, and — most importantly — the points where the extension currently does **not** carry enough information to produce a valid GMF module. Those need a decision before the tool can be called complete (see [Decisions needed](#decisions-needed)).

---

## 1. What the converter has to handle (measured on the real files)

Inventory of the five `lung-cancer/*.bpmn` files:

| Construct | Count | Consequence |
|---|---|---|
| `synthea:stateTypeConfig` | 103 | explicit state type on every state-bearing node → inference from `fhirmap:` is only a fallback |
| `task` / `scriptTask` | 65 / 15 | `scriptTask` (used for SetAttribute/Counter) is treated exactly like `task` |
| `exclusiveGateway` | 37 | each becomes a `Simple` (or `Guard`) state in the MVP, see §4.5 |
| `intermediateCatchEvent` (timer) | 14 | → `Delay`; the number comes from `synthea:delayConfig`, never from `timeDuration`/`timeDate` text |
| `callActivity` | 4 | → `CallSubmodule`; needs cross-file resolution |
| `synthea:encounterContext` | 32 | encounter synthesis is on the critical path |
| `synthea:condition` | 17 | conditions incl. nesting/`negate` |
| `synthea:probabilityConfig` | 18 | `distributed_transition` |
| `term:coding` | 29 | codes; systems are URIs and must be mapped to Synthea system names |
| `textAnnotation` / `association` | 60 / 60 | documentation only → ignored |
| `boundaryEvent` (timer) | **1** | **no GMF equivalent** — see Decision 4 |
| i18n, `cp:` (BPMN4CP), DI shapes/edges | many | ignored |

Spike result: all five files load via `bpmn-moddle` with the existing `synthea.json` descriptor and **zero warnings**; `term:coding` and `fhirmap:resourceMapping` arrive as generic elements whose attributes are plain properties (`system`, `code`, `display`, `resourceType`). No extra descriptors and no new dependencies are needed to read the models.

For reference, the real Synthea `lung_cancer.json` has 99 states (e.g. 6× `Encounter`/`EncounterEnd`, 11× `ConditionOnset`, 11× `Procedure`, 10× `Symptom`, 9× `SetAttribute`), 80 direct / 9 conditional / 9 distributed transitions, and `"gmf_version": 1`.

---

## 2. Scope

**In scope:** one or more `.bpmn` files → one `.json` per process (main module + submodules), written flat into one output directory (decision from implicit-rules Section E).

**Out of scope (for now):** the reverse direction (GMF → BPMN); `lookup_table_transition`, `type_of_care_transition`, `complex_transition`; running Synthea itself; the mihub governance models (they need clinical remodelling first, see earlier feasibility assessment).

**Constraints** (from `AGENTS.md`): Node ≥ 22, ES modules, no new runtime dependency (only `bpmn-moddle`, already a devDependency, plus `node:test`), `npm run validate` must stay green, and the tool's exit code is the source of truth.

---

## 3. Architecture

A pipeline of small, pure stages. Each stage takes plain data and returns plain data, so each is unit-testable without touching the file system.

```
 .bpmn files
    │  1 parse        bpmn-moddle + synthea.json  → moddle tree (+ warnings = hard error)
    ▼
    │  2 normalize    moddle tree → IR graph      → { nodes, edges, process }
    ▼
    │  3 resolve      state type, names, codes, encounter groups, submodule refs
    ▼
    │  4 synthesize   Encounter / EncounterEnd, implicit Terminal, remainder probability
    ▼
    │  5 emit         IR → GMF JSON objects (per state type, per transition type)
    ▼
    │  6 verify       structural checks on the output (see §6)
    ▼
 modules/<name>.json   +  diagnostics report (errors / warnings / "unmodeled field" notes)
```

Proposed layout (all under `tools/bpmn2gmf/`, no `package.json` of its own):

```
cli.mjs            argument parsing, file I/O, exit code
parse.mjs          stage 1
ir.mjs             stage 2 (moddle → IR), ignores annotations/associations/DI/i18n/cp
resolve.mjs        stage 3
encounters.mjs     stage 4a (Encounter synthesis)
transitions.mjs    stage 4b/5 (Table C)
conditions.mjs     synthea:Condition → GMF condition (recursion, negate → Not, value typing)
emit/<StateType>.mjs  or one emit.mjs with a table: StateType → emitter
codes.mjs          term:coding system URI → Synthea system name
verify.mjs         stage 6
test/              node:test unit tests + golden files
```

CLI: `node tools/bpmn2gmf/cli.mjs lung-cancer/ --out-dir out/modules` (a directory so that submodule references can be resolved across files; a single file is allowed when it calls no submodule). npm script `bpmn2gmf`, plus `test:bpmn2gmf` added to `validate`.

### 3.1 Intermediate representation

```
Node  { id, bpmnType, label, stateType, config{…}, codes[], encounter{id,wellness,class,reason}|null,
        assignTo?, referencedBy?, submodule? }
Edge  { id, from, to, label, isDefault, probability{value|attribute,default}|null, condition|null }
```

The IR is the only thing the emitters see. Everything BPMN-specific (event definitions, DI, annotations) is gone after stage 2, which keeps the later stages simple and makes "unsupported BPMN construct" a single, central diagnostic.

---

## 4. Stage details

### 4.1 State type resolution
1. `synthea:stateTypeConfig` wins if present.
2. Otherwise infer per [implicit-rules Table B](implicit-rules.md): start event → `Initial`, end event → `Terminal`, timer catch event → `Delay`, call activity → `CallSubmodule`, exclusive gateway + `guardConfig` → `Guard`, other exclusive gateway → `Simple`, task/sub-process → via `fhirmap:resourceType`.
3. Still ambiguous (e.g. a task with no `stateType` and no `fhirmap`) → **error** with element id and label. No guessing.

### 4.2 State names
The start event is always named `Initial` (Synthea requires exactly this name; found while implementing). Every other state: the BPMN `name` **verbatim**. Empty → `<stateType>_<id>`. A duplicate name within one module → append `_<id>`. No prefix stripping (labels like "Symptom: Cough" stay as they are): it is deterministic, needs no heuristics, and Synthea only requires uniqueness per module. The generated names will therefore differ from the hand-written upstream names; the comparison in §7 is keyed on state type and codes, not on names.

### 4.3 Codes
Every coding on a node is collected, whatever its form: our flat `<term:coding/>` or the real package's `term:annotations > annotation > coding`; prefix and namespace are ignored. `system` URIs map to Synthea names:

| URI | Synthea `system` |
|---|---|
| `http://snomed.info/sct` | `SNOMED-CT` |
| `http://loinc.org` | `LOINC` |
| `http://www.nlm.nih.gov/research/umls/rxnorm` | `RxNorm` |
| NUBC (discharge disposition) | `NUBC` (not needed yet) |

Each state type accepts only some systems (Procedure/ConditionOnset/CarePlanStart/Device/ImagingStudy: SNOMED-CT, MedicationOrder/End: RxNorm, Observation/DiagnosticReport: LOINC, AllergyOnset/End: SNOMED-CT or RxNorm). Codings in other systems on the same element (e.g. the IHE codes in the terminology repo's example) are left out and mentioned as a note (`CODING_IGNORED`), not an error. A state that ends up with no usable code is reported as incomplete (`REQUIRED_FIELD_MISSING`).

**Start/end pairing** (`*End` states): `referencedByAttributeConfig` first, then the state's own code, then the single matching start state upstream on every path (nearest wins in a chain; two start states on parallel branches that merge are ambiguous → error `END_STATE_UNPAIRED`).

**Death** drawn as an end event has no outgoing flow; it continues to the module's `Terminal` state (one is added if there is none).

### 4.4 Encounter synthesis (ADR-0003)
Group all nodes by `encounterId`; untagged nodes are not part of any group and simply inherit whatever encounter is open at runtime (decision already recorded in implicit-rules E).

For each group:
- **Entry edges** = edges from outside the group into a member. Insert one `Encounter` state on each (state name = `encounterId`, with a numeric suffix if there is more than one copy).
- **Exit edges** = edges from a member to a non-member. Insert one `EncounterEnd` state on each.
- `wellness` → `"wellness": true`; otherwise `encounter_class`, `reason`, `codes` (see Decision 1 — `codes` is not modeled yet).
- **Validation:** every path that enters the group must leave it through an exit edge without leaving and re-entering. Re-entry means two separate encounters sharing one id → **error** (the modeler should use two ids). Loops inside a group are fine.
- `synthea:encounterReference.targetEncounter` is resolved to the `Encounter` state name of that group. Only well-defined when the group has exactly one `Encounter` copy; otherwise **error** (see Decision 3).

Copying per entry/exit edge is semantically safe (each path still gets a matching Encounter/EncounterEnd pair) and avoids forcing modelers to restructure their diagrams around a single-entry rule.

### 4.5 Transitions (Table C)
Derived from the *outgoing edges* of every emitted state:

| Outgoing edges | GMF |
|---|---|
| exactly one, no condition/probability | `direct_transition` |
| ≥ 2, all with `probabilityConfig` | `distributed_transition` (last edge without a value gets the remainder; `probabilityAttribute` → `{attribute, default}`) |
| ≥ 2, with `conditionConfig.condition` | `conditional_transition` (BPMN default flow → last entry without `condition`) |
| conditional with no default | `conditional_transition` as is — Synthea itself goes to its default `Terminal` when no condition matches (Transitions wiki), so nothing is synthesized; the tool only emits a note |
| none | no transition (only legal on `Terminal`/`Death`-terminal states) |
| mixed kinds on one node | **error** |

**Gateways:** in the MVP every exclusive gateway becomes its own `Simple` (or `Guard`) state carrying the transition. That is always correct (implicit-rules Section D) and keeps the converter free of rewriting logic. A later, optional pass (`--fuse-gateways`) can move a gateway's transition onto the preceding state when that state has no other outgoing edge, which removes most `Simple` states and brings the output close to hand-written modules (the real `lung_cancer.json` has only 4 `Simple` states, our models have 37 gateways). It is an output-size/readability optimization, not a correctness requirement.

### 4.6 Conditions
`synthea:condition` → GMF condition object:
- `conditionType` → `condition_type` verbatim (the enum values are exactly Synthea's strings, incl. `Vital Sign`, `Socioeconomic Status`, `At Least`).
- Per-type fields mapped one-to-one (`quantity`+`unit` for Age, `within` for PriorState, etc.).
- `conditions[]` recurses; `At Least`/`At Most` carry `minimum`/`maximum`.
- **`negate="true"` → wrap in `{ "condition_type": "Not", "condition": … }`** (mandatory, see implicit-rules Section A — otherwise the negation is silently lost).
- **Value typing:** `value` is a string in our schema. Rule: numeric string → number, `true`/`false` → boolean, anything else → string. `is nil`/`is not nil` emit no `value`. This is a convention to be confirmed against `lung_cancer.json` (see Decision 6).

### 4.7 Submodules
Every `.bpmn` file → one JSON file named after the **file** (`-` → `_`, e.g. `anemia-submodule.bpmn` → `anemia_submodule.json`); the JSON `name` is the process name. File names, not process names, are what the real `submoduleConfig` values match (`symptom_check_submodule` vs. process "Symptom Check"). `callActivity` → `CallSubmodule` with `submodule` = the bare name from `synthea:submoduleConfig` (flat layout). Verify stage: every referenced name must resolve to a file in the same run, otherwise error. Circular calls → error.

### 4.8 Attributes
Names are emitted as written. The SYN-26 lint rule (lower_snake_case) already warns upstream, so the tool does not rewrite them. `assignToAttributeConfig` → `assign_to_attribute`; `referencedByAttributeConfig` → `referenced_by_attribute`.

---

## 5. Where the extension does not carry enough data (the real gap)

Comparing our BPMN files with the real `lung_cancer.json` and with the Synthea States wiki shows that several states have **required** GMF fields that no `synthea:`/`term:`/`fhirmap:` element can express today. The graph, transitions, conditions and codes are covered; the *values* of some states are not.

| GMF state | Required / needed by Synthea | Modeled today? | Seen in our files |
|---|---|---|---|
| `Encounter` (non-wellness) | `encounter_class` **and** `codes` ("must be specified", wiki) | class yes, **codes no** | 32 `encounterContext`, all in non-wellness encounters |
| `Observation` | `category`, `codes`, a value choice (`range`/`exact`/`value_code`/…), `unit` | codes only | 6 + 3 |
| `VitalSign` | `vital_sign` (enum from Synthea's `VitalSign.java`), `unit`, `exact`/`range`; has **no** `codes` | no | 0 — the two `Pain_Vital` states were modeled with the wrong state type and are `Observation` now, see below |
| `Symptom` | `symptom` name, `exact`/`range`, optional `cause`/`probability` | none (name only in the label) | 10 |
| `ImagingStudy` | `procedure_code`, `series[]` (body site, modality, instances) | procedure code only | 1 |
| `Death` | cause via `codes`/`condition_onset`/`referenced_by_attribute`; optional `range`/`exact` | `referencedByAttributeConfig` yes, range no | 1 (main module) |
| `DiagnosticReport` | `codes`, `observations` (the contained values, e.g. 11 for the CBC panel, each with category/unit/range) | codes only; the six panels in `anemia-submodule` are tasks now, so the contained observations do not exist in the model | 6 |
| `Procedure` | `codes`; optional `duration`, `reason` | codes only | 14 |
| `MedicationOrder` | `codes`; optional `reason`, `prescription`, `chronic` | codes, assign yes | 5 |
| all states | optional `remarks[]` | no | — |

**Finding (fixed) — our two `Pain_Vital` states were modeled as the wrong type.** Both carry a LOINC code, but GMF `VitalSign` has no `codes` (it only *sets* a value and is not recorded in the chart). In the real `lung_cancer.json` all three `Pain_Vital*` states are `Observation` (`category: vital-signs`, `unit: {score}`, `range` 4–8). The fix was a model correction (`stateType="VitalSign"` → `Observation`, done in both files; `fhirmap` is not part of this extension and was left alone), not an extension change — so **no `VitalSign` fields are needed** for the current pathways.

Until a decision is made the converter must not silently produce invalid JSON. The proposed default behavior is described in Decision 1.

---

## 6. Verification of the output (stage 6)

Cheap structural checks that run on every conversion:

1. exactly one `Initial` per module; every state reachable from it;
2. every transition target exists; state names unique;
3. every non-terminal state has a transition;
4. each `distributed_transition` sums to 1.0 (± ε) or uses a remainder;
5. each state carries all required fields from a table derived from the wiki (§5) — missing ones are reported as *"unmodeled field"* notes (warning by default, error with `--strict`);
6. `CallSubmodule` targets exist in the run.

These are our own checks (a small required-fields table in `verify.mjs`), not a replacement for loading the module in Synthea.

---

## 7. Testing

- **Unit tests** (`node:test`) per stage with tiny hand-written BPMN/IR fixtures: each transition type, condition recursion + `negate`, remainder probability, implicit Terminal, encounter synthesis (single group, two groups in one path, multiple entries/exits, re-entry error).
- **Golden files** for the real models, built up in the order of §8, stored under `tools/bpmn2gmf/test/golden/`.
- **Structural comparison against upstream:** a script that compares our generated module to the real `lung_cancer*.json` by *multiset of (state type, codes)* and by transition-shape counts — not by names or exact text, since our BPMN deliberately differs (names, gateway states, the explicit simplifications). Differences are expected and are reviewed, not auto-failed.
- **Optional smoke test (later):** load the generated JSON in a local Synthea build (needs Java). Out of scope for the first iterations.

---

## 8. Build order

| Phase | Content | Done when |
|---|---|---|
| 0 | Spike (done): moddle loads all five files without warnings | — |
| 1 | CLI, parse, IR, state-type/name resolution, `Initial`/`Terminal`/`Simple`/`Delay`/`SetAttribute`/`Counter`/`CallSubmodule`, all three transition types, conditions + `Not`, verify | **Implemented** (22 unit tests, `npm run test:bpmn2gmf`). The planned golden file for `lung-cancer-probabilities-submodule.bpmn` is blocked by the *model*: its 3 gateways have no `synthea:conditionConfig` (see §10) |
| 2 | Codes, `term:` mapping, clinical states (`ConditionOnset/End`, `Procedure`, `MedicationOrder/End`, `CarePlanStart`, `Device*`, …), assign/referenced attributes | **Implemented** (41 tests). Four of the five real files convert without errors; `anemia_submodule` has the same 18 states (type + codes) as upstream `anemia_sub.json`. Remaining output gaps are reported as `REQUIRED_FIELD_MISSING` warnings and a `remarks` entry in the state; `--strict` turns them into errors |
| 3 | Encounter synthesis + `targetEncounter` | treatment submodule and main module convert |
| 4 | Decisions 1/4 implemented: extension additions + emitters for the new fields | `--strict` passes on all five files |
| 5 | `--fuse-gateways`, upstream comparison script, CI step in `validate` | comparison report for `lung_cancer.json` reviewed |

Phases 1–3 do not depend on the field decisions (missing fields only produce warnings), so they ran ahead of phase 4.

---

## 9. Proposed extension additions (Decision 1, phase 4)

Minimal set that makes all five current pathways convertible. Everything optional in the wiki (`cause`, `probability`, `prescription`, Procedure `duration`, `remarks`, `value_code`, Observation `attribute`/`vital_sign` values, `VitalSign` state) is deliberately left out until a model needs it.

| Addition | Fields | Used by | Why |
|---|---|---|---|
| `EncounterContext` (extend) | `encounterCodeSystem`, `encounterCode`, `encounterCodeDisplay` | every non-wellness `Encounter` (6 in upstream `lung_cancer.json`) | wiki: `codes` mandatory when not wellness; lint rule: consistent within an `encounterId` group, like `wellness`/`encounterClass` |
| `ValueConfig` (new, mirrors `DelayConfig`) | `valueShape` (`EXACT`/`RANGE`), `value`, `valueHigh`, `unit`, `decimals` | `Observation`, `Symptom`, `Death` (range) | one shared element instead of three; same exact/range shape the modelers already know from Delay |
| `ObservationConfig` (new) | `category` (enum: `vital-signs`, `laboratory`, `procedure`, `imaging`, `survey`, `exam`, `therapy`, `social-history`) | `Observation` | required by Synthea |
| `SymptomConfig` (new) | `symptom` | `Symptom` (10 states) | the symptom name is a required field and must not be parsed from the label |
| `ImagingStudySeries` (new, `isMany`) | `bodySite*` / `modality*` code triples, `instances` count or title | `ImagingStudy` (1 state) | `series` is required; lowest priority because it is a single state |

Each addition touches five places: `synthea.json`, `SyntheaPropertiesProvider.js` (dynamic panel group), a lint rule (required field present, consistent within group), `docs/modeling-guide.md`, and a fixture in `examples/valid|invalid`. Order: Encounter codes → `SymptomConfig` → `ValueConfig` + `ObservationConfig` → `ImagingStudySeries`.

---

## 10. Findings from the first run on the real files (phase 1)

`npm run bpmn2gmf -- lung-cancer --check` — none of the five files converts yet:

| Finding | Where | Needed |
|---|---|---|
| 12 gateways whose branches had no `synthea:conditionConfig`/`probabilityConfig` (`TRANSITION_AMBIGUOUS`) | `anemia-submodule` (9), `lung-cancer-probabilities-submodule` (3) | **all 12 fixed** (conditions or probabilities added, taken from the upstream modules). `lung-cancer-probabilities-submodule` now converts and has a golden test; its attribute values and conditions match upstream `lung_cancer_probabilities.json` (only difference: the male branch is the default flow instead of an explicit `Gender == M`). The last one, `Hematocrit critical?`, needed decision 8 (next row). Lint rule SYN-27 (`gateway-branches-require-condition-or-probability`) now warns about such gateways; none is left in the real files |
| `Hematocrit critical?` needed an `Observation` condition matched by **LOINC `codes`** (20570-8), not by attribute | `anemia-submodule` | **fixed** (decision 8 implemented): `synthea:Condition` has `codeSystem`/`code`/`codeDisplay`; the gateway is modeled as two branches to the same delay (F: `And[Hct ≤ 28, Female]`, M: `And[Male, Hct ≤ 27]`), and converts to the same conditions as upstream `anemia_sub.json` |
| After phase 2: **21 `REQUIRED_FIELD_MISSING` warnings**, exactly the gaps of §5: `Symptom` 10 (`symptom`, exact/range), `DiagnosticReport` 6 (`observations`), `Observation` 4 (`category`, `unit`, value), `ImagingStudy` 1 (`series`). `synthea-lung-cancer` still does not convert because of the boundary timer (below) | all files | phase 4 (extension additions) |
| boundary timer `Survival Time elapsed` (`BOUNDARY_EVENT_UNSUPPORTED`) | `synthea-lung-cancer` | model fix, decision 4 |
| `Float` in `synthea.json` was not a moddle built-in type (moddle knows `Real`), so numeric attributes (`quantity`, `probability`, `probabilityDefault`, `amount`) loaded as strings | `extension/model/synthea.json` | **fixed**: `Float` → `Real`; `synthea.xsd` regenerated (it was also stale, `xsd:gen:check` had been failing) |

---

## Decisions

| # | Topic | Status |
|---|---|---|
| 1 | Fields the extension cannot express | **Decided:** field list in §9 is confirmed (required fields verified against the wiki's `(optional)` markers); phases 1–3 run with "unmodeled" notes until phase 4 |
| 2 | State names | **Decided:** BPMN `name` verbatim, `<stateType>_<id>` fallback, id suffix for duplicates |
| 3 | `targetEncounter` | **Decided:** value = target group's `encounterId`, resolved by the tool; error if the group yields more than one `Encounter` copy |
| 4 | Boundary timer `Survival Time elapsed` | **Decided:** the converter rejects boundary events with a clear error; the main pathway is remodeled with `Death` + range before the treatment cycle (needs `ValueConfig` on `Death`, §9) |
| 5 | Encounter `codes` | **Decided** (implementation with phase 4, part of §9): attributes on `EncounterContext`, consistent within an `encounterId` group; a default per `encounterClass` only as a fallback with a warning |
| 6 | `value` typing | **Decided:** numeric → number, `true`/`false` → boolean, else string; `is nil` emits no value |
| 7 | Strictness | **Decided:** warnings locally, `--strict` in CI/`validate` after phase 4 |
| 8 | `codes`-based matching in `Observation`/`Active *` conditions | **Decided and implemented**: `codeSystem`, `code`, `codeDisplay` on `synthea:Condition` (all three required when a code is used, alternative to `referencedAttribute`); panel fields, converter (`codes: [{system, code, display}]`), tests and guide are done |
