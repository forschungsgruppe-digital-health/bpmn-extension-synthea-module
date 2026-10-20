# Which `synthea:` type belongs on which BPMN element

A matrix of the 21 `synthea:` types (plus the nested `Condition`) against the BPMN
elements they can sit on. It answers two questions: **where does the properties panel
offer a type**, and **where does the converter (`tools/bpmn2gmf`) actually read it**.

`fhirmap:` and `term:` are not part of this matrix (they were removed from this repository and live as separate extensions).

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
| `ProbabilityConfig` | — | — | — | — | — | — | — | P K | — | — |
| `ConditionConfig` (+ nested `Condition`) | — | — | — | — | — | — | — | P K | — | — |
| `GuardConfig` (`allow` is a `Condition`) | — | — | — | — | — | — | P K ¹ | — | — | — |
| `DelayConfig` | — | — | — | P K ² | — | — | — | — | — | — |
| `SubmoduleConfig` | — | — | — | — | P K | P K ⁴ | — | — | — | `CallSubmodule` |
| `EncounterContext` | — | P K | P K | P K | P K | P K | — | — | — | — |
| `EncounterReference` | — | — | P K | P K | — | — | — | — | — | `ConditionOnset`, `AllergyOnset` |
| `CounterConfig` | — | — | P K | — | — | — | — | — | — | `Counter` |
| `SetAttributeConfig` | — | — | P K | — | — | — | — | — | — | `SetAttribute` |
| `DistributionConfig` | — | — | P K | — | — | — | — | — | — | `SetAttribute` |
| `AssignToAttributeConfig` | — | — | P K | P K | — | — | — | — | — | `ConditionOnset`, `AllergyOnset`, `MedicationOrder`, `CarePlanStart`, `Device` |
| `ReferencedByAttributeConfig` | — | P K | P K | P K | — | — | — | — | — | `ConditionEnd`, `AllergyEnd`, `MedicationEnd`, `CarePlanEnd`, `DeviceEnd`, `Death` |
| `SymptomConfig` | — | P | P K | P K | — | — | — | — | — | `Symptom` |
| `ObservationConfig` | — | P | P K | P K | — | — | — | — | — | `Observation` |
| `ValueConfig` | — | P K ³ | P K | P K | — | — | — | — | — | `Observation`, `Symptom`, `Death`, `Procedure` |
| `MedicationConfig` | — | P | P K | P K | — | — | — | — | — | `MedicationOrder` |
| `CarePlanActivity` | — | P | P K | P K | — | — | — | — | — | `CarePlanStart` |
| `ImagingStudySeries` | — | P | P K | P K | — | — | — | — | — | `ImagingStudy` |
| `ReportObservation` | — | P | P K | P K | — | P K | — | — | — | `DiagnosticReport` |

Footnotes

1. The panel offers the guard group only on an **exclusive** gateway; the converter accepts no other gateway.
2. In practice only on a **timer** event (`Delay`). A non-timer intermediate event needs an explicit state type.
3. On an end event only for `Death` (an end event can only be `Terminal` or `Death`).
4. A sub-process is one state of type `DiagnosticReport`, `MultiObservation` or `CallSubmodule` (the last when a sub-process stands for a separate module, as in the draft and the mihub models); the panel offers only these three. What the sub-process contains is not converted (note `SUBPROCESS_CONTENT_IGNORED`): contained observations belong in `ReportObservation`.

The detail types (`Symptom` … `ReportObservation`) are offered on end events by the panel only
once a state type is chosen; the converter allows just `Terminal` and `Death` there, so they
have no effect on an end event (hence **P**).

The replace menu also leaves out the loop and multi-instance toggles (the converter ignores them).

## 2. Elements the converter does not accept

| BPMN element | Converter | Panel |
|---|---|---|
| Boundary event | error `BOUNDARY_EVENT_UNSUPPORTED` | no `synthea:` groups; the replace menu does not offer the boundary variants (it is still possible to drop an event onto a task) |
| Inclusive, parallel, complex, event-based gateway | error `UNSUPPORTED_ELEMENT` | no `synthea:` groups; the replace menu no longer offers them (`SyntheaReplaceMenuFilter`). Existing ones in an imported diagram stay visible. |
| Text annotation | ignored (not a flow element) | no `synthea:` groups |
| Data object, data store | ignored | no `synthea:` groups |
| Ad-hoc sub-process, transaction, event sub-process | error `UNSUPPORTED_ELEMENT` | no `synthea:` groups; not offered in the replace menu |

The embedded **sub-process** is accepted as one state (`DiagnosticReport`, `MultiObservation` or `CallSubmodule`).

The panel's State Type list is limited per element to what the converter accepts: start event `Initial`, end event `Terminal`/`Death`, exclusive gateway `Simple`/`Guard`, call activity `CallSubmodule`, sub-process `DiagnosticReport`/`MultiObservation`. A value that is already set stays selectable.

## 3. What the matrix shows (gaps)

- **The start event and the gateway offer the State Type group** (since 2026-10-12): the converter reads `StateTypeConfig` there; without it a start event is `Initial` and a gateway `Simple` or `Guard`.
- **Which state types a node kind may carry is fixed in the converter:** start `Initial`, end `Terminal`/`Death`, gateway `Simple`/`Guard`, call activity `CallSubmodule`, sub-process `DiagnosticReport`/`MultiObservation`/`CallSubmodule`, timer event `Delay`. Task and other events take any other state type (`resolve.mjs`, `ALLOWED_BY_KIND` and `infer`).
- **Detail types on an end event have no effect** (the converter allows only `Terminal` and `Death` there); the panel limits the list, so only `Death`'s sections appear.

## 4. Sources and how this was derived

- Panel column: `getGroups` and `createStateDetailGroups` in `extension/src/SyntheaPropertiesProvider.js`, plus `appliesTo` and the `*_STATE_TYPES` lists. Task, flow, gateway, start event and intermediate event were also checked in the demo (07./08.10.).
- Converter column: where `emit.mjs`, `resolve.mjs`, `transitions.mjs`, `ir.mjs` and `encounters.mjs` read each type, and which node kinds `ir.mjs` accepts.
- "Sits on" per type: `docs/implicit-rules.md`, section A.
- Not generated by a script. When a type, a panel group or an emitter changes, update this table by hand.
