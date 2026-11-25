// Two facts about the converted lung cancer pathway in examples/lung-cancer/ that its README relies on:
// the treatment cycle never returns, and the main pathway ends the open encounter before it calls the
// anemia module (the module starts without one).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convert } from '../convert.mjs';

const lungCancerModules = async () => {
  const files = ['synthea-lung-cancer', 'anemia-submodule', 'lung-cancer-treatment-submodule', 'symptom-check-submodule', 'lung-cancer-probabilities-submodule'];
  const { modules } = await convert(files.map((f) => `examples/lung-cancer/${f}.bpmn`).map((path) => ({ path, xml: readFileSync(path, 'utf8') })), { strict: true });
  return Object.fromEntries(modules.map((m) => [m.fileBase, m.json.states]));
};

test('the treatment cycle never returns: it has no Terminal and every state has a transition', async () => {
  const cycle = (await lungCancerModules()).lung_cancer_treatment_submodule;
  assert.deepEqual(Object.keys(cycle).filter((n) => cycle[n].type === 'Terminal'), [], 'the cycle has a Terminal, so the call can return');
  for (const [name, s] of Object.entries(cycle)) {
    assert.ok(Object.keys(s).some((k) => k.endsWith('transition')), `${name} has no outgoing transition`);
  }
});

test('every call of the anemia module follows an EncounterEnd', async () => {
  const main = (await lungCancerModules()).synthea_lung_cancer;
  const targets = (s) => JSON.stringify(Object.entries(s).filter(([k]) => k.endsWith('transition')).map(([, v]) => v));
  const calls = Object.keys(main).filter((n) => main[n].submodule?.endsWith('/anemia_submodule'));
  assert.ok(calls.length > 0);
  const reached = (name, seen = new Set()) => Object.keys(main).filter((p) => !seen.has(p) && targets(main[p]).includes(`"${name}"`));
  for (const call of calls) {
    let frontier = reached(call);
    assert.ok(frontier.length > 0, `${call} is not reached`);
    // walk back over states that end nothing until each path meets an EncounterEnd
    const seen = new Set(frontier);
    while (frontier.length) {
      const next = [];
      for (const p of frontier) {
        if (main[p].type === 'EncounterEnd') continue;
        assert.notEqual(main[p].type, 'Initial', `a path to ${call} starts without ending the encounter`);
        for (const q of reached(p, seen)) { seen.add(q); next.push(q); }
      }
      frontier = next;
    }
  }
});
