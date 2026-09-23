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
