#!/usr/bin/env node
// Usage: node tools/bpmn2gmf/cli.mjs <file.bpmn|dir> [...] [--out-dir <dir>] [--check]
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
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out-dir') outDir = args[++i];
  else if (args[i] === '--check') check = true;
  else inputs.push(args[i]);
}
if (!inputs.length) {
  console.error('usage: bpmn2gmf <file.bpmn|dir> [...] [--out-dir <dir>] [--check]');
  process.exit(2);
}

const files = inputs.flatMap((p) =>
  statSync(p).isDirectory()
    ? readdirSync(p).filter((f) => f.endsWith('.bpmn')).sort().map((f) => join(p, f))
    : [p]
);

const { modules, diagnostics } = await convert(
  files.map((path) => ({ path, xml: readFileSync(path, 'utf8') }))
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
