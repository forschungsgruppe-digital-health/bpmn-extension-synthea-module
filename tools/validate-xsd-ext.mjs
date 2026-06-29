#!/usr/bin/env node
//
// Validate every example diagram against BPMN core (BPMN20.xsd) AND the
// extension's own XSD, in a single pass.
//
// HOW: the BPMN20.xsd declares <extensionElements> with an <xsd:any
// processContents="lax"> wildcard — a validator checks foreign-namespace
// content only if it already holds a schema for that namespace. So we build a
// tiny "driver" schema that imports BOTH BPMN20.xsd and the freshly generated
// extension XSD; xmllint then validates core + extension together. BPMN20.xsd
// is NOT modified.
//
// SCOPE: structure only. "Required category", cross-element rules, and other
// semantics live in the bpmnlint plugin — this does not replace it. The
// extension XSD is generated on the fly from the moddle descriptor, so it can
// never drift from the source of truth here.
//
// Requires: xmllint (libxml2-utils) and a prior `npm install`.
import { readFileSync, writeFileSync, mkdtempSync, existsSync, globSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { generateXsd, extensionTags } from './moddle-to-xsd.mjs';

const BPMN_NS = 'http://www.omg.org/spec/BPMN/20100524/MODEL';

const bpmnXsd = fileURLToPath(
  new URL('../node_modules/bpmn-moddle/resources/bpmn/xsd/BPMN20.xsd', import.meta.url)
);
if (!existsSync(bpmnXsd)) {
  console.error(`BPMN20.xsd not found at ${bpmnXsd}. Run 'npm install' first.`);
  process.exit(1);
}

try {
  execFileSync('xmllint', ['--version'], { stdio: 'ignore' });
} catch {
  console.error('xmllint not found. Install libxml2-utils (Debian/Ubuntu) or libxml2 (macOS).');
  process.exit(1);
}

const descriptor = JSON.parse(
  readFileSync(new URL('../extension/model/myExtension.json', import.meta.url), 'utf8')
);
const { xsd, warnings } = generateXsd(descriptor);
warnings.forEach((w) => console.error(`warning: ${w}`));

// write the generated extension XSD + a driver schema importing both schemas
const dir = mkdtempSync(join(tmpdir(), 'bpmn-xsd-ext-'));
const extPath = join(dir, 'extension.xsd');
const wrapperPath = join(dir, 'driver.xsd');
writeFileSync(extPath, xsd);
writeFileSync(
  wrapperPath,
  `<?xml version="1.0" encoding="UTF-8"?>
<xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <xsd:import namespace="${BPMN_NS}" schemaLocation="${bpmnXsd}"/>
  <xsd:import namespace="${descriptor.uri}" schemaLocation="${extPath}"/>
</xsd:schema>
`
);

// Canary: prove the extension schema is actually engaged. The lax wildcard
// SKIPS foreign content it has no schema for — so if the import silently fails,
// everything would "pass" without the extension being checked at all. We feed
// a declared element a structurally-illegal (undeclared) attribute and require
// xmllint to reject it *for that reason*.
const probe = extensionTags(descriptor)[0];
if (probe) {
  const attr = 'xsdext_canary_unexpected';
  const canaryPath = join(dir, 'canary.bpmn');
  writeFileSync(
    canaryPath,
    `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="${BPMN_NS}" xmlns:${descriptor.prefix}="${descriptor.uri}" id="Definitions_canary" targetNamespace="http://example.com/bpmn">
  <bpmn:process id="Process_canary" isExecutable="false">
    <bpmn:task id="Task_canary">
      <bpmn:extensionElements>
        <${descriptor.prefix}:${probe} ${attr}="1"/>
      </bpmn:extensionElements>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>
`
  );
  let engaged = false;
  try {
    execFileSync('xmllint', ['--noout', '--schema', wrapperPath, canaryPath], { stdio: 'pipe' });
  } catch (err) {
    engaged = (err.stderr || err.stdout || '').toString().includes(attr);
  }
  if (!engaged) {
    console.error(
      `Self-check FAILED: the ${descriptor.prefix} extension schema is not being applied ` +
        `(the lax wildcard skipped it). A structurally-invalid <${descriptor.prefix}:${probe}> ` +
        `was accepted, so "valid" results here would be meaningless. Check the driver-schema imports.`
    );
    process.exit(1);
  }
  console.log(`self-check OK: structural errors in <${descriptor.prefix}:${probe}> are rejected`);
}

const files = globSync('examples/**/*.bpmn');
if (!files.length) {
  console.error('No example diagrams found under examples/.');
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  try {
    execFileSync('xmllint', ['--noout', '--schema', wrapperPath, file], { stdio: 'pipe' });
    console.log(`OK   ${file} (BPMN core + ${descriptor.prefix} extension)`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${file}`);
    const msg = (err.stderr || err.stdout || Buffer.from(String(err.message))).toString().trim();
    msg.split('\n').forEach((l) => console.error(`     ${l}`));
  }
}

if (!failed) {
  console.log(`All examples are valid against BPMN core + the ${descriptor.prefix} extension XSD.`);
}
process.exit(failed ? 1 : 0);
