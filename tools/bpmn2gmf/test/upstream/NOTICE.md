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

## Files in this folder

- `LICENSE`: the Apache License 2.0, copied unchanged from the Synthea repository
  (https://github.com/synthetichealth/synthea/blob/master/LICENSE).
- The three `.json` files are unchanged copies of Synthea modules (see above).

## Synthea NOTICE

The Synthea repository carries the following `NOTICE` file. The text is reproduced here unchanged
(retrieved 2026-11-05 from `master`) because the modules contain codes from these terminologies. The last
paragraph of the original, about the Systems Biology Simulation Core Library, concerns the Java archive
that Synthea ships and is not reproduced: no part of it is distributed in this repository.

```text
Synthea
Copyright 2017-2025 The MITRE Corporation

This material contains prescribable drug codes from RxNorm that are released by
the National Library of Medicine and is in the public domain.
https://www.nlm.nih.gov/research/umls/rxnorm/docs/prescribe.html

This material contains content from LOINC (R) (http://loinc.org). The LOINC
table, LOINC codes, and LOINC panels and forms file are protected by US
Copyright Law (C) 1995-2014, Regenstrief Institute, Inc. and the Logical
Observation Identifiers Names and Codes (LOINC) Committee and available at no
cost under the license at http://loinc.org/terms-of-use

This material contains content from SNOMED CT and constitutes a fair use of such
copyrighted material as provided for in section 107 of the US Copyright Law for
the purposes of research and nonprofit educational purposes.

SNOMED CT is a comprehensive clinical terminology, originally created by the
College of American Pathologists (CAP) and, as of April 2007, and is owned,
maintained, and distributed by the International Health Terminology Standards
Development Organisation (IHTSDO) (http://www.ihtsdo.org), a not-for-profit
association.

Use of SNOMED CT is subject to the IHTSDO Affiliate license provisions and is
free in IHTSDO Member territories including the United States, in low income
countries, and for Qualifying Research Projects in any country. To learn more,
please see the IHTSDO SNOMED CT and Licensing page
(https://www.snomed.org/snomed-ct/get-snomed-ct).
```
