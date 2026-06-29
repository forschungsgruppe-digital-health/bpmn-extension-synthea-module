#!/usr/bin/env node
//
// Round-trip every example diagram through bpmn-moddle with the custom
// extension registered: fromXML -> toXML.
//
// This verifies that custom extension data is understood by the moddle model
// and serialises back without warnings or loss. It is the check that actually
// covers your <extensionElements>, which the XSD does not.
//
// Requires Node >= 22 (uses fs.globSync) and a prior `npm install`.
import { readFileSync, globSync } from 'node:fs';
import BpmnModdle from 'bpmn-moddle';

const descriptor = JSON.parse(
  readFileSync(new URL('../extension/model/myExtension.json', import.meta.url))
);

const moddle = new BpmnModdle({ myext: descriptor });

const files = globSync('examples/**/*.bpmn');
let failed = 0;

for (const file of files) {
  const xml = readFileSync(file, 'utf8');
  try {
    const { rootElement, warnings } = await moddle.fromXML(xml);
    if (warnings && warnings.length) {
      console.error(`WARN ${file}`);
      warnings.forEach((w) => console.error(`     - ${w.message}`));
      failed++;
      continue;
    }
    // serialise the parsed model back to prove it round-trips without loss
    await moddle.toXML(rootElement);
    console.log(`OK   ${file}`);
  } catch (err) {
    console.error(`FAIL ${file}: ${err.message}`);
    failed++;
  }
}

if (!files.length) {
  console.error('No example diagrams found under examples/.');
  process.exit(1);
}

process.exit(failed ? 1 : 0);
