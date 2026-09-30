#!/usr/bin/env node
//
// Cross-file attribute usage report.
//
// Synthea attributes have no namespacing: the same name in two different
// module files is the SAME attribute at simulation time (see the Basics
// wiki page). That is often intentional (a main pathway sets an attribute
// a submodule reads), so this is informational, not a pass/fail check —
// it lists every attribute name, which file(s) use it, and in what role,
// so a modeler can visually confirm a shared name is deliberate rather
// than an accidental collision between two unrelated attributes.
//
// Requires Node >= 22 (uses fs.globSync) and a prior `npm install`.
import { readFileSync, globSync } from 'node:fs';
import BpmnModdle from 'bpmn-moddle';

const descriptor = JSON.parse(
  readFileSync(new URL('../extension/model/synthea.json', import.meta.url))
);

const moddle = new BpmnModdle({ synthea: descriptor });

const ATTRIBUTE_SOURCES = [
  { type: 'synthea:SetAttributeConfig', property: 'attribute', role: 'write' },
  { type: 'synthea:CounterConfig', property: 'attribute', role: 'write' },
  { type: 'synthea:AssignToAttributeConfig', property: 'attribute', role: 'write' },
  { type: 'synthea:Condition', property: 'attribute', role: 'read' },
  { type: 'synthea:ProbabilityConfig', property: 'probabilityAttribute', role: 'read' },
  { type: 'synthea:ReferencedByAttributeConfig', property: 'attribute', role: 'read' }
];

function walk(node, visit, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) {
    return;
  }
  seen.add(node);

  if (node.$type) {
    visit(node);
  }

  for (const key of Object.keys(node)) {
    if (key.startsWith('$')) {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, visit, seen));
    } else if (value && typeof value === 'object') {
      walk(value, visit, seen);
    }
  }
}

const files = globSync('lung-cancer/**/*.bpmn').sort();

if (!files.length) {
  console.error('No pathway files found under lung-cancer/.');
  process.exit(1);
}

const usage = new Map(); // name -> [{ file, role }]

for (const file of files) {
  const xml = readFileSync(file, 'utf8');
  const { rootElement } = await moddle.fromXML(xml);

  walk(rootElement, (node) => {
    for (const source of ATTRIBUTE_SOURCES) {
      if (node.$type === source.type && node[source.property]) {
        const name = node[source.property];
        if (!usage.has(name)) {
          usage.set(name, []);
        }
        usage.get(name).push({ file, role: source.role });
      }
    }
  });
}

const names = [...usage.keys()].sort();
let crossFileCount = 0;

for (const name of names) {
  const entries = usage.get(name);
  const byFile = new Map();
  for (const { file, role } of entries) {
    if (!byFile.has(file)) {
      byFile.set(file, new Set());
    }
    byFile.get(file).add(role);
  }

  const usedInFiles = [...byFile.keys()];
  const isCrossFile = usedInFiles.length > 1;
  if (isCrossFile) {
    crossFileCount++;
  }

  console.log(`${isCrossFile ? '⚠' : ' '} ${name}`);
  for (const file of usedInFiles) {
    console.log(`    ${[...byFile.get(file)].sort().join('+').padEnd(10)} ${file}`);
  }
}

console.log();
console.log(
  `${names.length} attribute name(s), ${crossFileCount} used across more than one file. ` +
  `Synthea has no namespacing between modules — review each ⚠ above to confirm it's an ` +
  `intentional cross-module handoff, not an accidental collision between two unrelated attributes.`
);

process.exit(0);
