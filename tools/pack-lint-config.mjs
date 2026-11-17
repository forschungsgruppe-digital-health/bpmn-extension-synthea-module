// Bundles the bpmnlint configuration (.bpmnlintrc + the synthea plugin and its rules) into one
// ES module the browser can load, so the modeler demo can run the same lint rules live.
// Same job as `bpmnlint-pack-config`, with the tools already in this repo.
//
//   node tools/pack-lint-config.mjs            writes demo/src/generated/lint-config.js
//
// The demo runs this before `dev` and `build` (see demo/package.json), so the bundle never drifts
// from the rules. It is generated, not committed (.gitignore).
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const compileConfig = require('bpmnlint/lib/support/compile-config');
const NodeResolver = require('bpmnlint/lib/resolver/node-resolver');

const outfile = resolve(root, 'demo/src/generated/lint-config.js');
const rc = JSON.parse(readFileSync(resolve(root, '.bpmnlintrc'), 'utf8'));

// The resolver must look for plugins from the repo root, whatever directory this is run from.
const resolver = new NodeResolver({ require: createRequire(resolve(root, 'package.json')) });
const source = await compileConfig(rc, resolver);

mkdirSync(dirname(outfile), { recursive: true });
await build({
  stdin: { contents: source, resolveDir: root, sourcefile: 'lint-config-entry.js', loader: 'js' },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile,
  logLevel: 'warning'
});

console.log(`lint config packed: ${outfile.replace(`${root}/`, '')}`);
