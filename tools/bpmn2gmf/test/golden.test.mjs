// Golden files: the five real pathway files in examples/lung-cancer/ convert (together, strict) to exactly the
// modules stored in golden/. A change in the converter or in a model that alters a module fails here;
// if the change is intended, rewrite the files with `UPDATE_GOLDEN=1 npm run test:bpmn2gmf` and review
// the diff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { convert } from '../convert.mjs';

const DIR = 'examples/lung-cancer';
const golden = (fileBase) => new URL(`./golden/${fileBase}.json`, import.meta.url);

test('the lung-cancer pathway converts to the golden files', async () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.bpmn')).sort();
  assert.equal(files.length, 5);
  const { modules, diagnostics } = await convert(
    files.map((f) => ({ path: join(DIR, f), xml: readFileSync(join(DIR, f), 'utf8') })),
    { strict: true }
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.equal(modules.length, 5);
  for (const m of modules) {
    if (process.env.UPDATE_GOLDEN) writeFileSync(golden(m.fileBase), `${JSON.stringify(m.json, null, 2)}\n`);
    assert.deepEqual(m.json, JSON.parse(readFileSync(golden(m.fileBase), 'utf8')), m.fileBase);
  }
});
