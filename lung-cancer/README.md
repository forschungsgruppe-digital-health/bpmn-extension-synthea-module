# Lung cancer pathway (real content)

The five `.bpmn` files in this folder are the real Synthea lung-cancer patient
pathway — not test fixtures. `synthea-lung-cancer.bpmn` is the top-level
module; the other four are its submodules, called via `bpmn:callActivity`
(`calledElement` pointing at each file's own process id):

| File | Called as |
|---|---|
| `lung-cancer-probabilities-submodule.bpmn` | `Process_LungCancerProbabilities` |
| `lung-cancer-treatment-submodule.bpmn` | `Process_LungCancerTreatmentCycle` |
| `symptom-check-submodule.bpmn` | `Process_SymptomCheck` |
| `anemia-submodule.bpmn` | `Process_AnemiaSubmodule` |

The demo app's Pathway dropdown loads all five directly from here.

## ⚠️ Submodule path placeholder (needs confirming before `tools/bpmn2gmf`)

`calledElement` above is a BPMN-internal reference (the target process id,
resolved within this file set) and needs no further decision. But each
`callActivity` also carries a `synthea:submoduleConfig submodule="..."`
value, which is the field that matters for the *actual* Synthea export:

| File | `synthea:submoduleConfig submodule="..."` |
|---|---|
| `lung-cancer-probabilities-submodule.bpmn` | `lung_cancer_probabilities_submodule` |
| `lung-cancer-treatment-submodule.bpmn` | `lung_cancer_treatment_submodule` |
| `symptom-check-submodule.bpmn` | `symptom_check_submodule` |
| `anemia-submodule.bpmn` | `anemia_submodule` |

In real Synthea GMF, a `CallSubmodule` state's `submodule` field is a file
path relative to Synthea's `modules/` directory (e.g.
`"submodule": "medications/otc_pain_reliever"` → Synthea looks for
`modules/medications/otc_pain_reliever.json`). These four values are a
plausible guess (each source file's basename in snake_case, no folder
prefix) — not a confirmed convention, since `tools/bpmn2gmf` doesn't exist
yet and hasn't decided how/where it will name its output JSON files.

**Before relying on these for a real export:** confirm (or change) these
four strings so they match whatever `tools/bpmn2gmf` actually names/places
the generated submodule JSON files as. If they don't match, Synthea will
fail to find the submodule at simulation time even though everything here
validates cleanly.

## BPMN conformance class (SYN-1)

Checked against the modeling conventions in
[`mihub-lung-cancer-pathway`'s `CONVENTIONS.md`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/main/CONVENTIONS.md)
and its formal
[acceptance checklist](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/main/docs/governance/abnahme-checkliste-bpmn-patientenpfad.md),
which requires the BPMN conformance sub-class to be declared (SYN-1, *Muss*).

**Declared class: Analytic.**

- Not **Descriptive** — that subclass excludes boundary events, timer
  intermediate events, call activities and differentiated task types
  (`scriptTask` etc.), all of which these files use (e.g. the treatment
  cycle's `boundaryEvent` "Survival Time elapsed", the `Delay` states'
  `timerEventDefinition`, the four `callActivity` submodule invocations).
- Not **Common Executable** — every process has `isExecutable="false"`, and
  the `scriptTask` elements (used only as a stylistic marker for
  `SetAttribute`/`Counter` states, mirroring Synthea's own state names) carry
  no actual `<script>` body. Nothing here is meant to run on a BPMN engine.
- **Analytic** fits: a broader element vocabulary for detailed, analyzable
  modeling, explicitly not intended for execution. These diagrams are
  authored for clinical/domain review and as the source that
  `tools/bpmn2gmf` (planned) will translate into Synthea GMF JSON — not to
  be run by a BPMN engine directly.
