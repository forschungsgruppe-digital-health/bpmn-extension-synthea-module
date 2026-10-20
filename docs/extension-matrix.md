# Which `synthea:` type belongs on which BPMN element

A matrix of the 20 `synthea:` types against the BPMN elements they can sit on
(`Condition` shares a row with `ConditionConfig`, which holds it). It answers two questions: **where does the properties panel
offer a type**, and **where does the converter (`tools/bpmn2gmf`) actually read it**.

The clinical code of a state is part of `StateTypeConfig` (`codeSystem`, `code`, `codeDisplay`); the panel shows it as the section "Code" for the state types that carry one.

**Legend**

| Mark | Meaning |
|---|---|
| **P K** | the panel offers it and the converter reads it |
| **P** | the panel offers it, but the converter ignores it or rejects the element |
| **K** | the converter reads it, but the panel offers no group for it |
| — | neither |

"Panel" means `getGroups` in `extension/src/SyntheaPropertiesProvider.js`; many groups also
depend on the chosen state type (last column). The panel shows all of them as collapsible sections
of one group "Synthea"; a mark in the matrix means that section appears. "Converter" means `tools/bpmn2gmf`
(`resolve.mjs`, `emit.mjs`, `transitions.mjs`, `encounters.mjs`, `ir.mjs`).

## 1. The matrix

| `synthea:` type | Start event | End event | Task | Interm. event | Call activity | Sub-process | Gateway | Sequence flow | Text annot. | Panel shows it only for state type |
|---|---|---|---|---|---|---|---|---|---|---|
| `StateTypeConfig` | P K | P K | P K | P K | P K | P K ⁴ | P K | — | — | — |
| `ProbabilityConfig` | — | — | — | — | — | — | — | P K ⁵ | — | — |
| `ConditionConfig` (+ nested `Condition`) | — | — | — | — | — | — | — | P K ⁵ | — | — |
| `GuardConfig` (`allow` is a `Condition`) | — | — | — | — | — | — | P K ¹ | — | — | — |
| `DelayConfig` | — | — | — | P K ² | — | — | — | — | — | — |
| `SubmoduleConfig` | — | — | — | — | P K | P K ⁴ | — | — | — | `CallSubmodule` |
| `EncounterContext` | — | P K | P K | P K | P K | P K | — | — | — | — |
| `EncounterReference` | — | — | P K | P K | — | — | — | — | — | `ConditionOnset`, `AllergyOnset` |
| `CounterConfig` | — | — | P K | — | — | — | — | — | — | `Counter` |
| `SetAttributeConfig` | — | — | P K | — | — | — | — | — | — | `SetAttribute` |
| `AssignToAttributeConfig` | — | — | P K | P K | — | — | — | — | — | `ConditionOnset`, `AllergyOnset`, `MedicationOrder`, `CarePlanStart`, `Device` |
| `ReferencedByAttributeConfig` | — | P K | P K | P K | — | — | — | — | — | `ConditionEnd`, `AllergyEnd`, `MedicationEnd`, `CarePlanEnd`, `DeviceEnd`, `Death` |
| `SymptomConfig` | — | — | P K | P K | — | — | — | — | — | `Symptom` |
| `ObservationConfig` | — | — | P K | P K | — | — | — | — | — | `Observation`, `MultiObservation` |
| `ValueConfig` | — | P K ³ | P K | P K | — | — | — | — | — | `Observation`, `Symptom`, `Death`, `Procedure` |
| `MedicationConfig` | — | — | P K | P K | — | — | — | — | — | `MedicationOrder` |
| `CarePlanActivity` | — | — | P K | P K | — | — | — | — | — | `CarePlanStart` |
| `ImagingStudySeries` | — | — | P K | P K | — | — | — | — | — | `ImagingStudy` |
| `ReportObservation` | — | — | P K | P K | — | — | — | — | — | `DiagnosticReport`, `MultiObservation` |

Footnotes

1. The panel offers the guard group only on an **exclusive** gateway; the converter accepts no other gateway. A Synthea `Guard` waits until its condition holds (and checks again); a gateway without `GuardConfig` (`Simple`) decides at once.
2. Only meaningful on a **timer** event: a timer event becomes a `Delay` state and `DelayConfig` holds how long it waits. The panel shows the Delay section on every intermediate event; a non-timer event needs an explicit state type.
3. On an end event only for `Death`, because an end event can only be `Terminal` or `Death`. Here `ValueConfig` is the **time until death**: an exact value or a range with a unit (for example 2 to 6 years); the patient dies after that time while the module goes on.
4. A sub-process becomes a `CallSubmodule` state; the panel offers only that state type. What is drawn inside it becomes a module of its own that the state calls (note `SUBPROCESS_EXTRACTED`), so a sub-process with content needs no `SubmoduleConfig` (naming one as well is an error) and the panel hides that section; an empty sub-process names a module with `SubmoduleConfig`. A call activity does the same as an empty sub-process and is the plain way to call a module. The five lung cancer models contain no sub-process; their lab reports (`DiagnosticReport`) are tasks, with their values listed as `ReportObservation`.

5. A probability or a condition sits on the **sequence flow** and nowhere else. The converter reads it from the
   outgoing flows of any element (a task or an event as well as a gateway); several flows out of one element
   become one `distributed_transition` or `conditional_transition`.

**Note:** The table shows where a type is meant to sit and where the panel offers it. The converter reads a type on
whatever element carries a state type that needs it, so a diagram written by hand can also hold, for example,
`DelayConfig` on a task with `stateType="Delay"`, `GuardConfig` on a task with `stateType="Guard"`,
or `CounterConfig` / `SetAttributeConfig` on an intermediate event. The panel offers none of these.

The detail types (`Symptom` … `ReportObservation`) are not offered on an end event: the State Type list
there is only `Terminal` and `Death`, so their groups never appear (a value that is already set stays visible).

The replace menu also leaves out the loop and multi-instance toggles (the converter ignores them).

## 2. What each type does

| `synthea:` type | What it does |
|---|---|
| `StateTypeConfig` | Says which Synthea state an element is (`Initial`, `Procedure`, `Delay`, …). It also carries the state's clinical code (`codeSystem`, `code`, `codeDisplay`). |
| `ProbabilityConfig` | Gives a sequence flow a probability ("Probability as" a fixed number, or the value of a patient attribute with a default, which is required). The flows leaving an element become one `distributed_transition`. |
| `ConditionConfig` | Gives a sequence flow a structured condition; the BPMN condition text stays a label. The flows leaving an element become one `conditional_transition`. |
| `Condition` | One condition (attribute, age, gender, observation, … ) with the fields its type needs, and nested conditions for `And`, `Or` and `At Least`. It sits inside a `ConditionConfig` or a `GuardConfig`. |
| `GuardConfig` | Holds the condition (`allow`) of a `Guard` state, which waits until the condition is true. It sits on an exclusive gateway. |
| `DelayConfig` | Sets how long a `Delay` state waits: one value or a range, with a unit. It sits on a timer event. |
| `SubmoduleConfig` | Names the Synthea submodule that a `CallSubmodule` state calls. It sits on a call activity, or on an empty sub-process. |
| `EncounterContext` | Marks the states of one visit with a shared `encounterId`; the converter creates the `Encounter` and `EncounterEnd` states from the group. It also holds the visit's class, code, reason and whether it is a wellness visit. |
| `EncounterReference` | Names the future encounter at which a `ConditionOnset` or `AllergyOnset` is diagnosed (`target_encounter`). It is valid only on those two states. |
| `CounterConfig` | Describes a `Counter` state: which attribute it counts and whether it increments or decrements, by an optional amount. |
| `SetAttributeConfig` | Describes a `SetAttribute` state: which attribute it sets, and "Value as" a fixed value, a copy of another attribute or a value drawn from a distribution (exact, uniform, Gaussian, exponential). The lung cancer models draw the length of stay from a distribution. |
| `AssignToAttributeConfig` | Lets a start state (diagnosis, medication order, care plan, device) store what it created under an attribute name. A later end state can point back to it. |
| `ReferencedByAttributeConfig` | Lets an end state name the attribute under which its start state stored the entity, so the pair is unambiguous. On `Death` it names the diagnosis that counts as the cause. |
| `SymptomConfig` | Gives a `Symptom` state the symptom name Synthea tracks, which is required; the element's label is not used. |
| `ObservationConfig` | Gives an `Observation` or `MultiObservation` state its HL7 category (`vital-signs`, `laboratory`, …), which Synthea requires. |
| `ValueConfig` | Sets a number or a range, with a unit, for an observation value, a symptom severity, the time until death or a procedure's duration. |
| `MedicationConfig` | Marks that a `MedicationOrder` is given during the encounter (`administration`) and not only prescribed. |
| `CarePlanActivity` | Lists an activity (SNOMED code and text) of a `CarePlanStart`; there can be several. |
| `ImagingStudySeries` | Describes one series of an `ImagingStudy` (body site, modality, kind of image, number of instances); a study needs at least one. |
| `ReportObservation` | Lists one contained value of a `DiagnosticReport` or `MultiObservation` (a single value of a lab panel or a blood pressure panel), as a range, a coded value or a vital sign. Synthea embeds these in the state itself. |

## 3. Elements the converter does not accept

| BPMN element | Converter | Panel |
|---|---|---|
| Boundary event | error `BOUNDARY_EVENT_UNSUPPORTED` | no `synthea:` groups; the replace menu does not offer the boundary variants (it is still possible to drop an event onto a task) |
| Inclusive, parallel, complex, event-based gateway | error `UNSUPPORTED_ELEMENT` | no `synthea:` groups; the replace menu no longer offers them (`SyntheaReplaceMenuFilter`). Existing ones in an imported diagram stay visible. |
| Text annotation | ignored (not a flow element) | no `synthea:` groups |
| Data object, data store | ignored | no `synthea:` groups |
| Ad-hoc sub-process, transaction, event sub-process | error `UNSUPPORTED_ELEMENT` | no `synthea:` groups; not offered in the replace menu |

A **sub-process** is accepted: its content becomes a module of its own and it becomes the `CallSubmodule` state that calls it (see footnote 4).

On the fields that exclude each other the panel clears what no longer applies: the high value when a delay or a value is set to exact, the class and code of an encounter when it is a wellness encounter, and the code when an end state or `Death` is named by an attribute.

The panel's State Type list is limited per element to what the converter accepts: start event `Initial`, end event `Terminal`/`Death`, exclusive gateway `Simple`/`Guard`, call activity `CallSubmodule`, sub-process `CallSubmodule`; a task takes every type except `Initial`, `Terminal`, `CallSubmodule`, `Guard` and `Delay`, which have elements of their own. A value that is already set stays selectable.

`AllergyOnset`, `AllergyEnd`, `VitalSign`, `SupplyList` and `Physiology` are not offered: the extension has no fields for them (an allergy needs `allergy_type` and `category`), so the converter could only write an incomplete state (reported as missing fields) or reject it (`Physiology`).

## 4. What the matrix shows

- **Start event and gateway:** the panel offers the State Type there as well, because the converter reads it (without it a start event is `Initial` and a gateway `Simple` or `Guard`).
- **Which state types a node kind may carry is fixed in the converter:** start `Initial`, end `Terminal`/`Death`, gateway `Simple`/`Guard`, call activity `CallSubmodule`, sub-process `CallSubmodule`, timer event `Delay`. Task and other events take any other state type (`resolve.mjs`, `ALLOWED_BY_KIND` and `infer`).
- **Detail types are not offered on an end event:** the State Type list there is only `Terminal` and `Death`, and the converter allows no other type on an end event.

## 5. Sources and how this was derived

- Panel column: `getGroups` and `createStateDetailGroups` in `extension/src/SyntheaPropertiesProvider.js`, plus `appliesTo` and the `*_STATE_TYPES` lists.
- Converter column: where `emit.mjs`, `resolve.mjs`, `transitions.mjs`, `ir.mjs` and `encounters.mjs` read each type, and which node kinds `ir.mjs` accepts.
- "Sits on" per type: `docs/implicit-rules.md`, section A.
- Checked in the demo: a task with every one of the 28 state types that were offered at the time, the start event, the exclusive gateway, the call activity, the end event, the text annotation and a sub-process (loaded from the draft in `drafts/`). An intermediate event was checked with every one of the 28 state types, and 40 sequence flows (probability, condition, and the combinators with their three sub-condition sections). The converter column was read from the code and, for intermediate and end events, run on small diagrams (a type on an event that the panel does not offer, such as `SetAttribute` or `Counter`, converts); not every cell has a test of its own.
- Not generated by a script. When a type, a panel group or an emitter changes, update this table by hand.
