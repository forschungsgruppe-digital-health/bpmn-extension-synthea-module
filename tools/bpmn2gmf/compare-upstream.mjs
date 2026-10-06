#!/usr/bin/env node
// Usage: node tools/bpmn2gmf/compare-upstream.mjs
//
// Converts the real pathway files in lung-cancer/ and compares them with the
// hand-written Synthea modules kept in test/upstream/ (see compare.mjs for what
// "compare" means). Informational: prints the differences, exit code 0.
import { readFileSync } from 'node:fs';
import { convert } from './convert.mjs';
import { compare, merge, links } from './compare.mjs';

// upstream's attribute "Lung Cancer" (the diagnosis a hospice reason and the cause of death refer to)
const ALIAS = { lung_cancer: 'lung_cancer_diagnosis' };

const files = [
  'synthea-lung-cancer', 'anemia-submodule', 'lung-cancer-treatment-submodule',
  'symptom-check-submodule', 'lung-cancer-probabilities-submodule'
].map((f) => `lung-cancer/${f}.bpmn`);
const { modules } = await convert(files.map((path) => ({ path, xml: readFileSync(path, 'utf8') })), { strict: true });
const ours = Object.fromEntries(modules.map((m) => [m.fileBase, m.json.states]));
const upstream = (f) => JSON.parse(readFileSync(new URL(`./test/upstream/${f}.json`, import.meta.url), 'utf8')).states;

const report = (title, c) => {
  console.log(`\n== ${title}: ${c.same ? 'same content' : `${c.onlyOurs.length} only ours, ${c.onlyUpstream.length} only upstream`}`);
  c.onlyOurs.forEach((l) => console.log(`  + ${l}`));
  c.onlyUpstream.forEach((l) => console.log(`  - ${l}`));
};

report('anemia_submodule vs anemia_sub.json', compare(ours.anemia_submodule, upstream('anemia_sub')));
report('lung_cancer_probabilities_submodule vs lung_cancer_probabilities.json', compare(ours.lung_cancer_probabilities_submodule, upstream('lung_cancer_probabilities')));
const together = merge(ours.synthea_lung_cancer, ours.lung_cancer_treatment_submodule, ours.symptom_check_submodule);
report('main + treatment + symptom-check vs lung_cancer.json', compare(together, upstream('lung_cancer'), { alias: ALIAS }));

// Fields that link states (not compared above): how many states carry each, ours vs upstream.
const l = [links(together), links(upstream('lung_cancer'))];
console.log('\n== linking fields (states carrying them), ours / upstream');
for (const k of Object.keys(l[0])) console.log(`  ${k.padEnd(24)} ${String(l[0][k]).padStart(3)} / ${l[1][k]}`);
