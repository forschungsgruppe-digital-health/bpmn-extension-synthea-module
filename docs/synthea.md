# Synthea: Concepts and Relevance to the MiHUB Lung Cancer Pathway

> **Purpose.** A self-contained introduction to Synthea and its Generic Module Framework (GMF) for a reader who knows the MiHUB lung cancer pathway project but not necessarily Synthea. This is the accessible entry point. The concrete engineering plan, the full BPMN/GMF mapping with citations, the data source catalog and the tracked model-readiness findings each live in their own document ([§6](#sec-6)) and are linked here instead of repeated.

> **Status:** Draft v0.1. This document lives in [`bpmn-extension-synthea-module`](https://github.com/forschungsgruppe-digital-health/bpmn-extension-synthea-module/tree/main/docs). The companion documents live in the separate [`mihub-lung-cancer-pathway`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/tree/research/synthea-dataset-generation/docs) repository: [`synthea-and-bpmn-primer.md`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/research/synthea-dataset-generation/docs/synthea-and-bpmn-primer.md) (the detailed mapping) and [`synthea-dataset-generation-plan.md`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/research/synthea-dataset-generation/docs/synthea-dataset-generation-plan.md) (the execution plan).

---

<a id="sec-1"></a>
## 1. What is Synthea?

Synthea [[4]](#ref-4) ("Synthea™ Patient Generator") is an open-source synthetic patient population simulator developed at MITRE. It simulates the whole life of a fictional patient (birth, aging, diseases, treatments and death) and writes the result out as realistic, but completely fake, electronic health records (FHIR, CSV, C-CDA and others). Because no real person is involved, the data carries no privacy risk and can be shared, published and used to develop and test software freely (Walonoski et al., 2018 [[1]](#ref-1)).

The mental model has four parts:

1. **Agent-based, time-stepped simulation.** Each synthetic person is advanced through time in fixed steps (7 days by default). At every step, every active module runs.
2. **Modules are state machines.** Synthea's Generic Module Framework (GMF) describes a disease or care process as a JSON graph of states (e.g. start an encounter, onset a condition, order a medication) connected by transitions. The synthetic person "walks" this graph over simulated time (Synthea GMF wiki [[5]](#ref-5)).
3. **Person attributes are the shared memory.** Modules do not talk to each other directly; they read and write named values on the person (e.g. `smoker`, `lung_cancer_stage`). Attributes are the wiring that lets one module react to another.
4. **Exporters** turn the accumulated record into output formats, by default FHIR R4 (with US Core profiles).

Modules are authored visually in the Synthea Module Builder [[10]](#ref-10), without hand-editing JSON.

> **Validation caveat.** An independent validation found that Synthea reproduces demographics and the probability of receiving services reliably, but does not realistically model post-diagnosis outcomes or deviations from guideline-concordant care (Chen et al., 2019 [[2]](#ref-2)). This matters for us: a lung-cancer cohort will look plausible at the population level, but realism of disease trajectories must be engineered deliberately. Deliberately engineered heterogeneity (non-adherence, comorbidity, recurrence, loss to follow-up), calibrated against registry benchmarks, has to be added on top of a literal guideline translation ([§5](#sec-5), point 8).

---

<a id="sec-2"></a>
## 2. Core concepts: how Synthea works

<a id="sec-2-1"></a>
### 2.1 The Generic Module Framework (GMF)

The Generic Module Framework [[5]](#ref-5) is Synthea's mechanism for defining disease and care logic declaratively, in JSON, instead of in Java code. A module describes a progression of states and the transitions between them, similar to a state machine or flowchart. At every simulation time step, Synthea's engine (`Module.java`) walks each active module state by state: it evaluates the current state, applies any effect it has on the patient record, then follows a transition to the next state.

A minimal module looks like this:

```json
{
  "name": "Ear Infection Example",
  "states": {
    "Initial": {
      "type": "Initial",
      "direct_transition": "Delay_For_Encounter"
    },
    "Terminal": {
      "type": "Terminal"
    }
  }
}
```

Every module requires exactly one `Initial` state (the entry point) and typically at least one `Terminal` state, a dead end for that branch of logic. Reaching it does not end the simulated patient's life, only that module's involvement. States are referenced by name and, by convention, use `Upper_Snake_Case`; state names must be unique within a module. The one exception that cuts across module boundaries is `Death`. Once a `Death` state is reached, the patient's death immediately halts every module the patient is running, including modules other than the one that triggered it.

Modules can read and write attributes, arbitrary key/value data attached to the patient such as a tumor stage or a flag that a biomarker test was positive, which lets later states, or even other modules, branch on information established earlier in the simulation. Synthea processes many modules per patient concurrently, all reading and writing the same shared patient attributes.

<a id="sec-2-2"></a>
### 2.2 States: control states vs. clinical states

GMF states fall into two categories (Synthea GMF: States wiki [[6]](#ref-6)).

**Control states** govern the flow of the module itself and do not, by themselves, add anything to the patient's medical record:

| State | Purpose |
|---|---|
| `Initial` | Unique entry point of the module |
| `Terminal` | End of a module branch, no further transitions allowed |
| `Simple` | No-op state, used to structure branching logic |
| `Guard` | Blocks progression until a logical condition (`allow`) becomes true, re-evaluated on every time step until it passes (in contrast to a one-time conditional transition) |
| `Delay` | Introduces an exact or randomly distributed waiting period (e.g., "3-5 months") before continuing |
| `SetAttribute` | Sets, overwrites, or clears a patient attribute |
| `Counter` | Increments or decrements a numeric attribute (e.g., counting chemotherapy cycles) |
| `CallSubmodule` | Invokes a reusable submodule inline, in the same time step; execution returns to the calling module once the submodule reaches its `Terminal` state |

`Delay`'s waiting period can be given as an exact quantity or a low/high range. In the newer GMF v2 syntax it can instead be sampled from a named `distribution.kind`: `EXACT`, `GAUSSIAN`, `UNIFORM`, or `EXPONENTIAL`, letting timing follow a specific statistical shape (e.g. a bell-curve time-to-progression) instead of a flat range.

**Clinical states** represent medically meaningful events and are what populates the patient's exported health record:

| State | Purpose |
|---|---|
| `Encounter` / `EncounterEnd` | A clinical visit (wellness, ambulatory, emergency, urgent care, inpatient); most other clinical states must occur between an `Encounter` and its `EncounterEnd` |
| `ConditionOnset` / `ConditionEnd` | A diagnosis begins or resolves, can be recorded immediately or deferred to a future encounter |
| `AllergyOnset` / `AllergyEnd` | An allergy or intolerance begins or resolves, optionally with weighted reaction severities |
| `MedicationOrder` / `MedicationEnd` | A medication is prescribed (with dosage, frequency, duration, refills) or discontinued |
| `CarePlanStart` / `CarePlanEnd` | A structured care plan with activities and goals begins or ends |
| `Procedure` | A clinical procedure is performed, with an optional duration |
| `ImagingStudy` | An imaging study (modality, body site, DICOM metadata) is recorded |
| `Device` / `DeviceEnd` | A device (e.g., a port, a prosthesis) is associated with or removed from the patient |
| `Observation` / `MultiObservation` / `DiagnosticReport` | A single measurement, a composite measurement (e.g., blood pressure), or a grouped panel of measurements (e.g., a lab panel) is recorded |
| `VitalSign` | Sets an internal physiological value (not directly recorded) that other logic can reference |
| `Symptom` | Adds or updates a symptom severity (0-100), which can itself drive encounter-seeking behavior |
| `Death` | Immediate or delayed death with an optional cause-of-death reference |

Every clinical state that carries a code (`Encounter`, `ConditionOnset`, `Procedure`, `MedicationOrder`, `Observation`, `ImagingStudy`, etc.) references standard terminologies: SNOMED CT for conditions/procedures/encounters, RxNorm for medications, LOINC for observations/labs and DICOM for imaging metadata.

<a id="sec-2-3"></a>
### 2.3 Transitions

Transitions [[7]](#ref-7) determine which state is processed next and are attached to the source state (not modeled as separate objects). Six kinds exist:

- **`direct_transition`**: unconditionally moves to a single named state.
- **`distributed_transition`**: moves to one of several states based on a fixed probability distribution (e.g., 15%/55%/30%; weights should sum to 1.0; if they sum to less than 1.0, the remainder goes to the last branch, and if they sum to more, surplus branches are ignored [[7]](#ref-7)). Probabilities can also be named, read from a patient attribute at runtime instead of being hard-coded.
- **`conditional_transition`**: evaluates an ordered list of logical conditions and takes the first one that is true, with an optional fallback, evaluated once.
- **`complex_transition`**: combines conditional branching with a probability distribution within each branch (e.g., "if male: 15% drug A, 85% drug B; if female: drug C").
- **`lookup_table_transition`**: reads transition probabilities from an external CSV keyed by patient attributes such as age, gender, or race, for cases where probabilities vary widely across population segments and are more conveniently maintained as a data table than inline JSON.
- **`type_of_care_transition`** (experimental): routes to an ambulatory, emergency, or telemedicine encounter based on configured, insurance- and time-sensitive weightings.

A related but distinct mechanism is the `Guard` state ([§2.2](#sec-2-2)), which re-tests its condition every time step rather than deciding once. This is useful for "wait until age 45" or "wait until this lab value normalizes" logic that must survive across many simulated years.

A structural point that matters when translating from a process diagram: GMF execution is single-token and sequential. A module has no native fork or join. There is no construct that starts two branches concurrently and later synchronizes them. This has direct consequences for mapping BPMN's parallel and inclusive gateways ([§4](#sec-4)).

<a id="sec-2-4"></a>
### 2.4 Logic conditions

Both `conditional_transition`/`complex_transition` and `Guard.allow` are built from a shared library of logical condition types (Synthea GMF: Logic wiki [[8]](#ref-8)), including boolean combinators (`And`, `Or`, `Not`), demographic tests (`Gender`, `Age`, `Race`, `Socioeconomic Status`), clinical-state tests (`Active Condition`, `Active Medication`, `Active CarePlan`, `Observation`, `Vital Sign`, `Symptom`), attribute tests and simulation-time tests (`Date`, `PriorState`, `True`/`False`). This is effectively Synthea's rule engine: the same building blocks are used both to gate progression (`Guard`) and to branch (conditional/complex transitions).

> Note the trap in the naming. The `Or` logic condition is a boolean test used inside a condition expression. It is not a process-level OR-split: GMF has no construct that activates multiple downstream branches at once ([§4](#sec-4)).

<a id="sec-2-5"></a>
### 2.5 Submodules

For logic that recurs across many modules, for example administering a chemotherapy cycle or conducting a tumor board discussion, Synthea supports submodules [[9]](#ref-9): ordinary GMF modules invoked via a `CallSubmodule` state instead of run as top-level modules. Execution happens synchronously, in the same time step; once the submodule reaches its `Terminal` state, control returns to the caller. This is Synthea's primary reuse mechanism and the GMF concept with the closest BPMN analog ([§4](#sec-4)).

<a id="sec-2-6"></a>
### 2.6 A note on what Synthea does not automate

**Synthea does not derive transition probabilities from clinical guidelines, literature, or population statistics automatically.** Every `distributed_transition`, `complex_transition` and `lookup_table_transition` probability is a number that a module author has manually researched and entered. Synthea's own shipped modules document this in their `remarks` fields with citations. Building a Synthea module for a new pathway is therefore itself a modeling and evidence-gathering exercise.

---

<a id="sec-3"></a>
## 3. Tooling and output formats

**Authoring and pipeline tools:**

- **Module Builder** [[10]](#ref-10): a web-based visual editor for GMF modules, aimed at clinicians and other domain experts without a programming background. Modules are edited as a flowchart of states and transitions and exported as JSON.
- **CLI (`run_synthea`)**: the primary way to run a simulation, `./run_synthea [state [city]]`, with options for population size, random seed, age/gender filters, a fixed reference date and custom/local module directories (`-d`), among others.
- **Flexporter** [[11]](#ref-11): a post-processing step that transforms already-generated FHIR bundles (e.g., applying different profiles, or remapping codes via FHIR ConceptMaps) without re-running the simulation.
- **Graphviz rules diagrams** (`./gradlew graphviz`): renders existing modules as visual state diagrams for inspection, generated mechanically from the JSON.
- **`./gradlew concepts` / `./gradlew attributes`**: introspection tasks listing all clinical codes, respectively all patient attributes, referenced across the loaded modules.

**Output formats**, configured via `src/main/resources/synthea.properties` or CLI flags:

| Format | Notes |
|---|---|
| HL7 FHIR (R4, STU3, DSTU2) | Primary, most actively maintained export target; R4 uses US Core profiles by default |
| Bulk FHIR (ndjson) | For bulk-import/bulk-export style FHIR workflows |
| C-CDA | Consolidated CDA documents |
| CSV | Flat, denormalized tables per resource type, convenient for direct analysis without a FHIR server |
| CPCDS | Common Payer Consumer Data Set (claims-oriented) |
| OMOP CDM | Via the separate OHDSI ETL-Synthea tool [[12]](#ref-12); not built into Synthea itself |
| JSON (internal) | Synthea's own internal patient record representation |

---

<a id="sec-4"></a>
## 4. Outlook: Synthea and BPMN

Both the Generic Module Framework and BPMN 2.0 (the notation used throughout this repository) describe a process as a graph of nodes connected by flows, with branching, looping and sub-process reuse. That surface-level similarity is real: process graphs of this kind map cleanly onto formal execution models, and BPMN itself has documented formal semantics and known mappings to executable models such as Petri nets (Dijkman, Dumas & Ouyang, 2008 [[3]](#ref-3)). Translating a BPMN pathway into a Synthea state machine is fundamentally a structural transformation. The two languages were built for different jobs, though, and the differences matter more than the similarities once logic actually has to move between them.

<a id="sec-4-1"></a>
### 4.1 Concept mapping

**Fit** legend: ✅ direct, ⚠️ works with a caveat, ❌ no native equivalent (must be worked around).

| BPMN concept | Closest GMF construct | Fit | What a modeler must know |
|---|---|---|---|
| Start Event | `Initial` (+ `Guard`/`Delay` for the entry condition) | ⚠️ | A module has exactly one `Initial`, which performs no logic itself; entry criteria (age, risk) go in a following `Guard`/`Delay` |
| End Event | `Terminal` (or `Death` if clinically terminal) | ⚠️ | `Terminal` ends only this module, not the patient or other modules; use `Death` only for genuinely lethal endings |
| Sequence Flow | Transition (`direct_transition` or the condition/distribution on the source state) | ✅ | In GMF a transition is a property of the source state, not a standalone edge |
| Exclusive (XOR) Gateway | `conditional_transition` (rule-based) or `distributed_transition` (probabilistic) | ⚠️ | These mean different things: a deterministic decision maps to `conditional_transition`, a population split maps to `distributed_transition` ([§5](#sec-5), point 5) |
| Parallel (AND) Gateway | *(none)*: linearize the branches or factor them into sequential `CallSubmodule`s | ❌ | GMF is single-token/sequential; there is no fork/join |
| Inclusive (OR) Gateway | *(none)*: emulate with a chain of independently guarded paths | ❌ | No OR-split activates several branches at once. (The `Or` logic condition is a boolean test used inside expressions, unrelated to this gateway type.) |
| Timer / Intermediate Event | `Delay` | ⚠️ | Maps well to a timer; a message/signal catch has no `Delay` equivalent, so use a `Guard` on an attribute instead |
| Task (clinical) | Typed state: `Encounter`, `ConditionOnset`, `Procedure`, `MedicationOrder`, `Observation`, `DiagnosticReport`, `CarePlanStart` | ⚠️ | Most must sit inside an `Encounter`...`EncounterEnd` bracket, often need a paired end state and require a terminology code; one task may become several GMF states |
| Call Activity / Sub-process | `CallSubmodule` | ⚠️ | Strong match for a reusable sub-pathway, runs synchronously in the same time step and returns |
| Data Object | Person attribute, via `SetAttribute` (write) / `Attribute` logic (read); `Counter` for numbers | ⚠️ | Attributes are a flat, person-wide key/value store, with no token-local scope or typed lifecycle |
| Lane / Pool | *(none)* | ❌ | GMF models a single patient's record; there are no swimlanes, participants, or cross-pool messaging |
| `Physiology` state (ODE-based physiological models) | *(none)* | ❌ | Internal simulation mechanics with no real-world process counterpart |

<a id="sec-4-2"></a>
### 4.2 Where the paradigms diverge

**Purpose:** GMF exists to generate plausible synthetic longitudinal records for a population of virtual patients, by simulation. BPMN exists to document and, optionally, orchestrate real-world work. A GMF module answers "what happens to a representative population of patients over years, given known epidemiology?" A BPMN diagram in this repository answers "what should happen to this patient and who does what, when, in the real care system?" These are different questions, even though they concern the same clinical territory.

**Probability vs. decision logic:** Probabilistic branching (`distributed_transition`, `lookup_table_transition`) is central to GMF: it is how population-level realism is achieved from a single module definition. BPMN gateways have no native probability semantics; an Exclusive Gateway is driven by a condition that is true or false for one case, not by a population-level split. Where GMF says "30% of patients receive treatment X," a faithful BPMN reading of the decision would instead say "treatment X is given if biomarker Y is positive and ECOG status is ≤ 1." BPMN wants the deterministic clinical rule that produces the split. For each branch, a modeler has to decide explicitly which one applies ([§5](#sec-5), point 5); conflating them silently changes the model's meaning.

**Concurrency:** GMF is single-token and sequential; there is no fork/join. A BPMN AND-split with a matching join has no direct GMF counterpart. The branches must be linearized (if order does not matter) or refactored into separately, sequentially invoked submodules. An inclusive (OR) gateway is worse: GMF has no construct that activates multiple downstream branches at once.

**Time semantics:** GMF simulates fixed time steps over a patient's entire life, with waiting, aging and recurring wellness encounters as first-class concepts (`Delay`, `Guard`, `wellness` encounters). BPMN process instances are typically case-scoped and use Timer Events for delays, but have no built-in notion of simulating a case forward year by year. The MiHUB overarching pathway spans a full patient journey, screening through aftercare, which is closer to GMF's time horizon than a typical single BPMN case. This is one reason the pathway is modeled as multiple linked sub-pathways.

**Actors and responsibility:** BPMN's pools/lanes explicitly assign responsibility (primary care physician, tumor board, specialist, patient), which is structurally central to BPMN and to this project's cross-sectoral focus. GMF has no actor model at all; it is written entirely from the perspective of a single simulated patient's record, with no representation of who performs an encounter, refers a case, or hands off care.

**Guards vs. gateways:** A `Guard` state is re-evaluated on every simulation time step until it passes, functioning as a polling wait. There is no clean single-gateway BPMN equivalent; the nearest patterns are an Event-based Gateway combined with a timer/signal, or an explicit monitoring loop. Treating a `Guard` as an ordinary Exclusive Gateway would lose its "wait, don't just branch away" semantics.

**Decision.** This project models `Guard` as an Exclusive Gateway carrying a `synthea:GuardConfig` extension (`reevaluate`, `allow`), not as an Event-based Gateway/timer-signal loop. The alternative pattern was evaluated and rejected: it trades a real problem (the notation doesn't visually distinguish "wait" from "branch") for two new ones — an Event-based Gateway implies a race between competing events, which a Guard's single always-re-tested condition is not, and a multi-element loop breaks the one-BPMN-element-per-GMF-state correspondence the conversion pipeline relies on, which is more failure-prone to transpile correctly than a single annotated gateway. Since conversion reliability into Synthea is this project's top priority, structural simplicity and 1:1 state correspondence were weighted above on-diagram readability without tooling. The readability gap is intended to be closed separately, via a custom renderer for `Guard`-flagged gateways in the modeler (e.g. a distinct icon), rather than by introducing additional BPMN structure. Guards are how this project's planned entry criteria (age, smoking history for the screening gate) are meant to be encoded.

**Terminology binding:** GMF states are tightly bound to specific coding systems by state type (SNOMED for conditions/procedures/encounters, RxNorm for medications, LOINC for observations). This makes GMF a domain-specific process language for clinical event generation. BPMN is domain-agnostic; clinical codes have to be attached deliberately, which is the gap this project's `term:` (terminology codes) and `fhirmap:` (FHIR resource mapping) BPMN annotation extensions are meant to close.

---

<a id="sec-5"></a>
## 5. Implications for BPMN modeling in this project

These follow directly from the concept mapping and paradigm differences in [§4](#sec-4), grounded in the model-readiness findings tracked under [`model-issues/`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/tree/research/synthea-dataset-generation/docs/model-issues) (in the `mihub-lung-cancer-pathway` repository).

1. **BPMN remains the authoritative source; Synthea is downstream.** As already decided (see the plan, §2), the GMF module and generation pipeline are generated from the `.bpmn` source of truth in this repo. Agents and tooling are read-only on `**/*.bpmn`; findings against the models are reported in `docs/model-issues/` for a human modeler to resolve.

2. **No OR-gateways.** GMF has no inclusive-OR semantics ([§4.1](#sec-4-1)), which is a direct, structural reason (alongside the project's 7PMG modeling guidelines, `CONVENTIONS.md` R5) why OR-gateways are banned repo-wide and enforced by the conformance gate (`SYN-5`). The current baseline has 11 unresolved OR-gateways: 4 in `treatment`/`aftercare` ([`model-issues/2026-06-25-baseline.md`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/research/synthea-dataset-generation/docs/model-issues/2026-06-25-baseline.md), Issue 1) and 7 in the work-in-progress `palliative-care` sub-pathway ([`model-issues/2026-06-29-palliative-care.md`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/research/synthea-dataset-generation/docs/model-issues/2026-06-29-palliative-care.md), Issue P1), each needing conversion to explicit XOR or AND before its sub-pathway can be transpiled or soundness-checked.

3. **Concurrency must be linearized or decomposed, deliberately.** Because GMF has no fork/join, any AND-gateway branches in the models need either an order that does not matter (so they can be sequenced arbitrarily) or extraction into separate, sequentially invoked submodules. There must be no hidden ordering dependency between "parallel" branches. This is the structured split/join discipline the project's modeling conventions already call for (R4).

4. **Single start, explicitly named end-states, per sub-pathway.** This mirrors GMF's exactly-one-`Initial` and named-`Terminal`/`Death` requirement: the overarching pathway currently has 5 start events and 140 flow elements (more than the 50-element guideline), which needs decomposing via Call Activities before it can become a single top-level module with clean submodule boundaries (see [`model-issues/2026-06-25-baseline.md`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/research/synthea-dataset-generation/docs/model-issues/2026-06-25-baseline.md), Issue 6).

5. **Every decision-relevant gateway needs a machine-readable branch rule.** Free-text "ja"/"nein" gateway labels are not transpilable. Each XOR outflow needs an explicit `synthea:` BPMN annotation: either a `synthea:condition` (an attribute expression, mapping to `conditional_transition`) or a `synthea:probability` (mapping to `distributed_transition`, weights summing to 1.0 per gateway), and the modeler must decide, per branch, whether it represents a deterministic clinical rule or a population split. These are structurally different in GMF and must not be conflated.

6. **Soundness has to be checked before transpilation.** A GMF module built from an unsound BPMN model will itself deadlock or livelock in simulation. The molecular-tumor-board sub-pathway has a known finding that illustrates this risk concretely: no option-to-complete, meaning at least one path cannot reach an end event (see [`model-issues/2026-06-25-baseline.md`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/research/synthea-dataset-generation/docs/model-issues/2026-06-25-baseline.md), Issue 3). Resolving it, by re-pairing mismatched gateways, is required before that sub-pathway can become a submodule.

7. **Every clinical Task needs a Synthea-native code, in addition to a German one.** GMF states resolve almost entirely on SNOMED CT (condition/procedure/encounter), LOINC (observation) and RxNorm (medication): the codes the `term:` layer should carry for every clinically meaningful task. German codes (ICD-10-GM/OPS/ATC) remain relevant, but only at the later MII-conformance export step (via Flexporter and ConceptMaps).

8. **A literal 1:1 translation of the guideline will produce an unrealistically uniform cohort.**
   Per the Chen et al. (2019) validation caveat ([§1](#sec-1)), Synthea reproduces demographics and service-probability well but not realistic outcome variation on its own. Translating the guideline-ideal BPMN pathway directly into GMF states, with no further work, yields a population where everyone follows the guideline perfectly. Deliberately engineered heterogeneity (non-adherence, comorbidity, recurrence, loss to follow-up), calibrated against registry benchmarks, has to be added on top (see the data-sources catalog's tiered v1/v2 approach for how this project plans to do that).

---

<a id="sec-6"></a>
## 6. Related documents

All four documents below live in the [`mihub-lung-cancer-pathway`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/tree/research/synthea-dataset-generation/docs) repository, not in this one.

- [`synthea-and-bpmn-primer.md`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/research/synthea-dataset-generation/docs/synthea-and-bpmn-primer.md): the detailed companion primer, covering the full BPMN to GMF mapping table with per-row citations, the complete list of what BPMN does not give Synthea and the three annotation extensions.
- [`synthea-dataset-generation-plan.md`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/research/synthea-dataset-generation/docs/synthea-dataset-generation-plan.md): the concrete engineering plan, covering pipeline architecture, phased execution TODOs, GMF-compatibility modeling conventions and the portal consumption contract.
- [`data-sources-for-probabilities-and-timing.md`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/research/synthea-dataset-generation/docs/data-sources-for-probabilities-and-timing.md):
  the verified catalog of data sources for every GMF probability and timing parameter, with a tiered (v1 guideline-based / v2 registry-derived) methodology.
- [`model-issues/2026-06-25-baseline.md`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/research/synthea-dataset-generation/docs/model-issues/2026-06-25-baseline.md) and [`model-issues/2026-06-29-palliative-care.md`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/research/synthea-dataset-generation/docs/model-issues/2026-06-29-palliative-care.md): the tracked model-readiness findings referenced in [§5](#sec-5).

---

## References

### Literature references

<a id="ref-1"></a>1. Walonoski J, Kramer M, Nichols J, Quina A, Moesel C, Hall D, Duffett C, Dube K, Gallagher T, McLachlan S. **Synthea: An approach, method, and software mechanism for generating synthetic patients and the synthetic electronic health care record.** *Journal of the American Medical Informatics Association* 2018;25(3):230-238. doi: 10.1093/jamia/ocx079. <br>
<a id="ref-2"></a>2. Chen J, Chun D, Patel M, Chiang E, James J. **The validity of synthetic clinical data: a validation study of a leading synthetic data generator (Synthea) using clinical quality measures.** *BMC Medical Informatics and Decision Making* 2019;19(1):44. doi: 10.1186/s12911-019-0793-0. <br>
<a id="ref-3"></a>3. Dijkman RM, Dumas M, Ouyang C. **Semantics and analysis of business process models in BPMN.** *Information and Software Technology* 2008;50(12):1281-1294. doi: 10.1016/j.infsof.2008.02.006.

### Synthea references

<a id="ref-4"></a>4. Synthea, GitHub repository. https://github.com/synthetichealth/synthea <br>
<a id="ref-5"></a>5. Generic Module Framework (overview). https://github.com/synthetichealth/synthea/wiki/Generic-Module-Framework <br>
<a id="ref-6"></a>6. Generic Module Framework: States. https://github.com/synthetichealth/synthea/wiki/Generic-Module-Framework:-States <br>
<a id="ref-7"></a>7. Generic Module Framework: Transitions. https://github.com/synthetichealth/synthea/wiki/Generic-Module-Framework:-Transitions <br>
<a id="ref-8"></a>8. Generic Module Framework: Logic. https://github.com/synthetichealth/synthea/wiki/Generic-Module-Framework:-Logic <br>
<a id="ref-9"></a>9. Generic Module Framework: Submodules. https://github.com/synthetichealth/synthea/wiki/Generic-Module-Framework:-Submodules <br>
<a id="ref-10"></a>10. Module Builder (visual editor). https://synthetichealth.github.io/module-builder/ <br>
<a id="ref-11"></a>11. Flexporter. https://github.com/synthetichealth/synthea/wiki/Flexporter <br>
<a id="ref-12"></a>12. OHDSI ETL-Synthea (OMOP CDM export). https://github.com/OHDSI/ETL-Synthea
