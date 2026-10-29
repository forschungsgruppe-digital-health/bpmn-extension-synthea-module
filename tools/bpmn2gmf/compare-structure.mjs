#!/usr/bin/env node
// Usage: node tools/bpmn2gmf/compare-structure.mjs
//
// Converts the real pathway files in lung-cancer/ and compares them with the hand-written Synthea
// modules in test/upstream/ state by state and transition by transition (see structure.mjs for what
// is compared and what is left out). Exit code 1 if anything differs that is not listed as a known
// difference below.
import { readFileSync } from 'node:fs';
import { convert } from './convert.mjs';
import { compareStructure, inline, qualify } from './structure.mjs';

const FILES = [
  'synthea-lung-cancer', 'anemia-submodule', 'lung-cancer-treatment-submodule',
  'symptom-check-submodule', 'lung-cancer-probabilities-submodule'
].map((f) => `lung-cancer/${f}.bpmn`);

// Known differences, each with the reason it does not change what Synthea does.
const KNOWN = {
  bypassAnemia: {
    state: 'End Any Active Encounter Just In Case',
    why: 'upstream starts anemia_sub.json with an EncounterEnd; the main pathway already ends the visit before it calls the module'
  },
  terminalAfterCall: 'a Terminal behind the call of the treatment cycle: the cycle never returns (it ends only with the death scheduled before it), the state only gives the call a target'
};

export async function run() {
  const { modules } = await convert(FILES.map((path) => ({ path, xml: readFileSync(path, 'utf8') })), { strict: true });
  const ours = Object.fromEntries(modules.map((m) => [m.fileBase, m.json.states]));
  const upstream = (f) => JSON.parse(readFileSync(new URL(`./test/upstream/${f}.json`, import.meta.url), 'utf8')).states;
  const callNames = { anemia_sub: 'anemia_submodule', lung_cancer_probabilities: 'lung_cancer_probabilities_submodule' };

  const mainOurs = inline('o', ours.synthea_lung_cancer, {
    symptom_check_submodule: ours.symptom_check_submodule,
    lung_cancer_treatment_submodule: ours.lung_cancer_treatment_submodule
  });
  const results = [
    ['main  lung_cancer.json  vs  synthea_lung_cancer (symptom check and treatment inlined)',
      compareStructure(qualify('u', upstream('lung_cancer')), mainOurs, { callNames }), mainOurs],
    ['anemia  anemia_sub.json  vs  anemia_submodule',
      compareStructure(qualify('u', upstream('anemia_sub')), qualify('o', ours.anemia_submodule), { bypassUpstream: [KNOWN.bypassAnemia.state] })],
    ['probabilities  lung_cancer_probabilities.json  vs  lung_cancer_probabilities_submodule',
      compareStructure(qualify('u', upstream('lung_cancer_probabilities')), qualify('o', ours.lung_cancer_probabilities_submodule))]
  ];
  for (const [, r, g] of results) {
    // a Terminal nothing leads to (it only follows a call that never returns) is a known difference
    const incoming = (n) => [...g ?? []].filter(([, s]) => JSON.stringify(s).includes(`"${n}"`));
    r.unexpectedOurs = r.unpairedOurs.filter((n) => !(g && g.get(n).type === 'Terminal' && incoming(n).length === 0));
    r.knownOurs = r.unpairedOurs.filter((n) => !r.unexpectedOurs.includes(n));
  }
  return results;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const results = await run();
  const name = (n) => n.split(':').slice(1).join(':');
  let failed = false;
  for (const [title, r] of results) {
    const bad = r.problems.length + r.unpairedUpstream.length + r.unexpectedOurs.length;
    failed ||= bad > 0;
    console.log(`\n== ${title}: ${bad ? `${bad} difference(s)` : 'same logic'}  (${r.pairedUpstream} upstream / ${r.pairedOurs} of our states paired)`);
    r.problems.forEach((p) => console.log(`  * ${p}`));
    r.unpairedUpstream.forEach((n) => console.log(`  - only upstream: ${name(n)}`));
    r.unexpectedOurs.forEach((n) => console.log(`  + only ours: ${name(n)}`));
    r.bypassed.forEach((n) => console.log(`  known: ${name(n)} skipped (${KNOWN.bypassAnemia.why})`));
    r.knownOurs.forEach((n) => console.log(`  known: ${name(n)} (${KNOWN.terminalAfterCall})`));
    for (const [note, n] of Object.entries(r.accepted)) console.log(`  treated as equal (${n}x): ${note}`);
    const renamed = r.renames.filter(([a, b]) => b.length !== 1 || b[0] !== a);
    if (renamed.length) console.log(`  attribute renaming: ${renamed.map(([a, b]) => `${a} -> ${b.join(' | ')}`).join('; ')}`);
  }
  process.exit(failed ? 1 : 0);
}
