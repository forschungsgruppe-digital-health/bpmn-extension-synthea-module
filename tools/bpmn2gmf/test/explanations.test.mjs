// Every note and warning the converter can emit has a plain-language explanation,
// so the demo and the result page never show an unexplained message.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { EXPLANATIONS } from '../explanations.mjs';

const dir = new URL('..', import.meta.url);
const sources = readdirSync(dir).filter((f) => f.endsWith('.mjs') && f !== 'explanations.mjs');
const codes = new Set();
for (const f of sources) {
  const text = readFileSync(new URL(f, dir), 'utf8');
  for (const m of text.matchAll(/\b(?:diag|d)\.(?:warn|note)\(\s*'([A-Z_]+)'/g)) codes.add(m[1]);
}

test('the converter emits notes and warnings', () => {
  assert.ok(codes.size >= 10);
});

for (const code of codes) {
  test(`explanation for ${code}`, () => {
    const e = EXPLANATIONS[code];
    assert.ok(e, `add an entry for ${code} to tools/bpmn2gmf/explanations.mjs`);
    for (const k of ['what', 'why', 'fix']) assert.ok(e[k]?.length > 10, `${code}.${k}`);
  });
}

test('no explanation for a code the converter does not emit', () => {
  for (const code of Object.keys(EXPLANATIONS)) assert.ok(codes.has(code), `${code} is unused`);
});
