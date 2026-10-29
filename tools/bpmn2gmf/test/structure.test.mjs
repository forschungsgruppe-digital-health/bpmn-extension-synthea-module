import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convert } from '../convert.mjs';
import { compareStructure, qualify } from '../structure.mjs';
import { run } from '../compare-structure.mjs';

const upstream = (f) => JSON.parse(readFileSync(new URL(`./upstream/${f}.json`, import.meta.url), 'utf8')).states;
const BYPASS = { bypassUpstream: ['End Any Active Encounter Just In Case'] };

test('the real pathways have the same logic as the Synthea modules (states, conditions, probabilities and their order)', async () => {
  for (const [title, r] of await run()) {
    assert.deepEqual(r.problems, [], title);
    assert.deepEqual(r.unpairedUpstream, [], title);
    assert.deepEqual(r.unexpectedOurs, [], title);
  }
});

// The same comparison must notice a change that a content comparison would miss.
const anemia = async () => {
  const { modules } = await convert(['anemia-submodule'].map((f) => `lung-cancer/${f}.bpmn`).map((path) => ({ path, xml: readFileSync(path, 'utf8') })), { strict: true });
  return modules.find((m) => m.fileBase === 'anemia_submodule').json.states;
};
const check = (states) => compareStructure(qualify('u', upstream('anemia_sub')), qualify('o', states), BYPASS);

test('anemia: the unchanged module is the baseline', async () => {
  const r = check(await anemia());
  assert.equal(r.problems.length + r.unpairedUpstream.length, 0);
});

test('a distributed transition with its branches in another order is a difference (same random number, other branch)', async () => {
  const states = await anemia();
  const gateway = Object.values(states).find((s) => s.distributed_transition?.some((e) => e.distribution === 0.93));
  gateway.distributed_transition.reverse();
  assert.ok(check(states).problems.some((p) => p.includes('probability')));
});

test('a changed probability is a difference', async () => {
  const states = await anemia();
  Object.values(states).find((s) => s.distributed_transition?.some((e) => e.distribution === 0.28)).distributed_transition[0].distribution = 0.29;
  assert.ok(check(states).problems.some((p) => p.includes('probability')));
});

test('a changed field of a state is a difference', async () => {
  const states = await anemia();
  Object.values(states).find((s) => s.type === 'Delay' && s.exact?.unit === 'days').exact.quantity = 2;
  assert.ok(check(states).problems.some((p) => p.includes('exact')));
});

test('a changed condition is a difference', async () => {
  const states = await anemia();
  const c = Object.values(states).flatMap((s) => s.conditional_transition ?? []).find((e) => e.condition?.condition_type === 'And');
  c.condition.conditions[0].value = 99;
  assert.ok(check(states).problems.length > 0);
});

test('a state that nothing leads to in ours is reported as only upstream', async () => {
  const states = await anemia();
  const name = Object.keys(states).find((n) => states[n].type === 'Procedure' && states[n].codes?.[0]?.code === '14768001');
  const pred = Object.values(states).find((s) => s.direct_transition === name);
  pred.direct_transition = states[name].direct_transition;
  delete states[name];
  assert.ok(check(states).problems.length + check(states).unpairedUpstream.length > 0);
});
