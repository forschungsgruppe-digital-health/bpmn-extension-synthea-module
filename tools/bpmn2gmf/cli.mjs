#!/usr/bin/env node
// Usage: node tools/bpmn2gmf/cli.mjs <file.bpmn|dir> [...] [--out-dir <dir>] [--check] [--strict] [--fuse-gateways]
//   --fuse-gateways  merge the Simple states that only exist for gateways (closer to hand-written modules)
//   --strict  required fields the extension cannot express yet are errors (module is not written)
//
// Converts every given .bpmn file (directories are scanned non-recursively) to
// a Synthea GMF module. Modules with errors are not written. Exit code 1 if
// any error was found.
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { convert } from './convert.mjs';

const args = process.argv.slice(2);
const inputs = [];
let outDir = 'out/modules';
let check = false;
let strict = false;
let fuse = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out-dir') outDir = args[++i];
  else if (args[i] === '--check') check = true;
  else if (args[i] === '--strict') strict = true;
  else if (args[i] === '--fuse-gateways') fuse = true;
  else inputs.push(args[i]);
}
if (!inputs.length) {
  console.error('usage: bpmn2gmf <file.bpmn|dir> [...] [--out-dir <dir>] [--check] [--strict] [--fuse-gateways]');
  process.exit(2);
}

const files = inputs.flatMap((p) =>
  statSync(p).isDirectory()
    ? readdirSync(p).filter((f) => f.endsWith('.bpmn')).sort().map((f) => join(p, f))
    : [p]
);

const { modules, diagnostics } = await convert(
  files.map((path) => ({ path, xml: readFileSync(path, 'utf8') })),
  { strict, fuse }
);

if (!check) mkdirSync(outDir, { recursive: true });
for (const m of modules) {
  if (!m.ok) {
    console.log(`SKIP  ${m.fileBase} (errors)`);
    continue;
  }
  if (!check) writeFileSync(join(outDir, `${m.fileBase}.json`), `${JSON.stringify(m.json, null, 2)}\n`);
  console.log(`${check ? 'OK   ' : 'WROTE'} ${m.fileBase}`);
}
for (const line of diagnostics.format()) console.log(line);
process.exit(diagnostics.errorCount ? 1 : 0);
