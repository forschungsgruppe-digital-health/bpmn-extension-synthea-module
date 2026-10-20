# `tools/bpmn2gmf` — Concept

- **Status:** all phases implemented; decisions made (see [§8](#8-build-order))
- **Goal:** turn the BPMN pathway models (`synthea:`; the clinical codes are attributes of its state type) into Synthea Generic Module Framework (GMF) `.json` modules that the Synthea engine can load.
- **Reads:** [implicit-rules.md](implicit-rules.md) (the mapping rules, tables B/B.1/C), [ADR-0003](adr/0003-encounter-context-implicit-scoping.md) (encounter synthesis), [modeling-guide.md](modeling-guide.md) (what modelers are told to draw).

This document fixes the architecture, the build order, and — most importantly — the points where the extension currently does **not** carry enough information to produce a valid GMF module. Those need a decision before the tool can be called complete (see [Decisions needed](#decisions-needed)).

---

## 1. What the converter has to handle (measured on the real files)

Inventory of the five `lung-cancer/*.bpmn` files:

| Construct | Count | Consequence |
|---|---|---|
| `synthea:stateTypeConfig` | 103 | explicit state type on every state-bearing node |
| `task` / `scriptTask` | 65 / 15 | `scriptTask` (used for SetAttribute/Counter) is treated exactly like `task` |
| `exclusiveGateway` | 37 | each becomes a `Simple` (or `Guard`) state in the MVP, see §4.5 |
| `intermediateCatchEvent` (timer) | 14 | → `Delay`; the number comes from `synthea:delayConfig`, never from `timeDuration`/`timeDate` text |
| `callActivity` | 4 | → `CallSubmodule`; needs cross-file resolution |
| `synthea:encounterContext` | 32 | encounter synthesis is on the critical path |
| `synthea:condition` | 17 | conditions incl. nesting/`negate` |
| `synthea:probabilityConfig` | 18 | `distributed_transition` |
| clinical codes | 29 | systems are URIs and must be mapped to Synthea system names; the codes sit on `synthea:stateTypeConfig` |
| `textAnnotation` / `association` | 60 / 60 | documentation only → ignored |
| `boundaryEvent` (timer) | **1** | **no GMF equivalent** — see Decision 4 |
| i18n, `cp:` (BPMN4CP), DI shapes/edges | many | ignored |

The counts are those of the first analysis and are kept as the reasoning behind the design. The models have changed since: the 44 clinical codes moved onto `synthea:stateTypeConfig`, and the `boundaryEvent` is gone (replaced by four `Death` states, Decision 4). The other counts changed with the added states and fields, but they only served to size the work.

Spike result: all five files load via `bpmn-moddle` with the existing `synthea.json` descriptor and **zero warnings**; foreign elements arrive as generic elements whose attributes are plain properties. No extra descriptors and no new dependencies are needed to read the models.

For reference, the real Synthea `lung_cancer.json` has 99 states (e.g. 6× `Encounter`/`EncounterEnd`, 11× `ConditionOnset`, 11× `Procedure`, 10× `Symptom`, 9× `SetAttribute`), 80 direct / 9 conditional / 9 distributed transitions, and `"gmf_version": 1`.

---

## 2. Scope

**In scope:** one or more `.bpmn` files → one `.json` per process (main module + submodules), written so that Synthea sees the right modules and submodules: a module nobody calls at the top, the modules it calls in a subdirectory named after it (implicit-rules Section E, corrected after the engine test, §12).

**Out of scope (for now):** the reverse direction (GMF → BPMN); `lookup_table_transition`, `type_of_care_transition`; running Synthea itself; the mihub governance models (they need clinical remodelling first, see earlier feasibility assessment).

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
codes.mjs          code system URI → Synthea system name
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
2. Otherwise infer per [implicit-rules Table B](implicit-rules.md): start event → `Initial`, end event → `Terminal`, timer catch event → `Delay`, call activity → `CallSubmodule`, exclusive gateway + `guardConfig` → `Guard`, other exclusive gateway → `Simple`, task/sub-process/other event → only via the explicit `stateType` (sub-process: `DiagnosticReport`, `MultiObservation` or `CallSubmodule`).
3. Still ambiguous (e.g. a task with no `stateType`) → **error** with element id and label. No guessing.

### 4.2 State names
The start event is always named `Initial` (Synthea requires exactly this name; found while implementing). Every other state: the BPMN `name` **verbatim**. Empty → `<stateType>_<id>`. A duplicate name within one module → append `_<id>`. No prefix stripping (labels like "Symptom: Cough" stay as they are): it is deterministic, needs no heuristics, and Synthea only requires uniqueness per module. The generated names will therefore differ from the hand-written upstream names; the comparison in §7 is keyed on state type and codes, not on names.

### 4.3 Codes
Codes sit on the element's `synthea:stateTypeConfig` (`codeSystem`, `code`, `codeDisplay`, one per state). `system` URIs map to Synthea names:

| URI | Synthea `system` |
|---|---|
| `http://snomed.info/sct` | `SNOMED-CT` |
| `http://loinc.org` | `LOINC` |
| `http://www.nlm.nih.gov/research/umls/rxnorm` | `RxNorm` |
| NUBC (discharge disposition) | `NUBC` (not needed yet) |

Each state type accepts only some systems (Procedure/ConditionOnset/CarePlanStart/Device/ImagingStudy: SNOMED-CT, MedicationOrder/End: RxNorm, Observation/DiagnosticReport: LOINC, AllergyOnset/End: SNOMED-CT or RxNorm). Codings in other systems on the same element are left out and mentioned as a note (`CODING_IGNORED`), not an error. A state that ends up with no usable code is reported as incomplete (`REQUIRED_FIELD_MISSING`).

**Start/end pairing** (`*End` states): `referencedByAttributeConfig` first, then the state's own code, then the single matching start state upstream on every path (nearest wins in a chain; two start states on parallel branches that merge are ambiguous → error `END_STATE_UNPAIRED`).

**Death** drawn as an end event has no outgoing flow; it continues to the module's `Terminal` state (one is added if there is none).

### 4.4 Encounter synthesis (ADR-0003)
Implemented in `tools/bpmn2gmf/encounters.mjs`, between state resolution and emission. The Encounter/EncounterEnd states are spliced into the IR flow, so transitions (conditions, probabilities) stay on the original edges.

**Which part of the flow belongs to an encounter** (its *region*), per `encounterId` group:
- **span:** the tagged states plus every node on a path between two of them. Another encounter's states and anything that ends an encounter (below) cannot lie inside a span.
- **tail:** after the span, untagged states keep the encounter open — a state left untagged inherits whatever encounter is open (guide §9, upstream `anemia_sub.json`) — until the flow reaches a boundary.
- **boundaries:** `Terminal`, `Death`, `CallSubmodule`, a state of another encounter, and a **Delay**: in the tail one of a day or more ends the encounter; *between* two states of the same encounter (both tagged) a delay of a week or more does, shorter ones are part of the stay. These limits are a rule of this tool, chosen because they reproduce upstream: the anemia module keeps a 1 hour delay inside the encounter and ends it before the 1 day delay after it; the upstream treatment cycle is one inpatient encounter with a loop of 1 day delays inside it (the length of stay) and weeks between two cycles. A single threshold of one day broke the stay into 343 one-day encounters in the engine test.

**What is inserted:**
- `Encounter` on every edge that enters a span, one per (encounter, entered state), named `encounterId` (suffix `_2`, `_3` … for further copies). `wellness` → `"wellness": true`, otherwise `encounter_class`; `reason` is passed through; `codes` stay missing until phase 4 (reported).
- `EncounterEnd` on every edge that leaves all regions the edge started in, shared per successor (EncounterEnd ends whichever encounter is current at runtime, so one state can serve two groups with a common tail). Named `<encounterId>_End`.
- Leaving one encounter straight into another gives `EncounterEnd → Encounter`.
- `synthea:encounterReference.targetEncounter` → `target_encounter` = the name of the group's `Encounter` state; an error if the group has none (`TARGET_ENCOUNTER_UNKNOWN`) or several (`TARGET_ENCOUNTER_AMBIGUOUS`).

**Checks:** members that disagree on wellness/class/reason (`ENCOUNTER_INCONSISTENT`), a state with `requiresEncounterContext` but no `encounterId` (`ENCOUNTER_ID_MISSING`), a span node between several encounters (`ENCOUNTER_SPANS_OVERLAP`), and — as a warning — every state Synthea only processes during an encounter (MedicationOrder, Procedure, Observation, DiagnosticReport, ImagingStudy, CarePlanStart, Device, SupplyList, MultiObservation) that is in no region (`STATE_OUTSIDE_ENCOUNTER`).

**Fewer Encounter copies:** a group entered at several states (e.g. four lab panels behind a chain of gateways) would get one `Encounter` per entered state. If one node (the common *dominator* of the entered states) is neutral — a gateway, `Simple`, `SetAttribute` or `Counter` — and everything between it and the group is neutral and leads only into the group, the encounter is opened there instead: that node becomes a virtual member and one `Encounter` remains (anemia: 6 → 2, as upstream). A wait between the gateway and a branch (any other state type) prevents it, since the wait would then run inside the encounter; the group keeps one `Encounter` per entered state and `targetEncounter` is ambiguous for it.

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

**Gateways:** by default every exclusive gateway becomes its own `Simple` (or `Guard`) state carrying the transition — always correct (implicit-rules Section D). `--fuse-gateways` removes the ones that only exist for the diagram: a join (pass-through) is bypassed, and a branching gateway entered from exactly one state through a direct transition moves onto that state. Kept: gateways with several predecessors (they would lose a branch), gateways a `PriorState` condition names, and `Simple` states the modeler drew. Over the five real files this takes the output from 168 to 142 states (`Simple` 39 → 13); a test checks that every other state and what it can lead to stay the same. A conditional state whose branches lead into probability gateways ("if pregnant, 28 %, otherwise 7 %") becomes one `complex_transition`: each entry holds the branch's condition and either its target or the gateway's `distributions`, the default flow comes last as the entry without a condition. A probability gateway is absorbed only when that state is its single predecessor; in the anemia module this folds three gateways (`Anemia_Encounter`, `Patient pregnant?`).

### 4.6 Conditions
`synthea:condition` → GMF condition object:
- `conditionType` → `condition_type` verbatim (the enum values are exactly Synthea's strings, incl. `Vital Sign`, `Socioeconomic Status`, `At Least`).
- Per-type fields mapped one-to-one (`quantity`+`unit` for Age, `within` for PriorState, etc.).
- `conditions[]` recurses; `At Least`/`At Most` carry `minimum`/`maximum`.
- **`negate="true"` → wrap in `{ "condition_type": "Not", "condition": … }`** (mandatory, see implicit-rules Section A — otherwise the negation is silently lost).
- **Value typing:** `value` is a string in our schema. Rule: numeric string → number, `true`/`false` → boolean, anything else → string. `is nil`/`is not nil` emit no `value`. This is a convention to be confirmed against `lung_cancer.json` (see Decision 6).

### 4.7 Submodules
Every `.bpmn` file → one JSON file named after the **file** (`-` → `_`, e.g. `anemia-submodule.bpmn` → `anemia_submodule.json`); the JSON `name` is the process name. File names, not process names, are what the real `submoduleConfig` values match (`symptom_check_submodule` vs. process "Symptom Check"). `callActivity` → `CallSubmodule` with `submodule` = the bare name from `synthea:submoduleConfig`, turned into the module's path (`layout.mjs`): Synthea runs every top-level file as a module of its own and treats only files in a subdirectory as submodules, so a called module goes to `<caller>/<name>.json` (below the first module that reaches it) and the call gets that path. Verify stage: every referenced name must resolve to a file in the same run, otherwise error. Circular calls → error.

### 4.8 Attributes
Names are emitted as written. The SYN-26 lint rule (lower_snake_case) already warns upstream, so the tool does not rewrite them. `assignToAttributeConfig` → `assign_to_attribute`; `referencedByAttributeConfig` → `referenced_by_attribute`.

---

## 5. Where the extension does not carry enough data (the real gap)

Comparing our BPMN files with the real `lung_cancer.json` and with the Synthea States wiki shows that several states have **required** GMF fields that no `synthea:` element can express today. The graph, transitions, conditions and codes are covered; the *values* of some states are not.

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

**Finding (fixed) — our two `Pain_Vital` states were modeled as the wrong type.** Both carry a LOINC code, but GMF `VitalSign` has no `codes` (it only *sets* a value and is not recorded in the chart). In the real `lung_cancer.json` all three `Pain_Vital*` states are `Observation` (`category: vital-signs`, `unit: {score}`, `range` 4–8). The fix was a model correction (`stateType="VitalSign"` → `Observation`, done in both files; the state type was never derived from a resource type), not an extension change — so **no `VitalSign` fields are needed** for the current pathways.

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
| 2 | Codes, clinical states (`ConditionOnset/End`, `Procedure`, `MedicationOrder/End`, `CarePlanStart`, `Device*`, …), assign/referenced attributes | **Implemented** (41 tests). Four of the five real files convert without errors; `anemia_submodule` has the same 18 states (type + codes) as upstream `anemia_sub.json`. Remaining output gaps are reported as `REQUIRED_FIELD_MISSING` warnings and a `remarks` entry in the state; `--strict` turns them into errors |
| 3 | Encounter synthesis + `targetEncounter` | **Implemented** (51 tests). Anemia and the treatment submodule get their Encounter/EncounterEnd states; the main module still waits for the boundary-timer remodeling |
| 4 | Decisions 1/4 implemented: extension additions + emitters for the new fields | **Implemented** (61 tests). Encounter code, `SymptomConfig`, `ObservationConfig`, `ValueConfig`, `ImagingStudySeries` and `ReportObservation` (the contained values of a `DiagnosticReport`) are in schema, panel, converter, lint (SYN-28, SYN-29) and guide; the main pathway's boundary timer is replaced by `Death` states with time spans. **All five real files convert and pass `--strict` with no warning**; the nine lab reports (92 contained observations) are identical to upstream |
| 5 | `--fuse-gateways`, upstream comparison script, CI step in `validate` | **Implemented** (70 tests): `--fuse-gateways`, fewer `Encounter` copies, `npm run compare:upstream` with the three upstream modules kept in `tools/bpmn2gmf/test/upstream/` (Apache-2.0, see NOTICE.md), and `npm run validate` / the CI workflow now also run `xsd:gen:check`, `xsd:ext`, the converter tests and `convert:check` (all five real files, `--strict`). Not done: loading the generated JSON in a real Synthea (see §11) |

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
| After phase 4: **no warnings left.** The nine lab reports got their contained observations from upstream (`ReportObservation`); the three `Record_*` panels were retyped from `Observation` to `DiagnosticReport` like upstream | `anemia-submodule`, `lung-cancer-treatment-submodule` | done |
| boundary timer `Survival Time elapsed` (`BOUNDARY_EVENT_UNSUPPORTED`) | `synthea-lung-cancer` | **fixed** (decision 4): the four `Stage I–IV (Survival Time …)` delays are now `Death` states with a `ValueConfig` time span (same ranges and units as upstream `Stage I`–`Stage IV`), the boundary event and the old `Death` end event are gone, and the treatment call continues to a `Terminal` state. The four `Set lung_cancer_survival_time` states are left in place (nothing reads that attribute any more) |
| `Float` in `synthea.json` was not a moddle built-in type (moddle knows `Real`), so numeric attributes (`quantity`, `probability`, `probabilityDefault`, `amount`) loaded as strings | `extension/model/synthea.json` | **fixed**: `Float` → `Real`; `synthea.xsd` regenerated (it was also stale, `xsd:gen:check` had been failing) |

---

## 11. Comparison with upstream (phase 5)

`npm run compare:upstream` converts the five real files and compares them with the hand-written Synthea modules by *content* (`compare.mjs`): every state with clinical meaning is reduced to a signature — type, codes and the values that matter (ranges, units, observation lists, encounter class and code) — and the signatures are compared as multisets. Names, `Simple`/`EncounterEnd` states and the exact transition structure are left out on purpose.

| Our module | Upstream | Result |
|---|---|---|
| `anemia_submodule` | `anemia_sub.json` | **same content** — all 18 states incl. the six lab reports with their 48 observations, the two encounters with class and code |
| `lung_cancer_probabilities_submodule` | `lung_cancer_probabilities.json` | **same content** |
| main + treatment + symptom-check | `lung_cancer.json` | **nothing clinical exists only on our side** (encounters, procedures, diagnoses, symptoms, the four `Death` states with their cause, lab values, length of stay, hospice reason); upstream has second copies of the SCLC/NSCLC treatment |

Differences from upstream in the main pathway. Four were found by the first comparison and are **resolved**; the converter and extension grew for them:

| What | Before | Now |
|---|---|---|
| `lung_cancer_los` | `SetAttribute` = 3 (every patient the same) | `SetAttributeConfig` with `valueKind="DISTRIBUTION"`, EXPONENTIAL, mean 3, rounded — as upstream |
| `hospice_reason` | the text "Lung Cancer" | copies the attribute `lung_cancer_diagnosis` (`valueAttribute`); that attribute is assigned by the two `Diagnosis: NSCLC/SCLC` states, upstream's "Lung Cancer" |
| cause of death | none | the four `Death` states refer to `lung_cancer_diagnosis` (`referencedByAttributeConfig`), as upstream |
| counter attribute | `lung_cancer_non_diagnosis_counter` | `lung_cancer_nondiagnosis_counter`, spelled as upstream |
| `lung_cancer_survival_time` | four left-over `SetAttribute` states | removed; the stage `Death` events lead straight to the gateways |

The test now pins that **no clinical content exists only on our side**. What exists only upstream are the second copies of the SCLC/NSCLC treatment (we model it once, with gateways: `Record_CMP_2`, a second `Delay`, the second chest CT, …), which is a modeling choice and not a gap.

**Linking fields** (they are not part of the signatures, because attribute names differ legitimately; counted per state, ours / upstream, main + treatment + symptom-check against `lung_cancer.json`):

| Field | Ours / upstream | |
|---|---|---|
| `target_encounter` | 11 / 11 | every diagnosis names the visit where it is recorded. Without it a `ConditionOnset` outside an encounter is "onset but never discovered" and never reaches the record — this was a real gap, not a cosmetic one |
| `assign_to_attribute` | 14 / 15 | the suspected diagnosis (`suspected_lung_cancer`), the diagnosis (`lung_cancer_diagnosis`), the eight staged diagnoses (`lung_cancer_condition`) and the medication orders; the anemia onset assigns `anemia`, the attribute the main pathway tests (`anemia == nil`) — before, that test was always true. The one missing is the NSCLC copy of a medication order |
| `referenced_by_attribute` | 7 / 8 | four `Death` states + three `MedicationEnd`; the same NSCLC copy is missing |
| `value_attribute` | 1 / 1 | |
| `reason` | 0 / 20 | **left out on purpose**: optional, and it only names the condition behind a procedure, prescription, care plan or encounter in the output (FHIR "reason"); it changes no simulation outcome |

`target_encounter` has to point at an encounter *in the same module*, which moved `Procedure: MRI Brain` with its encounter `Diagnosis_Encounter_IV` from the start of the treatment submodule to the main pathway (right before the call), as upstream orders it. The treatment submodule's care plan start now belongs to `SCLC_Treatment_Encounter` (before, it ran inside the MRI visit).

**Engine test:** see §12 — the generated modules load and run in Synthea v4.0.0, and the behavior matches upstream's module (same seed) including the single emergency visit.

---

## 12. Engine test: the converted modules in a real Synthea (v4.0.0)

`npm run synthea:smoke -- <synthea-with-dependencies.jar>` converts the pathways, runs Synthea with only these modules enabled (`-d <dir> -m <main module>`) and fails if Synthea throws or cannot resolve a module; it also prints how many patients got a diagnosis the modules can set. With `--force-diagnosis`, every probability that is read from an attribute named `probability_of_…` is set to 1 (0 for names containing `_no_`) in the written copy of the modules, so that every patient takes the disease and treatment path and the engine really runs it; the script fails if no patient then reaches a diagnosis. With `--trace-submodules`, a marker state (a `ConditionOnset` with an own code) is put at the start of every submodule and after every `CallSubmodule`, and the script counts the patients whose record contains each marker: this shows that Synthea really enters each submodule and comes back from it. In the run with 30 patients and `--force-diagnosis` all four submodules were entered (the anemia submodule by 25 patients, the others by all 31 with a diagnosis) and left again, except the treatment submodule: it has no Terminal state; a patient stays in the treatment cycle until the death that the main module scheduled before the call (the four stage-dependent `Death` states) happens, so the state after the call is never reached. That matches the structure of the upstream module, where the cycle also ends only with death. The run with 30 patients completed without an exception (33 patients with a diagnosis, 22 of them died during the run). Needs Java and the jar from the Synthea releases; not part of `npm run validate`. Used with 400 patients aged 45–65 and the same seed for our modules and for the built-in upstream `lung_cancer` module.

The first run found problems that none of the checks against the documentation or the upstream JSON could have found:

| Found | Cause | Fix |
|---|---|---|
| endless recursion (`StackOverflowError`) in `CallSubmodule` | submodules written flat: Synthea runs every top-level file as a module of its own and only treats files in a *subdirectory* as submodules. The earlier decision "flat is fine" (implicit-rules E) was wrong | submodules are written below the module that calls them and called by path (`layout.mjs`) |
| `anemia == nil` threw "Cannot compare Entry to String" | the condition compared with the *text* "nil"; harmless while the attribute was unset, an error once the anemia state assigns it | operator `is nil`; the converter now rejects `== nil` / `!= nil` |
| 13 instead of 1 lung cancer diagnosis in 400 patients | fixed probabilities instead of the named distribution (`probability_of_lung_cancer`, default 0.0645), and then the branches in the wrong order: Synthea gives the remainder to the last branch, so the attribute was ignored | the four branches use attribute + default, in upstream's order; the converter notes which branch gets the remainder |
| 343 one-day inpatient encounters instead of 43 stays of several days | one threshold (a day) for every delay: the daily delays of the length-of-stay loop ended the encounter | two thresholds, see §4.4 |
| display texts differing from upstream (`100mg`, pain panel) | typed by hand | aligned |
| stays 10 % shorter than upstream (mean 5.98 vs 6.64 days, found with 316 forced diagnoses per variant; 144 h vs 158 h over 9 seeds) | `duration` of procedures was not modeled; Synthea lets a procedure take that much time (radiation 0.5–4 h, hearing test 30 min per treatment day) | `Procedure` duration via the existing `ValueConfig`; with it mean 6.65 vs 6.64 days, median 5.57 vs 5.57 |
| chemotherapy exported as `community` prescription with `medicationCodeableConcept`, upstream `inpatient` with a Medication reference | `administration: true` of the four chemotherapy orders was not modeled | `MedicationConfig.administration` |
| CarePlan without `activity` entries | `activities` (3 SNOMED codes) of the care plan was not modeled | `CarePlanActivity` |

After the first round of fixes the same patient gets the same diagnoses and dies of the same cause as with upstream's module (same seed), per stay the inpatient length (median 120 h vs 129 h, explained below), prescriptions, procedures and pain values match, and the lab reports carry 14.7 results each as upstream. Per treatment cycle 1.05 encounters (upstream 1.07).

**Resolved — the symptom names.** The patient first had 6 emergency visits (upstream 1). Cause: Synthea sends a patient to the emergency room when the *sum* of all symptom values exceeds 500. The upstream `symptom_check` states are named after the diagram labels, but nine of ten have `symptom: "Cough"` and so overwrite each other; ours had ten different names and added up. Decision: the nine `symptomConfig` properties in `lung-cancer/symptom-check-submodule.bpmn` now say `Cough` like upstream, while the labels and state names stay as drawn. Result with the same seed: 1 emergency visit, as upstream. The consequence for modelers: the `symptom` field is what Synthea stores and sums, the label is only a name, and two states with the same `symptom` overwrite each other.

**Second round: nine seeds, then a forced-diagnosis run.** Lung cancer is rare (about 1 in 400 here), so one seed shows one patient. The generated modules and upstream's module were run on the same populations (nine seeds of 3,000 patients aged 45–65, 27,000 per variant, 165 patients with a diagnosis; the raw output is 3 GB per run, so only per-patient summaries were kept). Counts agree within 0.5 % (all diagnosed patients, ours / upstream): encounters 13,806 / 13,816, inpatient 5,371 / 5,391, emergency 165 / 165, procedures 71,813 / 71,698, prescriptions 64,272 / 64,194, imaging 6,384 / 6,352, lab reports 30,166 / 30,233, deaths 113 / 111. Individual patients differ because the random draws drift apart as soon as the two modules draw a different number of values; only distributions are comparable. Two differences were left, and both came from optional fields the first comparison did not look at (it compared state types, codes and values, not every optional field):

**Third round: where the care plan starts, and what `reason` does.** The time lines of single patients (forced diagnosis, 150 patients, both variants started together because Synthea takes the wall-clock time as its end date; otherwise every event is shifted by the start difference) showed that the original starts its care plan in `Diagnosis Encounter IV`, between the stage diagnosis and `MRI Brain`, while the model started it in the first inpatient treatment encounter. A care plan draws random numbers, so its position shifts every later random value: the share of patients with an identical clinical time line rose from 49 % (161 of 331) to 78 % (146 of 188) when the care plan was moved. The model now has it where the original has it (`CarePlanStart: Lung_Cancer_CarePlan` in the main pathway, encounter `Diagnosis_Encounter_IV`). The treatment encounter is therefore entered at one place, so the comparison shows one inpatient `Encounter` less than upstream (upstream has one per cancer type).

Adding `reason` to 18 states of a test copy did not change a single time line (146 of 188 again), so leaving `reason` out costs no behavior, only the references of procedures and prescriptions to the diagnosis in the output. About one patient in five (35 of 188) still drifts apart; it first shows at the anemia check after `Diagnosis Encounter III`. The cause is not found. The anemia module is built from gateways where upstream uses a `complex_transition` and conditional transitions on `Encounter` and `Procedure`; that is a lead, not a result.


1. **Stay length** (median 120 h vs 133 h). To find the cause with more than 54 patients, the probability of lung cancer and of treatment was set to 0.9999 in copies of both modules (about 316 diagnosed patients per variant). Stays: 5.98 vs 6.64 days on average, equal for SCLC and NSCLC, equal gap between stays. Upstream's procedures carry a `duration` (radiation 0.5–4 h, hearing test 30 min, imaging 10–120 min) and Synthea lets the procedure take that time. Adding the durations to the test copy gave 6.65 vs 6.64 days, median 5.57 vs 5.57.
2. **Chemotherapy orders**: `administration: true` in upstream; without it Synthea writes a "community" prescription instead of an inpatient order.

The care plan's `activities` also appeared only in upstream's output. All three are optional in the wiki; they were added to the extension because the original sets them (see the table above). `reason` stays out on purpose. A value of 1.0 for a probability attribute makes the engine fail with a `ClassCastException` (Integer cannot be cast to Double), so test runs use 0.9999; this is an engine quirk, not a module problem. Upstream's second branch of the lung-cancer gateway has the default 0.93355 (sum 0.99805); ours has 0.9355. It does not matter because the last branch receives the remainder.


---

## Decisions

| # | Topic | Status |
|---|---|---|
| 1 | Fields the extension cannot express | **Decided and implemented (phase 4):** field list in §9 is confirmed (required fields verified against the wiki's `(optional)` markers); phases 1–3 run with "unmodeled" notes until phase 4 |
| 2 | State names | **Decided:** BPMN `name` verbatim, `<stateType>_<id>` fallback, id suffix for duplicates |
| 3 | `targetEncounter` | **Decided:** value = target group's `encounterId`, resolved by the tool; error if the group yields more than one `Encounter` copy |
| 4 | Boundary timer `Survival Time elapsed` | **Decided:** the converter rejects boundary events with a clear error; the main pathway is remodeled with `Death` + range before the treatment cycle (needs `ValueConfig` on `Death`, §9) |
| 5 | Encounter `codes` | **Decided and implemented**: attributes on `EncounterContext`, consistent within an `encounterId` group; a default per `encounterClass` only as a fallback with a warning |
| 6 | `value` typing | **Decided:** numeric → number, `true`/`false` → boolean, else string; `is nil` emits no value |
| 7 | Strictness | **Decided:** warnings locally, `--strict` in CI/`validate` after phase 4 |
| 8 | `codes`-based matching in `Observation`/`Active *` conditions | **Decided and implemented**: `codeSystem`, `code`, `codeDisplay` on `synthea:Condition` (all three required when a code is used, alternative to `referencedAttribute`); panel fields, converter (`codes: [{system, code, display}]`), tests and guide are done |
