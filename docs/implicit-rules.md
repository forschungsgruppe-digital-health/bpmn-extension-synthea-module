# BPMN → Synthea: Conversion Rules

Starting point: an arbitrary BPMN diagram (modeled with the `synthea:`, `fhirmap:`, and `term:` extensions) exists and needs to be converted into a Synthea GMF `.json` module.

Core problem: several Synthea states share the same BPMN element (e.g. ten different states all end up as a `TextAnnotation`). The mapping tables below therefore list, per BPMN element, **all** candidate Synthea states plus the **disambiguation signal** the converter uses to decide between them — usually an extension attribute, occasionally a naming convention.

---

## A. The Three Extensions

Before the mapping tables start referencing `fhirmap:resourceType` and friends, a short summary of what each extension supplies (details in `extension/model/synthea.json`, `fhirmap` (package `@forschungsgruppe-digital-health/fhir-mapping`), `term` (package `@forschungsgruppe-digital-health/terminology`)):

- **`synthea:`** — execution semantics: delay values, guard condition + polling behavior, probabilities, encounter constraint, encounter reference. Answers "how does this state behave."
- **`fhirmap:`** — which state *type* is present at all (`fhirmap:resourceType="MedicationRequest"` etc.) — drives the disambiguation in Tables B/B.1. Answers "what kind of thing is this."
- **`term:`** — the clinical code (SNOMED/LOINC/RxNorm/NUBC) that goes into the `codes[]` array. Answers "exactly what it is."

Without all three together, reconversion is not unambiguously possible.

**`synthea:` in detail** — the only one of the three entirely custom-designed for this project, since none of this data is clinical:

| Type | Attributes | Sits on | Why it's needed |
|---|---|---|---|
| `DelayConfig` | `delayShape`, `delayValue`, `delayUnit`, `distributionKind` | Timer intermediate event | carries Synthea's exact/range/distribution shape, which BPMN timers don't natively express |
| `GuardConfig` | `allow` | Exclusive gateway | distinguishes a *polling* gateway (Guard) from a one-shot branching gateway, and carries the actual gate condition. No `reevaluate` field — Guard always re-checks on the module's global simulation tick, not a per-instance interval (no such field exists in Synthea, so a field for it was deliberately not added) |
| `SubmoduleConfig` | `submodule` | Call activity | pins down that a call activity is specifically a Synthea submodule reference — no return-mapping field exists in Synthea, continuation after the submodule just follows the calling state's own `transition` |
| `ProbabilityConfig` | `probability`, `probabilityAttribute`, `probabilityDefault` | Sequence flow | BPMN has no native probabilistic branching — this is the only way to express `distributed_transition` weights |
| `EncounterContext` | `requiresEncounterContext`, `encounterId`, `wellness` | Task / EndEvent / SubProcess / Intermediate event (any state-bearing flow node); still also available on TextAnnotation | marks that a state belongs to a given encounter (`encounterId` groups all member states of one encounter instance) and whether that encounter is a wellness encounter. `Encounter`/`EncounterEnd` are no longer drawn as their own states at all — `tools/bpmn2gmf` derives each `encounterId` group's span and synthesizes them for the JSON output; `wellness` must agree across every member of a group (see lint rule `wellness-consistent-within-encounter`). See [ADR-0002](adr/0002-encounter-as-flow-node.md) (superseded) and [ADR-0003](adr/0003-encounter-context-implicit-scoping.md) (current) |
| `EncounterReference` | `targetEncounter` | Intermediate event (ConditionOnset/AllergyOnset) | Synthea's `target_encounter` field only exists on these two states, not on any other clinical state — see open points |
| `CounterConfig` | `attribute`, `action` (enum `increment`/`decrement`), `amount` | Task (`stateType="Counter"`) | mirrors Synthea's `Counter` state exactly; `action` is a required choice per the wiki, `amount` is optional (defaults to 1 in Synthea if unset here) |
| `SetAttributeConfig` | `attribute` | Task (`stateType="SetAttribute"`) | Synthea's `SetAttribute` state also has a `value`/`valueCode`/`range`/`expression` choice — deliberately out of scope here (the value is clinical/simulation content, not execution semantics), so only the target attribute name is captured |
| `AssignToAttributeConfig` | `attribute` | Task/Intermediate event/TextAnnotation, semantically only `ConditionOnset`/`AllergyOnset`/`MedicationOrder`/`CarePlanStart`/`Device` | Synthea's `assign_to_attribute` is not its own state type — it's an optional field on exactly these five states, letting a later End state reference back via the attribute instead of relying on path order (see open points on ambiguous start/end pairing) |
| `Condition` | `conditionType`, `attribute`, `operator`, `value`, `negate` | nested inside `GuardConfig.allow` or `ConditionConfig.condition` | a flat structured mirror of Synthea's logic vocabulary (see [Logic wiki](https://github.com/synthetichealth/synthea/wiki/Generic-Module-Framework:-Logic)) — deliberately not free text, since free text can't be reliably auto-translated back into a GMF condition object |
| `ConditionConfig` | `condition` (nested `Condition`) | Sequence flow | carries the structured condition for a `conditional_transition` branch; the native BPMN `conditionExpression` on the same flow stays as the human-readable label only |
| `StateType` / `StateTypeConfig` *(added after this document was written; not part of the original `bpmn-js-clinical-semantics` concept sketch)* | `stateType` (enum of all ~30 GMF state names) | any state-bearing flow node (Task / Event / Gateway) | an explicit, closed-vocabulary tag for "which GMF state is this," redundant with but independent of the `fhirmap:resourceType`-driven inference in Tables B/B.1 — kept as a second, directly-checkable signal rather than a replacement for it |

**A note on `synthea:StateType`/`StateTypeConfig`:** unlike the other nine types above, this one does not disambiguate a BPMN element into a Synthea state (that is still `fhirmap:`'s job, per Tables B/B.1) — it lets the modeler *declare* the intended state type directly, as a cross-check. The `state-type-fhirmap-consistent` lint rule verifies that a declared `synthea:stateType` agrees with what `fhirmap:resourceType` would independently imply for the same element, catching mismatches (e.g. a `MedicationOrder`-typed task whose `fhirmap:resourceType` says `Observation`) that the mapping tables alone cannot.

**`fhirmap:` in detail** — conceptually a resource-type mapping (`fhirmap:resourceType="MedicationRequest"` etc.); the real `@forschungsgruppe-digital-health/fhir-mapping` package is actually richer (a `resourceMapping` element with `interaction`, `direction`, and nested `keyElement` bindings), but for BPMN→Synthea disambiguation only the resource type matters — no patient data or clinical values live here. This is the attribute that drives disambiguation throughout the whole mapping table — without it, the BPMN→Synthea direction isn't mechanically resolvable, since a bare `TextAnnotation` is structurally meaningless on its own. Coverage gap: `VitalSign`, `Symptom`, `SetAttribute`, `Counter`, and `Death` have no FHIR resource by design (Synthea doesn't record them to the patient chart, or in `Death`'s case uses `codes`/`condition_onset` directly instead), so this extension structurally cannot disambiguate those five via `fhirmap:` — see open points.

**`term:` in detail** — attaches the coded vocabulary term (`{system, code, display}`) that gives a state clinical meaning beyond its resource type. Kept separate from `fhirmap:`, even though usually on the same element, because the two vary independently: resource type is fixed once the state's type is decided, the code varies per instance.

| Vocabulary | States | Note |
|---|---|---|
| SNOMED CT | ConditionOnset/End, Procedure, ImagingStudy, CarePlanStart/End, Device/DeviceEnd, SupplyList, Encounter, Observation `value_code` | largest share of coverage |
| SNOMED CT or RxNorm | AllergyOnset/End | substance codes may be either; reactions always SNOMED CT |
| LOINC | Observation/MultiObservation/DiagnosticReport | the observation *type*, distinct from its coded value |
| RxNorm | MedicationOrder/MedicationEnd | |
| NUBC | `EncounterEnd.discharge_disposition` | a fourth, narrower vocabulary outside the original three-system scope |

---

## B. Nodes (Flow Nodes)

| BPMN element | Candidate Synthea state(s) | Disambiguation signal | What gets carried into the JSON |
|---|---|---|---|
| Start event | `Initial` | unambiguous, no disambiguation needed | nothing further, plain entry point |
| End event | `Terminal` **or** `Death` | Synthea's `Death` state has no FHIR resource of its own (confirmed against the wiki — it uses `codes`/`condition_onset`/`referenced_by_attribute` directly, not `fhirmap:`), so `fhirmap:resourceType` cannot disambiguate it, unlike most other states; `synthea:StateTypeConfig.stateType="Death"` is the only disambiguation signal, exactly like `VitalSign`/`Symptom`/`SetAttribute`/`Counter`. Absent that, defaults to `Terminal` | for `Death`: SNOMED cause-of-death code from `term:` (first code goes on the death certificate), or a reference to a preceding `ConditionOnset` state / attribute name instead of a code |
| Exclusive gateway **with** `synthea:GuardConfig` | `Guard` | extension attribute `allow` present | `allow` (nested `synthea:Condition` element: `conditionType`/`attribute`/`operator`/`value`); Guard always re-checks on the module's global tick, no per-instance poll interval (no such field in Synthea); like any other state, can also carry a `distributed_transition`/`conditional_transition` (officially documented, see the Age_Guard example) |
| Sequence flow with no intermediate node (a bare connection between two activities with no element of its own) **or** exclusive gateway **without** `synthea:GuardConfig` | `Simple` | no element present (plain pass-through) **or** gateway without `GuardConfig` — both represent a stateless node that only carries a transition | for the plain pass-through: just `type: "Simple"`; for the gateway variant: the transition logic of the outgoing flows (`direct`/`conditional`/`distributed`, see table C) is attached directly to this Simple state |
| Timer intermediate event | `Delay` | unambiguous (only Delay uses timer events) | `synthea:DelayConfig`: `delayShape` (`EXACT`/`RANGE`/`DISTRIBUTION`) determines the JSON shape; `delayValue`/`delayUnit`; when `delayShape="DISTRIBUTION"`, also `distributionKind` (`EXACT`/`GAUSSIAN`/`UNIFORM`/`EXPONENTIAL` — `EXACT` is a valid distribution kind here too, not only a top-level shape) |
| Call activity | `CallSubmodule` | unambiguous (only CallSubmodule uses call activities) | `synthea:submoduleRef` → `submodule`; continuation after the submodule follows the calling state's own `transition` (no return-mapping field in Synthea) |
| Task | `MedicationOrder`, `Procedure`, `ImagingStudy`, `Observation` | `fhirmap:resourceType` value on the task: `MedicationRequest` → MedicationOrder, `Procedure` → Procedure, `ImagingStudy` → ImagingStudy, `Observation` → Observation | codes from the `term:` extension (RxNorm/SNOMED/LOINC depending on type), check the `requiresEncounterContext` flag |
| Sub-process | `MultiObservation`, `DiagnosticReport`, `Physiology` | `fhirmap:resourceType` on the sub-process: `Observation` (multiple) → MultiObservation, `DiagnosticReport` → DiagnosticReport; `fhirmap:resourceType` **absent entirely** → `Physiology` (no FHIR equivalent, external simulation) | for MultiObservation/DiagnosticReport: contained task elements as an `observations` list; for Physiology: name/model reference from free text |
| Intermediate event (non-timer, e.g. a generic intermediate event) | `ConditionOnset`, `ConditionEnd`, `AllergyOnset`, `AllergyEnd` | `fhirmap:resourceType`: `Condition` vs. `AllergyIntolerance` distinguishes diagnosis/allergy; name suffix (`_Onset`/`_End`) or a dedicated boolean attribute distinguishes onset/end | SNOMED code from `term:`; `synthea:EncounterReference.targetEncounter` if present — **only** valid on ConditionOnset/AllergyOnset, not on ConditionEnd/AllergyEnd or any other state (see Section E) |
| Text annotation | `MedicationEnd`, `CarePlanStart`, `CarePlanEnd`, `Device`, `DeviceEnd`, `SupplyList`, `VitalSign`, `Symptom`, `SetAttribute`, `Counter` | see detail table B.1 below — **the biggest source of error**, since one annotation stands in for ten different states | different fields depending on the recognized type, see below |
| *(not a BPMN element — synthesized)* | `Encounter`, `EncounterEnd` | *n/a — these are not drawn at all.* Every clinical state belonging to the encounter carries `synthea:EncounterContext` with a shared `encounterId` (see Section A and [ADR-0003](adr/0003-encounter-context-implicit-scoping.md)) | `tools/bpmn2gmf` takes the first-to-last span of each `encounterId` group (in sequence-flow order) and synthesizes the `Encounter`/`EncounterEnd` JSON states around it; `wellness` comes from the group's (consistent) `EncounterContext.wellness` value |

### B.1 Disambiguating text annotations

Since annotations are the largest collection point, a dedicated table:

| Annotation represents | Recognition signal |
|---|---|
| `MedicationEnd` | `fhirmap:resourceType="MedicationRequest"` **and** no corresponding `MedicationOrder` task at this exact point (rather, earlier in the path) |
| `CarePlanStart` / `CarePlanEnd` | `fhirmap:resourceType="CarePlan"`; start/end paired by order (see open points — unlike `Encounter`/`EncounterEnd`, which are grouped by `encounterId` instead, this pairing has no ID-based alternative yet) |
| `Device` / `DeviceEnd` | `fhirmap:resourceType="Device"`; start/end analogous |
| `SupplyList` | `fhirmap:resourceType="SupplyRequest"` |
| `VitalSign`, `Symptom`, `SetAttribute`, `Counter` | **no** `fhirmap:resourceType` attribute present (these states produce no FHIR record) — distinguishing between them is currently only possible via an informal free-text convention in the note (e.g. prefix "Vital:", "Symptom:", "Set:", "Count:") — **this is not yet formally captured in an extension**, see open points |

---

## C. Edges (Sequence Flows / Transition Type)

| Sequence flow configuration | Synthea transition type | What gets carried into the JSON |
|---|---|---|
| Exactly one outgoing flow, no condition, no probability | `direct_transition` | target state name |
| Multiple outgoing flows, all carrying `synthea:ProbabilityConfig probability="..."` | `distributed_transition` | list of `{transition, distribution}`; check the sum (see lint rule `probability-sum-valid`) |
| Multiple outgoing flows with `synthea:probabilityAttribute` instead of a fixed value | `distributed_transition` with a "named distribution" | `{transition, distribution: {attribute, default}}` |
| Multiple outgoing flows with a `conditionExpression` (native BPMN) **and** `synthea:ConditionConfig.condition` | `conditional_transition` | list of `{condition, transition}` in flow order — `condition` comes from the structured `synthea:Condition`, **not** from parsing the free text of `conditionExpression`: free text can't be reliably translated back automatically. `conditionExpression` stays only as a human-readable on-diagram label |
| One flow with no condition, modeled as the BPMN default flow within a conditional group | last `conditional_transition` element with no `condition` (implicit fallback) | target state with no condition field |
| Conditional flows **without** a default flow | `conditional_transition` with no fallback → Synthea implicitly transitions to `Terminal` when nothing matches | the converter has to **synthesize** this implicit Terminal transition, since it isn't visible in the BPMN |
| Last flow of a `distributed_transition` group without its own `probability` value | implicitly receives the remainder up to 1.0 | `distribution` = 1.0 − sum of the others |

---

## D. Gateway Chains and Complex Logic

Several consecutive `Simple` states (from chained gateways without `GuardConfig`) are the regular way to represent nested condition/probability logic — this is the officially documented purpose of `Simple` ("chain conditional or distributed transitions to represent complex logic"). `complex_transition` (combining conditional and distributed in a single state) is only an optional compaction of this, not a prerequisite — a converter may optionally use it to collapse two chained Simple states into one, but it isn't required for correctness.

---

## E. Open Points

- **Annotation disambiguation without a FHIR resource**: `VitalSign`, `Symptom`, `SetAttribute`, `Counter` have no `fhirmap:resourceType` and are so far only distinguishable via an informal free-text convention. Not robust — should eventually get its own extension attribute (e.g. `synthea:controlStateKind="vitalSign|symptom|setAttribute|counter"`) instead of relying on text parsing.
- **`allow` condition is flat only**: `synthea:Condition` only expresses simple conditions (`conditionType`/`attribute`/`operator`/`value`), no nested combinators (`And`/`Or`/`Not`) like Synthea's real logic vocabulary. Deliberately taken over from the `bpmn-js-clinical-semantics` concept sketch (marked "illustrative only" there too) — a recursive combinator type is still open.
- **`distributionKind` only valid when `delayShape="DISTRIBUTION"`**: the descriptor cannot enforce this dependency (two independent attributes) — also belongs in a not-yet-existing lint rule.
- **Start/end pairing via annotations**: `MedicationOrder`/`MedicationEnd`, `CarePlanStart`/`CarePlanEnd`, `Device`/`DeviceEnd` are currently paired only by order in the path, not by an explicit ID reference. With several similar elements in the same module, this is ambiguous. (`Encounter`/`EncounterEnd` no longer have this problem — resolved via `EncounterContext.encounterId` grouping, see ADR-0003. `synthea:AssignToAttributeConfig` now lets the *start* side of these three pairs — `MedicationOrder`, `CarePlanStart`, `Device` — record an identifying attribute, mirroring Synthea's own `assign_to_attribute` field; how the corresponding End states would reference it back is not yet confirmed against the wiki or modeled here, so the pairing ambiguity is only partially addressed.)
- **Missing transition types**: `lookup_table_transition`, `type_of_care_transition` are not covered in Table C — no BPMN pattern defined for them. (`complex_transition` is no longer a blocker, see Section D.)
- **ConditionOnset/AllergyOnset and `target_encounter`**: `synthea:EncounterReference.targetEncounter` applies exclusively to `ConditionOnset`/`AllergyOnset` (a reference to a possibly-future encounter) — **not** to `ConditionEnd`/`AllergyEnd` or any other clinical state, which instead get attached automatically to whichever `Encounter` was most recently processed (`current_encounter`). How this restriction is enforced in BPMN (e.g. a lint rule analogous to `encounter-context-scope`) is still open.
