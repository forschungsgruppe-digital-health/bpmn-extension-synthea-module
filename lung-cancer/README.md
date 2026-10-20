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

## Converting to Synthea and running it

`tools/bpmn2gmf` turns these files into Synthea GMF JSON (concept and decisions:
[`docs/bpmn2gmf-concept.md`](../docs/bpmn2gmf-concept.md)):

    npm run convert:check                                   # all five convert, strict, no warning (part of `npm run validate`)
    npm run bpmn2gmf -- lung-cancer --out-dir out/modules   # write the modules (add --fuse-gateways for fewer Simple states)

Every `callActivity` carries a `synthea:submoduleConfig submodule="..."` with the
bare name of the called file, written with underscores (`anemia_submodule`,
`lung_cancer_probabilities_submodule`, `lung_cancer_treatment_submodule`,
`symptom_check_submodule`). The value has to match the file name
(`anemia-submodule.bpmn` → `anemia_submodule`); the converter checks this and
rejects a name that no file in the run has.

Synthea runs every file directly in its modules directory as a module of its
own and treats only files in a **subdirectory** as submodules. The converter
therefore writes the top-level module to `synthea_lung_cancer.json` and the four
called modules to `synthea_lung_cancer/<name>.json`, and turns the bare name
into that path in the `CallSubmodule` states (`"submodule":
"synthea_lung_cancer/anemia_submodule"`). Nothing has to be changed in the
diagrams for this.

The converted modules run in Synthea v4.0.0:

    npm run synthea:smoke -- <synthea-with-dependencies.jar>   # needs Java and the release jar, not part of `validate`

The comparison with the hand-written lung cancer module of the Synthea project
and the result of the runs (equal stay length, medication category, care plan
activities, symptom behavior; what is left over) are in section 12 of the
concept.

## `fhirmap:` and `term:`

The models carry `fhirmap:` (which FHIR resource a state produces) and `term:`
(its code) in the form and with the namespaces of the real packages
(`bpmn-js-clinical-semantics`, `bpmn-extension-medical-terminology`):
`fhirmap:resourceMappings > resourceMapping` and `term:annotations > annotation
> coding`. States that produce no FHIR resource (`Symptom`, `SetAttribute`,
`Counter`, `Death`, `VitalSign`) have no mapping.

## BPMN conformance class (SYN-1)

Checked against the modeling conventions in
[`mihub-lung-cancer-pathway`'s `CONVENTIONS.md`](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/main/CONVENTIONS.md)
and its formal
[acceptance checklist](https://github.com/forschungsgruppe-digital-health/mihub-lung-cancer-pathway/blob/main/docs/governance/abnahme-checkliste-bpmn-patientenpfad.md),
which requires the BPMN conformance sub-class to be declared (SYN-1, *Muss*).

**Declared class: Analytic.**

- Not **Descriptive** — that subclass excludes boundary events, timer
  intermediate events, call activities and differentiated task types
  (`scriptTask` etc.), all of which these files use (the `Delay` states'
  `timerEventDefinition`, the four `callActivity` submodule invocations, the
  `scriptTask` markers).
- Not **Common Executable** — every process has `isExecutable="false"`, and
  the `scriptTask` elements (used only as a stylistic marker for
  `SetAttribute`/`Counter` states, mirroring Synthea's own state names) carry
  no actual `<script>` body. Nothing here is meant to run on a BPMN engine.
- **Analytic** fits: a broader element vocabulary for detailed, analyzable
  modeling, explicitly not intended for execution. These diagrams are
  authored for clinical/domain review and as the source that
  `tools/bpmn2gmf` translates into Synthea GMF JSON — not to
  be run by a BPMN engine directly.
