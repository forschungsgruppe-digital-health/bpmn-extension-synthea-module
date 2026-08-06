# BPMN → Synthea: Conversion Rules

Starting point: an arbitrary BPMN diagram (modeled with the `synthea:`, `fhir-mapping:`, and `medical-terminology:` extensions) exists and needs to be converted into a Synthea GMF `.json` module.

Core problem: several Synthea states share the same BPMN element (e.g. ten different states all end up as a `TextAnnotation`). The mapping tables below therefore list, per BPMN element, **all** candidate Synthea states plus the **disambiguation signal** the converter uses to decide between them — usually an extension attribute, occasionally a naming convention.

---

## A. The Three Extensions

Before the mapping tables start referencing `fhir:resource` and friends, a short summary of what each extension supplies (details in `extension/model/synthea.json`, `fhir-mapping`, `medical-terminology`):

- **`synthea:`** — execution semantics: delay values, guard condition + polling behavior, probabilities, encounter constraint, encounter reference. Answers "how does this state behave."
- **`fhir-mapping:`** — which state *type* is present at all (`fhir:resource="MedicationRequest"` etc.) — drives the disambiguation in Tables B/B.1. Answers "what kind of thing is this."
- **`medical-terminology:`** — the clinical code (SNOMED/LOINC/RxNorm/NUBC) that goes into the `codes[]` array. Answers "exactly what it is."

Without all three together, reconversion is not unambiguously possible.

**`synthea:` in detail** — the only one of the three entirely custom-designed for this project, since none of this data is clinical:

| Type | Attributes | Sits on | Why it's needed |
|---|---|---|---|
| `DelayConfig` | `delayShape`, `delayValue`, `delayUnit`, `distributionKind` | Timer intermediate event | carries Synthea's exact/range/distribution shape, which BPMN timers don't natively express |
| `GuardConfig` | `reevaluate`, `pollInterval`, `allow` | Exclusive gateway | distinguishes a *polling* gateway (Guard) from a one-shot branching gateway, and carries the actual gate condition |
| `WellnessConfig` | `wellness` | TextAnnotation (Encounter) | marks that this Encounter blocks on the *next scheduled* visit, not any encounter |
| `SubmoduleConfig` | `submoduleRef` | Call activity | pins down that a call activity is specifically a Synthea submodule reference — no return-mapping field exists in Synthea, continuation after the submodule just follows the calling state's own `transition` |
| `ProbabilityConfig` | `probability`, `probabilityAttribute`, `probabilityDefault` | Sequence flow | BPMN has no native probabilistic branching — this is the only way to express `distributed_transition` weights |
| `EncounterContext` | `requiresEncounterContext` | Task / SubProcess / TextAnnotation | encodes the structural rule that certain clinical states must occur inside an Encounter block |
| `EncounterReference` | `targetEncounter` | Intermediate event (ConditionOnset/AllergyOnset) | Synthea's `target_encounter` field only exists on these two states, not on any other clinical state — see open points |

**`fhir-mapping:` in detail** — a thin, one-attribute mapping (`fhir:resource="MedicationRequest"` etc.), not a full FHIR resource serialization; no patient data or clinical values live here. This is the attribute that drives disambiguation throughout the whole mapping table — without it, the BPMN→Synthea direction isn't mechanically resolvable, since a bare `TextAnnotation` is structurally meaningless on its own. Coverage gap: `VitalSign`, `Symptom`, `SetAttribute`, `Counter` have no FHIR resource by design (Synthea doesn't record them to the patient chart), so this extension structurally cannot disambiguate those four — see open points.

**`medical-terminology:` in detail** — attaches the coded vocabulary term (`{system, code, display}`) that gives a state clinical meaning beyond its resource type. Kept separate from `fhir-mapping:`, even though usually on the same element, because the two vary independently: resource type is fixed once the state's type is decided, the code varies per instance.

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
| End event | `Terminal` **or** `Death` | `fhir:resource="Patient.deceased"` present → `Death`; otherwise → `Terminal` | for `Death`: reference to codes (cause of death) if attached to the element |
| Exclusive gateway **with** `synthea:GuardConfig` | `Guard` | extension attributes `reevaluate`/`pollInterval`/`allow` present | `allow` (free-text body holding the condition, e.g. as a serialized JSON-Logic object), `pollInterval`; like any other state, can also carry a `distributed_transition`/`conditional_transition` (officially documented, see the Age_Guard example) |
| Sequence flow with no intermediate node (a bare connection between two activities with no element of its own) **or** exclusive gateway **without** `synthea:GuardConfig` | `Simple` | no element present (plain pass-through) **or** gateway without `GuardConfig` — both represent a stateless node that only carries a transition | for the plain pass-through: just `type: "Simple"`; for the gateway variant: the transition logic of the outgoing flows (`direct`/`conditional`/`distributed`, see table C) is attached directly to this Simple state |
| Timer intermediate event | `Delay` | unambiguous (only Delay uses timer events) | `synthea:DelayConfig`: `delayShape` (`EXACT`/`RANGE`/`DISTRIBUTION`) determines the JSON shape; `delayValue`/`delayUnit`; when `delayShape="DISTRIBUTION"`, also `distributionKind` (`GAUSSIAN`/`UNIFORM`/`EXPONENTIAL`) |
| Call activity | `CallSubmodule` | unambiguous (only CallSubmodule uses call activities) | `synthea:submoduleRef` → `submodule`; continuation after the submodule follows the calling state's own `transition` (no return-mapping field in Synthea) |
| Task | `MedicationOrder`, `Procedure`, `ImagingStudy`, `Observation` | `fhir:resource` value on the task: `MedicationRequest` → MedicationOrder, `Procedure` → Procedure, `ImagingStudy` → ImagingStudy, `Observation` → Observation | codes from the `medical-terminology:` extension (RxNorm/SNOMED/LOINC depending on type), check the `requiresEncounterContext` flag |
| Sub-process | `MultiObservation`, `DiagnosticReport`, `Physiology` | `fhir:resource` on the sub-process: `Observation` (multiple) → MultiObservation, `DiagnosticReport` → DiagnosticReport; `fhir:resource` **absent entirely** → `Physiology` (no FHIR equivalent, external simulation) | for MultiObservation/DiagnosticReport: contained task elements as an `observations` list; for Physiology: name/model reference from free text |
| Intermediate event (non-timer, e.g. a generic intermediate event) | `ConditionOnset`, `ConditionEnd`, `AllergyOnset`, `AllergyEnd` | `fhir:resource`: `Condition` vs. `AllergyIntolerance` distinguishes diagnosis/allergy; name suffix (`_Onset`/`_End`) or a dedicated boolean attribute distinguishes onset/end | SNOMED code from `medical-terminology:`; `synthea:EncounterReference.targetEncounter` if present — **only** valid on ConditionOnset/AllergyOnset, not on ConditionEnd/AllergyEnd or any other state (see Section E) |
| Text annotation | `Encounter`, `EncounterEnd`, `MedicationEnd`, `CarePlanStart`, `CarePlanEnd`, `Device`, `DeviceEnd`, `SupplyList`, `VitalSign`, `Symptom`, `SetAttribute`, `Counter` | see detail table B.1 below — **the biggest source of error**, since one annotation stands in for twelve different states | different fields depending on the recognized type, see below |

### B.1 Disambiguating text annotations

Since annotations are the largest collection point, a dedicated table:

| Annotation represents | Recognition signal |
|---|---|
| `Encounter` | `fhir:resource="Encounter"` **and** no preceding `EncounterEnd` counterpart earlier in the path; `synthea:WellnessConfig.wellness` may be set |
| `EncounterEnd` | `fhir:resource="Encounter"` **and** a preceding `Encounter` annotation exists in the same path (paired by order, not by ID reference) |
| `MedicationEnd` | `fhir:resource="MedicationRequest"` **and** no corresponding `MedicationOrder` task at this exact point (rather, earlier in the path) |
| `CarePlanStart` / `CarePlanEnd` | `fhir:resource="CarePlan"`; start/end paired by order, analogous to Encounter |
| `Device` / `DeviceEnd` | `fhir:resource="Device"`; start/end analogous |
| `SupplyList` | `fhir:resource="SupplyRequest"` |
| `VitalSign`, `Symptom`, `SetAttribute`, `Counter` | **no** `fhir:resource` attribute present (these states produce no FHIR record) — distinguishing between them is currently only possible via an informal free-text convention in the note (e.g. prefix "Vital:", "Symptom:", "Set:", "Count:") — **this is not yet formally captured in an extension**, see open points |

---

## C. Edges (Sequence Flows / Transition Type)

| Sequence flow configuration | Synthea transition type | What gets carried into the JSON |
|---|---|---|
| Exactly one outgoing flow, no condition, no probability | `direct_transition` | target state name |
| Multiple outgoing flows, all carrying `synthea:ProbabilityConfig probability="..."` | `distributed_transition` | list of `{transition, distribution}`; check the sum (see lint rule `probability-sum-valid`) |
| Multiple outgoing flows with `synthea:probabilityAttribute` instead of a fixed value | `distributed_transition` with a "named distribution" | `{transition, distribution: {attribute, default}}` |
| Multiple outgoing flows with a `conditionExpression` (native BPMN) | `conditional_transition` | list of `{condition, transition}` in flow order |
| One flow with no condition, modeled as the BPMN default flow within a conditional group | last `conditional_transition` element with no `condition` (implicit fallback) | target state with no condition field |
| Conditional flows **without** a default flow | `conditional_transition` with no fallback → Synthea implicitly transitions to `Terminal` when nothing matches | the converter has to **synthesize** this implicit Terminal transition, since it isn't visible in the BPMN |
| Last flow of a `distributed_transition` group without its own `probability` value | implicitly receives the remainder up to 1.0 | `distribution` = 1.0 − sum of the others |

---

## D. Gateway Chains and Complex Logic

Several consecutive `Simple` states (from chained gateways without `GuardConfig`) are the regular way to represent nested condition/probability logic — this is the officially documented purpose of `Simple` ("chain conditional or distributed transitions to represent complex logic"). `complex_transition` (combining conditional and distributed in a single state) is only an optional compaction of this, not a prerequisite — a converter may optionally use it to collapse two chained Simple states into one, but it isn't required for correctness.

---

## E. Open Points

- **Annotation disambiguation without a FHIR resource**: `VitalSign`, `Symptom`, `SetAttribute`, `Counter` have no `fhir:resource` and are so far only distinguishable via an informal free-text convention. Not robust — should eventually get its own extension attribute (e.g. `synthea:controlStateKind="vitalSign|symptom|setAttribute|counter"`) instead of relying on text parsing.
- **`allow` condition as free text**: `GuardConfig.allow` is deliberately modeled as a string body rather than a structured type, since Synthea supports many condition types (Age, Gender, Date, Attribute, …). Pragmatic, but not validatable by the descriptor/XSD — correctness of the condition is the job of a lint rule that doesn't exist yet.
- **`distributionKind` only valid when `delayShape="DISTRIBUTION"`**: the descriptor cannot enforce this dependency (two independent attributes) — also belongs in a not-yet-existing lint rule.
- **Start/end pairing via annotations**: `Encounter`/`EncounterEnd`, `MedicationOrder`/`MedicationEnd`, `CarePlanStart`/`CarePlanEnd`, `Device`/`DeviceEnd` are currently paired only by order in the path, not by an explicit ID reference. With several similar elements in the same module, this is ambiguous.
- **Missing transition types**: `lookup_table_transition`, `type_of_care_transition` are not covered in Table C — no BPMN pattern defined for them. (`complex_transition` is no longer a blocker, see Section D.)
- **ConditionOnset/AllergyOnset and `target_encounter`**: `synthea:EncounterReference.targetEncounter` applies exclusively to `ConditionOnset`/`AllergyOnset` (a reference to a possibly-future encounter) — **not** to `ConditionEnd`/`AllergyEnd` or any other clinical state, which instead get attached automatically to whichever `Encounter` was most recently processed (`current_encounter`). How this restriction is enforced in BPMN (e.g. a lint rule analogous to `encounter-context-scope`) is still open.
