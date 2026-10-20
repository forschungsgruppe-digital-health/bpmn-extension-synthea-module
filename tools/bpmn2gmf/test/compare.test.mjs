import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convert } from '../convert.mjs';
import { compare, merge, signatures, links } from '../compare.mjs';

const ALIAS = { lung_cancer: 'lung_cancer_diagnosis' };

// The real pathway files, converted, against the hand-written Synthea modules in
// test/upstream/ (see NOTICE.md there).
const FILES = [
  'synthea-lung-cancer', 'anemia-submodule', 'lung-cancer-treatment-submodule',
  'symptom-check-submodule', 'lung-cancer-probabilities-submodule'
].map((f) => `lung-cancer/${f}.bpmn`);

const { modules } = await convert(FILES.map((path) => ({ path, xml: readFileSync(path, 'utf8') })), { strict: false });
const ours = Object.fromEntries(modules.map((m) => [m.fileBase, m.json.states]));
const upstream = (f) => JSON.parse(readFileSync(new URL(`./upstream/${f}.json`, import.meta.url), 'utf8')).states;

test('anemia_submodule has the same content as upstream anemia_sub.json', () => {
  const c = compare(ours.anemia_submodule, upstream('anemia_sub'), { ignoreCodes: true });
  assert.deepEqual({ onlyOurs: c.onlyOurs, onlyUpstream: c.onlyUpstream }, { onlyOurs: [], onlyUpstream: [] });
});

test('lung_cancer_probabilities_submodule has the same content as upstream', () => {
  const c = compare(ours.lung_cancer_probabilities_submodule, upstream('lung_cancer_probabilities'), { ignoreCodes: true });
  assert.ok(c.same, [...c.onlyOurs, ...c.onlyUpstream].join('\n'));
});

// Our main pathway and its two submodules together against the one big upstream module.
const together = merge(ours.synthea_lung_cancer, ours.lung_cancer_treatment_submodule, ours.symptom_check_submodule);
const upstreamMain = upstream('lung_cancer');
const distinct = (states, alias) => new Set(signatures(states, alias, { ignoreCodes: true }));

test('everything clinical in the main pathway exists upstream (encounters, procedures, diagnoses, symptoms, deaths, lab values)', () => {
  const clinical = (sig) => /^(Encounter|Procedure|ConditionOnset|Symptom|Death|Observation|DiagnosticReport|CarePlanStart|MedicationOrder|MedicationEnd)\b/.test(sig);
  const theirs = distinct(upstreamMain, ALIAS);
  const missing = [...distinct(together)].filter(clinical).filter((sig) => !theirs.has(sig));
  assert.deepEqual(missing, []);
});

test('the main pathway has no content difference from upstream that is not listed here', () => {
  // Every clinical state, every value, and since the last round also the length of stay (an
  // exponential distribution), the hospice reason (copied from the diagnosis attribute) and the
  // cause of death. What is left is the simplified structure:
  //  - lung_cancer_los is drawn per patient in both; SCLC and NSCLC treatment are modeled once here
  //    and twice upstream, so counts per type differ (not part of the signatures' set difference)
  const theirs = distinct(upstreamMain, ALIAS);
  const different = [...distinct(together)].filter((sig) => !theirs.has(sig)).sort();
  assert.deepEqual(different, []);
});

test('output fields: every duration, administration and care plan activity of upstream is present', () => {
  const l = links(together);
  const up = links(upstreamMain);
  // the SCLC and NSCLC treatment are modeled once here and twice upstream: radiation, hearing test and the
  // order of the second chemotherapy exist once less (3 x-ray/CT/MRI + 2 radiation + 2 hearing upstream)
  assert.equal(l.duration, 5);
  assert.equal(up.duration, 7);
  assert.equal(l.administration, 3);
  assert.equal(up.administration, 4);
  assert.equal(l.activities, up.activities);
});

test('linking fields: attributes, cause of death and target encounters match upstream; only reason is left out', () => {
  const l = links(together);
  const up = links(upstreamMain);
  assert.equal(l.target_encounter, 11, 'every diagnosis names the encounter it is recorded at');
  assert.equal(l.target_encounter, up.target_encounter);
  assert.equal(l.value_attribute, up.value_attribute);
  assert.equal(l.referenced_by_attribute, 7, 'four Death states + the three MedicationEnd states (upstream has the NSCLC copy of the latter)');
  assert.equal(l.assign_to_attribute, 14, 'suspected diagnosis, diagnosis, staged diagnosis (8), anemia is in its own module, three medication orders');
  // `reason` only names the condition behind a procedure or prescription in the output; optional in Synthea
  assert.equal(l.reason, 0);
  assert.ok(up.reason > 0);
});
