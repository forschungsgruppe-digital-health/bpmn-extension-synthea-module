// docs/extension-api.md keeps its promises: the bpmn-js snippet is the file CI builds, the Node
// snippet runs, and the generated type reference is current.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { generateApiReference } from '../../gen-extension-api.mjs';
import { loadValues } from '../../moddle-to-xsd.mjs';

const root = resolve(import.meta.dirname, '../../..');
const doc = readFileSync(join(root, 'docs/extension-api.md'), 'utf8');
const blocks = [...doc.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]);

test('the bpmn-js snippet is examples/consumer/src/main.js', () => {
  const main = readFileSync(join(root, 'examples/consumer/src/main.js'), 'utf8');
  assert.equal(blocks[0].trimEnd(), main.trimEnd());
});

test('the Node snippet runs and prints the state type of a state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'api-doc-'));
  // the snippet imports the package by its name, which Node resolves from inside the repository
  const script = join(root, `.api-doc-snippet-${process.pid}.mjs`);
  try {
    copyFileSync(join(root, 'lung-cancer/anemia-submodule.bpmn'), join(dir, 'diagram.bpmn'));
    writeFileSync(script, blocks[1]);
    const stdout = execFileSync('node', [script], { cwd: dir, encoding: 'utf8' });
    assert.match(stdout, /Diagnosis: Anemia ConditionOnset 271737000/);
  } finally {
    rmSync(script, { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the type reference is current', () => {
  const descriptorPath = join(root, 'extension/model/synthea.json');
  const expected = generateApiReference(JSON.parse(readFileSync(descriptorPath, 'utf8')), loadValues(descriptorPath));
  assert.equal(readFileSync(join(root, 'docs/extension-api-types.md'), 'utf8'), expected);
});

test('the page links the reference and names the commands that keep it honest', () => {
  assert.ok(doc.includes('(extension-api-types.md)'));
  for (const command of ['npm run api:gen', 'npm run xsd:gen', 'npm run validate']) assert.ok(doc.includes(command), command);
});
