#!/usr/bin/env node
//
// Installability check: pack the package, install the tarball into a temporary
// copy of examples/consumer, build it, and run the converter binary from the
// installed package. Not part of `npm run validate` (needs the network and
// takes a while); CI runs it as its own job.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const tmp = mkdtempSync(join(tmpdir(), 'synthea-consumer-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

try {
  const packOut = execFileSync('npm', ['pack', '--pack-destination', tmp, '--silent'], { cwd: root, encoding: 'utf8' });
  const tarball = packOut.trim().split('\n').pop();

  const app = join(tmp, 'app');
  cpSync(join(root, 'examples/consumer'), app, { recursive: true, filter: (s) => !s.includes('node_modules') });

  const pkgPath = join(app, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.dependencies['bpmn-js-synthea-extension'] = `file:../${tarball}`;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  run('npm', ['install', '--no-audit', '--no-fund'], app);
  run('npm', ['run', 'build'], app);

  // The converter must be in the installed package and runnable through its bin.
  const sample = join(root, 'lung-cancer/anemia-submodule.bpmn');
  run('npx', ['bpmn2gmf', sample, '--out-dir', 'modules'], app);
  if (!readdirSync(join(app, 'modules')).some((f) => f.endsWith('.json'))) {
    throw new Error('converter wrote no module');
  }
  console.log('consumer install OK');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
