// The demo converts the open diagram in the browser. This test proves that the browser build of the
// converter gives the same result as the command line, so a reviewer sees what `npm run bpmn2gmf`
// would produce.
//
// The converter is bundled for the browser platform with esbuild. That fails on any Node-only
// import (node:fs, node:path, ...), which is also the guard that keeps the core browser-safe. The
// bundle is then run in Node, on the same files as the command line.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { convert as nodeConvert } from '../convert.mjs';

const root = new URL('../../../', import.meta.url).pathname;
const dir = join(root, 'lung-cancer');
const files = readdirSync(dir).filter((f) => f.endsWith('.bpmn')).sort().map((f) => join('lung-cancer', f));
const inputs = () => files.map((path) => ({ path, xml: readFileSync(join(root, path), 'utf8') }));

let tmp;
let browserConvert;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'browser-parity-'));
  const outfile = join(tmp, 'convert.browser.mjs');
  await build({
    entryPoints: [join(root, 'tools/bpmn2gmf/convert.mjs')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile,
    logLevel: 'silent'
  });
  ({ convert: browserConvert } = await import(pathToFileURL(outfile).href));
});

after(() => rmSync(tmp, { recursive: true, force: true }));

test('the converter bundles for the browser (no Node-only imports)', () => {
  assert.equal(typeof browserConvert, 'function');
});

test('browser and Node give the same modules and messages', async () => {
  const [a, b] = [await nodeConvert(inputs()), await browserConvert(inputs())];
  assert.ok(a.modules.length >= 5);
  assert.deepEqual(b.modules, a.modules);
  assert.deepEqual(b.diagnostics.items, a.diagnostics.items);
});

test('the command line writes the same JSON as the browser build', async () => {
  const out = join(tmp, 'cli');
  const r = spawnSync(process.execPath, [join(root, 'tools/bpmn2gmf/cli.mjs'), 'lung-cancer', '--out-dir', out], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const { modules } = await browserConvert(inputs());
  for (const m of modules.filter((x) => x.ok)) {
    assert.deepEqual(JSON.parse(readFileSync(join(out, `${m.path}.json`), 'utf8')), m.json, m.path);
  }
});
