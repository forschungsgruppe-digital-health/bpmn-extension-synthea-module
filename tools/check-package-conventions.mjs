#!/usr/bin/env node
//
// Enforce bpmn.io packaging and publishing conventions on package.json.
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const errors = [];

// Naming: bpmn-js-* for modules, bpmnlint-plugin-* for lint plugins
// (scoped names like @org/bpmn-js-foo are allowed).
const NAME_RE = /^(@[^/]+\/)?(bpmn-js-|bpmnlint-plugin-)/;
if (!NAME_RE.test(pkg.name || '')) {
  errors.push(`name "${pkg.name}" should start with "bpmn-js-" or "bpmnlint-plugin-"`);
}

if (!pkg.license) {
  errors.push('missing "license" field');
}

if (pkg.type !== 'module') {
  errors.push('"type" should be "module" (extensions ship ES modules)');
}

// bpmn-js modules must declare bpmn-js as a peer, not a hard dependency.
const isModule = (pkg.name || '').includes('bpmn-js-');
const peers = pkg.peerDependencies || {};
if (isModule && !peers['bpmn-js']) {
  errors.push('a bpmn-js extension must declare "bpmn-js" as a peerDependency');
}
if (pkg.dependencies && pkg.dependencies['bpmn-js']) {
  errors.push('"bpmn-js" must be a peerDependency, not a dependency');
}

if (errors.length) {
  console.error('package.json convention violations:');
  errors.forEach((e) => console.error(' - ' + e));
  process.exit(1);
}

console.log('package.json conventions OK');
