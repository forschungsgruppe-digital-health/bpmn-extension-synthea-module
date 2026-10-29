# Upstream Synthea modules (test reference data)

`lung_cancer.json`, `anemia_sub.json` and `lung_cancer_probabilities.json` are
copies of modules from the Synthea project, unchanged, kept only so
`compare-upstream.mjs` and its test can compare the converter's output with the
hand-written originals offline.

- Source: https://github.com/synthetichealth/synthea, `src/main/resources/modules/`
  (`lung_cancer.json`, `anemia/anemia_sub.json`, `lung_cancer/lung_cancer_probabilities.json`)
- Retrieved: 2026-10-27 (`lung_cancer.json`; the other two 2026-10-05), branch `master`
- License: Apache License 2.0, https://github.com/synthetichealth/synthea/blob/master/LICENSE
  Copyright The MITRE Corporation and the Synthea contributors.
