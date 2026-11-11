// The JSON Schema of a Synthea module (module.schema.json, generated from required-fields.mjs):
// it is not stale, it accepts what the converter writes and what Synthea ships, it rejects broken
// modules, and it agrees with missingFields() for every state type.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { convert } from '../convert.mjs';
import { REQUIRED_FIELDS, missingFields } from '../required-fields.mjs';
import { render, SCHEMA_PATH } from '../gen-schema.mjs';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const validate = new Ajv({ allErrors: true }).compile(schema);
const ok = (module) => validate(module);

const T = { type: 'Terminal' };
const module = (state, extra = {}) => ({
  name: 'm',
  states: { Initial: { type: 'Initial', direct_transition: 'S' }, S: { direct_transition: 'Terminal', ...state }, Terminal: T, ...extra }
});

test('the stored schema is the one the generator writes (no drift)', () => {
  assert.equal(readFileSync(SCHEMA_PATH, 'utf8'), render());
});

test('the schema accepts the modules of lung-cancer/ as the converter writes them', async () => {
  const dir = here('../../../lung-cancer');
  const files = readdirSync(dir).filter((f) => f.endsWith('.bpmn')).map((f) => ({ path: join(dir, f), xml: readFileSync(join(dir, f), 'utf8') }));
  const { modules, diagnostics } = await convert(files, { strict: true });
  assert.equal(diagnostics.errorCount, 0);
  assert.ok(modules.length >= 5);
  for (const m of modules) assert.ok(ok(m.json), `${m.fileBase}: ${JSON.stringify(validate.errors?.slice(0, 2))}`);
});

test('the schema accepts the modules copied from Synthea (test/upstream)', () => {
  const dir = here('./upstream');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 3);
  for (const f of files) assert.ok(ok(JSON.parse(readFileSync(join(dir, f), 'utf8'))), f);
});

test('negative: each of these broken modules must fail', () => {
  const bad = {
    'Procedure without codes': module({ type: 'Procedure' }),
    'Procedure with an empty codes list': module({ type: 'Procedure', codes: [] }),
    'Delay with neither exact, range nor distribution': module({ type: 'Delay' }),
    'Observation without unit and value': module({ type: 'Observation', category: 'laboratory', codes: [{ system: 'LOINC', code: '1', display: 'x' }] }),
    'Terminal with a transition': { name: 'm', states: { Initial: { type: 'Initial', direct_transition: 'Terminal' }, Terminal: { type: 'Terminal', direct_transition: 'Terminal' } } },
    'state without a transition': module({ type: 'Simple', direct_transition: undefined }),
    'state with two transitions': module({ type: 'Simple', conditional_transition: [{ transition: 'Terminal' }] }),
    'standalone Encounter without class': module({ type: 'Encounter', codes: [{ system: 'SNOMED-CT', code: '1', display: 'x' }] }),
    'unknown state type': module({ type: 'Frobnicate' }),
    'module without Initial': { name: 'm', states: { Terminal: T } },
    'module without name': { states: { Initial: { type: 'Initial', direct_transition: 'Terminal' }, Terminal: T } }
  };
  for (const [what, m] of Object.entries(bad)) assert.equal(ok(m), false, what);
});

test('positive: choices the engine allows are accepted', () => {
  const codes = [{ system: 'LOINC', code: '1', display: 'x' }];
  const good = {
    'wellness Encounter needs no class or code': module({ type: 'Encounter', wellness: true }),
    'Delay with a v2 distribution': module({ type: 'Delay', distribution: { kind: 'UNIFORM' } }),
    'Observation with a coded value needs no unit': module({ type: 'Observation', category: 'social-history', codes, value_code: { system: 'SNOMED-CT', code: '1', display: 'x' } }),
    'Symptom with a distribution': module({ type: 'Symptom', symptom: 's', distribution: { kind: 'UNIFORM' } })
  };
  for (const [what, m] of Object.entries(good)) assert.ok(ok(m), `${what}: ${JSON.stringify(validate.errors?.slice(0, 2))}`);
});

test('the schema and missingFields() agree for every state type with only its type and a transition', () => {
  for (const type of [...Object.keys(REQUIRED_FIELDS), 'Encounter']) {
    const state = { type, direct_transition: 'Terminal' };
    assert.equal(ok(module(state)), missingFields(state).length === 0, type);
  }
  const wellness = { type: 'Encounter', wellness: true, direct_transition: 'Terminal' };
  assert.equal(ok(module(wellness)), missingFields(wellness).length === 0);
});
