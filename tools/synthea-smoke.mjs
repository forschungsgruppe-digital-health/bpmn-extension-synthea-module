#!/usr/bin/env node
// Runs the converted pathways in a real Synthea and checks that the engine loads and
// processes them. Not part of `npm run validate` (needs Java and the Synthea jar).
//
//   node tools/synthea-smoke.mjs <synthea-with-dependencies.jar> [--dir lung-cancer]
//        [--population 400] [--seed 7] [--age 45-65] [--keep <output dir>]
//
// Jar: https://github.com/synthetichealth/synthea/releases (tested with v4.0.0).
// Fails (exit 1) if Synthea throws, cannot load a module or resolve a submodule.
// Prints how many patients got the diagnoses the modules can set.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { convert } from './bpmn2gmf/convert.mjs';
import { writeModules } from './bpmn2gmf/write.mjs';

const args = process.argv.slice(2);
const jar = args.find((a) => !a.startsWith('--') && a.endsWith('.jar'));
const opt = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
if (!jar || !existsSync(jar)) {
  console.error('usage: node tools/synthea-smoke.mjs <synthea-with-dependencies.jar> [--dir lung-cancer] [--population 400] [--seed 7] [--age 45-65] [--keep <dir>]');
  process.exit(2);
}
const dir = opt('dir', 'lung-cancer');
const work = opt('keep', null) ?? mkdtempSync(join(tmpdir(), 'bpmn2gmf-synthea-'));
mkdirSync(work, { recursive: true });

// 1. convert (strict: an incomplete module would only fail later and less clearly)
const files = readdirSync(dir).filter((f) => f.endsWith('.bpmn')).sort().map((f) => join(dir, f));
const { modules, diagnostics } = await convert(files.map((path) => ({ path, xml: readFileSync(path, 'utf8') })), { strict: true });
if (diagnostics.errorCount) {
  console.error(diagnostics.format().filter((l) => l.startsWith('ERROR')).join('\n'));
  process.exit(1);
}
const modulesDir = join(work, 'modules');
rmSync(modulesDir, { recursive: true, force: true });
writeModules(modules, modulesDir);
const roots = modules.filter((m) => !m.path.includes('/')).map((m) => m.path);
console.log(`converted ${modules.length} modules; main module(s): ${roots.join(', ')}`);

// 2. run Synthea with only those modules enabled
const out = join(work, 'out');
rmSync(out, { recursive: true, force: true });
const run = spawnSync('java', [
  '-jar', jar, '-s', opt('seed', '7'), '-p', opt('population', '400'), '-a', opt('age', '45-65'),
  '-d', modulesDir, '-m', roots.join(delimiter),
  `--exporter.baseDirectory=${out}`, '--exporter.fhir.export=true',
  '--exporter.hospital.fhir.export=false', '--exporter.practitioner.fhir.export=false', 'Massachusetts'
], { encoding: 'utf8', maxBuffer: 1 << 28 });
const log = `${run.stdout}\n${run.stderr}`;

const problems = log.split('\n').filter((l) => /Exception|StackOverflowError|Unknown submodule|Error:/.test(l));
const records = /Records: total=(\d+), alive=(\d+), dead=(\d+)/.exec(log);
console.log(records ? `Synthea: ${records[1]} records (alive ${records[2]}, dead ${records[3]})` : 'Synthea produced no records');
if (run.status !== 0 || problems.length || !records) {
  console.error(`FAILED (exit ${run.status}); first problems:\n${[...new Set(problems)].slice(0, 5).join('\n')}`);
  process.exit(1);
}

// 3. what the modules did to the patients: patients that got a condition the modules can set
const onsetCodes = new Set(
  modules.flatMap((m) => Object.values(m.json.states)).filter((s) => s.type === 'ConditionOnset').flatMap((s) => s.codes.map((c) => c.code))
);
const fhir = join(out, 'fhir');
let withCondition = 0;
const counts = {};
for (const f of readdirSync(fhir)) {
  const bundle = JSON.parse(readFileSync(join(fhir, f), 'utf8'));
  const resources = (bundle.entry ?? []).map((e) => e.resource);
  const codes = new Set(resources.filter((r) => r.resourceType === 'Condition').flatMap((r) => r.code.coding.map((c) => c.code)));
  if ([...codes].some((c) => onsetCodes.has(c))) withCondition++;
  for (const r of resources) counts[r.resourceType] = (counts[r.resourceType] ?? 0) + 1;
}
console.log(`patients with a condition set by these modules: ${withCondition}`);
if (!withCondition) {
  console.warn('WARNING: no patient reached a diagnosis, so the modules were loaded but barely exercised (lung cancer is rare, about 1 in 400 here); raise --population or change --seed.');
}
console.log(`resources: ${['Encounter', 'Condition', 'Observation', 'DiagnosticReport', 'Procedure', 'MedicationRequest'].map((t) => `${t} ${counts[t] ?? 0}`).join(', ')}`);
console.log(`output kept in ${work}`);
