// Every field description of the properties panel belongs to a label that exists, so a renamed
// label cannot leave a description behind that never shows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DESCRIPTIONS } from '../../../extension/src/descriptions.js';

const provider = readFileSync(new URL('../../../extension/src/SyntheaPropertiesProvider.js', import.meta.url), 'utf8');

test('every description key is the label of a field in the panel', () => {
  for (const label of Object.keys(DESCRIPTIONS)) {
    assert.ok(provider.includes(`'${label}'`), `no field has the label '${label}'`);
  }
});

test('descriptions are short plain sentences', () => {
  for (const [label, text] of Object.entries(DESCRIPTIONS)) {
    assert.ok(text.length > 20 && text.length <= 320, `description of '${label}' has ${text.length} characters`);
    assert.ok(/[.)]$/.test(text), `description of '${label}' does not end with a full stop`);
  }
});
